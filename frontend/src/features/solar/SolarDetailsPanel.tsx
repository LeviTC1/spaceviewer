import { FC } from "react";
import type { MoonDef } from "./moonData";
import { MOONS } from "./moonData";
import { PLANETS, type PlanetDef, type PlanetId, type SolarScaleMode } from "./solarData";
import { PLANET_TEXTURES } from "./textures/textureCatalog";
import { SOLAR_AU_KM, getSolarObjectState } from "../../domain/solar";

interface SolarDetailsPanelProps {
  planet: PlanetDef | null;
  moon: MoonDef | null;
  sunSelected: boolean;
  asteroidBeltSelected: boolean;
  collapsed: boolean;
  currentDate: Date;
  timeDays: number;
  scaleMode: SolarScaleMode;
  isTracking: boolean;
  isMoonTracking: boolean;
  moonToggleEnabled: boolean;
  onToggleMoonsForPlanet: () => void;
  onToggleCollapse: () => void;
  onFocus: () => void;
  onSelectPlanet: (planetId: PlanetId) => void;
  onSelectMoon: (moonId: string) => void;
  onShowAsteroidBelt: () => void;
  onToggleTrack: () => void;
  onFocusMoon: () => void;
  onToggleMoonTrack: () => void;
  onExplore: () => void;
  onExploreSun: () => void;
  onFocusSun: () => void;
}

