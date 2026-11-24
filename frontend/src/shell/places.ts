// A lightweight index of the places SpaceViewer can fly to. It lives outside the 3D explorer so every
// surface (Find, the image viewer, Your sky) can link photographs and places without loading the
// renderer or the star catalogues.

import { PLANETS } from "../features/solar/solarData";
import { MOONS } from "../features/solar/moonData";
import { SMALL_BODIES } from "../features/solar/smallBodies/smallBodyData";
import { DEEP_SPACE_SEED_OBJECTS } from "../features/skymap/layers/deepSpaceCatalog";
import type { SpaceImage } from "../models/SpaceImage";

export type PlaceKind = "star" | "planet" | "moon" | "dwarf" | "comet" | "nebula" | "cluster" | "galaxy" | "structure" | "spacecraft" | "black-hole";

export interface Place {
  /** Explorer entity id (also accepted by /explore?object=). */
  id: string;
  name: string;
  kind: PlaceKind;
  /** Short description for lists. */
  blurb: string;
  aliases: string[];
  /** Distance from Earth/Sun in light-years when it is meaningful and catalogued. */
  distanceLy?: number;
  /** Distance from the Sun in AU (solar-system bodies, mean orbital distance). */
  distanceAu?: number;
  /** Words that, if found in a photograph's title or keywords, mean the photograph shows this place. */
  match: RegExp[];
  /** Words that only count when they appear in the title (too common in descriptions). */
  titleOnly?: boolean;
  /** Query for the image archive. */
  imageQuery: string;
  importance: number;
}

const LY_PER_AU = 1 / 63_241.077;

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordPattern = (value: string, flags = "i") => {
  const compact = value.trim();
  // Catalogue identifiers ("M 31", "NGC 224") match with or without the space.
  const catalogue = /^(M|NGC|IC)\s*(\d+)$/i.exec(compact);
  if (catalogue) return new RegExp(`\\b${catalogue[1]}\\s?${catalogue[2]}\\b`, flags);
  return new RegExp(`\\b${escape(compact).replace(/\\ /g, "[\\s-]")}\\b`, flags);
};

const NEBULA_EXTRAS: Record<string, string[]> = {
  "eagle-nebula": ["Pillars of Creation"],
  "carina-nebula": ["Cosmic Cliffs", "NGC 3324", "Eta Carinae"],
  "orion-nebula": ["Orion Bar", "Trapezium"],
  "tarantula-nebula": ["30 Doradus"],
  "crab-nebula": ["Crab Pulsar"],
  "ring-nebula": ["Southern Ring"],
  "horsehead-nebula": ["Barnard 33"],
  "pleiades": ["Seven Sisters"],
};

const familyKind = (family: string): PlaceKind =>
  family === "galaxy" ? "galaxy" : family === "cluster" ? "cluster" : family === "nebula" ? "nebula" : "structure";

