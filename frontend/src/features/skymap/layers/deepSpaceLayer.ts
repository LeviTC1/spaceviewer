import type { SceneVector3 } from "../core/coordinates";
import type { SkyLayerChunk, SkyLayerData, SkyLayerDefinition } from "../core/layers";
import { getSkyObjectImportanceScore, isDeepSkyObject, type SkyObject } from "../core/objects";
import type { SkyLayerRenderer, SkyMeshRenderable, SkyPointRenderable } from "../core/renderers";
import type { OpenNgcCatalogManifest, OpenNgcCatalogObject } from "../../../lib/catalog/openNgcCatalog";
import {
  createDeepSpaceCatalog,
  DEEP_SPACE_CATALOG_VERSION,
  type DeepSpaceFamily,
  type DeepSpaceSkyObject,
} from "./deepSpaceCatalog";

export const DEEP_SPACE_GALAXIES_LAYER_ID = "deep-space.galaxies";
export const DEEP_SPACE_NEBULAE_LAYER_ID = "deep-space.nebulae";
export const DEEP_SPACE_CLUSTERS_LAYER_ID = "deep-space.clusters";

interface DeepSpaceLayerConfig {
  id: string;
  label: string;
  description: string;
  family: DeepSpaceFamily;
  objectKinds: SkyLayerDefinition["objectKinds"];
  order: number;
  colorFallback: string;
  shape: NonNullable<SkyMeshRenderable["meshMetadata"]>["shape"];
}

interface DeepSpaceRenderRecord {
  object: DeepSpaceSkyObject;
  radiusSceneUnits: number;
  color: string;
  opacity: number;
  chunkId: string;
  importanceScore: number;
  shape: NonNullable<SkyMeshRenderable["meshMetadata"]>["shape"];
  family: NonNullable<SkyMeshRenderable["meshMetadata"]>["family"];
  rotation?: [number, number, number];
}

const deepSpaceRenderRecordCache = new WeakMap<readonly SkyObject[], DeepSpaceRenderRecord[]>();

const familyLayerId: Record<DeepSpaceFamily, string> = {
  galaxy: DEEP_SPACE_GALAXIES_LAYER_ID,
  nebula: DEEP_SPACE_NEBULAE_LAYER_ID,
  cluster: DEEP_SPACE_CLUSTERS_LAYER_ID,
};

const getProjectedPosition = (object: DeepSpaceSkyObject, projectPosition: (position: SkyObject["position"]) => SceneVector3 | null) =>
  projectPosition(object.position);

const getFamilyForObject = (object: DeepSpaceSkyObject): DeepSpaceFamily => {
  if (object.kind === "galaxy") return "galaxy";
  if (object.kind === "nebula") return "nebula";
  return "cluster";
};

const getShapeForFamily = (family: DeepSpaceFamily): NonNullable<SkyMeshRenderable["meshMetadata"]>["shape"] => {
  if (family === "galaxy") return "galaxy-disk";
  if (family === "nebula") return "nebula-cloud";
  return "cluster-halo";
};

const buildDeepSpaceRenderRecords = (objects: readonly SkyObject[]) => {
  const cached = deepSpaceRenderRecordCache.get(objects);
  if (cached) return cached;

  const records = objects.filter(isDeepSkyObject).map((object) => {
    const family = getFamilyForObject(object);
    const distanceLy = object.scientific?.distanceLy ?? 0;
    const apparentMagnitude = object.scientific?.apparentMagnitude ?? 9;
    const radiusSceneUnits = Math.max(1.5, object.visual?.pointSize ?? 2.4);
    const brightness = object.visual?.brightness ?? Math.max(0.28, 1 - apparentMagnitude / 12);
    const labelPriority = object.visual?.labelPriority ?? 0;
    const distancePriority = distanceLy ? Math.max(0, 32 - Math.log10(distanceLy + 1) * 4) : 0;
    const objectImportance = getSkyObjectImportanceScore(object);

    return {
      object,
      radiusSceneUnits,
      color: object.visual?.color ?? "#b8c7ff",
      opacity: family === "nebula" ? 0.42 : family === "galaxy" ? 0.58 : 0.5,
      chunkId: `ra-${String(Math.floor((object.scientific?.raDeg ?? 0) / 30)).padStart(2, "0")}`,
      importanceScore: brightness * 72 + labelPriority * 0.72 + distancePriority + objectImportance * 0.82,
      shape: getShapeForFamily(family),
      family,
      rotation: undefined,
    };
  });

  deepSpaceRenderRecordCache.set(objects, records);
  return records;
};

