// App orchestrates navigation between the three main views.
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import CosmicJourneyBar from "./components/experience/CosmicJourneyBar";
import ScaleJourneyTransition from "./components/experience/ScaleJourneyTransition";
import AppShell from "./components/layout/AppShell";
import CommandPalette, { type CommandItem } from "./components/layout/CommandPalette";
import PageContainer from "./components/layout/PageContainer";
import SurfaceErrorBoundary from "./components/layout/SurfaceErrorBoundary";
import ImagesHome from "./components/home/ImagesHome";
import YourSkyPage from "./components/saved/YourSkyPage";
import LivePage from "./components/live/LivePage";
import LandingPage from "./components/landing/LandingPage";
import { LIVE_FEEDS, liveHref } from "./shell/liveFeeds";
import { SvBar, type SvDestination } from "./shell/SvBar";
import { SettingsSheet } from "./shell/SettingsSheet";
import { exploreHref, PLACES, placeDistanceLy } from "./shell/places";
import { formatMomentDate, MOMENTS, momentHref } from "./shell/moments";
import { readSavedViews, SAVED_VIEWS_EVENT } from "./shell/savedViews";
import ResultsPage from "./components/results/ResultsPage";
import ViewerPage from "./components/viewer/ViewerPage";
import {
  getSolarTargetPath,
  readSolarTargetFromSearch,
  type SolarLaunchTarget,
  type SolarRouteUpdateMode,
} from "./features/solar/solarRoutes";
import { searchTargets } from "./utils/api";
import { filterSearchResults, filterSpaceImages } from "./utils/spaceFilter";
import type { SpaceImage } from "./models/SpaceImage";
import type { DiscoveryIntensity, DiscoverySession, DiscoverySourceStat } from "./models/DiscoverySession";
import type { SourceHealth, SourceHealthState } from "./models/SourceStatus";
import { mapSearchItem, type SearchResult } from "./utils/mapSearchItem";
import useSpaceSearch from "./hooks/useSpaceSearch";
import { clearSessionHistory, getSessionMemory, readRecentPlaces, recordSearch, recordView, type RecentImage } from "./utils/sessionMemory";
import { readWorkingCollection } from "./utils/observationCollection";
import { classifyObjectType } from "./insights/classifyObjectType";
import { estimateRarity } from "./insights/estimateRarity";
import type { CameraBookmark } from "./features/solar/cameraBookmarks";
import { PLANETS } from "./features/solar/solarData";
import { MOONS } from "./features/solar/moonData";
import type { AstronomicalCommandTarget } from "./features/exploration/astronomicalCommandTargets";
import { getSkyMapPath, readSkyMapObjectId } from "./features/skymap/core/routes";
import { getLastExplorePath } from "./features/explore/exploreRoutes";
import { EARTH_VIEWER_URL } from "./config";
import {
  buildEarthViewerBridgeUrl,
  buildScaleTransitionPlan,
  createRendererBackend,
  SCALE_TRANSITION_ARRIVE_MS,
  SCALE_TRANSITION_DEPART_MS,
  type ScaleTransitionPhase,
  type ScaleTransitionPlan,
  type ScaleDomainId,
} from "./domain/astro";
import {
  ASTRO_QUALITY_LEGACY_STORAGE_KEY,
  ASTRO_QUALITY_STORAGE_KEY,
  detectRecommendedAstroQualityTier,
  resolveInitialAstroQualitySetting,
  serializeAstroQualitySetting,
  type AstroQualitySelection,
  type AstroQualitySetting,
} from "./lib/rendering/qualityManager";
import type { AdaptiveQualityReport } from "./lib/rendering/adaptiveQuality";

type View = "landing" | "explore" | "home" | "results" | "viewer" | "solar" | "skymap" | "saved" | "live";

const SolarSystemPage = lazy(() => import("./features/solar/SolarSystemPage"));
const SkyMapPage = lazy(() => import("./features/skymap/SkyMapPage"));
const ExplorePage = lazy(() => import("./features/explore/ExplorePage"));

const DISCOVERY_BUCKETS = {
  nebula: ["Carina Nebula", "Orion Nebula", "Eagle Nebula", "Tarantula Nebula", "Ring Nebula"],
  galaxy: ["Andromeda Galaxy", "Whirlpool Galaxy", "Sombrero Galaxy", "Cartwheel Galaxy", "Spiral galaxy"],
  jwst: ["James Webb Space Telescope", "JWST NIRCam", "JWST MIRI", "JWST deep field"],
  anomaly: ["strange galaxy", "peculiar object", "gravitational lens", "cosmic collision", "odd structure"],
};

const DISCOVERY_INTENSITY_POOLS: Record<DiscoveryIntensity, string[]> = {
  balanced: ["deep field", "infrared", "supernova remnant", "stellar nursery", "nebula"],
  deep: ["deep field", "ultra deep field", "gravitational lens", "quasar", "black hole", "protostar"],
  extreme: ["gravitational lens", "quasar", "black hole", "supernova remnant", "ring galaxy", "collision", "anomaly"],
};

const DISCOVERY_INTENSITY_LABELS: Record<DiscoveryIntensity, string> = {
  balanced: "Wide-field",
  deep: "Deep-field",
  extreme: "Anomaly sweep",
};

interface DiscoveryBatch {
  results: SearchResult[];
  themes: string[];
  queries: string[];
  resultCount: number;
  sourceMix: DiscoverySourceStat[];
  sourceHealth: SourceHealth[];
  rationaleById: Record<string, string[]>;
}

const VIEWER_ROUTE_PREFIX = "/viewer/";
const VIEWER_SNAPSHOT_PREFIX = "spaceviewer.viewerSnapshot.";
const MAJOR_MOONS = MOONS.filter((moon) => moon.class === "major");

const getImageKey = (image: SpaceImage) => image.nasaId ?? image.id;

const getDiscoveryResultKey = (image: SpaceImage) => `${image.source ?? "nasa"}:${image.nasaId ?? image.id}`;

const normalizeViewerCompareSet = (items: SpaceImage[]) => {
  const unique = new Map<string, SpaceImage>();
  items.forEach((item) => {
    unique.set(`${item.source ?? "nasa"}:${getImageKey(item)}`, item);
  });
  return Array.from(unique.values()).slice(0, 4);
};

const formatLy = (ly?: number) => {
  if (ly === undefined) return "";
  if (ly < 0.01) return `${(ly * 63_241).toFixed(ly * 63_241 < 10 ? 1 : 0)} AU`;
  if (ly < 1_000_000) return `${Math.round(ly).toLocaleString("en-US")} ly`;
  return `${(ly / 1_000_000).toFixed(1)} million ly`;
};

const getInitialAstroQualitySetting = (): AstroQualitySetting => {
  const recommendedTier = detectRecommendedAstroQualityTier();
  if (typeof window === "undefined") return { mode: "auto", tier: recommendedTier };
  try {
    return resolveInitialAstroQualitySetting({
      storedSetting: window.localStorage.getItem(ASTRO_QUALITY_STORAGE_KEY),
      legacyTier: window.localStorage.getItem(ASTRO_QUALITY_LEGACY_STORAGE_KEY),
      recommendedTier,
    });
  } catch {
    return { mode: "auto", tier: recommendedTier };
  }
};

const getScaleDomainForSkyObject = (objectId?: string | null): ScaleDomainId => {
  if (!objectId) return "stellar";
  if (objectId.startsWith("solar:")) return "solar";
  if (objectId.startsWith("star:")) return "stellar";
  if (objectId.startsWith("galactic:")) return "galactic";
  if (objectId.startsWith("cosmological:")) return "cosmological";
  if (objectId.startsWith("deep:")) return "deep-space";
  return "stellar";
};

const uniqueStrings = (items: string[]) =>
  Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));

const shouldReduceScaleMotion = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true ||
    document.body.classList.contains("reduce-motion"));

const WorkspaceLoader = ({ label, detail }: { label: string; detail: string }) => (
  <div className="workspace-loader" role="status" aria-live="polite">
    <span className="workspace-loader__mark" aria-hidden="true" />
    <span className="workspace-loader__copy">
      <strong>{label}</strong>
      <em>{detail}</em>
    </span>
  </div>
);

const getDiscoverySourceLabel = (source?: string) => {
  switch ((source ?? "nasa").toLowerCase()) {
    case "sdss":
      return "SDSS";
    case "ps1":
      return "Pan-STARRS";
    case "nasa":
      return "NASA";
    default:
      return source ?? "NASA";
  }
};

