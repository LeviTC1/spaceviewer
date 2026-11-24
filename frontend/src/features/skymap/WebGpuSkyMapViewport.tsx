import { useCallback, useEffect, useMemo, useRef, useState, type FC, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import initWasm, { WgpuSkyRenderer } from "../../engine-wasm/pkg/spaceviewer_wgpu.js";
import type { DecodedStarCatalogChunk } from "../../lib/catalog/starCatalogTypes";
import type { AdaptiveQualityReport } from "../../lib/rendering/adaptiveQuality";
import type { AstroQualityTier } from "../../lib/rendering/qualityManager";
import { createCameraFlightState, shouldReduceCameraFlightMotionInBrowser, type CameraFlightState } from "../../domain/astro/cameraFlight";
import type { SkyObjectId } from "./core/objects";
import { formatSkyMapNavigationMode, getSkyMapScaleBandDefinition, type SkyMapNavigationState } from "./core/navigation";
import { isSkyLineRenderable, isSkyMeshRenderable, isSkyPointRenderable, type SkyRenderable } from "./core/renderers";
import type { SceneVector3 } from "./core/coordinates";
import type { SkyMapPlaybackState } from "./core/time";
import { SOLAR_SCENE_UNITS_PER_AU } from "./layers/solarSystemLayer";
import { AU_PER_LIGHT_YEAR, compressAstronomicalPosition } from "./rendering/hierarchicalScale";

interface WebGpuSkyMapViewportProps {
  renderables: SkyRenderable[];
  catalogChunks: DecodedStarCatalogChunk[];
  catalogPointCount: number;
  exoplanetCatalogStatus: {
    status: "idle" | "loading" | "ready" | "error";
    loadedPlanetCount: number;
    loadedSystemCount: number;
    loadedChunkCount: number;
    totalPlanetCount: number;
    totalSystemCount: number;
    totalChunkCount: number;
    message: string;
  };
  openNgcCatalogStatus: {
    status: "idle" | "loading" | "ready" | "error";
    loadedObjectCount: number;
    loadedChunkCount: number;
    totalObjectCount: number;
    totalChunkCount: number;
    message: string;
  };
  selectedObjectId: SkyObjectId | null;
  hoveredObjectId: SkyObjectId | null;
  focusedObjectId: SkyObjectId | null;
  focusRequestId: number;
  cancelFlightToken: number;
  navigationState: SkyMapNavigationState;
  objectCount: number;
  cameraDistance: number;
  onSelectObject: (objectId: SkyObjectId | null) => void;
  onHoverObject: (objectId: SkyObjectId | null) => void;
  onViewportDistanceChange: (cameraDistance: number) => void;
  onManualNavigation: () => void;
  onCameraFlightChange: (flight: CameraFlightState | null) => void;
  timePlayback: SkyMapPlaybackState;
  qualityTier: AstroQualityTier;
  adaptiveQualityEnabled: boolean;
  onAdaptiveQualityDrop: (report: AdaptiveQualityReport) => void;
}

interface EngineStar {
  id: SkyObjectId | null;
  label: string;
  position: [number, number, number];
  color: [number, number, number];
  magnitude: number;
  size: number;
  selected: number;
  kind: number;
  interactive: boolean;
  priority: number;
}

interface EngineLabel {
  id: SkyObjectId;
  label: string;
  index: number;
  selected: boolean;
  priority: number;
}

interface ProjectedLabel extends EngineLabel {
  x: number;
  y: number;
  visible: boolean;
}

interface EngineScene {
  stars: Float32Array;
  lines: Float32Array;
  ids: Array<SkyObjectId | null>;
  labels: EngineLabel[];
  idToIndex: Map<SkyObjectId, number>;
  interactiveCount: number;
}

interface CompatibilityCamera {
  yaw: number;
  pitch: number;
  distance: number;
  targetDistance: number;
  focus: [number, number, number];
  targetFocus: [number, number, number];
}

type EngineDiagnosticsWindow = Window & {
  __SPACEVIEWER_WGPU__?: {
    backend: string;
    starCount: number;
    lineVertexCount: number;
    wasm: true;
    hierarchicalScale: "solar-au-stellar-ly-logarithmic-v1";
  };
};

const SCENE_UNITS_PER_LIGHT_YEAR = 0.8;
const MAX_LABELS = 14;
const STAR_FLOAT_STRIDE = 12;
const LINE_FLOAT_STRIDE = 8;
const RENDERER_START_TIMEOUT_MS = 9_000;

let wasmPromise: Promise<unknown> | null = null;
const ensureWasm = () => {
  wasmPromise ??= initWasm();
  return wasmPromise;
};

const createRendererWithTimeout = (
  canvas: HTMLCanvasElement,
  preferWebGpu: boolean,
  isCancelled: () => boolean,
) => {
  let expired = false;
  let timeoutId = 0;
  const creation = WgpuSkyRenderer.create(canvas, preferWebGpu).then((renderer) => {
    if (expired || isCancelled()) {
      renderer.free();
      throw new Error("Renderer startup was cancelled.");
    }
    return renderer;
  });
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      expired = true;
      reject(new Error("The graphics adapter did not respond in time."));
    }, RENDERER_START_TIMEOUT_MS);
  });
  return Promise.race([creation, timeout]).finally(() => window.clearTimeout(timeoutId));
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const normalize3 = (value: readonly [number, number, number]): [number, number, number] => {
  const length = Math.hypot(...value) || 1;
  return [value[0] / length, value[1] / length, value[2] / length];
};

