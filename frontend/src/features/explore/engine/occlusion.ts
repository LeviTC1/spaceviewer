// Disc overlap for eclipses and transits (angular radii and separation in radians).

/** Fraction of a disc of angular radius `a` covered by a disc of angular radius `b` whose centre is `d` away. */
export const discOverlapFraction = (a: number, b: number, d: number) => {
  if (a <= 0) return 0;
  if (d >= a + b) return 0;
  if (d <= Math.abs(b - a)) return b >= a ? 1 : (b * b) / (a * a);
  const a2 = a * a;
  const b2 = b * b;
  const alpha = Math.acos(Math.min(1, Math.max(-1, (d * d + a2 - b2) / (2 * d * a))));
  const beta = Math.acos(Math.min(1, Math.max(-1, (d * d + b2 - a2) / (2 * d * b))));
  const area = a2 * alpha + b2 * beta - 0.5 * Math.sqrt(Math.max(0, (-d + a + b) * (d + a - b) * (d - a + b) * (d + a + b)));
  return Math.min(1, area / (Math.PI * a2));
};
