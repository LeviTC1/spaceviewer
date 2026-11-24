import type { SkyPosition } from "../core/coordinates";
import type { SkyLayerData, SkyLayerDefinition } from "../core/layers";
import type { AnnotationSkyObject } from "../core/objects";
import type { SkyLayerRenderer, SkyPointRenderable } from "../core/renderers";

export const ANNOTATIONS_LAYER_ID = "annotations.user";

export interface UserSkyAnnotation {
  id: string;
  label: string;
  body: string;
  position: SkyPosition;
  targetObjectId?: string;
  targetName?: string;
  createdAt: string;
  timeKey: string;
}

const annotationRenderer: SkyLayerRenderer<AnnotationSkyObject> = {
  strategy: "point-cloud",
  buildRenderables: (objects, context) => {
    return objects.flatMap((object): SkyPointRenderable[] => {
      const position = context.projectPosition(object.position);
      if (!position) return [];
      const featured = context.featuredObjectIds.has(object.id);
      return [
        {
          kind: "point",
          id: `${ANNOTATIONS_LAYER_ID}:${object.id}`,
          layerId: ANNOTATIONS_LAYER_ID,
          objectId: object.id,
          position,
          label: object.name,
          color: object.visual?.color ?? "#ffb35c",
          brightness: featured ? 1 : 0.86,
          size: featured ? 1.55 : 1.22,
          labelPriority: featured ? 100 : object.visual?.labelPriority ?? 94,
          interactive: true,
          lodTier: "user-annotations",
          sourceChunkId: "user-annotations",
          importanceScore: object.importance?.score ?? 88,
          pointMetadata: {
            spectralType: "K",
            luminositySolar: 1.5,
            temperatureK: 4400,
            distanceLy: 1,
          },
        },
      ];
    });
  },
};

export const ANNOTATIONS_LAYER: SkyLayerDefinition<AnnotationSkyObject> = {
  id: ANNOTATIONS_LAYER_ID,
  label: "Annotations",
  description: "Local user-created notes anchored to visible SkyMap objects.",
  objectKinds: ["annotation"],
  defaultVisible: true,
  order: 80,
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
    model: "local-user-annotations",
    description: "Annotations are stored locally and keep the UTC date active when they were created.",
  },
  renderer: annotationRenderer,
};

export const createAnnotationSkyObject = (annotation: UserSkyAnnotation): AnnotationSkyObject => ({
  id: `annotation:${annotation.id}`,
  kind: "annotation",
  name: annotation.label,
  position: annotation.position,
  provenance: [
    {
      source: "SpaceViewer local annotation",
      catalog: "User notes",
      sourceId: annotation.id,
      retrievedAt: annotation.createdAt,
      confidence: "derived",
    },
  ],
  visual: {
    color: "#ffb35c",
    pointSize: 1.35,
    brightness: 1,
    labelPriority: 96,
  },
  search: {
    aliases: annotation.targetName ? [annotation.targetName] : [],
    tags: ["annotation", "user note", annotation.targetName ?? ""].filter(Boolean),
    description: annotation.body,
    keywords: ["annotation", "note", annotation.label, annotation.body, annotation.targetName ?? ""].filter(Boolean),
  },
  scientific: {
    body: annotation.body,
    targetName: annotation.targetName,
    createdAt: annotation.createdAt,
    timeKey: annotation.timeKey,
  },
  relations: annotation.targetObjectId
    ? [
        {
          type: "annotates",
          targetId: annotation.targetObjectId,
          label: annotation.targetName,
        },
      ]
    : undefined,
  time: {
    behavior: "time-aware",
    model: "local-user-annotation",
    note: `Created for SkyMap date ${annotation.timeKey}.`,
  },
  importance: {
    score: 88,
    tier: "notable",
    reasons: ["User-created map note"],
  },
});

export const createAnnotationsLayerData = (
  annotations: UserSkyAnnotation[],
): SkyLayerData<AnnotationSkyObject> => {
  const objects = annotations.map(createAnnotationSkyObject);
  return {
    layerId: ANNOTATIONS_LAYER_ID,
    objects,
    status: "ready",
    version: "local-annotations-v1",
    chunks: [
      {
        id: "user-annotations",
        label: "Local annotations",
        objectIds: objects.map((object) => object.id),
        objectCount: objects.length,
        status: "ready",
        importanceTier: "core",
      },
    ],
    metrics: {
      totalObjects: objects.length,
      searchableObjects: objects.length,
      chunkCount: 1,
    },
  };
};
