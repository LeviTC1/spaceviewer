import {
  GeoMoonState,
  JupiterMoons,
  RotateState,
  Rotation_EQJ_ECL,
  type StateVector,
} from "astronomy-engine";
import {
  SOLAR_DAY_MS,
  SOLAR_DOMAIN_EPOCH_MS,
  resolveSolarDaysSinceEpoch,
} from "../solarEphemeris";
import type {
  SolarTimeInput,
  SolarVector3Au,
  SolarVelocity3AuPerDay,
} from "../solarTypes";

export const CONTROLLED_SATELLITE_EPHEMERIS_MANIFEST_URL = "/ephemerides/satellites/manifest.json";
export const CONTROLLED_SATELLITE_EPHEMERIS_VERSION = "astronomy-engine-2.1.19";
export const CONTROLLED_SATELLITE_EPHEMERIS_SOURCE_URL =
  "https://github.com/cosinekitty/astronomy/releases/tag/v2.1.19";
export const GALILEAN_L12_SOURCE_URL =
  "https://ftp.imcce.fr/pub/ephem/satel/galilean/L1/L1.2/";

const ACTIVE_START_MS = Date.UTC(2025, 0, 1);
const ACTIVE_END_EXCLUSIVE_MS = Date.UTC(2051, 0, 1);
const MAX_ORBIT_CACHE_ENTRIES = 32;
const EQJ_TO_ECL = Rotation_EQJ_ECL();

export type ControlledSatelliteId = "moon" | "io" | "europa" | "ganymede" | "callisto";
export type ControlledSatelliteModel =
  | "astronomy-engine-improved-lunar"
  | "astronomy-engine-l1.2-galilean";

export interface SatelliteEphemerisDescriptor {
  controlled: boolean;
  model: ControlledSatelliteModel | "parent-relative-circular";
  label: string;
  provider: string;
  sourceUrl?: string;
  manifestUrl?: string;
  nativeFrame: string;
  runtimeFrame: "J2000 mean ecliptic" | "parent-relative seed plane";
  accuracyNote: string;
}

export interface ControlledSatelliteState {
  id: ControlledSatelliteId;
  relativePositionAu: SolarVector3Au;
  relativeVelocityAuPerDay: SolarVelocity3AuPerDay;
  model: ControlledSatelliteModel;
  descriptor: SatelliteEphemerisDescriptor;
  evaluatedAtUtc: string;
}

const LUNAR_DESCRIPTOR: SatelliteEphemerisDescriptor = {
  controlled: true,
  model: "astronomy-engine-improved-lunar",
  label: "Improved Lunar Ephemeris analytical state",
  provider: "Astronomy Engine 2.1.19",
  sourceUrl: CONTROLLED_SATELLITE_EPHEMERIS_SOURCE_URL,
  manifestUrl: CONTROLLED_SATELLITE_EPHEMERIS_MANIFEST_URL,
  nativeFrame: "geocentric EQJ · J2000 mean equator",
  runtimeFrame: "J2000 mean ecliptic",
  accuracyNote:
    "Astronomy Engine 2.1.19 Brown/Improved-Lunar-Ephemeris-derived geocentric state, rotated from EQJ into the J2000 mean ecliptic frame. Visualisation grade; not for spacecraft navigation, operational occultation timing or ground-track prediction.",
};

const GALILEAN_DESCRIPTOR: SatelliteEphemerisDescriptor = {
  controlled: true,
  model: "astronomy-engine-l1.2-galilean",
  label: "IMCCE L1.2 Galilean analytical state",
  provider: "Astronomy Engine 2.1.19",
  sourceUrl: GALILEAN_L12_SOURCE_URL,
  manifestUrl: CONTROLLED_SATELLITE_EPHEMERIS_MANIFEST_URL,
  nativeFrame: "jovicentric EQJ · J2000 mean equator",
  runtimeFrame: "J2000 mean ecliptic",
  accuracyNote:
    "Astronomy Engine 2.1.19 implementation of the IMCCE L1.2 Galilean theory, rotated from jovicentric EQJ into the J2000 mean ecliptic frame. Visualisation grade; not for spacecraft navigation, operational occultation timing or ground-track prediction.",
};

const FALLBACK_DESCRIPTOR: SatelliteEphemerisDescriptor = {
  controlled: false,
  model: "parent-relative-circular",
  label: "Parent-relative circular seed",
  provider: "SpaceViewer seed model",
  nativeFrame: "parent-relative seed plane",
  runtimeFrame: "parent-relative seed plane",
  accuracyNote:
    "Approximate parent-relative circular moon orbit using seed period, distance, inclination and direction. Event timing and ground tracks are illustrative only.",
};

const CONTROLLED_IDS = new Set<ControlledSatelliteId>([
  "moon",
  "io",
  "europa",
  "ganymede",
  "callisto",
]);

const isControlledId = (moonId: string): moonId is ControlledSatelliteId =>
  CONTROLLED_IDS.has(moonId as ControlledSatelliteId);

const toPosition = (state: StateVector): SolarVector3Au => ({
  x: state.x,
  y: state.y,
  z: state.z,
  unit: "au",
  frame: "heliocentric-ecliptic",
});

const toVelocity = (state: StateVector): SolarVelocity3AuPerDay => ({
  x: state.vx,
  y: state.vy,
  z: state.vz,
  unit: "au/day",
  frame: "heliocentric-ecliptic",
});

