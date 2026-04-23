// App orchestrates navigation between the three main views.
import { useCallback, useEffect, useMemo, useState } from "react";
import AppShell from "./components/layout/AppShell";
import PageContainer from "./components/layout/PageContainer";
import HomePage from "./components/home/HomePage";
import ResultsPage from "./components/results/ResultsPage";
import ViewerPage from "./components/viewer/ViewerPage";
import SolarSystemPage from "./features/solar/SolarSystemPage";
import SkyMapPage from "./features/skymap/SkyMapPage";
import { runAnalysis, searchTargets, type AnalysisData } from "./utils/api";
import { filterSearchResults, filterSpaceImages } from "./utils/spaceFilter";
import { buildAIContext } from "./utils/buildAIContext";
import type { SpaceImage } from "./models/SpaceImage";
import { mapSearchItem, type SearchResult } from "./utils/mapSearchItem";
import useSpaceSearch from "./hooks/useSpaceSearch";
import { recordSearch, recordView } from "./utils/sessionMemory";
import { classifyObjectType } from "./ai/classifyObjectType";
import { estimateRarity } from "./ai/estimateRarity";
import type { CameraBookmark } from "./features/solar/cameraBookmarks";

type View = "home" | "results" | "viewer" | "solar" | "skymap";
type DiscoveryIntensity = "balanced" | "deep" | "extreme";

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

const PRODUCT_ROUTES = new Set(["/solar", "/skymap"]);

