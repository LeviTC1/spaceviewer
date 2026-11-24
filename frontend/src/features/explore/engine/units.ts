// Physical units and reference-frame transforms for the explorer engine.
//
// World frame: heliocentric, axes aligned with the J2000 ecliptic, right-handed, Y up:
//   world.x = ecliptic.x, world.y = ecliptic.z (ecliptic north), world.z = -ecliptic.y.
// World unit: kilometre, stored in float64 (plain JS numbers). Nothing is ever uploaded to the GPU in
// world units — the renderer subtracts the camera position in float64 first (floating origin).

export type Vec3 = [number, number, number];

export const KM_PER_AU = 149_597_870.7;
export const KM_PER_LY = 9_460_730_472_580.8;
export const LY_PER_PC = 3.261_563_777;
export const KM_PER_PC = KM_PER_LY * LY_PER_PC;
export const KM_PER_KPC = KM_PER_PC * 1_000;
export const KM_PER_MPC = KM_PER_PC * 1_000_000;
export const SUN_RADIUS_KM = 695_700;

const OBLIQUITY_J2000_RAD = (23.439_291_1 * Math.PI) / 180;
const COS_E = Math.cos(OBLIQUITY_J2000_RAD);
const SIN_E = Math.sin(OBLIQUITY_J2000_RAD);

// IAU 1958 / Hipparcos ICRS → Galactic rotation (rows are galactic axes expressed in ICRS).
const ICRS_TO_GAL = [
  [-0.054_875_560_4, -0.873_437_090_2, -0.483_835_015_5],
  [0.494_109_427_9, -0.444_829_630_0, 0.746_982_244_5],
  [-0.867_666_149_0, -0.198_076_373_4, 0.455_983_776_2],
] as const;

// Galactic → Supergalactic (de Vaucouleurs; SGP at l=47.37°, b=6.32°, SGL origin at l=137.37°).
const GAL_TO_SG = [
  [-0.735_742_574_8, 0.677_261_296_4, 0],
  [-0.074_553_778_4, -0.080_991_471_3, 0.993_922_590_4],
  [0.673_145_302_1, 0.731_271_165_8, 0.110_081_262_2],
] as const;

export const eclipticToWorld = (x: number, y: number, z: number): Vec3 => [x, z, -y];
export const worldToEcliptic = (v: Vec3): Vec3 => [v[0], -v[2], v[1]];

export const icrsToEcliptic = (x: number, y: number, z: number): Vec3 => [
  x,
  COS_E * y + SIN_E * z,
  -SIN_E * y + COS_E * z,
];

export const icrsToWorld = (x: number, y: number, z: number): Vec3 => {
  const e = icrsToEcliptic(x, y, z);
  return eclipticToWorld(e[0], e[1], e[2]);
};

export const galacticToIcrs = (x: number, y: number, z: number): Vec3 => [
  ICRS_TO_GAL[0][0] * x + ICRS_TO_GAL[1][0] * y + ICRS_TO_GAL[2][0] * z,
  ICRS_TO_GAL[0][1] * x + ICRS_TO_GAL[1][1] * y + ICRS_TO_GAL[2][1] * z,
  ICRS_TO_GAL[0][2] * x + ICRS_TO_GAL[1][2] * y + ICRS_TO_GAL[2][2] * z,
];

export const galacticToWorld = (x: number, y: number, z: number): Vec3 => {
  const e = galacticToIcrs(x, y, z);
  return icrsToWorld(e[0], e[1], e[2]);
};

export const supergalacticToGalactic = (x: number, y: number, z: number): Vec3 => [
  GAL_TO_SG[0][0] * x + GAL_TO_SG[1][0] * y + GAL_TO_SG[2][0] * z,
  GAL_TO_SG[0][1] * x + GAL_TO_SG[1][1] * y + GAL_TO_SG[2][1] * z,
  GAL_TO_SG[0][2] * x + GAL_TO_SG[1][2] * y + GAL_TO_SG[2][2] * z,
];

export const supergalacticToWorld = (x: number, y: number, z: number): Vec3 => {
  const g = supergalacticToGalactic(x, y, z);
  return galacticToWorld(g[0], g[1], g[2]);
};

