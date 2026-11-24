import { FC, useEffect, useMemo, useRef, useState } from "react";
import { Html, useCursor } from "@react-three/drei";
import {
  AdditiveBlending,
  MathUtils,
  Matrix4,
  Quaternion,
  ShaderMaterial,
  Vector3,
  type Group,
} from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type { PlanetDef } from "./solarData";
import { getSolarBodyOrientation, getSolarRingSystem } from "../../domain/solar";
import { loadPlanetTexture, type PlanetTextureAssets } from "./textures/loadPlanetTexture";
import type { TextureQuality } from "./textures/textureCatalog";
import { PLANET_MATERIAL_PRESETS } from "./textures/planetMaterialPresets";
import { shouldRequestPlanetSurfaceTexture, type PlanetTextureLodLevel } from "./textures/planetTextureStreaming";
import PlanetAtmosphere from "./PlanetAtmosphere";
import { getAtmosphereScatteringProfile } from "./atmosphere/atmosphereScatteringModel";
import PlanetRing from "./PlanetRing";
import PlanetEclipseShadows from "./eclipse/PlanetEclipseShadows";
import type { PlanetEclipseOccluder } from "./eclipse/solarEclipseModel";
import PlanetRingSurfaceShadow from "./rings/PlanetRingSurfaceShadow";

interface PlanetMeshProps {
  planet: PlanetDef;
  position: [number, number, number];
  timeDays: number;
  radius: number;
  distanceAu: number;
  selected?: boolean;
  showOverviewLabel?: boolean;
  suppressLabel?: boolean;
  segments: number;
  atmosphereSegments: number;
  atmosphereLutWidth: number;
  atmosphereLutHeight: number;
  textureQuality: TextureQuality;
  nearThreshold: number;
  eclipseOccluders: PlanetEclipseOccluder[];
  eclipseShadowsEnabled: boolean;
  ringShadowsEnabled: boolean;
  onSelect: (planet: PlanetDef) => void;
  onFocus: (planet: PlanetDef) => void;
}

const GAS_GIANTS = new Set(["jupiter", "saturn", "uranus", "neptune"]);