const cross3 = (
  left: readonly [number, number, number],
  right: readonly [number, number, number],
): [number, number, number] => [
  left[1] * right[2] - left[2] * right[1],
  left[2] * right[0] - left[0] * right[2],
  left[0] * right[1] - left[1] * right[0],
];

const dot3 = (left: readonly [number, number, number], right: readonly [number, number, number]) => (
  left[0] * right[0] + left[1] * right[1] + left[2] * right[2]
);

const projectCompatibilityPosition = (
  position: readonly [number, number, number],
  camera: CompatibilityCamera,
  width: number,
  height: number,
) => {
  const world = compressAstronomicalPosition(position, camera.focus);
  const cosPitch = Math.cos(camera.pitch);
  const eye: [number, number, number] = [
    Math.sin(camera.yaw) * cosPitch * camera.distance,
    Math.sin(camera.pitch) * camera.distance,
    Math.cos(camera.yaw) * cosPitch * camera.distance,
  ];
  const forward = normalize3([-eye[0], -eye[1], -eye[2]]);
  const right = normalize3(cross3(forward, [0, 1, 0]));
  const up = cross3(right, forward);
  const relative: [number, number, number] = [world[0] - eye[0], world[1] - eye[1], world[2] - eye[2]];
  const depth = dot3(relative, forward);
  if (depth <= 0.1) return null;
  const focalLength = height / (2 * Math.tan(44 * Math.PI / 360));
  const x = width * 0.5 + dot3(relative, right) / depth * focalLength;
  const y = height * 0.5 - dot3(relative, up) / depth * focalLength;
  if (x < -30 || x > width + 30 || y < -30 || y > height + 30) return null;
  return { x, y, depth };
};

const parseHexColor = (value: string | undefined, fallback: [number, number, number]): [number, number, number] => {
  if (!value?.startsWith("#")) return fallback;
  const normalized = value.length === 4
    ? value.slice(1).split("").map((character) => character + character).join("")
    : value.slice(1, 7);
  const parsed = Number.parseInt(normalized, 16);
  if (!Number.isFinite(parsed)) return fallback;
  return [((parsed >> 16) & 255) / 255, ((parsed >> 8) & 255) / 255, (parsed & 255) / 255];
};

const temperatureToColor = (temperatureK: number): [number, number, number] => {
  if (!Number.isFinite(temperatureK) || temperatureK <= 0) return [0.76, 0.84, 1];
  const t = clamp((temperatureK - 2_400) / 10_000, 0, 1);
  return [1 - t * 0.27, 0.62 + t * 0.3, 0.42 + t * 0.58];
};

const toLightYears = (position: SceneVector3, layerId: string): [number, number, number] | null => {
  if (position.sourceFrame === "heliocentric-ecliptic" || layerId === "solar.system-bodies") {
    const scale = SOLAR_SCENE_UNITS_PER_AU * AU_PER_LIGHT_YEAR;
    return [position.x / scale, position.y / scale, position.z / scale];
  }
  if (
    position.sourceFrame === "heliocentric-icrs-cartesian" ||
    position.sourceFrame === "local-interstellar-cartesian"
  ) {
    return [
      position.x / SCENE_UNITS_PER_LIGHT_YEAR,
      position.y / SCENE_UNITS_PER_LIGHT_YEAR,
      position.z / SCENE_UNITS_PER_LIGHT_YEAR,
    ];
  }
  return null;
};

