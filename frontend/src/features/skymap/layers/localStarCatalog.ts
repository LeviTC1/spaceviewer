import type { NearbyStar } from "../../../data/nearbyStars";
import { getStarColor } from "../../starmap/starRenderer";
import type { SkyLayerChunk, SkyLayerDataMetrics } from "../core/layers";
import type { StarSkyObject } from "../core/objects";
import type { StarCatalogChunkTier } from "./starLod";

export interface LocalStarCatalogChunkDefinition {
  id: string;
  label: string;
  maxDistanceLy: number;
  importanceTier: StarCatalogChunkTier;
}

export interface LocalStarCatalogSnapshot {
  objects: StarSkyObject[];
  chunks: SkyLayerChunk[];
  metrics: SkyLayerDataMetrics;
  version: string;
}

export const LOCAL_STAR_CATALOG_VERSION = "nearby-stars-seed-v2";

export const LOCAL_STAR_CHUNK_DEFINITIONS: LocalStarCatalogChunkDefinition[] = [
  {
    id: "local-core-12ly",
    label: "Local core",
    maxDistanceLy: 12,
    importanceTier: "core",
  },
  {
    id: "local-context-25ly",
    label: "Nearby context",
    maxDistanceLy: 25,
    importanceTier: "context",
  },
  {
    id: "local-background-90ly",
    label: "Local background",
    maxDistanceLy: 90,
    importanceTier: "background",
  },
];

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

export const getLocalStarChunkDefinition = (distanceLy: number) =>
  LOCAL_STAR_CHUNK_DEFINITIONS.find((chunk) => distanceLy <= chunk.maxDistanceLy) ??
  LOCAL_STAR_CHUNK_DEFINITIONS[LOCAL_STAR_CHUNK_DEFINITIONS.length - 1];

export const getStarBrightnessValue = (distanceLy = 0, luminositySolar = 0) => {
  const distance = Math.max(0.001, distanceLy);
  const luminosity = luminositySolar;
  return Math.min(1, Math.max(0.085, Math.log10((luminosity / (distance * distance + 1)) * 2200 + 1) / 2.3));
};

export const nearbyStarToSkyObject = (star: NearbyStar): StarSkyObject => {
  const spectralType = star.spectralType.trim();
  const color = `#${getStarColor(spectralType, star.temperature).getHexString()}`;
  const chunk = getLocalStarChunkDefinition(star.distanceLy);

  return {
    id: `star:nearby:${slugify(star.name)}`,
    kind: "star",
    name: star.name,
    position: {
      mode: "cartesian",
      frame: "local-interstellar-cartesian",
      unit: "light-year",
      x: star.x,
      y: star.y,
      z: star.z,
      epoch: { kind: "static" },
    },
    epoch: { kind: "static" },
    provenance: [
      {
        source: "SpaceViewer nearby star seed dataset",
        catalog: "frontend/src/data/nearbyStars.ts",
        sourceId: star.name,
        confidence: "seed",
      },
    ],
    visual: {
      color,
      brightness: getStarBrightnessValue(star.distanceLy, star.luminosity),
      labelPriority: star.name === "Sun" ? 100 : star.luminosity > 10 ? 80 : star.distanceLy < 12 ? 60 : 30,
    },
    search: {
      aliases: [],
      tags: ["star", "nearby", spectralType.charAt(0).toLowerCase(), chunk.id],
      description: `${star.name} in the local stellar preview dataset.`,
      keywords: [star.name, spectralType, "nearby star", chunk.label],
    },
    scientific: {
      spectralType,
      luminositySolar: star.luminosity,
      temperatureK: star.temperature,
      distanceLy: star.distanceLy,
    },
    time: {
      behavior: "static",
      model: "seed-local-stars-static",
      note: "Nearby stars are treated as fixed for this SkyMap stage; proper motion is intentionally deferred.",
    },
  };
};

const createCatalogChunks = (objects: StarSkyObject[]): SkyLayerChunk[] =>
  LOCAL_STAR_CHUNK_DEFINITIONS.map((definition) => {
    const chunkObjects = objects.filter((object) => {
      const distance = object.scientific.distanceLy ?? 0;
      return getLocalStarChunkDefinition(distance).id === definition.id;
    });

    return {
      id: definition.id,
      label: definition.label,
      objectIds: chunkObjects.map((object) => object.id),
      objectCount: chunkObjects.length,
      status: "ready",
      importanceTier: definition.importanceTier,
      bounds: {
        frame: "local-interstellar-cartesian",
        center: {
          x: 0,
          y: 0,
          z: 0,
          unit: "scene-unit",
          sourceFrame: "local-interstellar-cartesian",
        },
        radius: definition.maxDistanceLy,
        unit: "light-year",
      },
    };
  });

export const createLocalStarCatalog = (stars: NearbyStar[]): LocalStarCatalogSnapshot => {
  const objects = stars.map(nearbyStarToSkyObject);
  const chunks = createCatalogChunks(objects);
  const maxDistance = objects.reduce((max, object) => Math.max(max, object.scientific.distanceLy ?? 0), 0);

  return {
    objects,
    chunks,
    metrics: {
      totalObjects: objects.length,
      searchableObjects: objects.length,
      chunkCount: chunks.length,
      maxDistance,
    },
    version: LOCAL_STAR_CATALOG_VERSION,
  };
};
