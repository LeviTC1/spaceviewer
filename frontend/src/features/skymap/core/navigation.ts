import type { SceneVector3, SkyCoordinateFrameId } from "./coordinates";

export type SkyMapNavigationMode = "free-explore" | "object-focus" | "overview";

export type SkyMapNavigationIntent =
  | "initial-load"
  | "manual-control"
  | "direct-select"
  | "search-result"
  | "discovery"
  | "manual-focus"
  | "reset-view"
  | "time-follow";

export type SkyMapScaleBandId = "solar-context" | "stellar-neighborhood" | "wide-field";

export interface SkyMapScaleBandDefinition {
  id: SkyMapScaleBandId;
  label: string;
  shortLabel: string;
  distanceRange: [number, number];
  description: string;
}

export interface SkyMapNavigationState {
  mode: SkyMapNavigationMode;
  scaleBand: SkyMapScaleBandId;
  lastIntent: SkyMapNavigationIntent;
  resetRequestId: number;
}

export interface SkyMapCameraVector {
  x: number;
  y: number;
  z: number;
}

export interface SkyMapCameraPose {
  position: SkyMapCameraVector;
  target: SkyMapCameraVector;
  distance: number;
  scaleBand: SkyMapScaleBandId;
  durationSeconds: number;
}

export interface SkyMapNavigationTarget {
  objectId: string;
  position: SceneVector3;
  radiusSceneUnits?: number;
}

export const SKYMAP_SCALE_BANDS: Record<SkyMapScaleBandId, SkyMapScaleBandDefinition> = {
  "solar-context": {
    id: "solar-context",
    label: "Solar context",
    shortLabel: "Solar",
    distanceRange: [0, 28],
    description: "Close staged scene-space view for Sun, planets, and moons.",
  },
  "stellar-neighborhood": {
    id: "stellar-neighborhood",
    label: "Local stellar neighborhood",
    shortLabel: "Local stars",
    distanceRange: [28, 96],
    description: "Nearby-star map view with the solar bridge still visible as a local reference.",
  },
  "wide-field": {
    id: "wide-field",
    label: "Galactic, deep-space, and cosmological field",
    shortLabel: "Galaxy → cosmos",
    distanceRange: [96, Number.POSITIVE_INFINITY],
    description: "Pulled-back field for the Milky Way and cosmological schematics plus staged deep-space seed objects.",
  },
};

export const SKYMAP_DEFAULT_CAMERA_POSE: SkyMapCameraPose = {
  position: { x: 0, y: 24, z: 78 },
  target: { x: 0, y: 0, z: 0 },
  distance: Math.hypot(0, 24, 78),
  scaleBand: "stellar-neighborhood",
  durationSeconds: 0,
};

export const SKYMAP_OVERVIEW_CAMERA_POSE: SkyMapCameraPose = {
  position: { x: 0, y: 42, z: 118 },
  target: { x: 0, y: 0, z: 0 },
  distance: Math.hypot(0, 42, 118),
  scaleBand: "wide-field",
  durationSeconds: 1.2,
};

const DEFAULT_VIEW_DIRECTION: SkyMapCameraVector = { x: 0.22, y: 0.34, z: 0.91 };

const vectorLength = (vector: SkyMapCameraVector) => Math.hypot(vector.x, vector.y, vector.z);

const normalize = (vector: SkyMapCameraVector): SkyMapCameraVector => {
  const length = vectorLength(vector);
  if (length < 0.0001) return DEFAULT_VIEW_DIRECTION;
  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  };
};

export const createInitialSkyMapNavigationState = (): SkyMapNavigationState => ({
  mode: "overview",
  scaleBand: classifySkyMapScaleBand(SKYMAP_DEFAULT_CAMERA_POSE.distance),
  lastIntent: "initial-load",
  resetRequestId: 0,
});

export const classifySkyMapScaleBand = (cameraDistance: number): SkyMapScaleBandId => {
  if (cameraDistance < SKYMAP_SCALE_BANDS["solar-context"].distanceRange[1]) {
    return "solar-context";
  }
  if (cameraDistance < SKYMAP_SCALE_BANDS["stellar-neighborhood"].distanceRange[1]) {
    return "stellar-neighborhood";
  }
  return "wide-field";
};

export const getSkyMapScaleBandDefinition = (scaleBand: SkyMapScaleBandId) => SKYMAP_SCALE_BANDS[scaleBand];

export const formatSkyMapNavigationMode = (mode: SkyMapNavigationMode) => {
  switch (mode) {
    case "free-explore":
      return "Free explore";
    case "object-focus":
      return "Object focus";
    case "overview":
      return "Overview";
  }
};

export const formatSkyMapNavigationIntent = (intent: SkyMapNavigationIntent) => {
  switch (intent) {
    case "initial-load":
      return "Initial load";
    case "manual-control":
      return "Manual control";
    case "direct-select":
      return "Direct selection";
    case "search-result":
      return "Search navigation";
    case "discovery":
      return "Discovery jump";
    case "manual-focus":
      return "Manual focus";
    case "reset-view":
      return "Reset view";
    case "time-follow":
      return "Time follow";
  }
};

export const getSkyMapScaleBandForFrame = (frame: SkyCoordinateFrameId): SkyMapScaleBandId => {
  if (frame === "heliocentric-ecliptic") {
    return "solar-context";
  }
  if (
    frame === "galactic" ||
    frame === "supergalactic-cartesian" ||
    frame === "scene-cartesian" ||
    frame === "screen-projected"
  ) {
    return "wide-field";
  }
  return "stellar-neighborhood";
};

export const getSkyMapScaleBandForPosition = (position: SceneVector3): SkyMapScaleBandId => (
  getSkyMapScaleBandForFrame(position.sourceFrame)
);

export const createSkyMapFocusCameraPose = (
  target: SkyMapNavigationTarget,
  currentCamera: SkyMapCameraVector,
  currentTarget: SkyMapCameraVector,
): SkyMapCameraPose => {
  const targetPosition = target.position;
  const targetVector = { x: targetPosition.x, y: targetPosition.y, z: targetPosition.z };
  const viewDirection = normalize({
    x: currentCamera.x - currentTarget.x,
    y: currentCamera.y - currentTarget.y,
    z: currentCamera.z - currentTarget.z,
  });
  const targetDistanceFromOrigin = vectorLength(targetVector);
  const radius = Math.max(target.radiusSceneUnits ?? 0.45, 0.08);
  const scaleBand = getSkyMapScaleBandForPosition(targetPosition);
  const focusDistance =
    scaleBand === "solar-context"
      ? Math.min(Math.max(7.5 + radius * 8 + targetDistanceFromOrigin * 0.08, 9), 24)
      : scaleBand === "wide-field"
        ? Math.min(Math.max(104 + radius * 2 + targetDistanceFromOrigin * 0.05, 104), 142)
      : Math.min(Math.max(18 + radius * 1.6 + targetDistanceFromOrigin * 0.18, 18), 46);

  return {
    position: {
      x: targetVector.x + viewDirection.x * focusDistance,
      y: targetVector.y + viewDirection.y * focusDistance,
      z: targetVector.z + viewDirection.z * focusDistance,
    },
    target: targetVector,
    distance: focusDistance,
    scaleBand,
    durationSeconds: scaleBand === "solar-context" ? 0.95 : scaleBand === "wide-field" ? 1.35 : 1.1,
  };
};

export const createSkyMapOverviewCameraPose = (): SkyMapCameraPose => SKYMAP_OVERVIEW_CAMERA_POSE;
