import { FC, useMemo } from "react";
import { Color, DoubleSide, type Texture } from "three";
import { IAU_NOMINAL_SOLAR_RADIUS_KM, SOLAR_AU_KM, type SolarRingSystem } from "../../domain/solar";
import { createRingShaderProfile, RING_PROFILE_GLSL } from "./rings/ringShaderProfile";

interface PlanetRingProps {
  radius: number;
  planetRadiusKm: number;
  distanceAu: number;
  ringSystem: SolarRingSystem;
  texture?: Texture;
  segments: number;
}

const VERTEX_SHADER = `
  uniform float planetRadius;
  varying float vRingRadiusBodyRadii;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying vec3 vPlanetCenter;

  void main() {
    vRingRadiusBodyRadii = length(position.xy) / planetRadius;
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vPlanetCenter = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const FRAGMENT_SHADER = `
  uniform vec3 fallbackColor;
  uniform float planetRadius;
  uniform float sunAngularRadius;
  ${RING_PROFILE_GLSL}
  varying float vRingRadiusBodyRadii;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying vec3 vPlanetCenter;

  void main() {
    float ringCoordinate = clamp(
      (vRingRadiusBodyRadii - innerRadius) / max(outerRadius - innerRadius, 0.000001),
      0.0,
      1.0
    );
    float ringOpacity = sampleRingOpacity(vRingRadiusBodyRadii);
    vec4 texel = hasRingMap
      ? texture2D(ringMap, vec2(ringCoordinate, 0.5))
      : vec4(fallbackColor, ringOpacity);
    float alpha = hasRingMap ? ringOpacity * 0.86 : ringOpacity;
    if (alpha < 0.015) discard;

    vec3 toSun = normalize(-vWorldPosition);
    float distanceToSun = length(vWorldPosition);
    float projectedDistance = dot(vPlanetCenter - vWorldPosition, toSun);
    vec3 closestPoint = vWorldPosition + toSun * clamp(projectedDistance, 0.0, distanceToSun);
    float distanceToAxis = length(closestPoint - vPlanetCenter);
    float behindPlanet = step(0.0, projectedDistance) * step(projectedDistance, distanceToSun);
    float distanceToPlanet = length(vWorldPosition - vPlanetCenter);
    float penumbraWidth = max(distanceToPlanet * tan(sunAngularRadius), planetRadius * 0.002);
    float occlusion = behindPlanet * (
      1.0 - smoothstep(planetRadius - penumbraWidth, planetRadius + penumbraWidth, distanceToAxis)
    );
    float shadow = 1.0 - occlusion * 0.72;
    float directLight = 0.4 + 0.6 * abs(dot(normalize(vWorldNormal), toSun));

    gl_FragColor = vec4(texel.rgb * shadow * directLight, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const PlanetRing: FC<PlanetRingProps> = ({
  radius,
  planetRadiusKm,
  distanceAu,
  ringSystem,
  texture,
  segments,
}) => {
  const profile = useMemo(
    () => createRingShaderProfile(ringSystem, planetRadiusKm),
    [planetRadiusKm, ringSystem],
  );
  const innerRadius = radius * profile.innerRadiusBodyRadii;
  const outerRadius = radius * profile.outerRadiusBodyRadii;
  const sunAngularRadius = Math.asin(
    Math.min(IAU_NOMINAL_SOLAR_RADIUS_KM / Math.max(distanceAu * SOLAR_AU_KM, IAU_NOMINAL_SOLAR_RADIUS_KM), 1),
  );
  const uniforms = useMemo(
    () => ({
      ringMap: { value: texture ?? null },
      hasRingMap: { value: Boolean(texture) },
      fallbackColor: { value: new Color(ringSystem.planetId === "uranus" ? "#434951" : "#d7c08b") },
      planetRadius: { value: radius },
      sunAngularRadius: { value: sunAngularRadius },
      ringBandCount: { value: profile.bandCount },
      ringBandCenters: { value: profile.bandCenters },
      ringBandHalfWidths: { value: profile.bandHalfWidths },
      ringBandOpacities: { value: profile.bandOpacities },
      innerRadius: { value: profile.innerRadiusBodyRadii },
      outerRadius: { value: profile.outerRadiusBodyRadii },
    }),
    [profile, radius, ringSystem.planetId, sunAngularRadius, texture],
  );

  return (
    <mesh rotation={[Math.PI / 2, 0, 0]} renderOrder={2} receiveShadow>
      <ringGeometry args={[innerRadius, outerRadius, segments]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={VERTEX_SHADER}
        fragmentShader={FRAGMENT_SHADER}
        side={DoubleSide}
        transparent
        depthWrite={false}
      />
    </mesh>
  );
};

export default PlanetRing;
