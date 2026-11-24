export const COMET_TAIL_PRESENTATION_MODEL = {
  id: "anti-solar-distance-heuristic-v1",
  label: "Anti-solar display heuristic",
  activeInsideAu: 6,
  fullActivityInsideAu: 0.65,
  accuracyNote:
    "Tail direction is constrained to the anti-solar axis, while length and opacity are a heliocentric-distance display heuristic. It is not an observed coma, dust simulation, plasma model, or activity forecast.",
} as const;

export const getCometTailPresentation = (distanceAu: number) => {
  const safeDistance = Math.max(0.01, Number.isFinite(distanceAu) ? distanceAu : 99);
  const span = COMET_TAIL_PRESENTATION_MODEL.activeInsideAu - COMET_TAIL_PRESENTATION_MODEL.fullActivityInsideAu;
  const linearActivity = Math.max(
    0,
    Math.min(1, (COMET_TAIL_PRESENTATION_MODEL.activeInsideAu - safeDistance) / span),
  );
  const activity = linearActivity * linearActivity * (3 - 2 * linearActivity);
  return {
    active: activity > 0.015,
    activity,
    lengthSceneUnits: 1.1 + activity * (4.8 / Math.sqrt(Math.max(safeDistance, 0.35))),
    widthSceneUnits: 0.16 + activity * 0.52,
    opacity: 0.04 + activity * 0.28,
  };
};

