// Constellation figures in 3-D. Every line joins two real stars at their catalogued distances, so from
// the Solar System the IAU figures look exactly as they do from Earth, and anywhere else they come
// apart: Orion's belt stars are 700 to 1,300 light-years away and only line up from here.
//
// Lines are drawn in the stars' own frame (light-years) with the same log compression as the star
// field, so they stay attached to the points. Each end stops a few pixels short of its star, like a
// printed chart. Names sit on the figure at its stars' median distance and travel with them.

import { useFrame } from "@react-three/fiber";
import { type FC, type RefObject, useEffect, useMemo, useRef } from "react";
import { AdditiveBlending, BufferAttribute, BufferGeometry, ShaderMaterial } from "three";
import { projectToScreen } from "../engine/engineState";
import { icrsToWorld, KM_PER_LY, type Vec3 } from "../engine/units";
import type { SkyCulture } from "../skyCulture";
import { useEngine } from "./EngineContext";

const MAX_FIGURES = 96;

const VERTEX = /* glsl */ `
attribute vec3 aOther;
attribute float aFigure;
uniform vec3 uCamLy;
uniform float uLyToRender;
uniform float uCompress;
uniform vec2 uViewport;
uniform float uGapPx;
uniform vec4 uFigureAlpha[${MAX_FIGURES / 4}];
varying float vAlpha;

vec4 clipOf(vec3 ly) {
  vec3 p = (ly - uCamLy) * uLyToRender;
  float d = length(p);
  if (d > uCompress) p *= uCompress * (1.0 + log(d / uCompress)) / d;
  return projectionMatrix * viewMatrix * vec4(p, 1.0);
}

void main() {
  vec4 a = clipOf(position);
  vec4 b = clipOf(aOther);
  int f = int(aFigure + 0.5);
  vec4 packed = uFigureAlpha[f / 4];
  int lane = f - (f / 4) * 4;
  float alpha = lane == 0 ? packed.x : lane == 1 ? packed.y : lane == 2 ? packed.z : packed.w;
  if (a.w > 0.0 && b.w > 0.0) {
    vec2 sa = a.xy / a.w;
    vec2 sb = b.xy / b.w;
    vec2 px = (sb - sa) * uViewport * 0.5;
    float len = length(px);
    // Stop short of the star; very short segments fade rather than vanish into the gap.
    float gap = min(uGapPx, len * 0.35);
    sa += (sb - sa) * (gap / max(len, 1e-4));
    a = vec4(sa * a.w, a.z, a.w);
    alpha *= smoothstep(uGapPx * 0.6, uGapPx * 2.2, len);
  }
  vAlpha = alpha;
  gl_Position = a;
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
void main() {
  gl_FragColor = vec4(uColor * vAlpha, vAlpha);
}
`;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const toWorldLy = (xyz: [number, number, number]): Vec3 => icrsToWorld(xyz[0], xyz[1], xyz[2]);

interface FigureRuntime {
  name: string;
  rank: number;
  /** Label anchor (km, world frame). */
  anchorKm: Vec3;
  /** Figure stars (km, world frame). */
  starsKm: Vec3[];
  label: HTMLSpanElement | null;
  alpha: number;
}

