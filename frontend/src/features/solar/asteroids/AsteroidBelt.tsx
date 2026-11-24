import { FC, useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, Matrix4, Object3D, Texture, type InstancedMesh } from "three";
import { generateAsteroidField, generateHeroAsteroids, type AsteroidDef, type AsteroidBeltMode } from "./asteroidGenerator";
import { getAsteroidModeBudget, useAsteroidLOD } from "./useAsteroidLOD";
import type { SolarScaleMode } from "../solarData";
import type { TextureQuality } from "../textures/textureCatalog";
import { scaleDistanceAu } from "../solarScale";
import { loadSolarTextureAsset } from "../textures/loadSolarTextureAsset";

interface AsteroidBeltProps {
  timeDays: number;
  scaleMode: SolarScaleMode;
  mode: AsteroidBeltMode;
  textureQuality: TextureQuality;
  asteroidBudget: number;
}

const TEXTURE_KEYS = ["2k_mercury.jpg", "2k_mars.jpg", "moon_1024.jpg"];
const TWO_PI = Math.PI * 2;

const loadTexture = async (path: string): Promise<Texture | null> => {
  return loadSolarTextureAsset(path, { anisotropy: 2 });
};

const solveAsteroidPosition = (asteroid: AsteroidDef, timeDays: number, scaleMode: SolarScaleMode) => {
  const meanAnomaly = ((timeDays / asteroid.orbitalPeriodDays) * TWO_PI + asteroid.meanAnomalyOffset) % TWO_PI;
  let eccentricAnomaly = meanAnomaly;
  for (let index = 0; index < 5; index += 1) {
    eccentricAnomaly -=
      (eccentricAnomaly - asteroid.eccentricity * Math.sin(eccentricAnomaly) - meanAnomaly) /
      (1 - asteroid.eccentricity * Math.cos(eccentricAnomaly));
  }

  const trueAnomaly =
    2 *
    Math.atan2(
      Math.sqrt(1 + asteroid.eccentricity) * Math.sin(eccentricAnomaly / 2),
      Math.sqrt(1 - asteroid.eccentricity) * Math.cos(eccentricAnomaly / 2),
    );
  const radiusAu = asteroid.semiMajorAxisAu * (1 - asteroid.eccentricity * Math.cos(eccentricAnomaly));
  const inclination = (asteroid.inclinationDeg * Math.PI) / 180;
  const latitude = asteroid.argumentOfPeriapsisRad + trueAnomaly;
  const cosNode = Math.cos(asteroid.longitudeOfAscendingNodeRad);
  const sinNode = Math.sin(asteroid.longitudeOfAscendingNodeRad);
  const cosLat = Math.cos(latitude);
  const sinLat = Math.sin(latitude);
  const cosInc = Math.cos(inclination);
  const sinInc = Math.sin(inclination);

  const auX = radiusAu * (cosNode * cosLat - sinNode * sinLat * cosInc);
  const auY = radiusAu * (sinNode * cosLat + cosNode * sinLat * cosInc);
  const auZ = radiusAu * (sinLat * sinInc);
  const scaledDistance = scaleDistanceAu(Math.hypot(auX, auY, auZ), scaleMode);
  const factor = scaledDistance / Math.max(radiusAu, 0.0001);

  return {
    x: auX * factor,
    y: auZ * factor + asteroid.heightOffset + Math.sin(trueAnomaly * 2 + asteroid.angleOffset) * 0.08,
    z: auY * factor,
    trueAnomaly,
  };
};

const AsteroidBelt: FC<AsteroidBeltProps> = ({ timeDays, scaleMode, mode, textureQuality, asteroidBudget }) => {
  const [textures, setTextures] = useState<(Texture | null)[]>([]);
  const meshRefs = useRef<Array<InstancedMesh | null>>([]);
  const heroRef = useRef<InstancedMesh | null>(null);
  const tempObject = useMemo(() => new Object3D(), []);
  const tempMatrix = useMemo(() => new Matrix4(), []);
  const lastMatrixSignatureRef = useRef("");

  const lod = useAsteroidLOD({
    mode,
    scaleMode,
    asteroidBudget,
  });

  const maxCount = getAsteroidModeBudget(mode, asteroidBudget);

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
    if (mode === "off") {
      setTextures([]);
      return () => {
        active = false;
      };
    }
    const base = `/solar-textures/${textureQuality === "high" ? "high" : "perf"}/`;
    Promise.all(TEXTURE_KEYS.map((key) => loadTexture(`${base}${key}`))).then((loaded) => {
      if (active) setTextures(loaded);
    });
    return () => {
      active = false;
    };
  }, [mode, textureQuality]);

  useFrame(() => {
    if (mode === "off") return;
    const matrixSignature = [
      timeDays.toFixed(3),
      scaleMode,
      lod.count,
      lod.opacity.toFixed(3),
      lod.sizeBoost.toFixed(3),
      lod.nearBelt ? "near" : "far",
    ].join("|");
    if (matrixSignature === lastMatrixSignatureRef.current) return;
    lastMatrixSignatureRef.current = matrixSignature;

    asteroidsByTexture.forEach((bucket, index) => {
      const mesh = meshRefs.current[index];
      if (!mesh) return;
      bucket.forEach((asteroid, i) => {
        const position = solveAsteroidPosition(asteroid, timeDays, scaleMode);
        tempObject.position.set(position.x, position.y, position.z);
        tempObject.rotation.set(
          asteroid.rotation[0] + position.trueAnomaly * 0.12,
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
        const position = solveAsteroidPosition(asteroid, timeDays, scaleMode);
        tempObject.position.set(position.x, position.y + asteroid.heightOffset * 0.35, position.z);
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
            color={new Color(index === 1 ? "#9a7f68" : "#8b8b8b")}
            emissive={new Color(index === 1 ? "#2a1b11" : "#181818")}
            emissiveIntensity={0.12}
            roughness={0.9}
            metalness={0.05}
            transparent
            opacity={lod.opacity}
          />
        </instancedMesh>
      ))}
      <instancedMesh ref={heroRef} args={[undefined, undefined, heroAsteroids.length]} frustumCulled>
        <dodecahedronGeometry args={[0.2, 0]} />
        <meshStandardMaterial
          color="#b29a82"
          emissive="#302014"
          emissiveIntensity={0.16}
          roughness={0.82}
          metalness={0.08}
          transparent
          opacity={lod.opacity + 0.08}
        />
      </instancedMesh>
    </group>
  );
};

export default AsteroidBelt;
