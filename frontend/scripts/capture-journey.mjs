#!/usr/bin/env node
// Benchmark / evidence harness: drives real Google Chrome (GPU) through a scripted
// journey, recording video, stills and frame timing. Used for the Galaxium
// comparison and SpaceViewer before/after evidence.
//
//   node scripts/capture-journey.mjs <journey.mjs> --out=<dir> [--width=1440 --height=900 --dpr=2 --headed]
//
// A journey module default-exports `async (ctx) => {}` where ctx has
// { page, shot(name), wait(ms), fps(label, ms), log(...), drag(...), wheel(...) }.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, basename } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, webkit } from "playwright";

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const journeyPath = argv.find((a) => !a.startsWith("--"));
if (!journeyPath) {
  console.error("usage: capture-journey.mjs <journey.mjs> --out=<dir>");
  process.exit(1);
}
const outDir = resolve(opt("out", `./capture-${Date.now()}`));
const width = Number(opt("width", 1440));
const height = Number(opt("height", 900));
const dpr = Number(opt("dpr", 2));
const headed = argv.includes("--headed");
const touch = argv.includes("--touch");
const record = !argv.includes("--no-video");
mkdirSync(outDir, { recursive: true });

const engineName = opt("engine", "chrome");
const browserType = engineName === "webkit" ? webkit : chromium;
const browser = await browserType.launch(engineName === "webkit" ? { headless: !headed } : {
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: !headed,
  args: [
    "--use-angle=metal",
    "--enable-gpu",
    "--ignore-gpu-blocklist",
    "--enable-unsafe-webgpu",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
  ],
});
const context = await browser.newContext({
  viewport: { width, height },
  deviceScaleFactor: dpr,
  hasTouch: touch,
  isMobile: touch,
  recordVideo: record ? { dir: outDir, size: { width: Math.min(width, 1280), height: Math.round(Math.min(width, 1280) * (height / width)) } } : undefined,
});
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 400));
});
page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${String(err).slice(0, 400)}`));

const report = { journey: basename(journeyPath), width, height, dpr, touch, steps: [], fps: [], notes: [] };
const t0 = Date.now();
const log = (...a) => {
  const line = `[${((Date.now() - t0) / 1000).toFixed(1)}s] ${a.join(" ")}`;
  console.log(line);
  report.notes.push(line);
};
let shotIndex = 0;
const ctx = {
  page,
  log,
  wait: (ms) => page.waitForTimeout(ms),
  shot: async (name) => {
    shotIndex += 1;
    const file = `${String(shotIndex).padStart(2, "0")}-${name}.png`;
    await page.screenshot({ path: `${outDir}/${file}` });
    report.steps.push({ t: Date.now() - t0, shot: file });
    log("shot", file);
    return file;
  },
  // Measures rAF frame intervals for `ms` while optional `during` runs.
  fps: async (label, ms, during) => {
    await page.evaluate(() => {
      window.__fpsSamples = [];
      let last = performance.now();
      const loop = (now) => {
        window.__fpsSamples.push(now - last);
        last = now;
        if (window.__fpsRun) requestAnimationFrame(loop);
      };
      window.__fpsRun = true;
      requestAnimationFrame(loop);
    });
    if (during) await during();
    else await page.waitForTimeout(ms);
    if (during && ms) await page.waitForTimeout(ms);
    const samples = await page.evaluate(() => {
      window.__fpsRun = false;
      return window.__fpsSamples.slice(2);
    });
    const sorted = [...samples].sort((a, b) => a - b);
    const pick = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
    const mean = samples.reduce((s, v) => s + v, 0) / Math.max(1, samples.length);
    const entry = {
      label,
      frames: samples.length,
      meanMs: +mean.toFixed(2),
      p50Ms: +pick(0.5).toFixed(2),
      p95Ms: +pick(0.95).toFixed(2),
      maxMs: +pick(1).toFixed(2),
      over33ms: samples.filter((v) => v > 33.4).length,
    };
    report.fps.push(entry);
    log("fps", JSON.stringify(entry));
    return entry;
  },
  drag: async (x0, y0, dx, dy, steps = 30, button = "left") => {
    await page.mouse.move(x0, y0);
    await page.mouse.down({ button });
    for (let i = 1; i <= steps; i += 1) {
      await page.mouse.move(x0 + (dx * i) / steps, y0 + (dy * i) / steps);
      await page.waitForTimeout(16);
    }
    await page.mouse.up({ button });
  },
  // Trackpad-like wheel: many small deltas.
  wheel: async (x, y, totalDy, steps = 30, ctrlKey = false) => {
    await page.mouse.move(x, y);
    for (let i = 0; i < steps; i += 1) {
      if (ctrlKey) await page.keyboard.down("Control");
      await page.mouse.wheel(0, totalDy / steps);
      if (ctrlKey) await page.keyboard.up("Control");
      await page.waitForTimeout(16);
    }
  },
};

try {
  const mod = await import(pathToFileURL(resolve(journeyPath)).href);
  await mod.default(ctx);
} catch (error) {
  log("JOURNEY ERROR", String(error?.stack ?? error));
  report.error = String(error?.message ?? error);
  try {
    await ctx.shot("error-state");
  } catch {
    /* ignore */
  }
}
report.gpu = await page
  .evaluate(() => {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2");
    const dbg = gl?.getExtension("WEBGL_debug_renderer_info");
    return dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : "unknown";
  })
  .catch(() => "unknown");
report.consoleErrors = consoleErrors.slice(0, 40);
report.userAgent = await page.evaluate(() => navigator.userAgent).catch(() => "");
await context.close();
await browser.close();
writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 2));
console.log(`done -> ${outDir} (gpu: ${report.gpu})`);
