import { Texture, SRGBColorSpace } from "three";
import type { PlanetId } from "../solarData";
import { PLANET_TEXTURES, type TextureQuality } from "./textureCatalog";
import { solarTextureLoader } from "./solarTextureManager";

export interface PlanetTextureAssets {
  diffuse?: Texture;
  clouds?: Texture;
  ring?: Texture;
  night?: Texture;
  specular?: Texture;
  noise?: Texture;
  atmosphereColor?: string;
}

const textureCache = new Map<string, Texture>();

const loadTexture = async (url?: string): Promise<Texture | null> => {
  if (!url) return null;
  const cached = textureCache.get(url);
  if (cached) return cached;
  try {
    const texture = await solarTextureLoader.loadAsync(url);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    textureCache.set(url, texture);
    return texture;
  } catch (error) {
    return null;
  }
};

export const loadPlanetTexture = async (
  planetId: PlanetId,
  quality: TextureQuality,
): Promise<PlanetTextureAssets> => {
  const sources = PLANET_TEXTURES[planetId];
  const primary = sources[quality];
  const fallback = sources[quality === "high" ? "performance" : "high"];

  const diffuse =
    (await loadTexture(primary.diffuse)) ?? (primary.diffuse !== fallback.diffuse ? await loadTexture(fallback.diffuse) : null);
  const clouds = primary.clouds
    ? (await loadTexture(primary.clouds)) ?? (primary.clouds !== fallback.clouds ? await loadTexture(fallback.clouds) : null)
    : null;
  const ring = primary.ring
    ? (await loadTexture(primary.ring)) ?? (primary.ring !== fallback.ring ? await loadTexture(fallback.ring) : null)
    : null;
  const night = primary.night
    ? (await loadTexture(primary.night)) ?? (primary.night !== fallback.night ? await loadTexture(fallback.night) : null)
    : null;
  const specular = primary.specular
    ? (await loadTexture(primary.specular)) ??
      (primary.specular !== fallback.specular ? await loadTexture(fallback.specular) : null)
    : null;
  const noise = primary.noise
    ? (await loadTexture(primary.noise)) ?? (primary.noise !== fallback.noise ? await loadTexture(fallback.noise) : null)
    : null;

  return {
    diffuse: diffuse ?? undefined,
    clouds: clouds ?? undefined,
    ring: ring ?? undefined,
    night: night ?? undefined,
    specular: specular ?? undefined,
    noise: noise ?? undefined,
    atmosphereColor: primary.atmosphereColor ?? fallback.atmosphereColor,
  };
};
