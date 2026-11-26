#!/usr/bin/env node
// Builds the naked-eye star layer and the 3-D constellation figures (public/catalogs/sky/).
//
//   node scripts/build-bright-stars.mjs
//
// Inputs (from fetch-bright-stars-and-figures.mjs, in ../tmp/catalog-raw/sky/):
//   xhip-hp7.tsv                 XHIP (Anderson & Francis 2012, VizieR V/137D), Hp ≤ 7.0
//   constellations.lines.json    d3-celestial IAU stick figures (BSD-3-Clause, Olaf Frohn)
//   constellations.json          d3-celestial constellation names and label positions
//   IAU-CSN.txt                  IAU Working Group on Star Names proper names
// plus the Gaia layers already shipped (catalog-source nearby CSV, public/catalogs/galaxy-stars/).
//
// Gaia cannot measure the brightest stars (G ≲ 3), so Sirius, Rigel or Betelgeuse are missing from
// the Gaia layers. Every XHIP star is cross-matched to them (positions propagated to J2016, ≤ 2.5″):
//   - matched stars are already drawn by Gaia; their figure vertices use the Gaia position;
//   - unmatched stars go into bright-stars.svgp (same SVGP format as the galaxy layer) at their
//     Hipparcos distance.
// Each figure vertex is the nearest catalogued star to d3-celestial's coordinate (≤ 0.15°), so the
// lines join real stars at their real distances: seen from the Sun they draw the familiar figures,
// seen from anywhere else they come apart.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(scriptDirectory, "..");
const rawDir = resolve(frontendRoot, "../tmp/catalog-raw/sky");
const outDir = resolve(frontendRoot, "public/catalogs/sky");
const nearbyCsv = resolve(frontendRoot, "catalog-source/gaia-dr3-nearby-100pc-g9.csv.gz");
const galaxyDir = resolve(frontendRoot, "public/catalogs/galaxy-stars");

const LY_PER_PC = 3.261_563_777;
const DEG = Math.PI / 180;
const TEMPERATURE_MIN = 2_400;
const TEMPERATURE_MAX = 40_000;
const MATCH_ARCSEC = 2.5;
const FIGURE_MATCH_DEG = 0.15;
// Hipparcos parallaxes below 2σ cannot place a star; such stars sit at 1 / (2σ), flagged in the output.
const MIN_PARALLAX_SIGMA = 2;

// Official proper names from the IAU Working Group on Star Names, keyed by HIP number.
const readIauNames = () => {
  const lines = readFileSync(resolve(rawDir, "IAU-CSN.txt"), "utf8").split("\n");
  const header = lines.find((line) => line.startsWith("#Name"));
  const tail = header.indexOf("WDS_J") + 11;
  const names = new Map();
  for (const line of lines) {
    if (!line.trim() || line.startsWith("#") || line.startsWith("$")) continue;
    // After the WDS column: mag, band, HIP, HD, RA, Dec, date.
    const hip = Number(line.slice(tail).trim().split(/\s+/)[2]);
    if (hip > 0) names.set(hip, line.slice(0, 18).trim());
  }
  return names;
};
const IAU_NAMES = readIauNames();

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

// B−V → effective temperature (Ballesteros 2012). Used only to tint stars.
const temperatureFromBv = (bv) => {
  if (!Number.isFinite(bv)) return 5_800;
  const c = Math.min(2.0, Math.max(-0.4, bv));
  return Math.min(TEMPERATURE_MAX, Math.max(TEMPERATURE_MIN, 4600 * (1 / (0.92 * c + 1.7) + 1 / (0.92 * c + 0.62))));
};
const temperatureIndex = (t) =>
  Math.round(((Math.log(t) - Math.log(TEMPERATURE_MIN)) / (Math.log(TEMPERATURE_MAX) - Math.log(TEMPERATURE_MIN))) * 255);

const unit = (raDeg, decDeg) => {
  const ra = raDeg * DEG;
  const dec = decDeg * DEG;
  return [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
};
const angleDeg = (a, b) => {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = Math.hypot(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]);
  return Math.atan2(cross, dot) / DEG;
};

