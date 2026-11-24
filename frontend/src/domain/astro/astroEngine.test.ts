import { describe, expect, it } from "vitest";
import {
  ReferenceFrameManager,
  SpatialObjectRegistry,
  astroDistance,
  buildEarthViewerBridgeUrl,
  buildScaleTransitionPlan,
  convertAstroDistance,
  projectCameraRelative,
  resolveDepthBufferStrategy,
  resolveRendererBackendCapabilities,
  scaleDomainManager,
} from ".";
import { degradeAstroQualityTier, recommendAstroQualityTier } from "../../lib/rendering/qualityManager";

describe("astronomical units and frames", () => {
  it("converts authoritative distance units without using scene units", () => {
    const au = convertAstroDistance(astroDistance(149_597_870.7, "kilometer"), "astronomical-unit");
    expect(au.value).toBeCloseTo(1, 10);
    expect(convertAstroDistance(astroDistance(1, "parsec"), "light-year").value).toBeCloseTo(3.261563777, 8);
    expect(convertAstroDistance(astroDistance(1, "kiloparsec"), "parsec").value).toBeCloseTo(1_000, 8);
    expect(convertAstroDistance(astroDistance(1, "megaparsec"), "kiloparsec").value).toBeCloseTo(1_000, 8);
  });

  it("subtracts the floating origin before Float32 projection", () => {
    const position = { x: 1_000_000_000.25, y: 2_000_000_000.5, z: -3_000_000_000.75, unit: "kilometer" as const, frame: "test" };
    const origin = { x: 1_000_000_000, y: 2_000_000_000, z: -3_000_000_000, unit: "kilometer" as const, frame: "test" };
    expect(Array.from(projectCameraRelative(position, origin, { sceneUnitsPerSourceUnit: 2 }))).toEqual([0.5, 1, -1.5]);
  });

  it("resolves hierarchical frame breadcrumbs and common ancestors", () => {
    const frames = new ReferenceFrameManager();
    expect(frames.getBreadcrumb("surface-local").map((frame) => frame.id)).toEqual([
      "cosmological-comoving",
      "local-group",
      "galactic",
      "local-interstellar",
      "heliocentric-ecliptic",
      "planetocentric",
      "earth-fixed",
      "surface-local",
    ]);
    expect(frames.getCommonAncestor("surface-local", "galactic")?.id).toBe("galactic");
  });
});

describe("scale, object, quality and surface contracts", () => {
  it("identifies implemented Galactic and cosmological scientific-visualization transitions", () => {
    expect(scaleDomainManager.getTransition("solar", "stellar").adjacent).toBe(true);
    expect(scaleDomainManager.get("galactic").availability).toBe("implemented");
    expect(scaleDomainManager.get("cosmological").availability).toBe("implemented");
  });

  it("plans renderer-crossing journeys with a target reference-frame hierarchy", () => {
    const outward = buildScaleTransitionPlan("solar", "stellar");
    expect(outward).toMatchObject({
      direction: 1,
      directionLabel: "Travelling outward",
      adjacent: true,
      rendererSwapRequired: true,
      sourceSurface: "solar",
      targetSurface: "skymap",
    });
    expect(outward?.targetFramePath.at(-1)?.id).toBe("local-interstellar");

    const withinSkyMap = buildScaleTransitionPlan("stellar", "deep-space");
    expect(withinSkyMap).toMatchObject({
      direction: 1,
      rendererSwapRequired: false,
      sourceSurface: "skymap",
      targetSurface: "skymap",
    });
    expect(buildScaleTransitionPlan("solar", "solar")).toBeNull();
  });

  it("requires provenance when registering a canonical object", () => {
    const registry = new SpatialObjectRegistry();
    expect(() =>
      registry.register({
        id: "planet:test",
        slug: "test",
        name: "Test",
        type: "planet",
        referenceFrame: "heliocentric-ecliptic",
        epoch: "J2000",
        visual: { strategy: "pbr-body", lodLevels: ["low"] },
        sources: [],
        searchAliases: [],
        navigation: { scaleDomain: "solar", rendererSurface: "solar" },
      }),
    ).toThrow(/source/i);
  });

  it("builds a versioned, reversible EarthViewer scene handoff", () => {
    const url = new URL(
      buildEarthViewerBridgeUrl({
        baseUrl: "http://localhost:5175/",
        returnUrl: "http://localhost:5174/solar",
        timestamp: new Date("2026-09-01T12:00:00.000Z"),
        quality: "high",
      }),
    );
    expect(url.searchParams.get("bridge")).toBe("1");
    expect(url.searchParams.get("space")).toBe("earth-orbit");
    expect(url.searchParams.get("q")).toBe("high");
    expect(url.searchParams.get("return")).toBe("http://localhost:5174/solar");
  });

  it("recommends and degrades explicit quality tiers", () => {
    expect(recommendAstroQualityTier({ hardwareConcurrency: 16, deviceMemoryGb: 16 })).toBe("high");
    expect(recommendAstroQualityTier({ hardwareConcurrency: 4, deviceMemoryGb: 4 })).toBe("low");
    expect(degradeAstroQualityTier("ultra")).toBe("high");
    expect(degradeAstroQualityTier("low")).toBe("low");
  });

  it("requests reverse-Z only when WebGL 2 exposes EXT_clip_control", () => {
    expect(resolveDepthBufferStrategy(true)).toBe("reverse-z");
    expect(resolveDepthBufferStrategy(false)).toBe("standard");
    expect(
      resolveRendererBackendCapabilities({
        webgpuAvailable: true,
        webgl2Available: true,
        reversedDepthBufferAvailable: true,
      }),
    ).toMatchObject({
      active: "webgl2",
      fallbackAvailable: true,
      depthBufferStrategy: "reverse-z",
    });
    expect(
      resolveRendererBackendCapabilities({
        webgpuAvailable: false,
        webgl2Available: true,
        reversedDepthBufferAvailable: false,
      }),
    ).toMatchObject({
      active: "webgl2",
      fallbackAvailable: true,
      depthBufferStrategy: "standard",
    });
    expect(
      resolveRendererBackendCapabilities({
        webgpuAvailable: false,
        webgl2Available: false,
        reversedDepthBufferAvailable: true,
      }),
    ).toMatchObject({
      active: "unavailable",
      reversedDepthBufferAvailable: false,
      depthBufferStrategy: "standard",
    });
  });
});
