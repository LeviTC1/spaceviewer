import { FC, useEffect, useMemo, useState } from "react";
import { Html, useCursor } from "@react-three/drei";
import { BackSide, Matrix4, Quaternion, Vector3, type Texture } from "three";
import type { MoonDef } from "./moonData";
import { loadMoonTexture } from "./textures/loadMoonTexture";
import type { TextureQuality } from "./textures/textureCatalog";
import { getMoonRenderRadius } from "./moonMath";
import EclipseSurfaceShadows from "./eclipse/PlanetEclipseShadows";
import type { MoonEclipseOccluder } from "./eclipse/solarEclipseModel";
import {
  getSolarBodyOrientation,
  isControlledSatelliteOrientationBodyId,
} from "../../domain/solar";

interface MoonMeshProps {
  moon: MoonDef;
  position: [number, number, number];
  timeDays: number;
  textureQuality: TextureQuality;
  selected?: boolean;
  segments: number;
  eclipseOccluders: MoonEclipseOccluder[];
  eclipseShadowsEnabled: boolean;
  onSelect: (moon: MoonDef) => void;
  onFocus: (position: [number, number, number]) => void;
}

const MoonMesh: FC<MoonMeshProps> = ({
  moon,
  position,
  timeDays,
  textureQuality,
  selected,
  segments,
  eclipseOccluders,
  eclipseShadowsEnabled,
  onSelect,
  onFocus,
}) => {
  const [hovered, setHovered] = useState(false);
  const [texture, setTexture] = useState<Texture | null>(null);

  useCursor(hovered);

  const renderRadius = getMoonRenderRadius(moon);
  const orientation = useMemo(
    () =>
      isControlledSatelliteOrientationBodyId(moon.id)
        ? getSolarBodyOrientation(moon.id, { daysSinceEpoch: timeDays })
        : null,
    [moon.id, timeDays],
  );
  const bodyQuaternion = useMemo(() => {
    if (!orientation) return new Quaternion();
    const { primeMeridianUnitVector: x, poleUnitVector: y, thirdAxisUnitVector: z } =
      orientation.sceneFrame;
    const rotationMatrix = new Matrix4().makeBasis(
      new Vector3(x.x, x.y, x.z),
      new Vector3(y.x, y.y, y.z),
      new Vector3(z.x, z.y, z.z),
    );
    return new Quaternion().setFromRotationMatrix(rotationMatrix);
  }, [orientation]);

  useEffect(() => {
    let active = true;
    loadMoonTexture(moon, textureQuality).then((result) => {
      if (active) setTexture(result);
    });
    return () => {
      active = false;
    };
  }, [moon, textureQuality]);

  return (
    <group position={position}>
      {selected ? (
        <mesh renderOrder={3}>
          <sphereGeometry args={[renderRadius * 1.35, Math.max(12, segments - 4), Math.max(12, segments - 4)]} />
          <meshBasicMaterial
            color="#7affd6"
            transparent
            opacity={0.22}
            side={BackSide}
            depthWrite={false}
          />
        </mesh>
      ) : null}
      <group quaternion={bodyQuaternion}>
        <mesh
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
          <sphereGeometry args={[renderRadius, segments, segments]} />
          <meshStandardMaterial
            map={texture ?? undefined}
            color={texture ? "#ffffff" : moon.colorHint ?? "#cfd3da"}
            roughness={0.85}
            metalness={0.05}
          />
        </mesh>
      </group>

      {selected && eclipseShadowsEnabled && eclipseOccluders.length > 0 ? (
        <EclipseSurfaceShadows
          radius={renderRadius}
          segments={segments}
          occluders={eclipseOccluders}
        />
      ) : null}

      {hovered ? (
        <Html position={[0, renderRadius * 1.8, 0]} center style={{ pointerEvents: "none" }}>
          <div className="solar-planet-label">{moon.name}</div>
        </Html>
      ) : null}
    </group>
  );
};

export default MoonMesh;
