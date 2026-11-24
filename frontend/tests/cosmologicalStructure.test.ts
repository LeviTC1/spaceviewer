import { describe, expect, it } from "vitest";
import { SCALE_DOMAINS } from "../src/domain/astro/scaleDomains";
import { objectMatchesSkyMapFilters } from "../src/features/skymap/core/filters";
import { createSkyRenderContext, isSkyStructureRenderable } from "../src/features/skymap/core/renderers";
import {
  COSMOLOGICAL_STRUCTURE_LAYER,
  COSMOLOGICAL_STRUCTURE_MODEL,
  createCosmologicalStructureLayerData,
} from "../src/features/skymap/layers/cosmologicalStructureLayer";

describe("cosmological scientific-visualization domain", () => {
  it("is explicit about measured redshift-space coordinates and survey boundaries", () => {
    const [model] = createCosmologicalStructureLayerData().objects;
    expect(SCALE_DOMAINS.cosmological.availability).toBe("implemented");
    expect(model.scientific.coordinateConvention).toBe("observer-centred-redshift-space-comoving-cartesian");
    expect(model.scientific.modelStatus).toBe("catalog-derived");
    expect(model.scientific.tracerCount).toBe(22_648);
    expect(model.scientific.selectionBoundary).toMatch(/not a volume-complete census/i);
    expect(model.scientific.uncertaintyBoundary).toMatch(/does not publish per-object ZERR/i);
    expect(model.scientific.facts?.join(" ")).toMatch(/no procedural galaxies or nearest-neighbour filaments/i);
  });

  it("renders only in a distant overview or when directly featured", () => {
    const data = createCosmologicalStructureLayerData();
    const near = createSkyRenderContext({ cameraDistance: 110, frame: "scene-cartesian" });
    const featured = createSkyRenderContext(
      { cameraDistance: 110, frame: "scene-cartesian" },
      { featuredObjectIds: ["cosmological:observable-universe-model"] },
    );
    expect(COSMOLOGICAL_STRUCTURE_LAYER.renderer?.buildRenderables(data.objects, near)).toEqual([]);
    const structure = COSMOLOGICAL_STRUCTURE_LAYER.renderer
      ?.buildRenderables(data.objects, featured)
      .find(isSkyStructureRenderable);
    expect(structure?.structureMetadata.shape).toBe("desi-redshift-lightcone");
    expect(structure?.structureMetadata.modelStatus).toBe("catalog-derived");
    expect(COSMOLOGICAL_STRUCTURE_MODEL.radiusSceneUnits).toBeGreaterThan(0);
  });

  it("participates in cosmological, extragalactic, and survey-source filters", () => {
    const [model] = createCosmologicalStructureLayerData().objects;
    expect(
      objectMatchesSkyMapFilters(model, {
        family: "cosmological",
        distance: "extragalactic",
        source: "cosmology-model",
        landmarksOnly: true,
      }),
    ).toBe(true);
  });
});
