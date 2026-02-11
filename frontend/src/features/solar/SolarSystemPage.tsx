import { FC, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import SolarScene from "./SolarScene";
import SolarDetailsPanel from "./SolarDetailsPanel";
import SolarTopBar from "./SolarTopBar";
import SolarTimeline from "./SolarTimeline";
import { PLANETS, type PlanetId, type SolarScaleMode } from "./solarData";
import { MOONS, type MoonVisibilityMode } from "./moonData";
import type { AsteroidBeltMode } from "./asteroids/asteroidGenerator";
import type { TextureQuality } from "./textures/textureCatalog";
import { solarTextureManager } from "./textures/solarTextureManager";
import { preloadSolarTextures } from "./textures/preloadSolarTextures";
import { useSolarTime } from "./useSolarTime";
import { useCameraBookmarks, type CameraBookmark } from "./useCameraBookmarks";

interface SolarSystemPageProps {
  onExploreImagery: (query: string) => void;
}

const HOW_TO_KEY = "spaceviewer.solar.howToSeen";
const BIRTHDAY_KEY = "spaceviewer.solar.birthday";
const DAY_MS = 86_400_000;

const SolarSystemPage: FC<SolarSystemPageProps> = ({ onExploreImagery }) => {
  // TODO: Phase 2 hooks - moons, spacecraft overlays, true scale, Lagrange points.
  const [scaleMode, setScaleMode] = useState<SolarScaleMode>("showcase");
  const [performanceMode, setPerformanceMode] = useState(true);
  const [textureQuality, setTextureQuality] = useState<TextureQuality>(() => {
    if (typeof window === "undefined") return "performance";
    const viewportWidth = Math.min(window.innerWidth, window.visualViewport?.width ?? window.innerWidth);
    const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    return coarsePointer || viewportWidth < 900 ? "performance" : "high";
  });
  const [autoDegraded, setAutoDegraded] = useState(false);
  const [selectedId, setSelectedId] = useState<PlanetId | null>(null);
  const [selectedMoonId, setSelectedMoonId] = useState<string | null>(null);
  const [sunSelected, setSunSelected] = useState(false);
  const [trackId, setTrackId] = useState<PlanetId | null>(null);
  const [trackMoonId, setTrackMoonId] = useState<string | null>(null);
  const [focusTarget, setFocusTarget] = useState<PlanetId | null>(null);
  const [focusToken, setFocusToken] = useState(0);
  const [focusMoonTarget, setFocusMoonTarget] = useState<string | null>(null);
  const [focusMoonToken, setFocusMoonToken] = useState(0);
  const [focusSunToken, setFocusSunToken] = useState(0);
  const [bookmarkTarget, setBookmarkTarget] = useState<{
    position: [number, number, number];
    target: [number, number, number];
  } | null>(null);
  const [bookmarkToken, setBookmarkToken] = useState(0);
  const [moonMode, setMoonMode] = useState<MoonVisibilityMode>("major");
  const [moonVisibilityOverrides, setMoonVisibilityOverrides] = useState<Record<PlanetId, boolean>>({});
  const [asteroidMode, setAsteroidMode] = useState<AsteroidBeltMode>("simplified");
  const [detailsCollapsed, setDetailsCollapsed] = useState(false);
  const [showHowTo, setShowHowTo] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingVisible, setLoadingVisible] = useState(true);
  const [showFeatures, setShowFeatures] = useState(false);
  const [sceneSeed, setSceneSeed] = useState(0);
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    const viewportWidth = Math.min(window.innerWidth, window.visualViewport?.width ?? window.innerWidth);
    const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    return coarsePointer || viewportWidth <= 900;
  });
  const loadingCompleteRef = useRef(false);
  const loadingStartedRef = useRef(false);
  const minDate = useMemo(() => new Date(Date.UTC(2025, 0, 1)), []);
  const maxDate = useMemo(() => new Date(Date.UTC(2050, 11, 31)), []);
  const [birthdayKey, setBirthdayKey] = useState<string | null>(null);

  const clampDate = (date: Date) => {
    const ms = date.getTime();
    return new Date(Math.min(maxDate.getTime(), Math.max(minDate.getTime(), ms)));
  };

  const toDateKey = (date: Date) => date.toISOString().slice(0, 10);

  const cameraStateRef = useRef<{ position: [number, number, number]; target: [number, number, number] } | null>(
    null,
  );
  const {
    currentDate,
    setCurrentDate,
    dayIndex,
    setDayIndex,
    maxDays,
    isPlaying,
    setIsPlaying,
    speed,
    setSpeed,
  } = useSolarTime(minDate, maxDate);
  const timeDays = useMemo(
    () => (currentDate.getTime() - minDate.getTime()) / DAY_MS,
    [currentDate, minDate],
  );

  const [visualTimeDays, setVisualTimeDays] = useState(timeDays);
  const visualTimeRef = useRef(timeDays);

  useEffect(() => {
    visualTimeRef.current = visualTimeDays;
  }, [visualTimeDays]);

  useEffect(() => {
    if (isPlaying) {
      setVisualTimeDays(timeDays);
      return;
    }
    const delta = Math.abs(timeDays - visualTimeRef.current);
    if (delta < 120) {
      setVisualTimeDays(timeDays);
      return;
    }
    const start = performance.now();
    const startValue = visualTimeRef.current;
    const duration = 1200;
    let animationFrame = 0;
    const animate = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      const next = startValue + (timeDays - startValue) * eased;
      visualTimeRef.current = next;
      setVisualTimeDays(next);
      if (t < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };
    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [timeDays, isPlaying]);

  const currentKey = useMemo(() => toDateKey(currentDate), [currentDate]);
  const isBirthdayActive = birthdayKey !== null && currentKey === birthdayKey;
  const { bookmarks, saveBookmark } = useCameraBookmarks();

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    let hideTimer: number | undefined;
    let idleTimer: number | undefined;

    solarTextureManager.onStart = (_, itemsLoaded, itemsTotal) => {
      loadingStartedRef.current = true;
      if (loadingCompleteRef.current) return;
      setLoadingVisible(true);
      if (itemsTotal > 0) {
        setLoadingProgress(itemsLoaded / itemsTotal);
      } else {
        setLoadingProgress(0.05);
      }
    };

    solarTextureManager.onProgress = (_, itemsLoaded, itemsTotal) => {
      if (loadingCompleteRef.current) return;
      if (itemsTotal > 0) {
        setLoadingProgress(itemsLoaded / itemsTotal);
      } else {
        setLoadingProgress((prev) => Math.min(0.9, prev + 0.05));
      }
    };

    solarTextureManager.onLoad = () => {
      if (loadingCompleteRef.current) return;
      loadingCompleteRef.current = true;
      setLoadingProgress(1);
      hideTimer = window.setTimeout(() => setLoadingVisible(false), 350);
    };

    solarTextureManager.onError = () => {
      if (loadingCompleteRef.current) return;
      setLoadingProgress((prev) => Math.min(0.95, prev + 0.03));
    };

    idleTimer = window.setTimeout(() => {
      if (!loadingStartedRef.current) {
        setLoadingVisible(false);
      }
    }, 900);

    return () => {
      solarTextureManager.onStart = null;
      solarTextureManager.onProgress = null;
      solarTextureManager.onLoad = null;
      solarTextureManager.onError = null;
      if (hideTimer) window.clearTimeout(hideTimer);
      if (idleTimer) window.clearTimeout(idleTimer);
    };
  }, []);

  useEffect(() => {
    let active = true;
    preloadSolarTextures(textureQuality).then(() => {
      if (active) {
        setSceneSeed((prev) => prev + 1);
        setLoadingVisible(false);
      }
    });
    return () => {
      active = false;
    };
  }, [textureQuality]);

  const selectedPlanet = useMemo(() => PLANETS.find((planet) => planet.id === selectedId) ?? null, [selectedId]);
  const selectedMoon = useMemo(() => MOONS.find((moon) => moon.id === selectedMoonId) ?? null, [selectedMoonId]);
  const shouldRenderFeatures = !isMobile || showFeatures;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const seen = window.localStorage.getItem(HOW_TO_KEY);
    if (!seen) {
      setShowHowTo(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(BIRTHDAY_KEY);
    if (!stored) return;
    const [year, month, day] = stored.split("-").map(Number);
    const storedDate = new Date(Date.UTC(year, month - 1, day));
    const clamped = clampDate(storedDate);
    setBirthdayKey(toDateKey(clamped));
  }, [minDate, maxDate]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const viewportWidth = Math.min(window.innerWidth, window.visualViewport?.width ?? window.innerWidth);
    const prefersPerformance =
      window.matchMedia?.("(pointer: coarse)").matches || viewportWidth < 900;
    setTextureQuality(prefersPerformance ? "performance" : "high");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia?.("(max-width: 900px)");
    const update = () => {
      const viewportWidth = Math.min(window.innerWidth, window.visualViewport?.width ?? window.innerWidth);
      const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false;
      const mobile = coarsePointer || viewportWidth <= 900 || (media ? media.matches : false);
      setIsMobile(mobile);
      if (mobile) {
        setShowFeatures(false);
        setDetailsCollapsed(true);
      }
    };
    update();
    media?.addEventListener?.("change", update);
    return () => media?.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(max-width: 720px)").matches) {
      setDetailsCollapsed(true);
    }
  }, []);

  useEffect(() => {
    if (performanceMode) {
      setTextureQuality("performance");
      return;
    }
    if (!autoDegraded && typeof window !== "undefined") {
      const prefersPerformance =
        window.matchMedia?.("(pointer: coarse)").matches || window.innerWidth < 900;
      setTextureQuality(prefersPerformance ? "performance" : "high");
    }
  }, [performanceMode, autoDegraded]);

  const handleCloseHowTo = () => {
    setShowHowTo(false);
    if (typeof window === "undefined") return;
    window.localStorage.setItem(HOW_TO_KEY, "true");
  };

  const requestFocus = (planetId: PlanetId | null) => {
    if (!planetId) return;
    setFocusTarget(planetId);
    setFocusToken((prev) => prev + 1);
  };

  const requestMoonFocus = (moonId: string | null) => {
    if (!moonId) return;
    setFocusMoonTarget(moonId);
    setFocusMoonToken((prev) => prev + 1);
  };

  const requestSunFocus = () => {
    setFocusSunToken((prev) => prev + 1);
  };

  const handleSaveBookmark = () => {
    const state = cameraStateRef.current;
    if (!state) return;
    const name = window.prompt("Bookmark name?");
    if (!name) return;
    saveBookmark(name, state.position, state.target);
  };

  const handleSelectBookmark = (bookmark: CameraBookmark) => {
    setBookmarkTarget({ position: bookmark.position, target: bookmark.target });
    setBookmarkToken((prev) => prev + 1);
  };

  return (
    <section className="solar-page">
      <div className="solar-canvas">
        <SolarScene
          key={sceneSeed}
          timeDays={visualTimeDays}
          timeScale={speed}
          scaleMode={scaleMode}
          performanceMode={performanceMode}
          textureQuality={textureQuality}
          moonMode={moonMode}
          moonVisibilityOverrides={moonVisibilityOverrides}
          asteroidMode={asteroidMode}
          selectedId={selectedId}
          selectedMoonId={selectedMoonId}
          sunSelected={sunSelected}
          focusTargetId={focusTarget}
          focusToken={focusToken}
          focusMoonId={focusMoonTarget}
          focusMoonToken={focusMoonToken}
          focusSunToken={focusSunToken}
          trackTargetId={trackId}
          trackMoonId={trackMoonId}
          bookmarkTarget={bookmarkTarget}
          bookmarkToken={bookmarkToken}
          onPerformanceDrop={() => {
            if (!autoDegraded) {
              setAutoDegraded(true);
              setTextureQuality("performance");
            }
          }}
          onSelectPlanet={(planet) => {
            setSelectedId(planet?.id ?? null);
            setTrackId(null);
            setSelectedMoonId(null);
            setTrackMoonId(null);
            setSunSelected(false);
          }}
          onSelectMoon={(moon) => {
            setSelectedMoonId(moon.id);
            setSelectedId(moon.parentPlanet);
            setTrackId(null);
            setSunSelected(false);
          }}
          onSelectSun={(selected) => {
            setSunSelected(selected);
            if (selected) {
              setSelectedId(null);
              setSelectedMoonId(null);
              setTrackId(null);
              setTrackMoonId(null);
            }
          }}
          onRequestFocus={(planet) => requestFocus(planet.id)}
          onCameraState={(state) => {
            cameraStateRef.current = state;
          }}
        />
      </div>

      <div className="solar-ui">
        {loadingVisible && (
          <>
            <div className="solar-loading__scrim" />
            <div className={`solar-loading ${loadingProgress >= 1 ? "is-complete" : ""}`}>
              <div className="solar-loading__label">Loading solar textures…</div>
              <div
                className="solar-loading__bar"
                style={{ transform: `scaleX(${Math.max(0.04, loadingProgress)})` }}
              />
            </div>
          </>
        )}
        {shouldRenderFeatures && (
          <div className={`solar-features ${showFeatures ? "is-open" : ""}`}>
            <SolarTopBar
              scaleMode={scaleMode}
              onScaleModeChange={setScaleMode}
              moonMode={moonMode}
              onMoonModeChange={setMoonMode}
              asteroidMode={asteroidMode}
              onAsteroidModeChange={setAsteroidMode}
              performanceMode={performanceMode}
              onTogglePerformance={() => setPerformanceMode((prev) => !prev)}
              currentDate={currentDate}
              minDate={minDate}
              maxDate={maxDate}
              onDateChange={(next) => setCurrentDate(next)}
              onSetToday={() => setCurrentDate(new Date())}
              onResetDate={() => setCurrentDate(minDate)}
              onBirthdaySelect={(next) => {
                const clamped = clampDate(next);
                if (typeof window !== "undefined") {
                  window.localStorage.setItem(BIRTHDAY_KEY, toDateKey(clamped));
                }
                setBirthdayKey(toDateKey(clamped));
              }}
              birthdayActive={isBirthdayActive}
              bookmarks={bookmarks}
              onSaveBookmark={handleSaveBookmark}
              onSelectBookmark={handleSelectBookmark}
            />

            <SolarDetailsPanel
              planet={selectedPlanet}
              moon={selectedMoon}
              sunSelected={sunSelected}
              collapsed={detailsCollapsed}
              isTracking={Boolean(selectedId && trackId === selectedId)}
              isMoonTracking={Boolean(selectedMoonId && trackMoonId === selectedMoonId)}
              moonToggleEnabled={selectedId ? (moonVisibilityOverrides[selectedId] ?? true) : true}
              onToggleMoonsForPlanet={() => {
                if (!selectedId) return;
                setMoonVisibilityOverrides((prev) => ({
                  ...prev,
                  [selectedId]: !(prev[selectedId] ?? true),
                }));
              }}
              onToggleCollapse={() => setDetailsCollapsed((prev) => !prev)}
              onFocus={() => requestFocus(selectedId)}
              onToggleTrack={() =>
                setTrackId((prev) => {
                  if (!selectedId) return null;
                  const next = prev === selectedId ? null : selectedId;
                  if (next) {
                    setTrackMoonId(null);
                  }
                  return next;
                })
              }
              onFocusMoon={() => requestMoonFocus(selectedMoonId)}
              onToggleMoonTrack={() =>
                setTrackMoonId((prev) => {
                  if (!selectedMoonId) return null;
                  const next = prev === selectedMoonId ? null : selectedMoonId;
                  if (next) {
                    setTrackId(null);
                  }
                  return next;
                })
              }
              onExplore={() => {
                if (!selectedPlanet) return;
                onExploreImagery(selectedPlanet.searchQuery);
              }}
              onExploreSun={() => onExploreImagery("Sun")}
              onFocusSun={requestSunFocus}
            />
          </div>
        )}

        <SolarTimeline
          currentDate={currentDate}
          minDate={minDate}
          maxDate={maxDate}
          dayIndex={dayIndex}
          maxDays={maxDays}
          isPlaying={isPlaying}
          speed={speed}
          onTogglePlay={() => setIsPlaying((prev) => !prev)}
          onSpeedChange={(next) => setSpeed(next)}
          onDayChange={(next) => setDayIndex(next)}
        />
        {isMobile && (
          <button
            type="button"
            className={`solar-tray__toggle ${showFeatures ? "is-open" : ""}`}
            onClick={() => setShowFeatures((prev) => !prev)}
          >
            {showFeatures ? "Close Features" : "Features"}
          </button>
        )}
      </div>

      {showHowTo && (
        <div className="solar-howto">
          <div className="solar-howto__card">
            <div>
              <p className="eyebrow">HOW TO USE</p>
              <h3>Solar System Explorer</h3>
            </div>
            <ul>
              <li>Drag: rotate</li>
              <li>Scroll / pinch: zoom</li>
              <li>Right-drag / two-finger drag: pan</li>
              <li>Click: details</li>
              <li>Double click: focus</li>
              <li>Slider: time travel</li>
            </ul>
            <button type="button" onClick={handleCloseHowTo}>
              Got it
            </button>
          </div>
        </div>
      )}
    </section>
  );
};

export default SolarSystemPage;
