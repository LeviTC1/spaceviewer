import { Suspense, useEffect, useMemo, useRef, useState, type CSSProperties, type FC, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls, useTexture } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  NoBlending,
  NormalBlending,
  RepeatWrapping,
  SRGBColorSpace,
  ShaderMaterial,
  Vector2,
  Vector3,
  type Group,
  type Mesh,
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import type { DecodedStarCatalogChunk } from "../../lib/catalog/starCatalogTypes";
import type { AdaptiveQualityReport } from "../../lib/rendering/adaptiveQuality";
import { ASTRO_QUALITY_PROFILES, type AstroQualityTier } from "../../lib/rendering/qualityManager";
import { useRenderActivity } from "../../lib/rendering/useRenderActivity";
import {
  createCameraFlightState,
  shouldReduceCameraFlightMotionInBrowser,
  type CameraFlightState,
} from "../../domain/astro/cameraFlight";
import type { SkyObjectId } from "./core/objects";
import type { SkyMapNavigationState } from "./core/navigation";
import {
  isSkyLineRenderable,
  isSkyMeshRenderable,
  isSkyPointRenderable,
  isSkyStructureRenderable,
  type SkyRenderable,
} from "./core/renderers";
import type { SceneVector3 } from "./core/coordinates";
import type { SkyMapPlaybackState } from "./core/time";
import { SOLAR_SCENE_UNITS_PER_AU } from "./layers/solarSystemLayer";
import { INTERSTELLAR_PROBES_LAYER_ID } from "./layers/interstellarProbesLayer";
import {
  LOCAL_GROUP_GALAXIES_LAYER_ID,
  LOCAL_GROUP_PRIMARY_GALAXY_IDS,
  LOCAL_GROUP_VISUAL_GALAXY_IDS,
} from "./layers/localGroupLayer";
import { AU_PER_LIGHT_YEAR, compressAstronomicalPosition } from "./rendering/hierarchicalScale";
import {
  MAX_CONTINUOUS_CAMERA_DISTANCE,
  MIN_CONTINUOUS_CAMERA_DISTANCE,
  SOLAR_OVERVIEW_SUN_RADIUS,
  SOLAR_SYSTEM_REVEAL_DISTANCE,
  getContinuousScaleProgress,
  getContinuousScaleStage,
  getSolarOverviewRadius,
} from "./rendering/continuousScale";
import PlanetMesh from "../solar/PlanetMesh";
import MoonMesh from "../solar/MoonMesh";
import { MOONS } from "../solar/moonData";
import { PLANETS, type PlanetId } from "../solar/solarData";
import { SkyMapStructures } from "./SkyMapViewport";

interface GalaxiumSkyMapViewportProps {
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

type DisplayObjectKind = "star" | "sun" | "planet" | "moon" | "exoplanet" | "spacecraft" | "galaxy" | "nebula" | "cluster" | "black-hole";
type Tuple3 = [number, number, number];

interface DisplayObject {
  id: SkyObjectId;
  layerId: string;
  label: string;
  position: Tuple3;
  color: Tuple3;
  magnitude: number;
  size: number;
  priority: number;
  kind: DisplayObjectKind;
  rotation?: Tuple3;
}

interface SceneModel {
  cataloguePositions: Float32Array;
  catalogueColors: Float32Array;
  catalogueSizes: Float32Array;
  markerPositions: Float32Array;
  markerColors: Float32Array;
  markerSizes: Float32Array;
  orbitPositions: Float32Array;
  orbitColors: Float32Array;
  objects: DisplayObject[];
  labels: DisplayObject[];
  byId: Map<SkyObjectId, DisplayObject>;
}

const LOCAL_SCENE_UNITS_PER_LIGHT_YEAR = 0.8;
const SOLAR_OVERVIEW_UNITS_PER_AU = 4;
const SOLAR_OVERVIEW_ORIENTATION_RADIANS = Math.PI / 6;
const SOLAR_OVERVIEW_ORIENTATION_COSINE = Math.cos(SOLAR_OVERVIEW_ORIENTATION_RADIANS);
const SOLAR_OVERVIEW_ORIENTATION_SINE = Math.sin(SOLAR_OVERVIEW_ORIENTATION_RADIANS);
const SOLAR_OVERVIEW_COMPRESSION_START_AU = 5.2;
const SOLAR_OVERVIEW_COMPRESSION_RATE = 0.02;
const SOLAR_ORBIT_COMPRESSION_RATE = 0.018;
const INTERSTELLAR_PROBE_COMPRESSION_RATE = 0.065;
const MAX_SCENE_MARKERS = 96;
const MAX_LABELS = 8;
const DEFAULT_CAMERA = new Vector3(0, 23, 49);
const DEFAULT_TARGET = new Vector3(0, 0, 0);
const IMPORTANT_LABELS = new Set([
  "Sun",
  "Venus",
  "Mars",
  "Pluto",
  "Voyager 1",
  "Voyager 2",
]);

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

const getSkyBackdropBrightness = (distance: number) => {
  if (distance < 14) return 0.68;
  if (distance < 96) return 0.56;
  if (distance < 170) return 0.4;
  if (distance < 240) return 0.075;
  if (distance < 310) return 0.008;
  return 0;
};

const parseColor = (value: string | undefined, fallback: Tuple3): Tuple3 => {
  if (!value?.startsWith("#")) return fallback;
  const color = new Color(value);
  return [color.r, color.g, color.b];
};

const temperatureToColor = (temperatureK: number): Tuple3 => {
  if (!Number.isFinite(temperatureK) || temperatureK <= 0) return [0.72, 0.82, 1];
  const ratio = clamp((temperatureK - 2_400) / 10_000, 0, 1);
  return [1 - ratio * 0.28, 0.59 + ratio * 0.35, 0.39 + ratio * 0.61];
};

const toLightYears = (position: SceneVector3, layerId: string): Tuple3 | null => {
  if (position.sourceFrame === "heliocentric-ecliptic" || layerId === "solar.system-bodies") {
    const scale = SOLAR_SCENE_UNITS_PER_AU * AU_PER_LIGHT_YEAR;
    return [position.x / scale, position.y / scale, position.z / scale];
  }
  if (position.sourceFrame === "heliocentric-icrs-cartesian" || position.sourceFrame === "local-interstellar-cartesian") {
    return [
      position.x / LOCAL_SCENE_UNITS_PER_LIGHT_YEAR,
      position.y / LOCAL_SCENE_UNITS_PER_LIGHT_YEAR,
      position.z / LOCAL_SCENE_UNITS_PER_LIGHT_YEAR,
    ];
  }
  return null;
};

const toSolarDisplayPosition = (position: SceneVector3, compressionRate: number): Tuple3 => {
  const physicalRadiusAu = Math.hypot(position.x, position.y, position.z) / SOLAR_SCENE_UNITS_PER_AU;
  const compression = physicalRadiusAu <= SOLAR_OVERVIEW_COMPRESSION_START_AU
    ? 1
    : 1 / (1 + (physicalRadiusAu - SOLAR_OVERVIEW_COMPRESSION_START_AU) * compressionRate);
  const scale = (SOLAR_OVERVIEW_UNITS_PER_AU / SOLAR_SCENE_UNITS_PER_AU) * compression;
  const x = -position.x * scale;
  const z = position.z * scale;
  return [
    x * SOLAR_OVERVIEW_ORIENTATION_COSINE + z * SOLAR_OVERVIEW_ORIENTATION_SINE,
    position.y * scale,
    -x * SOLAR_OVERVIEW_ORIENTATION_SINE + z * SOLAR_OVERVIEW_ORIENTATION_COSINE,
  ];
};

const toDisplayPosition = (position: SceneVector3, layerId: string): Tuple3 | null => {
  if (layerId === INTERSTELLAR_PROBES_LAYER_ID) {
    return toSolarDisplayPosition(position, INTERSTELLAR_PROBE_COMPRESSION_RATE);
  }
  if (layerId === "solar.system-bodies") {
    return toSolarDisplayPosition(position, SOLAR_OVERVIEW_COMPRESSION_RATE);
  }
  const physicalPosition = toLightYears(position, layerId);
  if (physicalPosition) return compressAstronomicalPosition(physicalPosition);
  const radius = Math.hypot(position.x, position.y, position.z);
  if (!Number.isFinite(radius) || radius <= 1e-9) return [0, 0, 0];
  const scale = radius > 240 ? 240 / radius : 1;
  return [position.x * scale, position.y * scale, position.z * scale];
};

const inferObjectKind = (
  renderable: Extract<SkyRenderable, { kind: "point" | "mesh" }>,
): DisplayObjectKind => {
  const { objectId, layerId } = renderable;
  if (objectId === "solar:sun" || objectId.endsWith(":sun")) return "sun";
  if (objectId.includes("black-hole") || objectId.includes("sagittarius-a")) return "black-hole";
  if (objectId.startsWith("solar:moon:")) return "moon";
  if (objectId.startsWith("spacecraft:") || layerId === INTERSTELLAR_PROBES_LAYER_ID) return "spacecraft";
  if (objectId.startsWith("exoplanet-system:") || layerId.includes("exoplanet")) return "exoplanet";
  if (renderable.kind === "mesh") {
    if (renderable.meshMetadata?.family === "galaxy") return "galaxy";
    if (renderable.meshMetadata?.family === "nebula") return "nebula";
    if (renderable.meshMetadata?.family === "cluster") return "cluster";
  }
  if (layerId.includes("galax")) return "galaxy";
  if (layerId.includes("nebula")) return "nebula";
  if (layerId.includes("cluster")) return "cluster";
  if (layerId === "solar.system-bodies") return "planet";
  return "star";
};

const buildSceneModel = (
  renderables: SkyRenderable[],
  catalogChunks: DecodedStarCatalogChunk[],
  selectedObjectId: SkyObjectId | null,
  qualityTier: AstroQualityTier,
): SceneModel => {
  const byId = new Map<SkyObjectId, DisplayObject>();

  for (const renderable of renderables) {
    if (!isSkyPointRenderable(renderable) && !isSkyMeshRenderable(renderable)) continue;
    if ((renderable.objectId.startsWith("solar:moon:") && renderable.objectId !== selectedObjectId) || byId.has(renderable.objectId)) continue;
    const displayPosition = toDisplayPosition(renderable.position, renderable.layerId);
    if (!displayPosition) continue;
    const kind = inferObjectKind(renderable);
    const isPoint = isSkyPointRenderable(renderable);
    const magnitude = isPoint ? renderable.pointMetadata?.apparentMagnitude ?? 6 : kind === "sun" ? -26.7 : 2.5;
    const temperature = isPoint ? renderable.pointMetadata?.temperatureK : undefined;
    const fallback = temperature
      ? temperatureToColor(temperature)
      : kind === "sun"
        ? [1, 0.71, 0.32] as Tuple3
        : kind === "spacecraft"
          ? [0.56, 0.91, 1] as Tuple3
          : kind === "planet" || kind === "moon" || kind === "exoplanet"
          ? [0.72, 0.78, 0.86] as Tuple3
          : [0.7, 0.82, 1] as Tuple3;
    const label = isPoint ? renderable.label : renderable.label ?? renderable.objectId;
    const object: DisplayObject = {
      id: renderable.objectId,
      layerId: renderable.layerId,
      label,
      position: displayPosition,
      color: parseColor(renderable.color, fallback),
      magnitude,
      size: kind === "sun" ? 4.8 : kind === "spacecraft" ? 4.6 : kind === "planet" || kind === "moon" || kind === "exoplanet" ? 2.6 : clamp(6.4 - magnitude * 0.34, 1.7, 5.6),
      priority:
        (renderable.objectId === selectedObjectId ? 50_000 : 0) +
        (IMPORTANT_LABELS.has(label) ? 8_000 : 0) +
        (renderable.importanceScore ?? 0) * 20 -
        magnitude,
      kind,
      rotation: isSkyMeshRenderable(renderable) ? renderable.meshMetadata?.rotation : undefined,
    };
    byId.set(object.id, object);
  }

  const objects = [...byId.values()].sort((left, right) => right.priority - left.priority).slice(0, MAX_SCENE_MARKERS);
  const markerPositions = new Float32Array(objects.length * 3);
  const markerColors = new Float32Array(objects.length * 3);
  const markerSizes = new Float32Array(objects.length);
  objects.forEach((object, index) => {
    markerPositions.set(object.position, index * 3);
    markerColors.set(object.color, index * 3);
    markerSizes[index] = object.size + (object.id === selectedObjectId ? 3.8 : 0);
  });

  const catalogueBudget = qualityTier === "low" ? 120 : qualityTier === "high" ? 480 : 260;
  const cataloguePositions: number[] = [];
  const catalogueColors: number[] = [];
  const catalogueSizes: number[] = [];
  let remaining = catalogueBudget;
  for (const chunk of catalogChunks) {
    if (remaining <= 0) break;
    const step = Math.max(1, Math.ceil(chunk.recordCount / remaining));
    const renderPositions = chunk.renderPositions.length === chunk.recordCount * 3 ? chunk.renderPositions : null;
    for (let index = 0; index < chunk.recordCount && remaining > 0; index += step) {
      const offset = index * 3;
      const position = compressAstronomicalPosition([
        renderPositions ? renderPositions[offset] : chunk.columns.x[index],
        renderPositions ? renderPositions[offset + 1] : chunk.columns.y[index],
        renderPositions ? renderPositions[offset + 2] : chunk.columns.z[index],
      ]);
      const color = temperatureToColor(chunk.columns.temperatureK[index]);
      const magnitude = Number.isFinite(chunk.columns.apparentMagnitudeG[index])
        ? chunk.columns.apparentMagnitudeG[index]
        : 8;
      cataloguePositions.push(...position);
      catalogueColors.push(...color);
      catalogueSizes.push(clamp(2.4 - magnitude * 0.22, 0.18, 1.55));
      remaining -= 1;
    }
  }

  const orbitPositions: number[] = [];
  const orbitColors: number[] = [];
  for (const renderable of renderables) {
    if (!isSkyLineRenderable(renderable) || !["solar.system-bodies", INTERSTELLAR_PROBES_LAYER_ID].includes(renderable.layerId)) continue;
    const color = parseColor(renderable.color, [0.67, 0.72, 0.82]);
    const compressionRate = renderable.layerId === INTERSTELLAR_PROBES_LAYER_ID
      ? INTERSTELLAR_PROBE_COMPRESSION_RATE
      : SOLAR_ORBIT_COMPRESSION_RATE;
    for (const path of renderable.paths) {
      for (let index = 0; index < path.length - 1; index += 1) {
        const start = toSolarDisplayPosition(path[index], compressionRate);
        const end = toSolarDisplayPosition(path[index + 1], compressionRate);
        if (!start || !end) continue;
        orbitPositions.push(...start, ...end);
        orbitColors.push(...color, ...color);
      }
    }
  }

  const labelIds = new Set<SkyObjectId>();
  const labelNames = new Set<string>();
  const overviewLabels = objects.filter((object) => {
    if (labelIds.has(object.id) || labelNames.has(object.label) || object.label.startsWith("Gaia DR3")) return false;
    if (object.id !== selectedObjectId && !IMPORTANT_LABELS.has(object.label)) return false;
    labelIds.add(object.id);
    labelNames.add(object.label);
    return true;
  }).slice(0, MAX_LABELS);
  const labels = selectedObjectId
    ? overviewLabels.filter((object) => object.id === selectedObjectId || object.kind === "sun").slice(0, 3)
    : overviewLabels;

  return {
    cataloguePositions: new Float32Array(cataloguePositions),
    catalogueColors: new Float32Array(catalogueColors),
    catalogueSizes: new Float32Array(catalogueSizes),
    markerPositions,
    markerColors,
    markerSizes,
    orbitPositions: new Float32Array(orbitPositions),
    orbitColors: new Float32Array(orbitColors),
    objects,
    labels,
    byId,
  };
};

const SKY_VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT_SHADER = `
  precision highp float;
  uniform sampler2D uSkyMap;
  uniform float uBrightness;
  varying vec2 vUv;

  void main() {
    vec3 source = texture2D(uSkyMap, vUv).rgb;
    source = pow(max(source, vec3(0.0)), vec3(2.15)) * uBrightness;
    float luminance = dot(source, vec3(0.2126, 0.7152, 0.0722));
    vec3 silver = vec3(luminance * 0.91, luminance * 0.95, luminance);
    vec3 warm = vec3(luminance * 1.08, luminance * 0.96, luminance * 0.84);
    float warmMix = smoothstep(0.16, 0.7, luminance);
    vec3 color = mix(silver, warm, warmMix * 0.58);
    color = mix(color, source, 0.68);
    gl_FragColor = vec4(color, 1.0);
  }
`;

const STAR_VERTEX_SHADER = `
  attribute float aSize;
  varying vec3 vColor;
  varying float vBrightness;
  uniform float uPixelRatio;

  void main() {
    vColor = color;
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    float perspective = clamp(86.0 / max(10.0, -viewPosition.z), 0.58, 2.5);
    gl_PointSize = clamp(aSize * perspective * uPixelRatio, 1.0, 8.5);
    vBrightness = clamp(aSize / 4.0, 0.25, 1.25);
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const STAR_FRAGMENT_SHADER = `
  precision highp float;
  varying vec3 vColor;
  varying float vBrightness;

