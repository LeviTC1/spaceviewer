// Orbits, resolved stars, exoplanet system architecture and the Galactic Centre black hole.

import { useEffect, useMemo, useRef, type FC } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CustomBlending,
  LineBasicMaterial,
  LineSegments,
  Matrix3,
  OneFactor,
  OneMinusSrcAlphaFactor,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type Group,
  type Mesh,
} from "three";
import type { ExoplanetSystemScientificMetadata } from "../../skymap/core/objects";
import { pixelRadiusOf, placeRelative } from "../engine/engineState";
import { blackbodyColor, getEntityWorld, type UniverseEntity } from "../engine/universeModel";
import { GALACTIC_NORTH_WORLD, KM_PER_AU, cross3, galacticToWorld, normalize3, type Vec3 } from "../engine/units";
import { useEngine } from "./EngineContext";
import { NOISE_GLSL } from "./glsl";

// ---------------------------------------------------------------------------------------------
// Orbit lines

interface OrbitTrack {
  entity: UniverseEntity;
  parent: UniverseEntity | null;
  /** Samples relative to the parent (km), float64. */
  samples: Vec3[];
  periodDays: number;
  sampledAt: number;
  normal: Vec3;
}

const PERIOD_DAYS: Record<string, number> = {
  mercury: 87.97, venus: 224.7, earth: 365.256, mars: 686.98, jupiter: 4_332.6, saturn: 10_759, uranus: 30_687, neptune: 60_190, pluto: 90_560,
};

const sampleOrbit = (entity: UniverseEntity, parent: UniverseEntity | null, centreMs: number, periodDays: number, count: number): Vec3[] => {
  const samples: Vec3[] = [];
  const periodMs = periodDays * 86_400_000;
  for (let i = 0; i <= count; i += 1) {
    const t = centreMs + ((i / count) - 0.5) * periodMs;
    const p = getEntityWorld(entity, t);
    const q = parent ? getEntityWorld(parent, t) : [0, 0, 0] as Vec3;
    if (!p || !q) continue;
    samples.push([p[0] - q[0], p[1] - q[1], p[2] - q[2]]);
  }
  return samples;
};

