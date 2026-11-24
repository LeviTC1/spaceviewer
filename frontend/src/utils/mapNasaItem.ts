import type { SpaceImage } from "../models/SpaceImage";
import { buildMetadataQuality } from "./metadataQuality";

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

const readPositiveNumber = (value: unknown) => {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

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

export const mapNasaItem = (item: NasaItem, matchReason?: string): SpaceImage => {
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
  const archiveUrl = nasaId ? `https://images.nasa.gov/details/${nasaId}` : undefined;
  const dimensions = {
    width: readPositiveNumber(data.width ?? data.image_width),
    height: readPositiveNumber(data.height ?? data.image_height),
    unit: "pixels",
  };
  const normalizedDimensions = dimensions.width && dimensions.height ? dimensions : undefined;
  const normalizedMatchReason =
    matchReason ??
    (keywords.length
      ? `NASA metadata includes keywords: ${keywords.slice(0, 3).join(", ")}.`
      : description
        ? "NASA title or description matched the image search."
        : "NASA Image Library returned this record for the search.");

  const image: SpaceImage = {
    id,
    nasaId,
    source: "nasa",
    archiveId: nasaId,
    sourceUrl: archiveUrl,
    matchReason: normalizedMatchReason,
    dimensions: normalizedDimensions,
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
    archiveUrl,
    raw: item,
  };

  return {
    ...image,
    metadataQuality: buildMetadataQuality(image),
  };
};
