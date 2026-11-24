import { describe, expect, it } from "vitest";
import { createSkyRenderContext } from "../core/renderers";
import {
  createInterstellarProbesLayerData,
  INTERSTELLAR_PROBES,
  INTERSTELLAR_PROBES_LAYER,
} from "./interstellarProbesLayer";

describe("Interstellar probes layer", () => {
  it("publishes both Voyager probes with epoch-labelled JPL vectors", () => {
    const data = createInterstellarProbesLayerData();
    expect(data.objects.map((object) => object.name)).toEqual(["Voyager 1", "Voyager 2"]);
    expect(data.metrics?.searchableObjects).toBe(2);
    expect(data.version).toContain("jpl-horizons-2026-09-04");
    expect(INTERSTELLAR_PROBES.every((object) => object.position.frame === "heliocentric-ecliptic")).toBe(true);
    expect(INTERSTELLAR_PROBES[0].scientific?.distanceFromSunAu).toBeCloseTo(171.654, 2);
    expect(INTERSTELLAR_PROBES[1].scientific?.distanceFromSunAu).toBeCloseTo(143.851, 2);
  });

  it("renders an interactive marker and outbound vector for each spacecraft", () => {
    const context = createSkyRenderContext({ frame: "heliocentric-ecliptic", cameraDistance: 54 });
    const renderables = INTERSTELLAR_PROBES_LAYER.renderer!.buildRenderables(INTERSTELLAR_PROBES, context);
    expect(renderables.filter((renderable) => renderable.kind === "point")).toHaveLength(2);
    expect(renderables.filter((renderable) => renderable.kind === "line")).toHaveLength(2);
    expect(renderables.find((renderable) => renderable.objectId === "spacecraft:voyager-1" && renderable.kind === "point")).toMatchObject({
      interactive: true,
      label: "Voyager 1",
    });
  });
});
