import { Texture, SRGBColorSpace } from "three";
import type { MoonDef } from "../moonData";
import type { TextureQuality } from "./textureCatalog";
import { solarTextureLoader } from "./solarTextureManager";

const textureCache = new Map<string, Texture>();

const loadTexture = async (url: string): Promise<Texture | null> => {
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

export const loadMoonTexture = async (
  moon: MoonDef,
  quality: TextureQuality,
): Promise<Texture | null> => {
  const baseName = moon.textureKey ?? "moon_1024.jpg";
  const path = baseName.startsWith("/")
    ? baseName
    : `/solar-textures/${quality === "high" ? "high" : "perf"}/${baseName}`;
  return loadTexture(path);
};
