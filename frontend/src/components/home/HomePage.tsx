import { useEffect, useMemo, useRef, useState, type FC } from "react";
import SearchBar from "./SearchBar";
import SuggestedTargets from "./SuggestedTargets";
import ResultCard from "../results/ResultCard";
import { searchTargets } from "../../utils/api";
import { mapSearchItem, type SearchResult } from "../../utils/mapSearchItem";
import { filterSearchResults, isLikelyNonSpaceImage } from "../../utils/spaceFilter";
import { getSessionMemory, getTopItems } from "../../utils/sessionMemory";
import type { SpaceImage } from "../../models/SpaceImage";
import { readCameraBookmarks, type CameraBookmark } from "../../features/solar/cameraBookmarks";

interface HomePageProps {
  query: string;
  setQuery: (value: string) => void;
  source: string;
  setSource: (value: string) => void;
  discoveryIntensity: "balanced" | "deep" | "extreme";
  setDiscoveryIntensity: (value: "balanced" | "deep" | "extreme") => void;
  onSearch: (value?: string) => void;
  onStartDiscovery: () => void;
  discoveryLoading?: boolean;
  onExploreSolar: (bookmark?: CameraBookmark) => void;
  onOpenSkyMap: () => void;
  onSelectFeatured: (item: SpaceImage, sourceItems: SearchResult[]) => void;
  error?: string | null;
  loading: boolean;
}

type HomeTab = "explore" | "skymap" | "solar" | "live" | "gallery" | "discover" | "foryou";

const HOME_TABS: Array<{ id: HomeTab; label: string; badge?: string }> = [
  { id: "explore", label: "Explore" },
  { id: "skymap", label: "SkyMap", badge: "ALPHA" },
  { id: "solar", label: "Solar Explorer", badge: "NEW" },
  { id: "live", label: "Live Feed From Space", badge: "LIVE" },
  { id: "gallery", label: "Gallery" },
  { id: "discover", label: "Discover" },
  { id: "foryou", label: "For You" },
];

const NASA_LIVE_EMBED_URL = "https://www.youtube.com/embed/FV4Q9DryTG8?rel=0";
const NASA_LIVE_YOUTUBE_URL = "https://www.youtube.com/live/FV4Q9DryTG8?si=vo3qTulNSztqA6HL";

const HOME_TAB_STORAGE_KEY = "spaceviewer.home.tab";
const SOLAR_HINT_DISMISSED_KEY = "spaceviewer.solar.hintDismissed";
const LEGACY_SKYMAP_HINT_DISMISSED_KEY = "spaceviewer.skymap.hintDismissed";

const normalizeHomeTab = (value: string): HomeTab | null => {
  return HOME_TABS.some((tab) => tab.id === value) ? (value as HomeTab) : null;
};

const categories = [
  { label: "Nebulae", query: "nebula" },
  { label: "Galaxies", query: "galaxy" },
  { label: "Star Clusters", query: "star cluster" },
  { label: "Deep Field", query: "deep field" },
  { label: "Black Holes", query: "black hole" },
  { label: "Supernovae", query: "supernova remnant" },
  { label: "Exoplanets", query: "exoplanet" },
  { label: "JWST", query: "James Webb Space Telescope" },
  { label: "Hubble", query: "Hubble Space Telescope" },
  { label: "Aurora", query: "aurora" },
  { label: "Mars", query: "Mars" },
  { label: "Jupiter", query: "Jupiter" },
  { label: "Saturn", query: "Saturn" },
  { label: "Rings", query: "planetary rings" },
  { label: "Moon", query: "Moon surface" },
  { label: "Comets", query: "comet" },
  { label: "Asteroids", query: "asteroid" },
  { label: "Solar Flares", query: "solar flare" },
  { label: "Milky Way", query: "Milky Way" },
  { label: "Magellanic Clouds", query: "Magellanic Clouds" },
  { label: "Star Formation", query: "star formation" },
  { label: "Cosmic Cliffs", query: "Cosmic Cliffs" },
  { label: "Pillars of Creation", query: "Pillars of Creation" },
];

