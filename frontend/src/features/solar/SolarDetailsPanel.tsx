import { FC } from "react";
import type { MoonDef } from "./moonData";
import { MOONS } from "./moonData";
import { PLANETS, type PlanetDef, type PlanetId, type SolarScaleMode } from "./solarData";
import { PLANET_TEXTURES } from "./textures/textureCatalog";
import { PLANET_MATERIAL_MODEL, PLANET_MATERIAL_PRESETS } from "./textures/planetMaterialPresets";
import { getPlanetTextureRoles, SOLAR_TEXTURE_PROVENANCE } from "./textures/textureProvenance";
import {
  SOLAR_AU_KM,
  getSolarBodyOrientation,
  getSolarObjectState,
  getSolarRingSystem,
  getSatelliteEphemerisDescriptor,
  SOLAR_RING_SHADOW_MODEL,
  type SolarRingSystem,
  type SolarBodyOrientationState,
  isControlledSatelliteOrientationBodyId,
} from "../../domain/solar";
import { getSolarScaleModeDefinition } from "./solarScale";
import {
  SOLAR_ECLIPSE_MODEL,
  SOLAR_MOON_ECLIPSE_MODEL,
  type MoonEclipseOccluder,
  type PlanetEclipseOccluder,
} from "./eclipse/solarEclipseModel";
import {
  getAtmosphereScatteringProfile,
  SOLAR_ATMOSPHERE_SCATTERING_MODEL,
} from "./atmosphere/atmosphereScatteringModel";
import type { SmallBodyDef } from "./smallBodies/smallBodyData";
import { SMALL_BODY_SOURCE_MANIFEST_HREF } from "./smallBodies/smallBodyData";
import { COMET_TAIL_PRESENTATION_MODEL, getCometTailPresentation } from "./smallBodies/cometPresentation";
import { SMALL_BODY_EPHEMERIS_MODEL } from "../../domain/solar/smallBodyEphemeris";

interface SolarDetailsPanelProps {
  planet: PlanetDef | null;
  moon: MoonDef | null;
  smallBody: SmallBodyDef | null;
  sunSelected: boolean;
  asteroidBeltSelected: boolean;
  collapsed: boolean;
  currentDate: Date;
  timeDays: number;
  scaleMode: SolarScaleMode;
  isTracking: boolean;
  isMoonTracking: boolean;
  moonToggleEnabled: boolean;
  eclipseShadowsEnabled: boolean;
  eclipseCandidates: PlanetEclipseOccluder[];
  moonEclipseCandidates: MoonEclipseOccluder[];
  ringShadowsEnabled: boolean;
  atmosphereLutWidth: number;
  atmosphereLutHeight: number;
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
  onFocusSmallBody: () => void;
  onExploreSmallBody: () => void;
  earthSurfaceHref: string;
}

interface SolarAssetIntegrityProps {
  maps: string[];
  technique: string;
}

const SolarAssetIntegrity: FC<SolarAssetIntegrityProps> = ({ maps, technique }) => (
  <div className="solar-panel__section solar-panel__integrity">
    <p className="eyebrow">Rendering and asset integrity</p>
    <dl className="solar-panel__stats">
      <div>
        <dt>Material model</dt>
        <dd>{PLANET_MATERIAL_MODEL.status.replace("-", " ")}</dd>
      </div>
      <div>
        <dt>Active inputs</dt>
        <dd>{maps.join(" · ")}</dd>
      </div>
      <div>
        <dt>Asset provenance</dt>
        <dd>Per-file receipts verified</dd>
      </div>
    </dl>
    <p className="solar-panel__note">{technique}</p>
    <p className="solar-panel__note">
      Source URLs, licence terms, attribution, upstream hashes and local transformations are recorded for every public
      texture.
    </p>
    <a className="solar-panel__manifest-link" href={SOLAR_TEXTURE_PROVENANCE.manifestHref} target="_blank" rel="noreferrer">
      Open texture manifest
    </a>
    <a
      className="solar-panel__manifest-link"
      href={SOLAR_TEXTURE_PROVENANCE.attributionHref}
      target="_blank"
      rel="noreferrer"
    >
      Open attribution notices
    </a>
  </div>
);

