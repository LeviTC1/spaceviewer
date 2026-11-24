import { KILOMETERS_PER_AU } from "../../domain/astro/units";
import type { PlanetId, SolarScaleMode } from "./solarData";

export const MIN_PLANET_RADIUS = 0.8;
export const SIZE_MULTIPLIER = 0.07;
export const MIN_MOON_RADIUS = MIN_PLANET_RADIUS * 0.25;
export const MOON_SIZE_MULTIPLIER = 0.45;
export const MOON_ORBIT_MULTIPLIER_SHOWCASE = 30;
export const MOON_ORBIT_MULTIPLIER_EDUCATIONAL = 2.4;
export const MOON_ORBIT_MULTIPLIER_REALISTIC = 1;
export const TRUE_AU_SCENE_UNITS = 30;
export const MOON_PARENT_DISTANCE_BOOST: Record<PlanetId, number> = {
  mercury: 1,
  venus: 1,
  earth: 1,
  mars: 1,
  jupiter: 1,
  saturn: 1,
  uranus: 1,
  neptune: 1,
  pluto: 1,
};
export const AU_IN_KM = KILOMETERS_PER_AU;

export interface SolarScaleModeDefinition {
  id: SolarScaleMode;
  label: string;
  shortLabel: string;
  mapping: "logarithmic" | "square-root" | "linear-au";
  summary: string;
  disclosure: string;
}

export const SOLAR_SCALE_MODE_DEFINITIONS: Record<SolarScaleMode, SolarScaleModeDefinition> = {
  showcase: {
    id: "showcase",
    label: "Cinematic spacing",
    shortLabel: "Cinematic",
    mapping: "logarithmic",
    summary: "Log-compressed heliocentric distance keeps the full atlas readable in one dramatic view.",
    disclosure: "Orbital distance and body size are both presentation-scaled; scene spacing is not a physical ruler.",
  },
  educational: {
    id: "educational",
    label: "Educational spacing",
    shortLabel: "Educational",
    mapping: "square-root",
    summary: "Square-root spacing opens the outer system while preserving a readable overview.",
    disclosure: "Orbital distance remains compressed and body radii are exaggerated for visibility.",
  },
  realistic: {
    id: "realistic",
    label: "True AU spacing",
    shortLabel: "True AU",
    mapping: "linear-au",
    summary: "Heliocentric positions use a linear AU ruler: twice the physical distance maps to twice the scene distance.",
    disclosure: "Planet, moon and Sun radii—and close moon spacing—remain exaggerated so bodies stay selectable.",
  },
};

export interface SolarScaleSceneProfile {
  maxCameraDistance: number;
  overviewCamera: [number, number, number];
  eclipticCamera: [number, number, number];
  fogNear: number;
  fogFar: number;
  pointLightIntensity: number;
  pointLightDistance: number;
  pointLightDecay: number;
  moonVisibilityDistance: number;
  planetNearThreshold: number;
}

export const SOLAR_SCALE_SCENE_PROFILES: Record<SolarScaleMode, SolarScaleSceneProfile> = {
  showcase: {
    maxCameraDistance: 340,
    overviewCamera: [40, 74, 168],
    eclipticCamera: [0, 188, 54],
    fogNear: 220,
    fogFar: 520,
    pointLightIntensity: 4.8,
    pointLightDistance: 320,
    pointLightDecay: 2,
    moonVisibilityDistance: 45,
    planetNearThreshold: 55,
  },
  educational: {
    maxCameraDistance: 480,
    overviewCamera: [58, 116, 230],
    eclipticCamera: [0, 255, 75],
    fogNear: 320,
    fogFar: 760,
    pointLightIntensity: 4.8,
    pointLightDistance: 420,
    pointLightDecay: 2,
    moonVisibilityDistance: 65,
    planetNearThreshold: 70,
  },
  realistic: {
    maxCameraDistance: 4_400,
    overviewCamera: [300, 1_050, 2_200],
    eclipticCamera: [0, 2_650, 760],
    fogNear: 2_500,
    fogFar: 5_800,
    pointLightIntensity: 0.35,
    pointLightDistance: 0,
    pointLightDecay: 0,
    moonVisibilityDistance: 80,
    planetNearThreshold: 70,
  },
};

export const getSolarScaleModeDefinition = (mode: SolarScaleMode) => SOLAR_SCALE_MODE_DEFINITIONS[mode];
export const getSolarScaleSceneProfile = (mode: SolarScaleMode) => SOLAR_SCALE_SCENE_PROFILES[mode];
export const getSolarPlanetFocusDistance = (renderRadius: number) => Math.max(8, renderRadius * 6);

export const scaleDistanceAu = (au: number, mode: SolarScaleMode, minAu = 0.05) => {
  const safeAu = Number.isFinite(au) ? Math.max(au, minAu) : 1;
  if (mode === "realistic") {
    return safeAu * TRUE_AU_SCENE_UNITS;
  }
  if (mode === "educational") {
    return Math.sqrt(safeAu) * 18;
  }
  return Math.log(safeAu + 1) * 22;
};

export const scaleRadiusKm = (km: number, minRadius = MIN_PLANET_RADIUS) => {
  const safeKm = Number.isFinite(km) && km > 0 ? km : 1;
  return Math.max(minRadius, Math.cbrt(safeKm) * SIZE_MULTIPLIER);
};

export const scaleMoonRadiusKm = (km: number) =>
  Math.max(MIN_MOON_RADIUS, Math.cbrt(km) * SIZE_MULTIPLIER * MOON_SIZE_MULTIPLIER);

export const scaleMoonDistanceKm = (km: number, mode: SolarScaleMode) => {
  const distanceAu = km / AU_IN_KM;
  const base = scaleDistanceAu(distanceAu, mode, 0.0001);
  const multiplier =
    mode === "realistic"
      ? MOON_ORBIT_MULTIPLIER_REALISTIC
      : mode === "educational"
        ? MOON_ORBIT_MULTIPLIER_EDUCATIONAL
        : MOON_ORBIT_MULTIPLIER_SHOWCASE;
  return base * multiplier;
};
