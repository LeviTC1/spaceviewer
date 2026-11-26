// The parts of the explorer that connect the live universe to the rest of SpaceViewer:
//   StartPanel      — the first card: something incredible, today's moment, journeys, places
//   TelescopeStrip  — real archive photographs of the selected object ("Seen by telescopes")
//   MomentCard      — the story of a replayed event, with a way back to now
//   ShareMenu       — link to this exact view, postcard image, system share

import { useEffect, useRef, useState, type FC } from "react";
import type { DeepSkyScientificMetadata } from "../skymap/core/objects";
import type { SpaceImage } from "../../models/SpaceImage";
import { searchTargets } from "../../utils/api";
import { mapSearchItem, type SearchResult } from "../../utils/mapSearchItem";
import { filterSearchResults, isLikelyNonSpaceImage } from "../../utils/spaceFilter";
import { Icon } from "../../shell/Icon";
import { formatMomentDate, momentForToday, MOMENTS, type Moment } from "../../shell/moments";
import { formatYear, lightStory } from "../../shell/places";
import { liveFeedsForPlace } from "../../shell/liveFeeds";
import type { CatalogueStatus } from "./useUniverseData";
import type { Journey } from "./discovery";
import { isDirectionOnly, type UniverseEntity, type UniverseIndex } from "./engine/universeModel";
import { KM_PER_LY } from "./engine/units";
import { hasSkyPhoto, SKY_PHOTO_SOURCE, useSkyPhotoStatus } from "./skyPhoto";
import { figureFor, type SkyCulture } from "./skyCulture";
import { KindGlyph } from "./ExploreChrome";

// ---------------------------------------------------------------------------------------------
// "Show me something incredible"

export const SURPRISES: Array<{ id: string; hook: string }> = [
  { id: "solar:planet:saturn", hook: "Rings 280,000 km wide and, in places, only about ten metres thick." },
  { id: "deep:nebula:carina-nebula", hook: "A star factory 8,500 light-years away, where Webb photographed the Cosmic Cliffs." },
  { id: "deep:galaxy:andromeda-galaxy", hook: "A trillion stars falling toward us at 110 km/s. The light you see left before modern humans existed." },
  { id: "solar:moon:europa", hook: "An ice shell over a salt-water ocean holding twice as much water as all of Earth's." },
  { id: "explore:sagittarius-a-star", hook: "Four million suns packed into a region smaller than Mercury's orbit." },
  { id: "deep:nebula:orion-nebula", hook: "The nearest big stellar nursery, a fuzzy patch you can see with your own eyes." },
  { id: "deep:galaxy:sombrero-galaxy", hook: "Seen almost exactly edge-on: a lane of dust across a brilliant bulge." },
  { id: "solar:planet:jupiter", hook: "A storm wider than Earth that has raged for at least 190 years." },
  { id: "deep:cluster:omega-centauri", hook: "Ten million stars, possibly the stripped core of a swallowed galaxy." },
  { id: "spacecraft:voyager-1", hook: "Our farthest messenger, still sending data from interstellar space." },
  { id: "deep:nebula:crab-nebula", hook: "The wreck of a star that Chinese astronomers saw explode in 1054." },
  { id: "deep:galaxy:whirlpool-galaxy", hook: "A grand-design spiral being tugged by its smaller companion." },
  { id: "solar:moon:titan", hook: "Rivers, lakes and rain, made of methane instead of water." },
  { id: "galactic:milky-way-structure", hook: "Our galaxy from outside, with the Sun marked among its spiral arms." },
  { id: "deep:cluster:pleiades", hook: "The Seven Sisters: young blue stars 444 light-years away." },
  { id: "deep:galaxy:large-magellanic-cloud", hook: "A neighbour galaxy, home of the Tarantula Nebula." },
];

export const pickSurprise = (index: UniverseIndex, exclude: string | null, seen: string[]) => {
  const available = SURPRISES.filter((item) => item.id !== exclude && index.byId.has(item.id) && !isDirectionOnly(index.byId.get(item.id)!));
  const fresh = available.filter((item) => !seen.includes(item.id));
  const pool = fresh.length ? fresh : available;
  return pool[Math.floor(Math.random() * pool.length)] ?? null;
};

// ---------------------------------------------------------------------------------------------
// Start panel (was Discover)

