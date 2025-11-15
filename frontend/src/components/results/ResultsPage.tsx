import { FC, useEffect } from "react";
import ResultCard from "./ResultCard";
import type { SpaceResult } from "../../utils/api";

interface ResultsPageProps {
  results: SpaceResult[];
  onSelect: (result: SpaceResult) => void;
  loadMore: () => void;
  hasMore: boolean;
  loading: boolean;
}

const ResultsPage: FC<ResultsPageProps> = ({ results, onSelect, loadMore, hasMore, loading }) => {
  console.log("ResultsPage received", { resultsCount: results.length });

  useEffect(() => {
    console.log("ResultsPage render", { resultsCount: results.length });
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
      if (scrollHeight - scrollTop - clientHeight < 300 && hasMore && !loading) {
        loadMore();
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [hasMore, loading, loadMore, results.length]);

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

  const handleCardSelect = (item: SpaceResult) => {
    console.log("ResultsPage onSelect fired", { id: item.id, title: item.title });
    onSelect(item);
  };

  return (
    <section className="results">
      <div className="results__header">
        <div>
          <p className="eyebrow">GALLERY</p>
          <h2>Observation results</h2>
          <p className="subtitle">{results.length} observation{results.length === 1 ? "" : "s"} ready.</p>
        </div>
      </div>

      <div className="results__grid">
        {results.map((result) => (
          <ResultCard key={result.id} item={result} onClick={handleCardSelect} />
        ))}
      </div>

      {loading && <p className="status">Loading more...</p>}
      {!hasMore && <p className="status">End of results.</p>}
    </section>
  );
};

export default ResultsPage;
