import { describe, expect, it } from "vitest";
import { SCALE_DOMAINS } from "../src/domain/astro/scaleDomains";
import { objectMatchesSkyMapFilters } from "../src/features/skymap/core/filters";
import { createSkyRenderContext, isSkyMeshRenderable, isSkyStructureRenderable } from "../src/features/skymap/core/renderers";
import {
  createGalacticStructureLayerData,
  GALACTIC_STRUCTURE_LAYER,
  GALACTIC_STRUCTURE_MODEL,
} from "../src/features/skymap/layers/galacticStructureLayer";

describe("Milky Way structural domain", () => {
  it("keeps the Sun-centre calibration in scientific units outside the renderer", () => {
    expect(Math.abs(GALACTIC_STRUCTURE_MODEL.centerSceneX) / GALACTIC_STRUCTURE_MODEL.sceneUnitsPerKpc).toBeCloseTo(
      GALACTIC_STRUCTURE_MODEL.galactocentricSunDistanceKpc,
      4,
    );
    expect(GALACTIC_STRUCTURE_MODEL.status).toBe("catalog-derived");
    expect(GALACTIC_STRUCTURE_MODEL.tracerCount).toBe(199);
    expect(GALACTIC_STRUCTURE_MODEL.fittedSegmentCount).toBe(7);
    expect(SCALE_DOMAINS.galactic.availability).toBe("implemented");
  });

  it("builds a structure volume plus inspectable centre and Solar markers at wide-field scale", () => {
    const data = createGalacticStructureLayerData();
    const context = createSkyRenderContext(
      { cameraDistance: 110, frame: "galactic" },
      { featuredObjectIds: [] },
    );
    const renderables = GALACTIC_STRUCTURE_LAYER.renderer?.buildRenderables(data.objects, context) ?? [];

    expect(data.objects).toHaveLength(2);
    expect(renderables.filter(isSkyStructureRenderable)).toHaveLength(1);
    expect(renderables.filter(isSkyMeshRenderable)).toHaveLength(2);
    const structure = renderables.find(isSkyStructureRenderable)?.structureMetadata;
    expect(structure?.shape).toBe("milky-way-catalogue");
    if (structure?.shape !== "milky-way-catalogue") throw new Error("Expected measured Milky Way renderer.");
    expect(structure.tracerCount).toBe(199);
    expect(structure.fittedSegmentCount).toBe(7);
    expect(structure.modelStatus).toBe("catalog-derived");
  });

  it("remains hidden in a close stellar view unless explicitly featured", () => {
    const data = createGalacticStructureLayerData();
    const quietContext = createSkyRenderContext({ cameraDistance: 72, frame: "galactic" });
    const featuredContext = createSkyRenderContext(
      { cameraDistance: 72, frame: "galactic" },
      { featuredObjectIds: ["galactic:milky-way-structure"] },
    );
    expect(GALACTIC_STRUCTURE_LAYER.renderer?.buildRenderables(data.objects, quietContext)).toEqual([]);
    expect(
      GALACTIC_STRUCTURE_LAYER.renderer
        ?.buildRenderables(data.objects, featuredContext)
        .some(isSkyStructureRenderable),
    ).toBe(true);
  });

  it("participates in Galactic family, distance, and provenance filters", () => {
    const [milkyWay] = createGalacticStructureLayerData().objects;
    expect(
      objectMatchesSkyMapFilters(milkyWay, {
        family: "galactic",
        distance: "milky-way",
        source: "galactic-model",
        landmarksOnly: true,
      }),
    ).toBe(true);
  });
});
