import type { MoonDef } from "../../features/solar/moonData";
import type { PlanetDef, PlanetId } from "../../features/solar/solarData";
import type { OrbitalElements } from "../../features/solar/orbitalElements";

export type { MoonDef, OrbitalElements, PlanetDef, PlanetId };

export type SolarObjectKind = "sun" | "planet" | "moon";
export type SolarObjectId = "sun" | PlanetId | string;
export type SolarTimeInput = number | Date | string | { daysSinceEpoch: number };

export interface SolarVector3Au {
  x: number;
  y: number;
  z: number;
  unit: "au";
  frame: "heliocentric-ecliptic";
}

export interface SolarSceneVector3 {
  x: number;
  y: number;
  z: number;
  unit: "scene-unit";
  sourceFrame: "heliocentric-ecliptic";
}

export interface SolarOrbitalSolution {
  meanAnomalyRad: number;
  eccentricAnomalyRad: number;
  trueAnomalyRad: number;
  radiusAu: number;
  argumentOfLatitudeRad: number;
  model: "keplerian-elements";
}

export interface SolarObjectState {
  id: SolarObjectId;
  sourceId: string;
  kind: SolarObjectKind;
  name: string;
  parentId?: SolarObjectId;
  positionAu: SolarVector3Au;
  relativePositionAu?: SolarVector3Au;
  orbital?: SolarOrbitalSolution;
  daysSinceEpoch: number;
  model: "solar-reference" | "keplerian-elements" | "parent-relative-circular";
  accuracyNote: string;
}

export interface SolarSceneProjectionOptions {
  scaleDistanceAu: (au: number) => number;
  minSceneDistance?: number;
}

export interface SolarMoonSceneProjectionOptions {
  parentScenePosition: [number, number, number] | SolarSceneVector3;
  parentRadiusSceneUnits: number;
  scaleMoonDistanceKm: (km: number) => number;
  minParentRadiusMultiplier?: number;
}

export interface SolarMoonOrbitSceneProjectionOptions extends SolarMoonSceneProjectionOptions {
  samples?: number;
}
