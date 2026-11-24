export type ContinuousScaleStageId =
  | "planetary"
  | "solar"
  | "stellar"
  | "galactic"
  | "local-group"
  | "cosmic-web"
  | "observable";

export interface ContinuousScaleStage {
  id: ContinuousScaleStageId;
  label: string;
  context: string;
}

export const MIN_CONTINUOUS_CAMERA_DISTANCE = 2.8;
export const MAX_CONTINUOUS_CAMERA_DISTANCE = 4_200;
export const SOLAR_SYSTEM_REVEAL_DISTANCE = 10.5;
export const SOLAR_OVERVIEW_SUN_RADIUS = 0.92;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

export const getContinuousScaleStage = (distance: number): ContinuousScaleStage => {
  if (distance < 14) return { id: "planetary", label: "Planetary close-up", context: "surface texture · local magnification" };
  if (distance < 96) return { id: "solar", label: "Solar System", context: "compressed orbits · physical size hierarchy" };
  if (distance < 210) return { id: "stellar", label: "Stellar neighbourhood", context: "nearby Gaia stars" };
  if (distance < 520) return { id: "galactic", label: "Milky Way", context: "photometric disk · 199 measured masers" };
  if (distance < 1_100) return { id: "local-group", label: "Local Group", context: "117 catalogue galaxies · log-mapped distance" };
  if (distance < 2_600) return { id: "cosmic-web", label: "Cosmic web", context: "context filaments · measured DESI overlay" };
  return { id: "observable", label: "Observable universe", context: "large-scale context volume" };
};

export const getContinuousScaleProgress = (distance: number) => {
  const normalized =
    Math.log(clamp(distance, MIN_CONTINUOUS_CAMERA_DISTANCE, MAX_CONTINUOUS_CAMERA_DISTANCE) / MIN_CONTINUOUS_CAMERA_DISTANCE) /
    Math.log(MAX_CONTINUOUS_CAMERA_DISTANCE / MIN_CONTINUOUS_CAMERA_DISTANCE);
  return clamp(normalized, 0, 1);
};

export const getSolarOverviewRadius = (radiusKm: number) =>
  clamp(0.068 * Math.cbrt(radiusKm / 6_371), 0.044, 0.17);
