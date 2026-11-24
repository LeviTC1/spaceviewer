export type AstroQualityTier = "ultra" | "high" | "balanced" | "low";
export type AstroQualityMode = "auto" | "manual";
export type AstroQualitySelection = AstroQualityTier | "auto";

export interface AstroQualitySetting {
  mode: AstroQualityMode;
  tier: AstroQualityTier;
}

export const ASTRO_QUALITY_LEGACY_STORAGE_KEY = "spaceviewer.astro.quality.v1";
export const ASTRO_QUALITY_STORAGE_KEY = "spaceviewer.astro.quality.v2";

export interface AstroQualityProfile {
  id: AstroQualityTier;
  label: string;
  dpr: [number, number];
  antialias: boolean;
  shadows: boolean;
  textureQuality: "high" | "performance";
  starBudget: number;
  starMagnitudeLimitG: number;
  labelBudget: number;
  asteroidBudget: number;
  backgroundStarBudget: number;
  sunSegments: number;
  planetSegments: number;
  moonSegments: number;
  atmosphereSegments: number;
  atmosphereLutWidth: number;
  atmosphereLutHeight: number;
  planetOrbitSamples: number;
  moonOrbitSamples: number;
  orbitTrailSamples: number;
  skyMeshSegments: number;
  galaxyPointBudget: number;
  desiLightconePointBlocks: number;
  shadowMapSize: number;
  eclipseShadows: boolean;
  ringShadows: boolean;
  performanceMode: boolean;
}

export const ASTRO_QUALITY_PROFILES: Record<AstroQualityTier, AstroQualityProfile> = {
  ultra: {
    id: "ultra",
    label: "Ultra",
    dpr: [1, 2],
    antialias: true,
    shadows: true,
    textureQuality: "high",
    starBudget: 120_000,
    starMagnitudeLimitG: 9,
    labelBudget: 20,
    asteroidBudget: 5_000,
    backgroundStarBudget: 1_600,
    sunSegments: 64,
    planetSegments: 64,
    moonSegments: 40,
    atmosphereSegments: 48,
    atmosphereLutWidth: 128,
    atmosphereLutHeight: 64,
    planetOrbitSamples: 192,
    moonOrbitSamples: 128,
    orbitTrailSamples: 64,
    skyMeshSegments: 48,
    galaxyPointBudget: 5_200,
    desiLightconePointBlocks: 64,
    shadowMapSize: 2_048,
    eclipseShadows: true,
    ringShadows: true,
    performanceMode: false,
  },
  high: {
    id: "high",
    label: "High",
    dpr: [1, 1.75],
    antialias: true,
    shadows: true,
    textureQuality: "high",
    starBudget: 70_000,
    starMagnitudeLimitG: 9,
    labelBudget: 16,
    asteroidBudget: 3_500,
    backgroundStarBudget: 1_200,
    sunSegments: 56,
    planetSegments: 48,
    moonSegments: 32,
    atmosphereSegments: 40,
    atmosphereLutWidth: 96,
    atmosphereLutHeight: 48,
    planetOrbitSamples: 144,
    moonOrbitSamples: 96,
    orbitTrailSamples: 48,
    skyMeshSegments: 36,
    galaxyPointBudget: 3_800,
    desiLightconePointBlocks: 48,
    shadowMapSize: 1_024,
    eclipseShadows: true,
    ringShadows: true,
    performanceMode: false,
  },
  balanced: {
    id: "balanced",
    label: "Balanced",
    dpr: [1, 1.35],
    antialias: true,
    shadows: false,
    textureQuality: "performance",
    starBudget: 28_000,
    starMagnitudeLimitG: 8.7,
    labelBudget: 12,
    asteroidBudget: 1_600,
    backgroundStarBudget: 800,
    sunSegments: 40,
    planetSegments: 36,
    moonSegments: 24,
    atmosphereSegments: 28,
    atmosphereLutWidth: 64,
    atmosphereLutHeight: 32,
    planetOrbitSamples: 96,
    moonOrbitSamples: 72,
    orbitTrailSamples: 34,
    skyMeshSegments: 28,
    galaxyPointBudget: 2_400,
    desiLightconePointBlocks: 32,
    shadowMapSize: 512,
    eclipseShadows: true,
    ringShadows: true,
    performanceMode: true,
  },
  low: {
    id: "low",
    label: "Low / mobile",
    dpr: [1, 1],
    antialias: false,
    shadows: false,
    textureQuality: "performance",
    starBudget: 8_000,
    starMagnitudeLimitG: 8,
    labelBudget: 8,
    asteroidBudget: 700,
    backgroundStarBudget: 420,
    sunSegments: 28,
    planetSegments: 24,
    moonSegments: 16,
    atmosphereSegments: 18,
    atmosphereLutWidth: 32,
    atmosphereLutHeight: 16,
    planetOrbitSamples: 64,
    moonOrbitSamples: 48,
    orbitTrailSamples: 24,
    skyMeshSegments: 20,
    galaxyPointBudget: 1_200,
    desiLightconePointBlocks: 20,
    shadowMapSize: 256,
    eclipseShadows: false,
    ringShadows: false,
    performanceMode: true,
  },
};

