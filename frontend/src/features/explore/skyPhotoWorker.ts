// Builds a north-up, true-scale survey photograph of a patch of sky from HiPS tiles, off the main
// thread: fetch the tiles that cover the field, decode them, and resample into a gnomonic (TAN)
// projection centred on the object. Returns an ImageBitmap ready to upload as a texture.

import { chooseTileOrder, DSS2_COLOR_HIPS, tanToRaDec, tileSample, tileUrl } from "./hips";

export interface SkyPhotoRequest {
  id: string;
  raDeg: number;
  decDeg: number;
  fovDeg: number;
  size: number;
}

export type SkyPhotoResponse =
  | {
      id: string;
      ok: true;
      bitmap: ImageBitmap;
      order: number;
      tiles: number;
      /** Sky background per channel (0–1, the 12th percentile), subtracted when blending into space. */
      floor: [number, number, number];
    }
  | { id: string; ok: false; error: string };

const tileCache = new Map<string, Promise<ImageData | null>>();

const loadTile = (url: string) => {
  let pending = tileCache.get(url);
  if (!pending) {
    pending = (async () => {
      const response = await fetch(url);
      if (!response.ok) return null;
      const bitmap = await createImageBitmap(await response.blob());
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      return ctx.getImageData(0, 0, canvas.width, canvas.height);
    })().catch(() => null);
    tileCache.set(url, pending);
    if (tileCache.size > 160) tileCache.delete(tileCache.keys().next().value as string);
  }
  return pending;
};

const build = async (request: SkyPhotoRequest): Promise<SkyPhotoResponse> => {
  const { size } = request;
  const ra0 = (request.raDeg * Math.PI) / 180;
  const dec0 = (request.decDeg * Math.PI) / 180;
  const fov = (request.fovDeg * Math.PI) / 180;
  const order = chooseTileOrder(request.fovDeg, size, DSS2_COLOR_HIPS.maxOrder);
  // Tangent-plane extent: the cutout spans `fov` across.
  const half = Math.tan(fov / 2);
  const step = (2 * half) / size;

  // Pass 1: which tiles cover the field (sample every 8 px plus the edges).
  const needed = new Set<number>();
  for (let py = 0; py <= size; py += 8) {
    for (let px = 0; px <= size; px += 8) {
      const xi = half - px * step; // east is to the left on the sky
      const eta = half - py * step;
      const { ra, dec } = tanToRaDec(ra0, dec0, xi, eta);
      needed.add(tileSample(ra, dec, order).npix);
    }
  }
  const tiles = new Map<number, ImageData | null>();
  await Promise.all(
    [...needed].map(async (npix) => {
      tiles.set(npix, await loadTile(tileUrl(DSS2_COLOR_HIPS.base, order, npix, DSS2_COLOR_HIPS.format)));
    }),
  );
  if ([...tiles.values()].every((tile) => !tile)) return { id: request.id, ok: false, error: "No survey tiles available for this field" };

  // Pass 2: resample every output pixel.
  const out = new ImageData(size, size);
  const data = out.data;
  const width = DSS2_COLOR_HIPS.tileWidth;
  const histograms = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      const xi = half - (px + 0.5) * step;
      const eta = half - (py + 0.5) * step;
      const { ra, dec } = tanToRaDec(ra0, dec0, xi, eta);
      const sample = tileSample(ra, dec, order);
      const tile = tiles.get(sample.npix);
      const o = (py * size + px) * 4;
      if (!tile) {
        data[o + 3] = 255;
        continue;
      }
      const i = (sample.row * width + sample.col) * 4;
      data[o] = tile.data[i];
      data[o + 1] = tile.data[i + 1];
      data[o + 2] = tile.data[i + 2];
      data[o + 3] = 255;
      histograms[0][data[o]] += 1;
      histograms[1][data[o + 1]] += 1;
      histograms[2][data[o + 2]] += 1;
    }
  }
  const percentile = (histogram: Uint32Array, p: number) => {
    const total = histogram.reduce((sum, n) => sum + n, 0);
    let seen = 0;
    for (let v = 0; v < 256; v += 1) {
      seen += histogram[v];
      if (seen >= total * p) return v / 255;
    }
    return 0;
  };
  const floor: [number, number, number] = [percentile(histograms[0], 0.12), percentile(histograms[1], 0.12), percentile(histograms[2], 0.12)];
  const bitmap = await createImageBitmap(out);
  return { id: request.id, ok: true, bitmap, order, tiles: needed.size, floor };
};

self.onmessage = async (event: MessageEvent<SkyPhotoRequest>) => {
  try {
    const result = await build(event.data);
    if (result.ok) (self as unknown as Worker).postMessage(result, [result.bitmap]);
    else (self as unknown as Worker).postMessage(result);
  } catch (error) {
    (self as unknown as Worker).postMessage({ id: event.data.id, ok: false, error: String(error) } satisfies SkyPhotoResponse);
  }
};
