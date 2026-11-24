import type { SkyLayerData, SkyLayerDefinition } from "../core/layers";
import type { GalacticFeatureSkyObject } from "../core/objects";
import type { SkyLayerRenderer, SkyMeshRenderable, SkyStructureRenderable } from "../core/renderers";
import { MILKY_WAY_CATALOG_METADATA } from "../../../lib/catalog/milkyWayTracerCatalog";

export const GALACTIC_STRUCTURE_LAYER_ID = "galactic.milky-way-structure";
export const GALACTIC_STRUCTURE_VERSION = `milky-way-${MILKY_WAY_CATALOG_METADATA.catalog.version}-binary-v1`;

export const GALACTIC_STRUCTURE_MODEL = {
  galactocentricSunDistanceKpc: MILKY_WAY_CATALOG_METADATA.transform.galactocentricSunDistanceKpc,
  modelRadiusKpc: 16,
  innerArmRadiusKpc: 2.8,
  fallbackArmCount: 4,
  fallbackPitchAngleDeg: 13,
  sceneUnitsPerKpc: 4.15,
  centerSceneX: -MILKY_WAY_CATALOG_METADATA.transform.galactocentricSunDistanceKpc * 4.15,
  fallbackThicknessKpc: 1.01,
  tracerCount: MILKY_WAY_CATALOG_METADATA.build.recordCount,
  fittedSegmentCount: MILKY_WAY_CATALOG_METADATA.build.fittedSegmentCount,
  status: "catalog-derived" as const,
  placementNote:
    "Sun-relative Galactic Cartesian scene. Bright markers are measured VLBI maser tracers at nominal reciprocal-parallax distances; diffuse corridors are fitted arm segments only across their measured beta ranges.",
};

const galacticPosition = (x: number, y: number, z: number) => ({
  mode: "cartesian" as const,
  frame: "galactic" as const,
  unit: "scene-unit" as const,
  x,
  y,
  z,
  epoch: { kind: "static" as const },
});

const commonProvenance = [
  {
    source: "Reid et al. VLBI maser catalogue",
    catalog: "VizieR J/ApJ/885/131",
    sourceId: `${MILKY_WAY_CATALOG_METADATA.build.recordCount} measured high-mass star-forming-region tracers`,
    confidence: "catalog" as const,
    url: MILKY_WAY_CATALOG_METADATA.catalog.catalogUrl,
  },
  {
    source: "Reid et al. Milky Way spiral-arm fit",
    catalog: "ApJ 885, 131 (2019), Table 2",
    sourceId: "seven fitted arm segments with published marginal parameter errors and intrinsic widths",
    confidence: "derived" as const,
    url: MILKY_WAY_CATALOG_METADATA.catalog.articleUrl,
  },
];

