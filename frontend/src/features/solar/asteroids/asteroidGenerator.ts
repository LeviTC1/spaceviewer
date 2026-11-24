import { MathUtils } from "three";

export type AsteroidBeltMode = "off" | "simplified" | "full";

export type AsteroidTier = "small" | "medium" | "large" | "hero";

export interface AsteroidDef {
  id: string;
  semiMajorAxisAu: number;
  eccentricity: number;
  meanAnomalyOffset: number;
  longitudeOfAscendingNodeRad: number;
  argumentOfPeriapsisRad: number;
  angleOffset: number;
  inclinationDeg: number;
  heightOffset: number;
  size: number;
  tier: AsteroidTier;
  textureIndex: number;
  spinSpeed: number;
  rotation: [number, number, number];
  orbitalPeriodDays: number;
}

const mulberry32 = (seed: number) => {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

const pickTier = (value: number): AsteroidTier => {
  if (value < 0.7) return "small";
  if (value < 0.95) return "medium";
  return "large";
};

const tierScale = (tier: AsteroidTier) => {
  switch (tier) {
    case "small":
      return 0.9;
    case "medium":
      return 1.45;
    case "large":
      return 2.25;
    case "hero":
      return 2.8;
    default:
      return 0.14;
  }
};

const isInKirkwoodGap = (radiusAu: number) => {
  const gaps = [2.5, 2.82, 2.95];
  return gaps.some((gap) => Math.abs(radiusAu - gap) < 0.035);
};

const pickBeltSemiMajorAxis = (rand: () => number) => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const raw = rand();
    const band = raw < 0.58 ? MathUtils.lerp(2.12, 2.72, rand()) : MathUtils.lerp(2.72, 3.34, rand());
    const gradient = MathUtils.clamp(1 - Math.abs(band - 2.72) / 0.78, 0.28, 1);
    const gapPenalty = isInKirkwoodGap(band) ? 0.22 : 1;
    if (rand() < gradient * gapPenalty) return band;
  }
  return MathUtils.lerp(2.1, 3.32, rand());
};

export const generateAsteroidField = (count: number, seed = 4242): AsteroidDef[] => {
  const rand = mulberry32(seed);
  const asteroids: AsteroidDef[] = [];
  for (let i = 0; i < count; i += 1) {
    const semiMajorAxisAu = pickBeltSemiMajorAxis(rand);
    const eccentricity = MathUtils.lerp(0.015, 0.18, Math.pow(rand(), 1.7));
    const angleOffset = rand() * Math.PI * 2;
    const inclinationDeg = (rand() - 0.5) * 7.5 + Math.sin(semiMajorAxisAu * 5.7) * 0.6;
    const heightOffset = (rand() - 0.5) * MathUtils.lerp(0.22, 0.95, rand());
    const tier = pickTier(rand());
    const size = tierScale(tier) * MathUtils.lerp(0.85, 1.15, rand());
    const textureIndex = Math.floor(rand() * 3);
    const orbitalPeriodDays = 365.25 * Math.pow(semiMajorAxisAu, 1.5) * MathUtils.lerp(0.96, 1.04, rand());
    const spinSpeed = (rand() - 0.5) * 0.6;
    const rotation: [number, number, number] = [
      rand() * Math.PI * 2,
      rand() * Math.PI * 2,
      rand() * Math.PI * 2,
    ];
    asteroids.push({
      id: `ast-${seed}-${i}`,
      semiMajorAxisAu,
      eccentricity,
      meanAnomalyOffset: rand() * Math.PI * 2,
      longitudeOfAscendingNodeRad: rand() * Math.PI * 2,
      argumentOfPeriapsisRad: rand() * Math.PI * 2,
      angleOffset,
      inclinationDeg,
      heightOffset,
      size,
      tier,
      textureIndex,
      spinSpeed,
      rotation,
      orbitalPeriodDays,
    });
  }
  return asteroids;
};

export const generateHeroAsteroids = (seed = 1337): AsteroidDef[] => {
  const rand = mulberry32(seed);
  return Array.from({ length: 3 }).map((_, index) => {
    const semiMajorAxisAu = MathUtils.lerp(2.3, 3.1, rand());
    const angleOffset = rand() * Math.PI * 2;
    const inclinationDeg = (rand() - 0.5) * 5;
    const heightOffset = (rand() - 0.5) * 0.6;
    const textureIndex = Math.floor(rand() * 3);
    const orbitalPeriodDays = 365.25 * Math.pow(semiMajorAxisAu, 1.5) * MathUtils.lerp(0.97, 1.03, rand());
    const spinSpeed = (rand() - 0.5) * 0.25;
    const rotation: [number, number, number] = [
      rand() * Math.PI * 2,
      rand() * Math.PI * 2,
      rand() * Math.PI * 2,
    ];
    return {
      id: `hero-${seed}-${index}`,
      semiMajorAxisAu,
      eccentricity: MathUtils.lerp(0.04, 0.16, rand()),
      meanAnomalyOffset: rand() * Math.PI * 2,
      longitudeOfAscendingNodeRad: rand() * Math.PI * 2,
      argumentOfPeriapsisRad: rand() * Math.PI * 2,
      angleOffset,
      inclinationDeg,
      heightOffset,
      size: tierScale("hero") * MathUtils.lerp(0.9, 1.1, rand()),
      tier: "hero",
      textureIndex,
      spinSpeed,
      rotation,
      orbitalPeriodDays,
    };
  });
};
