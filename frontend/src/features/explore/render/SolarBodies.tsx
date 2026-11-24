// Sun, planets, moons, dwarf planets, comets and spacecraft at true scale.
//
// Each body is a unit sphere scaled to its physical radius in camera-relative render space, lit from the
// Sun's true direction. When a body shrinks below a couple of pixels it hands over to a point marker whose
// brightness comes from reflected sunlight (albedo, phase, distances) — the same identity throughout.

import { useEffect, useMemo, useRef, type FC } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  Quaternion,
  RingGeometry,
  SRGBColorSpace,
  ShaderMaterial,
  SphereGeometry,
  ImageBitmapLoader,
  Texture,
  TextureLoader,
  Vector3,
  type Group,
  type Mesh,
  type Points,
} from "three";
import { getSolarBodyOrientation, type SolarOrientationBodyId } from "../../../domain/solar";
import { placeObjectKm, pixelRadiusOf, placeRelative, type EngineState } from "../engine/engineState";
import { getEntityWorld, type UniverseEntity } from "../engine/universeModel";
import { discOverlapFraction } from "../engine/occlusion";
import { KM_PER_AU, KM_PER_LY, cross3, normalize3, sub3, type Vec3 } from "../engine/units";
import { MAGNITUDE_POINT_GLSL, magnitudeToPoint, useEngine } from "./EngineContext";
import { NOISE_GLSL } from "./glsl";

const BASE = "/solar-textures/high";
const TEXTURES: Record<string, { map?: string; night?: string; clouds?: string; spec?: string; ring?: string }> = {
  "solar:planet:mercury": { map: `${BASE}/2k_mercury.jpg` },
  "solar:planet:venus": { map: `${BASE}/2k_venus_surface.jpg` },
  "solar:planet:earth": {
    map: `${BASE}/2k_earth_daymap.jpg`,
    night: `${BASE}/earth_lights_2048.png`,
    clouds: `${BASE}/earth_clouds_1024.png`,
    spec: `${BASE}/earth_specular_2048.jpg`,
  },
  "solar:planet:mars": { map: `${BASE}/2k_mars.jpg` },
  "solar:planet:jupiter": { map: `${BASE}/2k_jupiter.jpg` },
  "solar:planet:saturn": { map: `${BASE}/2k_saturn.jpg`, ring: `${BASE}/2k_saturn_ring_alpha.png` },
  "solar:planet:uranus": { map: `${BASE}/2k_uranus.jpg` },
  "solar:planet:neptune": { map: `${BASE}/2k_neptune.jpg` },
  "solar:planet:pluto": { map: `${BASE}/2k_pluto.jpg` },
  "solar:moon:moon": { map: `${BASE}/moon_1024.jpg` },
  "solar:sun": { map: `${BASE}/2k_sun.jpg` },
};
const DETAIL_TEXTURE = `${BASE}/moon_1024.jpg`;

// Ring systems: inner/outer radii (km). Saturn uses the published C–A ring span the texture covers.
const RINGS: Record<string, { inner: number; outer: number; tint: [number, number, number]; opacity: number }> = {
  "solar:planet:saturn": { inner: 74_658, outer: 140_220, tint: [1, 0.96, 0.88], opacity: 1 },
  "solar:planet:uranus": { inner: 41_837, outer: 51_149, tint: [0.7, 0.72, 0.75], opacity: 0.45 },
};

// Atmosphere rim colours and thickness (fraction of radius).
const ATMOSPHERES: Record<string, { color: [number, number, number]; thickness: number; strength: number }> = {
  "solar:planet:earth": { color: [0.35, 0.6, 1.0], thickness: 0.028, strength: 1.25 },
  "solar:planet:venus": { color: [1.0, 0.88, 0.62], thickness: 0.04, strength: 1.1 },
  "solar:planet:mars": { color: [0.95, 0.62, 0.42], thickness: 0.018, strength: 0.55 },
  "solar:planet:jupiter": { color: [0.9, 0.82, 0.7], thickness: 0.012, strength: 0.45 },
  "solar:planet:saturn": { color: [0.95, 0.86, 0.65], thickness: 0.012, strength: 0.45 },
  "solar:planet:uranus": { color: [0.6, 0.92, 1.0], thickness: 0.02, strength: 0.75 },
  "solar:planet:neptune": { color: [0.35, 0.55, 1.0], thickness: 0.02, strength: 0.85 },
  "solar:moon:titan": { color: [1.0, 0.66, 0.3], thickness: 0.09, strength: 1.2 },
  "solar:planet:pluto": { color: [0.55, 0.7, 1.0], thickness: 0.02, strength: 0.25 },
};

// Surface style for bodies without a measured global map (procedural, disclosed as illustrative).
const SURFACE_STYLE: Record<string, number> = {
  "solar:moon:io": 1,
  "solar:moon:europa": 2,
  "solar:moon:ganymede": 3,
  "solar:moon:callisto": 4,
  "solar:moon:titan": 5,
  "solar:moon:enceladus": 2,
  "solar:planet:venus": 6,
};

const GAS_GIANTS = new Set(["solar:planet:jupiter", "solar:planet:saturn", "solar:planet:uranus", "solar:planet:neptune"]);

// ---------------------------------------------------------------------------------------------
// Texture cache (shared across mounts, loaded lazily when a body becomes large on screen)

