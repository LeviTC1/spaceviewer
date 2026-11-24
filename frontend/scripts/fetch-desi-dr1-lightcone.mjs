#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_SOURCE_RECORD_COUNT = 217_614;
const RETRIEVED_AT = "2026-09-02T00:00:00.000Z";
const files = [
  {
    name: "BGS_BRIGHT-21.5_NGC_clustering.dat.fits",
    url: "https://data.desi.lbl.gov/public/dr1/survey/catalogs/dr1/LSS/iron/LSScats/v1.5/BGS_BRIGHT-21.5_NGC_clustering.dat.fits",
    bytes: 25_470_720,
    sha256: "b67e8e3ee579d9673089f2c9c6930b793a2bf1895f85198472fb7fc5aa392825",
  },
  {
    name: "BGS_BRIGHT-21.5_NGC_nz.txt",
    url: "https://data.desi.lbl.gov/public/dr1/survey/catalogs/dr1/LSS/iron/LSScats/v1.5/BGS_BRIGHT-21.5_NGC_nz.txt",
    bytes: 3_214,
    sha256: "bae3d1571be58e3ba476ee7afd3b48d09219679b17ccc3a973058b1a9f4eb4b0",
  },
  {
    name: "DESI_LICENSE.html",
    url: "https://data.desi.lbl.gov/doc/acknowledgments/",
    bytes: 24_346,
    sha256: "8dc6b564d41d1d3039be4bcc6035602b7535a437856785b9025cfb3e84c47e48",
  },
];

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(scriptDirectory, "..");
const outputDirectory = resolve(frontendRoot, "catalog-source/desi-dr1-lightcone");
const receiptPath = resolve(outputDirectory, "source-receipt.json");
const checkOnly = process.argv.includes("--check");
const sha256Hex = (content) => createHash("sha256").update(content).digest("hex");
const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

const validate = (definition, content) => {
  const digest = sha256Hex(content);
  if (content.byteLength !== definition.bytes || digest !== definition.sha256) {
    throw new Error(
      `${definition.name} is ${content.byteLength} bytes with SHA-256 ${digest}; expected ${definition.bytes} bytes and ${definition.sha256}.`,
    );
  }
};

const parseFitsHeader = (buffer, offset) => {
  const cards = new Map();
  let cursor = offset;
  for (;;) {
    const card = buffer.toString("ascii", cursor, cursor + 80);
    const keyword = card.slice(0, 8).trim();
    if (keyword && card[8] === "=") cards.set(keyword, card.slice(10).split("/")[0].trim().replace(/^'|'$/g, "").trim());
    cursor += 80;
    if (keyword === "END") break;
    if (cursor > buffer.byteLength) throw new Error("DESI FITS header is unterminated.");
  }
  return { cards, byteLength: Math.ceil((cursor - offset) / 2_880) * 2_880 };
};

const resolveFile = async (definition) => {
  const content = checkOnly
    ? await readFile(resolve(outputDirectory, definition.name))
    : Buffer.from(await (async () => {
        const response = await fetch(definition.url, { redirect: "follow" });
        if (!response.ok) throw new Error(`${definition.name} download failed (${response.status} ${response.statusText}).`);
        return response.arrayBuffer();
      })());
  validate(definition, content);
  return { definition, content };
};

const resolvedFiles = await Promise.all(files.map(resolveFile));
const fits = resolvedFiles.find(({ definition }) => definition.name.endsWith(".fits"))?.content;
if (!fits) throw new Error("DESI FITS source is missing.");
const primary = parseFitsHeader(fits, 0);
const table = parseFitsHeader(fits, primary.byteLength);
const sourceRecordCount = Number(table.cards.get("NAXIS2"));
if (
  table.cards.get("XTENSION") !== "BINTABLE" ||
  table.cards.get("DESIDR") !== "dr1" ||
  sourceRecordCount !== EXPECTED_SOURCE_RECORD_COUNT
) {
  throw new Error(`Unexpected DESI clustering FITS identity or row count (${sourceRecordCount}).`);
}

const receipt = {
  schemaVersion: 1,
  catalog: {
    id: "desi-dr1-lss-iron-v1.5-bgs-bright-21.5-ngc",
    version: "DR1-iron-LSScats-v1.5",
    title: "DESI DR1 BGS_BRIGHT-21.5 NGC clustering catalogue",
    releaseDate: "2025-03-19",
    retrievedAt: RETRIEVED_AT,
    sourceRecordCount,
    dataReleaseUrl: "https://data.desi.lbl.gov/doc/releases/dr1/",
    dataModelUrl: "https://desidatamodel.readthedocs.io/en/stable/DESI_ROOT/survey/catalogs/RELEASE/LSS/SPECPROD/LSScats/VERSION/data_clustering.html",
    samplePaper: "DESI 2024 II: Sample Definitions, Characteristics, and Two-point Clustering Statistics",
    samplePaperDoi: "10.1088/1475-7516/2025/07/017",
    samplePaperUrl: "https://doi.org/10.1088/1475-7516/2025/07/017",
    provenance: {
      licenceId: "CC-BY-4.0",
      licenceStatus: "verified-redistributable-with-attribution",
      licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
      desiAcknowledgmentsUrl: "https://data.desi.lbl.gov/doc/acknowledgments/",
      licenceSummary: "DESI DR1 is released under CC BY 4.0; attribution and the DESI acknowledgment text are required.",
      credit: "DESI Collaboration; DESI Data Release 1; LSS iron clustering catalogues v1.5",
    },
  },
  sourceFiles: resolvedFiles.map(({ definition }) => ({
    path: `catalog-source/desi-dr1-lightcone/${definition.name}`,
    url: definition.url,
    bytes: definition.bytes,
    sha256: definition.sha256,
  })),
};
const receiptBuffer = Buffer.from(stableJson(receipt));

if (checkOnly) {
  const actualReceipt = await readFile(receiptPath).catch(() => null);
  if (!actualReceipt?.equals(receiptBuffer)) throw new Error("DESI DR1 source receipt is stale.");
  console.log(`DESI DR1 source check passed: ${sourceRecordCount.toLocaleString()} records, ${files.length} pinned files`);
} else {
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    ...resolvedFiles.map(({ definition, content }) => writeFile(resolve(outputDirectory, definition.name), content)),
    writeFile(receiptPath, receiptBuffer),
  ]);
  console.log(`DESI DR1 source fetched: ${sourceRecordCount.toLocaleString()} records, ${files.length} pinned files`);
}
