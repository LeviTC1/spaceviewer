import type { MoonDef } from "./moonData";
import { scaleMoonRadiusKm } from "./solarScale";

export const getMoonRenderRadius = (moon: MoonDef) => scaleMoonRadiusKm(moon.radiusKm);
