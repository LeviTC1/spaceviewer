import { MathUtils } from "three";

export type AsteroidBeltMode = "off" | "simplified" | "full";

export type AsteroidTier = "small" | "medium" | "large" | "hero";

export interface AsteroidDef {
  id: string;
  radiusAu: number;
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
      return 0.11;
    case "medium":
      return 0.18;
    case "large":
      return 0.28;
    case "hero":
      return 0.45;
    default:
      return 0.14;
  }
};

export const generateAsteroidField = (count: number, seed = 4242): AsteroidDef[] => {
  const rand = mulberry32(seed);
  const asteroids: AsteroidDef[] = [];
  for (let i = 0; i < count; i += 1) {
    const radiusAu = MathUtils.lerp(2.1, 3.3, rand());
    const angleOffset = rand() * Math.PI * 2;
    const inclinationDeg = (rand() - 0.5) * 6;
    const heightOffset = (rand() - 0.5) * 0.9;
    const tier = pickTier(rand());
    const size = tierScale(tier) * MathUtils.lerp(0.85, 1.15, rand());
    const textureIndex = Math.floor(rand() * 3);
    const orbitalPeriodDays = 365 * Math.pow(radiusAu, 1.5);
    const spinSpeed = (rand() - 0.5) * 0.6;
    const rotation: [number, number, number] = [
      rand() * Math.PI * 2,
      rand() * Math.PI * 2,
      rand() * Math.PI * 2,
    ];
    asteroids.push({
      id: `ast-${seed}-${i}`,
      radiusAu,
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
    const radiusAu = MathUtils.lerp(2.3, 3.1, rand());
    const angleOffset = rand() * Math.PI * 2;
    const inclinationDeg = (rand() - 0.5) * 4;
    const heightOffset = (rand() - 0.5) * 0.6;
    const textureIndex = Math.floor(rand() * 3);
    const orbitalPeriodDays = 365 * Math.pow(radiusAu, 1.5);
    const spinSpeed = (rand() - 0.5) * 0.25;
    const rotation: [number, number, number] = [
      rand() * Math.PI * 2,
      rand() * Math.PI * 2,
      rand() * Math.PI * 2,
    ];
    return {
      id: `hero-${seed}-${index}`,
      radiusAu,
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
