import { describe, expect, it } from "vitest";
import { DAY_MS } from "./timeUtils";
import { advanceBoundedTime, getSignedPlaybackSpeed } from "./timePlayback";

const minTimeMs = Date.UTC(2025, 0, 1);
const maxTimeMs = Date.UTC(2050, 11, 31);

describe("bounded time playback", () => {
  it("keeps speed magnitude separate from direction", () => {
    expect(getSignedPlaybackSpeed(10, "forward")).toBe(10);
    expect(getSignedPlaybackSpeed(10, "reverse")).toBe(-10);
    expect(getSignedPlaybackSpeed(-10, "reverse")).toBe(-10);
  });

  it("advances forward and reverse with the same speed magnitude", () => {
    const currentTimeMs = Date.UTC(2030, 0, 10);
    const forward = advanceBoundedTime({
      currentTimeMs,
      elapsedRealMs: 2_000,
      speedDaysPerSecond: 10,
      direction: "forward",
      minTimeMs,
      maxTimeMs,
    });
    const reverse = advanceBoundedTime({
      currentTimeMs,
      elapsedRealMs: 2_000,
      speedDaysPerSecond: 10,
      direction: "reverse",
      minTimeMs,
      maxTimeMs,
    });

    expect(forward.timeMs).toBe(currentTimeMs + 20 * DAY_MS);
    expect(reverse.timeMs).toBe(currentTimeMs - 20 * DAY_MS);
    expect(forward.reachedBoundary).toBe(false);
    expect(reverse.reachedBoundary).toBe(false);
  });

  it("clamps and stops at the boundary in either direction", () => {
    const reverse = advanceBoundedTime({
      currentTimeMs: minTimeMs + DAY_MS,
      elapsedRealMs: 1_000,
      speedDaysPerSecond: 10,
      direction: "reverse",
      minTimeMs,
      maxTimeMs,
    });
    const forward = advanceBoundedTime({
      currentTimeMs: maxTimeMs - DAY_MS,
      elapsedRealMs: 1_000,
      speedDaysPerSecond: 10,
      direction: "forward",
      minTimeMs,
      maxTimeMs,
    });

    expect(reverse).toEqual({ timeMs: minTimeMs, reachedBoundary: true });
    expect(forward).toEqual({ timeMs: maxTimeMs, reachedBoundary: true });
  });

  it("does not move for an invalid rate or elapsed interval", () => {
    const currentTimeMs = Date.UTC(2030, 0, 10);
    expect(
      advanceBoundedTime({
        currentTimeMs,
        elapsedRealMs: Number.NaN,
        speedDaysPerSecond: 10,
        direction: "reverse",
        minTimeMs,
        maxTimeMs,
      }),
    ).toEqual({ timeMs: currentTimeMs, reachedBoundary: false });
  });
});
