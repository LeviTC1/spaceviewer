import { describe, expect, it } from "vitest";
import { AU_PER_LIGHT_YEAR, compressAstronomicalPosition, compressAstronomicalRadius } from "./hierarchicalScale";

describe("hierarchical astronomical scale", () => {
  it("keeps the planetary system compact and reserves the stellar band for stars", () => {
    const earth = compressAstronomicalRadius(1 / AU_PER_LIGHT_YEAR);
    const neptune = compressAstronomicalRadius(30 / AU_PER_LIGHT_YEAR);
    const sirius = compressAstronomicalRadius(8.6);

    expect(earth).toBeCloseTo(1.5, 4);
    expect(neptune).toBeGreaterThan(6);
    expect(neptune).toBeLessThan(8);
    expect(sirius).toBeGreaterThan(50);
    expect(sirius / neptune).toBeGreaterThan(8);
  });

  it("preserves direction while changing only radial scale", () => {
    const mapped = compressAstronomicalPosition([8.6, -4.3, 2.15]);
    expect(mapped[0] / mapped[1]).toBeCloseTo(-2, 5);
    expect(mapped[0] / mapped[2]).toBeCloseTo(4, 5);
  });

  it("recentres the selected star at the floating origin", () => {
    expect(compressAstronomicalPosition([8.6, 2, -1], [8.6, 2, -1])).toEqual([0, 0, 0]);
  });
});
