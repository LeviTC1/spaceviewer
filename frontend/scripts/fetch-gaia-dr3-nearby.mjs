#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const TAP_URL = "https://gea.esac.esa.int/tap-server/tap/sync";
const SOURCE_FILENAME = "gaia-dr3-nearby-100pc-g9.csv.gz";
const RECEIPT_FILENAME = "gaia-dr3-nearby-100pc-g9.receipt.json";
const EXPECTED_COLUMNS = [
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

const ADQL = `SELECT ${EXPECTED_COLUMNS.join(", ")}
FROM gaiadr3.gaia_source
WHERE parallax >= 10
  AND parallax_over_error >= 10
  AND phot_g_mean_mag <= 9
  AND (astrometric_params_solved = 31 OR astrometric_params_solved = 95)
  AND duplicated_source = 'false'`;

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(scriptDirectory, "..");
const outputDirectory = resolve(frontendRoot, "catalog-source");
const sourcePath = resolve(outputDirectory, SOURCE_FILENAME);
const receiptPath = resolve(outputDirectory, RECEIPT_FILENAME);

const sha256Hex = (content) => createHash("sha256").update(content).digest("hex");
const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

const fetchCatalogCsv = async () => {
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), 5 * 60 * 1000);
  const body = new URLSearchParams({ REQUEST: "doQuery", LANG: "ADQL", FORMAT: "csv", QUERY: ADQL });
  try {
    const response = await fetch(TAP_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: abortController.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Gaia TAP request failed (${response.status}): ${text.slice(0, 500)}`);
    }
    return text;
  } finally {
    clearTimeout(timeout);
  }
};

const normalizeCsv = (csvText) => {
  const lines = csvText.trim().split(/\r?\n/);
  const header = lines.shift();
  if (header !== EXPECTED_COLUMNS.join(",")) {
    throw new Error(`Unexpected Gaia CSV columns: ${header ?? "missing header"}`);
  }

  const records = lines.map((line, index) => {
    const values = line.split(",");
    if (values.length !== EXPECTED_COLUMNS.length) {
      throw new Error(`Gaia CSV row ${index + 2} has ${values.length} fields; expected ${EXPECTED_COLUMNS.length}.`);
    }
    if (!/^\d+$/.test(values[0])) throw new Error(`Gaia CSV row ${index + 2} has an invalid source_id.`);
    return { sourceId: BigInt(values[0]), line };
  });

  records.sort((left, right) => (left.sourceId < right.sourceId ? -1 : left.sourceId > right.sourceId ? 1 : 0));
  return {
    csv: `${header}\n${records.map((record) => record.line).join("\n")}\n`,
    recordCount: records.length,
  };
};

const retrievedAtArgument = process.argv.find((argument) => argument.startsWith("--retrieved-at="));
const retrievedAt = retrievedAtArgument?.slice("--retrieved-at=".length) ?? new Date().toISOString();
const downloaded = await fetchCatalogCsv();
const normalized = normalizeCsv(downloaded);
const csvBuffer = Buffer.from(normalized.csv, "utf8");
const compressed = gzipSync(csvBuffer, { level: 9, mtime: 0 });

const receipt = {
  schemaVersion: 1,
  catalog: {
    id: "gaia-dr3-nearby-100pc-g9",
    version: "gaia-dr3-nearby-100pc-g9-v2",
    title: "Gaia DR3 nearby stellar visualization subset",
    status: "authoritative-derived-subset",
    referenceFrame: "heliocentric-icrs-cartesian",
    positionUnit: "light-year",
    epoch: { kind: "julian-year", value: "J2016.0", scale: "TCB" },
    provenance: {
      sourceName: "Gaia Data Release 3 gaiadr3.gaia_source",
      sourcePath: `frontend/catalog-source/${SOURCE_FILENAME}`,
      sourceUrl: TAP_URL,
      retrievedAt,
      licenceId: "Gaia DR3 open data with ESA/Gaia/DPAC credit",
      licenceStatus: "verified",
      credit: "ESA/Gaia/DPAC",
      documentationUrl: "https://gea.esac.esa.int/archive/documentation/GDR3/",
      creditsUrl:
        "https://gea.esac.esa.int/archive/documentation/GDR3/Miscellaneous/sec_credit_and_citation_instructions/",
      notes:
        "Gaia DR3 data are open and free to use with ESA/Gaia/DPAC credit. This visualization-oriented subset includes optional Solar-system-barycentric radial velocity and the published within-source astrometric correlations; it is not a statistically complete volume sample.",
    },
  },
  query: {
    language: "ADQL",
    table: "gaiadr3.gaia_source",
    text: ADQL,
    selection: {
      nominalMaximumDistanceParsec: 100,
      parallaxMinimumMas: 10,
      parallaxSignalToNoiseMinimum: 10,
      maximumApparentMagnitudeG: 9,
      astrometricSolutions: [31, 95],
      excludesDuplicatedSourceFlag: true,
    },
    interpretation:
      "Distances are the naive inverse of positive Gaia parallax for rendering. The selection limits fractional parallax uncertainty but does not apply the Gaia parallax zero-point correction or a Bayesian distance prior.",
  },
  sourceFile: {
    path: `catalog-source/${SOURCE_FILENAME}`,
    format: "csv",
    contentEncoding: "gzip",
    columns: EXPECTED_COLUMNS,
    recordCount: normalized.recordCount,
    uncompressedBytes: csvBuffer.byteLength,
    compressedBytes: compressed.byteLength,
    uncompressedSha256: sha256Hex(csvBuffer),
    compressedSha256: sha256Hex(compressed),
  },
};

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(sourcePath, compressed),
  writeFile(receiptPath, stableJson(receipt)),
]);

console.log(
  `Gaia DR3 subset fetched: ${normalized.recordCount.toLocaleString()} records, ${compressed.byteLength.toLocaleString()} compressed bytes`,
);
