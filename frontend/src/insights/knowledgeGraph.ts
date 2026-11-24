import type { SpaceImage } from "../models/SpaceImage";
import { classifyObjectType } from "./classifyObjectType";
import { generateTags } from "./generateTags";

export interface KnowledgeNode {
  objectType: string;
  mission?: string;
  instrument?: string;
  era?: string;
  tags: string[];
}

export const buildKnowledgeNode = (image: SpaceImage): KnowledgeNode => {
  const objectType = classifyObjectType(image);
  const year = image.date?.slice(0, 4);
  const era = year && /^\d{4}$/.test(year) ? `${year}s` : undefined;

  return {
    objectType,
    mission: image.mission,
    instrument: image.instrument,
    era,
    tags: generateTags(image),
  };
};
