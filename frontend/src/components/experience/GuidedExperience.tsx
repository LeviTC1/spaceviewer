import type { FC } from "react";

export interface GuidedTourStep {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  focusLabel?: string;
}

export interface GuidedTour<TStep extends GuidedTourStep = GuidedTourStep> {
  id: string;
  label: string;
  description: string;
  steps: TStep[];
}

export interface ExperienceAction {
  label: string;
  onClick: () => void;
  variant?: "primary" | "ghost";
}

export const ExperienceIntroOverlay: FC<{
  eyebrow: string;
  title: string;
  body: string;
  highlights: string[];
  primaryAction: ExperienceAction;
  secondaryAction: ExperienceAction;
  tertiaryAction?: ExperienceAction;
}> = ({ eyebrow, title, body, highlights, primaryAction, secondaryAction, tertiaryAction }) => (
  <div className="experience-intro" role="dialog" aria-modal="true" aria-labelledby="experience-intro-title">
    <div className="experience-intro__card">
      <div className="experience-intro__copy">
        <p className="eyebrow">{eyebrow}</p>
        <h2 id="experience-intro-title">{title}</h2>
        <p>{body}</p>
      </div>
      <div className="experience-intro__highlights">
        {highlights.map((highlight) => (
          <span key={highlight}>{highlight}</span>
        ))}
      </div>
      <div className="experience-intro__actions">
        <button type="button" onClick={primaryAction.onClick}>
          {primaryAction.label}
        </button>
        <button type="button" className="ghost" onClick={secondaryAction.onClick}>
          {secondaryAction.label}
        </button>
        {tertiaryAction ? (
          <button type="button" className="ghost" onClick={tertiaryAction.onClick}>
            {tertiaryAction.label}
          </button>
        ) : null}
      </div>
    </div>
  </div>
);

export const GuidedTourPanel: FC<{
  tour: GuidedTour;
  step: GuidedTourStep;
  stepIndex: number;
  presentationMode: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onStop: () => void;
  onTogglePresentation: () => void;
}> = ({ tour, step, stepIndex, presentationMode, onPrevious, onNext, onStop, onTogglePresentation }) => {
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === tour.steps.length - 1;

  return (
    <aside className="experience-tour" aria-label={`${tour.label} guided tour`}>
      <div className="experience-tour__header">
        <span className="eyebrow">{step.eyebrow}</span>
        <span>
          {stepIndex + 1}/{tour.steps.length}
        </span>
      </div>
      <div className="experience-tour__copy">
        <h2>{step.title}</h2>
        <p>{step.body}</p>
        {step.focusLabel ? <strong>{step.focusLabel}</strong> : null}
      </div>
      <div className="experience-tour__progress" aria-hidden="true">
        {tour.steps.map((tourStep, index) => (
          <span key={tourStep.id} className={index <= stepIndex ? "is-active" : ""} />
        ))}
      </div>
      <div className="experience-tour__actions">
        <button type="button" className="ghost button--small" onClick={onStop}>
          End tour
        </button>
        <button type="button" className="ghost button--small" onClick={onTogglePresentation}>
          {presentationMode ? "Exit presentation" : "Present"}
        </button>
        <button type="button" className="ghost button--small" onClick={onPrevious} disabled={isFirst}>
          Back
        </button>
        <button type="button" className="button--small" onClick={onNext}>
          {isLast ? "Finish" : "Next"}
        </button>
      </div>
    </aside>
  );
};

export const PresentationHud: FC<{
  eyebrow: string;
  title: string;
  body: string;
  actions: ExperienceAction[];
}> = ({ eyebrow, title, body, actions }) => (
  <aside className="experience-presentation-hud" aria-label={`${title} presentation controls`}>
    <p className="eyebrow">{eyebrow}</p>
    <h2>{title}</h2>
    <p>{body}</p>
    <div>
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          className={action.variant === "primary" ? "button--small" : "ghost button--small"}
          onClick={action.onClick}
        >
          {action.label}
        </button>
      ))}
    </div>
  </aside>
);
