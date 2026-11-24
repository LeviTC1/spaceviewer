// The explorer's object model: every catalogue record becomes a UniverseEntity with a physical position
// (float64 km in the world frame), a physical size, and a render family. Positions are never compressed;
// apparent size and brightness fall out of real geometry at render time.

import { getSolarObjectState } from "../../../domain/solar";
import { MOONS } from "../../solar/moonData";
import { PLANETS } from "../../solar/solarData";
import { SMALL_BODIES } from "../../solar/smallBodies/smallBodyData";
import type {
  DeepSkyObjectClass,
  DeepSkyScientificMetadata,
  ExoplanetSystemScientificMetadata,
  SkyObject,
  StarScientificMetadata,
} from "../../skymap/core/objects";
import { getSkyObjectImportanceScore } from "../../skymap/core/objects";
import { VOYAGER_EPHEMERIS_EPOCH_ISO, VOYAGER_SNAPSHOTS } from "../../skymap/layers/interstellarProbesLayer";
import { DEEP_SPACE_SEED_OBJECTS } from "../../skymap/layers/deepSpaceCatalog";

// Curated landmark distances, sizes and classes survive when another catalogue (OpenNGC, LVDB)
// supplies the same object id with fewer fields.
const SEED_BY_ID = new Map(DEEP_SPACE_SEED_OBJECTS.map((seed) => [`deep:${seed.family}:${seed.id}`, seed]));

// Disk orientation for landmark galaxies (position angle east of north; inclination from face-on).
// Values follow standard references (RC3 / NED summaries; M31: Walterbos & Kennicutt; LMC: van der Marel).
const GALAXY_ORIENTATION: Record<string, { pa: number; inclination: number }> = {
  "deep:galaxy:andromeda-galaxy": { pa: 38, inclination: 77 },
  "deep:galaxy:triangulum-galaxy": { pa: 23, inclination: 54 },
  "deep:galaxy:whirlpool-galaxy": { pa: 163, inclination: 22 },
  "deep:galaxy:sombrero-galaxy": { pa: 90, inclination: 84 },
  "deep:galaxy:bodes-galaxy": { pa: 157, inclination: 59 },
  "deep:galaxy:cigar-galaxy": { pa: 65, inclination: 80 },
  "deep:galaxy:pinwheel-galaxy": { pa: 39, inclination: 18 },
  "deep:galaxy:southern-pinwheel-galaxy": { pa: 45, inclination: 24 },
  "deep:galaxy:large-magellanic-cloud": { pa: 170, inclination: 30 },
  "deep:galaxy:small-magellanic-cloud": { pa: 45, inclination: 60 },
};
import {
  GALACTIC_CENTRE_WORLD,
  GALACTIC_NORTH_WORLD,
  KM_PER_AU,
  KM_PER_KPC,
  KM_PER_LY,
  SUN_RADIUS_KM,
  cross3,
  eclipticToWorld,
  galacticToWorld,
  icrsToWorld,
  normalize3,
  raDecToIcrsUnit,
  scale3,
  supergalacticToWorld,
  type Vec3,
} from "./units";

export type EntityKind =
  | "sun"
  | "planet"
  | "dwarf-planet"
  | "moon"
  | "comet"
  | "spacecraft"
  | "star"
  | "exoplanet-system"
  | "galaxy"
  | "nebula"
  | "cluster"
  | "black-hole"
  | "structure";

export type GalaxyMorphology = "spiral" | "barred" | "lenticular" | "elliptical" | "irregular" | "dwarf-spheroidal";
export type NebulaStyle = "emission" | "reflection" | "planetary" | "remnant" | "dark";
export type ClusterStyle = "open" | "globular";

export interface GalaxyShape {
  morphology: GalaxyMorphology;
  /** Unit normal of the disk plane (world). */
  normal: Vec3;
  /** Unit vector along the projected major axis (world), perpendicular to normal. */
  major: Vec3;
  inclinationDeg: number;
  /** Arms, seed for procedural structure. */
  seed: number;
}

