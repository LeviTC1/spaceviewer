import type { PlanetId } from "../../features/solar/solarData";
import {
  SOLAR_DAY_MS,
  SOLAR_DOMAIN_EPOCH_MS,
  SOLAR_ELEMENTS_EPOCH_MS,
  resolveSolarDaysSinceEpoch,
} from "./solarEphemeris";
import type { SolarTimeInput } from "./solarTypes";
import type { ControlledSatelliteId } from "./ephemeris/controlledSatelliteEphemeris";
import {
  CONTROLLED_SATELLITE_ORIENTATION_MANIFEST_URL,
  CONTROLLED_SATELLITE_ORIENTATION_SOURCE_URL,
  getControlledSatelliteOrientationElements,
  isControlledSatelliteOrientationBodyId,
} from "./controlledSatelliteOrientation";

export type SolarOrientationBodyId = "sun" | PlanetId | ControlledSatelliteId;
export type SolarRotationSense = "prograde" | "retrograde";

export interface SolarOrientationSource {
  id: "iau-wgccre-2015" | "iers-conventions-2010" | "naif-pck00011";
  label: string;
  citation: string;
  sourceUrl: string;
  referenceLocation: string;
  rightsNote: string;
  manifestUrl?: string;
}

export interface SolarBodyPole {
  rightAscensionDeg: number;
  declinationDeg: number;
  eclipticUnitVector: { x: number; y: number; z: number };
  sceneUnitVector: { x: number; y: number; z: number };
  poleAngleToJ2000EclipticNorthDeg: number;
}

export interface SolarBodySceneFrame {
  primeMeridianUnitVector: { x: number; y: number; z: number };
  poleUnitVector: { x: number; y: number; z: number };
  thirdAxisUnitVector: { x: number; y: number; z: number };
}

export interface SolarBodyOrientationState {
  bodyId: SolarOrientationBodyId;
  daysFromJ2000: number;
  julianCenturiesFromJ2000: number;
  pole: SolarBodyPole;
  sceneFrame: SolarBodySceneFrame;
  primeMeridianDeg: number;
  nominalSpinRateDegPerDay: number;
  nominalRotationPeriodHours: number;
  rotationSense: SolarRotationSense;
  rotationSystem: string;
  modelLabel: string;
  source: SolarOrientationSource;
  accuracyNote: string;
}

export const SOLAR_ORIENTATION_SOURCES: Record<SolarOrientationSource["id"], SolarOrientationSource> = {
  "iau-wgccre-2015": {
    id: "iau-wgccre-2015",
    label: "IAU WGCCRE 2015",
    citation:
      "Archinal et al. (2018), Report of the IAU Working Group on Cartographic Coordinates and Rotational Elements: 2015, doi:10.1007/s10569-017-9805-5.",
    sourceUrl: "https://astropedia.astrogeology.usgs.gov/download/Docs/WGCCRE/WGCCRE2015reprint.pdf",
    referenceLocation: "Tables 1 and 3, pp. 8-9 and 15",
    rightsNote: "Numerical scientific recommendations are transcribed with citation; the source PDF is not redistributed.",
  },
  "iers-conventions-2010": {
    id: "iers-conventions-2010",
    label: "IERS Conventions 2010",
    citation: "Petit and Luzum (eds., 2010), IERS Conventions, Technical Note 36.",
    sourceUrl: "https://iers-conventions.obspm.fr/conventions/content/tn36.pdf",
    referenceLocation: "Table 1.1 and Earth Rotation Angle convention",
    rightsNote: "Numerical defining constants are transcribed with citation; the source PDF is not redistributed.",
  },
  "naif-pck00011": {
    id: "naif-pck00011",
    label: "NASA/JPL NAIF pck00011",
    citation:
      "NASA/JPL NAIF (2022), generic planetary constants kernel pck00011.tpc; lunar ME approximation and IAU WGCCRE Galilean rotational elements.",
    sourceUrl: CONTROLLED_SATELLITE_ORIENTATION_SOURCE_URL,
    referenceLocation:
      "BODY3_NUT_PREC_ANGLES; BODY301 and BODY501-BODY504 pole, prime-meridian and nutation/precession constants",
    rightsNote: "Numerical scientific constants are transcribed with source version and digest; the source kernel is linked rather than redistributed.",
    manifestUrl: CONTROLLED_SATELLITE_ORIENTATION_MANIFEST_URL,
  },
};

