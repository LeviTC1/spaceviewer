import { FC, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import {
  AdditiveBlending,
  MathUtils,
  Texture,
  Vector3,
  type Mesh,
  type MeshBasicMaterial,
  type MeshStandardMaterial,
} from "three";
import PlanetMesh from "./PlanetMesh";
import OrbitRing from "./OrbitRing";
import { PLANETS, type PlanetDef, type PlanetId, type SolarScaleMode } from "./solarData";
import type { TextureQuality } from "./textures/textureCatalog";
import { loadSunTextures } from "./textures/loadSunTexture";
import { MOONS, type MoonVisibilityMode, type MoonDef } from "./moonData";
import MoonMesh from "./MoonMesh";
import { scaleDistanceAu, scaleRadiusKm } from "./solarScale";
import { getMoonWorldPosition } from "./moonMath";
import AsteroidBelt from "./asteroids/AsteroidBelt";
import type { AsteroidBeltMode } from "./asteroids/asteroidGenerator";
import { StarField } from "../starmap/starRenderer";
import { useNearbyStars } from "../starmap/useNearbyStars";
import { useStarLOD } from "../starmap/useStarLOD";

interface CameraState {
  position: [number, number, number];
  target: [number, number, number];
}

interface SolarSceneProps {
  timeDays: number;
  timeScale: number;
  scaleMode: SolarScaleMode;
  performanceMode: boolean;
  textureQuality: TextureQuality;
  moonMode: MoonVisibilityMode;
  moonVisibilityOverrides: Record<PlanetId, boolean>;
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

const getOrbitRadius = (planet: PlanetDef, scaleMode: SolarScaleMode) => {
  const base = scaleDistanceAu(planet.semiMajorAxisAU, scaleMode);
  if (planet.id === "mercury") {
    return Math.max(base, MIN_SUN_ORBIT);
  }
  return base;
};

const getPlanetPosition = (planet: PlanetDef, timeDays: number, scaleMode: SolarScaleMode) => {
  const angle = (timeDays / planet.orbitalPeriodDays) * Math.PI * 2 + (planet.initialOffsetRad ?? 0);
  const eccentricity = planet.eccentricity ?? 0;
  const radiusAu =
    planet.semiMajorAxisAU * ((1 - eccentricity * eccentricity) / (1 + eccentricity * Math.cos(angle)));
  let distance = scaleDistanceAu(radiusAu, scaleMode);
  if (planet.id === "mercury") {
    distance = Math.max(distance, MIN_SUN_ORBIT);
  }
  const x = Math.cos(angle) * distance;
  const z = Math.sin(angle) * distance;
  const position = new Vector3(x, 0, z);
  const visualTilt = planet.tiltDeg ?? MathUtils.clamp(planet.inclinationDeg, 1, 3);
  const tilt = MathUtils.degToRad(visualTilt);
  position.applyAxisAngle(new Vector3(1, 0, 0), tilt);
  return [position.x, position.y, position.z] as [number, number, number];
};

const SolarSceneContent: FC<Omit<SolarSceneProps, "performanceMode"> & { performanceMode: boolean }> = ({
  timeDays,
  timeScale,
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

  const planetPositions = useMemo(
    () =>
      PLANETS.map((planet) => ({
        planet,
        position: getPlanetPosition(planet, timeDays, scaleMode),
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

    const [x, y, z] = getPlanetPosition(planet, timeDays, scaleMode);
    const target = new Vector3(x, y, z);
    const currentTarget = controlsRef.current.target.clone();
    const currentPos = camera.position.clone();
    const direction = currentPos.clone().sub(currentTarget).normalize();
    const distance = Math.max(8, getOrbitRadius(planet, scaleMode) * 0.8);
    const endPos = target.clone().add(direction.multiplyScalar(distance));

    focusRef.current = {
      startPos: currentPos,
      startTarget: currentTarget,
      endPos,
      endTarget: target,
      progress: 0,
    };
  }, [focusTargetId, focusToken, camera, scaleMode, timeDays]);

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
    }
  }, [bookmarkTarget, bookmarkToken, camera]);

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
      const moonPosition = getMoonWorldPosition(
        moon,
        parentEntry.position,
        parentEntry.radius,
        timeDays,
        scaleMode,
      );
      controlsRef.current.target.set(...moonPosition);
      controlsRef.current.update();
      return;
    }
    if (selectedId) {
      const planet = PLANETS.find((item) => item.id === selectedId);
      if (!planet) return;
      const [x, y, z] = getPlanetPosition(planet, timeDays, scaleMode);
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
    const targetPosition = getMoonWorldPosition(
      moon,
      parentEntry.position,
      parentEntry.radius,
      timeDays,
      scaleMode,
    );
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
  }, [focusMoonId, focusMoonToken, camera, scaleMode, timeDays, planetPositionMap]);

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
  }, [focusSunToken, camera]);

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
        const [x, y, z] = getPlanetPosition(planet, timeDays, scaleMode);
        const target = new Vector3(x, y, z);
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
          const moonPosition = getMoonWorldPosition(
            moon,
            parentEntry.position,
            parentEntry.radius,
            timeDays,
            scaleMode,
          );
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
      <hemisphereLight skyColor="#ffe7c7" groundColor="#0b111f" intensity={0.28} />
      <pointLight
        position={[0, 0, 0]}
        intensity={3.4}
        distance={260}
        color="#ffd2a1"
        castShadow={!performanceMode}
        shadow-mapSize={[512, 512]}
        shadow-bias={-0.0002}
      />
      {!performanceMode && starBlend < 0.4 && <Stars radius={120} depth={50} count={2000} factor={3} fade />}

      <StarField stars={starLod} opacity={starBlend} interactive={false} />

      {sunSelected && showSolar && (
        <mesh pointerEvents="none">
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
        <mesh ref={sunOverlayRef} pointerEvents="none">
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
        <mesh pointerEvents="none">
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
        <mesh ref={sunCoronaRef} pointerEvents="none">
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
        <mesh pointerEvents="none">
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
            radius={getOrbitRadius(planet, scaleMode)}
            inclinationDeg={planet.tiltDeg ?? planet.inclinationDeg}
            highlighted={planet.id === selectedId}
            planetId={planet.id}
          />
        ))}

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
        return (
          <MoonMesh
            key={moon.id}
            moon={moon}
            parentPosition={parentPosition}
            parentRadius={parentEntry.radius}
            timeDays={timeDays}
            scaleMode={scaleMode}
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

      {showSolar && (
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
      dpr={performanceMode ? [1, 1.2] : [1, 2]}
      gl={{ antialias: !performanceMode }}
      shadows={!performanceMode}
      frameloop="always"
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