const getPlanetMaterialTechnique = (planet: PlanetDef) => {
  const techniques = [PLANET_MATERIAL_MODEL.surfaceLighting];
  if (PLANET_MATERIAL_PRESETS[planet.id].atmosphere) {
    techniques.push(PLANET_MATERIAL_MODEL.atmosphereLighting);
  }
  if (planet.ringSystem) techniques.push(PLANET_MATERIAL_MODEL.ringLighting);
  return `${techniques.join(". ")}.`;
};

const SolarAtmosphereReadout: FC<{
  planet: PlanetDef;
  lutWidth: number;
  lutHeight: number;
}> = ({ planet, lutWidth, lutHeight }) => {
  const atmosphere = PLANET_MATERIAL_PRESETS[planet.id].atmosphere;
  if (!atmosphere) return null;
  const profile = getAtmosphereScatteringProfile(planet.id);
  const activeModelId = profile?.id ?? SOLAR_ATMOSPHERE_SCATTERING_MODEL.fallbackId;

  return (
    <div
      className="solar-panel__section"
      data-solar-atmosphere-model={activeModelId}
      data-solar-atmosphere-body={planet.id}
      data-solar-atmosphere-lut={profile ? `${lutWidth}x${lutHeight}` : "none"}
    >
      <p className="eyebrow">Atmosphere scattering</p>
      <dl className="solar-panel__stats">
        <div>
          <dt>Renderer</dt>
          <dd>
            {profile
              ? SOLAR_ATMOSPHERE_SCATTERING_MODEL.label
              : SOLAR_ATMOSPHERE_SCATTERING_MODEL.fallbackLabel}
          </dd>
        </div>
        <div>
          <dt>Profile</dt>
          <dd>{profile?.label ?? "No body-specific radiative-transfer profile claimed"}</dd>
        </div>
        <div>
          <dt>LUT work</dt>
          <dd>{profile ? `${lutWidth} × ${lutHeight} optical-depth texels` : "Not mounted"}</dd>
        </div>
      </dl>
      {profile ? (
        <>
          <p className="solar-panel__note">{profile.physicalInputNote}</p>
          <p className="solar-panel__note">{profile.accuracyNote}</p>
          <p className="solar-panel__note">
            {profile.sources.map((source, index) => (
              <span key={source.url}>
                {index > 0 ? " · " : null}
                <a href={source.url} target="_blank" rel="noreferrer">
                  {source.label}
                </a>
              </span>
            ))}
          </p>
        </>
      ) : (
        <p className="solar-panel__note">
          The compact terrestrial single-scattering table is not reused for this atmosphere. The visible
          limb remains a sun-aware presentation fallback until a reviewed body-specific profile exists.
        </p>
      )}
    </div>
  );
};

const formatOrientationPeriod = (hours: number) =>
  hours >= 48 ? `${(hours / 24).toFixed(2)} days` : `${hours.toFixed(2)} hours`;

