import { useMemo, type FC, type MouseEvent } from "react";
import { Icon } from "../../shell/Icon";
import { matchImageToPlace } from "../../shell/places";
import type { SpaceImage } from "../../models/SpaceImage";
import {
  formatResultDimensions,
  getResultArchiveLabel,
  getResultSourceHost,
  sourceLabel,
} from "../../utils/galleryResults";

interface ResultCardProps {
  item: SpaceImage;
  onClick: (item: SpaceImage) => void;
  contextBadges?: string[];
  variant?: "grid" | "list";
  compareSelected?: boolean;
  compareDisabled?: boolean;
  onToggleCompare?: (item: SpaceImage) => void;
  collectionSelected?: boolean;
  onToggleCollection?: (item: SpaceImage) => void;
}

const ResultCard: FC<ResultCardProps> = ({
  item,
  onClick,
  contextBadges,
  variant = "grid",
  compareSelected = false,
  compareDisabled = false,
  onToggleCompare,
  collectionSelected = false,
  onToggleCollection,
}) => {
  const handleClick = () => {
    onClick(item);
  };

  const handleCompareClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onToggleCompare?.(item);
  };

  const handleCollectionClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onToggleCollection?.(item);
  };

  const thumbnail = item.thumbnailUrl || item.imageUrl || "https://images-assets.nasa.gov/image/PIA12235/PIA12235~thumb.jpg";
  const instrumentLabel = item.instrument || item.mission || item.center || "NASA Image Library";
  const dateLabel = item.date || "Unknown";
  const sourceKey = item.source ?? "nasa";
  const sourceClass = sourceKey.toLowerCase().replace(/[^a-z0-9-]/g, "") || "unknown";
  const sourceHost = getResultSourceHost(item);
  const archiveLabel = getResultArchiveLabel(item);
  const matchReason = item.matchReason?.trim() || "Matched by title, source metadata, or session context.";
  const dimensionLabel = formatResultDimensions(item.dimensions);
  const place = useMemo(() => matchImageToPlace(item), [item]);
  const year = item.date ? item.date.slice(0, 4) : "";

  return (
    <article className={`result-card rc result-card--${variant}${compareSelected ? " result-card--selected" : ""}${collectionSelected ? " is-saved" : ""}`}>
      <button type="button" className="result-card__main rc-main" onClick={handleClick}>
        <div className="result-card__thumb rc-thumb">
          <img src={thumbnail} alt={item.title} loading="lazy" decoding="async" />
        </div>
        <div className="result-card__meta rc-meta">
          <h3>{item.title}</h3>
          <p className="rc-line">
            <span className={`result-card__badge result-card__badge--${sourceClass}`}>{sourceLabel(sourceKey)}</span>
            <span>{instrumentLabel}</span>
            {year ? <span>{year}</span> : null}
          </p>
          {place ? (
            <p className="rc-place">
              <Icon name="universe" size={12} /> {place.name}
            </p>
          ) : null}
          {contextBadges && contextBadges.length > 0 && (
            <div className="result-card__context">
              {contextBadges.map((badge) => (
                <span key={badge} className="result-card__context-badge">
                  {badge}
                </span>
              ))}
            </div>
          )}
          {variant === "list" ? (
            <>
              <p className="result-card__date">Observed {dateLabel}</p>
              {item.description && <p className="result-card__description">{item.description}</p>}
              <dl className="result-card__provenance" aria-label={`${item.title} research cues`}>
                <div className="result-card__provenance-row result-card__provenance-row--match">
                  <dt>Match</dt>
                  <dd>{matchReason}</dd>
                </div>
                <div className="result-card__provenance-row">
                  <dt>Archive</dt>
                  <dd>
                    {archiveLabel}
                    <span>{sourceHost}</span>
                  </dd>
                </div>
                <div className="result-card__provenance-row">
                  <dt>Resolution</dt>
                  <dd>{dimensionLabel}</dd>
                </div>
                {item.metadataQuality ? (
                  <div className="result-card__provenance-row">
                    <dt>Metadata</dt>
                    <dd>
                      {item.metadataQuality.label} · {item.metadataQuality.score}/100
                    </dd>
                  </div>
                ) : null}
              </dl>
            </>
          ) : (
            <span className="sv-sr">
              Observed {dateLabel}. {archiveLabel}, {sourceHost}. {matchReason}
            </span>
          )}
        </div>
      </button>
      {(onToggleCompare || onToggleCollection) && (
        <div className="result-card__actions rc-actions">
          {onToggleCollection && (
            <button
              type="button"
              className={`result-card__save rc-act${collectionSelected ? " active" : ""}`}
              onClick={handleCollectionClick}
              onKeyDown={(event) => event.stopPropagation()}
              aria-pressed={collectionSelected}
              aria-label={collectionSelected ? `Saved: ${item.title}` : `Save ${item.title}`}
              title={collectionSelected ? "Saved to Your sky" : "Save to Your sky"}
            >
              <Icon name={collectionSelected ? "star-filled" : "star"} size={15} />
              <span>{collectionSelected ? "Saved" : "Save"}</span>
            </button>
          )}
          {onToggleCompare && (
            <button
              type="button"
              className={`result-card__compare rc-act${compareSelected ? " active" : ""}`}
              onClick={handleCompareClick}
              onKeyDown={(event) => event.stopPropagation()}
              disabled={compareDisabled && !compareSelected}
              aria-pressed={compareSelected}
              aria-label={compareSelected ? `Remove ${item.title} from compare` : `Compare ${item.title}`}
              title="Compare"
            >
              <Icon name="compare" size={15} />
              <span>{compareSelected ? "Selected" : "Compare"}</span>
            </button>
          )}
        </div>
      )}
    </article>
  );
};

export default ResultCard;
