// ~100,000 asteroids, Trojans, centaurs and Kuiper Belt objects, each on its real (two-body) orbit. The
// vertex shader solves Kepler's equation per object per frame, so the belts move with the clock: watch
// the Trojans keep station 60° ahead of and behind Jupiter, or near-Earth asteroids sweep the inner system.
//
// This is a map of where the population is, not a photometric rendering: individually they are far too
// faint to see. Points fade in at Solar System scale and out again once it shrinks to a dot.

import { useFrame } from "@react-three/fiber";
import { type FC, useEffect, useMemo } from "react";
import { AdditiveBlending, BufferAttribute, BufferGeometry, ShaderMaterial } from "three";
import { pixelRadiusOf } from "../engine/engineState";
import { worldToEcliptic, KM_PER_AU } from "../engine/units";
import type { MinorBodyOrbits } from "../minorBodies";
import { useEngine } from "./EngineContext";

const VERTEX = /* glsl */ `
attribute vec3 aShape;   // a (AU), e, i
attribute vec3 aAngles;  // Ω, ω, M at the reference date
attribute vec2 aInfo;    // group, H × 10
uniform float uDays;
uniform vec3 uCamAu;     // camera, ecliptic AU
uniform float uAuToRender;
uniform float uCompress;
uniform float uPixelRatio;
uniform vec4 uGroupColor[6];
varying vec4 vColor;

void main() {
  float a = aShape.x;
  float e = aShape.y;
  float inc = aShape.z;
  float n = 0.01720209895 / (a * sqrt(a));
  float M = mod(aAngles.z + n * uDays, 6.28318531);
  float E = e < 0.8 ? M : 3.14159265;
  for (int k = 0; k < 6; k++) E -= (E - e * sin(E) - M) / (1.0 - e * cos(E));
  float xv = a * (cos(E) - e);
  float yv = a * sqrt(max(0.0, 1.0 - e * e)) * sin(E);
  float cO = cos(aAngles.x), sO = sin(aAngles.x), cw = cos(aAngles.y), sw = sin(aAngles.y), ci = cos(inc), si = sin(inc);
  vec3 ecl = vec3(
    (cO * cw - sO * sw * ci) * xv + (-cO * sw - sO * cw * ci) * yv,
    (sO * cw + cO * sw * ci) * xv + (-sO * sw + cO * cw * ci) * yv,
    (sw * si) * xv + (cw * si) * yv
  );
  vec3 rel = ecl - uCamAu;
  // Ecliptic (x, y, z) → explorer world (x, z, −y).
  vec3 p = vec3(rel.x, rel.z, -rel.y) * uAuToRender;
  float d = length(p);
  if (d > uCompress) p *= uCompress * (1.0 + log(d / uCompress)) / d;
  int g = int(aInfo.x + 0.5);
  vec4 c = uGroupColor[0];
  if (g == 1) c = uGroupColor[1];
  else if (g == 2) c = uGroupColor[2];
  else if (g == 3) c = uGroupColor[3];
  else if (g == 4) c = uGroupColor[4];
  else if (g == 5) c = uGroupColor[5];
  // Bigger (brighter H) bodies get slightly larger, stronger points.
  float h = aInfo.y / 10.0;
  float big = clamp((16.0 - h) / 10.0, 0.0, 1.0);
  vColor = vec4(c.rgb, c.a * (0.55 + 0.45 * big));
  gl_PointSize = (1.6 + 1.8 * big) * uPixelRatio;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
varying vec4 vColor;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(q, q);
  if (r2 > 1.0) discard;
  // Additive blending multiplies by alpha once; do not premultiply as well.
  float a = vColor.a * exp(-r2 * 2.2);
  gl_FragColor = vec4(vColor.rgb, a);
}
`;

