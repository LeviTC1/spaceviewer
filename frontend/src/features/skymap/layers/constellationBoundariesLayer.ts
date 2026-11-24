import type { SkyLayerChunk, SkyLayerData, SkyLayerDefinition } from "../core/layers";
import type { CelestialOverlaySkyObject } from "../core/objects";
import type { SkyLayerRenderer, SkyLineRenderable } from "../core/renderers";
import {
  CONSTELLATION_BOUNDARY_CATALOG_METADATA,
  CONSTELLATION_BOUNDARY_CATALOG_VERSION,
  CONSTELLATION_BOUNDARY_DISPLAY_RADIUS,
  CONSTELLATION_BOUNDARY_OVERLAY,
  CONSTELLATION_BOUNDARY_PATHS,
} from "./constellationBoundaryCatalog";

export const CONSTELLATION_BOUNDARIES_LAYER_ID = "overlays.constellation-boundaries";

const renderer: SkyLayerRenderer<CelestialOverlaySkyObject> = {
  strategy: "overlay",
  buildRenderables: (objects, context) => {
    const object = objects[0];
    if (!object || context.viewport.cameraDistance > 220) return [];
    const renderable: SkyLineRenderable = {
      kind: "line",
      id: `${CONSTELLATION_BOUNDARIES_LAYER_ID}:j2000-boundaries`,
      layerId: CONSTELLATION_BOUNDARIES_LAYER_ID,
      objectId: object.id,
      paths: CONSTELLATION_BOUNDARY_PATHS,
      label: object.name,
      color: object.visual?.color ?? "#72d7ff",
      opacity: 0.24,
      depthTest: false,
      lodTier: "all-sky-angular-guide",
      sourceChunkId: "iau-j2000-boundaries",
    };
    return [renderable];
  },
};

export const CONSTELLATION_BOUNDARIES_LAYER: SkyLayerDefinition<CelestialOverlaySkyObject> = {
  id: CONSTELLATION_BOUNDARIES_LAYER_ID,
  label: "Constellation boundaries · 88 regions",
  description: "All 88 official IAU J2000 sky-region boundaries on a symbolic angular guide sphere; not constellation stick figures.",
  objectKinds: ["celestial-overlay"],
  defaultVisible: false,
  order: 14,
  status: "active",
  rendererRole: "overlays",
  capabilities: { selectable: false, hoverable: false, labels: false, searchable: false, streaming: false },
  time: {
    behavior: "static",
    cadence: "never",
    model: "official-iau-j2000-equatorial-boundaries",
    description: "Published J2000 region boundaries remain fixed while playback time changes.",
  },
  renderer,
};

const chunks: SkyLayerChunk[] = [{
  id: "iau-j2000-boundaries",
  label: "IAU J2000 boundary network",
  objectIds: [CONSTELLATION_BOUNDARY_OVERLAY.id],
  objectCount: CONSTELLATION_BOUNDARY_CATALOG_METADATA.build.constellationCount,
  status: "ready",
  importanceTier: "context",
  bounds: {
    frame: "equatorial-j2000",
    center: { x: 0, y: 0, z: 0, unit: "scene-unit", sourceFrame: "equatorial-j2000" },
    radius: CONSTELLATION_BOUNDARY_DISPLAY_RADIUS,
    unit: "scene-unit",
  },
}];

export const createConstellationBoundariesLayerData = (): SkyLayerData<CelestialOverlaySkyObject> => ({
  layerId: CONSTELLATION_BOUNDARIES_LAYER_ID,
  objects: [CONSTELLATION_BOUNDARY_OVERLAY],
  chunks,
  metrics: {
    totalObjects: CONSTELLATION_BOUNDARY_CATALOG_METADATA.build.constellationCount,
    searchableObjects: 0,
    chunkCount: 1,
  },
  status: "ready",
  version: CONSTELLATION_BOUNDARY_CATALOG_VERSION,
});