const SolarOrientationReadout: FC<{ orientation: SolarBodyOrientationState }> = ({ orientation }) => (
  <div
    className="solar-panel__section"
    data-solar-orientation-model={orientation.modelLabel}
    data-solar-orientation-body={orientation.bodyId}
  >
    <p className="eyebrow">Body orientation</p>
    <dl className="solar-panel__stats">
      <div>
        <dt>Prime meridian</dt>
        <dd>
          {orientation.bodyId === "earth" ? "ERA" : "W"} {orientation.primeMeridianDeg.toFixed(3)}°
        </dd>
      </div>
      <div>
        <dt>Pole (ICRF)</dt>
        <dd>
          RA {orientation.pole.rightAscensionDeg.toFixed(3)}° · Dec {orientation.pole.declinationDeg.toFixed(3)}°
        </dd>
      </div>
      <div>
        <dt>Pole/ecliptic angle</dt>
        <dd>{orientation.pole.poleAngleToJ2000EclipticNorthDeg.toFixed(3)}°</dd>
      </div>
      <div>
        <dt>Spin</dt>
        <dd>
          {formatOrientationPeriod(orientation.nominalRotationPeriodHours)} · {orientation.rotationSense}
        </dd>
      </div>
      <div>
        <dt>Convention</dt>
        <dd>{orientation.rotationSystem}</dd>
      </div>
      <div>
        <dt>Source</dt>
        <dd>
          <a href={orientation.source.sourceUrl} target="_blank" rel="noreferrer">
            {orientation.source.label}
          </a>
          {orientation.source.manifestUrl ? (
            <>
              {" · "}
              <a href={orientation.source.manifestUrl} target="_blank" rel="noreferrer">
                receipt
              </a>
            </>
          ) : null}
        </dd>
      </div>
    </dl>
    <p className="solar-panel__note">{orientation.accuracyNote}</p>
    <p className="solar-panel__note solar-panel__integrity-warning">
      The body frame is date anchored. The local texture bundle has unresolved cartographic seam and origin metadata,
      so surface landmarks are not claimed to align with the model prime meridian.
    </p>
  </div>
);

const SolarEclipseReadout: FC<{
  candidates: PlanetEclipseOccluder[];
  enabled: boolean;
}> = ({ candidates, enabled }) => (
  <div
    className="solar-panel__section"
    data-solar-eclipse-model={SOLAR_ECLIPSE_MODEL.id}
    data-solar-eclipse-candidates={candidates.length}
  >
    <p className="eyebrow">Eclipse geometry</p>
    <dl className="solar-panel__stats">
      <div>
        <dt>Model</dt>
        <dd>{SOLAR_ECLIPSE_MODEL.label}</dd>
      </div>
      <div>
        <dt>Renderer</dt>
        <dd>{enabled ? "Analytic umbra and penumbra enabled" : "Disabled by Low/mobile quality"}</dd>
      </div>
      <div>
        <dt>Current geometry</dt>
        <dd>
          {candidates.length > 0
            ? `${candidates.length} major-moon shadow cone${candidates.length === 1 ? "" : "s"} intersects the modeled surface`
            : "No major-moon penumbra intersects the modeled surface"}
        </dd>
      </div>
    </dl>
    {candidates.length > 0 ? (
      <ul className="solar-panel__compact-list">
        {candidates.map((candidate) => (
          <li key={candidate.moonId}>
            <strong>{candidate.moonName}</strong>
            <span>
              {candidate.umbraRadiusAtTargetRadii >= 0 ? "Umbra/penumbra" : "Antumbra/penumbra"} candidate
              {` · ${candidate.orbitModel}`}
            </span>
          </li>
        ))}
      </ul>
    ) : null}
    <p className="solar-panel__note">{SOLAR_ECLIPSE_MODEL.accuracyNote}</p>
    <p className="solar-panel__note">
      <a href={SOLAR_ECLIPSE_MODEL.sourceUrl} target="_blank" rel="noreferrer">
        NASA eclipse geometry
      </a>{" "}
      ·{" "}
      <a href={SOLAR_ECLIPSE_MODEL.nominalRadiusSourceUrl} target="_blank" rel="noreferrer">
        IAU nominal solar radius
      </a>
      {" · "}
      <a href={SOLAR_ECLIPSE_MODEL.satelliteEphemerisManifestUrl} target="_blank" rel="noreferrer">
        Satellite ephemeris manifest
      </a>
    </p>
  </div>
);

