import { describe, expect, it } from "vitest";
import { objectMatchesSkyMapFilters } from "../core/filters";
import { createSkyRenderContext } from "../core/renderers";
import { createDeepSpaceCatalog } from "./deepSpaceCatalog";
import {
  LOCAL_GROUP_CATALOG_METADATA,
  LOCAL_GROUP_GALAXIES,
  LOCAL_GROUP_MAP_PLACEMENT_NOTE,
} from "./localGroupCatalog";
import { createLocalGroupLayerData, LOCAL_GROUP_GALAXIES_LAYER } from "./localGroupLayer";
import { LOCAL_GROUP_VISUAL_GALAXY_IDS } from "./localGroupLayer";

describe("Local Group catalogue", () => {
  it("contains the validated 117-object LVDB selection with unique stable IDs", () => {
    expect(LOCAL_GROUP_CATALOG_METADATA.build.recordCount).toBe(117);
    expect(LOCAL_GROUP_GALAXIES).toHaveLength(117);
    expect(new Set(LOCAL_GROUP_GALAXIES.map((object) => object.id)).size).toBe(117);
    expect(LOCAL_GROUP_CATALOG_METADATA.build.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("preserves stable routes while replacing hand-staged anchor positions", () => {
    const andromeda = LOCAL_GROUP_GALAXIES.find((object) => object.id === "deep:galaxy:andromeda-galaxy");
    const triangulum = LOCAL_GROUP_GALAXIES.find((object) => object.id === "deep:galaxy:triangulum-galaxy");
    expect(andromeda).toMatchObject({
      name: "Andromeda Galaxy",
      position: { frame: "supergalactic-cartesian", unit: "kiloparsec" },
      scientific: { distanceKpc: 776.25, sourceRelease: "v1.1.1" },
    });
    expect(triangulum?.relations?.[0]).toMatchObject({
      type: "part-of",
      targetId: "deep:galaxy:andromeda-galaxy",
    });
    expect(andromeda?.scientific?.mapPlacementNote).toBe(LOCAL_GROUP_MAP_PLACEMENT_NOTE);
  });

  it("does not duplicate the physical Local Group anchors in the curated scene-space layer", () => {
    const curatedIds = new Set(createDeepSpaceCatalog("galaxy").objects.map((object) => object.id));
    for (const id of [
      "deep:galaxy:andromeda-galaxy",
      "deep:galaxy:triangulum-galaxy",
      "deep:galaxy:large-magellanic-cloud",
    ]) {
      expect(curatedIds.has(id)).toBe(false);
    }
  });

  it("supports the dedicated LVDB source filter", () => {
    const andromeda = LOCAL_GROUP_GALAXIES.find((object) => object.id === "deep:galaxy:andromeda-galaxy");
    expect(andromeda).toBeDefined();
    expect(objectMatchesSkyMapFilters(andromeda!, {
      family: "galaxies",
      distance: "extragalactic",
      source: "local-volume-db",
      landmarksOnly: true,
    })).toBe(true);
  });
});

describe("Local Group layer", () => {
  it("keeps every catalogue galaxy and promotes notable neighbours into visible galaxy meshes", () => {
    const context = createSkyRenderContext({ frame: "supergalactic-cartesian", cameraDistance: 125 });
    const renderables = LOCAL_GROUP_GALAXIES_LAYER.renderer!.buildRenderables(LOCAL_GROUP_GALAXIES, context);
    expect(renderables.filter((renderable) => renderable.kind === "mesh")).toHaveLength(LOCAL_GROUP_VISUAL_GALAXY_IDS.size);
    expect(renderables.filter((renderable) => renderable.kind === "point")).toHaveLength(117 - LOCAL_GROUP_VISUAL_GALAXY_IDS.size);
    expect(renderables.find((renderable) => renderable.objectId === "deep:galaxy:lvdb-ngc-6822")?.kind).toBe("mesh");
    const positioned = renderables.filter((renderable) => "position" in renderable);
    expect(Math.max(...positioned.map((renderable) => Math.hypot(renderable.position.x, renderable.position.y, renderable.position.z)))).toBeLessThanOrEqual(128.001);
  });

  it("publishes five membership chunks with physical-kpc bounds", () => {
    const data = createLocalGroupLayerData();
    expect(data.chunks).toHaveLength(5);
    expect(data.chunks?.reduce((sum, chunk) => sum + chunk.objectCount, 0)).toBe(117);
    expect(data.chunks?.every((chunk) => chunk.bounds?.unit === "kiloparsec")).toBe(true);
  });
});