export interface UniverseEntity {
  id: string;
  name: string;
  kind: EntityKind;
  /** Display category used for icons and search chips. */
  category: string;
  object?: SkyObject;
  parentId?: string;
  /** Physical radius used for the body and for framing (km). */
  radiusKm: number;
  /** Largest visual extent — rings, halo, disk (km). Used for framing and LOD. */
  extentKm: number;
  color: Vec3;
  /** Absolute visual magnitude for self-luminous objects (stars, galaxies, clusters). */
  absoluteMagnitude?: number;
  /** Visual geometric albedo for reflected-light bodies. */
  albedo?: number;
  importance: number;
  /** Fixed world position (km) for objects that do not move on human timescales. */
  staticWorld?: Vec3;
  /** Direction-only objects (no catalogued distance) sit on the celestial sphere. */
  direction?: Vec3;
  /** Angular diameter (arcmin) for direction-only objects. */
  angularSizeArcMin?: number;
  solarId?: string;
  linearMotion?: { p0: Vec3; vKmS: Vec3; epochMs: number };
  galaxy?: GalaxyShape;
  nebula?: NebulaStyle;
  cluster?: ClusterStyle;
  temperatureK?: number;
  distanceNote?: string;
  /** Orbital period around the parent (days), for orbit sampling. */
  periodDays?: number;
  /** Free-form tags for search. */
  aliases: string[];
}

// ---------------------------------------------------------------------------------------------
// Colour

/** Black-body colour (linear-ish sRGB, normalised to max channel 1) for an effective temperature. */
export const blackbodyColor = (temperatureK: number): Vec3 => {
  const t = Math.min(40_000, Math.max(1_000, temperatureK || 5_800)) / 100;
  let r: number;
  let g: number;
  let b: number;
  if (t <= 66) {
    r = 255;
    g = 99.470_802_586_1 * Math.log(t) - 161.119_568_166_1;
    b = t <= 19 ? 0 : 138.517_731_223_1 * Math.log(t - 10) - 305.044_792_730_7;
  } else {
    r = 329.698_727_446 * Math.pow(t - 60, -0.133_204_759_2);
    g = 288.122_169_528_3 * Math.pow(t - 60, -0.075_514_849_2);
    b = 255;
  }
  const c: Vec3 = [r, g, b].map((v) => Math.min(255, Math.max(0, v)) / 255) as Vec3;
  const max = Math.max(c[0], c[1], c[2], 1e-6);
  return [c[0] / max, c[1] / max, c[2] / max];
};

