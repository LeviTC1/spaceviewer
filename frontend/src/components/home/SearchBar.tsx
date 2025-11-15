import { FC, FormEvent, KeyboardEvent } from "react";

interface SearchBarProps {
  query: string;
  setQuery: (value: string) => void;
  onSearch: () => void;
}

// Input + CTA to kick off JWST queries.
const SearchBar: FC<SearchBarProps> = ({ query, setQuery, onSearch }) => {
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSearch();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      onSearch();
    }
  };

  return (
    <form className="search-bar" onSubmit={handleSubmit}>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search JWST targets..."
        aria-label="Search JWST targets"
      />
      <button type="submit">Search</button>
    </form>
  );
};

export default SearchBar;
