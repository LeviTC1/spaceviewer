import type {
  DecodedStarCatalogChunk,
  StarCatalogChunkMetadata,
  StarCatalogManifest,
  StarCatalogManifestChunk,
} from "./starCatalogTypes";
import { EXOPLANET_GAIA_CROSSMATCH_METHOD } from "./exoplanetCatalog";
import {
  clampGaiaPropagationJulianYear,
  GAIA_REFERENCE_EPOCH_JULIAN_YEAR,
  propagateStarCatalogPositions,
} from "./starCatalogPropagation";

const MAGIC = "SVST";
const FORMAT = "spaceviewer-star-columns-v3";
const SCHEMA_VERSION = 3;
const MINIMUM_HEADER_BYTES = 192;
const ENDIAN_MARKER = 0x01020304;

const COLUMN_LAYOUT = [
  { key: "sourceIdHigh", bytes: 4, array: Uint32Array },
  { key: "sourceIdLow", bytes: 4, array: Uint32Array },
  { key: "x", bytes: 8, array: Float64Array },
  { key: "y", bytes: 8, array: Float64Array },
  { key: "z", bytes: 8, array: Float64Array },
  { key: "distanceLy", bytes: 8, array: Float64Array },
  { key: "raDeg", bytes: 4, array: Float32Array },
  { key: "raErrorMas", bytes: 4, array: Float32Array },
  { key: "decDeg", bytes: 4, array: Float32Array },
  { key: "decErrorMas", bytes: 4, array: Float32Array },
  { key: "parallaxMas", bytes: 4, array: Float32Array },
  { key: "parallaxErrorMas", bytes: 4, array: Float32Array },
  { key: "pmRaMasYr", bytes: 4, array: Float32Array },
  { key: "pmRaErrorMasYr", bytes: 4, array: Float32Array },
  { key: "pmDecMasYr", bytes: 4, array: Float32Array },
  { key: "pmDecErrorMasYr", bytes: 4, array: Float32Array },
  { key: "radialVelocityKmS", bytes: 4, array: Float32Array },
  { key: "radialVelocityErrorKmS", bytes: 4, array: Float32Array },
  { key: "raDecCorr", bytes: 4, array: Float32Array },
  { key: "raParallaxCorr", bytes: 4, array: Float32Array },
  { key: "raPmRaCorr", bytes: 4, array: Float32Array },
  { key: "raPmDecCorr", bytes: 4, array: Float32Array },
  { key: "decParallaxCorr", bytes: 4, array: Float32Array },
  { key: "decPmRaCorr", bytes: 4, array: Float32Array },
  { key: "decPmDecCorr", bytes: 4, array: Float32Array },
  { key: "parallaxPmRaCorr", bytes: 4, array: Float32Array },
  { key: "parallaxPmDecCorr", bytes: 4, array: Float32Array },
  { key: "pmRaPmDecCorr", bytes: 4, array: Float32Array },
  { key: "apparentMagnitudeG", bytes: 4, array: Float32Array },
  { key: "colorIndexBpRp", bytes: 4, array: Float32Array },
  { key: "temperatureK", bytes: 4, array: Float32Array },
  { key: "ruwe", bytes: 4, array: Float32Array },
  { key: "brightnessProxy", bytes: 4, array: Float32Array },
] as const;

const readMagic = (view: DataView) =>
  String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));

const assertArrayBounds = (
  offset: number,
  count: number,
  bytesPerElement: number,
  byteLength: number,
  label: string,
) => {
  if (offset < MINIMUM_HEADER_BYTES || offset % bytesPerElement !== 0) {
    throw new Error(`${label} has an invalid or unaligned offset.`);
  }
  if (offset + count * bytesPerElement > byteLength) {
    throw new Error(`${label} exceeds the binary chunk length.`);
  }
};

