import type { StarCatalogColumns } from "./starCatalogTypes";

export const GAIA_REFERENCE_EPOCH_JULIAN_YEAR = 2016;
export const GAIA_PROPAGATION_MIN_JULIAN_YEAR = 1900;
export const GAIA_PROPAGATION_MAX_JULIAN_YEAR = 2100;
export const GAIA_PROPAGATION_QUANTUM_YEARS = 1 / 12;

const DAY_MS = 86_400_000;
const JULIAN_YEAR_DAYS = 365.25;
const J2000_EPOCH_MS = Date.UTC(2000, 0, 1, 12);
const MAS_TO_RAD = Math.PI / (180 * 60 * 60 * 1_000);
const JULIAN_YEAR_SECONDS = 365.25 * 86_400;
const KILOMETRES_PER_LIGHT_YEAR = 9_460_730_472_580.8;
export const KM_PER_SECOND_TO_LIGHT_YEARS_PER_JULIAN_YEAR = JULIAN_YEAR_SECONDS / KILOMETRES_PER_LIGHT_YEAR;

export type StarCatalogPropagationColumns = Pick<
  StarCatalogColumns,
  "x" | "y" | "z" | "distanceLy" | "raDeg" | "decDeg" | "pmRaMasYr" | "pmDecMasYr" | "radialVelocityKmS"
>;

export const clampGaiaPropagationJulianYear = (julianYear: number) => {
  if (!Number.isFinite(julianYear)) return GAIA_REFERENCE_EPOCH_JULIAN_YEAR;
  return Math.min(GAIA_PROPAGATION_MAX_JULIAN_YEAR, Math.max(GAIA_PROPAGATION_MIN_JULIAN_YEAR, julianYear));
};

export const dateToJulianYear = (date: Date | string) => {
  const timeMs = typeof date === "string" ? Date.parse(date) : date.getTime();
  if (!Number.isFinite(timeMs)) return GAIA_REFERENCE_EPOCH_JULIAN_YEAR;
  return 2000 + (timeMs - J2000_EPOCH_MS) / (JULIAN_YEAR_DAYS * DAY_MS);
};

export const quantizeGaiaPropagationJulianYear = (julianYear: number) => {
  const clamped = clampGaiaPropagationJulianYear(julianYear);
  return Number((Math.round(clamped / GAIA_PROPAGATION_QUANTUM_YEARS) * GAIA_PROPAGATION_QUANTUM_YEARS).toFixed(6));
};

/**
 * Propagates Gaia catalogue positions using the published local tangent-plane
 * proper-motion components and Gaia DR3 radial velocity when available. `pmra` is
 * Gaia's mu_alpha* component (mu_alpha cos(delta)), so it multiplies the unit
 * tangent vector in the direction of increasing right ascension directly.
 *
 * Missing radial velocities use an explicit zero fallback. The model is
 * deliberately bounded to 1900-2100 and does not include light-time,
 * non-single-star acceleration solutions, parallax zero-point correction, or
 * Bayesian distance inference.
 */
