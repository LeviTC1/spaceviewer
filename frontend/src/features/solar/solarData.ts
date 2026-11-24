export type PlanetId =
  | "mercury"
  | "venus"
  | "earth"
  | "mars"
  | "jupiter"
  | "saturn"
  | "uranus"
  | "neptune"
  | "pluto";

export interface PlanetDef {
  id: PlanetId;
  name: string;
  radiusKm: number;
  semiMajorAxisAU: number;
  orbitalPeriodDays: number;
  inclinationDeg: number;
  eccentricity?: number;
  ringSystem?: boolean;
  moons?: string[];
  colorHint?: string;
  facts: string[];
  searchQuery: string;
  initialOffsetRad?: number;
}

export const PLANETS: PlanetDef[] = [
  // Rounded physical, search and display descriptors. Runtime positions and
  // body orientation come from the shared source-carrying domain providers.
  {
    id: "mercury",
    name: "Mercury",
    radiusKm: 2440,
    semiMajorAxisAU: 0.39,
    orbitalPeriodDays: 88,
    inclinationDeg: 7.0,
    eccentricity: 0.2056,
    colorHint: "#a7a2a0",
    facts: ["Smallest planet in the solar system.", "Has extreme temperature swings."],
    searchQuery: "Mercury planet",
    initialOffsetRad: 0.2,
    moons: [],
  },
  {
    id: "venus",
    name: "Venus",
    radiusKm: 6052,
    semiMajorAxisAU: 0.72,
    orbitalPeriodDays: 225,
    inclinationDeg: 3.4,
    eccentricity: 0.0067,
    colorHint: "#d2b48c",
    facts: ["Hottest planet due to runaway greenhouse effect.", "Rotates slowly in the opposite direction."],
    searchQuery: "Venus planet",
    initialOffsetRad: 1.1,
    moons: [],
  },
  {
    id: "earth",
    name: "Earth",
    radiusKm: 6371,
    semiMajorAxisAU: 1.0,
    orbitalPeriodDays: 365,
    inclinationDeg: 0.0,
    eccentricity: 0.0167,
    colorHint: "#3f72ff",
    facts: ["Only known planet with life.", "70% of the surface is covered by water."],
    searchQuery: "Earth from space",
    initialOffsetRad: 2.4,
    moons: ["Moon"],
  },
  {
    id: "mars",
    name: "Mars",
    radiusKm: 3390,
    semiMajorAxisAU: 1.52,
    orbitalPeriodDays: 687,
    inclinationDeg: 1.85,
    eccentricity: 0.0934,
    colorHint: "#d15c3f",
    facts: ["Home to Olympus Mons, the tallest volcano.", "Has the largest canyon in the solar system."],
    searchQuery: "Mars surface",
    initialOffsetRad: 3.2,
    moons: ["Phobos", "Deimos"],
  },
  {
    id: "jupiter",
    name: "Jupiter",
    radiusKm: 69911,
    semiMajorAxisAU: 5.2,
    orbitalPeriodDays: 4333,
    inclinationDeg: 1.3,
    eccentricity: 0.0489,
    colorHint: "#d9a066",
    facts: ["Largest planet in the solar system.", "Great Red Spot is a massive storm."],
    searchQuery: "Jupiter",
    initialOffsetRad: 0.9,
    moons: ["Io", "Europa", "Ganymede", "Callisto"],
  },
  {
    id: "saturn",
    name: "Saturn",
    radiusKm: 58232,
    semiMajorAxisAU: 9.58,
    orbitalPeriodDays: 10759,
    inclinationDeg: 2.5,
    eccentricity: 0.0565,
    colorHint: "#d7c08b",
    facts: ["Famous for its iconic ring system.", "Has dozens of moons including Titan."],
    searchQuery: "Saturn rings",
    initialOffsetRad: 2.2,
    ringSystem: true,
    moons: ["Titan", "Enceladus", "Rhea"],
  },
  {
    id: "uranus",
    name: "Uranus",
    radiusKm: 25362,
    semiMajorAxisAU: 19.2,
    orbitalPeriodDays: 30687,
    inclinationDeg: 0.77,
    eccentricity: 0.0472,
    colorHint: "#7bd4d4",
    facts: ["Rotates on its side with an extreme axial tilt.", "Has faint rings and icy atmosphere."],
    searchQuery: "Uranus planet",
    initialOffsetRad: 4.0,
    ringSystem: true,
    moons: ["Titania", "Oberon"],
  },
  {
    id: "neptune",
    name: "Neptune",
    radiusKm: 24622,
    semiMajorAxisAU: 30.05,
    orbitalPeriodDays: 60190,
    inclinationDeg: 1.77,
    eccentricity: 0.0086,
    colorHint: "#4c6fff",
    facts: ["Deep blue due to methane in the atmosphere.", "Has the fastest winds in the solar system."],
    searchQuery: "Neptune planet",
    initialOffsetRad: 5.0,
    moons: ["Triton"],
  },
  {
    id: "pluto",
    name: "Pluto",
    radiusKm: 1188,
    semiMajorAxisAU: 39.48,
    orbitalPeriodDays: 90560,
    inclinationDeg: 17.16,
    eccentricity: 0.2488,
    colorHint: "#9aa0a9",
    facts: ["Dwarf planet in the Kuiper belt.", "Has a heart-shaped region called Tombaugh Regio."],
    searchQuery: "Pluto dwarf planet",
    initialOffsetRad: 0.7,
    moons: [],
  },
];

export const SOLAR_SCALE_MODES = ["showcase", "educational", "realistic"] as const;
export type SolarScaleMode = (typeof SOLAR_SCALE_MODES)[number];
