import { useEffect, useMemo, useRef, useState } from "react";
import { DAY_MS, clampNumber, toUtcDayMs } from "../time/timeUtils";

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
  const lastFrameRef = useRef<number | null>(null);

  const currentDate = useMemo(() => new Date(currentMs), [currentMs]);
  const dayIndex = Math.round((currentMs - minMs) / DAY_MS);

  const setCurrentDate = (date: Date) => {
    const nextMs = clampNumber(toUtcDayMs(date), minMs, maxMs);
    setCurrentMs(nextMs);
  };

  const setDayIndex = (nextDay: number) => {
    const clamped = clampNumber(Math.round(nextDay), 0, maxDays);
    setCurrentMs(minMs + clamped * DAY_MS);
  };

  useEffect(() => {
    if (!isPlaying) {
      lastFrameRef.current = null;
      return;
    }

    let animationFrame = 0;
    const step = (timestamp: number) => {
      if (lastFrameRef.current === null) {
        lastFrameRef.current = timestamp;
      }
      const deltaMs = timestamp - (lastFrameRef.current ?? timestamp);
      lastFrameRef.current = timestamp;
      const deltaDays = (deltaMs / 1000) * speed;
      let shouldStop = false;
      setCurrentMs((prev) => {
        const next = clampNumber(prev + deltaDays * DAY_MS, minMs, maxMs);
        if (next >= maxMs) {
          shouldStop = true;
        }
        return next;
      });
      if (shouldStop) {
        setIsPlaying(false);
        return;
      }
      animationFrame = requestAnimationFrame(step);
    };

    animationFrame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animationFrame);
  }, [isPlaying, maxMs, minMs, speed]);

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
  };
};
