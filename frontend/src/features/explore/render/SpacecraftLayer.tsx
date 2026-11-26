// Spacecraft: simplified silhouettes built from published dimensions (metres), placed on their measured
// trajectories, plus the path of the selected mission: where it has been (bright) and where it is
// planned to go (faint). Earth orbiters show one orbit around the Earth instead.

import { useFrame } from "@react-three/fiber";
import { type FC, type ReactNode, useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  type Group,
  LineBasicMaterial,
  LineSegments,
  ShaderMaterial,
  Vector3,
} from "three";
import { pixelRadiusOf, placeRelative } from "../engine/engineState";
import { getEntityWorld, type CraftShape, type UniverseEntity } from "../engine/universeModel";
import { normalize3, type Vec3 } from "../engine/units";
import { useEngine } from "./EngineContext";

const VERTEX = /* glsl */ `
varying vec3 vNormalW;
varying vec3 vPosW;
void main() {
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPosW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uSunDir;
uniform float uSpec;
varying vec3 vNormalW;
varying vec3 vPosW;
void main() {
  vec3 n = normalize(vNormalW);
  vec3 v = normalize(cameraPosition - vPosW);
  if (dot(n, v) < 0.0) n = -n;
  float d = max(dot(n, uSunDir), 0.0);
  vec3 h = normalize(uSunDir + v);
  float spec = pow(max(dot(n, h), 0.0), 40.0) * uSpec;
  gl_FragColor = vec4(uColor * (0.07 + d * 1.1) + vec3(spec), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const PALETTE = {
  white: [0.9, 0.9, 0.88],
  silver: [0.72, 0.72, 0.74],
  gold: [0.86, 0.64, 0.26],
  bus: [0.55, 0.5, 0.4],
  panel: [0.1, 0.13, 0.28],
  kapton: [0.72, 0.62, 0.78],
  dark: [0.2, 0.2, 0.22],
} as const;
type Paint = keyof typeof PALETTE;

const makeMaterials = () =>
  Object.fromEntries(
    Object.entries(PALETTE).map(([key, color]) => [
      key,
      new ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: { uColor: { value: new Vector3(...color) }, uSunDir: { value: new Vector3(1, 0, 0) }, uSpec: { value: key === "gold" || key === "silver" ? 0.9 : 0.4 } },
        side: DoubleSide,
      }),
    ]),
  ) as Record<Paint, ShaderMaterial>;

type M = Record<Paint, ShaderMaterial>;
type V3 = [number, number, number];
const box = (m: M, paint: Paint, size: V3, position: V3 = [0, 0, 0], rotation: V3 = [0, 0, 0]) => (
  <mesh material={m[paint]} position={position} rotation={rotation}>
    <boxGeometry args={size} />
  </mesh>
);
const cyl = (m: M, paint: Paint, r: number, h: number, position: V3 = [0, 0, 0], rotation: V3 = [0, 0, 0], sides = 16) => (
  <mesh material={m[paint]} position={position} rotation={rotation}>
    <cylinderGeometry args={[r, r, h, sides]} />
  </mesh>
);
const dish = (m: M, r: number, position: V3) => (
  <mesh material={m.white} position={position} rotation={[Math.PI, 0, 0]}>
    <sphereGeometry args={[r * 1.4, 32, 10, 0, Math.PI * 2, 0, 0.8]} />
  </mesh>
);
const disc = (m: M, paint: Paint, r: number, position: V3, rotation: V3 = [-Math.PI / 2, 0, 0], segments = 32, scale: V3 = [1, 1, 1]) => (
  <mesh material={m[paint]} position={position} rotation={rotation} scale={scale}>
    <circleGeometry args={[r, segments]} />
  </mesh>
);

/** Local +Y points at the Sun (deep space) or away from the Earth (orbiters). Units: metres. */
const CraftParts: FC<{ shape: CraftShape; m: M }> = ({ shape, m }) => {
  const parts: ReactNode[] = [];
  switch (shape) {
    case "jwst":
      // Five-layer sunshield (21.2 × 14.2 m) facing the Sun; the 6.5 m gold mirror on the cold side.
      for (let i = 0; i < 5; i += 1) parts.push(<group key={`s${i}`}>{disc(m, "kapton", 1, [0, -i * 0.25, 0], [-Math.PI / 2, 0, 0], 6, [10.6, 7.1, 1])}</group>);
      parts.push(<group key="bus">{box(m, "dark", [2, 1.2, 2], [0, 0.9, 0])}</group>);
      parts.push(<group key="mirror">{disc(m, "gold", 3.25, [0, -4.2, 1.2], [Math.PI / 2 - 0.25, 0, 0], 6)}</group>);
      parts.push(<group key="sec">{cyl(m, "silver", 0.37, 0.2, [0, -6.8, 4.8])}</group>);
      break;
    case "parker":
      // 2.3 m carbon-composite heat shield; the spacecraft hides in its shadow.
      parts.push(<group key="shield">{cyl(m, "white", 1.15, 0.12, [0, 0.9, 0], [0, 0, 0], 32)}</group>);
      parts.push(<group key="bus">{cyl(m, "bus", 0.5, 1.5, [0, 0, 0], [0, 0, 0], 6)}</group>);
      parts.push(<group key="w1">{box(m, "panel", [1.6, 0.04, 0.7], [1.2, -0.3, 0], [0, 0, -0.5])}</group>);
      parts.push(<group key="w2">{box(m, "panel", [1.6, 0.04, 0.7], [-1.2, -0.3, 0], [0, 0, 0.5])}</group>);
      break;
    case "juno":
      // Hexagonal bus with three 8.9 m solar wings.
      parts.push(<group key="bus">{cyl(m, "bus", 1.75, 3.5, [0, 0, 0], [0, 0, 0], 6)}</group>);
      parts.push(<group key="dish">{dish(m, 1.25, [0, 2.4, 0])}</group>);
      for (let i = 0; i < 3; i += 1) {
        const a = (i * 2 * Math.PI) / 3;
        parts.push(
          <group key={`w${i}`} rotation={[0, a, 0]}>
            {box(m, "panel", [8.9, 0.05, 2.65], [6.2, 0, 0])}
          </group>,
        );
      }
      break;
    case "clipper":
      // Large-array cruise stage: Europa Clipper, Psyche, BepiColombo, Juice.
      parts.push(<group key="bus">{cyl(m, "bus", 1.4, 3, [0, 0, 0])}</group>);
      parts.push(<group key="dish">{dish(m, 1.5, [0, 2.2, 0])}</group>);
      parts.push(<group key="w1">{box(m, "panel", [12.5, 0.05, 4.1], [7.8, -0.5, 0])}</group>);
      parts.push(<group key="w2">{box(m, "panel", [12.5, 0.05, 4.1], [-7.8, -0.5, 0])}</group>);
      break;
    case "lucy":
      // Two 7.3 m round solar arrays.
      parts.push(<group key="bus">{box(m, "bus", [1.6, 2, 1.6], [0, 0, 0])}</group>);
      parts.push(<group key="dish">{dish(m, 1, [0, 1.5, 0])}</group>);
      parts.push(<group key="a1">{disc(m, "panel", 3.65, [4.6, 0, 0], [-Math.PI / 2, 0, 0], 40)}</group>);
      parts.push(<group key="a2">{disc(m, "panel", 3.65, [-4.6, 0, 0], [-Math.PI / 2, 0, 0], 40)}</group>);
      break;
    case "iss": {
      // 109 m truss, eight 35 m array wings, the pressurised modules across it.
      parts.push(<group key="truss">{box(m, "silver", [109, 2.5, 2.5], [0, 0, 0])}</group>);
      for (const x of [-46, -32, 32, 46]) {
        parts.push(<group key={`a${x}+`}>{box(m, "panel", [11.6, 0.1, 35], [x, 0, 19])}</group>);
        parts.push(<group key={`a${x}-`}>{box(m, "panel", [11.6, 0.1, 35], [x, 0, -19])}</group>);
      }
      parts.push(<group key="mods">{cyl(m, "white", 2.1, 52, [0, -3, 0], [Math.PI / 2, 0, 0])}</group>);
      parts.push(<group key="rad">{box(m, "white", [3, 0.1, 13], [10, 0, 8])}</group>);
      break;
    }
    case "hubble":
      parts.push(<group key="tube">{cyl(m, "silver", 2.1, 13.2, [0, 0, 0], [0, 0, Math.PI / 2])}</group>);
      parts.push(<group key="door">{disc(m, "silver", 2.1, [6.7, 0.9, 0], [0, Math.PI / 2, 0.6])}</group>);
      parts.push(<group key="p1">{box(m, "panel", [2.45, 0.05, 7.1], [-1, 0, 6])}</group>);
      parts.push(<group key="p2">{box(m, "panel", [2.45, 0.05, 7.1], [-1, 0, -6])}</group>);
      break;
    case "tiangong":
      parts.push(<group key="core">{cyl(m, "white", 2.1, 16.6, [0, 0, 0], [0, 0, Math.PI / 2])}</group>);
      parts.push(<group key="l1">{cyl(m, "white", 2.1, 17.9, [-8, 0, 9.5], [Math.PI / 2, 0, 0])}</group>);
      parts.push(<group key="l2">{cyl(m, "white", 2.1, 17.9, [-8, 0, -9.5], [Math.PI / 2, 0, 0])}</group>);
      parts.push(<group key="p1">{box(m, "panel", [4.2, 0.05, 27], [-8, 3, 18])}</group>);
      parts.push(<group key="p2">{box(m, "panel", [4.2, 0.05, 27], [-8, 3, -18])}</group>);
      break;
    case "probe":
      // New Horizons: triangular bus, 2.1 m dish, RTG.
      parts.push(<group key="bus">{cyl(m, "gold", 1.2, 0.7, [0, 0, 0], [0, 0, 0], 3)}</group>);
      parts.push(<group key="dish">{dish(m, 1.05, [0, 0.8, 0])}</group>);
      parts.push(<group key="rtg">{cyl(m, "dark", 0.2, 1.1, [1.3, 0, 0], [0, 0, Math.PI / 2])}</group>);
      break;
    case "voyager":
    default:
      parts.push(<group key="dish">{dish(m, 1.85, [0, 1.2, 0])}</group>);
      parts.push(<group key="bus">{cyl(m, "bus", 0.89, 0.47, [0, 0, 0], [0, 0, 0], 10)}</group>);
      parts.push(<group key="boom">{cyl(m, "silver", 0.04, 13, [6.6, -0.2, 0], [0, 0, Math.PI / 2], 6)}</group>);
      parts.push(<group key="rtg">{cyl(m, "gold", 0.2, 1.1, [-2.9, -0.7, 1.9], [0.6, 0, Math.PI / 2.4], 10)}</group>);
      parts.push(<group key="rtgboom">{cyl(m, "silver", 0.05, 2.6, [-1.8, -0.3, 1.2], [0.6, 0, Math.PI / 2.4], 6)}</group>);
      break;
  }
  return <>{parts}</>;
};

const CraftModel: FC<{ entity: UniverseEntity }> = ({ entity }) => {
  const engine = useEngine();
  const groupRef = useRef<Group | null>(null);
  const materials = useMemo(() => makeMaterials(), []);
  useEffect(() => () => Object.values(materials).forEach((material) => material.dispose()), [materials]);
  const up = useMemo(() => new Vector3(0, 1, 0), []);
  const axis = useMemo(() => new Vector3(), []);
  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    const world = getEntityWorld(entity, engine.simTimeMs);
    if (!world) {
      group.visible = false;
      return;
    }
    const kmToRender = placeRelative(engine, world, group.position);
    group.scale.setScalar(0.001 * kmToRender);
    const distance = Math.hypot(world[0] - engine.cameraWorld[0], world[1] - engine.cameraWorld[1], world[2] - engine.cameraWorld[2]);
    group.visible = pixelRadiusOf(engine, entity.radiusKm, distance) > 1.5;
    if (!group.visible) return;
    const toSun = normalize3([-world[0], -world[1], -world[2]]);
    const geocentric = entity.trajectory?.geocentric?.(engine.simTimeMs);
    // Orbiters keep their underside to the Earth; deep-space craft face the Sun (≈ Earth from afar).
    const facing = geocentric ? normalize3(geocentric) : toSun;
    group.quaternion.setFromUnitVectors(up, axis.set(facing[0], facing[1], facing[2]));
    for (const material of Object.values(materials)) material.uniforms.uSunDir.value.set(toSun[0], toSun[1], toSun[2]);
  });
  return (
    <group ref={groupRef} visible={false}>
      <CraftParts shape={entity.craft ?? "probe"} m={materials} />
    </group>
  );
};

// ---------------------------------------------------------------------------------------------
// The selected mission's path.

const TRAIL_POINTS = 8_000;

const Trail: FC<{ entity: UniverseEntity }> = ({ entity }) => {
  const engine = useEngine();
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(TRAIL_POINTS * 2 * 3), 3));
    g.setAttribute("color", new BufferAttribute(new Float32Array(TRAIL_POINTS * 2 * 4), 4));
    return g;
  }, []);
  const material = useMemo(() => new LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending }), []);
  const line = useMemo(() => new LineSegments(geometry, material), [geometry, material]);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  // Samples (world km for heliocentric paths; geocentric offsets for orbiters), refreshed as time moves.
  const cache = useRef<{ at: number; samples: Array<{ t: number; p: Vec3 }> }>({ at: NaN, samples: [] });
  const a = useMemo(() => ({ x: 0, y: 0, z: 0 }), []);
  const b = useMemo(() => ({ x: 0, y: 0, z: 0 }), []);

  useFrame(() => {
    const trajectory = entity.trajectory;
    const now = engine.simTimeMs;
    if (!trajectory) {
      line.visible = false;
      return;
    }
    const geocentric = trajectory.geocentric;
    const orbitMs = 95 * 60_000;
    const stale = geocentric ? Math.abs(now - cache.current.at) > 60_000 : Math.abs(now - cache.current.at) > 6 * 3_600_000;
    if (stale) {
      const samples: Array<{ t: number; p: Vec3 }> = [];
      if (geocentric) {
        // One revolution centred on now, relative to the Earth.
        for (let i = 0; i < TRAIL_POINTS; i += 1) {
          const t = now - orbitMs / 2 + (i / (TRAIL_POINTS - 1)) * orbitMs;
          const p = geocentric(t);
          if (p) samples.push({ t, p });
        }
      } else {
        // Whole mission: evenly in time, plus every tabulated state.
        const start = trajectory.startMs;
        const stop = trajectory.stopMs;
        const times = new Set<number>();
        for (let i = 0; i < 1_500; i += 1) times.add(start + (i / 1_499) * (stop - start));
        const knots = trajectory.knots?.() ?? [];
        // The tabulated states crowd around flybys: include them so close passes draw as smooth curves.
        const stride = Math.max(1, Math.ceil(knots.length / (TRAIL_POINTS - 1_600)));
        for (let i = 0; i < knots.length; i += stride) times.add(knots[i]);
        for (const t of [...times].sort((x, y) => x - y)) {
          const p = trajectory.sample(t);
          if (p) samples.push({ t, p });
        }
        const nowP = trajectory.sample(now);
        if (nowP) {
          samples.push({ t: now, p: nowP });
          samples.sort((x, y) => x.t - y.t);
        }
      }
      cache.current = { at: now, samples };
    }
    const samples = cache.current.samples;
    const origin: Vec3 = geocentric ? (getEntityWorld(engine.index.byId.get("solar:planet:earth")!, now) ?? [0, 0, 0]) : [0, 0, 0];
    const positions = geometry.getAttribute("position") as BufferAttribute;
    const colors = geometry.getAttribute("color") as BufferAttribute;
    const c = entity.color;
    let v = 0;
    for (let i = 0; i < samples.length - 1 && v < TRAIL_POINTS * 2 - 1; i += 1) {
      const p = samples[i].p;
      const q = samples[i + 1].p;
      placeRelative(engine, [origin[0] + p[0], origin[1] + p[1], origin[2] + p[2]], a);
      placeRelative(engine, [origin[0] + q[0], origin[1] + q[1], origin[2] + q[2]], b);
      positions.setXYZ(v, a.x, a.y, a.z);
      positions.setXYZ(v + 1, b.x, b.y, b.z);
      const past = samples[i + 1].t <= now;
      const alpha = geocentric ? (past ? 0.75 : 0.3) : past ? 0.8 : 0.22;
      colors.setXYZW(v, c[0] * alpha, c[1] * alpha, c[2] * alpha, 1);
      colors.setXYZW(v + 1, c[0] * alpha, c[1] * alpha, c[2] * alpha, 1);
      v += 2;
    }
    geometry.setDrawRange(0, v);
    positions.needsUpdate = true;
    colors.needsUpdate = true;
    line.visible = v > 0 && !engine.groundFrame;
  });

  return <primitive object={line} renderOrder={6} frustumCulled={false} />;
};

/** Models for every spacecraft; the path for the selected (or followed) one. */
export const SpacecraftLayer: FC<{ selectedId: string | null }> = ({ selectedId }) => {
  const engine = useEngine();
  const craft = useMemo(() => engine.index.entities.filter((entity) => entity.kind === "spacecraft"), [engine.index]);
  const selected = selectedId ? engine.index.byId.get(selectedId) : undefined;
  return (
    <>
      {craft.map((entity) => (
        <CraftModel key={entity.id} entity={entity} />
      ))}
      {selected?.kind === "spacecraft" && selected.trajectory ? <Trail key={`trail-${selected.id}`} entity={selected} /> : null}
    </>
  );
};
