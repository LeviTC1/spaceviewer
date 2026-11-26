import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { ORBITAL_ELEMENTS } from "../src/features/solar/orbitalElements";
import { solveKeplerianElementsAtSolarTime } from "../src/domain/solar/solarEphemeris";

const require = createRequire(import.meta.url);
const vsop87c = require("vsop87/dist/vsop87a.js") as (jd: number) => Record<string, { x: number; y: number; z: number }>;

// The Keplerian fallback is only shown until the VSOP87 block arrives, but it should still be close.
describe("planet fallback orbits", () => {
  for (const year of [2000, 2013, 2026, 2040]) {
    it(`stay within 1.5° of VSOP87 heliocentric longitude in ${year}`, () => {
      const ms = Date.UTC(year, 5, 1);
      const jd = ms / 86_400_000 + 2_440_587.5;
      const truth = vsop87c(jd);
      for (const planet of ["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune"] as const) {
        const p = solveKeplerianElementsAtSolarTime(ORBITAL_ELEMENTS[planet], new Date(ms)).positionAu;
        const t = truth[planet];
        const diff = Math.abs(((Math.atan2(p.y, p.x) - Math.atan2(t.y, t.x)) * 180) / Math.PI);
        expect(Math.min(diff, 360 - diff), planet).toBeLessThan(1.5);
      }
    });
  }
});
