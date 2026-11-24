import { describe, expect, it } from "vitest";
import { ASTRONOMICAL_COMMAND_TARGETS } from "./astronomicalCommandTargets";

describe("lazy astronomical command targets", () => {
  it("publishes unique canonical destinations for the expanded index", () => {
    const ids = ASTRONOMICAL_COMMAND_TARGETS.map((target) => target.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ASTRONOMICAL_COMMAND_TARGETS).toHaveLength(67);
  });

  it("keeps JPL aliases and stellar seed disclosure on their routes", () => {
    const halley = ASTRONOMICAL_COMMAND_TARGETS.find((target) => target.label === "Halley's Comet");
    const sirius = ASTRONOMICAL_COMMAND_TARGETS.find((target) => target.label === "Sirius A");

    expect(halley?.keywords).toContain("1P/Halley");
    expect(halley?.destination).toEqual({
      surface: "solar",
      target: { kind: "small-body", smallBodyId: "halley", navigationMode: "planetary" },
    });
    expect(sirius?.meta).toContain("curated navigation seed");
    expect(sirius?.destination).toEqual({ surface: "skymap", objectId: "star:nearby:sirius-a" });
  });
});
