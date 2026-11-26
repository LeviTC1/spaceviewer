#!/usr/bin/env node
// Builds src/generated/timezonePlaces.json: the principal city of every tz database zone with its
// coordinates, so "Tonight's sky" can start from the browser's time zone without asking for location.
// Source: the tz database's zone.tab (public domain), e.g. /usr/share/zoneinfo/zone.tab.
//
//   node scripts/build-timezone-places.mjs [path/to/zone.tab]

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const source = process.argv[2] ?? "/usr/share/zoneinfo/zone.tab";
const out = resolve(dirname(fileURLToPath(import.meta.url)), "../src/generated/timezonePlaces.json");

const parse = (text, degDigits) => {
  const sign = text[0] === "-" ? -1 : 1;
  const d = Number(text.slice(1, 1 + degDigits));
  const m = Number(text.slice(1 + degDigits, 3 + degDigits));
  const s = text.length > 3 + degDigits ? Number(text.slice(3 + degDigits, 5 + degDigits)) : 0;
  return sign * (d + m / 60 + s / 3600);
};

const places = {};
for (const line of readFileSync(source, "utf8").split("\n")) {
  if (!line || line.startsWith("#")) continue;
  const [country, coords, zone] = line.split("\t");
  const match = /^([+-]\d+)([+-]\d+)$/.exec(coords);
  if (!match) continue;
  const lat = parse(match[1], 2);
  const lon = parse(match[2], 3);
  const city = zone.split("/").pop().replace(/_/g, " ");
  places[zone] = [city, country, Math.round(lat * 100) / 100, Math.round(lon * 100) / 100];
}
writeFileSync(
  out,
  `${JSON.stringify({ source: "tz database zone.tab (public domain)", format: "zone → [city, ISO country, latitude°, longitude°]", places })}\n`,
);
console.log(`${Object.keys(places).length} zones → ${out}`);
