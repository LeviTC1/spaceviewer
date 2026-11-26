// SpaceViewer's front door: the live universe.
//
// One continuous, physically scaled universe with search, selection, flights, time, journeys, moments
// and shareable observations. Every place opens onto its real photographs ("Seen by telescopes"), any
// view can be kept (Your sky) or sent as a postcard, and the specialist tools are one step away.
// The page stays mounted while you visit other surfaces, so coming back is instant.

import { useCallback, useEffect, useMemo, useRef, useState, type FC, type ReactNode } from "react";
import type { SolarLaunchTarget } from "../solar/SolarSystemPage";
import type { PlanetId } from "../solar/solarData";
import type { SpaceImage } from "../../models/SpaceImage";
import type { SearchResult } from "../../utils/mapSearchItem";
import { recordRecentPlace } from "../../utils/sessionMemory";
import { Icon } from "../../shell/Icon";
import { getMoment, type Moment } from "../../shell/moments";
import { readSavedViews, saveView, SAVED_VIEWS_EVENT } from "../../shell/savedViews";
import UniverseViewport, { type CameraSnapshot, type ExplorerQuality, type UniverseViewportHandle } from "./UniverseViewport";
import { FlightBar, JourneyBar, LocationRail, ObjectPanel, SearchBox, TimeCapsule, describeLocation, scaleStepFor, type ScaleStep } from "./ExploreChrome";
import {
  composePostcard,
  imageQueryFor,
  LightStoryLine,
  SkyPhotoLine,
  FigureLine,
  MomentCard,
  pickSurprise,
  ShareMenu,
  StartPanel,
  SURPRISES,
  TelescopeStrip,
  thumbnailFrom,
  WatchLive,
} from "./ExploreExtras";
import { JOURNEYS, createSearchIndex, createSlugIndex, getDescription, getFacts, getOnwardRoutes, type Journey, type OnwardRoute } from "./discovery";
import { buildExplorePath, parseExploreLocation, readStoredSession, rememberExplorePath, writeStoredSession } from "./exploreRoutes";
import type { CameraEvent } from "./engine/cameraController";
import { getEntityWorld, type UniverseEntity } from "./engine/universeModel";
import { cross3, normalize3, type Vec3 } from "./engine/units";
import { useReducedMotion, useUniverseData } from "./useUniverseData";
import { useGalaxyStars } from "./galaxyStars";
import { TonightPanel } from "./TonightPanel";
import { nightTimes, type ObserverPlace, readPlace, writePlace } from "./tonight";
import "./explore.css";

interface ExplorePageProps {
  locationToken: number;
  active: boolean;
  onOpenImagery: (query: string) => void;
  onOpenImage: (image: SpaceImage, pool: SearchResult[]) => void;
  onOpenSolar: (target: SolarLaunchTarget) => void;
  onOpenLive: (feedId: string) => void;
  /** The shared SpaceViewer bar, given the explorer's own search and actions. */
  renderBar: (search: ReactNode, actions: ReactNode) => ReactNode;
}

const QUALITY_KEY = "spaceviewer.explore.quality.v1";
const SEEN_KEY = "spaceviewer.explore.seen.v1";
const SURPRISE_SEEN_KEY = "spaceviewer.explore.surprises.v1";
const CONSTELLATIONS_KEY = "spaceviewer.explore.constellations.v1";

const detectQuality = (): ExplorerQuality => {
  try {
    const stored = window.localStorage.getItem(QUALITY_KEY);
    if (stored === "low" || stored === "balanced" || stored === "high" || stored === "ultra") return stored;
  } catch {
    // ignore
  }
  const cores = navigator.hardwareConcurrency ?? 4;
  const touch = window.matchMedia?.("(pointer: coarse)").matches;
  if (touch && cores <= 6) return "low";
  return cores >= 8 ? "high" : "balanced";
};

const toSolarTarget = (entity: UniverseEntity, timeMs: number): SolarLaunchTarget | null => {
  const dateKey = new Date(timeMs).toISOString().slice(0, 10);
  if (entity.id === "solar:sun") return { kind: "sun", navigationMode: "overview", dateKey };
  if (entity.id.startsWith("solar:planet:")) return { kind: "planet", planetId: entity.id.replace("solar:planet:", "") as PlanetId, navigationMode: "planetary", dateKey };
  if (entity.id.startsWith("solar:moon:")) return { kind: "moon", moonId: entity.id.replace("solar:moon:", ""), navigationMode: "planetary", dateKey };
  return null;
};