export const OrbitLines: FC = () => {
  const engine = useEngine();
  const tracks = useMemo<OrbitTrack[]>(() => {
    const list: OrbitTrack[] = [];
    for (const entity of engine.index.entities) {
      if (!entity.solarId) continue;
      if (entity.kind === "planet" || entity.id === "solar:planet:pluto") {
        list.push({ entity, parent: null, samples: [], periodDays: PERIOD_DAYS[entity.solarId] ?? entity.periodDays ?? 365, sampledAt: NaN, normal: [0, 1, 0] });
      } else if (entity.kind === "moon" && entity.parentId) {
        const parent = engine.index.byId.get(entity.parentId) ?? null;
        const moonObject = entity.object?.scientific as { orbitalPeriodDays?: number } | undefined;
        list.push({ entity, parent, samples: [], periodDays: entity.periodDays ?? Math.abs(moonObject?.orbitalPeriodDays ?? 10), sampledAt: NaN, normal: [0, 1, 0] });
      } else if (entity.kind === "dwarf-planet" || entity.kind === "comet") {
        const period = (entity.object?.scientific as { orbitalPeriodDays?: number } | undefined)?.orbitalPeriodDays;
        list.push({ entity, parent: null, samples: [], periodDays: entity.periodDays ?? period ?? 1_680, sampledAt: NaN, normal: [0, 1, 0] });
      }
    }
    return list;
  }, [engine.index]);
  const segmentsPerTrack = 256;
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(tracks.length * segmentsPerTrack * 2 * 3), 3));
    g.setAttribute("color", new BufferAttribute(new Float32Array(tracks.length * segmentsPerTrack * 2 * 4), 4));
    return g;
  }, [tracks.length]);
  const material = useMemo(() => new LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending }), []);
  const line = useMemo(() => new LineSegments(geometry, material), [geometry, material]);
  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);
  const tmp = useMemo(() => ({ x: 0, y: 0, z: 0 }), []);
  const tmp2 = useMemo(() => ({ x: 0, y: 0, z: 0 }), []);

  useFrame(() => {
    line.visible = engine.showOrbits;
    if (!engine.showOrbits) return;
    const positions = geometry.getAttribute("position") as BufferAttribute;
    const colors = geometry.getAttribute("color") as BufferAttribute;
    let v = 0;
    const selected = engine.selectedId;
    const selectedEntity = selected ? engine.index.byId.get(selected) : undefined;
    for (const track of tracks) {
      // Resample when time has moved by more than 2 % of the period (keeps the line under the body).
      const periodMs = track.periodDays * 86_400_000;
      if (!Number.isFinite(track.sampledAt) || Math.abs(engine.simTimeMs - track.sampledAt) > periodMs * 0.02) {
        const count = track.parent ? 128 : track.entity.kind === "comet" ? 256 : 192;
        track.samples = sampleOrbit(track.entity, track.parent, engine.simTimeMs, track.periodDays, count);
        track.sampledAt = engine.simTimeMs;
        if (track.samples.length > 8) {
          const a = track.samples[0];
          const b = track.samples[Math.floor(track.samples.length / 4)];
          const n = normalize3(cross3(a, b));
          if (Number.isFinite(n[0])) track.normal = n;
        }
      }
      const origin = track.parent ? getEntityWorld(track.parent, engine.simTimeMs) : ([0, 0, 0] as Vec3);
      const body = getEntityWorld(track.entity, engine.simTimeMs);
      if (!origin || !body || track.samples.length < 2) continue;
      // Orbit size on screen decides visibility: hide when sub-pixel or when the camera is buried in it.
      const radius = Math.hypot(body[0] - origin[0], body[1] - origin[1], body[2] - origin[2]);
      const distance = Math.hypot(origin[0] - engine.cameraWorld[0], origin[1] - engine.cameraWorld[1], origin[2] - engine.cameraWorld[2]);
      const px = pixelRadiusOf(engine, radius, Math.max(distance, radius));
      const isSelected = track.entity.id === selected;
      const isFamily = selectedEntity && (selectedEntity.id === track.entity.parentId || selectedEntity.parentId === track.entity.parentId);
      let alpha = Math.min(1, Math.max(0, (px - 6) / 30)) * Math.min(1, Math.max(0, (6_000 - px) / 4_000));
      // When the camera sits on (or very near) the orbit itself, the line would slice the view in two.
      const toBody = Math.hypot(body[0] - engine.cameraWorld[0], body[1] - engine.cameraWorld[1], body[2] - engine.cameraWorld[2]);
      alpha *= Math.min(1, Math.max(0, (toBody / Math.max(1, radius) - 0.004) / 0.04));
      // Seen edge-on from near the orbital plane, a family of orbits collapses into bright bars that
      // read as rings or glitches. Fade them unless the camera rises out of the plane.
      const rel: Vec3 = [engine.cameraWorld[0] - origin[0], engine.cameraWorld[1] - origin[1], engine.cameraWorld[2] - origin[2]];
      const height = Math.abs(rel[0] * track.normal[0] + rel[1] * track.normal[1] + rel[2] * track.normal[2]);
      const inPlaneDistance = Math.hypot(rel[0], rel[1], rel[2]);
      const elevation = height / Math.max(1, inPlaneDistance);
      if (!isSelected) alpha *= Math.min(1, Math.max(0.08, (elevation - 0.02) / 0.12));
      // Deep inside an orbit it only surrounds you as a horizon line; it says nothing about where you are.
      alpha *= Math.min(1, Math.max(0, (inPlaneDistance / Math.max(1, radius) - 0.18) / 0.32));
      if (track.parent) alpha *= Math.min(1, Math.max(0, (px - 14) / 40));
      alpha *= isSelected ? 0.95 : isFamily ? 0.5 : track.parent ? 0.28 : track.entity.kind === "comet" ? 0.2 : 0.34;
      if (alpha < 0.01) continue;
      const c = track.entity.color;
      const n = Math.min(track.samples.length - 1, segmentsPerTrack);
      // Fade the trail behind the body so direction of motion is legible.
      for (let i = 0; i < n; i += 1) {
        const a = track.samples[i];
        const b = track.samples[i + 1];
        placeRelative(engine, [origin[0] + a[0], origin[1] + a[1], origin[2] + a[2]], tmp);
        placeRelative(engine, [origin[0] + b[0], origin[1] + b[1], origin[2] + b[2]], tmp2);
        positions.setXYZ(v, tmp.x, tmp.y, tmp.z);
        positions.setXYZ(v + 1, tmp2.x, tmp2.y, tmp2.z);
        const along = i / n;
        const trail = 0.35 + 0.65 * Math.pow(along, 1.5);
        const mix = 0.55;
        const r = c[0] * mix + (1 - mix) * 0.7;
        const g = c[1] * mix + (1 - mix) * 0.78;
        const bl = c[2] * mix + (1 - mix) * 0.9;
        colors.setXYZW(v, r * alpha * trail, g * alpha * trail, bl * alpha * trail, 1);
        colors.setXYZW(v + 1, r * alpha * trail, g * alpha * trail, bl * alpha * trail, 1);
        v += 2;
      }
    }
    geometry.setDrawRange(0, v);
    positions.needsUpdate = true;
    colors.needsUpdate = true;
  });

  return <primitive object={line} renderOrder={5} frustumCulled={false} />;
};

