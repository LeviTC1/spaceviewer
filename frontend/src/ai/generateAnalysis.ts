import type { SpaceImage } from "../models/SpaceImage";
import type { AiMode } from "./generateSummary";

export interface AiAnalysis {
  items: string[];
}

const clean = (value?: string) => (value ? value.trim() : "");

const takeSentence = (text: string) => {
  const match = text.match(/(.+?[.!?])(\s|$)/);
  return match ? match[1] : text;
};

const joinList = (items: string[], fallback: string) => (items.length ? items.join(", ") : fallback);

export const generateAnalysis = (image: SpaceImage, mode: AiMode): AiAnalysis => {
  const title = clean(image.title) || "This observation";
  const description = clean(image.description);
  const keywords = Array.isArray(image.keywords) ? image.keywords.map(clean).filter(Boolean) : [];
  const instrument = clean(image.instrument);
  const mission = clean(image.mission);
  const center = clean(image.center);
  const date = clean(image.date);
  const source = [instrument, mission, center].filter(Boolean).join(" / ");

  const keywordFocus = joinList(keywords.slice(0, 4), title.toLowerCase());
  const descriptionSentence = description ? takeSentence(description) : "";

  if (mode === "beginner") {
    const interesting = descriptionSentence
      ? `What's interesting: ${descriptionSentence}`
      : `What's interesting: This image highlights ${keywordFocus}.`;
    const why = source
      ? `Why it was captured: ${source} observed ${title.toLowerCase()} to learn more about ${keywordFocus}.`
      : `Why it was captured: It helps scientists learn more about ${keywordFocus}.`;
    const study = `What researchers might study: how the shapes and light in ${keywordFocus} change over time.`;
    const notable = `Notable features: ${keywordFocus}.`;

    return { items: [interesting, why, study, notable] };
  }

  const interesting = descriptionSentence
    ? `Scientifically interesting: ${descriptionSentence}`
    : `Scientifically interesting: This dataset focuses on ${keywordFocus}.`;
  const why = source
    ? `Why it was captured: ${source} targeted ${title} to study ${keywordFocus}.`
    : `Why it was captured: It was observed to characterize ${keywordFocus}.`;
  const study = `Researchers might study ${keywordFocus} to understand formation physics, structure, and evolution.`;
  const notable = keywords.length
    ? `Notable structures: ${keywords.slice(0, 4).join(", ")}.`
    : `Notable structures: morphology suggested by ${title}.`;
  const dateLine = date && date !== "Unknown" ? ` Observation date: ${date}.` : "";

  return { items: [interesting, `${why}${dateLine}`, study, notable] };
};
