import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PLANET_MATERIAL_PRESETS, PLANET_MATERIAL_MODEL } from "../src/features/solar/textures/planetMaterialPresets";
import { getPlanetTextureRoles, SOLAR_TEXTURE_PROVENANCE } from "../src/features/solar/textures/textureProvenance";

const manifestPath = resolve(process.cwd(), "public/solar-textures/manifest.json");

describe("solar texture integrity manifest", () => {
  it("records a verified source, licence, hash, and transformation receipt for every local texture", async () => {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    expect(manifest.schema).toBe("spaceviewer-solar-texture-manifest-v2");
    expect(manifest.assetCount).toBe(34);
    expect(manifest.assets).toHaveLength(34);
    expect(manifest.provenance.sourceStatus).toBe("verified");
    expect(manifest.provenance.licenceStatus).toBe("verified");
    expect(manifest.provenance.sourceCount).toBe(4);
    expect(manifest.provenance.attributionHref).toBe("/solar-textures/ATTRIBUTION.txt");
    expect(manifest.unreferencedAssets).toEqual([
      "/solar-textures/high/earth_atmos_2048.jpg",
      "/solar-textures/perf/earth_atmos_2048.jpg",
    ]);
    expect(manifest.assets.every((asset: { sha256: string }) => /^[a-f0-9]{64}$/.test(asset.sha256))).toBe(true);
    expect(
      manifest.assets.every(
        (asset: { sourceStatus: string; licenceStatus: string; transform?: { id?: string }; attribution?: string }) =>
          asset.sourceStatus === "verified" &&
          ["verified", "not-applicable"].includes(asset.licenceStatus) &&
          Boolean(asset.transform?.id) &&
          Boolean(asset.attribution),
      ),
    ).toBe(true);
    const pluto = manifest.assets.find(
      (asset: { path: string }) => asset.path === "/solar-textures/high/2k_pluto.jpg",
    );
    expect(pluto.sourceId).toBe("nasa-new-horizons-pluto");
    expect(pluto.transform.id).toBe("imagemagick-lanczos-pluto-v1");
  });

  it("keeps the runtime disclosure aligned with the generated inventory", () => {
    expect(SOLAR_TEXTURE_PROVENANCE.version).toBe("solar-textures-v2");
    expect(SOLAR_TEXTURE_PROVENANCE.sourceStatus).toBe("verified");
    expect(getPlanetTextureRoles("earth")).toEqual([
      "Surface colour",
      "Cloud colour/alpha",
      "Night emission",
      "Surface specular mask",
    ]);
    expect(getPlanetTextureRoles("saturn")).toContain("Ring colour/alpha");
  });
});

describe("planet material approximations", () => {
  it("does not render substantial atmosphere shells on airless seed bodies", () => {
    expect(PLANET_MATERIAL_PRESETS.mercury.atmosphere).toBeUndefined();
    expect(PLANET_MATERIAL_PRESETS.pluto.atmosphere).toBeUndefined();
    expect(PLANET_MATERIAL_PRESETS.earth.atmosphere?.opacity).toBeGreaterThan(
      PLANET_MATERIAL_PRESETS.mars.atmosphere?.opacity ?? 1,
    );
  });

  it("labels renderer controls as visual approximations", () => {
    expect(PLANET_MATERIAL_MODEL.status).toBe("visual-approximation");
    expect(PLANET_MATERIAL_MODEL.ringLighting).toMatch(/analytic planet shadow/i);
  });
});