const hexToRgb = (hex: string | undefined, fallback: Vec3): Vec3 => {
  if (!hex || !/^#?[0-9a-f]{6}$/i.test(hex)) return fallback;
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
};

export const hashString = (value: string) => {
  let hash = 2_166_136_261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
};

// ---------------------------------------------------------------------------------------------
// Solar system

const PLANET_ALBEDO: Record<string, number> = {
  mercury: 0.142,
  venus: 0.689,
  earth: 0.434,
  mars: 0.17,
  jupiter: 0.538,
  saturn: 0.499,
  uranus: 0.488,
  neptune: 0.442,
  pluto: 0.52,
};

const PLANET_COLORS: Record<string, string> = {
  mercury: "#a9a39d",
  venus: "#e9d3a6",
  earth: "#7fa7d9",
  mars: "#c8774f",
  jupiter: "#d9b48a",
  saturn: "#e3cf9c",
  uranus: "#a9dde3",
  neptune: "#5b81d6",
  pluto: "#d7bfa2",
};

const MOON_COLORS: Record<string, string> = {
  moon: "#bdb8b0",
  io: "#e6d36a",
  europa: "#d9cfbd",
  ganymede: "#a99d8c",
  callisto: "#7f766b",
  titan: "#d9a15a",
  enceladus: "#f2f5f8",
  triton: "#d8c9c0",
  phobos: "#7b6f63",
  deimos: "#8a7e70",
};

const RING_OUTER_KM: Record<string, number> = { saturn: 140_220, uranus: 51_149, jupiter: 129_000, neptune: 62_932 };

const solarPositionCache = new Map<string, { t: number; v: Vec3 }>();

const resolveSolarWorld = (solarId: string, timeMs: number): Vec3 | null => {
  const cached = solarPositionCache.get(solarId);
  if (cached && cached.t === timeMs) return cached.v;
  const state = getSolarObjectState(solarId as never, new Date(timeMs));
  if (!state) return null;
  const p = state.positionAu;
  const v = eclipticToWorld(p.x * KM_PER_AU, p.y * KM_PER_AU, p.z * KM_PER_AU);
  solarPositionCache.set(solarId, { t: timeMs, v });
  return v;
};

const buildSolarEntities = (): UniverseEntity[] => {
  const entities: UniverseEntity[] = [
    {
      id: "solar:sun",
      name: "Sun",
      kind: "sun",
      category: "Star",
      radiusKm: SUN_RADIUS_KM,
      extentKm: SUN_RADIUS_KM * 3,
      color: blackbodyColor(5_772),
      absoluteMagnitude: 4.83,
      importance: 100,
      staticWorld: [0, 0, 0],
      temperatureK: 5_772,
      aliases: ["Sol", "the Sun", "G2V"],
    },
  ];
  for (const planet of PLANETS) {
    const ringOuter = RING_OUTER_KM[planet.id];
    entities.push({
      id: `solar:planet:${planet.id}`,
      name: planet.name,
      kind: planet.id === "pluto" ? "dwarf-planet" : "planet",
      category: planet.id === "pluto" ? "Dwarf planet" : "Planet",
      parentId: "solar:sun",
      radiusKm: planet.radiusKm,
      extentKm: planet.id === "saturn" || planet.id === "uranus" ? ringOuter : planet.radiusKm,
      color: hexToRgb(PLANET_COLORS[planet.id], [0.8, 0.8, 0.8]),
      albedo: PLANET_ALBEDO[planet.id] ?? 0.3,
      importance: planet.id === "pluto" ? 78 : 92,
      solarId: planet.id,
      periodDays: planet.orbitalPeriodDays,
      aliases: [planet.searchQuery],
    });
  }
  for (const moon of MOONS) {
    entities.push({
      id: `solar:moon:${moon.id}`,
      name: moon.name,
      kind: "moon",
      category: "Moon",
      parentId: `solar:planet:${moon.parentPlanet}`,
      radiusKm: moon.radiusKm,
      extentKm: moon.radiusKm,
      color: hexToRgb(MOON_COLORS[moon.id], [0.72, 0.7, 0.66]),
      albedo: moon.id === "enceladus" ? 1.0 : moon.id === "europa" ? 0.67 : moon.id === "io" ? 0.63 : moon.id === "callisto" ? 0.22 : 0.3,
      importance: moon.id === "moon" ? 88 : moon.radiusKm > 1000 ? 70 : moon.radiusKm > 200 ? 52 : 34,
      solarId: moon.id,
      periodDays: Math.abs(moon.orbitalPeriodDays),
      aliases: [`moon of ${moon.parentPlanet}`],
    });
  }
  for (const body of SMALL_BODIES) {
    entities.push({
      id: `solar:small-body:${body.id}`,
      name: body.name,
      kind: body.kind === "comet" ? "comet" : "dwarf-planet",
      category: body.kind === "comet" ? "Comet" : "Dwarf planet",
      parentId: "solar:sun",
      radiusKm: body.radiusKm,
      extentKm: body.kind === "comet" ? body.radiusKm * 40 : body.radiusKm,
      color: hexToRgb(body.colorHint, [0.7, 0.68, 0.64]),
      albedo: body.kind === "comet" ? 0.04 : 0.5,
      importance: body.kind === "comet" ? 46 : 58,
      solarId: body.id,
      periodDays: body.orbit.orbitalPeriodDays,
      aliases: [body.catalogName, ...body.aliases],
    });
  }
  const voyagerEpoch = Date.parse(VOYAGER_EPHEMERIS_EPOCH_ISO);
  for (const snapshot of VOYAGER_SNAPSHOTS) {
    const p = snapshot.positionAu;
    const v = snapshot.velocityAuPerDay;
    entities.push({
      id: snapshot.id,
      name: snapshot.name,
      kind: "spacecraft",
      category: "Spacecraft",
      parentId: "solar:sun",
      radiusKm: 0.0185,
      extentKm: 0.0185,
      color: hexToRgb(snapshot.color, [0.6, 0.9, 1]),
      importance: 80,
      linearMotion: {
        p0: eclipticToWorld(p[0] * KM_PER_AU, p[1] * KM_PER_AU, p[2] * KM_PER_AU),
        vKmS: eclipticToWorld((v[0] * KM_PER_AU) / 86_400, (v[1] * KM_PER_AU) / 86_400, (v[2] * KM_PER_AU) / 86_400),
        epochMs: voyagerEpoch,
      },
      aliases: ["Voyager", "interstellar probe", "spacecraft", "NASA"],
    });
  }
  return entities;
};

// ---------------------------------------------------------------------------------------------
// Catalogue objects

const DEG = Math.PI / 180;

const toGalaxyMorphology = (objectClass: DeepSkyObjectClass | undefined, hubble?: string): GalaxyMorphology => {
  if (objectClass === "barred-spiral-galaxy" || /^SB/i.test(hubble ?? "")) return "barred";
  if (objectClass === "spiral-galaxy" || /^S[a-d]/i.test(hubble ?? "")) return "spiral";
  if (objectClass === "elliptical-galaxy" || /^E\d?/i.test(hubble ?? "")) return "elliptical";
  if (objectClass === "lenticular-galaxy" || /^S0/i.test(hubble ?? "")) return "lenticular";
  if (objectClass === "irregular-galaxy" || objectClass === "dwarf-irregular-galaxy" || /^I/i.test(hubble ?? "")) return "irregular";
  if (objectClass === "dwarf-spheroidal-galaxy" || /dSph|dE/i.test(hubble ?? "")) return "dwarf-spheroidal";
  return "spiral";
};

const toNebulaStyle = (objectClass: DeepSkyObjectClass | undefined): NebulaStyle => {
  switch (objectClass) {
    case "planetary-nebula":
      return "planetary";
    case "supernova-remnant":
      return "remnant";
    case "reflection-nebula":
      return "reflection";
    case "dark-nebula":
      return "dark";
    default:
      return "emission";
  }
};

/**
 * Sky-plane basis at a world direction: line of sight L, north N (toward the celestial pole) and east E.
 */
const skyBasis = (raDeg: number, decDeg: number) => {
  const ra = raDeg * DEG;
  const dec = decDeg * DEG;
  const L = raDecToIcrsUnit(raDeg, decDeg);
  const N: Vec3 = [-Math.sin(dec) * Math.cos(ra), -Math.sin(dec) * Math.sin(ra), Math.cos(dec)];
  const E: Vec3 = [-Math.sin(ra), Math.cos(ra), 0];
  return {
    L: normalize3(icrsToWorld(...L)),
    N: normalize3(icrsToWorld(...N)),
    E: normalize3(icrsToWorld(...E)),
  };
};

/** Disk orientation from sky position angle and axis ratio (Hubble 1926 thin-disk inclination with q0=0.2). */
export const galaxyOrientation = (raDeg: number, decDeg: number, positionAngleDeg: number, axisRatio: number, seed: number) => {
  const { L, N, E } = skyBasis(raDeg, decDeg);
  const pa = positionAngleDeg * DEG;
  const major = normalize3([
    N[0] * Math.cos(pa) + E[0] * Math.sin(pa),
    N[1] * Math.cos(pa) + E[1] * Math.sin(pa),
    N[2] * Math.cos(pa) + E[2] * Math.sin(pa),
  ]);
  const q = Math.min(1, Math.max(0.05, axisRatio));
  const q0 = 0.2;
  const cos2i = Math.max(0, (q * q - q0 * q0) / (1 - q0 * q0));
  const inclination = Math.acos(Math.sqrt(cos2i));
  const minorOnSky = normalize3(cross3(L, major));
  const sign = seed % 2 === 0 ? 1 : -1;
  // Normal tilted away from the line of sight by the inclination, within the plane spanned by L and the minor axis.
  const normal = normalize3([
    -L[0] * Math.cos(inclination) + minorOnSky[0] * Math.sin(inclination) * sign,
    -L[1] * Math.cos(inclination) + minorOnSky[1] * Math.sin(inclination) * sign,
    -L[2] * Math.cos(inclination) + minorOnSky[2] * Math.sin(inclination) * sign,
  ]);
  return { normal, major, inclinationDeg: inclination / DEG };
};

const estimateGalaxyRadiusKpc = (absoluteMagnitudeV: number | undefined) => {
  if (absoluteMagnitudeV === undefined || !Number.isFinite(absoluteMagnitudeV)) return 2;
  return Math.min(35, Math.max(0.25, Math.pow(10, (-absoluteMagnitudeV - 14.5) / 5)));
};

const deepSkyEntity = (object: SkyObject): UniverseEntity | null => {
  const rawSci = (object.scientific ?? {}) as DeepSkyScientificMetadata;
  const seed = SEED_BY_ID.get(object.id);
  const sci: DeepSkyScientificMetadata = seed
    ? {
        ...rawSci,
        distanceLy: rawSci.distanceLy ?? (rawSci.distanceKpc ? undefined : seed.distanceLy),
        angularSizeArcMin: rawSci.angularSizeArcMin ?? seed.angularSizeArcMin,
        objectClass: rawSci.objectClass && rawSci.objectClass !== "galaxy" ? rawSci.objectClass : seed.objectClass,
      }
    : rawSci;
  const importance = getSkyObjectImportanceScore(object);
  const hashSeed = hashString(object.id);
  let raDeg = sci.raDeg;
  let decDeg = sci.decDeg;
  if ((raDeg === undefined || decDeg === undefined) && object.position.mode === "spherical") {
    raDeg = object.position.longitude;
    decDeg = object.position.latitude;
  }
  let world: Vec3 | undefined;
  let distanceKm: number | undefined;
  if (sci.supergalacticKpc) {
    world = supergalacticToWorld(sci.supergalacticKpc.x * KM_PER_KPC, sci.supergalacticKpc.y * KM_PER_KPC, sci.supergalacticKpc.z * KM_PER_KPC);
    distanceKm = Math.hypot(...world);
  } else if (raDeg !== undefined && decDeg !== undefined) {
    const d = sci.distanceLy ? sci.distanceLy * KM_PER_LY : sci.distanceKpc ? sci.distanceKpc * KM_PER_KPC : undefined;
    if (d) {
      const u = raDecToIcrsUnit(raDeg, decDeg);
      world = icrsToWorld(u[0] * d, u[1] * d, u[2] * d);
      distanceKm = d;
    }
  }
  if ((raDeg === undefined || decDeg === undefined) && world) {
    // Recover sky angles from the world vector for orientation purposes.
    const icrs = worldToIcrsUnit(normalize3(world));
    raDeg = (Math.atan2(icrs[1], icrs[0]) / DEG + 360) % 360;
    decDeg = Math.asin(icrs[2]) / DEG;
  }
  if (raDeg === undefined || decDeg === undefined) return null;
  const direction = normalize3(icrsToWorld(...raDecToIcrsUnit(raDeg, decDeg)));
  const angular = sci.angularSizeArcMin ?? (object.kind === "galaxy" ? 3 : 4);
  const minorAngular = sci.minorAngularSizeArcMin ?? angular * (object.kind === "galaxy" ? 0.6 : 0.8);
  const physicalRadius = distanceKm
    ? distanceKm * Math.tan((angular / 60 / 2) * DEG)
    : undefined;

  const base = {
    id: object.id,
    name: object.name,
    object,
    importance,
    aliases: [...(object.search?.aliases ?? []), ...(sci.catalogIds ?? [])],
    staticWorld: world,
    direction: world ? undefined : direction,
    angularSizeArcMin: angular,
    distanceNote: world ? undefined : "Direction from OpenNGC; no catalogued distance, so it is drawn on the celestial sphere.",
  };

  if (object.kind === "galaxy") {
    const morphology = toGalaxyMorphology(sci.objectClass, sci.hubbleType);
    const known = GALAXY_ORIENTATION[object.id];
    const axisRatio = known
      ? Math.sqrt(Math.cos((known.inclination * Math.PI) / 180) ** 2 * (1 - 0.04) + 0.04)
      : minorAngular / Math.max(0.01, angular);
    const orientation = galaxyOrientation(raDeg, decDeg, known?.pa ?? sci.positionAngleDeg ?? (hashSeed % 180), axisRatio, hashSeed);
    const radius = physicalRadius ?? (distanceKm ? estimateGalaxyRadiusKpc(sci.absoluteMagnitudeV) * KM_PER_KPC : 0);
    const radiusKm = sci.angularSizeArcMin || !distanceKm ? radius : estimateGalaxyRadiusKpc(sci.absoluteMagnitudeV) * KM_PER_KPC;
    return {
      ...base,
      kind: "galaxy",
      category: morphology === "elliptical" ? "Elliptical galaxy" : morphology === "irregular" ? "Irregular galaxy" : morphology === "dwarf-spheroidal" ? "Dwarf galaxy" : morphology === "lenticular" ? "Lenticular galaxy" : "Spiral galaxy",
      radiusKm: radiusKm || 1,
      extentKm: (radiusKm || 1) * 1.15,
      color: morphology === "elliptical" || morphology === "dwarf-spheroidal" ? [1, 0.86, 0.68] : [0.86, 0.9, 1],
      absoluteMagnitude: sci.absoluteMagnitudeV,
      galaxy: { morphology, ...orientation, seed: hashSeed },
    };
  }
  if (object.kind === "nebula") {
    const style = toNebulaStyle(sci.objectClass);
    const radiusKm = physicalRadius ?? 1;
    return {
      ...base,
      kind: "nebula",
      category: style === "planetary" ? "Planetary nebula" : style === "remnant" ? "Supernova remnant" : style === "reflection" ? "Reflection nebula" : style === "dark" ? "Dark nebula" : "Emission nebula",
      radiusKm,
      extentKm: radiusKm,
      color: hexToRgb(object.visual?.color, style === "reflection" ? [0.5, 0.7, 1] : style === "planetary" ? [0.4, 0.95, 0.85] : [1, 0.45, 0.55]),
      nebula: style,
    };
  }
  if (object.kind === "star-cluster") {
    const style: ClusterStyle = sci.objectClass === "globular-cluster" ? "globular" : "open";
    const radiusKm = physicalRadius ?? 1;
    return {
      ...base,
      kind: "cluster",
      category: style === "globular" ? "Globular cluster" : "Open cluster",
      radiusKm,
      extentKm: radiusKm,
      color: style === "globular" ? [1, 0.88, 0.7] : [0.72, 0.84, 1],
      cluster: style,
    };
  }
  return null;
};

const worldToIcrsUnit = (w: Vec3): Vec3 => {
  // Inverse of icrsToWorld (orthonormal): world → ecliptic → ICRS.
  const ex = w[0];
  const ey = -w[2];
  const ez = w[1];
  const e = (23.439_291_1 * Math.PI) / 180;
  return [ex, Math.cos(e) * ey - Math.sin(e) * ez, Math.sin(e) * ey + Math.cos(e) * ez];
};

/** Effective temperature from an MK spectral type when the catalogue gives no Teff (e.g. "M5.5Ve" → ~3,050 K). */
export const temperatureFromSpectralType = (spectralType: string | undefined): number | undefined => {
  const match = /^\s*([OBAFGKM])\s*(\d(?:\.\d)?)?/i.exec(spectralType ?? "");
  if (!match) return undefined;
  const anchors: Record<string, [number, number]> = {
    O: [41_000, 31_000],
    B: [31_000, 10_500],
    A: [10_000, 7_400],
    F: [7_300, 6_050],
    G: [5_950, 5_300],
    K: [5_250, 3_950],
    M: [3_850, 2_400],
  };
  const [hot, cool] = anchors[match[1].toUpperCase()];
  const sub = Math.min(9.5, Math.max(0, Number(match[2] ?? 5)));
  return hot + (cool - hot) * (sub / 9.5);
};

const starEntity = (object: SkyObject): UniverseEntity | null => {
  if (object.position.mode !== "cartesian" || object.position.unit !== "light-year") return null;
  const sci = (object.scientific ?? {}) as StarScientificMetadata;
  const p = object.position;
  const world = icrsToWorld(p.x * KM_PER_LY, p.y * KM_PER_LY, p.z * KM_PER_LY);
  const temperature = sci.temperatureK ?? temperatureFromSpectralType(sci.spectralType) ?? 5_800;
  const luminosity = sci.luminositySolar;
  const radiusSolar = luminosity ? Math.sqrt(luminosity) / Math.pow(temperature / 5_772, 2) : 1;
  const distanceLy = Math.hypot(p.x, p.y, p.z);
  const absMag = sci.absoluteMagnitude ?? (sci.apparentMagnitude !== undefined ? sci.apparentMagnitude - 5 * Math.log10(Math.max(1e-3, distanceLy / 3.2616) / 10) : luminosity ? 4.83 - 2.5 * Math.log10(luminosity) : 5);
  const isGaiaAnonymous = object.name.startsWith("Gaia DR3");
  return {
    id: object.id,
    name: object.name,
    kind: "star",
    category: sci.spectralType ? `Star · ${sci.spectralType}` : "Star",
    object,
    radiusKm: Math.min(2_000, Math.max(0.01, radiusSolar)) * SUN_RADIUS_KM,
    extentKm: Math.min(2_000, Math.max(0.01, radiusSolar)) * SUN_RADIUS_KM,
    color: blackbodyColor(temperature),
    absoluteMagnitude: absMag,
    importance: isGaiaAnonymous ? 4 : Math.max(30, getSkyObjectImportanceScore(object)),
    staticWorld: world,
    temperatureK: temperature,
    aliases: object.search?.aliases ?? [],
  };
};

const exoplanetEntity = (object: SkyObject): UniverseEntity | null => {
  const sci = object.scientific as ExoplanetSystemScientificMetadata | undefined;
  if (!sci?.distanceLy) return null;
  const u = raDecToIcrsUnit(sci.raDeg, sci.decDeg);
  const d = sci.distanceLy * KM_PER_LY;
  const maxA = Math.max(0.05, ...sci.planets.map((planet) => planet.semiMajorAxisAu ?? 0));
  const temperature = sci.stellarTemperatureK ?? 4_500;
  return {
    id: object.id,
    name: object.name,
    kind: "exoplanet-system",
    category: `${sci.planetCount} confirmed planet${sci.planetCount === 1 ? "" : "s"}`,
    object,
    radiusKm: SUN_RADIUS_KM * 0.8,
    extentKm: maxA * KM_PER_AU * 1.1,
    color: blackbodyColor(temperature),
    absoluteMagnitude: sci.apparentMagnitudeV !== undefined ? sci.apparentMagnitudeV - 5 * Math.log10(sci.distancePc / 10) : 6,
    importance: Math.max(36, getSkyObjectImportanceScore(object)),
    staticWorld: icrsToWorld(u[0] * d, u[1] * d, u[2] * d),
    temperatureK: temperature,
    aliases: [sci.hostName, ...sci.planets.map((planet) => planet.name), ...(object.search?.aliases ?? [])],
  };
};

const galacticEntities = (): UniverseEntity[] => [
  {
    id: "galactic:milky-way-structure",
    name: "Milky Way",
    kind: "structure",
    category: "Barred spiral galaxy (home)",
    radiusKm: 15 * KM_PER_KPC,
    extentKm: 17 * KM_PER_KPC,
    color: [0.92, 0.9, 1],
    absoluteMagnitude: -20.8,
    importance: 96,
    staticWorld: GALACTIC_CENTRE_WORLD,
    galaxy: {
      morphology: "barred",
      normal: GALACTIC_NORTH_WORLD,
      major: normalize3(galacticToWorld(Math.cos(27 * DEG), Math.sin(27 * DEG), 0)),
      inclinationDeg: 0,
      seed: 7,
    },
    aliases: ["our galaxy", "the Galaxy", "home galaxy"],
  },
  {
    id: "explore:sagittarius-a-star",
    name: "Sagittarius A*",
    kind: "black-hole",
    category: "Supermassive black hole",
    // Schwarzschild radius for 4.30 million solar masses (GRAVITY 2022) ≈ 1.27e7 km.
    radiusKm: 1.27e7,
    extentKm: 1.27e7 * 18,
    color: [1, 0.72, 0.4],
    importance: 90,
    staticWorld: GALACTIC_CENTRE_WORLD,
    aliases: ["Sgr A*", "galactic centre", "galactic center", "black hole", "Milky Way centre"],
  },
];

export interface UniverseIndex {
  entities: UniverseEntity[];
  byId: Map<string, UniverseEntity>;
  children: Map<string, UniverseEntity[]>;
}

/** Build the explorer's entity index from the SkyMap registry objects plus solar and galactic natives. */
export const buildUniverseIndex = (objects: SkyObject[]): UniverseIndex => {
  const entities = [...buildSolarEntities(), ...galacticEntities()];
  const seen = new Set(entities.map((entity) => entity.id));
  const solarObjects = new Map<string, SkyObject>();
  for (const object of objects) {
    if (object.id.startsWith("solar:") || object.id.startsWith("spacecraft:")) {
      solarObjects.set(object.id, object);
      continue;
    }
    if (seen.has(object.id)) continue;
    let entity: UniverseEntity | null = null;
    if (object.kind === "star") entity = starEntity(object);
    else if (object.kind === "exoplanet-system") entity = exoplanetEntity(object);
    else if (object.kind === "galaxy" || object.kind === "nebula" || object.kind === "star-cluster") entity = deepSkyEntity(object);
    if (entity) {
      seen.add(entity.id);
      entities.push(entity);
    }
  }
  for (const entity of entities) {
    const object = solarObjects.get(entity.id);
    if (object) entity.object = object;
    if (entity.id === "galactic:milky-way-structure") {
      entity.object = objects.find((candidate) => candidate.id === entity.id) ?? entity.object;
    }
  }
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const children = new Map<string, UniverseEntity[]>();
  for (const entity of entities) {
    if (!entity.parentId) continue;
    const list = children.get(entity.parentId) ?? [];
    list.push(entity);
    children.set(entity.parentId, list);
  }
  return { entities, byId, children };
};

/** World position (km) of an entity at a simulated instant. Direction-only entities return null. */
export const getEntityWorld = (entity: UniverseEntity, timeMs: number): Vec3 | null => {
  if (entity.solarId) return resolveSolarWorld(entity.solarId, timeMs) ?? entity.staticWorld ?? null;
  if (entity.linearMotion) {
    const dt = (timeMs - entity.linearMotion.epochMs) / 1000;
    const { p0, vKmS } = entity.linearMotion;
    return [p0[0] + vKmS[0] * dt, p0[1] + vKmS[1] * dt, p0[2] + vKmS[2] * dt];
  }
  return entity.staticWorld ?? null;
};

/** Representative point for direction-only entities: far enough to be "at infinity" from anywhere we fly. */
export const SKY_SPHERE_RADIUS_KM = 1e24;
export const getEntityRenderWorld = (entity: UniverseEntity, timeMs: number, cameraWorld: Vec3): Vec3 => {
  const world = getEntityWorld(entity, timeMs);
  if (world) return world;
  const d = entity.direction ?? [0, 0, 1];
  return [cameraWorld[0] + d[0] * SKY_SPHERE_RADIUS_KM, cameraWorld[1] + d[1] * SKY_SPHERE_RADIUS_KM, cameraWorld[2] + d[2] * SKY_SPHERE_RADIUS_KM];
};

export const isDirectionOnly = (entity: UniverseEntity) => !entity.solarId && !entity.linearMotion && !entity.staticWorld;

export const scaleVec = scale3;
