import type { PlanetId } from "../../../features/solar/solarData";
import {
  SOLAR_DAY_MS,
  SOLAR_DOMAIN_EPOCH_MS,
  resolveSolarDaysSinceEpoch,
} from "../solarEphemeris";
import type { SolarTimeInput, SolarVector3Au } from "../solarTypes";

const MANIFEST_URL = "/ephemerides/vsop87c/manifest.json";
const FORMAT = "spaceviewer-vsop87c-float64-v1";
const MAGIC = "SVEP";
const SCHEMA_VERSION = 1;
const HEADER_BYTES = 64;
const ENDIAN_MARKER = 0x01020304;
const POSITION_ASSET_KIND = 1;
const ORBIT_ASSET_KIND = 2;
const UNIX_EPOCH_JULIAN_DATE = 2_440_587.5;
const MAX_RESIDENT_YEAR_CHUNKS = 3;

export type StreamedVsop87cPlanetId = Exclude<PlanetId, "pluto">;
export type StreamedSolarEphemerisStatus = "idle" | "loading" | "ready" | "fallback";

export interface StreamedVsop87cChunkDefinition {
  id: string;
  year: number;
  startJulianDate: number;
  endJulianDate: number;
  stepDays: number;
  sampleCount: number;
  byteLength: number;
  url: string;
  integrity: string;
}

export interface StreamedVsop87cManifest {
  schemaVersion: 1;
  format: "spaceviewer-vsop87c-float64-v1";
  ephemeris: {
    id: string;
    version: string;
    title: string;
    referenceFrame: "heliocentric-ecliptic-j2000";
    positionUnit: "astronomical-unit";
    timeScale: string;
  };
  source: {
    theory: string;
    theoryUrl: string;
    implementation: string;
    implementationVersion: string;
    implementationUrl: string;
    implementationPath: string;
    licenceId: "MIT";
    credit: string;
    implementationSha256: string;
    licenceSha256: string;
  };
  validity: {
    minimumUtcDate: string;
    maximumUtcDate: string;
    runtimeClampRequired: true;
  };
  sampling: {
    positionStepJulianDays: 1;
    interpolation: "cubic-hermite-cartesian-with-central-difference-tangents";
    orbitSamplesPerPlanet: number;
    orbitReferenceJulianDate: number;
    note: string;
  };
  planets: Array<{ id: StreamedVsop87cPlanetId; orbitalPeriodDays: number }>;
  limitations: string;
  build: {
    builder: string;
    deterministic: true;
    headerBytes: 64;
    byteOrder: "little-endian";
    scalarPrecision: "float64";
    positionLayout: "sample-major-planet-major-xyz";
    orbitLayout: "planet-major-sample-major-xyz";
    planetOrder: StreamedVsop87cPlanetId[];
    chunkCount: number;
    totalBinaryBytes: number;
  };
  chunks: StreamedVsop87cChunkDefinition[];
  orbitAsset: {
    id: "representative-orbits";
    referenceJulianDate: number;
    sampleCount: number;
    byteLength: number;
    url: string;
    integrity: string;
  };
}

export interface DecodedVsop87cPositionChunk {
  definition: StreamedVsop87cChunkDefinition;
  positions: Float64Array;
}

export interface DecodedVsop87cOrbitAsset {
  sampleCount: number;
  positions: Float64Array;
}

export interface StreamedSolarEphemerisSnapshot {
  status: StreamedSolarEphemerisStatus;
  revision: number;
  activeYear: number | null;
  loadedYears: number[];
  positionsReady: boolean;
  orbitStatus: "idle" | "loading" | "ready" | "fallback";
  transferredBytes: number;
  message: string;
  error: string | null;
  orbitError: string | null;
  manifest: StreamedVsop87cManifest | null;
}

interface BinaryHeader {
  kind: number;
  planetCount: number;
  sampleCount: number;
  startJulianDate: number;
  stepDays: number;
  year: number;
}

const listeners = new Set<() => void>();
const positionChunks = new Map<number, DecodedVsop87cPositionChunk>();
const positionLoadPromises = new Map<number, Promise<DecodedVsop87cPositionChunk>>();
const sampledOrbitCache = new Map<string, SolarVector3Au[]>();
let orbitAsset: DecodedVsop87cOrbitAsset | null = null;
let orbitLoadPromise: Promise<DecodedVsop87cOrbitAsset> | null = null;
let manifestPromise: Promise<StreamedVsop87cManifest> | null = null;

