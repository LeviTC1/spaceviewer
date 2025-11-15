import { useState, useRef } from "react";
import { searchTargets, type SpaceResult } from "../utils/api";

const useSpaceSearch = () => {
  const [results, setResults] = useState<SpaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [query, setQuery] = useState("");
  const pageRef = useRef(1);

  const performSearch = async (incomingQuery: string) => {
    setLoading(true);
    setError(null);
    pageRef.current = 1;
    setQuery(incomingQuery);

    try {
      const response = await searchTargets(incomingQuery, 1);
      if (!response.success) {
        setError("Unable to reach SpaceViewer backend.");
        setResults([]);
        setHasMore(false);
        return [];
      }

      setResults(response.results);
      setHasMore(response.hasMore ?? false);
      return response.results;
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
      const response = await searchTargets(query, nextPage);
      if (!response.success) {
        setError("Unable to reach SpaceViewer backend.");
        setHasMore(false);
        return;
      }

      setResults((prev) => [...prev, ...response.results]);
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
