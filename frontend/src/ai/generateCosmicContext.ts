import type { SpaceImage } from "../models/SpaceImage";
import type { ObjectType } from "./classifyObjectType";

const clean = (value?: string) => (value ? value.trim() : "");

const extractDistance = (text: string): string | null => {
  const match = text.match(/(\d[\d,\.]*\s*(?:million|billion)?\s*light[- ]?years?)/i);
  return match ? match[1].replace(/\s+/g, " ").trim() : null;
};

export const generateCosmicContext = (image: SpaceImage, objectType: ObjectType): string[] => {
  const description = clean(image.description);
  const distance = description ? extractDistance(description) : null;
  const center = clean(image.center);
  const instrument = clean(image.instrument);
  const mission = clean(image.mission);
  const source = [instrument, mission, center].filter(Boolean).join(" / ");
  const typeLine = `Structure type: ${objectType}.`;
  const distanceLine = distance ? `Estimated distance: ${distance}.` : "Estimated distance: not available.";
  const sourceLine = source ? `Observed via ${source}.` : "Observed via multiple observatories.";
  const scaleLine = objectType === "Galaxy" || objectType === "Deep Field"
    ? "Scale: spans vast regions across interstellar or intergalactic space."
    : "Scale: structure size varies from light-years to larger stellar neighborhoods.";

  return [typeLine, distanceLine, sourceLine, scaleLine];
};
