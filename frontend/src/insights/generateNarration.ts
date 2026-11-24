import type { SpaceImage } from "../models/SpaceImage";
import type { ObjectType } from "./classifyObjectType";

const clean = (value?: string) => (value ? value.trim() : "");

export const generateNarrationScript = (image: SpaceImage, objectType: ObjectType): string => {
  const title = clean(image.title) || "this observation";
  const mission = clean(image.mission);
  const instrument = clean(image.instrument);
  const source = [instrument, mission].filter(Boolean).join(" / ");
  const description = clean(image.description);
  const firstSentence = description ? description.split(/(?<=[.!?])\s/)[0] : "";

  return [
    `Welcome to ${title}.`,
    `You're looking at a ${objectType.toLowerCase()} captured by ${source || "space observatories"}.`,
    firstSentence ? firstSentence : "This observation reveals structure that would be invisible in ordinary light.",
    "Stay a moment and explore the details—every point of light has a story.",
  ]
    .filter(Boolean)
    .join(" ");
};
