import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeGalaxyChunk } from "../src/features/explore/galaxyStars";
import { brightStarEntities, figureFor, type SkyCulture } from "../src/features/explore/skyCulture";
import { buildUniverseIndex } from "../src/features/explore/engine/universeModel";
import seed from "../catalog-source/nearby-stars-seed.json";

const root = resolve(__dirname, "../public/catalogs/sky");
const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));
const figures = JSON.parse(readFileSync(resolve(root, "constellations.json"), "utf8"));
const culture: SkyCulture = { ...figures, starsByHip: new Map(figures.stars.map((star: { hip: number }) => [star.hip, star])) };

const DEG = Math.PI / 180;
const angleDeg = (raA: number, decA: number, raB: number, decB: number) => {
  const a = [Math.cos(decA * DEG) * Math.cos(raA * DEG), Math.cos(decA * DEG) * Math.sin(raA * DEG), Math.sin(decA * DEG)];
  const b = [Math.cos(decB * DEG) * Math.cos(raB * DEG), Math.cos(decB * DEG) * Math.sin(raB * DEG), Math.sin(decB * DEG)];
  return Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])) / DEG;
};

describe("bright stars and constellation figures", () => {
  it("credits its sources", () => {
    expect(manifest.catalog.provenance.bibcode).toBe("2012AstL...38..331A");
    expect(figures.sources.figures.licence).toContain("BSD-3-Clause");
    expect(figures.sources.names.title).toContain("IAU");
  });

  it("decodes the stars Gaia cannot measure, including the brightest", () => {
    const bytes = readFileSync(resolve(root, "bright-stars.svgp"));
    const chunk = decodeGalaxyChunk(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), new Float32Array(256 * 3).fill(1));
    expect(chunk.count).toBe(manifest.starCount);
    expect(chunk.count).toBeGreaterThan(500);
    // Sorted brightest first: Sirius (−1.46 V, 8.6 ly) leads.
    const d = Math.hypot(chunk.positions[0], chunk.positions[1], chunk.positions[2]);
    expect(d).toBeGreaterThan(8);
    expect(d).toBeLessThan(9.2);
  });

  it("joins every figure line to a catalogued star, all 88 constellations", () => {
    expect(figures.constellations).toHaveLength(88);
    for (const figure of figures.constellations) {
      expect(figure.lines.length).toBeGreaterThan(0);
      for (const line of figure.lines) for (const hip of line) expect(culture.starsByHip.has(hip)).toBe(true);
    }
  });

  it("places each figure star in the direction it is catalogued", () => {
    for (const star of figures.stars.slice(0, 300)) {
      const [x, y, z] = star.xyz;
      const d = Math.hypot(x, y, z);
      const ra = ((Math.atan2(y, x) / DEG) + 360) % 360;
      const dec = Math.asin(z / d) / DEG;
      // Gaia positions are J2016 and Hipparcos J2000: allow for proper motion (Arcturus moves ~2″/yr).
      expect(angleDeg(ra, dec, star.raDeg, star.decDeg)).toBeLessThan(0.02);
      expect(Math.abs(d - star.distanceLy) / star.distanceLy).toBeLessThan(0.01);
    }
  });

  it("knows Orion's stars span hundreds of light-years", () => {
    const betelgeuse = figures.stars.find((star: { name: string }) => star.name === "Betelgeuse");
    const index = buildUniverseIndex([], (entities) => brightStarEntities(culture, entities));
    const entity = index.byId.get(`hip:${betelgeuse.hip}`);
    expect(entity?.name).toBe("Betelgeuse");
    const info = entity ? figureFor(culture, entity) : null;
    expect(info?.figure.name).toBe("Orion");
    expect(info!.farthestLy / info!.nearestLy).toBeGreaterThan(10);
  });
});

describe("curated nearby stars", () => {
  it("sit where SIMBAD puts them", () => {
    const expected: Record<string, [number, number]> = {
      "Sirius A": [101.287, -16.716],
      Vega: [279.235, 38.784],
      "Proxima Centauri": [217.429, -62.679],
      "Barnard's Star": [269.452, 4.693],
    };
    for (const [name, [ra, dec]] of Object.entries(expected)) {
      const record = seed.records.find((item) => item.name === name)!;
      const d = Math.hypot(record.x, record.y, record.z);
      const rRa = ((Math.atan2(record.y, record.x) / DEG) + 360) % 360;
      const rDec = Math.asin(record.z / d) / DEG;
      expect(angleDeg(rRa, rDec, ra, dec)).toBeLessThan(0.01);
      expect(Math.abs(d - record.distanceLy)).toBeLessThan(0.01);
    }
  });
});
