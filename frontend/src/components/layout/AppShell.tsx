import { useEffect, useRef, type FC, type ReactNode } from "react";
import Header from "./Header";

interface AppShellProps {
  children: ReactNode;
  onNavigateHome: () => void;
  onNavigateGallery: () => void;
  onNavigateSolar: () => void;
  activeNav?: "home" | "gallery" | "solar";
}

// Wraps every view with the premium glass background.
const AppShell: FC<AppShellProps> = ({
  children,
  onNavigateHome,
  onNavigateGallery,
  onNavigateSolar,
  activeNav,
}) => {
  const shellRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const target = shellRef.current;
    if (!target) return;

    const update = () => {
      const scrollY = window.scrollY || 0;
      target.style.setProperty("--sv-parallax", `${scrollY * 0.04}px`);
      target.style.setProperty("--sv-parallax-slow", `${scrollY * 0.015}px`);
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("spaceviewer.reduceMotion");
    const enabled = stored === "true";
    document.body.classList.toggle("reduce-motion", enabled);
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
      const bottomInset = Math.max(visualInset, layoutInset, minUrlBar);
      document.documentElement.style.setProperty("--sv-urlbar", `${bottomInset}px`);
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

  return (
    <div className="app-shell" ref={shellRef}>
      <Header
        onNavigateHome={onNavigateHome}
        onNavigateGallery={onNavigateGallery}
        onNavigateSolar={onNavigateSolar}
        activeNav={activeNav}
      />
      <main className="app-shell__content">{children}</main>
    </div>
  );
};

export default AppShell;
