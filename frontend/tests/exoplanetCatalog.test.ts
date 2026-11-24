import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { objectMatchesSkyMapFilters } from "../src/features/skymap/core/filters";
import { buildInitialLayerStates, createSkyLayerRegistry } from "../src/features/skymap/core/layers";
import { createSkyObjectRegistry } from "../src/features/skymap/core/objectRegistry";
import { createSkyRenderContext, isSkyPointRenderable } from "../src/features/skymap/core/renderers";
import {
  createExoplanetSystemObject,
  createExoplanetSystemsLayerData,
  EXOPLANET_SYSTEMS_LAYER,
} from "../src/features/skymap/layers/exoplanetSystemsLayer";
import {
  validateExoplanetCatalogChunk,
  validateExoplanetCatalogManifest,
  type ExoplanetCatalogManifest,
} from "../src/lib/catalog/exoplanetCatalog";

const readJson = (path: string) => JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8")) as unknown;
const manifest = validateExoplanetCatalogManifest(readJson("public/catalogs/exoplanets/manifest.json"));
const chunks = manifest.chunks.map((definition) =>
  validateExoplanetCatalogChunk(readJson(`public${definition.url}`), definition, manifest.catalog.id));
const systems = chunks.flatMap((chunk) => chunk.systems);

describe("NASA Exoplanet Archive nearby-system catalogue", () => {
  it("pins a complete 100 pc snapshot and preserves deterministic chunk totals", () => {
    expect(manifest.catalog.table).toBe("pscomppars");
    expect(manifest.selection.maximumDistancePc).toBe(100);
    expect(manifest.selection.planetCount).toBe(1_568);
    expect(manifest.selection.systemCount).toBe(1_056);
    expect(manifest.chunks).toHaveLength(12);
    expect(systems).toHaveLength(1_056);
    expect(systems.reduce((sum, system) => sum + system.planets.length, 0)).toBe(1_568);
    expect(manifest.selection.boundary).toMatch(/not a completeness-limited occurrence-rate sample/i);
    expect(manifest.parameters.boundary).toMatch(/not guaranteed to form one self-consistent physical solution/i);
  });

  it("uses one physical host position while retaining every confirmed planet as searchable metadata", () => {
    const trappist = systems.find((system) => system.hostName === "TRAPPIST-1");
    expect(trappist?.planets.map((planet) => planet.name)).toEqual([
      "TRAPPIST-1 b", "TRAPPIST-1 c", "TRAPPIST-1 d", "TRAPPIST-1 e", "TRAPPIST-1 f", "TRAPPIST-1 g", "TRAPPIST-1 h",
    ]);
    if (!trappist) throw new Error("TRAPPIST-1 is absent from the pinned nearby selection.");
    expect(Math.hypot(trappist.positionLy.x, trappist.positionLy.y, trappist.positionLy.z)).toBeCloseTo(trappist.distanceLy, 8);
    const object = createExoplanetSystemObject(trappist, manifest as ExoplanetCatalogManifest);
    expect(object.search?.aliases).toContain("TRAPPIST-1 e");
    expect(object.scientific.mapPlacementNote).toMatch(/orbits are many orders of magnitude below this map scale/i);
  });

  it("renders one selectable host point per loaded system and participates in local catalogue filters", () => {
    const proxima = systems.find((system) => system.hostName === "Proxima Cen");
    if (!proxima) throw new Error("Proxima Cen is absent from the pinned nearby selection.");
    const object = createExoplanetSystemObject(proxima, manifest as ExoplanetCatalogManifest);
    const context = createSkyRenderContext({ cameraDistance: 90, frame: "heliocentric-icrs-cartesian" });
    const [renderable] = EXOPLANET_SYSTEMS_LAYER.renderer?.buildRenderables([object], context) ?? [];
    expect(isSkyPointRenderable(renderable)).toBe(true);
    expect(renderable?.objectId).toBe(object.id);
    expect(objectMatchesSkyMapFilters(object, {
      family: "exoplanets",
      distance: "local",
      source: "nasa-exoplanet-archive",
      landmarksOnly: true,
    })).toBe(true);
  });

  it("makes planet names resolve to their host system through the shared object registry", () => {
    const layerData = createExoplanetSystemsLayerData(
      systems,
      manifest as ExoplanetCatalogManifest,
      manifest.chunks.map((chunk) => chunk.id),
      "ready",
      null,
    );
    const layerRegistry = createSkyLayerRegistry([EXOPLANET_SYSTEMS_LAYER]);
    const registry = createSkyObjectRegistry(layerRegistry, [layerData], buildInitialLayerStates(layerRegistry.definitions));
    const [result] = registry.search("Proxima Cen b");
    expect(result.record.object.name).toBe("Proxima Cen system");
    expect(result.matchedField).toBe("alias");
  });
});
