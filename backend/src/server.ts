import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import searchRoute from "./routes/searchRoute";
import imageRoute from "./routes/imageRoute";
import analyzeRoute from "./routes/analyzeRoute";
import log from "./utils/logger";

const app = express();
const PORT = Number(process.env.PORT) || 3001;

// Core middleware
app.use(cors());
app.use(express.json());

// Route mounting
app.use("/api/search", searchRoute);
app.use("/api/image", imageRoute);
app.use("/api/analyze", analyzeRoute);

app.get("/", (_req, res) => {
  res.json({ status: "SpaceViewer API is running" });
});

// Centralized error handler keeps responses consistent.
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  log("Unhandled error", { message: err.message });
  res.status(500).json({
    success: false,
    message: "An unexpected error occurred. Please try again later.",
  });
});

app.listen(PORT, () => {
  log(`SpaceViewer backend listening on port ${PORT}`);
});