export const validateStarCatalogManifest = (value: unknown): StarCatalogManifest => {
  const manifest = value as Partial<StarCatalogManifest> | null;
  if (!manifest || manifest.schemaVersion !== 3 || manifest.format !== FORMAT) {
    throw new Error("Unsupported star catalogue manifest format.");
  }
  if (
    !manifest.catalog?.id ||
    !manifest.catalog.version ||
    manifest.catalog.referenceFrame !== "heliocentric-icrs-cartesian" ||
    manifest.catalog.provenance?.licenceStatus !== "verified"
  ) {
    throw new Error("Star catalogue manifest is missing verified catalogue provenance.");
  }
  if (
    !manifest.build ||
    !manifest.sourceFile ||
    !Array.isArray(manifest.chunks) ||
    manifest.chunks.length !== manifest.build.chunkCount
  ) {
    throw new Error("Star catalogue manifest chunk count is inconsistent.");
  }
  if (
    manifest.build.propagation?.referenceEpochJulianYear !== GAIA_REFERENCE_EPOCH_JULIAN_YEAR ||
    manifest.build.propagation.minimumJulianYear !== 1900 ||
    manifest.build.propagation.maximumJulianYear !== 2100 ||
    manifest.build.propagation.model !== "uniform-rectilinear-space-motion" ||
    manifest.build.propagation.radialVelocityTreatment !== "gaia-dr3-when-available-zero-fallback" ||
    manifest.build.propagation.radialVelocityReferenceFrame !== "solar-system-barycentric" ||
    manifest.build.propagation.covarianceModel !== "full-six-parameter-linearized-jacobian" ||
    manifest.build.propagation.radialVelocityCovarianceTreatment !==
      "independent-spectroscopic-uncertainty-when-available-conditional-zero-otherwise" ||
    !manifest.build.propagation.covarianceReferenceUrl.startsWith("https://gea.esac.esa.int/")
  ) {
    throw new Error("Star catalogue manifest is missing the bounded propagation contract.");
  }
  const spatialPartition = manifest.build.spatialPartition;
  if (
    !Number.isInteger(spatialPartition?.level) ||
    spatialPartition.level < 0 ||
    spatialPartition.level > 12 ||
    spatialPartition.cellCount !== 12 * 4 ** spatialPartition.level ||
    spatialPartition.sourceIdRightShiftBits !== 59 - spatialPartition.level * 2 ||
    !spatialPartition.priorityMetric
  ) {
    throw new Error("Star catalogue manifest is missing the spatial scheduling contract.");
  }
  if (manifest.sourceFile.recordCount !== manifest.build.recordCount) {
    throw new Error("Star catalogue source and build record counts differ.");
  }
  const exoplanetHostCrossmatch = manifest.build.exoplanetHostCrossmatch;
  if (
    exoplanetHostCrossmatch?.method !== EXOPLANET_GAIA_CROSSMATCH_METHOD ||
    !exoplanetHostCrossmatch.catalogId ||
    !exoplanetHostCrossmatch.catalogVersion ||
    !/^[a-f0-9]{64}$/.test(exoplanetHostCrossmatch.sourceSha256) ||
    !Number.isInteger(exoplanetHostCrossmatch.matchedRecordCount) ||
    exoplanetHostCrossmatch.matchedRecordCount <= 0 ||
    exoplanetHostCrossmatch.matchedRecordCount > manifest.build.navigationRecordCount
  ) {
    throw new Error("Star catalogue manifest is missing its exact exoplanet-host cross-match contract.");
  }
  if (
    manifest.build.propagation.radialVelocityRecordCount < 0 ||
    manifest.build.propagation.radialVelocityFallbackRecordCount < 0 ||
    manifest.build.propagation.radialVelocityRecordCount +
        manifest.build.propagation.radialVelocityFallbackRecordCount !==
      manifest.build.recordCount ||
    Math.abs(
      manifest.build.propagation.radialVelocityCoverageFraction -
        manifest.build.propagation.radialVelocityRecordCount / manifest.build.recordCount,
    ) > 1e-12 ||
    manifest.build.propagation.astrometricCorrelationColumns.length !== 10
  ) {
    throw new Error("Star catalogue manifest has inconsistent space-motion coverage.");
  }

  const ids = new Set<string>();
  const spatialIndexes = new Set<number>();
  let recordCount = 0;
  let navigationRecordCount = 0;
  let totalBytes = 0;
  manifest.chunks.forEach((chunk) => {
    if (!chunk.id || ids.has(chunk.id) || !chunk.binaryUrl || !chunk.metadataUrl) {
      throw new Error("Star catalogue manifest contains an invalid or duplicate chunk.");
    }
    if (
      chunk.recordCount <= 0 ||
      chunk.navigationRecordCount < 0 ||
      chunk.navigationRecordCount > chunk.recordCount ||
      chunk.byteLength < MINIMUM_HEADER_BYTES
    ) {
      throw new Error(`Star catalogue chunk ${chunk.id} has invalid metrics.`);
    }
    if (chunk.importanceTier === "core") {
      if (chunk.spatialCell !== null) {
        throw new Error(`Star catalogue core chunk ${chunk.id} must remain all-sky.`);
      }
    } else {
      const spatialCell = chunk.spatialCell;
      const centroid = spatialCell?.recordCentroidUnitIcrs;
      const centroidLength = centroid ? Math.hypot(centroid.x, centroid.y, centroid.z) : Number.NaN;
      if (
        !spatialCell ||
        spatialCell.scheme !== "gaia-source-id-nested-healpix" ||
        spatialCell.level !== spatialPartition.level ||
        !Number.isInteger(spatialCell.index) ||
        spatialCell.index < 0 ||
        spatialCell.index >= spatialPartition.cellCount ||
        spatialIndexes.has(spatialCell.index) ||
        !Number.isFinite(centroidLength) ||
        Math.abs(centroidLength - 1) > 1e-6 ||
        !Number.isFinite(spatialCell.maximumRecordSeparationDeg) ||
        spatialCell.maximumRecordSeparationDeg < 0 ||
        spatialCell.maximumRecordSeparationDeg > 180
      ) {
        throw new Error(`Star catalogue chunk ${chunk.id} has invalid spatial scheduling metadata.`);
      }
      spatialIndexes.add(spatialCell.index);
    }
    ids.add(chunk.id);
    recordCount += chunk.recordCount;
    navigationRecordCount += chunk.navigationRecordCount;
    totalBytes += chunk.byteLength;
  });
  if (
    recordCount !== manifest.build.recordCount ||
    navigationRecordCount !== manifest.build.navigationRecordCount ||
    totalBytes !== manifest.build.totalBinaryBytes
  ) {
    throw new Error("Star catalogue aggregate metrics do not match its chunks.");
  }
  if (spatialIndexes.size !== spatialPartition.cellCount) {
    throw new Error("Star catalogue spatial cells do not cover the configured partition.");
  }
  return manifest as StarCatalogManifest;
};

