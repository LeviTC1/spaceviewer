import { Router, Request, Response } from "express";
import { getNasaServiceDiagnostics } from "../services/jwstApi";
import { getMastResolverDiagnostics } from "../services/mastResolver";
import { getPs1ServiceDiagnostics } from "../services/ps1Api";

const router = Router();
const startedAt = new Date();

router.get("/", (_req: Request, res: Response) => {
  const now = new Date();
  res.json({
    success: true,
    status: "ok",
    service: "SpaceViewer API",
    startedAt: startedAt.toISOString(),
    checkedAt: now.toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    sources: [
      { id: "nasa", label: "NASA Image Library", mode: "remote-api" },
      { id: "sdss", label: "SDSS", mode: "coordinate-cutout" },
      { id: "ps1", label: "Pan-STARRS", mode: "coordinate-cutout" },
    ],
    diagnostics: {
      nasa: getNasaServiceDiagnostics(),
      mast: getMastResolverDiagnostics(),
      ps1: getPs1ServiceDiagnostics(),
    },
  });
});

export default router;
