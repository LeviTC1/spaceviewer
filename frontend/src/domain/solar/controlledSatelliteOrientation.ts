import type { ControlledSatelliteId } from "./ephemeris/controlledSatelliteEphemeris";

export const CONTROLLED_SATELLITE_ORIENTATION_MANIFEST_URL =
  "/orientation/satellites/manifest.json";
export const CONTROLLED_SATELLITE_ORIENTATION_SOURCE_URL =
  "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc";

export interface ControlledSatelliteOrientationElements {
  rightAscensionDeg: number;
  declinationDeg: number;
  primeMeridianDeg: number;
  nominalSpinRateDegPerDay: number;
}

const CONTROLLED_IDS = new Set<ControlledSatelliteId>([
  "moon",
  "io",
  "europa",
  "ganymede",
  "callisto",
]);

export const isControlledSatelliteOrientationBodyId = (
  bodyId: string | null | undefined,
): bodyId is ControlledSatelliteId =>
  Boolean(bodyId && CONTROLLED_IDS.has(bodyId as ControlledSatelliteId));

const degToRad = (degrees: number) => (degrees * Math.PI) / 180;
const sinDeg = (degrees: number) => Math.sin(degToRad(degrees));
const cosDeg = (degrees: number) => Math.cos(degToRad(degrees));

const EARTH_MOON_PHASE_ANGLES: ReadonlyArray<readonly [number, number]> = [
  [125.045, -1935.5364525],
  [250.089, -3871.072905],
  [260.008, 475263.3328725],
  [176.625, 487269.629985],
  [357.529, 35999.0509575],
  [311.589, 964468.49931],
  [134.963, 477198.869325],
  [276.617, 12006.300765],
  [34.226, 63863.5132425],
  [15.134, -5806.6093575],
  [119.743, 131.84064],
  [239.961, 6003.1503825],
  [25.053, 473327.79642],
];

const MOON_RA_PERIODIC = [
  -3.8787, -0.1204, 0.07, -0.0172, 0, 0.0072, 0, 0, 0, -0.0052, 0, 0, 0.0043,
] as const;
const MOON_DEC_PERIODIC = [
  1.5419, 0.0239, -0.0278, 0.0068, 0, -0.0029, 0.0009, 0, 0, 0.0008, 0, 0, -0.0009,
] as const;
const MOON_PM_PERIODIC = [
  3.561, 0.1208, -0.0642, 0.0158, 0.0252, -0.0066, -0.0047, -0.0046, 0.0028, 0.0052, 0.004,
  0.0019, -0.0044,
] as const;

const JUPITER_PHASE_ANGLES: ReadonlyArray<readonly [number, number]> = [
  [73.32, 91472.9],
  [24.62, 45137.2],
  [283.9, 4850.7],
  [355.8, 1191.3],
  [119.9, 262.1],
  [229.8, 64.3],
  [352.25, 2382.6],
  [113.35, 6070],
  [146.64, 182945.8],
  [49.24, 90274.4],
];

interface GalileanModel {
  poleRa: readonly [number, number];
  poleDec: readonly [number, number];
  primeMeridian: readonly [number, number];
  raPeriodic: readonly number[];
  decPeriodic: readonly number[];
  pmPeriodic: readonly number[];
}

