import type { SpaceImage } from "../models/SpaceImage";

type NasaData = Record<string, unknown>;

type NasaLink = {
  href?: unknown;
  render?: unknown;
} & Record<string, unknown>;

export type NasaItem = {
  data?: NasaData[];
  links?: NasaLink[];
} & Record<string, unknown>;

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

const normalizeKeywords = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => (typeof entry === "string" ? entry.trim() : String(entry))).filter(Boolean);
};

const buildFallbackId = () => {
  if (typeof globalThis !== "undefined" && "crypto" in globalThis) {
    const cryptoObj = globalThis.crypto as Crypto;
    if (typeof cryptoObj.randomUUID === "function") {
      return cryptoObj.randomUUID();
    }
  }

  return `nasa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

export const mapNasaItem = (item: NasaItem): SpaceImage => {
  const data = Array.isArray(item?.data) ? (item.data[0] ?? {}) : {};
  const links = Array.isArray(item?.links) ? (item.links[0] ?? {}) : {};

  const nasaId = isNonEmptyString(data.nasa_id) ? data.nasa_id : undefined;
  const titleFromData = isNonEmptyString(data.title) ? data.title : "";
  const title = titleFromData || nasaId || "Untitled";
  const description = isNonEmptyString(data.description) ? data.description : "";
  const keywords = normalizeKeywords(data.keywords);
  const dateCreated = isNonEmptyString(data.date_created) ? data.date_created : "";
  const date = dateCreated ? dateCreated.slice(0, 10) : "Unknown";
  const center = isNonEmptyString(data.center) ? data.center : undefined;
  const mission = isNonEmptyString(data.mission) ? data.mission : undefined;
  const instrument = isNonEmptyString(data.instrument) ? data.instrument : undefined;
  const photographer = isNonEmptyString(data.photographer) ? data.photographer : undefined;

  const linkHref = isNonEmptyString(links.href) ? links.href : "";
  const renderHint = isNonEmptyString(links.render) ? links.render : "";

  const imageUrl = linkHref || (nasaId ? `https://images-api.nasa.gov/asset/${nasaId}` : "");
  const thumbnailUrl = renderHint === "image" ? linkHref : linkHref || undefined;

  const id = nasaId || titleFromData || buildFallbackId();

  return {
    id,
    nasaId,
    source: "nasa",
    title,
    description,
    keywords,
    date,
    center,
    mission,
    instrument,
    photographer,
    imageUrl,
    thumbnailUrl,
    archiveUrl: nasaId ? `https://images.nasa.gov/details/${nasaId}` : undefined,
    raw: item,
  };
};
