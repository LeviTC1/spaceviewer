// Nebulae and star clusters.
//
// Nebulae are ray-marched 3-D noise volumes inside their physical extent (angular size × distance), so a
// sideways pass reveals depth and internal structure instead of overlapping sprites. Morphology follows
// the catalogue class: emission/HII regions are clumpy Hα with an [O III] core, planetaries are thin
// shells, supernova remnants are filamentary shells, reflection nebulae are smooth and blue, dark
// nebulae absorb. Appearance is illustrative; position, size and class are catalogue values.
//
// Clusters are real 3-D point populations with King-like (globular) or loose (open) density profiles,
// drawn as stars so they parallax correctly as the camera moves through them.

import { useEffect, useMemo, useRef, useState, type FC } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CustomBlending,
  OneFactor,
  OneMinusSrcAlphaFactor,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type Mesh,
  type Points,
} from "three";
import { photoDimming, pixelRadiusOf, placeRelative } from "../engine/engineState";
import { blackbodyColor, getEntityWorld, hashString, type UniverseEntity } from "../engine/universeModel";
import { useEngine } from "./EngineContext";
import { NOISE_GLSL } from "./glsl";

const NEBULA_VERTEX = /* glsl */ `
varying vec3 vPosW;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPosW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const NEBULA_FRAGMENT = /* glsl */ `
uniform vec3 uCenter;
uniform float uRadius;
uniform int uStyle; // 0 emission, 1 reflection, 2 planetary, 3 remnant, 4 dark
uniform vec3 uSeed;
uniform vec3 uTint;
uniform float uFade;
uniform int uSteps;
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

void density(vec3 p, out vec3 emission, out float absorb) {
  float r = length(p);
  vec3 q = p * 2.2 + uSeed;
  emission = vec3(0.0);
  absorb = 0.0;
  if (uStyle == 2) {
    // Planetary nebula: bright shell, [O III] interior, Hα/[N II] rim, bipolar lobes.
    float lobes = 1.0 + 0.35 * (p.y * p.y) / max(r * r, 1e-3);
    float shellR = 0.55 * lobes;
    float shell = exp(-pow((r - shellR) / 0.12, 2.0));
    float n = fbm3(q * 2.0, 4);
    float inner = smoothstep(shellR, 0.0, r) * 0.6;
    emission = vec3(0.35, 1.0, 0.85) * (inner * (0.6 + n)) + vec3(1.0, 0.35, 0.4) * shell * (0.7 + n);
    absorb = shell * 0.15;
    return;
  }
  if (uStyle == 3) {
    // Supernova remnant: filamentary expanding shell.
    float shell = exp(-pow((r - 0.72) / 0.18, 2.0));
    float fil = pow(ridged3(q * 1.6, 4), 3.0);
    emission = (vec3(1.0, 0.38, 0.32) * fil + vec3(0.35, 0.75, 1.0) * fil * fil * 0.6) * shell * 2.4;
    emission += vec3(0.5, 0.7, 1.0) * exp(-r * r * 30.0) * 0.4; // synchrotron core glow
    return;
  }
  // Irregular silhouette: the boundary itself is noise-perturbed, so no nebula is a ball.
  vec3 qh = p * 4.2 + uSeed;
  vec3 warp = vec3(fbm3(qh + 3.1, 3), fbm3(qh + 7.7, 3), fbm3(qh + 1.3, 3)) * 1.8;
  float shape = fbm3(p * 1.6 + uSeed * 0.5, 3);
  float rr = r + (shape - 0.5) * 0.75;
  float falloff = smoothstep(0.95, 0.15, rr);
  float n = fbm3(qh + warp, 5);
  float ridges = pow(ridged3(qh * 0.8 + warp, 4), 3.0);
  float clumps = pow(max(n - 0.36, 0.0) * 2.6, 1.7) + ridges * 0.8 * falloff;
  if (uStyle == 1) {
    emission = uTint * vec3(0.55, 0.7, 1.0) * pow(max(n - 0.2, 0.0), 1.2) * falloff * 1.4;
    absorb = clumps * falloff * 0.6;
    return;
  }
  if (uStyle == 4) {
    absorb = clumps * falloff * 6.0;
    emission = vec3(0.4, 0.3, 0.25) * clumps * falloff * 0.05;
    return;
  }
  // Emission / HII region: Hα dominant, [O III] teal toward the ionising core, dark dust pillars.
  float core = exp(-r * r * 9.0);
  float dust = pow(max(fbm3(qh * 0.9 + 11.0 + warp * 0.5, 4) - 0.46, 0.0) * 3.2, 1.3);
  emission = (vec3(1.0, 0.26, 0.38) * clumps + vec3(0.3, 0.9, 0.85) * clumps * core * 1.6) * falloff * 2.6;
  // Ionising young stars at the heart (e.g. the Trapezium) light the core.
  emission += vec3(0.9, 0.95, 1.0) * pow(core, 4.0) * 0.6;
  absorb = dust * falloff * 5.0;
}

