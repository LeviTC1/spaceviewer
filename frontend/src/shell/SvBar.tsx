// The one bar every SpaceViewer screen sits under: brand, the three places you live in, the specialist
// tools, Find, Your sky and settings. On phones the navigation moves under the thumb (SvTabBar).

import { useEffect, useRef, useState, type FC, type ReactNode } from "react";
import { Icon } from "./Icon";

export type SvDestination = "home" | "universe" | "images" | "live" | "saved" | "solar" | "atlas";

const PRIMARY: Array<{ id: SvDestination; label: string; icon: string }> = [
  { id: "universe", label: "Universe", icon: "universe" },
  { id: "images", label: "Images", icon: "images" },
  { id: "live", label: "Live", icon: "live" },
  { id: "saved", label: "Your sky", icon: "star" },
];

const TOOLS: Array<{ id: SvDestination; label: string; detail: string }> = [
  { id: "solar", label: "Solar Explorer", detail: "Eclipses, true-AU ruler, mission tools, birthdays" },
  { id: "atlas", label: "Sky Atlas", detail: "Catalogue layers, constellations, DESI light cone, annotations" },
];

export interface SvBarProps {
  active: SvDestination | null;
  onNavigate: (destination: SvDestination) => void;
  onOpenFind: () => void;
  onOpenSettings: () => void;
  savedCount?: number;
  /** Replaces the Find trigger (the explorer puts its fly-to search here). */
  search?: ReactNode;
  /** Extra actions for the current surface, shown before settings. */
  actions?: ReactNode;
  /** Brand click; defaults to the universe. */
  onBrand?: () => void;
  variant?: "overlay" | "solid";
}

export const SvBrand: FC<{ onClick: () => void }> = ({ onClick }) => (
  <a
    className="sv-brand"
    href="/"
    onClick={(event) => {
      event.preventDefault();
      onClick();
    }}
    aria-label="SpaceViewer home"
  >
    <span className="sv-brand__mark" aria-hidden="true" />
    <span className="sv-brand__name">SpaceViewer</span>
  </a>
);

export const FindTrigger: FC<{ onOpen: () => void; label?: string }> = ({ onOpen, label = "Find a place, photo or moment" }) => (
  <button type="button" className="sv-find-trigger" onClick={onOpen} aria-label="Find anything" aria-keyshortcuts="Meta+K">
    <Icon name="search" size={16} />
    <span>{label}</span>
    <kbd>⌘K</kbd>
  </button>
);

const ToolsMenu: FC<{ active: SvDestination | null; onNavigate: (destination: SvDestination) => void }> = ({ active, onNavigate }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", key);
    };
  }, [open]);
  const isToolActive = active === "solar" || active === "atlas";
  return (
    <div className="sv-tools" ref={ref}>
      <button
        type="button"
        className={`sv-nav__item${isToolActive ? " is-active" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="tools" size={16} />
        <span>{isToolActive ? TOOLS.find((tool) => tool.id === active)?.label : "Tools"}</span>
      </button>
      {open ? (
        <div className="sv-menu" role="menu">
          {TOOLS.map((tool) => (
            <button
              key={tool.id}
              type="button"
              role="menuitem"
              className={active === tool.id ? "is-active" : ""}
              onClick={() => {
                setOpen(false);
                onNavigate(tool.id);
              }}
            >
              <strong>{tool.label}</strong>
              <small>{tool.detail}</small>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};

export const SvBar: FC<SvBarProps> = ({ active, onNavigate, onOpenFind, onOpenSettings, savedCount = 0, search, actions, onBrand, variant = "solid" }) => (
  <header className={`sv-bar sv-bar--${variant}`}>
    <SvBrand onClick={onBrand ?? (() => onNavigate("home"))} />
    <nav className="sv-nav" aria-label="SpaceViewer">
      {PRIMARY.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`sv-nav__item${active === item.id ? " is-active" : ""}`}
          aria-current={active === item.id ? "page" : undefined}
          onClick={() => onNavigate(item.id)}
        >
          {item.id === "live" ? <span className="sv-live-dot" aria-hidden="true" /> : <Icon name={item.icon} size={16} />}
          <span>{item.label}</span>
          {item.id === "saved" && savedCount > 0 ? <em className="sv-nav__count">{savedCount}</em> : null}
        </button>
      ))}
      <ToolsMenu active={active} onNavigate={onNavigate} />
    </nav>
    <div className="sv-bar__search">{search ?? <FindTrigger onOpen={onOpenFind} />}</div>
    <div className="sv-bar__actions">
      {actions}
      <button type="button" className="sv-icon-btn" onClick={onOpenSettings} aria-label="Settings">
        <Icon name="settings" size={18} />
      </button>
    </div>
  </header>
);

/** Phone navigation, under the thumb, for browsing surfaces (the universe keeps its own controls). */
export const SvTabBar: FC<{ active: SvDestination | null; onNavigate: (destination: SvDestination) => void; onOpenFind: () => void; savedCount?: number }> = ({
  active,
  onNavigate,
  onOpenFind,
  savedCount = 0,
}) => (
  <nav className="sv-tabbar" aria-label="SpaceViewer">
    <button type="button" className={active === "universe" ? "is-active" : ""} onClick={() => onNavigate("universe")}>
      <Icon name="universe" size={22} />
      <span>Universe</span>
    </button>
    <button type="button" className={active === "images" ? "is-active" : ""} onClick={() => onNavigate("images")}>
      <Icon name="images" size={22} />
      <span>Images</span>
    </button>
    <button type="button" className={active === "live" ? "is-active" : ""} onClick={() => onNavigate("live")}>
      <Icon name="live" size={22} />
      <span>Live</span>
    </button>
    <button type="button" onClick={onOpenFind}>
      <Icon name="search" size={22} />
      <span>Find</span>
    </button>
    <button type="button" className={active === "saved" ? "is-active" : ""} onClick={() => onNavigate("saved")}>
      <Icon name="star" size={22} />
      <span>Your sky{savedCount ? <em>{savedCount}</em> : null}</span>
    </button>
  </nav>
);