export const validateStarCatalogChunkMetadata = (
  value: unknown,
  expected: StarCatalogManifestChunk,
  manifest: StarCatalogManifest,
): StarCatalogChunkMetadata => {
  const metadata = value as Partial<StarCatalogChunkMetadata> | null;
  if (
    !metadata ||
    metadata.schemaVersion !== 3 ||
    metadata.catalogId !== manifest.catalog.id ||
    metadata.catalogVersion !== manifest.catalog.version ||
    metadata.chunkId !== expected.id ||
    metadata.recordCount !== expected.recordCount ||
    !Array.isArray(metadata.navigationRecords) ||
    metadata.navigationRecords.length !== expected.navigationRecordCount
  ) {
    throw new Error(`Metadata for star catalogue chunk ${expected.id} is inconsistent.`);
  }
  const indexes = new Set<number>();
  metadata.navigationRecords.forEach((record) => {
    if (
      !Number.isInteger(record.binaryIndex) ||
      record.binaryIndex < 0 ||
      record.binaryIndex >= expected.recordCount ||
      indexes.has(record.binaryIndex) ||
      !record.id ||
      !/^\d+$/.test(record.sourceId)
    ) {
      throw new Error(`Navigation metadata for star catalogue chunk ${expected.id} is invalid.`);
    }
    const crossmatch = record.exoplanetHostCrossmatch;
    if (crossmatch) {
      if (
        crossmatch.method !== EXOPLANET_GAIA_CROSSMATCH_METHOD ||
        !crossmatch.systemId.startsWith("exoplanet-system:") ||
        !crossmatch.hostName ||
        crossmatch.catalogId !== manifest.build.exoplanetHostCrossmatch.catalogId ||
        crossmatch.catalogVersion !== manifest.build.exoplanetHostCrossmatch.catalogVersion
      ) {
        throw new Error(`Exoplanet cross-match metadata for star catalogue chunk ${expected.id} is invalid.`);
      }
    }
    indexes.add(record.binaryIndex);
  });
  return metadata as StarCatalogChunkMetadata;
};

