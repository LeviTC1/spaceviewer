import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { objectMatchesSkyMapFilters } from "../src/features/skymap/core/filters";
import { buildInitialLayerStates, createSkyLayerRegistry } from "../src/features/skymap/core/layers";
import { createSkyObjectRegistry } from "../src/features/skymap/core/objectRegistry";
import { createSkyRenderContext } from "../src/features/skymap/core/renderers";
import {
  createDeepSpaceLayerData,
  DEEP_SPACE_CLUSTERS_LAYER,
  DEEP_SPACE_GALAXIES_LAYER,
  DEEP_SPACE_NEBULAE_LAYER,
} from "../src/features/skymap/layers/deepSpaceLayer";
import {
  validateOpenNgcCatalogChunk,
  validateOpenNgcCatalogManifest,
} from "../src/lib/catalog/openNgcCatalog";

const readJson = (path: string) => JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8")) as unknown;
const manifest = validateOpenNgcCatalogManifest(readJson("public/catalogs/openngc/manifest.json"));
const chunks = manifest.chunks.map((definition) =>
  validateOpenNgcCatalogChunk(readJson(`public${definition.url}`), definition, manifest.catalog.id));
const records = chunks.flatMap((chunk) => chunk.objects);
const loadedChunkIds = chunks.map((chunk) => chunk.chunkId);
const layerData = createDeepSpaceLayerData(records, manifest, loadedChunkIds, "ready", null);
const layerDefinitions = [DEEP_SPACE_GALAXIES_LAYER, DEEP_SPACE_NEBULAE_LAYER, DEEP_SPACE_CLUSTERS_LAYER];

describe("OpenNGC deep-sky catalogue", () => {
  it("pins the selected v20260501 adaptation with deterministic J2000 sectors", () => {
    expect(manifest.catalog.version).toBe("v20260501");
    expect(manifest.catalog.releaseCommit).toBe("36cb178a0f69dba8bfc03a99c10512831edf1c6b");
    expect(manifest.licence.id).toBe("CC-BY-SA-4.0");
    expect(manifest.chunks).toHaveLength(12);
    expect(manifest.selection.sourceRecordCount).toBe(14_033);
    expect(manifest.selection.objectCount).toBe(3_004);
    expect(records).toHaveLength(3_004);
    expect(Object.values(manifest.selection.familyCounts).reduce((sum, count) => sum + count, 0)).toBe(3_004);
    expect(manifest.selection.boundary).toMatch(/not a complete or statistically uniform deep-sky census/i);
    expect(manifest.coordinates.placementBoundary).toMatch(/radial separation is intentionally undefined/i);
  });

  it("preserves landmark routes while replacing staged XYZ with measured angular direction", () => {
    const orion = layerData.flatMap((layer) => layer.objects).find((object) => object.id === "deep:nebula:orion-nebula");
    expect(orion).toMatchObject({
      name: "Orion Nebula",
      position: { frame: "equatorial-j2000", unit: "scene-unit" },
      scientific: {
        sourceRelease: "v20260501",
        coordinateConvention: "J2000 equatorial RA/Dec",
        manifestUrl: "/catalogs/openngc/manifest.json",
      },
    });
    if (!orion || orion.position.mode !== "cartesian") throw new Error("Orion is absent from the generated OpenNGC layer.");
    expect(Math.hypot(orion.position.x, orion.position.y, orion.position.z)).toBeCloseTo(108, 8);
    expect(orion.scientific?.distanceLy).toBeUndefined();
    expect(orion.scientific?.catalogIds).toContain("M 42");
    expect(orion.search?.aliases).toContain("M42");
  });

  it("excludes physical Local Group duplicates and does not classify unknown radius as a distance", () => {
    const objects = layerData.flatMap((layer) => layer.objects);
    const ids = new Set(objects.map((object) => object.id));
    expect(ids.has("deep:galaxy:andromeda-galaxy")).toBe(false);
    expect(ids.has("deep:galaxy:triangulum-galaxy")).toBe(false);
    const whirlpool = objects.find((object) => object.id === "deep:galaxy:whirlpool-galaxy");
    if (!whirlpool) throw new Error("Whirlpool Galaxy is absent from the generated OpenNGC layer.");
    expect(objectMatchesSkyMapFilters(whirlpool, {
      family: "galaxies",
      distance: "all",
      source: "messier-ngc",
      landmarksOnly: false,
    })).toBe(true);
    expect(objectMatchesSkyMapFilters(whirlpool, {
      family: "galaxies",
      distance: "extragalactic",
      source: "messier-ngc",
      landmarksOnly: false,
    })).toBe(false);
  });

  it("uses batched points for catalogue context and meshes only for landmarks", () => {
    const context = createSkyRenderContext({ cameraDistance: 120, frame: "equatorial-j2000" });
    const renderables = layerData.flatMap((layer, index) =>
      layerDefinitions[index].renderer?.buildRenderables(layer.objects, context) ?? []);
    const points = renderables.filter((renderable) => renderable.kind === "point");
    const meshes = renderables.filter((renderable) => renderable.kind === "mesh");
    expect(points.length).toBeGreaterThan(2_000);
    expect(meshes.length).toBeGreaterThan(25);
    expect(meshes.length).toBeLessThan(points.length / 4);
  });

  it("indexes catalogue identifiers and common aliases in the shared search registry", () => {
    const registry = createSkyLayerRegistry(layerDefinitions);
    const objects = createSkyObjectRegistry(registry, layerData, buildInitialLayerStates(registry.definitions));
    const [m42] = objects.search("M42");
    expect(m42.record.object.id).toBe("deep:nebula:orion-nebula");
    expect(m42.record.object.provenance[0]).toMatchObject({ source: "OpenNGC", confidence: "catalog" });
  });
});
