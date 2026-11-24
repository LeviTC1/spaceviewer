import type { SpaceImage } from "../models/SpaceImage";

export interface SessionMemory {
  searches: Record<string, number>;
  viewedCategories: Record<string, number>;
  savedTypes: Record<string, number>;
  viewedImages: RecentImage[];
}

export interface RecentImage {
  id: string;
  nasaId?: string;
  source?: string;
  title: string;
  imageUrl: string;
  thumbnailUrl?: string;
  keywords?: string[];
  date: string;
  center?: string;
  mission?: string;
  instrument?: string;
  viewedAt: string;
}

const STORAGE_KEY = "spaceviewer.sessionMemory";
const MAX_ITEMS = 12;
const MAX_VIEWED_IMAGES = 8;

const emptyMemory = (): SessionMemory => ({ searches: {}, viewedCategories: {}, savedTypes: {}, viewedImages: [] });

const loadMemory = (): SessionMemory => {
  if (typeof window === "undefined") {
    return emptyMemory();
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyMemory();
    const parsed = JSON.parse(raw) as SessionMemory;
    return {
      searches: parsed.searches ?? {},
      viewedCategories: parsed.viewedCategories ?? {},
      savedTypes: parsed.savedTypes ?? {},
      viewedImages: Array.isArray(parsed.viewedImages)
        ? parsed.viewedImages.filter((item) => typeof item?.id === "string" && typeof item?.title === "string")
        : [],
    };
  } catch (error) {
    console.warn("Unable to read session memory", error);
    return emptyMemory();
  }
};

const saveMemory = (memory: SessionMemory) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch (error) {
    console.warn("Unable to save session memory", error);
  }
};

const bump = (record: Record<string, number>, key: string) => {
  if (!key) return;
  record[key] = (record[key] ?? 0) + 1;
  const sorted = Object.entries(record)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_ITEMS);
  Object.keys(record).forEach((item) => {
    if (!sorted.find(([key]) => key === item)) {
      delete record[item];
    }
  });
};

export const recordSearch = (query: string) => {
  const trimmed = query.trim();
  if (!trimmed) return;
  const memory = loadMemory();
  bump(memory.searches, trimmed);
  saveMemory(memory);
};

export const recordView = (image: SpaceImage) => {
  const memory = loadMemory();
  const category = image.mission || image.instrument || image.center || "NASA Image Library";
  bump(memory.viewedCategories, category);
  const imageKey = image.nasaId ?? image.id;
  const recentImage: RecentImage = {
    id: image.id,
    nasaId: image.nasaId,
    source: image.source,
    title: image.title,
    imageUrl: image.imageUrl,
    thumbnailUrl: image.thumbnailUrl,
    keywords: Array.isArray(image.keywords) ? image.keywords.slice(0, 12) : [],
    date: image.date,
    center: image.center,
    mission: image.mission,
    instrument: image.instrument,
    viewedAt: new Date().toISOString(),
  };
  memory.viewedImages = [
    recentImage,
    ...memory.viewedImages.filter((item) => (item.nasaId ?? item.id) !== imageKey),
  ].slice(0, MAX_VIEWED_IMAGES);
  saveMemory(memory);
};

export const recordSavedType = (type: string) => {
  const memory = loadMemory();
  bump(memory.savedTypes, type);
  saveMemory(memory);
};

export const getTopItems = (record: Record<string, number>, limit = 3) =>
  Object.entries(record)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => key);

export const getSessionMemory = () => loadMemory();

/** Forget searches and viewing history (saved items, notes and bookmarks are untouched). */
export const clearSessionHistory = () => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem("spaceviewer.recentSearches");
    window.localStorage.removeItem("spaceviewer.recentPlaces.v1");
  } catch (error) {
    console.warn("Unable to clear session memory", error);
  }
};

// Recently visited places in the universe (written by the explorer, read by Your sky and Find).
export interface RecentPlace {
  id: string;
  name: string;
  category: string;
  href: string;
  at: number;
}
const RECENT_PLACES_KEY = "spaceviewer.recentPlaces.v1";
export const readRecentPlaces = (): RecentPlace[] => {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_PLACES_KEY) ?? "[]") as RecentPlace[];
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item?.id === "string" && typeof item?.name === "string") : [];
  } catch {
    return [];
  }
};
export const recordRecentPlace = (place: Omit<RecentPlace, "at">) => {
  if (typeof window === "undefined") return;
  try {
    const next = [{ ...place, at: Date.now() }, ...readRecentPlaces().filter((item) => item.id !== place.id)].slice(0, 12);
    window.localStorage.setItem(RECENT_PLACES_KEY, JSON.stringify(next));
  } catch {
    // best effort
  }
};
