import { FC, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { AdditiveBlending, Color, MathUtils, Vector3, type MeshBasicMaterial, type Group } from "three";
import { StarField, getStarBrightness, getStarColor, getStarRenderPosition } from "./starRenderer";
import type { NearbyStar } from "../../data/nearbyStars";
import { useStarLOD } from "./useStarLOD";
import { useNearbyStars } from "./useNearbyStars";

interface StarMapSceneProps {
  onBackToSkyMap?: () => void;
}

const MAJOR_STAR_LABELS = new Set([
  "Sun",
  "Alpha Centauri A",
  "Sirius A",
  "Procyon",
]);

const StarFocus: FC<{ star: NearbyStar | null; performanceMode: boolean }> = ({ star, performanceMode }) => {
  const groupRef = useRef<Group | null>(null);
  const coreMatRef = useRef<MeshBasicMaterial | null>(null);
  const innerMatRef = useRef<MeshBasicMaterial | null>(null);
  const outerMatRef = useRef<MeshBasicMaterial | null>(null);
  const warmA = useMemo(() => new Color("#f8e8bf"), []);
  const warmB = useMemo(() => new Color("#ffcf8a"), []);
  const isSun = star?.name === "Sun";

  useFrame((state) => {
    if (!star) return;
    const pulse = 1 + Math.sin(state.clock.elapsedTime * (isSun ? 0.95 : 1.3)) * 0.03;
    const chromaDrift = (Math.sin(state.clock.elapsedTime * 0.7) + 1) * 0.5;
    const noiseJitter = performanceMode ? 0 : Math.sin(state.clock.elapsedTime * 1.7) * 0.01;
    if (coreMatRef.current) {
      const baseCore = isSun ? warmA.clone().lerp(warmB, chromaDrift * 0.45) : getStarColor(star.spectralType, star.temperature);
      coreMatRef.current.color.copy(baseCore.lerp(new Color("#ffffff"), 0.25));
    }
    if (innerMatRef.current) {
      innerMatRef.current.opacity = (isSun ? 0.24 : 0.16) * pulse + noiseJitter;
    }
    if (outerMatRef.current) {
      outerMatRef.current.opacity = (isSun ? 0.11 : 0.08) * pulse + noiseJitter * 0.5;
    }
    if (groupRef.current) {
      groupRef.current.scale.setScalar(1 + noiseJitter);
    }
  });

  if (!star) return null;
  const [x, y, z] = getStarRenderPosition(star);
  const tint = isSun ? new Color("#ffd39a") : getStarColor(star.spectralType, star.temperature);
  const brightness = getStarBrightness(star);
  const coreScale = MathUtils.clamp((isSun ? 0.52 : 0.34) + brightness * (isSun ? 0.24 : 0.12), 0.3, 0.85);
  const innerScale = MathUtils.clamp(coreScale * (isSun ? 2.1 : 1.85), 0.6, 1.7);
  const outerScale = MathUtils.clamp(coreScale * (isSun ? 3.25 : 2.8), 0.9, 2.5);

  return (
    <group ref={groupRef} position={[x, y, z]}>
      <mesh scale={[coreScale, coreScale, coreScale]}>
        <sphereGeometry args={[1, 24, 24]} />
        <meshBasicMaterial
          ref={coreMatRef}
          color={isSun ? "#fff6de" : "#fffaf6"}
          toneMapped={false}
        />
      </mesh>
      <mesh scale={[innerScale, innerScale, innerScale]}>
        <sphereGeometry args={[1, 20, 20]} />
        <meshBasicMaterial
          ref={innerMatRef}
          color={tint}
          transparent
          opacity={isSun ? 0.24 : 0.16}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh scale={[outerScale, outerScale, outerScale]}>
        <sphereGeometry args={[1, 18, 18]} />
        <meshBasicMaterial
          ref={outerMatRef}
          color={tint}
          transparent
          opacity={isSun ? 0.11 : 0.08}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
};

const getLabelOffset = (name: string) => {
  let seed = 0;
  for (let i = 0; i < name.length; i += 1) {
    seed = (seed * 131 + name.charCodeAt(i)) % 10000;
  }
  const angle = (seed / 10000) * Math.PI * 2;
  const radius = 0.7 + ((seed % 2000) / 2000) * 0.55;
  return [Math.cos(angle) * radius, Math.sin(angle) * (radius * 0.55), 0] as [number, number, number];
};

const StarLabels: FC<{
  stars: NearbyStar[];
  cameraDistance: number;
  hoveredStarName: string | null;
  selectedStarName: string | null;
  performanceMode: boolean;
}> = ({ stars, cameraDistance, hoveredStarName, selectedStarName, performanceMode }) => {
  const zoomOpacity = MathUtils.clamp(1 - (cameraDistance - 22) / 30, 0, 1);
  if (zoomOpacity <= 0 && !hoveredStarName) return null;
  const overlapThreshold = MathUtils.lerp(0.55, 1.45, MathUtils.clamp((cameraDistance - 8) / 72, 0, 1));
  const overlapThresholdSq = overlapThreshold * overlapThreshold;
  const maxLabels = performanceMode ? 8 : 15;
  const ranked = [...stars].sort((a, b) => {
    const aHovered = a.name === hoveredStarName ? 1 : 0;
    const bHovered = b.name === hoveredStarName ? 1 : 0;
    const aSelected = a.name === selectedStarName ? 1 : 0;
    const bSelected = b.name === selectedStarName ? 1 : 0;
    const aMajor = MAJOR_STAR_LABELS.has(a.name) ? 1 : 0;
    const bMajor = MAJOR_STAR_LABELS.has(b.name) ? 1 : 0;
    const aWeight = aHovered * 100 + aSelected * 60 + aMajor * 20 + getStarBrightness(a) * 10;
    const bWeight = bHovered * 100 + bSelected * 60 + bMajor * 20 + getStarBrightness(b) * 10;
    return bWeight - aWeight;
  });
  const accepted: NearbyStar[] = [];
  const acceptedPositions: [number, number, number][] = [];
  ranked.forEach((star) => {
    if (accepted.length >= maxLabels) return;
    const [x, y, z] = getStarRenderPosition(star);
    const [ox, oy, oz] = getLabelOffset(star.name);
    const candidate: [number, number, number] = [x + ox, y + oy, z + oz];
    const isOverlapping = acceptedPositions.some(([px, py, pz]) => {
      const dx = candidate[0] - px;
      const dy = candidate[1] - py;
      const dz = candidate[2] - pz;
      return dx * dx + dy * dy + dz * dz < overlapThresholdSq;
    });
    if (!isOverlapping) {
      accepted.push(star);
      acceptedPositions.push(candidate);
    }
  });

  return (
    <group>
      {accepted.map((star) => {
        const [x, y, z] = getStarRenderPosition(star);
        const [ox, oy, oz] = getLabelOffset(star.name);
        const isHovered = star.name === hoveredStarName;
        const isSelected = star.name === selectedStarName;
        const emphasis = isHovered ? 1 : isSelected ? 0.85 : MAJOR_STAR_LABELS.has(star.name) ? 0.64 : 0.42;
        const opacity = MathUtils.clamp(zoomOpacity * emphasis + (isHovered ? 0.42 : 0), 0, 1);
        const scale = MathUtils.clamp(1.14 - (cameraDistance - 10) / 70 + (isHovered ? 0.11 : 0), 0.7, 1.2);
        if (opacity <= 0.02) return null;
        return (
          <Html key={star.name} position={[x + ox, y + oy, z + oz]}>
            <div className="starmap-label" style={{ opacity, transform: `scale(${scale})` }}>
              {star.name}
            </div>
          </Html>
        );
      })}
    </group>
  );
};

const StarMapContent: FC<{
  stars: NearbyStar[];
  onSelectStar: (star: NearbyStar) => void;
  onHoverStar: (star: NearbyStar | null) => void;
  setCameraDistance: (distance: number) => void;
  focusStar: NearbyStar | null;
  selectedStar: NearbyStar | null;
  hoveredStar: NearbyStar | null;
  performanceMode: boolean;
  debugStarDots: boolean;
}> = ({
  stars,
  onSelectStar,
  onHoverStar,
  setCameraDistance,
  focusStar,
  selectedStar,
  hoveredStar,
  performanceMode,
  debugStarDots,
}) => {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const { camera } = useThree();
  const [distance, setDistance] = useState(60);
  const focusRef = useRef<{
    startPos: Vector3;
    startTarget: Vector3;
    endPos: Vector3;
    endTarget: Vector3;
    progress: number;
  } | null>(null);
  const starLod = useStarLOD(stars, distance);
  const filteredStars = useMemo(() => {
    if (!performanceMode) return starLod;
    const sorted = [...starLod].sort((a, b) => getStarBrightness(b) - getStarBrightness(a));
    const limit = Math.min(60, sorted.length);
    const trimmed = sorted.slice(0, limit);
    if (selectedStar && !trimmed.some((star) => star.name === selectedStar.name)) {
      trimmed.unshift(selectedStar);
    }
    return trimmed;
  }, [performanceMode, selectedStar, starLod]);
  const labelsToRender = useMemo(() => {
    const set = new Set<string>([...MAJOR_STAR_LABELS]);
    if (selectedStar) set.add(selectedStar.name);
    if (hoveredStar) set.add(hoveredStar.name);
    const closeZoom = distance < 48;
    const brightThreshold = distance < 24 ? 0.34 : distance < 36 ? 0.52 : 0.72;
    return filteredStars.filter((star) => {
      if (set.has(star.name)) return true;
      if (!closeZoom) return false;
      return getStarBrightness(star) >= brightThreshold;
    });
  }, [distance, filteredStars, hoveredStar, selectedStar]);

  useEffect(() => {
    setCameraDistance(distance);
  }, [distance, setCameraDistance]);

  useEffect(() => {
    if (!controlsRef.current || !focusStar) return;
    const [x, y, z] = getStarRenderPosition(focusStar);
    const target = new Vector3(x, y, z);
    const currentTarget = controlsRef.current.target.clone();
    const currentPos = camera.position.clone();
    const direction = currentPos.clone().sub(currentTarget).normalize();
    const distance = Math.max(6, currentPos.distanceTo(target) * 0.35);
    const endPos = target.clone().add(direction.multiplyScalar(distance));
    focusRef.current = {
      startPos: currentPos,
      startTarget: currentTarget,
      endPos,
      endTarget: target,
      progress: 0,
    };
  }, [focusStar, camera]);

  useFrame(() => {
    const next = camera.position.length();
    if (Math.abs(next - distance) > 0.5) {
      setDistance(next);
    }
    if (focusRef.current && controlsRef.current) {
      const focus = focusRef.current;
      focus.progress = Math.min(1, focus.progress + 0.035);
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
    if (controlsRef.current) {
      controlsRef.current.update();
    }
  });

  return (
    <>
      <ambientLight intensity={0.6} />
      <StarFocus star={selectedStar} performanceMode={performanceMode} />
      <StarField
        stars={filteredStars}
        onSelect={onSelectStar}
        onHover={onHoverStar}
        cameraDistance={distance}
        performanceMode={performanceMode}
        debugMode={debugStarDots}
        selectedStarName={selectedStar?.name ?? null}
      />
      <StarLabels
        stars={labelsToRender}
        cameraDistance={distance}
        hoveredStarName={hoveredStar?.name ?? null}
        selectedStarName={selectedStar?.name ?? null}
        performanceMode={performanceMode}
      />
      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.25}
        zoomSpeed={0.4}
        panSpeed={0.2}
        minDistance={4}
        maxDistance={260}
        onStart={() => {
          focusRef.current = null;
        }}
      />
    </>
  );
};

const StarMapScene: FC<StarMapSceneProps> = ({ onBackToSkyMap }) => {
  const stars = useNearbyStars();
  const [selectedStar, setSelectedStar] = useState<NearbyStar | null>(null);
  const [focusStar, setFocusStar] = useState<NearbyStar | null>(null);
  const [hoveredStar, setHoveredStar] = useState<NearbyStar | null>(null);
  const [cameraDistance, setCameraDistance] = useState(60);
  const [performanceMode, setPerformanceMode] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 900px)").matches;
  });
  const [debugStarDots, setDebugStarDots] = useState(false);

  const starSubtitle = selectedStar
    ? `${selectedStar.distanceLy.toFixed(1)} light years · ${selectedStar.spectralType}`
    : "Click a star to see details";

  return (
    <section className="starmap-page">
      <div className="starmap-canvas">
        <Canvas
          className="starmap-canvas__element"
          camera={{ position: [0, 20, 60], fov: 55 }}
          dpr={[1, 2]}
        >
          <StarMapContent
            stars={stars}
            onSelectStar={(star) => {
              setSelectedStar(star);
              setFocusStar(star);
            }}
            onHoverStar={setHoveredStar}
            setCameraDistance={setCameraDistance}
            focusStar={focusStar}
            selectedStar={selectedStar}
            hoveredStar={hoveredStar}
            performanceMode={performanceMode}
            debugStarDots={debugStarDots}
          />
        </Canvas>
      </div>

      <div className="starmap-ui">
        <div className="starmap-header">
          <div>
            <p className="eyebrow">LOCAL STAR MAP</p>
            <h2>StarMap</h2>
            <p className="subtitle">A neighbourhood view of stars within ~50 light years.</p>
          </div>
          <div className="starmap-header__meta">
            <span className="starmap-header__label">Scale</span>
            <span>{Math.round(cameraDistance)} units</span>
            <div className="info-panel__mode-toggle" aria-label="StarMap render mode">
              <button
                type="button"
                className={`mode-button ${!performanceMode ? "active" : ""}`}
                onClick={() => setPerformanceMode(false)}
              >
                Detail
              </button>
              <button
                type="button"
                className={`mode-button ${performanceMode ? "active" : ""}`}
                onClick={() => setPerformanceMode(true)}
              >
                Performance
              </button>
            </div>
            <button
              type="button"
              className={`mode-button ${debugStarDots ? "active" : ""}`}
              onClick={() => setDebugStarDots((prev) => !prev)}
            >
              Debug Dots
            </button>
            {onBackToSkyMap && (
              <button type="button" className="ghost button--small" onClick={onBackToSkyMap}>
                Back to SkyMap
              </button>
            )}
          </div>
        </div>

        <aside className="starmap-panel">
          <div>
            <p className="eyebrow">STAR</p>
            <h3>{selectedStar ? selectedStar.name : "Select a star"}</h3>
            <p className="status">{starSubtitle}</p>
          </div>
          {selectedStar && (
            <dl className="starmap-panel__stats">
              <div>
                <dt>Distance</dt>
                <dd>{selectedStar.distanceLy.toFixed(2)} ly</dd>
              </div>
              <div>
                <dt>Temperature</dt>
                <dd>{selectedStar.temperature.toLocaleString()} K</dd>
              </div>
              <div>
                <dt>Brightness</dt>
                <dd>{selectedStar.luminosity.toFixed(2)} L☉</dd>
              </div>
            </dl>
          )}
        </aside>
      </div>
    </section>
  );
};

export default StarMapScene;
