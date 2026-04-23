import type { SceneProjection, SceneVector3, SkyCoordinateFrameId, SkyEpoch, SkyPosition } from "./coordinates";
import { DEFAULT_SCENE_PROJECTION, projectPositionToScene } from "./coordinates";
import type { SkyObject, SkyObjectId } from "./objects";
import { createSkyMapTimeState, type SkyMapTimeState } from "./time";

export type SkyRenderableKind = "point" | "mesh" | "label" | "tile" | "annotation";
export type SkyRendererStrategy = "point-cloud" | "mesh" | "html-labels" | "tile-grid" | "overlay";

export interface SkyRenderViewport {
  frame: SkyCoordinateFrameId;
  cameraDistance: number;
  projection: SceneProjection;
  epoch?: SkyEpoch;
}

export interface SkyRenderContext {
  viewport: SkyRenderViewport;
  time: SkyMapTimeState;
  featuredObjectIds: ReadonlySet<SkyObjectId>;
  projectPosition: (position: SkyPosition) => SceneVector3 | null;
}

export interface SkyPointRenderable {
  kind: "point";
  id: string;
  layerId: string;
  objectId: SkyObjectId;
  position: SceneVector3;
  label: string;
  color?: string;
  size?: number;
  opacity?: number;
  brightness?: number;
  labelPriority?: number;
  interactive?: boolean;
  lodTier?: string;
  sourceChunkId?: string;
  importanceScore?: number;
  pointMetadata?: {
    spectralType?: string;
    luminositySolar?: number;
    temperatureK?: number;
    distanceLy?: number;
  };
}

export interface SkyLabelRenderable {
  kind: "label";
  id: string;
  layerId: string;
  objectId: SkyObjectId;
  position: SceneVector3;
  text: string;
  priority?: number;
}

export interface SkyMeshRenderable {
  kind: "mesh";
  id: string;
  layerId: string;
  objectId: SkyObjectId;
  position: SceneVector3;
  label?: string;
  radiusSceneUnits?: number;
  color?: string;
  opacity?: number;
  labelPriority?: number;
  interactive?: boolean;
  lodTier?: string;
  sourceChunkId?: string;
  importanceScore?: number;
  meshMetadata?: {
    family?: "solar-body" | "galaxy" | "nebula" | "cluster";
    shape?: "sphere" | "galaxy-disk" | "nebula-cloud" | "cluster-halo";
    rotation?: [number, number, number];
  };
}

export interface SkyTileRenderable {
  kind: "tile";
  id: string;
  layerId: string;
  objectId?: SkyObjectId;
  boundsLabel: string;
}

export interface SkyAnnotationRenderable {
  kind: "annotation";
  id: string;
  layerId: string;
  objectId: SkyObjectId;
  position: SceneVector3;
  text: string;
}

export type SkyRenderable =
  | SkyPointRenderable
  | SkyLabelRenderable
  | SkyMeshRenderable
  | SkyTileRenderable
  | SkyAnnotationRenderable;

export interface SkyLayerRenderer<TObject extends SkyObject = SkyObject> {
  strategy: SkyRendererStrategy;
  buildRenderables: (objects: TObject[], context: SkyRenderContext) => SkyRenderable[];
}

export const createSkyRenderContext = (
  viewport: Partial<SkyRenderViewport> & Pick<SkyRenderViewport, "cameraDistance" | "frame">,
  options: { featuredObjectIds?: Iterable<SkyObjectId>; time?: SkyMapTimeState } = {},
): SkyRenderContext => {
  const projection = viewport.projection ?? DEFAULT_SCENE_PROJECTION;
  return {
    viewport: {
      frame: viewport.frame,
      cameraDistance: viewport.cameraDistance,
      projection,
      epoch: viewport.epoch,
    },
    time: options.time ?? createSkyMapTimeState(),
    featuredObjectIds: new Set(options.featuredObjectIds ?? []),
    projectPosition: (position) => projectPositionToScene(position, projection),
  };
};

export const isSkyPointRenderable = (renderable: SkyRenderable): renderable is SkyPointRenderable =>
  renderable.kind === "point";

export const isSkyMeshRenderable = (renderable: SkyRenderable): renderable is SkyMeshRenderable =>
  renderable.kind === "mesh";
