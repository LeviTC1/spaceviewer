import { DESI_LIGHTCONE_CATALOG_METADATA } from "../../../lib/catalog/desiLightconeCatalog";
import type { SkyLayerData, SkyLayerDefinition } from "../core/layers";
import type { CosmologicalFeatureSkyObject } from "../core/objects";
import type { SkyLayerRenderer, SkyMeshRenderable, SkyStructureRenderable } from "../core/renderers";

export const COSMOLOGICAL_STRUCTURE_LAYER_ID = "cosmological.large-scale-structure";
export const COSMOLOGICAL_STRUCTURE_VERSION = "desi-dr1-bgs-bright-21.5-lightcone-v1";

const metadata = DESI_LIGHTCONE_CATALOG_METADATA;
const footprint = metadata.selection.skyFootprint;
const maximumDistanceSceneUnits = metadata.coordinates.distanceRangeMpc.maximum * metadata.coordinates.sceneUnitsPerMpc;
const surveyMidpointSceneUnits =
  ((metadata.coordinates.distanceRangeMpc.minimum + metadata.coordinates.distanceRangeMpc.maximum) / 2) *
  metadata.coordinates.sceneUnitsPerMpc;

export const COSMOLOGICAL_STRUCTURE_MODEL = {
  center: { x: 150, y: 12, z: -22 },
  radiusSceneUnits: maximumDistanceSceneUnits,
  sceneUnitsPerMpc: metadata.coordinates.sceneUnitsPerMpc,
  tracerCount: metadata.binary.recordCount,
  fallbackSeed: 641006,
  fallbackNodeCount: 32,
  coordinateConvention: "observer-centred-redshift-space-comoving-cartesian" as const,
  status: "catalog-derived" as const,
  placementNote:
    `Observer-centred redshift-space positions for ${metadata.binary.recordCount.toLocaleString()} measured DESI DR1 galaxies. ` +
    "Angular coordinates are ICRS; comoving radius is inferred from spectroscopic redshift under the declared flat Lambda-CDM reference. The local scene basis and scale are a display transform only.",
};

const cosmologicalPosition = () => ({
  mode: "cartesian" as const,
  frame: "scene-cartesian" as const,
  unit: "scene-unit" as const,
  ...COSMOLOGICAL_STRUCTURE_MODEL.center,
  epoch: { kind: "static" as const },
});

export const COSMOLOGICAL_STRUCTURE_OBJECTS: CosmologicalFeatureSkyObject[] = [
  {
    id: "cosmological:observable-universe-model",
    kind: "cosmological-feature",
    name: "DESI DR1 measured galaxy light cone",
    position: cosmologicalPosition(),
    epoch: { kind: "static" },
    provenance: [
      {
        source: "DESI Collaboration",
        catalog: metadata.selection.sourceSample,
        sourceId: metadata.catalog.id,
        confidence: "catalog",
        url: metadata.catalog.sourceUrl,
      },
      {
        source: "DESI Collaboration",
        catalog: metadata.catalog.samplePaper,
        sourceId: metadata.catalog.samplePaperDoi,
        confidence: "derived",
        url: metadata.catalog.samplePaperUrl,
      },
    ],
    visual: { color: "#8edcff", brightness: 0.68, pointSize: 1.7, labelPriority: 97 },
    search: {
      aliases: ["Observable Universe", "Cosmic web", "Large-scale structure", "DESI light cone", "BGS DR1"],
      tags: ["cosmological", "cosmic-web", "large-scale-structure", "redshift-survey", "DESI", "catalog-derived"],
      description: `${metadata.binary.recordCount.toLocaleString()} measured DESI DR1 BGS galaxies in a selection-aware redshift-space light cone.`,
      keywords: ["observable universe", "cosmic web", "galaxies", "redshift", "DESI", "BGS", "large-scale structure"],
    },
    scientific: {
      featureClass: "redshift-survey-lightcone",
      coordinateConvention: "observer-centred-redshift-space-comoving-cartesian",
      cosmology: `${metadata.coordinates.cosmology.name}; H0 ${metadata.coordinates.cosmology.h0KmSPerMpc} km/s/Mpc, Omega_m ${metadata.coordinates.cosmology.omegaM}`,
      tracerCount: metadata.binary.recordCount,
      redshiftRange: { minimum: footprint.redshiftMin, maximum: footprint.redshiftMax },
      skyFootprint: `ICRS RA ${footprint.raMinDeg}–${footprint.raMaxDeg} deg; Dec ${footprint.decMinDeg}–${footprint.decMaxDeg} deg`,
      selectionBoundary: metadata.selection.selectionBoundary,
      uncertaintyBoundary: `${metadata.uncertainty.sourceBoundary} ${metadata.uncertainty.systematicBoundary}`,
      manifestUrl: "/catalogs/desi-lightcone/manifest.json",
      licenceBoundary: `${metadata.catalog.licenceId}; DESI attribution and acknowledgment required.`,
      modelStatus: "catalog-derived",
      mapPlacementNote: COSMOLOGICAL_STRUCTURE_MODEL.placementNote,
      facts: [
        "Every displayed source is a measured galaxy from the DESI DR1 LSS clustering catalogue; no procedural galaxies or nearest-neighbour filaments are added.",
        "Completeness, imaging-systematics, redshift-failure, and FKP weights are preserved in the binary but are not used to alter marker brightness.",
        metadata.coordinates.interpretationBoundary,
      ],
    },
    time: {
      behavior: "static",
      model: COSMOLOGICAL_STRUCTURE_VERSION,
      note: "A frozen DR1 survey light cone. Redshift supplies radial position and lookback context; expansion is not animated.",
    },
    importance: { score: 99, tier: "landmark", reasons: ["cosmological scale anchor", "measured redshift survey"] },
  },
];

