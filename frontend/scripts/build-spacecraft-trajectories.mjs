#!/usr/bin/env node
// Builds the explorer's spacecraft trajectories from JPL Horizons (public/catalogs/spacecraft/).
//
//   node scripts/build-spacecraft-trajectories.mjs [--only=juno]
//
// For each mission: heliocentric state vectors (ecliptic J2000, km and km/s) are fetched every 6 h over
// the whole span Horizons covers, then refined to 10 min and 1 min wherever the path bends too sharply
// for interpolation (planetary flybys, Parker's perihelia, Juno's perijoves). The dense series is then
// thinned so cubic Hermite interpolation of the kept states reproduces every fetched state within
// tolerance. Raw responses are cached in ../tmp/catalog-raw/spacecraft/.
//
// Times are Horizons TDB, used as-is: the explorer's planet ephemeris treats its clock the same way, so
// flybys line up exactly (the ~69 s TDB − UTC offset shifts both together).
//
// Output per mission: <id>.svtr, little-endian float64 records [tMs, x, y, z, vx, vy, vz].

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(scriptDirectory, "../public/catalogs/spacecraft");
const rawDir = resolve(scriptDirectory, "../../tmp/catalog-raw/spacecraft");
const API = "https://ssd.jpl.nasa.gov/api/horizons.api";
const only = process.argv.find((arg) => arg.startsWith("--only="))?.split("=")[1];

export const MISSIONS = [
  { id: "jwst", horizons: "-170", name: "James Webb Space Telescope", start: "2021-12-25 13:00", stop: "2031-11-15", agency: "NASA · ESA · CSA" },
  { id: "parker-solar-probe", horizons: "-96", name: "Parker Solar Probe", start: "2018-08-12 08:17", stop: "2029-12-31", agency: "NASA" },
  { id: "new-horizons", horizons: "-98", name: "New Horizons", start: "2006-01-19 19:52", stop: "2039-12-31", agency: "NASA" },
  { id: "voyager-1", horizons: "-31", name: "Voyager 1", start: "1977-09-05 14:00", stop: "2039-12-31", agency: "NASA" },
  { id: "voyager-2", horizons: "-32", name: "Voyager 2", start: "1977-08-20 15:33", stop: "2039-12-31", agency: "NASA" },
  { id: "juno", horizons: "-61", name: "Juno", start: "2011-08-05 17:20", stop: "2028-09-01", agency: "NASA" },
  { id: "europa-clipper", horizons: "-159", name: "Europa Clipper", start: "2024-10-14 16:16", stop: "2034-09-02", agency: "NASA" },
  { id: "lucy", horizons: "-49", name: "Lucy", start: "2021-10-16 10:34", stop: "2033-03-12", agency: "NASA" },
  { id: "psyche", horizons: "-255", name: "Psyche", start: "2023-10-13 15:23", stop: "2029-02-24", agency: "NASA" },
  { id: "bepicolombo", horizons: "-121", name: "BepiColombo", start: "2018-10-20 02:14", stop: "2027-04-10", agency: "ESA · JAXA" },
  { id: "juice", horizons: "-28", name: "Juice", start: "2023-04-14 12:44", stop: "2031-07-21", agency: "ESA" },
  // Pluto is not in VSOP87: its system barycentre for 1975–2050, and Pluto's own centre (which circles the
  // barycentre every 6.4 days, ~2,100 km out) around the New Horizons encounter.
  { id: "pluto-barycentre", horizons: "9", name: "Pluto system barycentre", start: "1975-01-01 00:00", stop: "2050-12-31", agency: "", body: "pluto", step: "5 d" },
  { id: "pluto-2015", horizons: "999", name: "Pluto", start: "2015-05-01 00:00", stop: "2015-09-01", agency: "", body: "pluto", step: "1 h" },
];

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 16).replace("T", " ");

