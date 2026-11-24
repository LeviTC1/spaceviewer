import { FC, useMemo } from "react";
import {
  AdditiveBlending,
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Quaternion,
  Vector3,
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
  const baseThickness = highlighted ? 0.065 : 0.025;
  const outerBoost = Math.min(0.07, radius * 0.0012);
  const thickness = baseThickness + outerBoost;
  const tilt = (inclinationDeg * Math.PI) / 180;
  const innerPlanets = ["mercury", "venus", "earth", "mars"];
  const gasGiants = ["jupiter", "saturn"];
  const innerTone = "#b7c5d1";
  const gasTone = "#9cb9d8";
  const iceTone = "#91bfd0";
  const baseColor =
    variant === "moon"
      ? "#d7edf7"
      : innerPlanets.includes(planetId)
        ? innerTone
        : gasGiants.includes(planetId)
          ? gasTone
          : iceTone;
  const color = highlighted ? "#fff0c4" : baseColor;
  const innerOpacity = highlighted ? 0.42 : 0.14;
  const outerOpacity = highlighted ? 0.26 : 0.07;
  const directionMarkers = useMemo(() => {
    if (!points?.length || !highlighted || variant !== "planet") return [];
    const up = new Vector3(0, 1, 0);
    const step = Math.max(8, Math.floor(points.length / 18));
    return points
      .filter((_, index) => index % step === 0)
      .map((point, index) => {
        const next = points[(index * step + 2) % points.length];
        const tangent = new Vector3(next[0] - point[0], next[1] - point[1], next[2] - point[2]).normalize();
        return {
          position: point,
          quaternion: new Quaternion().setFromUnitVectors(up, tangent),
        };
      });
  }, [highlighted, points, variant]);
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
          <lineBasicMaterial color={color} transparent opacity={highlighted ? 0.72 : variant === "moon" ? 0.22 : 0.16} />
        </lineLoop>
        {highlighted && (
          <lineLoop geometry={pathGeometry} raycast={ignoreRaycast}>
            <lineBasicMaterial color="#fff0c4" transparent opacity={0.24} blending={AdditiveBlending} />
          </lineLoop>
        )}
        {directionMarkers.map((marker, index) => (
          <group key={`direction-${planetId}-${index}`} position={marker.position} quaternion={marker.quaternion} raycast={ignoreRaycast}>
            <mesh>
              <coneGeometry args={[variant === "moon" ? 0.035 : 0.09, variant === "moon" ? 0.12 : 0.28, 3]} />
              <meshBasicMaterial color={color} transparent opacity={0.72} />
            </mesh>
          </group>
        ))}
        {highlighted && currentPosition && (
          <mesh position={currentPosition} raycast={ignoreRaycast}>
            <sphereGeometry args={[variant === "moon" ? 0.06 : 0.18, 12, 12]} />
            <meshBasicMaterial color="#7affd6" transparent opacity={0.95} />
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
