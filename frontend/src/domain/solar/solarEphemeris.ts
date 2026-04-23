import type { OrbitalElements, SolarOrbitalSolution, SolarTimeInput, SolarVector3Au } from "./solarTypes";

export const SOLAR_DAY_MS = 86_400_000;
export const SOLAR_AU_KM = 149_597_870.7;
export const SOLAR_DOMAIN_EPOCH_MS = Date.UTC(2025, 0, 1);
export const SOLAR_ELEMENTS_EPOCH_MS = Date.UTC(2000, 0, 1, 12);

const TWO_PI = Math.PI * 2;
const ELEMENTS_TO_DOMAIN_EPOCH_DAYS = (SOLAR_DOMAIN_EPOCH_MS - SOLAR_ELEMENTS_EPOCH_MS) / SOLAR_DAY_MS;

export const degToRad = (degrees = 0) => (degrees * Math.PI) / 180;

export const normalizeRadians = (value: number) => {
  const normalized = value % TWO_PI;
  return normalized < 0 ? normalized + TWO_PI : normalized;
};

export const resolveSolarDaysSinceEpoch = (time: SolarTimeInput) => {
  if (typeof time === "number") return time;
  if (time instanceof Date) return (time.getTime() - SOLAR_DOMAIN_EPOCH_MS) / SOLAR_DAY_MS;
  if (typeof time === "string") return (Date.parse(time) - SOLAR_DOMAIN_EPOCH_MS) / SOLAR_DAY_MS;
  return time.daysSinceEpoch;
};

export const solveEccentricAnomaly = (meanAnomalyRad: number, eccentricity: number) => {
  const meanAnomaly = normalizeRadians(meanAnomalyRad);
  if (eccentricity === 0) return meanAnomaly;

  let eccentricAnomaly = eccentricity < 0.8 ? meanAnomaly : Math.PI;
  for (let index = 0; index < 8; index += 1) {
    const delta =
      (eccentricAnomaly - eccentricity * Math.sin(eccentricAnomaly) - meanAnomaly) /
      (1 - eccentricity * Math.cos(eccentricAnomaly));
    eccentricAnomaly -= delta;
    if (Math.abs(delta) < 1e-7) break;
  }
  return normalizeRadians(eccentricAnomaly);
};

const getMeanAnomalyAtElementsEpoch = (elements: OrbitalElements) =>
  normalizeRadians(
    degToRad(
      elements.meanLongitudeDeg -
        elements.longitudeOfAscendingNodeDeg -
        elements.argumentOfPeriapsisDeg,
    ),
  );

export const solveKeplerianElementsAtMeanAnomaly = (
  elements: OrbitalElements,
  meanAnomalyRad: number,
): { positionAu: SolarVector3Au; solution: SolarOrbitalSolution } => {
  const eccentricity = elements.eccentricity;
  const eccentricAnomaly = solveEccentricAnomaly(meanAnomalyRad, eccentricity);
  const trueAnomaly = normalizeRadians(
    2 *
      Math.atan2(
        Math.sqrt(1 + eccentricity) * Math.sin(eccentricAnomaly / 2),
        Math.sqrt(1 - eccentricity) * Math.cos(eccentricAnomaly / 2),
      ),
  );
  const radiusAu = elements.semiMajorAxisAU * (1 - eccentricity * Math.cos(eccentricAnomaly));
  const inclination = degToRad(elements.inclinationDeg);
  const longitudeOfAscendingNode = degToRad(elements.longitudeOfAscendingNodeDeg);
  const argumentOfPeriapsis = degToRad(elements.argumentOfPeriapsisDeg);
  const argumentOfLatitude = argumentOfPeriapsis + trueAnomaly;

  const cosNode = Math.cos(longitudeOfAscendingNode);
  const sinNode = Math.sin(longitudeOfAscendingNode);
  const cosLatitude = Math.cos(argumentOfLatitude);
  const sinLatitude = Math.sin(argumentOfLatitude);
  const cosInclination = Math.cos(inclination);
  const sinInclination = Math.sin(inclination);

  return {
    positionAu: {
      x: radiusAu * (cosNode * cosLatitude - sinNode * sinLatitude * cosInclination),
      y: radiusAu * (sinNode * cosLatitude + cosNode * sinLatitude * cosInclination),
      z: radiusAu * (sinLatitude * sinInclination),
      unit: "au",
      frame: "heliocentric-ecliptic",
    },
    solution: {
      meanAnomalyRad: normalizeRadians(meanAnomalyRad),
      eccentricAnomalyRad: eccentricAnomaly,
      trueAnomalyRad: trueAnomaly,
      radiusAu,
      argumentOfLatitudeRad: normalizeRadians(argumentOfLatitude),
      model: "keplerian-elements",
    },
  };
};

export const solveKeplerianElementsAtSolarTime = (
  elements: OrbitalElements,
  time: SolarTimeInput,
) => {
  const daysSinceEpoch = resolveSolarDaysSinceEpoch(time);
  const daysSinceElementsEpoch = daysSinceEpoch + ELEMENTS_TO_DOMAIN_EPOCH_DAYS;
  const meanMotion = TWO_PI / elements.orbitalPeriodDays;
  const meanAnomaly =
    getMeanAnomalyAtElementsEpoch(elements) + meanMotion * daysSinceElementsEpoch;
  return {
    ...solveKeplerianElementsAtMeanAnomaly(elements, meanAnomaly),
    daysSinceEpoch,
  };
};

export const sampleKeplerianOrbit = (elements: OrbitalElements, samples = 192) =>
  Array.from({ length: samples }, (_, index) =>
    solveKeplerianElementsAtMeanAnomaly(elements, (index / samples) * TWO_PI).positionAu,
  );
