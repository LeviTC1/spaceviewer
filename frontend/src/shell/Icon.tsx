// SpaceViewer icon set: single weight, 1.6px strokes, drawn for this product. Shared by every surface.
import type { FC } from "react";

export const Icon: FC<{ name: string; size?: number }> = ({ name, size = 18 }) => {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (name) {
    case "search":
      return <svg {...common}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>;
    case "time":
      return <svg {...common}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>;
    case "layers":
      return <svg {...common}><path d="m12 4 8.5 4.5L12 13 3.5 8.5z" /><path d="m3.5 12.5 8.5 4.5 8.5-4.5" /><path d="m3.5 16.5 8.5 4.5 8.5-4.5" opacity=".55" /></svg>;
    case "share":
      return <svg {...common}><path d="M12 15V4" /><path d="m7.5 8.5 4.5-4.5 4.5 4.5" /><path d="M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13" /></svg>;
    case "images":
      return <svg {...common}><rect x="3.5" y="5" width="17" height="14" rx="2" /><circle cx="9" cy="10" r="1.7" /><path d="m20.5 16-5-5-8 8" /></svg>;
    case "home":
      return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" /></svg>;
    case "plus":
      return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
    case "minus":
      return <svg {...common}><path d="M5 12h14" /></svg>;
    case "close":
      return <svg {...common}><path d="m6 6 12 12M18 6 6 18" /></svg>;
    case "fly":
      return <svg {...common}><path d="M4 12h12" /><path d="m12 6 6 6-6 6" /><circle cx="20" cy="12" r="1.2" fill="currentColor" /></svg>;
    case "follow":
      return <svg {...common}><circle cx="12" cy="12" r="7.5" /><circle cx="12" cy="12" r="2.5" fill="currentColor" /></svg>;
    case "play":
      return <svg {...common}><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" /></svg>;
    case "pause":
      return <svg {...common}><path d="M8 5.5v13M16 5.5v13" strokeWidth="2.6" /></svg>;
    case "reverse":
      return <svg {...common}><path d="M16 5.5v13L5.5 12z" fill="currentColor" /></svg>;
    case "now":
      return <svg {...common}><path d="M4 12a8 8 0 1 0 2.4-5.7" /><path d="M4 4v4h4" /></svg>;
    case "back":
      return <svg {...common}><path d="m14.5 6-6 6 6 6" /></svg>;
    case "next":
      return <svg {...common}><path d="m9.5 6 6 6-6 6" /></svg>;
    case "compass":
      return <svg {...common}><circle cx="12" cy="12" r="8.5" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></svg>;
    case "info":
      return <svg {...common}><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8h.01" /></svg>;
    case "copy":
      return <svg {...common}><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M5 15V6a1 1 0 0 1 1-1h9" /></svg>;
    case "star":
      return <svg {...common}><path d="m12 3.8 2.5 5.1 5.6.8-4 3.9.9 5.6L12 16.6l-5 2.6.9-5.6-4-3.9 5.6-.8z" /></svg>;
    case "star-filled":
      return <svg {...common}><path d="m12 3.8 2.5 5.1 5.6.8-4 3.9.9 5.6L12 16.6l-5 2.6.9-5.6-4-3.9 5.6-.8z" fill="currentColor" /></svg>;
    case "settings":
      return <svg {...common}><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>;
    case "menu":
      return <svg {...common}><path d="M4 7h16M4 12h16M4 17h16" /></svg>;
    case "external":
      return <svg {...common}><path d="M14 4.5h5.5V10" /><path d="M19.5 4.5 11 13" /><path d="M18 14v4.5a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1H10" /></svg>;
    case "download":
      return <svg {...common}><path d="M12 4v11" /><path d="m7.5 10.5 4.5 4.5 4.5-4.5" /><path d="M5 19.5h14" /></svg>;
    case "camera":
      return <svg {...common}><path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2l1.6-2h5.4l1.6 2h2.2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" /><circle cx="12" cy="12.8" r="3.4" /></svg>;
    case "sparkle":
      return <svg {...common}><path d="M12 3.5c.6 4.3 2.2 5.9 6.5 6.5-4.3.6-5.9 2.2-6.5 6.5-.6-4.3-2.2-5.9-6.5-6.5 4.3-.6 5.9-2.2 6.5-6.5z" /><path d="M18.5 15.5c.25 1.6.9 2.25 2.5 2.5-1.6.25-2.25.9-2.5 2.5-.25-1.6-.9-2.25-2.5-2.5 1.6-.25 2.25-.9 2.5-2.5z" /></svg>;
    case "universe":
      return <svg {...common}><circle cx="12" cy="12" r="2.2" /><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(-24 12 12)" /><circle cx="19" cy="6.5" r=".9" fill="currentColor" /></svg>;
    case "telescope":
      return <svg {...common}><path d="m4 11.5 12.5-5 1.6 4-12.5 5z" /><path d="m18.1 10.5 2-.8-1.6-4-2 .8" /><path d="m10 14 2.5 6M10 14l-2.5 6" /></svg>;
    case "clock":
      return <svg {...common}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>;
    case "grid":
      return <svg {...common}><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></svg>;
    case "list":
      return <svg {...common}><path d="M9 7h11M9 12h11M9 17h11" /><circle cx="5" cy="7" r=".9" fill="currentColor" /><circle cx="5" cy="12" r=".9" fill="currentColor" /><circle cx="5" cy="17" r=".9" fill="currentColor" /></svg>;
    case "tools":
      return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M12 3.5v2.5M12 18v2.5M3.5 12H6M18 12h2.5M6 6l1.8 1.8M16.2 16.2 18 18M6 18l1.8-1.8M16.2 7.8 18 6" /></svg>;
    case "live":
      return <svg {...common}><circle cx="12" cy="12" r="2.4" fill="currentColor" /><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4" /><path d="M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14" opacity=".55" /></svg>;
    case "heart":
      return <svg {...common}><path d="M12 19.5s-7.5-4.4-7.5-9.6A4.1 4.1 0 0 1 12 7.4a4.1 4.1 0 0 1 7.5 2.5c0 5.2-7.5 9.6-7.5 9.6z" /></svg>;
    case "trash":
      return <svg {...common}><path d="M5 7h14M10 7V5h4v2M7 7l1 12.5h8L17 7" /></svg>;
    case "expand":
      return <svg {...common}><path d="M4.5 9.5v-5h5M19.5 9.5v-5h-5M4.5 14.5v5h5M19.5 14.5v5h-5" /></svg>;
    case "note":
      return <svg {...common}><path d="M5 4.5h14v10l-5 5H5z" /><path d="M14 19.5v-5h5" /></svg>;
    case "compare":
      return <svg {...common}><rect x="3.5" y="5" width="7.5" height="14" rx="1.5" /><rect x="13" y="5" width="7.5" height="14" rx="1.5" /></svg>;
    default:
      return <svg {...common}><circle cx="12" cy="12" r="3" /></svg>;
  }
};
