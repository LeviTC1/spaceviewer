import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Texture } from "three";
import { loadSolarTextureAsset } from "./loadSolarTextureAsset";
import { readSolarTextureDiagnostics } from "./solarTextureDiagnostics";
import { solarTextureLoader } from "./solarTextureManager";

type TimeoutGlobal = typeof globalThis & {
  __SPACEVIEWER_SOLAR_TEXTURE_TIMEOUT_MS__?: number;
};

const timeoutGlobal = globalThis as TimeoutGlobal;

describe("loadSolarTextureAsset", () => {
  let originalLoadAsync: typeof solarTextureLoader.loadAsync;

  beforeEach(() => {
    originalLoadAsync = solarTextureLoader.loadAsync;
    timeoutGlobal.__SPACEVIEWER_SOLAR_TEXTURE_TIMEOUT_MS__ = 25;
  });

  afterEach(() => {
    solarTextureLoader.loadAsync = originalLoadAsync;
    delete timeoutGlobal.__SPACEVIEWER_SOLAR_TEXTURE_TIMEOUT_MS__;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("resolves stalled texture requests after the configured deadline", async () => {
    vi.useFakeTimers();
    const before = readSolarTextureDiagnostics();
    const url = "/solar-textures/perf/timeout-test.jpg";
    solarTextureLoader.loadAsync = vi.fn(() => new Promise<Texture>(() => undefined)) as typeof solarTextureLoader.loadAsync;

    const resultPromise = loadSolarTextureAsset(url);
    await vi.advanceTimersByTimeAsync(26);

    await expect(resultPromise).resolves.toBeNull();
    const after = readSolarTextureDiagnostics();
    expect(after.requested).toBe(before.requested + 1);
    expect(after.failed).toBe(before.failed + 1);
    expect(after.timedOut).toBe(before.timedOut + 1);
    expect(after.lastErrorUrl).toBe(url);
  });

  it("keeps successful textures on the loaded path when they beat the deadline", async () => {
    vi.useFakeTimers();
    const before = readSolarTextureDiagnostics();
    const texture = new Texture();
    const url = "/solar-textures/perf/success-test.jpg";
    solarTextureLoader.loadAsync = vi.fn(
      () => new Promise<Texture>((resolve) => setTimeout(() => resolve(texture), 10)),
    ) as typeof solarTextureLoader.loadAsync;

    const resultPromise = loadSolarTextureAsset(url);
    await vi.advanceTimersByTimeAsync(11);

    await expect(resultPromise).resolves.toBe(texture);
    const after = readSolarTextureDiagnostics();
    expect(after.loaded).toBe(before.loaded + 1);
    expect(after.timedOut).toBe(before.timedOut);
    expect(after.lastUrl).toBe(url);
  });
});
