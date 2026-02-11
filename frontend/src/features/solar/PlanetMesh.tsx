import { FC, useEffect, useMemo, useRef, useState } from "react";
import { Html, useCursor } from "@react-three/drei";
import {
  AdditiveBlending,
  BackSide,
  DoubleSide,
  MathUtils,
  Quaternion,
  ShaderMaterial,
  Vector3,
  type Group,
  type Mesh,
} from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type { PlanetDef } from "./solarData";
import { loadPlanetTexture, type PlanetTextureAssets } from "./textures/loadPlanetTexture";
import type { TextureQuality } from "./textures/textureCatalog";

interface PlanetMeshProps {
  planet: PlanetDef;
  position: [number, number, number];
  radius: number;
  selected?: boolean;
  textureQuality: TextureQuality;
  nearThreshold: number;
  timeScale: number;
  onSelect: (planet: PlanetDef) => void;
  onFocus: (planet: PlanetDef) => void;
}

const GAS_GIANTS = new Set(["jupiter", "saturn", "uranus", "neptune"]);

const PlanetMesh: FC<PlanetMeshProps> = ({
  planet,
  position,
  radius,
  selected,
  textureQuality,
  nearThreshold,
  timeScale,
  onSelect,
  onFocus,
}) => {
  const [hovered, setHovered] = useState(false);
  const [lodLevel, setLodLevel] = useState<"far" | "mid" | "near">("far");
  const [textures, setTextures] = useState<PlanetTextureAssets | null>(null);
  const [lowTextures, setLowTextures] = useState<PlanetTextureAssets | null>(null);
  const groupRef = useRef<Group | null>(null);
  const spinGroupRef = useRef<Group | null>(null);
  const cloudsRef = useRef<Mesh | null>(null);
  const ringRef = useRef<Mesh | null>(null);
  const noiseRef = useRef<Mesh | null>(null);
  const distanceClock = useRef(0);
  const tempVec = useMemo(() => new Vector3(), []);
  const tempQuat = useMemo(() => new Quaternion(), []);
  const sunDir = useMemo(() => new Vector3(), []);
  const { camera } = useThree();

  useCursor(hovered);

  const rotationScaleFactor = 360;
  const rotationPeriodHours = planet.rotationPeriodHours ?? 24;
  const rotationDirection = planet.rotationDirection ?? 1;
  const timeScaleFactor = MathUtils.clamp(timeScale || 1, 1, 200);
  const rotationSpeed =
    ((rotationDirection * Math.PI * 2 * rotationScaleFactor) / (rotationPeriodHours * 3600)) *
    timeScaleFactor;
  const isGas = GAS_GIANTS.has(planet.id);
  const roughness = isGas ? 0.45 : 0.85;
  const metalness = isGas ? 0.2 : 0.05;
  const emissiveIntensity = selected ? 0.35 : planet.id === "jupiter" ? 0.18 : 0.0;

  const desiredQuality = textureQuality === "high" && lodLevel !== "far" ? "high" : "performance";
  const displayTextures =
    desiredQuality === "high" ? textures ?? lowTextures ?? null : lowTextures ?? textures ?? null;
  const detailEnabled = lodLevel !== "far";
  const isEarth = planet.id === "earth";
  const isGasGiant = GAS_GIANTS.has(planet.id);

  const nightMaterial = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          nightMap: { value: null },
          sunDir: { value: new Vector3(1, 0, 0) },
          intensity: { value: 1.0 },
        },
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        vertexShader: `
          varying vec2 vUv;
          varying vec3 vNormal;
          void main() {
            vUv = uv;
            vNormal = normal;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform sampler2D nightMap;
          uniform vec3 sunDir;
          uniform float intensity;
          varying vec2 vUv;
          varying vec3 vNormal;
          void main() {
            vec3 n = normalize(vNormal);
            float ndl = max(dot(n, normalize(sunDir)), 0.0);
            float night = smoothstep(0.0, 0.25, 1.0 - ndl);
            vec4 tex = texture2D(nightMap, vUv);
            float alpha = tex.a * night * intensity;
            if (alpha < 0.01) discard;
            gl_FragColor = vec4(tex.rgb * night * intensity, alpha);
          }
        `,
      }),
    [],
  );

  useEffect(() => {
    let active = true;
    loadPlanetTexture(planet.id, "performance").then((result) => {
      if (active) setLowTextures(result);
    });
    return () => {
      active = false;
    };
  }, [planet.id]);

  useEffect(() => {
    let active = true;
    loadPlanetTexture(planet.id, desiredQuality).then((result) => {
      if (active) setTextures(result);
    });
    return () => {
      active = false;
    };
  }, [planet.id, desiredQuality]);

  useEffect(() => {
    nightMaterial.uniforms.nightMap.value = displayTextures?.night ?? null;
    nightMaterial.uniforms.intensity.value = 0.9;
    nightMaterial.needsUpdate = true;
  }, [displayTextures?.night, nightMaterial]);

  useFrame((_, delta) => {
    if (spinGroupRef.current) {
      spinGroupRef.current.rotation.y += rotationSpeed * delta;
    }
    if (cloudsRef.current) {
      cloudsRef.current.rotation.y += rotationSpeed * 0.35 * delta;
    }
    if (noiseRef.current) {
      noiseRef.current.rotation.y += rotationSpeed * 0.12 * delta;
    }
    if (ringRef.current) {
      ringRef.current.rotation.z += rotationSpeed * 0.05 * delta;
    }
    if (!groupRef.current) return;

    distanceClock.current += delta;
    if (distanceClock.current > 0.35) {
      const distance = camera.position.distanceTo(groupRef.current.getWorldPosition(tempVec));
      const threshold = selected ? nearThreshold * 1.15 : nearThreshold;
      const midThreshold = threshold * 1.8;
      const nextLod = distance < threshold ? "near" : distance < midThreshold ? "mid" : "far";
      if (nextLod !== lodLevel) {
        setLodLevel(nextLod);
      }
      distanceClock.current = 0;
    }

    if (groupRef.current && displayTextures?.night) {
      const worldPos = groupRef.current.getWorldPosition(tempVec);
      sunDir.copy(worldPos).multiplyScalar(-1).normalize();
      if (spinGroupRef.current) {
        const worldQuat = spinGroupRef.current.getWorldQuaternion(tempQuat);
        sunDir.applyQuaternion(worldQuat.invert());
      }
      nightMaterial.uniforms.sunDir.value.copy(sunDir);
    }
  });

  return (
    <group position={position} ref={groupRef}>
      {selected && (
        <mesh>
          <sphereGeometry args={[radius * 1.2, 24, 24]} />
          <meshBasicMaterial color="#7affd6" transparent opacity={0.25} />
        </mesh>
      )}

      <group rotation={[0, 0, MathUtils.degToRad(planet.axialTiltDeg ?? 0)]}>
        {planet.ringSystem && (
          <>
            <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]} renderOrder={2}>
              <ringGeometry args={[radius * 1.25, radius * 2.15, 128]} />
              <meshStandardMaterial
                map={displayTextures?.ring}
                alphaMap={displayTextures?.ring}
                color={displayTextures?.ring ? "#ffffff" : "#d7c08b"}
                transparent
                opacity={displayTextures?.ring ? 0.82 : 0.4}
                side={DoubleSide}
                roughness={0.7}
                metalness={0.05}
                depthWrite={false}
              />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]} renderOrder={1}>
              <ringGeometry args={[radius * 1.55, radius * 1.72, 96]} />
              <meshBasicMaterial
                color="#3b2b1a"
                transparent
                opacity={0.18}
                depthWrite={false}
                side={DoubleSide}
              />
            </mesh>
          </>
        )}

        <group ref={spinGroupRef}>
          <mesh
            onPointerOver={() => setHovered(true)}
            onPointerOut={() => setHovered(false)}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(planet);
            }}
            onDoubleClick={(event) => {
              event.stopPropagation();
              onFocus(planet);
            }}
            castShadow
            receiveShadow
          >
            <sphereGeometry args={[radius, 48, 48]} />
            {isEarth ? (
              <meshPhongMaterial
                map={displayTextures?.diffuse}
                specularMap={displayTextures?.specular}
                specular="#9bd1ff"
                shininess={22}
                color={displayTextures?.diffuse ? "#ffffff" : planet.colorHint ?? "#b0b7c6"}
                emissive={selected ? "#2a7a6a" : "#000000"}
                emissiveIntensity={selected ? 0.2 : 0.0}
              />
            ) : (
              <meshStandardMaterial
                map={displayTextures?.diffuse}
                color={displayTextures?.diffuse ? "#ffffff" : planet.colorHint ?? "#b0b7c6"}
                roughness={roughness}
                metalness={metalness}
                emissive={planet.id === "jupiter" || selected ? "#2a7a6a" : "#000000"}
                emissiveIntensity={emissiveIntensity}
              />
            )}
          </mesh>

          {displayTextures?.clouds && isEarth && detailEnabled && (
            <mesh ref={cloudsRef}>
              <sphereGeometry args={[radius * 1.01, 48, 48]} />
              <meshStandardMaterial
                map={displayTextures.clouds}
                transparent
                opacity={0.42}
                depthWrite={false}
                roughness={0.7}
                metalness={0}
              />
            </mesh>
          )}

          {displayTextures?.night && isEarth && detailEnabled && (
            <mesh>
              <sphereGeometry args={[radius * 1.002, 48, 48]} />
              <primitive object={nightMaterial} attach="material" />
            </mesh>
          )}

          {displayTextures?.noise && isGasGiant && detailEnabled && (
            <mesh ref={noiseRef}>
              <sphereGeometry args={[radius * 1.008, 48, 48]} />
              <meshStandardMaterial
                map={displayTextures.noise}
                transparent
                opacity={0.08}
                depthWrite={false}
                blending={AdditiveBlending}
                roughness={0.4}
                metalness={0.2}
              />
            </mesh>
          )}

          {displayTextures?.atmosphereColor && (
            <mesh>
              <sphereGeometry args={[radius * (isEarth ? 1.08 : planet.id === "venus" ? 1.12 : 1.06), 32, 32]} />
              <meshBasicMaterial
                color={displayTextures.atmosphereColor}
                transparent
                opacity={
                  planet.id === "venus"
                    ? 0.32
                    : planet.id === "earth"
                      ? 0.22
                      : planet.id === "mars"
                        ? 0.08
                        : planet.id === "neptune"
                          ? 0.22
                          : 0.16
                }
                side={BackSide}
                blending={AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
          )}
        </group>
      </group>

      {hovered && (
        <Html position={[0, radius * 1.4, 0]} center distanceFactor={12} style={{ pointerEvents: "none" }}>
          <div className="solar-planet-label">{planet.name}</div>
        </Html>
      )}
    </group>
  );
};

export default PlanetMesh;
