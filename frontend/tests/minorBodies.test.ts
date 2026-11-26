import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeMinorBodies, namedBodyPosition } from "../src/features/explore/minorBodies";

const require = createRequire(import.meta.url);
const vsop87a = require("vsop87/dist/vsop87a.js") as (jd: number) => Record<string, { x: number; y: number; z: number }>;
const root = resolve(__dirname, "../public/catalogs/minor-bodies");
const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));
const bytes = readFileSync(resolve(root, "orbits.svmb"));
const orbits = decodeMinorBodies(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), manifest);
const named = JSON.parse(readFileSync(resolve(root, "named.json"), "utf8"));

/** Heliocentric ecliptic longitude (deg) of packed body i at the reference date. */
const longitude = (i: number) => {
  const [a, e, inc, om, w, m] = Array.from(orbits.elements.subarray(i * 6, i * 6 + 6));
  let E = m;
  for (let k = 0; k < 30; k += 1) E -= (E - e * Math.sin(E) - m) / (1 - e * Math.cos(E));
  const xv = a * (Math.cos(E) - e);
  const yv = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const x = (Math.cos(om) * Math.cos(w) - Math.sin(om) * Math.sin(w) * Math.cos(inc)) * xv + (-Math.cos(om) * Math.sin(w) - Math.sin(om) * Math.cos(w) * Math.cos(inc)) * yv;
  const y = (Math.sin(om) * Math.cos(w) + Math.cos(om) * Math.sin(w) * Math.cos(inc)) * xv + (-Math.sin(om) * Math.sin(w) + Math.cos(om) * Math.cos(w) * Math.cos(inc)) * yv;
  return (Math.atan2(y, x) * 180) / Math.PI;
};

describe("minor bodies (JPL SBDB)", () => {
  it("decodes every orbit with its group and credits the source", () => {
    expect(manifest.source.credit).toContain("Small-Body Database");
    expect(orbits.count).toBe(manifest.count);
    expect(orbits.count).toBeGreaterThan(90_000);
    const perGroup = new Map<number, number>();
    for (let i = 0; i < orbits.count; i += 1) perGroup.set(orbits.groups[i], (perGroup.get(orbits.groups[i]) ?? 0) + 1);
    for (const group of manifest.groups) expect(perGroup.get(group.id)).toBe(group.count);
  });

  it("puts the main belt between Mars and Jupiter and the Kuiper Belt beyond Neptune", () => {
    const median = (group: number) => {
      const values: number[] = [];
      for (let i = 0; i < orbits.count; i += 1) if (orbits.groups[i] === group) values.push(orbits.elements[i * 6]);
      values.sort((x, y) => x - y);
      return values[Math.floor(values.length / 2)];
    };
    expect(median(0)).toBeGreaterThan(2.2);
    expect(median(0)).toBeLessThan(3.3);
    expect(median(5)).toBeGreaterThan(38);
    expect(median(5)).toBeLessThan(48);
  });

  it("keeps Jupiter's Trojans 60° ahead of and behind Jupiter", () => {
    const j = vsop87a(orbits.referenceJulianDate).jupiter;
    const jupiter = (Math.atan2(j.y, j.x) * 180) / Math.PI;
    const offsets: number[] = [];
    for (let i = 0; i < orbits.count; i += 1) {
      if (orbits.groups[i] !== 2) continue;
      offsets.push(Math.abs((((longitude(i) - jupiter) % 360) + 540) % 360 - 180));
    }
    offsets.sort((x, y) => x - y);
    const median = offsets[Math.floor(offsets.length / 2)];
    expect(median).toBeGreaterThan(50);
    expect(median).toBeLessThan(70);
  });

  it("names the largest bodies and places Vesta in the inner main belt", () => {
    const vesta = named.find((body: { name: string }) => body.name === "Vesta");
    expect(vesta).toBeTruthy();
    const p = namedBodyPosition(vesta, Date.UTC(2026, 0, 1));
    const au = Math.hypot(...p) / 149_597_870.7;
    expect(au).toBeGreaterThan(2.1);
    expect(au).toBeLessThan(2.6);
  });
});
