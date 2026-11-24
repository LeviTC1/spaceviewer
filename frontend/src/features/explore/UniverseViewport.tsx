// The explorer's 3-D viewport: one continuous, physically scaled universe.
//
// Frame loop (priority −10, before all render layers):
//   1. advance simulated time (continuous ms, signed rate)
//   2. advance the camera (flight / inertia / tracking) in float64 km
//   3. derive the floating-origin render frame (unit = distance to the look-at point), adaptive near
//      plane, exposure and panorama weight
//   4. project candidates, place labels, update picking
// Render layers read the shared EngineState in their own useFrame callbacks.

import { Suspense, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, forwardRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ACESFilmicToneMapping, Matrix4, SRGBColorSpace, Vector3, type PerspectiveCamera } from "three";
import type { DecodedStarCatalogChunk } from "../../lib/catalog/starCatalogTypes";
import { bindCameraInput, ExplorerCamera, type CameraEvent, type CameraTargetInfo } from "./engine/cameraController";
import { createEngineState, pixelRadiusOf, type EngineState } from "./engine/engineState";
import { frameDistanceForRadius } from "./engine/flight";
import { createLabelLayer, type LabelLayer } from "./engine/labels";
import { getEntityWorld, type UniverseEntity, type UniverseIndex } from "./engine/universeModel";
import { GALACTIC_CENTRE_WORLD, GALACTIC_NORTH_WORLD, KM_PER_LY, cross3, dot3, normalize3, type Vec3 } from "./engine/units";
import { EngineContext } from "./render/EngineContext";
import { DeepSkyMarkers, GalaxyLayer } from "./render/GalaxyLayer";
import { NebulaClusterLayer } from "./render/NebulaClusterLayer";
import { SkyPanorama, StarField } from "./render/SkyLayers";
import { SolarBodies } from "./render/SolarBodies";
import { BlackHole, ExoplanetSystem, OrbitLines, StarBody } from "./render/SystemLayers";

export type ExplorerQuality = "low" | "balanced" | "high" | "ultra";

export interface CameraSnapshot {
  targetId: string | null;
  distanceKm: number;
  direction: Vec3;
  cameraWorld: Vec3;
  cameraFromSunKm: number;
  simTimeMs: number;
  rate: number;
  paused: boolean;
}

export interface UniverseViewportHandle {
  flyTo: (id: string, options?: { framing?: "auto" | "close" | "system" | "context"; instant?: boolean; keepDirection?: boolean }) => void;
  goHome: () => void;
  zoomBy: (factor: number) => void;
  cancelFlight: () => void;
  setTime: (ms: number) => void;
  setRate: (rate: number) => void;
  setPaused: (paused: boolean) => void;
  getSnapshot: () => CameraSnapshot;
  restore: (snapshot: { targetId: string | null; distanceKm: number; direction: Vec3 }) => void;
  setToggles: (toggles: { orbits?: boolean; labels?: boolean }) => void;
  setIdleSpin: (radPerSecond: number) => void;
  /** Place the camera around a target at an explicit pose (opening scene, shared links). */
  placeAt: (id: string, distanceKm: number, direction: Vec3, animate: boolean) => void;
  /** Render the current view and copy it into a new 2D canvas (postcards, saved-view thumbnails). */
  capture: () => HTMLCanvasElement | null;
  /** Lens: vertical field of view in degrees (50 normal; a few degrees or less is a telescope view). */
  setFov: (degrees: number) => void;
  engine: EngineState;
}

/** Gives the imperative handle a way to render on demand and read the pixels in the same task. */
function CaptureBridge({ target }: { target: { current: (() => HTMLCanvasElement | null) | null } }) {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    target.current = () => {
      gl.render(scene, camera);
      const source = gl.domElement;
      const copy = document.createElement("canvas");
      copy.width = source.width;
      copy.height = source.height;
      copy.getContext("2d")?.drawImage(source, 0, 0);
      return copy;
    };
    return () => {
      target.current = null;
    };
  }, [camera, gl, scene, target]);
  return null;
}

