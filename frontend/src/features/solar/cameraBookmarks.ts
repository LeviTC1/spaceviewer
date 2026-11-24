import type { AsteroidBeltMode } from "./asteroids/asteroidGenerator";
import type { MoonVisibilityMode } from "./moonData";
import { PLANETS, SOLAR_SCALE_MODES, type PlanetId, type SolarScaleMode } from "./solarData";

export type CameraVector = [number, number, number];

export interface CameraBookmark {
  id: string;
  name: string;
  position: CameraVector;
  target: CameraVector;
  createdAt?: string;
  selectedPlanetId?: PlanetId;
  selectedMoonId?: string;
  sunSelected?: boolean;
  trackPlanetId?: PlanetId;
  trackMoonId?: string;
  scaleMode?: SolarScaleMode;
  moonMode?: MoonVisibilityMode;
  asteroidMode?: AsteroidBeltMode;
  dateKey?: string;
}

export type CameraBookmarkContext = Omit<CameraBookmark, "id" | "name" | "position" | "target" | "createdAt">;

export const SOLAR_BOOKMARKS_STORAGE_KEY = "spaceviewer.solar.bookmarks";

const PLANET_IDS = new Set<PlanetId>(PLANETS.map((planet) => planet.id));
const SCALE_MODES = new Set<SolarScaleMode>(SOLAR_SCALE_MODES);
const MOON_MODES = new Set<MoonVisibilityMode>(["off", "major", "all"]);
const ASTEROID_MODES = new Set<AsteroidBeltMode>(["off", "simplified", "full"]);
const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isCameraVector = (value: unknown): value is CameraVector =>
  Array.isArray(value) &&
  value.length === 3 &&
  value.every((entry) => typeof entry === "number" && Number.isFinite(entry));

const isPlanetId = (value: unknown): value is PlanetId =>
  typeof value === "string" && PLANET_IDS.has(value as PlanetId);

const isScaleMode = (value: unknown): value is SolarScaleMode =>
  typeof value === "string" && SCALE_MODES.has(value as SolarScaleMode);

const isMoonMode = (value: unknown): value is MoonVisibilityMode =>
  typeof value === "string" && MOON_MODES.has(value as MoonVisibilityMode);

const isAsteroidMode = (value: unknown): value is AsteroidBeltMode =>
  typeof value === "string" && ASTEROID_MODES.has(value as AsteroidBeltMode);

const isDateKey = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const match = DATE_KEY_PATTERN.exec(value);
  if (!match) return false;
  const [, yearValue, monthValue, dayValue] = match;
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

const parseBookmark = (value: unknown): CameraBookmark | null => {
  if (!isRecord(value)) return null;
  const { id, name, position, target } = value;
  if (typeof id !== "string" || typeof name !== "string") return null;
  if (!id.trim() || !name.trim()) return null;
  if (!isCameraVector(position) || !isCameraVector(target)) return null;

  const bookmark: CameraBookmark = {
    id,
    name,
    position,
    target,
  };

  if (typeof value.createdAt === "string") bookmark.createdAt = value.createdAt;
  if (isPlanetId(value.selectedPlanetId)) bookmark.selectedPlanetId = value.selectedPlanetId;
  if (typeof value.selectedMoonId === "string" && value.selectedMoonId.trim()) {
    bookmark.selectedMoonId = value.selectedMoonId;
  }
  if (typeof value.sunSelected === "boolean") bookmark.sunSelected = value.sunSelected;
  if (isPlanetId(value.trackPlanetId)) bookmark.trackPlanetId = value.trackPlanetId;
  if (typeof value.trackMoonId === "string" && value.trackMoonId.trim()) {
    bookmark.trackMoonId = value.trackMoonId;
  }
  if (isScaleMode(value.scaleMode)) bookmark.scaleMode = value.scaleMode;
  if (isMoonMode(value.moonMode)) bookmark.moonMode = value.moonMode;
  if (isAsteroidMode(value.asteroidMode)) bookmark.asteroidMode = value.asteroidMode;
  if (isDateKey(value.dateKey)) bookmark.dateKey = value.dateKey;

  return bookmark;
};

export const parseCameraBookmarks = (value: unknown): CameraBookmark[] => {
  if (!Array.isArray(value)) return [];
  return value.map(parseBookmark).filter((item): item is CameraBookmark => item !== null);
};

export const readCameraBookmarks = (): CameraBookmark[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SOLAR_BOOKMARKS_STORAGE_KEY);
    if (!raw) return [];
    return parseCameraBookmarks(JSON.parse(raw));
  } catch (error) {
    console.warn("Unable to load solar bookmarks", error);
    return [];
  }
};

export const persistCameraBookmarks = (bookmarks: CameraBookmark[]) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SOLAR_BOOKMARKS_STORAGE_KEY, JSON.stringify(bookmarks));
  } catch (error) {
    console.warn("Unable to save solar bookmarks", error);
  }
};
