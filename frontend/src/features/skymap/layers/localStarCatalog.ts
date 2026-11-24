import { NEARBY_STAR_SOURCE, type NearbyStar } from "../../../data/nearbyStars";
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

export interface LocalStarCatalogRuntime {
  version?: string;
  loadedChunkIds?: ReadonlySet<string>;
  catalogRecordCount?: number;
  chunkDefinitions?: ReadonlyArray<{
    id: string;
    label: string;
    importanceTier: StarCatalogChunkTier;
    maxDistanceLy: number;
    recordCount: number;
  }>;
}

export const LOCAL_STAR_CATALOG_VERSION = "nearby-stars-seed-v2";

export const LOCAL_STAR_CHUNK_DEFINITIONS: LocalStarCatalogChunkDefinition[] = [
  {
    id: "core-12ly",
    label: "Local core",
    maxDistanceLy: 12,
    importanceTier: "core",
  },
  {
    id: "context-25ly",
    label: "Nearby context",
    maxDistanceLy: 25,
    importanceTier: "context",
  },
  {
    id: "background-90ly",
    label: "Local background",
    maxDistanceLy: 90,
    importanceTier: "background",
  },
];

export const getLocalStarChunkDefinition = (distanceLy: number) =>
  LOCAL_STAR_CHUNK_DEFINITIONS.find((chunk) => distanceLy <= chunk.maxDistanceLy) ??
  LOCAL_STAR_CHUNK_DEFINITIONS[LOCAL_STAR_CHUNK_DEFINITIONS.length - 1];

export const getStarBrightnessValue = (distanceLy = 0, luminositySolar = 0, apparentMagnitude?: number) => {
  if (typeof apparentMagnitude === "number" && Number.isFinite(apparentMagnitude)) {
    const normalized = Math.min(1, Math.max(0, 1 - (apparentMagnitude + 2) / 11));
    return Math.min(1, Math.max(0.04, 0.04 + Math.pow(normalized, 0.82) * 0.96));
  }
  const distance = Math.max(0.001, distanceLy);
  const luminosity = luminositySolar;
  return Math.min(1, Math.max(0.085, Math.log10((luminosity / (distance * distance + 1)) * 2200 + 1) / 2.3));
};