let snapshot: StreamedSolarEphemerisSnapshot = {
  status: "idle",
  revision: 0,
  activeYear: null,
  loadedYears: [],
  positionsReady: false,
  orbitStatus: "idle",
  transferredBytes: 0,
  message: "Keplerian boot ephemeris is active; the VSOP87C time block has not been requested.",
  error: null,
  orbitError: null,
  manifest: null,
};

const publish = (patch: Partial<StreamedSolarEphemerisSnapshot>) => {
  snapshot = { ...snapshot, ...patch, revision: snapshot.revision + 1 };
  listeners.forEach((listener) => listener());
};

const readMagic = (view: DataView) =>
  String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));

const decodeHeader = (buffer: ArrayBuffer, expectedKind: number, expectedPlanetCount: number): BinaryHeader => {
  if (buffer.byteLength < HEADER_BYTES) throw new Error("Streamed ephemeris asset is shorter than its header.");
  const view = new DataView(buffer);
  if (readMagic(view) !== MAGIC || view.getUint16(4, true) !== SCHEMA_VERSION) {
    throw new Error("Unsupported streamed ephemeris binary format.");
  }
  if (
    view.getUint16(6, true) !== HEADER_BYTES ||
    view.getUint8(8) !== expectedKind ||
    view.getUint8(9) !== expectedPlanetCount ||
    view.getUint32(32, true) !== ENDIAN_MARKER ||
    view.getUint32(40, true) !== expectedPlanetCount * 3
  ) {
    throw new Error("Streamed ephemeris binary header is inconsistent.");
  }
  return {
    kind: view.getUint8(8),
    planetCount: view.getUint8(9),
    sampleCount: view.getUint32(12, true),
    startJulianDate: view.getFloat64(16, true),
    stepDays: view.getFloat64(24, true),
    year: view.getInt32(36, true),
  };
};

export const validateStreamedVsop87cManifest = (value: unknown): StreamedVsop87cManifest => {
  const manifest = value as Partial<StreamedVsop87cManifest> | null;
  if (!manifest || manifest.schemaVersion !== SCHEMA_VERSION || manifest.format !== FORMAT) {
    throw new Error("Unsupported streamed VSOP87C manifest.");
  }
  if (
    manifest.ephemeris?.referenceFrame !== "heliocentric-ecliptic-j2000" ||
    manifest.ephemeris.positionUnit !== "astronomical-unit" ||
    manifest.source?.licenceId !== "MIT" ||
    manifest.sampling?.positionStepJulianDays !== 1 ||
    manifest.sampling.interpolation !== "cubic-hermite-cartesian-with-central-difference-tangents" ||
    manifest.build?.headerBytes !== HEADER_BYTES ||
    manifest.build.byteOrder !== "little-endian" ||
    manifest.build.scalarPrecision !== "float64" ||
    !Array.isArray(manifest.build.planetOrder) ||
    manifest.build.planetOrder.length !== 8 ||
    new Set(manifest.build.planetOrder).size !== 8 ||
    !Array.isArray(manifest.chunks) ||
    manifest.chunks.length !== manifest.build.chunkCount ||
    manifest.validity?.runtimeClampRequired !== true
  ) {
    throw new Error("Streamed VSOP87C manifest is missing its scientific or binary contract.");
  }
  const years = new Set<number>();
  let totalBinaryBytes = manifest.orbitAsset?.byteLength ?? 0;
  manifest.chunks.forEach((chunk) => {
    const expectedByteLength = HEADER_BYTES + chunk.sampleCount * manifest.build!.planetOrder.length * 3 * 8;
    if (
      !Number.isInteger(chunk.year) ||
      years.has(chunk.year) ||
      chunk.stepDays !== 1 ||
      chunk.sampleCount < 366 ||
      chunk.endJulianDate !== chunk.startJulianDate + chunk.sampleCount - 1 ||
      chunk.byteLength !== expectedByteLength ||
      !chunk.url ||
      !chunk.integrity.startsWith("sha256-")
    ) {
      throw new Error(`Streamed VSOP87C chunk ${chunk.id ?? "unknown"} is inconsistent.`);
    }
    years.add(chunk.year);
    totalBinaryBytes += chunk.byteLength;
  });
  if (
    !manifest.orbitAsset ||
    manifest.orbitAsset.sampleCount !== manifest.sampling.orbitSamplesPerPlanet ||
    manifest.orbitAsset.byteLength !== HEADER_BYTES + manifest.orbitAsset.sampleCount * 8 * 3 * 8 ||
    totalBinaryBytes !== manifest.build.totalBinaryBytes
  ) {
    throw new Error("Streamed VSOP87C aggregate binary metrics are inconsistent.");
  }
  return manifest as StreamedVsop87cManifest;
};