export const propagateStarCatalogPositions = (
  columns: StarCatalogPropagationColumns,
  targetJulianYear: number,
  output = new Float32Array(columns.x.length * 3),
) => {
  const recordCount = columns.x.length;
  if (output.length !== recordCount * 3) {
    throw new Error(`Propagated star position buffer has ${output.length} values; expected ${recordCount * 3}.`);
  }
  const target = clampGaiaPropagationJulianYear(targetJulianYear);
  const deltaYears = target - GAIA_REFERENCE_EPOCH_JULIAN_YEAR;

  for (let index = 0; index < recordCount; index += 1) {
    const raRad = columns.raDeg[index] * Math.PI / 180;
    const decRad = columns.decDeg[index] * Math.PI / 180;
    const sinRa = Math.sin(raRad);
    const cosRa = Math.cos(raRad);
    const sinDec = Math.sin(decRad);
    const cosDec = Math.cos(decRad);
    const muRaRadYr = columns.pmRaMasYr[index] * MAS_TO_RAD;
    const muDecRadYr = columns.pmDecMasYr[index] * MAS_TO_RAD;
    const distanceLy = columns.distanceLy[index];
    const radialVelocityKmS = columns.radialVelocityKmS[index];
    const radialDistanceLyYr = Number.isFinite(radialVelocityKmS)
      ? radialVelocityKmS * KM_PER_SECOND_TO_LIGHT_YEARS_PER_JULIAN_YEAR
      : 0;

    const tangentX = -sinRa * muRaRadYr - cosRa * sinDec * muDecRadYr;
    const tangentY = cosRa * muRaRadYr - sinRa * sinDec * muDecRadYr;
    const tangentZ = cosDec * muDecRadYr;
    const offset = index * 3;
    const radialX = cosDec * cosRa * radialDistanceLyYr;
    const radialY = cosDec * sinRa * radialDistanceLyYr;
    const radialZ = sinDec * radialDistanceLyYr;
    output[offset] = columns.x[index] + (distanceLy * tangentX + radialX) * deltaYears;
    output[offset + 1] = columns.y[index] + (distanceLy * tangentY + radialY) * deltaYears;
    output[offset + 2] = columns.z[index] + (distanceLy * tangentZ + radialZ) * deltaYears;
  }

  return output;
};

export interface PropagatedAngularUncertaintyEllipseMas {
  rmsMas: number;
  semiMajorMas: number;
  semiMinorMas: number;
  positionAngleDeg: number;
}

export interface GaiaSixParameterCovarianceInput {
  referenceEpochJulianYear?: number;
  targetJulianYear?: number;
  raDeg: number;
  decDeg: number;
  parallaxMas: number;
  pmRaMasYr: number;
  pmDecMasYr: number;
  radialVelocityKmS?: number;
  radialVelocityErrorKmS?: number;
  raErrorMas?: number;
  decErrorMas?: number;
  parallaxErrorMas?: number;
  pmRaErrorMasYr?: number;
  pmDecErrorMasYr?: number;
  raDecCorr?: number;
  raParallaxCorr?: number;
  raPmRaCorr?: number;
  raPmDecCorr?: number;
  decParallaxCorr?: number;
  decPmRaCorr?: number;
  decPmDecCorr?: number;
  parallaxPmRaCorr?: number;
  parallaxPmDecCorr?: number;
  pmRaPmDecCorr?: number;
}

export type GaiaRadialCovarianceTreatment =
  | "published-independent-radial-velocity"
  | "conditional-zero-radial-velocity";

export interface GaiaPropagatedCovariance {
  model: "gaia-six-parameter-jacobian";
  radialVelocityTreatment: GaiaRadialCovarianceTreatment;
  propagatedEpochJulianYear: number;
  propagatedParameters: {
    raDeg: number;
    decDeg: number;
    parallaxMas: number;
    pmRaMasYr: number;
    pmDecMasYr: number;
    radialProperMotionMasYr: number;
  };
  jacobian6: Float64Array;
  covariance6: Float64Array;
  angularEllipse: PropagatedAngularUncertaintyEllipseMas;
  positionCovarianceLy2: Float64Array;
  positionEllipsoid: {
    semiMajorLy: number;
    semiIntermediateLy: number;
    semiMinorLy: number;
    radialSigmaLy: number;
    transverseRmsLy: number;
  };
}

const PARAMETER_COUNT = 6;
const PARSEC_TO_LIGHT_YEAR = 3.2615637771674333;
const KILOMETRES_PER_SECOND_PER_AU_PER_JULIAN_YEAR = 4.740470464;

interface Dual6 {
  value: number;
  derivatives: Float64Array;
}

type DualVector3 = [Dual6, Dual6, Dual6];

const dualConstant = (value: number): Dual6 => ({
  value,
  derivatives: new Float64Array(PARAMETER_COUNT),
});

const dualVariable = (value: number, index: number, derivative = 1): Dual6 => {
  const derivatives = new Float64Array(PARAMETER_COUNT);
  derivatives[index] = derivative;
  return { value, derivatives };
};

