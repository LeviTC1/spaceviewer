import { useEffect, useMemo, useState, type FC, type KeyboardEvent } from "react";
import { SKY_COORDINATE_FRAMES } from "./core/coordinates";
import {
  hasActiveSkyMapFilters,
  type SkyMapDistanceFilter,
  type SkyMapFilterState,
  type SkyMapObjectFamilyFilter,
  type SkyMapSourceFilter,
} from "./core/filters";
import type { SkyLayerDefinition, SkyLayerId, SkyLayerState, SkyLayerStatus } from "./core/layers";
import {
  formatSkyMapNavigationIntent,
  formatSkyMapNavigationMode,
  getSkyMapScaleBandDefinition,
  type SkyMapNavigationState,
} from "./core/navigation";
import type { SkyObjectRegistryRecord, SkyObjectSearchResult } from "./core/objectRegistry";
import type { SkyObject, SkyObjectId } from "./core/objects";
import {
  getSkyObjectImportanceScore,
  isDeepSkyObject,
  isMoonSkyObject,
  isPlanetSkyObject,
  isStarSkyObject,
} from "./core/objects";
import type { SkyMapViewportStatus } from "./core/state";
import {
  getSkyMapDate,
  getSkyMapDateKey,
  SKYMAP_TIME_MAX_DATE_KEY,
  SKYMAP_TIME_MIN_DATE_KEY,
  SKYMAP_TIME_SPEED_OPTIONS,
  type SkyMapTimeState,
} from "./core/time";
import { fetchImage, type ImageResult } from "../../utils/api";

interface SkyMapTopBarProps {
  onOpenSolarExplorer: () => void;
  presentationMode: boolean;
  onStartTour: () => void;
  onTogglePresentation: () => void;
}

export interface SkyMapLayerPanelItem {
  definition: SkyLayerDefinition;
  state: SkyLayerState;
  objectCount: number;
}

interface SkyMapControlRailProps {
  selectedObject: SkyObject | null;
  hoveredObject: SkyObject | null;
  viewportStatus: SkyMapViewportStatus;
  layers: SkyMapLayerPanelItem[];
  searchQuery: string;
  searchResults: SkyObjectSearchResult[];
  registryObjectCount: number;
  discoveryRecords: SkyObjectRegistryRecord[];
  relatedRecords: SkyObjectRegistryRecord[];
  filters: SkyMapFilterState;
  timeState: SkyMapTimeState;
  navigationState: SkyMapNavigationState;
  onSetLayerVisibility: (layerId: SkyLayerId, visible: boolean) => void;
  onFocusObject: (objectId: SkyObjectId) => void;
  onSearchQueryChange: (query: string) => void;
  onSelectSearchResult: (result: SkyObjectSearchResult) => void;
  onSelectDiscoveryRecord: (record: SkyObjectRegistryRecord) => void;
  onExploreRandom: () => void;
  onFilterChange: (filters: Partial<SkyMapFilterState>) => void;
  onResetFilters: () => void;
  onResetNavigationView: () => void;
  onToggleTimePlayback: () => void;
  onSetTimeSpeed: (speedDaysPerSecond: number) => void;
  onSetTimeDate: (dateKey: string) => void;
  onStepTime: (days: number) => void;
  onResetTimeToNow: () => void;
}

const layerStatusCopy: Record<SkyLayerStatus, string> = {
  active: "Active",
  staged: "Staged",
  planned: "Planned",
};

const familyFilterOptions: Array<{ value: SkyMapObjectFamilyFilter; label: string }> = [
  { value: "all", label: "All objects" },
  { value: "stars", label: "Stars" },
  { value: "solar", label: "Solar system" },
  { value: "galaxies", label: "Galaxies" },
  { value: "nebulae", label: "Nebulae" },
  { value: "clusters", label: "Clusters" },
];

const distanceFilterOptions: Array<{ value: SkyMapDistanceFilter; label: string }> = [
  { value: "all", label: "Any distance" },
  { value: "local", label: "Local / near sky" },
  { value: "milky-way", label: "Milky Way" },
  { value: "extragalactic", label: "Extragalactic" },
];

const sourceFilterOptions: Array<{ value: SkyMapSourceFilter; label: string }> = [
  { value: "all", label: "All sources" },
  { value: "local-stars", label: "Nearby stars" },
  { value: "solar-bridge", label: "Solar bridge" },
  { value: "messier-ngc", label: "Messier / NGC" },
];

