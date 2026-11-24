import type { FC } from "react";
import type { RendererBackend } from "../../domain/astro/rendererBackend";
import { referenceFrameManager } from "../../domain/astro/referenceFrames";
import { SCALE_DOMAIN_ORDER, SCALE_DOMAINS, type ScaleDomainId } from "../../domain/astro/scaleDomains";
import {
  ASTRO_QUALITY_PROFILES,
  type AstroQualityMode,
  type AstroQualitySelection,
  type AstroQualityTier,
} from "../../lib/rendering/qualityManager";
import type { AdaptiveQualityReport } from "../../lib/rendering/adaptiveQuality";

interface CosmicJourneyBarProps {
  activeDomain: ScaleDomainId;
  qualityTier: AstroQualityTier;
  qualityMode: AstroQualityMode;
  adaptiveQualityReport: AdaptiveQualityReport | null;
  rendererBackend: RendererBackend;
  earthSurfaceAvailable: boolean;
  onSelectDomain: (domainId: ScaleDomainId) => void;
  onQualitySelectionChange: (selection: AstroQualitySelection) => void;
}

const QUALITY_ORDER: AstroQualityTier[] = ["ultra", "high", "balanced", "low"];

const CosmicJourneyBar: FC<CosmicJourneyBarProps> = ({
  activeDomain,
  qualityTier,
  qualityMode,
  adaptiveQualityReport,
  rendererBackend,
  earthSurfaceAvailable,
  onSelectDomain,
  onQualitySelectionChange,
}) => {
  const qualityLabel = ASTRO_QUALITY_PROFILES[qualityTier].label;
  const activeFramePath = referenceFrameManager
    .getBreadcrumb(SCALE_DOMAINS[activeDomain].frame)
    .slice(-3);
  const qualityStatus =
    qualityMode === "manual"
      ? `Manual override · ${qualityLabel}`
      : adaptiveQualityReport?.toTier === qualityTier
        ? `Auto reduced ${ASTRO_QUALITY_PROFILES[adaptiveQualityReport.fromTier].label} → ${qualityLabel} · ${Math.round(adaptiveQualityReport.averageFps)} FPS`
        : `Auto · ${qualityLabel} · monitoring`;

  return (
    <section className="cosmic-journey" aria-label="Astronomical scale journey">
    <div className="cosmic-journey__context">
      <span className="cosmic-journey__signal" aria-hidden="true" />
      <div>
        <span>Scale domain</span>
        <strong>{SCALE_DOMAINS[activeDomain].label}</strong>
        <ol className="cosmic-journey__frame-path" aria-label="Current reference-frame hierarchy">
          {activeFramePath.map((frame) => (
            <li key={frame.id} title={`${frame.origin} · ${frame.axes}`}>
              {frame.label}
            </li>
          ))}
        </ol>
      </div>
    </div>
    <ol className="cosmic-journey__domains">
      {SCALE_DOMAIN_ORDER.map((domainId, index) => {
        const domain = SCALE_DOMAINS[domainId];
        const unavailable =
          domain.availability === "foundation" || (domainId === "surface" && !earthSurfaceAvailable);
        return (
          <li key={domain.id}>
            <button
              type="button"
              className={domain.id === activeDomain ? "is-active" : undefined}
              aria-current={domain.id === activeDomain ? "step" : undefined}
              disabled={unavailable}
              onClick={() => onSelectDomain(domain.id)}
              title={
                domain.availability === "foundation"
                  ? `${domain.label}: engine foundation only; no production representation is loaded yet.`
                  : domainId === "surface" && !earthSurfaceAvailable
                    ? "Configure VITE_EARTH_VIEWER_URL to enable the Earth surface bridge."
                    : domain.scientificInterpretation
              }
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{domain.shortLabel}</strong>
              <em>{domain.availability === "foundation" ? "Foundation" : domain.availability}</em>
            </button>
          </li>
        );
      })}
    </ol>
    <div className="cosmic-journey__quality">
      <label htmlFor="astro-quality-tier">Quality</label>
      <select
        id="astro-quality-tier"
        value={qualityMode === "auto" ? "auto" : qualityTier}
        onChange={(event) => onQualitySelectionChange(event.target.value as AstroQualitySelection)}
      >
        <option value="auto">Auto · {qualityLabel}</option>
        {QUALITY_ORDER.map((tier) => (
          <option key={tier} value={tier}>
            {ASTRO_QUALITY_PROFILES[tier].label}
          </option>
        ))}
      </select>
      <span className="cosmic-journey__quality-status" role="status" aria-live="polite">
        {qualityStatus}
      </span>
      <span
        className="cosmic-journey__backend"
        title={`${
          rendererBackend.capabilities.webgpuAvailable
            ? "WebGPU detected; current surface uses the WebGL 2 fallback."
            : "WebGPU not detected; WebGL 2 remains supported."
        } ${
          rendererBackend.capabilities.depthBufferStrategy === "reverse-z"
            ? "Reverse-Z depth is available for wide astronomical camera ranges."
            : "This device uses the standard depth-buffer fallback."
        }`}
      >
        {rendererBackend.id === "webgl2" ? "WEBGL 2" : "NO GPU"}
      </span>
    </div>
    </section>
  );
};

export default CosmicJourneyBar;
