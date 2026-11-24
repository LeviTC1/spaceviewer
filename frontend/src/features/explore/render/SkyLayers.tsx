// Star field and sky backdrop.
//
// StarField: every loaded Gaia DR3 source is a point at its catalogue position (ICRS, light-years,
// propagated to the simulation epoch by the existing worker). Apparent magnitude is recomputed per
// vertex from the camera's position, so translation produces genuine parallax and brightening.
// Points never shrink below ~1.7 px; faintness is expressed as alpha, which avoids rotation shimmer.
//
// SkyPanorama: the ESA/Gaia EDR3 all-sky colour map (galactic plate carrée), oriented exactly by
// converting each view direction to galactic longitude/latitude. It is only valid near the Sun, so it
// fades as the camera leaves the solar neighbourhood and the volumetric Milky Way takes over.

import { useEffect, useMemo, useRef, type FC } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  LinearFilter,
  Matrix3,
  RepeatWrapping,
  SRGBColorSpace,
  ShaderMaterial,
  SphereGeometry,
  type Mesh,
} from "three";
import type { DecodedStarCatalogChunk } from "../../../lib/catalog/starCatalogTypes";
import { blackbodyColor } from "../engine/universeModel";
import { KM_PER_LY, galacticToWorld, icrsToWorld } from "../engine/units";
import { MAGNITUDE_POINT_GLSL, useEngine } from "./EngineContext";

const STAR_VERTEX = /* glsl */ `
attribute float aAbsMag;
attribute vec3 aColor;
uniform vec3 uCamLy;
uniform float uLyToRender;
uniform float uCompress;
uniform float uLimitMag;
uniform float uPixelRatio;
uniform float uGain;
varying vec3 vColor;
varying float vAlpha;
${MAGNITUDE_POINT_GLSL}
void main() {
  vec3 rel = position - uCamLy;
  float d = max(length(rel), 1e-7);
  float m = aAbsMag + 5.0 * (log(d / 3.2615638) / 2.302585 - 1.0);
  float alpha;
  float size;
  magnitudeToPoint(m, uLimitMag, alpha, size);
  vec3 p = rel * uLyToRender;
  float dr = length(p);
  if (dr > uCompress) p *= uCompress * (1.0 + log(dr / uCompress)) / dr;
  vColor = aColor;
  vAlpha = alpha * uGain;
  gl_PointSize = alpha > 0.003 ? size * uPixelRatio : 0.0;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

const STAR_FRAGMENT = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (r2 > 1.0) discard;
  // Gaussian PSF with a faint wing: crisp at small sizes, soft glow for bright stars.
  float core = exp(-r2 * 6.0);
  float wing = exp(-r2 * 1.6) * 0.18;
  float a = (core + wing) * vAlpha;
  gl_FragColor = vec4(vColor * a, a);
}
`;

export const StarField: FC<{ chunks: DecodedStarCatalogChunk[] }> = ({ chunks }) => {
  const engine = useEngine();
  const geometry = useMemo(() => {
    let total = 0;
    for (const chunk of chunks) total += chunk.recordCount;
    const positions = new Float32Array(total * 3);
    const absMag = new Float32Array(total);
    const colors = new Float32Array(total * 3);
    let o = 0;
    for (const chunk of chunks) {
      const render = chunk.renderPositions.length === chunk.recordCount * 3 ? chunk.renderPositions : null;
      const { columns } = chunk;
      for (let i = 0; i < chunk.recordCount; i += 1) {
        const x = render ? render[i * 3] : columns.x[i];
        const y = render ? render[i * 3 + 1] : columns.y[i];
        const z = render ? render[i * 3 + 2] : columns.z[i];
        const w = icrsToWorld(x, y, z);
        positions[o * 3] = w[0];
        positions[o * 3 + 1] = w[1];
        positions[o * 3 + 2] = w[2];
        const d = Math.max(1e-3, columns.distanceLy[i] || Math.hypot(x, y, z));
        const g = Number.isFinite(columns.apparentMagnitudeG[i]) ? columns.apparentMagnitudeG[i] : 9;
        absMag[o] = g - 5 * (Math.log10(d / 3.2615638) - 1);
        const c = blackbodyColor(columns.temperatureK[i] || 5_000);
        // Desaturate slightly: stars look white-ish to the eye, colour reads as a tint.
        colors[o * 3] = 0.35 + 0.65 * c[0];
        colors[o * 3 + 1] = 0.35 + 0.65 * c[1];
        colors[o * 3 + 2] = 0.35 + 0.65 * c[2];
        o += 1;
      }
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(positions, 3));
    g.setAttribute("aAbsMag", new BufferAttribute(absMag, 1));
    g.setAttribute("aColor", new BufferAttribute(colors, 3));
    return g;
  }, [chunks]);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: STAR_VERTEX,
        fragmentShader: STAR_FRAGMENT,
        uniforms: {
          uCamLy: { value: [0, 0, 0] },
          uLyToRender: { value: 1 },
          uCompress: { value: 1e6 },
          uLimitMag: { value: 6.5 },
          uPixelRatio: { value: 1 },
          uGain: { value: 1 },
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
    u.uCamLy.value = [engine.cameraWorld[0] / KM_PER_LY, engine.cameraWorld[1] / KM_PER_LY, engine.cameraWorld[2] / KM_PER_LY];
    u.uLyToRender.value = KM_PER_LY / engine.unitKm;
    u.uCompress.value = engine.compressRadius;
    u.uLimitMag.value = 6.8 + engine.exposure;
    u.uPixelRatio.value = engine.pixelRatio;
    u.uGain.value = 1;
  });

  return <points geometry={geometry} material={material} frustumCulled={false} renderOrder={-20} />;
};

