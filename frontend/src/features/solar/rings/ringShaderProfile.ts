import type { SolarRingSystem } from "../../../domain/solar";

export const MAX_RING_BANDS = 10;

export interface RingShaderProfile {
  innerRadiusBodyRadii: number;
  outerRadiusBodyRadii: number;
  bandCount: number;
  bandCenters: number[];
  bandHalfWidths: number[];
  bandOpacities: number[];
}

export const createRingShaderProfile = (
  ringSystem: SolarRingSystem,
  planetRadiusKm: number,
): RingShaderProfile => {
  const bands = ringSystem.bands.slice(0, MAX_RING_BANDS);
  const pad = (values: number[]) => [
    ...values,
    ...Array.from({ length: MAX_RING_BANDS - values.length }, () => 0),
  ];

  return {
    innerRadiusBodyRadii: ringSystem.innerRadiusKm / planetRadiusKm,
    outerRadiusBodyRadii: ringSystem.outerRadiusKm / planetRadiusKm,
    bandCount: bands.length,
    bandCenters: pad(
      bands.map((band) => (band.innerRadiusKm + band.outerRadiusKm) / (2 * planetRadiusKm)),
    ),
    bandHalfWidths: pad(
      bands.map((band) => (band.outerRadiusKm - band.innerRadiusKm) / (2 * planetRadiusKm)),
    ),
    bandOpacities: pad(bands.map((band) => 1 - Math.exp(-band.opticalDepth))),
  };
};

export const RING_PROFILE_GLSL = `
  #define MAX_RING_BANDS ${MAX_RING_BANDS}
  uniform sampler2D ringMap;
  uniform bool hasRingMap;
  uniform int ringBandCount;
  uniform float ringBandCenters[MAX_RING_BANDS];
  uniform float ringBandHalfWidths[MAX_RING_BANDS];
  uniform float ringBandOpacities[MAX_RING_BANDS];
  uniform float innerRadius;
  uniform float outerRadius;

  float sampleProceduralRingOpacity(float radiusBodyRadii) {
    float opacity = 0.0;
    float pixelFeather = max((outerRadius - innerRadius) / 720.0, 0.00004);
    for (int index = 0; index < MAX_RING_BANDS; index++) {
      if (index >= ringBandCount) break;
      float distanceFromCenter = abs(radiusBodyRadii - ringBandCenters[index]);
      float halfWidth = ringBandHalfWidths[index];
      float bandMask = 1.0 - smoothstep(halfWidth, halfWidth + pixelFeather, distanceFromCenter);
      opacity = max(opacity, bandMask * ringBandOpacities[index]);
    }
    return clamp(opacity, 0.0, 1.0);
  }

  float sampleRingOpacity(float radiusBodyRadii) {
    float coordinate = clamp(
      (radiusBodyRadii - innerRadius) / max(outerRadius - innerRadius, 0.000001),
      0.0,
      1.0
    );
    return hasRingMap
      ? texture2D(ringMap, vec2(coordinate, 0.5)).a
      : sampleProceduralRingOpacity(radiusBodyRadii);
  }
`;
