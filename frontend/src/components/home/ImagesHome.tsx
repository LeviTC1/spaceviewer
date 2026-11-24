// Images: the front door to every photograph SpaceViewer can reach (NASA, SDSS, Pan-STARRS), and the
// bridge from a photograph back to the place it shows. Replaces the seven-tab archive dashboard:
//   Explore tab  → the search at the top        Gallery tab  → categories, sources, the wall
//   Discover tab → Wander                       Live tab     → Live from orbit
//   For You      → Pick up where you left off (and Your sky)
//   SkyMap / Solar tabs → Universe and Tools in the bar; Solar bookmarks → Your sky.

import { useEffect, useMemo, useState, type FC } from "react";
import SearchBar, { type SearchSuggestionInput } from "./SearchBar";
import { searchTargets } from "../../utils/api";
import { mapSearchItem, type SearchResult } from "../../utils/mapSearchItem";
import { filterSearchResults, isLikelyNonSpaceImage } from "../../utils/spaceFilter";
import { getSessionMemory, getTopItems, type RecentImage } from "../../utils/sessionMemory";
import type { SpaceImage } from "../../models/SpaceImage";
import type { DiscoverySession } from "../../models/DiscoverySession";
import { Icon } from "../../shell/Icon";
import { matchImageToPlace, PLACES, type Place } from "../../shell/places";
import { readReduceMotion } from "../../shell/preferences";
import { getLiveFeed, LIVE_FEEDS } from "../../shell/liveFeeds";

interface ImagesHomeProps {
  query: string;
  setQuery: (value: string) => void;
  source: string;
  setSource: (value: string) => void;
  discoveryIntensity: "balanced" | "deep" | "extreme";
  setDiscoveryIntensity: (value: "balanced" | "deep" | "extreme") => void;
  onSearch: (value?: string, sourceOverride?: string) => void;
  onStartDiscovery: () => void;
  onContinueDiscovery?: () => void;
  onExpandDiscovery?: () => void;
  discoverySession?: DiscoverySession | null;
  discoveryLoading?: boolean;
  onSelectFeatured: (item: SpaceImage, sourceItems: SearchResult[]) => void;
  onOpenRecent: (item: RecentImage) => void;
  onOpenPlace: (placeId: string) => void;
  onOpenSaved: () => void;
  onOpenLive: (feedId?: string) => void;
  savedCount: number;
  error?: string | null;
  loading: boolean;
}

export const IMAGE_CATEGORIES = [
  { label: "Nebulae", query: "nebula" },
  { label: "Galaxies", query: "galaxy" },
  { label: "Star clusters", query: "star cluster" },
  { label: "Deep fields", query: "deep field" },
  { label: "Black holes", query: "black hole" },
  { label: "Supernovae", query: "supernova remnant" },
  { label: "Exoplanets", query: "exoplanet" },
  { label: "Webb", query: "James Webb Space Telescope" },
  { label: "Hubble", query: "Hubble Space Telescope" },
  { label: "Aurora", query: "aurora" },
  { label: "Mars", query: "Mars" },
  { label: "Jupiter", query: "Jupiter" },
  { label: "Saturn", query: "Saturn" },
  { label: "Rings", query: "planetary rings" },
  { label: "The Moon", query: "Moon surface" },
  { label: "Comets", query: "comet" },
  { label: "Asteroids", query: "asteroid" },
  { label: "Solar flares", query: "solar flare" },
  { label: "Milky Way", query: "Milky Way" },
  { label: "Magellanic Clouds", query: "Magellanic Clouds" },
  { label: "Star formation", query: "star formation" },
  { label: "Cosmic Cliffs", query: "Cosmic Cliffs" },
  { label: "Pillars of Creation", query: "Pillars of Creation" },
];

const FEATURED_QUERIES = ["Carina Nebula", "Pillars of Creation", "galaxy", "Saturn", "Jupiter", "nebula", "star cluster", "deep field", "aurora", "Mars"];
const FEATURED_CACHE_KEY = "spaceviewer.images.featured.v1";
const FEATURED_TTL_MS = 6 * 60 * 60 * 1000;
const FEATURED_LIMIT = 18;

