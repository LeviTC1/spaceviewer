import { useMemo, useState, type FC } from "react";
import type { SpaceImage } from "../../models/SpaceImage";
import { generateSummary, persistAiMode, readStoredAiMode, type AiMode } from "../../insights/generateSummary";
import { generateAnalysis } from "../../insights/generateAnalysis";
import { generateTags } from "../../insights/generateTags";
import { buildKnowledgeNode } from "../../insights/knowledgeGraph";
import { classifyObjectType } from "../../insights/classifyObjectType";
import { estimateRarity } from "../../insights/estimateRarity";
import { generateWhyMatters } from "../../insights/generateWhyMatters";
import { generateCosmicContext } from "../../insights/generateCosmicContext";
import { generateFacts } from "../../insights/generateFacts";
import { generateStory } from "../../insights/generateStory";
import { generateNarrationScript } from "../../insights/generateNarration";
import { buildExplanationProvenance } from "../../insights/explanationProvenance";
import StatusChip, { type StatusChipTone } from "../ui/StatusChip";

interface InfoPanelProps {
  selected: SpaceImage;
  metadata: unknown;
  onTagSelect?: (tag: string) => void;
}

type TabKey = "details" | "summary" | "provenance" | "raw";

const getRarityTone = (level: string): StatusChipTone => {
  switch (level.toLowerCase()) {
    case "rare":
    case "exceptional":
      return "warning";
    case "unusual":
      return "info";
    default:
      return "neutral";
  }
};

const getSourceTone = (source: string): StatusChipTone => {
  switch (source) {
    case "sdss":
      return "info";
    case "ps1":
      return "warning";
    case "nasa":
      return "success";
    default:
      return "accent";
  }
};

const renderMetadata = (data: unknown) => {
  if (!data || typeof data !== "object") {
    return <p className="status">No metadata available.</p>;
  }

  return (
    <dl>
      {Object.entries(data as Record<string, unknown>).map(([key, value]) => (
        <div key={key}>
          <dt>{key}</dt>
          <dd>{String(value)}</dd>
        </div>
      ))}
    </dl>
  );
};

