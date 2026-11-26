// The naked-eye sky in 3-D: the bright stars Gaia cannot measure (from XHIP / Hipparcos), the IAU
// constellation figures joined between real stars at their real distances, and named stars as places
// you can find and fly to. Built by scripts/build-bright-stars.mjs into public/catalogs/sky/.

import { useEffect, useState } from "react";
import { blackbodyColor, temperatureFromSpectralType, type UniverseEntity } from "./engine/universeModel";
import { icrsToWorld, KM_PER_LY, type Vec3 } from "./engine/units";
import { colorTable, decodeGalaxyChunk, type GalaxyStarChunk } from "./galaxyStars";

export interface FigureStar {
  hip: number;
  /** IAU proper name, when the star has one. */
  name: string | null;
  /** Bayer / Flamsteed designation from XHIP ("58 Alpha Orionis"). */
  designation: string | null;
  constellation: string | null;
  v: number;
  bv: number | null;
  spType: string | null;
  raDeg: number;
  decDeg: number;
  distanceLy: number;
  distanceSource: "gaia-dr3" | "hipparcos-2007" | "hipparcos-lower-limit";
  /** Heliocentric ICRS position, light-years. */
  xyz: [number, number, number];
}

export interface ConstellationFigure {
  id: string;
  name: string;
  /** 1 = major, 3 = faint (d3-celestial rank). */
  rank: number;
  labelRaDeg: number;
  labelDecDeg: number;
  /** Polylines as HIP numbers. */
  lines: number[][];
}

export interface SkyCulture {
  constellations: ConstellationFigure[];
  stars: FigureStar[];
  starsByHip: Map<number, FigureStar>;
  sources: Record<string, unknown>;
}

interface BrightManifest {
  format: string;
  temperatureIndex: { min: number; max: number };
  chunks: Array<{ url: string; count: number }>;
  figures: { url: string };
}

/** Loads the bright-star chunk and the constellation figures once `start` is true. */
export const useSkyCulture = (start: boolean) => {
  const [state, setState] = useState<{ bright: GalaxyStarChunk[]; culture: SkyCulture | null }>({ bright: [], culture: null });
  useEffect(() => {
    if (!start) return;
    const controller = new AbortController();
    (async () => {
      try {
        const manifest = (await (await fetch("/catalogs/sky/manifest.json", { signal: controller.signal })).json()) as BrightManifest;
        if (manifest.format !== "spaceviewer-gaia-points-v1") throw new Error("Unknown bright-star manifest");
        const table = colorTable(manifest.temperatureIndex.min, manifest.temperatureIndex.max);
        const [buffer, figures] = await Promise.all([
          fetch(manifest.chunks[0].url, { signal: controller.signal }).then((response) => response.arrayBuffer()),
          fetch(manifest.figures.url, { signal: controller.signal }).then((response) => response.json() as Promise<Omit<SkyCulture, "starsByHip">>),
        ]);
        const culture: SkyCulture = { ...figures, starsByHip: new Map(figures.stars.map((star) => [star.hip, star])) };
        setState({ bright: [decodeGalaxyChunk(buffer, table)], culture });
      } catch (error) {
        if ((error as Error).name !== "AbortError") console.warn("Bright stars and constellations unavailable", error);
      }
    })();
    return () => controller.abort();
  }, [start]);
  return state;
};

const GREEK: Record<string, string> = {
  Alpha: "α", Beta: "β", Gamma: "γ", Delta: "δ", Epsilon: "ε", Zeta: "ζ", Eta: "η", Theta: "θ", Iota: "ι", Kappa: "κ", Lambda: "λ", Mu: "μ",
  Nu: "ν", Xi: "ξ", Omicron: "ο", Pi: "π", Rho: "ρ", Sigma: "σ", Tau: "τ", Upsilon: "υ", Phi: "φ", Chi: "χ", Psi: "ψ", Omega: "ω",
};

/** "58 Alpha Orionis" → "Alpha Orionis" (the Flamsteed number is dropped for readability). */
export const readableDesignation = (designation: string | null) => (designation ? designation.replace(/^\d+\s+/, "") : null);

const greekDesignation = (designation: string | null) => {
  const readable = readableDesignation(designation);
  if (!readable) return null;
  const [first, ...rest] = readable.split(" ");
  const base = first.split("-")[0];
  return GREEK[base] ? `${GREEK[base]}${first.includes("-") ? first.split("-")[1] : ""} ${rest.join(" ")}` : null;
};