export const IMAGE_SOURCES = [
  { value: "all", label: "All archives" },
  { value: "nasa", label: "NASA" },
  { value: "sdss", label: "SDSS" },
  { value: "ps1", label: "Pan-STARRS" },
];

const SOURCE_DETAIL: Record<string, string> = {
  all: "Every archive at once",
  nasa: "NASA Image and Video Library — missions, telescopes, press releases",
  sdss: "Sloan Digital Sky Survey — survey cutouts by sky position",
  ps1: "Pan-STARRS1 — survey cutouts by sky position",
};

const INTENSITIES: Array<{ value: ImagesHomeProps["discoveryIntensity"]; label: string; detail: string }> = [
  { value: "balanced", label: "Wide-field", detail: "Icons with a few surprises" },
  { value: "deep", label: "Deep-field", detail: "Lenses, quasars, harder finds" },
  { value: "extreme", label: "Anomaly sweep", detail: "The strangest things in the archive" },
];


// Shown instantly while the archive answers: Webb's "Cosmic Cliffs" in the Carina Nebula (NASA, ESA, CSA, STScI).
const FALLBACK_HERO = "https://images-assets.nasa.gov/image/carina_nebula/carina_nebula~large.jpg";

interface FeaturedCache {
  savedAt: number;
  raw: SearchResult[];
}

const readFeaturedCache = (): FeaturedCache | null => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(FEATURED_CACHE_KEY) ?? "null") as FeaturedCache | null;
    if (!parsed || !Array.isArray(parsed.raw) || Date.now() - parsed.savedAt > FEATURED_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
};

const sourceLabel = (source?: string) =>
  source === "sdss" ? "SDSS" : source === "ps1" ? "Pan-STARRS" : "NASA";

const yearOf = (date?: string) => (date ? new Date(date).getUTCFullYear() || date.slice(0, 4) : "");

const LIVE_TEASERS = ["nasa-iss-hd", "sen-4k", "sdo-193", "goes-east"];

