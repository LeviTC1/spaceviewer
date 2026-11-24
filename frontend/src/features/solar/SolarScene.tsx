import { FC, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, Line, OrbitControls, Stars } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import {
  AdditiveBlending,
  MathUtils,
  Matrix4,
  Quaternion,
  Texture,
  Vector3,
  type Intersection,
  type MeshBasicMaterial,
  type MeshStandardMaterial,
  type Object3D,
  type Raycaster,
} from "three";
import PlanetMesh from "./PlanetMesh";
import OrbitRing from "./OrbitRing";
import { PLANETS, type PlanetDef, type PlanetId, type SolarScaleMode } from "./solarData";
import type { TextureQuality } from "./textures/textureCatalog";
import { loadSunTextures } from "./textures/loadSunTexture";
import { MOONS, type MoonVisibilityMode, type MoonDef } from "./moonData";
import MoonMesh from "./MoonMesh";
import {
  getSolarPlanetFocusDistance,
  getSolarScaleSceneProfile,
  scaleDistanceAu,
  scaleMoonDistanceKm,
  scaleRadiusKm,
} from "./solarScale";
import AsteroidBelt from "./asteroids/AsteroidBelt";
import type { AsteroidBeltMode } from "./asteroids/asteroidGenerator";
import { StarField } from "../starmap/starRenderer";
import CatalogStarField from "../starmap/CatalogStarField";
import { useNearbyStarCatalog } from "../starmap/useNearbyStars";
import { useStarLOD } from "../starmap/useStarLOD";
import { useRenderActivity } from "../../lib/rendering/useRenderActivity";
import WebGLCanvasLifecycle from "../../lib/rendering/WebGLCanvasLifecycle";
import { ASTRONOMICAL_WEBGL_OPTIONS } from "../../domain/astro/rendererBackend";
import AdaptiveQualityMonitor from "../../lib/rendering/AdaptiveQualityMonitor";
import type { AdaptiveQualityReport } from "../../lib/rendering/adaptiveQuality";
import {
  getSolarObjectState,
  getSolarBodyOrientation,
  isControlledSatelliteOrientationBodyId,
  getSolarMoonOrbitScenePoints,
  getSolarPlanetOrbitScenePoints,
  getSolarSmallBodyOrbitScenePoints,
  getSolarRingSystem,
  projectSolarMoonStateToScenePosition,
  projectSolarStateToScenePosition,
  SOLAR_RING_SHADOW_MODEL,
  toSceneTuple,
  type StreamedSolarEphemerisSnapshot,
} from "../../domain/solar";
import { SOLAR_NAVIGATION_LABELS, type SolarNavigationMode } from "./solarNavigation";
import {
  ASTRO_QUALITY_PROFILES,
  type AstroQualityProfile,
  type AstroQualityTier,
} from "../../lib/rendering/qualityManager";
import {
  createCameraFlightState,
  shouldReduceCameraFlightMotionInBrowser,
  type CameraFlightState,
} from "../../domain/astro/cameraFlight";
import {
  SOLAR_ECLIPSE_MODEL,
  SOLAR_MOON_ECLIPSE_MODEL,
  type MoonEclipseOccluder,
  type PlanetEclipseOccluder,
} from "./eclipse/solarEclipseModel";
import {
  getAtmosphereScatteringProfile,
  SOLAR_ATMOSPHERE_SCATTERING_MODEL,
} from "./atmosphere/atmosphereScatteringModel";
import { PLANET_MATERIAL_PRESETS } from "./textures/planetMaterialPresets";
import SmallBodyMesh from "./smallBodies/SmallBodyMesh";
import {
  SMALL_BODIES,
  type SmallBodyDef,
  type SmallBodyId,
} from "./smallBodies/smallBodyData";
import { SMALL_BODY_EPHEMERIS_MODEL } from "../../domain/solar/smallBodyEphemeris";

interface CameraState {
  position: [number, number, number];
  target: [number, number, number];
}

interface SolarSceneProps {
  timeDays: number;
  ephemerisSnapshot: StreamedSolarEphemerisSnapshot;
  isPlaying: boolean;
  scaleMode: SolarScaleMode;
  performanceMode: boolean;
  qualityTier: AstroQualityTier;
  textureQuality: TextureQuality;
  moonMode: MoonVisibilityMode;
  moonVisibilityOverrides: Partial<Record<PlanetId, boolean>>;
  asteroidMode: AsteroidBeltMode;
  selectedId: PlanetId | null;
  selectedEclipseOccluders: PlanetEclipseOccluder[];
  selectedMoonEclipseOccluders: MoonEclipseOccluder[];
  selectedMoonId: string | null;
  selectedSmallBodyId: SmallBodyId | null;
  sunSelected: boolean;
  focusTargetId: PlanetId | null;
  focusToken: number;
  focusMoonId: string | null;
  focusMoonToken: number;
  focusSunToken: number;
  focusSmallBodyId: SmallBodyId | null;
  focusSmallBodyToken: number;
  trackTargetId: PlanetId | null;
  trackMoonId: string | null;
  bookmarkTarget: CameraState | null;
  bookmarkToken: number;
  navigationMode: SolarNavigationMode;
  navigationToken: number;
  cancelFlightToken: number;
  onSelectPlanet: (planet: PlanetDef | null) => void;
  onSelectMoon: (moon: MoonDef) => void;
  onSelectSun: (selected: boolean) => void;
  onSelectSmallBody: (body: SmallBodyDef) => void;
  onRequestFocus: (planet: PlanetDef) => void;
  onRequestSmallBodyFocus: (body: SmallBodyDef) => void;
  onCameraState: (state: CameraState) => void;
  onCameraFlightChange: (flight: CameraFlightState | null) => void;
  adaptiveQualityEnabled: boolean;
  onAdaptiveQualityDrop: (report: AdaptiveQualityReport) => void;
}

interface SolarFocusFlight {
  startPos: Vector3;
  startTarget: Vector3;
  endPos: Vector3;
  endTarget: Vector3;
  progress: number;
  durationSeconds?: number;
}

const getRenderRadius = (planet: PlanetDef) => {
  const baseRadius = scaleRadiusKm(planet.radiusKm) * 0.64;
  if (planet.id === "jupiter") return baseRadius * 1.12;
  if (planet.id === "saturn") return baseRadius * 1.06;
  return baseRadius;
};

const MIN_SUN_ORBIT = 9.6;
const ignoreRaycast = (_raycaster: Raycaster, _intersects: Intersection<Object3D>[]) => undefined;
const DEFAULT_PLANET_VIEW_DIRECTION = new Vector3(0.52, 0.34, 0.78).normalize();

const getStablePlanetViewDirection = (cameraPosition: Vector3, cameraTarget: Vector3) => {
  const direction = cameraPosition.clone().sub(cameraTarget);
  if (direction.lengthSq() < 0.001) return DEFAULT_PLANET_VIEW_DIRECTION.clone();
  direction.normalize();
  return Math.abs(direction.y) > 0.82 ? DEFAULT_PLANET_VIEW_DIRECTION.clone() : direction;
};

const getPlanetMinSceneDistance = (planet: PlanetDef, scaleMode: SolarScaleMode) =>
  scaleMode !== "realistic" && planet.id === "mercury" ? MIN_SUN_ORBIT : 0;

const getPlanetScenePosition = (planet: PlanetDef, timeDays: number, scaleMode: SolarScaleMode) => {
  const state = getSolarObjectState(planet.id, timeDays);
  if (!state) return [0, 0, 0] as [number, number, number];
  return toSceneTuple(
    projectSolarStateToScenePosition(state, {
      scaleDistanceAu: (au) => scaleDistanceAu(au, scaleMode),
      minSceneDistance: getPlanetMinSceneDistance(planet, scaleMode),
    }),
  );
};

