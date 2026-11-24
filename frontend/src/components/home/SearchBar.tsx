import { useEffect, useId, useMemo, useRef, useState, type FC, type FormEvent, type KeyboardEvent } from "react";
import { getSessionMemory, getTopItems } from "../../utils/sessionMemory";
import SelectMenu from "../ui/SelectMenu";

export type SearchSuggestionKind = "suggestion" | "category" | "object" | "mission" | "mode";

export type SearchSuggestionInput =
  | string
  | {
      label: string;
      value?: string;
      kind?: SearchSuggestionKind;
      meta?: string;
      onSelect?: () => void;
    };

type SuggestionKind = SearchSuggestionKind | "recent" | "source";

interface SuggestionItem {
  label: string;
  value: string;
  kind: SuggestionKind;
  meta?: string;
  sourceValue?: string;
  onSelect?: () => void;
}

interface SearchBarProps {
  query: string;
  setQuery: (value: string) => void;
  source: string;
  setSource: (value: string) => void;
  sourceOptions: Array<{ value: string; label: string }>;
  onSearch: (value?: string, sourceOverride?: string) => void;
  suggestions: SearchSuggestionInput[];
  categories: Array<{ label: string; query: string }>;
}

const normalizeSuggestion = (item: SearchSuggestionInput): SuggestionItem => {
  if (typeof item === "string") {
    return { label: item, value: item, kind: "suggestion" };
  }

  return {
    label: item.label,
    value: item.value ?? item.label,
    kind: item.kind ?? "suggestion",
    meta: item.meta,
    onSelect: item.onSelect,
  };
};

const matchesQuery = (item: Pick<SuggestionItem, "label" | "value" | "meta">, normalizedQuery: string) => {
  if (!normalizedQuery) return true;
  return [item.label, item.value, item.meta]
    .filter(Boolean)
    .some((part) => part?.toLowerCase().includes(normalizedQuery));
};

const getSuggestionKey = (item: SuggestionItem) => {
  if (item.kind === "source") {
    return `source:${item.sourceValue ?? "all"}:${item.value.toLowerCase()}`;
  }
  if (item.kind === "category") {
    return `category:${item.value.toLowerCase()}`;
  }
  if (item.kind === "mode") {
    return `mode:${item.label.toLowerCase()}:${item.value.toLowerCase()}`;
  }
  if (item.kind === "object" || item.kind === "mission" || item.kind === "recent") {
    return `${item.kind}:${item.value.toLowerCase()}`;
  }
  return item.value.toLowerCase();
};