// A coarse RA/Dec grid for neighbour searches.
const CELL_DEG = 0.5;
const cellKey = (raDeg, decDeg) => `${Math.floor(((raDeg % 360) + 360) % 360 / CELL_DEG)}:${Math.floor((decDeg + 90) / CELL_DEG)}`;
const makeGrid = () => new Map();
const gridAdd = (grid, raDeg, decDeg, item) => {
  const key = cellKey(raDeg, decDeg);
  const list = grid.get(key);
  if (list) list.push(item);
  else grid.set(key, [item]);
};
const gridNear = function* (grid, raDeg, decDeg, radiusDeg) {
  const steps = Math.ceil(radiusDeg / CELL_DEG) + 1;
  const cosDec = Math.max(0.02, Math.cos(decDeg * DEG));
  const raSteps = Math.min(Math.ceil(360 / CELL_DEG / 2), Math.ceil(steps / cosDec));
  const rc = Math.floor(((raDeg % 360) + 360) % 360 / CELL_DEG);
  const dc = Math.floor((decDeg + 90) / CELL_DEG);
  const columns = 360 / CELL_DEG;
  const seen = new Set();
  for (let dd = -steps; dd <= steps; dd += 1) {
    for (let dr = -raSteps; dr <= raSteps; dr += 1) {
      const key = `${(((rc + dr) % columns) + columns) % columns}:${dc + dd}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const list = grid.get(key);
      if (list) yield* list;
    }
  }
};

// --- XHIP --------------------------------------------------------------------------------------

const readXhip = () => {
  const lines = readFileSync(resolve(rawDir, "xhip-hp7.tsv"), "utf8").split("\n").filter((line) => line && !line.startsWith("#"));
  const header = lines[0].split("\t").map((cell) => cell.trim());
  const stars = [];
  for (const line of lines.slice(3)) {
    const cells = line.split("\t");
    const row = Object.fromEntries(header.map((name, i) => [name, (cells[i] ?? "").trim()]));
    const hip = Number(row.HIP);
    const ra = Number(row.RAJ2000);
    const dec = Number(row.DEJ2000);
    if (!hip || !Number.isFinite(ra) || !Number.isFinite(dec)) continue;
    const v = row.Vmag === "" ? Number(row.Hpmag) : Number(row.Vmag);
    if (!Number.isFinite(v)) continue;
    const plx = Number(row.Plx);
    const ePlx = Number(row.e_Plx);
    const distPc = Number(row.Dist);
    let distancePc;
    let distanceFlag = "hipparcos";
    if (row.Dist !== "" && distPc > 0) distancePc = distPc;
    else if (plx > 0 && Number.isFinite(ePlx) && plx >= MIN_PARALLAX_SIGMA * ePlx) distancePc = 1000 / plx;
    else {
      distancePc = 1000 / Math.max(plx > 0 ? plx : 0, MIN_PARALLAX_SIGMA * (ePlx > 0 ? ePlx : 1));
      distanceFlag = "lower-limit";
    }
    stars.push({
      hip,
      ra,
      dec,
      pmRa: Number(row.pmRA) || 0,
      pmDec: Number(row.pmDE) || 0,
      v,
      bv: row["B-V"] === "" ? Number.NaN : Number(row["B-V"]),
      spType: row.SpType,
      constellation: row.Cst,
      designation: row.Name.replace(/\s*\([^)]*\)\s*$/, "").trim(),
      properName: IAU_NAMES.get(hip) ?? null,
      hd: row.HD ? Number(row.HD) : null,
      distanceLy: distancePc * LY_PER_PC,
      distanceFlag,
    });
  }
  return stars;
};

// --- Gaia layers -------------------------------------------------------------------------------

const readGaiaNearby = () => {
  const text = gunzipSync(readFileSync(nearbyCsv)).toString("utf8");
  const lines = text.split("\n").filter(Boolean);
  const header = lines[0].split(",");
  const col = (name) => header.indexOf(name);
  const [iRa, iDec, iPlx, iG] = [col("ra"), col("dec"), col("parallax"), col("phot_g_mean_mag")];
  const out = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(",");
    const ra = Number(cells[iRa]);
    const dec = Number(cells[iDec]);
    const plx = Number(cells[iPlx]);
    const g = Number(cells[iG]);
    if (!(plx > 0)) continue;
    out.push({ ra, dec, g, distanceLy: (1000 / plx) * LY_PER_PC, layer: "nearby" });
  }
  return out;
};

const readGaiaGalaxy = () => {
  const manifest = JSON.parse(readFileSync(resolve(galaxyDir, "manifest.json"), "utf8"));
  const out = [];
  for (const chunk of manifest.chunks) {
    // Only bright stars can match an Hp ≤ 7 star.
    if (chunk.magnitudeRangeG && chunk.magnitudeRangeG[0] > 8.5) continue;
    const buffer = readFileSync(resolve(galaxyDir, chunk.url.split("/").pop()));
    const count = buffer.readUInt32LE(8);
    const magOffset = 16 + count * 12;
    for (let i = 0; i < count; i += 1) {
      const x = buffer.readFloatLE(16 + i * 12);
      const y = buffer.readFloatLE(20 + i * 12);
      const z = buffer.readFloatLE(24 + i * 12);
      const d = Math.hypot(x, y, z);
      const absMag = buffer.readInt16LE(magOffset + i * 2) / 100;
      const g = absMag + 5 * (Math.log10(d / LY_PER_PC) - 1);
      if (g > 8.5) continue;
      const dec = Math.asin(z / d) / DEG;
      const ra = ((Math.atan2(y, x) / DEG) + 360) % 360;
      out.push({ ra, dec, g, distanceLy: d, layer: "galaxy" });
    }
  }
  return out;
};

// --- Build -------------------------------------------------------------------------------------

const main = async () => {
  const receipt = JSON.parse(readFileSync(resolve(rawDir, "receipt.json"), "utf8"));
  const xhip = readXhip();
  const gaia = [...readGaiaNearby(), ...readGaiaGalaxy()];
  const gaiaGrid = makeGrid();
  for (const star of gaia) gridAdd(gaiaGrid, star.ra, star.dec, star);

  // Cross-match: propagate Hipparcos J2000 positions to Gaia's J2016 with the catalogued proper motion.
  let matched = 0;
  for (const star of xhip) {
    const years = 16;
    const dec2016 = star.dec + (star.pmDec * years) / 3.6e6;
    const ra2016 = star.ra + (star.pmRa * years) / 3.6e6 / Math.max(1e-6, Math.cos(star.dec * DEG));
    const u = unit(ra2016, dec2016);
    let best = null;
    let bestSep = MATCH_ARCSEC / 3600;
    for (const candidate of gridNear(gaiaGrid, ra2016, dec2016, MATCH_ARCSEC / 3600)) {
      if (Math.abs(candidate.g - star.v) > 2) continue;
      const sep = angleDeg(u, unit(candidate.ra, candidate.dec));
      if (sep <= bestSep) {
        bestSep = sep;
        best = candidate;
      }
    }
    star.gaia = best;
    if (best) matched += 1;
    // Position actually drawn (light-years, ICRS): Gaia's where it has the star, Hipparcos' otherwise.
    const drawn = best ? { ra: best.ra, dec: best.dec, d: best.distanceLy } : { ra: star.ra, dec: star.dec, d: star.distanceLy };
    const du = unit(drawn.ra, drawn.dec);
    star.xyz = [du[0] * drawn.d, du[1] * drawn.d, du[2] * drawn.d];
    star.drawnDistanceLy = drawn.d;
  }

  // Bright layer: XHIP stars Gaia does not draw, brightest first.
  const bright = xhip.filter((star) => !star.gaia).sort((a, b) => a.v - b.v);
  const count = bright.length;
  const bytes = 16 + count * 12 + count * 2 + count;
  const buffer = Buffer.alloc(Math.ceil(bytes / 4) * 4);
  buffer.write("SVGP", 0, "ascii");
  buffer.writeUInt16LE(1, 4);
  buffer.writeUInt16LE(0, 6);
  buffer.writeUInt32LE(count, 8);
  let p = 16;
  for (const star of bright) {
    buffer.writeFloatLE(star.xyz[0], p);
    buffer.writeFloatLE(star.xyz[1], p + 4);
    buffer.writeFloatLE(star.xyz[2], p + 8);
    p += 12;
  }
  for (const star of bright) {
    const absMag = star.v - 5 * (Math.log10(star.drawnDistanceLy / LY_PER_PC) - 1);
    buffer.writeInt16LE(Math.max(-32_000, Math.min(32_000, Math.round(absMag * 100))), p);
    p += 2;
  }
  for (const star of bright) {
    buffer.writeUInt8(temperatureIndex(temperatureFromBv(star.bv)), p);
    p += 1;
  }

  // Figures: snap each d3-celestial vertex to the brightest XHIP star within 0.15°.
  const xhipGrid = makeGrid();
  for (const star of xhip) gridAdd(xhipGrid, star.ra, star.dec, star);
  const snap = (lon, lat) => {
    const ra = (lon + 360) % 360;
    const u = unit(ra, lat);
    let best = null;
    for (const star of gridNear(xhipGrid, ra, lat, FIGURE_MATCH_DEG)) {
      const sep = angleDeg(u, unit(star.ra, star.dec));
      if (sep > FIGURE_MATCH_DEG) continue;
      if (!best || star.v < best.star.v - 0.5 || (Math.abs(star.v - best.star.v) <= 0.5 && sep < best.sep)) best = { star, sep };
    }
    return best?.star ?? null;
  };
  const lines = JSON.parse(readFileSync(resolve(rawDir, "constellations.lines.json"), "utf8"));
  const names = JSON.parse(readFileSync(resolve(rawDir, "constellations.json"), "utf8"));
  const nameById = new Map();
  for (const feature of names.features) if (!nameById.has(feature.id)) nameById.set(feature.id, feature);
  const used = new Map();
  let vertices = 0;
  let unmatched = 0;
  const byId = new Map();
  for (const feature of lines.features) {
    const info = nameById.get(feature.id);
    // Serpens is one constellation in two parts (Caput and Cauda): one figure, one name.
    const entry = byId.get(feature.id);
    const polylines = entry ? entry.lines : [];
    for (const path of feature.geometry.coordinates) {
      const hips = [];
      for (const [lon, lat] of path) {
        vertices += 1;
        const star = snap(lon, lat);
        if (!star) {
          unmatched += 1;
          continue;
        }
        if (hips[hips.length - 1] !== star.hip) hips.push(star.hip);
        used.set(star.hip, star);
      }
      if (hips.length >= 2) polylines.push(hips);
    }
    if (entry) continue;
    const [lon, lat] = info?.geometry.coordinates ?? [0, 0];
    byId.set(feature.id, {
      id: feature.id,
      name: feature.id === "Ser" ? "Serpens" : (info?.properties.name ?? feature.id),
      rank: Number(info?.properties.rank ?? 3),
      labelRaDeg: Math.round((((lon + 360) % 360)) * 1000) / 1000,
      labelDecDeg: Math.round(lat * 1000) / 1000,
      lines: polylines,
    });
  }
  const constellations = [...byId.values()];

  // Every figure star plus every star with an IAU proper name, for labels, search and the panel.
  const round = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits;
  const starRecords = new Map();
  for (const star of xhip) if (used.has(star.hip) || (star.properName && star.v <= 6)) starRecords.set(star.hip, star);
  const stars = [...starRecords.values()]
    .sort((a, b) => a.v - b.v)
    .map((star) => ({
      hip: star.hip,
      name: star.properName,
      designation: star.designation || null,
      constellation: star.constellation || null,
      v: round(star.v, 2),
      bv: Number.isFinite(star.bv) ? round(star.bv, 3) : null,
      spType: star.spType || null,
      raDeg: round(star.ra, 5),
      decDeg: round(star.dec, 5),
      distanceLy: round(star.drawnDistanceLy, star.drawnDistanceLy < 100 ? 2 : 1),
      distanceSource: star.gaia ? "gaia-dr3" : star.distanceFlag === "lower-limit" ? "hipparcos-lower-limit" : "hipparcos-2007",
      xyz: star.xyz.map((value) => round(value, 3)),
    }));

  await mkdir(outDir, { recursive: true });
  await writeFile(resolve(outDir, "bright-stars.svgp"), buffer);
  const sources = {
    xhip: {
      title: "XHIP: An Extended Hipparcos Compilation (Anderson & Francis 2012)",
      vizier: "https://cdsarc.cds.unistra.fr/viz-bin/cat/V/137D",
      bibcode: "2012AstL...38..331A",
      selection: "Hp ≤ 7.0",
      distances: "Hipparcos 2007 (van Leeuwen) parallaxes as compiled by XHIP; parallaxes under 2σ are placed at 1/(2σ) and flagged as lower limits",
      credit: "Anderson & Francis (2012), via CDS VizieR; Hipparcos: ESA",
    },
    names: {
      title: "IAU Catalog of Star Names (WGSN)",
      url: "https://www.iau.org/public/themes/naming_stars/",
      licence: "IAU products are released under Creative Commons Attribution",
      credit: "Star names: IAU Working Group on Star Names",
    },
    figures: {
      title: "d3-celestial constellation lines (IAU figures)",
      url: "https://github.com/ofrohn/d3-celestial",
      licence: "BSD-3-Clause, © 2015 Olaf Frohn",
      credit: "Constellation figures: d3-celestial by Olaf Frohn (BSD-3-Clause), after the IAU charts",
    },
    gaia: "Stars Gaia DR3 already draws (≤ 2.5″ after propagating Hipparcos positions to J2016) keep Gaia's position and distance.",
  };
  const figures = {
    schemaVersion: 1,
    format: "spaceviewer-constellation-figures-v1",
    referenceFrame: "heliocentric-icrs-cartesian",
    positionUnit: "light-year",
    sources,
    retrievedAt: receipt.retrievedAt,
    build: { vertices, unmatchedVertices: unmatched, figureStars: used.size },
    constellations,
    stars,
  };
  const figuresText = `${JSON.stringify(figures)}\n`;
  await writeFile(resolve(outDir, "constellations.json"), figuresText);
  const manifest = {
    schemaVersion: 1,
    format: "spaceviewer-gaia-points-v1",
    catalog: {
      id: "xhip-hp7-not-in-gaia",
      title: "Naked-eye stars Gaia DR3 cannot measure, from XHIP (Hp ≤ 7.0)",
      referenceFrame: "heliocentric-icrs-cartesian",
      positionUnit: "light-year",
      epoch: "J2000.0",
      provenance: { ...sources.xhip, retrievedAt: receipt.retrievedAt, sourceFiles: receipt.files },
    },
    starCount: count,
    xhipStars: xhip.length,
    matchedToGaia: matched,
    temperatureIndex: { min: TEMPERATURE_MIN, max: TEMPERATURE_MAX, scale: "log", from: "B−V via Ballesteros (2012)" },
    chunks: [{ url: "/catalogs/sky/bright-stars.svgp", count, bytes: buffer.byteLength, sha256: sha256(buffer) }],
    figures: { url: "/catalogs/sky/constellations.json", bytes: Buffer.byteLength(figuresText), sha256: sha256(Buffer.from(figuresText)) },
  };
  await writeFile(resolve(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    `XHIP ${xhip.length} stars, ${matched} drawn by Gaia, ${count} in bright layer; ${constellations.length} figures, ${vertices} vertices (${unmatched} unmatched), ${stars.length} star records`,
  );
};

await main();
