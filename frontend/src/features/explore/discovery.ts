// Search, deep-link slugs, curated journeys, onward routes and class-specific facts.

import type {
  DeepSkyScientificMetadata,
  ExoplanetSystemScientificMetadata,
  MoonScientificMetadata,
  PlanetScientificMetadata,
  StarScientificMetadata,
} from "../skymap/core/objects";
import { getEntityWorld, isDirectionOnly, type UniverseEntity, type UniverseIndex } from "./engine/universeModel";
import { KM_PER_AU, KM_PER_LY, formatDistanceKm, formatLightTime, type Vec3 } from "./engine/units";

// ---------------------------------------------------------------------------------------------
// Search

export const normalizeText = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[*]/g, " star")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

/** Catalogue designations written loosely: "m 31", "M31", "ngc224" all normalise together. */
const compact = (value: string) => normalizeText(value).replace(/\s+/g, "");

interface SearchEntry {
  entity: UniverseEntity;
  name: string;
  keys: string[];
  compactKeys: string[];
  category: string;
  weight: number;
}

export interface SearchHit {
  entity: UniverseEntity;
  score: number;
  matched: string;
}

const editDistanceWithin = (a: string, b: string, max: number) => {
  if (Math.abs(a.length - b.length) > max) return false;
  const prev = new Array(b.length + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let rowMin = Infinity;
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
      rowMin = Math.min(rowMin, prev[j]);
    }
    if (rowMin > max) return false;
  }
  return prev[b.length] <= max;
};

const CATEGORY_WORDS: Array<[RegExp, (entity: UniverseEntity) => boolean]> = [
  [/^planets?$/, (e) => e.kind === "planet"],
  [/^moons?$|^satellites?$/, (e) => e.kind === "moon"],
  [/^galax(y|ies)$/, (e) => e.kind === "galaxy"],
  [/^nebula[e]?s?$/, (e) => e.kind === "nebula"],
  [/^clusters?$/, (e) => e.kind === "cluster"],
  [/^comets?$/, (e) => e.kind === "comet"],
  [/^dwarf planets?$/, (e) => e.kind === "dwarf-planet"],
  [/^spacecraft$|^probes?$/, (e) => e.kind === "spacecraft"],
  [/^exoplanets?$|^planetary systems?$/, (e) => e.kind === "exoplanet-system"],
  [/^black holes?$/, (e) => e.kind === "black-hole"],
  [/^stars?$/, (e) => e.kind === "star" && e.importance >= 30],
];

