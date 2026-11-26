// Survey photographs registered on the sky: asks the worker for a north-up, true-scale cutout of the
// selected deep-sky object and shares its loading state with the object panel.

import { useSyncExternalStore } from "react";
import type { UniverseEntity } from "./engine/universeModel";
import { DSS2_COLOR_HIPS } from "./hips";
import type { SkyPhotoRequest, SkyPhotoResponse } from "./skyPhotoWorker";

export const SKY_PHOTO_SOURCE = DSS2_COLOR_HIPS;

/** Deep-sky objects that get a photograph (the Milky Way itself is the panorama). */
export const hasSkyPhoto = (entity: UniverseEntity | null | undefined): entity is UniverseEntity & { sky: { raDeg: number; decDeg: number } } =>
  Boolean(
    entity?.sky &&
      (entity.kind === "galaxy" || entity.kind === "nebula" || entity.kind === "cluster") &&
      entity.id !== "galactic:milky-way-structure",
  );

/** Field of view for the cutout: the object with some sky around it, between 6′ and 3°. */
export const skyPhotoFovDeg = (entity: UniverseEntity) => {
  const arcmin = entity.angularSizeArcMin ?? 4;
  return Math.min(3, Math.max(0.1, (arcmin * 1.8) / 60));
};

let worker: Worker | null = null;
let nextRequest = 0;
const pending = new Map<string, (response: SkyPhotoResponse) => void>();

const getWorker = () => {
  if (!worker) {
    worker = new Worker(new URL("./skyPhotoWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<SkyPhotoResponse>) => {
      const resolve = pending.get(event.data.id);
      if (!resolve) {
        if (event.data.ok) event.data.bitmap.close();
        return;
      }
      pending.delete(event.data.id);
      resolve(event.data);
    };
  }
  return worker;
};

export const requestSkyPhoto = (request: Omit<SkyPhotoRequest, "id">) =>
  new Promise<SkyPhotoResponse>((resolve) => {
    nextRequest += 1;
    const id = `photo-${nextRequest}`;
    pending.set(id, resolve);
    getWorker().postMessage({ ...request, id } satisfies SkyPhotoRequest);
  });

// --- Shared status (object panel credit line) -----------------------------------------------------

export interface SkyPhotoStatus {
  entityId: string | null;
  state: "idle" | "loading" | "ready" | "error";
  fovDeg: number;
}

let status: SkyPhotoStatus = { entityId: null, state: "idle", fovDeg: 0 };
const listeners = new Set<() => void>();

export const setSkyPhotoStatus = (next: SkyPhotoStatus) => {
  if (next.entityId === status.entityId && next.state === status.state && next.fovDeg === status.fovDeg) return;
  status = next;
  for (const listener of listeners) listener();
};

export const useSkyPhotoStatus = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => status,
    () => status,
  );
