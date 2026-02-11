import { useMemo, useState, type FC } from "react";
import type { SpaceImage } from "../../models/SpaceImage";
import { generateSummary, persistAiMode, readStoredAiMode, type AiMode } from "../../ai/generateSummary";
import { generateAnalysis } from "../../ai/generateAnalysis";
import { generateTags } from "../../ai/generateTags";
import { buildKnowledgeNode } from "../../ai/knowledgeGraph";
import { classifyObjectType } from "../../ai/classifyObjectType";
import { estimateRarity } from "../../ai/estimateRarity";
import { generateWhyMatters } from "../../ai/generateWhyMatters";
import { generateCosmicContext } from "../../ai/generateCosmicContext";
import { generateFacts } from "../../ai/generateFacts";
import { generateStory } from "../../ai/generateStory";
import { generateNarrationScript } from "../../ai/generateNarration";

interface InfoPanelProps {
  selected: SpaceImage;
  metadata: unknown;
  analysis: unknown;
  analysisLoading: boolean;
  onTagSelect?: (tag: string) => void;
}

type TabKey = "details" | "summary" | "raw";

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

const InfoPanel: FC<InfoPanelProps> = ({ selected, metadata, analysis, analysisLoading, onTagSelect }) => {
  const [activeTab, setActiveTab] = useState<TabKey>("summary");
  const [aiMode, setAiMode] = useState<AiMode>(() => readStoredAiMode());
  const [showStory, setShowStory] = useState(false);
  const [showNarration, setShowNarration] = useState(false);
  const instrumentLabel = selected.instrument || selected.mission || selected.center || "NASA Image Library";
  const dateLabel = selected.date || "Unknown";
  const summary = useMemo(() => generateSummary(selected, aiMode), [selected, aiMode]);
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
        : "NASA Image Library";

  return (
    <aside className="info-panel">
      <p className="eyebrow">DETAILS</p>
      <h3>{selected.title}</h3>
      <div className="info-panel__badges">
        <span className="info-panel__badge">{objectType}</span>
        <span className={`info-panel__badge info-panel__badge--${rarity.level.toLowerCase()}`}>
          Rarity: {rarity.level}
        </span>
        {knowledgeNode.era && <span className="info-panel__badge">{knowledgeNode.era}</span>}
      </div>
      <div className="info-panel__sources">
        <span className={`source-badge source-badge--${sourceKey}`}>{sourceLabel}</span>
        {selected.mission && <span className="source-badge">{selected.mission}</span>}
        {selected.instrument && <span className="source-badge">{selected.instrument}</span>}
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
            <div className="info-panel__mode-toggle" role="group" aria-label="AI summary mode">
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

      {activeTab === "raw" && (
        <div className="info-panel__analysis" role="tabpanel">
          <p className="eyebrow">RAW METADATA</p>
          {rawMetadata ? <pre>{rawMetadata}</pre> : <p className="status">No metadata available.</p>}
        </div>
      )}

      <div className="info-panel__analysis">
        <p className="eyebrow">OBJECT HIGHLIGHTS</p>
        {analysisLoading && <p className="status">Running analysis...</p>}
        {!analysisLoading && analysis && typeof analysis === "object" ? (
          <pre>{JSON.stringify(analysis, null, 2)}</pre>
        ) : (
          !analysisLoading && <p className="status">No analysis yet.</p>
        )}
      </div>
    </aside>
  );
};

export default InfoPanel;
