import { MOONS, type MoonDef } from "../../solar/moonData";
import { PLANETS, type PlanetDef, type PlanetId } from "../../solar/solarData";
import type { CartesianSkyPosition } from "../core/coordinates";
import type { SkyLayerData, SkyLayerDefinition, SkyLayerChunk } from "../core/layers";
import type {
  MoonSkyObject,
  PlanetSkyObject,
  SkyObject,
  SkyObjectProvenance,
  StarSkyObject,
} from "../core/objects";
import type { SkyLayerRenderer, SkyLineRenderable, SkyMeshRenderable } from "../core/renderers";
import { getSolarBridgeTimeDays, type SkyMapTimeState } from "../core/time";
import type { SkyLayerTimeResolver } from "../core/timeResolvers";
import {
  SOLAR_AU_KM,
  getSolarBodyOrientation,
  getSolarObjectState,
  getSatelliteEphemerisDescriptor,
  projectSolarMoonStateToScenePosition,
  projectSolarStateToScenePosition,
} from "../../../domain/solar";

export const SOLAR_SYSTEM_LAYER_ID = "solar.system-bodies";
export const SOLAR_SYSTEM_LAYER_VERSION = "solar-bridge-shared-domain-v4";

export const SOLAR_SCENE_UNITS_PER_AU = 1.12;
const SOLAR_ORBIT_SAMPLE_COUNT = 128;
const SOLAR_BRIDGE_NOTE =
  "Shared solar-domain provider using VSOP87C heliocentric planet positions where available, controlled analytical states for Earth's Moon and the Galilean moons, and disclosed local approximations for Pluto and unsupported moons.";

type SolarSkyObject = StarSkyObject | PlanetSkyObject | MoonSkyObject;

interface SolarCatalogSnapshot {
  objects: SolarSkyObject[];
  chunks: SkyLayerChunk[];
}

interface SolarRenderRecord {
  object: SolarSkyObject;
  radiusSceneUnits: number;
  color: string;
  chunkId: string;
  importanceScore: number;
}

const solarRenderRecordCache = new WeakMap<readonly SkyObject[], SolarRenderRecord[]>();

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const planetObjectId = (planetId: PlanetId) => `solar:planet:${planetId}`;
const moonObjectId = (moonId: string) => `solar:moon:${moonId}`;

const toPosition = (x: number, y: number, z: number): CartesianSkyPosition => ({
  mode: "cartesian",
  frame: "heliocentric-ecliptic",
  unit: "scene-unit",
  x,
  y,
  z,
});

const getPlanetScenePosition = (planet: PlanetDef, timeDays: number) => {
  const state = getSolarObjectState(planet.id, timeDays);
  if (!state) {
    return {
      x: 0,
      y: 0,
      z: 0,
      unit: "scene-unit" as const,
      sourceFrame: "heliocentric-ecliptic" as const,
    };
  }
  return projectSolarStateToScenePosition(state, {
    scaleDistanceAu: (au) => au * SOLAR_SCENE_UNITS_PER_AU,
  });
};

const getMoonScenePosition = (moon: MoonDef, parent: PlanetDef, timeDays: number) => {
  const parentPosition = getPlanetScenePosition(parent, timeDays);
  const parentRadius = getPlanetRenderRadius(parent);
  const state = getSolarObjectState(moon.id, timeDays);
  if (!state) return parentPosition;
  return projectSolarMoonStateToScenePosition(state, {
    parentScenePosition: parentPosition,
    parentRadiusSceneUnits: parentRadius,
    minParentRadiusMultiplier: 0,
    scaleMoonDistanceKm: (km) => clamp(Math.cbrt(km / SOLAR_AU_KM) * 3.2 + parentRadius * 1.35, 0.48, 2.85),
  });
};

const SOLAR_ORBIT_GUIDES = PLANETS.map((planet) => {
  const path = Array.from({ length: SOLAR_ORBIT_SAMPLE_COUNT + 1 }, (_, index) =>
    getPlanetScenePosition(planet, (index / SOLAR_ORBIT_SAMPLE_COUNT) * planet.orbitalPeriodDays),
  );
  return { planet, path };
});

