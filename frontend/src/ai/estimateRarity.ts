import type { SpaceImage } from "../models/SpaceImage";
import type { ObjectType } from "./classifyObjectType";

export type RarityLevel = "Common" | "Unusual" | "Rare" | "Exceptional";

const RARITY_KEYWORDS = [
  "rare",
  "first",
  "record",
  "unique",
  "unusual",
  "peculiar",
  "anomaly",
  "collision",
  "lensing",
  "gravitational lens",
  "quasar",
  "protostar",
  "black hole",
];

const scoreObjectType = (objectType: ObjectType) => {
  switch (objectType) {
    case "Deep Field":
      return 3;
    case "Supernova Remnant":
      return 3;
    case "Planetary System":
      return 2;
    case "Nebula":
      return 1;
    case "Galaxy":
      return 1;
    case "Star Cluster":
      return 1;
    default:
      return 0;
  }
};

export const estimateRarity = (image: SpaceImage, objectType: ObjectType): { level: RarityLevel; score: number } => {
  const text = `${image.title ?? ""} ${image.description ?? ""} ${(image.keywords ?? []).join(" ")}`.toLowerCase();
  let score = scoreObjectType(objectType);

  for (const keyword of RARITY_KEYWORDS) {
    if (text.includes(keyword)) {
      score += keyword.includes("gravitational lens") ? 3 : 2;
    }
  }

  if (image.mission && /jwst|james webb/i.test(image.mission)) {
    score += 1;
  }

  if (image.instrument && /miri|nircam|nirspec/i.test(image.instrument)) {
    score += 1;
  }

  if (score >= 7) return { level: "Exceptional", score };
  if (score >= 5) return { level: "Rare", score };
  if (score >= 3) return { level: "Unusual", score };
  return { level: "Common", score };
};
