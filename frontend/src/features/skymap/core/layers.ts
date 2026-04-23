import type { SkyObject, SkyObjectKind } from "./objects";
import type { SkyLayerRenderer, SkyRenderContext, SkyRenderable } from "./renderers";
import type { SceneVector3, SkyCoordinateFrameId, DistanceUnit } from "./coordinates";
import type { SkyMapTimeState } from "./time";
import type { SkyLayerTimeResolver } from "./timeResolvers";

export type SkyLayerId = string;
export type SkyLayerStatus = "active" | "staged" | "planned";
export type SkyLayerRendererRole = "points" | "meshes" | "labels" | "tiles" | "overlays";
export type SkyLayerTimeBehavior = "static" | "time-aware" | "time-sensitive";
export type SkyLayerTimeCadence = "never" | "on-time-change" | "continuous";

export interface SkyLayerCapabilities {
  selectable?: boolean;
  hoverable?: boolean;
  labels?: boolean;
  searchable?: boolean;
  timeAware?: boolean;
  streaming?: boolean;
}

export interface SkyLayerTimeCapabilities {
  behavior: SkyLayerTimeBehavior;
  cadence: SkyLayerTimeCadence;
  model: string;
  description: string;
}

export interface SkyLayerDefinition<TObject extends SkyObject = SkyObject> {
  id: SkyLayerId;
  label: string;
  description: string;
  objectKinds: SkyObjectKind[];
  defaultVisible: boolean;
  order: number;
  status: SkyLayerStatus;
  rendererRole: SkyLayerRendererRole;
  capabilities: SkyLayerCapabilities;
  time: SkyLayerTimeCapabilities;
  timeResolver?: SkyLayerTimeResolver<TObject>;
  renderer?: SkyLayerRenderer<TObject>;
}

export interface SkyLayerData<TObject extends SkyObject = SkyObject> {
  layerId: SkyLayerId;
  objects: TObject[];
  status: "idle" | "loading" | "ready" | "error";
  version?: string;
  chunks?: SkyLayerChunk[];
  metrics?: SkyLayerDataMetrics;
  error?: string;
}

export interface SkyLayerState {
  visible: boolean;
  opacity: number;
  interactive: boolean;
  labels: "auto" | "hidden" | "always";
}

export interface SkyLayerChunk {
  id: string;
  label: string;
  objectIds: string[];
  objectCount: number;
  status: "ready" | "loading" | "staged";
  bounds?: {
    frame: SkyCoordinateFrameId;
    center: SceneVector3;
    radius: number;
    unit: DistanceUnit | "scene-unit";
  };
  importanceTier?: "core" | "context" | "background";
}

export interface SkyLayerDataMetrics {
  totalObjects: number;
  searchableObjects?: number;
  chunkCount?: number;
  maxDistance?: number;
}

export interface SkyLayerRegistry {
  definitions: SkyLayerDefinition[];
  getDefinition: (layerId: SkyLayerId) => SkyLayerDefinition | undefined;
}

export const createSkyLayerRegistry = (definitions: SkyLayerDefinition[]): SkyLayerRegistry => {
  const sorted = [...definitions].sort((a, b) => a.order - b.order);
  const byId = new Map(sorted.map((definition) => [definition.id, definition]));
  return {
    definitions: sorted,
    getDefinition: (layerId) => byId.get(layerId),
  };
};

export const buildInitialLayerStates = (definitions: SkyLayerDefinition[]): Record<SkyLayerId, SkyLayerState> =>
  Object.fromEntries(
    definitions.map((definition) => [
      definition.id,
      {
        visible: definition.defaultVisible,
        opacity: 1,
        interactive: Boolean(definition.capabilities.selectable || definition.capabilities.hoverable),
        labels: definition.capabilities.labels ? "auto" : "hidden",
      },
    ]),
  );

export const buildSkyMapRenderables = (
  registry: SkyLayerRegistry,
  layerData: SkyLayerData[],
  layerStates: Record<SkyLayerId, SkyLayerState>,
  context: SkyRenderContext,
): SkyRenderable[] => {
  return layerData.flatMap((data) => {
    const definition = registry.getDefinition(data.layerId);
    const layerState = layerStates[data.layerId];
    if (!definition?.renderer || !layerState?.visible || data.status !== "ready") {
      return [];
    }
    return definition.renderer.buildRenderables(data.objects, context);
  });
};

export const resolveSkyLayerDataForTime = (
  registry: SkyLayerRegistry,
  layerData: SkyLayerData[],
  time: SkyMapTimeState,
): SkyLayerData[] =>
  layerData.map((data) => {
    const definition = registry.getDefinition(data.layerId);
    if (!definition?.timeResolver || data.status !== "ready") {
      return data;
    }

    return {
      ...data,
      objects: definition.timeResolver.resolveObjects(data.objects, time),
    };
  });
