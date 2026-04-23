import { FC, useEffect, useRef, useState } from "react";
import { Html, useCursor } from "@react-three/drei";
import { type Mesh, type Texture } from "three";
import { useFrame } from "@react-three/fiber";
import type { MoonDef } from "./moonData";
import { loadMoonTexture } from "./textures/loadMoonTexture";
import type { TextureQuality } from "./textures/textureCatalog";
import { getMoonRenderRadius } from "./moonMath";

interface MoonMeshProps {
  moon: MoonDef;
  position: [number, number, number];
  textureQuality: TextureQuality;
  selected?: boolean;
  onSelect: (moon: MoonDef) => void;
  onFocus: (position: [number, number, number]) => void;
}

const MoonMesh: FC<MoonMeshProps> = ({
  moon,
  position,
  textureQuality,
  selected,
  onSelect,
  onFocus,
}) => {
  const [hovered, setHovered] = useState(false);
  const [texture, setTexture] = useState<Texture | null>(null);
  const meshRef = useRef<Mesh | null>(null);

  useCursor(hovered);

  const renderRadius = getMoonRenderRadius(moon);

  useEffect(() => {
    let active = true;
    loadMoonTexture(moon, textureQuality).then((result) => {
      if (active) setTexture(result);
    });
    return () => {
      active = false;
    };
  }, [moon, textureQuality]);

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.25;
    }
  });

  return (
    <group position={position}>
      {selected && (
        <mesh>
          <sphereGeometry args={[renderRadius * 1.35, 20, 20]} />
          <meshBasicMaterial color="#7affd6" transparent opacity={0.25} />
        </mesh>
      )}
      <mesh
        ref={meshRef}
        castShadow
        receiveShadow
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(moon);
        }}
        onDoubleClick={(event) => {
          event.stopPropagation();
          onFocus(position);
        }}
      >
        <sphereGeometry args={[renderRadius, 24, 24]} />
        <meshStandardMaterial
          map={texture ?? undefined}
          color={texture ? "#ffffff" : moon.colorHint ?? "#cfd3da"}
          roughness={0.85}
          metalness={0.05}
        />
      </mesh>

      {hovered && (
        <Html position={[0, renderRadius * 1.8, 0]} center distanceFactor={12} style={{ pointerEvents: "none" }}>
          <div className="solar-planet-label">{moon.name}</div>
        </Html>
      )}
    </group>
  );
};

export default MoonMesh;
