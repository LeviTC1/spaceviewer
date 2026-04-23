import type { SkyLayerDefinition } from "../core/layers";
import {
  DEEP_SPACE_CLUSTERS_LAYER,
  DEEP_SPACE_GALAXIES_LAYER,
  DEEP_SPACE_NEBULAE_LAYER,
} from "./deepSpaceLayer";
import { LOCAL_STARS_LAYER } from "./localStarsLayer";
import { SOLAR_SYSTEM_LAYER } from "./solarSystemLayer";

const ANNOTATIONS_LAYER: SkyLayerDefinition = {
  id: "annotations.user",
  label: "Annotations",
  description: "Reserved for future saved markers, mission notes, and user-created overlays.",
  objectKinds: ["annotation"],
  defaultVisible: false,
  order: 80,
  status: "planned",
  rendererRole: "overlays",
  capabilities: {
    selectable: true,
    labels: true,
    searchable: true,
  },
  time: {
    behavior: "time-aware",
    cadence: "on-time-change",
    model: "planned-user-annotations",
    description: "Future annotations may attach to map time, but no annotation provider is active yet.",
  },
};

export const SKYMAP_LAYER_DEFINITIONS: SkyLayerDefinition[] = [
  LOCAL_STARS_LAYER,
  SOLAR_SYSTEM_LAYER,
  DEEP_SPACE_GALAXIES_LAYER,
  DEEP_SPACE_NEBULAE_LAYER,
  DEEP_SPACE_CLUSTERS_LAYER,
  ANNOTATIONS_LAYER,
];
