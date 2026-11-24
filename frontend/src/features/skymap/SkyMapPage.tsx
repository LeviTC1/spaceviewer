import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type FC } from "react";
import {
  ExperienceIntroOverlay,
  GuidedTourPanel,
  PresentationHud,
  type GuidedTour,
  type GuidedTourStep,
} from "../../components/experience/GuidedExperience";
import { setNearbyStarCatalogEpoch, useNearbyStarCatalog } from "../starmap/useNearbyStars";
import type { SolarLaunchTarget } from "../solar/SolarSystemPage";
import type { PlanetId } from "../solar/solarData";
import {
  createSkyLayerRegistry,
  buildSkyMapRenderables,
  resolveSkyLayerDataForTime,
  type SkyLayerData,
  type SkyLayerId,
} from "./core/layers";
import type { SkyPosition } from "./core/coordinates";
import { applySkyMapFilters } from "./core/filters";
import { createSkyObjectRegistry, type SkyObjectRegistryRecord, type SkyObjectSearchResult } from "./core/objectRegistry";
import { getSkyObjectImportanceScore, isDeepSkyObject, type SkyObject, type SkyObjectId } from "./core/objects";
import {
  createSkyRenderContext,
  isSkyLineRenderable,
  isSkyMeshRenderable,
  isSkyPointRenderable,
  isSkyStructureRenderable,
} from "./core/renderers";
import { createInitialSkyMapState, skyMapReducer, type SkyMapViewportStatus } from "./core/state";
import { SKYMAP_TIME_TICK_MS } from "./core/time";
import { getSkyMapScaleBandForFrame } from "./core/navigation";
import { createDeepSpaceLayerData } from "./layers/deepSpaceLayer";
import { createLocalGroupLayerData } from "./layers/localGroupLayer";
import { createConstellationBoundariesLayerData } from "./layers/constellationBoundariesLayer";
import { createLocalStarLayerData, LOCAL_STARS_LAYER_ID } from "./layers/localStarsLayer";
import {
  ANNOTATIONS_LAYER_ID,
  createAnnotationsLayerData,
  type UserSkyAnnotation,
} from "./layers/annotationsLayer";
import { SKYMAP_LAYER_DEFINITIONS } from "./layers/registry";
import { createSolarSystemLayerData } from "./layers/solarSystemLayer";
import { createGalacticStructureLayerData } from "./layers/galacticStructureLayer";
import { createCosmologicalStructureLayerData } from "./layers/cosmologicalStructureLayer";
import { createInterstellarProbesLayerData } from "./layers/interstellarProbesLayer";
import SkyMapViewport from "./GalaxiumSkyMapViewport";
import {
  SkyMapControlRail,
  SkyMapStatusStrip,
  SkyMapTopBar,
  type SkyMapLayerPanelItem,
  type SkyMapRelatedRecord,
  type SkyMapRouteStep,
} from "./SkyMapPanels";
import { getSkyMapDateKey } from "./core/time";
import type { SpaceImage } from "../../models/SpaceImage";
import type { ScaleDomainId } from "../../domain/astro";
import type { AstroQualityTier } from "../../lib/rendering/qualityManager";
import type { AdaptiveQualityReport } from "../../lib/rendering/adaptiveQuality";
import { dateToJulianYear, quantizeGaiaPropagationJulianYear } from "../../lib/catalog/starCatalogPropagation";
import type { TimeDirection } from "../time/timePlayback";
import CameraFlightStatus from "../../components/experience/CameraFlightStatus";
import type { CameraFlightState } from "../../domain/astro/cameraFlight";
import { useStreamedSolarEphemeris } from "../../domain/solar";
import { useNearbyExoplanets } from "./useNearbyExoplanets";
import { useOpenNgcCatalog } from "./useOpenNgcCatalog";
import { createExoplanetSystemsLayerData } from "./layers/exoplanetSystemsLayer";

interface SkyMapPageProps {
  onOpenSolarExplorer: (target?: SolarLaunchTarget) => void;
  onOpenImagery: (image: SpaceImage) => void;
  initialObjectId?: SkyObjectId | null;
  initialObjectToken?: number;
  qualityTier: AstroQualityTier;
  adaptiveQualityEnabled: boolean;
  onAdaptiveQualityDrop: (report: AdaptiveQualityReport) => void;
  onScaleDomainChange: (domain: ScaleDomainId) => void;
  onObjectSelectionChange?: (objectId: SkyObjectId | null) => void;
}

const SKYMAP_INTRO_KEY = "spaceviewer.skymap.finalExperienceSeen.v1";
const SKYMAP_ANNOTATIONS_KEY = "spaceviewer.skymap.annotations.v1";
const SKYMAP_LAYER_PRESET_KEY = "spaceviewer.skymap.layerPreset.v1";

const isSkyMapShortcutTextTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable;
};

interface SkyMapLayerPreset {
  createdAt: string;
  visibility: Record<SkyLayerId, boolean>;
}

const toSolarLaunchTarget = (object: SkyObject, dateKey: string): SolarLaunchTarget | null => {
  if (object.id === "solar:sun") {
    return { kind: "sun", navigationMode: "overview", dateKey };
  }
  if (object.id.startsWith("solar:planet:")) {
    return {
      kind: "planet",
      planetId: object.id.replace("solar:planet:", "") as PlanetId,
      navigationMode: "planetary",
      dateKey,
    };
  }
  if (object.id.startsWith("solar:moon:")) {
    return {
      kind: "moon",
      moonId: object.id.replace("solar:moon:", ""),
      navigationMode: "planetary",
      dateKey,
    };
  }
  return null;
};

const copySkyPosition = (position: SkyPosition): SkyPosition => {
  if (position.mode === "cartesian") {
    return { ...position, epoch: position.epoch ? { ...position.epoch } : undefined };
  }
  if (position.mode === "spherical") {
    return { ...position, epoch: position.epoch ? { ...position.epoch } : undefined };
  }
  return { ...position, epoch: position.epoch ? { ...position.epoch } : undefined };
};

const formatRelationType = (value: string) => value.replace(/-/g, " ");

