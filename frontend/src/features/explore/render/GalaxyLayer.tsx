// Volumetric galaxies.
//
// One shared renderer for every disk, elliptical and irregular galaxy, including the Milky Way. Each
// galaxy is a ray-marched volume inside its bounding sphere: an exponential disk with a face-on density
// map (arms, young clusters, dust), a vertical profile, a bulge and an optional bar. Inclination and
// position angle come from catalogue axis ratios and PAs; size from angular size and distance. Because
// surface brightness is distance-independent, the same object reads correctly from inside, edge-on,
// face-on or across the Local Group.
//
// The Milky Way's face-on map draws its spiral arms from the Reid et al. (2019) log-spiral fits within
// their measured azimuth ranges; extrapolations are drawn fainter. Everything else about the disk,
// bulge and bar is an illustrative model with published scale parameters.

import { useEffect, useMemo, useRef, useState, type FC } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CustomBlending,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix3,
  OneFactor,
  OneMinusSrcAlphaFactor,
  RGBAFormat,
  ShaderMaterial,
  SphereGeometry,
  UnsignedByteType,
  Vector3,
  type Mesh,
} from "three";
import { photoDimming, pixelRadiusOf, placeRelative } from "../engine/engineState";
import { getEntityRenderWorld, getEntityWorld, hashString, type UniverseEntity } from "../engine/universeModel";
import { KM_PER_KPC, KM_PER_LY, cross3, galacticToWorld, normalize3, type Vec3 } from "../engine/units";
import { magnitudeToPoint, useEngine } from "./EngineContext";
import { NOISE_GLSL } from "./glsl";

// ---------------------------------------------------------------------------------------------
// CPU value noise for density-map generation

const makeNoise2 = (seed: number) => {
  const perm = new Uint8Array(512);
  let s = seed || 1;
  const rand = () => {
    s = (s * 1_664_525 + 1_013_904_223) >>> 0;
    return s / 4_294_967_296;
  };
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i += 1) perm[i] = p[i & 255];
  const grad = (h: number) => (h / 255) * 2 - 1;
  const noise = (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = perm[(perm[xi & 255] + (yi & 255)) & 511];
    const b = perm[(perm[(xi + 1) & 255] + (yi & 255)) & 511];
    const c = perm[(perm[xi & 255] + ((yi + 1) & 255)) & 511];
    const d = perm[(perm[(xi + 1) & 255] + ((yi + 1) & 255)) & 511];
    const x1 = grad(a) + (grad(b) - grad(a)) * u;
    const x2 = grad(c) + (grad(d) - grad(c)) * u;
    return x1 + (x2 - x1) * v; // −1..1
  };
  const fbm = (x: number, y: number, octaves = 4) => {
    let sum = 0;
    let amp = 0.5;
    let f = 1;
    for (let o = 0; o < octaves; o += 1) {
      sum += amp * noise(x * f, y * f);
      f *= 2.02;
      amp *= 0.5;
    }
    return sum;
  };
  return { noise, fbm, rand };
};

const toTexture = (data: Uint8Array, size: number) => {
  const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
};

interface ArmSegment {
  betaMinDeg: number;
  betaMaxDeg: number;
  betaKinkDeg: number;
  radiusKinkKpc: number;
  pitchBeforeDeg: number;
  pitchAfterDeg: number;
  widthKpc: number;
}

