import { MOONS } from "../../features/solar/moonData";
import { ORBITAL_ELEMENTS } from "../../features/solar/orbitalElements";
import { PLANETS, type PlanetId } from "../../features/solar/solarData";
import {
  SMALL_BODIES,
  isSmallBodyId,
  type SmallBodyDef,
  type SmallBodyId,
} from "../../features/solar/smallBodies/smallBodyData";
import {
  SOLAR_AU_KM,
  normalizeRadians,
  resolveSolarDaysSinceEpoch,
  sampleKeplerianOrbit,
  solveKeplerianElementsAtSolarTime,
} from "./solarEphemeris";
import { AstroTime, Body, HelioVector, MakeTime, RotateVector, Rotation_EQJ_ECL } from "astronomy-engine";
import {
  getJulianDateForSolarTime,
  getStreamedVsop87cOrbit,
  getStreamedVsop87cPosition,
} from "./ephemeris/streamedVsop87c";
import {
  getControlledSatelliteState,
  sampleControlledSatelliteOrbit,
} from "./ephemeris/controlledSatelliteEphemeris";
import { sampleSmallBodyOrbit, solveSmallBodyPosition } from "./smallBodyEphemeris";
import type {
  MoonDef,
  SolarMoonOrbitSceneProjectionOptions,
  PlanetDef,
  SolarPlanetOrbitSceneProjectionOptions,
  SolarMoonSceneProjectionOptions,
  SolarObjectId,
  SolarObjectState,
  SolarSceneProjectionOptions,
  SolarSceneVector3,
  SolarTimeInput,
  SolarVector3Au,
} from "./solarTypes";


// Pluto is not part of VSOP87: Astronomy Engine's Pluto model (an integration fitted to JPL's ephemeris)
// gives its heliocentric position, rotated from J2000 equatorial to J2000 ecliptic. The explorer's clock is
// used as dynamical time, like the VSOP87 planets and the Horizons spacecraft, so New Horizons meets Pluto.
const PLUTO_EQJ_TO_ECL = Rotation_EQJ_ECL();

/**
 * JPL Horizons tables for Pluto (loaded with the spacecraft trajectories): heliocentric ecliptic J2000 km,
 * in priority order (Pluto's own centre around the New Horizons encounter, then the system barycentre).
 */
let plutoTables: Array<(timeMs: number) => [number, number, number] | null> = [];
export const setPlutoTables = (tables: Array<(timeMs: number) => [number, number, number] | null>) => {
  plutoTables = tables;
};

const getPlutoPosition = (time: SolarTimeInput): { positionAu: SolarVector3Au; julianDate: number } | null => {
  const julianDate = getJulianDateForSolarTime(time);
  const timeMs = (julianDate - 2_440_587.5) * 86_400_000;
  for (const table of plutoTables) {
    const km = table(timeMs);
    if (km) return { positionAu: { x: km[0] / SOLAR_AU_KM, y: km[1] / SOLAR_AU_KM, z: km[2] / SOLAR_AU_KM, unit: "au", frame: "heliocentric-ecliptic" }, julianDate };
  }
  const tt = julianDate - 2_451_545.0;
  if (!Number.isFinite(tt)) return null;
  const astroTime = MakeTime(tt);
  const vector = RotateVector(PLUTO_EQJ_TO_ECL, HelioVector(Body.Pluto, new AstroTime(astroTime.ut - (astroTime.tt - astroTime.ut))));
  return { positionAu: { x: vector.x, y: vector.y, z: vector.z, unit: "au", frame: "heliocentric-ecliptic" }, julianDate };
};

const PLANET_BY_ID = new Map<PlanetId, PlanetDef>(PLANETS.map((planet) => [planet.id, planet]));
const MOON_BY_ID = new Map<string, MoonDef>(MOONS.map((moon) => [moon.id, moon]));
const PLANET_IDS = new Set<PlanetId>(PLANETS.map((planet) => planet.id));
const SMALL_BODY_BY_ID = new Map<SmallBodyId, SmallBodyDef>(SMALL_BODIES.map((body) => [body.id, body]));

