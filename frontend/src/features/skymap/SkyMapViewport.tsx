import { useEffect, useMemo, useRef, useState, type FC } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls, Stars } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { AdditiveBlending, Color, MathUtils, Vector3, type Group, type MeshBasicMaterial } from "three";
import type { Intersection, Object3D, Raycaster } from "three";
import type { SkyObjectId } from "./core/objects";
import type { SkyMeshRenderable, SkyPointRenderable, SkyRenderable } from "./core/renderers";
import { isSkyMeshRenderable, isSkyPointRenderable } from "./core/renderers";
import {
  createSkyMapFocusCameraPose,
  createSkyMapOverviewCameraPose,
  formatSkyMapNavigationMode,
  getSkyMapScaleBandDefinition,
  SKYMAP_DEFAULT_CAMERA_POSE,
  type SkyMapCameraPose,
  type SkyMapNavigationState,
} from "./core/navigation";
import { StarField, type StarRenderDatum } from "../starmap/starRenderer";
import { useRenderActivity } from "../../lib/rendering/useRenderActivity";
import type { SkyMapPlaybackState } from "./core/time";

interface SkyMapViewportProps {
  renderables: SkyRenderable[];
  selectedObjectId: SkyObjectId | null;
  hoveredObjectId: SkyObjectId | null;
  focusedObjectId: SkyObjectId | null;
  focusRequestId: number;
  navigationState: SkyMapNavigationState;
  objectCount: number;
  cameraDistance: number;
  onSelectObject: (objectId: SkyObjectId | null) => void;
  onHoverObject: (objectId: SkyObjectId | null) => void;
  onViewportDistanceChange: (cameraDistance: number) => void;
  onManualNavigation: () => void;
  timePlayback: SkyMapPlaybackState;
}

interface FocusTransition {
  fromCamera: Vector3;
  toCamera: Vector3;
  fromTarget: Vector3;
  toTarget: Vector3;
  startedAt: number | null;
  duration: number;
}

type FocusableRenderable = SkyPointRenderable | SkyMeshRenderable;

const ignoreRaycast = (_raycaster: Raycaster, _intersections: Intersection<Object3D>[]) => undefined;

const toScenePosition = (renderable: FocusableRenderable) =>
  [renderable.position.x, renderable.position.y, renderable.position.z] as [number, number, number];

const toVector3 = (renderable: FocusableRenderable) =>
  new Vector3(renderable.position.x, renderable.position.y, renderable.position.z);

const getRenderableLabel = (renderable: FocusableRenderable) =>
  renderable.kind === "point" ? renderable.label : renderable.label ?? renderable.objectId;

const getRenderableRadius = (renderable: FocusableRenderable) =>
  renderable.kind === "mesh" ? renderable.radiusSceneUnits ?? 0.24 : 0.55;

const getMeshPrimaryScale = (mesh: SkyMeshRenderable): [number, number, number] => {
  switch (mesh.meshMetadata?.shape) {
    case "galaxy-disk":
      return [1.9, 0.26, 0.82];
    case "nebula-cloud":
      return [1.42, 0.78, 1.12];
    case "cluster-halo":
      return [1.08, 1.08, 1.08];
    case "sphere":
    default:
      return [1, 1, 1];
  }
};

const getMeshSecondaryScale = (mesh: SkyMeshRenderable): [number, number, number] => {
  switch (mesh.meshMetadata?.shape) {
    case "galaxy-disk":
      return [2.7, 0.08, 1.08];
    case "nebula-cloud":
      return [1.95, 1.08, 1.52];
    case "cluster-halo":
      return [1.72, 1.72, 1.72];
    case "sphere":
    default:
      return [1.9, 1.9, 1.9];
  }
};

const getMeshSegments = (mesh: SkyMeshRenderable): [number, number] => {
  if (mesh.meshMetadata?.family === "solar-body") return [28, 28];
  return [36, 18];
};

const toCameraVector = (vector: Vector3) => ({ x: vector.x, y: vector.y, z: vector.z });

const toVectorFromPose = (vector: SkyMapCameraPose["position"]) => new Vector3(vector.x, vector.y, vector.z);

const createTransitionFromPose = (
  pose: SkyMapCameraPose,
  currentCamera: Vector3,
  currentTarget: Vector3,
): FocusTransition => ({
  fromCamera: currentCamera,
  toCamera: toVectorFromPose(pose.position),
  fromTarget: currentTarget,
  toTarget: toVectorFromPose(pose.target),
  startedAt: null,
  duration: pose.durationSeconds,
});

