import { createContext, useContext } from "react";
import type { EngineState } from "../engine/engineState";

export const EngineContext = createContext<EngineState | null>(null);

export const useEngine = () => {
  const engine = useContext(EngineContext);
  if (!engine) throw new Error("Explorer render layers must be mounted inside EngineContext");
  return engine;
};

/** Apparent magnitude → point-sprite brightness mapping shared by stars, planets and markers. */
export const magnitudeToPoint = (magnitude: number, limitingMagnitude: number) => {
  const flux = Math.pow(10, -0.4 * (magnitude - limitingMagnitude));
  const alpha = Math.min(1, Math.max(0, flux));
  const size = Math.min(10, 1.7 + 2.1 * Math.log10(Math.max(1, flux)));
  return { alpha, size, flux };
};

export const MAGNITUDE_POINT_GLSL = /* glsl */ `
void magnitudeToPoint(float m, float limitMag, out float alpha, out float size) {
  float flux = pow(10.0, -0.4 * (m - limitMag));
  alpha = clamp(flux, 0.0, 1.0);
  size = min(10.0, 1.7 + 2.1 * log(max(1.0, flux)) / 2.302585);
}
`;
