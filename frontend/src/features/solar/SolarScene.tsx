import { FC, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import {
  AdditiveBlending,
  MathUtils,
  Texture,
  Vector3,
  type Intersection,
  type Mesh,
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
import { scaleDistanceAu, scaleMoonDistanceKm, scaleRadiusKm } from "./solarScale";
import AsteroidBelt from "./asteroids/AsteroidBelt";
import type { AsteroidBeltMode } from "./asteroids/asteroidGenerator";
import { StarField } from "../starmap/starRenderer";
import { useNearbyStars } from "../starmap/useNearbyStars";
import { useStarLOD } from "../starmap/useStarLOD";
import { useRenderActivity } from "../../lib/rendering/useRenderActivity";
import {
  getSolarObjectState,
  getSolarMoonOrbitScenePoints,
  getSolarPlanetOrbitScenePoints,
  projectSolarMoonStateToScenePosition,
  projectSolarStateToScenePosition,
  toSceneTuple,
} from "../../domain/solar";
import type { SolarNavigationMode } from "./solarNavigation";

interface CameraState {
  position: [number, number, number];
  target: [number, number, number];
}

interface SolarSceneProps {
  timeDays: number;
  timeScale: number;
  isPlaying: boolean;
  scaleMode: SolarScaleMode;
  performanceMode: boolean;
  textureQuality: TextureQuality;
  moonMode: MoonVisibilityMode;
  moonVisibilityOverrides: Partial<Record<PlanetId, boolean>>;
  asteroidMode: AsteroidBeltMode;
  selectedId: PlanetId | null;
  selectedMoonId: string | null;
  sunSelected: boolean;
  focusTargetId: PlanetId | null;
  focusToken: number;
  focusMoonId: string | null;
  focusMoonToken: number;
  focusSunToken: number;
  trackTargetId: PlanetId | null;
  trackMoonId: string | null;
  bookmarkTarget: CameraState | null;
  bookmarkToken: number;
  navigationMode: SolarNavigationMode;
  navigationToken: number;
  onSelectPlanet: (planet: PlanetDef | null) => void;
  onSelectMoon: (moon: MoonDef) => void;
  onSelectSun: (selected: boolean) => void;
  onRequestFocus: (planet: PlanetDef) => void;
  onCameraState: (state: CameraState) => void;
  onPerformanceDrop?: () => void;
}

const getRenderRadius = (planet: PlanetDef) => {
  const baseRadius = scaleRadiusKm(planet.radiusKm);
  if (planet.id === "jupiter") return baseRadius * 1.12;
  if (planet.id === "saturn") return baseRadius * 1.06;
  return baseRadius;
};

const MIN_SUN_ORBIT = 9.6;
const ignoreRaycast = (_raycaster: Raycaster, _intersects: Intersection<Object3D>[]) => undefined;

const getPlanetMinSceneDistance = (planet: PlanetDef) => (planet.id === "mercury" ? MIN_SUN_ORBIT : 0);

const getPlanetScenePosition = (planet: PlanetDef, timeDays: number, scaleMode: SolarScaleMode) => {
  const state = getSolarObjectState(planet.id, timeDays);
  if (!state) return [0, 0, 0] as [number, number, number];
  return toSceneTuple(
    projectSolarStateToScenePosition(state, {
      scaleDistanceAu: (au) => scaleDistanceAu(au, scaleMode),
      minSceneDistance: getPlanetMinSceneDistance(planet),
    }),
  );
};

const getPlanetOrbitScenePoints = (planet: PlanetDef, scaleMode: SolarScaleMode) =>
  getSolarPlanetOrbitScenePoints(planet.id, {
    scaleDistanceAu: (au) => scaleDistanceAu(au, scaleMode),
    minSceneDistance: getPlanetMinSceneDistance(planet),
    samples: 192,
  }).map(toSceneTuple);

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
  scaleMode: SolarScaleMode,
) =>
  getSolarMoonOrbitScenePoints(moon.id, {
    parentScenePosition: parentPosition,
    parentRadiusSceneUnits: parentRadius,
    scaleMoonDistanceKm: (km) => scaleMoonDistanceKm(km, scaleMode),
    samples: 96,
  }).map(toSceneTuple);

const getPlanetarySystemDistance = (
  planet: PlanetDef,
  parentPosition: [number, number, number],
  parentRadius: number,
  scaleMode: SolarScaleMode,
) => {
  const moonDistances = MOONS.filter((moon) => moon.parentPlanet === planet.id && moon.class === "major")
    .map((moon) => getMoonOrbitScenePoints(moon, parentPosition, parentRadius, scaleMode))
    .flat()
    .map((point) =>
      Math.hypot(point[0] - parentPosition[0], point[1] - parentPosition[1], point[2] - parentPosition[2]),
    );
  const outerMoonDistance = moonDistances.length ? Math.max(...moonDistances) : 0;
  return Math.max(parentRadius * 8, outerMoonDistance * 1.35, 8);
};

const SolarSceneContent: FC<Omit<SolarSceneProps, "performanceMode"> & { performanceMode: boolean }> = ({
  timeDays,
  timeScale,
  isPlaying,
  scaleMode,
  performanceMode,
  textureQuality,
  moonMode,
  moonVisibilityOverrides,
  asteroidMode,
  selectedId,
  selectedMoonId,
  sunSelected,
  focusTargetId,
  focusToken,
  focusMoonId,
  focusMoonToken,
  focusSunToken,
  trackTargetId,
  trackMoonId,
  bookmarkTarget,
  bookmarkToken,
  navigationMode,
  navigationToken,
  onSelectPlanet,
  onSelectMoon,
  onSelectSun,
  onRequestFocus,
  onCameraState,
  onPerformanceDrop,
}) => {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const focusRef = useRef<{
    startPos: Vector3;
    startTarget: Vector3;
    endPos: Vector3;
    endTarget: Vector3;
    progress: number;
  } | null>(null);
  const trackingOffsetRef = useRef<Vector3 | null>(null);
  const trackingMoonOffsetRef = useRef<Vector3 | null>(null);
  const lastCameraUpdate = useRef(0);
  const perfSampleRef = useRef({ elapsed: 0, frames: 0, triggered: false });
  const moonVisibilityRef = useRef(0);
  const sunCoreRef = useRef<Mesh | null>(null);
  const sunOverlayRef = useRef<Mesh | null>(null);
  const sunCoronaRef = useRef<Mesh | null>(null);
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
  const { camera } = useThree();
  const [visibleMoonParents, setVisibleMoonParents] = useState<Set<PlanetId>>(() => new Set());
  const stars = useNearbyStars();
  const starLod = useStarLOD(stars, starDistance);

  const orbitPathMap = useMemo(() => {
    const entries: Partial<Record<PlanetId, { points: Array<[number, number, number]>; radius: number }>> = {};
    PLANETS.forEach((planet) => {
      const points = getPlanetOrbitScenePoints(planet, scaleMode);
      const radius = points.reduce((max, point) => Math.max(max, Math.hypot(point[0], point[1], point[2])), 0);
      entries[planet.id] = { points, radius };
    });
    return entries as Record<PlanetId, { points: Array<[number, number, number]>; radius: number }>;
  }, [scaleMode]);

  const planetPositions = useMemo(
    () =>
      PLANETS.map((planet) => ({
        planet,
        position: getPlanetScenePosition(planet, timeDays, scaleMode),
      })),
    [timeDays, scaleMode],
  );

  const planetPositionMap = useMemo(() => {
    const entries: Record<string, { position: [number, number, number]; radius: number }> = {};
    planetPositions.forEach(({ planet, position }) => {
      entries[planet.id] = { position, radius: getRenderRadius(planet) };
    });
    return entries;
  }, [planetPositions]);

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
  const { requestRender } = useRenderActivity({
    label: "solar",
    active: renderReasons.length > 0,
    reasons: renderReasons,
    diagnostics: {
      visibleMoons: visibleMoons.length,
      performanceMode,
      asteroidMode,
      starLod: starLod.length,
    },
  });

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

    const [x, y, z] = getPlanetScenePosition(planet, timeDays, scaleMode);
    const target = new Vector3(x, y, z);
    const currentTarget = controlsRef.current.target.clone();
    const currentPos = camera.position.clone();
    const direction = currentPos.clone().sub(currentTarget).normalize();
    const distance = Math.max(8, (orbitPathMap[planet.id]?.radius ?? 0) * 0.8);
    const endPos = target.clone().add(direction.multiplyScalar(distance));

    focusRef.current = {
      startPos: currentPos,
      startTarget: currentTarget,
      endPos,
      endTarget: target,
      progress: 0,
    };
    requestRender(1400, "planet-focus");
  }, [focusTargetId, focusToken, camera, scaleMode, timeDays, orbitPathMap, requestRender]);

  useEffect(() => {
    if (bookmarkTarget && controlsRef.current) {
      const currentTarget = controlsRef.current.target.clone();
      const currentPos = camera.position.clone();
      focusRef.current = {
        startPos: currentPos,
        startTarget: currentTarget,
        endPos: new Vector3(...bookmarkTarget.position),
        endTarget: new Vector3(...bookmarkTarget.target),
        progress: 0,
      };
      requestRender(1400, "bookmark");
    }
  }, [bookmarkTarget, bookmarkToken, camera, requestRender]);

  useEffect(() => {
    if (!controlsRef.current) return;
    const currentTarget = controlsRef.current.target.clone();
    const currentPos = camera.position.clone();
    let endTarget = new Vector3(0, 0, 0);
    let endPos = new Vector3(0, scaleMode === "educational" ? 96 : 76, scaleMode === "educational" ? 108 : 84);

    if (navigationMode === "ecliptic") {
      endTarget = new Vector3(0, 0, 0);
      endPos = new Vector3(0, scaleMode === "educational" ? 150 : 112, 0.01);
    }

    if (navigationMode === "planetary") {
      const planet =
        selectedMoonId
          ? PLANETS.find((item) => item.id === MOONS.find((moon) => moon.id === selectedMoonId)?.parentPlanet)
          : selectedId
            ? PLANETS.find((item) => item.id === selectedId)
            : null;
      if (planet) {
        const parentEntry = planetPositionMap[planet.id];
        if (parentEntry) {
          endTarget = new Vector3(...parentEntry.position);
          const distance = getPlanetarySystemDistance(
            planet,
            parentEntry.position,
            parentEntry.radius,
            scaleMode,
          );
          const direction = currentPos.clone().sub(currentTarget).normalize();
          const stableDirection = direction.lengthSq() > 0.001 ? direction : new Vector3(0.35, 0.45, 0.82).normalize();
          endPos = endTarget.clone().add(stableDirection.multiplyScalar(distance));
        }
      }
    }

    focusRef.current = {
      startPos: currentPos,
      startTarget: currentTarget,
      endPos,
      endTarget,
      progress: 0,
    };
    requestRender(1500, `navigation-${navigationMode}`);
  }, [navigationMode, navigationToken, camera, scaleMode, selectedId, selectedMoonId, planetPositionMap, requestRender]);

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
    if (selectedId) {
      const planet = PLANETS.find((item) => item.id === selectedId);
      if (!planet) return;
      const [x, y, z] = getPlanetScenePosition(planet, timeDays, scaleMode);
      controlsRef.current.target.set(x, y, z);
      controlsRef.current.update();
    }
  }, [selectedId, selectedMoonId, sunSelected, timeDays, scaleMode, planetPositionMap]);

  useEffect(() => {
    if (!focusMoonId || !controlsRef.current) {
      return;
    }
    const moon = MOONS.find((item) => item.id === focusMoonId);
    if (!moon) return;
    const parentEntry = planetPositionMap[moon.parentPlanet];
    if (!parentEntry) return;
    const targetPosition = getMoonScenePosition(
      moon,
      parentEntry.position,
      parentEntry.radius,
      timeDays,
      scaleMode,
    );
    if (!targetPosition) return;
    const target = new Vector3(...targetPosition);
    const currentTarget = controlsRef.current.target.clone();
    const currentPos = camera.position.clone();
    const direction = currentPos.clone().sub(currentTarget).normalize();
    const distance = Math.max(5, currentPos.distanceTo(currentTarget) * 0.35);
      focusRef.current = {
      startPos: currentPos,
      startTarget: currentTarget,
      endPos: target.clone().add(direction.multiplyScalar(distance)),
      endTarget: target,
      progress: 0,
    };
    requestRender(1200, "moon-focus");
  }, [focusMoonId, focusMoonToken, camera, scaleMode, timeDays, planetPositionMap, requestRender]);

  useEffect(() => {
    if (!focusSunToken || !controlsRef.current) {
      return;
    }
    const target = new Vector3(0, 0, 0);
    const currentTarget = controlsRef.current.target.clone();
    const currentPos = camera.position.clone();
    const direction = currentPos.clone().sub(currentTarget).normalize();
    const distance = Math.max(16, currentPos.distanceTo(currentTarget) * 0.6);
    focusRef.current = {
      startPos: currentPos,
      startTarget: currentTarget,
      endPos: target.clone().add(direction.multiplyScalar(distance)),
      endTarget: target,
      progress: 0,
    };
    requestRender(1200, "sun-focus");
  }, [focusSunToken, camera, requestRender]);

  useFrame((state, delta) => {
    const sunRotationScale = 260;
    const sunRotationPeriodHours = 25 * 24;
    const sunRotationSpeed =
      (Math.PI * 2 * sunRotationScale) / (sunRotationPeriodHours * 3600);
    if (sunCoreRef.current) {
      sunCoreRef.current.rotation.y += sunRotationSpeed * delta;
    }
    if (sunOverlayRef.current) {
      sunOverlayRef.current.rotation.y += sunRotationSpeed * 1.25 * delta;
    }
    if (sunCoronaRef.current) {
      sunCoronaRef.current.rotation.y += sunRotationSpeed * 0.25 * delta;
    }
    if (sunTextures.noise && sunNoiseMatRef.current) {
      sunTextures.noise.offset.x += delta * 0.015;
      sunTextures.noise.offset.y += delta * 0.01;
      sunTextures.noise.needsUpdate = true;
    }

    if (sunCoreMatRef.current && sunOverlayMatRef.current && sunCoronaMatRef.current) {
      const distance = camera.position.length();
      const boost = MathUtils.clamp(1 - distance / 70, 0, 0.5);
      sunCoreMatRef.current.emissiveIntensity = 0.9 + boost * 0.4;
      sunOverlayMatRef.current.opacity = 0.12 + boost * 0.06;
      sunCoronaMatRef.current.opacity = 0.05 + boost * 0.04;
      if (sunNoiseMatRef.current) {
        sunNoiseMatRef.current.opacity = performanceMode ? 0.0 : 0.12 + boost * 0.06;
      }
    }

    const distance = camera.position.length();
    if (Math.abs(distance - starDistance) > 1.5) {
      setStarDistance(distance);
    }
    const targetBlend = MathUtils.clamp((distance - 80) / 50, 0, 1);
    if (Math.abs(targetBlend - starBlendRef.current) > 0.02) {
      starBlendRef.current = targetBlend;
      setStarBlend(targetBlend);
    }

    if (focusRef.current && controlsRef.current) {
      const focus = focusRef.current;
      focus.progress = Math.min(1, focus.progress + delta * 1.6);
      const eased = MathUtils.smoothstep(focus.progress, 0, 1);
      const nextPos = focus.startPos.clone().lerp(focus.endPos, eased);
      const nextTarget = focus.startTarget.clone().lerp(focus.endTarget, eased);
      camera.position.copy(nextPos);
      controlsRef.current.target.copy(nextTarget);
      controlsRef.current.update();
      if (focus.progress >= 1) {
        focusRef.current = null;
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

    if (!performanceMode && onPerformanceDrop && !perfSampleRef.current.triggered) {
      perfSampleRef.current.elapsed += delta;
      perfSampleRef.current.frames += 1;
      if (perfSampleRef.current.elapsed >= 2.5) {
        const fps = perfSampleRef.current.frames / perfSampleRef.current.elapsed;
        if (fps < 34) {
          perfSampleRef.current.triggered = true;
          onPerformanceDrop();
        } else {
          perfSampleRef.current.elapsed = 0;
          perfSampleRef.current.frames = 0;
        }
      }
    }

    moonVisibilityRef.current += delta;
    if (moonVisibilityRef.current > 0.5) {
      const nextVisible = new Set<PlanetId>();
      const visibilityDistance = scaleMode === "educational" ? 65 : 45;
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

  const showSolar = starBlend < 0.75;

  return (
    <>
      <ambientLight intensity={0.32} />
      <hemisphereLight args={["#ffe7c7", "#0b111f", 0.28]} />
      <pointLight
        position={[0, 0, 0]}
        intensity={3.4}
        distance={260}
        color="#ffd2a1"
        castShadow={!performanceMode}
        shadow-mapSize={[512, 512]}
        shadow-bias={-0.0002}
      />
      {!performanceMode && starBlend < 0.4 && <Stars radius={120} depth={50} count={1200} factor={3} fade />}

      <StarField stars={starLod} opacity={starBlend} interactive={false} />

      {sunSelected && showSolar && (
        <mesh raycast={ignoreRaycast}>
          <sphereGeometry args={[7.4, 32, 32]} />
          <meshBasicMaterial color="#7affd6" transparent opacity={0.2} />
        </mesh>
      )}
      {showSolar && (
        <mesh
          ref={sunCoreRef}
          onClick={(event) => {
            event.stopPropagation();
            onSelectSun(true);
          }}
          onDoubleClick={(event) => {
            event.stopPropagation();
            onSelectSun(true);
          }}
        >
          <sphereGeometry args={[6.2, 64, 64]} />
          <meshStandardMaterial
            ref={sunCoreMatRef}
            map={sunTextures.surface ?? undefined}
            emissiveMap={sunTextures.noise ?? sunTextures.surface ?? undefined}
            bumpMap={sunTextures.noise ?? undefined}
            bumpScale={0.6}
            emissive="#ffae47"
            emissiveIntensity={0.9}
            color={sunTextures.surface ? "#ffc88a" : "#ffb347"}
            roughness={0.5}
            metalness={0.05}
          />
        </mesh>
      )}
      {showSolar && (
        <mesh ref={sunOverlayRef} raycast={ignoreRaycast}>
          <sphereGeometry args={[6.4, 64, 64]} />
          <meshBasicMaterial
            ref={sunOverlayMatRef}
            map={sunTextures.surface ?? undefined}
            color="#ffb062"
            transparent
            opacity={0.12}
            blending={AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      )}
      {!performanceMode && sunTextures.noise && showSolar && (
        <mesh raycast={ignoreRaycast}>
          <sphereGeometry args={[6.55, 64, 64]} />
          <meshBasicMaterial
            ref={sunNoiseMatRef}
            map={sunTextures.noise}
            color="#ff8a2a"
            transparent
            opacity={0.12}
            blending={AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      )}
      {showSolar && (
        <mesh ref={sunCoronaRef} raycast={ignoreRaycast}>
          <sphereGeometry args={[9.2, 48, 48]} />
          <meshBasicMaterial
            ref={sunCoronaMatRef}
            color="#ffb24f"
            transparent
            opacity={0.05}
            blending={AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      )}
      {showSolar && (
        <mesh raycast={ignoreRaycast}>
          <sphereGeometry args={[10.8, 48, 48]} />
          <meshBasicMaterial
            color="#ff9f3a"
            transparent
            opacity={0.03}
            blending={AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      )}

      {showSolar &&
        PLANETS.map((planet) => (
          <OrbitRing
            key={`orbit-${planet.id}`}
            radius={orbitPathMap[planet.id]?.radius ?? 0}
            inclinationDeg={planet.tiltDeg ?? planet.inclinationDeg}
            highlighted={planet.id === selectedId}
            planetId={planet.id}
            points={orbitPathMap[planet.id]?.points}
            currentPosition={planetPositionMap[planet.id]?.position}
          />
        ))}

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
            scaleMode,
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
        planetPositions.map(({ planet, position }) => (
          <PlanetMesh
            key={planet.id}
            planet={planet}
            position={position}
            radius={getRenderRadius(planet)}
            selected={planet.id === selectedId}
            textureQuality={textureQuality}
            nearThreshold={scaleMode === "educational" ? 70 : 55}
            timeScale={timeScale}
            onSelect={(item) => onSelectPlanet(item)}
            onFocus={(item) => onRequestFocus(item)}
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
            textureQuality={textureQuality}
            selected={selectedMoonId === moon.id}
            onSelect={onSelectMoon}
            onFocus={(position) => {
              if (!controlsRef.current) return;
              const target = new Vector3(...position);
              const currentTarget = controlsRef.current.target.clone();
              const currentPos = camera.position.clone();
              const direction = currentPos.clone().sub(currentTarget).normalize();
              const distance = Math.max(6, currentPos.distanceTo(currentTarget) * 0.35);
              focusRef.current = {
                startPos: currentPos,
                startTarget: currentTarget,
                endPos: target.clone().add(direction.multiplyScalar(distance)),
                endTarget: target,
                progress: 0,
              };
            }}
          />
        );
      })}

      {showSolar && asteroidMode !== "off" && (
        <AsteroidBelt
          timeDays={timeDays}
          scaleMode={scaleMode}
          mode={asteroidMode}
          textureQuality={textureQuality}
          performanceMode={performanceMode}
        />
      )}

      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.6}
        zoomSpeed={0.8}
        panSpeed={0.6}
        minDistance={6}
        maxDistance={scaleMode === "educational" ? 260 : 180}
        onStart={() => requestRender(1800, "orbit-controls")}
        onChange={() => requestRender(180, "orbit-controls-change")}
        onEnd={() => requestRender(360, "orbit-controls-end")}
      />
    </>
  );
};

const SolarScene: FC<SolarSceneProps> = ({
  performanceMode,
  ...props
}) => {
  return (
    <Canvas
      className="solar-canvas__element"
      camera={{ position: [0, 20, 40], fov: 50 }}
      dpr={performanceMode ? [1, 1] : [1, 1.75]}
      gl={{ antialias: !performanceMode }}
      shadows={!performanceMode}
      frameloop="demand"
      onPointerMissed={() => {
        props.onSelectPlanet(null);
        props.onSelectSun(false);
      }}
    >
      <SolarSceneContent performanceMode={performanceMode} {...props} />
    </Canvas>
  );
};

export default SolarScene;
