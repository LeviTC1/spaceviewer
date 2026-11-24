import { describe, expect, it } from "vitest";
import type { SkyLayerDefinition } from "./layers";
import {
  SKYMAP_OVERVIEW_CAMERA_POSE,
  classifySkyMapScaleBand,
} from "./navigation";
import { createInitialSkyMapState, skyMapReducer } from "./state";
import { getSkyMapDateKey } from "./time";

const makeLayer = (
  id: string,
  overrides: Partial<SkyLayerDefinition> = {},
): SkyLayerDefinition => ({
  id,
  label: id,
  description: `${id} fixture layer`,
  objectKinds: ["star"],
  defaultVisible: true,
  order: 1,
  status: "active",
  rendererRole: "points",
  capabilities: {
    selectable: true,
    hoverable: true,
    labels: true,
    searchable: true,
  },
  time: {
    behavior: "static",
    cadence: "never",
    model: "fixture",
    description: "Static reducer-test fixture.",
  },
  ...overrides,
});

const layerDefinitions = [
  makeLayer("local-stars", { order: 1 }),
  makeLayer("solar-bodies", { order: 2 }),
  makeLayer("annotations", {
    order: 3,
    defaultVisible: false,
    capabilities: {
      selectable: true,
      hoverable: false,
      labels: false,
      searchable: true,
    },
  }),
];

const createState = () => createInitialSkyMapState(layerDefinitions);

describe("skyMapReducer layer state", () => {
  it("builds initial layer state from layer capabilities", () => {
    const state = createState();

    expect(state.layers["local-stars"]).toMatchObject({
      visible: true,
      interactive: true,
      labels: "auto",
    });
    expect(state.layers.annotations).toMatchObject({
      visible: false,
      interactive: true,
      labels: "hidden",
    });
  });

  it("ignores unknown layer visibility updates without changing state identity", () => {
    const state = createState();
    const next = skyMapReducer(state, {
      type: "setLayerVisibility",
      layerId: "missing-layer",
      visible: false,
    });

    expect(next).toBe(state);
  });

  it("solos only the active layer set and preserves layers outside that set", () => {
    const state = createState();
    const next = skyMapReducer(state, {
      type: "soloLayer",
      layerId: "solar-bodies",
      activeLayerIds: ["local-stars", "solar-bodies"],
    });

    expect(next.layers["local-stars"].visible).toBe(false);
    expect(next.layers["solar-bodies"].visible).toBe(true);
    expect(next.layers.annotations.visible).toBe(false);
    expect(next.layers.annotations).toBe(state.layers.annotations);
  });

  it("applies saved visibility presets only to active layers", () => {
    const state = createState();
    const next = skyMapReducer(state, {
      type: "setLayerVisibilityPreset",
      activeLayerIds: ["local-stars", "solar-bodies"],
      visibility: {
        "local-stars": false,
        "solar-bodies": true,
        annotations: true,
      },
    });

    expect(next.layers["local-stars"].visible).toBe(false);
    expect(next.layers["solar-bodies"].visible).toBe(true);
    expect(next.layers.annotations.visible).toBe(false);
    expect(next.layers.annotations).toBe(state.layers.annotations);
  });
});

