import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeGalaxyChunk } from "../src/features/explore/galaxyStars";

const root = resolve(__dirname, "../public/catalogs/galaxy-stars");
const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));

describe("Gaia galaxy star layer", () => {
  it("records its provenance and query", () => {
    expect(manifest.format).toBe("spaceviewer-gaia-points-v1");
    expect(manifest.catalog.provenance.credit).toBe("ESA/Gaia/DPAC");
    expect(manifest.query.text).toContain("parallax_over_error >= 5");
    expect(manifest.starCount).toBeGreaterThan(700_000);
    expect(manifest.chunks.reduce((sum: number, chunk: { count: number }) => sum + chunk.count, 0)).toBe(manifest.starCount);
  });

  it("decodes the brightest chunk into finite, sensible stars", () => {
    const first = manifest.chunks[0];
    const bytes = readFileSync(resolve(root, first.url.split("/").pop()));
    const chunk = decodeGalaxyChunk(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), new Float32Array(256 * 3).fill(1));
    expect(chunk.count).toBe(first.count);
    let maxLy = 0;
    for (let i = 0; i < chunk.count; i += 1) {
      const d = Math.hypot(chunk.positions[i * 3], chunk.positions[i * 3 + 1], chunk.positions[i * 3 + 2]);
      expect(Number.isFinite(d)).toBe(true);
      maxLy = Math.max(maxLy, d);
      expect(chunk.absMag[i]).toBeGreaterThan(-12);
      expect(chunk.absMag[i]).toBeLessThan(17);
    }
    // parallax/error >= 5 keeps distances within a few kiloparsecs.
    expect(maxLy).toBeLessThan(40_000);
    expect(maxLy).toBeGreaterThan(1_000);
  });
});
