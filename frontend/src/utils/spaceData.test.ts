import { describe, expect, it } from "vitest";
import type { SpaceImage } from "../models/SpaceImage";
import { buildMetadataQuality } from "./metadataQuality";
import { mapSearchItem, type SearchResult } from "./mapSearchItem";
import { filterSearchResults, filterSpaceImages, isBlockedCenter } from "./spaceFilter";

const makeImage = (overrides: Partial<SpaceImage> = {}): SpaceImage => ({
  id: "img-1",
  title: "Carina Nebula",
  description:
    "A detailed infrared observation of a bright star-forming nebula with dust lanes, energetic young stars, and sculpted gas clouds.",
  keywords: ["nebula", "infrared", "star formation", "jwst"],
  date: "2022-07-12",
  center: "STScI",
  mission: "JWST",
  instrument: "NIRCam",
  imageUrl: "https://example.test/preview.jpg",
  thumbnailUrl: "https://example.test/thumb.jpg",
  fullRes: "https://example.test/full.jpg",
  archiveId: "PIA12345",
  sourceUrl: "https://images.nasa.gov/details/PIA12345",
  dimensions: { width: 2048, height: 1365, unit: "pixels" },
  ...overrides,
});

describe("metadata quality", () => {
  it("scores a richly described image as rich", () => {
    const quality = buildMetadataQuality(makeImage());

    expect(quality.label).toBe("Rich");
    expect(quality.score).toBe(100);
    expect(quality.factors).toContain("source URL");
    expect(quality.factors).toContain("dimensions");
    expect(quality.missing).toHaveLength(0);
  });

  it("surfaces missing metadata for sparse records", () => {
    const quality = buildMetadataQuality(
      makeImage({
        id: "sparse",
        title: "Untitled",
        description: "",
        keywords: [],
        date: "Unknown",
        center: undefined,
        mission: undefined,
        instrument: undefined,
        imageUrl: "",
        thumbnailUrl: undefined,
        fullRes: undefined,
        archiveId: undefined,
        sourceUrl: undefined,
        archiveUrl: undefined,
        dimensions: undefined,
      }),
    );

    expect(quality.label).toBe("Limited");
    expect(quality.score).toBe(8);
    expect(quality.factors).toEqual(["archive id"]);
    expect(quality.missing).toEqual(
      expect.arrayContaining(["title", "description", "preview asset", "source URL", "dimensions"]),
    );
  });
});

describe("search item mapping", () => {
  it("normalizes NASA records with provenance, dimensions, and match reasons", () => {
    const image = mapSearchItem({
      source: "nasa",
      matchReason: 'NASA metadata matched "JWST nebula".',
      item: {
        data: [
          {
            nasa_id: "PIA12345",
            title: "JWST Carina Nebula",
            description:
              "An infrared image revealing young stars and textured clouds inside the Carina Nebula star-forming region.",
            keywords: ["JWST", "nebula", "infrared", "stars"],
            date_created: "2022-07-12T00:00:00Z",
            center: "STScI",
            mission: "JWST",
            instrument: "NIRCam",
            width: "4096",
            height: 2731,
          },
        ],
        links: [{ href: "https://images-assets.nasa.gov/image/PIA12345/PIA12345~thumb.jpg", render: "image" }],
      },
    });

    expect(image.id).toBe("PIA12345");
    expect(image.source).toBe("nasa");
    expect(image.date).toBe("2022-07-12");
    expect(image.archiveId).toBe("PIA12345");
    expect(image.sourceUrl).toBe("https://images.nasa.gov/details/PIA12345");
    expect(image.matchReason).toBe('NASA metadata matched "JWST nebula".');
    expect(image.dimensions).toMatchObject({ width: 4096, height: 2731, unit: "pixels" });
    expect(image.metadataQuality?.label).toBe("Rich");
  });

  it("normalizes survey cutouts with survey-specific defaults", () => {
    const sdss = mapSearchItem({
      source: "sdss",
      item: {
        id: "sdss-m31",
        title: "SDSS cutout near M31",
        description: "A survey cutout generated from resolved sky coordinates near the Andromeda Galaxy.",
        ra: 10.684,
        dec: 41.269,
        imageUrl: "https://example.test/sdss.jpg",
        fullRes: "https://example.test/sdss-full.jpg",
        archiveUrl: "https://skyserver.sdss.org/dr18",
        source: "SDSS",
        keywords: ["galaxy", "survey"],
      },
    });

    const ps1 = mapSearchItem({
      source: "ps1",
      matchReason: "Pan-STARRS resolved the requested sky position.",
      item: {
        id: "ps1-m31",
        title: "Pan-STARRS cutout near M31",
        description: "A Pan-STARRS cutout generated from resolved sky coordinates near Andromeda.",
        ra: 10.684,
        dec: 41.269,
        imageUrl: "https://example.test/ps1.jpg",
        fullRes: "https://example.test/ps1-full.jpg",
        archiveUrl: "https://ps1images.stsci.edu",
        source: "Pan-STARRS",
        keywords: ["galaxy", "survey"],
      },
    });

    expect(sdss.source).toBe("sdss");
    expect(sdss.mission).toBe("SDSS");
    expect(sdss.dimensions).toMatchObject({ width: 640, height: 640, scaleArcsecPerPixel: 0.3 });
    expect(sdss.matchReason).toContain("SDSS cutout");
    expect(ps1.source).toBe("ps1");
    expect(ps1.center).toBe("Pan-STARRS");
    expect(ps1.matchReason).toBe("Pan-STARRS resolved the requested sky position.");
  });
});

describe("space filtering", () => {
  it("filters NASA event records while keeping astronomy records and other sources", () => {
    const results: SearchResult[] = [
      {
        source: "nasa",
        item: {
          data: [
            {
              title: "NASA Headquarters Student Competition Ceremony",
              description: "Students gather for an awards event at NASA HQ.",
              center: "NASA HQ",
              keywords: ["student", "awards", "ceremony"],
            },
          ],
          links: [],
        },
      },
      {
        source: "nasa",
        item: {
          data: [
            {
              title: "Hubble Spiral Galaxy",
              description: "A galaxy image showing star clusters and dust lanes.",
              center: "STScI",
              keywords: ["galaxy", "hubble", "stars"],
            },
          ],
          links: [],
        },
      },
      {
        source: "sdss",
        item: {
          id: "sdss-1",
          title: "SDSS Galaxy",
          description: "A survey cutout.",
          ra: 1,
          dec: 2,
          imageUrl: "https://example.test/sdss.jpg",
          fullRes: "https://example.test/sdss-full.jpg",
          archiveUrl: "https://skyserver.sdss.org",
          source: "SDSS",
        },
      },
    ];

    expect(filterSearchResults(results)).toHaveLength(2);
    expect(filterSearchResults(results).map((result) => result.source)).toEqual(["nasa", "sdss"]);
  });

  it("uses center and event heuristics for mapped images", () => {
    expect(isBlockedCenter("Kennedy Space Center")).toBe(true);

    const filtered = filterSpaceImages([
      makeImage({ id: "event", title: "NASA HQ award ceremony", center: "NASA Headquarters", keywords: ["award"] }),
      makeImage({ id: "science", title: "Andromeda Galaxy", keywords: ["galaxy", "stars"], center: "STScI" }),
    ]);

    expect(filtered.map((image) => image.id)).toEqual(["science"]);
  });
});
