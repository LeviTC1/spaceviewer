// One place for every preference SpaceViewer keeps, plus the specialist tools (on phones) and the
// data credits. Previously these lived in a home-page tab, the SkyMap header and the explorer popover.

import { useEffect, useRef, useState, type FC } from "react";
import type { AstroQualitySelection, AstroQualitySetting } from "../lib/rendering/qualityManager";
import { persistAiMode, readStoredAiMode, type AiMode } from "../insights/generateSummary";
import { Icon } from "./Icon";
import { readReduceMotion, writeReduceMotion } from "./preferences";
import type { SvDestination } from "./SvBar";

const EXPLORE_QUALITY_KEY = "spaceviewer.explore.quality.v1";

interface SettingsSheetProps {
  open: boolean;
  onClose: () => void;
  quality: AstroQualitySetting;
  onQualityChange: (selection: AstroQualitySelection) => void;
  onNavigate: (destination: SvDestination) => void;
  onClearHistory: () => void;
}

const QUALITY_OPTIONS: Array<{ value: AstroQualitySelection; label: string; detail: string }> = [
  { value: "auto", label: "Automatic", detail: "Steps down if frames drop" },
  { value: "low", label: "Light", detail: "Batteries and older phones" },
  { value: "balanced", label: "Balanced", detail: "" },
  { value: "high", label: "High", detail: "Retina laptops" },
  { value: "ultra", label: "Ultra", detail: "Full resolution" },
];

const CREDITS = [
  ["Photographs", "NASA Image and Video Library · SDSS DR18 (Sloan Digital Sky Survey) · Pan-STARRS1 (STScI MAST)"],
  ["Sky photographs", "Digitized Sky Survey (STScI/NASA; produced under U.S. Government grant NAG W-2166) · colour HiPS by CDS Strasbourg · served by ESA ESASky"],
  ["Stars", "ESA Gaia DR3 (positions, parallaxes, photometry; ESA Gaia Archive) · ESA/Gaia/DPAC EDR3 all-sky map · bright stars from XHIP (Anderson & Francis 2012) and Hipparcos (ESA; van Leeuwen 2007) via CDS VizieR · named nearby stars from SIMBAD (CDS)"],
  ["Constellations", "IAU figures from d3-celestial by Olaf Frohn (BSD-3-Clause) · star names: IAU Working Group on Star Names · boundaries: IAU"],
  ["Tonight's sky", "Your place stays on this device: a city from the tz database (public domain) or your browser's location · sidereal time and precession per IAU 1982/1976 · planet magnitudes after Mallama & Hilton 2018"],
  ["Exoplanets", "NASA Exoplanet Archive, Planetary Systems Composite Parameters (NExScI/Caltech-IPAC) · habitable zones after Kasting et al. 1993"],
  ["Deep sky", "OpenNGC (CC-BY-SA 4.0) · McConnachie / LVDB Local Group · DESI DR1 light cone"],
  ["Solar System", "VSOP87A (Bretagnon & Francou) · Astronomy Engine 2.1.19 · JPL Horizons (Pluto) · IAU WGCCRE orientations"],
  ["Spacecraft", "Trajectories: NASA/JPL Horizons · Earth orbiters: CelesTrak elements (US Space Force 18 SDS), SGP4 via satellite.js (MIT)"],
  ["Asteroids & comets", "JPL Small-Body Database orbits · planet magnitudes after Mallama & Hilton 2018 · comet tails are a geometric model"],
  ["Moon maps", "NASA SVS CGI Moon Kit (LRO LROC/LOLA) · USGS Astrogeology global mosaics from Galileo, Voyager and Cassini"],
  ["Milky Way", "Reid et al. 2019, ApJ 885, 131 (spiral arms)"],
  ["Live", "NASA, Sen and NASASpaceflight on YouTube · NASA SDO · ESA/NASA SOHO · NASA EPIC / NOAA DSCOVR · NOAA GOES and SWPC"],
  ["Homepage", "“Cosmic Cliffs”: NASA, ESA, CSA, STScI (CC BY 4.0)"],
];

