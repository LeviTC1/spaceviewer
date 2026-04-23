import { FC, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import SolarScene from "./SolarScene";
import SolarDetailsPanel from "./SolarDetailsPanel";
import SolarTopBar from "./SolarTopBar";
import SolarTimeline from "./SolarTimeline";
import SolarScaleLegend from "./SolarScaleLegend";
import {
  ExperienceIntroOverlay,
  GuidedTourPanel,
  PresentationHud,
  type GuidedTour,
  type GuidedTourStep,
} from "../../components/experience/GuidedExperience";
import { PLANETS, type PlanetId, type SolarScaleMode } from "./solarData";
import { MOONS, type MoonVisibilityMode } from "./moonData";
import type { AsteroidBeltMode } from "./asteroids/asteroidGenerator";
import type { TextureQuality } from "./textures/textureCatalog";
import { solarTextureManager } from "./textures/solarTextureManager";
import { preloadSolarTextures } from "./textures/preloadSolarTextures";
import { useSolarTime } from "./useSolarTime";
import { useCameraBookmarks, type CameraBookmark } from "./useCameraBookmarks";
import { DAY_MS, toUtcDateKey } from "../time/timeUtils";
import type { SolarSearchResult } from "./SolarSearch";
import type { SolarNavigationMode } from "./solarNavigation";

interface SolarSystemPageProps {
  onExploreImagery: (query: string) => void;
  initialBookmark?: CameraBookmark | null;
  initialBookmarkToken?: number;
}

const HOW_TO_KEY = "spaceviewer.solar.finalExperienceSeen.v1";
const BIRTHDAY_KEY = "spaceviewer.solar.birthday";

type SolarTourTarget =
  | { kind: "sun"; navigationMode?: SolarNavigationMode }
  | { kind: "planet"; planetId: PlanetId; navigationMode?: SolarNavigationMode }
  | { kind: "moon"; moonId: string; navigationMode?: SolarNavigationMode }
  | { kind: "belt"; navigationMode?: SolarNavigationMode }
  | { kind: "overview"; navigationMode: SolarNavigationMode };

type SolarTourStep = GuidedTourStep & {
  target: SolarTourTarget;
};

const SOLAR_TOURS: GuidedTour<SolarTourStep>[] = [
  {
    id: "grand-tour",
    label: "Tour the Solar System",
    description: "A cinematic path through the Sun, Earth, giant planets, moons, and the orbital map.",
    steps: [
      {
        id: "sun",
        eyebrow: "SOLAR TOUR",
        title: "Begin at the Sun",
        body: "The shared solar provider anchors everything at the heliocentric origin, so this is the cleanest starting point for the whole atlas.",
        focusLabel: "Wow moment: the system starts from the light source.",
        target: { kind: "sun", navigationMode: "overview" },
      },
      {
        id: "earth",
        eyebrow: "INNER SYSTEM",
        title: "Jump to Earth",
        body: "Selection, focus, camera framing, and the knowledge panel all stay in one real interaction flow.",
        focusLabel: "Search, click, and tour actions use the same focus path.",
        target: { kind: "planet", planetId: "earth", navigationMode: "planetary" },
      },
      {
        id: "jupiter",
        eyebrow: "MOON SYSTEM",
        title: "Reveal Jupiter and its moons",
        body: "Planetary system mode frames large planets with their major moons so they feel like systems, not isolated props.",
        focusLabel: "Wow moment: Jupiter becomes a miniature world system.",
        target: { kind: "planet", planetId: "jupiter", navigationMode: "planetary" },
      },
      {
        id: "europa",
        eyebrow: "MOON DETAIL",
        title: "Drop into Europa",
        body: "Moons participate in the same selection and focus model as planets, with parent context preserved in the details panel.",
        focusLabel: "Parent context stays visible through the route.",
        target: { kind: "moon", moonId: "europa", navigationMode: "planetary" },
      },
      {
        id: "saturn",
        eyebrow: "SHOWCASE",
        title: "Saturn ring pass",
        body: "The tour uses the existing Saturn rendering and camera framing so the rings remain a real scene feature, not a fake cutaway.",
        focusLabel: "Wow moment: the ring system gets a deliberate showcase.",
        target: { kind: "planet", planetId: "saturn", navigationMode: "planetary" },
      },
      {
        id: "ecliptic",
        eyebrow: "SYSTEM MAP",
        title: "Pull out to the orbital plane",
        body: "Top-down ecliptic mode turns the scene back into a readable solar map, making orbit structure and compressed scale easier to understand.",
        focusLabel: "The finale is a real map view, not a separate animation.",
        target: { kind: "belt", navigationMode: "ecliptic" },
      },
    ],
  },
];
const SolarSystemPage: FC<SolarSystemPageProps> = ({
  onExploreImagery,
  initialBookmark = null,
  initialBookmarkToken = 0,
}) => {
  // TODO: Phase 2 hooks - moons, spacecraft overlays, true scale, Lagrange points.
  const [scaleMode, setScaleMode] = useState<SolarScaleMode>("showcase");
  const [performanceMode, setPerformanceMode] = useState(true);
  const [textureQuality, setTextureQuality] = useState<TextureQuality>(() => {
    if (typeof window === "undefined") return "performance";
    const viewportWidth = Math.min(window.innerWidth, window.visualViewport?.width ?? window.innerWidth);
    const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    return coarsePointer || viewportWidth < 900 ? "performance" : "high";
  });
  const [autoDegraded, setAutoDegraded] = useState(false);
  const [selectedId, setSelectedId] = useState<PlanetId | null>(null);
  const [selectedMoonId, setSelectedMoonId] = useState<string | null>(null);
  const [sunSelected, setSunSelected] = useState(false);
  const [asteroidBeltSelected, setAsteroidBeltSelected] = useState(false);
  const [trackId, setTrackId] = useState<PlanetId | null>(null);
  const [trackMoonId, setTrackMoonId] = useState<string | null>(null);
  const [focusTarget, setFocusTarget] = useState<PlanetId | null>(null);
  const [focusToken, setFocusToken] = useState(0);
  const [focusMoonTarget, setFocusMoonTarget] = useState<string | null>(null);
  const [focusMoonToken, setFocusMoonToken] = useState(0);
  const [focusSunToken, setFocusSunToken] = useState(0);
  const [navigationMode, setNavigationMode] = useState<SolarNavigationMode>("overview");
  const [navigationToken, setNavigationToken] = useState(0);
  const [bookmarkTarget, setBookmarkTarget] = useState<{
    position: [number, number, number];
    target: [number, number, number];
  } | null>(null);
  const [bookmarkToken, setBookmarkToken] = useState(0);
  const [moonMode, setMoonMode] = useState<MoonVisibilityMode>("major");
  const [moonVisibilityOverrides, setMoonVisibilityOverrides] = useState<Partial<Record<PlanetId, boolean>>>({});
  const [asteroidMode, setAsteroidMode] = useState<AsteroidBeltMode>("simplified");
  const [detailsCollapsed, setDetailsCollapsed] = useState(false);
  const [showHowTo, setShowHowTo] = useState(false);
  const [presentationMode, setPresentationMode] = useState(false);
  const [activeTourState, setActiveTourState] = useState<{ tourId: string; stepIndex: number } | null>(null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingVisible, setLoadingVisible] = useState(true);
  const [showFeatures, setShowFeatures] = useState(false);
  const [sceneSeed, setSceneSeed] = useState(0);
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    const viewportWidth = Math.min(window.innerWidth, window.visualViewport?.width ?? window.innerWidth);
    const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    return coarsePointer || viewportWidth <= 900;
  });
  const loadingCompleteRef = useRef(false);
  const loadingStartedRef = useRef(false);
  const minDate = useMemo(() => new Date(Date.UTC(2025, 0, 1)), []);
  const maxDate = useMemo(() => new Date(Date.UTC(2050, 11, 31)), []);
  const [birthdayKey, setBirthdayKey] = useState<string | null>(null);

  const clampDate = useCallback((date: Date) => {
    const ms = date.getTime();
    return new Date(Math.min(maxDate.getTime(), Math.max(minDate.getTime(), ms)));
  }, [maxDate, minDate]);

  const toDateKey = (date: Date) => toUtcDateKey(date);

  const cameraStateRef = useRef<{ position: [number, number, number]; target: [number, number, number] } | null>(
    null,
  );
  const {
    currentDate,
    setCurrentDate,
    dayIndex,
    setDayIndex,
    maxDays,
    isPlaying,
    setIsPlaying,
    speed,
    setSpeed,
  } = useSolarTime(minDate, maxDate);
  const timeDays = useMemo(
    () => (currentDate.getTime() - minDate.getTime()) / DAY_MS,
    [currentDate, minDate],
  );

  const [visualTimeDays, setVisualTimeDays] = useState(timeDays);
  const visualTimeRef = useRef(timeDays);

  useEffect(() => {
    visualTimeRef.current = visualTimeDays;
  }, [visualTimeDays]);

  useEffect(() => {
    if (isPlaying) {
      setVisualTimeDays(timeDays);
      return;
    }
    const delta = Math.abs(timeDays - visualTimeRef.current);
    if (delta < 120) {
      setVisualTimeDays(timeDays);
      return;
    }
    const start = performance.now();
    const startValue = visualTimeRef.current;
    const duration = 1200;
    let animationFrame = 0;
    const animate = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      const next = startValue + (timeDays - startValue) * eased;
      visualTimeRef.current = next;
      setVisualTimeDays(next);
      if (t < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };
    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [timeDays, isPlaying]);

  const currentKey = useMemo(() => toDateKey(currentDate), [currentDate]);
  const isBirthdayActive = birthdayKey !== null && currentKey === birthdayKey;
  const { bookmarks, saveBookmark } = useCameraBookmarks();

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    let hideTimer: number | undefined;
    let idleTimer: number | undefined;
    const previousHandlers = {
      onStart: solarTextureManager.onStart,
      onProgress: solarTextureManager.onProgress,
      onLoad: solarTextureManager.onLoad,
      onError: solarTextureManager.onError,
    };

    solarTextureManager.onStart = (_, itemsLoaded, itemsTotal) => {
      loadingStartedRef.current = true;
      if (loadingCompleteRef.current) return;
      setLoadingVisible(true);
      if (itemsTotal > 0) {
        setLoadingProgress(itemsLoaded / itemsTotal);
      } else {
        setLoadingProgress(0.05);
      }
    };

    solarTextureManager.onProgress = (_, itemsLoaded, itemsTotal) => {
      if (loadingCompleteRef.current) return;
      if (itemsTotal > 0) {
        setLoadingProgress(itemsLoaded / itemsTotal);
      } else {
        setLoadingProgress((prev) => Math.min(0.9, prev + 0.05));
      }
    };

    solarTextureManager.onLoad = () => {
      if (loadingCompleteRef.current) return;
      loadingCompleteRef.current = true;
      setLoadingProgress(1);
      hideTimer = window.setTimeout(() => setLoadingVisible(false), 350);
    };

    solarTextureManager.onError = () => {
      if (loadingCompleteRef.current) return;
      setLoadingProgress((prev) => Math.min(0.95, prev + 0.03));
    };

    idleTimer = window.setTimeout(() => {
      if (!loadingStartedRef.current) {
        setLoadingVisible(false);
      }
    }, 900);

    return () => {
      solarTextureManager.onStart = previousHandlers.onStart;
      solarTextureManager.onProgress = previousHandlers.onProgress;
      solarTextureManager.onLoad = previousHandlers.onLoad;
      solarTextureManager.onError = previousHandlers.onError;
      if (hideTimer) window.clearTimeout(hideTimer);
      if (idleTimer) window.clearTimeout(idleTimer);
    };
  }, []);

  useEffect(() => {
    let active = true;
    preloadSolarTextures(textureQuality).then(() => {
      if (active) {
        setSceneSeed((prev) => prev + 1);
        setLoadingVisible(false);
      }
    });
    return () => {
      active = false;
    };
  }, [textureQuality]);

  const selectedPlanet = useMemo(() => PLANETS.find((planet) => planet.id === selectedId) ?? null, [selectedId]);
  const selectedMoon = useMemo(() => MOONS.find((moon) => moon.id === selectedMoonId) ?? null, [selectedMoonId]);
  const shouldRenderFeatures = !isMobile || showFeatures;
  const activeTour = useMemo(
    () => SOLAR_TOURS.find((tour) => tour.id === activeTourState?.tourId) ?? null,
    [activeTourState?.tourId],
  );
  const activeTourStep = activeTour && activeTourState ? activeTour.steps[activeTourState.stepIndex] : null;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const seen = window.localStorage.getItem(HOW_TO_KEY);
    if (!seen) {
      setShowHowTo(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(BIRTHDAY_KEY);
    if (!stored) return;
    const [year, month, day] = stored.split("-").map(Number);
    const storedDate = new Date(Date.UTC(year, month - 1, day));
    const clamped = clampDate(storedDate);
    setBirthdayKey(toDateKey(clamped));
  }, [minDate, maxDate]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const viewportWidth = Math.min(window.innerWidth, window.visualViewport?.width ?? window.innerWidth);
    const prefersPerformance =
      window.matchMedia?.("(pointer: coarse)").matches || viewportWidth < 900;
    setTextureQuality(prefersPerformance ? "performance" : "high");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia?.("(max-width: 900px)");
    const update = () => {
      const viewportWidth = Math.min(window.innerWidth, window.visualViewport?.width ?? window.innerWidth);
      const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false;
      const mobile = coarsePointer || viewportWidth <= 900 || (media ? media.matches : false);
      setIsMobile(mobile);
      if (mobile) {
        setShowFeatures(false);
        setDetailsCollapsed(true);
      }
    };
    update();
    media?.addEventListener?.("change", update);
    return () => media?.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(max-width: 720px)").matches) {
      setDetailsCollapsed(true);
    }
  }, []);

  useEffect(() => {
    if (performanceMode) {
      setTextureQuality("performance");
      return;
    }
    if (!autoDegraded && typeof window !== "undefined") {
      const prefersPerformance =
        window.matchMedia?.("(pointer: coarse)").matches || window.innerWidth < 900;
      setTextureQuality(prefersPerformance ? "performance" : "high");
    }
  }, [performanceMode, autoDegraded]);

  const handleCloseHowTo = () => {
    setShowHowTo(false);
    if (typeof window === "undefined") return;
    window.localStorage.setItem(HOW_TO_KEY, "true");
  };

  const markIntroSeen = () => {
    setShowHowTo(false);
    if (typeof window === "undefined") return;
    window.localStorage.setItem(HOW_TO_KEY, "true");
  };

  const requestFocus = (planetId: PlanetId | null) => {
    if (!planetId) return;
    setFocusTarget(planetId);
    setFocusToken((prev) => prev + 1);
  };

  const requestMoonFocus = (moonId: string | null) => {
    if (!moonId) return;
    setFocusMoonTarget(moonId);
    setFocusMoonToken((prev) => prev + 1);
  };

  const requestSunFocus = () => {
    setFocusSunToken((prev) => prev + 1);
  };

  const requestNavigationMode = (mode: SolarNavigationMode) => {
    setNavigationMode(mode);
    setNavigationToken((prev) => prev + 1);
  };

  const selectPlanetById = (planetId: PlanetId, shouldFocus = true) => {
    setSelectedId(planetId);
    setSelectedMoonId(null);
    setSunSelected(false);
    setAsteroidBeltSelected(false);
    setTrackId(null);
    setTrackMoonId(null);
    setDetailsCollapsed(false);
    if (shouldFocus) {
      requestFocus(planetId);
    }
  };

  const selectMoonById = (moonId: string, shouldFocus = true) => {
    const moon = MOONS.find((item) => item.id === moonId);
    if (!moon) return;
    setSelectedMoonId(moon.id);
    setSelectedId(moon.parentPlanet);
    setSunSelected(false);
    setAsteroidBeltSelected(false);
    setTrackId(null);
    setTrackMoonId(null);
    setMoonVisibilityOverrides((prev) => ({ ...prev, [moon.parentPlanet]: true }));
    if (moonMode === "off") {
      setMoonMode(moon.class === "minor" ? "all" : "major");
    } else if (moon.class === "minor" && moonMode !== "all") {
      setMoonMode("all");
    }
    setDetailsCollapsed(false);
    if (shouldFocus) {
      requestMoonFocus(moon.id);
    }
  };

  const selectSun = (shouldFocus = true) => {
    setSunSelected(true);
    setSelectedId(null);
    setSelectedMoonId(null);
    setAsteroidBeltSelected(false);
    setTrackId(null);
    setTrackMoonId(null);
    setDetailsCollapsed(false);
    if (shouldFocus) {
      requestSunFocus();
    }
  };

  const selectAsteroidBelt = () => {
    setSunSelected(false);
    setSelectedId(null);
    setSelectedMoonId(null);
    setAsteroidBeltSelected(true);
    setTrackId(null);
    setTrackMoonId(null);
    setAsteroidMode((prev) => (prev === "off" ? "simplified" : prev));
    setDetailsCollapsed(false);
    requestNavigationMode("ecliptic");
  };

  const handleSearchSelect = (result: SolarSearchResult) => {
    if (result.kind === "sun") {
      selectSun();
      return;
    }
    if (result.kind === "planet") {
      selectPlanetById(result.id);
      requestNavigationMode("planetary");
      return;
    }
    if (result.kind === "moon") {
      selectMoonById(result.id);
      requestNavigationMode("planetary");
      return;
    }
    if (result.kind === "belt") {
      selectAsteroidBelt();
      return;
    }
    handleSelectBookmark(result.bookmark);
  };

  const handleSaveBookmark = () => {
    const state = cameraStateRef.current;
    if (!state) return;
    const name = window.prompt("Bookmark name?");
    if (!name) return;
    saveBookmark(name, state.position, state.target, {
      selectedPlanetId: selectedId ?? undefined,
      selectedMoonId: selectedMoonId ?? undefined,
      sunSelected,
      trackPlanetId: trackId ?? undefined,
      trackMoonId: trackMoonId ?? undefined,
      scaleMode,
      moonMode,
      asteroidMode,
      dateKey: currentKey,
    });
  };

  const handleSelectBookmark = useCallback((bookmark: CameraBookmark) => {
    if (bookmark.scaleMode) {
      setScaleMode(bookmark.scaleMode);
    }
    if (bookmark.moonMode) {
      setMoonMode(bookmark.moonMode);
    }
    if (bookmark.asteroidMode) {
      setAsteroidMode(bookmark.asteroidMode);
    }
    if (bookmark.dateKey) {
      const [year, month, day] = bookmark.dateKey.split("-").map(Number);
      const nextDate = new Date(Date.UTC(year, month - 1, day));
      if (!Number.isNaN(nextDate.getTime())) {
        setCurrentDate(clampDate(nextDate));
      }
    }
    if (bookmark.sunSelected) {
      setSunSelected(true);
      setSelectedId(null);
      setSelectedMoonId(null);
      setAsteroidBeltSelected(false);
    } else {
      setSunSelected(false);
      setSelectedId(bookmark.selectedPlanetId ?? null);
      setSelectedMoonId(bookmark.selectedMoonId ?? null);
      setAsteroidBeltSelected(false);
    }
    setTrackId(bookmark.trackPlanetId ?? null);
    setTrackMoonId(bookmark.trackMoonId ?? null);
    setBookmarkTarget({ position: bookmark.position, target: bookmark.target });
    setBookmarkToken((prev) => prev + 1);
  }, [clampDate, setCurrentDate]);

  useEffect(() => {
    if (!initialBookmark) return;
    handleSelectBookmark(initialBookmark);
  }, [handleSelectBookmark, initialBookmark, initialBookmarkToken]);

  const applySolarTourStep = (step: SolarTourStep) => {
    setIsPlaying(false);
    setDetailsCollapsed(false);
    if (isMobile) {
      setShowFeatures(false);
    }

    switch (step.target.kind) {
      case "sun":
        selectSun(true);
        if (step.target.navigationMode) requestNavigationMode(step.target.navigationMode);
        break;
      case "planet":
        selectPlanetById(step.target.planetId, true);
        if (step.target.navigationMode) requestNavigationMode(step.target.navigationMode);
        break;
      case "moon":
        selectMoonById(step.target.moonId, true);
        if (step.target.navigationMode) requestNavigationMode(step.target.navigationMode);
        break;
      case "belt":
        selectAsteroidBelt();
        if (step.target.navigationMode) requestNavigationMode(step.target.navigationMode);
        break;
      case "overview":
        setSelectedId(null);
        setSelectedMoonId(null);
        setSunSelected(false);
        setAsteroidBeltSelected(false);
        requestNavigationMode(step.target.navigationMode);
        break;
    }
  };

  const startSolarTour = (tourId = SOLAR_TOURS[0].id) => {
    const tour = SOLAR_TOURS.find((item) => item.id === tourId) ?? SOLAR_TOURS[0];
    markIntroSeen();
    setPresentationMode(true);
    setActiveTourState({ tourId: tour.id, stepIndex: 0 });
    applySolarTourStep(tour.steps[0]);
  };

  const moveSolarTour = (direction: 1 | -1) => {
    if (!activeTour || !activeTourState) return;
    const nextIndex = activeTourState.stepIndex + direction;
    if (nextIndex < 0) return;
    if (nextIndex >= activeTour.steps.length) {
      setActiveTourState(null);
      return;
    }
    setActiveTourState({ tourId: activeTour.id, stepIndex: nextIndex });
    applySolarTourStep(activeTour.steps[nextIndex]);
  };

  const stopSolarTour = () => {
    setActiveTourState(null);
  };

  return (
    <section className={`solar-page ${presentationMode ? "is-presentation" : ""}`}>
      <div className="solar-canvas">
        <SolarScene
          key={sceneSeed}
          timeDays={visualTimeDays}
          timeScale={speed}
          isPlaying={isPlaying}
          scaleMode={scaleMode}
          performanceMode={performanceMode}
          textureQuality={textureQuality}
          moonMode={moonMode}
          moonVisibilityOverrides={moonVisibilityOverrides}
          asteroidMode={asteroidMode}
          selectedId={selectedId}
          selectedMoonId={selectedMoonId}
          sunSelected={sunSelected}
          focusTargetId={focusTarget}
          focusToken={focusToken}
          focusMoonId={focusMoonTarget}
          focusMoonToken={focusMoonToken}
          focusSunToken={focusSunToken}
          trackTargetId={trackId}
          trackMoonId={trackMoonId}
          bookmarkTarget={bookmarkTarget}
          bookmarkToken={bookmarkToken}
          navigationMode={navigationMode}
          navigationToken={navigationToken}
          onPerformanceDrop={() => {
            if (!autoDegraded) {
              setAutoDegraded(true);
              setTextureQuality("performance");
            }
          }}
          onSelectPlanet={(planet) => {
            setSelectedId(planet?.id ?? null);
            setTrackId(null);
            setSelectedMoonId(null);
            setTrackMoonId(null);
            setSunSelected(false);
            setAsteroidBeltSelected(false);
          }}
          onSelectMoon={(moon) => {
            setSelectedMoonId(moon.id);
            setSelectedId(moon.parentPlanet);
            setTrackId(null);
            setSunSelected(false);
            setAsteroidBeltSelected(false);
          }}
          onSelectSun={(selected) => {
            setSunSelected(selected);
            if (selected) {
              setSelectedId(null);
              setSelectedMoonId(null);
              setAsteroidBeltSelected(false);
              setTrackId(null);
              setTrackMoonId(null);
            }
          }}
          onRequestFocus={(planet) => requestFocus(planet.id)}
          onCameraState={(state) => {
            cameraStateRef.current = state;
          }}
        />
      </div>

      <div className="solar-ui">
        {loadingVisible && (
          <>
            <div className="solar-loading__scrim" />
            <div className={`solar-loading ${loadingProgress >= 1 ? "is-complete" : ""}`}>
              <div className="solar-loading__label">Loading solar textures…</div>
              <div
                className="solar-loading__bar"
                style={{ transform: `scaleX(${Math.max(0.04, loadingProgress)})` }}
              />
            </div>
          </>
        )}
        {shouldRenderFeatures && (
          <div className={`solar-features ${showFeatures ? "is-open" : ""}`}>
            <SolarTopBar
              scaleMode={scaleMode}
              onScaleModeChange={setScaleMode}
              moonMode={moonMode}
              onMoonModeChange={setMoonMode}
              asteroidMode={asteroidMode}
              onAsteroidModeChange={setAsteroidMode}
              performanceMode={performanceMode}
              onTogglePerformance={() => setPerformanceMode((prev) => !prev)}
              currentDate={currentDate}
              minDate={minDate}
              maxDate={maxDate}
              onDateChange={(next) => setCurrentDate(next)}
              onSetToday={() => setCurrentDate(new Date())}
              onResetDate={() => setCurrentDate(minDate)}
              onBirthdaySelect={(next) => {
                const clamped = clampDate(next);
                if (typeof window !== "undefined") {
                  window.localStorage.setItem(BIRTHDAY_KEY, toDateKey(clamped));
                }
                setBirthdayKey(toDateKey(clamped));
              }}
              birthdayActive={isBirthdayActive}
              bookmarks={bookmarks}
              onSaveBookmark={handleSaveBookmark}
              onSelectBookmark={handleSelectBookmark}
              navigationMode={navigationMode}
              onNavigationModeChange={requestNavigationMode}
              onSearchSelect={handleSearchSelect}
              presentationMode={presentationMode}
              onStartTour={() => startSolarTour()}
              onTogglePresentation={() => setPresentationMode((prev) => !prev)}
            />

            <SolarDetailsPanel
              planet={selectedPlanet}
              moon={selectedMoon}
              sunSelected={sunSelected}
              asteroidBeltSelected={asteroidBeltSelected}
              collapsed={detailsCollapsed}
              currentDate={currentDate}
              timeDays={visualTimeDays}
              scaleMode={scaleMode}
              isTracking={Boolean(selectedId && trackId === selectedId)}
              isMoonTracking={Boolean(selectedMoonId && trackMoonId === selectedMoonId)}
              moonToggleEnabled={selectedId ? (moonVisibilityOverrides[selectedId] ?? true) : true}
              onToggleMoonsForPlanet={() => {
                if (!selectedId) return;
                setMoonVisibilityOverrides((prev) => ({
                  ...prev,
                  [selectedId]: !(prev[selectedId] ?? true),
                }));
              }}
              onToggleCollapse={() => setDetailsCollapsed((prev) => !prev)}
              onFocus={() => requestFocus(selectedId)}
              onSelectPlanet={selectPlanetById}
              onSelectMoon={selectMoonById}
              onShowAsteroidBelt={selectAsteroidBelt}
              onToggleTrack={() =>
                setTrackId((prev) => {
                  if (!selectedId) return null;
                  const next = prev === selectedId ? null : selectedId;
                  if (next) {
                    setTrackMoonId(null);
                  }
                  return next;
                })
              }
              onFocusMoon={() => requestMoonFocus(selectedMoonId)}
              onToggleMoonTrack={() =>
                setTrackMoonId((prev) => {
                  if (!selectedMoonId) return null;
                  const next = prev === selectedMoonId ? null : selectedMoonId;
                  if (next) {
                    setTrackId(null);
                  }
                  return next;
                })
              }
              onExplore={() => {
                if (!selectedPlanet) return;
                onExploreImagery(selectedPlanet.searchQuery);
              }}
              onExploreSun={() => onExploreImagery("Sun")}
              onFocusSun={requestSunFocus}
            />
            <SolarScaleLegend scaleMode={scaleMode} />
          </div>
        )}

        <SolarTimeline
          currentDate={currentDate}
          minDate={minDate}
          maxDate={maxDate}
          dayIndex={dayIndex}
          maxDays={maxDays}
          isPlaying={isPlaying}
          speed={speed}
          onTogglePlay={() => setIsPlaying((prev) => !prev)}
          onSpeedChange={(next) => setSpeed(next)}
          onDayChange={(next) => setDayIndex(next)}
        />
        {isMobile && (
          <button
            type="button"
            className={`solar-tray__toggle ${showFeatures ? "is-open" : ""}`}
            onClick={() => setShowFeatures((prev) => !prev)}
          >
            {showFeatures ? "Close Features" : "Features"}
          </button>
        )}
      </div>

      {showHowTo && (
        <ExperienceIntroOverlay
          eyebrow="FIRST FLIGHT"
          title="Solar Explorer is a cinematic solar atlas"
          body="Search any planet or major moon, scrub time, switch camera modes, and inspect the system through one continuous scene."
          highlights={["Search and jump", "Time travel", "Planetary system views", "Moon context"]}
          primaryAction={{ label: "Start guided tour", onClick: () => startSolarTour() }}
          secondaryAction={{ label: "Explore manually", onClick: handleCloseHowTo }}
          tertiaryAction={{
            label: "Presentation mode",
            onClick: () => {
              markIntroSeen();
              setPresentationMode(true);
              requestNavigationMode("overview");
            },
          }}
        />
      )}

      {activeTour && activeTourStep ? (
        <GuidedTourPanel
          tour={activeTour}
          step={activeTourStep}
          stepIndex={activeTourState?.stepIndex ?? 0}
          presentationMode={presentationMode}
          onPrevious={() => moveSolarTour(-1)}
          onNext={() => moveSolarTour(1)}
          onStop={stopSolarTour}
          onTogglePresentation={() => setPresentationMode((prev) => !prev)}
        />
      ) : null}

      {presentationMode && !activeTour ? (
        <PresentationHud
          eyebrow="PRESENTATION MODE"
          title="Solar Explorer"
          body="Non-essential controls are tucked away so the scene can carry the room. Start the tour when you want a guided reveal."
          actions={[
            { label: "Start tour", onClick: () => startSolarTour(), variant: "primary" },
            { label: "Overview", onClick: () => requestNavigationMode("overview") },
            { label: "Exit", onClick: () => setPresentationMode(false) },
          ]}
        />
      ) : null}
    </section>
  );
};

export default SolarSystemPage;
