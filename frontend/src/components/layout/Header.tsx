import type { FC } from "react";

interface HeaderProps {
  onNavigateHome: () => void;
  onNavigateGallery: () => void;
  onNavigateSolar: () => void;
  onNavigateSkyMap: () => void;
  activeNav?: "home" | "gallery" | "solar" | "skymap";
}

// Header shows the SpaceViewer logo + nav.
const Header: FC<HeaderProps> = ({
  onNavigateHome,
  onNavigateGallery,
  onNavigateSolar,
  onNavigateSkyMap,
  activeNav,
}) => {
  const navItems = [
    {
      id: "home" as const,
      label: "Home",
      meta: "Search and discovery",
      shortLabel: "H",
      onClick: onNavigateHome,
    },
    {
      id: "gallery" as const,
      label: "Gallery",
      meta: "Results and viewer",
      shortLabel: "G",
      onClick: onNavigateGallery,
    },
    {
      id: "skymap" as const,
      label: "SkyMap",
      meta: "Universe navigation",
      shortLabel: "M",
      onClick: onNavigateSkyMap,
    },
    {
      id: "solar" as const,
      label: "Solar Explorer",
      meta: "3D system workspace",
      shortLabel: "S",
      onClick: onNavigateSolar,
    },
  ];

  return (
    <header className="sv-header">
      <button type="button" className="sv-header__brand" onClick={onNavigateHome} aria-label="SpaceViewer home">
        <span className="sv-logo-mark" aria-hidden="true">
          <span className="sv-logo-mark__core" />
        </span>
        <span className="sv-header__brand-copy">
          <span className="sv-header__brand-title">SpaceViewer</span>
          <span className="sv-header__brand-subtitle">Observation workspace</span>
        </span>
      </button>

      <div className="sv-header__section">
        <span className="sv-header__section-label">Workspace</span>
        <nav className="sv-header__nav" aria-label="Primary">
          {navItems.map((item) => {
            const isActive = activeNav === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={item.onClick}
                className={`sv-nav__item ${isActive ? "active" : ""}`}
                aria-current={isActive ? "page" : undefined}
              >
                <span className="sv-nav__icon" aria-hidden="true">
                  {item.shortLabel}
                </span>
                <span className="sv-nav__copy">
                  <span className="sv-nav__title">{item.label}</span>
                  <span className="sv-nav__meta">{item.meta}</span>
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="sv-header__footer">
        <span className="sv-header__section-label">Data Sources</span>
        <p className="sv-header__note">NASA, SDSS, and Pan-STARRS in one calm, dense workspace.</p>
      </div>
    </header>
  );
};

export default Header;
