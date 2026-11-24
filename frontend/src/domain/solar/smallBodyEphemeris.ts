import {
  SMALL_BODIES,
  type SmallBodyDef,
  type SmallBodyId,
  type SmallBodyOsculatingElements,
} from "../../features/solar/smallBodies/smallBodyData";
import {
  degToRad,
  resolveSolarDaysSinceEpoch,
  sampleKeplerianOrbit,
  solveKeplerianElementsAtMeanAnomaly,
} from "./solarEphemeris";
import { getJulianDateForSolarTime } from "./ephemeris/streamedVsop87c";
import type { OrbitalElements, SolarObjectState, SolarTimeInput, SolarVector3Au } from "./solarTypes";

export const SMALL_BODY_EPHEMERIS_MODEL = {
  id: "jpl-sbdb-osculating-two-body",
  label: "JPL SBDB osculating elements",
  frame: "heliocentric ecliptic, equinox J2000",
  accuracyNote:
    "The displayed state propagates JPL SBDB heliocentric osculating elements with a two-body Kepler solver. It is not a Horizons n-body trajectory; planetary perturbations and non-gravitational comet forces are not integrated, so error grows away from the published element epoch.",
  sourceDocumentationUrl: "https://ssd-api.jpl.nasa.gov/doc/sbdb.html",
  manifestHref: "/data/solar/small-bodies/source-manifest.json",
} as const;

const toKeplerianElements = (orbit: SmallBodyOsculatingElements): OrbitalElements => ({
  semiMajorAxisAU: orbit.semiMajorAxisAu,
  eccentricity: orbit.eccentricity,
  inclinationDeg: orbit.inclinationDeg,
  longitudeOfAscendingNodeDeg: orbit.longitudeOfAscendingNodeDeg,
  argumentOfPeriapsisDeg: orbit.argumentOfPerihelionDeg,
  meanLongitudeDeg:
    orbit.meanAnomalyAtEpochDeg +
    orbit.longitudeOfAscendingNodeDeg +
    orbit.argumentOfPerihelionDeg,
  orbitalPeriodDays: orbit.orbitalPeriodDays,
});

export const solveSmallBodyPosition = (
  body: SmallBodyDef,
  time: SolarTimeInput,
): { positionAu: SolarVector3Au; state: SolarObjectState } => {
  const daysSinceEpoch = resolveSolarDaysSinceEpoch(time);
  const julianDate = getJulianDateForSolarTime(time);
  const meanAnomalyRad = degToRad(
    body.orbit.meanAnomalyAtEpochDeg +
      body.orbit.meanMotionDegPerDay * (julianDate - body.orbit.epochJulianDateTdb),
  );
  const solved = solveKeplerianElementsAtMeanAnomaly(toKeplerianElements(body.orbit), meanAnomalyRad);
  const positionAu = solved.positionAu;
  return {
    positionAu,
    state: {
      id: body.id,
      sourceId: `jpl-sbdb:${body.source.spkId}`,
      kind: "small-body",
      name: body.name,
      positionAu,
      orbital: {
        ...solved.solution,
        julianDate,
      },
      daysSinceEpoch,
      model: "jpl-sbdb-osculating-elements",
      accuracyNote: SMALL_BODY_EPHEMERIS_MODEL.accuracyNote,
    },
  };
};

export const sampleSmallBodyOrbit = (body: SmallBodyDef, samples = 256) =>
  sampleKeplerianOrbit(toKeplerianElements(body.orbit), samples);

export const getSmallBodyState = (bodyId: SmallBodyId, time: SolarTimeInput) => {
  const body = SMALL_BODIES.find((candidate) => candidate.id === bodyId);
  return body ? solveSmallBodyPosition(body, time).state : null;
};

