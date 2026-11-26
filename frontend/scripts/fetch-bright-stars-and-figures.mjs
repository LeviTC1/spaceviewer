#!/usr/bin/env node
// Downloads the sources behind the explorer's naked-eye star layer and its 3-D constellation figures:
//
//   - XHIP, the Extended Hipparcos Compilation (Anderson & Francis 2012, VizieR V/137D): every star to
//     Hp 7.0 with positions, Hipparcos 2007 parallaxes, proper motions, V, B−V and IAU proper names.
//   - d3-celestial (Olaf Frohn, BSD-3-Clause): IAU constellation stick figures and name positions.
//   - The IAU Catalog of Star Names (IAU-CSN, WGSN; CC BY): official proper names by HIP number.
//
// Raw files land in ../tmp/catalog-raw/sky/ (not committed) with a receipt; build-bright-stars.mjs turns
// them into public/catalogs/sky/.
//
//   node scripts/fetch-bright-stars-and-figures.mjs

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../tmp/catalog-raw/sky");

const XHIP_COLUMNS = ["HIP", "RAJ2000", "DEJ2000", "Plx", "e_Plx", "pmRA", "pmDE", "Dist", "Vmag", "Hpmag", "B-V", "SpType", "Cst", "Name", "HD"];
// The CfA mirror answered when the Strasbourg TAP service timed out; both serve the same catalogue.
const VIZIER = "https://vizier.cfa.harvard.edu/viz-bin/asu-tsv";
const xhipUrl = `${VIZIER}?-source=V/137D/XHIP&-out.max=unlimited&-out=${XHIP_COLUMNS.map(encodeURIComponent).join(",")}&Hpmag=%3C%3D7.0`;

const D3C = "https://raw.githubusercontent.com/ofrohn/d3-celestial/master";
const FILES = [
  { name: "xhip-hp7.tsv", url: xhipUrl },
  { name: "constellations.lines.json", url: `${D3C}/data/constellations.lines.json` },
  { name: "constellations.json", url: `${D3C}/data/constellations.json` },
  { name: "d3-celestial-LICENSE", url: `${D3C}/LICENSE` },
  { name: "IAU-CSN.txt", url: "https://www.pas.rochester.edu/~emamajek/WGSN/IAU-CSN.txt" },
];

const main = async () => {
  await mkdir(outDir, { recursive: true });
  const receipt = { retrievedAt: new Date().toISOString(), files: [] };
  for (const file of FILES) {
    const response = await fetch(file.url);
    if (!response.ok) throw new Error(`${file.name}: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    await writeFile(resolve(outDir, file.name), bytes);
    receipt.files.push({ name: file.name, url: file.url, bytes: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") });
    console.log(`${file.name}: ${bytes.byteLength.toLocaleString()} bytes`);
  }
  await writeFile(resolve(outDir, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
};

await main();
