import { describe, expect, it } from "vitest";
import { rankCommandItems, type SearchableCommandItem } from "./commandPaletteSearch";

const item = (id: string, label: string, keywords = "", badge = "Mode"): SearchableCommandItem => ({
  id,
  label,
  meta: `${label} destination`,
  badge,
  keywords,
});

describe("command palette astronomical ranking", () => {
  it("ranks the exact Solar object before a scoped SkyMap representation", () => {
    const results = rankCommandItems(
      [item("solar:mars", "Mars", "planet"), item("sky:mars", "SkyMap: Mars", "planet")],
      "Mars",
    );
    expect(results.map((result) => result.id)).toEqual(["solar:mars", "sky:mars"]);
  });

  it("matches source aliases and scientific catalogue identifiers", () => {
    const results = rankCommandItems(
      [
        item("halley", "Halley's Comet", "1P/Halley comet"),
        item("andromeda", "SkyMap: Andromeda Galaxy", "M31 NGC 224"),
      ],
      "M31",
    );
    expect(results.map((result) => result.id)).toEqual(["andromeda"]);
  });

  it("returns no navigation target for an unrelated imagery query", () => {
    expect(rankCommandItems([item("vega", "Vega", "nearby star")], "JWST deep field")).toEqual([]);
  });
});