export const decodeStarCatalogBinary = (
  arrayBuffer: ArrayBuffer,
  expected: StarCatalogManifestChunk,
  metadata: StarCatalogChunkMetadata,
  targetJulianYear = GAIA_REFERENCE_EPOCH_JULIAN_YEAR,
): DecodedStarCatalogChunk => {
  if (arrayBuffer.byteLength !== expected.byteLength || arrayBuffer.byteLength < MINIMUM_HEADER_BYTES) {
    throw new Error(`Binary length mismatch for star catalogue chunk ${expected.id}.`);
  }
  const view = new DataView(arrayBuffer);
  if (readMagic(view) !== MAGIC) throw new Error(`Invalid star catalogue magic for ${expected.id}.`);
  if (view.getUint16(4, true) !== SCHEMA_VERSION) {
    throw new Error(`Unsupported star catalogue schema for ${expected.id}.`);
  }
  const headerBytes = view.getUint16(6, true);
  if (headerBytes !== MINIMUM_HEADER_BYTES || headerBytes > arrayBuffer.byteLength) {
    throw new Error(`Invalid star catalogue header size for ${expected.id}.`);
  }
  const recordCount = view.getUint32(8, true);
  const chunkIndex = view.getUint16(12, true);
  const chunkCount = view.getUint16(14, true);
  if (recordCount !== expected.recordCount || metadata.recordCount !== recordCount) {
    throw new Error(`Record count mismatch for star catalogue chunk ${expected.id}.`);
  }
  if (view.getUint32(16, true) !== ENDIAN_MARKER) {
    throw new Error(`Star catalogue endian marker is invalid for ${expected.id}.`);
  }
  if (view.getUint16(20 + COLUMN_LAYOUT.length * 4, true) !== COLUMN_LAYOUT.length) {
    throw new Error(`Star catalogue column count is invalid for ${expected.id}.`);
  }

  const offsets = COLUMN_LAYOUT.map((column, index) => {
    const offset = view.getUint32(20 + index * 4, true);
    assertArrayBounds(offset, recordCount, column.bytes, arrayBuffer.byteLength, column.key);
    return offset;
  });
  if (new Set(offsets).size !== offsets.length) {
    throw new Error(`Star catalogue columns overlap for ${expected.id}.`);
  }

  const columns = Object.fromEntries(
    COLUMN_LAYOUT.map((column, index) => [column.key, new column.array(arrayBuffer, offsets[index], recordCount)]),
  ) as unknown as DecodedStarCatalogChunk["columns"];
  const renderEpochJulianYear = clampGaiaPropagationJulianYear(targetJulianYear);
  const renderPositions = propagateStarCatalogPositions(columns, renderEpochJulianYear);

  return {
    chunkId: expected.id,
    chunkIndex,
    chunkCount,
    recordCount,
    columns,
    renderPositions,
    renderEpochJulianYear,
    metadata,
    byteLength: arrayBuffer.byteLength,
  };
};
