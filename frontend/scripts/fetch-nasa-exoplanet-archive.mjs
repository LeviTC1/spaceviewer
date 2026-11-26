#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";

const RETRIEVED_AT = "2026-11-24T00:00:00.000Z";
const MINIMUM_EXPECTED_PLANETS = 5_000;
// Every confirmed planet with a published host distance (microlensing hosts reach ~8 kpc).
const MAXIMUM_DISTANCE_PC = 20_000;
const COLUMNS = [
  "pl_name", "hostname", "pl_letter", "gaia_dr2_id", "gaia_dr3_id", "hip_name", "hd_name", "tic_id",
  "ra", "dec", "sy_dist", "sy_disterr1", "sy_disterr2", "sy_vmag", "sy_kmag", "disc_year",
  "discoverymethod", "disc_facility", "disc_telescope", "pl_orbper", "pl_orbpererr1", "pl_orbpererr2",
  "pl_orbsmax", "pl_orbsmaxerr1", "pl_orbsmaxerr2", "pl_rade", "pl_radeerr1", "pl_radeerr2",
  "pl_bmasse", "pl_bmasseerr1", "pl_bmasseerr2", "pl_eqt", "pl_eqterr1", "pl_eqterr2",
  "st_teff", "st_tefferr1", "st_tefferr2", "st_spectype", "st_lum", "st_rad", "st_mass",
];
const PREDICATE = `sy_dist is not null and ra is not null and dec is not null and sy_dist <= ${MAXIMUM_DISTANCE_PC}`;
const QUERY = `select ${COLUMNS.join(",")} from pscomppars where ${PREDICATE}`;
const TAP_URL = "https://exoplanetarchive.ipac.caltech.edu/TAP/sync";
const ACKNOWLEDGMENT_URL = "https://exoplanetarchive.ipac.caltech.edu/docs/acknowledge.html";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(scriptDirectory, "..");
const outputDirectory = resolve(frontendRoot, "catalog-source/nasa-exoplanet-archive-nearby");
const dataPath = resolve(outputDirectory, "pscomppars-nearby.json.gz");
const acknowledgmentPath = resolve(outputDirectory, "ACKNOWLEDGMENT.html");
const receiptPath = resolve(outputDirectory, "source-receipt.json");
const checkOnly = process.argv.includes("--check");
const sha256Hex = (content) => createHash("sha256").update(content).digest("hex");
const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

const validateRows = (rows) => {
  if (!Array.isArray(rows) || rows.length < MINIMUM_EXPECTED_PLANETS) {
    throw new Error(`NASA Exoplanet Archive selection returned ${Array.isArray(rows) ? rows.length : "invalid"} rows.`);
  }
  const planetNames = new Set();
  for (const [index, row] of rows.entries()) {
    if (
      typeof row.pl_name !== "string" || !row.pl_name.trim() ||
      typeof row.hostname !== "string" || !row.hostname.trim() ||
      !Number.isFinite(row.ra) || row.ra < 0 || row.ra >= 360 ||
      !Number.isFinite(row.dec) || row.dec < -90 || row.dec > 90 ||
      !Number.isFinite(row.sy_dist) || row.sy_dist <= 0 || row.sy_dist > MAXIMUM_DISTANCE_PC
    ) {
      throw new Error(`Invalid nearby confirmed-planet row ${index + 1}.`);
    }
    if (planetNames.has(row.pl_name)) throw new Error(`Duplicate confirmed planet ${row.pl_name}.`);
    planetNames.add(row.pl_name);
  }
  return rows;
};