const J2000_ECLIPTIC_OBLIQUITY_DEG = 23.4392911;
const TWO_PI = Math.PI * 2;
// Preserve the published defining decimal in source. Number() explicitly
// converts it to JavaScript's nearest IEEE-754 representation at runtime.
const EARTH_ROTATION_RATE_REV_PER_DAY = Number("1.00273781191135448");
const J2000_OFFSET_DAYS = (SOLAR_DOMAIN_EPOCH_MS - SOLAR_ELEMENTS_EPOCH_MS) / SOLAR_DAY_MS;

const degToRad = (degrees: number) => (degrees * Math.PI) / 180;
const radToDeg = (radians: number) => (radians * 180) / Math.PI;
const sinDeg = (degrees: number) => Math.sin(degToRad(degrees));
const cosDeg = (degrees: number) => Math.cos(degToRad(degrees));
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

interface UnitVector {
  x: number;
  y: number;
  z: number;
}

const normalizeVector = (vector: UnitVector): UnitVector => {
  const magnitude = Math.hypot(vector.x, vector.y, vector.z) || 1;
  return { x: vector.x / magnitude, y: vector.y / magnitude, z: vector.z / magnitude };
};

const crossVector = (left: UnitVector, right: UnitVector): UnitVector => ({
  x: left.y * right.z - left.z * right.y,
  y: left.z * right.x - left.x * right.z,
  z: left.x * right.y - left.y * right.x,
});

const rotateAroundAxis = (vector: UnitVector, axis: UnitVector, angleDeg: number): UnitVector => {
  const angle = degToRad(angleDeg);
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const axisCrossVector = crossVector(axis, vector);
  const axisDotVector = axis.x * vector.x + axis.y * vector.y + axis.z * vector.z;
  return normalizeVector({
    x: vector.x * cosine + axisCrossVector.x * sine + axis.x * axisDotVector * (1 - cosine),
    y: vector.y * cosine + axisCrossVector.y * sine + axis.y * axisDotVector * (1 - cosine),
    z: vector.z * cosine + axisCrossVector.z * sine + axis.z * axisDotVector * (1 - cosine),
  });
};

const equatorialToEcliptic = (equatorial: UnitVector): UnitVector => {
  const obliquity = degToRad(J2000_ECLIPTIC_OBLIQUITY_DEG);
  return normalizeVector({
    x: equatorial.x,
    y: equatorial.y * Math.cos(obliquity) + equatorial.z * Math.sin(obliquity),
    z: -equatorial.y * Math.sin(obliquity) + equatorial.z * Math.cos(obliquity),
  });
};

const eclipticToScene = (ecliptic: UnitVector): UnitVector => ({
  x: ecliptic.x,
  y: ecliptic.z,
  z: ecliptic.y,
});

export const normalizeDegrees = (degrees: number) => {
  const normalized = degrees % 360;
  return normalized < 0 ? normalized + 360 : normalized;
};

export const getSolarOrientationTimeArguments = (time: SolarTimeInput) => {
  const daysFromJ2000 = resolveSolarDaysSinceEpoch(time) + J2000_OFFSET_DAYS;
  return {
    daysFromJ2000,
    julianCenturiesFromJ2000: daysFromJ2000 / 36_525,
  };
};

const getMercuryPrimeMeridianDeg = (daysFromJ2000: number) => {
  const m1 = 174.7910857 + 4.092335 * daysFromJ2000;
  const m2 = 349.5821714 + 8.18467 * daysFromJ2000;
  const m3 = 164.3732571 + 12.277005 * daysFromJ2000;
  const m4 = 339.1643429 + 16.36934 * daysFromJ2000;
  const m5 = 153.9554286 + 20.461675 * daysFromJ2000;
  return (
    329.5988 +
    6.1385108 * daysFromJ2000 +
    0.01067257 * sinDeg(m1) -
    0.00112309 * sinDeg(m2) -
    0.0001104 * sinDeg(m3) -
    0.00002539 * sinDeg(m4) -
    0.00000571 * sinDeg(m5)
  );
};

