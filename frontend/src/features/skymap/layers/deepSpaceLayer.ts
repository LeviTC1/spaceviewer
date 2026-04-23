import type { SceneVector3 } from "../core/coordinates";
import type { SkyLayerChunk, SkyLayerData, SkyLayerDefinition } from "../core/layers";
import { getSkyObjectImportanceScore, isDeepSkyObject, type SkyObject } from "../core/objects";
import type { SkyLayerRenderer, SkyMeshRenderable } from "../core/renderers";
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

const familyChunkLabel: Record<DeepSpaceFamily, string> = {
  galaxy: "Curated galaxies",
  nebula: "Curated nebulae",
  cluster: "Curated clusters",
};

const getSceneDistance = (position: SceneVector3) => Math.hypot(position.x, position.y, position.z);

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
      chunkId: `${family}-showcase`,
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
  strategy: "mesh",
  buildRenderables: (objects, context) => {
    const featuredIds = context.featuredObjectIds;
    const visibleAtCurrentScale = context.viewport.cameraDistance >= 42;
    return buildDeepSpaceRenderRecords(objects).flatMap((record): SkyMeshRenderable[] => {
      const position = getProjectedPosition(record.object, context.projectPosition);
      if (!position) return [];
      const featured = featuredIds.has(record.object.id);
      if (!visibleAtCurrentScale && !featured) return [];

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
          lodTier: visibleAtCurrentScale ? "deep-space-showcase" : "focused-only",
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

const createDeepSpaceChunks = (objects: DeepSpaceSkyObject[], family: DeepSpaceFamily): SkyLayerChunk[] => {
  const projectedPositions = objects
    .map((object) => object.position)
    .filter((position) => position.mode === "cartesian")
    .map((position) => ({
      x: position.x,
      y: position.y,
      z: position.z,
      unit: "scene-unit" as const,
      sourceFrame: "galactic" as const,
    }));
  const radius = projectedPositions.reduce((max, position) => Math.max(max, getSceneDistance(position)), 0);

  return [
    {
      id: `${family}-showcase`,
      label: familyChunkLabel[family],
      objectIds: objects.map((object) => object.id),
      objectCount: objects.length,
      status: "ready",
      importanceTier: family === "galaxy" ? "background" : "context",
      bounds: {
        frame: "galactic",
        center: { x: 0, y: 0, z: 0, unit: "scene-unit", sourceFrame: "galactic" },
        radius,
        unit: "scene-unit",
      },
    },
  ];
};

const createDeepSpaceLayerDefinition = (config: DeepSpaceLayerConfig): SkyLayerDefinition => ({
  id: config.id,
  label: config.label,
  description: config.description,
  objectKinds: config.objectKinds,
  defaultVisible: true,
  order: config.order,
  status: "active",
  rendererRole: "meshes",
  capabilities: {
    selectable: true,
    hoverable: true,
    labels: true,
    searchable: true,
  },
  time: {
    behavior: "static",
    cadence: "never",
    model: "curated-deep-space-static-seed",
    description: "Curated deep-space objects remain fixed in the current SkyMap stage.",
  },
  renderer: createDeepSpaceRenderer(config),
});

export const DEEP_SPACE_GALAXIES_LAYER = createDeepSpaceLayerDefinition({
  id: DEEP_SPACE_GALAXIES_LAYER_ID,
  label: "Galaxies",
  description: "Curated galaxy landmarks rendered as symbolic wide-field SkyObjects.",
  family: "galaxy",
  objectKinds: ["galaxy"],
  order: 30,
  colorFallback: "#b7c8ff",
  shape: "galaxy-disk",
});

export const DEEP_SPACE_NEBULAE_LAYER = createDeepSpaceLayerDefinition({
  id: DEEP_SPACE_NEBULAE_LAYER_ID,
  label: "Nebulae",
  description: "Curated nebula and remnant landmarks rendered as soft symbolic clouds.",
  family: "nebula",
  objectKinds: ["nebula"],
  order: 40,
  colorFallback: "#9fffe5",
  shape: "nebula-cloud",
});

export const DEEP_SPACE_CLUSTERS_LAYER = createDeepSpaceLayerDefinition({
  id: DEEP_SPACE_CLUSTERS_LAYER_ID,
  label: "Star clusters",
  description: "Curated open and globular clusters rendered as inspectable cluster halos.",
  family: "cluster",
  objectKinds: ["star-cluster"],
  order: 50,
  colorFallback: "#ffe2aa",
  shape: "cluster-halo",
});

export const createDeepSpaceLayerData = (): SkyLayerData<DeepSpaceSkyObject>[] =>
  (["galaxy", "nebula", "cluster"] as const).map((family) => {
    const catalog = createDeepSpaceCatalog(family);
    return {
      layerId: familyLayerId[family],
      objects: catalog.objects,
      chunks: createDeepSpaceChunks(catalog.objects, family),
      metrics: {
        totalObjects: catalog.objects.length,
        searchableObjects: catalog.objects.length,
        chunkCount: 1,
        maxDistance: catalog.objects.reduce(
          (max, object) => Math.max(max, object.scientific?.distanceLy ?? 0),
          0,
        ),
      },
      status: "ready",
      version: DEEP_SPACE_CATALOG_VERSION,
    };
  });
