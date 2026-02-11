import type { PlanetId } from "./solarData";

export interface OrbitalElements {
  semiMajorAxisAU: number;
  eccentricity: number;
  inclinationDeg: number;
  longitudeOfAscendingNodeDeg: number;
  argumentOfPeriapsisDeg: number;
  meanLongitudeDeg: number;
  orbitalPeriodDays: number;
}

export const ORBITAL_ELEMENTS: Record<PlanetId, OrbitalElements> = {
  mercury: {
    semiMajorAxisAU: 0.387098,
    eccentricity: 0.205635,
    inclinationDeg: 7.005,
    longitudeOfAscendingNodeDeg: 48.331,
    argumentOfPeriapsisDeg: 29.124,
    meanLongitudeDeg: 252.251,
    orbitalPeriodDays: 88,
  },
  venus: {
    semiMajorAxisAU: 0.723332,
    eccentricity: 0.006773,
    inclinationDeg: 3.394,
    longitudeOfAscendingNodeDeg: 76.680,
    argumentOfPeriapsisDeg: 54.852,
    meanLongitudeDeg: 181.979,
    orbitalPeriodDays: 225,
  },
  earth: {
    semiMajorAxisAU: 1.0,
    eccentricity: 0.01671,
    inclinationDeg: 0.0,
    longitudeOfAscendingNodeDeg: 0.0,
    argumentOfPeriapsisDeg: 102.937,
    meanLongitudeDeg: 100.464,
    orbitalPeriodDays: 365,
  },
  mars: {
    semiMajorAxisAU: 1.523679,
    eccentricity: 0.0934,
    inclinationDeg: 1.850,
    longitudeOfAscendingNodeDeg: 49.558,
    argumentOfPeriapsisDeg: 286.502,
    meanLongitudeDeg: 355.453,
    orbitalPeriodDays: 687,
  },
  jupiter: {
    semiMajorAxisAU: 5.2044,
    eccentricity: 0.0489,
    inclinationDeg: 1.304,
    longitudeOfAscendingNodeDeg: 100.556,
    argumentOfPeriapsisDeg: 273.867,
    meanLongitudeDeg: 34.404,
    orbitalPeriodDays: 4333,
  },
  saturn: {
    semiMajorAxisAU: 9.5826,
    eccentricity: 0.0565,
    inclinationDeg: 2.485,
    longitudeOfAscendingNodeDeg: 113.715,
    argumentOfPeriapsisDeg: 339.392,
    meanLongitudeDeg: 49.944,
    orbitalPeriodDays: 10759,
  },
  uranus: {
    semiMajorAxisAU: 19.2184,
    eccentricity: 0.0463,
    inclinationDeg: 0.773,
    longitudeOfAscendingNodeDeg: 74.006,
    argumentOfPeriapsisDeg: 96.998,
    meanLongitudeDeg: 313.232,
    orbitalPeriodDays: 30687,
  },
  neptune: {
    semiMajorAxisAU: 30.110,
    eccentricity: 0.00945,
    inclinationDeg: 1.770,
    longitudeOfAscendingNodeDeg: 131.784,
    argumentOfPeriapsisDeg: 273.187,
    meanLongitudeDeg: 304.880,
    orbitalPeriodDays: 60190,
  },
  pluto: {
    semiMajorAxisAU: 39.482,
    eccentricity: 0.2488,
    inclinationDeg: 17.16,
    longitudeOfAscendingNodeDeg: 110.299,
    argumentOfPeriapsisDeg: 113.834,
    meanLongitudeDeg: 238.929,
    orbitalPeriodDays: 90560,
  },
};