/** Unit vector in ICRS for right ascension / declination in degrees. */
export const raDecToIcrsUnit = (raDeg: number, decDeg: number): Vec3 => {
  const ra = (raDeg * Math.PI) / 180;
  const dec = (decDeg * Math.PI) / 180;
  return [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
};

export const raDecDistanceToWorld = (raDeg: number, decDeg: number, distanceKm: number): Vec3 => {
  const u = raDecToIcrsUnit(raDeg, decDeg);
  return icrsToWorld(u[0] * distanceKm, u[1] * distanceKm, u[2] * distanceKm);
};

export const galacticLonLatToWorldUnit = (lDeg: number, bDeg: number): Vec3 => {
  const l = (lDeg * Math.PI) / 180;
  const b = (bDeg * Math.PI) / 180;
  return galacticToWorld(Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b));
};

/** Galactic-north unit vector in world coordinates (used to orient the Milky Way model). */
export const GALACTIC_NORTH_WORLD = galacticToWorld(0, 0, 1);
/** Direction from the Sun toward the Galactic Centre (l = 0, b = 0). */
export const GALACTIC_CENTRE_DIRECTION_WORLD = galacticToWorld(1, 0, 0);
/** GRAVITY Collaboration (2019) R0 = 8.178 kpc. */
export const SUN_GALACTOCENTRIC_DISTANCE_KM = 8.178 * KM_PER_KPC;
export const GALACTIC_CENTRE_WORLD: Vec3 = [
  GALACTIC_CENTRE_DIRECTION_WORLD[0] * SUN_GALACTOCENTRIC_DISTANCE_KM,
  GALACTIC_CENTRE_DIRECTION_WORLD[1] * SUN_GALACTOCENTRIC_DISTANCE_KM,
  GALACTIC_CENTRE_DIRECTION_WORLD[2] * SUN_GALACTOCENTRIC_DISTANCE_KM,
];

export const length3 = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);
export const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add3 = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale3 = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot3 = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross3 = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const normalize3 = (v: Vec3): Vec3 => {
  const l = length3(v);
  return l > 0 ? [v[0] / l, v[1] / l, v[2] / l] : [0, 0, 1];
};
export const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
/** Spherical interpolation of unit vectors (falls back to lerp for tiny angles). */
export const slerpUnit3 = (a: Vec3, b: Vec3, t: number): Vec3 => {
  const d = Math.min(1, Math.max(-1, dot3(a, b)));
  const theta = Math.acos(d);
  if (theta < 1e-5) return normalize3(lerp3(a, b, t));
  if (Math.PI - theta < 1e-3) {
    // Antiparallel: rotate through an arbitrary perpendicular axis.
    const axis = normalize3(Math.abs(a[1]) < 0.9 ? cross3(a, [0, 1, 0]) : cross3(a, [1, 0, 0]));
    const mid = normalize3(cross3(axis, a));
    return t < 0.5 ? slerpUnit3(a, mid, t * 2) : slerpUnit3(mid, b, (t - 0.5) * 2);
  }
  const s = Math.sin(theta);
  const wa = Math.sin((1 - t) * theta) / s;
  const wb = Math.sin(t * theta) / s;
  return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb];
};

// ---------------------------------------------------------------------------------------------
// Human-readable distances. Units step up with magnitude so the user always reads a sensible number.

const formatNumber = (value: number, digits = 3) => {
  if (value >= 100) return Math.round(value).toLocaleString("en-GB");
  return value.toLocaleString("en-GB", { maximumSignificantDigits: digits });
};

export const formatDistanceKm = (km: number): string => {
  if (!Number.isFinite(km)) return "—";
  const a = Math.abs(km);
  if (a < 1) return `${formatNumber(a * 1000)} m`;
  if (a < 1e7) return `${formatNumber(a)} km`;
  if (a < 0.05 * KM_PER_LY) return `${formatNumber(a / KM_PER_AU)} AU`;
  if (a < 1e5 * KM_PER_LY) return `${formatNumber(a / KM_PER_LY)} ly`;
  if (a < 1e9 * KM_PER_LY) return `${formatNumber(a / KM_PER_LY / 1e6)} million ly`;
  return `${formatNumber(a / KM_PER_LY / 1e9)} billion ly`;
};

/** Light travel time, rendered compactly ("8 min 19 s", "4.2 years"). */
export const formatLightTime = (km: number): string => {
  const seconds = Math.abs(km) / 299_792.458;
  if (seconds < 1) return `${(seconds * 1000).toFixed(0)} ms`;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} s`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)} h`;
  const years = seconds / 31_557_600;
  if (years < 1) return `${(seconds / 86400).toFixed(1)} days`;
  if (years < 1e6) return `${formatNumber(years)} years`;
  if (years < 1e9) return `${formatNumber(years / 1e6)} million years`;
  return `${formatNumber(years / 1e9)} billion years`;
};
