#!/usr/bin/env node
// Builds the "galaxy" star layer: about a million Gaia DR3 stars with good parallaxes, as compact
// binary chunks ordered brightest-first so the explorer can stream them progressively.
//
//   node scripts/build-galaxy-star-catalog.mjs <gaia.csv> [--max-mag=10.5]
//
// Input: CSV from the Gaia DR3 archive (or the ARI Heidelberg mirror) with columns
//   source_id, ra, dec, parallax, parallax_error, phot_g_mean_mag, bp_rp
// selected with  phot_g_mean_mag <= 10.5 AND parallax > 0 AND parallax_over_error >= 5.
//
// Output (public/catalogs/galaxy-stars/):
//   manifest.json      provenance, query, chunk list
//   chunk-NN.svgp      "SVGP" little-endian:
//                        magic "SVGP", u16 version=1, u16 flags=0, u32 count, u32 reserved
//                        f32[count*3]  ICRS heliocentric position, light-years (1000 / parallax)
//                        i16[count]    absolute G magnitude * 100
//                        u8[count]     effective-temperature index (see TEMPERATURE_* below)
//                        padding to a multiple of 4 bytes
// Stars already in the receipted nearby subset (100 pc, G <= 9) are excluded so nothing is drawn twice.

import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const args = process.argv.slice(2);
const inputPath = args.find((arg) => !arg.startsWith("--"));
if (!inputPath) {
  console.error("usage: build-galaxy-star-catalog.mjs <gaia.csv> [--max-mag=10.5]");
  process.exit(1);
}
const maxMag = Number(args.find((arg) => arg.startsWith("--max-mag="))?.split("=")[1] ?? 10.5);

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(scriptDirectory, "..");
const outDir = resolve(frontendRoot, "public/catalogs/galaxy-stars");
const nearbyCsv = resolve(frontendRoot, "catalog-source/gaia-dr3-nearby-100pc-g9.csv.gz");

const LY_PER_PC = 3.261_563_777;
const CHUNK_SIZES = [40_000, 80_000, 160_000, 240_000, 320_000];
export const TEMPERATURE_MIN = 2_400;
export const TEMPERATURE_MAX = 40_000;

// Gaia BP-RP colour to effective temperature, via the Mucciarelli & Bellazzini (2020) dwarf relation
// (valid roughly -0.1 < BP-RP < 2.2); clamped outside. Used only to tint stars.
const temperatureFromBpRp = (bpRp) => {
  if (!Number.isFinite(bpRp)) return 5_800;
  const c = Math.min(3.2, Math.max(-0.3, bpRp));
  const theta = 0.4929 + 0.5092 * c - 0.0353 * c * c;
  return Math.min(TEMPERATURE_MAX, Math.max(TEMPERATURE_MIN, 5040 / theta));
};
const temperatureIndex = (t) =>
  Math.round(((Math.log(t) - Math.log(TEMPERATURE_MIN)) / (Math.log(TEMPERATURE_MAX) - Math.log(TEMPERATURE_MIN))) * 255);

const readNearbyIds = () => {
  const text = gunzipSync(readFileSync(nearbyCsv)).toString("utf8");
  const lines = text.split("\n");
  const ids = new Set();
  for (let i = 1; i < lines.length; i += 1) {
    const id = lines[i].slice(0, lines[i].indexOf(","));
    if (id) ids.add(id);
  }
  return ids;
};

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

// The fetch script leaves a receipt (TAP service, job, checksum) next to the CSV.
const readReceipt = () => {
  const path = resolve(inputPath).replace(/\.csv$/, ".receipt.json");
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
};