export const SettingsSheet: FC<SettingsSheetProps> = ({ open, onClose, quality, onQualityChange, onNavigate, onClearHistory }) => {
  const [reduceMotion, setReduceMotion] = useState(readReduceMotion);
  const [aiMode, setAiMode] = useState<AiMode>(() => readStoredAiMode());
  const [cleared, setCleared] = useState(false);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setReduceMotion(readReduceMotion());
    setAiMode(readStoredAiMode());
    setCleared(false);
    const previous = document.activeElement as HTMLElement | null;
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus());
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", key);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", key);
      previous?.focus?.();
    };
  }, [onClose, open]);

  if (!open) return null;
  const selection: AstroQualitySelection = quality.mode === "auto" ? "auto" : quality.tier;

  return (
    <div className="sv-sheet" role="dialog" aria-modal="true" aria-labelledby="sv-settings-title">
      <button type="button" className="sv-sheet__backdrop" onClick={onClose} aria-label="Close settings" tabIndex={-1} />
      <div className="sv-sheet__panel">
        <header className="sv-sheet__head">
          <h2 id="sv-settings-title">Settings</h2>
          <button ref={closeRef} type="button" className="sv-icon-btn" onClick={onClose} aria-label="Close settings">
            <Icon name="close" size={18} />
          </button>
        </header>

        <section className="sv-sheet__section sv-sheet__tools" aria-label="Specialist tools">
          <h3>Specialist tools</h3>
          <button type="button" className="sv-row-link" onClick={() => { onClose(); onNavigate("solar"); }}>
            <span>
              <strong>Solar Explorer</strong>
              <small>Eclipses, true-AU ruler, mission tools, birthdays</small>
            </span>
            <Icon name="next" size={16} />
          </button>
          <button type="button" className="sv-row-link" onClick={() => { onClose(); onNavigate("atlas"); }}>
            <span>
              <strong>Sky Atlas</strong>
              <small>Catalogue layers, constellations, DESI light cone, annotations</small>
            </span>
            <Icon name="next" size={16} />
          </button>
        </section>

        <section className="sv-sheet__section">
          <h3>Motion</h3>
          <label className="sv-switch">
            <span>
              <strong>Reduce motion</strong>
              <small>Flights become cuts; the universe stops drifting on its own.</small>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={reduceMotion}
              onChange={(event) => {
                setReduceMotion(event.target.checked);
                writeReduceMotion(event.target.checked);
              }}
            />
            <i aria-hidden="true" />
          </label>
        </section>

        <section className="sv-sheet__section">
          <h3>3D quality</h3>
          <div className="sv-segmented" role="radiogroup" aria-label="3D quality">
            {QUALITY_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selection === option.value}
                className={selection === option.value ? "is-on" : ""}
                onClick={() => {
                  onQualityChange(option.value);
                  // The universe explorer keeps its own tier; keep it in step with the global choice.
                  try {
                    if (option.value === "auto") window.localStorage.removeItem(EXPLORE_QUALITY_KEY);
                    else window.localStorage.setItem(EXPLORE_QUALITY_KEY, option.value);
                  } catch {
                    // best effort
                  }
                  window.dispatchEvent(new CustomEvent("spaceviewer:quality-updated", { detail: option.value }));
                }}
                title={option.detail}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="sv-sheet__note">Currently rendering at {quality.tier}. Applies to the universe, Solar Explorer and Sky Atlas.</p>
        </section>

        <section className="sv-sheet__section">
          <h3>Photograph explanations</h3>
          <div className="sv-segmented" role="radiogroup" aria-label="Explanation style">
            {(["beginner", "scientific"] as AiMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={aiMode === mode}
                className={aiMode === mode ? "is-on" : ""}
                onClick={() => {
                  setAiMode(mode);
                  persistAiMode(mode);
                }}
              >
                {mode === "beginner" ? "Plain language" : "Scientific"}
              </button>
            ))}
          </div>
          <p className="sv-sheet__note">Summaries are written on this device from archive metadata. No AI model is called.</p>
        </section>

        <section className="sv-sheet__section">
          <h3>Your data</h3>
          <p className="sv-sheet__note">Everything SpaceViewer remembers stays in this browser: saved views, saved photographs, notes, bookmarks and history.</p>
          <button
            type="button"
            className="sv-btn sv-btn--quiet"
            onClick={() => {
              onClearHistory();
              setCleared(true);
            }}
          >
            <Icon name="trash" size={16} />
            {cleared ? "History cleared" : "Clear search & viewing history"}
          </button>
        </section>

        <section className="sv-sheet__section sv-credits" aria-label="Data credits">
          <h3>Data & credits</h3>
          <dl>
            {CREDITS.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
};
