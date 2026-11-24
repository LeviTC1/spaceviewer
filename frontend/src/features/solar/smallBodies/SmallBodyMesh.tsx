import { FC, useMemo, useState } from "react";
import { Html, useCursor } from "@react-three/drei";
import { AdditiveBlending, Quaternion, Vector3, type Intersection, type Object3D, type Raycaster } from "three";
import type { SmallBodyDef } from "./smallBodyData";
import { getCometTailPresentation } from "./cometPresentation";

interface SmallBodyMeshProps {
  body: SmallBodyDef;
  position: [number, number, number];
  distanceAu: number;
  radius: number;
  selected: boolean;
  segments: number;
  onSelect: (body: SmallBodyDef) => void;
  onFocus: (body: SmallBodyDef) => void;
}

const ignoreRaycast = (_raycaster: Raycaster, _intersections: Intersection<Object3D>[]) => undefined;
const UP = new Vector3(0, 1, 0);

const SmallBodyMesh: FC<SmallBodyMeshProps> = ({
  body,
  position,
  distanceAu,
  radius,
  selected,
  segments,
  onSelect,
  onFocus,
}) => {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);

  const tail = getCometTailPresentation(distanceAu);
  const tailPlacement = useMemo(() => {
    const antiSolar = new Vector3(...position);
    if (antiSolar.lengthSq() < 1e-8) antiSolar.set(0, 0, 1);
    antiSolar.normalize();
    const centre = antiSolar.clone().multiplyScalar(tail.lengthSceneUnits / 2);
    const quaternion = new Quaternion().setFromUnitVectors(UP, antiSolar.clone().multiplyScalar(-1));
    return { centre, quaternion, antiSolar };
  }, [position, tail.lengthSceneUnits]);

  const glyphScale: [number, number, number] =
    body.id === "haumea" ? [1.38, 0.78, 0.96] : body.kind === "comet" ? [1.18, 0.82, 0.92] : [1, 1, 1];

  return (
    <group position={position}>
      {selected ? (
        <mesh raycast={ignoreRaycast}>
          <sphereGeometry args={[radius * 1.7, 18, 18]} />
          <meshBasicMaterial color="#7affd6" transparent opacity={0.12} blending={AdditiveBlending} depthWrite={false} />
        </mesh>
      ) : null}

      {body.kind === "comet" && tail.active ? (
        <group position={tailPlacement.centre} quaternion={tailPlacement.quaternion} raycast={ignoreRaycast}>
          <mesh>
            <coneGeometry args={[tail.widthSceneUnits, tail.lengthSceneUnits, 18, 1, true]} />
            <meshBasicMaterial
              color="#aeefff"
              transparent
              opacity={tail.opacity}
              blending={AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
          <mesh scale={[0.45, 1.08, 0.45]}>
            <coneGeometry args={[tail.widthSceneUnits, tail.lengthSceneUnits, 14, 1, true]} />
            <meshBasicMaterial
              color="#f5e6c7"
              transparent
              opacity={tail.opacity * 0.52}
              blending={AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        </group>
      ) : null}

      <mesh
        scale={glyphScale}
        onPointerOver={(event) => {
          event.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(body);
        }}
        onDoubleClick={(event) => {
          event.stopPropagation();
          onSelect(body);
          onFocus(body);
        }}
      >
        {body.kind === "comet" ? (
          <dodecahedronGeometry args={[radius, 1]} />
        ) : (
          <sphereGeometry args={[radius, Math.max(18, segments), Math.max(14, segments / 2)]} />
        )}
        <meshStandardMaterial
          color={body.colorHint}
          emissive={body.kind === "comet" ? "#8cb7ac" : "#342f2c"}
          emissiveIntensity={body.kind === "comet" ? 0.52 : selected ? 0.16 : 0.08}
          roughness={body.kind === "comet" ? 0.92 : 0.78}
          metalness={0.02}
        />
      </mesh>

      {hovered || selected ? (
        <Html center distanceFactor={14} position={[0, radius * 2.2, 0]} zIndexRange={[18, 0]}>
          <button
            type="button"
            className={`planet-label ${selected ? "selected" : ""}`}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(body);
            }}
          >
            <span>{body.name}</span>
            <small>{body.kind === "comet" ? body.catalogName : "Dwarf planet"}</small>
          </button>
        </Html>
      ) : null}
    </group>
  );
};

export default SmallBodyMesh;

