import { FC, useMemo } from "react";
import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  type Intersection,
  type Object3D,
  type Raycaster,
} from "three";

interface OrbitRingProps {
  radius: number;
  inclinationDeg: number;
  planetId: string;
  highlighted?: boolean;
  points?: Array<[number, number, number]>;
  currentPosition?: [number, number, number];
  variant?: "planet" | "moon";
}

const ignoreRaycast = (_raycaster: Raycaster, _intersections: Intersection<Object3D>[]) => undefined;

const OrbitRing: FC<OrbitRingProps> = ({
  radius,
  inclinationDeg,
  planetId,
  highlighted,
  points,
  currentPosition,
  variant = "planet",
}) => {
  const baseThickness = highlighted ? 0.08 : 0.04;
  const outerBoost = Math.min(0.12, radius * 0.002);
  const thickness = baseThickness + outerBoost;
  const tilt = (inclinationDeg * Math.PI) / 180;
  const innerPlanets = ["mercury", "venus", "earth", "mars"];
  const gasGiants = ["jupiter", "saturn"];
  const innerTone = "#caa27b";
  const gasTone = "#6aa6ff";
  const iceTone = "#6bd4ff";
  const baseColor =
    variant === "moon"
      ? "#d7edf7"
      : innerPlanets.includes(planetId)
        ? innerTone
        : gasGiants.includes(planetId)
          ? gasTone
          : iceTone;
  const color = highlighted ? "#7affd6" : baseColor;
  const innerOpacity = highlighted ? 0.45 : 0.22;
  const outerOpacity = highlighted ? 0.32 : 0.16;
  const apsides = useMemo(() => {
    if (!points?.length || variant !== "planet") return null;
    return points.reduce(
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
        perihelion: points[0],
        aphelion: points[0],
        minDistance: Infinity,
        maxDistance: 0,
      },
    );
  }, [points, variant]);
  const pathGeometry = useMemo(() => {
    if (!points?.length) return null;
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(points.flat(), 3));
    return geometry;
  }, [points]);

  if (pathGeometry) {
    return (
      <group>
        <lineLoop geometry={pathGeometry} raycast={ignoreRaycast}>
          <lineBasicMaterial color={color} transparent opacity={highlighted ? 0.7 : variant === "moon" ? 0.32 : 0.35} />
        </lineLoop>
        {highlighted && currentPosition && (
          <mesh position={currentPosition} raycast={ignoreRaycast}>
            <sphereGeometry args={[variant === "moon" ? 0.06 : 0.18, 12, 12]} />
            <meshBasicMaterial color="#7affd6" />
          </mesh>
        )}
        {highlighted && apsides && (
          <>
            <mesh position={apsides.perihelion} raycast={ignoreRaycast}>
              <sphereGeometry args={[0.11, 10, 10]} />
              <meshBasicMaterial color="#ffd27b" transparent opacity={0.82} />
            </mesh>
            <mesh position={apsides.aphelion} raycast={ignoreRaycast}>
              <sphereGeometry args={[0.11, 10, 10]} />
              <meshBasicMaterial color="#8ecfff" transparent opacity={0.72} />
            </mesh>
          </>
        )}
      </group>
    );
  }

  return (
    <group rotation={[tilt, 0, 0]}>
      <mesh rotation={[Math.PI / 2, 0, 0]} raycast={ignoreRaycast}>
        <ringGeometry args={[Math.max(radius - thickness * 0.6, 0.02), radius + thickness * 0.25, 160]} />
        <meshBasicMaterial color={color} transparent opacity={innerOpacity} side={DoubleSide} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} raycast={ignoreRaycast}>
        <ringGeometry args={[Math.max(radius - thickness, 0.02), radius + thickness, 160]} />
        <meshBasicMaterial color={color} transparent opacity={outerOpacity} side={DoubleSide} />
      </mesh>
    </group>
  );
};

export default OrbitRing;
