// The ground and the sky above it, when standing on the Earth (ground mode).
//
// Sky: a simple single-scattering-flavoured model driven by the Sun's altitude: blue daylight that
// brightens towards the horizon and the Sun, a deep-blue twilight with a warm glow on the Sun's side,
// and faint airglow at night. It adds light; the exposure (set from the same altitude) is what hides
// the stars by day. Ground: an opaque horizon that hides everything below it, with compass points.

import { useFrame } from "@react-three/fiber";
import { type FC, type RefObject, useEffect, useMemo, useRef } from "react";
import { AdditiveBlending, BackSide, type Mesh, ShaderMaterial, SphereGeometry } from "three";
import { projectToScreen } from "../engine/engineState";
import { altAzToWorld } from "../engine/observer";
import { normalize3, type Vec3 } from "../engine/units";
import { useEngine } from "./EngineContext";

const DOME_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position, 1.0);
  p.z = 0.0;
  gl_Position = p;
}
`;

const SKY_FRAGMENT = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uSun;
uniform float uGain;
varying vec3 vDir;
void main() {
  vec3 dir = normalize(vDir);
  float mu = dot(dir, uZenith);
  float sunMu = dot(uSun, uZenith);
  float h = pow(1.0 - clamp(mu, 0.0, 1.0), 3.0);
  float day = smoothstep(-0.10, 0.26, sunMu);
  float twilight = smoothstep(-0.31, -0.015, sunMu) * (1.0 - day);
  // Daylight: deep blue overhead, paler at the horizon, a bright aureole round the Sun.
  float cosGamma = dot(dir, uSun);
  vec3 dayCol = mix(vec3(0.05, 0.15, 0.46), vec3(0.34, 0.48, 0.72), h);
  dayCol += vec3(1.0, 0.92, 0.78) * (pow(max(cosGamma, 0.0), 24.0) * 0.4 + pow(max(cosGamma, 0.0), 400.0) * 1.6);
  // Low Sun: warm the horizon on its side.
  vec3 flatDir = normalize(dir - uZenith * mu + 1e-5);
  vec3 flatSun = normalize(uSun - uZenith * sunMu + 1e-5);
  float sunSide = max(dot(flatDir, flatSun), 0.0);
  dayCol = mix(dayCol, dayCol * vec3(1.25, 0.85, 0.6), h * pow(sunSide, 2.0) * (1.0 - smoothstep(0.05, 0.35, sunMu)));
  // Twilight: blue overhead, a band of orange and rose under the Sun, the Earth's shadow opposite.
  vec3 twiCol = vec3(0.012, 0.03, 0.09) * (0.4 + 0.6 * (1.0 - h));
  twiCol += h * (vec3(0.95, 0.42, 0.12) * pow(sunSide, 3.0) * 0.9 + vec3(0.12, 0.13, 0.26) * 0.6);
  vec3 col = dayCol * day * 1.25 + twiCol * twilight * smoothstep(-0.31, -0.08, sunMu) * 1.2;
  // Night: faint green-grey airglow near the horizon.
  col += vec3(0.0035, 0.0055, 0.006) * h * (1.0 - day);
  if (mu < -0.02) col *= 0.0;
  gl_FragColor = vec4(col * uGain, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const GROUND_FRAGMENT = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uSun;
uniform float uDay;
varying vec3 vDir;
void main() {
  vec3 dir = normalize(vDir);
  float mu = dot(dir, uZenith);
  // A hair above the mathematical horizon so the edge is crisp but not aliased.
  float a = smoothstep(0.0025, -0.0015, mu);
  if (a <= 0.0) discard;
  float depth = clamp(-mu * 4.0, 0.0, 1.0);
  vec3 night = vec3(0.010, 0.012, 0.014);
  vec3 day = vec3(0.11, 0.12, 0.10);
  vec3 col = mix(night, day, uDay) * (1.0 - 0.55 * depth);
  // Distant haze at the horizon line takes the sky's colour.
  float haze = exp(mu * 160.0);
  col += mix(vec3(0.006, 0.009, 0.014), vec3(0.25, 0.32, 0.42), uDay) * haze * 0.6;
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const dome = new SphereGeometry(1, 96, 48);
const POINTS = [
  { label: "N", az: 0 },
  { label: "NE", az: 45 },
  { label: "E", az: 90 },
  { label: "SE", az: 135 },
  { label: "S", az: 180 },
  { label: "SW", az: 225 },
  { label: "W", az: 270 },
  { label: "NW", az: 315 },
];

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export const GroundLayer: FC<{ labelsRoot: RefObject<HTMLDivElement | null> }> = ({ labelsRoot }) => {
  const engine = useEngine();
  const skyRef = useRef<Mesh | null>(null);
  const groundRef = useRef<Mesh | null>(null);
  const labels = useRef<HTMLSpanElement[]>([]);

  const sky = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: DOME_VERTEX,
        fragmentShader: SKY_FRAGMENT,
        uniforms: { uZenith: { value: [0, 1, 0] }, uSun: { value: [1, 0, 0] }, uGain: { value: 1 } },
        side: BackSide,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: AdditiveBlending,
      }),
    [],
  );
  const ground = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: DOME_VERTEX,
        fragmentShader: GROUND_FRAGMENT,
        uniforms: { uZenith: { value: [0, 1, 0] }, uSun: { value: [1, 0, 0] }, uDay: { value: 0 } },
        side: BackSide,
        transparent: true,
        depthWrite: false,
        depthTest: false,
      }),
    [],
  );
  useEffect(
    () => () => {
      sky.dispose();
      ground.dispose();
    },
    [ground, sky],
  );

  useEffect(() => {
    const root = labelsRoot.current;
    if (!root) return;
    labels.current = POINTS.map((point) => {
      const span = document.createElement("span");
      span.className = `ex-compass${point.label.length === 1 ? " is-major" : ""}`;
      span.textContent = point.label;
      span.style.opacity = "0";
      root.appendChild(span);
      return span;
    });
    return () => {
      for (const span of labels.current) span.remove();
      labels.current = [];
    };
  }, [labelsRoot]);

  useFrame(() => {
    const frame = engine.groundFrame;
    const on = Boolean(frame);
    if (skyRef.current) skyRef.current.visible = on;
    if (groundRef.current) groundRef.current.visible = on;
    if (!frame) {
      for (const span of labels.current) if (span.style.opacity !== "0") span.style.opacity = "0";
      return;
    }
    const cam = engine.cameraWorld;
    const sun = normalize3([-cam[0], -cam[1], -cam[2]]);
    sky.uniforms.uZenith.value = frame.zenith;
    sky.uniforms.uSun.value = sun;
    ground.uniforms.uZenith.value = frame.zenith;
    ground.uniforms.uSun.value = sun;
    const sunAlt = engine.sunAltitudeDeg;
    ground.uniforms.uDay.value = smooth(-8, 10, sunAlt);
    sky.uniforms.uGain.value = 1;
    labels.current.forEach((span, i) => {
      const dir = altAzToWorld(1.2, POINTS[i].az, frame);
      const far: Vec3 = [cam[0] + dir[0] * 1e7, cam[1] + dir[1] * 1e7, cam[2] + dir[2] * 1e7];
      const p = projectToScreen(engine, far);
      if (!p || p.x < -40 || p.x > engine.viewportWidth + 40 || p.y < -40 || p.y > engine.viewportHeight + 40) {
        if (span.style.opacity !== "0") span.style.opacity = "0";
        return;
      }
      span.style.opacity = "1";
      span.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -100%)`;
    });
  });

  return (
    <>
      <mesh ref={skyRef} geometry={dome} material={sky} renderOrder={40} frustumCulled={false} visible={false} />
      <mesh ref={groundRef} geometry={dome} material={ground} renderOrder={60} frustumCulled={false} visible={false} />
    </>
  );
};
