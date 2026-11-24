import { FC } from "react";
import type { SolarScaleMode } from "./solarData";
import { getSolarScaleModeDefinition, scaleDistanceAu } from "./solarScale";
import { SOLAR_NAVIGATION_LABELS, type SolarNavigationMode } from "./solarNavigation";

interface SolarScaleLegendProps {
  scaleMode: SolarScaleMode;
  navigationMode: SolarNavigationMode;
  selectedLabel?: string;
}

const SolarScaleLegend: FC<SolarScaleLegendProps> = ({ scaleMode, navigationMode, selectedLabel }) => {
  const oneAu = scaleDistanceAu(1, scaleMode);
  const tenAu = scaleDistanceAu(10, scaleMode);
  const definition = getSolarScaleModeDefinition(scaleMode);

  return (
    <aside className={`solar-scale-legend solar-scale-legend--${scaleMode}`} aria-label="Solar scale model">
      <div>
        <p className="eyebrow">Scale model</p>
        <strong>{definition.label}</strong>
      </div>
      <div className="solar-scale-legend__context" aria-label="Solar view context">
        <span>{selectedLabel ?? "System overview"}</span>
        <span>{SOLAR_NAVIGATION_LABELS[navigationMode]}</span>
      </div>
      <p>{definition.summary}</p>
      <div className="solar-scale-legend__bar">
        <span style={{ width: `${Math.min(100, (oneAu / tenAu) * 100)}%` }} />
      </div>
      <dl>
        <div>
          <dt>1 AU</dt>
          <dd>{oneAu.toFixed(1)} visual units</dd>
        </div>
        <div>
          <dt>10 AU</dt>
          <dd>{tenAu.toFixed(1)} visual units</dd>
        </div>
      </dl>
      <small>{definition.disclosure} Planetary motion uses the shared VSOP87 solar provider.</small>
    </aside>
  );
};

export default SolarScaleLegend;