const getPlanetRenderRadiusFromValues = (planetId: string, radiusKm: number) =>
  clamp(Math.cbrt(radiusKm / 6371) * 0.23, planetId === "pluto" ? 0.12 : 0.18, 0.58);

const getPlanetRenderRadius = (planet: PlanetDef) => getPlanetRenderRadiusFromValues(planet.id, planet.radiusKm);

const getMoonProvenance = (moon: MoonDef, model: string): SkyObjectProvenance[] => {
  const ephemeris = getSatelliteEphemerisDescriptor(moon.id);
  return [
    {
      source: "SpaceViewer Solar Explorer seed data",
      catalog: "Solar bridge seed",
      sourceId: moon.id,
      confidence: "derived",
    },
    ...(model !== "parent-relative-circular" && ephemeris.sourceUrl
      ? [
          {
            source: ephemeris.provider,
            catalog: ephemeris.label,
            sourceId: moon.id,
            confidence: "derived" as const,
            url: ephemeris.sourceUrl,
          },
        ]
      : []),
  ];
};

const buildSunObject = (): StarSkyObject => ({
  id: "solar:sun",
  kind: "star",
  name: "Sun",
  position: toPosition(0, 0, 0),
  epoch: { kind: "static" },
  provenance: [
    {
      source: "SpaceViewer Solar Explorer seed data",
      catalog: "Solar bridge seed",
      sourceId: "sun",
      confidence: "derived",
    },
  ],
  visual: {
    color: "#ffd27b",
    brightness: 1,
    pointSize: 1,
    labelPriority: 0,
  },
  search: {
    aliases: ["Sol", "solar reference star", "solar system sun"],
    tags: ["solar-system", "star", "reference-body"],
    description: "Central reference body for the Solar Explorer bridge layer.",
    keywords: ["sun", "sol", "heliocentric"],
  },
  scientific: {
    spectralType: "G2V",
    luminositySolar: 1,
    temperatureK: 5778,
    distanceLy: 0,
  },
  time: {
    behavior: "static",
    model: "solar-bridge-reference-body",
    note: "The bridge Sun anchors the heliocentric scene and does not move in the current approximation.",
  },
});

const buildPlanetObject = (planet: PlanetDef, timeDays: number): PlanetSkyObject => {
  const position = getPlanetScenePosition(planet, timeDays);
  const orientation = getSolarBodyOrientation(planet.id, { daysSinceEpoch: timeDays });
  return {
    id: planetObjectId(planet.id),
    kind: "planet",
    name: planet.name,
    position: toPosition(position.x, position.y, position.z),
    epoch: { kind: "static" },
    provenance: [
      {
        source: "SpaceViewer Solar Explorer seed data",
        catalog: "Solar bridge seed",
        sourceId: planet.id,
        confidence: "derived",
      },
      {
        source: orientation.source.label,
        catalog: orientation.modelLabel,
        sourceId: planet.id,
        confidence: "derived",
        url: orientation.source.sourceUrl,
      },
    ],
    visual: {
      color: planet.colorHint,
      brightness: planet.id === "earth" ? 0.92 : 0.74,
      labelPriority: planet.id === "earth" || planet.id === "mars" ? 98 : 78,
    },
    search: {
      aliases: [planet.searchQuery, `${planet.name} planet`, `${planet.name} solar system`],
      tags: ["solar-system", "planet", planet.ringSystem ? "rings" : ""].filter(Boolean),
      description: planet.facts.join(" "),
      keywords: [planet.id, "solar", "planet", planet.searchQuery],
    },
    scientific: {
      radiusKm: planet.radiusKm,
      semiMajorAxisAU: planet.semiMajorAxisAU,
      orbitalPeriodDays: planet.orbitalPeriodDays,
      inclinationDeg: planet.inclinationDeg,
      eccentricity: planet.eccentricity,
      poleRightAscensionDeg: orientation.pole.rightAscensionDeg,
      poleDeclinationDeg: orientation.pole.declinationDeg,
      poleAngleToJ2000EclipticNorthDeg: orientation.pole.poleAngleToJ2000EclipticNorthDeg,
      primeMeridianDeg: orientation.primeMeridianDeg,
      rotationPeriodHours: orientation.nominalRotationPeriodHours,
      rotationSense: orientation.rotationSense,
      rotationModel: orientation.modelLabel,
      rotationSystem: orientation.rotationSystem,
      moonCount: planet.moons?.length ?? 0,
      ringSystem: planet.ringSystem,
      facts: planet.facts,
      approximation: SOLAR_BRIDGE_NOTE,
    },
    relations: [{ type: "orbits", targetId: "solar:sun", label: "orbits Sun" }],
    time: {
      behavior: "time-sensitive",
      model: `shared-vsop87-provider + ${orientation.modelLabel}`,
      note: `${SOLAR_BRIDGE_NOTE} Orientation: ${orientation.accuracyNote}`,
    },
  };
};