export const GALACTIC_STRUCTURE_OBJECTS: GalacticFeatureSkyObject[] = [
  {
    id: "galactic:milky-way-structure",
    kind: "galactic-feature",
    name: "Milky Way structure model",
    position: galacticPosition(GALACTIC_STRUCTURE_MODEL.centerSceneX, 0, 0),
    epoch: { kind: "static" },
    provenance: commonProvenance,
    visual: { color: "#a9c7ff", brightness: 0.52, pointSize: 2.2, labelPriority: 98 },
    search: {
      aliases: ["Milky Way", "Galaxy structure", "Galactic disk"],
      tags: ["galactic", "milky-way", "spiral-arms", "scientific-visualization"],
      description: "A measured VLBI maser tracer map with uncertainty-bearing Reid et al. spiral-arm fits and an explicit schematic fallback.",
      keywords: ["Milky Way", "galactic center", "spiral arm", "solar position", "disk"],
    },
    scientific: {
      featureClass: "galaxy-model",
      modelRadiusKpc: GALACTIC_STRUCTURE_MODEL.modelRadiusKpc,
      tracerCount: GALACTIC_STRUCTURE_MODEL.tracerCount,
      fittedSegmentCount: GALACTIC_STRUCTURE_MODEL.fittedSegmentCount,
      lowSignalTracerCount: MILKY_WAY_CATALOG_METADATA.uncertainty.lowSignalCount,
      modelStatus: "catalog-derived",
      selectionBoundary: MILKY_WAY_CATALOG_METADATA.selection.populationBoundary,
      uncertaintyModel: MILKY_WAY_CATALOG_METADATA.uncertainty.distanceVisualization,
      manifestUrl: "/catalogs/milky-way/manifest.json",
      licenceBoundary: MILKY_WAY_CATALOG_METADATA.catalog.licenceSummary,
      mapPlacementNote: GALACTIC_STRUCTURE_MODEL.placementNote,
      facts: [
        `The fitted model places the Sun ${GALACTIC_STRUCTURE_MODEL.galactocentricSunDistanceKpc.toFixed(2)} kpc from the Galactic centre.`,
        "Bright points are measured tracers. Diffuse arm corridors are density cues sampled from the fitted central values and intrinsic 1-sigma widths, not additional stars.",
        MILKY_WAY_CATALOG_METADATA.uncertainty.distanceCaveat,
      ],
    },
    relations: [{ type: "hosts", targetId: "galactic:solar-location", label: "Contains the modeled Solar location" }],
    time: {
      behavior: "static",
      model: GALACTIC_STRUCTURE_VERSION,
      note: "Static structural model; Galactic rotation and time evolution are not simulated.",
    },
    importance: { score: 100, tier: "landmark", reasons: ["galactic scale anchor", "measured tracer catalogue"] },
  },
  {
    id: "galactic:solar-location",
    kind: "galactic-feature",
    name: "Solar location in the Milky Way",
    position: galacticPosition(0, 0, 0),
    epoch: { kind: "static" },
    provenance: [commonProvenance[0]],
    visual: { color: "#ffd27a", brightness: 1, pointSize: 0.7, labelPriority: 96 },
    search: {
      aliases: ["Sun in Milky Way", "Solar galactic location", "You are here"],
      tags: ["galactic", "solar-location", "milky-way"],
      description: `Sun-relative origin located ${GALACTIC_STRUCTURE_MODEL.galactocentricSunDistanceKpc.toFixed(2)} kpc from the Galactic centre in the Reid et al. model.`,
    },
    scientific: {
      featureClass: "solar-location",
      galactocentricRadiusKpc: GALACTIC_STRUCTURE_MODEL.galactocentricSunDistanceKpc,
      modelStatus: "catalog-derived",
      mapPlacementNote: GALACTIC_STRUCTURE_MODEL.placementNote,
      facts: ["This renderer marker is the origin of the local stellar and Solar context."],
    },
    relations: [
      { type: "part-of", targetId: "galactic:milky-way-structure", label: "Located within the Milky Way model" },
      { type: "hosts", targetId: "solar:sun", label: "Links to the Solar Explorer origin" },
    ],
    time: { behavior: "static", model: GALACTIC_STRUCTURE_VERSION, note: "Static location marker." },
    importance: { score: 98, tier: "landmark", reasons: ["cross-scale origin", "measured centre distance"] },
  },
];

