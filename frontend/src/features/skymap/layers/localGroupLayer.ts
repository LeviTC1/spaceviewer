import type { SceneVector3 } from "../core/coordinates";
import type { SkyLayerChunk, SkyLayerData, SkyLayerDefinition } from "../core/layers";
import { getSkyObjectImportanceScore, type GalaxySkyObject } from "../core/objects";
import type { SkyLayerRenderer, SkyMeshRenderable, SkyPointRenderable } from "../core/renderers";
import { LOCAL_GROUP_CATALOG_METADATA, LOCAL_GROUP_CATALOG_VERSION, LOCAL_GROUP_GALAXIES } from "./localGroupCatalog";

export const LOCAL_GROUP_GALAXIES_LAYER_ID = "local-group.galaxies";
export const LOCAL_GROUP_PRIMARY_GALAXY_IDS = new Set([
  "deep:galaxy:andromeda-galaxy",
  "deep:galaxy:triangulum-galaxy",
  "deep:galaxy:large-magellanic-cloud",
  "deep:galaxy:small-magellanic-cloud",
]);

export const LOCAL_GROUP_VISUAL_GALAXY_IDS = new Set([
  ...LOCAL_GROUP_PRIMARY_GALAXY_IDS,
  "deep:galaxy:lvdb-ngc-0147",
  "deep:galaxy:lvdb-ngc-0205",
  "deep:galaxy:lvdb-m-032",
  "deep:galaxy:lvdb-ngc-6822",
  "deep:galaxy:lvdb-ngc-0185",
  "deep:galaxy:lvdb-ic-1613",
  "deep:galaxy:lvdb-ic-0010",
  "deep:galaxy:lvdb-ngc-3109",
  "deep:galaxy:lvdb-sextans-b",
  "deep:galaxy:lvdb-wlm",
  "deep:galaxy:lvdb-sagittarius-1",
  "deep:galaxy:lvdb-fornax-1",
  "deep:galaxy:lvdb-sculptor-1",
]);

const renderer: SkyLayerRenderer<GalaxySkyObject> = {
  strategy: "point-cloud",
  buildRenderables: (objects, context) => {
    const visibleAtCurrentScale = context.viewport.cameraDistance >= 42;
    return objects.flatMap((object): Array<SkyMeshRenderable | SkyPointRenderable> => {
      const featured = context.featuredObjectIds.has(object.id);
      if (!visibleAtCurrentScale && !featured) return [];
      const position = context.projectPosition(object.position);
      if (!position) return [];
      const common = {
        id: `${LOCAL_GROUP_GALAXIES_LAYER_ID}:${object.id}`,
        layerId: LOCAL_GROUP_GALAXIES_LAYER_ID,
        objectId: object.id,
        position,
        label: object.name,
        color: object.visual?.color,
        labelPriority: object.visual?.labelPriority,
        interactive: true,
        lodTier: LOCAL_GROUP_PRIMARY_GALAXY_IDS.has(object.id)
          ? "local-group-anchor"
          : LOCAL_GROUP_VISUAL_GALAXY_IDS.has(object.id)
            ? "local-group-notable"
            : "local-group-dwarf",
        sourceChunkId: object.scientific?.localGroupMembership?.toLowerCase().replace(/\s+/g, "-"),
        importanceScore: getSkyObjectImportanceScore(object),
      };
      if (LOCAL_GROUP_VISUAL_GALAXY_IDS.has(object.id)) {
        const primary = LOCAL_GROUP_PRIMARY_GALAXY_IDS.has(object.id);
        return [{
          ...common,
          kind: "mesh",
          radiusSceneUnits: (object.visual?.pointSize ?? (primary ? 2.8 : 1.2)) * (featured ? 1.14 : 1),
          opacity: featured ? 0.9 : primary ? 0.72 : 0.58,
          meshMetadata: {
            family: "galaxy",
            shape: "galaxy-disk",
            rotation: object.scientific?.symbolRotation,
          },
        }];
      }
      return [{
        ...common,
        kind: "point",
        size: object.visual?.pointSize,
        brightness: object.visual?.brightness,
        opacity: featured ? 0.95 : 0.64,
        pointMetadata: {
          distanceLy: object.scientific?.distanceLy,
          apparentMagnitude: object.scientific?.apparentMagnitude,
          spectralType: "A",
        },
      }];
    });
  },
};

export const LOCAL_GROUP_GALAXIES_LAYER: SkyLayerDefinition<GalaxySkyObject> = {
  id: LOCAL_GROUP_GALAXIES_LAYER_ID,
  label: "Local Group galaxies",
  description: "117 confirmed LVDB galaxies with physical supergalactic directions and an explicit logarithmic radial projection.",
  objectKinds: ["galaxy"],
  defaultVisible: true,
  order: 28,
  status: "active",
  rendererRole: "points",
  capabilities: { selectable: true, hoverable: true, labels: true, searchable: true },
  time: {
    behavior: "static",
    cadence: "never",
    model: "lvdb-v1.1.1-catalogue-position",
    description: "Catalogue positions are static; available motions are reported but not propagated.",
  },
  renderer,
};

const createChunks = (): SkyLayerChunk[] => {
  const memberships = Array.from(new Set(LOCAL_GROUP_GALAXIES.map((object) => object.scientific?.localGroupMembership ?? "Local Group")));
  return memberships.map((membership) => {
    const objects = LOCAL_GROUP_GALAXIES.filter((object) => object.scientific?.localGroupMembership === membership);
    return {
      id: membership.toLowerCase().replace(/\s+/g, "-"),
      label: membership,
      objectIds: objects.map((object) => object.id),
      objectCount: objects.length,
      status: "ready",
      importanceTier: membership.includes("major") ? "core" : membership.includes("field") ? "context" : "background",
      bounds: {
        frame: "supergalactic-cartesian",
        center: { x: 0, y: 0, z: 0, unit: "scene-unit", sourceFrame: "supergalactic-cartesian" } as SceneVector3,
        radius: Math.max(...objects.map((object) => object.scientific?.distanceKpc ?? 0)),
        unit: "kiloparsec",
      },
    };
  });
};

export const createLocalGroupLayerData = (): SkyLayerData<GalaxySkyObject> => ({
  layerId: LOCAL_GROUP_GALAXIES_LAYER_ID,
  objects: LOCAL_GROUP_GALAXIES,
  chunks: createChunks(),
  metrics: {
    totalObjects: LOCAL_GROUP_GALAXIES.length,
    searchableObjects: LOCAL_GROUP_GALAXIES.length,
    chunkCount: 5,
    maxDistance: LOCAL_GROUP_CATALOG_METADATA.build.maximumDistanceKpc,
  },
  status: "ready",
  version: LOCAL_GROUP_CATALOG_VERSION,
});
