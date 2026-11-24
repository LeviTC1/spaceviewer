export interface SolarTextureDiagnostics {
  requested: number;
  loaded: number;
  failed: number;
  timedOut: number;
  cacheHits: number;
  pendingHits: number;
  lastUrl: string | null;
  lastErrorUrl: string | null;
  updatedAt: string;
}

type SolarTextureDiagnosticsWindow = Window & {
  __SPACEVIEWER_SOLAR_TEXTURES__?: SolarTextureDiagnostics;
};

const diagnostics: SolarTextureDiagnostics = {
  requested: 0,
  loaded: 0,
  failed: 0,
  timedOut: 0,
  cacheHits: 0,
  pendingHits: 0,
  lastUrl: null,
  lastErrorUrl: null,
  updatedAt: new Date(0).toISOString(),
};

const publish = () => {
  diagnostics.updatedAt = new Date().toISOString();
  if (typeof window !== "undefined") {
    (window as SolarTextureDiagnosticsWindow).__SPACEVIEWER_SOLAR_TEXTURES__ = { ...diagnostics };
  }
};

export const recordSolarTextureRequest = (url: string) => {
  diagnostics.requested += 1;
  diagnostics.lastUrl = url;
  publish();
};

export const recordSolarTextureLoaded = (url: string) => {
  diagnostics.loaded += 1;
  diagnostics.lastUrl = url;
  publish();
};

export const recordSolarTextureFailed = (url: string) => {
  diagnostics.failed += 1;
  diagnostics.lastErrorUrl = url;
  publish();
};

export const recordSolarTextureTimedOut = (url: string) => {
  diagnostics.failed += 1;
  diagnostics.timedOut += 1;
  diagnostics.lastErrorUrl = url;
  publish();
};

export const recordSolarTextureCacheHit = (url: string) => {
  diagnostics.cacheHits += 1;
  diagnostics.lastUrl = url;
  publish();
};

export const recordSolarTexturePendingHit = (url: string) => {
  diagnostics.pendingHits += 1;
  diagnostics.lastUrl = url;
  publish();
};

export const readSolarTextureDiagnostics = (): SolarTextureDiagnostics => ({ ...diagnostics });
