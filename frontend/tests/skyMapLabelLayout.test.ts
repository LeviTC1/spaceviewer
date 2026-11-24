import { describe, expect, it } from "vitest";
import {
  SKYMAP_LABEL_BUDGETS,
  selectNonOverlappingLabelIds,
  type ScreenSpaceLabelCandidate,
} from "../src/features/skymap/core/labelLayout";

const candidate = (
  id: string,
  x: number,
  y: number,
  priority: number,
  pinned = false,
): ScreenSpaceLabelCandidate => ({ id, x, y, width: 80, height: 24, priority, pinned });

describe("SkyMap screen-space label layout", () => {
  it("keeps the higher-priority label when rectangles overlap", () => {
    expect(
      selectNonOverlappingLabelIds(
        [candidate("lower", 100, 100, 20), candidate("higher", 112, 104, 90)],
        { width: 800, height: 600 },
        10,
      ),
    ).toEqual(["higher"]);
  });

  it("always retains pinned interaction labels even when they overlap", () => {
    expect(
      selectNonOverlappingLabelIds(
        [candidate("selected", 100, 100, 10, true), candidate("hovered", 102, 100, 5, true)],
        { width: 800, height: 600 },
        1,
      ),
    ).toEqual(["selected", "hovered"]);
  });

  it("clips off-screen labels and enforces the quality budget", () => {
    const ids = selectNonOverlappingLabelIds(
      [
        candidate("outside", -120, 100, 100),
        candidate("one", 100, 100, 90),
        candidate("two", 300, 100, 80),
        candidate("three", 500, 100, 70),
      ],
      { width: 800, height: 600 },
      2,
    );
    expect(ids).toEqual(["one", "two"]);
    expect(SKYMAP_LABEL_BUDGETS.low).toBeLessThan(SKYMAP_LABEL_BUDGETS.balanced);
    expect(SKYMAP_LABEL_BUDGETS.balanced).toBeLessThan(SKYMAP_LABEL_BUDGETS.ultra);
  });
});
