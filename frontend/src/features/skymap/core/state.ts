import { DEFAULT_SCENE_PROJECTION, type SceneProjection, type SkyCoordinateFrameId, type SkyEpoch } from "./coordinates";
import { createDefaultSkyMapFilters, type SkyMapFilterState } from "./filters";
import { buildInitialLayerStates, type SkyLayerDefinition, type SkyLayerId, type SkyLayerState } from "./layers";
import {
  classifySkyMapScaleBand,
  createInitialSkyMapNavigationState,
  SKYMAP_DEFAULT_CAMERA_POSE,
  SKYMAP_OVERVIEW_CAMERA_POSE,
  type SkyMapNavigationIntent,
  type SkyMapNavigationMode,
  type SkyMapNavigationState,
  type SkyMapScaleBandId,
} from "./navigation";
import type { SkyObjectId } from "./objects";
import {
  advanceSkyMapTime,
  createSkyMapTimeState,
  resetSkyMapTimeToNow,
  setSkyMapDateKey,
  stepSkyMapTime,
  type SkyMapPlaybackState,
  type SkyMapTimeSourceMode,
  type SkyMapTimeState,
} from "./time";
import type { TimeDirection } from "../../time/timePlayback";

export interface SkyMapViewportState {
  frame: SkyCoordinateFrameId;
  mode: "local-preview" | "multi-scale";
  cameraDistance: number;
  projection: SceneProjection;
  epoch?: SkyEpoch;
}

export interface SkyMapSelectionState {
  selectedObjectId: SkyObjectId | null;
  hoveredObjectId: SkyObjectId | null;
  focusedObjectId: SkyObjectId | null;
  focusRequestId: number;
}

export interface SkyMapSearchState {
  query: string;
}

export interface SkyMapState {
  viewport: SkyMapViewportState;
  navigation: SkyMapNavigationState;
  layers: Record<SkyLayerId, SkyLayerState>;
  selection: SkyMapSelectionState;
  search: SkyMapSearchState;
  time: SkyMapTimeState;
  filters: SkyMapFilterState;
}

export interface SkyMapViewportStatus {
  objectCount: number;
  visibleCount: number;
  activeLayerCount: number;
  catalogChunkCount: number;
  activeChunkCount: number;
  interactionCandidateCount: number;
  detailTier: string;
  cameraDistance: number;
  frame: SkyCoordinateFrameId;
  navigationMode: SkyMapNavigationMode;
  scaleBand: SkyMapScaleBandId;
  catalogStreamStatus: string;
  catalogLoadedRecords: number;
  catalogTotalRecords: number;
  catalogSchedulingMode: "manifest-order" | "view-adjacent";
  catalogActiveChunkId: string | null;
  catalogLoadMessage: string;
  catalogLoadError: string | null;
  catalogPropagationStatus: string;
  catalogRenderEpochJulianYear: number;
  catalogPropagationMessage: string;
  catalogPropagationError: string | null;
  solarEphemerisStatus: string;
  solarEphemerisYear: number | null;
  solarEphemerisModel: string;
  solarEphemerisMessage: string;
}

export type SkyMapAction =
  | { type: "selectObject"; objectId: SkyObjectId | null; intent?: SkyMapNavigationIntent; scaleBand?: SkyMapScaleBandId }
  | { type: "hoverObject"; objectId: SkyObjectId | null }
  | { type: "focusObject"; objectId: SkyObjectId | null; intent?: SkyMapNavigationIntent; scaleBand?: SkyMapScaleBandId }
  | { type: "setNavigationMode"; mode: SkyMapNavigationMode; intent?: SkyMapNavigationIntent }
  | { type: "resetNavigationView" }
  | { type: "setLayerVisibility"; layerId: SkyLayerId; visible: boolean }
  | { type: "soloLayer"; layerId: SkyLayerId; activeLayerIds: SkyLayerId[] }
  | { type: "setLayerVisibilityPreset"; visibility: Record<SkyLayerId, boolean>; activeLayerIds: SkyLayerId[] }
  | { type: "setLayerLabels"; layerId: SkyLayerId; labels: SkyLayerState["labels"] }
  | { type: "setViewport"; viewport: Partial<SkyMapViewportState> }
  | { type: "setTimeDate"; dateKey: string }
  | { type: "setTimePlayback"; playback: SkyMapPlaybackState }
  | { type: "setTimeDirection"; direction: TimeDirection }
  | { type: "setTimeSpeed"; speedDaysPerSecond: number }
  | { type: "setTimeSourceMode"; sourceMode: SkyMapTimeSourceMode }
  | { type: "stepTime"; days: number }
  | { type: "advanceTime"; elapsedRealMs: number }
  | { type: "resetTimeToNow" }
  | { type: "setSearchQuery"; query: string }
  | { type: "setFilters"; filters: Partial<SkyMapFilterState> }
  | { type: "resetFilters" };

export const createInitialSkyMapState = (layerDefinitions: SkyLayerDefinition[]): SkyMapState => ({
  viewport: {
    frame: "local-interstellar-cartesian",
    mode: "local-preview",
    cameraDistance: SKYMAP_DEFAULT_CAMERA_POSE.distance,
    projection: DEFAULT_SCENE_PROJECTION,
    epoch: { kind: "static" },
  },
  navigation: createInitialSkyMapNavigationState(),
  layers: buildInitialLayerStates(layerDefinitions),
  selection: {
    selectedObjectId: null,
    hoveredObjectId: null,
    focusedObjectId: null,
    focusRequestId: 0,
  },
  search: {
    query: "",
  },
  time: createSkyMapTimeState(),
  filters: createDefaultSkyMapFilters(),
});