// ---------------------------------------------------------------------------------------------
// Resolved star body (selected star, exoplanet host) with limb darkening and granulation.

const STAR_VERTEX = /* glsl */ `
varying vec3 vNormalW;
varying vec3 vPosW;
varying vec3 vLocal;
void main() {
  vLocal = position;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPosW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const STAR_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
varying vec3 vNormalW;
varying vec3 vPosW;
varying vec3 vLocal;
${NOISE_GLSL}
void main() {
  vec3 n = normalize(vNormalW);
  vec3 v = normalize(cameraPosition - vPosW);
  float mu = max(dot(n, v), 0.0);
  vec3 limb = vec3(1.0) - vec3(0.5, 0.6, 0.75) * (1.0 - pow(mu, 0.8));
  float gran = fbm3(normalize(vLocal) * 48.0 + vec3(uTime * 0.03), 3);
  float spots = smoothstep(0.72, 0.8, fbm3(normalize(vLocal) * 5.0 + 3.0, 3)) * 0.35;
  vec3 col = uColor * (0.85 + gran * 0.3 - spots) * limb * 1.15;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const starSphere = new SphereGeometry(1, 96, 48);

export const StarBody: FC<{ entity: UniverseEntity }> = ({ entity }) => {
  const engine = useEngine();
  const meshRef = useRef<Mesh | null>(null);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: STAR_VERTEX,
        fragmentShader: STAR_FRAGMENT,
        uniforms: { uColor: { value: new Vector3(...blackbodyColor(entity.temperatureK ?? 5_800)) }, uTime: { value: 0 } },
      }),
    [entity.temperatureK],
  );
  useEffect(() => () => material.dispose(), [material]);
  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const world = getEntityWorld(entity, engine.simTimeMs);
    if (!world) return;
    const kmToRender = placeRelative(engine, world, mesh.position);
    mesh.scale.setScalar(entity.radiusKm * kmToRender);
    const distance = Math.hypot(world[0] - engine.cameraWorld[0], world[1] - engine.cameraWorld[1], world[2] - engine.cameraWorld[2]);
    mesh.visible = pixelRadiusOf(engine, entity.radiusKm, distance) > 0.8;
    material.uniforms.uTime.value += delta;
    mesh.rotation.y += delta * 0.02;
  });
  return <mesh ref={meshRef} geometry={starSphere} material={material} renderOrder={9} frustumCulled={false} />;
};

// ---------------------------------------------------------------------------------------------
// Exoplanet system: measured semi-major axes and periods; orientation and appearance are illustrative.

export const ExoplanetSystem: FC<{ entity: UniverseEntity }> = ({ entity }) => {
  const engine = useEngine();
  const groupRef = useRef<Group | null>(null);
  const sci = entity.object?.scientific as ExoplanetSystemScientificMetadata | undefined;
  const planets = useMemo(() => (sci?.planets ?? []).filter((planet) => planet.semiMajorAxisAu), [sci]);
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    const pts: number[] = [];
    for (const planet of planets) {
      const a = planet.semiMajorAxisAu ?? 0.05;
      for (let i = 0; i < 128; i += 1) {
        const t0 = (i / 128) * Math.PI * 2;
        const t1 = ((i + 1) / 128) * Math.PI * 2;
        pts.push(Math.cos(t0) * a, 0, Math.sin(t0) * a, Math.cos(t1) * a, 0, Math.sin(t1) * a);
      }
    }
    g.setAttribute("position", new BufferAttribute(new Float32Array(pts), 3));
    return g;
  }, [planets]);
  const lineMaterial = useMemo(() => new LineBasicMaterial({ color: 0x8fb8ff, transparent: true, opacity: 0.45, depthWrite: false }), []);
  const planetMaterial = useMemo(
    () => new ShaderMaterial({
      vertexShader: STAR_VERTEX,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform vec3 uSunDir;
        varying vec3 vNormalW; varying vec3 vPosW; varying vec3 vLocal;
        void main(){ float l = max(dot(normalize(vNormalW), uSunDir), 0.0); gl_FragColor = vec4(uColor * (0.04 + l * 1.2), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }`,
      uniforms: { uColor: { value: new Vector3(0.7, 0.75, 0.85) }, uSunDir: { value: new Vector3(1, 0, 0) } },
    }),
    [],
  );
  const planetRefs = useRef<Array<Mesh | null>>([]);
  useEffect(() => () => {
    geometry.dispose();
    lineMaterial.dispose();
    planetMaterial.dispose();
  }, [geometry, lineMaterial, planetMaterial]);
  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    const world = getEntityWorld(entity, engine.simTimeMs);
    if (!world) return;
    const kmToRender = placeRelative(engine, world, group.position);
    group.scale.setScalar(KM_PER_AU * kmToRender);
    // Face the system toward the Sun's line of sight (orbital inclinations are mostly unknown).
    const los = normalize3(world);
    const axis = normalize3(cross3(los, [0, 1, 0]));
    group.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(...normalize3(cross3(axis, los))));
    planets.forEach((planet, i) => {
      const mesh = planetRefs.current[i];
      if (!mesh) return;
      const a = planet.semiMajorAxisAu ?? 0.05;
      const period = planet.orbitalPeriodDays ?? 365;
      const angle = ((engine.simTimeMs / 86_400_000) / period) * Math.PI * 2 + i * 1.7;
      mesh.position.set(Math.cos(angle) * a, 0, Math.sin(angle) * a);
      const radiusKm = (planet.radiusEarth ?? Math.cbrt(planet.massEarth ?? 1)) * 6_371;
      mesh.scale.setScalar(Math.max(radiusKm / KM_PER_AU, 1e-9));
    });
    const sunDir = new Vector3(0, 0, 0);
    planetMaterial.uniforms.uSunDir.value = sunDir.set(-1, 0, 0);
    const distance = Math.hypot(world[0] - engine.cameraWorld[0], world[1] - engine.cameraWorld[1], world[2] - engine.cameraWorld[2]);
    group.visible = pixelRadiusOf(engine, entity.extentKm, distance) > 8;
  });
  return (
    <group ref={groupRef}>
      <lineSegments geometry={geometry} material={lineMaterial} renderOrder={6} />
      {planets.map((planet, i) => (
        <mesh
          key={planet.name}
          ref={(mesh) => {
            planetRefs.current[i] = mesh;
          }}
          geometry={starSphere}
          material={planetMaterial}
          renderOrder={10}
        />
      ))}
    </group>
  );
};