const getMarsPole = (centuries: number) => ({
  rightAscensionDeg:
    317.269202 -
    0.10927547 * centuries +
    0.000068 * sinDeg(198.991226 + 19_139.4819985 * centuries) +
    0.000238 * sinDeg(226.292679 + 38_280.8511281 * centuries) +
    0.000052 * sinDeg(249.663391 + 57_420.7251593 * centuries) +
    0.000009 * sinDeg(266.18351 + 76_560.636795 * centuries) +
    0.419057 * sinDeg(79.398797 + 0.5042615 * centuries),
  declinationDeg:
    54.432516 -
    0.05827105 * centuries +
    0.000051 * cosDeg(122.433576 + 19_139.9407476 * centuries) +
    0.000141 * cosDeg(43.058401 + 38_280.8753272 * centuries) +
    0.000031 * cosDeg(57.663379 + 57_420.7517205 * centuries) +
    0.000005 * cosDeg(79.476401 + 76_560.6495004 * centuries) +
    1.591274 * cosDeg(166.325722 + 0.5042615 * centuries),
});

const getMarsPrimeMeridianDeg = (daysFromJ2000: number, centuries: number) =>
  176.049863 +
  350.891982443297 * daysFromJ2000 +
  0.000145 * sinDeg(129.071773 + 19_140.0328244 * centuries) +
  0.000157 * sinDeg(36.352167 + 38_281.0473591 * centuries) +
  0.00004 * sinDeg(56.668646 + 57_420.929536 * centuries) +
  0.000001 * sinDeg(67.364003 + 76_560.2552215 * centuries) +
  0.000001 * sinDeg(104.79268 + 95_700.4387578 * centuries) +
  0.584542 * sinDeg(95.391654 + 0.5042615 * centuries);

const getJupiterPole = (centuries: number) => {
  const ja = 99.360714 + 4_850.4046 * centuries;
  const jb = 175.895369 + 1_191.9605 * centuries;
  const jc = 300.323162 + 262.5475 * centuries;
  const jd = 114.012305 + 6_070.2476 * centuries;
  const je = 49.511251 + 64.3 * centuries;
  return {
    rightAscensionDeg:
      268.056595 -
      0.006499 * centuries +
      0.000117 * sinDeg(ja) +
      0.000938 * sinDeg(jb) +
      0.001432 * sinDeg(jc) +
      0.00003 * sinDeg(jd) +
      0.00215 * sinDeg(je),
    declinationDeg:
      64.495303 +
      0.002413 * centuries +
      0.00005 * cosDeg(ja) +
      0.000404 * cosDeg(jb) +
      0.000617 * cosDeg(jc) -
      0.000013 * cosDeg(jd) +
      0.000926 * cosDeg(je),
  };
};

const getPoleCoordinates = (
  bodyId: SolarOrientationBodyId,
  daysFromJ2000: number,
  centuries: number,
) => {
  if (isControlledSatelliteOrientationBodyId(bodyId)) {
    const elements = getControlledSatelliteOrientationElements(bodyId, daysFromJ2000, centuries);
    return {
      rightAscensionDeg: elements.rightAscensionDeg,
      declinationDeg: elements.declinationDeg,
    };
  }
  switch (bodyId) {
    case "sun":
      return { rightAscensionDeg: 286.13, declinationDeg: 63.87 };
    case "mercury":
      return {
        rightAscensionDeg: 281.0103 - 0.0328 * centuries,
        declinationDeg: 61.4155 - 0.0049 * centuries,
      };
    case "venus":
      return { rightAscensionDeg: 272.76, declinationDeg: 67.16 };
    case "earth":
      return { rightAscensionDeg: 0, declinationDeg: 90 };
    case "mars":
      return getMarsPole(centuries);
    case "jupiter":
      return getJupiterPole(centuries);
    case "saturn":
      return {
        rightAscensionDeg: 40.589 - 0.036 * centuries,
        declinationDeg: 83.537 - 0.004 * centuries,
      };
    case "uranus":
      return { rightAscensionDeg: 257.311, declinationDeg: -15.175 };
    case "neptune": {
      const n = 357.85 + 52.316 * centuries;
      return {
        rightAscensionDeg: 299.36 + 0.7 * sinDeg(n),
        declinationDeg: 43.46 - 0.51 * cosDeg(n),
      };
    }
    case "pluto":
      return { rightAscensionDeg: 132.993, declinationDeg: -6.163 };
  }
};

