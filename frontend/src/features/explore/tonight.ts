// "Tonight's sky": where you are, when it gets dark, and what is worth looking at.
//
// Your location never leaves the device. By default it is the principal city of the browser's time
// zone (no permission needed); "Use my location" asks the browser for a fix and keeps it only in local
// storage. Every time and altitude here comes from the same ephemeris and horizon frame the 3-D view
// uses, so the list and the sky always agree.

import timezonePlaces from "../../generated/timezonePlaces.json";
import { altAz, horizonFrame, observerWorld, type HorizonFrame } from "./engine/observer";
import { getEntityRenderWorld, getEntityWorld, type UniverseEntity, type UniverseIndex } from "./engine/universeModel";
import { dot3, icrsToWorld, KM_PER_AU, normalize3, type Vec3 } from "./engine/units";
import type { SkyCulture } from "./skyCulture";

export interface ObserverPlace {
  name: string;
  latDeg: number;
  lonDeg: number;
  source: "timezone" | "device" | "manual";
}

const PLACE_KEY = "spaceviewer.tonight.place.v1";
const ZONES = (timezonePlaces as unknown as { places: Record<string, [string, string, number, number]> }).places;

export const placeFromTimeZone = (): ObserverPlace => {
  let zone = "Europe/London";
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone || zone;
  } catch {
    // ignore
  }
  const entry = ZONES[zone] ?? ZONES["Europe/London"];
  return { name: entry[0], latDeg: entry[2], lonDeg: entry[3], source: "timezone" };
};

export const readPlace = (): ObserverPlace => {
  try {
    const raw = window.localStorage.getItem(PLACE_KEY);
    if (raw) {
      const place = JSON.parse(raw) as ObserverPlace;
      if (Number.isFinite(place.latDeg) && Number.isFinite(place.lonDeg) && Math.abs(place.latDeg) <= 90) return place;
    }
  } catch {
    // ignore
  }
  return placeFromTimeZone();
};

export const writePlace = (place: ObserverPlace) => {
  try {
    window.localStorage.setItem(PLACE_KEY, JSON.stringify(place));
  } catch {
    // ignore
  }
};

export const forgetPlace = () => {
  try {
    window.localStorage.removeItem(PLACE_KEY);
  } catch {
    // ignore
  }
};

/** Asks the browser for the device's position. Rounded to 0.01° (~1 km): plenty for the sky. */
export const requestDevicePlace = () =>
  new Promise<ObserverPlace>((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("This browser cannot share a location."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          name: "Your location",
          latDeg: Math.round(position.coords.latitude * 100) / 100,
          lonDeg: Math.round(position.coords.longitude * 100) / 100,
          source: "device",
        }),
      (error) => reject(new Error(error.code === error.PERMISSION_DENIED ? "Location permission was declined." : "Your location could not be found.")),
      { enableHighAccuracy: false, maximumAge: 30 * 60_000, timeout: 15_000 },
    );
  });

export const formatLatLon = (place: Pick<ObserverPlace, "latDeg" | "lonDeg">) =>
  `${Math.abs(place.latDeg).toFixed(2)}° ${place.latDeg >= 0 ? "N" : "S"}, ${Math.abs(place.lonDeg).toFixed(2)}° ${place.lonDeg >= 0 ? "E" : "W"}`;

// --- Positions ---------------------------------------------------------------------------------

const EARTH_ID = "solar:planet:earth";

export const skyPositionAt = (index: UniverseIndex, entity: UniverseEntity, place: ObserverPlace, timeMs: number, frame?: HorizonFrame) => {
  const earth = index.byId.get(EARTH_ID);
  const earthWorld = earth ? getEntityWorld(earth, timeMs) : null;
  if (!earthWorld) return null;
  const f = frame ?? horizonFrame(place.latDeg, place.lonDeg, timeMs);
  const eye = observerWorld(earthWorld, f);
  const world = getEntityRenderWorld(entity, timeMs, eye);
  const rel: Vec3 = [world[0] - eye[0], world[1] - eye[1], world[2] - eye[2]];
  return { ...altAz(rel, f), distanceKm: Math.hypot(...rel), world, eye };
};

const sunAltitude = (index: UniverseIndex, place: ObserverPlace, timeMs: number) => {
  const earth = index.byId.get(EARTH_ID);
  const earthWorld = earth ? getEntityWorld(earth, timeMs) : null;
  if (!earthWorld) return 0;
  const frame = horizonFrame(place.latDeg, place.lonDeg, timeMs);
  const eye = observerWorld(earthWorld, frame);
  return altAz([-eye[0], -eye[1], -eye[2]], frame).altDeg;
};

