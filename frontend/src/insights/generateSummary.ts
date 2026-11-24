import type { SpaceImage } from "../models/SpaceImage";
import { buildSummary } from "../utils/buildSummary";

export type AiMode = "scientific" | "beginner";

const MODE_STORAGE_KEY = "spaceviewer.aiMode";
const SUMMARY_CACHE_PREFIX = "ai_summary_";

const clean = (value?: string) => (value ? value.trim() : "");

const safeRead = (key: string) => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    console.warn("Unable to read localStorage", error);
    return null;
  }
};

const safeWrite = (key: string, value: string) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    console.warn("Unable to write localStorage", error);
  }
};

const loadCachedSummary = (id: string): { scientific?: string; beginner?: string } | null => {
  const raw = safeRead(`${SUMMARY_CACHE_PREFIX}${id}`);
  if (!raw) return null;
  try {
    if (raw.startsWith("{")) {
      return JSON.parse(raw) as { scientific?: string; beginner?: string };
    }
    return { scientific: raw };
  } catch (error) {
    console.warn("Unable to parse cached summary", error);
    return null;
  }
};

const saveCachedSummary = (id: string, mode: AiMode, summary: string) => {
  const existing = loadCachedSummary(id) ?? {};
  const next = { ...existing, [mode]: summary, updatedAt: new Date().toISOString() };
  safeWrite(`${SUMMARY_CACHE_PREFIX}${id}`, JSON.stringify(next));
};

const buildScientificSummary = (image: SpaceImage) => {
  const base = buildSummary(image);
  const keywords = Array.isArray(image.keywords) ? image.keywords.map(clean).filter(Boolean) : [];
  const instrument = clean(image.instrument);
  const mission = clean(image.mission);
  const center = clean(image.center);
  const source = [instrument, mission, center].filter(Boolean).join(" / ");
  const keywordLine = keywords.length ? `Keywords highlight ${keywords.slice(0, 5).join(", ")}.` : "";
  const sourceLine = source ? `Instrument context: ${source}.` : "";
  const extras = [sourceLine, keywordLine].filter(Boolean).join(" ");
  return extras ? `${base} ${extras}`.replace(/\s+/g, " ").trim() : base;
};

const buildBeginnerSummary = (image: SpaceImage) => {
  const title = clean(image.title) || "This space image";
  const date = clean(image.date);
  const center = clean(image.center);
  const instrument = clean(image.instrument);
  const description = clean(image.description);
  const keywords = Array.isArray(image.keywords) ? image.keywords.map(clean).filter(Boolean) : [];

  const who = [instrument, center].filter(Boolean).join(" / ");
  const dateLine = date && date !== "Unknown" ? ` It was captured on ${date}.` : "";
  const byLine = who ? ` It was captured by ${who}.` : "";
  const keywordLine = keywords.length ? ` It relates to ${keywords.slice(0, 3).join(", ")}.` : "";
  const descriptionLine = description ? ` ${description.split(/(?<=[.!?])\s/)[0]}` : "";

  return `${title}. This image helps us explore the universe${dateLine}${byLine}${keywordLine}${descriptionLine}`
    .replace(/\s+/g, " ")
    .trim();
};

export const generateSummary = (image: SpaceImage, mode: AiMode): string => {
  const cached = loadCachedSummary(image.id);
  if (cached && cached[mode]) {
    return cached[mode] as string;
  }

  const summary = mode === "beginner" ? buildBeginnerSummary(image) : buildScientificSummary(image);
  saveCachedSummary(image.id, mode, summary);
  return summary;
};

export const readStoredAiMode = (): AiMode => {
  const stored = safeRead(MODE_STORAGE_KEY);
  return stored === "beginner" ? "beginner" : "scientific";
};

export const persistAiMode = (mode: AiMode) => {
  safeWrite(MODE_STORAGE_KEY, mode);
};
