import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decodeStreamedVsop87cOrbitAsset,
  decodeStreamedVsop87cPositionChunk,
  getStreamedSolarEphemerisSnapshot,
  getStreamedVsop87cPosition,
  requestStreamedVsop87cEphemeris,
  resetStreamedSolarEphemerisForTests,
  validateStreamedVsop87cManifest,
  type StreamedVsop87cManifest,
} from "../src/domain/solar/ephemeris/streamedVsop87c";
import { PLANETS } from "../src/features/solar/solarData";
import { getPlanetEclipseOccluders } from "../src/features/solar/eclipse/solarEclipseModel";

const require = createRequire(import.meta.url);
const vsop87c = require("vsop87/dist/vsop87c.js") as (
  julianDate: number,
) => Record<string, { x: number; y: number; z: number }>;
const fixtureDirectory = resolve(process.cwd(), "public/ephemerides/vsop87c");

const toArrayBuffer = (buffer: Buffer) =>
  buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;

const readManifestSource = () => readFile(resolve(fixtureDirectory, "manifest.json"), "utf8");
const readManifest = async () =>
  validateStreamedVsop87cManifest(JSON.parse(await readManifestSource()));
const readAsset = (url: string) => readFile(resolve(fixtureDirectory, url.replace("./", "")));

const readDecodedCoordinate = (
  manifest: StreamedVsop87cManifest,
  chunk: ReturnType<typeof decodeStreamedVsop87cPositionChunk>,
  planetId: "earth" | "jupiter",
  julianDate: number,
) => {
  const planetIndex = manifest.build.planetOrder.indexOf(planetId);
  const lowerJulianDate = Math.floor(julianDate);
  const upperJulianDate = Math.ceil(julianDate);
  const lowerSample = lowerJulianDate - chunk.definition.startJulianDate;
  const upperSample = upperJulianDate - chunk.definition.startJulianDate;
  const t = julianDate - lowerJulianDate;
  return [0, 1, 2].map((axis) => {
    const lower = chunk.positions[(lowerSample * 8 + planetIndex) * 3 + axis];
    const upper = chunk.positions[(upperSample * 8 + planetIndex) * 3 + axis];
    return lower + (upper - lower) * t;
  });
};

afterEach(() => {
  resetStreamedSolarEphemerisForTests();
  vi.unstubAllGlobals();
});

