import { describe, expect, it } from "vitest";
import {
  getSolarLaunchTargetFromSnapshot,
  getSolarTargetPath,
  readSolarTargetFromSearch,
} from "../src/features/solar/solarRoutes";

describe("Solar routes", () => {
  it("round-trips object, navigation, date, and true-AU scale context", () => {
    const path = getSolarTargetPath({
      kind: "planet",
      planetId: "neptune",
      navigationMode: "overview",
      scaleMode: "realistic",
      dateKey: "2035-07-14",
    });
    const search = path.slice(path.indexOf("?"));

    expect(path).toBe("/solar?object=planet%3Aneptune&mode=overview&scale=realistic&date=2035-07-14");
    expect(readSolarTargetFromSearch(search)).toEqual({
      kind: "planet",
      planetId: "neptune",
      navigationMode: "overview",
      scaleMode: "realistic",
      dateKey: "2035-07-14",
    });
  });

  it("supports moon, Sun, and belt targets with any declared scale mode", () => {
    expect(readSolarTargetFromSearch("?object=overview&scale=realistic&mode=ecliptic")).toMatchObject({
      kind: "overview",
      navigationMode: "ecliptic",
      scaleMode: "realistic",
    });
    expect(readSolarTargetFromSearch("?object=moon%3Aeuropa&scale=educational")).toMatchObject({
      kind: "moon",
      moonId: "europa",
      scaleMode: "educational",
    });
    expect(readSolarTargetFromSearch("?object=sun&scale=showcase")).toMatchObject({
      kind: "sun",
      scaleMode: "showcase",
    });
    expect(readSolarTargetFromSearch("?object=belt&scale=realistic")).toMatchObject({
      kind: "belt",
      scaleMode: "realistic",
    });
  });

  it("ignores invalid optional context and rejects unknown objects", () => {
    expect(readSolarTargetFromSearch("?object=planet%3Aearth&mode=warp&scale=literal&date=tomorrow")).toEqual({
      kind: "planet",
      planetId: "earth",
      navigationMode: undefined,
      scaleMode: undefined,
      dateKey: undefined,
    });
    expect(readSolarTargetFromSearch("?object=planet%3Avulcan&scale=realistic")).toBeNull();
    expect(readSolarTargetFromSearch("?scale=realistic")).toBeNull();
  });

  it("builds canonical moon routes from live selection state without losing context", () => {
    const target = getSolarLaunchTargetFromSnapshot({
      selectedPlanetId: "jupiter",
      selectedMoonId: "europa",
      sunSelected: false,
      asteroidBeltSelected: false,
      navigationMode: "planetary",
      scaleMode: "realistic",
      dateKey: "2042-03-18",
    });

    expect(target).toEqual({
      kind: "moon",
      moonId: "europa",
      navigationMode: "planetary",
      scaleMode: "realistic",
      dateKey: "2042-03-18",
    });
    expect(getSolarTargetPath(target)).toBe(
      "/solar?object=moon%3Aeuropa&mode=planetary&scale=realistic&date=2042-03-18",
    );
  });

  it("falls back to an explicit overview identity after selection is cleared", () => {
    expect(
      getSolarLaunchTargetFromSnapshot({
        selectedPlanetId: null,
        selectedMoonId: null,
        sunSelected: false,
        asteroidBeltSelected: false,
        navigationMode: "ecliptic",
        scaleMode: "educational",
        dateKey: "2026-09-02",
      }),
    ).toEqual({
      kind: "overview",
      navigationMode: "ecliptic",
      scaleMode: "educational",
      dateKey: "2026-09-02",
    });
  });
});
