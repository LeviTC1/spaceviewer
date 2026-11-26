// Spacecraft where they really are.
//
// Deep-space missions follow JPL Horizons trajectories (scripts/build-spacecraft-trajectories.mjs):
// heliocentric states thinned for cubic Hermite interpolation, dense around flybys. Earth orbiters (ISS,
// Hubble, Tiangong) are propagated with SGP4 from CelesTrak two-line elements, fetched live with a
// bundled snapshot as fallback. Both become ordinary explorer entities with a `trajectory` sampler.

import { useEffect, useState } from "react";
import { propagate, twoline2satrec, type SatRec } from "satellite.js";
import { API_URL } from "../../config";
import { setPlutoTables } from "../../domain/solar/solarProvider";
import { dateToJ2000 } from "./engine/observer";
import { getEntityWorld, type CraftShape, type UniverseEntity } from "./engine/universeModel";
import { eclipticToWorld, icrsToWorld, type Vec3 } from "./engine/units";

export interface MissionTrajectory {
  id: string;
  name: string;
  agency: string;
  horizonsId: string;
  startMs: number;
  stopMs: number;
  /** [t, x, y, z, vx, vy, vz] per record: ms, km, km/s (heliocentric ecliptic J2000). */
  records: Float64Array;
}

export interface EarthOrbiter {
  id: string;
  name: string;
  agency: string;
  norad: number;
  sizeKm: number;
  satrec: SatRec;
  /** Epoch of the elements (ms) and where they came from. */
  epochMs: number;
  live: boolean;
}

const STRIDE = 7;

/** Cubic Hermite interpolation of a trajectory at `t` (ms). Heliocentric ecliptic km, or null outside the span. */
export const sampleTrajectory = (records: Float64Array, t: number, hint?: { index: number }): [number, number, number] | null => {
  const n = records.length / STRIDE;
  if (n < 2 || t < records[0] || t > records[(n - 1) * STRIDE]) return null;
  // Start from the last index (frames move forward slowly), else binary search.
  let i = hint?.index ?? 0;
  if (!(i >= 0 && i < n - 1 && records[i * STRIDE] <= t && records[(i + 1) * STRIDE] >= t)) {
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (records[mid * STRIDE] <= t) lo = mid;
      else hi = mid;
    }
    i = lo;
  }
  if (hint) hint.index = i;
  const a = i * STRIDE;
  const b = (i + 1) * STRIDE;
  const h = (records[b] - records[a]) / 1000;
  const s = h > 0 ? (t - records[a]) / (records[b] - records[a]) : 0;
  const s2 = s * s;
  const s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1;
  const h10 = s3 - 2 * s2 + s;
  const h01 = -2 * s3 + 3 * s2;
  const h11 = s3 - s2;
  return [
    h00 * records[a + 1] + h10 * h * records[a + 4] + h01 * records[b + 1] + h11 * h * records[b + 4],
    h00 * records[a + 2] + h10 * h * records[a + 5] + h01 * records[b + 2] + h11 * h * records[b + 5],
    h00 * records[a + 3] + h10 * h * records[a + 6] + h01 * records[b + 3] + h11 * h * records[b + 6],
  ];
};

/** Geocentric position of an Earth orbiter in the explorer's world frame (km), via SGP4. */
export const orbiterOffset = (orbiter: EarthOrbiter, t: number): Vec3 | null => {
  const result = propagate(orbiter.satrec, new Date(t));
  const p = result?.position;
  if (!p || typeof p === "boolean" || !Number.isFinite(p.x)) return null;
  // SGP4 works in TEME (true equator, mean equinox of date); treat it as the mean equator of date and
  // precess to J2000. The neglected nutation is well under an arcminute.
  const j2000 = dateToJ2000([p.x, p.y, p.z], t);
  return icrsToWorld(j2000[0], j2000[1], j2000[2]);
};

// --- Loading --------------------------------------------------------------------------------------

interface Manifest {
  format: string;
  source: { credit: string; retrievedAt: string };
  missions: Array<{ id: string; name: string; agency: string; horizonsId: string; url: string; startMs: number; stopMs: number; body?: string }>;
}

interface TleSnapshot {
  retrievedAt: string;
  liveUrl: string;
  satellites: Array<{ id: string; norad: number; name: string; agency: string; sizeKm: number; line1: string; line2: string }>;
}

const TLE_CACHE_KEY = "spaceviewer.tle.v1";
const TLE_MAX_AGE_MS = 6 * 3_600_000;

const tleEpochMs = (line1: string) => {
  const year = Number(line1.slice(18, 20));
  const day = Number(line1.slice(20, 32));
  return Date.UTC(year < 57 ? 2000 + year : 1900 + year, 0, 1) + (day - 1) * 86_400_000;
};

/**
 * Fresh elements via SpaceViewer's API (which relays CelesTrak and caches them for its two-hour update
 * cycle), cached here for six hours; the bundled snapshot stands in when the API is unreachable.
 */
