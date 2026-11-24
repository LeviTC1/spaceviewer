import { describe, expect, it } from "vitest";
import {
  SOLAR_RING_SHADOW_MODEL,
  SOLAR_RING_SYSTEMS,
  calculateRingPlaneIntercept,
  calculateRingTransmission,
} from "../src/domain/solar";
import { createRingShaderProfile } from "../src/features/solar/rings/ringShaderProfile";

describe("source-backed planetary ring systems", () => {
  it("records the NASA Saturn main-ring boundaries and source", () => {
    const saturn = SOLAR_RING_SYSTEMS.saturn;
    expect(saturn.innerRadiusKm).toBe(66_900);
    expect(saturn.outerRadiusKm).toBe(140_270);
    expect(saturn.bands.map((band) => band.id)).toEqual(["d", "c", "b", "a", "f"]);
    expect(saturn.source.sourceUrl).toContain("nssdc.gsfc.nasa.gov");
  });

  it("records the nine classical Uranus bands without promoting the faint outer rings", () => {
    const uranus = SOLAR_RING_SYSTEMS.uranus;
    expect(uranus.bands).toHaveLength(9);
    expect(uranus.bands.at(0)?.id).toBe("six");
    expect(uranus.bands.at(-1)?.id).toBe("epsilon");
    expect(uranus.outerRadiusKm).toBe(51_197);
    expect(uranus.source.sourceUrl).toContain("pds-rings.seti.org");
  });

  it("intersects a sunward surface ray with Saturn's equatorial ring plane", () => {
    const intercept = calculateRingPlaneIntercept({
      surfacePointBodyRadii: { x: 0.8, y: 0.5, z: Math.sqrt(0.11) },
      sunDirectionBody: { x: 0.5, y: -0.3, z: 0 },
      ringSystem: SOLAR_RING_SYSTEMS.saturn,
      planetRadiusKm: 58_232,
    });
    expect(intercept).not.toBeNull();
    expect(intercept?.insideSystem).toBe(true);
    expect(intercept?.ringCoordinate).toBeGreaterThan(0);
    expect(intercept?.ringCoordinate).toBeLessThan(1);

    const awayFromPlane = calculateRingPlaneIntercept({
      surfacePointBodyRadii: { x: 0, y: 1, z: 0 },
      sunDirectionBody: { x: 0, y: 1, z: 0 },
      ringSystem: SOLAR_RING_SYSTEMS.saturn,
      planetRadiusKm: 58_232,
    });
    expect(awayFromPlane).toBeNull();
  });

  it("converts optical depth to stronger attenuation at shallow solar elevation", () => {
    const overheadTransmission = calculateRingTransmission(0.65, 1);
    const shallowTransmission = calculateRingTransmission(0.65, 0.2);
    expect(overheadTransmission).toBeCloseTo(Math.exp(-0.65), 8);
    expect(shallowTransmission).toBeLessThan(overheadTransmission);
    expect(calculateRingTransmission(0, 0.1)).toBe(1);
  });

  it("emits bounded fixed-size shader profiles for both ring systems", () => {
    const saturn = createRingShaderProfile(SOLAR_RING_SYSTEMS.saturn, 58_232);
    const uranus = createRingShaderProfile(SOLAR_RING_SYSTEMS.uranus, 25_362);
    expect(saturn.bandCount).toBe(5);
    expect(uranus.bandCount).toBe(9);
    expect(saturn.bandCenters).toHaveLength(10);
    expect(uranus.bandHalfWidths).toHaveLength(10);
    expect(SOLAR_RING_SHADOW_MODEL.id).toBe("finite-sun-ring-transmission-v1");
  });
});
