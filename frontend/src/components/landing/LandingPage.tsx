// The SpaceViewer homepage: what this is, in one screen, and five doors in.
// Hero: Webb's "Cosmic Cliffs" (NASA, ESA, CSA, STScI; CC BY 4.0), resized from ESA/Webb's 14,575 px
// original into public/home/hero-cosmic-cliffs-*.{webp,jpg}. Destination pictures are real renders from
// SpaceViewer's own engine (public/home/*.jpg); the photograph wall is NASA's archive with credits.

import { useEffect, useMemo, useState, type FC } from "react";
import { DEEP_SPACE_SEED_OBJECTS } from "../../features/skymap/layers/deepSpaceCatalog";
import { Icon } from "../../shell/Icon";
import { formatMomentDate, momentForToday, MOMENTS, type Moment } from "../../shell/moments";
import { getLiveFeed } from "../../shell/liveFeeds";
import { readSavedViews } from "../../shell/savedViews";
import { readRecentPlaces } from "../../utils/sessionMemory";
import { readWorkingCollection } from "../../utils/observationCollection";

interface LandingPageProps {
  onEnterUniverse: () => void;
  onOpenPlace: (placeId: string) => void;
  onOpenHref: (href: string) => void;
  onOpenImages: () => void;
  onSearchImages: (query: string) => void;
  onOpenLive: (feedId?: string) => void;
  onOpenSaved: () => void;
  onOpenFind: () => void;
  onOpenTool: (tool: "solar" | "atlas") => void;
}

const DESTINATIONS: Array<{ id: string; name: string; image: string; kind: string; hook: string }> = [
  { id: "solar:planet:saturn", name: "Saturn", image: "/home/saturn.jpg", kind: "Planet · 1.4 billion km", hook: "Rings 280,000 km wide, and in places only about ten metres thick." },
  { id: "deep:galaxy:andromeda-galaxy", name: "Andromeda", image: "/home/andromeda.jpg", kind: "Galaxy · 2.5 million ly", hook: "A trillion stars falling toward us. The light you see left before modern humans existed." },
  { id: "deep:nebula:carina-nebula", name: "Carina Nebula", image: "/home/carina.jpg", kind: "Nebula · 8,500 ly", hook: "A star factory inside our galaxy, where Webb photographed the Cosmic Cliffs." },
  { id: "explore:sagittarius-a-star", name: "Sagittarius A*", image: "/home/sgr-a.jpg", kind: "Black hole · 26,670 ly", hook: "Four million Suns in a space smaller than Mercury's orbit, bending light around it." },
  { id: "solar:planet:jupiter", name: "Jupiter", image: "/home/jupiter.jpg", kind: "Planet · 5.2 AU", hook: "A storm wider than Earth, raging for at least 190 years." },
  { id: "galactic:milky-way-structure", name: "The Milky Way", image: "/home/milky-way.jpg", kind: "Our galaxy · 100,000 ly", hook: "Seen from outside, with spiral arms drawn from measured maser distances." },
  { id: "solar:planet:pluto", name: "Pluto", image: "/home/pluto.jpg", kind: "Dwarf planet · 35 AU", hook: "A heart-shaped plain of nitrogen ice at the edge of the planets." },
  { id: "spacecraft:voyager-1", name: "Voyager 1", image: "/home/voyager.jpg", kind: "Spacecraft · in interstellar space", hook: "Launched in 1977, the farthest human-made object, still talking to Earth." },
];

const MOMENT_IMAGES: Record<string, string> = {
  "eclipse-2024": "/home/eclipse.jpg",
  "cassini-finale": "/home/saturn.jpg",
  "new-horizons-pluto": "/home/pluto.jpg",
  "voyager-heliopause": "/home/voyager.jpg",
  "great-conjunction-2020": "/home/jupiter.jpg",
};

const LIVE_ON_HOME = ["nasa-iss-hd", "sdo-193", "goes-east", "nsf-starbase"];

const STATS = [
  ["15,448", "Gaia stars at their measured positions"],
  ["3,004", "galaxies, nebulae and clusters"],
  ["16", "orders of magnitude of zoom, one world"],
  ["17", "live feeds from orbit, the Sun and Earth"],
];

const PHOTO_SEEDS = DEEP_SPACE_SEED_OBJECTS.filter((seed) => seed.imagery?.[0]?.previewUrl).slice(0, 10);

