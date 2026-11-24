import type { PlanetId } from "../solarData";

export type TextureQuality = "high" | "performance";

export interface PlanetTextureSource {
  diffuse: string;
  clouds?: string;
  ring?: string;
  night?: string;
  specular?: string;
  noise?: string;
  atmosphereColor?: string;
}

export type PlanetTextureCatalog = Record<
  PlanetId,
  {
    high: PlanetTextureSource;
    performance: PlanetTextureSource;
  }
>;

const BASE = "/solar-textures";

export const PLANET_TEXTURES: PlanetTextureCatalog = {
  mercury: {
    high: { diffuse: `${BASE}/high/2k_mercury.jpg` },
    performance: { diffuse: `${BASE}/perf/2k_mercury.jpg` },
  },
  venus: {
    high: { diffuse: `${BASE}/high/2k_venus_surface.jpg`, atmosphereColor: "#f5c08a" },
    performance: { diffuse: `${BASE}/perf/2k_venus_surface.jpg`, atmosphereColor: "#f5c08a" },
  },
  earth: {
    high: {
      diffuse: `${BASE}/high/2k_earth_daymap.jpg`,
      clouds: `${BASE}/high/earth_clouds_1024.png`,
      night: `${BASE}/high/earth_lights_2048.png`,
      specular: `${BASE}/high/earth_specular_2048.jpg`,
      atmosphereColor: "#4da6ff",
    },
    performance: {
      diffuse: `${BASE}/perf/2k_earth_daymap.jpg`,
      clouds: `${BASE}/perf/earth_clouds_1024.png`,
      night: `${BASE}/perf/earth_lights_2048.png`,
      specular: `${BASE}/perf/earth_specular_2048.jpg`,
      atmosphereColor: "#4da6ff",
    },
  },
  mars: {
    high: { diffuse: `${BASE}/high/2k_mars.jpg` },
    performance: { diffuse: `${BASE}/perf/2k_mars.jpg` },
  },
  jupiter: {
    high: {
      diffuse: `${BASE}/high/2k_jupiter.jpg`,
      noise: `${BASE}/high/noise.png`,
      atmosphereColor: "#f2c089",
    },
    performance: {
      diffuse: `${BASE}/perf/2k_jupiter.jpg`,
      noise: `${BASE}/perf/noise.png`,
      atmosphereColor: "#f2c089",
    },
  },
  saturn: {
    high: {
      diffuse: `${BASE}/high/2k_saturn.jpg`,
      ring: `${BASE}/high/2k_saturn_ring_alpha.png`,
      noise: `${BASE}/high/noise.png`,
    },
    performance: {
      diffuse: `${BASE}/perf/2k_saturn.jpg`,
      ring: `${BASE}/perf/2k_saturn_ring_alpha.png`,
      noise: `${BASE}/perf/noise.png`,
    },
  },
  uranus: {
    high: { diffuse: `${BASE}/high/2k_uranus.jpg`, noise: `${BASE}/high/noise.png` },
    performance: { diffuse: `${BASE}/perf/2k_uranus.jpg`, noise: `${BASE}/perf/noise.png` },
  },
  neptune: {
    high: { diffuse: `${BASE}/high/2k_neptune.jpg`, noise: `${BASE}/high/noise.png`, atmosphereColor: "#3d7bff" },
    performance: {
      diffuse: `${BASE}/perf/2k_neptune.jpg`,
      noise: `${BASE}/perf/noise.png`,
      atmosphereColor: "#3d7bff",
    },
  },
  pluto: {
    high: { diffuse: `${BASE}/high/2k_pluto.jpg` },
    performance: { diffuse: `${BASE}/perf/2k_pluto.jpg` },
  },
};
