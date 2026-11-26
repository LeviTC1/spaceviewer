// Explorer deep links.
//
//   /explore                              – home / last session
//   /explore/<slug>                       – an object, default framing
//   /explore/<slug>?t=<ISO>&rate=<s/s>&paused=1&cam=<distKm>,<dx>,<dy>,<dz>
//                                         – an exact observation: object, epoch, playback and camera pose
//
// Legacy links keep working: /skymap?object=<sky-object-id> and /?object=… resolve to the same entity.

import type { Vec3 } from "./engine/units";

export interface ExploreLocation {
  slug: string | null;
  legacyObjectId: string | null;
  timeMs: number | null;
  rate: number | null;
  paused: boolean | null;
  camera: { distanceKm: number; direction: Vec3 } | null;
}

export const isExplorePath = (pathname: string) => pathname === "/" || pathname === "/explore" || pathname === "/tonight" || pathname.startsWith("/explore/") || pathname === "/skymap";

export const parseExploreLocation = (pathname: string, search: string): ExploreLocation => {
  const params = new URLSearchParams(search);
  let slug: string | null = null;
  if (pathname.startsWith("/explore/")) slug = decodeURIComponent(pathname.slice("/explore/".length)).replace(/\/$/, "") || null;
  const legacyObjectId = params.get("object");
  const t = params.get("t");
  const parsedTime = t ? Date.parse(t) : NaN;
  const rateRaw = params.get("rate");
  const rate = rateRaw !== null && Number.isFinite(Number(rateRaw)) ? Number(rateRaw) : null;
  const pausedRaw = params.get("paused");
  let camera: ExploreLocation["camera"] = null;
  const cam = params.get("cam");
  if (cam) {
    const parts = cam.split(",").map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite) && parts[0] > 0) {
      const len = Math.hypot(parts[1], parts[2], parts[3]) || 1;
      camera = { distanceKm: parts[0], direction: [parts[1] / len, parts[2] / len, parts[3] / len] };
    }
  }
  return {
    slug,
    legacyObjectId,
    timeMs: Number.isFinite(parsedTime) ? parsedTime : null,
    rate,
    paused: pausedRaw === null ? null : pausedRaw === "1",
    camera,
  };
};

export const buildExplorePath = (
  slug: string | null,
  options: { timeMs?: number; rate?: number; paused?: boolean; camera?: { distanceKm: number; direction: Vec3 } } = {},
) => {
  const params = new URLSearchParams();
  if (options.timeMs !== undefined) params.set("t", new Date(options.timeMs).toISOString().replace(/\.\d{3}Z$/, "Z"));
  if (options.rate !== undefined && options.rate !== 1) params.set("rate", String(Math.round(options.rate * 1000) / 1000));
  if (options.paused) params.set("paused", "1");
  if (options.camera) {
    const { distanceKm, direction } = options.camera;
    params.set("cam", [distanceKm.toPrecision(6), ...direction.map((v) => v.toFixed(4))].join(","));
  }
  const query = params.toString();
  return `${slug ? `/explore/${encodeURIComponent(slug)}` : "/explore"}${query ? `?${query}` : ""}`;
};

const SESSION_KEY = "spaceviewer.explore.session.v1";

export interface StoredSession {
  targetId: string | null;
  distanceKm: number;
  direction: Vec3;
  savedAt: number;
}

export const readStoredSession = (): StoredSession | null => {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed || !Number.isFinite(parsed.distanceKm) || !Array.isArray(parsed.direction)) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const writeStoredSession = (session: StoredSession) => {
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // storage unavailable
  }
};

// The universe's last exact address (object, moment, camera), so "Universe" in the bar returns there.
let lastExplorePath: string | null = null;
export const rememberExplorePath = (path: string) => {
  lastExplorePath = path;
};
export const getLastExplorePath = () => lastExplorePath;
