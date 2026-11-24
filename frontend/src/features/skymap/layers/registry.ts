import type { SkyLayerDefinition } from "../core/layers";
import {
  DEEP_SPACE_CLUSTERS_LAYER,
  DEEP_SPACE_GALAXIES_LAYER,
  DEEP_SPACE_NEBULAE_LAYER,
} from "./deepSpaceLayer";
import { LOCAL_STARS_LAYER } from "./localStarsLayer";
import { SOLAR_SYSTEM_LAYER } from "./solarSystemLayer";
import { ANNOTATIONS_LAYER } from "./annotationsLayer";
import { GALACTIC_STRUCTURE_LAYER } from "./galacticStructureLayer";
import { COSMOLOGICAL_STRUCTURE_LAYER } from "./cosmologicalStructureLayer";
import { LOCAL_GROUP_GALAXIES_LAYER } from "./localGroupLayer";
import { CONSTELLATION_BOUNDARIES_LAYER } from "./constellationBoundariesLayer";
import { EXOPLANET_SYSTEMS_LAYER } from "./exoplanetSystemsLayer";
import { INTERSTELLAR_PROBES_LAYER } from "./interstellarProbesLayer";

export const SKYMAP_LAYER_DEFINITIONS: SkyLayerDefinition[] = [
  LOCAL_STARS_LAYER,
  EXOPLANET_SYSTEMS_LAYER as unknown as SkyLayerDefinition,
  CONSTELLATION_BOUNDARIES_LAYER as unknown as SkyLayerDefinition,
  SOLAR_SYSTEM_LAYER,
  INTERSTELLAR_PROBES_LAYER as unknown as SkyLayerDefinition,
  GALACTIC_STRUCTURE_LAYER as unknown as SkyLayerDefinition,
  LOCAL_GROUP_GALAXIES_LAYER as unknown as SkyLayerDefinition,
  DEEP_SPACE_GALAXIES_LAYER,
  DEEP_SPACE_NEBULAE_LAYER,
  DEEP_SPACE_CLUSTERS_LAYER,
  COSMOLOGICAL_STRUCTURE_LAYER as unknown as SkyLayerDefinition,
  ANNOTATIONS_LAYER as unknown as SkyLayerDefinition,
];
