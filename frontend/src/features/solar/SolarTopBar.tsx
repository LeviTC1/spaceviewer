import { FC, useEffect, useRef, useState } from "react";
import type { CameraBookmark } from "./useCameraBookmarks";
import { SOLAR_SCALE_MODES, type SolarScaleMode } from "./solarData";
import type { MoonVisibilityMode } from "./moonData";
import type { AsteroidBeltMode } from "./asteroids/asteroidGenerator";
import SelectMenu, { type SelectMenuOption } from "../../components/ui/SelectMenu";
import SolarSearch, { type SolarSearchResult } from "./SolarSearch";
import { SOLAR_NAVIGATION_LABELS, type SolarNavigationMode } from "./solarNavigation";
import { getSolarScaleModeDefinition } from "./solarScale";

interface SolarTopBarProps {
  currentDate: Date;
  minDate: Date;
  maxDate: Date;
  onDateChange: (date: Date) => void;
  onSetToday: () => void;
  onResetDate: () => void;
  onBirthdaySelect: (date: Date) => void;
  birthdayActive: boolean;
  scaleMode: SolarScaleMode;
  onScaleModeChange: (mode: SolarScaleMode) => void;
  moonMode: MoonVisibilityMode;
  onMoonModeChange: (mode: MoonVisibilityMode) => void;
  asteroidMode: AsteroidBeltMode;
  onAsteroidModeChange: (mode: AsteroidBeltMode) => void;
  performanceMode: boolean;
  onTogglePerformance: () => void;
  bookmarks: CameraBookmark[];
  onSaveBookmark: () => void;
  onSelectBookmark: (bookmark: CameraBookmark) => void;
  navigationMode: SolarNavigationMode;
  onNavigationModeChange: (mode: SolarNavigationMode) => void;
  onSearchSelect: (result: SolarSearchResult) => void;
  presentationMode: boolean;
  onStartTour: () => void;
  onTogglePresentation: () => void;
}

const navigationModeOptions: Array<SelectMenuOption<SolarNavigationMode>> = (
  Object.entries(SOLAR_NAVIGATION_LABELS) as Array<[SolarNavigationMode, string]>
).map(([value, label]) => ({ value, label }));

const scaleModeOptions: Array<SelectMenuOption<SolarScaleMode>> = SOLAR_SCALE_MODES.map((value) => ({
  value,
  label: getSolarScaleModeDefinition(value).shortLabel,
}));

const asteroidModeOptions: Array<SelectMenuOption<AsteroidBeltMode>> = [
  { value: "off", label: "Off" },
  { value: "simplified", label: "Simple" },
  { value: "full", label: "Full" },
];

const moonModeOptions: Array<SelectMenuOption<MoonVisibilityMode>> = [
  { value: "off", label: "Off" },
  { value: "major", label: "Major" },
  { value: "all", label: "All" },
];

