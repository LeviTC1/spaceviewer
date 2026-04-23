import { DAY_MS, clampNumber, dateFromUtcDateKey, toUtcDateKey, toUtcDayMs } from "../../time/timeUtils";

export type SkyMapTimeSourceMode = "simulated" | "realtime";
export type SkyMapPlaybackState = "paused" | "playing";

export interface SkyMapTimeState {
  currentTimeIso: string;
  sourceMode: SkyMapTimeSourceMode;
  playback: SkyMapPlaybackState;
  speedDaysPerSecond: number;
  lastAdvancedAtIso?: string;
}

export const SKYMAP_TIME_MIN_DATE_KEY = "1900-01-01";
export const SKYMAP_TIME_MAX_DATE_KEY = "2100-12-31";
export const SKYMAP_SOLAR_BRIDGE_EPOCH_DATE_KEY = "2025-01-01";
export const SKYMAP_TIME_TICK_MS = 1_000;

export const SKYMAP_TIME_SPEED_OPTIONS = [
  { label: "1 day/s", value: 1 },
  { label: "7 days/s", value: 7 },
  { label: "30 days/s", value: 30 },
  { label: "1 year/s", value: 365 },
] as const;

const minTimeMs = Date.UTC(1900, 0, 1);
const maxTimeMs = Date.UTC(2100, 11, 31);
export const SKYMAP_SOLAR_BRIDGE_EPOCH_MS = Date.UTC(2025, 0, 1);

const clampTimeMs = (timeMs: number) => clampNumber(timeMs, minTimeMs, maxTimeMs);

export const createSkyMapTimeState = (date = new Date()): SkyMapTimeState => ({
  currentTimeIso: new Date(clampTimeMs(toUtcDayMs(date))).toISOString(),
  sourceMode: "simulated",
  playback: "paused",
  speedDaysPerSecond: 7,
});

export const getSkyMapTimeMs = (time: SkyMapTimeState) => {
  const parsed = Date.parse(time.currentTimeIso);
  return Number.isFinite(parsed) ? clampTimeMs(parsed) : clampTimeMs(toUtcDayMs(new Date()));
};

export const getSkyMapDate = (time: SkyMapTimeState) => new Date(getSkyMapTimeMs(time));

export const getSkyMapDateKey = (time: SkyMapTimeState) => toUtcDateKey(getSkyMapDate(time));

export const getSolarBridgeTimeDays = (time: SkyMapTimeState) =>
  (getSkyMapTimeMs(time) - SKYMAP_SOLAR_BRIDGE_EPOCH_MS) / DAY_MS;

export const setSkyMapDateKey = (time: SkyMapTimeState, dateKey: string): SkyMapTimeState => {
  const parsed = dateFromUtcDateKey(dateKey);
  if (!parsed) return time;
  return {
    ...time,
    currentTimeIso: new Date(clampTimeMs(toUtcDayMs(parsed))).toISOString(),
    sourceMode: "simulated",
    lastAdvancedAtIso: new Date().toISOString(),
  };
};

export const stepSkyMapTime = (time: SkyMapTimeState, days: number): SkyMapTimeState => ({
  ...time,
  currentTimeIso: new Date(clampTimeMs(getSkyMapTimeMs(time) + days * DAY_MS)).toISOString(),
  sourceMode: "simulated",
  lastAdvancedAtIso: new Date().toISOString(),
});

export const advanceSkyMapTime = (time: SkyMapTimeState, elapsedRealMs: number): SkyMapTimeState => {
  if (time.playback !== "playing") return time;
  const deltaDays = (elapsedRealMs / 1000) * time.speedDaysPerSecond;
  const nextTimeMs = clampTimeMs(getSkyMapTimeMs(time) + deltaDays * DAY_MS);
  const reachedBoundary = nextTimeMs <= minTimeMs || nextTimeMs >= maxTimeMs;
  return {
    ...time,
    currentTimeIso: new Date(nextTimeMs).toISOString(),
    playback: reachedBoundary ? "paused" : time.playback,
    sourceMode: "simulated",
    lastAdvancedAtIso: new Date().toISOString(),
  };
};

export const resetSkyMapTimeToNow = (time: SkyMapTimeState): SkyMapTimeState => ({
  ...time,
  currentTimeIso: new Date(clampTimeMs(toUtcDayMs(new Date()))).toISOString(),
  playback: "paused",
  sourceMode: "realtime",
  lastAdvancedAtIso: new Date().toISOString(),
});