const getNominalSpinRateDegPerDay = (bodyId: SolarOrientationBodyId) => {
  if (isControlledSatelliteOrientationBodyId(bodyId)) {
    return getControlledSatelliteOrientationElements(bodyId, 0, 0).nominalSpinRateDegPerDay;
  }
  switch (bodyId) {
    case "sun":
      return 14.1844;
    case "mercury":
      return 6.1385108;
    case "venus":
      return -1.4813688;
    case "earth":
      return 360 * EARTH_ROTATION_RATE_REV_PER_DAY;
    case "mars":
      return 350.891982443297;
    case "jupiter":
      return 870.536;
    case "saturn":
      return 810.7939024;
    case "uranus":
      return -501.1600928;
    case "neptune":
      return 541.1397757;
    case "pluto":
      return 56.3625225;
  }
};

const getPrimeMeridianDeg = (
  bodyId: SolarOrientationBodyId,
  daysFromJ2000: number,
  centuries: number,
) => {
  if (isControlledSatelliteOrientationBodyId(bodyId)) {
    return getControlledSatelliteOrientationElements(bodyId, daysFromJ2000, centuries).primeMeridianDeg;
  }
  switch (bodyId) {
    case "sun":
      return 84.176 + 14.1844 * daysFromJ2000;
    case "mercury":
      return getMercuryPrimeMeridianDeg(daysFromJ2000);
    case "venus":
      return 160.2 - 1.4813688 * daysFromJ2000;
    case "earth":
      return 360 * (0.779057273264 + EARTH_ROTATION_RATE_REV_PER_DAY * daysFromJ2000);
    case "mars":
      return getMarsPrimeMeridianDeg(daysFromJ2000, centuries);
    case "jupiter":
      return 284.95 + 870.536 * daysFromJ2000;
    case "saturn":
      return 38.9 + 810.7939024 * daysFromJ2000;
    case "uranus":
      return 203.81 - 501.1600928 * daysFromJ2000;
    case "neptune": {
      const n = 357.85 + 52.316 * centuries;
      return 249.978 + 541.1397757 * daysFromJ2000 - 0.48 * sinDeg(n);
    }
    case "pluto":
      return 302.695 + 56.3625225 * daysFromJ2000;
  }
};

const getRotationSense = (bodyId: SolarOrientationBodyId): SolarRotationSense =>
  bodyId === "venus" || bodyId === "uranus" || bodyId === "pluto" ? "retrograde" : "prograde";

const getRotationSystem = (bodyId: SolarOrientationBodyId) => {
  switch (bodyId) {
    case "moon":
      return "NAIF IAU_MOON Mean Earth/Polar Axis text-PCK approximation";
    case "io":
    case "europa":
    case "ganymede":
    case "callisto":
      return "IAU cartographic prime meridian with Jupiter-system periodic terms";
    case "sun":
      return "IAU nominal solar prime meridian; differential rotation is not resolved";
    case "earth":
      return "Earth Rotation Angle using UTC as a browser approximation to UT1";
    case "jupiter":
      return "System III magnetic-field rotation";
    case "saturn":
      return "System III magnetic-field rotation";
    case "uranus":
      return "System III magnetic-field rotation";
    case "neptune":
      return "System II optically observed atmospheric features";
    default:
      return "IAU cartographic prime meridian";
  }
};