const MomentCardLarge: FC<{ moment: Moment; daysAway: number; onOpen: () => void }> = ({ moment, daysAway, onOpen }) => (
  <button type="button" className="hp-moment hp-moment--feature" onClick={onOpen}>
    <img src={MOMENT_IMAGES[moment.id] ?? "/home/eclipse.jpg"} alt="" loading="lazy" />
    <span className="hp-moment__text">
      <span className="sv-eyebrow">{daysAway === 0 ? "On this day" : daysAway <= 14 ? `In ${daysAway} days` : "Replay a moment"}</span>
      <strong className="sv-serif">{moment.title}</strong>
      <small>{formatMomentDate(moment.at)}</small>
      <em>{moment.story.split(". ")[0]}.</em>
      <span className="hp-moment__play">
        <Icon name="play" size={14} /> Replay it, at its real date
      </span>
    </span>
  </button>
);

const LandingPage: FC<LandingPageProps> = ({ onEnterUniverse, onOpenPlace, onOpenHref, onOpenImages, onSearchImages, onOpenLive, onOpenSaved, onOpenFind, onOpenTool }) => {
  const [today] = useState(() => momentForToday());
  const [returning] = useState(() => {
    const places = readRecentPlaces();
    const views = readSavedViews();
    const photos = readWorkingCollection().items.length;
    return places.length || views.length || photos ? { place: places[0] ?? null, views: views.length, photos } : null;
  });
  const [query, setQuery] = useState("");
  const live = useMemo(() => LIVE_ON_HOME.map((id) => getLiveFeed(id)).filter((feed): feed is NonNullable<ReturnType<typeof getLiveFeed>> => Boolean(feed)), []);
  const otherMoments = MOMENTS.filter((moment) => moment.id !== today.moment.id).slice(0, 4);
  const momentHref = (moment: Moment) => `/explore?object=${encodeURIComponent(moment.subject)}&moment=${moment.id}`;

  // Warm the universe while people read, so "Enter the universe" opens instantly.
  useEffect(() => {
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    const warm = () => void import("../../features/explore/ExplorePage");
    const handle = idle ? idle(warm) : window.setTimeout(warm, 1500);
    return () => {
      if (!idle) window.clearTimeout(handle);
    };
  }, []);

  return (
    <div className="hp">
      <section className="hp-hero" aria-labelledby="hp-title">
        <picture className="hp-hero__image">
          <source media="(max-width: 760px)" type="image/webp" srcSet="/home/hero-cosmic-cliffs-portrait.webp" />
          <source media="(max-width: 760px)" srcSet="/home/hero-cosmic-cliffs-portrait.jpg" />
          <source
            type="image/webp"
            srcSet="/home/hero-cosmic-cliffs-1600.webp 1600w, /home/hero-cosmic-cliffs-2560.webp 2560w, /home/hero-cosmic-cliffs-3840.webp 3840w"
            sizes="100vw"
          />
          <img
            src="/home/hero-cosmic-cliffs-2560.jpg"
            srcSet="/home/hero-cosmic-cliffs-1600.jpg 1600w, /home/hero-cosmic-cliffs-2560.jpg 2560w, /home/hero-cosmic-cliffs-3840.jpg 3840w"
            sizes="100vw"
            alt="The Cosmic Cliffs in the Carina Nebula, photographed by the James Webb Space Telescope: golden walls of gas and dust under a blue, star-filled sky."
            // React 18 doesn't know fetchPriority yet; pass the HTML attribute as-is.
            {...({ fetchpriority: "high" } as Record<string, string>)}
            decoding="async"
          />
        </picture>
        <span className="hp-hero__shade" aria-hidden="true" />
        <div className="hp-hero__content">
          <p className="sv-eyebrow">SpaceViewer</p>
          <h1 id="hp-title" className="sv-serif">
            The universe,
            <br />
            live and to scale.
          </h1>
          <p className="hp-hero__lede">
            Fly from Earth to Andromeda at true scale. See every photograph telescopes have taken of wherever you land. Watch the Sun and the
            Space Station as they are right now.
          </p>
          <div className="hp-hero__actions">
            <button type="button" className="sv-btn sv-btn--primary hp-hero__primary" onClick={onEnterUniverse}>
              <Icon name="universe" size={18} /> Enter the universe
            </button>
            <button type="button" className="sv-btn" onClick={onOpenImages}>
              <Icon name="images" size={16} /> Browse photographs
            </button>
            <button type="button" className="sv-btn" onClick={() => onOpenLive()}>
              <span className="sv-live-dot" aria-hidden="true" /> Watch live
            </button>
          </div>
          <button type="button" className="hp-find" onClick={onOpenFind}>
            <Icon name="search" size={17} />
            <span className="hp-find__long">Search Saturn, M31, Webb, the 2024 eclipse…</span>
            <span className="hp-find__short">Search Saturn, M31, Webb…</span>
            <kbd>⌘K</kbd>
          </button>
          {returning ? (
            <p className="hp-hero__return">
              <Icon name="now" size={14} /> Welcome back.{" "}
              {returning.place ? (
                <button type="button" onClick={() => onOpenHref(returning.place!.href)}>
                  Continue at {returning.place.name}
                </button>
              ) : null}
              {returning.views || returning.photos ? (
                <button type="button" onClick={onOpenSaved}>
                  Your sky · {returning.views + returning.photos} saved
                </button>
              ) : null}
            </p>
          ) : null}
        </div>
        <p className="hp-hero__caption">
          <span>
            Webb's “Cosmic Cliffs” in the Carina Nebula, about 7,600 light-years away. The “mountains” are walls of gas and dust, lit and
            carved by young stars.
          </span>
          <span className="hp-hero__credit">
            <a href="https://esawebb.org/images/weic2205a/" target="_blank" rel="noreferrer">
              NASA, ESA, CSA, STScI
            </a>{" "}
            · CC BY 4.0
            <button type="button" onClick={() => onOpenPlace("deep:nebula:carina-nebula")}>
              <Icon name="fly" size={13} /> Fly there
            </button>
          </span>
        </p>
      </section>

      <section className="hp-stats" aria-label="What is inside">
        {STATS.map(([value, label]) => (
          <div key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </section>

      <section className="hp-section" aria-labelledby="hp-go">
        <header className="hp-section__head">
          <p className="sv-eyebrow">The universe</p>
          <h2 id="hp-go" className="sv-serif">
            Where would you like to go?
          </h2>
          <p>Every place is where it really is, right now. Pick one and SpaceViewer flies you there, across real distances.</p>
        </header>
        <ul className="hp-places">
          {DESTINATIONS.map((place, index) => (
            <li key={place.id} className={[0, 3, 6, 7].includes(index) ? "is-wide" : ""}>
              <button type="button" onClick={() => onOpenPlace(place.id)}>
                <img src={place.image} alt="" loading="lazy" decoding="async" />
                <span className="hp-places__text">
                  <small>{place.kind}</small>
                  <strong className="sv-serif">{place.name}</strong>
                  <em>{place.hook}</em>
                </span>
                <span className="hp-places__fly" aria-hidden="true">
                  <Icon name="fly" size={16} />
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="hp-section__more">
          <button type="button" className="sv-btn" onClick={onEnterUniverse}>
            Or start at Earth and scroll outwards <Icon name="next" size={14} />
          </button>
        </div>
      </section>

      <section className="hp-section hp-moments" aria-labelledby="hp-moments">
        <header className="hp-section__head">
          <p className="sv-eyebrow">Moments</p>
          <h2 id="hp-moments" className="sv-serif">
            Be there when it happened
          </h2>
          <p>Real events replayed at their real date, with the planets, moons and spacecraft exactly where they were.</p>
        </header>
        <div className="hp-moments__grid">
          <MomentCardLarge moment={today.moment} daysAway={today.daysAway} onOpen={() => onOpenHref(momentHref(today.moment))} />
          <ul className="hp-moments__list">
            {otherMoments.map((moment) => (
              <li key={moment.id}>
                <button type="button" className="hp-moment" onClick={() => onOpenHref(momentHref(moment))}>
                  {MOMENT_IMAGES[moment.id] ? <img src={MOMENT_IMAGES[moment.id]} alt="" loading="lazy" /> : <span className="hp-moment__blank" />}
                  <span>
                    <strong>{moment.title}</strong>
                    <small>{formatMomentDate(moment.at)}</small>
                  </span>
                  <Icon name="play" size={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="hp-section" aria-labelledby="hp-live">
        <header className="hp-section__head hp-section__head--row">
          <div>
            <p className="sv-eyebrow hp-live-eyebrow">
              <span className="sv-live-dot" aria-hidden="true" /> Live
            </p>
            <h2 id="hp-live" className="sv-serif">
              Happening right now
            </h2>
          </div>
          <button type="button" className="sv-btn sv-btn--small" onClick={() => onOpenLive()}>
            All 17 live feeds <Icon name="next" size={13} />
          </button>
        </header>
        <ul className="hp-live">
          {live.map((feed) => (
            <li key={feed.id}>
              <button type="button" onClick={() => onOpenLive(feed.id)}>
                <img src={feed.poster ?? feed.src} alt="" loading="lazy" decoding="async" />
                <span className={`lv-badge lv-badge--${feed.kind}`}>{feed.kind === "stream" ? "Live" : feed.kind === "movie" ? "Last 48 h" : "Now"}</span>
                <span className="hp-live__text">
                  <strong>{feed.title}</strong>
                  <small>{feed.source}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="hp-section hp-photos" aria-labelledby="hp-photos">
        <header className="hp-section__head">
          <p className="sv-eyebrow">Images</p>
          <h2 id="hp-photos" className="sv-serif">
            Every photograph of the sky, and the place it shows
          </h2>
          <p>Search NASA's library and two sky surveys at once. Every photograph knows where it was taken, and can fly you there.</p>
        </header>
        <form
          className="hp-photos__search"
          onSubmit={(event) => {
            event.preventDefault();
            if (query.trim()) onSearchImages(query.trim());
            else onOpenImages();
          }}
        >
          <Icon name="search" size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pillars of Creation, Jupiter, Webb…" aria-label="Search photographs" />
          <button type="submit" className="sv-btn sv-btn--primary sv-btn--small">
            Search
          </button>
        </form>
        <ul className="hp-photos__wall">
          {PHOTO_SEEDS.map((seed) => {
            const image = seed.imagery![0];
            return (
              <li key={seed.id}>
                <button type="button" onClick={() => onSearchImages(seed.name)} title={`${image.label} · ${image.credit ?? image.source}`}>
                  <img src={image.previewUrl} alt={image.alt ?? seed.name} loading="lazy" decoding="async" />
                  <span>{seed.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="hp-honest" aria-labelledby="hp-honest">
        <h2 id="hp-honest" className="sv-serif">
          Made from real data, and honest about it
        </h2>
        <div className="hp-honest__grid">
          <div>
            <h3>True scale</h3>
            <p>One continuous world in 64-bit coordinates, from a few metres to millions of light-years. Planets from VSOP87, moons from Astronomy Engine, stars from Gaia DR3, galaxies from OpenNGC and the Local Volume Database.</p>
          </div>
          <div>
            <h3>Marked, not mixed</h3>
            <p>
              Every fact carries a mark: <span className="sv-mark sv-mark--measured">Measured</span> <span className="sv-mark sv-mark--derived">Derived</span>{" "}
              <span className="sv-mark sv-mark--illustrative">Illustrative</span>. Where SpaceViewer draws what no telescope can see, it says so.
            </p>
          </div>
          <div>
            <h3>Yours, on your device</h3>
            <p>Saved views, photographs, notes and bookmarks live in your browser. No account, no tracking. Share any view as a link or a postcard.</p>
          </div>
        </div>
      </section>

      <footer className="hp-foot">
        <div className="hp-foot__brand">
          <span className="sv-brand__mark" aria-hidden="true" />
          <strong>SpaceViewer</strong>
        </div>
        <nav aria-label="Everything in SpaceViewer">
          <button type="button" onClick={onEnterUniverse}>Universe</button>
          <button type="button" onClick={onOpenImages}>Images</button>
          <button type="button" onClick={() => onOpenLive()}>Live</button>
          <button type="button" onClick={onOpenSaved}>Your sky</button>
          <button type="button" onClick={() => onOpenTool("solar")}>Solar Explorer</button>
          <button type="button" onClick={() => onOpenTool("atlas")}>Sky Atlas</button>
        </nav>
        <p>
          Photographs: NASA Image and Video Library, SDSS, Pan-STARRS. Stars: ESA Gaia DR3. Deep sky: OpenNGC, LVDB. Solar System: VSOP87,
          Astronomy Engine, JPL. Live: NASA, Sen, NASASpaceflight, NASA SDO, ESA/NASA SOHO, NOAA. Hero: “Cosmic Cliffs”, NASA, ESA, CSA, STScI (CC BY 4.0). The
          destination pictures are SpaceViewer's own renders.
        </p>
      </footer>
    </div>
  );
};

export default LandingPage;
