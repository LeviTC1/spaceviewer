import { describe, expect, it } from "vitest";
import type { SpaceImage } from "../models/SpaceImage";
import {
  FALLBACK_MAX_YEAR,
  FALLBACK_MIN_YEAR,
  buildDedupeKey,
  dedupeResults,
  filterAndSortResults,
  formatResultDimensions,
  getAvailableYearRange,
  getCollectionVisibilityLabel,
  getResultArchiveLabel,
  getMissionOptions,
  getResultKey,
  getResultSourceHost,
  getSourceOptions,
  getYearOptions,
  sourceLabel,
} from "./galleryResults";

const makeImage = (overrides: Partial<SpaceImage> = {}): SpaceImage => ({
  id: "image-1",
  nasaId: "image-1",
  source: "nasa",
  title: "Carina Nebula",
  description: "A detailed observation of a nebula with bright stars and textured gas.",
  keywords: ["nebula", "stars"],
  date: "2022-07-12",
  center: "STScI",
  mission: "JWST",
  instrument: "NIRCam",
  imageUrl: "https://example.test/preview.jpg",
  thumbnailUrl: "https://example.test/thumb.jpg",
  fullRes: "https://example.test/full.jpg",
  archiveUrl: "https://images.nasa.gov/details/image-1",
  ...overrides,
});

const defaultFilters = (items: SpaceImage[]) => {
  const yearRange = getAvailableYearRange(items);
  return {
    resultQuery: "",
    sourceFilter: "all",
    missionFilter: "all",
    yearFilter: "all",
    startYear: yearRange.min,
    endYear: yearRange.max,
    yearRange,
    sortBy: "recent" as const,
  };
};

describe("gallery result dedupe", () => {
  it("collapses near-identical NASA records by normalized title and year", () => {
    const sparse = makeImage({
      id: "nasa-sparse",
      nasaId: "nasa-sparse",
      title: "Carina Nebula!",
      description: "Short.",
      keywords: [],
      thumbnailUrl: undefined,
      fullRes: undefined,
      archiveUrl: undefined,
    });
    const richer = makeImage({
      id: "nasa-rich",
      nasaId: "nasa-rich",
      title: "Carina   Nebula",
      description:
        "A much richer record of the same nebula observation with source metadata, preview assets, and several useful search keywords.",
      keywords: ["nebula", "stars", "infrared", "jwst"],
      thumbnailUrl: "https://example.test/rich-thumb.jpg",
      fullRes: "https://example.test/rich-full.jpg",
      archiveUrl: "https://images.nasa.gov/details/nasa-rich",
    });
    const differentYear = makeImage({
      id: "nasa-older",
      nasaId: "nasa-older",
      title: "Carina Nebula",
      date: "2010-01-01",
    });
    const surveyCutout = makeImage({
      id: "sdss-carina",
      nasaId: undefined,
      source: "sdss",
      title: "Carina Nebula",
      date: "2022-07-12",
      mission: "SDSS",
    });

    const deduped = dedupeResults([sparse, richer, differentYear, surveyCutout]);

    expect(deduped.map((image) => image.id)).toEqual(["nasa-rich", "nasa-older", "sdss-carina"]);
    expect(buildDedupeKey(sparse)).toBe(buildDedupeKey(richer));
    expect(buildDedupeKey(differentYear)).not.toBe(buildDedupeKey(richer));
    expect(getResultKey(surveyCutout)).toBe("sdss:sdss-carina");
  });
});