const getOrientationSource = (bodyId: SolarOrientationBodyId) =>
  bodyId === "earth"
    ? SOLAR_ORIENTATION_SOURCES["iers-conventions-2010"]
    : isControlledSatelliteOrientationBodyId(bodyId)
      ? SOLAR_ORIENTATION_SOURCES["naif-pck00011"]
    : SOLAR_ORIENTATION_SOURCES["iau-wgccre-2015"];

const getAccuracyNote = (bodyId: SolarOrientationBodyId) => {
  if (bodyId === "moon") {
    return "NAIF's IAU_MOON trigonometric text-PCK approximation yields the lunar Mean Earth/Polar Axis frame. NAIF recommends its binary lunar PCK and frame kernel for higher accuracy; UTC is used here as a browser approximation to TDB.";
  }
  if (isControlledSatelliteOrientationBodyId(bodyId)) {
    return "NAIF pck00011 evaluates the cited WGCCRE pole, prime-meridian and Jupiter-system periodic terms. The generic model is visualisation grade, can be revised with new observations, and uses UTC here as a browser approximation to TDB.";
  }
  if (bodyId === "earth") {
    return "ERA is evaluated from the simulation UTC timestamp as an approximation to UT1; polar motion, precession-nutation and live Earth-orientation parameters are not applied.";
  }
  if (bodyId === "sun") {
    return "The IAU nominal meridian is date anchored, but the rendered photosphere does not model latitude-dependent differential rotation.";
  }
  if (bodyId === "jupiter" || bodyId === "saturn" || bodyId === "uranus") {
    return "The recommended W equation follows the cited System III convention; cloud features can rotate at different rates.";
  }
  if (bodyId === "neptune") {
    return "The recommended W equation follows optically observed System II atmospheric features and is not a rigid deep-interior rotation solution.";
  }
  return "WGCCRE pole and prime-meridian equations are evaluated at the simulation date using UTC as a browser approximation to TDB.";
};

const toPole = (rightAscensionDeg: number, declinationDeg: number): SolarBodyPole => {
  const rightAscension = degToRad(rightAscensionDeg);
  const declination = degToRad(declinationDeg);
  const equatorialX = Math.cos(declination) * Math.cos(rightAscension);
  const equatorialY = Math.cos(declination) * Math.sin(rightAscension);
  const equatorialZ = Math.sin(declination);
  const eclipticUnitVector = equatorialToEcliptic({
    x: equatorialX,
    y: equatorialY,
    z: equatorialZ,
  });
  return {
    rightAscensionDeg: normalizeDegrees(rightAscensionDeg),
    declinationDeg,
    eclipticUnitVector,
    sceneUnitVector: eclipticToScene(eclipticUnitVector),
    poleAngleToJ2000EclipticNorthDeg: radToDeg(Math.acos(clamp(eclipticUnitVector.z, -1, 1))),
  };
};

const toSceneFrame = (
  bodyId: SolarOrientationBodyId,
  rightAscensionDeg: number,
  declinationDeg: number,
  primeMeridianDeg: number,
): SolarBodySceneFrame => {
  const rightAscension = degToRad(rightAscensionDeg);
  const declination = degToRad(declinationDeg);
  const poleEquatorial = normalizeVector({
    x: Math.cos(declination) * Math.cos(rightAscension),
    y: Math.cos(declination) * Math.sin(rightAscension),
    z: Math.sin(declination),
  });
  // WGCCRE W is measured from the body's equatorial node Q, whose ICRF
  // right ascension is alpha + 90 degrees. ERA already measures the Earth
  // terrestrial-origin direction, so its zero direction is the ICRF x axis
  // in this deliberately precession/nutation-free browser approximation.
  const zeroMeridianEquatorial =
    bodyId === "earth"
      ? { x: 1, y: 0, z: 0 }
      : { x: -Math.sin(rightAscension), y: Math.cos(rightAscension), z: 0 };
  const primeMeridianEquatorial = rotateAroundAxis(
    zeroMeridianEquatorial,
    poleEquatorial,
    primeMeridianDeg,
  );
  const poleUnitVector = eclipticToScene(equatorialToEcliptic(poleEquatorial));
  const primeMeridianUnitVector = eclipticToScene(equatorialToEcliptic(primeMeridianEquatorial));
  return {
    primeMeridianUnitVector,
    poleUnitVector,
    thirdAxisUnitVector: normalizeVector(crossVector(primeMeridianUnitVector, poleUnitVector)),
  };
};

