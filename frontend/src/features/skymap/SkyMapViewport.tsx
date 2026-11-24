import { useCallback, useEffect, useMemo, useRef, useState, type FC } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls, Stars, useTexture } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  BackSide,
  CanvasTexture,
  Color,
  DoubleSide,
  MathUtils,
  NormalBlending,
  SRGBColorSpace,
  Vector3,
  type Group,
  type MeshBasicMaterial,
} from "three";
import type { Intersection, Object3D, Raycaster } from "three";
import type { SkyObjectId } from "./core/objects";
import type {
  SkyLineRenderable,
  SkyMeshRenderable,
  SkyPointRenderable,
  SkyRenderable,
  SkyStructureRenderable,
} from "./core/renderers";
import { isSkyLineRenderable, isSkyMeshRenderable, isSkyPointRenderable, isSkyStructureRenderable } from "./core/renderers";
import {
  createSkyMapFocusCameraPose,
  createSkyMapOverviewCameraPose,
  formatSkyMapNavigationMode,
  getSkyMapScaleBandDefinition,
  SKYMAP_DEFAULT_CAMERA_POSE,
  SKYMAP_SCALE_BANDS,
  type SkyMapCameraPose,
  type SkyMapNavigationState,
} from "./core/navigation";
import { StarField, type StarRenderDatum } from "../starmap/starRenderer";
import CatalogStarField from "../starmap/CatalogStarField";
import type { DecodedStarCatalogChunk, StarCatalogFilterDiagnostics } from "../../lib/catalog/starCatalogTypes";
import { useRenderActivity } from "../../lib/rendering/useRenderActivity";
import WebGLCanvasLifecycle from "../../lib/rendering/WebGLCanvasLifecycle";
import { ASTRONOMICAL_WEBGL_OPTIONS } from "../../domain/astro/rendererBackend";
import AdaptiveQualityMonitor from "../../lib/rendering/AdaptiveQualityMonitor";
import type { SkyMapPlaybackState } from "./core/time";
import {
  ASTRO_QUALITY_PROFILES,
  type AstroQualityProfile,
  type AstroQualityTier,
} from "../../lib/rendering/qualityManager";
import type { AdaptiveQualityReport } from "../../lib/rendering/adaptiveQuality";
import {
  loadMilkyWayTracerCatalog,
  MILKY_WAY_CATALOG_METADATA,
  type DecodedMilkyWayTracerCatalog,
} from "../../lib/catalog/milkyWayTracerCatalog";
import {
  DESI_LIGHTCONE_CATALOG_METADATA,
  loadDesiLightconeCatalog,
  type DecodedDesiLightconeCatalog,
} from "../../lib/catalog/desiLightconeCatalog";
import { SKYMAP_LABEL_BUDGETS, selectNonOverlappingLabelIds } from "./core/labelLayout";
import {
  createCameraFlightState,
  shouldReduceCameraFlightMotionInBrowser,
  type CameraFlightState,
} from "../../domain/astro/cameraFlight";

interface SkyMapViewportProps {
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

interface FocusTransition {
  fromCamera: Vector3;
  toCamera: Vector3;
  fromTarget: Vector3;
  toTarget: Vector3;
  startedAt: number | null;
  duration: number;
}

type FocusableRenderable = SkyPointRenderable | SkyMeshRenderable;
type MilkyWayStructureRenderable = Omit<SkyStructureRenderable, "structureMetadata"> & {
  structureMetadata: Extract<SkyStructureRenderable["structureMetadata"], { shape: "milky-way-schematic" }>;
};
type MilkyWayCatalogueStructureRenderable = Omit<SkyStructureRenderable, "structureMetadata"> & {
  structureMetadata: Extract<SkyStructureRenderable["structureMetadata"], { shape: "milky-way-catalogue" }>;
};
type DesiLightconeStructureRenderable = Omit<SkyStructureRenderable, "structureMetadata"> & {
  structureMetadata: Extract<SkyStructureRenderable["structureMetadata"], { shape: "desi-redshift-lightcone" }>;
};

interface MilkyWayCatalogRenderStatus {
  status: "idle" | "loading" | "ready" | "fallback";
  recordCount: number;
  message: string;
  error?: string;
}

interface DesiLightconeRenderStatus {
  status: "idle" | "loading" | "ready" | "fallback";
  renderedCount: number;
  sourceCount: number;
  message: string;
  error?: string;
}

const ignoreRaycast = (_raycaster: Raycaster, _intersections: Intersection<Object3D>[]) => undefined;

const toScenePosition = (renderable: FocusableRenderable) =>
  [renderable.position.x, renderable.position.y, renderable.position.z] as [number, number, number];

const toVector3 = (renderable: FocusableRenderable) =>
  new Vector3(renderable.position.x, renderable.position.y, renderable.position.z);

const getRenderableLabel = (renderable: FocusableRenderable) =>
  renderable.kind === "point" ? renderable.label : renderable.label ?? renderable.objectId;

const getRenderableRadius = (renderable: FocusableRenderable) =>
  renderable.kind === "mesh" ? renderable.radiusSceneUnits ?? 0.24 : 0.55;

const getRenderableFocusRadius = (renderable: FocusableRenderable) =>
  renderable.kind === "mesh" ? renderable.focusRadiusSceneUnits ?? getRenderableRadius(renderable) : getRenderableRadius(renderable);

const SkyMapLineOverlay: FC<{ line: SkyLineRenderable }> = ({ line }) => {
  const positions = useMemo(() => {
    const segmentCount = line.paths.reduce((sum, path) => sum + Math.max(0, path.length - 1), 0);
    const values = new Float32Array(segmentCount * 6);
    let offset = 0;
    line.paths.forEach((path) => {
      for (let index = 0; index < path.length - 1; index += 1) {
        const start = path[index];
        const end = path[index + 1];
        values[offset] = start.x;
        values[offset + 1] = start.y;
        values[offset + 2] = start.z;
        values[offset + 3] = end.x;
        values[offset + 4] = end.y;
        values[offset + 5] = end.z;
        offset += 6;
      }
    });
    return values;
  }, [line.paths]);

  return (
    <lineSegments frustumCulled={false} raycast={ignoreRaycast}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial
        color={line.color ?? "#72d7ff"}
        transparent
        opacity={line.opacity ?? 0.24}
        depthTest={line.depthTest ?? false}
        depthWrite={false}
        blending={AdditiveBlending}
        toneMapped={false}
      />
    </lineSegments>
  );
};

const SkyMapLineOverlays: FC<{ lines: SkyLineRenderable[] }> = ({ lines }) => (
  <group name="skymap-line-overlays">
    {lines.map((line) => <SkyMapLineOverlay key={line.id} line={line} />)}
  </group>
);

const getMeshPrimaryScale = (mesh: SkyMeshRenderable): [number, number, number] => {
  switch (mesh.meshMetadata?.shape) {
    case "galaxy-disk":
      return [1.9, 0.26, 0.82];
    case "nebula-cloud":
      return [1.42, 0.78, 1.12];
    case "cluster-halo":
      return [1.08, 1.08, 1.08];
    case "sphere":
    default:
      return [1, 1, 1];
  }
};

const getMeshSecondaryScale = (mesh: SkyMeshRenderable): [number, number, number] => {
  switch (mesh.meshMetadata?.shape) {
    case "galaxy-disk":
      return [2.7, 0.08, 1.08];
    case "nebula-cloud":
      return [1.95, 1.08, 1.52];
    case "cluster-halo":
      return [1.72, 1.72, 1.72];
    case "sphere":
    default:
      return [1.9, 1.9, 1.9];
  }
};

const getMeshSegments = (mesh: SkyMeshRenderable, segmentBudget: number): [number, number] => {
  if (mesh.meshMetadata?.family === "solar-body") return [segmentBudget, segmentBudget];
  return [segmentBudget, Math.max(12, Math.round(segmentBudget / 2))];
};

const createSeededRandom = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

type CelestialTextureKind = "galaxy" | "nebula" | "cluster";

const createCelestialTexture = (kind: CelestialTextureKind) => {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) return new CanvasTexture(canvas);

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.globalCompositeOperation = "lighter";
  const random = createSeededRandom(kind === "galaxy" ? 7341 : kind === "nebula" ? 9187 : 4219);