const buildSkyMapRelatedRecords = (
  selectedObject: SkyObject | null,
  records: SkyObjectRegistryRecord[],
  byId: Map<SkyObjectId, SkyObjectRegistryRecord>,
): SkyMapRelatedRecord[] => {
  if (!selectedObject) return [];
  const related = new Map<SkyObjectId, SkyMapRelatedRecord>();

  const addRecord = (record: SkyObjectRegistryRecord | undefined, label: string, reason: string) => {
    if (!record || record.object.id === selectedObject.id || related.has(record.object.id)) {
      return;
    }
    related.set(record.object.id, { record, label, reason });
  };

  selectedObject.relations?.forEach((relation) => {
    addRecord(
      byId.get(relation.targetId),
      relation.label ?? `${formatRelationType(relation.type)} ${relation.targetId}`,
      "direct relation",
    );
  });

  if (isDeepSkyObject(selectedObject)) {
    selectedObject.scientific?.relatedObjectIds?.forEach((objectId) => {
      addRecord(byId.get(objectId), "Curated nearby jump", "deep-space path");
    });
  }

  records.forEach((record) => {
    const relation = record.object.relations?.find((item) => item.targetId === selectedObject.id);
    if (relation) {
      addRecord(record, relation.label ?? `${record.object.name} ${formatRelationType(relation.type)}`, "reverse relation");
      return;
    }

    if (isDeepSkyObject(record.object) && record.object.scientific?.relatedObjectIds?.includes(selectedObject.id)) {
      addRecord(record, "Curated nearby jump", "deep-space path");
    }
  });

  return Array.from(related.values())
    .sort(
      (a, b) =>
        getSkyObjectImportanceScore(b.record.object) - getSkyObjectImportanceScore(a.record.object) ||
        a.record.object.name.localeCompare(b.record.object.name),
    )
    .slice(0, 8);
};

const isStoredAnnotation = (value: unknown): value is UserSkyAnnotation => {
  const item = value as Partial<UserSkyAnnotation>;
  return (
    typeof item?.id === "string" &&
    typeof item.label === "string" &&
    typeof item.body === "string" &&
    typeof item.createdAt === "string" &&
    typeof item.timeKey === "string" &&
    typeof item.position === "object" &&
    item.position !== null
  );
};

const readStoredAnnotations = (): UserSkyAnnotation[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SKYMAP_ANNOTATIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isStoredAnnotation) : [];
  } catch (error) {
    console.warn("Unable to read SkyMap annotations", error);
    return [];
  }
};

const writeStoredAnnotations = (annotations: UserSkyAnnotation[]) => {
  if (typeof window === "undefined") return;
  try {
    if (annotations.length) {
      window.localStorage.setItem(SKYMAP_ANNOTATIONS_KEY, JSON.stringify(annotations));
    } else {
      window.localStorage.removeItem(SKYMAP_ANNOTATIONS_KEY);
    }
  } catch (error) {
    console.warn("Unable to save SkyMap annotations", error);
  }
};

const readStoredLayerPreset = (): SkyMapLayerPreset | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SKYMAP_LAYER_PRESET_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SkyMapLayerPreset>;
    if (typeof parsed.createdAt !== "string" || typeof parsed.visibility !== "object" || parsed.visibility === null) {
      return null;
    }
    const visibility = Object.fromEntries(
      Object.entries(parsed.visibility).filter((entry): entry is [SkyLayerId, boolean] => typeof entry[1] === "boolean"),
    );
    return { createdAt: parsed.createdAt, visibility };
  } catch (error) {
    console.warn("Unable to read SkyMap layer preset", error);
    return null;
  }
};

const writeStoredLayerPreset = (preset: SkyMapLayerPreset) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SKYMAP_LAYER_PRESET_KEY, JSON.stringify(preset));
  } catch (error) {
    console.warn("Unable to save SkyMap layer preset", error);
  }
};

const clearStoredLayerPreset = () => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SKYMAP_LAYER_PRESET_KEY);
};

type SkyMapTourStep = GuidedTourStep & {
  objectId?: SkyObjectId;
  resetView?: boolean;
};

const SKYMAP_TOURS: GuidedTour<SkyMapTourStep>[] = [
  {
    id: "cosmic-orientation",
    label: "Discover SkyMap",
    description: "A guided jump through mixed astronomical frames, from the solar bridge to Local Group and deep-space landmarks.",
    steps: [
      {
        id: "overview",
        eyebrow: "SKYMAP TOUR",
        title: "Start with the whole loaded universe",
        body: "SkyMap is a mixed-frame navigation surface. Solar bodies, Gaia stars, LVDB galaxies, nebulae, and clusters share one searchable object model with visible scale boundaries.",
        focusLabel: "The first view is a real map overview, not a placeholder.",
        resetView: true,
      },
      {
        id: "sun",
        eyebrow: "SOLAR BRIDGE",
        title: "Anchor on the Sun",
        body: "The solar system is now bridged into SkyMap as canonical, time-aware objects. The dedicated Solar Explorer remains the richer close-up surface.",
        focusLabel: "Wow moment: the universe map includes the local solar system.",
        objectId: "solar:sun",
      },
      {
        id: "earth",
        eyebrow: "LOCAL CONTEXT",
        title: "Jump to Earth",
        body: "Search, discovery cards, direct clicks, and tours all select and focus through the same central state path.",
        focusLabel: "This is the same action model a user gets from search.",
        objectId: "solar:planet:earth",
      },
      {
        id: "nearby-exoplanets",
        eyebrow: "CONFIRMED PLANETARY SYSTEMS",
        title: "Find nearby worlds around other stars",
        body: "NASA Exoplanet Archive systems within 100 pc are streamed in integrity-checked ICRS sectors. Search by host or planet name; the map resolves host positions, not tiny planetary orbits.",
        focusLabel: "Real confirmed planets join the same local stellar map without false orbit-scale precision.",
        objectId: "exoplanet-system:proxima-cen-1a11a204",
      },
      {
        id: "milky-way",
        eyebrow: "GALACTIC CONTEXT",
        title: "See where the Solar neighbourhood sits",
        body: "The Milky Way layer streams 199 measured VLBI maser tracers with their astrometric uncertainties, then overlays seven Reid et al. arm fits only across their observed azimuth ranges.",
        focusLabel: "Bright points are observations; faint corridors are uncertainty-aware fitted structure, with a labelled schematic fallback only if the binary fails.",
        objectId: "galactic:milky-way-structure",
      },
      {
        id: "andromeda",
        eyebrow: "DEEP SPACE",
        title: "Pull out to Andromeda",
        body: "Andromeda comes from the physical Local Volume Database layer: its supergalactic direction and distance are catalogue-derived, while the renderer logarithmically compresses radius.",
        focusLabel: "Solar context reaches a measured Local Group position without hiding the scale transform.",
        objectId: "deep:galaxy:andromeda-galaxy",
      },
      {
        id: "orion",
        eyebrow: "IMAGERY TARGET",
        title: "Finish at the Orion Nebula",
        body: "Orion is one of 3,004 selected OpenNGC objects streamed in integrity-checked J2000 sectors. Its catalogue direction is measured; the fixed angular shell deliberately makes no radial-distance claim.",
        focusLabel: "The dossier exposes catalogue fields, selection boundaries, adaptation licence, and the angular-shell limit.",
        objectId: "deep:nebula:orion-nebula",
      },
      {
        id: "desi-lightcone",
        eyebrow: "MEASURED REDSHIFT SURVEY",
        title: "End inside the DESI galaxy light cone",
        body: "The outermost layer contains 22,648 measured DR1 galaxies. Walls and voids emerge from the catalogue; no procedural sources or inferred filament links are added.",
        focusLabel: "The journey reaches a selection-aware view of measured large-scale structure.",
        objectId: "cosmological:observable-universe-model",
      },
    ],
  },
];