const dualMap = (value: number, left: Dual6, right: Dual6, leftScale: number, rightScale: number): Dual6 => {
  const derivatives = new Float64Array(PARAMETER_COUNT);
  for (let index = 0; index < PARAMETER_COUNT; index += 1) {
    derivatives[index] = left.derivatives[index] * leftScale + right.derivatives[index] * rightScale;
  }
  return { value, derivatives };
};

const dualAdd = (left: Dual6, right: Dual6) => dualMap(left.value + right.value, left, right, 1, 1);
const dualSubtract = (left: Dual6, right: Dual6) => dualMap(left.value - right.value, left, right, 1, -1);
const dualMultiply = (left: Dual6, right: Dual6) =>
  dualMap(left.value * right.value, left, right, right.value, left.value);
const dualScale = (value: Dual6, scale: number): Dual6 => ({
  value: value.value * scale,
  derivatives: Float64Array.from(value.derivatives, (derivative) => derivative * scale),
});
const dualNegate = (value: Dual6) => dualScale(value, -1);
const dualReciprocal = (value: Dual6): Dual6 => {
  const reciprocal = 1 / value.value;
  return {
    value: reciprocal,
    derivatives: Float64Array.from(value.derivatives, (derivative) => -derivative * reciprocal * reciprocal),
  };
};
const dualSqrt = (value: Dual6): Dual6 => {
  const root = Math.sqrt(value.value);
  return {
    value: root,
    derivatives: Float64Array.from(value.derivatives, (derivative) => derivative / (2 * root)),
  };
};
const dualSin = (value: Dual6): Dual6 => ({
  value: Math.sin(value.value),
  derivatives: Float64Array.from(value.derivatives, (derivative) => derivative * Math.cos(value.value)),
});
const dualCos = (value: Dual6): Dual6 => ({
  value: Math.cos(value.value),
  derivatives: Float64Array.from(value.derivatives, (derivative) => -derivative * Math.sin(value.value)),
});
const dualAtan2 = (y: Dual6, x: Dual6): Dual6 => {
  const denominator = x.value * x.value + y.value * y.value;
  const derivatives = new Float64Array(PARAMETER_COUNT);
  for (let index = 0; index < PARAMETER_COUNT; index += 1) {
    derivatives[index] = (x.value * y.derivatives[index] - y.value * x.derivatives[index]) / denominator;
  }
  return { value: Math.atan2(y.value, x.value), derivatives };
};

const dualVectorAdd = (left: DualVector3, right: DualVector3): DualVector3 => [
  dualAdd(left[0], right[0]),
  dualAdd(left[1], right[1]),
  dualAdd(left[2], right[2]),
];
const dualVectorSubtract = (left: DualVector3, right: DualVector3): DualVector3 => [
  dualSubtract(left[0], right[0]),
  dualSubtract(left[1], right[1]),
  dualSubtract(left[2], right[2]),
];
const dualVectorScale = (vector: DualVector3, scale: Dual6): DualVector3 => [
  dualMultiply(vector[0], scale),
  dualMultiply(vector[1], scale),
  dualMultiply(vector[2], scale),
];
const dualVectorDot = (left: DualVector3, right: DualVector3) =>
  dualAdd(dualAdd(dualMultiply(left[0], right[0]), dualMultiply(left[1], right[1])), dualMultiply(left[2], right[2]));

const createNormalTriad = (alpha: Dual6, delta: Dual6) => {
  const sinAlpha = dualSin(alpha);
  const cosAlpha = dualCos(alpha);
  const sinDelta = dualSin(delta);
  const cosDelta = dualCos(delta);
  return {
    p: [dualNegate(sinAlpha), cosAlpha, dualConstant(0)] as DualVector3,
    q: [
      dualNegate(dualMultiply(sinDelta, cosAlpha)),
      dualNegate(dualMultiply(sinDelta, sinAlpha)),
      cosDelta,
    ] as DualVector3,
    r: [dualMultiply(cosDelta, cosAlpha), dualMultiply(cosDelta, sinAlpha), sinDelta] as DualVector3,
  };
};

