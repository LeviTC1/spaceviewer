// The "Tonight" card shown while standing on the Earth: where you are, when it gets dark, the Moon,
// the planets and the best deep-sky sights, each one a tap away from turning the view towards it.

import { type FC, useMemo, useState } from "react";
import timezonePlaces from "../../generated/timezonePlaces.json";
import { Icon } from "../../shell/Icon";
import { describeAltAz, twilightPhase } from "./engine/observer";
import type { UniverseIndex } from "./engine/universeModel";
import type { SkyCulture } from "./skyCulture";
import {
  constellationsOverhead,
  formatLatLon,
  moonSummary,
  nightTimes,
  type ObserverPlace,
  requestDevicePlace,
  type SkyHighlight,
  stationPasses,
  whatsUp,
} from "./tonight";
import { compassPoint } from "./engine/observer";

const ZONES = (timezonePlaces as unknown as { places: Record<string, [string, string, number, number]> }).places;
const CITY_OPTIONS = Object.values(ZONES)
  .map(([city, country, lat, lon]) => ({ label: `${city}, ${country}`, lat, lon, city }))
  .sort((a, b) => a.label.localeCompare(b.label));

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" });
const at = (ms: number | null) => (ms === null ? "—" : timeFormat.format(ms));

const PHASE_TEXT = {
  day: "Daytime",
  civil: "Civil twilight",
  nautical: "Nautical twilight",
  astronomical: "Astronomical twilight",
  night: "Dark sky",
} as const;

