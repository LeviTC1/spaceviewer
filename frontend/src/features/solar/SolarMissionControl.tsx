import { FC, useMemo } from "react";
import type { AsteroidBeltMode } from "./asteroids/asteroidGenerator";
import type { MoonDef, MoonVisibilityMode } from "./moonData";
import { SOLAR_SCALE_MODES, type PlanetDef, type SolarScaleMode } from "./solarData";
import { SOLAR_NAVIGATION_LABELS, type SolarNavigationMode } from "./solarNavigation";
import type { TextureQuality } from "./textures/textureCatalog";
import type { SmallBodyDef } from "./smallBodies/smallBodyData";
import { SOLAR_AU_KM, getSolarObjectState } from "../../domain/solar";
import type { TimeDirection } from "../time/timePlayback";
import { getSolarScaleModeDefinition } from "./solarScale";

interface SolarMissionControlProps {
  selectedLabel: string;
  planet: PlanetDef | null;
  moon: MoonDef | null;
  smallBody: SmallBodyDef | null;
  sunSelected: boolean;
  asteroidBeltSelected: boolean;
  currentDate: Date;
  timeDays: number;
  ephemerisRevision: number;
  navigationMode: SolarNavigationMode;
  scaleMode: SolarScaleMode;
  moonMode: MoonVisibilityMode;
  asteroidMode: AsteroidBeltMode;
  performanceMode: boolean;
  textureQuality: TextureQuality;
  isPlaying: boolean;
  speed: number;
  direction: TimeDirection;
  onNavigationModeChange: (mode: SolarNavigationMode) => void;
  onScaleModeChange: (mode: SolarScaleMode) => void;
  onMoonModeChange: (mode: MoonVisibilityMode) => void;
  onAsteroidModeChange: (mode: AsteroidBeltMode) => void;
  onTogglePerformance: () => void;
  copyLinkStatus: "idle" | "copied" | "failed";
  onCopyLink: () => void;
  onClose?: () => void;
}

const formatDate = (date: Date) =>
  new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);

const formatSpeed = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return "Paused";
  if (value >= 365) return `${(value / 365.25).toFixed(1)} yr/s`;
  if (value >= 1) return `${value.toFixed(value >= 10 ? 0 : 1)} d/s`;
  return `${(value * 24).toFixed(1)} hr/s`;
};

const formatDistance = (au: number) => {
  if (!Number.isFinite(au)) return "Not available";
  if (au < 0.01) return `${Math.round(au * SOLAR_AU_KM).toLocaleString()} km`;
  return `${au.toFixed(au >= 10 ? 1 : 2)} AU`;
};

