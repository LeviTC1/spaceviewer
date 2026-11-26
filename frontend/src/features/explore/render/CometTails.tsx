// Comet tails, drawn from the geometry that shapes them:
//   - the ion (plasma) tail streams straight away from the Sun, carried by the solar wind (blue);
//   - the dust tail is pushed by sunlight more gently, so it curves back along the orbit (yellow-white).
// Lengths and brightness follow the comet's distance from the Sun and the size of its nucleus. This is a
// model of where tails point and roughly how long they get, not a simulation of a particular apparition.

import { useFrame } from "@react-three/fiber";
import { type FC, useEffect, useMemo, useRef } from "react";
import { AdditiveBlending, BufferAttribute, BufferGeometry, DoubleSide, type Mesh, ShaderMaterial } from "three";
import { placeRelative } from "../engine/engineState";
import { getEntityWorld, type UniverseEntity } from "../engine/universeModel";
import { cross3, KM_PER_AU, normalize3, type Vec3 } from "../engine/units";
import { useEngine } from "./EngineContext";

const SEGMENTS = 40;

const VERTEX = /* glsl */ `
attribute vec2 aCoord; // along (0 at the nucleus … 1 at the tip), across (−1 … 1)
varying vec2 vCoord;
void main() {
  vCoord = aCoord;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
varying vec2 vCoord;
void main() {
  float along = vCoord.x;
  float across = vCoord.y;
  float a = clamp(uIntensity * pow(1.0 - along, 1.1) * exp(-across * across * 2.5) * smoothstep(0.0, 0.04, along + 0.01), 0.0, 1.0);
  // Additive blending applies alpha once.
  gl_FragColor = vec4(uColor, a);
}
`;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** 0…1 activity from heliocentric distance: switches on inside ~5 AU, strongest within ~0.7 AU. */
export const cometActivity = (distanceAu: number) => 1 - smooth(0.7, 5, distanceAu);

const Tail: FC<{ entity: UniverseEntity; kind: "ion" | "dust" }> = ({ entity, kind }) => {
  const engine = useEngine();
  const meshRef = useRef<Mesh | null>(null);
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    const coords = new Float32Array((SEGMENTS + 1) * 2 * 2);
    const index: number[] = [];
    for (let i = 0; i <= SEGMENTS; i += 1) {
      coords.set([i / SEGMENTS, -1, i / SEGMENTS, 1], i * 4);
      if (i < SEGMENTS) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    g.setAttribute("position", new BufferAttribute(new Float32Array((SEGMENTS + 1) * 2 * 3), 3));
    g.setAttribute("aCoord", new BufferAttribute(coords, 2));
    g.setIndex(index);
    return g;
  }, []);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: { uColor: { value: kind === "ion" ? [0.45, 0.68, 1.0] : [1.0, 0.93, 0.78] }, uIntensity: { value: 0 } },
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: AdditiveBlending,
        side: DoubleSide,
      }),
    [kind],
  );
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  const tmp = useMemo(() => ({ x: 0, y: 0, z: 0 }), []);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = engine.simTimeMs;
    const p = getEntityWorld(entity, t);
    const before = getEntityWorld(entity, t - 3_600_000);
    if (!p || !before) {
      mesh.visible = false;
      return;
    }
    const r = Math.hypot(...p);
    const rAu = r / KM_PER_AU;
    const activity = cometActivity(rAu);
    if (activity < 0.01 || engine.groundFrame) {
      mesh.visible = false;
      return;
    }
    const antiSun = normalize3(p);
    const backward = normalize3([before[0] - p[0], before[1] - p[1], before[2] - p[2]]);
    // Bigger nuclei and closer passes make longer tails (Hale-Bopp's ion tail reached ~1 AU).
    const scale = Math.sqrt(Math.max(1, entity.radiusKm) / 5);
    const lengthKm = Math.min(1.6e8, (kind === "ion" ? 2.4e7 : 1.6e7) * activity * scale / Math.max(0.3, rAu));
    const toCamera = normalize3([engine.cameraWorld[0] - p[0], engine.cameraWorld[1] - p[1], engine.cameraWorld[2] - p[2]]);
    const positions = geometry.getAttribute("position") as BufferAttribute;
    let prev: Vec3 = p;
    for (let i = 0; i <= SEGMENTS; i += 1) {
      const s = i / SEGMENTS;
      // Dust drifts back along the orbit, more so further down the tail.
      const bend = kind === "dust" ? 0.55 * Math.pow(s, 1.3) : 0;
      const dir = normalize3([antiSun[0] + backward[0] * bend, antiSun[1] + backward[1] * bend, antiSun[2] + backward[2] * bend]);
      const centre: Vec3 = i === 0 ? p : [prev[0] + dir[0] * (lengthKm / SEGMENTS), prev[1] + dir[1] * (lengthKm / SEGMENTS), prev[2] + dir[2] * (lengthKm / SEGMENTS)];
      prev = centre;
      // Ribbon faces the camera; it widens away from the nucleus (dust tails fan out more).
      const side = normalize3(cross3(dir, toCamera));
      const width = lengthKm * (kind === "ion" ? 0.02 + 0.05 * s : 0.03 + 0.16 * s);
      for (const [k, sign] of [[0, -1], [1, 1]] as const) {
        placeRelative(engine, [centre[0] + side[0] * width * sign, centre[1] + side[1] * width * sign, centre[2] + side[2] * width * sign], tmp);
        positions.setXYZ(i * 2 + k, tmp.x, tmp.y, tmp.z);
      }
    }
    positions.needsUpdate = true;
    // Tails are diffuse: a bright planet in view dims them only a little.
    material.uniforms.uIntensity.value = (kind === "ion" ? 1.4 : 1.9) * activity * Math.pow(10, 0.4 * Math.max(-2.5, Math.min(0, engine.exposure)) * 0.5);
    mesh.visible = true;
  });

  return <mesh ref={meshRef} geometry={geometry} material={material} frustumCulled={false} renderOrder={4} visible={false} />;
};

export const CometTails: FC = () => {
  const engine = useEngine();
  const comets = useMemo(() => engine.index.entities.filter((entity) => entity.kind === "comet"), [engine.index]);
  return (
    <>
      {comets.map((entity) => (
        <group key={entity.id}>
          <Tail entity={entity} kind="dust" />
          <Tail entity={entity} kind="ion" />
        </group>
      ))}
    </>
  );
};