const renderer: SkyLayerRenderer<GalacticFeatureSkyObject> = {
  strategy: "procedural-volume",
  buildRenderables: (objects, context) => {
    const wideField = context.viewport.cameraDistance >= 88;
    return objects.flatMap((object): Array<SkyStructureRenderable | SkyMeshRenderable> => {
      const position = context.projectPosition(object.position);
      if (!position) return [];
      const featured = context.featuredObjectIds.has(object.id);
      if (!wideField && !featured) return [];

      if (object.id === "galactic:milky-way-structure") {
        return [
          {
            kind: "structure",
            id: `${GALACTIC_STRUCTURE_LAYER_ID}:volume`,
            layerId: GALACTIC_STRUCTURE_LAYER_ID,
            objectId: object.id,
            position,
            label: object.name,
            opacity: featured ? 0.78 : 0.56,
            lodTier: wideField ? "galactic-structure" : "focused-only",
            sourceChunkId: "reid2019-vlbi-masers",
            structureMetadata: {
              shape: "milky-way-catalogue",
              radiusSceneUnits: GALACTIC_STRUCTURE_MODEL.modelRadiusKpc * GALACTIC_STRUCTURE_MODEL.sceneUnitsPerKpc,
              sceneUnitsPerKpc: GALACTIC_STRUCTURE_MODEL.sceneUnitsPerKpc,
              galactocentricSunDistanceKpc: GALACTIC_STRUCTURE_MODEL.galactocentricSunDistanceKpc,
              tracerCount: GALACTIC_STRUCTURE_MODEL.tracerCount,
              fittedSegmentCount: GALACTIC_STRUCTURE_MODEL.fittedSegmentCount,
              fallbackArmCount: GALACTIC_STRUCTURE_MODEL.fallbackArmCount,
              fallbackPitchAngleDeg: GALACTIC_STRUCTURE_MODEL.fallbackPitchAngleDeg,
              fallbackInnerRadiusKpc: GALACTIC_STRUCTURE_MODEL.innerArmRadiusKpc,
              fallbackThicknessKpc: GALACTIC_STRUCTURE_MODEL.fallbackThicknessKpc,
              seed: 1788,
              manifestUrl: "/catalogs/milky-way/manifest.json",
              modelStatus: GALACTIC_STRUCTURE_MODEL.status,
            },
          },
          {
            kind: "mesh",
            id: `${GALACTIC_STRUCTURE_LAYER_ID}:center-marker`,
            layerId: GALACTIC_STRUCTURE_LAYER_ID,
            objectId: object.id,
            position,
            label: "Galactic centre",
            radiusSceneUnits: featured ? 1.9 : 1.2,
            color: "#ffd19a",
            opacity: 0.82,
            labelPriority: 98,
            interactive: true,
            lodTier: "galactic-center",
            sourceChunkId: "reid2019-vlbi-masers",
            meshMetadata: { family: "galactic-structure", shape: "sphere" },
          },
        ];
      }

      return [
        {
          kind: "mesh",
          id: `${GALACTIC_STRUCTURE_LAYER_ID}:solar-location`,
          layerId: GALACTIC_STRUCTURE_LAYER_ID,
          objectId: object.id,
          position,
          label: object.name,
          radiusSceneUnits: featured ? 0.95 : 0.62,
          color: "#ffd27a",
          opacity: 0.95,
          labelPriority: 96,
          interactive: true,
          lodTier: "galactic-reference",
          sourceChunkId: "reid2019-vlbi-masers",
          meshMetadata: { family: "galactic-structure", shape: "sphere" },
        },
      ];
    });
  },
};

export const GALACTIC_STRUCTURE_LAYER: SkyLayerDefinition<GalacticFeatureSkyObject> = {
  id: GALACTIC_STRUCTURE_LAYER_ID,
  label: "Milky Way structure",
  description: "Measured VLBI maser tracers, uncertainty spans, and seven fitted Reid et al. arm segments with an explicit fallback.",
  objectKinds: ["galactic-feature"],
  defaultVisible: true,
  order: 24,
  status: "active",
  rendererRole: "points",
  capabilities: { selectable: true, hoverable: true, labels: true, searchable: true },
  time: {
    behavior: "static",
    cadence: "never",
    model: GALACTIC_STRUCTURE_VERSION,
    description: "Static 2019 tracer catalogue and fitted arm geometry; it does not model Galactic rotation.",
  },
  renderer,
};

export const createGalacticStructureLayerData = (): SkyLayerData<GalacticFeatureSkyObject> => ({
  layerId: GALACTIC_STRUCTURE_LAYER_ID,
  objects: GALACTIC_STRUCTURE_OBJECTS,
  status: "ready",
  version: GALACTIC_STRUCTURE_VERSION,
  chunks: [
    {
      id: "reid2019-vlbi-masers",
      label: "Reid et al. 2019 VLBI masers and arm fits",
      objectIds: GALACTIC_STRUCTURE_OBJECTS.map((object) => object.id),
      objectCount: MILKY_WAY_CATALOG_METADATA.build.recordCount,
      status: "ready",
      importanceTier: "core",
      bounds: {
        frame: "galactic",
        center: {
          x: GALACTIC_STRUCTURE_MODEL.centerSceneX,
          y: 0,
          z: 0,
          unit: "scene-unit",
          sourceFrame: "galactic",
        },
        radius: GALACTIC_STRUCTURE_MODEL.modelRadiusKpc * GALACTIC_STRUCTURE_MODEL.sceneUnitsPerKpc,
        unit: "scene-unit",
      },
    },
  ],
  metrics: {
    totalObjects: GALACTIC_STRUCTURE_OBJECTS.length,
    searchableObjects: GALACTIC_STRUCTURE_OBJECTS.length,
    chunkCount: 1,
    maxDistance: GALACTIC_STRUCTURE_MODEL.modelRadiusKpc,
  },
});