const getPlanetOrbitScenePoints = (
  planet: PlanetDef,
  scaleMode: SolarScaleMode,
  timeDays: number,
  samples: number,
) =>
  getSolarPlanetOrbitScenePoints(planet.id, {
    scaleDistanceAu: (au) => scaleDistanceAu(au, scaleMode),
    minSceneDistance: getPlanetMinSceneDistance(planet, scaleMode),
    samples,
    time: { daysSinceEpoch: timeDays },
  }).map(toSceneTuple);

const getPlanetDistanceAu = (planet: PlanetDef, timeDays: number) => {
  const state = getSolarObjectState(planet.id, timeDays);
  return state?.orbital?.radiusAu ?? planet.semiMajorAxisAU;
};

const getSmallBodyRenderRadius = (body: SmallBodyDef) =>
  body.kind === "comet"
    ? Math.max(0.16, Math.cbrt(body.radiusKm) * 0.055)
    : scaleRadiusKm(body.radiusKm, 0.5) * 0.86;

const getSmallBodyScenePosition = (
  body: SmallBodyDef,
  timeDays: number,
  scaleMode: SolarScaleMode,
) => {
  const state = getSolarObjectState(body.id, { daysSinceEpoch: timeDays });
  if (!state) return [0, 0, 0] as [number, number, number];
  return toSceneTuple(
    projectSolarStateToScenePosition(state, {
      scaleDistanceAu: (au) => scaleDistanceAu(au, scaleMode),
    }),
  );
};

const getSmallBodyOrbitScenePoints = (
  body: SmallBodyDef,
  scaleMode: SolarScaleMode,
  samples: number,
) =>
  getSolarSmallBodyOrbitScenePoints(body.id, {
    scaleDistanceAu: (au) => scaleDistanceAu(au, scaleMode),
    samples,
  }).map(toSceneTuple);

const formatOrbitAu = (value: number) => `${value.toFixed(value >= 10 ? 1 : 2)} AU`;

const getSelectedOrbitTrailDays = (planet: PlanetDef) => MathUtils.clamp(planet.orbitalPeriodDays * 0.028, 18, 260);

const getMoonScenePosition = (
  moon: MoonDef,
  parentPosition: [number, number, number],
  parentRadius: number,
  timeDays: number,
  scaleMode: SolarScaleMode,
) => {
  const state = getSolarObjectState(moon.id, timeDays);
  if (!state) return null;
  return toSceneTuple(
    projectSolarMoonStateToScenePosition(state, {
      parentScenePosition: parentPosition,
      parentRadiusSceneUnits: parentRadius,
      scaleMoonDistanceKm: (km) => scaleMoonDistanceKm(km, scaleMode),
    }),
  );
};

const getMoonOrbitScenePoints = (
  moon: MoonDef,
  parentPosition: [number, number, number],
  parentRadius: number,
  timeDays: number,
  scaleMode: SolarScaleMode,
  samples: number,
) =>
  getSolarMoonOrbitScenePoints(moon.id, {
    parentScenePosition: parentPosition,
    parentRadiusSceneUnits: parentRadius,
    scaleMoonDistanceKm: (km) => scaleMoonDistanceKm(km, scaleMode),
    samples,
    time: { daysSinceEpoch: timeDays },
  }).map(toSceneTuple);

const getPlanetarySystemDistance = (
  planet: PlanetDef,
  parentPosition: [number, number, number],
  parentRadius: number,
  timeDays: number,
  scaleMode: SolarScaleMode,
  moonOrbitSamples: number,
) => {
  const moonDistances = MOONS.filter((moon) => moon.parentPlanet === planet.id && moon.class === "major")
    .map((moon) => getMoonOrbitScenePoints(moon, parentPosition, parentRadius, timeDays, scaleMode, moonOrbitSamples))
    .flat()
    .map((point) =>
      Math.hypot(point[0] - parentPosition[0], point[1] - parentPosition[1], point[2] - parentPosition[2]),
    );
  const outerMoonDistance = moonDistances.length ? Math.max(...moonDistances) : 0;
  return Math.max(parentRadius * 8, outerMoonDistance * 1.35, 8);
};

const SelectedOrbitTrail: FC<{
  planet: PlanetDef;
  timeDays: number;
  scaleMode: SolarScaleMode;
  samples: number;
}> = ({ planet, timeDays, scaleMode, samples }) => {
  const trailPoints = useMemo(() => {
    const trailDays = getSelectedOrbitTrailDays(planet);
    return Array.from({ length: samples }, (_, index) => {
      const sampleTime = timeDays - (trailDays * (samples - index - 1)) / samples;
      return getPlanetScenePosition(planet, sampleTime, scaleMode);
    });
  }, [planet, samples, scaleMode, timeDays]);

  return <Line points={trailPoints} color="#ffcf8a" transparent opacity={0.42} blending={AdditiveBlending} raycast={ignoreRaycast} />;
};

const SelectedOrbitAnnotations: FC<{
  planet: PlanetDef;
  timeDays: number;
  scaleMode: SolarScaleMode;
  currentPosition: [number, number, number];
  orbitPoints: Array<[number, number, number]>;
}> = ({ planet, timeDays, scaleMode, currentPosition, orbitPoints }) => {
  const annotations = useMemo(() => {
    if (!orbitPoints.length) return [];
    const apsides = orbitPoints.reduce(
      (entry, point) => {
        const distance = Math.hypot(point[0], point[1], point[2]);
        return {
          perihelion: distance < entry.minDistance ? point : entry.perihelion,
          aphelion: distance > entry.maxDistance ? point : entry.aphelion,
          minDistance: Math.min(entry.minDistance, distance),
          maxDistance: Math.max(entry.maxDistance, distance),
        };
      },
      {
        perihelion: orbitPoints[0],
        aphelion: orbitPoints[0],
        minDistance: Infinity,
        maxDistance: 0,
      },
    );
    const trailDays = getSelectedOrbitTrailDays(planet);
    const trailStart = getPlanetScenePosition(planet, timeDays - trailDays, scaleMode);
    const state = getSolarObjectState(planet.id, timeDays);
    const currentDistanceAu = state?.orbital?.radiusAu ?? planet.semiMajorAxisAU;
    const perihelionAu = planet.semiMajorAxisAU * (1 - (planet.eccentricity ?? 0));
    const aphelionAu = planet.semiMajorAxisAU * (1 + (planet.eccentricity ?? 0));

    return [
      {
        id: "current",
        position: currentPosition,
        label: "Current",
        value: formatOrbitAu(currentDistanceAu),
        tone: "current",
      },
      {
        id: "perihelion",
        position: apsides.perihelion,
        label: "Perihelion",
        value: formatOrbitAu(perihelionAu),
        tone: "warm",
      },
      {
        id: "aphelion",
        position: apsides.aphelion,
        label: "Aphelion",
        value: formatOrbitAu(aphelionAu),
        tone: "cool",
      },
      {
        id: "trail",
        position: trailStart,
        label: "Trail",
        value: `${Math.round(trailDays)} days`,
        tone: "trail",
      },
    ];
  }, [currentPosition, orbitPoints, planet, scaleMode, timeDays]);

  return (
    <group>
      {annotations.map((annotation) => (
        <Html
          key={`${planet.id}-${annotation.id}`}
          position={annotation.position}
          center
          occlude={false}
          zIndexRange={[18, 4]}
        >
          <span className={`solar-orbit-label solar-orbit-label--${annotation.tone}`}>
            <strong>{annotation.label}</strong>
            <em>{annotation.value}</em>
          </span>
        </Html>
      ))}
    </group>
  );
};

