import type { SpaceImage } from "../models/SpaceImage";

export interface SessionMemory {
  searches: Record<string, number>;
  viewedCategories: Record<string, number>;
  savedTypes: Record<string, number>;
}

const STORAGE_KEY = "spaceviewer.sessionMemory";
const MAX_ITEMS = 12;

const loadMemory = (): SessionMemory => {
  if (typeof window === "undefined") {
    return { searches: {}, viewedCategories: {}, savedTypes: {} };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { searches: {}, viewedCategories: {}, savedTypes: {} };
    const parsed = JSON.parse(raw) as SessionMemory;
    return {
      searches: parsed.searches ?? {},
      viewedCategories: parsed.viewedCategories ?? {},
      savedTypes: parsed.savedTypes ?? {},
    };
  } catch (error) {
    console.warn("Unable to read session memory", error);
    return { searches: {}, viewedCategories: {}, savedTypes: {} };
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
