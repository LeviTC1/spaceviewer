import type { SpaceImage } from "../models/SpaceImage";
import type { ObjectType } from "./classifyObjectType";

const clean = (value?: string) => (value ? value.trim() : "");

export const generateStory = (image: SpaceImage, objectType: ObjectType): string => {
  const title = clean(image.title) || "this cosmic scene";
  const instrument = clean(image.instrument);
  const mission = clean(image.mission);
  const source = [instrument, mission].filter(Boolean).join(" / ");

  const opening = `In ${title.toLowerCase()}, we see a ${objectType.toLowerCase()} shaped by time, gravity, and light.`;
  const middle = source
    ? `Captured through ${source}, the observation exposes faint structure and hidden layers.`
    : "Captured through advanced observatories, the observation exposes faint structure and hidden layers.";
  const close = "It is a reminder that the universe is both ancient and still in motion.";

  return [opening, middle, close].join(" ");
};
