import { describe, expect, it } from "vitest";
import {
  getSolarLaunchTargetFromSnapshot,
  getSolarTargetPath,
  readSolarTargetFromSearch,
} from "./solarRoutes";

describe("Solar small-body routes", () => {
  it("round-trips a source-controlled small body with date and scale context", () => {
    const target = {
      kind: "small-body" as const,
      smallBodyId: "hale-bopp" as const,
      navigationMode: "planetary" as const,
      scaleMode: "realistic" as const,
      dateKey: "2031-06-12",
    };
    const path = getSolarTargetPath(target);
    expect(path).toContain("object=small-body%3Ahale-bopp");
    expect(readSolarTargetFromSearch(path.split("?")[1])).toEqual(target);
  });

  it("rejects unknown small-body slugs", () => {
    expect(readSolarTargetFromSearch("?object=small-body%3Aplanet-nine")).toBeNull();
  });

  it("gives an explicit small-body selection priority over non-object flags", () => {
    expect(
      getSolarLaunchTargetFromSnapshot({
        selectedPlanetId: null,
        selectedMoonId: null,
        selectedSmallBodyId: "ceres",
        sunSelected: true,
        asteroidBeltSelected: true,
        navigationMode: "ecliptic",
        scaleMode: "educational",
        dateKey: "2026-09-02",
      }),
    ).toMatchObject({ kind: "small-body", smallBodyId: "ceres" });
  });
});

