import { DAY_MS, clampNumber } from "./timeUtils";

export type TimeDirection = "forward" | "reverse";

export interface BoundedTimeAdvanceInput {
  currentTimeMs: number;
  elapsedRealMs: number;
  speedDaysPerSecond: number;
  direction: TimeDirection;
  minTimeMs: number;
  maxTimeMs: number;
}

export interface BoundedTimeAdvanceResult {
  timeMs: number;
  reachedBoundary: boolean;
}

export const getTimeDirectionSign = (direction: TimeDirection) => (direction === "reverse" ? -1 : 1);

export const getSignedPlaybackSpeed = (speedDaysPerSecond: number, direction: TimeDirection) => {
  const magnitude = Number.isFinite(speedDaysPerSecond) ? Math.abs(speedDaysPerSecond) : 0;
  return magnitude * getTimeDirectionSign(direction);
};

/**
 * Advances a bounded UTC simulation clock. Speed is always treated as a
 * magnitude; direction is explicit so controls and scientific readouts do not
 * have to infer playback intent from a negative number.
 */
export const advanceBoundedTime = ({
  currentTimeMs,
  elapsedRealMs,
  speedDaysPerSecond,
  direction,
  minTimeMs,
  maxTimeMs,
}: BoundedTimeAdvanceInput): BoundedTimeAdvanceResult => {
  const lowerBound = Math.min(minTimeMs, maxTimeMs);
  const upperBound = Math.max(minTimeMs, maxTimeMs);
  const safeCurrentTime = clampNumber(
    Number.isFinite(currentTimeMs) ? currentTimeMs : lowerBound,
    lowerBound,
    upperBound,
  );
  const safeElapsedRealMs = Number.isFinite(elapsedRealMs) ? Math.max(0, elapsedRealMs) : 0;
  const signedSpeed = getSignedPlaybackSpeed(speedDaysPerSecond, direction);

  if (safeElapsedRealMs === 0 || signedSpeed === 0) {
    return { timeMs: safeCurrentTime, reachedBoundary: false };
  }

  const timeMs = clampNumber(
    safeCurrentTime + (safeElapsedRealMs / 1_000) * signedSpeed * DAY_MS,
    lowerBound,
    upperBound,
  );
  const reachedBoundary = direction === "reverse" ? timeMs <= lowerBound : timeMs >= upperBound;

  return { timeMs, reachedBoundary };
};
