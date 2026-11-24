export type StarCatalogChunkTier = "core" | "context" | "background";

export interface StarCatalogProvenance {
  sourceName: string;
  sourcePath: string;
  sourceUrl: string;
  retrievedAt: string;
  licenceId: string;
  licenceStatus: "verified" | "review-required";
  credit: string;
  documentationUrl: string;
  creditsUrl: string;
  notes: string;
}

export interface StarCatalogManifestChunk {
  id: string;
  label: string;
  importanceTier: StarCatalogChunkTier;
  selection: string;
  maxDistanceLy: number;
  recordCount: number;
  navigationRecordCount: number;
  bounds: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
    radiusLy: number;
  };
  spatialCell: {
    scheme: "gaia-source-id-nested-healpix";
    level: number;
    index: number;
    recordCentroidUnitIcrs: { x: number; y: number; z: number };
    maximumRecordSeparationDeg: number;
  } | null;
  binaryUrl: string;
  metadataUrl: string;
  byteLength: number;
  binaryIntegrity: string;
  metadataIntegrity: string;
}

export interface StarCatalogManifest {
  schemaVersion: 3;
  format: "spaceviewer-star-columns-v3";
  catalog: {
    id: string;
    version: string;
    title: string;
    status: "authoritative-derived-subset";
    referenceFrame: "heliocentric-icrs-cartesian";
    positionUnit: "light-year";
    epoch: { kind: "julian-year"; value: "J2016.0"; scale: "TCB" };
    provenance: StarCatalogProvenance;
  };
  query: {
    language: "ADQL";
    table: "gaiadr3.gaia_source";
    text: string;
    selection: {
      nominalMaximumDistanceParsec: number;
      parallaxMinimumMas: number;
      parallaxSignalToNoiseMinimum: number;
      maximumApparentMagnitudeG: number;
      astrometricSolutions: number[];
      excludesDuplicatedSourceFlag: boolean;
    };
    interpretation: string;
  };
  sourceFile: {
    path: string;
    format: "csv";
    contentEncoding: "gzip";
    columns: string[];
    recordCount: number;
    uncompressedBytes: number;
    compressedBytes: number;
    uncompressedSha256: string;
    compressedSha256: string;
  };
  build: {
    builder: string;
    deterministic: boolean;
    recordCount: number;
    navigationRecordCount: number;
    chunkCount: number;
    totalBinaryBytes: number;
    exoplanetHostCrossmatch: {
      method: "nasa-exoplanet-archive-gaia-dr3-source-id-exact";
      catalogId: string;
      catalogVersion: string;
      sourceSha256: string;
      matchedRecordCount: number;
      navigationGuarantee: string;
      boundary: string;
    };
    spatialPartition: {
      scheme: string;
      level: number;
      cellCount: number;
      sourceIdRightShiftBits: number;
      brightCoreMaximumMagnitudeG: number;
      priorityMetric: string;
      note: string;
    };
    derivedPosition: { formula: string; caveat: string };
    propagation: {
      referenceEpochJulianYear: 2016;
      minimumJulianYear: 1900;
      maximumJulianYear: 2100;
      model: "uniform-rectilinear-space-motion";
      radialVelocityTreatment: "gaia-dr3-when-available-zero-fallback";
      radialVelocityReferenceFrame: "solar-system-barycentric";
      radialVelocityRecordCount: number;
      radialVelocityFallbackRecordCount: number;
      radialVelocityCoverageFraction: number;
      covarianceModel: "full-six-parameter-linearized-jacobian";
      radialVelocityCovarianceTreatment: "independent-spectroscopic-uncertainty-when-available-conditional-zero-otherwise";
      covarianceReferenceUrl: string;
      astrometricCorrelationColumns: string[];
      uncertaintyTreatment: string;
      limitations: string;
    };
    brightnessProxy: { scientific: false; formula: string; purpose: string };
    binaryLayout: {
      headerBytes: number;
      byteOrder: "little-endian";
      positionPrecision: "float64";
      scalarPrecision: "float32";
      columns: Array<{ key: string; type: "uint32" | "float32" | "float64" }>;
    };
  };
  chunks: StarCatalogManifestChunk[];
}

