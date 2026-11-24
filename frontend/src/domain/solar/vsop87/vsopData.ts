import type { PlanetId } from "../../../features/solar/solarData";

export type VsopPlanetId = Exclude<PlanetId, "pluto">;

export const VSOP87_SUPPORTED_PLANETS = new Set<PlanetId>([
  "mercury",
  "venus",
  "earth",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
]);

export const isVsop87PlanetId = (planetId: PlanetId): planetId is VsopPlanetId =>
  VSOP87_SUPPORTED_PLANETS.has(planetId);