const SolarDetailsPanel: FC<SolarDetailsPanelProps> = ({
  planet,
  moon,
  sunSelected,
  asteroidBeltSelected,
  collapsed,
  currentDate,
  timeDays,
  scaleMode,
  isTracking,
  isMoonTracking,
  moonToggleEnabled,
  onToggleMoonsForPlanet,
  onToggleCollapse,
  onFocus,
  onSelectPlanet,
  onSelectMoon,
  onShowAsteroidBelt,
  onToggleTrack,
  onFocusMoon,
  onToggleMoonTrack,
  onExplore,
  onExploreSun,
  onFocusSun,
}) => {
  const formatDate = (date: Date) =>
    new Intl.DateTimeFormat(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(date);
  const formatKm = (value: number) => `${Math.round(value).toLocaleString()} km`;
  const formatDays = (value: number) =>
    value >= 365 ? `${(value / 365.25).toFixed(2)} years` : `${value.toLocaleString()} days`;
  const formatHours = (value?: number) => {
    if (!value) return "Not available";
    return value >= 48 ? `${(value / 24).toFixed(1)} days` : `${value.toFixed(1)} hours`;
  };
  const parentPlanet = moon ? PLANETS.find((item) => item.id === moon.parentPlanet) ?? null : null;
  const planetMoons = planet ? MOONS.filter((item) => item.parentPlanet === planet.id && item.class === "major") : [];
  const planetState = planet ? getSolarObjectState(planet.id, timeDays) : null;
  const moonState = moon ? getSolarObjectState(moon.id, timeDays) : null;
  const planetDistanceAu = planetState?.orbital?.radiusAu ?? planet?.semiMajorAxisAU ?? null;
  const moonDistanceKm = moonState?.relativePositionAu
    ? Math.hypot(moonState.relativePositionAu.x, moonState.relativePositionAu.y, moonState.relativePositionAu.z) * SOLAR_AU_KM
    : moon?.orbitalDistanceKm ?? null;
  const planetPhase = planetState?.orbital
    ? `${Math.round((planetState.orbital.trueAnomalyRad / (Math.PI * 2)) * 100)}% around orbit`
    : "Approximate phase unavailable";
  const moonPhase = moon
    ? `${Math.round((((timeDays / moon.orbitalPeriodDays) % 1 + 1) % 1) * 100)}% around parent`
    : null;
  const moonImage = moon
    ? moon.textureKey?.startsWith("/")
      ? moon.textureKey
      : `/solar-textures/perf/${moon.textureKey ?? "moon_1024.jpg"}`
    : null;
  const planetImage = planet ? PLANET_TEXTURES[planet.id]?.performance.diffuse : null;
  const sunImage = "/solar-textures/perf/2k_sun.jpg";

  if (collapsed) {
    return (
      <aside className="solar-panel solar-panel--collapsed">
        <button type="button" className="ghost button--small" onClick={onToggleCollapse}>
          Open details
        </button>
      </aside>
    );
  }

  return (
    <aside className={`solar-panel solar-panel--details ${sunSelected ? "solar-panel--sun" : ""}`}>
      <div className="solar-panel__header">
        <div>
          <p className="eyebrow">
            {moon ? "MOON" : sunSelected ? "STAR" : asteroidBeltSelected ? "BELT" : planet ? "PLANET" : "ATLAS"}
          </p>
          <h3>
            {moon
              ? moon.name
              : sunSelected
                ? "Sun"
                : asteroidBeltSelected
                  ? "Asteroid Belt"
                  : planet
                    ? planet.name
                    : "Select a solar object"}
          </h3>
        </div>
        <button type="button" className="ghost button--small" onClick={onToggleCollapse}>
          Collapse
        </button>
      </div>

      {sunSelected ? (
        <>
          <div className="solar-panel__media solar-panel__media--sun">
            <img src={sunImage} alt="Sun texture" loading="lazy" />
          </div>
          <div className="solar-panel__section">
            <p className="eyebrow">Identity</p>
            <dl className="solar-panel__stats">
              <div>
                <dt>Object type</dt>
                <dd>G2V main-sequence star</dd>
              </div>
              <div>
                <dt>Role</dt>
                <dd>Heliocentric reference body</dd>
              </div>
            </dl>
          </div>
          <div className="solar-panel__section">
            <p className="eyebrow">Physical</p>
            <dl className="solar-panel__stats">
            <div>
              <dt>Radius</dt>
              <dd>696,340 km</dd>
            </div>
            <div>
              <dt>Diameter</dt>
              <dd>1,392,680 km</dd>
            </div>
            <div>
              <dt>Surface temp</dt>
              <dd>~5,500°C</dd>
            </div>
          </dl>
          </div>
          <div className="solar-panel__section">
            <p className="eyebrow">Current simulation</p>
            <p className="solar-panel__note">
              {formatDate(currentDate)} · Sun fixed at the shared heliocentric origin for this approximate model.
            </p>
          </div>
          <div className="solar-panel__facts">
            <p className="eyebrow">Facts</p>
            <ul>
              <li>Contains about 99.8% of the solar system’s mass.</li>
              <li>Its light takes ~8 minutes to reach Earth.</li>
              <li>Rotates faster at the equator than the poles.</li>
            </ul>
          </div>
          <div className="solar-panel__actions">
            <button type="button" onClick={onExploreSun}>
              Open imagery
            </button>
            <button type="button" className="ghost" onClick={onFocusSun}>
              Focus
            </button>
          </div>
        </>
      ) : moon ? (
        <>
          {moonImage && (
            <div className="solar-panel__media">
              <img src={moonImage} alt={`${moon.name} texture`} loading="lazy" />
            </div>
          )}
          <div className="solar-panel__section">
            <p className="eyebrow">Identity</p>
            <dl className="solar-panel__stats">
              <div>
                <dt>Object type</dt>
                <dd>{moon.class === "major" ? "Major moon" : "Minor moon"}</dd>
              </div>
              <div>
                <dt>Parent</dt>
                <dd>{parentPlanet?.name ?? moon.parentPlanet}</dd>
              </div>
            </dl>
          </div>
          <div className="solar-panel__section">
            <p className="eyebrow">Physical and orbit</p>
            <dl className="solar-panel__stats">
              <div>
                <dt>Current parent distance</dt>
                <dd>{moonDistanceKm ? formatKm(moonDistanceKm) : "Not available"}</dd>
              </div>
              <div>
                <dt>Orbital period</dt>
                <dd>{formatDays(moon.orbitalPeriodDays)}</dd>
              </div>
              <div>
                <dt>Radius</dt>
                <dd>{formatKm(moon.radiusKm)}</dd>
              </div>
              <div>
                <dt>Inclination</dt>
                <dd>{moon.inclinationDeg ?? 0}°</dd>
              </div>
            </dl>
          </div>
          <div className="solar-panel__section">
            <p className="eyebrow">Current simulation</p>
            <p className="solar-panel__note">
              {formatDate(currentDate)} · {moonPhase}. Parent-relative circular approximation.
            </p>
          </div>
          {parentPlanet && (
            <div className="solar-panel__section">
              <p className="eyebrow">Relationship</p>
              <button type="button" className="solar-related-button" onClick={() => onSelectPlanet(parentPlanet.id)}>
                Jump to {parentPlanet.name}
              </button>
            </div>
          )}
          {moon.facts?.length ? (
            <div className="solar-panel__facts">
              <p className="eyebrow">Facts</p>
              <ul>
                {moon.facts.map((fact) => (
                  <li key={fact}>{fact}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="solar-panel__actions">
            <button type="button" className="ghost" onClick={onFocusMoon}>
              Focus
            </button>
            <button
              type="button"
              className={`ghost ${isMoonTracking ? "active" : ""}`}
              onClick={onToggleMoonTrack}
            >
              {isMoonTracking ? "Tracking" : "Track"}
            </button>
          </div>
        </>
      ) : planet ? (
        <>
          {planetImage && (
            <div className="solar-panel__media">
              <img src={planetImage} alt={`${planet.name} texture`} loading="lazy" />
            </div>
          )}
          <div className="solar-panel__section">
            <p className="eyebrow">Identity</p>
            <dl className="solar-panel__stats">
              <div>
                <dt>Object type</dt>
                <dd>{planet.id === "pluto" ? "Dwarf planet" : "Planet"}</dd>
              </div>
              <div>
                <dt>Moons shown</dt>
                <dd>{planetMoons.length ? `${planetMoons.length} major` : "None in current seed data"}</dd>
              </div>
            </dl>
          </div>
          <div className="solar-panel__section">
            <p className="eyebrow">Physical and orbit</p>
            <dl className="solar-panel__stats">
              <div>
                <dt>Current Sun distance</dt>
                <dd>{planetDistanceAu ? `${planetDistanceAu.toFixed(3)} AU` : "Not available"}</dd>
              </div>
              <div>
                <dt>Orbital period</dt>
                <dd>{formatDays(planet.orbitalPeriodDays)}</dd>
              </div>
              <div>
                <dt>Radius</dt>
                <dd>{formatKm(planet.radiusKm)}</dd>
              </div>
              <div>
                <dt>Rotation</dt>
                <dd>{formatHours(planet.rotationPeriodHours)}</dd>
              </div>
              <div>
                <dt>Axial tilt</dt>
                <dd>{planet.axialTiltDeg ?? planet.tiltDeg ?? 0}°</dd>
              </div>
              <div>
                <dt>Eccentricity</dt>
                <dd>{planet.eccentricity?.toFixed(4) ?? "Not available"}</dd>
              </div>
            </dl>
          </div>
          <div className="solar-panel__section">
            <p className="eyebrow">Current simulation</p>
            <p className="solar-panel__note">
              {formatDate(currentDate)} · {planetPhase}.{" "}
              {planetState?.accuracyNote ?? "Low-precision solar provider model."}
            </p>
          </div>
          {planetMoons.length ? (
            <div className="solar-panel__section">
              <p className="eyebrow">Major moons</p>
              <div className="solar-related-list">
                {planetMoons.map((item) => (
                  <button key={item.id} type="button" onClick={() => onSelectMoon(item.id)}>
                    {item.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="solar-panel__facts">
            <p className="eyebrow">Facts</p>
            <ul>
              {planet.facts.map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
          </div>
          <div className="solar-panel__actions">
            <button type="button" onClick={onExplore}>
              Open imagery
            </button>
            <button type="button" className="ghost" onClick={onFocus}>
              Focus
            </button>
            <button type="button" className={`ghost ${isTracking ? "active" : ""}`} onClick={onToggleTrack}>
              {isTracking ? "Tracking" : "Track"}
            </button>
            <button
              type="button"
              className={`ghost ${moonToggleEnabled ? "active" : ""}`}
              onClick={onToggleMoonsForPlanet}
            >
              {moonToggleEnabled ? "Moons On" : "Moons Off"}
            </button>
          </div>
        </>
      ) : asteroidBeltSelected ? (
        <>
          <div className="solar-panel__section">
            <p className="eyebrow">STRUCTURE</p>
            <h3>Asteroid Belt</h3>
            <p className="solar-panel__note">
              Main-belt context rendered as a visual field between Mars and Jupiter.
            </p>
          </div>
          <dl className="solar-panel__stats">
            <div>
              <dt>Approx. region</dt>
              <dd>~2.1-3.3 AU</dd>
            </div>
            <div>
              <dt>Current rendering</dt>
              <dd>{scaleMode === "educational" ? "Expanded spacing" : "Compressed showcase spacing"}</dd>
            </div>
            <div>
              <dt>Accuracy</dt>
              <dd>Representative, not catalog-complete</dd>
            </div>
          </dl>
          <div className="solar-panel__actions">
            <button type="button" className="ghost" onClick={onShowAsteroidBelt}>
              Top-down belt view
            </button>
          </div>
        </>
      ) : (
        <p className="status">Click a planet or moon to view details and jump into imagery.</p>
      )}
    </aside>
  );
};

export default SolarDetailsPanel;
