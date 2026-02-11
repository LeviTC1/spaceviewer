import type { FC } from "react";

interface HeaderProps {
  onNavigateHome: () => void;
  onNavigateGallery: () => void;
  onNavigateSolar: () => void;
  activeNav?: "home" | "gallery" | "solar";
}

// Header shows the SpaceViewer logo + nav.
const Header: FC<HeaderProps> = ({
  onNavigateHome,
  onNavigateGallery,
  onNavigateSolar,
  activeNav,
}) => (
  <header className="sv-header">
    <div className="sv-header__logo" onClick={onNavigateHome} aria-label="SpaceViewer home">
      <span className="sv-logo">
        <svg className="sv-logo__icon" viewBox="0 0 120 48" aria-hidden="true" focusable="false">
          <circle className="sv-logo__planet" cx="42" cy="24" r="16" />
          <ellipse className="sv-logo__orbit" cx="42" cy="24" rx="26" ry="11" transform="rotate(-20 42 24)" />
          <circle className="sv-logo__moon" cx="66" cy="15" r="3.2" />
        </svg>
        <span className="sv-logo__text">SpaceViewer</span>
      </span>
    </div>
    <nav className="sv-header__nav">
      <button
        type="button"
        onClick={onNavigateHome}
        className={activeNav === "home" ? "active" : ""}
        aria-current={activeNav === "home" ? "page" : undefined}
      >
        Home
      </button>
      <button
        type="button"
        onClick={onNavigateGallery}
        className={activeNav === "gallery" ? "active" : ""}
        aria-current={activeNav === "gallery" ? "page" : undefined}
      >
        Gallery
      </button>
      <button
        type="button"
        onClick={onNavigateSolar}
        className={activeNav === "solar" ? "active" : ""}
        aria-current={activeNav === "solar" ? "page" : undefined}
      >
        Explore Solar System
      </button>
    </nav>
  </header>
);

export default Header;
