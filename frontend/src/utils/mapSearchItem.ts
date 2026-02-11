import type { SpaceImage } from "../models/SpaceImage";
import { mapNasaItem, type NasaItem } from "./mapNasaItem";

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
}

export type SearchResult =
  | { source: "nasa"; item: NasaItem }
  | { source: "sdss"; item: SdssItem }
  | { source: "ps1"; item: Ps1Item };

const normalizeKeywords = (keywords?: string[]) => (Array.isArray(keywords) ? keywords.filter(Boolean) : []);

const mapSdssItem = (item: SdssItem): SpaceImage => {
  return {
    id: item.id,
    source: "sdss",
    title: item.title,
    description: item.description ?? "",
    keywords: normalizeKeywords(item.keywords),
    date: "Unknown",
    mission: "SDSS",
    center: "Sloan Digital Sky Survey",
    imageUrl: item.imageUrl,
    fullRes: item.fullRes,
    thumbnailUrl: item.imageUrl,
    archiveUrl: item.archiveUrl,
    raw: item,
  };
};

const mapPs1Item = (item: Ps1Item): SpaceImage => {
  return {
    id: item.id,
    source: "ps1",
    title: item.title,
    description: item.description ?? "",
    keywords: normalizeKeywords(item.keywords),
    date: "Unknown",
    mission: "Pan-STARRS",
    center: "Pan-STARRS",
    imageUrl: item.imageUrl,
    fullRes: item.fullRes,
    thumbnailUrl: item.imageUrl,
    archiveUrl: item.archiveUrl,
    raw: item,
  };
};

export const mapSearchItem = (result: SearchResult): SpaceImage => {
  switch (result.source) {
    case "sdss":
      return mapSdssItem(result.item as SdssItem);
    case "ps1":
      return mapPs1Item(result.item as Ps1Item);
    case "nasa":
    default:
      return mapNasaItem(result.item as NasaItem);
  }
};