const PLANET_ACCURACY_NOTE =
  "Streamed VSOP87C heliocentric rectangular ecliptic coordinates, linearly interpolated between daily Float64 keyframes; Pluto falls back to the low-precision Keplerian model.";
const KEPLERIAN_ACCURACY_NOTE =
  "Low-precision Keplerian boot model using static orbital elements; used while the requested VSOP87C time block is unavailable.";
const MOON_ACCURACY_NOTE =
  "Approximate parent-relative circular moon orbit using seed period, distance, inclination, and direction.";

const zeroAu = (): SolarVector3Au => ({
  x: 0,
  y: 0,
  z: 0,
  unit: "au",
  frame: "heliocentric-ecliptic",
});

const vectorMagnitude = (vector: Pick<SolarVector3Au, "x" | "y" | "z">) =>
  Math.hypot(vector.x, vector.y, vector.z);

const addAu = (a: SolarVector3Au, b: SolarVector3Au): SolarVector3Au => ({
  x: a.x + b.x,
  y: a.y + b.y,
  z: a.z + b.z,
  unit: "au",
  frame: "heliocentric-ecliptic",
});

const toSceneVector = (position: Pick<SolarVector3Au, "x" | "y" | "z">, scale = 1): SolarSceneVector3 => ({
  x: position.x * scale,
  y: position.z * scale,
  z: position.y * scale,
  unit: "scene-unit",
  sourceFrame: "heliocentric-ecliptic",
});

export const normalizeSolarObjectId = (objectId: SolarObjectId) => {
  if (objectId === "solar:sun") return "sun";
  if (typeof objectId === "string" && objectId.startsWith("solar:planet:")) {
    return objectId.replace("solar:planet:", "");
  }
  if (typeof objectId === "string" && objectId.startsWith("solar:moon:")) {
    return objectId.replace("solar:moon:", "");
  }
  if (typeof objectId === "string" && objectId.startsWith("solar:small-body:")) {
    return objectId.replace("solar:small-body:", "");
  }
  return objectId;
};

export const isPlanetId = (objectId: SolarObjectId): objectId is PlanetId =>
  typeof objectId === "string" && PLANET_IDS.has(objectId as PlanetId);

export const getSolarPlanet = (planetId: PlanetId) => PLANET_BY_ID.get(planetId) ?? null;
export const getSolarMoon = (moonId: string) => MOON_BY_ID.get(moonId) ?? null;
export const getSolarSmallBody = (bodyId: SmallBodyId) => SMALL_BODY_BY_ID.get(bodyId) ?? null;

const getMoonRelativePositionAtAngleAu = (moon: MoonDef, angle: number): SolarVector3Au => {
  const orbitDirection = moon.orbitDirection ?? 1;
  const radiusAu = moon.orbitalDistanceKm / SOLAR_AU_KM;
  const inclination = ((moon.inclinationDeg ?? 0) * Math.PI) / 180;
  const node = ((moon.initialOffsetRad ?? 0) * 0.73 + moon.orbitalPeriodDays * 0.017) % (Math.PI * 2);
  const directedAngle = angle * orbitDirection + (moon.initialOffsetRad ?? 0);
  const planeX = Math.cos(directedAngle) * radiusAu;
  const planeY = Math.sin(directedAngle) * Math.cos(inclination) * radiusAu;
  const planeZ = Math.sin(directedAngle) * Math.sin(inclination) * radiusAu;
  return {
    x: planeX * Math.cos(node) - planeY * Math.sin(node),
    y: planeX * Math.sin(node) + planeY * Math.cos(node),
    z: planeZ,
    unit: "au",
    frame: "heliocentric-ecliptic",
  };
};

const getMoonRelativePositionAu = (moon: MoonDef, time: SolarTimeInput): SolarVector3Au => {
  const daysSinceEpoch = resolveSolarDaysSinceEpoch(time);
  return getMoonRelativePositionAtAngleAu(moon, (daysSinceEpoch / moon.orbitalPeriodDays) * Math.PI * 2);
};

