import { FC, useEffect, useMemo, useRef, useState } from "react";
import ResultCard from "./ResultCard";
import type { SpaceImage } from "../../models/SpaceImage";
import { isBlockedCenter } from "../../utils/spaceFilter";

interface DropdownOption {
  value: string;
  label: string;
}

interface ResultsDropdownProps {
  label: string;
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
}

const ResultsDropdown: FC<ResultsDropdownProps> = ({ label, value, options, onChange }) => {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const currentLabel = options.find((option) => option.value === value)?.label ?? "All";

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  return (
    <div className="results__dropdown" ref={wrapperRef}>
      <span className="results__dropdown-label">{label}</span>
      <button
        type="button"
        className={`results__dropdown-trigger ${open ? "open" : ""}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{currentLabel}</span>
        <span className="results__dropdown-caret">▾</span>
      </button>
      {open && (
        <div className="results__dropdown-menu" role="listbox">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`results__dropdown-item ${option.value === value ? "active" : ""}`}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

interface ResultsPageProps {
  results: SpaceImage[];
  onSelect: (result: SpaceImage) => void;
  loadMore: () => void;
  hasMore: boolean;
  loading: boolean;
}

const sourceLabel = (value: string) => {
  switch (value) {
    case "nasa":
      return "NASA";
    case "sdss":
      return "SDSS";
    case "ps1":
      return "Pan-STARRS";
    default:
      return value.toUpperCase();
  }
};

const ResultsPage: FC<ResultsPageProps> = ({ results, onSelect, loadMore, hasMore, loading }) => {
  const MOBILE_LIMIT = 12;
  const MIN_YEAR = 1990;
  const MAX_YEAR = 2025;
  const [sortBy, setSortBy] = useState<"recent" | "oldest" | "title">("recent");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [missionFilter, setMissionFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [startYear, setStartYear] = useState(MIN_YEAR);
  const [endYear, setEndYear] = useState(MAX_YEAR);
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    const viewportWidth = Math.min(window.innerWidth, window.visualViewport?.width ?? window.innerWidth);
    const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    return coarsePointer || viewportWidth <= 900;
  });
  const [mobileLimit, setMobileLimit] = useState(MOBILE_LIMIT);

  const sourceOptions = useMemo(() => {
    const items = new Set<string>();
    results.forEach((result) => {
      const source = result.source ?? "nasa";
      if (source) {
        items.add(source);
      }
    });
    return Array.from(items).sort((a, b) => sourceLabel(a).localeCompare(sourceLabel(b)));
  }, [results]);

  useEffect(() => {
    if (sourceFilter !== "all" && !sourceOptions.includes(sourceFilter)) {
      setSourceFilter("all");
    }
  }, [sourceFilter, sourceOptions]);

  const missionOptions = useMemo(() => {
    const items = new Set<string>();
    results.forEach((result) => {
      const label = result.mission || result.instrument || result.center;
      if (label) {
        items.add(label);
      }
    });
    return Array.from(items)
      .filter((item) => !isBlockedCenter(item))
      .sort((a, b) => a.localeCompare(b));
  }, [results]);

  const yearOptions = useMemo(() => {
    const items = new Set<string>();
    results.forEach((result) => {
      const year = result.date?.slice(0, 4);
      if (year && /^\d{4}$/.test(year)) {
        items.add(year);
      }
    });
    return Array.from(items).sort((a, b) => Number(b) - Number(a));
  }, [results]);

  const missionDropdownOptions = useMemo<DropdownOption[]>(() => {
    return [{ value: "all", label: "All" }, ...missionOptions.map((item) => ({ value: item, label: item }))];
  }, [missionOptions]);

  const sourceDropdownOptions = useMemo<DropdownOption[]>(() => {
    return [{ value: "all", label: "All" }, ...sourceOptions.map((item) => ({ value: item, label: sourceLabel(item) }))];
  }, [sourceOptions]);

  const yearDropdownOptions = useMemo<DropdownOption[]>(() => {
    return [{ value: "all", label: "All" }, ...yearOptions.map((item) => ({ value: item, label: item }))];
  }, [yearOptions]);

  const sortDropdownOptions = useMemo<DropdownOption[]>(
    () => [
      { value: "recent", label: "Most recent" },
      { value: "oldest", label: "Oldest" },
      { value: "title", label: "A–Z" },
    ],
    [],
  );

  const filteredResults = useMemo(() => {
    let filtered = results;

    if (sourceFilter !== "all") {
      filtered = filtered.filter((result) => (result.source ?? "nasa") === sourceFilter);
    }

    if (missionFilter !== "all") {
      filtered = filtered.filter((result) => {
        const label = result.mission || result.instrument || result.center || "NASA Image Library";
        return label === missionFilter;
      });
    }

    if (yearFilter !== "all") {
      filtered = filtered.filter((result) => result.date?.startsWith(yearFilter));
    }

    filtered = filtered.filter((result) => {
      const yearString = result.date?.slice(0, 4);
      const yearValue = yearString ? Number(yearString) : NaN;
      if (!Number.isFinite(yearValue)) {
        return startYear === MIN_YEAR && endYear === MAX_YEAR;
      }
      return yearValue >= startYear && yearValue <= endYear;
    });

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sortBy === "title") {
        return a.title.localeCompare(b.title);
      }

      const dateA = Date.parse(a.date ?? "");
      const dateB = Date.parse(b.date ?? "");
      const safeA = Number.isFinite(dateA) ? dateA : 0;
      const safeB = Number.isFinite(dateB) ? dateB : 0;
      return sortBy === "recent" ? safeB - safeA : safeA - safeB;
    });

    return sorted;
  }, [endYear, missionFilter, results, sortBy, sourceFilter, startYear, yearFilter]);

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
  }, [MOBILE_LIMIT, endYear, isMobile, missionFilter, results.length, sortBy, sourceFilter, startYear, yearFilter]);

  if (!results.length) {
    return (
      <section className="results">
        <div className="results__header">
          <div>
            <p className="eyebrow">GALLERY</p>
            <h2>Observation results</h2>
            <p className="subtitle">No results found.</p>
          </div>
        </div>
      </section>
    );
  }

  const handleCardSelect = (item: SpaceImage) => {
    onSelect(item);
  };

  const totalCount = results.length;
  const filteredCount = filteredResults.length;
  const visibleResults = isMobile ? filteredResults.slice(0, mobileLimit) : filteredResults;
  const visibleCount = visibleResults.length;
  const countLabel =
    visibleCount === totalCount && filteredCount === totalCount
      ? `${visibleCount} observation${visibleCount === 1 ? "" : "s"} ready.`
      : visibleCount < filteredCount
        ? `Showing ${visibleCount} of ${filteredCount} observations.`
        : `Showing ${filteredCount} of ${totalCount} observations.`;

  return (
    <section className="results">
      <div className="results__header">
        <div>
          <p className="eyebrow">GALLERY</p>
          <h2>Observation results</h2>
          <p className="subtitle">{countLabel}</p>
        </div>
        <div className="results__controls">
          <ResultsDropdown
            label="Source"
            value={sourceFilter}
            options={sourceDropdownOptions}
            onChange={setSourceFilter}
          />
          <ResultsDropdown
            label="Mission"
            value={missionFilter}
            options={missionDropdownOptions}
            onChange={setMissionFilter}
          />
          <ResultsDropdown
            label="Year"
            value={yearFilter}
            options={yearDropdownOptions}
            onChange={setYearFilter}
          />
          <ResultsDropdown
            label="Sort"
            value={sortBy}
            options={sortDropdownOptions}
            onChange={(value) => setSortBy(value as typeof sortBy)}
          />
        </div>
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
                min={MIN_YEAR}
                max={MAX_YEAR}
                step="1"
                value={startYear}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setStartYear(Math.min(next, endYear));
                }}
              />
            </label>
            <label>
              To
              <input
                type="range"
                min={MIN_YEAR}
                max={MAX_YEAR}
                step="1"
                value={endYear}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setEndYear(Math.max(next, startYear));
                }}
              />
            </label>
          </div>
        </div>
      </div>

      {filteredCount === 0 ? (
        <p className="status">No results match your current filters.</p>
      ) : (
        <div className="results__grid">
          {visibleResults.map((result) => (
            <ResultCard key={result.id} item={result} onClick={handleCardSelect} />
          ))}
        </div>
      )}

      {isMobile && visibleCount < filteredCount && (
        <button
          type="button"
          className="results__more"
          onClick={() => setMobileLimit((prev) => Math.min(prev + MOBILE_LIMIT, filteredCount))}
        >
          Show more
        </button>
      )}

      {loading && <p className="status">Loading more...</p>}
      {!hasMore && (!isMobile || visibleCount >= filteredCount) && <p className="status">End of results.</p>}
    </section>
  );
};

export default ResultsPage;
