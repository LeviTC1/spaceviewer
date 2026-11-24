import { useEffect, useSyncExternalStore } from "react";
import { getOpenNgcCatalogSnapshot, startOpenNgcCatalog, subscribeOpenNgcCatalog } from "./openNgcCatalogStore";

export const useOpenNgcCatalog = (enabled = true, delayMs = 0) => {
  const snapshot = useSyncExternalStore(
    subscribeOpenNgcCatalog,
    getOpenNgcCatalogSnapshot,
    getOpenNgcCatalogSnapshot,
  );
  useEffect(() => {
    if (!enabled) return;
    if (delayMs <= 0) {
      void startOpenNgcCatalog();
      return;
    }
    const timeoutId = window.setTimeout(() => void startOpenNgcCatalog(), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [delayMs, enabled]);
  return snapshot;
};