/** Galactic-plane density map of the Milky Way. Texture u = galactic X (Sun→GC), v = −galactic Y. */
const createMilkyWayTexture = (segments: ArmSegment[], extentKpc: number) => {
  const size = 512;
  const data = new Uint8Array(size * size * 4);
  const { fbm } = makeNoise2(2_019);
  const R0 = 8.178;
  const DEG = Math.PI / 180;
  const barAngle = 27 * DEG;
  const barAxis = [-Math.cos(barAngle), Math.sin(barAngle)];
  for (let j = 0; j < size; j += 1) {
    for (let i = 0; i < size; i += 1) {
      const u = ((i + 0.5) / size) * 2 - 1;
      const v = ((j + 0.5) / size) * 2 - 1;
      const X = u * extentKpc; // galactic X relative to GC
      const Y = -v * extentKpc; // galactic Y relative to GC
      const R = Math.hypot(X, Y);
      // Galactocentric azimuth: 0 on the GC→Sun line, increasing toward Galactic rotation (+Y at the Sun).
      const beta = Math.atan2(Y, -X);
      let arms = 0;
      let dust = 0;
      for (const seg of segments) {
        for (let wind = -1; wind <= 1; wind += 1) {
          const b = beta / DEG + wind * 360;
          const pitch = (b < seg.betaKinkDeg ? seg.pitchBeforeDeg : seg.pitchAfterDeg) * DEG;
          const rArm = seg.radiusKinkKpc * Math.exp(-(b - seg.betaKinkDeg) * DEG * Math.tan(pitch));
          if (!Number.isFinite(rArm) || rArm < 2.5 || rArm > 18) continue;
          const width = Math.max(0.12, seg.widthKpc + 0.042 * (rArm - seg.radiusKinkKpc)) * 2.4;
          const measured = b >= seg.betaMinDeg && b <= seg.betaMaxDeg;
          const outside = measured ? 0 : Math.min(Math.abs(b - seg.betaMinDeg), Math.abs(b - seg.betaMaxDeg));
          const reach = measured ? 1 : Math.max(0.28, Math.exp(-outside / 70));
          const d = (R - rArm) / width;
          arms = Math.max(arms, Math.exp(-d * d) * reach);
          const dd = (R - (rArm - width * 0.55)) / (width * 0.5);
          dust = Math.max(dust, Math.exp(-dd * dd) * reach);
        }
      }
      const n = fbm(X * 0.45, Y * 0.45, 5);
      const clumps = Math.max(0, fbm(X * 1.6 + 9, Y * 1.6 - 3, 3) * 1.8);
      // Bar: elongated ellipsoid along the bar axis, half-length ~5 kpc.
      const bx = X * barAxis[0] + Y * barAxis[1];
      const by = -X * barAxis[1] + Y * barAxis[0];
      const bar = Math.exp(-((bx / 4.4) ** 2 + (by / 1.2) ** 2) * 2.2);
      const armLight = Math.min(1, arms * (0.75 + 0.5 * n) + bar * 0.9);
      const young = Math.min(1, arms * clumps * clumps * 1.6);
      const dustLane = Math.min(1, (dust * 0.85 + Math.max(0, n) * 0.35 * arms) * (0.6 + 0.6 * Math.max(0, fbm(X * 0.9 - 4, Y * 0.9, 4) + 0.3)));
      const o = (j * size + i) * 4;
      data[o] = Math.round(armLight * 255);
      data[o + 1] = Math.round(young * 255);
      data[o + 2] = Math.round(dustLane * 255);
      data[o + 3] = Math.round(Math.min(1, bar) * 255);
    }
  }
  void R0;
  return toTexture(data, size);
};

/** Generic face-on density for spiral, barred and irregular galaxies (illustrative morphology). */
const createDiskTexture = (seed: number, morphology: string) => {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  const { fbm, rand } = makeNoise2(seed);
  const armCount = morphology === "irregular" ? 0 : rand() < 0.7 ? 2 : 3;
  const pitch = (11 + rand() * 16) * (Math.PI / 180);
  const phase = rand() * Math.PI * 2;
  const winding = rand() < 0.5 ? 1 : -1;
  const barred = morphology === "barred";
  const barAngle = rand() * Math.PI;
  for (let j = 0; j < size; j += 1) {
    for (let i = 0; i < size; i += 1) {
      const u = ((i + 0.5) / size) * 2 - 1;
      const v = ((j + 0.5) / size) * 2 - 1;
      const r = Math.hypot(u, v);
      const theta = Math.atan2(v, u) * winding;
      const n = fbm(u * 5, v * 5, 5);
      let arms: number;
      let dust: number;
      if (armCount > 0 && r > 0.04) {
        const start = barred ? 0.22 : 0.08;
        const spiralPhase = armCount * (theta - Math.log(Math.max(r, start) / start) / Math.tan(pitch) - phase);
        const a = 0.5 + 0.5 * Math.cos(spiralPhase + n * 1.4);
        arms = Math.pow(a, 3.2) * Math.min(1, (r - 0.04) * 6);
        const dl = 0.5 + 0.5 * Math.cos(spiralPhase + 0.75 + n * 1.4);
        dust = Math.pow(dl, 6) * Math.min(1, r * 4) * (r < 0.95 ? 1 : 0);
      } else {
        arms = Math.max(0, n * 1.6 + 0.35);
        dust = Math.max(0, fbm(u * 7 + 3, v * 7, 4)) * 0.6;
      }
      const clumps = Math.max(0, fbm(u * 18 + 5, v * 18 - 2, 3) * 2.2);
      const bu = u * Math.cos(barAngle) + v * Math.sin(barAngle);
      const bv = -u * Math.sin(barAngle) + v * Math.cos(barAngle);
      const bar = barred ? Math.exp(-((bu / 0.24) ** 2 + (bv / 0.07) ** 2) * 2) : 0;
      const o = (j * size + i) * 4;
      data[o] = Math.round(Math.min(1, arms * (0.7 + 0.5 * (n + 0.5)) + bar) * 255);
      data[o + 1] = Math.round(Math.min(1, arms * clumps * clumps) * 255);
      data[o + 2] = Math.round(Math.min(1, dust * (0.6 + Math.max(0, n) * 0.8)) * 255);
      data[o + 3] = Math.round(bar * 255);
    }
  }
  return toTexture(data, size);
};

