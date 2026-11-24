import { describe, expect, it } from "vitest";
import { getSolarObjectState, getSolarSmallBodyOrbitScenePoints } from "./solarProvider";
import { getJulianDateForSolarTime } from "./ephemeris/streamedVsop87c";
import { SMALL_BODIES } from "../../features/solar/smallBodies/smallBodyData";
import { getCometTailPresentation } from "../../features/solar/smallBodies/cometPresentation";

const DOMAIN_EPOCH_JULIAN_DATE = getJulianDateForSolarTime({ daysSinceEpoch: 0 });

describe("source-controlled small-body ephemeris", () => {
  it("resolves every pinned object at its own JPL element epoch", () => {
    SMALL_BODIES.forEach((body) => {
      const daysSinceDomainEpoch = body.orbit.epochJulianDateTdb - DOMAIN_EPOCH_JULIAN_DATE;
      const state = getSolarObjectState(body.id, { daysSinceEpoch: daysSinceDomainEpoch });
      expect(state).toMatchObject({
        id: body.id,
        kind: "small-body",
        sourceId: `jpl-sbdb:${body.source.spkId}`,
        model: "jpl-sbdb-osculating-elements",
      });
      expect(state?.orbital?.julianDate).toBeCloseTo(body.orbit.epochJulianDateTdb, 8);
      expect(state?.orbital?.radiusAu).toBeGreaterThanOrEqual(body.orbit.perihelionAu - 1e-9);
      expect(state?.orbital?.radiusAu).toBeLessThanOrEqual(body.orbit.aphelionAu + 1e-9);
      expect(Number.isFinite(state?.positionAu.x ?? Number.NaN)).toBe(true);
      expect(Number.isFinite(state?.positionAu.y ?? Number.NaN)).toBe(true);
      expect(Number.isFinite(state?.positionAu.z ?? Number.NaN)).toBe(true);
    });
  });

  it("samples closed source-frame orbits that preserve published apsides", () => {
    SMALL_BODIES.forEach((body) => {
      const points = getSolarSmallBodyOrbitScenePoints(body.id, {
        samples: 512,
        scaleDistanceAu: (value) => value,
      });
      expect(points).toHaveLength(512);
      const radii = points.map((point) => Math.hypot(point.x, point.y, point.z));
      expect(Math.min(...radii)).toBeCloseTo(body.orbit.perihelionAu, 8);
      expect(Math.max(...radii)).toBeCloseTo(body.orbit.aphelionAu, 8);
    });
  });

  it("uses a bounded, distance-only presentation cue for comet tails", () => {
    const near = getCometTailPresentation(0.8);
    const mid = getCometTailPresentation(3);
    const far = getCometTailPresentation(8);
    expect(near.active).toBe(true);
    expect(near.activity).toBeGreaterThan(mid.activity);
    expect(mid.activity).toBeGreaterThan(far.activity);
    expect(far).toMatchObject({ active: false, activity: 0 });
  });
});

