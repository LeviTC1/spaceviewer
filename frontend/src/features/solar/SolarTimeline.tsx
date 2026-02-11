import { FC, useEffect, useRef, useState } from "react";

interface SolarTimelineProps {
  currentDate: Date;
  minDate: Date;
  maxDate: Date;
  dayIndex: number;
  maxDays: number;
  isPlaying: boolean;
  speed: number;
  onTogglePlay: () => void;
  onSpeedChange: (speed: number) => void;
  onDayChange: (next: number) => void;
}

const speedOptions = [1, 10, 100];

const SolarTimeline: FC<SolarTimelineProps> = ({
  currentDate,
  minDate,
  maxDate,
  dayIndex,
  maxDays,
  isPlaying,
  speed,
  onTogglePlay,
  onSpeedChange,
  onDayChange,
}) => {
  const formattedDate = new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(currentDate);
  const minYear = minDate.getUTCFullYear();
  const maxYear = maxDate.getUTCFullYear();
  const [pulse, setPulse] = useState(false);
  const pulseRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (pulseRef.current) {
        window.clearTimeout(pulseRef.current);
      }
    };
  }, []);

  const triggerPulse = () => {
    setPulse(true);
    if (pulseRef.current) {
      window.clearTimeout(pulseRef.current);
    }
    pulseRef.current = window.setTimeout(() => {
      setPulse(false);
    }, 180);
  };

  return (
    <div className={`solar-timeline ${pulse ? "solar-timeline--pulse" : ""}`}>
      <div className="solar-timeline__controls">
        <button type="button" className="ghost button--small" onClick={onTogglePlay}>
          {isPlaying ? "Pause" : "Play"}
        </button>
        <span className="solar-timeline__label">Alignment · {formattedDate}</span>
        {isPlaying && (
          <span className="solar-timeline__flow">Time flowing · {currentDate.getUTCFullYear()}</span>
        )}
        <div className="solar-timeline__speeds">
          {speedOptions.map((option) => (
            <button
              key={option}
              type="button"
              className={`ghost button--small ${speed === option ? "active" : ""}`}
              onClick={() => onSpeedChange(option)}
            >
              {option}x
            </button>
          ))}
        </div>
      </div>
      <div className="solar-timeline__range">
        <span>{minYear}</span>
        <span>{maxYear}</span>
      </div>
      <input
        type="range"
        min={0}
        max={maxDays}
        step={1}
        value={dayIndex}
        onChange={(event) => {
          onDayChange(Number(event.target.value));
          triggerPulse();
        }}
      />
    </div>
  );
};

export default SolarTimeline;