const buildEngineScene = (
  renderables: SkyRenderable[],
  catalogChunks: DecodedStarCatalogChunk[],
  selectedObjectId: SkyObjectId | null,
  focusedObjectId: SkyObjectId | null,
  qualityTier: AstroQualityTier,
): EngineScene => {
  const selectedId = focusedObjectId ?? selectedObjectId;
  const interactive: EngineStar[] = [];
  const context: EngineStar[] = [];

  for (const renderable of renderables) {
    if (!isSkyPointRenderable(renderable) && !isSkyMeshRenderable(renderable)) continue;
    if (renderable.objectId.startsWith("solar:moon:")) continue;
    const position = toLightYears(renderable.position, renderable.layerId);
    if (!position) continue;
    const isSolar = renderable.layerId === "solar.system-bodies";
    const isPoint = isSkyPointRenderable(renderable);
    const magnitude = isPoint ? renderable.pointMetadata?.apparentMagnitude ?? 5.4 : isSolar ? 1.8 : 6;
    const temperature = isPoint ? renderable.pointMetadata?.temperatureK : undefined;
    const fallbackColor = temperature ? temperatureToColor(temperature) : isSolar ? [0.84, 0.88, 0.94] as [number, number, number] : [0.66, 0.78, 1] as [number, number, number];
    const star: EngineStar = {
      id: renderable.objectId,
      label: isPoint ? renderable.label : renderable.label ?? renderable.objectId,
      position,
      color: parseHexColor(renderable.color, fallbackColor),
      magnitude,
      size: isSolar ? 0.76 : clamp(isPoint ? renderable.size ?? 1 : 1, 0.7, 1.45),
      selected: renderable.objectId === selectedId ? 1 : 0,
      kind: isSolar ? 1 : 0,
      interactive: renderable.interactive !== false,
      priority: (renderable.objectId === selectedId ? 10_000 : 0) + (renderable.importanceScore ?? 0) - magnitude,
    };
    (star.interactive ? interactive : context).push(star);
  }

  interactive.sort((a, b) => b.priority - a.priority);
  context.sort((a, b) => b.priority - a.priority);
  const engineStars = [...interactive, ...context];
  const ids = engineStars.map((star) => star.id);
  const idToIndex = new Map<SkyObjectId, number>();
  engineStars.forEach((star, index) => {
    if (star.id && !idToIndex.has(star.id)) idToIndex.set(star.id, index);
  });

  const catalogBudget = qualityTier === "low" ? 5_500 : qualityTier === "high" ? 15_500 : 10_500;
  let remainingCatalog = catalogBudget;
  for (const chunk of catalogChunks) {
    if (remainingCatalog <= 0) break;
    const stride = Math.max(1, Math.ceil(chunk.recordCount / remainingCatalog));
    for (let index = 0; index < chunk.recordCount && remainingCatalog > 0; index += stride) {
      const magnitude = chunk.columns.apparentMagnitudeG[index];
      engineStars.push({
        id: null,
        label: "",
        position: [chunk.columns.x[index], chunk.columns.y[index], chunk.columns.z[index]],
        color: temperatureToColor(chunk.columns.temperatureK[index]),
        magnitude: Number.isFinite(magnitude) ? magnitude : 7,
        size: 0.82,
        selected: 0,
        kind: 0,
        interactive: false,
        priority: 0,
      });
      ids.push(null);
      remainingCatalog -= 1;
    }
  }

  const starBuffer = new Float32Array(engineStars.length * STAR_FLOAT_STRIDE);
  engineStars.forEach((star, index) => {
    const offset = index * STAR_FLOAT_STRIDE;
    starBuffer.set([
      star.position[0], star.position[1], star.position[2],
      star.color[0], star.color[1], star.color[2],
      star.magnitude, star.size, star.selected, star.kind, 0, 0,
    ], offset);
  });

  const lineValues: number[] = [];
  for (const renderable of renderables) {
    if (!isSkyLineRenderable(renderable) || renderable.layerId !== "solar.system-bodies") continue;
    const color = parseHexColor(renderable.color, [0.26, 0.47, 0.74]);
    for (const path of renderable.paths) {
      for (let index = 0; index < path.length - 1; index += 1) {
        const start = toLightYears(path[index], renderable.layerId);
        const end = toLightYears(path[index + 1], renderable.layerId);
        if (!start || !end) continue;
        const alpha = clamp(renderable.opacity ?? 0.25, 0.04, 0.42);
        lineValues.push(...start, 1, ...color, alpha, ...end, 1, ...color, alpha);
      }
    }
  }

  const labels = interactive
    .map((star) => {
      const index = star.id ? idToIndex.get(star.id) : undefined;
      return index === undefined || !star.id ? null : {
        id: star.id,
        label: star.label,
        index,
        selected: star.id === selectedId,
        priority: star.priority,
      };
    })
    .filter((label): label is EngineLabel => Boolean(label))
    .sort((a, b) => Number(b.selected) - Number(a.selected) || b.priority - a.priority)
    .slice(0, MAX_LABELS);

  return {
    stars: starBuffer,
    lines: new Float32Array(lineValues),
    ids,
    labels,
    idToIndex,
    interactiveCount: interactive.length,
  };
};

