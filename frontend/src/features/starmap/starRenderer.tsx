import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, MathUtils, ShaderMaterial } from "three";

export const SPACE_SCALE = 0.8;
const MIN_CORE_SIZE = 0.72;
const MIN_GLOW_SIZE = 0.22;
const MIN_OPACITY = 0.2;

export interface StarRenderDatum {
  objectId?: string;
  name: string;
  x: number;
  y: number;
  z: number;
  distanceLy: number;
  spectralType?: string;
  luminosity?: number;
  temperature?: number;
  apparentMagnitude?: number;
}

export const getStarRenderPosition = (star: StarRenderDatum, scale = SPACE_SCALE) => {
  return [star.x * scale, star.y * scale, star.z * scale] as [number, number, number];
};

const SPECTRAL_COLOR: Record<string, string> = {
  O: "#d9e7ff",
  B: "#e8efff",
  A: "#f4f7ff",
  F: "#fffaf2",
  G: "#fff3dc",
  K: "#ffdcb7",
  M: "#ffc3a3",
};

const colorFromTemperature = (temperature: number) => {
  const t = MathUtils.clamp(temperature, 2500, 28000);
  if (t >= 18000) return new Color("#dce8ff");
  if (t >= 11000) return new Color("#e6efff");
  if (t >= 8000) return new Color("#eef3ff");
  if (t >= 6800) return new Color("#f9fbff");
  if (t >= 5800) return new Color("#fff4df");
  if (t >= 5000) return new Color("#ffe4bf");
  if (t >= 4000) return new Color("#ffcda1");
  return new Color("#ffb38f");
};

export const getStarColor = (spectral: string, temperature?: number) => {
  const type = spectral.trim().charAt(0).toUpperCase();
  const spectralTint = new Color(SPECTRAL_COLOR[type] ?? "#f2f6ff");
  if (typeof temperature !== "number" || Number.isNaN(temperature)) {
    return spectralTint;
  }
  return spectralTint.lerp(colorFromTemperature(temperature), 0.6);
};

export const getStarBrightness = (star: StarRenderDatum) => {
  if (typeof star.apparentMagnitude === "number" && Number.isFinite(star.apparentMagnitude)) {
    const normalized = MathUtils.clamp(1 - (star.apparentMagnitude + 2) / 11, 0, 1);
    return MathUtils.clamp(0.04 + Math.pow(normalized, 0.82) * 0.96, 0.04, 1);
  }
  const distance = Math.max(0.001, star.distanceLy);
  const apparentFlux = (star.luminosity ?? 0) / (distance * distance + 1);
  return MathUtils.clamp(Math.log10(apparentFlux * 2200 + 1) / 2.3, 0.085, 1.0);
};

interface StarFieldProps {
  stars: StarRenderDatum[];
  opacity?: number;
  cameraDistance?: number;
  performanceMode?: boolean;
  selectedStarName?: string | null;
  positionScale?: number;
  debugMode?: boolean;
  interactive?: boolean;
  onSelect?: (star: StarRenderDatum) => void;
  onHover?: (star: StarRenderDatum | null) => void;
}