// ---------------------------------------------------------------------------------------------
// Sagittarius A*: Schwarzschild null-geodesic integration inside an impostor sphere. The thin disk,
// photon ring and lensed background respond to viewing angle. Illustrative: Sgr A* hosts no bright
// thin disk; the treatment shows how its gravity bends light.

const BH_VERTEX = /* glsl */ `
varying vec3 vPosW;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPosW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const BH_FRAGMENT = /* glsl */ `
uniform vec3 uCenter;
uniform float uRs;          // Schwarzschild radius (render units)
uniform float uOuter;       // impostor radius in Rs
uniform mat3 uWorldToLocal; // local y = disk normal
uniform float uTime;
varying vec3 vPosW;
${NOISE_GLSL}

vec3 background(vec3 dir) {
  // Procedural star field + galactic glow, sampled along the *bent* direction so lensing is coherent.
  vec3 d = normalize(dir);
  float glow = exp(-abs(d.y) * 6.0) * 0.06;
  vec3 cell = floor(d * 220.0);
  float star = step(0.9965, hash13(cell)) * hash13(cell + 3.1);
  return vec3(1.0, 0.85, 0.7) * glow + vec3(star);
}

void main() {
  vec3 rd = normalize(uWorldToLocal * normalize(vPosW - cameraPosition));
  vec3 pos = uWorldToLocal * ((cameraPosition - uCenter) / uRs);
  // Start on the impostor sphere if the camera is outside it.
  float b = dot(pos, rd);
  float c = dot(pos, pos) - uOuter * uOuter;
  float h = b * b - c;
  if (h < 0.0) discard;
  float tEnter = -b - sqrt(h);
  if (tEnter > 0.0) pos += rd * tEnter;
  vec3 vel = rd;
  vec3 hvec = cross(pos, vel);
  float h2 = dot(hvec, hvec);
  vec3 col = vec3(0.0);
  float alpha = 0.0;
  bool captured = false;
  for (int i = 0; i < 160; i++) {
    float r = length(pos);
    if (r < 1.0) { captured = true; break; }
    if (r > uOuter * 1.01 && dot(pos, vel) > 0.0) break;
    float dt = clamp(0.06 * r, 0.02, 0.6);
    vec3 prev = pos;
    vec3 acc = -1.5 * h2 * pos / pow(r, 5.0);
    vel += acc * dt;
    pos += vel * dt;
    // Disk crossing (local y = 0) between 3 Rs (ISCO) and 11 Rs.
    if (prev.y * pos.y < 0.0) {
      float f = prev.y / (prev.y - pos.y);
      vec3 hit = mix(prev, pos, f);
      float rh = length(hit.xz);
      if (rh > 3.0 && rh < 11.0) {
        float ang = atan(hit.z, hit.x);
        float temp = pow(3.0 / rh, 0.75) * (1.0 - sqrt(3.0 / rh) * 0.6);
        float turb = 0.6 + 0.4 * fbm3(vec3(rh * 1.6, ang * 2.5 - uTime * 0.5 / rh, 0.0), 4);
        // Keplerian velocity → Doppler beaming toward the approaching side.
        vec3 orbitDir = normalize(vec3(-hit.z, 0.0, hit.x));
        float beta = sqrt(0.5 / max(rh - 1.0, 0.5));
        float doppler = 1.0 / (1.0 - beta * dot(orbitDir, -normalize(vel)));
        float boost = pow(doppler, 3.0);
        vec3 hot = mix(vec3(1.0, 0.45, 0.15), vec3(1.0, 0.92, 0.8), clamp(temp * 1.4, 0.0, 1.0));
        float edge = smoothstep(3.0, 3.6, rh) * smoothstep(11.0, 8.0, rh);
        float a = edge * (1.0 - alpha) * 0.92;
        col += hot * temp * turb * boost * a * 3.2;
        alpha += a;
        if (alpha > 0.98) break;
      }
    }
  }
  float outA = 1.0;
  if (!captured) {
    float bImpact = sqrt(h2);
    // Replace the scene behind with the lensed background only where bending is strong; blend out to
    // the impostor edge so there is no visible disc.
    float w = smoothstep(uOuter * 0.95, uOuter * 0.3, bImpact);
    col += (1.0 - alpha) * w * background(vel) * 0.9;
    // Photon ring: rays that skimmed the photon sphere (critical impact parameter 3√3/2 Rs).
    col += vec3(1.0, 0.8, 0.55) * exp(-pow((bImpact - 2.598) * 7.0, 2.0)) * 0.9 * (1.0 - alpha);
    outA = clamp(alpha + (1.0 - alpha) * w, 0.0, 1.0);
  }
  gl_FragColor = vec4(col, outA);
}
`;

export const BlackHole: FC<{ entity: UniverseEntity }> = ({ entity }) => {
  const engine = useEngine();
  const meshRef = useRef<Mesh | null>(null);
  const outer = entity.extentKm / entity.radiusKm;
  const material = useMemo(() => {
    // Tilt the illustrative disk ~30° from the Galactic plane so it reads at a glance.
    const n = normalize3([
      GALACTIC_NORTH_WORLD[0] * 0.87 + galacticToWorld(1, 0, 0)[0] * 0.5,
      GALACTIC_NORTH_WORLD[1] * 0.87 + galacticToWorld(1, 0, 0)[1] * 0.5,
      GALACTIC_NORTH_WORLD[2] * 0.87 + galacticToWorld(1, 0, 0)[2] * 0.5,
    ]);
    const x = normalize3(cross3(n, [0, 0, 1]));
    const z = normalize3(cross3(x, n));
    return new ShaderMaterial({
      vertexShader: BH_VERTEX,
      fragmentShader: BH_FRAGMENT,
      uniforms: {
        uCenter: { value: new Vector3() },
        uRs: { value: 1 },
        uOuter: { value: outer },
        uWorldToLocal: { value: new Matrix3().set(x[0], x[1], x[2], n[0], n[1], n[2], z[0], z[1], z[2]) },
        uTime: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      side: BackSide,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
    });
  }, [outer]);
  useEffect(() => () => material.dispose(), [material]);
  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const world = getEntityWorld(entity, engine.simTimeMs);
    if (!world) return;
    const kmToRender = placeRelative(engine, world, mesh.position);
    mesh.scale.setScalar(entity.extentKm * kmToRender);
    material.uniforms.uCenter.value.copy(mesh.position);
    material.uniforms.uRs.value = entity.radiusKm * kmToRender;
    material.uniforms.uTime.value += delta;
    const distance = Math.hypot(world[0] - engine.cameraWorld[0], world[1] - engine.cameraWorld[1], world[2] - engine.cameraWorld[2]);
    mesh.visible = pixelRadiusOf(engine, entity.extentKm, distance) > 2;
  });
  return <mesh ref={meshRef} geometry={starSphere} material={material} renderOrder={8} frustumCulled={false} />;
};

export { AdditiveBlending };
