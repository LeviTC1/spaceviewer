import type { FC } from "react";

interface HeaderProps {
  onNavigateHome: () => void;
  onNavigateGallery: () => void;
}

// Header shows the SpaceViewer logo + nav.
const Header: FC<HeaderProps> = ({ onNavigateHome, onNavigateGallery }) => (
  <header className="sv-header">
    <div className="sv-header__logo" onClick={onNavigateHome}>
      <span className="sv-logo-dot" />
      SpaceViewer
    </div>
    <nav className="sv-header__nav">
      <button type="button" onClick={onNavigateHome}>
        Home
      </button>
      <button type="button" onClick={onNavigateGallery}>
        Gallery
      </button>
    </nav>
  </header>
);

export default Header;
