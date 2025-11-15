import type { FC, ReactNode } from "react";
import Header from "./Header";

interface AppShellProps {
  children: ReactNode;
  onNavigateHome: () => void;
  onNavigateGallery: () => void;
}

// Wraps every view with the premium glass background.
const AppShell: FC<AppShellProps> = ({ children, onNavigateHome, onNavigateGallery }) => (
  <div className="app-shell">
    <Header onNavigateHome={onNavigateHome} onNavigateGallery={onNavigateGallery} />
    <main className="app-shell__content">{children}</main>
  </div>
);

export default AppShell;