export const createSearchIndex = (index: UniverseIndex) => {
  const entries: SearchEntry[] = index.entities
    .filter((entity) => !(entity.kind === "star" && entity.importance < 10))
    .map((entity) => {
      const keys = [entity.name, ...entity.aliases].filter(Boolean).map(normalizeText);
      return {
        entity,
        name: normalizeText(entity.name),
        keys,
        compactKeys: keys.map((key) => key.replace(/\s+/g, "")),
        category: normalizeText(entity.category),
        weight: entity.importance,
      };
    });
  const gaia = index.entities.filter((entity) => entity.kind === "star" && entity.importance < 10);

  const search = (query: string, limit = 9): SearchHit[] => {
    const q = normalizeText(query);
    if (!q) return [];
    const qc = q.replace(/\s+/g, "");
    const tokens = q.split(" ");
    for (const [pattern, predicate] of CATEGORY_WORDS) {
      if (pattern.test(q)) {
        return entries
          .filter((entry) => predicate(entry.entity))
          .sort((a, b) => b.weight - a.weight)
          .slice(0, limit)
          .map((entry) => ({ entity: entry.entity, score: entry.weight, matched: entry.entity.category }));
      }
    }
    const hits: SearchHit[] = [];
    for (const entry of entries) {
      let best = 0;
      let matched = "";
      for (let k = 0; k < entry.keys.length; k += 1) {
        const key = entry.keys[k];
        const ck = entry.compactKeys[k];
        let s = 0;
        if (key === q || ck === qc) s = 300;
        else if (key.startsWith(q) || ck.startsWith(qc)) s = 220 - Math.min(40, key.length - q.length);
        else if (key.split(" ").some((word) => word.startsWith(q))) s = 170;
        else if (key.includes(q)) s = 120;
        else if (tokens.length > 1 && tokens.every((token) => key.includes(token))) s = 110;
        else if (q.length >= 4) {
          const words = key.split(" ");
          if (words.some((word) => word.length >= 4 && editDistanceWithin(word, q, q.length > 6 ? 2 : 1))) s = 90;
        }
        if (k > 0) s *= 0.92;
        if (s > best) {
          best = s;
          matched = k === 0 ? entry.entity.name : entry.entity.aliases[k - 1] ?? entry.entity.name;
        }
      }
      if (!best && entry.category.includes(q)) {
        best = 40;
        matched = entry.entity.category;
      }
      if (best > 0) hits.push({ entity: entry.entity, score: best + entry.weight * 0.6, matched });
    }
    if (/^gaia/.test(q) || /^\d{6,}$/.test(qc)) {
      for (const entity of gaia) {
        const key = compact(entity.name);
        if (key.includes(qc.replace(/^gaiadr3/, "")) || key === qc) hits.push({ entity, score: 60, matched: entity.name });
        if (hits.length > 200) break;
      }
    }
    hits.sort((a, b) => b.score - a.score || a.entity.name.localeCompare(b.entity.name));
    return hits.slice(0, limit);
  };

  return { search };
};

// ---------------------------------------------------------------------------------------------
// Slugs (shareable, human-readable)