export const decodeStreamedVsop87cPositionChunk = (
  buffer: ArrayBuffer,
  definition: StreamedVsop87cChunkDefinition,
  planetCount = 8,
): DecodedVsop87cPositionChunk => {
  if (buffer.byteLength !== definition.byteLength) {
    throw new Error(`Streamed ephemeris length mismatch for ${definition.id}.`);
  }
  const header = decodeHeader(buffer, POSITION_ASSET_KIND, planetCount);
  if (
    header.sampleCount !== definition.sampleCount ||
    header.startJulianDate !== definition.startJulianDate ||
    header.stepDays !== definition.stepDays ||
    header.year !== definition.year
  ) {
    throw new Error(`Streamed ephemeris header mismatch for ${definition.id}.`);
  }
  return {
    definition,
    positions: new Float64Array(buffer, HEADER_BYTES, definition.sampleCount * planetCount * 3),
  };
};

export const decodeStreamedVsop87cOrbitAsset = (
  buffer: ArrayBuffer,
  manifest: StreamedVsop87cManifest,
): DecodedVsop87cOrbitAsset => {
  if (buffer.byteLength !== manifest.orbitAsset.byteLength) {
    throw new Error("Streamed orbit asset length does not match its manifest.");
  }
  const header = decodeHeader(buffer, ORBIT_ASSET_KIND, manifest.build.planetOrder.length);
  if (
    header.sampleCount !== manifest.orbitAsset.sampleCount ||
    header.startJulianDate !== manifest.orbitAsset.referenceJulianDate ||
    header.stepDays !== 0 ||
    header.year !== 0
  ) {
    throw new Error("Streamed orbit asset header is inconsistent.");
  }
  return {
    sampleCount: header.sampleCount,
    positions: new Float64Array(buffer, HEADER_BYTES, header.sampleCount * header.planetCount * 3),
  };
};

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

const verifyIntegrity = async (buffer: ArrayBuffer, expected: string, label: string) => {
  if (!globalThis.crypto?.subtle) return;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
  const actual = `sha256-${toBase64(new Uint8Array(digest))}`;
  if (actual !== expected) throw new Error(`Integrity verification failed for ${label}.`);
};

const resolveManifestUrl = () => {
  if (typeof globalThis.location !== "undefined") return new URL(MANIFEST_URL, globalThis.location.href).toString();
  return new URL(MANIFEST_URL, "http://localhost").toString();
};

const loadManifest = async () => {
  if (snapshot.manifest) return snapshot.manifest;
  if (manifestPromise) return manifestPromise;
  publish({
    status: "loading",
    message: "Loading the streamed VSOP87C ephemeris manifest; Keplerian boot positions remain active.",
    error: null,
  });
  manifestPromise = fetch(resolveManifestUrl())
    .then(async (response) => {
      if (!response.ok) throw new Error(`VSOP87C manifest request failed (${response.status}).`);
      const source = await response.text();
      const manifest = validateStreamedVsop87cManifest(JSON.parse(source));
      publish({
        manifest,
        transferredBytes: snapshot.transferredBytes + new TextEncoder().encode(source).byteLength,
      });
      return manifest;
    })
    .catch((error) => {
      manifestPromise = null;
      throw error;
    });
  return manifestPromise;
};