  void main() {
    vec2 point = gl_PointCoord - 0.5;
    float radius = length(point);
    if (radius > 0.5) discard;
    float core = smoothstep(0.19, 0.0, radius);
    float halo = pow(max(0.0, 1.0 - radius * 2.0), 3.2);
    float spikeX = pow(max(0.0, 1.0 - abs(point.x) * 34.0), 5.0) * (1.0 - radius * 2.0);
    float spikeY = pow(max(0.0, 1.0 - abs(point.y) * 34.0), 5.0) * (1.0 - radius * 2.0);
    float alpha = clamp(core + halo * 0.48 + (spikeX + spikeY) * 0.12, 0.0, 1.0);
    vec3 light = vColor * (0.62 + halo * 0.8 + core * 3.3) * (0.66 + vBrightness * 0.68);
    gl_FragColor = vec4(light, alpha);
  }
`;

const ORBIT_VERTEX_SHADER = `
  varying vec3 vColor;
  void main() {
    vColor = color;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ORBIT_FRAGMENT_SHADER = `
  precision highp float;
  varying vec3 vColor;
  void main() {
    gl_FragColor = vec4(pow(vColor, vec3(0.82)) * 1.7, 0.72);
  }
`;

const SURFACE_VERTEX_SHADER = `
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SURFACE_FRAGMENT_SHADER = `
  precision highp float;
  uniform float uTime;
  uniform vec3 uColor;
  varying vec3 vNormal;
  varying vec3 vPosition;
  float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  void main() {
    vec3 p = normalize(vPosition) * 17.0;
    float granulation = hash(floor(p + vec3(uTime * 0.15, 0.0, uTime * 0.07)));
    float bands = sin((p.y + sin(p.x * 0.72 + uTime * 0.12)) * 3.1) * 0.5 + 0.5;
    float fresnel = pow(1.0 - abs(vNormal.z), 2.6);
    vec3 surface = uColor * (2.1 + granulation * 1.15 + bands * 0.45);
    surface += vec3(1.0, 0.94, 0.82) * (1.0 - fresnel) * 1.3;
    gl_FragColor = vec4(surface, 1.0);
  }
`;

const createGlowTexture = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.16, "rgba(255,255,255,0.92)");
    gradient.addColorStop(0.38, "rgba(190,220,255,0.28)");
    gradient.addColorStop(0.7, "rgba(98,155,255,0.07)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 256, 256);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
};

const StarCloud: FC<{
  positions: Float32Array;
  colors: Float32Array;
  sizes: Float32Array;
  renderOrder?: number;
  onSelectIndex?: (index: number) => void;
  onHoverIndex?: (index: number | null) => void;
}> = ({ positions, colors, sizes, renderOrder = 0, onSelectIndex, onHoverIndex }) => {
  const geometry = useMemo(() => {
    const next = new BufferGeometry();
    next.setAttribute("position", new Float32BufferAttribute(positions, 3));
    next.setAttribute("color", new Float32BufferAttribute(colors, 3));
    next.setAttribute("aSize", new Float32BufferAttribute(sizes, 1));
    next.computeBoundingSphere();
    return next;
  }, [colors, positions, sizes]);
  const material = useMemo(() => new ShaderMaterial({
    vertexShader: STAR_VERTEX_SHADER,
    fragmentShader: STAR_FRAGMENT_SHADER,
    uniforms: { uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) } },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    vertexColors: true,
    blending: AdditiveBlending,
    toneMapped: false,
  }), []);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  const getIndex = (event: { index?: number; intersections: Array<{ index?: number }> }) => {
    const candidate = event.index ?? event.intersections[0]?.index;
    return typeof candidate === "number" ? candidate : null;
  };

  return (
    <points
      geometry={geometry}
      material={material}
      renderOrder={renderOrder}
      frustumCulled={false}
      onClick={onSelectIndex ? (event) => {
        event.stopPropagation();
        const index = getIndex(event);
        if (index !== null) onSelectIndex(index);
      } : undefined}
      onPointerMove={onHoverIndex ? (event) => {
        const index = getIndex(event);
        onHoverIndex(index);
      } : undefined}
      onPointerOut={onHoverIndex ? () => onHoverIndex(null) : undefined}
    />
  );
};

const SkyBackdrop: FC<{ brightness: number }> = ({ brightness }) => {
  const meshRef = useRef<Mesh | null>(null);
  const materialRef = useRef<ShaderMaterial | null>(null);
  const sourceMap = useTexture("/assets/sky/gaia-edr3-all-sky.jpg");
  const skyMap = useMemo(() => {
    const texture = sourceMap.clone();
    texture.colorSpace = SRGBColorSpace;
    texture.wrapS = RepeatWrapping;
    texture.needsUpdate = true;
    return texture;
  }, [sourceMap]);
  const uniforms = useMemo(() => ({
    uSkyMap: { value: skyMap },
    uBrightness: { value: 1 },
  }), [skyMap]);
  useEffect(() => () => skyMap.dispose(), [skyMap]);
  useFrame(({ camera }) => {
    meshRef.current?.position.copy(camera.position);
    if (materialRef.current) materialRef.current.uniforms.uBrightness.value = brightness;
  });
  return (
    <mesh ref={meshRef} rotation={[0.3, -0.3, -1]} renderOrder={-100}>
      <sphereGeometry args={[420, 96, 64]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={SKY_VERTEX_SHADER}
        fragmentShader={SKY_FRAGMENT_SHADER}
        uniforms={uniforms}
        side={BackSide}
        depthWrite={false}
        depthTest={false}
        blending={NoBlending}
        toneMapped={false}
      />
    </mesh>
  );
};

const OrbitField: FC<{ positions: Float32Array; colors: Float32Array }> = ({ positions, colors }) => {
  const geometry = useMemo(() => {
    const next = new BufferGeometry();
    next.setAttribute("position", new Float32BufferAttribute(positions, 3));
    next.setAttribute("color", new Float32BufferAttribute(colors, 3));
    return next;
  }, [colors, positions]);
  const material = useMemo(() => new ShaderMaterial({
    vertexShader: ORBIT_VERTEX_SHADER,
    fragmentShader: ORBIT_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    vertexColors: true,
    blending: AdditiveBlending,
    toneMapped: false,
  }), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  return (
    <lineSegments geometry={geometry} material={material} frustumCulled={false} renderOrder={2} />
  );
};

const hashSeed = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const createRandom = (seed: number) => {
  let state = seed || 1;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
};

interface FocusParticleField {
  positions: Float32Array;
  colors: Float32Array;
  sizes: Float32Array;
}

const buildGalaxyParticles = (seedKey: string, tint: Tuple3): FocusParticleField => {
  const count = 14_000;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const random = createRandom(hashSeed(seedKey));
  for (let index = 0; index < count; index += 1) {
    const radius = Math.pow(random(), 0.72) * 3.7;
    const progress = radius / 3.7;
    const arm = index % 3;
    const diskStar = random() < 0.42;
    const armJitter = (random() + random() + random() - 1.5) * (0.58 + radius * 0.18);
    const angle = diskStar
      ? random() * Math.PI * 2
      : arm * ((Math.PI * 2) / 3) + radius * 1.52 + armJitter;
    const flatten = (1 - progress) * 0.34 + 0.055;
    const radialJitter = (random() - 0.5) * (diskStar ? 0.38 : 0.18);
    const scatteredRadius = Math.max(0, radius + radialJitter);
    positions.set([
      Math.cos(angle) * scatteredRadius + (random() - 0.5) * 0.08,
      (random() - 0.5) * flatten,
      Math.sin(angle) * scatteredRadius + (random() - 0.5) * 0.08,
    ], index * 3);
    const dust = diskStar ? 0.72 : 1;
    colors.set([
      (0.96 * (1 - progress) + tint[0] * progress) * dust,
      (0.7 * (1 - progress) + tint[1] * progress) * dust,
      (0.38 * (1 - progress) + tint[2] * progress) * dust,
    ], index * 3);
    sizes[index] = 0.1 + (1 - progress) * 0.92 + random() * 0.34;
  }
  return { positions, colors, sizes };
};

type GalaxyTextureMorphology = "spiral" | "irregular" | "dwarf";

const createGalaxyDiskTexture = (seedKey: string, morphology: GalaxyTextureMorphology = "spiral") => {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (context) {
    const random = createRandom(hashSeed(`${seedKey}:${morphology}`));
    const center = canvas.width / 2;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.globalCompositeOperation = "lighter";
    const core = context.createRadialGradient(center, center, 0, center, center, center * 0.88);
    core.addColorStop(0, morphology === "irregular" ? "rgba(205,232,255,0.58)" : "rgba(255,229,174,0.72)");
    core.addColorStop(0.08, morphology === "dwarf" ? "rgba(239,207,166,0.31)" : "rgba(255,188,102,0.35)");
    core.addColorStop(0.28, morphology === "irregular" ? "rgba(102,192,239,0.12)" : "rgba(145,169,213,0.09)");
    core.addColorStop(1, "rgba(29,49,82,0)");
    context.fillStyle = core;
    context.fillRect(0, 0, canvas.width, canvas.height);

    const starCount = morphology === "spiral" ? 8_500 : morphology === "irregular" ? 6_600 : 5_400;
    for (let index = 0; index < starCount; index += 1) {
      const radius = Math.pow(random(), 0.74) * center * 0.87;
      const progress = radius / (center * 0.87);
      const arm = index % 3;
      const isDisk = random() < 0.38;
      const jitter = (random() + random() + random() - 1.5) * (0.48 + progress * 1.12);
      const angle = morphology === "spiral" && !isDisk
        ? arm * ((Math.PI * 2) / 3) + progress * 5.55 + jitter
        : random() * Math.PI * 2;
      const irregularWave = morphology === "irregular" ? Math.sin(angle * 2.4 + progress * 5.2) * center * 0.11 : 0;
      const flatten = morphology === "dwarf" ? 0.68 : morphology === "irregular" ? 0.78 : 1;
      const x = center + Math.cos(angle) * radius + irregularWave;
      const y = center + Math.sin(angle) * radius * flatten + (morphology === "irregular" ? (random() - 0.5) * center * 0.16 : 0);
      const warmth = 1 - progress;
      const alpha = morphology === "dwarf"
        ? 0.018 + warmth * 0.075
        : (isDisk ? 0.018 : 0.035) + warmth * (isDisk ? 0.06 : 0.15);
      const red = Math.round(164 + warmth * 91);
      const green = Math.round((morphology === "irregular" ? 201 : 187) + warmth * 42);
      const blue = Math.round((morphology === "irregular" ? 246 : 222) - warmth * 45);
      const size = 0.22 + random() * 0.8 + warmth * 0.92;
      context.fillStyle = `rgba(${red},${green},${blue},${alpha})`;
      context.beginPath();
      context.arc(x, y, size, 0, Math.PI * 2);
      context.fill();
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
};

const buildNebulaParticles = (seedKey: string, tint: Tuple3): FocusParticleField => {
  const count = 3_600;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const random = createRandom(hashSeed(seedKey));
  for (let index = 0; index < count; index += 1) {
    const radius = Math.pow(random(), 0.78) * 3.1;
    const angle = random() * Math.PI * 2;
    const plume = Math.sin(angle * 3 + radius * 1.6) * 0.44;
    positions.set([
      Math.cos(angle) * radius * 1.18 + plume,
      (random() - 0.5) * (1.6 - radius * 0.22),
      Math.sin(angle) * radius * 0.72 + (random() - 0.5) * 0.42,
    ], index * 3);
    const magentaMix = 0.5 + Math.sin(angle * 2.4) * 0.5;
    colors.set([
      tint[0] * (1 - magentaMix) + 0.95 * magentaMix,
      tint[1] * (1 - magentaMix) + 0.34 * magentaMix,
      tint[2] * (1 - magentaMix) + 0.72 * magentaMix,
    ], index * 3);
    sizes[index] = 0.22 + random() * 1.15;
  }
  return { positions, colors, sizes };
};

const buildClusterParticles = (seedKey: string, tint: Tuple3): FocusParticleField => {
  const count = 2_800;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const random = createRandom(hashSeed(seedKey));
  for (let index = 0; index < count; index += 1) {
    const radius = Math.pow(random(), 1.7) * 2.5;
    const theta = random() * Math.PI * 2;
    const cosPhi = random() * 2 - 1;
    const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));
    positions.set([
      radius * sinPhi * Math.cos(theta),
      radius * cosPhi,
      radius * sinPhi * Math.sin(theta),
    ], index * 3);
    const warmth = 1 - radius / 2.5;
    colors.set([
      tint[0] * (1 - warmth) + warmth,
      tint[1] * (1 - warmth) + warmth * 0.88,
      tint[2] * (1 - warmth) + warmth * 0.66,
    ], index * 3);
    sizes[index] = 0.28 + warmth * 1.8 + random() * 0.5;
  }
  return { positions, colors, sizes };
};

const FOCUSED_PLANETS = new Map(PLANETS.map((planet) => [planet.id, planet]));
const FOCUSED_MOONS = new Map(MOONS.map((moon) => [moon.id, moon]));
const noopPlanetAction = () => undefined;
const noopStructureStatus = () => undefined;

const FocusDetailScale: FC<{ position: Tuple3; children: ReactNode }> = ({ position, children }) => {
  const groupRef = useRef<Group | null>(null);
  const worldPosition = useMemo(() => new Vector3(), []);
  const { camera } = useThree();

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    group.getWorldPosition(worldPosition);
    const blend = clamp((13 - camera.position.distanceTo(worldPosition)) / 6, 0, 1);
    const scale = blend * blend * (3 - 2 * blend);
    group.visible = scale > 0.002;
    group.scale.setScalar(Math.max(scale, 0.001));
  });

  return <group ref={groupRef} position={position}>{children}</group>;
};

const FocusedPlanetLod: FC<{ object: DisplayObject }> = ({ object }) => {
  const planetId = object.id.replace("solar:planet:", "") as PlanetId;
  const planet = FOCUSED_PLANETS.get(planetId);
  if (!planet) return null;
  return (
    <FocusDetailScale position={object.position}>
      <PlanetMesh
        planet={planet}
        position={[0, 0, 0]}
        timeDays={0}
        radius={1.38}
        distanceAu={planet.semiMajorAxisAU}
        selected
        suppressLabel
        segments={96}
        atmosphereSegments={72}
        atmosphereLutWidth={128}
        atmosphereLutHeight={32}
        textureQuality="high"
        nearThreshold={18}
        eclipseOccluders={[]}
        eclipseShadowsEnabled={false}
        ringShadowsEnabled
        onSelect={noopPlanetAction}
        onFocus={noopPlanetAction}
      />
      <pointLight position={[4.5, 3.5, 5.5]} color="#fff3da" intensity={18} distance={24} decay={2} />
    </FocusDetailScale>
  );
};

const FocusedMoonLod: FC<{ object: DisplayObject }> = ({ object }) => {
  const moonId = object.id.replace("solar:moon:", "");
  const moon = FOCUSED_MOONS.get(moonId);
  if (!moon) return null;
  return (
    <FocusDetailScale position={object.position}>
      <group scale={[3.65, 3.65, 3.65]}>
        <MoonMesh
          moon={moon}
          position={[0, 0, 0]}
          timeDays={0}
          textureQuality="high"
          segments={96}
          eclipseOccluders={[]}
          eclipseShadowsEnabled={false}
          onSelect={noopPlanetAction}
          onFocus={noopPlanetAction}
        />
      </group>
      <pointLight position={[4.5, 3.5, 5.5]} color="#f5f1e8" intensity={18} distance={24} decay={2} />
    </FocusDetailScale>
  );
};

const createExoplanetTexture = (object: DisplayObject) => {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 320;
  const context = canvas.getContext("2d");
  if (context) {
    const image = context.createImageData(canvas.width, canvas.height);
    const seed = hashSeed(object.id);
    const phase = (seed / 4_294_967_296) * Math.PI * 2;
    const isGasWorld = seed % 3 !== 0;
    for (let y = 0; y < canvas.height; y += 1) {
      const latitude = (y / canvas.height - 0.5) * Math.PI;
      for (let x = 0; x < canvas.width; x += 1) {
        const longitude = (x / canvas.width) * Math.PI * 2;
        const broad = Math.sin(latitude * (isGasWorld ? 13 : 5) + phase + Math.sin(longitude * 2.4) * 0.9);
        const medium = Math.sin(longitude * 4.7 + latitude * 8.3 + phase * 1.8) * 0.5;
        const fine = Math.sin(longitude * 13.1 - latitude * 17.7 + phase * 0.6) * 0.22;
        const terrain = isGasWorld
          ? broad * 0.72 + medium * 0.2 + fine * 0.08
          : broad * 0.24 + medium * 0.53 + fine * 0.23;
        const polarShade = 0.82 + Math.cos(latitude) * 0.18;
        const offset = (y * canvas.width + x) * 4;
        image.data[offset] = clamp((object.color[0] * 154 + 68 + terrain * 42) * polarShade, 0, 255);
        image.data[offset + 1] = clamp((object.color[1] * 148 + 62 + terrain * 34) * polarShade, 0, 255);
        image.data[offset + 2] = clamp((object.color[2] * 164 + 70 + terrain * 48) * polarShade, 0, 255);
        image.data[offset + 3] = 255;
      }
    }
    context.putImageData(image, 0, 0);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  return texture;
};

const FocusedExoplanetLod: FC<{ object: DisplayObject }> = ({ object }) => {
  const groupRef = useRef<Group | null>(null);
  const texture = useMemo(() => createExoplanetTexture(object), [object]);
  const hasRings = useMemo(() => hashSeed(object.id) % 4 === 0, [object.id]);
  useEffect(() => () => texture.dispose(), [texture]);
  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.045;
  });
  return (
    <FocusDetailScale position={object.position}>
      <group ref={groupRef} rotation={[0.14, 0, -0.08]}>
        <mesh castShadow receiveShadow>
          <sphereGeometry args={[1.38, 96, 64]} />
          <meshStandardMaterial map={texture} color="#ffffff" roughness={0.82} metalness={0.03} />
        </mesh>
        <mesh scale={[1.075, 1.075, 1.075]} renderOrder={7}>
          <sphereGeometry args={[1.38, 72, 48]} />
          <meshBasicMaterial color="#8ed5ff" transparent opacity={0.13} side={BackSide} depthWrite={false} />
        </mesh>
        {hasRings ? (
          <mesh rotation={[1.36, 0.12, 0.18]} renderOrder={6}>
            <torusGeometry args={[2.05, 0.27, 18, 160]} />
            <meshStandardMaterial color="#b8af9e" transparent opacity={0.48} roughness={0.9} side={DoubleSide} />
          </mesh>
        ) : null}
      </group>
      <pointLight position={[4.5, 3.5, 5.5]} color="#e3f3ff" intensity={18} distance={24} decay={2} />
    </FocusDetailScale>
  );
};

const FocusedSunLod: FC<{ object: DisplayObject; glowTexture: CanvasTexture }> = ({ object, glowTexture }) => {
  const groupRef = useRef<Group | null>(null);
  const sourceTexture = useTexture("/solar-textures/high/2k_sun.jpg");
  const texture = useMemo(() => {
    const next = sourceTexture.clone();
    next.colorSpace = SRGBColorSpace;
    next.needsUpdate = true;
    return next;
  }, [sourceTexture]);
  useEffect(() => () => texture.dispose(), [texture]);
  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.035;
  });
  return (
    <FocusDetailScale position={object.position}>
      <group ref={groupRef}>
        <mesh>
          <sphereGeometry args={[2.15, 96, 64]} />
          <meshBasicMaterial map={texture} color="#fff4d6" toneMapped={false} />
        </mesh>
        <sprite scale={[7.4, 7.4, 1]} renderOrder={8}>
          <spriteMaterial map={glowTexture} color="#ffb458" transparent opacity={0.62} depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
        </sprite>
        <pointLight color="#ffd49a" intensity={60} distance={42} decay={2} />
      </group>
    </FocusDetailScale>
  );
};

const SolarSystemOverview: FC<{
  sceneModel: SceneModel;
  cameraDistance: number;
  showCloseOverview: boolean;
  qualityTier: AstroQualityTier;
  glowTexture: CanvasTexture;
  selectedObjectId: SkyObjectId | null;
  onSelectObject: (objectId: SkyObjectId) => void;
}> = ({ sceneModel, cameraDistance, showCloseOverview, qualityTier, glowTexture, selectedObjectId, onSelectObject }) => {
  const sunRef = useRef<Group | null>(null);
  const sourceTexture = useTexture("/solar-textures/high/2k_sun.jpg");
  const sunTexture = useMemo(() => {
    const next = sourceTexture.clone();
    next.colorSpace = SRGBColorSpace;
    next.needsUpdate = true;
    return next;
  }, [sourceTexture]);
  const planetObjects = useMemo(
    () => PLANETS.flatMap((planet) => {
      const object = sceneModel.byId.get(`solar:planet:${planet.id}` as SkyObjectId);
      return object ? [{ planet, object }] : [];
    }),
    [sceneModel],
  );
  const visible = (cameraDistance >= SOLAR_SYSTEM_REVEAL_DISTANCE || showCloseOverview) && cameraDistance < 122;
  const qualityProfile = ASTRO_QUALITY_PROFILES[qualityTier];
  const segments = Math.max(24, qualityProfile.planetSegments);

  useEffect(() => () => sunTexture.dispose(), [sunTexture]);
  useFrame((_, delta) => {
    if (sunRef.current) sunRef.current.rotation.y += delta * 0.025;
  });

  return (
    <group visible={visible}>
      <group ref={sunRef}>
        <mesh
          onClick={(event) => {
            event.stopPropagation();
            onSelectObject("solar:sun");
          }}
        >
          <sphereGeometry args={[SOLAR_OVERVIEW_SUN_RADIUS, Math.max(40, segments * 2), Math.max(24, segments)]} />
          <meshBasicMaterial map={sunTexture} color="#fff4d1" toneMapped={false} />
        </mesh>
        <sprite scale={[3.1, 3.1, 1]} renderOrder={7}>
          <spriteMaterial
            map={glowTexture}
            color="#ffb24d"
            transparent
            opacity={0.58}
            depthWrite={false}
            blending={AdditiveBlending}
            toneMapped={false}
          />
        </sprite>
        <pointLight color="#ffd49a" intensity={42} distance={92} decay={1.7} />
      </group>
      {planetObjects.map(({ planet, object }) => (
        <PlanetMesh
          key={planet.id}
          planet={planet}
          position={object.position}
          timeDays={0}
          radius={getSolarOverviewRadius(planet.radiusKm)}
          distanceAu={planet.semiMajorAxisAU}
          selected={selectedObjectId === object.id}
          showOverviewLabel={false}
          suppressLabel
          segments={segments}
          atmosphereSegments={segments}
          atmosphereLutWidth={qualityProfile.atmosphereLutWidth}
          atmosphereLutHeight={qualityProfile.atmosphereLutHeight}
          textureQuality={qualityProfile.textureQuality}
          nearThreshold={MAX_CONTINUOUS_CAMERA_DISTANCE}
          eclipseOccluders={[]}
          eclipseShadowsEnabled={false}
          ringShadowsEnabled
          onSelect={() => onSelectObject(object.id)}
          onFocus={() => onSelectObject(object.id)}
        />
      ))}
    </group>
  );
};

const FocusedGalaxyLod: FC<{ object: DisplayObject; glowTexture: CanvasTexture }> = ({ object, glowTexture }) => {
  const field = useMemo(() => buildGalaxyParticles(object.id, object.color), [object.color, object.id]);
  const diskTexture = useMemo(() => createGalaxyDiskTexture(object.id), [object.id]);
  useEffect(() => () => diskTexture.dispose(), [diskTexture]);
  return (
    <group position={object.position} rotation={object.rotation ?? [0.5, -0.18, -0.34]} scale={[1.18, 1.18, 1.18]}>
      <mesh rotation={[Math.PI / 2, 0, 0]} renderOrder={6}>
        <planeGeometry args={[8.2, 8.2]} />
        <meshBasicMaterial
          map={diskTexture}
          transparent
          opacity={0.88}
          depthWrite={false}
          blending={AdditiveBlending}
          side={DoubleSide}
          toneMapped={false}
        />
      </mesh>
      <StarCloud {...field} renderOrder={7} />
      <sprite scale={[2.4, 2.4, 1]} renderOrder={8}>
        <spriteMaterial map={glowTexture} color="#ffbd6f" transparent opacity={0.24} depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
      </sprite>
      <mesh scale={[0.34, 0.1, 0.34]}>
        <sphereGeometry args={[1, 48, 24]} />
        <meshBasicMaterial color="#d5843f" transparent opacity={0.82} />
      </mesh>
    </group>
  );
};

const FocusedNebulaLod: FC<{ object: DisplayObject; glowTexture: CanvasTexture }> = ({ object, glowTexture }) => {
  const field = useMemo(() => buildNebulaParticles(object.id, object.color), [object.color, object.id]);
  return (
    <group position={object.position} rotation={object.rotation ?? [0.18, 0.35, -0.24]}>
      <StarCloud {...field} renderOrder={7} />
      {([
        [-1.25, 0.42, 0.2, 3.8, "#76d8ff"],
        [0.75, -0.32, 0.35, 4.6, "#ff73bd"],
        [0.18, 0.58, -0.35, 3.2, "#b89bff"],
      ] as const).map(([x, y, z, scale, color]) => (
        <sprite key={`${x}-${y}`} position={[x, y, z]} scale={[scale, scale, 1]} renderOrder={6}>
          <spriteMaterial map={glowTexture} color={color} transparent opacity={0.2} depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
        </sprite>
      ))}
    </group>
  );
};

const FocusedClusterLod: FC<{ object: DisplayObject; glowTexture: CanvasTexture }> = ({ object, glowTexture }) => {
  const field = useMemo(() => buildClusterParticles(object.id, object.color), [object.color, object.id]);
  return (
    <group position={object.position}>
      <StarCloud {...field} renderOrder={7} />
      <sprite scale={[3.4, 3.4, 1]} renderOrder={6}>
        <spriteMaterial map={glowTexture} color="#ffdca8" transparent opacity={0.24} depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
      </sprite>
    </group>
  );
};

const FocusedBlackHoleLod: FC<{ object: DisplayObject }> = ({ object }) => (
  <group position={object.position} rotation={[0.58, -0.22, -0.38]}>
    <mesh>
      <sphereGeometry args={[1.05, 72, 48]} />
      <meshBasicMaterial color="#000000" toneMapped={false} />
    </mesh>
    <mesh rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[1.72, 0.34, 30, 180]} />
      <meshBasicMaterial color="#fff0b0" toneMapped={false} />
    </mesh>
    <mesh rotation={[Math.PI / 2.18, 0.18, 0.24]} scale={[1.38, 1.38, 1.38]}>
      <torusGeometry args={[1.72, 0.22, 24, 180]} />
      <meshBasicMaterial color="#ff9d35" transparent opacity={0.5} toneMapped={false} />
    </mesh>
    <pointLight color="#ffc15c" intensity={44} distance={22} decay={2} />
  </group>
);

const FocusedSpacecraftLod: FC<{ object: DisplayObject; glowTexture: CanvasTexture }> = ({ object, glowTexture }) => {
  const color = useMemo(() => new Color(object.color[0], object.color[1], object.color[2]), [object.color]);
  return (
    <group position={object.position} rotation={[0.25, -0.6, -0.2]}>
      <mesh>
        <boxGeometry args={[0.62, 0.42, 0.42]} />
        <meshStandardMaterial color="#d7d2c4" metalness={0.78} roughness={0.3} />
      </mesh>
      <mesh position={[0.56, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[0.82, 0.24, 40, 1, true]} />
        <meshStandardMaterial color="#ece6d6" metalness={0.64} roughness={0.38} side={DoubleSide} />
      </mesh>
      <mesh position={[-0.58, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.055, 0.055, 1.55, 12]} />
        <meshStandardMaterial color="#888f99" metalness={0.82} roughness={0.3} />
      </mesh>
      <sprite scale={[4.8, 4.8, 1]} renderOrder={8} raycast={() => null}>
        <spriteMaterial map={glowTexture} color={color} transparent opacity={0.42} depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
      </sprite>
      <pointLight color={color} intensity={8} distance={14} decay={2} />
    </group>
  );
};

const FocusedStellarLod: FC<{ object: DisplayObject; glowTexture: CanvasTexture }> = ({ object, glowTexture }) => {
  const materialRef = useRef<ShaderMaterial | null>(null);
  const color = useMemo(() => {
    const rgb = object.color;
    return new Color(rgb[0], rgb[1], rgb[2]);
  }, [object.color]);
  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uColor: { value: color },
  }), [color]);
  useFrame((_, delta) => {
    if (materialRef.current) materialRef.current.uniforms.uTime.value += delta;
  });
  return (
    <group position={object.position}>
      <mesh>
        <sphereGeometry args={[0.34, 64, 40]} />
        <shaderMaterial
          ref={materialRef}
          vertexShader={SURFACE_VERTEX_SHADER}
          fragmentShader={SURFACE_FRAGMENT_SHADER}
          uniforms={uniforms}
          toneMapped={false}
        />
      </mesh>
      <sprite scale={[2.4, 2.4, 1]} renderOrder={8}>
        <spriteMaterial map={glowTexture} color={color} transparent opacity={0.72} depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
      </sprite>
      <pointLight color={color} intensity={24} distance={36} decay={2} />
    </group>
  );
};

const FocusedObjectLod: FC<{ object: DisplayObject | null; glowTexture: CanvasTexture }> = ({ object, glowTexture }) => {
  if (!object) return null;
  if (object.kind === "planet") return <FocusedPlanetLod object={object} />;
  if (object.kind === "moon") return <FocusedMoonLod object={object} />;
  if (object.kind === "exoplanet") return <FocusedExoplanetLod object={object} />;
  if (object.kind === "sun") return <FocusedSunLod object={object} glowTexture={glowTexture} />;
  if (object.kind === "spacecraft") return <FocusedSpacecraftLod object={object} glowTexture={glowTexture} />;
  if (object.kind === "galaxy") return <FocusedGalaxyLod object={object} glowTexture={glowTexture} />;
  if (object.kind === "nebula") return <FocusedNebulaLod object={object} glowTexture={glowTexture} />;
  if (object.kind === "cluster") return <FocusedClusterLod object={object} glowTexture={glowTexture} />;
  if (object.kind === "black-hole") return <FocusedBlackHoleLod object={object} />;
  return <FocusedStellarLod object={object} glowTexture={glowTexture} />;
};

const InterstellarProbeMarkers: FC<{
  sceneModel: SceneModel;
  cameraDistance: number;
  glowTexture: CanvasTexture;
  selectedObjectId: SkyObjectId | null;
  onSelectObject: (objectId: SkyObjectId | null) => void;
}> = ({ sceneModel, cameraDistance, glowTexture, selectedObjectId, onSelectObject }) => {
  const probes = useMemo(
    () => [...sceneModel.byId.values()].filter((object) => object.kind === "spacecraft"),
    [sceneModel],
  );
  const reveal = clamp((cameraDistance - 18) / 14, 0, 1) * (1 - clamp((cameraDistance - 142) / 38, 0, 1));
  if (reveal <= 0.002) return null;
  return probes.map((object, index) => {
    const selected = object.id === selectedObjectId;
    const color = new Color(object.color[0], object.color[1], object.color[2]);
    return (
      <group key={object.id} position={object.position}>
        <sprite scale={[selected ? 8.5 : 6.4, selected ? 8.5 : 6.4, 1]} renderOrder={8} raycast={() => null}>
          <spriteMaterial map={glowTexture} color={color} transparent opacity={(selected ? 0.72 : 0.48) * reveal} depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
        </sprite>
        <mesh
          rotation={[0.5, index ? -0.45 : 0.35, 0.38]}
          scale={selected ? 1.24 : 1}
          onClick={(event) => {
            event.stopPropagation();
            onSelectObject(object.id);
          }}
        >
          <octahedronGeometry args={[0.52, 0]} />
          <meshBasicMaterial color={color} transparent opacity={0.96 * reveal} toneMapped={false} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
          <torusGeometry args={[1.05, 0.026, 8, 64]} />
          <meshBasicMaterial color={color} transparent opacity={0.45 * reveal} blending={AdditiveBlending} toneMapped={false} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} scale={[1.55, 1.55, 1.55]} raycast={() => null}>
          <torusGeometry args={[1.05, 0.018, 8, 64]} />
          <meshBasicMaterial color={color} transparent opacity={0.2 * reveal} blending={AdditiveBlending} toneMapped={false} />
        </mesh>
        <Html position={[index ? 5 : -5, index ? -3 : 3, 0]} center zIndexRange={[17, 2]}>
          <span className={`skymap-spacecraft-label${selected ? " is-selected" : ""}`} style={{ opacity: reveal }}>
            <strong>{object.label}</strong>
            <small>interstellar probe</small>
          </span>
        </Html>
      </group>
    );
  });
};

const STELLAR_LANDMARK_NAMES = new Set([
  "Sun",
  "Alpha Centauri A",
  "Barnard's Star",
  "Sirius A",
  "Procyon",
  "Epsilon Eridani",
  "Vega",
  "Hyades",
  "Herschel's Jewel Box",
]);

const StellarLandmarks: FC<{ sceneModel: SceneModel; cameraDistance: number }> = ({ sceneModel, cameraDistance }) => {
  const landmarks = useMemo(
    () => [...sceneModel.byId.values()].filter((object) => STELLAR_LANDMARK_NAMES.has(object.label)),
    [sceneModel],
  );
  const opacity = clamp((cameraDistance - 108) / 42, 0, 1) * (1 - clamp((cameraDistance - 390) / 90, 0, 1));
  if (opacity <= 0.002) return null;
  return landmarks.map((object, index) => (
    <Html key={object.id} position={object.position} center zIndexRange={[15, 2]}>
      <span
        className={`skymap-stellar-landmark skymap-stellar-landmark--${object.kind}`}
        style={{ opacity, transform: `translate(${index % 2 ? 9 : -9}px, ${(index % 3 - 1) * 7}px)` }}
      >
        {object.label === "Herschel's Jewel Box" ? "Jewel Box" : object.label}
      </span>
    </Html>
  ));
};

const LOCAL_GROUP_LABEL_GALAXY_IDS = new Set<SkyObjectId>([
  ...LOCAL_GROUP_PRIMARY_GALAXY_IDS,
  "deep:galaxy:lvdb-ngc-6822",
  "deep:galaxy:lvdb-ic-1613",
  "deep:galaxy:lvdb-wlm",
  "deep:galaxy:lvdb-ngc-3109",
  "deep:galaxy:lvdb-sextans-b",
]);

const LOCAL_GROUP_IRREGULAR_GALAXY_IDS = new Set<SkyObjectId>([
  "deep:galaxy:large-magellanic-cloud",
  "deep:galaxy:small-magellanic-cloud",
  "deep:galaxy:lvdb-ngc-6822",
  "deep:galaxy:lvdb-ic-1613",
  "deep:galaxy:lvdb-ic-0010",
  "deep:galaxy:lvdb-ngc-3109",
  "deep:galaxy:lvdb-sextans-b",
  "deep:galaxy:lvdb-wlm",
]);

const LOCAL_GROUP_SHELL_VERTEX_SHADER = `
  varying vec3 vNormalView;
  varying vec3 vViewDirection;
  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vNormalView = normalize(normalMatrix * normal);
    vViewDirection = normalize(-viewPosition.xyz);
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const LOCAL_GROUP_SHELL_FRAGMENT_SHADER = `
  precision highp float;
  uniform vec3 uTint;
  uniform float uOpacity;
  varying vec3 vNormalView;
  varying vec3 vViewDirection;
  void main() {
    float rim = pow(1.0 - abs(dot(vNormalView, vViewDirection)), 2.35);
    float alpha = rim * uOpacity;
    if (alpha < 0.002) discard;
    gl_FragColor = vec4(uTint * (0.55 + rim * 0.75), alpha);
  }
`;

const DistanceShell: FC<{ radius: number; opacity: number }> = ({ radius, opacity }) => {
  const uniforms = useMemo(() => ({
    uTint: { value: new Color("#8ca8d7") },
    uOpacity: { value: opacity },
  }), [opacity]);
  return (
    <mesh raycast={() => null}>
      <sphereGeometry args={[radius, 56, 32]} />
      <shaderMaterial
        vertexShader={LOCAL_GROUP_SHELL_VERTEX_SHADER}
        fragmentShader={LOCAL_GROUP_SHELL_FRAGMENT_SHADER}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={DoubleSide}
        blending={AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
};

const buildLocalGroupField = (objects: DisplayObject[]) => {
  const positions = new Float32Array(objects.length * 3);
  const colors = new Float32Array(objects.length * 3);
  objects.forEach((object, index) => {
    positions.set(object.position, index * 3);
    colors.set(object.color, index * 3);
  });
  return { positions, colors };
};

const getLocalGroupMorphology = (object: DisplayObject): GalaxyTextureMorphology => {
  if (LOCAL_GROUP_IRREGULAR_GALAXY_IDS.has(object.id)) return "irregular";
  if (object.id === "deep:galaxy:andromeda-galaxy" || object.id === "deep:galaxy:triangulum-galaxy") return "spiral";
  return "dwarf";
};

const LocalGroupGalaxySprite: FC<{
  object: DisplayObject;
  index: number;
  opacity: number;
  selected: boolean;
  onSelectObject: (objectId: SkyObjectId | null) => void;
}> = ({ object, index, opacity, selected, onSelectObject }) => {
  const primary = LOCAL_GROUP_PRIMARY_GALAXY_IDS.has(object.id);
  const morphology = getLocalGroupMorphology(object);
  const texture = useMemo(() => createGalaxyDiskTexture(object.id, morphology), [morphology, object.id]);
  const major = object.id === "deep:galaxy:andromeda-galaxy";
  const medium = object.id === "deep:galaxy:triangulum-galaxy";
  const scale = primary ? (major ? 46 : medium ? 27 : 18) : 11.5 + (index % 4) * 0.9;
  const aspect = morphology === "spiral" ? 0.48 : morphology === "irregular" ? 0.72 : 0.64;
  const direction = index % 2 === 0 ? 1 : -1;
  const labelOffset: Tuple3 = primary
    ? major ? [36, -28, 0] : medium ? [32, 30, 0] : object.id === "deep:galaxy:large-magellanic-cloud" ? [-46, 26, 0] : [-46, -26, 0]
    : [direction * (17 + index % 3), ((index % 3) - 1) * 12, 0];
  const tint = new Color(object.color[0], object.color[1], object.color[2]);

  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <group position={object.position}>
      <sprite
        scale={[scale * (selected ? 1.18 : 1), scale * aspect * (selected ? 1.18 : 1), 1]}
        renderOrder={primary ? 5 : 4}
        onClick={(event) => {
          event.stopPropagation();
          onSelectObject(object.id);
        }}
      >
        <spriteMaterial
          map={texture}
          color={tint}
          rotation={(hashSeed(object.id) % 628) / 100}
          transparent
          opacity={(primary ? 1 : 0.86) * opacity}
          blending={morphology === "dwarf" ? NormalBlending : AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
      {LOCAL_GROUP_LABEL_GALAXY_IDS.has(object.id) ? (
        <Html position={labelOffset} center zIndexRange={[13, 2]}>
          <span className={`skymap-local-group-label${primary ? " is-primary" : ""}`} style={{ opacity }}>
            {object.label}
          </span>
        </Html>
      ) : null}
    </group>
  );
};

const MilkyWayLocalGroupMarker: FC<{ opacity: number }> = ({ opacity }) => {
  const texture = useMemo(() => createGalaxyDiskTexture("milky-way-local-group", "spiral"), []);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <group position={[0, 0, 0]}>
      <sprite scale={[23, 10, 1]} renderOrder={5} raycast={() => null}>
        <spriteMaterial map={texture} color="#d9e8ff" transparent opacity={0.92 * opacity} blending={NormalBlending} depthWrite={false} toneMapped={false} />
      </sprite>
      <Html position={[-18, -18, 0]} center zIndexRange={[13, 2]}>
        <span className="skymap-local-group-label skymap-local-group-label--home" style={{ opacity }}>Milky Way</span>
      </Html>
    </group>
  );
};

const LocalGroupScene: FC<{
  sceneModel: SceneModel;
  cameraDistance: number;
  glowTexture: CanvasTexture;
  selectedObjectId: SkyObjectId | null;
  onSelectObject: (objectId: SkyObjectId | null) => void;
}> = ({ sceneModel, cameraDistance, glowTexture, selectedObjectId, onSelectObject }) => {
  const objects = useMemo(
    () => [...sceneModel.byId.values()].filter((object) => object.layerId === LOCAL_GROUP_GALAXIES_LAYER_ID),
    [sceneModel],
  );
  const visibleGalaxies = useMemo(() => objects.filter((object) => LOCAL_GROUP_VISUAL_GALAXY_IDS.has(object.id)), [objects]);
  const dwarfs = useMemo(() => objects.filter((object) => !LOCAL_GROUP_VISUAL_GALAXY_IDS.has(object.id)), [objects]);
  const field = useMemo(() => buildLocalGroupField(dwarfs), [dwarfs]);
  const reveal = clamp((cameraDistance - 150) / 190, 0, 1);
  const fade = 1 - clamp((cameraDistance - 1_020) / 340, 0, 1);
  const opacity = reveal * fade;

  if (opacity <= 0.002) return null;

  return (
    <group rotation={[0.17, -0.34, 0.06]} scale={[1.55, 1.55, 1.55]}>
      {[78, 96, 114, 132].map((radius, index) => (
        <DistanceShell key={radius} radius={radius} opacity={(0.085 - index * 0.011) * opacity * clamp((cameraDistance - 300) / 160, 0, 1)} />
      ))}
      <points renderOrder={-1} frustumCulled={false} raycast={() => null}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[field.positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[field.colors, 3]} />
        </bufferGeometry>
        <pointsMaterial
          map={glowTexture}
          size={4.2}
          sizeAttenuation
          vertexColors
          transparent
          opacity={0.78 * opacity}
          alphaTest={0.012}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </points>
      <MilkyWayLocalGroupMarker opacity={opacity * clamp((cameraDistance - 390) / 160, 0, 1)} />
      {visibleGalaxies.map((object, index) => (
        <LocalGroupGalaxySprite
          key={object.id}
          object={object}
          index={index}
          opacity={opacity}
          selected={selectedObjectId === object.id}
          onSelectObject={onSelectObject}
        />
      ))}
    </group>
  );
};

interface CosmicWebGeometry {
  points: Float32Array;
  lines: Float32Array;
  hazeNodes: Tuple3[];
}

const buildCosmicWebGeometry = (qualityTier: AstroQualityTier): CosmicWebGeometry => {
  const random = createRandom(4_217_901);
  const nodeCount = qualityTier === "low" ? 34 : qualityTier === "high" ? 58 : 48;
  const samples = qualityTier === "low" ? 22 : qualityTier === "high" ? 44 : 32;
  const strands = qualityTier === "low" ? 4 : qualityTier === "high" ? 8 : 6;
  const nodes: Tuple3[] = [[0, 0, 0]];
  for (let index = 1; index < nodeCount; index += 1) {
    const radius = Math.pow(random(), 0.58) * 390;
    const longitude = random() * Math.PI * 2;
    const cosLatitude = random() * 2 - 1;
    const latitudeRadius = Math.sqrt(Math.max(0, 1 - cosLatitude * cosLatitude));
    nodes.push([
      Math.cos(longitude) * latitudeRadius * radius,
      cosLatitude * radius * 0.9,
      Math.sin(longitude) * latitudeRadius * radius,
    ]);
  }

  const edgeKeys = new Set<string>();
  const edges: Array<[number, number]> = [];
  nodes.forEach((node, index) => {
    const nearest = nodes
      .map((candidate, candidateIndex) => ({
        index: candidateIndex,
        distance: candidateIndex === index ? Number.POSITIVE_INFINITY : Math.hypot(
          candidate[0] - node[0],
          candidate[1] - node[1],
          candidate[2] - node[2],
        ),
      }))
      .sort((left, right) => left.distance - right.distance)
      .slice(0, index % 4 === 0 ? 4 : 3);
    nearest.forEach((candidate) => {
      const key = [index, candidate.index].sort((left, right) => left - right).join(":");
      if (edgeKeys.has(key)) return;
      edgeKeys.add(key);
      edges.push([index, candidate.index]);
    });
  });

  const lineValues: number[] = [];
  const pointValues: number[] = [];
  edges.forEach(([startIndex, endIndex], edgeIndex) => {
    const start = nodes[startIndex];
    const end = nodes[endIndex];
    lineValues.push(...start, ...end);
    for (let strand = 0; strand < strands; strand += 1) {
      const phase = random() * Math.PI * 2;
      const jitterScale = 1.8 + random() * 3.8;
      for (let sample = 0; sample <= samples; sample += 1) {
        const progress = sample / samples;
        const envelope = Math.sin(progress * Math.PI);
        const wave = Math.sin(progress * Math.PI * (2 + edgeIndex % 3) + phase) * jitterScale * envelope;
        const scatter = (1.2 + random() * 2.8) * envelope;
        pointValues.push(
          start[0] + (end[0] - start[0]) * progress + wave + (random() - 0.5) * scatter,
          start[1] + (end[1] - start[1]) * progress + (random() - 0.5) * (jitterScale + scatter) * envelope,
          start[2] + (end[2] - start[2]) * progress + Math.cos(progress * Math.PI * 2 + phase) * jitterScale * envelope + (random() - 0.5) * scatter,
        );
      }
    }
  });
  return {
    points: new Float32Array(pointValues),
    lines: new Float32Array(lineValues),
    hazeNodes: nodes.filter((_, index) => index % 3 === 0).slice(0, 16),
  };
};

const CosmicWebScene: FC<{
  cameraDistance: number;
  qualityTier: AstroQualityTier;
  glowTexture: CanvasTexture;
}> = ({ cameraDistance, qualityTier, glowTexture }) => {
  const geometry = useMemo(() => buildCosmicWebGeometry(qualityTier), [qualityTier]);
  const webSource = useTexture("/assets/sky/cosmic-web-volume-v1.png");
  const webTexture = useMemo(() => {
    const texture = webSource.clone();
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }, [webSource]);
  const reveal = clamp((cameraDistance - 820) / 520, 0, 1);
  const webLabelOpacity = clamp((cameraDistance - 1_080) / 220, 0, 1);
  const scaleProgress = clamp((cameraDistance - 1_300) / 2_900, 0, 1);
  const scale = 0.94 + scaleProgress * 0.52;
  useEffect(() => () => webTexture.dispose(), [webTexture]);
  if (reveal <= 0.002) return null;
  return (
    <group scale={[scale, scale, scale]} rotation={[0.16, -0.28, 0.08]}>
      <sprite scale={[1_520, 1_520, 1]} renderOrder={-12}>
        <spriteMaterial map={webTexture} transparent opacity={0.15 * reveal} blending={NormalBlending} depthWrite={false} toneMapped={false} />
      </sprite>
      <lineSegments renderOrder={-10} raycast={() => null}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[geometry.lines, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#7895c5" transparent opacity={0.002 * reveal} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </lineSegments>
      <points renderOrder={-10} frustumCulled={false} raycast={() => null}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[geometry.points, 3]} />
        </bufferGeometry>
        <pointsMaterial map={glowTexture} color="#7593c7" size={qualityTier === "low" ? 6.2 : 8.5} sizeAttenuation transparent opacity={0.018 * reveal} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </points>
      <points renderOrder={-9} frustumCulled={false} raycast={() => null}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[geometry.points, 3]} />
        </bufferGeometry>
        <pointsMaterial map={glowTexture} color="#b2c8ef" size={qualityTier === "low" ? 1.8 : 2.6} sizeAttenuation transparent opacity={0.075 * reveal} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </points>
      {geometry.hazeNodes.map((node, index) => {
        const hazeScale = 34 + (index % 5) * 8;
        return (
          <sprite key={`${node[0]}-${node[1]}-${node[2]}`} position={node} scale={[hazeScale, hazeScale, 1]} renderOrder={-11}>
            <spriteMaterial map={glowTexture} color="#7795c9" transparent opacity={0.012 * reveal} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
          </sprite>
        );
      })}
      <Html position={[0, -9, 0]} center zIndexRange={[12, 2]}>
        <span className="skymap-local-group-label skymap-local-group-label--cosmic" style={{ opacity: webLabelOpacity }}>
          Local Group
        </span>
      </Html>
    </group>
  );
};

const BloomPipeline: FC = () => {
  const { gl, scene, camera, size } = useThree();
  const composer = useMemo(() => {
    const next = new EffectComposer(gl);
    next.addPass(new RenderPass(scene, camera));
    next.addPass(new UnrealBloomPass(new Vector2(size.width, size.height), 0.45, 0.32, 1.05));
    return next;
  }, [camera, gl, scene, size.height, size.width]);
  useEffect(() => {
    composer.setSize(size.width, size.height);
    return () => composer.dispose();
  }, [composer, size.height, size.width]);
  useFrame(() => composer.render(), 1);
  return null;
};

const RendererDiagnostics: FC<{
  renderables: SkyRenderable[];
  qualityTier: AstroQualityTier;
  timePlayback: SkyMapPlaybackState;
}> = ({ renderables, qualityTier, timePlayback }) => {
  const qualityProfile = ASTRO_QUALITY_PROFILES[qualityTier];
  const diagnostics = useMemo(() => ({
    renderables: renderables.length,
    points: renderables.filter(isSkyPointRenderable).length,
    meshes: renderables.filter(isSkyMeshRenderable).length,
    lines: renderables.filter((renderable) => isSkyLineRenderable(renderable) && renderable.layerId !== "solar.system-bodies").length,
    qualityTier,
    starBudget: qualityProfile.starBudget,
    labelBudget: qualityProfile.labelBudget,
    backgroundStarBudget: qualityProfile.backgroundStarBudget,
    skyMeshSegments: qualityProfile.skyMeshSegments,
    galaxyPointBudget: qualityProfile.galaxyPointBudget,
    desiLightconePointBlocks: qualityProfile.desiLightconePointBlocks,
  }), [qualityProfile, qualityTier, renderables]);
  useRenderActivity({
    label: "skymap",
    active: timePlayback === "playing",
    reasons: timePlayback === "playing" ? ["time-playback"] : [],
    diagnostics,
  });
  return null;
};

interface ZoomCommand {
  id: number;
  factor: number;
}

const CameraRig: FC<{
  focusObject: DisplayObject | null;
  focusRequestId: number;
  cancelFlightToken: number;
  resetRequestId: number;
  zoomCommand: ZoomCommand;
  onDistanceChange: (distance: number) => void;
  onManualNavigation: () => void;
  onCameraFlightChange: (flight: CameraFlightState | null) => void;
}> = ({
  focusObject,
  focusRequestId,
  cancelFlightToken,
  resetRequestId,
  zoomCommand,
  onDistanceChange,
  onManualNavigation,
  onCameraFlightChange,
}) => {
  const { camera } = useThree();
  const focusId = focusObject?.id ?? null;
  const focusLabel = focusObject?.label ?? "";
  const focusKind = focusObject?.kind ?? null;
  const focusX = focusObject?.position[0] ?? 0;
  const focusY = focusObject?.position[1] ?? 0;
  const focusZ = focusObject?.position[2] ?? 0;
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const desiredCamera = useRef(DEFAULT_CAMERA.clone());
  const desiredTarget = useRef(DEFAULT_TARGET.clone());
  const flightActive = useRef(false);
  const lastReport = useRef(0);

  useEffect(() => {
    if (!focusId || !focusKind || focusRequestId === 0) return;
    const target = new Vector3(focusX, focusY, focusZ);
    const controls = controlsRef.current;
    const currentTarget = controls?.target ?? DEFAULT_TARGET;
    const direction = camera.position.clone().sub(currentTarget);
    if (direction.lengthSq() < 0.001) direction.set(0.18, 0.16, 1);
    direction.normalize();
    const distance =
      focusKind === "planet" || focusKind === "moon" || focusKind === "exoplanet"
        ? 4.7
        : focusKind === "sun"
          ? 6.8
          : focusKind === "galaxy"
            ? 9.5
            : focusKind === "nebula"
              ? 8.4
              : focusKind === "cluster"
                ? 7.6
                : focusKind === "black-hole"
                  ? 7.2
                  : 8.5;
    desiredTarget.current.copy(target);
    desiredCamera.current.copy(target).addScaledVector(direction, distance);
    const immediate = shouldReduceCameraFlightMotionInBrowser();
    if (immediate) {
      camera.position.copy(desiredCamera.current);
      controls?.target.copy(desiredTarget.current);
      controls?.update();
      flightActive.current = false;
      onCameraFlightChange(null);
    } else {
      flightActive.current = true;
      onCameraFlightChange(createCameraFlightState("skymap", `Flying to ${focusLabel}`));
    }
  }, [camera, focusId, focusKind, focusLabel, focusRequestId, focusX, focusY, focusZ, onCameraFlightChange]);

  useEffect(() => {
    if (resetRequestId === 0) return;
    desiredCamera.current.copy(DEFAULT_CAMERA);
    desiredTarget.current.copy(DEFAULT_TARGET);
    flightActive.current = true;
    onCameraFlightChange(createCameraFlightState("skymap", "Returning to the Solar neighbourhood"));
  }, [onCameraFlightChange, resetRequestId]);

  useEffect(() => {
    if (cancelFlightToken === 0) return;
    flightActive.current = false;
    desiredCamera.current.copy(camera.position);
    desiredTarget.current.copy(controlsRef.current?.target ?? DEFAULT_TARGET);
    onCameraFlightChange(null);
  }, [camera, cancelFlightToken, onCameraFlightChange]);

  useEffect(() => {
    if (zoomCommand.id === 0) return;
    const controls = controlsRef.current;
    const target = controls?.target ?? desiredTarget.current;
    const offset = camera.position.clone().sub(target).multiplyScalar(zoomCommand.factor);
    const distance = clamp(offset.length(), MIN_CONTINUOUS_CAMERA_DISTANCE, MAX_CONTINUOUS_CAMERA_DISTANCE);
    offset.setLength(distance);
    camera.position.copy(target).add(offset);
    desiredCamera.current.copy(camera.position);
    flightActive.current = false;
    controls?.update();
  }, [camera, zoomCommand]);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (flightActive.current && controls) {
      const response = 1 - Math.exp(-delta * 2.35);
      camera.position.lerp(desiredCamera.current, response);
      controls.target.lerp(desiredTarget.current, response);
      controls.update();
      if (camera.position.distanceTo(desiredCamera.current) < 0.025 && controls.target.distanceTo(desiredTarget.current) < 0.025) {
        camera.position.copy(desiredCamera.current);
        controls.target.copy(desiredTarget.current);
        controls.update();
        flightActive.current = false;
        onCameraFlightChange(null);
      }
    }
    const now = performance.now();
    if (now - lastReport.current > 180) {
      onDistanceChange(camera.position.distanceTo(controls?.target ?? DEFAULT_TARGET));
      lastReport.current = now;
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      target={[DEFAULT_TARGET.x, DEFAULT_TARGET.y, DEFAULT_TARGET.z]}
      enableDamping
      dampingFactor={0.055}
      enablePan={false}
      minDistance={MIN_CONTINUOUS_CAMERA_DISTANCE}
      maxDistance={MAX_CONTINUOUS_CAMERA_DISTANCE}
      rotateSpeed={0.34}
      zoomSpeed={0.82}
      onStart={() => {
        flightActive.current = false;
        onCameraFlightChange(null);
        onManualNavigation();
      }}
      onEnd={() => {
        desiredCamera.current.copy(camera.position);
        desiredTarget.current.copy(controlsRef.current?.target ?? DEFAULT_TARGET);
      }}
    />
  );
};

const GalaxiumSkyMapViewport: FC<GalaxiumSkyMapViewportProps> = ({
  renderables,
  catalogChunks,
  catalogPointCount,
  selectedObjectId,
  focusedObjectId,
  focusRequestId,
  cancelFlightToken,
  navigationState,
  objectCount,
  cameraDistance,
  onSelectObject,
  onHoverObject,
  onViewportDistanceChange,
  onManualNavigation,
  onCameraFlightChange,
  timePlayback,
  qualityTier,
}) => {
  const [zoomCommand, setZoomCommand] = useState<ZoomCommand>({ id: 0, factor: 1 });
  const [launchContextVisible, setLaunchContextVisible] = useState(true);
  const sceneModel = useMemo(
    () => buildSceneModel(renderables, catalogChunks, selectedObjectId, qualityTier),
    [catalogChunks, qualityTier, renderables, selectedObjectId],
  );
  const focusObject = (focusedObjectId && sceneModel.byId.get(focusedObjectId)) || null;
  const glowTexture = useMemo(() => createGlowTexture(), []);
  const structureRenderables = useMemo(() => renderables.filter(isSkyStructureRenderable), [renderables]);
  const qualityProfile = ASTRO_QUALITY_PROFILES[qualityTier];
  const scaleStage = getContinuousScaleStage(cameraDistance);
  const skyBackdropBrightness = getSkyBackdropBrightness(cameraDistance);
  const scaleStyle = {
    "--skymap-continuous-progress": `${getContinuousScaleProgress(cameraDistance) * 100}%`,
  } as CSSProperties;
  const handleZoom = (factor: number) => {
    setLaunchContextVisible(false);
    setZoomCommand((current) => ({ id: current.id + 1, factor }));
    onManualNavigation();
  };

  useEffect(() => () => glowTexture.dispose(), [glowTexture]);

  return (
    <div className="skymap-viewport skymap-viewport--galaxium" aria-label="SpaceViewer cinematic universe viewport">
      <Canvas
        className="skymap-galaxium-canvas"
        camera={{ position: [0, 23, 49], fov: 55, near: 0.05, far: 9_000 }}
        dpr={qualityTier === "low" ? 1 : [1, 2]}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        onCreated={({ gl, raycaster }) => {
          raycaster.params.Points.threshold = 0.72;
          gl.toneMapping = ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
          gl.outputColorSpace = SRGBColorSpace;
          gl.setClearColor("#010208", 1);
        }}
        onPointerMissed={() => onSelectObject(null)}
      >
        <Suspense fallback={null}>
          <SkyBackdrop brightness={skyBackdropBrightness} />
        </Suspense>
        <ambientLight intensity={0.055} />
        <hemisphereLight color="#dbe9ff" groundColor="#090501" intensity={0.24} />
        <directionalLight position={[12, 8, 14]} intensity={1.45} color="#fff3df" />
        <group visible={cameraDistance >= 14 && cameraDistance < 390}>
          <StarCloud
            positions={sceneModel.cataloguePositions}
            colors={sceneModel.catalogueColors}
            sizes={sceneModel.catalogueSizes}
            renderOrder={1}
          />
        </group>
        <group visible={cameraDistance >= SOLAR_SYSTEM_REVEAL_DISTANCE && cameraDistance < 112}>
          <OrbitField positions={sceneModel.orbitPositions} colors={sceneModel.orbitColors} />
        </group>
        <group visible={cameraDistance >= SOLAR_SYSTEM_REVEAL_DISTANCE && cameraDistance < 160}>
          <StarCloud
            positions={sceneModel.markerPositions}
            colors={sceneModel.markerColors}
            sizes={sceneModel.markerSizes}
            renderOrder={5}
            onSelectIndex={(index) => onSelectObject(sceneModel.objects[index]?.id ?? null)}
            onHoverIndex={(index) => onHoverObject(index === null ? null : sceneModel.objects[index]?.id ?? null)}
          />
        </group>
        <Suspense fallback={null}>
          <SolarSystemOverview
            sceneModel={sceneModel}
            cameraDistance={cameraDistance}
            showCloseOverview={!focusObject}
            qualityTier={qualityTier}
            glowTexture={glowTexture}
            selectedObjectId={selectedObjectId}
            onSelectObject={onSelectObject}
          />
        </Suspense>
        <InterstellarProbeMarkers
          sceneModel={sceneModel}
          cameraDistance={cameraDistance}
          glowTexture={glowTexture}
          selectedObjectId={selectedObjectId}
          onSelectObject={onSelectObject}
        />
        <StellarLandmarks sceneModel={sceneModel} cameraDistance={cameraDistance} />
        <SkyMapStructures
          structures={structureRenderables}
          qualityProfile={qualityProfile}
          cameraDistance={cameraDistance}
          onMilkyWayCatalogStatus={noopStructureStatus}
          onDesiLightconeStatus={noopStructureStatus}
        />
        <LocalGroupScene
          sceneModel={sceneModel}
          cameraDistance={cameraDistance}
          glowTexture={glowTexture}
          selectedObjectId={selectedObjectId}
          onSelectObject={onSelectObject}
        />
        <Suspense fallback={null}>
          <CosmicWebScene cameraDistance={cameraDistance} qualityTier={qualityTier} glowTexture={glowTexture} />
        </Suspense>
        <Suspense fallback={null}>
          <FocusedObjectLod object={focusObject} glowTexture={glowTexture} />
        </Suspense>
        {cameraDistance >= SOLAR_SYSTEM_REVEAL_DISTANCE && cameraDistance < 160 ? sceneModel.labels.filter((object) => object.kind !== "spacecraft").map((object) => (
          <Html key={object.id} position={object.position} center zIndexRange={[18, 1]}>
            <span
              className={`skymap-celestial-label skymap-celestial-label--${object.kind}${object.id === selectedObjectId ? " is-selected" : ""}`}
              data-object-label={object.label}
            >
              {object.label}
            </span>
          </Html>
        )) : null}
        <CameraRig
          focusObject={focusObject}
          focusRequestId={focusRequestId}
          cancelFlightToken={cancelFlightToken}
          resetRequestId={navigationState.resetRequestId}
          zoomCommand={zoomCommand}
          onDistanceChange={onViewportDistanceChange}
          onManualNavigation={() => {
            setLaunchContextVisible(false);
            onManualNavigation();
          }}
          onCameraFlightChange={onCameraFlightChange}
        />
        <RendererDiagnostics renderables={renderables} qualityTier={qualityTier} timePlayback={timePlayback} />
        <BloomPipeline />
      </Canvas>

      {launchContextVisible && !selectedObjectId && !focusedObjectId ? (
        <div className="skymap-launch-context" aria-label="Cross-scale launch context">
          <span className="skymap-launch-context__galactic-center">Sagittarius A*</span>
          <span className="skymap-launch-context__planet skymap-launch-context__pluto">Pluto</span>
          <span className="skymap-launch-context__catalogue skymap-launch-context__arches">Arches Cluster</span>
          <span className="skymap-launch-context__catalogue skymap-launch-context__quintuplet">Quintuplet Cluster</span>
          <span className="skymap-launch-context__catalogue skymap-launch-context__sgr-dsph">Sgr dSph</span>
          <span className="skymap-launch-context__planet skymap-launch-context__venus">Venus</span>
          <span className="skymap-launch-context__planet skymap-launch-context__sun">Sun</span>
          <span className="skymap-launch-context__planet skymap-launch-context__mars">Mars</span>
          <span className="skymap-launch-context__catalogue skymap-launch-context__smc">SMC</span>
          <span className="skymap-launch-context__catalogue skymap-launch-context__lmc">LMC</span>
          <span className="skymap-launch-context__alpha-centauri">Alpha Centauri</span>
          <span className="skymap-launch-context__catalogue skymap-launch-context__jewel-box">Jewel Box</span>
        </div>
      ) : null}

      {scaleStage.id === "galactic" ? (
        <div className="skymap-scale-landmark skymap-scale-landmark--galactic" aria-hidden="true">
          <span>Our galaxy</span>
          <strong>Milky Way</strong>
          <small>Photometric disk · 199 measured VLBI masers · 7 fitted arm segments</small>
        </div>
      ) : scaleStage.id === "local-group" ? (
        <div className="skymap-scale-landmark skymap-scale-landmark--local-group" aria-hidden="true">
          <span>Our galactic neighbourhood</span>
          <strong>Local Group</strong>
          <small>117 LVDB galaxies · physical directions · logarithmic radius</small>
        </div>
      ) : scaleStage.id === "cosmic-web" ? (
        <div className="skymap-scale-landmark skymap-scale-landmark--cosmos" aria-hidden="true">
          <span>Large-scale context</span>
          <strong>Cosmic web</strong>
          <small>Context filaments · measured DESI DR1 survey overlay</small>
        </div>
      ) : scaleStage.id === "observable" ? (
        <div className="skymap-scale-landmark skymap-scale-landmark--cosmos" aria-hidden="true">
          <span>Outermost scale</span>
          <strong>Observable universe</strong>
          <small>Large-scale context volume · beyond the Local Group</small>
        </div>
      ) : null}

      <div className="skymap-scene-readout" aria-live="polite">
        <span>ESA / Gaia EDR3 all-sky colour map</span>
        <strong>{catalogPointCount.toLocaleString()} Gaia stars · {objectCount.toLocaleString()} searchable objects</strong>
      </div>
      <div
        className="skymap-continuous-scale"
        data-scale-stage={scaleStage.id}
        style={scaleStyle}
        aria-label={`Continuous universe scale: ${scaleStage.label}`}
        aria-live="polite"
      >
        <div className="skymap-continuous-scale__heading">
          <strong>{scaleStage.label}</strong>
          <span>{scaleStage.context}</span>
        </div>
        <div className="skymap-continuous-scale__track" aria-hidden="true"><i /></div>
        <div className="skymap-continuous-scale__labels" aria-hidden="true">
          <span>Planet</span><span>Solar</span><span>Stars</span><span>Milky Way</span><span>Local Group</span><span>Web</span><span>Universe</span>
        </div>
      </div>
      <div className="skymap-scene-zoom" aria-label="Universe zoom controls">
        <button type="button" aria-label="Zoom in" onClick={() => handleZoom(0.64)}>+</button>
        <button type="button" aria-label="Zoom out" onClick={() => handleZoom(1.58)}>−</button>
      </div>
    </div>
  );
};

export default GalaxiumSkyMapViewport;
