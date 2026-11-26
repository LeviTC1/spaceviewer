import catalogSource from "../../catalog-source/nearby-stars-seed.json";
import type { StarCatalogExoplanetHostCrossmatch } from "../lib/catalog/starCatalogTypes";

export interface NearbyStar {
  id: string;
  sourceId: string;
  name: string;
  aliases: string[];
  distanceLy: number;
  x: number;
  y: number;
  z: number;
  spectralType?: string;
  luminosity?: number;
  temperature?: number;
  apparentMagnitudeG?: number;
  colorIndexBpRp?: number;
  referenceEpochJulianYear?: number;
  renderEpochJulianYear?: number;
  raDeg?: number;
  raErrorMas?: number;
  decDeg?: number;
  decErrorMas?: number;
  parallaxMas?: number;
  parallaxErrorMas?: number;
  pmRaMasYr?: number;
  pmRaErrorMasYr?: number;
  pmDecMasYr?: number;
  pmDecErrorMasYr?: number;
  radialVelocityKmS?: number;
  radialVelocityErrorKmS?: number;
  radialVelocityApplied: boolean;
  propagatedAngularUncertaintyMas?: number;
  propagatedAngularUncertaintySemiMajorMas?: number;
  propagatedAngularUncertaintySemiMinorMas?: number;
  propagatedAngularUncertaintyPositionAngleDeg?: number;
  propagatedPositionUncertaintySemiMajorLy?: number;
  propagatedPositionUncertaintySemiIntermediateLy?: number;
  propagatedPositionUncertaintySemiMinorLy?: number;
  propagatedPositionUncertaintyRadialLy?: number;
  propagatedPositionUncertaintyTransverseRmsLy?: number;
  propagatedCovarianceModel?: "gaia-six-parameter-jacobian";
  propagatedCovarianceRadialVelocityTreatment?:
    | "published-independent-radial-velocity"
    | "conditional-zero-radial-velocity";
  ruwe?: number;
  sourceKind: "curated-seed" | "gaia-dr3";
  catalogChunkId?: string;
  exoplanetHostCrossmatch?: StarCatalogExoplanetHostCrossmatch;
  importance: number;
  sourceRow: number;
}

export const NEARBY_STAR_SOURCE = catalogSource.catalog;

/**
 * Small in-bundle recovery copy for browsers that cannot fetch/decode the
 * generated catalogue assets. Normal rendering uses the Worker-backed binary
 * pipeline in `features/starmap/nearbyStarCatalogStore.ts`.
 */
export const NEARBY_STARS: NearbyStar[] = catalogSource.records.map((record) => ({
  id: record.id,
  sourceId: record.sourceId,
  name: record.name,
  aliases: [...record.aliases],
  distanceLy: record.distanceLy,
  x: record.x,
  y: record.y,
  z: record.z,
  spectralType: record.spectralType,
  luminosity: record.luminositySolar,
  temperature: "temperatureK" in record ? record.temperatureK : undefined,
  // SIMBAD V magnitude: close enough to Gaia G for drawing these few named stars.
  apparentMagnitudeG: "apparentMagnitudeV" in record ? record.apparentMagnitudeV : undefined,
  radialVelocityApplied: false,
  sourceKind: "curated-seed",
  importance: record.importance,
  sourceRow: record.sourceRow,
}));
