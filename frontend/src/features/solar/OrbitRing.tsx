import { FC } from "react";
import { DoubleSide } from "three";

interface OrbitRingProps {
  radius: number;
  inclinationDeg: number;
  planetId: string;
  highlighted?: boolean;
}

const OrbitRing: FC<OrbitRingProps> = ({ radius, inclinationDeg, planetId, highlighted }) => {
  const baseThickness = highlighted ? 0.08 : 0.04;
  const outerBoost = Math.min(0.12, radius * 0.002);
  const thickness = baseThickness + outerBoost;
  const tilt = (inclinationDeg * Math.PI) / 180;
  const innerPlanets = ["mercury", "venus", "earth", "mars"];
  const gasGiants = ["jupiter", "saturn"];
  const innerTone = "#caa27b";
  const gasTone = "#6aa6ff";
  const iceTone = "#6bd4ff";
  const baseColor = innerPlanets.includes(planetId)
    ? innerTone
    : gasGiants.includes(planetId)
      ? gasTone
      : iceTone;
  const color = highlighted ? "#7affd6" : baseColor;
  const innerOpacity = highlighted ? 0.45 : 0.22;
  const outerOpacity = highlighted ? 0.32 : 0.16;

  return (
    <group rotation={[tilt, 0, 0]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[Math.max(radius - thickness * 0.6, 0.02), radius + thickness * 0.25, 160]} />
        <meshBasicMaterial color={color} transparent opacity={innerOpacity} side={DoubleSide} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[Math.max(radius - thickness, 0.02), radius + thickness, 160]} />
        <meshBasicMaterial color={color} transparent opacity={outerOpacity} side={DoubleSide} />
      </mesh>
    </group>
  );
};

export default OrbitRing;
