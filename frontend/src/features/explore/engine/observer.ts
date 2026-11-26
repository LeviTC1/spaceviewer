// Standing on the Earth: the local horizon frame (zenith, north, east) for a place and an instant, in
// the explorer's world frame, plus altitude / azimuth helpers.
//
// Earth rotation uses Greenwich mean sidereal time (IAU 1982, as in the Astronomical Almanac), and the
// equator of date is brought back to J2000 with the IAU 1976 precession angles (Lieske 1977), so a star's
// catalogue (J2000) position lands where it really is in tonight's sky to well under a tenth of a degree.
// Nutation (≤ 20″), polar motion and UT1 − UTC (< 1 s) are ignored; refraction is not applied.

import { cross3, dot3, icrsToWorld, normalize3, type Vec3 } from "./units";

const DEG = Math.PI / 180;
const ARCSEC = DEG / 3600;
export const EARTH_RADIUS_KM = 6_371;

export const julianDay = (timeMs: number) => timeMs / 86_400_000 + 2_440_587.5;

/** Greenwich mean sidereal time in radians (0…2π). */
export const gmstRad = (timeMs: number) => {
  const d = julianDay(timeMs) - 2_451_545.0;
  const t = d / 36_525;
  const deg = 280.460_618_37 + 360.985_647_366_29 * d + 0.000_387_933 * t * t - (t * t * t) / 38_710_000;
  return ((((deg % 360) + 360) % 360) * DEG);
};

/** Rotates a vector from the mean equator of date to J2000 (transpose of the IAU 1976 precession matrix). */
export const dateToJ2000 = (v: Vec3, timeMs: number): Vec3 => {
  const t = (julianDay(timeMs) - 2_451_545.0) / 36_525;
  const zeta = (2306.2181 * t + 0.301_88 * t * t + 0.017_998 * t * t * t) * ARCSEC;
  const z = (2306.2181 * t + 1.094_68 * t * t + 0.018_203 * t * t * t) * ARCSEC;
  const theta = (2004.3109 * t - 0.426_65 * t * t - 0.041_833 * t * t * t) * ARCSEC;
  const [cz, sz, cZ, sZ, ct, st] = [Math.cos(zeta), Math.sin(zeta), Math.cos(z), Math.sin(z), Math.cos(theta), Math.sin(theta)];
  // P = R3(−z) · R2(θ) · R3(−ζ); rows below are P's, and we apply Pᵀ.
  const p = [
    [cz * ct * cZ - sz * sZ, -sz * ct * cZ - cz * sZ, -st * cZ],
    [cz * ct * sZ + sz * cZ, -sz * ct * sZ + cz * cZ, -st * sZ],
    [cz * st, -sz * st, ct],
  ];
  return [
    p[0][0] * v[0] + p[1][0] * v[1] + p[2][0] * v[2],
    p[0][1] * v[0] + p[1][1] * v[1] + p[2][1] * v[2],
    p[0][2] * v[0] + p[1][2] * v[1] + p[2][2] * v[2],
  ];
};

export interface HorizonFrame {
  /** Unit vectors in the explorer's world frame. */
  zenith: Vec3;
  north: Vec3;
  east: Vec3;
  /** The same in J2000 equatorial coordinates (for RA / Dec work). */
  zenithJ2000: Vec3;
  /** Local sidereal time (radians). */
  lst: number;
}

export const horizonFrame = (latDeg: number, lonDeg: number, timeMs: number): HorizonFrame => {
  const lat = latDeg * DEG;
  const lst = gmstRad(timeMs) + lonDeg * DEG;
  const zenithDate: Vec3 = [Math.cos(lat) * Math.cos(lst), Math.cos(lat) * Math.sin(lst), Math.sin(lat)];
  // North on the horizon: towards the celestial pole of date.
  const northDate: Vec3 = [-Math.sin(lat) * Math.cos(lst), -Math.sin(lat) * Math.sin(lst), Math.cos(lat)];
  const zenithJ2000 = dateToJ2000(zenithDate, timeMs);
  const northJ2000 = dateToJ2000(northDate, timeMs);
  const zenith = normalize3(icrsToWorld(...zenithJ2000));
  const north = normalize3(icrsToWorld(...northJ2000));
  // Facing north with the zenith up, east is on the right.
  const east = normalize3(cross3(north, zenith));
  return { zenith, north, east, zenithJ2000, lst: ((lst % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) };
};

/** World position (km) of an observer standing on the Earth's surface. */
export const observerWorld = (earthWorld: Vec3, frame: HorizonFrame, heightKm = 0.002): Vec3 => [
  earthWorld[0] + frame.zenith[0] * (EARTH_RADIUS_KM + heightKm),
  earthWorld[1] + frame.zenith[1] * (EARTH_RADIUS_KM + heightKm),
  earthWorld[2] + frame.zenith[2] * (EARTH_RADIUS_KM + heightKm),
];

/** Altitude and azimuth (degrees; azimuth from north through east) of a world-frame direction. */
export const altAz = (direction: Vec3, frame: HorizonFrame) => {
  const d = normalize3(direction);
  const up = dot3(d, frame.zenith);
  const alt = Math.asin(Math.min(1, Math.max(-1, up))) / DEG;
  const az = Math.atan2(dot3(d, frame.east), dot3(d, frame.north)) / DEG;
  return { altDeg: alt, azDeg: (az + 360) % 360 };
};

/** World-frame unit vector for an altitude / azimuth (degrees). */
export const altAzToWorld = (altDeg: number, azDeg: number, frame: HorizonFrame): Vec3 => {
  const alt = altDeg * DEG;
  const az = azDeg * DEG;
  const h = Math.cos(alt);
  return normalize3([
    frame.north[0] * h * Math.cos(az) + frame.east[0] * h * Math.sin(az) + frame.zenith[0] * Math.sin(alt),
    frame.north[1] * h * Math.cos(az) + frame.east[1] * h * Math.sin(az) + frame.zenith[1] * Math.sin(alt),
    frame.north[2] * h * Math.cos(az) + frame.east[2] * h * Math.sin(az) + frame.zenith[2] * Math.sin(alt),
  ]);
};

const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
/** "low in the south-west", "high in the east", "overhead". */
export const describeAltAz = (altDeg: number, azDeg: number) => {
  if (altDeg >= 75) return "overhead";
  const where = COMPASS[Math.round(azDeg / 45) % 8];
  const height = altDeg < 15 ? "low in the" : altDeg < 45 ? "in the" : "high in the";
  return `${height} ${where}`;
};
export const compassPoint = (azDeg: number) => COMPASS[Math.round(azDeg / 45) % 8];

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * How many stops the daytime or twilight sky pushes the eye's exposure down, from the Sun's altitude.
 * Roughly: full daylight ≈ −11 (only the Sun, Moon and Venus show), civil twilight ≈ −5 (the bright
 * planets and first-magnitude stars), astronomical night = 0.
 */
export const skyExposureStops = (sunAltDeg: number) =>
  -6 * smoothstep(-0.8, 8, sunAltDeg) - 3.5 * smoothstep(-12, -4, sunAltDeg) - 1.5 * smoothstep(-18, -11, sunAltDeg);

export type TwilightPhase = "day" | "civil" | "nautical" | "astronomical" | "night";
export const twilightPhase = (sunAltDeg: number): TwilightPhase =>
  sunAltDeg > -0.833 ? "day" : sunAltDeg > -6 ? "civil" : sunAltDeg > -12 ? "nautical" : sunAltDeg > -18 ? "astronomical" : "night";