const buildMoonObject = (moon: MoonDef, parent: PlanetDef, timeDays: number): MoonSkyObject => {
  const position = getMoonScenePosition(moon, parent, timeDays);
  const state = getSolarObjectState(moon.id, timeDays);
  const model = state?.model ?? "parent-relative-circular";
  return {
    id: moonObjectId(moon.id),
    kind: "moon",
    name: moon.name,
    position: toPosition(position.x, position.y, position.z),
    epoch: { kind: "static" },
    provenance: getMoonProvenance(moon, model),
    visual: {
      color: moon.colorHint ?? "#cfd7df",
      brightness: moon.class === "major" ? 0.58 : 0.35,
      labelPriority: moon.name === "Moon" || moon.name === "Europa" || moon.name === "Titan" ? 88 : 46,
    },
    search: {
      aliases: [`${parent.name} ${moon.name}`, `${moon.name} moon`, `${moon.name} ${parent.name} moon`],
      tags: ["solar-system", "moon", moon.class, parent.id],
      description: moon.facts?.join(" "),
      keywords: [moon.id, parent.id, parent.name, "solar", "moon"],
    },
    scientific: {
      parentPlanetId: planetObjectId(parent.id),
      parentPlanetName: parent.name,
      moonClass: moon.class,
      radiusKm: moon.radiusKm,
      orbitalDistanceKm: moon.orbitalDistanceKm,
      orbitalPeriodDays: moon.orbitalPeriodDays,
      inclinationDeg: moon.inclinationDeg,
      orbitDirection: moon.orbitDirection,
      facts: moon.facts,
      approximation: state?.accuracyNote ?? SOLAR_BRIDGE_NOTE,
    },
    relations: [{ type: "orbits", targetId: planetObjectId(parent.id), label: `orbits ${parent.name}` }],
    time: {
      behavior: "time-sensitive",
      model,
      note: state?.accuracyNote ?? SOLAR_BRIDGE_NOTE,
    },
  };
};

const buildSolarCatalog = (timeDays = 0): SolarCatalogSnapshot => {
  const planetsById = new Map(PLANETS.map((planet) => [planet.id, planet]));
  const planetObjects = PLANETS.map((planet) => buildPlanetObject(planet, timeDays));
  const majorMoonObjects = MOONS.filter((moon) => moon.class === "major").flatMap((moon) => {
    const parent = planetsById.get(moon.parentPlanet);
    return parent ? [buildMoonObject(moon, parent, timeDays)] : [];
  });
  const objects = [buildSunObject(), ...planetObjects, ...majorMoonObjects];

  const chunkFor = (id: string, label: string, objectIds: string[], radius: number, importanceTier: SkyLayerChunk["importanceTier"]) => ({
    id,
    label,
    objectIds,
    objectCount: objectIds.length,
    status: "ready" as const,
    bounds: {
      frame: "heliocentric-ecliptic" as const,
      center: { x: 0, y: 0, z: 0, unit: "scene-unit" as const, sourceFrame: "heliocentric-ecliptic" as const },
      radius,
      unit: "scene-unit" as const,
    },
    importanceTier,
  });

  return {
    objects,
    chunks: [
      chunkFor("solar-reference", "Sun", ["solar:sun"], 1.2, "core"),
      chunkFor(
        "solar-inner-planets",
        "Inner planets",
        PLANETS.filter((planet) => planet.semiMajorAxisAU <= 2).map((planet) => planetObjectId(planet.id)),
        3,
        "core",
      ),
      chunkFor(
        "solar-outer-planets",
        "Outer planets and dwarf planets",
        PLANETS.filter((planet) => planet.semiMajorAxisAU > 2).map((planet) => planetObjectId(planet.id)),
        48,
        "context",
      ),
      chunkFor("solar-major-moons", "Major moons", majorMoonObjects.map((moon) => moon.id), 50, "context"),
    ],
  };
};

