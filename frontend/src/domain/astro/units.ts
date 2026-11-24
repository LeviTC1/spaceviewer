export type AstroDistanceUnit =
  | "kilometer"
  | "astronomical-unit"
  | "light-year"
  | "parsec"
  | "kiloparsec"
  | "megaparsec";

export interface AstroDistance<U extends AstroDistanceUnit = AstroDistanceUnit> {
  readonly value: number;
  readonly unit: U;
}

export interface AstroVector3<
  U extends AstroDistanceUnit = AstroDistanceUnit,
  F extends string = string,
> {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly unit: U;
  readonly frame: F;
}

export const KILOMETERS_PER_AU = 149_597_870.7;
export const KILOMETERS_PER_LIGHT_YEAR = 9_460_730_472_580.8;
export const LIGHT_YEARS_PER_PARSEC = 3.261_563_777;

const KILOMETERS_PER_UNIT: Record<AstroDistanceUnit, number> = {
  kilometer: 1,
  "astronomical-unit": KILOMETERS_PER_AU,
  "light-year": KILOMETERS_PER_LIGHT_YEAR,
  parsec: KILOMETERS_PER_LIGHT_YEAR * LIGHT_YEARS_PER_PARSEC,
  kiloparsec: KILOMETERS_PER_LIGHT_YEAR * LIGHT_YEARS_PER_PARSEC * 1_000,
  megaparsec: KILOMETERS_PER_LIGHT_YEAR * LIGHT_YEARS_PER_PARSEC * 1_000_000,
};

export const astroDistance = <U extends AstroDistanceUnit>(value: number, unit: U): AstroDistance<U> => {
  if (!Number.isFinite(value)) {
    throw new TypeError(`Astronomical distance must be finite; received ${value}.`);
  }
  return { value, unit };
};

export const convertAstroDistance = <U extends AstroDistanceUnit>(
  distance: AstroDistance,
  targetUnit: U,
): AstroDistance<U> =>
  astroDistance((distance.value * KILOMETERS_PER_UNIT[distance.unit]) / KILOMETERS_PER_UNIT[targetUnit], targetUnit);

export const convertAstroVector = <U extends AstroDistanceUnit, F extends string>(
  vector: AstroVector3<AstroDistanceUnit, F>,
  targetUnit: U,
): AstroVector3<U, F> => {
  const scale = KILOMETERS_PER_UNIT[vector.unit] / KILOMETERS_PER_UNIT[targetUnit];
  return {
    x: vector.x * scale,
    y: vector.y * scale,
    z: vector.z * scale,
    unit: targetUnit,
    frame: vector.frame,
  };
};

export const magnitudeOfAstroVector = (vector: Pick<AstroVector3, "x" | "y" | "z">) =>
  Math.hypot(vector.x, vector.y, vector.z);

export interface CameraRelativeProjectionOptions {
  sceneUnitsPerSourceUnit: number;
  output?: Float32Array;
}

/**
 * JavaScript numbers remain double precision on the CPU. The origin is
 * subtracted before values are converted to the Float32Array uploaded to the
 * GPU, preventing the camera from carrying large absolute coordinates.
 */
export const projectCameraRelative = <U extends AstroDistanceUnit, F extends string>(
  position: AstroVector3<U, F>,
  floatingOrigin: AstroVector3<U, F>,
  options: CameraRelativeProjectionOptions,
) => {
  if (!Number.isFinite(options.sceneUnitsPerSourceUnit) || options.sceneUnitsPerSourceUnit <= 0) {
    throw new RangeError("sceneUnitsPerSourceUnit must be a positive finite number.");
  }
  const output = options.output ?? new Float32Array(3);
  if (output.length < 3) {
    throw new RangeError("Camera-relative output must contain at least three entries.");
  }
  output[0] = (position.x - floatingOrigin.x) * options.sceneUnitsPerSourceUnit;
  output[1] = (position.y - floatingOrigin.y) * options.sceneUnitsPerSourceUnit;
  output[2] = (position.z - floatingOrigin.z) * options.sceneUnitsPerSourceUnit;
  return output;
};
