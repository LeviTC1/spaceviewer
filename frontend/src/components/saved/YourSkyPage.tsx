// Your sky: everything SpaceViewer keeps for you on this device, in one place.
// Saved views of the universe, saved photographs, Solar Explorer bookmarks, notes, recent places and
// searches, and suggestions drawn from what you look at. Previously these were split across the For You,
// Gallery and Solar tabs, the command palette and the Solar Explorer bookmark dock.

import { useEffect, useMemo, useState, type FC } from "react";
import type { SpaceImage } from "../../models/SpaceImage";
import type { DiscoverySession } from "../../models/DiscoverySession";
import type { ObservationCollection } from "../../models/ObservationCollection";
import { readCameraBookmarks, type CameraBookmark } from "../../features/solar/cameraBookmarks";
import { readWorkingCollection, removeFromWorkingCollection, writeWorkingCollection } from "../../utils/observationCollection";
import { getSessionMemory, getTopItems, readRecentPlaces, type RecentImage, type RecentPlace } from "../../utils/sessionMemory";
import { Icon } from "../../shell/Icon";
import { formatMomentDate, MOMENTS, momentHref } from "../../shell/moments";
import { readSavedViews, removeSavedView, SAVED_VIEWS_EVENT, type SavedView } from "../../shell/savedViews";

interface YourSkyPageProps {
  onOpenHref: (href: string) => void;
  onOpenCollection: (items: SpaceImage[], selected?: SpaceImage) => void;
  onOpenRecentImage: (item: RecentImage) => void;
  onOpenSolarBookmark: (bookmark: CameraBookmark) => void;
  onSearch: (query: string) => void;
  onContinueDiscovery: () => void;
  discoverySession: DiscoverySession | null;
}

const NOTE_PREFIX = "spaceviewer.annotations.";
const ATLAS_NOTES_KEY = "spaceviewer.skymap.annotations.v1";

const countNotes = () => {
  let photos = 0;
  let atlas = 0;
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      if (key.startsWith(NOTE_PREFIX)) {
        const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]") as unknown;
        if (Array.isArray(parsed) && parsed.length) photos += 1;
      }
    }
    const parsed = JSON.parse(window.localStorage.getItem(ATLAS_NOTES_KEY) ?? "[]") as unknown;
    atlas = Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    // ignore
  }
  return { photos, atlas };
};

const relative = (ms: number) => {
  const diff = Date.now() - ms;
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return new Date(ms).toLocaleDateString();
};

const momentLabel = (timeMs: number) => {
  const diff = Math.abs(timeMs - Date.now());
  if (diff < 36 * 3_600_000) return "Live";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(timeMs));
};

