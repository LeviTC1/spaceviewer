#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { chromium } from "playwright";

const readArgument = (name, fallback) => {
  const prefix = `${name}=`;
  const match = process.argv.slice(2).find((argument) => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
};

const baseUrl = readArgument("--base-url", "http://localhost:5174");
const quality = readArgument("--quality", "balanced");
const outputPathArgument = readArgument("--output", "");
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 940 } });
await context.addInitScript(
  ({ selectedQuality }) => {
    window.localStorage.setItem("spaceviewer.astro.quality.v1", selectedQuality);
    window.localStorage.setItem("spaceviewer.skymap.finalExperienceSeen.v1", "true");
    window.localStorage.setItem("spaceviewer.reduceMotion", "true");
  },
  { selectedQuality: quality },
);
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => consoleErrors.push(error.message));

const startedAt = performance.now();
await page.goto(`${baseUrl}/skymap`, { waitUntil: "domcontentloaded", timeout: 30_000 });
await page.locator(".skymap-status-strip", { hasText: "ready · view-adjacent · 15,448/15,448 sources" }).waitFor({
  state: "visible",
  timeout: 30_000,
});
const readyMs = performance.now() - startedAt;

const canvas = page.locator(".skymap-viewport canvas");
await canvas.hover();
await page.mouse.wheel(0, -260);
await page.waitForTimeout(1_300);

const metrics = await page.evaluate(({ selectedQuality, elapsedMs }) => {
  const catalogueResources = performance
    .getEntriesByType("resource")
    .filter((entry) => entry.name.includes("/catalogs/nearby-stars/"));
  const navigation = performance.getEntriesByType("navigation")[0];
  return {
    measuredAt: new Date().toISOString(),
    environment: "local headless Chromium; frame rate is diagnostic and not representative of a headed GPU session",
    url: window.location.href,
    quality: selectedQuality,
    catalogueReadyMs: Math.round(elapsedMs),
    document: {
      domContentLoadedMs: navigation ? Math.round(navigation.domContentLoadedEventEnd) : null,
      loadEventMs: navigation ? Math.round(navigation.loadEventEnd) : null,
      canvasCount: document.querySelectorAll("canvas").length,
      viteOverlayCount: document.querySelectorAll("vite-error-overlay").length,
    },
    catalogue: {
      requests: catalogueResources.length,
      binaryChunkRequests: catalogueResources.filter((entry) => entry.name.endsWith(".svsc")).length,
      metadataRequests: catalogueResources.filter((entry) => entry.name.endsWith(".meta.json")).length,
      transferBytes: catalogueResources.reduce((total, entry) => total + (entry.transferSize || 0), 0),
      encodedBodyBytes: catalogueResources.reduce((total, entry) => total + (entry.encodedBodySize || 0), 0),
      decodedBodyBytes: catalogueResources.reduce((total, entry) => total + (entry.decodedBodySize || 0), 0),
      resources: catalogueResources.map((entry) => ({
        name: entry.name.split("/").at(-1),
        transferBytes: entry.transferSize,
        encodedBodyBytes: entry.encodedBodySize,
        decodedBodyBytes: entry.decodedBodySize,
        durationMs: Math.round(entry.duration * 10) / 10,
      })),
    },
    catalogueViewFilter: window.__SPACEVIEWER_CATALOG_FILTER__?.skymap ?? null,
    renderActivity: window.__SPACEVIEWER_PERF__?.skymap ?? null,
    webgl: window.__SPACEVIEWER_WEBGL__?.skymap ?? null,
  };
}, { selectedQuality: quality, elapsedMs: readyMs });

const report = { ...metrics, consoleErrors };
if (outputPathArgument) {
  const outputPath = resolve(process.cwd(), outputPathArgument);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify(report, null, 2));
await browser.close();

if (consoleErrors.length) process.exitCode = 1;
