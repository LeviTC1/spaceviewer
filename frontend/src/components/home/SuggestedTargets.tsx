import type { FC } from "react";

interface SuggestedTargetsProps {
  suggestions: string[];
  onSelect: (target: string) => void;
}

// Chips that quickly populate the search bar.
const SuggestedTargets: FC<SuggestedTargetsProps> = ({ suggestions, onSelect }) => (
  <div className="suggested-targets">
    {suggestions.map((target) => (
      <button key={target} type="button" onClick={() => onSelect(target)}>
        {target}
      </button>
    ))}
  </div>
);

export default SuggestedTargets;
