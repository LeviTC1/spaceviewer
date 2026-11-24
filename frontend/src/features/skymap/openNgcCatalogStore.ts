import {
  loadOpenNgcCatalogChunk,
  loadOpenNgcCatalogManifest,
  type OpenNgcCatalogManifest,
  type OpenNgcCatalogObject,
} from "../../lib/catalog/openNgcCatalog";

export type OpenNgcCatalogStatus = "idle" | "loading" | "ready" | "error";

export interface OpenNgcCatalogSnapshot {
  status: OpenNgcCatalogStatus;
  manifest: OpenNgcCatalogManifest | null;
  objects: OpenNgcCatalogObject[];
  loadedChunkIds: string[];
  message: string;
  error: string | null;
}

const listeners = new Set<() => void>();
let snapshot: OpenNgcCatalogSnapshot = {
  status: "idle",
  manifest: null,
  objects: [],
  loadedChunkIds: [],
  message: "OpenNGC deep-sky catalogue has not started loading.",
  error: null,
};
let loadingPromise: Promise<void> | null = null;

const publish = (next: OpenNgcCatalogSnapshot) => {
  snapshot = next;
  listeners.forEach((listener) => listener());
};

export const subscribeOpenNgcCatalog = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getOpenNgcCatalogSnapshot = () => snapshot;

export const startOpenNgcCatalog = () => {
  if (loadingPromise || snapshot.status === "ready") return loadingPromise ?? Promise.resolve();
  loadingPromise = (async () => {
    try {
      publish({ ...snapshot, status: "loading", message: "Loading the OpenNGC manifest…", error: null });
      const manifest = await loadOpenNgcCatalogManifest();
      publish({ ...snapshot, status: "loading", manifest, message: `Loading ${manifest.chunks.length} integrity-checked J2000 sectors…` });
      const objects: OpenNgcCatalogObject[] = [];
      const loadedChunkIds: string[] = [];
      const ids = new Set<string>();
      for (let offset = 0; offset < manifest.chunks.length; offset += 3) {
        const batch = await Promise.all(manifest.chunks.slice(offset, offset + 3).map((definition) =>
          loadOpenNgcCatalogChunk(definition, manifest.catalog.id),
        ));
        for (const chunk of batch) {
          for (const object of chunk.objects) {
            if (ids.has(object.id)) throw new Error(`Duplicate OpenNGC object across chunks: ${object.id}`);
            ids.add(object.id);
            objects.push(object);
          }
          loadedChunkIds.push(chunk.chunkId);
        }
        publish({
          status: "loading",
          manifest,
          objects: [...objects],
          loadedChunkIds: [...loadedChunkIds],
          message: `${loadedChunkIds.length}/${manifest.chunks.length} sectors · ${objects.length.toLocaleString()}/${manifest.selection.objectCount.toLocaleString()} objects`,
          error: null,
        });
      }
      publish({
        status: "ready",
        manifest,
        objects: [...objects].sort((left, right) => left.raDeg - right.raDeg || left.sourceName.localeCompare(right.sourceName)),
        loadedChunkIds: [...loadedChunkIds],
        message: `${manifest.selection.objectCount.toLocaleString()} OpenNGC objects on a measured J2000 angular shell`,
        error: null,
      });
    } catch (error) {
      publish({ ...snapshot, status: "error", message: "OpenNGC deep-sky catalogue is unavailable.", error: error instanceof Error ? error.message : String(error) });
    } finally {
      loadingPromise = null;
    }
  })();
  return loadingPromise;
};