const createDeepSpaceRenderer = (config: DeepSpaceLayerConfig): SkyLayerRenderer => ({
  strategy: "point-cloud",
  buildRenderables: (objects, context) => {
    const featuredIds = context.featuredObjectIds;
    const visibleAtCurrentScale = context.viewport.cameraDistance >= 42;
    return buildDeepSpaceRenderRecords(objects).flatMap((record): Array<SkyMeshRenderable | SkyPointRenderable> => {
      const position = getProjectedPosition(record.object, context.projectPosition);
      if (!position) return [];
      const featured = featuredIds.has(record.object.id);
      if (!visibleAtCurrentScale && !featured) return [];
      const renderAsMesh = featured || record.object.importance?.tier === "landmark" || record.importanceScore >= 154;
      if (!renderAsMesh) {
        return [{
          kind: "point",
          id: `${config.id}:${record.object.id}`,
          layerId: config.id,
          objectId: record.object.id,
          position,
          label: record.object.name,
          color: record.color || config.colorFallback,
          size: Math.max(0.66, Math.min(1.7, record.radiusSceneUnits * 0.58)),
          opacity: Math.min(0.82, record.opacity + 0.08),
          brightness: record.object.visual?.brightness,
          labelPriority: record.object.visual?.labelPriority,
          interactive: true,
          lodTier: "openngc-angular-points",
          sourceChunkId: record.chunkId,
          importanceScore: record.importanceScore,
          pointMetadata: { apparentMagnitude: record.object.scientific?.apparentMagnitude },
        }];
      }
      return [
        {
          kind: "mesh",
          id: `${config.id}:${record.object.id}`,
          layerId: config.id,
          objectId: record.object.id,
          position,
          label: record.object.name,
          color: record.color || config.colorFallback,
          radiusSceneUnits: record.radiusSceneUnits * (featured ? 1.16 : 1),
          opacity: Math.min(0.92, record.opacity + (featured ? 0.12 : 0)),
          labelPriority: record.object.visual?.labelPriority,
          interactive: true,
          lodTier: visibleAtCurrentScale ? "openngc-landmark-mesh" : "focused-only",
          sourceChunkId: record.chunkId,
          importanceScore: record.importanceScore,
          meshMetadata: {
            family: record.family,
            shape: config.shape ?? record.shape,
            rotation: record.object.scientific?.symbolRotation ?? record.rotation,
          },
        },
      ];
    });
  },
});

const createDeepSpaceLayerDefinition = (config: DeepSpaceLayerConfig): SkyLayerDefinition => ({
  id: config.id,
  label: config.label,
  description: config.description,
  objectKinds: config.objectKinds,
  defaultVisible: true,
  order: config.order,
  status: "active",
  rendererRole: "points",
  capabilities: {
    selectable: true,
    hoverable: true,
    labels: true,
    searchable: true,
    streaming: true,
  },
  time: {
    behavior: "static",
    cadence: "never",
    model: "OpenNGC-v20260501-J2000-angular-catalogue",
    description: "OpenNGC J2000 directions remain fixed on the angular guide shell; no homogeneous radial distance is inferred.",
  },
  renderer: createDeepSpaceRenderer(config),
});

export const DEEP_SPACE_GALAXIES_LAYER = createDeepSpaceLayerDefinition({
  id: DEEP_SPACE_GALAXIES_LAYER_ID,
  label: "Galaxies",
  description: "OpenNGC galaxies streamed in J2000 sectors; catalogue directions are measured and radial distance is undefined.",
  family: "galaxy",
  objectKinds: ["galaxy"],
  order: 30,
  colorFallback: "#b7c8ff",
  shape: "galaxy-disk",
});

export const DEEP_SPACE_NEBULAE_LAYER = createDeepSpaceLayerDefinition({
  id: DEEP_SPACE_NEBULAE_LAYER_ID,
  label: "Nebulae",
  description: "OpenNGC nebulae and remnants streamed in J2000 sectors with landmark meshes and batched catalogue points.",
  family: "nebula",
  objectKinds: ["nebula"],
  order: 40,
  colorFallback: "#9fffe5",
  shape: "nebula-cloud",
});

export const DEEP_SPACE_CLUSTERS_LAYER = createDeepSpaceLayerDefinition({
  id: DEEP_SPACE_CLUSTERS_LAYER_ID,
  label: "Star clusters",
  description: "OpenNGC open and globular clusters streamed in J2000 sectors with landmark meshes and batched catalogue points.",
  family: "cluster",
  objectKinds: ["star-cluster"],
  order: 50,
  colorFallback: "#ffe2aa",
  shape: "cluster-halo",
});

export const createDeepSpaceLayerData = (
  records: readonly OpenNgcCatalogObject[] = [],
  manifest: OpenNgcCatalogManifest | null = null,
  loadedChunkIds: readonly string[] = [],
  status: "idle" | "loading" | "ready" | "error" = "idle",
  error: string | null = null,
): SkyLayerData<DeepSpaceSkyObject>[] =>
  (["galaxy", "nebula", "cluster"] as const).map((family) => {
    const catalog = createDeepSpaceCatalog(family, records, manifest);
    const objectIdsByChunk = new Map<string, string[]>();
    catalog.objects.forEach((object) => {
      const ra = object.scientific?.raDeg ?? 0;
      const chunkId = `ra-${String(Math.floor(ra / 30)).padStart(2, "0")}`;
      objectIdsByChunk.set(chunkId, [...(objectIdsByChunk.get(chunkId) ?? []), object.id]);
    });
    const loaded = new Set(loadedChunkIds);
    const chunks: SkyLayerChunk[] = manifest?.chunks.map((chunk) => {
      const objectIds = objectIdsByChunk.get(chunk.id) ?? [];
      return {
        id: chunk.id,
        label: `${chunk.label} · ${family}`,
        objectIds,
        objectCount: objectIds.length,
        status: loaded.has(chunk.id) ? "ready" : status === "loading" ? "loading" : "staged",
        importanceTier: family === "galaxy" ? "background" : "context",
        bounds: {
          frame: "equatorial-j2000",
          center: { x: 0, y: 0, z: 0, unit: "scene-unit", sourceFrame: "equatorial-j2000" },
          radius: manifest.coordinates.angularShellRadiusSceneUnits,
          unit: "scene-unit",
        },
      };
    }) ?? [];
    return {
      layerId: familyLayerId[family],
      objects: catalog.objects,
      chunks,
      metrics: {
        totalObjects: catalog.objects.length,
        searchableObjects: catalog.objects.length,
        chunkCount: chunks.length,
      },
      status: catalog.objects.length ? "ready" : status === "error" ? "error" : "loading",
      version: manifest?.catalog.version ?? DEEP_SPACE_CATALOG_VERSION,
      error: error ?? undefined,
    };
  });
