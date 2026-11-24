import generatedCatalog from "../../../generated/constellationBoundaries.generated.json";
import type { SceneVector3 } from "../core/coordinates";
import type { CelestialOverlaySkyObject } from "../core/objects";

export const CONSTELLATION_BOUNDARY_CATALOG_VERSION = generatedCatalog.catalog.version;
export const CONSTELLATION_BOUNDARY_SOURCE_URL = generatedCatalog.catalog.sourcePageUrl;
export const CONSTELLATION_BOUNDARY_DISPLAY_RADIUS = generatedCatalog.projectionBoundary.displayRadiusSceneUnits;
export const CONSTELLATION_BOUNDARY_PATHS: SceneVector3[][] = generatedCatalog.boundarySegments.map((segment) =>
  segment.sceneVectors.map((vector) => ({
    ...vector,
    unit: "scene-unit",
    sourceFrame: "equatorial-j2000",
  })),
);

export const CONSTELLATION_BOUNDARY_OVERLAY: CelestialOverlaySkyObject = {
  id: "overlay:iau-constellation-boundaries-j2000",
  kind: "celestial-overlay",
  name: "IAU constellation boundaries",
  position: {
    mode: "cartesian",
    frame: "scene-cartesian",
    unit: "scene-unit",
    x: 0,
    y: 0,
    z: 0,
    epoch: { kind: "julian-year", value: 2000 },
  },
  epoch: { kind: "julian-year", value: 2000 },
  provenance: [{
    source: generatedCatalog.catalog.sourceName,
    catalog: generatedCatalog.catalog.title,
    sourceId: generatedCatalog.catalog.id,
    retrievedAt: generatedCatalog.catalog.retrievedAt,
    confidence: "catalog",
    url: generatedCatalog.catalog.sourcePageUrl,
  }],
  visual: {
    color: "#72d7ff",
    brightness: 0.42,
  },
  scientific: {
    featureClass: "iau-constellation-boundaries",
    referenceEpoch: "J2000",
    constellationCount: generatedCatalog.build.constellationCount,
    regionPathCount: generatedCatalog.build.regionPathCount,
    sourceVertexCount: generatedCatalog.build.sourceVertexCount,
    uniqueBoundarySegmentCount: generatedCatalog.build.uniqueBoundarySegmentCount,
    modelStatus: "catalog-derived",
    facts: [
      "The International Astronomical Union divides the entire sky into 88 official constellation regions.",
      "These are official area boundaries, not invented stick-figure artwork or mythological illustrations.",
      `${generatedCatalog.build.sharedBoundarySegmentCount.toLocaleString()} shared edges are deduplicated before rendering.`,
    ],
    mapPlacementNote: generatedCatalog.projectionBoundary.note,
  },
  time: {
    behavior: "static",
    model: "official-iau-j2000-equatorial-boundaries",
    note: "The overlay uses the published J2000 boundary coordinates and does not precess with playback time.",
  },
};

export const CONSTELLATION_BOUNDARY_CATALOG_METADATA = generatedCatalog;
