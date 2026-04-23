import { useCallback, useEffect, useMemo, useReducer, useState, type FC } from "react";
import {
  ExperienceIntroOverlay,
  GuidedTourPanel,
  PresentationHud,
  type GuidedTour,
  type GuidedTourStep,
} from "../../components/experience/GuidedExperience";
import { useNearbyStars } from "../starmap/useNearbyStars";
import {
  createSkyLayerRegistry,
  buildSkyMapRenderables,
  resolveSkyLayerDataForTime,
  type SkyLayerData,
  type SkyLayerId,
} from "./core/layers";
import { applySkyMapFilters } from "./core/filters";
import { createSkyObjectRegistry, type SkyObjectRegistryRecord, type SkyObjectSearchResult } from "./core/objectRegistry";
import { getSkyObjectImportanceScore, isDeepSkyObject, type SkyObjectId } from "./core/objects";
import { createSkyRenderContext, isSkyMeshRenderable, isSkyPointRenderable } from "./core/renderers";
import { createInitialSkyMapState, skyMapReducer, type SkyMapViewportStatus } from "./core/state";
import { SKYMAP_TIME_TICK_MS } from "./core/time";
import { createDeepSpaceLayerData } from "./layers/deepSpaceLayer";
import { createLocalStarLayerData } from "./layers/localStarsLayer";
import { SKYMAP_LAYER_DEFINITIONS } from "./layers/registry";
import { createSolarSystemLayerData } from "./layers/solarSystemLayer";
import SkyMapViewport from "./SkyMapViewport";
import { SkyMapControlRail, SkyMapStatusStrip, SkyMapTopBar, type SkyMapLayerPanelItem } from "./SkyMapPanels";

interface SkyMapPageProps {
  onOpenSolarExplorer: () => void;
}

const SKYMAP_INTRO_KEY = "spaceviewer.skymap.finalExperienceSeen.v1";

type SkyMapTourStep = GuidedTourStep & {
  objectId?: SkyObjectId;
  resetView?: boolean;
};

const SKYMAP_TOURS: GuidedTour<SkyMapTourStep>[] = [
  {
    id: "cosmic-orientation",
    label: "Discover SkyMap",
    description: "A guided jump through the staged map, from the solar bridge to deep-space landmarks.",
    steps: [
      {
        id: "overview",
        eyebrow: "SKYMAP TOUR",
        title: "Start with the whole loaded universe",
        body: "SkyMap is a staged navigation surface. Solar bodies, stars, galaxies, nebulae, and clusters share one searchable object model.",
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
        id: "andromeda",
        eyebrow: "DEEP SPACE",
        title: "Pull out to Andromeda",
        body: "Deep-space landmarks are symbolic staged placements with real catalog identity, imagery, search metadata, and details.",
        focusLabel: "Wow moment: solar context to galaxy context in one flow.",
        objectId: "deep:galaxy:andromeda-galaxy",
      },
      {
        id: "orion",
        eyebrow: "IMAGERY TARGET",
        title: "Finish at the Orion Nebula",
        body: "Nebulae and other showcase objects are first-class layers, so discovery and inspection stay coherent across object families.",
        focusLabel: "The details panel becomes the knowledge layer.",
        objectId: "deep:nebula:orion-nebula",
      },
    ],
  },
];

