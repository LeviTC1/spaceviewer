import type { SpaceImage } from "../models/SpaceImage";
import { isBlockedCenter } from "./spaceFilter";

export const FALLBACK_MIN_YEAR = 1990;
export const FALLBACK_MAX_YEAR = new Date().getUTCFullYear();

export type ResultsSortMode = "recent" | "oldest" | "title";

export interface YearRange {
  min: number;
  max: number;
}

export interface GalleryResultFilters {
  resultQuery: string;
  sourceFilter: string;
  missionFilter: string;
  yearFilter: string;
  startYear: number;
  endYear: number;
  yearRange: YearRange;
  sortBy: ResultsSortMode;
}

export const sourceLabel = (value: string) => {
  switch (value) {
    case "nasa":
      return "NASA";
    case "sdss":
      return "SDSS";
    case "ps1":
      return "Pan-STARRS";
    case "local":
      return "Local";
    case "skymap":
      return "SkyMap";
    default:
      return value.toUpperCase();
  }
};

export const normalizeText = (value?: string) =>
  (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export const getResultYear = (result: SpaceImage) => {
  const year = result.date?.match(/\d{4}/)?.[0];
  if (!year) return null;
  const parsed = Number(year);
  return Number.isFinite(parsed) ? parsed : null;
};

export const getResultKey = (result: SpaceImage) => `${result.source ?? "nasa"}:${result.nasaId ?? result.id}`;

const formatDimensionUnit = (unit?: string) => {
  if (!unit || unit === "pixels") return "px";
  return unit;
};

export const formatResultDimensions = (dimensions: SpaceImage["dimensions"] | undefined) => {
  if (!dimensions) return "Dimensions pending";
  const unit = formatDimensionUnit(dimensions.unit);
  const hasWidth = typeof dimensions.width === "number" && Number.isFinite(dimensions.width);
  const hasHeight = typeof dimensions.height === "number" && Number.isFinite(dimensions.height);
  const hasScale =
    typeof dimensions.scaleArcsecPerPixel === "number" && Number.isFinite(dimensions.scaleArcsecPerPixel);

  if (hasWidth && hasHeight) {
    const base = `${dimensions.width} x ${dimensions.height} ${unit}`;
    return hasScale ? `${base} · ${dimensions.scaleArcsecPerPixel} arcsec/pixel` : base;
  }
  if (hasWidth) return `${dimensions.width} ${unit} wide`;
  if (hasHeight) return `${dimensions.height} ${unit} tall`;
  if (hasScale) return `${dimensions.scaleArcsecPerPixel} arcsec/pixel`;
  return "Dimensions pending";
};

export const getResultArchiveLabel = (result: SpaceImage) =>
  result.archiveId || result.nasaId || result.id || "Unknown archive id";

export const getResultSourceHost = (result: SpaceImage) => {
  const url = result.sourceUrl || result.archiveUrl || result.fullRes;
  if (!url) return sourceLabel(result.source ?? "nasa");
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return sourceLabel(result.source ?? "nasa");
  }
};

export const getCollectionVisibilityLabel = (
  key: string,
  visibleKeys: ReadonlySet<string>,
  filteredKeys: ReadonlySet<string>,
  resultKeys: ReadonlySet<string>,
) => {
  if (visibleKeys.has(key)) return "Visible now";
  if (filteredKeys.has(key)) return "Below visible fold";
  if (resultKeys.has(key)) return "Filtered out";
  return "Saved only";
};

export const scoreResultQuality = (result: SpaceImage) => {
  let score = 0;
  if (result.imageUrl) score += 5;
  if (result.thumbnailUrl) score += 3;
  if (result.fullRes) score += 4;
  if (result.archiveUrl) score += 2;
  score += Math.min(result.description?.length ?? 0, 500) / 100;
  score += Math.min(result.keywords?.length ?? 0, 8);
  return score;
};

