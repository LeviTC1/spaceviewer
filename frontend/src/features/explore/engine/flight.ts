// Camera flights across any scale.
//
// The path follows van Wijk & Nuij, "Smooth and efficient zooming and panning" (IEEE InfoVis 2003):
// it treats the camera's distance to its look-at point as the visible "width" w and the pan distance
// between look-at points as u. The optimal path zooms out while panning, then zooms in. For a hop from a
// planet to its moon the bulge is small and the flight is brisk; for a jump to another galaxy the
// departure point recedes until both ends share the frame, the camera cruises, then brakes on approach.
//
// All quantities are float64 kilometres. Hyperbolic terms use asinh so that pan/width ratios of 1e16
// (Earth orbit → Andromeda) stay numerically stable.

import { length3, lerp3, slerpUnit3, sub3, type Vec3 } from "./units";

export interface FlightEndpoint {
  /** Look-at point (world km). */
  target: Vec3;
  /** Camera distance from the look-at point (km). */
  distance: number;
  /** Unit vector from the look-at point toward the camera. */
  direction: Vec3;
}

export interface FlightPlan {
  start: FlightEndpoint;
  end: FlightEndpoint;
  /** Total path length in van Wijk units. */
  pathLength: number;
  durationMs: number;
  rho: number;
  r0: number;
  u1: number;
  kind: FlightKind;
}

export type FlightKind = "hop" | "system" | "interplanetary" | "interstellar" | "galactic" | "intergalactic";

export interface FlightSample {
  target: Vec3;
  distance: number;
  direction: Vec3;
  /** 0..1 progress along the flight (eased). */
  progress: number;
  /** Peak-relative zoom-out (0 at ends, 1 at the widest point) – drives motion cues. */
  cruise: number;
  done: boolean;
}

const RHO = 1.42;

export const classifyFlight = (panKm: number, maxEndDistanceKm: number): FlightKind => {
  const ratio = panKm / Math.max(1, maxEndDistanceKm);
  if (panKm < 5e6 && ratio < 40) return "hop";
  if (panKm < 2e8) return "system";
  if (panKm < 1e11) return "interplanetary";
  if (panKm < 5e15) return "interstellar";
  if (panKm < 3e18) return "galactic";
  return "intergalactic";
};

const DURATION_BY_KIND: Record<FlightKind, [number, number]> = {
  hop: [1_100, 1_900],
  system: [1_600, 2_800],
  interplanetary: [2_400, 3_800],
  interstellar: [3_400, 5_200],
  galactic: [4_200, 6_200],
  intergalactic: [5_000, 7_400],
};

/**
 * Ease along the path: cubic acceleration, then a quintic tail so arrivals settle rather than stop.
 * Continuous at 0.45 (value and slope match closely enough to be invisible at 60 fps).
 */
const EASE_SPLIT = 0.45;
const EASE_C = 1 / (EASE_SPLIT ** 3 + 0.75 * EASE_SPLIT ** 2 * (1 - EASE_SPLIT));
const EASE_D = (3 * EASE_C * EASE_SPLIT ** 2) / (4 * (1 - EASE_SPLIT) ** 3);
export const easeFlight = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x < EASE_SPLIT ? EASE_C * x * x * x : 1 - EASE_D * Math.pow(1 - x, 4);
};

export const planFlight = (
  start: FlightEndpoint,
  end: FlightEndpoint,
  options: { reducedMotion?: boolean; speedScale?: number } = {},
): FlightPlan => {
  const w0 = Math.max(1e-6, start.distance);
  const w1 = Math.max(1e-6, end.distance);
  const u1 = length3(sub3(end.target, start.target));
  const rho = RHO;
  let r0 = 0;
  let pathLength: number;
  if (u1 < 1e-9 * Math.max(w0, w1)) {
    // Pure zoom (and/or rotation): path length is the log of the zoom ratio.
    pathLength = Math.abs(Math.log(w1 / w0)) / rho;
  } else {
    const b0 = (w1 * w1 - w0 * w0 + rho ** 4 * u1 * u1) / (2 * w0 * rho * rho * u1);
    const b1 = (w1 * w1 - w0 * w0 - rho ** 4 * u1 * u1) / (2 * w1 * rho * rho * u1);
    r0 = -Math.asinh(b0);
    const r1 = -Math.asinh(b1);
    pathLength = (r1 - r0) / rho;
  }
  const kind = classifyFlight(u1, Math.max(w0, w1));
  const [minMs, maxMs] = DURATION_BY_KIND[kind];
  // Angular change also costs time so a 180° swing around the same object is not a jump-cut.
  const angle = Math.acos(Math.min(1, Math.max(-1, start.direction[0] * end.direction[0] + start.direction[1] * end.direction[1] + start.direction[2] * end.direction[2])));
  const lengthTerm = Math.min(1, pathLength / 40);
  let durationMs = minMs + (maxMs - minMs) * lengthTerm + angle * 180;
  durationMs *= options.speedScale ?? 1;
  if (options.reducedMotion) durationMs = 0;
  return { start, end, pathLength, durationMs, rho, r0, u1, kind };
};

