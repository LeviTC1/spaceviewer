import { Texture } from "three";
import type { MoonDef } from "../moonData";
import type { TextureQuality } from "./textureCatalog";
import { loadSolarTextureAsset } from "./loadSolarTextureAsset";

const loadTexture = async (url: string): Promise<Texture | null> => {
  return loadSolarTextureAsset(url, { anisotropy: 4 });
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
