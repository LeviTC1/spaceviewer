import { describe, expect, it } from "vitest";
import {
  dateToJulianYear,
  GAIA_PROPAGATION_MAX_JULIAN_YEAR,
  GAIA_PROPAGATION_MIN_JULIAN_YEAR,
  propagateStarCatalogPositions,
  propagateGaiaSixParameterCovariance,
  quantizeGaiaPropagationJulianYear,
  KM_PER_SECOND_TO_LIGHT_YEARS_PER_JULIAN_YEAR,
} from "../src/lib/catalog/starCatalogPropagation";

const singleStarColumns = (overrides: Partial<{
  x: number;
  y: number;
  z: number;
  distanceLy: number;
  raDeg: number;
  decDeg: number;
  pmRaMasYr: number;
  pmDecMasYr: number;
  radialVelocityKmS: number;
}> = {}) => ({
  x: new Float64Array([overrides.x ?? 10]),
  y: new Float64Array([overrides.y ?? 0]),
  z: new Float64Array([overrides.z ?? 0]),
  distanceLy: new Float64Array([overrides.distanceLy ?? 10]),
  raDeg: new Float32Array([overrides.raDeg ?? 0]),
  decDeg: new Float32Array([overrides.decDeg ?? 0]),
  pmRaMasYr: new Float32Array([overrides.pmRaMasYr ?? 0]),
  pmDecMasYr: new Float32Array([overrides.pmDecMasYr ?? 0]),
  radialVelocityKmS: new Float32Array([overrides.radialVelocityKmS ?? Number.NaN]),
});

const sixParameterInput = (overrides: Partial<Parameters<typeof propagateGaiaSixParameterCovariance>[0]> = {}) => ({
  referenceEpochJulianYear: 2016,
  targetJulianYear: 2100,
  raDeg: 42,
  decDeg: -18,
  parallaxMas: 50,
  pmRaMasYr: 420,
  pmDecMasYr: -180,
  radialVelocityKmS: 32,
  radialVelocityErrorKmS: 1.8,
  raErrorMas: 0.2,
  decErrorMas: 0.3,
  parallaxErrorMas: 0.4,
  pmRaErrorMasYr: 0.05,
  pmDecErrorMasYr: 0.07,
  raDecCorr: 0.12,
  raParallaxCorr: -0.18,
  raPmRaCorr: 0.22,
  raPmDecCorr: -0.08,
  decParallaxCorr: 0.16,
  decPmRaCorr: -0.11,
  decPmDecCorr: 0.28,
  parallaxPmRaCorr: 0.09,
  parallaxPmDecCorr: -0.14,
  pmRaPmDecCorr: 0.19,
  ...overrides,
});

const MAS_TO_RAD = Math.PI / (180 * 60 * 60 * 1_000);
const RADIAL_VELOCITY_FACTOR = 4.740470464;