export const nearbyStarToSkyObject = (star: NearbyStar): StarSkyObject => {
  const spectralType = star.spectralType?.trim() ?? "";
  const color = `#${getStarColor(spectralType, star.temperature).getHexString()}`;
  const chunk = getLocalStarChunkDefinition(star.distanceLy);
  const isGaia = star.sourceKind === "gaia-dr3";
  const exoplanetHostCrossmatch = star.exoplanetHostCrossmatch;
  const brightness = getStarBrightnessValue(star.distanceLy, star.luminosity, star.apparentMagnitudeG);

  return {
    id: `star:${star.id}`,
    kind: "star",
    name: star.name,
    position: {
      mode: "cartesian",
      frame: isGaia ? "heliocentric-icrs-cartesian" : "local-interstellar-cartesian",
      unit: "light-year",
      x: star.x,
      y: star.y,
      z: star.z,
      epoch: isGaia ? { kind: "julian-year", value: star.renderEpochJulianYear ?? star.referenceEpochJulianYear ?? 2016, scale: "tcb" } : { kind: "static" },
    },
    epoch: isGaia ? { kind: "julian-year", value: star.renderEpochJulianYear ?? star.referenceEpochJulianYear ?? 2016, scale: "tcb" } : { kind: "static" },
    provenance: [
      isGaia
        ? {
            source: "ESA Gaia Data Release 3",
            catalog: "gaiadr3.gaia_source",
            sourceId: star.sourceId,
            confidence: "catalog",
            url: "https://gea.esac.esa.int/archive/documentation/GDR3/",
          }
        : {
            source: NEARBY_STAR_SOURCE.provenance.sourceName,
            catalog: NEARBY_STAR_SOURCE.version,
            sourceId: star.sourceId,
            confidence: "seed",
          },
      ...(exoplanetHostCrossmatch
        ? [{
            source: "NASA Exoplanet Archive",
            catalog: exoplanetHostCrossmatch.catalogVersion,
            sourceId: exoplanetHostCrossmatch.systemId,
            confidence: "catalog" as const,
            url: "https://exoplanetarchive.ipac.caltech.edu/",
          }]
        : []),
    ],
    visual: {
      color,
      brightness,
      labelPriority: star.importance,
    },
    search: {
      aliases: star.aliases,
      tags: [
        "star",
        "nearby",
        isGaia ? "gaia-dr3" : "curated-seed",
        exoplanetHostCrossmatch ? "exact-exoplanet-host-crossmatch" : "",
        spectralType.charAt(0).toLowerCase(),
        star.catalogChunkId ?? chunk.id,
      ].filter(Boolean),
      description: isGaia
        ? exoplanetHostCrossmatch
          ? `${star.name}, a Gaia DR3 navigation record linked to its NASA Exoplanet Archive host by exact Gaia DR3 source identifier.`
          : `${star.name}, a Gaia DR3 navigation record in the 100 pc / G <= 9 visualization subset.`
        : `${star.name} in the curated local stellar navigation seed.`,
      keywords: [
        star.name,
        ...star.aliases,
        spectralType,
        "nearby star",
        isGaia ? "Gaia DR3" : chunk.label,
        exoplanetHostCrossmatch ? "confirmed exoplanet host" : "",
      ].filter(Boolean),
    },
    scientific: {
      spectralType: spectralType || undefined,
      luminositySolar: star.luminosity,
      temperatureK: star.temperature,
      distanceLy: star.distanceLy,
      apparentMagnitude: star.apparentMagnitudeG,
      colorIndexBpRp: star.colorIndexBpRp,
      referenceEpochJulianYear: star.referenceEpochJulianYear,
      renderEpochJulianYear: star.renderEpochJulianYear,
      raDeg: star.raDeg,
      raErrorMas: star.raErrorMas,
      decDeg: star.decDeg,
      decErrorMas: star.decErrorMas,
      parallaxMas: star.parallaxMas,
      parallaxErrorMas: star.parallaxErrorMas,
      pmRaMasYr: star.pmRaMasYr,
      pmRaErrorMasYr: star.pmRaErrorMasYr,
      pmDecMasYr: star.pmDecMasYr,
      pmDecErrorMasYr: star.pmDecErrorMasYr,
      radialVelocityKmS: star.radialVelocityKmS,
      radialVelocityErrorKmS: star.radialVelocityErrorKmS,
      radialVelocityApplied: star.radialVelocityApplied,
      propagatedAngularUncertaintyMas: star.propagatedAngularUncertaintyMas,
      propagatedAngularUncertaintySemiMajorMas: star.propagatedAngularUncertaintySemiMajorMas,
      propagatedAngularUncertaintySemiMinorMas: star.propagatedAngularUncertaintySemiMinorMas,
      propagatedAngularUncertaintyPositionAngleDeg: star.propagatedAngularUncertaintyPositionAngleDeg,
      propagatedPositionUncertaintySemiMajorLy: star.propagatedPositionUncertaintySemiMajorLy,
      propagatedPositionUncertaintySemiIntermediateLy: star.propagatedPositionUncertaintySemiIntermediateLy,
      propagatedPositionUncertaintySemiMinorLy: star.propagatedPositionUncertaintySemiMinorLy,
      propagatedPositionUncertaintyRadialLy: star.propagatedPositionUncertaintyRadialLy,
      propagatedPositionUncertaintyTransverseRmsLy: star.propagatedPositionUncertaintyTransverseRmsLy,
      propagatedCovarianceModel: star.propagatedCovarianceModel,
      propagatedCovarianceRadialVelocityTreatment: star.propagatedCovarianceRadialVelocityTreatment,
      propagationModel: isGaia ? "uniform-rectilinear-space-motion" : undefined,
      propagationValidityStartYear: isGaia ? 1900 : undefined,
      propagationValidityEndYear: isGaia ? 2100 : undefined,
      ruwe: star.ruwe,
      exoplanetSystemId: exoplanetHostCrossmatch?.systemId,
      exoplanetHostCrossmatchMethod: exoplanetHostCrossmatch?.method,
    },
    relations: exoplanetHostCrossmatch
      ? [{
          type: "hosts",
          targetId: exoplanetHostCrossmatch.systemId,
          label: `Hosts the ${exoplanetHostCrossmatch.hostName} confirmed-planet system`,
        }]
      : undefined,
    time: {
      behavior: isGaia ? "time-aware" : "static",
      model: isGaia ? "gaia-dr3-worker-uniform-space-motion" : "seed-local-stars-static",
      note: isGaia
        ? `Worker-propagated from Gaia DR3 J2016.0 to J${(star.renderEpochJulianYear ?? 2016).toFixed(2)} with uniform rectilinear motion, transverse proper motion, and ${star.radialVelocityApplied ? "the published Gaia DR3 radial velocity" : "an explicit zero-radial-velocity fallback because Gaia DR3 has no value for this source"}. The selected-star confidence model applies the full six-parameter Jacobian to Gaia's within-source astrometric covariance and ${star.radialVelocityApplied ? "the independently published radial-velocity uncertainty" : "is conditional on the disclosed zero-radial fallback without inventing a velocity-dispersion prior"}. The 1900-2100 model still omits light-time, non-single-star acceleration solutions, the parallax zero-point correction, Bayesian distance inference and between-source correlations.`
        : "Curated seed stars are treated as fixed; the seed has no reviewed epoch or proper-motion model.",
    },
  };
};

