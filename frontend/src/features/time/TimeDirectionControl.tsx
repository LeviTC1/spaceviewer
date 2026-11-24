import type { FC } from "react";
import type { TimeDirection } from "./timePlayback";

interface TimeDirectionControlProps {
  direction: TimeDirection;
  onDirectionChange: (direction: TimeDirection) => void;
  className?: string;
}

const directionOptions: Array<{ direction: TimeDirection; label: string }> = [
  { direction: "reverse", label: "Reverse" },
  { direction: "forward", label: "Forward" },
];

const TimeDirectionControl: FC<TimeDirectionControlProps> = ({ direction, onDirectionChange, className = "" }) => (
  <div className={`time-direction-control ${className}`.trim()}>
    <span className="time-direction-control__label">Direction</span>
    <div className="time-direction-control__buttons" role="group" aria-label="Playback direction">
      {directionOptions.map((option) => (
        <button
          key={option.direction}
          type="button"
          className={`ghost button--small ${direction === option.direction ? "active" : ""}`}
          aria-pressed={direction === option.direction}
          onClick={() => onDirectionChange(option.direction)}
        >
          {option.label}
        </button>
      ))}
    </div>
  </div>
);

export default TimeDirectionControl;
