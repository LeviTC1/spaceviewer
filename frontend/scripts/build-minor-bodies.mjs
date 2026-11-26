#!/usr/bin/env node
// Builds the explorer's minor-body layer from the JPL Small-Body Database (public/catalogs/minor-bodies/):
// about 100,000 asteroids, Trojans, centaurs and Kuiper Belt objects with their osculating orbits, drawn
// by the GPU (each vertex solves Kepler's equation every frame), plus the largest as named places.
//
//   node scripts/build-minor-bodies.mjs
//
// Raw query results are cached in ../tmp/catalog-raw/sbdb/.

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(scriptDirectory, "../public/catalogs/minor-bodies");
const rawDir = resolve(scriptDirectory, "../../tmp/catalog-raw/sbdb");
const API = "https://ssd-api.jpl.nasa.gov/sbdb_query.api";
const FIELDS = ["spkid", "full_name", "a", "e", "i", "om", "w", "ma", "epoch", "H", "class", "diameter"];
const DEG = Math.PI / 180;

/** Display groups (id is stored per object). */
export const GROUPS = [
  { id: 0, key: "main-belt", label: "Main belt", classes: "MBA", maxH: 15 },
  { id: 1, key: "belt-edges", label: "Inner, outer belt and Mars-crossers", classes: "IMB,OMB,MCA", maxH: 16 },
  { id: 2, key: "trojans", label: "Jupiter Trojans", classes: "TJN", maxH: 16 },
  { id: 3, key: "near-earth", label: "Near-Earth asteroids", classes: "APO,ATE,AMO,IEO", maxH: 20 },
  { id: 4, key: "centaurs", label: "Centaurs", classes: "CEN", maxH: 99 },
  { id: 5, key: "kuiper", label: "Kuiper Belt and beyond", classes: "TNO", maxH: 99 },
];

// Already in the explorer as dwarf planets (SMALL_BODIES) or planets.
const SKIP_NAMED = new Set(["1", "134340", "136199", "136108", "136472"]);
// Common orbit epoch for the packed mean anomalies (2026-01-01 TDB).
const REFERENCE_JD = 2_461_041.5;

const query = async (group) => {
  const file = resolve(rawDir, `${group.key}.json`);
  if (existsSync(file)) return JSON.parse(await readFile(file, "utf8"));
  const params = new URLSearchParams({
    fields: FIELDS.join(","),
    "sb-class": group.classes,
    "sb-kind": "a",
    "full-prec": "1",
  });
  if (group.maxH < 99) params.set("sb-cdata", JSON.stringify({ AND: [`H|LT|${group.maxH}`] }));
  const response = await fetch(`${API}?${params}`);
  if (!response.ok) throw new Error(`${group.label}: HTTP ${response.status}`);
  const json = await response.json();
  await writeFile(file, JSON.stringify(json));
  return json;
};

