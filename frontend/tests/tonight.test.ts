import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { requestStreamedVsop87cEphemeris } from "../src/domain/solar/ephemeris/streamedVsop87c";
import { buildUniverseIndex } from "../src/features/explore/engine/universeModel";
import { nightTimes, skyPositionAt, type ObserverPlace } from "../src/features/explore/tonight";

const index = buildUniverseIndex([]);

// Use the same VSOP87 year block the site streams (the Keplerian fallback is only a stand-in).
beforeAll(async () => {
  const dir = resolve(process.cwd(), "public/ephemerides/vsop87c");
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const name = new URL(String(input), "http://localhost").pathname.split("/").pop()!;
    try {
      return new Response(await readFile(resolve(dir, name)));
    } catch {
      return new Response("missing", { status: 404 });
    }
  });
  await requestStreamedVsop87cEphemeris("2026-06-01", { includeOrbits: false });
});
afterAll(() => vi.unstubAllGlobals());
const london: ObserverPlace = { name: "London", latDeg: 51.51, lonDeg: -0.13, source: "manual" };
const sydney: ObserverPlace = { name: "Sydney", latDeg: -33.87, lonDeg: 151.22, source: "manual" };
const minutes = (ms: number | null) => (ms === null ? NaN : new Date(ms).getUTCHours() * 60 + new Date(ms).getUTCMinutes());

describe("tonight's sky", () => {
  it("finds London's sunset, darkness and sunrise in late November", () => {
    const night = nightTimes(index, london, Date.UTC(2026, 10, 26, 12));
    // Almanac (HM Nautical Almanac Office): sunset 15:57, sunrise 07:39 UTC; astronomical dusk ≈ 17:58.
    expect(Math.abs(minutes(night.sunset) - (15 * 60 + 57))).toBeLessThan(6);
    expect(Math.abs(minutes(night.sunrise) - (7 * 60 + 39))).toBeLessThan(6);
    expect(Math.abs(minutes(night.darkFrom) - (17 * 60 + 58))).toBeLessThan(8);
    expect(night.note).toBeNull();
  });

  it("finds Sydney's summer evening", () => {
    const night = nightTimes(index, sydney, Date.UTC(2026, 10, 26, 3));
    // 19:49 AEDT = 08:49 UTC.
    expect(Math.abs(minutes(night.sunset) - (8 * 60 + 49))).toBeLessThan(6);
  });

  it("knows the midnight sun", () => {
    const tromso: ObserverPlace = { name: "Tromsø", latDeg: 69.65, lonDeg: 18.96, source: "manual" };
    expect(nightTimes(index, tromso, Date.UTC(2026, 5, 21, 12)).note).toMatch(/does not set/);
  });

  it("puts the noon Sun due south at the right height from London", () => {
    const sun = index.byId.get("solar:sun")!;
    // Local apparent noon in London on the June solstice ≈ 12:02 UTC; altitude 90 − 51.51 + 23.44.
    const p = skyPositionAt(index, sun, london, Date.UTC(2026, 5, 21, 12, 2))!;
    expect(p.azDeg).toBeGreaterThan(178);
    expect(p.azDeg).toBeLessThan(182);
    expect(p.altDeg).toBeCloseTo(61.9, 0);
  });
});
