#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const SCRIPT_VERSION = "spaceviewer-local-group-builder-v1";
const EXPECTED_RECORD_COUNT = 117;
const PARSEC_TO_LIGHT_YEAR = 3.2615637771674333;
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(scriptDirectory, "..");
const receiptPath = resolve(frontendRoot, "catalog-source/lvdb-v1.1.1-comb_all.receipt.json");
const outputPath = resolve(frontendRoot, "src/generated/localGroupCatalog.generated.json");
const manifestPath = resolve(frontendRoot, "public/catalogs/local-group/manifest.json");
const checkOnly = process.argv.includes("--check");

const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256Hex = (content) => createHash("sha256").update(content).digest("hex");
const parseOptionalNumber = (value) => {
  if (value == null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const parseFlag = (value) => value === "1";
const normalizeUncertainty = (value) => {
  const parsed = parseOptionalNumber(value);
  return parsed === 0 ? null : parsed;
};

const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (character !== "\r") field += character;
  }
  if (quoted) throw new Error("LVDB CSV ended inside a quoted field.");
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
};

const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
const sourcePath = resolve(frontendRoot, receipt.sourceFile.path.replace(/^frontend\//, ""));
const compressed = await readFile(sourcePath);
if (sha256Hex(compressed) !== receipt.sourceFile.compressedSha256) {
  throw new Error("LVDB source checksum does not match its receipt.");
}
const source = gunzipSync(compressed);
if (sha256Hex(source) !== receipt.sourceFile.uncompressedSha256) {
  throw new Error("LVDB uncompressed checksum does not match its receipt.");
}

const csvRows = parseCsv(source.toString("utf8"));
const headers = csvRows.shift();
if (!headers?.length) throw new Error("LVDB source has no header.");
const rowObjects = csvRows.filter((row) => row.some(Boolean)).map((values, rowIndex) => {
  if (values.length !== headers.length) {
    throw new Error(`LVDB row ${rowIndex + 2} has ${values.length} fields; expected ${headers.length}.`);
  }
  return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
});
if (rowObjects.length !== receipt.sourceFile.recordCount) {
  throw new Error(`LVDB receipt records ${receipt.sourceFile.recordCount}; source contains ${rowObjects.length}.`);
}

const isLocalGroupRecord = (row) => {
  if (row.table === "misc") return row.key === "m_031" || row.key === "m_033";
  if (!parseFlag(row.confirmed_real) || !parseFlag(row.confirmed_galaxy)) return false;
  if (row.table === "dwarf_mw" || row.table === "dwarf_m31") return true;
  return row.table === "dwarf_local_field" && (parseOptionalNumber(row.distance) ?? Infinity) <= 1400;
};

const stableObjectId = (key) => {
  if (key === "m_031") return "deep:galaxy:andromeda-galaxy";
  if (key === "m_033") return "deep:galaxy:triangulum-galaxy";
  if (key === "lmc") return "deep:galaxy:large-magellanic-cloud";
  if (key === "smc") return "deep:galaxy:small-magellanic-cloud";
  return `deep:galaxy:lvdb-${key.replace(/_/g, "-")}`;
};

const membershipFor = (row) => {
  if (row.table === "dwarf_mw") return "milky-way-satellite";
  if (row.table === "dwarf_m31") return "m31-satellite";
  if (row.key === "m_031") return "local-group-major";
  if (row.key === "m_033") return "m33-subgroup";
  return "local-group-field";
};

const hostObjectIdFor = (row) => {
  if (row.key === "m_031") return null;
  if (row.host === "mw") return "galactic:milky-way-structure";
  if (row.host === "m_031") return "deep:galaxy:andromeda-galaxy";
  if (row.host === "m_033") return "deep:galaxy:triangulum-galaxy";
  if (row.host === "lmc") return "deep:galaxy:large-magellanic-cloud";
  if (row.host === "smc") return "deep:galaxy:small-magellanic-cloud";
  return null;
};

const records = rowObjects.filter(isLocalGroupRecord).map((row) => {
  const distanceKpc = parseOptionalNumber(row.distance);
  const sgXKpc = parseOptionalNumber(row.sg_xx);
  const sgYKpc = parseOptionalNumber(row.sg_yy);
  const sgZKpc = parseOptionalNumber(row.sg_zz);
  if (distanceKpc == null || distanceKpc <= 0 || sgXKpc == null || sgYKpc == null || sgZKpc == null) {
    throw new Error(`Selected LVDB object ${row.key} lacks a finite physical position.`);
  }
  const vectorDistance = Math.hypot(sgXKpc, sgYKpc, sgZKpc);
  if (Math.abs(vectorDistance - distanceKpc) / distanceKpc > 0.002) {
    throw new Error(`Selected LVDB object ${row.key} has inconsistent supergalactic coordinates.`);
  }

  return {
    id: stableObjectId(row.key),
    sourceKey: row.key,
    name: row.name || row.key,
    aliases: [row.key.replace(/_/g, " ")],
    hostKey: row.host || null,
    hostObjectId: hostObjectIdFor(row),
    sourceTable: row.table,
    membership: membershipFor(row),
    confirmedReal: parseFlag(row.confirmed_real) || row.table === "misc",
    confirmedGalaxy: parseFlag(row.confirmed_galaxy) || row.table === "misc",
    raDeg: parseOptionalNumber(row.ra),
    decDeg: parseOptionalNumber(row.dec),
    distanceKpc,
    distanceErrorMinusKpc: normalizeUncertainty(row.distance_em),
    distanceErrorPlusKpc: normalizeUncertainty(row.distance_ep),
    distanceLy: distanceKpc * 1000 * PARSEC_TO_LIGHT_YEAR,
    distanceModulus: parseOptionalNumber(row.distance_modulus),
    distanceReference: row.ref_distance || null,
    distanceMeasurementMethod: row.distance_measurement_method || null,
    apparentMagnitudeV: parseOptionalNumber(row.apparent_magnitude_v),
    absoluteMagnitudeV: parseOptionalNumber(row.M_V),
    stellarMassSolar: parseOptionalNumber(row.mass_stellar),
    radialVelocityKmS: parseOptionalNumber(row.vlos_systemic),
    radialVelocityErrorMinusKmS: normalizeUncertainty(row.vlos_systemic_em),
    radialVelocityErrorPlusKmS: normalizeUncertainty(row.vlos_systemic_ep),
    properMotionRaMasYr: parseOptionalNumber(row.pmra),
    properMotionRaErrorMinusMasYr: normalizeUncertainty(row.pmra_em),
    properMotionRaErrorPlusMasYr: normalizeUncertainty(row.pmra_ep),
    properMotionDecMasYr: parseOptionalNumber(row.pmdec),
    properMotionDecErrorMinusMasYr: normalizeUncertainty(row.pmdec_em),
    properMotionDecErrorPlusMasYr: normalizeUncertainty(row.pmdec_ep),
    supergalacticKpc: { x: sgXKpc, y: sgYKpc, z: sgZKpc },
    distanceFromM31Kpc: parseOptionalNumber(row.distance_m31),
    distanceFromLocalGroupCenterKpc: parseOptionalNumber(row.distance_lg),
    distanceFromHostKpc: parseOptionalNumber(row.distance_host),
  };
});

records.sort((left, right) => left.distanceKpc - right.distanceKpc || left.sourceKey.localeCompare(right.sourceKey));
if (records.length !== EXPECTED_RECORD_COUNT) {
  throw new Error(`Local Group selection produced ${records.length} records; expected ${EXPECTED_RECORD_COUNT}.`);
}
const ids = new Set(records.map((record) => record.id));
if (ids.size !== records.length) throw new Error("Local Group selection produced duplicate object IDs.");

const generated = {
  schemaVersion: 1,
  catalog: {
    id: "lvdb-local-group-v1",
    version: receipt.catalog.version,
    title: "SpaceViewer Local Group physical-coordinate subset",
    sourceCatalog: receipt.catalog.title,
    sourceReleaseDate: receipt.catalog.releaseDate,
    sourceUrl: receipt.catalog.provenance.sourceUrl,
    releaseUrl: receipt.catalog.provenance.releaseUrl,
    licenceId: receipt.catalog.provenance.licenceId,
    licenceUrl: receipt.catalog.provenance.licenceUrl,
    citationDoi: receipt.catalog.provenance.citationDoi,
    archiveDoi: receipt.catalog.provenance.archiveDoi,
    referenceFrame: "supergalactic-cartesian",
    positionUnit: "kiloparsec",
    epoch: "J2000 ICRS input transformed by the upstream LVDB pipeline",
  },
  selection: {
    description: "Confirmed galaxies associated with the Milky Way or M31 plus confirmed Local Group field galaxies within 1.4 Mpc, M31, and M33.",
    confirmedFlagsRequired: true,
    localGroupBoundaryKpc: 1400,
    tables: ["dwarf_mw", "dwarf_m31", "dwarf_local_field", "misc"],
    miscKeys: ["m_031", "m_033"],
  },
  projectionBoundary: {
    sourceCoordinates: "Heliocentric supergalactic Cartesian positions in physical kiloparsecs",
    renderedRadius: "Logarithmically compressed in scene space; direction is preserved while radial separation is not linear",
  },
  build: {
    scriptVersion: SCRIPT_VERSION,
    sourceSha256: receipt.sourceFile.uncompressedSha256,
    recordCount: records.length,
    minimumDistanceKpc: records[0].distanceKpc,
    maximumDistanceKpc: records.at(-1).distanceKpc,
  },
  records,
};
const generatedBuffer = Buffer.from(stableJson(generated));
const manifestBuffer = Buffer.from(stableJson({
  schemaVersion: 1,
  catalog: generated.catalog,
  selection: generated.selection,
  projectionBoundary: generated.projectionBoundary,
  build: { ...generated.build, generatedSha256: sha256Hex(generatedBuffer) },
}));

const outputs = [[outputPath, generatedBuffer], [manifestPath, manifestBuffer]];
if (checkOnly) {
  for (const [target, expected] of outputs) {
    const actual = await readFile(target).catch(() => null);
    if (!actual?.equals(expected)) throw new Error(`Generated Local Group asset is stale: ${target}`);
  }
  console.log(`Local Group catalogue check passed: ${records.length} records`);
} else {
  await Promise.all(outputs.map(async ([target, content]) => {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }));
  console.log(`Local Group catalogue built: ${records.length} records`);
}
