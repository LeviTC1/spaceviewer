export type DistanceUnit = "light-year" | "kiloparsec" | "megaparsec" | "au" | "km" | "scene-unit";
export type AngularUnit = "degree" | "radian" | "hour";

export type SkyCoordinateFrameId =
  | "local-interstellar-cartesian"
  | "heliocentric-icrs-cartesian"
  | "heliocentric-ecliptic"
  | "equatorial-icrs"
  | "equatorial-j2000"
  | "galactic"
  | "supergalactic-cartesian"
  | "scene-cartesian"
  | "screen-projected";

export interface SkyEpoch {
  kind: "static" | "iso-date" | "julian-date" | "julian-year";
  value?: string | number;
  scale?: "utc" | "tdb" | "tcb";
}

export interface SkyCoordinateFrame {
  id: SkyCoordinateFrameId;
  label: string;
  dimensionality: 2 | 3;
  origin: string;
  axes: string;
  defaultUnit: DistanceUnit | AngularUnit;
  description: string;
}

export const SKY_COORDINATE_FRAMES: Record<SkyCoordinateFrameId, SkyCoordinateFrame> = {
  "local-interstellar-cartesian": {
    id: "local-interstellar-cartesian",
    label: "Local interstellar cartesian",
    dimensionality: 3,
    origin: "Solar neighborhood seed catalog origin",
    axes: "Right-handed local XYZ derived from RA/Dec and distance",
    defaultUnit: "light-year",
    description: "Used by the current SkyMap local-star preview. Coordinates are measured in light-years.",
  },
  "heliocentric-icrs-cartesian": {
    id: "heliocentric-icrs-cartesian",
    label: "Heliocentric ICRS cartesian",
    dimensionality: 3,
    origin: "Sun",
    axes: "ICRS x toward RA 0 deg / Dec 0 deg, y toward RA 90 deg / Dec 0 deg, z toward the north celestial pole",
    defaultUnit: "light-year",
    description: "Derived from Gaia DR3 ICRS astrometry at J2016.0 using inverse positive parallax for the visualization subset.",
  },
  "heliocentric-ecliptic": {
    id: "heliocentric-ecliptic",
    label: "Heliocentric ecliptic",
    dimensionality: 3,
    origin: "Sun",
    axes: "Ecliptic plane",
    defaultUnit: "au",
    description: "Reserved for future Solar Explorer and ephemeris integration.",
  },
  "equatorial-icrs": {
    id: "equatorial-icrs",
    label: "Equatorial ICRS",
    dimensionality: 3,
    origin: "Solar system barycenter",
    axes: "Right ascension and declination",
    defaultUnit: "degree",
    description: "Reserved for catalog ingestion where RA/Dec is authoritative.",
  },
  "equatorial-j2000": {
    id: "equatorial-j2000",
    label: "Equatorial J2000",
    dimensionality: 3,
    origin: "Celestial reference origin",
    axes: "Right ascension and declination at the J2000 equator and equinox",
    defaultUnit: "degree",
    description: "Used for the IAU-published J2000 constellation-boundary coordinate set without claiming a time-propagated ICRS catalogue position.",
  },
  galactic: {
    id: "galactic",
    label: "Galactic",
    dimensionality: 3,
    origin: "Galactic center reference frame",
    axes: "Galactic longitude and latitude",
    defaultUnit: "degree",
    description: "Reserved for Milky Way scale layers.",
  },
  "supergalactic-cartesian": {
    id: "supergalactic-cartesian",
    label: "Heliocentric supergalactic cartesian",
    dimensionality: 3,
    origin: "Sun",
    axes: "Supergalactic X, Y and Z derived from J2000 ICRS positions",
    defaultUnit: "kiloparsec",
    description: "Physical Local Volume Database coordinates. The renderer preserves direction and logarithmically compresses radius.",
  },
  "scene-cartesian": {
    id: "scene-cartesian",
    label: "Scene cartesian",
    dimensionality: 3,
    origin: "Renderer scene origin",
    axes: "Three.js compatible XYZ",
    defaultUnit: "scene-unit",
    description: "Renderer-space coordinates. These are not scientific units.",
  },
  "screen-projected": {
    id: "screen-projected",
    label: "Screen projected",
    dimensionality: 2,
    origin: "Viewport",
    axes: "Projected screen X/Y",
    defaultUnit: "scene-unit",
    description: "Reserved for labels, overlays, and hit testing.",
  },
};

export interface CartesianSkyPosition {
  mode: "cartesian";
  frame: SkyCoordinateFrameId;
  unit: DistanceUnit;
  x: number;
  y: number;
  z: number;
  epoch?: SkyEpoch;
}

