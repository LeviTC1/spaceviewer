import { RepeatWrapping, Texture, SRGBColorSpace } from "three";
import type { TextureQuality } from "./textureCatalog";
import { solarTextureLoader } from "./solarTextureManager";

const textureCache = new Map<string, Texture>();

const loadTexture = async (url: string): Promise<Texture | null> => {
  const cached = textureCache.get(url);
  if (cached) return cached;
  try {
    const texture = await solarTextureLoader.loadAsync(url);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 8;
    textureCache.set(url, texture);
    return texture;
  } catch (error) {
    return null;
  }
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
  const fallback = SUN_TEXTURES[quality === "high" ? "performance" : "high"];
  const surface = (await loadTexture(primary)) ?? (await loadTexture(fallback));
  const noiseSource = SUN_NOISE[quality];
  const noiseFallback = SUN_NOISE[quality === "high" ? "performance" : "high"];
  const noise = (await loadTexture(noiseSource)) ?? (await loadTexture(noiseFallback));
  if (noise) {
    noise.wrapS = RepeatWrapping;
    noise.wrapT = RepeatWrapping;
    noise.repeat.set(3, 3);
  }
  return { surface, noise };
};
