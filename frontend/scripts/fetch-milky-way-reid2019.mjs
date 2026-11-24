#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CATALOG_ID = "J/ApJ/885/131";
const CATALOG_DOI = "10.26093/cds/vizier.18850131";
const ARTICLE_DOI = "10.3847/1538-4357/ab4a11";
const EXPECTED_RECORD_COUNT = 199;
const files = [
  {
    name: "ReadMe",
    url: "https://cdsarc.cds.unistra.fr/ftp/J/ApJ/885/131/ReadMe",
    sha256: "b41f956229200db92942c23e1165da5e5017484fdbbc16914229557934dcc1f9",
  },
  {
    name: "table1.dat",
    url: "https://cdsarc.cds.unistra.fr/ftp/J/ApJ/885/131/table1.dat",
    sha256: "ca1c67c85f65bed51101f24f5acc8ec16b51ea3e8ee22ea10483f85007cbda02",
  },
  {
    name: "refs.dat",
    url: "https://cdsarc.cds.unistra.fr/ftp/J/ApJ/885/131/refs.dat",
    sha256: "507befb5a83bc1e704ef9ba8ea82cd9347a9e9f4c20bd259d7eba91914aa4e9c",
  },
  {
    name: "VIZIER_USAGE.html",
    url: "https://cds.unistra.fr/vizier-org/licences_vizier.html",
    sha256: "f6bab16f7060f41c98958f0044fa3a526eeeeacdd23cb2fa7a529016d2b29e9f",
  },
];

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(scriptDirectory, "..");
const outputDirectory = resolve(frontendRoot, "catalog-source/milky-way-reid2019");
const receiptPath = resolve(outputDirectory, "source-receipt.json");
const checkOnly = process.argv.includes("--check");
const sha256Hex = (content) => createHash("sha256").update(content).digest("hex");
const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

const validate = (definition, content) => {
  const digest = sha256Hex(content);
  if (digest !== definition.sha256) {
    throw new Error(`${definition.name} checksum ${digest} does not match pinned ${definition.sha256}.`);
  }
};

let resolvedFiles;
if (checkOnly) {
  resolvedFiles = await Promise.all(files.map(async (definition) => {
    const content = await readFile(resolve(outputDirectory, definition.name));
    validate(definition, content);
    return { definition, content };
  }));
} else {
  resolvedFiles = await Promise.all(files.map(async (definition) => {
    const response = await fetch(definition.url, { redirect: "follow" });
    if (!response.ok) throw new Error(`${definition.name} download failed (${response.status} ${response.statusText}).`);
    const content = Buffer.from(await response.arrayBuffer());
    validate(definition, content);
    return { definition, content };
  }));
}

const table = resolvedFiles.find(({ definition }) => definition.name === "table1.dat")?.content.toString("utf8");
const recordCount = table?.split(/\r?\n/).filter(Boolean).length ?? 0;
if (recordCount !== EXPECTED_RECORD_COUNT) {
  throw new Error(`Reid et al. table contains ${recordCount} records; expected ${EXPECTED_RECORD_COUNT}.`);
}

const retrievedAtArgument = process.argv.find((argument) => argument.startsWith("--retrieved-at="));
const retrievedAt = retrievedAtArgument?.slice("--retrieved-at=".length) ?? "2026-09-02T00:00:00.000Z";
const receipt = {
  schemaVersion: 1,
  catalog: {
    id: CATALOG_ID,
    version: "reid2019-vizier-2021-09-16",
    title: "Trigonometric parallaxes of high-mass star-forming regions",
    authors: "Reid et al.",
    catalogDoi: CATALOG_DOI,
    articleDoi: ARTICLE_DOI,
    catalogUrl: "https://cdsarc.cds.unistra.fr/viz-bin/cat/J/ApJ/885/131",
    articleUrl: `https://doi.org/${ARTICLE_DOI}`,
    retrievedAt,
    provenance: {
      licenceId: "VizieR-scientific-use",
      licenceStatus: "verified-scientific-use-commercial-rights-source-dependent",
      licenceUrl: "https://cds.unistra.fr/vizier-org/licences_vizier.html",
      licenceSummary: "VizieR permits scientific use with explicit citation; commercial use depends on the originating journal and is not granted by this receipt.",
      credit: "Reid et al. (2019); VizieR catalogue J/ApJ/885/131; CDS, Strasbourg",
    },
  },
  sourceFiles: resolvedFiles.map(({ definition, content }) => ({
    path: `catalog-source/milky-way-reid2019/${definition.name}`,
    url: definition.url,
    bytes: content.byteLength,
    sha256: definition.sha256,
  })),
  recordCount,
};
const receiptBuffer = Buffer.from(stableJson(receipt));

if (checkOnly) {
  const actualReceipt = await readFile(receiptPath).catch(() => null);
  if (!actualReceipt?.equals(receiptBuffer)) throw new Error("Reid et al. source receipt is stale.");
  console.log(`Milky Way source check passed: ${recordCount} records, ${resolvedFiles.length} pinned files`);
} else {
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    ...resolvedFiles.map(({ definition, content }) => writeFile(resolve(outputDirectory, definition.name), content)),
    writeFile(receiptPath, receiptBuffer),
  ]);
  console.log(`Milky Way source fetched: ${recordCount} records, ${resolvedFiles.length} pinned files`);
}
