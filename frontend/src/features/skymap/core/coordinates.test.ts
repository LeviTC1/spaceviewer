import { describe, expect, it } from "vitest";
import {
  LOCAL_GROUP_SCENE_PROJECTION,
  projectPositionToScene,
  projectSupergalacticKpcToScene,
} from "./coordinates";

describe("Local Group scene projection", () => {
  it("preserves supergalactic direction while compressing radius", () => {
    const source = { x: 300, y: -400, z: 120 };
    const projected = projectSupergalacticKpcToScene(source);
    expect(projected.x / projected.y).toBeCloseTo(source.x / source.y, 12);
    expect(projected.z / projected.y).toBeCloseTo(source.z / source.y, 12);
    expect(Math.hypot(projected.x, projected.y, projected.z)).toBeLessThan(Math.hypot(source.x, source.y, source.z));
  });

  it("is monotonic and maps the documented physical boundary", () => {
    const near = projectSupergalacticKpcToScene({ x: 10, y: 0, z: 0 });
    const middle = projectSupergalacticKpcToScene({ x: 100, y: 0, z: 0 });
    const far = projectSupergalacticKpcToScene({ x: 1_400, y: 0, z: 0 });
    expect(near.x).toBe(LOCAL_GROUP_SCENE_PROJECTION.minimumSceneRadius);
    expect(middle.x).toBeGreaterThan(near.x);
    expect(far.x).toBe(LOCAL_GROUP_SCENE_PROJECTION.maximumSceneRadius);
  });

  it("uses the logarithmic projection only for physical supergalactic kiloparsecs", () => {
    const projected = projectPositionToScene({
      mode: "cartesian",
      frame: "supergalactic-cartesian",
      unit: "kiloparsec",
      x: 1_400,
      y: 0,
      z: 0,
    });
    expect(projected?.x).toBe(LOCAL_GROUP_SCENE_PROJECTION.maximumSceneRadius);
    expect(projected?.sourceFrame).toBe("supergalactic-cartesian");
  });
});
