import type { SpaceImage } from "../models/SpaceImage";
import { mapNasaItem, type NasaItem } from "./mapNasaItem";
import { buildMetadataQuality } from "./metadataQuality";

export interface SdssItem {
  id: string;
  title: string;
  description: string;
  ra: number;
  dec: number;
  imageUrl: string;
  fullRes: string;
  archiveUrl: string;
  source: "SDSS";
  keywords?: string[];
  matchReason?: string;
}

export interface Ps1Item {
  id: string;
  title: string;
  description: string;
  ra: number;
  dec: number;
  imageUrl: string;
  fullRes: string;
  archiveUrl: string;
  source: "Pan-STARRS";
  keywords?: string[];
  matchReason?: string;
}

export type SearchResult =
  | { source: "nasa"; item: NasaItem; matchReason?: string }
  | { source: "sdss"; item: SdssItem; matchReason?: string }
  | { source: "ps1"; item: Ps1Item; matchReason?: string };

const normalizeKeywords = (keywords?: string[]) => (Array.isArray(keywords) ? keywords.filter(Boolean) : []);

const mapSdssItem = (item: SdssItem, matchReason?: string): SpaceImage => {
  const image: SpaceImage = {
    id: item.id,
    source: "sdss",
    archiveId: item.id,
    sourceUrl: item.archiveUrl,
    matchReason: matchReason ?? item.matchReason ?? `Resolved sky coordinates for this SDSS cutout.`,
    title: item.title,
    description: item.description ?? "",
    keywords: normalizeKeywords(item.keywords),
    date: "Unknown",
    mission: "SDSS",
    center: "Sloan Digital Sky Survey",
    dimensions: {
      width: 640,
      height: 640,
      scaleArcsecPerPixel: 0.3,
      unit: "arcsec/pixel",
    },
    imageUrl: item.imageUrl,
    fullRes: item.fullRes,
    thumbnailUrl: item.imageUrl,
    archiveUrl: item.archiveUrl,
    raw: item,
  };
  return {
    ...image,
    metadataQuality: buildMetadataQuality(image),
  };
};

const mapPs1Item = (item: Ps1Item, matchReason?: string): SpaceImage => {
  const image: SpaceImage = {
    id: item.id,
    source: "ps1",
    archiveId: item.id,
    sourceUrl: item.archiveUrl,
    matchReason: matchReason ?? item.matchReason ?? `Resolved sky coordinates for this Pan-STARRS cutout.`,
    title: item.title,
    description: item.description ?? "",
    keywords: normalizeKeywords(item.keywords),
    date: "Unknown",
    mission: "Pan-STARRS",
    center: "Pan-STARRS",
    dimensions: {
      width: 640,
      height: 640,
      unit: "pixels",
    },
    imageUrl: item.imageUrl,
    fullRes: item.fullRes,
    thumbnailUrl: item.imageUrl,
    archiveUrl: item.archiveUrl,
    raw: item,
  };
  return {
    ...image,
    metadataQuality: buildMetadataQuality(image),
  };
};

export const mapSearchItem = (result: SearchResult): SpaceImage => {
  switch (result.source) {
    case "sdss":
      return mapSdssItem(result.item as SdssItem, result.matchReason);
    case "ps1":
      return mapPs1Item(result.item as Ps1Item, result.matchReason);
    case "nasa":
    default:
      return mapNasaItem(result.item as NasaItem, result.matchReason);
  }
};
