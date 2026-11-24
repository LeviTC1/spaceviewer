import { describe, expect, it } from "vitest";
import {
  createAtmosphereOpticalDepthLut,
  getAtmosphereScatteringProfile,
  SOLAR_ATMOSPHERE_SCATTERING_MODEL,
} from "../src/features/solar/atmosphere/atmosphereScatteringModel";

const channelAt = (
  data: Uint8Array,
  width: number,
  x: number,
  y: number,
  channel: 0 | 1 | 2 | 3,
) => data[(y * width + x) * 4 + channel];

describe("planet atmosphere scattering profiles", () => {
  it("keeps the Earth reference coefficients and source receipt explicit", () => {
    const earth = getAtmosphereScatteringProfile("earth");
    expect(earth).not.toBeNull();
    expect(earth?.status).toBe("reference-parameterization");
    expect(earth?.rayleighScaleHeightKm).toBe(8);
    expect(earth?.mieScaleHeightKm).toBe(1.2);
    expect(earth?.rayleighScatteringPerKm).toEqual([0.005802, 0.013558, 0.0331]);
    expect(earth?.sources.some((source) => source.url.includes("demo.cc.html"))).toBe(true);
    expect(SOLAR_ATMOSPHERE_SCATTERING_MODEL.methodSourceUrl).toContain("10.1111");
  });

  it("labels Mars as density-scaled and leaves unresolved dust extinction at zero", () => {
    const mars = getAtmosphereScatteringProfile("mars");
    expect(mars?.status).toBe("density-scaled-provisional");
    expect(mars?.rayleighScaleHeightKm).toBe(11.1);
    expect(mars?.mieScatteringPerKm).toBe(0);
    expect(mars?.mieExtinctionPerKm).toBe(0);
    expect(mars?.accuracyNote).toMatch(/dust loading/i);
    expect(getAtmosphereScatteringProfile("jupiter")).toBeNull();
  });

  it("generates deterministic optical-depth tables with stronger grazing columns and blocked night rays", () => {
    const earth = getAtmosphereScatteringProfile("earth");
    if (!earth) throw new Error("Earth atmosphere profile missing");
    const first = createAtmosphereOpticalDepthLut({
      profile: earth,
      bottomRadiusKm: 6371,
      width: 32,
      height: 16,
    });
    const second = createAtmosphereOpticalDepthLut({
      profile: earth,
      bottomRadiusKm: 6371,
      width: 32,
      height: 16,
    });

    expect(first.data).toEqual(second.data);
    expect(first.data).toHaveLength(32 * 16 * 4);
    const dayRow = first.height - 1;
    const nightRow = 0;
    expect(channelAt(first.data, first.width, 0, dayRow, 0)).toBeGreaterThan(
      channelAt(first.data, first.width, first.width - 1, dayRow, 0),
    );
    expect(channelAt(first.data, first.width, 16, nightRow, 2)).toBeGreaterThan(
      channelAt(first.data, first.width, 16, dayRow, 2),
    );
  });

  it("keeps the provisional Mars molecular column optically thinner than Earth", () => {
    const earth = getAtmosphereScatteringProfile("earth");
    const mars = getAtmosphereScatteringProfile("mars");
    if (!earth || !mars) throw new Error("Atmosphere profiles missing");
    const earthLut = createAtmosphereOpticalDepthLut({
      profile: earth,
      bottomRadiusKm: 6371,
      width: 16,
      height: 8,
    });
    const marsLut = createAtmosphereOpticalDepthLut({
      profile: mars,
      bottomRadiusKm: 3390,
      width: 16,
      height: 8,
    });
    const x = earthLut.width - 1;
    const y = earthLut.height - 1;
    expect(channelAt(marsLut.data, marsLut.width, x, y, 0)).toBeLessThan(
      channelAt(earthLut.data, earthLut.width, x, y, 0),
    );
  });
});
