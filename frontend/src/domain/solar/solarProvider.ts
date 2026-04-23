import { MOONS } from "../../features/solar/moonData";
import { ORBITAL_ELEMENTS } from "../../features/solar/orbitalElements";
import { PLANETS, type PlanetId } from "../../features/solar/solarData";
import {
  SOLAR_AU_KM,
  resolveSolarDaysSinceEpoch,
  sampleKeplerianOrbit,
  solveKeplerianElementsAtSolarTime,
} from "./solarEphemeris";
import type {
  MoonDef,
  SolarMoonOrbitSceneProjectionOptions,
  PlanetDef,
  SolarMoonSceneProjectionOptions,
  SolarObjectId,
  SolarObjectState,
  SolarSceneProjectionOptions,
  SolarSceneVector3,
  SolarTimeInput,
  SolarVector3Au,
} from "./solarTypes";

const PLANET_BY_ID = new Map<PlanetId, PlanetDef>(PLANETS.map((planet) => [planet.id, planet]));
const MOON_BY_ID = new Map<string, MoonDef>(MOONS.map((moon) => [moon.id, moon]));
const PLANET_IDS = new Set<PlanetId>(PLANETS.map((planet) => planet.id));

const PLANET_ACCURACY_NOTE =
  "Low-precision Keplerian model using static orbital elements; not perturbation-corrected or ephemeris-grade.";
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
  return objectId;
};

export const isPlanetId = (objectId: SolarObjectId): objectId is PlanetId =>
  typeof objectId === "string" && PLANET_IDS.has(objectId as PlanetId);

export const getSolarPlanet = (planetId: PlanetId) => PLANET_BY_ID.get(planetId) ?? null;
export const getSolarMoon = (moonId: string) => MOON_BY_ID.get(moonId) ?? null;

const getMoonRelativePositionAtAngleAu = (moon: MoonDef, angle: number): SolarVector3Au => {
  const orbitDirection = moon.orbitDirection ?? 1;
  const radiusAu = moon.orbitalDistanceKm / SOLAR_AU_KM;
  const inclination = ((moon.inclinationDeg ?? 0) * Math.PI) / 180;
  const directedAngle = angle * orbitDirection + (moon.initialOffsetRad ?? 0);
  return {
    x: Math.cos(directedAngle) * radiusAu,
    y: Math.sin(directedAngle) * Math.cos(inclination) * radiusAu,
    z: Math.sin(directedAngle) * Math.sin(inclination) * radiusAu,
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
    const solved = solveKeplerianElementsAtSolarTime(elements, time);
    return {
      id: normalizedId,
      sourceId: normalizedId,
      kind: "planet",
      name: planet.name,
      positionAu: solved.positionAu,
      orbital: solved.solution,
      daysSinceEpoch: solved.daysSinceEpoch,
      model: "keplerian-elements",
      accuracyNote: PLANET_ACCURACY_NOTE,
    };
  }

  if (typeof normalizedId === "string") {
    const moon = MOON_BY_ID.get(normalizedId);
    if (!moon) return null;
    const parentState = getSolarObjectState(moon.parentPlanet, time);
    if (!parentState) return null;
    const relativePositionAu = getMoonRelativePositionAu(moon, time);
    return {
      id: moon.id,
      sourceId: moon.id,
      kind: "moon",
      name: moon.name,
      parentId: moon.parentPlanet,
      positionAu: addAu(parentState.positionAu, relativePositionAu),
      relativePositionAu,
      daysSinceEpoch,
      model: "parent-relative-circular",
      accuracyNote: MOON_ACCURACY_NOTE,
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
  options: SolarSceneProjectionOptions & { samples?: number },
) => {
  const elements = ORBITAL_ELEMENTS[planetId];
  if (!elements) return [];
  return sampleKeplerianOrbit(elements, options.samples ?? 192).map((position) =>
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

export const toSceneTuple = (position: SolarSceneVector3): [number, number, number] => [
  position.x,
  position.y,
  position.z,
];
