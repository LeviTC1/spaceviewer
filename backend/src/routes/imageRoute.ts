import { Router, Request, Response } from "express";
import { fetchImageData } from "../services/jwstApi";
import log from "../utils/logger";

const router = Router();

router.get("/:id", async (req: Request<{ id: string }>, res: Response) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({
      success: false,
      id: "",
      imageUrl: "",
      metadata: null,
      error: "Missing image id parameter",
    });
  }

  try {
    log("NASA image request", { id });
    const data = await fetchImageData(id);

    return res.json({
      success: true,
      id: data.id,
      imageUrl: data.imageUrl,
      metadata: data.metadata,
    });
  } catch (error) {
    console.error("imageRoute error", error);
    return res.status(500).json({
      success: false,
      id,
      imageUrl: "",
      metadata: null,
      error: "Image lookup failed",
    });
  }
});

export default router;