/** First time after `start` (within `spanMs`) that f(t) crosses `level` in the given direction. */
const findCrossing = (f: (t: number) => number, start: number, spanMs: number, level: number, rising: boolean, stepMs = 10 * 60_000) => {
  let t0 = start;
  let v0 = f(t0) - level;
  for (let t1 = start + stepMs; t1 <= start + spanMs; t1 += stepMs) {
    const v1 = f(t1) - level;
    if ((rising && v0 < 0 && v1 >= 0) || (!rising && v0 > 0 && v1 <= 0)) {
      // Bisect to about 20 s.
      let a = t0;
      let b = t1;
      for (let i = 0; i < 6; i += 1) {
        const m = (a + b) / 2;
        const vm = f(m) - level;
        if ((rising && vm < 0) || (!rising && vm > 0)) a = m;
        else b = m;
      }
      return (a + b) / 2;
    }
    t0 = t1;
    v0 = v1;
  }
  return null;
};

export interface NightTimes {
  /** The instant these times were computed around. */
  fromMs: number;
  sunset: number | null;
  /** End of astronomical twilight: properly dark. */
  darkFrom: number | null;
  /** Start of morning astronomical twilight. */
  darkUntil: number | null;
  sunrise: number | null;
  /** A good moment to look: an hour after dark, or now if it is already dark. */
  bestLookMs: number;
  /** Polar day / night: the Sun never sets (or never rises) in the next 24 h. */
  note: string | null;
}

/** Tonight's sunset, darkness and sunrise for a place, starting from `nowMs` (looks up to 30 h ahead). */
export const nightTimes = (index: UniverseIndex, place: ObserverPlace, nowMs: number): NightTimes => {
  const alt = (t: number) => sunAltitude(index, place, t);
  const span = 30 * 3_600_000;
  const altNow = alt(nowMs);
  // If we are already in the night, measure from the evening that started it.
  const start = altNow < -0.833 ? nowMs - 14 * 3_600_000 : nowMs;
  const sunset = findCrossing(alt, start, span, -0.833, false);
  const darkFrom = sunset ? findCrossing(alt, sunset, 16 * 3_600_000, -18, false) : null;
  const sunrise = sunset ? findCrossing(alt, sunset, 24 * 3_600_000, -0.833, true) : null;
  const darkUntil = darkFrom ? findCrossing(alt, darkFrom, 24 * 3_600_000, -18, true) : null;
  let note: string | null = null;
  if (!sunset) note = altNow > 0 ? "The Sun does not set here in the next day." : "The Sun does not rise here in the next day.";
  else if (!darkFrom) note = "It never gets fully dark here tonight: the Sun stays less than 18° below the horizon.";
  const evening = darkFrom ?? (sunset ? sunset + 3_600_000 : nowMs);
  const alreadyDark = altNow < -12;
  const bestLookMs = alreadyDark ? nowMs : Math.max(nowMs, evening + (darkFrom ? 3_600_000 : 0));
  return { fromMs: nowMs, sunset, darkFrom, darkUntil, sunrise, bestLookMs, note };
};

// --- What's up --------------------------------------------------------------------------------

// Visual magnitudes from Mallama & Hilton (2018, Astronomy and Computing 25, 10): absolute magnitude
// plus the phase-angle (α, degrees) polynomials fitted to modern photometry. Saturn includes its rings
// through the ring-plane tilt; Uranus and Neptune omit their small sub-latitude terms.
const SATURN_POLE = (() => {
  const ra = (40.589 * Math.PI) / 180;
  const dec = (83.537 * Math.PI) / 180;
  return icrsToWorld(Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec));
})();