const textureCache = new Map<string, DataTexture>();
let milkyWayArms: ArmSegment[] | null = null;
let milkyWayArmsPromise: Promise<ArmSegment[]> | null = null;
const loadMilkyWayArms = () => {
  if (milkyWayArms) return Promise.resolve(milkyWayArms);
  if (!milkyWayArmsPromise) {
    milkyWayArmsPromise = fetch("/catalogs/milky-way/manifest.json")
      .then((response) => response.json())
      .then((manifest: { armModel?: { segments?: ArmSegment[] } }) => {
        milkyWayArms = manifest.armModel?.segments ?? [];
        return milkyWayArms;
      })
      .catch(() => {
        milkyWayArms = [];
        return milkyWayArms;
      });
  }
  return milkyWayArmsPromise;
};

export const MILKY_WAY_EXTENT_KPC = 17;

const getDensityTexture = (entity: UniverseEntity): DataTexture | null => {
  const key = entity.id;
  const cached = textureCache.get(key);
  if (cached) return cached;
  if (entity.id === "galactic:milky-way-structure") {
    if (!milkyWayArms) {
      void loadMilkyWayArms();
      return null;
    }
    const texture = createMilkyWayTexture(milkyWayArms, MILKY_WAY_EXTENT_KPC);
    textureCache.set(key, texture);
    return texture;
  }
  const texture = createDiskTexture(entity.galaxy?.seed ?? hashString(entity.id), entity.galaxy?.morphology ?? "spiral");
  textureCache.set(key, texture);
  return texture;
};

// ---------------------------------------------------------------------------------------------
// Ray-marched volume shader

const VOLUME_VERTEX = /* glsl */ `
varying vec3 vPosW;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPosW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const VOLUME_FRAGMENT = /* glsl */ `
uniform sampler2D uDensity;
uniform float uHasDensity;
uniform mat3 uWorldToLocal;
uniform vec3 uCenter;
uniform float uRadius;
uniform int uType;          // 0 spiral/barred, 1 elliptical/dwarf spheroidal, 2 irregular, 3 lenticular
uniform float uDiskScale;   // exponential scale length (local units)
uniform float uThickness;   // vertical scale height (local units)
uniform float uBulge;       // bulge strength
uniform float uBulgeSize;
uniform float uAxisRatio;   // for ellipticals
uniform float uBrightness;
uniform float uDust;
uniform int uSteps;
uniform float uFade;
varying vec3 vPosW;
${NOISE_GLSL}

vec2 sphereHit(vec3 ro, vec3 rd) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - 1.0;
  float h = b * b - c;
  if (h < 0.0) return vec2(-1.0);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}

