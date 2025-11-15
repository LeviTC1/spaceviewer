import { FC, useEffect, useRef } from "react";

interface Region {
  x: number;
  y: number;
  r: number;
}

interface HighlightOverlayProps {
  regions: Region[] | null;
  enabled: boolean;
  imageRef: React.RefObject<HTMLImageElement | null>;
}

const HighlightOverlay: FC<HighlightOverlayProps> = ({ regions, enabled, imageRef }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;

    if (!canvas || !image) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const draw = () => {
      const naturalWidth = image.naturalWidth || image.width;
      const naturalHeight = image.naturalHeight || image.height;
      const displayWidth = image.clientWidth;
      const displayHeight = image.clientHeight;

      canvas.width = displayWidth;
      canvas.height = displayHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (!enabled || !regions || !regions.length || !naturalWidth || !naturalHeight) {
        return;
      }

      const scaleX = displayWidth / naturalWidth;
      const scaleY = displayHeight / naturalHeight;

      ctx.strokeStyle = "rgba(0, 255, 255, 0.9)";
      ctx.lineWidth = 3;

      regions.forEach((region) => {
        if (region.x < 0 || region.y < 0) {
          return;
        }

        const x = region.x * scaleX;
        const y = region.y * scaleY;
        const r = region.r * scaleX;

        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
      });
    };

    if (image.complete) {
      draw();
    } else {
      image.addEventListener("load", draw, { once: true });
    }

    const resizeObserver = new ResizeObserver(draw);
    resizeObserver.observe(image);

    return () => {
      resizeObserver.disconnect();
    };
  }, [regions, enabled, imageRef]);

  return (
    <canvas
      ref={canvasRef}
      className="highlight-overlay"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        pointerEvents: "none",
        opacity: enabled && regions && regions.length ? 1 : 0,
        transition: "opacity 0.25s ease-in-out",
      }}
    />
  );
};

export default HighlightOverlay;