describe("streamed VSOP87C ephemeris", () => {
  it("validates the bounded source, sampling, and aggregate binary contract", async () => {
    const manifest = await readManifest();
    expect(manifest.build).toMatchObject({
      builder: "spaceviewer-vsop87c-ephemeris-builder-v1",
      scalarPrecision: "float64",
      chunkCount: 26,
      totalBinaryBytes: 1_871_808,
    });
    expect(manifest.validity).toEqual({
      minimumUtcDate: "2025-01-01",
      maximumUtcDate: "2050-12-31",
      runtimeClampRequired: true,
    });
    expect(manifest.source).toMatchObject({
      implementationVersion: "1.0.5",
      licenceId: "MIT",
      theoryUrl: "https://ftp.imcce.fr/pub/ephem/planets/vsop87/",
    });
    expect(manifest.chunks).toHaveLength(26);
    expect(manifest.planets).toHaveLength(8);
  });

  it("reproduces the pinned one-day interpolation for Earth and Jupiter", async () => {
    const manifest = await readManifest();
    const definition = manifest.chunks.find((chunk) => chunk.year === 2026)!;
    const binary = await readAsset(definition.url);
    const chunk = decodeStreamedVsop87cPositionChunk(toArrayBuffer(binary), definition);
    const julianDate = definition.startJulianDate + 108.375;

    for (const planetId of ["earth", "jupiter"] as const) {
      const decoded = readDecodedCoordinate(manifest, chunk, planetId, julianDate);
      const lower = vsop87c(Math.floor(julianDate))[planetId];
      const upper = vsop87c(Math.ceil(julianDate))[planetId];
      const t = julianDate - Math.floor(julianDate);
      const expected = ["x", "y", "z"].map(
        (axis) => lower[axis as keyof typeof lower] + (upper[axis as keyof typeof upper] - lower[axis as keyof typeof lower]) * t,
      );
      decoded.forEach((coordinate, axis) => expect(coordinate).toBeCloseTo(expected[axis], 13));
    }
  });

  it("decodes finite representative orbit guides and rejects corrupt headers", async () => {
    const manifest = await readManifest();
    const orbitBinary = await readAsset(manifest.orbitAsset.url);
    const orbit = decodeStreamedVsop87cOrbitAsset(toArrayBuffer(orbitBinary), manifest);
    expect(orbit.sampleCount).toBe(192);
    expect(orbit.positions).toHaveLength(8 * 192 * 3);
    expect(Array.from(orbit.positions).every(Number.isFinite)).toBe(true);

    const definition = manifest.chunks[0];
    const binary = await readAsset(definition.url);
    const corrupt = toArrayBuffer(binary);
    new Uint8Array(corrupt)[0] = 0;
    expect(() => decodeStreamedVsop87cPositionChunk(corrupt, definition)).toThrow(/format/i);
    expect(() => decodeStreamedVsop87cPositionChunk(new ArrayBuffer(128), definition)).toThrow(/length/i);
  });

  it("requests only the manifest and active year when orbit guides are not needed", async () => {
    const manifestSource = await readManifestSource();
    const manifest = validateStreamedVsop87cManifest(JSON.parse(manifestSource));
    const definition = manifest.chunks.find((chunk) => chunk.year === 2026)!;
    const binary = await readAsset(definition.url);
    const requests: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      requests.push(url.pathname);
      if (url.pathname.endsWith("manifest.json")) return new Response(manifestSource);
      if (url.pathname.endsWith(definition.url.replace("./", ""))) return new Response(binary);
      return new Response("missing", { status: 404 });
    });

    const requestedDate = "2026-04-19T09:00:00.000Z";
    await requestStreamedVsop87cEphemeris(requestedDate, { includeOrbits: false });
    const snapshot = getStreamedSolarEphemerisSnapshot();
    expect(snapshot).toMatchObject({ status: "ready", activeYear: 2026, positionsReady: true });
    expect(snapshot.loadedYears).toEqual([2026]);
    expect(requests).toEqual([
      "/ephemerides/vsop87c/manifest.json",
      "/ephemerides/vsop87c/positions-2026.svep",
    ]);
    expect(getStreamedVsop87cPosition("earth", requestedDate)?.positionAu.x).toBeTypeOf("number");
  });

  it("does not let an older year request overwrite the latest active year", async () => {
    const manifestSource = await readManifestSource();
    const manifest = validateStreamedVsop87cManifest(JSON.parse(manifestSource));
    const chunk2026 = manifest.chunks.find((chunk) => chunk.year === 2026)!;
    const chunk2027 = manifest.chunks.find((chunk) => chunk.year === 2027)!;
    const [binary2026, binary2027] = await Promise.all([readAsset(chunk2026.url), readAsset(chunk2027.url)]);
    let release2026: (() => void) | null = null;
    const waitFor2026 = new Promise<void>((resolve) => {
      release2026 = resolve;
    });
    const requests: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      requests.push(url.pathname);
      if (url.pathname.endsWith("manifest.json")) return new Response(manifestSource);
      if (url.pathname.endsWith("positions-2026.svep")) {
        await waitFor2026;
        return new Response(binary2026);
      }
      if (url.pathname.endsWith("positions-2027.svep")) return new Response(binary2027);
      return new Response("missing", { status: 404 });
    });

    const olderRequest = requestStreamedVsop87cEphemeris("2026-09-02", { includeOrbits: false });
    await vi.waitFor(() => expect(requests).toContain("/ephemerides/vsop87c/positions-2026.svep"));
    await requestStreamedVsop87cEphemeris("2027-09-02", { includeOrbits: false });
    release2026?.();
    await olderRequest;

    expect(getStreamedSolarEphemerisSnapshot()).toMatchObject({
      status: "ready",
      activeYear: 2027,
      positionsReady: true,
      loadedYears: [2026, 2027],
    });
  });

  it("preserves a controlled Jupiter eclipse fixture after the precision block activates", async () => {
    const manifestSource = await readManifestSource();
    const manifest = validateStreamedVsop87cManifest(JSON.parse(manifestSource));
    const definition = manifest.chunks.find((chunk) => chunk.year === 2025)!;
    const binary = await readAsset(definition.url);
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("manifest.json")) return new Response(manifestSource);
      if (url.pathname.endsWith("positions-2025.svep")) return new Response(binary);
      return new Response("missing", { status: 404 });
    });
    await requestStreamedVsop87cEphemeris("2025-01-03", { includeOrbits: false });
    const jupiter = PLANETS.find((planet) => planet.id === "jupiter")!;
    const candidates = getPlanetEclipseOccluders(jupiter, { daysSinceEpoch: 2 });
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0]?.orbitModel).toBe("astronomy-engine-l1.2-galilean");
  });
});
