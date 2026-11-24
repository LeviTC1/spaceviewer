import type { FC } from "react";
import type { ScaleTransitionPhase, ScaleTransitionPlan } from "../../domain/astro/scaleTransitions";

interface ScaleJourneyTransitionProps {
  phase: ScaleTransitionPhase;
  plan: ScaleTransitionPlan;
}

const ScaleJourneyTransition: FC<ScaleJourneyTransitionProps> = ({ phase, plan }) => {
  const targetFrames = plan.targetFramePath.slice(-4);
  const announcement = `${plan.directionLabel} from ${plan.fromLabel} to ${plan.toLabel}`;

  return (
    <section
      className={`scale-journey-transition is-${phase} is-${plan.direction > 0 ? "outward" : "inward"}`}
      role="status"
      aria-live="assertive"
      aria-label={announcement}
      data-from-domain={plan.from}
      data-to-domain={plan.to}
      data-phase={phase}
    >
      <div className="scale-journey-transition__field" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="scale-journey-transition__instrument">
        <span className="scale-journey-transition__eyebrow">{plan.directionLabel}</span>
        <div className="scale-journey-transition__route">
          <strong>{plan.fromLabel}</strong>
          <span aria-hidden="true">→</span>
          <strong>{plan.toLabel}</strong>
        </div>
        <ol className="scale-journey-transition__frames" aria-label="Target reference-frame hierarchy">
          {targetFrames.map((frame, index) => (
            <li key={frame.id} className={index === targetFrames.length - 1 ? "is-target" : undefined}>
              <span>{frame.label}</span>
              <em>{frame.interpretation}</em>
            </li>
          ))}
        </ol>
        <span className="scale-journey-transition__progress" aria-hidden="true" />
      </div>
    </section>
  );
};

export default ScaleJourneyTransition;
