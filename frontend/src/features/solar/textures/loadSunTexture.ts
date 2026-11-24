import { RepeatWrapping, Texture } from "three";
import type { TextureQuality } from "./textureCatalog";
import { loadSolarTextureAsset } from "./loadSolarTextureAsset";

const loadTexture = async (url: string): Promise<Texture | null> => {
  return loadSolarTextureAsset(url, { anisotropy: 8 });
};

const SUN_TEXTURES: Record<TextureQuality, string> = {
  high: "/solar-textures/high/2k_sun.jpg",
  performance: "/solar-textures/perf/2k_sun.jpg",
};

const SUN_NOISE: Record<TextureQuality, string> = {
  high: "/solar-textures/high/noise.png",
  performance: "/solar-textures/perf/noise.png",
};

export const loadSunTextures = async (
  quality: TextureQuality,
): Promise<{ surface: Texture | null; noise: Texture | null }> => {
  const primary = SUN_TEXTURES[quality];
  const fallback = quality === "high" ? SUN_TEXTURES.performance : null;
  const surface = (await loadTexture(primary)) ?? (fallback ? await loadTexture(fallback) : null);
  const noiseSource = SUN_NOISE[quality];
  const noiseFallback = quality === "high" ? SUN_NOISE.performance : null;
  const noise = (await loadTexture(noiseSource)) ?? (noiseFallback ? await loadTexture(noiseFallback) : null);
  if (noise) {
    noise.wrapS = RepeatWrapping;
    noise.wrapT = RepeatWrapping;
    noise.repeat.set(3, 3);
  }
  return { surface, noise };
};