/** One Horizons vector request (cached). Returns [{ t, p:[x,y,z], v:[vx,vy,vz] }]. */
const fetchVectors = async (horizons, startMs, stopMs, step) => {
  const key = `${horizons}_${startMs}_${stopMs}_${step.replace(/\s+/g, "")}`;
  const file = resolve(rawDir, `${key}.json`);
  let result;
  if (existsSync(file)) result = JSON.parse(await readFile(file, "utf8")).result;
  else {
    const params = new URLSearchParams({
      format: "json",
      COMMAND: `'${horizons}'`,
      EPHEM_TYPE: "VECTORS",
      CENTER: "'500@10'",
      START_TIME: `'${isoDay(startMs)}'`,
      STOP_TIME: `'${isoDay(stopMs)}'`,
      STEP_SIZE: `'${step}'`,
      REF_PLANE: "ECLIPTIC",
      REF_SYSTEM: "ICRF",
      OUT_UNITS: "KM-S",
      VEC_TABLE: "2",
      CSV_FORMAT: "YES",
      OBJ_DATA: "NO",
    });
    for (let attempt = 1; ; attempt += 1) {
      try {
        const response = await fetch(`${API}?${params}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const json = await response.json();
        result = json.result;
        if (!result?.includes("$$SOE")) throw new Error(`Horizons: ${String(result ?? json.error).slice(-300)}`);
        await writeFile(file, JSON.stringify({ result }));
        break;
      } catch (error) {
        if (attempt >= 4) throw error;
        await sleep(2_000 * attempt);
      }
    }
  }
  const body = result.split("$$SOE")[1].split("$$EOE")[0];
  const rows = [];
  for (const line of body.split("\n")) {
    const cells = line.split(",").map((cell) => cell.trim());
    if (cells.length < 8) continue;
    const jd = Number(cells[0]);
    const values = cells.slice(2, 8).map(Number);
    if (!Number.isFinite(jd) || values.some((value) => !Number.isFinite(value))) continue;
    rows.push({ t: (jd - 2_440_587.5) * 86_400_000, p: values.slice(0, 3), v: values.slice(3, 6) });
  }
  return rows;
};

/** Cubic Hermite position between two states at time t (ms). */
export const hermite = (a, b, t) => {
  const h = (b.t - a.t) / 1000;
  const s = (t - a.t) / (b.t - a.t);
  const h00 = 2 * s ** 3 - 3 * s ** 2 + 1;
  const h10 = s ** 3 - 2 * s ** 2 + s;
  const h01 = -2 * s ** 3 + 3 * s ** 2;
  const h11 = s ** 3 - s ** 2;
  return [0, 1, 2].map((k) => h00 * a.p[k] + h10 * h * a.v[k] + h01 * b.p[k] + h11 * h * b.v[k]);
};

// Tight everywhere: flybys happen far from the Sun too (New Horizons passed 12,500 km above Pluto).
const tolerance = (state) => Math.max(8, 1e-8 * Math.hypot(...state.p));
const error = (a, b, mid) => {
  const p = hermite(a, b, mid.t);
  return Math.hypot(p[0] - mid.p[0], p[1] - mid.p[1], p[2] - mid.p[2]);
};

/** Time windows where leave-one-out Hermite over two steps misses the middle state. */
const badWindows = (rows) => {
  const windows = [];
  for (let i = 1; i < rows.length - 1; i += 1) {
    if (error(rows[i - 1], rows[i + 1], rows[i]) > tolerance(rows[i])) windows.push([rows[i - 1].t, rows[i + 1].t]);
  }
  // Merge overlaps.
  const merged = [];
  for (const window of windows) {
    const last = merged[merged.length - 1];
    if (last && window[0] <= last[1]) last[1] = Math.max(last[1], window[1]);
    else merged.push([...window]);
  }
  return merged;
};

const fetchSpan = async (mission, startMs, stopMs, step, maxRows) => {
  const stepMs = step.endsWith("d") ? Number.parseFloat(step) * 86_400_000 : step.endsWith("h") ? Number.parseFloat(step) * 3_600_000 : Number.parseFloat(step) * 60_000;
  const rows = [];
  for (let t = startMs; t < stopMs; t += stepMs * maxRows) {
    const end = Math.min(stopMs, t + stepMs * maxRows);
    rows.push(...(await fetchVectors(mission.horizons, t, end, step)));
  }
  return rows;
};

const dedupe = (rows) => {
  rows.sort((a, b) => a.t - b.t);
  return rows.filter((row, i) => i === 0 || row.t - rows[i - 1].t > 1_000);
};

/** Greedy thinning: keep the farthest next state such that every skipped state is reproduced. */
const thin = (rows) => {
  const kept = [rows[0]];
  let i = 0;
  while (i < rows.length - 1) {
    let lo = i + 1;
    let hi = Math.min(rows.length - 1, i + 4096);
    const ok = (j) => {
      for (let k = i + 1; k < j; k += 1) if (error(rows[i], rows[j], rows[k]) > tolerance(rows[k])) return false;
      return true;
    };
    // Exponential then binary search for the farthest acceptable j.
    let good = lo;
    let probe = lo + 1;
    while (probe <= hi && ok(probe)) {
      good = probe;
      probe = good + Math.max(1, good - i);
    }
    lo = good;
    hi = Math.min(hi, probe);
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (ok(mid)) lo = mid;
      else hi = mid;
    }
    kept.push(rows[lo]);
    i = lo;
  }
  return kept;
};

const buildMission = async (mission) => {
  // Half an hour after Horizons' first state (launch-time states can sit a minute past the listed start).
  const start = Date.parse(`${mission.start.replace(" ", "T")}:00Z`) + (mission.body ? 0 : 30 * 60_000);
  const stop = Date.parse(`${mission.stop}T00:00:00Z`);
  let rows = await fetchSpan(mission, start, stop, mission.step ?? "6 h", 20_000);
  let refined = 0;
  for (const [step, pad] of [["10 m", 6 * 3_600_000], ["1 m", 20 * 60_000]]) {
    const windows = badWindows(dedupe(rows));
    for (const [a, b] of windows) {
      const extra = await fetchSpan(mission, Math.max(start, a - pad), Math.min(stop, b + pad), step, 20_000);
      rows.push(...extra);
      refined += extra.length;
    }
    rows = dedupe(rows);
  }
  const kept = thin(rows);
  const buffer = Buffer.alloc(kept.length * 7 * 8);
  kept.forEach((row, i) => {
    const values = [row.t, ...row.p, ...row.v];
    values.forEach((value, k) => buffer.writeDoubleLE(value, (i * 7 + k) * 8));
  });
  await writeFile(resolve(outDir, `${mission.id}.svtr`), buffer);
  let maxError = 0;
  for (let r = 0, j = 1; r < rows.length; r += 1) {
    while (j < kept.length - 1 && kept[j].t < rows[r].t) j += 1;
    maxError = Math.max(maxError, error(kept[j - 1], kept[j], rows[r]));
  }
  console.log(`${mission.name}: ${rows.length.toLocaleString()} states (${refined.toLocaleString()} refined) → ${kept.length.toLocaleString()} kept, ${(buffer.byteLength / 1024).toFixed(0)} KB, max error ${maxError.toFixed(1)} km`);
  return {
    id: mission.id,
    name: mission.name,
    agency: mission.agency,
    horizonsId: mission.horizons,
    ...(mission.body ? { body: mission.body } : {}),
    url: `/catalogs/spacecraft/${mission.id}.svtr`,
    startMs: kept[0].t,
    stopMs: kept[kept.length - 1].t,
    states: kept.length,
    fetchedStates: rows.length,
    bytes: buffer.byteLength,
    sha256: createHash("sha256").update(buffer).digest("hex"),
  };
};

const main = async () => {
  await mkdir(outDir, { recursive: true });
  await mkdir(rawDir, { recursive: true });
  const manifestPath = resolve(outDir, "manifest.json");
  const previous = existsSync(manifestPath) ? JSON.parse(await readFile(manifestPath, "utf8")) : null;
  const missions = [];
  for (const mission of MISSIONS) {
    if (only && mission.id !== only) {
      const old = previous?.missions.find((item) => item.id === mission.id);
      if (old) missions.push(old);
      continue;
    }
    missions.push(await buildMission(mission));
  }
  const manifest = {
    schemaVersion: 1,
    format: "spaceviewer-trajectory-hermite-v1",
    source: {
      name: "JPL Horizons System (NASA/JPL Solar System Dynamics)",
      url: "https://ssd.jpl.nasa.gov/horizons/",
      retrievedAt: new Date().toISOString(),
      credit: "Trajectories: NASA/JPL Horizons",
    },
    frame: "heliocentric ecliptic J2000 (ICRF), km and km/s",
    timeScale: "TDB, interpolated against the explorer clock as-is (the planet ephemeris uses the same convention)",
    record: "float64 little-endian [timeMs, x, y, z, vx, vy, vz], cubic Hermite between records",
    tolerance: "every fetched state reproduced within max(8 km, 1e-8 × heliocentric distance)",
    missions,
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