const formatObjectKind = (kind: string) => kind.replace(/-/g, " ");

const formatTimeBehavior = (behavior: string) => behavior.replace(/-/g, " ");

const formatConfidenceLabel = (confidence: string | undefined) =>
  confidence ? confidence.charAt(0).toUpperCase() + confidence.slice(1) : undefined;

const formatObjectClass = (value: string | undefined, fallback: string) =>
  value ? value.replace(/-/g, " ") : fallback;

const formatDisplayDate = (date: Date) =>
  new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);

const formatNumber = (value: number, maximumFractionDigits = 2) =>
  value.toLocaleString(undefined, { maximumFractionDigits });

const formatOptionalNumber = (
  value: number | undefined,
  suffix: string,
  maximumFractionDigits = 2,
  fallback = "Unknown",
) => (typeof value === "number" ? `${formatNumber(value, maximumFractionDigits)} ${suffix}` : fallback);

const formatLightYears = (value: number | undefined) => {
  if (typeof value !== "number") return "Unknown";
  if (value >= 1_000_000) return `${formatNumber(value / 1_000_000, 2)} Mly`;
  if (value >= 1_000) return `${formatNumber(value / 1_000, 1)} kly`;
  return `${formatNumber(value, 0)} ly`;
};

const formatLayerStatus = (result: SkyObjectSearchResult) =>
  result.record.layerVisible ? result.record.layerLabel : `${result.record.layerLabel} hidden`;

const formatFrameLabel = (object: SkyObject | null) => {
  if (!object) return "None";
  return SKY_COORDINATE_FRAMES[object.position.frame]?.label ?? object.position.frame;
};

const formatSourceLabel = (object: SkyObject) => {
  const source = object.provenance.at(0);
  if (!source) return "Unknown";
  return [source.catalog ?? source.source, formatConfidenceLabel(source.confidence)].filter(Boolean).join(" · ");
};

const formatPosition = (object: SkyObject) => {
  const { position } = object;
  if (position.mode === "cartesian") {
    return `${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)} ${position.unit}`;
  }
  if (position.mode === "spherical") {
    const distance =
      typeof position.distance === "number" && position.distanceUnit
        ? ` · ${position.distance.toFixed(2)} ${position.distanceUnit}`
        : "";
    return `${position.longitude.toFixed(2)}, ${position.latitude.toFixed(2)} ${position.angularUnit}${distance}`;
  }
  return `${position.x.toFixed(2)}, ${position.y.toFixed(2)} ${position.unit}`;
};

const SearchResultName: FC<{ name: string; query: string }> = ({ name, query }) => {
  const trimmed = query.trim();
  const match = useMemo(() => {
    if (!trimmed) return null;
    const lowerName = name.toLowerCase();
    const lowerQuery = trimmed.toLowerCase();
    const index = lowerName.indexOf(lowerQuery);
    return index >= 0 ? { index, end: index + trimmed.length } : null;
  }, [name, trimmed]);

  if (!match) return <>{name}</>;
  return (
    <>
      {name.slice(0, match.index)}
      <mark>{name.slice(match.index, match.end)}</mark>
      {name.slice(match.end)}
    </>
  );
};

const formatSearchResultMeta = (result: SkyObjectSearchResult) => {
  const { object } = result.record;
  if (isStarSkyObject(object) && typeof object.scientific.distanceLy === "number") {
    return `${object.scientific.distanceLy.toFixed(2)} ly | ${object.scientific.spectralType ?? "star"}`;
  }
  if (isPlanetSkyObject(object) && typeof object.scientific?.semiMajorAxisAU === "number") {
    return `${object.scientific.semiMajorAxisAU.toFixed(2)} AU | planet`;
  }
  if (isMoonSkyObject(object)) {
    return object.scientific?.parentPlanetName
      ? `orbits ${object.scientific.parentPlanetName}`
      : "moon";
  }
  if (isDeepSkyObject(object)) {
    return `${formatLightYears(object.scientific?.distanceLy)} | ${formatObjectClass(
      object.scientific?.objectClass,
      formatObjectKind(object.kind),
    )}`;
  }
  return formatObjectKind(object.kind);
};