const YourSkyPage: FC<YourSkyPageProps> = ({ onOpenHref, onOpenCollection, onOpenRecentImage, onOpenSolarBookmark, onSearch, onContinueDiscovery, discoverySession }) => {
  const [views, setViews] = useState<SavedView[]>(() => readSavedViews());
  const [collection, setCollection] = useState<ObservationCollection>(() => readWorkingCollection());
  const [bookmarks] = useState<CameraBookmark[]>(() => readCameraBookmarks());
  const [places] = useState<RecentPlace[]>(() => readRecentPlaces());
  const [notes] = useState(countNotes);
  const memory = useMemo(() => getSessionMemory(), []);
  const recentSearches = getTopItems(memory.searches, 8);
  const viewed = memory.viewedImages;

  useEffect(() => {
    const sync = () => {
      setViews(readSavedViews());
      setCollection(readWorkingCollection());
    };
    window.addEventListener(SAVED_VIEWS_EVENT, sync);
    window.addEventListener("spaceviewer:collection-updated", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(SAVED_VIEWS_EVENT, sync);
      window.removeEventListener("spaceviewer:collection-updated", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const savedImages = collection.items.map((item) => item.image);
  const suggestions = useMemo(() => {
    const out: Array<{ label: string; query: string; reason: string }> = [];
    const types = getTopItems(memory.savedTypes, 2).filter((item) => item !== "Unknown");
    const cats = getTopItems(memory.viewedCategories, 2);
    viewed.slice(0, 2).forEach((image) => {
      const text = [image.title, ...(image.keywords ?? [])].join(" ").toLowerCase();
      const query = /nebula|pillars|cliffs/.test(text)
        ? "star forming nebula"
        : /galaxy|andromeda|spiral/.test(text)
          ? "galaxy"
          : /jupiter|saturn|mars|planet|moon/.test(text)
            ? "planetary science"
            : image.mission || image.title.split(/\s+/).slice(0, 3).join(" ");
      out.push({ label: query, query, reason: `Because you looked at ${image.title.length > 40 ? `${image.title.slice(0, 38)}…` : image.title}` });
    });
    cats.forEach((cat) => out.push({ label: cat, query: cat, reason: "One of your most-viewed sources" }));
    types.forEach((type) => out.push({ label: type, query: type, reason: "A kind of object you save" }));
    return out.filter((item, index, list) => list.findIndex((other) => other.query.toLowerCase() === item.query.toLowerCase()) === index).slice(0, 6);
  }, [memory, viewed]);

  const isEmpty = !views.length && !savedImages.length && !bookmarks.length && !places.length && !viewed.length && !recentSearches.length;

  return (
    <div className="ys-page">
      <header className="ys-head">
        <p className="sv-eyebrow">Your sky</p>
        <h1 className="sv-serif">Everything you've kept</h1>
        <p>Views, photographs, bookmarks and notes are stored in this browser only. Nothing leaves your device.</p>
      </header>

      {isEmpty ? (
        <section className="ys-empty">
          <h2 className="sv-serif">Nothing here yet</h2>
          <p>
            In the universe, press <Icon name="star" size={14} /> <strong>Save view</strong> to keep an exact moment and camera angle. On a
            photograph, press <strong>Save</strong>. Both appear here.
          </p>
          <div className="ys-empty__actions">
            <button type="button" className="sv-btn sv-btn--primary" onClick={() => onOpenHref("/")}>
              <Icon name="universe" size={16} /> Open the universe
            </button>
            <button type="button" className="sv-btn" onClick={() => onOpenHref("/images")}>
              <Icon name="images" size={16} /> Browse photographs
            </button>
          </div>
        </section>
      ) : null}

      {views.length ? (
        <section className="ys-section" aria-labelledby="ys-views">
          <header>
            <h2 id="ys-views" className="sv-serif">Saved views</h2>
            <p>The exact object, moment and camera angle. Open one to return there.</p>
          </header>
          <ul className="ys-views">
            {views.map((view) => (
              <li key={view.id}>
                <button type="button" className="ys-view" onClick={() => onOpenHref(view.href)}>
                  {view.thumb ? <img src={view.thumb} alt="" /> : <span className="ys-view__blank"><Icon name="universe" size={28} /></span>}
                  <span className="ys-view__text">
                    <strong>{view.name}</strong>
                    <small>
                      {view.category} · {momentLabel(view.timeMs)}
                    </small>
                  </span>
                </button>
                <button type="button" className="sv-icon-btn ys-remove" onClick={() => removeSavedView(view.id)} aria-label={`Remove saved view of ${view.name}`}>
                  <Icon name="close" size={14} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {savedImages.length ? (
        <section className="ys-section" aria-labelledby="ys-photos">
          <header>
            <h2 id="ys-photos" className="sv-serif">Saved photographs</h2>
            <p>
              {savedImages.length} saved.{" "}
              <button type="button" className="ys-link" onClick={() => onOpenCollection(savedImages)}>
                Open as a gallery to filter and compare
              </button>
            </p>
          </header>
          <ul className="ys-photos">
            {collection.items.map((item) => (
              <li key={item.key}>
                <button type="button" onClick={() => onOpenCollection(savedImages, item.image)}>
                  <img src={item.image.thumbnailUrl || item.image.imageUrl} alt={item.image.title} loading="lazy" />
                  <span>{item.image.title}</span>
                </button>
                <button
                  type="button"
                  className="sv-icon-btn ys-remove"
                  aria-label={`Remove ${item.image.title} from saved`}
                  onClick={() => {
                    const next = removeFromWorkingCollection(readWorkingCollection(), item.key);
                    writeWorkingCollection(next);
                    setCollection(next);
                  }}
                >
                  <Icon name="close" size={14} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="ys-columns">
        {places.length ? (
          <section className="ys-section" aria-labelledby="ys-places">
            <header>
              <h2 id="ys-places" className="sv-serif">Places you've visited</h2>
            </header>
            <ul className="ys-list">
              {places.map((place) => (
                <li key={place.id}>
                  <button type="button" onClick={() => onOpenHref(place.href)}>
                    <Icon name="universe" size={16} />
                    <span>
                      <strong>{place.name}</strong>
                      <small>{place.category}</small>
                    </span>
                    <em>{relative(place.at)}</em>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {bookmarks.length ? (
          <section className="ys-section" aria-labelledby="ys-bookmarks">
            <header>
              <h2 id="ys-bookmarks" className="sv-serif">Solar Explorer bookmarks</h2>
            </header>
            <ul className="ys-list">
              {bookmarks.map((bookmark) => (
                <li key={bookmark.id}>
                  <button type="button" onClick={() => onOpenSolarBookmark(bookmark)}>
                    <Icon name="tools" size={16} />
                    <span>
                      <strong>{bookmark.name}</strong>
                      <small>{[bookmark.dateKey, bookmark.scaleMode].filter(Boolean).join(" · ") || "Saved camera"}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {viewed.length || recentSearches.length ? (
          <section className="ys-section" aria-labelledby="ys-recent">
            <header>
              <h2 id="ys-recent" className="sv-serif">Recently looked at</h2>
            </header>
            <ul className="ys-list">
              {viewed.slice(0, 6).map((item) => (
                <li key={`${item.source ?? "nasa"}:${item.nasaId ?? item.id}`}>
                  <button type="button" onClick={() => onOpenRecentImage(item)}>
                    <img src={item.thumbnailUrl || item.imageUrl} alt="" loading="lazy" />
                    <span>
                      <strong>{item.title}</strong>
                      <small>{[item.mission || item.center, item.date?.slice(0, 4)].filter(Boolean).join(" · ")}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {recentSearches.length ? (
              <div className="ys-chips">
                {recentSearches.map((search) => (
                  <button key={search} type="button" className="sv-chip" onClick={() => onSearch(search)}>
                    <Icon name="search" size={13} /> {search}
                  </button>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="ys-section" aria-labelledby="ys-next">
          <header>
            <h2 id="ys-next" className="sv-serif">Next for you</h2>
          </header>
          <ul className="ys-list">
            {discoverySession ? (
              <li>
                <button type="button" onClick={onContinueDiscovery}>
                  <Icon name="sparkle" size={16} />
                  <span>
                    <strong>Continue “{discoverySession.name}”</strong>
                    <small>{discoverySession.resultCount} photographs · {discoverySession.batchCount} batches</small>
                  </span>
                </button>
              </li>
            ) : null}
            {suggestions.map((item) => (
              <li key={item.query}>
                <button type="button" onClick={() => onSearch(item.query)}>
                  <Icon name="images" size={16} />
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.reason}</small>
                  </span>
                </button>
              </li>
            ))}
            {MOMENTS.slice(0, suggestions.length ? 2 : 4).map((moment) => (
              <li key={moment.id}>
                <button type="button" onClick={() => onOpenHref(momentHref(moment))}>
                  <Icon name="clock" size={16} />
                  <span>
                    <strong>{moment.title}</strong>
                    <small>Replay · {formatMomentDate(moment.at)}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {notes.photos || notes.atlas ? (
            <p className="ys-notes">
              <Icon name="note" size={14} /> You have notes on {notes.photos} photograph{notes.photos === 1 ? "" : "s"}
              {notes.atlas ? ` and ${notes.atlas} Sky Atlas annotation${notes.atlas === 1 ? "" : "s"}` : ""}. They reopen with the photograph or in Sky Atlas.
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
};

export default YourSkyPage;
