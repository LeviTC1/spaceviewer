// Streams the Gaia "galaxy" star layer (scripts/build-galaxy-star-catalog.mjs): about a million stars,
// brightest first, decoded into GPU-ready arrays one chunk at a time so the explorer never stalls.

import { useEffect, useState } from "react";
import { blackbodyColor } from "./engine/universeModel";
import { icrsToWorld } from "./engine/units";

export interface GalaxyStarChunk {
  count: number;
  /** World-frame positions in light-years (same frame as the nearby star field). */
  positions: Float32Array;
  absMag: Float32Array;
  colors: Float32Array;
}

interface Manifest {
  format: string;
  starCount: number;
  temperatureIndex: { min: number; max: number };
  chunks: Array<{ url: string; count: number; bytes: number }>;
}

// ICRS → world is a fixed rotation (ICRS → ecliptic → world axes); build its matrix once.
const ICRS_TO_WORLD = (() => {
  const ex = icrsToWorld(1, 0, 0);
  const ey = icrsToWorld(0, 1, 0);
  const ez = icrsToWorld(0, 0, 1);
  return [ex, ey, ez];
})();

export const colorTable = (min: number, max: number) => {
  const table = new Float32Array(256 * 3);
  for (let i = 0; i < 256; i += 1) {
    const t = Math.exp(Math.log(min) + (i / 255) * (Math.log(max) - Math.log(min)));
    const c = blackbodyColor(t);
    // Same gentle desaturation as the nearby field: colour reads as a tint.
    table[i * 3] = 0.35 + 0.65 * c[0];
    table[i * 3 + 1] = 0.35 + 0.65 * c[1];
    table[i * 3 + 2] = 0.35 + 0.65 * c[2];
  }
  return table;
};

export const decodeGalaxyChunk = (buffer: ArrayBuffer, table: Float32Array): GalaxyStarChunk => {
  const view = new DataView(buffer);
  const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (magic !== "SVGP" || view.getUint16(4, true) !== 1) throw new Error("Unexpected galaxy star chunk format");
  const count = view.getUint32(8, true);
  const icrs = new Float32Array(buffer, 16, count * 3);
  const mags = new Int16Array(buffer.slice(16 + count * 12, 16 + count * 12 + count * 2));
  const temps = new Uint8Array(buffer, 16 + count * 14, count);
  const positions = new Float32Array(count * 3);
  const absMag = new Float32Array(count);
  const colors = new Float32Array(count * 3);
  const [ex, ey, ez] = ICRS_TO_WORLD;
  for (let i = 0; i < count; i += 1) {
    const x = icrs[i * 3];
    const y = icrs[i * 3 + 1];
    const z = icrs[i * 3 + 2];
    positions[i * 3] = ex[0] * x + ey[0] * y + ez[0] * z;
    positions[i * 3 + 1] = ex[1] * x + ey[1] * y + ez[1] * z;
    positions[i * 3 + 2] = ex[2] * x + ey[2] * y + ez[2] * z;
    absMag[i] = mags[i] / 100;
    const t = temps[i] * 3;
    colors[i * 3] = table[t];
    colors[i * 3 + 1] = table[t + 1];
    colors[i * 3 + 2] = table[t + 2];
  }
  return { count, positions, absMag, colors };
};

const nextIdle = () =>
  new Promise<void>((resolve) => {
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
    if (idle) idle(() => resolve(), { timeout: 800 });
    else window.setTimeout(resolve, 120);
  });

/**
 * Loads up to `maxChunks` chunks after `start` becomes true. Chunks arrive brightest-first, so the
 * stars that matter most from where you are appear first and the rest of the galaxy fills in.
 */
export const useGalaxyStars = (start: boolean, maxChunks: number) => {
  const [chunks, setChunks] = useState<GalaxyStarChunk[]>([]);
  const [status, setStatus] = useState<"idle" | "streaming" | "ready" | "error">("idle");
  const [total, setTotal] = useState(0);
  useEffect(() => {
    if (!start || maxChunks <= 0) return;
    let cancelled = false;
    const controller = new AbortController();
    (async () => {
      try {
        setStatus("streaming");
        const manifest = (await (await fetch("/catalogs/galaxy-stars/manifest.json", { signal: controller.signal })).json()) as Manifest;
        if (manifest.format !== "spaceviewer-gaia-points-v1") throw new Error("Unknown galaxy star manifest");
        setTotal(manifest.chunks.slice(0, maxChunks).reduce((sum, chunk) => sum + chunk.count, 0));
        const table = colorTable(manifest.temperatureIndex.min, manifest.temperatureIndex.max);
        for (const definition of manifest.chunks.slice(0, maxChunks)) {
          const buffer = await (await fetch(definition.url, { signal: controller.signal })).arrayBuffer();
          if (cancelled) return;
          await nextIdle();
          const chunk = decodeGalaxyChunk(buffer, table);
          if (cancelled) return;
          setChunks((current) => [...current, chunk]);
        }
        if (!cancelled) setStatus("ready");
      } catch (error) {
        if (!cancelled && (error as Error).name !== "AbortError") {
          console.warn("Galaxy star layer unavailable", error);
          setStatus("error");
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
      setChunks([]);
    };
  }, [maxChunks, start]);
  const loaded = chunks.reduce((sum, chunk) => sum + chunk.count, 0);
  return { chunks, status, loaded, total };
};