interface UniverseViewportProps {
  index: UniverseIndex;
  starChunks: DecodedStarCatalogChunk[];
  selectedId: string | null;
  hoveredId: string | null;
  contextId?: string | null;
  quality: ExplorerQuality;
  occludedLeft: number;
  occludedRight: number;
  occludedBottom: number;
  initialTimeMs: number;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
  onFlyRequest: (id: string) => void;
  onCameraEvent: (event: CameraEvent) => void;
  onReport: (snapshot: CameraSnapshot) => void;
  reducedMotion: boolean;
  /** False while another SpaceViewer surface is showing: rendering and input pause, state is kept. */
  active?: boolean;
}

// ---------------------------------------------------------------------------------------------
// Target geometry helpers (shared with framing decisions)

export const targetUpFor = (entity: UniverseEntity | undefined): Vec3 => {
  if (!entity) return [0, 1, 0];
  if (entity.kind === "galaxy" && entity.galaxy) return entity.galaxy.normal;
  if (entity.kind === "structure" || entity.kind === "black-hole") return GALACTIC_NORTH_WORLD;
  if (entity.kind === "star" || entity.kind === "exoplanet-system" || entity.kind === "nebula" || entity.kind === "cluster") return GALACTIC_NORTH_WORLD;
  return [0, 1, 0];
};

export const minDistanceFor = (entity: UniverseEntity | undefined) => {
  if (!entity) return 1e-3;
  if (entity.kind === "galaxy" || entity.kind === "structure" || entity.kind === "nebula" || entity.kind === "cluster") return entity.extentKm * 0.02;
  if (entity.kind === "black-hole") return entity.radiusKm * 2.2;
  if (entity.kind === "spacecraft") return 0.004;
  return entity.radiusKm * 1.04;
};

/** Visual bounding radius used for framing an arrival. */
export const framingRadiusFor = (entity: UniverseEntity, framing: "auto" | "close" | "system" | "context", index: UniverseIndex, timeMs: number) => {
  if (framing === "system" || (framing === "context" && entity.kind === "planet")) {
    const children = index.children.get(entity.id) ?? [];
    const world = getEntityWorld(entity, timeMs);
    let max = entity.extentKm;
    if (world) {
      for (const child of children) {
        const cw = getEntityWorld(child, timeMs);
        if (!cw) continue;
        const d = Math.hypot(cw[0] - world[0], cw[1] - world[1], cw[2] - world[2]);
        if (child.radiusKm > 150 || entity.id === "solar:planet:earth") max = Math.max(max, d * 1.05);
      }
    }
    return max;
  }
  switch (entity.kind) {
    case "sun":
      return entity.radiusKm * 1.6;
    case "planet":
    case "dwarf-planet":
    case "moon":
      return framing === "close" ? entity.radiusKm : entity.extentKm * 1.08;
    case "comet":
      return entity.radiusKm * 6;
    case "spacecraft":
      return 0.009; // ~9 m: the 3.7 m dish and 13 m boom fill the frame
    case "star":
      return framing === "context" ? KM_PER_LY * 1.5 : entity.radiusKm * 3;
    case "exoplanet-system":
      return entity.extentKm;
    case "galaxy":
    case "structure": {
      // Frame the projected major axis; inclined disks are narrower than they are long.
      return entity.extentKm * (entity.kind === "structure" ? 0.52 : 0.72);
    }
    case "black-hole":
      return entity.extentKm * 0.55;
    default:
      return entity.extentKm;
  }
};

// ---------------------------------------------------------------------------------------------