const toStarRenderDatum = (point: SkyPointRenderable): StarRenderDatum => {
  const fallbackDistance = Math.hypot(point.position.x, point.position.y, point.position.z);
  return {
    objectId: point.objectId,
    name: point.label,
    x: point.position.x,
    y: point.position.y,
    z: point.position.z,
    distanceLy: point.pointMetadata?.distanceLy ?? fallbackDistance,
    spectralType: point.pointMetadata?.spectralType ?? "G",
    luminosity: point.pointMetadata?.luminositySolar ?? Math.max(point.brightness ?? 0.1, 0.001),
    temperature: point.pointMetadata?.temperatureK ?? 5778,
  };
};

const SkyMapFocusMarker: FC<{ renderable: FocusableRenderable | null }> = ({ renderable }) => {
  const groupRef = useRef<Group | null>(null);
  const haloRef = useRef<MeshBasicMaterial | null>(null);

  useFrame((state) => {
    if (!groupRef.current || !haloRef.current) return;
    const pulse = 1 + Math.sin(state.clock.elapsedTime * 1.6) * 0.04;
    groupRef.current.scale.setScalar(pulse);
    haloRef.current.opacity = 0.18 + Math.sin(state.clock.elapsedTime * 1.3) * 0.035;
  });

  if (!renderable) return null;
  const tint = new Color(renderable.color ?? "#f4f7ff");
  const renderableRadius = getRenderableRadius(renderable);
  const markerRadius = MathUtils.clamp(Math.max(0.55, renderableRadius * 1.16), 0.55, 4.8);
  const haloRadius = MathUtils.clamp(Math.max(1.7, renderableRadius * 3.4), 1.7, 13);

  return (
    <group ref={groupRef} position={toScenePosition(renderable)}>
      <mesh raycast={ignoreRaycast}>
        <sphereGeometry args={[markerRadius, 24, 24]} />
        <meshBasicMaterial color={new Color("#ffffff").lerp(tint, 0.2)} toneMapped={false} />
      </mesh>
      <mesh raycast={ignoreRaycast}>
        <sphereGeometry args={[haloRadius, 24, 24]} />
        <meshBasicMaterial
          ref={haloRef}
          color={tint}
          transparent
          opacity={0.18}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
};

const SkyMapHoverMarker: FC<{ renderable: FocusableRenderable | null; selectedObjectId: SkyObjectId | null }> = ({
  renderable,
  selectedObjectId,
}) => {
  const groupRef = useRef<Group | null>(null);
  const haloRef = useRef<MeshBasicMaterial | null>(null);

  useFrame((state) => {
    if (!groupRef.current || !haloRef.current) return;
    const pulse = 1 + Math.sin(state.clock.elapsedTime * 3.2) * 0.05;
    groupRef.current.scale.setScalar(pulse);
    haloRef.current.opacity = 0.1 + Math.sin(state.clock.elapsedTime * 2.4) * 0.025;
  });

  if (!renderable || renderable.objectId === selectedObjectId) return null;
  const tint = new Color(renderable.color ?? "#f4f7ff");
  const renderableRadius = getRenderableRadius(renderable);
  const markerRadius = MathUtils.clamp(Math.max(0.32, renderableRadius * 0.8), 0.32, 3.2);
  const haloRadius = MathUtils.clamp(Math.max(1.08, renderableRadius * 2.4), 1.08, 9);

  return (
    <group ref={groupRef} position={toScenePosition(renderable)}>
      <mesh raycast={ignoreRaycast}>
        <sphereGeometry args={[markerRadius, 20, 20]} />
        <meshBasicMaterial color={new Color("#ffffff").lerp(tint, 0.3)} toneMapped={false} />
      </mesh>
      <mesh raycast={ignoreRaycast}>
        <sphereGeometry args={[haloRadius, 20, 20]} />
        <meshBasicMaterial
          ref={haloRef}
          color={tint}
          transparent
          opacity={0.1}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
};

const SkyMapLabels: FC<{
  renderables: FocusableRenderable[];
  selectedObjectId: SkyObjectId | null;
  hoveredObjectId: SkyObjectId | null;
  focusedObjectId: SkyObjectId | null;
  cameraDistance: number;
  navigationState: SkyMapNavigationState;
}> = ({ renderables, selectedObjectId, hoveredObjectId, focusedObjectId, cameraDistance, navigationState }) => {
  const showContextLabels = navigationState.scaleBand !== "wide-field" && cameraDistance < 86;
  const contextPriority = navigationState.scaleBand === "solar-context" ? 55 : 84;
  const labelRenderables = useMemo(() => {
    return renderables
      .filter((renderable) => {
        const priority = renderable.labelPriority ?? 0;
        return (
          renderable.objectId === selectedObjectId ||
          renderable.objectId === hoveredObjectId ||
          renderable.objectId === focusedObjectId ||
          priority >= 95 ||
          (showContextLabels && priority >= contextPriority)
        );
      })
      .sort((a, b) => {
        const aFeatured =
          a.objectId === selectedObjectId || a.objectId === hoveredObjectId || a.objectId === focusedObjectId;
        const bFeatured =
          b.objectId === selectedObjectId || b.objectId === hoveredObjectId || b.objectId === focusedObjectId;
        if (aFeatured !== bFeatured) return aFeatured ? -1 : 1;
        return (b.labelPriority ?? 0) - (a.labelPriority ?? 0);
      })
      .slice(0, 18);
  }, [contextPriority, focusedObjectId, hoveredObjectId, renderables, selectedObjectId, showContextLabels]);

  return (
    <group>
      {labelRenderables.map((renderable) => {
        const selected = renderable.objectId === selectedObjectId;
        const hovered = renderable.objectId === hoveredObjectId;
        const opacity = selected || hovered ? 1 : 0.58;
        const [x, y, z] = toScenePosition(renderable);
        return (
          <Html key={renderable.id} position={[x + 0.8, y + 0.48 + getRenderableRadius(renderable) * 0.35, z]}>
            <div className={`skymap-star-label ${selected ? "is-selected" : ""}`} style={{ opacity }}>
              {getRenderableLabel(renderable)}
            </div>
          </Html>
        );
      })}
    </group>
  );
};

const SkyMapMeshObjects: FC<{
  meshes: SkyMeshRenderable[];
  selectedObjectId: SkyObjectId | null;
  hoveredObjectId: SkyObjectId | null;
  onSelectObject: (objectId: SkyObjectId | null) => void;
  onHoverObject: (objectId: SkyObjectId | null) => void;
}> = ({ meshes, selectedObjectId, hoveredObjectId, onSelectObject, onHoverObject }) => {
  return (
    <group>
      {meshes.map((mesh) => {
        const selected = mesh.objectId === selectedObjectId;
        const hovered = mesh.objectId === hoveredObjectId;
        const radius = mesh.radiusSceneUnits ?? 0.2;
        const tint = new Color(mesh.color ?? "#f4f7ff");
        const opacity = MathUtils.clamp((mesh.opacity ?? 0.9) + (selected ? 0.08 : hovered ? 0.04 : 0), 0, 1);
        const primaryScale = getMeshPrimaryScale(mesh);
        const secondaryScale = getMeshSecondaryScale(mesh);
        const segments = getMeshSegments(mesh);
        const deepSpaceFamily = mesh.meshMetadata?.family && mesh.meshMetadata.family !== "solar-body";
        const secondaryOpacity = deepSpaceFamily ? (selected ? 0.24 : hovered ? 0.18 : 0.1) : selected ? 0.2 : 0.12;

        return (
          <group key={mesh.id} position={toScenePosition(mesh)} rotation={mesh.meshMetadata?.rotation}>
            <mesh
              scale={primaryScale}
              onPointerDown={(event) => {
                if (mesh.interactive === false) return;
                event.stopPropagation();
                onSelectObject(mesh.objectId);
              }}
              onPointerMove={(event) => {
                if (mesh.interactive === false) return;
                event.stopPropagation();
                onHoverObject(mesh.objectId);
              }}
              onPointerOut={(event) => {
                if (mesh.interactive === false) return;
                event.stopPropagation();
                onHoverObject(null);
              }}
            >
              <sphereGeometry args={[radius, segments[0], segments[1]]} />
              <meshBasicMaterial
                color={new Color("#ffffff").lerp(tint, selected || hovered ? 0.78 : 0.92)}
                transparent
                opacity={opacity}
                blending={deepSpaceFamily ? AdditiveBlending : undefined}
                depthWrite={!deepSpaceFamily}
                toneMapped={false}
              />
            </mesh>
            {selected || hovered || deepSpaceFamily ? (
              <mesh scale={secondaryScale} raycast={ignoreRaycast}>
                <sphereGeometry args={[radius * (selected || hovered ? 2.15 : 1.28), 28, 14]} />
                <meshBasicMaterial
                  color={tint}
                  transparent
                  opacity={secondaryOpacity}
                  blending={AdditiveBlending}
                  depthWrite={false}
                  toneMapped={false}
                />
              </mesh>
            ) : null}
            {mesh.meshMetadata?.shape === "cluster-halo" ? (
              <mesh scale={[0.42, 0.42, 0.42]} raycast={ignoreRaycast}>
                <sphereGeometry args={[radius, 18, 18]} />
                <meshBasicMaterial color="#ffffff" transparent opacity={0.52} toneMapped={false} />
              </mesh>
            ) : null}
          </group>
        );
      })}
    </group>
  );
};

const SkyMapScene: FC<{
  renderables: SkyRenderable[];
  selectedObjectId: SkyObjectId | null;
  hoveredObjectId: SkyObjectId | null;
  focusedObjectId: SkyObjectId | null;
  focusRequestId: number;
  navigationState: SkyMapNavigationState;
  cameraDistance: number;
  onSelectObject: (objectId: SkyObjectId | null) => void;
  onHoverObject: (objectId: SkyObjectId | null) => void;
  onViewportDistanceChange: (cameraDistance: number) => void;
  onManualNavigation: () => void;
  timePlayback: SkyMapPlaybackState;
}> = ({
  renderables,
  selectedObjectId,
  hoveredObjectId,
  focusedObjectId,
  focusRequestId,
  navigationState,
  cameraDistance: initialCameraDistance,
  onSelectObject,
  onHoverObject,
  onViewportDistanceChange,
  onManualNavigation,
  timePlayback,
}) => {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const focusTransitionRef = useRef<FocusTransition | null>(null);
  const lastAppliedFocusRequestRef = useRef(0);
  const lastAppliedResetRequestRef = useRef(0);
  const trackedFocusObjectRef = useRef<{ objectId: SkyObjectId; position: Vector3 } | null>(null);
  const { camera } = useThree();
  const [cameraDistance, setCameraDistance] = useState(initialCameraDistance);
  const lastDistanceReportRef = useRef(0);
  const points = useMemo(() => renderables.filter(isSkyPointRenderable), [renderables]);
  const meshes = useMemo(() => renderables.filter(isSkyMeshRenderable), [renderables]);
  const focusableRenderables = useMemo<FocusableRenderable[]>(() => [...points, ...meshes], [meshes, points]);
  const interactivePoints = useMemo(() => points.filter((point) => point.interactive !== false), [points]);
  const passivePoints = useMemo(() => points.filter((point) => point.interactive === false), [points]);
  const interactiveStarData = useMemo(() => interactivePoints.map(toStarRenderDatum), [interactivePoints]);
  const passiveStarData = useMemo(() => passivePoints.map(toStarRenderDatum), [passivePoints]);
  const selectedRenderable = useMemo(
    () => focusableRenderables.find((renderable) => renderable.objectId === selectedObjectId) ?? null,
    [focusableRenderables, selectedObjectId],
  );
  const selectedPoint = selectedRenderable?.kind === "point" ? selectedRenderable : null;
  const hoveredRenderable = useMemo(
    () => focusableRenderables.find((renderable) => renderable.objectId === hoveredObjectId) ?? null,
    [focusableRenderables, hoveredObjectId],
  );
  const focusedRenderable = useMemo(
    () =>
      navigationState.mode === "object-focus"
        ? focusableRenderables.find((renderable) => renderable.objectId === focusedObjectId) ?? selectedRenderable
        : null,
    [focusableRenderables, focusedObjectId, navigationState.mode, selectedRenderable],
  );
  const renderReasons = useMemo(
    () =>
      [
        timePlayback === "playing" ? "time-playback" : null,
      ].filter((reason): reason is string => Boolean(reason)),
    [timePlayback],
  );
  const { requestRender } = useRenderActivity({
    label: "skymap",
    active: renderReasons.length > 0,
    reasons: renderReasons,
    diagnostics: {
      renderables: renderables.length,
      points: points.length,
      meshes: meshes.length,
      cameraDistance: Math.round(cameraDistance),
    },
  });

  useEffect(() => {
    if (navigationState.mode !== "object-focus" || !focusedRenderable || focusRequestId <= 0) return;
    if (lastAppliedFocusRequestRef.current === focusRequestId) return;
    lastAppliedFocusRequestRef.current = focusRequestId;

    const currentTarget = controlsRef.current?.target.clone() ?? new Vector3();
    const currentCamera = camera.position.clone();
    const pose = createSkyMapFocusCameraPose(
      {
        objectId: focusedRenderable.objectId,
        position: focusedRenderable.position,
        radiusSceneUnits: getRenderableRadius(focusedRenderable),
      },
      toCameraVector(currentCamera),
      toCameraVector(currentTarget),
    );

    focusTransitionRef.current = createTransitionFromPose(pose, currentCamera, currentTarget);
    requestRender((pose.durationSeconds + 0.2) * 1000, "focus-transition");
  }, [camera, focusRequestId, focusedRenderable, navigationState.mode, requestRender]);

  useEffect(() => {
    if (navigationState.resetRequestId <= 0) return;
    if (lastAppliedResetRequestRef.current === navigationState.resetRequestId) return;
    lastAppliedResetRequestRef.current = navigationState.resetRequestId;

    const currentTarget = controlsRef.current?.target.clone() ?? new Vector3();
    const currentCamera = camera.position.clone();
    const overviewPose = createSkyMapOverviewCameraPose();
    focusTransitionRef.current = createTransitionFromPose(overviewPose, currentCamera, currentTarget);
    trackedFocusObjectRef.current = null;
    requestRender((overviewPose.durationSeconds + 0.2) * 1000, "overview-reset");
  }, [camera, navigationState.resetRequestId, requestRender]);

  useEffect(() => {
    if (navigationState.mode !== "object-focus" || !focusedRenderable || !controlsRef.current) {
      trackedFocusObjectRef.current = null;
      return;
    }

    const nextPosition = toVector3(focusedRenderable);
    const previous = trackedFocusObjectRef.current;
    if (previous?.objectId === focusedRenderable.objectId && focusTransitionRef.current === null) {
      const delta = nextPosition.clone().sub(previous.position);
      if (delta.lengthSq() > 0.0001) {
        camera.position.add(delta);
        controlsRef.current.target.add(delta);
        controlsRef.current.update();
        requestRender(220, "tracked-object-shift");
      }
    }

    trackedFocusObjectRef.current = {
      objectId: focusedRenderable.objectId,
      position: nextPosition,
    };
  }, [camera, focusedRenderable, navigationState.mode, requestRender]);

  useFrame((state) => {
    const transition = focusTransitionRef.current;
    if (transition) {
      if (transition.startedAt === null) {
        transition.startedAt = state.clock.elapsedTime;
      }
      const rawProgress = MathUtils.clamp((state.clock.elapsedTime - transition.startedAt) / transition.duration, 0, 1);
      const easedProgress = MathUtils.smoothstep(rawProgress, 0, 1);
      camera.position.lerpVectors(transition.fromCamera, transition.toCamera, easedProgress);
      controlsRef.current?.target.lerpVectors(transition.fromTarget, transition.toTarget, easedProgress);
      if (rawProgress >= 1) {
        focusTransitionRef.current = null;
      }
    }

    const controlsTarget = controlsRef.current?.target;
    const nextDistance = controlsTarget ? camera.position.distanceTo(controlsTarget) : camera.position.length();
    if (Math.abs(nextDistance - cameraDistance) > 0.45 && state.clock.elapsedTime - lastDistanceReportRef.current > 0.12) {
      lastDistanceReportRef.current = state.clock.elapsedTime;
      setCameraDistance(nextDistance);
      onViewportDistanceChange(nextDistance);
    }
    controlsRef.current?.update();
  });

  return (
    <>
      <ambientLight intensity={0.55} />
      <Stars radius={180} depth={70} count={1000} factor={3.1} saturation={0.25} fade />
      <StarField
        stars={passiveStarData}
        opacity={0.46}
        cameraDistance={cameraDistance}
        performanceMode
        debugMode={false}
        positionScale={1}
        interactive={false}
      />
      <StarField
        stars={interactiveStarData}
        cameraDistance={cameraDistance}
        performanceMode={false}
        debugMode={false}
        positionScale={1}
        selectedStarName={selectedPoint?.label ?? null}
        onSelect={(star) => onSelectObject(star.objectId ?? null)}
        onHover={(star) => onHoverObject(star?.objectId ?? null)}
      />
      <SkyMapMeshObjects
        meshes={meshes}
        selectedObjectId={selectedObjectId}
        hoveredObjectId={hoveredObjectId}
        onSelectObject={onSelectObject}
        onHoverObject={onHoverObject}
      />
      <SkyMapFocusMarker renderable={selectedRenderable} />
      <SkyMapHoverMarker renderable={hoveredRenderable} selectedObjectId={selectedObjectId} />
      <SkyMapLabels
        renderables={focusableRenderables}
        selectedObjectId={selectedObjectId}
        hoveredObjectId={hoveredObjectId}
        focusedObjectId={focusedObjectId}
        cameraDistance={cameraDistance}
        navigationState={navigationState}
      />
      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.1}
        rotateSpeed={0.18}
        zoomSpeed={0.55}
        panSpeed={0.32}
        minDistance={6}
        maxDistance={260}
        screenSpacePanning={false}
        onStart={() => {
          focusTransitionRef.current = null;
          trackedFocusObjectRef.current = null;
          requestRender(1800, "orbit-controls");
          onManualNavigation();
        }}
        onChange={() => requestRender(180, "orbit-controls-change")}
        onEnd={() => requestRender(360, "orbit-controls-end")}
      />
    </>
  );
};

const SkyMapViewport: FC<SkyMapViewportProps> = ({
  renderables,
  selectedObjectId,
  hoveredObjectId,
  focusedObjectId,
  focusRequestId,
  navigationState,
  objectCount,
  cameraDistance,
  onSelectObject,
  onHoverObject,
  onViewportDistanceChange,
  onManualNavigation,
  timePlayback,
}) => {
  const pointRenderables = useMemo(() => renderables.filter(isSkyPointRenderable), [renderables]);
  const meshRenderables = useMemo(() => renderables.filter(isSkyMeshRenderable), [renderables]);
  const detailTier =
    pointRenderables.find((point) => point.lodTier)?.lodTier ??
    meshRenderables.find((mesh) => mesh.lodTier)?.lodTier;
  const interactiveCount =
    pointRenderables.filter((point) => point.interactive !== false).length +
    meshRenderables.filter((mesh) => mesh.interactive !== false).length;
  const scaleBand = getSkyMapScaleBandDefinition(navigationState.scaleBand);

  return (
    <div className="skymap-viewport" aria-label="SkyMap universe viewport">
      <Canvas
        className="skymap-viewport__canvas"
        camera={{
          position: [
            SKYMAP_DEFAULT_CAMERA_POSE.position.x,
            SKYMAP_DEFAULT_CAMERA_POSE.position.y,
            SKYMAP_DEFAULT_CAMERA_POSE.position.z,
          ],
          fov: 52,
        }}
        dpr={[1, 1.5]}
        frameloop="demand"
      >
        <SkyMapScene
          renderables={renderables}
          selectedObjectId={selectedObjectId}
          hoveredObjectId={hoveredObjectId}
          focusedObjectId={focusedObjectId}
          focusRequestId={focusRequestId}
          navigationState={navigationState}
          cameraDistance={cameraDistance}
          onSelectObject={onSelectObject}
          onHoverObject={onHoverObject}
          onViewportDistanceChange={onViewportDistanceChange}
          onManualNavigation={onManualNavigation}
          timePlayback={timePlayback}
        />
      </Canvas>
      <div className="skymap-viewport__hud" aria-hidden="true">
        <span>
          {scaleBand.label} · {formatSkyMapNavigationMode(navigationState.mode)}
        </span>
        <span>
          {objectCount
            ? `${objectCount} indexed · ${renderables.length} rendered · ${interactiveCount} interactive${
                detailTier ? ` · ${detailTier}` : ""
              }`
            : "Loading local layer data"}
        </span>
      </div>
      {!renderables.length && objectCount ? (
        <div className="skymap-viewport__empty" aria-hidden="true">
          Active SkyMap layers hidden
        </div>
      ) : null}
      <div className="skymap-viewport__origin" aria-hidden="true">
        <span />
      </div>
    </div>
  );
};

export default SkyMapViewport;