const formatOrbitalSpeed = (distanceKm: number, periodDays: number) => {
  if (!Number.isFinite(distanceKm) || !Number.isFinite(periodDays) || periodDays <= 0) return "Not available";
  return `${((2 * Math.PI * distanceKm) / (periodDays * 86_400)).toFixed(1)} km/s`;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const formatOrbitPhase = (radians: number | undefined) => {
  if (typeof radians !== "number") return "Not available";
  const normalized = (((radians / (Math.PI * 2)) % 1) + 1) % 1;
  return `${Math.round(normalized * 100)}% around orbit`;
};

const SolarMissionControl: FC<SolarMissionControlProps> = ({
  selectedLabel,
  planet,
  moon,
  smallBody,
  sunSelected,
  asteroidBeltSelected,
  currentDate,
  timeDays,
  ephemerisRevision,
  navigationMode,
  scaleMode,
  moonMode,
  asteroidMode,
  performanceMode,
  textureQuality,
  isPlaying,
  speed,
  direction,
  onNavigationModeChange,
  onScaleModeChange,
  onMoonModeChange,
  onAsteroidModeChange,
  onTogglePerformance,
  copyLinkStatus,
  onCopyLink,
  onClose,
}) => {
  const scaleDefinition = getSolarScaleModeDefinition(scaleMode);
  const motionReadout = useMemo(() => {
    void ephemerisRevision;
    if (moon) {
      const moonState = getSolarObjectState(moon.id, timeDays);
      const distanceKm = moonState?.relativePositionAu
        ? Math.hypot(
            moonState.relativePositionAu.x,
            moonState.relativePositionAu.y,
            moonState.relativePositionAu.z,
          ) * SOLAR_AU_KM
        : moon.orbitalDistanceKm;
      const velocityKmS = moonState?.relativeVelocityAuPerDay
        ? Math.hypot(
            moonState.relativeVelocityAuPerDay.x,
            moonState.relativeVelocityAuPerDay.y,
            moonState.relativeVelocityAuPerDay.z,
          ) * SOLAR_AU_KM / 86_400
        : null;

      return {
        objectType: moon.class === "major" ? "Major moon" : "Minor moon",
        distanceLabel: `${Math.round(distanceKm).toLocaleString()} km`,
        speedLabel: velocityKmS ? `${velocityKmS.toFixed(3)} km/s` : formatOrbitalSpeed(distanceKm, moon.orbitalPeriodDays),
        accuracyLabel:
          moonState?.model === "astronomy-engine-improved-lunar"
            ? "Improved Lunar Ephemeris"
            : moonState?.model === "astronomy-engine-l1.2-galilean"
              ? "IMCCE L1.2 · controlled"
              : "Parent-relative seed",
      };
    }

    if (planet) {
      const planetState = getSolarObjectState(planet.id, timeDays);
      const distanceAu = planetState?.orbital?.radiusAu ?? planet.semiMajorAxisAU;
      return {
        objectType: planet.id === "pluto" ? "Dwarf planet" : "Planet",
        distanceLabel: formatDistance(distanceAu),
        speedLabel: formatOrbitalSpeed(distanceAu * SOLAR_AU_KM, planet.orbitalPeriodDays),
        accuracyLabel:
          planetState?.model === "vsop87"
            ? "VSOP87C · streamed Float64"
            : "Keplerian · boot fallback",
      };
    }

    if (smallBody) {
      const state = getSolarObjectState(smallBody.id, timeDays);
      const distanceAu = state?.orbital?.radiusAu ?? smallBody.orbit.semiMajorAxisAu;
      return {
        objectType: smallBody.kind === "comet" ? "Comet" : "Dwarf planet",
        distanceLabel: formatDistance(distanceAu),
        speedLabel: `${smallBody.orbit.meanMotionDegPerDay.toFixed(smallBody.kind === "comet" ? 4 : 5)}\u00b0/day`,
        accuracyLabel: "JPL SBDB osculating \u00b7 two-body",
      };
    }

    if (sunSelected) {
      return {
        objectType: "Star",
        distanceLabel: "0 AU",
        speedLabel: "Reference body",
        accuracyLabel: "Heliocentric origin",
      };
    }

    if (asteroidBeltSelected) {
      return {
        objectType: "Main belt",
        distanceLabel: "2.1-3.3 AU",
        speedLabel: "~17-20 km/s",
        accuracyLabel: "Representative belt field",
      };
    }

    return {
      objectType: "Atlas",
      distanceLabel: "System scale",
      speedLabel: isPlaying ? `${direction === "reverse" ? "Reverse" : "Forward"} · ${formatSpeed(speed)}` : "Paused",
      accuracyLabel: "Approximate orbital model",
    };
  }, [asteroidBeltSelected, direction, ephemerisRevision, isPlaying, moon, planet, smallBody, speed, sunSelected, timeDays]);

  const layerReadout = [
    { label: "Date", value: formatDate(currentDate) },
    { label: "Camera", value: SOLAR_NAVIGATION_LABELS[navigationMode] },
    { label: "Scale", value: scaleDefinition.shortLabel },
    {
      label: "Time",
      value: isPlaying ? `${direction === "reverse" ? "Reverse" : "Forward"} · ${formatSpeed(speed)}` : "Paused",
    },
  ];
  const orbitInsight = useMemo(() => {
    void ephemerisRevision;
    if (!planet && !smallBody) return null;
    const object = planet ?? smallBody;
    if (!object) return null;
    const state = getSolarObjectState(object.id, timeDays);
    const phase = state?.orbital?.trueAnomalyRad ?? state?.orbital?.eclipticLongitudeRad;
    const orbitalPeriodDays = planet?.orbitalPeriodDays ?? smallBody?.orbit.orbitalPeriodDays ?? 0;
    const trailDays = clamp(orbitalPeriodDays * 0.028, 18, 260);
    const perihelionAu = planet
      ? planet.semiMajorAxisAU * (1 - (planet.eccentricity ?? 0))
      : smallBody?.orbit.perihelionAu ?? 0;
    const aphelionAu = planet
      ? planet.semiMajorAxisAU * (1 + (planet.eccentricity ?? 0))
      : smallBody?.orbit.aphelionAu ?? 0;

    return [
      { label: "Orbit phase", value: formatOrbitPhase(phase) },
      { label: "Trail window", value: `${Math.round(trailDays)} days` },
      { label: "Perihelion", value: formatDistance(perihelionAu) },
      { label: "Aphelion", value: formatDistance(aphelionAu) },
    ];
  }, [ephemerisRevision, planet, smallBody, timeDays]);

  return (
    <aside className="solar-mission-control" aria-label="Solar mission control">
      <div className="solar-mission-control__header">
        <div>
          <p className="eyebrow">MISSION CONTROL</p>
          <h2>{selectedLabel}</h2>
        </div>
        <div className="solar-mission-control__header-side">
          <span>{motionReadout.objectType}</span>
          <button
            type="button"
            className="solar-mission-control__share"
            onClick={onCopyLink}
            aria-label={copyLinkStatus === "copied" ? "Solar link copied" : "Copy Solar link"}
            title="Copy a link to this object, date, scale, and camera mode"
          >
            <span aria-live="polite">
              {copyLinkStatus === "copied" ? "Copied" : copyLinkStatus === "failed" ? "Retry" : "Copy link"}
            </span>
          </button>
          {onClose ? (
            <button
              type="button"
              className="solar-mission-control__dismiss"
              onClick={onClose}
              aria-label="Hide Mission panel"
              title="Hide Mission panel (reopen from the panel dock)"
            >
              &minus;
            </button>
          ) : null}
        </div>
      </div>

      <dl className="solar-mission-control__stats">
        {layerReadout.map((item) => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>

      <dl className="solar-mission-control__orbit">
        <div>
          <dt>Distance</dt>
          <dd>{motionReadout.distanceLabel}</dd>
        </div>
        <div>
          <dt>Mean motion</dt>
          <dd>{motionReadout.speedLabel}</dd>
        </div>
        <div>
          <dt>Model</dt>
          <dd>{motionReadout.accuracyLabel}</dd>
        </div>
      </dl>

      {orbitInsight ? (
        <div className="solar-mission-control__section solar-mission-control__section--orbit">
          <span>Orbit overlay</span>
          <dl className="solar-mission-control__insight">
            {orbitInsight.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      <div className="solar-mission-control__section">
        <span>Camera</span>
        <div className="solar-mission-control__segmented" role="group" aria-label="Solar camera mode">
          {(["overview", "planetary", "ecliptic"] as SolarNavigationMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className={navigationMode === mode ? "active" : ""}
              onClick={() => onNavigationModeChange(mode)}
              aria-pressed={navigationMode === mode}
            >
              {SOLAR_NAVIGATION_LABELS[mode]}
            </button>
          ))}
        </div>
      </div>

      <div className="solar-mission-control__section">
        <span>Scale model</span>
        <div className="solar-mission-control__segmented" role="group" aria-label="Solar scale model">
          {SOLAR_SCALE_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              className={scaleMode === mode ? "active" : ""}
              onClick={() => onScaleModeChange(mode)}
              aria-pressed={scaleMode === mode}
            >
              {getSolarScaleModeDefinition(mode).shortLabel}
            </button>
          ))}
        </div>
        <small className="solar-mission-control__scale-note">
          {scaleDefinition.disclosure}
        </small>
      </div>

      <div className="solar-mission-control__section">
        <span>Layers</span>
        <div className="solar-mission-control__actions">
          <button
            type="button"
            className={moonMode !== "off" ? "active" : ""}
            onClick={() => onMoonModeChange(moonMode === "off" ? "major" : "off")}
            aria-pressed={moonMode !== "off"}
          >
            {moonMode === "off" ? "Moons Off" : moonMode === "all" ? "All Moons" : "Major Moons"}
          </button>
          <button
            type="button"
            className={asteroidMode !== "off" ? "active" : ""}
            onClick={() => onAsteroidModeChange(asteroidMode === "off" ? "simplified" : "off")}
            aria-pressed={asteroidMode !== "off"}
          >
            {asteroidMode === "off" ? "Belt Off" : asteroidMode === "full" ? "Full Belt" : "Simple Belt"}
          </button>
          <button
            type="button"
            className={performanceMode ? "active" : ""}
            onClick={onTogglePerformance}
            aria-pressed={performanceMode}
          >
            {performanceMode ? "Performance" : textureQuality === "high" ? "High Detail" : "Balanced"}
          </button>
        </div>
      </div>
    </aside>
  );
};

export default SolarMissionControl;