const Driver = ({
  engine,
  camera,
  labels,
  onReport,
}: {
  engine: EngineState;
  camera: ExplorerCamera;
  labels: React.MutableRefObject<LabelLayer | null>;
  onReport: (snapshot: CameraSnapshot) => void;
}) => {
  const three = useThree();
  const lastReport = useRef(0);
  const lastWorld = useRef<Vec3 | null>(null);
  const basis = useMemo(() => new Matrix4(), []);
  const exposureRef = useRef(0);

  useFrame((_, delta) => {
    const now = performance.now();
    engine.frame += 1;
    // 1. time
    if (!engine.paused) {
      engine.simTimeMs += delta * 1000 * engine.rate;
      const min = Date.UTC(1900, 0, 1);
      const max = Date.UTC(2100, 11, 31);
      if (engine.simTimeMs < min || engine.simTimeMs > max) {
        engine.simTimeMs = Math.min(max, Math.max(min, engine.simTimeMs));
        engine.paused = true;
      }
    }
    // 2. camera
    const resolve = (id: string | null): CameraTargetInfo | null => {
      if (!id) return null;
      const entity = engine.index.byId.get(id);
      if (!entity) return null;
      const world = getEntityWorld(entity, engine.simTimeMs);
      if (!world) return null;
      return { id, world, minDistance: minDistanceFor(entity), up: targetUpFor(entity) };
    };
    const pose = camera.update(delta, now, resolve);
    engine.trackedId = camera.flight?.toId ?? camera.targetId;
    engine.cameraWorld = pose.world;
    engine.cameraTarget = pose.target;
    engine.cameraDistanceKm = pose.distance;
    const forward = normalize3([-pose.direction[0], -pose.direction[1], -pose.direction[2]]);
    let right = normalize3(cross3(forward, pose.up));
    if (!Number.isFinite(right[0]) || Math.abs(dot3(forward, pose.up)) > 0.9999) right = normalize3(cross3(forward, [1, 0, 0]));
    const upVec = normalize3(cross3(right, forward));
    engine.forward = forward;
    engine.right = right;
    engine.upVec = upVec;
    if (lastWorld.current && delta > 0) {
      const moved = Math.hypot(pose.world[0] - lastWorld.current[0], pose.world[1] - lastWorld.current[1], pose.world[2] - lastWorld.current[2]);
      engine.cameraSpeedKmS = moved / delta;
    }
    lastWorld.current = pose.world;

    // 3. render frame
    engine.unitKm = Math.max(1e-6, pose.distance);
    const size = three.size;
    engine.viewportWidth = size.width;
    engine.viewportHeight = size.height;
    engine.pixelRatio = three.gl.getPixelRatio();
    // Adaptive near plane from the closest resolved surface.
    let nearestSurface = pose.distance;
    let litCoverage = 0;
    let sunPixels = 0;
    for (const entity of engine.index.entities) {
      const isSolar = Boolean(entity.solarId) || entity.kind === "sun";
      if (!isSolar && entity.kind !== "star" && entity.kind !== "black-hole") continue;
      if (entity.kind === "star" && entity.id !== engine.selectedId && entity.id !== engine.trackedId) continue;
      const world = getEntityWorld(entity, engine.simTimeMs);
      if (!world) continue;
      const d = Math.hypot(world[0] - pose.world[0], world[1] - pose.world[1], world[2] - pose.world[2]);
      const surface = d - Math.max(entity.radiusKm, entity.extentKm);
      if (surface > 0) nearestSurface = Math.min(nearestSurface, surface);
      else nearestSurface = Math.min(nearestSurface, Math.max(d - entity.radiusKm, entity.radiusKm * 0.002));
      if (isSolar) {
        const px = pixelRadiusOf(engine, entity.radiusKm, d);
        // On-screen lit area drives exposure (only roughly in front of the camera).
        const toBody = [world[0] - pose.world[0], world[1] - pose.world[1], world[2] - pose.world[2]] as Vec3;
        const facing = dot3(normalize3(toBody), forward);
        if (facing > 0.5) {
          if (entity.kind === "sun") sunPixels = Math.max(sunPixels, px);
          else {
            // Weight by the illuminated fraction we can see: a thin crescent barely changes exposure.
            const r = Math.max(1, Math.hypot(...world));
            const cosPhase = -(world[0] * toBody[0] + world[1] * toBody[1] + world[2] * toBody[2]) / (r * Math.max(1, d));
            const litFraction = (1 + cosPhase) / 2;
            litCoverage = Math.max(litCoverage, px * Math.sqrt(Math.max(0.02, litFraction)));
          }
        }
      }
    }
    const nearUnits = Math.min(0.5, Math.max(1e-9, (nearestSurface * 0.35) / engine.unitKm));
    const reversed = three.gl.capabilities.reversedDepthBuffer === true;
    engine.near = nearUnits;
    engine.far = nearUnits * (reversed ? 1e14 : 2e7);
    engine.compressRadius = engine.far * 0.2;
    // Exposure (stops): bright resolved bodies push the sky down; the Sun pushes harder.
    const planetStops = litCoverage > 6 ? -Math.min(4.2, Math.log2(litCoverage / 6) * 0.95) : 0;
    const sunStops = sunPixels > 0.5 ? -Math.min(6, 2.5 + Math.log2(1 + sunPixels) * 0.7) : 0;
    const targetExposure = Math.min(planetStops, sunStops);
    const k = 1 - Math.exp(-delta * 2.2);
    exposureRef.current += (targetExposure - exposureRef.current) * k;
    engine.exposure = exposureRef.current;
    // The Sun-centred Gaia panorama and the Milky Way model are complementary: exactly one holds the sky.
    // The panorama is honest near the Sun and from inside the disk; the model takes over once the camera
    // has left the solar neighbourhood *and* risen above the disk (or is far from the Galaxy).
    const fromSunLy = Math.hypot(...pose.world) / KM_PER_LY;
    const rel = [pose.world[0] - GALACTIC_CENTRE_WORLD[0], pose.world[1] - GALACTIC_CENTRE_WORLD[1], pose.world[2] - GALACTIC_CENTRE_WORLD[2]];
    const heightLy = Math.abs(dot3(rel as Vec3, GALACTIC_NORTH_WORLD)) / KM_PER_LY;
    const fromCentreLy = Math.hypot(rel[0], rel[1], rel[2]) / KM_PER_LY;
    const smooth = (a: number, b: number, x: number) => {
      const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };
    const leftNeighbourhood = smooth(Math.log10(1_200), Math.log10(6_000), Math.log10(Math.max(1, fromSunLy)));
    const nearCentre = 1 - smooth(3_000, 9_000, fromCentreLy);
    const outside = Math.max(smooth(800, 4_000, heightLy), smooth(55_000, 90_000, fromCentreLy), nearCentre);
    engine.panoramaWeight = 1 - leftNeighbourhood * outside;
    engine.flightCruise = camera.flight ? 1 : 0;

    const cam = three.camera as PerspectiveCamera;
    cam.position.set(0, 0, 0);
    basis.makeBasis(new Vector3(...right), new Vector3(...upVec), new Vector3(-forward[0], -forward[1], -forward[2]));
    cam.quaternion.setFromRotationMatrix(basis);
    cam.near = engine.near;
    cam.far = engine.far;
    cam.fov = (engine.fovY * 180) / Math.PI;
    const shift = engine.occludedLeft / 2 - engine.occludedRight / 2;
    const lift = engine.occludedBottom / 2;
    if (Math.abs(shift) > 0.5 || lift > 0.5) cam.setViewOffset(size.width, size.height, -shift, lift, size.width, size.height);
    else cam.clearViewOffset();
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    three.gl.toneMappingExposure = 1;

    // 4. labels & picking
    labels.current?.update(engine);

    if (now - lastReport.current > 200) {
      lastReport.current = now;
      onReport({
        targetId: camera.targetId,
        distanceKm: pose.distance,
        direction: pose.direction,
        cameraWorld: pose.world,
        cameraFromSunKm: Math.hypot(...pose.world),
        simTimeMs: engine.simTimeMs,
        rate: engine.rate,
        paused: engine.paused,
      });
    }
  }, -10);
  return null;
};