const getChunkIdForObject = (object: SolarSkyObject) => {
  if (object.id === "solar:sun") return "solar-reference";
  if (object.kind === "moon") return "solar-major-moons";
  if (object.kind === "planet") {
    const semiMajorAxisAU = object.scientific?.semiMajorAxisAU ?? 0;
    return semiMajorAxisAU <= 2 ? "solar-inner-planets" : "solar-outer-planets";
  }
  return "solar-reference";
};

const getRenderRadius = (object: SolarSkyObject) => {
  if (object.id === "solar:sun") return 0.92;
  if (object.kind === "planet") {
    return getPlanetRenderRadiusFromValues(
      object.id.replace("solar:planet:", ""),
      object.scientific?.radiusKm ?? 6371,
    );
  }
  if (object.kind === "moon") {
    return clamp(Math.cbrt((object.scientific?.radiusKm ?? 1737.4) / 1737.4) * 0.11, 0.075, 0.22);
  }
  return 0.92;
};

const getSolarImportance = (object: SolarSkyObject) => {
  if (object.id === "solar:sun") return 220;
  if (object.kind === "planet") return 150 - (object.scientific?.semiMajorAxisAU ?? 1);
  return 70 + (object.visual?.labelPriority ?? 0) * 0.2;
};

const buildSolarRenderRecords = (objects: readonly SkyObject[]) => {
  const cached = solarRenderRecordCache.get(objects);
  if (cached) return cached;

  const records = objects
    .filter((object): object is SolarSkyObject =>
      object.id === "solar:sun" || object.kind === "planet" || object.kind === "moon",
    )
    .map((object) => ({
      object,
      radiusSceneUnits: getRenderRadius(object),
      color: object.visual?.color ?? (object.kind === "moon" ? "#cfd7df" : "#f5f7ff"),
      chunkId: getChunkIdForObject(object),
      importanceScore: getSolarImportance(object),
    }));

  solarRenderRecordCache.set(objects, records);
  return records;
};

const solarSystemTimeResolver: SkyLayerTimeResolver = {
  id: "solar-bridge-shared-domain-orbits",
  resolveObjects: (objects, time: SkyMapTimeState) => {
    const timeDays = getSolarBridgeTimeDays(time);
    const planetById = new Map(PLANETS.map((planet) => [planetObjectId(planet.id), planet]));
    const moonById = new Map(MOONS.map((moon) => [moonObjectId(moon.id), moon]));
    const planetDefByPlanetId = new Map(PLANETS.map((planet) => [planet.id, planet]));

    return objects.map((object) => {
      if (object.id === "solar:sun") {
        return {
          ...object,
          position: toPosition(0, 0, 0),
          epoch: { kind: "iso-date", value: time.currentTimeIso, scale: "utc" },
        };
      }

      if (object.kind === "planet") {
        const planet = planetById.get(object.id);
        if (!planet) return object;
        const position = getPlanetScenePosition(planet, timeDays);
        return {
          ...object,
          position: toPosition(position.x, position.y, position.z),
          epoch: { kind: "iso-date", value: time.currentTimeIso, scale: "utc" },
        };
      }

      if (object.kind === "moon") {
        const moon = moonById.get(object.id);
        const parent = moon ? planetDefByPlanetId.get(moon.parentPlanet) : null;
        if (!moon || !parent) return object;
        const position = getMoonScenePosition(moon, parent, timeDays);
        const state = getSolarObjectState(moon.id, timeDays);
        const model = state?.model ?? "parent-relative-circular";
        return {
          ...object,
          position: toPosition(position.x, position.y, position.z),
          epoch: { kind: "iso-date", value: time.currentTimeIso, scale: "utc" },
          provenance: getMoonProvenance(moon, model),
          scientific: {
            ...object.scientific,
            approximation: state?.accuracyNote ?? SOLAR_BRIDGE_NOTE,
          },
          time: {
            behavior: "time-sensitive",
            model,
            note: state?.accuracyNote ?? SOLAR_BRIDGE_NOTE,
          },
        };
      }

      return object;
    });
  },
  resolveObjectState: (object, time) => ({
    object,
    position: object.position,
    resolvedAtIso: time.currentTimeIso,
    note: SOLAR_BRIDGE_NOTE,
  }),
};