const getKindLabel = (kind: SuggestionKind) => {
  switch (kind) {
    case "object":
      return "Object";
    case "mission":
      return "Mission";
    case "category":
      return "Category";
    case "recent":
      return "Recent";
    case "source":
      return "Source";
    case "mode":
      return "Jump";
    default:
      return "Search";
  }
};

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
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const blurTimeoutRef = useRef<number | null>(null);
  const suggestionsListId = useId();
  const RECENT_KEY = "spaceviewer.recentSearches";
  const MAX_RECENT = 6;

  useEffect(() => {
    try {
      const memoryRecent = getTopItems(getSessionMemory().searches, MAX_RECENT);
      const stored = window.localStorage.getItem(RECENT_KEY);
      let storedRecent: string[] = [];
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          storedRecent = parsed.filter((item) => typeof item === "string");
        }
      }
      setRecentSearches(
        Array.from(new Set([...storedRecent, ...memoryRecent].map((item) => item.trim()).filter(Boolean))).slice(
          0,
          MAX_RECENT,
        ),
      );
    } catch (error) {
      console.warn("Unable to load recent searches", error);
    }
  }, []);

  const normalizedSuggestions = useMemo(() => suggestions.map(normalizeSuggestion), [suggestions]);

  const filteredSuggestions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalizedSuggestions.filter((item) => matchesQuery(item, normalized));
  }, [normalizedSuggestions, query]);

  const popularCategories = useMemo(() => categories.slice(0, 6), [categories]);

  const categoryMatches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return popularCategories;
    }
    return categories
      .filter(
        (category) =>
          category.label.toLowerCase().includes(normalized) || category.query.toLowerCase().includes(normalized),
      )
      .slice(0, 8);
  }, [categories, popularCategories, query]);

  const recentMatches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return recentSearches;
    }
    return recentSearches.filter((item) => item.toLowerCase().includes(normalized));
  }, [query, recentSearches]);

  const sourceMatches = useMemo<SuggestionItem[]>(() => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return [];
    }

    return sourceOptions.slice(0, 4).map((option) => ({
      label: option.label,
      value: trimmedQuery,
      kind: "source",
      sourceValue: option.value,
      meta:
        option.value === source
          ? `Current source for "${trimmedQuery}"`
          : `Search "${trimmedQuery}" in this archive`,
    }));
  }, [query, source, sourceOptions]);

  const suggestionGroups = useMemo(() => {
    const used = new Set<string>();
    const groups: Array<{ title: string; items: SuggestionItem[] }> = [];

    const addGroup = (title: string, items: SuggestionItem[]) => {
      const uniqueItems = items.filter((item) => {
        const key = getSuggestionKey(item);
        if (used.has(key)) return false;
        used.add(key);
        return true;
      });
      if (uniqueItems.length) {
        groups.push({ title, items: uniqueItems });
      }
    };

    if (recentMatches.length) {
      addGroup(
        "Recent",
        recentMatches.slice(0, MAX_RECENT).map((item) => ({
          label: item,
          value: item,
          kind: "recent",
          meta: "From your recent searches",
        })),
      );
    }

    addGroup(
      "Mode jumps",
      filteredSuggestions
        .filter((item) => item.kind === "mode")
        .slice(0, query.trim() ? 6 : 4)
        .map((item) => ({ ...item, meta: item.meta ?? "Open workspace target" })),
    );

    addGroup(
      "Objects",
      filteredSuggestions
        .filter((item) => item.kind === "object")
        .slice(0, query.trim() ? 6 : 5)
        .map((item) => ({ ...item, meta: item.meta ?? "Object lookup" })),
    );

    addGroup(
      "Missions",
      filteredSuggestions
        .filter((item) => item.kind === "mission")
        .slice(0, query.trim() ? 5 : 4)
        .map((item) => ({ ...item, meta: item.meta ?? "Mission archive query" })),
    );

    addGroup(
      query.trim() ? "Categories" : "Popular categories",
      categoryMatches.map((item) => ({
        label: item.label,
        value: item.query,
        kind: "category",
        meta: `Search for ${item.query}`,
      })),
    );

    addGroup("Search source", sourceMatches);

    addGroup(
      query.trim() ? "Keyword matches" : "Suggestions",
      filteredSuggestions
        .filter((item) => item.kind === "suggestion")
        .slice(0, 6)
        .map((item) => ({ ...item, meta: item.meta ?? "Keyword search" })),
    );

    return groups;
  }, [categoryMatches, filteredSuggestions, query, recentMatches, sourceMatches]);

  const flatSuggestions = useMemo(() => suggestionGroups.flatMap((group) => group.items), [suggestionGroups]);
  const showSuggestionList = showSuggestions && flatSuggestions.length > 0;
  const activeSuggestionId = showSuggestionList && activeIndex >= 0 ? `${suggestionsListId}-option-${activeIndex}` : undefined;

  useEffect(() => {
    setActiveIndex((prev) => {
      if (!flatSuggestions.length) return -1;
      return prev >= flatSuggestions.length ? flatSuggestions.length - 1 : prev;
    });
  }, [flatSuggestions.length]);

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
  };

  const handleBlur = () => {
    blurTimeoutRef.current = window.setTimeout(() => {
      setShowSuggestions(false);
    }, 120);
  };

  const handleSuggestionSelect = (item: SuggestionItem | string) => {
    const value = typeof item === "string" ? item : item.value;
    const kind = typeof item === "string" ? "suggestion" : item.kind;
    const sourceValue = typeof item === "string" ? undefined : item.sourceValue;
    const customSelect = typeof item === "string" ? undefined : item.onSelect;
    if (customSelect) {
      setQuery(value);
      setShowSuggestions(false);
      setShowCategories(false);
      pushRecent(value);
      customSelect();
      return;
    }
    if (kind === "category") {
      handleCategorySelect(value);
      return;
    }
    if (kind === "source") {
      if (sourceValue) {
        setSource(sourceValue);
      }
      setShowSuggestions(false);
      setShowCategories(false);
      if (value.trim()) {
        pushRecent(value);
        onSearch(value, sourceValue);
      }
      return;
    }
    setQuery(value);
    setShowSuggestions(false);
    setShowCategories(false);
    pushRecent(value);
    onSearch(value);
  };

  const handleCategorySelect = (value: string) => {
    setQuery(value);
    setShowSuggestions(false);
    setShowCategories(false);
    pushRecent(value);
    onSearch(value);
  };

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

  let renderedSuggestionIndex = -1;

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
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showSuggestionList}
          aria-controls={showSuggestionList ? suggestionsListId : undefined}
          aria-activedescendant={activeSuggestionId}
          autoComplete="off"
        />
        {showSuggestionList && (
          <div id={suggestionsListId} className="search-bar__suggestions" role="listbox" aria-label="Search suggestions">
            {suggestionGroups.map((group) => (
              <div key={group.title} className="search-bar__suggestions-group" role="group" aria-label={group.title}>
                <p className="eyebrow">
                  {group.title}
                  <span className="search-bar__group-count">{group.items.length}</span>
                </p>
                <div className="search-bar__suggestions-list">
                  {group.items.map((item) => {
                    renderedSuggestionIndex += 1;
                    const itemIndex = renderedSuggestionIndex;
                    const isActive = itemIndex === activeIndex;
                    return (
                      <button
                        id={`${suggestionsListId}-option-${itemIndex}`}
                        key={`${group.title}-${item.kind}-${item.sourceValue ?? item.value}-${item.label}`}
                        type="button"
                        className={`search-bar__suggestion-item ${isActive ? "active" : ""}`}
                        role="option"
                        aria-selected={isActive}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => handleSuggestionSelect(item)}
                      >
                        <span className="search-bar__suggestion-main">
                          <span className="search-bar__suggestion-label">{renderMatch(item.label)}</span>
                          {item.meta && <span className="search-bar__suggestion-meta">{item.meta}</span>}
                        </span>
                        <span className="search-bar__suggestion-kind">{getKindLabel(item.kind)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="search-bar__actions">
        <SelectMenu
          label="Source"
          value={source}
          options={sourceOptions}
          onChange={setSource}
          onOpenStart={() => {
            setShowCategories(false);
            setShowSuggestions(false);
          }}
          className="search-bar__source"
          labelClassName="search-bar__source-label"
          triggerClassName="search-bar__source-trigger"
          caretClassName="search-bar__source-caret"
          menuClassName="search-bar__source-menu"
          itemClassName="search-bar__source-item"
        />
        <button
          type="button"
          className="ghost button--small"
          onClick={() => {
            setShowCategories((prev) => !prev);
            setShowSuggestions(false);
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