const PLANET_PHOTOMETRY: Record<string, (alpha: number, toEarth: Vec3) => number> = {
  "solar:planet:mercury": (a) => -0.613 + 6.328e-2 * a - 1.6336e-3 * a ** 2 + 3.3644e-5 * a ** 3 - 3.4265e-7 * a ** 4 + 1.6893e-9 * a ** 5 - 3.0334e-12 * a ** 6,
  "solar:planet:venus": (a) =>
    a < 163.7 ? -4.384 - 1.044e-3 * a + 3.687e-4 * a ** 2 - 2.814e-6 * a ** 3 + 8.938e-9 * a ** 4 : 236.05828 - 2.81914 * a + 8.39034e-3 * a ** 2,
  "solar:planet:mars": (a) => (a <= 50 ? -1.601 + 2.267e-2 * a - 1.302e-4 * a ** 2 : -0.367 - 0.02573 * a + 3.445e-4 * a ** 2),
  "solar:planet:jupiter": (a) => -9.395 - 3.7e-4 * a + 6.16e-4 * a ** 2,
  "solar:planet:saturn": (a, toEarth) => {
    const sinB = Math.abs(dot3(normalize3(toEarth), SATURN_POLE));
    return -8.914 - 1.825 * sinB + 0.026 * a - 0.378 * sinB * Math.exp(-2.25 * a);
  },
  "solar:planet:uranus": (a) => -7.11 + 6.587e-3 * a + 1.045e-4 * a ** 2,
  "solar:planet:neptune": (a) => -7.0 + 7.944e-3 * a + 9.617e-5 * a ** 2,
};

export interface SkyHighlight {
  id: string;
  name: string;
  kind: "moon" | "planet" | "deep-sky" | "star";
  /** Where it is at the moment the list was made for. */
  altDeg: number;
  azDeg: number;
  /** Highest altitude while dark (or at the reference time for the Moon) and when. */
  bestAltDeg: number;
  bestMs: number;
  riseMs: number | null;
  setMs: number | null;
  magnitude: number | null;
  detail: string;
}

const moonPhase = (index: UniverseIndex, timeMs: number) => {
  const moon = index.byId.get("solar:moon:moon") ?? index.entities.find((entity) => entity.kind === "moon" && entity.name === "Moon");
  const earth = index.byId.get(EARTH_ID);
  const m = moon ? getEntityWorld(moon, timeMs) : null;
  const e = earth ? getEntityWorld(earth, timeMs) : null;
  if (!m || !e) return null;
  const toSun = [-m[0], -m[1], -m[2]];
  const toEarth = [e[0] - m[0], e[1] - m[1], e[2] - m[2]];
  const cos = (toSun[0] * toEarth[0] + toSun[1] * toEarth[1] + toSun[2] * toEarth[2]) / (Math.hypot(...toSun) * Math.hypot(...toEarth));
  const illuminated = (1 + cos) / 2;
  // Waxing when the Moon is east of the Sun: its ecliptic longitude leads the Sun's (seen from Earth).
  const lonMoon = Math.atan2(-(m[2] - e[2]), m[0] - e[0]);
  const lonSun = Math.atan2(e[2], -e[0]);
  const elongation = ((((lonMoon - lonSun) * 180) / Math.PI) % 360 + 360) % 360;
  const waxing = elongation < 180;
  const name =
    illuminated < 0.03 ? "New Moon" : illuminated > 0.97 ? "Full Moon" : illuminated < 0.47 ? (waxing ? "Waxing crescent" : "Waning crescent") : illuminated < 0.53 ? (waxing ? "First quarter" : "Last quarter") : waxing ? "Waxing gibbous" : "Waning gibbous";
  return { moon, illuminated, waxing, name };
};

export const moonSummary = (index: UniverseIndex, timeMs: number) => moonPhase(index, timeMs);

const DEEP_SKY_PICKS = [
  "Andromeda Galaxy", "Orion Nebula", "Pleiades", "Large Magellanic Cloud", "Small Magellanic Cloud", "Omega Centauri", "Carina Nebula",
  "47 Tucanae", "Hercules Globular Cluster", "Lagoon Nebula", "Beehive Cluster", "Double Cluster", "Jewel Box", "Triangulum Galaxy",
  "Hyades", "Ring Nebula", "Dumbbell Nebula", "Eagle Nebula", "Trifid Nebula", "Whirlpool Galaxy", "Bode's Galaxy", "Sombrero Galaxy",
  "Tarantula Nebula", "Wild Duck Cluster", "Butterfly Cluster", "Ptolemy Cluster",
];

const describeMagnitude = (m: number) => (m < 0 ? "very bright" : m < 2 ? "bright" : m < 5 ? "naked eye" : m < 7 ? "binoculars" : "telescope");

/**
 * What is worth looking at tonight from `place`, sampled from dusk to dawn (or the next 12 hours when
 * it never gets dark). `atMs` is the moment the "now" altitudes refer to.
 */
