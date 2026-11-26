import { describe, expect, it } from "vitest";
import { ang2pixNest, chooseTileOrder, faceCoordinates, pixelSizeDeg, tanToRaDec, tileSample, tileUrl } from "./hips";

const DEG = Math.PI / 180;

describe("HEALPix NESTED indexing", () => {
  it("puts directions on the right base faces", () => {
    // Faces 0–3 are northern (centred on RA 45°, 135°…), 4–7 equatorial (RA 0°, 90°…), 8–11 southern.
    expect(ang2pixNest(45 * DEG, 60 * DEG, 0)).toBe(0);
    expect(ang2pixNest(135 * DEG, 60 * DEG, 0)).toBe(1);
    expect(ang2pixNest(0.001, 0, 0)).toBe(4);
    expect(ang2pixNest(90 * DEG, 0, 0)).toBe(5);
    expect(ang2pixNest(180 * DEG, 0, 0)).toBe(6);
    expect(ang2pixNest(270 * DEG, 0, 0)).toBe(7);
    expect(ang2pixNest(45 * DEG, -60 * DEG, 0)).toBe(8);
    expect(ang2pixNest(315 * DEG, -60 * DEG, 0)).toBe(11);
  });

  it("nests: a pixel's parent is its index divided by four", () => {
    for (const [ra, dec] of [
      [10.68, 41.27],
      [83.82, -5.39],
      [266.4, -29.0],
      [201.37, -43.02],
    ]) {
      const fine = ang2pixNest(ra * DEG, dec * DEG, 9);
      const coarse = ang2pixNest(ra * DEG, dec * DEG, 6);
      expect(Math.floor(fine / 4 ** 3)).toBe(coarse);
    }
  });

  it("keeps face coordinates inside the face", () => {
    for (let i = 0; i < 200; i += 1) {
      const ra = ((i * 137.5) % 360) * DEG;
      const dec = Math.asin(((i * 0.618) % 2) - 1);
      const { face, ix, iy } = faceCoordinates(ra, dec, 64);
      expect(face).toBeGreaterThanOrEqual(0);
      expect(face).toBeLessThan(12);
      expect(ix).toBeGreaterThanOrEqual(-1e-9);
      expect(ix).toBeLessThanOrEqual(64 + 1e-9);
      expect(iy).toBeGreaterThanOrEqual(-1e-9);
      expect(iy).toBeLessThanOrEqual(64 + 1e-9);
    }
  });
});

describe("HiPS tiles", () => {
  it("locates a direction in the tile that ang2pix names, inside the 512 px image", () => {
    const ra = 10.68 * DEG;
    const dec = 41.27 * DEG;
    const sample = tileSample(ra, dec, 5);
    expect(sample.npix).toBe(ang2pixNest(ra, dec, 5));
    expect(sample.col).toBeGreaterThanOrEqual(0);
    expect(sample.col).toBeLessThan(512);
    expect(sample.row).toBeGreaterThanOrEqual(0);
    expect(sample.row).toBeLessThan(512);
  });

  it("builds HiPS tile paths", () => {
    expect(tileUrl("https://example.org/DSS", 5, 12_345)).toBe("https://example.org/DSS/Norder5/Dir10000/Npix12345.jpg");
    expect(tileUrl("https://example.org/DSS", 3, 42, "png")).toBe("https://example.org/DSS/Norder3/Dir0/Npix42.png");
  });

  it("chooses the coarsest order whose pixels are at least as fine as the cutout", () => {
    const fov = 3;
    const width = 1024;
    const order = chooseTileOrder(fov, width, 9);
    expect(pixelSizeDeg(order + 9)).toBeLessThanOrEqual(fov / width);
    expect(pixelSizeDeg(order + 8)).toBeGreaterThan(fov / width);
    expect(chooseTileOrder(0.001, 4096, 9)).toBe(9);
  });
});

describe("gnomonic cutout geometry", () => {
  it("maps the tangent point to the field centre", () => {
    const { ra, dec } = tanToRaDec(83.82 * DEG, -5.39 * DEG, 0, 0);
    expect(ra / DEG).toBeCloseTo(83.82, 9);
    expect(dec / DEG).toBeCloseTo(-5.39, 9);
  });

  it("puts +xi to the east and +eta to the north", () => {
    const east = tanToRaDec(10 * DEG, 20 * DEG, 0.01, 0);
    const north = tanToRaDec(10 * DEG, 20 * DEG, 0, 0.01);
    expect(east.ra).toBeGreaterThan(10 * DEG);
    expect(north.dec).toBeGreaterThan(20 * DEG);
    // An offset of 0.01 rad on the plane is ~0.573° on the sky.
    expect((north.dec - 20 * DEG) / DEG).toBeCloseTo(0.573, 2);
  });

  it("wraps right ascension into 0…2π", () => {
    const { ra } = tanToRaDec(0.001, 0, -0.01, 0);
    expect(ra).toBeGreaterThan(Math.PI);
    expect(ra).toBeLessThan(2 * Math.PI);
  });
});
