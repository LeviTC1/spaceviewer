import inventory from "../../../../catalog-source/solar-texture-inventory.json";
import type { PlanetId } from "../solarData";
import { PLANET_TEXTURES, type PlanetTextureSource } from "./textureCatalog";

const ROLE_LABELS: Record<Exclude<keyof PlanetTextureSource, "atmosphereColor">, string> = {
  diffuse: "Surface colour",
  clouds: "Cloud colour/alpha",
  ring: "Ring colour/alpha",
  night: "Night emission",
  specular: "Surface specular mask",
  noise: "Artistic detail overlay",
};

export const SOLAR_TEXTURE_PROVENANCE = {
  catalogId: inventory.id,
  version: inventory.version,
  sourceStatus: inventory.sourceStatus,
  licenceStatus: inventory.licenceStatus,
  renderingStatus: inventory.renderingStatus,
  note: inventory.note,
  manifestHref: "/solar-textures/manifest.json",
  attributionHref: inventory.attributionHref,
} as const;

export const getPlanetTextureRoles = (planetId: PlanetId): string[] => {
  const sources = PLANET_TEXTURES[planetId];
  const keys = new Set<Exclude<keyof PlanetTextureSource, "atmosphereColor">>();
  for (const source of [sources.high, sources.performance]) {
    for (const key of Object.keys(source) as Array<keyof PlanetTextureSource>) {
      if (key !== "atmosphereColor" && source[key]) keys.add(key);
    }
  }
  return [...keys].map((key) => ROLE_LABELS[key]);
};