const loadTles = async (snapshot: TleSnapshot, signal: AbortSignal) => {
  const lines = new Map<number, { line1: string; line2: string; live: boolean }>();
  for (const sat of snapshot.satellites) lines.set(sat.norad, { line1: sat.line1, line2: sat.line2, live: false });
  try {
    const cached = JSON.parse(window.localStorage.getItem(TLE_CACHE_KEY) ?? "null") as { at: number; sets: Record<string, [string, string]> } | null;
    if (cached && Date.now() - cached.at < TLE_MAX_AGE_MS) {
      for (const [norad, [line1, line2]] of Object.entries(cached.sets)) lines.set(Number(norad), { line1, line2, live: true });
      return lines;
    }
  } catch {
    // ignore
  }
  try {
    const response = await fetch(`${API_URL}/tle?norad=${snapshot.satellites.map((sat) => sat.norad).join(",")}`, { signal });
    if (response.ok) {
      const json = (await response.json()) as { sets?: Array<{ norad: number; line1: string; line2: string }> };
      const sets: Record<string, [string, string]> = {};
      for (const set of json.sets ?? []) {
        if (!set.line1?.startsWith("1 ") || !set.line2?.startsWith("2 ")) continue;
        lines.set(set.norad, { line1: set.line1, line2: set.line2, live: true });
        sets[set.norad] = [set.line1, set.line2];
      }
      if (Object.keys(sets).length) window.localStorage.setItem(TLE_CACHE_KEY, JSON.stringify({ at: Date.now(), sets }));
    }
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    // offline or API down: the snapshot stands in
  }
  return lines;
};

export interface SpacecraftData {
  missions: MissionTrajectory[];
  orbiters: EarthOrbiter[];
  credit: string;
}

export const useSpacecraft = (start: boolean) => {
  const [data, setData] = useState<SpacecraftData | null>(null);
  useEffect(() => {
    if (!start) return;
    const controller = new AbortController();
    (async () => {
      try {
        const [manifest, snapshot] = await Promise.all([
          fetch("/catalogs/spacecraft/manifest.json", { signal: controller.signal }).then((response) => response.json() as Promise<Manifest>),
          fetch("/catalogs/spacecraft/earth-orbiters.json", { signal: controller.signal }).then((response) => response.json() as Promise<TleSnapshot>),
        ]);
        if (manifest.format !== "spaceviewer-trajectory-hermite-v1") throw new Error("Unknown trajectory manifest");
        const [missions, tles] = await Promise.all([
          Promise.all(
            manifest.missions.map(async (mission) => ({
              ...mission,
              records: new Float64Array(await (await fetch(mission.url, { signal: controller.signal })).arrayBuffer()),
            })),
          ),
          loadTles(snapshot, controller.signal),
        ]);
        // Body tables (Pluto) feed the planet ephemeris rather than becoming spacecraft.
        const bodyTables = missions.filter((mission) => manifest.missions.find((item) => item.id === mission.id)?.body === "pluto");
        bodyTables.sort((a, b) => (a.id === "pluto-2015" ? -1 : b.id === "pluto-2015" ? 1 : 0));
        setPlutoTables(bodyTables.map((table) => (t: number) => sampleTrajectory(table.records, t)));
        const craftMissions = missions.filter((mission) => !bodyTables.includes(mission));
        const orbiters: EarthOrbiter[] = snapshot.satellites.map((sat) => {
          const set = tles.get(sat.norad)!;
          return { id: sat.id, name: sat.name, agency: sat.agency, norad: sat.norad, sizeKm: sat.sizeKm, satrec: twoline2satrec(set.line1, set.line2), epochMs: tleEpochMs(set.line1), live: set.live };
        });
        setData({ missions: craftMissions, orbiters, credit: manifest.source.credit });
      } catch (error) {
        if ((error as Error).name !== "AbortError") console.warn("Spacecraft trajectories unavailable", error);
      }
    })();
    return () => controller.abort();
  }, [start]);
  return data;
};

// --- Entities -------------------------------------------------------------------------------------

