import { describe, expect, it } from "vitest";
import exoplanetManifestSource from "../../../../public/catalogs/exoplanets/manifest.json";
import exoplanetRa00Source from "../../../../public/catalogs/exoplanets/ra-00.json";
import starManifestSource from "../../../../public/catalogs/nearby-stars/manifest.json";
import brightCoreMetadataSource from "../../../../public/catalogs/nearby-stars/bright-core-g6.meta.json";
import {
  validateExoplanetCatalogChunk,
  validateExoplanetCatalogManifest,
} from "../../../lib/catalog/exoplanetCatalog";
import {
  validateStarCatalogChunkMetadata,
  validateStarCatalogManifest,
} from "../../../lib/catalog/starCatalogBinary";
import { createExoplanetSystemObject } from "./exoplanetSystemsLayer";

describe("exact exoplanet-host Gaia DR3 cross-match", () => {
  it("records the source-receipted catalogue coverage and bounded residual", () => {
    const manifest = validateExoplanetCatalogManifest(exoplanetManifestSource);
    expect(manifest.crossmatch).toMatchObject({
      method: "nasa-exoplanet-archive-gaia-dr3-source-id-exact",
      hostsWithGaiaDr3Alias: 1_033,
      matchedRendererHostCount: 497,
      validationThresholdArcsec: 10,
    });
    expect(manifest.crossmatch.maximumAngularSeparationArcsec).toBeLessThan(10);
    expect(manifest.crossmatch.gaiaSourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.chunks.reduce((sum, chunk) => sum + chunk.crossmatchedSystemCount, 0)).toBe(497);
  });

  it("links a NASA exoplanet system to the guaranteed Gaia navigation object", () => {
    const manifest = validateExoplanetCatalogManifest(exoplanetManifestSource);
    const definition = manifest.chunks.find((chunk) => chunk.id === "ra-00");
    expect(definition).toBeDefined();
    const chunk = validateExoplanetCatalogChunk(exoplanetRa00Source, definition!, manifest.catalog.id);
    const system = chunk.systems.find((candidate) => candidate.hostName === "HD 142");
    expect(system?.gaiaDr3Crossmatch).toMatchObject({
      sourceId: "4976894960284258048",
      rendererObjectId: "star:gaia-dr3:4976894960284258048",
    });

    const object = createExoplanetSystemObject(system!, manifest);
    expect(object.relations?.[0]).toMatchObject({
      type: "part-of",
      targetId: "star:gaia-dr3:4976894960284258048",
    });
    expect(object.provenance.map((source) => source.source)).toEqual([
      "NASA Exoplanet Archive",
      "ESA Gaia Data Release 3",
    ]);

    const starManifest = validateStarCatalogManifest(starManifestSource);
    const brightCoreDefinition = starManifest.chunks.find((candidate) => candidate.id === "bright-core-g6");
    expect(brightCoreDefinition).toBeDefined();
    const metadata = validateStarCatalogChunkMetadata(
      brightCoreMetadataSource,
      brightCoreDefinition!,
      starManifest,
    );
    const star = metadata.navigationRecords.find((candidate) => candidate.sourceId === "4976894960284258048");
    expect(star).toMatchObject({
      name: "HD 142",
      exoplanetHostCrossmatch: {
        systemId: system?.id,
        hostName: "HD 142",
      },
    });
  });
});