const textureCache = new Map<string, Promise<Texture>>();
const loader = new TextureLoader();
// Decode images off the main thread where supported so a first approach does not hitch.
const bitmapLoader = typeof createImageBitmap === "function" ? new ImageBitmapLoader().setOptions({ imageOrientation: "flipY" }) : null;
const loadTexture = (url: string, colorSpace = true) => {
  let promise = textureCache.get(url);
  if (!promise && bitmapLoader) {
    promise = new Promise<Texture>((resolve, reject) => {
      bitmapLoader.load(
        url,
        (bitmap) => {
          const texture = new Texture(bitmap as unknown as HTMLImageElement);
          texture.flipY = false;
          if (colorSpace) texture.colorSpace = SRGBColorSpace;
          texture.anisotropy = 8;
          texture.minFilter = LinearMipmapLinearFilter;
          texture.magFilter = LinearFilter;
          texture.needsUpdate = true;
          resolve(texture);
        },
        undefined,
        reject,
      );
    });
    textureCache.set(url, promise);
  }
  if (!promise) {
    promise = new Promise<Texture>((resolve, reject) => {
      loader.load(
        url,
        (texture) => {
          if (colorSpace) texture.colorSpace = SRGBColorSpace;
          texture.anisotropy = 8;
          texture.minFilter = LinearMipmapLinearFilter;
          texture.magFilter = LinearFilter;
          resolve(texture);
        },
        undefined,
        reject,
      );
    });
    textureCache.set(url, promise);
  }
  return promise;
};

// ---------------------------------------------------------------------------------------------
// Orientation

const sceneVectorToWorld = (v: { x: number; y: number; z: number }): Vec3 => [v.x, v.y, -v.z];

const ORIENTED_BODIES = new Set<string>([
  "sun", "mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto",
  "moon", "io", "europa", "ganymede", "callisto",
]);

const tmpMatrix = new Matrix4();
const orientBody = (entity: UniverseEntity, timeMs: number, world: Vec3, parentWorld: Vec3 | null, out: Quaternion) => {
  let pm: Vec3;
  let pole: Vec3;
  if (entity.solarId && ORIENTED_BODIES.has(entity.solarId)) {
    const orientation = getSolarBodyOrientation(entity.solarId as SolarOrientationBodyId, new Date(timeMs));
    pm = normalize3(sceneVectorToWorld(orientation.sceneFrame.primeMeridianUnitVector));
    pole = normalize3(sceneVectorToWorld(orientation.sceneFrame.poleUnitVector));
  } else if (parentWorld) {
    // Synchronous rotation approximation: prime meridian faces the parent.
    pole = [0, 1, 0];
    const toParent = normalize3(sub3(parentWorld, world));
    pm = normalize3(cross3(cross3(pole, toParent), pole));
    if (!Number.isFinite(pm[0])) pm = [1, 0, 0];
  } else {
    pole = [0, 1, 0];
    const spin = ((timeMs / 3.6e6) * 0.3) % (Math.PI * 2);
    pm = [Math.cos(spin), 0, -Math.sin(spin)];
  }
  const z = normalize3(cross3(pm, pole));
  const x = normalize3(cross3(pole, z));
  tmpMatrix.makeBasis(new Vector3(...x), new Vector3(...pole), new Vector3(...z));
  out.setFromRotationMatrix(tmpMatrix);
  return pole;
};

// ---------------------------------------------------------------------------------------------
// Materials

