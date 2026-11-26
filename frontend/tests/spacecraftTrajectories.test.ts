import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getSolarObjectState, setPlutoTables } from "../src/domain/solar/solarProvider";
import { orbiterOffset, sampleTrajectory } from "../src/features/explore/spacecraft";
import { twoline2satrec } from "satellite.js";

const require = createRequire(import.meta.url);
const vsop87a = require("vsop87/dist/vsop87a.js") as (jd: number) => Record<string, { x: number; y: number; z: number }>;
const AU = 149_597_870.7;
const root = resolve(__dirname, "../public/catalogs/spacecraft");
const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));
const records = (id: string) => {
  const bytes = readFileSync(resolve(root, `${id}.svtr`));
  return new Float64Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
};

/** Closest approach of a mission to a body (km, ms) within a window. */
const closest = (id: string, body: (t: number) => [number, number, number], from: number, to: number, stepMs = 10_000) => {
  const data = records(id);
  let best = { d: Infinity, t: 0 };
  for (let t = from; t <= to; t += stepMs) {
    const p = sampleTrajectory(data, t)!;
    const b = body(t);
    const d = Math.hypot(p[0] - b[0], p[1] - b[1], p[2] - b[2]);
    if (d < best.d) best = { d, t };
  }
  return best;
};
const planet = (name: string) => (t: number) => {
  const v = vsop87a(t / 86_400_000 + 2_440_587.5)[name];
  return [v.x * AU, v.y * AU, v.z * AU] as [number, number, number];
};

describe("spacecraft trajectories", () => {
  it("credits JPL Horizons and covers every mission", () => {
    expect(manifest.source.credit).toContain("Horizons");
    expect(manifest.missions.map((mission: { id: string }) => mission.id)).toEqual(
      expect.arrayContaining(["jwst", "parker-solar-probe", "new-horizons", "voyager-1", "voyager-2", "juno"]),
    );
  });

  it("meets Jupiter at Juno's first perijove (4,200 km above the clouds, 27 Aug 2016)", () => {
    const pass = closest("juno", planet("jupiter"), Date.UTC(2016, 7, 27, 11), Date.UTC(2016, 7, 27, 15));
    expect(pass.d).toBeGreaterThan(71_492);
    expect(pass.d).toBeLessThan(80_000);
    expect(Math.abs(pass.t - Date.UTC(2016, 7, 27, 12, 50))).toBeLessThan(5 * 60_000);
  });

  it("flies past Pluto at New Horizons' closest approach (12,500 km up, 14 Jul 2015 11:50)", () => {
    setPlutoTables(["pluto-2015", "pluto-barycentre"].map((id) => (t: number) => sampleTrajectory(records(id), t)));
    const pluto = (t: number) => {
      const p = getSolarObjectState("pluto", new Date(t))!.positionAu;
      return [p.x * AU, p.y * AU, p.z * AU] as [number, number, number];
    };
    const pass = closest("new-horizons", pluto, Date.UTC(2015, 6, 14, 10), Date.UTC(2015, 6, 14, 14));
    expect(pass.d).toBeGreaterThan(10_000);
    expect(pass.d).toBeLessThan(20_000);
    expect(Math.abs(pass.t - Date.UTC(2015, 6, 14, 11, 50))).toBeLessThan(10 * 60_000);
  });

  it("reaches Parker's record perihelion (6.9 million km from the Sun's centre, 24 Dec 2024)", () => {
    const pass = closest("parker-solar-probe", () => [0, 0, 0], Date.UTC(2024, 11, 23), Date.UTC(2024, 11, 26), 60_000);
    expect(pass.d / 1e6).toBeCloseTo(6.9, 0);
  });

  it("keeps JWST about 1.5 million km beyond Earth", () => {
    const t = Date.UTC(2026, 0, 1);
    const p = sampleTrajectory(records("jwst"), t)!;
    const e = planet("earth")(t);
    const d = Math.hypot(p[0] - e[0], p[1] - e[1], p[2] - e[2]);
    expect(d).toBeGreaterThan(1.2e6);
    expect(d).toBeLessThan(1.8e6);
  });

  it("puts the ISS about 420 km above the Earth with SGP4", () => {
    const tle = JSON.parse(readFileSync(resolve(root, "earth-orbiters.json"), "utf8")).satellites.find((sat: { id: string }) => sat.id === "iss");
    const satrec = twoline2satrec(tle.line1, tle.line2);
    const offset = orbiterOffset({ id: "iss", name: "ISS", agency: "", norad: 25544, sizeKm: 0.1, satrec, epochMs: Date.now(), live: false }, Date.now())!;
    const altitude = Math.hypot(...offset) - 6_371;
    expect(altitude).toBeGreaterThan(330);
    expect(altitude).toBeLessThan(470);
  });
});
