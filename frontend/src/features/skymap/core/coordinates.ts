export type DistanceUnit = "light-year" | "au" | "km" | "scene-unit";
export type AngularUnit = "degree" | "radian" | "hour";

export type SkyCoordinateFrameId =
  | "local-interstellar-cartesian"
  | "heliocentric-ecliptic"
  | "equatorial-icrs"
  | "galactic"
  | "scene-cartesian"
  | "screen-projected";

export interface SkyEpoch {
  kind: "static" | "iso-date" | "julian-date";
  value?: string | number;
  scale?: "utc" | "tdb";
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
  galactic: {
    id: "galactic",
    label: "Galactic",
    dimensionality: 3,
    origin: "Galactic center reference frame",
    axes: "Galactic longitude and latitude",
    defaultUnit: "degree",
    description: "Reserved for Milky Way scale layers.",
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
  frame: Extract<SkyCoordinateFrameId, "equatorial-icrs" | "galactic">;
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
  astronomicalUnitToSceneUnit: number;
  kilometerToSceneUnit: number;
}

export const DEFAULT_SCENE_PROJECTION: SceneProjection = {
  lightYearToSceneUnit: 0.8,
  astronomicalUnitToSceneUnit: 0.08,
  kilometerToSceneUnit: 0.00000000054,
};

const convertDistanceToSceneUnits = (value: number, unit: DistanceUnit, projection: SceneProjection) => {
  switch (unit) {
    case "scene-unit":
      return value;
    case "light-year":
      return value * projection.lightYearToSceneUnit;
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

  return {
    x: convertDistanceToSceneUnits(position.x, position.unit, projection),
    y: convertDistanceToSceneUnits(position.y, position.unit, projection),
    z: convertDistanceToSceneUnits(position.z, position.unit, projection),
    unit: "scene-unit",
    sourceFrame: position.frame,
  };
};
