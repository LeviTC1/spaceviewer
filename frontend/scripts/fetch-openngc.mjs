#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync, gunzipSync } from "node:zlib";

const RELEASE_TAG = "v20260501";
const RELEASE_COMMIT = "36cb178a0f69dba8bfc03a99c10512831edf1c6b";
const RETRIEVED_AT = "2026-09-02T00:00:00.000Z";
const REPOSITORY_URL = "https://github.com/mattiaverga/OpenNGC";
const RELEASE_URL = `${REPOSITORY_URL}/releases/tag/${RELEASE_TAG}`;
const RAW_ROOT = `https://raw.githubusercontent.com/mattiaverga/OpenNGC/${RELEASE_COMMIT}`;
const EXPECTED_COUNTS = { "NGC.csv": 13_969, "addendum.csv": 64 };
const REQUIRED_COLUMNS = [
  "Name", "Type", "RA", "Dec", "Const", "MajAx", "MinAx", "PosAng", "B-Mag", "V-Mag",
  "SurfBr", "Hubble", "RadVel", "Redshift", "M", "NGC", "IC", "Identifiers", "Common names", "Sources",
];
const SOURCE_DEFINITIONS = [
  { name: "NGC.csv", url: `${RAW_ROOT}/database_files/NGC.csv`, encoding: "gzip" },
  { name: "addendum.csv", url: `${RAW_ROOT}/database_files/addendum.csv`, encoding: "gzip" },
  { name: "README.md", url: `${RAW_ROOT}/README.md` },
  { name: "NGC_guide.txt", url: `${RAW_ROOT}/NGC_guide.txt` },
  { name: "CC-BY-SA-4.0.txt", url: `${RAW_ROOT}/LICENSES/CC-BY-SA-4.0.txt` },
];

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(scriptDirectory, "..");
const outputDirectory = resolve(frontendRoot, "catalog-source/openngc-v20260501");
const receiptPath = resolve(outputDirectory, "source-receipt.json");
const checkOnly = process.argv.includes("--check");
const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256Hex = (content) => createHash("sha256").update(content).digest("hex");

const validateCsv = (name, content) => {
  const text = content.toString("utf8");
  const lines = text.trim().split(/\r?\n/);
  const columns = lines[0]?.split(";") ?? [];
  const missing = REQUIRED_COLUMNS.filter((column) => !columns.includes(column));
  if (missing.length) throw new Error(`${name} is missing OpenNGC columns: ${missing.join(", ")}`);
  const recordCount = lines.length - 1;
  if (recordCount !== EXPECTED_COUNTS[name]) {
    throw new Error(`${name} contains ${recordCount.toLocaleString()} records; expected ${EXPECTED_COUNTS[name]?.toLocaleString()}.`);
  }
  return { columns, recordCount };
};

if (checkOnly) {
  const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
  if (
    receipt.schemaVersion !== 1 || receipt.catalog?.releaseTag !== RELEASE_TAG ||
    receipt.catalog?.releaseCommit !== RELEASE_COMMIT || receipt.catalog?.licenceId !== "CC-BY-SA-4.0"
  ) throw new Error("OpenNGC source receipt does not match the current fetch contract.");
  for (const definition of receipt.sourceFiles) {
    const content = await readFile(resolve(frontendRoot, definition.path));
    if (content.byteLength !== definition.bytes || sha256Hex(content) !== definition.sha256) {
      throw new Error(`Pinned OpenNGC source does not match its receipt: ${definition.path}`);
    }
    if (definition.contentEncoding === "gzip") {
      const raw = gunzipSync(content);
      if (raw.byteLength !== definition.uncompressedBytes || sha256Hex(raw) !== definition.uncompressedSha256) {
        throw new Error(`Compressed OpenNGC source failed raw-content validation: ${definition.path}`);
      }
      validateCsv(definition.sourceName, raw);
    }
  }
  console.log(`OpenNGC ${RELEASE_TAG} source check passed: ${receipt.catalog.sourceRecordCount.toLocaleString()} records at ${RELEASE_COMMIT.slice(0, 10)}`);
} else {
  const downloaded = await Promise.all(SOURCE_DEFINITIONS.map(async (definition) => {
    const response = await fetch(definition.url, { redirect: "follow" });
    if (!response.ok) throw new Error(`OpenNGC ${definition.name} fetch failed (${response.status} ${response.statusText}).`);
    const raw = Buffer.from(await response.arrayBuffer());
    const csv = definition.encoding === "gzip" ? validateCsv(definition.name, raw) : null;
    const stored = definition.encoding === "gzip" ? gzipSync(raw, { level: 9, mtime: 0 }) : raw;
    const filename = definition.encoding === "gzip" ? `${definition.name}.gz` : definition.name;
    return { definition, raw, stored, filename, csv };
  }));
  const sourceRecordCount = downloaded.reduce((sum, file) => sum + (file.csv?.recordCount ?? 0), 0);
  const receipt = {
    schemaVersion: 1,
    catalog: {
      id: "openngc-deep-sky",
      title: "OpenNGC NGC/IC objects database",
      releaseTag: RELEASE_TAG,
      releaseCommit: RELEASE_COMMIT,
      retrievedAt: RETRIEVED_AT,
      repositoryUrl: REPOSITORY_URL,
      releaseUrl: RELEASE_URL,
      doi: "10.21938/y.1ejWUD_MQ6b_eDFoVbbw",
      creator: "Mattia Verga and OpenNGC contributors",
      licenceId: "CC-BY-SA-4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
      credit: "OpenNGC by Mattia Verga and contributors",
      sourceRecordCount,
      sourceBoundary: "OpenNGC merges NED, HyperLEDA, SIMBAD, HEASARC and Harold Corwin catalogue material. Per-field source codes remain described by the pinned guide; source precision and availability vary by object.",
    },
    sourceFiles: downloaded.map(({ definition, raw, stored, filename, csv }) => ({
      sourceName: definition.name,
      path: `catalog-source/openngc-v20260501/${filename}`,
      url: definition.url,
      bytes: stored.byteLength,
      sha256: sha256Hex(stored),
      ...(definition.encoding === "gzip" ? {
        contentEncoding: "gzip",
        uncompressedBytes: raw.byteLength,
        uncompressedSha256: sha256Hex(raw),
        recordCount: csv.recordCount,
        columns: csv.columns,
      } : {}),
    })),
  };
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    ...downloaded.map((file) => writeFile(resolve(outputDirectory, file.filename), file.stored)),
    writeFile(receiptPath, stableJson(receipt)),
  ]);
  console.log(`OpenNGC ${RELEASE_TAG} fetched: ${sourceRecordCount.toLocaleString()} records at ${RELEASE_COMMIT.slice(0, 10)}`);
}
