import { Router, Request, Response } from "express";
import { fetchSearchResults } from "../services/jwstApi";
import { resolveTarget } from "../services/mastResolver";
import { buildSdssItem } from "../services/sdssApi";
import { buildPs1Item } from "../services/ps1Api";
import log from "../utils/logger";

const router = Router();
const AVAILABLE_SOURCES = ["nasa", "sdss", "ps1"] as const;
type SearchSource = (typeof AVAILABLE_SOURCES)[number];
type SourceHealthState = "loaded" | "empty" | "skipped" | "unavailable" | "error";

interface SourceHealth {
  source: SearchSource;
  label: string;
  status: SourceHealthState;
  count: number;
  message?: string;
  hasMore?: boolean;
  checkedAt: string;
}

const SOURCE_LABELS: Record<SearchSource, string> = {
  nasa: "NASA",
  sdss: "SDSS",
  ps1: "Pan-STARRS",
};

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const makeSourceHealth = (
  source: SearchSource,
  status: SourceHealthState,
  count: number,
  message?: string,
  hasMore?: boolean,
): SourceHealth => ({
  source,
  label: SOURCE_LABELS[source],
  status,
  count,
  message,
  hasMore,
  checkedAt: new Date().toISOString(),
});

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

    const extraResults: Array<{ source: SearchSource; item: unknown; matchReason?: string }> = [];
    const sourceStatus = new Map<SearchSource, SourceHealth>();

    if (sources.includes("sdss") || sources.includes("ps1")) {
      try {
        const resolved = await resolveTarget(target);
        if (resolved) {
          if (sources.includes("sdss")) {
            try {
              extraResults.push({
                source: "sdss",
                item: buildSdssItem(resolved.ra, resolved.dec, resolved.name),
                matchReason: `Resolved ${target} to ${resolved.name} and generated an SDSS cutout at RA ${resolved.ra.toFixed(4)}, Dec ${resolved.dec.toFixed(4)}.`,
              });
              sourceStatus.set("sdss", makeSourceHealth("sdss", "loaded", 1, `Resolved ${resolved.name}.`));
            } catch (error) {
              log("SDSS cutout build failed", { target, message: getErrorMessage(error) });
              sourceStatus.set("sdss", makeSourceHealth("sdss", "error", 0, "SDSS cutout could not be built."));
            }
          }
          if (sources.includes("ps1")) {
            try {
              const ps1Item = await buildPs1Item(resolved.ra, resolved.dec, resolved.name);
              if (ps1Item) {
                extraResults.push({
                  source: "ps1",
                  item: ps1Item,
                  matchReason: `Resolved ${target} to ${resolved.name} and generated a Pan-STARRS cutout at RA ${resolved.ra.toFixed(4)}, Dec ${resolved.dec.toFixed(4)}.`,
                });
                sourceStatus.set("ps1", makeSourceHealth("ps1", "loaded", 1, `Resolved ${resolved.name}.`));
              } else {
                sourceStatus.set("ps1", makeSourceHealth("ps1", "empty", 0, "No Pan-STARRS cutout was available."));
              }
            } catch (error) {
              log("Pan-STARRS cutout lookup failed", { target, message: getErrorMessage(error) });
              sourceStatus.set("ps1", makeSourceHealth("ps1", "error", 0, "Pan-STARRS cutout request failed."));
            }
          }
        } else {
          if (sources.includes("sdss")) {
            sourceStatus.set("sdss", makeSourceHealth("sdss", "unavailable", 0, "Target coordinates could not be resolved."));
          }
          if (sources.includes("ps1")) {
            sourceStatus.set("ps1", makeSourceHealth("ps1", "unavailable", 0, "Target coordinates could not be resolved."));
          }
        }
      } catch (error) {
        log("Target coordinate resolution failed", { target, message: getErrorMessage(error) });
        if (sources.includes("sdss")) {
          sourceStatus.set("sdss", makeSourceHealth("sdss", "error", 0, "Target coordinate resolver request failed."));
        }
        if (sources.includes("ps1")) {
          sourceStatus.set("ps1", makeSourceHealth("ps1", "error", 0, "Target coordinate resolver request failed."));
        }
      }
    }

    let nasaResults: Array<{ source: SearchSource; item: unknown; matchReason?: string }> = [];
    let hasMore = false;
    if (sources.includes("nasa")) {
      try {
        const { results, hasMore: nasaHasMore } = await fetchSearchResults(target, page);
        nasaResults = results.map((item) => ({
          source: "nasa",
          item,
          matchReason: `NASA Image Library returned this record for "${target}" image metadata search.`,
        }));
        hasMore = nasaHasMore;
        sourceStatus.set(
          "nasa",
          makeSourceHealth(
            "nasa",
            results.length ? "loaded" : "empty",
            results.length,
            results.length ? "NASA Image Library returned records." : "NASA Image Library returned no records.",
            nasaHasMore,
          ),
        );
      } catch (error) {
        log("NASA search failed", { target, message: getErrorMessage(error) });
        sourceStatus.set("nasa", makeSourceHealth("nasa", "error", 0, "NASA Image Library request failed."));
      }
    }

    return res.json({
      success: true,
      query: target,
      results: [...extraResults, ...nasaResults],
      hasMore,
      sourceStatus: sources.map((source) => sourceStatus.get(source) ?? makeSourceHealth(source, "skipped", 0)),
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