const SkyMapPage: FC<SkyMapPageProps> = ({
  onOpenSolarExplorer,
  onOpenImagery,
  initialObjectId = null,
  initialObjectToken = 0,
  qualityTier,
  adaptiveQualityEnabled,
  onAdaptiveQualityDrop,
  onScaleDomainChange,
  onObjectSelectionChange,
}) => {
  const nearbyStarCatalog = useNearbyStarCatalog();
  const isDirectExoplanetRoute = Boolean(initialObjectId?.startsWith("exoplanet-system:"));
  const isDirectDeepSpaceRoute = Boolean(initialObjectId?.startsWith("deep:"));
  const nearbyExoplanetCatalog = useNearbyExoplanets(
    nearbyStarCatalog.status === "ready" || isDirectExoplanetRoute,
    isDirectExoplanetRoute ? 0 : 1_500,
  );
  const openNgcCatalog = useOpenNgcCatalog(
    nearbyStarCatalog.status === "ready" || isDirectDeepSpaceRoute,
    isDirectDeepSpaceRoute ? 0 : 3_000,
  );
  const nearbyStars = nearbyStarCatalog.stars;
  const registry = useMemo(() => createSkyLayerRegistry(SKYMAP_LAYER_DEFINITIONS), []);
  const [state, dispatch] = useReducer(skyMapReducer, registry.definitions, createInitialSkyMapState);
  const [showIntro, setShowIntro] = useState(false);
  const [presentationMode, setPresentationMode] = useState(false);
  const [activeTourState, setActiveTourState] = useState<{ tourId: string; stepIndex: number } | null>(null);
  const [annotations, setAnnotations] = useState<UserSkyAnnotation[]>(() => readStoredAnnotations());
  const [routeTrail, setRouteTrail] = useState<SkyMapRouteStep[]>([]);
  const [cameraFlight, setCameraFlight] = useState<CameraFlightState | null>(null);
  const [cancelFlightToken, setCancelFlightToken] = useState(0);
  const appliedInitialObjectTokenRef = useRef<number | null>(null);
  const [layerPreset, setLayerPreset] = useState<SkyMapLayerPreset | null>(() => readStoredLayerPreset());

  const cancelCameraFlight = useCallback(() => {
    setCameraFlight(null);
    setCancelFlightToken((current) => current + 1);
  }, []);

  useEffect(() => {
    if (!cameraFlight) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.key !== "Escape" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isSkyMapShortcutTextTarget(event.target)
      ) {
        return;
      }
      event.preventDefault();
      cancelCameraFlight();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cameraFlight, cancelCameraFlight]);
  const catalogTargetEpochJulianYear = quantizeGaiaPropagationJulianYear(dateToJulianYear(state.time.currentTimeIso));
  const solarEphemeris = useStreamedSolarEphemeris(state.time.currentTimeIso, { includeOrbits: false });
  const activeLayerIds = useMemo(
    () => registry.definitions.filter((definition) => definition.status === "active").map((definition) => definition.id),
    [registry.definitions],
  );

  const solarLayerData = useMemo(() => {
    void solarEphemeris.revision;
    return createSolarSystemLayerData();
  }, [solarEphemeris.revision]);
  const galacticLayerData = useMemo(() => createGalacticStructureLayerData(), []);
  const interstellarProbesLayerData = useMemo(() => createInterstellarProbesLayerData(), []);
  const exoplanetSystemsLayerData = useMemo(
    () => createExoplanetSystemsLayerData(
      nearbyExoplanetCatalog.systems,
      nearbyExoplanetCatalog.manifest,
      nearbyExoplanetCatalog.loadedChunkIds,
      nearbyExoplanetCatalog.status,
      nearbyExoplanetCatalog.error,
    ),
    [
      nearbyExoplanetCatalog.error,
      nearbyExoplanetCatalog.loadedChunkIds,
      nearbyExoplanetCatalog.manifest,
      nearbyExoplanetCatalog.status,
      nearbyExoplanetCatalog.systems,
    ],
  );
  const deepSpaceLayerData = useMemo(
    () => createDeepSpaceLayerData(
      openNgcCatalog.objects,
      openNgcCatalog.manifest,
      openNgcCatalog.loadedChunkIds,
      openNgcCatalog.status,
      openNgcCatalog.error,
    ),
    [
      openNgcCatalog.error,
      openNgcCatalog.loadedChunkIds,
      openNgcCatalog.manifest,
      openNgcCatalog.objects,
      openNgcCatalog.status,
    ],
  );
  const localGroupLayerData = useMemo(() => createLocalGroupLayerData(), []);
  const constellationBoundariesLayerData = useMemo(() => createConstellationBoundariesLayerData(), []);
  const cosmologicalLayerData = useMemo(() => createCosmologicalStructureLayerData(), []);
  const annotationsLayerData = useMemo(() => createAnnotationsLayerData(annotations), [annotations]);
  const rawLayerData = useMemo<SkyLayerData[]>(
    () => [
      createLocalStarLayerData(nearbyStars, {
        version: nearbyStarCatalog.manifest?.catalog.version,
        catalogRecordCount: nearbyStarCatalog.manifest?.build.recordCount,
        chunkDefinitions: nearbyStarCatalog.manifest?.chunks,
        loadedChunkIds: nearbyStarCatalog.chunks.length
          ? new Set(nearbyStarCatalog.chunks.map((chunk) => chunk.chunkId))
          : undefined,
        error: nearbyStarCatalog.status === "error" ? nearbyStarCatalog.error : null,
      }),
      solarLayerData,
      interstellarProbesLayerData,
      exoplanetSystemsLayerData,
      constellationBoundariesLayerData,
      galacticLayerData,
      localGroupLayerData,
      ...deepSpaceLayerData,
      cosmologicalLayerData,
      annotationsLayerData,
    ],
    [
      annotationsLayerData,
      constellationBoundariesLayerData,
      cosmologicalLayerData,
      deepSpaceLayerData,
      exoplanetSystemsLayerData,
      galacticLayerData,
      interstellarProbesLayerData,
      localGroupLayerData,
      nearbyStarCatalog.chunks,
      nearbyStarCatalog.error,
      nearbyStarCatalog.manifest?.build.recordCount,
      nearbyStarCatalog.manifest?.chunks,
      nearbyStarCatalog.manifest?.catalog.version,
      nearbyStarCatalog.status,
      nearbyStars,
      solarLayerData,
    ],
  );
  const resolvedLayerData = useMemo(
    () => resolveSkyLayerDataForTime(registry, rawLayerData, state.time),
    [rawLayerData, registry, state.time],
  );
  const featuredObjectIds = useMemo(
    () =>
      [
        state.selection.selectedObjectId,
        state.selection.hoveredObjectId,
        state.selection.focusedObjectId,
      ].filter((objectId): objectId is SkyObjectId => Boolean(objectId)),
    [state.selection.focusedObjectId, state.selection.hoveredObjectId, state.selection.selectedObjectId],
  );
  const layerData = useMemo(
    () => applySkyMapFilters(resolvedLayerData, state.filters, featuredObjectIds),
    [featuredObjectIds, resolvedLayerData, state.filters],
  );
  const objectRegistry = useMemo(
    () => createSkyObjectRegistry(registry, layerData, state.layers),
    [layerData, registry, state.layers],
  );
  const objectCount = objectRegistry.records.length;
  const catalogPointChunks = state.layers[LOCAL_STARS_LAYER_ID]?.visible ? nearbyStarCatalog.chunks : [];
  const searchResults = useMemo(
    () => objectRegistry.search(state.search.query, 8),
    [objectRegistry, state.search.query],
  );
  const renderContext = useMemo(
    () => createSkyRenderContext(state.viewport, { featuredObjectIds, time: state.time }),
    [featuredObjectIds, state.time, state.viewport],
  );
  const renderables = useMemo(
    () => buildSkyMapRenderables(registry, layerData, state.layers, renderContext),
    [layerData, registry, renderContext, state.layers],
  );
  const pointRenderables = useMemo(() => renderables.filter(isSkyPointRenderable), [renderables]);
  const meshRenderables = useMemo(() => renderables.filter(isSkyMeshRenderable), [renderables]);
  const structureRenderables = useMemo(() => renderables.filter(isSkyStructureRenderable), [renderables]);
  const lineRenderables = useMemo(() => renderables.filter(isSkyLineRenderable), [renderables]);

  const recordRouteStep = useCallback(
    (objectId: SkyObjectId | null, intent: string) => {
      if (!objectId) return;
      const record = objectRegistry.byId.get(objectId);
      if (!record) return;
      const step: SkyMapRouteStep = {
        objectId,
        name: record.object.name,
        kind: record.object.kind,
        layerLabel: record.layerLabel,
        intent,
        selectedAt: new Date().toISOString(),
      };

      setRouteTrail((current) => [step, ...current.filter((item) => item.objectId !== objectId)].slice(0, 8));
    },
    [objectRegistry.byId],
  );

  const selectedObject = state.selection.selectedObjectId
    ? objectRegistry.byId.get(state.selection.selectedObjectId)?.object ?? null
    : null;

  useEffect(() => {
    const objectId = selectedObject?.id ?? state.selection.focusedObjectId;
    if (objectId?.startsWith("solar:")) {
      onScaleDomainChange("solar");
      return;
    }
    if (objectId?.startsWith("star:")) {
      onScaleDomainChange("stellar");
      return;
    }
    if (objectId?.startsWith("exoplanet-system:")) {
      onScaleDomainChange("stellar");
      return;
    }
    if (objectId?.startsWith("deep:")) {
      onScaleDomainChange("deep-space");
      return;
    }
    if (objectId?.startsWith("galactic:")) {
      onScaleDomainChange("galactic");
      return;
    }
    if (objectId?.startsWith("cosmological:")) {
      onScaleDomainChange("cosmological");
      return;
    }
    onScaleDomainChange(state.navigation.scaleBand === "solar-context" ? "solar" : "stellar");
  }, [onScaleDomainChange, selectedObject?.id, state.navigation.scaleBand, state.selection.focusedObjectId]);
  const hoveredObject = state.selection.hoveredObjectId
    ? objectRegistry.byId.get(state.selection.hoveredObjectId)?.object ?? null
    : null;
  const discoveryRecords = useMemo(
    () => {
      const ranked = objectRegistry.searchableRecords
        .filter((record) => record.object.kind !== "annotation" && record.layerVisible)
        .sort(
          (a, b) =>
            getSkyObjectImportanceScore(b.object) - getSkyObjectImportanceScore(a.object) ||
            a.object.name.localeCompare(b.object.name),
        );
      const categoryPicks = [
        ranked.find((record) => record.object.id.startsWith("solar:")),
        ranked.find((record) => record.object.kind === "galaxy"),
        ranked.find((record) => record.object.kind === "nebula"),
        ranked.find((record) => record.object.kind === "star-cluster"),
        ranked.find((record) => record.object.kind === "exoplanet-system"),
        ranked.find((record) => record.object.kind === "galactic-feature" || record.object.kind === "cosmological-feature"),
      ].filter((record): record is SkyObjectRegistryRecord => Boolean(record));
      const categoryKinds = ["planet", "moon", "galaxy", "nebula", "star-cluster", "asteroid", "exoplanet-system", "spacecraft"];
      const solarRecords = ranked.filter((record) => record.object.id.startsWith("solar:")).slice(0, 32);
      const categoryRecords = categoryKinds.flatMap((kind) =>
        ranked.filter((record) => record.object.kind === kind).slice(0, 18),
      );
      return Array.from(
        new Map([...categoryPicks, ...solarRecords, ...categoryRecords, ...ranked.slice(0, 24)].map((record) => [record.object.id, record])).values(),
      );
    },
    [objectRegistry.searchableRecords],
  );
  const relatedRecords = useMemo(
    () => buildSkyMapRelatedRecords(selectedObject, objectRegistry.records, objectRegistry.byId),
    [objectRegistry.byId, objectRegistry.records, selectedObject],
  );
  const activeTour = useMemo(
    () => SKYMAP_TOURS.find((tour) => tour.id === activeTourState?.tourId) ?? null,
    [activeTourState?.tourId],
  );
  const activeTourStep = activeTour && activeTourState ? activeTour.steps[activeTourState.stepIndex] : null;

  useEffect(() => {
    writeStoredAnnotations(annotations);
  }, [annotations]);

  const layerPanelItems = useMemo<SkyMapLayerPanelItem[]>(
    () => {
      const filteredCounts = new Map(layerData.map((data) => [data.layerId, data.objects.length]));
      const totalCounts = new Map(resolvedLayerData.map((data) => [data.layerId, data.objects.length]));
      const maxObjectCount = Math.max(
        1,
        ...registry.definitions
          .filter((definition) => definition.status !== "planned")
          .map((definition) => totalCounts.get(definition.id) ?? 0),
      );

      return registry.definitions
        .filter((definition) => definition.status !== "planned")
        .flatMap((definition) => {
          const layerState = state.layers[definition.id];
          if (!layerState) return [];
          const objectCount = filteredCounts.get(definition.id) ?? 0;
          const totalObjectCount = totalCounts.get(definition.id) ?? objectCount;
          return [
            {
              definition,
              state: layerState,
              objectCount,
              totalObjectCount,
              hiddenObjectCount: layerState.visible ? Math.max(0, totalObjectCount - objectCount) : totalObjectCount,
              density: totalObjectCount / maxObjectCount,
            },
          ];
        });
    },
    [layerData, registry.definitions, resolvedLayerData, state.layers],
  );
  const layerPresetSummary = useMemo(() => {
    if (!layerPreset) return null;
    const visibleCount = activeLayerIds.filter((layerId) => layerPreset.visibility[layerId]).length;
    return `${visibleCount}/${activeLayerIds.length} visible`;
  }, [activeLayerIds, layerPreset]);

  const viewportStatus = useMemo<SkyMapViewportStatus>(
    () => ({
      objectCount,
      visibleCount: renderables.length,
      activeLayerCount: layerPanelItems.filter((item) => item.definition.status === "active" && item.state.visible).length,
      catalogChunkCount: layerData.reduce((total, data) => total + (data.chunks?.length ?? 0), 0),
      activeChunkCount: new Set(
        [...pointRenderables, ...meshRenderables, ...structureRenderables, ...lineRenderables]
          .map((renderable) => renderable.sourceChunkId)
          .filter(Boolean),
      ).size,
      interactionCandidateCount:
        pointRenderables.filter((point) => point.interactive !== false).length +
        meshRenderables.filter((mesh) => mesh.interactive !== false).length,
      detailTier:
        pointRenderables.find((point) => point.lodTier)?.lodTier ??
        meshRenderables.find((mesh) => mesh.lodTier)?.lodTier ??
        structureRenderables.find((structure) => structure.lodTier)?.lodTier ??
        lineRenderables.find((line) => line.lodTier)?.lodTier ??
        "hidden",
      cameraDistance: state.viewport.cameraDistance,
      frame: state.viewport.frame,
      navigationMode: state.navigation.mode,
      scaleBand: state.navigation.scaleBand,
      catalogStreamStatus: nearbyStarCatalog.status,
      catalogLoadedRecords: nearbyStarCatalog.progress.loadedRecords,
      catalogTotalRecords: nearbyStarCatalog.progress.totalRecords,
      catalogSchedulingMode: nearbyStarCatalog.progress.schedulingMode,
      catalogActiveChunkId: nearbyStarCatalog.progress.activeChunkId,
      catalogLoadMessage: nearbyStarCatalog.message,
      catalogLoadError: nearbyStarCatalog.error,
      catalogPropagationStatus: nearbyStarCatalog.propagation.status,
      catalogRenderEpochJulianYear: nearbyStarCatalog.propagation.renderEpochJulianYear,
      catalogPropagationMessage: nearbyStarCatalog.propagation.message,
      catalogPropagationError: nearbyStarCatalog.propagation.error,
      solarEphemerisStatus: solarEphemeris.status,
      solarEphemerisYear: solarEphemeris.activeYear,
      solarEphemerisModel: solarEphemeris.positionsReady ? "VSOP87C Float64" : "Keplerian boot",
      solarEphemerisMessage: solarEphemeris.error ?? solarEphemeris.message,
    }),
    [
      layerData,
      layerPanelItems,
      lineRenderables,
      meshRenderables,
      nearbyStarCatalog.message,
      nearbyStarCatalog.error,
      nearbyStarCatalog.progress.loadedRecords,
      nearbyStarCatalog.progress.totalRecords,
      nearbyStarCatalog.progress.schedulingMode,
      nearbyStarCatalog.progress.activeChunkId,
      nearbyStarCatalog.propagation.error,
      nearbyStarCatalog.propagation.message,
      nearbyStarCatalog.propagation.renderEpochJulianYear,
      nearbyStarCatalog.propagation.status,
      nearbyStarCatalog.status,
      solarEphemeris.activeYear,
      solarEphemeris.error,
      solarEphemeris.message,
      solarEphemeris.positionsReady,
      solarEphemeris.status,
      objectCount,
      pointRenderables,
      renderables.length,
      structureRenderables,
      state.navigation.mode,
      state.navigation.scaleBand,
      state.viewport.cameraDistance,
      state.viewport.frame,
    ],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    // First-run modal removed with the explorer redesign; the guided tour remains in the top bar.
    void window.localStorage.getItem(SKYMAP_INTRO_KEY);
  }, []);

  useEffect(() => {
    if (state.time.playback !== "playing") return;
    let previousTick = performance.now();
    const intervalId = window.setInterval(() => {
      const nextTick = performance.now();
      dispatch({ type: "advanceTime", elapsedRealMs: nextTick - previousTick });
      previousTick = nextTick;
    }, SKYMAP_TIME_TICK_MS);

    return () => window.clearInterval(intervalId);
  }, [state.time.direction, state.time.playback, state.time.speedDaysPerSecond]);

  useEffect(() => {
    void setNearbyStarCatalogEpoch(catalogTargetEpochJulianYear);
  }, [catalogTargetEpochJulianYear]);

  const handleSelectObject = useCallback(
    (objectId: SkyObjectId | null) => {
      recordRouteStep(objectId, "viewport");
      const record = objectId ? objectRegistry.byId.get(objectId) : null;
      dispatch({
        type: "selectObject",
        objectId,
        scaleBand: record ? getSkyMapScaleBandForFrame(record.object.position.frame) : undefined,
      });
      onObjectSelectionChange?.(objectId);
    },
    [objectRegistry.byId, onObjectSelectionChange, recordRouteStep],
  );

  const handleHoverObject = useCallback((objectId: SkyObjectId | null) => {
    dispatch({ type: "hoverObject", objectId });
  }, []);

  const handleLayerVisibility = useCallback((layerId: SkyLayerId, visible: boolean) => {
    dispatch({ type: "setLayerVisibility", layerId, visible });
  }, []);

  const handleSoloLayer = useCallback(
    (layerId: SkyLayerId) => {
      dispatch({ type: "soloLayer", layerId, activeLayerIds });
    },
    [activeLayerIds],
  );

  const handleShowAllActiveLayers = useCallback(() => {
    dispatch({
      type: "setLayerVisibilityPreset",
      activeLayerIds,
      visibility: Object.fromEntries(activeLayerIds.map((layerId) => [layerId, true])),
    });
  }, [activeLayerIds]);

  const handleSaveLayerPreset = useCallback(() => {
    const preset: SkyMapLayerPreset = {
      createdAt: new Date().toISOString(),
      visibility: Object.fromEntries(activeLayerIds.map((layerId) => [layerId, Boolean(state.layers[layerId]?.visible)])),
    };
    setLayerPreset(preset);
    writeStoredLayerPreset(preset);
  }, [activeLayerIds, state.layers]);

  const handleApplyLayerPreset = useCallback(() => {
    if (!layerPreset) return;
    dispatch({ type: "setLayerVisibilityPreset", activeLayerIds, visibility: layerPreset.visibility });
  }, [activeLayerIds, layerPreset]);

  const handleClearLayerPreset = useCallback(() => {
    setLayerPreset(null);
    clearStoredLayerPreset();
  }, []);

  const handleFocusObject = useCallback((objectId: SkyObjectId) => {
    const record = objectRegistry.byId.get(objectId);
    dispatch({
      type: "focusObject",
      objectId,
      intent: "manual-focus",
      scaleBand: record ? getSkyMapScaleBandForFrame(record.object.position.frame) : undefined,
    });
  }, [objectRegistry.byId]);

  const handleSearchQueryChange = useCallback((query: string) => {
    dispatch({ type: "setSearchQuery", query });
  }, []);

  const handleSelectSearchResult = useCallback(
    (result: SkyObjectSearchResult) => {
      const { object } = result.record;
      const layerState = state.layers[result.record.layerId];
      if (layerState && !layerState.visible) {
        dispatch({ type: "setLayerVisibility", layerId: result.record.layerId, visible: true });
      }
      recordRouteStep(object.id, "search");
      dispatch({ type: "setSearchQuery", query: object.name });
      dispatch({
        type: "selectObject",
        objectId: object.id,
        intent: "search-result",
        scaleBand: getSkyMapScaleBandForFrame(object.position.frame),
      });
      onObjectSelectionChange?.(object.id);
    },
    [onObjectSelectionChange, recordRouteStep, state.layers],
  );

  const handleSelectDiscoveryRecord = useCallback(
    (record: SkyObjectRegistryRecord) => {
      const layerState = state.layers[record.layerId];
      if (layerState && !layerState.visible) {
        dispatch({ type: "setLayerVisibility", layerId: record.layerId, visible: true });
      }
      recordRouteStep(record.object.id, "discovery");
      dispatch({ type: "setSearchQuery", query: "" });
      dispatch({
        type: "selectObject",
        objectId: record.object.id,
        intent: "discovery",
        scaleBand: getSkyMapScaleBandForFrame(record.object.position.frame),
      });
      onObjectSelectionChange?.(record.object.id);
    },
    [onObjectSelectionChange, recordRouteStep, state.layers],
  );

  const handleOpenSolarObject = useCallback(
    (object: SkyObject) => {
      const target = toSolarLaunchTarget(object, getSkyMapDateKey(state.time));
      if (target) {
        onOpenSolarExplorer(target);
      }
    },
    [onOpenSolarExplorer, state.time],
  );

  useEffect(() => {
    if (appliedInitialObjectTokenRef.current === initialObjectToken) return;
    if (!initialObjectId) {
      appliedInitialObjectTokenRef.current = initialObjectToken;
      dispatch({ type: "setSearchQuery", query: "" });
      dispatch({ type: "selectObject", objectId: null });
      return;
    }
    const record = objectRegistry.byId.get(initialObjectId);
    if (!record) return;
    appliedInitialObjectTokenRef.current = initialObjectToken;
    const layerState = state.layers[record.layerId];
    if (layerState && !layerState.visible) {
      dispatch({ type: "setLayerVisibility", layerId: record.layerId, visible: true });
    }
    recordRouteStep(record.object.id, "command");
    dispatch({ type: "setSearchQuery", query: record.object.name });
    dispatch({
      type: "selectObject",
      objectId: record.object.id,
      intent: "search-result",
      scaleBand: getSkyMapScaleBandForFrame(record.object.position.frame),
    });
  }, [initialObjectId, initialObjectToken, objectRegistry.byId, recordRouteStep, state.layers]);

  const handleExploreRandom = useCallback(() => {
    const pool = discoveryRecords.length ? discoveryRecords : objectRegistry.searchableRecords;
    if (!pool.length) return;
    const record = pool[Math.floor(Math.random() * pool.length)];
    handleSelectDiscoveryRecord(record);
  }, [discoveryRecords, handleSelectDiscoveryRecord, objectRegistry.searchableRecords]);

  const handleViewportDistanceChange = useCallback((cameraDistance: number) => {
    dispatch({ type: "setViewport", viewport: { cameraDistance } });
  }, []);

  const handleManualNavigation = useCallback(() => {
    dispatch({ type: "setNavigationMode", mode: "free-explore", intent: "manual-control" });
  }, []);

  const handleResetNavigationView = useCallback(() => {
    dispatch({ type: "resetNavigationView" });
  }, []);

  const handleTimePlaybackToggle = useCallback(() => {
    dispatch({ type: "setTimePlayback", playback: state.time.playback === "playing" ? "paused" : "playing" });
  }, [state.time.playback]);

  const handleTimeSpeedChange = useCallback((speedDaysPerSecond: number) => {
    dispatch({ type: "setTimeSpeed", speedDaysPerSecond });
  }, []);

  const handleTimeDirectionChange = useCallback((direction: TimeDirection) => {
    dispatch({ type: "setTimeDirection", direction });
  }, []);

  const handleTimeDateChange = useCallback((dateKey: string) => {
    dispatch({ type: "setTimeDate", dateKey });
  }, []);

  const handleTimeStep = useCallback((days: number) => {
    dispatch({ type: "stepTime", days });
  }, []);

  const handleResetTimeToNow = useCallback(() => {
    dispatch({ type: "resetTimeToNow" });
  }, []);

  const handleAddAnnotation = useCallback(
    (draft: { label: string; body: string }) => {
      if (!selectedObject || selectedObject.kind === "annotation") return;
      const label = draft.label.trim() || `Note: ${selectedObject.name}`;
      const body = draft.body.trim() || `Map note anchored to ${selectedObject.name}.`;
      const id = `${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
      const createdAt = new Date().toISOString();
      const annotation: UserSkyAnnotation = {
        id,
        label,
        body,
        position: copySkyPosition(selectedObject.position),
        targetObjectId: selectedObject.id,
        targetName: selectedObject.name,
        createdAt,
        timeKey: getSkyMapDateKey(state.time),
      };

      setAnnotations((prev) => [annotation, ...prev].slice(0, 24));
      setRouteTrail((current) =>
        [
          {
            objectId: `annotation:${id}`,
            name: label,
            kind: "annotation",
            layerLabel: "Annotations",
            intent: "annotation",
            selectedAt: createdAt,
          },
          ...current.filter((item) => item.objectId !== `annotation:${id}`),
        ].slice(0, 8),
      );
      dispatch({ type: "setLayerVisibility", layerId: ANNOTATIONS_LAYER_ID, visible: true });
      dispatch({ type: "selectObject", objectId: `annotation:${id}`, intent: "discovery" });
      onObjectSelectionChange?.(`annotation:${id}`);
    },
    [onObjectSelectionChange, selectedObject, state.time],
  );

  const handleSelectAnnotation = useCallback(
    (annotationId: string) => {
      recordRouteStep(`annotation:${annotationId}`, "annotation");
      dispatch({ type: "setLayerVisibility", layerId: ANNOTATIONS_LAYER_ID, visible: true });
      dispatch({ type: "selectObject", objectId: `annotation:${annotationId}`, intent: "search-result" });
      onObjectSelectionChange?.(`annotation:${annotationId}`);
    },
    [onObjectSelectionChange, recordRouteStep],
  );

  const handleDeleteAnnotation = useCallback(
    (annotationId: string) => {
      setAnnotations((prev) => prev.filter((annotation) => annotation.id !== annotationId));
      if (state.selection.selectedObjectId === `annotation:${annotationId}`) {
        dispatch({ type: "selectObject", objectId: null });
        onObjectSelectionChange?.(null);
      }
    },
    [onObjectSelectionChange, state.selection.selectedObjectId],
  );

  const handleFilterChange = useCallback((filters: Partial<typeof state.filters>) => {
    dispatch({ type: "setFilters", filters });
  }, []);

  const handleResetFilters = useCallback(() => {
    dispatch({ type: "resetFilters" });
  }, []);

  const handleSelectRouteStep = useCallback(
    (step: SkyMapRouteStep) => {
      const record = objectRegistry.byId.get(step.objectId);
      if (record) {
        const layerState = state.layers[record.layerId];
        if (layerState && !layerState.visible) {
          dispatch({ type: "setLayerVisibility", layerId: record.layerId, visible: true });
        }
      }
      recordRouteStep(step.objectId, "route trail");
      dispatch({ type: "setSearchQuery", query: "" });
      dispatch({
        type: "selectObject",
        objectId: step.objectId,
        intent: "search-result",
        scaleBand: record ? getSkyMapScaleBandForFrame(record.object.position.frame) : undefined,
      });
      onObjectSelectionChange?.(step.objectId);
    },
    [objectRegistry.byId, onObjectSelectionChange, recordRouteStep, state.layers],
  );

  const handleClearRouteTrail = useCallback(() => {
    setRouteTrail([]);
  }, []);

  const markIntroSeen = () => {
    setShowIntro(false);
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SKYMAP_INTRO_KEY, "true");
  };

  const revealTourLayerForObject = (objectId: SkyObjectId) => {
    const layerId = objectRegistry.byId.get(objectId)?.layerId ??
      (objectId.startsWith("solar:")
        ? "solar.system-bodies"
        : objectId.startsWith("deep:galaxy:")
          ? "deep-space.galaxies"
          : objectId.startsWith("deep:nebula:")
            ? "deep-space.nebulae"
            : objectId.startsWith("deep:cluster:")
              ? "deep-space.clusters"
              : objectId.startsWith("star:")
                ? "stars.local-neighborhood"
                : objectId.startsWith("galactic:")
                  ? "galactic.milky-way-structure"
                  : objectId.startsWith("cosmological:")
                  ? "cosmological.large-scale-structure"
                  : null);

    if (layerId) {
      dispatch({ type: "setLayerVisibility", layerId: layerId as SkyLayerId, visible: true });
    }
  };

  const applySkyMapTourStep = (step: SkyMapTourStep) => {
    dispatch({ type: "setTimePlayback", playback: "paused" });
    dispatch({ type: "resetFilters" });

    if (step.resetView) {
      dispatch({ type: "setSearchQuery", query: "" });
      dispatch({ type: "resetNavigationView" });
      return;
    }

    if (!step.objectId) return;
    revealTourLayerForObject(step.objectId);
    recordRouteStep(step.objectId, "tour");
    dispatch({ type: "setSearchQuery", query: "" });
    const record = objectRegistry.byId.get(step.objectId);
    dispatch({
      type: "selectObject",
      objectId: step.objectId,
      intent: "discovery",
      scaleBand: record ? getSkyMapScaleBandForFrame(record.object.position.frame) : undefined,
    });
    onObjectSelectionChange?.(step.objectId);
  };

  const startSkyMapTour = (tourId = SKYMAP_TOURS[0].id) => {
    const tour = SKYMAP_TOURS.find((item) => item.id === tourId) ?? SKYMAP_TOURS[0];
    markIntroSeen();
    setPresentationMode(true);
    setActiveTourState({ tourId: tour.id, stepIndex: 0 });
    applySkyMapTourStep(tour.steps[0]);
  };

  const moveSkyMapTour = (direction: 1 | -1) => {
    if (!activeTour || !activeTourState) return;
    const nextIndex = activeTourState.stepIndex + direction;
    if (nextIndex < 0) return;
    if (nextIndex >= activeTour.steps.length) {
      setActiveTourState(null);
      return;
    }
    setActiveTourState({ tourId: activeTour.id, stepIndex: nextIndex });
    applySkyMapTourStep(activeTour.steps[nextIndex]);
  };

  const stopSkyMapTour = () => {
    setActiveTourState(null);
  };

  return (
    <section className={`skymap-page ${presentationMode ? "is-presentation" : ""}`} aria-labelledby="skymap-title">
      <SkyMapTopBar
        onOpenSolarExplorer={onOpenSolarExplorer}
        presentationMode={presentationMode}
        onStartTour={() => startSkyMapTour()}
        onTogglePresentation={() => setPresentationMode((prev) => !prev)}
      />
      <div className="skymap-workspace">
        <div className="skymap-main">
          <div className="skymap-map-frame">
            <SkyMapViewport
              renderables={renderables}
              catalogChunks={catalogPointChunks}
              catalogPointCount={nearbyStarCatalog.progress.loadedRecords}
              exoplanetCatalogStatus={{
                status: nearbyExoplanetCatalog.status,
                loadedPlanetCount: nearbyExoplanetCatalog.loadedPlanetCount,
                loadedSystemCount: nearbyExoplanetCatalog.systems.length,
                loadedChunkCount: nearbyExoplanetCatalog.loadedChunkIds.length,
                totalPlanetCount: nearbyExoplanetCatalog.manifest?.selection.planetCount ?? 0,
                totalSystemCount: nearbyExoplanetCatalog.manifest?.selection.systemCount ?? 0,
                totalChunkCount: nearbyExoplanetCatalog.manifest?.chunks.length ?? 0,
                message: nearbyExoplanetCatalog.error ?? nearbyExoplanetCatalog.message,
              }}
              openNgcCatalogStatus={{
                status: openNgcCatalog.status,
                loadedObjectCount: openNgcCatalog.objects.length,
                loadedChunkCount: openNgcCatalog.loadedChunkIds.length,
                totalObjectCount: openNgcCatalog.manifest?.selection.objectCount ?? 0,
                totalChunkCount: openNgcCatalog.manifest?.chunks.length ?? 0,
                message: openNgcCatalog.error ?? openNgcCatalog.message,
              }}
              selectedObjectId={state.selection.selectedObjectId}
              hoveredObjectId={state.selection.hoveredObjectId}
              focusedObjectId={state.selection.focusedObjectId}
              focusRequestId={state.selection.focusRequestId}
              cancelFlightToken={cancelFlightToken}
              navigationState={state.navigation}
              objectCount={objectCount}
              cameraDistance={state.viewport.cameraDistance}
              onSelectObject={handleSelectObject}
              onHoverObject={handleHoverObject}
              onViewportDistanceChange={handleViewportDistanceChange}
              onManualNavigation={handleManualNavigation}
              onCameraFlightChange={setCameraFlight}
              timePlayback={state.time.playback}
              qualityTier={qualityTier}
              adaptiveQualityEnabled={adaptiveQualityEnabled}
              onAdaptiveQualityDrop={onAdaptiveQualityDrop}
            />
            <CameraFlightStatus flight={cameraFlight} onCancel={cancelCameraFlight} />
            <SkyMapStatusStrip viewportStatus={viewportStatus} />
          </div>
        </div>
        <SkyMapControlRail
          selectedObject={selectedObject}
          hoveredObject={hoveredObject}
          viewportStatus={viewportStatus}
          layers={layerPanelItems}
          routeTrail={routeTrail}
          searchQuery={state.search.query}
          searchResults={searchResults}
          registryObjectCount={objectRegistry.records.length}
          discoveryRecords={discoveryRecords}
          relatedRecords={relatedRecords}
          annotations={annotations}
          filters={state.filters}
          timeState={state.time}
          stellarPropagation={nearbyStarCatalog.propagation}
          navigationState={state.navigation}
          layerPresetSummary={layerPresetSummary}
          onSetLayerVisibility={handleLayerVisibility}
          onSoloLayer={handleSoloLayer}
          onShowAllActiveLayers={handleShowAllActiveLayers}
          onSaveLayerPreset={handleSaveLayerPreset}
          onApplyLayerPreset={handleApplyLayerPreset}
          onClearLayerPreset={handleClearLayerPreset}
          onFocusObject={handleFocusObject}
          onSelectRouteStep={handleSelectRouteStep}
          onClearRouteTrail={handleClearRouteTrail}
          onSearchQueryChange={handleSearchQueryChange}
          onSelectSearchResult={handleSelectSearchResult}
          onSelectDiscoveryRecord={handleSelectDiscoveryRecord}
          onAddAnnotation={handleAddAnnotation}
          onSelectAnnotation={handleSelectAnnotation}
          onDeleteAnnotation={handleDeleteAnnotation}
          onOpenSolarObject={handleOpenSolarObject}
          onOpenImagery={onOpenImagery}
          onFilterChange={handleFilterChange}
          onResetFilters={handleResetFilters}
          onResetNavigationView={handleResetNavigationView}
          onToggleTimePlayback={handleTimePlaybackToggle}
          onSetTimeSpeed={handleTimeSpeedChange}
          onSetTimeDirection={handleTimeDirectionChange}
          onSetTimeDate={handleTimeDateChange}
          onStepTime={handleTimeStep}
          onResetTimeToNow={handleResetTimeToNow}
        />
      </div>
      {showIntro ? (
        <ExperienceIntroOverlay
          eyebrow="FIRST FLIGHT"
          title="SkyMap is the universe navigation surface"
          body="Search by intent, jump through layers, inspect real catalog objects, and move between solar, stellar, and deep-space contexts without changing tools."
          highlights={["Searchable object index", "Layered universe map", "Search to focus", "Deep-space imagery"]}
          primaryAction={{ label: "Start guided tour", onClick: () => startSkyMapTour() }}
          secondaryAction={{ label: "Explore manually", onClick: markIntroSeen }}
          tertiaryAction={{
            label: "Presentation mode",
            onClick: () => {
              markIntroSeen();
              setPresentationMode(true);
              dispatch({ type: "resetNavigationView" });
            },
          }}
        />
      ) : null}

      {activeTour && activeTourStep ? (
        <GuidedTourPanel
          tour={activeTour}
          step={activeTourStep}
          stepIndex={activeTourState?.stepIndex ?? 0}
          presentationMode={presentationMode}
          onPrevious={() => moveSkyMapTour(-1)}
          onNext={() => moveSkyMapTour(1)}
          onStop={stopSkyMapTour}
          onTogglePresentation={() => setPresentationMode((prev) => !prev)}
        />
      ) : null}

      {presentationMode && !activeTour ? (
        <PresentationHud
          eyebrow="PRESENTATION MODE"
          title="SkyMap"
          body="Controls are reduced so the staged universe map, selected object, and camera movement stay center stage."
          actions={[
            { label: "Start tour", onClick: () => startSkyMapTour(), variant: "primary" },
            { label: "Random object", onClick: handleExploreRandom },
            { label: "Exit", onClick: () => setPresentationMode(false) },
          ]}
        />
      ) : null}
    </section>
  );
};

export default SkyMapPage;