/** A row of what is live right now; the full set is on /live. */
const LiveNow: FC<{ onOpenLive: (feedId?: string) => void }> = ({ onOpenLive }) => {
  const feeds = LIVE_TEASERS.map((id) => getLiveFeed(id)).filter((feed): feed is NonNullable<ReturnType<typeof getLiveFeed>> => Boolean(feed));
  return (
    <section className="im-section im-livenow" aria-labelledby="im-live-title">
      <header className="im-section__head">
        <h2 id="im-live-title" className="sv-serif">
          <span className="im-live__dot" aria-hidden="true" /> Live now
        </h2>
        <button type="button" className="sv-btn sv-btn--small" onClick={() => onOpenLive()}>
          All {LIVE_FEEDS.length} live feeds <Icon name="next" size={13} />
        </button>
      </header>
      <ul className="im-livenow__row">
        {feeds.map((feed) => (
          <li key={feed.id}>
            <button type="button" className="im-livenow__tile" onClick={() => onOpenLive(feed.id)}>
              <img src={feed.poster ?? feed.src} alt="" loading="lazy" decoding="async" />
              <span className={`lv-badge lv-badge--${feed.kind}`}>{feed.kind === "stream" ? "Live" : feed.kind === "movie" ? "Last 48 h" : "Now"}</span>
              <span className="im-livenow__caption">
                <strong>{feed.title}</strong>
                <small>{feed.source}</small>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};

const ImagesHome: FC<ImagesHomeProps> = ({
  query,
  setQuery,
  source,
  setSource,
  discoveryIntensity,
  setDiscoveryIntensity,
  onSearch,
  onStartDiscovery,
  onContinueDiscovery,
  onExpandDiscovery,
  discoverySession,
  discoveryLoading,
  onSelectFeatured,
  onOpenRecent,
  onOpenPlace,
  onOpenSaved,
  onOpenLive,
  savedCount,
  error,
  loading,
}) => {
  const [featuredRaw, setFeaturedRaw] = useState<SearchResult[]>(() => readFeaturedCache()?.raw ?? []);
  const [featuredState, setFeaturedState] = useState<"loading" | "ready" | "error">(() => (readFeaturedCache() ? "ready" : "loading"));
  const [heroIndex, setHeroIndex] = useState(0);
  const [reduceMotion] = useState(readReduceMotion);
  const memory = useMemo(() => getSessionMemory(), []);
  const recentSearches = useMemo(() => getTopItems(memory.searches, 6), [memory]);
  const recentViewed = memory.viewedImages.slice(0, 6);

  const featured = useMemo(() => {
    const unique = new Map<string, { raw: SearchResult; image: SpaceImage }>();
    for (const raw of featuredRaw) {
      const image = mapSearchItem(raw);
      if (!image.thumbnailUrl && !image.imageUrl) continue;
      if (isLikelyNonSpaceImage(image)) continue;
      if (!unique.has(image.id)) unique.set(image.id, { raw, image });
    }
    return Array.from(unique.values()).slice(0, FEATURED_LIMIT);
  }, [featuredRaw]);

  const [featuredAttempt, setFeaturedAttempt] = useState(0);
  useEffect(() => {
    if (readFeaturedCache() && featuredAttempt === 0) return;
    let active = true;
    Promise.all(FEATURED_QUERIES.map((term) => searchTargets(term, 1, "nasa")))
      .then((responses) => {
        if (!active) return;
        const pooled = filterSearchResults(responses.flatMap((response) => (response.success ? response.results.slice(0, 3) : [])));
        setFeaturedRaw(pooled);
        setFeaturedState(pooled.length ? "ready" : "error");
        if (pooled.length) {
          try {
            window.localStorage.setItem(FEATURED_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), raw: pooled } satisfies FeaturedCache));
          } catch {
            // best effort
          }
        }
      })
      .catch(() => active && setFeaturedState("error"));
    return () => {
      active = false;
    };
  }, [featuredAttempt]);

  // The hero photograph changes slowly; never on its own when motion is reduced.
  const heroCandidates = featured.slice(0, 6);
  useEffect(() => {
    if (reduceMotion || heroCandidates.length < 2) return;
    const timer = window.setInterval(() => setHeroIndex((value) => (value + 1) % heroCandidates.length), 9000);
    return () => window.clearInterval(timer);
  }, [heroCandidates.length, reduceMotion]);
  const hero = heroCandidates[heroIndex % Math.max(1, heroCandidates.length)];
  const heroPlace: Place | null = hero ? matchImageToPlace(hero.image) : null;

  const suggestions = useMemo<SearchSuggestionInput[]>(() => {
    const placeJumps: SearchSuggestionInput[] = [...PLACES]
      .filter((place) => place.importance >= 60)
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 48)
      .map((place) => ({
        label: `Fly to ${place.name}`,
        value: place.name,
        kind: "mode" as const,
        meta: place.blurb,
        onSelect: () => onOpenPlace(place.id),
      }));
    return [
      ...placeJumps,
      { label: "Carina Nebula", value: "Carina Nebula", kind: "object", meta: "Star-forming region" },
      { label: "Stephan's Quintet", value: "Stephan's Quintet", kind: "object", meta: "Compact galaxy group" },
      { label: "Cosmic Cliffs", value: "Cosmic Cliffs", kind: "object", meta: "Webb, Carina" },
      { label: "Jupiter storm", value: "Jupiter storm", kind: "object", meta: "Planetary weather" },
      { label: "Saturn rings", value: "Saturn rings", kind: "object", meta: "Ring system" },
      { label: "Webb", value: "James Webb Space Telescope", kind: "mission", meta: "Infrared observatory" },
      { label: "Hubble", value: "Hubble Space Telescope", kind: "mission", meta: "Visible and UV" },
      { label: "Cassini", value: "Cassini", kind: "mission", meta: "Saturn, 2004–2017" },
      { label: "Voyager", value: "Voyager", kind: "mission", meta: "Outer planets" },
      { label: "Juno", value: "Juno", kind: "mission", meta: "Jupiter" },
    ];
  }, [onOpenPlace]);

  const categoryChips = IMAGE_CATEGORIES;
  const searchCategories = useMemo(() => IMAGE_CATEGORIES.map((item) => ({ label: item.label, query: item.query })), []);

  return (
    <div className="im-home">
      <section className="im-hero" aria-label="Search photographs">
        <div className="im-hero__media" aria-hidden="true">
          {!heroCandidates.length ? <img src={FALLBACK_HERO} alt="" className="is-on" loading="eager" decoding="async" /> : null}
          {heroCandidates.map((item, index) => (
            <img
              key={item.image.id}
              src={item.image.imageUrl || item.image.thumbnailUrl}
              alt=""
              className={index === heroIndex % heroCandidates.length ? "is-on" : ""}
              loading={index === 0 ? "eager" : "lazy"}
              decoding="async"
            />
          ))}
          <span className="im-hero__shade" />
        </div>
        <div className="im-hero__content">
          <p className="sv-eyebrow">Images</p>
          <h1 className="sv-serif">Every photograph of the sky, and the place it shows.</h1>
          <p className="im-hero__lede">Search NASA's library and two sky surveys at once. Then fly to the object in the live universe.</p>
          <div className="im-hero__search">
            <SearchBar
              query={query}
              setQuery={setQuery}
              source={source}
              setSource={setSource}
              sourceOptions={IMAGE_SOURCES}
              onSearch={onSearch}
              suggestions={suggestions}
              categories={searchCategories}
            />
          </div>
          <div className="im-hero__sources" role="radiogroup" aria-label="Archive">
            {IMAGE_SOURCES.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={source === option.value}
                className={`sv-chip${source === option.value ? " is-on" : ""}`}
                title={SOURCE_DETAIL[option.value]}
                onClick={() => {
                  setSource(option.value);
                  if (query.trim()) onSearch(query, option.value);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
          {error ? <p className="im-hero__error" role="alert">{error}</p> : null}
          {loading ? <p className="im-hero__status" role="status">Searching the archives…</p> : null}
        </div>
        {hero ? (
          <figure className="im-hero__credit">
            <figcaption>
              <button type="button" className="im-hero__title" onClick={() => onSelectFeatured(hero.image, featured.map((item) => item.raw))}>
                {hero.image.title}
              </button>
              <span>
                {[hero.image.center || sourceLabel(hero.image.source), yearOf(hero.image.date)].filter(Boolean).join(" · ")}
              </span>
            </figcaption>
            <div className="im-hero__credit-actions">
              {heroPlace ? (
                <button type="button" className="sv-btn sv-btn--small" onClick={() => onOpenPlace(heroPlace.id)}>
                  <Icon name="fly" size={14} /> Fly to {heroPlace.name}
                </button>
              ) : null}
              {heroCandidates.length > 1 ? (
                <span className="im-hero__dots" role="group" aria-label="Featured photograph">
                  {heroCandidates.map((item, index) => (
                    <button
                      key={item.image.id}
                      type="button"
                      aria-label={`Show ${item.image.title}`}
                      aria-pressed={index === heroIndex % heroCandidates.length}
                      onClick={() => setHeroIndex(index)}
                    />
                  ))}
                </span>
              ) : null}
            </div>
          </figure>
        ) : null}
      </section>

      <div className="im-body">
        {recentSearches.length || recentViewed.length || savedCount ? (
          <section className="im-section im-resume" aria-labelledby="im-resume-title">
            <header className="im-section__head">
              <h2 id="im-resume-title" className="sv-serif">Pick up where you left off</h2>
              {savedCount ? (
                <button type="button" className="sv-btn sv-btn--small" onClick={onOpenSaved}>
                  <Icon name="star" size={14} /> Your sky · {savedCount}
                </button>
              ) : null}
            </header>
            {recentViewed.length ? (
              <ul className="im-strip">
                {recentViewed.map((item) => (
                  <li key={`${item.source ?? "nasa"}:${item.nasaId ?? item.id}`}>
                    <button type="button" onClick={() => onOpenRecent(item)}>
                      <img src={item.thumbnailUrl || item.imageUrl} alt="" loading="lazy" />
                      <span>{item.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {recentSearches.length ? (
              <div className="im-chips" aria-label="Recent searches">
                {recentSearches.map((item) => (
                  <button key={item} type="button" className="sv-chip" onClick={() => onSearch(item)}>
                    <Icon name="now" size={13} /> {item}
                  </button>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="im-section" aria-labelledby="im-browse-title">
          <header className="im-section__head">
            <h2 id="im-browse-title" className="sv-serif">Browse the sky</h2>
          </header>
          <div className="im-chips">
            {categoryChips.map((category) => (
              <button
                key={category.label}
                type="button"
                className="sv-chip"
                onClick={() => {
                  setQuery(category.query);
                  onSearch(category.query);
                }}
              >
                {category.label}
              </button>
            ))}
          </div>
        </section>

        <LiveNow onOpenLive={onOpenLive} />

        <section className="im-wander" aria-labelledby="im-wander-title">
          <div className="im-wander__copy">
            <p className="sv-eyebrow">Wander</p>
            <h2 id="im-wander-title" className="sv-serif">
              Show me something I've never seen
            </h2>
            <p>SpaceViewer pulls from many corners of the archives at once and ranks what comes back by how unusual it is. Every pick says why it was chosen.</p>
          </div>
          <div className="im-wander__controls">
            <div className="sv-segmented" role="radiogroup" aria-label="How far to wander">
              {INTENSITIES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={discoveryIntensity === option.value}
                  className={discoveryIntensity === option.value ? "is-on" : ""}
                  onClick={() => setDiscoveryIntensity(option.value)}
                  title={option.detail}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="im-wander__detail">{INTENSITIES.find((option) => option.value === discoveryIntensity)?.detail}</p>
            <div className="im-wander__actions">
              <button type="button" className="sv-btn sv-btn--primary" onClick={onStartDiscovery} disabled={discoveryLoading}>
                <Icon name="sparkle" size={16} /> {discoveryLoading ? "Wandering…" : "Start wandering"}
              </button>
              {discoverySession ? (
                <>
                  <button type="button" className="sv-btn" onClick={onContinueDiscovery}>
                    Continue “{discoverySession.name}” · {discoverySession.resultCount}
                  </button>
                  <button type="button" className="sv-btn sv-btn--quiet" onClick={onExpandDiscovery} disabled={discoveryLoading}>
                    Add another batch
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </section>

        <section className="im-section" aria-labelledby="im-wall-title">
          <header className="im-section__head">
            <h2 id="im-wall-title" className="sv-serif">From the archives</h2>
            <p>Recent highlights from NASA's library, refreshed every few hours.</p>
          </header>
          {featuredState === "loading" && !featured.length ? (
            <div className="im-wall im-wall--loading" aria-busy="true" aria-label="Loading photographs">
              {Array.from({ length: 9 }, (_, index) => (
                <span key={index} className="im-skeleton" style={{ aspectRatio: index % 3 === 0 ? "4 / 5" : index % 3 === 1 ? "4 / 3" : "1 / 1" }} />
              ))}
            </div>
          ) : featuredState === "error" && !featured.length ? (
            <div className="im-empty" role="status">
              <p>The archives didn't answer just now. Search still works, and your saved photographs are in Your sky.</p>
              <button
                type="button"
                className="sv-btn sv-btn--small"
                onClick={() => {
                  setFeaturedState("loading");
                  setFeaturedAttempt((value) => value + 1);
                }}
              >
                Try again
              </button>
            </div>
          ) : (
            <ul className="im-wall">
              {featured.map((item) => {
                const place = matchImageToPlace(item.image);
                return (
                  <li key={item.image.id}>
                    <button type="button" className="im-tile" onClick={() => onSelectFeatured(item.image, featured.map((entry) => entry.raw))}>
                      <img src={item.image.thumbnailUrl || item.image.imageUrl} alt={item.image.title} loading="lazy" decoding="async" />
                      <span className="im-tile__caption">
                        <strong>{item.image.title}</strong>
                        <small>
                          {[item.image.center || sourceLabel(item.image.source), yearOf(item.image.date), place ? `· ${place.name}` : null]
                            .filter(Boolean)
                            .join(" ")}
                        </small>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>


        <footer className="im-foot">
          <p>
            Photographs come straight from the{" "}
            <a href="https://images.nasa.gov" target="_blank" rel="noreferrer">
              NASA Image and Video Library
            </a>
            , the{" "}
            <a href="https://www.sdss.org" target="_blank" rel="noreferrer">
              Sloan Digital Sky Survey
            </a>{" "}
            and{" "}
            <a href="https://outerspace.stsci.edu/display/PANSTARRS" target="_blank" rel="noreferrer">
              Pan-STARRS1
            </a>
            . Credits travel with every image.
          </p>
        </footer>
      </div>
    </div>
  );
};

export default ImagesHome;
