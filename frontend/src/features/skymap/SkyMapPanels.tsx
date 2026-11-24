import { useEffect, useMemo, useRef, useState, type CSSProperties, type FC, type KeyboardEvent } from "react";
import { SKY_COORDINATE_FRAMES } from "./core/coordinates";
import {
  hasActiveSkyMapFilters,
  type SkyMapDistanceFilter,
  type SkyMapFilterState,
  type SkyMapObjectFamilyFilter,
  type SkyMapSourceFilter,
} from "./core/filters";
import type { SkyLayerDefinition, SkyLayerId, SkyLayerState, SkyLayerStatus } from "./core/layers";
import {
  formatSkyMapNavigationIntent,
  formatSkyMapNavigationMode,
  getSkyMapScaleBandDefinition,
  SKYMAP_SCALE_BANDS,
  type SkyMapNavigationState,
  type SkyMapScaleBandId,
} from "./core/navigation";
import type { SkyObjectRegistryRecord, SkyObjectSearchResult } from "./core/objectRegistry";
import type { DeepSkyImageryReference, SkyObject, SkyObjectId } from "./core/objects";
import {
  isAnnotationSkyObject,
  isDeepSkyObject,
  isCosmologicalFeatureSkyObject,
  isExoplanetSystemSkyObject,
  isGalacticFeatureSkyObject,
  isMoonSkyObject,
  isPlanetSkyObject,
  isStarSkyObject,
} from "./core/objects";
import type { SkyMapViewportStatus } from "./core/state";
import {
  getSkyMapDate,
  getSkyMapDateKey,
  SKYMAP_TIME_MAX_DATE_KEY,
  SKYMAP_TIME_MIN_DATE_KEY,
  SKYMAP_TIME_SPEED_OPTIONS,
  type SkyMapTimeState,
} from "./core/time";
import { fetchImage, type ImageResult } from "../../utils/api";
import SelectMenu, { type SelectMenuOption } from "../../components/ui/SelectMenu";
import StatusChip from "../../components/ui/StatusChip";
import type { UserSkyAnnotation } from "./layers/annotationsLayer";
import type { SpaceImage } from "../../models/SpaceImage";
import { buildMetadataQuality } from "../../utils/metadataQuality";
import type { NearbyStarPropagationState } from "../starmap/nearbyStarCatalogStore";
import TimeDirectionControl from "../time/TimeDirectionControl";
import type { TimeDirection } from "../time/timePlayback";

type DeepSkyMapObject = Extract<SkyObject, { kind: "galaxy" | "nebula" | "star-cluster" }>;

interface SkyMapTopBarProps {
  onOpenSolarExplorer: () => void;
  presentationMode: boolean;
  onStartTour: () => void;
  onTogglePresentation: () => void;
}

export interface SkyMapLayerPanelItem {
  definition: SkyLayerDefinition;
  state: SkyLayerState;
  objectCount: number;
  totalObjectCount: number;
  hiddenObjectCount: number;
  density: number;
}

export interface SkyMapRouteStep {
  objectId: SkyObjectId;
  name: string;
  kind: string;
  layerLabel: string;
  selectedAt: string;
  intent: string;
}

export interface SkyMapRelatedRecord {
  record: SkyObjectRegistryRecord;
  label: string;
  reason: string;
}

interface SkyMapControlRailProps {
  selectedObject: SkyObject | null;
  hoveredObject: SkyObject | null;
  viewportStatus: SkyMapViewportStatus;
  layers: SkyMapLayerPanelItem[];
  routeTrail: SkyMapRouteStep[];
  searchQuery: string;
  searchResults: SkyObjectSearchResult[];
  registryObjectCount: number;
  discoveryRecords: SkyObjectRegistryRecord[];
  relatedRecords: SkyMapRelatedRecord[];
  annotations: UserSkyAnnotation[];
  filters: SkyMapFilterState;
  timeState: SkyMapTimeState;
  stellarPropagation: NearbyStarPropagationState;
  navigationState: SkyMapNavigationState;
  layerPresetSummary: string | null;
  onSetLayerVisibility: (layerId: SkyLayerId, visible: boolean) => void;
  onSoloLayer: (layerId: SkyLayerId) => void;
  onShowAllActiveLayers: () => void;
  onSaveLayerPreset: () => void;
  onApplyLayerPreset: () => void;
  onClearLayerPreset: () => void;
  onFocusObject: (objectId: SkyObjectId) => void;
  onSelectRouteStep: (step: SkyMapRouteStep) => void;
  onClearRouteTrail: () => void;
  onSearchQueryChange: (query: string) => void;
  onSelectSearchResult: (result: SkyObjectSearchResult) => void;
  onSelectDiscoveryRecord: (record: SkyObjectRegistryRecord) => void;
  onAddAnnotation: (draft: { label: string; body: string }) => void;
  onSelectAnnotation: (annotationId: string) => void;
  onDeleteAnnotation: (annotationId: string) => void;
  onOpenSolarObject: (object: SkyObject) => void;
  onOpenImagery: (image: SpaceImage) => void;
  onFilterChange: (filters: Partial<SkyMapFilterState>) => void;
  onResetFilters: () => void;
  onResetNavigationView: () => void;
  onToggleTimePlayback: () => void;
  onSetTimeSpeed: (speedDaysPerSecond: number) => void;
  onSetTimeDirection: (direction: TimeDirection) => void;
  onSetTimeDate: (dateKey: string) => void;
  onStepTime: (days: number) => void;
  onResetTimeToNow: () => void;
}

const layerStatusCopy: Record<SkyLayerStatus, string> = {
  active: "Active",
  staged: "Staged",
  planned: "Planned",
};

const buildSkyMapImageryImage = (
  object: DeepSkyMapObject,
  imagery: DeepSkyImageryReference,
  resolvedImage?: ImageResult | null,
): SpaceImage => {
  const imageUrl = resolvedImage?.imageUrl || imagery.previewUrl || imagery.fullResUrl || "";
  const fullRes = resolvedImage?.fullRes || imagery.fullResUrl;
  const archiveId = imagery.targetId ?? `${object.id}:imagery`;
  const sourceUrl = imagery.targetId
    ? `https://images.nasa.gov/details/${encodeURIComponent(imagery.targetId)}`
    : imagery.fullResUrl;
  const description = [
    object.scientific?.discoveryBlurb,
    object.scientific?.observationContext,
    `Selected from SkyMap's ${object.name} object details.`,
  ]
    .filter(Boolean)
    .join(" ");
  const keywords = [
    object.name,
    object.kind,
    object.scientific?.objectClass,
    object.scientific?.constellation,
    ...(object.scientific?.catalogIds ?? []),
    ...(object.search?.aliases ?? []),
    ...(object.search?.tags ?? []),
    ...(object.search?.keywords ?? []),
  ].filter((item): item is string => Boolean(item));

  const image: SpaceImage = {
    id: `skymap-${archiveId}`,
    nasaId: imagery.targetId,
    source: "skymap",
    archiveId,
    sourceUrl,
    matchReason: `Opened from SkyMap object ${object.name}; imagery reference: ${imagery.label}.`,
    title: `${object.name} - ${imagery.label}`,
    description,
    keywords,
    date: "Unknown",
    center: imagery.credit ?? imagery.source,
    mission: imagery.source,
    instrument: object.scientific?.objectClass,
    imageUrl,
    thumbnailUrl: imageUrl,
    fullRes,
    archiveUrl: sourceUrl,
    raw: {
      skyObjectId: object.id,
      objectName: object.name,
      imagery,
      resolvedImage,
      provenance: object.provenance,
      scientific: object.scientific,
    },
  };

  return {
    ...image,
    metadataQuality: buildMetadataQuality(image),
  };
};

const familyFilterOptions: Array<SelectMenuOption<SkyMapObjectFamilyFilter>> = [
  { value: "all", label: "All objects" },
  { value: "stars", label: "Stars" },
  { value: "exoplanets", label: "Exoplanet systems" },
  { value: "solar", label: "Solar system" },
  { value: "galactic", label: "Milky Way structure" },
  { value: "cosmological", label: "Cosmological model" },
  { value: "galaxies", label: "Galaxies" },
  { value: "nebulae", label: "Nebulae" },
  { value: "clusters", label: "Clusters" },
];

const distanceFilterOptions: Array<SelectMenuOption<SkyMapDistanceFilter>> = [
  { value: "all", label: "Any distance" },
  { value: "local", label: "Local / near sky" },
  { value: "milky-way", label: "Milky Way" },
  { value: "extragalactic", label: "Extragalactic" },
];

const sourceFilterOptions: Array<SelectMenuOption<SkyMapSourceFilter>> = [
  { value: "all", label: "All sources" },
  { value: "local-stars", label: "Nearby stars" },
  { value: "nasa-exoplanet-archive", label: "NASA Exoplanet Archive" },
  { value: "solar-bridge", label: "Solar bridge" },
  { value: "galactic-model", label: "Galactic structure model" },
  { value: "cosmology-model", label: "Cosmology / survey" },
  { value: "local-volume-db", label: "Local Volume Database" },
  { value: "messier-ngc", label: "OpenNGC / Messier" },
];

const timeSpeedOptions: Array<SelectMenuOption<string>> = SKYMAP_TIME_SPEED_OPTIONS.map((option) => ({
  value: String(option.value),
  label: option.label,
}));

const SKYMAP_DISCOVERY_CATEGORIES = [
  { label: "News", description: "Roman begins its journey to L2", kinds: ["spacecraft"], tone: "news" },
  { label: "Featured", description: "Hand-picked celestial wonders", kinds: [] as string[], tone: "featured" },
  { label: "Solar System", description: "Our home in space", kinds: ["planet", "moon"], tone: "solar" },
  { label: "Galaxies", description: "Billions of star systems", kinds: ["galaxy"], tone: "galaxy" },
  { label: "Nebulae", description: "Cosmic clouds of gas and dust", kinds: ["nebula"], tone: "nebula" },
  { label: "Asteroids", description: "Small rocky bodies", kinds: ["asteroid"], tone: "asteroid" },
  { label: "Exoplanets", description: "Worlds beyond our system", kinds: ["exoplanet-system"], tone: "exoplanet" },
  { label: "Spacecraft", description: "Human-made explorers", kinds: ["spacecraft"], tone: "spacecraft" },
];

const SOLAR_DISCOVERY_ORDER = [
  "solar:sun",
  "solar:planet:mercury",
  "solar:planet:venus",
  "solar:planet:earth",
  "solar:moon:moon",
  "solar:planet:mars",
  "solar:planet:jupiter",
  "solar:planet:saturn",
  "solar:planet:uranus",
  "solar:planet:neptune",
  "solar:planet:pluto",
];

const getDiscoveryRecordDescription = (record: SkyObjectRegistryRecord) => {
  const { object } = record;
  if (object.id === "solar:sun") return "Our star";
  if (object.id === "solar:planet:mercury") return "Smallest and innermost planet";
  if (object.id === "solar:planet:venus") return "Earth's scorched greenhouse twin";
  if (object.id === "solar:planet:earth") return "The only known world with life";
  if (object.id === "solar:moon:moon") return "Earth's only natural satellite";
  if (object.id === "solar:planet:mars") return "The cold red desert world";
  if (object.id === "solar:planet:jupiter") return "Largest planet in the Solar System";
  if (object.id === "solar:planet:saturn") return "The ringed gas giant";
  if (object.id === "solar:planet:uranus") return "The sideways ice giant";
  if (object.id === "solar:planet:neptune") return "Ice giant with the fastest winds";
  if (object.id === "solar:planet:pluto") return "Best-known dwarf planet";
  return object.search?.description ?? getObjectSummary(object);
};

