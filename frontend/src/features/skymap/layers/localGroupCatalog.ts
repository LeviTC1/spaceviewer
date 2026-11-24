import generatedCatalog from "../../../generated/localGroupCatalog.generated.json";
import type { DeepSkyObjectClass, GalaxySkyObject, SkyObjectImportanceMetadata } from "../core/objects";

export const LOCAL_GROUP_CATALOG_VERSION = generatedCatalog.catalog.version;
export const LOCAL_GROUP_SOURCE_URL = generatedCatalog.catalog.releaseUrl;
export const LOCAL_GROUP_MAP_PLACEMENT_NOTE =
  "Physical heliocentric supergalactic direction from LVDB v1.1.1; radius is logarithmically compressed between 10 and 1,400 kpc, so scene separations are not linear physical distances.";

type LocalGroupRecord = (typeof generatedCatalog.records)[number];

const anchorMetadata: Record<string, {
  name: string;
  aliases: string[];
  catalogIds: string[];
  objectClass: DeepSkyObjectClass;
  color: string;
  pointSize: number;
  labelPriority: number;
  brightness: number;
  importance: SkyObjectImportanceMetadata;
  discoveryBlurb: string;
  symbolRotation?: [number, number, number];
  imagery?: NonNullable<GalaxySkyObject["scientific"]>["imagery"];
}> = {
  m_031: {
    name: "Andromeda Galaxy",
    aliases: ["Andromeda", "M31", "M 31", "NGC 224"],
    catalogIds: ["M31", "NGC 224", "LVDB m_031"],
    objectClass: "barred-spiral-galaxy",
    color: "#b7c8ff",
    pointSize: 4.9,
    labelPriority: 100,
    brightness: 0.94,
    importance: { score: 100, tier: "landmark", reasons: ["nearest large galaxy", "Local Group anchor", "catalog-derived position"] },
    discoveryBlurb: "The nearest large galaxy, now positioned from a physical Local Volume Database coordinate transform.",
    symbolRotation: [0.1, 0.25, -0.3],
    imagery: [{
      label: "Wide-field optical image",
      source: "NASA Image and Video Library",
      targetId: "PIA04921",
      previewUrl: "https://images-assets.nasa.gov/image/PIA04921/PIA04921~medium.jpg",
      credit: "NASA Image and Video Library",
      alt: "NASA image of the Andromeda Galaxy",
    }],
  },
  m_033: {
    name: "Triangulum Galaxy",
    aliases: ["Triangulum", "M33", "M 33", "NGC 598", "Pinwheel Galaxy"],
    catalogIds: ["M33", "NGC 598", "LVDB m_033"],
    objectClass: "spiral-galaxy",
    color: "#9fd6ff",
    pointSize: 3.4,
    labelPriority: 91,
    brightness: 0.76,
    importance: { score: 91, tier: "landmark", reasons: ["Local Group spiral", "M33 subgroup anchor", "catalog-derived position"] },
    discoveryBlurb: "A Local Group spiral positioned from its physical supergalactic coordinates.",
    symbolRotation: [0.18, -0.1, 0.4],
  },
  lmc: {
    name: "Large Magellanic Cloud",
    aliases: ["LMC", "Large Magellanic Cloud"],
    catalogIds: ["LMC", "LVDB lmc"],
    objectClass: "irregular-galaxy",
    color: "#c5f0ff",
    pointSize: 4.2,
    labelPriority: 94,
    brightness: 0.84,
    importance: { score: 94, tier: "landmark", reasons: ["nearby Milky Way satellite", "naked-eye galaxy", "catalog-derived position"] },
    discoveryBlurb: "A nearby Milky Way satellite, placed from LVDB distance and supergalactic coordinates.",
    symbolRotation: [0.16, 0.25, 0.1],
  },
  smc: {
    name: "Small Magellanic Cloud",
    aliases: ["SMC", "Small Magellanic Cloud"],
    catalogIds: ["SMC", "LVDB smc"],
    objectClass: "irregular-galaxy",
    color: "#a9e4ff",
    pointSize: 3.6,
    labelPriority: 90,
    brightness: 0.78,
    importance: { score: 90, tier: "landmark", reasons: ["nearby Magellanic satellite", "naked-eye galaxy", "catalog-derived position"] },
    discoveryBlurb: "A nearby Magellanic satellite with a catalogue-derived physical direction and distance.",
    symbolRotation: [-0.1, 0.2, -0.2],
  },
};

const membershipLabels: Record<LocalGroupRecord["membership"], string> = {
  "milky-way-satellite": "Milky Way satellite",
  "m31-satellite": "M31 satellite",
  "local-group-major": "Local Group major galaxy",
  "m33-subgroup": "M33 subgroup",
  "local-group-field": "Local Group field galaxy",
};

const hostNameFor = (record: LocalGroupRecord) => {
  if (record.hostKey === "mw") return "Milky Way";
  if (record.hostKey === "m_031") return "Andromeda Galaxy";
  if (record.hostKey === "m_033") return "Triangulum Galaxy";
  if (record.hostKey === "lmc") return "Large Magellanic Cloud";
  if (record.hostKey === "smc") return "Small Magellanic Cloud";
  return undefined;
};