const loadPositionChunk = async (year: number) => {
  const existing = positionChunks.get(year);
  if (existing) return existing;
  const pending = positionLoadPromises.get(year);
  if (pending) return pending;
  const manifest = await loadManifest();
  const definition = manifest.chunks.find((chunk) => chunk.year === year);
  if (!definition) throw new Error(`No streamed VSOP87C block covers ${year}.`);
  const manifestUrl = resolveManifestUrl();
  const promise = fetch(new URL(definition.url, manifestUrl))
    .then(async (response) => {
      if (!response.ok) throw new Error(`VSOP87C block ${year} request failed (${response.status}).`);
      const buffer = await response.arrayBuffer();
      await verifyIntegrity(buffer, definition.integrity, definition.id);
      const decoded = decodeStreamedVsop87cPositionChunk(buffer, definition, manifest.build.planetOrder.length);
      positionChunks.set(year, decoded);
      while (positionChunks.size > MAX_RESIDENT_YEAR_CHUNKS) {
        const oldestYear = positionChunks.keys().next().value;
        if (oldestYear === undefined || oldestYear === year) break;
        positionChunks.delete(oldestYear);
      }
      publish({
        loadedYears: [...positionChunks.keys()].sort((left, right) => left - right),
        transferredBytes: snapshot.transferredBytes + buffer.byteLength,
      });
      return decoded;
    })
    .finally(() => positionLoadPromises.delete(year));
  positionLoadPromises.set(year, promise);
  return promise;
};

const loadOrbitAsset = async () => {
  if (orbitAsset) return orbitAsset;
  if (orbitLoadPromise) return orbitLoadPromise;
  const manifest = await loadManifest();
  publish({ orbitStatus: "loading", orbitError: null });
  orbitLoadPromise = fetch(new URL(manifest.orbitAsset.url, resolveManifestUrl()))
    .then(async (response) => {
      if (!response.ok) throw new Error(`VSOP87C orbit request failed (${response.status}).`);
      const buffer = await response.arrayBuffer();
      await verifyIntegrity(buffer, manifest.orbitAsset.integrity, manifest.orbitAsset.id);
      orbitAsset = decodeStreamedVsop87cOrbitAsset(buffer, manifest);
      publish({
        orbitStatus: "ready",
        orbitError: null,
        transferredBytes: snapshot.transferredBytes + buffer.byteLength,
        message: snapshot.positionsReady
          ? `VSOP87C ${snapshot.activeYear} Float64 positions and streamed orbit guides are active.`
          : snapshot.message,
      });
      return orbitAsset;
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : "Unknown streamed orbit failure.";
      publish({ orbitStatus: "fallback", orbitError: message });
      orbitLoadPromise = null;
      throw error;
    });
  return orbitLoadPromise;
};

const getYearForSolarTime = (time: SolarTimeInput) =>
  new Date(SOLAR_DOMAIN_EPOCH_MS + resolveSolarDaysSinceEpoch(time) * SOLAR_DAY_MS).getUTCFullYear();

export const getJulianDateForSolarTime = (time: SolarTimeInput) =>
  (SOLAR_DOMAIN_EPOCH_MS + resolveSolarDaysSinceEpoch(time) * SOLAR_DAY_MS) / SOLAR_DAY_MS +
  UNIX_EPOCH_JULIAN_DATE;

export const requestStreamedVsop87cEphemeris = async (
  time: SolarTimeInput,
  options: { includeOrbits?: boolean } = {},
) => {
  const year = getYearForSolarTime(time);
  const includeOrbits = options.includeOrbits ?? true;
  const alreadyReady = positionChunks.has(year);
  publish({
    status: alreadyReady ? "ready" : "loading",
    activeYear: year,
    positionsReady: alreadyReady,
    message: alreadyReady
      ? `VSOP87C ${year} Float64 positions are active; ${
          orbitAsset ? "streamed orbit guides are ready" : "Keplerian orbit guides remain active"
        }.`
      : `Loading the ${year} VSOP87C Float64 block; Keplerian boot positions remain interactive.`,
    error: null,
  });
  if (includeOrbits) void loadOrbitAsset().catch(() => null);
  try {
    await loadPositionChunk(year);
    if (snapshot.activeYear !== year) return;
    publish({
      status: "ready",
      activeYear: year,
      loadedYears: [...positionChunks.keys()].sort((left, right) => left - right),
      positionsReady: true,
      message: `VSOP87C ${year} Float64 positions are active; ${
        orbitAsset ? "streamed orbit guides are ready" : "Keplerian orbit guides remain active"
      }.`,
      error: null,
    });
  } catch (error) {
    if (snapshot.activeYear !== year) return;
    const message = error instanceof Error ? error.message : "Unknown streamed VSOP87C failure.";
    publish({
      status: "fallback",
      activeYear: year,
      positionsReady: false,
      message: "The streamed VSOP87C block is unavailable; the explicit Keplerian fallback remains active.",
      error: message,
    });
  }
};