const buildSourceMix = (images: SpaceImage[]): DiscoverySourceStat[] => {
  const counts = new Map<string, DiscoverySourceStat>();
  images.forEach((image) => {
    const source = image.source ?? "nasa";
    const current = counts.get(source);
    counts.set(source, {
      source,
      label: getDiscoverySourceLabel(source),
      count: (current?.count ?? 0) + 1,
    });
  });
  return Array.from(counts.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
};

const buildCollectionSourceSummary = (images: SpaceImage[]) => {
  const sourceMix = buildSourceMix(images);
  return sourceMix.length ? sourceMix.map((item) => `${item.label} ${item.count}`).join(" · ") : "Saved locally";
};

const mergeSourceMix = (current: DiscoverySourceStat[], next: DiscoverySourceStat[]) => {
  const merged = new Map<string, DiscoverySourceStat>();
  [...current, ...next].forEach((item) => {
    const existing = merged.get(item.source);
    merged.set(item.source, {
      ...item,
      count: (existing?.count ?? 0) + item.count,
    });
  });
  return Array.from(merged.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
};

const getAggregateSourceStatus = (
  count: number,
  checks: number,
  unavailable: number,
  errors: number,
  loadedChecks: number,
): SourceHealthState => {
  if (errors === checks) return "error";
  if (count > 0 && (unavailable > 0 || errors > 0 || loadedChecks < checks)) return "partial";
  if (count > 0) return "loaded";
  if (unavailable > 0 || errors > 0) return "unavailable";
  return "empty";
};

const buildSourceHealthMessage = (
  status: SourceHealthState,
  checks: number,
  loadedChecks: number,
  unavailable: number,
  errors: number,
) => {
  if (status === "partial") {
    return `${loadedChecks} of ${checks} archive checks returned imagery.`;
  }
  if (status === "loaded") {
    return `${loadedChecks} of ${checks} archive checks returned imagery.`;
  }
  if (status === "unavailable") {
    return unavailable ? `${unavailable} archive checks could not resolve coordinates.` : "Archive checks returned no imagery.";
  }
  if (status === "error") {
    return `${errors} archive checks failed.`;
  }
  return "Archive checks returned no imagery.";
};

const aggregateDiscoverySourceHealth = (items: SourceHealth[][]): SourceHealth[] => {
  const buckets = new Map<
    string,
    {
      source: string;
      label: string;
      count: number;
      checks: number;
      loadedChecks: number;
      unavailable: number;
      errors: number;
      hasMore: boolean;
      checkedAt?: string;
    }
  >();

  items.flat().forEach((item) => {
    const current =
      buckets.get(item.source) ??
      {
        source: item.source,
        label: item.label,
        count: 0,
        checks: 0,
        loadedChecks: 0,
        unavailable: 0,
        errors: 0,
        hasMore: false,
        checkedAt: item.checkedAt,
      };
    current.count += item.count;
    current.checks += 1;
    current.loadedChecks += item.count > 0 ? 1 : 0;
    current.unavailable += item.status === "unavailable" ? 1 : 0;
    current.errors += item.status === "error" ? 1 : 0;
    current.hasMore = current.hasMore || Boolean(item.hasMore);
    current.checkedAt = item.checkedAt ?? current.checkedAt;
    buckets.set(item.source, current);
  });

  return Array.from(buckets.values()).map((bucket) => {
    const status = getAggregateSourceStatus(
      bucket.count,
      bucket.checks,
      bucket.unavailable,
      bucket.errors,
      bucket.loadedChecks,
    );
    return {
      source: bucket.source,
      label: bucket.label,
      status,
      count: bucket.count,
      hasMore: bucket.hasMore,
      checkedAt: bucket.checkedAt,
      message: buildSourceHealthMessage(status, bucket.checks, bucket.loadedChecks, bucket.unavailable, bucket.errors),
    };
  });
};

const mergeSourceHealth = (current: SourceHealth[], next: SourceHealth[]) =>
  aggregateDiscoverySourceHealth([current, next]);

const buildDiscoveryRationale = (
  image: SpaceImage,
  objectType: ReturnType<typeof classifyObjectType>,
  rarity: ReturnType<typeof estimateRarity>,
  searchTerm: string,
) => {
  const reasons = [`Query: ${searchTerm}`];
  if (rarity.level !== "Common") {
    reasons.push(rarity.level);
  }
  if (objectType !== "Unknown") {
    reasons.push(objectType);
  }
  if (image.mission && /jwst|james webb/i.test(image.mission)) {
    reasons.push("Webb signal");
  } else if (image.instrument && /miri|nircam|nirspec/i.test(image.instrument)) {
    reasons.push(image.instrument);
  }
  return uniqueStrings(reasons).slice(0, 4);
};

const buildDiscoverySummary = (intensity: DiscoveryIntensity, themes: string[]) => {
  const primaryThemes = themes.slice(0, 3).join(", ");
  if (intensity === "extreme") {
    return `Prioritized unusual and high-rarity observations across ${primaryThemes || "multiple sky themes"}.`;
  }
  if (intensity === "deep") {
    return `Weighted toward deep-field targets, lenses, and harder-to-find observations.`;
  }
  return `Balanced iconic targets with a few unexpected archive finds.`;
};

const buildDiscoveryName = (intensity: DiscoveryIntensity, themes: string[]) => {
  const label = DISCOVERY_INTENSITY_LABELS[intensity];
  const anchor = themes.find((theme) => !/jwst|james webb/i.test(theme)) ?? themes[0] ?? "Cosmos";
  return `${label}: ${anchor}`;
};

const makeDiscoverySessionId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `discovery-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
};

const createDiscoverySession = (batch: DiscoveryBatch, intensity: DiscoveryIntensity): DiscoverySession => ({
  id: makeDiscoverySessionId(),
  name: buildDiscoveryName(intensity, batch.themes),
  intensity,
  createdAt: new Date().toISOString(),
  summary: buildDiscoverySummary(intensity, batch.themes),
  themes: batch.themes,
  queries: batch.queries,
  resultCount: batch.resultCount,
  batchCount: 1,
  sourceMix: batch.sourceMix,
  sourceHealth: batch.sourceHealth,
  rationaleById: batch.rationaleById,
});

const extendDiscoverySession = (session: DiscoverySession, batch: DiscoveryBatch): DiscoverySession => ({
  ...session,
  summary: buildDiscoverySummary(session.intensity, uniqueStrings([...session.themes, ...batch.themes])),
  themes: uniqueStrings([...session.themes, ...batch.themes]).slice(0, 10),
  queries: uniqueStrings([...session.queries, ...batch.queries]).slice(0, 16),
  resultCount: session.resultCount + batch.resultCount,
  batchCount: session.batchCount + 1,
  sourceMix: mergeSourceMix(session.sourceMix, batch.sourceMix),
  sourceHealth: mergeSourceHealth(session.sourceHealth, batch.sourceHealth),
  rationaleById: {
    ...session.rationaleById,
    ...batch.rationaleById,
  },
});

const getViewerPath = (image: SpaceImage) => `${VIEWER_ROUTE_PREFIX}${encodeURIComponent(getImageKey(image))}`;

const getViewerRouteKey = (path: string) => {
  if (!path.startsWith(VIEWER_ROUTE_PREFIX)) return null;
  const encoded = path.slice(VIEWER_ROUTE_PREFIX.length);
  if (!encoded) return null;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
};

const sanitizeViewerSnapshot = (image: SpaceImage): SpaceImage => ({
  id: image.id,
  nasaId: image.nasaId,
  source: image.source,
  archiveId: image.archiveId,
  sourceUrl: image.sourceUrl,
  matchReason: image.matchReason,
  metadataQuality: image.metadataQuality,
  dimensions: image.dimensions,
  title: image.title,
  description: image.description,
  keywords: Array.isArray(image.keywords) ? image.keywords : [],
  date: image.date,
  center: image.center,
  mission: image.mission,
  instrument: image.instrument,
  photographer: image.photographer,
  imageUrl: image.imageUrl,
  thumbnailUrl: image.thumbnailUrl,
  fullRes: image.fullRes,
  archiveUrl: image.archiveUrl,
});

const readViewerSnapshot = (imageKey: string): SpaceImage | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${VIEWER_SNAPSHOT_PREFIX}${imageKey}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SpaceImage>;
    if (
      typeof parsed.id !== "string" ||
      typeof parsed.title !== "string" ||
      typeof parsed.description !== "string" ||
      !Array.isArray(parsed.keywords) ||
      typeof parsed.date !== "string" ||
      typeof parsed.imageUrl !== "string"
    ) {
      return null;
    }
    return parsed as SpaceImage;
  } catch (error) {
    console.warn("Unable to restore viewer snapshot", error);
    return null;
  }
};

const writeViewerSnapshot = (image: SpaceImage) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${VIEWER_SNAPSHOT_PREFIX}${getImageKey(image)}`, JSON.stringify(sanitizeViewerSnapshot(image)));
  } catch (error) {
    console.warn("Unable to store viewer snapshot", error);
  }
};

// Images (search, gallery, wandering) live at /images (the older /archive still works); "/" is the homepage.
const isImagesPath = (pathname: string) => pathname === "/images" || pathname === "/archive";
const buildImagesPath = (params?: { q?: string; source?: string; wander?: boolean }) => {
  const search = new URLSearchParams();
  if (params?.q) search.set("q", params.q);
  if (params?.source && params.source !== "all") search.set("source", params.source);
  if (params?.wander) search.set("wander", "1");
  const query = search.toString();
  return query ? `/images?${query}` : "/images";
};
const pushImagesPath = (params?: { q?: string; source?: string; wander?: boolean }) => {
  if (typeof window === "undefined") return;
  const path = buildImagesPath(params);
  if (`${window.location.pathname}${window.location.search}` !== path) window.history.pushState(null, "", path);
};

