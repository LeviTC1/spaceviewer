import { useEffect, useSyncExternalStore } from "react";
import {
  getNearbyExoplanetCatalogSnapshot,
  startNearbyExoplanetCatalog,
  subscribeNearbyExoplanetCatalog,
} from "./nearbyExoplanetCatalogStore";

export const useNearbyExoplanets = (enabled = true, delayMs = 0) => {
  const snapshot = useSyncExternalStore(
    subscribeNearbyExoplanetCatalog,
    getNearbyExoplanetCatalogSnapshot,
    getNearbyExoplanetCatalogSnapshot,
  );
  useEffect(() => {
    if (!enabled) return;
    if (delayMs <= 0) {
      void startNearbyExoplanetCatalog();
      return;
    }
    const timeoutId = window.setTimeout(() => void startNearbyExoplanetCatalog(), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [delayMs, enabled]);
  return snapshot;
};
