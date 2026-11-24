import { describe, expect, it } from "vitest";
import { easeFlight, frameDistanceForRadius, planFlight, sampleFlight } from "../src/features/explore/engine/flight";
import {
  GALACTIC_CENTRE_DIRECTION_WORLD,
  GALACTIC_NORTH_WORLD,
  KM_PER_AU,
  KM_PER_KPC,
  KM_PER_LY,
  dot3,
  formatDistanceKm,
  galacticToWorld,
  icrsToWorld,
  length3,
  raDecToIcrsUnit,
  supergalacticToWorld,
  type Vec3,
} from "../src/features/explore/engine/units";
import { galaxyOrientation, blackbodyColor } from "../src/features/explore/engine/universeModel";
import { createSearchIndex, createSlugIndex } from "../src/features/explore/discovery";
import { buildExplorePath, parseExploreLocation } from "../src/features/explore/exploreRoutes";
import type { UniverseEntity, UniverseIndex } from "../src/features/explore/engine/universeModel";

const DEG = Math.PI / 180;

describe("explorer reference frames", () => {
  it("places the Galactic Centre at RA 266.4°, Dec −28.94° and galactic north at RA 192.86°, Dec +27.13°", () => {
    const gc = icrsToWorld(...raDecToIcrsUnit(266.405, -28.936));
    expect(dot3(gc, GALACTIC_CENTRE_DIRECTION_WORLD)).toBeGreaterThan(0.99999);
    const ngp = icrsToWorld(...raDecToIcrsUnit(192.859, 27.128));
    expect(dot3(ngp, GALACTIC_NORTH_WORLD)).toBeGreaterThan(0.99999);
  });

  it("keeps ICRS→world a rotation (unit length, right-handed)", () => {
    const x = icrsToWorld(1, 0, 0);
    const y = icrsToWorld(0, 1, 0);
    const z = icrsToWorld(0, 0, 1);
    expect(length3(x)).toBeCloseTo(1, 12);
    const cross: Vec3 = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
    expect(dot3(cross, z)).toBeCloseTo(1, 10);
  });

  it("maps the supergalactic plane origin toward l = 137.37°, b = 0", () => {
    const sgx = supergalacticToWorld(1, 0, 0);
    const expected = galacticToWorld(Math.cos(137.37 * DEG), Math.sin(137.37 * DEG), 0);
    expect(dot3(sgx, expected)).toBeGreaterThan(0.99999);
  });

  it("formats distances with scale-appropriate units", () => {
    expect(formatDistanceKm(384_400)).toBe("384,400 km");
    expect(formatDistanceKm(9.5 * KM_PER_AU)).toBe("9.5 AU");
    expect(formatDistanceKm(4.24 * KM_PER_LY)).toBe("4.24 ly");
    expect(formatDistanceKm(2.54e6 * KM_PER_LY)).toBe("2.54 million ly");
  });
});

describe("explorer flights", () => {
  const earthOrbit = { target: [KM_PER_AU, 0, 0] as Vec3, distance: 40_000, direction: [0, 0, 1] as Vec3 };

  it("stays finite across 16 orders of magnitude (Earth orbit → Andromeda)", () => {
    const andromeda = { target: [2.5e6 * KM_PER_LY, 0.3e6 * KM_PER_LY, 0] as Vec3, distance: 2e5 * KM_PER_LY, direction: [0, 1, 0] as Vec3 };
    const plan = planFlight(earthOrbit, andromeda);
    expect(Number.isFinite(plan.pathLength)).toBe(true);
    expect(plan.kind).toBe("intergalactic");
    let previousFraction = 0;
    let peak = 0;
    for (let t = 0; t <= plan.durationMs; t += plan.durationMs / 50) {
      const s = sampleFlight(plan, t);
      expect(Number.isFinite(s.distance)).toBe(true);
      expect(s.target.every(Number.isFinite)).toBe(true);
      const fraction = length3([s.target[0] - earthOrbit.target[0], s.target[1], s.target[2]]) / length3([andromeda.target[0] - earthOrbit.target[0], andromeda.target[1], 0]);
      expect(fraction).toBeGreaterThanOrEqual(previousFraction - 1e-9);
      previousFraction = fraction;
      peak = Math.max(peak, s.distance);
    }
    // The departure recedes: the camera pulls back far beyond either end before closing in.
    expect(peak).toBeGreaterThan(andromeda.distance * 3);
    const end = sampleFlight(plan, plan.durationMs + 1);
    expect(end.done).toBe(true);
    expect(end.distance).toBe(andromeda.distance);
  });

  it("keeps a planet → moon hop brisk and a galaxy jump long", () => {
    const moon = { target: [KM_PER_AU + 384_400, 0, 0] as Vec3, distance: 6_000, direction: [0, 0, 1] as Vec3 };
    const hop = planFlight(earthOrbit, moon);
    const far = planFlight(earthOrbit, { target: [8 * KM_PER_KPC, 0, 0], distance: 30 * KM_PER_KPC, direction: [0, 1, 0] });
    expect(hop.kind).toBe("hop");
    expect(hop.durationMs).toBeLessThan(2_600);
    expect(far.durationMs).toBeGreaterThan(hop.durationMs * 1.8);
  });

  it("tracks a moving destination so arrival lands on the live position", () => {
    const plan = planFlight(earthOrbit, { target: [KM_PER_AU * 5, 0, 0], distance: 200_000, direction: [0, 0, 1] });
    const moved: Vec3 = [KM_PER_AU * 5 + 1e6, 0, 0];
    const end = sampleFlight(plan, plan.durationMs, moved);
    expect(end.target).toEqual(moved);
  });

  it("snaps under reduced motion", () => {
    const plan = planFlight(earthOrbit, { target: [0, 0, 0], distance: 1e7, direction: [0, 1, 0] }, { reducedMotion: true });
    expect(plan.durationMs).toBe(0);
    expect(sampleFlight(plan, 0).done).toBe(true);
  });

  it("eases monotonically from 0 to 1", () => {
    let previous = -1;
    for (let i = 0; i <= 100; i += 1) {
      const v = easeFlight(i / 100);
      expect(v).toBeGreaterThanOrEqual(previous);
      previous = v;
    }
    expect(easeFlight(0)).toBe(0);
    expect(easeFlight(1)).toBeCloseTo(1, 10);
  });

  it("frames more distantly when a side panel narrows the free canvas", () => {
    const base = { width: 1440, height: 900, occludedLeft: 0, occludedRight: 0, occludedBottom: 0, verticalFovRad: 50 * DEG };
    const open = frameDistanceForRadius(60_000, { ...base, occludedLeft: 392 });
    const closed = frameDistanceForRadius(60_000, base);
    expect(open).toBeGreaterThanOrEqual(closed);
    const narrow = frameDistanceForRadius(60_000, { ...base, width: 390, height: 844 });
    expect(narrow).toBeGreaterThan(closed);
  });
});