const BODY_VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vPosW;
varying vec3 vLocal;
void main() {
  vUv = uv;
  vLocal = position;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPosW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const BODY_FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform sampler2D uNight;
uniform sampler2D uSpec;
uniform sampler2D uRingTex;
uniform float uHasMap;
uniform float uHasNight;
uniform float uHasSpec;
uniform vec3 uTint;
uniform vec3 uSunDir;
uniform float uGas;
uniform int uStyle;
uniform float uTime;
uniform vec3 uRingNormal;
uniform vec2 uRingRadii; // inner/outer in body radii
uniform float uHasRing;
uniform vec3 uBodyCenter;
uniform float uBodyRadius;
uniform vec3 uAtmoColor;
uniform float uAtmo;
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vPosW;
varying vec3 vLocal;
${NOISE_GLSL}

vec3 proceduralSurface(vec3 p, vec3 base) {
  if (uStyle == 1) { // Io: sulfur plains, SO2 frost, red-brown polar regions, small dark paterae
    float n = fbm3(p * 4.0, 5);
    float m = fbm3(p * 1.7 + 4.0, 4);
    vec3 col = mix(vec3(0.94, 0.86, 0.5), vec3(0.86, 0.62, 0.32), smoothstep(0.35, 0.7, n));
    col = mix(col, vec3(0.93, 0.92, 0.84), smoothstep(0.55, 0.78, m) * 0.6);
    col = mix(col, vec3(0.62, 0.38, 0.24), smoothstep(0.55, 0.9, abs(p.y)) * 0.55);
    float spots = smoothstep(0.86, 0.92, vnoise3(p * 16.0)) * smoothstep(0.4, 0.6, vnoise3(p * 3.0 + 9.0));
    float haloes = smoothstep(0.8, 0.86, vnoise3(p * 16.0)) * 0.25;
    col = mix(col, vec3(0.75, 0.32, 0.18), haloes);
    return mix(col, vec3(0.12, 0.07, 0.05), spots);
  }
  if (uStyle == 2) { // Europa/Enceladus: bright ice crossed by lineae
    float n = fbm3(p * 2.5, 4);
    float lines = 1.0 - smoothstep(0.0, 0.04, abs(ridged3(p * 4.0, 3) - 0.62));
    vec3 col = mix(vec3(0.92, 0.9, 0.86), vec3(0.78, 0.72, 0.64), n * 0.6);
    return mix(col, vec3(0.62, 0.42, 0.3), lines * 0.6 * base.r);
  }
  if (uStyle == 3) { // Ganymede: dark and grooved bright terrain
    float n = fbm3(p * 2.2, 5);
    float terrain = smoothstep(0.45, 0.55, fbm3(p * 1.2 + 7.0, 3));
    return mix(vec3(0.42, 0.38, 0.34), vec3(0.72, 0.7, 0.66), terrain) * (0.85 + n * 0.3);
  }
  if (uStyle == 4) { // Callisto: dark, saturated with craters
    float n = fbm3(p * 3.0, 5);
    float craters = smoothstep(0.82, 0.9, vnoise3(p * 14.0));
    return vec3(0.33, 0.3, 0.27) * (0.8 + n * 0.5) + craters * 0.35;
  }
  if (uStyle == 5) { // Titan: opaque orange haze
    float n = fbm3(p * 1.5, 3);
    return vec3(0.84, 0.6, 0.3) * (0.92 + n * 0.12);
  }
  if (uStyle == 6) { // Venus: featureless cloud deck with faint Y-shaped banding
    float lat = p.y;
    float band = fbm3(vec3(p.x * 1.2, lat * 5.0, p.z * 1.2) + vec3(uTime * 0.01, 0.0, 0.0), 4);
    return vec3(0.95, 0.86, 0.66) * (0.86 + band * 0.18);
  }
  return base;
}

float ringShadow(vec3 posW) {
  if (uHasRing < 0.5) return 1.0;
  // Ray from the surface point toward the Sun, intersect the ring plane.
  float denom = dot(uSunDir, uRingNormal);
  if (abs(denom) < 1e-4) return 1.0;
  float t = dot(uBodyCenter - posW, uRingNormal) / denom;
  if (t <= 0.0) return 1.0;
  vec3 hit = posW + uSunDir * t - uBodyCenter;
  float r = length(hit) / uBodyRadius;
  if (r < uRingRadii.x || r > uRingRadii.y) return 1.0;
  float u = (r - uRingRadii.x) / (uRingRadii.y - uRingRadii.x);
  float alpha = texture2D(uRingTex, vec2(u, 0.5)).a;
  return 1.0 - alpha * 0.85;
}

void main() {
  vec3 n = normalize(vNormalW);
  vec3 viewDir = normalize(cameraPosition - vPosW);
  float mu0 = dot(n, uSunDir);
  float mu = max(dot(n, viewDir), 0.0);
  vec3 base = uHasMap > 0.5 ? texture2D(uMap, vUv).rgb : uTint;
  if (uStyle > 0) {
    vec3 detail = uHasMap > 0.5 ? base : vec3(1.0);
    base = proceduralSurface(normalize(vLocal), detail);
    if (uHasMap > 0.5 && uStyle != 5 && uStyle != 6) base *= 0.75 + 0.5 * dot(detail, vec3(0.333));
  } else if (uHasMap < 0.5) {
    float n2 = fbm3(normalize(vLocal) * 4.0, 4);
    base = uTint * (0.75 + n2 * 0.5);
  } else {
    base *= mix(vec3(1.0), uTint, 0.0);
  }

  float light;
  if (uGas > 0.5) {
    // Lambert with mild limb darkening for cloud-top worlds.
    light = max(mu0, 0.0) * (0.55 + 0.45 * pow(mu, 0.35));
  } else {
    // Lommel–Seeliger blend: airless regolith stays bright to the limb.
    float ls = max(mu0, 0.0) / max(max(mu0, 0.0) + mu, 1e-3);
    light = mix(max(mu0, 0.0), ls * 2.0, 0.55);
  }
  // Soft terminator (penumbral width of the Sun's disc).
  float terminator = smoothstep(-0.02, 0.06, mu0);
  light *= terminator;
  light *= ringShadow(vPosW);

  // A trace of ambient light keeps the dark limb legible against black space.
  vec3 color = base * (light * 1.35 + 0.012);

  // Earth-like extras
  if (uHasSpec > 0.5) {
    float ocean = texture2D(uSpec, vUv).r;
    vec3 h = normalize(uSunDir + viewDir);
    float glint = pow(max(dot(n, h), 0.0), 60.0) * ocean * terminator;
    color += vec3(1.0, 0.92, 0.8) * glint * 0.7;
    color = mix(color, color * vec3(0.85, 0.92, 1.05), ocean * 0.3);
  }
  if (uHasNight > 0.5) {
    float night = smoothstep(0.08, -0.12, mu0);
    vec3 lights = texture2D(uNight, vUv).rgb;
    color += lights * vec3(1.0, 0.78, 0.48) * night * 1.6;
  }
  // Atmospheric in-scatter toward the limb and a warm terminator band.
  if (uAtmo > 0.0) {
    float rim = pow(1.0 - mu, 3.0);
    float day = smoothstep(-0.15, 0.35, mu0);
    vec3 sunset = vec3(1.0, 0.45, 0.2) * smoothstep(0.25, 0.0, abs(mu0 - 0.02)) * 0.35;
    color += (uAtmoColor * rim * day + sunset * rim) * uAtmo * 0.9;
  }
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const ATMO_VERTEX = /* glsl */ `
varying vec3 vNormalW;
varying vec3 vPosW;
void main() {
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPosW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const ATMO_FRAGMENT = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uColor;
uniform float uStrength;
varying vec3 vNormalW;
varying vec3 vPosW;
void main() {
  vec3 n = normalize(vNormalW);
  vec3 v = normalize(cameraPosition - vPosW);
  float facing = dot(n, v);
  // Rendered on the back faces of a slightly larger shell: brightest just outside the limb.
  float rim = pow(clamp(1.0 + facing, 0.0, 1.0), 4.0);
  float day = smoothstep(-0.35, 0.4, dot(n, uSunDir));
  float forward = pow(max(dot(-v, uSunDir), 0.0), 8.0) * 1.5; // forward scattering when backlit
  vec3 c = uColor * rim * (day + forward) * uStrength;
  gl_FragColor = vec4(c, clamp(rim * (day + forward), 0.0, 1.0));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const CLOUD_FRAGMENT = /* glsl */ `
uniform sampler2D uClouds;
uniform vec3 uSunDir;
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vPosW;
varying vec3 vLocal;
void main() {
  vec3 n = normalize(vNormalW);
  float a = texture2D(uClouds, vUv).a;
  float mu0 = dot(n, uSunDir);
  float light = smoothstep(-0.05, 0.25, mu0) * (0.35 + 0.65 * max(mu0, 0.0));
  vec3 c = vec3(1.0) * light * 1.25;
  gl_FragColor = vec4(c, a * (0.25 + 0.75 * smoothstep(-0.25, 0.1, mu0)));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const RING_VERTEX = /* glsl */ `
varying vec3 vPosW;
varying float vRadius;
void main() {
  vRadius = length(position.xy);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPosW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const RING_FRAGMENT = /* glsl */ `
uniform sampler2D uRingTex;
uniform float uHasTex;
uniform vec2 uRadii;
uniform vec3 uSunDir;
uniform vec3 uBodyCenter;
uniform float uBodyRadius;
uniform vec3 uTint;
uniform float uOpacity;
uniform vec3 uNormal;
varying vec3 vPosW;
varying float vRadius;
void main() {
  float u = (vRadius - uRadii.x) / (uRadii.y - uRadii.x);
  if (u < 0.0 || u > 1.0) discard;
  vec4 tex = uHasTex > 0.5 ? texture2D(uRingTex, vec2(u, 0.5)) : vec4(1.0, 1.0, 1.0, 0.25 * (0.6 + 0.4 * sin(u * 80.0)));
  // Planet shadow on the rings (ray toward the Sun hits the planet sphere).
  vec3 oc = vPosW - uBodyCenter;
  float b = dot(oc, uSunDir);
  float c = dot(oc, oc) - uBodyRadius * uBodyRadius;
  float h = b * b - c;
  float shadow = (h > 0.0 && -b - sqrt(h) > 0.0) ? 0.08 : 1.0;
  // Lit side vs unlit side: light diffuses through the rings when seen from the dark side.
  vec3 v = normalize(cameraPosition - vPosW);
  float sunSide = sign(dot(uSunDir, uNormal));
  float viewSide = sign(dot(v, uNormal));
  float through = sunSide == viewSide ? 1.0 : 0.35;
  vec3 col = tex.rgb * uTint * shadow * through * 1.2;
  gl_FragColor = vec4(col, tex.a * uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const SUN_FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform float uHasMap;
uniform float uTime;
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vPosW;
varying vec3 vLocal;
${NOISE_GLSL}
void main() {
  vec3 n = normalize(vNormalW);
  vec3 v = normalize(cameraPosition - vPosW);
  float mu = max(dot(n, v), 0.0);
  // Eddington limb darkening, wavelength-dependent (redder at the limb).
  vec3 limb = vec3(1.0) - vec3(0.47, 0.6, 0.78) * (1.0 - pow(mu, 0.8));
  float gran = fbm3(normalize(vLocal) * 60.0 + vec3(uTime * 0.02), 3);
  vec3 tex = uHasMap > 0.5 ? texture2D(uMap, vUv).rgb : vec3(1.0, 0.8, 0.5);
  vec3 col = mix(vec3(1.0, 0.86, 0.62), tex * 1.5, 0.45) * (0.85 + gran * 0.3);
  col *= limb * 1.15;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const GLARE_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
uniform float uRingInner;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  if (uRingInner > 0.0) {
    // Solar corona at totality: nothing inside the Moon's limb, a bright inner edge, soft streamers.
    if (r < uRingInner) discard;
    float x = (r - uRingInner) / max(0.0001, 1.0 - uRingInner);
    float ang = atan(p.y, p.x);
    float streamers = 0.65 + 0.35 * pow(abs(sin(ang * 2.0 + 0.6)), 3.0) + 0.12 * sin(ang * 11.0) * sin(ang * 5.0 + 1.3);
    float c = (exp(-x * 9.0) * 1.4 + exp(-x * 3.2) * 0.35 * streamers) * (1.0 - x);
    gl_FragColor = vec4(uColor * c * uIntensity, 1.0);
    return;
  }
  float core = exp(-r * r * 18.0);
  float halo = exp(-r * 5.5) * 0.35;
  float rays = pow(max(0.0, 1.0 - abs(p.x * p.y) * 40.0), 6.0) * (1.0 - r) * 0.12;
  float a = (core + halo + rays) * uIntensity;
  gl_FragColor = vec4(uColor * a, 1.0);
}
`;

const GLARE_VERTEX = /* glsl */ `
varying vec2 vUv;
uniform float uSizePx;
uniform vec2 uViewport;
void main() {
  vUv = uv;
  vec4 center = projectionMatrix * modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec2 offset = (uv * 2.0 - 1.0) * uSizePx / uViewport * 2.0;
  gl_Position = center + vec4(offset * center.w, 0.0, 0.0);
}
`;

// ---------------------------------------------------------------------------------------------
// Shared geometry

const sphereHigh = new SphereGeometry(1, 128, 64);
const sphereLow = new SphereGeometry(1, 48, 24);
const glareQuad = (() => {
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  g.setAttribute("uv", new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
})();

const placeholderTexture = (() => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 2;
  return new CanvasTexture(canvas);
})();

// ---------------------------------------------------------------------------------------------
// Body component

const tmpQuat = new Quaternion();

const useLazyTexture = (url: string | undefined, enabled: boolean, colorSpace = true) => {
  const ref = useRef<Texture | null>(null);
  const requested = useRef(false);
  useEffect(() => {
    requested.current = false;
    ref.current = null;
  }, [url]);
  return {
    get: () => {
      if (!url) return null;
      if (enabled && !requested.current) {
        requested.current = true;
        loadTexture(url, colorSpace)
          .then((texture) => {
            ref.current = texture;
          })
          .catch(() => {
            // Missing texture: keep the procedural/tinted fallback.
          });
      }
      return ref.current;
    },
    request: () => {
      if (!url || requested.current) return;
      requested.current = true;
      loadTexture(url, colorSpace).then((texture) => {
        ref.current = texture;
      }).catch(() => undefined);
    },
  };
};

export const BODY_POINT_CUTOFF_PX = 1.2;

const Body: FC<{ entity: UniverseEntity }> = ({ entity }) => {
  const engine = useEngine();
  const groupRef = useRef<Group | null>(null);
  const meshRef = useRef<Mesh | null>(null);
  const atmoRef = useRef<Mesh | null>(null);
  const cloudRef = useRef<Mesh | null>(null);
  const ringRef = useRef<Mesh | null>(null);
  const textures = TEXTURES[entity.id] ?? {};
  const style = SURFACE_STYLE[entity.id] ?? 0;
  const mapUrl = textures.map ?? (entity.kind === "moon" || entity.kind === "dwarf-planet" || entity.kind === "comet" ? DETAIL_TEXTURE : undefined);
  const mapTex = useLazyTexture(mapUrl, true);
  const nightTex = useLazyTexture(textures.night, true);
  const cloudTex = useLazyTexture(textures.clouds, true, false);
  const specTex = useLazyTexture(textures.spec, true, false);
  const ringTex = useLazyTexture(textures.ring, true, false);
  const ring = RINGS[entity.id];
  const atmo = ATMOSPHERES[entity.id];
  const isGas = GAS_GIANTS.has(entity.id);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: BODY_VERTEX,
        fragmentShader: BODY_FRAGMENT,
        uniforms: {
          uMap: { value: placeholderTexture },
          uNight: { value: placeholderTexture },
          uSpec: { value: placeholderTexture },
          uRingTex: { value: placeholderTexture },
          uHasMap: { value: 0 },
          uHasNight: { value: 0 },
          uHasSpec: { value: 0 },
          uTint: { value: new Vector3(...entity.color) },
          uSunDir: { value: new Vector3(1, 0, 0) },
          uGas: { value: isGas ? 1 : 0 },
          uStyle: { value: style },
          uTime: { value: 0 },
          uRingNormal: { value: new Vector3(0, 1, 0) },
          uRingRadii: { value: ring ? [ring.inner / entity.radiusKm, ring.outer / entity.radiusKm] : [0, 0] },
          uHasRing: { value: ring && textures.ring ? 1 : 0 },
          uBodyCenter: { value: new Vector3() },
          uBodyRadius: { value: 1 },
          uAtmoColor: { value: new Vector3(...(atmo?.color ?? [0, 0, 0])) },
          uAtmo: { value: atmo ? atmo.strength * 0.5 : 0 },
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entity.id],
  );
  const atmoMaterial = useMemo(
    () =>
      atmo
        ? new ShaderMaterial({
            vertexShader: ATMO_VERTEX,
            fragmentShader: ATMO_FRAGMENT,
            uniforms: {
              uSunDir: { value: new Vector3(1, 0, 0) },
              uColor: { value: new Vector3(...atmo.color) },
              uStrength: { value: atmo.strength },
            },
            side: BackSide,
            transparent: true,
            depthWrite: false,
            blending: AdditiveBlending,
          })
        : null,
    [atmo],
  );
  const cloudMaterial = useMemo(
    () =>
      textures.clouds
        ? new ShaderMaterial({
            vertexShader: BODY_VERTEX,
            fragmentShader: CLOUD_FRAGMENT,
            uniforms: { uClouds: { value: placeholderTexture }, uSunDir: { value: new Vector3(1, 0, 0) } },
            transparent: true,
            depthWrite: false,
          })
        : null,
    [textures.clouds],
  );
  const ringMaterial = useMemo(
    () =>
      ring
        ? new ShaderMaterial({
            vertexShader: RING_VERTEX,
            fragmentShader: RING_FRAGMENT,
            uniforms: {
              uRingTex: { value: placeholderTexture },
              uHasTex: { value: 0 },
              uRadii: { value: [ring.inner / entity.radiusKm, ring.outer / entity.radiusKm] },
              uSunDir: { value: new Vector3(1, 0, 0) },
              uBodyCenter: { value: new Vector3() },
              uBodyRadius: { value: 1 },
              uTint: { value: new Vector3(...ring.tint) },
              uOpacity: { value: ring.opacity },
              uNormal: { value: new Vector3(0, 1, 0) },
            },
            transparent: true,
            side: DoubleSide,
            depthWrite: false,
          })
        : null,
    [entity.radiusKm, ring],
  );
  const ringGeometry = useMemo(
    () => (ring ? new RingGeometry(ring.inner / entity.radiusKm, ring.outer / entity.radiusKm, 192, 1) : null),
    [entity.radiusKm, ring],
  );
  useEffect(
    () => () => {
      material.dispose();
      atmoMaterial?.dispose();
      cloudMaterial?.dispose();
      ringMaterial?.dispose();
      ringGeometry?.dispose();
    },
    [atmoMaterial, cloudMaterial, material, ringGeometry, ringMaterial],
  );

  const centerVec = useMemo(() => new Vector3(), []);
  const parent = entity.parentId ? engine.index.byId.get(entity.parentId) : undefined;

  useFrame(() => {
    const group = groupRef.current;
    const mesh = meshRef.current;
    if (!group || !mesh) return;
    const world = getEntityWorld(entity, engine.simTimeMs);
    if (!world) {
      group.visible = false;
      return;
    }
    const dx = world[0] - engine.cameraWorld[0];
    const dy = world[1] - engine.cameraWorld[1];
    const dz = world[2] - engine.cameraWorld[2];
    const distance = Math.hypot(dx, dy, dz);
    const extent = Math.max(entity.radiusKm, ring ? ring.outer : 0);
    const pixelRadius = pixelRadiusOf(engine, extent, distance);
    const bodyPixels = pixelRadiusOf(engine, entity.radiusKm, distance);
    const visible = pixelRadius > BODY_POINT_CUTOFF_PX * 0.5;
    group.visible = visible;
    if (!visible) return;
    const kmToRender = placeRelative(engine, world, group.position);
    group.scale.setScalar(entity.radiusKm * kmToRender);
    centerVec.copy(group.position);
    const parentWorld = parent ? getEntityWorld(parent, engine.simTimeMs) : null;
    const pole = orientBody(entity, engine.simTimeMs, world, parentWorld, tmpQuat);
    mesh.quaternion.copy(tmpQuat);
    mesh.geometry = bodyPixels > 60 ? sphereHigh : sphereLow;
    // Sun direction from this body (Sun at world origin).
    const sunDir = normalize3([-world[0], -world[1], -world[2]]);
    const u = material.uniforms;
    u.uSunDir.value.set(sunDir[0], sunDir[1], sunDir[2]);
    u.uTime.value = (engine.simTimeMs / 1000) % 100_000;
    u.uBodyCenter.value.copy(centerVec);
    u.uBodyRadius.value = entity.radiusKm * kmToRender;
    const near = bodyPixels > 3;
    const map = near ? mapTex.get() : null;
    if (map) {
      u.uMap.value = map;
      u.uHasMap.value = 1;
    }
    if (near && textures.night) {
      const night = nightTex.get();
      if (night) {
        u.uNight.value = night;
        u.uHasNight.value = 1;
      }
    }
    if (near && textures.spec) {
      const spec = specTex.get();
      if (spec) {
        u.uSpec.value = spec;
        u.uHasSpec.value = 1;
      }
    }
    if (ring && ringRef.current && ringMaterial) {
      ringRef.current.visible = pixelRadius > 2;
      // Ring plane is the equatorial plane: ring mesh is built in XY, rotate so its normal = pole.
      ringRef.current.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), new Vector3(...pole));
      const rt = textures.ring ? ringTex.get() : null;
      if (rt) {
        ringMaterial.uniforms.uRingTex.value = rt;
        ringMaterial.uniforms.uHasTex.value = 1;
        u.uRingTex.value = rt;
      }
      ringMaterial.uniforms.uSunDir.value.set(sunDir[0], sunDir[1], sunDir[2]);
      ringMaterial.uniforms.uBodyCenter.value.copy(centerVec);
      ringMaterial.uniforms.uBodyRadius.value = entity.radiusKm * kmToRender;
      ringMaterial.uniforms.uNormal.value.set(pole[0], pole[1], pole[2]);
      u.uRingNormal.value.set(pole[0], pole[1], pole[2]);
    }
    if (atmoRef.current && atmoMaterial && atmo) {
      atmoRef.current.visible = bodyPixels > 4;
      atmoRef.current.scale.setScalar(1 + atmo.thickness);
      atmoMaterial.uniforms.uSunDir.value.set(sunDir[0], sunDir[1], sunDir[2]);
    }
    if (cloudRef.current && cloudMaterial) {
      cloudRef.current.visible = bodyPixels > 6;
      cloudRef.current.quaternion.copy(tmpQuat);
      cloudRef.current.rotateY((engine.simTimeMs / 8.64e7) * 0.05);
      const clouds = cloudTex.get();
      if (clouds) cloudMaterial.uniforms.uClouds.value = clouds;
      cloudMaterial.uniforms.uSunDir.value.set(sunDir[0], sunDir[1], sunDir[2]);
    }
  });

  return (
    <group ref={groupRef} name={entity.id}>
      <mesh ref={meshRef} geometry={sphereLow} material={material} renderOrder={10} />
      {cloudMaterial ? <mesh ref={cloudRef} geometry={sphereHigh} material={cloudMaterial} scale={1.006} renderOrder={11} /> : null}
      {atmoMaterial ? <mesh ref={atmoRef} geometry={sphereLow} material={atmoMaterial} renderOrder={12} /> : null}
      {ringMaterial && ringGeometry ? <mesh ref={ringRef} geometry={ringGeometry} material={ringMaterial} renderOrder={13} /> : null}
    </group>
  );
};

// ---------------------------------------------------------------------------------------------
// The Sun: resolved disc, limb darkening and a glare whose size follows apparent brightness.

const Sun: FC<{ entity: UniverseEntity; occluders: UniverseEntity[] }> = ({ entity, occluders }) => {
  const engine = useEngine();
  const groupRef = useRef<Group | null>(null);
  const meshRef = useRef<Mesh | null>(null);
  const glareRef = useRef<Mesh | null>(null);
  const map = useLazyTexture(TEXTURES["solar:sun"].map, true);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: BODY_VERTEX,
        fragmentShader: SUN_FRAGMENT,
        uniforms: { uMap: { value: placeholderTexture }, uHasMap: { value: 0 }, uTime: { value: 0 } },
      }),
    [],
  );
  const glareMaterial = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: GLARE_VERTEX,
        fragmentShader: GLARE_FRAGMENT,
        uniforms: {
          uColor: { value: new Vector3(1, 0.9, 0.75) },
          uIntensity: { value: 1 },
          uSizePx: { value: 100 },
          uViewport: { value: [1, 1] },
          uRingInner: { value: 0 },
        },
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: AdditiveBlending,
      }),
    [],
  );
  useEffect(() => () => {
    material.dispose();
    glareMaterial.dispose();
  }, [glareMaterial, material]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group || !meshRef.current || !glareRef.current) return;
    const world: Vec3 = [0, 0, 0];
    const distance = Math.hypot(...engine.cameraWorld);
    const kmToRender = placeRelative(engine, world, group.position);
    const bodyPixels = pixelRadiusOf(engine, entity.radiusKm, distance);
    meshRef.current.visible = bodyPixels > 0.8;
    meshRef.current.scale.setScalar(entity.radiusKm * kmToRender);
    meshRef.current.rotation.y += delta * 0.01;
    material.uniforms.uTime.value += delta;
    if (bodyPixels > 2) {
      const tex = map.get();
      if (tex) {
        material.uniforms.uMap.value = tex;
        material.uniforms.uHasMap.value = 1;
      }
    }
    // Apparent magnitude of the Sun from the camera.
    const parsecs = distance / (KM_PER_LY * 3.261_563_777);
    const m = 4.83 + 5 * Math.log10(Math.max(1e-12, parsecs) / 10);
    const limit = engine.exposure + 6.5;
    const { size } = magnitudeToPoint(m, limit);
    // Eclipses and transits: dim the glare by how much of the Sun's disc a nearer body covers, so a
    // Moon in front of the Sun shows as a black disc with a faint corona instead of being drawn over.
    const toSun = normalize3([-engine.cameraWorld[0], -engine.cameraWorld[1], -engine.cameraWorld[2]]);
    const sunAngular = Math.asin(Math.min(1, entity.radiusKm / Math.max(entity.radiusKm, distance)));
    let covered = 0;
    for (const body of occluders) {
      const w = getEntityWorld(body, engine.simTimeMs);
      if (!w) continue;
      const rel = sub3(w, engine.cameraWorld);
      const d = Math.hypot(...rel);
      if (d >= distance || d <= body.radiusKm) continue;
      const dir: Vec3 = [rel[0] / d, rel[1] / d, rel[2] / d];
      const sep = Math.acos(Math.min(1, Math.max(-1, dir[0] * toSun[0] + dir[1] * toSun[1] + dir[2] * toSun[2])));
      const bodyAngular = Math.asin(Math.min(1, body.radiusKm / d));
      if (sep > sunAngular + bodyAngular) continue;
      covered = Math.max(covered, discOverlapFraction(sunAngular, bodyAngular, sep));
    }
    const visible = 1 - covered;
    // Glare: a compact core plus a halo that grows with brightness but never swamps the frame.
    const brightness = Math.pow(10, -0.4 * (m - limit)) * Math.max(0.0005, visible);
    const glarePx = bodyPixels > 1
      ? Math.min(engine.viewportHeight * 0.55, bodyPixels * 2.6 + 28 + Math.log10(Math.max(1, brightness)) * 6)
      : Math.min(220, size * 3 + Math.log10(Math.max(1, brightness)) * 10);
    const u = glareMaterial.uniforms;
    u.uSizePx.value = glarePx;
    u.uViewport.value = [engine.viewportWidth, engine.viewportHeight];
    const baseIntensity = bodyPixels > 1 ? 0.85 : Math.min(1.4, 0.25 + Math.log10(Math.max(1, brightness)) * 0.12);
    // Totality: what remains is the corona, a soft pale ring a couple of solar radii across.
    const corona = covered > 0.985 && bodyPixels > 4;
    u.uIntensity.value = corona ? 0.72 : baseIntensity * Math.pow(visible, 1.5);
    if (corona) u.uSizePx.value = bodyPixels * 3.4;
    u.uRingInner.value = corona ? 0.98 / 3.4 : 0;
    u.uColor.value.set(corona ? 0.85 : 1, corona ? 0.9 : 0.9, corona ? 1 : 0.75);
    glareRef.current.visible = corona || brightness > 0.05;
  });

  return (
    <group ref={groupRef} name="solar:sun">
      <mesh ref={meshRef} geometry={sphereHigh} material={material} renderOrder={9} />
      <mesh ref={glareRef} geometry={glareQuad} material={glareMaterial} renderOrder={40} frustumCulled={false} />
    </group>
  );
};

// ---------------------------------------------------------------------------------------------
// Point markers for bodies too small to resolve. Brightness from reflected sunlight.

const MARKER_VERTEX = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
uniform float uPixelRatio;
void main() {
  vAlpha = aAlpha;
  vColor = aColor;
  gl_PointSize = aSize * uPixelRatio;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const MARKER_FRAGMENT = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (r2 > 1.0) discard;
  float core = exp(-r2 * 5.0);
  gl_FragColor = vec4(vColor * core * vAlpha, core * vAlpha);
}
`;

void MAGNITUDE_POINT_GLSL;

const BodyMarkers: FC<{ entities: UniverseEntity[] }> = ({ entities }) => {
  const engine = useEngine();
  const pointsRef = useRef<Points | null>(null);
  const count = entities.length;
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute("aSize", new BufferAttribute(new Float32Array(count), 1));
    g.setAttribute("aAlpha", new BufferAttribute(new Float32Array(count), 1));
    g.setAttribute("aColor", new BufferAttribute(new Float32Array(count * 3), 3));
    return g;
  }, [count]);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: MARKER_VERTEX,
        fragmentShader: MARKER_FRAGMENT,
        uniforms: { uPixelRatio: { value: 1 } },
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: AdditiveBlending,
      }),
    [],
  );
  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);
  const tmp = useMemo(() => ({ x: 0, y: 0, z: 0 }), []);

  useFrame(() => {
    const positions = geometry.getAttribute("position") as BufferAttribute;
    const sizes = geometry.getAttribute("aSize") as BufferAttribute;
    const alphas = geometry.getAttribute("aAlpha") as BufferAttribute;
    const colors = geometry.getAttribute("aColor") as BufferAttribute;
    material.uniforms.uPixelRatio.value = engine.pixelRatio;
    const limit = engine.exposure + 6.5;
    entities.forEach((entity, i) => {
      const world = getEntityWorld(entity, engine.simTimeMs);
      if (!world) {
        alphas.setX(i, 0);
        return;
      }
      placeRelative(engine, world, tmp);
      positions.setXYZ(i, tmp.x, tmp.y, tmp.z);
      const dx = world[0] - engine.cameraWorld[0];
      const dy = world[1] - engine.cameraWorld[1];
      const dz = world[2] - engine.cameraWorld[2];
      const delta = Math.hypot(dx, dy, dz);
      const bodyPixels = pixelRadiusOf(engine, entity.radiusKm, delta);
      let magnitude: number;
      if (entity.kind === "spacecraft") {
        magnitude = 30; // never naturally visible: marker driven by selection/labels instead
      } else {
        const r = Math.max(1, Math.hypot(...world));
        const phaseCos = (-(world[0] * dx + world[1] * dy + world[2] * dz)) / (r * Math.max(1, delta));
        const phase = Math.max(0.02, (1 + phaseCos) / 2);
        const ratio = ((entity.albedo ?? 0.3) * phase * (entity.radiusKm / KM_PER_AU) ** 2) / ((r / KM_PER_AU) ** 2 * (delta / KM_PER_AU) ** 2);
        magnitude = -26.74 - 2.5 * Math.log10(Math.max(1e-40, ratio));
      }
      const point = magnitudeToPoint(magnitude, limit);
      // Fade the marker out as the resolved disc takes over.
      const handover = Math.min(1, Math.max(0, (bodyPixels - BODY_POINT_CUTOFF_PX) / 2.5));
      const isFocus = entity.id === engine.selectedId || entity.id === engine.hoveredId || entity.id === engine.trackedId;
      // Planets and major moons always keep a findable dot; faint small bodies only when selected.
      const findable = entity.kind === "planet" || entity.kind === "dwarf-planet" || (entity.kind === "moon" && entity.radiusKm > 1_000) || entity.kind === "spacecraft" || entity.kind === "comet";
      const minimum = isFocus ? 0.95 : findable ? 0.55 : 0;
      const alpha = Math.max(point.alpha, minimum) * (1 - handover);
      alphas.setX(i, alpha);
      sizes.setX(i, Math.max(point.size, isFocus ? 4 : findable ? 2.4 : 1.6));
      colors.setXYZ(i, entity.color[0], entity.color[1], entity.color[2]);
    });
    positions.needsUpdate = true;
    sizes.needsUpdate = true;
    alphas.needsUpdate = true;
    colors.needsUpdate = true;
    if (pointsRef.current) pointsRef.current.visible = true;
  });

  return <points ref={pointsRef} geometry={geometry} material={material} frustumCulled={false} renderOrder={20} />;
};

