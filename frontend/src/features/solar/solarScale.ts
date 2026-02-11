import type { PlanetId, SolarScaleMode } from "./solarData";

export const MIN_PLANET_RADIUS = 0.8;
export const SIZE_MULTIPLIER = 0.07;
export const MIN_MOON_RADIUS = MIN_PLANET_RADIUS * 0.25;
export const MOON_SIZE_MULTIPLIER = 0.45;
export const MOON_ORBIT_MULTIPLIER_SHOWCASE = 30;
export const MOON_ORBIT_MULTIPLIER_EDUCATIONAL = 2.4;
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
export const AU_IN_KM = 149_600_000;

export const scaleDistanceAu = (au: number, mode: SolarScaleMode, minAu = 0.05) => {
  const safeAu = Number.isFinite(au) ? Math.max(au, minAu) : 1;
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
    mode === "educational" ? MOON_ORBIT_MULTIPLIER_EDUCATIONAL : MOON_ORBIT_MULTIPLIER_SHOWCASE;
  return base * multiplier;
};
