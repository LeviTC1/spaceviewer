import { describe, expect, it } from "vitest";
import { shouldRequestPlanetSurfaceTexture } from "../src/features/solar/textures/planetTextureStreaming";

describe("planet texture streaming policy", () => {
  it("keeps unselected far and mid-distance bodies on the colour fallback", () => {
    expect(shouldRequestPlanetSurfaceTexture({ selected: false, hovered: false, lodLevel: "far" })).toBe(false);
    expect(shouldRequestPlanetSurfaceTexture({ selected: false, hovered: false, lodLevel: "mid" })).toBe(false);
  });

  it("promotes selected and hovered bodies regardless of distance", () => {
    expect(shouldRequestPlanetSurfaceTexture({ selected: true, hovered: false, lodLevel: "far" })).toBe(true);
    expect(shouldRequestPlanetSurfaceTexture({ selected: false, hovered: true, lodLevel: "far" })).toBe(true);
  });

  it("promotes a genuinely near body without requiring interaction", () => {
    expect(shouldRequestPlanetSurfaceTexture({ selected: false, hovered: false, lodLevel: "near" })).toBe(true);
  });
});
