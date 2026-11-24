import type { CartesianSkyPosition } from "../core/coordinates";
import type { SkyLayerChunk, SkyLayerData, SkyLayerDefinition } from "../core/layers";
import type { SpacecraftSkyObject } from "../core/objects";
import type { SkyLayerRenderer, SkyLineRenderable, SkyPointRenderable } from "../core/renderers";
import { SOLAR_SCENE_UNITS_PER_AU } from "./solarSystemLayer";

export const INTERSTELLAR_PROBES_LAYER_ID = "solar.interstellar-probes";
export const INTERSTELLAR_PROBES_LAYER_VERSION = "jpl-horizons-2026-09-04-v1";

export const VOYAGER_EPHEMERIS_EPOCH_ISO = "2026-09-04T00:00:00Z";
const HORIZONS_API_URL = "https://ssd-api.jpl.nasa.gov/doc/horizons.html";
const VOYAGER_MISSION_URL = "https://science.nasa.gov/mission/voyager/where-are-voyager-1-and-voyager-2-now/";
const AU_PER_DAY_TO_KM_PER_SECOND = 1_731.456_836_33;

export interface VoyagerSnapshot {
  id: "spacecraft:voyager-1" | "spacecraft:voyager-2";
  name: "Voyager 1" | "Voyager 2";
  horizonsCommand: "-31" | "-32";
  positionAu: [number, number, number];
  velocityAuPerDay: [number, number, number];
  color: string;
  description: string;
}

export const VOYAGER_SNAPSHOTS: readonly VoyagerSnapshot[] = [
  {
    id: "spacecraft:voyager-1",
    name: "Voyager 1",
    horizonsCommand: "-31",
    positionAu: [-32.1307427166371, -136.6123461356983, 98.84191277877194],
    velocityAuPerDay: [-0.001195629166006755, -0.007861208020571931, 0.005678583037025216],
    color: "#8feaff",
    description: "NASA's farthest interstellar explorer, shown at its JPL Horizons heliocentric vector for 4 September 2026.",
  },
  {
    id: "spacecraft:voyager-2",
    name: "Voyager 2",
    horizonsCommand: "-32",
    positionAu: [39.82472487204077, -105.3186961521431, -89.52683770292633],
    velocityAuPerDay: [0.002427686326292511, -0.005394578160478374, -0.006536229334807781],
    color: "#ffd58f",
    description: "NASA's grand-tour probe and second active interstellar explorer, positioned from JPL Horizons for 4 September 2026.",
  },
];

const toScenePosition = ([x, y, z]: VoyagerSnapshot["positionAu"]): CartesianSkyPosition => ({
  mode: "cartesian",
  frame: "heliocentric-ecliptic",
  unit: "scene-unit",
  x: x * SOLAR_SCENE_UNITS_PER_AU,
  y: y * SOLAR_SCENE_UNITS_PER_AU,
  z: z * SOLAR_SCENE_UNITS_PER_AU,
  epoch: { kind: "iso-date", value: VOYAGER_EPHEMERIS_EPOCH_ISO, scale: "tdb" },
});

const vectorMagnitude = ([x, y, z]: [number, number, number]) => Math.hypot(x, y, z);

export const INTERSTELLAR_PROBES: SpacecraftSkyObject[] = VOYAGER_SNAPSHOTS.map((snapshot) => ({
  id: snapshot.id,
  kind: "spacecraft",
  name: snapshot.name,
  position: toScenePosition(snapshot.positionAu),
  epoch: { kind: "iso-date", value: VOYAGER_EPHEMERIS_EPOCH_ISO, scale: "tdb" },
  provenance: [
    {
      source: "NASA/JPL Solar System Dynamics",
      catalog: "JPL Horizons vectors",
      sourceId: snapshot.horizonsCommand,
      retrievedAt: "2026-09-04",
      confidence: "catalog",
      url: HORIZONS_API_URL,
    },
    {
      source: "NASA Science",
      catalog: "Voyager mission status",
      sourceId: snapshot.name,
      retrievedAt: "2026-09-04",
      confidence: "catalog",
      url: VOYAGER_MISSION_URL,
    },
  ],
  visual: {
    color: snapshot.color,
    pointSize: 3.8,
    brightness: 1,
    labelPriority: snapshot.name === "Voyager 1" ? 99 : 98,
  },
  search: {
    aliases: snapshot.name === "Voyager 1" ? ["VGR 1", "1977-084A"] : ["VGR 2", "1977-076A"],
    tags: ["spacecraft", "voyager", "NASA", "JPL", "interstellar probe", "heliopause"],
    description: snapshot.description,
    keywords: [snapshot.name, "Voyager mission", "interstellar space", "Golden Record", "JPL Horizons"],
  },
  scientific: {
    mission: "Voyager",
    status: "Active interstellar mission",
    distanceFromSunAu: vectorMagnitude(snapshot.positionAu),
    velocityRelativeToSunKmS: vectorMagnitude(snapshot.velocityAuPerDay) * AU_PER_DAY_TO_KM_PER_SECOND,
    ephemerisEpochIso: VOYAGER_EPHEMERIS_EPOCH_ISO,
    trajectoryModel: "JPL Horizons geometric heliocentric ecliptic vector, ICRF/J2000 reference",
  },
  relations: [{ type: "orbits", targetId: "solar:sun", label: "Outbound heliocentric trajectory" }],
  time: {
    behavior: "static",
    model: "jpl-horizons-vector-snapshot",
    note: "Position is an epoch-labelled JPL Horizons snapshot, not a live propagated trajectory.",
  },
  importance: {
    score: snapshot.name === "Voyager 1" ? 99 : 98,
    tier: "landmark",
    reasons: ["active interstellar spacecraft", "JPL ephemeris vector", "human exploration landmark"],
  },
}));

