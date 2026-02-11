import { FC, useEffect, useRef, useState } from "react";
import type { CameraBookmark } from "./useCameraBookmarks";
import type { SolarScaleMode } from "./solarData";
import type { MoonVisibilityMode } from "./moonData";
import type { AsteroidBeltMode } from "./asteroids/asteroidGenerator";

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
}

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

  return (
    <div className="solar-topbar">
      <div className="solar-topbar__left">
        <span className="eyebrow">SOLAR SYSTEM EXPLORER</span>
        <div className="solar-date">
          <span className="solar-date__label">
            {birthdayActive ? "Solar system on your birthday" : "Solar system alignment"}
          </span>
          <span className="solar-date__value">{formatDisplayDate(currentDate)}</span>
          {birthdayActive && <span className="solar-date__badge">Birthday alignment</span>}
        </div>
      </div>
      <div className="solar-topbar__controls">
        <div className="solar-date solar-date--compact">
          <span className="solar-date__label">
            {birthdayActive ? "Birthday alignment" : "Alignment"}
          </span>
          <span className="solar-date__value">{formatDisplayDate(currentDate)}</span>
          {birthdayActive && <span className="solar-date__badge">🎂</span>}
        </div>
        <div className="solar-date-picker">
          <label htmlFor="solar-date">Date</label>
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
              +10 Years
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
              +25 Years
            </button>
            <button type="button" className="ghost button--small" onClick={handleBirthday}>
              My Birthday
            </button>
            <button type="button" className="ghost button--small" onClick={handleReset}>
              Reset 2025
            </button>
          </div>
        </div>
        <div className="solar-select">
          <label htmlFor="solar-scale">Scale</label>
          <select
            id="solar-scale"
            value={scaleMode}
            onChange={(event) => onScaleModeChange(event.target.value as SolarScaleMode)}
          >
            <option value="showcase">Showcase</option>
            <option value="educational">Educational</option>
          </select>
        </div>
        <div className="solar-select">
          <label htmlFor="solar-belt">Belt</label>
          <select
            id="solar-belt"
            value={asteroidMode}
            onChange={(event) => onAsteroidModeChange(event.target.value as AsteroidBeltMode)}
          >
            <option value="off">Off</option>
            <option value="simplified">Simplified</option>
            <option value="full">Full</option>
          </select>
        </div>
        <div className="solar-select">
          <label htmlFor="solar-moons">Moons</label>
          <select
            id="solar-moons"
            value={moonMode}
            onChange={(event) => onMoonModeChange(event.target.value as MoonVisibilityMode)}
          >
            <option value="off">Off</option>
            <option value="major">Major</option>
            <option value="all">All</option>
          </select>
        </div>
        <div className="solar-tools" ref={wrapperRef}>
          <button
            type="button"
            className={`ghost button--small ${toolsOpen ? "active" : ""}`}
            onClick={() => setToolsOpen((prev) => !prev)}
          >
            Tools
          </button>
          {toolsOpen && (
            <div className="solar-tools__menu">
              <div className="solar-tools__section">
                <span className="eyebrow">Quality</span>
                <button
                  type="button"
                  className={`ghost button--small ${performanceMode ? "active" : ""}`}
                  onClick={onTogglePerformance}
                >
                  {performanceMode ? "Performance Mode" : "Performance Mode"}
                </button>
              </div>
              <div className="solar-tools__section">
                <span className="eyebrow">Views</span>
                <button type="button" className="ghost button--small" onClick={onSaveBookmark}>
                  Save View
                </button>
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
    </div>
  );
};

export default SolarTopBar;
