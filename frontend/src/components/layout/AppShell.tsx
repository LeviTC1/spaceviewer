// The frame around every non-universe surface: the SpaceViewer bar on top, the page, and on phones a
// thumb-height tab bar. Solar Explorer and Sky Atlas are "immersive": their 3D scene fills the window
// and the bar floats over it.

import { useEffect, type FC, type ReactNode } from "react";
import { SvBar, SvTabBar, type SvDestination } from "../../shell/SvBar";
import { Icon } from "../../shell/Icon";
import { applyReduceMotion } from "../../shell/preferences";

const openSkyMapUtilityPanel = (panel: "settings" | "time") => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("spaceviewer:skymap-utility", { detail: { panel } }));
};

interface AppShellProps {
  children: ReactNode;
  active: SvDestination | null;
  context: "landing" | "images" | "results" | "viewer" | "saved" | "live" | "solar" | "skymap";
  onNavigate: (destination: SvDestination) => void;
  onOpenCommand: () => void;
  onOpenSettings: () => void;
  savedCount: number;
}

const AppShell: FC<AppShellProps> = ({ children, active, context, onNavigate, onOpenCommand, onOpenSettings, savedCount }) => {
  const immersive = context === "solar" || context === "skymap";

  useEffect(() => {
    applyReduceMotion();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateViewportVars = () => {
      const viewport = window.visualViewport;
      const height = viewport?.height ?? window.innerHeight;
      const offsetTop = viewport?.offsetTop ?? 0;
      const visualInset = Math.max(0, window.innerHeight - height - offsetTop);
      const layoutInset = Math.max(0, window.innerHeight - document.documentElement.clientHeight);
      const isIOS = /iPad|iPhone|iPod/.test(window.navigator.userAgent);
      const minUrlBar = isIOS ? 72 : 0;
      document.documentElement.style.setProperty("--sv-urlbar", `${Math.max(visualInset, layoutInset, minUrlBar)}px`);
    };
    updateViewportVars();
    window.visualViewport?.addEventListener("resize", updateViewportVars);
    window.visualViewport?.addEventListener("scroll", updateViewportVars);
    window.addEventListener("resize", updateViewportVars);
    return () => {
      window.visualViewport?.removeEventListener("resize", updateViewportVars);
      window.visualViewport?.removeEventListener("scroll", updateViewportVars);
      window.removeEventListener("resize", updateViewportVars);
    };
  }, []);

  const atlasActions =
    context === "skymap" ? (
      <>
        <button type="button" className="sv-icon-btn" onClick={() => openSkyMapUtilityPanel("time")} aria-label="Sky Atlas time and on this day">
          <Icon name="time" size={18} />
        </button>
        <button type="button" className="sv-icon-btn" onClick={() => openSkyMapUtilityPanel("settings")} aria-label="Sky Atlas layers and display">
          <Icon name="layers" size={18} />
        </button>
      </>
    ) : null;

  return (
    <div className={`sv-app app-shell app-shell--${context === "skymap" ? "skymap" : context === "solar" ? "solar" : context === "viewer" ? "gallery" : "home"}${immersive ? " app-shell--immersive" : " app-shell--flat"} sv-context-${context}`}>
      <a className="sv-skip" href="#sv-main">
        Skip to content
      </a>
      <SvBar
        active={active}
        onNavigate={onNavigate}
        onOpenFind={onOpenCommand}
        onOpenSettings={onOpenSettings}
        savedCount={savedCount}
        actions={atlasActions}
        variant={immersive || context === "landing" ? "overlay" : "solid"}
      />
      <div className="app-shell__layout">
        <main className="app-shell__content" id="sv-main">
          {children}
        </main>
      </div>
      {!immersive ? <SvTabBar active={active} onNavigate={onNavigate} onOpenFind={onOpenCommand} savedCount={savedCount} /> : null}
    </div>
  );
};

export default AppShell;