export const StartPanel: FC<{
  journeys: Journey[];
  index: UniverseIndex;
  catalogues: CatalogueStatus[];
  resume: { id: string; name: string } | null;
  onSurprise: () => void;
  onTonight: () => void;
  onMoment: (moment: Moment) => void;
  onStartJourney: (journey: Journey) => void;
  onPick: (id: string) => void;
  onResume: () => void;
  onClose: () => void;
}> = ({ journeys, index, catalogues, resume, onSurprise, onTonight, onMoment, onStartJourney, onPick, onResume, onClose }) => {
  const [today] = useState(() => momentForToday());
  const groups: Array<{ title: string; ids: string[] }> = [
    { title: "Solar System", ids: ["solar:sun", "solar:planet:earth", "solar:planet:mars", "solar:planet:jupiter", "solar:planet:saturn", "solar:moon:moon", "solar:planet:pluto", "solar:small-body:halley"] },
    { title: "Explorers", ids: ["spacecraft:voyager-1", "spacecraft:voyager-2"] },
    { title: "Stars & nebulae", ids: ["deep:nebula:orion-nebula", "deep:nebula:carina-nebula", "deep:nebula:crab-nebula", "deep:nebula:ring-nebula", "deep:cluster:pleiades", "deep:cluster:omega-centauri"] },
    { title: "Galaxies", ids: ["galactic:milky-way-structure", "explore:sagittarius-a-star", "deep:galaxy:andromeda-galaxy", "deep:galaxy:triangulum-galaxy", "deep:galaxy:whirlpool-galaxy", "deep:galaxy:sombrero-galaxy"] },
  ];
  const loading = catalogues.filter((item) => item.status === "loading" || item.status === "streaming");
  return (
    <aside className="ex-panel ex-start" aria-label="Start here">
      <header className="ex-panel__head ex-panel__head--plain">
        <div>
          <h2 className="ex-serif">The universe, live</h2>
          <p>Everything here is where it really is, right now. Drag to look around. Scroll to travel.</p>
        </div>
        <button type="button" className="ex-icon-btn" onClick={onClose} aria-label="Close">
          <Icon name="close" size={16} />
        </button>
      </header>

      <button type="button" className="ex-surprise" onClick={onSurprise}>
        <span className="ex-surprise__icon" aria-hidden="true">
          <Icon name="sparkle" size={20} />
        </span>
        <span>
          <strong>Show me something incredible</strong>
          <small>Fly somewhere extraordinary and see real photographs of it</small>
        </span>
        <Icon name="next" size={16} />
      </button>

      <button type="button" className="ex-surprise ex-surprise--tonight" onClick={onTonight}>
        <span className="ex-surprise__icon" aria-hidden="true">
          <Icon name="tonight" size={20} />
        </span>
        <span>
          <strong>Tonight's sky from where you are</strong>
          <small>Stand on the Earth: the real horizon, planets and constellations, right now</small>
        </span>
        <Icon name="next" size={16} />
      </button>

      {resume ? (
        <button type="button" className="ex-resume" onClick={onResume}>
          <Icon name="now" size={16} />
          <span>
            Continue at <strong>{resume.name}</strong>
          </span>
        </button>
      ) : null}

      <section className="ex-start__moment" aria-label="Moment">
        <p className="ex-eyebrow">{today.daysAway === 0 ? "On this day" : today.daysAway <= 14 ? `In ${today.daysAway} day${today.daysAway === 1 ? "" : "s"}` : "Replay a moment"}</p>
        <button type="button" className="ex-moment-tile" onClick={() => onMoment(today.moment)}>
          <strong className="ex-serif">{today.moment.title}</strong>
          <small>{formatMomentDate(today.moment.at)}</small>
          <span>
            <Icon name="play" size={12} /> Replay
          </span>
        </button>
        <ul className="ex-moments">
          {MOMENTS.filter((moment) => moment.id !== today.moment.id).map((moment) => (
            <li key={moment.id}>
              <button type="button" onClick={() => onMoment(moment)}>
                <span>{moment.title}</span>
                <small>{new Date(moment.at).getUTCFullYear()}</small>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Journeys">
        <p className="ex-eyebrow">Journeys</p>
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
      </section>

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
        {loading.length ? <p className="ex-catalogues__live">Streaming {loading.map((item) => item.label).join(", ")}…</p> : null}
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
// Seen by telescopes

interface StripState {
  status: "loading" | "ready" | "empty" | "error";
  images: SpaceImage[];
  raw: SearchResult[];
}

const stripCache = new Map<string, StripState>();

export const imageQueryFor = (entity: UniverseEntity) => {
  if (entity.id === "explore:sagittarius-a-star") return "Sagittarius A* black hole";
  if (entity.id === "galactic:milky-way-structure") return "Milky Way";
  if (entity.id === "solar:moon:moon") return "Moon surface";
  if (entity.id === "solar:sun") return "Sun solar dynamics observatory";
  if (entity.kind === "moon" && entity.parentId) return `${entity.name} ${entity.parentId.split(":").pop()}`;
  return entity.name;
};

export const TelescopeStrip: FC<{
  entity: UniverseEntity;
  onOpen: (image: SpaceImage, pool: SearchResult[]) => void;
  onMore: () => void;
}> = ({ entity, onOpen, onMore }) => {
  const query = imageQueryFor(entity);
  const [state, setState] = useState<StripState>(() => stripCache.get(query) ?? { status: "loading", images: [], raw: [] });
  useEffect(() => {
    const cached = stripCache.get(query);
    if (cached) {
      setState(cached);
      return;
    }
    let active = true;
    setState({ status: "loading", images: [], raw: [] });
    searchTargets(query, 1, "nasa")
      .then((response) => {
        const raw = response.success ? filterSearchResults(response.results).slice(0, 12) : [];
        const images = raw
          .map(mapSearchItem)
          .filter((image) => (image.thumbnailUrl || image.imageUrl) && !isLikelyNonSpaceImage(image))
          .slice(0, 8);
        const next: StripState = { status: response.success ? (images.length ? "ready" : "empty") : "error", images, raw };
        if (response.success) stripCache.set(query, next);
        if (active) setState(next);
      })
      .catch(() => active && setState({ status: "error", images: [], raw: [] }));
    return () => {
      active = false;
    };
  }, [query]);

  return (
    <section className="ex-telescopes" aria-label={`Photographs of ${entity.name}`}>
      <header>
        <h3>Seen by telescopes</h3>
        <button type="button" className="ex-link-btn" onClick={onMore}>
          All photographs <Icon name="next" size={12} />
        </button>
      </header>
      {state.status === "loading" ? (
        <div className="ex-telescopes__row" aria-busy="true">
          {Array.from({ length: 4 }, (_, i) => (
            <span key={i} className="ex-telescopes__skeleton" />
          ))}
        </div>
      ) : state.status === "ready" ? (
        <ul className="ex-telescopes__row">
          {state.images.map((image) => (
            <li key={image.id}>
              <button type="button" onClick={() => onOpen(image, state.raw)} title={image.title}>
                <img src={image.thumbnailUrl || image.imageUrl} alt={image.title} loading="lazy" decoding="async" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="ex-telescopes__empty">
          {state.status === "error" ? "The photograph archive didn't answer. Try “All photographs”." : "No archive photographs matched this name."}
        </p>
      )}
    </section>
  );
};

// ---------------------------------------------------------------------------------------------
// Light-travel story for anything beyond the Solar System

const lyText = (ly: number) => (ly < 100 ? ly.toFixed(1) : Math.round(ly).toLocaleString("en-GB"));

/** For a star in a constellation figure: how far apart its "neighbours" really are, and a flight to prove it. */
export const FigureLine: FC<{ entity: UniverseEntity; culture: SkyCulture | null; onShowFigure: () => void; onComeApart: () => void; figuresOn: boolean }> = ({
  entity,
  culture,
  onShowFigure,
  onComeApart,
  figuresOn,
}) => {
  const info = culture ? figureFor(culture, entity) : null;
  if (!info) return null;
  return (
    <div className="ex-figure-line">
      <p className="ex-eyebrow">Constellation</p>
      <p>
        One of the {info.stars} stars that draw <strong>{info.figure.name}</strong>. They look side by side from Earth, but lie between{" "}
        {lyText(info.nearestLy)} and {lyText(info.farthestLy)} light-years away: the figure only exists from here.
      </p>
      <div className="ex-figure-line__actions">
        {!figuresOn ? (
          <button type="button" className="sv-btn sv-btn--small" onClick={onShowFigure}>
            Show the figure
          </button>
        ) : null}
        <button type="button" className="sv-btn sv-btn--small" onClick={onComeApart}>
          <Icon name="fly" size={13} /> Watch it come apart
        </button>
      </div>
    </div>
  );
};

export const LightStoryLine: FC<{ entity: UniverseEntity; distanceKm: number | null }> = ({ entity, distanceKm }) => {
  if (!distanceKm || isDirectionOnly(entity)) return null;
  const ly = distanceKm / KM_PER_LY;
  if (ly < 0.5) return null;
  const story = lightStory(ly);
  return (
    <p className="ex-lightstory">
      <span className="sv-mark sv-mark--derived">Derived</span>
      The light you would see from here left {entity.name} <strong>{story.travel} ago</strong>
      {story.departed !== null && ly >= 100 ? <>, around {formatYear(story.departed)}</> : null}
      {story.era ? <>: {story.era}</> : null}.
    </p>
  );
};

// ---------------------------------------------------------------------------------------------
// Survey photograph registered on the selected object

const formatFov = (deg: number) => (deg >= 1 ? `${deg.toFixed(1)}°` : `${Math.round(deg * 60)}′`);

export const SkyPhotoLine: FC<{ entity: UniverseEntity }> = ({ entity }) => {
  const status = useSkyPhotoStatus();
  if (!hasSkyPhoto(entity) || status.entityId !== entity.id || status.state === "idle") return null;
  return (
    <p className="ex-lightstory ex-skyphoto" aria-live="polite">
      <span className="sv-mark sv-mark--measured">Photograph</span>
      {status.state === "loading" ? (
        <>Developing a survey photograph of this patch of sky…</>
      ) : status.state === "error" ? (
        <>The sky survey didn't answer, so you're seeing the 3D model only.</>
      ) : (
        <>
          A real photograph of a {formatFov(status.fovDeg)} field, <strong>as seen from Earth</strong>, hung at its true place and size. Fly
          off our line of sight and it fades into the 3D model. <span className="ex-skyphoto__credit">{SKY_PHOTO_SOURCE.credit}.</span>
        </>
      )}
    </p>
  );
};

// ---------------------------------------------------------------------------------------------
// Moments

export const MomentCard: FC<{
  moment: Moment;
  lensDeg: number;
  onNormalLens: () => void;
  onTelescope: () => void;
  onNow: () => void;
  onImages: () => void;
  onClose: () => void;
}> = ({ moment, lensDeg, onNormalLens, onTelescope, onNow, onImages, onClose }) => (
  <aside className="ex-moment" aria-label={`Moment: ${moment.title}`}>
    <header>
      <p className="ex-eyebrow">
        <Icon name="clock" size={12} /> {formatMomentDate(moment.at)}
      </p>
      <button type="button" className="ex-icon-btn" onClick={onClose} aria-label="Close moment">
        <Icon name="close" size={14} />
      </button>
    </header>
    <h2 className="ex-serif">{moment.title}</h2>
    <p>{moment.story}</p>
    <p className="ex-moment__note">
      <span className="sv-mark sv-mark--measured">Measured positions</span> {moment.note}
    </p>
    {moment.lensDeg ? (
      <div className="ex-lens" role="group" aria-label="Lens">
        <button type="button" className={lensDeg < 49 ? "is-on" : ""} onClick={onTelescope} aria-pressed={lensDeg < 49}>
          Telescope view · {moment.lensDeg}°
        </button>
        <button type="button" className={lensDeg >= 49 ? "is-on" : ""} onClick={onNormalLens} aria-pressed={lensDeg >= 49}>
          Normal lens · 50°
        </button>
      </div>
    ) : null}
    <div className="ex-moment__actions">
      <button type="button" className="ex-btn" onClick={onImages}>
        <Icon name="images" size={14} /> Photographs
      </button>
      <button type="button" className="ex-btn" onClick={onNow}>
        <Icon name="now" size={14} /> Back to today
      </button>
    </div>
  </aside>
);

// ---------------------------------------------------------------------------------------------
// Share

export const ShareMenu: FC<{
  onCopyLink: () => void;
  onPostcard: () => void;
  onSystemShare?: () => void;
  onClose: () => void;
}> = ({ onCopyLink, onPostcard, onSystemShare, onClose }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const away = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const key = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("pointerdown", away);
    window.addEventListener("keydown", key);
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      window.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", key);
    };
  }, [onClose]);
  return (
    <div className="ex-popover ex-share" role="menu" aria-label="Share this view" ref={ref}>
      <button type="button" role="menuitem" onClick={onCopyLink}>
        <Icon name="copy" size={16} />
        <span>
          <strong>Copy link to this view</strong>
          <small>Same object, moment and camera angle</small>
        </span>
      </button>
      <button type="button" role="menuitem" onClick={onPostcard}>
        <Icon name="camera" size={16} />
        <span>
          <strong>Download postcard</strong>
          <small>A PNG of this view with its caption and link</small>
        </span>
      </button>
      {onSystemShare ? (
        <button type="button" role="menuitem" onClick={onSystemShare}>
          <Icon name="share" size={16} />
          <span>
            <strong>Share…</strong>
            <small>Messages, Mail, AirDrop</small>
          </span>
        </button>
      ) : null}
    </div>
  );
};

// ---------------------------------------------------------------------------------------------
// Postcard composition

export const composePostcard = (
  shot: HTMLCanvasElement,
  options: { title: string; subtitle: string; url: string; labelsRoot: HTMLElement | null; canvasRect: DOMRect | null },
) => {
  const scale = shot.width / Math.max(1, options.canvasRect?.width ?? shot.width);
  const footer = Math.round(92 * scale);
  const out = document.createElement("canvas");
  out.width = shot.width;
  out.height = shot.height + footer;
  const ctx = out.getContext("2d");
  if (!ctx) return out;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(shot, 0, 0);
  // Labels are DOM over the canvas: draw the visible ones where they sit.
  if (options.labelsRoot && options.canvasRect) {
    const rect = options.canvasRect;
    ctx.font = `${Math.round(12 * scale)}px -apple-system, "SF Pro Text", system-ui, sans-serif`;
    ctx.textBaseline = "middle";
    options.labelsRoot.querySelectorAll<HTMLElement>(".ex-label").forEach((label) => {
      const style = window.getComputedStyle(label);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) < 0.2) return;
      const box = label.getBoundingClientRect();
      if (box.width === 0 || box.right < rect.left || box.left > rect.right || box.bottom < rect.top || box.top > rect.bottom) return;
      const text = label.textContent?.trim();
      if (!text) return;
      const x = (box.left - rect.left + 6) * scale;
      const y = (box.top - rect.top + box.height / 2) * scale;
      ctx.shadowColor = "rgba(0,0,0,0.9)";
      ctx.shadowBlur = 6 * scale;
      ctx.fillStyle = label.classList.contains("is-selected") ? "#a6e3ff" : "rgba(244,242,238,0.82)";
      ctx.fillText(text, x, y);
    });
    ctx.shadowBlur = 0;
  }
  const pad = Math.round(28 * scale);
  const top = shot.height;
  ctx.fillStyle = "#050506";
  ctx.fillRect(0, top, out.width, footer);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(0, top, out.width, Math.max(1, Math.round(scale)));
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#f4f2ee";
  ctx.font = `500 ${Math.round(26 * scale)}px "New York", ui-serif, Georgia, serif`;
  ctx.fillText(options.title, pad, top + Math.round(42 * scale));
  ctx.fillStyle = "rgba(244,242,238,0.6)";
  ctx.font = `${Math.round(13.5 * scale)}px -apple-system, "SF Pro Text", system-ui, sans-serif`;
  ctx.fillText(options.subtitle, pad, top + Math.round(68 * scale));
  ctx.textAlign = "right";
  ctx.fillStyle = "#ffb867";
  ctx.font = `600 ${Math.round(14 * scale)}px -apple-system, "SF Pro Display", system-ui, sans-serif`;
  ctx.fillText("SpaceViewer", out.width - pad, top + Math.round(42 * scale));
  ctx.fillStyle = "rgba(244,242,238,0.5)";
  ctx.font = `${Math.round(11.5 * scale)}px -apple-system, "SF Pro Text", system-ui, sans-serif`;
  const shortUrl = options.url.replace(/^https?:\/\//, "");
  ctx.fillText(shortUrl.length > 72 ? `${shortUrl.slice(0, 70)}…` : shortUrl, out.width - pad, top + Math.round(68 * scale));
  ctx.textAlign = "left";
  return out;
};

export const thumbnailFrom = (shot: HTMLCanvasElement, width = 360) => {
  const ratio = shot.height / Math.max(1, shot.width);
  const out = document.createElement("canvas");
  out.width = width;
  out.height = Math.round(width * Math.min(ratio, 0.75));
  const ctx = out.getContext("2d");
  if (!ctx) return undefined;
  const sh = shot.width * (out.height / out.width);
  ctx.drawImage(shot, 0, (shot.height - sh) / 2, shot.width, sh, 0, 0, out.width, out.height);
  try {
    return out.toDataURL("image/jpeg", 0.72);
  } catch {
    return undefined;
  }
};

// ---------------------------------------------------------------------------------------------
// Watch live: the Sun and Earth have cameras on them right now.

export const WatchLive: FC<{ entityId: string; onOpen: (feedId: string) => void }> = ({ entityId, onOpen }) => {
  const feeds = liveFeedsForPlace(entityId).slice(0, 3);
  if (!feeds.length) return null;
  return (
    <section className="ex-watchlive" aria-label="Watch live">
      <h3>
        <span className="im-live__dot" aria-hidden="true" /> Watch live
      </h3>
      <ul>
        {feeds.map((feed) => (
          <li key={feed.id}>
            <button type="button" onClick={() => onOpen(feed.id)}>
              {feed.poster ? <img src={feed.poster} alt="" loading="lazy" /> : null}
              <span>
                <strong>{feed.title}</strong>
                <small>{feed.kind === "stream" ? `Live · ${feed.source}` : `${feed.source}`}</small>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};