/** Half the largest dimension (km), shape and a line for each mission. */
const MISSION_INFO: Record<string, { radiusKm: number; shape: CraftShape; color: [number, number, number]; blurb: string }> = {
  jwst: { radiusKm: 0.0105, shape: "jwst", color: [1, 0.82, 0.45], blurb: "Infrared observatory orbiting the Sun–Earth L2 point, 1.5 million km beyond Earth" },
  "parker-solar-probe": { radiusKm: 0.0015, shape: "parker", color: [1, 0.72, 0.5], blurb: "Flies through the Sun's corona; the fastest object humans have made" },
  "new-horizons": { radiusKm: 0.0021, shape: "probe", color: [0.7, 0.9, 1], blurb: "Flew past Pluto in 2015 and Arrokoth in 2019; now in the Kuiper Belt" },
  "voyager-1": { radiusKm: 0.0185, shape: "voyager", color: [0.6, 0.9, 1], blurb: "Launched 1977; the farthest human-made object, in interstellar space since 2012" },
  "voyager-2": { radiusKm: 0.0185, shape: "voyager", color: [0.6, 0.9, 1], blurb: "Launched 1977; the only spacecraft to visit Uranus and Neptune" },
  juno: { radiusKm: 0.01, shape: "juno", color: [0.8, 0.9, 1], blurb: "Solar-powered orbiter studying Jupiter from pole to pole since 2016" },
  "europa-clipper": { radiusKm: 0.0153, shape: "clipper", color: [0.75, 0.9, 1], blurb: "On its way to Jupiter to study Europa's ice shell and hidden ocean (arrival 2030)" },
  lucy: { radiusKm: 0.0072, shape: "lucy", color: [0.85, 0.85, 1], blurb: "Touring Jupiter's Trojan asteroids, the leftovers of planet formation" },
  psyche: { radiusKm: 0.0125, shape: "clipper", color: [0.85, 0.9, 1], blurb: "Bound for 16 Psyche, a metal-rich asteroid (arrival 2029)" },
  bepicolombo: { radiusKm: 0.016, shape: "clipper", color: [0.85, 0.9, 1], blurb: "ESA–JAXA mission to Mercury, arriving in orbit in late 2026" },
  juice: { radiusKm: 0.0135, shape: "clipper", color: [0.8, 0.88, 1], blurb: "ESA's Jupiter Icy Moons Explorer, bound for Ganymede (arrival 2031)" },
};

const ORBITER_SHAPE: Record<string, CraftShape> = { iss: "iss", hubble: "hubble", tiangong: "tiangong" };

/**
 * Explorer entities for every mission and orbiter. Existing entities with the same id (the Voyagers'
 * straight-line snapshots) gain the real trajectory and keep their old motion outside its span.
 */
export const spacecraftEntities = (data: SpacecraftData, existing: UniverseEntity[]): UniverseEntity[] => {
  const out: UniverseEntity[] = [];
  const byId = new Map(existing.map((entity) => [entity.id, entity]));
  for (const mission of data.missions) {
    const info = MISSION_INFO[mission.id];
    const hint = { index: 0 };
    const trajectory = {
      startMs: mission.startMs,
      stopMs: mission.stopMs,
      sample: (t: number): Vec3 | null => {
        const p = sampleTrajectory(mission.records, t, hint);
        return p ? eclipticToWorld(p[0], p[1], p[2]) : null;
      },
      source: "NASA/JPL Horizons",
      knots: () => {
        const times: number[] = [];
        for (let i = 0; i < mission.records.length; i += STRIDE) times.push(mission.records[i]);
        return times;
      },
    };
    const id = `spacecraft:${mission.id}`;
    const current = byId.get(id);
    if (current) {
      current.trajectory = trajectory;
      current.craft = info?.shape ?? current.craft;
      continue;
    }
    out.push({
      id,
      name: mission.name,
      kind: "spacecraft",
      category: `Spacecraft · ${mission.agency}`,
      parentId: "solar:sun",
      radiusKm: info?.radiusKm ?? 0.005,
      extentKm: info?.radiusKm ?? 0.005,
      color: info?.color ?? [0.75, 0.9, 1],
      importance: 74,
      trajectory,
      craft: info?.shape ?? "probe",
      distanceNote: info?.blurb,
      aliases: ["spacecraft", "probe", "mission", mission.agency, `Horizons ${mission.horizonsId}`],
    });
  }
  const earth = byId.get("solar:planet:earth");
  if (earth) {
    for (const orbiter of data.orbiters) {
      out.push({
        id: `spacecraft:${orbiter.id}`,
        name: orbiter.name,
        kind: "spacecraft",
        category: `Spacecraft · ${orbiter.agency}`,
        parentId: "solar:planet:earth",
        radiusKm: orbiter.sizeKm / 2,
        extentKm: orbiter.sizeKm / 2,
        color: [0.85, 0.95, 1],
        importance: orbiter.id === "iss" ? 82 : 70,
        trajectory: {
          startMs: -Infinity,
          stopMs: Infinity,
          sample: (t: number) => {
            const e = getEntityWorld(earth, t);
            const offset = orbiterOffset(orbiter, t);
            return e && offset ? [e[0] + offset[0], e[1] + offset[1], e[2] + offset[2]] : null;
          },
          source: orbiter.live ? "CelesTrak elements (live), SGP4" : "CelesTrak elements (bundled snapshot), SGP4",
          geocentric: (t: number) => orbiterOffset(orbiter, t),
          elementsEpochMs: orbiter.epochMs,
        },
        craft: ORBITER_SHAPE[orbiter.id] ?? "probe",
        distanceNote: orbiter.id === "iss" ? "Crewed since November 2000, circling Earth every 92 minutes about 420 km up" : orbiter.id === "hubble" ? "Orbiting about 520 km up since 1990" : "China's crewed station, about 390 km up",
        aliases: ["space station", "satellite", "spacecraft", orbiter.agency, `NORAD ${orbiter.norad}`],
      });
    }
  }
  return out;
};
