import type { SpaceImage } from "../models/SpaceImage";
import type { ObjectType } from "./classifyObjectType";

const clean = (value?: string) => (value ? value.trim() : "");

export const generateFacts = (image: SpaceImage, objectType: ObjectType): string[] => {
  const facts: string[] = [];
  const instrument = clean(image.instrument);
  const mission = clean(image.mission);
  const keywords = Array.isArray(image.keywords) ? image.keywords.map(clean).filter(Boolean) : [];
  const lowerKeywords = keywords.map((item) => item.toLowerCase());

  if (objectType === "Nebula") {
    facts.push("This nebula is a stellar nursery where new stars are born.");
  }
  if (objectType === "Deep Field") {
    facts.push("Deep field images capture light from galaxies billions of years in the past.");
  }
  if (objectType === "Supernova Remnant") {
    facts.push("Supernova remnants are expanding shock waves from exploded stars.");
  }
  if (instrument || mission) {
    facts.push(`Captured with ${[instrument, mission].filter(Boolean).join(" / ")} to reveal faint structure.`);
  }
  if (lowerKeywords.some((item) => item.includes("infrared")) || /miri|nircam/i.test(instrument)) {
    facts.push("Infrared observations can peer through cosmic dust.");
  }

  return facts.slice(0, 3);
};