const buildPlaces = (): Place[] => {
  const places: Place[] = [
    {
      id: "solar:sun",
      name: "Sun",
      kind: "star",
      blurb: "Our star",
      aliases: ["Sol"],
      distanceAu: 1,
      match: [/\bthe sun\b/i, /\bsolar (flare|prominence|corona|disk|eruption|surface)\b/i, /\bsunspots?\b/i, /\bSun\b/],
      titleOnly: true,
      imageQuery: "Sun solar dynamics observatory",
      importance: 100,
    },
  ];
  for (const planet of PLANETS) {
    places.push({
      id: `solar:planet:${planet.id}`,
      name: planet.name,
      kind: planet.id === "pluto" ? "dwarf" : "planet",
      blurb: planet.id === "pluto" ? "Dwarf planet" : "Planet",
      aliases: [],
      distanceAu: planet.semiMajorAxisAU,
      match: [wordPattern(planet.name, "")],
      titleOnly: planet.id === "earth",
      imageQuery: planet.searchQuery || planet.name,
      importance: 90,
    });
  }
  for (const moon of MOONS.filter((item) => item.class === "major")) {
    const parent = PLANETS.find((planet) => planet.id === moon.parentPlanet);
    places.push({
      id: `solar:moon:${moon.id}`,
      name: moon.name,
      kind: "moon",
      blurb: `Moon of ${parent?.name ?? moon.parentPlanet}`,
      aliases: [],
      distanceAu: parent?.semiMajorAxisAU,
      // "Io" and "Moon" are ordinary words: match case-sensitively, and only in titles.
      match: moon.id === "moon" ? [/\b(the )?Moon\b(?! of)/, /\blunar\b/i] : [wordPattern(moon.name, moon.name.length <= 3 ? "" : "i")],
      titleOnly: moon.id === "moon" || moon.name.length <= 3,
      imageQuery: moon.id === "moon" ? "Moon surface" : `${moon.name} ${parent?.name ?? ""}`.trim(),
      importance: moon.id === "moon" ? 85 : 70,
    });
  }
  for (const body of SMALL_BODIES) {
    places.push({
      id: `solar:small-body:${body.id}`,
      name: body.name,
      kind: body.kind === "comet" ? "comet" : "dwarf",
      blurb: body.kind === "comet" ? "Comet" : "Dwarf planet",
      aliases: body.aliases,
      match: [wordPattern(body.name.replace(/^Comet /, "")), ...body.aliases.filter((alias) => alias.length > 3).map((alias) => wordPattern(alias))],
      imageQuery: body.name,
      importance: 55,
    });
  }
  for (const seed of DEEP_SPACE_SEED_OBJECTS) {
    const extras = NEBULA_EXTRAS[seed.id] ?? [];
    const names = [seed.name, ...seed.aliases, ...seed.catalogIds, ...extras].filter((value) => value && value.length >= 2);
    places.push({
      id: `deep:${seed.family}:${seed.id}`,
      name: seed.name,
      kind: familyKind(seed.family),
      blurb: `${seed.objectClass.replace(/-/g, " ")} in ${seed.constellation}`,
      aliases: [...seed.aliases, ...seed.catalogIds, ...extras],
      distanceLy: seed.distanceLy,
      match: names.map((name) => wordPattern(name)),
      imageQuery: seed.name,
      importance: seed.importance?.score ?? seed.visual.labelPriority ?? 60,
    });
  }
  places.push(
    {
      id: "galactic:milky-way-structure",
      name: "Milky Way",
      kind: "galaxy",
      blurb: "Our galaxy",
      aliases: ["the Galaxy"],
      match: [/\bMilky Way\b/i],
      imageQuery: "Milky Way",
      importance: 95,
    },
    {
      id: "explore:sagittarius-a-star",
      name: "Sagittarius A*",
      kind: "black-hole",
      blurb: "The black hole at the centre of the Milky Way",
      aliases: ["Sgr A*", "Sgr A"],
      distanceLy: 26_670,
      match: [/\bSagittarius A\*?/i, /\bSgr ?A\*?/i, /\bgalactic cent(er|re)\b/i],
      imageQuery: "Sagittarius A* black hole",
      importance: 80,
    },
    {
      id: "spacecraft:voyager-1",
      name: "Voyager 1",
      kind: "spacecraft",
      blurb: "The farthest human-made object",
      aliases: [],
      match: [/\bVoyager 1\b/i],
      imageQuery: "Voyager 1",
      importance: 75,
    },
    {
      id: "spacecraft:voyager-2",
      name: "Voyager 2",
      kind: "spacecraft",
      blurb: "The only spacecraft to visit Uranus and Neptune",
      aliases: [],
      match: [/\bVoyager 2\b/i],
      imageQuery: "Voyager 2",
      importance: 70,
    },
  );
  return places;
};

export const PLACES: Place[] = buildPlaces();
const PLACE_BY_ID = new Map(PLACES.map((place) => [place.id, place]));
export const getPlace = (id: string) => PLACE_BY_ID.get(id) ?? null;

export const exploreHref = (id: string) => `/explore?object=${encodeURIComponent(id)}`;

/** Light-years from Earth for a place, using mean orbital distance for solar-system bodies. */
export const placeDistanceLy = (place: Place) => place.distanceLy ?? (place.distanceAu !== undefined ? place.distanceAu * LY_PER_AU : undefined);

/**
 * Find the place a photograph shows. Titles beat keywords, keywords beat descriptions, and specific
 * objects (a nebula, a moon) beat broad ones (a planet).
 */
export const matchImageToPlace = (image: Pick<SpaceImage, "title" | "keywords" | "description">): Place | null => {
  const title = image.title ?? "";
  const keywords = (image.keywords ?? []).join(" · ");
  const description = (image.description ?? "").slice(0, 400);
  let best: { place: Place; score: number } | null = null;
  const specificity: Record<PlaceKind, number> = {
    nebula: 30, cluster: 30, galaxy: 28, "black-hole": 30, comet: 26, spacecraft: 22, moon: 24, dwarf: 24, planet: 14, star: 8, structure: 10,
  };
  for (const place of PLACES) {
    let where = 0;
    if (place.match.some((pattern) => pattern.test(title))) where = 3;
    else if (!place.titleOnly && place.match.some((pattern) => pattern.test(keywords))) where = 2;
    else if (!place.titleOnly && place.match.some((pattern) => pattern.test(description))) where = 1;
    if (!where) continue;
    const score = where * 100 + specificity[place.kind] + place.importance * 0.01;
    if (!best || score > best.score) best = { place, score };
  }
  return best?.place ?? null;
};

