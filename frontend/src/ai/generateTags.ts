import type { SpaceImage } from "../models/SpaceImage";

const clean = (value?: string) => (value ? value.trim() : "");

const STOPWORDS = new Set([
  "the",
  "and",
  "with",
  "from",
  "into",
  "that",
  "this",
  "over",
  "under",
  "into",
  "near",
  "view",
  "image",
  "space",
  "nasa",
]);

const tokenize = (text: string) =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length > 3 && !STOPWORDS.has(token));

export const generateTags = (image: SpaceImage): string[] => {
  const tags = new Set<string>();
  const keywords = Array.isArray(image.keywords) ? image.keywords.map(clean).filter(Boolean) : [];
  keywords.forEach((keyword) => tags.add(keyword));

  if (image.instrument) tags.add(clean(image.instrument));
  if (image.mission) tags.add(clean(image.mission));
  if (image.center) tags.add(clean(image.center));

  if (!tags.size) {
    const fallback = `${image.title ?? ""} ${image.description ?? ""}`;
    tokenize(fallback).slice(0, 6).forEach((token) => tags.add(token));
  }

  return Array.from(tags).filter(Boolean).slice(0, 12);
};
