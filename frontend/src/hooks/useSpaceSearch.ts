import { useState, useRef } from "react";
import { searchTargets } from "../utils/api";
import type { SearchResult } from "../utils/mapSearchItem";
import { filterSearchResults } from "../utils/spaceFilter";

const useSpaceSearch = () => {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("all");
  const pageRef = useRef(1);

  const performSearch = async (incomingQuery: string, incomingSource = "all") => {
    setLoading(true);
    setError(null);
    pageRef.current = 1;
    setQuery(incomingQuery);
    setSource(incomingSource);

    try {
      const response = await searchTargets(incomingQuery, 1, incomingSource);
      if (!response.success) {
        setError("Unable to reach SpaceViewer backend.");
        setResults([]);
        setHasMore(false);
        return [];
      }

      const filtered = filterSearchResults(response.results);
      setResults(filtered);
      setHasMore(response.hasMore ?? false);
      return filtered;
    } catch (caughtError) {
      console.error("performSearch error", caughtError);
      setError("Unable to reach SpaceViewer backend.");
      setResults([]);
      setHasMore(false);
      return [];
    } finally {
      setLoading(false);
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
        return;
      }

      const filtered = filterSearchResults(response.results);
      setResults((prev) => [...prev, ...filtered]);
      setHasMore(response.hasMore ?? false);
      pageRef.current = nextPage;
    } catch (caughtError) {
      console.error("loadMore error", caughtError);
      setError("Unable to reach SpaceViewer backend.");
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  };

  return { loading, error, results, hasMore, performSearch, loadMore };
};

export default useSpaceSearch;
