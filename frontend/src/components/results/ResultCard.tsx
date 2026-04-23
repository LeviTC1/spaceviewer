import type { FC, KeyboardEvent } from "react";
import type { SpaceImage } from "../../models/SpaceImage";

interface ResultCardProps {
  item: SpaceImage;
  onClick: (item: SpaceImage) => void;
  contextBadges?: string[];
}

const ResultCard: FC<ResultCardProps> = ({ item, onClick, contextBadges }) => {
  const handleClick = () => {
    onClick(item);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleClick();
    }
  };

  const thumbnail = item.thumbnailUrl || item.imageUrl || "https://images-assets.nasa.gov/image/PIA12235/PIA12235~thumb.jpg";
  const instrumentLabel = item.instrument || item.mission || item.center || "NASA Image Library";
  const dateLabel = item.date || "Unknown";
  const sourceKey = item.source ?? "nasa";
  const sourceLabel =
    sourceKey === "sdss" ? "SDSS" : sourceKey === "ps1" ? "Pan-STARRS" : sourceKey === "nasa" ? "NASA" : sourceKey;

  return (
    <article className="result-card" onClick={handleClick} onKeyDown={handleKeyDown} role="button" tabIndex={0}>
      <div className="result-card__thumb">
        <img src={thumbnail} alt={item.title} loading="lazy" />
      </div>
      <div className="result-card__meta">
        <div className="result-card__badges">
          <span className={`result-card__badge result-card__badge--${sourceKey}`}>{sourceLabel}</span>
        </div>
        <p className="result-card__instrument">{instrumentLabel}</p>
        <h3>{item.title}</h3>
        {contextBadges && contextBadges.length > 0 && (
          <div className="result-card__context">
            {contextBadges.map((badge) => (
              <span key={badge} className="result-card__context-badge">
                {badge}
              </span>
            ))}
          </div>
        )}
        <p className="result-card__date">Observed {dateLabel}</p>
      </div>
    </article>
  );
};

export default ResultCard;
