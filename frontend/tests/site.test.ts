import { describe, expect, it } from "vitest";
import { exploreHref, formatYear, getPlace, lightStory, matchImageToPlace, placeDistanceLy, searchPlaces } from "../src/shell/places";
import { MOMENTS, getMoment, momentForToday, momentHref } from "../src/shell/moments";
import { discOverlapFraction } from "../src/features/explore/engine/occlusion";
import { rankCommandItems } from "../src/components/layout/commandPaletteSearch";

const photo = (title: string, keywords: string[] = [], description = "") => ({ title, keywords, description });

describe("photograph → place bridge", () => {
  it("finds the place a photograph shows from its title", () => {
    expect(matchImageToPlace(photo("James Webb Space Telescope NIRCam Image of the “Cosmic Cliffs” in Carina Nebula"))?.id).toBe("deep:nebula:carina-nebula");
    expect(matchImageToPlace(photo("Pillars of Creation Revealed in 3-D"))?.id).toBe("deep:nebula:eagle-nebula");
    expect(matchImageToPlace(photo("Hubble's view of M31"))?.id).toBe("deep:galaxy:andromeda-galaxy");
    expect(matchImageToPlace(photo("Lightning Strikes at Saturn"))?.id).toBe("solar:planet:saturn");
  });

  it("prefers the specific object over the planet it orbits", () => {
    expect(matchImageToPlace(photo("Europa's surface from Galileo", ["Jupiter", "Europa"]))?.id).toBe("solar:moon:europa");
  });

  it("does not treat ordinary words as places", () => {
    // "Io" and "Moon" only count in titles, with their capitalisation.
    expect(matchImageToPlace(photo("Studio portrait of an astronaut", [], "radio io moon landing training")) ).toBeNull();
    expect(matchImageToPlace(photo("Engineers test a rover wheel"))).toBeNull();
  });

  it("links places to the universe and knows their distances", () => {
    expect(exploreHref("deep:nebula:orion-nebula")).toBe("/explore?object=deep%3Anebula%3Aorion-nebula");
    const andromeda = getPlace("deep:galaxy:andromeda-galaxy");
    expect(andromeda && placeDistanceLy(andromeda)).toBeGreaterThan(2_000_000);
    const saturn = getPlace("solar:planet:saturn");
    expect(saturn && placeDistanceLy(saturn)).toBeLessThan(0.001);
  });

  it("searches places by name, alias and catalogue number", () => {
    expect(searchPlaces("sat")[0]?.id).toBe("solar:planet:saturn");
    expect(searchPlaces("M42")[0]?.id).toBe("deep:nebula:orion-nebula");
    expect(searchPlaces("sgr a*")[0]?.id).toBe("explore:sagittarius-a-star");
  });
});

describe("light-travel stories", () => {
  it("tells deep-sky light against human history (derived from distance)", () => {
    const carina = lightStory(8_500, 2026);
    expect(carina.travel).toBe("8,500 years");
    expect(carina.departed).toBe(-6474);
    expect(carina.era).toMatch(/farming/);
    // No invented coincidences: 31 million years matches no anchor; 1,344 years just gives the year.
    expect(lightStory(31_100_000, 2026).era).toBeNull();
    expect(lightStory(1_344, 2026)).toMatchObject({ departed: 682, era: null });
    expect(formatYear(-6474)).toBe("6,474 BC");
    expect(lightStory(2_537_000, 2026).era).toMatch(/stone tools/);
  });

  it("uses minutes and hours inside the Solar System", () => {
    expect(lightStory(8.317 / 525_960).travel).toMatch(/^8 min/);
    expect(lightStory(1.3 / 8_766).travel).toBe("1.3 hours");
  });
});

describe("moments", () => {
  it("every moment has a real date, a subject and a story", () => {
    for (const moment of MOMENTS) {
      expect(Number.isFinite(Date.parse(moment.at))).toBe(true);
      expect(moment.subject).toMatch(/^(solar|spacecraft):/);
      expect(moment.story.length).toBeGreaterThan(80);
      expect(momentHref(moment)).toContain(`moment=${moment.id}`);
    }
    expect(getMoment("eclipse-2024")?.lensDeg).toBeLessThan(2);
  });

  it("picks the nearest anniversary for the Today card", () => {
    expect(momentForToday(new Date("2026-04-08T09:00:00Z")).moment.id).toBe("eclipse-2024");
    expect(momentForToday(new Date("2026-04-08T09:00:00Z")).daysAway).toBe(0);
    expect(momentForToday(new Date("2026-12-20T09:00:00Z")).moment.id).toBe("great-conjunction-2020");
  });
});

describe("eclipse occlusion", () => {
  it("measures how much of the Sun a nearer disc covers", () => {
    expect(discOverlapFraction(1, 1, 3)).toBe(0);
    expect(discOverlapFraction(1, 1.05, 0)).toBe(1);
    expect(discOverlapFraction(1, 0.5, 0)).toBeCloseTo(0.25, 5);
    const half = discOverlapFraction(1, 1, 1);
    expect(half).toBeGreaterThan(0.38);
    expect(half).toBeLessThan(0.4);
  });
});

describe("Find ranking", () => {
  it("ranks the place above its Solar Explorer tool variant", () => {
    const items = [
      { id: "tool", label: "Solar Explorer: Saturn", meta: "", badge: "Tool" },
      { id: "place", label: "Saturn", meta: "Planet", badge: "Fly" },
    ];
    expect(rankCommandItems(items, "saturn")[0].id).toBe("place");
  });
});

import { LIVE_FEEDS, LIVE_GROUPS, getLiveFeed, liveFeedsForPlace } from "../src/shell/liveFeeds";
import { getPlace as getPlaceForLive } from "../src/shell/places";

describe("live feeds", () => {
  it("every feed has a unique id, a group, a source and a page that always works", () => {
    const ids = new Set<string>();
    for (const feed of LIVE_FEEDS) {
      expect(ids.has(feed.id)).toBe(false);
      ids.add(feed.id);
      expect(LIVE_GROUPS).toContain(feed.group);
      expect(feed.source.length).toBeGreaterThan(2);
      expect(feed.fallbackUrl).toMatch(/^https:\/\//);
      if (feed.kind === "stream") expect(feed.youtubeId).toMatch(/^[\w-]{11}$/);
      if (feed.kind === "movie") expect(feed.src).toMatch(/^https:\/\/.+\.mp4$/);
      if (feed.kind === "image") expect(feed.src).toMatch(/^https:\/\//);
      if (feed.place) expect(getPlaceForLive(feed.place.id)).not.toBeNull();
    }
  });

  it("never embeds the retired NASA stream id", () => {
    expect(LIVE_FEEDS.some((feed) => feed.youtubeId === "FV4Q9DryTG8")).toBe(false);
  });

  it("connects the Sun and Earth to their live feeds", () => {
    expect(liveFeedsForPlace("solar:sun").map((feed) => feed.id)).toContain("sdo-193");
    expect(liveFeedsForPlace("solar:planet:earth").map((feed) => feed.id)).toContain("nasa-iss-hd");
    expect(getLiveFeed("nope")).toBeNull();
  });
});