const main = async () => {
  const receipt = readReceipt();
  const nearby = readNearbyIds();
  const stars = [];
  let header = null;
  let skippedNearby = 0;
  let rejected = 0;
  const rl = createInterface({ input: createReadStream(resolve(inputPath)), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line) continue;
    if (!header) {
      header = line.split(",").map((name) => name.trim().replace(/^"|"$/g, ""));
      continue;
    }
    const cells = line.split(",");
    const row = Object.fromEntries(header.map((name, i) => [name, cells[i]]));
    const id = row.source_id;
    if (nearby.has(id)) {
      skippedNearby += 1;
      continue;
    }
    const ra = Number(row.ra);
    const dec = Number(row.dec);
    const parallax = Number(row.parallax);
    const g = Number(row.phot_g_mean_mag);
    if (!Number.isFinite(ra) || !Number.isFinite(dec) || !(parallax > 0) || !Number.isFinite(g) || g > maxMag) {
      rejected += 1;
      continue;
    }
    const distanceLy = (1000 / parallax) * LY_PER_PC;
    const raR = (ra * Math.PI) / 180;
    const decR = (dec * Math.PI) / 180;
    const cosDec = Math.cos(decR);
    const absMag = g - 5 * (Math.log10(1000 / parallax) - 1);
    stars.push({
      g,
      x: distanceLy * cosDec * Math.cos(raR),
      y: distanceLy * cosDec * Math.sin(raR),
      z: distanceLy * Math.sin(decR),
      absMag,
      t: temperatureIndex(temperatureFromBpRp(Number(row.bp_rp === "" ? Number.NaN : row.bp_rp))),
    });
  }
  stars.sort((a, b) => a.g - b.g);

  await mkdir(outDir, { recursive: true });
  for (const file of await readdir(outDir)) if (file.endsWith(".svgp")) await rm(resolve(outDir, file));

  const chunks = [];
  let offset = 0;
  for (let index = 0; offset < stars.length; index += 1) {
    const size = CHUNK_SIZES[Math.min(index, CHUNK_SIZES.length - 1)];
    const slice = stars.slice(offset, offset + size);
    offset += slice.length;
    const count = slice.length;
    const bytes = 16 + count * 12 + count * 2 + count;
    const padded = Math.ceil(bytes / 4) * 4;
    const buffer = Buffer.alloc(padded);
    buffer.write("SVGP", 0, "ascii");
    buffer.writeUInt16LE(1, 4);
    buffer.writeUInt16LE(0, 6);
    buffer.writeUInt32LE(count, 8);
    let p = 16;
    for (const star of slice) {
      buffer.writeFloatLE(star.x, p);
      buffer.writeFloatLE(star.y, p + 4);
      buffer.writeFloatLE(star.z, p + 8);
      p += 12;
    }
    for (const star of slice) {
      buffer.writeInt16LE(Math.max(-32_000, Math.min(32_000, Math.round(star.absMag * 100))), p);
      p += 2;
    }
    for (const star of slice) {
      buffer.writeUInt8(star.t, p);
      p += 1;
    }
    const name = `chunk-${String(index).padStart(2, "0")}.svgp`;
    await writeFile(resolve(outDir, name), buffer);
    chunks.push({
      url: `/catalogs/galaxy-stars/${name}`,
      count,
      bytes: buffer.byteLength,
      sha256: sha256(buffer),
      magnitudeRangeG: [Number(slice[0].g.toFixed(3)), Number(slice[slice.length - 1].g.toFixed(3))],
    });
  }

  const manifest = {
    schemaVersion: 1,
    format: "spaceviewer-gaia-points-v1",
    catalog: {
      id: "gaia-dr3-galaxy-g105-poe5",
      title: "Gaia DR3 stars with G ≤ 10.5 and parallax / error ≥ 5",
      referenceFrame: "heliocentric-icrs-cartesian",
      positionUnit: "light-year",
      epoch: "J2016.0",
      provenance: {
        sourceName: "Gaia Data Release 3, gaiadr3.gaia_source",
        retrievedFrom: receipt?.tap ?? "https://gea.esac.esa.int/tap-server/tap (ESA Gaia archive)",
        retrievedAt: receipt?.retrievedAt ?? null,
        sourceCsvSha256: receipt?.sha256 ?? null,
        sourceRows: receipt?.rows ?? null,
        credit: "ESA/Gaia/DPAC",
        licence: "Gaia DR3 open data, free to use with ESA/Gaia/DPAC credit",
        creditsUrl: "https://gea.esac.esa.int/archive/documentation/GDR3/Miscellaneous/sec_credit_and_citation_instructions/",
      },
    },
    query: {
      language: "ADQL",
      text: "SELECT source_id, ra, dec, parallax, parallax_error, phot_g_mean_mag, bp_rp FROM gaiadr3.gaia_source WHERE phot_g_mean_mag <= 10.5 AND parallax > 0 AND parallax_over_error >= 5",
      interpretation:
        "Distances are the naive inverse of parallax (no zero-point correction or prior); colours are an approximate BP-RP → temperature tint (Mucciarelli & Bellazzini 2020). Stars already in the receipted nearby subset are excluded. This is a brightness-limited visualisation sample, not a complete volume.",
    },
    starCount: stars.length,
    excludedNearbyDuplicates: skippedNearby,
    rejectedRows: rejected,
    temperatureIndex: { min: TEMPERATURE_MIN, max: TEMPERATURE_MAX, scale: "log" },
    chunks,
  };
  await writeFile(resolve(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  const totalMb = chunks.reduce((sum, chunk) => sum + chunk.bytes, 0) / 1e6;
  console.log(`Galaxy stars: ${stars.length.toLocaleString()} stars in ${chunks.length} chunks (${totalMb.toFixed(1)} MB); skipped ${skippedNearby} nearby duplicates, rejected ${rejected}.`);
};

await main();
