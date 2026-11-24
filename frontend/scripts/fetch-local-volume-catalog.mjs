#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const RELEASE_TAG = "v1.1.1";
const RELEASE_DATE = "2026-08-12";
const SOURCE_FILENAME = `lvdb-${RELEASE_TAG}-comb_all.csv.gz`;
const RECEIPT_FILENAME = `lvdb-${RELEASE_TAG}-comb_all.receipt.json`;
const SOURCE_URL = `https://github.com/apace7/local_volume_database/releases/download/${RELEASE_TAG}/comb_all.csv`;
const RELEASE_URL = `https://github.com/apace7/local_volume_database/releases/tag/${RELEASE_TAG}`;
const EXPECTED_RECORD_COUNT = 1727;
const REQUIRED_COLUMNS = [
  "key",
  "ra",
  "dec",
  "name",
  "host",
  "confirmed_real",
  "confirmed_galaxy",
  "distance_modulus",
  "distance_modulus_em",
  "distance_modulus_ep",
  "ref_distance",
  "apparent_magnitude_v",
  "vlos_systemic",
  "pmra",
  "pmdec",
  "M_V",
  "mass_stellar",
  "distance",
  "distance_em",
  "distance_ep",
  "sg_xx",
  "sg_yy",
  "sg_zz",
  "distance_m31",
  "distance_lg",
  "distance_host",
  "distance_measurement_method",
  "table",
];

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(scriptDirectory, "..");
const outputDirectory = resolve(frontendRoot, "catalog-source");

const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256Hex = (content) => createHash("sha256").update(content).digest("hex");

const response = await fetch(SOURCE_URL, { redirect: "follow" });
if (!response.ok) throw new Error(`LVDB release download failed (${response.status} ${response.statusText}).`);

const downloadedText = await response.text();
const normalizedText = `${downloadedText.replace(/\r\n/g, "\n").trimEnd()}\n`;
const lines = normalizedText.split("\n");
const columns = lines[0]?.split(",") ?? [];
const missingColumns = REQUIRED_COLUMNS.filter((column) => !columns.includes(column));
if (missingColumns.length) throw new Error(`LVDB release is missing required columns: ${missingColumns.join(", ")}`);

const recordCount = lines.length - 2;
if (recordCount !== EXPECTED_RECORD_COUNT) {
  throw new Error(`LVDB ${RELEASE_TAG} contains ${recordCount} records; expected ${EXPECTED_RECORD_COUNT}.`);
}

const csvBuffer = Buffer.from(normalizedText, "utf8");
const compressed = gzipSync(csvBuffer, { level: 9, mtime: 0 });
const retrievedAtArgument = process.argv.find((argument) => argument.startsWith("--retrieved-at="));
const retrievedAt = retrievedAtArgument?.slice("--retrieved-at=".length) ?? new Date().toISOString();

const receipt = {
  schemaVersion: 1,
  catalog: {
    id: "local-volume-database-combined",
    version: RELEASE_TAG,
    title: "Local Volume Database combined catalogue",
    status: "authoritative-source-snapshot",
    releaseDate: RELEASE_DATE,
    provenance: {
      sourceName: "Local Volume Database",
      sourceUrl: SOURCE_URL,
      releaseUrl: RELEASE_URL,
      repositoryUrl: "https://github.com/apace7/local_volume_database",
      retrievedAt,
      licenceId: "CC0-1.0",
      licenceStatus: "verified",
      licenceUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      citationDoi: "10.33232/001c.144859",
      archiveDoi: "10.5281/zenodo.14076714",
      credit: "Pace et al., Local Volume Database",
    },
  },
  sourceFile: {
    path: `catalog-source/${SOURCE_FILENAME}`,
    format: "csv",
    contentEncoding: "gzip",
    recordCount,
    columns,
    uncompressedBytes: csvBuffer.byteLength,
    compressedBytes: compressed.byteLength,
    uncompressedSha256: sha256Hex(csvBuffer),
    compressedSha256: sha256Hex(compressed),
  },
};

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(resolve(outputDirectory, SOURCE_FILENAME), compressed),
  writeFile(resolve(outputDirectory, RECEIPT_FILENAME), stableJson(receipt)),
]);

console.log(`LVDB ${RELEASE_TAG} fetched: ${recordCount.toLocaleString()} records, ${compressed.byteLength.toLocaleString()} compressed bytes`);
