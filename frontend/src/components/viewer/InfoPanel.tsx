import type { FC } from "react";
import type { SpaceResult } from "../../utils/api";

interface InfoPanelProps {
  selected: SpaceResult;
  metadata: unknown;
  analysis: unknown;
  analysisLoading: boolean;
}

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

const InfoPanel: FC<InfoPanelProps> = ({ selected, metadata, analysis, analysisLoading }) => (
  <aside className="info-panel">
    <p className="eyebrow">DETAILS</p>
    <h3>{selected.title}</h3>
    <dl>
      <div>
        <dt>Instrument</dt>
        <dd>{selected.instrument}</dd>
      </div>
      <div>
        <dt>Date</dt>
        <dd>{selected.date}</dd>
      </div>
    </dl>
    <div className="info-panel__analysis">
      <p className="eyebrow">METADATA</p>
      {renderMetadata(metadata)}
    </div>
    <div className="info-panel__analysis">
      <p className="eyebrow">ANALYSIS</p>
      {analysisLoading && <p className="status">Running analysis...</p>}
      {!analysisLoading && analysis && typeof analysis === "object" ? (
        <pre>{JSON.stringify(analysis, null, 2)}</pre>
      ) : (
        !analysisLoading && <p className="status">No analysis yet.</p>
      )}
    </div>
  </aside>
);

export default InfoPanel;
