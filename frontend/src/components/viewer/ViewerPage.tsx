import { FC, useEffect, useRef, useState } from "react";
import ControlBar from "./ControlBar";
import InfoPanel from "./InfoPanel";
import HighlightOverlay from "./HighlightOverlay";
import type { SpaceResult } from "../../utils/api";
import useImageData from "../../hooks/useImageData";

interface ViewerPageProps {
  selected: SpaceResult;
  onBack: () => void;
  onHighlight: () => void;
  analysisLoading: boolean;
  analysis: any;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const ViewerPage: FC<ViewerPageProps> = ({ selected, onBack, onHighlight, analysisLoading, analysis }) => {
  const { loading, error, imageData, loadImage } = useImageData();
  const imageRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [scale, setScale] = useState(1);
  const [translateX, setTranslateX] = useState(0);
  const [translateY, setTranslateY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const lastPosition = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    setScale(1);
    setTranslateX(0);
    setTranslateY(0);
    loadImage(selected.id);
  }, [selected.id, loadImage]);

  const fallbackUrl = "https://images-assets.nasa.gov/image/PIA12235/PIA12235~orig.jpg";
  const imageUrl = imageData?.imageUrl || fallbackUrl;
  const fullResUrl = imageData?.fullRes || imageUrl;

  const handleWheel = (event: React.WheelEvent) => {
    event.preventDefault();
    const delta = -event.deltaY / 500;
    setScale((prev) => clamp(prev + delta, 1, 5));
  };

  const handleMouseDown = (event: React.MouseEvent) => {
    event.preventDefault();
    setIsDragging(true);
    lastPosition.current = { x: event.clientX, y: event.clientY };
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseMove = (event: React.MouseEvent) => {
    if (!isDragging) return;
    const deltaX = event.clientX - lastPosition.current.x;
    const deltaY = event.clientY - lastPosition.current.y;
    lastPosition.current = { x: event.clientX, y: event.clientY };
    setTranslateX((prev) => prev + deltaX);
    setTranslateY((prev) => prev + deltaY);
  };

  const resetZoom = () => {
    setScale(1);
    setTranslateX(0);
    setTranslateY(0);
  };

  return (
    <section className="viewer">
      <div className="viewer__left">
        <button type="button" className="ghost" onClick={onBack}>
          Back to gallery
        </button>

        <div className="viewer__image">
          {loading && <p className="status">Loading imagery...</p>}
          {error && <p className="status status--error">{error}</p>}

          {!loading && !error && (
            <>
              <div
                ref={containerRef}
                className="zoom-container"
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onDoubleClick={resetZoom}
              >
                <img
                  ref={imageRef}
                  src={imageUrl}
                  alt={selected.title}
                  className="zoomed-img"
                  style={{
                    transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
                    cursor: isDragging ? "grabbing" : "grab",
                  }}
                />
                <HighlightOverlay
                  regions={analysis?.highlightedRegions ?? null}
                  enabled={Boolean(analysis)}
                  imageRef={imageRef}
                />
              </div>
            </>
          )}
        </div>

        <ControlBar
          onHighlight={onHighlight}
          imageUrl={imageUrl}
          fullResUrl={fullResUrl}
          archiveUrl={`https://images.nasa.gov/details/${selected.id}`}
          analysisActive={Boolean(analysis)}
          analysisLoading={analysisLoading}
          nasaId={selected.id}
        />
      </div>

      <InfoPanel selected={selected} metadata={imageData?.metadata} analysis={analysis} analysisLoading={analysisLoading} />
    </section>
  );
};

export default ViewerPage;