const main = async () => {
  await mkdir(outDir, { recursive: true });
  await mkdir(rawDir, { recursive: true });
  const bodies = [];
  const named = [];
  const counts = {};
  const seen = new Set();
  for (const group of GROUPS) {
    const json = await query(group);
    const col = Object.fromEntries(json.fields.map((field, index) => [field, index]));
    let kept = 0;
    for (const row of json.data) {
      const spkid = row[col.spkid];
      if (seen.has(spkid)) continue;
      const a = Number(row[col.a]);
      const e = Number(row[col.e]);
      const i = Number(row[col.i]);
      const om = Number(row[col.om]);
      const w = Number(row[col.w]);
      const ma = Number(row[col.ma]);
      const epoch = Number(row[col.epoch]);
      const h = row[col.H] === null ? Number.NaN : Number(row[col.H]);
      if (![a, e, i, om, w, ma, epoch].every(Number.isFinite) || !(a > 0) || e >= 1) continue;
      seen.add(spkid);
      // Mean motion (deg/day) from Kepler's third law with the Gaussian constant.
      const n = 0.985_607_668_6 / a ** 1.5;
      const mRef = ((((ma + n * (REFERENCE_JD - epoch)) % 360) + 360) % 360) * DEG;
      bodies.push({ a, e, i: i * DEG, om: om * DEG, w: w * DEG, m: mRef, group: group.id, h: Number.isFinite(h) ? h : 12 });
      kept += 1;
      // The largest bodies become named places (by absolute magnitude: brighter means bigger).
      const number = String(row[col.full_name]).trim().match(/^(\d+)/)?.[1];
      if (Number.isFinite(h) && h < (group.id === 5 ? 4.6 : 6.3) && number && !SKIP_NAMED.has(number)) {
        const name = String(row[col.full_name]).trim().replace(/^\d+\s+/, "").replace(/\s*\(.*\)$/, "") || String(row[col.full_name]).trim();
        named.push({
          spkid,
          number: Number(number),
          name,
          designation: String(row[col.full_name]).trim(),
          group: group.key,
          a,
          e,
          iDeg: i,
          omDeg: om,
          wDeg: w,
          maDeg: ma,
          epochJd: epoch,
          h,
          diameterKm: row[col.diameter] === null ? null : Number(row[col.diameter]),
        });
      }
    }
    counts[group.key] = kept;
    console.log(`${group.label}: ${kept.toLocaleString()} orbits`);
  }

  // Packed layout: header, then f32 [a, e, i, Ω, ω, M(ref)] per body, then u8 group, then u8 H×10.
  const count = bodies.length;
  const headerBytes = 32;
  const floatBytes = count * 6 * 4;
  const total = Math.ceil((headerBytes + floatBytes + count * 2) / 4) * 4;
  const buffer = Buffer.alloc(total);
  buffer.write("SVMB", 0, "ascii");
  buffer.writeUInt16LE(1, 4);
  buffer.writeUInt32LE(count, 8);
  buffer.writeDoubleLE(REFERENCE_JD, 16);
  bodies.forEach((body, index) => {
    [body.a, body.e, body.i, body.om, body.w, body.m].forEach((value, k) => buffer.writeFloatLE(value, headerBytes + (index * 6 + k) * 4));
    buffer.writeUInt8(body.group, headerBytes + floatBytes + index);
    buffer.writeUInt8(Math.max(0, Math.min(255, Math.round(body.h * 10))), headerBytes + floatBytes + count + index);
  });
  await writeFile(resolve(outDir, "orbits.svmb"), buffer);
  named.sort((x, y) => x.h - y.h);
  const namedText = `${JSON.stringify(named)}\n`;
  await writeFile(resolve(outDir, "named.json"), namedText);
  const manifest = {
    schemaVersion: 1,
    format: "spaceviewer-minor-bodies-v1",
    source: {
      name: "JPL Small-Body Database (NASA/JPL Solar System Dynamics)",
      url: "https://ssd-api.jpl.nasa.gov/doc/sbdb_query.html",
      retrievedAt: new Date().toISOString(),
      credit: "Orbits: JPL Small-Body Database",
    },
    frame: "heliocentric ecliptic J2000; osculating elements propagated as two-body orbits",
    referenceJulianDate: REFERENCE_JD,
    accuracy:
      "Two-body propagation from each object's osculating epoch: fine for showing the belts' shape and motion, drifting by up to a few degrees over decades for objects perturbed by Jupiter. Not for finding a particular asteroid in a telescope.",
    groups: GROUPS.map(({ id, key, label, maxH }) => ({ id, key, label, absoluteMagnitudeBelow: maxH < 99 ? maxH : null, count: counts[key] })),
    count,
    orbits: { url: "/catalogs/minor-bodies/orbits.svmb", bytes: buffer.byteLength, sha256: createHash("sha256").update(buffer).digest("hex") },
    named: { url: "/catalogs/minor-bodies/named.json", count: named.length, sha256: createHash("sha256").update(namedText).digest("hex") },
  };
  await writeFile(resolve(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`${count.toLocaleString()} orbits, ${(buffer.byteLength / 1e6).toFixed(2)} MB; ${named.length} named: ${named.slice(0, 12).map((body) => body.name).join(", ")}…`);
};

await main();
