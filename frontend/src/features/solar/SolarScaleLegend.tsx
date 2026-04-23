import { FC } from "react";
import type { SolarScaleMode } from "./solarData";
import { scaleDistanceAu } from "./solarScale";

interface SolarScaleLegendProps {
  scaleMode: SolarScaleMode;
}

const SolarScaleLegend: FC<SolarScaleLegendProps> = ({ scaleMode }) => {
  const oneAu = scaleDistanceAu(1, scaleMode);
  const tenAu = scaleDistanceAu(10, scaleMode);
  const copy =
    scaleMode === "educational"
      ? "Educational spacing opens the outer system while keeping planets visible."
      : "Showcase spacing compresses distance for a cinematic, readable atlas view.";

  return (
    <aside className="solar-scale-legend" aria-label="Solar scale model">
      <div>
        <p className="eyebrow">Scale model</p>
        <strong>{scaleMode === "educational" ? "Educational spacing" : "Showcase spacing"}</strong>
      </div>
      <p>{copy}</p>
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
      <small>Distances and sizes are intentionally compressed; orbital motion uses the shared low-precision solar provider.</small>
    </aside>
  );
};

export default SolarScaleLegend;
