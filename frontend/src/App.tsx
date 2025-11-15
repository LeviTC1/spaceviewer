// App orchestrates navigation between the three main views.
import { useEffect, useState } from "react";
import AppShell from "./components/layout/AppShell";
import PageContainer from "./components/layout/PageContainer";
import HomePage from "./components/home/HomePage";
import ResultsPage from "./components/results/ResultsPage";
import ViewerPage from "./components/viewer/ViewerPage";
import { runAnalysis, type AnalysisData, type SpaceResult } from "./utils/api";
import useSpaceSearch from "./hooks/useSpaceSearch";

type View = "home" | "results" | "viewer";

const App = () => {
  const [view, setView] = useState<View>("home");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SpaceResult | null>(null);
  const [results, setResults] = useState<SpaceResult[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  const { loading, error, results: hookResults, performSearch, loadMore, hasMore } = useSpaceSearch();

  useEffect(() => {
    if (hookResults.length) {
      setResults(hookResults);
    }
  }, [hookResults]);

  const handleSearch = async (override?: string) => {
    const rawQuery = typeof override === "string" ? override : query;
    const activeQuery = rawQuery.trim();
    console.log("handleSearch called", { override, activeQuery });
    if (!activeQuery) {
      return;
    }

    setQuery(activeQuery);
    const fetchedResults = await performSearch(activeQuery);
    console.log("handleSearch results", { fetched: fetchedResults.length });
    setResults(fetchedResults.length ? fetchedResults : []);
    setView("results");
  };

  const handleSelectResult = (result: SpaceResult) => {
    console.log("handleSelectResult", { id: result.id, title: result.title });
    setSelected(result);
    setAnalysis(null);
    setView("viewer");
  };

  const handleRunAnalysis = async () => {
    if (!selected) {
      return;
    }
    setAnalysisLoading(true);
    try {
      const data = await runAnalysis(selected.id);
      setAnalysis(data);
    } finally {
      setAnalysisLoading(false);
    }
  };

  const handleNavigateToResults = () => {
    if (!results.length && !hookResults.length && !query.trim()) {
      console.log("navigateToResults skipped - no cached results");
      return;
    }
    setView("results");
  };

  const derivedResults = results.length ? results : hookResults;

  const renderCurrentView = () => {
    if (view === "results") {
      console.log("ResultsPage view", {
        stored: results.length,
        fromHook: hookResults.length,
        delivered: derivedResults.length,
      });
      return (
        <ResultsPage
          results={derivedResults}
          onSelect={handleSelectResult}
          loadMore={loadMore}
          hasMore={hasMore}
          loading={loading}
        />
      );
    }

    if (view === "viewer" && selected) {
      return (
        <ViewerPage
          selected={selected}
          onBack={handleNavigateToResults}
          analysis={analysis}
          onHighlight={handleRunAnalysis}
          analysisLoading={analysisLoading}
        />
      );
    }

    return <HomePage query={query} setQuery={setQuery} onSearch={handleSearch} error={error} loading={loading} />;
  };

  return (
    <AppShell onNavigateHome={() => setView("home")} onNavigateGallery={handleNavigateToResults}>
      <PageContainer>{renderCurrentView()}</PageContainer>
    </AppShell>
  );
};

export default App;