export const whatsUp = (index: UniverseIndex, place: ObserverPlace, night: NightTimes, atMs: number): SkyHighlight[] => {
  const start = night.sunset ?? atMs;
  const end = night.sunrise ?? start + 12 * 3_600_000;
  const darkStart = night.darkFrom ?? (night.sunset ? night.sunset + 45 * 60_000 : start);
  const darkEnd = night.darkUntil ?? (night.sunrise ? night.sunrise - 45 * 60_000 : end);
  const step = 20 * 60_000;
  const samples: number[] = [];
  for (let t = Math.min(start, atMs); t <= Math.max(end, atMs); t += step) samples.push(t);
  const frames = new Map(samples.map((t) => [t, horizonFrame(place.latDeg, place.lonDeg, t)]));
  const out: SkyHighlight[] = [];

  const track = (entity: UniverseEntity, kind: SkyHighlight["kind"], darkOnly: boolean) => {
    const now = skyPositionAt(index, entity, place, atMs);
    if (!now) return null;
    let best = { alt: -90, t: atMs };
    let rise: number | null = null;
    let set: number | null = null;
    let prev: number | null = null;
    for (const t of samples) {
      const p = skyPositionAt(index, entity, place, t, frames.get(t));
      if (!p) continue;
      const inWindow = !darkOnly || (t >= darkStart - 30 * 60_000 && t <= darkEnd + 30 * 60_000);
      if (inWindow && p.altDeg > best.alt) best = { alt: p.altDeg, t };
      if (prev !== null) {
        if (prev < 0 && p.altDeg >= 0 && rise === null) rise = t;
        if (prev >= 0 && p.altDeg < 0 && set === null) set = t;
      }
      prev = p.altDeg;
    }
    return { now, best, rise, set };
  };

  // The Moon
  const phase = moonPhase(index, atMs);
  if (phase?.moon) {
    const result = track(phase.moon, "moon", false);
    if (result) {
      out.push({
        id: phase.moon.id,
        name: "Moon",
        kind: "moon",
        altDeg: result.now.altDeg,
        azDeg: result.now.azDeg,
        bestAltDeg: result.best.alt,
        bestMs: result.best.t,
        riseMs: result.rise,
        setMs: result.set,
        magnitude: null,
        detail: `${phase.name}, ${Math.round(phase.illuminated * 100)}% lit`,
      });
    }
  }

  // Planets
  for (const [id, photometry] of Object.entries(PLANET_PHOTOMETRY)) {
    const entity = index.byId.get(id);
    if (!entity) continue;
    const result = track(entity, "planet", true);
    if (!result || result.best.alt < 5) continue;
    const pw = getEntityWorld(entity, result.best.t) ?? [0, 0, 0];
    const r = Math.hypot(...pw) / KM_PER_AU;
    const delta = Math.hypot(pw[0] - result.now.eye[0], pw[1] - result.now.eye[1], pw[2] - result.now.eye[2]) / KM_PER_AU;
    const eye = result.now.eye;
    const toSun = [-pw[0], -pw[1], -pw[2]];
    const toEarth = [eye[0] - pw[0], eye[1] - pw[1], eye[2] - pw[2]];
    const phaseAngle = (Math.acos(Math.min(1, Math.max(-1, (toSun[0] * toEarth[0] + toSun[1] * toEarth[1] + toSun[2] * toEarth[2]) / (Math.hypot(...toSun) * Math.hypot(...toEarth))))) * 180) / Math.PI;
    const magnitude = photometry(phaseAngle, toEarth as Vec3) + 5 * Math.log10(r * delta);
    out.push({
      id,
      name: entity.name,
      kind: "planet",
      altDeg: result.now.altDeg,
      azDeg: result.now.azDeg,
      bestAltDeg: result.best.alt,
      bestMs: result.best.t,
      riseMs: result.rise,
      setMs: result.set,
      magnitude,
      detail: `mag ${magnitude.toFixed(1)}, ${describeMagnitude(magnitude)}`,
    });
  }

  // Deep sky (curated, by name)
  const byName = new Map(index.entities.filter((entity) => entity.kind === "galaxy" || entity.kind === "nebula" || entity.kind === "cluster").map((entity) => [entity.name, entity]));
  for (const name of DEEP_SKY_PICKS) {
    const entity = byName.get(name);
    if (!entity) continue;
    const result = track(entity, "deep-sky", true);
    if (!result || result.best.alt < 25) continue;
    out.push({
      id: entity.id,
      name: entity.name,
      kind: "deep-sky",
      altDeg: result.now.altDeg,
      azDeg: result.now.azDeg,
      bestAltDeg: result.best.alt,
      bestMs: result.best.t,
      riseMs: result.rise,
      setMs: result.set,
      magnitude: null,
      detail: entity.category,
    });
  }
  return out;
};

