import { FC, useMemo } from "react";
import { Color, Vector3, type Intersection, type Object3D, type Raycaster, type Texture } from "three";
import { IAU_NOMINAL_SOLAR_RADIUS_KM, SOLAR_AU_KM, type SolarRingSystem } from "../../../domain/solar";
import { createRingShaderProfile, RING_PROFILE_GLSL } from "./ringShaderProfile";

interface PlanetRingSurfaceShadowProps {
  radius: number;
  planetRadiusKm: number;
  distanceAu: number;
  segments: number;
  ringSystem: SolarRingSystem;
  ringTexture?: Texture;
  sunDirectionBody: [number, number, number];
}

const ignoreRaycast = (_raycaster: Raycaster, _intersections: Intersection<Object3D>[]) => undefined;

const VERTEX_SHADER = `
  varying vec3 vBodyPosition;
  varying vec3 vBodyNormal;

  void main() {
    vBodyPosition = position;
    vBodyNormal = normal;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  uniform float planetRadius;
  uniform float sunAngularRadius;
  uniform vec3 sunDirectionBody;
  uniform vec3 shadowColor;
  ${RING_PROFILE_GLSL}
  varying vec3 vBodyPosition;
  varying vec3 vBodyNormal;

  void main() {
    vec3 pointBodyRadii = vBodyPosition / planetRadius;
    vec3 normalBody = normalize(vBodyNormal);
    vec3 toSun = normalize(sunDirectionBody);
    float daylight = smoothstep(0.0, 0.12, dot(normalBody, toSun));
    if (daylight <= 0.001 || abs(toSun.y) <= 0.00001) discard;

    float rayDistance = -pointBodyRadii.y / toSun.y;
    if (rayDistance <= 0.0) discard;
    vec3 ringIntercept = pointBodyRadii + toSun * rayDistance;
    float ringRadius = length(ringIntercept.xz);
    if (ringRadius < innerRadius || ringRadius > outerRadius) discard;

    // The Sun is finite. Five radial samples approximate the fraction of the
    // solar disc filtered by ring material without coupling this layer to scene scale.
    float blurRadius = max(abs(rayDistance) * tan(sunAngularRadius), (outerRadius - innerRadius) / 2048.0);
    float opacity = sampleRingOpacity(ringRadius) * 0.36;
    opacity += sampleRingOpacity(ringRadius - blurRadius) * 0.12;
    opacity += sampleRingOpacity(ringRadius + blurRadius) * 0.12;
    opacity += sampleRingOpacity(ringRadius - blurRadius * 0.5) * 0.20;
    opacity += sampleRingOpacity(ringRadius + blurRadius * 0.5) * 0.20;

    // Convert normal-incidence opacity to a longer slant path through the ring plane.
    float incidence = max(abs(toSun.y), 0.04);
    float transmission = pow(max(1.0 - clamp(opacity, 0.0, 0.999), 0.001), 1.0 / incidence);
    float shadow = (1.0 - transmission) * daylight;
    if (shadow < 0.008) discard;

    gl_FragColor = vec4(shadowColor, shadow * 0.82);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const PlanetRingSurfaceShadow: FC<PlanetRingSurfaceShadowProps> = ({
  radius,
  planetRadiusKm,
  distanceAu,
  segments,
  ringSystem,
  ringTexture,
  sunDirectionBody,
}) => {
  const profile = useMemo(
    () => createRingShaderProfile(ringSystem, planetRadiusKm),
    [planetRadiusKm, ringSystem],
  );
  const sunAngularRadius = Math.asin(
    Math.min(IAU_NOMINAL_SOLAR_RADIUS_KM / Math.max(distanceAu * SOLAR_AU_KM, IAU_NOMINAL_SOLAR_RADIUS_KM), 1),
  );
  const uniforms = useMemo(
    () => ({
      planetRadius: { value: radius },
      sunAngularRadius: { value: sunAngularRadius },
      sunDirectionBody: { value: new Vector3(...sunDirectionBody).normalize() },
      shadowColor: { value: new Color("#020711") },
      ringMap: { value: ringTexture ?? null },
      hasRingMap: { value: Boolean(ringTexture) },
      ringBandCount: { value: profile.bandCount },
      ringBandCenters: { value: profile.bandCenters },
      ringBandHalfWidths: { value: profile.bandHalfWidths },
      ringBandOpacities: { value: profile.bandOpacities },
      innerRadius: { value: profile.innerRadiusBodyRadii },
      outerRadius: { value: profile.outerRadiusBodyRadii },
    }),
    [profile, radius, ringTexture, sunAngularRadius, sunDirectionBody],
  );

  return (
    <mesh renderOrder={2.25} raycast={ignoreRaycast}>
      <sphereGeometry args={[radius * 1.003, segments, segments]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={VERTEX_SHADER}
        fragmentShader={FRAGMENT_SHADER}
        transparent
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-1}
      />
    </mesh>
  );
};

export default PlanetRingSurfaceShadow;
