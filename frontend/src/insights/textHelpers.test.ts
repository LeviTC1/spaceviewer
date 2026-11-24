import { describe, expect, it } from "vitest";
import type { SpaceImage } from "../models/SpaceImage";
import { buildExplanationProvenance } from "./explanationProvenance";
import { generateSummary } from "./generateSummary";
import { generateTags } from "./generateTags";

const makeImage = (overrides: Partial<SpaceImage> = {}): SpaceImage => ({
  id: "ai-image-1",
  title: "Carina Nebula",
  description:
    "This infrared view reveals young stars carving cavities through dust and gas. A second sentence should not dominate the summary.",
  keywords: ["nebula", "infrared", "star formation"],
  date: "2022-07-12",
  center: "STScI",
  mission: "JWST",
  instrument: "NIRCam",
  imageUrl: "https://example.test/preview.jpg",
  ...overrides,
});

describe("generateSummary", () => {
  it("produces distinct beginner and scientific summaries from the same metadata", () => {
    const image = makeImage();

    const beginner = generateSummary(image, "beginner");
    const scientific = generateSummary(image, "scientific");

    expect(beginner).toContain("This image helps us explore the universe");
    expect(beginner).toContain("It was captured on 2022-07-12.");
    expect(beginner).toContain("It was captured by NIRCam / STScI.");
    expect(beginner).toContain("It relates to nebula, infrared, star formation.");
    expect(scientific).toContain("observed on 2022-07-12 via NIRCam / JWST / STScI");
    expect(scientific).toContain("Instrument context: NIRCam / JWST / STScI.");
    expect(scientific).toContain("Keywords highlight nebula, infrared, star formation.");
    expect(scientific).not.toBe(beginner);
  });

  it("falls back cleanly when source metadata is sparse", () => {
    const summary = generateSummary(
      makeImage({
        id: "sparse-summary",
        title: "",
        description: "",
        keywords: [],
        date: "Unknown",
        center: undefined,
        mission: undefined,
        instrument: undefined,
      }),
      "scientific",
    );

    expect(summary).toContain("Untitled observation");
    expect(summary).toContain("Additional metadata is limited");
  });
});

describe("generateTags", () => {
  it("prefers existing keywords and source metadata", () => {
    const tags = generateTags(makeImage());

    expect(tags).toEqual(expect.arrayContaining(["nebula", "infrared", "star formation", "NIRCam", "JWST", "STScI"]));
    expect(tags.length).toBeLessThanOrEqual(12);
  });

  it("derives fallback tags from title and description when metadata tags are absent", () => {
    const tags = generateTags(
      makeImage({
        id: "fallback-tags",
        title: "Ancient Spiral Galaxy Portrait",
        description: "A luminous spiral galaxy stretches across the dark field with visible dust lanes.",
        keywords: [],
        center: undefined,
        mission: undefined,
        instrument: undefined,
      }),
    );

    expect(tags.slice(0, 4)).toEqual(["ancient", "spiral", "galaxy", "portrait"]);
    expect(tags).not.toContain("image");
    expect(tags).not.toContain("space");
  });
});

describe("buildExplanationProvenance", () => {
  it("describes rich deterministic explanations with high confidence", () => {
    const provenance = buildExplanationProvenance(
      makeImage({
        metadataQuality: {
          label: "Rich",
          score: 92,
          factors: ["title", "description", "preview asset", "date", "source URL", "mission or instrument"],
          missing: [],
        },
        archiveId: "PIA12345",
        source: "nasa",
        sourceUrl: "https://images.nasa.gov/details/PIA12345",
        dimensions: { width: 1200, height: 800, unit: "pixels" },
      }),
      "scientific",
    );

    expect(provenance.methodLabel).toBe("Deterministic metadata summary");
    expect(provenance.modeLabel).toBe("Scientific notes");
    expect(provenance.confidenceLabel).toBe("High");
    expect(provenance.confidenceScore).toBe(92);
    expect(provenance.evidence).toEqual(
      expect.arrayContaining(["long description", "3 keywords", "mission/instrument", "NASA Image Library provenance"]),
    );
    expect(provenance.caveats.join(" ")).toContain("No remote model call");
  });

  it("surfaces sparse metadata as low confidence with missing-data notes", () => {
    const provenance = buildExplanationProvenance(
      makeImage({
        id: "sparse-provenance",
        title: "Untitled",
        description: "",
        keywords: [],
        date: "Unknown",
        center: undefined,
        mission: undefined,
        instrument: undefined,
        source: "local",
        archiveId: undefined,
        sourceUrl: undefined,
        archiveUrl: undefined,
        metadataQuality: {
          label: "Limited",
          score: 14,
          factors: ["preview asset"],
          missing: ["title", "description", "date", "keywords"],
        },
      }),
      "beginner",
    );

    expect(provenance.modeLabel).toBe("Beginner explanation");
    expect(provenance.confidenceLabel).toBe("Low");
    expect(provenance.missing).toEqual(
      expect.arrayContaining(["title", "description", "date", "keywords", "mission or instrument", "source URL"]),
    );
    expect(provenance.caveats).toContain("Sparse metadata means the explanation should be treated as a starting point.");
  });
});