  if (kind === "galaxy") {
    context.save();
    context.translate(128, 128);
    context.rotate(-0.22);
    context.scale(1, 0.46);
    const disk = context.createRadialGradient(0, 0, 4, 0, 0, 112);
    disk.addColorStop(0, "rgba(255,250,230,0.98)");
    disk.addColorStop(0.08, "rgba(255,213,158,0.9)");
    disk.addColorStop(0.28, "rgba(173,204,255,0.52)");
    disk.addColorStop(0.68, "rgba(92,135,220,0.16)");
    disk.addColorStop(1, "rgba(36,64,128,0)");
    context.fillStyle = disk;
    context.beginPath();
    context.arc(0, 0, 116, 0, Math.PI * 2);
    context.fill();

    for (let arm = 0; arm < 4; arm += 1) {
      context.beginPath();
      for (let sample = 0; sample <= 100; sample += 1) {
        const progress = sample / 100;
        const angle = arm * (Math.PI / 2) + progress * Math.PI * 2.15;
        const radius = 8 + progress * 100;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        if (sample === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.lineWidth = 6.5;
      context.strokeStyle = "rgba(177,211,255,0.18)";
      context.stroke();
      context.lineWidth = 1.4;
      context.strokeStyle = "rgba(245,249,255,0.44)";
      context.stroke();
    }
    context.restore();
  } else if (kind === "nebula") {
    for (let cloud = 0; cloud < 18; cloud += 1) {
      const x = 70 + random() * 116;
      const y = 62 + random() * 132;
      const radius = 22 + random() * 58;
      const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, `rgba(255,255,255,${0.08 + random() * 0.12})`);
      gradient.addColorStop(0.28, `rgba(177,210,255,${0.08 + random() * 0.12})`);
      gradient.addColorStop(1, "rgba(89,114,191,0)");
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    }
  } else {
    const halo = context.createRadialGradient(128, 128, 1, 128, 128, 116);
    halo.addColorStop(0, "rgba(255,255,255,0.55)");
    halo.addColorStop(0.16, "rgba(218,229,255,0.28)");
    halo.addColorStop(0.6, "rgba(133,166,236,0.08)");
    halo.addColorStop(1, "rgba(80,112,188,0)");
    context.fillStyle = halo;
    context.fillRect(0, 0, 256, 256);
    for (let star = 0; star < 110; star += 1) {
      const angle = random() * Math.PI * 2;
      const radius = Math.pow(random(), 1.75) * 106;
      const size = 0.6 + random() * 2.2;
      context.fillStyle = `rgba(255,255,255,${0.38 + random() * 0.62})`;
      context.beginPath();
      context.arc(128 + Math.cos(angle) * radius, 128 + Math.sin(angle) * radius, size, 0, Math.PI * 2);
      context.fill();
    }
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
};

const GALACTIC_SKY_VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const GALACTIC_SKY_FRAGMENT_SHADER = `
  precision highp float;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.55;
    for (int octave = 0; octave < 5; octave++) {
      value += noise(p) * amplitude;
      p = p * 2.07 + vec2(13.7, 9.2);
      amplitude *= 0.48;
    }
    return value;
  }

  void main() {
    vec2 uv = vUv;
    float longitude = uv.x * 6.2831853;
    float warp = (fbm(vec2(uv.x * 3.2, 0.37)) - 0.5) * 0.12;
    float latitude = abs(uv.y - 0.5 + warp + sin(longitude * 1.35) * 0.018);
    float band = exp(-pow(latitude * 8.8, 1.45));
    float fineBand = exp(-pow(latitude * 22.0, 1.25));
    float cloud = fbm(vec2(uv.x * 18.0, uv.y * 12.0));
    float filament = fbm(vec2(uv.x * 42.0 + 3.0, uv.y * 25.0));
    float dust = smoothstep(0.37, 0.82, cloud * 0.72 + filament * 0.38);
    float coreLongitude = min(abs(uv.x - 0.72), 1.0 - abs(uv.x - 0.72));
    float core = exp(-coreLongitude * 8.0) * exp(-latitude * 13.0);
    float rift = smoothstep(0.53, 0.82, fbm(vec2(uv.x * 28.0, uv.y * 9.0 + 4.0))) * fineBand;

    vec3 night = vec3(0.0015, 0.0035, 0.009);
    vec3 cool = vec3(0.22, 0.34, 0.58);
    vec3 warm = vec3(0.94, 0.63, 0.34);
    vec3 colour = night;
    colour += mix(cool, warm, core) * band * (0.08 + dust * 0.34);
    colour += vec3(0.62, 0.72, 0.9) * fineBand * filament * 0.11;
    colour *= 1.0 - rift * 0.58;
    colour += warm * core * 0.24;

    vec2 starGrid = floor(uv * vec2(1500.0, 750.0));
    float starSeed = hash(starGrid);
    float star = smoothstep(0.994, 1.0, starSeed);
    float starTemperature = hash(starGrid + 17.0);
    vec3 starColour = mix(vec3(0.56, 0.72, 1.0), vec3(1.0, 0.78, 0.5), starTemperature);
    colour += starColour * star * (0.18 + hash(starGrid + 31.0) * 0.62);

    gl_FragColor = vec4(colour, 1.0);
  }
`;

const GalacticSkyBackdrop: FC = () => (
  <mesh rotation={[0, 0.06, -0.16]} renderOrder={-100} raycast={ignoreRaycast}>
    <sphereGeometry args={[520, 64, 40]} />
    <shaderMaterial
      vertexShader={GALACTIC_SKY_VERTEX_SHADER}
      fragmentShader={GALACTIC_SKY_FRAGMENT_SHADER}
      side={BackSide}
      depthTest={false}
      depthWrite={false}
      toneMapped={false}
    />
  </mesh>
);

const buildMilkyWayPointCloud = (structure: MilkyWayStructureRenderable, pointCount: number) => {
  const { structureMetadata: model } = structure;
  const random = createSeededRandom(model.seed);
  const positions = new Float32Array(pointCount * 3);
  const colors = new Float32Array(pointCount * 3);
  const innerColor = new Color("#ffd4a1");
  const armColor = new Color("#b9d6ff");
  const outerColor = new Color("#7e9fd8");
  const scratchColor = new Color();
  const pitch = MathUtils.degToRad(model.pitchAngleDeg);

  for (let index = 0; index < pointCount; index += 1) {
    const offset = index * 3;
    const population = random();
    let radius: number;
    let theta = random() * Math.PI * 2;
    let height: number;
    let radialProgress: number;

    if (population < 0.7) {
      radialProgress = Math.pow(random(), 0.84);
      radius = MathUtils.lerp(model.innerArmRadiusSceneUnits, model.radiusSceneUnits, radialProgress);
      const armIndex = index % model.armCount;
      theta =
        (armIndex / model.armCount) * Math.PI * 2 +
        Math.log(radius / model.innerArmRadiusSceneUnits) / Math.tan(pitch) +
        (random() - 0.5) * MathUtils.lerp(0.32, 0.13, radialProgress);
      radius += (random() + random() - 1) * MathUtils.lerp(2.5, 1.25, radialProgress);
      height = (random() + random() - 1) * model.thicknessSceneUnits * 0.44;
    } else if (population < 0.91) {
      radialProgress = Math.sqrt(random());
      radius = radialProgress * model.radiusSceneUnits;
      height = (random() + random() - 1) * model.thicknessSceneUnits * 0.58;
    } else {
      radialProgress = Math.pow(random(), 2.35) * 0.24;
      radius = radialProgress * model.radiusSceneUnits;
      height = (random() + random() - 1) * model.thicknessSceneUnits * 1.4;
    }

    positions[offset] = Math.cos(theta) * radius;
    positions[offset + 1] = height;
    positions[offset + 2] = Math.sin(theta) * radius;

    scratchColor
      .copy(innerColor)
      .lerp(armColor, MathUtils.smoothstep(radialProgress, 0.05, 0.62))
      .lerp(outerColor, MathUtils.smoothstep(radialProgress, 0.65, 1));
    const brightnessJitter = 0.72 + random() * 0.28;
    colors[offset] = scratchColor.r * brightnessJitter;
    colors[offset + 1] = scratchColor.g * brightnessJitter;
    colors[offset + 2] = scratchColor.b * brightnessJitter;
  }

  return { positions, colors };
};

const MilkyWayStructure: FC<{
  structure: MilkyWayStructureRenderable;
  qualityProfile: AstroQualityProfile;
}> = ({ structure, qualityProfile }) => {
  const pointCount = qualityProfile.galaxyPointBudget;
  const pointCloud = useMemo(() => buildMilkyWayPointCloud(structure, pointCount), [pointCount, structure]);
  const model = structure.structureMetadata;
  const latitudeSegments = Math.max(12, Math.round(qualityProfile.skyMeshSegments / 2));

  return (
    <group position={[structure.position.x, structure.position.y, structure.position.z]}>
      <points renderOrder={-3} raycast={ignoreRaycast}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[pointCloud.positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[pointCloud.colors, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color="#ffffff"
          size={qualityProfile.performanceMode ? 0.48 : 0.62}
          sizeAttenuation
          vertexColors
          transparent
          opacity={structure.opacity ?? 0.56}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </points>
      <mesh rotation={[Math.PI / 2, 0, 0]} renderOrder={-4} raycast={ignoreRaycast}>
        <circleGeometry args={[model.radiusSceneUnits, qualityProfile.skyMeshSegments * 2]} />
        <meshBasicMaterial
          color="#4f6fa6"
          transparent
          opacity={0.025}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh scale={[model.innerArmRadiusSceneUnits * 0.82, model.thicknessSceneUnits * 1.1, model.innerArmRadiusSceneUnits * 0.58]} raycast={ignoreRaycast}>
        <sphereGeometry args={[1, qualityProfile.skyMeshSegments, latitudeSegments]} />
        <meshBasicMaterial
          color="#ffd19a"
          transparent
          opacity={0.055}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
};

const gaussianSample = (random: () => number) => {
  const radius = Math.sqrt(-2 * Math.log(Math.max(Number.EPSILON, random())));
  return radius * Math.cos(2 * Math.PI * random());
};

const buildMeasuredArmGeometry = (pointCount: number) => {
  const { segments, intrinsicWidthSlopeKpcPerKpc } = MILKY_WAY_CATALOG_METADATA.armModel;
  const random = createSeededRandom(2019131);
  const positions = new Float32Array(pointCount * 3);
  const colors = new Float32Array(pointCount * 3);
  const spans = segments.map((segment) => Math.max(1, segment.betaMaxDeg - segment.betaMinDeg));
  const totalSpan = spans.reduce((sum, span) => sum + span, 0);
  const cumulativeSpans = spans.reduce<number[]>((values, span) => {
    values.push((values.at(-1) ?? 0) + span);
    return values;
  }, []);
  const scratchColor = new Color();

  for (let index = 0; index < pointCount; index += 1) {
    const selection = random() * totalSpan;
    const segmentIndex = Math.max(0, cumulativeSpans.findIndex((boundary) => selection <= boundary));
    const segment = segments[segmentIndex];
    const betaDeg = MathUtils.lerp(segment.betaMinDeg, segment.betaMaxDeg, random());
    const pitchDeg = betaDeg <= segment.betaKinkDeg ? segment.pitchBeforeDeg : segment.pitchAfterDeg;
    const betaOffsetRad = MathUtils.degToRad(betaDeg - segment.betaKinkDeg);
    const radiusKpc = segment.radiusKinkKpc * Math.exp(-betaOffsetRad * Math.tan(MathUtils.degToRad(pitchDeg)));
    const widthKpc = Math.max(
      0.04,
      segment.widthKpc + intrinsicWidthSlopeKpcPerKpc * (radiusKpc - segment.radiusKinkKpc),
    );
    const scatteredRadiusKpc = Math.max(0.2, radiusKpc + gaussianSample(random) * widthKpc);
    const betaRad = MathUtils.degToRad(betaDeg);
    const offset = index * 3;
    positions[offset] = Math.cos(betaRad) * scatteredRadiusKpc;
    positions[offset + 1] = gaussianSample(random) * 0.035;
    positions[offset + 2] = Math.sin(betaRad) * scatteredRadiusKpc;
    scratchColor.set(segment.color).multiplyScalar(0.68 + random() * 0.32);
    colors[offset] = scratchColor.r;
    colors[offset + 1] = scratchColor.g;
    colors[offset + 2] = scratchColor.b;
  }

  const samplesPerSegment = 64;
  const centerlinePositions = new Float32Array(segments.length * (samplesPerSegment - 1) * 6);
  let centerlineOffset = 0;
  segments.forEach((segment) => {
    const pointAt = (sampleIndex: number) => {
      const betaDeg = MathUtils.lerp(segment.betaMinDeg, segment.betaMaxDeg, sampleIndex / (samplesPerSegment - 1));
      const pitchDeg = betaDeg <= segment.betaKinkDeg ? segment.pitchBeforeDeg : segment.pitchAfterDeg;
      const radiusKpc = segment.radiusKinkKpc * Math.exp(
        -MathUtils.degToRad(betaDeg - segment.betaKinkDeg) * Math.tan(MathUtils.degToRad(pitchDeg)),
      );
      const betaRad = MathUtils.degToRad(betaDeg);
      return [Math.cos(betaRad) * radiusKpc, 0, Math.sin(betaRad) * radiusKpc] as const;
    };
    for (let sampleIndex = 0; sampleIndex < samplesPerSegment - 1; sampleIndex += 1) {
      const start = pointAt(sampleIndex);
      const end = pointAt(sampleIndex + 1);
      centerlinePositions.set([...start, ...end], centerlineOffset);
      centerlineOffset += 6;
    }
  });
  return { positions, colors, centerlinePositions };
};

const buildTracerColors = (catalog: DecodedMilkyWayTracerCatalog) => {
  const colors = new Float32Array(catalog.recordCount * 3);
  const scratch = new Color();
  for (let index = 0; index < catalog.recordCount; index += 1) {
    const segmentIndex = catalog.segmentIndices[index];
    const segment = segmentIndex === 255 ? null : MILKY_WAY_CATALOG_METADATA.armModel.segments[segmentIndex];
    scratch.set(segment?.color ?? "#f4f7ff");
    const reliability = MathUtils.clamp(catalog.markerWeights[index], 0.42, 1);
    scratch.lerp(new Color("#ffffff"), 0.22).multiplyScalar(0.78 + reliability * 0.35);
    const offset = index * 3;
    colors[offset] = scratch.r;
    colors[offset + 1] = scratch.g;
    colors[offset + 2] = scratch.b;
  }
  return colors;
};

const buildMilkyWayCatalogueFallback = (
  structure: MilkyWayCatalogueStructureRenderable,
  pointCount: number,
) => {
  const model = structure.structureMetadata;
  const random = createSeededRandom(model.seed);
  const positions = new Float32Array(pointCount * 3);
  const colors = new Float32Array(pointCount * 3);
  const innerColor = new Color("#bda887");
  const outerColor = new Color("#64799d");
  const scratchColor = new Color();
  const pitch = MathUtils.degToRad(model.fallbackPitchAngleDeg);
  const radiusKpc = model.radiusSceneUnits / model.sceneUnitsPerKpc;

  for (let index = 0; index < pointCount; index += 1) {
    const progress = Math.pow(random(), 0.84);
    let radius = MathUtils.lerp(model.fallbackInnerRadiusKpc, radiusKpc, progress);
    const armIndex = index % model.fallbackArmCount;
    const theta =
      (armIndex / model.fallbackArmCount) * Math.PI * 2 +
      Math.log(radius / model.fallbackInnerRadiusKpc) / Math.tan(pitch) +
      (random() - 0.5) * 0.3;
    radius += (random() + random() - 1) * MathUtils.lerp(0.62, 0.3, progress);
    const offset = index * 3;
    positions[offset] = Math.cos(theta) * radius;
    positions[offset + 1] = (random() + random() - 1) * model.fallbackThicknessKpc * 0.42;
    positions[offset + 2] = Math.sin(theta) * radius;
    scratchColor.copy(innerColor).lerp(outerColor, progress).multiplyScalar(0.65 + random() * 0.25);
    colors[offset] = scratchColor.r;
    colors[offset + 1] = scratchColor.g;
    colors[offset + 2] = scratchColor.b;
  }
  return { positions, colors };
};

const MilkyWayCatalogueStructure: FC<{
  structure: MilkyWayCatalogueStructureRenderable;
  qualityProfile: AstroQualityProfile;
  cameraDistance: number;
  onCatalogStatus: (status: MilkyWayCatalogRenderStatus) => void;
}> = ({ structure, qualityProfile, cameraDistance, onCatalogStatus }) => {
  const [catalog, setCatalog] = useState<DecodedMilkyWayTracerCatalog | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const model = structure.structureMetadata;
  const diskSource = useTexture("/assets/sky/milky-way-face-on-v1.png");
  const diskTexture = useMemo(() => {
    const texture = diskSource.clone();
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }, [diskSource]);
  const armGeometry = useMemo(
    () => buildMeasuredArmGeometry(Math.max(900, qualityProfile.galaxyPointBudget)),
    [qualityProfile.galaxyPointBudget],
  );
  const fallback = useMemo(
    () => buildMilkyWayCatalogueFallback(structure, Math.max(420, Math.round(qualityProfile.galaxyPointBudget * 0.32))),
    [qualityProfile.galaxyPointBudget, structure],
  );
  const tracerColors = useMemo(() => (catalog ? buildTracerColors(catalog) : null), [catalog]);
  const latitudeSegments = Math.max(12, Math.round(qualityProfile.skyMeshSegments / 2));
  const radiusKpc = model.radiusSceneUnits / model.sceneUnitsPerKpc;
  const reveal = MathUtils.clamp((cameraDistance - 205) / 125, 0, 1);
  const farFade = 1 - MathUtils.clamp((cameraDistance - 2_700) / 1_000, 0, 1);
  const diskOpacity = reveal * farFade;
  const surveyOpacity = MathUtils.lerp(0.16, 0.56, 1 - MathUtils.clamp((cameraDistance - 260) / 540, 0, 1));

  useEffect(() => {
    let active = true;
    onCatalogStatus({
      status: "loading",
      recordCount: 0,
      message: "Loading the Reid et al. VLBI maser binary; a low-opacity schematic is shown temporarily.",
    });
    void loadMilkyWayTracerCatalog()
      .then((decoded) => {
        if (!active) return;
        setCatalog(decoded);
        setLoadError(null);
        onCatalogStatus({
          status: "ready",
          recordCount: decoded.recordCount,
          message: `${decoded.recordCount} measured VLBI masers and ${model.fittedSegmentCount} fitted arm segments verified.`,
        });
      })
      .catch((error: unknown) => {
        if (!active) return;
        const message = error instanceof Error ? error.message : String(error);
        setLoadError(message);
        onCatalogStatus({
          status: "fallback",
          recordCount: 0,
          message: "Measured Milky Way data could not be loaded; the schematic fallback is active.",
          error: message,
        });
      });
    return () => {
      active = false;
    };
  }, [model.fittedSegmentCount, onCatalogStatus]);
  useEffect(() => () => diskTexture.dispose(), [diskTexture]);

  return (
    <group
      name={catalog ? "milky-way-reid2019-catalogue" : "milky-way-schematic-fallback"}
      position={[0, structure.position.y, structure.position.z]}
      rotation={[0.24, -0.12, -0.3]}
      scale={[model.sceneUnitsPerKpc, model.sceneUnitsPerKpc, model.sceneUnitsPerKpc]}
      visible={diskOpacity > 0.001}
      userData={{
        modelStatus: catalog ? "catalog-derived" : "scientific-schematic-fallback",
        recordCount: catalog?.recordCount ?? 0,
        loadError,
      }}
    >
      <mesh rotation={[Math.PI / 2, 0, -0.035]} renderOrder={-8} raycast={ignoreRaycast}>
        <planeGeometry args={[radiusKpc * 2.28, radiusKpc * 2.28]} />
        <meshBasicMaterial
          map={diskTexture}
          transparent
          opacity={0.86 * diskOpacity}
          blending={NormalBlending}
          depthWrite={false}
          side={DoubleSide}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, 0.11, 0]} rotation={[Math.PI / 2, 0, 0.035]} scale={[1.025, 1.025, 1.025]} renderOrder={-7} raycast={ignoreRaycast}>
        <planeGeometry args={[radiusKpc * 2.28, radiusKpc * 2.28]} />
        <meshBasicMaterial
          map={diskTexture}
          color="#b9d2ff"
          transparent
          opacity={0.28 * diskOpacity}
          blending={AdditiveBlending}
          depthWrite={false}
          side={DoubleSide}
          toneMapped={false}
        />
      </mesh>
      <points
        name={catalog ? "milky-way-model-context" : "milky-way-schematic-fallback"}
        renderOrder={-4}
        raycast={ignoreRaycast}
      >
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[fallback.positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[fallback.colors, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color="#ffffff"
          size={qualityProfile.performanceMode ? 0.8 : 1}
          sizeAttenuation
          vertexColors
          transparent
          opacity={(catalog ? 0.18 : loadError ? 0.34 : 0.2) * diskOpacity}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </points>
      {catalog && tracerColors ? (
        <>
          <points name="reid2019-vlbi-maser-tracers" renderOrder={-1} raycast={ignoreRaycast} frustumCulled={false}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[catalog.positionsKpc, 3]} />
              <bufferAttribute attach="attributes-color" args={[tracerColors, 3]} />
            </bufferGeometry>
            <pointsMaterial
              color="#ffffff"
              size={qualityProfile.performanceMode ? 0.18 : 0.24}
              sizeAttenuation
              vertexColors
              transparent
              opacity={0.82 * surveyOpacity * diskOpacity}
              blending={AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </points>
          <lineSegments name="reid2019-reciprocal-parallax-spans" renderOrder={-3} raycast={ignoreRaycast}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[catalog.uncertaintySegmentsKpc, 3]} />
            </bufferGeometry>
            <lineBasicMaterial color="#dceaff" transparent opacity={0.022} depthWrite={false} toneMapped={false} />
          </lineSegments>
          <points name="reid2019-arm-width-density" renderOrder={-4} raycast={ignoreRaycast}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[armGeometry.positions, 3]} />
              <bufferAttribute attach="attributes-color" args={[armGeometry.colors, 3]} />
            </bufferGeometry>
            <pointsMaterial
              color="#ffffff"
              size={qualityProfile.performanceMode ? 0.4 : 0.55}
              sizeAttenuation
              vertexColors
              transparent
              opacity={Math.min(0.34, (structure.opacity ?? 0.56) * 0.54) * surveyOpacity * diskOpacity}
              blending={AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </points>
          <lineSegments name="reid2019-arm-fit-centerlines" renderOrder={-2} raycast={ignoreRaycast}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[armGeometry.centerlinePositions, 3]} />
            </bufferGeometry>
            <lineBasicMaterial color="#a9cbef" transparent opacity={0.035 * surveyOpacity * diskOpacity} depthWrite={false} toneMapped={false} />
          </lineSegments>
        </>
      ) : null}
      <mesh rotation={[Math.PI / 2, 0, 0]} renderOrder={-5} raycast={ignoreRaycast}>
        <circleGeometry args={[radiusKpc, qualityProfile.skyMeshSegments * 2]} />
        <meshBasicMaterial color="#4f6fa6" transparent opacity={0.02} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh scale={[0.9, 0.35, 0.7]} raycast={ignoreRaycast}>
        <sphereGeometry args={[1, qualityProfile.skyMeshSegments, latitudeSegments]} />
        <meshBasicMaterial color="#ffd19a" transparent opacity={0.14 * diskOpacity} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[model.galactocentricSunDistanceKpc, 0.12, 0]} renderOrder={3} raycast={ignoreRaycast}>
        <sphereGeometry args={[0.1, 12, 8]} />
        <meshBasicMaterial color="#f8fbff" transparent opacity={0.92 * diskOpacity} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      {diskOpacity > 0.001 ? (
        <Html position={[model.galactocentricSunDistanceKpc, 0.5, 0]} center zIndexRange={[12, 2]}>
          <span className="skymap-local-group-label skymap-local-group-label--home" style={{ opacity: diskOpacity }}>
            Sun
          </span>
        </Html>
      ) : null}
    </group>
  );
};

const desiLocalDirection = (raDeg: number, decDeg: number) => {
  const centerRa = MathUtils.degToRad(190);
  const centerDec = MathUtils.degToRad(35);
  const ra = MathUtils.degToRad(raDeg);
  const dec = MathUtils.degToRad(decDeg);
  const direction = [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
  const right = [-Math.sin(centerRa), Math.cos(centerRa), 0];
  const up = [-Math.sin(centerDec) * Math.cos(centerRa), -Math.sin(centerDec) * Math.sin(centerRa), Math.cos(centerDec)];
  const forward = [Math.cos(centerDec) * Math.cos(centerRa), Math.cos(centerDec) * Math.sin(centerRa), Math.sin(centerDec)];
  const dot = (basis: number[]) => direction.reduce((sum, value, axis) => sum + value * basis[axis], 0);
  return [dot(right), dot(up), dot(forward)] as const;
};

const buildDesiSelectionGuide = (structure: DesiLightconeStructureRenderable) => {
  const model = structure.structureMetadata;
  const distanceRange = DESI_LIGHTCONE_CATALOG_METADATA.coordinates.distanceRangeMpc;
  const radii = [distanceRange.minimum, distanceRange.maximum].map((distance) => distance * model.sceneUnitsPerMpc);
  const segments: number[] = [];
  const pointAt = (raDeg: number, decDeg: number, radius: number) => {
    const direction = desiLocalDirection(raDeg, decDeg);
    return direction.map((value) => value * radius) as [number, number, number];
  };
  const appendSegment = (start: readonly number[], end: readonly number[]) => segments.push(...start, ...end);
  const edgeSamples = 18;
  radii.forEach((radius) => {
    const perimeter: Array<[number, number, number]> = [];
    for (let index = 0; index <= edgeSamples; index += 1) {
      const progress = index / edgeSamples;
      perimeter.push(pointAt(MathUtils.lerp(model.raMinDeg, model.raMaxDeg, progress), model.decMinDeg, radius));
    }
    for (let index = 1; index <= edgeSamples; index += 1) {
      const progress = index / edgeSamples;
      perimeter.push(pointAt(model.raMaxDeg, MathUtils.lerp(model.decMinDeg, model.decMaxDeg, progress), radius));
    }
    for (let index = 1; index <= edgeSamples; index += 1) {
      const progress = index / edgeSamples;
      perimeter.push(pointAt(MathUtils.lerp(model.raMaxDeg, model.raMinDeg, progress), model.decMaxDeg, radius));
    }
    for (let index = 1; index <= edgeSamples; index += 1) {
      const progress = index / edgeSamples;
      perimeter.push(pointAt(model.raMinDeg, MathUtils.lerp(model.decMaxDeg, model.decMinDeg, progress), radius));
    }
    perimeter.forEach((point, index) => appendSegment(point, perimeter[(index + 1) % perimeter.length]));
  });
  [
    [model.raMinDeg, model.decMinDeg],
    [model.raMinDeg, model.decMaxDeg],
    [model.raMaxDeg, model.decMinDeg],
    [model.raMaxDeg, model.decMaxDeg],
  ].forEach(([raDeg, decDeg]) => {
    appendSegment([0, 0, 0], pointAt(raDeg, decDeg, radii[1]));
    appendSegment(pointAt(raDeg, decDeg, radii[0]), pointAt(raDeg, decDeg, radii[1]));
  });
  return new Float32Array(segments);
};

const buildDesiFallbackPoints = (structure: DesiLightconeStructureRenderable) => {
  const model = structure.structureMetadata;
  const random = createSeededRandom(model.fallbackSeed);
  const distanceRange = DESI_LIGHTCONE_CATALOG_METADATA.coordinates.distanceRangeMpc;
  const positions = new Float32Array(model.fallbackNodeCount * 3);
  for (let index = 0; index < model.fallbackNodeCount; index += 1) {
    const direction = desiLocalDirection(
      MathUtils.lerp(model.raMinDeg, model.raMaxDeg, random()),
      MathUtils.lerp(model.decMinDeg, model.decMaxDeg, random()),
    );
    const distanceMpc = MathUtils.lerp(distanceRange.minimum, distanceRange.maximum, Math.cbrt(random()));
    const offset = index * 3;
    positions[offset] = direction[0] * distanceMpc * model.sceneUnitsPerMpc;
    positions[offset + 1] = direction[1] * distanceMpc * model.sceneUnitsPerMpc;
    positions[offset + 2] = direction[2] * distanceMpc * model.sceneUnitsPerMpc;
  }
  return positions;
};

const DesiLightconeStructure: FC<{
  structure: DesiLightconeStructureRenderable;
  qualityProfile: AstroQualityProfile;
  cameraDistance: number;
  onCatalogStatus: (status: DesiLightconeRenderStatus) => void;
}> = ({ structure, qualityProfile, cameraDistance, onCatalogStatus }) => {
  const requestedCount = Math.min(
    structure.structureMetadata.tracerCount,
    qualityProfile.desiLightconePointBlocks * 512,
  );
  const [catalog, setCatalog] = useState<DecodedDesiLightconeCatalog | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const guidePositions = useMemo(() => buildDesiSelectionGuide(structure), [structure]);
  const fallbackPositions = useMemo(() => buildDesiFallbackPoints(structure), [structure]);
  const nearReveal = MathUtils.clamp((cameraDistance - 1_450) / 520, 0, 1);
  const farFade = 1 - MathUtils.clamp((cameraDistance - 2_650) / 950, 0, 1);
  const reveal = nearReveal * farFade;
  const presentationScale = MathUtils.lerp(4.8, 10.5, MathUtils.clamp((cameraDistance - 1_450) / 2_500, 0, 1));

  useEffect(() => {
    let active = true;
    onCatalogStatus({
      status: "loading",
      renderedCount: 0,
      sourceCount: structure.structureMetadata.tracerCount,
      message: "Loading the provenance-checked DESI DR1 light-cone binary; a sparse schematic fallback is shown temporarily.",
    });
    void loadDesiLightconeCatalog(requestedCount)
      .then((decoded) => {
        if (!active) return;
        setCatalog(decoded);
        setLoadError(null);
        onCatalogStatus({
          status: "ready",
          renderedCount: decoded.recordCount,
          sourceCount: structure.structureMetadata.tracerCount,
          message: `${decoded.recordCount.toLocaleString()} of ${structure.structureMetadata.tracerCount.toLocaleString()} measured DESI DR1 galaxies rendered at this quality tier.`,
        });
      })
      .catch((error: unknown) => {
        if (!active) return;
        const message = error instanceof Error ? error.message : String(error);
        setCatalog(null);
        setLoadError(message);
        onCatalogStatus({
          status: "fallback",
          renderedCount: 0,
          sourceCount: structure.structureMetadata.tracerCount,
          message: "Measured DESI survey data could not be loaded; a sparse schematic fallback is active.",
          error: message,
        });
      });
    return () => {
      active = false;
    };
  }, [onCatalogStatus, requestedCount, structure.structureMetadata.tracerCount]);

  return (
    <group
      name={catalog ? "desi-dr1-measured-galaxy-lightcone" : "desi-lightcone-schematic-fallback"}
      position={[structure.position.x, structure.position.y, structure.position.z]}
      rotation={[0.3, -0.72, 0.12]}
      scale={[presentationScale, presentationScale, presentationScale]}
      visible={reveal > 0.001}
      userData={{
        modelStatus: catalog ? "catalog-derived" : "scientific-schematic-fallback",
        recordCount: catalog?.recordCount ?? 0,
        sourceCount: structure.structureMetadata.tracerCount,
        loadError,
      }}
    >
      {catalog ? (
        <points name="desi-dr1-measured-galaxies" renderOrder={-2} raycast={ignoreRaycast} frustumCulled={false}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[catalog.positionsScene, 3]} />
            <bufferAttribute attach="attributes-color" args={[catalog.colors, 3]} />
          </bufferGeometry>
          <pointsMaterial
            color="#ffffff"
            size={qualityProfile.performanceMode ? 0.075 : 0.095}
            sizeAttenuation
            vertexColors
            transparent
            opacity={Math.min(0.13, (structure.opacity ?? 0.62) * 0.2) * reveal}
            blending={NormalBlending}
            depthWrite={false}
          />
        </points>
      ) : (
        <points name="desi-lightcone-schematic-fallback" renderOrder={-3} raycast={ignoreRaycast}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[fallbackPositions, 3]} />
          </bufferGeometry>
          <pointsMaterial
            color="#77cbea"
            size={qualityProfile.performanceMode ? 0.22 : 0.28}
            sizeAttenuation
            transparent
            opacity={(loadError ? 0.12 : 0.055) * reveal}
            blending={AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </points>
      )}
      <lineSegments name="desi-selection-footprint-guide" raycast={ignoreRaycast} renderOrder={-5}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[guidePositions, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#6eacc8" transparent opacity={0.014 * reveal} depthWrite={false} toneMapped={false} />
      </lineSegments>
    </group>
  );
};

export const SkyMapStructures: FC<{
  structures: SkyStructureRenderable[];
  qualityProfile: AstroQualityProfile;
  cameraDistance: number;
  onMilkyWayCatalogStatus: (status: MilkyWayCatalogRenderStatus) => void;
  onDesiLightconeStatus: (status: DesiLightconeRenderStatus) => void;
}> = ({ structures, qualityProfile, cameraDistance, onMilkyWayCatalogStatus, onDesiLightconeStatus }) => (
  <group>
    {structures.map((structure) => (
      structure.structureMetadata.shape === "milky-way-catalogue" ? (
        <MilkyWayCatalogueStructure
          key={structure.id}
          structure={structure as MilkyWayCatalogueStructureRenderable}
          qualityProfile={qualityProfile}
          cameraDistance={cameraDistance}
          onCatalogStatus={onMilkyWayCatalogStatus}
        />
      ) : structure.structureMetadata.shape === "milky-way-schematic" ? (
        <MilkyWayStructure key={structure.id} structure={structure as MilkyWayStructureRenderable} qualityProfile={qualityProfile} />
      ) : structure.structureMetadata.shape === "desi-redshift-lightcone" ? (
        <DesiLightconeStructure
            key={structure.id}
            structure={structure as DesiLightconeStructureRenderable}
            qualityProfile={qualityProfile}
            cameraDistance={cameraDistance}
            onCatalogStatus={onDesiLightconeStatus}
        />
      ) : null
    ))}
  </group>
);

const toCameraVector = (vector: Vector3) => ({ x: vector.x, y: vector.y, z: vector.z });

const toVectorFromPose = (vector: SkyMapCameraPose["position"]) => new Vector3(vector.x, vector.y, vector.z);

const createTransitionFromPose = (
  pose: SkyMapCameraPose,
  currentCamera: Vector3,
  currentTarget: Vector3,
): FocusTransition => ({
  fromCamera: currentCamera,
  toCamera: toVectorFromPose(pose.position),
  fromTarget: currentTarget,
  toTarget: toVectorFromPose(pose.target),
  startedAt: null,
  duration: pose.durationSeconds,
});

const toStarRenderDatum = (point: SkyPointRenderable): StarRenderDatum => {
  const fallbackDistance = Math.hypot(point.position.x, point.position.y, point.position.z);
  return {
    objectId: point.objectId,
    name: point.label,
    x: point.position.x,
    y: point.position.y,
    z: point.position.z,
    distanceLy: point.pointMetadata?.distanceLy ?? fallbackDistance,
    spectralType: point.pointMetadata?.spectralType,
    luminosity: point.pointMetadata?.luminositySolar,
    temperature: point.pointMetadata?.temperatureK,
    apparentMagnitude: point.pointMetadata?.apparentMagnitude,
  };
};

const SKYMAP_ORIENTATION_BANDS = [
  SKYMAP_SCALE_BANDS["solar-context"],
  SKYMAP_SCALE_BANDS["stellar-neighborhood"],
  SKYMAP_SCALE_BANDS["wide-field"],
] as const;

const formatCameraDistance = (distance: number) => {
  if (!Number.isFinite(distance)) return "Calibrating";
  if (distance >= 100) return `${Math.round(distance)} scene units`;
  if (distance >= 10) return `${distance.toFixed(1)} scene units`;
  return `${distance.toFixed(2)} scene units`;
};

const formatScaleRange = ([min, max]: [number, number]) =>
  Number.isFinite(max) ? `${min}-${max}u` : `${min}u+`;

const SkyMapFocusMarker: FC<{ renderable: FocusableRenderable | null }> = ({ renderable }) => {
  const groupRef = useRef<Group | null>(null);
  const haloRef = useRef<MeshBasicMaterial | null>(null);

  useFrame((state) => {
    if (!groupRef.current || !haloRef.current) return;
    const pulse = 1 + Math.sin(state.clock.elapsedTime * 1.6) * 0.04;
    groupRef.current.scale.setScalar(pulse);
    haloRef.current.opacity = 0.18 + Math.sin(state.clock.elapsedTime * 1.3) * 0.035;
  });

  if (!renderable) return null;
  const tint = new Color(renderable.color ?? "#f4f7ff");
  const renderableRadius = getRenderableRadius(renderable);
  const markerRadius = MathUtils.clamp(Math.max(0.55, renderableRadius * 1.16), 0.55, 4.8);
  const haloRadius = MathUtils.clamp(Math.max(1.7, renderableRadius * 3.4), 1.7, 13);

  return (
    <group ref={groupRef} position={toScenePosition(renderable)}>
      <mesh raycast={ignoreRaycast}>
        <sphereGeometry args={[markerRadius, 24, 24]} />
        <meshBasicMaterial color={new Color("#ffffff").lerp(tint, 0.2)} toneMapped={false} />
      </mesh>
      <mesh raycast={ignoreRaycast}>
        <sphereGeometry args={[haloRadius, 24, 24]} />
        <meshBasicMaterial
          ref={haloRef}
          color={tint}
          transparent
          opacity={0.18}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
};

const SkyMapHoverMarker: FC<{ renderable: FocusableRenderable | null; selectedObjectId: SkyObjectId | null }> = ({
  renderable,
  selectedObjectId,
}) => {
  const groupRef = useRef<Group | null>(null);
  const haloRef = useRef<MeshBasicMaterial | null>(null);

  useFrame((state) => {
    if (!groupRef.current || !haloRef.current) return;
    const pulse = 1 + Math.sin(state.clock.elapsedTime * 3.2) * 0.05;
    groupRef.current.scale.setScalar(pulse);
    haloRef.current.opacity = 0.1 + Math.sin(state.clock.elapsedTime * 2.4) * 0.025;
  });

  if (!renderable || renderable.objectId === selectedObjectId) return null;
  const tint = new Color(renderable.color ?? "#f4f7ff");
  const renderableRadius = getRenderableRadius(renderable);
  const markerRadius = MathUtils.clamp(Math.max(0.32, renderableRadius * 0.8), 0.32, 3.2);
  const haloRadius = MathUtils.clamp(Math.max(1.08, renderableRadius * 2.4), 1.08, 9);

  return (
    <group ref={groupRef} position={toScenePosition(renderable)}>
      <mesh raycast={ignoreRaycast}>
        <sphereGeometry args={[markerRadius, 20, 20]} />
        <meshBasicMaterial color={new Color("#ffffff").lerp(tint, 0.3)} toneMapped={false} />
      </mesh>
      <mesh raycast={ignoreRaycast}>
        <sphereGeometry args={[haloRadius, 20, 20]} />
        <meshBasicMaterial
          ref={haloRef}
          color={tint}
          transparent
          opacity={0.1}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
};

const SkyMapLabels: FC<{
  renderables: FocusableRenderable[];
  selectedObjectId: SkyObjectId | null;
  hoveredObjectId: SkyObjectId | null;
  focusedObjectId: SkyObjectId | null;
  cameraDistance: number;
  navigationState: SkyMapNavigationState;
  qualityTier: AstroQualityTier;
}> = ({
  renderables,
  selectedObjectId,
  hoveredObjectId,
  focusedObjectId,
  cameraDistance,
  navigationState,
  qualityTier,
}) => {
  const { camera, size } = useThree();
  const projectedPosition = useMemo(() => new Vector3(), []);
  const lastLayoutAtRef = useRef(-1);
  const showContextLabels = navigationState.scaleBand !== "wide-field" && cameraDistance < 86;
  const contextPriority = navigationState.scaleBand === "solar-context" ? 55 : 84;
  const eligibleLabels = useMemo(() => {
    return renderables
      .filter((renderable) => {
        const priority = renderable.labelPriority ?? 0;
        return (
          renderable.objectId === selectedObjectId ||
          renderable.objectId === hoveredObjectId ||
          renderable.objectId === focusedObjectId ||
          priority >= 95 ||
          (showContextLabels && priority >= contextPriority)
        );
      })
      .sort((a, b) => {
        const aFeatured =
          a.objectId === selectedObjectId || a.objectId === hoveredObjectId || a.objectId === focusedObjectId;
        const bFeatured =
          b.objectId === selectedObjectId || b.objectId === hoveredObjectId || b.objectId === focusedObjectId;
        if (aFeatured !== bFeatured) return aFeatured ? -1 : 1;
        return (b.labelPriority ?? 0) - (a.labelPriority ?? 0);
      })
      .slice(0, SKYMAP_LABEL_BUDGETS[qualityTier] * 3);
  }, [contextPriority, focusedObjectId, hoveredObjectId, qualityTier, renderables, selectedObjectId, showContextLabels]);

  const [visibleLabelIds, setVisibleLabelIds] = useState<Set<string>>(
    () => new Set(eligibleLabels.slice(0, SKYMAP_LABEL_BUDGETS[qualityTier]).map((item) => item.id)),
  );

  useFrame((state) => {
    if (state.clock.elapsedTime - lastLayoutAtRef.current < 0.12) return;
    lastLayoutAtRef.current = state.clock.elapsedTime;
    const candidates = eligibleLabels.flatMap((renderable) => {
      const [x, y, z] = toScenePosition(renderable);
      projectedPosition
        .set(x + 0.8, y + 0.48 + getRenderableRadius(renderable) * 0.35, z)
        .project(camera);
      if (projectedPosition.z < -1 || projectedPosition.z > 1) return [];
      const label = getRenderableLabel(renderable);
      const selected = renderable.objectId === selectedObjectId;
      const hovered = renderable.objectId === hoveredObjectId;
      const focused = renderable.objectId === focusedObjectId;
      return [
        {
          id: renderable.id,
          x: (projectedPosition.x * 0.5 + 0.5) * size.width,
          y: (-projectedPosition.y * 0.5 + 0.5) * size.height,
          width: MathUtils.clamp(label.length * 7 + 22, 58, 210),
          height: 28,
          priority: selected ? 10_000 : hovered ? 9_000 : focused ? 8_000 : renderable.labelPriority ?? 0,
          pinned: selected || hovered || focused,
        },
      ];
    });
    const nextIds = selectNonOverlappingLabelIds(
      candidates,
      { width: size.width, height: size.height, edgePadding: 10, collisionPadding: 6 },
      SKYMAP_LABEL_BUDGETS[qualityTier],
    );
    setVisibleLabelIds((current) => {
      if (current.size === nextIds.length && nextIds.every((id) => current.has(id))) return current;
      return new Set(nextIds);
    });
  });

  const labelRenderables = eligibleLabels
    .filter((renderable) => visibleLabelIds.has(renderable.id))
    .slice(0, SKYMAP_LABEL_BUDGETS[qualityTier]);

  return (
    <group>
      {labelRenderables.map((renderable) => {
        const selected = renderable.objectId === selectedObjectId;
        const hovered = renderable.objectId === hoveredObjectId;
        const opacity = selected || hovered ? 1 : 0.58;
        const [x, y, z] = toScenePosition(renderable);
        return (
          <Html
            key={renderable.id}
            position={[x + 0.8, y + 0.48 + getRenderableRadius(renderable) * 0.35, z]}
            center
            style={{ pointerEvents: "none" }}
          >
            <div
              className={`skymap-star-label ${selected ? "is-selected" : ""}`}
              data-label-object-id={renderable.objectId}
              style={{ opacity }}
            >
              {getRenderableLabel(renderable)}
            </div>
          </Html>
        );
      })}
    </group>
  );
};

const SkyMapMeshObjects: FC<{
  meshes: SkyMeshRenderable[];
  meshSegments: number;
  selectedObjectId: SkyObjectId | null;
  hoveredObjectId: SkyObjectId | null;
  onSelectObject: (objectId: SkyObjectId | null) => void;
  onHoverObject: (objectId: SkyObjectId | null) => void;
}> = ({ meshes, meshSegments, selectedObjectId, hoveredObjectId, onSelectObject, onHoverObject }) => {
  const celestialTextures = useMemo(
    () => ({
      galaxy: createCelestialTexture("galaxy"),
      nebula: createCelestialTexture("nebula"),
      cluster: createCelestialTexture("cluster"),
    }),
    [],
  );

  useEffect(
    () => () => {
      celestialTextures.galaxy.dispose();
      celestialTextures.nebula.dispose();
      celestialTextures.cluster.dispose();
    },
    [celestialTextures],
  );

  return (
    <group>
      {meshes.map((mesh) => {
        const selected = mesh.objectId === selectedObjectId;
        const hovered = mesh.objectId === hoveredObjectId;
        const radius = mesh.radiusSceneUnits ?? 0.2;
        const tint = new Color(mesh.color ?? "#f4f7ff");
        const opacity = MathUtils.clamp((mesh.opacity ?? 0.9) + (selected ? 0.08 : hovered ? 0.04 : 0), 0, 1);
        const primaryScale = getMeshPrimaryScale(mesh);
        const secondaryScale = getMeshSecondaryScale(mesh);
        const segments = getMeshSegments(mesh, meshSegments);
        const secondarySegments: [number, number] = [
          Math.max(16, Math.round(meshSegments * 0.75)),
          Math.max(12, Math.round(meshSegments * 0.4)),
        ];
        const celestialFamily =
          mesh.meshMetadata?.family === "galaxy" ||
          mesh.meshMetadata?.family === "nebula" ||
          mesh.meshMetadata?.family === "cluster";
        const deepSpaceFamily = mesh.meshMetadata?.family && mesh.meshMetadata.family !== "solar-body";
        const secondaryOpacity = deepSpaceFamily ? (selected ? 0.24 : hovered ? 0.18 : 0.1) : selected ? 0.2 : 0.12;
        const isSun = mesh.objectId === "solar:sun";

        if (celestialFamily) {
          const textureKey = mesh.meshMetadata?.family as CelestialTextureKind;
          const aspectScale =
            textureKey === "galaxy"
              ? ([5.8, 2.6, 1] as const)
              : textureKey === "nebula"
                ? ([5.1, 4.1, 1] as const)
                : ([3.9, 3.9, 1] as const);
          const emphasis = selected ? 1.35 : hovered ? 1.18 : 1;
          return (
            <group key={mesh.id} position={toScenePosition(mesh)}>
              <sprite
                scale={[
                  radius * aspectScale[0] * emphasis,
                  radius * aspectScale[1] * emphasis,
                  aspectScale[2],
                ]}
                onPointerDown={(event) => {
                  if (mesh.interactive === false) return;
                  event.stopPropagation();
                  onSelectObject(mesh.objectId);
                }}
                onPointerMove={(event) => {
                  if (mesh.interactive === false) return;
                  event.stopPropagation();
                  onHoverObject(mesh.objectId);
                }}
                onPointerOut={(event) => {
                  if (mesh.interactive === false) return;
                  event.stopPropagation();
                  onHoverObject(null);
                }}
              >
                <spriteMaterial
                  map={celestialTextures[textureKey]}
                  color={tint}
                  transparent
                  opacity={MathUtils.clamp(opacity * (selected ? 1 : 0.84), 0, 1)}
                  blending={AdditiveBlending}
                  depthWrite={false}
                  toneMapped={false}
                />
              </sprite>
              {selected ? <pointLight color={tint} intensity={1.4} distance={radius * 12} decay={2} /> : null}
            </group>
          );
        }

        return (
          <group key={mesh.id} position={toScenePosition(mesh)} rotation={mesh.meshMetadata?.rotation}>
            <mesh
              scale={primaryScale}
              onPointerDown={(event) => {
                if (mesh.interactive === false) return;
                event.stopPropagation();
                onSelectObject(mesh.objectId);
              }}
              onPointerMove={(event) => {
                if (mesh.interactive === false) return;
                event.stopPropagation();
                onHoverObject(mesh.objectId);
              }}
              onPointerOut={(event) => {
                if (mesh.interactive === false) return;
                event.stopPropagation();
                onHoverObject(null);
              }}
            >
              <sphereGeometry args={[radius, segments[0], segments[1]]} />
              {mesh.meshMetadata?.family === "solar-body" && !isSun ? (
                <meshStandardMaterial
                  color={new Color("#ffffff").lerp(tint, selected || hovered ? 0.72 : 0.88)}
                  emissive={tint}
                  emissiveIntensity={selected || hovered ? 0.16 : 0.045}
                  roughness={0.72}
                  metalness={0.02}
                  transparent
                  opacity={opacity}
                />
              ) : (
                <meshBasicMaterial
                  color={new Color("#ffffff").lerp(tint, selected || hovered ? 0.78 : 0.92)}
                  transparent
                  opacity={opacity}
                  blending={deepSpaceFamily || isSun ? AdditiveBlending : undefined}
                  depthWrite={!deepSpaceFamily}
                  toneMapped={false}
                />
              )}
            </mesh>
            {isSun ? (
              <>
                <pointLight color="#ffd7a0" intensity={22} distance={92} decay={2} />
                <mesh scale={[2.8, 2.8, 2.8]} raycast={ignoreRaycast}>
                  <sphereGeometry args={[radius, ...secondarySegments]} />
                  <meshBasicMaterial
                    color="#ffb85f"
                    transparent
                    opacity={0.17}
                    blending={AdditiveBlending}
                    depthWrite={false}
                    toneMapped={false}
                  />
                </mesh>
                <mesh scale={[6.2, 6.2, 6.2]} raycast={ignoreRaycast}>
                  <sphereGeometry args={[radius, ...secondarySegments]} />
                  <meshBasicMaterial
                    color="#ff8d3d"
                    transparent
                    opacity={0.032}
                    blending={AdditiveBlending}
                    depthWrite={false}
                    toneMapped={false}
                  />
                </mesh>
              </>
            ) : null}
            {selected || hovered || deepSpaceFamily ? (
              <mesh scale={secondaryScale} raycast={ignoreRaycast}>
                <sphereGeometry args={[radius * (selected || hovered ? 2.15 : 1.28), ...secondarySegments]} />
                <meshBasicMaterial
                  color={tint}
                  transparent
                  opacity={secondaryOpacity}
                  blending={AdditiveBlending}
                  depthWrite={false}
                  toneMapped={false}
                />
              </mesh>
            ) : null}
            {mesh.meshMetadata?.shape === "cluster-halo" ? (
              <mesh scale={[0.42, 0.42, 0.42]} raycast={ignoreRaycast}>
                <sphereGeometry args={[radius, ...secondarySegments]} />
                <meshBasicMaterial color="#ffffff" transparent opacity={0.52} toneMapped={false} />
              </mesh>
            ) : null}
          </group>
        );
      })}
    </group>
  );
};

const SkyMapScene: FC<{
  renderables: SkyRenderable[];
  catalogChunks: DecodedStarCatalogChunk[];
  selectedObjectId: SkyObjectId | null;
  hoveredObjectId: SkyObjectId | null;
  focusedObjectId: SkyObjectId | null;
  focusRequestId: number;
  cancelFlightToken: number;
  navigationState: SkyMapNavigationState;
  cameraDistance: number;
  onSelectObject: (objectId: SkyObjectId | null) => void;
  onHoverObject: (objectId: SkyObjectId | null) => void;
  onViewportDistanceChange: (cameraDistance: number) => void;
  onManualNavigation: () => void;
  onCameraFlightChange: (flight: CameraFlightState | null) => void;
  timePlayback: SkyMapPlaybackState;
  qualityTier: AstroQualityTier;
  onCatalogFilterDiagnostics: (diagnostics: StarCatalogFilterDiagnostics) => void;
  onMilkyWayCatalogStatus: (status: MilkyWayCatalogRenderStatus) => void;
  onDesiLightconeStatus: (status: DesiLightconeRenderStatus) => void;
}> = ({
  renderables,
  catalogChunks,
  selectedObjectId,
  hoveredObjectId,
  focusedObjectId,
  focusRequestId,
  cancelFlightToken,
  navigationState,
  cameraDistance: initialCameraDistance,
  onSelectObject,
  onHoverObject,
  onViewportDistanceChange,
  onManualNavigation,
  onCameraFlightChange,
  timePlayback,
  qualityTier,
  onCatalogFilterDiagnostics,
  onMilkyWayCatalogStatus,
  onDesiLightconeStatus,
}) => {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const focusTransitionRef = useRef<FocusTransition | null>(null);
  const lastCancelFlightTokenRef = useRef(cancelFlightToken);
  const lastAppliedFocusRequestRef = useRef(0);
  const lastAppliedResetRequestRef = useRef(0);
  const trackedFocusObjectRef = useRef<{ objectId: SkyObjectId; position: Vector3 } | null>(null);
  const { camera } = useThree();
  const [cameraDistance, setCameraDistance] = useState(initialCameraDistance);
  const lastDistanceReportRef = useRef(0);
  const points = useMemo(() => renderables.filter(isSkyPointRenderable), [renderables]);
  const meshes = useMemo(() => renderables.filter(isSkyMeshRenderable), [renderables]);
  const structures = useMemo(() => renderables.filter(isSkyStructureRenderable), [renderables]);
  const lines = useMemo(() => renderables.filter(isSkyLineRenderable), [renderables]);
  const focusableRenderables = useMemo<FocusableRenderable[]>(() => [...points, ...meshes], [meshes, points]);
  const interactivePoints = useMemo(() => points.filter((point) => point.interactive !== false), [points]);
  const passivePoints = useMemo(() => points.filter((point) => point.interactive === false), [points]);
  const interactiveStarData = useMemo(() => interactivePoints.map(toStarRenderDatum), [interactivePoints]);
  const passiveStarData = useMemo(() => passivePoints.map(toStarRenderDatum), [passivePoints]);
  const selectedRenderable = useMemo(
    () => focusableRenderables.find((renderable) => renderable.objectId === selectedObjectId) ?? null,
    [focusableRenderables, selectedObjectId],
  );
  const selectedPoint = selectedRenderable?.kind === "point" ? selectedRenderable : null;
  const hoveredRenderable = useMemo(
    () => focusableRenderables.find((renderable) => renderable.objectId === hoveredObjectId) ?? null,
    [focusableRenderables, hoveredObjectId],
  );
  const focusedRenderable = useMemo(
    () =>
      navigationState.mode === "object-focus"
        ? focusableRenderables.find((renderable) => renderable.objectId === focusedObjectId) ?? selectedRenderable
        : null,
    [focusableRenderables, focusedObjectId, navigationState.mode, selectedRenderable],
  );
  const qualityProfile = ASTRO_QUALITY_PROFILES[qualityTier];
  const renderReasons = useMemo(
    () =>
      [
        timePlayback === "playing" ? "time-playback" : null,
      ].filter((reason): reason is string => Boolean(reason)),
    [timePlayback],
  );
  const { requestRender } = useRenderActivity({
    label: "skymap",
    active: renderReasons.length > 0,
    reasons: renderReasons,
    diagnostics: {
      renderables: renderables.length,
      points: points.length,
      meshes: meshes.length,
      structures: structures.length,
      lines: lines.length,
      cameraDistance: Math.round(cameraDistance),
      qualityTier,
      starBudget: qualityProfile.starBudget,
      labelBudget: qualityProfile.labelBudget,
      backgroundStarBudget: qualityProfile.backgroundStarBudget,
      skyMeshSegments: qualityProfile.skyMeshSegments,
      galaxyPointBudget: qualityProfile.galaxyPointBudget,
      desiLightconePointBlocks: qualityProfile.desiLightconePointBlocks,
    },
  });

  const beginFocusTransition = useCallback(
    (pose: SkyMapCameraPose, currentCamera: Vector3, currentTarget: Vector3, label: string, renderReason: string) => {
      const transition = createTransitionFromPose(pose, currentCamera, currentTarget);
      if (shouldReduceCameraFlightMotionInBrowser()) {
        focusTransitionRef.current = null;
        camera.position.copy(transition.toCamera);
        if (controlsRef.current) {
          controlsRef.current.target.copy(transition.toTarget);
          controlsRef.current.update();
        }
        onCameraFlightChange(null);
        requestRender(240, `${renderReason}-reduced-motion`);
        return;
      }

      focusTransitionRef.current = transition;
      onCameraFlightChange(createCameraFlightState("skymap", label));
      requestRender((pose.durationSeconds + 0.2) * 1000, renderReason);
    },
    [camera, onCameraFlightChange, requestRender],
  );

  const cancelFocusTransition = useCallback(
    (renderReason: string) => {
      const wasActive = focusTransitionRef.current !== null;
      focusTransitionRef.current = null;
      trackedFocusObjectRef.current = null;
      if (wasActive) {
        onCameraFlightChange(null);
      }
      requestRender(240, renderReason);
    },
    [onCameraFlightChange, requestRender],
  );

  useEffect(() => {
    if (lastCancelFlightTokenRef.current === cancelFlightToken) return;
    lastCancelFlightTokenRef.current = cancelFlightToken;
    cancelFocusTransition("camera-flight-cancel");
  }, [cancelFlightToken, cancelFocusTransition]);

  useEffect(() => {
    if (navigationState.mode !== "object-focus" || !focusedRenderable || focusRequestId <= 0) return;
    if (lastAppliedFocusRequestRef.current === focusRequestId) return;
    lastAppliedFocusRequestRef.current = focusRequestId;

    const currentTarget = controlsRef.current?.target.clone() ?? new Vector3();
    const currentCamera = camera.position.clone();
    const pose = createSkyMapFocusCameraPose(
      {
        objectId: focusedRenderable.objectId,
        position: focusedRenderable.position,
        radiusSceneUnits: getRenderableFocusRadius(focusedRenderable),
      },
      toCameraVector(currentCamera),
      toCameraVector(currentTarget),
    );

    beginFocusTransition(
      pose,
      currentCamera,
      currentTarget,
      `Flying to ${getRenderableLabel(focusedRenderable)}`,
      "focus-transition",
    );
  }, [beginFocusTransition, camera, focusRequestId, focusedRenderable, navigationState.mode]);

  useEffect(() => {
    if (navigationState.resetRequestId <= 0) return;
    if (lastAppliedResetRequestRef.current === navigationState.resetRequestId) return;
    lastAppliedResetRequestRef.current = navigationState.resetRequestId;

    const currentTarget = controlsRef.current?.target.clone() ?? new Vector3();
    const currentCamera = camera.position.clone();
    const overviewPose = createSkyMapOverviewCameraPose();
    beginFocusTransition(
      overviewPose,
      currentCamera,
      currentTarget,
      "Resetting SkyMap overview",
      "overview-reset",
    );
    trackedFocusObjectRef.current = null;
  }, [beginFocusTransition, camera, navigationState.resetRequestId]);

  useEffect(() => {
    if (navigationState.mode !== "object-focus" || !focusedRenderable || !controlsRef.current) {
      trackedFocusObjectRef.current = null;
      return;
    }

    const nextPosition = toVector3(focusedRenderable);
    const previous = trackedFocusObjectRef.current;
    if (previous?.objectId === focusedRenderable.objectId && focusTransitionRef.current === null) {
      const delta = nextPosition.clone().sub(previous.position);
      if (delta.lengthSq() > 0.0001) {
        camera.position.add(delta);
        controlsRef.current.target.add(delta);
        controlsRef.current.update();
        requestRender(220, "tracked-object-shift");
      }
    }

    trackedFocusObjectRef.current = {
      objectId: focusedRenderable.objectId,
      position: nextPosition,
    };
  }, [camera, focusedRenderable, navigationState.mode, requestRender]);

  useFrame((state) => {
    const transition = focusTransitionRef.current;
    if (transition) {
      if (transition.startedAt === null) {
        transition.startedAt = state.clock.elapsedTime;
      }
      const rawProgress = MathUtils.clamp((state.clock.elapsedTime - transition.startedAt) / transition.duration, 0, 1);
      const easedProgress = MathUtils.smoothstep(rawProgress, 0, 1);
      camera.position.lerpVectors(transition.fromCamera, transition.toCamera, easedProgress);
      controlsRef.current?.target.lerpVectors(transition.fromTarget, transition.toTarget, easedProgress);
      if (rawProgress >= 1) {
        focusTransitionRef.current = null;
        onCameraFlightChange(null);
      }
    }

    const controlsTarget = controlsRef.current?.target;
    const nextDistance = controlsTarget ? camera.position.distanceTo(controlsTarget) : camera.position.length();
    if (Math.abs(nextDistance - cameraDistance) > 0.45 && state.clock.elapsedTime - lastDistanceReportRef.current > 0.12) {
      lastDistanceReportRef.current = state.clock.elapsedTime;
      setCameraDistance(nextDistance);
      onViewportDistanceChange(nextDistance);
    }
    controlsRef.current?.update();
  });

  return (
    <>
      <GalacticSkyBackdrop />
      <ambientLight intensity={0.2} />
      <directionalLight color="#b9d7ff" intensity={0.72} position={[42, 28, 58]} />
      <directionalLight color="#ffba72" intensity={0.3} position={[-36, -12, -28]} />
      <Stars
        radius={238}
        depth={118}
        count={qualityProfile.backgroundStarBudget}
        factor={2.35}
        saturation={0.72}
        fade
      />
      <Stars
        radius={128}
        depth={76}
        count={Math.max(320, Math.round(qualityProfile.backgroundStarBudget * 0.34))}
        factor={4.7}
        saturation={0.42}
        fade
      />
      <SkyMapLineOverlays lines={lines} />
      <CatalogStarField
        chunks={catalogChunks}
        opacity={0.72}
        positionScale={0.8}
        pointBudget={qualityProfile.starBudget}
        magnitudeLimitG={qualityProfile.starMagnitudeLimitG}
        performanceMode={qualityProfile.performanceMode}
        surface="skymap"
        onFilterDiagnostics={onCatalogFilterDiagnostics}
      />
      <StarField
        stars={passiveStarData}
        opacity={0.46}
        cameraDistance={cameraDistance}
        performanceMode={qualityProfile.performanceMode}
        debugMode={false}
        positionScale={1}
        interactive={false}
      />
      <StarField
        stars={interactiveStarData}
        cameraDistance={cameraDistance}
        performanceMode={false}
        debugMode={false}
        positionScale={1}
        selectedStarName={selectedPoint?.label ?? null}
        onSelect={(star) => onSelectObject(star.objectId ?? null)}
        onHover={(star) => onHoverObject(star?.objectId ?? null)}
      />
      <SkyMapMeshObjects
        meshes={meshes}
        meshSegments={qualityProfile.skyMeshSegments}
        selectedObjectId={selectedObjectId}
        hoveredObjectId={hoveredObjectId}
        onSelectObject={onSelectObject}
        onHoverObject={onHoverObject}
      />
      <SkyMapStructures
        structures={structures}
        qualityProfile={qualityProfile}
        cameraDistance={cameraDistance}
        onMilkyWayCatalogStatus={onMilkyWayCatalogStatus}
        onDesiLightconeStatus={onDesiLightconeStatus}
      />
      <SkyMapFocusMarker renderable={selectedRenderable} />
      <SkyMapHoverMarker renderable={hoveredRenderable} selectedObjectId={selectedObjectId} />
      <SkyMapLabels
        renderables={focusableRenderables}
        selectedObjectId={selectedObjectId}
        hoveredObjectId={hoveredObjectId}
        focusedObjectId={focusedObjectId}
        cameraDistance={cameraDistance}
        navigationState={navigationState}
        qualityTier={qualityTier}
      />
      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.1}
        rotateSpeed={0.18}
        zoomSpeed={0.55}
        panSpeed={0.32}
        minDistance={6}
        maxDistance={260}
        screenSpacePanning={false}
        onStart={() => {
          cancelFocusTransition("orbit-controls");
          onManualNavigation();
        }}
        onChange={() => requestRender(180, "orbit-controls-change")}
        onEnd={() => requestRender(360, "orbit-controls-end")}
      />
    </>
  );
};

const SkyMapViewport: FC<SkyMapViewportProps> = ({
  renderables,
  catalogChunks,
  catalogPointCount,
  exoplanetCatalogStatus,
  openNgcCatalogStatus,
  selectedObjectId,
  hoveredObjectId,
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
  adaptiveQualityEnabled,
  onAdaptiveQualityDrop,
}) => {
  const pointRenderables = useMemo(() => renderables.filter(isSkyPointRenderable), [renderables]);
  const meshRenderables = useMemo(() => renderables.filter(isSkyMeshRenderable), [renderables]);
  const structureRenderables = useMemo(() => renderables.filter(isSkyStructureRenderable), [renderables]);
  const detailTier =
    pointRenderables.find((point) => point.lodTier)?.lodTier ??
    meshRenderables.find((mesh) => mesh.lodTier)?.lodTier ??
    structureRenderables.find((structure) => structure.lodTier)?.lodTier;
  const interactiveCount =
    pointRenderables.filter((point) => point.interactive !== false).length +
    meshRenderables.filter((mesh) => mesh.interactive !== false).length;
  const scaleBand = getSkyMapScaleBandDefinition(navigationState.scaleBand);
  const navigationModeLabel = formatSkyMapNavigationMode(navigationState.mode);
  const cameraDistanceLabel = formatCameraDistance(cameraDistance);
  const qualityProfile = ASTRO_QUALITY_PROFILES[qualityTier];
  const catalogFilterStatusRef = useRef<HTMLSpanElement | null>(null);
  const [milkyWayCatalogStatus, setMilkyWayCatalogStatus] = useState<MilkyWayCatalogRenderStatus>({
    status: "idle",
    recordCount: 0,
    message: "Milky Way measured-tracer layer is waiting for a galactic-scale view.",
  });
  const [desiLightconeStatus, setDesiLightconeStatus] = useState<DesiLightconeRenderStatus>({
    status: "idle",
    renderedCount: 0,
    sourceCount: DESI_LIGHTCONE_CATALOG_METADATA.binary.recordCount,
    message: "DESI measured-galaxy layer is waiting for a cosmological-scale view.",
  });
  const handleCatalogFilterDiagnostics = useCallback((diagnostics: StarCatalogFilterDiagnostics) => {
    if (!catalogFilterStatusRef.current) return;
    catalogFilterStatusRef.current.textContent = ` · Gaia render ${diagnostics.renderedRecords.toLocaleString()} · G≤${diagnostics.magnitudeLimitG.toFixed(1)} · view filtered`;
  }, []);

  return (
    <div className="skymap-viewport" aria-label="SkyMap universe viewport">
      <Canvas
        className="skymap-viewport__canvas"
        camera={{
          position: [
            SKYMAP_DEFAULT_CAMERA_POSE.position.x,
            SKYMAP_DEFAULT_CAMERA_POSE.position.y,
            SKYMAP_DEFAULT_CAMERA_POSE.position.z,
          ],
          fov: 46,
        }}
        dpr={qualityProfile.dpr}
        gl={{
          ...ASTRONOMICAL_WEBGL_OPTIONS,
          antialias: qualityProfile.antialias,
          powerPreference: qualityProfile.performanceMode ? "low-power" : "high-performance",
        }}
        onCreated={({ gl }) => {
          gl.toneMapping = ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.18;
          gl.outputColorSpace = SRGBColorSpace;
        }}
        frameloop="demand"
      >
        <WebGLCanvasLifecycle label="skymap" />
        <AdaptiveQualityMonitor
          enabled={adaptiveQualityEnabled}
          surface="skymap"
          tier={qualityTier}
          onDegrade={onAdaptiveQualityDrop}
        />
        <SkyMapScene
          renderables={renderables}
          catalogChunks={catalogChunks}
          selectedObjectId={selectedObjectId}
          hoveredObjectId={hoveredObjectId}
          focusedObjectId={focusedObjectId}
          focusRequestId={focusRequestId}
          cancelFlightToken={cancelFlightToken}
          navigationState={navigationState}
          cameraDistance={cameraDistance}
          onSelectObject={onSelectObject}
          onHoverObject={onHoverObject}
          onViewportDistanceChange={onViewportDistanceChange}
          onManualNavigation={onManualNavigation}
          onCameraFlightChange={onCameraFlightChange}
          timePlayback={timePlayback}
          qualityTier={qualityTier}
          onCatalogFilterDiagnostics={handleCatalogFilterDiagnostics}
          onMilkyWayCatalogStatus={setMilkyWayCatalogStatus}
          onDesiLightconeStatus={setDesiLightconeStatus}
        />
      </Canvas>
      <div className="skymap-viewport__hud" aria-live="polite">
        <span>
          {scaleBand.label} · {navigationModeLabel}
        </span>
        <span>
          {objectCount
            ? `${objectCount} navigable · ${catalogPointCount.toLocaleString()} catalogue points · ${renderables.length} staged · ${interactiveCount} interactive${
                detailTier ? ` · ${detailTier}` : ""
              }`
            : "Loading local layer data"}
          <span ref={catalogFilterStatusRef}> · catalogue LOD pending</span>
        </span>
        {milkyWayCatalogStatus.status !== "idle" ? (
          <span className="skymap-viewport__milky-way-status" title={milkyWayCatalogStatus.error ?? milkyWayCatalogStatus.message}>
            Milky Way · {milkyWayCatalogStatus.status === "ready"
              ? `${milkyWayCatalogStatus.recordCount} measured masers · ${MILKY_WAY_CATALOG_METADATA.build.fittedSegmentCount} arm fits · uncertainty spans`
              : milkyWayCatalogStatus.status === "loading"
                ? "measured tracers loading · temporary schematic"
                : "measured asset unavailable · schematic fallback"}
          </span>
        ) : null}
        {desiLightconeStatus.status !== "idle" ? (
          <span className="skymap-viewport__desi-status" title={desiLightconeStatus.error ?? desiLightconeStatus.message}>
            DESI DR1 · {desiLightconeStatus.status === "ready"
              ? `${desiLightconeStatus.sourceCount.toLocaleString()} measured galaxies · ${desiLightconeStatus.renderedCount.toLocaleString()} rendered · z ${DESI_LIGHTCONE_CATALOG_METADATA.selection.skyFootprint.redshiftMin.toFixed(1)}–${DESI_LIGHTCONE_CATALOG_METADATA.selection.skyFootprint.redshiftMax.toFixed(1)} · no inferred links`
              : desiLightconeStatus.status === "loading"
                ? "measured galaxies loading · sparse schematic"
                : "measured asset unavailable · sparse schematic fallback"}
          </span>
        ) : null}
        {exoplanetCatalogStatus.status !== "idle" ? (
          <span className="skymap-viewport__exoplanet-status" title={exoplanetCatalogStatus.message}>
            Exoplanets · {exoplanetCatalogStatus.status === "ready"
              ? `${exoplanetCatalogStatus.totalPlanetCount.toLocaleString()} confirmed planets · ${exoplanetCatalogStatus.totalSystemCount.toLocaleString()} systems · ${exoplanetCatalogStatus.totalChunkCount}/${exoplanetCatalogStatus.totalChunkCount} ICRS sectors`
              : exoplanetCatalogStatus.status === "loading"
                ? `${exoplanetCatalogStatus.loadedPlanetCount.toLocaleString()}/${exoplanetCatalogStatus.totalPlanetCount.toLocaleString()} planets · ${exoplanetCatalogStatus.loadedChunkCount}/${exoplanetCatalogStatus.totalChunkCount} sectors`
                : "catalogue unavailable"}
          </span>
        ) : null}
        {openNgcCatalogStatus.status !== "idle" ? (
          <span className="skymap-viewport__openngc-status" title={openNgcCatalogStatus.message}>
            OpenNGC · {openNgcCatalogStatus.status === "ready"
              ? `${openNgcCatalogStatus.totalObjectCount.toLocaleString()} selected objects · ${openNgcCatalogStatus.totalChunkCount}/${openNgcCatalogStatus.totalChunkCount} J2000 sectors · angular shell`
              : openNgcCatalogStatus.status === "loading"
                ? `${openNgcCatalogStatus.loadedObjectCount.toLocaleString()}/${openNgcCatalogStatus.totalObjectCount.toLocaleString()} objects · ${openNgcCatalogStatus.loadedChunkCount}/${openNgcCatalogStatus.totalChunkCount} sectors`
                : "catalogue unavailable"}
          </span>
        ) : null}
      </div>
      <aside className="skymap-orientation-inset" aria-label="SkyMap orientation inset">
        <div className="skymap-orientation-inset__header">
          <span>Orientation</span>
          <strong>{scaleBand.shortLabel}</strong>
        </div>
        <ol className="skymap-orientation-inset__scale" aria-label="Scale position">
          {SKYMAP_ORIENTATION_BANDS.map((band) => (
            <li
              key={band.id}
              className={band.id === navigationState.scaleBand ? "is-active" : undefined}
              aria-current={band.id === navigationState.scaleBand ? "step" : undefined}
            >
              <span>{band.shortLabel}</span>
              <strong>{formatScaleRange(band.distanceRange)}</strong>
            </li>
          ))}
        </ol>
        <div className="skymap-orientation-inset__meta">
          <span>{cameraDistanceLabel}</span>
          <span>{navigationModeLabel}</span>
        </div>
      </aside>
      {!renderables.length && objectCount ? (
        <div className="skymap-viewport__empty" aria-hidden="true">
          Active SkyMap layers hidden
        </div>
      ) : null}
      <div className="skymap-viewport__origin" aria-hidden="true">
        <span />
      </div>
    </div>
  );
};

export default SkyMapViewport;
