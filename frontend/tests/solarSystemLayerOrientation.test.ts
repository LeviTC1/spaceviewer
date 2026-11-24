import { describe, expect, it } from "vitest";
import {
  SOLAR_SYSTEM_LAYER,
  SOLAR_SYSTEM_LAYER_VERSION,
  createSolarSystemLayerData,
} from "../src/features/skymap/layers/solarSystemLayer";

describe("SkyMap Solar orientation bridge", () => {
  it("carries shared planet orientation and controlled satellite provenance", () => {
    const data = createSolarSystemLayerData();
    const mars = data.objects.find((object) => object.kind === "planet" && object.id === "solar:planet:mars");
    const moon = data.objects.find((object) => object.kind === "moon" && object.id === "solar:moon:moon");
    const titan = data.objects.find((object) => object.kind === "moon" && object.id === "solar:moon:titan");

    expect(SOLAR_SYSTEM_LAYER_VERSION).toBe("solar-bridge-shared-domain-v4");
    expect(mars?.kind).toBe("planet");
    if (!mars || mars.kind !== "planet") throw new Error("Mars bridge object was not generated");
    expect(mars.scientific?.rotationModel).toBe("IAU WGCCRE 2015");
    expect(mars.scientific?.primeMeridianDeg).toBeGreaterThanOrEqual(0);
    expect(mars.scientific?.primeMeridianDeg).toBeLessThan(360);
    expect(mars.scientific?.rotationSense).toBe("prograde");
    expect(mars.provenance.some((record) => record.source === "IAU WGCCRE 2015")).toBe(true);
    expect(mars.time?.note).toContain("Orientation:");
    expect(moon?.time?.model).toBe("astronomy-engine-improved-lunar");
    expect(moon?.provenance.some((record) => record.source === "Astronomy Engine 2.1.19")).toBe(true);
    expect(titan?.time?.model).toBe("parent-relative-circular");
    expect(titan?.provenance.some((record) => record.source === "Astronomy Engine 2.1.19")).toBe(false);
  });

  it("removes the analytical claim when SkyMap time leaves the controlled window", () => {
    const data = createSolarSystemLayerData();
    const resolved = SOLAR_SYSTEM_LAYER.timeResolver?.resolveObjects(data.objects, {
      currentTimeIso: "2100-01-01T00:00:00.000Z",
      sourceMode: "simulated",
      playback: "paused",
      direction: "forward",
      speedDaysPerSecond: 7,
    });
    const moon = resolved?.find((object) => object.kind === "moon" && object.id === "solar:moon:moon");

    expect(moon?.time?.model).toBe("parent-relative-circular");
    expect(moon?.scientific?.approximation).toContain("Approximate parent-relative circular");
    expect(moon?.provenance.some((record) => record.source === "Astronomy Engine 2.1.19")).toBe(false);
  });
});