export const TonightPanel: FC<{
  index: UniverseIndex;
  culture: SkyCulture | null;
  place: ObserverPlace;
  simTimeMs: number;
  sunAltitudeDeg: number;
  onPlace: (place: ObserverPlace) => void;
  onLook: (id: string) => void;
  onTime: (ms: number, rate?: number) => void;
  onLeave: () => void;
  onClose: () => void;
}> = ({ index, culture, place, simTimeMs, sunAltitudeDeg, onPlace, onLook, onTime, onLeave, onClose }) => {
  const [editing, setEditing] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // Recompute at most every ten simulated minutes: the list does not need to follow every frame.
  const bucket = Math.floor(simTimeMs / 600_000) * 600_000;
  const night = useMemo(() => nightTimes(index, place, bucket), [bucket, index, place]);
  const highlights = useMemo(() => whatsUp(index, place, night, bucket), [bucket, index, night, place]);
  const moon = useMemo(() => moonSummary(index, bucket), [bucket, index]);
  const overhead = useMemo(() => (culture ? constellationsOverhead(culture, place, bucket) : []), [bucket, culture, place]);
  const phase = twilightPhase(sunAltitudeDeg);
  // Recomputed with the night (and when the station orbits arrive), not every ten minutes.
  const passes = useMemo(() => stationPasses(index, place, night), [index, night, place]);

  const planets = highlights.filter((item) => item.kind === "planet");
  const deep = highlights
    .filter((item) => item.kind === "deep-sky")
    .sort((a, b) => b.bestAltDeg - a.bestAltDeg)
    .slice(0, 6);
  const moonItem = highlights.find((item) => item.kind === "moon");

  const useDevice = async () => {
    setLocating(true);
    setError(null);
    try {
      onPlace(await requestDevicePlace());
      setEditing(false);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setLocating(false);
    }
  };

  const matches = query.trim().length >= 2 ? CITY_OPTIONS.filter((option) => option.label.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 6) : [];

  const row = (item: SkyHighlight) => {
    const up = item.altDeg > 0;
    const when = up ? `Now ${describeAltAz(item.altDeg, item.azDeg)}` : item.riseMs ? `Rises ${at(item.riseMs)}` : `Best ${at(item.bestMs)}`;
    return (
      <li key={item.id}>
        <button type="button" className={`ex-tonight__item${up ? "" : " is-down"}`} onClick={() => onLook(item.id)}>
          <span className="ex-tonight__name">{item.name}</span>
          <span className="ex-tonight__detail">{item.detail}</span>
          <span className="ex-tonight__when">
            {when}
            {item.kind !== "moon" ? ` · highest ${at(item.bestMs)} (${Math.round(item.bestAltDeg)}°)` : item.setMs ? ` · sets ${at(item.setMs)}` : ""}
          </span>
        </button>
      </li>
    );
  };

  return (
    <aside className="ex-panel ex-tonight" aria-label="Tonight's sky">
      <header className="ex-panel__head ex-panel__head--plain">
        <div>
          <p className="ex-eyebrow">Tonight's sky · {dayFormat.format(simTimeMs)}</p>
          <h2 className="ex-serif">{place.name}</h2>
          <p>
            {formatLatLon(place)}
            {place.source === "timezone" ? " · from your time zone" : place.source === "device" ? " · from this device" : ""}
          </p>
        </div>
        <button type="button" className="ex-icon-btn" onClick={onClose} aria-label="Hide tonight's sky card">
          <Icon name="close" size={16} />
        </button>
      </header>

      {editing ? (
        <div className="ex-tonight__place">
          <button type="button" className="sv-btn sv-btn--small" onClick={useDevice} disabled={locating}>
            <Icon name="compass" size={14} /> {locating ? "Finding you…" : "Use my location"}
          </button>
          <label className="ex-tonight__search">
            <span>Or pick a city</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Sydney, Nairobi, Reykjavík…" autoFocus />
          </label>
          {matches.length ? (
            <ul className="ex-tonight__matches">
              {matches.map((option) => (
                <li key={option.label}>
                  <button
                    type="button"
                    onClick={() => {
                      onPlace({ name: option.city, latDeg: option.lat, lonDeg: option.lon, source: "manual" });
                      setEditing(false);
                      setQuery("");
                    }}
                  >
                    {option.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {error ? <p className="ex-tonight__error">{error}</p> : null}
          <p className="ex-tonight__privacy">Your location stays on this device. It is only used to work out your horizon.</p>
        </div>
      ) : (
        <button type="button" className="ex-tonight__change" onClick={() => setEditing(true)}>
          <Icon name="compass" size={14} /> Change place
        </button>
      )}

      <section className="ex-tonight__sun" aria-label="Sun and darkness">
        <p className="ex-tonight__phase">
          <strong>{PHASE_TEXT[phase]}</strong> · Sun {sunAltitudeDeg >= 0 ? `${Math.round(sunAltitudeDeg)}° up` : `${Math.round(-sunAltitudeDeg)}° below the horizon`}
        </p>
        {night.note ? <p className="ex-tonight__note">{night.note}</p> : null}
        <dl>
          <div>
            <dt>Sunset</dt>
            <dd>{at(night.sunset)}</dd>
          </div>
          <div>
            <dt>Sunrise</dt>
            <dd>{at(night.sunrise)}</dd>
          </div>
          <div className="is-wide">
            <dt>Properly dark</dt>
            <dd>{night.darkFrom ? `${at(night.darkFrom)} – ${at(night.darkUntil)}` : "Not tonight"}</dd>
          </div>
        </dl>
        <div className="ex-tonight__times">
          <button type="button" className="sv-btn sv-btn--small" onClick={() => onTime(Date.now(), 1)}>
            Now
          </button>
          <button type="button" className="sv-btn sv-btn--small" onClick={() => onTime(night.bestLookMs, 1)} disabled={!night.sunset && !night.darkFrom}>
            Tonight, once dark
          </button>
          <button type="button" className="sv-btn sv-btn--small" onClick={() => onTime(night.sunset ?? simTimeMs, 900)} title="Fifteen minutes a second, from sunset">
            <Icon name="play" size={11} /> Watch the night
          </button>
        </div>
      </section>

      {moonItem && moon ? (
        <section aria-label="The Moon">
          <p className="ex-eyebrow">The Moon</p>
          <ul className="ex-tonight__list">{row(moonItem)}</ul>
        </section>
      ) : null}

      <section aria-label="Space station passes">
        <p className="ex-eyebrow">Space stations overhead</p>
        {passes.length ? (
          <ul className="ex-tonight__list">
            {passes.map((pass) => (
              <li key={`${pass.id}-${pass.startMs}`}>
                <button
                  type="button"
                  className="ex-tonight__item"
                  onClick={() => {
                    onTime(pass.startMs - 30_000, 1);
                    onLook(pass.id);
                  }}
                >
                  <span className="ex-tonight__name">{pass.name.replace(" space station", "")}</span>
                  <span className="ex-tonight__detail">{Math.round((pass.endMs - pass.startMs) / 60_000)} min</span>
                  <span className="ex-tonight__when">
                    {at(pass.startMs)} from the {compassPoint(pass.startAzDeg)}, up to {Math.round(pass.peakAltDeg)}°, {pass.fadesIntoShadow ? "fading into Earth's shadow" : "setting"} in the {compassPoint(pass.endAzDeg)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ex-tonight__note">No visible passes of the ISS or Tiangong tonight. They only show while sunlit against a dark sky, usually in the hours after dusk or before dawn.</p>
        )}
      </section>

      <section aria-label="Planets">
        <p className="ex-eyebrow">Planets tonight</p>
        {planets.length ? <ul className="ex-tonight__list">{planets.map(row)}</ul> : <p className="ex-tonight__note">No bright planets are up while it is dark.</p>}
      </section>

      {deep.length ? (
        <section aria-label="Deep sky">
          <p className="ex-eyebrow">Worth finding</p>
          <ul className="ex-tonight__list">{deep.map(row)}</ul>
        </section>
      ) : null}

      {overhead.length ? (
        <section aria-label="Constellations">
          <p className="ex-eyebrow">High in the sky now</p>
          <p className="ex-tonight__chips">
            {overhead.map((item) => (
              <span key={item.name}>{item.name}</span>
            ))}
          </p>
        </section>
      ) : null}

      <p className="ex-tonight__foot">
        Times are in your device's time zone. Positions use the same ephemeris and star catalogues as the 3-D view; refraction (about half a degree at the horizon) is not included.
      </p>
      <button type="button" className="sv-btn sv-btn--small ex-tonight__leave" onClick={onLeave}>
        <Icon name="universe" size={14} /> Leave the ground
      </button>
    </aside>
  );
};
