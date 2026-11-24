import { FC, useEffect, useMemo, useState } from "react";
import { Icon } from "../../shell/Icon";
import { placeDistanceLy, searchPlaces } from "../../shell/places";
import ResultCard from "./ResultCard";
import SegmentedControl, { type SegmentedControlOption } from "../ui/SegmentedControl";
import SelectMenu, { type SelectMenuOption } from "../ui/SelectMenu";
import type { SpaceImage } from "../../models/SpaceImage";
import type { DiscoverySession } from "../../models/DiscoverySession";
import type { ObservationCollection } from "../../models/ObservationCollection";
import type { SourceHealth, SourceHealthState } from "../../models/SourceStatus";
import {
  addToWorkingCollection,
  clearWorkingCollection,
  getCollectionImageKey,
  readWorkingCollection,
  removeFromWorkingCollection,
  writeWorkingCollection,
} from "../../utils/observationCollection";
import {
  FALLBACK_MAX_YEAR,
  FALLBACK_MIN_YEAR,
  dedupeResults,
  filterAndSortResults,
  getAvailableYearRange,
  getCollectionVisibilityLabel,
  getMissionOptions,
  getResultArchiveLabel,
  getResultKey,
  getResultSourceHost,
  getSourceOptions,
  getYearOptions,
  sourceLabel,
  type ResultsSortMode,
} from "../../utils/galleryResults";

interface ResultsPageProps {
  /** What this set of photographs is: the search, the wander session, or the saved collection. */
  heading?: string;
  query?: string;
  onBackToImages?: () => void;
  onSearch?: (query: string) => void;
  onOpenPlace?: (placeId: string) => void;
  results: SpaceImage[];
  onSelect: (result: SpaceImage) => void;
  onInspectCompareSet?: (items: SpaceImage[], selectedItem?: SpaceImage) => void;
  loadMore: () => void;
  hasMore: boolean;
  loading: boolean;
  discoverySession?: DiscoverySession | null;
  sourceStatus?: SourceHealth[];
}

const MOBILE_LIMIT = 12;
const COMPARE_LIMIT = 4;
type ResultsViewMode = "grid" | "list";
type ActiveFilterId = "query" | "source" | "mission" | "year" | "timeline";

interface ActiveFilterItem {
  id: ActiveFilterId;
  label: string;
  value: string;
  clearLabel: string;
}

const viewModeOptions: Array<SegmentedControlOption<ResultsViewMode>> = [
  { value: "grid", label: "Grid" },
  { value: "list", label: "List" },
];

const sourceStatusLabel = (status: SourceHealthState) => {
  switch (status) {
    case "loaded":
      return "Loaded";
    case "partial":
      return "Partial";
    case "empty":
      return "No hits";
    case "skipped":
      return "Skipped";
    case "unavailable":
      return "Unavailable";
    case "error":
      return "Error";
    default:
      return status;
  }
};

