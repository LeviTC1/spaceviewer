export const AU_PER_LIGHT_YEAR = 63_241.077;
export const SOLAR_SCALE_BOUNDARY_LY = 0.01;
export const STELLAR_SCALE_ORIGIN = 28;

export const compressAstronomicalRadius = (distanceLightYears: number) => {
  if (!Number.isFinite(distanceLightYears) || distanceLightYears <= 0) return 0;
  if (distanceLightYears < SOLAR_SCALE_BOUNDARY_LY) {
    return Math.max(distanceLightYears * AU_PER_LIGHT_YEAR, 0.000_001) ** 0.44 * 1.5;
  }
  return STELLAR_SCALE_ORIGIN + Math.log2(1 + distanceLightYears) * 9.5;
};

export const compressAstronomicalPosition = (
  positionLightYears: readonly [number, number, number],
  focusLightYears: readonly [number, number, number] = [0, 0, 0],
): [number, number, number] => {
  const delta: [number, number, number] = [
    positionLightYears[0] - focusLightYears[0],
    positionLightYears[1] - focusLightYears[1],
    positionLightYears[2] - focusLightYears[2],
  ];
  const distance = Math.hypot(...delta);
  if (!Number.isFinite(distance) || distance <= 1e-12) return [0, 0, 0];
  const scale = compressAstronomicalRadius(distance) / distance;
  return [delta[0] * scale, delta[1] * scale, delta[2] * scale];
};