const renderer: SkyLayerRenderer<SpacecraftSkyObject> = {
  strategy: "point-cloud",
  buildRenderables: (objects, context) => objects.flatMap((object): Array<SkyLineRenderable | SkyPointRenderable> => {
    const position = context.projectPosition(object.position);
    if (!position) return [];
    const featured = context.featuredObjectIds.has(object.id);
    const origin = { x: 0, y: 0, z: 0, unit: "scene-unit" as const, sourceFrame: "heliocentric-ecliptic" as const };
    return [
      {
        kind: "line",
        id: `${INTERSTELLAR_PROBES_LAYER_ID}:trajectory:${object.id}`,
        layerId: INTERSTELLAR_PROBES_LAYER_ID,
        objectId: object.id,
        paths: [[origin, position]],
        label: `${object.name} outbound vector`,
        color: object.visual?.color,
        opacity: featured ? 0.66 : 0.3,
        depthTest: true,
        lodTier: "interstellar-probe-trajectory",
        sourceChunkId: "voyager-mission",
      },
      {
        kind: "point",
        id: `${INTERSTELLAR_PROBES_LAYER_ID}:${object.id}`,
        layerId: INTERSTELLAR_PROBES_LAYER_ID,
        objectId: object.id,
        position,
        label: object.name,
        color: object.visual?.color,
        size: featured ? 5.2 : object.visual?.pointSize,
        brightness: 1,
        opacity: 1,
        labelPriority: object.visual?.labelPriority,
        interactive: true,
        lodTier: "interstellar-probe",
        sourceChunkId: "voyager-mission",
        importanceScore: object.importance?.score,
      },
    ];
  }),
};

export const INTERSTELLAR_PROBES_LAYER: SkyLayerDefinition<SpacecraftSkyObject> = {
  id: INTERSTELLAR_PROBES_LAYER_ID,
  label: "Interstellar probes",
  description: "Voyager 1 and 2 positioned from epoch-labelled NASA/JPL Horizons heliocentric vectors.",
  objectKinds: ["spacecraft"],
  defaultVisible: true,
  order: 22,
  status: "active",
  rendererRole: "points",
  capabilities: { selectable: true, hoverable: true, labels: true, searchable: true },
  time: {
    behavior: "static",
    cadence: "never",
    model: "jpl-horizons-vector-snapshot",
    description: `Static JPL Horizons vector snapshot at ${VOYAGER_EPHEMERIS_EPOCH_ISO}.`,
  },
  renderer,
};

const createChunk = (): SkyLayerChunk => ({
  id: "voyager-mission",
  label: "Voyager interstellar mission",
  objectIds: INTERSTELLAR_PROBES.map((object) => object.id),
  objectCount: INTERSTELLAR_PROBES.length,
  status: "ready",
  importanceTier: "core",
  bounds: {
    frame: "heliocentric-ecliptic",
    center: { x: 0, y: 0, z: 0, unit: "scene-unit", sourceFrame: "heliocentric-ecliptic" },
    radius: Math.max(...INTERSTELLAR_PROBES.map((object) => object.scientific?.distanceFromSunAu ?? 0)),
    unit: "au",
  },
});

export const createInterstellarProbesLayerData = (): SkyLayerData<SpacecraftSkyObject> => ({
  layerId: INTERSTELLAR_PROBES_LAYER_ID,
  objects: INTERSTELLAR_PROBES,
  chunks: [createChunk()],
  metrics: {
    totalObjects: INTERSTELLAR_PROBES.length,
    searchableObjects: INTERSTELLAR_PROBES.length,
    chunkCount: 1,
    maxDistance: Math.max(...INTERSTELLAR_PROBES.map((object) => object.scientific?.distanceFromSunAu ?? 0)),
  },
  status: "ready",
  version: INTERSTELLAR_PROBES_LAYER_VERSION,
});
