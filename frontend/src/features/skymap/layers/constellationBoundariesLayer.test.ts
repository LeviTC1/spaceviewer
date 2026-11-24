import { describe, expect, it } from "vitest";
import { objectMatchesSkyMapFilters } from "../core/filters";
import { createSkyRenderContext, isSkyLineRenderable } from "../core/renderers";
import {
  CONSTELLATION_BOUNDARY_CATALOG_METADATA,
  CONSTELLATION_BOUNDARY_DISPLAY_RADIUS,
  CONSTELLATION_BOUNDARY_OVERLAY,
  CONSTELLATION_BOUNDARY_PATHS,
} from "./constellationBoundaryCatalog";
import {
  CONSTELLATION_BOUNDARIES_LAYER,
  createConstellationBoundariesLayerData,
} from "./constellationBoundariesLayer";

describe("IAU constellation-boundary catalogue", () => {
  it("contains all 88 official regions across 89 closed source paths", () => {
    const catalog = CONSTELLATION_BOUNDARY_CATALOG_METADATA;
    expect(catalog.build.constellationCount).toBe(88);
    expect(catalog.build.regionPathCount).toBe(89);
    expect(catalog.build.sourceVertexCount).toBe(1_565);
    expect(catalog.regions).toHaveLength(89);
    expect(new Set(catalog.regions.map((region) => region.abbreviation)).size).toBe(88);
    expect(catalog.regions.filter((region) => region.abbreviation === "SER")).toHaveLength(2);
    expect(catalog.regions.every((region) => region.closed)).toBe(true);
  });

  it("deduplicates undirected shared edges and preserves the display-sphere radius", () => {
    const catalog = CONSTELLATION_BOUNDARY_CATALOG_METADATA;
    expect(catalog.build.uniqueBoundarySegmentCount).toBe(788);
    expect(new Set(catalog.boundarySegments.map((segment) => segment.id)).size).toBe(catalog.boundarySegments.length);
    expect(CONSTELLATION_BOUNDARY_PATHS).toHaveLength(catalog.boundarySegments.length);
    for (const path of CONSTELLATION_BOUNDARY_PATHS) {
      expect(path.length).toBeGreaterThanOrEqual(2);
      for (const vertex of path) {
        expect(Math.hypot(vertex.x, vertex.y, vertex.z)).toBeCloseTo(CONSTELLATION_BOUNDARY_DISPLAY_RADIUS, 5);
        expect(vertex.sourceFrame).toBe("equatorial-j2000");
      }
    }
  });
});

describe("constellation-boundary layer", () => {
  it("is an optional, passive overlay that remains available through object filters", () => {
    expect(CONSTELLATION_BOUNDARIES_LAYER).toMatchObject({
      defaultVisible: false,
      rendererRole: "overlays",
      capabilities: { selectable: false, hoverable: false, searchable: false },
    });
    expect(objectMatchesSkyMapFilters(CONSTELLATION_BOUNDARY_OVERLAY, {
      family: "galaxies",
      distance: "extragalactic",
      source: "messier-ngc",
      landmarksOnly: true,
    })).toBe(true);
  });

  it("emits one batched line renderable locally and culls it beyond the all-sky band", () => {
    const nearContext = createSkyRenderContext({ frame: "equatorial-j2000", cameraDistance: 120 });
    const farContext = createSkyRenderContext({ frame: "equatorial-j2000", cameraDistance: 230 });
    const near = CONSTELLATION_BOUNDARIES_LAYER.renderer!.buildRenderables([CONSTELLATION_BOUNDARY_OVERLAY], nearContext);
    const far = CONSTELLATION_BOUNDARIES_LAYER.renderer!.buildRenderables([CONSTELLATION_BOUNDARY_OVERLAY], farContext);
    expect(near).toHaveLength(1);
    expect(isSkyLineRenderable(near[0])).toBe(true);
    expect(near[0]).toMatchObject({ kind: "line", sourceChunkId: "iau-j2000-boundaries", depthTest: false });
    if (isSkyLineRenderable(near[0])) expect(near[0].paths).toHaveLength(788);
    expect(far).toHaveLength(0);
  });

  it("publishes the region count and one ready angular-guide chunk", () => {
    const data = createConstellationBoundariesLayerData();
    expect(data.metrics?.totalObjects).toBe(88);
    expect(data.chunks).toHaveLength(1);
    expect(data.chunks?.[0]).toMatchObject({ objectCount: 88, status: "ready", bounds: { unit: "scene-unit" } });
  });
});