const createCatalogChunks = (
  objects: StarSkyObject[],
  runtime: LocalStarCatalogRuntime,
): SkyLayerChunk[] => {
  if (runtime.chunkDefinitions?.length) {
    return runtime.chunkDefinitions.map((definition) => ({
      id: definition.id,
      label: definition.label,
      objectIds: objects
        .filter((object) => object.search?.tags?.includes(definition.id))
        .map((object) => object.id),
      objectCount: definition.recordCount,
      status: runtime.loadedChunkIds?.has(definition.id) ? "ready" : "loading",
      importanceTier: definition.importanceTier,
      bounds: {
        frame: "heliocentric-icrs-cartesian",
        center: { x: 0, y: 0, z: 0, unit: "scene-unit", sourceFrame: "heliocentric-icrs-cartesian" },
        radius: definition.maxDistanceLy,
        unit: "light-year",
      },
    }));
  }

  return LOCAL_STAR_CHUNK_DEFINITIONS.map((definition) => {
    const chunkObjects = objects.filter((object) => {
      const distance = object.scientific.distanceLy ?? 0;
      return getLocalStarChunkDefinition(distance).id === definition.id;
    });

    return {
      id: definition.id,
      label: definition.label,
      objectIds: chunkObjects.map((object) => object.id),
      objectCount: chunkObjects.length,
      status: runtime.loadedChunkIds && !runtime.loadedChunkIds.has(definition.id) ? "loading" : "ready",
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
};

export const createLocalStarCatalog = (
  stars: NearbyStar[],
  runtime: LocalStarCatalogRuntime = {},
): LocalStarCatalogSnapshot => {
  const objects = stars.map(nearbyStarToSkyObject);
  const chunks = createCatalogChunks(objects, runtime);
  const maxDistance = objects.reduce((max, object) => Math.max(max, object.scientific.distanceLy ?? 0), 0);

  return {
    objects,
    chunks,
    metrics: {
      totalObjects: runtime.catalogRecordCount ?? objects.length,
      searchableObjects: objects.length,
      chunkCount: chunks.length,
      maxDistance,
    },
    version: runtime.version ?? LOCAL_STAR_CATALOG_VERSION,
  };
};
