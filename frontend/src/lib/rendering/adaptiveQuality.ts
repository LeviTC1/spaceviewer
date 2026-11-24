import { degradeAstroQualityTier, type AstroQualityTier } from "./qualityManager";

export type AdaptiveQualitySurface = "solar" | "skymap";

export interface AdaptiveQualityFrameSample {
  tier: AstroQualityTier;
  warmupRemainingSeconds: number;
  elapsedSeconds: number;
  frames: number;
  slowFrames: number;
  triggered: boolean;
}

export interface AdaptiveQualityDecision {
  fromTier: AstroQualityTier;
  toTier: AstroQualityTier;
  averageFps: number;
  averageFrameMs: number;
  slowFrameRatio: number;
  sampleSeconds: number;
}

export interface AdaptiveQualityReport extends AdaptiveQualityDecision {
  surface: AdaptiveQualitySurface;
}

export interface AdaptiveQualityFrameResult {
  sample: AdaptiveQualityFrameSample;
  decision: AdaptiveQualityDecision | null;
}

export const ADAPTIVE_QUALITY_WARMUP_SECONDS = 1.5;
export const ADAPTIVE_QUALITY_SAMPLE_SECONDS = 3;
export const ADAPTIVE_QUALITY_MINIMUM_FRAMES = 20;
export const ADAPTIVE_QUALITY_MAXIMUM_FRAME_SECONDS = 0.25;

const FRAME_BUDGET_MS: Record<AstroQualityTier, number> = {
  ultra: 20,
  high: 24,
  balanced: 32,
  low: Number.POSITIVE_INFINITY,
};

export const getAdaptiveQualityFrameBudgetMs = (tier: AstroQualityTier) => FRAME_BUDGET_MS[tier];

export const createAdaptiveQualityFrameSample = (tier: AstroQualityTier): AdaptiveQualityFrameSample => ({
  tier,
  warmupRemainingSeconds: ADAPTIVE_QUALITY_WARMUP_SECONDS,
  elapsedSeconds: 0,
  frames: 0,
  slowFrames: 0,
  triggered: false,
});

const resetMeasurementWindow = (sample: AdaptiveQualityFrameSample): AdaptiveQualityFrameSample => ({
  ...sample,
  elapsedSeconds: 0,
  frames: 0,
  slowFrames: 0,
});

export const recordAdaptiveQualityFrame = (
  sample: AdaptiveQualityFrameSample,
  deltaSeconds: number,
): AdaptiveQualityFrameResult => {
  if (
    sample.triggered ||
    sample.tier === "low" ||
    !Number.isFinite(deltaSeconds) ||
    deltaSeconds <= 0 ||
    deltaSeconds > ADAPTIVE_QUALITY_MAXIMUM_FRAME_SECONDS
  ) {
    return { sample, decision: null };
  }

  if (sample.warmupRemainingSeconds > 0) {
    return {
      sample: {
        ...sample,
        warmupRemainingSeconds: Math.max(0, sample.warmupRemainingSeconds - deltaSeconds),
      },
      decision: null,
    };
  }

  const frameBudgetMs = getAdaptiveQualityFrameBudgetMs(sample.tier);
  const elapsedSeconds = sample.elapsedSeconds + deltaSeconds;
  const frames = sample.frames + 1;
  const slowFrames = sample.slowFrames + (deltaSeconds * 1000 > frameBudgetMs * 1.15 ? 1 : 0);
  const measured = { ...sample, elapsedSeconds, frames, slowFrames };

  if (elapsedSeconds < ADAPTIVE_QUALITY_SAMPLE_SECONDS || frames < ADAPTIVE_QUALITY_MINIMUM_FRAMES) {
    return { sample: measured, decision: null };
  }

  const averageFrameMs = (elapsedSeconds * 1000) / frames;
  const slowFrameRatio = slowFrames / frames;
  const shouldDegrade = averageFrameMs > frameBudgetMs && slowFrameRatio >= 0.6;

  if (!shouldDegrade) {
    return { sample: resetMeasurementWindow(measured), decision: null };
  }

  const toTier = degradeAstroQualityTier(sample.tier);
  const decision: AdaptiveQualityDecision = {
    fromTier: sample.tier,
    toTier,
    averageFps: 1000 / averageFrameMs,
    averageFrameMs,
    slowFrameRatio,
    sampleSeconds: elapsedSeconds,
  };

  return {
    sample: { ...measured, triggered: true },
    decision: toTier === sample.tier ? null : decision,
  };
};