const readSeenSurprises = (): string[] => {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(SURPRISE_SEEN_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
};

const formatCaptionDate = (ms: number) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" }).format(new Date(ms));

const ExplorePage: FC<ExplorePageProps> = ({ locationToken, active, onOpenImagery, onOpenImage, onOpenSolar, onOpenLive, renderBar }) => {
  const initialLocation = useMemo(() => parseExploreLocation(window.location.pathname, window.location.search), []);
  const initialMoment = useMemo(() => getMoment(new URLSearchParams(window.location.search).get("moment")), []);
  const [initialTime] = useState(() => (initialMoment ? Date.parse(initialMoment.at) : initialLocation.timeMs ?? Date.now()));
  const [epochDay, setEpochDay] = useState(() => new Date(initialTime).toISOString().slice(0, 10));
  const deepLinkPending = Boolean(initialLocation.slug || initialLocation.legacyObjectId);
  const { index, starChunks, statuses, brightChunks, skyCulture, minorOrbits } = useUniverseData(`${epochDay}T00:00:00.000Z`, deepLinkPending);
  const searchIndex = useMemo(() => createSearchIndex(index), [index]);
  const slugs = useMemo(() => createSlugIndex(index), [index]);
  const reducedMotion = useReducedMotion();
  const viewportRef = useRef<UniverseViewportHandle | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const [quality, setQuality] = useState<ExplorerQuality>(detectQuality);
  // A Milky Way of real stars: ~1M Gaia DR3 stars stream in after the nearby catalogue, brightest
  // first. Lighter devices take fewer chunks.
  const nearbyReady = statuses.some((item) => item.id === "gaia" && (item.status === "ready" || item.status === "fallback")) || starChunks.length > 0;
  const galaxyChunkBudget = quality === "low" ? 1 : quality === "balanced" ? 3 : 8;
  const galaxy = useGalaxyStars(nearbyReady, galaxyChunkBudget);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [contextId, setContextId] = useState<string | null>(null);
  const [startOpen, setStartOpen] = useState(false);
  const [panelHidden, setPanelHidden] = useState(false);
  const [timeExpanded, setTimeExpanded] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [showOrbits, setShowOrbits] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showMinorBodies, setShowMinorBodies] = useState(true);
  const [showConstellations, setShowConstellations] = useState(() => {
    try {
      return window.localStorage.getItem(CONSTELLATIONS_KEY) === "1";
    } catch {
      return false;
    }
  });
  // The viewport mounts with figures off; keep it in step with the choice (remembered, or ground mode).
  useEffect(() => {
    viewportRef.current?.setToggles({ constellations: showConstellations });
  }, [showConstellations]);
  const toggleConstellations = useCallback((on: boolean) => {
    setShowConstellations(on);
    viewportRef.current?.setToggles({ constellations: on });
    try {
      window.localStorage.setItem(CONSTELLATIONS_KEY, on ? "1" : "0");
    } catch {
      // ignore
    }
  }, []);
  const [flight, setFlight] = useState<{ label: string; kind: string } | null>(null);
  // Standing on the Earth ("Tonight's sky"): the observer's place, or null in space.
  const [ground, setGround] = useState<ObserverPlace | null>(null);
  const [tonightHidden, setTonightHidden] = useState(false);
  const groundRef = useRef<ObserverPlace | null>(null);
  const constellationsBeforeGround = useRef<boolean | null>(null);
  const [journey, setJourney] = useState<{ journey: Journey; step: number } | null>(null);
  const [moment, setMoment] = useState<Moment | null>(null);
  const [lensDeg, setLensDeg] = useState(50);
  const [surpriseHook, setSurpriseHook] = useState<{ id: string; hook: string } | null>(null);
  const [report, setReport] = useState<CameraSnapshot | null>(null);
  const [toast, setToast] = useState<{ text: string; action?: { label: string; run: () => void } } | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set(readSavedViews().map((view) => view.targetId)));
  const [resume, setResume] = useState<{ id: string; name: string } | null>(null);
  const [hint, setHint] = useState(() => {
    try {
      return !window.localStorage.getItem(SEEN_KEY);
    } catch {
      return true;
    }
  });
  const [searchFocusKey, setSearchFocusKey] = useState(0);
  const [pendingTarget, setPendingTarget] = useState<{
    id: string | null;
    slug: string | null;
    camera: { distanceKm: number; direction: Vec3 } | null;
    animate: boolean;
    moment?: Moment | null;
    since: number;
  } | null>(null);
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight });
  const openedRef = useRef(false);
  const lastUrlWrite = useRef(0);
  const selectedRef = useRef<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);
  const [live, setLive] = useState(true);

  const showToast = useCallback((text: string, action?: { label: string; run: () => void }, ms = 3_600) => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({ text, action });
    toastTimer.current = window.setTimeout(() => setToast(null), ms);
  }, []);

  useEffect(() => {
    const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Global settings (the Settings sheet) can change the explorer's quality.
  useEffect(() => {
    const onQuality = (event: Event) => {
      const value = (event as CustomEvent<string>).detail;
      if (value === "low" || value === "balanced" || value === "high" || value === "ultra") setQuality(value);
      else setQuality(detectQuality());
    };
    const onSaved = () => setSavedIds(new Set(readSavedViews().map((view) => view.targetId)));
    window.addEventListener("spaceviewer:quality-updated", onQuality);
    window.addEventListener(SAVED_VIEWS_EVENT, onSaved);
    return () => {
      window.removeEventListener("spaceviewer:quality-updated", onQuality);
      window.removeEventListener(SAVED_VIEWS_EVENT, onSaved);
    };
  }, []);

  const compact = viewport.width < 760;
  const selected = selectedId ? index.byId.get(selectedId) ?? null : null;
  const tonightOpen = Boolean(ground && !tonightHidden && !startOpen && !(selected && !panelHidden));
  const panelOpen = Boolean((selected && !panelHidden) || startOpen || tonightOpen);
  const occludedLeft = !compact && panelOpen ? 392 : 0;
  const occludedBottom = compact && panelOpen ? Math.round(viewport.height * 0.5) : 0;

  const markSeen = useCallback(() => {
    if (!hint) return;
    setHint(false);
    try {
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // ignore
    }
  }, [hint]);

  // ------------------------------------------------------------------------------------------
  // Navigation primitives

  const flyTo = useCallback(
    (id: string, framing: "auto" | "close" | "system" | "context" = "auto") => {
      const handle = viewportRef.current;
      if (!handle || !index.byId.has(id)) return;
      setSelectedId(id);
      setPanelHidden(false);
      if (groundRef.current) {
        // On the ground we turn to face things rather than fly to them.
        const where = handle.lookAtObject(id);
        const entity = index.byId.get(id);
        if (where && entity && where.altDeg < 0) showToast(`${entity.name} is ${Math.round(-where.altDeg)}° below your horizon right now.`);
        markSeen();
        return;
      }
      handle.setFov(50);
      setLensDeg(50);
      handle.flyTo(id, { framing });
      markSeen();
    },
    [index, markSeen, showToast],
  );

  const pushObjectUrl = useCallback(
    (id: string | null) => {
      const path = buildExplorePath(id ? slugs.slugFor(id) : null);
      if (`${window.location.pathname}${window.location.search}` === path) return;
      window.history.pushState({ view: "explore" }, "", path);
    },
    [slugs],
  );

  const select = useCallback(
    (id: string | null, options: { fly?: boolean; framing?: "auto" | "close" | "system" | "context"; push?: boolean } = {}) => {
      if (id && !index.byId.has(id)) return;
      setSelectedId(id);
      setPanelHidden(false);
      if (id) setStartOpen(false);
      if (id !== surpriseHook?.id) setSurpriseHook(null);
      if (id && id !== "galactic:milky-way-structure") setContextId((current) => (current === id ? null : current));
      if (options.push !== false && id !== selectedRef.current) pushObjectUrl(id);
      if (id && options.fly) flyTo(id, options.framing);
    },
    [flyTo, index, pushObjectUrl, surpriseHook],
  );

  // Remember places for Your sky and Find.
  useEffect(() => {
    if (!selected) return;
    recordRecentPlace({ id: selected.id, name: selected.name, category: selected.category, href: buildExplorePath(slugs.slugFor(selected.id)) });
  }, [selected, slugs]);

  // ------------------------------------------------------------------------------------------
  // Moments: set the clock, frame the subject, tell the story

  const applyMoment = useCallback(
    (next: Moment, animate: boolean) => {
      const handle = viewportRef.current;
      const subject = index.byId.get(next.subject);
      if (!handle || !subject) return false;
      const at = Date.parse(next.at);
      if (groundRef.current) {
        // Moments happen out in space: step off the ground first.
        groundRef.current = null;
        setGround(null);
        handle.setGround(null);
      }
      handle.setTime(at);
      handle.setRate(next.rate || 1);
      handle.setPaused(next.rate === 0);
      setSelectedId(subject.id);
      setStartOpen(false);
      setJourney(null);
      setPanelHidden(compact);
      setMoment(next);
      handle.setFov(next.lensDeg ?? 50);
      setLensDeg(next.lensDeg ?? 50);
      markSeen();
      const target = getEntityWorld(subject, at);
      const earth = index.byId.get("solar:planet:earth");
      const earthWorld = earth ? getEntityWorld(earth, at) : null;
      if (next.camera.mode === "from-earth" && target && earthWorld) {
        const offset: Vec3 = [earthWorld[0] - target[0], earthWorld[1] - target[1], earthWorld[2] - target[2]];
        const distance = Math.hypot(...offset);
        handle.placeAt(subject.id, Math.max(subject.radiusKm * 4, distance - 6_371 * 3), normalize3(offset), animate && !reducedMotion);
      } else if (next.camera.mode === "in-shadow" && target && earthWorld) {
        // The Sun sits at the origin of the heliocentric frame: stand on the far side of the Moon from it.
        const fromSun = normalize3(target);
        const earthMoon = Math.hypot(earthWorld[0] - target[0], earthWorld[1] - target[1], earthWorld[2] - target[2]);
        handle.placeAt(subject.id, earthMoon - 6_371 * 1.05, fromSun, animate && !reducedMotion);
      } else if (next.camera.mode === "ride-along" && target) {
        // Sit just behind the spacecraft, looking past it at what it is flying to; the camera then follows it.
        const look = index.byId.get(next.camera.look);
        const lookWorld = look ? getEntityWorld(look, at) : null;
        const away = lookWorld ? normalize3([target[0] - lookWorld[0], target[1] - lookWorld[1], target[2] - lookWorld[2]]) : normalize3(target);
        // Swing a little towards the Sun so the craft is lit, keeping its destination in the background.
        const sunward = normalize3([-target[0], -target[1], -target[2]]);
        const along = sunward[0] * away[0] + sunward[1] * away[1] + sunward[2] * away[2];
        const side = normalize3([sunward[0] - away[0] * along, sunward[1] - away[1] * along, sunward[2] - away[2] * along]);
        const chase = Number.isFinite(side[0]) ? normalize3([away[0] + side[0] * 0.55, away[1] + side[1] * 0.55, away[2] + side[2] * 0.55]) : away;
        handle.placeAt(subject.id, next.camera.distanceKm, chase, animate && !reducedMotion);
      } else {
        handle.flyTo(subject.id, { instant: !animate || reducedMotion });
      }
      const path = `${buildExplorePath(slugs.slugFor(subject.id))}?moment=${next.id}`.replace("??", "?");
      if (`${window.location.pathname}${window.location.search}` !== path) window.history.pushState({ view: "explore" }, "", path);
      lastUrlWrite.current = performance.now() + 4_000;
      return true;
    },
    [compact, index, markSeen, reducedMotion, slugs],
  );

  const playMoment = useCallback(
    (next: Moment) => {
      if (!applyMoment(next, true)) setPendingTarget({ id: next.subject, slug: null, camera: null, animate: true, moment: next, since: Date.now() });
    },
    [applyMoment],
  );

  const backToNow = useCallback(() => {
    const handle = viewportRef.current;
    if (!handle) return;
    handle.setTime(Date.now());
    handle.setRate(1);
    handle.setPaused(false);
    handle.setFov(50);
    setLensDeg(50);
    setMoment(null);
    if (selectedRef.current) handle.flyTo(selectedRef.current);
  }, []);

  const normalLens = useCallback(() => {
    viewportRef.current?.setFov(50);
    setLensDeg(50);
  }, []);

  // ------------------------------------------------------------------------------------------
  // Tonight's sky: stand on the Earth where you are

  const enterTonight = useCallback(
    (placeOverride?: ObserverPlace) => {
      const handle = viewportRef.current;
      if (!handle) return;
      const place = placeOverride ?? groundRef.current ?? readPlace();
      groundRef.current = place;
      setGround(place);
      setTonightHidden(false);
      setStartOpen(false);
      setJourney(null);
      setMoment(null);
      setSelectedId(null);
      setLensDeg(70);
      // Face the part of the sky that rises highest: south from the north, north from the south.
      handle.setGround(place, { azDeg: place.latDeg >= 0 ? 180 : 0, altDeg: 32 });
      if (constellationsBeforeGround.current === null) constellationsBeforeGround.current = handle.engine.showConstellations;
      setShowConstellations(true);
      // In daylight, jump to this evening once it is dark (the panel's "Now" goes back).
      const sun = handle.skyPosition("solar:sun", Date.now());
      if (!sun || sun.altDeg > -6) {
        handle.setTime(nightTimes(index, place, Date.now()).bestLookMs);
        handle.setRate(1);
        handle.setPaused(false);
      }
      if (window.location.pathname !== "/tonight") window.history.pushState({ view: "explore" }, "", "/tonight");
      markSeen();
    },
    [index, markSeen],
  );

  const leaveTonight = useCallback(() => {
    const handle = viewportRef.current;
    groundRef.current = null;
    setGround(null);
    setLensDeg(50);
    if (!handle) return;
    handle.setGround(null);
    const before = constellationsBeforeGround.current;
    constellationsBeforeGround.current = null;
    if (before !== null) setShowConstellations(before);
    if (window.location.pathname === "/tonight") window.history.pushState({ view: "explore" }, "", buildExplorePath(selectedRef.current ? slugs.slugFor(selectedRef.current) : "earth"));
  }, [slugs]);

  const changePlace = useCallback(
    (place: ObserverPlace) => {
      writePlace(place);
      groundRef.current = place;
      setGround(place);
      viewportRef.current?.setGround(place);
    },
    [],
  );

  // Stand at the Sun looking at a constellation star with the figure drawn, then fly sideways: the
  // figure distorts and breaks up because its stars are at very different distances.
  const watchFigureComeApart = useCallback(
    (id: string) => {
      const handle = viewportRef.current;
      const entity = index.byId.get(id);
      const world = entity ? getEntityWorld(entity, handle?.engine.simTimeMs ?? Date.now()) : null;
      if (!handle || !entity || !world) return;
      if (groundRef.current) leaveTonight();
      toggleConstellations(true);
      setSelectedId(id);
      setPanelHidden(compact);
      const d = Math.hypot(...world);
      const toSun = normalize3([-world[0], -world[1], -world[2]]);
      handle.setFov(60);
      setLensDeg(60);
      handle.placeAt(id, d * 0.999, toSun, false);
      // Swing 35° round the star: a sideways trip of a few hundred light-years.
      const side = normalize3(cross3(toSun, [0, 1, 0]));
      const a = (35 * Math.PI) / 180;
      const swung = normalize3([toSun[0] * Math.cos(a) + side[0] * Math.sin(a), toSun[1] * Math.cos(a) + side[1] * Math.sin(a), toSun[2] * Math.cos(a) + side[2] * Math.sin(a)]);
      window.setTimeout(() => viewportRef.current?.placeAt(id, d, swung, true), 1_600);
      showToast(`From the Sun, ${entity.name}'s constellation looks the way it does from Earth. Now watch what happens when we move.`, undefined, 5_000);
    },
    [compact, index, leaveTonight, showToast, toggleConstellations],
  );

  // ------------------------------------------------------------------------------------------
  // Show me something incredible

  const surprise = useCallback(() => {
    const seen = readSeenSurprises();
    const pick = pickSurprise(index, selectedRef.current, seen);
    if (!pick) return;
    try {
      window.sessionStorage.setItem(SURPRISE_SEEN_KEY, JSON.stringify([...seen, pick.id].slice(-SURPRISES.length + 1)));
    } catch {
      // ignore
    }
    setJourney(null);
    setMoment(null);
    setSurpriseHook(pick);
    select(pick.id, { fly: true });
    setSurpriseHook(pick);
  }, [index, select]);

  // ------------------------------------------------------------------------------------------
  // Opening scene, deep links and returning sessions

  const resolveLocationTarget = useCallback(
    (location: ReturnType<typeof parseExploreLocation>) => {
      if (location.legacyObjectId) return location.legacyObjectId;
      if (location.slug) return slugs.idFor(location.slug);
      return null;
    },
    [slugs],
  );

  useEffect(() => {
    if (openedRef.current) return;
    const handle = viewportRef.current;
    if (!handle) return;
    openedRef.current = true;
    if (initialMoment) {
      setPendingTarget({ id: initialMoment.subject, slug: null, camera: null, animate: false, moment: initialMoment, since: Date.now() });
      return;
    }
    if (window.location.pathname === "/tonight") {
      enterTonight();
      return;
    }
    if (initialLocation.rate !== null) handle.setRate(initialLocation.rate);
    if (initialLocation.paused) handle.setPaused(true);
    const targetId = resolveLocationTarget(initialLocation);
    if (initialLocation.slug || initialLocation.legacyObjectId) {
      setPendingTarget({ id: targetId, slug: initialLocation.slug ?? initialLocation.legacyObjectId, camera: initialLocation.camera, animate: false, since: Date.now() });
      return;
    }
    const stored = readStoredSession();
    if (stored && stored.targetId && index.byId.has(stored.targetId)) {
      // Returning visitor: put them back where they were, and say so.
      handle.restore({ targetId: stored.targetId, distanceKm: stored.distanceKm, direction: stored.direction });
      const entity = index.byId.get(stored.targetId);
      if (entity) {
        setResume({ id: entity.id, name: entity.name });
        showToast(`Welcome back. You were at ${entity.name}.`, undefined, 4_200);
      }
      return;
    }
    // First visit: Earth as a thick crescent with its night side lit by cities, the Moon's orbit
    // in frame and the Milky Way behind. A slow drift says "this is alive, you can move it".
    const earth = index.byId.get("solar:planet:earth");
    const world = earth ? getEntityWorld(earth, initialTime) : null;
    if (earth && world) {
      const toSun = normalize3([-world[0], -world[1], -world[2]]);
      const side = normalize3(cross3([0, 1, 0], toSun));
      const a = (118 * Math.PI) / 180;
      const e = (14 * Math.PI) / 180;
      const direction = normalize3([
        (toSun[0] * Math.cos(a) + side[0] * Math.sin(a)) * Math.cos(e),
        (toSun[1] * Math.cos(a) + side[1] * Math.sin(a)) * Math.cos(e) + Math.sin(e),
        (toSun[2] * Math.cos(a) + side[2] * Math.sin(a)) * Math.cos(e),
      ]);
      handle.placeAt("solar:planet:earth", 6_371 * 6.2, direction, false);
      handle.setIdleSpin(reducedMotion ? 0 : 0.012);
      if (!compact) setStartOpen(true);
    }
  }, [compact, enterTonight, index, initialLocation, initialMoment, initialTime, reducedMotion, resolveLocationTarget, showToast]);

  // Apply a pending deep link (or moment) once its catalogue has streamed in, or say we couldn't.
  useEffect(() => {
    if (!pendingTarget) return;
    const handle = viewportRef.current;
    if (!handle) return;
    if (pendingTarget.moment) {
      if (applyMoment(pendingTarget.moment, pendingTarget.animate)) setPendingTarget(null);
      return;
    }
    const id = pendingTarget.id ?? (pendingTarget.slug ? slugs.idFor(pendingTarget.slug) : null);
    if (!id || !index.byId.has(id)) return;
    setSelectedId(id);
    setStartOpen(false);
    if (pendingTarget.camera) handle.placeAt(id, pendingTarget.camera.distanceKm, pendingTarget.camera.direction, pendingTarget.animate);
    else if (pendingTarget.animate) handle.flyTo(id);
    else handle.flyTo(id, { instant: true });
    setPendingTarget(null);
    markSeen();
  }, [applyMoment, index, markSeen, pendingTarget, slugs]);

  const catalogsSettled = statuses.every((item) => item.status !== "loading" && item.status !== "streaming" && item.status !== "idle");
  useEffect(() => {
    if (!pendingTarget) return;
    const giveUp = () => {
      const name = pendingTarget.slug ?? pendingTarget.id ?? "that object";
      setPendingTarget(null);
      setStartOpen(!compact);
      showToast(`Couldn't find “${decodeURIComponent(name)}” in the universe. Try Find (⌘K) or Sky Atlas.`, undefined, 6_000);
    };
    if (catalogsSettled) {
      const timer = window.setTimeout(giveUp, 2_500);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(giveUp, Math.max(1_000, 25_000 - (Date.now() - pendingTarget.since)));
    return () => window.clearTimeout(timer);
  }, [catalogsSettled, compact, pendingTarget, showToast]);

  // Browser back/forward (App increments locationToken on popstate into the universe).
  const lastTokenRef = useRef(locationToken);
  useEffect(() => {
    if (lastTokenRef.current === locationToken) return;
    lastTokenRef.current = locationToken;
    const location = parseExploreLocation(window.location.pathname, window.location.search);
    const nextMoment = getMoment(new URLSearchParams(window.location.search).get("moment"));
    if (nextMoment) {
      setPendingTarget({ id: nextMoment.subject, slug: null, camera: null, animate: true, moment: nextMoment, since: Date.now() });
      return;
    }
    const handle = viewportRef.current;
    if (handle && location.timeMs !== null) handle.setTime(location.timeMs);
    if (handle && location.rate !== null) handle.setRate(location.rate);
    if (handle && location.paused !== null) handle.setPaused(location.paused);
    const id = resolveLocationTarget(location);
    if (!id) {
      if (location.slug) setPendingTarget({ id: null, slug: location.slug, camera: location.camera, animate: true, since: Date.now() });
      else setSelectedId(null);
      return;
    }
    setPendingTarget({ id, slug: location.slug, camera: location.camera, animate: true, since: Date.now() });
  }, [locationToken, resolveLocationTarget]);

  // ------------------------------------------------------------------------------------------
  // Camera events & periodic state (URL pose, session, time display)

  const handleCameraEvent = useCallback(
    (event: CameraEvent) => {
      if (event.type === "flight-start") setFlight({ label: event.flight.label, kind: event.flight.kind });
      else if (event.type === "flight-end") setFlight(null);
      else if (event.type === "manual") markSeen();
    },
    [markSeen],
  );

  const handleReport = useCallback(
    (snapshot: CameraSnapshot) => {
      setReport(snapshot);
      setLive(!snapshot.paused && snapshot.rate === 1 && Math.abs(snapshot.simTimeMs - Date.now()) < 120_000);
      const day = new Date(snapshot.simTimeMs).toISOString().slice(0, 10);
      setEpochDay((current) => (current === day ? current : day));
      const now = performance.now();
      if (now - lastUrlWrite.current > 1_500 && !pendingTarget && active && !groundRef.current) {
        lastUrlWrite.current = now;
        const id = selectedRef.current;
        const path = buildExplorePath(id ? slugs.slugFor(id) : null, {
          timeMs: Math.abs(snapshot.simTimeMs - Date.now()) > 60_000 || snapshot.rate !== 1 ? snapshot.simTimeMs : undefined,
          rate: snapshot.rate,
          paused: snapshot.paused,
          camera: id && snapshot.targetId === id ? { distanceKm: snapshot.distanceKm, direction: snapshot.direction } : undefined,
        });
        if (`${window.location.pathname}${window.location.search}` !== path && (window.location.pathname === "/" || window.location.pathname.startsWith("/explore") || window.location.pathname === "/skymap")) {
          window.history.replaceState(window.history.state, "", path);
        }
        rememberExplorePath(path);
        writeStoredSession({ targetId: snapshot.targetId, distanceKm: snapshot.distanceKm, direction: snapshot.direction, savedAt: Date.now() });
      }
    },
    [active, pendingTarget, slugs],
  );

  // ------------------------------------------------------------------------------------------
  // Journeys

  const runJourneyStep = useCallback(
    (state: { journey: Journey; step: number }) => {
      const stop = state.journey.stops[state.step];
      if (!stop) return;
      let id = stop.id;
      if (!index.byId.has(id) && id.includes("proxima")) {
        id = index.entities.find((entity) => entity.name.toLowerCase().includes("proxima"))?.id ?? id;
      }
      if (!index.byId.has(id)) return;
      setSelectedId(id);
      setPanelHidden(true);
      viewportRef.current?.flyTo(id, { framing: stop.framing ?? "auto" });
      pushObjectUrl(id);
    },
    [index, pushObjectUrl],
  );

  const startJourney = useCallback(
    (selectedJourney: Journey) => {
      const state = { journey: selectedJourney, step: 0 };
      setJourney(state);
      setMoment(null);
      setStartOpen(false);
      markSeen();
      runJourneyStep(state);
    },
    [markSeen, runJourneyStep],
  );

  const stepJourney = useCallback(
    (delta: number) => {
      setJourney((current) => {
        if (!current) return current;
        const step = current.step + delta;
        if (step < 0) return current;
        if (step >= current.journey.stops.length) {
          setPanelHidden(false);
          return null;
        }
        const next = { journey: current.journey, step };
        runJourneyStep(next);
        return next;
      });
    },
    [runJourneyStep],
  );

  // ------------------------------------------------------------------------------------------
  // Keep, share, postcards

  const currentHref = useCallback(() => {
    const handle = viewportRef.current;
    if (!handle) return null;
    const snapshot = handle.getSnapshot();
    const id = selectedRef.current ?? snapshot.targetId;
    return {
      snapshot,
      id,
      path: buildExplorePath(id ? slugs.slugFor(id) : null, {
        timeMs: snapshot.simTimeMs,
        rate: snapshot.rate,
        paused: snapshot.paused,
        camera: { distanceKm: snapshot.distanceKm, direction: snapshot.direction },
      }),
    };
  }, [slugs]);

  const copyLink = async () => {
    setShareOpen(false);
    const current = currentHref();
    if (!current) return;
    const url = `${window.location.origin}${current.path}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast("Link copied. It opens this exact object, moment and camera angle.");
    } catch {
      showToast(url, undefined, 8_000);
    }
  };

  const captionFor = (snapshotTime: number, id: string | null) => {
    const entity = id ? index.byId.get(id) : null;
    const title = entity?.name ?? "The universe";
    const subtitle = [entity?.category, formatCaptionDate(snapshotTime), moment ? moment.title : null].filter(Boolean).join(" · ");
    return { title, subtitle };
  };

  const buildPostcard = () => {
    const handle = viewportRef.current;
    const current = currentHref();
    const shot = handle?.capture();
    if (!handle || !current || !shot) return null;
    const canvasEl = rootRef.current?.querySelector("canvas");
    const caption = captionFor(current.snapshot.simTimeMs, current.id);
    const card = composePostcard(shot, {
      ...caption,
      url: `${window.location.origin}${current.path}`,
      labelsRoot: rootRef.current?.querySelector(".ex-labels") ?? null,
      canvasRect: canvasEl?.getBoundingClientRect() ?? null,
    });
    return { card, caption, current };
  };

  const downloadPostcard = () => {
    setShareOpen(false);
    const built = buildPostcard();
    if (!built) {
      showToast("The view isn't ready to capture yet.");
      return;
    }
    built.card.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `spaceviewer-${built.caption.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
      showToast("Postcard saved. The link on it reopens this view.");
    }, "image/png");
  };

  const canSystemShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const systemShare = () => {
    setShareOpen(false);
    const built = buildPostcard();
    const current = built?.current ?? currentHref();
    if (!current) return;
    const url = `${window.location.origin}${current.path}`;
    const title = built?.caption.title ?? "SpaceViewer";
    if (built) {
      built.card.toBlob(async (blob) => {
        const file = blob ? new File([blob], "spaceviewer.png", { type: "image/png" }) : null;
        try {
          if (file && navigator.canShare?.({ files: [file] })) await navigator.share({ title, url, files: [file] });
          else await navigator.share({ title, url });
        } catch {
          // dismissed
        }
      }, "image/png");
      return;
    }
    navigator.share({ title, url }).catch(() => undefined);
  };

  const keepView = () => {
    const current = currentHref();
    if (!current?.id) return;
    const entity = index.byId.get(current.id);
    if (!entity) return;
    const shot = viewportRef.current?.capture();
    saveView({
      targetId: entity.id,
      name: entity.name,
      category: entity.category,
      href: current.path,
      timeMs: current.snapshot.simTimeMs,
      thumb: shot ? thumbnailFrom(shot) : undefined,
    });
    showToast(`Saved to Your sky: ${entity.name}, exactly as you see it now.`);
  };

  // ------------------------------------------------------------------------------------------
  // Keyboard shortcuts

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!active) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (target?.closest?.("[role=dialog]")) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "/") {
        event.preventDefault();
        setSearchFocusKey((value) => value + 1);
      } else if (event.key === " ") {
        event.preventDefault();
        const handle = viewportRef.current;
        if (handle) handle.setPaused(!handle.engine.paused);
      } else if (event.key.toLowerCase() === "f" && selectedRef.current) {
        flyTo(selectedRef.current);
      } else if (event.key.toLowerCase() === "h") {
        viewportRef.current?.goHome();
        setSelectedId("solar:planet:earth");
      } else if (event.key.toLowerCase() === "s" && event.shiftKey === false && selectedRef.current) {
        keepView();
      } else if (event.key.toLowerCase() === "r") {
        surprise();
      } else if (event.key === "Escape" && !viewportRef.current?.engine.trackedId) {
        setSelectedId(null);
      } else if (event.key === "ArrowRight" && journey && event.shiftKey) {
        stepJourney(1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  // ------------------------------------------------------------------------------------------
  // Derived UI data

  const simTimeMs = report?.simTimeMs ?? initialTime;
  const cameraWorld = report?.cameraWorld ?? ([0, 0, 0] as Vec3);
  const facts = useMemo(() => (selected ? getFacts(selected, index, simTimeMs, cameraWorld) : []), [cameraWorld, index, selected, simTimeMs]);
  const routes = useMemo(() => (selected ? getOnwardRoutes(selected, index, simTimeMs) : []), [index, selected, simTimeMs]);
  const description = selected ? (surpriseHook?.id === selected.id ? surpriseHook.hook : getDescription(selected)) : undefined;
  const viewWidthKm = report ? 2 * report.distanceKm * Math.tan((lensDeg * Math.PI) / 360) * (viewport.width / viewport.height) : 0;
  const fromSun = report?.cameraFromSunKm ?? 0;
  const step = scaleStepFor(viewWidthKm, fromSun);
  const location = report ? describeLocation(cameraWorld, index, simTimeMs) : "";
  const tracked = report?.targetId ?? null;
  const selectedWorld = selected ? getEntityWorld(selected, simTimeMs) : null;
  const selectedFromSun = selectedWorld ? Math.hypot(...selectedWorld) : null;

  const onScaleStep = (item: ScaleStep) => {
    if (item.id === "stars") {
      const proxima = index.entities.find((entity) => entity.name.toLowerCase().includes("proxima centauri"));
      if (proxima) flyTo(proxima.id, "context");
      else flyTo("solar:sun", "context");
      return;
    }
    if (item.id === "group") {
      flyTo("deep:galaxy:andromeda-galaxy");
      return;
    }
    if (item.id === "planet") {
      flyTo("solar:planet:earth", "system");
      return;
    }
    if (item.target) flyTo(item.target, item.id === "system" ? "context" : "auto");
  };

  const setQualityPersist = (next: ExplorerQuality) => {
    setQuality(next);
    try {
      window.localStorage.setItem(QUALITY_KEY, next);
    } catch {
      // ignore
    }
  };

  const solarTarget = selected ? toSolarTarget(selected, simTimeMs) : null;

  const barActions = (
    <>
      <button
        type="button"
        className={`sv-btn sv-btn--small ex-start-btn${startOpen ? " is-on" : ""}`}
        onClick={() => setStartOpen((value) => !value)}
        aria-expanded={startOpen}
      >
        <Icon name="sparkle" size={15} />
        <span>Start here</span>
      </button>
      <button
        type="button"
        className={`sv-btn sv-btn--small ex-tonight-btn${ground ? " is-on" : ""}`}
        onClick={() => (ground ? (tonightHidden ? setTonightHidden(false) : leaveTonight()) : enterTonight())}
        aria-pressed={Boolean(ground)}
        title={ground ? "Leave the ground and return to space" : "See tonight's sky from where you are"}
      >
        <Icon name="tonight" size={15} />
        <span>{ground ? (tonightHidden ? "Tonight" : "Leave ground") : "Tonight"}</span>
      </button>
      <button type="button" className={`sv-icon-btn${optionsOpen ? " is-on" : ""}`} onClick={() => setOptionsOpen((value) => !value)} aria-label="View options" aria-expanded={optionsOpen}>
        <Icon name="layers" size={18} />
      </button>
      <div className="ex-share-anchor">
        <button type="button" className={`sv-icon-btn${shareOpen ? " is-on" : ""}`} onClick={() => setShareOpen((value) => !value)} aria-label="Share this view" aria-haspopup="menu" aria-expanded={shareOpen}>
          <Icon name="share" size={18} />
        </button>
        {shareOpen ? <ShareMenu onCopyLink={copyLink} onPostcard={downloadPostcard} onSystemShare={canSystemShare ? systemShare : undefined} onClose={() => setShareOpen(false)} /> : null}
      </div>
    </>
  );

  const searchNode = (
    <SearchBox
      search={searchIndex.search}
      index={index}
      timeMs={simTimeMs}
      autoFocusKey={searchFocusKey}
      onSelect={(entity, fly) => {
        setJourney(null);
        setMoment(null);
        select(entity.id, { fly });
      }}
      onSearchPhotos={(query) => onOpenImagery(query)}
    />
  );

  return (
    <div ref={rootRef} className={`ex-root${compact ? " is-compact" : ""}${panelOpen ? " has-panel" : ""}${moment ? " has-moment" : ""}`} hidden={!active} aria-hidden={!active}>
      <UniverseViewport
        ref={viewportRef}
        index={index}
        starChunks={starChunks}
        galaxyChunks={galaxy.chunks}
        brightChunks={brightChunks}
        skyCulture={skyCulture}
        minorOrbits={minorOrbits}
        selectedId={selectedId}
        hoveredId={hoveredId}
        contextId={contextId}
        quality={quality}
        occludedLeft={occludedLeft}
        occludedRight={0}
        occludedBottom={occludedBottom}
        initialTimeMs={initialTime}
        reducedMotion={reducedMotion}
        active={active}
        onSelect={(id) => select(id)}
        onHover={setHoveredId}
        onFlyRequest={(id) => select(id, { fly: true })}
        onCameraEvent={handleCameraEvent}
        onReport={handleReport}
      />

      {renderBar(searchNode, barActions)}

      {optionsOpen ? (
        <div className="ex-popover ex-options" role="dialog" aria-label="View options">
          <label>
            <input
              type="checkbox"
              checked={showOrbits}
              onChange={(event) => {
                setShowOrbits(event.target.checked);
                viewportRef.current?.setToggles({ orbits: event.target.checked });
              }}
            />
            Orbits
          </label>
          <label>
            <input
              type="checkbox"
              checked={showLabels}
              onChange={(event) => {
                setShowLabels(event.target.checked);
                viewportRef.current?.setToggles({ labels: event.target.checked });
              }}
            />
            Labels
          </label>
          <label>
            <input type="checkbox" checked={showConstellations} onChange={(event) => toggleConstellations(event.target.checked)} />
            Constellations
          </label>
          <label>
            <input
              type="checkbox"
              checked={showMinorBodies}
              onChange={(event) => {
                setShowMinorBodies(event.target.checked);
                viewportRef.current?.setToggles({ minorBodies: event.target.checked });
              }}
            />
            Asteroids &amp; Kuiper Belt
          </label>
          <fieldset>
            <legend>Graphics</legend>
            {(["low", "balanced", "high", "ultra"] as ExplorerQuality[]).map((tier) => (
              <button key={tier} type="button" className={quality === tier ? "is-on" : ""} onClick={() => setQualityPersist(tier)}>
                {tier[0].toUpperCase() + tier.slice(1)}
              </button>
            ))}
          </fieldset>
          <p className="ex-options__note">Distances and positions are true to scale. Sizes are physical; faint objects keep a findable marker.</p>
        </div>
      ) : null}

      {startOpen ? (
        <StartPanel
          journeys={JOURNEYS}
          index={index}
          catalogues={[
            ...statuses,
            {
              id: "gaia-galaxy",
              label: "Gaia galaxy stars",
              status: galaxy.status === "streaming" ? "streaming" : galaxy.status === "ready" ? "ready" : galaxy.status === "error" ? "error" : "idle",
              detail: galaxy.total ? `${galaxy.loaded.toLocaleString("en-GB")} of ${galaxy.total.toLocaleString("en-GB")}` : "after nearby stars",
            },
          ]}
          resume={resume && resume.id !== selectedId ? resume : null}
          onSurprise={surprise}
          onTonight={() => enterTonight()}
          onMoment={playMoment}
          onStartJourney={startJourney}
          onPick={(id) => {
            setJourney(null);
            setMoment(null);
            select(id, { fly: true });
          }}
          onResume={() => {
            if (resume) select(resume.id, { fly: true });
          }}
          onClose={() => setStartOpen(false)}
        />
      ) : tonightOpen && ground ? (
        <TonightPanel
          index={index}
          culture={skyCulture}
          place={ground}
          simTimeMs={simTimeMs}
          sunAltitudeDeg={report?.sunAltitudeDeg ?? 0}
          onPlace={changePlace}
          onLook={(id) => {
            setSelectedId(id);
            setPanelHidden(compact);
            const where = viewportRef.current?.lookAtObject(id);
            const entity = index.byId.get(id);
            if (where && entity && where.altDeg < 0) showToast(`${entity.name} is below your horizon right now. Try "Tonight, once dark" or "Watch the night".`);
          }}
          onTime={(ms, rate = 1) => {
            const handle = viewportRef.current;
            if (!handle) return;
            handle.setTime(ms);
            handle.setRate(rate);
            handle.setPaused(false);
          }}
          onLeave={leaveTonight}
          onClose={() => setTonightHidden(true)}
        />
      ) : selected && !panelHidden ? (
        <ObjectPanel
          entity={selected}
          facts={facts}
          description={description}
          routes={routes}
          isTracked={tracked === selected.id}
          flying={Boolean(flight)}
          saved={savedIds.has(selected.id)}
          onSave={keepView}
          extras={
            <>
              <LightStoryLine entity={selected} distanceKm={selected.solarId || selected.kind === "sun" ? null : selectedFromSun} />
              <SkyPhotoLine entity={selected} />
              <FigureLine
                entity={selected}
                culture={skyCulture}
                figuresOn={showConstellations}
                onShowFigure={() => toggleConstellations(true)}
                onComeApart={() => watchFigureComeApart(selected.id)}
              />
              <WatchLive entityId={selected.id} onOpen={onOpenLive} />
              <TelescopeStrip entity={selected} onOpen={onOpenImage} onMore={() => onOpenImagery(imageQueryFor(selected))} />
            </>
          }
          onClose={() => {
            setSelectedId(null);
            pushObjectUrl(null);
          }}
          onFly={() => flyTo(selected.id)}
          onRoute={(route: OnwardRoute) => {
            setJourney(null);
            // Zooming out to a container (the Galaxy, a planet's system) keeps where you came from labelled.
            const container = route.id === "galactic:milky-way-structure" || route.reason === "Parent planet";
            setContextId(container ? selected.id : null);
            select(route.id, { fly: true, framing: route.framing });
          }}
          onImages={() => onOpenImagery(imageQueryFor(selected))}
          onShare={() => setShareOpen(true)}
          onOpenSolar={solarTarget ? () => onOpenSolar(solarTarget) : undefined}
        />
      ) : null}

      {moment ? (
        <MomentCard
          moment={moment}
          lensDeg={lensDeg}
          onNormalLens={normalLens}
          onTelescope={() => {
            viewportRef.current?.setFov(moment.lensDeg ?? 50);
            setLensDeg(moment.lensDeg ?? 50);
          }}
          onNow={backToNow}
          onImages={() => onOpenImagery(moment.imageQuery)}
          onClose={() => {
            setMoment(null);
            normalLens();
          }}
        />
      ) : null}

      {journey ? (
        <JourneyBar
          journey={journey.journey}
          stepIndex={journey.step}
          caption={journey.journey.stops[journey.step]?.caption ?? ""}
          onPrev={() => stepJourney(-1)}
          onNext={() => stepJourney(1)}
          onExit={() => {
            setJourney(null);
            setPanelHidden(false);
          }}
        />
      ) : null}

      {flight ? <FlightBar label={flight.label} kind={flight.kind} onCancel={() => viewportRef.current?.cancelFlight()} /> : null}

      {pendingTarget ? (
        <div className="ex-flight" role="status">
          <span className="ex-flight__pulse" aria-hidden="true" />
          <span>
            Locating <strong>{pendingTarget.moment?.title ?? (pendingTarget.slug ? decodeURIComponent(pendingTarget.slug) : "object")}</strong>
            <small>streaming catalogues</small>
          </span>
        </div>
      ) : null}

      {!panelOpen && !journey && !flight && !pendingTarget && !moment ? (
        <button type="button" className="ex-cta" onClick={surprise}>
          <Icon name="sparkle" size={16} />
          Show me something incredible
        </button>
      ) : null}

      <div className="ex-bottom">
        <TimeCapsule
          timeMs={simTimeMs}
          rate={report?.rate ?? 1}
          paused={report?.paused ?? false}
          live={live}
          expanded={timeExpanded}
          onToggleExpanded={() => setTimeExpanded((value) => !value)}
          onTogglePaused={() => {
            const handle = viewportRef.current;
            if (handle) handle.setPaused(!handle.engine.paused);
          }}
          onRate={(rate) => {
            const handle = viewportRef.current;
            if (!handle) return;
            handle.setRate(rate);
            handle.setPaused(false);
          }}
          onNow={() => {
            const handle = viewportRef.current;
            if (!handle) return;
            handle.setTime(Date.now());
            handle.setRate(1);
            handle.setPaused(false);
            setMoment(null);
          }}
          onSetTime={(ms) => viewportRef.current?.setTime(ms)}
        />
        <LocationRail step={step} location={location} viewWidthKm={viewWidthKm} onStep={onScaleStep} />
        <div className="ex-zoom" role="group" aria-label="Zoom">
          <button type="button" className="ex-icon-btn" onClick={() => viewportRef.current?.zoomBy(0.5)} aria-label="Zoom in">
            <Icon name="plus" size={18} />
          </button>
          <button type="button" className="ex-icon-btn" onClick={() => viewportRef.current?.zoomBy(2)} aria-label="Zoom out">
            <Icon name="minus" size={18} />
          </button>
          <button
            type="button"
            className="ex-icon-btn"
            onClick={() => {
              setJourney(null);
              if (selectedRef.current) flyTo(selectedRef.current);
              else viewportRef.current?.goHome();
            }}
            aria-label={selected ? `Recentre on ${selected.name}` : "Return to Earth"}
            title={selected ? `Recentre on ${selected.name}` : "Return to Earth"}
          >
            <Icon name="home" size={18} />
          </button>
        </div>
      </div>

      {hint && !journey && !moment ? (
        <p className="ex-hint" aria-live="polite">
          {compact ? "Drag to look around · pinch to travel outward · tap anything" : "Drag to orbit · scroll or pinch to zoom out to the stars · double-click anything to fly there"}
        </p>
      ) : null}

      {toast ? (
        <div className="ex-toast" role="status">
          <Icon name={toast.text.startsWith("Saved") ? "star-filled" : toast.text.startsWith("Welcome") ? "now" : toast.text.startsWith("Couldn") ? "info" : "copy"} size={14} /> {toast.text}
          {toast.action ? (
            <button type="button" className="ex-link-btn" onClick={toast.action.run}>
              {toast.action.label}
            </button>
          ) : null}
        </div>
      ) : null}
      <span className="ex-sr" aria-live="polite">
        {selected ? `${selected.name}, ${selected.category}` : ""}
      </span>
    </div>
  );
};

export default ExplorePage;
