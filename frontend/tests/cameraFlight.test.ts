import { describe, expect, it } from "vitest";
import {
  createCameraFlightState,
  shouldReduceCameraFlightMotion,
} from "../src/domain/astro/cameraFlight";

describe("camera flight contract", () => {
  it("keeps normal camera flights animated", () => {
    expect(
      shouldReduceCameraFlightMotion({ systemReducedMotion: false, appReducedMotion: false }),
    ).toBe(false);
  });

  it("snaps camera flights for either reduced-motion source", () => {
    expect(
      shouldReduceCameraFlightMotion({ systemReducedMotion: true, appReducedMotion: false }),
    ).toBe(true);
    expect(
      shouldReduceCameraFlightMotion({ systemReducedMotion: false, appReducedMotion: true }),
    ).toBe(true);
  });

  it("preserves the surface and accessible flight label", () => {
    expect(createCameraFlightState("skymap", "Flying to Proxima Centauri")).toEqual({
      surface: "skymap",
      label: "Flying to Proxima Centauri",
    });
  });
});