const featuredCategories = categories.slice(0, 10);
const FEATURED_LIMIT = 16;

const sourceOptions = [
  { value: "all", label: "All sources" },
  { value: "nasa", label: "NASA Image Library" },
  { value: "sdss", label: "SDSS (Sloan)" },
  { value: "ps1", label: "Pan-STARRS" },
];

const discoverHighlights = [
  "Deep Field",
  "Cosmic Cliffs",
  "Pillars of Creation",
  "Black Holes",
  "Supernovae",
  "Star Formation",
  "Exoplanets",
  "Aurora",
];

const discoverPhenomena = [
  "Nebulae",
  "Galaxies",
  "Star Clusters",
  "Comets",
  "Asteroids",
  "Rings",
  "Magellanic Clouds",
  "Solar Flares",
];

const LiveFromSpaceSection: FC = () => {
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const [shouldLoadFrame, setShouldLoadFrame] = useState(false);

  useEffect(() => {
    if (shouldLoadFrame || typeof window === "undefined") return;
    const target = sectionRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry?.isIntersecting) {
          setShouldLoadFrame(true);
          observer.disconnect();
        }
      },
      { rootMargin: "260px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [shouldLoadFrame]);

  return (
    <section className="home__section home__live-section" ref={sectionRef}>
      <div className="home__section-header">
        <p className="eyebrow">LIVE FEED</p>
        <h2>Live From Space</h2>
        <p className="subtitle">Real-time NASA broadcast and mission coverage.</p>
      </div>
      <div className="home__live-shell">
        <div className="home__live-topline">
          <span className="home__live-badge">
            <span className="home__live-dot" aria-hidden="true" />
            NASA TV - LIVE
          </span>
          <a href={NASA_LIVE_YOUTUBE_URL} target="_blank" rel="noreferrer" className="home__live-link">
            Open on YouTube
          </a>
        </div>
        <div className="home__live-frame">
          {shouldLoadFrame ? (
            <iframe
              src={NASA_LIVE_EMBED_URL}
              title="NASA TV Live Stream"
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          ) : (
            <div className="home__live-placeholder">
              <p className="eyebrow">Preparing feed</p>
              <p className="subtitle">NASA TV will load when this section is visible.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

const HomePage: FC<HomePageProps> = ({
  query,
  setQuery,
  source,
  setSource,
  discoveryIntensity,
  setDiscoveryIntensity,
  onSearch,
  onStartDiscovery,
  discoveryLoading,
  onExploreSolar,
  onOpenSkyMap,
  onSelectFeatured,
  error,
  loading,
}) => {
  const [activeTab, setActiveTab] = useState<HomeTab>("explore");
  const [openedTabs, setOpenedTabs] = useState<Record<HomeTab, boolean>>({
    explore: true,
    skymap: false,
    solar: false,
    live: false,
    gallery: false,
    discover: false,
    foryou: false,
  });
  const [reduceMotion, setReduceMotion] = useState(false);
  const [showSolarHint, setShowSolarHint] = useState(false);
  const [featuredRaw, setFeaturedRaw] = useState<SearchResult[]>([]);
  const [featuredImages, setFeaturedImages] = useState<SpaceImage[]>([]);
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [featuredLoading, setFeaturedLoading] = useState(false);
  const [featuredError, setFeaturedError] = useState<string | null>(null);
  const [featuredLoaded, setFeaturedLoaded] = useState(false);
  const [personalized, setPersonalized] = useState<Array<{ title: string; label: string; query: string }>>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [solarBookmarks, setSolarBookmarks] = useState<CameraBookmark[]>([]);

  const categoryLookup = useMemo(() => new Map(categories.map((category) => [category.label, category.query])), []);
  const suggestions = useMemo(() => categories.map((category) => category.label), []);
  const autoCompleteSuggestions = useMemo(
    () => [
      ...new Set([
        ...categories.map((category) => category.query),
        "Carina Nebula",
        "Orion Bar",
        "Stephan's Quintet",
        "Eagle Nebula",
        "Tarantula Nebula",
        "Andromeda Galaxy",
        "Sombrero Galaxy",
        "Cosmic Cliffs",
        "Jupiter storm",
        "Saturn rings",
        "Europa",
        "Cassini",
        "Voyager",
        "Juno",
      ]),
    ],
    [],
  );
  const chipSuggestions = useMemo(() => suggestions.slice(0, 10), [suggestions]);

  const handleSuggestionClick = (value: string) => {
    const queryValue = categoryLookup.get(value) ?? value;
    setQuery(queryValue);
    onSearch(queryValue);
  };

  const handleSourceSelect = (value: string) => {
    setSource(value);
    if (query.trim()) {
      onSearch(query);
    }
  };

  const toggleReduceMotion = () => {
    const next = !reduceMotion;
    setReduceMotion(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("spaceviewer.reduceMotion", String(next));
      document.body.classList.toggle("reduce-motion", next);
    }
  };

  const dismissSolarHint = () => {
    setShowSolarHint(false);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SOLAR_HINT_DISMISSED_KEY, "true");
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("spaceviewer.reduceMotion");
    const enabled = stored === "true";
    setReduceMotion(enabled);
    document.body.classList.toggle("reduce-motion", enabled);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const dismissed =
      window.localStorage.getItem(SOLAR_HINT_DISMISSED_KEY) === "true" ||
      window.localStorage.getItem(LEGACY_SKYMAP_HINT_DISMISSED_KEY) === "true";
    setShowSolarHint(!dismissed);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(HOME_TAB_STORAGE_KEY);
    const normalized = stored ? normalizeHomeTab(stored) : null;
    if (normalized) {
      setActiveTab(normalized);
      setOpenedTabs((prev) => ({ ...prev, [normalized]: true }));
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(HOME_TAB_STORAGE_KEY, activeTab);
  }, [activeTab]);

  useEffect(() => {
    setOpenedTabs((prev) => (prev[activeTab] ? prev : { ...prev, [activeTab]: true }));
  }, [activeTab]);


  useEffect(() => {
    if (!openedTabs.gallery || featuredLoaded) {
      return;
    }
    let active = true;
    const loadFeatured = async () => {
      setFeaturedLoading(true);
      setFeaturedError(null);
      try {
        const responses = await Promise.all(
          featuredCategories.map((category) => searchTargets(category.query, 1, "nasa")),
        );
        const pooled = responses.flatMap((response) => (response.success ? response.results.slice(0, 4) : []));
        const filteredPool = filterSearchResults(pooled);

        const unique = new Map<string, { raw: SearchResult; mapped: SpaceImage }>();
        for (const raw of filteredPool) {
          const mapped = mapSearchItem(raw);
          if (!mapped.thumbnailUrl && !mapped.imageUrl) {
            continue;
          }
          if (!unique.has(mapped.id)) {
            unique.set(mapped.id, { raw, mapped });
          }
        }

        const values = Array.from(unique.values())
          .filter((entry) => !isLikelyNonSpaceImage(entry.mapped))
          .slice(0, FEATURED_LIMIT);
        if (active) {
          setFeaturedRaw(values.map((entry) => entry.raw));
          setFeaturedImages(values.map((entry) => entry.mapped));
          setFeaturedIndex(0);
        }
      } catch (caughtError) {
        console.error("featured load error", caughtError);
        if (active) {
          setFeaturedError("Unable to load featured imagery right now.");
        }
      } finally {
        if (active) {
          setFeaturedLoading(false);
          setFeaturedLoaded(true);
        }
      }
    };

    loadFeatured();
    return () => {
      active = false;
    };
  }, [featuredLoaded, openedTabs.gallery]);

  useEffect(() => {
    if (!openedTabs.foryou) {
      return;
    }
    const memory = getSessionMemory();
    const favoriteCategories = getTopItems(memory.viewedCategories, 2);
    const favoriteSearches = getTopItems(memory.searches, 2);
    const favoriteSavedTypes = getTopItems(memory.savedTypes, 2).filter((item) => item !== "Unknown");

    const personalizedBlocks: Array<{ title: string; label: string; query: string }> = [];
    if (favoriteCategories[0]) {
      personalizedBlocks.push({
        title: `Because you like ${favoriteCategories[0]}`,
        label: favoriteCategories[0],
        query: favoriteCategories[0],
      });
    }
    if (favoriteCategories[1]) {
      personalizedBlocks.push({
        title: `You explore ${favoriteCategories[1]} often`,
        label: favoriteCategories[1],
        query: favoriteCategories[1],
      });
    }
    if (favoriteSearches[0]) {
      personalizedBlocks.push({
        title: `Because you searched for ${favoriteSearches[0]}`,
        label: favoriteSearches[0],
        query: favoriteSearches[0],
      });
    }
    if (favoriteSearches[1]) {
      personalizedBlocks.push({
        title: `You keep returning to ${favoriteSearches[1]}`,
        label: favoriteSearches[1],
        query: favoriteSearches[1],
      });
    }
    if (favoriteSavedTypes[0]) {
      personalizedBlocks.push({
        title: `Because you saved ${favoriteSavedTypes[0]}`,
        label: favoriteSavedTypes[0],
        query: favoriteSavedTypes[0],
      });
    }
    if (favoriteSavedTypes[1]) {
      personalizedBlocks.push({
        title: `You often save ${favoriteSavedTypes[1]}`,
        label: favoriteSavedTypes[1],
        query: favoriteSavedTypes[1],
      });
    }

    setPersonalized(personalizedBlocks);
    setRecentSearches(getTopItems(memory.searches, 6));
  }, [openedTabs.foryou]);

  useEffect(() => {
    if (!openedTabs.solar || typeof window === "undefined") {
      return;
    }
    setSolarBookmarks(readCameraBookmarks().slice(0, 4));
  }, [openedTabs.solar]);

  const featuredSlides = useMemo(() => {
    if (!featuredImages.length) {
      return [];
    }
    return featuredImages.slice(0, 8);
  }, [featuredImages]);

  const activeFeatured = featuredSlides[featuredIndex];
  const heroVisible = activeTab === "explore";
  const showStatus = activeTab === "explore" || activeTab === "gallery";

  const handlePrevFeatured = () => {
    if (!featuredSlides.length) return;
    setFeaturedIndex((prev) => (prev - 1 + featuredSlides.length) % featuredSlides.length);
  };

  const handleNextFeatured = () => {
    if (!featuredSlides.length) return;
    setFeaturedIndex((prev) => (prev + 1) % featuredSlides.length);
  };

  useEffect(() => {
    if (activeTab !== "gallery" || featuredSlides.length <= 1) {
      return;
    }
    const timer = window.setInterval(() => {
      setFeaturedIndex((prev) => (prev + 1) % featuredSlides.length);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [activeTab, featuredSlides.length]);

  return (
    <section className="home">
      <div className="home__banner">
        <div className="home__tabs">
          <div className="home__tab-list" role="tablist" aria-label="Homepage modes">
            {HOME_TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  id={`home-tab-${tab.id}`}
                  aria-controls={`home-panel-${tab.id}`}
                  aria-selected={isActive}
                  className={`home__tab-button ${isActive ? "active" : ""}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <span>{tab.label}</span>
                  {tab.badge && <span className="home__tab-badge">{tab.badge}</span>}
                </button>
              );
            })}
          </div>
        </div>

        <div className={`home__hero ${heroVisible ? "" : "home__hero--collapsed"}`} aria-hidden={!heroVisible}>
          <p className="eyebrow">JWST DATA BROWSER</p>
          <h1>Discover new perspectives on the universe.</h1>
          <p className="subtitle">
            Search curated James Webb observations, dive into glowing galleries, and continue into an immersive viewer
            for every discovery.
          </p>
          <div className="home__hero-actions">
            <div className="home__hero-buttons">
              <button type="button" className="home__cta" onClick={onStartDiscovery} disabled={discoveryLoading}>
                {discoveryLoading ? "Exploring..." : "Explore Random Universe"}
              </button>
              <button type="button" className="ghost" onClick={onOpenSkyMap}>
                Open SkyMap
              </button>
              <button type="button" className="ghost" onClick={() => onExploreSolar()}>
                Launch Solar Explorer
              </button>
            </div>
            <div className="home__intensity">
              <span className="home__intensity-label">Discovery intensity</span>
              <div className="home__intensity-toggle" role="group" aria-label="Discovery intensity">
                {(["balanced", "deep", "extreme"] as const).map((level) => (
                  <button
                    key={level}
                    type="button"
                    className={`home__intensity-button ${discoveryIntensity === level ? "active" : ""}`}
                    onClick={() => setDiscoveryIntensity(level)}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>
            <p className="home__cta-note">Curated mix of nebulae, galaxies, JWST, and anomalies across sources.</p>
          </div>
        </div>
      </div>

      <div className="home__tab-panels">
        {activeTab === "explore" && (
            <div className="home__tab-panel" role="tabpanel" id="home-panel-explore" aria-labelledby="home-tab-explore">
              <div className="home__search-shell">
                <SearchBar
                  query={query}
                  setQuery={setQuery}
                  source={source}
                  setSource={setSource}
                  sourceOptions={sourceOptions}
                  onSearch={onSearch}
                  suggestions={autoCompleteSuggestions}
                  categories={categories}
                />
              </div>
            </div>
          )}

        {activeTab === "skymap" && (
          <div className="home__tab-panel" role="tabpanel" id="home-panel-skymap" aria-labelledby="home-tab-skymap">
            <div className="home__skymap-banner home__skymap-banner--universe">
              <div>
                <p className="eyebrow">NEW PRODUCT SURFACE</p>
                <h2>SkyMap</h2>
                <p className="subtitle">
                  The broader universe-navigation workspace. It starts with a real local-star preview and a clean
                  foundation for future search, layers, scale, and time systems.
                </p>
              </div>
              <span className="home__skymap-badge">ALPHA</span>
            </div>
            <div className="home__skymap-grid">
              <div className="home__skymap-launch home__skymap-launch--universe">
                <p className="eyebrow">UNIVERSE NAVIGATOR</p>
                <h3>Open SkyMap</h3>
                <p className="subtitle">
                  Enter the dedicated map surface for local stars now, with room for galaxy-scale navigation later.
                </p>
                <div className="home__skymap-actions">
                  <button type="button" className="home__cta" onClick={onOpenSkyMap}>
                    Open SkyMap
                  </button>
                </div>
                <p className="home__cta-note">
                  SkyMap is intentionally separate from the Solar Explorer so the larger map architecture can grow cleanly.
                </p>
              </div>
              <div className="home__skymap-saved">
                <p className="eyebrow">FOUNDATION SCOPE</p>
                <div className="home__skymap-bookmarks" aria-label="SkyMap foundation scope">
                  <span className="home__skymap-bookmark home__skymap-bookmark--static">Local star preview active</span>
                  <span className="home__skymap-bookmark home__skymap-bookmark--static">Search index pending</span>
                  <span className="home__skymap-bookmark home__skymap-bookmark--static">Layer controls staged</span>
                </div>
              </div>
            </div>
            <div className="home__skymap-features">
              <div className="home__skymap-feature">Local stars</div>
              <div className="home__skymap-feature">Viewport shell</div>
              <div className="home__skymap-feature">Future layers</div>
              <div className="home__skymap-feature">Future search</div>
            </div>
          </div>
        )}

        {activeTab === "solar" && (
          <div className="home__tab-panel" role="tabpanel" id="home-panel-solar" aria-labelledby="home-tab-solar">
            <div className="home__skymap-banner">
              <div>
                <p className="eyebrow">CURRENT 3D EXPERIENCE</p>
                <h2>Solar Explorer</h2>
                <p className="subtitle">An interactive 3D view of the solar system.</p>
              </div>
              <span className="home__skymap-badge">NEW</span>
            </div>
            {showSolarHint && (
              <div className="home__skymap-hint">
                <span>Quick tip: drag to orbit, scroll to zoom, double click to focus.</span>
                <button type="button" className="ghost button--small" onClick={dismissSolarHint}>
                  Got it
                </button>
              </div>
            )}
            <div className="home__skymap-grid">
              <div className="home__skymap-launch">
                <p className="eyebrow">NAVIGATE THE SYSTEM</p>
                <h3>Launch Solar Explorer</h3>
                <p className="subtitle">Navigate planets, scrub time, track orbits, and jump to imagery in one place.</p>
                <div className="home__skymap-actions">
                  <button type="button" className="home__cta" onClick={() => onExploreSolar()}>
                    Launch Explorer
                  </button>
                </div>
                <p className="home__cta-note">Use 3D orbit controls to inspect the current solar-system view.</p>
              </div>
              <div className="home__skymap-saved">
                <p className="eyebrow">RECENT SAVED VIEWS</p>
                {solarBookmarks.length ? (
                  <div className="home__skymap-bookmarks">
                    {solarBookmarks.map((bookmark) => (
                      <button
                        key={bookmark.id}
                        type="button"
                        className="home__skymap-bookmark"
                        onClick={() => onExploreSolar(bookmark)}
                      >
                        {bookmark.name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="subtitle">No saved views yet. Save a view inside Solar Explorer to see it here.</p>
                )}
              </div>
            </div>
            <div className="home__skymap-features">
              <div className="home__skymap-feature">Track planets</div>
              <div className="home__skymap-feature">Scrub time</div>
              <div className="home__skymap-feature">Fly between worlds</div>
              <div className="home__skymap-feature">View imagery</div>
            </div>
          </div>
        )}

        {activeTab === "live" && (
          <div className="home__tab-panel" role="tabpanel" id="home-panel-live" aria-labelledby="home-tab-live">
            <LiveFromSpaceSection />
          </div>
        )}

        {activeTab === "gallery" && (
          <div className="home__tab-panel" role="tabpanel" id="home-panel-gallery" aria-labelledby="home-tab-gallery">
            <div className="home__section">
              <div className="home__section-header">
                <p className="eyebrow">BROWSE</p>
                <h2>Curated categories</h2>
                <p className="subtitle">Jump straight into the regions, missions, and phenomena you want to explore.</p>
              </div>
              <SuggestedTargets suggestions={chipSuggestions} onSelect={handleSuggestionClick} />
            </div>

            <div className="home__section">
              <div className="home__section-header">
                <p className="eyebrow">OBSERVATORIES</p>
                <h2>Source filters</h2>
                <p className="subtitle">Switch between space archives without leaving your flow.</p>
              </div>
              <div className="home__observatories">
                {sourceOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`home__observatory-card ${source === option.value ? "active" : ""}`}
                    onClick={() => handleSourceSelect(option.value)}
                  >
                    <span className="home__observatory-title">{option.label}</span>
                    <span className="home__observatory-meta">Set as active source</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="home__section">
              <div className="home__section-header">
                <p className="eyebrow">FEATURED</p>
                <h2>Featured gallery</h2>
                <p className="subtitle">A rotating selection pulled from multiple missions and sky regions.</p>
              </div>
              {featuredLoading && <p className="status">Loading featured imagery...</p>}
              {featuredError && <p className="status status--error">{featuredError}</p>}
              {!featuredLoading && !featuredError && (
                <>
                  {activeFeatured && (
                    <div className="featured-hero">
                      <div className="featured-hero__image">
                        <img src={activeFeatured.thumbnailUrl || activeFeatured.imageUrl} alt={activeFeatured.title} />
                      </div>
                      <div className="featured-hero__content">
                        <p className="eyebrow">Spotlight</p>
                        <h3>{activeFeatured.title}</h3>
                        <p className="subtitle">
                          {activeFeatured.mission ||
                            activeFeatured.instrument ||
                            activeFeatured.center ||
                            "NASA Image Library"}
                          {" · "}
                          {activeFeatured.date}
                        </p>
                        <div className="featured-hero__actions">
                          <button type="button" onClick={() => onSelectFeatured(activeFeatured, featuredRaw)}>
                            View in gallery
                          </button>
                          <button type="button" className="ghost" onClick={handlePrevFeatured}>
                            Previous
                          </button>
                          <button type="button" className="ghost" onClick={handleNextFeatured}>
                            Next
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="featured-grid">
                    {featuredImages.map((item) => (
                      <ResultCard key={item.id} item={item} onClick={() => onSelectFeatured(item, featuredRaw)} />
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {activeTab === "discover" && (
          <div className="home__tab-panel" role="tabpanel" id="home-panel-discover" aria-labelledby="home-tab-discover">
            <div className="home__discover-card">
              <div>
                <p className="eyebrow">DISCOVERY MODE</p>
                <h2>Explore something new</h2>
                <p className="subtitle">
                  Let SpaceViewer assemble an intelligent stream of rare objects, new captures, and anomalies.
                </p>
              </div>
              <button type="button" className="home__cta" onClick={onStartDiscovery} disabled={discoveryLoading}>
                {discoveryLoading ? "Exploring..." : "Explore Random Universe"}
              </button>
            </div>

            <div className="home__section">
              <div className="home__section-header">
                <p className="eyebrow">DEEP FIELD</p>
                <h2>Signature discoveries</h2>
                <p className="subtitle">Jump into iconic phenomena and breakthrough observations.</p>
              </div>
              <SuggestedTargets suggestions={discoverHighlights} onSelect={handleSuggestionClick} />
            </div>

            <div className="home__section">
              <div className="home__section-header">
                <p className="eyebrow">PHENOMENA</p>
                <h2>Explore a new category</h2>
                <p className="subtitle">Find something unexpected across the universe.</p>
              </div>
              <SuggestedTargets suggestions={discoverPhenomena} onSelect={handleSuggestionClick} />
            </div>
          </div>
        )}

        {activeTab === "foryou" && (
          <div className="home__tab-panel" role="tabpanel" id="home-panel-foryou" aria-labelledby="home-tab-foryou">
            <div className="home__section">
              <div className="home__section-header">
                <p className="eyebrow">FOR YOU</p>
                <h2>Because you explore</h2>
                <p className="subtitle">Personalized shortcuts from your recent explorations.</p>
              </div>
              {personalized.length ? (
                <div className="home__personalized">
                  {personalized.map((item) => (
                    <button
                      key={item.title}
                      type="button"
                      className="home__personalized-card"
                      onClick={() => handleSuggestionClick(item.query)}
                    >
                      <span className="home__personalized-title">{item.title}</span>
                      <span className="home__personalized-label">{item.label}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="status">No personalized insights yet. Explore a few images to unlock them.</p>
              )}
            </div>

            <div className="home__section">
              <div className="home__section-header">
                <p className="eyebrow">RECENT SEARCHES</p>
                <h2>Pick up where you left off</h2>
                <p className="subtitle">Your latest searches, ready to relaunch.</p>
              </div>
              {recentSearches.length ? (
                <div className="home__recent-searches">
                  {recentSearches.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className="home__recent-search"
                      onClick={() => handleSuggestionClick(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="status">No recent searches yet.</p>
              )}
            </div>

            <div className="home__section">
              <div className="home__section-header">
                <p className="eyebrow">PREFERENCES</p>
                <h2>Motion settings</h2>
                <p className="subtitle">Control the motion intensity of the SpaceViewer interface.</p>
              </div>
              <div className="home__preference">
                <div>
                  <p className="home__preference-title">Reduce motion</p>
                  <p className="home__preference-desc">Disables drifting backgrounds and heavy animations.</p>
                </div>
                <button
                  type="button"
                  className={`home__toggle ${reduceMotion ? "active" : ""}`}
                  aria-pressed={reduceMotion}
                  onClick={toggleReduceMotion}
                >
                  <span className="home__toggle-dot" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {showStatus && error && <p className="status status--error">{error}</p>}
      {showStatus && loading && <p className="status">Fetching the cosmos...</p>}
    </section>
  );
};

export default HomePage;