const SolarSceneContent: FC<
  Omit<
    SolarSceneProps,
    "performanceMode" | "qualityTier" | "adaptiveQualityEnabled" | "onAdaptiveQualityDrop"
  > & { performanceMode: boolean; qualityProfile: AstroQualityProfile }
> = ({
  timeDays,
  ephemerisSnapshot,
  isPlaying,
  scaleMode,
  performanceMode,
  qualityProfile,
  textureQuality,
  moonMode,
  moonVisibilityOverrides,
  asteroidMode,
  selectedId,
  selectedEclipseOccluders,
  selectedMoonEclipseOccluders,
  selectedMoonId,
  selectedSmallBodyId,
  sunSelected,
  focusTargetId,
  focusToken,
  focusMoonId,
  focusMoonToken,
  focusSunToken,
  focusSmallBodyId,
  focusSmallBodyToken,
  trackTargetId,
  trackMoonId,
  bookmarkTarget,
  bookmarkToken,
  navigationMode,
  navigationToken,
  cancelFlightToken,
  onSelectPlanet,
  onSelectMoon,
  onSelectSun,
  onSelectSmallBody,
  onRequestFocus,
  onRequestSmallBodyFocus,
  onCameraState,
  onCameraFlightChange,
}) => {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const zoomTargetRef = useRef<number | null>(null);
  const focusRef = useRef<SolarFocusFlight | null>(null);
  const lastCancelFlightTokenRef = useRef(cancelFlightToken);
  const timeDaysRef = useRef(timeDays);
  useEffect(() => {
    timeDaysRef.current = timeDays;
  }, [timeDays]);
  const trackingOffsetRef = useRef<Vector3 | null>(null);
  const trackingMoonOffsetRef = useRef<Vector3 | null>(null);
  const lastCameraUpdate = useRef(0);
  const moonVisibilityRef = useRef(0);
  const sunCoreMatRef = useRef<MeshStandardMaterial | null>(null);
  const sunOverlayMatRef = useRef<MeshBasicMaterial | null>(null);
  const sunCoronaMatRef = useRef<MeshBasicMaterial | null>(null);
  const sunNoiseMatRef = useRef<MeshBasicMaterial | null>(null);
  const [sunTextures, setSunTextures] = useState<{ surface: Texture | null; noise: Texture | null }>({
    surface: null,
    noise: null,
  });
  const [starBlend, setStarBlend] = useState(0);
  const [starDistance, setStarDistance] = useState(60);
  const starBlendRef = useRef(0);
  const { camera, gl } = useThree();
  const scaleSceneProfile = getSolarScaleSceneProfile(scaleMode);
  const sunOrientation = useMemo(
    () => getSolarBodyOrientation("sun", { daysSinceEpoch: timeDays }),
    [timeDays],
  );
  const sunBodyQuaternion = useMemo(() => {
    const { primeMeridianUnitVector: x, poleUnitVector: y, thirdAxisUnitVector: z } =
      sunOrientation.sceneFrame;
    return new Quaternion().setFromRotationMatrix(
      new Matrix4().makeBasis(
        new Vector3(x.x, x.y, x.z),
        new Vector3(y.x, y.y, y.z),
        new Vector3(z.x, z.y, z.z),
      ),
    );
  }, [sunOrientation.sceneFrame]);

  const minCameraDistance = 6;
  const maxCameraDistance = scaleSceneProfile.maxCameraDistance;
  const maxCameraDistanceRef = useRef(maxCameraDistance);
  useEffect(() => {
    maxCameraDistanceRef.current = maxCameraDistance;
    if (zoomTargetRef.current !== null) {
      zoomTargetRef.current = MathUtils.clamp(zoomTargetRef.current, minCameraDistance, maxCameraDistance);
    }
  }, [maxCameraDistance]);

  // Desktop wheel zoom is handled manually: OrbitControls applies discrete
  // dolly steps per wheel tick, which feels abrupt and inconsistent across
  // input devices. Instead each wheel event moves an exponential distance
  // target and the frame loop eases the camera toward it, giving smooth,
  // inertial, distance-proportional zoom. Touch devices keep the native
  // OrbitControls pinch gesture.
  const smoothZoomEnabled = useMemo(
    () => typeof window !== "undefined" && !(window.matchMedia?.("(pointer: coarse)").matches ?? false),
    [],
  );

  const [visibleMoonParents, setVisibleMoonParents] = useState<Set<PlanetId>>(() => new Set());
  const starCatalog = useNearbyStarCatalog();
  const starLod = useStarLOD(starCatalog.stars, starDistance);

  const orbitPathMap = useMemo(() => {
    void ephemerisSnapshot.revision;
    const entries: Partial<Record<PlanetId, { points: Array<[number, number, number]>; radius: number }>> = {};
    PLANETS.forEach((planet) => {
      const points = getPlanetOrbitScenePoints(
        planet,
        scaleMode,
        0,
        qualityProfile.planetOrbitSamples,
      );
      const radius = points.reduce((max, point) => Math.max(max, Math.hypot(point[0], point[1], point[2])), 0);
      entries[planet.id] = { points, radius };
    });
    return entries as Record<PlanetId, { points: Array<[number, number, number]>; radius: number }>;
  }, [ephemerisSnapshot.revision, qualityProfile.planetOrbitSamples, scaleMode]);

  const planetPositions = useMemo(
    () => {
      void ephemerisSnapshot.revision;
      return PLANETS.map((planet) => ({
        planet,
        position: getPlanetScenePosition(planet, timeDays, scaleMode),
        distanceAu: getPlanetDistanceAu(planet, timeDays),
      }));
    },
    [ephemerisSnapshot.revision, timeDays, scaleMode],
  );

  const planetPositionMap = useMemo(() => {
    const entries: Record<string, { position: [number, number, number]; radius: number }> = {};
    planetPositions.forEach(({ planet, position }) => {
      entries[planet.id] = { position, radius: getRenderRadius(planet) };
    });
    return entries;
  }, [planetPositions]);
  const planetPositionMapRef = useRef(planetPositionMap);
  useEffect(() => {
    planetPositionMapRef.current = planetPositionMap;
  }, [planetPositionMap]);

  const smallBodyOrbitPathMap = useMemo(() => {
    const entries: Partial<Record<SmallBodyId, Array<[number, number, number]>>> = {};
    SMALL_BODIES.forEach((body) => {
      entries[body.id] = getSmallBodyOrbitScenePoints(
        body,
        scaleMode,
        Math.max(160, qualityProfile.planetOrbitSamples),
      );
    });
    return entries as Record<SmallBodyId, Array<[number, number, number]>>;
  }, [qualityProfile.planetOrbitSamples, scaleMode]);

  const smallBodyPositions = useMemo(
    () =>
      SMALL_BODIES.map((body) => {
        const state = getSolarObjectState(body.id, { daysSinceEpoch: timeDays });
        return {
          body,
          position: getSmallBodyScenePosition(body, timeDays, scaleMode),
          distanceAu: state?.orbital?.radiusAu ?? body.orbit.semiMajorAxisAu,
        };
      }),
    [scaleMode, timeDays],
  );
  const smallBodyPositionMap = useMemo(
    () =>
      Object.fromEntries(
        smallBodyPositions.map(({ body, position }) => [
          body.id,
          { position, radius: getSmallBodyRenderRadius(body) },
        ]),
      ) as Record<SmallBodyId, { position: [number, number, number]; radius: number }>,
    [smallBodyPositions],
  );
  const smallBodyPositionMapRef = useRef(smallBodyPositionMap);
  useEffect(() => {
    smallBodyPositionMapRef.current = smallBodyPositionMap;
  }, [smallBodyPositionMap]);

  const visibleMoons = useMemo(() => {
    if (moonMode === "off") return [];
    const allowedClass = moonMode === "major" ? new Set(["major"]) : null;
    return MOONS.filter((moon) => {
      if (allowedClass && !allowedClass.has(moon.class)) return false;
      const moonAllowed = moonVisibilityOverrides[moon.parentPlanet] ?? true;
      if (!moonAllowed) return false;
      return visibleMoonParents.has(moon.parentPlanet);
    });
  }, [moonMode, moonVisibilityOverrides, visibleMoonParents]);

  const renderReasons = useMemo(
    () =>
      [
        isPlaying ? "time-playback" : null,
        trackTargetId ? "planet-tracking" : null,
        trackMoonId ? "moon-tracking" : null,
      ].filter((reason): reason is string => Boolean(reason)),
    [isPlaying, trackMoonId, trackTargetId],
  );
  const selectedOrientationBodyId = sunSelected
    ? "sun"
    : isControlledSatelliteOrientationBodyId(selectedMoonId)
      ? selectedMoonId
      : selectedId;
  const selectedRingSystem = selectedId ? getSolarRingSystem(selectedId) : null;
  const selectedAtmosphereProfile = selectedId ? getAtmosphereScatteringProfile(selectedId) : null;
  const selectedAtmospherePreset = selectedId ? PLANET_MATERIAL_PRESETS[selectedId].atmosphere : null;
  const selectedOrientation = useMemo(
    () =>
      selectedOrientationBodyId
        ? getSolarBodyOrientation(selectedOrientationBodyId, { daysSinceEpoch: timeDays })
        : null,
    [selectedOrientationBodyId, timeDays],
  );
  const selectedMoonState = useMemo(
    () => (selectedMoonId ? getSolarObjectState(selectedMoonId, { daysSinceEpoch: timeDays }) : null),
    [selectedMoonId, timeDays],
  );
  const { requestRender } = useRenderActivity({
    label: "solar",
    active: renderReasons.length > 0,
    reasons: renderReasons,
    diagnostics: {
      visibleMoons: visibleMoons.length,
      performanceMode,
      asteroidMode,
      smallBodyCount: SMALL_BODIES.length,
      selectedSmallBody: selectedSmallBodyId,
      smallBodyEphemerisModel: selectedSmallBodyId ? SMALL_BODY_EPHEMERIS_MODEL.id : null,
      qualityTier: qualityProfile.id,
      starBudget: qualityProfile.starBudget,
      backgroundStarBudget: qualityProfile.backgroundStarBudget,
      sunSegments: qualityProfile.sunSegments,
      planetSegments: qualityProfile.planetSegments,
      moonSegments: qualityProfile.moonSegments,
      atmosphereSegments: qualityProfile.atmosphereSegments,
      atmosphereLutWidth: qualityProfile.atmosphereLutWidth,
      atmosphereLutHeight: qualityProfile.atmosphereLutHeight,
      atmosphereModel: selectedAtmospherePreset
        ? selectedAtmosphereProfile?.id ?? SOLAR_ATMOSPHERE_SCATTERING_MODEL.fallbackId
        : null,
      atmosphereProfileStatus: selectedAtmosphereProfile?.status ?? null,
      atmosphereLutPassCount: selectedAtmosphereProfile ? 1 : 0,
      planetOrbitSamples: qualityProfile.planetOrbitSamples,
      ephemerisStatus: ephemerisSnapshot.status,
      ephemerisModel: ephemerisSnapshot.positionsReady ? "vsop87c-streamed-float64" : "keplerian-boot",
      ephemerisYear: ephemerisSnapshot.activeYear,
      ephemerisLoadedYears: ephemerisSnapshot.loadedYears.join(",") || null,
      ephemerisTransferredBytes: ephemerisSnapshot.transferredBytes,
      ephemerisOrbitStatus: ephemerisSnapshot.orbitStatus,
      moonOrbitSamples: qualityProfile.moonOrbitSamples,
      satelliteEphemerisModel: selectedMoonState?.model ?? null,
      satelliteEphemerisControlled:
        selectedMoonState ? selectedMoonState.model !== "parent-relative-circular" : null,
      satelliteEphemerisVelocityAvailable: Boolean(selectedMoonState?.relativeVelocityAuPerDay),
      orbitTrailSamples: qualityProfile.orbitTrailSamples,
      asteroidBudget: qualityProfile.asteroidBudget,
      shadowMapSize: qualityProfile.shadowMapSize,
      eclipseShadows: qualityProfile.eclipseShadows,
      eclipseShadowModel: SOLAR_ECLIPSE_MODEL.id,
      eclipseCandidateCount: selectedEclipseOccluders.length,
      eclipseCandidateMoons: selectedEclipseOccluders.map((candidate) => candidate.moonId).join(",") || null,
      moonEclipseShadowModel: SOLAR_MOON_ECLIPSE_MODEL.id,
      moonEclipseCandidateCount: selectedMoonEclipseOccluders.length,
      moonEclipseOccluders:
        selectedMoonEclipseOccluders.map((candidate) => candidate.occluderId).join(",") || null,
      moonEclipseShadowPassCount:
        qualityProfile.eclipseShadows && selectedMoonId ? selectedMoonEclipseOccluders.length : 0,
      ringShadows: qualityProfile.ringShadows,
      ringShadowModel: SOLAR_RING_SHADOW_MODEL.id,
      ringSystem: selectedRingSystem?.id ?? null,
      ringShadowPassCount: qualityProfile.ringShadows && selectedRingSystem ? 1 : 0,
      starLod: starCatalog.chunks.length
        ? Math.min(starCatalog.progress.loadedRecords, qualityProfile.starBudget)
        : starLod.length,
      starCatalogChunks: starCatalog.progress.loadedChunks,
      scaleMode,
      orientationBody: selectedOrientation?.bodyId ?? null,
      orientationModel: selectedOrientation?.modelLabel ?? null,
      orientationPrimeMeridianDeg:
        selectedOrientation ? Number(selectedOrientation.primeMeridianDeg.toFixed(6)) : null,
      orientationSpinRateDegPerDay:
        selectedOrientation ? Number(selectedOrientation.nominalSpinRateDegPerDay.toFixed(7)) : null,
      orientationPoleRaDeg:
        selectedOrientation ? Number(selectedOrientation.pole.rightAscensionDeg.toFixed(6)) : null,
      orientationPoleDecDeg:
        selectedOrientation ? Number(selectedOrientation.pole.declinationDeg.toFixed(6)) : null,
      orientationPoleAngleDeg:
        selectedOrientation
          ? Number(selectedOrientation.pole.poleAngleToJ2000EclipticNorthDeg.toFixed(6))
          : null,
    },
  });

  const beginFocusFlight = useCallback(
    (flight: SolarFocusFlight, label: string, renderDurationMs: number, renderReason: string) => {
      zoomTargetRef.current = null;
      if (shouldReduceCameraFlightMotionInBrowser()) {
        focusRef.current = null;
        camera.position.copy(flight.endPos);
        if (controlsRef.current) {
          controlsRef.current.target.copy(flight.endTarget);
          controlsRef.current.update();
        }
        onCameraFlightChange(null);
        requestRender(240, `${renderReason}-reduced-motion`);
        return;
      }

      focusRef.current = {
        ...flight,
        durationSeconds: Math.max(0.85, renderDurationMs / 1000),
      };
      onCameraFlightChange(createCameraFlightState("solar", label));
      requestRender(renderDurationMs, renderReason);
    },
    [camera, onCameraFlightChange, requestRender],
  );

  const cancelFocusFlight = useCallback(
    (renderReason: string) => {
      const wasActive = focusRef.current !== null;
      focusRef.current = null;
      zoomTargetRef.current = null;
      if (wasActive) {
        onCameraFlightChange(null);
      }
      requestRender(240, renderReason);
    },
    [onCameraFlightChange, requestRender],
  );

  useEffect(() => {
    if (lastCancelFlightTokenRef.current === cancelFlightToken) return;
    lastCancelFlightTokenRef.current = cancelFlightToken;
    cancelFocusFlight("camera-flight-cancel");
  }, [cancelFlightToken, cancelFocusFlight]);

  useEffect(() => {
    if (!trackTargetId && !trackMoonId) return;
    cancelFocusFlight("camera-flight-tracking");
  }, [cancelFocusFlight, trackMoonId, trackTargetId]);

  useEffect(() => {
    if (!smoothZoomEnabled) return;
    const element = gl.domElement;
    const handleWheel = (event: WheelEvent) => {
      const controls = controlsRef.current;
      if (!controls) return;
      event.preventDefault();
      const currentRadius = camera.position.distanceTo(controls.target);
      const base = zoomTargetRef.current ?? currentRadius;
      const deltaScale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1;
      // Trackpad pinch arrives as ctrlKey wheel events and needs more gain.
      const sensitivity = event.ctrlKey ? 0.0045 : 0.0016;
      zoomTargetRef.current = MathUtils.clamp(
        base * Math.exp(event.deltaY * deltaScale * sensitivity),
        minCameraDistance,
        maxCameraDistanceRef.current,
      );
      requestRender(1200, "smooth-zoom");
    };
    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => element.removeEventListener("wheel", handleWheel);
  }, [camera, gl, requestRender, smoothZoomEnabled]);

  useEffect(() => {
    let active = true;
    loadSunTextures(textureQuality).then((textures) => {
      if (active) {
        setSunTextures(textures);
      }
    });
    return () => {
      active = false;
    };
  }, [textureQuality]);

  useEffect(() => {
    if (!focusTargetId || !controlsRef.current) {
      return;
    }
    const planet = PLANETS.find((item) => item.id === focusTargetId);
    if (!planet) return;

    const [x, y, z] = getPlanetScenePosition(planet, timeDaysRef.current, scaleMode);
    const target = new Vector3(x, y, z);
    const currentTarget = controlsRef.current.target.clone();
    const currentPos = camera.position.clone();
    const direction = getStablePlanetViewDirection(currentPos, currentTarget);
    const distance = getSolarPlanetFocusDistance(getRenderRadius(planet));
    const endPos = target.clone().add(direction.multiplyScalar(distance));

    beginFocusFlight(
      {
        startPos: currentPos,
        startTarget: currentTarget,
        endPos,
        endTarget: target,
        progress: 0,
      },
      `Flying to ${planet.name}`,
      1400,
      "planet-focus",
    );
  }, [beginFocusFlight, focusTargetId, focusToken, camera, scaleMode]);

  useEffect(() => {
    if (bookmarkTarget && controlsRef.current) {
      const currentTarget = controlsRef.current.target.clone();
      const currentPos = camera.position.clone();
      beginFocusFlight(
        {
          startPos: currentPos,
          startTarget: currentTarget,
          endPos: new Vector3(...bookmarkTarget.position),
          endTarget: new Vector3(...bookmarkTarget.target),
          progress: 0,
        },
        "Restoring saved Solar view",
        1400,
        "bookmark",
      );
    }
  }, [beginFocusFlight, bookmarkTarget, bookmarkToken, camera]);

  useEffect(() => {
    if (!controlsRef.current) return;
    const currentTarget = controlsRef.current.target.clone();
    const currentPos = camera.position.clone();
    let endTarget = new Vector3(0, 0, 0);
    let endPos = new Vector3(...scaleSceneProfile.overviewCamera);
    let flightLabel = `Changing to ${SOLAR_NAVIGATION_LABELS[navigationMode]}`;

    if (navigationMode === "ecliptic") {
      endTarget = new Vector3(0, 0, 0);
      endPos = new Vector3(...scaleSceneProfile.eclipticCamera);
    }

    if (navigationMode === "planetary") {
      const selectedMoon = selectedMoonId ? MOONS.find((moon) => moon.id === selectedMoonId) : null;
      const planet =
        selectedMoon
          ? PLANETS.find((item) => item.id === selectedMoon.parentPlanet)
          : selectedId
            ? PLANETS.find((item) => item.id === selectedId)
            : null;
      if (planet) {
        flightLabel = `Flying to ${selectedMoon?.name ?? planet.name}`;
        const parentEntry = planetPositionMapRef.current[planet.id];
        if (parentEntry) {
          endTarget = new Vector3(...parentEntry.position);
          const distance = getPlanetarySystemDistance(
            planet,
            parentEntry.position,
            parentEntry.radius,
            timeDaysRef.current,
            scaleMode,
            qualityProfile.moonOrbitSamples,
          );
          const stableDirection = getStablePlanetViewDirection(currentPos, currentTarget);
          endPos = endTarget.clone().add(stableDirection.multiplyScalar(distance));
        }
      }
      if (!planet && selectedSmallBodyId) {
        const body = SMALL_BODIES.find((candidate) => candidate.id === selectedSmallBodyId);
        const entry = smallBodyPositionMapRef.current[selectedSmallBodyId];
        if (body && entry) {
          flightLabel = `Flying to ${body.name}`;
          endTarget = new Vector3(...entry.position);
          const stableDirection = getStablePlanetViewDirection(currentPos, currentTarget);
          endPos = endTarget
            .clone()
            .add(stableDirection.multiplyScalar(Math.max(7, entry.radius * 8)));
        }
      }
    }

    beginFocusFlight(
      {
        startPos: currentPos,
        startTarget: currentTarget,
        endPos,
        endTarget,
        progress: 0,
      },
      flightLabel,
      1500,
      `navigation-${navigationMode}`,
    );
  }, [beginFocusFlight, camera, navigationMode, navigationToken, qualityProfile.moonOrbitSamples, scaleMode, scaleSceneProfile, selectedId, selectedMoonId, selectedSmallBodyId]);

  useEffect(() => {
    if (trackTargetId && controlsRef.current) {
      trackingOffsetRef.current = camera.position.clone().sub(controlsRef.current.target);
    } else {
      trackingOffsetRef.current = null;
    }
  }, [trackTargetId, camera]);

  useEffect(() => {
    if (trackMoonId && controlsRef.current) {
      trackingMoonOffsetRef.current = camera.position.clone().sub(controlsRef.current.target);
    } else {
      trackingMoonOffsetRef.current = null;
    }
  }, [trackMoonId, camera]);

  useEffect(() => {
    if (!controlsRef.current) return;
    if (sunSelected) {
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
      return;
    }
    if (selectedMoonId) {
      const moon = MOONS.find((item) => item.id === selectedMoonId);
      if (!moon) return;
      const parentEntry = planetPositionMap[moon.parentPlanet];
      if (!parentEntry) return;
      const moonPosition = getMoonScenePosition(
        moon,
        parentEntry.position,
        parentEntry.radius,
        timeDays,
        scaleMode,
      );
      if (!moonPosition) return;
      controlsRef.current.target.set(...moonPosition);
      controlsRef.current.update();
      return;
    }
    if (selectedSmallBodyId) {
      const entry = smallBodyPositionMap[selectedSmallBodyId];
      if (!entry) return;
      controlsRef.current.target.set(...entry.position);
      controlsRef.current.update();
      return;
    }
    if (selectedId) {
      const planet = PLANETS.find((item) => item.id === selectedId);
      if (!planet) return;
      const [x, y, z] = getPlanetScenePosition(planet, timeDays, scaleMode);
      controlsRef.current.target.set(x, y, z);
      controlsRef.current.update();
    }
  }, [selectedId, selectedMoonId, selectedSmallBodyId, sunSelected, timeDays, scaleMode, planetPositionMap, smallBodyPositionMap]);

  useEffect(() => {
    if (!focusSmallBodyId || !controlsRef.current) return;
    const body = SMALL_BODIES.find((candidate) => candidate.id === focusSmallBodyId);
    const entry = smallBodyPositionMapRef.current[focusSmallBodyId];
    if (!body || !entry) return;
    const target = new Vector3(...entry.position);
    const currentTarget = controlsRef.current.target.clone();
    const currentPos = camera.position.clone();
    const direction = getStablePlanetViewDirection(currentPos, currentTarget);
    const distance = Math.max(7, entry.radius * 8);
    beginFocusFlight(
      {
        startPos: currentPos,
        startTarget: currentTarget,
        endPos: target.clone().add(direction.multiplyScalar(distance)),
        endTarget: target,
        progress: 0,
      },
      `Flying to ${body.name}`,
      1350,
      "small-body-focus",
    );
  }, [beginFocusFlight, camera, focusSmallBodyId, focusSmallBodyToken]);

  useEffect(() => {
    if (!focusMoonId || !controlsRef.current) {
      return;
    }
    const moon = MOONS.find((item) => item.id === focusMoonId);
    if (!moon) return;
    const parentEntry = planetPositionMapRef.current[moon.parentPlanet];
    if (!parentEntry) return;
    const targetPosition = getMoonScenePosition(
      moon,
      parentEntry.position,
      parentEntry.radius,
      timeDaysRef.current,
      scaleMode,
    );
    if (!targetPosition) return;
    const target = new Vector3(...targetPosition);
    const currentTarget = controlsRef.current.target.clone();
    const currentPos = camera.position.clone();
    const direction = getStablePlanetViewDirection(currentPos, currentTarget);
    const distance = Math.max(5, currentPos.distanceTo(currentTarget) * 0.35);
    beginFocusFlight(
      {
        startPos: currentPos,
        startTarget: currentTarget,
        endPos: target.clone().add(direction.multiplyScalar(distance)),
        endTarget: target,
        progress: 0,
      },
      `Flying to ${moon.name}`,
      1200,
      "moon-focus",
    );
  }, [beginFocusFlight, focusMoonId, focusMoonToken, camera, scaleMode]);

  useEffect(() => {
    if (!focusSunToken || !controlsRef.current) {
      return;
    }
    const target = new Vector3(0, 0, 0);
    const currentTarget = controlsRef.current.target.clone();
    const currentPos = camera.position.clone();
    const direction = currentPos.clone().sub(currentTarget).normalize();
    const distance = Math.max(16, currentPos.distanceTo(currentTarget) * 0.6);
    beginFocusFlight(
      {
        startPos: currentPos,
        startTarget: currentTarget,
        endPos: target.clone().add(direction.multiplyScalar(distance)),
        endTarget: target,
        progress: 0,
      },
      "Flying to the Sun",
      1200,
      "sun-focus",
    );
  }, [beginFocusFlight, focusSunToken, camera]);

  useFrame((state, delta) => {
    if (sunTextures.noise && sunNoiseMatRef.current) {
      const textureDay = timeDaysRef.current;
      sunTextures.noise.offset.x = ((textureDay * 0.003) % 1 + 1) % 1;
      sunTextures.noise.offset.y = ((textureDay * 0.002) % 1 + 1) % 1;
    }

    if (sunCoreMatRef.current && sunOverlayMatRef.current && sunCoronaMatRef.current) {
      const distance = camera.position.length();
      const boost = MathUtils.clamp(1 - distance / 70, 0, 0.5);
      sunCoreMatRef.current.emissiveIntensity = 0.9 + boost * 0.4;
      sunOverlayMatRef.current.opacity = 0.1 + boost * 0.05;
      sunCoronaMatRef.current.opacity = 0.026 + boost * 0.026;
      if (sunNoiseMatRef.current) {
        sunNoiseMatRef.current.opacity = performanceMode ? 0.0 : 0.1 + boost * 0.05;
      }
    }

    const distance = camera.position.length();
    if (Math.abs(distance - starDistance) > 1.5) {
      setStarDistance(distance);
    }
    // Fade the local starfield in over the second half of the zoom range, but
    // never let the solar system itself disappear: the blend caps below the
    // hide threshold so zooming out always keeps the Sun and planets as an
    // anchor to zoom back into.
    const blendStart = maxCameraDistance * 0.55;
    const targetBlend = MathUtils.clamp((distance - blendStart) / (maxCameraDistance * 0.6), 0, 0.85);
    if (Math.abs(targetBlend - starBlendRef.current) > 0.02) {
      starBlendRef.current = targetBlend;
      setStarBlend(targetBlend);
    }

    if (focusRef.current && controlsRef.current) {
      const focus = focusRef.current;
      focus.progress = Math.min(1, focus.progress + delta / (focus.durationSeconds ?? 0.85));
      const eased = MathUtils.smoothstep(focus.progress, 0, 1);
      const nextPos = focus.startPos.clone().lerp(focus.endPos, eased);
      const nextTarget = focus.startTarget.clone().lerp(focus.endTarget, eased);
      camera.position.copy(nextPos);
      controlsRef.current.target.copy(nextTarget);
      controlsRef.current.update();
      if (focus.progress >= 1) {
        focusRef.current = null;
        onCameraFlightChange(null);
      }
    }

    if (trackTargetId && controlsRef.current && trackingOffsetRef.current) {
      const planet = PLANETS.find((item) => item.id === trackTargetId);
      if (planet) {
        const entry = planetPositionMap[planet.id];
        if (!entry) return;
        const target = new Vector3(...entry.position);
        controlsRef.current.target.lerp(target, 0.1);
        camera.position.lerp(target.clone().add(trackingOffsetRef.current), 0.1);
        controlsRef.current.update();
      }
    }

    if (trackMoonId && controlsRef.current && trackingMoonOffsetRef.current) {
      const moon = MOONS.find((item) => item.id === trackMoonId);
      if (moon) {
        const parentEntry = planetPositionMap[moon.parentPlanet];
        if (parentEntry) {
          const moonPosition = getMoonScenePosition(
            moon,
            parentEntry.position,
            parentEntry.radius,
            timeDays,
            scaleMode,
          );
          if (!moonPosition) return;
          const target = new Vector3(...moonPosition);
          controlsRef.current.target.lerp(target, 0.1);
          camera.position.lerp(target.clone().add(trackingMoonOffsetRef.current), 0.1);
          controlsRef.current.update();
        }
      }
    }

    if (smoothZoomEnabled && controlsRef.current) {
      if (focusRef.current || trackTargetId || trackMoonId) {
        // Focus flights and tracking own the camera; drop any pending zoom.
        zoomTargetRef.current = null;
      } else if (zoomTargetRef.current !== null) {
        const controls = controlsRef.current;
        const targetRadius = MathUtils.clamp(
          zoomTargetRef.current,
          minCameraDistance,
          maxCameraDistanceRef.current,
        );
        const currentRadius = camera.position.distanceTo(controls.target);
        const nextRadius = MathUtils.damp(currentRadius, targetRadius, 6.5, delta);
        const direction = camera.position.clone().sub(controls.target);
        if (direction.lengthSq() < 1e-8) {
          direction.set(0, 0.35, 1);
        }
        direction.normalize().multiplyScalar(nextRadius);
        camera.position.copy(controls.target).add(direction);
        controls.update();
        if (Math.abs(nextRadius - targetRadius) < 0.02) {
          zoomTargetRef.current = null;
        }
      }
    }

    if (controlsRef.current && state.clock.elapsedTime - lastCameraUpdate.current > 0.15) {
      lastCameraUpdate.current = state.clock.elapsedTime;
      onCameraState({
        position: [camera.position.x, camera.position.y, camera.position.z],
        target: [
          controlsRef.current.target.x,
          controlsRef.current.target.y,
          controlsRef.current.target.z,
        ],
      });
    }

    moonVisibilityRef.current += delta;
    if (moonVisibilityRef.current > 0.5) {
      const nextVisible = new Set<PlanetId>();
      const visibilityDistance = scaleSceneProfile.moonVisibilityDistance;
      planetPositions.forEach(({ planet, position }) => {
        if (selectedId === planet.id) {
          nextVisible.add(planet.id);
          return;
        }
        if (selectedMoonId) {
          const selectedMoon = MOONS.find((item) => item.id === selectedMoonId);
          if (selectedMoon && selectedMoon.parentPlanet === planet.id) {
            nextVisible.add(planet.id);
            return;
          }
        }
        const distance = camera.position.distanceTo(new Vector3(...position));
        if (distance < visibilityDistance) {
          nextVisible.add(planet.id);
        }
      });
      const changed =
        nextVisible.size !== visibleMoonParents.size ||
        [...nextVisible].some((id) => !visibleMoonParents.has(id));
      if (changed) {
        setVisibleMoonParents(nextVisible);
      }
      moonVisibilityRef.current = 0;
    }
  });

  // The blend caps at 0.85 (see the frame loop), so the solar system stays
  // mounted at every reachable zoom distance — the starfield fades in as
  // context instead of replacing the scene.
  const showSolar = starBlend < 0.9;

  return (
    <>
      <fog attach="fog" args={["#030711", scaleSceneProfile.fogNear, scaleSceneProfile.fogFar]} />
      <ambientLight intensity={0.2} />
      <hemisphereLight args={["#ffe7c7", "#0b111f", 0.22]} />
      <pointLight
        position={[0, 0, 0]}
        intensity={scaleSceneProfile.pointLightIntensity}
        distance={scaleSceneProfile.pointLightDistance}
        decay={scaleSceneProfile.pointLightDecay}
        color="#ffd2a1"
        castShadow={!performanceMode}
        shadow-mapSize={[qualityProfile.shadowMapSize, qualityProfile.shadowMapSize]}
        shadow-bias={-0.0002}
      />
      {starBlend < 0.4 ? (
        <Stars
          radius={Math.max(420, maxCameraDistance * 1.45)}
          depth={Math.max(140, maxCameraDistance * 0.42)}
          count={qualityProfile.backgroundStarBudget}
          factor={2.2}
          saturation={0.24}
          fade
        />
      ) : null}

      {starCatalog.chunks.length ? (
        <CatalogStarField
          chunks={starCatalog.chunks}
          opacity={starBlend}
          pointBudget={qualityProfile.starBudget}
          magnitudeLimitG={qualityProfile.starMagnitudeLimitG}
          performanceMode={performanceMode}
          surface="solar"
        />
      ) : (
        <StarField stars={starLod} opacity={starBlend} interactive={false} />
      )}

      {sunSelected && showSolar && (
        <mesh raycast={ignoreRaycast}>
          <sphereGeometry args={[5.2, Math.max(18, qualityProfile.sunSegments / 2), Math.max(18, qualityProfile.sunSegments / 2)]} />
          <meshBasicMaterial color="#7affd6" transparent opacity={0.2} />
        </mesh>
      )}
      {showSolar && (
        <group quaternion={sunBodyQuaternion}>
          <mesh
            onClick={(event) => {
              event.stopPropagation();
              onSelectSun(true);
            }}
            onDoubleClick={(event) => {
              event.stopPropagation();
              onSelectSun(true);
            }}
          >
            <sphereGeometry args={[4.2, qualityProfile.sunSegments, qualityProfile.sunSegments]} />
            <meshStandardMaterial
              ref={sunCoreMatRef}
              map={sunTextures.surface ?? undefined}
              emissiveMap={sunTextures.noise ?? sunTextures.surface ?? undefined}
              bumpMap={sunTextures.noise ?? undefined}
              bumpScale={0.6}
              emissive="#ffae47"
              emissiveIntensity={1.1}
              color={sunTextures.surface ? "#ffc88a" : "#ffb347"}
              roughness={0.5}
              metalness={0.05}
            />
          </mesh>
        </group>
      )}
      {showSolar && (
        <group quaternion={sunBodyQuaternion}>
          <mesh raycast={ignoreRaycast}>
            <sphereGeometry args={[4.35, qualityProfile.sunSegments, qualityProfile.sunSegments]} />
            <meshBasicMaterial
              ref={sunOverlayMatRef}
              map={sunTextures.surface ?? undefined}
              color="#ffb062"
              transparent
              opacity={0.12}
              blending={AdditiveBlending}
              depthWrite={false}
              depthTest={false}
              fog={false}
            />
          </mesh>
        </group>
      )}
      {!performanceMode && sunTextures.noise && showSolar && (
        <group quaternion={sunBodyQuaternion}>
          <mesh raycast={ignoreRaycast}>
            <sphereGeometry args={[4.5, qualityProfile.sunSegments, qualityProfile.sunSegments]} />
            <meshBasicMaterial
              ref={sunNoiseMatRef}
              map={sunTextures.noise}
              color="#ff8a2a"
              transparent
              opacity={0.12}
              blending={AdditiveBlending}
              depthWrite={false}
              depthTest={false}
              fog={false}
            />
          </mesh>
        </group>
      )}
      {showSolar && (
        <mesh raycast={ignoreRaycast}>
          <sphereGeometry args={[7.4, qualityProfile.sunSegments, qualityProfile.sunSegments]} />
          <meshBasicMaterial
            ref={sunCoronaMatRef}
            color="#ffb24f"
            transparent
            opacity={0.08}
            blending={AdditiveBlending}
            depthWrite={false}
            depthTest={false}
            fog={false}
          />
        </mesh>
      )}
      {showSolar && (
        <mesh raycast={ignoreRaycast}>
          <sphereGeometry args={[11, qualityProfile.sunSegments, qualityProfile.sunSegments]} />
          <meshBasicMaterial
            color="#ff9f3a"
            transparent
            opacity={0.012}
            blending={AdditiveBlending}
            depthWrite={false}
            depthTest={false}
            fog={false}
          />
        </mesh>
      )}
      {showSolar && (navigationMode !== "planetary" || sunSelected) ? (
        <Html
          position={[0, 6.8, 0]}
          center
          distanceFactor={150}
          style={{ pointerEvents: "none" }}
        >
          <div className={`solar-planet-label solar-planet-label--sun is-overview ${sunSelected ? "is-selected" : ""}`}>
            <strong>Sun</strong>
            <span>System origin</span>
          </div>
        </Html>
      ) : null}

      {showSolar &&
        PLANETS.map((planet) => (
          <OrbitRing
            key={`orbit-${planet.id}`}
            radius={orbitPathMap[planet.id]?.radius ?? 0}
            inclinationDeg={planet.inclinationDeg}
            highlighted={planet.id === selectedId}
            planetId={planet.id}
            points={orbitPathMap[planet.id]?.points}
            currentPosition={planetPositionMap[planet.id]?.position}
          />
        ))}

      {showSolar &&
        SMALL_BODIES.map((body) => {
          const selected = body.id === selectedSmallBodyId;
          if (body.kind === "comet" && !selected) return null;
          return (
            <OrbitRing
              key={`small-body-orbit-${body.id}`}
              radius={0}
              inclinationDeg={body.orbit.inclinationDeg}
              highlighted={selected}
              planetId={body.id}
              points={smallBodyOrbitPathMap[body.id]}
              currentPosition={smallBodyPositionMap[body.id]?.position}
            />
          );
        })}

      {showSolar &&
        visibleMoons.map((moon) => {
          const parentEntry = planetPositionMap[moon.parentPlanet];
          if (!parentEntry) return null;
          const shouldShowOrbit =
            selectedId === moon.parentPlanet || selectedMoonId === moon.id;
          if (!shouldShowOrbit) return null;
          const points = getMoonOrbitScenePoints(
            moon,
            parentEntry.position,
            parentEntry.radius,
            timeDays,
            scaleMode,
            qualityProfile.moonOrbitSamples,
          );
          const currentPosition = getMoonScenePosition(
            moon,
            parentEntry.position,
            parentEntry.radius,
            timeDays,
            scaleMode,
          );
          return (
            <OrbitRing
              key={`moon-orbit-${moon.id}`}
              radius={0}
              inclinationDeg={moon.inclinationDeg ?? 0}
              highlighted={selectedMoonId === moon.id}
              planetId="moon"
              points={points}
              currentPosition={currentPosition ?? undefined}
              variant="moon"
            />
          );
        })}

      {showSolar &&
        selectedId &&
        planetPositions
          .filter(({ planet }) => planet.id === selectedId)
          .map(({ planet }) => (
            <SelectedOrbitTrail
              key={`trail-${planet.id}`}
              planet={planet}
              timeDays={timeDays}
              scaleMode={scaleMode}
              samples={qualityProfile.orbitTrailSamples}
            />
          ))}

      {showSolar &&
        selectedId &&
        planetPositions
          .filter(({ planet }) => planet.id === selectedId)
          .map(({ planet, position }) => (
            <SelectedOrbitAnnotations
              key={`orbit-annotations-${planet.id}`}
              planet={planet}
              timeDays={timeDays}
              scaleMode={scaleMode}
              currentPosition={position}
              orbitPoints={orbitPathMap[planet.id]?.points ?? []}
            />
          ))}

      {showSolar &&
        planetPositions.map(({ planet, position, distanceAu }) => (
          <PlanetMesh
            key={planet.id}
            planet={planet}
            position={position}
            radius={getRenderRadius(planet)}
            distanceAu={distanceAu}
            selected={planet.id === selectedId}
            showOverviewLabel={navigationMode !== "planetary"}
            segments={qualityProfile.planetSegments}
            atmosphereSegments={qualityProfile.atmosphereSegments}
            atmosphereLutWidth={qualityProfile.atmosphereLutWidth}
            atmosphereLutHeight={qualityProfile.atmosphereLutHeight}
            textureQuality={textureQuality}
            nearThreshold={scaleSceneProfile.planetNearThreshold}
            timeDays={timeDays}
            eclipseOccluders={planet.id === selectedId ? selectedEclipseOccluders : []}
            eclipseShadowsEnabled={qualityProfile.eclipseShadows}
            ringShadowsEnabled={qualityProfile.ringShadows}
            onSelect={(item) => onSelectPlanet(item)}
            onFocus={(item) => onRequestFocus(item)}
          />
        ))}

      {showSolar &&
        smallBodyPositions.map(({ body, position, distanceAu }) => (
          <SmallBodyMesh
            key={body.id}
            body={body}
            position={position}
            distanceAu={distanceAu}
            radius={getSmallBodyRenderRadius(body)}
            selected={body.id === selectedSmallBodyId}
            segments={Math.max(18, Math.floor(qualityProfile.planetSegments * 0.7))}
            onSelect={onSelectSmallBody}
            onFocus={onRequestSmallBodyFocus}
          />
        ))}

      {showSolar &&
        visibleMoons.map((moon) => {
        const parentEntry = planetPositionMap[moon.parentPlanet];
        const parentPosition = parentEntry?.position;
        if (!parentPosition) return null;
        const moonPosition = getMoonScenePosition(
          moon,
          parentPosition,
          parentEntry.radius,
          timeDays,
          scaleMode,
        );
        if (!moonPosition) return null;
        return (
          <MoonMesh
            key={moon.id}
            moon={moon}
            position={moonPosition}
            timeDays={timeDays}
            textureQuality={textureQuality}
            selected={selectedMoonId === moon.id}
            segments={qualityProfile.moonSegments}
            eclipseOccluders={moon.id === selectedMoonId ? selectedMoonEclipseOccluders : []}
            eclipseShadowsEnabled={qualityProfile.eclipseShadows}
            onSelect={onSelectMoon}
            onFocus={(position) => {
              if (!controlsRef.current) return;
              const target = new Vector3(...position);
              const currentTarget = controlsRef.current.target.clone();
              const currentPos = camera.position.clone();
              const direction = getStablePlanetViewDirection(currentPos, currentTarget);
              const distance = Math.max(6, currentPos.distanceTo(currentTarget) * 0.35);
              beginFocusFlight(
                {
                  startPos: currentPos,
                  startTarget: currentTarget,
                  endPos: target.clone().add(direction.multiplyScalar(distance)),
                  endTarget: target,
                  progress: 0,
                },
                `Flying to ${moon.name}`,
                1200,
                "moon-focus-pointer",
              );
            }}
          />
        );
      })}

      {showSolar && asteroidMode !== "off" && (
        <AsteroidBelt
          key={`${asteroidMode}:${qualityProfile.asteroidBudget}`}
          timeDays={timeDays}
          scaleMode={scaleMode}
          mode={asteroidMode}
          textureQuality={textureQuality}
          asteroidBudget={qualityProfile.asteroidBudget}
        />
      )}

      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.1}
        rotateSpeed={0.6}
        enableZoom={!smoothZoomEnabled}
        zoomSpeed={0.9}
        panSpeed={0.6}
        minDistance={minCameraDistance}
        maxDistance={maxCameraDistance}
        onStart={() => cancelFocusFlight("orbit-controls")}
        onChange={() => requestRender(180, "orbit-controls-change")}
        onEnd={() => requestRender(360, "orbit-controls-end")}
      />
    </>
  );
};

