import type { ExoplanetCatalogManifest, ExoplanetCatalogSystem } from "../../../lib/catalog/exoplanetCatalog";
import type { SkyLayerChunk, SkyLayerData, SkyLayerDefinition } from "../core/layers";
import type { ExoplanetSystemSkyObject } from "../core/objects";
import type { SkyLayerRenderer, SkyPointRenderable } from "../core/renderers";

export const EXOPLANET_SYSTEMS_LAYER_ID = "stellar.exoplanet-systems";
export const EXOPLANET_CATALOG_MANIFEST_URL = "/catalogs/exoplanets/manifest.json";

const importanceFor = (system: ExoplanetCatalogSystem) => {
  const nearby = Math.max(0, 24 - system.distancePc * 0.55);
  const multiplicity = Math.min(20, system.planets.length * 3);
  const parameterCoverage = (system.stellarTemperatureK ? 4 : 0) + (system.spectralType ? 3 : 0);
  return Math.max(48, Math.min(98, Math.round(50 + nearby + multiplicity + parameterCoverage)));
};

export const createExoplanetSystemObject = (
  system: ExoplanetCatalogSystem,
  manifest: ExoplanetCatalogManifest,
): ExoplanetSystemSkyObject => {
  const importance = importanceFor(system);
  const planetNames = system.planets.map((planet) => planet.name);
  const discoveryMethods = Array.from(new Set(
    system.planets.map((planet) => planet.discoveryMethod).filter((method): method is string => Boolean(method)),
  ));
  return {
    id: system.id,
    kind: "exoplanet-system",
    name: `${system.hostName} system`,
    position: {
      mode: "cartesian",
      frame: "heliocentric-icrs-cartesian",
      unit: "light-year",
      ...system.positionLy,
      epoch: { kind: "static" },
    },
    epoch: { kind: "static" },
    provenance: [{
      source: "NASA Exoplanet Archive",
      catalog: "Planetary Systems Composite Parameters (PSCompPars)",
      retrievedAt: manifest.catalog.retrievedAt,
      confidence: "catalog",
      url: manifest.catalog.tapUrl,
    }, ...(system.gaiaDr3Crossmatch ? [{
      source: "ESA Gaia Data Release 3",
      catalog: system.gaiaDr3Crossmatch.gaiaCatalogVersion,
      sourceId: system.gaiaDr3Crossmatch.sourceId,
      confidence: "catalog" as const,
      url: "https://gea.esac.esa.int/archive/documentation/GDR3/",
    }] : [])],
    visual: {
      color: "#8fffe0",
      brightness: 0.74,
      pointSize: 1,
      labelPriority: importance,
    },
    search: {
      aliases: Array.from(new Set([system.hostName, ...planetNames, ...system.aliases])),
      tags: [
        "exoplanet",
        "confirmed planet",
        "planetary system",
        "nearby star",
        "NASA Exoplanet Archive",
        ...(system.gaiaDr3Crossmatch ? ["exact Gaia DR3 host match"] : []),
        ...discoveryMethods,
      ],
      keywords: [system.hostName, ...planetNames, ...system.aliases, ...discoveryMethods],
      description: `${system.planets.length} confirmed exoplanet${system.planets.length === 1 ? "" : "s"} around ${system.hostName}, ${system.distancePc.toFixed(2)} pc away.`,
    },
    scientific: {
      hostName: system.hostName,
      planetCount: system.planets.length,
      planets: system.planets,
      raDeg: system.raDeg,
      decDeg: system.decDeg,
      distancePc: system.distancePc,
      distanceLy: system.distanceLy,
      distanceErrorPlusPc: system.distanceErrorPlusPc,
      distanceErrorMinusPc: system.distanceErrorMinusPc,
      apparentMagnitudeV: system.apparentMagnitudeV,
      apparentMagnitudeK: system.apparentMagnitudeK,
      stellarTemperatureK: system.stellarTemperatureK,
      stellarTemperatureErrorPlusK: system.stellarTemperatureErrorPlusK,
      stellarTemperatureErrorMinusK: system.stellarTemperatureErrorMinusK,
      spectralType: system.spectralType,
      sourceRelease: manifest.catalog.version,
      selectionBoundary: manifest.selection.boundary,
      parameterBoundary: manifest.parameters.boundary,
      mapPlacementNote: manifest.coordinates.placementBoundary,
      manifestUrl: EXOPLANET_CATALOG_MANIFEST_URL,
      gaiaDr3Crossmatch: system.gaiaDr3Crossmatch,
    },
    relations: system.gaiaDr3Crossmatch ? [{
      type: "part-of",
      targetId: system.gaiaDr3Crossmatch.rendererObjectId,
      label: `Exact Gaia DR3 host: ${system.hostName}`,
    }] : undefined,
    importance: {
      score: importance,
      tier: importance >= 90 ? "landmark" : importance >= 74 ? "notable" : "context",
      reasons: [
        "confirmed-planet host",
        system.planets.length > 1 ? "multi-planet system" : "nearby system",
        system.gaiaDr3Crossmatch ? "exact Gaia DR3 source-ID match" : "catalog-derived ICRS position",
      ],
    },
    time: {
      behavior: "static",
      model: "NASA-Exoplanet-Archive-PSCompPars-host-position",
      note: manifest.coordinates.placementBoundary,
    },
  };
};

