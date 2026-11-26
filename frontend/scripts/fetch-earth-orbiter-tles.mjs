#!/usr/bin/env node
// Snapshot of the two-line element sets for the Earth orbiters the explorer shows (ISS, Hubble,
// Tiangong), from CelesTrak. At run time the explorer gets fresh elements through the SpaceViewer API
// (/api/tle, which relays CelesTrak with a two-hour cache) and falls back to this snapshot; SGP4 stays
// usable for a few weeks and the panel says how old the elements are.
//
//   node scripts/fetch-earth-orbiter-tles.mjs

import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const EARTH_ORBITERS = [
  { id: "iss", norad: 25544, name: "International Space Station", agency: "NASA · Roscosmos · ESA · JAXA · CSA", sizeKm: 0.109 },
  { id: "hubble", norad: 20580, name: "Hubble Space Telescope", agency: "NASA · ESA", sizeKm: 0.0132 },
  { id: "tiangong", norad: 48274, name: "Tiangong space station", agency: "CMSA", sizeKm: 0.055 },
];

const out = resolve(dirname(fileURLToPath(import.meta.url)), "../public/catalogs/spacecraft/earth-orbiters.json");
const satellites = [];
for (const orbiter of EARTH_ORBITERS) {
  const response = await fetch(`https://celestrak.org/NORAD/elements/gp.php?CATNR=${orbiter.norad}&FORMAT=TLE`);
  if (!response.ok) throw new Error(`${orbiter.name}: HTTP ${response.status}`);
  const lines = (await response.text()).split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean);
  const [line1, line2] = lines.slice(-2);
  if (!line1?.startsWith("1 ") || !line2?.startsWith("2 ")) throw new Error(`${orbiter.name}: unexpected TLE`);
  satellites.push({ ...orbiter, line1, line2 });
}
await writeFile(
  out,
  `${JSON.stringify({ source: "CelesTrak GP data (celestrak.org), derived from US Space Force 18 SDS", retrievedAt: new Date().toISOString(), liveUrl: "https://celestrak.org/NORAD/elements/gp.php?CATNR={norad}&FORMAT=TLE", satellites }, null, 2)}\n`,
);
console.log(`Saved ${satellites.length} TLEs → ${out}`);
