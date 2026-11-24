import type { SceneProjection, SceneVector3, SkyCoordinateFrameId, SkyEpoch, SkyPosition } from "./coordinates";
import { DEFAULT_SCENE_PROJECTION, projectPositionToScene } from "./coordinates";
import type { SkyObject, SkyObjectId } from "./objects";
import { createSkyMapTimeState, type SkyMapTimeState } from "./time";

export type SkyRenderableKind = "point" | "mesh" | "structure" | "line" | "label" | "tile" | "annotation";
export type SkyRendererStrategy = "point-cloud" | "mesh" | "procedural-volume" | "html-labels" | "tile-grid" | "overlay";

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
    apparentMagnitude?: number;
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
  focusRadiusSceneUnits?: number;
  color?: string;
  opacity?: number;
  labelPriority?: number;
  interactive?: boolean;
  lodTier?: string;
  sourceChunkId?: string;
  importanceScore?: number;
  meshMetadata?: {
    family?: "solar-body" | "galaxy" | "nebula" | "cluster" | "galactic-structure";
    shape?: "sphere" | "galaxy-disk" | "nebula-cloud" | "cluster-halo";
    rotation?: [number, number, number];
  };
}

export interface SkyStructureRenderable {
  kind: "structure";
  id: string;
  layerId: string;
  objectId: SkyObjectId;
  position: SceneVector3;
  label: string;
  opacity?: number;
  lodTier?: string;
  sourceChunkId?: string;
  structureMetadata:
    | {
        shape: "milky-way-schematic";
        radiusSceneUnits: number;
        thicknessSceneUnits: number;
        armCount: number;
        pitchAngleDeg: number;
        innerArmRadiusSceneUnits: number;
        seed: number;
        modelStatus: "scientific-schematic";
      }
    | {
        shape: "milky-way-catalogue";
        radiusSceneUnits: number;
        sceneUnitsPerKpc: number;
        galactocentricSunDistanceKpc: number;
        tracerCount: number;
        fittedSegmentCount: number;
        fallbackArmCount: number;
        fallbackPitchAngleDeg: number;
        fallbackInnerRadiusKpc: number;
        fallbackThicknessKpc: number;
        seed: number;
        manifestUrl: string;
        modelStatus: "catalog-derived";
      }
    | {
        shape: "desi-redshift-lightcone";
        radiusSceneUnits: number;
        sceneUnitsPerMpc: number;
        tracerCount: number;
        redshiftMin: number;
        redshiftMax: number;
        raMinDeg: number;
        raMaxDeg: number;
        decMinDeg: number;
        decMaxDeg: number;
        fallbackSeed: number;
        fallbackNodeCount: number;
        manifestUrl: string;
        coordinateConvention: "observer-centred-redshift-space-comoving-cartesian";
        modelStatus: "catalog-derived";
      };
}

export interface SkyLineRenderable {
  kind: "line";
  id: string;
  layerId: string;
  objectId: SkyObjectId;
  paths: SceneVector3[][];
  label?: string;
  color?: string;
  opacity?: number;
  depthTest?: boolean;
  lodTier?: string;
  sourceChunkId?: string;
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
  | SkyStructureRenderable
  | SkyLineRenderable
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

export const isSkyStructureRenderable = (
  renderable: SkyRenderable,
): renderable is SkyStructureRenderable => renderable.kind === "structure";

export const isSkyLineRenderable = (renderable: SkyRenderable): renderable is SkyLineRenderable =>
  renderable.kind === "line";