const SkyMapSearchPanel: FC<{
  query: string;
  results: SkyObjectSearchResult[];
  registryObjectCount: number;
  onQueryChange: (query: string) => void;
  onSelectResult: (result: SkyObjectSearchResult) => void;
}> = ({ query, results, registryObjectCount, onQueryChange, onSelectResult }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const trimmedQuery = query.trim();
  const hasQuery = trimmedQuery.length > 0;
  const showResults = isOpen && hasQuery;

  useEffect(() => {
    setActiveIndex(0);
  }, [query, results.length]);

  const selectResult = (result: SkyObjectSearchResult) => {
    onSelectResult(result);
    setIsOpen(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setIsOpen(false);
      return;
    }

    if (!results.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((index) => (index + 1) % results.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((index) => (index - 1 + results.length) % results.length);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      selectResult(results[activeIndex] ?? results[0]);
    }
  };

  return (
    <section className="skymap-panel skymap-panel--search">
      <div>
        <p className="eyebrow">SEARCH</p>
        <h2>Object index</h2>
      </div>
      <label className="skymap-search" htmlFor="skymap-search">
        <span>Object search</span>
        <input
          id="skymap-search"
          type="search"
          value={query}
          placeholder="Find Mars, Andromeda, Orion..."
          autoComplete="off"
          aria-controls="skymap-search-results"
          aria-expanded={showResults}
          onChange={(event) => {
            onQueryChange(event.currentTarget.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
        />
      </label>
      {showResults ? (
        <div className="skymap-search-results" id="skymap-search-results" role="listbox">
          {results.length ? (
            results.map((result, index) => {
              const object = result.record.object;
              const active = index === activeIndex;
              return (
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  key={object.id}
                  className={`skymap-search-result ${active ? "is-active" : ""}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectResult(result)}
                >
                  <span className="skymap-search-result__main">
                    <strong>
                      <SearchResultName name={object.name} query={query} />
                    </strong>
                    <small>{formatSearchResultMeta(result)}</small>
                  </span>
                  <span className="skymap-search-result__badges">
                    <em>{formatObjectKind(object.kind)}</em>
                    <em className={result.record.layerVisible ? "" : "is-hidden-layer"}>{formatLayerStatus(result)}</em>
                  </span>
                </button>
              );
            })
          ) : (
            <p className="skymap-search-empty">No indexed objects match "{trimmedQuery}".</p>
          )}
        </div>
      ) : (
        <p className="skymap-note">
          Search {registryObjectCount} indexed objects by name, alias, source, or metadata.
        </p>
      )}
    </section>
  );
};

const SkyMapDiscoveryPanel: FC<{
  records: SkyObjectRegistryRecord[];
  onSelectRecord: (record: SkyObjectRegistryRecord) => void;
  onExploreRandom: () => void;
}> = ({ records, onSelectRecord, onExploreRandom }) => (
  <section className="skymap-panel skymap-panel--discovery">
    <div>
      <p className="eyebrow">DISCOVER</p>
      <h2>Featured jumps</h2>
    </div>
    <div className="skymap-discovery-actions">
      <button type="button" className="ghost button--small" onClick={onExploreRandom} disabled={!records.length}>
        Surprise me
      </button>
      <span>{records.length ? `${records.length} highlighted targets` : "No targets match current filters"}</span>
    </div>
    <div className="skymap-discovery-list">
      {records.slice(0, 4).map((record) => {
        const object = record.object;
        const score = getSkyObjectImportanceScore(object);
        const blurb = isDeepSkyObject(object)
          ? object.scientific?.discoveryBlurb
          : object.search?.description;
        return (
          <button
            type="button"
            key={object.id}
            className="skymap-discovery-card"
            onClick={() => onSelectRecord(record)}
          >
            <span>
              <strong>{object.name}</strong>
              <small>{blurb ?? formatSearchResultMeta({ record, score, matchedField: "name", matchedText: object.name })}</small>
            </span>
            <em>{object.importance?.tier ?? "notable"} · {Math.round(score)}</em>
          </button>
        );
      })}
    </div>
  </section>
);

const SkyMapFilterPanel: FC<{
  filters: SkyMapFilterState;
  onFilterChange: (filters: Partial<SkyMapFilterState>) => void;
  onResetFilters: () => void;
}> = ({ filters, onFilterChange, onResetFilters }) => {
  const active = hasActiveSkyMapFilters(filters);

  return (
    <section className="skymap-panel skymap-panel--filters">
      <div>
        <p className="eyebrow">FILTER</p>
        <h2>Shape the map</h2>
      </div>
      <div className="skymap-filter-grid">
        <label>
          <span>Family</span>
          <select
            value={filters.family}
            onChange={(event) => onFilterChange({ family: event.currentTarget.value as SkyMapObjectFamilyFilter })}
          >
            {familyFilterOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Distance</span>
          <select
            value={filters.distance}
            onChange={(event) => onFilterChange({ distance: event.currentTarget.value as SkyMapDistanceFilter })}
          >
            {distanceFilterOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Source</span>
          <select
            value={filters.source}
            onChange={(event) => onFilterChange({ source: event.currentTarget.value as SkyMapSourceFilter })}
          >
            {sourceFilterOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="skymap-filter-actions">
        <label className="skymap-filter-toggle">
          <input
            type="checkbox"
            checked={filters.landmarksOnly}
            onChange={(event) => onFilterChange({ landmarksOnly: event.currentTarget.checked })}
          />
          <span>Landmarks only</span>
        </label>
        <button type="button" className="ghost button--small" onClick={onResetFilters} disabled={!active}>
          Clear filters
        </button>
      </div>
      <p className="skymap-note">
        Filters affect visible map objects, search, and discovery. The selected target stays available while focused.
      </p>
    </section>
  );
};

const SkyMapTimePanel: FC<{
  timeState: SkyMapTimeState;
  onToggleTimePlayback: () => void;
  onSetTimeSpeed: (speedDaysPerSecond: number) => void;
  onSetTimeDate: (dateKey: string) => void;
  onStepTime: (days: number) => void;
  onResetTimeToNow: () => void;
}> = ({
  timeState,
  onToggleTimePlayback,
  onSetTimeSpeed,
  onSetTimeDate,
  onStepTime,
  onResetTimeToNow,
}) => {
  const currentDate = getSkyMapDate(timeState);
  const currentDateKey = getSkyMapDateKey(timeState);

  return (
    <section className="skymap-panel skymap-panel--time">
      <div>
        <p className="eyebrow">SIMULATION TIME</p>
        <h2>{formatDisplayDate(currentDate)}</h2>
      </div>
      <div className="skymap-time-actions">
        <button type="button" className="ghost button--small" onClick={onToggleTimePlayback}>
          {timeState.playback === "playing" ? "Pause" : "Play"}
        </button>
        <button type="button" className="ghost button--small" onClick={() => onStepTime(-30)}>
          -30d
        </button>
        <button type="button" className="ghost button--small" onClick={() => onStepTime(30)}>
          +30d
        </button>
        <button type="button" className="ghost button--small" onClick={onResetTimeToNow}>
          Now
        </button>
      </div>
      <div className="skymap-time-grid">
        <label className="skymap-time-field" htmlFor="skymap-time-date">
          <span>UTC date</span>
          <input
            id="skymap-time-date"
            type="date"
            min={SKYMAP_TIME_MIN_DATE_KEY}
            max={SKYMAP_TIME_MAX_DATE_KEY}
            value={currentDateKey}
            onInput={(event) => onSetTimeDate(event.currentTarget.value)}
            onChange={(event) => onSetTimeDate(event.currentTarget.value)}
            onBlur={(event) => onSetTimeDate(event.currentTarget.value)}
          />
        </label>
        <label className="skymap-time-field" htmlFor="skymap-time-speed">
          <span>Speed</span>
          <select
            id="skymap-time-speed"
            value={timeState.speedDaysPerSecond}
            onChange={(event) => onSetTimeSpeed(Number(event.currentTarget.value))}
          >
            {SKYMAP_TIME_SPEED_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="skymap-note">
        Solar bodies update from this simulated UTC date using an approximate bridge model; stars and deep-space
        landmarks remain static at this stage.
      </p>
    </section>
  );
};

export const SkyMapTopBar: FC<SkyMapTopBarProps> = ({
  onOpenSolarExplorer,
  presentationMode,
  onStartTour,
  onTogglePresentation,
}) => (
  <header className="skymap-topbar">
    <div className="skymap-topbar__copy">
      <p className="eyebrow">UNIVERSE NAVIGATION SURFACE</p>
      <h1 id="skymap-title">SkyMap</h1>
      <p className="subtitle">
        A staged universe map for searchable stars, solar-system bodies, and imagery-backed deep-space landmarks.
        Distances, placement, and motion are marked when they are approximate.
      </p>
    </div>
    <div className="skymap-topbar__actions">
      <span className="skymap-pill">Route: /skymap</span>
      <span className="skymap-pill">Staged scale bands</span>
      <span className="skymap-pill skymap-pill--active">Approximate time model</span>
      <button type="button" className="ghost" onClick={onStartTour}>
        Start Tour
      </button>
      <button type="button" className="ghost" onClick={onTogglePresentation}>
        {presentationMode ? "Exit Presentation" : "Presentation Mode"}
      </button>
      <button type="button" className="ghost" onClick={onOpenSolarExplorer}>
        Open Solar Explorer
      </button>
    </div>
  </header>
);

export const SkyMapStatusStrip: FC<{ viewportStatus: SkyMapViewportStatus }> = ({ viewportStatus }) => (
  <div className="skymap-status-strip" aria-label="SkyMap viewport status">
    <div>
      <span>Object model</span>
      <strong>
        {viewportStatus.objectCount} objects · {viewportStatus.catalogChunkCount} chunks
      </strong>
    </div>
    <div>
      <span>Renderables</span>
      <strong>
        {viewportStatus.visibleCount} · {viewportStatus.interactionCandidateCount} interactive
      </strong>
    </div>
    <div>
      <span>Navigation</span>
      <strong>
        {getSkyMapScaleBandDefinition(viewportStatus.scaleBand).shortLabel} ·{" "}
        {formatSkyMapNavigationMode(viewportStatus.navigationMode)}
      </strong>
    </div>
    <div>
      <span>Map distance</span>
      <strong>{Math.round(viewportStatus.cameraDistance)} scene units</strong>
    </div>
    <div>
      <span>Detail tier</span>
      <strong>
        {viewportStatus.detailTier} · {viewportStatus.activeChunkCount} active chunks
      </strong>
    </div>
  </div>
);

const SkyMapNavigationPanel: FC<{
  navigationState: SkyMapNavigationState;
  viewportStatus: SkyMapViewportStatus;
  onResetNavigationView: () => void;
}> = ({ navigationState, viewportStatus, onResetNavigationView }) => {
  const scaleBand = getSkyMapScaleBandDefinition(navigationState.scaleBand);

  return (
    <section className="skymap-panel skymap-panel--navigation">
      <div>
        <p className="eyebrow">NAVIGATION</p>
        <h2>{scaleBand.label}</h2>
      </div>
      <div className="skymap-navigation-grid">
        <div>
          <span>Mode</span>
          <strong>{formatSkyMapNavigationMode(navigationState.mode)}</strong>
        </div>
        <div>
          <span>Intent</span>
          <strong>{formatSkyMapNavigationIntent(navigationState.lastIntent)}</strong>
        </div>
        <div>
          <span>Map distance</span>
          <strong>{Math.round(viewportStatus.cameraDistance)} scene units</strong>
        </div>
      </div>
      <div className="skymap-navigation-actions">
        <button type="button" className="ghost button--small" onClick={onResetNavigationView}>
          Reset overview
        </button>
      </div>
      <p className="skymap-note">
        SkyMap uses staged scene-space scale bands. Solar, local-star, and deep-space contexts are explicit map
        contexts, not a claim of continuous physical scale.
      </p>
    </section>
  );
};

const SkyMapLayerRow: FC<{
  item: SkyMapLayerPanelItem;
  onSetLayerVisibility: (layerId: SkyLayerId, visible: boolean) => void;
}> = ({ item, onSetLayerVisibility }) => {
  const { definition, state, objectCount } = item;
  const canToggle = definition.status === "active";
  const status = canToggle ? (state.visible ? "Visible" : "Hidden") : layerStatusCopy[definition.status];
  const timeLabel = formatTimeBehavior(definition.time.behavior);
  const detail = canToggle
    ? `${objectCount} ${objectCount === 1 ? "object" : "objects"} · ${timeLabel}`
    : `${definition.description} · ${timeLabel}`;

  return (
    <button
      type="button"
      className={`skymap-layer-row ${state.visible ? "is-active" : ""}`}
      disabled={!canToggle}
      aria-pressed={canToggle ? state.visible : undefined}
      onClick={() => onSetLayerVisibility(definition.id, !state.visible)}
    >
      <span>{definition.label}</span>
      <strong>{status}</strong>
      <small>{detail}</small>
    </button>
  );
};

const SkyMapImageryPreview: FC<{ object: SkyObject }> = ({ object }) => {
  const [resolvedImage, setResolvedImage] = useState<ImageResult | null>(null);
  const [loadingAsset, setLoadingAsset] = useState(false);

  useEffect(() => {
    setResolvedImage(null);
    setLoadingAsset(false);
  }, [object.id]);

  if (!isDeepSkyObject(object)) return null;
  const imagery = object.scientific?.imagery?.find((image) => image.previewUrl) ?? object.scientific?.imagery?.at(0);
  if (!imagery?.previewUrl) return null;
  const imageUrl = resolvedImage?.imageUrl || imagery.previewUrl;
  const fullResUrl = resolvedImage?.fullRes || imagery.fullResUrl;

  const loadNasaAsset = async () => {
    if (!imagery.targetId || loadingAsset) return;
    setLoadingAsset(true);
    const result = await fetchImage(imagery.targetId);
    if (result.success) {
      setResolvedImage(result);
    }
    setLoadingAsset(false);
  };

  return (
    <figure className="skymap-imagery-card">
      <img src={imageUrl} alt={imagery.alt ?? `${object.name} imagery`} loading="lazy" />
      <figcaption>
        <strong>{imagery.label}</strong>
        <span>
          {imagery.credit ?? imagery.source}
          {imagery.targetId ? ` · NASA ID ${imagery.targetId}` : ""}
        </span>
        <span className="skymap-imagery-card__actions">
          {imagery.targetId ? (
            <button type="button" className="ghost button--small" onClick={loadNasaAsset} disabled={loadingAsset}>
              {resolvedImage ? "Asset loaded" : loadingAsset ? "Loading asset" : "Load NASA asset"}
            </button>
          ) : null}
          {fullResUrl ? (
            <a href={fullResUrl} target="_blank" rel="noreferrer">
              Open full image
            </a>
          ) : null}
        </span>
      </figcaption>
    </figure>
  );
};

const SkyMapObjectDetails: FC<{
  selectedObject: SkyObject | null;
  hoveredObject: SkyObject | null;
  relatedRecords: SkyObjectRegistryRecord[];
  timeState: SkyMapTimeState;
  onSelectRelatedRecord: (record: SkyObjectRegistryRecord) => void;
}> = ({
  selectedObject,
  hoveredObject,
  relatedRecords,
  timeState,
  onSelectRelatedRecord,
}) => {
  const object = selectedObject ?? hoveredObject;
  if (!object) {
    return (
      <p className="skymap-empty">
        Click a visible star, planet, moon, galaxy, nebula, or cluster to inspect its current map details.
      </p>
    );
  }

  return (
    <>
    <SkyMapImageryPreview object={object} />
    <dl className="skymap-object-stats">
      <div>
        <dt>Kind</dt>
        <dd>{formatObjectKind(object.kind)}</dd>
      </div>
      <div>
        <dt>Map frame</dt>
        <dd>{formatFrameLabel(object)}</dd>
      </div>
      <div>
        <dt>Map position</dt>
        <dd>{formatPosition(object)}</dd>
      </div>
      <div>
        <dt>Time model</dt>
        <dd>{object.time ? formatTimeBehavior(object.time.behavior) : "unspecified"}</dd>
      </div>
      {object.time?.behavior === "time-sensitive" ? (
        <div>
          <dt>Map time</dt>
          <dd>{formatDisplayDate(getSkyMapDate(timeState))}</dd>
        </div>
      ) : null}
      {object.time?.note && !isPlanetSkyObject(object) && !isMoonSkyObject(object) ? (
        <div>
          <dt>Model note</dt>
          <dd>{object.time.note}</dd>
        </div>
      ) : null}
      {isStarSkyObject(object) ? (
        <>
          <div>
            <dt>Distance</dt>
            <dd>
              {typeof object.scientific.distanceLy === "number"
                ? `${object.scientific.distanceLy.toFixed(2)} ly`
                : "Unknown"}
            </dd>
          </div>
          <div>
            <dt>Spectral type</dt>
            <dd>{object.scientific.spectralType ?? "Unknown"}</dd>
          </div>
          <div>
            <dt>Luminosity</dt>
            <dd>
              {typeof object.scientific.luminositySolar === "number"
                ? `${object.scientific.luminositySolar.toFixed(3)} Lsun`
                : "Unknown"}
            </dd>
          </div>
          <div>
            <dt>Temperature</dt>
            <dd>
              {typeof object.scientific.temperatureK === "number"
                ? `${object.scientific.temperatureK.toLocaleString()} K`
                : "Unknown"}
            </dd>
          </div>
        </>
      ) : null}
      {isPlanetSkyObject(object) ? (
        <>
          <div>
            <dt>Radius</dt>
            <dd>{formatOptionalNumber(object.scientific?.radiusKm, "km", 0)}</dd>
          </div>
          <div>
            <dt>Orbit</dt>
            <dd>{formatOptionalNumber(object.scientific?.semiMajorAxisAU, "AU", 2)}</dd>
          </div>
          <div>
            <dt>Orbital period</dt>
            <dd>{formatOptionalNumber(object.scientific?.orbitalPeriodDays, "days", 1)}</dd>
          </div>
          <div>
            <dt>Moons</dt>
            <dd>
              {typeof object.scientific?.moonCount === "number"
                ? `${object.scientific.moonCount}${object.scientific.ringSystem ? " · ring system" : ""}`
                : object.scientific?.ringSystem
                  ? "Ring system"
                  : "Unknown"}
            </dd>
          </div>
          {object.scientific?.facts?.slice(0, 2).map((fact) => (
            <div key={fact}>
              <dt>Fact</dt>
              <dd>{fact}</dd>
            </div>
          ))}
          {object.scientific?.approximation ? (
            <div>
              <dt>Scale note</dt>
              <dd>{object.scientific.approximation}</dd>
            </div>
          ) : null}
        </>
      ) : null}
      {isMoonSkyObject(object) ? (
        <>
          <div>
            <dt>Parent</dt>
            <dd>{object.scientific?.parentPlanetName ?? "Unknown planet"}</dd>
          </div>
          <div>
            <dt>Class</dt>
            <dd>{object.scientific?.moonClass ?? "moon"}</dd>
          </div>
          <div>
            <dt>Radius</dt>
            <dd>{formatOptionalNumber(object.scientific?.radiusKm, "km", 0)}</dd>
          </div>
          <div>
            <dt>Orbit distance</dt>
            <dd>{formatOptionalNumber(object.scientific?.orbitalDistanceKm, "km", 0)}</dd>
          </div>
          <div>
            <dt>Orbital period</dt>
            <dd>{formatOptionalNumber(object.scientific?.orbitalPeriodDays, "days", 2)}</dd>
          </div>
          {object.scientific?.facts?.slice(0, 2).map((fact) => (
            <div key={fact}>
              <dt>Fact</dt>
              <dd>{fact}</dd>
            </div>
          ))}
          {object.scientific?.approximation ? (
            <div>
              <dt>Scale note</dt>
              <dd>{object.scientific.approximation}</dd>
            </div>
          ) : null}
        </>
      ) : null}
      {isDeepSkyObject(object) ? (
        <>
          {object.scientific?.discoveryBlurb ? (
            <div>
              <dt>Why it matters</dt>
              <dd>{object.scientific.discoveryBlurb}</dd>
            </div>
          ) : null}
          <div>
            <dt>Class</dt>
            <dd>{formatObjectClass(object.scientific?.objectClass, formatObjectKind(object.kind))}</dd>
          </div>
          <div>
            <dt>Distance</dt>
            <dd>{formatLightYears(object.scientific?.distanceLy)}</dd>
          </div>
          <div>
            <dt>Constellation</dt>
            <dd>{object.scientific?.constellation ?? "Unknown"}</dd>
          </div>
          <div>
            <dt>Catalog</dt>
            <dd>{object.scientific?.catalogIds?.join(" / ") ?? "Seed catalog"}</dd>
          </div>
          {typeof object.scientific?.apparentMagnitude === "number" ? (
            <div>
              <dt>Apparent mag.</dt>
              <dd>{formatNumber(object.scientific.apparentMagnitude, 2)}</dd>
            </div>
          ) : null}
          {typeof object.scientific?.angularSizeArcMin === "number" ? (
            <div>
              <dt>Angular size</dt>
              <dd>{formatNumber(object.scientific.angularSizeArcMin, 1)} arcmin</dd>
            </div>
          ) : null}
          {object.scientific?.facts?.slice(0, 2).map((fact) => (
            <div key={fact}>
              <dt>Fact</dt>
              <dd>{fact}</dd>
            </div>
          ))}
          {object.scientific?.imagery?.at(0) ? (
            <div>
              <dt>Imagery</dt>
              <dd>
                {object.scientific.imagery[0].label} · {object.scientific.imagery[0].source}
              </dd>
            </div>
          ) : null}
          {object.scientific?.observationContext ? (
            <div>
              <dt>Context</dt>
              <dd>{object.scientific.observationContext}</dd>
            </div>
          ) : null}
          {object.scientific?.mapPlacementNote ? (
            <div>
              <dt>Map placement</dt>
              <dd>{object.scientific.mapPlacementNote}</dd>
            </div>
          ) : null}
        </>
      ) : null}
      <div>
        <dt>Source</dt>
        <dd>{formatSourceLabel(object)}</dd>
      </div>
      {object.importance ? (
        <div>
          <dt>Notability</dt>
          <dd>
            {object.importance.tier} · {Math.round(object.importance.score)}
            {object.importance.reasons.length ? ` · ${object.importance.reasons.slice(0, 2).join(", ")}` : ""}
          </dd>
        </div>
      ) : null}
    </dl>
    {relatedRecords.length ? (
      <div className="skymap-related">
        <span>Related jumps</span>
        <div>
          {relatedRecords.map((record) => (
            <button type="button" key={record.object.id} onClick={() => onSelectRelatedRecord(record)}>
              {record.object.name}
            </button>
          ))}
        </div>
      </div>
    ) : null}
    </>
  );
};

export const SkyMapControlRail: FC<SkyMapControlRailProps> = ({
  selectedObject,
  hoveredObject,
  viewportStatus,
  layers,
  searchQuery,
  searchResults,
  registryObjectCount,
  discoveryRecords,
  relatedRecords,
  filters,
  timeState,
  navigationState,
  onSetLayerVisibility,
  onFocusObject,
  onSearchQueryChange,
  onSelectSearchResult,
  onSelectDiscoveryRecord,
  onExploreRandom,
  onFilterChange,
  onResetFilters,
  onResetNavigationView,
  onToggleTimePlayback,
  onSetTimeSpeed,
  onSetTimeDate,
  onStepTime,
  onResetTimeToNow,
}) => (
  <aside className="skymap-rail" aria-label="SkyMap controls and object details">
    <SkyMapSearchPanel
      query={searchQuery}
      results={searchResults}
      registryObjectCount={registryObjectCount}
      onQueryChange={onSearchQueryChange}
      onSelectResult={onSelectSearchResult}
    />

    <SkyMapDiscoveryPanel
      records={discoveryRecords}
      onSelectRecord={onSelectDiscoveryRecord}
      onExploreRandom={onExploreRandom}
    />

    <SkyMapFilterPanel filters={filters} onFilterChange={onFilterChange} onResetFilters={onResetFilters} />

    <SkyMapNavigationPanel
      navigationState={navigationState}
      viewportStatus={viewportStatus}
      onResetNavigationView={onResetNavigationView}
    />

    <SkyMapTimePanel
      timeState={timeState}
      onToggleTimePlayback={onToggleTimePlayback}
      onSetTimeSpeed={onSetTimeSpeed}
      onSetTimeDate={onSetTimeDate}
      onStepTime={onStepTime}
      onResetTimeToNow={onResetTimeToNow}
    />

    <section className="skymap-panel">
      <div>
        <p className="eyebrow">LAYERS</p>
        <h2>Visible layers</h2>
      </div>
      <p className="skymap-note">
        Toggle active map layers. Hidden layers remain searchable and are restored when a result is selected.
      </p>
      <div className="skymap-layer-list">
        {layers.map((item) => (
          <SkyMapLayerRow key={item.definition.id} item={item} onSetLayerVisibility={onSetLayerVisibility} />
        ))}
      </div>
    </section>

    <section className="skymap-panel skymap-panel--object">
      <div>
        <p className="eyebrow">SELECTED OBJECT</p>
        <h2>{selectedObject?.name ?? hoveredObject?.name ?? "Nothing selected"}</h2>
      </div>
      {selectedObject ? (
        <div className="skymap-object-actions">
          <button type="button" className="ghost button--small" onClick={() => onFocusObject(selectedObject.id)}>
            Focus in viewport
          </button>
        </div>
      ) : null}
      <SkyMapObjectDetails
        selectedObject={selectedObject}
        hoveredObject={hoveredObject}
        relatedRecords={relatedRecords}
        timeState={timeState}
        onSelectRelatedRecord={onSelectDiscoveryRecord}
      />
    </section>

    <section className="skymap-panel skymap-panel--foundation">
      <p className="eyebrow">MAP MODEL</p>
      <p>
        SkyMap uses canonical objects, explicit layer visibility, staged scene-space navigation, and typed time
        behaviour. Exact ephemerides and streamed catalogs remain future work.
      </p>
      <span>
        {viewportStatus.activeLayerCount
          ? `${viewportStatus.activeLayerCount} active layer`
          : "No active layers visible"}
      </span>
    </section>
  </aside>
);