const SolarRingShadowReadout: FC<{
  ringSystem: SolarRingSystem;
  enabled: boolean;
}> = ({ ringSystem, enabled }) => (
  <div
    className="solar-panel__section"
    data-solar-ring-shadow-model={SOLAR_RING_SHADOW_MODEL.id}
    data-solar-ring-system={ringSystem.id}
  >
    <p className="eyebrow">Ring illumination</p>
    <dl className="solar-panel__stats">
      <div>
        <dt>System</dt>
        <dd>{ringSystem.label}</dd>
      </div>
      <div>
        <dt>Renderer</dt>
        <dd>{enabled ? "Two-way analytic ring shadows enabled" : "Surface shadows disabled by Low/mobile quality"}</dd>
      </div>
      <div>
        <dt>Modeled span</dt>
        <dd>
          {Math.round(ringSystem.innerRadiusKm).toLocaleString()}–{Math.round(ringSystem.outerRadiusKm).toLocaleString()} km
        </dd>
      </div>
      <div>
        <dt>Profile</dt>
        <dd>{ringSystem.bands.length} sourced radial bands</dd>
      </div>
    </dl>
    <p className="solar-panel__note">{SOLAR_RING_SHADOW_MODEL.accuracyNote}</p>
    <p className="solar-panel__note">{ringSystem.accuracyNote}</p>
    <p className="solar-panel__note">
      <a href={ringSystem.source.sourceUrl} target="_blank" rel="noreferrer">
        {ringSystem.source.label}
      </a>
      {ringSystem.secondarySource ? (
        <>
          {" · "}
          <a href={ringSystem.secondarySource.sourceUrl} target="_blank" rel="noreferrer">
            {ringSystem.secondarySource.label}
          </a>
        </>
      ) : null}
    </p>
  </div>
);

const SolarMoonEclipseReadout: FC<{
  candidates: MoonEclipseOccluder[];
  enabled: boolean;
}> = ({ candidates, enabled }) => (
  <div
    className="solar-panel__section"
    data-solar-moon-eclipse-model={SOLAR_MOON_ECLIPSE_MODEL.id}
    data-solar-moon-eclipse-candidates={candidates.length}
  >
    <p className="eyebrow">Moon illumination</p>
    <dl className="solar-panel__stats">
      <div>
        <dt>Model</dt>
        <dd>{SOLAR_MOON_ECLIPSE_MODEL.label}</dd>
      </div>
      <div>
        <dt>Renderer</dt>
        <dd>{enabled ? "Parent and mutual eclipse shadows enabled" : "Disabled by Low/mobile quality"}</dd>
      </div>
      <div>
        <dt>Current geometry</dt>
        <dd>
          {candidates.length > 0
            ? `${candidates.length} shadow cone${candidates.length === 1 ? "" : "s"} intersects the modeled moon`
            : "No parent-planet or major-moon penumbra intersects the modeled moon"}
        </dd>
      </div>
    </dl>
    {candidates.length > 0 ? (
      <ul className="solar-panel__compact-list">
        {candidates.map((candidate) => (
          <li key={candidate.occluderId}>
            <strong>{candidate.occluderName}</strong>
            <span>
              {candidate.occluderKind === "parent-planet" ? "Parent-planet eclipse" : "Mutual major-moon eclipse"}
              {candidate.centerObscurationFraction > 0.001
                ? ` · ${(candidate.centerObscurationFraction * 100).toFixed(1)}% center obscuration`
                : " · limb/penumbra candidate"}
              {` · ${candidate.orbitModel}`}
            </span>
          </li>
        ))}
      </ul>
    ) : null}
    <p className="solar-panel__note">{SOLAR_MOON_ECLIPSE_MODEL.accuracyNote}</p>
    <p className="solar-panel__note">
      <a href={SOLAR_MOON_ECLIPSE_MODEL.sourceUrl} target="_blank" rel="noreferrer">
        NASA eclipse geometry
      </a>{" "}
      ·{" "}
      <a href={SOLAR_MOON_ECLIPSE_MODEL.nominalRadiusSourceUrl} target="_blank" rel="noreferrer">
        IAU nominal solar radius
      </a>
      {" · "}
      <a href={SOLAR_MOON_ECLIPSE_MODEL.satelliteEphemerisManifestUrl} target="_blank" rel="noreferrer">
        Satellite ephemeris manifest
      </a>
    </p>
  </div>
);

