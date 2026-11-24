import { describe, expect, it } from "vitest";
import {
  ADAPTIVE_QUALITY_MAXIMUM_FRAME_SECONDS,
  createAdaptiveQualityFrameSample,
  recordAdaptiveQualityFrame,
  type AdaptiveQualityDecision,
  type AdaptiveQualityFrameSample,
} from "../src/lib/rendering/adaptiveQuality";
import {
  ASTRO_QUALITY_PROFILES,
  parseAstroQualitySetting,
  resolveInitialAstroQualitySetting,
  serializeAstroQualitySetting,
  type AstroQualityProfile,
  type AstroQualityTier,
} from "../src/lib/rendering/qualityManager";
import { SKYMAP_LABEL_BUDGETS } from "../src/features/skymap/core/labelLayout";
import { getAsteroidModeBudget } from "../src/features/solar/asteroids/useAsteroidLOD";

const runFrames = (
  initial: AdaptiveQualityFrameSample,
  fps: number,
  seconds: number,
): { sample: AdaptiveQualityFrameSample; decision: AdaptiveQualityDecision | null } => {
  let sample = initial;
  let decision: AdaptiveQualityDecision | null = null;
  const frameCount = Math.ceil(fps * seconds);
  for (let index = 0; index < frameCount; index += 1) {
    const result = recordAdaptiveQualityFrame(sample, 1 / fps);
    sample = result.sample;
    decision = result.decision ?? decision;
  }
  return { sample, decision };
};

describe("adaptive astronomical quality", () => {
  it("keeps a healthy high-tier frame stream unchanged", () => {
    const result = runFrames(createAdaptiveQualityFrameSample("high"), 60, 8);
    expect(result.decision).toBeNull();
    expect(result.sample.triggered).toBe(false);
  });

  it("reduces one tier after a sustained slow frame window", () => {
    const result = runFrames(createAdaptiveQualityFrameSample("high"), 20, 6);
    expect(result.decision).toMatchObject({ fromTier: "high", toTier: "balanced" });
    expect(result.decision?.averageFps).toBeCloseTo(20, 5);
    expect(result.decision?.slowFrameRatio).toBe(1);
    expect(result.sample.triggered).toBe(true);
  });

  it("ignores suspended-tab sized frame gaps", () => {
    const sample = createAdaptiveQualityFrameSample("balanced");
    const result = recordAdaptiveQualityFrame(sample, ADAPTIVE_QUALITY_MAXIMUM_FRAME_SECONDS + 0.01);
    expect(result).toEqual({ sample, decision: null });
  });

  it("never tries to reduce below low", () => {
    const result = runFrames(createAdaptiveQualityFrameSample("low"), 10, 10);
    expect(result.decision).toBeNull();
    expect(result.sample.triggered).toBe(false);
  });
});

describe("authoritative renderer work budgets", () => {
  const tiers: AstroQualityTier[] = ["low", "balanced", "high", "ultra"];
  const monotonicBudgetKeys: Array<keyof AstroQualityProfile> = [
    "starBudget",
    "starMagnitudeLimitG",
    "labelBudget",
    "asteroidBudget",
    "backgroundStarBudget",
    "sunSegments",
    "planetSegments",
    "moonSegments",
    "atmosphereSegments",
    "atmosphereLutWidth",
    "atmosphereLutHeight",
    "planetOrbitSamples",
    "moonOrbitSamples",
    "orbitTrailSamples",
    "skyMeshSegments",
    "galaxyPointBudget",
    "desiLightconePointBlocks",
    "shadowMapSize",
  ];

  it("only increases renderer work as quality rises", () => {
    monotonicBudgetKeys.forEach((key) => {
      const values = tiers.map((tier) => ASTRO_QUALITY_PROFILES[tier][key] as number);
      expect(values, key).toEqual([...values].sort((a, b) => a - b));
    });
  });

  it("keeps every geometry and population budget finite, positive, and integral", () => {
    monotonicBudgetKeys
      .filter((key) => key !== "starMagnitudeLimitG")
      .forEach((key) => {
        tiers.forEach((tier) => {
          const value = ASTRO_QUALITY_PROFILES[tier][key] as number;
          expect(Number.isFinite(value), `${tier}.${key}`).toBe(true);
          expect(Number.isInteger(value), `${tier}.${key}`).toBe(true);
          expect(value, `${tier}.${key}`).toBeGreaterThan(0);
        });
      });
  });

  it("drives the SkyMap collision limit from the shared profile", () => {
    tiers.forEach((tier) => {
      expect(SKYMAP_LABEL_BUDGETS[tier]).toBe(ASTRO_QUALITY_PROFILES[tier].labelBudget);
    });
  });

  it("keeps analytic eclipse shadows through Balanced and disables them at Low/mobile", () => {
    expect(ASTRO_QUALITY_PROFILES.ultra.eclipseShadows).toBe(true);
    expect(ASTRO_QUALITY_PROFILES.high.eclipseShadows).toBe(true);
    expect(ASTRO_QUALITY_PROFILES.balanced.eclipseShadows).toBe(true);
    expect(ASTRO_QUALITY_PROFILES.low.eclipseShadows).toBe(false);
  });

  it("keeps two-way ring shadows through Balanced and disables their surface pass at Low/mobile", () => {
    expect(ASTRO_QUALITY_PROFILES.ultra.ringShadows).toBe(true);
    expect(ASTRO_QUALITY_PROFILES.high.ringShadows).toBe(true);
    expect(ASTRO_QUALITY_PROFILES.balanced.ringShadows).toBe(true);
    expect(ASTRO_QUALITY_PROFILES.low.ringShadows).toBe(false);
  });

  it("applies the selected tier immediately without overbuilding simplified asteroid fields", () => {
    expect(getAsteroidModeBudget("off", ASTRO_QUALITY_PROFILES.ultra.asteroidBudget)).toBe(0);
    expect(getAsteroidModeBudget("simplified", ASTRO_QUALITY_PROFILES.low.asteroidBudget)).toBe(700);
    expect(getAsteroidModeBudget("simplified", ASTRO_QUALITY_PROFILES.high.asteroidBudget)).toBe(1_000);
    expect(getAsteroidModeBudget("full", ASTRO_QUALITY_PROFILES.high.asteroidBudget)).toBe(3_500);
  });
});

describe("quality preference persistence", () => {
  it("defaults to automatic recommendation for a new browser", () => {
    expect(
      resolveInitialAstroQualitySetting({ storedSetting: null, legacyTier: null, recommendedTier: "balanced" }),
    ).toEqual({ mode: "auto", tier: "balanced" });
  });

  it("treats the legacy explicit tier as a manual override", () => {
    expect(
      resolveInitialAstroQualitySetting({ storedSetting: null, legacyTier: "ultra", recommendedTier: "low" }),
    ).toEqual({ mode: "manual", tier: "ultra" });
  });

  it("round-trips the versioned auto/manual setting and rejects invalid input", () => {
    const serialized = serializeAstroQualitySetting({ mode: "manual", tier: "high" });
    expect(parseAstroQualitySetting(serialized)).toEqual({ mode: "manual", tier: "high" });
    expect(parseAstroQualitySetting('{"mode":"turbo","tier":"high"}')).toBeNull();
    expect(parseAstroQualitySetting("not-json")).toBeNull();
  });
});
