import { SOLAR_AU_KM } from "./solarEphemeris";

export interface EclipseVector3 {
  x: number;
  y: number;
  z: number;
}

export interface ApparentDiskGeometry {
  sunPositionTargetRadii: EclipseVector3;
  sunRadiusTargetRadii: number;
  occluderPositionTargetRadii: EclipseVector3;
  occluderRadiusTargetRadii: number;
}

export interface SolarEclipseGeometryInput {
  targetRadiusKm: number;
  targetToSunAu: EclipseVector3;
  occluderRadiusKm: number;
  targetToOccluderAu: EclipseVector3;
  sunRadiusKm?: number;
}

export interface SolarEclipseGeometry extends ApparentDiskGeometry {
  centerSeparationDeg: number;
  sunAngularRadiusDeg: number;
  occluderAngularRadiusDeg: number;
  centerObscurationFraction: number;
  shadowAxisDistanceTargetRadii: number;
  umbraRadiusAtTargetRadii: number;
  penumbraRadiusAtTargetRadii: number;
  intersectsPenumbra: boolean;
}

// IAU 2015 Resolution B3 nominal solar-radius conversion constant. It is an
// exact conversion factor, not a claim about an instantaneous photospheric
// radius.
export const IAU_NOMINAL_SOLAR_RADIUS_KM = 695_700;

const RAD_TO_DEG = 180 / Math.PI;
const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));
const magnitude = (vector: EclipseVector3) => Math.hypot(vector.x, vector.y, vector.z);
const subtract = (left: EclipseVector3, right: EclipseVector3): EclipseVector3 => ({
  x: left.x - right.x,
  y: left.y - right.y,
  z: left.z - right.z,
});
const dot = (left: EclipseVector3, right: EclipseVector3) =>
  left.x * right.x + left.y * right.y + left.z * right.z;
const scale = (vector: EclipseVector3, factor: number): EclipseVector3 => ({
  x: vector.x * factor,
  y: vector.y * factor,
  z: vector.z * factor,
});
const normalize = (vector: EclipseVector3): EclipseVector3 => {
  const length = magnitude(vector) || 1;
  return scale(vector, 1 / length);
};
const angleBetween = (left: EclipseVector3, right: EclipseVector3) =>
  Math.acos(clamp(dot(normalize(left), normalize(right)), -1, 1));

const toSceneTargetRadii = (
  vectorAu: EclipseVector3,
  targetRadiusKm: number,
): EclipseVector3 => {
  const targetRadiiPerAu = SOLAR_AU_KM / targetRadiusKm;
  return {
    x: vectorAu.x * targetRadiiPerAu,
    y: vectorAu.z * targetRadiiPerAu,
    z: vectorAu.y * targetRadiiPerAu,
  };
};

/**
 * Fraction of the apparent solar-disc area hidden by one circular occluder.
 * The angular-disc overlap is exact for spherical Sun/occluder silhouettes.
 */
export const calculateApparentDiskOverlapFraction = (
  sunAngularRadiusRad: number,
  occluderAngularRadiusRad: number,
  separationRad: number,
) => {
  const sunRadius = Math.max(0, sunAngularRadiusRad);
  const occluderRadius = Math.max(0, occluderAngularRadiusRad);
  const separation = Math.max(0, separationRad);
  if (sunRadius === 0 || occluderRadius === 0 || separation >= sunRadius + occluderRadius) return 0;
  const sunArea = Math.PI * sunRadius * sunRadius;
  if (separation <= Math.abs(sunRadius - occluderRadius)) {
    const overlapRadius = Math.min(sunRadius, occluderRadius);
    return clamp((Math.PI * overlapRadius * overlapRadius) / sunArea, 0, 1);
  }
  const separationSquared = separation * separation;
  const sunSquared = sunRadius * sunRadius;
  const occluderSquared = occluderRadius * occluderRadius;
  const sunSector = sunSquared * Math.acos(
    clamp((separationSquared + sunSquared - occluderSquared) / (2 * separation * sunRadius), -1, 1),
  );
  const occluderSector = occluderSquared * Math.acos(
    clamp((separationSquared + occluderSquared - sunSquared) / (2 * separation * occluderRadius), -1, 1),
  );
  const triangle = 0.5 * Math.sqrt(
    Math.max(
      0,
      (-separation + sunRadius + occluderRadius) *
        (separation + sunRadius - occluderRadius) *
        (separation - sunRadius + occluderRadius) *
        (separation + sunRadius + occluderRadius),
    ),
  );
  return clamp((sunSector + occluderSector - triangle) / sunArea, 0, 1);
};