export const getSolarObjectState = (
  objectId: SolarObjectId,
  time: SolarTimeInput,
): SolarObjectState | null => {
  const normalizedId = normalizeSolarObjectId(objectId);
  const daysSinceEpoch = resolveSolarDaysSinceEpoch(time);

  if (normalizedId === "sun") {
    return {
      id: "sun",
      sourceId: "sun",
      kind: "sun",
      name: "Sun",
      positionAu: zeroAu(),
      daysSinceEpoch,
      model: "solar-reference",
      accuracyNote: "Solar Explorer uses the Sun as the heliocentric reference origin.",
    };
  }

  if (isPlanetId(normalizedId)) {
    const planet = PLANET_BY_ID.get(normalizedId);
    const elements = ORBITAL_ELEMENTS[normalizedId];
    if (!planet || !elements) return null;
    const streamed = normalizedId === "pluto" ? getPlutoPosition(time) : getStreamedVsop87cPosition(normalizedId, time);
    if (streamed) {
      const radiusAu = vectorMagnitude(streamed.positionAu);
      return {
        id: normalizedId,
        sourceId: normalizedId,
        kind: "planet",
        name: planet.name,
        positionAu: streamed.positionAu,
        orbital: {
          radiusAu,
          eclipticLongitudeRad: normalizeRadians(Math.atan2(streamed.positionAu.y, streamed.positionAu.x)),
          eclipticLatitudeRad: Math.atan2(
            streamed.positionAu.z,
            Math.hypot(streamed.positionAu.x, streamed.positionAu.y),
          ),
          julianDate: streamed.julianDate,
          model: "vsop87",
        },
        daysSinceEpoch,
        model: "vsop87",
        accuracyNote: PLANET_ACCURACY_NOTE,
      };
    }
    const keplerian = solveKeplerianElementsAtSolarTime(elements, time);
    return {
      id: normalizedId,
      sourceId: normalizedId,
      kind: "planet",
      name: planet.name,
      positionAu: keplerian.positionAu,
      orbital: keplerian.solution,
      daysSinceEpoch: keplerian.daysSinceEpoch,
      model: "keplerian-elements",
      accuracyNote: KEPLERIAN_ACCURACY_NOTE,
    };
  }

  if (typeof normalizedId === "string" && isSmallBodyId(normalizedId)) {
    const body = SMALL_BODY_BY_ID.get(normalizedId);
    return body ? solveSmallBodyPosition(body, time).state : null;
  }

  if (typeof normalizedId === "string") {
    const moon = MOON_BY_ID.get(normalizedId);
    if (!moon) return null;
    const parentState = getSolarObjectState(moon.parentPlanet, time);
    if (!parentState) return null;
    const controlledState = getControlledSatelliteState(moon.id, time);
    const relativePositionAu = controlledState?.relativePositionAu ?? getMoonRelativePositionAu(moon, time);
    return {
      id: moon.id,
      sourceId: moon.id,
      kind: "moon",
      name: moon.name,
      parentId: moon.parentPlanet,
      positionAu: addAu(parentState.positionAu, relativePositionAu),
      relativePositionAu,
      relativeVelocityAuPerDay: controlledState?.relativeVelocityAuPerDay,
      daysSinceEpoch,
      model: controlledState?.model ?? "parent-relative-circular",
      accuracyNote: controlledState?.descriptor.accuracyNote ?? MOON_ACCURACY_NOTE,
    };
  }

  return null;
};

export const projectSolarPositionToScene = (
  position: SolarVector3Au,
  options: SolarSceneProjectionOptions,
): SolarSceneVector3 => {
  const distanceAu = vectorMagnitude(position);
  if (distanceAu === 0) return { ...toSceneVector(position), unit: "scene-unit" };
  const scaledDistance = Math.max(
    options.scaleDistanceAu(distanceAu),
    options.minSceneDistance ?? 0,
  );
  return toSceneVector(position, scaledDistance / distanceAu);
};

export const projectSolarStateToScenePosition = (
  state: SolarObjectState,
  options: SolarSceneProjectionOptions,
) => projectSolarPositionToScene(state.positionAu, options);