export const getStreamedVsop87cPosition = (
  planetId: StreamedVsop87cPlanetId,
  time: SolarTimeInput,
): { positionAu: SolarVector3Au; julianDate: number } | null => {
  const manifest = snapshot.manifest;
  if (!manifest) return null;
  const julianDate = getJulianDateForSolarTime(time);
  const lowerJulianDate = Math.floor(julianDate);
  const upperJulianDate = Math.ceil(julianDate);
  const chunk = [...positionChunks.values()].find(
    (candidate) =>
      lowerJulianDate >= candidate.definition.startJulianDate &&
      upperJulianDate <= candidate.definition.endJulianDate,
  );
  if (!chunk) return null;
  const planetIndex = manifest.build.planetOrder.indexOf(planetId);
  if (planetIndex < 0) return null;
  const lowerSample = lowerJulianDate - chunk.definition.startJulianDate;
  const upperSample = upperJulianDate - chunk.definition.startJulianDate;
  const t = julianDate - lowerJulianDate;
  const readCoordinate = (sampleIndex: number, axis: number) =>
    chunk.positions[(sampleIndex * manifest.build.planetOrder.length + planetIndex) * 3 + axis];
  const lastSample = chunk.definition.endJulianDate - chunk.definition.startJulianDate;
  // Cubic Hermite between daily keyframes with central-difference tangents (one-sided at the chunk
  // edges). Linear interpolation cut the corner of each day's arc by up to ~6,000 km for the Earth.
  const interpolate = (axis: number) => {
    const p1 = readCoordinate(lowerSample, axis);
    if (upperSample === lowerSample) return p1;
    const p2 = readCoordinate(upperSample, axis);
    const p0 = lowerSample > 0 ? readCoordinate(lowerSample - 1, axis) : 2 * p1 - p2;
    const p3 = upperSample < lastSample ? readCoordinate(upperSample + 1, axis) : 2 * p2 - p1;
    const m1 = (p2 - p0) / 2;
    const m2 = (p3 - p1) / 2;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * p1 + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2 + (t3 - t2) * m2;
  };
  return {
    positionAu: {
      x: interpolate(0),
      y: interpolate(1),
      z: interpolate(2),
      unit: "au",
      frame: "heliocentric-ecliptic",
    },
    julianDate,
  };
};

export const getStreamedVsop87cOrbit = (
  planetId: StreamedVsop87cPlanetId,
  samples: number,
): SolarVector3Au[] => {
  const manifest = snapshot.manifest;
  if (!manifest || !orbitAsset || samples <= 0) return [];
  const count = Math.min(orbitAsset.sampleCount, Math.max(2, Math.floor(samples)));
  const cacheKey = `${planetId}:${count}`;
  const cached = sampledOrbitCache.get(cacheKey);
  if (cached) return cached;
  const planetIndex = manifest.build.planetOrder.indexOf(planetId);
  if (planetIndex < 0) return [];
  const points = Array.from({ length: count }, (_, index) => {
    const sourceIndex = Math.floor((index * orbitAsset!.sampleCount) / count);
    const offset = (planetIndex * orbitAsset!.sampleCount + sourceIndex) * 3;
    return {
      x: orbitAsset!.positions[offset],
      y: orbitAsset!.positions[offset + 1],
      z: orbitAsset!.positions[offset + 2],
      unit: "au" as const,
      frame: "heliocentric-ecliptic" as const,
    };
  });
  sampledOrbitCache.set(cacheKey, points);
  return points;
};

export const subscribeStreamedSolarEphemeris = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getStreamedSolarEphemerisSnapshot = () => snapshot;

export const resetStreamedSolarEphemerisForTests = () => {
  positionChunks.clear();
  positionLoadPromises.clear();
  sampledOrbitCache.clear();
  orbitAsset = null;
  orbitLoadPromise = null;
  manifestPromise = null;
  snapshot = {
    status: "idle",
    revision: 0,
    activeYear: null,
    loadedYears: [],
    positionsReady: false,
    orbitStatus: "idle",
    transferredBytes: 0,
    message: "Keplerian boot ephemeris is active; the VSOP87C time block has not been requested.",
    error: null,
    orbitError: null,
    manifest: null,
  };
  listeners.clear();
};
