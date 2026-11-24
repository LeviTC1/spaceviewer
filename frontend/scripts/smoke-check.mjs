#!/usr/bin/env node
import { existsSync } from "node:fs";
import { chromium } from "playwright";

const args = new Set(process.argv.slice(2));
const getArgValue = (name, fallback) => {
  const prefix = `${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
};

const baseUrl = getArgValue("--base-url", process.env.SPACEVIEWER_BASE_URL ?? "http://127.0.0.1:5174");
const apiBaseUrl = getArgValue("--api-base-url", process.env.SPACEVIEWER_API_BASE_URL ?? "http://127.0.0.1:3001");
const headed = args.has("--headed") || process.env.HEADLESS === "false";
const screenshotDir = getArgValue("--screenshot-dir", process.env.SPACEVIEWER_SMOKE_SCREENSHOTS ?? "");
const requestedChromePath = getArgValue("--chrome-path", process.env.PLAYWRIGHT_CHROME_PATH ?? "");
const onlyCheckName = getArgValue("--only", "").trim();
const solarColdLoadAttempts = Number(process.env.SPACEVIEWER_SOLAR_COLD_LOADS ?? 3);
const solarMobileColdLoadAttempts = Number(process.env.SPACEVIEWER_SOLAR_MOBILE_COLD_LOADS ?? 2);
const setSelectValue = (locator, value) => locator.evaluate((select, nextValue) => {
  select.value = nextValue;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}, value);
const defaultChromePaths = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];

const rendererBudgetExpectations = {
  solar: {
    low: {
      starBudget: 8_000,
      backgroundStarBudget: 420,
      sunSegments: 28,
      planetSegments: 24,
      moonSegments: 16,
      atmosphereSegments: 18,
      atmosphereLutWidth: 32,
      atmosphereLutHeight: 16,
      planetOrbitSamples: 64,
      moonOrbitSamples: 48,
      orbitTrailSamples: 24,
      asteroidBudget: 700,
      shadowMapSize: 256,
      eclipseShadows: false,
      ringShadows: false,
    },
    high: {
      starBudget: 70_000,
      backgroundStarBudget: 1_200,
      sunSegments: 56,
      planetSegments: 48,
      moonSegments: 32,
      atmosphereSegments: 40,
      atmosphereLutWidth: 96,
      atmosphereLutHeight: 48,
      planetOrbitSamples: 144,
      moonOrbitSamples: 96,
      orbitTrailSamples: 48,
      asteroidBudget: 3_500,
      shadowMapSize: 1_024,
      eclipseShadows: true,
      ringShadows: true,
    },
  },
  skymap: {
    low: {
      starBudget: 8_000,
      labelBudget: 8,
      backgroundStarBudget: 420,
      skyMeshSegments: 20,
      galaxyPointBudget: 1_200,
      desiLightconePointBlocks: 20,
    },
    high: {
      starBudget: 70_000,
      labelBudget: 16,
      backgroundStarBudget: 1_200,
      skyMeshSegments: 36,
      galaxyPointBudget: 3_800,
      desiLightconePointBlocks: 48,
    },
  },
};
const chromePath =
  requestedChromePath && existsSync(requestedChromePath)
    ? requestedChromePath
    : defaultChromePaths.find((path) => existsSync(path));

const assertBackendHealth = async () => {
  const response = await fetch(`${apiBaseUrl}/api/health`);
  if (!response.ok) {
    throw new Error(`Backend health check failed with ${response.status}`);
  }
  const payload = await response.json();
  if (payload?.status !== "ok" || payload?.success !== true) {
    throw new Error(`Backend health payload was not ok: ${JSON.stringify(payload)}`);
  }
  const searchCache = payload?.diagnostics?.nasa?.cache?.search;
  const assetCache = payload?.diagnostics?.nasa?.cache?.asset;
  if (typeof searchCache?.entries !== "number" || typeof assetCache?.entries !== "number") {
    throw new Error(`Backend health did not include NASA cache diagnostics: ${JSON.stringify(payload)}`);
  }
  const mastDiagnostics = payload?.diagnostics?.mast;
  const ps1Diagnostics = payload?.diagnostics?.ps1;
  if (
    typeof mastDiagnostics?.timeoutMs !== "number" ||
    typeof mastDiagnostics?.endpoint !== "string" ||
    typeof ps1Diagnostics?.timeoutMs !== "number" ||
    typeof ps1Diagnostics?.endpoint?.filenames !== "string"
  ) {
    throw new Error(`Backend health did not include external source timeout diagnostics: ${JSON.stringify(payload)}`);
  }
  if (!Array.isArray(payload.sources) || payload.sources.length < 3) {
    throw new Error(`Backend health did not include expected source diagnostics: ${JSON.stringify(payload.sources)}`);
  }
  console.log(`✓ backend-health`);
};

const smokeImage = {
  id: "spaceviewer-smoke-target",
  nasaId: "spaceviewer-smoke-target",
  source: "local",
  title: "Smoke Test Nebula",
  description: "Local smoke-test observation used to verify Gallery and Viewer without external image search.",
  keywords: ["smoke", "nebula", "verification"],
  date: "2026-06-29",
  center: "SpaceViewer QA",
  mission: "Local Fixture",
  instrument: "Synthetic Camera",
  archiveId: "spaceviewer-smoke-target",
  sourceUrl: "https://example.test/spaceviewer-smoke-target",
  matchReason: "Local smoke fixture verifies normalized metadata quality and Viewer provenance.",
  dimensions: { width: 1200, height: 800, unit: "pixels" },
  metadataQuality: {
    score: 92,
    label: "Rich",
    factors: ["title", "description", "preview asset", "date", "source URL", "mission or instrument", "dimensions"],
    missing: [],
  },
  imageUrl:
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 800'%3E%3Crect width='1200' height='800' fill='%23040a12'/%3E%3Ccircle cx='380' cy='360' r='190' fill='%2369e6ff' opacity='.36'/%3E%3Ccircle cx='590' cy='400' r='250' fill='%23b38cff' opacity='.26'/%3E%3Ccircle cx='740' cy='300' r='110' fill='%23ffb35c' opacity='.55'/%3E%3Ccircle cx='650' cy='380' r='16' fill='%23ffffff'/%3E%3C/svg%3E",
};

const companionImage = {
  ...smokeImage,
  id: "spaceviewer-smoke-companion",
  nasaId: "spaceviewer-smoke-companion",
  title: "Smoke Test Star Field",
  archiveId: "spaceviewer-smoke-companion",
  sourceUrl: "https://example.test/spaceviewer-smoke-companion",
  matchReason: "Local companion fixture verifies compare-set metadata persistence.",
  keywords: ["smoke", "stars", "verification"],
};

const seedStorageScript = ({ image, companion }) => {
  const now = new Date().toISOString();
  const collection = {
    id: "working",
    name: "Working collection",
    createdAt: now,
    updatedAt: now,
    items: [
      { key: `local:${image.id}`, savedAt: now, image },
      { key: `local:${companion.id}`, savedAt: now, image: companion },
    ],
  };

  window.localStorage.setItem("spaceviewer.reduceMotion", "true");
  window.localStorage.setItem("spaceviewer.solar.finalExperienceSeen.v1", "true");
  window.localStorage.setItem("spaceviewer.skymap.finalExperienceSeen.v1", "true");
  window.localStorage.setItem(`spaceviewer.viewerSnapshot.${image.id}`, JSON.stringify(image));
  window.localStorage.setItem("spaceviewer.workingCollection", JSON.stringify(collection));
  window.localStorage.setItem(
    "spaceviewer.sessionMemory",
    JSON.stringify({
      searches: { nebula: 2, JWST: 1 },
      viewedCategories: { "Local Fixture": 2 },
      savedTypes: {},
      viewedImages: [
        {
          id: image.id,
          nasaId: image.nasaId,
          source: image.source,
          title: image.title,
          imageUrl: image.imageUrl,
          thumbnailUrl: image.thumbnailUrl,
          keywords: image.keywords,
          date: image.date,
          mission: image.mission,
          instrument: image.instrument,
          center: image.center,
          viewedAt: now,
        },
      ],
    }),
  );
};

const resetSolarPanelStorageScript = () => {
  window.localStorage.removeItem("spaceviewer.solar.panelVisibility.v1");
  window.localStorage.removeItem("spaceviewer.solar.panelDockCollapsed.v1");
};

const waitForVisibleCanvas = async (page, selector, label) => {
  const canvas = page.locator(selector).first();
  await canvas.waitFor({ state: "attached", timeout: 30000 });
  const metrics = await page.waitForFunction(
    (canvasSelector) => {
      const candidates = Array.from(document.querySelectorAll(canvasSelector));
      const match = candidates
        .map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            clientWidth: node.clientWidth,
            clientHeight: node.clientHeight,
            width: node.width,
            height: node.height,
            rectWidth: rect.width,
            rectHeight: rect.height,
          };
        })
        .find((item) => item.width > 0 && item.height > 0 && item.rectWidth > 0 && item.rectHeight > 0);
      return match ?? null;
    },
    selector,
    { timeout: 30000 },
  );
  const value = await metrics.jsonValue();
  if (!value || value.width <= 0 || value.height <= 0 || value.rectWidth <= 0 || value.rectHeight <= 0) {
    throw new Error(`${label} canvas has invalid dimensions: ${JSON.stringify(value)}`);
  }
  return value;
};

const failOnRuntimeIssues = (issues, scope) => {
  const failures = issues.filter((issue) => issue.type !== "warning");
  if (failures.length) {
    throw new Error(`${scope} produced runtime issues:\n${JSON.stringify(failures, null, 2)}`);
  }
};

const createPage = async (context, name) => {
  const page = await context.newPage();
  await page.addInitScript(() => performance.setResourceTimingBufferSize(2_000));
  const issues = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      issues.push({ type: message.type(), text: message.text() });
    }
  });
  page.on("pageerror", (error) => {
    issues.push({ type: "pageerror", text: error.message });
  });
  page.on("requestfailed", (request) => {
    const failure = request.failure();
    if (failure?.errorText === "net::ERR_ABORTED") return;
    issues.push({
      type: "requestfailed",
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      failure: failure?.errorText ?? "unknown",
    });
  });
  return { page, issues, name };
};

const maybeScreenshot = async (page, name) => {
  if (!screenshotDir) return;
  await page.screenshot({ path: `${screenshotDir}/${name}.png`, fullPage: true });
};

const assertNoHorizontalOverflow = async (page, label) => {
  const metrics = await page.evaluate(() => {
    const clientWidth = document.documentElement.clientWidth;
    const scrollWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    return { clientWidth, scrollWidth, overflow: scrollWidth - clientWidth };
  });
  if (metrics.overflow > 2) {
    throw new Error(`${label} overflowed horizontally: ${JSON.stringify(metrics)}`);
  }
};

const assertNoViewportOverlap = async (page, selectorA, selectorB, label) => {
  const metrics = await page.evaluate(
    ([firstSelector, secondSelector]) => {
      const first = document.querySelector(firstSelector);
      const second = document.querySelector(secondSelector);
      if (!first || !second) return null;
      const firstBox = first.getBoundingClientRect();
      const secondBox = second.getBoundingClientRect();
      const xOverlap = Math.max(0, Math.min(firstBox.right, secondBox.right) - Math.max(firstBox.left, secondBox.left));
      const yOverlap = Math.max(0, Math.min(firstBox.bottom, secondBox.bottom) - Math.max(firstBox.top, secondBox.top));
      return {
        first: {
          x: Math.round(firstBox.x),
          y: Math.round(firstBox.y),
          width: Math.round(firstBox.width),
          height: Math.round(firstBox.height),
        },
        second: {
          x: Math.round(secondBox.x),
          y: Math.round(secondBox.y),
          width: Math.round(secondBox.width),
          height: Math.round(secondBox.height),
        },
        xOverlap: Math.round(xOverlap),
        yOverlap: Math.round(yOverlap),
      };
    },
    [selectorA, selectorB],
  );
  if (!metrics) {
    throw new Error(`${label} could not find overlap targets ${selectorA} and ${selectorB}`);
  }
  if (metrics.xOverlap > 2 && metrics.yOverlap > 2) {
    throw new Error(`${label} overlapped: ${JSON.stringify(metrics)}`);
  }
};

const assertSkyMapLabelLayout = async (page, label, maxLabels = 12) => {
  await page.waitForTimeout(240);
  const boxes = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".skymap-star-label, .skymap-celestial-label"))
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          id: node.getAttribute("data-label-object-id") ?? node.getAttribute("data-object-label") ?? node.textContent?.trim() ?? "unknown",
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        };
      })
      .filter((box) => box.width > 0 && box.height > 0),
  );
  if (boxes.length > maxLabels) {
    throw new Error(`${label} exceeded the label budget: ${boxes.length}/${maxLabels}`);
  }
  for (let firstIndex = 0; firstIndex < boxes.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < boxes.length; secondIndex += 1) {
      const first = boxes[firstIndex];
      const second = boxes[secondIndex];
      const xOverlap = Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left));
      const yOverlap = Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
      if (xOverlap > 1 && yOverlap > 1) {
        throw new Error(`${label} overlapped ${first.id} and ${second.id}: ${JSON.stringify({ xOverlap, yOverlap })}`);
      }
    }
  }
};

const assertRendererBudgets = async (page, surface, tier) => {
  const expected = rendererBudgetExpectations[surface]?.[tier];
  if (!expected) throw new Error(`Missing renderer budget fixture for ${surface}/${tier}`);
  await page.waitForFunction(
    ({ targetSurface, targetTier }) =>
      window.__SPACEVIEWER_PERF__?.[targetSurface]?.diagnostics?.qualityTier === targetTier,
    { targetSurface: surface, targetTier: tier },
    { timeout: 10000 },
  );
  const diagnostics = await page.evaluate((targetSurface) => window.__SPACEVIEWER_PERF__?.[targetSurface]?.diagnostics, surface);
  Object.entries(expected).forEach(([key, value]) => {
    if (diagnostics?.[key] !== value) {
      throw new Error(`${surface}/${tier} renderer budget ${key} was ${diagnostics?.[key]}, expected ${value}`);
    }
  });
};

const readWebGLDiagnostics = async (page, label) =>
  page.evaluate((diagnosticLabel) => {
    const canvases = [...document.querySelectorAll(`[data-spaceviewer-webgl="${diagnosticLabel}"]`)];
    const canvasCount = canvases.length;
    const canvasDepthBufferStrategy = canvases[0]?.getAttribute("data-spaceviewer-depth-strategy") ?? null;
    const entry = window.__SPACEVIEWER_WEBGL__?.[diagnosticLabel] ?? null;
    return entry ? { ...entry, canvasCount, canvasDepthBufferStrategy } : { canvasCount, canvasDepthBufferStrategy };
  }, label);

const assertWebGLDiagnostics = async (page, label, expected) => {
  await page.waitForFunction(
    ({ diagnosticLabel, canvasCount, mounted, minUnmounts }) => {
      const currentCanvasCount = document.querySelectorAll(
        `[data-spaceviewer-webgl="${diagnosticLabel}"]`,
      ).length;
      const entry = window.__SPACEVIEWER_WEBGL__?.[diagnosticLabel];
      return (
        currentCanvasCount === canvasCount &&
        (mounted === undefined || entry?.mounted === mounted) &&
        (minUnmounts === undefined || (entry?.unmounts ?? 0) >= minUnmounts)
      );
    },
    {
      diagnosticLabel: label,
      canvasCount: expected.canvasCount,
      mounted: expected.mounted,
      minUnmounts: expected.minUnmounts,
    },
    { timeout: 10000 },
  );
  const diagnostics = await readWebGLDiagnostics(page, label);
  if (expected.mounted !== undefined && diagnostics.mounted !== expected.mounted) {
    throw new Error(`${label} mounted state mismatch: ${JSON.stringify(diagnostics)}`);
  }
  if ((diagnostics.contextLost ?? 0) > (expected.maxContextLost ?? 0)) {
    throw new Error(`${label} context loss exceeded limit: ${JSON.stringify(diagnostics)}`);
  }
  if (expected.minUnmounts !== undefined && (diagnostics.unmounts ?? 0) < expected.minUnmounts) {
    throw new Error(`${label} unmount count too low: ${JSON.stringify(diagnostics)}`);
  }
  if (expected.mounted === true) {
    const validDepthStrategies = new Set(["reverse-z", "standard"]);
    if (!validDepthStrategies.has(diagnostics.depthBufferStrategy)) {
      throw new Error(`${label} did not report a valid active depth strategy: ${JSON.stringify(diagnostics)}`);
    }
    if (diagnostics.canvasDepthBufferStrategy !== diagnostics.depthBufferStrategy) {
      throw new Error(`${label} canvas/diagnostic depth strategy mismatch: ${JSON.stringify(diagnostics)}`);
    }
  }
};

const assertSolarTextureHealth = async (page, label) => {
  const textureDiagnostics = await page.waitForFunction(
    () => {
      const entry = window.__SPACEVIEWER_SOLAR_TEXTURES__;
      if (!entry || entry.requested <= 0 || entry.loaded + entry.failed < entry.requested) return null;
      return entry;
    },
    null,
    { timeout: 15000 },
  );
  const textureDiagnosticValue = await textureDiagnostics.jsonValue();
  if (textureDiagnosticValue.failed !== 0) {
    throw new Error(`${label} texture diagnostics reported failures: ${JSON.stringify(textureDiagnosticValue)}`);
  }
  return textureDiagnosticValue;
};

const assertNoHighDetailSolarTextureRequests = async (page, label) => {
  const highTextureRequests = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((url) => url.includes("/solar-textures/high/")),
  );
  if (highTextureRequests.length) {
    throw new Error(`${label} requested high-detail boot textures: ${JSON.stringify(highTextureRequests)}`);
  }
};

const assertSolarBootTextureBudget = async (page, label, maxPlanetSurfaces = 3) => {
  await page.waitForTimeout(1200);
  const planetSurfaceTokens = [
    "2k_mercury.jpg",
    "2k_venus_surface.jpg",
    "2k_earth_daymap.jpg",
    "2k_mars.jpg",
    "2k_jupiter.jpg",
    "2k_saturn.jpg",
    "2k_uranus.jpg",
    "2k_neptune.jpg",
    "2k_pluto.jpg",
  ];
  const requestedPlanetSurfaces = await page.evaluate((tokens) => {
    const urls = performance.getEntriesByType("resource").map((entry) => entry.name);
    return Array.from(new Set(urls.filter((url) => tokens.some((token) => url.includes(token)))));
  }, planetSurfaceTokens);
  if (requestedPlanetSurfaces.length > maxPlanetSurfaces) {
    throw new Error(
      `${label} exceeded the boot planet-surface budget: ${requestedPlanetSurfaces.length}/${maxPlanetSurfaces} ${JSON.stringify(requestedPlanetSurfaces)}`,
    );
  }
  return requestedPlanetSurfaces;
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const openFind = async (page) => {
  await page.getByRole("button", { name: "Find anything" }).first().click();
  return page.getByRole("combobox", { name: "Find a place, photograph, moment or tool" });
};

const runCommand = async (page, query, exactLabel) => {
  const input = await openFind(page);
  await input.fill(query);
  await page
    .locator(".sv-find__item strong")
    .filter({ hasText: new RegExp(`^${escapeRegExp(exactLabel)}$`) })
    .first()
    .click();
};

const runRankedCommandWithEnter = async (page, query, exactLabel) => {
  const input = await openFind(page);
  await input.fill(query);
  const selected = page.locator('.sv-find__item[aria-selected="true"]');
  await selected.locator("strong", { hasText: new RegExp(`^${escapeRegExp(exactLabel)}$`) }).waitFor({
    state: "visible",
  });
  await input.press("Enter");
};

const checks = [
  {
    name: "explore",
    run: async (page) => {
      // /explore is the universe: a lit Earth, labels projected from 3-D positions, search that flies.
      await page.goto(`${baseUrl}/explore`, { waitUntil: "domcontentloaded" });
      await page.locator(".ex-viewport canvas").waitFor({ state: "visible", timeout: 30000 });
      await page.waitForFunction(() => [...document.querySelectorAll(".ex-label")].some((el) => el.style.display !== "none" && el.textContent === "Earth"), null, { timeout: 30000 });
      const search = page.getByRole("combobox").locator("input");
      await search.fill("m31");
      await page.locator(".ex-search__hit", { hasText: "Andromeda Galaxy" }).first().waitFor({ state: "visible" });
      await search.fill("Saturn");
      await page.locator(".ex-search__hit", { hasText: "Saturn" }).first().waitFor({ state: "visible" });
      await search.press("Enter");
      await page.locator(".ex-panel h2", { hasText: "Saturn" }).waitFor({ state: "visible", timeout: 15000 });
      await page.waitForURL(/\/explore\/saturn/, { timeout: 15000 });
      await page.locator(".ex-flight").waitFor({ state: "detached", timeout: 15000 });
      await page.locator(".ex-routes button", { hasText: "Titan" }).click();
      await page.locator(".ex-panel h2", { hasText: "Titan" }).waitFor({ state: "visible", timeout: 15000 });
      await page.goBack();
      await page.locator(".ex-panel h2", { hasText: "Saturn" }).waitFor({ state: "visible", timeout: 15000 });
      const canvasHasContent = await page.evaluate(() => {
        const canvas = document.querySelector(".ex-viewport canvas");
        return Boolean(canvas && canvas.width > 0 && canvas.height > 0);
      });
      if (!canvasHasContent) throw new Error("Explorer canvas has no drawing buffer");
    },
  },
  {
    name: "explore-observation-link",
    run: async (page) => {
      await page.goto(`${baseUrl}/explore/andromeda-galaxy?t=2031-05-05T12:00:00Z&paused=1&cam=2.0e19,0.2,0.3,0.93`, { waitUntil: "domcontentloaded" });
      await page.locator(".ex-panel h2", { hasText: "Andromeda Galaxy" }).waitFor({ state: "visible", timeout: 40000 });
      await page.locator(".ex-time__summary", { hasText: "5 May 2031" }).waitFor({ state: "visible" });
      await page.locator(".ex-time__summary", { hasText: "Paused" }).waitFor({ state: "visible" });
      await page.goto(`${baseUrl}/skymap?object=${encodeURIComponent("solar:planet:jupiter")}`, { waitUntil: "domcontentloaded" });
      await page.locator(".ex-panel h2", { hasText: "Jupiter" }).waitFor({ state: "visible", timeout: 30000 });
    },
  },
  {
    name: "home",
    run: async (page) => {
      // Images home: one search over three archives, with places you can fly to.
      await page.goto(`${baseUrl}/archive`, { waitUntil: "domcontentloaded" });
      await page.locator(".im-home").waitFor({ state: "visible", timeout: 30000 });
      if (!page.url().endsWith("/images")) throw new Error(`/archive did not resolve to /images: ${page.url()}`);
      const bar = page.locator(".sv-bar");
      for (const label of ["Universe", "Images", "Your sky", "Tools"]) {
        await bar.getByRole("button", { name: new RegExp(`^${label}`) }).first().waitFor({ state: "visible" });
      }
      await page.getByRole("button", { name: "Find anything" }).waitFor({ state: "visible" });
      const homeSearch = page.getByLabel("Search missions, targets, or objects");
      await homeSearch.fill("and");
      const modeJumpGroup = page.locator(".search-bar__suggestions-group", { hasText: "Mode jumps" });
      await modeJumpGroup.locator(".search-bar__suggestion-item", { hasText: "Fly to Andromeda Galaxy" }).waitFor({ state: "visible" });
      await page.locator(".search-bar__suggestions-group", { hasText: "Search source" }).waitFor({ state: "visible" });
      await homeSearch.press("ArrowDown");
      await page.locator(".search-bar__suggestion-item.active", { hasText: "Fly to Andromeda Galaxy" }).waitFor({ state: "visible" });
      await homeSearch.press("Enter");
      await page.locator(".ex-root").waitFor({ state: "visible", timeout: 30000 });
      await page.locator(".ex-panel h2", { hasText: "Andromeda Galaxy" }).waitFor({ state: "visible", timeout: 30000 });
      await page.locator(".ex-telescopes").waitFor({ state: "visible" });
      // Your sky replaces "For You": recommendations, history and saved photographs, persisted.
      await page.goto(`${baseUrl}/saved`, { waitUntil: "domcontentloaded" });
      await page.locator(".ys-page").waitFor({ state: "visible", timeout: 30000 });
      await page.locator(".ys-section", { hasText: "Recently looked at" }).locator("strong", { hasText: "Smoke Test Nebula" }).waitFor({ state: "visible" });
      await page.locator(".ys-section", { hasText: "Next for you" }).locator("strong", { hasText: "star forming nebula" }).waitFor({ state: "visible" });
      await page.locator(".ys-section", { hasText: "Saved photographs" }).waitFor({ state: "visible" });
      await page.locator(".ys-section", { hasText: "Places you've visited" }).locator("strong", { hasText: "Andromeda Galaxy" }).waitFor({ state: "visible" });
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.locator(".ys-section", { hasText: "Saved photographs" }).waitFor({ state: "visible", timeout: 30000 });
    },
  },
  {
    name: "gallery",
    run: async (page) => {
      await page.goto(`${baseUrl}/images`, { waitUntil: "domcontentloaded" });
      await page.locator(".im-home").waitFor({ state: "visible", timeout: 30000 });
      const input = await openFind(page);
      await input.fill("saved photographs");
      await page.locator(".sv-find__item strong").filter({ hasText: /^Saved photographs$/ }).first().click();
      await page.locator(".rs").waitFor({ state: "visible", timeout: 30000 });
      await page.locator(".rs-head h1", { hasText: "Your saved photographs" }).waitFor({ state: "visible" });
      if (!page.url().includes("/images?saved=1")) throw new Error(`Saved collection is not addressable: ${page.url()}`);
      await page.locator(".result-card").first().waitFor({ state: "visible" });
      await page.locator(".results__view-mode").getByRole("button", { name: "List" }).click();
      const firstCard = page.locator(".result-card").first();
      for (const text of ["Local smoke fixture", "spaceviewer-smoke-target", "example.test", "1200 x 800 px", "Rich · 92/100"]) {
        await firstCard.locator(".result-card__provenance", { hasText: text }).waitFor({ state: "visible" });
      }
      await page.getByRole("button", { name: /Timeline & sources/ }).click();
      const researchBrief = page.locator(".results__research-brief");
      await researchBrief.waitFor({ state: "visible" });
      await researchBrief.locator("div", { hasText: "2 cleaned" }).first().waitFor({ state: "visible" });
      await researchBrief.locator("div", { hasText: "Local collection" }).first().waitFor({ state: "visible" });
      await researchBrief.locator("div", { hasText: "Rich 2" }).first().waitFor({ state: "visible" });
      await researchBrief.locator("div", { hasText: "None selected" }).first().waitFor({ state: "visible" });
      const collectionTray = page.locator(".results__collection-tray", { hasText: "WORKING COLLECTION" });
      await collectionTray.locator(".results__collection-stats", { hasText: "2 visible now" }).waitFor({ state: "visible" });
      await collectionTray.locator(".results__collection-tags", { hasText: "Newest" }).first().waitFor({ state: "visible" });
      await page.locator(".results__dropdown").first().waitFor({ state: "visible" });
      await page.getByLabel("Find in results").fill("Nebula");
      await page.locator(".results__active-filters", { hasText: "Nebula" }).waitFor({ state: "visible" });
      await researchBrief.locator("div", { hasText: "1/1" }).first().waitFor({ state: "visible" });
      await page.getByRole("button", { name: "Clear query filter Nebula" }).click();
      await page.locator(".results__active-filters").waitFor({ state: "detached" });
      await page.getByRole("button", { name: "Compare visible" }).click();
      await researchBrief.locator("div", { hasText: "2/4 ready" }).first().waitFor({ state: "visible" });
      await page.locator(".rs-compare", { hasText: "2/4" }).waitFor({ state: "visible" });
      await page.getByRole("button", { name: "Compare side by side" }).click();
      await page.locator(".vw").waitFor({ state: "visible", timeout: 30000 });
      await page.locator(".viewer__compare-set", { hasText: "1/2 candidates" }).waitFor({ state: "visible" });
      await page.getByRole("button", { name: /Next comparison image/ }).click();
      await page.locator(".viewer__compare-set", { hasText: "Smoke Test Star Field" }).waitFor({ state: "visible" });
      await page.keyboard.press("p");
      await page.locator(".viewer__compare-set", { hasText: "Smoke Test Nebula" }).waitFor({ state: "visible" });
      await page.keyboard.press("n");
      await page.locator(".viewer__compare-set", { hasText: "Smoke Test Star Field" }).waitFor({ state: "visible" });
      // Back returns to the same gallery address.
      await page.goBack();
      await page.locator(".rs-head h1", { hasText: "Your saved photographs" }).waitFor({ state: "visible", timeout: 30000 });
    },
  },
  {
    name: "viewer",
    run: async (page) => {
      await page.goto(`${baseUrl}/viewer/${encodeURIComponent(smokeImage.id)}`, { waitUntil: "domcontentloaded" });
      await page.locator(".vw").waitFor({ state: "visible", timeout: 30000 });
      await page.locator(".vw-title", { hasText: "Smoke Test Nebula" }).waitFor({ state: "visible" });
      await page.locator(".viewer__image-stage img").waitFor({ state: "visible" });
      await page.getByRole("button", { name: /^Saved$/ }).waitFor({ state: "visible" });
      await page.locator(".vw-tool summary", { hasText: "Adjust the image" }).click();
      await page.locator(".viewer__fit-modes").waitFor({ state: "visible" });
      const viewerStateRail = page.locator(".viewer__state-rail", { hasText: "VIEW STATE" });
      await viewerStateRail.waitFor({ state: "visible" });
      await viewerStateRail.locator(".viewer__state-chip", { hasText: "Preview only" }).waitFor({ state: "visible" });
      await page.locator(".vw-tool summary", { hasText: "Exposure" }).click();
      await page.locator(".viewer__histogram-bar").first().waitFor({ state: "visible" });
      await page.locator(".info-panel").waitFor({ state: "visible" });
      await page.locator(".info-panel .status-chip", { hasText: /^LOCAL$/ }).waitFor({ state: "visible" });
      await page.locator(".info-panel .status-chip", { hasText: /^Local Fixture$/ }).waitFor({ state: "visible" });
      await page.locator(".info-panel__explanation", { hasText: "Deterministic metadata summary" }).waitFor({ state: "visible" });
      await page.locator(".info-panel__explanation", { hasText: "No remote model call" }).waitFor({ state: "visible" });
      await page.getByRole("tab", { name: "Provenance" }).click();
      await page.locator(".info-panel__provenance", { hasText: "Rich · 92/100" }).waitFor({ state: "visible" });
      await page.keyboard.press("Shift+/");
      await page.locator(".viewer-help", { hasText: "Workflow" }).waitFor({ state: "visible" });
      await page.keyboard.press("Escape");
      await page.locator(".viewer-help").waitFor({ state: "detached" });
      await page.keyboard.press("=");
      await page.locator(".zoom-indicator", { hasText: "125%" }).waitFor({ state: "visible" });
      await page.keyboard.press("0");
      await page.locator(".zoom-indicator", { hasText: "100%" }).waitFor({ state: "visible" });
      await page.getByRole("button", { name: "Deep" }).click();
      await viewerStateRail.locator(".viewer__state-chip", { hasText: "B 112 C 118 S 130" }).waitFor({ state: "visible" });
      await page.getByRole("button", { name: "Reset filter adjustments" }).click();
      await viewerStateRail.locator(".viewer__state-chip", { hasText: "Natural" }).waitFor({ state: "visible" });
      await page.keyboard.press("a");
      await page.locator(".viewer-annotations__hint", { hasText: "Click the image to place a note" }).waitFor({ state: "visible" });
      await page.keyboard.press("Escape");
      await page.locator(".viewer-annotations__hint").waitFor({ state: "detached" });
    },
  },
  {
    name: "photo-to-place",
    run: async (page) => {
      // A photograph knows the place it shows, tells how old its light is, and flies there; Back returns.
      const carina = {
        ...smokeImage,
        id: "smoke-carina",
        nasaId: "smoke-carina",
        title: "Webb's Cosmic Cliffs in the Carina Nebula",
        keywords: ["Carina Nebula", "JWST"],
      };
      await page.addInitScript((image) => window.localStorage.setItem(`spaceviewer.viewerSnapshot.${image.id}`, JSON.stringify(image)), carina);
      await page.goto(`${baseUrl}/viewer/${carina.id}`, { waitUntil: "domcontentloaded" });
      const place = page.locator(".vw-place");
      await place.locator("h2", { hasText: "Carina Nebula" }).waitFor({ state: "visible", timeout: 30000 });
      await place.locator(".vw-place__light", { hasText: "8,500 years ago" }).waitFor({ state: "visible" });
      await place.getByRole("button", { name: "Fly to Carina Nebula" }).click();
      await page.locator(".ex-panel h2", { hasText: "Carina Nebula" }).waitFor({ state: "visible", timeout: 30000 });
      await page.locator(".ex-lightstory", { hasText: "years ago" }).waitFor({ state: "visible" });
      await page.goBack();
      await page.locator(".vw-title", { hasText: "Cosmic Cliffs" }).waitFor({ state: "visible", timeout: 30000 });
    },
  },
  {
    name: "moments",
    run: async (page) => {
      await page.goto(`${baseUrl}/explore?moment=mars-2003`, { waitUntil: "domcontentloaded" });
      const card = page.locator(".ex-moment");
      await card.locator("h2", { hasText: "Mars at its closest" }).waitFor({ state: "visible", timeout: 45000 });
      await page.locator(".ex-time__summary", { hasText: "2003" }).first().waitFor({ state: "visible" });
      await page.locator(".ex-facts", { hasText: "Distance from Earth" }).waitFor({ state: "visible" });
      const facts = await page.locator(".ex-facts").innerText();
      const match = facts.match(/([\d.]+) million km/);
      if (!match || Math.abs(Number(match[1]) - 55.76) > 0.3) throw new Error(`Mars 2003 distance looks wrong: ${facts}`);
      await card.getByRole("button", { name: "Back to today" }).click();
      await page.locator(".ex-moment").waitFor({ state: "detached" });
      await page.locator(".ex-time__summary", { hasText: "Live" }).first().waitFor({ state: "visible", timeout: 15000 });
    },
  },
  {
    name: "landing",
    run: async (page) => {
      // The homepage is the front door; the universe lives at /explore and old links still open it.
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await page.locator(".hp-hero h1", { hasText: "The universe" }).waitFor({ state: "visible", timeout: 30000 });
      await assertNoHorizontalOverflow(page, "homepage");
      await page.locator(".hp-places button", { hasText: "Saturn" }).click();
      await page.locator(".ex-panel h2", { hasText: "Saturn" }).waitFor({ state: "visible", timeout: 30000 });
      await page.goBack();
      await page.locator(".hp-hero h1").waitFor({ state: "visible", timeout: 30000 });
      await page.getByRole("button", { name: /Enter the universe/ }).click();
      await page.waitForURL(/\/explore/);
      await page.locator(".ex-viewport canvas").waitFor({ state: "visible", timeout: 30000 });
      await page.locator(".sv-bar .sv-brand").click();
      await page.locator(".hp-hero h1").waitFor({ state: "visible", timeout: 30000 });
      await page.goto(`${baseUrl}/?object=${encodeURIComponent("solar:planet:mars")}`, { waitUntil: "domcontentloaded" });
      await page.locator(".ex-panel h2", { hasText: "Mars" }).waitFor({ state: "visible", timeout: 30000 });
      await page.goto(`${baseUrl}/no-such-page`, { waitUntil: "domcontentloaded" });
      await page.locator(".hp-hero h1").waitFor({ state: "visible", timeout: 30000 });
    },
  },
  {
    name: "live",
    run: async (page) => {
      // Live: the official NASA stream embeds through the player API, science feeds play, Back steps
      // between feeds, and the Images page links in.
      await page.goto(`${baseUrl}/live`, { waitUntil: "domcontentloaded" });
      await page.locator(".lv-info h2", { hasText: "Earth from the Space Station" }).waitFor({ state: "visible", timeout: 30000 });
      await page.locator(".lv-player__frame iframe[src*='youtube-nocookie.com/embed/']").waitFor({ state: "attached", timeout: 30000 });
      await page.locator(".lv-item", { hasText: "The Sun's corona" }).click();
      await page.waitForURL(`${baseUrl}/live?feed=sdo-193`);
      await page.locator(".lv-player video[src*='sdo.gsfc.nasa.gov']").waitFor({ state: "attached" });
      await page.locator(".lv-info").getByRole("button", { name: "Fly to the Sun" }).waitFor({ state: "visible" });
      await page.goBack();
      await page.locator(".lv-info h2", { hasText: "Earth from the Space Station" }).waitFor({ state: "visible" });
      await page.goto(`${baseUrl}/images`, { waitUntil: "domcontentloaded" });
      await page.locator(".im-livenow__tile", { hasText: "Earth in 4K" }).click();
      await page.waitForURL(`${baseUrl}/live?feed=sen-4k`);
      await page.locator(".lv-info h2", { hasText: "Earth in 4K" }).waitFor({ state: "visible" });
    },
  },
  {
    name: "save-and-share",
    run: async (page) => {
      await page.goto(`${baseUrl}/explore/saturn`, { waitUntil: "domcontentloaded" });
      await page.locator(".ex-panel h2", { hasText: "Saturn" }).waitFor({ state: "visible", timeout: 30000 });
      await page.waitForTimeout(1500);
      await page.getByRole("button", { name: "Save this view to Your sky" }).click();
      await page.locator(".ex-toast", { hasText: "Saved to Your sky" }).waitFor({ state: "visible" });
      await page.locator(".sv-bar").getByRole("button", { name: "Share this view" }).click();
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 15000 }),
        page.getByRole("menuitem", { name: /Download postcard/ }).click(),
      ]);
      if (!download.suggestedFilename().endsWith(".png")) throw new Error(`Postcard was not a PNG: ${download.suggestedFilename()}`);
      await page.locator(".sv-bar").getByRole("button", { name: /^Your sky/ }).click();
      const saved = page.locator(".ys-views .ys-view", { hasText: "Saturn" }).first();
      await saved.waitFor({ state: "visible", timeout: 15000 });
      await saved.click();
      await page.locator(".ex-panel h2", { hasText: "Saturn" }).waitFor({ state: "visible", timeout: 30000 });
      if (!/cam=/.test(page.url())) throw new Error(`Saved view did not restore an exact camera: ${page.url()}`);
    },
  },
  {
    name: "solar",
    run: async (page) => {
      await page.goto(`${baseUrl}/solar`, { waitUntil: "domcontentloaded" });
      await page.locator(".solar-page").waitFor({ state: "visible", timeout: 30000 });
      await page.locator(".sv-bar .sv-brand").waitFor({ state: "visible" });
      await waitForVisibleCanvas(page, ".solar-page canvas", "Solar Explorer");
      await page.locator('.solar-panel-dock__ephemeris[data-ephemeris-status="ready"]', { hasText: "VSOP87C" }).waitFor({
        state: "attached",
        timeout: 10000,
      });
      const qualitySelect = page.locator("#astro-quality-tier");
      await qualitySelect.waitFor({ state: "attached" });
      await setSelectValue(qualitySelect, "low");
      await page.locator(".cosmic-journey__quality-status", { hasText: "Manual override · Low / mobile" }).waitFor({
        state: "attached",
      });
      await assertRendererBudgets(page, "solar", "low");
      await setSelectValue(qualitySelect, "high");
      await page.locator(".cosmic-journey__quality-status", { hasText: "Manual override · High" }).waitFor({
        state: "attached",
      });
      await assertRendererBudgets(page, "solar", "high");
      const panelDock = page.locator(".solar-panel-dock", { hasText: "Panels" });
      await panelDock.waitFor({ state: "visible" });
      await page.locator(".solar-event-rail").waitFor({ state: "detached" });
      await panelDock.getByRole("button", { name: "Events" }).click();
      await page.locator(".solar-event-rail").waitFor({ state: "visible" });
      await panelDock.getByRole("button", { name: "Events" }).click();
      await page.locator(".solar-event-rail").waitFor({ state: "detached" });
      await page.locator(".solar-mission-control").waitFor({ state: "detached" });
      await panelDock.getByRole("button", { name: "Mission" }).click();
      await page.locator(".solar-mission-control", { hasText: "System overview" }).waitFor({ state: "visible" });
      await panelDock.getByRole("button", { name: "Scale" }).click();
      await page.locator(".solar-scale-legend", { hasText: "Scale model" }).waitFor({ state: "visible" });
      await panelDock.getByRole("button", { name: "Perf" }).click();
      await page.locator(".solar-perf-overlay", { hasText: "PERF" }).waitFor({ state: "visible" });
      await panelDock.getByRole("button", { name: "Hide all Solar panels" }).click();
      await page.locator(".solar-mission-control").waitFor({ state: "detached" });
      await page.locator(".solar-scale-legend").waitFor({ state: "detached" });
      await page.locator(".solar-perf-overlay").waitFor({ state: "detached" });
      await page.locator(".solar-timeline").waitFor({ state: "detached" });
      await page.locator(".solar-event-rail").waitFor({ state: "detached" });
      await page.locator(".solar-panel-dock__status", { hasText: "0/6" }).waitFor({ state: "visible" });
      await page.locator(".solar-panel-dock__status", { hasText: "Clean map" }).waitFor({ state: "visible" });
      await page.locator(".solar-panel-dock.is-collapsed").waitFor({ state: "visible" });
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.locator(".solar-page").waitFor({ state: "visible", timeout: 30000 });
      await waitForVisibleCanvas(page, ".solar-page canvas", "Solar Explorer persisted clean map");
      await page.locator(".solar-panel-dock__status", { hasText: "Clean map" }).waitFor({ state: "visible" });
      await page.locator(".solar-panel-dock.is-collapsed").waitFor({ state: "visible" });
      await page.locator(".solar-timeline").waitFor({ state: "detached" });
      await page.locator(".solar-event-rail").waitFor({ state: "detached" });
      if ((await qualitySelect.inputValue()) !== "high") {
        throw new Error("Manual quality override did not persist across reload");
      }
      await setSelectValue(qualitySelect, "auto");
      await page.locator(".cosmic-journey__quality-status", { hasText: /^Auto/ }).waitFor({ state: "attached" });
      await panelDock.getByRole("button", { name: "Expand Solar panel dock" }).click();
      await panelDock.getByRole("button", { name: "Show all Solar panels" }).click();
      await page.locator(".solar-timeline").waitFor({ state: "visible" });
      await page.locator(".solar-topbar").waitFor({ state: "visible" });
      await page.locator(".solar-scale-legend").waitFor({ state: "visible" });
      await page.locator(".solar-mission-control").waitFor({ state: "visible" });
      await page.locator(".solar-perf-overlay").waitFor({ state: "visible" });
      await assertNoViewportOverlap(page, ".sv-bar", ".solar-event-rail", "desktop solar all panels");
      await assertNoViewportOverlap(page, ".sv-bar", ".solar-topbar", "desktop solar all panels");
      await assertNoViewportOverlap(page, ".sv-bar", ".solar-perf-overlay", "desktop solar all panels");
      await assertNoViewportOverlap(page, ".solar-mission-control", ".solar-perf-overlay", "desktop solar all panels");
      await assertNoViewportOverlap(page, ".solar-mission-control", ".solar-timeline", "desktop solar all panels");
      await assertNoViewportOverlap(page, ".solar-perf-overlay", ".solar-timeline", "desktop solar all panels");
      await assertNoViewportOverlap(page, ".solar-panel-dock", ".solar-timeline", "desktop solar all panels");
      await page.locator(".solar-event-rail").getByRole("button", { name: /Jupiter Family/ }).click();
      await page.locator(".solar-panel--details h3", { hasText: "Jupiter" }).waitFor({ state: "visible" });
      await assertNoViewportOverlap(page, ".solar-panel--details", ".solar-mission-control", "desktop Solar dossier and mission control");
      await assertNoViewportOverlap(page, ".solar-panel--details", ".solar-panel-dock", "desktop Solar dossier and panel dock");
      await page.locator(".solar-mission-control__section--orbit", { hasText: "Orbit phase" }).waitFor({
        state: "visible",
      });
      await page.locator(".solar-mission-control__section--orbit", { hasText: "Perihelion" }).waitFor({
        state: "visible",
      });
      await page.locator(".solar-orbit-label", { hasText: "Current" }).first().waitFor({ state: "visible" });
      await page.locator(".solar-orbit-label", { hasText: "Trail" }).first().waitFor({ state: "visible" });
      await panelDock.getByRole("button", { name: "Restore default Solar panel layout" }).click();
      await page.locator(".solar-topbar").waitFor({ state: "visible" });
      await page.locator(".solar-timeline").waitFor({ state: "visible" });
      await page.locator(".solar-mission-control").waitFor({ state: "detached" });
      await page.locator(".solar-scale-legend").waitFor({ state: "detached" });
      await page.locator(".solar-perf-overlay").waitFor({ state: "detached" });
      await page.locator(".solar-event-rail").waitFor({ state: "detached" });
      await page.locator(".solar-panel-dock__status", { hasText: "2/6" }).waitFor({ state: "visible" });
      await page.locator(".solar-panel-dock__status", { hasText: "Default" }).waitFor({ state: "visible" });
      await page.keyboard.press("Escape");
      await page.locator(".solar-panel-dock.is-collapsed").waitFor({ state: "visible" });
      await page.locator(".solar-timeline").waitFor({ state: "detached" });
      await runCommand(page, "mars", "Mars");
      await page.locator(".solar-panel--details h3", { hasText: "Mars" }).waitFor({ state: "visible" });
      await page.locator(".solar-mission-control", { hasText: "Mars" }).waitFor({ state: "visible" });
      const marsOrientation = page.locator('[data-solar-orientation-body="mars"]');
      await marsOrientation.waitFor({ state: "visible" });
      await marsOrientation.locator("a", { hasText: "IAU WGCCRE 2015" }).waitFor({ state: "visible" });
      await marsOrientation.locator("dt", { hasText: "Prime meridian" }).waitFor({ state: "visible" });
      await page.waitForFunction(
        () =>
          window.__SPACEVIEWER_PERF__?.solar?.diagnostics?.orientationBody === "mars" &&
          window.__SPACEVIEWER_PERF__?.solar?.diagnostics?.orientationModel === "IAU WGCCRE 2015",
        null,
        { timeout: 10000 },
      );
      const initialMarsMeridian = await page.evaluate(
        () => window.__SPACEVIEWER_PERF__?.solar?.diagnostics?.orientationPrimeMeridianDeg,
      );
      await page.locator(".solar-panel-dock.is-collapsed").waitFor({ state: "detached" });
      await page.locator(".solar-panel-dock__status", { hasText: "2/6" }).waitFor({ state: "visible" });
      await panelDock.getByRole("button", { name: "Show all Solar panels" }).click();
      const solarTimeline = page.locator(".solar-timeline");
      await solarTimeline.waitFor({ state: "visible" });
      await page.locator(".solar-topbar").waitFor({ state: "visible" });
      const solarDirection = solarTimeline.getByRole("group", { name: "Playback direction" });
      await solarDirection.getByRole("button", { name: "Reverse" }).click();
      if ((await solarDirection.getByRole("button", { name: "Reverse" }).getAttribute("aria-pressed")) !== "true") {
        throw new Error("Solar reverse-time direction did not become active");
      }
      await solarTimeline.getByRole("button", { name: "100 d/s" }).click();
      const solarDateSlider = solarTimeline.getByLabel("Solar simulation date");
      const initialSolarDay = Number(await solarDateSlider.inputValue());
      await solarTimeline.getByRole("button", { name: "Play" }).click();
      await solarTimeline.locator(".solar-timeline__flow", { hasText: "Time reversing" }).waitFor({
        state: "visible",
      });
      await page.waitForFunction(
        (initialDay) => Number(document.querySelector('.solar-timeline input[aria-label="Solar simulation date"]')?.value) < initialDay,
        initialSolarDay,
        { timeout: 10000 },
      );
      await page.waitForFunction(
        (initialMeridian) =>
          window.__SPACEVIEWER_PERF__?.solar?.diagnostics?.orientationPrimeMeridianDeg !== initialMeridian,
        initialMarsMeridian,
        { timeout: 10000 },
      );
      await solarTimeline.getByRole("button", { name: "Pause" }).click();
      await page.waitForTimeout(150);
      const pausedMarsMeridian = await page.evaluate(
        () => window.__SPACEVIEWER_PERF__?.solar?.diagnostics?.orientationPrimeMeridianDeg,
      );
      await page.waitForTimeout(300);
      const frozenMarsMeridian = await page.evaluate(
        () => window.__SPACEVIEWER_PERF__?.solar?.diagnostics?.orientationPrimeMeridianDeg,
      );
      if (pausedMarsMeridian !== frozenMarsMeridian) {
        throw new Error(
          `Paused Solar orientation continued changing: before=${pausedMarsMeridian} after=${frozenMarsMeridian}`,
        );
      }
      await solarDirection.getByRole("button", { name: "Forward" }).click();
      await solarTimeline.getByRole("button", { name: "1 d/s" }).click();
      await page.getByRole("button", { name: "Controls" }).click();
      await page.locator(".solar-tools__menu").waitFor({ state: "visible" });
      const menuCount = await page.locator(".solar-select.select-menu").count();
      if (menuCount !== 4) throw new Error(`Expected 4 Solar menus, found ${menuCount}`);
      await page.locator("#solar-search").fill("mars");
      await page.keyboard.press("Escape");
      await page.locator(".solar-timeline").waitFor({ state: "visible" });
      if (await page.locator(".solar-panel-dock.is-collapsed").count()) {
        throw new Error("Solar search Escape collapsed the panel dock");
      }
      await page.getByRole("button", { name: "Controls" }).click();
      await page.locator(".solar-tools__menu").waitFor({ state: "detached" });
      await page.waitForFunction(() => Boolean(window.__SPACEVIEWER_PERF__?.solar), null, { timeout: 10000 });
      await assertSolarTextureHealth(page, "Solar");
    },
  },
  {
    name: "solar-true-au",
    run: async (page) => {
      await page.goto(`${baseUrl}/solar?object=overview&mode=ecliptic&scale=realistic`, { waitUntil: "domcontentloaded" });
      await page.locator(".solar-page").waitFor({ state: "visible", timeout: 30000 });
      await waitForVisibleCanvas(page, ".solar-page canvas", "Solar true-AU overview");
      const panelDock = page.locator(".solar-panel-dock", { hasText: "Panels" });
      if (!(await page.locator(".solar-scale-legend").count())) {
        const collapsedDock = panelDock.locator(".solar-panel-dock__expand");
        if (await collapsedDock.count()) await collapsedDock.click();
        await panelDock.getByRole("button", { name: "Scale" }).click();
      }
      const legend = page.locator(".solar-scale-legend", { hasText: "True AU spacing" });
      await legend.waitFor({ state: "visible" });
      await legend.locator("dd", { hasText: "30.0 visual units" }).waitFor({ state: "visible" });
      await legend.locator("dd", { hasText: "300.0 visual units" }).waitFor({ state: "visible" });
      await page.waitForFunction(
        () => window.__SPACEVIEWER_PERF__?.solar?.diagnostics?.scaleMode === "realistic",
        null,
        { timeout: 10000 },
      );
      if (!page.url().includes("scale=realistic")) {
        throw new Error(`True-AU route did not preserve scale context: ${page.url()}`);
      }
      const missionScale = page.getByRole("group", { name: "Solar scale model" });
      if (await missionScale.count()) {
        const trueAuButton = missionScale.getByRole("button", { name: "True AU" });
        if ((await trueAuButton.getAttribute("aria-pressed")) !== "true") {
          throw new Error("True-AU scale control did not restore its pressed state");
        }
        await assertNoViewportOverlap(
          page,
          ".solar-mission-control",
          ".solar-scale-legend",
          "desktop true-AU Solar panels",
        );
      }
      if (await page.locator(".solar-timeline").count()) {
        await assertNoViewportOverlap(
          page,
          ".solar-scale-legend",
          ".solar-timeline",
          "desktop true-AU Solar scale and timeline",
        );
      }
    },
  },
  {
    name: "solar-eclipse",
    run: async (page) => {
      const eclipsePath = "/solar?object=planet%3Ajupiter&mode=planetary&scale=educational&date=2025-01-03";
      await page.goto(`${baseUrl}${eclipsePath}`, { waitUntil: "domcontentloaded" });
      await page.locator(".solar-page").waitFor({ state: "visible", timeout: 30000 });
      await waitForVisibleCanvas(page, ".solar-page canvas", "Solar eclipse geometry");
      await page.locator('.solar-panel-dock__ephemeris[data-ephemeris-status="ready"]', { hasText: "VSOP87C 2025" }).waitFor({
        state: "attached",
        timeout: 10000,
      });
      await page.waitForTimeout(1_350);
      await page.locator(".solar-panel--details h3", { hasText: "Jupiter" }).waitFor({ state: "visible" });
      const eclipseReadout = page.locator(
        '[data-solar-eclipse-model="finite-solar-disc-major-moon-v2"]',
      );
      await eclipseReadout.waitFor({ state: "visible" });
      await page.waitForFunction(
        () => Number(document.querySelector("[data-solar-eclipse-candidates]")?.getAttribute("data-solar-eclipse-candidates")) > 0,
        null,
        { timeout: 10000 },
      );
      const candidateCount = Number(await eclipseReadout.getAttribute("data-solar-eclipse-candidates"));
      if (candidateCount < 1) {
        throw new Error(`Expected a Jupiter major-moon eclipse candidate, found ${candidateCount}`);
      }
      await eclipseReadout.locator("dd", { hasText: "Analytic umbra and penumbra enabled" }).waitFor({
        state: "visible",
      });
      await page.waitForFunction(
        () =>
          window.__SPACEVIEWER_PERF__?.solar?.diagnostics?.eclipseShadowModel ===
            "finite-solar-disc-major-moon-v2" &&
          Number(window.__SPACEVIEWER_PERF__?.solar?.diagnostics?.eclipseCandidateCount) > 0 &&
          window.__SPACEVIEWER_PERF__?.solar?.diagnostics?.eclipseShadows === true,
        null,
        { timeout: 10000 },
      );

      const qualitySelect = page.locator("#astro-quality-tier");
      await setSelectValue(qualitySelect, "low");
      await eclipseReadout.locator("dd", { hasText: "Disabled by Low/mobile quality" }).waitFor({
        state: "visible",
      });
      await page.waitForFunction(
        () => window.__SPACEVIEWER_PERF__?.solar?.diagnostics?.eclipseShadows === false,
        null,
        { timeout: 10000 },
      );
      await setSelectValue(qualitySelect, "auto");
    },
  },
  {
    name: "solar-moon-eclipse",
    run: async (page) => {
      const eclipsePath = "/solar?object=moon%3Aeuropa&mode=planetary&scale=educational&date=2025-01-16";
      await page.goto(`${baseUrl}${eclipsePath}`, { waitUntil: "domcontentloaded" });
      await page.locator(".solar-page").waitFor({ state: "visible", timeout: 30000 });
      await waitForVisibleCanvas(page, ".solar-page canvas", "Solar moon eclipse geometry");
      await page.locator('.solar-panel-dock__ephemeris[data-ephemeris-status="ready"]', { hasText: "VSOP87C 2025" }).waitFor({
        state: "attached",
        timeout: 10000,
      });
      await page.waitForTimeout(1_350);
      await page.locator(".solar-panel--details h3", { hasText: "Europa" }).waitFor({ state: "visible" });
      const eclipseReadout = page.locator(
        '[data-solar-moon-eclipse-model="finite-solar-disc-moon-occultation-v2"]',
      );
      await eclipseReadout.waitFor({ state: "visible" });
      await page.waitForFunction(
        () => Number(document.querySelector("[data-solar-moon-eclipse-candidates]")?.getAttribute("data-solar-moon-eclipse-candidates")) > 0,
        null,
        { timeout: 10000 },
      );
      const candidateCount = Number(await eclipseReadout.getAttribute("data-solar-moon-eclipse-candidates"));
      if (candidateCount < 1) {
        throw new Error(`Expected a Europa parent-planet eclipse candidate, found ${candidateCount}`);
      }
      await eclipseReadout.locator("strong", { hasText: "Jupiter" }).waitFor({ state: "visible" });
      await eclipseReadout.locator("dd", { hasText: "Parent and mutual eclipse shadows enabled" }).waitFor({
        state: "visible",
      });
      const satelliteEphemeris = page.locator(
        '[data-satellite-ephemeris-model="astronomy-engine-l1.2-galilean"]' +
          '[data-satellite-ephemeris-controlled="true"]',
      );
      await satelliteEphemeris.waitFor({ state: "visible" });
      await satelliteEphemeris.locator("dd", { hasText: "Controlled analytical state" }).waitFor({ state: "visible" });
      await satelliteEphemeris.locator("dd", { hasText: "IMCCE L1.2 Galilean analytical state" }).waitFor({ state: "visible" });
      await satelliteEphemeris.getByRole("link", { name: "Open generated manifest" }).waitFor({ state: "visible" });
      const europaOrientation = page.locator(
        '[data-solar-orientation-body="europa"][data-solar-orientation-model="NAIF pck00011 · WGCCRE satellite"]',
      );
      await europaOrientation.waitFor({ state: "visible" });
      await europaOrientation.getByRole("link", { name: "NASA/JPL NAIF pck00011" }).waitFor({ state: "visible" });
      await europaOrientation.getByRole("link", { name: "receipt" }).waitFor({ state: "visible" });
      try {
        await page.waitForFunction(
          () =>
            window.__SPACEVIEWER_PERF__?.solar?.diagnostics?.moonEclipseShadowModel ===
              "finite-solar-disc-moon-occultation-v2" &&
            Number(window.__SPACEVIEWER_PERF__?.solar?.diagnostics?.moonEclipseCandidateCount) > 0 &&
            String(window.__SPACEVIEWER_PERF__?.solar?.diagnostics?.moonEclipseOccluders).includes("jupiter") &&
            Number(window.__SPACEVIEWER_PERF__?.solar?.diagnostics?.moonEclipseShadowPassCount) > 0 &&
            window.__SPACEVIEWER_PERF__?.solar?.diagnostics?.satelliteEphemerisModel ===
              "astronomy-engine-l1.2-galilean" &&
            window.__SPACEVIEWER_PERF__?.solar?.diagnostics?.satelliteEphemerisControlled === true &&
            window.__SPACEVIEWER_PERF__?.solar?.diagnostics?.satelliteEphemerisVelocityAvailable === true &&
            window.__SPACEVIEWER_PERF__?.solar?.diagnostics?.orientationBody === "europa" &&
            window.__SPACEVIEWER_PERF__?.solar?.diagnostics?.orientationModel ===
              "NAIF pck00011 · WGCCRE satellite",
          null,
          { timeout: 10000 },
        );
      } catch (error) {
        const diagnostics = await page.evaluate(() => window.__SPACEVIEWER_PERF__?.solar?.diagnostics ?? null);
        throw new Error(`Europa scientific diagnostics did not converge: ${JSON.stringify(diagnostics)}; ${error}`);
      }

      const qualitySelect = page.locator("#astro-quality-tier");
      await setSelectValue(qualitySelect, "low");
      await eclipseReadout.locator("dd", { hasText: "Disabled by Low/mobile quality" }).waitFor({
        state: "visible",
      });
      await page.waitForFunction(
        () => Number(window.__SPACEVIEWER_PERF__?.solar?.diagnostics?.moonEclipseShadowPassCount) === 0,
        null,
        { timeout: 10000 },
      );
      await setSelectValue(qualitySelect, "auto");

      await page.goto(
        `${baseUrl}/solar?object=moon%3Amoon&mode=planetary&scale=educational&date=2025-01-16`,
        { waitUntil: "domcontentloaded" },
      );
      await page.locator(".solar-panel--details h3", { hasText: "Moon" }).waitFor({ state: "visible" });
      const lunarEphemeris = page.locator(
        '[data-satellite-ephemeris-model="astronomy-engine-improved-lunar"]' +
          '[data-satellite-ephemeris-controlled="true"]',
      );
      await lunarEphemeris.waitFor({ state: "visible" });
      await lunarEphemeris.locator("dd", { hasText: "Improved Lunar Ephemeris analytical state" }).waitFor({ state: "visible" });
      await lunarEphemeris.getByRole("link", { name: "Astronomy Engine release" }).waitFor({ state: "visible" });
      await page
        .locator('[data-solar-orientation-body="moon"][data-solar-orientation-model="NAIF pck00011 · lunar ME"]')
        .waitFor({ state: "visible" });
      await page.waitForFunction(
        () =>
          window.__SPACEVIEWER_PERF__?.solar?.diagnostics?.satelliteEphemerisModel ===
            "astronomy-engine-improved-lunar" &&
          window.__SPACEVIEWER_PERF__?.solar?.diagnostics?.satelliteEphemerisControlled === true &&
          window.__SPACEVIEWER_PERF__?.solar?.diagnostics?.satelliteEphemerisVelocityAvailable === true &&
          window.__SPACEVIEWER_PERF__?.solar?.diagnostics?.orientationBody === "moon" &&
          window.__SPACEVIEWER_PERF__?.solar?.diagnostics?.orientationModel === "NAIF pck00011 · lunar ME",
        null,
        { timeout: 10000 },
      );
    },
  },
  {
    name: "solar-atmosphere-lut",
    run: async (page) => {
      const earthPath = "/solar?object=planet%3Aearth&mode=planetary&scale=educational&date=2025-06-21";
      await page.goto(`${baseUrl}${earthPath}`, { waitUntil: "domcontentloaded" });
      await page.locator(".solar-page").waitFor({ state: "visible", timeout: 30000 });
      await waitForVisibleCanvas(page, ".solar-page canvas", "Solar atmosphere LUT");
      await page.locator(".solar-panel--details h3", { hasText: "Earth" }).waitFor({ state: "visible" });
      const atmosphereReadout = page.locator(
        '[data-solar-atmosphere-model="earth-bruneton-reference-rgb-v1"]',
      );
      await atmosphereReadout.waitFor({ state: "visible" });
      await atmosphereReadout.locator("dd", { hasText: "Generated single-scattering optical-depth LUT" }).waitFor({
        state: "visible",
      });
      await atmosphereReadout.getByRole("link", { name: "Bruneton reference Earth parameters" }).waitFor({
        state: "visible",
      });
      await page.waitForFunction(
        () =>
          window.__SPACEVIEWER_PERF__?.solar?.diagnostics?.atmosphereModel ===
            "earth-bruneton-reference-rgb-v1" &&
          window.__SPACEVIEWER_PERF__?.solar?.diagnostics?.atmosphereProfileStatus ===
            "reference-parameterization" &&
          Number(window.__SPACEVIEWER_PERF__?.solar?.diagnostics?.atmosphereLutPassCount) === 1,
        null,
        { timeout: 10000 },
      );

      const qualitySelect = page.locator("#astro-quality-tier");
      await setSelectValue(qualitySelect, "low");
      await page.waitForFunction(
        () =>
          window.__SPACEVIEWER_PERF__?.solar?.diagnostics?.atmosphereLutWidth === 32 &&
          window.__SPACEVIEWER_PERF__?.solar?.diagnostics?.atmosphereLutHeight === 16,
        null,
        { timeout: 10000 },
      );
      if ((await atmosphereReadout.getAttribute("data-solar-atmosphere-lut")) !== "32x16") {
        throw new Error("Low/mobile atmosphere LUT did not expose its 32x16 work budget");
      }

      await setSelectValue(qualitySelect, "high");
      await page.waitForFunction(
        () =>
          window.__SPACEVIEWER_PERF__?.solar?.diagnostics?.atmosphereLutWidth === 96 &&
          window.__SPACEVIEWER_PERF__?.solar?.diagnostics?.atmosphereLutHeight === 48,
        null,
        { timeout: 10000 },
      );
      if ((await atmosphereReadout.getAttribute("data-solar-atmosphere-lut")) !== "96x48") {
        throw new Error("High atmosphere LUT did not expose its 96x48 work budget");
      }
      await setSelectValue(qualitySelect, "auto");
    },
  },
  {
    name: "solar-ring-shadows",
    run: async (page) => {
      const ringPath = "/solar?object=planet%3Asaturn&mode=planetary&scale=educational&date=2035-07-14";
      await page.goto(`${baseUrl}${ringPath}`, { waitUntil: "domcontentloaded" });
      await page.locator(".solar-page").waitFor({ state: "visible", timeout: 30000 });
      await waitForVisibleCanvas(page, ".solar-page canvas", "Solar ring shadows");
      await page.locator(".solar-panel--details h3", { hasText: "Saturn" }).waitFor({ state: "visible" });
      const ringReadout = page.locator(
        '[data-solar-ring-shadow-model="finite-sun-ring-transmission-v1"]',
      );
      await ringReadout.waitFor({ state: "visible" });
      if ((await ringReadout.getAttribute("data-solar-ring-system")) !== "saturn-main-rings-nasa-v1") {
        throw new Error("Saturn ring readout did not expose the sourced NASA ring-system model");
      }
      await ringReadout.locator("dd", { hasText: "Two-way analytic ring shadows enabled" }).waitFor({
        state: "visible",
      });
      await page.waitForFunction(
        () =>
          window.__SPACEVIEWER_PERF__?.solar?.diagnostics?.ringShadowModel ===
            "finite-sun-ring-transmission-v1" &&
          window.__SPACEVIEWER_PERF__?.solar?.diagnostics?.ringSystem ===
            "saturn-main-rings-nasa-v1" &&
          Number(window.__SPACEVIEWER_PERF__?.solar?.diagnostics?.ringShadowPassCount) === 1 &&
          window.__SPACEVIEWER_PERF__?.solar?.diagnostics?.ringShadows === true,
        null,
        { timeout: 10000 },
      );

      const qualitySelect = page.locator("#astro-quality-tier");
      await setSelectValue(qualitySelect, "low");
      await ringReadout.locator("dd", { hasText: "Surface shadows disabled by Low/mobile quality" }).waitFor({
        state: "visible",
      });
      await page.waitForFunction(
        () =>
          window.__SPACEVIEWER_PERF__?.solar?.diagnostics?.ringShadows === false &&
          Number(window.__SPACEVIEWER_PERF__?.solar?.diagnostics?.ringShadowPassCount) === 0,
        null,
        { timeout: 10000 },
      );
      await setSelectValue(qualitySelect, "auto");
    },
  },
  {
    name: "solar-history",
    run: async (page) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      const dateKey = "2035-07-14";
      const overviewPath = `/solar?object=overview&mode=ecliptic&scale=realistic&date=${dateKey}`;
      const marsPath = `/solar?object=planet%3Amars&mode=planetary&scale=realistic&date=${dateKey}`;
      const europaPath = `/solar?object=moon%3Aeuropa&mode=planetary&scale=realistic&date=${dateKey}`;
      await page.goto(`${baseUrl}${overviewPath}`, { waitUntil: "domcontentloaded" });
      await page.locator(".solar-page").waitFor({ state: "visible", timeout: 30000 });
      await waitForVisibleCanvas(page, ".solar-page canvas", "Solar history overview");
      await page.locator(".solar-date__value", { hasText: "2035" }).waitFor({ state: "visible" });
      // Read the baseline only once the renderer has registered itself (the canvas can appear first).
      await assertWebGLDiagnostics(page, "solar", { mounted: true, canvasCount: 1 });
      const initialWebgl = await readWebGLDiagnostics(page, "solar");

      const selectSolarSearchResult = async (query, label) => {
        const panelDock = page.locator(".solar-panel-dock");
        if (!(await page.locator(".solar-topbar").count())) {
          await panelDock.getByRole("button", { name: "Tools" }).click();
          await page.locator(".solar-topbar").waitFor({ state: "visible" });
        }
        if (!(await page.locator(".solar-tools__menu").count())) {
          await page.getByRole("button", { name: "Controls" }).click();
          await page.locator(".solar-tools__menu").waitFor({ state: "visible" });
        }
        await page.locator("#solar-search").fill(query);
        await page.locator(".solar-search__result", { hasText: label }).first().click();
      };

      await selectSolarSearchResult("mars", "Mars");
      await page.waitForURL(`${baseUrl}${marsPath}`);
      await page.locator(".solar-panel--details h3", { hasText: "Mars" }).waitFor({ state: "visible" });
      await page.locator('[data-solar-orientation-body="mars"][data-solar-orientation-model="IAU WGCCRE 2015"]')
        .waitFor({ state: "visible" });
      await page.waitForFunction(
        () => performance.getEntriesByType("resource").some((entry) => entry.name.includes("/solar-textures/perf/2k_mars.jpg")),
        null,
        { timeout: 10000 },
      );
      await selectSolarSearchResult("europa", "Europa");
      await page.waitForURL(`${baseUrl}${europaPath}`);
      await page.locator(".solar-panel--details h3", { hasText: "Europa" }).waitFor({ state: "visible" });
      await page.locator('[data-solar-orientation-body="europa"][data-solar-orientation-model="NAIF pck00011 · WGCCRE satellite"]')
        .waitFor({ state: "visible" });
      await page.waitForFunction(
        () => performance.getEntriesByType("resource").some((entry) => entry.name.includes("/solar-textures/perf/moon_1024.jpg")),
        null,
        { timeout: 10000 },
      );

      await page.goBack();
      await page.waitForURL(`${baseUrl}${marsPath}`);
      await page.locator(".solar-panel--details h3", { hasText: "Mars" }).waitFor({ state: "visible" });
      await page.locator(".solar-mission-control", { hasText: "True AU" }).waitFor({ state: "visible" });
      await page.locator(".solar-date__value", { hasText: "2035" }).waitFor({ state: "visible" });

      await page.goForward();
      await page.waitForURL(`${baseUrl}${europaPath}`);
      await page.locator(".solar-panel--details h3", { hasText: "Europa" }).waitFor({ state: "visible" });
      const finalWebgl = await readWebGLDiagnostics(page, "solar");
      if (finalWebgl.mounts !== initialWebgl.mounts || finalWebgl.unmounts !== initialWebgl.unmounts) {
        throw new Error(
          `Solar Back/Forward remounted the renderer: before=${JSON.stringify(initialWebgl)} after=${JSON.stringify(finalWebgl)}`,
        );
      }

      const copyLink = page.getByRole("button", { name: "Copy Solar link" });
      await copyLink.click();
      await page.getByRole("button", { name: "Solar link copied" }).waitFor({ state: "visible" });

      await page.goto(`${baseUrl}/solar`, { waitUntil: "domcontentloaded" });
      await page.locator(".solar-page").waitFor({ state: "visible", timeout: 30000 });
      await waitForVisibleCanvas(page, ".solar-page canvas", "Solar plain-route overview");
      await selectSolarSearchResult("saturn", "Saturn");
      await page.locator(".solar-panel--details h3", { hasText: "Saturn" }).waitFor({ state: "visible" });
      await page.goBack();
      await page.waitForURL(`${baseUrl}/solar`);
      await page.locator(".solar-mission-control h2", { hasText: "System overview" }).waitFor({ state: "visible" });
      await page.locator(".solar-panel--details").waitFor({ state: "detached" });
    },
  },
  {
    name: "scale-journey",
    run: async (page) => {
      await page.goto(`${baseUrl}/solar`, { waitUntil: "domcontentloaded" });
      await page.locator(".solar-page").waitFor({ state: "visible", timeout: 30000 });
      await page.evaluate(() => {
        window.localStorage.setItem("spaceviewer.reduceMotion", "false");
        document.body.classList.remove("reduce-motion");
      });
      await waitForVisibleCanvas(page, ".solar-page canvas", "Scale journey Solar source");
      await page.locator(".cosmic-journey__frame-path", { hasText: "Heliocentric ecliptic" }).waitFor({
        state: "visible",
      });

      await page.locator(".cosmic-journey__domains").getByRole("button", { name: "04 Stars implemented" }).click();
      const outwardTransition = page.locator('.scale-journey-transition[data-from-domain="solar"][data-to-domain="stellar"]');
      await outwardTransition.waitFor({ state: "visible" });
      await outwardTransition.locator(".scale-journey-transition__route", { hasText: "Solar System" }).waitFor({
        state: "visible",
      });
      await outwardTransition.locator(".scale-journey-transition__frames", { hasText: "Local stellar neighbourhood" }).waitFor({
        state: "visible",
      });
      await page.waitForURL(`${baseUrl}/explore?object=${encodeURIComponent("star:nearby:proxima-centauri")}`);
      await page.locator(".ex-root").waitFor({ state: "visible", timeout: 30000 });
      await outwardTransition.waitFor({ state: "detached", timeout: 5000 });
      await waitForVisibleCanvas(page, ".ex-viewport canvas", "Scale journey stellar target");
      await page.locator(".cosmic-journey__context strong", { hasText: "Stellar neighbourhood" }).waitFor({
        state: "visible",
      });
      await page.locator(".cosmic-journey__frame-path", { hasText: "Local stellar neighbourhood" }).waitFor({
        state: "visible",
      });
      await assertWebGLDiagnostics(page, "solar", { mounted: false, canvasCount: 0, minUnmounts: 1 });
      await assertWebGLDiagnostics(page, "skymap", { mounted: true, canvasCount: 1, maxContextLost: 0 });

      await page.locator(".cosmic-journey__domains").getByRole("button", { name: "03 Solar implemented" }).click();
      const inwardTransition = page.locator('.scale-journey-transition[data-from-domain="stellar"][data-to-domain="solar"]');
      await inwardTransition.waitFor({ state: "visible" });
      await page.waitForURL(`${baseUrl}/solar`);
      await page.locator(".solar-page").waitFor({ state: "visible", timeout: 30000 });
      await inwardTransition.waitFor({ state: "detached", timeout: 5000 });
      await waitForVisibleCanvas(page, ".solar-page canvas", "Scale journey Solar return");

      await page.goBack();
      const historyOutwardTransition = page.locator(
        '.scale-journey-transition[data-from-domain="solar"][data-to-domain="stellar"]',
      );
      await historyOutwardTransition.waitFor({ state: "visible" });
      await page.waitForURL(`${baseUrl}/explore?object=${encodeURIComponent("star:nearby:proxima-centauri")}`);
      await page.locator(".ex-root").waitFor({ state: "visible", timeout: 30000 });
      await historyOutwardTransition.waitFor({ state: "detached", timeout: 5000 });
      await page.locator(".cosmic-journey__context strong", { hasText: "Stellar neighbourhood" }).waitFor({
        state: "visible",
      });

      await page.goForward();
      const historyInwardTransition = page.locator(
        '.scale-journey-transition[data-from-domain="stellar"][data-to-domain="solar"]',
      );
      await historyInwardTransition.waitFor({ state: "visible" });
      await page.waitForURL(`${baseUrl}/solar`);
      await page.locator(".solar-page").waitFor({ state: "visible", timeout: 30000 });
      await historyInwardTransition.waitFor({ state: "detached", timeout: 5000 });

      await page.evaluate(() => {
        window.localStorage.setItem("spaceviewer.reduceMotion", "true");
        document.body.classList.add("reduce-motion");
      });
      await page.locator(".cosmic-journey__domains").getByRole("button", { name: "04 Stars implemented" }).click();
      await page.waitForURL(`${baseUrl}/explore?object=${encodeURIComponent("star:nearby:proxima-centauri")}`);
      if ((await page.locator(".scale-journey-transition").count()) !== 0) {
        throw new Error("Reduced-motion scale navigation rendered an animated transition overlay");
      }
      await page.locator(".ex-root").waitFor({ state: "visible", timeout: 30000 });
    },
  },
  {
    name: "camera-flights",
    run: async (page) => {
      const setReducedMotion = async (enabled) => {
        await page.evaluate((nextEnabled) => {
          window.localStorage.setItem("spaceviewer.reduceMotion", String(nextEnabled));
          document.body.classList.toggle("reduce-motion", nextEnabled);
        }, enabled);
      };
      await page.goto(`${baseUrl}/solar`, { waitUntil: "domcontentloaded" });
      await page.locator(".solar-page").waitFor({ state: "visible", timeout: 30000 });
      await waitForVisibleCanvas(page, ".solar-page canvas", "Cancelable Solar flight");
      await setReducedMotion(false);

      await runCommand(page, "neptune", "Neptune");
      const solarFlight = page.locator('[data-camera-flight="solar"]');
      await solarFlight.locator("strong", { hasText: "Flying to Neptune" }).waitFor({ state: "visible" });
      await solarFlight.getByRole("button", { name: "Cancel flight" }).click();
      await solarFlight.waitFor({ state: "detached" });

      await runCommand(page, "saturn", "Saturn");
      await solarFlight.locator("strong", { hasText: "Flying to Saturn" }).waitFor({ state: "visible" });
      const solarCanvas = page.locator(".solar-page canvas").first();
      const solarCanvasBox = await solarCanvas.boundingBox();
      if (!solarCanvasBox) throw new Error("Cancelable Solar flight canvas had no pointer bounds");
      const solarPointerX = solarCanvasBox.x + solarCanvasBox.width * 0.58;
      const solarPointerY = solarCanvasBox.y + solarCanvasBox.height * 0.52;
      await page.mouse.move(solarPointerX, solarPointerY);
      await page.mouse.down();
      await page.mouse.move(solarPointerX + 28, solarPointerY + 12, { steps: 2 });
      await page.mouse.up();
      await solarFlight.waitFor({ state: "detached" });

      await runCommand(page, "jupiter", "Jupiter");
      await solarFlight.locator("strong", { hasText: "Flying to Jupiter" }).waitFor({ state: "visible" });
      await page.keyboard.press("Escape");
      await solarFlight.waitFor({ state: "detached" });

      await setReducedMotion(true);
      await runCommand(page, "mars", "Mars");
      await page.waitForTimeout(100);
      if ((await solarFlight.count()) !== 0) {
        throw new Error("Reduced-motion Solar navigation rendered an animated camera flight");
      }

      await page.goto(`${baseUrl}/skymap?classic=1`, { waitUntil: "domcontentloaded" });
      await page.locator(".skymap-page").waitFor({ state: "visible", timeout: 30000 });
      await waitForVisibleCanvas(page, ".skymap-viewport canvas", "Cancelable SkyMap flight");
      await setReducedMotion(false);
      await page.locator("#skymap-search").fill("Andromeda Galaxy");
      await page.locator(".skymap-search-result", { hasText: "Andromeda Galaxy" }).first().click();
      const skyMapFlight = page.locator('[data-camera-flight="skymap"]');
      await skyMapFlight.locator("strong", { hasText: "Flying to Andromeda Galaxy" }).waitFor({ state: "visible" });
      await page.keyboard.press("Escape");
      await skyMapFlight.waitFor({ state: "detached" });

      await page.locator(".skymap-panel--object").getByRole("button", { name: "Focus in viewport" }).click();
      await skyMapFlight.locator("strong", { hasText: "Flying to Andromeda Galaxy" }).waitFor({ state: "visible" });
      await skyMapFlight.getByRole("button", { name: "Cancel flight" }).click();
      await skyMapFlight.waitFor({ state: "detached" });

      await setReducedMotion(true);
      await page.getByRole("button", { name: "Reset overview" }).click();
      await page.waitForTimeout(100);
      if ((await skyMapFlight.count()) !== 0) {
        throw new Error("Reduced-motion SkyMap navigation rendered an animated camera flight");
      }
    },
  },
  {
    name: "skymap",
    run: async (page) => {
      await page.goto(`${baseUrl}/skymap?classic=1`, { waitUntil: "domcontentloaded" });
      await page.locator(".skymap-page").waitFor({ state: "visible", timeout: 30000 });
      await page.locator(".sv-bar .sv-brand", { hasText: "SpaceViewer" }).waitFor({ state: "visible" });
      await page.locator(".sv-bar__actions").waitFor({ state: "visible" });
      await waitForVisibleCanvas(page, ".skymap-viewport canvas", "SkyMap");
      await page.locator('.skymap-status-strip [data-ephemeris-status="ready"]', { hasText: "VSOP87C Float64" }).waitFor({
        state: "attached",
        timeout: 10000,
      });
      const qualitySelect = page.locator("#astro-quality-tier");
      await setSelectValue(qualitySelect, "low");
      await page.locator(".cosmic-journey__quality-status", { hasText: "Manual override · Low / mobile" }).waitFor({
        state: "attached",
      });
      await assertRendererBudgets(page, "skymap", "low");
      await assertSkyMapLabelLayout(page, "Low SkyMap", 8);
      await setSelectValue(qualitySelect, "high");
      await page.locator(".cosmic-journey__quality-status", { hasText: "Manual override · High" }).waitFor({
        state: "attached",
      });
      await assertRendererBudgets(page, "skymap", "high");
      await setSelectValue(qualitySelect, "auto");
      await page.locator(".cosmic-journey__quality-status", { hasText: /^Auto/ }).waitFor({ state: "attached" });
      await assertSkyMapLabelLayout(page, "Balanced SkyMap");
      await page.waitForFunction(() => {
        const status = [...document.querySelectorAll(".skymap-status-strip > div")]
          .find((candidate) => candidate.textContent?.includes("Catalogue stream"))
          ?.querySelector("strong")?.textContent ?? "";
        const counts = status.match(/([\d,]+)\/([\d,]+) sources/);
        return status.includes("ready") && Boolean(counts && counts[1] === counts[2]);
      }, null, { timeout: 30000 });
      const stellarEpochStatus = page.locator(".skymap-status-strip > div", { hasText: "Stellar epoch" });
      await stellarEpochStatus.locator("strong", { hasText: "propagated" }).waitFor({
        state: "attached",
        timeout: 30000,
      });
      const catalogResources = await page.evaluate(() =>
        performance
          .getEntriesByType("resource")
          .map((entry) => entry.name)
          .filter((name) => name.includes("/catalogs/nearby-stars/")),
      );
      const binaryChunkRequests = catalogResources.filter((name) => name.endsWith(".svsc"));
      if (binaryChunkRequests.length !== 49) {
        throw new Error(`Expected 49 streamed binary star chunks, found ${binaryChunkRequests.length}`);
      }
      const orientationInset = page.locator(".skymap-orientation-inset", { hasText: "Orientation" });
      await orientationInset.waitFor({ state: "hidden" });
      const scaleRuler = page.locator(".skymap-scale-ruler", { hasText: "Staged scale ruler" });
      await scaleRuler.waitFor({ state: "hidden" });
      await page.getByRole("button", { name: "Settings" }).click();
      await page.locator(".skymap-panel--filters .skymap-select").first().waitFor({ state: "visible" });
      const menuCount = await page.locator(".skymap-select.select-menu").count();
      if (menuCount !== 4) throw new Error(`Expected 4 SkyMap menus, found ${menuCount}`);
      const activeLayerCount = await page.locator(".skymap-layer-row").count();
      if (activeLayerCount < 1) throw new Error("Expected at least one active SkyMap layer");
      const constellationRow = page.locator(".skymap-layer-row", { hasText: "Constellation boundaries" });
      await constellationRow.locator("strong", { hasText: "Hidden" }).waitFor({ state: "visible" });
      await constellationRow.locator(".skymap-layer-row__toggle").click();
      await constellationRow.locator("strong", { hasText: "Visible" }).waitFor({ state: "visible" });
      await page.waitForFunction(
        () => window.__SPACEVIEWER_PERF__?.skymap?.diagnostics?.lines === 1,
        null,
        { timeout: 10000 },
      );
      await constellationRow.locator(".skymap-layer-row__toggle").click();
      await constellationRow.locator("strong", { hasText: "Hidden" }).waitFor({ state: "visible" });
      const solarBodiesRow = page.locator(".skymap-layer-row", { hasText: "Solar bodies" });
      await solarBodiesRow.locator(".skymap-layer-row__density").waitFor({ state: "visible" });
      await solarBodiesRow.locator("small").filter({ hasText: /active.*hidden/ }).waitFor({ state: "visible" });
      await solarBodiesRow.getByRole("button", { name: "Show only Solar bodies" }).click();
      const visibleLayerCount = await page.locator(".skymap-layer-row.is-active").count();
      if (visibleLayerCount !== 1) throw new Error(`Expected 1 soloed visible layer, found ${visibleLayerCount}`);
      await solarBodiesRow.locator("strong", { hasText: "Visible" }).waitFor({ state: "visible" });
      await page.locator(".skymap-layer-presets").getByRole("button", { name: "Save preset" }).click();
      await page.locator(".skymap-layer-presets", { hasText: `Saved preset: 1/${activeLayerCount} visible` }).waitFor({ state: "visible" });
      await page.locator(".skymap-layer-presets").getByRole("button", { name: "All active" }).click();
      const restoredLayerCount = await page.locator(".skymap-layer-row.is-active").count();
      if (restoredLayerCount !== activeLayerCount) {
        throw new Error(`Expected ${activeLayerCount} visible layers after All active, found ${restoredLayerCount}`);
      }
      await page.locator(".skymap-layer-presets").getByRole("button", { name: "Restore saved" }).click();
      const presetLayerCount = await page.locator(".skymap-layer-row.is-active").count();
      if (presetLayerCount !== 1) throw new Error(`Expected 1 visible layer after restoring preset, found ${presetLayerCount}`);
      await page.locator(".skymap-layer-presets").getByRole("button", { name: "Clear saved" }).click();
      await page.locator(".skymap-layer-presets", { hasText: "No saved layer preset" }).waitFor({ state: "visible" });
      await page.getByRole("button", { name: "Time", exact: true }).click();
      const timePanel = page.locator(".skymap-panel--time", { hasText: "Simulation time" });
      await timePanel.locator(".skymap-time-propagation", { hasText: "Gaia space motions are rendered" }).waitFor({
        state: "visible",
        timeout: 30000,
      });
      await timePanel.locator(".skymap-time-propagation", { hasText: "13,492 measured" }).waitFor({ state: "visible" });
      await timePanel.locator(".skymap-time-propagation", { hasText: "1,956 zero fallback" }).waitFor({ state: "visible" });
      await page.locator("#skymap-time-date").fill("2100-12-31");
      await timePanel.locator(".skymap-time-propagation", { hasText: "J2100.00" }).waitFor({
        state: "visible",
        timeout: 30000,
      });
      await page.getByLabel("Object search").fill("Gaia DR3 6586825380598949632");
      await page.locator(".skymap-search-result", { hasText: "Gaia DR3 6586825380598949632" }).first().click();
      await page.locator(".skymap-panel--object h2", { hasText: "Gaia DR3 6586825380598949632" }).waitFor({ state: "visible" });
      await page.locator(".skymap-object-stats", { hasText: "Rendered stellar epoch" }).waitFor({ state: "visible" });
      await page.locator(".skymap-object-stats", { hasText: "J2100.00" }).waitFor({ state: "visible" });
      await page.locator(".skymap-object-stats", { hasText: "Propagated angular uncertainty" }).waitFor({ state: "visible" });
      await page.locator(".skymap-object-stats", { hasText: "6-parameter Jacobian projection" }).waitFor({ state: "visible" });
      await page.locator(".skymap-object-stats", { hasText: "3D position covariance" }).waitFor({ state: "visible" });
      await page.locator(".skymap-object-stats", { hasText: "J C₀ Jᵀ" }).waitFor({ state: "visible" });
      await page.locator(".skymap-object-stats", { hasText: "independent RVS σ included" }).waitFor({ state: "visible" });
      await page.locator(".skymap-object-stats", { hasText: "Gaia RVS / SSB" }).waitFor({ state: "visible" });
      await page.getByLabel("Object search").fill("Gaia DR3 418551920284673408");
      await page.locator(".skymap-search-result", { hasText: "Gaia DR3 418551920284673408" }).first().click();
      await page.locator(".skymap-panel--object h2", { hasText: "Gaia DR3 418551920284673408" }).waitFor({ state: "visible" });
      await page.locator(".skymap-object-stats", { hasText: "0 km/s propagation fallback" }).waitFor({ state: "visible" });
      await page.locator(".skymap-object-stats", { hasText: "conditional on disclosed 0 km/s radial fallback" }).waitFor({ state: "visible" });
      await page.locator("#skymap-time-date").fill("1900-01-01");
      await timePanel.locator(".skymap-time-propagation", { hasText: "J1900.00" }).waitFor({
        state: "visible",
        timeout: 30000,
      });
      await timePanel.getByRole("button", { name: "Now" }).click();
      await timePanel.locator(".skymap-time-propagation", { hasText: "J2026.67" }).waitFor({
        state: "visible",
        timeout: 30000,
      });
      const skyMapDirection = timePanel.getByRole("group", { name: "Playback direction" });
      await page.locator("#skymap-time-date").fill("2030-01-15");
      await skyMapDirection.getByRole("button", { name: "Reverse" }).click();
      if ((await skyMapDirection.getByRole("button", { name: "Reverse" }).getAttribute("aria-pressed")) !== "true") {
        throw new Error("SkyMap reverse-time direction did not become active");
      }
      await timePanel.getByRole("button", { name: "Play" }).click();
      await page.waitForFunction(
        () => (document.querySelector("#skymap-time-date")?.value ?? "") < "2030-01-15",
        null,
        { timeout: 10000 },
      );
      await timePanel.getByRole("button", { name: "Pause" }).click();
      await skyMapDirection.getByRole("button", { name: "Forward" }).click();
      await timePanel.getByRole("button", { name: "Now" }).click();
      await timePanel.locator(".skymap-time-propagation", { hasText: "J2026.67" }).waitFor({
        state: "visible",
        timeout: 30000,
      });
      await page.getByLabel("Object search").fill("Mars");
      await page.locator(".skymap-search-result", { hasText: "Mars" }).first().click();
      await page.locator(".skymap-panel--object h2", { hasText: "Mars" }).waitFor({ state: "visible" });
      const skymapDossierChips = page.locator(".skymap-object-dossier__chips .status-chip");
      await skymapDossierChips.first().waitFor({ state: "visible" });
      const skymapDossierChipCount = await skymapDossierChips.count();
      if (skymapDossierChipCount !== 3) {
        throw new Error(`Expected 3 SkyMap dossier status chips, found ${skymapDossierChipCount}`);
      }
      const annotationPanel = page.locator(".skymap-panel--annotations", { hasText: "Map notes" });
      await annotationPanel.locator(".skymap-annotation-summary", { hasText: "Mars" }).waitFor({ state: "visible" });
      await annotationPanel.locator(".skymap-annotation-summary", { hasText: "0" }).waitFor({ state: "visible" });
      await annotationPanel.getByLabel("Label").fill("Smoke note: Mars");
      await annotationPanel.getByLabel("Note").fill("Smoke verifies SkyMap annotation lifecycle.");
      await annotationPanel.getByRole("button", { name: "Add note" }).click();
      await annotationPanel.locator(".skymap-annotation-summary", { hasText: "Saved note" }).waitFor({
        state: "visible",
      });
      await annotationPanel.locator(".skymap-annotation-row", { hasText: "Smoke note: Mars" }).waitFor({
        state: "visible",
      });
      await page.locator(".skymap-panel--object h2", { hasText: "Smoke note: Mars" }).waitFor({ state: "visible" });
      await page.locator(".skymap-object-dossier", { hasText: "Anchored note" }).waitFor({ state: "visible" });
      await annotationPanel
        .locator(".skymap-annotation-row", { hasText: "Smoke note: Mars" })
        .locator("button")
        .first()
        .click();
      await annotationPanel.locator(".skymap-annotation-row.is-active", { hasText: "Smoke note: Mars" }).waitFor({
        state: "visible",
      });
      await annotationPanel.getByRole("button", { name: "Delete Smoke note: Mars" }).click();
      await annotationPanel.locator(".skymap-annotation-row", { hasText: "Smoke note: Mars" }).waitFor({
        state: "detached",
      });
      await annotationPanel.locator(".skymap-empty", { hasText: "No saved map notes yet" }).waitFor({ state: "visible" });
    },
  },
  {
    name: "nearby-exoplanet-catalogue",
    run: async (page) => {
      await page.goto(`${baseUrl}/skymap?classic=1&object=${encodeURIComponent("exoplanet-system:proxima-cen-1a11a204")}`, {
        waitUntil: "domcontentloaded",
      });
      await page.locator(".skymap-page").waitFor({ state: "visible", timeout: 30000 });
      await waitForVisibleCanvas(page, ".skymap-viewport canvas", "Nearby exoplanet SkyMap");
      await page.locator(".skymap-viewport__exoplanet-status", {
        hasText: "1,568 confirmed planets · 1,056 systems · 12/12 ICRS sectors",
      }).waitFor({ state: "visible", timeout: 15000 });
      const dossier = page.locator(".skymap-panel--object", { hasText: "Proxima Cen system" });
      await dossier.locator("dt", { hasText: "Proxima Cen b" }).waitFor({ state: "visible" });
      await dossier.locator("dt", { hasText: "Proxima Cen d" }).waitFor({ state: "visible" });
      await dossier.locator("dd", { hasText: "not a completeness-limited occurrence-rate sample" }).waitFor({ state: "visible" });
      await dossier.locator("dd", { hasText: "not guaranteed to form one self-consistent physical solution" }).waitFor({ state: "visible" });
      await dossier.locator("dt", { hasText: "Gaia renderer host" }).waitFor({ state: "visible" });
      await dossier.locator("dd", { hasText: "Exact Gaia DR3 source ID 5853498713190525696" }).waitFor({ state: "visible" });
      const gaiaHostJump = dossier.locator(".skymap-related button", { hasText: "Proxima Cen" }).first();
      await gaiaHostJump.waitFor({ state: "visible" });
      await gaiaHostJump.click();
      await page.waitForURL(`${baseUrl}/skymap?classic=1&object=${encodeURIComponent("star:gaia-dr3:5853498713190525696")}`);
      await page.locator(".skymap-panel--object", { hasText: "Exoplanet-host identity" }).waitFor({ state: "visible" });
      await page.locator(".skymap-panel--object .skymap-related button", { hasText: "Proxima Cen system" }).waitFor({ state: "visible" });
      await page.goBack();
      await page.waitForURL(`${baseUrl}/skymap?classic=1&object=${encodeURIComponent("exoplanet-system:proxima-cen-1a11a204")}`);
      await dossier.waitFor({ state: "visible" });
      const manifestLink = dossier.getByRole("link", { name: "Open catalogue manifest" });
      if ((await manifestLink.getAttribute("href")) !== "/catalogs/exoplanets/manifest.json") {
        throw new Error("Exoplanet dossier did not expose the versioned manifest");
      }
      const catalogRequests = await page.evaluate(() =>
        performance
          .getEntriesByType("resource")
          .map((entry) => entry.name)
          .filter((name) => name.includes("/catalogs/exoplanets/")),
      );
      if (catalogRequests.length !== 13) {
        throw new Error(`Expected one manifest and 12 exoplanet chunk requests, found ${catalogRequests.length}`);
      }
    },
  },
  {
    name: "openngc-deep-sky-catalogue",
    run: async (page) => {
      await page.goto(`${baseUrl}/skymap?classic=1&object=${encodeURIComponent("deep:nebula:orion-nebula")}`, {
        waitUntil: "domcontentloaded",
      });
      await page.locator(".skymap-page").waitFor({ state: "visible", timeout: 30000 });
      await waitForVisibleCanvas(page, ".skymap-viewport canvas", "OpenNGC deep-sky SkyMap");
      await page.locator(".skymap-viewport__openngc-status", {
        hasText: "3,004 selected objects · 12/12 J2000 sectors · angular shell",
      }).waitFor({ state: "visible", timeout: 15000 });
      const dossier = page.locator(".skymap-panel--object", { hasText: "Orion Nebula" });
      await dossier.locator("strong", { hasText: "Measured J2000 direction · angular shell" }).waitFor({ state: "visible" });
      await dossier.locator("strong", { hasText: "Not supplied · angular catalogue" }).waitFor({ state: "visible" });
      await dossier.locator("dd", { hasText: "radial separation is intentionally undefined" }).waitFor({ state: "visible" });
      await dossier.locator("dd", { hasText: "CC BY-SA 4.0" }).waitFor({ state: "visible" });
      const manifestLink = dossier.getByRole("link", { name: "Open generated manifest" });
      if ((await manifestLink.getAttribute("href")) !== "/catalogs/openngc/manifest.json") {
        throw new Error("OpenNGC dossier did not expose the generated manifest");
      }
      const catalogRequests = await page.evaluate(() =>
        performance
          .getEntriesByType("resource")
          .map((entry) => entry.name)
          .filter((name) => name.includes("/catalogs/openngc/")),
      );
      if (catalogRequests.length !== 13) {
        throw new Error(`Expected one manifest and 12 OpenNGC chunk requests, found ${catalogRequests.length}`);
      }
    },
  },
  {
    name: "milky-way-catalogue",
    run: async (page) => {
      await page.goto(`${baseUrl}/skymap?classic=1&object=${encodeURIComponent("galactic:milky-way-structure")}`, {
        waitUntil: "domcontentloaded",
      });
      await page.locator(".skymap-page").waitFor({ state: "visible", timeout: 30000 });
      await waitForVisibleCanvas(page, ".skymap-viewport canvas", "Measured Milky Way SkyMap");
      await page.locator(".skymap-viewport__milky-way-status", {
        hasText: "199 measured masers · 7 arm fits · uncertainty spans",
      }).waitFor({ state: "visible", timeout: 10000 });
      const dossier = page.locator(".skymap-panel--object", { hasText: "Milky Way structure model" });
      await dossier.locator("dd", { hasText: "199 VLBI maser sources" }).waitFor({ state: "visible" });
      await dossier.locator("dd", { hasText: "7 measured-range segments" }).waitFor({ state: "visible" });
      await dossier.locator("dd", { hasText: "9 tracers have fractional parallax uncertainty" }).waitFor({ state: "visible" });
      await dossier.locator("dd", { hasText: "neither a complete star census nor an unbiased Galactic-density sample" }).waitFor({ state: "visible" });
      await dossier.locator("dd", { hasText: "commercial use depends on the originating journal" }).waitFor({ state: "visible" });
      const receiptLink = dossier.getByRole("link", { name: "Open versioned manifest" });
      if ((await receiptLink.getAttribute("href")) !== "/catalogs/milky-way/manifest.json") {
        throw new Error("Milky Way dossier did not expose the versioned manifest");
      }
      const binaryRequests = await page.evaluate(() =>
        performance
          .getEntriesByType("resource")
          .map((entry) => entry.name)
          .filter((name) => name.endsWith("/catalogs/milky-way/tracers.svmw")),
      );
      if (binaryRequests.length !== 1) {
        throw new Error(`Expected one Milky Way binary request, found ${binaryRequests.length}`);
      }
    },
  },
  {
    name: "desi-lightcone-catalogue",
    run: async (page) => {
      await page.goto(`${baseUrl}/skymap?classic=1&object=${encodeURIComponent("cosmological:observable-universe-model")}`, {
        waitUntil: "domcontentloaded",
      });
      await page.locator(".skymap-page").waitFor({ state: "visible", timeout: 30000 });
      await waitForVisibleCanvas(page, ".skymap-viewport canvas", "Measured DESI redshift light cone");
      await page.locator(".skymap-viewport__desi-status", {
        hasText: "22,648 measured galaxies",
      }).waitFor({ state: "visible", timeout: 10000 });
      await page.locator(".skymap-viewport__desi-status", { hasText: "no inferred links" }).waitFor({ state: "visible" });
      const dossier = page.locator(".skymap-panel--object", { hasText: "DESI DR1 measured galaxy light cone" });
      await dossier.locator("dd", { hasText: "22,648 DESI DR1 sources" }).waitFor({ state: "visible" });
      await dossier.locator("dd", { hasText: "z 0.1–0.4" }).waitFor({ state: "visible" });
      await dossier.locator("dd", { hasText: "not a volume-complete census" }).waitFor({ state: "visible" });
      await dossier.locator("dd", { hasText: "does not publish per-object ZERR" }).waitFor({ state: "visible" });
      await dossier.locator("dd", { hasText: "no procedural galaxies or nearest-neighbour filaments" }).waitFor({ state: "visible" });
      await dossier.locator("dd", { hasText: "CC-BY-4.0" }).waitFor({ state: "visible" });
      const receiptLink = dossier.getByRole("link", { name: "Open versioned manifest" });
      if ((await receiptLink.getAttribute("href")) !== "/catalogs/desi-lightcone/manifest.json") {
        throw new Error("DESI light-cone dossier did not expose the versioned manifest");
      }
      const binaryRequests = await page.evaluate(() =>
        performance
          .getEntriesByType("resource")
          .map((entry) => entry.name)
          .filter((name) => name.endsWith("/catalogs/desi-lightcone/galaxies.svlc")),
      );
      if (binaryRequests.length !== 1) {
        throw new Error(`Expected one DESI light-cone binary request, found ${binaryRequests.length}`);
      }
    },
  },
  {
    name: "webgl-lifecycle",
    run: async (page) => {
      await page.goto(`${baseUrl}/solar`, { waitUntil: "domcontentloaded" });
      await page.locator(".solar-page").waitFor({ state: "visible", timeout: 30000 });
      await waitForVisibleCanvas(page, ".solar-page canvas", "Lifecycle Solar Explorer");
      await assertWebGLDiagnostics(page, "solar", { mounted: true, canvasCount: 1, maxContextLost: 0 });

      await page.locator(".sv-bar").getByRole("button", { name: /^Images/ }).click();
      await page.locator(".im-home").waitFor({ state: "visible", timeout: 30000 });
      await assertWebGLDiagnostics(page, "solar", {
        mounted: false,
        canvasCount: 0,
        maxContextLost: 0,
        minUnmounts: 1,
      });

      await page.locator(".sv-bar").getByRole("button", { name: /^Tools/ }).click();
      await page.getByRole("menuitem", { name: /Sky Atlas/ }).click();
      await page.locator(".skymap-page").waitFor({ state: "visible", timeout: 30000 });
      await waitForVisibleCanvas(page, ".skymap-viewport canvas", "Lifecycle SkyMap");
      await assertWebGLDiagnostics(page, "skymap", { mounted: true, canvasCount: 1, maxContextLost: 0 });

      await page.locator(".sv-bar").getByRole("button", { name: /^Sky Atlas/ }).click();
      await page.getByRole("menuitem", { name: /Solar Explorer/ }).click();
      await page.locator(".solar-page").waitFor({ state: "visible", timeout: 30000 });
      await waitForVisibleCanvas(page, ".solar-page canvas", "Lifecycle Solar Explorer return");
      await assertWebGLDiagnostics(page, "skymap", {
        mounted: false,
        canvasCount: 0,
        maxContextLost: 0,
        minUnmounts: 1,
      });
      await assertWebGLDiagnostics(page, "solar", { mounted: true, canvasCount: 1, maxContextLost: 0 });
    },
  },
  {
    name: "object-commands",
    run: async (page) => {
      await page.goto(`${baseUrl}/images`, { waitUntil: "domcontentloaded" });
      await page.locator(".im-home").waitFor({ state: "visible", timeout: 30000 });
      await runRankedCommandWithEnter(page, "Halley", "Halley's Comet");
      await page.locator(".ex-panel h2", { hasText: "Halley's Comet" }).waitFor({ state: "visible", timeout: 30000 });
      await page.locator(".sv-bar").getByRole("button", { name: /^Images/ }).click();
      await runCommand(page, "Halley", "Solar Explorer: Halley's Comet");
      await page.locator(".solar-page").waitFor({ state: "visible", timeout: 30000 });
      await page.locator(".solar-panel--details h3", { hasText: "Halley's Comet" }).waitFor({ state: "visible" });
      if (!page.url().includes("object=small-body%3Ahalley")) {
        throw new Error(`Ranked Halley command did not preserve the small-body route: ${page.url()}`);
      }

      await page.goto(`${baseUrl}/images`, { waitUntil: "domcontentloaded" });
      await page.locator(".im-home").waitFor({ state: "visible", timeout: 30000 });
      await runRankedCommandWithEnter(page, "Sirius A", "Sirius A");
      await page.locator(".ex-root").waitFor({ state: "visible", timeout: 30000 });
      await page.locator(".ex-panel h2", { hasText: "Sirius A" }).waitFor({ state: "visible" });
      if (!page.url().includes("object=star%3Anearby%3Asirius-a")) {
        throw new Error(`Ranked Sirius command did not preserve the stellar route: ${page.url()}`);
      }

      await page.goto(`${baseUrl}/images`, { waitUntil: "domcontentloaded" });
      await page.locator(".im-home").waitFor({ state: "visible", timeout: 30000 });
      await runCommand(page, "europa", "Solar Explorer: Europa");
      await page.locator(".solar-page").waitFor({ state: "visible", timeout: 30000 });
      await page.locator(".solar-panel--details h3", { hasText: "Europa" }).waitFor({ state: "visible" });

      await page.goto(`${baseUrl}/images`, { waitUntil: "domcontentloaded" });
      await page.locator(".im-home").waitFor({ state: "visible", timeout: 30000 });
      await runCommand(page, "andromeda", "Andromeda Galaxy");
      await page.locator(".ex-root").waitFor({ state: "visible", timeout: 30000 });
      await page.locator(".ex-panel h2", { hasText: "Andromeda Galaxy" }).waitFor({ state: "visible" });
      await page.locator(".ex-facts", { hasText: "million ly" }).waitFor({ state: "visible" });
      await page.locator(".ex-routes", { hasText: "Triangulum Galaxy" }).waitFor({ state: "visible" });
      await page.goto(`${baseUrl}/skymap?classic=1&object=${encodeURIComponent("deep:galaxy:andromeda-galaxy")}`, { waitUntil: "domcontentloaded" });
      await page.locator(".skymap-page").waitFor({ state: "visible", timeout: 30000 });

      const skyMapSearch = page.getByRole("searchbox", { name: "Object search" });
      await skyMapSearch.fill("Draco");
      await page.getByRole("option", { name: /^Draco 266/ }).click();
      await page.waitForURL(`${baseUrl}/skymap?classic=1&object=${encodeURIComponent("deep:galaxy:lvdb-draco-1")}`);
      await page.locator(".skymap-panel--object h2", { hasText: "Draco" }).waitFor({ state: "visible" });
      await skyMapSearch.fill("Andromeda");
      await page.getByRole("option", { name: /^Andromeda Galaxy/ }).click();
      await page.waitForURL(`${baseUrl}/skymap?classic=1&object=${encodeURIComponent("deep:galaxy:andromeda-galaxy")}`);
      await page.goBack();
      await page.locator(".skymap-panel--object h2", { hasText: "Draco" }).waitFor({ state: "visible" });
      await page.goForward();
      await page.locator(".skymap-panel--object h2", { hasText: "Andromeda Galaxy" }).waitFor({ state: "visible" });

      await page.locator(".skymap-imagery-card").getByRole("button", { name: "Open in Viewer" }).click();
      await page.locator(".viewer-page").waitFor({ state: "visible", timeout: 30000 });
      await page.locator(".info-panel h3", { hasText: "Andromeda Galaxy" }).waitFor({ state: "visible" });
      await page.getByRole("button", { name: /^Back/ }).first().click();
      await page.locator(".results").waitFor({ state: "visible", timeout: 30000 });
      await page.locator(".result-card", { hasText: "Andromeda Galaxy" }).waitFor({ state: "visible" });

      await page.goto(`${baseUrl}/images`, { waitUntil: "domcontentloaded" });
      await page.locator(".im-home").waitFor({ state: "visible", timeout: 30000 });
      await runCommand(page, "sky atlas mars", "Sky Atlas: Mars");
      await page.locator(".skymap-page").waitFor({ state: "visible", timeout: 30000 });
      await page.locator(".skymap-panel--object h2", { hasText: "Mars" }).waitFor({ state: "visible" });
      await page.locator(".skymap-object-dossier", { hasText: "Ephemeris bridge" }).waitFor({ state: "visible" });
      await page.locator(".skymap-object-dossier", { hasText: "Focus in viewport" }).waitFor({ state: "visible" });
      await page.locator(".skymap-object-dossier", { hasText: "Open in Solar Explorer" }).waitFor({ state: "visible" });
      await page.locator(".skymap-object-identity", { hasText: "shared vsop87 provider" }).waitFor({ state: "visible" });
      await page.locator(".skymap-related", { hasText: "orbits Sun" }).waitFor({ state: "visible" });
      await page.locator("#skymap-time-date").fill("2030-05-05");
      await page.locator(".skymap-panel--object").getByRole("button", { name: "Open in Solar Explorer" }).click();
      await page.locator(".solar-page").waitFor({ state: "visible", timeout: 30000 });
      await page.locator(".solar-panel--details h3", { hasText: "Mars" }).waitFor({ state: "visible" });
      await page.locator(".solar-date__value", { hasText: "2030" }).waitFor({ state: "visible" });
    },
  },
];

const mobileChecks = [
  {
    name: "mobile-explore",
    run: async (page) => {
      await page.goto(`${baseUrl}/explore`, { waitUntil: "domcontentloaded" });
      await page.locator(".ex-viewport canvas").waitFor({ state: "visible", timeout: 30000 });
      await assertNoHorizontalOverflow(page, "mobile explore");
      const search = page.getByRole("combobox").locator("input");
      await search.fill("Jupiter");
      await search.press("Enter");
      await page.locator(".ex-panel h2", { hasText: "Jupiter" }).waitFor({ state: "visible", timeout: 15000 });
      await assertNoHorizontalOverflow(page, "mobile explore panel");
    },
  },
  {
    name: "mobile-home",
    run: async (page) => {
      await page.goto(`${baseUrl}/archive`, { waitUntil: "domcontentloaded" });
      await page.locator(".im-home").waitFor({ state: "visible", timeout: 30000 });
      await page.locator(".sv-tabbar").waitFor({ state: "visible" });
      await assertNoHorizontalOverflow(page, "mobile images");
      const homeSearch = page.getByLabel("Search missions, targets, or objects");
      await homeSearch.fill("eu");
      await page.locator(".search-bar__suggestion-item", { hasText: "Fly to Europa" }).waitFor({ state: "visible" });
      await assertNoHorizontalOverflow(page, "mobile images suggestions");
      await homeSearch.press("Escape");
      await page.locator(".sv-tabbar").getByRole("button", { name: "Find" }).click();
      const input = page.getByRole("combobox", { name: "Find a place, photograph, moment or tool" });
      await input.fill("Halley");
      await page.locator('.sv-find__item[aria-selected="true"]', { hasText: "Halley's Comet" }).waitFor({ state: "visible" });
      await assertNoHorizontalOverflow(page, "mobile find");
      await input.press("Escape");
    },
  },
  {
    name: "mobile-gallery",
    run: async (page) => {
      await page.goto(`${baseUrl}/images?saved=1`, { waitUntil: "domcontentloaded" });
      await page.locator(".rs").waitFor({ state: "visible", timeout: 30000 });
      await page.locator(".rs-head h1", { hasText: "Your saved photographs" }).waitFor({ state: "visible" });
      await page.locator(".result-card").first().waitFor({ state: "visible" });
      await page.getByRole("button", { name: /Timeline & sources/ }).click();
      const researchBrief = page.locator(".results__research-brief");
      await researchBrief.locator("div", { hasText: "Local collection" }).first().waitFor({ state: "visible" });
      await researchBrief.locator("div", { hasText: "Rich 2" }).first().waitFor({ state: "visible" });
      const collectionTray = page.locator(".results__collection-tray", { hasText: "WORKING COLLECTION" });
      await collectionTray.locator(".results__collection-stats", { hasText: "2 visible now" }).waitFor({ state: "visible" });
      await assertNoHorizontalOverflow(page, "mobile gallery");
    },
  },
  {
    name: "mobile-viewer",
    run: async (page) => {
      await page.goto(`${baseUrl}/viewer/${encodeURIComponent(smokeImage.id)}`, { waitUntil: "domcontentloaded" });
      await page.locator(".vw").waitFor({ state: "visible", timeout: 30000 });
      await page.locator(".viewer__image-stage img").waitFor({ state: "visible" });
      await page.locator(".info-panel").waitFor({ state: "visible" });
      await page.locator(".sv-tabbar").waitFor({ state: "visible" });
      await assertNoHorizontalOverflow(page, "mobile viewer");
    },
  },
  {
    name: "mobile-solar",
    run: async (page) => {
      await page.goto(`${baseUrl}/solar?object=overview&mode=ecliptic&scale=realistic`, {
        waitUntil: "domcontentloaded",
      });
      await page.locator(".solar-page").waitFor({ state: "visible", timeout: 30000 });
      await page.locator(".sv-bar .sv-brand").waitFor({ state: "visible" });
      await waitForVisibleCanvas(page, ".solar-page canvas", "Mobile Solar Explorer");
      await page.locator("#astro-quality-tier").waitFor({ state: "attached" });
      await page.locator(".cosmic-journey__quality-status", { hasText: /^(Auto|Manual override)/ }).waitFor({
        state: "attached",
      });
      const panelDock = page.locator(".solar-panel-dock");
      await panelDock.waitFor({ state: "visible" });
      await page.locator(".solar-topbar").waitFor({ state: "detached" });
      await panelDock.getByRole("button", { name: "Tools" }).click();
      await page.locator(".solar-topbar").waitFor({ state: "visible" });
      await page.getByRole("button", { name: "Controls" }).click();
      await page.locator(".solar-tools__menu").waitFor({ state: "visible" });
      await panelDock.getByRole("button", { name: "Mission" }).click();
      await page.locator(".solar-mission-control", { hasText: "System overview" }).waitFor({ state: "visible" });
      const mobileScaleControl = page.getByRole("group", { name: "Solar scale model" });
      if ((await mobileScaleControl.getByRole("button", { name: "True AU" }).getAttribute("aria-pressed")) !== "true") {
        throw new Error("Mobile Solar did not restore the True-AU scale route");
      }
      await page.locator(".solar-mission-control__scale-note", { hasText: "remain exaggerated" }).waitFor({
        state: "visible",
      });
      await page.locator(".solar-scale-legend").waitFor({ state: "detached" });
      await panelDock.getByRole("button", { name: "Hide all Solar panels" }).click();
      await page.locator(".solar-mission-control").waitFor({ state: "detached" });
      await page.locator(".solar-timeline").waitFor({ state: "detached" });
      await page.locator(".solar-panel-dock.is-collapsed").waitFor({ state: "visible" });
      await page.locator(".solar-panel-dock__status", { hasText: "Clean map" }).waitFor({ state: "visible" });
      await assertNoHorizontalOverflow(page, "mobile solar");
      await runCommand(page, "mars", "Mars");
      await page.locator(".solar-panel--details h3", { hasText: "Mars" }).waitFor({ state: "visible" });
      await page.locator(".solar-mission-control", { hasText: "Mars" }).waitFor({ state: "visible" });
      await page.locator(".solar-topbar").waitFor({ state: "detached" });
      await page.locator(".solar-timeline").waitFor({ state: "detached" });
      await page.locator(".solar-panel-dock.is-collapsed").waitFor({ state: "detached" });
      const missionPressed = await panelDock.getByRole("button", { name: "Mission" }).getAttribute("aria-pressed");
      const toolsPressed = await panelDock.getByRole("button", { name: "Tools" }).getAttribute("aria-pressed");
      if (missionPressed !== "true" || toolsPressed !== "false") {
        throw new Error(`Mobile Solar command recovery opened the wrong panels: mission=${missionPressed} tools=${toolsPressed}`);
      }
      await assertNoHorizontalOverflow(page, "mobile solar command recovery");
      await assertNoViewportOverlap(
        page,
        ".solar-features.has-context-details",
        ".solar-mission-control",
        "mobile solar command recovery",
      );
      await page.locator(".solar-panel-dock.is-collapsed").waitFor({ state: "detached" });
      await panelDock.getByRole("button", { name: "Restore default Solar panel layout" }).click();
      await page.locator(".solar-timeline").waitFor({ state: "visible" });
      await runCommand(page, "venus", "Venus");
      await page.locator(".solar-panel--details h3", { hasText: "Venus" }).waitFor({ state: "visible" });
      await page.locator(".solar-mission-control", { hasText: "Venus" }).waitFor({ state: "visible" });
      await page.locator(".solar-topbar").waitFor({ state: "detached" });
      await page.locator(".solar-timeline").waitFor({ state: "detached" });
      await assertNoViewportOverlap(
        page,
        ".solar-features.has-context-details",
        ".solar-mission-control",
        "mobile solar default command recovery",
      );
    },
  },
  {
    name: "mobile-skymap",
    run: async (page) => {
      await page.goto(`${baseUrl}/skymap?classic=1`, { waitUntil: "domcontentloaded" });
      await page.locator(".skymap-page").waitFor({ state: "visible", timeout: 30000 });
      await page.locator(".sv-bar .sv-brand").waitFor({ state: "visible" });
      await page.locator(".sv-bar__actions").waitFor({ state: "visible" });
      await waitForVisibleCanvas(page, ".skymap-viewport canvas", "Mobile SkyMap");
      await page.locator("#astro-quality-tier").waitFor({ state: "attached" });
      await page.locator(".skymap-topbar").waitFor({ state: "visible" });
      await page.locator(".skymap-status-strip").waitFor({ state: "visible" });
      await page.locator(".skymap-orientation-inset", { hasText: "Orientation" }).waitFor({ state: "hidden" });
      await page.locator(".skymap-scale-ruler", { hasText: "Staged scale ruler" }).waitFor({ state: "hidden" });
      await page.getByRole("button", { name: "Settings" }).click();
      const constellationRow = page.locator(".skymap-layer-row", { hasText: "Constellation boundaries" });
      await constellationRow.locator(".skymap-layer-row__toggle").click();
      await constellationRow.locator("strong", { hasText: "Visible" }).waitFor({ state: "visible" });
      await page.waitForFunction(
        () => window.__SPACEVIEWER_PERF__?.skymap?.diagnostics?.lines === 1,
        null,
        { timeout: 10000 },
      );
      await page.getByLabel("Object search").fill("Milky Way structure model");
      await page.locator(".skymap-search-result", { hasText: "Milky Way structure model" }).first().click();
      await page.locator(".skymap-viewport__milky-way-status", {
        hasText: "199 measured masers · 7 arm fits · uncertainty spans",
      }).waitFor({ state: "visible", timeout: 10000 });
      await page.locator(".skymap-panel--object", { hasText: "199 VLBI maser sources" }).waitFor({
        state: "visible",
      });
      await page.locator(".skymap-viewport__exoplanet-status", {
        hasText: "1,568 confirmed planets · 1,056 systems · 12/12 ICRS sectors",
      }).waitFor({ state: "visible", timeout: 15000 });
      await page.locator(".skymap-viewport__openngc-status", {
        hasText: "3,004 selected objects · 12/12 J2000 sectors · angular shell",
      }).waitFor({ state: "visible", timeout: 15000 });
      await page.getByLabel("Object search").fill("M42");
      await page.locator(".skymap-search-result", { hasText: "Orion Nebula" }).first().click();
      await page.locator(".skymap-panel--object", { hasText: "Not supplied · angular catalogue" }).waitFor({ state: "visible" });
      await page.getByLabel("Object search").fill("TRAPPIST-1 e");
      await page.locator(".skymap-search-result", { hasText: "TRAPPIST-1 system" }).first().click();
      await page.locator(".skymap-panel--object", { hasText: "TRAPPIST-1 h" }).waitFor({ state: "visible" });
      await page.locator(".skymap-panel--object", { hasText: "not a completeness-limited occurrence-rate sample" }).waitFor({ state: "visible" });
      await page.getByLabel("Object search").fill("DESI DR1 measured galaxy light cone");
      await page.locator(".skymap-search-result", { hasText: "DESI DR1 measured galaxy light cone" }).first().click();
      await page.locator(".skymap-viewport__desi-status", { hasText: "22,648 measured galaxies" }).waitFor({
        state: "visible",
        timeout: 10000,
      });
      await page.locator(".skymap-viewport__desi-status", { hasText: "no inferred links" }).waitFor({ state: "visible" });
      await page.locator(".skymap-panel--object", { hasText: "22,648 DESI DR1 sources" }).waitFor({
        state: "visible",
      });
      await assertNoHorizontalOverflow(page, "mobile skymap");
    },
  },
];

const runChecks = async (context, checkList, labelPrefix = "") => {
  for (const check of checkList) {
    const { page, issues, name } = await createPage(context, check.name);
    await check.run(page);
    await maybeScreenshot(page, `${labelPrefix}${name}`);
    failOnRuntimeIssues(issues, name);
    await page.close();
    console.log(`✓ ${name}`);
  }
};

const runSolarColdLoadChecks = async (browser) => {
  for (let attempt = 1; attempt <= solarColdLoadAttempts; attempt += 1) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 940 },
      deviceScaleFactor: 1,
    });
    await context.addInitScript(seedStorageScript, { image: smokeImage, companion: companionImage });
    await context.addInitScript(resetSolarPanelStorageScript);

    const name = `solar-cold-load-${attempt}`;
    const { page, issues } = await createPage(context, name);
    try {
      await page.goto(`${baseUrl}/solar`, { waitUntil: "domcontentloaded" });
      await page.locator(".solar-page").waitFor({ state: "visible", timeout: 30000 });
      await waitForVisibleCanvas(page, ".solar-page canvas", `Solar cold load ${attempt}`);
      await page.locator(".solar-panel-dock__status", { hasText: "2/6" }).waitFor({ state: "visible" });
      await page.locator(".solar-panel-dock__status", { hasText: "Default" }).waitFor({ state: "visible" });
      await page.locator(".solar-topbar").waitFor({ state: "visible" });
      await page.locator(".solar-timeline").waitFor({ state: "visible" });
      await page.locator(".solar-event-rail").waitFor({ state: "detached" });
      await assertSolarTextureHealth(page, `Solar cold load ${attempt}`);
      await assertNoHighDetailSolarTextureRequests(page, `Solar cold load ${attempt}`);
      await assertSolarBootTextureBudget(page, `Solar cold load ${attempt}`);
      failOnRuntimeIssues(issues, name);
      console.log(`✓ ${name}`);
    } finally {
      await page.close();
      await context.close();
    }
  }
};

const runSolarMobileColdLoadChecks = async (browser) => {
  for (let attempt = 1; attempt <= solarMobileColdLoadAttempts; attempt += 1) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    await context.addInitScript(seedStorageScript, { image: smokeImage, companion: companionImage });
    await context.addInitScript(resetSolarPanelStorageScript);

    const name = `mobile-solar-cold-load-${attempt}`;
    const { page, issues } = await createPage(context, name);
    try {
      await page.goto(`${baseUrl}/solar`, { waitUntil: "domcontentloaded" });
      await page.locator(".solar-page").waitFor({ state: "visible", timeout: 30000 });
      await waitForVisibleCanvas(page, ".solar-page canvas", `Mobile Solar cold load ${attempt}`);
      const panelDock = page.locator(".solar-panel-dock");
      await panelDock.waitFor({ state: "visible" });
      await panelDock.getByRole("button", { name: "Time" }).waitFor({ state: "visible" });
      const timePressed = await panelDock.getByRole("button", { name: "Time" }).getAttribute("aria-pressed");
      if (timePressed !== "true") {
        throw new Error(`Mobile Solar cold load ${attempt} did not keep Time active by default`);
      }
      await page.locator(".solar-topbar").waitFor({ state: "detached" });
      await page.locator(".solar-event-rail").waitFor({ state: "detached" });
      await page.locator(".solar-timeline").waitFor({ state: "visible" });
      await assertSolarTextureHealth(page, `Mobile Solar cold load ${attempt}`);
      await assertNoHighDetailSolarTextureRequests(page, `Mobile Solar cold load ${attempt}`);
      await assertNoHorizontalOverflow(page, `mobile solar cold load ${attempt}`);
      failOnRuntimeIssues(issues, name);
      console.log(`✓ ${name}`);
    } finally {
      await page.close();
      await context.close();
    }
  }
};

const runSolarTextureTimeoutCheck = async (browser) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 940 },
    deviceScaleFactor: 1,
  });
  await context.addInitScript(seedStorageScript, { image: smokeImage, companion: companionImage });
  await context.addInitScript(resetSolarPanelStorageScript);
  await context.addInitScript(() => {
    window.__SPACEVIEWER_SOLAR_TEXTURE_TIMEOUT_MS__ = 150;
  });

  const name = "solar-texture-timeout";
  const { page, issues } = await createPage(context, name);
  try {
    await page.route("**/solar-textures/perf/2k_sun.jpg", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 650));
      await route.continue();
    });
    await page.goto(`${baseUrl}/solar`, { waitUntil: "domcontentloaded" });
    await page.locator(".solar-page").waitFor({ state: "visible", timeout: 30000 });
    await waitForVisibleCanvas(page, ".solar-page canvas", "Solar texture timeout fallback");
    await page.locator(".solar-panel-dock__status", { hasText: "Default" }).waitFor({ state: "visible" });
    const textureDiagnostics = await page.waitForFunction(
      () => {
        const entry = window.__SPACEVIEWER_SOLAR_TEXTURES__;
        return entry?.timedOut > 0 ? entry : null;
      },
      null,
      { timeout: 10000 },
    );
    const textureDiagnosticValue = await textureDiagnostics.jsonValue();
    if (textureDiagnosticValue.failed < textureDiagnosticValue.timedOut) {
      throw new Error(`Solar texture timeout was not counted as a failed texture: ${JSON.stringify(textureDiagnosticValue)}`);
    }
    await page.waitForTimeout(700);
    await assertNoHighDetailSolarTextureRequests(page, "Solar texture timeout fallback");
    failOnRuntimeIssues(issues, name);
    console.log(`✓ ${name}`);
  } finally {
    await page.close();
    await context.close();
  }
};

const runSolarEphemerisStreamCheck = async (browser) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 940 },
    deviceScaleFactor: 1,
  });
  await context.addInitScript(seedStorageScript, { image: smokeImage, companion: companionImage });
  await context.addInitScript(resetSolarPanelStorageScript);

  const name = "solar-streamed-ephemeris";
  const { page, issues } = await createPage(context, name);
  const ephemerisRequests = [];
  page.on("request", (request) => {
    if (request.url().includes("/ephemerides/vsop87c/")) ephemerisRequests.push(request.url());
  });
  try {
    await page.route("**/ephemerides/vsop87c/positions-*.svep", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1_200));
      await route.continue();
    });
    await page.goto(`${baseUrl}/solar`, { waitUntil: "domcontentloaded" });
    await page.locator(".solar-page").waitFor({ state: "visible", timeout: 30000 });
    await waitForVisibleCanvas(page, ".solar-page canvas", "Streamed ephemeris boot fallback");
    const ephemerisStatus = page.locator(".solar-panel-dock__ephemeris");
    await ephemerisStatus.locator("strong", { hasText: "Keplerian · loading precision" }).waitFor({
      state: "visible",
      timeout: 10000,
    });
    await page.waitForFunction(
      () => window.__SPACEVIEWER_PERF__?.solar?.diagnostics?.ephemerisModel === "keplerian-boot",
      null,
      { timeout: 10000 },
    );
    const panelDock = page.locator(".solar-panel-dock", { hasText: "Panels" });
    await panelDock.getByRole("button", { name: "Mission" }).click();
    await page.locator(".solar-mission-control", { hasText: "System overview" }).waitFor({ state: "visible" });

    await ephemerisStatus.locator("strong", { hasText: "VSOP87C" }).waitFor({ state: "visible", timeout: 10000 });
    await page.waitForFunction(
      () => window.__SPACEVIEWER_PERF__?.solar?.diagnostics?.ephemerisModel === "vsop87c-streamed-float64",
      null,
      { timeout: 10000 },
    );
    const diagnostics = await page.evaluate(() => window.__SPACEVIEWER_PERF__?.solar?.diagnostics);
    if (!diagnostics || diagnostics.ephemerisTransferredBytes <= 0 || diagnostics.ephemerisTransferredBytes >= 200_000) {
      throw new Error(`Streamed ephemeris transfer budget was invalid: ${JSON.stringify(diagnostics)}`);
    }
    const expectedYear = new Date().getUTCFullYear();
    const positionRequests = ephemerisRequests.filter((url) => url.endsWith(".svep") && url.includes("positions-"));
    const orbitRequests = ephemerisRequests.filter((url) => url.endsWith("representative-orbits.svep"));
    if (
      ephemerisRequests.filter((url) => url.endsWith("manifest.json")).length !== 1 ||
      positionRequests.length !== 1 ||
      !positionRequests[0].endsWith(`positions-${expectedYear}.svep`) ||
      orbitRequests.length !== 1
    ) {
      throw new Error(`Unexpected streamed ephemeris request set: ${JSON.stringify(ephemerisRequests)}`);
    }
    const loadedResources = await page.evaluate(() => performance.getEntriesByType("resource").map((entry) => entry.name));
    if (loadedResources.some((url) => /(?:^|[-/])vsop87(?:[-/.]|$)/i.test(url) && url.endsWith(".js"))) {
      throw new Error(`Runtime still requested a VSOP87 JavaScript bundle: ${JSON.stringify(loadedResources)}`);
    }
    failOnRuntimeIssues(issues, name);
    console.log(`✓ ${name}`);
  } finally {
    await page.close();
    await context.close();
  }
};

await assertBackendHealth();

const browser = await chromium.launch({
  headless: !headed,
  executablePath: chromePath,
});

try {
  const selectedDesktopChecks = onlyCheckName ? checks.filter((check) => check.name === onlyCheckName) : checks;
  const selectedMobileChecks = onlyCheckName ? mobileChecks.filter((check) => check.name === onlyCheckName) : mobileChecks;
  if (onlyCheckName && selectedDesktopChecks.length === 0 && selectedMobileChecks.length === 0) {
    throw new Error(`Unknown smoke check: ${onlyCheckName}`);
  }

  if (selectedDesktopChecks.length) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 1,
    });
    await context.addInitScript(seedStorageScript, { image: smokeImage, companion: companionImage });
    await runChecks(context, selectedDesktopChecks);
    await context.close();
  }

  if (selectedMobileChecks.length) {
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    await mobileContext.addInitScript(seedStorageScript, { image: smokeImage, companion: companionImage });
    await runChecks(mobileContext, selectedMobileChecks, "mobile-");
    await mobileContext.close();
  }

  if (!onlyCheckName) {
    await runSolarTextureTimeoutCheck(browser);
    await runSolarEphemerisStreamCheck(browser);

    if (solarColdLoadAttempts > 0) {
      await runSolarColdLoadChecks(browser);
    }
    if (solarMobileColdLoadAttempts > 0) {
      await runSolarMobileColdLoadChecks(browser);
    }
  }
} finally {
  await browser.close();
}

console.log(`SpaceViewer smoke checks passed for ${baseUrl}`);
