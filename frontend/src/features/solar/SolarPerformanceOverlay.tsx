import { useEffect, useMemo, useState, type FC } from "react";
import type { TextureQuality } from "./textures/textureCatalog";
import { readSolarTextureDiagnostics, type SolarTextureDiagnostics } from "./textures/solarTextureDiagnostics";

type PerfEntry = {
  mode: "active" | "idle";
  reasons: string[];
  diagnostics: Record<string, number | string | boolean | null | undefined>;
  updatedAt: string;
};

type PerfWindow = Window & {
  __SPACEVIEWER_PERF__?: Record<string, PerfEntry>;
};

interface SolarPerformanceOverlayProps {
  performanceMode: boolean;
  textureQuality: TextureQuality;
  adaptiveQualityEnabled: boolean;
  adaptiveQualityTriggered: boolean;
  isPlaying: boolean;
  loadingProgress: number;
}

const formatUpdatedAge = (updatedAt?: string) => {
  if (!updatedAt) return "pending";
  const ageMs = Date.now() - Date.parse(updatedAt);
  if (!Number.isFinite(ageMs) || ageMs < 0) return "pending";
  if (ageMs < 1000) return "live";
  return `${Math.round(ageMs / 1000)}s ago`;
};

const SolarPerformanceOverlay: FC<SolarPerformanceOverlayProps> = ({
  performanceMode,
  textureQuality,
  adaptiveQualityEnabled,
  adaptiveQualityTriggered,
  isPlaying,
  loadingProgress,
}) => {
  const [perfEntry, setPerfEntry] = useState<PerfEntry | null>(null);
  const [textureDiagnostics, setTextureDiagnostics] = useState<SolarTextureDiagnostics>(() =>
    readSolarTextureDiagnostics(),
  );

  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === "undefined") return undefined;
    const readPerf = () => {
      const next = (window as PerfWindow).__SPACEVIEWER_PERF__?.solar ?? null;
      setPerfEntry(next);
      setTextureDiagnostics(readSolarTextureDiagnostics());
    };
    readPerf();
    const intervalId = window.setInterval(readPerf, 750);
    return () => window.clearInterval(intervalId);
  }, []);

  const diagnostics = perfEntry?.diagnostics ?? {};
  const reasonLabel = useMemo(() => {
    const reasons = perfEntry?.reasons.filter(Boolean) ?? [];
    return reasons.length ? reasons.slice(0, 3).join(", ") : "demand render idle";
  }, [perfEntry?.reasons]);

  if (!import.meta.env.DEV) {
    return null;
  }

  return (
    <aside className="solar-perf-overlay" aria-label="Solar performance diagnostics">
      <div className="solar-perf-overlay__header">
        <p className="eyebrow">PERF</p>
        <strong>{perfEntry?.mode ?? "idle"}</strong>
        <span>{formatUpdatedAge(perfEntry?.updatedAt)}</span>
      </div>
      <dl>
        <div>
          <dt>Render reason</dt>
          <dd>{reasonLabel}</dd>
        </div>
        <div>
          <dt>Quality</dt>
          <dd>
            {performanceMode ? "Performance" : "Detail"} · {textureQuality}
          </dd>
        </div>
        <div>
          <dt>Adaptive quality</dt>
          <dd>
            {adaptiveQualityEnabled ? (adaptiveQualityTriggered ? "Reduced tier" : "Monitoring") : "Manual override"}
          </dd>
        </div>
        <div>
          <dt>Loop</dt>
          <dd>{isPlaying ? "Time playback" : "Demand"}</dd>
        </div>
        <div>
          <dt>Loaded</dt>
          <dd>{Math.round(Math.min(1, Math.max(0, loadingProgress)) * 100)}%</dd>
        </div>
        <div>
          <dt>Textures</dt>
          <dd>
            {textureDiagnostics.loaded}/{textureDiagnostics.requested} loaded · {textureDiagnostics.failed} failed ·{" "}
            {textureDiagnostics.timedOut} timed out · {textureDiagnostics.pendingHits} shared
          </dd>
        </div>
        <div>
          <dt>Scene</dt>
          <dd>
            {diagnostics.visibleMoons ?? 0} moons · {diagnostics.asteroidMode ?? "off"} belt · LOD{" "}
            {diagnostics.starLod ?? 0}
          </dd>
        </div>
      </dl>
    </aside>
  );
};

export default SolarPerformanceOverlay;
