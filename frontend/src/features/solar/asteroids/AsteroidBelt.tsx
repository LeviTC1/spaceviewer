import { FC, useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, Matrix4, Object3D, Texture, type InstancedMesh } from "three";
import { generateAsteroidField, generateHeroAsteroids, type AsteroidDef, type AsteroidBeltMode } from "./asteroidGenerator";
import { useAsteroidLOD } from "./useAsteroidLOD";
import type { SolarScaleMode } from "../solarData";
import type { TextureQuality } from "../textures/textureCatalog";
import { scaleDistanceAu } from "../solarScale";
import { solarTextureLoader } from "../textures/solarTextureManager";

interface AsteroidBeltProps {
  timeDays: number;
  scaleMode: SolarScaleMode;
  mode: AsteroidBeltMode;
  textureQuality: TextureQuality;
  performanceMode: boolean;
}

const TEXTURE_KEYS = ["2k_mercury.jpg", "2k_mars.jpg", "moon_1024.jpg"];

const loadTexture = async (path: string): Promise<Texture | null> => {
  try {
    const texture = await solarTextureLoader.loadAsync(path);
    texture.anisotropy = 2;
    return texture;
  } catch (error) {
    return null;
  }
};

const AsteroidBelt: FC<AsteroidBeltProps> = ({ timeDays, scaleMode, mode, textureQuality, performanceMode }) => {
  const [textures, setTextures] = useState<(Texture | null)[]>([]);
  const meshRefs = useRef<Array<InstancedMesh | null>>([]);
  const heroRef = useRef<InstancedMesh | null>(null);
  const tempObject = useMemo(() => new Object3D(), []);
  const tempMatrix = useMemo(() => new Matrix4(), []);

  const lod = useAsteroidLOD({
    mode,
    scaleMode,
    performanceMode,
    highQuality: textureQuality === "high",
  });

  const maxCount = useMemo(() => (textureQuality === "high" && !performanceMode ? 5000 : 2500), [textureQuality, performanceMode]);

  const asteroids = useMemo(() => generateAsteroidField(maxCount, 9127), [maxCount]);
  const heroAsteroids = useMemo(() => generateHeroAsteroids(7021), []);
  const maxInstancesPerTexture = useMemo(() => Math.ceil(maxCount / 3) + 32, [maxCount]);

  const activeAsteroids = useMemo(
    () => asteroids.slice(0, Math.min(lod.count, asteroids.length)),
    [asteroids, lod.count],
  );

  const asteroidsByTexture = useMemo(() => {
    const buckets: AsteroidDef[][] = [[], [], []];
    activeAsteroids.forEach((asteroid) => {
      buckets[asteroid.textureIndex % 3].push(asteroid);
    });
    return buckets;
  }, [activeAsteroids]);

  useEffect(() => {
    let active = true;
    const base = `/solar-textures/${textureQuality === "high" ? "high" : "perf"}/`;
    Promise.all(TEXTURE_KEYS.map((key) => loadTexture(`${base}${key}`))).then((loaded) => {
      if (active) setTextures(loaded);
    });
    return () => {
      active = false;
    };
  }, [textureQuality]);

  useFrame(() => {
    if (mode === "off") return;
    asteroidsByTexture.forEach((bucket, index) => {
      const mesh = meshRefs.current[index];
      if (!mesh) return;
      bucket.forEach((asteroid, i) => {
        const angle = (timeDays / asteroid.orbitalPeriodDays) * Math.PI * 2 + asteroid.angleOffset;
        const distance = scaleDistanceAu(asteroid.radiusAu, scaleMode);
        const x = Math.cos(angle) * distance;
        const z = Math.sin(angle) * distance;
        tempObject.position.set(x, asteroid.heightOffset + Math.sin(angle + asteroid.angleOffset) * 0.08, z);
        tempObject.rotation.set(
          asteroid.rotation[0],
          asteroid.rotation[1] + timeDays * asteroid.spinSpeed,
          asteroid.rotation[2],
        );
        const scale = asteroid.size * lod.sizeBoost * (lod.nearBelt ? 1.1 : 1.0);
        tempObject.scale.set(scale, scale, scale);
        tempObject.updateMatrix();
        tempMatrix.copy(tempObject.matrix);
        mesh.setMatrixAt(i, tempMatrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.count = bucket.length;
      const material = mesh.material;
      if ("opacity" in material) {
        material.opacity = lod.opacity;
      }
    });

    if (heroRef.current && lod.nearBelt) {
      heroAsteroids.forEach((asteroid, i) => {
        const angle = (timeDays / asteroid.orbitalPeriodDays) * Math.PI * 2 + asteroid.angleOffset;
        const distance = scaleDistanceAu(asteroid.radiusAu, scaleMode);
        const x = Math.cos(angle) * distance;
        const z = Math.sin(angle) * distance;
        tempObject.position.set(x, asteroid.heightOffset * 1.3, z);
        tempObject.rotation.set(
          asteroid.rotation[0],
          asteroid.rotation[1] + timeDays * asteroid.spinSpeed,
          asteroid.rotation[2],
        );
        const scale = asteroid.size * 1.3;
        tempObject.scale.set(scale, scale, scale);
        tempObject.updateMatrix();
        tempMatrix.copy(tempObject.matrix);
        heroRef.current?.setMatrixAt(i, tempMatrix);
      });
      heroRef.current.instanceMatrix.needsUpdate = true;
      heroRef.current.count = heroAsteroids.length;
    } else if (heroRef.current) {
      heroRef.current.count = 0;
    }
  });

  if (mode === "off" || lod.count === 0) {
    return null;
  }

  return (
    <group>
      {asteroidsByTexture.map((bucket, index) => (
        <instancedMesh
          key={`belt-${index}`}
          ref={(node) => {
            meshRefs.current[index] = node;
          }}
          args={[undefined, undefined, maxInstancesPerTexture]}
          frustumCulled
        >
          <icosahedronGeometry args={[0.1, 0]} />
          <meshStandardMaterial
            map={textures[index] ?? undefined}
            color={new Color("#8b8b8b")}
            roughness={0.9}
            metalness={0.05}
            transparent
            opacity={lod.opacity}
          />
        </instancedMesh>
      ))}
      <instancedMesh ref={heroRef} args={[undefined, undefined, heroAsteroids.length]} frustumCulled>
        <dodecahedronGeometry args={[0.2, 0]} />
        <meshStandardMaterial color="#a28f7f" roughness={0.8} metalness={0.08} transparent opacity={lod.opacity + 0.1} />
      </instancedMesh>
    </group>
  );
};

export default AsteroidBelt;