// ---------------------------------------------------------------------------------------------

const PANORAMA_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position, 1.0);
  // Pin to a depth that is valid for both standard and reversed depth ranges (depth test is off).
  p.z = 0.0;
  gl_Position = p;
}
`;

const PANORAMA_FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform mat3 uWorldToGalactic;
uniform float uGain;
varying vec3 vDir;
void main() {
  vec3 g = normalize(uWorldToGalactic * normalize(vDir));
  float l = atan(g.y, g.x);            // galactic longitude, radians
  float b = asin(clamp(g.z, -1.0, 1.0)); // galactic latitude
  vec2 uv = vec2(0.5 - l / 6.2831853, 0.5 + b / 3.1415927);
  vec3 c = texture2D(uMap, uv).rgb;
  // Linearise and lift the deep shadows slightly less than the source for a darker, cleaner sky.
  // Linearise; a modest gain and black point keep the source's grain below the star field.
  c = pow(c, vec3(2.2)) * 0.78;
  c = max(c - vec3(0.0035), vec3(0.0)) * 1.04;
  gl_FragColor = vec4(c * uGain, 1.0);
  #include <colorspace_fragment>
}
`;

/** Galactic → world rotation; the panorama needs world → galactic (its transpose). */
const worldToGalactic = (() => {
  const ex = galacticToWorld(1, 0, 0);
  const ey = galacticToWorld(0, 1, 0);
  const ez = galacticToWorld(0, 0, 1);
  // Rows of world→galactic are the galactic axes expressed in world coordinates.
  return new Matrix3().set(ex[0], ex[1], ex[2], ey[0], ey[1], ey[2], ez[0], ez[1], ez[2]);
})();

const panoramaSphere = new SphereGeometry(1, 96, 48);

export const SkyPanorama: FC = () => {
  const engine = useEngine();
  const meshRef = useRef<Mesh | null>(null);
  const source = useTexture("/assets/sky/gaia-edr3-all-sky.jpg");
  const texture = useMemo(() => {
    const t = source.clone();
    t.colorSpace = SRGBColorSpace;
    t.wrapS = RepeatWrapping;
    t.minFilter = LinearFilter;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    return t;
  }, [source]);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: PANORAMA_VERTEX,
        fragmentShader: PANORAMA_FRAGMENT,
        uniforms: { uMap: { value: texture }, uWorldToGalactic: { value: worldToGalactic }, uGain: { value: 1 } },
        side: BackSide,
        depthWrite: false,
        depthTest: false,
      }),
    [texture],
  );
  useEffect(() => () => {
    material.dispose();
    texture.dispose();
  }, [material, texture]);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    // Exposure: dim the sky when sunlit bodies or the Sun dominate the frame.
    const gain = engine.panoramaWeight * Math.pow(10, 0.4 * Math.min(0, engine.exposure)) ;
    material.uniforms.uGain.value = gain;
    mesh.visible = gain > 0.002;
  });

  return <mesh ref={meshRef} geometry={panoramaSphere} material={material} renderOrder={-100} frustumCulled={false} />;
};

export { AdditiveBlending };
