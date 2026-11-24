import {
  ASTRO_QUALITY_PROFILES,
  type AstroQualityTier,
} from "../../../lib/rendering/qualityManager";

export interface ScreenSpaceLabelCandidate {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  priority: number;
  pinned?: boolean;
}

export interface ScreenSpaceLabelViewport {
  width: number;
  height: number;
  edgePadding?: number;
  collisionPadding?: number;
}

export const SKYMAP_LABEL_BUDGETS: Record<AstroQualityTier, number> = {
  ultra: ASTRO_QUALITY_PROFILES.ultra.labelBudget,
  high: ASTRO_QUALITY_PROFILES.high.labelBudget,
  balanced: ASTRO_QUALITY_PROFILES.balanced.labelBudget,
  low: ASTRO_QUALITY_PROFILES.low.labelBudget,
};

interface LabelRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const toRect = (candidate: ScreenSpaceLabelCandidate, padding: number): LabelRect => ({
  left: candidate.x - candidate.width / 2 - padding,
  right: candidate.x + candidate.width / 2 + padding,
  top: candidate.y - candidate.height / 2 - padding,
  bottom: candidate.y + candidate.height / 2 + padding,
});

const intersects = (a: LabelRect, b: LabelRect) =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

export const selectNonOverlappingLabelIds = (
  candidates: ScreenSpaceLabelCandidate[],
  viewport: ScreenSpaceLabelViewport,
  budget: number,
) => {
  const edgePadding = viewport.edgePadding ?? 8;
  const collisionPadding = viewport.collisionPadding ?? 5;
  const accepted: Array<{ candidate: ScreenSpaceLabelCandidate; rect: LabelRect }> = [];
  const ranked = candidates
    .filter(
      (candidate) =>
        Number.isFinite(candidate.x) &&
        Number.isFinite(candidate.y) &&
        Number.isFinite(candidate.width) &&
        Number.isFinite(candidate.height) &&
        candidate.x + candidate.width / 2 >= edgePadding &&
        candidate.x - candidate.width / 2 <= viewport.width - edgePadding &&
        candidate.y + candidate.height / 2 >= edgePadding &&
        candidate.y - candidate.height / 2 <= viewport.height - edgePadding,
    )
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.priority - a.priority || a.id.localeCompare(b.id));

  ranked.forEach((candidate) => {
    if (!candidate.pinned && accepted.length >= Math.max(0, budget)) return;
    const rect = toRect(candidate, collisionPadding);
    const overlaps = accepted.some((entry) => intersects(rect, entry.rect));
    if (overlaps && !candidate.pinned) return;
    accepted.push({ candidate, rect });
  });

  return accepted.map((entry) => entry.candidate.id);
};