const SolarDetailsPanel: FC<SolarDetailsPanelProps> = ({
  planet,
  moon,
  smallBody,
  sunSelected,
  asteroidBeltSelected,
  collapsed,
  currentDate,
  timeDays,
  scaleMode,
  isTracking,
  isMoonTracking,
  moonToggleEnabled,
  eclipseShadowsEnabled,
  eclipseCandidates,
  moonEclipseCandidates,
  ringShadowsEnabled,
  atmosphereLutWidth,
  atmosphereLutHeight,
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
  onFocusSmallBody,
  onExploreSmallBody,
  earthSurfaceHref,
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
  const parentPlanet = moon ? PLANETS.find((item) => item.id === moon.parentPlanet) ?? null : null;
  const planetMoons = planet ? MOONS.filter((item) => item.parentPlanet === planet.id && item.class === "major") : [];
  const planetState = planet ? getSolarObjectState(planet.id, timeDays) : null;
  const planetOrientation = planet
    ? getSolarBodyOrientation(planet.id, { daysSinceEpoch: timeDays })
    : null;
  const planetRingSystem = planet ? getSolarRingSystem(planet.id) : null;
  const sunOrientation = sunSelected
    ? getSolarBodyOrientation("sun", { daysSinceEpoch: timeDays })
    : null;
  const moonState = moon ? getSolarObjectState(moon.id, timeDays) : null;
  const smallBodyState = smallBody ? getSolarObjectState(smallBody.id, timeDays) : null;
  const moonOrientation =
    moon && isControlledSatelliteOrientationBodyId(moon.id)
      ? getSolarBodyOrientation(moon.id, { daysSinceEpoch: timeDays })
      : null;
  const moonEphemeris = moon ? getSatelliteEphemerisDescriptor(moon.id) : null;
  const planetDistanceAu = planetState?.orbital?.radiusAu ?? planet?.semiMajorAxisAU ?? null;
  const moonDistanceKm = moonState?.relativePositionAu
    ? Math.hypot(moonState.relativePositionAu.x, moonState.relativePositionAu.y, moonState.relativePositionAu.z) * SOLAR_AU_KM
    : moon?.orbitalDistanceKm ?? null;
  const planetPhaseRad = planetState?.orbital?.trueAnomalyRad ?? planetState?.orbital?.eclipticLongitudeRad;
  const planetPhase = typeof planetPhaseRad === "number"
    ? `${Math.round((planetPhaseRad / (Math.PI * 2)) * 100)}% around orbit`
    : "Approximate phase unavailable";
  const moonPhase = moon
    ? moonState?.model === "parent-relative-circular"
      ? `${Math.round((((timeDays / moon.orbitalPeriodDays) % 1 + 1) % 1) * 100)}% around parent seed orbit`
      : "Controlled analytical state evaluated at the selected UTC instant"
    : null;
  const moonSpeedKmS = moonState?.relativeVelocityAuPerDay
    ? Math.hypot(
        moonState.relativeVelocityAuPerDay.x,
        moonState.relativeVelocityAuPerDay.y,
        moonState.relativeVelocityAuPerDay.z,
      ) * SOLAR_AU_KM / 86_400
    : null;
  const moonImage = moon
    ? moon.textureKey?.startsWith("/")
      ? moon.textureKey
      : `/solar-textures/perf/${moon.textureKey ?? "moon_1024.jpg"}`
    : null;
  const planetImage = planet ? PLANET_TEXTURES[planet.id]?.performance.diffuse : null;
  const planetTextureRoles = planet
    ? [
        ...getPlanetTextureRoles(planet.id),
        ...(planetRingSystem ? ["Sourced radial ring profile"] : []),
      ]
    : [];
  const sunImage = "/solar-textures/perf/2k_sun.jpg";
  const smallBodyDistanceAu = smallBodyState?.orbital?.radiusAu ?? null;
  const cometTail = smallBody?.kind === "comet" && smallBodyDistanceAu
    ? getCometTailPresentation(smallBodyDistanceAu)
    : null;

  if (collapsed) {
    return (
      <aside className="solar-panel solar-panel--collapsed">
        <button type="button" className="ghost button--small" onClick={onToggleCollapse}>
          Open details
        </button>
      </aside>
    );
  }

  const solarObjectKind = moon
    ? "moon"
    : smallBody
      ? "small-body"
    : sunSelected
      ? "sun"
      : asteroidBeltSelected
        ? "belt"
        : planet
          ? "planet"
          : "atlas";

  return (
    <aside
      className={`solar-panel solar-panel--details ${sunSelected ? "solar-panel--sun" : ""}`}
      data-solar-object={solarObjectKind}
    >
      <div className="solar-panel__header">
        <div>
          <p className="eyebrow">
            {moon
              ? "MOON"
              : smallBody
                ? smallBody.kind === "comet"
                  ? "COMET"
                  : "DWARF PLANET"
                : sunSelected
                  ? "STAR"
                  : asteroidBeltSelected
                    ? "BELT"
                    : planet
                      ? "PLANET"
                      : "ATLAS"}
          </p>
          <h3>
            {moon
              ? moon.name
              : smallBody
                ? smallBody.name
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
          {sunOrientation ? <SolarOrientationReadout orientation={sunOrientation} /> : null}
          <SolarAssetIntegrity
            maps={["Stellar surface colour"]}
            technique="Emissive sphere and corona are a visual treatment, not a radiative-transfer model."
          />
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
              <div>
                <dt>Current orbital speed</dt>
                <dd>{moonSpeedKmS ? `${moonSpeedKmS.toFixed(3)} km/s` : "Not available from seed model"}</dd>
              </div>
            </dl>
          </div>
          {moonEphemeris ? (
            <div
              className="solar-panel__section"
              data-satellite-ephemeris-model={moonState?.model ?? moonEphemeris.model}
              data-satellite-ephemeris-controlled={moonState?.model !== "parent-relative-circular"}
            >
              <p className="eyebrow">Satellite ephemeris</p>
              <dl className="solar-panel__stats">
                <div>
                  <dt>Status</dt>
                  <dd>{moonState?.model === "parent-relative-circular" ? "Disclosed seed fallback" : "Controlled analytical state"}</dd>
                </div>
                <div>
                  <dt>Model</dt>
                  <dd>{moonState?.model === "parent-relative-circular" ? "Parent-relative circular seed" : moonEphemeris.label}</dd>
                </div>
                <div>
                  <dt>Source frame</dt>
                  <dd>{moonState?.model === "parent-relative-circular" ? moonEphemeris.runtimeFrame : moonEphemeris.nativeFrame}</dd>
                </div>
                <div>
                  <dt>Runtime frame</dt>
                  <dd>{moonEphemeris.runtimeFrame}</dd>
                </div>
              </dl>
              <p className="solar-panel__note">{moonState?.accuracyNote ?? moonEphemeris.accuracyNote}</p>
              {moonEphemeris.sourceUrl || moonEphemeris.manifestUrl ? (
                <p className="solar-panel__note">
                  {moonEphemeris.sourceUrl ? (
                    <a href={moonEphemeris.sourceUrl} target="_blank" rel="noreferrer">
                      {moon.id === "moon" ? "Astronomy Engine release" : "IMCCE L1.2 theory"}
                    </a>
                  ) : null}
                  {moonEphemeris.sourceUrl && moonEphemeris.manifestUrl ? " · " : null}
                  {moonEphemeris.manifestUrl ? (
                    <a href={moonEphemeris.manifestUrl} target="_blank" rel="noreferrer">
                      Open generated manifest
                    </a>
                  ) : null}
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="solar-panel__section">
            <p className="eyebrow">Current simulation</p>
            <p className="solar-panel__note">
              {formatDate(currentDate)} · {moonPhase}.{" "}
              {moonOrientation
                ? "The rendered body frame follows the controlled source model at this instant."
                : "No controlled attitude model is installed for this moon; its surface presentation remains fixed."}
            </p>
          </div>
          {moonOrientation ? <SolarOrientationReadout orientation={moonOrientation} /> : null}
          <SolarMoonEclipseReadout
            candidates={moonEclipseCandidates}
            enabled={eclipseShadowsEnabled}
          />
          <SolarAssetIntegrity
            maps={moon.textureKey ? ["Shared moon surface colour"] : ["Colour hint only"]}
            technique="Moon geometry and material are a local visual approximation; orbital state is handled separately."
          />
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
            {moon.id === "moon" && earthSurfaceHref ? (
              <a className="solar-surface-link" href={earthSurfaceHref}>
                Open Earth-Moon engine
              </a>
            ) : null}
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
      ) : smallBody ? (
        <>
          <div className="solar-panel__section">
            <p className="eyebrow">Identity</p>
            <dl className="solar-panel__stats">
              <div>
                <dt>Object type</dt>
                <dd>{smallBody.kind === "comet" ? "Comet" : "Dwarf planet"}</dd>
              </div>
              <div>
                <dt>Catalog identity</dt>
                <dd>{smallBody.catalogName}</dd>
              </div>
              <div>
                <dt>JPL orbit class</dt>
                <dd>{smallBody.source.orbitClassName}</dd>
              </div>
            </dl>
          </div>
          <div className="solar-panel__section">
            <p className="eyebrow">Physical and orbit</p>
            <dl className="solar-panel__stats">
              <div>
                <dt>Current Sun distance</dt>
                <dd>{smallBodyDistanceAu ? `${smallBodyDistanceAu.toFixed(3)} AU` : "Not available"}</dd>
              </div>
              <div>
                <dt>Radius used</dt>
                <dd>{formatKm(smallBody.radiusKm)}</dd>
              </div>
              <div>
                <dt>Perihelion / aphelion</dt>
                <dd>{smallBody.orbit.perihelionAu.toFixed(3)} / {smallBody.orbit.aphelionAu.toFixed(3)} AU</dd>
              </div>
              <div>
                <dt>Orbital period</dt>
                <dd>{formatDays(smallBody.orbit.orbitalPeriodDays)}</dd>
              </div>
              <div>
                <dt>Inclination</dt>
                <dd>{smallBody.orbit.inclinationDeg.toFixed(3)}°</dd>
              </div>
              <div>
                <dt>Element epoch</dt>
                <dd>JD {smallBody.orbit.epochJulianDateTdb.toFixed(1)} TDB</dd>
              </div>
            </dl>
            <p className="solar-panel__note">{smallBody.radiusBasis}.</p>
            {smallBody.shapeNote ? <p className="solar-panel__note">{smallBody.shapeNote}</p> : null}
          </div>
          <div
            className="solar-panel__section"
            data-small-body-ephemeris-model={SMALL_BODY_EPHEMERIS_MODEL.id}
            data-small-body-id={smallBody.id}
          >
            <p className="eyebrow">Source-controlled ephemeris</p>
            <dl className="solar-panel__stats">
              <div>
                <dt>Model</dt>
                <dd>{SMALL_BODY_EPHEMERIS_MODEL.label}</dd>
              </div>
              <div>
                <dt>Frame</dt>
                <dd>{SMALL_BODY_EPHEMERIS_MODEL.frame}</dd>
              </div>
              <div>
                <dt>Orbit solution</dt>
                <dd>{smallBody.source.orbitSolutionId}</dd>
              </div>
              <div>
                <dt>Observation arc</dt>
                <dd>{smallBody.source.dataArcDays.toLocaleString()} days</dd>
              </div>
            </dl>
            <p className="solar-panel__note">
              {formatDate(currentDate)} · {smallBodyState?.accuracyNote ?? SMALL_BODY_EPHEMERIS_MODEL.accuracyNote}
            </p>
            <p className="solar-panel__note">
              <a href={smallBody.source.queryUrl} target="_blank" rel="noreferrer">Open JPL SBDB record</a>
              {" · "}
              <a href={SMALL_BODY_EPHEMERIS_MODEL.sourceDocumentationUrl} target="_blank" rel="noreferrer">API method</a>
              {" · "}
              <a href={SMALL_BODY_SOURCE_MANIFEST_HREF} target="_blank" rel="noreferrer">Pinned receipt</a>
            </p>
          </div>
          {smallBody.kind === "comet" ? (
            <div
              className="solar-panel__section"
              data-comet-tail-model={COMET_TAIL_PRESENTATION_MODEL.id}
              data-comet-tail-active={cometTail?.active ?? false}
            >
              <p className="eyebrow">Coma and tail display</p>
              <dl className="solar-panel__stats">
                <div>
                  <dt>Direction</dt>
                  <dd>Anti-solar axis</dd>
                </div>
                <div>
                  <dt>Activity cue</dt>
                  <dd>{cometTail?.active ? `${Math.round(cometTail.activity * 100)}% display strength` : "Hidden beyond 6 AU"}</dd>
                </div>
              </dl>
              <p className="solar-panel__note">{COMET_TAIL_PRESENTATION_MODEL.accuracyNote}</p>
            </div>
          ) : null}
          <div className="solar-panel__facts">
            <p className="eyebrow">Source-backed notes</p>
            <ul>
              {smallBody.facts.map((fact) => <li key={fact}>{fact}</li>)}
            </ul>
          </div>
          <div className="solar-panel__actions">
            <button type="button" onClick={onExploreSmallBody}>Open imagery</button>
            <button type="button" className="ghost" onClick={onFocusSmallBody}>Focus</button>
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
                <dd>
                  {planetOrientation
                    ? `${formatOrientationPeriod(planetOrientation.nominalRotationPeriodHours)} · ${planetOrientation.rotationSense}`
                    : "Not available"}
                </dd>
              </div>
              <div>
                <dt>Pole/ecliptic angle</dt>
                <dd>
                  {planetOrientation
                    ? `${planetOrientation.pole.poleAngleToJ2000EclipticNorthDeg.toFixed(3)}°`
                    : "Not available"}
                </dd>
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
          {planetOrientation ? <SolarOrientationReadout orientation={planetOrientation} /> : null}
          <SolarEclipseReadout
            candidates={eclipseCandidates}
            enabled={eclipseShadowsEnabled}
          />
          {planetRingSystem ? (
            <SolarRingShadowReadout
              ringSystem={planetRingSystem}
              enabled={ringShadowsEnabled}
            />
          ) : null}
          <SolarAtmosphereReadout
            planet={planet}
            lutWidth={atmosphereLutWidth}
            lutHeight={atmosphereLutHeight}
          />
          <SolarAssetIntegrity
            maps={planetTextureRoles}
            technique={getPlanetMaterialTechnique(planet)}
          />
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
            {planet.id === "earth" && earthSurfaceHref ? (
              <a className="solar-surface-link" href={earthSurfaceHref}>
                Descend to Earth
              </a>
            ) : null}
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
              <dd>{getSolarScaleModeDefinition(scaleMode).label}</dd>
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