const scalarSixParameterTransform = (
  input: ReturnType<typeof sixParameterInput>,
  offsets = [0, 0, 0, 0, 0, 0],
) => {
  const deltaYears = (input.targetJulianYear ?? 2016) - (input.referenceEpochJulianYear ?? 2016);
  const initialDec = input.decDeg * Math.PI / 180;
  const alpha = input.raDeg * Math.PI / 180 + offsets[0] / Math.cos(initialDec);
  const delta = initialDec + offsets[1];
  const parallax = input.parallaxMas + offsets[2];
  const muRa = input.pmRaMasYr * MAS_TO_RAD + offsets[3];
  const muDec = input.pmDecMasYr * MAS_TO_RAD + offsets[4];
  const muRadial = (input.radialVelocityKmS ?? 0) * input.parallaxMas / RADIAL_VELOCITY_FACTOR * MAS_TO_RAD + offsets[5];
  const sinAlpha = Math.sin(alpha);
  const cosAlpha = Math.cos(alpha);
  const sinDelta = Math.sin(delta);
  const cosDelta = Math.cos(delta);
  const p = [-sinAlpha, cosAlpha, 0];
  const q = [-sinDelta * cosAlpha, -sinDelta * sinAlpha, cosDelta];
  const r = [cosDelta * cosAlpha, cosDelta * sinAlpha, sinDelta];
  const mu0 = p.map((value, axis) => value * muRa + q[axis] * muDec);
  const muSquared = muRa ** 2 + muDec ** 2;
  const factor = 1 / Math.sqrt(
    1 + 2 * muRadial * deltaYears + (muSquared + muRadial ** 2) * deltaYears ** 2,
  );
  const direction = r.map((value, axis) =>
    (value * (1 + muRadial * deltaYears) + mu0[axis] * deltaYears) * factor,
  );
  const targetAlpha = Math.atan2(direction[1], direction[0]);
  const targetDelta = Math.atan2(direction[2], Math.hypot(direction[0], direction[1]));
  const targetP = [-Math.sin(targetAlpha), Math.cos(targetAlpha), 0];
  const targetQ = [
    -Math.sin(targetDelta) * Math.cos(targetAlpha),
    -Math.sin(targetDelta) * Math.sin(targetAlpha),
    Math.cos(targetDelta),
  ];
  const targetMuVector = mu0.map((value, axis) =>
    (value * (1 + muRadial * deltaYears) - r[axis] * muSquared * deltaYears) * factor ** 3,
  );
  const dot = (left: number[], right: number[]) => left.reduce((sum, value, axis) => sum + value * right[axis], 0);
  return [
    targetAlpha,
    targetDelta,
    parallax * factor,
    dot(targetP, targetMuVector),
    dot(targetQ, targetMuVector),
    (muRadial + (muSquared + muRadial ** 2) * deltaYears) * factor ** 2,
  ];
};