void main() {
  vec3 rdW = normalize(vPosW - cameraPosition);
  vec3 ro = uWorldToLocal * ((cameraPosition - uCenter) / uRadius);
  vec3 rd = normalize(uWorldToLocal * rdW);
  vec2 t = sphereHit(ro, rd);
  if (t.y <= 0.0) discard;
  float t0 = max(t.x, 0.0);
  float t1 = t.y;
  // Clip to the disk slab for flattened systems: most of the sphere is empty space.
  if (uType != 1) {
    float slab = uThickness * 7.0 + uBulgeSize * 1.4;
    if (abs(rd.y) > 1e-5) {
      float ta = (-slab - ro.y) / rd.y;
      float tb = (slab - ro.y) / rd.y;
      t0 = max(t0, min(ta, tb));
      t1 = min(t1, max(ta, tb));
    } else if (abs(ro.y) > slab) {
      discard;
    }
  }
  if (t1 <= t0) discard;
  float jitter = hash12(gl_FragCoord.xy + fract(uFade * 13.0));
  float ds = (t1 - t0) / float(uSteps);
  vec3 col = vec3(0.0);
  float transmittance = 1.0;
  for (int i = 0; i < 48; i++) {
    if (i >= uSteps) break;
    vec3 q = ro + rd * (t0 + (float(i) + jitter) * ds);
    float r = length(q.xz);
    float z = q.y;
    vec3 emission = vec3(0.0);
    float absorb = 0.0;
    if (uType == 1) {
      // De Vaucouleurs-like spheroid, smooth and warm.
      float re = length(vec3(q.x, q.y / max(uAxisRatio, 0.2), q.z));
      float rho = exp(-7.67 * (pow(max(re / 0.22, 1e-4), 0.25) - 1.0)) * 0.004;
      emission = vec3(1.0, 0.82, 0.62) * rho;
    } else {
      vec2 uv = q.xz * 0.5 + 0.5;
      vec4 d = uHasDensity > 0.5 ? texture2D(uDensity, uv) : vec4(0.4, 0.1, 0.2, 0.0);
      float disk = exp(-r / uDiskScale) * smoothstep(1.0, 0.82, r);
      float vertical = exp(-abs(z) / uThickness);
      float verticalYoung = exp(-abs(z) / (uThickness * 0.45));
      float armBoost = uType == 3 ? 0.25 : 1.0;
      float oldLight = disk * vertical * (0.18 + 1.25 * d.r * armBoost);
      float youngLight = disk * verticalYoung * (d.g * 2.6 + d.r * 0.35) * armBoost;
      vec3 bulgeQ = vec3(q.x, q.y / 0.65, q.z);
      float rb = length(bulgeQ) / uBulgeSize;
      float bulge = exp(-pow(rb, 0.9) * 2.2) * uBulge;
      float bar = d.a * exp(-abs(z) / (uThickness * 1.8)) * 0.8;
      float clumpNoise = uType == 2 ? (0.5 + vnoise3(q * 9.0)) : 1.0;
      emission = (vec3(1.0, 0.9, 0.76) * oldLight + vec3(0.62, 0.76, 1.0) * youngLight * clumpNoise
        + vec3(1.0, 0.45, 0.55) * youngLight * youngLight * 0.6
        + vec3(1.0, 0.8, 0.56) * (bulge + bar)) ;
      absorb = disk * exp(-abs(z) / (uThickness * 0.35)) * d.b * uDust;
    }
    col += transmittance * emission * ds * 26.0;
    transmittance *= exp(-absorb * ds * 140.0);
    if (transmittance < 0.02) break;
  }
  col *= uBrightness;
  // Filmic compression keeps bright bulges from clipping to white.
  col = col / (1.0 + col * 0.65);
  float alpha = (1.0 - transmittance) * uFade;
  gl_FragColor = vec4(col * uFade, alpha);
}
`;

const volumeSphere = new SphereGeometry(1, 48, 32);

const GalaxyVolume: FC<{ entity: UniverseEntity }> = ({ entity }) => {
  const engine = useEngine();
  const meshRef = useRef<Mesh | null>(null);
  const isMilkyWay = entity.id === "galactic:milky-way-structure";
  const morphology = entity.galaxy?.morphology ?? "spiral";
  const type = morphology === "elliptical" || morphology === "dwarf-spheroidal" ? 1 : morphology === "irregular" ? 2 : morphology === "lenticular" ? 3 : 0;
  const material = useMemo(() => {
    const normal = entity.galaxy?.normal ?? [0, 1, 0];
    const major = isMilkyWay ? normalize3(galacticToWorld(1, 0, 0)) : entity.galaxy?.major ?? [1, 0, 0];
    const third = normalize3(cross3(major, normal));
    const worldToLocal = new Matrix3().set(
      major[0], major[1], major[2],
      normal[0], normal[1], normal[2],
      third[0], third[1], third[2],
    );
    const seed = entity.galaxy?.seed ?? 1;
    const hubble = (entity.object?.scientific as { hubbleType?: string } | undefined)?.hubbleType ?? "";
    const earlyType = morphology === "lenticular" || /^S0|^Sa(?!b)|^SBa/i.test(hubble);
    return new ShaderMaterial({
      vertexShader: VOLUME_VERTEX,
      fragmentShader: VOLUME_FRAGMENT,
      uniforms: {
        uDensity: { value: null },
        uHasDensity: { value: 0 },
        uWorldToLocal: { value: worldToLocal },
        uCenter: { value: new Vector3() },
        uRadius: { value: 1 },
        uType: { value: type },
        uDiskScale: { value: isMilkyWay ? 2.6 / MILKY_WAY_EXTENT_KPC : 0.24 + (seed % 7) * 0.012 },
        uThickness: { value: isMilkyWay ? 0.3 / MILKY_WAY_EXTENT_KPC : type === 2 ? 0.06 : 0.022 },
        uBulge: { value: type === 2 ? 0.05 : earlyType ? 1.5 : isMilkyWay ? 0.32 : 0.55 },
        uBulgeSize: { value: isMilkyWay ? 1.2 / MILKY_WAY_EXTENT_KPC : earlyType ? 0.13 : 0.08 },
        uAxisRatio: { value: 0.75 },
        uBrightness: { value: 1 },
        uDust: { value: type === 2 ? 0.35 : morphology === "lenticular" ? 0.15 : 1 },
        uSteps: { value: 24 },
        uFade: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: BackSide,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
    });
  }, [entity, isMilkyWay, morphology, type]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const world = getEntityWorld(entity, engine.simTimeMs);
    if (!world) {
      mesh.visible = false;
      return;
    }
    const kmToRender = placeRelative(engine, world, mesh.position);
    const radiusRender = entity.extentKm * kmToRender;
    mesh.scale.setScalar(radiusRender);
    const u = material.uniforms;
    u.uCenter.value.copy(mesh.position);
    u.uRadius.value = radiusRender;
    if (!u.uHasDensity.value && type !== 1) {
      const texture = getDensityTexture(entity);
      if (texture) {
        u.uDensity.value = texture;
        u.uHasDensity.value = 1;
      }
    }
    const distance = Math.hypot(world[0] - engine.cameraWorld[0], world[1] - engine.cameraWorld[1], world[2] - engine.cameraWorld[2]);
    const pixelRadius = pixelRadiusOf(engine, entity.extentKm, distance);
    // The Milky Way model fades in only once the Sun-centred panorama no longer represents the sky.
    let fade = Math.min(1, Math.max(0, (pixelRadius - 2) / 6));
    // The panorama and the Milky Way model are complementary views of the same galaxy (see Driver).
    if (isMilkyWay) fade *= 1 - engine.panoramaWeight;
    u.uFade.value = fade;
    // Steps scale down as the volume fills the screen: per-pixel cost is what matters on Retina.
    const coverage = Math.min(1, Math.max(0.45, 1.35 - pixelRadius / engine.viewportHeight));
    const baseSteps = engine.quality === "low" ? 14 : engine.quality === "balanced" ? 22 : engine.quality === "high" ? 28 : 36;
    u.uSteps.value = Math.round(baseSteps * coverage);
    // Deep inside a bulge the integrated light would saturate: expose for it like a camera would.
    const inside = Math.max(0, 1 - distance / (entity.extentKm * 0.35));
    u.uBrightness.value = ((isMilkyWay ? 0.75 : 0.85) * Math.pow(10, 0.4 * Math.min(0, engine.exposure)) * photoDimming(engine, entity.id)) / (1 + inside * 14);
    mesh.visible = fade > 0.004;
  });

  return <mesh ref={meshRef} geometry={volumeSphere} material={material} renderOrder={-10} frustumCulled={false} />;
};

// ---------------------------------------------------------------------------------------------
// Distant deep-sky markers (galaxies, nebulae, clusters too small to resolve)

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
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p;
}
`;

