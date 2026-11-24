#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const SOURCE_PAGE_URL = "https://iauarchive.eso.org/public/themes/constellations/";
const SOURCE_BASE_URL = "https://iauarchive.eso.org/static/public/constellations/txt";
const SOURCE_FILENAME = "iau-constellation-boundaries-j2000-v1.json.gz";
const RECEIPT_FILENAME = "iau-constellation-boundaries-j2000-v1.receipt.json";
const FILE_IDS = [
  "and", "ant", "aps", "aql", "aqr", "ara", "ari", "aur", "boo", "cae", "cam", "cap", "car", "cas",
  "cen", "cep", "cet", "cha", "cir", "cma", "cmi", "cnc", "col", "com", "cra", "crb", "crt", "cru",
  "crv", "cvn", "cyg", "del", "dor", "dra", "equ", "eri", "for", "gem", "gru", "her", "hor", "hya",
  "hyi", "ind", "lac", "leo", "lep", "lib", "lmi", "lup", "lyn", "lyr", "men", "mic", "mon", "mus",
  "nor", "oct", "oph", "ori", "pav", "peg", "per", "phe", "pic", "psa", "psc", "pup", "pyx", "ret",
  "scl", "sco", "sct", "ser1", "ser2", "sex", "sge", "sgr", "tau", "tel", "tra", "tri", "tuc", "uma",
  "umi", "vel", "vir", "vol", "vul",
];

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(scriptDirectory, "..");
const outputDirectory = resolve(frontendRoot, "catalog-source");
const sha256Hex = (content) => createHash("sha256").update(content).digest("hex");
const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const boundaryPattern = /^\d{2}\s+\d{2}\s+\d{2}(?:\.\d+)?\|\s*[+-]?\d{1,2}(?:\.\d+)?\|[A-Z0-9]{3,4}\s*$/;
const DOWNLOAD_CONCURRENCY = 6;
const DOWNLOAD_ATTEMPTS = 3;
const wait = (milliseconds) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));

const downloadBoundary = async (fileId) => {
  const sourceUrl = `${SOURCE_BASE_URL}/${fileId}.txt`;
  let response;
  let lastError;
  for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt += 1) {
    try {
      response = await fetch(sourceUrl);
      if (response.ok) break;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < DOWNLOAD_ATTEMPTS) await wait(400 * 2 ** (attempt - 1));
  }
  if (!response?.ok) {
    const detail = lastError instanceof Error ? lastError.message : "unknown network error";
    throw new Error(`IAU boundary download failed for ${fileId} after ${DOWNLOAD_ATTEMPTS} attempts (${detail}).`);
  }
  const content = `${(await response.text()).replace(/\r\n/g, "\n").trim()}\n`;
  const lines = content.trim().split("\n");
  if (lines.length < 3 || lines.some((line) => !boundaryPattern.test(line))) {
    throw new Error(`IAU boundary file ${fileId} does not match the documented J2000 coordinate format.`);
  }
  const sourceAbbreviation = lines[0].split("|")[2].trim();
  const abbreviation = sourceAbbreviation.startsWith("SER") ? "SER" : sourceAbbreviation;
  return {
    fileId,
    sourceUrl,
    abbreviation,
    sourceAbbreviation,
    vertexCount: lines.length,
    sha256: sha256Hex(Buffer.from(content)),
    content,
  };
};

const files = [];
let nextFileIndex = 0;
const downloadWorker = async () => {
  while (nextFileIndex < FILE_IDS.length) {
    const fileId = FILE_IDS[nextFileIndex];
    nextFileIndex += 1;
    files.push(await downloadBoundary(fileId));
  }
};
await Promise.all(Array.from({ length: DOWNLOAD_CONCURRENCY }, downloadWorker));
files.sort((left, right) => left.fileId.localeCompare(right.fileId));
const abbreviations = new Set(files.map((file) => file.abbreviation));
if (files.length !== 89 || abbreviations.size !== 88) {
  throw new Error(`IAU source produced ${files.length} paths across ${abbreviations.size} constellations; expected 89 paths and 88 constellations.`);
}
if (files.filter((file) => file.abbreviation === "SER").length !== 2) {
  throw new Error("The two disjoint Serpens boundary paths were not both retrieved.");
}

const snapshot = {
  schemaVersion: 1,
  source: {
    title: "IAU constellation boundary coordinates",
    pageUrl: SOURCE_PAGE_URL,
    coordinateFrame: "J2000 equatorial coordinates",
    format: "HH MM SS.SSSS|DD.DDDDDDD|XXX",
  },
  files: files.map(({ fileId, sourceUrl, abbreviation, sourceAbbreviation, vertexCount, content }) => ({
    fileId,
    sourceUrl,
    abbreviation,
    sourceAbbreviation,
    vertexCount,
    content,
  })),
};
const snapshotBuffer = Buffer.from(stableJson(snapshot));
const compressed = gzipSync(snapshotBuffer, { level: 9, mtime: 0 });
const retrievedAtArgument = process.argv.find((argument) => argument.startsWith("--retrieved-at="));
const retrievedAt = retrievedAtArgument?.slice("--retrieved-at=".length) ?? new Date().toISOString();
const receipt = {
  schemaVersion: 1,
  catalog: {
    id: "iau-constellation-boundaries-j2000",
    version: "iau-public-boundaries-j2000-v1",
    title: "Official IAU constellation boundary coordinates",
    status: "authoritative-source-snapshot",
    referenceFrame: "equatorial-j2000",
    epoch: "J2000",
    provenance: {
      sourceName: "International Astronomical Union",
      sourcePageUrl: SOURCE_PAGE_URL,
      sourceBaseUrl: SOURCE_BASE_URL,
      retrievedAt,
      credit: "International Astronomical Union constellation boundaries",
      usageNote: "Coordinate data define the official 88 sky regions. SpaceViewer does not redistribute the separately licensed IAU/Sky & Telescope chart artwork.",
      methodologyReference: "Davenhall and Leggett, Catalogue of Constellation Boundary Data, VizieR VI/49",
      vizierUrl: "https://cdsarc.cds.unistra.fr/viz-bin/cat/VI/49",
    },
  },
  sourceFile: {
    path: `catalog-source/${SOURCE_FILENAME}`,
    format: "json",
    contentEncoding: "gzip",
    fileCount: files.length,
    constellationCount: abbreviations.size,
    vertexCount: files.reduce((sum, file) => sum + file.vertexCount, 0),
    uncompressedBytes: snapshotBuffer.byteLength,
    compressedBytes: compressed.byteLength,
    uncompressedSha256: sha256Hex(snapshotBuffer),
    compressedSha256: sha256Hex(compressed),
    files: files.map(({ fileId, sourceUrl, abbreviation, sourceAbbreviation, vertexCount, sha256 }) => ({
      fileId,
      sourceUrl,
      abbreviation,
      sourceAbbreviation,
      vertexCount,
      sha256,
    })),
  },
};

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(resolve(outputDirectory, SOURCE_FILENAME), compressed),
  writeFile(resolve(outputDirectory, RECEIPT_FILENAME), stableJson(receipt)),
]);

console.log(`IAU constellation boundaries fetched: ${abbreviations.size} constellations, ${receipt.sourceFile.vertexCount.toLocaleString()} source vertices`);
