import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONTROLLED_SATELLITE_EPHEMERIS_MANIFEST_URL,
  getControlledSatelliteState,
  getSatelliteEphemerisDescriptor,
  getSolarObjectState,
  sampleControlledSatelliteOrbit,
  SOLAR_AU_KM,
} from "../src/domain/solar";

interface VectorFixture {
  position: [number, number, number];
  velocity: [number, number, number];
}

const readJson = (path: string) => JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8"));
const receipt = readJson("ephemeris-source/astronomy-engine-2.1.19.receipt.json");
const manifest = readJson(`public${CONTROLLED_SATELLITE_EPHEMERIS_MANIFEST_URL}`);

// NASA/JPL Horizons geometric ECLIPJ2000 vectors at JD TDB 2460676.500861633,
// corresponding to Astronomy Engine's TT evaluation for 2025-01-01T00:00:00Z.
// Targets 301 and 501-504, centered on 500@399 or 500@599, AU-D, no corrections.
// https://ssd-api.jpl.nasa.gov/doc/horizons.html
const JPL_HORIZONS_2025_01_01: Record<string, VectorFixture> = {
  moon: {
    position: [1.016871336870397e-3, -2.331386260858957e-3, -2.049577208007784e-4],
    velocity: [5.385878122094259e-4, 2.579784159679361e-4, 2.215057602868333e-5],
  },
  io: {
    position: [-2.212420283129222e-3, -1.742974197474610e-3, -9.318655921426539e-5],
    velocity: [6.170848383116352e-3, -7.888869661697955e-3, -1.911984824630221e-4],
  },
  europa: {
    position: [4.445993854918515e-3, -2.515041611455105e-4, 8.921854937414383e-5],
    velocity: [4.969499159402417e-4, 7.972919816117972e-3, 2.700970463751734e-4],
  },
  ganymede: {
    position: [6.489121470172734e-3, -2.988558791988377e-3, -2.139196905446160e-5],
    velocity: [2.630533035628810e-3, 5.711822226868834e-3, 2.554745961533206e-4],
  },
  callisto: {
    position: [-9.109192322042317e-3, 8.758447474131939e-3, 1.515801760652350e-4],
    velocity: [-3.289257542073431e-3, -3.378674597239752e-3, -1.498757267912400e-4],
  },
};

const relativeError = (actual: readonly number[], expected: readonly number[]) =>
  Math.hypot(...actual.map((value, index) => value - expected[index])) / Math.hypot(...expected);

describe("controlled satellite ephemerides", () => {
  it("pins the package, release commit, licence and five-body runtime contract", () => {
    expect(receipt.package).toMatchObject({
      name: "astronomy-engine",
      version: "2.1.19",
      releaseCommit: "61dc07020aaa6885d2c7f688a4d82beaf6edb9ef",
      license: "MIT",
    });
    expect(receipt.verifiedInstalledFiles).toHaveLength(3);
    expect(manifest.controlledBodies).toEqual(["moon", "io", "europa", "ganymede", "callisto"]);
    expect(manifest.runtime).toMatchObject({
      activeStartUtc: "2025-01-01T00:00:00.000Z",
      activeEndUtc: "2050-12-31T23:59:59.999Z",
      frameTransform: "Astronomy Engine Rotation_EQJ_ECL applied to position and velocity",
    });
    expect(manifest.package.license).toBe("MIT");
  });

  it("stays inside the upstream JPL Horizons relative vector tolerance", () => {
    for (const [moonId, fixture] of Object.entries(JPL_HORIZONS_2025_01_01)) {
      const state = getControlledSatelliteState(moonId, "2025-01-01T00:00:00Z");
      if (!state) throw new Error(`Missing controlled state for ${moonId}`);
      const position = [state.relativePositionAu.x, state.relativePositionAu.y, state.relativePositionAu.z];
      const velocity = [
        state.relativeVelocityAuPerDay.x,
        state.relativeVelocityAuPerDay.y,
        state.relativeVelocityAuPerDay.z,
      ];
      expect(relativeError(position, fixture.position), `${moonId} position`).toBeLessThan(9e-4);
      expect(relativeError(velocity, fixture.velocity), `${moonId} velocity`).toBeLessThan(9e-4);
    }
  });

  it("routes the controlled subset through the shared Solar object provider", () => {
    const moon = getSolarObjectState("moon", "2026-09-02T12:00:00Z");
    const europa = getSolarObjectState("europa", "2026-09-02T12:00:00Z");
    const titan = getSolarObjectState("titan", "2026-09-02T12:00:00Z");

    expect(moon).toMatchObject({
      model: "astronomy-engine-improved-lunar",
      relativePositionAu: { unit: "au", frame: "heliocentric-ecliptic" },
      relativeVelocityAuPerDay: { unit: "au/day", frame: "heliocentric-ecliptic" },
    });
    expect(europa).toMatchObject({
      model: "astronomy-engine-l1.2-galilean",
      relativePositionAu: { unit: "au", frame: "heliocentric-ecliptic" },
      relativeVelocityAuPerDay: { unit: "au/day", frame: "heliocentric-ecliptic" },
    });
    expect(titan).toMatchObject({ model: "parent-relative-circular" });
    expect(titan?.relativeVelocityAuPerDay).toBeUndefined();
    expect(getSatelliteEphemerisDescriptor("titan").controlled).toBe(false);
  });

  it("draws a time-specific non-circular lunar guide and keeps the cache bounded by contract", () => {
    const positions = sampleControlledSatelliteOrbit("moon", "2026-09-02T00:00:00Z", 27.3217, 96);
    expect(positions).toHaveLength(96);
    const radiiKm = positions.map((position) => Math.hypot(position.x, position.y, position.z) * SOLAR_AU_KM);
    expect(Math.max(...radiiKm) - Math.min(...radiiKm)).toBeGreaterThan(20_000);
    expect(positions.every((position) => position.unit === "au" && position.frame === "heliocentric-ecliptic")).toBe(true);
  });

  it("refuses controlled claims outside the app's receipted validity window", () => {
    expect(getControlledSatelliteState("moon", "2024-12-31T23:59:59Z")).toBeNull();
    expect(getControlledSatelliteState("europa", "2051-01-01T00:00:00Z")).toBeNull();
    expect(getControlledSatelliteState("titan", "2026-01-01T00:00:00Z")).toBeNull();
  });
});