const MARKER_FRAGMENT = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (r2 > 1.0) discard;
  float core = exp(-r2 * 3.5);
  gl_FragColor = vec4(vColor * core * vAlpha, core * vAlpha);
}
`;

export const DeepSkyMarkers: FC<{ entities: UniverseEntity[] }> = ({ entities }) => {
  const engine = useEngine();
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
        depthTest: false,
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
    const limit = 6.8 + engine.exposure;
    for (let i = 0; i < count; i += 1) {
      const entity = entities[i];
      const world = getEntityRenderWorld(entity, engine.simTimeMs, engine.cameraWorld);
      placeRelative(engine, world, tmp);
      positions.setXYZ(i, tmp.x, tmp.y, tmp.z);
      const distance = Math.hypot(world[0] - engine.cameraWorld[0], world[1] - engine.cameraWorld[1], world[2] - engine.cameraWorld[2]);
      const pixelRadius = entity.direction
        ? ((entity.angularSizeArcMin ?? 2) / 60 / 2) * (Math.PI / 180) * (engine.viewportHeight / 2 / Math.tan(engine.fovY / 2))
        : pixelRadiusOf(engine, entity.extentKm, distance);
      let magnitude: number;
      const sci = entity.object?.scientific as { apparentMagnitude?: number } | undefined;
      if (entity.direction) {
        magnitude = sci?.apparentMagnitude ?? 11;
      } else if (entity.absoluteMagnitude !== undefined) {
        const pc = distance / (KM_PER_LY * 3.2615638);
        magnitude = entity.absoluteMagnitude + 5 * (Math.log10(Math.max(1e-9, pc)) - 1);
      } else {
        const pc = distance / (KM_PER_LY * 3.2615638);
        const base = entity.kind === "galaxy" ? -18 : entity.kind === "cluster" ? -6 : -3;
        magnitude = base + 5 * (Math.log10(Math.max(1e-9, pc)) - 1);
      }
      const point = magnitudeToPoint(magnitude, limit);
      const resolved = entity.kind === "galaxy" || entity.kind === "structure" ? Math.min(1, Math.max(0, (pixelRadius - 2) / 6)) : Math.min(1, Math.max(0, (pixelRadius - 3) / 8));
      const focus = entity.id === engine.selectedId || entity.id === engine.hoveredId;
      // Extended objects never become needle-sharp points: soften by surface brightness.
      const alpha = Math.max(point.alpha * 0.9, focus ? 0.8 : 0) * (1 - resolved);
      alphas.setX(i, entity.id === "galactic:milky-way-structure" ? alpha * (1 - engine.panoramaWeight) : alpha);
      sizes.setX(i, Math.max(2.2, Math.min(14, point.size + pixelRadius * 1.6)));
      colors.setXYZ(i, entity.color[0], entity.color[1], entity.color[2]);
    }
    positions.needsUpdate = true;
    sizes.needsUpdate = true;
    alphas.needsUpdate = true;
    colors.needsUpdate = true;
  });

  return <points geometry={geometry} material={material} frustumCulled={false} renderOrder={-15} />;
};

// ---------------------------------------------------------------------------------------------

/** Chooses which galaxies are large enough on screen to deserve a volume, a few times per second. */
export const GalaxyLayer: FC = () => {
  const engine = useEngine();
  const galaxies = useMemo(
    () => engine.index.entities.filter((entity) => (entity.kind === "galaxy" || entity.kind === "structure") && entity.galaxy && !entity.direction),
    [engine.index],
  );
  const [active, setActive] = useState<UniverseEntity[]>([]);
  const lastPick = useRef(0);
  useEffect(() => {
    void loadMilkyWayArms();
  }, []);
  useFrame(() => {
    const now = performance.now();
    if (now - lastPick.current < 200) return;
    lastPick.current = now;
    const scored: Array<{ entity: UniverseEntity; px: number }> = [];
    for (const entity of galaxies) {
      const world = getEntityWorld(entity, engine.simTimeMs);
      if (!world) continue;
      const distance = Math.hypot(world[0] - engine.cameraWorld[0], world[1] - engine.cameraWorld[1], world[2] - engine.cameraWorld[2]);
      const px = pixelRadiusOf(engine, entity.extentKm, distance);
      if (px > 1.5) scored.push({ entity, px });
    }
    scored.sort((a, b) => b.px - a.px);
    const limit = engine.quality === "low" ? 4 : engine.quality === "balanced" ? 8 : 14;
    const next = scored.slice(0, limit).map((item) => item.entity);
    const same = next.length === active.length && next.every((entity, i) => entity.id === active[i]?.id);
    if (!same) setActive(next);
  });
  return (
    <group name="galaxies">
      {active.map((entity) => (
        <GalaxyVolume key={entity.id} entity={entity} />
      ))}
    </group>
  );
};

export const MILKY_WAY_RADIUS_KM = MILKY_WAY_EXTENT_KPC * KM_PER_KPC;
export type { Vec3 };
