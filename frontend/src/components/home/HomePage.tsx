import type { FC } from "react";
import SearchBar from "./SearchBar";
import SuggestedTargets from "./SuggestedTargets";

interface HomePageProps {
  query: string;
  setQuery: (value: string) => void;
  onSearch: (value?: string) => void;
  error?: string | null;
  loading: boolean;
}

const suggestions = ["Carina Nebula", "Pillars of Creation", "Orion Bar", "Stephan's Quintet"];

const HomePage: FC<HomePageProps> = ({ query, setQuery, onSearch, error, loading }) => {
  const handleSuggestionClick = (value: string) => {
    setQuery(value);
    onSearch(value);
  };

  return (
    <section className="home">
      <div className="home__hero">
        <p className="eyebrow">JWST DATA BROWSER</p>
        <h1>Discover new perspectives on the universe.</h1>
        <p className="subtitle">
          Search curated James Webb observations, dive into glowing galleries, and continue into an immersive viewer for
          every discovery.
        </p>
      </div>

      <SearchBar query={query} setQuery={setQuery} onSearch={() => onSearch()} />
      <SuggestedTargets suggestions={suggestions} onSelect={handleSuggestionClick} />

      {error && <p className="status status--error">{error}</p>}
      {loading && <p className="status">Fetching the cosmos...</p>}
    </section>
  );
};

export default HomePage;
