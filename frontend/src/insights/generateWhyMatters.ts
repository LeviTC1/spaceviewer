import type { SpaceImage } from "../models/SpaceImage";
import type { ObjectType } from "./classifyObjectType";

const clean = (value?: string) => (value ? value.trim() : "");

export const generateWhyMatters = (image: SpaceImage, objectType: ObjectType): string => {
  const title = clean(image.title) || "this observation";
  const instrument = clean(image.instrument);
  const mission = clean(image.mission);
  const center = clean(image.center);
  const description = clean(image.description);
  const keywords = Array.isArray(image.keywords) ? image.keywords.map(clean).filter(Boolean) : [];
  const source = [instrument, mission, center].filter(Boolean).join(" / ");
  const keywordFocus = keywords.length ? keywords.slice(0, 3).join(", ") : title.toLowerCase();
  const summaryLine = description ? description.split(/(?<=[.!?])\s/)[0] : "";

  return [
    `Astronomers care about ${title.toLowerCase()} because it reveals critical details about ${objectType.toLowerCase()} environments.`,
    source
      ? `Captured via ${source}, this observation helps researchers validate models of ${keywordFocus}.`
      : `The observation was worth capturing because it sharpens our understanding of ${keywordFocus}.`,
    summaryLine ? `What it contributes: ${summaryLine}` : `What it contributes: clearer context for ${keywordFocus}.`,
  ]
    .filter(Boolean)
    .join(" ");
};