void main() {
  vec3 rdW = normalize(vPosW - cameraPosition);
  vec3 ro = (cameraPosition - uCenter) / uRadius;
  vec2 t = sphereHit(ro, rdW);
  if (t.y <= 0.0) discard;
  float t0 = max(t.x, 0.0);
  float t1 = t.y;
  float ds = (t1 - t0) / float(uSteps);
  float jitter = hash12(gl_FragCoord.xy);
  vec3 col = vec3(0.0);
  float tr = 1.0;
  for (int i = 0; i < 40; i++) {
    if (i >= uSteps) break;
    vec3 p = ro + rdW * (t0 + (float(i) + jitter) * ds);
    vec3 e;
    float a;
    density(p, e, a);
    col += tr * e * ds;
    tr *= exp(-a * ds);
    if (tr < 0.03) break;
  }
  col = col * 1.4 / (1.0 + col * 0.6);
  gl_FragColor = vec4(col * uFade, (1.0 - tr) * uFade);
}
`;

const nebulaSphere = new SphereGeometry(1, 40, 24);
const STYLE_INDEX: Record<string, number> = { emission: 0, reflection: 1, planetary: 2, remnant: 3, dark: 4 };

const NebulaVolume: FC<{ entity: UniverseEntity }> = ({ entity }) => {
  const engine = useEngine();
  const meshRef = useRef<Mesh | null>(null);
  const material = useMemo(() => {
    const seed = hashString(entity.id);
    return new ShaderMaterial({
      vertexShader: NEBULA_VERTEX,
      fragmentShader: NEBULA_FRAGMENT,
      uniforms: {
        uCenter: { value: new Vector3() },
        uRadius: { value: 1 },
        uStyle: { value: STYLE_INDEX[entity.nebula ?? "emission"] ?? 0 },
        uSeed: { value: new Vector3((seed % 97) * 0.37, (seed % 89) * 0.41, (seed % 83) * 0.29) },
        uTint: { value: new Vector3(...entity.color) },
        uFade: { value: 1 },
        uSteps: { value: 20 },
      },
      transparent: true,
      depthWrite: false,
      side: BackSide,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
    });
  }, [entity]);
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
    const radius = entity.extentKm * kmToRender;
    mesh.scale.setScalar(radius);
    material.uniforms.uCenter.value.copy(mesh.position);
    material.uniforms.uRadius.value = radius;
    const distance = Math.hypot(world[0] - engine.cameraWorld[0], world[1] - engine.cameraWorld[1], world[2] - engine.cameraWorld[2]);
    const px = pixelRadiusOf(engine, entity.extentKm, distance);
    const fade = Math.min(1, Math.max(0, (px - 3) / 10));
    material.uniforms.uFade.value = fade * Math.pow(10, 0.4 * Math.min(0, engine.exposure)) * photoDimming(engine, entity.id);
    material.uniforms.uSteps.value = engine.quality === "low" ? 12 : engine.quality === "balanced" ? 20 : 28;
    mesh.visible = fade > 0.004;
  });
  return <mesh ref={meshRef} geometry={nebulaSphere} material={material} renderOrder={-8} frustumCulled={false} />;
};

// ---------------------------------------------------------------------------------------------

const CLUSTER_VERTEX = /* glsl */ `
attribute vec3 aColor;
attribute float aLum;
uniform float uPixelRatio;
uniform float uFade;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vColor = aColor;
  vAlpha = uFade * clamp(0.25 + aLum * 1.2, 0.25, 1.0);
  gl_PointSize = (1.8 + aLum * 4.5) * uPixelRatio;
  gl_Position = projectionMatrix * mv;
}
`;
const CLUSTER_FRAGMENT = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (r2 > 1.0) discard;
  float a = exp(-r2 * 5.0) * vAlpha;
  gl_FragColor = vec4(vColor * a, a);
}
`;

