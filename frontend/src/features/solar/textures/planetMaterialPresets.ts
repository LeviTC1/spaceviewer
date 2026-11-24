import type { PlanetId } from "../solarData";

export interface AtmosphereVisualPreset {
  color: string;
  shellScale: number;
  opacity: number;
  falloff: number;
}

export interface PlanetMaterialPreset {
  roughness: number;
  metalness: number;
  detailOverlayOpacity: number;
  atmosphere?: AtmosphereVisualPreset;
}

/**
 * Rendering controls, not measured planetary material constants. The values are
 * deliberately identified as visual approximations in the details panel.
 */
export const PLANET_MATERIAL_PRESETS: Record<PlanetId, PlanetMaterialPreset> = {
  mercury: { roughness: 0.94, metalness: 0, detailOverlayOpacity: 0 },
  venus: {
    roughness: 0.82,
    metalness: 0,
    detailOverlayOpacity: 0,
    atmosphere: { color: "#f5c08a", shellScale: 1.13, opacity: 0.16, falloff: 2.25 },
  },
  earth: {
    roughness: 0.58,
    metalness: 0,
    detailOverlayOpacity: 0,
    atmosphere: { color: "#4da6ff", shellScale: 1.1, opacity: 0.14, falloff: 2.7 },
  },
  mars: {
    roughness: 0.92,
    metalness: 0,
    detailOverlayOpacity: 0,
    atmosphere: { color: "#d9a07a", shellScale: 1.035, opacity: 0.035, falloff: 3.4 },
  },
  jupiter: {
    roughness: 0.68,
    metalness: 0,
    detailOverlayOpacity: 0.055,
    atmosphere: { color: "#f2c089", shellScale: 1.055, opacity: 0.07, falloff: 2.5 },
  },
  saturn: {
    roughness: 0.72,
    metalness: 0,
    detailOverlayOpacity: 0.045,
    atmosphere: { color: "#e6cf9d", shellScale: 1.05, opacity: 0.06, falloff: 2.55 },
  },
  uranus: {
    roughness: 0.7,
    metalness: 0,
    detailOverlayOpacity: 0.035,
    atmosphere: { color: "#7bd4d4", shellScale: 1.06, opacity: 0.075, falloff: 2.45 },
  },
  neptune: {
    roughness: 0.67,
    metalness: 0,
    detailOverlayOpacity: 0.04,
    atmosphere: { color: "#3d7bff", shellScale: 1.065, opacity: 0.085, falloff: 2.4 },
  },
  pluto: { roughness: 0.96, metalness: 0, detailOverlayOpacity: 0 },
};

export const PLANET_MATERIAL_MODEL = {
  status: "visual-approximation" as const,
  surfaceLighting: "Sun-lit standard material; Earth uses its local specular mask",
  atmosphereLighting:
    "Generated Earth/Mars single-scattering optical-depth LUT with a sun-aware analytic fallback for other atmospheres",
  ringLighting: "Source-defined radial sampling with finite-Sun analytic planet shadow and ring-transmission surface shadow",
  eclipseLighting: "Finite solar-disc apparent-overlap shadows on planets and selected moons with analytic umbra and penumbra",
};