describe("skyMapReducer selection and navigation", () => {
  it("selects objects by focusing them and incrementing focus requests", () => {
    const state = createState();
    const selected = skyMapReducer(state, {
      type: "selectObject",
      objectId: "deep:galaxy:andromeda",
      intent: "search-result",
    });

    expect(selected.selection.selectedObjectId).toBe("deep:galaxy:andromeda");
    expect(selected.selection.focusedObjectId).toBe("deep:galaxy:andromeda");
    expect(selected.selection.focusRequestId).toBe(state.selection.focusRequestId + 1);
    expect(selected.navigation).toMatchObject({
      mode: "object-focus",
      lastIntent: "search-result",
    });

    const cleared = skyMapReducer(selected, { type: "selectObject", objectId: null });
    expect(cleared.selection.selectedObjectId).toBeNull();
    expect(cleared.selection.focusedObjectId).toBeNull();
    expect(cleared.selection.focusRequestId).toBe(selected.selection.focusRequestId);
    expect(cleared.navigation).toMatchObject({
      mode: "free-explore",
      lastIntent: "manual-control",
    });
  });

  it("resets the view without clearing the selected object", () => {
    const focused = skyMapReducer(createState(), {
      type: "selectObject",
      objectId: "solar:planet:mars",
      intent: "direct-select",
    });
    const reset = skyMapReducer(focused, { type: "resetNavigationView" });

    expect(reset.viewport.cameraDistance).toBe(SKYMAP_OVERVIEW_CAMERA_POSE.distance);
    expect(reset.navigation).toMatchObject({
      mode: "overview",
      scaleBand: SKYMAP_OVERVIEW_CAMERA_POSE.scaleBand,
      lastIntent: "reset-view",
      resetRequestId: focused.navigation.resetRequestId + 1,
    });
    expect(reset.selection.selectedObjectId).toBe("solar:planet:mars");
    expect(reset.selection.focusedObjectId).toBeNull();
  });

  it("updates the scale band from camera distance changes", () => {
    const state = createState();
    const next = skyMapReducer(state, {
      type: "setViewport",
      viewport: { cameraDistance: 14 },
    });

    expect(next.viewport.cameraDistance).toBe(14);
    expect(next.navigation.scaleBand).toBe(classifySkyMapScaleBand(14));
  });

  it("keeps the selected object's physical scale band during a close focus flight", () => {
    const focused = skyMapReducer(createState(), {
      type: "selectObject",
      objectId: "star:sirius-a",
      intent: "search-result",
      scaleBand: "stellar-neighborhood",
    });
    const settled = skyMapReducer(focused, {
      type: "setViewport",
      viewport: { cameraDistance: 7.4 },
    });

    expect(settled.navigation.mode).toBe("object-focus");
    expect(settled.navigation.scaleBand).toBe("stellar-neighborhood");
  });
});

describe("skyMapReducer filters and time", () => {
  it("merges and resets filters", () => {
    const filtered = skyMapReducer(createState(), {
      type: "setFilters",
      filters: {
        family: "galaxies",
        landmarksOnly: true,
      },
    });

    expect(filtered.filters).toMatchObject({
      family: "galaxies",
      distance: "all",
      source: "all",
      landmarksOnly: true,
    });

    const reset = skyMapReducer(filtered, { type: "resetFilters" });
    expect(reset.filters).toEqual({
      family: "all",
      distance: "all",
      source: "all",
      landmarksOnly: false,
    });
  });

  it("pauses playback when dates are set or stepped, and advances only while playing", () => {
    const dated = skyMapReducer(createState(), {
      type: "setTimeDate",
      dateKey: "2030-05-05",
    });
    expect(getSkyMapDateKey(dated.time)).toBe("2030-05-05");
    expect(dated.time.playback).toBe("paused");
    expect(dated.time.sourceMode).toBe("simulated");

    const playing = skyMapReducer(dated, { type: "setTimePlayback", playback: "playing" });
    const advanced = skyMapReducer(playing, { type: "advanceTime", elapsedRealMs: 1_000 });
    expect(getSkyMapDateKey(advanced.time)).toBe("2030-05-12");
    expect(advanced.time.playback).toBe("playing");

    const stepped = skyMapReducer(advanced, { type: "stepTime", days: -2 });
    expect(getSkyMapDateKey(stepped.time)).toBe("2030-05-10");
    expect(stepped.time.playback).toBe("paused");
  });

  it("runs the same bounded clock backward when reverse direction is selected", () => {
    const dated = skyMapReducer(createState(), { type: "setTimeDate", dateKey: "2030-05-05" });
    const reversing = skyMapReducer(
      skyMapReducer(
        skyMapReducer(dated, { type: "setTimeDirection", direction: "reverse" }),
        { type: "setTimePlayback", playback: "playing" },
      ),
      { type: "advanceTime", elapsedRealMs: 1_000 },
    );

    expect(getSkyMapDateKey(reversing.time)).toBe("2030-04-28");
    expect(reversing.time.direction).toBe("reverse");
    expect(reversing.time.playback).toBe("playing");

    const boundary = skyMapReducer(
      skyMapReducer(
        skyMapReducer(createState(), { type: "setTimeDate", dateKey: "1900-01-02" }),
        { type: "setTimeDirection", direction: "reverse" },
      ),
      { type: "setTimePlayback", playback: "playing" },
    );
    const stopped = skyMapReducer(boundary, { type: "advanceTime", elapsedRealMs: 1_000 });
    expect(getSkyMapDateKey(stopped.time)).toBe("1900-01-01");
    expect(stopped.time.playback).toBe("paused");
  });
});