export const buildDedupeKey = (result: SpaceImage) => {
  const source = result.source ?? "nasa";
  const normalizedTitle = normalizeText(result.title);
  const year = getResultYear(result);

  if (source === "nasa" && normalizedTitle && year) {
    return `${source}:${normalizedTitle}:${year}`;
  }

  return `${source}:${result.nasaId ?? result.id}`;
};

export const dedupeResults = (items: SpaceImage[]) => {
  const unique = new Map<string, SpaceImage>();

  items.forEach((item) => {
    const key = buildDedupeKey(item);
    const existing = unique.get(key);
    if (!existing || scoreResultQuality(item) > scoreResultQuality(existing)) {
      unique.set(key, item);
    }
  });

  return Array.from(unique.values());
};

export const getAvailableYearRange = (items: SpaceImage[]): YearRange => {
  const years = items
    .map(getResultYear)
    .filter((year): year is number => year !== null)
    .sort((a, b) => a - b);

  if (!years.length) {
    return { min: FALLBACK_MIN_YEAR, max: FALLBACK_MAX_YEAR };
  }

  return {
    min: years[0],
    max: years[years.length - 1],
  };
};

export const getSourceOptions = (items: SpaceImage[]) => {
  const sources = new Set<string>();
  items.forEach((result) => {
    const source = result.source ?? "nasa";
    if (source) {
      sources.add(source);
    }
  });

  return Array.from(sources).sort((a, b) => sourceLabel(a).localeCompare(sourceLabel(b)));
};

export const getMissionOptions = (items: SpaceImage[]) => {
  const missions = new Set<string>();
  items.forEach((result) => {
    const label = result.mission || result.instrument || result.center;
    if (label) {
      missions.add(label);
    }
  });

  return Array.from(missions)
    .filter((item) => !isBlockedCenter(item))
    .sort((a, b) => a.localeCompare(b));
};

export const getYearOptions = (items: SpaceImage[]) => {
  const years = new Set<string>();
  items.forEach((result) => {
    const year = result.date?.slice(0, 4);
    if (year && /^\d{4}$/.test(year)) {
      years.add(year);
    }
  });

  return Array.from(years).sort((a, b) => Number(b) - Number(a));
};

export const filterAndSortResults = (items: SpaceImage[], filters: GalleryResultFilters) => {
  const { resultQuery, sourceFilter, missionFilter, yearFilter, startYear, endYear, yearRange, sortBy } = filters;
  let filtered = items;
  const query = normalizeText(resultQuery);

  if (query) {
    filtered = filtered.filter((result) => {
      const searchable = normalizeText(
        [
          result.title,
          result.description,
          result.center,
          result.mission,
          result.instrument,
          result.date,
          result.source ? sourceLabel(result.source) : "NASA",
          ...(Array.isArray(result.keywords) ? result.keywords : []),
        ].join(" "),
      );
      return searchable.includes(query);
    });
  }

  if (sourceFilter !== "all") {
    filtered = filtered.filter((result) => (result.source ?? "nasa") === sourceFilter);
  }

  if (missionFilter !== "all") {
    filtered = filtered.filter((result) => {
      const label = result.mission || result.instrument || result.center || "NASA Image Library";
      return label === missionFilter;
    });
  }

  if (yearFilter !== "all") {
    filtered = filtered.filter((result) => result.date?.startsWith(yearFilter));
  }

  filtered = filtered.filter((result) => {
    const yearValue = getResultYear(result);
    if (yearValue === null) {
      return startYear === yearRange.min && endYear === yearRange.max;
    }
    return yearValue >= startYear && yearValue <= endYear;
  });

  const sorted = [...filtered];
  sorted.sort((a, b) => {
    if (sortBy === "title") {
      return a.title.localeCompare(b.title);
    }

    const dateA = Date.parse(a.date ?? "");
    const dateB = Date.parse(b.date ?? "");
    const safeA = Number.isFinite(dateA) ? dateA : 0;
    const safeB = Number.isFinite(dateB) ? dateB : 0;
    return sortBy === "recent" ? safeB - safeA : safeA - safeB;
  });

  return sorted;
};
