import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DAY_MS, clampNumber, toUtcDayMs } from "../time/timeUtils";
import { advanceBoundedTime, type TimeDirection } from "../time/timePlayback";

export const useSolarTime = (minDate: Date, maxDate: Date) => {
  const minMs = useMemo(() => toUtcDayMs(minDate), [minDate]);
  const maxMs = useMemo(() => toUtcDayMs(maxDate), [maxDate]);
  const maxDays = Math.round((maxMs - minMs) / DAY_MS);

  const [currentMs, setCurrentMs] = useState(() => {
    const todayMs = toUtcDayMs(new Date());
    return clampNumber(todayMs, minMs, maxMs);
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [direction, setDirection] = useState<TimeDirection>("forward");
  const currentMsRef = useRef(currentMs);
  const lastFrameRef = useRef<number | null>(null);

  const currentDate = useMemo(() => new Date(currentMs), [currentMs]);
  const dayIndex = Math.round((currentMs - minMs) / DAY_MS);

  const commitCurrentMs = useCallback((nextMs: number) => {
    currentMsRef.current = nextMs;
    setCurrentMs(nextMs);
  }, []);

  const setCurrentDate = (date: Date) => {
    const nextMs = clampNumber(toUtcDayMs(date), minMs, maxMs);
    commitCurrentMs(nextMs);
  };

  const setDayIndex = (nextDay: number) => {
    const clamped = clampNumber(Math.round(nextDay), 0, maxDays);
    commitCurrentMs(minMs + clamped * DAY_MS);
  };

  useEffect(() => {
    if (!isPlaying) {
      lastFrameRef.current = null;
      return;
    }

    lastFrameRef.current = null;
    let animationFrame = 0;
    const step = (timestamp: number) => {
      if (lastFrameRef.current === null) {
        lastFrameRef.current = timestamp;
      }
      const deltaMs = timestamp - (lastFrameRef.current ?? timestamp);
      lastFrameRef.current = timestamp;
      const result = advanceBoundedTime({
        currentTimeMs: currentMsRef.current,
        elapsedRealMs: deltaMs,
        speedDaysPerSecond: speed,
        direction,
        minTimeMs: minMs,
        maxTimeMs: maxMs,
      });
      commitCurrentMs(result.timeMs);
      if (result.reachedBoundary) {
        setIsPlaying(false);
        return;
      }
      animationFrame = requestAnimationFrame(step);
    };

    animationFrame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animationFrame);
  }, [commitCurrentMs, direction, isPlaying, maxMs, minMs, speed]);

  return {
    currentDate,
    setCurrentDate,
    dayIndex,
    setDayIndex,
    maxDays,
    isPlaying,
    setIsPlaying,
    speed,
    setSpeed,
    direction,
    setDirection,
  };
};