export const projectSolarMoonStateToScenePosition = (
  state: SolarObjectState,
  options: SolarMoonSceneProjectionOptions,
): SolarSceneVector3 => {
  const relativePosition = state.relativePositionAu;
  const parentPosition = Array.isArray(options.parentScenePosition)
    ? {
        x: options.parentScenePosition[0],
        y: options.parentScenePosition[1],
        z: options.parentScenePosition[2],
      }
    : options.parentScenePosition;

  if (!relativePosition) {
    return {
      x: parentPosition.x,
      y: parentPosition.y,
      z: parentPosition.z,
      unit: "scene-unit",
      sourceFrame: "heliocentric-ecliptic",
    };
  }

  const distanceAu = vectorMagnitude(relativePosition);
  const distanceKm = distanceAu * SOLAR_AU_KM;
  const sceneDistance = Math.max(
    options.scaleMoonDistanceKm(distanceKm),
    options.parentRadiusSceneUnits * (options.minParentRadiusMultiplier ?? 2.2),
  );
  const relativeScene = distanceAu === 0 ? toSceneVector(relativePosition) : toSceneVector(relativePosition, sceneDistance / distanceAu);
  return {
    x: parentPosition.x + relativeScene.x,
    y: parentPosition.y + relativeScene.y,
    z: parentPosition.z + relativeScene.z,
    unit: "scene-unit",
    sourceFrame: "heliocentric-ecliptic",
  };
};

export const getSolarPlanetOrbitScenePoints = (
  planetId: PlanetId,
  options: SolarPlanetOrbitSceneProjectionOptions,
) => {
  const vsopSamples =
    planetId === "pluto" ? [] : getStreamedVsop87cOrbit(planetId, options.samples ?? 224);
  if (vsopSamples.length) {
    return vsopSamples.map((position) => projectSolarPositionToScene(position, options));
  }
  const elements = ORBITAL_ELEMENTS[planetId];
  if (!elements) return [];
  return sampleKeplerianOrbit(elements, options.samples ?? 224).map((position) =>
    projectSolarPositionToScene(position, options),
  );
};

export const getSolarMoonOrbitScenePoints = (
  moonId: string,
  options: SolarMoonOrbitSceneProjectionOptions,
) => {
  const moon = MOON_BY_ID.get(normalizeSolarObjectId(moonId));
  if (!moon) return [];
  const samples = options.samples ?? 96;
  const controlledOrbit = sampleControlledSatelliteOrbit(
    moon.id,
    options.time ?? 0,
    moon.orbitalPeriodDays,
    samples,
  );
  if (controlledOrbit.length === samples) {
    return controlledOrbit.map((relativePositionAu) =>
      projectSolarMoonStateToScenePosition(
        {
          id: moon.id,
          sourceId: moon.id,
          kind: "moon",
          name: moon.name,
          parentId: moon.parentPlanet,
          positionAu: relativePositionAu,
          relativePositionAu,
          daysSinceEpoch: resolveSolarDaysSinceEpoch(options.time ?? 0),
          model: getControlledSatelliteState(moon.id, options.time ?? 0)?.model ?? "parent-relative-circular",
          accuracyNote: getControlledSatelliteState(moon.id, options.time ?? 0)?.descriptor.accuracyNote ?? MOON_ACCURACY_NOTE,
        },
        options,
      ),
    );
  }
  return Array.from({ length: samples }, (_, index) => {
    const relativePositionAu = getMoonRelativePositionAtAngleAu(moon, (index / samples) * Math.PI * 2);
    return projectSolarMoonStateToScenePosition(
      {
        id: moon.id,
        sourceId: moon.id,
        kind: "moon",
        name: moon.name,
        parentId: moon.parentPlanet,
        positionAu: relativePositionAu,
        relativePositionAu,
        daysSinceEpoch: 0,
        model: "parent-relative-circular",
        accuracyNote: MOON_ACCURACY_NOTE,
      },
      options,
    );
  });
};

export const getSolarSmallBodyOrbitScenePoints = (
  bodyId: SmallBodyId,
  options: SolarPlanetOrbitSceneProjectionOptions,
) => {
  const body = SMALL_BODY_BY_ID.get(bodyId);
  if (!body) return [];
  return sampleSmallBodyOrbit(body, options.samples ?? 256).map((position) =>
    projectSolarPositionToScene(position, options),
  );
};

export const toSceneTuple = (position: SolarSceneVector3): [number, number, number] => [
  position.x,
  position.y,
  position.z,
];
