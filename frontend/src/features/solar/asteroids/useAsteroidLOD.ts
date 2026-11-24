import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import type { SolarScaleMode } from "../solarData";
import { scaleDistanceAu } from "../solarScale";
import type { AsteroidBeltMode } from "./asteroidGenerator";

interface AsteroidLODState {
  count: number;
  opacity: number;
  sizeBoost: number;
  nearBelt: boolean;
}

interface AsteroidLODOptions {
  mode: AsteroidBeltMode;
  scaleMode: SolarScaleMode;
  asteroidBudget: number;
}

export const getAsteroidModeBudget = (mode: AsteroidBeltMode, asteroidBudget: number) => {
  const boundedBudget = Math.max(0, Math.floor(asteroidBudget));
  if (mode === "off") return 0;
  return mode === "simplified" ? Math.min(1_000, boundedBudget) : boundedBudget;
};

export const useAsteroidLOD = ({
  mode,
  scaleMode,
  asteroidBudget,
}: AsteroidLODOptions): AsteroidLODState => {
  const { camera } = useThree();
  const [state, setState] = useState<AsteroidLODState>(() => ({
    count: getAsteroidModeBudget(mode, asteroidBudget),
    opacity: mode === "off" ? 0 : 0.46,
    sizeBoost: 1.18,
    nearBelt: false,
  }));
  const lastUpdate = useRef(0);

  const distances = useMemo(() => {
    const inner = scaleDistanceAu(2.1, scaleMode);
    const outer = scaleDistanceAu(3.3, scaleMode);
    const mid = scaleDistanceAu(2.7, scaleMode);
    return { inner, outer, mid };
  }, [scaleMode]);

  useFrame((_, delta) => {
    lastUpdate.current += delta;
    if (lastUpdate.current < 0.35) return;
    lastUpdate.current = 0;

    if (mode === "off") {
      setState({ count: 0, opacity: 0, sizeBoost: 1, nearBelt: false });
      return;
    }

    const distance = camera.position.length();
    const nearBelt = distance > distances.inner * 0.7 && distance < distances.outer * 1.5;
    const farView = distance > distances.mid * 2.4;
    const midView = distance > distances.mid * 1.2 && !farView;

    const modeBudget = getAsteroidModeBudget(mode, asteroidBudget);

    let targetCount = 0;
    targetCount = farView
      ? Math.max(80, Math.round(modeBudget * (mode === "simplified" ? 0.12 : 0.16)))
      : midView
        ? Math.max(220, Math.round(modeBudget * (mode === "simplified" ? 0.45 : 0.52)))
        : modeBudget;

    const opacity = farView ? 0.28 : midView ? 0.44 : 0.58;
    const sizeBoost = nearBelt ? 1.35 : midView ? 1.18 : 1.08;

    setState((prev) =>
      prev.count === targetCount && prev.opacity === opacity && prev.sizeBoost === sizeBoost && prev.nearBelt === nearBelt
        ? prev
        : { count: targetCount, opacity, sizeBoost, nearBelt },
    );
  });

  return state;
};