export const StarField = ({
  stars,
  opacity = 1,
  cameraDistance = 60,
  performanceMode = false,
  selectedStarName = null,
  positionScale = SPACE_SCALE,
  debugMode = false,
  interactive = true,
  onSelect,
  onHover,
}: StarFieldProps) => {
  const materialRef = useRef<ShaderMaterial | null>(null);
  const visualDistance = Math.round(cameraDistance / 8) * 8;

  const geometry = useMemo(() => {
    const next = new BufferGeometry();
    const count = stars.length;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const alphas = new Float32Array(count);
    const glows = new Float32Array(count);
    const halos = new Float32Array(count);
    const depths = new Float32Array(count);
    const parallax = new Float32Array(count);
    const phases = new Float32Array(count);
    const freqs = new Float32Array(count);
    const twinkles = new Float32Array(count);
    const zoomCloseness = MathUtils.clamp((22 - visualDistance) / 22, 0, 1);
    const nearDiscBoost = zoomCloseness * zoomCloseness;
    const detailFactor = performanceMode ? 0 : 1;

    stars.forEach((star, index) => {
      const [x, y, z] = getStarRenderPosition(star, positionScale);
      const baseBrightness = getStarBrightness(star);
      const isSelected = selectedStarName === star.name;
      const distanceFade = MathUtils.clamp(1 - star.distanceLy / 120, 0.68, 1);
      const brightness = MathUtils.clamp(baseBrightness * distanceFade, 0.08, 1);
      const brightnessCurve = Math.pow(brightness, 0.65);
      const luminousHalo = MathUtils.clamp(Math.log10((star.luminosity ?? baseBrightness) * 8 + 1) / 1.3, 0, 1);

      // Point-source first: tiny bodies by default. Slight disc emerges only very close.
      const sizeBase = MathUtils.lerp(0.33, 1.24, brightnessCurve);
      const size = Math.max(
        MIN_CORE_SIZE,
        sizeBase * (1 + nearDiscBoost * 1.05 + (isSelected ? 0.22 : 0)) * (performanceMode ? 0.92 : 1),
      );
      const alpha = MathUtils.clamp(
        MathUtils.lerp(0.26, 0.98, brightnessCurve) * (performanceMode ? 0.94 : 1) + (isSelected ? 0.07 : 0),
        MIN_OPACITY,
        1,
      );

      const glowStrength = MathUtils.clamp(
        Math.max(MIN_GLOW_SIZE, 0.24 + brightnessCurve * 0.96 + luminousHalo * 0.24),
        MIN_GLOW_SIZE,
        1.45,
      );
      const haloStrength = MathUtils.clamp(0.14 + luminousHalo * 1.05 + brightnessCurve * 0.5, 0.14, 1.6);

      const tintStrength = 0.2 + brightnessCurve * 0.12;
      const starColor = new Color("#ffffff").lerp(getStarColor(star.spectralType ?? "", star.temperature), tintStrength);

      // Subtle atmospheric depth cue: near slightly warmer, far slightly cooler.
      const distanceNorm = MathUtils.clamp(star.distanceLy / 50, 0, 1);
      const atmospheric = starColor
        .clone()
        .lerp(new Color("#fff5e8"), (1 - distanceNorm) * 0.05)
        .lerp(new Color("#e4ecff"), distanceNorm * 0.05);

      // Deterministic twinkle seed based on star name.
      let seed = 0;
      for (let i = 0; i < star.name.length; i += 1) {
        seed = (seed * 131 + star.name.charCodeAt(i)) % 10000;
      }
      const phase = (seed / 10000) * Math.PI * 2;
      const cycle = 4 + ((seed % 6000) / 6000) * 6; // 4s to 10s
      const twinkleAmp = (0.004 + ((seed % 2000) / 2000) * 0.012) * (performanceMode ? 0.45 : 1);
      const depthCue = MathUtils.clamp(1 - star.distanceLy / 62, 0.35, 1);
      const parallaxStrength = (0.005 + (1 - distanceNorm) * 0.016) * detailFactor;

      positions[index * 3] = x;
      positions[index * 3 + 1] = y;
      positions[index * 3 + 2] = z;
      colors[index * 3] = atmospheric.r;
      colors[index * 3 + 1] = atmospheric.g;
      colors[index * 3 + 2] = atmospheric.b;
      sizes[index] = size;
      alphas[index] = alpha;
      glows[index] = glowStrength;
      halos[index] = haloStrength;
      depths[index] = depthCue;
      parallax[index] = parallaxStrength;
      phases[index] = phase;
      freqs[index] = (Math.PI * 2) / cycle;
      twinkles[index] = twinkleAmp;
    });

    next.setAttribute("position", new BufferAttribute(positions, 3));
    next.setAttribute("color", new BufferAttribute(colors, 3));
    next.setAttribute("aSize", new BufferAttribute(sizes, 1));
    next.setAttribute("aAlpha", new BufferAttribute(alphas, 1));
    next.setAttribute("aGlow", new BufferAttribute(glows, 1));
    next.setAttribute("aHalo", new BufferAttribute(halos, 1));
    next.setAttribute("aDepth", new BufferAttribute(depths, 1));
    next.setAttribute("aParallax", new BufferAttribute(parallax, 1));
    next.setAttribute("aPhase", new BufferAttribute(phases, 1));
    next.setAttribute("aFreq", new BufferAttribute(freqs, 1));
    next.setAttribute("aTwinkle", new BufferAttribute(twinkles, 1));
    return next;
  }, [performanceMode, positionScale, selectedStarName, stars, visualDistance]);

  const material = useMemo(() => {
    return new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: AdditiveBlending,
      vertexColors: true,
      uniforms: {
        uOpacity: { value: opacity },
        uTime: { value: 0 },
        uDetail: { value: performanceMode ? 0 : 1 },
        uDebugDots: { value: debugMode ? 1 : 0 },
      },
      vertexShader: `
        attribute float aSize;
        attribute float aAlpha;
        attribute float aGlow;
        attribute float aHalo;
        attribute float aDepth;
        attribute float aParallax;
        attribute float aPhase;
        attribute float aFreq;
        attribute float aTwinkle;
        uniform float uTime;
        uniform float uDetail;
        uniform float uDebugDots;
        varying vec3 vColor;
        varying float vAlpha;
        varying float vGlow;
        varying float vHalo;
        varying float vDepth;
        void main() {
          vColor = color;
          float twinkle = 1.0 + sin(uTime * aFreq + aPhase) * aTwinkle;
          vAlpha = aAlpha * twinkle;
          vGlow = aGlow;
          vHalo = mix(aHalo * 0.65, aHalo, uDetail);
          vDepth = aDepth;
          vec3 toCamera = normalize(cameraPosition - position);
          vec3 parallaxOffset = toCamera * aParallax * uDetail;
          vec4 mvPosition = modelViewMatrix * vec4(position + parallaxOffset, 1.0);
          float attenuated = aSize * (220.0 / max(1.0, -mvPosition.z));
          float floorSize = mix(0.8, 1.05, uDetail);
          float ceilingSize = mix(2.8, 5.2, uDetail);
          if (uDebugDots > 0.5) {
            floorSize = 1.6;
            ceilingSize = 3.8;
          }
          gl_PointSize = clamp(attenuated, floorSize, ceilingSize);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform float uOpacity;
        uniform float uDetail;
        uniform float uDebugDots;
        varying vec3 vColor;
        varying float vAlpha;
        varying float vGlow;
        varying float vHalo;
        varying float vDepth;
        void main() {
          vec2 uv = gl_PointCoord - vec2(0.5);
          float r = length(uv);
          if (uDebugDots > 0.5) {
            float dot = smoothstep(0.3, 0.0, r);
            float debugAlpha = max(0.35, vAlpha) * dot * uOpacity;
            if (debugAlpha < 0.01) discard;
            gl_FragColor = vec4(vec3(1.0), debugAlpha);
            return;
          }
          float disc = smoothstep(0.17, 0.0, r) * 0.08;
          float coreRadius = mix(0.058, 0.08, uDetail);
          float innerRadius = 0.2 + vGlow * 0.055;
          float haloRadius = 0.42 + vHalo * 0.19;
          float core = exp(-pow(r / max(0.0001, coreRadius), 2.0) * 1.55);
          float inner = exp(-pow(r / max(0.0001, innerRadius), 2.0) * 2.2) * (0.58 + vGlow * 0.34);
          float outer = exp(-pow(r / max(0.0001, haloRadius), 2.0) * 1.75) * (0.16 + vHalo * 0.24);
          float haloMask = smoothstep(1.0, 0.08, r);

          vec3 coreColor = mix(vec3(1.0), vColor, 0.08);
          vec3 innerColor = mix(vec3(1.0), vColor, 0.28);
          vec3 haloColor = mix(vec3(1.0), vColor, 0.42);
          vec3 color = coreColor * (core + disc) + innerColor * inner + haloColor * outer;

          float detailHalo = mix(0.38, 1.0, uDetail);
          float alpha = (core * 1.12 + inner * 0.72 + outer * 0.28 * detailHalo) * vAlpha * vDepth * haloMask * uOpacity;
          if (alpha < 0.01) discard;
          gl_FragColor = vec4(color, alpha);
        }
      `,
    });
  }, [debugMode, opacity, performanceMode]);

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
      materialRef.current.uniforms.uDetail.value = performanceMode ? 0 : 1;
      materialRef.current.uniforms.uDebugDots.value = debugMode ? 1 : 0;
    }
  });

  if (!stars.length) {
    return null;
  }

  return (
    <points
      geometry={geometry}
      onPointerDown={(event) => {
        if (!interactive || !onSelect) return;
        event.stopPropagation();
        const index = event.index ?? -1;
        const star = stars[index];
        if (star) {
          onSelect(star);
        }
      }}
      onPointerMove={(event) => {
        if (!interactive || !onHover) return;
        const index = event.index ?? -1;
        const star = stars[index] ?? null;
        onHover(star);
      }}
      onPointerOut={() => {
        onHover?.(null);
      }}
    >
      <primitive ref={materialRef} object={material} attach="material" />
    </points>
  );
};
