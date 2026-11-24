#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import {
  EXOPLANET_GAIA_CROSSMATCH_METHOD,
  buildExoplanetHostIdentityIndex,
} from "./lib/stellar-crossmatch.mjs";

const SCRIPT_VERSION = "spaceviewer-star-catalog-builder-v6";
const BINARY_FORMAT = "spaceviewer-star-columns-v3";
const BINARY_MAGIC = "SVST";
const BINARY_SCHEMA_VERSION = 3;
const HEADER_BYTES = 192;
const ENDIAN_MARKER = 0x01020304;
const PARSEC_TO_LIGHT_YEAR = 3.2615637771674333;
const MAX_NAVIGATION_CORE_RECORDS = 160;
const MAX_NAVIGATION_SPATIAL_RECORDS = 4;
const SPATIAL_HEALPIX_LEVEL = 1;
const SPATIAL_HEALPIX_CELL_COUNT = 12 * 4 ** SPATIAL_HEALPIX_LEVEL;
const GAIA_HEALPIX_LEVEL_ZERO_SHIFT = 59;

const COLUMN_DEFINITIONS = [
  { key: "sourceIdHigh", type: "uint32", bytes: 4 },
  { key: "sourceIdLow", type: "uint32", bytes: 4 },
  { key: "x", type: "float64", bytes: 8 },
  { key: "y", type: "float64", bytes: 8 },
  { key: "z", type: "float64", bytes: 8 },
  { key: "distanceLy", type: "float64", bytes: 8 },
  { key: "raDeg", type: "float32", bytes: 4 },
  { key: "raErrorMas", type: "float32", bytes: 4 },
  { key: "decDeg", type: "float32", bytes: 4 },
  { key: "decErrorMas", type: "float32", bytes: 4 },
  { key: "parallaxMas", type: "float32", bytes: 4 },
  { key: "parallaxErrorMas", type: "float32", bytes: 4 },
  { key: "pmRaMasYr", type: "float32", bytes: 4 },
  { key: "pmRaErrorMasYr", type: "float32", bytes: 4 },
  { key: "pmDecMasYr", type: "float32", bytes: 4 },
  { key: "pmDecErrorMasYr", type: "float32", bytes: 4 },
  { key: "radialVelocityKmS", type: "float32", bytes: 4 },
  { key: "radialVelocityErrorKmS", type: "float32", bytes: 4 },
  { key: "raDecCorr", type: "float32", bytes: 4 },
  { key: "raParallaxCorr", type: "float32", bytes: 4 },
  { key: "raPmRaCorr", type: "float32", bytes: 4 },
  { key: "raPmDecCorr", type: "float32", bytes: 4 },
  { key: "decParallaxCorr", type: "float32", bytes: 4 },
  { key: "decPmRaCorr", type: "float32", bytes: 4 },
  { key: "decPmDecCorr", type: "float32", bytes: 4 },
  { key: "parallaxPmRaCorr", type: "float32", bytes: 4 },
  { key: "parallaxPmDecCorr", type: "float32", bytes: 4 },
  { key: "pmRaPmDecCorr", type: "float32", bytes: 4 },
  { key: "apparentMagnitudeG", type: "float32", bytes: 4 },
  { key: "colorIndexBpRp", type: "float32", bytes: 4 },
  { key: "temperatureK", type: "float32", bytes: 4 },
  { key: "ruwe", type: "float32", bytes: 4 },
  { key: "brightnessProxy", type: "float32", bytes: 4 },
];

const CSV_COLUMNS = [
  "source_id",
  "ref_epoch",
  "ra",
  "ra_error",
  "dec",
  "dec_error",
  "parallax",
  "parallax_error",
  "parallax_over_error",
  "pmra",
  "pmra_error",
  "pmdec",
  "pmdec_error",
  "radial_velocity",
  "radial_velocity_error",
  "ra_dec_corr",
  "ra_parallax_corr",
  "ra_pmra_corr",
  "ra_pmdec_corr",
  "dec_parallax_corr",
  "dec_pmra_corr",
  "dec_pmdec_corr",
  "parallax_pmra_corr",
  "parallax_pmdec_corr",
  "pmra_pmdec_corr",
  "phot_g_mean_mag",
  "bp_rp",
  "teff_gspphot",
  "ruwe",
];

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(scriptDirectory, "..");
const exoplanetReceiptPath = resolve(
  frontendRoot,
  "catalog-source/nasa-exoplanet-archive-nearby/source-receipt.json",
);