export const calculateObscurationAtSurfacePoint = (
  geometry: ApparentDiskGeometry,
  surfacePointTargetRadii: EclipseVector3,
) => {
  const toSun = subtract(geometry.sunPositionTargetRadii, surfacePointTargetRadii);
  const toOccluder = subtract(geometry.occluderPositionTargetRadii, surfacePointTargetRadii);
  const sunDistance = magnitude(toSun);
  const occluderDistance = magnitude(toOccluder);
  if (
    sunDistance <= geometry.sunRadiusTargetRadii ||
    occluderDistance <= geometry.occluderRadiusTargetRadii ||
    occluderDistance >= sunDistance
  ) {
    return 0;
  }
  const sunAngularRadius = Math.asin(clamp(geometry.sunRadiusTargetRadii / sunDistance, 0, 1));
  const occluderAngularRadius = Math.asin(
    clamp(geometry.occluderRadiusTargetRadii / occluderDistance, 0, 1),
  );
  return calculateApparentDiskOverlapFraction(
    sunAngularRadius,
    occluderAngularRadius,
    angleBetween(toSun, toOccluder),
  );
};

export const calculateSolarEclipseGeometry = ({
  targetRadiusKm,
  targetToSunAu,
  occluderRadiusKm,
  targetToOccluderAu,
  sunRadiusKm = IAU_NOMINAL_SOLAR_RADIUS_KM,
}: SolarEclipseGeometryInput): SolarEclipseGeometry | null => {
  if (targetRadiusKm <= 0 || occluderRadiusKm <= 0 || sunRadiusKm <= 0) return null;
  const sunDistanceKm = magnitude(targetToSunAu) * SOLAR_AU_KM;
  const occluderDistanceKm = magnitude(targetToOccluderAu) * SOLAR_AU_KM;
  if (sunDistanceKm <= sunRadiusKm || occluderDistanceKm <= occluderRadiusKm) return null;

  const sunAngularRadius = Math.asin(clamp(sunRadiusKm / sunDistanceKm, 0, 1));
  const occluderAngularRadius = Math.asin(clamp(occluderRadiusKm / occluderDistanceKm, 0, 1));
  const centerSeparation = angleBetween(targetToSunAu, targetToOccluderAu);
  const centerObscurationFraction = calculateApparentDiskOverlapFraction(
    sunAngularRadius,
    occluderAngularRadius,
    centerSeparation,
  );

  const sunPositionTargetRadii = toSceneTargetRadii(targetToSunAu, targetRadiusKm);
  const occluderPositionTargetRadii = toSceneTargetRadii(targetToOccluderAu, targetRadiusKm);
  const sunToOccluderKm = subtract(
    scale(targetToOccluderAu, SOLAR_AU_KM),
    scale(targetToSunAu, SOLAR_AU_KM),
  );
  const sunToOccluderDistanceKm = magnitude(sunToOccluderKm);
  const shadowAxis = normalize(sunToOccluderKm);
  const occluderToTargetKm = scale(targetToOccluderAu, -SOLAR_AU_KM);
  const distanceAlongShadowKm = dot(occluderToTargetKm, shadowAxis);
  const closestAxisOffsetKm = subtract(
    occluderToTargetKm,
    scale(shadowAxis, distanceAlongShadowKm),
  );
  const shadowAxisDistanceKm = magnitude(closestAxisOffsetKm);
  const penumbraSlope = (sunRadiusKm + occluderRadiusKm) / sunToOccluderDistanceKm;
  const umbraSlope = (sunRadiusKm - occluderRadiusKm) / sunToOccluderDistanceKm;
  const penumbraRadiusKm = occluderRadiusKm + distanceAlongShadowKm * penumbraSlope;
  const umbraRadiusKm = occluderRadiusKm - distanceAlongShadowKm * umbraSlope;
  const axialRadiusAllowanceKm = targetRadiusKm * penumbraSlope;
  const intersectsPenumbra =
    distanceAlongShadowKm > -targetRadiusKm &&
    shadowAxisDistanceKm <= targetRadiusKm + penumbraRadiusKm + axialRadiusAllowanceKm;

  return {
    sunPositionTargetRadii,
    sunRadiusTargetRadii: sunRadiusKm / targetRadiusKm,
    occluderPositionTargetRadii,
    occluderRadiusTargetRadii: occluderRadiusKm / targetRadiusKm,
    centerSeparationDeg: centerSeparation * RAD_TO_DEG,
    sunAngularRadiusDeg: sunAngularRadius * RAD_TO_DEG,
    occluderAngularRadiusDeg: occluderAngularRadius * RAD_TO_DEG,
    centerObscurationFraction,
    shadowAxisDistanceTargetRadii: shadowAxisDistanceKm / targetRadiusKm,
    umbraRadiusAtTargetRadii: umbraRadiusKm / targetRadiusKm,
    penumbraRadiusAtTargetRadii: penumbraRadiusKm / targetRadiusKm,
    intersectsPenumbra,
  };
};