const renderer: SkyLayerRenderer<ExoplanetSystemSkyObject> = {
  strategy: "point-cloud",
  buildRenderables: (objects, context) => objects.flatMap((object): SkyPointRenderable[] => {
    const position = context.projectPosition(object.position);
    if (!position) return [];
    return [{
      kind: "point",
      id: `${EXOPLANET_SYSTEMS_LAYER_ID}:${object.id}`,
      layerId: EXOPLANET_SYSTEMS_LAYER_ID,
      objectId: object.id,
      position,
      label: object.name,
      color: object.visual?.color,
      brightness: object.visual?.brightness,
      labelPriority: object.visual?.labelPriority,
      interactive: true,
      lodTier: "nearby-confirmed-systems",
      sourceChunkId: `ra-${String(Math.floor(object.scientific.raDeg / 30)).padStart(2, "0")}`,
      importanceScore: object.importance?.score,
      pointMetadata: {
        spectralType: object.scientific.spectralType,
        temperatureK: object.scientific.stellarTemperatureK,
        distanceLy: object.scientific.distanceLy,
        apparentMagnitude: object.scientific.apparentMagnitudeV,
      },
    }];
  }),
};

export const EXOPLANET_SYSTEMS_LAYER: SkyLayerDefinition<ExoplanetSystemSkyObject> = {
  id: EXOPLANET_SYSTEMS_LAYER_ID,
  label: "Nearby exoplanet systems",
  description: "Confirmed NASA Exoplanet Archive systems within 100 pc, progressively streamed in ICRS sectors.",
  objectKinds: ["exoplanet-system"],
  defaultVisible: true,
  order: 12,
  status: "active",
  rendererRole: "points",
  capabilities: { selectable: true, hoverable: true, labels: true, searchable: true, streaming: true },
  time: {
    behavior: "static",
    cadence: "never",
    model: "NASA-Exoplanet-Archive-PSCompPars-host-position",
    description: "Host positions are static at this scale; planetary orbits are not resolved or propagated.",
  },
  renderer,
};

export const createExoplanetSystemsLayerData = (
  systems: ExoplanetCatalogSystem[],
  manifest: ExoplanetCatalogManifest | null,
  loadedChunkIds: readonly string[],
  status: "idle" | "loading" | "ready" | "error",
  error: string | null,
): SkyLayerData<ExoplanetSystemSkyObject> => {
  const objects = manifest ? systems.map((system) => createExoplanetSystemObject(system, manifest)) : [];
  const objectIdsByChunk = new Map<string, string[]>();
  objects.forEach((object) => {
    const id = `ra-${String(Math.floor(object.scientific.raDeg / 30)).padStart(2, "0")}`;
    objectIdsByChunk.set(id, [...(objectIdsByChunk.get(id) ?? []), object.id]);
  });
  const loaded = new Set(loadedChunkIds);
  const chunks: SkyLayerChunk[] = manifest?.chunks.map((chunk) => ({
    id: chunk.id,
    label: chunk.label,
    objectIds: objectIdsByChunk.get(chunk.id) ?? [],
    objectCount: objectIdsByChunk.get(chunk.id)?.length ?? 0,
    status: loaded.has(chunk.id) ? "ready" : status === "loading" ? "loading" : "staged",
    importanceTier: "context",
  })) ?? [];
  return {
    layerId: EXOPLANET_SYSTEMS_LAYER_ID,
    objects,
    status: objects.length ? "ready" : status === "error" ? "error" : "loading",
    version: manifest?.catalog.version,
    chunks,
    metrics: {
      totalObjects: objects.length,
      searchableObjects: objects.length,
      chunkCount: chunks.length,
      maxDistance: manifest ? manifest.selection.distanceRangePc.maximum * 3.2615637771674333 : undefined,
    },
    error: error ?? undefined,
  };
};