const scaleBandOrder: SkyMapScaleBandId[] = ["solar-context", "stellar-neighborhood", "wide-field"];
const SKYMAP_RULER_MAX_DISTANCE = 260;
const SKYMAP_RULER_TICKS = [
  { value: 0, label: "Origin" },
  { value: SKYMAP_SCALE_BANDS["solar-context"].distanceRange[1], label: "Solar" },
  { value: SKYMAP_SCALE_BANDS["stellar-neighborhood"].distanceRange[1], label: "Local" },
  { value: SKYMAP_RULER_MAX_DISTANCE, label: "Deep" },
];

const formatObjectKind = (kind: string) => kind.replace(/-/g, " ");

const formatTimeBehavior = (behavior: string) => behavior.replace(/-/g, " ");

const formatConfidenceLabel = (confidence: string | undefined) =>
  confidence ? confidence.charAt(0).toUpperCase() + confidence.slice(1) : undefined;

const formatObjectClass = (value: string | undefined, fallback: string) =>
  value ? value.replace(/-/g, " ") : fallback;

const formatModelName = (value: string | undefined) => (value ? value.replace(/-/g, " ") : "Unspecified");

const formatDisplayDate = (date: Date) =>
  new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);

const formatSceneUnits = (value: number) => {
  if (!Number.isFinite(value)) return "calibrating";
  if (value >= 100) return `${Math.round(value)}u`;
  return `${value.toFixed(1)}u`;
};

const formatScaleRange = ([min, max]: [number, number]) =>
  Number.isFinite(max) ? `${formatSceneUnits(min)}-${formatSceneUnits(max)}` : `${formatSceneUnits(min)}+`;

const getScaleInterpretation = (scaleBand: SkyMapScaleBandId) => {
  switch (scaleBand) {
    case "solar-context":
      return "Ephemeris bridge";
    case "stellar-neighborhood":
      return "Nearby-star staging";
    case "wide-field":
      return "Physical Local Group directions + explicit scale-boundary models";
  }
};

const clampRulerProgress = (cameraDistance: number) =>
  Math.max(0, Math.min(100, (cameraDistance / SKYMAP_RULER_MAX_DISTANCE) * 100));

const formatNumber = (value: number, maximumFractionDigits = 2) =>
  value.toLocaleString(undefined, { maximumFractionDigits });

const formatOptionalNumber = (
  value: number | undefined,
  suffix: string,
  maximumFractionDigits = 2,
  fallback = "Unknown",
) => (typeof value === "number" ? `${formatNumber(value, maximumFractionDigits)} ${suffix}` : fallback);

const formatLightYears = (value: number | undefined) => {
  if (typeof value !== "number") return "Unknown";
  if (value >= 1_000_000) return `${formatNumber(value / 1_000_000, 2)} Mly`;
  if (value >= 1_000) return `${formatNumber(value / 1_000, 1)} kly`;
  return `${formatNumber(value, 0)} ly`;
};

const formatParsecUncertainty = (value: number) =>
  formatNumber(Math.abs(value), Math.abs(value) < 0.01 ? 5 : 3);

const ASTRONOMICAL_UNITS_PER_LIGHT_YEAR = 63_241.07708426628;
const KILOMETRES_PER_ASTRONOMICAL_UNIT = 149_597_870.7;

const formatCovarianceLength = (valueLy: number) => {
  if (valueLy >= 0.01) return `${formatNumber(valueLy, 4)} ly`;
  const valueAu = valueLy * ASTRONOMICAL_UNITS_PER_LIGHT_YEAR;
  if (valueAu >= 0.01) return `${formatNumber(valueAu, 3)} AU`;
  return `${formatNumber(valueAu * KILOMETRES_PER_ASTRONOMICAL_UNIT, 0)} km`;
};

const formatKpcWithUncertainty = (value: number, minus?: number, plus?: number) => {
  const base = formatNumber(value, value < 100 ? 2 : 1);
  if (typeof minus !== "number" && typeof plus !== "number") return `${base} kpc`;
  if (minus === plus && typeof minus === "number") return `${base} ± ${formatNumber(minus, 2)} kpc`;
  return `${base} −${formatNumber(minus ?? 0, 2)} / +${formatNumber(plus ?? 0, 2)} kpc`;
};

const formatLayerStatus = (result: SkyObjectSearchResult) =>
  result.record.layerVisible ? result.record.layerLabel : `${result.record.layerLabel} hidden`;

const formatRouteStepTime = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

const isSolarBridgeObject = (object: SkyObject | null | undefined) =>
  Boolean(object?.id === "solar:sun" || object?.id.startsWith("solar:planet:") || object?.id.startsWith("solar:moon:"));

const formatFrameLabel = (object: SkyObject | null) => {
  if (!object) return "None";
  return SKY_COORDINATE_FRAMES[object.position.frame]?.label ?? object.position.frame;
};

const formatSourceLabel = (object: SkyObject) => {
  const source = object.provenance.at(0);
  if (!source) return "Unknown";
  return [source.catalog ?? source.source, formatConfidenceLabel(source.confidence)].filter(Boolean).join(" · ");
};

const getObjectCatalogIds = (object: SkyObject) => {
  const ids = isDeepSkyObject(object) ? (object.scientific?.catalogIds ?? []) : [];
  const sourceIds = object.provenance.map((source) => source.sourceId).filter((id): id is string => Boolean(id));
  return Array.from(new Set([...ids, ...sourceIds]));
};

const getObjectAliases = (object: SkyObject) => Array.from(new Set(object.search?.aliases ?? []));

const getObjectApproximationNote = (object: SkyObject) => {
  if (isPlanetSkyObject(object) || isMoonSkyObject(object)) {
    return object.scientific?.approximation ?? object.time?.note;
  }
  if (isDeepSkyObject(object)) {
    return object.scientific?.mapPlacementNote ?? object.time?.note;
  }
  if (isExoplanetSystemSkyObject(object)) {
    return object.scientific.mapPlacementNote;
  }
  if (isGalacticFeatureSkyObject(object)) {
    return object.scientific.mapPlacementNote;
  }
  if (isCosmologicalFeatureSkyObject(object)) {
    return object.scientific.mapPlacementNote;
  }
  return object.time?.note;
};

const formatProvenanceSource = (object: SkyObject) =>
  object.provenance.map((source) =>
    [source.catalog ?? source.source, source.sourceId, formatConfidenceLabel(source.confidence)].filter(Boolean).join(" · "),
  );

const getObjectSummary = (object: SkyObject) => {
  if (isAnnotationSkyObject(object)) {
    return object.scientific?.body ?? "User map note anchored in the staged SkyMap scene.";
  }
  if (isDeepSkyObject(object)) {
    return (
      object.scientific?.discoveryBlurb ??
      object.scientific?.facts?.[0] ??
      object.search?.description ??
      "Deep-space landmark rendered as a symbolic staged map object."
    );
  }
  if (isExoplanetSystemSkyObject(object)) {
    return object.search?.description ?? `${object.scientific.planetCount} confirmed planets around ${object.scientific.hostName}.`;
  }
  if (isGalacticFeatureSkyObject(object)) {
    return object.search?.description ?? "Milky Way structural visualization with explicit schematic status.";
  }
  if (isCosmologicalFeatureSkyObject(object)) {
    return object.search?.description ?? "Measured redshift-survey visualization with explicit selection and cosmology boundaries.";
  }
  if (isPlanetSkyObject(object) || isMoonSkyObject(object)) {
    return (
      object.scientific?.facts?.[0] ??
      object.search?.description ??
      "Solar-system bridge object driven by the shared SkyMap and Solar Explorer object model."
    );
  }
  if (isStarSkyObject(object)) {
    return object.search?.description ?? "Nearby star from the local stellar-neighborhood layer.";
  }
  return object.search?.description ?? "Indexed SkyMap object available for search, focus, and route jumps.";
};

const getObjectPrimaryIdentifier = (object: SkyObject) => {
  const catalogIds = getObjectCatalogIds(object);
  if (catalogIds.length) return catalogIds.slice(0, 2).join(" / ");
  const aliases = getObjectAliases(object);
  if (aliases.length) return aliases[0];
  return object.provenance.find((source) => source.sourceId)?.sourceId ?? formatObjectKind(object.kind);
};

const getObjectDistanceContext = (object: SkyObject) => {
  if (isDeepSkyObject(object)) {
    return typeof object.scientific?.distanceLy === "number" ? formatLightYears(object.scientific.distanceLy) : "Not supplied · angular catalogue";
  }
  if (isExoplanetSystemSkyObject(object)) return `${formatNumber(object.scientific.distancePc, 2)} pc · ${formatLightYears(object.scientific.distanceLy)}`;
  if (isGalacticFeatureSkyObject(object)) {
    return typeof object.scientific.galactocentricRadiusKpc === "number"
      ? `${formatNumber(object.scientific.galactocentricRadiusKpc, 3)} kpc from centre`
      : `${formatNumber(object.scientific.modelRadiusKpc ?? 0, 1)} kpc model radius`;
  }
  if (isCosmologicalFeatureSkyObject(object)) {
    return object.scientific.redshiftRange
      ? `z ${object.scientific.redshiftRange.minimum.toFixed(1)}–${object.scientific.redshiftRange.maximum.toFixed(1)}`
      : "Normalized comoving volume";
  }
  if (isStarSkyObject(object)) return formatLightYears(object.scientific?.distanceLy);
  if (object.kind === "spacecraft") return formatOptionalNumber(object.scientific?.distanceFromSunAu, "AU from Sun", 2, "Heliocentric vector");
  if (isPlanetSkyObject(object)) return formatOptionalNumber(object.scientific?.semiMajorAxisAU, "AU", 2, "Solar orbit");
  if (isMoonSkyObject(object)) return formatOptionalNumber(object.scientific?.orbitalDistanceKm, "km", 0, "Parent orbit");
  if (isAnnotationSkyObject(object)) return object.scientific?.targetName ?? "SkyMap position";
  return formatFrameLabel(object);
};

const getObjectScaleContext = (object: SkyObject) => {
  if (isSolarBridgeObject(object)) return "Ephemeris bridge";
  if (isDeepSkyObject(object) && object.position.frame === "supergalactic-cartesian") return "Physical direction · log radius";
  if (isDeepSkyObject(object) && object.position.frame === "equatorial-j2000") return "Measured J2000 direction · angular shell";
  if (isDeepSkyObject(object)) return "Symbolic placement";
  if (isGalacticFeatureSkyObject(object)) {
    return object.scientific.modelStatus === "catalog-derived" ? "Measured catalogue · fitted structure" : "Scientific schematic";
  }
  if (isCosmologicalFeatureSkyObject(object)) {
    return object.scientific.modelStatus === "catalog-derived" ? "Measured redshift catalogue" : "Scientific schematic";
  }
  if (isStarSkyObject(object)) return "Nearby-star staging";
  if (object.kind === "spacecraft") return "Epoch JPL heliocentric vector";
  if (isExoplanetSystemSkyObject(object)) return "Physical host position · unresolved planetary system";
  if (isAnnotationSkyObject(object)) return "Anchored note";
  return "Staged map object";
};

const getObjectNotabilityLabel = (object: SkyObject) =>
  object.importance ? `${object.importance.tier} · ${Math.round(object.importance.score)}` : "Reference object";

const formatPosition = (object: SkyObject) => {
  const { position } = object;
  if (position.mode === "cartesian") {
    return `${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)} ${position.unit}`;
  }
  if (position.mode === "spherical") {
    const distance =
      typeof position.distance === "number" && position.distanceUnit
        ? ` · ${position.distance.toFixed(2)} ${position.distanceUnit}`
        : "";
    return `${position.longitude.toFixed(2)}, ${position.latitude.toFixed(2)} ${position.angularUnit}${distance}`;
  }
  return `${position.x.toFixed(2)}, ${position.y.toFixed(2)} ${position.unit}`;
};

