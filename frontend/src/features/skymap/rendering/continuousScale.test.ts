import { describe, expect, it } from "vitest";
import {
  MAX_CONTINUOUS_CAMERA_DISTANCE,
  MIN_CONTINUOUS_CAMERA_DISTANCE,
  SOLAR_OVERVIEW_SUN_RADIUS,
  getContinuousScaleProgress,
  getContinuousScaleStage,
  getSolarOverviewRadius,
} from "./continuousScale";

describe("continuous universe scale", () => {
  it("moves through every scale without a dead-end", () => {
    expect(getContinuousScaleStage(4).id).toBe("planetary");
    expect(getContinuousScaleStage(24).id).toBe("solar");
    expect(getContinuousScaleStage(120).id).toBe("stellar");
    expect(getContinuousScaleStage(260).id).toBe("galactic");
    expect(getContinuousScaleStage(720).id).toBe("local-group");
    expect(getContinuousScaleStage(1_600).id).toBe("cosmic-web");
    expect(getContinuousScaleStage(3_400).id).toBe("observable");
  });

  it("keeps logarithmic progress monotonic and clamped", () => {
    const distances = [MIN_CONTINUOUS_CAMERA_DISTANCE, 14, 96, 210, 520, 1_100, 2_600, MAX_CONTINUOUS_CAMERA_DISTANCE];
    const progress = distances.map(getContinuousScaleProgress);
    expect(progress[0]).toBe(0);
    expect(progress.at(-1)).toBe(1);
    expect(progress.every((value, index) => index === 0 || value > progress[index - 1])).toBe(true);
    expect(getContinuousScaleProgress(0)).toBe(0);
    expect(getContinuousScaleProgress(9_999)).toBe(1);
  });

  it("preserves the Solar System size hierarchy at overview scale", () => {
    const mercury = getSolarOverviewRadius(2_439.7);
    const earth = getSolarOverviewRadius(6_371);
    const jupiter = getSolarOverviewRadius(69_911);
    expect(jupiter).toBeGreaterThan(earth);
    expect(earth).toBeGreaterThan(mercury);
    expect(SOLAR_OVERVIEW_SUN_RADIUS).toBeGreaterThan(jupiter * 5);
  });
});
