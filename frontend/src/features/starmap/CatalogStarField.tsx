import { memo, useCallback, useEffect, useMemo, useRef, useState, type FC } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Matrix4,
  ShaderMaterial,
  Vector3,
  type Intersection,
  type Object3D,
  type Raycaster,
} from "three";
import type {
  DecodedStarCatalogChunk,
  StarCatalogFilterDiagnostics,
  StarCatalogViewFilterResult,
} from "../../lib/catalog/starCatalogTypes";
import {
  filterNearbyStarCatalogView,
  updateNearbyStarCatalogPriorityDirection,
} from "./nearbyStarCatalogStore";

const ignoreRaycast = (_raycaster: Raycaster, _intersections: Intersection<Object3D>[]) => undefined;
const FILTER_INTERVAL_MS = 180;
const MATRIX_EPSILON = 1e-5;
const PRIORITY_DIRECTION_COSINE_THRESHOLD = Math.cos((1.5 * Math.PI) / 180);

type CatalogStarSurface = "solar" | "skymap";

interface CatalogFilterDiagnosticsEntry extends StarCatalogFilterDiagnostics {
  status: "ready" | "error";
  updatedAt: string;
  error?: string;
}

interface CatalogFilterDiagnosticsWindow extends Window {
  __SPACEVIEWER_CATALOG_FILTER__?: Partial<Record<CatalogStarSurface, CatalogFilterDiagnosticsEntry>>;
}

const matricesDiffer = (left: number[] | null, right: number[]) => {
  if (!left || left.length !== right.length) return true;
  return right.some((value, index) => Math.abs(value - left[index]) > MATRIX_EPSILON);
};

const CATALOG_STAR_VERTEX_SHADER = `
  attribute float aColorIndex;
  attribute float aBrightness;
  uniform float uTime;
  uniform float uDetail;
  varying vec3 vColor;
  varying float vAlpha;

  vec3 colorIndexColor(float bpRp) {
    float t = clamp((bpRp + 0.5) / 4.5, 0.0, 1.0);
    vec3 hot = vec3(0.70, 0.81, 1.0);
    vec3 neutral = vec3(1.0, 0.97, 0.90);
    vec3 cool = vec3(1.0, 0.56, 0.36);
    return t < 0.30
      ? mix(hot, neutral, t / 0.30)
      : mix(neutral, cool, (t - 0.30) / 0.70);
  }

  void main() {
    float brightness = clamp(aBrightness, 0.0, 1.0);
    float phase = fract(position.x * 0.071 + position.y * 0.113 + position.z * 0.173) * 6.2831853;
    float twinkle = 1.0 + sin(uTime * 0.42 + phase) * 0.012 * uDetail;
    vColor = colorIndexColor(aColorIndex);
    vAlpha = mix(0.28, 0.98, pow(brightness, 0.62)) * twinkle;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float baseSize = mix(0.72, 2.25, pow(brightness, 0.56));
    float attenuated = baseSize * (220.0 / max(1.0, -mvPosition.z));
    gl_PointSize = clamp(attenuated, 0.85, mix(3.0, 5.0, uDetail));
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const CATALOG_STAR_FRAGMENT_SHADER = `
  uniform float uOpacity;
  uniform float uDetail;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec2 uv = gl_PointCoord - vec2(0.5);
    float radius = length(uv);
    float core = exp(-pow(radius / 0.075, 2.0) * 1.5);
    float halo = exp(-pow(radius / 0.34, 2.0) * 2.0) * mix(0.28, 0.48, uDetail);
    float mask = smoothstep(0.5, 0.04, radius);
    float alpha = (core + halo) * vAlpha * mask * uOpacity;
    if (alpha < 0.01) discard;
    vec3 color = mix(vec3(1.0), vColor, 0.34) * core + vColor * halo;
    gl_FragColor = vec4(color, alpha);
  }
