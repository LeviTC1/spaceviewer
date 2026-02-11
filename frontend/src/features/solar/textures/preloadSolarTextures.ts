import { PLANETS } from "../solarData";
import { MOONS } from "../moonData";
import type { TextureQuality } from "./textureCatalog";
import { loadPlanetTexture } from "./loadPlanetTexture";
import { loadMoonTexture } from "./loadMoonTexture";
import { loadSunTextures } from "./loadSunTexture";

export const preloadSolarTextures = async (quality: TextureQuality) => {
  const tasks: Array<Promise<unknown>> = [];
  tasks.push(loadSunTextures(quality));
  PLANETS.forEach((planet) => {
    tasks.push(loadPlanetTexture(planet.id, quality));
  });
  MOONS.forEach((moon) => {
    tasks.push(loadMoonTexture(moon, quality));
  });
  await Promise.allSettled(tasks);
};