// Main belt, belt edges, Trojans, near-Earth, centaurs, Kuiper Belt.
const GROUP_COLORS: Array<[number, number, number, number]> = [
  [0.95, 0.82, 0.6, 0.5],
  [0.88, 0.8, 0.68, 0.42],
  [0.55, 0.92, 0.62, 0.62],
  [1.0, 0.5, 0.3, 0.9],
  [0.85, 0.7, 1.0, 0.8],
  [0.55, 0.76, 1.0, 0.8],
];
// Typical orbital radius of each group (AU): a group fades out once its ring is a few pixels across, so
// distant views do not pile 60,000 points onto the Sun.
const GROUP_RADIUS_AU = [2.7, 2.4, 5.2, 1.4, 15, 42];

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export const MinorBodyLayer: FC<{ orbits: MinorBodyOrbits }> = ({ orbits }) => {
  const engine = useEngine();
  const geometry = useMemo(() => {
    const shape = new Float32Array(orbits.count * 3);
    const angles = new Float32Array(orbits.count * 3);
    const info = new Float32Array(orbits.count * 2);
    for (let i = 0; i < orbits.count; i += 1) {
      shape[i * 3] = orbits.elements[i * 6];
      shape[i * 3 + 1] = orbits.elements[i * 6 + 1];
      shape[i * 3 + 2] = orbits.elements[i * 6 + 2];
      angles[i * 3] = orbits.elements[i * 6 + 3];
      angles[i * 3 + 1] = orbits.elements[i * 6 + 4];
      angles[i * 3 + 2] = orbits.elements[i * 6 + 5];
      info[i * 2] = orbits.groups[i];
      info[i * 2 + 1] = orbits.magnitudes[i];
    }
    const g = new BufferGeometry();
    // Positions are computed in the shader; three still needs a position attribute for the draw count.
    g.setAttribute("position", new BufferAttribute(new Float32Array(orbits.count * 3), 3));
    g.setAttribute("aShape", new BufferAttribute(shape, 3));
    g.setAttribute("aAngles", new BufferAttribute(angles, 3));
    g.setAttribute("aInfo", new BufferAttribute(info, 2));
    return g;
  }, [orbits]);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: {
          uDays: { value: 0 },
          uCamAu: { value: [0, 0, 0] },
          uAuToRender: { value: 1 },
          uCompress: { value: 1e6 },
          uPixelRatio: { value: 1 },
          uGroupColor: { value: new Float32Array(GROUP_COLORS.flat()) },
        },
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: AdditiveBlending,
      }),
    [],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame(() => {
    const u = material.uniforms;
    // How wide the view is at the look-at distance: belts show at Solar System scale only.
    const viewAu = (2 * engine.cameraDistanceKm * Math.tan(engine.fovY / 2)) / KM_PER_AU;
    const fromSunAu = Math.hypot(...engine.cameraWorld) / KM_PER_AU;
    const fade = engine.showMinorBodies && !engine.groundFrame ? smooth(0.15, 1.2, viewAu) * (1 - smooth(4_000, 40_000, Math.max(viewAu, fromSunAu))) : 0;
    const colors = u.uGroupColor.value as Float32Array;
    GROUP_COLORS.forEach((color, i) => {
      const ringPx = pixelRadiusOf(engine, GROUP_RADIUS_AU[i] * KM_PER_AU, Math.max(fromSunAu, GROUP_RADIUS_AU[i]) * KM_PER_AU);
      colors[i * 4] = color[0];
      colors[i * 4 + 1] = color[1];
      colors[i * 4 + 2] = color[2];
      colors[i * 4 + 3] = color[3] * fade * smooth(20, 110, ringPx);
    });
    u.uDays.value = engine.simTimeMs / 86_400_000 + 2_440_587.5 - orbits.referenceJulianDate;
    u.uCamAu.value = worldToEcliptic([engine.cameraWorld[0] / KM_PER_AU, engine.cameraWorld[1] / KM_PER_AU, engine.cameraWorld[2] / KM_PER_AU]);
    u.uAuToRender.value = KM_PER_AU / engine.unitKm;
    u.uCompress.value = engine.compressRadius;
    u.uPixelRatio.value = engine.pixelRatio;
  });

  return <points geometry={geometry} material={material} frustumCulled={false} renderOrder={-4} />;
};