// ---------------------------------------------------------------------------------------------
// Voyager: simplified silhouette from published dimensions — 3.66 m high-gain antenna, decagonal bus
// (1.78 m across, 0.47 m tall), 13 m magnetometer boom, RTG boom. Appears once it resolves.

const CRAFT_VERTEX = BODY_VERTEX;
const CRAFT_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uSunDir;
varying vec3 vNormalW;
varying vec3 vPosW;
varying vec2 vUv;
varying vec3 vLocal;
void main() {
  vec3 n = normalize(vNormalW);
  vec3 v = normalize(cameraPosition - vPosW);
  if (dot(n, v) < 0.0) n = -n;
  float d = max(dot(n, uSunDir), 0.0);
  vec3 h = normalize(uSunDir + v);
  float spec = pow(max(dot(n, h), 0.0), 40.0) * 0.6;
  gl_FragColor = vec4(uColor * (0.03 + d * 1.1) + vec3(spec), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const craftMaterial = (color: [number, number, number]) =>
  new ShaderMaterial({
    vertexShader: CRAFT_VERTEX,
    fragmentShader: CRAFT_FRAGMENT,
    uniforms: { uColor: { value: new Vector3(...color) }, uSunDir: { value: new Vector3(1, 0, 0) } },
    side: DoubleSide,
  });

const SpacecraftModel: FC<{ entity: UniverseEntity }> = ({ entity }) => {
  const engine = useEngine();
  const groupRef = useRef<Group | null>(null);
  const materials = useMemo(() => ({ dish: craftMaterial([0.9, 0.9, 0.88]), bus: craftMaterial([0.55, 0.5, 0.4]), boom: craftMaterial([0.6, 0.6, 0.62]), gold: craftMaterial([0.85, 0.66, 0.3]) }), []);
  useEffect(() => () => Object.values(materials).forEach((m) => m.dispose()), [materials]);
  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    const world = getEntityWorld(entity, engine.simTimeMs);
    if (!world) return;
    const kmToRender = placeRelative(engine, world, group.position);
    group.scale.setScalar(0.001 * kmToRender); // model built in metres
    const distance = Math.hypot(world[0] - engine.cameraWorld[0], world[1] - engine.cameraWorld[1], world[2] - engine.cameraWorld[2]);
    group.visible = pixelRadiusOf(engine, 0.008, distance) > 2;
    // High-gain antenna points back at Earth (≈ the Sun from this distance).
    const toSun = normalize3([-world[0], -world[1], -world[2]]);
    group.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(...toSun));
    Object.values(materials).forEach((m) => m.uniforms.uSunDir.value.set(toSun[0], toSun[1], toSun[2]));
  });
  return (
    <group ref={groupRef}>
      <mesh material={materials.dish} position={[0, 1.2, 0]} rotation={[Math.PI, 0, 0]}>
        <sphereGeometry args={[2.6, 40, 12, 0, Math.PI * 2, 0, 0.78]} />
      </mesh>
      <mesh material={materials.bus} position={[0, 0, 0]}>
        <cylinderGeometry args={[0.89, 0.89, 0.47, 10]} />
      </mesh>
      <mesh material={materials.gold} position={[0, -0.32, 0]}>
        <cylinderGeometry args={[0.15, 0.15, 0.2, 16]} />
      </mesh>
      <mesh material={materials.boom} position={[6.6, -0.2, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.04, 0.04, 13, 6]} />
      </mesh>
      <mesh material={materials.boom} position={[-1.8, -0.3, 1.2]} rotation={[0.6, 0, Math.PI / 2.4]}>
        <cylinderGeometry args={[0.05, 0.05, 2.6, 6]} />
      </mesh>
      <mesh material={materials.gold} position={[-2.9, -0.7, 1.9]} rotation={[0.6, 0, Math.PI / 2.4]}>
        <cylinderGeometry args={[0.2, 0.2, 1.1, 10]} />
      </mesh>
      <mesh material={materials.boom} position={[-0.6, -0.5, -2.2]} rotation={[Math.PI / 2.3, 0, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 2.4, 6]} />
      </mesh>
    </group>
  );
};