const renderer: SkyLayerRenderer<CosmologicalFeatureSkyObject> = {
  strategy: "point-cloud",
  buildRenderables: (objects, context) => {
    const distantOverview = context.viewport.cameraDistance >= 138;
    return objects.flatMap((object): Array<SkyStructureRenderable | SkyMeshRenderable> => {
      const position = context.projectPosition(object.position);
      if (!position) return [];
      const featured = context.featuredObjectIds.has(object.id);
      if (!distantOverview && !featured) return [];
      return [
        {
          kind: "structure",
          id: `${COSMOLOGICAL_STRUCTURE_LAYER_ID}:lightcone`,
          layerId: COSMOLOGICAL_STRUCTURE_LAYER_ID,
          objectId: object.id,
          position,
          label: object.name,
          opacity: featured ? 0.92 : 0.62,
          lodTier: "desi-dr1-measured-lightcone",
          sourceChunkId: "desi-dr1-bgs-bright-21.5",
          structureMetadata: {
            shape: "desi-redshift-lightcone",
            radiusSceneUnits: COSMOLOGICAL_STRUCTURE_MODEL.radiusSceneUnits,
            sceneUnitsPerMpc: COSMOLOGICAL_STRUCTURE_MODEL.sceneUnitsPerMpc,
            tracerCount: COSMOLOGICAL_STRUCTURE_MODEL.tracerCount,
            redshiftMin: footprint.redshiftMin,
            redshiftMax: footprint.redshiftMax,
            raMinDeg: footprint.raMinDeg,
            raMaxDeg: footprint.raMaxDeg,
            decMinDeg: footprint.decMinDeg,
            decMaxDeg: footprint.decMaxDeg,
            fallbackSeed: COSMOLOGICAL_STRUCTURE_MODEL.fallbackSeed,
            fallbackNodeCount: COSMOLOGICAL_STRUCTURE_MODEL.fallbackNodeCount,
            manifestUrl: "/catalogs/desi-lightcone/manifest.json",
            coordinateConvention: COSMOLOGICAL_STRUCTURE_MODEL.coordinateConvention,
            modelStatus: COSMOLOGICAL_STRUCTURE_MODEL.status,
          },
        },
        {
          kind: "mesh",
          id: `${COSMOLOGICAL_STRUCTURE_LAYER_ID}:observer-origin`,
          layerId: COSMOLOGICAL_STRUCTURE_LAYER_ID,
          objectId: object.id,
          position: { ...position, z: position.z + surveyMidpointSceneUnits },
          label: "DESI survey-volume midpoint",
          radiusSceneUnits: featured ? 0.62 : 0.42,
          focusRadiusSceneUnits: COSMOLOGICAL_STRUCTURE_MODEL.radiusSceneUnits * 0.58,
          color: "#d7f5ff",
          opacity: 0.42,
          labelPriority: 97,
          interactive: true,
          lodTier: "redshift-survey-origin",
          sourceChunkId: "desi-dr1-bgs-bright-21.5",
          meshMetadata: { family: "galactic-structure", shape: "sphere" },
        },
      ];
    });
  },
};

export const COSMOLOGICAL_STRUCTURE_LAYER: SkyLayerDefinition<CosmologicalFeatureSkyObject> = {
  id: COSMOLOGICAL_STRUCTURE_LAYER_ID,
  label: "DESI DR1 galaxy light cone",
  description: `${metadata.binary.recordCount.toLocaleString()} measured BGS galaxies with published LSS selection weights and explicit redshift-space boundaries.`,
  objectKinds: ["cosmological-feature"],
  defaultVisible: true,
  order: 70,
  status: "active",
  rendererRole: "points",
  capabilities: { selectable: true, hoverable: true, labels: true, searchable: true },
  time: {
    behavior: "static",
    cadence: "never",
    model: COSMOLOGICAL_STRUCTURE_VERSION,
    description: "Static DESI DR1 redshift survey light cone; no invented filaments or time evolution.",
  },
  renderer,
};

export const createCosmologicalStructureLayerData = (): SkyLayerData<CosmologicalFeatureSkyObject> => ({
  layerId: COSMOLOGICAL_STRUCTURE_LAYER_ID,
  objects: COSMOLOGICAL_STRUCTURE_OBJECTS,
  status: "ready",
  version: COSMOLOGICAL_STRUCTURE_VERSION,
  chunks: [
    {
      id: "desi-dr1-bgs-bright-21.5",
      label: "DESI DR1 BGS_BRIGHT-21.5 measured redshift strip",
      objectIds: COSMOLOGICAL_STRUCTURE_OBJECTS.map((object) => object.id),
      objectCount: metadata.binary.recordCount,
      status: "ready",
      importanceTier: "background",
      bounds: {
        frame: "scene-cartesian",
        center: { ...COSMOLOGICAL_STRUCTURE_MODEL.center, unit: "scene-unit", sourceFrame: "scene-cartesian" },
        radius: COSMOLOGICAL_STRUCTURE_MODEL.radiusSceneUnits,
        unit: "scene-unit",
      },
    },
  ],
  metrics: { totalObjects: 1, searchableObjects: 1, chunkCount: 1 },
});