const SearchResultName: FC<{ name: string; query: string }> = ({ name, query }) => {
  const trimmed = query.trim();
  const match = useMemo(() => {
    if (!trimmed) return null;
    const lowerName = name.toLowerCase();
    const lowerQuery = trimmed.toLowerCase();
    const index = lowerName.indexOf(lowerQuery);
    return index >= 0 ? { index, end: index + trimmed.length } : null;
  }, [name, trimmed]);

  if (!match) return <>{name}</>;
  return (
    <>
      {name.slice(0, match.index)}
      <mark>{name.slice(match.index, match.end)}</mark>
      {name.slice(match.end)}
    </>
  );
};

const formatSearchResultMeta = (result: SkyObjectSearchResult) => {
  const { object } = result.record;
  if (isAnnotationSkyObject(object)) {
    return object.scientific?.targetName
      ? `note for ${object.scientific.targetName}`
      : object.scientific?.body ?? "user annotation";
  }
  if (isStarSkyObject(object) && typeof object.scientific.distanceLy === "number") {
    return `${object.scientific.distanceLy.toFixed(2)} ly | ${object.scientific.spectralType ?? "star"}`;
  }
  if (isPlanetSkyObject(object) && typeof object.scientific?.semiMajorAxisAU === "number") {
    return `${object.scientific.semiMajorAxisAU.toFixed(2)} AU | planet`;
  }
  if (isExoplanetSystemSkyObject(object)) {
    return `${object.scientific.distancePc.toFixed(2)} pc | ${object.scientific.planetCount} confirmed planet${object.scientific.planetCount === 1 ? "" : "s"}`;
  }
  if (isMoonSkyObject(object)) {
    return object.scientific?.parentPlanetName
      ? `orbits ${object.scientific.parentPlanetName}`
      : "moon";
  }
  if (isDeepSkyObject(object)) {
    return `${formatLightYears(object.scientific?.distanceLy)} | ${formatObjectClass(
      object.scientific?.objectClass,
      formatObjectKind(object.kind),
    )}`;
  }
  if (isGalacticFeatureSkyObject(object)) {
    return `${object.scientific.featureClass.replace(/-/g, " ")} | ${object.scientific.modelStatus.replace(/-/g, " ")}`;
  }
  if (isCosmologicalFeatureSkyObject(object)) {
    return `${object.scientific.featureClass.replace(/-/g, " ")} | ${object.scientific.modelStatus.replace(/-/g, " ")}`;
  }
  return formatObjectKind(object.kind);
};