const PlanetMesh: FC<PlanetMeshProps> = ({
  planet,
  position,
  timeDays,
  radius,
  distanceAu,
  selected,
  showOverviewLabel = false,
  suppressLabel = false,
  segments,
  atmosphereSegments,
  atmosphereLutWidth,
  atmosphereLutHeight,
  textureQuality,
  nearThreshold,
  eclipseOccluders,
  eclipseShadowsEnabled,
  ringShadowsEnabled,
  onSelect,
  onFocus,
}) => {
  const [hovered, setHovered] = useState(false);
  const [lodLevel, setLodLevel] = useState<PlanetTextureLodLevel>("far");
  const [textures, setTextures] = useState<PlanetTextureAssets | null>(null);
  const [lowTextures, setLowTextures] = useState<PlanetTextureAssets | null>(null);
  const groupRef = useRef<Group | null>(null);
  const bodyGroupRef = useRef<Group | null>(null);
  const distanceClock = useRef(0);
  const tempVec = useMemo(() => new Vector3(), []);
  const tempQuat = useMemo(() => new Quaternion(), []);
  const sunDir = useMemo(() => new Vector3(), []);
  const { camera } = useThree();

  useCursor(hovered);

  const orientation = useMemo(
    () => getSolarBodyOrientation(planet.id, { daysSinceEpoch: timeDays }),
    [planet.id, timeDays],
  );
  const bodyQuaternion = useMemo(() => {
    const { primeMeridianUnitVector: x, poleUnitVector: y, thirdAxisUnitVector: z } =
      orientation.sceneFrame;
    const rotationMatrix = new Matrix4().makeBasis(
      new Vector3(x.x, x.y, x.z),
      new Vector3(y.x, y.y, y.z),
      new Vector3(z.x, z.y, z.z),
    );
    return new Quaternion().setFromRotationMatrix(rotationMatrix);
  }, [orientation.sceneFrame]);
  const ringSystem = getSolarRingSystem(planet.id);
  const [positionX, positionY, positionZ] = position;
  const sunDirectionBody = useMemo(() => {
    const direction = new Vector3(-positionX, -positionY, -positionZ).normalize();
    direction.applyQuaternion(bodyQuaternion.clone().invert());
    return direction.toArray() as [number, number, number];
  }, [bodyQuaternion, positionX, positionY, positionZ]);
  // Cloud and band offsets are deterministic presentation layers. They remain
  // deliberately separate from the sourced body-fixed prime meridian.
  const cloudDriftRad = planet.id === "earth" ? (timeDays / 60) * Math.PI * 2 : 0;
  const detailDriftRad = GAS_GIANTS.has(planet.id) ? (timeDays / 120) * Math.PI * 2 : 0;
  const solarIrradiance = MathUtils.clamp(1 / Math.sqrt(Math.max(distanceAu, 0.18)), 0.16, 1.35);
  const materialPreset = PLANET_MATERIAL_PRESETS[planet.id];
  const scatteringProfile = getAtmosphereScatteringProfile(planet.id);
  const emissiveIntensity = selected ? 0.06 : 0;

  const desiredQuality = textureQuality === "high" && lodLevel !== "far" ? "high" : "performance";
  const shouldLoadSurfaceTexture = shouldRequestPlanetSurfaceTexture({
    selected: Boolean(selected),
    hovered,
    lodLevel,
  });
  const displayTextures =
    desiredQuality === "high" ? textures ?? lowTextures ?? null : lowTextures ?? textures ?? null;
  const detailEnabled = lodLevel !== "far";
  const isEarth = planet.id === "earth";
  const isGasGiant = GAS_GIANTS.has(planet.id);
  const labelVisible = !suppressLabel && (showOverviewLabel || hovered || selected || lodLevel === "near");
  const labelOpacity = hovered || selected ? 1 : showOverviewLabel ? 0.82 : lodLevel === "near" ? 0.72 : 0;
  const atmosphereColor =
    displayTextures?.atmosphereColor ?? materialPreset.atmosphere?.color ?? planet.colorHint ?? "#9bd1ff";
  const atmosphereOpacity = materialPreset.atmosphere
    ? materialPreset.atmosphere.opacity * (selected ? 1.35 : 0.78 + solarIrradiance * 0.22)
    : 0;

  const nightMaterial = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          nightMap: { value: displayTextures?.night ?? null },
          sunDir: { value: new Vector3(1, 0, 0) },
          intensity: { value: 0.9 },
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
    [displayTextures?.night],
  );

  useEffect(() => {
    if (!shouldLoadSurfaceTexture) return;
    let active = true;
    loadPlanetTexture(planet.id, "performance").then((result) => {
      if (active) setLowTextures(result);
    });
    return () => {
      active = false;
    };
  }, [planet.id, shouldLoadSurfaceTexture]);

  useEffect(() => {
    if (!shouldLoadSurfaceTexture || desiredQuality !== "high") return;
    let active = true;
    loadPlanetTexture(planet.id, desiredQuality).then((result) => {
      if (active) setTextures(result);
    });
    return () => {
      active = false;
    };
  }, [planet.id, desiredQuality, shouldLoadSurfaceTexture]);

  useEffect(() => () => nightMaterial.dispose(), [nightMaterial]);

  useFrame((_, delta) => {
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
      if (bodyGroupRef.current) {
        const worldQuat = bodyGroupRef.current.getWorldQuaternion(tempQuat);
        sunDir.applyQuaternion(worldQuat.invert());
      }
      nightMaterial.uniforms.sunDir.value.copy(sunDir);
    }
  });

  return (
    <group position={position} ref={groupRef}>
      {selected && !materialPreset.atmosphere ? (
        <PlanetAtmosphere
          radius={radius}
          shellScale={1.12}
          color="#7affd6"
          opacity={0.16}
          falloff={2.25}
          segments={atmosphereSegments}
          sunAware={false}
        />
      ) : null}

      <group ref={bodyGroupRef} quaternion={bodyQuaternion}>
        {planet.ringSystem && ringSystem ? (
          <PlanetRing
            radius={radius}
            planetRadiusKm={planet.radiusKm}
            distanceAu={distanceAu}
            ringSystem={ringSystem}
            texture={displayTextures?.ring}
            segments={Math.max(64, segments * 3)}
          />
        ) : null}

        <group>
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
            <sphereGeometry args={[radius, segments, segments]} />
            {isEarth ? (
              <meshPhongMaterial
                map={displayTextures?.diffuse}
                specularMap={displayTextures?.specular}
                specular="#9bd1ff"
                shininess={22}
                color={displayTextures?.diffuse ? "#ffffff" : planet.colorHint ?? "#b0b7c6"}
                emissive={selected ? "#2a7a6a" : "#000000"}
                emissiveIntensity={emissiveIntensity}
              />
            ) : (
              <meshStandardMaterial
                map={displayTextures?.diffuse}
                color={displayTextures?.diffuse ? "#ffffff" : planet.colorHint ?? "#b0b7c6"}
                roughness={materialPreset.roughness}
                metalness={materialPreset.metalness}
                emissive={selected ? "#2a7a6a" : "#000000"}
                emissiveIntensity={emissiveIntensity}
              />
            )}
          </mesh>

          {displayTextures?.clouds && isEarth && detailEnabled && (
            <mesh rotation={[0, cloudDriftRad, 0]}>
              <sphereGeometry args={[radius * 1.01, segments, segments]} />
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
              <sphereGeometry args={[radius * 1.002, segments, segments]} />
              <primitive object={nightMaterial} attach="material" />
            </mesh>
          )}

          {displayTextures?.noise && isGasGiant && detailEnabled && (
            <mesh rotation={[0, detailDriftRad, 0]}>
              <sphereGeometry args={[radius * 1.008, segments, segments]} />
              <meshStandardMaterial
                map={displayTextures.noise}
                transparent
                opacity={materialPreset.detailOverlayOpacity}
                depthWrite={false}
                blending={AdditiveBlending}
                roughness={0.4}
                metalness={0.2}
              />
            </mesh>
          )}

          {materialPreset.atmosphere && (
            <PlanetAtmosphere
              radius={radius}
              shellScale={materialPreset.atmosphere.shellScale}
              color={atmosphereColor}
              opacity={atmosphereOpacity}
              falloff={materialPreset.atmosphere.falloff}
              segments={atmosphereSegments}
              scatteringProfile={scatteringProfile}
              bottomRadiusKm={planet.radiusKm}
              lutWidth={atmosphereLutWidth}
              lutHeight={atmosphereLutHeight}
            />
          )}
        </group>

        {ringSystem && ringShadowsEnabled && (selected || lodLevel !== "far") ? (
          <PlanetRingSurfaceShadow
            radius={radius}
            planetRadiusKm={planet.radiusKm}
            distanceAu={distanceAu}
            segments={atmosphereSegments}
            ringSystem={ringSystem}
            ringTexture={displayTextures?.ring}
            sunDirectionBody={sunDirectionBody}
          />
        ) : null}
      </group>

      {eclipseShadowsEnabled && eclipseOccluders.length > 0 ? (
        <PlanetEclipseShadows
          radius={radius}
          segments={atmosphereSegments}
          occluders={eclipseOccluders}
        />
      ) : null}

      {labelVisible && (
        <Html
          position={[0, Math.max(radius * 1.55, 1.6), 0]}
          center
          distanceFactor={showOverviewLabel ? 150 : undefined}
          style={{ pointerEvents: "none", opacity: labelOpacity }}
        >
          <div className={`solar-planet-label ${showOverviewLabel ? "is-overview" : ""} ${selected ? "is-selected" : ""}`}>
            <strong>{planet.name}</strong>
            <span>{distanceAu.toFixed(2)} AU</span>
          </div>
        </Html>
      )}
    </group>
  );
};

export default PlanetMesh;