describe("Gaia proper-motion propagation", () => {
  it("converts UTC instants to Julian years and quantizes updates to monthly cadence", () => {
    expect(dateToJulianYear("2016-01-01T12:00:00.000Z")).toBeCloseTo(2016, 10);
    expect(quantizeGaiaPropagationJulianYear(2026.671)).toBeCloseTo(2026.666667, 6);
    expect(quantizeGaiaPropagationJulianYear(1800)).toBe(GAIA_PROPAGATION_MIN_JULIAN_YEAR);
    expect(quantizeGaiaPropagationJulianYear(2200)).toBe(GAIA_PROPAGATION_MAX_JULIAN_YEAR);
  });

  it("uses Gaia mu_alpha* directly along the increasing-RA tangent vector", () => {
    const columns = singleStarColumns({ pmRaMasYr: 3_600_000 });
    const propagated = propagateStarCatalogPositions(columns, 2017);
    expect(propagated[0]).toBeCloseTo(10, 6);
    expect(propagated[1]).toBeCloseTo(10 * Math.PI / 180, 6);
    expect(propagated[2]).toBeCloseTo(0, 6);
    expect(Math.atan2(propagated[1], propagated[0]) * 180 / Math.PI).toBeCloseTo(1, 3);
  });

  it("moves positive declination proper motion toward the north celestial pole and reverses in time", () => {
    const columns = singleStarColumns({ pmDecMasYr: 3_600_000 });
    const future = propagateStarCatalogPositions(columns, 2017);
    const past = propagateStarCatalogPositions(columns, 2015);
    expect(future[2]).toBeCloseTo(10 * Math.PI / 180, 6);
    expect(past[2]).toBeCloseTo(-10 * Math.PI / 180, 6);
  });

  it("preserves catalogue coordinates exactly at J2016.0", () => {
    const columns = singleStarColumns({ x: 3, y: 4, z: 5, distanceLy: Math.sqrt(50), raDeg: 53.130102, decDeg: 45 });
    expect([...propagateStarCatalogPositions(columns, 2016)]).toEqual([3, 4, 5]);
  });

  it("adds published radial velocity along the line of sight and reverses it in time", () => {
    const columns = singleStarColumns({ radialVelocityKmS: 100 });
    const future = propagateStarCatalogPositions(columns, 2017);
    const past = propagateStarCatalogPositions(columns, 2015);
    const displacement = 100 * KM_PER_SECOND_TO_LIGHT_YEARS_PER_JULIAN_YEAR;
    expect(future[0]).toBeCloseTo(10 + displacement, 6);
    expect(past[0]).toBeCloseTo(10 - displacement, 6);
    expect(future[1]).toBe(0);
    expect(future[2]).toBe(0);
  });

  it("uses an explicit zero-radial fallback when Gaia has no radial velocity", () => {
    const missing = propagateStarCatalogPositions(singleStarColumns({ radialVelocityKmS: Number.NaN }), 2100);
    const zero = propagateStarCatalogPositions(singleStarColumns({ radialVelocityKmS: 0 }), 2100);
    expect([...missing]).toEqual([...zero]);
  });

  it("evaluates an identity six-parameter Jacobian at the Gaia reference epoch", () => {
    const propagated = propagateGaiaSixParameterCovariance(sixParameterInput({ targetJulianYear: 2016 }));
    for (let row = 0; row < 6; row += 1) {
      for (let column = 0; column < 6; column += 1) {
        expect(propagated.jacobian6[row * 6 + column]).toBeCloseTo(row === column ? 1 : 0, 10);
      }
    }
    expect(propagated.propagatedParameters.raDeg).toBeCloseTo(42, 10);
    expect(propagated.propagatedParameters.decDeg).toBeCloseTo(-18, 10);
    expect(propagated.propagatedParameters.parallaxMas).toBeCloseTo(50, 10);
    expect(propagated.radialVelocityTreatment).toBe("published-independent-radial-velocity");
  });

  it("propagates all six covariance dimensions into angular and 3D confidence", () => {
    const propagated = propagateGaiaSixParameterCovariance(sixParameterInput());
    expect([...propagated.jacobian6].every(Number.isFinite)).toBe(true);
    expect([...propagated.covariance6].every(Number.isFinite)).toBe(true);
    for (let row = 0; row < 6; row += 1) {
      for (let column = 0; column < 6; column += 1) {
        expect(propagated.covariance6[row * 6 + column]).toBeCloseTo(
          propagated.covariance6[column * 6 + row],
          12,
        );
      }
    }
    expect(propagated.angularEllipse.semiMajorMas).toBeGreaterThanOrEqual(propagated.angularEllipse.semiMinorMas);
    expect(propagated.angularEllipse.positionAngleDeg).toBeGreaterThanOrEqual(0);
    expect(propagated.angularEllipse.positionAngleDeg).toBeLessThan(180);
    expect(propagated.positionEllipsoid.semiMajorLy).toBeGreaterThanOrEqual(
      propagated.positionEllipsoid.semiIntermediateLy,
    );
    expect(propagated.positionEllipsoid.semiIntermediateLy).toBeGreaterThanOrEqual(
      propagated.positionEllipsoid.semiMinorLy,
    );
    expect(propagated.positionEllipsoid.radialSigmaLy).toBeGreaterThan(0);
    expect(propagated.positionEllipsoid.transverseRmsLy).toBeGreaterThan(0);
  });

  it("matches an independent central-difference check for all 36 Jacobian terms", () => {
    const input = sixParameterInput();
    const propagated = propagateGaiaSixParameterCovariance(input);
    const base = scalarSixParameterTransform(input);
    const steps = [1e-7, 1e-7, 1e-3, 1e-8, 1e-8, 1e-8];
    for (let column = 0; column < 6; column += 1) {
      const plusOffsets = [0, 0, 0, 0, 0, 0];
      const minusOffsets = [0, 0, 0, 0, 0, 0];
      plusOffsets[column] = steps[column];
      minusOffsets[column] = -steps[column];
      const plus = scalarSixParameterTransform(input, plusOffsets);
      const minus = scalarSixParameterTransform(input, minusOffsets);
      for (let row = 0; row < 6; row += 1) {
        const outputDifference = row === 0
          ? (plus[row] - minus[row]) * Math.cos(base[1])
          : plus[row] - minus[row];
        const finiteDifference = outputDifference / (2 * steps[column]);
        const automaticDerivative = propagated.jacobian6[row * 6 + column];
        const relativeScale = Math.max(1, Math.abs(finiteDifference));
        const relativeDifference = Math.abs(automaticDerivative - finiteDifference) / relativeScale;
        if (relativeDifference >= 2e-6) {
          throw new Error(
            `Jacobian row ${row} column ${column} differed: AD=${automaticDerivative}, finite=${finiteDifference}, relative=${relativeDifference}`,
          );
        }
      }
    }
  });

  it("couples published radial-velocity uncertainty into perspective uncertainty", () => {
    const precise = propagateGaiaSixParameterCovariance(sixParameterInput({
      pmRaMasYr: 8_000,
      pmDecMasYr: -5_000,
      radialVelocityErrorKmS: 0,
    }));
    const uncertain = propagateGaiaSixParameterCovariance(sixParameterInput({
      pmRaMasYr: 8_000,
      pmDecMasYr: -5_000,
      radialVelocityErrorKmS: 40,
    }));
    expect(uncertain.angularEllipse.semiMajorMas).toBeGreaterThan(precise.angularEllipse.semiMajorMas);
    expect(uncertain.positionEllipsoid.semiMajorLy).toBeGreaterThan(precise.positionEllipsoid.semiMajorLy);
  });

  it("keeps missing radial velocity explicitly conditional instead of inventing a prior", () => {
    const propagated = propagateGaiaSixParameterCovariance(sixParameterInput({
      radialVelocityKmS: undefined,
      radialVelocityErrorKmS: undefined,
    }));
    expect(propagated.radialVelocityTreatment).toBe("conditional-zero-radial-velocity");
    expect(propagated.angularEllipse.semiMajorMas).toBeGreaterThan(0);
    expect(propagated.positionEllipsoid.semiMajorLy).toBeGreaterThan(0);
  });

  it("matches the renderer's Cartesian uniform-motion position", () => {
    const input = sixParameterInput();
    const propagated = propagateGaiaSixParameterCovariance(input);
    const distanceLy = (1000 / input.parallaxMas) * 3.2615637771674333;
    const raRad = input.raDeg * Math.PI / 180;
    const decRad = input.decDeg * Math.PI / 180;
    const rendererPosition = propagateStarCatalogPositions(singleStarColumns({
      x: distanceLy * Math.cos(decRad) * Math.cos(raRad),
      y: distanceLy * Math.cos(decRad) * Math.sin(raRad),
      z: distanceLy * Math.sin(decRad),
      distanceLy,
      raDeg: input.raDeg,
      decDeg: input.decDeg,
      pmRaMasYr: input.pmRaMasYr,
      pmDecMasYr: input.pmDecMasYr,
      radialVelocityKmS: input.radialVelocityKmS,
    }), input.targetJulianYear);
    const propagatedDistanceLy = (1000 / propagated.propagatedParameters.parallaxMas) * 3.2615637771674333;
    const propagatedRaRad = propagated.propagatedParameters.raDeg * Math.PI / 180;
    const propagatedDecRad = propagated.propagatedParameters.decDeg * Math.PI / 180;
    expect(rendererPosition[0]).toBeCloseTo(propagatedDistanceLy * Math.cos(propagatedDecRad) * Math.cos(propagatedRaRad), 4);
    expect(rendererPosition[1]).toBeCloseTo(propagatedDistanceLy * Math.cos(propagatedDecRad) * Math.sin(propagatedRaRad), 4);
    expect(rendererPosition[2]).toBeCloseTo(propagatedDistanceLy * Math.sin(propagatedDecRad), 4);
  });

  it("rejects incorrectly sized destination buffers", () => {
    expect(() => propagateStarCatalogPositions(singleStarColumns(), 2026, new Float32Array(2))).toThrow(/expected 3/i);
  });
});