const SkyMapPage: FC<SkyMapPageProps> = ({ onOpenSolarExplorer }) => {
  const nearbyStars = useNearbyStars();
  const registry = useMemo(() => createSkyLayerRegistry(SKYMAP_LAYER_DEFINITIONS), []);
  const [state, dispatch] = useReducer(skyMapReducer, registry.definitions, createInitialSkyMapState);
  const [showIntro, setShowIntro] = useState(false);
  const [presentationMode, setPresentationMode] = useState(false);
  const [activeTourState, setActiveTourState] = useState<{ tourId: string; stepIndex: number } | null>(null);

  const solarLayerData = useMemo(() => createSolarSystemLayerData(), []);
  const deepSpaceLayerData = useMemo(() => createDeepSpaceLayerData(), []);
  const rawLayerData = useMemo<SkyLayerData[]>(
    () => [createLocalStarLayerData(nearbyStars), solarLayerData, ...deepSpaceLayerData],
    [deepSpaceLayerData, nearbyStars, solarLayerData],
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

  const selectedObject = state.selection.selectedObjectId
    ? objectRegistry.byId.get(state.selection.selectedObjectId)?.object ?? null
    : null;
  const hoveredObject = state.selection.hoveredObjectId
    ? objectRegistry.byId.get(state.selection.hoveredObjectId)?.object ?? null
    : null;
  const discoveryRecords = useMemo(
    () =>
      objectRegistry.searchableRecords
        .filter((record) => record.layerVisible && getSkyObjectImportanceScore(record.object) >= 64)
        .sort(
          (a, b) =>
            getSkyObjectImportanceScore(b.object) - getSkyObjectImportanceScore(a.object) ||
            a.object.name.localeCompare(b.object.name),
        )
        .slice(0, 6),
    [objectRegistry.searchableRecords],
  );
  const relatedRecords = useMemo(() => {
    if (!isDeepSkyObject(selectedObject)) return [];
    return (selectedObject.scientific?.relatedObjectIds ?? [])
      .map((objectId) => objectRegistry.byId.get(objectId))
      .filter((record): record is SkyObjectRegistryRecord => Boolean(record));
  }, [objectRegistry.byId, selectedObject]);
  const activeTour = useMemo(
    () => SKYMAP_TOURS.find((tour) => tour.id === activeTourState?.tourId) ?? null,
    [activeTourState?.tourId],
  );
  const activeTourStep = activeTour && activeTourState ? activeTour.steps[activeTourState.stepIndex] : null;

  const layerPanelItems = useMemo<SkyMapLayerPanelItem[]>(
    () =>
      registry.definitions
        .filter((definition) => definition.status !== "planned")
        .flatMap((definition) => {
          const layerState = state.layers[definition.id];
          if (!layerState) return [];
          return [
            {
              definition,
              state: layerState,
              objectCount: layerData.find((data) => data.layerId === definition.id)?.objects.length ?? 0,
            },
          ];
        }),
    [layerData, registry.definitions, state.layers],
  );

  const viewportStatus = useMemo<SkyMapViewportStatus>(
    () => ({
      objectCount,
      visibleCount: renderables.length,
      activeLayerCount: layerPanelItems.filter((item) => item.definition.status === "active" && item.state.visible).length,
      catalogChunkCount: layerData.reduce((total, data) => total + (data.chunks?.length ?? 0), 0),
      activeChunkCount: new Set(
        [...pointRenderables, ...meshRenderables].map((renderable) => renderable.sourceChunkId).filter(Boolean),
      ).size,
      interactionCandidateCount:
        pointRenderables.filter((point) => point.interactive !== false).length +
        meshRenderables.filter((mesh) => mesh.interactive !== false).length,
      detailTier:
        pointRenderables.find((point) => point.lodTier)?.lodTier ??
        meshRenderables.find((mesh) => mesh.lodTier)?.lodTier ??
        "hidden",
      cameraDistance: state.viewport.cameraDistance,
      frame: state.viewport.frame,
      navigationMode: state.navigation.mode,
      scaleBand: state.navigation.scaleBand,
    }),
    [
      layerData,
      layerPanelItems,
      meshRenderables,
      objectCount,
      pointRenderables,
      renderables.length,
      state.navigation.mode,
      state.navigation.scaleBand,
      state.viewport.cameraDistance,
      state.viewport.frame,
    ],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.localStorage.getItem(SKYMAP_INTRO_KEY)) {
      setShowIntro(true);
    }
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
  }, [state.time.playback, state.time.speedDaysPerSecond]);

  const handleSelectObject = useCallback((objectId: SkyObjectId | null) => {
    dispatch({ type: "selectObject", objectId });
  }, []);

  const handleHoverObject = useCallback((objectId: SkyObjectId | null) => {
    dispatch({ type: "hoverObject", objectId });
  }, []);

  const handleLayerVisibility = useCallback((layerId: SkyLayerId, visible: boolean) => {
    dispatch({ type: "setLayerVisibility", layerId, visible });
  }, []);

  const handleFocusObject = useCallback((objectId: SkyObjectId) => {
    dispatch({ type: "focusObject", objectId, intent: "manual-focus" });
  }, []);

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
      dispatch({ type: "setSearchQuery", query: object.name });
      dispatch({ type: "selectObject", objectId: object.id, intent: "search-result" });
    },
    [state.layers],
  );

  const handleSelectDiscoveryRecord = useCallback(
    (record: SkyObjectRegistryRecord) => {
      const layerState = state.layers[record.layerId];
      if (layerState && !layerState.visible) {
        dispatch({ type: "setLayerVisibility", layerId: record.layerId, visible: true });
      }
      dispatch({ type: "setSearchQuery", query: "" });
      dispatch({ type: "selectObject", objectId: record.object.id, intent: "discovery" });
    },
    [state.layers],
  );

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

  const handleTimeDateChange = useCallback((dateKey: string) => {
    dispatch({ type: "setTimeDate", dateKey });
  }, []);

  const handleTimeStep = useCallback((days: number) => {
    dispatch({ type: "stepTime", days });
  }, []);

  const handleResetTimeToNow = useCallback(() => {
    dispatch({ type: "resetTimeToNow" });
  }, []);

  const handleFilterChange = useCallback((filters: Partial<typeof state.filters>) => {
    dispatch({ type: "setFilters", filters });
  }, []);

  const handleResetFilters = useCallback(() => {
    dispatch({ type: "resetFilters" });
  }, []);

  const markIntroSeen = () => {
    setShowIntro(false);
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SKYMAP_INTRO_KEY, "true");
  };

  const revealTourLayerForObject = (objectId: SkyObjectId) => {
    const layerId =
      objectId.startsWith("solar:")
        ? "solar.system-bodies"
        : objectId.startsWith("deep:galaxy:")
          ? "deep-space.galaxies"
          : objectId.startsWith("deep:nebula:")
            ? "deep-space.nebulae"
            : objectId.startsWith("deep:cluster:")
              ? "deep-space.clusters"
              : objectId.startsWith("star:")
                ? "stars.local-neighborhood"
                : null;

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
    dispatch({ type: "setSearchQuery", query: "" });
    dispatch({ type: "selectObject", objectId: step.objectId, intent: "discovery" });
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
          <SkyMapViewport
            renderables={renderables}
            selectedObjectId={state.selection.selectedObjectId}
            hoveredObjectId={state.selection.hoveredObjectId}
            focusedObjectId={state.selection.focusedObjectId}
            focusRequestId={state.selection.focusRequestId}
            navigationState={state.navigation}
            objectCount={objectCount}
            cameraDistance={state.viewport.cameraDistance}
            onSelectObject={handleSelectObject}
            onHoverObject={handleHoverObject}
          onViewportDistanceChange={handleViewportDistanceChange}
          onManualNavigation={handleManualNavigation}
          timePlayback={state.time.playback}
        />
          <SkyMapStatusStrip viewportStatus={viewportStatus} />
        </div>
        <SkyMapControlRail
          selectedObject={selectedObject}
          hoveredObject={hoveredObject}
          viewportStatus={viewportStatus}
          layers={layerPanelItems}
          searchQuery={state.search.query}
          searchResults={searchResults}
          registryObjectCount={objectRegistry.records.length}
          discoveryRecords={discoveryRecords}
          relatedRecords={relatedRecords}
          filters={state.filters}
          timeState={state.time}
          navigationState={state.navigation}
          onSetLayerVisibility={handleLayerVisibility}
          onFocusObject={handleFocusObject}
          onSearchQueryChange={handleSearchQueryChange}
          onSelectSearchResult={handleSelectSearchResult}
          onSelectDiscoveryRecord={handleSelectDiscoveryRecord}
          onExploreRandom={handleExploreRandom}
          onFilterChange={handleFilterChange}
          onResetFilters={handleResetFilters}
          onResetNavigationView={handleResetNavigationView}
          onToggleTimePlayback={handleTimePlaybackToggle}
          onSetTimeSpeed={handleTimeSpeedChange}
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