const solarSystemRenderer: SkyLayerRenderer = {
  strategy: "mesh",
  buildRenderables: (objects, context) => {
    const featuredIds = context.featuredObjectIds;
    const orbitGuides: SkyLineRenderable[] = SOLAR_ORBIT_GUIDES.map(({ planet, path }) => ({
      kind: "line",
      id: `${SOLAR_SYSTEM_LAYER_ID}:orbit:${planet.id}`,
      layerId: SOLAR_SYSTEM_LAYER_ID,
      objectId: planetObjectId(planet.id),
      paths: [path],
      label: `${planet.name} orbital guide`,
      color: planet.colorHint,
      opacity: planet.semiMajorAxisAU > 10 ? 0.2 : 0.3,
      depthTest: true,
      lodTier: "solar-orbit-guide",
      sourceChunkId: planet.semiMajorAxisAU <= 2 ? "solar-inner-planets" : "solar-outer-planets",
    }));
    const bodyMeshes = buildSolarRenderRecords(objects).flatMap((record): SkyMeshRenderable[] => {
      const position = context.projectPosition(record.object.position);
      if (!position) return [];
      const featured = featuredIds.has(record.object.id);
      return [
        {
          kind: "mesh",
          id: `${SOLAR_SYSTEM_LAYER_ID}:${record.object.id}`,
          layerId: SOLAR_SYSTEM_LAYER_ID,
          objectId: record.object.id,
          position,
          label: record.object.name,
          color: record.color,
          radiusSceneUnits: record.radiusSceneUnits * (featured ? 1.18 : 1),
          opacity: record.object.id === "solar:sun" ? 0.98 : 0.9,
          labelPriority: record.object.visual?.labelPriority,
          interactive: true,
          lodTier: "solar-bridge",
          sourceChunkId: record.chunkId,
          importanceScore: record.importanceScore,
          meshMetadata: {
            family: "solar-body",
            shape: "sphere",
          },
        },
      ];
    });
    return [...orbitGuides, ...bodyMeshes];
  },
};

export const SOLAR_SYSTEM_LAYER: SkyLayerDefinition = {
  id: SOLAR_SYSTEM_LAYER_ID,
  label: "Solar bodies",
  description: "Planets and major moons adapted from the shared Solar provider, including controlled lunar and Galilean analytical states.",
  objectKinds: ["star", "planet", "moon"],
  defaultVisible: true,
  order: 20,
  status: "active",
  rendererRole: "meshes",
  capabilities: {
    selectable: true,
    hoverable: true,
    labels: true,
    searchable: true,
    timeAware: true,
  },
  time: {
    behavior: "time-sensitive",
    cadence: "on-time-change",
    model: "solar-bridge-shared-domain-orbits",
    description: "Planets and major moons update from SkyMap simulation time through the shared solar-domain provider.",
  },
  timeResolver: solarSystemTimeResolver,
  renderer: solarSystemRenderer,
};

export const createSolarSystemLayerData = (): SkyLayerData<SolarSkyObject> => {
  const catalog = buildSolarCatalog();
  return {
    layerId: SOLAR_SYSTEM_LAYER_ID,
    objects: catalog.objects,
    chunks: catalog.chunks,
    metrics: {
      totalObjects: catalog.objects.length,
      searchableObjects: catalog.objects.length,
      chunkCount: catalog.chunks.length,
      maxDistance: 50,
    },
    status: "ready",
    version: SOLAR_SYSTEM_LAYER_VERSION,
  };
};
