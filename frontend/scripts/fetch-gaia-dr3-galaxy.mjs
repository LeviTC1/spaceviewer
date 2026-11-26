#!/usr/bin/env node
// Downloads the Gaia DR3 sample behind the explorer's "galaxy" star layer (about 1.5 million stars)
// with asynchronous TAP jobs. The CSV (~150 MB) is not committed: it is written to ../tmp/catalog-raw/
// and turned into compact binary chunks by scripts/build-galaxy-star-catalog.mjs.
//
//   node scripts/fetch-gaia-dr3-galaxy.mjs [--mirror=ari]
//
// ESA's archive is used by default; the ARI Heidelberg mirror serves the same gaiadr3.gaia_source table.

import { createHash } from "node:crypto";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MIRRORS = {
  esa: "https://gea.esac.esa.int/tap-server/tap",
  ari: "https://gaia.ari.uni-heidelberg.de/tap",
};
export const GALAXY_ADQL =
  "SELECT source_id, ra, dec, parallax, parallax_error, phot_g_mean_mag, bp_rp FROM gaiadr3.gaia_source WHERE phot_g_mean_mag <= 10.5 AND parallax > 0 AND parallax_over_error >= 5";

const mirror = process.argv.find((arg) => arg.startsWith("--mirror="))?.split("=")[1] ?? "esa";
const base = MIRRORS[mirror];
if (!base) throw new Error(`Unknown mirror ${mirror}`);

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(scriptDirectory, "../../tmp/catalog-raw");
const outCsv = resolve(outDir, "gaia-dr3-g105-poe5.csv");

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

// ESA caps anonymous jobs at 60 s, so the sky is fetched in slices. Gaia DR3 source_id encodes a
// HEALPix level-12 index in its top bits (source_id / 2^35), so HEALPix pixel p at level L is the
// contiguous, indexed id range [p·2^(59−2L), (p+1)·2^(59−2L)). Start from the 48 level-1 pixels and
// split any slice that times out into its four children (dense galactic-plane fields need it).
// Finished slices are cached in tmp/catalog-raw/gaia-slices/ so an interrupted run resumes.
const sliceDir = resolve(outDir, "gaia-slices");
const bound = (level, p) => (BigInt(p) * 2n ** BigInt(59 - 2 * level)).toString();

class TimedOut extends Error {}

const runJob = async (query) => {
  const body = new URLSearchParams({ REQUEST: "doQuery", LANG: "ADQL", FORMAT: "csv", PHASE: "RUN", MAXREC: "3000000", QUERY: query });
  const created = await fetch(`${base}/async`, { method: "POST", body, redirect: "manual" });
  const job = created.headers.get("location");
  if (!job) throw new Error(`TAP did not create a job (HTTP ${created.status})`);
  for (;;) {
    const phase = (await (await fetch(`${job}/phase`)).text()).trim();
    if (phase === "COMPLETED") break;
    if (phase === "ERROR" || phase === "ABORTED") {
      const detail = await (await fetch(`${job}/error`)).text();
      if (/execution time/i.test(detail)) throw new TimedOut(job);
      throw new Error(`job ${phase}: ${detail.slice(0, 400)}`);
    }
    await sleep(2_000);
  }
  const result = await fetch(`${job}/results/result`);
  if (!result.ok) throw new Error(`download failed (HTTP ${result.status})`);
  return { job, text: await result.text() };
};

const fetchSlice = async (level, p, slices) => {
  const file = resolve(sliceDir, `L${level}-${p}.csv`);
  const meta = resolve(sliceDir, `L${level}-${p}.json`);
  if (existsSync(file) && existsSync(meta)) {
    slices.push(JSON.parse(await readFile(meta, "utf8")));
    return;
  }
  const query = `${GALAXY_ADQL} AND source_id >= ${bound(level, p)} AND source_id < ${bound(level, p + 1)}`;
  for (let attempt = 1; ; attempt += 1) {
    try {
      const { job, text } = await runJob(query);
      const rows = text.split("\n").filter(Boolean).length - 1;
      await writeFile(file, text);
      const record = { healpixLevel: level, healpixIndex: p, rows, job };
      await writeFile(meta, JSON.stringify(record));
      slices.push(record);
      console.log(`level ${level} pixel ${p}: ${rows.toLocaleString()} rows`);
      return;
    } catch (error) {
      if (error instanceof TimedOut) {
        console.log(`level ${level} pixel ${p} timed out; splitting`);
        for (let child = 0; child < 4; child += 1) await fetchSlice(level + 1, p * 4 + child, slices);
        return;
      }
      if (attempt >= 6) throw error;
      await sleep(5_000 * attempt);
    }
  }
};

const main = async () => {
  await mkdir(sliceDir, { recursive: true });
  const slices = [];
  for (let p = 0; p < 48; p += 1) await fetchSlice(1, p, slices);
  slices.sort((a, b) => a.healpixLevel - b.healpixLevel || a.healpixIndex - b.healpixIndex);
  const out = createWriteStream(outCsv);
  let header = null;
  for (const slice of slices) {
    const lines = (await readFile(resolve(sliceDir, `L${slice.healpixLevel}-${slice.healpixIndex}.csv`), "utf8")).split("\n").filter(Boolean);
    if (!header) {
      header = lines[0];
      out.write(`${header}\n`);
    } else if (lines[0] !== header) throw new Error(`slice L${slice.healpixLevel}-${slice.healpixIndex} returned different columns`);
    for (let i = 1; i < lines.length; i += 1) out.write(`${lines[i]}\n`);
  }
  await new Promise((done) => out.end(done));
  const csv = await readFile(outCsv);
  const rows = slices.reduce((sum, slice) => sum + slice.rows, 0);
  const receipt = {
    retrievedAt: new Date().toISOString(),
    tap: base,
    query: GALAXY_ADQL,
    slicing: "HEALPix source_id ranges [p·2^(59−2L), (p+1)·2^(59−2L)), level 1 split to finer levels where a job timed out",
    rows,
    bytes: csv.byteLength,
    sha256: createHash("sha256").update(csv).digest("hex"),
    slices,
  };
  await writeFile(resolve(outDir, "gaia-dr3-g105-poe5.receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(`${rows.toLocaleString()} rows in ${slices.length} slices → ${outCsv}`);
};

await main();