export interface QualityCapabilityInput {
  hardwareConcurrency?: number;
  deviceMemoryGb?: number;
  coarsePointer?: boolean;
  reducedMotion?: boolean;
  viewportWidth?: number;
}

export const recommendAstroQualityTier = (capabilities: QualityCapabilityInput): AstroQualityTier => {
  const cores = capabilities.hardwareConcurrency ?? 4;
  const memory = capabilities.deviceMemoryGb ?? 4;
  if (capabilities.coarsePointer || (capabilities.viewportWidth ?? 1280) <= 720 || cores <= 4 || memory <= 4) {
    return "low";
  }
  if (cores >= 12 && memory >= 12 && !capabilities.reducedMotion) return "high";
  return "balanced";
};

export const detectRecommendedAstroQualityTier = (): AstroQualityTier => {
  if (typeof window === "undefined" || typeof navigator === "undefined") return "balanced";
  const navigatorWithMemory = navigator as Navigator & { deviceMemory?: number };
  return recommendAstroQualityTier({
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemoryGb: navigatorWithMemory.deviceMemory,
    coarsePointer: window.matchMedia?.("(pointer: coarse)").matches,
    reducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    viewportWidth: window.innerWidth,
  });
};

export const degradeAstroQualityTier = (tier: AstroQualityTier): AstroQualityTier => {
  switch (tier) {
    case "ultra":
      return "high";
    case "high":
      return "balanced";
    case "balanced":
      return "low";
    case "low":
      return "low";
  }
};

export const isAstroQualityTier = (value: string | null): value is AstroQualityTier =>
  value === "ultra" || value === "high" || value === "balanced" || value === "low";

export const parseAstroQualitySetting = (value: string | null): AstroQualitySetting | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<AstroQualitySetting>;
    const tier: string | null = parsed.tier ?? null;
    if ((parsed.mode !== "auto" && parsed.mode !== "manual") || !isAstroQualityTier(tier)) {
      return null;
    }
    return { mode: parsed.mode, tier };
  } catch {
    return null;
  }
};

export const resolveInitialAstroQualitySetting = ({
  storedSetting,
  legacyTier,
  recommendedTier,
}: {
  storedSetting: string | null;
  legacyTier: string | null;
  recommendedTier: AstroQualityTier;
}): AstroQualitySetting => {
  const current = parseAstroQualitySetting(storedSetting);
  if (current) return current;
  if (isAstroQualityTier(legacyTier)) return { mode: "manual", tier: legacyTier };
  return { mode: "auto", tier: recommendedTier };
};

export const serializeAstroQualitySetting = (setting: AstroQualitySetting) => JSON.stringify(setting);
