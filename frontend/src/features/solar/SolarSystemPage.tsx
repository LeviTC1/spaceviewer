import { FC, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import SolarScene from "./SolarScene";
import SolarDetailsPanel from "./SolarDetailsPanel";
import SolarMissionControl from "./SolarMissionControl";
import SolarPerformanceOverlay from "./SolarPerformanceOverlay";
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
import CameraFlightStatus from "../../components/experience/CameraFlightStatus";
import { PLANETS, type PlanetId, type SolarScaleMode } from "./solarData";
import { MOONS, type MoonVisibilityMode } from "./moonData";
import {
  SMALL_BODY_BY_ID,
  type SmallBodyId,
} from "./smallBodies/smallBodyData";
import type { AsteroidBeltMode } from "./asteroids/asteroidGenerator";
import { solarTextureManager } from "./textures/solarTextureManager";
import { preloadSolarEssentialTextures } from "./textures/preloadSolarEssentialTextures";
import {
  ALL_SOLAR_PANEL_VISIBILITY,
  CLEAN_SOLAR_PANEL_VISIBILITY,
  DEFAULT_DESKTOP_PANEL_VISIBILITY,
  SOLAR_PANEL_CONTROLS,
  getActiveSolarPanelCount,
  getSolarPanelDockStateLabel,
  normalizeSolarPanelVisibility,
  type SolarPanelKey,
  type SolarPanelVisibility,
} from "./solarPanelState";
import { useSolarTime } from "./useSolarTime";
import { useCameraBookmarks, type CameraBookmark } from "./useCameraBookmarks";
import { DAY_MS, toUtcDateKey } from "../time/timeUtils";
import type { SolarSearchResult } from "./SolarSearch";
import type { SolarNavigationMode } from "./solarNavigation";
import type { CameraFlightState, ScaleDomainId } from "../../domain/astro";
import { useStreamedSolarEphemeris } from "../../domain/solar";
import {
  getMoonEclipseOccluders,
  getPlanetEclipseOccluders,
} from "./eclipse/solarEclipseModel";
import {
  ASTRO_QUALITY_PROFILES,
  type AstroQualityTier,
} from "../../lib/rendering/qualityManager";
import type { AdaptiveQualityReport } from "../../lib/rendering/adaptiveQuality";
import {
  getSolarLaunchTargetFromSnapshot,
  getSolarTargetPath,
  type SolarLaunchTarget,
  type SolarRouteSnapshot,
  type SolarRouteUpdateMode,
} from "./solarRoutes";
export type { SolarLaunchTarget } from "./solarRoutes";

interface SolarSystemPageProps {
  onExploreImagery: (query: string) => void;
  initialBookmark?: CameraBookmark | null;
  initialBookmarkToken?: number;
  initialTarget?: SolarLaunchTarget | null;
  initialTargetToken?: number;
  onInitialTargetHandled?: () => void;
  onTargetSelectionChange?: (target: SolarLaunchTarget, mode: SolarRouteUpdateMode) => void;
  qualityTier: AstroQualityTier;
  adaptiveQualityEnabled: boolean;
  adaptiveQualityReport: AdaptiveQualityReport | null;
  onAdaptiveQualityDrop: (report: AdaptiveQualityReport) => void;
  onQualityTierChange: (tier: AstroQualityTier) => void;
  onScaleDomainChange: (domain: ScaleDomainId) => void;
  getEarthSurfaceUrl: (timestamp: Date, mode: "earth-orbit" | "moon" | "true-scale") => string;
}

const HOW_TO_KEY = "spaceviewer.solar.finalExperienceSeen.v1";
const BIRTHDAY_KEY = "spaceviewer.solar.birthday";
const PANEL_VISIBILITY_KEY = "spaceviewer.solar.panelVisibility.v2";
const PANEL_DOCK_COLLAPSED_KEY = "spaceviewer.solar.panelDockCollapsed.v2";

type SolarTourTarget =
  | { kind: "sun"; navigationMode?: SolarNavigationMode }
  | { kind: "planet"; planetId: PlanetId; navigationMode?: SolarNavigationMode }
  | { kind: "moon"; moonId: string; navigationMode?: SolarNavigationMode }
  | { kind: "belt"; navigationMode?: SolarNavigationMode }
  | { kind: "overview"; navigationMode: SolarNavigationMode };

type SolarTourStep = GuidedTourStep & {
  target: SolarTourTarget;
};

type SolarEventPresetId =
  | "today"
  | "birthday"
  | "jupiter-family"
  | "saturn-rings"
  | "inner-map"
  | "asteroid-sweep";

interface SolarEventPreset {
  id: SolarEventPresetId;
  label: string;
  meta: string;
  active: boolean;
}

const SOLAR_LOADING_TIMEOUT_MS = 6500;

const getSolarViewportIsMobile = () => {
  if (typeof window === "undefined") return false;
  const viewportWidth = Math.min(window.innerWidth, window.visualViewport?.width ?? window.innerWidth);
  const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  return coarsePointer || viewportWidth <= 900;
};

const getInitialSolarPanelVisibility = (): SolarPanelVisibility => {
  if (typeof window === "undefined") {
    return DEFAULT_DESKTOP_PANEL_VISIBILITY;
  }
  const mobile = getSolarViewportIsMobile();
  try {
    const raw = window.localStorage.getItem(PANEL_VISIBILITY_KEY);
    if (!raw) return normalizeSolarPanelVisibility(null, mobile);
    return normalizeSolarPanelVisibility(JSON.parse(raw) as Partial<SolarPanelVisibility>, mobile);
  } catch {
    return normalizeSolarPanelVisibility(null, mobile);
  }
};

const getInitialSolarDockCollapsed = () => {
  if (typeof window === "undefined") return false;
  try {
    const rawPanels = window.localStorage.getItem(PANEL_VISIBILITY_KEY);
    if (rawPanels) {
      const panels = normalizeSolarPanelVisibility(
        JSON.parse(rawPanels) as Partial<SolarPanelVisibility>,
        getSolarViewportIsMobile(),
      );
      if (SOLAR_PANEL_CONTROLS.every((item) => !panels[item.key])) return true;
    }
    const stored = window.localStorage.getItem(PANEL_DOCK_COLLAPSED_KEY);
    return stored === null ? true : stored === "true";
  } catch {
    return false;
  }
};

const isSolarShortcutTextTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest("input, textarea, select, [contenteditable='true']") ||
      target.closest(".experience-intro, .experience-tour, .experience-presentation-hud"),
  );
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
  initialTarget = null,
  initialTargetToken = 0,
  onInitialTargetHandled,
  onTargetSelectionChange,
  qualityTier,
  adaptiveQualityEnabled,
  adaptiveQualityReport,
  onAdaptiveQualityDrop,
  onQualityTierChange,
  onScaleDomainChange,
  getEarthSurfaceUrl,
}) => {
  // TODO: Phase 2 hooks - spacecraft overlays and Lagrange points.
  const [scaleMode, setScaleMode] = useState<SolarScaleMode>("showcase");
  const [selectedId, setSelectedId] = useState<PlanetId | null>(null);
  const [selectedMoonId, setSelectedMoonId] = useState<string | null>(null);
  const [selectedSmallBodyId, setSelectedSmallBodyId] = useState<SmallBodyId | null>(null);
  const [sunSelected, setSunSelected] = useState(false);
  const [asteroidBeltSelected, setAsteroidBeltSelected] = useState(false);
  const [trackId, setTrackId] = useState<PlanetId | null>(null);
  const [trackMoonId, setTrackMoonId] = useState<string | null>(null);
  const [focusTarget, setFocusTarget] = useState<PlanetId | null>(null);
  const [focusToken, setFocusToken] = useState(0);
  const [focusMoonTarget, setFocusMoonTarget] = useState<string | null>(null);
  const [focusMoonToken, setFocusMoonToken] = useState(0);
  const [focusSunToken, setFocusSunToken] = useState(0);
  const [focusSmallBodyTarget, setFocusSmallBodyTarget] = useState<SmallBodyId | null>(null);
  const [focusSmallBodyToken, setFocusSmallBodyToken] = useState(0);
  const [navigationMode, setNavigationMode] = useState<SolarNavigationMode>("overview");
  const [navigationToken, setNavigationToken] = useState(0);
  const [cameraFlight, setCameraFlight] = useState<CameraFlightState | null>(null);
  const [cancelFlightToken, setCancelFlightToken] = useState(0);
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
  const [copyLinkStatus, setCopyLinkStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [activeTourState, setActiveTourState] = useState<{ tourId: string; stepIndex: number } | null>(null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingVisible, setLoadingVisible] = useState(true);
  const [loadingFallback, setLoadingFallback] = useState(false);
  const [panelVisibility, setPanelVisibility] = useState<SolarPanelVisibility>(getInitialSolarPanelVisibility);
  const [dockCollapsed, setDockCollapsed] = useState(getInitialSolarDockCollapsed);
  const [isMobile, setIsMobile] = useState(() => {
    return getSolarViewportIsMobile();
  });
  const loadingCompleteRef = useRef(false);
  const loadingStartedRef = useRef(false);
  const firstPreloadRef = useRef(false);
  const panelActionVersionRef = useRef(0);
  const appliedInitialTargetTokenRef = useRef<number | null>(null);
  const minDate = useMemo(() => new Date(Date.UTC(2025, 0, 1)), []);
  const maxDate = useMemo(() => new Date(Date.UTC(2050, 11, 31)), []);
  const [birthdayKey, setBirthdayKey] = useState<string | null>(null);
  const qualityProfile = ASTRO_QUALITY_PROFILES[qualityTier];
  const performanceMode = qualityProfile.performanceMode;
  const textureQuality = qualityProfile.textureQuality;

  const markPanelAction = useCallback(() => {
    panelActionVersionRef.current += 1;
  }, []);

  const togglePanel = useCallback(
    (key: SolarPanelKey) => {
      markPanelAction();
      setDockCollapsed(false);
      setPanelVisibility((prev) => {
        const nextVisible = !prev[key];
        return { ...prev, [key]: nextVisible };
      });
    },
    [markPanelAction],
  );

  const hidePanels = useCallback(() => {
    markPanelAction();
    setPanelVisibility(CLEAN_SOLAR_PANEL_VISIBILITY);
    setDockCollapsed(true);
  }, [markPanelAction]);

  const cancelCameraFlight = useCallback(() => {
    setCameraFlight(null);
    setCancelFlightToken((current) => current + 1);
  }, []);

  const showPanels = useCallback(() => {
    markPanelAction();
    setPanelVisibility(ALL_SOLAR_PANEL_VISIBILITY);
    setDockCollapsed(false);
  }, [markPanelAction]);

  const restoreDefaultPanels = useCallback(() => {
    markPanelAction();
    const next = normalizeSolarPanelVisibility(null, isMobile);
    setPanelVisibility(next);
    setDockCollapsed(false);
  }, [isMobile, markPanelAction]);

  const revealContextPanels = useCallback(() => {
    const revealVersion = panelActionVersionRef.current;
    setDockCollapsed((prev) => (panelActionVersionRef.current === revealVersion ? false : prev));
    setPanelVisibility((prev) => {
      if (panelActionVersionRef.current !== revealVersion) return prev;
      return {
        ...prev,
        features: !isMobile,
        mission: true,
        timeline: isMobile ? false : prev.timeline,
      };
    });
  }, [isMobile]);

  const revealScalePanel = useCallback(() => {
    const revealVersion = panelActionVersionRef.current;
    setDockCollapsed((prev) => (panelActionVersionRef.current === revealVersion ? false : prev));
    setPanelVisibility((prev) =>
      panelActionVersionRef.current === revealVersion ? { ...prev, scale: true } : prev,
    );
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(PANEL_VISIBILITY_KEY, JSON.stringify(panelVisibility));
  }, [panelVisibility]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(PANEL_DOCK_COLLAPSED_KEY, String(dockCollapsed));
  }, [dockCollapsed]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const panelOpen = Object.values(panelVisibility).some(Boolean);
    if (!cameraFlight && !panelOpen && dockCollapsed) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== "Escape" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isSolarShortcutTextTarget(event.target)) return;
      if (cameraFlight) {
        event.preventDefault();
        cancelCameraFlight();
        return;
      }
      if (showHowTo || activeTourState || presentationMode) return;
      event.preventDefault();
      hidePanels();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTourState, cameraFlight, cancelCameraFlight, dockCollapsed, hidePanels, panelVisibility, presentationMode, showHowTo]);

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
    direction,
    setDirection,
  } = useSolarTime(minDate, maxDate);
  const solarEphemeris = useStreamedSolarEphemeris(currentDate);
  const currentRouteDateKey = toDateKey(currentDate);
  const routeSnapshotRef = useRef<SolarRouteSnapshot>({
    selectedPlanetId: selectedId,
    selectedMoonId,
    selectedSmallBodyId,
    sunSelected,
    asteroidBeltSelected,
    navigationMode,
    scaleMode,
    dateKey: currentRouteDateKey,
  });
  useLayoutEffect(() => {
    routeSnapshotRef.current = {
      selectedPlanetId: selectedId,
      selectedMoonId,
      selectedSmallBodyId,
      sunSelected,
      asteroidBeltSelected,
      navigationMode,
      scaleMode,
      dateKey: currentRouteDateKey,
    };
  }, [
    asteroidBeltSelected,
    currentRouteDateKey,
    navigationMode,
    scaleMode,
    selectedId,
    selectedMoonId,
    selectedSmallBodyId,
    sunSelected,
  ]);

  const emitSolarRoute = useCallback(
    (
      mode: SolarRouteUpdateMode | "none",
      overrides: Partial<SolarRouteSnapshot> = {},
    ) => {
      const target = getSolarLaunchTargetFromSnapshot({ ...routeSnapshotRef.current, ...overrides });
      if (mode !== "none") {
        setCopyLinkStatus("idle");
        onTargetSelectionChange?.(target, mode);
      }
      return target;
    },
    [onTargetSelectionChange],
  );

  const applyNavigationMode = useCallback((mode: SolarNavigationMode) => {
    setNavigationMode(mode);
    setNavigationToken((prev) => prev + 1);
  }, []);

  const requestNavigationMode = useCallback(
    (mode: SolarNavigationMode, routeMode: SolarRouteUpdateMode | "none" = "replace") => {
      applyNavigationMode(mode);
      emitSolarRoute(routeMode, { navigationMode: mode });
    },
    [applyNavigationMode, emitSolarRoute],
  );

  const handleScaleModeChange = useCallback(
    (mode: SolarScaleMode, routeMode: SolarRouteUpdateMode | "none" = "replace") => {
      setScaleMode(mode);
      emitSolarRoute(routeMode, { scaleMode: mode });
    },
    [emitSolarRoute],
  );

  const handleDateChange = useCallback(
    (date: Date, routeMode: SolarRouteUpdateMode | "none" = "replace") => {
      const clamped = clampDate(date);
      setCurrentDate(clamped);
      emitSolarRoute(routeMode, { dateKey: toDateKey(clamped) });
    },
    [clampDate, emitSolarRoute, setCurrentDate],
  );

  const handleDayIndexChange = useCallback(
    (nextDay: number) => {
      const clampedDay = Math.min(maxDays, Math.max(0, Math.round(nextDay)));
      setDayIndex(clampedDay);
      emitSolarRoute("replace", {
        dateKey: toDateKey(new Date(minDate.getTime() + clampedDay * DAY_MS)),
      });
    },
    [emitSolarRoute, maxDays, minDate, setDayIndex],
  );

  const handleTogglePlayback = useCallback(() => {
    if (isPlaying) {
      emitSolarRoute("replace");
    }
    setIsPlaying((prev) => !prev);
  }, [emitSolarRoute, isPlaying, setIsPlaying]);

  const handleCopySolarLink = useCallback(() => {
    if (typeof window === "undefined") return;
    const target = emitSolarRoute("replace");
    const url = new URL(getSolarTargetPath(target), window.location.origin).toString();
    const markCopied = () => setCopyLinkStatus("copied");
    const markFailed = () => setCopyLinkStatus("failed");

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(markCopied).catch(markFailed);
      return;
    }

    try {
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      const copied = document.execCommand("copy");
      input.remove();
      if (!copied) throw new Error("Clipboard command was rejected");
      markCopied();
    } catch (error) {
      console.error("Copy Solar link failed", error);
      markFailed();
    }
  }, [emitSolarRoute]);

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
      setLoadingFallback(false);
      setLoadingProgress(1);
      hideTimer = window.setTimeout(() => setLoadingVisible(false), 350);
    };

    solarTextureManager.onError = () => {
      if (loadingCompleteRef.current) return;
      setLoadingProgress((prev) => Math.min(0.95, prev + 0.03));
    };

    const idleTimer = window.setTimeout(() => {
      if (!loadingStartedRef.current) {
        setLoadingProgress(1);
        setLoadingFallback(false);
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
    const firstPreload = !firstPreloadRef.current;
    firstPreloadRef.current = true;
    let fallbackTimer: number | undefined;

    if (firstPreload && typeof window !== "undefined") {
      setLoadingVisible(true);
      setLoadingFallback(false);
      setLoadingProgress((prev) => Math.max(prev, 0.06));
      fallbackTimer = window.setTimeout(() => {
        if (!active || loadingCompleteRef.current) return;
        loadingCompleteRef.current = true;
        setLoadingFallback(true);
        setLoadingProgress(1);
        setLoadingVisible(false);
      }, SOLAR_LOADING_TIMEOUT_MS);
    }

    preloadSolarEssentialTextures(textureQuality).then(() => {
      if (!active) return;
      if (fallbackTimer && typeof window !== "undefined") {
        window.clearTimeout(fallbackTimer);
      }
      if (firstPreload) {
        loadingCompleteRef.current = true;
        setLoadingFallback(false);
        setLoadingProgress(1);
        setLoadingVisible(false);
      }
    });
    return () => {
      active = false;
      if (fallbackTimer && typeof window !== "undefined") {
        window.clearTimeout(fallbackTimer);
      }
    };
  }, [textureQuality]);

  const selectedPlanet = useMemo(() => PLANETS.find((planet) => planet.id === selectedId) ?? null, [selectedId]);
  const selectedMoon = useMemo(() => MOONS.find((moon) => moon.id === selectedMoonId) ?? null, [selectedMoonId]);
  const selectedSmallBody = useMemo(
    () => (selectedSmallBodyId ? SMALL_BODY_BY_ID.get(selectedSmallBodyId) ?? null : null),
    [selectedSmallBodyId],
  );
  const selectedEclipseOccluders = useMemo(
    () => {
      void solarEphemeris.revision;
      return selectedPlanet
        ? getPlanetEclipseOccluders(selectedPlanet, { daysSinceEpoch: visualTimeDays })
        : [];
    },
    [selectedPlanet, solarEphemeris.revision, visualTimeDays],
  );
  const selectedMoonEclipseOccluders = useMemo(
    () => {
      void solarEphemeris.revision;
      return selectedMoon
        ? getMoonEclipseOccluders(selectedMoon, { daysSinceEpoch: visualTimeDays })
        : [];
    },
    [selectedMoon, solarEphemeris.revision, visualTimeDays],
  );
  const selectedContextLabel = selectedMoon
    ? selectedMoon.name
    : selectedPlanet
      ? selectedPlanet.name
      : selectedSmallBody
        ? selectedSmallBody.name
      : sunSelected
        ? "Sun"
        : asteroidBeltSelected
          ? "Asteroid belt"
          : "System overview";
  const shouldRenderFeatures = true;
  const activeTour = useMemo(
    () => SOLAR_TOURS.find((tour) => tour.id === activeTourState?.tourId) ?? null,
    [activeTourState?.tourId],
  );
  const activeTourStep = activeTour && activeTourState ? activeTour.steps[activeTourState.stepIndex] : null;

  useEffect(() => {
    if (typeof window === "undefined") return;
    // First-run modal removed: visitors arrive here from an object in the explorer and already know what
    // they came for. The guided tour remains available from the Solar controls.
    void window.localStorage.getItem(HOW_TO_KEY);
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
    const media = window.matchMedia?.("(max-width: 900px)");
    const update = () => {
      const mobile = getSolarViewportIsMobile() || (media ? media.matches : false);
      setIsMobile(mobile);
      if (mobile) {
        setDetailsCollapsed(true);
        setPanelVisibility((prev) => normalizeSolarPanelVisibility(prev, true));
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
    onScaleDomainChange(selectedId || selectedMoonId || selectedSmallBodyId ? "planetary" : "solar");
  }, [onScaleDomainChange, selectedId, selectedMoonId, selectedSmallBodyId]);

  const togglePerformanceProfile = () => {
    onQualityTierChange(performanceMode ? "high" : "balanced");
  };

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

  const requestFocus = useCallback((planetId: PlanetId | null) => {
    if (!planetId) return;
    setFocusTarget(planetId);
    setFocusToken((prev) => prev + 1);
  }, []);

  const requestMoonFocus = useCallback((moonId: string | null) => {
    if (!moonId) return;
    setFocusMoonTarget(moonId);
    setFocusMoonToken((prev) => prev + 1);
  }, []);

  const requestSunFocus = useCallback(() => {
    setFocusSunToken((prev) => prev + 1);
  }, []);

  const requestSmallBodyFocus = useCallback((bodyId: SmallBodyId | null) => {
    if (!bodyId) return;
    setFocusSmallBodyTarget(bodyId);
    setFocusSmallBodyToken((prev) => prev + 1);
  }, []);

  const selectPlanetById = useCallback(
    (
      planetId: PlanetId,
      shouldFocus = true,
      routeMode: SolarRouteUpdateMode | "none" = "push",
      targetNavigationMode?: SolarNavigationMode,
    ) => {
      setSelectedId(planetId);
      setSelectedMoonId(null);
      setSelectedSmallBodyId(null);
      setSunSelected(false);
      setAsteroidBeltSelected(false);
      setTrackId(null);
      setTrackMoonId(null);
      setDetailsCollapsed(false);
      revealContextPanels();
      if (targetNavigationMode) applyNavigationMode(targetNavigationMode);
      if (shouldFocus) requestFocus(planetId);
      emitSolarRoute(routeMode, {
        selectedPlanetId: planetId,
        selectedMoonId: null,
        selectedSmallBodyId: null,
        sunSelected: false,
        asteroidBeltSelected: false,
        ...(targetNavigationMode ? { navigationMode: targetNavigationMode } : {}),
      });
    },
    [applyNavigationMode, emitSolarRoute, requestFocus, revealContextPanels],
  );

  const selectMoonById = useCallback(
    (
      moonId: string,
      shouldFocus = true,
      routeMode: SolarRouteUpdateMode | "none" = "push",
      targetNavigationMode?: SolarNavigationMode,
    ) => {
      const moon = MOONS.find((item) => item.id === moonId);
      if (!moon) return;
      setSelectedMoonId(moon.id);
      setSelectedId(moon.parentPlanet);
      setSelectedSmallBodyId(null);
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
      revealContextPanels();
      if (targetNavigationMode) applyNavigationMode(targetNavigationMode);
      if (shouldFocus) requestMoonFocus(moon.id);
      emitSolarRoute(routeMode, {
        selectedPlanetId: moon.parentPlanet,
        selectedMoonId: moon.id,
        selectedSmallBodyId: null,
        sunSelected: false,
        asteroidBeltSelected: false,
        ...(targetNavigationMode ? { navigationMode: targetNavigationMode } : {}),
      });
    },
    [applyNavigationMode, emitSolarRoute, moonMode, requestMoonFocus, revealContextPanels],
  );

  const selectSmallBodyById = useCallback(
    (
      bodyId: SmallBodyId,
      shouldFocus = true,
      routeMode: SolarRouteUpdateMode | "none" = "push",
      targetNavigationMode?: SolarNavigationMode,
    ) => {
      if (!SMALL_BODY_BY_ID.has(bodyId)) return;
      setSelectedSmallBodyId(bodyId);
      setSelectedId(null);
      setSelectedMoonId(null);
      setSunSelected(false);
      setAsteroidBeltSelected(false);
      setTrackId(null);
      setTrackMoonId(null);
      setDetailsCollapsed(false);
      revealContextPanels();
      if (targetNavigationMode) applyNavigationMode(targetNavigationMode);
      if (shouldFocus) requestSmallBodyFocus(bodyId);
      emitSolarRoute(routeMode, {
        selectedPlanetId: null,
        selectedMoonId: null,
        selectedSmallBodyId: bodyId,
        sunSelected: false,
        asteroidBeltSelected: false,
        ...(targetNavigationMode ? { navigationMode: targetNavigationMode } : {}),
      });
    },
    [applyNavigationMode, emitSolarRoute, requestSmallBodyFocus, revealContextPanels],
  );

  const selectSun = useCallback(
    (
      shouldFocus = true,
      routeMode: SolarRouteUpdateMode | "none" = "push",
      targetNavigationMode?: SolarNavigationMode,
    ) => {
      setSunSelected(true);
      setSelectedId(null);
      setSelectedMoonId(null);
      setSelectedSmallBodyId(null);
      setAsteroidBeltSelected(false);
      setTrackId(null);
      setTrackMoonId(null);
      setDetailsCollapsed(false);
      revealContextPanels();
      if (targetNavigationMode) applyNavigationMode(targetNavigationMode);
      if (shouldFocus) requestSunFocus();
      emitSolarRoute(routeMode, {
        selectedPlanetId: null,
        selectedMoonId: null,
        selectedSmallBodyId: null,
        sunSelected: true,
        asteroidBeltSelected: false,
        ...(targetNavigationMode ? { navigationMode: targetNavigationMode } : {}),
      });
    },
    [applyNavigationMode, emitSolarRoute, requestSunFocus, revealContextPanels],
  );

  const selectAsteroidBelt = useCallback(
    (
      routeMode: SolarRouteUpdateMode | "none" = "push",
      targetNavigationMode: SolarNavigationMode = "ecliptic",
    ) => {
      setSunSelected(false);
      setSelectedId(null);
      setSelectedMoonId(null);
      setSelectedSmallBodyId(null);
      setAsteroidBeltSelected(true);
      setTrackId(null);
      setTrackMoonId(null);
      setAsteroidMode((prev) => (prev === "off" ? "simplified" : prev));
      setDetailsCollapsed(false);
      revealContextPanels();
      revealScalePanel();
      applyNavigationMode(targetNavigationMode);
      emitSolarRoute(routeMode, {
        selectedPlanetId: null,
        selectedMoonId: null,
        selectedSmallBodyId: null,
        sunSelected: false,
        asteroidBeltSelected: true,
        navigationMode: targetNavigationMode,
      });
    },
    [applyNavigationMode, emitSolarRoute, revealContextPanels, revealScalePanel],
  );

  const clearSolarSelection = useCallback(
    (routeMode: SolarRouteUpdateMode | "none" = "push") => {
      setSelectedId(null);
      setSelectedMoonId(null);
      setSelectedSmallBodyId(null);
      setSunSelected(false);
      setAsteroidBeltSelected(false);
      setTrackId(null);
      setTrackMoonId(null);
      emitSolarRoute(routeMode, {
        selectedPlanetId: null,
        selectedMoonId: null,
        selectedSmallBodyId: null,
        sunSelected: false,
        asteroidBeltSelected: false,
      });
    },
    [emitSolarRoute],
  );

  const showSolarOverview = useCallback(
    (
      mode: SolarNavigationMode = "overview",
      routeMode: SolarRouteUpdateMode | "none" = "push",
      revealPanels = true,
    ) => {
      setSelectedId(null);
      setSelectedMoonId(null);
      setSelectedSmallBodyId(null);
      setSunSelected(false);
      setAsteroidBeltSelected(false);
      setTrackId(null);
      setTrackMoonId(null);
      setDetailsCollapsed(false);
      if (revealPanels) revealContextPanels();
      applyNavigationMode(mode);
      emitSolarRoute(routeMode, {
        selectedPlanetId: null,
        selectedMoonId: null,
        selectedSmallBodyId: null,
        sunSelected: false,
        asteroidBeltSelected: false,
        navigationMode: mode,
      });
    },
    [applyNavigationMode, emitSolarRoute, revealContextPanels],
  );

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

  const handleSelectBookmark = useCallback(
    (bookmark: CameraBookmark, routeMode: SolarRouteUpdateMode | "none" = "push") => {
      const nextScaleMode = bookmark.scaleMode ?? routeSnapshotRef.current.scaleMode;
      const nextDateKey = bookmark.dateKey ?? routeSnapshotRef.current.dateKey;
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
        setSelectedSmallBodyId(null);
        setAsteroidBeltSelected(false);
      } else {
        setSunSelected(false);
        setSelectedId(bookmark.selectedPlanetId ?? null);
        setSelectedMoonId(bookmark.selectedMoonId ?? null);
        setSelectedSmallBodyId(null);
        setAsteroidBeltSelected(false);
      }
      setTrackId(bookmark.trackPlanetId ?? null);
      setTrackMoonId(bookmark.trackMoonId ?? null);
      setBookmarkTarget({ position: bookmark.position, target: bookmark.target });
      setBookmarkToken((prev) => prev + 1);
      revealContextPanels();
      emitSolarRoute(routeMode, {
        selectedPlanetId: bookmark.selectedPlanetId ?? null,
        selectedMoonId: bookmark.selectedMoonId ?? null,
        selectedSmallBodyId: null,
        sunSelected: Boolean(bookmark.sunSelected),
        asteroidBeltSelected: false,
        scaleMode: nextScaleMode,
        dateKey: nextDateKey,
      });
    },
    [clampDate, emitSolarRoute, revealContextPanels, setCurrentDate],
  );

  const handleSearchSelect = useCallback(
    (result: SolarSearchResult) => {
      if (result.kind === "sun") {
        selectSun(true, "push", "overview");
        return;
      }
      if (result.kind === "planet") {
        selectPlanetById(result.id, true, "push", "planetary");
        return;
      }
      if (result.kind === "moon") {
        selectMoonById(result.id, true, "push", "planetary");
        return;
      }
      if (result.kind === "small-body") {
        selectSmallBodyById(result.id, true, "push", "planetary");
        return;
      }
      if (result.kind === "belt") {
        selectAsteroidBelt();
        return;
      }
      handleSelectBookmark(result.bookmark);
    },
    [handleSelectBookmark, selectAsteroidBelt, selectMoonById, selectPlanetById, selectSmallBodyById, selectSun],
  );

  useEffect(() => {
    if (!initialBookmark) return;
    handleSelectBookmark(initialBookmark, "none");
  }, [handleSelectBookmark, initialBookmark, initialBookmarkToken]);

  useEffect(() => {
    if (appliedInitialTargetTokenRef.current === initialTargetToken) return;
    appliedInitialTargetTokenRef.current = initialTargetToken;
    if (!initialTarget) return;
    if (initialTarget.dateKey) {
      const [year, month, day] = initialTarget.dateKey.split("-").map(Number);
      const nextDate = new Date(Date.UTC(year, month - 1, day));
      if (!Number.isNaN(nextDate.getTime())) {
        handleDateChange(nextDate, "none");
      }
    }
    if (initialTarget.scaleMode) {
      handleScaleModeChange(initialTarget.scaleMode, "none");
    }
    if (initialTarget.kind === "overview") {
      showSolarOverview(initialTarget.navigationMode ?? "overview", "none", false);
      onInitialTargetHandled?.();
      return;
    }
    if (initialTarget.kind === "sun") {
      selectSun(true, "none", initialTarget.navigationMode);
      onInitialTargetHandled?.();
      return;
    }
    if (initialTarget.kind === "planet") {
      selectPlanetById(initialTarget.planetId, true, "none", initialTarget.navigationMode);
      onInitialTargetHandled?.();
      return;
    }
    if (initialTarget.kind === "moon") {
      selectMoonById(initialTarget.moonId, true, "none", initialTarget.navigationMode);
      onInitialTargetHandled?.();
      return;
    }
    if (initialTarget.kind === "small-body") {
      selectSmallBodyById(initialTarget.smallBodyId, true, "none", initialTarget.navigationMode);
      onInitialTargetHandled?.();
      return;
    }
    selectAsteroidBelt("none", initialTarget.navigationMode ?? "ecliptic");
    onInitialTargetHandled?.();
  }, [
    handleDateChange,
    handleScaleModeChange,
    initialTarget,
    initialTargetToken,
    onInitialTargetHandled,
    selectAsteroidBelt,
    selectMoonById,
    selectPlanetById,
    selectSmallBodyById,
    selectSun,
    showSolarOverview,
  ]);

  const applySolarTourStep = (step: SolarTourStep) => {
    setIsPlaying(false);
    setDetailsCollapsed(false);
    if (isMobile) {
      setPanelVisibility((prev) => ({ ...prev, events: false }));
    }

    switch (step.target.kind) {
      case "sun":
        selectSun(true, "push", step.target.navigationMode);
        break;
      case "planet":
        selectPlanetById(step.target.planetId, true, "push", step.target.navigationMode);
        break;
      case "moon":
        selectMoonById(step.target.moonId, true, "push", step.target.navigationMode);
        break;
      case "belt":
        selectAsteroidBelt("push", step.target.navigationMode ?? "ecliptic");
        break;
      case "overview":
        showSolarOverview(step.target.navigationMode);
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

  const applySolarEventPreset = (presetId: SolarEventPresetId) => {
    markIntroSeen();
    setIsPlaying(false);
    setPresentationMode(false);
    setDetailsCollapsed(false);

    switch (presetId) {
      case "today": {
        const nextDate = clampDate(new Date());
        handleDateChange(nextDate, "none");
        showSolarOverview("overview", "none");
        emitSolarRoute("push", {
          selectedPlanetId: null,
          selectedMoonId: null,
          selectedSmallBodyId: null,
          sunSelected: false,
          asteroidBeltSelected: false,
          navigationMode: "overview",
          dateKey: toDateKey(nextDate),
        });
        break;
      }
      case "birthday": {
        const nextDate = birthdayKey
          ? (() => {
              const [year, month, day] = birthdayKey.split("-").map(Number);
              return clampDate(new Date(Date.UTC(year, month - 1, day)));
            })()
          : clampDate(new Date());
        handleDateChange(nextDate, "none");
        selectPlanetById("earth", true, "none", "overview");
        emitSolarRoute("push", {
          selectedPlanetId: "earth",
          selectedMoonId: null,
          selectedSmallBodyId: null,
          sunSelected: false,
          asteroidBeltSelected: false,
          navigationMode: "overview",
          dateKey: toDateKey(nextDate),
        });
        break;
      }
      case "jupiter-family":
        setMoonMode("major");
        setMoonVisibilityOverrides((prev) => ({ ...prev, jupiter: true }));
        handleScaleModeChange("showcase", "none");
        setAsteroidMode("simplified");
        selectPlanetById("jupiter", true, "none", "planetary");
        emitSolarRoute("push", {
          selectedPlanetId: "jupiter",
          selectedMoonId: null,
          selectedSmallBodyId: null,
          sunSelected: false,
          asteroidBeltSelected: false,
          navigationMode: "planetary",
          scaleMode: "showcase",
        });
        break;
      case "saturn-rings":
        setMoonMode("major");
        setMoonVisibilityOverrides((prev) => ({ ...prev, saturn: true }));
        handleScaleModeChange("showcase", "none");
        setAsteroidMode("simplified");
        selectPlanetById("saturn", true, "none", "planetary");
        emitSolarRoute("push", {
          selectedPlanetId: "saturn",
          selectedMoonId: null,
          selectedSmallBodyId: null,
          sunSelected: false,
          asteroidBeltSelected: false,
          navigationMode: "planetary",
          scaleMode: "showcase",
        });
        break;
      case "inner-map":
        handleScaleModeChange("educational", "none");
        setAsteroidMode("off");
        showSolarOverview("ecliptic", "none");
        revealScalePanel();
        emitSolarRoute("push", {
          selectedPlanetId: null,
          selectedMoonId: null,
          selectedSmallBodyId: null,
          sunSelected: false,
          asteroidBeltSelected: false,
          navigationMode: "ecliptic",
          scaleMode: "educational",
        });
        break;
      case "asteroid-sweep":
        setMoonMode("off");
        handleScaleModeChange("educational", "none");
        setAsteroidMode("full");
        selectAsteroidBelt("none", "ecliptic");
        emitSolarRoute("push", {
          selectedPlanetId: null,
          selectedMoonId: null,
          selectedSmallBodyId: null,
          sunSelected: false,
          asteroidBeltSelected: true,
          navigationMode: "ecliptic",
          scaleMode: "educational",
        });
        break;
    }
  };

  const solarEventPresets = useMemo<SolarEventPreset[]>(
    () => [
      {
        id: "today",
        label: "Today",
        meta: "Current alignment",
        active: currentKey === toDateKey(clampDate(new Date())) && navigationMode === "overview",
      },
      {
        id: "birthday",
        label: "Birthday",
        meta: birthdayKey ? `Saved ${birthdayKey}` : "Uses today until saved",
        active: Boolean(isBirthdayActive && selectedId === "earth"),
      },
      {
        id: "jupiter-family",
        label: "Jupiter Family",
        meta: "Major moons",
        active: selectedId === "jupiter" && navigationMode === "planetary",
      },
      {
        id: "saturn-rings",
        label: "Saturn Rings",
        meta: "Ring pass",
        active: selectedId === "saturn" && navigationMode === "planetary",
      },
      {
        id: "inner-map",
        label: "Inner Map",
        meta: "Ecliptic scale",
        active: navigationMode === "ecliptic" && scaleMode === "educational" && asteroidMode === "off",
      },
      {
        id: "asteroid-sweep",
        label: "Asteroid Sweep",
        meta: "Belt focus",
        active: asteroidBeltSelected && asteroidMode === "full",
      },
    ],
    [asteroidBeltSelected, asteroidMode, birthdayKey, clampDate, currentKey, isBirthdayActive, navigationMode, scaleMode, selectedId],
  );

  const activePanelCount = getActiveSolarPanelCount(panelVisibility);
  const panelDockStateLabel = getSolarPanelDockStateLabel(panelVisibility, isMobile);
  const hasSelectedSolarContext = Boolean(
    selectedPlanet || selectedMoon || selectedSmallBody || sunSelected || asteroidBeltSelected,
  );
  const shouldRenderDetailsPanel =
    hasSelectedSolarContext && (panelVisibility.features || (isMobile && panelVisibility.mission));
  const featurePanelsOpen = panelVisibility.features || panelVisibility.events;
  const solarContextPanelsOpen = featurePanelsOpen || shouldRenderDetailsPanel;
  const solarDetailsPanel = shouldRenderDetailsPanel ? (
    <SolarDetailsPanel
      planet={selectedPlanet}
      moon={selectedMoon}
      smallBody={selectedSmallBody}
      sunSelected={sunSelected}
      asteroidBeltSelected={asteroidBeltSelected}
      collapsed={detailsCollapsed}
      currentDate={currentDate}
      timeDays={visualTimeDays}
      scaleMode={scaleMode}
      isTracking={Boolean(selectedId && trackId === selectedId)}
      isMoonTracking={Boolean(selectedMoonId && trackMoonId === selectedMoonId)}
      moonToggleEnabled={selectedId ? (moonVisibilityOverrides[selectedId] ?? true) : true}
      eclipseShadowsEnabled={ASTRO_QUALITY_PROFILES[qualityTier].eclipseShadows}
      eclipseCandidates={selectedEclipseOccluders}
      moonEclipseCandidates={selectedMoonEclipseOccluders}
      ringShadowsEnabled={ASTRO_QUALITY_PROFILES[qualityTier].ringShadows}
      atmosphereLutWidth={qualityProfile.atmosphereLutWidth}
      atmosphereLutHeight={qualityProfile.atmosphereLutHeight}
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
      onFocusSmallBody={() => requestSmallBodyFocus(selectedSmallBodyId)}
      onExploreSmallBody={() => {
        if (!selectedSmallBody) return;
        onExploreImagery(selectedSmallBody.searchQuery);
      }}
      earthSurfaceHref={getEarthSurfaceUrl(
        currentDate,
        selectedMoon?.id === "moon" ? "moon" : "earth-orbit",
      )}
    />
  ) : null;

  return (
    <section className={`solar-page ${presentationMode ? "is-presentation" : ""}`}>
      <div className="solar-canvas">
        <SolarScene
          timeDays={visualTimeDays}
          ephemerisSnapshot={solarEphemeris}
          isPlaying={isPlaying}
          scaleMode={scaleMode}
          performanceMode={performanceMode}
          qualityTier={qualityTier}
          textureQuality={textureQuality}
          moonMode={moonMode}
          moonVisibilityOverrides={moonVisibilityOverrides}
          asteroidMode={asteroidMode}
          selectedId={selectedId}
          selectedEclipseOccluders={selectedEclipseOccluders}
          selectedMoonEclipseOccluders={selectedMoonEclipseOccluders}
          selectedMoonId={selectedMoonId}
          selectedSmallBodyId={selectedSmallBodyId}
          sunSelected={sunSelected}
          focusTargetId={focusTarget}
          focusToken={focusToken}
          focusMoonId={focusMoonTarget}
          focusMoonToken={focusMoonToken}
          focusSunToken={focusSunToken}
          focusSmallBodyId={focusSmallBodyTarget}
          focusSmallBodyToken={focusSmallBodyToken}
          trackTargetId={trackId}
          trackMoonId={trackMoonId}
          bookmarkTarget={bookmarkTarget}
          bookmarkToken={bookmarkToken}
          navigationMode={navigationMode}
          navigationToken={navigationToken}
          cancelFlightToken={cancelFlightToken}
          adaptiveQualityEnabled={adaptiveQualityEnabled}
          onAdaptiveQualityDrop={onAdaptiveQualityDrop}
          onSelectPlanet={(planet) => {
            if (planet) {
              selectPlanetById(planet.id, false);
              return;
            }
            clearSolarSelection();
          }}
          onSelectMoon={(moon) => {
            selectMoonById(moon.id, false);
          }}
          onSelectSun={(selected) => {
            if (selected) {
              selectSun(false);
              return;
            }
            clearSolarSelection();
          }}
          onSelectSmallBody={(body) => selectSmallBodyById(body.id, false)}
          onRequestFocus={(planet) => requestFocus(planet.id)}
          onRequestSmallBodyFocus={(body) => requestSmallBodyFocus(body.id)}
          onCameraState={(state) => {
            cameraStateRef.current = state;
          }}
          onCameraFlightChange={setCameraFlight}
        />
        <CameraFlightStatus flight={cameraFlight} onCancel={cancelCameraFlight} />
      </div>

      <div className={`solar-ui ${shouldRenderDetailsPanel ? "has-context-details" : ""}`}>
        {loadingVisible && (
          <>
            <div className="solar-loading__scrim" />
            <div className={`solar-loading ${loadingProgress >= 1 ? "is-complete" : ""}`}>
              <div className="solar-loading__label">
                {loadingFallback ? "Solar texture fallback active" : "Loading solar textures..."}
              </div>
              <div
                className="solar-loading__bar"
                style={{ transform: `scaleX(${Math.max(0.04, loadingProgress)})` }}
              />
            </div>
          </>
        )}
        <div
          className={`solar-panel-dock ${activePanelCount === 0 ? "is-clean" : ""} ${
            dockCollapsed ? "is-collapsed" : ""
          }`}
          aria-label="Solar interface panels"
        >
          <div className="solar-panel-dock__status">
            <span>Panels</span>
            <strong>{activePanelCount}/{SOLAR_PANEL_CONTROLS.length}</strong>
            <em>{panelDockStateLabel}</em>
            <button
              type="button"
              className="solar-panel-dock__collapse"
              onClick={() => setDockCollapsed((prev) => !prev)}
              aria-label={dockCollapsed ? "Expand Solar panel dock" : "Collapse Solar panel dock"}
              title={dockCollapsed ? "Expand panel dock" : "Collapse panel dock"}
            >
              {dockCollapsed ? "+" : "-"}
            </button>
          </div>
          <div
            className="solar-panel-dock__ephemeris"
            data-ephemeris-status={solarEphemeris.status}
            title={solarEphemeris.error ?? solarEphemeris.message}
            aria-live="polite"
          >
            <span>Ephemeris</span>
            <strong>
              {solarEphemeris.positionsReady
                ? `VSOP87C ${solarEphemeris.activeYear}`
                : solarEphemeris.status === "loading"
                  ? "Keplerian · loading precision"
                  : "Keplerian boot"}
            </strong>
          </div>
          <div className="solar-panel-dock__buttons">
            {SOLAR_PANEL_CONTROLS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={panelVisibility[item.key] ? "active" : ""}
                onClick={() => togglePanel(item.key)}
                aria-pressed={panelVisibility[item.key]}
                title={`Toggle ${item.label}`}
              >
                {item.shortLabel}
              </button>
            ))}
          </div>
          <div className="solar-panel-dock__actions">
            <button type="button" onClick={hidePanels} aria-label="Hide all Solar panels">
              Clean
            </button>
            <button
              type="button"
              onClick={restoreDefaultPanels}
              aria-label="Restore default Solar panel layout"
            >
              Default
            </button>
            <button type="button" onClick={showPanels} aria-label="Show all Solar panels">
              All
            </button>
          </div>
        </div>
        {shouldRenderFeatures && solarContextPanelsOpen && (
          <div className={`solar-features is-open ${shouldRenderDetailsPanel ? "has-context-details" : ""}`}>
            {panelVisibility.events && (
              <div className="solar-event-rail" aria-label="Solar event presets">
                {solarEventPresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className={preset.active ? "active" : ""}
                    onClick={() => applySolarEventPreset(preset.id)}
                  >
                    <span>{preset.label}</span>
                    <em>{preset.meta}</em>
                  </button>
                ))}
              </div>
            )}
            {panelVisibility.features && (
              <>
                <SolarTopBar
                  scaleMode={scaleMode}
                  onScaleModeChange={handleScaleModeChange}
                  moonMode={moonMode}
                  onMoonModeChange={setMoonMode}
                  asteroidMode={asteroidMode}
                  onAsteroidModeChange={setAsteroidMode}
                  performanceMode={performanceMode}
                  onTogglePerformance={togglePerformanceProfile}
                  currentDate={currentDate}
                  minDate={minDate}
                  maxDate={maxDate}
                  onDateChange={handleDateChange}
                  onSetToday={() => handleDateChange(new Date())}
                  onResetDate={() => handleDateChange(minDate)}
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
              </>
            )}
            {solarDetailsPanel}
          </div>
        )}

        {panelVisibility.timeline && (
          <SolarTimeline
            currentDate={currentDate}
            minDate={minDate}
            maxDate={maxDate}
            dayIndex={dayIndex}
            maxDays={maxDays}
            isPlaying={isPlaying}
            speed={speed}
            direction={direction}
            onTogglePlay={handleTogglePlayback}
            onSpeedChange={(next) => setSpeed(next)}
            onDirectionChange={setDirection}
            onDayChange={handleDayIndexChange}
          />
        )}
        {panelVisibility.scale && (
          <SolarScaleLegend
            scaleMode={scaleMode}
            navigationMode={navigationMode}
            selectedLabel={selectedContextLabel}
          />
        )}
        {panelVisibility.mission && (
            <SolarMissionControl
            selectedLabel={selectedContextLabel}
            planet={selectedPlanet}
            moon={selectedMoon}
            smallBody={selectedSmallBody}
            sunSelected={sunSelected}
            asteroidBeltSelected={asteroidBeltSelected}
            currentDate={currentDate}
              timeDays={visualTimeDays}
              ephemerisRevision={solarEphemeris.revision}
            navigationMode={navigationMode}
            scaleMode={scaleMode}
            moonMode={moonMode}
            asteroidMode={asteroidMode}
            performanceMode={performanceMode}
            textureQuality={textureQuality}
            isPlaying={isPlaying}
            speed={speed}
            direction={direction}
            onNavigationModeChange={requestNavigationMode}
            onScaleModeChange={handleScaleModeChange}
            onMoonModeChange={setMoonMode}
            onAsteroidModeChange={setAsteroidMode}
            onTogglePerformance={togglePerformanceProfile}
            copyLinkStatus={copyLinkStatus}
            onCopyLink={handleCopySolarLink}
            onClose={() => togglePanel("mission")}
          />
        )}
        {panelVisibility.performance && (
          <SolarPerformanceOverlay
            performanceMode={performanceMode}
            textureQuality={textureQuality}
            adaptiveQualityEnabled={adaptiveQualityEnabled}
            adaptiveQualityTriggered={adaptiveQualityReport?.surface === "solar"}
            isPlaying={isPlaying}
            loadingProgress={loadingProgress}
          />
        )}
      </div>

      {showHowTo && (
        <ExperienceIntroOverlay
          eyebrow="FIRST FLIGHT"
          title="Solar Explorer is a cinematic atlas with a real AU ruler"
          body="Search any planet or major moon, scrub time, switch camera and spacing models, and inspect the system through one continuous scene."
          highlights={["Search and jump", "Time travel", "True AU spacing", "Moon context"]}
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