const toControlledState = (
  id: ControlledSatelliteId,
  state: StateVector,
  model: ControlledSatelliteModel,
  descriptor: SatelliteEphemerisDescriptor,
  evaluatedAtUtc: string,
): ControlledSatelliteState => {
  const ecliptic = RotateState(EQJ_TO_ECL, state);
  return {
    id,
    relativePositionAu: toPosition(ecliptic),
    relativeVelocityAuPerDay: toVelocity(ecliptic),
    model,
    descriptor,
    evaluatedAtUtc,
  };
};

interface EpochCache {
  epochMs: number;
  evaluatedAtUtc: string;
  moon?: ControlledSatelliteState;
  galilean?: Map<Exclude<ControlledSatelliteId, "moon">, ControlledSatelliteState>;
}

let epochCache: EpochCache | null = null;
const orbitCache = new Map<string, readonly SolarVector3Au[]>();

const resolveEpochMs = (time: SolarTimeInput) => {
  const daysSinceEpoch = resolveSolarDaysSinceEpoch(time);
  if (!Number.isFinite(daysSinceEpoch)) return null;
  const epochMs = Math.round(SOLAR_DOMAIN_EPOCH_MS + daysSinceEpoch * SOLAR_DAY_MS);
  if (epochMs < ACTIVE_START_MS || epochMs >= ACTIVE_END_EXCLUSIVE_MS) return null;
  return epochMs;
};

const getEpochCache = (epochMs: number) => {
  if (epochCache?.epochMs === epochMs) return epochCache;
  epochCache = {
    epochMs,
    evaluatedAtUtc: new Date(epochMs).toISOString(),
  };
  return epochCache;
};

const evaluateMoon = (cache: EpochCache) => {
  if (!cache.moon) {
    cache.moon = toControlledState(
      "moon",
      GeoMoonState(new Date(cache.epochMs)),
      "astronomy-engine-improved-lunar",
      LUNAR_DESCRIPTOR,
      cache.evaluatedAtUtc,
    );
  }
  return cache.moon;
};

const evaluateGalileanMoons = (cache: EpochCache) => {
  if (!cache.galilean) {
    const states = JupiterMoons(new Date(cache.epochMs));
    cache.galilean = new Map([
      ["io", toControlledState("io", states.io, "astronomy-engine-l1.2-galilean", GALILEAN_DESCRIPTOR, cache.evaluatedAtUtc)],
      ["europa", toControlledState("europa", states.europa, "astronomy-engine-l1.2-galilean", GALILEAN_DESCRIPTOR, cache.evaluatedAtUtc)],
      ["ganymede", toControlledState("ganymede", states.ganymede, "astronomy-engine-l1.2-galilean", GALILEAN_DESCRIPTOR, cache.evaluatedAtUtc)],
      ["callisto", toControlledState("callisto", states.callisto, "astronomy-engine-l1.2-galilean", GALILEAN_DESCRIPTOR, cache.evaluatedAtUtc)],
    ]);
  }
  return cache.galilean;
};

export const getSatelliteEphemerisDescriptor = (moonId: string): SatelliteEphemerisDescriptor => {
  if (moonId === "moon") return LUNAR_DESCRIPTOR;
  if (isControlledId(moonId)) return GALILEAN_DESCRIPTOR;
  return FALLBACK_DESCRIPTOR;
};

export const getControlledSatelliteState = (
  moonId: string,
  time: SolarTimeInput,
): ControlledSatelliteState | null => {
  if (!isControlledId(moonId)) return null;
  const epochMs = resolveEpochMs(time);
  if (epochMs === null) return null;
  const cache = getEpochCache(epochMs);
  if (moonId === "moon") return evaluateMoon(cache);
  return evaluateGalileanMoons(cache).get(moonId) ?? null;
};

export const isControlledSatelliteEphemerisActive = (moonId: string, time: SolarTimeInput) =>
  getControlledSatelliteState(moonId, time) !== null;

export const sampleControlledSatelliteOrbit = (
  moonId: string,
  time: SolarTimeInput,
  orbitalPeriodDays: number,
  samples: number,
): readonly SolarVector3Au[] => {
  if (!isControlledId(moonId) || !Number.isFinite(orbitalPeriodDays) || orbitalPeriodDays <= 0 || samples < 8) {
    return [];
  }
  const epochMs = resolveEpochMs(time);
  if (epochMs === null) return [];
  const periodMs = orbitalPeriodDays * SOLAR_DAY_MS;
  const latestStartMs = ACTIVE_END_EXCLUSIVE_MS - periodMs;
  const startMs = Math.min(Math.max(epochMs, ACTIVE_START_MS), latestStartMs);
  const dayKey = Math.floor((startMs - ACTIVE_START_MS) / SOLAR_DAY_MS);
  const cacheKey = `${moonId}:${dayKey}:${samples}:${orbitalPeriodDays}`;
  const cached = orbitCache.get(cacheKey);
  if (cached) return cached;

  const positions = Array.from({ length: samples }, (_, index) => {
    const sampleMs = startMs + (index / samples) * periodMs;
    const state = getControlledSatelliteState(moonId, new Date(sampleMs));
    return state?.relativePositionAu ?? null;
  }).filter((position): position is SolarVector3Au => position !== null);

  if (positions.length !== samples) return [];
  orbitCache.set(cacheKey, positions);
  if (orbitCache.size > MAX_ORBIT_CACHE_ENTRIES) {
    const oldestKey = orbitCache.keys().next().value;
    if (oldestKey) orbitCache.delete(oldestKey);
  }
  return positions;
};