describe("explorer object model", () => {
  it("derives Andromeda's near edge-on inclination from a 77° catalogue value", () => {
    const q = Math.sqrt(Math.cos(77 * DEG) ** 2 * 0.96 + 0.04);
    const o = galaxyOrientation(10.68, 41.27, 38, q, 2);
    expect(o.inclinationDeg).toBeGreaterThan(75);
    expect(o.inclinationDeg).toBeLessThan(79);
    const lineOfSight = icrsToWorld(...raDecToIcrsUnit(10.68, 41.27));
    expect(Math.abs(dot3(o.normal, lineOfSight))).toBeCloseTo(Math.cos(o.inclinationDeg * DEG), 6);
  });

  it("gives hot stars a bluer colour than cool stars", () => {
    const hot = blackbodyColor(20_000);
    const cool = blackbodyColor(3_200);
    expect(hot[2]).toBeGreaterThan(hot[0] * 0.95);
    expect(cool[0]).toBeGreaterThan(cool[2]);
  });
});

const entity = (id: string, name: string, kind: UniverseEntity["kind"], aliases: string[] = [], importance = 60): UniverseEntity => ({
  id,
  name,
  kind,
  category: kind,
  radiusKm: 1,
  extentKm: 1,
  color: [1, 1, 1],
  importance,
  aliases,
  staticWorld: [0, 0, 0],
});

const makeIndex = (entities: UniverseEntity[]): UniverseIndex => ({
  entities,
  byId: new Map(entities.map((e) => [e.id, e])),
  children: new Map(),
});

describe("explorer search and links", () => {
  const index = makeIndex([
    entity("solar:planet:saturn", "Saturn", "planet", [], 92),
    entity("deep:nebula:saturn-nebula", "Saturn Nebula", "nebula", ["NGC 7009"], 40),
    entity("deep:galaxy:andromeda-galaxy", "Andromeda Galaxy", "galaxy", ["M31", "NGC 224"], 95),
    entity("solar:moon:enceladus", "Enceladus", "moon", ["moon of saturn"], 52),
    entity("explore:sagittarius-a-star", "Sagittarius A*", "black-hole", ["Sgr A*"], 90),
    entity("star:gaia-1", "Gaia DR3 123456789", "star", [], 4),
  ]);
  const { search } = createSearchIndex(index);

  it("ranks the planet above the namesake nebula", () => {
    expect(search("saturn")[0].entity.id).toBe("solar:planet:saturn");
  });

  it("finds catalogue designations written loosely", () => {
    expect(search("m 31")[0].entity.id).toBe("deep:galaxy:andromeda-galaxy");
    expect(search("NGC224")[0].entity.id).toBe("deep:galaxy:andromeda-galaxy");
  });

  it("forgives a typo", () => {
    expect(search("Enceladis")[0]?.entity.id).toBe("solar:moon:enceladus");
  });

  it("answers category words with that category", () => {
    expect(search("moons").every((hit) => hit.entity.kind === "moon")).toBe(true);
  });

  it("keeps anonymous Gaia sources out of ordinary searches but finds them by designation", () => {
    expect(search("gaia").some((hit) => hit.entity.id === "star:gaia-1")).toBe(true);
    expect(search("dr3").length).toBe(0);
  });

  it("round-trips readable slugs, including symbols", () => {
    const slugs = createSlugIndex(index);
    expect(slugs.slugFor("deep:galaxy:andromeda-galaxy")).toBe("andromeda-galaxy");
    expect(slugs.idFor(slugs.slugFor("explore:sagittarius-a-star"))).toBe("explore:sagittarius-a-star");
  });

  it("encodes an exact observation and keeps legacy SkyMap links", () => {
    const path = buildExplorePath("saturn", {
      timeMs: Date.UTC(2031, 4, 5, 12),
      rate: 3_600,
      paused: true,
      camera: { distanceKm: 512_000, direction: [0.6, 0.48, 0.64] },
    });
    const [pathname, query] = path.split("?");
    const parsed = parseExploreLocation(pathname, `?${query}`);
    expect(parsed.slug).toBe("saturn");
    expect(parsed.timeMs).toBe(Date.UTC(2031, 4, 5, 12));
    expect(parsed.rate).toBe(3_600);
    expect(parsed.paused).toBe(true);
    expect(parsed.camera?.distanceKm).toBeCloseTo(512_000, -1);
    const legacy = parseExploreLocation("/skymap", "?object=solar%3Aplanet%3Asaturn");
    expect(legacy.legacyObjectId).toBe("solar:planet:saturn");
  });
});
