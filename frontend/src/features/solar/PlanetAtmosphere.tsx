import { FC, useMemo } from "react";
import { AdditiveBlending, BackSide, Color, Vector3 } from "three";
import {
  getAtmosphereOpticalDepthTexture,
  type AtmosphereScatteringProfile,
} from "./atmosphere/atmosphereScatteringModel";

interface PlanetAtmosphereProps {
  radius: number;
  shellScale: number;
  color: string;
  opacity: number;
  falloff: number;
  segments: number;
  sunAware?: boolean;
  scatteringProfile?: AtmosphereScatteringProfile | null;
  bottomRadiusKm?: number;
  lutWidth?: number;
  lutHeight?: number;
}

const VERTEX_SHADER = `
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const FRAGMENT_SHADER = `
  uniform vec3 atmosphereColor;
  uniform float atmosphereOpacity;
  uniform float atmosphereFalloff;
  uniform float sunlightMix;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  void main() {
    vec3 normalDirection = normalize(vWorldNormal);
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    vec3 sunDirection = normalize(-vWorldPosition);
    float facing = abs(dot(normalDirection, viewDirection));
    float limb = pow(max(0.0, 1.0 - facing), atmosphereFalloff);
    float sunlitAmount = 0.18 + 0.82 * smoothstep(-0.35, 0.75, dot(normalDirection, sunDirection));
    float daylight = mix(1.0, sunlitAmount, sunlightMix);
    float alpha = atmosphereOpacity * limb * daylight;
    if (alpha < 0.002) discard;
    gl_FragColor = vec4(atmosphereColor * (0.72 + daylight * 0.4), alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const LUT_FRAGMENT_SHADER = `
  uniform sampler2D atmosphereLut;
  uniform vec3 atmosphereColor;
  uniform vec3 rayleighRatio;
  uniform float atmosphereOpacity;
  uniform float atmosphereFalloff;
  uniform float atmosphereExposure;
  uniform float miePhaseG;
  uniform float mieSingleScatteringAlbedo;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  const float PI = 3.141592653589793;

  void main() {
    vec3 normalDirection = normalize(vWorldNormal);
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    vec3 sunDirection = normalize(-vWorldPosition);
    float facing = clamp(abs(dot(normalDirection, viewDirection)), 0.001, 1.0);
    float sunCosine = clamp(dot(normalDirection, sunDirection), -1.0, 1.0);
    vec4 encodedDepth = texture2D(atmosphereLut, vec2(facing, sunCosine * 0.5 + 0.5));
    vec4 opticalDepth = -log(max(vec4(0.0001), vec4(1.0) - encodedDepth));

    vec3 sunTransmittance = exp(-(opticalDepth.b * rayleighRatio + vec3(opticalDepth.a)));
    vec3 molecularScatter = vec3(1.0) - exp(-opticalDepth.r * rayleighRatio);
    float aerosolScatter = (1.0 - exp(-opticalDepth.g)) * mieSingleScatteringAlbedo;
    float phaseCosine = clamp(dot(viewDirection, sunDirection), -1.0, 1.0);
    float rayleighPhase = (3.0 / (16.0 * PI)) * (1.0 + phaseCosine * phaseCosine);
    float g2 = miePhaseG * miePhaseG;
    float mieDenominator = max(0.001, 1.0 + g2 - 2.0 * miePhaseG * phaseCosine);
    float miePhase = (1.0 - g2) / (4.0 * PI * pow(mieDenominator, 1.5));
    vec3 tintedMolecular = molecularScatter * mix(vec3(1.0), atmosphereColor, 0.28);
    vec3 radiance = sunTransmittance *
      (tintedMolecular * rayleighPhase + atmosphereColor * aerosolScatter * miePhase * 1.6);

    float energy = max(radiance.r, max(radiance.g, radiance.b));
    float mappedEnergy = 1.0 - exp(-energy * atmosphereExposure * 5.0);
    float daylight = max(sunTransmittance.r, max(sunTransmittance.g, sunTransmittance.b));
    float limb = pow(max(0.0, 1.0 - facing), max(0.75, atmosphereFalloff * 0.55));
    float alpha = atmosphereOpacity * limb * (0.1 + 0.9 * daylight) * (0.45 + 1.55 * mappedEnergy);
    if (alpha < 0.002) discard;
    vec3 displayColor = atmosphereColor * 0.18 + radiance * atmosphereExposure * 3.0;
    gl_FragColor = vec4(displayColor, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const PlanetAtmosphere: FC<PlanetAtmosphereProps> = ({
  radius,
  shellScale,
  color,
  opacity,
  falloff,
  segments,
  sunAware = true,
  scatteringProfile = null,
  bottomRadiusKm = 0,
  lutWidth = 64,
  lutHeight = 32,
}) => {
  const atmosphereLut = useMemo(
    () =>
      scatteringProfile && bottomRadiusKm > 0
        ? getAtmosphereOpticalDepthTexture({
            profile: scatteringProfile,
            bottomRadiusKm,
            width: lutWidth,
            height: lutHeight,
          })
        : null,
    [bottomRadiusKm, lutHeight, lutWidth, scatteringProfile],
  );
  const uniforms = useMemo(
    () => {
      const rayleigh = scatteringProfile?.rayleighScatteringPerKm;
      const blue = rayleigh?.[2] ?? 1;
      return {
        atmosphereLut: { value: atmosphereLut },
        atmosphereColor: { value: new Color(color) },
        atmosphereOpacity: { value: opacity },
        atmosphereFalloff: { value: falloff },
        atmosphereExposure: { value: scatteringProfile?.rendererExposure ?? 1 },
        miePhaseG: { value: scatteringProfile?.miePhaseG ?? 0.8 },
        mieSingleScatteringAlbedo: {
          value:
            scatteringProfile && scatteringProfile.mieExtinctionPerKm > 0
              ? scatteringProfile.mieScatteringPerKm / scatteringProfile.mieExtinctionPerKm
              : 0,
        },
        rayleighRatio: {
          value: new Vector3((rayleigh?.[0] ?? blue) / blue, (rayleigh?.[1] ?? blue) / blue, 1),
        },
        sunlightMix: { value: sunAware ? 1 : 0 },
      };
    },
    [atmosphereLut, color, falloff, opacity, scatteringProfile, sunAware],
  );

  return (
    <mesh renderOrder={3}>
      <sphereGeometry args={[radius * shellScale, segments, segments]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={VERTEX_SHADER}
        fragmentShader={atmosphereLut ? LUT_FRAGMENT_SHADER : FRAGMENT_SHADER}
        side={BackSide}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
      />
    </mesh>
  );
};

export default PlanetAtmosphere;