const buildReceipt = (rows, compressedData, acknowledgment) => ({
  schemaVersion: 1,
  catalog: {
    id: "nasa-exoplanet-archive-pscomppars-all",
    version: `pscomppars-snapshot-${RETRIEVED_AT.slice(0, 10)}`,
    title: "NASA Exoplanet Archive Planetary Systems Composite Parameters nearby confirmed planets",
    table: "pscomppars",
    retrievedAt: RETRIEVED_AT,
    tapUrl: TAP_URL,
    query: QUERY,
    queryDocumentationUrl: "https://exoplanetarchive.ipac.caltech.edu/docs/TAP/usingTAP.html",
    columnDocumentationUrl: "https://exoplanetarchive.ipac.caltech.edu/docs/API_PS_columns.html",
    compositeTableDocumentationUrl: "https://exoplanetarchive.ipac.caltech.edu/docs/pscp_about.html",
    acknowledgmentUrl: ACKNOWLEDGMENT_URL,
    archivePaper: "The NASA Exoplanet Archive: Data and Tools for Exoplanet Research",
    archivePaperYear: 2025,
    selection: {
      predicate: PREDICATE,
      maximumDistancePc: MAXIMUM_DISTANCE_PC,
      planetCount: rows.length,
      hostCount: new Set(rows.map((row) => row.hostname)).size,
    },
    provenance: {
      licenceStatus: "NASA-public-data-attribution-required",
      credit: "NASA Exoplanet Archive, operated by Caltech under contract with NASA's Exoplanet Exploration Program",
      acknowledgmentRequired: true,
      usageBoundary: "The archive aggregates published literature. Parameter-level literature references and any third-party rights remain with their originating sources.",
    },
  },
  sourceFiles: [
    {
      path: "catalog-source/nasa-exoplanet-archive-nearby/pscomppars-nearby.json.gz",
      url: `${TAP_URL}?query=${encodeURIComponent(QUERY)}&format=json`,
      bytes: compressedData.byteLength,
      sha256: sha256Hex(compressedData),
      contentEncoding: "gzip",
    },
    {
      path: "catalog-source/nasa-exoplanet-archive-nearby/ACKNOWLEDGMENT.html",
      url: ACKNOWLEDGMENT_URL,
      bytes: acknowledgment.byteLength,
      sha256: sha256Hex(acknowledgment),
    },
  ],
});

if (checkOnly) {
  const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
  if (receipt.schemaVersion !== 1 || receipt.catalog?.query !== QUERY || receipt.catalog?.table !== "pscomppars") {
    throw new Error("NASA Exoplanet Archive source receipt does not match the current fetch contract.");
  }
  for (const definition of receipt.sourceFiles) {
    const content = await readFile(resolve(frontendRoot, definition.path));
    if (content.byteLength !== definition.bytes || sha256Hex(content) !== definition.sha256) {
      throw new Error(`Pinned exoplanet source does not match its receipt: ${definition.path}`);
    }
  }
  const rows = validateRows(JSON.parse(gunzipSync(await readFile(dataPath)).toString("utf8")));
  if (
    rows.length !== receipt.catalog.selection.planetCount ||
    new Set(rows.map((row) => row.hostname)).size !== receipt.catalog.selection.hostCount
  ) {
    throw new Error("NASA Exoplanet Archive source counts do not match the receipt.");
  }
  console.log(`NASA Exoplanet Archive source check passed: ${rows.length.toLocaleString()} planets, ${receipt.catalog.selection.hostCount.toLocaleString()} hosts`);
} else {
  const tapRequest = new URL(TAP_URL);
  tapRequest.searchParams.set("query", QUERY);
  tapRequest.searchParams.set("format", "json");
  const [dataResponse, acknowledgmentResponse] = await Promise.all([
    fetch(tapRequest, { redirect: "follow" }),
    fetch(ACKNOWLEDGMENT_URL, { redirect: "follow" }),
  ]);
  if (!dataResponse.ok) throw new Error(`NASA Exoplanet Archive TAP request failed (${dataResponse.status} ${dataResponse.statusText}).`);
  if (!acknowledgmentResponse.ok) throw new Error(`NASA Exoplanet Archive acknowledgment fetch failed (${acknowledgmentResponse.status}).`);
  const rows = validateRows(await dataResponse.json());
  rows.sort((left, right) => left.hostname.localeCompare(right.hostname) || left.pl_name.localeCompare(right.pl_name));
  const compressedData = gzipSync(Buffer.from(stableJson(rows)), { level: 9 });
  const acknowledgment = Buffer.from(await acknowledgmentResponse.arrayBuffer());
  const receipt = buildReceipt(rows, compressedData, acknowledgment);
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(dataPath, compressedData),
    writeFile(acknowledgmentPath, acknowledgment),
    writeFile(receiptPath, stableJson(receipt)),
  ]);
  console.log(`NASA Exoplanet Archive source fetched: ${rows.length.toLocaleString()} planets, ${receipt.catalog.selection.hostCount.toLocaleString()} hosts`);
}