export const getSolarBodyPole = (bodyId: SolarOrientationBodyId, time: SolarTimeInput) => {
  const { daysFromJ2000, julianCenturiesFromJ2000 } = getSolarOrientationTimeArguments(time);
  const coordinates = getPoleCoordinates(bodyId, daysFromJ2000, julianCenturiesFromJ2000);
  return toPole(coordinates.rightAscensionDeg, coordinates.declinationDeg);
};

export const getSolarBodyPrimeMeridianDeg = (bodyId: SolarOrientationBodyId, time: SolarTimeInput) => {
  const { daysFromJ2000, julianCenturiesFromJ2000 } = getSolarOrientationTimeArguments(time);
  return normalizeDegrees(getPrimeMeridianDeg(bodyId, daysFromJ2000, julianCenturiesFromJ2000));
};

export const getSolarBodyPrimeMeridianRad = (bodyId: SolarOrientationBodyId, time: SolarTimeInput) =>
  (getSolarBodyPrimeMeridianDeg(bodyId, time) / 360) * TWO_PI;

export const getSolarBodySceneFrame = (bodyId: SolarOrientationBodyId, time: SolarTimeInput) => {
  const { daysFromJ2000, julianCenturiesFromJ2000 } = getSolarOrientationTimeArguments(time);
  const poleCoordinates = getPoleCoordinates(bodyId, daysFromJ2000, julianCenturiesFromJ2000);
  return toSceneFrame(
    bodyId,
    poleCoordinates.rightAscensionDeg,
    poleCoordinates.declinationDeg,
    getPrimeMeridianDeg(bodyId, daysFromJ2000, julianCenturiesFromJ2000),
  );
};

export const getSolarBodyOrientation = (
  bodyId: SolarOrientationBodyId,
  time: SolarTimeInput,
): SolarBodyOrientationState => {
  const { daysFromJ2000, julianCenturiesFromJ2000 } = getSolarOrientationTimeArguments(time);
  const poleCoordinates = getPoleCoordinates(bodyId, daysFromJ2000, julianCenturiesFromJ2000);
  const nominalSpinRateDegPerDay = getNominalSpinRateDegPerDay(bodyId);
  const primeMeridianDeg = normalizeDegrees(
    getPrimeMeridianDeg(bodyId, daysFromJ2000, julianCenturiesFromJ2000),
  );
  return {
    bodyId,
    daysFromJ2000,
    julianCenturiesFromJ2000,
    pole: toPole(poleCoordinates.rightAscensionDeg, poleCoordinates.declinationDeg),
    sceneFrame: toSceneFrame(
      bodyId,
      poleCoordinates.rightAscensionDeg,
      poleCoordinates.declinationDeg,
      primeMeridianDeg,
    ),
    primeMeridianDeg,
    nominalSpinRateDegPerDay,
    nominalRotationPeriodHours: (360 / Math.abs(nominalSpinRateDegPerDay)) * 24,
    rotationSense: getRotationSense(bodyId),
    rotationSystem: getRotationSystem(bodyId),
    modelLabel:
      bodyId === "earth"
        ? "IERS ERA"
        : bodyId === "moon"
          ? "NAIF pck00011 · lunar ME"
          : isControlledSatelliteOrientationBodyId(bodyId)
            ? "NAIF pck00011 · WGCCRE satellite"
            : "IAU WGCCRE 2015",
    source: getOrientationSource(bodyId),
    accuracyNote: getAccuracyNote(bodyId),
  };
};
