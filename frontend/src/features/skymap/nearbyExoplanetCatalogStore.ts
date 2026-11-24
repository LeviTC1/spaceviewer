import {
  loadExoplanetCatalogChunk,
  loadExoplanetCatalogManifest,
  type ExoplanetCatalogManifest,
  type ExoplanetCatalogSystem,
} from "../../lib/catalog/exoplanetCatalog";

export type NearbyExoplanetCatalogStatus = "idle" | "loading" | "ready" | "error";

export interface NearbyExoplanetCatalogSnapshot {
  status: NearbyExoplanetCatalogStatus;
  manifest: ExoplanetCatalogManifest | null;
  systems: ExoplanetCatalogSystem[];
  loadedChunkIds: string[];
  loadedPlanetCount: number;
  message: string;
  error: string | null;
}

const listeners = new Set<() => void>();
let snapshot: NearbyExoplanetCatalogSnapshot = {
  status: "idle",
  manifest: null,
  systems: [],
  loadedChunkIds: [],
  loadedPlanetCount: 0,
  message: "Nearby confirmed exoplanet catalogue has not started loading.",
  error: null,
};
let loadingPromise: Promise<void> | null = null;

const publish = (next: NearbyExoplanetCatalogSnapshot) => {
  snapshot = next;
  listeners.forEach((listener) => listener());
};

export const subscribeNearbyExoplanetCatalog = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getNearbyExoplanetCatalogSnapshot = () => snapshot;

export const startNearbyExoplanetCatalog = () => {
  if (loadingPromise || snapshot.status === "ready") return loadingPromise ?? Promise.resolve();
  loadingPromise = (async () => {
    try {
      publish({ ...snapshot, status: "loading", message: "Loading the NASA Exoplanet Archive manifest…", error: null });
      const manifest = await loadExoplanetCatalogManifest();
      publish({ ...snapshot, status: "loading", manifest, message: `Loading ${manifest.chunks.length} integrity-checked ICRS sectors…` });
      const systems: ExoplanetCatalogSystem[] = [];
      const loadedChunkIds: string[] = [];
      let loadedPlanetCount = 0;
      for (let offset = 0; offset < manifest.chunks.length; offset += 3) {
        const batch = await Promise.all(
          manifest.chunks.slice(offset, offset + 3).map((definition) =>
            loadExoplanetCatalogChunk(definition, manifest.catalog.id)),
        );
        for (const chunk of batch) {
          systems.push(...chunk.systems);
          loadedChunkIds.push(chunk.chunkId);
          loadedPlanetCount += chunk.planetCount;
        }
        publish({
          status: "loading",
          manifest,
          systems: [...systems],
          loadedChunkIds: [...loadedChunkIds],
          loadedPlanetCount,
          message: `${loadedChunkIds.length}/${manifest.chunks.length} sectors · ${loadedPlanetCount.toLocaleString()}/${manifest.selection.planetCount.toLocaleString()} confirmed planets`,
          error: null,
        });
      }
      publish({
        status: "ready",
        manifest,
        systems: [...systems].sort((left, right) => left.distancePc - right.distancePc || left.hostName.localeCompare(right.hostName)),
        loadedChunkIds: [...loadedChunkIds],
        loadedPlanetCount,
        message: `${manifest.selection.planetCount.toLocaleString()} confirmed planets in ${manifest.selection.systemCount.toLocaleString()} nearby systems`,
        error: null,
      });
    } catch (error) {
      publish({ ...snapshot, status: "error", message: "Nearby exoplanet catalogue is unavailable.", error: error instanceof Error ? error.message : String(error) });
    } finally {
      loadingPromise = null;
    }
  })();
  return loadingPromise;
};
