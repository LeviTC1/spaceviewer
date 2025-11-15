import type { FC } from "react";
import type { SpaceResult } from "../../utils/api";

interface ResultCardProps {
  item: SpaceResult;
  onClick: (item: SpaceResult) => void;
}

const ResultCard: FC<ResultCardProps> = ({ item, onClick }) => {
  const handleClick = () => {
    console.log("ResultCard clicked", { id: item.id, title: item.title });
    onClick(item);
  };

  return (
    <article className="result-card" onClick={handleClick}>
      <div className="result-card__thumb">
        <img src={item.thumbnailUrl} alt={item.title} loading="lazy" />
      </div>
      <div className="result-card__meta">
        <p className="result-card__instrument">{item.instrument}</p>
        <h3>{item.title}</h3>
        <p className="result-card__date">Observed {item.date}</p>
      </div>
    </article>
  );
};

export default ResultCard;