export interface SphericalSkyPosition {
  mode: "spherical";
  frame: Extract<SkyCoordinateFrameId, "equatorial-icrs" | "equatorial-j2000" | "galactic">;
  longitude: number;
  latitude: number;
  angularUnit: AngularUnit;
  distance?: number;
  distanceUnit?: DistanceUnit;
  epoch?: SkyEpoch;
}

export interface ProjectedSkyPosition {
  mode: "projected";
  frame: "screen-projected";
  unit: "normalized" | "pixel";
  x: number;
  y: number;
  epoch?: SkyEpoch;
}

export type SkyPosition = CartesianSkyPosition | SphericalSkyPosition | ProjectedSkyPosition;

export interface SceneVector3 {
  x: number;
  y: number;
  z: number;
  unit: "scene-unit";
  sourceFrame: SkyCoordinateFrameId;
}

export interface SceneProjection {
  lightYearToSceneUnit: number;
  kiloparsecToSceneUnit: number;
  megaparsecToSceneUnit: number;
  astronomicalUnitToSceneUnit: number;
  kilometerToSceneUnit: number;
}

export const DEFAULT_SCENE_PROJECTION: SceneProjection = {
  lightYearToSceneUnit: 0.8,
  kiloparsecToSceneUnit: 3_261.5637771674333 * 0.8,
  megaparsecToSceneUnit: 3_261.5637771674333 * 1_000 * 0.8,
  astronomicalUnitToSceneUnit: 0.08,
  kilometerToSceneUnit: 0.00000000054,
};

export const LOCAL_GROUP_SCENE_PROJECTION = {
  minimumPhysicalRadiusKpc: 10,
  maximumPhysicalRadiusKpc: 1_400,
  minimumSceneRadius: 74,
  maximumSceneRadius: 128,
} as const;

/**
 * Preserves the supergalactic direction while logarithmically compressing
 * heliocentric radius. Rendered Local Group separations are therefore not a
 * linear physical scale and must not be measured as kiloparsecs in scene space.
 */
export const projectSupergalacticKpcToScene = (vector: Pick<CartesianSkyPosition, "x" | "y" | "z">) => {
  const radiusKpc = Math.hypot(vector.x, vector.y, vector.z);
  if (!Number.isFinite(radiusKpc) || radiusKpc === 0) return { x: 0, y: 0, z: 0 };
  const bounds = LOCAL_GROUP_SCENE_PROJECTION;
  const clampedRadius = Math.min(bounds.maximumPhysicalRadiusKpc, Math.max(bounds.minimumPhysicalRadiusKpc, radiusKpc));
  const logProgress =
    Math.log(clampedRadius / bounds.minimumPhysicalRadiusKpc) /
    Math.log(bounds.maximumPhysicalRadiusKpc / bounds.minimumPhysicalRadiusKpc);
  const mappedRadius =
    radiusKpc < bounds.minimumPhysicalRadiusKpc
      ? (radiusKpc / bounds.minimumPhysicalRadiusKpc) * bounds.minimumSceneRadius
      : bounds.minimumSceneRadius + logProgress * (bounds.maximumSceneRadius - bounds.minimumSceneRadius);
  const scale = mappedRadius / radiusKpc;
  return { x: vector.x * scale, y: vector.y * scale, z: vector.z * scale };
};

const convertDistanceToSceneUnits = (value: number, unit: DistanceUnit, projection: SceneProjection) => {
  switch (unit) {
    case "scene-unit":
      return value;
    case "light-year":
      return value * projection.lightYearToSceneUnit;
    case "kiloparsec":
      return value * projection.kiloparsecToSceneUnit;
    case "megaparsec":
      return value * projection.megaparsecToSceneUnit;
    case "au":
      return value * projection.astronomicalUnitToSceneUnit;
    case "km":
      return value * projection.kilometerToSceneUnit;
  }
};

export const projectPositionToScene = (
  position: SkyPosition,
  projection: SceneProjection = DEFAULT_SCENE_PROJECTION,
): SceneVector3 | null => {
  if (position.mode !== "cartesian") {
    return null;
  }

  if (position.frame === "supergalactic-cartesian" && position.unit === "kiloparsec") {
    return {
      ...projectSupergalacticKpcToScene(position),
      unit: "scene-unit",
      sourceFrame: position.frame,
    };
  }

  return {
    x: convertDistanceToSceneUnits(position.x, position.unit, projection),
    y: convertDistanceToSceneUnits(position.y, position.unit, projection),
    z: convertDistanceToSceneUnits(position.z, position.unit, projection),
    unit: "scene-unit",
    sourceFrame: position.frame,
  };
};