const SkyMapAnnotationsPanel: FC<{
  selectedObject: SkyObject | null;
  annotations: UserSkyAnnotation[];
  onAddAnnotation: (draft: { label: string; body: string }) => void;
  onSelectAnnotation: (annotationId: string) => void;
  onDeleteAnnotation: (annotationId: string) => void;
}> = ({ selectedObject, annotations, onAddAnnotation, onSelectAnnotation, onDeleteAnnotation }) => {
  const [label, setLabel] = useState("");
  const [body, setBody] = useState("");
  const canAnnotate = Boolean(selectedObject && !isAnnotationSkyObject(selectedObject));
  const anchorName = canAnnotate ? selectedObject?.name : null;
  const selectedAnnotationId =
    selectedObject && isAnnotationSkyObject(selectedObject) ? selectedObject.id.replace("annotation:", "") : null;
  const selectedAnnotation = selectedAnnotationId
    ? annotations.find((annotation) => annotation.id === selectedAnnotationId) ?? null
    : null;
  const targetNoteCount =
    selectedObject && !isAnnotationSkyObject(selectedObject)
      ? annotations.filter((annotation) => annotation.targetObjectId === selectedObject.id).length
      : 0;
  const latestAnnotation = annotations[0] ?? null;
  const annotationAnchorLabel =
    anchorName ?? selectedAnnotation?.targetName ?? latestAnnotation?.targetName ?? "Select object";

  useEffect(() => {
    setLabel(anchorName ? `Note: ${anchorName}` : "");
  }, [anchorName]);

  const handleSubmit = () => {
    if (!canAnnotate) return;
    onAddAnnotation({ label, body });
    setLabel(anchorName ? `Note: ${anchorName}` : "");
    setBody("");
  };

  return (
    <section className="skymap-panel skymap-panel--annotations">
      <div>
        <p className="eyebrow">ANNOTATIONS</p>
        <h2>Map notes</h2>
      </div>
      <div className="skymap-annotation-summary" aria-label="Annotation workspace state">
        <div>
          <span>Anchor</span>
          <strong>{annotationAnchorLabel}</strong>
        </div>
        <div>
          <span>Saved notes</span>
          <strong>{annotations.length}</strong>
        </div>
        <div>
          <span>Selected target</span>
          <strong>
            {selectedAnnotation
              ? "Saved note"
              : canAnnotate
                ? targetNoteCount
                  ? `${targetNoteCount} on target`
                  : "Ready"
                : "None"}
          </strong>
        </div>
      </div>
      <form
        className="skymap-annotation-form"
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmit();
        }}
      >
        <p className="skymap-note">
          {canAnnotate
            ? `Anchor a local note to ${anchorName}.`
            : "Select a visible map object to add an anchored note."}
        </p>
        <label>
          <span>Label</span>
          <input
            value={label}
            disabled={!canAnnotate}
            onChange={(event) => setLabel(event.currentTarget.value)}
            placeholder="Short note label"
          />
        </label>
        <label>
          <span>Note</span>
          <textarea
            value={body}
            disabled={!canAnnotate}
            onChange={(event) => setBody(event.currentTarget.value)}
            placeholder="Why this object matters in your map..."
            rows={3}
          />
        </label>
        <button type="submit" className="ghost button--small" disabled={!canAnnotate}>
          Add note
        </button>
      </form>
      {annotations.length ? (
        <div className="skymap-annotation-list">
          {annotations.map((annotation) => (
            <div
              key={annotation.id}
              className={`skymap-annotation-row ${annotation.id === selectedAnnotationId ? "is-active" : ""}`}
            >
              <button
                type="button"
                onClick={() => onSelectAnnotation(annotation.id)}
                aria-current={annotation.id === selectedAnnotationId ? "true" : undefined}
              >
                <strong>{annotation.label}</strong>
                <span>{annotation.targetName ?? "SkyMap note"} · {annotation.timeKey}</span>
                <small>{annotation.body}</small>
              </button>
              <button
                type="button"
                className="ghost button--small"
                onClick={() => onDeleteAnnotation(annotation.id)}
                aria-label={`Delete ${annotation.label}`}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="skymap-empty">No saved map notes yet.</p>
      )}
    </section>
  );
};

const SkyMapSearchPanel: FC<{
  query: string;
  results: SkyObjectSearchResult[];
  registryObjectCount: number;
  onQueryChange: (query: string) => void;
  onSelectResult: (result: SkyObjectSearchResult) => void;
}> = ({ query, results, registryObjectCount, onQueryChange, onSelectResult }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const trimmedQuery = query.trim();
  const hasQuery = trimmedQuery.length > 0;
  const showResults = isOpen && hasQuery;

  useEffect(() => {
    setActiveIndex(0);
  }, [query, results.length]);

  const selectResult = (result: SkyObjectSearchResult) => {
    onSelectResult(result);
    setIsOpen(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setIsOpen(false);
      return;
    }

    if (!results.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((index) => (index + 1) % results.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((index) => (index - 1 + results.length) % results.length);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      selectResult(results[activeIndex] ?? results[0]);
    }
  };

  return (
    <section className="skymap-panel skymap-panel--search">
      <div>
        <p className="eyebrow">SEARCH</p>
        <h2>Object index</h2>
      </div>
      <label className="skymap-search" htmlFor="skymap-search">
        <span>Object search</span>
        <input
          id="skymap-search"
          type="search"
          value={query}
          placeholder="Search for a star, planet..."
          autoComplete="off"
          aria-controls="skymap-search-results"
          aria-expanded={showResults}
          onChange={(event) => {
            onQueryChange(event.currentTarget.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
        />
      </label>
      {showResults ? (
        <div className="skymap-search-results" id="skymap-search-results" role="listbox">
          {results.length ? (
            results.map((result, index) => {
              const object = result.record.object;
              const active = index === activeIndex;
              return (
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  key={object.id}
                  className={`skymap-search-result ${active ? "is-active" : ""}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectResult(result)}
                >
                  <span className="skymap-search-result__main">
                    <strong>
                      <SearchResultName name={object.name} query={query} />
                    </strong>
                    <small>{formatSearchResultMeta(result)}</small>
                  </span>
                  <span className="skymap-search-result__badges">
                    <em>{formatObjectKind(object.kind)}</em>
                    <em className={result.record.layerVisible ? "" : "is-hidden-layer"}>{formatLayerStatus(result)}</em>
                  </span>
                </button>
              );
            })
          ) : (
            <p className="skymap-search-empty">No indexed objects match "{trimmedQuery}".</p>
          )}
        </div>
      ) : (
        <p className="skymap-note">
          Search {registryObjectCount} indexed objects by name, alias, source, or metadata.
        </p>
      )}
    </section>
  );
};

const SkyMapDiscoveryPanel: FC<{
  records: SkyObjectRegistryRecord[];
  onSelectRecord: (record: SkyObjectRegistryRecord) => void;
  onClose: () => void;
}> = ({ records, onSelectRecord, onClose }) => {
  const [activeCategoryLabel, setActiveCategoryLabel] = useState<string | null>(null);
  const cards = SKYMAP_DISCOVERY_CATEGORIES.flatMap((category, index) => {
    const record = category.kinds.length
      ? records.find((candidate) => category.kinds.includes(candidate.object.kind))
      : records[0];
    const fallback = records[index % Math.max(records.length, 1)];
    const target = record ?? fallback;
    return target ? [{ ...category, record: target }] : [];
  });
  const activeCategory = SKYMAP_DISCOVERY_CATEGORIES.find((category) => category.label === activeCategoryLabel) ?? null;
  const activeRecords = useMemo(() => {
    if (!activeCategory) return [];
    const filtered = activeCategory.label === "Solar System"
      ? records.filter((record) => record.object.id.startsWith("solar:"))
      : activeCategory.kinds.length
        ? records.filter((record) => activeCategory.kinds.includes(record.object.kind))
        : records;
    const unique = Array.from(new Map(filtered.map((record) => [record.object.id, record])).values());
    if (activeCategory.label === "Solar System") {
      unique.sort((left, right) => {
        const leftIndex = SOLAR_DISCOVERY_ORDER.indexOf(left.object.id);
        const rightIndex = SOLAR_DISCOVERY_ORDER.indexOf(right.object.id);
        return (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex) - (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex);
      });
    }
    return unique.slice(0, 18);
  }, [activeCategory, records]);

  return (
    <section className="skymap-panel skymap-panel--discovery skymap-panel--launch">
      <div className="skymap-launch__header">
        <div>
          <h2>Explore the Universe</h2>
        </div>
        <button type="button" className="skymap-launch__close" onClick={onClose} aria-label="Close universe explorer">×</button>
      </div>
      <p className="skymap-launch__intro">Search and discover celestial objects</p>
      <div className="skymap-launch__browser">
        {activeCategory ? (
          <>
            <div className="skymap-launch__category-head">
              <button type="button" onClick={() => setActiveCategoryLabel(null)}>‹ Categories</button>
              <strong>{activeCategory.label}</strong>
              <button
                type="button"
                className="skymap-launch__tour"
                onClick={() => activeRecords[0] && onSelectRecord(activeRecords[0])}
                disabled={!activeRecords.length}
              >
                Start the tour <span aria-hidden="true">›</span>
              </button>
            </div>
            <div className="skymap-launch__grid skymap-launch__grid--objects">
              {activeRecords.map((record) => (
                <button
                  type="button"
                  key={record.object.id}
                  className="skymap-launch-card"
                  data-tone={activeCategory.tone}
                  onClick={() => onSelectRecord(record)}
                >
                  <span className="skymap-launch-card__art" aria-hidden="true"><i /></span>
                  <span className="skymap-launch-card__copy">
                    <strong>{record.object.name}</strong>
                    <small>{getDiscoveryRecordDescription(record)}</small>
                  </span>
                  <span className="skymap-launch-card__chevron" aria-hidden="true">›</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <p>Browse categories</p>
            <div className="skymap-launch__grid">
              {cards.map(({ label, description, tone }) => (
                <button
                  type="button"
                  key={label}
                  className="skymap-launch-card"
                  data-tone={tone}
                  onClick={() => setActiveCategoryLabel(label)}
                >
                  <span className="skymap-launch-card__art" aria-hidden="true"><i /></span>
                  <span className="skymap-launch-card__copy">
                    <strong>{label}</strong>
                    <small>{description}</small>
                  </span>
                  <span className="skymap-launch-card__chevron" aria-hidden="true">›</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
};

const SkyMapFilterPanel: FC<{
  filters: SkyMapFilterState;
  onFilterChange: (filters: Partial<SkyMapFilterState>) => void;
  onResetFilters: () => void;
}> = ({ filters, onFilterChange, onResetFilters }) => {
  const active = hasActiveSkyMapFilters(filters);

  return (
    <section className="skymap-panel skymap-panel--filters">
      <div>
        <p className="eyebrow">FILTER</p>
        <h2>Shape the map</h2>
      </div>
      <div className="skymap-filter-grid">
        <SelectMenu
          label="Family"
          value={filters.family}
          options={familyFilterOptions}
          onChange={(family) => onFilterChange({ family })}
          className="skymap-filter-field skymap-select"
          labelClassName="skymap-select__label"
          triggerClassName="skymap-select__trigger"
          caretClassName="skymap-select__caret"
          menuClassName="skymap-select__menu"
          itemClassName="skymap-select__item"
        />
        <SelectMenu
          label="Distance"
          value={filters.distance}
          options={distanceFilterOptions}
          onChange={(distance) => onFilterChange({ distance })}
          className="skymap-filter-field skymap-select"
          labelClassName="skymap-select__label"
          triggerClassName="skymap-select__trigger"
          caretClassName="skymap-select__caret"
          menuClassName="skymap-select__menu"
          itemClassName="skymap-select__item"
        />
        <SelectMenu
          label="Source"
          value={filters.source}
          options={sourceFilterOptions}
          onChange={(source) => onFilterChange({ source })}
          className="skymap-filter-field skymap-select"
          labelClassName="skymap-select__label"
          triggerClassName="skymap-select__trigger"
          caretClassName="skymap-select__caret"
          menuClassName="skymap-select__menu"
          itemClassName="skymap-select__item"
        />
      </div>
      <div className="skymap-filter-actions">
        <label className="skymap-filter-toggle">
          <input
            type="checkbox"
            checked={filters.landmarksOnly}
            onChange={(event) => onFilterChange({ landmarksOnly: event.currentTarget.checked })}
          />
          <span>Landmarks only</span>
        </label>
        <button type="button" className="ghost button--small" onClick={onResetFilters} disabled={!active}>
          Clear filters
        </button>
      </div>
      <p className="skymap-note">
        Filters affect visible map objects, search, and discovery. The selected target stays available while focused.
      </p>
    </section>
  );
};

const SkyMapTimePanel: FC<{
  timeState: SkyMapTimeState;
  stellarPropagation: NearbyStarPropagationState;
  onToggleTimePlayback: () => void;
  onSetTimeSpeed: (speedDaysPerSecond: number) => void;
  onSetTimeDirection: (direction: TimeDirection) => void;
  onSetTimeDate: (dateKey: string) => void;
  onStepTime: (days: number) => void;
  onResetTimeToNow: () => void;
}> = ({
  timeState,
  stellarPropagation,
  onToggleTimePlayback,
  onSetTimeSpeed,
  onSetTimeDirection,
  onSetTimeDate,
  onStepTime,
  onResetTimeToNow,
}) => {
  const currentDate = getSkyMapDate(timeState);
  const currentDateKey = getSkyMapDateKey(timeState);

  return (
    <section className="skymap-panel skymap-panel--time">
      <div>
        <p className="eyebrow">SIMULATION TIME</p>
        <h2>{formatDisplayDate(currentDate)}</h2>
      </div>
      <div className="skymap-time-actions">
        <button type="button" className="ghost button--small" onClick={onToggleTimePlayback}>
          {timeState.playback === "playing" ? "Pause" : "Play"}
        </button>
        <button type="button" className="ghost button--small" onClick={() => onStepTime(-30)}>
          -30d
        </button>
        <button type="button" className="ghost button--small" onClick={() => onStepTime(30)}>
          +30d
        </button>
        <button type="button" className="ghost button--small" onClick={onResetTimeToNow}>
          Now
        </button>
      </div>
      <div className="skymap-time-grid">
        <label className="skymap-time-field" htmlFor="skymap-time-date">
          <span>UTC date</span>
          <input
            id="skymap-time-date"
            type="date"
            min={SKYMAP_TIME_MIN_DATE_KEY}
            max={SKYMAP_TIME_MAX_DATE_KEY}
            value={currentDateKey}
            onInput={(event) => onSetTimeDate(event.currentTarget.value)}
            onChange={(event) => onSetTimeDate(event.currentTarget.value)}
            onBlur={(event) => onSetTimeDate(event.currentTarget.value)}
          />
        </label>
        <SelectMenu
          label="Speed"
          value={String(timeState.speedDaysPerSecond)}
          options={timeSpeedOptions}
          onChange={(speedDaysPerSecond) => onSetTimeSpeed(Number(speedDaysPerSecond))}
          className="skymap-time-field skymap-select"
          labelClassName="skymap-select__label"
          triggerClassName="skymap-select__trigger"
          caretClassName="skymap-select__caret"
          menuClassName="skymap-select__menu"
          itemClassName="skymap-select__item"
        />
        <TimeDirectionControl
          direction={timeState.direction}
          onDirectionChange={onSetTimeDirection}
          className="skymap-time-direction"
        />
      </div>
      <div
        className={`skymap-time-propagation is-${stellarPropagation.status}`}
        title={stellarPropagation.error ?? stellarPropagation.message}
      >
        <span>Stellar epoch</span>
        <strong>
          J{stellarPropagation.renderEpochJulianYear.toFixed(2)} · {stellarPropagation.status.replace(/-/g, " ")}
        </strong>
        <small>{stellarPropagation.message}</small>
        {stellarPropagation.radialVelocityRecordCount ? (
          <small>
            3D radial motion: {stellarPropagation.radialVelocityRecordCount.toLocaleString()} measured · {stellarPropagation.radialVelocityFallbackRecordCount.toLocaleString()} zero fallback
          </small>
        ) : null}
      </div>
      <p className="skymap-note">
        Solar bodies use an approximate bridge model. Gaia stars propagate from J2016.0 with uniform rectilinear
        motion in a Worker; published radial velocity is used when present and missing values use a visible zero
        fallback. Deep-space landmarks remain static.
      </p>
    </section>
  );
};

export const SkyMapTopBar: FC<SkyMapTopBarProps> = ({
  onOpenSolarExplorer,
  presentationMode,
  onStartTour,
  onTogglePresentation,
}) => (
  <header className="skymap-topbar">
    <div className="skymap-topbar__copy">
      <p className="eyebrow">UNIVERSE NAVIGATION SURFACE</p>
      <h1 id="skymap-title">SkyMap</h1>
      <p className="subtitle">
        A multi-frame universe map for searchable stars, solar-system bodies, official constellation regions,
        physical Local Group directions, measured DESI large-scale structure, and imagery-backed landmarks. Scale compression and model boundaries stay visible.
      </p>
    </div>
    <div className="skymap-topbar__actions">
      <span className="skymap-pill">Route: /skymap</span>
      <span className="skymap-pill">Staged scale bands</span>
      <span className="skymap-pill skymap-pill--active">Approximate time model</span>
      <button type="button" className="ghost" onClick={onStartTour}>
        Start Tour
      </button>
      <button type="button" className="ghost" onClick={onTogglePresentation}>
        {presentationMode ? "Exit Presentation" : "Presentation Mode"}
      </button>
      <button type="button" className="ghost" onClick={onOpenSolarExplorer}>
        Open Solar Explorer
      </button>
    </div>
  </header>
);

export const SkyMapStatusStrip: FC<{ viewportStatus: SkyMapViewportStatus }> = ({ viewportStatus }) => {
  const activeScale = getSkyMapScaleBandDefinition(viewportStatus.scaleBand);
  const rulerProgress = clampRulerProgress(viewportStatus.cameraDistance);
  const rulerStyle = { "--skymap-scale-progress": `${rulerProgress}%` } as CSSProperties;

  return (
    <div className="skymap-status-strip" aria-label="SkyMap viewport status">
      <ol className="skymap-scale-trail" aria-label="SkyMap scale bands">
        {scaleBandOrder.map((bandId) => {
          const band = SKYMAP_SCALE_BANDS[bandId];
          const active = bandId === viewportStatus.scaleBand;
          const range = formatScaleRange(band.distanceRange);

          return (
            <li key={band.id} className={active ? "is-active" : ""}>
              <span>{band.shortLabel}</span>
              <strong>{range}</strong>
            </li>
          );
        })}
      </ol>
      <div className="skymap-scale-ruler" aria-label="SkyMap staged scale ruler">
        <div className="skymap-scale-ruler__header">
          <span>Staged scale ruler</span>
          <strong>{formatSceneUnits(viewportStatus.cameraDistance)} camera</strong>
        </div>
        <div className="skymap-scale-ruler__track" style={rulerStyle} aria-hidden="true">
          <span className="skymap-scale-ruler__fill" />
          <span className="skymap-scale-ruler__marker" />
        </div>
        <div className="skymap-scale-ruler__ticks" aria-hidden="true">
          {SKYMAP_RULER_TICKS.map((tick) => (
            <span key={`${tick.value}-${tick.label}`}>
              {formatSceneUnits(tick.value)} {tick.label}
            </span>
          ))}
        </div>
        <p>{getScaleInterpretation(viewportStatus.scaleBand)}</p>
      </div>
      <div>
        <span>Object model</span>
        <strong>
          {viewportStatus.objectCount} objects · {viewportStatus.catalogChunkCount} chunks
        </strong>
      </div>
      <div
        title={
          viewportStatus.catalogLoadError
            ? `${viewportStatus.catalogLoadMessage} ${viewportStatus.catalogLoadError}`
            : viewportStatus.catalogLoadMessage
        }
      >
        <span>Catalogue stream</span>
        <strong>
          {viewportStatus.catalogStreamStatus} · {viewportStatus.catalogSchedulingMode}
          {viewportStatus.catalogActiveChunkId ? ` · ${viewportStatus.catalogActiveChunkId}` : ""} ·{" "}
          {viewportStatus.catalogLoadedRecords.toLocaleString()}/
          {viewportStatus.catalogTotalRecords ? viewportStatus.catalogTotalRecords.toLocaleString() : "—"} sources
        </strong>
      </div>
      <div title={viewportStatus.catalogPropagationError ?? viewportStatus.catalogPropagationMessage}>
        <span>Stellar epoch</span>
        <strong>
          J{viewportStatus.catalogRenderEpochJulianYear.toFixed(2)} · {viewportStatus.catalogPropagationStatus}
        </strong>
      </div>
      <div data-ephemeris-status={viewportStatus.solarEphemerisStatus} title={viewportStatus.solarEphemerisMessage}>
        <span>Solar ephemeris</span>
        <strong>
          {viewportStatus.solarEphemerisModel}
          {viewportStatus.solarEphemerisYear ? ` · ${viewportStatus.solarEphemerisYear}` : ""}
        </strong>
      </div>
      <div>
        <span>Renderables</span>
        <strong>
          {viewportStatus.visibleCount} · {viewportStatus.interactionCandidateCount} interactive
        </strong>
      </div>
      <div>
        <span>Navigation</span>
        <strong>
          {activeScale.shortLabel} · {formatSkyMapNavigationMode(viewportStatus.navigationMode)}
        </strong>
      </div>
      <div>
        <span>Map distance</span>
        <strong>{formatSceneUnits(viewportStatus.cameraDistance)} scene units</strong>
      </div>
      <div>
        <span>Detail tier</span>
        <strong>
          {viewportStatus.detailTier} · {viewportStatus.activeChunkCount} active chunks
        </strong>
      </div>
    </div>
  );
};

const SkyMapNavigationPanel: FC<{
  navigationState: SkyMapNavigationState;
  viewportStatus: SkyMapViewportStatus;
  onResetNavigationView: () => void;
}> = ({ navigationState, viewportStatus, onResetNavigationView }) => {
  const scaleBand = getSkyMapScaleBandDefinition(navigationState.scaleBand);

  return (
    <section className="skymap-panel skymap-panel--navigation">
      <div>
        <p className="eyebrow">NAVIGATION</p>
        <h2>{scaleBand.label}</h2>
      </div>
      <div className="skymap-navigation-grid">
        <div>
          <span>Mode</span>
          <strong>{formatSkyMapNavigationMode(navigationState.mode)}</strong>
        </div>
        <div>
          <span>Intent</span>
          <strong>{formatSkyMapNavigationIntent(navigationState.lastIntent)}</strong>
        </div>
        <div>
          <span>Map distance</span>
          <strong>{Math.round(viewportStatus.cameraDistance)} scene units</strong>
        </div>
      </div>
      <div className="skymap-navigation-actions">
        <button type="button" className="ghost button--small" onClick={onResetNavigationView}>
          Reset overview
        </button>
      </div>
      <p className="skymap-note">
        SkyMap uses staged scene-space scale bands. Solar, local-star, and deep-space contexts are explicit map
        contexts, not a claim of continuous physical scale.
      </p>
    </section>
  );
};

const SkyMapRouteTrailPanel: FC<{
  routeTrail: SkyMapRouteStep[];
  selectedObject: SkyObject | null;
  onSelectRouteStep: (step: SkyMapRouteStep) => void;
  onClearRouteTrail: () => void;
}> = ({ routeTrail, selectedObject, onSelectRouteStep, onClearRouteTrail }) => {
  const activeId = selectedObject?.id ?? null;
  const previousStep = routeTrail.find((step) => step.objectId !== activeId) ?? null;

  return (
    <section className="skymap-panel skymap-panel--route">
      <div className="skymap-route__header">
        <div>
          <p className="eyebrow">ROUTE TRAIL</p>
          <h2>{routeTrail.length ? `${routeTrail.length} jumps` : "No route yet"}</h2>
        </div>
        <button type="button" className="ghost button--small" onClick={onClearRouteTrail} disabled={!routeTrail.length}>
          Clear
        </button>
      </div>
      <p className="skymap-note">
        Recent selections stay here so you can move back through a search, tour, or discovery path.
      </p>
      {previousStep ? (
        <button type="button" className="skymap-route__back" onClick={() => onSelectRouteStep(previousStep)}>
          <span>Previous jump</span>
          <strong>{previousStep.name}</strong>
        </button>
      ) : null}
      {routeTrail.length ? (
        <ol className="skymap-route__list">
          {routeTrail.map((step, index) => {
            const active = step.objectId === activeId;
            return (
              <li key={`${step.objectId}-${step.selectedAt}`} className={active ? "is-active" : ""}>
                <button type="button" onClick={() => onSelectRouteStep(step)} aria-current={active ? "step" : undefined}>
                  <span>{index + 1}</span>
                  <strong>{step.name}</strong>
                  <small>
                    {formatObjectKind(step.kind)} · {step.layerLabel} · {formatRouteStepTime(step.selectedAt)}
                  </small>
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="skymap-empty">Search, click, or choose a featured jump to start a route.</p>
      )}
    </section>
  );
};

const SkyMapLayerRow: FC<{
  item: SkyMapLayerPanelItem;
  onSetLayerVisibility: (layerId: SkyLayerId, visible: boolean) => void;
  onSoloLayer: (layerId: SkyLayerId) => void;
}> = ({ item, onSetLayerVisibility, onSoloLayer }) => {
  const { definition, state, objectCount, hiddenObjectCount, density } = item;
  const canToggle = definition.status === "active";
  const status = canToggle ? (state.visible ? "Visible" : "Hidden") : layerStatusCopy[definition.status];
  const timeLabel = formatTimeBehavior(definition.time.behavior);
  const activeObjectCount = canToggle && state.visible ? objectCount : 0;
  const detail = canToggle
    ? `${activeObjectCount} active · ${hiddenObjectCount} hidden · ${timeLabel}`
    : `${definition.description} · ${timeLabel}`;
  const densityScale = Math.max(0.04, Math.min(1, density || 0));

  return (
    <div className={`skymap-layer-row ${state.visible ? "is-active" : ""} ${canToggle ? "" : "is-locked"}`.trim()}>
      <button
        type="button"
        className="skymap-layer-row__toggle"
        disabled={!canToggle}
        aria-pressed={canToggle ? state.visible : undefined}
        onClick={() => onSetLayerVisibility(definition.id, !state.visible)}
      >
        <span>{definition.label}</span>
        <strong>{status}</strong>
        <small>{detail}</small>
        <span className="skymap-layer-row__density" aria-hidden="true">
          <i style={{ transform: `scaleX(${densityScale})` }} />
        </span>
      </button>
      {canToggle ? (
        <button
          type="button"
          className="skymap-layer-row__solo"
          onClick={() => onSoloLayer(definition.id)}
          aria-label={`Show only ${definition.label}`}
        >
          Solo
        </button>
      ) : null}
    </div>
  );
};

const SkyMapImageryPreview: FC<{ object: SkyObject; onOpenImagery: (image: SpaceImage) => void }> = ({
  object,
  onOpenImagery,
}) => {
  const [resolvedImage, setResolvedImage] = useState<ImageResult | null>(null);
  const [loadingAsset, setLoadingAsset] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setResolvedImage(null);
    setLoadingAsset(false);
    setImageFailed(false);
  }, [object.id]);

  if (!isDeepSkyObject(object)) return null;
  const imagery = object.scientific?.imagery?.find((image) => image.previewUrl) ?? object.scientific?.imagery?.at(0);
  if (!imagery?.previewUrl) return null;
  const imageUrl = resolvedImage?.imageUrl || imagery.previewUrl;
  const fullResUrl = resolvedImage?.fullRes || imagery.fullResUrl;
  const showImagePreview = Boolean(imageUrl && !imageFailed);

  const loadNasaAsset = async () => {
    if (!imagery.targetId || loadingAsset) return;
    setLoadingAsset(true);
    const result = await fetchImage(imagery.targetId);
    if (result.success) {
      setResolvedImage(result);
    }
    setLoadingAsset(false);
  };

  return (
    <figure className="skymap-imagery-card">
      {showImagePreview ? (
        <img
          src={imageUrl}
          alt={imagery.alt ?? `${object.name} imagery`}
          loading="eager"
          decoding="async"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className="skymap-imagery-card__fallback" role="img" aria-label={`${object.name} imagery preview unavailable`}>
          <span>Preview unavailable</span>
        </div>
      )}
      <figcaption>
        <strong>{imagery.label}</strong>
        <span>
          {imagery.credit ?? imagery.source}
          {imagery.targetId ? ` · NASA ID ${imagery.targetId}` : ""}
        </span>
        <span className="skymap-imagery-card__actions">
          {imagery.targetId ? (
            <button type="button" className="ghost button--small" onClick={loadNasaAsset} disabled={loadingAsset}>
              {resolvedImage ? "Asset loaded" : loadingAsset ? "Loading asset" : "Load NASA asset"}
            </button>
          ) : null}
          <button
            type="button"
            className="ghost button--small"
            onClick={() => onOpenImagery(buildSkyMapImageryImage(object, imagery, resolvedImage))}
          >
            Open in Viewer
          </button>
          {fullResUrl ? (
            <a href={fullResUrl} target="_blank" rel="noreferrer">
              Open full image
            </a>
          ) : null}
        </span>
      </figcaption>
    </figure>
  );
};

const SkyMapObjectDossier: FC<{
  object: SkyObject;
  selected: boolean;
  onFocusObject: (objectId: SkyObjectId) => void;
  onOpenSolarObject: (object: SkyObject) => void;
}> = ({ object, selected, onFocusObject, onOpenSolarObject }) => {
  const primaryIdentifier = getObjectPrimaryIdentifier(object);
  const sourceLabel = formatSourceLabel(object);
  const actionLabel = selected ? "Selected target" : "Hover preview";

  return (
    <section className="skymap-object-dossier" aria-label={`${object.name} object dossier`}>
      <div className="skymap-object-dossier__header">
        <span>{actionLabel}</span>
        <strong>{primaryIdentifier}</strong>
      </div>
      <p>{getObjectSummary(object)}</p>
      <div className="skymap-object-dossier__facts" aria-label="Object context">
        <div>
          <span>Kind</span>
          <strong>{formatObjectKind(object.kind)}</strong>
        </div>
        <div>
          <span>Distance</span>
          <strong>{getObjectDistanceContext(object)}</strong>
        </div>
        <div>
          <span>Scale model</span>
          <strong>{getObjectScaleContext(object)}</strong>
        </div>
        <div>
          <span>Source</span>
          <strong>{sourceLabel}</strong>
        </div>
      </div>
      <div className="skymap-object-dossier__chips" aria-label="Object quick context">
        <StatusChip tone="info">{formatFrameLabel(object)}</StatusChip>
        <StatusChip tone="warning">{getObjectNotabilityLabel(object)}</StatusChip>
        <StatusChip tone="neutral">{object.time ? formatTimeBehavior(object.time.behavior) : "static context"}</StatusChip>
      </div>
      {selected ? (
        <div className="skymap-object-dossier__actions">
          <button type="button" className="skymap-object-dossier__fly" onClick={() => onFocusObject(object.id)}>
            <span aria-hidden="true">◉</span> Fly to
          </button>
          {isSolarBridgeObject(object) ? (
            <button type="button" className="ghost button--small" onClick={() => onOpenSolarObject(object)}>
              Open in Solar Explorer
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};

const SkyMapObjectDetails: FC<{
  selectedObject: SkyObject | null;
  hoveredObject: SkyObject | null;
  relatedRecords: SkyMapRelatedRecord[];
  timeState: SkyMapTimeState;
  onSelectRelatedRecord: (record: SkyObjectRegistryRecord) => void;
  onOpenImagery: (image: SpaceImage) => void;
}> = ({
  selectedObject,
  hoveredObject,
  relatedRecords,
  timeState,
  onSelectRelatedRecord,
  onOpenImagery,
}) => {
  const object = selectedObject ?? hoveredObject;
  if (!object) {
    return (
      <p className="skymap-empty">
        Click a visible star, exoplanet system, planet, moon, galaxy, nebula, or cluster to inspect its current map details.
      </p>
    );
  }

  const aliases = getObjectAliases(object);
  const catalogIds = getObjectCatalogIds(object);
  const provenance = formatProvenanceSource(object);
  const approximationNote = getObjectApproximationNote(object);

  return (
    <>
    <SkyMapImageryPreview object={object} onOpenImagery={onOpenImagery} />
    <section className="skymap-object-identity" aria-label={`${object.name} identity`}>
      {aliases.length ? (
        <div>
          <span>Aliases</span>
          <p>
            {aliases.slice(0, 8).map((alias) => (
              <em key={alias}>{alias}</em>
            ))}
          </p>
        </div>
      ) : null}
      {catalogIds.length ? (
        <div>
          <span>Catalog IDs</span>
          <p>
            {catalogIds.slice(0, 8).map((catalogId) => (
              <em key={catalogId}>{catalogId}</em>
            ))}
          </p>
        </div>
      ) : null}
      <div>
        <span>Source model</span>
        <strong>{formatModelName(object.time?.model)}</strong>
        <small>{object.time ? formatTimeBehavior(object.time.behavior) : "No time behavior declared"}</small>
      </div>
      {provenance.length ? (
        <div>
          <span>Provenance</span>
          <ul>
            {provenance.slice(0, 3).map((source) => (
              <li key={source}>{source}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {approximationNote ? (
        <div className="skymap-object-identity__note">
          <span>Approximation status</span>
          <small>{approximationNote}</small>
        </div>
      ) : null}
    </section>
    <dl className="skymap-object-stats">
      <div>
        <dt>Kind</dt>
        <dd>{formatObjectKind(object.kind)}</dd>
      </div>
      <div>
        <dt>Map frame</dt>
        <dd>{formatFrameLabel(object)}</dd>
      </div>
      <div>
        <dt>Map position</dt>
        <dd>{formatPosition(object)}</dd>
      </div>
      <div>
        <dt>Time model</dt>
        <dd>{object.time ? formatTimeBehavior(object.time.behavior) : "unspecified"}</dd>
      </div>
      {object.time?.behavior === "time-sensitive" ? (
        <div>
          <dt>Map time</dt>
          <dd>{formatDisplayDate(getSkyMapDate(timeState))}</dd>
        </div>
      ) : null}
      {object.time?.note && !isPlanetSkyObject(object) && !isMoonSkyObject(object) ? (
        <div>
          <dt>Model note</dt>
          <dd>{object.time.note}</dd>
        </div>
      ) : null}
      {isStarSkyObject(object) ? (
        <>
          <div>
            <dt>Distance</dt>
            <dd>
              {typeof object.scientific.distanceLy === "number"
                ? `${object.scientific.distanceLy.toFixed(2)} ly`
                : "Unknown"}
            </dd>
          </div>
          <div>
            <dt>Spectral type</dt>
            <dd>{object.scientific.spectralType ?? "Unknown"}</dd>
          </div>
          <div>
            <dt>Luminosity</dt>
            <dd>
              {typeof object.scientific.luminositySolar === "number"
                ? `${object.scientific.luminositySolar.toFixed(3)} Lsun`
                : "Unknown"}
            </dd>
          </div>
          <div>
            <dt>Temperature</dt>
            <dd>
              {typeof object.scientific.temperatureK === "number"
                ? `${object.scientific.temperatureK.toLocaleString()} K`
                : "Unknown"}
            </dd>
          </div>
          {typeof object.scientific.apparentMagnitude === "number" ? (
            <div>
              <dt>Gaia G magnitude</dt>
              <dd>{formatNumber(object.scientific.apparentMagnitude, 3)}</dd>
            </div>
          ) : null}
          {typeof object.scientific.colorIndexBpRp === "number" ? (
            <div>
              <dt>Gaia BP-RP</dt>
              <dd>{formatNumber(object.scientific.colorIndexBpRp, 3)} mag</dd>
            </div>
          ) : null}
          {typeof object.scientific.referenceEpochJulianYear === "number" ? (
            <div>
              <dt>Reference epoch</dt>
              <dd>J{object.scientific.referenceEpochJulianYear.toFixed(1)} · TCB</dd>
            </div>
          ) : null}
          {typeof object.scientific.renderEpochJulianYear === "number" ? (
            <div>
              <dt>Rendered stellar epoch</dt>
              <dd>J{object.scientific.renderEpochJulianYear.toFixed(2)} · Worker propagated</dd>
            </div>
          ) : null}
          {typeof object.scientific.raDeg === "number" && typeof object.scientific.decDeg === "number" ? (
            <div>
              <dt>Catalogue ICRS position</dt>
              <dd>
                RA {formatNumber(object.scientific.raDeg, 5)}° · Dec {formatNumber(object.scientific.decDeg, 5)}°
              </dd>
            </div>
          ) : null}
          {typeof object.scientific.parallaxMas === "number" ? (
            <div>
              <dt>Parallax</dt>
              <dd>
                {formatNumber(object.scientific.parallaxMas, 3)} ± {formatNumber(object.scientific.parallaxErrorMas ?? 0, 3)} mas
              </dd>
            </div>
          ) : null}
          {typeof object.scientific.pmRaMasYr === "number" ? (
            <div>
              <dt>Proper motion RA*</dt>
              <dd>
                {formatNumber(object.scientific.pmRaMasYr, 2)} ± {formatNumber(object.scientific.pmRaErrorMasYr ?? 0, 2)} mas/yr
              </dd>
            </div>
          ) : null}
          {typeof object.scientific.pmDecMasYr === "number" ? (
            <div>
              <dt>Proper motion Dec</dt>
              <dd>
                {formatNumber(object.scientific.pmDecMasYr, 2)} ± {formatNumber(object.scientific.pmDecErrorMasYr ?? 0, 2)} mas/yr
              </dd>
            </div>
          ) : null}
          {object.scientific.propagationModel ? (
            <div>
              <dt>Radial velocity</dt>
              <dd>
                {object.scientific.radialVelocityApplied && typeof object.scientific.radialVelocityKmS === "number"
                  ? `${formatNumber(object.scientific.radialVelocityKmS, 2)} ± ${formatNumber(object.scientific.radialVelocityErrorKmS ?? 0, 2)} km/s · Gaia RVS / SSB`
                  : "Not published · 0 km/s propagation fallback"}
              </dd>
            </div>
          ) : null}
          {typeof object.scientific.propagatedAngularUncertaintyMas === "number" ? (
            <div>
              <dt>Propagated angular uncertainty</dt>
              <dd>
                {typeof object.scientific.propagatedAngularUncertaintySemiMajorMas === "number" &&
                typeof object.scientific.propagatedAngularUncertaintySemiMinorMas === "number"
                  ? `1σ ${formatNumber(object.scientific.propagatedAngularUncertaintySemiMajorMas, 2)} × ${formatNumber(object.scientific.propagatedAngularUncertaintySemiMinorMas, 2)} mas · PA ${formatNumber(object.scientific.propagatedAngularUncertaintyPositionAngleDeg ?? 0, 1)}°`
                  : `≈ ${formatNumber(object.scientific.propagatedAngularUncertaintyMas, 2)} mas`}
                {" · 6-parameter Jacobian projection"}
              </dd>
            </div>
          ) : null}
          {typeof object.scientific.propagatedPositionUncertaintySemiMajorLy === "number" &&
          typeof object.scientific.propagatedPositionUncertaintySemiIntermediateLy === "number" &&
          typeof object.scientific.propagatedPositionUncertaintySemiMinorLy === "number" ? (
            <div>
              <dt>3D position covariance</dt>
              <dd>
                1σ axes {formatCovarianceLength(object.scientific.propagatedPositionUncertaintySemiMajorLy)} × {" "}
                {formatCovarianceLength(object.scientific.propagatedPositionUncertaintySemiIntermediateLy)} × {" "}
                {formatCovarianceLength(object.scientific.propagatedPositionUncertaintySemiMinorLy)} · ICRS Cartesian
              </dd>
            </div>
          ) : null}
          {object.scientific.propagatedCovarianceModel ? (
            <div>
              <dt>Covariance model</dt>
              <dd>
                J C₀ Jᵀ · Gaia within-source astrometry · {" "}
                {object.scientific.propagatedCovarianceRadialVelocityTreatment === "published-independent-radial-velocity"
                  ? "independent RVS σ included"
                  : "conditional on disclosed 0 km/s radial fallback"}
              </dd>
            </div>
          ) : null}
          {object.scientific.exoplanetSystemId ? (
            <div>
              <dt>Exoplanet-host identity</dt>
              <dd>Exact NASA Exoplanet Archive Gaia DR3 source-ID match · linked system available below</dd>
            </div>
          ) : null}
          {typeof object.scientific.ruwe === "number" ? (
            <div>
              <dt>RUWE</dt>
              <dd>{formatNumber(object.scientific.ruwe, 3)}</dd>
            </div>
          ) : null}
        </>
      ) : null}
      {isPlanetSkyObject(object) ? (
        <>
          <div>
            <dt>Radius</dt>
            <dd>{formatOptionalNumber(object.scientific?.radiusKm, "km", 0)}</dd>
          </div>
          <div>
            <dt>Orbit</dt>
            <dd>{formatOptionalNumber(object.scientific?.semiMajorAxisAU, "AU", 2)}</dd>
          </div>
          <div>
            <dt>Orbital period</dt>
            <dd>{formatOptionalNumber(object.scientific?.orbitalPeriodDays, "days", 1)}</dd>
          </div>
          <div>
            <dt>Moons</dt>
            <dd>
              {typeof object.scientific?.moonCount === "number"
                ? `${object.scientific.moonCount}${object.scientific.ringSystem ? " · ring system" : ""}`
                : object.scientific?.ringSystem
                  ? "Ring system"
                  : "Unknown"}
            </dd>
          </div>
          {object.scientific?.facts?.slice(0, 2).map((fact) => (
            <div key={fact}>
              <dt>Fact</dt>
              <dd>{fact}</dd>
            </div>
          ))}
          {object.scientific?.approximation ? (
            <div>
              <dt>Scale note</dt>
              <dd>{object.scientific.approximation}</dd>
            </div>
          ) : null}
        </>
      ) : null}
      {isExoplanetSystemSkyObject(object) ? (
        <>
          <div>
            <dt>Host star</dt>
            <dd>{object.scientific.hostName}</dd>
          </div>
          <div>
            <dt>Confirmed planets</dt>
            <dd>{object.scientific.planetCount}</dd>
          </div>
          <div>
            <dt>Host distance</dt>
            <dd>
              {formatNumber(object.scientific.distancePc, 3)} pc
              {typeof object.scientific.distanceErrorPlusPc === "number" || typeof object.scientific.distanceErrorMinusPc === "number"
                ? ` −${formatParsecUncertainty(object.scientific.distanceErrorMinusPc ?? 0)} / +${formatParsecUncertainty(object.scientific.distanceErrorPlusPc ?? 0)} pc`
                : ""}
            </dd>
          </div>
          <div>
            <dt>Catalogue ICRS position</dt>
            <dd>RA {formatNumber(object.scientific.raDeg, 5)}° · Dec {formatNumber(object.scientific.decDeg, 5)}°</dd>
          </div>
          {object.scientific.gaiaDr3Crossmatch ? (
            <div>
              <dt>Gaia renderer host</dt>
              <dd>
                Exact Gaia DR3 source ID {object.scientific.gaiaDr3Crossmatch.sourceId}
                {` · ${formatNumber(object.scientific.gaiaDr3Crossmatch.angularSeparationArcsec, 3)} arcsec catalogue-position separation`}
                {` · ${formatNumber(object.scientific.gaiaDr3Crossmatch.gaiaInverseParallaxDistancePc, 3)} pc Gaia inverse-parallax distance`}
              </dd>
            </div>
          ) : (
            <div>
              <dt>Gaia renderer host</dt>
              <dd>No exact identifier match inside the current 100 pc / G≤9 Gaia visualization subset.</dd>
            </div>
          )}
          <div>
            <dt>Host classification</dt>
            <dd>{object.scientific.spectralType ?? "Not published in this composite row"}</dd>
          </div>
          <div>
            <dt>Host temperature</dt>
            <dd>{typeof object.scientific.stellarTemperatureK === "number" ? `${formatNumber(object.scientific.stellarTemperatureK, 0)} K` : "Not published"}</dd>
          </div>
          {object.scientific.planets.map((planet) => (
            <div key={planet.name} className="skymap-object-stats__exoplanet">
              <dt>{planet.name}</dt>
              <dd>
                {[planet.discoveryMethod, planet.discoveryYear ? `discovered ${planet.discoveryYear}` : undefined].filter(Boolean).join(" · ") || "Confirmed planet"}
                {typeof planet.orbitalPeriodDays === "number" ? ` · ${formatNumber(planet.orbitalPeriodDays, 3)} day orbit` : ""}
                {typeof planet.semiMajorAxisAu === "number" ? ` · ${formatNumber(planet.semiMajorAxisAu, 4)} AU` : ""}
                {typeof planet.radiusEarth === "number" ? ` · ${formatNumber(planet.radiusEarth, 2)} R⊕` : ""}
                {typeof planet.massEarth === "number" ? ` · ${formatNumber(planet.massEarth, 2)} M⊕` : ""}
              </dd>
            </div>
          ))}
          <div>
            <dt>Selection boundary</dt>
            <dd>{object.scientific.selectionBoundary}</dd>
          </div>
          <div>
            <dt>Parameter boundary</dt>
            <dd>{object.scientific.parameterBoundary}</dd>
          </div>
          <div>
            <dt>Source manifest</dt>
            <dd><a href={object.scientific.manifestUrl} target="_blank" rel="noreferrer">Open catalogue manifest</a></dd>
          </div>
        </>
      ) : null}
      {isMoonSkyObject(object) ? (
        <>
          <div>
            <dt>Parent</dt>
            <dd>{object.scientific?.parentPlanetName ?? "Unknown planet"}</dd>
          </div>
          <div>
            <dt>Class</dt>
            <dd>{object.scientific?.moonClass ?? "moon"}</dd>
          </div>
          <div>
            <dt>Radius</dt>
            <dd>{formatOptionalNumber(object.scientific?.radiusKm, "km", 0)}</dd>
          </div>
          <div>
            <dt>Orbit distance</dt>
            <dd>{formatOptionalNumber(object.scientific?.orbitalDistanceKm, "km", 0)}</dd>
          </div>
          <div>
            <dt>Orbital period</dt>
            <dd>{formatOptionalNumber(object.scientific?.orbitalPeriodDays, "days", 2)}</dd>
          </div>
          {object.scientific?.facts?.slice(0, 2).map((fact) => (
            <div key={fact}>
              <dt>Fact</dt>
              <dd>{fact}</dd>
            </div>
          ))}
          {object.scientific?.approximation ? (
            <div>
              <dt>Scale note</dt>
              <dd>{object.scientific.approximation}</dd>
            </div>
          ) : null}
        </>
      ) : null}
      {isGalacticFeatureSkyObject(object) ? (
        <>
          <div>
            <dt>Feature</dt>
            <dd>{object.scientific.featureClass.replace(/-/g, " ")}</dd>
          </div>
          <div>
            <dt>Model status</dt>
            <dd>{object.scientific.modelStatus.replace(/-/g, " ")}</dd>
          </div>
          {typeof object.scientific.galactocentricRadiusKpc === "number" ? (
            <div>
              <dt>Centre distance</dt>
              <dd>{formatNumber(object.scientific.galactocentricRadiusKpc, 3)} kpc</dd>
            </div>
          ) : null}
          {typeof object.scientific.modelRadiusKpc === "number" ? (
            <div>
              <dt>Model radius</dt>
              <dd>{formatNumber(object.scientific.modelRadiusKpc, 1)} kpc</dd>
            </div>
          ) : null}
          {typeof object.scientific.armCount === "number" ? (
            <div>
              <dt>Arm schematic</dt>
              <dd>
                {object.scientific.armCount} logarithmic arms · {formatNumber(object.scientific.pitchAngleDeg ?? 0, 1)}° pitch
              </dd>
            </div>
          ) : null}
          {typeof object.scientific.tracerCount === "number" ? (
            <div>
              <dt>Observed tracers</dt>
              <dd>{object.scientific.tracerCount.toLocaleString()} VLBI maser sources</dd>
            </div>
          ) : null}
          {typeof object.scientific.fittedSegmentCount === "number" ? (
            <div>
              <dt>Arm fits</dt>
              <dd>{object.scientific.fittedSegmentCount} measured-range segments · intrinsic 1σ widths</dd>
            </div>
          ) : null}
          {typeof object.scientific.lowSignalTracerCount === "number" ? (
            <div>
              <dt>Low-S/N flag</dt>
              <dd>{object.scientific.lowSignalTracerCount} tracers have fractional parallax uncertainty ≥ 1/3</dd>
            </div>
          ) : null}
          {object.scientific.selectionBoundary ? (
            <div>
              <dt>Selection</dt>
              <dd>{object.scientific.selectionBoundary}</dd>
            </div>
          ) : null}
          {object.scientific.uncertaintyModel ? (
            <div>
              <dt>Distance display</dt>
              <dd>{object.scientific.uncertaintyModel}</dd>
            </div>
          ) : null}
          {object.scientific.licenceBoundary ? (
            <div>
              <dt>Usage boundary</dt>
              <dd>{object.scientific.licenceBoundary}</dd>
            </div>
          ) : null}
          {object.scientific.manifestUrl ? (
            <div>
              <dt>Data receipt</dt>
              <dd><a href={object.scientific.manifestUrl} target="_blank" rel="noreferrer">Open versioned manifest</a></dd>
            </div>
          ) : null}
          {object.scientific.facts?.map((fact) => (
            <div key={fact}>
              <dt>Boundary</dt>
              <dd>{fact}</dd>
            </div>
          ))}
          <div>
            <dt>Map placement</dt>
            <dd>{object.scientific.mapPlacementNote}</dd>
          </div>
        </>
      ) : null}
      {isCosmologicalFeatureSkyObject(object) ? (
        <>
          <div>
            <dt>Feature</dt>
            <dd>{object.scientific.featureClass.replace(/-/g, " ")}</dd>
          </div>
          <div>
            <dt>Coordinate model</dt>
            <dd>{object.scientific.coordinateConvention.replace(/-/g, " ")}</dd>
          </div>
          <div>
            <dt>Reference cosmology</dt>
            <dd>{object.scientific.cosmology}</dd>
          </div>
          <div>
            <dt>Model status</dt>
            <dd>{object.scientific.modelStatus.replace(/-/g, " ")}</dd>
          </div>
          {typeof object.scientific.tracerCount === "number" ? (
            <div>
              <dt>Measured galaxies</dt>
              <dd>{object.scientific.tracerCount.toLocaleString()} DESI DR1 sources</dd>
            </div>
          ) : null}
          {object.scientific.redshiftRange ? (
            <div>
              <dt>Redshift range</dt>
              <dd>z {object.scientific.redshiftRange.minimum.toFixed(1)}–{object.scientific.redshiftRange.maximum.toFixed(1)}</dd>
            </div>
          ) : null}
          {object.scientific.skyFootprint ? (
            <div>
              <dt>Survey strip</dt>
              <dd>{object.scientific.skyFootprint}</dd>
            </div>
          ) : null}
          {object.scientific.selectionBoundary ? (
            <div>
              <dt>Selection boundary</dt>
              <dd>{object.scientific.selectionBoundary}</dd>
            </div>
          ) : null}
          {object.scientific.uncertaintyBoundary ? (
            <div>
              <dt>Uncertainty boundary</dt>
              <dd>{object.scientific.uncertaintyBoundary}</dd>
            </div>
          ) : null}
          {object.scientific.licenceBoundary ? (
            <div>
              <dt>Usage boundary</dt>
              <dd>{object.scientific.licenceBoundary}</dd>
            </div>
          ) : null}
          {object.scientific.manifestUrl ? (
            <div>
              <dt>Data receipt</dt>
              <dd><a href={object.scientific.manifestUrl} target="_blank" rel="noreferrer">Open versioned manifest</a></dd>
            </div>
          ) : null}
          {object.scientific.facts?.map((fact) => (
            <div key={fact}>
              <dt>Boundary</dt>
              <dd>{fact}</dd>
            </div>
          ))}
          <div>
            <dt>Map placement</dt>
            <dd>{object.scientific.mapPlacementNote}</dd>
          </div>
        </>
      ) : null}
      {isAnnotationSkyObject(object) ? (
        <>
          <div>
            <dt>Note</dt>
            <dd>{object.scientific?.body}</dd>
          </div>
          <div>
            <dt>Anchored to</dt>
            <dd>{object.scientific?.targetName ?? "SkyMap position"}</dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>{object.scientific?.createdAt ? formatDisplayDate(new Date(object.scientific.createdAt)) : "Unknown"}</dd>
          </div>
          <div>
            <dt>Map date</dt>
            <dd>{object.scientific?.timeKey ?? "Unknown"}</dd>
          </div>
        </>
      ) : null}
      {isDeepSkyObject(object) ? (
        <>
          {object.scientific?.discoveryBlurb ? (
            <div>
              <dt>Why it matters</dt>
              <dd>{object.scientific.discoveryBlurb}</dd>
            </div>
          ) : null}
          <div>
            <dt>Class</dt>
            <dd>{formatObjectClass(object.scientific?.objectClass, formatObjectKind(object.kind))}</dd>
          </div>
          <div>
            <dt>Distance</dt>
            <dd>
              {typeof object.scientific?.distanceKpc === "number"
                ? formatKpcWithUncertainty(
                    object.scientific.distanceKpc,
                    object.scientific.distanceErrorMinusKpc,
                    object.scientific.distanceErrorPlusKpc,
                  )
                : typeof object.scientific?.distanceLy === "number"
                  ? formatLightYears(object.scientific.distanceLy)
                  : "Not supplied by this catalogue selection"}
            </dd>
          </div>
          {typeof object.scientific?.raDeg === "number" && typeof object.scientific?.decDeg === "number" ? (
            <div>
              <dt>J2000 ICRS</dt>
              <dd>RA {formatNumber(object.scientific.raDeg, 5)}° · Dec {formatNumber(object.scientific.decDeg, 5)}°</dd>
            </div>
          ) : null}
          {object.scientific?.supergalacticKpc ? (
            <div>
              <dt>Supergalactic XYZ</dt>
              <dd>
                {formatNumber(object.scientific.supergalacticKpc.x, 2)}, {formatNumber(object.scientific.supergalacticKpc.y, 2)}, {formatNumber(object.scientific.supergalacticKpc.z, 2)} kpc
              </dd>
            </div>
          ) : null}
          {object.scientific?.localGroupMembership ? (
            <div>
              <dt>Membership</dt>
              <dd>{object.scientific.localGroupMembership}{object.scientific.hostName ? ` · host ${object.scientific.hostName}` : ""}</dd>
            </div>
          ) : null}
          {object.scientific?.distanceReference || object.scientific?.distanceMeasurementMethod ? (
            <div>
              <dt>Distance basis</dt>
              <dd>{[object.scientific.distanceMeasurementMethod, object.scientific.distanceReference].filter(Boolean).join(" · ")}</dd>
            </div>
          ) : null}
          {typeof object.scientific?.radialVelocityKmS === "number" ? (
            <div>
              <dt>Radial velocity</dt>
              <dd>
                {formatNumber(object.scientific.radialVelocityKmS, 2)} km/s
                {typeof object.scientific.radialVelocityErrorMinusKmS === "number" || typeof object.scientific.radialVelocityErrorPlusKmS === "number"
                  ? ` −${formatNumber(object.scientific.radialVelocityErrorMinusKmS ?? 0, 2)} / +${formatNumber(object.scientific.radialVelocityErrorPlusKmS ?? 0, 2)}`
                  : ""}
              </dd>
            </div>
          ) : null}
          {typeof object.scientific?.properMotionRaMasYr === "number" || typeof object.scientific?.properMotionDecMasYr === "number" ? (
            <div>
              <dt>Proper motion</dt>
              <dd>
                RA {formatNumber(object.scientific.properMotionRaMasYr ?? 0, 3)} · Dec {formatNumber(object.scientific.properMotionDecMasYr ?? 0, 3)} mas/yr
              </dd>
            </div>
          ) : null}
          {object.scientific?.coordinateConvention ? (
            <div>
              <dt>Coordinate convention</dt>
              <dd>{object.scientific.coordinateConvention}</dd>
            </div>
          ) : null}
          <div>
            <dt>Constellation</dt>
            <dd>{object.scientific?.constellation ?? "Unknown"}</dd>
          </div>
          <div>
            <dt>Catalog</dt>
            <dd>{object.scientific?.catalogIds?.join(" / ") ?? "Seed catalog"}</dd>
          </div>
          {typeof object.scientific?.apparentMagnitude === "number" ? (
            <div>
              <dt>Apparent mag.</dt>
              <dd>{formatNumber(object.scientific.apparentMagnitude, 2)}{object.scientific.apparentMagnitudeBand ? ` (${object.scientific.apparentMagnitudeBand})` : ""}</dd>
            </div>
          ) : null}
          {typeof object.scientific?.angularSizeArcMin === "number" ? (
            <div>
              <dt>Angular size</dt>
              <dd>
                {formatNumber(object.scientific.angularSizeArcMin, 1)}
                {typeof object.scientific.minorAngularSizeArcMin === "number" ? ` × ${formatNumber(object.scientific.minorAngularSizeArcMin, 1)}` : ""} arcmin
                {typeof object.scientific.positionAngleDeg === "number" ? ` · PA ${formatNumber(object.scientific.positionAngleDeg, 0)}°` : ""}
              </dd>
            </div>
          ) : null}
          {object.scientific?.hubbleType ? (
            <div>
              <dt>Morphology</dt>
              <dd>{object.scientific.hubbleType}</dd>
            </div>
          ) : null}
          {typeof object.scientific?.redshift === "number" ? (
            <div>
              <dt>Catalogue redshift</dt>
              <dd>{formatNumber(object.scientific.redshift, 6)}</dd>
            </div>
          ) : null}
          {typeof object.scientific?.surfaceBrightness === "number" ? (
            <div>
              <dt>Surface brightness</dt>
              <dd>{formatNumber(object.scientific.surfaceBrightness, 2)} mag/arcsec² (OpenNGC field)</dd>
            </div>
          ) : null}
          {object.scientific?.facts?.slice(0, 2).map((fact) => (
            <div key={fact}>
              <dt>Fact</dt>
              <dd>{fact}</dd>
            </div>
          ))}
          {object.scientific?.imagery?.at(0) ? (
            <div>
              <dt>Imagery</dt>
              <dd>
                {object.scientific.imagery[0].label} · {object.scientific.imagery[0].source}
              </dd>
            </div>
          ) : null}
          {object.scientific?.observationContext ? (
            <div>
              <dt>Context</dt>
              <dd>{object.scientific.observationContext}</dd>
            </div>
          ) : null}
          {object.scientific?.mapPlacementNote ? (
            <div>
              <dt>Map placement</dt>
              <dd>{object.scientific.mapPlacementNote}</dd>
            </div>
          ) : null}
          {object.scientific?.selectionBoundary ? (
            <div>
              <dt>Selection boundary</dt>
              <dd>{object.scientific.selectionBoundary}</dd>
            </div>
          ) : null}
          {object.scientific?.parameterBoundary ? (
            <div>
              <dt>Parameter boundary</dt>
              <dd>{object.scientific.parameterBoundary}</dd>
            </div>
          ) : null}
          {object.scientific?.licenceBoundary ? (
            <div>
              <dt>Licence / adaptation</dt>
              <dd>{object.scientific.licenceBoundary}</dd>
            </div>
          ) : null}
          {object.scientific?.manifestUrl ? (
            <div>
              <dt>Catalogue receipt</dt>
              <dd><a href={object.scientific.manifestUrl} target="_blank" rel="noreferrer">Open generated manifest</a></dd>
            </div>
          ) : null}
        </>
      ) : null}
      <div>
        <dt>Source</dt>
        <dd>{formatSourceLabel(object)}</dd>
      </div>
      {object.importance ? (
        <div>
          <dt>Notability</dt>
          <dd>
            {object.importance.tier} · {Math.round(object.importance.score)}
            {object.importance.reasons.length ? ` · ${object.importance.reasons.slice(0, 2).join(", ")}` : ""}
          </dd>
        </div>
      ) : null}
    </dl>
    {relatedRecords.length ? (
      <div className="skymap-related">
        <span>Related jumps</span>
        <div>
          {relatedRecords.map(({ record, label, reason }) => (
            <button type="button" key={`${record.object.id}-${label}`} onClick={() => onSelectRelatedRecord(record)}>
              <strong>{record.object.name}</strong>
              <small>
                {label} · {reason}
              </small>
            </button>
          ))}
        </div>
      </div>
    ) : null}
    </>
  );
};

export const SkyMapControlRail: FC<SkyMapControlRailProps> = ({
  selectedObject,
  hoveredObject,
  viewportStatus,
  layers,
  routeTrail,
  searchQuery,
  searchResults,
  registryObjectCount,
  discoveryRecords,
  relatedRecords,
  annotations,
  filters,
  timeState,
  stellarPropagation,
  navigationState,
  layerPresetSummary,
  onSetLayerVisibility,
  onSoloLayer,
  onShowAllActiveLayers,
  onSaveLayerPreset,
  onApplyLayerPreset,
  onClearLayerPreset,
  onFocusObject,
  onSelectRouteStep,
  onClearRouteTrail,
  onSearchQueryChange,
  onSelectSearchResult,
  onSelectDiscoveryRecord,
  onAddAnnotation,
  onSelectAnnotation,
  onDeleteAnnotation,
  onOpenSolarObject,
  onOpenImagery,
  onFilterChange,
  onResetFilters,
  onResetNavigationView,
  onToggleTimePlayback,
  onSetTimeSpeed,
  onSetTimeDirection,
  onSetTimeDate,
  onStepTime,
  onResetTimeToNow,
}) => {
  const railRef = useRef<HTMLElement>(null);
  const [launchPanelOpen, setLaunchPanelOpen] = useState(true);
  const [utilityPanel, setUtilityPanel] = useState<"settings" | "time" | null>(null);

  useEffect(() => {
    if (selectedObject) {
      railRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [selectedObject]);

  useEffect(() => {
    const handleUtilityPanel = (event: Event) => {
      const panel = (event as CustomEvent<{ panel?: "settings" | "time" }>).detail?.panel;
      if (!panel) return;
      setLaunchPanelOpen(false);
      setUtilityPanel((current) => current === panel ? null : panel);
      railRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    };
    window.addEventListener("spaceviewer:skymap-utility", handleUtilityPanel);
    return () => window.removeEventListener("spaceviewer:skymap-utility", handleUtilityPanel);
  }, []);

  return (
  <aside
    ref={railRef}
    className="skymap-rail"
    aria-label="SkyMap controls and object details"
    data-utility-panel={utilityPanel ?? "none"}
  >
    <SkyMapSearchPanel
      query={searchQuery}
      results={searchResults}
      registryObjectCount={registryObjectCount}
      onQueryChange={onSearchQueryChange}
      onSelectResult={(result) => {
        setUtilityPanel(null);
        onSelectSearchResult(result);
      }}
    />

    <section
      className="skymap-panel skymap-panel--object"
      data-object-kind={selectedObject?.kind ?? hoveredObject?.kind ?? "none"}
    >
      <div>
        <p className="eyebrow">SELECTED OBJECT</p>
        <h2>{selectedObject?.name ?? hoveredObject?.name ?? "Nothing selected"}</h2>
      </div>
      {selectedObject || hoveredObject ? (
        <SkyMapObjectDossier
          object={selectedObject ?? hoveredObject!}
          selected={Boolean(selectedObject)}
          onFocusObject={onFocusObject}
          onOpenSolarObject={onOpenSolarObject}
        />
      ) : null}
      <SkyMapObjectDetails
        selectedObject={selectedObject}
        hoveredObject={hoveredObject}
        relatedRecords={relatedRecords}
        timeState={timeState}
        onSelectRelatedRecord={onSelectDiscoveryRecord}
        onOpenImagery={onOpenImagery}
      />
    </section>

    {launchPanelOpen && !selectedObject ? (
      <SkyMapDiscoveryPanel
        records={discoveryRecords}
        onSelectRecord={(record) => {
          setLaunchPanelOpen(false);
          setUtilityPanel(null);
          onSelectDiscoveryRecord(record);
        }}
        onClose={() => setLaunchPanelOpen(false)}
      />
    ) : null}

    {!launchPanelOpen && !selectedObject ? (
      <button
        type="button"
        className="skymap-launch-reopen"
        onClick={() => {
          setUtilityPanel(null);
          setLaunchPanelOpen(true);
        }}
      >
        Explore universe
      </button>
    ) : null}

    <SkyMapFilterPanel filters={filters} onFilterChange={onFilterChange} onResetFilters={onResetFilters} />

    <SkyMapNavigationPanel
      navigationState={navigationState}
      viewportStatus={viewportStatus}
      onResetNavigationView={onResetNavigationView}
    />

    <SkyMapRouteTrailPanel
      routeTrail={routeTrail}
      selectedObject={selectedObject}
      onSelectRouteStep={onSelectRouteStep}
      onClearRouteTrail={onClearRouteTrail}
    />

    <SkyMapAnnotationsPanel
      selectedObject={selectedObject}
      annotations={annotations}
      onAddAnnotation={onAddAnnotation}
      onSelectAnnotation={onSelectAnnotation}
      onDeleteAnnotation={onDeleteAnnotation}
    />

    <SkyMapTimePanel
      timeState={timeState}
      stellarPropagation={stellarPropagation}
      onToggleTimePlayback={onToggleTimePlayback}
      onSetTimeSpeed={onSetTimeSpeed}
      onSetTimeDirection={onSetTimeDirection}
      onSetTimeDate={onSetTimeDate}
      onStepTime={onStepTime}
      onResetTimeToNow={onResetTimeToNow}
    />

    <section className="skymap-panel skymap-panel--layers">
      <div>
        <p className="eyebrow">LAYERS</p>
        <h2>Visible layers</h2>
      </div>
      <p className="skymap-note">
        Toggle active map layers. Hidden layers remain searchable and are restored when a result is selected.
      </p>
      <div className="skymap-layer-presets" aria-label="Layer presets">
        <button type="button" className="ghost button--small" onClick={onShowAllActiveLayers}>
          All active
        </button>
        <button type="button" className="ghost button--small" onClick={onSaveLayerPreset}>
          Save preset
        </button>
        <button type="button" className="ghost button--small" onClick={onApplyLayerPreset} disabled={!layerPresetSummary}>
          Restore saved
        </button>
        <button type="button" className="ghost button--small" onClick={onClearLayerPreset} disabled={!layerPresetSummary}>
          Clear saved
        </button>
        <span>{layerPresetSummary ? `Saved preset: ${layerPresetSummary}` : "No saved layer preset"}</span>
      </div>
      <div className="skymap-layer-list">
        {layers.map((item) => (
          <SkyMapLayerRow
            key={item.definition.id}
            item={item}
            onSetLayerVisibility={onSetLayerVisibility}
            onSoloLayer={onSoloLayer}
          />
        ))}
      </div>
    </section>

    <section className="skymap-panel skymap-panel--foundation">
      <p className="eyebrow">MAP MODEL</p>
      <p>
        SkyMap uses canonical objects, explicit layer visibility, typed reference frames, and mixed-scale navigation.
        Gaia, IAU, and LVDB layers retain source coordinates while Solar ephemerides, the fixed J2000 angular guide,
        logarithmic Local Group radius, and outer-domain schematics keep their interpretation boundaries visible.
      </p>
      <span>
        {viewportStatus.activeLayerCount
          ? `${viewportStatus.activeLayerCount} active layer`
          : "No active layers visible"}
      </span>
    </section>
  </aside>
  );
};
