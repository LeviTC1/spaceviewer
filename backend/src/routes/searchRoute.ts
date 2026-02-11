import { Router, Request, Response } from "express";
import { fetchSearchResults } from "../services/jwstApi";
import { resolveTarget } from "../services/mastResolver";
import { buildSdssItem } from "../services/sdssApi";
import { buildPs1Item } from "../services/ps1Api";
import log from "../utils/logger";

const router = Router();
const AVAILABLE_SOURCES = ["nasa", "sdss", "ps1"] as const;
type SearchSource = (typeof AVAILABLE_SOURCES)[number];

router.get("/", async (req: Request, res: Response) => {
  const target = (req.query.target as string) ?? "";
  const pageParam = Number(req.query.page ?? "1");
  const page = Number.isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;
  const sourceParam = String(req.query.source ?? "all").toLowerCase();
  const sources: SearchSource[] =
    sourceParam === "all"
      ? [...AVAILABLE_SOURCES]
      : sourceParam
          .split(",")
          .map((value) => value.trim())
          .filter((value): value is SearchSource => AVAILABLE_SOURCES.includes(value as SearchSource));
  if (!sources.length) {
    sources.push("nasa");
  }

  if (!target.trim()) {
    return res.status(400).json({
      success: false,
      query: "",
      results: [],
      error: "Missing 'target' query parameter",
    });
  }

  try {
    log("Search request", { target, page, sources });

    const extraResults: Array<{ source: SearchSource; item: unknown }> = [];
    if (sources.includes("sdss") || sources.includes("ps1")) {
      const resolved = await resolveTarget(target);
      if (resolved) {
        if (sources.includes("sdss")) {
          extraResults.push({ source: "sdss", item: buildSdssItem(resolved.ra, resolved.dec, resolved.name) });
        }
        if (sources.includes("ps1")) {
          const ps1Item = await buildPs1Item(resolved.ra, resolved.dec, resolved.name);
          if (ps1Item) {
            extraResults.push({ source: "ps1", item: ps1Item });
          }
        }
      }
    }

    let nasaResults: Array<{ source: SearchSource; item: unknown }> = [];
    let hasMore = false;
    if (sources.includes("nasa")) {
      const { results, hasMore: nasaHasMore } = await fetchSearchResults(target, page);
      nasaResults = results.map((item) => ({ source: "nasa", item }));
      hasMore = nasaHasMore;
    }

    return res.json({
      success: true,
      query: target,
      results: [...extraResults, ...nasaResults],
      hasMore,
    });
  } catch (error) {
    console.error("searchRoute error", error);
    return res.status(500).json({
      success: false,
      query: target,
      results: [],
      error: "Search failed",
    });
  }
});

export default router;
