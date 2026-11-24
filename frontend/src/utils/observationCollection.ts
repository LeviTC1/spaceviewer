import type { ObservationCollection, ObservationCollectionItem } from "../models/ObservationCollection";
import type { SpaceImage } from "../models/SpaceImage";

const STORAGE_KEY = "spaceviewer.workingCollection";
const COLLECTION_ID = "working";
const COLLECTION_NAME = "Working collection";
const MAX_ITEMS = 48;

export const getCollectionImageKey = (image: SpaceImage) => `${image.source ?? "nasa"}:${image.nasaId ?? image.id}`;

const emptyCollection = (): ObservationCollection => {
  const now = new Date().toISOString();
  return {
    id: COLLECTION_ID,
    name: COLLECTION_NAME,
    createdAt: now,
    updatedAt: now,
    items: [],
  };
};

const sanitizeImage = (image: SpaceImage): SpaceImage => ({
  id: image.id,
  nasaId: image.nasaId,
  source: image.source,
  archiveId: image.archiveId,
  sourceUrl: image.sourceUrl,
  matchReason: image.matchReason,
  metadataQuality: image.metadataQuality,
  dimensions: image.dimensions,
  title: image.title,
  description: image.description,
  keywords: Array.isArray(image.keywords) ? image.keywords : [],
  date: image.date,
  center: image.center,
  mission: image.mission,
  instrument: image.instrument,
  photographer: image.photographer,
  imageUrl: image.imageUrl,
  thumbnailUrl: image.thumbnailUrl,
  fullRes: image.fullRes,
  archiveUrl: image.archiveUrl,
});

const normalizeCollection = (value: Partial<ObservationCollection> | null | undefined): ObservationCollection => {
  const fallback = emptyCollection();
  if (!value || !Array.isArray(value.items)) {
    return fallback;
  }

  const items = value.items
    .filter(
      (item): item is ObservationCollectionItem =>
        typeof item?.key === "string" &&
        typeof item.savedAt === "string" &&
        typeof item.image?.id === "string" &&
        typeof item.image.title === "string" &&
        typeof item.image.imageUrl === "string",
    )
    .slice(0, MAX_ITEMS);

  return {
    id: value.id || COLLECTION_ID,
    name: value.name || COLLECTION_NAME,
    createdAt: value.createdAt || fallback.createdAt,
    updatedAt: value.updatedAt || value.createdAt || fallback.updatedAt,
    items,
  };
};

export const readWorkingCollection = (): ObservationCollection => {
  if (typeof window === "undefined") {
    return emptyCollection();
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyCollection();
    return normalizeCollection(JSON.parse(raw) as Partial<ObservationCollection>);
  } catch (error) {
    console.warn("Unable to read observation collection", error);
    return emptyCollection();
  }
};

export const writeWorkingCollection = (collection: ObservationCollection) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(collection));
    window.dispatchEvent(new CustomEvent("spaceviewer:collection-updated", { detail: collection }));
  } catch (error) {
    console.warn("Unable to save observation collection", error);
  }
};

export const addToWorkingCollection = (
  collection: ObservationCollection,
  image: SpaceImage,
): ObservationCollection => {
  const key = getCollectionImageKey(image);
  const now = new Date().toISOString();
  const nextItem: ObservationCollectionItem = {
    key,
    savedAt: now,
    image: sanitizeImage(image),
  };
  const items = [nextItem, ...collection.items.filter((item) => item.key !== key)].slice(0, MAX_ITEMS);
  return {
    ...collection,
    updatedAt: now,
    items,
  };
};

export const removeFromWorkingCollection = (
  collection: ObservationCollection,
  key: string,
): ObservationCollection => ({
  ...collection,
  updatedAt: new Date().toISOString(),
  items: collection.items.filter((item) => item.key !== key),
});

export const clearWorkingCollection = (collection: ObservationCollection): ObservationCollection => ({
  ...collection,
  updatedAt: new Date().toISOString(),
  items: [],
});
