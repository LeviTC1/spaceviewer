import { Router, Request, Response } from "express";
import { fetchSearchResults } from "../services/jwstApi";
import log from "../utils/logger";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  const target = (req.query.target as string) ?? "";
  const pageParam = Number(req.query.page ?? "1");
  const page = Number.isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;

  if (!target.trim()) {
    return res.status(400).json({
      success: false,
      query: "",
      results: [],
      error: "Missing 'target' query parameter",
    });
  }

  try {
    log("NASA search request", { target, page });
    const { results, hasMore } = await fetchSearchResults(target, page);

    return res.json({
      success: true,
      query: target,
      results,
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
