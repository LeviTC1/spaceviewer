import { MathUtils, Vector3 } from "three";
import type { MoonDef } from "./moonData";
import type { SolarScaleMode } from "./solarData";
import {
  MOON_PARENT_DISTANCE_BOOST,
  scaleMoonDistanceKm,
  scaleMoonRadiusKm,
} from "./solarScale";

export const getMoonWorldPosition = (
  moon: MoonDef,
  parentPosition: [number, number, number],
  parentRadius: number,
  timeDays: number,
  scaleMode: SolarScaleMode,
): [number, number, number] => {
  const baseDistance = scaleMoonDistanceKm(moon.orbitalDistanceKm, scaleMode);
  const parentBoost = MOON_PARENT_DISTANCE_BOOST[moon.parentPlanet] ?? 1;
  const orbitDistance = Math.max(baseDistance * parentBoost, parentRadius * 2.2);
  const orbitDirection = moon.orbitDirection ?? 1;
  const angle =
    orbitDirection * (timeDays / moon.orbitalPeriodDays) * Math.PI * 2 +
    (moon.initialOffsetRad ?? 0);
  const x = Math.cos(angle) * orbitDistance;
  const z = Math.sin(angle) * orbitDistance;
  const local = new Vector3(x, 0, z);
  const tilt = MathUtils.degToRad(moon.inclinationDeg ?? 0);
  local.applyAxisAngle(new Vector3(1, 0, 0), tilt);
  return [
    parentPosition[0] + local.x,
    parentPosition[1] + local.y,
    parentPosition[2] + local.z,
  ];
};

export const getMoonRenderRadius = (moon: MoonDef) => scaleMoonRadiusKm(moon.radiusKm);