const readArgument = (name, fallback) => {
  const prefix = `${name}=`;
  const match = process.argv.slice(2).find((argument) => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
};

const receiptPath = resolve(
  frontendRoot,
  readArgument("--source", "catalog-source/gaia-dr3-nearby-100pc-g9.receipt.json"),
);
const outputDirectory = resolve(
  frontendRoot,
  readArgument("--output", "public/catalogs/nearby-stars"),
);
const checkOnly = process.argv.includes("--check");

const sha256 = (content) => createHash("sha256").update(content).digest("base64");
const sha256Hex = (content) => createHash("sha256").update(content).digest("hex");
const integrity = (content) => `sha256-${sha256(content)}`;
const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const parseRequiredNumber = (value, label) => {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be a finite number.`);
  return number;
};

const parseOptionalNumber = (value) => {
  if (value === "" || value == null) return Number.NaN;
  const number = Number(value);
  return Number.isFinite(number) ? number : Number.NaN;
};

const parseCorrelation = (value, label) => {
  const number = parseRequiredNumber(value, label);
  if (number < -1 || number > 1) throw new Error(`${label} must be between -1 and 1.`);
  return number;
};

const calculateBrightness = (apparentMagnitudeG) => {
  const normalized = clamp(1 - (apparentMagnitudeG + 2) / 11, 0, 1);
  return clamp(0.04 + Math.pow(normalized, 0.82) * 0.96, 0.04, 1);
};

const calculateImportance = (apparentMagnitudeG, distanceLy) =>
  Math.round(clamp(96 - apparentMagnitudeG * 5.2 + Math.max(0, 28 - distanceLy) * 0.18, 28, 98));

const parseCatalogRows = (csvBuffer, receipt) => {
  const lines = csvBuffer.toString("utf8").trim().split(/\r?\n/);
  const header = lines.shift();
  if (header !== CSV_COLUMNS.join(",")) throw new Error(`Unexpected Gaia source columns: ${header}`);

  const rows = lines.map((line, index) => {
    const values = line.split(",");
    if (values.length !== CSV_COLUMNS.length) {
      throw new Error(`Gaia source row ${index + 2} has an unexpected field count.`);
    }
    const sourceId = BigInt(values[0]);
    const refEpoch = parseRequiredNumber(values[1], `row ${index + 2} ref_epoch`);
    const raDeg = parseRequiredNumber(values[2], `row ${index + 2} ra`);
    const raErrorMas = parseRequiredNumber(values[3], `row ${index + 2} ra_error`);
    const decDeg = parseRequiredNumber(values[4], `row ${index + 2} dec`);
    const decErrorMas = parseRequiredNumber(values[5], `row ${index + 2} dec_error`);
    const parallaxMas = parseRequiredNumber(values[6], `row ${index + 2} parallax`);
    const parallaxErrorMas = parseRequiredNumber(values[7], `row ${index + 2} parallax_error`);
    const parallaxOverError = parseRequiredNumber(values[8], `row ${index + 2} parallax_over_error`);
    const pmRaMasYr = parseRequiredNumber(values[9], `row ${index + 2} pmra`);
    const pmRaErrorMasYr = parseRequiredNumber(values[10], `row ${index + 2} pmra_error`);
    const pmDecMasYr = parseRequiredNumber(values[11], `row ${index + 2} pmdec`);
    const pmDecErrorMasYr = parseRequiredNumber(values[12], `row ${index + 2} pmdec_error`);
    const radialVelocityKmS = parseOptionalNumber(values[13]);
    const radialVelocityErrorKmS = parseOptionalNumber(values[14]);
    if (Number.isFinite(radialVelocityKmS) !== Number.isFinite(radialVelocityErrorKmS)) {
      throw new Error(`Gaia source row ${index + 2} has an incomplete radial-velocity pair.`);
    }
    if (Number.isFinite(radialVelocityErrorKmS) && radialVelocityErrorKmS < 0) {
      throw new Error(`Gaia source row ${index + 2} has a negative radial-velocity uncertainty.`);
    }
    const raDecCorr = parseCorrelation(values[15], `row ${index + 2} ra_dec_corr`);
    const raParallaxCorr = parseCorrelation(values[16], `row ${index + 2} ra_parallax_corr`);
    const raPmRaCorr = parseCorrelation(values[17], `row ${index + 2} ra_pmra_corr`);
    const raPmDecCorr = parseCorrelation(values[18], `row ${index + 2} ra_pmdec_corr`);
    const decParallaxCorr = parseCorrelation(values[19], `row ${index + 2} dec_parallax_corr`);
    const decPmRaCorr = parseCorrelation(values[20], `row ${index + 2} dec_pmra_corr`);
    const decPmDecCorr = parseCorrelation(values[21], `row ${index + 2} dec_pmdec_corr`);
    const parallaxPmRaCorr = parseCorrelation(values[22], `row ${index + 2} parallax_pmra_corr`);
    const parallaxPmDecCorr = parseCorrelation(values[23], `row ${index + 2} parallax_pmdec_corr`);
    const pmRaPmDecCorr = parseCorrelation(values[24], `row ${index + 2} pmra_pmdec_corr`);
    const apparentMagnitudeG = parseRequiredNumber(values[25], `row ${index + 2} phot_g_mean_mag`);
    const colorIndexBpRp = parseOptionalNumber(values[26]);
    const temperatureK = parseOptionalNumber(values[27]);
    const ruwe = parseOptionalNumber(values[28]);
    if (parallaxMas <= 0 || parallaxOverError < 10 || apparentMagnitudeG > 9) {
      throw new Error(`Gaia source row ${index + 2} violates the recorded selection.`);
    }

    const distanceParsec = 1000 / parallaxMas;
    const distanceLy = distanceParsec * PARSEC_TO_LIGHT_YEAR;
    const raRad = (raDeg * Math.PI) / 180;
    const decRad = (decDeg * Math.PI) / 180;
    const cosDec = Math.cos(decRad);
    const x = distanceLy * cosDec * Math.cos(raRad);
    const y = distanceLy * cosDec * Math.sin(raRad);
    const z = distanceLy * Math.sin(decRad);

    return {
      sourceId,
      sourceIdText: sourceId.toString(),
      sourceIdHigh: Number((sourceId >> 32n) & 0xffffffffn),
      sourceIdLow: Number(sourceId & 0xffffffffn),
      sourceRow: index + 2,
      refEpoch,
      x,
      y,
      z,
      distanceLy,
      raDeg,
      raErrorMas,
      decDeg,
      decErrorMas,
      parallaxMas,
      parallaxErrorMas,
      pmRaMasYr,
      pmRaErrorMasYr,
      pmDecMasYr,
      pmDecErrorMasYr,
      radialVelocityKmS,
      radialVelocityErrorKmS,
      raDecCorr,
      raParallaxCorr,
      raPmRaCorr,
      raPmDecCorr,
      decParallaxCorr,
      decPmRaCorr,
      decPmDecCorr,
      parallaxPmRaCorr,
      parallaxPmDecCorr,
      pmRaPmDecCorr,
      apparentMagnitudeG,
      colorIndexBpRp,
      temperatureK,
      ruwe,
      brightnessProxy: calculateBrightness(apparentMagnitudeG),
      importance: calculateImportance(apparentMagnitudeG, distanceLy),
    };
  });

  if (rows.length !== receipt.sourceFile.recordCount) {
    throw new Error(`Receipt records ${receipt.sourceFile.recordCount}; decoded source has ${rows.length}.`);
  }
  return rows;
};

const getNestedHealpixIndex = (sourceId, level) => {
  if (!Number.isInteger(level) || level < 0 || level > 12) {
    throw new Error(`Unsupported Gaia nested HEALPix level ${level}.`);
  }
  return Number(sourceId >> BigInt(GAIA_HEALPIX_LEVEL_ZERO_SHIFT - level * 2));
};

const createChunkDefinitions = () => [
  {
    id: "bright-core-g6",
    label: "Bright all-sky core",
    importanceTier: "core",
    selection: "G <= 6",
    navigationLimit: MAX_NAVIGATION_CORE_RECORDS,
    matches: (record) => record.apparentMagnitudeG <= 6,
  },
  ...Array.from({ length: SPATIAL_HEALPIX_CELL_COUNT }, (_, healpixIndex) => ({
    id: `sky-${healpixIndex.toString().padStart(2, "0")}`,
    label: `HEALPix level ${SPATIAL_HEALPIX_LEVEL} cell ${healpixIndex}`,
    importanceTier: "background",
    selection: `G > 6 and nested HEALPix level ${SPATIAL_HEALPIX_LEVEL} = ${healpixIndex}`,
    navigationLimit: MAX_NAVIGATION_SPATIAL_RECORDS,
    spatialCell: {
      scheme: "gaia-source-id-nested-healpix",
      level: SPATIAL_HEALPIX_LEVEL,
      index: healpixIndex,
    },
    matches: (record) =>
      record.apparentMagnitudeG > 6 &&
      getNestedHealpixIndex(record.sourceId, SPATIAL_HEALPIX_LEVEL) === healpixIndex,
  })),
];

const calculateBounds = (records) => {
  const min = { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY, z: Number.POSITIVE_INFINITY };
  const max = { x: Number.NEGATIVE_INFINITY, y: Number.NEGATIVE_INFINITY, z: Number.NEGATIVE_INFINITY };
  let radiusLy = 0;
  records.forEach((record) => {
    min.x = Math.min(min.x, record.x);
    min.y = Math.min(min.y, record.y);
    min.z = Math.min(min.z, record.z);
    max.x = Math.max(max.x, record.x);
    max.y = Math.max(max.y, record.y);
    max.z = Math.max(max.z, record.z);
    radiusLy = Math.max(radiusLy, record.distanceLy);
  });
  return { min, max, radiusLy };
};

const calculateSpatialCellMetadata = (records, spatialCell) => {
  if (!spatialCell) return null;
  const centroid = records.reduce(
    (sum, record) => ({
      x: sum.x + record.x / record.distanceLy,
      y: sum.y + record.y / record.distanceLy,
      z: sum.z + record.z / record.distanceLy,
    }),
    { x: 0, y: 0, z: 0 },
  );
  const centroidLength = Math.hypot(centroid.x, centroid.y, centroid.z);
  if (!Number.isFinite(centroidLength) || centroidLength <= 0) {
    throw new Error(`Cannot derive a view-priority centroid for HEALPix cell ${spatialCell.index}.`);
  }
  const recordCentroidUnitIcrs = {
    x: centroid.x / centroidLength,
    y: centroid.y / centroidLength,
    z: centroid.z / centroidLength,
  };
  const maximumRecordSeparationDeg = records.reduce((maximum, record) => {
    const dot = clamp(
      (record.x / record.distanceLy) * recordCentroidUnitIcrs.x +
        (record.y / record.distanceLy) * recordCentroidUnitIcrs.y +
        (record.z / record.distanceLy) * recordCentroidUnitIcrs.z,
      -1,
      1,
    );
    return Math.max(maximum, Math.acos(dot) * (180 / Math.PI));
  }, 0);
  return {
    ...spatialCell,
    recordCentroidUnitIcrs,
    maximumRecordSeparationDeg,
  };
};

const encodeChunk = (records, chunkIndex, chunkCount) => {
  const offsets = {};
  let nextOffset = HEADER_BYTES;
  COLUMN_DEFINITIONS.forEach((column) => {
    offsets[column.key] = nextOffset;
    nextOffset += records.length * column.bytes;
  });

  const arrayBuffer = new ArrayBuffer(nextOffset);
  const view = new DataView(arrayBuffer);
  Array.from(BINARY_MAGIC).forEach((character, index) => view.setUint8(index, character.charCodeAt(0)));
  view.setUint16(4, BINARY_SCHEMA_VERSION, true);
  view.setUint16(6, HEADER_BYTES, true);
  view.setUint32(8, records.length, true);
  view.setUint16(12, chunkIndex, true);
  view.setUint16(14, chunkCount, true);
  view.setUint32(16, ENDIAN_MARKER, true);
  COLUMN_DEFINITIONS.forEach((column, index) => view.setUint32(20 + index * 4, offsets[column.key], true));
  view.setUint16(20 + COLUMN_DEFINITIONS.length * 4, COLUMN_DEFINITIONS.length, true);

  records.forEach((record, index) => {
    COLUMN_DEFINITIONS.forEach((column) => {
      const value = record[column.key];
      const offset = offsets[column.key] + index * column.bytes;
      if (column.type === "float64") view.setFloat64(offset, value, true);
      else if (column.type === "float32") view.setFloat32(offset, value, true);
      else view.setUint32(offset, value, true);
    });
  });
  return Buffer.from(arrayBuffer);
};

const buildNavigationMetadata = (
  records,
  limit,
  exoplanetHostIdentityByGaiaSourceId,
  exoplanetCatalog,
) =>
  records.flatMap((record, binaryIndex) => {
    const hostIdentity = exoplanetHostIdentityByGaiaSourceId.get(record.sourceIdText);
    if (binaryIndex >= limit && !hostIdentity) return [];
    return [{
      binaryIndex,
      id: `gaia-dr3:${record.sourceIdText}`,
      sourceId: record.sourceIdText,
      name: hostIdentity?.hostName ?? `Gaia DR3 ${record.sourceIdText}`,
      aliases: Array.from(new Set([
        record.sourceIdText,
        `Gaia DR3 ${record.sourceIdText}`,
        ...(hostIdentity?.aliases ?? []),
      ])),
      importance: hostIdentity ? Math.max(record.importance, 82) : record.importance,
      sourceRow: record.sourceRow,
      exoplanetHostCrossmatch: hostIdentity ? {
        method: EXOPLANET_GAIA_CROSSMATCH_METHOD,
        systemId: hostIdentity.systemId,
        hostName: hostIdentity.hostName,
        catalogId: exoplanetCatalog.id,
        catalogVersion: exoplanetCatalog.version,
      } : undefined,
    }];
  });

const buildFiles = (
  receipt,
  rows,
  exoplanetHostIdentityByGaiaSourceId,
  exoplanetReceipt,
  exoplanetSourceDefinition,
) => {
  const files = new Map();
  const chunkDefinitions = createChunkDefinitions();
  const chunkEntries = [];
  const assignedSourceIds = new Set();
  let totalBinaryBytes = 0;
  let navigationRecordCount = 0;

  chunkDefinitions.forEach((definition, chunkIndex) => {
    const records = rows
      .filter(definition.matches)
      .sort(
        (left, right) =>
          left.apparentMagnitudeG - right.apparentMagnitudeG ||
          left.distanceLy - right.distanceLy ||
          (left.sourceId < right.sourceId ? -1 : 1),
      );
    if (!records.length) throw new Error(`Generated catalogue chunk ${definition.id} is empty.`);
    records.forEach((record) => {
      if (assignedSourceIds.has(record.sourceIdText)) throw new Error(`Duplicate chunk assignment: ${record.sourceIdText}`);
      assignedSourceIds.add(record.sourceIdText);
    });

    const binary = encodeChunk(records, chunkIndex, chunkDefinitions.length);
    const binaryFile = `${definition.id}.svsc`;
    const metadataFile = `${definition.id}.meta.json`;
    const navigationRecords = buildNavigationMetadata(
      records,
      definition.navigationLimit,
      exoplanetHostIdentityByGaiaSourceId,
      exoplanetReceipt.catalog,
    );
    const metadata = Buffer.from(
      stableJson({
        schemaVersion: 3,
        catalogId: receipt.catalog.id,
        catalogVersion: receipt.catalog.version,
        chunkId: definition.id,
        recordCount: records.length,
        navigationRecords,
      }),
    );

    files.set(binaryFile, binary);
    files.set(metadataFile, metadata);
    totalBinaryBytes += binary.byteLength;
    navigationRecordCount += navigationRecords.length;
    chunkEntries.push({
      id: definition.id,
      label: definition.label,
      importanceTier: definition.importanceTier,
      selection: definition.selection,
      maxDistanceLy: receipt.query.selection.nominalMaximumDistanceParsec * PARSEC_TO_LIGHT_YEAR,
      recordCount: records.length,
      navigationRecordCount: navigationRecords.length,
      bounds: calculateBounds(records),
      spatialCell: calculateSpatialCellMetadata(records, definition.spatialCell),
      binaryUrl: `./${binaryFile}`,
      metadataUrl: `./${metadataFile}`,
      byteLength: binary.byteLength,
      binaryIntegrity: integrity(binary),
      metadataIntegrity: integrity(metadata),
    });
  });

  if (assignedSourceIds.size !== rows.length) {
    throw new Error(`Chunk assignment covered ${assignedSourceIds.size}/${rows.length} Gaia sources.`);
  }

  const radialVelocityRecordCount = rows.filter((record) => Number.isFinite(record.radialVelocityKmS)).length;
  const radialVelocityFallbackRecordCount = rows.length - radialVelocityRecordCount;
  const exoplanetHostCrossmatchCount = rows.filter((record) =>
    exoplanetHostIdentityByGaiaSourceId.has(record.sourceIdText),
  ).length;

  const manifest = Buffer.from(
    stableJson({
      schemaVersion: 3,
      format: BINARY_FORMAT,
      catalog: receipt.catalog,
      query: receipt.query,
      sourceFile: receipt.sourceFile,
      build: {
        builder: SCRIPT_VERSION,
        deterministic: true,
        recordCount: rows.length,
        navigationRecordCount,
        chunkCount: chunkEntries.length,
        totalBinaryBytes,
        exoplanetHostCrossmatch: {
          method: EXOPLANET_GAIA_CROSSMATCH_METHOD,
          catalogId: exoplanetReceipt.catalog.id,
          catalogVersion: exoplanetReceipt.catalog.version,
          sourceSha256: exoplanetSourceDefinition.sha256,
          matchedRecordCount: exoplanetHostCrossmatchCount,
          navigationGuarantee: "Every exact-match Gaia source is retained as a searchable navigation record, independent of the ordinary per-chunk brightness limit.",
          boundary: "Only exact NASA Exoplanet Archive gaia_dr3_id values present in the receipted SpaceViewer Gaia subset are linked; no positional nearest-neighbour match is inferred.",
        },
        spatialPartition: {
          scheme: "Gaia source_id nested HEALPix",
          level: SPATIAL_HEALPIX_LEVEL,
          cellCount: SPATIAL_HEALPIX_CELL_COUNT,
          sourceIdRightShiftBits: GAIA_HEALPIX_LEVEL_ZERO_SHIFT - SPATIAL_HEALPIX_LEVEL * 2,
          brightCoreMaximumMagnitudeG: 6,
          priorityMetric: "descending-dot-product-of-live-camera-forward-and-source-record-centroid-icrs",
          note: "The all-sky bright core loads first; fainter sources are partitioned into 48 level-1 HEALPix cells encoded by Gaia source_id, then pending cells are reprioritized against the live camera direction.",
        },
        derivedPosition: {
          formula: "distance_pc=1000/parallax_mas; ICRS spherical to heliocentric Cartesian; light_year=parsec*3.2615637771674333",
          caveat: receipt.query.interpretation,
        },
        propagation: {
          referenceEpochJulianYear: 2016,
          minimumJulianYear: 1900,
          maximumJulianYear: 2100,
          model: "uniform-rectilinear-space-motion",
          radialVelocityTreatment: "gaia-dr3-when-available-zero-fallback",
          radialVelocityReferenceFrame: "solar-system-barycentric",
          radialVelocityRecordCount,
          radialVelocityFallbackRecordCount,
          radialVelocityCoverageFraction: radialVelocityRecordCount / rows.length,
          covarianceModel: "full-six-parameter-linearized-jacobian",
          radialVelocityCovarianceTreatment: "independent-spectroscopic-uncertainty-when-available-conditional-zero-otherwise",
          covarianceReferenceUrl: "https://gea.esac.esa.int/archive/documentation/GEDR3/Data_processing/chap_cu3ast/sec_cu3ast_intro/ssec_cu3ast_intro_tansforms.html",
          astrometricCorrelationColumns: [
            "ra_dec_corr",
            "ra_parallax_corr",
            "ra_pmra_corr",
            "ra_pmdec_corr",
            "dec_parallax_corr",
            "dec_pmra_corr",
            "dec_pmdec_corr",
            "parallax_pmra_corr",
            "parallax_pmdec_corr",
            "pmra_pmdec_corr",
          ],
          uncertaintyTreatment: "Selected Gaia navigation stars use the complete six-parameter uniform-rectilinear transform. Forward automatic differentiation evaluates all 36 Jacobian terms, and C=J*C0*J' propagates the ten Gaia within-source astrometric correlations plus independent published radial-velocity uncertainty into the angular confidence ellipse and 3D ICRS Cartesian position ellipsoid.",
          limitations: "Missing radial velocities remain an explicit 0 km/s fallback with covariance conditional on that value because no undocumented velocity-dispersion prior is invented. The model omits light-time, non-single-star acceleration solutions, the parallax zero-point correction, Bayesian distance inference, and between-source correlations.",
        },
        brightnessProxy: {
          scientific: false,
          formula: "clamp(0.04 + pow(clamp(1-(G+2)/11,0,1),0.82)*0.96,0.04,1)",
          purpose: "Display transfer for point size and alpha; the source G magnitude remains authoritative.",
        },
        binaryLayout: {
          headerBytes: HEADER_BYTES,
          byteOrder: "little-endian",
          positionPrecision: "float64",
          scalarPrecision: "float32",
          columns: COLUMN_DEFINITIONS.map(({ key, type }) => ({ key, type })),
        },
      },
      chunks: chunkEntries,
    }),
  );
  files.set("manifest.json", manifest);
  return files;
};

const persistFiles = async (files) => {
  if (!checkOnly) await mkdir(outputDirectory, { recursive: true });
  for (const [filename, content] of files) {
    const destination = resolve(outputDirectory, filename);
    if (checkOnly) {
      const existing = await readFile(destination).catch(() => null);
      if (!existing || !existing.equals(content)) {
        throw new Error(`Generated catalogue asset is missing or stale: ${destination}`);
      }
      continue;
    }
    await writeFile(destination, content);
  }
};

const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
if (receipt?.schemaVersion !== 1 || !receipt.catalog?.id || !receipt.sourceFile?.path) {
  throw new Error("Unsupported or incomplete Gaia catalogue receipt.");
}
const compressedPath = resolve(frontendRoot, receipt.sourceFile.path);
const compressed = await readFile(compressedPath);
if (sha256Hex(compressed) !== receipt.sourceFile.compressedSha256) {
  throw new Error("Gaia source gzip checksum does not match its receipt.");
}
const csvBuffer = gunzipSync(compressed);
if (sha256Hex(csvBuffer) !== receipt.sourceFile.uncompressedSha256) {
  throw new Error("Gaia source CSV checksum does not match its receipt.");
}
const rows = parseCatalogRows(csvBuffer, receipt);
const exoplanetReceipt = JSON.parse(await readFile(exoplanetReceiptPath, "utf8"));
const exoplanetSourceDefinition = exoplanetReceipt.sourceFiles?.find((definition) =>
  definition.path.endsWith(".json.gz"),
);
if (!exoplanetReceipt.catalog?.id || !exoplanetSourceDefinition) {
  throw new Error("Unsupported exoplanet source receipt for Gaia host cross-matching.");
}
const exoplanetCompressed = await readFile(resolve(frontendRoot, exoplanetSourceDefinition.path));
if (
  exoplanetCompressed.byteLength !== exoplanetSourceDefinition.bytes ||
  sha256Hex(exoplanetCompressed) !== exoplanetSourceDefinition.sha256
) {
  throw new Error("Exoplanet source gzip checksum does not match its receipt.");
}
const exoplanetRows = JSON.parse(gunzipSync(exoplanetCompressed).toString("utf8"));
const exoplanetHostIdentityByGaiaSourceId = buildExoplanetHostIdentityIndex(exoplanetRows);
const files = buildFiles(
  receipt,
  rows,
  exoplanetHostIdentityByGaiaSourceId,
  exoplanetReceipt,
  exoplanetSourceDefinition,
);
await persistFiles(files);

console.log(
  `Star catalogue ${checkOnly ? "verified" : "built"}: ${rows.length.toLocaleString()} records, ${createChunkDefinitions().length} chunks, ${outputDirectory}`,
);