export const slugify = (value: string) =>
  normalizeText(value.replace(/['’]/g, ""))
    .replace(/ star$/, "-star")
    .replace(/\s+/g, "-")
    .slice(0, 64);

const SOLAR_SLUGS: Record<string, string> = {
  "solar:sun": "sun",
  "explore:sagittarius-a-star": "sagittarius-a-star",
  "galactic:milky-way-structure": "milky-way",
};

export const createSlugIndex = (index: UniverseIndex) => {
  const bySlug = new Map<string, string>();
  const byId = new Map<string, string>();
  // Higher importance claims the plain slug; collisions fall back to an id-derived slug.
  const sorted = [...index.entities].sort((a, b) => b.importance - a.importance);
  for (const entity of sorted) {
    let slug = SOLAR_SLUGS[entity.id] ?? slugify(entity.name);
    if (!slug || bySlug.has(slug)) slug = slugify(entity.id.replace(/^[a-z-]+:/, "").replace(/:/g, "-"));
    if (bySlug.has(slug)) continue;
    bySlug.set(slug, entity.id);
    byId.set(entity.id, slug);
  }
  return {
    slugFor: (id: string) => byId.get(id) ?? encodeURIComponent(id),
    idFor: (slug: string) => bySlug.get(slug) ?? (index.byId.has(decodeURIComponent(slug)) ? decodeURIComponent(slug) : null),
  };
};

// ---------------------------------------------------------------------------------------------
// Curated journeys: chosen for what you can actually see from each stop.

export interface JourneyStop {
  id: string;
  framing?: "auto" | "close" | "system" | "context";
  caption: string;
}

export interface Journey {
  id: string;
  title: string;
  subtitle: string;
  hero: string;
  stops: JourneyStop[];
}

export const JOURNEYS: Journey[] = [
  {
    id: "powers-of-ten",
    title: "From the Moon to the Local Group",
    subtitle: "Eight stops, seventeen orders of magnitude",
    hero: "solar:moon:moon",
    stops: [
      { id: "solar:moon:moon", framing: "close", caption: "The Moon, 384,000 km from Earth. Its terminator shows exactly where the Sun is setting today." },
      { id: "solar:planet:earth", framing: "system", caption: "Earth and the Moon's orbit. Light takes 1.3 seconds to cross it." },
      { id: "solar:sun", framing: "context", caption: "The Sun. Every planet you have passed shares this light, eight minutes old at Earth." },
      { id: "spacecraft:voyager-1", framing: "auto", caption: "Voyager 1, the farthest human-made object, now beyond the heliopause." },
      { id: "star:nearby:proxima-centauri", framing: "context", caption: "Proxima Centauri, the nearest star: 4.24 light-years. The Sun is now one star among many." },
      { id: "galactic:milky-way-structure", framing: "auto", caption: "The Milky Way. The Sun sits 26,700 light-years from the centre, in a minor arm between Perseus and Sagittarius." },
      { id: "deep:galaxy:andromeda-galaxy", framing: "auto", caption: "Andromeda, 2.5 million light-years away and approaching at 110 km/s." },
    ],
  },
  {
    id: "saturn-system",
    title: "Saturn and its moons",
    subtitle: "Rings, shadows and an ocean world",
    hero: "solar:planet:saturn",
    stops: [
      { id: "solar:planet:saturn", caption: "Saturn's rings span 280,000 km but are mostly tens of metres thick. Watch the planet's shadow cross them." },
      { id: "solar:moon:titan", framing: "close", caption: "Titan: the only moon with a thick atmosphere — nitrogen and methane haze." },
      { id: "solar:moon:enceladus", framing: "close", caption: "Enceladus, 504 km across, vents a subsurface ocean into space from its south pole." },
      { id: "solar:planet:saturn", framing: "system", caption: "The whole system: Titan's orbit is 1.2 million km across." },
    ],
  },
  {
    id: "jupiter-galileans",
    title: "Jupiter's Galilean moons",
    subtitle: "Volcanoes, ice and the largest moon",
    hero: "solar:planet:jupiter",
    stops: [
      { id: "solar:planet:jupiter", caption: "Jupiter: 11 Earths wide, with storms larger than our planet." },
      { id: "solar:moon:io", framing: "close", caption: "Io: hundreds of active volcanoes, driven by tidal heating." },
      { id: "solar:moon:europa", framing: "close", caption: "Europa: a cracked ice shell over a global ocean." },
      { id: "solar:moon:ganymede", framing: "close", caption: "Ganymede: the largest moon in the Solar System, bigger than Mercury." },
      { id: "solar:planet:jupiter", framing: "system", caption: "The four Galileans in their orbits. Speed up time to watch their 1:2:4 resonance." },
    ],
  },
  {
    id: "stellar-nurseries",
    title: "Where stars are born",
    subtitle: "Nebulae of the Orion Arm",
    hero: "deep:nebula:orion-nebula",
    stops: [
      { id: "deep:nebula:orion-nebula", caption: "The Orion Nebula, 1,344 light-years away: the nearest large star-forming region." },
      { id: "deep:nebula:horsehead-nebula", caption: "The Horsehead: a dark pillar of dust silhouetted against glowing hydrogen." },
      { id: "deep:cluster:pleiades", caption: "The Pleiades: a young cluster that formed around 100 million years ago." },
      { id: "galactic:milky-way-structure", caption: "All of this sits in the Orion Arm, a short spur of the Milky Way." },
    ],
  },
  {
    id: "galactic-centre",
    title: "Into the galactic centre",
    subtitle: "Sagittarius A* and the bulge",
    hero: "explore:sagittarius-a-star",
    stops: [
      { id: "galactic:milky-way-structure", caption: "The Milky Way's bar and bulge, seen from above the disk." },
      { id: "explore:sagittarius-a-star", caption: "Sagittarius A*: four million solar masses, 26,700 light-years away. Orbit it to watch its gravity bend the light behind it (illustrative)." },
    ],
  },
  {
    id: "galaxy-types",
    title: "Three kinds of galaxy",
    subtitle: "Spiral, edge-on and irregular",
    hero: "deep:galaxy:whirlpool-galaxy",
    stops: [
      { id: "deep:galaxy:whirlpool-galaxy", caption: "The Whirlpool, a face-on grand-design spiral, 23 million light-years away." },
      { id: "deep:galaxy:sombrero-galaxy", caption: "The Sombrero: a bright bulge and a dust lane seen nearly edge-on." },
      { id: "deep:galaxy:large-magellanic-cloud", caption: "The Large Magellanic Cloud: an irregular satellite of the Milky Way." },
    ],
  },
];

export const getJourneyAvailability = (journey: Journey, index: UniverseIndex) => journey.stops.every((stop) => index.byId.has(stop.id));

// ---------------------------------------------------------------------------------------------
// Onward routes

export interface OnwardRoute {
  id: string;
  label: string;
  reason: string;
  framing?: "auto" | "close" | "system" | "context";
}

const distanceBetween = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Where each mission has been or is going (route suggestions in its panel). */
const MISSION_VISITS: Record<string, Array<[string, string]>> = {
  "spacecraft:voyager-1": [["solar:planet:jupiter", "Flyby, 1979"], ["solar:planet:saturn", "Flyby, 1980"]],
  "spacecraft:voyager-2": [["solar:planet:jupiter", "Flyby, 1979"], ["solar:planet:saturn", "Flyby, 1981"], ["solar:planet:uranus", "Flyby, 1986"], ["solar:planet:neptune", "Flyby, 1989"]],
  "spacecraft:new-horizons": [["solar:planet:jupiter", "Gravity assist, 2007"], ["solar:planet:pluto", "Flyby, July 2015"]],
  "spacecraft:juno": [["solar:planet:jupiter", "In orbit since 2016"]],
  "spacecraft:parker-solar-probe": [["solar:sun", "Closest pass 6.1 million km above the surface"], ["solar:planet:venus", "Seven Venus flybys"]],
  "spacecraft:jwst": [["solar:planet:earth", "1.5 million km away, at L2"]],
  "spacecraft:europa-clipper": [["solar:planet:mars", "Flyby, March 2025"], ["solar:moon:europa", "Arrives at Jupiter 2030"]],
  "spacecraft:lucy": [["solar:planet:jupiter", "Visits its Trojan asteroids"]],
  "spacecraft:bepicolombo": [["solar:planet:mercury", "Orbit insertion, late 2026"]],
  "spacecraft:juice": [["solar:moon:ganymede", "Arrives at Jupiter 2031"]],
  "spacecraft:psyche": [["solar:planet:mars", "Flyby, 2026"]],
};

export const getOnwardRoutes = (entity: UniverseEntity, index: UniverseIndex, timeMs: number): OnwardRoute[] => {
  const routes: OnwardRoute[] = [];
  const seen = new Set<string>([entity.id]);
  const push = (route: OnwardRoute) => {
    if (seen.has(route.id) || !index.byId.has(route.id)) return;
    seen.add(route.id);
    routes.push(route);
  };
  const children = (index.children.get(entity.id) ?? []).slice().sort((a, b) => b.radiusKm - a.radiusKm);
  if (entity.kind === "planet" || entity.kind === "dwarf-planet") {
    children.filter((child) => child.kind === "moon").slice(0, 6).forEach((moon) => push({ id: moon.id, label: moon.name, reason: `Moon · ${Math.round(moon.radiusKm * 2).toLocaleString("en-GB")} km` }));
    if (children.length) push({ id: entity.id, label: `${entity.name} system`, reason: "All moons in view", framing: "system" });
    seen.delete(entity.id);
  }
  if (entity.kind === "moon" && entity.parentId) {
    const parent = index.byId.get(entity.parentId);
    if (parent) push({ id: parent.id, label: parent.name, reason: "Parent planet", framing: "system" });
    (index.children.get(entity.parentId) ?? [])
      .filter((sibling) => sibling.id !== entity.id && sibling.radiusKm > 150)
      .sort((a, b) => b.radiusKm - a.radiusKm)
      .slice(0, 4)
      .forEach((sibling) => push({ id: sibling.id, label: sibling.name, reason: "Sibling moon", framing: "close" }));
  }
  if (entity.kind === "sun") {
    ["solar:planet:earth", "solar:planet:jupiter", "solar:planet:saturn", "star:nearby:proxima-centauri"].forEach((id) => {
      const target = index.byId.get(id);
      if (target) push({ id, label: target.name, reason: target.kind === "star" ? "Nearest star" : "Planet" });
    });
  }
  const here = getEntityWorld(entity, timeMs);
  if ((entity.kind === "star" || entity.kind === "exoplanet-system") && here) {
    const neighbours = index.entities
      .filter((other) => (other.kind === "star" || other.kind === "exoplanet-system") && other.id !== entity.id && other.importance >= 30 && other.staticWorld)
      .map((other) => ({ other, d: distanceBetween(here, other.staticWorld as Vec3) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 4);
    neighbours.forEach(({ other, d }) => push({ id: other.id, label: other.name, reason: `${(d / KM_PER_LY).toFixed(1)} ly from here` }));
    push({ id: "solar:sun", label: "Sun", reason: `${(Math.hypot(...here) / KM_PER_LY).toFixed(1)} ly away`, framing: "context" });
  }
  if (entity.kind === "nebula" || entity.kind === "cluster" || entity.kind === "star" || entity.kind === "black-hole") {
    push({ id: "galactic:milky-way-structure", label: "Where in the Milky Way", reason: "See its place in the Galaxy" });
  }
  if (entity.kind === "galaxy" || entity.kind === "structure") {
    const related = (entity.object?.scientific as DeepSkyScientificMetadata | undefined)?.relatedObjectIds ?? [];
    related.forEach((id) => {
      const target = index.byId.get(id);
      if (target) push({ id, label: target.name, reason: "Related" });
    });
    if (here) {
      index.entities
        .filter((other) => (other.kind === "galaxy" || other.kind === "structure") && other.id !== entity.id && other.staticWorld && other.importance >= 40)
        .map((other) => ({ other, d: distanceBetween(here, other.staticWorld as Vec3) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 3)
        .forEach(({ other, d }) => push({ id: other.id, label: other.name, reason: `${formatDistanceKm(d)} away` }));
      // Nearest satellites crowd out the big neighbours; always offer the closest major galaxies too.
      index.entities
        .filter((other) => (other.kind === "galaxy" || other.kind === "structure") && other.id !== entity.id && other.importance >= 70)
        .map((other) => {
          const there = other.staticWorld ?? getEntityWorld(other, timeMs);
          return { other, d: there ? distanceBetween(here, there as Vec3) : Infinity };
        })
        .filter((item) => Number.isFinite(item.d))
        .sort((a, b) => a.d - b.d)
        .slice(0, 2)
        .forEach(({ other, d }) => push({ id: other.id, label: other.name, reason: `Major neighbour · ${formatDistanceKm(d)} away` }));
    }
  }
  if (entity.kind === "spacecraft") {
    const visits = MISSION_VISITS[entity.id] ?? [];
    for (const [id, reason] of visits) {
      const target = index.byId.get(id);
      if (target) push({ id, label: target.name, reason });
    }
    if (entity.parentId === "solar:planet:earth") push({ id: "solar:planet:earth", label: "Earth", reason: "The planet it circles", framing: "close" });
    else if (entity.id.startsWith("spacecraft:voyager")) push({ id: "solar:sun", label: "Look back at the Sun", reason: "From the edge of the heliosphere", framing: "context" });
  }
  return routes.slice(0, 7);
};

// ---------------------------------------------------------------------------------------------
// Facts: concise, class-specific, with units and provenance on demand.

/** Known moons (IAU / JPL Solar System Dynamics, early 2025). Counts keep rising for the giants. */
const KNOWN_MOONS: Record<string, string> = {
  "solar:planet:mercury": "None",
  "solar:planet:venus": "None",
  "solar:planet:earth": "1",
  "solar:planet:mars": "2",
  "solar:planet:jupiter": "95+ known",
  "solar:planet:saturn": "274 known",
  "solar:planet:uranus": "28+ known",
  "solar:planet:neptune": "16 known",
  "solar:planet:pluto": "5 known",
};

export type FactKind = "measured" | "derived" | "illustrative";

export interface Fact {
  label: string;
  value: string;
  note?: string;
  /** Measured (catalogue/observation), derived (computed from measurements at this moment) or illustrative. */
  kind?: FactKind;
}

const fmt = (value: number | undefined, digits = 3, unit = "") =>
  value === undefined || !Number.isFinite(value) ? undefined : `${value.toLocaleString("en-GB", { maximumSignificantDigits: digits })}${unit}`;

export const getFacts = (entity: UniverseEntity, index: UniverseIndex, timeMs: number, cameraWorld: Vec3): Fact[] => {
  const facts: Fact[] = [];
  const here = getEntityWorld(entity, timeMs);
  const add = (label: string, value: string | undefined, note?: string, kind: FactKind = "measured") => {
    if (value) facts.push({ label, value, note, kind });
  };
  const earth = index.byId.get("solar:planet:earth");
  const earthWorld = earth ? getEntityWorld(earth, timeMs) : null;
  const fromCamera = here ? distanceBetween(here, cameraWorld) : undefined;
  const fromSun = here ? Math.hypot(...here) : undefined;
  const sci = entity.object?.scientific as Record<string, unknown> | undefined;

  switch (entity.kind) {
    case "sun":
      add("Diameter", "1.39 million km", "109 × Earth");
      add("Surface temperature", "5,772 K");
      add("Light to Earth", "8 min 19 s");
      break;
    case "planet":
    case "dwarf-planet":
    case "moon":
    case "comet": {
      add("Diameter", `${Math.round(entity.radiusKm * 2).toLocaleString("en-GB")} km`, entity.radiusKm > 1_000 ? `${(entity.radiusKm / 6_371).toFixed(2)} × Earth` : undefined);
      if (entity.kind === "moon" && entity.parentId && here) {
        const parent = index.byId.get(entity.parentId);
        const pw = parent ? getEntityWorld(parent, timeMs) : null;
        if (parent && pw) add(`Distance from ${parent.name}`, formatDistanceKm(distanceBetween(here, pw)), "at this moment", "derived");
        const moon = sci as MoonScientificMetadata | undefined;
        add("Orbital period", fmt(moon?.orbitalPeriodDays ? Math.abs(moon.orbitalPeriodDays) : undefined, 3, " days"));
      } else if (fromSun !== undefined) {
        add("Distance from the Sun", `${(fromSun / KM_PER_AU).toFixed(2)} AU`, formatLightTime(fromSun) + " of light", "derived");
        if (entity.id !== "solar:planet:earth" && earthWorld && here) {
          const fromEarth = distanceBetween(here, earthWorld);
          add("Distance from Earth", fromEarth < KM_PER_AU ? `${(fromEarth / 1e6).toFixed(2)} million km` : `${(fromEarth / KM_PER_AU).toFixed(2)} AU`, `${formatLightTime(fromEarth)} of light, at this moment`, "derived");
        }
        const planet = sci as PlanetScientificMetadata | undefined;
        add("Year", planet?.orbitalPeriodDays ? (planet.orbitalPeriodDays > 700 ? `${(planet.orbitalPeriodDays / 365.25).toFixed(1)} years` : `${Math.round(planet.orbitalPeriodDays)} days`) : undefined);
        add("Day", planet?.rotationPeriodHours ? `${Math.abs(planet.rotationPeriodHours).toFixed(1)} h${planet.rotationSense === "retrograde" ? " (retrograde)" : ""}` : undefined);
        // The model draws only the major moons; say so, and give the known total separately.
        const known = KNOWN_MOONS[entity.id];
        if (known) add("Moons", known, planet?.moonCount ? `${planet.moonCount} major moon${planet.moonCount === 1 ? "" : "s"} shown here` : "none shown here");
      }
      break;
    }
    case "spacecraft": {
      const craft = sci as { status?: string; velocityRelativeToSunKmS?: number; mission?: string } | undefined;
      const geocentric = entity.trajectory?.geocentric?.(timeMs);
      // Speed from the trajectory itself (a minute either side), relative to the Sun or, for orbiters, the Earth.
      const earth = index.byId.get("solar:planet:earth");
      const relativeTo = geocentric && earth ? (t: number) => getEntityWorld(earth, t) : () => [0, 0, 0] as Vec3;
      const a = getEntityWorld(entity, timeMs - 60_000);
      const b = getEntityWorld(entity, timeMs + 60_000);
      const ra = relativeTo(timeMs - 60_000);
      const rb = relativeTo(timeMs + 60_000);
      const speed = a && b && ra && rb ? Math.hypot(b[0] - rb[0] - (a[0] - ra[0]), b[1] - rb[1] - (a[1] - ra[1]), b[2] - rb[2] - (a[2] - ra[2])) / 120 : craft?.velocityRelativeToSunKmS;
      if (geocentric) add("Altitude", `${Math.round(Math.hypot(...geocentric) - 6_371).toLocaleString("en-GB")} km`, "above the Earth's mean radius", "derived");
      else add("Distance from the Sun", fromSun !== undefined ? `${(fromSun / KM_PER_AU).toFixed(fromSun / KM_PER_AU < 10 ? 2 : 1)} AU` : undefined, fromSun ? `${formatLightTime(fromSun)} of light` : undefined, "derived");
      add("Speed", speed ? `${speed.toFixed(speed < 10 ? 2 : 1)} km/s` : undefined, geocentric ? "relative to the Earth" : "relative to the Sun", "derived");
      if (entity.distanceNote) add("Mission", entity.distanceNote);
      if (entity.trajectory) {
        const age = entity.trajectory.elementsEpochMs !== undefined ? Math.round((timeMs - entity.trajectory.elementsEpochMs) / 86_400_000) : null;
        add("Positions", entity.trajectory.source, age !== null ? `elements ${Math.abs(age)} day${Math.abs(age) === 1 ? "" : "s"} ${age >= 0 ? "old" : "ahead"}` : undefined);
      }
      add("Status", craft?.status);
      break;
    }
    case "star": {
      const star = sci as StarScientificMetadata | undefined;
      add("Distance", fromSun !== undefined ? `${(fromSun / KM_PER_LY).toFixed(fromSun / KM_PER_LY < 100 ? 2 : 0)} ly` : undefined, "from the Sun");
      add("Spectral type", star?.spectralType);
      add("Temperature", entity.temperatureK ? `${Math.round(entity.temperatureK).toLocaleString("en-GB")} K` : undefined);
      add("Apparent magnitude", fmt(star?.apparentMagnitude, 3), "from Earth");
      add("Luminosity", star?.luminositySolar ? `${fmt(star.luminositySolar, 3)} × Sun` : undefined);
      break;
    }
    case "exoplanet-system": {
      const exo = sci as unknown as ExoplanetSystemScientificMetadata | undefined;
      add("Distance", exo ? `${exo.distanceLy.toFixed(1)} ly` : undefined);
      add("Confirmed planets", exo ? String(exo.planetCount) : undefined);
      add("Host star", exo?.spectralType ?? (exo?.stellarTemperatureK ? `${Math.round(exo.stellarTemperatureK)} K` : undefined));
      const first = exo?.planets?.[0];
      add("Discovered", first?.discoveryYear ? `${first.discoveryYear} · ${first.discoveryMethod ?? ""}`.trim() : undefined);
      if (exo?.stellarLuminositySolar) add("Star's luminosity", `${fmt(exo.stellarLuminositySolar, 3)} × Sun`, exo.stellarLuminositySource === "archive st_lum" ? "archive value" : "from radius and temperature", exo.stellarLuminositySource === "archive st_lum" ? "measured" : "derived");
      if (exo?.habitableZone) {
        const { innerAu, outerAu } = exo.habitableZone;
        const inside = (exo.planets ?? []).filter((planet) => planet.semiMajorAxisAu !== undefined && planet.semiMajorAxisAu >= innerAu && planet.semiMajorAxisAu <= outerAu);
        add("Habitable zone", `${fmt(innerAu, 2)}–${fmt(outerAu, 2)} AU`, "conservative, from luminosity (Kasting 1993)", "derived");
        add("Planets in the zone", inside.length ? inside.map((planet) => planet.name.replace(`${exo.hostName} `, "")).join(", ") : "None known", inside.length ? "orbit within the band" : undefined, "derived");
      }
      break;
    }
    case "galaxy":
    case "nebula":
    case "cluster": {
      const deep = sci as DeepSkyScientificMetadata | undefined;
      add("Distance", isDirectionOnly(entity) ? "Not catalogued" : fromSun !== undefined ? formatDistanceKm(fromSun) : undefined, isDirectionOnly(entity) ? "Drawn on the celestial sphere" : undefined);
      add("Size", !isDirectionOnly(entity) ? `${formatDistanceKm(entity.radiusKm * 2)} across` : deep?.angularSizeArcMin ? `${deep.angularSizeArcMin}′ on the sky` : undefined);
      add("Type", deep?.hubbleType ?? entity.category);
      add("Constellation", deep?.constellation);
      add("Apparent magnitude", fmt(deep?.apparentMagnitude, 3));
      if (entity.galaxy && entity.kind === "galaxy") add("Inclination", `${Math.round(entity.galaxy.inclinationDeg)}°`, "from axis ratio, thin-disk model", "derived");
      break;
    }
    case "structure":
      add("Diameter", "≈ 100,000 ly", "stellar disk");
      add("Sun's distance from centre", "26,700 ly", "8.18 kpc, GRAVITY 2019");
      add("Spiral arms", "Reid et al. 2019 fits", "measured azimuth ranges drawn brighter");
      add("Bar, bulge and disk", "Modelled", "shapes are illustrative", "illustrative");
      break;
    case "black-hole":
      add("Mass", "4.3 million × Sun", "GRAVITY Collaboration 2022");
      add("Event horizon", "≈ 25 million km across");
      add("Distance", "26,700 ly");
      break;
    default:
      break;
  }
  // Notes the catalogues carry: where a Hipparcos star's distance comes from, a minor body's size and orbit.
  if (entity.distanceNote && entity.kind === "star") add("Distance from", entity.distanceNote);
  if (entity.distanceNote && entity.kind === "dwarf-planet" && entity.trajectory) add("Size and orbit", entity.distanceNote, entity.trajectory.source);
  if (fromCamera !== undefined && entity.kind !== "structure") add("From your view", formatDistanceKm(Math.max(0, fromCamera - entity.radiusKm)), undefined, "derived");
  return facts;
};

export const getDescription = (entity: UniverseEntity): string | undefined => {
  const search = entity.object?.search;
  const sci = entity.object?.scientific as { facts?: string[]; discoveryBlurb?: string } | undefined;
  if (entity.id === "solar:sun") return "Our star: a 4.6-billion-year-old G-type dwarf holding 99.86% of the Solar System's mass. Its light reaches Earth in about eight minutes.";
  if (entity.id === "galactic:milky-way-structure") return "Our home galaxy: a barred spiral of several hundred billion stars. Its arms here follow measured VLBI maser parallaxes; the rest of the disk is a modelled illustration.";
  if (entity.id === "explore:sagittarius-a-star") return "The supermassive black hole at the centre of the Milky Way. The disk and lensing shown here illustrate how its gravity bends light; Sgr A* itself accretes faintly.";
  return sci?.discoveryBlurb ?? search?.description ?? sci?.facts?.[0];
};
