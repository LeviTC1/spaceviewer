import { describe, expect, it } from "vitest";
import { parseCameraBookmarks } from "../src/features/solar/cameraBookmarks";
import { SOLAR_SCALE_MODES } from "../src/features/solar/solarData";
import {
  getSolarPlanetFocusDistance,
  getSolarScaleModeDefinition,
  getSolarScaleSceneProfile,
  scaleDistanceAu,
  scaleMoonDistanceKm,
  TRUE_AU_SCENE_UNITS,
} from "../src/features/solar/solarScale";

describe("Solar scale models", () => {
  it("provides cinematic, educational, and true-AU modes", () => {
    expect(SOLAR_SCALE_MODES).toEqual(["showcase", "educational", "realistic"]);
    expect(getSolarScaleModeDefinition("showcase").mapping).toBe("logarithmic");
    expect(getSolarScaleModeDefinition("educational").mapping).toBe("square-root");
    expect(getSolarScaleModeDefinition("realistic").mapping).toBe("linear-au");
  });

  it("preserves heliocentric distance ratios in true-AU mode", () => {
    expect(scaleDistanceAu(0.5, "realistic")).toBe(0.5 * TRUE_AU_SCENE_UNITS);
    expect(scaleDistanceAu(1, "realistic")).toBe(TRUE_AU_SCENE_UNITS);
    expect(scaleDistanceAu(10, "realistic")).toBe(10 * TRUE_AU_SCENE_UNITS);
    expect(scaleDistanceAu(10, "realistic") / scaleDistanceAu(1, "realistic")).toBe(10);
  });

  it("keeps the compressed models distinct from the linear ruler", () => {
    expect(scaleDistanceAu(10, "showcase") / scaleDistanceAu(1, "showcase")).not.toBeCloseTo(10);
    expect(scaleDistanceAu(10, "educational") / scaleDistanceAu(1, "educational")).not.toBeCloseTo(10);
    expect(scaleMoonDistanceKm(149_597_870.7, "realistic")).toBeCloseTo(TRUE_AU_SCENE_UNITS, 8);
  });

  it("provides a camera envelope that contains the outer true-AU system", () => {
    const profile = getSolarScaleSceneProfile("realistic");
    const plutoMeanDistance = scaleDistanceAu(39.482, "realistic");
    expect(profile.maxCameraDistance).toBeGreaterThan(plutoMeanDistance * 2);
    expect(profile.fogFar).toBeGreaterThan(profile.maxCameraDistance);
    expect(Math.hypot(...profile.eclipticCamera)).toBeGreaterThan(plutoMeanDistance);
  });

  it("bases planet focus distance on visible body radius rather than orbit radius", () => {
    expect(getSolarPlanetFocusDistance(0.8)).toBe(8);
    expect(getSolarPlanetFocusDistance(3)).toBe(18);
  });

  it("round-trips true-AU scale mode through saved camera bookmarks", () => {
    const [bookmark] = parseCameraBookmarks([
      {
        id: "outer-system",
        name: "Outer system",
        position: [0, 2_050, 520],
        target: [0, 0, 0],
        scaleMode: "realistic",
      },
    ]);
    expect(bookmark.scaleMode).toBe("realistic");
  });
});
