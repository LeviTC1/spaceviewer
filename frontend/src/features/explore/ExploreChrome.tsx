// Explorer interface: one quiet instrument around the canvas.
//
// Continuous: brand + search (top-left), a few actions (top-right), a location rail that always answers
// "where am I / what am I looking at" (bottom), zoom/home (bottom-right).
// On demand: the object panel (selection), Discover (journeys & categories), time, view options.

import { useEffect, useMemo, useRef, useState, type FC, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import type { DeepSkyScientificMetadata } from "../skymap/core/objects";
import type { CatalogueStatus } from "./useUniverseData";
import type { Fact, Journey, OnwardRoute, SearchHit } from "./discovery";
import { getEntityWorld, isDirectionOnly, type UniverseEntity, type UniverseIndex } from "./engine/universeModel";
import { GALACTIC_CENTRE_WORLD, KM_PER_AU, KM_PER_LY, KM_PER_MPC, formatDistanceKm, type Vec3 } from "./engine/units";

export { Icon } from "../../shell/Icon";
import { Icon } from "../../shell/Icon";

/** Small glyph per object family, used in search results and lists. */
export const KindGlyph: FC<{ entity: UniverseEntity }> = ({ entity }) => {
  const color = `rgb(${entity.color.map((c) => Math.round(Math.min(1, c) * 255)).join(",")})`;
  const kind = entity.kind;
  if (kind === "galaxy" || kind === "structure") {
    return (
      <svg className="ex-glyph" viewBox="0 0 24 24" aria-hidden="true">
        <ellipse cx="12" cy="12" rx="9" ry="3.6" fill="none" stroke={color} strokeWidth="1.4" transform="rotate(-24 12 12)" />
        <circle cx="12" cy="12" r="2.2" fill={color} />
      </svg>
    );
  }
  if (kind === "nebula") {
    return (
      <svg className="ex-glyph" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 14c0-4 3-7 6.5-7 2.5 0 3.5 1.6 5 1.6 2 0 3 1.6 3 3.6 0 3.5-3.4 5.3-7.4 5.3C8 17.5 5 16.6 5 14Z" fill={color} opacity=".55" />
      </svg>
    );
  }
  if (kind === "cluster") {
    return (
      <svg className="ex-glyph" viewBox="0 0 24 24" aria-hidden="true">
        {[[12, 12, 2], [8, 9, 1.3], [16, 9.5, 1.4], [9, 15.5, 1.2], [15.5, 15, 1.5], [12, 6.5, 1]].map(([x, y, r]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill={color} />
        ))}
      </svg>
    );
  }
  if (kind === "spacecraft") {
    return (
      <svg className="ex-glyph" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 4v16M6 8l6 2 6-2M9 17h6" stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "black-hole") {
    return (
      <svg className="ex-glyph" viewBox="0 0 24 24" aria-hidden="true">
        <ellipse cx="12" cy="12" rx="9.5" ry="3" fill="none" stroke="#ffb35c" strokeWidth="1.5" />
        <circle cx="12" cy="12" r="4" fill="#000" stroke="#ffd59a" strokeWidth="1" />
      </svg>
    );
  }
  if (kind === "star" || kind === "sun" || kind === "exoplanet-system") {
    return (
      <svg className="ex-glyph" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="4" fill={color} />
        <circle cx="12" cy="12" r="7.5" fill={color} opacity=".18" />
        {kind === "exoplanet-system" ? <ellipse cx="12" cy="12" rx="10" ry="4" fill="none" stroke={color} strokeWidth="1" opacity=".7" /> : null}
      </svg>
    );
  }
  const ringed = entity.id === "solar:planet:saturn" || entity.id === "solar:planet:uranus";
  return (
    <svg className="ex-glyph" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r={kind === "moon" || kind === "comet" ? 4.5 : 6} fill={color} />
      <path d={`M${kind === "moon" ? 12 : 12} ${kind === "moon" ? 7.5 : 6}a${kind === "moon" ? 4.5 : 6} ${kind === "moon" ? 4.5 : 6} 0 0 1 0 ${kind === "moon" ? 9 : 12}`} fill="rgba(0,0,0,.45)" />
      {ringed ? <ellipse cx="12" cy="12" rx="10.5" ry="3" fill="none" stroke={color} strokeWidth="1.2" transform="rotate(-18 12 12)" /> : null}
    </svg>
  );
};

// ---------------------------------------------------------------------------------------------
// Search

export const SearchBox: FC<{
  search: (query: string) => SearchHit[];
  onSelect: (entity: UniverseEntity, fly: boolean) => void;
  index: UniverseIndex;
  timeMs: number;
  autoFocusKey: number;
  /** Offer "Photographs of …" as the last row, and on Enter when nothing in the universe matches. */
  onSearchPhotos?: (query: string) => void;
}> = ({ search, onSelect, index, timeMs, autoFocusKey, onSearchPhotos }) => {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const results = useMemo(() => (query.trim() ? search(query) : []), [query, search]);
  void index;
  useEffect(() => {
    setActive(0);
  }, [query]);
  useEffect(() => {
    if (autoFocusKey > 0) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [autoFocusKey]);
  const choose = (hit: SearchHit | undefined, fly: boolean) => {
    if (!hit) return;
    onSelect(hit.entity, fly);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  };
  const photoRow = Boolean(onSearchPhotos && query.trim().length >= 2);
  const rowCount = results.length + (photoRow ? 1 : 0);
  const searchPhotos = () => {
    const value = query.trim();
    if (!value || !onSearchPhotos) return;
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
    onSearchPhotos(value);
  };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((value) => Math.min(rowCount - 1, value + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((value) => Math.max(0, value - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (results[active]) choose(results[active], true);
      else if (photoRow) searchPhotos();
    } else if (event.key === "Escape") {
      setQuery("");
      setOpen(false);
      inputRef.current?.blur();
    }
  };
  return (
    <div className={`ex-search${open && rowCount ? " is-open" : ""}`} role="combobox" aria-expanded={open && rowCount > 0} aria-haspopup="listbox">
      <label className="ex-search__field">
        <Icon name="search" size={17} />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 160)}
          onKeyDown={onKeyDown}
          placeholder="Fly to a planet, star, nebula, galaxy…"
          aria-label="Search the universe"
          aria-controls="ex-search-results"
          spellCheck={false}
          autoComplete="off"
        />
        <kbd className="ex-kbd" aria-hidden="true">/</kbd>
      </label>
      {open && rowCount ? (
        <ul className="ex-search__results" id="ex-search-results" role="listbox">
          {results.map((hit, i) => {
            const world = getEntityWorld(hit.entity, timeMs);
            const distance = world ? Math.hypot(...world) : null;
            return (
              <li key={hit.entity.id} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  className={`ex-search__hit${i === active ? " is-active" : ""}`}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(hit, true)}
                >
                  <KindGlyph entity={hit.entity} />
                  <span className="ex-search__name">
                    <strong>{hit.entity.name}</strong>
                    <small>
                      {hit.entity.category}
                      {hit.matched && hit.matched !== hit.entity.name && hit.matched !== hit.entity.category ? ` · ${hit.matched}` : ""}
                    </small>
                  </span>
                  <span className="ex-search__dist">{distance !== null ? formatDistanceKm(distance) : "sky"}</span>
                </button>
              </li>
            );
          })}
          {photoRow ? (
            <li role="option" aria-selected={active === results.length}>
              <button
                type="button"
                className={`ex-search__hit ex-search__hit--photos${active === results.length ? " is-active" : ""}`}
                onMouseEnter={() => setActive(results.length)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={searchPhotos}
              >
                <span className="ex-glyph ex-glyph--photos" aria-hidden="true">
                  <Icon name="images" size={15} />
                </span>
                <span className="ex-search__name">
                  <strong>Photographs of “{query.trim()}”</strong>
                  <small>NASA, SDSS and Pan-STARRS archives</small>
                </span>
              </button>
            </li>
          ) : null}
          <li className="ex-search__foot" aria-hidden="true">↵ fly there · ↑↓ choose · esc close</li>
        </ul>
      ) : null}
    </div>
  );
};

// ---------------------------------------------------------------------------------------------
// Object panel

export const ObjectPanel: FC<{
  entity: UniverseEntity;
  facts: Fact[];
  description?: string;
  routes: OnwardRoute[];
  isTracked: boolean;
  onClose: () => void;
  onFly: () => void;
  onRoute: (route: OnwardRoute) => void;
  onImages: () => void;
  onShare: () => void;
  onOpenSolar?: () => void;
  flying: boolean;
  onSave?: () => void;
  saved?: boolean;
  /** Photographs and the light-travel story, supplied by the page. */
  extras?: ReactNode;
}> = ({ entity, facts, description, routes, isTracked, onClose, onFly, onRoute, onImages, onShare, onOpenSolar, flying, onSave, saved, extras }) => {
  const [showSource, setShowSource] = useState(false);
  const deep = entity.object?.scientific as DeepSkyScientificMetadata | undefined;
  const image = deep?.imagery?.find((item) => item.previewUrl);
  const provenance = entity.object?.provenance ?? [];
  const illustrative =
    entity.kind === "galaxy" || entity.kind === "nebula" || entity.kind === "structure" || entity.kind === "black-hole" || entity.kind === "exoplanet-system"
      ? "Position and size are catalogue values; the rendered structure is an illustrative model."
      : entity.solarId && ["solar:moon:io", "solar:moon:europa", "solar:moon:ganymede", "solar:moon:callisto", "solar:moon:titan", "solar:moon:enceladus"].includes(entity.id)
        ? "Surface is a procedural illustration; position comes from the Astronomy Engine ephemeris."
        : undefined;
  return (
    <aside className="ex-panel" aria-label={`${entity.name} details`}>
      <header className="ex-panel__head">
        <KindGlyph entity={entity} />
        <div>
          <h2>{entity.name}</h2>
          <p>{entity.category}</p>
        </div>
        <button type="button" className="ex-icon-btn" onClick={onClose} aria-label="Close details">
          <Icon name="close" size={16} />
        </button>
      </header>
      {image?.previewUrl ? (
        <figure className="ex-panel__image">
          <img src={image.previewUrl} alt={image.alt ?? entity.name} loading="lazy" />
          <figcaption>{image.credit ?? image.source}</figcaption>
        </figure>
      ) : null}
      <div className="ex-panel__actions">
        <button type="button" className="ex-btn ex-btn--primary" onClick={onFly} disabled={flying}>
          <Icon name={isTracked ? "follow" : "fly"} size={16} />
          {isTracked ? "Recentre" : "Fly here"}
        </button>
        <button type="button" className="ex-btn" onClick={onImages}>
          <Icon name="images" size={16} />
          Photographs
        </button>
        {onSave ? (
          <button type="button" className={`ex-icon-btn ex-icon-btn--framed${saved ? " is-on" : ""}`} onClick={onSave} aria-label={saved ? "View saved to Your sky" : "Save this view to Your sky"} title="Save view">
            <Icon name={saved ? "star-filled" : "star"} size={16} />
          </button>
        ) : null}
        <button type="button" className="ex-icon-btn ex-icon-btn--framed" onClick={onShare} aria-label="Share this exact view">
          <Icon name="share" size={16} />
        </button>
      </div>
      {description ? <p className="ex-panel__desc">{description}</p> : null}
      {extras}
      {facts.length ? (
        <dl className="ex-facts">
          {facts.map((fact) => (
            <div key={fact.label} data-kind={fact.kind ?? "measured"}>
              <dt>
                {fact.label}
                <i className={`ex-factmark ex-factmark--${fact.kind ?? "measured"}`} title={fact.kind === "derived" ? "Derived: computed from measurements for this moment" : fact.kind === "illustrative" ? "Illustrative" : "Measured or catalogued"} aria-label={fact.kind ?? "measured"} />
              </dt>
              <dd>
                {fact.value}
                {fact.note ? <small>{fact.note}</small> : null}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      <p className="ex-legend" aria-hidden="true">
        <span className="sv-mark sv-mark--measured">Measured</span>
        <span className="sv-mark sv-mark--derived">Derived</span>
        <span className="sv-mark sv-mark--illustrative">Illustrative</span>
      </p>
      {routes.length ? (
        <section className="ex-routes" aria-label="Go next">
          <h3>Go next</h3>
          <ul>
            {routes.map((route) => (
              <li key={`${route.id}-${route.label}`}>
                <button type="button" onClick={() => onRoute(route)}>
                  <span>{route.label}</span>
                  <small>{route.reason}</small>
                  <Icon name="next" size={14} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {onOpenSolar ? (
        <button type="button" className="ex-link-btn" onClick={onOpenSolar}>
          Open in Solar Explorer — eclipses, true-AU ruler, mission tools
        </button>
      ) : null}
      <footer className="ex-panel__source">
        <button type="button" className="ex-link-btn" onClick={() => setShowSource((value) => !value)} aria-expanded={showSource}>
          <Icon name="info" size={14} /> {showSource ? "Hide data sources" : "Data sources & accuracy"}
        </button>
        {showSource ? (
          <div className="ex-panel__provenance">
            {isDirectionOnly(entity) ? <p>{entity.distanceNote}</p> : null}
            {illustrative ? <p>{illustrative}</p> : null}
            {provenance.slice(0, 4).map((item) => (
              <p key={`${item.source}-${item.catalog}`}>
                {item.url ? (
                  <a href={item.url} target="_blank" rel="noreferrer">
                    {item.source}
                  </a>
                ) : (
                  item.source
                )}
                {item.catalog ? ` · ${item.catalog}` : ""}
                {item.sourceId ? ` · ${item.sourceId}` : ""}
              </p>
            ))}
            {entity.solarId ? <p>Positions: VSOP87C (planets), Astronomy Engine 2.1.19 (Moon, Galilean moons), JPL SBDB elements (small bodies). Orientation: IAU WGCCRE.</p> : null}
            {entity.id === "galactic:milky-way-structure" ? <p>Arms: Reid et al. 2019, ApJ 885, 131 (Table 2). Bar, bulge and disk scale lengths are illustrative.</p> : null}
          </div>
        ) : null}
      </footer>
    </aside>
  );
};

// ---------------------------------------------------------------------------------------------
// Discover

export const DiscoverPanel: FC<{
  journeys: Journey[];
  index: UniverseIndex;
  onStartJourney: (journey: Journey) => void;
  onPick: (id: string) => void;
  onClose: () => void;
  catalogues: CatalogueStatus[];
}> = ({ journeys, index, onStartJourney, onPick, onClose, catalogues }) => {
  const groups: Array<{ title: string; ids: string[] }> = [
    { title: "Solar System", ids: ["solar:sun", "solar:planet:earth", "solar:planet:mars", "solar:planet:jupiter", "solar:planet:saturn", "solar:moon:moon", "solar:planet:pluto", "solar:small-body:halley"] },
    { title: "Explorers", ids: ["spacecraft:voyager-1", "spacecraft:voyager-2"] },
    { title: "Stars & nebulae", ids: ["deep:nebula:orion-nebula", "deep:nebula:crab-nebula", "deep:nebula:ring-nebula", "deep:cluster:pleiades", "deep:cluster:omega-centauri"] },
    { title: "Galaxies", ids: ["galactic:milky-way-structure", "explore:sagittarius-a-star", "deep:galaxy:andromeda-galaxy", "deep:galaxy:triangulum-galaxy", "deep:galaxy:whirlpool-galaxy", "deep:galaxy:sombrero-galaxy"] },
  ];
  return (
    <aside className="ex-panel ex-discover" aria-label="Discover">
      <header className="ex-panel__head ex-panel__head--plain">
        <div>
          <h2>Discover</h2>
          <p>Journeys through real catalogues, at true scale</p>
        </div>
        <button type="button" className="ex-icon-btn" onClick={onClose} aria-label="Close Discover">
          <Icon name="close" size={16} />
        </button>
      </header>
      <ul className="ex-journeys">
        {journeys.map((journey) => {
          const hero = index.byId.get(journey.hero);
          const heroImage = (hero?.object?.scientific as DeepSkyScientificMetadata | undefined)?.imagery?.find((item) => item.previewUrl)?.previewUrl;
          return (
            <li key={journey.id}>
              <button type="button" onClick={() => onStartJourney(journey)}>
                {heroImage ? <img className="ex-journeys__thumb" src={heroImage} alt="" loading="lazy" /> : hero ? <KindGlyph entity={hero} /> : null}
                <span>
                  <strong>{journey.title}</strong>
                  <small>{journey.subtitle}</small>
                </span>
                <em>{journey.stops.length} stops</em>
              </button>
            </li>
          );
        })}
      </ul>
      {groups.map((group) => {
        const items = group.ids.map((id) => index.byId.get(id)).filter((entity): entity is UniverseEntity => Boolean(entity));
        if (!items.length) return null;
        return (
          <section key={group.title} className="ex-chips-group">
            <h3>{group.title}</h3>
            <div className="ex-chips">
              {items.map((entity) => (
                <button key={entity.id} type="button" className="ex-chip" onClick={() => onPick(entity.id)}>
                  <KindGlyph entity={entity} />
                  {entity.name}
                </button>
              ))}
            </div>
          </section>
        );
      })}
      <section className="ex-catalogues" aria-label="Catalogue status">
        {catalogues.map((catalogue) => (
          <p key={catalogue.id} data-status={catalogue.status}>
            <i aria-hidden="true" />
            {catalogue.label} <span>{catalogue.detail}</span>
          </p>
        ))}
      </section>
    </aside>
  );
};

// ---------------------------------------------------------------------------------------------
// Time

export const RATE_PRESETS: Array<{ label: string; rate: number }> = [
  { label: "Real time", rate: 1 },
  { label: "1 min/s", rate: 60 },
  { label: "1 hour/s", rate: 3_600 },
  { label: "1 day/s", rate: 86_400 },
  { label: "1 week/s", rate: 604_800 },
  { label: "1 month/s", rate: 2_629_800 },
  { label: "1 year/s", rate: 31_557_600 },
];

export const describeRate = (rate: number) => {
  const preset = RATE_PRESETS.find((item) => item.rate === Math.abs(rate));
  return `${rate < 0 ? "−" : ""}${preset ? preset.label : `${Math.abs(rate)}×`}`;
};

export const TimeCapsule: FC<{
  timeMs: number;
  rate: number;
  paused: boolean;
  live: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  onTogglePaused: () => void;
  onRate: (rate: number) => void;
  onNow: () => void;
  onSetTime: (ms: number) => void;
}> = ({ timeMs, rate, paused, live, expanded, onToggleExpanded, onTogglePaused, onRate, onNow, onSetTime }) => {
  const date = new Date(timeMs);
  const dateText = date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const timeText = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  const isLive = live;
  const forward = rate >= 0;
  const magnitude = Math.abs(rate);
  return (
    <div className={`ex-time${expanded ? " is-expanded" : ""}`}>
      <button type="button" className="ex-time__summary" onClick={onToggleExpanded} aria-expanded={expanded} aria-label="Time controls">
        <Icon name="time" size={16} />
        <span className="ex-time__date">{dateText}</span>
        <span className="ex-time__clock">{timeText} UTC</span>
        <span className={`ex-time__state${isLive ? " is-live" : ""}`}>{isLive ? "Live" : paused ? "Paused" : describeRate(rate)}</span>
      </button>
      {expanded ? (
        <div className="ex-time__controls">
          <div className="ex-time__row">
            <button type="button" className={`ex-icon-btn ex-icon-btn--framed${!forward && !paused ? " is-on" : ""}`} aria-label="Play backwards" onClick={() => onRate(-magnitude || -1)}>
              <Icon name="reverse" size={14} />
            </button>
            <button type="button" className="ex-icon-btn ex-icon-btn--framed ex-time__play" aria-label={paused ? "Play" : "Pause"} onClick={onTogglePaused}>
              <Icon name={paused ? "play" : "pause"} size={16} />
            </button>
            <button type="button" className={`ex-icon-btn ex-icon-btn--framed${forward && !paused ? " is-on" : ""}`} aria-label="Play forwards" onClick={() => onRate(magnitude || 1)}>
              <Icon name="play" size={14} />
            </button>
            <button type="button" className="ex-btn ex-btn--small" onClick={onNow}>
              <Icon name="now" size={14} /> Now
            </button>
          </div>
          <div className="ex-time__rates" role="radiogroup" aria-label="Speed">
            {RATE_PRESETS.map((preset) => (
              <button
                key={preset.rate}
                type="button"
                role="radio"
                aria-checked={Math.abs(rate) === preset.rate}
                className={Math.abs(rate) === preset.rate ? "is-on" : ""}
                onClick={() => onRate(forward ? preset.rate : -preset.rate)}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <label className="ex-time__input">
            <span>Date &amp; time (UTC)</span>
            <input
              type="datetime-local"
              min="1900-01-01T00:00"
              max="2100-12-31T23:59"
              value={new Date(timeMs).toISOString().slice(0, 16)}
              onChange={(event) => {
                const ms = Date.parse(`${event.target.value}:00Z`);
                if (Number.isFinite(ms)) onSetTime(ms);
              }}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
};

// ---------------------------------------------------------------------------------------------
// Location rail: where am I, where is that, how big is this view

export interface ScaleStep {
  id: string;
  label: string;
  target: string | null;
}

export const SCALE_STEPS: ScaleStep[] = [
  { id: "planet", label: "Close-up", target: "solar:planet:earth" },
  { id: "system", label: "Solar System", target: "solar:sun" },
  { id: "stars", label: "Nearby stars", target: "star-neighbourhood" },
  { id: "galaxy", label: "Milky Way", target: "galactic:milky-way-structure" },
  { id: "group", label: "Local Group", target: "local-group" },
];

export const scaleStepFor = (viewWidthKm: number, fromSunKm: number) => {
  const reach = Math.max(viewWidthKm, fromSunKm);
  if (reach < 2e7) return 0;
  if (reach < 0.02 * KM_PER_LY) return 1;
  if (reach < 3_000 * KM_PER_LY) return 2;
  if (reach < 300_000 * KM_PER_LY) return 3;
  return 4;
};

export const describeLocation = (cameraWorld: Vec3, index: UniverseIndex, timeMs: number) => {
  const fromSun = Math.hypot(...cameraWorld);
  if (fromSun < 0.02 * KM_PER_LY) {
    // Nearest planet as a landmark.
    let nearest: { name: string; d: number } | null = null;
    for (const entity of index.entities) {
      if (!entity.solarId || (entity.kind !== "planet" && entity.kind !== "moon" && entity.kind !== "dwarf-planet")) continue;
      const w = getEntityWorld(entity, timeMs);
      if (!w) continue;
      const d = Math.hypot(w[0] - cameraWorld[0], w[1] - cameraWorld[1], w[2] - cameraWorld[2]);
      if (!nearest || d < nearest.d) nearest = { name: entity.name, d };
    }
    const au = fromSun / KM_PER_AU;
    return nearest && nearest.d < 5e6
      ? `Near ${nearest.name} · ${au.toFixed(2)} AU from the Sun`
      : `${au < 10 ? au.toFixed(2) : Math.round(au)} AU from the Sun`;
  }
  const fromCentre = Math.hypot(cameraWorld[0] - GALACTIC_CENTRE_WORLD[0], cameraWorld[1] - GALACTIC_CENTRE_WORLD[1], cameraWorld[2] - GALACTIC_CENTRE_WORLD[2]);
  if (fromCentre < 60_000 * KM_PER_LY) return `${formatDistanceKm(fromSun)} from the Sun · ${formatDistanceKm(fromCentre)} from the Galactic Centre`;
  if (fromSun < 3 * KM_PER_MPC) return `${formatDistanceKm(fromSun)} from the Sun · in the Local Group`;
  return `${formatDistanceKm(fromSun)} from the Sun`;
};

export const LocationRail: FC<{
  step: number;
  location: string;
  viewWidthKm: number;
  onStep: (step: ScaleStep) => void;
}> = ({ step, location, viewWidthKm, onStep }) => (
  <nav className="ex-rail" aria-label="Scale">
    <ol className="ex-rail__steps">
      {SCALE_STEPS.map((item, i) => (
        <li key={item.id} className={i === step ? "is-here" : i < step ? "is-inside" : ""}>
          <button type="button" onClick={() => onStep(item)} aria-current={i === step ? "location" : undefined}>
            {item.label}
          </button>
        </li>
      ))}
    </ol>
    <p className="ex-rail__where">
      <span>{location}</span>
      <span className="ex-rail__width">View ≈ {formatDistanceKm(viewWidthKm)} wide</span>
    </p>
  </nav>
);

// ---------------------------------------------------------------------------------------------

export const FlightBar: FC<{ label: string; kind: string; onCancel: () => void }> = ({ label, kind, onCancel }) => (
  <div className="ex-flight" role="status">
    <span className="ex-flight__pulse" aria-hidden="true" />
    <span>
      Flying to <strong>{label}</strong>
      <small>{kind === "hop" ? "short hop" : kind === "intergalactic" ? "across intergalactic space" : kind === "galactic" ? "across the Galaxy" : kind === "interstellar" ? "between the stars" : "through the Solar System"}</small>
    </span>
    <button type="button" className="ex-link-btn" onClick={onCancel}>
      Stop <kbd className="ex-kbd">esc</kbd>
    </button>
  </div>
);

export const JourneyBar: FC<{
  journey: Journey;
  stepIndex: number;
  caption: string;
  onPrev: () => void;
  onNext: () => void;
  onExit: () => void;
}> = ({ journey, stepIndex, caption, onPrev, onNext, onExit }) => (
  <div className="ex-journey" role="region" aria-label={`Journey: ${journey.title}`}>
    <div className="ex-journey__meta">
      <span>{journey.title}</span>
      <span>
        {stepIndex + 1} / {journey.stops.length}
      </span>
    </div>
    <p>{caption}</p>
    <div className="ex-journey__nav">
      <button type="button" className="ex-icon-btn ex-icon-btn--framed" onClick={onPrev} disabled={stepIndex === 0} aria-label="Previous stop">
        <Icon name="back" size={16} />
      </button>
      <button type="button" className="ex-btn ex-btn--primary" onClick={onNext}>
        {stepIndex + 1 >= journey.stops.length ? "Finish" : "Next stop"} <Icon name="next" size={14} />
      </button>
      <button type="button" className="ex-link-btn" onClick={onExit}>
        Exit
      </button>
    </div>
  </div>
);

export const Popover: FC<{ children: ReactNode; className?: string }> = ({ children, className }) => (
  <div className={`ex-popover ${className ?? ""}`}>{children}</div>
);

export { KM_PER_LY };