/** The constellations highest in the sky at `timeMs` (figure label points), brightest-ranked first. */
export const constellationsOverhead = (culture: SkyCulture, place: ObserverPlace, timeMs: number, limit = 6) => {
  const frame = horizonFrame(place.latDeg, place.lonDeg, timeMs);
  const DEG = Math.PI / 180;
  // Directions only: the Earth's offset from the Sun is irrelevant at stellar distances.
  const z = frame.zenithJ2000;
  return culture.constellations
    .map((figure) => {
      const ra = figure.labelRaDeg * DEG;
      const dec = figure.labelDecDeg * DEG;
      const up = Math.cos(dec) * Math.cos(ra) * z[0] + Math.cos(dec) * Math.sin(ra) * z[1] + Math.sin(dec) * z[2];
      return { name: figure.name, rank: figure.rank, altDeg: Math.asin(Math.min(1, Math.max(-1, up))) / DEG };
    })
    .filter((item) => item.altDeg > 25 && item.rank <= 2)
    .sort((a, b) => a.rank - b.rank || b.altDeg - a.altDeg)
    .slice(0, limit);
};

// --- Space station passes -----------------------------------------------------------------------

export interface StationPass {
  id: string;
  name: string;
  /** Rises above 10°, highest, and drops below 10° (or into Earth's shadow). */
  startMs: number;
  peakMs: number;
  endMs: number;
  peakAltDeg: number;
  startAzDeg: number;
  endAzDeg: number;
  /** Ends early because the station enters the Earth's shadow. */
  fadesIntoShadow: boolean;
}

/**
 * Visible passes of Earth-orbiting stations tonight: above 10°, sunlit, while the observer's sky is at
 * least in civil twilight's end (Sun below −6°). Uses the same SGP4 orbit as the 3-D view.
 */
export const stationPasses = (index: UniverseIndex, place: ObserverPlace, night: NightTimes, ids = ["spacecraft:iss", "spacecraft:tiangong"]): StationPass[] => {
  const earth = index.byId.get(EARTH_ID);
  if (!earth) return [];
  const from = (night.sunset ?? night.fromMs) - 30 * 60_000;
  const to = night.sunrise ?? from + 14 * 3_600_000;
  const step = 20_000;
  const passes: StationPass[] = [];
  for (const id of ids) {
    const station = index.byId.get(id);
    const geocentric = station?.trajectory?.geocentric;
    if (!station || !geocentric) continue;
    let current: StationPass | null = null;
    for (let t = from; t <= to; t += step) {
      const earthWorld = getEntityWorld(earth, t);
      const g = geocentric(t);
      if (!earthWorld || !g) continue;
      const frame = horizonFrame(place.latDeg, place.lonDeg, t);
      const observer = [frame.zenith[0] * 6_371, frame.zenith[1] * 6_371, frame.zenith[2] * 6_371];
      const rel: Vec3 = [g[0] - observer[0], g[1] - observer[1], g[2] - observer[2]];
      const sky = altAz(rel, frame);
      // Sunlit unless inside the Earth's (cylindrical) shadow.
      const sun = normalize3([-earthWorld[0], -earthWorld[1], -earthWorld[2]]);
      const along = dot3(g, sun);
      const perp = Math.hypot(g[0] - sun[0] * along, g[1] - sun[1] * along, g[2] - sun[2] * along);
      const sunlit = along > 0 || perp > 6_371;
      const dark = altAz(sun, frame).altDeg < -6;
      const visible = sky.altDeg > 10 && sunlit && dark;
      if (visible) {
        if (!current) current = { id, name: station.name, startMs: t, peakMs: t, endMs: t, peakAltDeg: sky.altDeg, startAzDeg: sky.azDeg, endAzDeg: sky.azDeg, fadesIntoShadow: false };
        current.endMs = t;
        current.endAzDeg = sky.azDeg;
        if (sky.altDeg > current.peakAltDeg) {
          current.peakAltDeg = sky.altDeg;
          current.peakMs = t;
        }
      } else if (current) {
        current.fadesIntoShadow = sky.altDeg > 10 && !sunlit;
        if (current.endMs - current.startMs >= 60_000) passes.push(current);
        current = null;
      }
    }
    if (current && current.endMs - current.startMs >= 60_000) passes.push(current);
  }
  return passes.sort((a, b) => a.startMs - b.startMs);
};