/** Simple ranked search over places for Find. */
export const searchPlaces = (query: string, limit = 6): Place[] => {
  const q = query.trim().toLowerCase().replace(/\s+/g, " ");
  if (!q) return [];
  const compact = q.replace(/\s/g, "");
  const scored: Array<{ place: Place; score: number }> = [];
  for (const place of PLACES) {
    const names = [place.name, ...place.aliases].map((name) => name.toLowerCase());
    let score = 0;
    for (const name of names) {
      if (name === q || name.replace(/\s/g, "") === compact) score = Math.max(score, 100);
      else if (name.startsWith(q)) score = Math.max(score, 70);
      else if (name.split(/[\s-]/).some((word) => word.startsWith(q))) score = Math.max(score, 50);
      else if (q.length >= 3 && name.includes(q)) score = Math.max(score, 30);
    }
    if (score) scored.push({ place, score: score + place.importance * 0.05 });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((item) => item.place);
};

// ---------------------------------------------------------------------------------------------
// Light-travel time, told against human history. Derived from catalogue distance (light-travel time
// equals distance in light-years for anything this close; cosmological corrections are negligible
// below ~100 million light-years).

// Anchors in years before now. A story only cites one when the light's departure is close to it
// (within a factor of 1.7), so it never claims a coincidence that isn't there.
const ERAS: Array<{ yearsAgo: number; text: string }> = [
  { yearsAgo: 4.6e9, text: "while the Sun and Earth were still forming" },
  { yearsAgo: 5.4e8, text: "as complex animal life first appeared in Earth's oceans" },
  { yearsAgo: 6.6e7, text: "around the time the dinosaurs died out" },
  { yearsAgo: 2.6e6, text: "around when our ancestors made the first stone tools" },
  { yearsAgo: 3.0e5, text: "around when the first Homo sapiens walked in Africa" },
  { yearsAgo: 4.0e4, text: "around when people painted the first cave walls" },
  { yearsAgo: 1.0e4, text: "as farming spread after the last Ice Age" },
];
const ERA_TOLERANCE = 1.7;

export interface LightStory {
  /** "1,344 years", "8 minutes 20 seconds" */
  travel: string;
  /** Year the light left, or null when it left within the last century. */
  departed: number | null;
  /** Human-history anchor, if there is a good one. */
  era: string | null;
}

const formatYears = (years: number) => {
  if (years >= 1e9) return `${(years / 1e9).toFixed(years >= 1e10 ? 0 : 1)} billion years`;
  if (years >= 1e6) return `${(years / 1e6).toFixed(years >= 1e7 ? 0 : 1)} million years`;
  if (years >= 10) return `${Math.round(years).toLocaleString("en-US")} years`;
  if (years >= 1) return `${years.toFixed(1)} years`;
  const minutes = years * 365.25 * 24 * 60;
  if (minutes >= 60) return `${(minutes / 60).toFixed(1)} hours`;
  const whole = Math.floor(minutes);
  const seconds = Math.round((minutes - whole) * 60);
  return whole ? `${whole} min ${seconds} s` : `${seconds} seconds`;
};

export const lightStory = (distanceLy: number, nowYear = new Date().getFullYear()): LightStory => {
  const travel = formatYears(distanceLy);
  if (distanceLy < 100) return { travel, departed: distanceLy >= 1 ? Math.round(nowYear - distanceLy) : null, era: null };
  const departed = nowYear - distanceLy;
  // Recent enough that the year itself says more than any anchor.
  let era: string | null = null;
  if (distanceLy >= 7_000) {
    let best = Infinity;
    for (const item of ERAS) {
      const ratio = Math.abs(Math.log(distanceLy / item.yearsAgo));
      if (ratio < best && ratio <= Math.log(ERA_TOLERANCE)) {
        best = ratio;
        era = item.text;
      }
    }
  }
  return { travel, departed: Math.round(departed), era };
};

export const formatYear = (year: number) => {
  if (year > 0) return `AD ${year}`;
  const bc = Math.abs(year);
  if (bc >= 1e6) return `${(bc / 1e6).toFixed(1)} million years ago`;
  return `${bc.toLocaleString("en-US")} BC`;
};