const importanceFor = (record: LocalGroupRecord): SkyObjectImportanceMetadata => {
  const apparentMagnitude = record.apparentMagnitudeV ?? 18;
  const score = Math.round(Math.max(38, Math.min(76, 75 - apparentMagnitude * 1.25 + (record.hostObjectId ? 4 : 0))));
  return {
    score,
    tier: score >= 70 ? "notable" : "context",
    reasons: [membershipLabels[record.membership], "confirmed galaxy", "catalog-derived position"],
  };
};

const toGalaxyObject = (record: LocalGroupRecord): GalaxySkyObject => {
  const anchor = anchorMetadata[record.sourceKey];
  const membershipLabel = membershipLabels[record.membership];
  const hostName = hostNameFor(record);
  const name = anchor?.name ?? record.name;
  const aliases = Array.from(new Set([...(anchor?.aliases ?? []), ...record.aliases, record.sourceKey]));
  const catalogIds = anchor?.catalogIds ?? [`LVDB ${record.sourceKey}`];
  const importance = anchor?.importance ?? importanceFor(record);

  return {
    id: record.id,
    kind: "galaxy",
    name,
    position: {
      mode: "cartesian",
      frame: "supergalactic-cartesian",
      unit: "kiloparsec",
      x: record.supergalacticKpc.x,
      y: record.supergalacticKpc.y,
      z: record.supergalacticKpc.z,
      epoch: { kind: "static" },
    },
    epoch: { kind: "static" },
    provenance: [{
      source: "Local Volume Database",
      catalog: `LVDB ${generatedCatalog.catalog.version}`,
      sourceId: record.sourceKey,
      confidence: "catalog",
      url: generatedCatalog.catalog.releaseUrl,
    }],
    visual: {
      color: anchor?.color ?? (record.membership === "m31-satellite" ? "#aebcff" : record.membership === "milky-way-satellite" ? "#8fe1ff" : "#d8c7ff"),
      pointSize: anchor?.pointSize ?? 0.78,
      brightness: anchor?.brightness ?? Math.max(0.18, Math.min(0.62, 1 - (record.apparentMagnitudeV ?? 18) / 26)),
      labelPriority: anchor?.labelPriority ?? Math.round(importance.score),
    },
    search: {
      aliases,
      tags: ["local-group", "local-volume-db", "galaxy", record.membership, record.sourceTable, hostName ?? "field"],
      description: `${membershipLabel}${hostName ? ` associated with ${hostName}` : ""}. Physical LVDB distance and supergalactic direction; logarithmic scene radius.`,
      keywords: [name, ...aliases, ...catalogIds, membershipLabel, hostName ?? "", "dwarf galaxy", "LVDB"],
    },
    scientific: {
      objectClass: anchor?.objectClass ?? "dwarf-galaxy",
      distanceLy: record.distanceLy,
      distanceKpc: record.distanceKpc,
      distanceErrorMinusKpc: record.distanceErrorMinusKpc ?? undefined,
      distanceErrorPlusKpc: record.distanceErrorPlusKpc ?? undefined,
      distanceReference: record.distanceReference ?? undefined,
      distanceMeasurementMethod: record.distanceMeasurementMethod ?? undefined,
      apparentMagnitude: record.apparentMagnitudeV ?? undefined,
      absoluteMagnitudeV: record.absoluteMagnitudeV ?? undefined,
      stellarMassSolar: record.stellarMassSolar ?? undefined,
      radialVelocityKmS: record.radialVelocityKmS ?? undefined,
      radialVelocityErrorMinusKmS: record.radialVelocityErrorMinusKmS ?? undefined,
      radialVelocityErrorPlusKmS: record.radialVelocityErrorPlusKmS ?? undefined,
      properMotionRaMasYr: record.properMotionRaMasYr ?? undefined,
      properMotionDecMasYr: record.properMotionDecMasYr ?? undefined,
      raDeg: record.raDeg ?? undefined,
      decDeg: record.decDeg ?? undefined,
      supergalacticKpc: record.supergalacticKpc,
      localGroupMembership: membershipLabel,
      hostName,
      sourceRelease: generatedCatalog.catalog.version,
      coordinateConvention: generatedCatalog.catalog.epoch,
      catalogIds,
      facts: [
        `${membershipLabel}${hostName ? ` associated with ${hostName}` : ""}.`,
        "Catalogue coordinates are physical; only the renderer's radial mapping is compressed.",
      ],
      imagery: anchor?.imagery,
      discoveryBlurb: anchor?.discoveryBlurb ?? `A confirmed ${membershipLabel.toLowerCase()} in the Local Volume Database.`,
      relatedObjectIds: record.hostObjectId ? [record.hostObjectId] : undefined,
      mapPlacementNote: LOCAL_GROUP_MAP_PLACEMENT_NOTE,
      symbolRotation: anchor?.symbolRotation,
    },
    relations: record.hostObjectId ? [{ type: "part-of", targetId: record.hostObjectId, label: `Associated with ${hostName ?? "host"}` }] : undefined,
    importance,
    time: {
      behavior: "static",
      model: "lvdb-v1.1.1-catalogue-position",
      note: "Catalog positions are static in this view; proper motions are reported where available but are not propagated.",
    },
  };
};

export const LOCAL_GROUP_GALAXIES = generatedCatalog.records.map(toGalaxyObject);
export const LOCAL_GROUP_CATALOG_METADATA = generatedCatalog;
