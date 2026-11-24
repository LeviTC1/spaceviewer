import type { TextureQuality } from "./textureCatalog";
import { loadSunTextures } from "./loadSunTexture";

export const preloadSolarEssentialTextures = async (quality: TextureQuality) => {
  await Promise.allSettled([loadSunTextures(quality)]);
};
