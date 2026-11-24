import { SRGBColorSpace, Texture } from "three";
import { solarTextureLoader } from "./solarTextureManager";
import {
  recordSolarTextureCacheHit,
  recordSolarTextureFailed,
  recordSolarTextureLoaded,
  recordSolarTexturePendingHit,
  recordSolarTextureRequest,
  recordSolarTextureTimedOut,
} from "./solarTextureDiagnostics";

interface SolarTextureAssetOptions {
  anisotropy?: number;
  colorSpace?: boolean;
}

type SolarTextureTimeoutGlobal = typeof globalThis & {
  __SPACEVIEWER_SOLAR_TEXTURE_TIMEOUT_MS__?: number;
};

export const SOLAR_TEXTURE_TIMEOUT_MS = 5200;

const textureCache = new Map<string, Texture>();
const texturePromiseCache = new Map<string, Promise<Texture | null>>();

const getSolarTextureTimeoutMs = () => {
  const override = (globalThis as SolarTextureTimeoutGlobal).__SPACEVIEWER_SOLAR_TEXTURE_TIMEOUT_MS__;
  return typeof override === "number" && Number.isFinite(override) && override > 0
    ? override
    : SOLAR_TEXTURE_TIMEOUT_MS;
};

const applyTextureOptions = (texture: Texture, options: SolarTextureAssetOptions = {}) => {
  if (options.colorSpace !== false) {
    texture.colorSpace = SRGBColorSpace;
  }
  if (typeof options.anisotropy === "number") {
    texture.anisotropy = Math.max(texture.anisotropy, options.anisotropy);
  }
  return texture;
};

export const loadSolarTextureAsset = async (
  url?: string,
  options: SolarTextureAssetOptions = {},
): Promise<Texture | null> => {
  if (!url) return null;
  const cached = textureCache.get(url);
  if (cached) {
    recordSolarTextureCacheHit(url);
    return applyTextureOptions(cached, options);
  }

  const pending = texturePromiseCache.get(url);
  if (pending) {
    recordSolarTexturePendingHit(url);
    return pending.then((texture) => (texture ? applyTextureOptions(texture, options) : null));
  }

  recordSolarTextureRequest(url);
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const loadTask = solarTextureLoader
    .loadAsync(url)
    .then((texture) => {
      applyTextureOptions(texture, options);
      textureCache.set(url, texture);
      if (!timedOut) {
        recordSolarTextureLoaded(url);
      }
      return texture;
    })
    .catch(() => {
      if (!timedOut) {
        recordSolarTextureFailed(url);
      }
      return null;
    });
  const timeoutTask = new Promise<Texture | null>((resolve) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      recordSolarTextureTimedOut(url);
      resolve(null);
    }, getSolarTextureTimeoutMs());
  });

  const task = Promise.race([loadTask, timeoutTask]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    texturePromiseCache.delete(url);
  });

  texturePromiseCache.set(url, task);
  return task;
};
