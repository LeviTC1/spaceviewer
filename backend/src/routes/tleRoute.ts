import { Router, Request, Response } from "express";
import log from "../utils/logger";

// Two-line element sets for the Earth orbiters the explorer draws (ISS, Hubble, Tiangong), relayed from
// CelesTrak. CelesTrak updates GP data about every two hours and blocks clients that ask again sooner, so
// every visitor shares one cached copy per object; if CelesTrak is unavailable the last good copy is served.

const router = Router();
const CELESTRAK = "https://celestrak.org/NORAD/elements/gp.php";
const CACHE_MS = 2 * 60 * 60 * 1000;
const ALLOWED = new Set([25544, 20580, 48274]);

interface CachedSet {
  line1: string;
  line2: string;
  fetchedAt: number;
}
const cache = new Map<number, CachedSet>();

const refresh = async (norad: number): Promise<CachedSet | null> => {
  const cached = cache.get(norad);
  if (cached && Date.now() - cached.fetchedAt < CACHE_MS) return cached;
  try {
    const response = await fetch(`${CELESTRAK}?CATNR=${norad}&FORMAT=TLE`, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`CelesTrak HTTP ${response.status}`);
    const lines = (await response.text()).split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean);
    const [line1, line2] = lines.slice(-2);
    if (!line1?.startsWith("1 ") || !line2?.startsWith("2 ")) throw new Error("Unexpected TLE text");
    const next = { line1, line2, fetchedAt: Date.now() };
    cache.set(norad, next);
    return next;
  } catch (error) {
    log("TLE refresh failed", { norad, message: (error as Error).message });
    return cached ?? null;
  }
};

router.get("/", async (req: Request, res: Response) => {
  const requested = String(req.query.norad ?? "")
    .split(",")
    .map(Number)
    .filter((norad) => ALLOWED.has(norad));
  const sets = await Promise.all(requested.map(async (norad) => ({ norad, set: await refresh(norad) })));
  res.set("Cache-Control", "public, max-age=1800");
  // Always 200: the explorer falls back to its bundled elements for anything missing.
  res.json({
    success: true,
    source: "CelesTrak GP data (celestrak.org)",
    sets: sets
      .filter((item) => item.set)
      .map((item) => ({ norad: item.norad, line1: item.set!.line1, line2: item.set!.line2, fetchedAt: new Date(item.set!.fetchedAt).toISOString() })),
  });
});

export default router;