export const skyMapReducer = (state: SkyMapState, action: SkyMapAction): SkyMapState => {
  switch (action.type) {
    case "selectObject":
      return {
        ...state,
        navigation: action.objectId
          ? {
              ...state.navigation,
              mode: "object-focus",
              scaleBand: action.scaleBand ?? state.navigation.scaleBand,
              lastIntent: action.intent ?? "direct-select",
            }
          : {
              ...state.navigation,
              mode: "free-explore",
              lastIntent: "manual-control",
            },
        selection: {
          ...state.selection,
          selectedObjectId: action.objectId,
          focusedObjectId: action.objectId,
          focusRequestId: action.objectId ? state.selection.focusRequestId + 1 : state.selection.focusRequestId,
        },
      };
    case "hoverObject":
      return {
        ...state,
        selection: {
          ...state.selection,
          hoveredObjectId: action.objectId,
        },
      };
    case "focusObject":
      return {
        ...state,
        navigation: action.objectId
          ? {
              ...state.navigation,
              mode: "object-focus",
              scaleBand: action.scaleBand ?? state.navigation.scaleBand,
              lastIntent: action.intent ?? "manual-focus",
            }
          : {
              ...state.navigation,
              mode: "free-explore",
              lastIntent: "manual-control",
            },
        selection: {
          ...state.selection,
          focusedObjectId: action.objectId,
          focusRequestId: action.objectId ? state.selection.focusRequestId + 1 : state.selection.focusRequestId,
        },
      };
    case "setNavigationMode":
      return {
        ...state,
        navigation: {
          ...state.navigation,
          mode: action.mode,
          lastIntent: action.intent ?? state.navigation.lastIntent,
        },
      };
    case "resetNavigationView":
      return {
        ...state,
        viewport: {
          ...state.viewport,
          cameraDistance: SKYMAP_OVERVIEW_CAMERA_POSE.distance,
        },
        navigation: {
          ...state.navigation,
          mode: "overview",
          scaleBand: SKYMAP_OVERVIEW_CAMERA_POSE.scaleBand,
          lastIntent: "reset-view",
          resetRequestId: state.navigation.resetRequestId + 1,
        },
        selection: {
          ...state.selection,
          focusedObjectId: null,
        },
      };
    case "setLayerVisibility":
      if (!state.layers[action.layerId]) {
        return state;
      }
      return {
        ...state,
        layers: {
          ...state.layers,
          [action.layerId]: {
            ...state.layers[action.layerId],
            visible: action.visible,
          },
        },
      };
    case "soloLayer": {
      if (!state.layers[action.layerId]) {
        return state;
      }
      const activeLayerIds = new Set(action.activeLayerIds);
      return {
        ...state,
        layers: Object.fromEntries(
          Object.entries(state.layers).map(([layerId, layerState]) => [
            layerId,
            activeLayerIds.has(layerId)
              ? {
                  ...layerState,
                  visible: layerId === action.layerId,
                }
              : layerState,
          ]),
        ),
      };
    }
    case "setLayerVisibilityPreset": {
      const activeLayerIds = new Set(action.activeLayerIds);
      return {
        ...state,
        layers: Object.fromEntries(
          Object.entries(state.layers).map(([layerId, layerState]) => [
            layerId,
            activeLayerIds.has(layerId)
              ? {
                  ...layerState,
                  visible: Boolean(action.visibility[layerId]),
                }
              : layerState,
          ]),
        ),
      };
    }
    case "setLayerLabels":
      if (!state.layers[action.layerId]) {
        return state;
      }
      return {
        ...state,
        layers: {
          ...state.layers,
          [action.layerId]: {
            ...state.layers[action.layerId],
            labels: action.labels,
          },
        },
      };
    case "setViewport":
      return {
        ...state,
        viewport: {
          ...state.viewport,
          ...action.viewport,
        },
        navigation:
          typeof action.viewport.cameraDistance === "number" && state.navigation.mode !== "object-focus"
            ? {
                ...state.navigation,
                scaleBand: classifySkyMapScaleBand(action.viewport.cameraDistance),
              }
            : state.navigation,
      };
    case "setTimeDate":
      return {
        ...state,
        time: setSkyMapDateKey(
          {
            ...state.time,
            playback: "paused",
          },
          action.dateKey,
        ),
      };
    case "setTimePlayback":
      return {
        ...state,
        time: {
          ...state.time,
          playback: action.playback,
          sourceMode: action.playback === "playing" ? "simulated" : state.time.sourceMode,
        },
      };
    case "setTimeDirection":
      return {
        ...state,
        time: {
          ...state.time,
          direction: action.direction,
          sourceMode: "simulated",
        },
      };
    case "setTimeSpeed":
      return {
        ...state,
        time: {
          ...state.time,
          speedDaysPerSecond: action.speedDaysPerSecond,
          sourceMode: "simulated",
        },
      };
    case "setTimeSourceMode":
      return {
        ...state,
        time: {
          ...state.time,
          sourceMode: action.sourceMode,
        },
      };
    case "stepTime":
      return {
        ...state,
        time: stepSkyMapTime(
          {
            ...state.time,
            playback: "paused",
          },
          action.days,
        ),
      };
    case "advanceTime":
      return {
        ...state,
        time: advanceSkyMapTime(state.time, action.elapsedRealMs),
      };
    case "resetTimeToNow":
      return {
        ...state,
        time: resetSkyMapTimeToNow(state.time),
      };
    case "setSearchQuery":
      return {
        ...state,
        search: {
          query: action.query,
        },
      };
    case "setFilters":
      return {
        ...state,
        filters: {
          ...state.filters,
          ...action.filters,
        },
      };
    case "resetFilters":
      return {
        ...state,
        filters: createDefaultSkyMapFilters(),
      };
  }
};
