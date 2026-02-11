import { useEffect, useMemo, useRef, useState, type FC, type FormEvent, type KeyboardEvent } from "react";

type SuggestionKind = "recent" | "suggestion" | "category";

interface SuggestionItem {
  label: string;
  value: string;
  kind: SuggestionKind;
}

interface SearchBarProps {
  query: string;
  setQuery: (value: string) => void;
  source: string;
  setSource: (value: string) => void;
  sourceOptions: Array<{ value: string; label: string }>;
  onSearch: (value?: string) => void;
  suggestions: string[];
  categories: Array<{ label: string; query: string }>;
}

// Input + CTA to kick off JWST queries.
const SearchBar: FC<SearchBarProps> = ({
  query,
  setQuery,
  source,
  setSource,
  sourceOptions,
  onSearch,
  suggestions,
  categories,
}) => {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const blurTimeoutRef = useRef<number | null>(null);
  const sourceRef = useRef<HTMLDivElement | null>(null);
  const RECENT_KEY = "spaceviewer.recentSearches";
  const MAX_RECENT = 6;

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(RECENT_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setRecentSearches(parsed.filter((item) => typeof item === "string"));
        }
      }
    } catch (error) {
      console.warn("Unable to load recent searches", error);
    }
  }, []);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!sourceRef.current) return;
      if (!sourceRef.current.contains(event.target as Node)) {
        setShowSources(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filteredSuggestions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const pool = suggestions.length ? suggestions : [];
    if (!normalized) {
      return pool.slice(0, 6);
    }
    return pool.filter((item) => item.toLowerCase().includes(normalized)).slice(0, 6);
  }, [query, suggestions]);

  const popularCategories = useMemo(() => categories.slice(0, 6), [categories]);

  const categoryMatches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return popularCategories;
    }
    return categories.filter(
      (category) =>
        category.label.toLowerCase().includes(normalized) || category.query.toLowerCase().includes(normalized),
    );
  }, [categories, popularCategories, query]);

  const recentMatches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return recentSearches;
    }
    return recentSearches.filter((item) => item.toLowerCase().includes(normalized));
  }, [query, recentSearches]);

  const suggestionGroups = useMemo(() => {
    const used = new Set<string>();
    const groups: Array<{ title: string; items: SuggestionItem[] }> = [];

    if (recentMatches.length) {
      const uniqueRecent = recentMatches.filter((item) => {
        const key = item.toLowerCase();
        if (used.has(key)) return false;
        used.add(key);
        return true;
      });
      if (uniqueRecent.length) {
        groups.push({
          title: "Recent",
          items: uniqueRecent.map((item) => ({ label: item, value: item, kind: "recent" })),
        });
      }
    }

    if (categoryMatches.length) {
      const uniqueCategories = categoryMatches.filter((item) => {
        const key = `category:${item.query.toLowerCase()}`;
        if (used.has(key)) return false;
        used.add(key);
        return true;
      });
      if (uniqueCategories.length) {
        groups.push({
          title: query.trim() ? "Categories" : "Popular categories",
          items: uniqueCategories.map((item) => ({ label: item.label, value: item.query, kind: "category" })),
        });
      }
    }

    if (filteredSuggestions.length) {
      const uniqueSuggestions = filteredSuggestions.filter((item) => {
        const key = item.toLowerCase();
        if (used.has(key)) return false;
        used.add(key);
        return true;
      });
      if (uniqueSuggestions.length) {
        groups.push({
          title: query.trim() ? "Keyword matches" : "Suggestions",
          items: uniqueSuggestions.map((item) => ({ label: item, value: item, kind: "suggestion" })),
        });
      }
    }

    return groups;
  }, [categoryMatches, filteredSuggestions, query, recentMatches]);

  const flatSuggestions = useMemo(() => suggestionGroups.flatMap((group) => group.items), [suggestionGroups]);

  const pushRecent = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setRecentSearches((prev) => {
      const next = [trimmed, ...prev.filter((item) => item.toLowerCase() !== trimmed.toLowerCase())].slice(0, MAX_RECENT);
      try {
        window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch (error) {
        console.warn("Unable to save recent searches", error);
      }
      return next;
    });
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    pushRecent(query);
    onSearch(query);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!showSuggestions) {
        setShowSuggestions(true);
      }
      if (!flatSuggestions.length) {
        return;
      }
      setActiveIndex((prev) => {
        if (event.key === "ArrowDown") {
          return prev + 1 >= flatSuggestions.length ? 0 : prev + 1;
        }
        return prev - 1 < 0 ? flatSuggestions.length - 1 : prev - 1;
      });
      return;
    }

    if (event.key === "Escape") {
      setShowSuggestions(false);
      setActiveIndex(-1);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (showSuggestions && activeIndex >= 0 && flatSuggestions[activeIndex]) {
        handleSuggestionSelect(flatSuggestions[activeIndex]);
        return;
      }
      pushRecent(query);
      onSearch(query);
    }
  };

  const handleFocus = () => {
    if (blurTimeoutRef.current) {
      window.clearTimeout(blurTimeoutRef.current);
    }
    setShowSuggestions(true);
    setShowCategories(false);
    setShowSources(false);
  };

  const handleBlur = () => {
    blurTimeoutRef.current = window.setTimeout(() => {
      setShowSuggestions(false);
    }, 120);
  };

  const handleSuggestionSelect = (item: SuggestionItem | string) => {
    const value = typeof item === "string" ? item : item.value;
    const kind = typeof item === "string" ? "suggestion" : item.kind;
    if (kind === "category") {
      handleCategorySelect(value);
      return;
    }
    setQuery(value);
    setShowSuggestions(false);
    setShowCategories(false);
    setShowSources(false);
    pushRecent(value);
    onSearch(value);
  };

  const handleCategorySelect = (value: string) => {
    setQuery(value);
    setShowSuggestions(false);
    setShowCategories(false);
    setShowSources(false);
    pushRecent(value);
    onSearch(value);
  };

  const activeSourceLabel =
    sourceOptions.find((option) => option.value === source)?.label ?? sourceOptions[0]?.label ?? "All sources";

  const renderMatch = (label: string) => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return label;
    }
    const index = label.toLowerCase().indexOf(normalized);
    if (index === -1) {
      return label;
    }
    const before = label.slice(0, index);
    const match = label.slice(index, index + normalized.length);
    const after = label.slice(index + normalized.length);
    return (
      <>
        {before}
        <span className="search-bar__match">{match}</span>
        {after}
      </>
    );
  };

  return (
    <form className="search-bar" onSubmit={handleSubmit}>
      <div className="search-bar__field">
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(-1);
            setShowSuggestions(true);
          }}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder="Search missions, targets, or objects..."
          aria-label="Search missions, targets, or objects"
        />
        {showSuggestions && flatSuggestions.length > 0 && (
          <div className="search-bar__suggestions">
            {suggestionGroups.map((group) => {
              let indexOffset = -1;
              return (
              <div key={group.title} className="search-bar__suggestions-group">
                <p className="eyebrow">{group.title}</p>
                <div className="search-bar__suggestions-list">
                  {group.items.map((item) => {
                    indexOffset = flatSuggestions.indexOf(item);
                    const isActive = indexOffset === activeIndex;
                    return (
                      <button
                        key={`${group.title}-${item.value}-${item.kind}`}
                        type="button"
                        className={`search-bar__suggestion-item ${isActive ? "active" : ""}`}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => handleSuggestionSelect(item)}
                      >
                        {renderMatch(item.label)}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
            })}
          </div>
        )}
      </div>
      <div className="search-bar__actions">
        <div className="search-bar__source" ref={sourceRef}>
          <span className="search-bar__source-label">Source</span>
          <button
            type="button"
            className={`search-bar__source-trigger ${showSources ? "open" : ""}`}
            onClick={() => {
              setShowSources((prev) => !prev);
              setShowCategories(false);
              setShowSuggestions(false);
            }}
            aria-haspopup="listbox"
            aria-expanded={showSources}
          >
            <span>{activeSourceLabel}</span>
            <span className="search-bar__source-caret">▾</span>
          </button>
          {showSources && (
            <div className="search-bar__source-menu" role="listbox">
              {sourceOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`search-bar__source-item ${option.value === source ? "active" : ""}`}
                  onClick={() => {
                    setSource(option.value);
                    setShowSources(false);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          className="ghost button--small"
          onClick={() => {
            setShowCategories((prev) => !prev);
            setShowSuggestions(false);
            setShowSources(false);
          }}
        >
          Categories
        </button>
        <button type="submit">Search</button>
      </div>

      {showCategories && (
        <div className="search-bar__dropdown">
          <div className="search-bar__dropdown-header">
            <p className="eyebrow">Browse Categories</p>
            <button
              type="button"
              className="ghost button--small"
              onClick={() => setShowCategories(false)}
            >
              Close
            </button>
          </div>
          <div className="search-bar__dropdown-grid">
            {categories.map((category) => (
              <button
                key={category.label}
                type="button"
                className="ghost button--small"
                onClick={() => handleCategorySelect(category.query)}
              >
                {category.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </form>
  );
};

export default SearchBar;
