import { FC, useMemo } from "react";
import { Color, Vector3, type Intersection, type Object3D, type Raycaster } from "three";
import type { SolarSurfaceEclipseOccluder } from "./solarEclipseModel";

interface PlanetEclipseShadowsProps {
  radius: number;
  segments: number;
  occluders: SolarSurfaceEclipseOccluder[];
}

const ignoreRaycast = (_raycaster: Raycaster, _intersections: Intersection<Object3D>[]) => undefined;

const VERTEX_SHADER = `
  varying vec3 vSurfaceDirection;

  void main() {
    vSurfaceDirection = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  uniform vec3 sunPositionTargetRadii;
  uniform float sunRadiusTargetRadii;
  uniform vec3 occluderPositionTargetRadii;
  uniform float occluderRadiusTargetRadii;
  uniform vec3 shadowColor;
  varying vec3 vSurfaceDirection;

  float diskOverlapFraction(float sunRadius, float occluderRadius, float separation) {
    if (sunRadius <= 0.0 || occluderRadius <= 0.0 || separation >= sunRadius + occluderRadius) {
      return 0.0;
    }
    float sunArea = 3.141592653589793 * sunRadius * sunRadius;
    if (separation <= abs(sunRadius - occluderRadius)) {
      float overlapRadius = min(sunRadius, occluderRadius);
      return clamp((3.141592653589793 * overlapRadius * overlapRadius) / sunArea, 0.0, 1.0);
    }
    float separationSquared = separation * separation;
    float sunSquared = sunRadius * sunRadius;
    float occluderSquared = occluderRadius * occluderRadius;
    float sunSector = sunSquared * acos(clamp(
      (separationSquared + sunSquared - occluderSquared) / (2.0 * separation * sunRadius),
      -1.0,
      1.0
    ));
    float occluderSector = occluderSquared * acos(clamp(
      (separationSquared + occluderSquared - sunSquared) / (2.0 * separation * occluderRadius),
      -1.0,
      1.0
    ));
    float triangle = 0.5 * sqrt(max(
      0.0,
      (-separation + sunRadius + occluderRadius) *
      (separation + sunRadius - occluderRadius) *
      (separation - sunRadius + occluderRadius) *
      (separation + sunRadius + occluderRadius)
    ));
    return clamp((sunSector + occluderSector - triangle) / sunArea, 0.0, 1.0);
  }

  void main() {
    vec3 surfacePoint = normalize(vSurfaceDirection);
    vec3 toSun = sunPositionTargetRadii - surfacePoint;
    vec3 toOccluder = occluderPositionTargetRadii - surfacePoint;
    float sunDistance = length(toSun);
    float occluderDistance = length(toOccluder);
    if (
      sunDistance <= sunRadiusTargetRadii ||
      occluderDistance <= occluderRadiusTargetRadii ||
      occluderDistance >= sunDistance
    ) {
      discard;
    }
    float sunAngularRadius = asin(clamp(sunRadiusTargetRadii / sunDistance, 0.0, 1.0));
    float occluderAngularRadius = asin(clamp(occluderRadiusTargetRadii / occluderDistance, 0.0, 1.0));
    float separation = acos(clamp(dot(normalize(toSun), normalize(toOccluder)), -1.0, 1.0));
    float obscuration = diskOverlapFraction(sunAngularRadius, occluderAngularRadius, separation);
    float alpha = smoothstep(0.001, 0.98, obscuration) * 0.84;
    if (alpha < 0.002) discard;
    gl_FragColor = vec4(shadowColor, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const EclipseShadowLayer: FC<{
  radius: number;
  segments: number;
  occluder: SolarSurfaceEclipseOccluder;
}> = ({ radius, segments, occluder }) => {
  const uniforms = useMemo(
    () => ({
      sunPositionTargetRadii: {
        value: new Vector3(
          occluder.sunPositionTargetRadii.x,
          occluder.sunPositionTargetRadii.y,
          occluder.sunPositionTargetRadii.z,
        ),
      },
      sunRadiusTargetRadii: { value: occluder.sunRadiusTargetRadii },
      occluderPositionTargetRadii: {
        value: new Vector3(
          occluder.occluderPositionTargetRadii.x,
          occluder.occluderPositionTargetRadii.y,
          occluder.occluderPositionTargetRadii.z,
        ),
      },
      occluderRadiusTargetRadii: { value: occluder.occluderRadiusTargetRadii },
      shadowColor: { value: new Color("#05080d") },
    }),
    [
      occluder.occluderPositionTargetRadii.x,
      occluder.occluderPositionTargetRadii.y,
      occluder.occluderPositionTargetRadii.z,
      occluder.occluderRadiusTargetRadii,
      occluder.sunPositionTargetRadii.x,
      occluder.sunPositionTargetRadii.y,
      occluder.sunPositionTargetRadii.z,
      occluder.sunRadiusTargetRadii,
    ],
  );

  return (
    <mesh renderOrder={2.5} raycast={ignoreRaycast}>
      <sphereGeometry args={[radius * 1.004, segments, segments]} />
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

const PlanetEclipseShadows: FC<PlanetEclipseShadowsProps> = ({ radius, segments, occluders }) => (
  <>
    {occluders.map((occluder) => (
      <EclipseShadowLayer
        key={occluder.occluderId}
        radius={radius}
        segments={segments}
        occluder={occluder}
      />
    ))}
  </>
);

export default PlanetEclipseShadows;