const WebGpuSkyMapViewport: FC<WebGpuSkyMapViewportProps> = ({
  renderables,
  catalogChunks,
  catalogPointCount,
  exoplanetCatalogStatus,
  openNgcCatalogStatus,
  selectedObjectId,
  hoveredObjectId: _hoveredObjectId,
  focusedObjectId,
  focusRequestId,
  cancelFlightToken,
  navigationState,
  objectCount,
  cameraDistance: _cameraDistance,
  onSelectObject,
  onHoverObject,
  onViewportDistanceChange,
  onManualNavigation,
  onCameraFlightChange,
  timePlayback: _timePlayback,
  qualityTier,
  adaptiveQualityEnabled: _adaptiveQualityEnabled,
  onAdaptiveQualityDrop: _onAdaptiveQualityDrop,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const compatibilityCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<WgpuSkyRenderer | null>(null);
  const compatibilityCameraRef = useRef<CompatibilityCamera>({
    yaw: -0.38,
    pitch: -0.14,
    distance: 104,
    targetDistance: 104,
    focus: [0, 0, 0],
    targetFocus: [0, 0, 0],
  });
  const sceneRef = useRef<EngineScene | null>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; moved: number } | null>(null);
  const hoverFrameRef = useRef<number | null>(null);
  const focusTimerRef = useRef<number | null>(null);
  const [engineState, setEngineState] = useState<"loading" | "ready" | "fallback" | "error">("loading");
  const [backend, setBackend] = useState("Starting Rust/WASM renderer");
  const [engineError, setEngineError] = useState<string | null>(null);
  const [projectedLabels, setProjectedLabels] = useState<ProjectedLabel[]>([]);

  const scene = useMemo(
    () => buildEngineScene(renderables, catalogChunks, selectedObjectId, focusedObjectId, qualityTier),
    [catalogChunks, focusedObjectId, qualityTier, renderables, selectedObjectId],
  );
  const focusedEngineIndex = focusedObjectId ? scene.idToIndex.get(focusedObjectId) : undefined;
  const focusedEngineOffset = focusedEngineIndex === undefined ? undefined : focusedEngineIndex * STAR_FLOAT_STRIDE;
  const focusedEngineX = focusedEngineOffset === undefined ? undefined : scene.stars[focusedEngineOffset];
  const focusedEngineY = focusedEngineOffset === undefined ? undefined : scene.stars[focusedEngineOffset + 1];
  const focusedEngineZ = focusedEngineOffset === undefined ? undefined : scene.stars[focusedEngineOffset + 2];
  const focusedEngineLabel = focusedObjectId
    ? scene.labels.find((item) => item.id === focusedObjectId)?.label ?? "selected object"
    : "selected object";

  useEffect(() => {
    sceneRef.current = scene;
  }, [scene]);

  useEffect(() => {
    let cancelled = false;
    let frameId = 0;
    let lastTime = performance.now();
    let lastDistanceReport = 0;
    let labelFrame = 0;

    const start = async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      try {
        await ensureWasm();
        if (cancelled) return;
        const prefersWebGpu = Boolean((navigator as Navigator & { gpu?: unknown }).gpu);
        const renderer = await createRendererWithTimeout(canvas, prefersWebGpu, () => cancelled);
        if (cancelled) {
          renderer.free();
          return;
        }
        rendererRef.current = renderer;
        const activeScene = sceneRef.current;
        if (activeScene) {
          renderer.set_stars(activeScene.stars);
          renderer.set_lines(activeScene.lines);
        }
        const backendName = renderer.backend();
        const backendLabel = backendName === "BrowserWebGpu"
          ? "WebGPU · Rust/WASM"
          : "WebGL2 compatibility · Rust/WASM";
        setBackend(backendLabel);
        setEngineState("ready");
        const diagnosticsWindow = window as EngineDiagnosticsWindow;
        diagnosticsWindow.__SPACEVIEWER_WGPU__ = {
          backend: backendName,
          starCount: activeScene ? activeScene.stars.length / STAR_FLOAT_STRIDE : 0,
          lineVertexCount: activeScene ? activeScene.lines.length / LINE_FLOAT_STRIDE : 0,
          wasm: true,
          hierarchicalScale: "solar-au-stellar-ly-logarithmic-v1",
        };

        const draw = (time: number) => {
          if (cancelled || rendererRef.current !== renderer) return;
          const rect = canvas.getBoundingClientRect();
          const dpr = Math.min(window.devicePixelRatio || 1, qualityTier === "low" ? 1 : 2);
          renderer.resize(Math.max(1, Math.round(rect.width * dpr)), Math.max(1, Math.round(rect.height * dpr)));
          renderer.tick((time - lastTime) / 1_000);
          lastTime = time;
          renderer.render();
          if (time - lastDistanceReport > 180) {
            onViewportDistanceChange(renderer.camera_distance());
            lastDistanceReport = time;
          }
          labelFrame += 1;
          if (labelFrame % 8 === 0) {
            const currentScene = sceneRef.current;
            if (currentScene) {
              setProjectedLabels(currentScene.labels.map((label) => {
                const projected = renderer.project(label.index);
                return {
                  ...label,
                  x: projected[0] / dpr,
                  y: projected[1] / dpr,
                  visible: projected[2] === 1,
                };
              }));
            }
          }
          frameId = requestAnimationFrame(draw);
        };
        frameId = requestAnimationFrame(draw);
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        console.info("SpaceViewer wgpu compatibility preview enabled:", message);
        setBackend("Compatibility preview · hierarchical scale");
        setEngineError(null);
        setEngineState("fallback");
        const activeScene = sceneRef.current;
        (window as EngineDiagnosticsWindow).__SPACEVIEWER_WGPU__ = {
          backend: "Canvas2dCompatibilityPreview",
          starCount: activeScene ? activeScene.stars.length / STAR_FLOAT_STRIDE : 0,
          lineVertexCount: activeScene ? activeScene.lines.length / LINE_FLOAT_STRIDE : 0,
          wasm: true,
          hierarchicalScale: "solar-au-stellar-ly-logarithmic-v1",
        };
      }
    };

    void start();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      rendererRef.current?.free();
      rendererRef.current = null;
      delete (window as EngineDiagnosticsWindow).__SPACEVIEWER_WGPU__;
    };
  }, [onViewportDistanceChange, qualityTier]);

  useEffect(() => {
    if (engineState !== "fallback") return;
    const canvas = compatibilityCanvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      setEngineError("This browser could not create a compatible preview canvas.");
      setEngineState("error");
      return;
    }

    let frameId = 0;
    let lastTime = performance.now();
    let lastDistanceReport = 0;
    let labelFrame = 0;

    const draw = (time: number) => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, qualityTier === "low" ? 1 : 2);
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      const delta = clamp((time - lastTime) / 1_000, 0, 0.1);
      lastTime = time;
      const camera = compatibilityCameraRef.current;
      const response = 1 - Math.exp(-delta * 3.8);
      camera.distance += (camera.targetDistance - camera.distance) * response;
      camera.focus = camera.focus.map((value, index) => (
        value + (camera.targetFocus[index] - value) * response
      )) as [number, number, number];

      context.clearRect(0, 0, width, height);
      context.fillStyle = "#01040a";
      context.fillRect(0, 0, width, height);
      const halo = context.createRadialGradient(width * 0.48, height * 0.47, 0, width * 0.48, height * 0.47, width * 0.78);
      halo.addColorStop(0, "rgba(18, 31, 54, 0.34)");
      halo.addColorStop(0.42, "rgba(7, 15, 28, 0.18)");
      halo.addColorStop(1, "rgba(0, 1, 4, 0)");
      context.fillStyle = halo;
      context.fillRect(0, 0, width, height);
      context.save();
      context.translate(width * 0.5, height * 0.5);
      context.rotate(-0.1 - camera.yaw * 0.08);
      const band = context.createLinearGradient(0, -height * 0.24, 0, height * 0.24);
      band.addColorStop(0, "rgba(12, 24, 43, 0)");
      band.addColorStop(0.34, "rgba(38, 54, 82, 0.10)");
      band.addColorStop(0.48, "rgba(93, 91, 103, 0.15)");
      band.addColorStop(0.53, "rgba(26, 32, 48, 0.07)");
      band.addColorStop(0.7, "rgba(24, 42, 67, 0.10)");
      band.addColorStop(1, "rgba(8, 18, 34, 0)");
      context.fillStyle = band;
      context.fillRect(-width, -height * 0.26, width * 2, height * 0.52);
      context.restore();

      const activeScene = sceneRef.current;
      if (activeScene) {
        context.lineWidth = Math.max(1, dpr * 0.6);
        for (let index = 0; index < activeScene.lines.length; index += LINE_FLOAT_STRIDE * 2) {
          const first = projectCompatibilityPosition([
            activeScene.lines[index], activeScene.lines[index + 1], activeScene.lines[index + 2],
          ], camera, width, height);
          const secondOffset = index + LINE_FLOAT_STRIDE;
          const second = projectCompatibilityPosition([
            activeScene.lines[secondOffset], activeScene.lines[secondOffset + 1], activeScene.lines[secondOffset + 2],
          ], camera, width, height);
          if (!first || !second) continue;
          const red = Math.round(activeScene.lines[index + 4] * 255);
          const green = Math.round(activeScene.lines[index + 5] * 255);
          const blue = Math.round(activeScene.lines[index + 6] * 255);
          const alpha = clamp(activeScene.lines[index + 7] * 0.48, 0.025, 0.18);
          context.strokeStyle = `rgba(${red}, ${green}, ${blue}, ${alpha})`;
          context.beginPath();
          context.moveTo(first.x, first.y);
          context.lineTo(second.x, second.y);
          context.stroke();
        }

        const starCount = activeScene.stars.length / STAR_FLOAT_STRIDE;
        const contextCount = Math.max(0, starCount - activeScene.interactiveCount);
        const contextStride = Math.max(1, Math.ceil(contextCount / 7_500));
        const drawStar = (index: number) => {
          const offset = index * STAR_FLOAT_STRIDE;
          const projected = projectCompatibilityPosition([
            activeScene.stars[offset], activeScene.stars[offset + 1], activeScene.stars[offset + 2],
          ], camera, width, height);
          if (!projected) return;
          const magnitude = activeScene.stars[offset + 6];
          const size = activeScene.stars[offset + 7];
          const selected = activeScene.stars[offset + 8] > 0.5;
          const red = Math.round(activeScene.stars[offset + 3] * 255);
          const green = Math.round(activeScene.stars[offset + 4] * 255);
          const blue = Math.round(activeScene.stars[offset + 5] * 255);
          const intensity = clamp(0.3 + (7 - magnitude) * 0.11, 0.18, 1);
          const closeFocus = selected && camera.distance < 16;
          const radius = closeFocus
            ? (34 + (16 - camera.distance) * 3.2) * dpr
            : clamp((1.2 + Math.max(0, 5.5 - magnitude) * 0.42 + (selected ? 2.8 : 0)) * size * dpr, 1, 12 * dpr);

          if (closeFocus) {
            const glow = context.createRadialGradient(projected.x, projected.y, 0, projected.x, projected.y, radius * 1.8);
            glow.addColorStop(0, `rgba(${red}, ${green}, ${blue}, 1)`);
            glow.addColorStop(0.36, `rgba(${red}, ${green}, ${blue}, 0.94)`);
            glow.addColorStop(0.58, `rgba(${red}, ${green}, ${blue}, 0.24)`);
            glow.addColorStop(1, `rgba(${red}, ${green}, ${blue}, 0)`);
            context.fillStyle = glow;
            context.beginPath();
            context.arc(projected.x, projected.y, radius * 1.8, 0, Math.PI * 2);
            context.fill();
            return;
          }

          context.fillStyle = `rgba(${red}, ${green}, ${blue}, ${intensity})`;
          context.beginPath();
          context.arc(projected.x, projected.y, radius, 0, Math.PI * 2);
          context.fill();
          if (selected) {
            context.strokeStyle = "rgba(218, 237, 255, 0.58)";
            context.lineWidth = dpr;
            context.beginPath();
            context.arc(projected.x, projected.y, radius + 7 * dpr, 0, Math.PI * 2);
            context.stroke();
          }
        };

        for (let index = activeScene.interactiveCount; index < starCount; index += contextStride) drawStar(index);
        for (let index = 0; index < activeScene.interactiveCount; index += 1) drawStar(index);

        labelFrame += 1;
        if (labelFrame % 8 === 0) {
          setProjectedLabels(activeScene.labels.map((label) => {
            const offset = label.index * STAR_FLOAT_STRIDE;
            const projected = projectCompatibilityPosition([
              activeScene.stars[offset], activeScene.stars[offset + 1], activeScene.stars[offset + 2],
            ], camera, width, height);
            return {
              ...label,
              x: projected ? projected.x / dpr : 0,
              y: projected ? projected.y / dpr : 0,
              visible: Boolean(projected),
            };
          }));
        }
      }

      if (time - lastDistanceReport > 180) {
        onViewportDistanceChange(camera.distance);
        lastDistanceReport = time;
      }
      frameId = requestAnimationFrame(draw);
    };

    frameId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameId);
  }, [engineState, onViewportDistanceChange, qualityTier]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.set_stars(scene.stars);
    renderer.set_lines(scene.lines);
    const diagnostics = (window as EngineDiagnosticsWindow).__SPACEVIEWER_WGPU__;
    if (diagnostics) {
      diagnostics.starCount = scene.stars.length / STAR_FLOAT_STRIDE;
      diagnostics.lineVertexCount = scene.lines.length / LINE_FLOAT_STRIDE;
    }
  }, [scene]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!focusedObjectId) return;
    const index = focusedEngineIndex;
    if (index === undefined) return;
    const immediate = shouldReduceCameraFlightMotionInBrowser();
    if (renderer) {
      renderer.focus_star(index, immediate);
    } else if (engineState === "fallback") {
      if (focusedEngineX === undefined || focusedEngineY === undefined || focusedEngineZ === undefined) return;
      const camera = compatibilityCameraRef.current;
      camera.targetFocus = [focusedEngineX, focusedEngineY, focusedEngineZ];
      camera.targetDistance = 7.4;
      if (immediate) {
        camera.focus = [...camera.targetFocus];
        camera.distance = camera.targetDistance;
      }
    } else return;
    onCameraFlightChange(immediate ? null : createCameraFlightState("skymap", `Flying to ${focusedEngineLabel}`));
    if (focusTimerRef.current) window.clearTimeout(focusTimerRef.current);
    if (!immediate) {
      focusTimerRef.current = window.setTimeout(() => onCameraFlightChange(null), 1_550);
    }
  }, [
    engineState,
    focusRequestId,
    focusedEngineIndex,
    focusedEngineLabel,
    focusedEngineX,
    focusedEngineY,
    focusedEngineZ,
    focusedObjectId,
    onCameraFlightChange,
  ]);

  useEffect(() => {
    if (navigationState.resetRequestId === 0) return;
    const immediate = shouldReduceCameraFlightMotionInBrowser();
    rendererRef.current?.reset(immediate);
    const camera = compatibilityCameraRef.current;
    camera.targetFocus = [0, 0, 0];
    camera.targetDistance = 104;
    if (immediate) {
      camera.focus = [0, 0, 0];
      camera.distance = 104;
    }
    onCameraFlightChange(immediate ? null : createCameraFlightState("skymap", "Returning to the Solar neighbourhood"));
    if (focusTimerRef.current) window.clearTimeout(focusTimerRef.current);
    if (!immediate) focusTimerRef.current = window.setTimeout(() => onCameraFlightChange(null), 1_350);
  }, [navigationState.resetRequestId, onCameraFlightChange]);

  useEffect(() => {
    if (cancelFlightToken === 0) return;
    rendererRef.current?.cancel_transition();
    const camera = compatibilityCameraRef.current;
    camera.targetFocus = [...camera.focus];
    camera.targetDistance = camera.distance;
    onCameraFlightChange(null);
  }, [cancelFlightToken, onCameraFlightChange]);

  useEffect(() => () => {
    if (focusTimerRef.current) window.clearTimeout(focusTimerRef.current);
    if (hoverFrameRef.current) cancelAnimationFrame(hoverFrameRef.current);
  }, []);

  const pickAt = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / Math.max(rect.width, 1);
    const scaleY = canvas.height / Math.max(rect.height, 1);
    if (renderer) {
      const index = renderer.pick((clientX - rect.left) * scaleX, (clientY - rect.top) * scaleY, sceneRef.current?.interactiveCount ?? 0);
      return index >= 0 ? sceneRef.current?.ids[index] ?? null : null;
    }
    const activeScene = sceneRef.current;
    const compatibilityCanvas = compatibilityCanvasRef.current;
    if (!activeScene || !compatibilityCanvas || engineState !== "fallback") return null;
    const x = (clientX - rect.left) * (compatibilityCanvas.width / Math.max(rect.width, 1));
    const y = (clientY - rect.top) * (compatibilityCanvas.height / Math.max(rect.height, 1));
    let bestIndex = -1;
    let bestDistance = 18 * (compatibilityCanvas.width / Math.max(rect.width, 1));
    for (let index = 0; index < activeScene.interactiveCount; index += 1) {
      const offset = index * STAR_FLOAT_STRIDE;
      const projected = projectCompatibilityPosition([
        activeScene.stars[offset], activeScene.stars[offset + 1], activeScene.stars[offset + 2],
      ], compatibilityCameraRef.current, compatibilityCanvas.width, compatibilityCanvas.height);
      if (!projected) continue;
      const distance = Math.hypot(projected.x - x, projected.y - y);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }
    return bestIndex >= 0 ? activeScene.ids[bestIndex] ?? null : null;
  }, [engineState]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: 0 };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (drag?.pointerId === event.pointerId) {
      const deltaX = event.clientX - drag.x;
      const deltaY = event.clientY - drag.y;
      drag.x = event.clientX;
      drag.y = event.clientY;
      drag.moved += Math.hypot(deltaX, deltaY);
      if (drag.moved > 2) {
        rendererRef.current?.orbit(deltaX, deltaY);
        rendererRef.current?.cancel_transition();
        const camera = compatibilityCameraRef.current;
        camera.yaw -= deltaX * 0.0042;
        camera.pitch = clamp(camera.pitch - deltaY * 0.0038, -1.36, 1.36);
        camera.targetFocus = [...camera.focus];
        camera.targetDistance = camera.distance;
        onManualNavigation();
      }
      return;
    }
    if (hoverFrameRef.current) return;
    const { clientX, clientY } = event;
    hoverFrameRef.current = requestAnimationFrame(() => {
      hoverFrameRef.current = null;
      onHoverObject(pickAt(clientX, clientY));
    });
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (drag.moved < 5) onSelectObject(pickAt(event.clientX, event.clientY));
  };

  const handleWheel = (event: ReactWheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    rendererRef.current?.zoom(event.deltaY);
    const camera = compatibilityCameraRef.current;
    camera.targetDistance = clamp(camera.targetDistance * Math.exp(event.deltaY * 0.0013), 3.8, 240);
    onManualNavigation();
  };

  const scaleBand = getSkyMapScaleBandDefinition(navigationState.scaleBand);

  return (
    <div className="skymap-viewport skymap-viewport--wgpu" aria-label="SkyMap universe viewport">
      <canvas
        ref={canvasRef}
        className={`skymap-viewport__canvas skymap-wgpu-canvas${engineState === "fallback" ? " is-suspended" : ""}`}
        aria-label="Interactive hierarchical universe rendered by Rust and wgpu"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => { dragRef.current = null; }}
        onPointerLeave={() => onHoverObject(null)}
        onWheel={handleWheel}
      />
      <canvas
        ref={compatibilityCanvasRef}
        className={`skymap-viewport__canvas skymap-wgpu-compatibility-canvas${engineState === "fallback" ? " is-active" : ""}`}
        aria-hidden="true"
      />

      <div className="skymap-wgpu-label-layer" aria-hidden="true">
        {projectedLabels.filter((label) => label.visible).map((label) => (
          <span
            key={label.id}
            className={`skymap-wgpu-label${label.selected ? " is-selected" : ""}`}
            style={{ transform: `translate3d(${label.x}px, ${label.y}px, 0)` }}
          >
            {label.label}
          </span>
        ))}
      </div>

      <div className="skymap-wgpu-engine-badge" data-engine-status={engineState}>
        <span>{engineState === "error" ? "Renderer unavailable" : backend}</span>
        <strong>{scaleBand.shortLabel} · {formatSkyMapNavigationMode(navigationState.mode)}</strong>
      </div>

      <div className="skymap-wgpu-zoom" aria-label="Universe zoom controls">
        <button type="button" aria-label="Zoom in" onClick={() => {
          rendererRef.current?.zoom(-180);
          const camera = compatibilityCameraRef.current;
          camera.targetDistance = clamp(camera.targetDistance * Math.exp(-180 * 0.0013), 3.8, 240);
        }}>+</button>
        <button type="button" aria-label="Zoom out" onClick={() => {
          rendererRef.current?.zoom(180);
          const camera = compatibilityCameraRef.current;
          camera.targetDistance = clamp(camera.targetDistance * Math.exp(180 * 0.0013), 3.8, 240);
        }}>−</button>
      </div>

      {engineState === "loading" ? (
        <div className="skymap-wgpu-loading" role="status">Compiling the universe renderer…</div>
      ) : null}
      {engineError ? (
        <div className="skymap-wgpu-error" role="alert">
          <strong>Rust/WASM renderer could not start</strong>
          <span>{engineError}</span>
        </div>
      ) : null}

      <div className="skymap-wgpu-accessibility-status" aria-live="polite">
        <span>{objectCount.toLocaleString()} navigable objects</span>
        <span>{catalogPointCount.toLocaleString()} Gaia catalogue stars</span>
        <span>{exoplanetCatalogStatus.totalSystemCount.toLocaleString()} exoplanet systems</span>
        <span>{openNgcCatalogStatus.totalObjectCount.toLocaleString()} OpenNGC records held outside the base scale scene</span>
      </div>
    </div>
  );
};

export default WebGpuSkyMapViewport;