const SolarScene: FC<SolarSceneProps> = ({
  performanceMode,
  qualityTier,
  adaptiveQualityEnabled,
  onAdaptiveQualityDrop,
  ...props
}) => {
  const qualityProfile = ASTRO_QUALITY_PROFILES[qualityTier];
  const initialCameraPosition = getSolarScaleSceneProfile(props.scaleMode).overviewCamera;
  return (
    <Canvas
      className="solar-canvas__element"
      camera={{ position: initialCameraPosition, fov: 46, near: 0.1, far: 8_000 }}
      dpr={qualityProfile.dpr}
      gl={{
        ...ASTRONOMICAL_WEBGL_OPTIONS,
        antialias: qualityProfile.antialias,
        powerPreference: performanceMode ? "low-power" : "high-performance",
      }}
      shadows={qualityProfile.shadows}
      frameloop="demand"
      onPointerMissed={() => {
        props.onSelectPlanet(null);
        props.onSelectSun(false);
      }}
    >
      <WebGLCanvasLifecycle label="solar" />
      <AdaptiveQualityMonitor
        enabled={adaptiveQualityEnabled}
        surface="solar"
        tier={qualityTier}
        onDegrade={onAdaptiveQualityDrop}
      />
      <SolarSceneContent
        performanceMode={performanceMode}
        qualityProfile={qualityProfile}
        {...props}
      />
    </Canvas>
  );
};

export default SolarScene;
