import { FC, KeyboardEvent, useMemo, useRef, useState } from "react";
import { MOONS } from "./moonData";
import { PLANETS, type PlanetId } from "./solarData";
import type { CameraBookmark } from "./useCameraBookmarks";
import { SMALL_BODIES, type SmallBodyId } from "./smallBodies/smallBodyData";

export type SolarSearchResult =
  | {
      kind: "sun";
      id: "sun";
      name: string;
      badge: "Star";
      description: string;
      tokens: string[];
    }
  | {
      kind: "planet";
      id: PlanetId;
      name: string;
      badge: "Planet";
      description: string;
      tokens: string[];
    }
  | {
      kind: "moon";
      id: string;
      parentPlanetId: PlanetId;
      name: string;
      badge: "Moon";
      description: string;
      tokens: string[];
    }
  | {
      kind: "small-body";
      id: SmallBodyId;
      name: string;
      badge: "Dwarf planet" | "Comet";
      description: string;
      tokens: string[];
    }
  | {
      kind: "belt";
      id: "asteroid-belt";
      name: string;
      badge: "Belt";
      description: string;
      tokens: string[];
    }
  | {
      kind: "bookmark";
      id: string;
      name: string;
      badge: "Saved view";
      description: string;
      bookmark: CameraBookmark;
      tokens: string[];
    };

interface SolarSearchProps {
  bookmarks: CameraBookmark[];
  onSelectResult: (result: SolarSearchResult) => void;
}

const normalize = (value: string) => value.trim().toLowerCase();

const scoreResult = (result: SolarSearchResult, query: string) => {
  const normalizedName = normalize(result.name);
  const matchingToken = result.tokens.map(normalize).find((token) => token.includes(query));
  if (!matchingToken && !normalizedName.includes(query)) return 0;
  if (normalizedName === query) return 120;
  if (normalizedName.startsWith(query)) return 96;
  if (matchingToken?.startsWith(query)) return 82;
  if (normalizedName.includes(query)) return 68;
  return 48;
};

const SolarSearch: FC<SolarSearchProps> = ({ bookmarks, onSelectResult }) => {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const blurTimer = useRef<number | null>(null);

  const allResults = useMemo<SolarSearchResult[]>(() => {
    const planetResults = PLANETS.map((planet): SolarSearchResult => ({
      kind: "planet",
      id: planet.id,
      name: planet.name,
      badge: "Planet",
      description: `${planet.semiMajorAxisAU} AU from the Sun`,
      tokens: [planet.name, planet.id, planet.searchQuery, `${planet.name} planet`],
    }));

    const moonResults = MOONS.map((moon): SolarSearchResult => {
      const parent = PLANETS.find((planet) => planet.id === moon.parentPlanet);
      const parentName = parent?.name ?? moon.parentPlanet;
      return {
        kind: "moon",
        id: moon.id,
        parentPlanetId: moon.parentPlanet,
        name: moon.name,
        badge: "Moon",
        description: `Moon of ${parentName}`,
        tokens: [moon.name, moon.id, `${parentName} ${moon.name}`, `${moon.name} moon`],
      };
    });

    const bookmarkResults = bookmarks.map((bookmark): SolarSearchResult => ({
      kind: "bookmark",
      id: bookmark.id,
      name: bookmark.name,
      badge: "Saved view",
      description: bookmark.dateKey ? `Saved view · ${bookmark.dateKey}` : "Saved camera bookmark",
      bookmark,
      tokens: [bookmark.name, "bookmark", "saved view"],
    }));

    const smallBodyResults = SMALL_BODIES.map((body): SolarSearchResult => ({
      kind: "small-body",
      id: body.id,
      name: body.name,
      badge: body.kind === "comet" ? "Comet" : "Dwarf planet",
      description:
        body.kind === "comet"
          ? `${body.catalogName} · q ${body.orbit.perihelionAu.toFixed(2)} AU`
          : `${body.catalogName} · a ${body.orbit.semiMajorAxisAu.toFixed(1)} AU`,
      tokens: [body.name, body.catalogName, body.id, body.kind, ...body.aliases],
    }));

    return [
      {
        kind: "sun",
        id: "sun",
        name: "Sun",
        badge: "Star",
        description: "Solar system reference body",
        tokens: ["sun", "sol", "star"],
      },
      ...planetResults,
      ...moonResults,
      ...smallBodyResults,
      {
        kind: "belt",
        id: "asteroid-belt",
        name: "Asteroid Belt",
        badge: "Belt",
        description: "Main belt context between Mars and Jupiter",
        tokens: ["asteroid belt", "main belt", "asteroids"],
      },
      ...bookmarkResults,
    ];
  }, [bookmarks]);

  const results = useMemo(() => {
    const normalizedQuery = normalize(query);
    if (!normalizedQuery) return allResults.slice(0, 7);
    return allResults
      .map((result) => ({ result, score: scoreResult(result, normalizedQuery) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.result.name.localeCompare(b.result.name))
      .slice(0, 8)
      .map((entry) => entry.result);
  }, [allResults, query]);

  const showResults = focused && (query.trim().length > 0 || results.length > 0);
  const selectedIndex = Math.min(activeIndex, Math.max(results.length - 1, 0));

  const selectResult = (result: SolarSearchResult) => {
    onSelectResult(result);
    setQuery(result.name);
    setFocused(false);
    setActiveIndex(0);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!showResults && event.key !== "Escape") return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, Math.max(results.length - 1, 0)));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    }
    if (event.key === "Enter" && results[selectedIndex]) {
      event.preventDefault();
      selectResult(results[selectedIndex]);
    }
    if (event.key === "Escape") {
      setFocused(false);
      setActiveIndex(0);
    }
  };

  return (
    <div className="solar-search">
      <label htmlFor="solar-search">Jump to</label>
      <input
        id="solar-search"
        type="search"
        value={query}
        placeholder="Search Mars, Ceres, Halley..."
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(0);
        }}
        onFocus={() => {
          if (blurTimer.current) window.clearTimeout(blurTimer.current);
          setFocused(true);
        }}
        onBlur={() => {
          blurTimer.current = window.setTimeout(() => setFocused(false), 120);
        }}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />
      {showResults && (
        <div className="solar-search__results" role="listbox" aria-label="Solar search results">
          {results.length ? (
            results.map((result, index) => (
              <button
                key={`${result.kind}-${result.id}`}
                type="button"
                className={`solar-search__result ${index === selectedIndex ? "is-active" : ""}`}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectResult(result);
                }}
              >
                <span>
                  <strong>{result.name}</strong>
                  <small>{result.description}</small>
                </span>
                <em>{result.badge}</em>
              </button>
            ))
          ) : (
            <div className="solar-search__empty">No solar object found.</div>
          )}
        </div>
      )}
    </div>
  );
};

export default SolarSearch;