export const SolarBodies: FC = () => {
  const engine = useEngine();
  const entities = useMemo(
    () => engine.index.entities.filter((entity) => entity.solarId || entity.kind === "spacecraft" || entity.kind === "sun"),
    [engine.index],
  );
  const sun = entities.find((entity) => entity.kind === "sun");
  const bodies = entities.filter((entity) => entity.kind !== "sun" && entity.kind !== "spacecraft");
  const markerEntities = entities.filter((entity) => entity.kind !== "sun");
  // Bodies big enough to cover a meaningful part of the Sun from somewhere a visitor can stand.
  const occluders = useMemo(
    () => entities.filter((entity) => entity.kind !== "sun" && entity.kind !== "spacecraft" && entity.radiusKm >= 1_000),
    [entities],
  );
  return (
    <group name="solar-bodies">
      {sun ? <Sun entity={sun} occluders={occluders} /> : null}
      {bodies.map((entity) => (
        <Body key={entity.id} entity={entity} />
      ))}
      {entities.filter((entity) => entity.kind === "spacecraft").map((entity) => (
        <SpacecraftModel key={`craft-${entity.id}`} entity={entity} />
      ))}
      <BodyMarkers entities={markerEntities} />
    </group>
  );
};

export type { EngineState };
export { placeObjectKm };
