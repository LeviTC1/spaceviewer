import { FC, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ControlBar from "./ControlBar";
import InfoPanel from "./InfoPanel";
import ResultCard from "../results/ResultCard";
import SegmentedControl from "../ui/SegmentedControl";
import type { SpaceImage } from "../../models/SpaceImage";
import type { DiscoverySession } from "../../models/DiscoverySession";
import useImageData from "../../hooks/useImageData";
import { classifyObjectType } from "../../insights/classifyObjectType";
import { recordSavedType } from "../../utils/sessionMemory";
import { addToWorkingCollection, getCollectionImageKey, readWorkingCollection, removeFromWorkingCollection, writeWorkingCollection } from "../../utils/observationCollection";
import { Icon } from "../../shell/Icon";
import { formatYear, lightStory, matchImageToPlace, placeDistanceLy, type Place } from "../../shell/places";

interface ViewerPageProps {
  selected: SpaceImage;
  relatedPool: SpaceImage[];
  onSelectRelated: (item: SpaceImage) => void;
  compareSet?: SpaceImage[];
  onSelectCompareItem?: (item: SpaceImage) => void;
  onSearch: (value?: string) => void;
  onBack: () => void;
  discoverySession?: DiscoverySession | null;
  /** Fly to the place this photograph shows, in the live universe. */
  onOpenPlace?: (placeId: string) => void;
}

/** "Where is this?": the bridge from a photograph to the place it shows. */
const PlaceCard: FC<{ place: Place; onFly?: () => void }> = ({ place, onFly }) => {
  const ly = placeDistanceLy(place);
  const story = ly !== undefined ? lightStory(ly) : null;
  return (
    <section className="vw-place" aria-label="Where is this?">
      <p className="sv-eyebrow">Where is this?</p>
      <h2 className="sv-serif">{place.name}</h2>
      <p className="vw-place__blurb">{place.blurb}</p>
      {story ? (
        <p className="vw-place__light">
          <span className="sv-mark sv-mark--derived">Derived</span>
          {ly !== undefined && ly < 0.01 ? (
            <>Sunlight reflected here reaches us in about <strong>{story.travel}</strong>.</>
          ) : (
            <>
              The light in this photograph left {place.name} <strong>{story.travel} ago</strong>
              {story.departed !== null && ly !== undefined && ly >= 100 ? <>, around {formatYear(story.departed)}</> : null}
              {story.era ? <>: {story.era}</> : null}.
            </>
          )}
        </p>
      ) : null}
      {onFly ? (
        <button type="button" className="sv-btn sv-btn--primary vw-place__fly" onClick={onFly}>
          <Icon name="fly" size={16} /> Fly to {place.name}
        </button>
      ) : null}
      <p className="vw-place__note">Matched from the photograph's title and keywords. Distance is the catalogue value.</p>
    </section>
  );
};

interface ViewerAnnotation {
  id: string;
  label: string;
  x: number;
  y: number;
  createdAt: string;
}

interface ExposureAnalysis {
  status: "idle" | "loading" | "ready" | "unavailable";
  histogram: number[];
  mean: number;
  clippedShadows: number;
  clippedHighlights: number;
  contrast: number;
  sampleCount: number;
  sampleWidth: number;
  sampleHeight: number;
  message?: string;
}

type ViewerFitMode = "fit" | "width" | "fill" | "actual";

const HISTOGRAM_BUCKETS = 16;
const EXPOSURE_SAMPLE_SIZE = 180;

const viewerShortcutGroups = [
  {
    title: "Inspect",
    shortcuts: [
      { keys: ["+", "="], label: "Zoom in" },
      { keys: ["-"], label: "Zoom out" },
      { keys: ["0"], label: "Reset zoom" },
      { keys: ["R"], label: "Reset view and filters" },
      { keys: ["Double-click"], label: "Zoom to point" },
      { keys: ["Drag"], label: "Pan image" },
      { keys: ["Scroll"], label: "Zoom to cursor" },
    ],
  },
  {
    title: "View",
    shortcuts: [
      { keys: ["1"], label: "Fit" },
      { keys: ["2"], label: "Width fit" },
      { keys: ["3"], label: "Fill" },
      { keys: ["4"], label: "Actual size" },
      { keys: ["B"], label: "Toggle before view" },
      { keys: ["H"], label: "Toggle HD" },
      { keys: ["F"], label: "Fullscreen" },
    ],
  },
  {
    title: "Workflow",
    shortcuts: [
      { keys: ["A"], label: "Add note mode" },
      { keys: ["V"], label: "Show or hide notes" },
      { keys: ["N", "]"], label: "Next compare image" },
      { keys: ["P", "["], label: "Previous compare image" },
      { keys: ["L"], label: "Copy link" },
      { keys: ["?"], label: "Show shortcuts" },
      { keys: ["Esc"], label: "Close panel" },
    ],
  },
];

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const createEmptyExposureAnalysis = (status: ExposureAnalysis["status"] = "idle", message?: string): ExposureAnalysis => ({
  status,
  histogram: Array.from({ length: HISTOGRAM_BUCKETS }, () => 0),
  mean: 0,
  clippedShadows: 0,
  clippedHighlights: 0,
  contrast: 0,
  sampleCount: 0,
  sampleWidth: 0,
  sampleHeight: 0,
  message,
});

const getExposureToneLabel = (analysis: ExposureAnalysis) => {
  if (analysis.status !== "ready") return "";
  if (analysis.clippedHighlights > 10) return "Highlight rich";
  if (analysis.clippedShadows > 24) return "Shadow heavy";
  if (analysis.contrast > 42) return "High contrast";
  if (analysis.mean > 62) return "Bright field";
  if (analysis.mean < 28) return "Low-key field";
  return "Balanced";
};

const formatExposurePercent = (value: number) => `${Math.round(value)}%`;

const isViewerFitMode = (value: string | null): value is ViewerFitMode =>
  value === "fit" || value === "width" || value === "fill" || value === "actual";

const annotationStorageKey = (imageKey: string) => `spaceviewer.annotations.${imageKey}`;

const getViewerItemKey = (image: SpaceImage) => `${image.source ?? "nasa"}:${image.nasaId ?? image.id}`;

const getViewerItemContext = (image: SpaceImage) =>
  [image.mission || image.instrument || image.center || image.source?.toUpperCase(), image.date].filter(Boolean).join(" · ");

const readStoredAnnotations = (imageKey: string): ViewerAnnotation[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(annotationStorageKey(imageKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ViewerAnnotation[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) =>
        typeof item.id === "string" &&
        typeof item.label === "string" &&
        typeof item.x === "number" &&
        typeof item.y === "number",
    );
  } catch (error) {
    console.warn("Unable to read viewer annotations", error);
    return [];
  }
};

const writeStoredAnnotations = (imageKey: string, annotations: ViewerAnnotation[]) => {
  if (typeof window === "undefined") return;
  try {
    if (annotations.length) {
      window.localStorage.setItem(annotationStorageKey(imageKey), JSON.stringify(annotations));
    } else {
      window.localStorage.removeItem(annotationStorageKey(imageKey));
    }
  } catch (error) {
    console.warn("Unable to store viewer annotations", error);
  }
};

const ViewerPage: FC<ViewerPageProps> = ({
  selected,
  relatedPool,
  onSelectRelated,
  compareSet,
  onSelectCompareItem,
  onSearch,
  onBack,
  discoverySession,
  onOpenPlace,
}) => {
  const place = useMemo(() => matchImageToPlace(selected), [selected]);
  const [savedKeys, setSavedKeys] = useState(() => new Set(readWorkingCollection().items.map((item) => item.key)));
  useEffect(() => {
    const sync = () => setSavedKeys(new Set(readWorkingCollection().items.map((item) => item.key)));
    window.addEventListener("spaceviewer:collection-updated", sync);
    return () => window.removeEventListener("spaceviewer:collection-updated", sync);
  }, []);
  const isSaved = savedKeys.has(getCollectionImageKey(selected));
  const toggleSaved = () => {
    const collection = readWorkingCollection();
    const key = getCollectionImageKey(selected);
    writeWorkingCollection(isSaved ? removeFromWorkingCollection(collection, key) : addToWorkingCollection(collection, selected));
  };
  const { loading, error, imageData, loadImage } = useImageData();
  const imageRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<HTMLElement | null>(null);

  const [scale, setScale] = useState(1);
  const [translateX, setTranslateX] = useState(0);
  const [translateY, setTranslateY] = useState(0);
  const [fitMode, setFitMode] = useState<ViewerFitMode>("fit");
  const [filterCompareEnabled, setFilterCompareEnabled] = useState(false);
  const [filterComparePosition, setFilterComparePosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [displayUrl, setDisplayUrl] = useState("");
  const [isFullRes, setIsFullRes] = useState(false);
  const [isFullResLoading, setIsFullResLoading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [annotations, setAnnotations] = useState<ViewerAnnotation[]>([]);
  const [annotationsVisible, setAnnotationsVisible] = useState(true);
  const [annotationMode, setAnnotationMode] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [brightness, setBrightness] = useState(1);
  const [contrast, setContrast] = useState(1);
  const [saturate, setSaturate] = useState(1);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [containerElement, setContainerElement] = useState<HTMLDivElement | null>(null);
  const [imageNaturalSize, setImageNaturalSize] = useState({ width: 0, height: 0 });
  const [exposureAnalysis, setExposureAnalysis] = useState<ExposureAnalysis>(() => createEmptyExposureAnalysis());
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
  const skipAnnotationWriteRef = useRef(true);
  const stageSizeRef = useRef({ width: 0, height: 0 });

  useEffect(() => {
    setScale(1);
    setTranslateX(0);
    setTranslateY(0);
    setFitMode("fit");
    setFilterCompareEnabled(false);
    setFilterComparePosition(50);
    setIsFullRes(false);
    setIsFullResLoading(false);
    setShowHelp(false);
    setIsImageLoaded(false);
    setCopyStatus("idle");
    setBrightness(1);
    setContrast(1);
    setSaturate(1);
    setImageNaturalSize({ width: 0, height: 0 });
    setAnnotationsVisible(true);
    setAnnotationMode(false);
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
  const selectedCompareKey = getViewerItemKey(selected);
  const nasaId = selected.source === "nasa" ? (selected.nasaId ?? selected.id) : undefined;
  const savedTypeLabel = useMemo(() => classifyObjectType(selected), [selected]);
  const exposureToneLabel = getExposureToneLabel(exposureAnalysis);

  const compareItems = useMemo(() => {
    const unique = new Map<string, SpaceImage>();
    (compareSet ?? []).forEach((item) => unique.set(getViewerItemKey(item), item));
    return Array.from(unique.values());
  }, [compareSet]);
  const activeCompareIndex = compareItems.findIndex((item) => getViewerItemKey(item) === selectedCompareKey);
  const hasCompareSet = compareItems.length > 1 && activeCompareIndex >= 0;
  const previousCompareItem = hasCompareSet
    ? compareItems[(activeCompareIndex + compareItems.length - 1) % compareItems.length]
    : null;
  const nextCompareItem = hasCompareSet ? compareItems[(activeCompareIndex + 1) % compareItems.length] : null;

  const selectCompareItem = useCallback((item: SpaceImage | null) => {
    if (!item || getViewerItemKey(item) === selectedCompareKey) {
      return;
    }
    onSelectCompareItem?.(item);
  }, [onSelectCompareItem, selectedCompareKey]);

  useEffect(() => {
    skipAnnotationWriteRef.current = true;
    setAnnotations(readStoredAnnotations(imageKey));
  }, [imageKey]);

  useEffect(() => {
    if (skipAnnotationWriteRef.current) {
      skipAnnotationWriteRef.current = false;
      return;
    }
    writeStoredAnnotations(imageKey, annotations);
  }, [annotations, imageKey]);

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
  }, [displayUrl, baseUrl, loading, error]);

  useEffect(() => {
    if (displayUrl) {
      setIsImageLoaded(false);
    }
  }, [displayUrl]);

  useEffect(() => {
    const sampleUrl = displayUrl || baseUrl;
    if (!sampleUrl) {
      setExposureAnalysis(createEmptyExposureAnalysis());
      return;
    }

    if (typeof window !== "undefined" && /^https?:\/\//i.test(sampleUrl)) {
      try {
        const sampleOrigin = new URL(sampleUrl).origin;
        if (sampleOrigin !== window.location.origin) {
          setExposureAnalysis(
            createEmptyExposureAnalysis("unavailable", "Pixel analysis is blocked for this remote image source."),
          );
          return;
        }
      } catch {
        setExposureAnalysis(createEmptyExposureAnalysis("unavailable", "Pixel analysis is unavailable for this image."));
        return;
      }
    }

    let cancelled = false;
    setExposureAnalysis(createEmptyExposureAnalysis("loading"));

    const sampleImage = new Image();
    if (!sampleUrl.startsWith("data:")) {
      sampleImage.crossOrigin = "anonymous";
    }

    sampleImage.onload = () => {
      if (cancelled) return;
      try {
        const naturalWidth = sampleImage.naturalWidth || sampleImage.width;
        const naturalHeight = sampleImage.naturalHeight || sampleImage.height;
        if (!naturalWidth || !naturalHeight) {
          setExposureAnalysis(createEmptyExposureAnalysis("unavailable", "Image dimensions were not available."));
          return;
        }

        const scale = Math.min(1, EXPOSURE_SAMPLE_SIZE / Math.max(naturalWidth, naturalHeight));
        const sampleWidth = Math.max(1, Math.round(naturalWidth * scale));
        const sampleHeight = Math.max(1, Math.round(naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = sampleWidth;
        canvas.height = sampleHeight;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) {
          setExposureAnalysis(createEmptyExposureAnalysis("unavailable", "Canvas sampling is unavailable."));
          return;
        }

        context.drawImage(sampleImage, 0, 0, sampleWidth, sampleHeight);
        const data = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
        const histogram = Array.from({ length: HISTOGRAM_BUCKETS }, () => 0);
        let sum = 0;
        let sumSquared = 0;
        let clippedShadows = 0;
        let clippedHighlights = 0;
        let sampleCount = 0;

        for (let index = 0; index < data.length; index += 4) {
          if (data[index + 3] < 16) {
            continue;
          }
          const luminance = data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722;
          const bucket = Math.min(HISTOGRAM_BUCKETS - 1, Math.floor((luminance / 256) * HISTOGRAM_BUCKETS));
          histogram[bucket] += 1;
          sum += luminance;
          sumSquared += luminance * luminance;
          clippedShadows += luminance <= 20 ? 1 : 0;
          clippedHighlights += luminance >= 235 ? 1 : 0;
          sampleCount += 1;
        }

        if (!sampleCount) {
          setExposureAnalysis(createEmptyExposureAnalysis("unavailable", "No opaque pixels were available to sample."));
          return;
        }

        const meanLuminance = sum / sampleCount;
        const variance = Math.max(0, sumSquared / sampleCount - meanLuminance * meanLuminance);
        setExposureAnalysis({
          status: "ready",
          histogram,
          mean: (meanLuminance / 255) * 100,
          clippedShadows: (clippedShadows / sampleCount) * 100,
          clippedHighlights: (clippedHighlights / sampleCount) * 100,
          contrast: (Math.sqrt(variance) / 128) * 100,
          sampleCount,
          sampleWidth,
          sampleHeight,
        });
      } catch (error) {
        console.warn("Image exposure analysis unavailable", error);
        setExposureAnalysis(
          createEmptyExposureAnalysis("unavailable", "Pixel analysis is blocked for this source image."),
        );
      }
    };

    sampleImage.onerror = () => {
      if (cancelled) return;
      setExposureAnalysis(createEmptyExposureAnalysis("unavailable", "Unable to load image for exposure sampling."));
    };

    sampleImage.src = sampleUrl;
    return () => {
      cancelled = true;
    };
  }, [baseUrl, displayUrl]);

  useEffect(() => {
    const image = imageRef.current;
    if (!image) {
      return;
    }
    let frame = 0;
    let attempts = 0;

    const syncNaturalSize = () => {
      if (!image.naturalWidth || !image.naturalHeight) {
        return false;
      }
      setIsImageLoaded(true);
      setImageNaturalSize({
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
      return true;
    };

    const syncUntilReady = () => {
      if (syncNaturalSize()) {
        return;
      }
      attempts += 1;
      if (attempts < 60) {
        frame = requestAnimationFrame(syncUntilReady);
      }
    };

    syncUntilReady();
    image.addEventListener("load", syncNaturalSize);
    return () => {
      cancelAnimationFrame(frame);
      image.removeEventListener("load", syncNaturalSize);
    };
  }, [displayUrl, baseUrl, loading, error]);

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  useEffect(() => {
    translateRef.current = { x: translateX, y: translateY };
  }, [translateX, translateY]);

  const attachContainerRef = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node;
    setContainerElement(node);
  }, []);

  useEffect(() => {
    if (!containerElement) {
      setContainerSize({ width: 0, height: 0 });
      return;
    }

    const updateContainerSize = (width: number, height: number) => {
      setContainerSize((current) =>
        current.width === width && current.height === height ? current : { width, height },
      );
    };

    const rect = containerElement.getBoundingClientRect();
    updateContainerSize(rect.width, rect.height);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const { width, height } = entry.contentRect;
        updateContainerSize(width, height);
      }
    });
    observer.observe(containerElement);
    return () => observer.disconnect();
  }, [containerElement]);

  const stageSize = useMemo(() => {
    const { width: containerWidth, height: containerHeight } = containerSize;
    const naturalWidth = imageNaturalSize.width || containerWidth || 1;
    const naturalHeight = imageNaturalSize.height || containerHeight || 1;

    if (!containerWidth || !containerHeight || !naturalWidth || !naturalHeight) {
      return {
        width: Math.max(containerWidth, 1),
        height: Math.max(containerHeight, 1),
      };
    }

    const fitScale =
      fitMode === "fill"
        ? Math.max(containerWidth / naturalWidth, containerHeight / naturalHeight)
        : fitMode === "width"
          ? containerWidth / naturalWidth
          : fitMode === "actual"
            ? 1
            : Math.min(containerWidth / naturalWidth, containerHeight / naturalHeight);

    return {
      width: Math.max(1, Math.round(naturalWidth * fitScale)),
      height: Math.max(1, Math.round(naturalHeight * fitScale)),
    };
  }, [containerSize, fitMode, imageNaturalSize]);

  useEffect(() => {
    stageSizeRef.current = stageSize;
  }, [stageSize]);

  const clampTranslation = useCallback(
    (x: number, y: number, scaleValue: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) {
        return { x, y };
      }
      const { width: stageWidth, height: stageHeight } = stageSizeRef.current;

      const maxX = Math.max(0, (stageWidth * scaleValue - rect.width) / 2);
      const maxY = Math.max(0, (stageHeight * scaleValue - rect.height) / 2);

      return {
        x: clamp(x, -maxX, maxX),
        y: clamp(y, -maxY, maxY),
      };
    },
    [],
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

  const addAnnotationAtPoint = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const { width: stageWidth, height: stageHeight } = stageSizeRef.current;
    if (!rect || !rect.width || !rect.height) {
      return;
    }

    const currentScale = scaleRef.current;
    const currentTranslate = translateRef.current;
    const stageLeft = rect.left + rect.width / 2 - (stageWidth * currentScale) / 2 + currentTranslate.x;
    const stageTop = rect.top + rect.height / 2 - (stageHeight * currentScale) / 2 + currentTranslate.y;
    const x = clamp((clientX - stageLeft) / (stageWidth * currentScale), 0, 1);
    const y = clamp((clientY - stageTop) / (stageHeight * currentScale), 0, 1);

    setAnnotations((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.round(Math.random() * 1_000_000)}`,
        label: `Note ${prev.length + 1}`,
        x,
        y,
        createdAt: new Date().toISOString(),
      },
    ]);
    setAnnotationsVisible(true);
    setAnnotationMode(false);
  }, []);

  const updateAnnotationLabel = useCallback((id: string, label: string) => {
    setAnnotations((prev) =>
      prev.map((annotation) => (annotation.id === id ? { ...annotation, label } : annotation)),
    );
  }, []);

  const removeAnnotation = useCallback((id: string) => {
    setAnnotations((prev) => prev.filter((annotation) => annotation.id !== id));
  }, []);

  const handleWheel = (event: React.WheelEvent) => {
    event.preventDefault();
    cancelInertia();
    const delta = -event.deltaY / 500;
    zoomBy(delta, event.clientX, event.clientY);
  };

  const handleMouseDown = (event: React.MouseEvent) => {
    event.preventDefault();
    cancelInertia();
    if (annotationMode) {
      event.stopPropagation();
      addAnnotationAtPoint(event.clientX, event.clientY);
      return;
    }
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

  const applyFitMode = useCallback(
    (mode: ViewerFitMode) => {
      setFitMode(mode);
      scaleRef.current = 1;
      setScale(1);
      setTranslation(0, 0, 1);
    },
    [setTranslation],
  );

  const zoomIn = useCallback(() => zoomBy(0.25), [zoomBy]);
  const zoomOut = useCallback(() => zoomBy(-0.25), [zoomBy]);

  const handleDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      if (annotationMode) {
        return;
      }
      cancelInertia();
      if (scaleRef.current >= 2) {
        resetZoom();
      } else {
        zoomTo(2.5, event.clientX, event.clientY);
      }
    },
    [annotationMode, cancelInertia, resetZoom, zoomTo],
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
    const { width: stageWidth, height: stageHeight } = stageSize;
    if (!cw || !ch || !stageWidth || !stageHeight) {
      return null;
    }

    const scaledW = stageWidth * scale;
    const scaledH = stageHeight * scale;
    if (!scaledW || !scaledH) {
      return null;
    }

    const viewX = (scaledW - cw) / 2 - translateX;
    const viewY = (scaledH - ch) / 2 - translateY;
    const rectW = Math.min(minimapSize.width, (cw / scaledW) * minimapSize.width);
    const rectH = Math.min(minimapSize.height, (ch / scaledH) * minimapSize.height);
    const rectX = (viewX / scaledW) * minimapSize.width;
    const rectY = (viewY / scaledH) * minimapSize.height;

    return {
      x: clamp(rectX, 0, minimapSize.width - rectW),
      y: clamp(rectY, 0, minimapSize.height - rectH),
      width: rectW,
      height: rectH,
    };
  }, [containerSize, minimapSize, scale, stageSize, translateX, translateY]);

  const handleMinimapClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const { width: cw, height: ch } = containerSize;
      const { width: stageWidth, height: stageHeight } = stageSize;
      if (!cw || !ch || !stageWidth || !stageHeight) {
        return;
      }
      const bounds = event.currentTarget.getBoundingClientRect();
      const mx = event.clientX - bounds.left;
      const my = event.clientY - bounds.top;
      const scaledW = stageWidth * scale;
      const scaledH = stageHeight * scale;
      const desiredCenterX = (mx / minimapSize.width) * scaledW;
      const desiredCenterY = (my / minimapSize.height) * scaledH;
      const nextX = scaledW / 2 - desiredCenterX;
      const nextY = scaledH / 2 - desiredCenterY;
      setTranslation(nextX, nextY, scale);
    },
    [containerSize, minimapSize, scale, setTranslation, stageSize],
  );

  useEffect(() => {
    setTranslation(translateRef.current.x, translateRef.current.y, scaleRef.current);
  }, [setTranslation, stageSize.height, stageSize.width]);

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

  const fitModeOptions: Array<{ value: ViewerFitMode; label: string }> = useMemo(
    () => [
      { value: "fit", label: "Fit" },
      { value: "width", label: "Width" },
      { value: "fill", label: "Fill" },
      { value: "actual", label: "1:1" },
    ],
    [],
  );

  const isFilterAdjusted =
    Math.abs(brightness - 1) > 0.01 || Math.abs(contrast - 1) > 0.01 || Math.abs(saturate - 1) > 0.01;
  const showMinimap =
    stageSize.width * scale > containerSize.width + 2 || stageSize.height * scale > containerSize.height + 2;
  const stageTransform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
  const imageCursor = annotationMode ? "crosshair" : isDragging ? "grabbing" : "grab";
  const histogramPeak = Math.max(...exposureAnalysis.histogram, 1);
  const fitModeLabel = fitModeOptions.find((option) => option.value === fitMode)?.label ?? "Fit";
  const hasViewportOffset = scale > 1.01 || Math.abs(translateX) > 1 || Math.abs(translateY) > 1;
  const filterStateLabel = isFilterAdjusted
    ? `B ${Math.round(brightness * 100)} C ${Math.round(contrast * 100)} S ${Math.round(saturate * 100)}`
    : "Natural";
  const assetStateLabel = isFullRes ? "HD" : canToggleFullRes ? "Preview" : "Preview only";
  const notesStateLabel = annotationMode
    ? "Placing"
    : annotations.length
      ? `${annotations.length} ${annotations.length === 1 ? "note" : "notes"}${annotationsVisible ? "" : " hidden"}`
      : "None";
  const compareStateLabel = hasCompareSet ? `${activeCompareIndex + 1}/${compareItems.length}` : "";

  const handleResetAll = useCallback(() => {
    applyFitMode("fit");
    resetFilters();
    setFilterCompareEnabled(false);
    setFilterComparePosition(50);
    setIsFullRes(false);
    setDisplayUrl(baseUrl);
  }, [applyFitMode, baseUrl, resetFilters]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target &&
        (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable);
      if (isTypingTarget || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const key = event.key.toLowerCase();
      const isHelpKey = event.key === "?" || (event.key === "/" && event.shiftKey);

      if (showHelp) {
        if (event.key === "Escape" || isHelpKey) {
          event.preventDefault();
          setShowHelp(false);
        }
        return;
      }

      const runShortcut = (action: () => void) => {
        event.preventDefault();
        action();
      };

      if (event.key === "+" || event.key === "=") {
        runShortcut(zoomIn);
      } else if (event.key === "-") {
        runShortcut(zoomOut);
      } else if (event.key === "0") {
        runShortcut(resetZoom);
      } else if (key === "r") {
        runShortcut(handleResetAll);
      } else if (event.key === "1") {
        runShortcut(() => applyFitMode("fit"));
      } else if (event.key === "2") {
        runShortcut(() => applyFitMode("width"));
      } else if (event.key === "3") {
        runShortcut(() => applyFitMode("fill"));
      } else if (event.key === "4") {
        runShortcut(() => applyFitMode("actual"));
      } else if (key === "b") {
        runShortcut(() => {
          if (isFilterAdjusted) {
            setFilterCompareEnabled((prev) => !prev);
          }
        });
      } else if (key === "a") {
        runShortcut(() => setAnnotationMode((prev) => !prev));
      } else if (key === "v") {
        runShortcut(() => {
          if (annotations.length) {
            setAnnotationsVisible((prev) => !prev);
          }
        });
      } else if (key === "h") {
        runShortcut(handleToggleFullRes);
      } else if (key === "f") {
        runShortcut(toggleFullscreen);
      } else if (key === "l") {
        runShortcut(handleCopyLink);
      } else if (key === "n" || event.key === "]") {
        runShortcut(() => selectCompareItem(nextCompareItem));
      } else if (key === "p" || event.key === "[") {
        runShortcut(() => selectCompareItem(previousCompareItem));
      } else if (isHelpKey) {
        event.preventDefault();
        setShowHelp((prev) => !prev);
      } else if (event.key === "Escape") {
        event.preventDefault();
        setShowHelp(false);
        setAnnotationMode(false);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    annotations.length,
    applyFitMode,
    handleCopyLink,
    handleResetAll,
    handleToggleFullRes,
    isFilterAdjusted,
    nextCompareItem,
    previousCompareItem,
    resetZoom,
    selectCompareItem,
    showHelp,
    toggleFullscreen,
    zoomIn,
    zoomOut,
  ]);

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
    const nextFitMode = params.get("fit");

    if (isViewerFitMode(nextFitMode)) {
      setFitMode(nextFitMode);
    }
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
      params.set("fit", fitMode);
      const nextUrl = `${window.location.pathname}?${params.toString()}`;
      window.history.replaceState(null, "", nextUrl);
    }, 180);

    return () => {
      if (updateTimerRef.current) {
        window.clearTimeout(updateTimerRef.current);
      }
    };
  }, [brightness, contrast, fitMode, imageKey, isFullRes, saturate, scale, translateX, translateY]);

  return (
    <div className="viewer-page vw">
      <section className="viewer vw-layout" ref={viewerRef}>
        <div className="viewer__left vw-main">
          <header className="vw-head">
            <div className="vw-head__top">
              <button type="button" className="sv-btn sv-btn--quiet sv-btn--small vw-back" onClick={onBack}>
                <Icon name="back" size={14} /> {discoverySession ? "Back to wandering" : "Back"}
              </button>
              {discoverySession && <span className="viewer__session-pill">{discoverySession.name}</span>}
            </div>
            <h1 className="vw-title sv-serif">{selected.title}</h1>
            <p className="vw-byline">
              {[selected.center || selected.photographer, selected.mission || selected.instrument, selected.date ? new Date(selected.date).getUTCFullYear() || selected.date : null].filter(Boolean).join(" · ")}
            </p>
            <div className="vw-head__actions">
              <button
                type="button"
                className={`sv-btn sv-btn--small${isSaved ? " is-on" : ""}`}
                onClick={toggleSaved}
                aria-pressed={isSaved}
              >
                <Icon name={isSaved ? "star-filled" : "star"} size={14} /> {isSaved ? "Saved" : "Save"}
              </button>
              <ControlBar
          onToggleAnnotationMode={() => setAnnotationMode((prev) => !prev)}
          onToggleAnnotations={() => setAnnotationsVisible((prev) => !prev)}
          imageUrl={displayUrl || baseUrl}
          fullResUrl={fullResUrl || displayUrl || baseUrl}
          archiveUrl={selected.archiveUrl}
          annotationMode={annotationMode}
          annotationsVisible={annotationsVisible}
          annotationCount={annotations.length}
          nasaId={nasaId}
          onDownload={() => recordSavedType(savedTypeLabel)}
        />
            </div>
          </header>
          <div className="viewer__toolbar">
          <div className="zoom-controls">
            <button type="button" className="ghost button--small" onClick={zoomOut} aria-label="Zoom out" aria-keyshortcuts="-">
              -
            </button>
            <button type="button" className="ghost button--small" onClick={resetZoom} aria-keyshortcuts="0">
              Reset
            </button>
            <button type="button" className="ghost button--small" onClick={zoomIn} aria-label="Zoom in" aria-keyshortcuts="+ =">
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
              aria-keyshortcuts="H"
            >
              {fullResLabel}
            </button>
            <button type="button" className="ghost button--small" onClick={toggleFullscreen} aria-keyshortcuts="F">
              {fullscreenLabel}
            </button>
            <button type="button" className="ghost button--small" onClick={handleCopyLink} aria-keyshortcuts="L">
              {copyStatus === "copied" ? "Link Copied" : copyStatus === "failed" ? "Copy Failed" : "Copy Link (L)"}
            </button>
            <button type="button" className="ghost button--small" onClick={() => setShowHelp(true)} aria-keyshortcuts="?">
              Shortcuts
            </button>
          </div>
        </div>
          <div className="viewer__image">
          {loading && <p className="status">Loading imagery...</p>}
          {error && <p className="status status--error">{error}</p>}
          {!isImageLoaded && !error && <div className="viewer__progress"><span /></div>}

          {!loading && !error && (
            <>
              <div
                ref={attachContainerRef}
                className="zoom-container"
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onDoubleClick={handleDoubleClick}
              >
                <div
                  ref={stageRef}
                  className="viewer__image-stage"
                  style={{
                    width: `${stageSize.width}px`,
                    height: `${stageSize.height}px`,
                    transform: stageTransform,
                    cursor: imageCursor,
                  }}
                  data-fit-mode={fitMode}
                >
                  <img
                    ref={imageRef}
                    src={displayUrl || baseUrl}
                    alt={selected.title}
                    className="zoomed-img"
                    onLoad={(event) => {
                      setIsImageLoaded(true);
                      setImageNaturalSize({
                        width: event.currentTarget.naturalWidth,
                        height: event.currentTarget.naturalHeight,
                      });
                    }}
                    onError={() => setIsImageLoaded(true)}
                    style={{
                      filter: displayFilter,
                    }}
                  />
                  {filterCompareEnabled && isFilterAdjusted && (
                    <>
                      <div
                        className="viewer__before-layer"
                        style={{ clipPath: `inset(0 ${100 - filterComparePosition}% 0 0)` }}
                        aria-hidden="true"
                      >
                        <img src={displayUrl || baseUrl} alt="" />
                      </div>
                      <span className="viewer__comparison-divider" style={{ left: `${filterComparePosition}%` }}>
                        <i>Original</i>
                      </span>
                    </>
                  )}
                  {annotationsVisible && annotations.length > 0 && (
                    <div className="annotation-overlay">
                      {annotations.map((annotation, index) => (
                        <span
                          key={annotation.id}
                          className="annotation-marker"
                          style={{ left: `${annotation.x * 100}%`, top: `${annotation.y * 100}%` }}
                          title={annotation.label}
                        >
                          <i>{index + 1}</i>
                          <strong>{annotation.label}</strong>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {showMinimap && (
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
          {hasCompareSet && (
          <section className="viewer__compare-set" aria-label="Viewer compare set">
            <div className="viewer__compare-set-header">
              <div>
                <p className="eyebrow">COMPARE SET</p>
                <h3>
                  {activeCompareIndex + 1}/{compareItems.length} candidates
                </h3>
                <p>{selected.title}</p>
              </div>
              <div className="viewer__compare-nav">
                <button
                  type="button"
                  className="ghost button--small"
                  onClick={() => selectCompareItem(previousCompareItem)}
                  aria-label={`Previous comparison image: ${previousCompareItem?.title ?? "none"}`}
                  aria-keyshortcuts="P ["
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="ghost button--small"
                  onClick={() => selectCompareItem(nextCompareItem)}
                  aria-label={`Next comparison image: ${nextCompareItem?.title ?? "none"}`}
                  aria-keyshortcuts="N ]"
                >
                  Next
                </button>
              </div>
            </div>
            <div className="viewer__compare-strip">
              {compareItems.map((item, index) => {
                const itemKey = getViewerItemKey(item);
                const isActive = itemKey === selectedCompareKey;
                const thumbnail = item.thumbnailUrl || item.imageUrl;
                return (
                  <button
                    key={itemKey}
                    type="button"
                    className={`viewer__compare-thumb ${isActive ? "is-active" : ""}`}
                    onClick={() => selectCompareItem(item)}
                    aria-current={isActive ? "true" : undefined}
                  >
                    <img src={thumbnail} alt="" loading="lazy" />
                    <span>
                      <strong>
                        {index + 1}. {item.title}
                      </strong>
                      <em>{getViewerItemContext(item) || "Observation candidate"}</em>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
        </div>

        <aside className="vw-side" aria-label="About this photograph">
          {place ? <PlaceCard place={place} onFly={onOpenPlace ? () => onOpenPlace(place.id) : undefined} /> : null}
          <details className="vw-tool">
            <summary>
              <Icon name="settings" size={14} /> Adjust the image
            </summary>
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
          <SegmentedControl
            value={fitMode}
            options={fitModeOptions}
            onChange={applyFitMode}
            ariaLabel="Image fit mode"
            className="viewer__fit-modes"
            buttonClassName="ghost button--small"
          />
        </div>
            <div className="viewer__comparison">
          <div className="viewer__comparison-header">
            <div>
              <p className="eyebrow">FILTER COMPARISON</p>
              <span>{isFilterAdjusted ? "Compare edited view against the original image." : "Apply a preset or slider to compare filters."}</span>
            </div>
            <button
              type="button"
              className={`ghost button--small ${filterCompareEnabled ? "active" : ""}`}
              onClick={() => setFilterCompareEnabled((prev) => !prev)}
              disabled={!isFilterAdjusted}
              aria-pressed={filterCompareEnabled}
              aria-keyshortcuts="B"
            >
              {filterCompareEnabled ? "Hide before" : "Show before"}
            </button>
          </div>
          <label className="viewer__comparison-slider">
            Split
            <input
              type="range"
              min="5"
              max="95"
              step="1"
              value={filterComparePosition}
              onChange={(event) => setFilterComparePosition(Number(event.target.value))}
              disabled={!filterCompareEnabled || !isFilterAdjusted}
            />
          </label>
        </div>
            <section className="viewer__state-rail" aria-label="Viewer inspection state">
          <div className="viewer__state-rail-header">
            <p className="eyebrow">VIEW STATE</p>
            <button type="button" className="ghost button--small" onClick={handleResetAll} aria-keyshortcuts="R">
              Reset all
            </button>
          </div>
          <div className="viewer__state-items">
            <button
              type="button"
              className={`viewer__state-chip ${hasViewportOffset ? "is-active" : ""}`}
              onClick={resetZoom}
              aria-label="Reset zoom and pan"
            >
              <span>Zoom</span>
              <strong>{zoomLabel}</strong>
            </button>
            <button
              type="button"
              className={`viewer__state-chip ${fitMode !== "fit" ? "is-active" : ""}`}
              onClick={() => applyFitMode("fit")}
              aria-label="Reset fit mode to Fit"
            >
              <span>Fit</span>
              <strong>{fitModeLabel}</strong>
            </button>
            <button
              type="button"
              className={`viewer__state-chip ${isFilterAdjusted ? "is-active" : ""}`}
              onClick={resetFilters}
              disabled={!isFilterAdjusted}
              aria-label="Reset filter adjustments"
            >
              <span>Filters</span>
              <strong>{filterStateLabel}</strong>
            </button>
            <button
              type="button"
              className={`viewer__state-chip ${isFullRes ? "is-active" : ""}`}
              onClick={handleToggleFullRes}
              disabled={!canToggleFullRes || isFullResLoading}
              aria-label={isFullRes ? "Switch to preview asset" : "Switch to HD asset"}
            >
              <span>Asset</span>
              <strong>{assetStateLabel}</strong>
            </button>
            <button
              type="button"
              className={`viewer__state-chip ${annotationMode || !annotationsVisible ? "is-active" : ""}`}
              onClick={() => {
                if (annotations.length) {
                  setAnnotationsVisible((prev) => !prev);
                  return;
                }
                setAnnotationMode(true);
              }}
              aria-label={annotations.length ? "Toggle annotation visibility" : "Add annotation"}
            >
              <span>Notes</span>
              <strong>{notesStateLabel}</strong>
            </button>
            {hasCompareSet && (
              <button
                type="button"
                className="viewer__state-chip is-active"
                onClick={() => selectCompareItem(nextCompareItem)}
                aria-label={`Advance compare state: ${nextCompareItem?.title ?? "none"}`}
              >
                <span>Compare</span>
                <strong>{compareStateLabel}</strong>
              </button>
            )}
          </div>
        </section>
          </details>
          <details className="vw-tool" open={annotations.length > 0 || annotationMode}>
            <summary>
              <Icon name="note" size={14} /> Your notes {annotations.length ? `· ${annotations.length}` : ""}
            </summary>
            {annotations.length === 0 && !annotationMode ? (
              <div className="vw-tool__empty">
                <p>Pin notes to features in this photograph. They stay on this device and come back with it.</p>
                <button type="button" className="sv-btn sv-btn--small" onClick={() => setAnnotationMode(true)}>
                  <Icon name="plus" size={14} /> Add a note
                </button>
              </div>
            ) : null}
            {(annotations.length > 0 || annotationMode) && (
          <section className="viewer-annotations" aria-label="Observation notes">
            <div className="viewer-annotations__header">
              <div>
                <p className="eyebrow">ANNOTATIONS</p>
                <h3>Observation notes</h3>
              </div>
              {annotationMode ? (
                <span className="viewer-annotations__hint">Click the image to place a note</span>
              ) : (
                <button type="button" className="ghost button--small" onClick={() => setAnnotationMode(true)}>
                  Add another
                </button>
              )}
            </div>
            {annotations.length > 0 ? (
              <ol className="viewer-annotations__list">
                {annotations.map((annotation, index) => (
                  <li key={annotation.id}>
                    <span>{index + 1}</span>
                    <input
                      value={annotation.label}
                      onChange={(event) => updateAnnotationLabel(annotation.id, event.target.value)}
                      aria-label={`Annotation ${index + 1} label`}
                    />
                    <button
                      type="button"
                      className="ghost button--small"
                      onClick={() => removeAnnotation(annotation.id)}
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="status">Click the image to add the first note.</p>
            )}
          </section>
        )}
          </details>
          <details className="vw-tool">
            <summary>
              <Icon name="grid" size={14} /> Exposure & histogram
            </summary>
            <section className="viewer__exposure" aria-label="Image exposure readout">
          <div className="viewer__exposure-header">
            <div>
              <p className="eyebrow">EXPOSURE</p>
              <h3>{exposureAnalysis.status === "ready" ? exposureToneLabel : "Histogram"}</h3>
            </div>
            <span>
              {exposureAnalysis.status === "ready"
                ? `${exposureAnalysis.sampleWidth}x${exposureAnalysis.sampleHeight} sample`
                : exposureAnalysis.status === "loading"
                  ? "Sampling"
                  : "Unavailable"}
            </span>
          </div>
          {exposureAnalysis.status === "ready" ? (
            <>
              <div className="viewer__histogram" aria-label="Luminance histogram">
                {exposureAnalysis.histogram.map((count, index) => (
                  <span
                    key={`${index}-${count}`}
                    className="viewer__histogram-bar"
                    style={{ height: `${Math.max(6, (count / histogramPeak) * 100)}%` }}
                    title={`Luminance bin ${index + 1}: ${count} pixels`}
                  />
                ))}
              </div>
              <div className="viewer__exposure-stats">
                <span>
                  <strong>{formatExposurePercent(exposureAnalysis.mean)}</strong>
                  Mean
                </span>
                <span>
                  <strong>{formatExposurePercent(exposureAnalysis.clippedShadows)}</strong>
                  Shadows
                </span>
                <span>
                  <strong>{formatExposurePercent(exposureAnalysis.clippedHighlights)}</strong>
                  Highlights
                </span>
                <span>
                  <strong>{formatExposurePercent(exposureAnalysis.contrast)}</strong>
                  Contrast
                </span>
              </div>
            </>
          ) : (
            <p className="viewer__exposure-note">
              {exposureAnalysis.status === "loading"
                ? "Sampling luminance from the displayed image..."
                : exposureAnalysis.message ?? "Pixel analysis is unavailable for this image source."}
            </p>
          )}
        </section>
          </details>
          <InfoPanel
          selected={selected}
          metadata={imageData?.metadata ?? selected.raw}
          onTagSelect={(tag) => onSearch(tag)}
        />
        </aside>
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
            <div className="viewer-help__list">
              {viewerShortcutGroups.map((group) => (
                <section key={group.title} className="viewer-help__section" aria-label={`${group.title} shortcuts`}>
                  <h3>{group.title}</h3>
                  <ul>
                    {group.shortcuts.map((shortcut) => (
                      <li key={`${group.title}-${shortcut.label}`}>
                        <span className="viewer-help__keys">
                          {shortcut.keys.map((key) => (
                            <kbd key={key}>{key}</kbd>
                          ))}
                        </span>
                        <span>{shortcut.label}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}
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