const SolarTopBar: FC<SolarTopBarProps> = ({
  currentDate,
  minDate,
  maxDate,
  onDateChange,
  onSetToday,
  onResetDate,
  onBirthdaySelect,
  birthdayActive,
  scaleMode,
  onScaleModeChange,
  moonMode,
  onMoonModeChange,
  asteroidMode,
  onAsteroidModeChange,
  performanceMode,
  onTogglePerformance,
  bookmarks,
  onSaveBookmark,
  onSelectBookmark,
  navigationMode,
  onNavigationModeChange,
  onSearchSelect,
  presentationMode,
  onStartTour,
  onTogglePresentation,
}) => {
  const [toolsOpen, setToolsOpen] = useState(false);
  const [birthdayPending, setBirthdayPending] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const dateInputRef = useRef<HTMLInputElement | null>(null);

  const formatInputDate = (date: Date) => date.toISOString().slice(0, 10);
  const formatDisplayDate = (date: Date) =>
    new Intl.DateTimeFormat(undefined, {
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(date);

  const handleDateChange = (value: string) => {
    if (!value) return;
    const [year, month, day] = value.split("-").map(Number);
    const next = new Date(Date.UTC(year, month - 1, day));
    onDateChange(next);
    if (birthdayPending && typeof window !== "undefined") {
      window.localStorage.setItem("spaceviewer.solar.birthday", value);
      onBirthdaySelect(next);
      setBirthdayPending(false);
    }
  };

  const handleBirthday = () => {
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem("spaceviewer.solar.birthday");
      if (stored) {
        const [year, month, day] = stored.split("-").map(Number);
        const next = new Date(Date.UTC(year, month - 1, day));
        onDateChange(next);
        onBirthdaySelect(next);
        return;
      }
    }
    setBirthdayPending(true);
    const input = dateInputRef.current;
    if (input?.showPicker) {
      input.showPicker();
    } else {
      input?.focus();
    }
  };

  const handleToday = () => {
    setBirthdayPending(false);
    onSetToday();
  };

  const handleReset = () => {
    setBirthdayPending(false);
    onResetDate();
  };

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target as Node)) {
        setToolsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (!toolsOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      // Let text fields (e.g. the Jump search) keep their own Escape behavior.
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, textarea, select")) return;
      // Yield to an open dropdown inside the menu — it claims this Escape.
      if (wrapperRef.current?.querySelector(".select-menu.is-open")) return;
      // Claim this Escape so the page-level clean-map shortcut doesn't fire.
      event.preventDefault();
      setToolsOpen(false);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [toolsOpen]);

  return (
    <div className="solar-topbar">
      <div className="solar-topbar__summary">
        <div className="solar-date">
          <span className="solar-date__label">{birthdayActive ? "Birthday alignment" : "Alignment"}</span>
          <span className="solar-date__value">{formatDisplayDate(currentDate)}</span>
          {birthdayActive && <span className="solar-date__badge">Birthday</span>}
        </div>
      </div>
      <div className="solar-tools" ref={wrapperRef}>
        <button
          type="button"
          className={`ghost button--small ${toolsOpen ? "active" : ""}`}
          onClick={() => setToolsOpen((prev) => !prev)}
          aria-expanded={toolsOpen}
        >
          Controls
        </button>
        {toolsOpen && (
          <div className="solar-tools__menu">
            <div className="solar-tools__header">
              <span className="eyebrow">Solar controls</span>
              <button
                type="button"
                className="ghost button--small solar-tools__close"
                onClick={() => setToolsOpen(false)}
                aria-label="Close menu"
              >
                Close
              </button>
            </div>
            <div className="solar-tools__section solar-tools__section--search">
              <span className="eyebrow">Jump</span>
              <SolarSearch bookmarks={bookmarks} onSelectResult={onSearchSelect} />
            </div>
            <div className="solar-tools__section">
              <span className="eyebrow">Date</span>
              <div className="solar-date-picker">
                <input
                  ref={dateInputRef}
                  id="solar-date"
                  type="date"
                  value={formatInputDate(currentDate)}
                  min={formatInputDate(minDate)}
                  max={formatInputDate(maxDate)}
                  onChange={(event) => handleDateChange(event.target.value)}
                />
                <div className="solar-date-picker__actions">
                  <button type="button" className="ghost button--small" onClick={handleToday}>
                    Today
                  </button>
                  <button
                    type="button"
                    className="ghost button--small"
                    onClick={() => {
                      const next = new Date(
                        Date.UTC(
                          currentDate.getUTCFullYear() + 10,
                          currentDate.getUTCMonth(),
                          currentDate.getUTCDate(),
                        ),
                      );
                      onDateChange(next);
                    }}
                  >
                    +10Y
                  </button>
                  <button
                    type="button"
                    className="ghost button--small"
                    onClick={() => {
                      const next = new Date(
                        Date.UTC(
                          currentDate.getUTCFullYear() + 25,
                          currentDate.getUTCMonth(),
                          currentDate.getUTCDate(),
                        ),
                      );
                      onDateChange(next);
                    }}
                  >
                    +25Y
                  </button>
                  <button type="button" className="ghost button--small" onClick={handleBirthday}>
                    Birthday
                  </button>
                  <button type="button" className="ghost button--small" onClick={handleReset}>
                    Reset
                  </button>
                </div>
              </div>
            </div>
            <div className="solar-tools__grid">
              <SelectMenu
                label="View"
                value={navigationMode}
                options={navigationModeOptions}
                onChange={onNavigationModeChange}
                className="solar-select"
                labelClassName="solar-select__label"
                triggerClassName="solar-select__trigger"
                caretClassName="solar-select__caret"
                menuClassName="solar-select__menu"
                itemClassName="solar-select__item"
              />
              <SelectMenu
                label="Spacing"
                value={scaleMode}
                options={scaleModeOptions}
                onChange={onScaleModeChange}
                className="solar-select"
                labelClassName="solar-select__label"
                triggerClassName="solar-select__trigger"
                caretClassName="solar-select__caret"
                menuClassName="solar-select__menu"
                itemClassName="solar-select__item"
              />
              <SelectMenu
                label="Belt"
                value={asteroidMode}
                options={asteroidModeOptions}
                onChange={onAsteroidModeChange}
                className="solar-select"
                labelClassName="solar-select__label"
                triggerClassName="solar-select__trigger"
                caretClassName="solar-select__caret"
                menuClassName="solar-select__menu"
                itemClassName="solar-select__item"
              />
              <SelectMenu
                label="Moons"
                value={moonMode}
                options={moonModeOptions}
                onChange={onMoonModeChange}
                className="solar-select"
                labelClassName="solar-select__label"
                triggerClassName="solar-select__trigger"
                caretClassName="solar-select__caret"
                menuClassName="solar-select__menu"
                itemClassName="solar-select__item"
              />
            </div>
            <div className="solar-tools__section solar-tools__actions">
              <button type="button" className="ghost button--small" onClick={onStartTour}>
                Start Tour
              </button>
              <button type="button" className="ghost button--small" onClick={onTogglePresentation}>
                {presentationMode ? "Exit Present" : "Present"}
              </button>
              <button
                type="button"
                className={`ghost button--small ${performanceMode ? "active" : ""}`}
                onClick={onTogglePerformance}
              >
                {performanceMode ? "Performance" : "Detail"}
              </button>
              <button type="button" className="ghost button--small" onClick={onSaveBookmark}>
                Save View
              </button>
            </div>
            <div className="solar-tools__section">
              <span className="eyebrow">Bookmarks</span>
              {bookmarks.length ? (
                bookmarks.map((bookmark) => (
                  <button
                    key={bookmark.id}
                    type="button"
                    className="solar-tools__item"
                    onClick={() => {
                      onSelectBookmark(bookmark);
                      setToolsOpen(false);
                    }}
                  >
                    {bookmark.name}
                  </button>
                ))
              ) : (
                <span className="solar-tools__empty">No bookmarks yet.</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SolarTopBar;
