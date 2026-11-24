import { describe, expect, it } from "vitest";
import {
  ALL_SOLAR_PANEL_VISIBILITY,
  CLEAN_SOLAR_PANEL_VISIBILITY,
  DEFAULT_DESKTOP_PANEL_VISIBILITY,
  DEFAULT_MOBILE_PANEL_VISIBILITY,
  getActiveSolarPanelCount,
  getSolarPanelDockStateLabel,
  normalizeSolarPanelVisibility,
} from "./solarPanelState";

describe("Solar panel state", () => {
  it("keeps the desktop default immersive with only the compact tools visible", () => {
    expect(DEFAULT_DESKTOP_PANEL_VISIBILITY).toMatchObject({
      features: true,
      events: false,
      mission: false,
      scale: false,
      timeline: false,
      performance: false,
    });
    expect(getActiveSolarPanelCount(DEFAULT_DESKTOP_PANEL_VISIBILITY)).toBe(1);
    expect(getSolarPanelDockStateLabel(DEFAULT_DESKTOP_PANEL_VISIBILITY, false)).toBe("Default");
  });

  it("keeps the mobile default as a clean canvas", () => {
    expect(DEFAULT_MOBILE_PANEL_VISIBILITY).toMatchObject({
      features: false,
      events: false,
      mission: false,
      scale: false,
      timeline: false,
      performance: false,
    });
    expect(getActiveSolarPanelCount(DEFAULT_MOBILE_PANEL_VISIBILITY)).toBe(0);
    expect(getSolarPanelDockStateLabel(DEFAULT_MOBILE_PANEL_VISIBILITY, true)).toBe("Clean map");
  });

  it("normalizes saved desktop state while forcing heavy mobile panels closed", () => {
    const saved = {
      features: true,
      events: true,
      mission: true,
      scale: true,
      timeline: false,
      performance: true,
    };

    expect(normalizeSolarPanelVisibility(saved, false)).toEqual(saved);
    expect(normalizeSolarPanelVisibility(saved, true)).toEqual({
      features: false,
      events: false,
      mission: true,
      scale: false,
      timeline: false,
      performance: false,
    });
  });

  it("labels clean, all, and custom dock states", () => {
    expect(getSolarPanelDockStateLabel(CLEAN_SOLAR_PANEL_VISIBILITY, false)).toBe("Clean map");
    expect(getSolarPanelDockStateLabel(ALL_SOLAR_PANEL_VISIBILITY, false)).toBe("All visible");
    expect(
      getSolarPanelDockStateLabel(
        {
          ...DEFAULT_DESKTOP_PANEL_VISIBILITY,
          mission: true,
        },
        false,
      ),
    ).toBe("Custom");
  });
});
