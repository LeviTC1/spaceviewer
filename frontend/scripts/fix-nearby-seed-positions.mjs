#!/usr/bin/env node
// Replaces the placeholder positions in catalog-source/nearby-stars-seed.json with measured ones.
//
// The seed's 55 named stars (Sirius, Vega, Proxima Centauri…) came from an early prototype whose x/y/z
// were illustrative, not real directions. This resolves each name in SIMBAD (CDS, via the CfA mirror)
// and rewrites x/y/z (heliocentric ICRS, light-years), the distance, RA/Dec and parallax, keeping the
// curated importance and luminosity; spectral types and V magnitudes are taken from SIMBAD too.
//
//   node scripts/fix-nearby-seed-positions.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const path = resolve(dirname(fileURLToPath(import.meta.url)), "../catalog-source/nearby-stars-seed.json");
const LY_PER_PC = 3.261_563_777;

// Names SIMBAD knows these stars by, where the seed's display name is not an identifier.
const SIMBAD_NAMES = {
  "Alpha Centauri A": "alf Cen A",
  "Alpha Centauri B": "alf Cen B",
  "Sirius A": "alf CMa A",
  "Sirius B": "alf CMa B",
  "Luyten 726-8 A": "BL Cet",
  "Luyten 726-8 B": "UV Cet",
  "61 Cygni A": "61 Cyg A",
  "61 Cygni B": "61 Cyg B",
  "Groombridge 34 A": "GX And",
  "Groombridge 34 B": "GQ And",
  "Wolf 424 A": "Wolf 424 A",
  "Wolf 424 B": "Wolf 424 B",
  "Gliese 15 A": "GX And",
  "Gliese 15 B": "GQ And",
  "Gliese 667 C": "GJ 667 C",
  "Gliese 1": "GJ 1",
  "Gliese 581": "GJ 581",
  "Gliese 876": "GJ 876",
  "Gliese 832": "GJ 832",
  "Gliese 163": "GJ 163",
  "Luyten 372-58": "L 372-58",
  "40 Eridani": "omi02 Eri",
  "Omicron2 Eridani": "omi02 Eri",
  "Beta Comae": "bet Com",
  "Zeta Reticuli": "zet01 Ret",
  "Gamma Leporis": "gam Lep",
  "Epsilon Leporis": "eps Lep",
  "Delta Eridani": "del Eri",
  "Xi Bootis": "ksi Boo",
  "Eta Cassiopeiae": "eta Cas",
  "Delta Pavonis": "del Pav",
  "Epsilon Ceti": "eps Cet",
  "82 Eridani": "82 Eri",
  "Epsilon Indi": "eps Ind",
  "Epsilon Eridani": "eps Eri",
  "Tau Ceti": "tau Cet",
  "Van Maanen's Star": "GJ 35",
  "Kapteyn's Star": "Kapteyn's star",
  "Barnard's Star": "Barnard's star",
};

const SCRIPT = "https://simbad.cfa.harvard.edu/simbad/sim-script";

// SIMBAD's script interface resolves everyday names ("Wolf 359", "40 Eridani") as its web form does.
const resolveName = async (name) => {
  const script = `output console=off script=off\nformat object "%IDLIST(1)|%COO(d;A D)|%PLX(V E)|%SP(S)|%FLUXLIST(V;F)"\nquery id ${name}`;
  const response = await fetch(SCRIPT, { method: "POST", body: new URLSearchParams({ script }) });
  if (!response.ok) throw new Error(`SIMBAD HTTP ${response.status}`);
  const text = await response.text();
  // Without errors SIMBAD returns just the data line; with errors it adds "::error::" / "::data::" sections.
  if (text.includes("::error::") && !text.includes("::data::")) return null;
  const data = text.includes("::data::") ? text.split("::data::")[1] : text;
  const line = data.split("\n").map((value) => value.trim()).find((value) => value.includes("|"));
  if (!line) return null;
  const [mainId, coords, plx, spectralType, vmag] = line.split("|");
  const [ra, dec] = coords.trim().split(/\s+/).map(Number);
  const [plxValue, plxErr] = plx.trim().split(/\s+/).map(Number);
  const v = Number.parseFloat(vmag ?? "");
  return {
    mainId: mainId.replace(/\s+/g, " ").trim(),
    ra,
    dec,
    plx: plxValue,
    plxErr: Number.isFinite(plxErr) ? plxErr : null,
    spectralType: spectralType?.trim() || null,
    v: Number.isFinite(v) ? v : null,
  };
};

const main = async () => {
  const source = JSON.parse(readFileSync(path, "utf8"));
  const records = source.records.filter((record) => record.name !== "Sun");
  const found = new Map();
  for (let i = 0; i < records.length; i += 6) {
    const batch = records.slice(i, i + 6);
    const results = await Promise.all(batch.map((record) => resolveName(SIMBAD_NAMES[record.name] ?? record.name)));
    batch.forEach((record, k) => found.set(record.name, results[k]));
  }
  const missing = [];
  for (const record of records) {
    const hit = found.get(record.name);
    if (!hit || !(hit.plx > 0)) {
      missing.push(record.name);
      continue;
    }
    const ra = (hit.ra * Math.PI) / 180;
    const dec = (hit.dec * Math.PI) / 180;
    const distanceLy = (1000 / hit.plx) * LY_PER_PC;
    record.x = distanceLy * Math.cos(dec) * Math.cos(ra);
    record.y = distanceLy * Math.cos(dec) * Math.sin(ra);
    record.z = distanceLy * Math.sin(dec);
    record.distanceLy = Math.round(distanceLy * 1000) / 1000;
    record.raDeg = Math.round(hit.ra * 1e6) / 1e6;
    record.decDeg = Math.round(hit.dec * 1e6) / 1e6;
    record.parallaxMas = hit.plx;
    if (hit.plxErr !== null) record.parallaxErrorMas = hit.plxErr;
    record.simbadId = hit.mainId;
    if (hit.v !== null) record.apparentMagnitudeV = hit.v;
    if (hit.spectralType) {
      // A different spectral class means the seed's temperature belonged to another star: derive it again.
      if (record.spectralType && record.spectralType[0] !== hit.spectralType[0]) delete record.temperatureK;
      record.spectralType = hit.spectralType;
    }
  }
  if (missing.length) throw new Error(`Not resolved in SIMBAD: ${missing.join(", ")}`);
  source.catalog.referenceFrame = "heliocentric-icrs-cartesian";
  source.catalog.status = "positions-from-simbad";
  source.catalog.version = "nearby-stars-seed-v4";
  source.catalog.epoch = { kind: "julian-year", value: "J2000.0" };
  source.catalog.provenance = {
    ...source.catalog.provenance,
    positionsSourceName: "SIMBAD (CDS) adopted ICRS position and parallax, via the CfA mirror",
    positionsSourceUrl: SCRIPT,
    positionsRetrievedAt: new Date().toISOString(),
    notes:
      "Names, importance and luminosities are preserved from the original curated seed. Positions (ICRS, J2000), parallaxes, spectral types and V magnitudes are SIMBAD's adopted values; the earlier x/y/z were illustrative placeholders, not real directions. Distances are 1/parallax.",
  };
  writeFileSync(path, `${JSON.stringify(source, null, 2)}\n`);
  console.log(`Updated ${records.length} stars from SIMBAD.`);
};

await main();