const InfoPanel: FC<InfoPanelProps> = ({ selected, metadata, onTagSelect }) => {
  const [activeTab, setActiveTab] = useState<TabKey>("summary");
  const [aiMode, setAiMode] = useState<AiMode>(() => readStoredAiMode());
  const [showStory, setShowStory] = useState(false);
  const [showNarration, setShowNarration] = useState(false);
  const [citationStatus, setCitationStatus] = useState<"idle" | "copied" | "failed">("idle");
  const instrumentLabel = selected.instrument || selected.mission || selected.center || "NASA Image Library";
  const dateLabel = selected.date || "Unknown";
  const summary = useMemo(() => generateSummary(selected, aiMode), [selected, aiMode]);
  const explanationProvenance = useMemo(() => buildExplanationProvenance(selected, aiMode), [selected, aiMode]);
  const aiAnalysis = useMemo(() => generateAnalysis(selected, aiMode), [selected, aiMode]);
  const aiTags = useMemo(() => generateTags(selected), [selected]);
  const knowledgeNode = useMemo(() => buildKnowledgeNode(selected), [selected]);
  const objectType = useMemo(() => classifyObjectType(selected), [selected]);
  const rarity = useMemo(() => estimateRarity(selected, objectType), [selected, objectType]);
  const whyMatters = useMemo(() => generateWhyMatters(selected, objectType), [selected, objectType]);
  const cosmicContext = useMemo(() => generateCosmicContext(selected, objectType), [selected, objectType]);
  const didYouKnow = useMemo(() => generateFacts(selected, objectType), [selected, objectType]);
  const story = useMemo(() => generateStory(selected, objectType), [selected, objectType]);
  const narration = useMemo(() => generateNarrationScript(selected, objectType), [selected, objectType]);
  const rawMetadata = useMemo(() => {
    if (!metadata || typeof metadata !== "object") {
      return null;
    }
    return JSON.stringify(metadata, null, 2);
  }, [metadata]);
  const sourceKey = selected.source ?? "nasa";
  const sourceLabel =
    sourceKey === "sdss"
      ? "SDSS"
      : sourceKey === "ps1"
        ? "Pan-STARRS"
        : sourceKey === "nasa"
          ? "NASA"
          : sourceKey.toUpperCase();
  const sourceFull =
    sourceKey === "sdss"
      ? "Sloan Digital Sky Survey"
      : sourceKey === "ps1"
        ? "Pan-STARRS"
        : sourceKey === "nasa"
          ? "NASA Image Library"
          : sourceLabel;
  const archiveId = selected.archiveId ?? selected.nasaId ?? selected.id;
  const sourceUrl =
    selected.sourceUrl ??
    selected.archiveUrl ??
    (sourceKey === "nasa" && archiveId ? `https://images.nasa.gov/details/${encodeURIComponent(archiveId)}` : "");
  const assetStatus = selected.fullRes
    ? "Full resolution asset available"
    : selected.imageUrl || selected.thumbnailUrl
      ? "Preview asset available"
      : "No direct image asset";
  const metadataQuality = selected.metadataQuality;
  const dimensionsLabel =
    selected.dimensions?.width && selected.dimensions?.height
      ? `${selected.dimensions.width} x ${selected.dimensions.height}${selected.dimensions.scaleArcsecPerPixel ? ` · ${selected.dimensions.scaleArcsecPerPixel} arcsec/pixel` : ""}`
      : "Unknown";
  const citation = [
    selected.title,
    sourceFull,
    dateLabel !== "Unknown" ? dateLabel : "",
    archiveId ? `Archive id: ${archiveId}` : "",
    sourceUrl,
  ]
    .filter(Boolean)
    .join(". ");

  const handleCopyCitation = () => {
    if (!navigator.clipboard?.writeText) {
      setCitationStatus("failed");
      window.setTimeout(() => setCitationStatus("idle"), 1800);
      return;
    }

    navigator.clipboard
      .writeText(citation)
      .then(() => setCitationStatus("copied"))
      .catch(() => setCitationStatus("failed"))
      .finally(() => window.setTimeout(() => setCitationStatus("idle"), 1800));
  };

  return (
    <aside className="info-panel">
      <p className="eyebrow">DETAILS</p>
      <h3>{selected.title}</h3>
      <div className="info-panel__badges">
        <StatusChip className="info-panel__badge" tone="accent">
          {objectType}
        </StatusChip>
        <StatusChip
          className={`info-panel__badge info-panel__badge--${rarity.level.toLowerCase()}`}
          tone={getRarityTone(rarity.level)}
        >
          Rarity: {rarity.level}
        </StatusChip>
        {knowledgeNode.era && (
          <StatusChip className="info-panel__badge" tone="neutral">
            {knowledgeNode.era}
          </StatusChip>
        )}
      </div>
      <div className="info-panel__sources">
        <StatusChip className={`source-badge source-badge--${sourceKey}`} tone={getSourceTone(sourceKey)} dot>
          {sourceLabel}
        </StatusChip>
        {selected.mission && (
          <StatusChip className="source-badge" tone="accent" dot>
            {selected.mission}
          </StatusChip>
        )}
        {selected.instrument && (
          <StatusChip className="source-badge" tone="accent" dot>
            {selected.instrument}
          </StatusChip>
        )}
      </div>
      <dl>
        <div>
          <dt>Instrument</dt>
          <dd>{instrumentLabel}</dd>
        </div>
        <div>
          <dt>Date</dt>
          <dd>{dateLabel}</dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>{sourceFull}</dd>
        </div>
      </dl>

      <div className="info-panel__tabs" role="tablist" aria-label="Metadata tabs">
        <button
          type="button"
          className={`tab-button ${activeTab === "summary" ? "active" : ""}`}
          onClick={() => setActiveTab("summary")}
          role="tab"
          aria-selected={activeTab === "summary"}
        >
          Summary
        </button>
        <button
          type="button"
          className={`tab-button ${activeTab === "details" ? "active" : ""}`}
          onClick={() => setActiveTab("details")}
          role="tab"
          aria-selected={activeTab === "details"}
        >
          Metadata
        </button>
        <button
          type="button"
          className={`tab-button ${activeTab === "provenance" ? "active" : ""}`}
          onClick={() => setActiveTab("provenance")}
          role="tab"
          aria-selected={activeTab === "provenance"}
        >
          Provenance
        </button>
        <button
          type="button"
          className={`tab-button ${activeTab === "raw" ? "active" : ""}`}
          onClick={() => setActiveTab("raw")}
          role="tab"
          aria-selected={activeTab === "raw"}
        >
          Raw
        </button>
      </div>

      {activeTab === "summary" && (
        <div className="info-panel__analysis" role="tabpanel">
          <div className="info-panel__summary-header">
            <p className="eyebrow">SUMMARY</p>
            <StatusChip className="info-panel__badge" tone="neutral">
              Auto-generated from metadata
            </StatusChip>
            <div className="info-panel__mode-toggle" role="group" aria-label="Summary mode">
              <button
                type="button"
                className={`mode-button ${aiMode === "scientific" ? "active" : ""}`}
                onClick={() => {
                  setAiMode("scientific");
                  persistAiMode("scientific");
                }}
              >
                Scientific
              </button>
              <button
                type="button"
                className={`mode-button ${aiMode === "beginner" ? "active" : ""}`}
                onClick={() => {
                  setAiMode("beginner");
                  persistAiMode("beginner");
                }}
              >
                Beginner
              </button>
            </div>
          </div>
          <div className="info-panel__summary-actions">
            <button
              type="button"
              className="ghost button--small"
              onClick={() => setShowStory((prev) => !prev)}
            >
              {showStory ? "Hide Story" : "Tell Me The Story"}
            </button>
            <button
              type="button"
              className="ghost button--small"
              onClick={() => setShowNarration((prev) => !prev)}
            >
              {showNarration ? "Hide Narration" : "Listen"}
            </button>
          </div>
          <div className="info-panel__summary-body">
            <p className="info-panel__summary-text">{summary}</p>
            <section className="info-panel__explanation" aria-label="Explanation source">
              <div className="info-panel__explanation-header">
                <div>
                  <p className="eyebrow">EXPLANATION SOURCE</p>
                  <h4>{explanationProvenance.methodLabel}</h4>
                </div>
                <span className={`info-panel__confidence info-panel__confidence--${explanationProvenance.confidenceLabel.toLowerCase()}`}>
                  {explanationProvenance.confidenceLabel} · {explanationProvenance.confidenceScore}/100
                </span>
              </div>
              <p className="info-panel__explanation-mode">{explanationProvenance.modeLabel}</p>
              <div className="info-panel__explanation-grid">
                <div>
                  <span>Evidence used</span>
                  <p>{explanationProvenance.evidence.join(", ") || "No strong metadata evidence."}</p>
                </div>
                <div>
                  <span>Missing data</span>
                  <p>{explanationProvenance.missing.join(", ") || "No major metadata gaps detected."}</p>
                </div>
              </div>
              <ul className="info-panel__caveats">
                {explanationProvenance.caveats.map((caveat) => (
                  <li key={caveat}>{caveat}</li>
                ))}
              </ul>
            </section>
            {showStory && (
              <div className="info-panel__analysis">
                <p className="eyebrow">STORY MODE</p>
                <p>{story}</p>
              </div>
            )}
            {showNarration && (
              <div className="info-panel__analysis">
                <p className="eyebrow">NARRATION SCRIPT</p>
                <p>{narration}</p>
              </div>
            )}
            {aiAnalysis.items.length > 0 && (
              <div className="info-panel__analysis">
                <p className="eyebrow">ANALYSIS</p>
                <ul>
                  {aiAnalysis.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="info-panel__analysis">
              <p className="eyebrow">WHY THIS MATTERS</p>
              <p>{whyMatters}</p>
            </div>
            {didYouKnow.length > 0 && (
              <div className="info-panel__analysis">
                <p className="eyebrow">DID YOU KNOW?</p>
                <ul>
                  {didYouKnow.map((fact) => (
                    <li key={fact}>{fact}</li>
                  ))}
                </ul>
              </div>
            )}
            <details className="info-panel__context">
              <summary>Cosmic Context</summary>
              <ul>
                {cosmicContext.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </details>
            {aiTags.length > 0 && (
              <div className="info-panel__tags">
                <p className="eyebrow">TAGS</p>
                <div className="tag-list">
                  {aiTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      className="tag-chip"
                      onClick={() => onTagSelect?.(tag)}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "details" && (
        <div className="info-panel__analysis" role="tabpanel">
          <p className="eyebrow">METADATA</p>
          {renderMetadata(metadata)}
        </div>
      )}

      {activeTab === "provenance" && (
        <div className="info-panel__analysis info-panel__provenance" role="tabpanel">
          <p className="eyebrow">PROVENANCE</p>
          <p>This record is assembled from source metadata and SpaceViewer normalization.</p>
          <dl>
            <div>
              <dt>Archive ID</dt>
              <dd>{archiveId || "Unknown"}</dd>
            </div>
            <div>
              <dt>Source Archive</dt>
              <dd>{sourceFull}</dd>
            </div>
            <div>
              <dt>Observation Date</dt>
              <dd>{dateLabel}</dd>
            </div>
            <div>
              <dt>Asset Status</dt>
              <dd>{assetStatus}</dd>
            </div>
            <div>
              <dt>Dimensions</dt>
              <dd>{dimensionsLabel}</dd>
            </div>
            <div>
              <dt>Metadata Quality</dt>
              <dd>
                {metadataQuality ? `${metadataQuality.label} · ${metadataQuality.score}/100` : "Not scored"}
              </dd>
            </div>
            <div>
              <dt>Match Reason</dt>
              <dd>{selected.matchReason || "No match reason was provided by this source."}</dd>
            </div>
            <div>
              <dt>Source URL</dt>
              <dd>
                {sourceUrl ? (
                  <a href={sourceUrl} target="_blank" rel="noreferrer">
                    Open source record
                  </a>
                ) : (
                  "No source URL available"
                )}
              </dd>
            </div>
          </dl>
          {metadataQuality && (
            <div className="info-panel__quality">
              <span aria-hidden="true">
                <i style={{ width: `${metadataQuality.score}%` }} />
              </span>
              <p>
                Strong fields: {metadataQuality.factors.slice(0, 5).join(", ") || "none"}. Missing:{" "}
                {metadataQuality.missing.slice(0, 4).join(", ") || "none"}.
              </p>
            </div>
          )}
          <div className="info-panel__provenance-actions">
            <button type="button" className="ghost button--small" onClick={handleCopyCitation}>
              {citationStatus === "copied"
                ? "Citation Copied"
                : citationStatus === "failed"
                  ? "Copy Failed"
                  : "Copy Citation"}
            </button>
            {selected.fullRes && (
              <a href={selected.fullRes} target="_blank" rel="noreferrer" className="ghost button--small">
                Open Full Asset
              </a>
            )}
          </div>
        </div>
      )}

      {activeTab === "raw" && (
        <div className="info-panel__analysis" role="tabpanel">
          <p className="eyebrow">RAW METADATA</p>
          {rawMetadata ? <pre>{rawMetadata}</pre> : <p className="status">No metadata available.</p>}
        </div>
      )}

    </aside>
  );
};

export default InfoPanel;
