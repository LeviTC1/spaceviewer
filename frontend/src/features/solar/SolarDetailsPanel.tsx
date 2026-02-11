import { FC } from "react";
import type { MoonDef } from "./moonData";
import type { PlanetDef } from "./solarData";
import { PLANET_TEXTURES } from "./textures/textureCatalog";

interface SolarDetailsPanelProps {
  planet: PlanetDef | null;
  moon: MoonDef | null;
  sunSelected: boolean;
  collapsed: boolean;
  isTracking: boolean;
  isMoonTracking: boolean;
  moonToggleEnabled: boolean;
  onToggleMoonsForPlanet: () => void;
  onToggleCollapse: () => void;
  onFocus: () => void;
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
  collapsed,
  isTracking,
  isMoonTracking,
  moonToggleEnabled,
  onToggleMoonsForPlanet,
  onToggleCollapse,
  onFocus,
  onToggleTrack,
  onFocusMoon,
  onToggleMoonTrack,
  onExplore,
  onExploreSun,
  onFocusSun,
}) => {
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
          <p className="eyebrow">{moon ? "MOON" : sunSelected ? "STAR" : "PLANET"}</p>
          <h3>
            {moon
              ? moon.name
              : sunSelected
                ? "Sun"
                : planet
                  ? planet.name
                  : "Select a planet or moon"}
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
          <dl className="solar-panel__stats">
            <div>
              <dt>Type</dt>
              <dd>G2V star</dd>
            </div>
            <div>
              <dt>Radius</dt>
              <dd>696,340 km</dd>
            </div>
            <div>
              <dt>Surface temp</dt>
              <dd>~5,500°C</dd>
            </div>
          </dl>
          <div className="solar-panel__facts">
            <p className="eyebrow">FUN FACTS</p>
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
          <div>
            <p className="eyebrow">MOON</p>
            <h3>{moon.name}</h3>
            <p className="status">Orbiting {moon.parentPlanet}</p>
          </div>
          <dl className="solar-panel__stats">
            <div>
              <dt>Orbital distance</dt>
              <dd>{moon.orbitalDistanceKm.toLocaleString()} km</dd>
            </div>
            <div>
              <dt>Orbital period</dt>
              <dd>{moon.orbitalPeriodDays} days</dd>
            </div>
            <div>
              <dt>Radius</dt>
              <dd>{moon.radiusKm.toLocaleString()} km</dd>
            </div>
          </dl>
          {moon.facts?.length ? (
            <div className="solar-panel__facts">
              <p className="eyebrow">FUN FACTS</p>
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
          <dl className="solar-panel__stats">
            <div>
              <dt>Distance from sun</dt>
              <dd>{planet.semiMajorAxisAU} AU</dd>
            </div>
            <div>
              <dt>Orbital period</dt>
              <dd>{planet.orbitalPeriodDays} days</dd>
            </div>
            <div>
              <dt>Radius</dt>
              <dd>{planet.radiusKm.toLocaleString()} km</dd>
            </div>
          </dl>
          <div className="solar-panel__facts">
            <p className="eyebrow">FUN FACTS</p>
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
      ) : (
        <p className="status">Click a planet or moon to view details and jump into imagery.</p>
      )}
    </aside>
  );
};

export default SolarDetailsPanel;
