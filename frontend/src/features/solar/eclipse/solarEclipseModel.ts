import {
  CONTROLLED_SATELLITE_EPHEMERIS_MANIFEST_URL,
  calculateSolarEclipseGeometry,
  getSolarObjectState,
  type SolarEclipseGeometry,
  type SolarTimeInput,
} from "../../../domain/solar";
import { MOONS } from "../moonData";
import type { MoonDef } from "../moonData";
import { PLANETS, type PlanetDef } from "../solarData";

const MAJOR_MOONS_BY_PLANET = new Map<PlanetDef["id"], typeof MOONS>();
MOONS.forEach((moon) => {
  if (moon.class !== "major") return;
  const current = MAJOR_MOONS_BY_PLANET.get(moon.parentPlanet) ?? [];
  current.push(moon);
  MAJOR_MOONS_BY_PLANET.set(moon.parentPlanet, current);
});

export interface PlanetEclipseOccluder extends SolarEclipseGeometry {
  occluderId: string;
  occluderName: string;
  occluderKind: "moon";
  moonId: string;
  moonName: string;
  orbitModel: string;
}

export interface MoonEclipseOccluder extends SolarEclipseGeometry {
  occluderId: string;
  occluderName: string;
  occluderKind: "parent-planet" | "mutual-moon";
  orbitModel: string;
}

export type SolarSurfaceEclipseOccluder = PlanetEclipseOccluder | MoonEclipseOccluder;

export const SOLAR_ECLIPSE_MODEL = {
  id: "finite-solar-disc-major-moon-v2",
  label: "Finite solar-disc analytic occultation",
  sourceUrl: "https://science.nasa.gov/eclipses/geometry/",
  nominalRadiusSourceUrl: "https://www.iau.org/static/resolutions/IAU2015_English.pdf",
  satelliteEphemerisManifestUrl: CONTROLLED_SATELLITE_EPHEMERIS_MANIFEST_URL,
  accuracyNote:
    "Umbra, antumbra and penumbra intensity use spherical apparent-disc overlap. Earth's Moon and the four Galilean moons use controlled analytical states; other moons retain circular seeds. This remains visualisation-grade geometry, not an operational timing or ground-track product.",
} as const;

export const SOLAR_MOON_ECLIPSE_MODEL = {
  id: "finite-solar-disc-moon-occultation-v2",
  label: "Finite solar-disc moon illumination",
  sourceUrl: SOLAR_ECLIPSE_MODEL.sourceUrl,
  nominalRadiusSourceUrl: SOLAR_ECLIPSE_MODEL.nominalRadiusSourceUrl,
  satelliteEphemerisManifestUrl: CONTROLLED_SATELLITE_EPHEMERIS_MANIFEST_URL,
  accuracyNote:
    "Parent-planet and mutual major-moon shadows use spherical apparent-disc overlap. Earth-Moon and Galilean positions use controlled analytical states and have a separate date-evaluated body-frame contract; other moons retain circular seeds and fixed surfaces. Limb topography, light time and non-spherical shape are not modeled, so this is not an operational prediction product.",
} as const;

export const getPlanetEclipseOccluders = (
  planet: PlanetDef,
  time: SolarTimeInput,
): PlanetEclipseOccluder[] => {
  const planetState = getSolarObjectState(planet.id, time);
  if (!planetState) return [];
  const targetToSunAu = {
    x: -planetState.positionAu.x,
    y: -planetState.positionAu.y,
    z: -planetState.positionAu.z,
  };

  return (MAJOR_MOONS_BY_PLANET.get(planet.id) ?? []).flatMap((moon) => {
    const moonState = getSolarObjectState(moon.id, time);
    if (!moonState?.relativePositionAu) return [];
    const geometry = calculateSolarEclipseGeometry({
      targetRadiusKm: planet.radiusKm,
      targetToSunAu,
      occluderRadiusKm: moon.radiusKm,
      targetToOccluderAu: moonState.relativePositionAu,
    });
    if (!geometry?.intersectsPenumbra) return [];
    return [
      {
        ...geometry,
        occluderId: moon.id,
        occluderName: moon.name,
        occluderKind: "moon" as const,
        moonId: moon.id,
        moonName: moon.name,
        orbitModel: moonState.model,
      },
    ];
  });
};

const PLANET_BY_ID = new Map(PLANETS.map((planet) => [planet.id, planet]));

const subtractPosition = (
  left: { x: number; y: number; z: number },
  right: { x: number; y: number; z: number },
) => ({
  x: left.x - right.x,
  y: left.y - right.y,
  z: left.z - right.z,
});

export const getMoonEclipseOccluders = (
  moon: MoonDef,
  time: SolarTimeInput,
): MoonEclipseOccluder[] => {
  const targetState = getSolarObjectState(moon.id, time);
  const parent = PLANET_BY_ID.get(moon.parentPlanet);
  const parentState = parent ? getSolarObjectState(parent.id, time) : null;
  if (!targetState || !parent || !parentState) return [];

  const targetToSunAu = {
    x: -targetState.positionAu.x,
    y: -targetState.positionAu.y,
    z: -targetState.positionAu.z,
  };
  const candidates: MoonEclipseOccluder[] = [];
  const appendCandidate = ({
    occluderId,
    occluderName,
    occluderKind,
    occluderRadiusKm,
    targetToOccluderAu,
    orbitModel,
  }: {
    occluderId: string;
    occluderName: string;
    occluderKind: MoonEclipseOccluder["occluderKind"];
    occluderRadiusKm: number;
    targetToOccluderAu: { x: number; y: number; z: number };
    orbitModel: MoonEclipseOccluder["orbitModel"];
  }) => {
    const geometry = calculateSolarEclipseGeometry({
      targetRadiusKm: moon.radiusKm,
      targetToSunAu,
      occluderRadiusKm,
      targetToOccluderAu,
    });
    if (!geometry?.intersectsPenumbra) return;
    candidates.push({
      ...geometry,
      occluderId,
      occluderName,
      occluderKind,
      orbitModel,
    });
  };

  appendCandidate({
    occluderId: parent.id,
    occluderName: parent.name,
    occluderKind: "parent-planet",
    occluderRadiusKm: parent.radiusKm,
    targetToOccluderAu: subtractPosition(parentState.positionAu, targetState.positionAu),
    orbitModel: targetState.model,
  });

  const siblingMoons = MAJOR_MOONS_BY_PLANET.get(moon.parentPlanet) ?? [];
  for (const sibling of siblingMoons) {
    if (sibling.id === moon.id) continue;
    const siblingState = getSolarObjectState(sibling.id, time);
    if (!siblingState) continue;
    appendCandidate({
      occluderId: sibling.id,
      occluderName: sibling.name,
      occluderKind: "mutual-moon",
      occluderRadiusKm: sibling.radiusKm,
      targetToOccluderAu: subtractPosition(siblingState.positionAu, targetState.positionAu),
      orbitModel: `${targetState.model} + ${siblingState.model}`,
    });
  }

  return candidates;
};
