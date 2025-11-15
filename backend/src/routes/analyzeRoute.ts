import { Router, Request, Response } from "express";
import { fetchImageData } from "../services/jwstApi";
import log from "../utils/logger";

const router = Router();

interface HighlightRegion {
  x: number;
  y: number;
  r: number;
}

interface AnalyzeSuccess {
  success: true;
  id: string;
  detectedObjects: number;
  highlightedRegions: HighlightRegion[];
  analysis: {
    detectedObjects: number;
    highlightedRegions: HighlightRegion[];
  };
}

interface AnalyzeFailure {
  success: false;
  id: string;
  error: string;
}

const createSeededRandom = (seedString: string) => {
  let seed = 0;
  for (const char of seedString) {
    seed = (seed << 5) - seed + char.charCodeAt(0);
    seed |= 0;
  }

  return () => {
    seed = (seed * 1664525 + 1013904223) % 0xffffffff;
    return (seed & 0xffffffff) / 0xffffffff;
  };
};

const buildRegions = (id: string): HighlightRegion[] => {
  const random = createSeededRandom(id);
  const count = 3 + Math.floor(random() * 5);
  const regions: HighlightRegion[] = [];

  for (let index = 0; index < count; index += 1) {
    regions.push({
      x: Math.round(random() * 800),
      y: Math.round(random() * 600),
      r: Math.round(30 + random() * 70),
    });
  }

  return regions;
};

const runAnalysis = async (id: string): Promise<AnalyzeSuccess> => {
  await fetchImageData(id);
  const highlightedRegions = buildRegions(id);
  return {
    success: true,
    id,
    detectedObjects: highlightedRegions.length,
    highlightedRegions,
    analysis: {
      detectedObjects: highlightedRegions.length,
      highlightedRegions,
    },
  };
};

const sendError = (res: Response<AnalyzeFailure>, id: string, status = 500) =>
  res.status(status).json({
    success: false,
    id,
    error: "Analysis failed",
  });

router.get("/:id", async (req: Request<{ id: string }>, res: Response<AnalyzeSuccess | AnalyzeFailure>) => {
  const { id } = req.params;

  if (!id) {
    return sendError(res, "", 400);
  }

  try {
    log("Running highlight analysis", { id });
    const payload = await runAnalysis(id);
    return res.json(payload);
  } catch (error) {
    console.error("analyzeRoute GET error", error);
    return sendError(res, id);
  }
});

router.post("/:id", async (req: Request<{ id: string }>, res: Response<AnalyzeSuccess | AnalyzeFailure>) => {
  const { id } = req.params;

  if (!id) {
    return sendError(res, "", 400);
  }

  try {
    log("Running highlight analysis (POST)", { id });
    const payload = await runAnalysis(id);
    return res.json(payload);
  } catch (error) {
    console.error("analyzeRoute POST error", error);
    return sendError(res, id);
  }
});

export default router;
