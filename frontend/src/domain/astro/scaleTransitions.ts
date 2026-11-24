import { referenceFrameManager } from "./referenceFrames";
import { SCALE_DOMAINS, scaleDomainManager, type ScaleDomainId } from "./scaleDomains";

export type AstroRendererSurface = "earth" | "solar" | "skymap";
export type ScaleTransitionPhase = "departing" | "arriving";

export interface ScaleTransitionPlan {
  from: ScaleDomainId;
  to: ScaleDomainId;
  fromLabel: string;
  toLabel: string;
  direction: -1 | 1;
  directionLabel: "Travelling inward" | "Travelling outward";
  adjacent: boolean;
  rendererSwapRequired: boolean;
  sourceSurface: AstroRendererSurface;
  targetSurface: AstroRendererSurface;
  targetFramePath: Array<{
    id: string;
    label: string;
    interpretation: "physical" | "derived" | "visualization";
  }>;
}

export const SCALE_TRANSITION_DEPART_MS = 420;
export const SCALE_TRANSITION_ARRIVE_MS = 620;

const SCALE_DOMAIN_SURFACES: Record<ScaleDomainId, AstroRendererSurface> = {
  surface: "earth",
  planetary: "solar",
  solar: "solar",
  stellar: "skymap",
  galactic: "skymap",
  "deep-space": "skymap",
  cosmological: "skymap",
};

export const getScaleDomainSurface = (domainId: ScaleDomainId) => SCALE_DOMAIN_SURFACES[domainId];

export const buildScaleTransitionPlan = (
  from: ScaleDomainId,
  to: ScaleDomainId,
): ScaleTransitionPlan | null => {
  if (from === to) return null;
  const transition = scaleDomainManager.getTransition(from, to);
  if (transition.direction === 0) return null;
  const targetFrame = SCALE_DOMAINS[to].frame;
  const sourceSurface = getScaleDomainSurface(from);
  const targetSurface = getScaleDomainSurface(to);

  return {
    from,
    to,
    fromLabel: transition.from.label,
    toLabel: transition.to.label,
    direction: transition.direction,
    directionLabel: transition.direction > 0 ? "Travelling outward" : "Travelling inward",
    adjacent: transition.adjacent,
    rendererSwapRequired: sourceSurface !== targetSurface,
    sourceSurface,
    targetSurface,
    targetFramePath: referenceFrameManager.getBreadcrumb(targetFrame).map((frame) => ({
      id: frame.id,
      label: frame.label,
      interpretation: frame.interpretation,
    })),
  };
};
