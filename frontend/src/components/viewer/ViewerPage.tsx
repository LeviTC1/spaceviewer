import { FC, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ControlBar from "./ControlBar";
import InfoPanel from "./InfoPanel";
import HighlightOverlay from "./HighlightOverlay";
import ResultCard from "../results/ResultCard";
import type { SpaceImage } from "../../models/SpaceImage";
import useImageData from "../../hooks/useImageData";
import { classifyObjectType } from "../../ai/classifyObjectType";
import { recordSavedType } from "../../utils/sessionMemory";

interface ViewerPageProps {
  selected: SpaceImage;
  relatedPool: SpaceImage[];
  onSelectRelated: (item: SpaceImage) => void;
  onSearch: (value?: string) => void;
  onBack: () => void;
  onHighlight: () => void;
  analysisLoading: boolean;
  analysis: any;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const ViewerPage: FC<ViewerPageProps> = ({
  selected,
  relatedPool,
  onSelectRelated,
  onSearch,
  onBack,
  onHighlight,
  analysisLoading,
  analysis,
}) => {
  const { loading, error, imageData, loadImage } = useImageData();
  const imageRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<HTMLElement | null>(null);

  const [scale, setScale] = useState(1);
  const [translateX, setTranslateX] = useState(0);
  const [translateY, setTranslateY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [displayUrl, setDisplayUrl] = useState("");
  const [isFullRes, setIsFullRes] = useState(false);
  const [isFullResLoading, setIsFullResLoading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [highlightEnabled, setHighlightEnabled] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [brightness, setBrightness] = useState(1);
  const [contrast, setContrast] = useState(1);
  const [saturate, setSaturate] = useState(1);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const lastPosition = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const loadedFullResRef = useRef<string | null>(null);
  const inertiaFrameRef = useRef<number | null>(null);
  const velocityRef = useRef({ x: 0, y: 0 });
  const lastMoveTimeRef = useRef<number | null>(null);
  const translateRef = useRef({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const restoringRef = useRef(false);
  const updateTimerRef = useRef<number | null>(null);
  const lastRestoredIdRef = useRef<string | null>(null);

  useEffect(() => {
    setScale(1);
    setTranslateX(0);
    setTranslateY(0);
    setIsFullRes(false);
    setIsFullResLoading(false);
    setShowHelp(false);
    setIsImageLoaded(false);
    setCopyStatus("idle");
    setBrightness(1);
    setContrast(1);
    setSaturate(1);
    setHighlightEnabled(false);
    loadedFullResRef.current = null;
    translateRef.current = { x: 0, y: 0 };
    scaleRef.current = 1;
    const shouldFetch = selected.source === "nasa";
    loadImage(selected.nasaId ?? selected.id, shouldFetch);
  }, [selected.id, selected.nasaId, selected.source, loadImage]);

  const fallbackUrl =
    selected.imageUrl || selected.thumbnailUrl || "https://images-assets.nasa.gov/image/PIA12235/PIA12235~orig.jpg";
  const baseUrl = imageData?.imageUrl || selected.imageUrl || selected.thumbnailUrl || fallbackUrl;
  const fullResUrl = imageData?.fullRes ?? imageData?.imageUrl ?? selected.fullRes ?? "";
  const imageKey = selected.nasaId ?? selected.id;
  const nasaId = selected.source === "nasa" ? (selected.nasaId ?? selected.id) : undefined;
  const analysisDisabled = Boolean(selected.source && selected.source !== "nasa");
  const savedTypeLabel = useMemo(() => classifyObjectType(selected), [selected]);

  const handleHighlightToggle = () => {
    if (analysis) {
      setHighlightEnabled((prev) => !prev);
      return;
    }
    if (!analysisDisabled) {
      onHighlight();
      setHighlightEnabled(true);
    }
  };

  useEffect(() => {
    if (analysis && !analysisDisabled) {
      setHighlightEnabled(true);
    }
  }, [analysis, analysisDisabled]);

  const normalizeTokens = useCallback((text?: string) => {
    if (!text) return [];
    const stopwords = new Set(["the", "and", "with", "from", "into", "image", "view", "space", "nasa"]);
    return text
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .filter((token) => token.length > 3 && !stopwords.has(token));
  }, []);

  const relatedItems = useMemo(() => {
    if (!relatedPool.length) {
      return [];
    }

    const selectedKeywords = new Set(
      Array.isArray(selected.keywords) ? selected.keywords.map((item) => item.toLowerCase()) : [],
    );
    const selectedTokens = new Set(normalizeTokens(selected.title));
    const selectedInstrument = selected.instrument?.toLowerCase();
    const selectedMission = selected.mission?.toLowerCase();
    const selectedCenter = selected.center?.toLowerCase();

    const scored = relatedPool
      .filter((item) => item.id !== selected.id)
      .map((item) => {
        let score = 0;
        const reasons: string[] = [];

        if (selectedInstrument && item.instrument && item.instrument.toLowerCase() === selectedInstrument) {
          score += 4;
          reasons.push("Same instrument");
        }
        if (selectedMission && item.mission && item.mission.toLowerCase() === selectedMission) {
          score += 4;
          reasons.push("Same mission");
        }
        if (selectedCenter && item.center && item.center.toLowerCase() === selectedCenter) {
          score += 3;
          reasons.push("Same center");
        }

        if (Array.isArray(item.keywords) && selectedKeywords.size) {
          const sharedKeywords = item.keywords
            .filter((keyword) => selectedKeywords.has(keyword.toLowerCase()))
            .map((keyword) => keyword.trim())
            .filter(Boolean);
          const shared = sharedKeywords.length;
          score += shared * 2;
          if (sharedKeywords.length) {
            reasons.push(`Keyword: ${sharedKeywords[0]}`);
            if (sharedKeywords[1]) {
              reasons.push(`Keyword: ${sharedKeywords[1]}`);
            }
          }
        }

        const itemTokens = normalizeTokens(item.title);
        if (itemTokens.length && selectedTokens.size) {
          const sharedTokens = itemTokens.filter((token) => selectedTokens.has(token)).length;
          score += sharedTokens;
          if (sharedTokens > 0) {
            reasons.push("Similar title");
          }
        }

        const parsedDate = Date.parse(item.date ?? "");
        const recency = Number.isFinite(parsedDate) ? parsedDate : 0;

        return { item, score, recency, reasons: Array.from(new Set(reasons)) };
      });

    const sorted = scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.recency - a.recency;
    });

    const withSignal = sorted.filter((entry) => entry.score > 0);
    const pool = (withSignal.length ? withSignal : sorted).slice(0, 6);
    return pool.map((entry) => ({
      item: entry.item,
      reasons: entry.reasons.slice(0, 2),
    }));
  }, [normalizeTokens, relatedPool, selected]);

  useEffect(() => {
    if (!isFullRes) {
      setDisplayUrl(baseUrl);
    }
  }, [baseUrl, isFullRes]);

  useEffect(() => {
    if (!displayUrl) {
      setDisplayUrl(baseUrl);
    }
  }, [displayUrl, baseUrl]);

  useEffect(() => {
    if (displayUrl) {
      setIsImageLoaded(false);
    }
  }, [displayUrl]);

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  useEffect(() => {
    translateRef.current = { x: translateX, y: translateY };
  }, [translateX, translateY]);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const { width, height } = entry.contentRect;
        setContainerSize({ width, height });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const clampTranslation = useCallback(
    (x: number, y: number, scaleValue: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) {
        return { x, y };
      }

      const maxX = Math.max(0, (rect.width * scaleValue - rect.width) / 2);
      const maxY = Math.max(0, (rect.height * scaleValue - rect.height) / 2);

      return {
        x: clamp(x, -maxX, maxX),
        y: clamp(y, -maxY, maxY),
      };
    },
    [containerRef],
  );

  const setTranslation = useCallback(
    (x: number, y: number, scaleValue: number) => {
      const clamped = clampTranslation(x, y, scaleValue);
      translateRef.current = clamped;
      setTranslateX(clamped.x);
      setTranslateY(clamped.y);
    },
    [clampTranslation],
  );

  const cancelInertia = useCallback(() => {
    if (inertiaFrameRef.current) {
      cancelAnimationFrame(inertiaFrameRef.current);
      inertiaFrameRef.current = null;
    }
  }, []);

  const resetFilters = useCallback(() => {
    setBrightness(1);
    setContrast(1);
    setSaturate(1);
  }, []);

  const zoomTo = useCallback(
    (nextScale: number, clientX?: number, clientY?: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) {
        setScale(nextScale);
        scaleRef.current = nextScale;
        return;
      }

      const currentScale = scaleRef.current;
      const ratio = nextScale / currentScale;
      const cx = (clientX ?? rect.left + rect.width / 2) - rect.left;
      const cy = (clientY ?? rect.top + rect.height / 2) - rect.top;
      const current = translateRef.current;
      const nextX = current.x * ratio + cx * (1 - ratio);
      const nextY = current.y * ratio + cy * (1 - ratio);

      scaleRef.current = nextScale;
      setScale(nextScale);
      setTranslation(nextX, nextY, nextScale);
    },
    [setTranslation],
  );

  const zoomBy = useCallback(
    (delta: number, clientX?: number, clientY?: number) => {
      const nextScale = clamp(scaleRef.current + delta, 1, 5);
      zoomTo(nextScale, clientX, clientY);
    },
    [zoomTo],
  );

  const handleWheel = (event: React.WheelEvent) => {
    event.preventDefault();
    cancelInertia();
    const delta = -event.deltaY / 500;
    zoomBy(delta, event.clientX, event.clientY);
  };

  const handleMouseDown = (event: React.MouseEvent) => {
    event.preventDefault();
    cancelInertia();
    setIsDragging(true);
    lastPosition.current = { x: event.clientX, y: event.clientY };
    lastMoveTimeRef.current = performance.now();
  };

  const handleMouseUp = () => {
    if (!isDragging) {
      return;
    }
    setIsDragging(false);
    const { x, y } = velocityRef.current;
    if (scaleRef.current <= 1 || Math.hypot(x, y) < 0.02) {
      return;
    }

    let lastTime = performance.now();
    const step = (time: number) => {
      const dt = time - lastTime;
      lastTime = time;
      const friction = Math.pow(0.92, dt / 16.67);
      let vx = velocityRef.current.x * friction;
      let vy = velocityRef.current.y * friction;

      if (Math.abs(vx) < 0.01 && Math.abs(vy) < 0.01) {
        velocityRef.current = { x: 0, y: 0 };
        inertiaFrameRef.current = null;
        return;
      }

      const nextX = translateRef.current.x + vx * dt;
      const nextY = translateRef.current.y + vy * dt;
      const clamped = clampTranslation(nextX, nextY, scaleRef.current);

      if (clamped.x !== nextX) {
        vx = 0;
      }
      if (clamped.y !== nextY) {
        vy = 0;
      }

      velocityRef.current = { x: vx, y: vy };
      translateRef.current = clamped;
      setTranslateX(clamped.x);
      setTranslateY(clamped.y);
      inertiaFrameRef.current = requestAnimationFrame(step);
    };

    inertiaFrameRef.current = requestAnimationFrame(step);
  };

  const handleMouseMove = (event: React.MouseEvent) => {
    if (!isDragging) return;
    const deltaX = event.clientX - lastPosition.current.x;
    const deltaY = event.clientY - lastPosition.current.y;
    lastPosition.current = { x: event.clientX, y: event.clientY };
    const nextX = translateRef.current.x + deltaX;
    const nextY = translateRef.current.y + deltaY;
    setTranslation(nextX, nextY, scaleRef.current);

    const now = performance.now();
    const lastTime = lastMoveTimeRef.current ?? now;
    const dt = Math.max(16, now - lastTime);
    velocityRef.current = { x: deltaX / dt, y: deltaY / dt };
    lastMoveTimeRef.current = now;
  };

  const resetZoom = useCallback(() => {
    scaleRef.current = 1;
    setScale(1);
    setTranslation(0, 0, 1);
  }, [setTranslation]);

  const zoomIn = useCallback(() => zoomBy(0.25), [zoomBy]);
  const zoomOut = useCallback(() => zoomBy(-0.25), [zoomBy]);

  const handleDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      cancelInertia();
      if (scaleRef.current >= 2) {
        resetZoom();
      } else {
        zoomTo(2.5, event.clientX, event.clientY);
      }
    },
    [cancelInertia, resetZoom, zoomTo],
  );

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === viewerRef.current);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!viewerRef.current) {
      return;
    }

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
    } else {
      viewerRef.current.requestFullscreen().catch(() => undefined);
    }
  }, []);

  const handleCopyLink = useCallback(() => {
    const url = window.location.href;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(url)
        .then(() => setCopyStatus("copied"))
        .catch(() => setCopyStatus("failed"));
    } else {
      try {
        const input = document.createElement("input");
        input.value = url;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        input.remove();
        setCopyStatus("copied");
      } catch (error) {
        console.error("Copy link failed", error);
        setCopyStatus("failed");
      }
    }

    window.setTimeout(() => setCopyStatus("idle"), 2000);
  }, []);

  useEffect(() => {
    return () => {
      cancelInertia();
    };
  }, [cancelInertia]);

  const canToggleFullRes = Boolean(fullResUrl) && fullResUrl !== baseUrl;

  useEffect(() => {
    if (!canToggleFullRes || isFullResLoading || fullResUrl === loadedFullResRef.current) {
      return;
    }

    setIsFullResLoading(true);
    const img = new Image();
    img.onload = () => {
      loadedFullResRef.current = fullResUrl;
      setIsFullRes(true);
      setDisplayUrl(fullResUrl);
      setIsFullResLoading(false);
    };
    img.onerror = () => {
      setIsFullResLoading(false);
    };
    img.src = fullResUrl;
  }, [canToggleFullRes, fullResUrl, isFullResLoading]);

  const handleToggleFullRes = useCallback(() => {
    if (!canToggleFullRes) {
      return;
    }

    if (isFullRes) {
      setIsFullRes(false);
      setDisplayUrl(baseUrl);
      return;
    }

    if (loadedFullResRef.current === fullResUrl) {
      setIsFullRes(true);
      setDisplayUrl(fullResUrl);
      return;
    }

    setIsFullResLoading(true);
    const img = new Image();
    img.onload = () => {
      loadedFullResRef.current = fullResUrl;
      setIsFullRes(true);
      setDisplayUrl(fullResUrl);
      setIsFullResLoading(false);
    };
    img.onerror = () => {
      setIsFullResLoading(false);
    };
    img.src = fullResUrl;
  }, [baseUrl, canToggleFullRes, fullResUrl, isFullRes]);

  const zoomLabel = useMemo(() => `${Math.round(scale * 100)}%`, [scale]);
  const fullResLabel = isFullRes ? "View Preview" : isFullResLoading ? "Loading HD..." : "View HD";
  const fullscreenLabel = isFullscreen ? "Exit Fullscreen" : "Fullscreen";
  const filtersLabel = useMemo(
    () => `brightness(${brightness}) contrast(${contrast}) saturate(${saturate})`,
    [brightness, contrast, saturate],
  );
  const displayFilter = useMemo(
    () => (isImageLoaded ? filtersLabel : `${filtersLabel} blur(10px)`),
    [filtersLabel, isImageLoaded],
  );
  const minimapSize = useMemo(() => ({ width: 160, height: 100 }), []);
  const minimapRect = useMemo(() => {
    const { width: cw, height: ch } = containerSize;
    if (!cw || !ch) {
      return null;
    }

    const scaledW = cw * scale;
    const scaledH = ch * scale;
    if (!scaledW || !scaledH) {
      return null;
    }

    const viewX = (scaledW - cw) / 2 - translateX;
    const viewY = (scaledH - ch) / 2 - translateY;
    const rectW = minimapSize.width / scale;
    const rectH = minimapSize.height / scale;
    const rectX = (viewX / scaledW) * minimapSize.width;
    const rectY = (viewY / scaledH) * minimapSize.height;

    return {
      x: clamp(rectX, 0, minimapSize.width - rectW),
      y: clamp(rectY, 0, minimapSize.height - rectH),
      width: rectW,
      height: rectH,
    };
  }, [containerSize, minimapSize, scale, translateX, translateY]);

  const handleMinimapClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const { width: cw, height: ch } = containerSize;
      if (!cw || !ch || scale <= 1) {
        return;
      }
      const bounds = event.currentTarget.getBoundingClientRect();
      const mx = event.clientX - bounds.left;
      const my = event.clientY - bounds.top;
      const scaledW = cw * scale;
      const scaledH = ch * scale;
      const viewX = (mx / minimapSize.width) * scaledW - cw / 2;
      const viewY = (my / minimapSize.height) * scaledH - ch / 2;
      const nextX = (scaledW - cw) / 2 - viewX;
      const nextY = (scaledH - ch) / 2 - viewY;
      setTranslation(nextX, nextY, scale);
    },
    [containerSize, minimapSize, scale, setTranslation],
  );

  const presets = useMemo(
    () => [
      { label: "Natural", brightness: 1, contrast: 1, saturate: 1 },
      { label: "Deep", brightness: 1.12, contrast: 1.18, saturate: 1.3 },
      { label: "Infrared", brightness: 1.05, contrast: 1.28, saturate: 0.85 },
    ],
    [],
  );

  const isPresetActive = useCallback(
    (preset: { brightness: number; contrast: number; saturate: number }) =>
      Math.abs(brightness - preset.brightness) < 0.03 &&
      Math.abs(contrast - preset.contrast) < 0.03 &&
      Math.abs(saturate - preset.saturate) < 0.03,
    [brightness, contrast, saturate],
  );

  const applyPreset = useCallback((preset: { brightness: number; contrast: number; saturate: number }) => {
    setBrightness(preset.brightness);
    setContrast(preset.contrast);
    setSaturate(preset.saturate);
  }, []);

  const handleResetAll = useCallback(() => {
    resetZoom();
    resetFilters();
    setIsFullRes(false);
    setDisplayUrl(baseUrl);
  }, [baseUrl, resetFilters, resetZoom]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) {
        return;
      }

      if (event.key === "+" || event.key === "=") {
        zoomIn();
      } else if (event.key === "-") {
        zoomOut();
      } else if (event.key === "0") {
        resetZoom();
      } else if (event.key.toLowerCase() === "h") {
        handleToggleFullRes();
      } else if (event.key.toLowerCase() === "f") {
        toggleFullscreen();
      } else if (event.key.toLowerCase() === "l") {
        handleCopyLink();
      } else if (event.key === "?" || (event.key === "/" && event.shiftKey)) {
        setShowHelp((prev) => !prev);
      } else if (event.key === "Escape") {
        setShowHelp(false);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleCopyLink, handleToggleFullRes, resetZoom, toggleFullscreen, zoomIn, zoomOut]);

  useEffect(() => {
    if (!containerSize.width || !containerSize.height) {
      return;
    }
    if (lastRestoredIdRef.current === imageKey) {
      return;
    }

    lastRestoredIdRef.current = imageKey;
    const params = new URLSearchParams(window.location.search);
    if (params.get("img") !== imageKey) {
      return;
    }

    restoringRef.current = true;
    const z = parseFloat(params.get("z") ?? "");
    const x = parseFloat(params.get("x") ?? "");
    const y = parseFloat(params.get("y") ?? "");
    const b = parseFloat(params.get("b") ?? "");
    const c = parseFloat(params.get("c") ?? "");
    const s = parseFloat(params.get("s") ?? "");
    const hd = params.get("hd") === "1";

    const nextScale = clamp(Number.isFinite(z) ? z : 1, 1, 5);
    scaleRef.current = nextScale;
    setScale(nextScale);
    setTranslation(Number.isFinite(x) ? x : 0, Number.isFinite(y) ? y : 0, nextScale);
    setBrightness(Number.isFinite(b) ? clamp(b, 0.6, 1.6) : 1);
    setContrast(Number.isFinite(c) ? clamp(c, 0.6, 1.6) : 1);
    setSaturate(Number.isFinite(s) ? clamp(s, 0.6, 1.8) : 1);
    if (hd && canToggleFullRes) {
      setIsFullRes(true);
      setDisplayUrl(fullResUrl || baseUrl);
    }

    window.setTimeout(() => {
      restoringRef.current = false;
    }, 0);
  }, [baseUrl, canToggleFullRes, containerSize.height, containerSize.width, fullResUrl, imageKey, setTranslation]);

  useEffect(() => {
    if (restoringRef.current) {
      return;
    }
    if (updateTimerRef.current) {
      window.clearTimeout(updateTimerRef.current);
    }
    updateTimerRef.current = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      params.set("img", imageKey);
      params.set("z", scale.toFixed(2));
      params.set("x", translateX.toFixed(1));
      params.set("y", translateY.toFixed(1));
      params.set("b", brightness.toFixed(2));
      params.set("c", contrast.toFixed(2));
      params.set("s", saturate.toFixed(2));
      params.set("hd", isFullRes ? "1" : "0");
      const nextUrl = `${window.location.pathname}?${params.toString()}`;
      window.history.replaceState(null, "", nextUrl);
    }, 180);

    return () => {
      if (updateTimerRef.current) {
        window.clearTimeout(updateTimerRef.current);
      }
    };
  }, [brightness, contrast, imageKey, isFullRes, saturate, scale, translateX, translateY]);

  return (
    <div className="viewer-page">
      <section className="viewer" ref={viewerRef}>
      <div className="viewer__left">
        <button type="button" className="ghost" onClick={onBack}>
          Back to gallery
        </button>

        <div className="viewer__toolbar">
          <div className="zoom-controls">
            <button type="button" className="ghost button--small" onClick={zoomOut} aria-label="Zoom out">
              -
            </button>
            <button type="button" className="ghost button--small" onClick={resetZoom}>
              Reset
            </button>
            <button type="button" className="ghost button--small" onClick={zoomIn} aria-label="Zoom in">
              +
            </button>
            <span className="zoom-indicator">{zoomLabel}</span>
          </div>
          <div className="viewer__actions">
            <button
              type="button"
              className="ghost button--small"
              onClick={handleToggleFullRes}
              disabled={!canToggleFullRes || isFullResLoading}
            >
              {fullResLabel}
            </button>
            <button type="button" className="ghost button--small" onClick={toggleFullscreen}>
              {fullscreenLabel}
            </button>
            <button type="button" className="ghost button--small" onClick={handleCopyLink}>
              {copyStatus === "copied" ? "Link Copied" : copyStatus === "failed" ? "Copy Failed" : "Copy Link (L)"}
            </button>
            <button type="button" className="ghost button--small" onClick={() => setShowHelp(true)}>
              Shortcuts
            </button>
          </div>
        </div>

        <div className="viewer__sliders">
          <label>
            Brightness
            <input
              type="range"
              min="0.7"
              max="1.6"
              step="0.05"
              value={brightness}
              onChange={(event) => setBrightness(parseFloat(event.target.value))}
            />
          </label>
          <label>
            Contrast
            <input
              type="range"
              min="0.7"
              max="1.6"
              step="0.05"
              value={contrast}
              onChange={(event) => setContrast(parseFloat(event.target.value))}
            />
          </label>
          <label>
            Saturation
            <input
              type="range"
              min="0.6"
              max="1.8"
              step="0.05"
              value={saturate}
              onChange={(event) => setSaturate(parseFloat(event.target.value))}
            />
          </label>
          <div className="viewer__sliders-actions">
            <button type="button" className="ghost button--small" onClick={resetFilters}>
              Reset
            </button>
          </div>
        </div>

        <div className="viewer__presets">
          <p className="eyebrow">FILTER PRESETS</p>
          <div className="viewer__preset-buttons">
            {presets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className={`ghost button--small ${isPresetActive(preset) ? "active" : ""}`}
                onClick={() => applyPreset(preset)}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="viewer__view-actions">
          <button type="button" className="ghost button--small" onClick={resetZoom}>
            Fit to Screen
          </button>
          <button type="button" className="ghost button--small" onClick={handleResetAll}>
            Reset All
          </button>
        </div>

        <div className="viewer__image">
          {loading && <p className="status">Loading imagery...</p>}
          {error && <p className="status status--error">{error}</p>}
          {!isImageLoaded && !error && <div className="viewer__progress"><span /></div>}

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
                onDoubleClick={handleDoubleClick}
              >
                <img
                  ref={imageRef}
                  src={displayUrl || baseUrl}
                  alt={selected.title}
                  className="zoomed-img"
                  onLoad={() => setIsImageLoaded(true)}
                  onError={() => setIsImageLoaded(true)}
                  style={{
                    transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
                    cursor: isDragging ? "grabbing" : "grab",
                    filter: displayFilter,
                  }}
                />
                <HighlightOverlay
                  regions={analysis?.highlightedRegions ?? null}
                  enabled={highlightEnabled}
                  imageRef={imageRef}
                  transform={`translate(${translateX}px, ${translateY}px) scale(${scale})`}
                />
              </div>
              {scale > 1.02 && (
                <div
                  className="viewer__minimap"
                  style={{
                    backgroundImage: `url(${displayUrl || baseUrl})`,
                    width: `${minimapSize.width}px`,
                    height: `${minimapSize.height}px`,
                  }}
                  onClick={handleMinimapClick}
                  role="button"
                  aria-label="Minimap"
                >
                  {minimapRect && (
                    <span
                      className="viewer__minimap-viewport"
                      style={{
                        width: `${minimapRect.width}px`,
                        height: `${minimapRect.height}px`,
                        transform: `translate(${minimapRect.x}px, ${minimapRect.y}px)`,
                      }}
                    />
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <ControlBar
          onHighlight={handleHighlightToggle}
          imageUrl={displayUrl || baseUrl}
          fullResUrl={fullResUrl || displayUrl || baseUrl}
          archiveUrl={selected.archiveUrl}
          analysisActive={highlightEnabled}
          analysisLoading={analysisLoading}
          analysisDisabled={analysisDisabled}
          nasaId={nasaId}
          onDownload={() => recordSavedType(savedTypeLabel)}
        />
      </div>

      {showHelp && (
        <div className="viewer-help" role="dialog" aria-modal="true">
          <div className="viewer-help__backdrop" onClick={() => setShowHelp(false)} />
          <div className="viewer-help__panel">
            <div className="viewer-help__header">
              <p className="eyebrow">SHORTCUTS</p>
              <button type="button" className="ghost button--small" onClick={() => setShowHelp(false)}>
                Close
              </button>
            </div>
            <ul className="viewer-help__list">
              <li>
                <span>+</span>
                <span>Zoom in</span>
              </li>
              <li>
                <span>-</span>
                <span>Zoom out</span>
              </li>
              <li>
                <span>0</span>
                <span>Reset zoom</span>
              </li>
              <li>
                <span>Double-click</span>
                <span>Zoom to point</span>
              </li>
              <li>
                <span>Drag</span>
                <span>Pan image</span>
              </li>
              <li>
                <span>Scroll</span>
                <span>Zoom to cursor</span>
              </li>
              <li>
                <span>H</span>
                <span>Toggle HD</span>
              </li>
              <li>
                <span>F</span>
                <span>Fullscreen</span>
              </li>
              <li>
                <span>L</span>
                <span>Copy link</span>
              </li>
              <li>
                <span>?</span>
                <span>Show shortcuts</span>
              </li>
              <li>
                <span>Esc</span>
                <span>Close</span>
              </li>
            </ul>
          </div>
        </div>
      )}

        <InfoPanel
          selected={selected}
          metadata={imageData?.metadata ?? selected.raw}
          analysis={analysis}
          analysisLoading={analysisLoading}
          onTagSelect={(tag) => onSearch(tag)}
        />
      </section>
      {relatedItems.length > 0 && (
        <section className="viewer-related">
          <div className="viewer-related__header">
            <p className="eyebrow">RELATED DISCOVERIES</p>
            <h2>Related discoveries</h2>
            <p className="subtitle">Based on shared metadata and observation context.</p>
          </div>
          <div className="viewer-related__grid">
            {relatedItems.map(({ item, reasons }) => (
              <ResultCard key={item.id} item={item} onClick={onSelectRelated} contextBadges={reasons} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default ViewerPage;
