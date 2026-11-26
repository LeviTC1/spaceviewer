// Shared mutable per-frame state for the explorer renderer. One object, created once per viewport,
// read by every render layer inside useFrame. Nothing here triggers React renders.

import type { Group, Object3D } from "three";
import type { HorizonFrame } from "./observer";
import type { UniverseEntity, UniverseIndex } from "./universeModel";
import { KM_PER_LY, type Vec3 } from "./units";

export interface ProjectedCandidate {
  entity: UniverseEntity;
  x: number;
  y: number;
  /** Apparent radius in CSS pixels of the physical body / extent. */
  pixelRadius: number;
  /** Distance from the camera (km). */
  distanceKm: number;
  /** Visibility prominence 0..∞ (point-source brightness or size). */
  prominence: number;
  score: number;
  onScreen: boolean;
  occluded: boolean;
}

export interface EngineState {
  index: UniverseIndex;
  simTimeMs: number;
  /** Simulated seconds per real second (negative = reverse). */
  rate: number;
  paused: boolean;
  cameraWorld: Vec3;
  cameraTarget: Vec3;
  cameraDistanceKm: number;
  /** World-frame camera basis. */
  forward: Vec3;
  right: Vec3;
  upVec: Vec3;
  /** Kilometres per render unit this frame (the look-at point sits at distance 1). */
  unitKm: number;
  /** Render-space radius beyond which positions are log-compressed (image preserving). */
  compressRadius: number;
  near: number;
  far: number;
  viewportWidth: number;
  viewportHeight: number;
  pixelRatio: number;
  fovY: number;
  /** Panel occlusion (CSS px) to frame subjects in the free area. */
  occludedLeft: number;
  occludedRight: number;
  occludedBottom: number;
  selectedId: string | null;
  hoveredId: string | null;
  trackedId: string | null;
  /** An object kept labelled for context (e.g. the nebula you came from, seen within the Galaxy). */
  contextId: string | null;
  /** Exposure in stops relative to a dark-sky baseline (0). Negative when sunlit bodies dominate. */
  exposure: number;
  /** 0..1 how strongly the Sun-centred Gaia panorama is valid (camera near the Sun). */
  panoramaWeight: number;
  /** Camera speed through space (km/s of real time), used for motion cues. */
  cameraSpeedKmS: number;
  flightCruise: number;
  quality: "low" | "balanced" | "high" | "ultra";
  candidates: ProjectedCandidate[];
  frame: number;
  reducedMotion: boolean;
  /** A survey photograph registered on the selected object; its volume dims by `photoWeight` so the two do not double up. */
  photoId: string | null;
  photoWeight: number;
  /** Standing on the Earth: the local horizon frame, or null in space. */
  groundFrame: HorizonFrame | null;
  /** Altitude of the Sun above the observer's horizon (degrees; ground mode only). */
  sunAltitudeDeg: number;
  /** Toggles exposed to the UI. */
  showOrbits: boolean;
  showLabels: boolean;
  showConstellations: boolean;
  showMinorBodies: boolean;
}

export const createEngineState = (index: UniverseIndex): EngineState => ({
  index,
  simTimeMs: Date.now(),
  rate: 1,
  paused: false,
  cameraWorld: [0, 0, 1e9],
  cameraTarget: [0, 0, 0],
  cameraDistanceKm: 1e9,
  forward: [0, 0, -1],
  right: [1, 0, 0],
  upVec: [0, 1, 0],
  unitKm: 1e9,
  compressRadius: 1e9,
  near: 1e-4,
  far: 1e12,
  viewportWidth: 1,
  viewportHeight: 1,
  pixelRatio: 1,
  fovY: (50 * Math.PI) / 180,
  occludedLeft: 0,
  occludedRight: 0,
  occludedBottom: 0,
  selectedId: null,
  hoveredId: null,
  trackedId: null,
  contextId: null,
  photoId: null,
  photoWeight: 0,
  groundFrame: null,
  sunAltitudeDeg: 0,
  exposure: 0,
  panoramaWeight: 1,
  cameraSpeedKmS: 0,
  flightCruise: 0,
  quality: "balanced",
  candidates: [],
  frame: 0,
  reducedMotion: false,
  showOrbits: true,
  showLabels: true,
  showConstellations: false,
  showMinorBodies: true,
});

/**
 * Camera-relative render position for a world point, with monotonic log compression beyond
 * `compressRadius`. Returns the factor that converts kilometres at that point into render units,
 * so an object scaled by it keeps exactly its true angular size.
 */
export const placeRelative = (state: EngineState, world: Vec3, out: { x: number; y: number; z: number }) => {
  const rx = (world[0] - state.cameraWorld[0]) / state.unitKm;
  const ry = (world[1] - state.cameraWorld[1]) / state.unitKm;
  const rz = (world[2] - state.cameraWorld[2]) / state.unitKm;
  const d = Math.hypot(rx, ry, rz);
  const R = state.compressRadius;
  const k = d > R ? (R * (1 + Math.log(d / R))) / d : 1;
  out.x = rx * k;
  out.y = ry * k;
  out.z = rz * k;
  return k / state.unitKm;
};

/** Convenience: position and uniformly scale an Object3D that is modelled in kilometres. */
export const placeObjectKm = (state: EngineState, object: Object3D | Group, world: Vec3, sizeKm = 1) => {
  const kmToRender = placeRelative(state, world, object.position);
  object.scale.setScalar(Math.max(1e-30, sizeKm * kmToRender));
  return kmToRender;
};

/** Project a world point to CSS-pixel screen coordinates. Returns null when behind the camera. */
export const projectToScreen = (state: EngineState, world: Vec3): { x: number; y: number; depth: number } | null => {
  const rx = world[0] - state.cameraWorld[0];
  const ry = world[1] - state.cameraWorld[1];
  const rz = world[2] - state.cameraWorld[2];
  const depth = rx * state.forward[0] + ry * state.forward[1] + rz * state.forward[2];
  if (depth <= 0) return null;
  const sx = rx * state.right[0] + ry * state.right[1] + rz * state.right[2];
  const sy = rx * state.upVec[0] + ry * state.upVec[1] + rz * state.upVec[2];
  const f = state.viewportHeight / 2 / Math.tan(state.fovY / 2);
  return {
    x: state.viewportWidth / 2 + (sx / depth) * f + state.occludedLeft / 2 - state.occludedRight / 2,
    y: state.viewportHeight / 2 - (sy / depth) * f - state.occludedBottom / 2,
    depth,
  };
};

/** How much an object's volume dims while its survey photograph is showing (the photo carries the light). */
export const photoDimming = (state: EngineState, id: string) => (state.photoId === id ? 1 - 0.75 * state.photoWeight : 1);

/** Projected radius in CSS pixels of a sphere of radius r (km) at distance d (km). */
export const pixelRadiusOf = (state: EngineState, radiusKm: number, distanceKm: number) => {
  if (distanceKm <= radiusKm) return state.viewportHeight;
  const f = state.viewportHeight / 2 / Math.tan(state.fovY / 2);
  return (Math.asin(Math.min(1, radiusKm / distanceKm)) * f);
};

export const lightYearsFromSun = (state: EngineState) =>
  Math.hypot(state.cameraWorld[0], state.cameraWorld[1], state.cameraWorld[2]) / KM_PER_LY;
