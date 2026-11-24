import type { NearbyStar } from "../../../data/nearbyStars";
import type { SkyLayerData, SkyLayerDefinition } from "../core/layers";
import { isStarSkyObject, type SkyObject, type StarSkyObject } from "../core/objects";
import type { SkyLayerRenderer, SkyPointRenderable } from "../core/renderers";
import {
  createLocalStarCatalog,
  getLocalStarChunkDefinition,
  getStarBrightnessValue,
  type LocalStarCatalogRuntime,
} from "./localStarCatalog";
import { getStarLodPolicy, type StarCatalogChunkTier } from "./starLod";

export const LOCAL_STARS_LAYER_ID = "stars.local-neighborhood";

interface StarRenderRecord {
  object: StarSkyObject;
  brightness: number;
  distanceLy: number;
  chunkId: string;
  chunkTier: StarCatalogChunkTier;
  importanceScore: number;
}

const starRenderRecordCache = new WeakMap<readonly SkyObject[], StarRenderRecord[]>();

const getStarBrightness = (object: StarSkyObject) =>
  getStarBrightnessValue(
    object.scientific.distanceLy,
    object.scientific.luminositySolar,
    object.scientific.apparentMagnitude,
  );

const buildStarRenderRecords = (objects: readonly SkyObject[]) => {
  const cached = starRenderRecordCache.get(objects);
  if (cached) return cached;

  const records = objects.filter(isStarSkyObject).map((object) => {
    const distanceLy = object.scientific.distanceLy ?? 0;
    const brightness = getStarBrightness(object);
    const chunk = getLocalStarChunkDefinition(distanceLy);
    const labelPriority = object.visual?.labelPriority ?? 0;
    const importanceScore = brightness * 100 + labelPriority + Math.max(0, 60 - distanceLy) * 0.35;
    return {
      object,
      brightness,
      distanceLy,
      chunkId: chunk.id,
      chunkTier: chunk.importanceTier,
      importanceScore,
    };
  });

  starRenderRecordCache.set(objects, records);
  return records;
};

const localStarRenderer: SkyLayerRenderer = {
  strategy: "point-cloud",
  buildRenderables: (objects, context) => {
    const policy = getStarLodPolicy(context.viewport.cameraDistance);
    const featuredIds = context.featuredObjectIds;
    const records = buildStarRenderRecords(objects);
    const activeChunkTiers = new Set(policy.activeChunkTiers);

    const featuredRecords = records.filter((record) => featuredIds.has(record.object.id));
    const featuredRecordIds = new Set(featuredRecords.map((record) => record.object.id));

    const lodCandidates = records
      .filter((record) => {
        if (featuredRecordIds.has(record.object.id)) return false;
        if (!activeChunkTiers.has(record.chunkTier)) return false;
        if (record.distanceLy > policy.maxDistanceLy) return record.brightness >= policy.minBrightness + 0.14;
        return record.brightness >= policy.minBrightness;
      })
      .sort((a, b) => b.importanceScore - a.importanceScore || a.object.name.localeCompare(b.object.name));

    const renderQueue = [...featuredRecords, ...lodCandidates].slice(
      0,
      Math.max(policy.maxRenderables, featuredRecords.length),
    );
    const interactiveRecordIds = new Set(
      renderQueue
        .slice(0, Math.max(policy.maxInteractiveCandidates, featuredRecords.length))
        .map((record) => record.object.id),
    );

    featuredRecords.forEach((record) => interactiveRecordIds.add(record.object.id));

    return renderQueue.flatMap((record): SkyPointRenderable[] => {
      const position = context.projectPosition(record.object.position);
      if (!position) return [];
      const isFeatured = featuredIds.has(record.object.id);
      return [
        {
          kind: "point",
          id: `${LOCAL_STARS_LAYER_ID}:${record.object.id}`,
          layerId: LOCAL_STARS_LAYER_ID,
          objectId: record.object.id,
          position,
          label: record.object.name,
          color: record.object.visual?.color,
          brightness: record.brightness,
          size: Math.max(0.72, 0.33 + record.brightness * 1.2 + (isFeatured ? 0.16 : 0)),
          labelPriority: record.object.visual?.labelPriority,
          interactive: interactiveRecordIds.has(record.object.id),
          lodTier: policy.tier,
          sourceChunkId: record.chunkId,
          importanceScore: record.importanceScore,
          pointMetadata: {
            spectralType: record.object.scientific.spectralType,
            luminositySolar: record.object.scientific.luminositySolar,
            temperatureK: record.object.scientific.temperatureK,
            distanceLy: record.object.scientific.distanceLy,
            apparentMagnitude: record.object.scientific.apparentMagnitude,
          },
        },
      ];
    });
  },
};

export const LOCAL_STARS_LAYER: SkyLayerDefinition = {
  id: LOCAL_STARS_LAYER_ID,
  label: "Local stars",
  description: "Progressive Gaia DR3 point catalogue with a bounded canonical navigation index.",
  objectKinds: ["star"],
  defaultVisible: true,
  order: 10,
  status: "active",
  rendererRole: "points",
  capabilities: {
    selectable: true,
    hoverable: true,
    labels: true,
    searchable: true,
  },
  time: {
    behavior: "time-aware",
    cadence: "on-time-change",
    model: "gaia-dr3-worker-uniform-space-motion",
    description: "Gaia DR3 positions are propagated from J2016.0 in a Worker across the bounded 1900-2100 SkyMap interval; published radial velocities are used where available and missing values retain an explicit zero fallback.",
  },
  renderer: localStarRenderer,
};

export const createLocalStarLayerData = (
  stars: NearbyStar[],
  runtime: LocalStarCatalogRuntime & { error?: string | null } = {},
): SkyLayerData<StarSkyObject> => {
  const catalog = createLocalStarCatalog(stars, runtime);
  return {
    layerId: LOCAL_STARS_LAYER_ID,
    objects: catalog.objects,
    chunks: catalog.chunks,
    metrics: catalog.metrics,
    status: stars.length ? "ready" : runtime.error ? "error" : "loading",
    error: runtime.error ?? undefined,
    version: catalog.version,
  };
};