const SUN_RADIUS_KM = 695_700;
const LY_PER_PC = 3.261_563_777;

const temperatureFromBv = (bv: number | null) => {
  if (bv === null) return undefined;
  const c = Math.min(2, Math.max(-0.4, bv));
  return 4600 * (1 / (0.92 * c + 1.7) + 1 / (0.92 * c + 0.62));
};

/**
 * Named naked-eye stars as explorer places (Betelgeuse, Rigel, Deneb…). Stars the explorer already
 * knows (the curated nearby stars) keep their entry and gain the IAU name as an alias instead.
 */
export const brightStarEntities = (culture: SkyCulture, existing: UniverseEntity[]): UniverseEntity[] => {
  const known = existing.filter((entity) => entity.kind === "star" && entity.staticWorld);
  const out: UniverseEntity[] = [];
  for (const star of culture.stars) {
    if (!star.name) continue;
    const world = icrsToWorld(star.xyz[0] * KM_PER_LY, star.xyz[1] * KM_PER_LY, star.xyz[2] * KM_PER_LY);
    const distanceKm = star.distanceLy * KM_PER_LY;
    const duplicate = known.find((entity) => {
      const w = entity.staticWorld as Vec3;
      const d = Math.hypot(w[0], w[1], w[2]);
      if (Math.abs(d - distanceKm) > 0.2 * distanceKm) return false;
      const cos = (w[0] * world[0] + w[1] * world[1] + w[2] * world[2]) / Math.max(1, d * distanceKm);
      return cos > Math.cos((0.3 * Math.PI) / 180);
    });
    const designation = readableDesignation(star.designation);
    if (duplicate) {
      for (const alias of [star.name, designation, `HIP ${star.hip}`]) if (alias && !duplicate.aliases.includes(alias) && alias !== duplicate.name) duplicate.aliases.push(alias);
      continue;
    }
    const temperature = temperatureFromBv(star.bv) ?? temperatureFromSpectralType(star.spType ?? undefined) ?? 5_800;
    const absoluteMagnitude = star.v - 5 * (Math.log10(star.distanceLy / LY_PER_PC) - 1);
    const luminositySolar = Math.pow(10, (4.83 - absoluteMagnitude) / 2.5);
    const radiusSolar = Math.min(2_000, Math.max(0.05, Math.sqrt(luminositySolar) / Math.pow(temperature / 5_772, 2)));
    out.push({
      id: `hip:${star.hip}`,
      name: star.name,
      kind: "star",
      category: star.spType ? `Star · ${star.spType.trim()}` : "Star",
      radiusKm: radiusSolar * SUN_RADIUS_KM,
      extentKm: radiusSolar * SUN_RADIUS_KM,
      color: blackbodyColor(temperature),
      absoluteMagnitude,
      // Brighter stars in our sky matter more for labels and search.
      importance: Math.round(Math.min(80, Math.max(30, 62 - star.v * 7))),
      staticWorld: world,
      temperatureK: temperature,
      distanceNote:
        star.distanceSource === "gaia-dr3"
          ? "Gaia DR3 parallax"
          : star.distanceSource === "hipparcos-2007"
            ? "Hipparcos parallax (van Leeuwen 2007, via XHIP)"
            : "Hipparcos parallax too uncertain: at least this far",
      aliases: [designation, greekDesignation(star.designation), `HIP ${star.hip}`].filter((alias): alias is string => Boolean(alias)),
      sky: { raDeg: star.raDeg, decDeg: star.decDeg },
    });
  }
  return out;
};

/** HIP number of a star entity (its id, or an alias the bright-star merge added). */
export const hipOf = (entity: UniverseEntity) => {
  if (entity.id.startsWith("hip:")) return Number(entity.id.slice(4));
  const alias = entity.aliases.find((value) => /^HIP \d+$/.test(value));
  return alias ? Number(alias.slice(4)) : null;
};

/** The constellation figure a star belongs to, with the spread of its stars' distances. */
export const figureFor = (culture: SkyCulture, entity: UniverseEntity) => {
  if (entity.kind !== "star") return null;
  const hip = hipOf(entity);
  if (!hip) return null;
  const figure = culture.constellations.find((item) => item.lines.some((line) => line.includes(hip)));
  if (!figure) return null;
  const hips = new Set(figure.lines.flat());
  const distances = [...hips].map((value) => culture.starsByHip.get(value)?.distanceLy).filter((value): value is number => Number.isFinite(value));
  return { figure, nearestLy: Math.min(...distances), farthestLy: Math.max(...distances), stars: hips.size };
};