const App = () => {
  const [view, setView] = useState<View>("home");
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("all");
  const [selected, setSelected] = useState<SpaceImage | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [discoveryMode, setDiscoveryMode] = useState(false);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [discoveryIntensity, setDiscoveryIntensity] = useState<DiscoveryIntensity>("balanced");
  const [pendingSolarBookmark, setPendingSolarBookmark] = useState<CameraBookmark | null>(null);
  const [solarBookmarkToken, setSolarBookmarkToken] = useState(0);

  const { loading, error, results: hookResults, performSearch, loadMore, hasMore } = useSpaceSearch();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncViewWithPath = () => {
      const path = window.location.pathname;
      if (path === "/solar") {
        setView("solar");
        return;
      }
      if (path === "/skymap") {
        setView("skymap");
        return;
      }
      if (path !== "/") {
        window.history.replaceState(null, "", "/");
      }
      setView("home");
    };
    syncViewWithPath();
    window.addEventListener("popstate", syncViewWithPath);
    return () => window.removeEventListener("popstate", syncViewWithPath);
  }, []);

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

  const handleSearch = async (override?: string, sourceOverride?: string) => {
    const rawQuery = typeof override === "string" ? override : query;
    const activeQuery = rawQuery.trim();
    const activeSource = (sourceOverride ?? source).trim() || "all";
    if (!activeQuery) {
      return;
    }

    setDiscoveryMode(false);
    setQuery(activeQuery);
    setSource(activeSource);
    recordSearch(activeQuery);
    if (typeof window !== "undefined" && PRODUCT_ROUTES.has(window.location.pathname)) {
      window.history.pushState(null, "", "/");
    }
    const fetchedResults = await performSearch(activeQuery, activeSource);
    setResults(fetchedResults.length ? fetchedResults : []);
    setView("results");
  };

  const handleSelectResult = (result: SpaceImage) => {
    recordView(result);
    setSelected(result);
    setAnalysis(null);
    setView("viewer");
  };

  const handleRunAnalysis = async () => {
    if (!selected) {
      return;
    }
    if (selected.source && selected.source !== "nasa") {
      setAnalysis(null);
      return;
    }
    setAnalysisLoading(true);
    try {
      const context = buildAIContext(selected);
      const data = await runAnalysis(selected.nasaId ?? selected.id, context);
      setAnalysis(data);
    } finally {
      setAnalysisLoading(false);
    }
  };

  const handleNavigateToResults = () => {
    if (typeof window !== "undefined" && PRODUCT_ROUTES.has(window.location.pathname)) {
      window.history.pushState(null, "", "/");
    }
    if (!results.length && !hookResults.length) {
      const fallbackQuery = query.trim() || "JWST";
      handleSearch(fallbackQuery);
      return;
    }
    setView("results");
  };

  const mappedResults = useMemo(() => filterSpaceImages(results.map(mapSearchItem)), [results]);
  const mappedHookResults = useMemo(() => filterSpaceImages(hookResults.map(mapSearchItem)), [hookResults]);
  const derivedResults = mappedResults.length ? mappedResults : mappedHookResults;
  const derivedHasMore = results.length ? false : hasMore;

  const handleSelectFeatured = (item: SpaceImage, sourceItems: SearchResult[]) => {
    setDiscoveryMode(false);
    setResults(sourceItems);
    setSelected(item);
    setAnalysis(null);
    if (typeof window !== "undefined" && PRODUCT_ROUTES.has(window.location.pathname)) {
      window.history.pushState(null, "", "/");
    }
    setView("viewer");
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

      const responses = await Promise.all(picks.map((term) => searchTargets(term, 1, "all")));
      const pooled = responses.flatMap((response) => (response.success ? response.results.slice(0, 10) : []));
      const filteredPool = filterSearchResults(pooled);

      const unique = new Map<string, SearchResult>();
      let ranked = filteredPool
        .map((raw) => {
          const mapped = mapSearchItem(raw);
          const type = classifyObjectType(mapped);
          const rarity = estimateRarity(mapped, type);
          return { raw, mapped, rarityScore: rarity.score };
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
        if (!unique.has(entry.mapped.id)) {
          unique.set(entry.mapped.id, entry.raw);
        }
      }

      return Array.from(unique.values());
    } finally {
      setDiscoveryLoading(false);
    }
  }, [discoveryIntensity, pickRandom]);

  const startDiscovery = useCallback(async () => {
    setDiscoveryMode(true);
    setSource("all");
    const batch = await buildDiscoveryBatch();
    setResults(batch);
    setQuery("Explore Random Universe");
    setView("results");
  }, [buildDiscoveryBatch]);

  const loadMoreDiscovery = useCallback(async () => {
    if (discoveryLoading) return;
    const batch = await buildDiscoveryBatch();
    setResults((prev) => [...prev, ...batch]);
  }, [buildDiscoveryBatch, discoveryLoading]);

  const openSolarExplorer = useCallback((bookmark?: CameraBookmark) => {
    setPendingSolarBookmark(bookmark ?? null);
    setSolarBookmarkToken((prev) => prev + 1);
    setView("solar");
    if (typeof window !== "undefined" && window.location.pathname !== "/solar") {
      window.history.pushState(null, "", "/solar");
    }
  }, []);

  const openSkyMap = useCallback(() => {
    setPendingSolarBookmark(null);
    setView("skymap");
    if (typeof window !== "undefined" && window.location.pathname !== "/skymap") {
      window.history.pushState(null, "", "/skymap");
    }
  }, []);

  const renderCurrentView = () => {
    if (view === "skymap") {
      return <SkyMapPage onOpenSolarExplorer={() => openSolarExplorer()} />;
    }

    if (view === "solar") {
      return (
        <SolarSystemPage
          initialBookmark={pendingSolarBookmark}
          initialBookmarkToken={solarBookmarkToken}
          onExploreImagery={(queryValue) => handleSearch(queryValue, "all")}
        />
      );
    }

    if (view === "results") {
      return (
        <ResultsPage
          results={derivedResults}
          onSelect={handleSelectResult}
          loadMore={discoveryMode ? loadMoreDiscovery : loadMore}
          hasMore={discoveryMode ? true : derivedHasMore}
          loading={loading || discoveryLoading}
        />
      );
    }

    if (view === "viewer" && selected) {
      return (
        <ViewerPage
          selected={selected}
          relatedPool={derivedResults}
          onSelectRelated={handleSelectResult}
          onSearch={handleSearch}
          onBack={handleNavigateToResults}
          analysis={analysis}
          onHighlight={handleRunAnalysis}
          analysisLoading={analysisLoading}
        />
      );
    }

    return (
      <HomePage
        query={query}
        setQuery={setQuery}
        source={source}
        setSource={setSource}
        discoveryIntensity={discoveryIntensity}
        setDiscoveryIntensity={setDiscoveryIntensity}
        onSearch={handleSearch}
        onStartDiscovery={startDiscovery}
        discoveryLoading={discoveryLoading}
        onExploreSolar={openSolarExplorer}
        onOpenSkyMap={openSkyMap}
        onSelectFeatured={handleSelectFeatured}
        error={error}
        loading={loading}
      />
    );
  };

  const activeNav = view === "solar" ? "solar" : view === "skymap" ? "skymap" : view === "home" ? "home" : "gallery";

  return (
    <AppShell
      activeNav={activeNav}
      onNavigateHome={() => {
        setPendingSolarBookmark(null);
        setView("home");
        if (typeof window !== "undefined" && PRODUCT_ROUTES.has(window.location.pathname)) {
          window.history.pushState(null, "", "/");
        }
      }}
      onNavigateGallery={handleNavigateToResults}
      onNavigateSolar={() => openSolarExplorer()}
      onNavigateSkyMap={openSkyMap}
    >
      <PageContainer>{renderCurrentView()}</PageContainer>
    </AppShell>
  );
};

export default App;
