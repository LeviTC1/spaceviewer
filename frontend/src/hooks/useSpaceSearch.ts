import { useState, useRef } from "react";
import { searchTargets } from "../utils/api";
import type { SourceHealth } from "../models/SourceStatus";
import type { SearchResult } from "../utils/mapSearchItem";
import { filterSearchResults } from "../utils/spaceFilter";

const mergeSourceStatus = (current: SourceHealth[], next: SourceHealth[]) => {
  const merged = new Map<string, SourceHealth>();
  [...current, ...next].forEach((status) => {
    const existing = merged.get(status.source);
    if (!existing) {
      merged.set(status.source, status);
      return;
    }
    merged.set(status.source, {
      ...status,
      count: existing.count + status.count,
      hasMore: status.hasMore ?? existing.hasMore,
      status:
        existing.status === "loaded" && status.status === "loaded"
          ? "loaded"
          : existing.count + status.count > 0
            ? "partial"
            : status.status,
      message: status.message ?? existing.message,
    });
  });
  return Array.from(merged.values());
};

const useSpaceSearch = () => {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [sourceStatus, setSourceStatus] = useState<SourceHealth[]>([]);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("all");
  const pageRef = useRef(1);

  const searchIdRef = useRef(0);

  const performSearch = async (incomingQuery: string, incomingSource = "all") => {
    const searchId = searchIdRef.current + 1;
    searchIdRef.current = searchId;
    setLoading(true);
    setError(null);
    pageRef.current = 1;
    setQuery(incomingQuery);
    setSource(incomingSource);
    setResults([]);

    // The survey archives (SDSS, Pan-STARRS) first resolve a sky position, which can take seconds.
    // NASA's library answers in milliseconds, so show its photographs first and merge the rest in.
    let fullDone = false;
    if (incomingSource === "all") {
      searchTargets(incomingQuery, 1, "nasa")
        .then((quick) => {
          if (fullDone || searchIdRef.current !== searchId || !quick.success) return;
          const filtered = filterSearchResults(quick.results);
          if (!filtered.length) return;
          setResults(filtered);
          setSourceStatus([
            ...quick.sourceStatus,
            { source: "sdss", label: "SDSS", status: "partial", count: 0, message: "Still resolving the sky position…" },
            { source: "ps1", label: "Pan-STARRS", status: "partial", count: 0, message: "Still resolving the sky position…" },
          ]);
        })
        .catch(() => undefined);
    }

    try {
      const response = await searchTargets(incomingQuery, 1, incomingSource);
      fullDone = true;
      if (searchIdRef.current !== searchId) return [];
      if (!response.success) {
        setError("The photograph archives didn't answer. Check your connection and try again.");
        setResults([]);
        setHasMore(false);
        setSourceStatus(response.sourceStatus);
        return [];
      }

      const filtered = filterSearchResults(response.results);
      setResults(filtered);
      setHasMore(response.hasMore ?? false);
      setSourceStatus(response.sourceStatus);
      return filtered;
    } catch (caughtError) {
      fullDone = true;
      console.error("performSearch error", caughtError);
      setError("The photograph archives didn't answer. Check your connection and try again.");
      setResults([]);
      setHasMore(false);
      setSourceStatus([]);
      return [];
    } finally {
      if (searchIdRef.current === searchId) setLoading(false);
    }
  };

  const loadMore = async () => {
    if (loading || !hasMore || !query) {
      return;
    }

    setLoading(true);
    setError(null);
    const nextPage = pageRef.current + 1;

    try {
      const response = await searchTargets(query, nextPage, source);
      if (!response.success) {
        setError("Unable to reach SpaceViewer backend.");
        setHasMore(false);
        setSourceStatus(response.sourceStatus);
        return;
      }

      const filtered = filterSearchResults(response.results);
      setResults((prev) => [...prev, ...filtered]);
      setHasMore(response.hasMore ?? false);
      setSourceStatus((prev) => mergeSourceStatus(prev, response.sourceStatus));
      pageRef.current = nextPage;
    } catch (caughtError) {
      console.error("loadMore error", caughtError);
      setError("Unable to reach SpaceViewer backend.");
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  };

  return { loading, error, results, hasMore, sourceStatus, performSearch, loadMore };
};

export default useSpaceSearch;