const formatCount = (count: number, singular: string, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`;

const formatSavedAt = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Saved locally";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
};

const ResultsPage: FC<ResultsPageProps> = ({
  results,
  onSelect,
  onInspectCompareSet,
  loadMore,
  hasMore,
  loading,
  discoverySession,
  sourceStatus,
  heading = "Photographs",
  query = "",
  onBackToImages,
  onSearch,
  onOpenPlace,
}) => {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [sortBy, setSortBy] = useState<ResultsSortMode>("recent");
  const [viewMode, setViewMode] = useState<ResultsViewMode>("grid");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [missionFilter, setMissionFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [resultQuery, setResultQuery] = useState("");
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [collection, setCollection] = useState<ObservationCollection>(() => readWorkingCollection());
  const [startYear, setStartYear] = useState(FALLBACK_MIN_YEAR);
  const [endYear, setEndYear] = useState(FALLBACK_MAX_YEAR);
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    const viewportWidth = Math.min(window.innerWidth, window.visualViewport?.width ?? window.innerWidth);
    const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    return coarsePointer || viewportWidth <= 900;
  });
  const [mobileLimit, setMobileLimit] = useState(MOBILE_LIMIT);
  const sourceStatusItems = sourceStatus ?? [];
  const collectionIds = useMemo(() => new Set(collection.items.map((item) => item.key)), [collection.items]);
  const collectionUpdatedAt = useMemo(() => {
    if (!collection.items.length) return "";
    const parsed = new Date(collection.updatedAt);
    if (Number.isNaN(parsed.getTime())) return "";
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(parsed);
  }, [collection.items.length, collection.updatedAt]);
  const collectionSourceSummary = useMemo(() => {
    const counts = new Map<string, number>();
    collection.items.forEach(({ image }) => {
      const source = image.source ?? "nasa";
      counts.set(source, (counts.get(source) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || sourceLabel(a[0]).localeCompare(sourceLabel(b[0])))
      .map(([source, count]) => `${sourceLabel(source)} ${count}`)
      .join(" · ");
  }, [collection.items]);
  const cleanedResults = useMemo(() => dedupeResults(results), [results]);
  const dedupedCount = Math.max(0, results.length - cleanedResults.length);
  const resultSourceSummary = useMemo(() => {
    const counts = new Map<string, number>();
    cleanedResults.forEach((image) => {
      const source = image.source ?? "nasa";
      counts.set(source, (counts.get(source) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || sourceLabel(a[0]).localeCompare(sourceLabel(b[0])))
      .map(([source, count]) => `${sourceLabel(source)} ${count}`)
      .join(" · ");
  }, [cleanedResults]);
  const qualitySummary = useMemo(() => {
    const counts = new Map<string, number>();
    cleanedResults.forEach((image) => {
      const label = image.metadataQuality?.label ?? "Unscored";
      counts.set(label, (counts.get(label) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([label, count]) => `${label} ${count}`)
      .join(" · ");
  }, [cleanedResults]);
  const yearRange = useMemo(() => getAvailableYearRange(cleanedResults), [cleanedResults]);
  const resultLookup = useMemo(() => {
    const lookup = new Map<string, SpaceImage>();
    cleanedResults.forEach((result) => lookup.set(getResultKey(result), result));
    return lookup;
  }, [cleanedResults]);

  // Until someone moves the timeline, it follows the full range of what the archives returned
  // (results arrive in stages: NASA first, then the sky surveys).
  const [timelineTouched, setTimelineTouched] = useState(false);
  useEffect(() => {
    setStartYear((prev) => (timelineTouched ? Math.max(yearRange.min, Math.min(prev, yearRange.max)) : yearRange.min));
    setEndYear((prev) => (timelineTouched ? Math.max(yearRange.min, Math.min(prev, yearRange.max)) : yearRange.max));
  }, [timelineTouched, yearRange.max, yearRange.min]);

  const sourceOptions = useMemo(() => {
    return getSourceOptions(cleanedResults);
  }, [cleanedResults]);

  useEffect(() => {
    if (sourceFilter !== "all" && !sourceOptions.includes(sourceFilter)) {
      setSourceFilter("all");
    }
  }, [sourceFilter, sourceOptions]);

  useEffect(() => {
    setCompareIds((prev) => prev.filter((id) => resultLookup.has(id)));
  }, [resultLookup]);

  const missionOptions = useMemo(() => {
    return getMissionOptions(cleanedResults);
  }, [cleanedResults]);

  const yearOptions = useMemo(() => {
    return getYearOptions(cleanedResults);
  }, [cleanedResults]);

  const missionDropdownOptions = useMemo<SelectMenuOption<string>[]>(() => {
    return [{ value: "all", label: "All" }, ...missionOptions.map((item) => ({ value: item, label: item }))];
  }, [missionOptions]);

  const sourceDropdownOptions = useMemo<SelectMenuOption<string>[]>(() => {
    return [{ value: "all", label: "All" }, ...sourceOptions.map((item) => ({ value: item, label: sourceLabel(item) }))];
  }, [sourceOptions]);

  const yearDropdownOptions = useMemo<SelectMenuOption<string>[]>(() => {
    return [{ value: "all", label: "All" }, ...yearOptions.map((item) => ({ value: item, label: item }))];
  }, [yearOptions]);

  const sortDropdownOptions = useMemo<SelectMenuOption<ResultsSortMode>[]>(
    () => [
      { value: "recent", label: "Most recent" },
      { value: "oldest", label: "Oldest" },
      { value: "title", label: "A–Z" },
    ],
    [],
  );

  const filteredResults = useMemo(() => {
    return filterAndSortResults(cleanedResults, {
      resultQuery,
      sourceFilter,
      missionFilter,
      yearFilter,
      startYear,
      endYear,
      yearRange,
      sortBy,
    });
  }, [cleanedResults, endYear, missionFilter, resultQuery, sortBy, sourceFilter, startYear, yearFilter, yearRange.max, yearRange.min]);

  const activeFilterItems = useMemo<ActiveFilterItem[]>(() => {
    const query = resultQuery.trim();
    return [
      query
        ? {
            id: "query" as const,
            label: "Query",
            value: query,
            clearLabel: `Clear query filter ${query}`,
          }
        : null,
      sourceFilter !== "all"
        ? {
            id: "source" as const,
            label: "Source",
            value: sourceLabel(sourceFilter),
            clearLabel: `Clear source filter ${sourceLabel(sourceFilter)}`,
          }
        : null,
      missionFilter !== "all"
        ? {
            id: "mission" as const,
            label: "Mission",
            value: missionFilter,
            clearLabel: `Clear mission filter ${missionFilter}`,
          }
        : null,
      yearFilter !== "all"
        ? {
            id: "year" as const,
            label: "Year",
            value: yearFilter,
            clearLabel: `Clear year filter ${yearFilter}`,
          }
        : null,
      startYear !== yearRange.min || endYear !== yearRange.max
        ? {
            id: "timeline" as const,
            label: "Timeline",
            value: `${startYear}-${endYear}`,
            clearLabel: `Clear timeline filter ${startYear}-${endYear}`,
          }
        : null,
    ].filter((item): item is ActiveFilterItem => Boolean(item));
  }, [endYear, missionFilter, resultQuery, sourceFilter, startYear, yearFilter, yearRange.max, yearRange.min]);

  const activeFilterSummary = useMemo(() => {
    return activeFilterItems.length
      ? activeFilterItems.map((item) => `${item.label}: ${item.value}`).join(" · ")
      : "No active filters";
  }, [activeFilterItems]);

  useEffect(() => {
    if (isMobile) {
      return;
    }
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
      if (scrollHeight - scrollTop - clientHeight < 300 && hasMore && !loading) {
        loadMore();
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [hasMore, isMobile, loading, loadMore, results.length]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia?.("(max-width: 900px)");
    const update = () => {
      const viewportWidth = Math.min(window.innerWidth, window.visualViewport?.width ?? window.innerWidth);
      const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false;
      const mobile = coarsePointer || viewportWidth <= 900 || (media ? media.matches : false);
      setIsMobile(mobile);
    };
    update();
    media?.addEventListener?.("change", update);
    window.addEventListener("resize", update);
    return () => {
      media?.removeEventListener?.("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  useEffect(() => {
    if (isMobile) {
      setMobileLimit(MOBILE_LIMIT);
    }
  }, [
    cleanedResults.length,
    endYear,
    isMobile,
    missionFilter,
    resultQuery,
    sortBy,
    sourceFilter,
    startYear,
    yearFilter,
  ]);

  const resetFilters = () => {
    setResultQuery("");
    setSourceFilter("all");
    setMissionFilter("all");
    setYearFilter("all");
    setStartYear(yearRange.min);
    setEndYear(yearRange.max);
  };

  const clearActiveFilter = (id: ActiveFilterId) => {
    switch (id) {
      case "query":
        setResultQuery("");
        break;
      case "source":
        setSourceFilter("all");
        break;
      case "mission":
        setMissionFilter("all");
        break;
      case "year":
        setYearFilter("all");
        break;
      case "timeline":
        setStartYear(yearRange.min);
        setEndYear(yearRange.max);
        break;
      default:
        break;
    }
  };

  const persistCollection = (next: ObservationCollection) => {
    setCollection(next);
    writeWorkingCollection(next);
  };

  const toggleCollection = (item: SpaceImage) => {
    const key = getCollectionImageKey(item);
    const next = collectionIds.has(key)
      ? removeFromWorkingCollection(collection, key)
      : addToWorkingCollection(collection, item);
    persistCollection(next);
  };

  const saveVisibleResults = (items: SpaceImage[]) => {
    if (!items.length) return;
    const next = items.reduce((current, item) => addToWorkingCollection(current, item), collection);
    persistCollection(next);
  };

  const clearCollection = () => {
    persistCollection(clearWorkingCollection(collection));
  };

  const renderSourceHealth = () => {
    if (!sourceStatusItems.length) return null;

    return (
      <aside className="results__source-health" aria-label="Source availability">
        <div className="results__source-health-header">
          <p className="eyebrow">SOURCE STATUS</p>
          <span>{sourceStatusItems.length} archive{sourceStatusItems.length === 1 ? "" : "s"} checked</span>
        </div>
        <div className="results__source-health-grid">
          {sourceStatusItems.map((item) => (
            <div
              key={item.source}
              className={`results__source-health-item results__source-health-item--${item.status}`}
            >
              <span className="results__source-dot" aria-hidden="true" />
              <strong>{item.label}</strong>
              <span>{sourceStatusLabel(item.status)}</span>
              <em>
                {item.count} hit{item.count === 1 ? "" : "s"}
                {item.hasMore ? " · more available" : ""}
              </em>
              {item.message && <small>{item.message}</small>}
            </div>
          ))}
        </div>
      </aside>
    );
  };

  const handleCardSelect = (item: SpaceImage) => {
    onSelect(item);
  };

  const toggleCompare = (item: SpaceImage) => {
    const key = getResultKey(item);
    setCompareIds((prev) => {
      if (prev.includes(key)) {
        return prev.filter((id) => id !== key);
      }
      if (prev.length >= COMPARE_LIMIT) {
        return prev;
      }
      return [...prev, key];
    });
  };

  const inspectCompareItem = (item: SpaceImage, items: SpaceImage[]) => {
    if (onInspectCompareSet && items.length > 1) {
      onInspectCompareSet(items, item);
      return;
    }
    onSelect(item);
  };

  const totalCount = cleanedResults.length;
  const filteredCount = filteredResults.length;
  const visibleResults = isMobile ? filteredResults.slice(0, mobileLimit) : filteredResults;
  const visibleCount = visibleResults.length;
  const compareItems = compareIds.map((id) => resultLookup.get(id)).filter((item): item is SpaceImage => Boolean(item));
  const visibleCompareCandidates = visibleResults.slice(0, COMPARE_LIMIT);
  const resultKeys = useMemo(() => new Set(cleanedResults.map(getResultKey)), [cleanedResults]);
  const filteredResultKeys = useMemo(() => new Set(filteredResults.map(getResultKey)), [filteredResults]);
  const visibleResultKeys = useMemo(() => new Set(visibleResults.map(getResultKey)), [visibleResults]);
  const compareFull = compareItems.length >= COMPARE_LIMIT;
  const canCompareVisible = visibleCompareCandidates.length >= 2;
  const stageVisibleCompare = () => {
    if (!canCompareVisible) return;
    setCompareIds(visibleCompareCandidates.map(getResultKey));
  };
  const hasActiveFilters = activeFilterItems.length > 0;
  const countLabel =
    visibleCount === totalCount && filteredCount === totalCount
      ? `${visibleCount} observation${visibleCount === 1 ? "" : "s"} ready.`
      : visibleCount < filteredCount
        ? `Showing ${visibleCount} of ${filteredCount} observations.`
        : `Showing ${filteredCount} of ${totalCount} observations.`;
  const sessionStartedAt = useMemo(() => {
    if (!discoverySession) return "";
    const parsed = new Date(discoverySession.createdAt);
    if (Number.isNaN(parsed.getTime())) return "";
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(parsed);
  }, [discoverySession]);
  const sourceHealthSummary = useMemo(() => {
    if (!sourceStatusItems.length) {
      return collection.items.length ? "Local collection" : resultSourceSummary || "No source metadata";
    }
    const returned = sourceStatusItems.filter((item) => item.count > 0).length;
    const issues = sourceStatusItems.filter((item) => item.status === "error" || item.status === "unavailable").length;
    const partial = sourceStatusItems.filter((item) => item.status === "partial").length;
    const hitCount = sourceStatusItems.reduce((total, item) => total + item.count, 0);
    const issueText = issues ? ` · ${formatCount(issues, "issue")}` : partial ? ` · ${formatCount(partial, "partial archive")}` : "";
    return `${returned}/${sourceStatusItems.length} archives · ${formatCount(hitCount, "hit")}${issueText}`;
  }, [collection.items.length, resultSourceSummary, sourceStatusItems]);
  const compareSummary =
    compareItems.length >= 2
      ? `${compareItems.length}/${COMPARE_LIMIT} ready`
      : compareItems.length === 1
        ? "1 selected · pick one more"
        : "None selected";

  const researchBriefItems = [
    {
      label: "Records",
      value: `${totalCount} cleaned`,
      detail: `${results.length} raw${dedupedCount ? ` · ${dedupedCount} duplicate${dedupedCount === 1 ? "" : "s"} hidden` : ""}`,
    },
    {
      label: "Visible",
      value: `${visibleCount}/${filteredCount}`,
      detail: activeFilterSummary,
    },
    {
      label: "Timeline",
      value: `${startYear}-${endYear}`,
      detail: yearRange.min === yearRange.max ? `${yearRange.min} only` : `available ${yearRange.min}-${yearRange.max}`,
    },
    {
      label: "Source status",
      value: sourceHealthSummary,
      detail: resultSourceSummary || "No source mix yet",
    },
    {
      label: "Metadata quality",
      value: qualitySummary || "Unscored",
      detail: "Card badges use the same quality score",
    },
    {
      label: "Workspace",
      value: `${collection.items.length} saved`,
      detail: compareSummary,
    },
  ];

  const renderCollectionTray = (itemsToSave: SpaceImage[] = visibleResults) => {
    if (!collection.items.length) return null;
    const previewItems = collection.items.slice(0, 6);
    const visibleSavedCount = collection.items.filter((item) => visibleResultKeys.has(item.key)).length;
    const hiddenPreviewCount = Math.max(0, collection.items.length - previewItems.length);

    return (
      <aside className="results__collection-tray" aria-label="Working collection">
        <div className="results__collection-header">
          <div>
            <p className="eyebrow">WORKING COLLECTION</p>
            <h3>{collection.items.length} saved observation{collection.items.length === 1 ? "" : "s"}</h3>
            <p className="subtitle">
              {collectionSourceSummary || "Saved locally"}
              {collectionUpdatedAt ? ` · Updated ${collectionUpdatedAt}` : ""}
            </p>
            <div className="results__collection-stats" aria-label="Collection visibility">
              <span>{visibleSavedCount === 1 ? "1 visible now" : `${visibleSavedCount} visible now`}</span>
              <span>
                {collection.items.length - visibleSavedCount === 1
                  ? "1 saved off-view"
                  : `${collection.items.length - visibleSavedCount} saved off-view`}
              </span>
              {hiddenPreviewCount > 0 && <span>{formatCount(hiddenPreviewCount, "more saved item")}</span>}
            </div>
          </div>
          <div className="results__collection-actions">
            <button type="button" className="ghost button--small" onClick={() => onSelect(collection.items[0].image)}>
              Open newest
            </button>
            {itemsToSave.length > 0 && (
              <button type="button" className="ghost button--small" onClick={() => saveVisibleResults(itemsToSave)}>
                Save visible
              </button>
            )}
            <button type="button" className="ghost button--small" onClick={clearCollection}>
              Clear
            </button>
          </div>
        </div>
        <div className="results__collection-items">
          {previewItems.map(({ key, image, savedAt }, index) => {
            const thumbnail = image.thumbnailUrl || image.imageUrl;
            const archiveLabel = getResultArchiveLabel(image);
            const sourceHost = getResultSourceHost(image);
            const visibilityLabel = getCollectionVisibilityLabel(key, visibleResultKeys, filteredResultKeys, resultKeys);
            return (
              <div className="results__collection-item" key={key}>
                <button type="button" className="results__collection-open" onClick={() => onSelect(image)}>
                  <img src={thumbnail} alt="" loading="lazy" />
                  <span className="results__collection-copy">
                    <strong>{image.title}</strong>
                    <em>{image.mission || image.instrument || image.center || sourceLabel(image.source ?? "nasa")}</em>
                    <small>
                      {archiveLabel} · {sourceHost}
                    </small>
                    <span className="results__collection-tags">
                      <b>{index === 0 ? "Newest" : formatSavedAt(savedAt)}</b>
                      <b>{visibilityLabel}</b>
                      <b>{sourceLabel(image.source ?? "nasa")}</b>
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="results__collection-remove"
                  onClick={() => persistCollection(removeFromWorkingCollection(collection, key))}
                  aria-label={`Remove ${image.title} from working collection`}
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      </aside>
    );
  };

  const place = query ? searchPlaces(query, 1)[0] ?? null : null;
  const placeMatches = place && query.trim().toLowerCase().replace(/\s+/g, " ").length >= 3;
  const placeDistance = place ? placeDistanceLy(place) : undefined;

  const head = (
    <header className="rs-head">
      <div className="rs-head__crumbs">
        {onBackToImages ? (
          <button type="button" className="sv-btn sv-btn--quiet sv-btn--small" onClick={onBackToImages}>
            <Icon name="back" size={14} /> Images
          </button>
        ) : null}
      </div>
      <div className="rs-head__title">
        <p className="sv-eyebrow">{discoverySession ? "Wandering" : query ? "Photographs of" : "Photographs"}</p>
        <h1 className="sv-serif">{heading}</h1>
        <p className="rs-head__meta">
          {loading && !totalCount ? "Searching NASA, SDSS and Pan-STARRS…" : countLabel}
          {sourceStatusItems.length ? <span> · {sourceHealthSummary}</span> : null}
          {dedupedCount > 0 ? <span> · {dedupedCount} near-duplicate{dedupedCount === 1 ? "" : "s"} hidden</span> : null}
        </p>
      </div>
      {placeMatches && place && onOpenPlace ? (
        <button type="button" className="rs-place" onClick={() => onOpenPlace(place.id)}>
          <span className="rs-place__orb" aria-hidden="true" />
          <span>
            <small>In the universe</small>
            <strong>Fly to {place.name}</strong>
            <em>{[place.blurb, placeDistance !== undefined ? (placeDistance < 0.01 ? `${(placeDistance * 63241).toFixed(1)} AU` : `${Math.round(placeDistance).toLocaleString("en-US")} ly`) : null].filter(Boolean).join(" · ")}</em>
          </span>
          <Icon name="fly" size={18} />
        </button>
      ) : null}
    </header>
  );

  if (!results.length) {
    return (
      <section className="results rs">
        {head}
        {loading ? (
          <div className="rs-grid rs-grid--loading" aria-busy="true" aria-label="Loading photographs">
            {Array.from({ length: 12 }, (_, index) => (
              <span key={index} className="im-skeleton" style={{ aspectRatio: index % 3 === 0 ? "4 / 5" : index % 3 === 1 ? "4 / 3" : "1 / 1" }} />
            ))}
          </div>
        ) : (
          <div className="rs-empty">
            <h2 className="sv-serif">No photographs found</h2>
            <p>The archives had nothing for this search. Try a broader name, a catalogue number such as M42, or one of these:</p>
            <div className="im-chips">
              {["Carina Nebula", "Andromeda Galaxy", "Saturn", "Pillars of Creation", "Jupiter", "deep field"].map((item) => (
                <button key={item} type="button" className="sv-chip" onClick={() => onSearch?.(item)}>
                  {item}
                </button>
              ))}
            </div>
          </div>
        )}
        {renderSourceHealth()}
        {renderCollectionTray([])}
      </section>
    );
  }

  return (
    <section className={`results rs${compareItems.length ? " has-compare" : ""}`}>
      {head}

      {discoverySession && (
        <aside className="results__session rs-session" aria-label="Discovery session">
          <p className="rs-session__summary">{discoverySession.summary}</p>
          <div className="results__session-themes" aria-label="Session themes">
            {discoverySession.themes.slice(0, 6).map((theme) => (
              <span key={theme}>{theme}</span>
            ))}
          </div>
          <div className="results__session-meta">
            <span>{discoverySession.resultCount} picks</span>
            <span>
              {discoverySession.batchCount} batch{discoverySession.batchCount === 1 ? "" : "es"}
            </span>
            {sessionStartedAt && <span>Started {sessionStartedAt}</span>}
          </div>
          <div className="results__session-sources" aria-label="Session source mix">
            {discoverySession.sourceMix.map((item) => (
              <span key={item.source}>
                {item.label} {item.count}
              </span>
            ))}
          </div>
        </aside>
      )}

      <div className="rs-toolbar" role="toolbar" aria-label="Filter and arrange photographs">
        <label className="rs-find">
          <Icon name="search" size={15} />
          <span className="sv-sr">Find in results</span>
          <input
            id="results-query"
            type="search"
            value={resultQuery}
            onChange={(event) => setResultQuery(event.target.value)}
            placeholder="Filter these photographs"
          />
        </label>
        <div className="results__controls rs-controls">
          <SelectMenu
            label="Archive"
            value={sourceFilter}
            options={sourceDropdownOptions}
            onChange={setSourceFilter}
            className="results__dropdown"
            labelClassName="results__dropdown-label"
            triggerClassName="results__dropdown-trigger"
            caretClassName="results__dropdown-caret"
            menuClassName="results__dropdown-menu"
            itemClassName="results__dropdown-item"
          />
          <SelectMenu
            label="Mission"
            value={missionFilter}
            options={missionDropdownOptions}
            onChange={setMissionFilter}
            className="results__dropdown"
            labelClassName="results__dropdown-label"
            triggerClassName="results__dropdown-trigger"
            caretClassName="results__dropdown-caret"
            menuClassName="results__dropdown-menu"
            itemClassName="results__dropdown-item"
          />
          <SelectMenu
            label="Year"
            value={yearFilter}
            options={yearDropdownOptions}
            onChange={setYearFilter}
            className="results__dropdown"
            labelClassName="results__dropdown-label"
            triggerClassName="results__dropdown-trigger"
            caretClassName="results__dropdown-caret"
            menuClassName="results__dropdown-menu"
            itemClassName="results__dropdown-item"
          />
          <SelectMenu
            label="Sort"
            value={sortBy}
            options={sortDropdownOptions}
            onChange={setSortBy}
            className="results__dropdown"
            labelClassName="results__dropdown-label"
            triggerClassName="results__dropdown-trigger"
            caretClassName="results__dropdown-caret"
            menuClassName="results__dropdown-menu"
            itemClassName="results__dropdown-item"
          />
        </div>
        <div className="rs-toolbar__end">
          <SegmentedControl value={viewMode} options={viewModeOptions} onChange={setViewMode} ariaLabel="Gallery view" className="results__view-mode" />
          <button type="button" className={`sv-btn sv-btn--small${detailsOpen ? " is-on" : ""}`} onClick={() => setDetailsOpen((value) => !value)} aria-expanded={detailsOpen}>
            <Icon name="settings" size={14} /> Timeline & sources
          </button>
          <button type="button" className="sv-btn sv-btn--small results__save-visible" onClick={() => saveVisibleResults(visibleResults)} disabled={!visibleResults.length}>
            <Icon name="star" size={14} /> Save visible
          </button>
          <button type="button" className="sv-btn sv-btn--small results__compare-visible" onClick={stageVisibleCompare} disabled={!canCompareVisible}>
            <Icon name="compare" size={14} /> Compare visible
          </button>
        </div>
      </div>

      {hasActiveFilters && (
        <div className="results__active-filters" aria-label="Active Gallery filters">
          <span className="results__active-filters-label">Active filters</span>
          <div className="results__active-filter-list">
            {activeFilterItems.map((item) => (
              <button type="button" className="results__active-filter" onClick={() => clearActiveFilter(item.id)} aria-label={item.clearLabel} key={item.id}>
                <em>{item.label}</em>
                <strong>{item.value}</strong>
                <span aria-hidden="true">×</span>
              </button>
            ))}
            <button type="button" className="results__active-filter-clear results__reset" onClick={resetFilters}>
              Clear all
            </button>
          </div>
        </div>
      )}

      {detailsOpen ? (
        <div className="rs-details">
          <div className="results__timeline">
            <div className="results__timeline-header">
              <span className="results__timeline-label">Timeline</span>
              <span className="results__timeline-range">
                {startYear}–{endYear}
              </span>
            </div>
            <div className="results__timeline-inputs">
              <label>
                From
                <input
                  type="range"
                  min={yearRange.min}
                  max={yearRange.max}
                  step="1"
                  value={startYear}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setTimelineTouched(true);
                    setStartYear(Math.min(next, endYear));
                  }}
                />
              </label>
              <label>
                To
                <input
                  type="range"
                  min={yearRange.min}
                  max={yearRange.max}
                  step="1"
                  value={endYear}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setTimelineTouched(true);
                    setEndYear(Math.max(next, startYear));
                  }}
                />
              </label>
            </div>
          </div>
          <aside className="results__research-brief" aria-label="Gallery research brief">
            <dl className="results__research-brief-grid">
              {researchBriefItems.map((item) => (
                <div key={item.label}>
                  <dt>{item.label}</dt>
                  <dd>{item.value}</dd>
                  <span>{item.detail}</span>
                </div>
              ))}
            </dl>
          </aside>
          {renderSourceHealth()}
        </div>
      ) : null}

      {filteredCount === 0 ? (
        <div className="rs-empty">
          <p>No photographs match these filters.</p>
          <button type="button" className="sv-btn sv-btn--small" onClick={resetFilters}>
            Clear filters
          </button>
        </div>
      ) : (
        <div className={`results__grid rs-grid results__grid--${viewMode}`}>
          {visibleResults.map((result) => (
            <ResultCard
              key={getResultKey(result)}
              item={result}
              onClick={handleCardSelect}
              variant={viewMode}
              compareSelected={compareIds.includes(getResultKey(result))}
              compareDisabled={compareFull}
              onToggleCompare={toggleCompare}
              contextBadges={discoverySession?.rationaleById[getResultKey(result)]?.slice(0, 2)}
              collectionSelected={collectionIds.has(getResultKey(result))}
              onToggleCollection={toggleCollection}
            />
          ))}
        </div>
      )}

      {isMobile && visibleCount < filteredCount && (
        <button type="button" className="sv-btn results__more" onClick={() => setMobileLimit((prev) => Math.min(prev + MOBILE_LIMIT, filteredCount))}>
          Show more
        </button>
      )}

      {loading && <p className="status rs-status">Loading more photographs…</p>}
      {!hasMore && (!isMobile || visibleCount >= filteredCount) && <p className="status rs-status">That's everything the archives returned.</p>}

      {renderCollectionTray()}

      {compareItems.length > 0 && (
        <aside className="results__compare-tray rs-compare" aria-label="Compare tray">
          <div className="results__compare-items">
            {compareItems.map((item) => (
              <div className="results__compare-item" key={getResultKey(item)}>
                <button type="button" className="results__compare-open" onClick={() => inspectCompareItem(item, compareItems)} title={item.title}>
                  <img src={item.thumbnailUrl || item.imageUrl} alt={item.title} loading="lazy" />
                </button>
                <button type="button" className="results__compare-remove" onClick={() => toggleCompare(item)} aria-label={`Remove ${item.title} from compare tray`}>
                  <Icon name="close" size={12} />
                </button>
              </div>
            ))}
          </div>
          <p>
            <strong>
              {compareItems.length}/{COMPARE_LIMIT}
            </strong>{" "}
            {compareItems.length === 1 ? "selected · pick another" : "ready to compare"}
          </p>
          <div className="results__compare-actions">
            <button type="button" className="sv-btn sv-btn--small sv-btn--primary" onClick={() => inspectCompareItem(compareItems[0], compareItems)}>
              {compareItems.length === 1 ? "Open" : "Compare side by side"}
            </button>
            <button type="button" className="sv-btn sv-btn--small sv-btn--quiet" onClick={() => setCompareIds([])}>
              Clear
            </button>
          </div>
        </aside>
      )}
    </section>
  );
};

export default ResultsPage;