const multiplySquareMatrices = (left: Float64Array, right: Float64Array, size: number) => {
  const output = new Float64Array(size * size);
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      let value = 0;
      for (let index = 0; index < size; index += 1) {
        value += left[row * size + index] * right[index * size + column];
      }
      output[row * size + column] = value;
    }
  }
  return output;
};

const propagateSquareCovariance = (jacobian: Float64Array, covariance: Float64Array, size: number) => {
  const intermediate = multiplySquareMatrices(jacobian, covariance, size);
  const output = new Float64Array(size * size);
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      let value = 0;
      for (let index = 0; index < size; index += 1) {
        value += intermediate[row * size + index] * jacobian[column * size + index];
      }
      output[row * size + column] = value;
    }
  }
  return output;
};

const buildInitialSixParameterCovariance = (
  input: GaiaSixParameterCovarianceInput,
  radialVelocityAvailable: boolean,
) => {
  const finiteSigma = (value: number | undefined, scale = 1) =>
    Number.isFinite(value) && (value ?? 0) >= 0 ? (value ?? 0) * scale : 0;
  const sigmas = [
    finiteSigma(input.raErrorMas, MAS_TO_RAD),
    finiteSigma(input.decErrorMas, MAS_TO_RAD),
    finiteSigma(input.parallaxErrorMas),
    finiteSigma(input.pmRaErrorMasYr, MAS_TO_RAD),
    finiteSigma(input.pmDecErrorMasYr, MAS_TO_RAD),
    0,
  ];
  const covariance = new Float64Array(PARAMETER_COUNT * PARAMETER_COUNT);
  for (let index = 0; index < 5; index += 1) covariance[index * PARAMETER_COUNT + index] = sigmas[index] ** 2;
  const correlations: Array<[number, number, number | undefined]> = [
    [0, 1, input.raDecCorr],
    [0, 2, input.raParallaxCorr],
    [0, 3, input.raPmRaCorr],
    [0, 4, input.raPmDecCorr],
    [1, 2, input.decParallaxCorr],
    [1, 3, input.decPmRaCorr],
    [1, 4, input.decPmDecCorr],
    [2, 3, input.parallaxPmRaCorr],
    [2, 4, input.parallaxPmDecCorr],
    [3, 4, input.pmRaPmDecCorr],
  ];
  correlations.forEach(([left, right, correlation]) => {
    const bounded = Number.isFinite(correlation) ? Math.min(1, Math.max(-1, correlation ?? 0)) : 0;
    const value = bounded * sigmas[left] * sigmas[right];
    covariance[left * PARAMETER_COUNT + right] = value;
    covariance[right * PARAMETER_COUNT + left] = value;
  });

  if (radialVelocityAvailable) {
    const radialVelocityKmS = input.radialVelocityKmS ?? 0;
    const radialVelocityErrorKmS = input.radialVelocityErrorKmS ?? 0;
    const radialVelocityPerAu = radialVelocityKmS / KILOMETRES_PER_SECOND_PER_AU_PER_JULIAN_YEAR;
    const radialDerivativePerParallax = radialVelocityPerAu * MAS_TO_RAD;
    for (let index = 0; index < 5; index += 1) {
      const value = covariance[index * PARAMETER_COUNT + 2] * radialDerivativePerParallax;
      covariance[index * PARAMETER_COUNT + 5] = value;
      covariance[5 * PARAMETER_COUNT + index] = value;
    }
    covariance[5 * PARAMETER_COUNT + 5] =
      covariance[2 * PARAMETER_COUNT + 2] *
        (radialVelocityKmS ** 2 + radialVelocityErrorKmS ** 2) /
        KILOMETRES_PER_SECOND_PER_AU_PER_JULIAN_YEAR ** 2 *
        MAS_TO_RAD ** 2 +
      (input.parallaxMas * radialVelocityErrorKmS /
        KILOMETRES_PER_SECOND_PER_AU_PER_JULIAN_YEAR *
        MAS_TO_RAD) ** 2;
  }
  return covariance;
};