const SelectedExtras = ({ engine, selectedId }: { engine: EngineState; selectedId: string | null }) => {
  const entity = selectedId ? engine.index.byId.get(selectedId) : undefined;
  const sgr = engine.index.byId.get("explore:sagittarius-a-star");
  return (
    <>
      {entity && (entity.kind === "star" || entity.kind === "exoplanet-system") ? <StarBody key={`star-${entity.id}`} entity={entity} /> : null}
      {entity && entity.kind === "exoplanet-system" ? <ExoplanetSystem key={`exo-${entity.id}`} entity={entity} /> : null}
      {sgr ? <BlackHole entity={sgr} /> : null}
    </>
  );
};

const UniverseViewport = forwardRef<UniverseViewportHandle, UniverseViewportProps>(function UniverseViewport(props, ref) {
  const {
    index,
    starChunks,
    selectedId,
    hoveredId,
    contextId = null,
    quality,
    occludedLeft,
    occludedRight,
    occludedBottom,
    initialTimeMs,
    onSelect,
    onHover,
    onFlyRequest,
    onCameraEvent,
    onReport,
    reducedMotion,
    active = true,
  } = props;
  const activeRef = useRef(active);
  const captureRef = useRef<(() => HTMLCanvasElement | null) | null>(null);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);
  const engine = useMemo(() => {
    const state = createEngineState(index);
    state.simTimeMs = initialTimeMs;
    return state;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  engine.index = index;
  engine.selectedId = selectedId;
  engine.hoveredId = hoveredId;
  engine.contextId = contextId;
  engine.quality = quality;
  engine.occludedLeft = occludedLeft;
  engine.occludedRight = occludedRight;
  engine.occludedBottom = occludedBottom;
  engine.reducedMotion = reducedMotion;
  const camera = useMemo(() => new ExplorerCamera(), []);
  camera.reducedMotion = reducedMotion;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const labelsRef = useRef<HTMLDivElement | null>(null);
  const labelLayer = useRef<LabelLayer | null>(null);
  const callbacks = useRef({ onSelect, onHover, onFlyRequest, onCameraEvent, onReport });
  useLayoutEffect(() => {
    callbacks.current = { onSelect, onHover, onFlyRequest, onCameraEvent, onReport };
  });

  useEffect(() => {
    const off = camera.on((event) => callbacks.current.onCameraEvent(event));
    return () => {
      off();
    };
  }, [camera]);

  useEffect(() => {
    const container = labelsRef.current;
    if (!container) return;
    labelLayer.current = createLabelLayer(
      container,
      (id) => callbacks.current.onSelect(id),
      (id) => callbacks.current.onHover(id),
    );
    return () => {
      labelLayer.current?.dispose();
      labelLayer.current = null;
    };
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    let hoverFrame = 0;
    return bindCameraInput(element, camera, {
      getFovY: () => engine.fovY,
      onClick: (x, y) => {
        const hit = labelLayer.current?.pick(engine, x, y) ?? null;
        callbacks.current.onSelect(hit?.id ?? null);
      },
      onDoubleClick: (x, y) => {
        const hit = labelLayer.current?.pick(engine, x, y) ?? null;
        if (hit) callbacks.current.onFlyRequest(hit.id);
      },
      onHover: (x, y) => {
        if (hoverFrame === engine.frame) return;
        hoverFrame = engine.frame;
        const hit = labelLayer.current?.pick(engine, x, y) ?? null;
        element.style.cursor = hit ? "pointer" : "";
        if ((hit?.id ?? null) !== engine.hoveredId) callbacks.current.onHover(hit?.id ?? null);
      },
    });
  }, [camera, engine]);

  // Keyboard: arrows orbit, +/- zoom, Escape interrupts a flight.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!activeRef.current) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (target?.closest?.("[role=dialog]")) return;
      const step = event.shiftKey ? 0.2 : 0.07;
      switch (event.key) {
        case "ArrowLeft":
          camera.orbit(-step, 0, false);
          break;
        case "ArrowRight":
          camera.orbit(step, 0, false);
          break;
        case "ArrowUp":
          camera.orbit(0, -step, false);
          break;
        case "ArrowDown":
          camera.orbit(0, step, false);
          break;
        case "+":
        case "=":
          camera.zoom(-0.35);
          break;
        case "-":
        case "_":
          camera.zoom(0.35);
          break;
        case "Escape":
          if (camera.flight) camera.cancelFlight(true);
          else return;
          break;
        default:
          return;
      }
      event.preventDefault();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [camera]);

  const computeArrival = (entity: UniverseEntity, framing: "auto" | "close" | "system" | "context", keepDirection: boolean) => {
    const world = getEntityWorld(entity, engine.simTimeMs);
    if (!world) return null;
    const radius = framingRadiusFor(entity, framing, index, engine.simTimeMs);
    // Before the first frame the canvas has not been measured yet: use the window.
    const measured = engine.viewportWidth > 50 && engine.viewportHeight > 50;
    const distance = frameDistanceForRadius(radius, {
      width: measured ? engine.viewportWidth : window.innerWidth,
      height: measured ? engine.viewportHeight : window.innerHeight,
      occludedLeft: engine.occludedLeft,
      occludedRight: engine.occludedRight,
      occludedBottom: engine.occludedBottom,
      verticalFovRad: engine.fovY,
    }, entity.kind === "galaxy" || entity.kind === "structure" ? 0.78 : entity.kind === "planet" && entity.extentKm > entity.radiusKm ? 0.7 : 0.5);
    let direction: Vec3;
    const up = targetUpFor(entity);
    const recentManual = performance.now() - camera.lastManualOrbitAt < 20_000;
    const sameSystem = camera.targetId && (engine.index.byId.get(camera.targetId)?.parentId === entity.parentId || camera.targetId === entity.parentId || engine.index.byId.get(camera.targetId)?.parentId === entity.id);
    if (keepDirection || (recentManual && sameSystem)) {
      direction = camera.direction;
    } else if (entity.solarId && entity.kind !== "sun") {
      // Lit-side three-quarter view: 50° off the Sun line, 18° above the orbital plane.
      const toSun = normalize3([-world[0], -world[1], -world[2]]);
      const side = normalize3(cross3(up, toSun));
      const a = (50 * Math.PI) / 180;
      const e = (18 * Math.PI) / 180;
      direction = normalize3([
        (toSun[0] * Math.cos(a) + side[0] * Math.sin(a)) * Math.cos(e) + up[0] * Math.sin(e),
        (toSun[1] * Math.cos(a) + side[1] * Math.sin(a)) * Math.cos(e) + up[1] * Math.sin(e),
        (toSun[2] * Math.cos(a) + side[2] * Math.sin(a)) * Math.cos(e) + up[2] * Math.sin(e),
      ]);
    } else if (entity.kind === "galaxy" && entity.galaxy) {
      // Arrive along our own line of sight, slightly offset: the galaxy as we know it from Earth
      // (Andromeda inclined, the Sombrero edge-on). Orbiting from there reveals the rest.
      const fromSun = normalize3(world);
      const side = normalize3(cross3(up, fromSun));
      direction = normalize3([-fromSun[0] * 0.97 + side[0] * 0.2 + up[0] * 0.12, -fromSun[1] * 0.97 + side[1] * 0.2 + up[1] * 0.12, -fromSun[2] * 0.97 + side[2] * 0.2 + up[2] * 0.12]);
    } else if (entity.kind === "galaxy" || entity.kind === "structure") {
      // Show the disk at ~55° so arms and thickness both read; approach from our side of the sky.
      const fromSun = normalize3(world);
      const toward: Vec3 = [-fromSun[0], -fromSun[1], -fromSun[2]];
      const n = entity.galaxy?.normal ?? up;
      const nSign = dot3(toward, n) >= 0 ? 1 : -1;
      const inPlane = normalize3([
        toward[0] - n[0] * dot3(toward, n),
        toward[1] - n[1] * dot3(toward, n),
        toward[2] - n[2] * dot3(toward, n),
      ]);
      const tilt = (58 * Math.PI) / 180;
      direction = normalize3([
        inPlane[0] * Math.cos(tilt) + n[0] * nSign * Math.sin(tilt),
        inPlane[1] * Math.cos(tilt) + n[1] * nSign * Math.sin(tilt),
        inPlane[2] * Math.cos(tilt) + n[2] * nSign * Math.sin(tilt),
      ]);
      if (entity.id === "galactic:milky-way-structure") {
        // Classic three-quarter view from above, with the Sun's side toward the camera.
        const sunSide = normalize3([-world[0], -world[1], -world[2]]);
        direction = normalize3([sunSide[0] * 0.55 + n[0] * 0.83, sunSide[1] * 0.55 + n[1] * 0.83, sunSide[2] * 0.55 + n[2] * 0.83]);
      }
    } else {
      // Approach along our line of sight from the Sun, slightly offset: what we see from Earth, enlarged.
      const fromSun = normalize3(world);
      const side = normalize3(cross3(up, fromSun));
      direction = normalize3([-fromSun[0] * 0.92 + side[0] * 0.3 + up[0] * 0.18, -fromSun[1] * 0.92 + side[1] * 0.3 + up[1] * 0.18, -fromSun[2] * 0.92 + side[2] * 0.3 + up[2] * 0.18]);
    }
    return { world, distance: Math.max(minDistanceFor(entity), distance), direction, up };
  };

  useImperativeHandle(ref, () => ({
    engine,
    capture: () => captureRef.current?.() ?? null,
    flyTo: (id, options = {}) => {
      const entity = index.byId.get(id);
      if (!entity) return;
      if (entity.direction && !entity.staticWorld) {
        // No catalogued distance: turn to face it from where we are rather than invent a destination.
        const current = camera.targetId ? index.byId.get(camera.targetId) : undefined;
        const currentWorld = current ? getEntityWorld(current, engine.simTimeMs) : camera.currentLookAt();
        const look: Vec3 = [-entity.direction[0], -entity.direction[1], -entity.direction[2]];
        camera.flyTo(
          { id: camera.targetId, world: currentWorld ?? camera.currentLookAt(), minDistance: minDistanceFor(current), up: camera.up },
          camera.distance,
          look,
          performance.now(),
          entity.name,
        );
        return;
      }
      const arrival = computeArrival(entity, options.framing ?? "auto", options.keepDirection ?? false);
      if (!arrival) return;
      const target: CameraTargetInfo = { id, world: arrival.world, minDistance: minDistanceFor(entity), up: arrival.up };
      if (options.instant || reducedMotion) {
        camera.setPose(target, arrival.distance, arrival.direction);
        callbacks.current.onCameraEvent({ type: "flight-end", toId: id, interrupted: false });
        return;
      }
      camera.flyTo(target, arrival.distance, arrival.direction, performance.now(), entity.name);
    },
    goHome: () => {
      const earth = index.byId.get("solar:planet:earth");
      if (!earth) return;
      const arrival = computeArrival(earth, "system", false);
      if (!arrival) return;
      camera.flyTo({ id: earth.id, world: arrival.world, minDistance: minDistanceFor(earth), up: arrival.up }, arrival.distance, arrival.direction, performance.now(), "Earth");
    },
    zoomBy: (factor) => camera.zoom(Math.log(factor)),
    cancelFlight: () => camera.cancelFlight(true),
    setTime: (ms) => {
      engine.simTimeMs = ms;
    },
    setRate: (rate) => {
      engine.rate = rate;
    },
    setPaused: (paused) => {
      engine.paused = paused;
    },
    getSnapshot: () => ({
      targetId: camera.targetId,
      distanceKm: camera.distance,
      direction: camera.direction,
      cameraWorld: engine.cameraWorld,
      cameraFromSunKm: Math.hypot(...engine.cameraWorld),
      simTimeMs: engine.simTimeMs,
      rate: engine.rate,
      paused: engine.paused,
    }),
    restore: (snapshot) => {
      const entity = snapshot.targetId ? index.byId.get(snapshot.targetId) : undefined;
      const world = entity ? getEntityWorld(entity, engine.simTimeMs) : null;
      camera.setPose(
        { id: entity ? entity.id : null, world: world ?? [0, 0, 0], minDistance: minDistanceFor(entity), up: targetUpFor(entity) },
        snapshot.distanceKm,
        snapshot.direction,
      );
    },
    setIdleSpin: (radPerSecond) => {
      camera.idleSpin = radPerSecond;
    },
    setFov: (degrees) => {
      engine.fovY = (Math.min(80, Math.max(0.05, degrees)) * Math.PI) / 180;
    },
    placeAt: (id, distanceKm, direction, animate) => {
      const entity = index.byId.get(id);
      if (!entity) return;
      const world = getEntityWorld(entity, engine.simTimeMs);
      if (!world) return;
      const target: CameraTargetInfo = { id, world, minDistance: minDistanceFor(entity), up: targetUpFor(entity) };
      if (animate && !reducedMotion) camera.flyTo(target, distanceKm, direction, performance.now(), entity.name);
      else camera.setPose(target, distanceKm, direction);
    },
    setToggles: (toggles) => {
      if (toggles.orbits !== undefined) engine.showOrbits = toggles.orbits;
      if (toggles.labels !== undefined) engine.showLabels = toggles.labels;
    },
  }));

  const deepSkyMarkers = useMemo(
    () => index.entities.filter((entity) => entity.kind === "galaxy" || entity.kind === "nebula" || entity.kind === "cluster" || entity.kind === "structure"),
    [index],
  );

  // Retina default (high) renders at 1.75× — visually indistinguishable at viewing distance, ~25 % fewer pixels than 2×.
  const dpr: [number, number] = quality === "low" ? [1, 1] : quality === "balanced" ? [1, 1.5] : quality === "high" ? [1, 1.75] : [1, 2];

  return (
    <div ref={containerRef} className="ex-viewport" aria-label="Universe view. Drag to orbit, scroll or pinch to zoom, double-click an object to fly there.">
      <Canvas
        className="ex-canvas"
        dpr={dpr}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance", reversedDepthBuffer: true } as never}
        camera={{ fov: 50, near: 0.001, far: 1e9, position: [0, 0, 0] }}
        frameloop={active ? "always" : "never"}
        onCreated={({ gl }) => {
          gl.toneMapping = ACESFilmicToneMapping;
          gl.outputColorSpace = SRGBColorSpace;
          gl.setClearColor("#000003", 1);
        }}
      >
        <EngineContext.Provider value={engine}>
          <CaptureBridge target={captureRef} />
          <Driver engine={engine} camera={camera} labels={labelLayer} onReport={(s) => callbacks.current.onReport(s)} />
          <Suspense fallback={null}>
            <SkyPanorama />
          </Suspense>
          <StarField chunks={starChunks} />
          <DeepSkyMarkers entities={deepSkyMarkers} />
          <GalaxyLayer />
          <NebulaClusterLayer />
          <OrbitLines />
          <SolarBodies />
          <SelectedExtras engine={engine} selectedId={selectedId} />
        </EngineContext.Provider>
      </Canvas>
      <div ref={labelsRef} className="ex-labels" />
    </div>
  );
});

export default UniverseViewport;
