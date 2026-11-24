import { describe, expect, it } from "vitest";
import { getSkyMapPath, readSkyMapObjectId } from "./routes";

describe("SkyMap object routes", () => {
  it("round-trips stable catalogue IDs through an encoded query", () => {
    for (const objectId of [
      "deep:galaxy:andromeda-galaxy",
      "deep:galaxy:lvdb-draco-1",
      "gaia-dr3:5853498713190525696",
      "solar:planet:mars",
    ]) {
      const path = getSkyMapPath(objectId);
      expect(path).toContain("/skymap?object=");
      expect(readSkyMapObjectId(path.split("?")[1])).toBe(objectId);
    }
  });

  it("uses the clean overview route for empty selections", () => {
    expect(getSkyMapPath()).toBe("/skymap");
    expect(getSkyMapPath("  ")).toBe("/skymap");
    expect(readSkyMapObjectId("")).toBeNull();
    expect(readSkyMapObjectId("?object=%20%20")).toBeNull();
  });
});