const GALILEAN_MODELS: Record<Exclude<ControlledSatelliteId, "moon">, GalileanModel> = {
  io: {
    poleRa: [268.05, -0.009],
    poleDec: [64.5, 0.003],
    primeMeridian: [200.39, 203.4889538],
    raPeriodic: [0, 0, 0.094, 0.024],
    decPeriodic: [0, 0, 0.04, 0.011],
    pmPeriodic: [0, 0, -0.085, -0.022],
  },
  europa: {
    poleRa: [268.08, -0.009],
    poleDec: [64.51, 0.003],
    primeMeridian: [36.022, 101.3747235],
    raPeriodic: [0, 0, 0, 1.086, 0.06, 0.015, 0.009],
    decPeriodic: [0, 0, 0, 0.468, 0.026, 0.007, 0.002],
    pmPeriodic: [0, 0, 0, -0.98, -0.054, -0.014, -0.008],
  },
  ganymede: {
    poleRa: [268.2, -0.009],
    poleDec: [64.57, 0.003],
    primeMeridian: [44.064, 50.3176081],
    raPeriodic: [0, 0, 0, -0.037, 0.431, 0.091],
    decPeriodic: [0, 0, 0, -0.016, 0.186, 0.039],
    pmPeriodic: [0, 0, 0, 0.033, -0.389, -0.082],
  },
  callisto: {
    poleRa: [268.72, -0.009],
    poleDec: [64.83, 0.003],
    primeMeridian: [259.51, 21.5710715],
    raPeriodic: [0, 0, 0, 0, -0.068, 0.59, 0, 0.01],
    decPeriodic: [0, 0, 0, 0, -0.029, 0.254, 0, -0.004],
    pmPeriodic: [0, 0, 0, 0, 0.061, -0.533, 0, -0.009],
  },
};

const getAngles = (
  definitions: ReadonlyArray<readonly [number, number]>,
  centuries: number,
) => definitions.map(([constant, rate]) => constant + rate * centuries);

const periodicSum = (
  angles: readonly number[],
  coefficients: readonly number[],
  trig: (degrees: number) => number,
) => coefficients.reduce((sum, coefficient, index) => sum + coefficient * trig(angles[index]), 0);

const getMoonElements = (
  daysFromJ2000: number,
  centuriesFromJ2000: number,
): ControlledSatelliteOrientationElements => {
  const angles = getAngles(EARTH_MOON_PHASE_ANGLES, centuriesFromJ2000);
  return {
    rightAscensionDeg:
      269.9949 + 0.0031 * centuriesFromJ2000 + periodicSum(angles, MOON_RA_PERIODIC, sinDeg),
    declinationDeg:
      66.5392 + 0.013 * centuriesFromJ2000 + periodicSum(angles, MOON_DEC_PERIODIC, cosDeg),
    primeMeridianDeg:
      38.3213 +
      13.17635815 * daysFromJ2000 -
      1.4e-12 * daysFromJ2000 * daysFromJ2000 +
      periodicSum(angles, MOON_PM_PERIODIC, sinDeg),
    nominalSpinRateDegPerDay: 13.17635815,
  };
};

const getGalileanElements = (
  bodyId: Exclude<ControlledSatelliteId, "moon">,
  daysFromJ2000: number,
  centuriesFromJ2000: number,
): ControlledSatelliteOrientationElements => {
  const model = GALILEAN_MODELS[bodyId];
  const angles = getAngles(JUPITER_PHASE_ANGLES, centuriesFromJ2000);
  return {
    rightAscensionDeg:
      model.poleRa[0] +
      model.poleRa[1] * centuriesFromJ2000 +
      periodicSum(angles, model.raPeriodic, sinDeg),
    declinationDeg:
      model.poleDec[0] +
      model.poleDec[1] * centuriesFromJ2000 +
      periodicSum(angles, model.decPeriodic, cosDeg),
    primeMeridianDeg:
      model.primeMeridian[0] +
      model.primeMeridian[1] * daysFromJ2000 +
      periodicSum(angles, model.pmPeriodic, sinDeg),
    nominalSpinRateDegPerDay: model.primeMeridian[1],
  };
};

export const getControlledSatelliteOrientationElements = (
  bodyId: ControlledSatelliteId,
  daysFromJ2000: number,
  centuriesFromJ2000: number,
): ControlledSatelliteOrientationElements =>
  bodyId === "moon"
    ? getMoonElements(daysFromJ2000, centuriesFromJ2000)
    : getGalileanElements(bodyId, daysFromJ2000, centuriesFromJ2000);