const covarianceEllipseFromMatrix = (
  varianceRaMas2: number,
  varianceDecMas2: number,
  covarianceRaDecMas2: number,
): PropagatedAngularUncertaintyEllipseMas => {
  const varianceRa = Math.max(0, varianceRaMas2);
  const varianceDec = Math.max(0, varianceDecMas2);
  const covarianceRaDec = covarianceRaDecMas2;
  const trace = varianceRa + varianceDec;
  const discriminant = Math.sqrt(Math.max(0, (varianceRa - varianceDec) ** 2 + 4 * covarianceRaDec ** 2));
  const majorVariance = Math.max(0, (trace + discriminant) / 2);
  const minorVariance = Math.max(0, (trace - discriminant) / 2);
  const positionAngleDeg = ((Math.atan2(2 * covarianceRaDec, varianceRa - varianceDec) * 90) / Math.PI + 180) % 180;

  return {
    rmsMas: Math.sqrt(Math.max(0, trace)),
    semiMajorMas: Math.sqrt(majorVariance),
    semiMinorMas: Math.sqrt(minorVariance),
    positionAngleDeg,
  };
};

const symmetricThreeEigenvalues = (matrix: Float64Array) => {
  const values = Float64Array.from(matrix);
  values[1] = values[3] = (matrix[1] + matrix[3]) / 2;
  values[2] = values[6] = (matrix[2] + matrix[6]) / 2;
  values[5] = values[7] = (matrix[5] + matrix[7]) / 2;
  const pairs: Array<[number, number]> = [[0, 1], [0, 2], [1, 2]];
  for (let iteration = 0; iteration < 32; iteration += 1) {
    let pivotP = 0;
    let pivotQ = 1;
    let maximum = 0;
    pairs.forEach(([p, q]) => {
      const magnitude = Math.abs(values[p * 3 + q]);
      if (magnitude > maximum) {
        maximum = magnitude;
        pivotP = p;
        pivotQ = q;
      }
    });
    const diagonalScale = Math.max(1, Math.abs(values[0]), Math.abs(values[4]), Math.abs(values[8]));
    if (maximum <= Number.EPSILON * diagonalScale) break;
    const p = pivotP;
    const q = pivotQ;
    const pp = values[p * 3 + p];
    const qq = values[q * 3 + q];
    const pq = values[p * 3 + q];
    const tau = (qq - pp) / (2 * pq);
    const tangent = tau === 0
      ? 1
      : Math.sign(tau) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
    const cosine = 1 / Math.sqrt(1 + tangent * tangent);
    const sine = tangent * cosine;
    values[p * 3 + p] = pp - tangent * pq;
    values[q * 3 + q] = qq + tangent * pq;
    values[p * 3 + q] = 0;
    values[q * 3 + p] = 0;
    for (let axis = 0; axis < 3; axis += 1) {
      if (axis === p || axis === q) continue;
      const axisP = values[axis * 3 + p];
      const axisQ = values[axis * 3 + q];
      const rotatedP = cosine * axisP - sine * axisQ;
      const rotatedQ = sine * axisP + cosine * axisQ;
      values[axis * 3 + p] = values[p * 3 + axis] = rotatedP;
      values[axis * 3 + q] = values[q * 3 + axis] = rotatedQ;
    }
  }
  return [values[0], values[4], values[8]].sort((left, right) => right - left);
};

/**
 * Applies Gaia's six-parameter uniform-rectilinear epoch transform and the
 * linear covariance rule C = J C0 J'. The Jacobian is evaluated by forward
 * automatic differentiation, so all 36 partial derivatives remain coupled.
 *
 * The sixth parameter is radial proper motion. When Gaia publishes a radial
 * velocity/error pair, its independent spectroscopic uncertainty is folded
 * into C0 using Gaia documentation equations 4.20-4.21. When the pair is
 * absent, the result is explicitly conditional on the existing 0 km/s motion
 * fallback; no undocumented velocity-dispersion prior is invented.
 */