`;

interface CatalogStarChunkPointsProps {
  chunk: DecodedStarCatalogChunk;
  positionScale: number;
  recordLimit: number;
  renderIndices?: Uint32Array;
  opacity: number;
  performanceMode: boolean;
}

const CatalogStarChunkPoints = memo(
  ({ chunk, positionScale, recordLimit, renderIndices, opacity, performanceMode }: CatalogStarChunkPointsProps) => {
    const materialRef = useRef<ShaderMaterial | null>(null);
    const { columns, recordCount, renderPositions } = chunk;
    const [stableRenderPositions] = useState(() => new Float32Array(renderPositions));
    const uniforms = useMemo(
      () => ({
        uOpacity: { value: 1 },
        uTime: { value: 0 },
        uDetail: { value: 1 },
      }),
      [],
    );
    const geometry = useMemo(() => {
      const next = new BufferGeometry();
      const displayColorIndex = new Float32Array(recordCount);
      for (let index = 0; index < recordCount; index += 1) {
        const sourceColorIndex = columns.colorIndexBpRp[index];
        displayColorIndex[index] = Number.isFinite(sourceColorIndex) ? sourceColorIndex : 0.82;
      }
      next.setAttribute("position", new BufferAttribute(stableRenderPositions, 3));
      next.setAttribute("aColorIndex", new BufferAttribute(displayColorIndex, 1));
      next.setAttribute("aBrightness", new BufferAttribute(columns.brightnessProxy, 1));
      const indices = new Uint32Array(recordCount);
      for (let index = 0; index < recordCount; index += 1) indices[index] = index;
      next.setIndex(new BufferAttribute(indices, 1));
      next.setDrawRange(0, recordCount);
      next.computeBoundingSphere();
      return next;
    }, [columns, recordCount, stableRenderPositions]);

    useEffect(() => {
      const indexAttribute = geometry.getIndex();
      if (!indexAttribute) return;
      const values = indexAttribute.array as Uint32Array;
      const nextCount = renderIndices
        ? Math.min(renderIndices.length, recordCount)
        : Math.min(recordCount, recordLimit);
      if (renderIndices) values.set(renderIndices.subarray(0, nextCount));
      else for (let index = 0; index < nextCount; index += 1) values[index] = index;
      indexAttribute.needsUpdate = true;
      geometry.setDrawRange(0, nextCount);
    }, [geometry, recordCount, recordLimit, renderIndices]);

    useEffect(() => {
      const position = geometry.getAttribute("position") as BufferAttribute;
      const values = position.array as Float32Array;
      if (values.length !== renderPositions.length) return;
      values.set(renderPositions);
      position.needsUpdate = true;
      geometry.computeBoundingSphere();
    }, [geometry, renderPositions]);

    useEffect(() => () => geometry.dispose(), [geometry]);

    useFrame((state) => {
      const material = materialRef.current;
      if (!material) return;
      material.uniforms.uTime.value = state.clock.elapsedTime;
      material.uniforms.uOpacity.value = opacity;
      material.uniforms.uDetail.value = performanceMode ? 0 : 1;
    });

    return (
      <points geometry={geometry} scale={positionScale} raycast={ignoreRaycast} frustumCulled>
        <shaderMaterial
          ref={materialRef}
          transparent
          depthWrite={false}
          depthTest
          blending={AdditiveBlending}
          uniforms={uniforms}
          vertexShader={CATALOG_STAR_VERTEX_SHADER}
          fragmentShader={CATALOG_STAR_FRAGMENT_SHADER}
        />
      </points>
    );
  },
);

CatalogStarChunkPoints.displayName = "CatalogStarChunkPoints";

interface CatalogStarFieldProps {
  chunks: DecodedStarCatalogChunk[];
  opacity?: number;
  positionScale?: number;
  pointBudget?: number;
  magnitudeLimitG: number;
  performanceMode?: boolean;
  surface: CatalogStarSurface;
  onFilterDiagnostics?: (diagnostics: StarCatalogFilterDiagnostics) => void;
}

interface CatalogRenderPlanEntry {
  chunk: DecodedStarCatalogChunk;
  recordLimit: number;
  renderIndices?: Uint32Array;
}

/**
 * Non-interactive high-density catalogue renderer. Scientific Float64 source
 * columns stay on the CPU; Worker-produced Float32 positions are uploaded to
 * the GPU in independently cullable chunks. Search/selection remains in the
 * canonical object registry rather than attaching handlers to every point.
 */
const CatalogStarField: FC<CatalogStarFieldProps> = ({
  chunks,
  opacity = 1,
  positionScale = 0.8,
  pointBudget = Number.POSITIVE_INFINITY,
  magnitudeLimitG,
  performanceMode = false,
  surface,
  onFilterDiagnostics,
}) => {
  const { camera, invalidate } = useThree();
  const [filterResult, setFilterResult] = useState<StarCatalogViewFilterResult | null>(null);
  const viewProjectionRef = useRef(new Matrix4());
  const lastSubmittedMatrixRef = useRef<number[] | null>(null);
  const lastFilterAtRef = useRef(0);
  const requestSequenceRef = useRef(0);
  const onFilterDiagnosticsRef = useRef(onFilterDiagnostics);
  const priorityDirectionRef = useRef(new Vector3());
  const lastPriorityDirectionRef = useRef<Vector3 | null>(null);

  useEffect(() => {
    onFilterDiagnosticsRef.current = onFilterDiagnostics;
  }, [onFilterDiagnostics]);

  const submitFilter = useCallback((force: boolean) => {
    if (!chunks.length) return;
    camera.updateMatrixWorld();
    const viewProjectionMatrix = Array.from(
      viewProjectionRef.current.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).elements,
    );
    const now = performance.now();
    if (!force && (now - lastFilterAtRef.current < FILTER_INTERVAL_MS || !matricesDiffer(lastSubmittedMatrixRef.current, viewProjectionMatrix))) {
      return;
    }

    lastFilterAtRef.current = now;
    lastSubmittedMatrixRef.current = viewProjectionMatrix;
    const requestSequence = ++requestSequenceRef.current;
    void filterNearbyStarCatalogView({
      viewProjectionMatrix,
      positionScale,
      magnitudeLimitG,
      pointBudget,
      frustumPadding: 1.08,
    }).then((result) => {
      if (requestSequence !== requestSequenceRef.current) return;
      setFilterResult(result);
      const diagnosticsWindow = window as CatalogFilterDiagnosticsWindow;
      diagnosticsWindow.__SPACEVIEWER_CATALOG_FILTER__ ??= {};
      diagnosticsWindow.__SPACEVIEWER_CATALOG_FILTER__[surface] = {
        ...result.diagnostics,
        status: "ready",
        updatedAt: new Date().toISOString(),
      };
      onFilterDiagnosticsRef.current?.(result.diagnostics);
      invalidate();
    }).catch((error) => {
      if (requestSequence !== requestSequenceRef.current) return;
      setFilterResult(null);
      const diagnosticsWindow = window as CatalogFilterDiagnosticsWindow;
      diagnosticsWindow.__SPACEVIEWER_CATALOG_FILTER__ ??= {};
      diagnosticsWindow.__SPACEVIEWER_CATALOG_FILTER__[surface] = {
        totalRecords: chunks.reduce((total, chunk) => total + chunk.recordCount, 0),
        magnitudeEligibleRecords: 0,
        frustumVisibleRecords: 0,
        renderedRecords: 0,
        magnitudeCulledRecords: 0,
        frustumCulledRecords: 0,
        budgetCulledRecords: 0,
        magnitudeLimitG,
        pointBudget: Number.isFinite(pointBudget) ? Math.max(0, Math.floor(pointBudget)) : Number.MAX_SAFE_INTEGER,
        frustumPadding: 1.08,
        status: "error",
        updatedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown catalogue view-filter failure.",
      };
      invalidate();
    });
  }, [camera, chunks, invalidate, magnitudeLimitG, pointBudget, positionScale, surface]);

  useEffect(() => {
    if (!chunks.length) {
      requestSequenceRef.current += 1;
      return;
    }
    submitFilter(true);
  }, [chunks, submitFilter]);

  useFrame(() => {
    const priorityDirection = camera.getWorldDirection(priorityDirectionRef.current).normalize();
    const previousDirection = lastPriorityDirectionRef.current;
    if (!previousDirection || previousDirection.dot(priorityDirection) < PRIORITY_DIRECTION_COSINE_THRESHOLD) {
      updateNearbyStarCatalogPriorityDirection({
        x: priorityDirection.x,
        y: priorityDirection.y,
        z: priorityDirection.z,
      });
      if (previousDirection) previousDirection.copy(priorityDirection);
      else lastPriorityDirectionRef.current = priorityDirection.clone();
    }
    submitFilter(false);
  });

  const renderPlan = useMemo<CatalogRenderPlanEntry[]>(() => {
    const availableBudget = Math.max(0, Math.floor(pointBudget));
    const totalRecords = chunks.reduce((total, chunk) => total + chunk.recordCount, 0);
    if (availableBudget >= totalRecords) {
      return chunks.map((chunk) => ({ chunk, recordLimit: chunk.recordCount }));
    }

    const [brightCore, ...spatialChunks] = chunks;
    if (!brightCore) return [];
    const coreLimit = Math.min(brightCore.recordCount, availableBudget);
    let remaining = availableBudget - coreLimit;
    const entries = coreLimit ? [{ chunk: brightCore, recordLimit: coreLimit }] : [];
    const spatialTotal = spatialChunks.reduce((total, chunk) => total + chunk.recordCount, 0);

    spatialChunks.forEach((chunk, index) => {
      const remainingChunks = spatialChunks.length - index;
      const proportionalLimit = Math.floor((availableBudget - coreLimit) * (chunk.recordCount / spatialTotal));
      const recordLimit = Math.min(chunk.recordCount, remaining, Math.max(0, proportionalLimit));
      if (recordLimit > 0) entries.push({ chunk, recordLimit });
      remaining -= recordLimit;
      if (remaining > 0 && remainingChunks === 1) {
        entries[entries.length - 1].recordLimit = Math.min(chunk.recordCount, recordLimit + remaining);
      }
    });

    return entries;
  }, [chunks, pointBudget]);

  const filteredIndicesByChunk = useMemo(
    () => filterResult ? new Map(filterResult.chunks.map((chunk) => [chunk.chunkId, chunk.indices])) : null,
    [filterResult],
  );

  const activeRenderPlan = useMemo<CatalogRenderPlanEntry[]>(
    () => filteredIndicesByChunk
      ? chunks.map((chunk) => ({
          chunk,
          recordLimit: filteredIndicesByChunk.get(chunk.chunkId)?.length ?? 0,
          renderIndices: filteredIndicesByChunk.get(chunk.chunkId) ?? new Uint32Array(0),
        }))
      : renderPlan,
    [chunks, filteredIndicesByChunk, renderPlan],
  );

  return (
    <group>
      {activeRenderPlan.map(({ chunk, recordLimit, renderIndices }) => (
        <CatalogStarChunkPoints
          key={chunk.chunkId}
          chunk={chunk}
          positionScale={positionScale}
          recordLimit={recordLimit}
          renderIndices={renderIndices}
          opacity={opacity}
          performanceMode={performanceMode}
        />
      ))}
    </group>
  );
};

export default CatalogStarField;