// "/" is the homepage; it only opens the universe for old links that name an object or a moment.
const isExploreRoute = (pathname: string, search: string) =>
  (pathname === "/" && /[?&](object|moment)=/.test(search)) ||
  pathname === "/explore" ||
  pathname.startsWith("/explore/") ||
  (pathname === "/skymap" && !search.includes("classic=1"));

// True once the viewer was opened from inside the app, so "Back" can return through history.
let viewerHasAppHistory = false;

const pushViewerPath = (image: SpaceImage, replace = false) => {
  if (typeof window === "undefined") return;
  viewerHasAppHistory = true;
  const path = getViewerPath(image);
  if (window.location.pathname !== path) {
    // Flipping through a compare set replaces the entry, so Back leaves the set instead of replaying it.
    if (replace) window.history.replaceState({ view: "viewer", imageKey: getImageKey(image) }, "", path);
    else window.history.pushState({ view: "viewer", imageKey: getImageKey(image) }, "", path);
  }
};

const App = () => {
  const [view, setView] = useState<View>(() => {
    if (typeof window === "undefined") return "landing";
    if (isExploreRoute(window.location.pathname, window.location.search)) return "explore";
    return window.location.pathname === "/" ? "landing" : "home";
  });
  const [exploreToken, setExploreToken] = useState(0);
  const [exploreEverOpened, setExploreEverOpened] = useState(false);
  const [liveFeedId, setLiveFeedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("all");
  const [selected, setSelected] = useState<SpaceImage | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [manualResults, setManualResults] = useState<SpaceImage[]>([]);
  const [discoveryMode, setDiscoveryMode] = useState(false);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [discoveryIntensity, setDiscoveryIntensity] = useState<DiscoveryIntensity>("balanced");
  const [discoverySession, setDiscoverySession] = useState<DiscoverySession | null>(null);
  const [pendingSolarBookmark, setPendingSolarBookmark] = useState<CameraBookmark | null>(null);
  const [solarBookmarkToken, setSolarBookmarkToken] = useState(0);
  const [pendingSolarTarget, setPendingSolarTarget] = useState<SolarLaunchTarget | null>(null);
  const [solarTargetToken, setSolarTargetToken] = useState(0);
  const [pendingSkyMapObjectId, setPendingSkyMapObjectId] = useState<string | null>(null);
  const [skyMapObjectToken, setSkyMapObjectToken] = useState(0);
  const [commandOpen, setCommandOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [savedViewCount, setSavedViewCount] = useState(() => (typeof window === "undefined" ? 0 : readSavedViews().length));
  const [astronomicalCommandTargets, setAstronomicalCommandTargets] = useState<AstronomicalCommandTarget[]>([]);
  const [astronomicalCommandStatus, setAstronomicalCommandStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [commandMemory, setCommandMemory] = useState(() => getSessionMemory());
  const [commandCollection, setCommandCollection] = useState(() => readWorkingCollection());
  const [viewerCompareSet, setViewerCompareSet] = useState<SpaceImage[]>([]);
  const [activeScaleDomain, setActiveScaleDomain] = useState<ScaleDomainId>(() =>
    typeof window !== "undefined" && window.location.pathname === "/solar" ? "solar" : "stellar",
  );
  const [scaleTransition, setScaleTransition] = useState<{
    phase: ScaleTransitionPhase;
    plan: ScaleTransitionPlan;
  } | null>(null);
  const [qualitySetting, setQualitySetting] = useState<AstroQualitySetting>(getInitialAstroQualitySetting);
  const [adaptiveQualityReport, setAdaptiveQualityReport] = useState<AdaptiveQualityReport | null>(null);
  const qualityTier = qualitySetting.tier;
  const qualityMode = qualitySetting.mode;
  const rendererBackend = useMemo(() => createRendererBackend(), []);
  const activeScaleDomainRef = useRef(activeScaleDomain);
  const viewRef = useRef(view);
  const scaleTransitionTimerRef = useRef<number | null>(null);
  const astronomicalCommandLoadRef = useRef<Promise<void> | null>(null);
  const searchFromUrlRef = useRef<((q: string, source: string) => void) | null>(null);
  const discoverySessionRef = useRef<DiscoverySession | null>(null);
  const openSavedCollectionRef = useRef<(() => void) | null>(null);
  const latestSearchRef = useRef("");

  const { loading, error, results: hookResults, performSearch, loadMore, hasMore, sourceStatus } = useSpaceSearch();

  useLayoutEffect(() => {
    activeScaleDomainRef.current = activeScaleDomain;
    viewRef.current = view;
  }, [activeScaleDomain, view]);

  const clearScaleTransitionTimer = useCallback(() => {
    if (scaleTransitionTimerRef.current === null) return;
    window.clearTimeout(scaleTransitionTimerRef.current);
    scaleTransitionTimerRef.current = null;
  }, []);

  useEffect(() => clearScaleTransitionTimer, [clearScaleTransitionTimer]);

  const runScaleTransition = useCallback(
    (targetDomain: ScaleDomainId, navigate: () => void) => {
      const sourceDomain = activeScaleDomainRef.current;
      const plan = buildScaleTransitionPlan(sourceDomain, targetDomain);
      const currentView = viewRef.current;
      const isAstronomicalSurface = currentView === "solar" || currentView === "skymap";

      clearScaleTransitionTimer();
      if (!plan?.rendererSwapRequired || !isAstronomicalSurface || shouldReduceScaleMotion()) {
        setScaleTransition(null);
        navigate();
        return;
      }

      setScaleTransition({ phase: "departing", plan });
      scaleTransitionTimerRef.current = window.setTimeout(() => {
        navigate();
        activeScaleDomainRef.current = targetDomain;
        setScaleTransition({ phase: "arriving", plan });
        scaleTransitionTimerRef.current = window.setTimeout(() => {
          setScaleTransition(null);
          scaleTransitionTimerRef.current = null;
        }, SCALE_TRANSITION_ARRIVE_MS);
      }, SCALE_TRANSITION_DEPART_MS);
    },
    [clearScaleTransitionTimer],
  );

  const refreshCommandMemory = useCallback(() => {
    setCommandMemory(getSessionMemory());
  }, []);

  const refreshCommandCollection = useCallback(() => {
    setCommandCollection(readWorkingCollection());
  }, []);

  const openCommandPalette = useCallback(() => {
    refreshCommandMemory();
    refreshCommandCollection();
    if (astronomicalCommandStatus !== "ready" && !astronomicalCommandLoadRef.current) {
      setAstronomicalCommandStatus("loading");
      astronomicalCommandLoadRef.current = import("./features/exploration/astronomicalCommandTargets")
        .then(({ ASTRONOMICAL_COMMAND_TARGETS }) => {
          setAstronomicalCommandTargets(ASTRONOMICAL_COMMAND_TARGETS);
          setAstronomicalCommandStatus("ready");
        })
        .catch((error) => {
          setAstronomicalCommandStatus("error");
          console.warn("Unable to load the expanded astronomical command index", error);
        })
        .finally(() => {
          astronomicalCommandLoadRef.current = null;
        });
    }
    setCommandOpen(true);
  }, [astronomicalCommandStatus, refreshCommandCollection, refreshCommandMemory]);

  const handleQualitySelectionChange = useCallback((selection: AstroQualitySelection) => {
    setAdaptiveQualityReport(null);
    if (selection === "auto") {
      setQualitySetting({ mode: "auto", tier: detectRecommendedAstroQualityTier() });
      return;
    }
    setQualitySetting({ mode: "manual", tier: selection });
  }, []);

  const handleAdaptiveQualityDrop = useCallback(
    (report: AdaptiveQualityReport) => {
      if (qualityMode !== "auto" || report.fromTier !== qualityTier) return;
      setQualitySetting({ mode: "auto", tier: report.toTier });
      setAdaptiveQualityReport(report);
    },
    [qualityMode, qualityTier],
  );

  useEffect(() => {
    const sync = () => setSavedViewCount(readSavedViews().length);
    window.addEventListener(SAVED_VIEWS_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(SAVED_VIEWS_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncCollection = () => refreshCommandCollection();
    syncCollection();
    window.addEventListener("spaceviewer:collection-updated", syncCollection);
    window.addEventListener("storage", syncCollection);
    window.addEventListener("focus", syncCollection);
    return () => {
      window.removeEventListener("spaceviewer:collection-updated", syncCollection);
      window.removeEventListener("storage", syncCollection);
      window.removeEventListener("focus", syncCollection);
    };
  }, [refreshCommandCollection]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncViewWithPath = () => {
      const path = window.location.pathname;
      if (isExploreRoute(path, window.location.search)) {
        clearScaleTransitionTimer();
        setScaleTransition(null);
        setViewerCompareSet([]);
        setExploreToken((prev) => prev + 1);
        setView("explore");
        return;
      }
      if (path === "/solar") {
        const target = readSolarTargetFromSearch(window.location.search) ?? { kind: "overview" as const };
        const targetDomain = target.kind === "planet" || target.kind === "moon" ? "planetary" : "solar";
        runScaleTransition(targetDomain, () => {
          setViewerCompareSet([]);
          setPendingSolarTarget(target);
          setSolarTargetToken((prev) => prev + 1);
          setActiveScaleDomain(targetDomain);
          setView("solar");
        });
        return;
      }
      if (path === "/skymap") {
        const objectId = readSkyMapObjectId(window.location.search);
        const targetDomain = getScaleDomainForSkyObject(objectId);
        runScaleTransition(targetDomain, () => {
          setViewerCompareSet([]);
          setPendingSkyMapObjectId(objectId);
          setSkyMapObjectToken((prev) => prev + 1);
          setActiveScaleDomain(targetDomain);
          setView("skymap");
        });
        return;
      }
      if (path === "/") {
        setViewerCompareSet([]);
        setView("landing");
        return;
      }
      if (path === "/saved") {
        setViewerCompareSet([]);
        setView("saved");
        return;
      }
      if (path === "/live") {
        setViewerCompareSet([]);
        setLiveFeedId(new URLSearchParams(window.location.search).get("feed"));
        setView("live");
        return;
      }
      const viewerKey = getViewerRouteKey(path);
      if (viewerKey) {
        const snapshot = readViewerSnapshot(viewerKey);
        if (snapshot) {
          setViewerCompareSet([]);
          setSelected(snapshot);
          setView("viewer");
          return;
        }
        window.history.replaceState(null, "", "/images");
      }
      if (isImagesPath(path)) {
        const params = new URLSearchParams(window.location.search);
        if (path === "/archive") window.history.replaceState(null, "", buildImagesPath({ q: params.get("q") ?? undefined, source: params.get("source") ?? undefined }));
        setViewerCompareSet([]);
        const q = params.get("q");
        if (q) {
          searchFromUrlRef.current?.(q, params.get("source") ?? "all");
          return;
        }
        if (params.get("saved")) {
          openSavedCollectionRef.current?.();
          return;
        }
        if (params.get("wander") && discoverySessionRef.current) {
          setView("results");
          return;
        }
        setView("home");
        return;
      }
      // Unknown address: the homepage is the front door.
      window.history.replaceState(null, "", "/");
      setView("landing");
    };
    syncViewWithPath();
    window.addEventListener("popstate", syncViewWithPath);
    return () => window.removeEventListener("popstate", syncViewWithPath);
  }, [clearScaleTransitionTimer, runScaleTransition]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(ASTRO_QUALITY_LEGACY_STORAGE_KEY, qualityTier);
      window.localStorage.setItem(ASTRO_QUALITY_STORAGE_KEY, serializeAstroQualitySetting(qualitySetting));
    } catch {
      // Storage may be unavailable in private or restricted browser contexts.
    }
  }, [qualitySetting, qualityTier]);

  useEffect(() => {
    if (!discoveryMode && hookResults.length) {
      setResults(hookResults);
    }
  }, [discoveryMode, hookResults]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (view === "home") {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  }, [view]);

  const handleSearch = async (override?: string, sourceOverride?: string, options: { push?: boolean } = {}) => {
    const rawQuery = typeof override === "string" ? override : query;
    const activeQuery = rawQuery.trim();
    const activeSource = (sourceOverride ?? source).trim() || "all";
    if (!activeQuery) {
      return;
    }

    setDiscoveryMode(false);
    setDiscoverySession(null);
    setManualResults([]);
    setViewerCompareSet([]);
    setQuery(activeQuery);
    setSource(activeSource);
    recordSearch(activeQuery);
    refreshCommandMemory();
    if (options.push !== false) pushImagesPath({ q: activeQuery, source: activeSource });
    setResults([]);
    setSelected(null);
    setView("results");
    latestSearchRef.current = `${activeQuery}|${activeSource}`;
    const searchKey = latestSearchRef.current;
    const fetchedResults = await performSearch(activeQuery, activeSource);
    if (latestSearchRef.current !== searchKey) return;
    setResults(fetchedResults.length ? fetchedResults : []);
  };

  useLayoutEffect(() => {
    searchFromUrlRef.current = (q: string, sourceValue: string) => {
      setQuery(q);
      void handleSearch(q, sourceValue, { push: false });
    };
    discoverySessionRef.current = discoverySession;
    openSavedCollectionRef.current = () => {
      const items = readWorkingCollection().items.map((item) => item.image);
      setDiscoveryMode(false);
      setDiscoverySession(null);
      setResults([]);
      setManualResults(items);
      setSelected(null);
      setView(items.length ? "results" : "saved");
    };
  });

  const handleSelectResult = (result: SpaceImage, compareSet?: SpaceImage[], options: { replace?: boolean } = {}) => {
    const nextCompareSet = normalizeViewerCompareSet(compareSet ?? []);
    setViewerCompareSet(nextCompareSet.length > 1 ? nextCompareSet : []);
    recordView(result);
    writeViewerSnapshot(result);
    refreshCommandMemory();
    pushViewerPath(result, options.replace);
    setSelected(result);
    setView("viewer");
  };

  const handleInspectCompareSet = (items: SpaceImage[], selectedItem?: SpaceImage) => {
    const normalizedItems = normalizeViewerCompareSet(items);
    const nextSelected = selectedItem ?? normalizedItems[0];
    if (!nextSelected) {
      return;
    }
    handleSelectResult(nextSelected, normalizedItems);
  };

  const handleNavigateToResults = () => {
    if (discoveryMode) pushImagesPath({ wander: true });
    else if (manualResults.length) pushImagesPath({ q: undefined });
    else pushImagesPath({ q: query.trim() || undefined, source });
    if (!manualResults.length && !results.length && !hookResults.length) {
      const fallbackQuery = query.trim() || "JWST";
      handleSearch(fallbackQuery);
      return;
    }
    setView("results");
  };

  const mappedResults = useMemo(() => filterSpaceImages(results.map(mapSearchItem)), [results]);
  const mappedHookResults = useMemo(() => filterSpaceImages(hookResults.map(mapSearchItem)), [hookResults]);
  const derivedResults = manualResults.length ? manualResults : mappedResults.length ? mappedResults : mappedHookResults;
  const derivedHasMore = manualResults.length || results.length ? false : hasMore;

  const handleSelectFeatured = (item: SpaceImage, sourceItems: SearchResult[]) => {
    setDiscoveryMode(false);
    setDiscoverySession(null);
    setManualResults([]);
    setViewerCompareSet([]);
    setResults(sourceItems);
    recordView(item);
    writeViewerSnapshot(item);
    refreshCommandMemory();
    pushViewerPath(item);
    setSelected(item);
    setView("viewer");
  };

  const handleOpenObservationCollection = (items: SpaceImage[], selectedItem?: SpaceImage) => {
    if (!items.length) {
      return;
    }

    setDiscoveryMode(false);
    setDiscoverySession(null);
    setViewerCompareSet([]);
    setResults([]);
    setManualResults(items);
    refreshCommandMemory();
    refreshCommandCollection();

    if (selectedItem) {
      recordView(selectedItem);
      writeViewerSnapshot(selectedItem);
      pushViewerPath(selectedItem);
      setSelected(selectedItem);
      setView("viewer");
      return;
    }

    if (typeof window !== "undefined" && `${window.location.pathname}${window.location.search}` !== "/images?saved=1") {
      window.history.pushState(null, "", "/images?saved=1");
    }
    setSelected(null);
    setView("results");
  };

  const pickRandom = useCallback((items: string[]) => items[Math.floor(Math.random() * items.length)], []);

  const buildDiscoveryBatch = useCallback(async () => {
    setDiscoveryLoading(true);
    try {
      const extraCount = discoveryIntensity === "extreme" ? 6 : discoveryIntensity === "deep" ? 4 : 2;
      const intensityPool = DISCOVERY_INTENSITY_POOLS[discoveryIntensity];
      const extraPicks = Array.from({ length: extraCount }, () => pickRandom(intensityPool));
      const picks = [
        pickRandom(DISCOVERY_BUCKETS.nebula),
        pickRandom(DISCOVERY_BUCKETS.galaxy),
        pickRandom(DISCOVERY_BUCKETS.jwst),
        pickRandom(DISCOVERY_BUCKETS.anomaly),
        ...extraPicks,
      ];

      const responses = await Promise.all(
        picks.map(async (term) => ({
          term,
          response: await searchTargets(term, 1, "all"),
        })),
      );
      const pooled = responses.flatMap(({ term, response }) =>
        response.success ? response.results.slice(0, 10).map((raw) => ({ raw, term })) : [],
      );
      const filteredRaw = new Set(filterSearchResults(pooled.map((entry) => entry.raw)));
      const filteredPool = pooled.filter((entry) => filteredRaw.has(entry.raw));

      const unique = new Map<
        string,
        {
          raw: SearchResult;
          mapped: SpaceImage;
          term: string;
          type: ReturnType<typeof classifyObjectType>;
          rarity: ReturnType<typeof estimateRarity>;
          rarityScore: number;
        }
      >();
      let ranked = filteredPool
        .map(({ raw, term }) => {
          const mapped = mapSearchItem(raw);
          const type = classifyObjectType(mapped);
          const rarity = estimateRarity(mapped, type);
          return { raw, mapped, term, type, rarity, rarityScore: rarity.score };
        })
        .sort((a, b) => b.rarityScore - a.rarityScore);

      if (discoveryIntensity === "deep") {
        ranked = ranked.slice(0, Math.max(16, Math.ceil(ranked.length * 0.7)));
      }
      if (discoveryIntensity === "extreme") {
        ranked = ranked.slice(0, Math.max(14, Math.ceil(ranked.length * 0.4)));
      }
      if (discoveryIntensity === "balanced") {
        ranked = ranked.sort(() => Math.random() - 0.5);
      }

      for (const entry of ranked) {
        const key = getDiscoveryResultKey(entry.mapped);
        if (!unique.has(key)) {
          unique.set(key, entry);
        }
      }

      const entries = Array.from(unique.values());
      return {
        results: entries.map((entry) => entry.raw),
        themes: uniqueStrings(entries.map((entry) => entry.term)).slice(0, 8),
        queries: uniqueStrings(picks),
        resultCount: entries.length,
        sourceMix: buildSourceMix(entries.map((entry) => entry.mapped)),
        sourceHealth: aggregateDiscoverySourceHealth(responses.map(({ response }) => response.sourceStatus)),
        rationaleById: Object.fromEntries(
          entries.map((entry) => [
            getDiscoveryResultKey(entry.mapped),
            buildDiscoveryRationale(entry.mapped, entry.type, entry.rarity, entry.term),
          ]),
        ),
      };
    } finally {
      setDiscoveryLoading(false);
    }
  }, [discoveryIntensity, pickRandom]);

  const startDiscovery = useCallback(async () => {
    setDiscoveryMode(true);
    setManualResults([]);
    setViewerCompareSet([]);
    setSource("all");
    setResults([]);
    pushImagesPath({ wander: true });
    setView("results");
    const batch = await buildDiscoveryBatch();
    setDiscoverySession(createDiscoverySession(batch, discoveryIntensity));
    setResults(batch.results);
    setQuery("Explore Random Universe");
    setView("results");
  }, [buildDiscoveryBatch, discoveryIntensity]);

  const loadMoreDiscovery = useCallback(async () => {
    if (discoveryLoading) return;
    const batch = await buildDiscoveryBatch();
    setDiscoverySession((prev) =>
      prev ? extendDiscoverySession(prev, batch) : createDiscoverySession(batch, discoveryIntensity),
    );
    setResults((prev) => [...prev, ...batch.results]);
  }, [buildDiscoveryBatch, discoveryIntensity, discoveryLoading]);

  const continueDiscoveryWithMore = useCallback(async () => {
    setManualResults([]);
    setViewerCompareSet([]);
    await loadMoreDiscovery();
    pushImagesPath({ wander: true });
    setView("results");
  }, [loadMoreDiscovery]);

  const openSolarExplorer = useCallback((bookmark?: CameraBookmark) => {
    setViewerCompareSet([]);
    setPendingSolarBookmark(bookmark ?? null);
    setPendingSolarTarget(bookmark ? null : { kind: "overview" });
    setSolarBookmarkToken((prev) => prev + 1);
    setActiveScaleDomain("solar");
    setView("solar");
    if (typeof window !== "undefined" && `${window.location.pathname}${window.location.search}` !== "/solar") {
      window.history.pushState(null, "", "/solar");
    }
  }, []);

  const openSolarTarget = useCallback((target: SolarLaunchTarget) => {
    setViewerCompareSet([]);
    setPendingSolarBookmark(null);
    setPendingSolarTarget(target);
    setSolarTargetToken((prev) => prev + 1);
    setActiveScaleDomain(target.kind === "planet" || target.kind === "moon" ? "planetary" : "solar");
    setView("solar");
    if (typeof window !== "undefined") {
      const path = getSolarTargetPath(target);
      if (`${window.location.pathname}${window.location.search}` !== path) {
        window.history.pushState(null, "", path);
      }
    }
  }, []);

  const clearPendingSolarTarget = useCallback(() => {
    setPendingSolarTarget(null);
  }, []);

  const handleSolarTargetSelectionChange = useCallback(
    (target: SolarLaunchTarget, mode: SolarRouteUpdateMode) => {
      setActiveScaleDomain(target.kind === "planet" || target.kind === "moon" ? "planetary" : "solar");
      if (typeof window === "undefined") return;
      const path = getSolarTargetPath(target);
      const currentPath = `${window.location.pathname}${window.location.search}`;
      if (currentPath === path) return;
      const state = { view: "solar", target };
      if (mode === "replace") {
        window.history.replaceState(state, "", path);
        return;
      }
      window.history.pushState(state, "", path);
    },
    [],
  );

  // Every universe destination now opens in the explorer; SkyMap object ids remain valid links.
  const openSkyMap = useCallback((objectId?: string | null) => {
    setViewerCompareSet([]);
    setPendingSolarBookmark(null);
    setPendingSolarTarget(null);
    if (typeof window !== "undefined") {
      const path = objectId ? `/explore?object=${encodeURIComponent(objectId)}` : "/explore";
      if (`${window.location.pathname}${window.location.search}` !== path) {
        window.history.pushState({ view: "explore" }, "", path);
      }
    }
    setExploreToken((prev) => prev + 1);
    setView("explore");
  }, []);

  const openClassicSkyMap = useCallback(() => {
    setViewerCompareSet([]);
    setPendingSkyMapObjectId(null);
    setSkyMapObjectToken((prev) => prev + 1);
    setActiveScaleDomain("stellar");
    setView("skymap");
    if (typeof window !== "undefined") window.history.pushState(null, "", "/skymap?classic=1");
  }, []);

  const handleSkyMapObjectSelectionChange = useCallback((objectId: string | null) => {
    setActiveScaleDomain(getScaleDomainForSkyObject(objectId));
    if (typeof window === "undefined") return;
    const basePath = getSkyMapPath(objectId);
    const path = `${basePath}${basePath.includes("?") ? "&" : "?"}classic=1`;
    if (`${window.location.pathname}${window.location.search}` !== path) {
      window.history.pushState({ view: "skymap", objectId }, "", path);
    }
  }, []);

  const getEarthSurfaceUrl = useCallback(
    (timestamp = new Date(), mode: "earth-orbit" | "moon" | "true-scale" = "earth-orbit") => {
      if (!EARTH_VIEWER_URL || typeof window === "undefined") return "";
      const returnUrl = new URL(
        getSolarTargetPath({
          kind: mode === "moon" ? "moon" : "planet",
          ...(mode === "moon" ? { moonId: "moon" } : { planetId: "earth" }),
          navigationMode: "planetary",
          dateKey: timestamp.toISOString().slice(0, 10),
        } as SolarLaunchTarget),
        window.location.origin,
      ).toString();
      return buildEarthViewerBridgeUrl({
        baseUrl: EARTH_VIEWER_URL,
        returnUrl,
        timestamp,
        quality: qualityTier,
        mode,
      });
    },
    [qualityTier],
  );

  const openEarthSurface = useCallback(() => {
    const target = getEarthSurfaceUrl();
    if (target && typeof window !== "undefined") window.location.assign(target);
  }, [getEarthSurfaceUrl]);

  const openEarthSurfaceWithTransition = useCallback(() => {
    runScaleTransition("surface", openEarthSurface);
  }, [openEarthSurface, runScaleTransition]);

  const openSolarExplorerWithTransition = useCallback(
    (bookmark?: CameraBookmark) => {
      runScaleTransition("solar", () => openSolarExplorer(bookmark));
    },
    [openSolarExplorer, runScaleTransition],
  );

  const openSolarTargetWithTransition = useCallback(
    (target: SolarLaunchTarget) => {
      const targetDomain = target.kind === "planet" || target.kind === "moon" ? "planetary" : "solar";
      runScaleTransition(targetDomain, () => openSolarTarget(target));
    },
    [openSolarTarget, runScaleTransition],
  );



  // Scale domains (Solar Explorer / Sky Atlas journey bar): each domain opens its natural tool.
  const openSkyMapWithTransition = useCallback(
    (objectId?: string | null) => {
      runScaleTransition(getScaleDomainForSkyObject(objectId), () => openSkyMap(objectId));
    },
    [openSkyMap, runScaleTransition],
  );

  const handleScaleDomainSelect = useCallback(
    (domainId: ScaleDomainId) => {
      switch (domainId) {
        case "surface":
          openEarthSurfaceWithTransition();
          return;
        case "planetary":
          openSolarTargetWithTransition({ kind: "planet", planetId: "earth", navigationMode: "planetary" });
          return;
        case "solar":
          openSolarExplorerWithTransition();
          return;
        case "stellar":
          openSkyMapWithTransition("star:nearby:proxima-centauri");
          return;
        case "deep-space":
          openSkyMapWithTransition("deep:galaxy:andromeda-galaxy");
          return;
        case "galactic":
          openSkyMapWithTransition("galactic:milky-way-structure");
          return;
        case "cosmological":
          openSkyMapWithTransition("cosmological:observable-universe-model");
          return;
      }
    },
    [openEarthSurfaceWithTransition, openSkyMapWithTransition, openSolarExplorerWithTransition, openSolarTargetWithTransition],
  );

  const navigateHome = useCallback(() => {
    setViewerCompareSet([]);
    setPendingSolarBookmark(null);
    setPendingSolarTarget(null);
    setPendingSkyMapObjectId(null);
    if (typeof window !== "undefined" && !isExploreRoute(window.location.pathname, window.location.search)) {
      window.history.pushState({ view: "explore" }, "", getLastExplorePath() ?? "/explore");
    }
    setExploreToken((prev) => prev + 1);
    setView("explore");
  }, []);

  const navigateArchive = useCallback(() => {
    setViewerCompareSet([]);
    setView("home");
    pushImagesPath();
  }, []);

  const navigateSaved = useCallback(() => {
    setViewerCompareSet([]);
    setView("saved");
    if (typeof window !== "undefined" && window.location.pathname !== "/saved") window.history.pushState(null, "", "/saved");
  }, []);

  /** Open any in-app address (saved views, moments, places) as if it had been navigated to. */
  const openHref = useCallback((href: string) => {
    if (typeof window === "undefined") return;
    if (`${window.location.pathname}${window.location.search}` !== href) window.history.pushState(null, "", href);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, []);

  const openPlace = useCallback((placeId: string) => openHref(exploreHref(placeId)), [openHref]);

  const navigateLanding = useCallback(() => {
    setViewerCompareSet([]);
    setView("landing");
    if (typeof window !== "undefined" && `${window.location.pathname}${window.location.search}` !== "/") window.history.pushState(null, "", "/");
    window.scrollTo({ top: 0 });
  }, []);

  const navigateLive = useCallback((feedId?: string) => {
    setViewerCompareSet([]);
    setLiveFeedId(feedId ?? null);
    setView("live");
    const path = feedId ? `/live?feed=${feedId}` : "/live";
    if (typeof window !== "undefined" && `${window.location.pathname}${window.location.search}` !== path) window.history.pushState(null, "", path);
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openCommandPalette();
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [openCommandPalette]);

  useEffect(() => {
    if (commandOpen) {
      refreshCommandMemory();
      refreshCommandCollection();
    }
  }, [commandOpen, refreshCommandCollection, refreshCommandMemory]);

  const openRecentImage = useCallback(
    (item: RecentImage) => {
      const snapshot = readViewerSnapshot(item.nasaId ?? item.id);
      if (snapshot) {
        handleSelectResult(snapshot);
        return;
      }
      handleSearch(item.title);
    },
    [handleSelectResult, handleSearch],
  );

  if (view === "explore" && !exploreEverOpened) setExploreEverOpened(true);

  const handleNavigate = useCallback(
    (destination: SvDestination) => {
      setCommandOpen(false);
      switch (destination) {
        case "home":
          navigateLanding();
          return;
        case "universe":
          navigateHome();
          return;
        case "images":
          navigateArchive();
          return;
        case "saved":
          navigateSaved();
          return;
        case "live":
          navigateLive();
          return;
        case "solar":
          openSolarExplorerWithTransition();
          return;
        case "atlas":
          openClassicSkyMap();
          return;
      }
    },
    [navigateArchive, navigateHome, navigateLanding, navigateLive, navigateSaved, openClassicSkyMap, openSolarExplorerWithTransition],
  );

  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const savedCount = savedViewCount + commandCollection.items.length;

  const renderCurrentView = () => {
    if (view === "skymap") {
      return (
        <SkyMapPage
          onOpenImagery={(image) => handleOpenObservationCollection([image], image)}
          onOpenSolarExplorer={(target) => {
            if (target) {
              openSolarTargetWithTransition(target);
              return;
            }
            openSolarExplorerWithTransition();
          }}
          initialObjectId={pendingSkyMapObjectId}
          initialObjectToken={skyMapObjectToken}
          onObjectSelectionChange={handleSkyMapObjectSelectionChange}
          qualityTier={qualityTier}
          adaptiveQualityEnabled={qualityMode === "auto"}
          onAdaptiveQualityDrop={handleAdaptiveQualityDrop}
          onScaleDomainChange={setActiveScaleDomain}
        />
      );
    }

    if (view === "solar") {
      return (
        <SolarSystemPage
          initialBookmark={pendingSolarBookmark}
          initialBookmarkToken={solarBookmarkToken}
          initialTarget={pendingSolarTarget}
          initialTargetToken={solarTargetToken}
          onInitialTargetHandled={clearPendingSolarTarget}
          onTargetSelectionChange={handleSolarTargetSelectionChange}
          onExploreImagery={(queryValue) => handleSearch(queryValue, "all")}
          qualityTier={qualityTier}
          adaptiveQualityEnabled={qualityMode === "auto"}
          adaptiveQualityReport={adaptiveQualityReport}
          onAdaptiveQualityDrop={handleAdaptiveQualityDrop}
          onQualityTierChange={(tier) => handleQualitySelectionChange(tier)}
          onScaleDomainChange={setActiveScaleDomain}
          getEarthSurfaceUrl={getEarthSurfaceUrl}
        />
      );
    }

    if (view === "results") {
      return (
        <PageContainer>
          <ResultsPage
            results={derivedResults}
            onSelect={handleSelectResult}
            onInspectCompareSet={handleInspectCompareSet}
            loadMore={discoveryMode ? loadMoreDiscovery : loadMore}
            hasMore={discoveryMode ? true : derivedHasMore}
            loading={loading || discoveryLoading}
            discoverySession={discoverySession}
            sourceStatus={discoveryMode ? discoverySession?.sourceHealth : sourceStatus}
            heading={discoveryMode ? discoverySession?.name ?? "Wandering the archives" : manualResults.length ? "Your saved photographs" : query ? query : "Photographs"}
            onBackToImages={navigateArchive}
            onSearch={(value) => handleSearch(value)}
            onOpenPlace={openPlace}
            query={discoveryMode || manualResults.length ? "" : query}
          />
        </PageContainer>
      );
    }

    if (view === "viewer" && selected) {
      return (
        <PageContainer>
          <ViewerPage
            selected={selected}
            relatedPool={derivedResults}
            onSelectRelated={handleSelectResult}
            compareSet={viewerCompareSet}
            onSelectCompareItem={(item) => handleSelectResult(item, viewerCompareSet, { replace: true })}
            onSearch={handleSearch}
            onBack={() => {
              if (viewerHasAppHistory) window.history.back();
              else handleNavigateToResults();
            }}
            discoverySession={discoverySession}
            onOpenPlace={openPlace}
          />
        </PageContainer>
      );
    }

    if (view === "landing") {
      return (
        <LandingPage
          onEnterUniverse={navigateHome}
          onOpenPlace={openPlace}
          onOpenHref={openHref}
          onOpenImages={navigateArchive}
          onSearchImages={(value) => handleSearch(value, "all")}
          onOpenLive={navigateLive}
          onOpenSaved={navigateSaved}
          onOpenFind={openCommandPalette}
          onOpenTool={(tool) => (tool === "solar" ? openSolarExplorerWithTransition() : openClassicSkyMap())}
        />
      );
    }

    if (view === "live") {
      return <LivePage feedId={liveFeedId} onSelectFeed={(id) => navigateLive(id)} onOpenPlace={openPlace} />;
    }

    if (view === "saved") {
      return (
        <YourSkyPage
          onOpenHref={openHref}
          onOpenCollection={handleOpenObservationCollection}
          onOpenRecentImage={openRecentImage}
          onOpenSolarBookmark={(bookmark) => openSolarExplorerWithTransition(bookmark)}
          onSearch={(value) => handleSearch(value)}
          onContinueDiscovery={handleNavigateToResults}
          discoverySession={discoverySession}
        />
      );
    }

    return (
      <ImagesHome
        query={query}
        setQuery={setQuery}
        source={source}
        setSource={setSource}
        discoveryIntensity={discoveryIntensity}
        setDiscoveryIntensity={setDiscoveryIntensity}
        onSearch={handleSearch}
        onStartDiscovery={startDiscovery}
        onContinueDiscovery={handleNavigateToResults}
        onExpandDiscovery={continueDiscoveryWithMore}
        discoverySession={discoverySession}
        discoveryLoading={discoveryLoading}
        onSelectFeatured={handleSelectFeatured}
        onOpenRecent={openRecentImage}
        onOpenPlace={openPlace}
        onOpenSaved={navigateSaved}
        onOpenLive={navigateLive}
        savedCount={savedCount}
        error={error}
        loading={loading}
      />
    );
  };

  const workspaceLoading = useMemo(() => {
    if (view === "solar") return { label: "Preparing Solar Explorer", detail: "Loading the 3D scene, orbit controls and textures." };
    if (view === "skymap") return { label: "Preparing Sky Atlas", detail: "Loading the catalogue layers and object registry." };
    return { label: "Loading", detail: "Preparing this part of SpaceViewer." };
  }, [view]);

  const activeDestination: SvDestination | null =
    view === "landing" ? null : view === "explore" ? "universe" : view === "saved" ? "saved" : view === "live" ? "live" : view === "solar" ? "solar" : view === "skymap" ? "atlas" : "images";
  const shellContext = view === "home" ? "images" : view === "explore" ? "images" : view;

  const savedCollectionItems = commandCollection.items;
  const savedCollectionImages = useMemo(() => savedCollectionItems.map((item) => item.image), [savedCollectionItems]);
  const savedCollectionSourceSummary = useMemo(() => buildCollectionSourceSummary(savedCollectionImages), [savedCollectionImages]);
  const newestSavedItem = savedCollectionItems[0];
  const placeIcon = (kind: string) => (kind === "galaxy" ? "universe" : kind === "spacecraft" ? "fly" : "compass");

  const placeCommandItems = useMemo<CommandItem[]>(
    () =>
      PLACES.map((place) => {
        const distance = placeDistanceLy(place);
        return {
          id: `place:${place.id}`,
          label: place.name,
          meta: [place.blurb, distance !== undefined ? formatLy(distance) : null].filter(Boolean).join(" · "),
          badge: "Fly",
          group: "Places" as const,
          icon: placeIcon(place.kind),
          keywords: [place.kind, ...place.aliases, place.blurb].join(" "),
          defaultHidden: true,
          onSelect: () => openPlace(place.id),
        };
      }),
    [openPlace],
  );

  const solarObjectCommandItems = useMemo<CommandItem[]>(
    () => [
      {
        id: "solar-object:sun",
        label: "Solar Explorer: Sun",
        meta: "Open the Sun in Solar Explorer",
        badge: "Tool",
        group: "Tools" as const,
        keywords: "sun sol star heliocentric solar explorer",
        defaultHidden: true,
        onSelect: () => openSolarTargetWithTransition({ kind: "sun", navigationMode: "overview" }),
      },
      ...PLANETS.map<CommandItem>((planet) => ({
        id: `solar-object:planet:${planet.id}`,
        label: `Solar Explorer: ${planet.name}`,
        meta: `Eclipses, ruler and mission tools around ${planet.name}`,
        badge: "Tool",
        group: "Tools",
        keywords: [planet.id, planet.name, planet.searchQuery, "planet", "solar explorer", ...(planet.facts ?? [])].join(" "),
        defaultHidden: true,
        onSelect: () => openSolarTargetWithTransition({ kind: "planet", planetId: planet.id, navigationMode: "planetary" }),
      })),
      ...MAJOR_MOONS.map<CommandItem>((moon) => ({
        id: `solar-object:moon:${moon.id}`,
        label: `Solar Explorer: ${moon.name}`,
        meta: `Open ${moon.name} in Solar Explorer`,
        badge: "Tool",
        group: "Tools",
        keywords: [moon.id, moon.name, moon.parentPlanet, "moon", "solar explorer", ...(moon.facts ?? [])].join(" "),
        defaultHidden: true,
        onSelect: () => openSolarTargetWithTransition({ kind: "moon", moonId: moon.id, navigationMode: "planetary" }),
      })),
      {
        id: "solar-object:belt",
        label: "Solar Explorer: Asteroid belt",
        meta: "Open the ecliptic belt view",
        badge: "Tool",
        group: "Tools",
        keywords: "asteroid belt ecliptic solar orbit map",
        defaultHidden: true,
        onSelect: () => openSolarTargetWithTransition({ kind: "belt", navigationMode: "ecliptic" }),
      },
    ],
    [openSolarTargetWithTransition],
  );

  const expandedAstronomicalCommandItems = useMemo<CommandItem[]>(() => {
    const known = new Set(PLACES.map((place) => place.id));
    return astronomicalCommandTargets
      .map((target) => {
        const placeId =
          target.destination.surface === "skymap"
            ? target.destination.objectId
            : target.destination.target.kind === "small-body"
              ? `solar:small-body:${target.destination.target.smallBodyId}`
              : null;
        if (placeId && known.has(placeId)) {
          // The universe owns the place; keep the specialist route as a tool result.
          if (target.destination.surface !== "solar") return null;
          const solarTarget = target.destination.target;
          return {
            id: `tool:${target.id}`,
            label: `Solar Explorer: ${target.label}`,
            meta: target.meta,
            badge: "Tool",
            group: "Tools" as const,
            keywords: target.keywords,
            defaultHidden: true,
            onSelect: () => openSolarTargetWithTransition(solarTarget),
          } satisfies CommandItem;
        }
        return {
          id: target.id,
          label: target.label,
          meta: target.meta.replace(/^Focus in SkyMap · /, "").replace(/ · curated navigation seed$/, "").replace(/in SkyMap/g, "in the universe"),
          badge: placeId ? "Fly" : target.badge,
          group: "Places" as const,
          keywords: target.keywords,
          defaultHidden: true,
          onSelect: () => {
            if (placeId) {
              openPlace(placeId);
              return;
            }
            if (target.destination.surface === "solar") openSolarTargetWithTransition(target.destination.target);
          },
        } satisfies CommandItem;
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }, [astronomicalCommandTargets, openPlace, openSolarTargetWithTransition]);

  const atlasCommandItems = useMemo<CommandItem[]>(
    () =>
      PLACES.filter((place) => !place.id.startsWith("explore:") && !place.id.startsWith("spacecraft:")).map((place) => ({
        id: `atlas:${place.id}`,
        label: `Sky Atlas: ${place.name}`,
        meta: "Catalogue layers, constellations and annotations around this object",
        badge: "Tool",
        group: "Tools" as const,
        icon: "layers",
        keywords: [place.name, ...place.aliases, "skymap sky atlas catalogue layers"].join(" "),
        defaultHidden: true,
        onSelect: () => openHref(`/skymap?classic=1&object=${encodeURIComponent(place.id)}`),
      })),
    [openHref],
  );

  const recentPlaces = commandOpen ? readRecentPlaces() : [];
  const savedViews = commandOpen ? readSavedViews() : [];

  const commandItems: CommandItem[] = [
    // Places first: an exact name should open the object itself before a Moment or tool about it.
    ...placeCommandItems,
    ...expandedAstronomicalCommandItems,
    ...MOMENTS.map<CommandItem>((moment) => ({
      id: `moment:${moment.id}`,
      label: moment.title,
      meta: `Replay · ${formatMomentDate(moment.at)}`,
      badge: "Moment",
      group: "Moments",
      icon: "clock",
      keywords: `moment replay event history ${moment.story}`,
      onSelect: () => openHref(momentHref(moment)),
    })),
    ...savedViews.slice(0, 5).map<CommandItem>((saved) => ({
      id: `saved-view:${saved.id}`,
      label: saved.name,
      meta: `Saved view · ${saved.category}`,
      badge: "Saved",
      group: "Your sky",
      icon: "star",
      thumb: saved.thumb,
      keywords: "saved view your sky",
      onSelect: () => openHref(saved.href),
    })),
    ...(savedCollectionImages.length
      ? [
          {
            id: "collection:open",
            label: "Saved photographs",
            meta: `${savedCollectionImages.length} saved · ${savedCollectionSourceSummary}`,
            badge: "Collection",
            group: "Your sky" as const,
            icon: "images",
            keywords: "saved collection working observations gallery resume",
            onSelect: () => handleOpenObservationCollection(savedCollectionImages),
          },
          ...(newestSavedItem
            ? [
                {
                  id: "collection:newest",
                  label: newestSavedItem.image.title,
                  meta: "Newest saved photograph",
                  badge: "Saved",
                  group: "Your sky" as const,
                  thumb: newestSavedItem.image.thumbnailUrl || newestSavedItem.image.imageUrl,
                  keywords: ["saved collection newest viewer", newestSavedItem.image.mission, newestSavedItem.image.instrument].filter(Boolean).join(" "),
                  onSelect: () => handleOpenObservationCollection(savedCollectionImages, newestSavedItem.image),
                },
              ]
            : []),
        ]
      : []),
    ...savedCollectionItems.slice(1, 5).map<CommandItem>((item) => ({
      id: `collection:item:${item.key}`,
      label: item.image.title,
      meta: [item.image.mission || item.image.instrument || item.image.center || "Saved photograph", item.image.date].filter(Boolean).join(" · "),
      badge: "Saved",
      group: "Your sky",
      thumb: item.image.thumbnailUrl || item.image.imageUrl,
      defaultHidden: true,
      keywords: [item.image.source, item.image.mission, item.image.instrument, item.image.center, ...(item.image.keywords ?? [])].filter(Boolean).join(" "),
      onSelect: () => handleOpenObservationCollection(savedCollectionImages, item.image),
    })),
    ...recentPlaces.slice(0, 3).map<CommandItem>((place) => ({
      id: `recent-place:${place.id}`,
      label: place.name,
      meta: `Visited · ${place.category}`,
      badge: "Fly",
      group: "Recent",
      icon: "universe",
      keywords: "recent place visited",
      onSelect: () => openHref(place.href),
    })),
    ...(discoverySession
      ? [
          {
            id: `discovery:${discoverySession.id}`,
            label: discoverySession.name,
            meta: `${discoverySession.resultCount} photographs · keep wandering`,
            badge: "Wander",
            group: "Recent" as const,
            icon: "sparkle",
            keywords: ["continue discovery wander", discoverySession.name, ...discoverySession.themes].join(" "),
            onSelect: handleNavigateToResults,
          },
        ]
      : []),
    ...Object.entries(commandMemory.searches)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map<CommandItem>(([search]) => ({
        id: `search:${search}`,
        label: search,
        meta: "Recent search",
        badge: "Search",
        group: "Recent",
        icon: "search",
        keywords: "recent query gallery",
        onSelect: () => handleSearch(search),
      })),
    ...(commandMemory.viewedImages ?? []).slice(0, 4).map<CommandItem>((item) => ({
      id: `view:${item.nasaId ?? item.id}`,
      label: item.title,
      meta: [item.mission || item.instrument || item.center || "Viewed photograph", item.date].filter(Boolean).join(" · "),
      badge: "Viewed",
      group: "Recent",
      thumb: item.thumbnailUrl || item.imageUrl,
      keywords: [item.source, item.mission, item.instrument, item.center].filter(Boolean).join(" "),
      onSelect: () => openRecentImage(item),
    })),
    ...derivedResults.slice(0, 5).map<CommandItem>((item) => ({
      id: `result:${getImageKey(item)}`,
      label: item.title,
      meta: [item.mission || item.instrument || item.center || "Current result", item.date].filter(Boolean).join(" · "),
      badge: "Result",
      group: "Photographs",
      thumb: item.thumbnailUrl || item.imageUrl,
      defaultHidden: true,
      keywords: [item.source, item.mission, item.instrument, item.center, ...(item.keywords ?? [])].filter(Boolean).join(" "),
      onSelect: () => handleSelectResult(item),
    })),
    {
      id: "route:home",
      label: "Home",
      meta: "The SpaceViewer homepage",
      badge: "Go",
      group: "Go to",
      icon: "home",
      keywords: "home start landing front page",
      defaultHidden: true,
      onSelect: navigateLanding,
    },
    {
      id: "route:explore",
      label: "Universe",
      meta: "The live, true-scale universe",
      badge: "Go",
      group: "Go to",
      icon: "universe",
      keywords: "explore universe map stars galaxies skymap home 3d",
      onSelect: () => navigateHome(),
    },
    {
      id: "route:archive",
      label: "Images",
      meta: "Search NASA, SDSS and Pan-STARRS photographs",
      badge: "Go",
      group: "Go to",
      icon: "images",
      keywords: "archive search images gallery photographs home",
      onSelect: navigateArchive,
    },
    {
      id: "route:gallery",
      label: "Current gallery",
      meta: manualResults.length || results.length || hookResults.length ? "Return to the current set of photographs" : "Open a Webb gallery",
      badge: "Go",
      group: "Go to",
      icon: "grid",
      keywords: "results images compare viewer gallery",
      defaultHidden: true,
      onSelect: handleNavigateToResults,
    },
    {
      id: "route:saved",
      label: "Your sky",
      meta: `${savedCount} saved · views, photographs, bookmarks`,
      badge: "Go",
      group: "Go to",
      icon: "star",
      keywords: "saved collection bookmarks for you history",
      onSelect: navigateSaved,
    },
    {
      id: "route:wander",
      label: "Wander the archives",
      meta: "Something you've never seen, ranked by how unusual it is",
      badge: "Go",
      group: "Go to",
      icon: "sparkle",
      keywords: "discover random explore surprise discovery session",
      onSelect: () => void startDiscovery(),
    },
    {
      id: "route:live",
      label: "Live from space",
      meta: "The Space Station, launch pads, the Sun and Earth right now",
      badge: "Go",
      group: "Go to",
      icon: "live",
      keywords: "live feed iss stream video space station webcam launch sun earth now aurora",
      onSelect: () => navigateLive(),
    },
    ...LIVE_FEEDS.map<CommandItem>((feed) => ({
      id: `live:${feed.id}`,
      label: feed.title,
      meta: `${feed.kind === "stream" ? "Live" : feed.cadence} · ${feed.source}`,
      badge: "Live",
      group: "Live",
      icon: "live",
      thumb: feed.poster,
      keywords: [feed.summary, feed.source, feed.group, "live stream feed video now"].join(" "),
      defaultHidden: true,
      onSelect: () => openHref(liveHref(feed)),
    })),
    {
      id: "route:settings",
      label: "Settings",
      meta: "Motion, 3D quality, explanations, your data, credits",
      badge: "Go",
      group: "Go to",
      icon: "settings",
      keywords: "settings preferences reduce motion quality credits",
      onSelect: openSettings,
    },
    {
      id: "route:solar",
      label: "Solar Explorer",
      meta: "Eclipses, true-AU ruler, mission tools, birthdays, bookmarks",
      badge: "Tool",
      group: "Tools",
      icon: "tools",
      keywords: "solar system planets orbits eclipse",
      onSelect: () => openSolarExplorerWithTransition(),
    },
    {
      id: "route:skymap-classic",
      label: "Sky Atlas",
      meta: "Catalogue layers, constellation boundaries, DESI light cone, annotations",
      badge: "Tool",
      group: "Tools",
      icon: "layers",
      keywords: "skymap layers classic desi constellations annotations atlas catalogue",
      onSelect: openClassicSkyMap,
    },
    ...(EARTH_VIEWER_URL
      ? [
          {
            id: "route:earth-surface",
            label: "Stand on Earth",
            meta: "Open the Earth surface viewer at this moment",
            badge: "Tool",
            group: "Tools" as const,
            icon: "universe",
            keywords: "earth surface ground globe viewer cesium",
            onSelect: openEarthSurfaceWithTransition,
          },
        ]
      : []),
    ...solarObjectCommandItems,
    ...atlasCommandItems,
  ];

  const palette = (
    <CommandPalette
      open={commandOpen}
      items={commandItems}
      supplementalItemsLoading={astronomicalCommandStatus === "loading"}
      onClose={() => setCommandOpen(false)}
      onSearch={(value) => handleSearch(value)}
    />
  );

  const settings = (
    <SettingsSheet
      open={settingsOpen}
      onClose={() => setSettingsOpen(false)}
      quality={qualitySetting}
      onQualityChange={handleQualitySelectionChange}
      onNavigate={handleNavigate}
      onClearHistory={() => {
        clearSessionHistory();
        refreshCommandMemory();
      }}
    />
  );

  // The universe stays mounted once opened, so returning to it is instant and keeps its state.
  // Kept alive behind the photograph surfaces; released for Solar Explorer and Sky Atlas so two 3D
  // renderers never hold GPU memory at once (phones in particular).
  const exploreMounted = view === "explore" || (exploreEverOpened && view !== "solar" && view !== "skymap");
  const explore = exploreMounted ? (
    <SurfaceErrorBoundary key="explore" surfaceLabel="Universe" onNavigateHome={navigateArchive}>
      <Suspense fallback={view === "explore" ? <div className="ex-boot" aria-label="Loading the universe" /> : null}>
        <ExplorePage
          locationToken={exploreToken}
          active={view === "explore"}
          onOpenImagery={(queryValue) => handleSearch(queryValue, "all")}
          onOpenImage={(image, pool) => handleSelectFeatured(image, pool)}
          onOpenSolar={(target) => openSolarTarget(target)}
          onOpenLive={(feedId) => navigateLive(feedId)}
          renderBar={(search, actions) => (
            <SvBar
              active="universe"
              variant="overlay"
              onNavigate={handleNavigate}
              onOpenFind={openCommandPalette}
              onOpenSettings={openSettings}
              savedCount={savedCount}
              search={search}
              actions={actions}
            />
          )}
        />
      </Suspense>
    </SurfaceErrorBoundary>
  ) : null;

  if (view === "explore") {
    return (
      <div className="sv-app sv-app--universe">
        {explore}
        {palette}
        {settings}
      </div>
    );
  }

  return (
    <>
      {explore}
      <AppShell
        active={activeDestination}
        context={shellContext as "landing" | "images" | "results" | "viewer" | "saved" | "live" | "solar" | "skymap"}
        onNavigate={handleNavigate}
        onOpenCommand={openCommandPalette}
        onOpenSettings={openSettings}
        savedCount={savedCount}
      >
        <SurfaceErrorBoundary key={view} surfaceLabel={view === "home" ? "Images" : view} onNavigateHome={navigateHome}>
          <Suspense fallback={<WorkspaceLoader label={workspaceLoading.label} detail={workspaceLoading.detail} />}>
            {view === "solar" || view === "skymap" ? (
              <PageContainer>
                <CosmicJourneyBar
                  activeDomain={activeScaleDomain}
                  qualityTier={qualityTier}
                  qualityMode={qualityMode}
                  adaptiveQualityReport={adaptiveQualityReport}
                  rendererBackend={rendererBackend}
                  earthSurfaceAvailable={Boolean(EARTH_VIEWER_URL)}
                  onSelectDomain={handleScaleDomainSelect}
                  onQualitySelectionChange={handleQualitySelectionChange}
                />
                {renderCurrentView()}
              </PageContainer>
            ) : (
              renderCurrentView()
            )}
          </Suspense>
        </SurfaceErrorBoundary>
      </AppShell>
      {palette}
      {settings}
      {scaleTransition ? <ScaleJourneyTransition phase={scaleTransition.phase} plan={scaleTransition.plan} /> : null}
    </>
  );
};

export default App;
