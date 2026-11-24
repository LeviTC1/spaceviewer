import { describe, expect, it } from "vitest";
import {
  IAU_NOMINAL_SOLAR_RADIUS_KM,
  SOLAR_AU_KM,
  calculateApparentDiskOverlapFraction,
  calculateObscurationAtSurfacePoint,
  calculateSolarEclipseGeometry,
} from "../src/domain/solar";
import { PLANETS } from "../src/features/solar/solarData";
import { MOONS } from "../src/features/solar/moonData";
import {
  getMoonEclipseOccluders,
  getPlanetEclipseOccluders,
} from "../src/features/solar/eclipse/solarEclipseModel";

describe("finite solar-disc eclipse geometry", () => {
  it("computes exact circular apparent-disc overlap limits", () => {
    expect(calculateApparentDiskOverlapFraction(1, 0.5, 2)).toBe(0);
    expect(calculateApparentDiskOverlapFraction(1, 0.5, 0)).toBeCloseTo(0.25, 12);
    expect(calculateApparentDiskOverlapFraction(1, 2, 0)).toBe(1);
    expect(calculateApparentDiskOverlapFraction(1, 1, 1)).toBeCloseTo(0.391002, 6);
  });

  it("produces an Earth-Moon penumbra from physical radii and distances", () => {
    const geometry = calculateSolarEclipseGeometry({
      targetRadiusKm: 6_371,
      targetToSunAu: { x: 1, y: 0, z: 0 },
      occluderRadiusKm: 1_737.4,
      targetToOccluderAu: { x: 384_400 / SOLAR_AU_KM, y: 0, z: 0 },
    });

    expect(geometry).not.toBeNull();
    expect(geometry?.intersectsPenumbra).toBe(true);
    expect(geometry?.sunAngularRadiusDeg).toBeCloseTo(0.266, 3);
    expect(geometry?.occluderAngularRadiusDeg).toBeCloseTo(0.259, 3);
    expect(geometry?.centerObscurationFraction).toBeGreaterThan(0.94);
    expect(geometry?.sunRadiusTargetRadii).toBeCloseTo(IAU_NOMINAL_SOLAR_RADIUS_KM / 6_371, 10);
    expect(
      geometry ? calculateObscurationAtSurfacePoint(geometry, { x: 1, y: 0, z: 0 }) : 0,
    ).toBeGreaterThan(0.96);
  });

  it("rejects a moon whose shadow cone misses the target", () => {
    const geometry = calculateSolarEclipseGeometry({
      targetRadiusKm: 6_371,
      targetToSunAu: { x: 1, y: 0, z: 0 },
      occluderRadiusKm: 1_737.4,
      targetToOccluderAu: { x: 0, y: 384_400 / SOLAR_AU_KM, z: 0 },
    });

    expect(geometry?.intersectsPenumbra).toBe(false);
    expect(geometry?.centerObscurationFraction).toBe(0);
  });

  it("finds controlled Galilean shadow candidates in the shared Jupiter model", () => {
    const jupiter = PLANETS.find((planet) => planet.id === "jupiter");
    if (!jupiter) throw new Error("Jupiter seed record is missing");
    const dateAddressable = getPlanetEclipseOccluders(jupiter, { daysSinceEpoch: 2 });
    expect(dateAddressable.map((candidate) => candidate.moonId)).toEqual(["io"]);
    expect(dateAddressable[0]?.orbitModel).toBe("astronomy-engine-l1.2-galilean");

    const central = getPlanetEclipseOccluders(jupiter, { daysSinceEpoch: 736.4576388888873 });
    expect(central.map((candidate) => candidate.moonId)).toContain("io");
    expect(central.find((candidate) => candidate.moonId === "io")?.centerObscurationFraction).toBe(1);
  });

  it("finds deterministic parent-planet and mutual-moon eclipses in the shared moon model", () => {
    const europa = MOONS.find((moon) => moon.id === "europa");
    if (!europa) throw new Error("Europa record is missing");

    const parentCandidate = getMoonEclipseOccluders(europa, { daysSinceEpoch: 15 }).find(
      (candidate) => candidate.occluderKind === "parent-planet",
    );
    expect(parentCandidate?.occluderId).toBe("jupiter");
    expect(parentCandidate?.centerObscurationFraction).toBe(1);
    expect(parentCandidate?.intersectsPenumbra).toBe(true);
    expect(parentCandidate?.orbitModel).toBe("astronomy-engine-l1.2-galilean");

    const mutualCandidate = getMoonEclipseOccluders(europa, { daysSinceEpoch: 495.0805555555536 }).find(
      (candidate) => candidate.occluderKind === "mutual-moon",
    );
    expect(mutualCandidate?.occluderId).toBe("io");
    expect(mutualCandidate?.intersectsPenumbra).toBe(true);
    expect(mutualCandidate?.centerObscurationFraction).toBeGreaterThanOrEqual(0);
    expect(mutualCandidate?.orbitModel).toBe(
      "astronomy-engine-l1.2-galilean + astronomy-engine-l1.2-galilean",
    );
  });
});
