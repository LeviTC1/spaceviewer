export type StarLodTier = "survey" | "regional" | "local" | "focus";
export type StarCatalogChunkTier = "core" | "context" | "background";

export interface StarLodPolicy {
  tier: StarLodTier;
  label: string;
  maxRenderables: number;
  maxInteractiveCandidates: number;
  minBrightness: number;
  maxDistanceLy: number;
  activeChunkTiers: StarCatalogChunkTier[];
  labelPriorityFloor: number;
}

export const getStarLodPolicy = (cameraDistance: number): StarLodPolicy => {
  if (cameraDistance <= 30) {
    return {
      tier: "focus",
      label: "Focus",
      maxRenderables: 140,
      maxInteractiveCandidates: 72,
      minBrightness: 0,
      maxDistanceLy: 90,
      activeChunkTiers: ["core", "context", "background"],
      labelPriorityFloor: 50,
    };
  }

  if (cameraDistance <= 60) {
    return {
      tier: "local",
      label: "Local",
      maxRenderables: 96,
      maxInteractiveCandidates: 56,
      minBrightness: 0.08,
      maxDistanceLy: 80,
      activeChunkTiers: ["core", "context", "background"],
      labelPriorityFloor: 60,
    };
  }

  if (cameraDistance <= 120) {
    return {
      tier: "regional",
      label: "Regional",
      maxRenderables: 56,
      maxInteractiveCandidates: 40,
      minBrightness: 0.22,
      maxDistanceLy: 55,
      activeChunkTiers: ["core", "context", "background"],
      labelPriorityFloor: 75,
    };
  }

  return {
    tier: "survey",
    label: "Survey",
    maxRenderables: 32,
    maxInteractiveCandidates: 28,
    minBrightness: 0.42,
    maxDistanceLy: 38,
    activeChunkTiers: ["core", "context"],
    labelPriorityFloor: 90,
  };
};