const ClusterStars: FC<{ entity: UniverseEntity }> = ({ entity }) => {
  const engine = useEngine();
  const pointsRef = useRef<Points | null>(null);
  const globular = entity.cluster === "globular";
  const geometry = useMemo(() => {
    let s = hashString(entity.id) || 1;
    const rand = () => {
      s = (s * 1_664_525 + 1_013_904_223) >>> 0;
      return s / 4_294_967_296;
    };
    const count = globular ? 6_000 : 420;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const lum = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      // King-like: core radius 0.06 of extent for globulars; open clusters loose with a mild core.
      const u = rand();
      const rc = globular ? 0.05 : 0.3;
      const r = Math.min(1, rc * Math.sqrt(u / Math.max(1e-3, 1 - u * 0.985)));
      const cz = rand() * 2 - 1;
      const phi = rand() * Math.PI * 2;
      const sz = Math.sqrt(1 - cz * cz);
      positions[i * 3] = r * sz * Math.cos(phi);
      positions[i * 3 + 1] = r * cz;
      positions[i * 3 + 2] = r * sz * Math.sin(phi);
      // Globulars: old red giants + main sequence; open: hot blue stars.
      const t = globular ? 3_800 + rand() * 2_600 : rand() < 0.15 ? 4_200 : 8_000 + rand() * 12_000;
      const c = blackbodyColor(t);
      colors.set([0.4 + 0.6 * c[0], 0.4 + 0.6 * c[1], 0.4 + 0.6 * c[2]], i * 3);
      // Open clusters are dominated by a handful of bright young stars (the Pleiades' B stars).
      lum[i] = globular ? Math.pow(rand(), 5) : i < 14 ? 0.85 + rand() * 0.15 : Math.pow(rand(), 3);
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(positions, 3));
    g.setAttribute("aColor", new BufferAttribute(colors, 3));
    g.setAttribute("aLum", new BufferAttribute(lum, 1));
    return g;
  }, [entity.id, globular]);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: CLUSTER_VERTEX,
        fragmentShader: CLUSTER_FRAGMENT,
        uniforms: { uPixelRatio: { value: 1 }, uFade: { value: 1 } },
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    [],
  );
  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);
  useFrame(() => {
    const points = pointsRef.current;
    if (!points) return;
    const world = getEntityWorld(entity, engine.simTimeMs);
    if (!world) {
      points.visible = false;
      return;
    }
    const kmToRender = placeRelative(engine, world, points.position);
    points.scale.setScalar(entity.extentKm * kmToRender);
    const distance = Math.hypot(world[0] - engine.cameraWorld[0], world[1] - engine.cameraWorld[1], world[2] - engine.cameraWorld[2]);
    const px = pixelRadiusOf(engine, entity.extentKm, distance);
    const fade = Math.min(1, Math.max(0, (px - 4) / 12));
    material.uniforms.uFade.value = fade * photoDimming(engine, entity.id);
    material.uniforms.uPixelRatio.value = engine.pixelRatio;
    points.visible = fade > 0.004;
  });
  return <points ref={pointsRef} geometry={geometry} material={material} renderOrder={-7} frustumCulled={false} />;
};

// ---------------------------------------------------------------------------------------------

export const NebulaClusterLayer: FC = () => {
  const engine = useEngine();
  const candidates = useMemo(
    () => engine.index.entities.filter((entity) => (entity.kind === "nebula" || entity.kind === "cluster") && entity.staticWorld),
    [engine.index],
  );
  const [active, setActive] = useState<UniverseEntity[]>([]);
  const lastPick = useRef(0);
  useFrame(() => {
    const now = performance.now();
    if (now - lastPick.current < 220) return;
    lastPick.current = now;
    const scored: Array<{ entity: UniverseEntity; px: number }> = [];
    for (const entity of candidates) {
      const world = getEntityWorld(entity, engine.simTimeMs);
      if (!world) continue;
      const distance = Math.hypot(world[0] - engine.cameraWorld[0], world[1] - engine.cameraWorld[1], world[2] - engine.cameraWorld[2]);
      const px = pixelRadiusOf(engine, entity.extentKm, distance);
      if (px > 3) scored.push({ entity, px });
    }
    scored.sort((a, b) => b.px - a.px);
    const next = scored.slice(0, engine.quality === "low" ? 3 : 8).map((item) => item.entity);
    const same = next.length === active.length && next.every((entity, i) => entity.id === active[i]?.id);
    if (!same) setActive(next);
  });
  return (
    <group name="nebulae-clusters">
      {active.map((entity) =>
        entity.kind === "nebula" ? <NebulaVolume key={entity.id} entity={entity} /> : <ClusterStars key={entity.id} entity={entity} />,
      )}
    </group>
  );
};
