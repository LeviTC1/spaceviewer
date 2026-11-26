// The asteroid belt, Jupiter's Trojans, centaurs and the Kuiper Belt from the JPL Small-Body Database
// (scripts/build-minor-bodies.mjs). ~100,000 orbits are drawn by the GPU; the largest bodies become
// named places on two-body orbits.

import { useEffect, useState } from "react";
import { solveKeplerianElementsAtMeanAnomaly } from "../../domain/solar/solarEphemeris";
import type { UniverseEntity } from "./engine/universeModel";
import { eclipticToWorld, KM_PER_AU, type Vec3 } from "./engine/units";

export interface MinorBodyOrbits {
  count: number;
  referenceJulianDate: number;
  /** [a (AU), e, i, Ω, ω, M at the reference date] per body, radians. */
  elements: Float32Array;
  groups: Uint8Array;
  /** Absolute magnitude × 10. */
  magnitudes: Uint8Array;
  groupInfo: Array<{ id: number; key: string; label: string; count: number }>;
  credit: string;
}

export interface NamedMinorBody {
  spkid: string;
  number: number;
  name: string;
  designation: string;
  group: string;
  a: number;
  e: number;
  iDeg: number;
  omDeg: number;
  wDeg: number;
  maDeg: number;
  epochJd: number;
  h: number;
  diameterKm: number | null;
}

interface Manifest {
  format: string;
  source: { credit: string };
  referenceJulianDate: number;
  groups: Array<{ id: number; key: string; label: string; count: number }>;
  orbits: { url: string };
  named: { url: string };
}

export const decodeMinorBodies = (buffer: ArrayBuffer, manifest: Pick<Manifest, "groups" | "source">): MinorBodyOrbits => {
  const view = new DataView(buffer);
  const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (magic !== "SVMB" || view.getUint16(4, true) !== 1) throw new Error("Unexpected minor-body format");
  const count = view.getUint32(8, true);
  const referenceJulianDate = view.getFloat64(16, true);
  const elements = new Float32Array(buffer, 32, count * 6);
  const groups = new Uint8Array(buffer, 32 + count * 24, count);
  const magnitudes = new Uint8Array(buffer, 32 + count * 25, count);
  return { count, referenceJulianDate, elements, groups, magnitudes, groupInfo: manifest.groups, credit: manifest.source.credit };
};

export const useMinorBodies = (start: boolean) => {
  const [state, setState] = useState<{ orbits: MinorBodyOrbits | null; named: NamedMinorBody[] }>({ orbits: null, named: [] });
  useEffect(() => {
    if (!start) return;
    const controller = new AbortController();
    (async () => {
      try {
        const manifest = (await (await fetch("/catalogs/minor-bodies/manifest.json", { signal: controller.signal })).json()) as Manifest;
        if (manifest.format !== "spaceviewer-minor-bodies-v1") throw new Error("Unknown minor-body manifest");
        const [buffer, named] = await Promise.all([
          fetch(manifest.orbits.url, { signal: controller.signal }).then((response) => response.arrayBuffer()),
          fetch(manifest.named.url, { signal: controller.signal }).then((response) => response.json() as Promise<NamedMinorBody[]>),
        ]);
        setState({ orbits: decodeMinorBodies(buffer, manifest), named });
      } catch (error) {
        if ((error as Error).name !== "AbortError") console.warn("Minor-body orbits unavailable", error);
      }
    })();
    return () => controller.abort();
  }, [start]);
  return state;
};

const GROUP_CATEGORY: Record<string, string> = {
  "main-belt": "Asteroid · main belt",
  "belt-edges": "Asteroid",
  trojans: "Jupiter Trojan asteroid",
  "near-earth": "Near-Earth asteroid",
  centaurs: "Centaur",
  kuiper: "Trans-Neptunian object",
};

/** Heliocentric ecliptic J2000 position (km) of a named body at a simulated instant (two-body). */
export const namedBodyPosition = (body: NamedMinorBody, timeMs: number): Vec3 => {
  const jd = timeMs / 86_400_000 + 2_440_587.5;
  const n = 0.985_607_668_6 / body.a ** 1.5;
  const meanAnomalyRad = ((body.maDeg + n * (jd - body.epochJd)) * Math.PI) / 180;
  const { positionAu } = solveKeplerianElementsAtMeanAnomaly(
    {
      semiMajorAxisAU: body.a,
      eccentricity: body.e,
      inclinationDeg: body.iDeg,
      longitudeOfAscendingNodeDeg: body.omDeg,
      argumentOfPeriapsisDeg: body.wDeg,
      meanLongitudeDeg: 0,
      orbitalPeriodDays: 365.25 * body.a ** 1.5,
    },
    meanAnomalyRad,
  );
  return [positionAu.x * KM_PER_AU, positionAu.y * KM_PER_AU, positionAu.z * KM_PER_AU];
};

/** The largest asteroids and trans-Neptunian objects as explorer places. */
export const namedMinorBodyEntities = (named: NamedMinorBody[]): UniverseEntity[] =>
  named.map((body) => {
    // Without a measured size, D = 1329 km / √albedo × 10^(−H/5) with a typical albedo of 0.1.
    const diameter = body.diameterKm ?? (1329 / Math.sqrt(0.1)) * 10 ** (-body.h / 5);
    const albedo = body.diameterKm ? Math.min(1, ((1329 / body.diameterKm) * 10 ** (-body.h / 5)) ** 2) : 0.1;
    return {
      id: `minor:${body.spkid}`,
      name: body.name,
      kind: "dwarf-planet",
      category: GROUP_CATEGORY[body.group] ?? "Minor body",
      parentId: "solar:sun",
      radiusKm: diameter / 2,
      extentKm: diameter / 2,
      color: body.group === "kuiper" ? [0.78, 0.66, 0.6] : [0.66, 0.62, 0.58],
      albedo,
      importance: Math.round(Math.max(34, Math.min(60, 62 - body.h * 2))),
      periodDays: 365.25 * body.a ** 1.5,
      trajectory: {
        startMs: -Infinity,
        stopMs: Infinity,
        sample: (t: number) => {
          const p = namedBodyPosition(body, t);
          return eclipticToWorld(p[0], p[1], p[2]);
        },
        source: "JPL Small-Body Database osculating elements, two-body",
      },
      distanceNote: `${body.diameterKm ? `${Math.round(body.diameterKm).toLocaleString("en-GB")} km across` : `about ${Math.round(diameter).toLocaleString("en-GB")} km across (estimated from brightness)`}; orbits at ${body.a.toFixed(body.a < 10 ? 2 : 1)} AU`,
      aliases: [body.designation, `(${body.number})`, GROUP_CATEGORY[body.group] ?? "", "asteroid", "minor planet"].filter(Boolean),
    };
  });
