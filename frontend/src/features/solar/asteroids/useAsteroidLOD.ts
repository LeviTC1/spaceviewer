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
  performanceMode: boolean;
  highQuality: boolean;
}

export const useAsteroidLOD = ({
  mode,
  scaleMode,
  performanceMode,
  highQuality,
}: AsteroidLODOptions): AsteroidLODState => {
  const { camera } = useThree();
  const [state, setState] = useState<AsteroidLODState>({
    count: 0,
    opacity: 0,
    sizeBoost: 1,
    nearBelt: false,
  });
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

    const maxCount = performanceMode
      ? 1200
      : highQuality
        ? 5000
        : 2500;

    let targetCount = 0;
    if (mode === "simplified") {
      targetCount = farView ? 200 : midView ? 600 : 1000;
    } else {
      targetCount = farView ? 300 : midView ? 1500 : maxCount;
    }

    const opacity = farView ? 0.18 : midView ? 0.35 : 0.5;
    const sizeBoost = nearBelt ? 1.25 : midView ? 1.1 : 1.0;

    setState((prev) =>
      prev.count === targetCount && prev.opacity === opacity && prev.sizeBoost === sizeBoost && prev.nearBelt === nearBelt
        ? prev
        : { count: targetCount, opacity, sizeBoost, nearBelt },
    );
  });

  return state;
};