describe("gallery year and option helpers", () => {
  it("derives timeline bounds and options from available result dates", () => {
    const items = [
      makeImage({ id: "recent", date: "2025-06-01" }),
      makeImage({ id: "old", date: "1999-01-01" }),
      makeImage({ id: "unknown", date: "Unknown" }),
      makeImage({ id: "middle", date: "2012-03-04" }),
    ];

    expect(getAvailableYearRange(items)).toEqual({ min: 1999, max: 2025 });
    expect(getYearOptions(items)).toEqual(["2025", "2012", "1999"]);
  });

  it("uses fallback timeline bounds when no dated records exist", () => {
    expect(getAvailableYearRange([makeImage({ date: "Unknown" })])).toEqual({
      min: FALLBACK_MIN_YEAR,
      max: FALLBACK_MAX_YEAR,
    });
  });

  it("sorts source options by display label and hides blocked center mission options", () => {
    const items = [
      makeImage({ id: "ps1", source: "ps1", mission: "Pan-STARRS", center: "Pan-STARRS" }),
      makeImage({ id: "nasa", source: "nasa", mission: "JWST", center: "STScI" }),
      makeImage({ id: "sdss", source: "sdss", mission: "SDSS", center: "Sloan Digital Sky Survey" }),
      makeImage({ id: "ksc", mission: undefined, instrument: undefined, center: "Kennedy Space Center" }),
    ];

    expect(getSourceOptions(items)).toEqual(["nasa", "ps1", "sdss"]);
    expect(getMissionOptions(items)).toEqual(["JWST", "Pan-STARRS", "SDSS"]);
  });

  it("formats local and app-derived source labels for Gallery summaries", () => {
    expect(sourceLabel("local")).toBe("Local");
    expect(sourceLabel("skymap")).toBe("SkyMap");
  });

  it("formats card-level archive and dimension cues", () => {
    const image = makeImage({
      archiveId: "archive-42",
      sourceUrl: "https://images.nasa.gov/details/archive-42",
      dimensions: { width: 1200, height: 800, unit: "pixels", scaleArcsecPerPixel: 0.25 },
    });

    expect(getResultArchiveLabel(image)).toBe("archive-42");
    expect(getResultSourceHost(image)).toBe("images.nasa.gov");
    expect(formatResultDimensions(image.dimensions)).toBe("1200 x 800 px · 0.25 arcsec/pixel");
    expect(formatResultDimensions(undefined)).toBe("Dimensions pending");
  });

  it("labels saved collection items by their current Gallery visibility", () => {
    const visibleKeys = new Set(["local:visible"]);
    const filteredKeys = new Set(["local:visible", "local:below-fold"]);
    const resultKeys = new Set(["local:visible", "local:below-fold", "local:filtered"]);

    expect(getCollectionVisibilityLabel("local:visible", visibleKeys, filteredKeys, resultKeys)).toBe("Visible now");
    expect(getCollectionVisibilityLabel("local:below-fold", visibleKeys, filteredKeys, resultKeys)).toBe(
      "Below visible fold",
    );
    expect(getCollectionVisibilityLabel("local:filtered", visibleKeys, filteredKeys, resultKeys)).toBe("Filtered out");
    expect(getCollectionVisibilityLabel("local:saved-only", visibleKeys, filteredKeys, resultKeys)).toBe("Saved only");
  });
});

describe("gallery filtering and sorting", () => {
  const items = [
    makeImage({
      id: "jwst-nebula",
      title: "JWST Carina Nebula",
      description: "Infrared nebula image with young stars.",
      keywords: ["nebula", "infrared"],
      date: "2022-07-12",
      mission: "JWST",
      source: "nasa",
    }),
    makeImage({
      id: "sdss-galaxy",
      nasaId: undefined,
      source: "sdss",
      title: "Andromeda Galaxy Cutout",
      description: "Resolved sky survey cutout.",
      keywords: ["galaxy", "survey"],
      date: "2019-04-21",
      mission: "SDSS",
      center: "Sloan Digital Sky Survey",
    }),
    makeImage({
      id: "ps1-unknown",
      nasaId: undefined,
      source: "ps1",
      title: "Pan-STARRS Candidate",
      description: "Survey image without a normalized observation date.",
      keywords: ["survey"],
      date: "Unknown",
      mission: "Pan-STARRS",
      center: "Pan-STARRS",
    }),
  ];

  it("keeps unknown-date records only while the full timeline range is selected", () => {
    const fullRange = filterAndSortResults(items, defaultFilters(items));
    const narrowed = filterAndSortResults(items, {
      ...defaultFilters(items),
      startYear: 2022,
      endYear: 2022,
    });

    expect(fullRange.map((image) => image.id)).toEqual(["jwst-nebula", "sdss-galaxy", "ps1-unknown"]);
    expect(narrowed.map((image) => image.id)).toEqual(["jwst-nebula"]);
  });

  it("combines search, source, mission, year, and sort filters", () => {
    expect(
      filterAndSortResults(items, {
        ...defaultFilters(items),
        resultQuery: "pan starrs",
      }).map((image) => image.id),
    ).toEqual(["ps1-unknown"]);

    expect(
      filterAndSortResults(items, {
        ...defaultFilters(items),
        sourceFilter: "sdss",
      }).map((image) => image.id),
    ).toEqual(["sdss-galaxy"]);

    expect(
      filterAndSortResults(items, {
        ...defaultFilters(items),
        missionFilter: "JWST",
        yearFilter: "2022",
      }).map((image) => image.id),
    ).toEqual(["jwst-nebula"]);

    expect(
      filterAndSortResults(items, {
        ...defaultFilters(items),
        sortBy: "title",
      }).map((image) => image.id),
    ).toEqual(["sdss-galaxy", "jwst-nebula", "ps1-unknown"]);
  });
});