export const propagateGaiaSixParameterCovariance = (
  input: GaiaSixParameterCovarianceInput,
): GaiaPropagatedCovariance => {
  if (!(input.parallaxMas > 0)) throw new Error("Gaia covariance propagation requires positive parallax.");
  const target = clampGaiaPropagationJulianYear(input.targetJulianYear ?? GAIA_REFERENCE_EPOCH_JULIAN_YEAR);
  const reference = input.referenceEpochJulianYear ?? GAIA_REFERENCE_EPOCH_JULIAN_YEAR;
  const deltaYears = target - reference;
  const radialVelocityAvailable =
    Number.isFinite(input.radialVelocityKmS) && Number.isFinite(input.radialVelocityErrorKmS);
  const radialProperMotionMasYr = radialVelocityAvailable
    ? (input.radialVelocityKmS ?? 0) * input.parallaxMas / KILOMETRES_PER_SECOND_PER_AU_PER_JULIAN_YEAR
    : 0;
  const raRad = input.raDeg * Math.PI / 180;
  const decRad = input.decDeg * Math.PI / 180;
  const cosDec = Math.cos(decRad);
  const alpha = dualVariable(raRad, 0, 1 / Math.max(1e-12, Math.abs(cosDec)));
  const delta = dualVariable(decRad, 1);
  const parallax = dualVariable(input.parallaxMas, 2);
  const muRa = dualVariable(input.pmRaMasYr * MAS_TO_RAD, 3);
  const muDec = dualVariable(input.pmDecMasYr * MAS_TO_RAD, 4);
  const muRadial = dualVariable(radialProperMotionMasYr * MAS_TO_RAD, 5);
  const initial = createNormalTriad(alpha, delta);
  const initialProperMotion = dualVectorAdd(
    dualVectorScale(initial.p, muRa),
    dualVectorScale(initial.q, muDec),
  );
  const properMotionSquared = dualAdd(dualMultiply(muRa, muRa), dualMultiply(muDec, muDec));
  const distanceFactor = dualReciprocal(dualSqrt(dualAdd(
    dualAdd(
      dualConstant(1),
      dualScale(muRadial, 2 * deltaYears),
    ),
    dualScale(
      dualAdd(properMotionSquared, dualMultiply(muRadial, muRadial)),
      deltaYears ** 2,
    ),
  )));
  const propagatedDirection = dualVectorScale(
    dualVectorAdd(
      dualVectorScale(initial.r, dualAdd(dualConstant(1), dualScale(muRadial, deltaYears))),
      dualVectorScale(initialProperMotion, dualConstant(deltaYears)),
    ),
    distanceFactor,
  );
  const propagatedAlpha = dualAtan2(propagatedDirection[1], propagatedDirection[0]);
  const propagatedDelta = dualAtan2(
    propagatedDirection[2],
    dualSqrt(dualAdd(
      dualMultiply(propagatedDirection[0], propagatedDirection[0]),
      dualMultiply(propagatedDirection[1], propagatedDirection[1]),
    )),
  );
  const propagatedTriad = createNormalTriad(propagatedAlpha, propagatedDelta);
  const propagatedParallax = dualMultiply(parallax, distanceFactor);
  const propagatedProperMotionVector = dualVectorScale(
    dualVectorSubtract(
      dualVectorScale(
        initialProperMotion,
        dualAdd(dualConstant(1), dualScale(muRadial, deltaYears)),
      ),
      dualVectorScale(initial.r, dualScale(properMotionSquared, deltaYears)),
    ),
    dualMultiply(distanceFactor, dualMultiply(distanceFactor, distanceFactor)),
  );
  const propagatedMuRa = dualVectorDot(propagatedTriad.p, propagatedProperMotionVector);
  const propagatedMuDec = dualVectorDot(propagatedTriad.q, propagatedProperMotionVector);
  const propagatedMuRadial = dualMultiply(
    dualAdd(
      muRadial,
      dualScale(
        dualAdd(properMotionSquared, dualMultiply(muRadial, muRadial)),
        deltaYears,
      ),
    ),
    dualMultiply(distanceFactor, distanceFactor),
  );
  const outputs = [
    propagatedAlpha,
    propagatedDelta,
    propagatedParallax,
    propagatedMuRa,
    propagatedMuDec,
    propagatedMuRadial,
  ];
  const jacobian6 = new Float64Array(PARAMETER_COUNT * PARAMETER_COUNT);
  const propagatedCosDec = Math.cos(propagatedDelta.value);
  outputs.forEach((output, row) => {
    for (let column = 0; column < PARAMETER_COUNT; column += 1) {
      jacobian6[row * PARAMETER_COUNT + column] =
        row === 0 ? output.derivatives[column] * propagatedCosDec : output.derivatives[column];
    }
  });
  const initialCovariance = buildInitialSixParameterCovariance(input, radialVelocityAvailable);
  const covariance6 = propagateSquareCovariance(jacobian6, initialCovariance, PARAMETER_COUNT);
  const angularEllipse = covarianceEllipseFromMatrix(
    covariance6[0] / MAS_TO_RAD ** 2,
    covariance6[PARAMETER_COUNT + 1] / MAS_TO_RAD ** 2,
    covariance6[1] / MAS_TO_RAD ** 2,
  );

  const propagatedDistanceLy = 1000 * PARSEC_TO_LIGHT_YEAR / propagatedParallax.value;
  const direction = propagatedTriad.r.map((value) => value.value) as [number, number, number];
  const tangentRa = propagatedTriad.p.map((value) => value.value) as [number, number, number];
  const tangentDec = propagatedTriad.q.map((value) => value.value) as [number, number, number];
  const positionJacobian = new Float64Array(3 * PARAMETER_COUNT);
  for (let axis = 0; axis < 3; axis += 1) {
    positionJacobian[axis * PARAMETER_COUNT] = propagatedDistanceLy * tangentRa[axis];
    positionJacobian[axis * PARAMETER_COUNT + 1] = propagatedDistanceLy * tangentDec[axis];
    positionJacobian[axis * PARAMETER_COUNT + 2] =
      -propagatedDistanceLy / propagatedParallax.value * direction[axis];
  }
  const positionCovarianceLy2 = new Float64Array(9);
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      let value = 0;
      for (let left = 0; left < PARAMETER_COUNT; left += 1) {
        for (let right = 0; right < PARAMETER_COUNT; right += 1) {
          value +=
            positionJacobian[row * PARAMETER_COUNT + left] *
            covariance6[left * PARAMETER_COUNT + right] *
            positionJacobian[column * PARAMETER_COUNT + right];
        }
      }
      positionCovarianceLy2[row * 3 + column] = value;
    }
  }
  const eigenvalues = symmetricThreeEigenvalues(positionCovarianceLy2).map((value) => Math.max(0, value));
  let radialVariance = 0;
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      radialVariance += direction[row] * positionCovarianceLy2[row * 3 + column] * direction[column];
    }
  }
  const positionTrace = positionCovarianceLy2[0] + positionCovarianceLy2[4] + positionCovarianceLy2[8];

  return {
    model: "gaia-six-parameter-jacobian",
    radialVelocityTreatment: radialVelocityAvailable
      ? "published-independent-radial-velocity"
      : "conditional-zero-radial-velocity",
    propagatedEpochJulianYear: target,
    propagatedParameters: {
      raDeg: ((propagatedAlpha.value * 180 / Math.PI) + 360) % 360,
      decDeg: propagatedDelta.value * 180 / Math.PI,
      parallaxMas: propagatedParallax.value,
      pmRaMasYr: propagatedMuRa.value / MAS_TO_RAD,
      pmDecMasYr: propagatedMuDec.value / MAS_TO_RAD,
      radialProperMotionMasYr: propagatedMuRadial.value / MAS_TO_RAD,
    },
    jacobian6,
    covariance6,
    angularEllipse,
    positionCovarianceLy2,
    positionEllipsoid: {
      semiMajorLy: Math.sqrt(eigenvalues[0]),
      semiIntermediateLy: Math.sqrt(eigenvalues[1]),
      semiMinorLy: Math.sqrt(eigenvalues[2]),
      radialSigmaLy: Math.sqrt(Math.max(0, radialVariance)),
      transverseRmsLy: Math.sqrt(Math.max(0, positionTrace - radialVariance)),
    },
  };
};