export interface StarCatalogExoplanetHostCrossmatch {
  method: "nasa-exoplanet-archive-gaia-dr3-source-id-exact";
  systemId: string;
  hostName: string;
  catalogId: string;
  catalogVersion: string;
}

export interface StarCatalogNavigationRecord {
  binaryIndex: number;
  id: string;
  sourceId: string;
  name: string;
  aliases: string[];
  importance: number;
  sourceRow: number;
  exoplanetHostCrossmatch?: StarCatalogExoplanetHostCrossmatch;
}

export interface StarCatalogChunkMetadata {
  schemaVersion: 3;
  catalogId: string;
  catalogVersion: string;
  chunkId: string;
  recordCount: number;
  navigationRecords: StarCatalogNavigationRecord[];
}

export interface StarCatalogColumns {
  sourceIdHigh: Uint32Array;
  sourceIdLow: Uint32Array;
  x: Float64Array;
  y: Float64Array;
  z: Float64Array;
  distanceLy: Float64Array;
  raDeg: Float32Array;
  raErrorMas: Float32Array;
  decDeg: Float32Array;
  decErrorMas: Float32Array;
  parallaxMas: Float32Array;
  parallaxErrorMas: Float32Array;
  pmRaMasYr: Float32Array;
  pmRaErrorMasYr: Float32Array;
  pmDecMasYr: Float32Array;
  pmDecErrorMasYr: Float32Array;
  radialVelocityKmS: Float32Array;
  radialVelocityErrorKmS: Float32Array;
  raDecCorr: Float32Array;
  raParallaxCorr: Float32Array;
  raPmRaCorr: Float32Array;
  raPmDecCorr: Float32Array;
  decParallaxCorr: Float32Array;
  decPmRaCorr: Float32Array;
  decPmDecCorr: Float32Array;
  parallaxPmRaCorr: Float32Array;
  parallaxPmDecCorr: Float32Array;
  pmRaPmDecCorr: Float32Array;
  apparentMagnitudeG: Float32Array;
  colorIndexBpRp: Float32Array;
  temperatureK: Float32Array;
  ruwe: Float32Array;
  brightnessProxy: Float32Array;
}

export interface DecodedStarCatalogChunk {
  chunkId: string;
  chunkIndex: number;
  chunkCount: number;
  recordCount: number;
  columns: StarCatalogColumns;
  renderPositions: Float32Array;
  renderEpochJulianYear: number;
  metadata: StarCatalogChunkMetadata;
  byteLength: number;
}

export interface PropagatedStarCatalogChunk {
  chunkId: string;
  renderPositions: Float32Array;
}

export interface StarCatalogPropagationResult {
  targetJulianYear: number;
  chunks: PropagatedStarCatalogChunk[];
}

export interface StarCatalogViewFilterRequest {
  viewProjectionMatrix: number[];
  positionScale: number;
  magnitudeLimitG: number;
  pointBudget: number;
  frustumPadding?: number;
}

export interface FilteredStarCatalogChunk {
  chunkId: string;
  indices: Uint32Array;
  magnitudeEligibleRecords: number;
  frustumVisibleRecords: number;
  renderedRecords: number;
}

export interface StarCatalogFilterDiagnostics {
  totalRecords: number;
  magnitudeEligibleRecords: number;
  frustumVisibleRecords: number;
  renderedRecords: number;
  magnitudeCulledRecords: number;
  frustumCulledRecords: number;
  budgetCulledRecords: number;
  magnitudeLimitG: number;
  pointBudget: number;
  frustumPadding: number;
}

export interface StarCatalogViewFilterResult {
  chunks: FilteredStarCatalogChunk[];
  diagnostics: StarCatalogFilterDiagnostics;
}

export interface StarCatalogLoadProgress {
  loadedChunks: number;
  totalChunks: number;
  loadedRecords: number;
  totalRecords: number;
  loadedBytes: number;
  totalBytes: number;
  activeChunkId: string | null;
  schedulingMode: "manifest-order" | "view-adjacent";
  priorityDirectionIcrs: { x: number; y: number; z: number } | null;
}

export interface StarCatalogPriorityDirection {
  x: number;
  y: number;
  z: number;
}
