import { Texture } from "three";
import type { PlanetId } from "../solarData";
import { PLANET_TEXTURES, type TextureQuality } from "./textureCatalog";
import { loadSolarTextureAsset } from "./loadSolarTextureAsset";

export interface PlanetTextureAssets {
  diffuse?: Texture;
  clouds?: Texture;
  ring?: Texture;
  night?: Texture;
  specular?: Texture;
  noise?: Texture;
  atmosphereColor?: string;
}

const loadTexture = async (url?: string): Promise<Texture | null> => {
  return loadSolarTextureAsset(url, { anisotropy: 4 });
};

export const loadPlanetTexture = async (
  planetId: PlanetId,
  quality: TextureQuality,
): Promise<PlanetTextureAssets> => {
  const sources = PLANET_TEXTURES[planetId];
  const primary = sources[quality];
  const fallback = quality === "high" ? sources.performance : null;

  const loadWithFallback = async (primaryUrl?: string, fallbackUrl?: string) => {
    if (!primaryUrl) return null;
    return (
      (await loadTexture(primaryUrl)) ??
      (fallbackUrl && fallbackUrl !== primaryUrl ? await loadTexture(fallbackUrl) : null)
    );
  };

  const diffuse = await loadWithFallback(primary.diffuse, fallback?.diffuse);
  const clouds = await loadWithFallback(primary.clouds, fallback?.clouds);
  const ring = await loadWithFallback(primary.ring, fallback?.ring);
  const night = await loadWithFallback(primary.night, fallback?.night);
  const specular = await loadWithFallback(primary.specular, fallback?.specular);
  const noise = await loadWithFallback(primary.noise, fallback?.noise);

  return {
    diffuse: diffuse ?? undefined,
    clouds: clouds ?? undefined,
    ring: ring ?? undefined,
    night: night ?? undefined,
    specular: specular ?? undefined,
    noise: noise ?? undefined,
    atmosphereColor: primary.atmosphereColor ?? fallback?.atmosphereColor,
  };
};