/** Sample the flight at elapsed time. `liveEndTarget` lets moving destinations be tracked during flight. */
export const sampleFlight = (plan: FlightPlan, elapsedMs: number, liveEndTarget?: Vec3): FlightSample => {
  const endTarget = liveEndTarget ?? plan.end.target;
  if (plan.durationMs <= 0 || elapsedMs >= plan.durationMs) {
    return { target: endTarget, distance: plan.end.distance, direction: plan.end.direction, progress: 1, cruise: 0, done: true };
  }
  const t = easeFlight(elapsedMs / plan.durationMs);
  const s = t * plan.pathLength;
  const { rho, r0, u1 } = plan;
  const w0 = Math.max(1e-6, plan.start.distance);
  let u: number;
  let w: number;
  if (u1 < 1e-9 * Math.max(w0, plan.end.distance)) {
    u = 0;
    w = w0 * Math.exp(Math.sign(Math.log(plan.end.distance / w0)) * rho * s);
  } else {
    const coshR0 = Math.cosh(r0);
    w = (w0 * coshR0) / Math.cosh(rho * s + r0);
    u = (w0 / (rho * rho)) * (coshR0 * Math.tanh(rho * s + r0) - Math.sinh(r0));
  }
  const fraction = u1 > 0 ? Math.min(1, Math.max(0, u / u1)) : t;
  const target = lerp3(plan.start.target, endTarget, fraction);
  const direction = slerpUnit3(plan.start.direction, plan.end.direction, t);
  const peak = Math.max(w0, plan.end.distance);
  const cruise = Math.max(0, Math.min(1, Math.log(Math.max(w, peak) / peak) / Math.max(1e-6, Math.log(Math.max(peak * 2, maxWidth(plan)) / peak))));
  return { target, distance: Math.max(1e-6, w), direction, progress: t, cruise, done: false };
};

const maxWidth = (plan: FlightPlan) => {
  if (plan.u1 <= 0) return Math.max(plan.start.distance, plan.end.distance);
  // Widest point is where rho*s + r0 = 0.
  return Math.max(plan.start.distance, plan.end.distance, Math.max(1e-6, plan.start.distance) * Math.cosh(plan.r0));
};

// ---------------------------------------------------------------------------------------------
// Framing

export interface FramingViewport {
  width: number;
  height: number;
  /** Pixels occupied by panels on the left/right; the subject is framed in the remaining area. */
  occludedLeft: number;
  occludedRight: number;
  occludedBottom: number;
  verticalFovRad: number;
}

/**
 * Distance at which a sphere of `boundingRadiusKm` fills `fill` of the unobstructed canvas
 * (in the smaller of its two dimensions).
 */
export const frameDistanceForRadius = (boundingRadiusKm: number, viewport: FramingViewport, fill = 0.62) => {
  const freeWidth = Math.max(160, viewport.width - viewport.occludedLeft - viewport.occludedRight);
  const freeHeight = Math.max(160, viewport.height - viewport.occludedBottom);
  const aspect = freeWidth / Math.max(1, viewport.height);
  const tanV = Math.tan(viewport.verticalFovRad / 2) * (freeHeight / viewport.height);
  const tanH = Math.tan(viewport.verticalFovRad / 2) * aspect;
  const tanHalf = Math.min(tanV, tanH) * fill;
  const halfAngle = Math.atan(tanHalf);
  return boundingRadiusKm / Math.sin(Math.max(1e-6, halfAngle));
};