export const ConstellationLayer: FC<{ culture: SkyCulture; labelsRoot: RefObject<HTMLDivElement | null>; highlight: string | null }> = ({
  culture,
  labelsRoot,
  highlight,
}) => {
  const engine = useEngine();
  const shown = useRef(0);

  const { geometry, figures } = useMemo(() => {
    const positions: number[] = [];
    const others: number[] = [];
    const figureIndex: number[] = [];
    const runtime: FigureRuntime[] = [];
    culture.constellations.slice(0, MAX_FIGURES).forEach((figure, f) => {
      const hips = new Set<number>();
      for (const line of figure.lines) {
        for (let i = 1; i < line.length; i += 1) {
          const a = culture.starsByHip.get(line[i - 1]);
          const b = culture.starsByHip.get(line[i]);
          if (!a || !b) continue;
          hips.add(a.hip);
          hips.add(b.hip);
          const wa = toWorldLy(a.xyz);
          const wb = toWorldLy(b.xyz);
          // Two vertices per segment, each knowing the other end (for the screen-space gap).
          positions.push(...wa, ...wb);
          others.push(...wb, ...wa);
          figureIndex.push(f, f);
        }
      }
      const stars = [...hips].map((hip) => culture.starsByHip.get(hip)!).filter(Boolean);
      const distances = stars.map((star) => star.distanceLy).sort((x, y) => x - y);
      const median = distances.length ? distances[Math.floor(distances.length / 2)] : 100;
      const ra = (figure.labelRaDeg * Math.PI) / 180;
      const dec = (figure.labelDecDeg * Math.PI) / 180;
      const anchor = icrsToWorld(Math.cos(dec) * Math.cos(ra) * median * KM_PER_LY, Math.cos(dec) * Math.sin(ra) * median * KM_PER_LY, Math.sin(dec) * median * KM_PER_LY);
      runtime.push({
        name: figure.name,
        rank: figure.rank,
        anchorKm: anchor,
        starsKm: stars.map((star) => {
          const w = toWorldLy(star.xyz);
          return [w[0] * KM_PER_LY, w[1] * KM_PER_LY, w[2] * KM_PER_LY] as Vec3;
        }),
        label: null,
        alpha: 0,
      });
    });
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
    g.setAttribute("aOther", new BufferAttribute(new Float32Array(others), 3));
    g.setAttribute("aFigure", new BufferAttribute(new Float32Array(figureIndex), 1));
    return { geometry: g, figures: runtime };
  }, [culture]);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: {
          uCamLy: { value: [0, 0, 0] },
          uLyToRender: { value: 1 },
          uCompress: { value: 1e6 },
          uViewport: { value: [1, 1] },
          uGapPx: { value: 7 },
          uFigureAlpha: { value: new Float32Array(MAX_FIGURES) },
          uColor: { value: [0.42, 0.62, 1.0] },
        },
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: AdditiveBlending,
      }),
    [],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  // Pooled DOM labels, one per figure.
  useEffect(() => {
    const root = labelsRoot.current;
    if (!root) return;
    for (const figure of figures) {
      const span = document.createElement("span");
      span.className = "ex-figure-label";
      span.textContent = figure.name;
      span.style.opacity = "0";
      root.appendChild(span);
      figure.label = span;
    }
    return () => {
      for (const figure of figures) {
        figure.label?.remove();
        figure.label = null;
      }
    };
  }, [figures, labelsRoot]);

  useFrame((_, delta) => {
    const goal = engine.showConstellations ? 1 : 0;
    shown.current += (goal - shown.current) * Math.min(1, delta * 4);
    if (shown.current < 0.002) shown.current = goal ? shown.current : 0;
    const u = material.uniforms;
    const cam = engine.cameraWorld;
    u.uCamLy.value = [cam[0] / KM_PER_LY, cam[1] / KM_PER_LY, cam[2] / KM_PER_LY];
    u.uLyToRender.value = KM_PER_LY / engine.unitKm;
    u.uCompress.value = engine.compressRadius;
    u.uViewport.value = [engine.viewportWidth * engine.pixelRatio, engine.viewportHeight * engine.pixelRatio];
    u.uGapPx.value = 7 * engine.pixelRatio;
    // Sunlit scenes (exposure pushed down) quieten the overlay, as they do the stars.
    const exposureFade = 0.45 + 0.55 * Math.pow(10, 0.4 * Math.max(-3, Math.min(0, engine.exposure)));
    // From the ground the chart fades into a daylit sky, and its names go once the Sun is up.
    const daylight = engine.groundFrame ? smooth(-9, 0, engine.sunAltitudeDeg) : 0;
    const groundFade = 1 - 0.8 * daylight;
    const packed = u.uFigureAlpha.value as Float32Array;
    const minSide = Math.min(engine.viewportWidth, engine.viewportHeight);
    figures.forEach((figure, f) => {
      let alpha = 0;
      const label = figure.label;
      if (shown.current > 0) {
        // How big the figure is on screen: tiny figures (seen from far across the Galaxy) fade out.
        const anchor = projectToScreen(engine, figure.anchorKm);
        let extent = 0;
        let visible = 0;
        for (const star of figure.starsKm) {
          const p = projectToScreen(engine, star);
          if (!p) continue;
          visible += 1;
          if (anchor) extent = Math.max(extent, Math.hypot(p.x - anchor.x, p.y - anchor.y));
        }
        const sizeFade = anchor && visible ? smooth(14, 46, extent) : visible ? 1 : 0;
        const emphasis = highlight === null ? 0.62 : highlight === figure.name ? 1 : 0.34;
        alpha = shown.current * sizeFade * emphasis * exposureFade * groundFade;
        // Labels: only while the figure is a reasonable size, and fainter for minor figures.
        if (label) {
          // From the ground, a figure's name sets with it.
          const zenith = engine.groundFrame?.zenith;
          const anchorUp = zenith
            ? (figure.anchorKm[0] - engine.cameraWorld[0]) * zenith[0] + (figure.anchorKm[1] - engine.cameraWorld[1]) * zenith[1] + (figure.anchorKm[2] - engine.cameraWorld[2]) * zenith[2]
            : 1;
          if (anchor && anchorUp > 0 && daylight < 0.6 && alpha > 0.02 && extent < minSide * 2.2) {
            const rankFade = figure.rank === 1 ? 1 : figure.rank === 2 ? 0.85 : 0.7;
            label.style.opacity = String(Math.min(1, alpha * 1.25 * rankFade));
            label.style.transform = `translate(${anchor.x.toFixed(1)}px, ${anchor.y.toFixed(1)}px) translate(-50%, -50%)`;
            label.classList.toggle("is-highlight", highlight === figure.name);
          } else if (label.style.opacity !== "0") label.style.opacity = "0";
        }
      } else if (label && label.style.opacity !== "0") label.style.opacity = "0";
      figure.alpha = alpha;
      packed[f] = alpha;
    });
  });

  return <lineSegments geometry={geometry} material={material} frustumCulled={false} renderOrder={-15} visible />;
};
