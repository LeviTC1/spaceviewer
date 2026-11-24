// Screen-space projection, label placement and picking for every entity, every frame.
//
// One pass projects candidates (with occlusion against resolved bodies), a second places labels by
// priority with rectangle collision. Labels are a pooled set of DOM buttons mutated in place — no React
// renders per frame. Picking uses the same projected list, so what you can see is what you can click.

import { pixelRadiusOf, projectToScreen, type EngineState, type ProjectedCandidate } from "./engineState";
import { getEntityRenderWorld, type UniverseEntity } from "./universeModel";
import { KM_PER_AU, KM_PER_LY } from "./units";

const LABEL_POOL = 72;

export interface LabelLayer {
  update: (state: EngineState) => void;
  pick: (state: EngineState, x: number, y: number) => UniverseEntity | null;
  dispose: () => void;
}

const apparentMagnitude = (state: EngineState, entity: UniverseEntity, world: [number, number, number], distance: number) => {
  if (entity.kind === "sun" || entity.kind === "star" || entity.kind === "exoplanet-system") {
    const pc = distance / (KM_PER_LY * 3.2615638);
    return (entity.absoluteMagnitude ?? 5) + 5 * (Math.log10(Math.max(1e-12, pc)) - 1);
  }
  if (entity.kind === "galaxy" || entity.kind === "nebula" || entity.kind === "cluster" || entity.kind === "structure" || entity.kind === "black-hole") {
    const sci = entity.object?.scientific as { apparentMagnitude?: number } | undefined;
    if (entity.direction) return sci?.apparentMagnitude ?? 11;
    const pc = distance / (KM_PER_LY * 3.2615638);
    const abs = entity.absoluteMagnitude ?? (entity.kind === "galaxy" ? -18 : entity.kind === "cluster" ? -7 : -4);
    return abs + 5 * (Math.log10(Math.max(1e-12, pc)) - 1);
  }
  if (entity.kind === "spacecraft") return 99;
  const r = Math.max(1, Math.hypot(world[0], world[1], world[2]));
  const ratio = ((entity.albedo ?? 0.3) * 0.6 * (entity.radiusKm / KM_PER_AU) ** 2) / ((r / KM_PER_AU) ** 2 * (distance / KM_PER_AU) ** 2);
  return -26.74 - 2.5 * Math.log10(Math.max(1e-40, ratio));
};

const KIND_BASE: Partial<Record<UniverseEntity["kind"], number>> = {
  sun: 40,
  planet: 34,
  "dwarf-planet": 14,
  moon: 8,
  comet: 4,
  spacecraft: 10,
  star: 0,
  "exoplanet-system": 2,
  galaxy: 10,
  nebula: 8,
  cluster: 6,
  "black-hole": 18,
  structure: 30,
};

export const projectCandidates = (state: EngineState): ProjectedCandidate[] => {
  const out: ProjectedCandidate[] = [];
  const limit = 6.8 + state.exposure;
  const selected = state.selectedId ? state.index.byId.get(state.selectedId) : undefined;
  const tracked = state.trackedId ? state.index.byId.get(state.trackedId) : undefined;
  const occluders: Array<{ x: number; y: number; r: number; depth: number; id: string }> = [];
  const inSolarSystem = Math.hypot(state.cameraWorld[0], state.cameraWorld[1], state.cameraWorld[2]) < 1_500 * KM_PER_AU;
  const cam = state.cameraWorld;
  for (const entity of state.index.entities) {
    // Fast path for the ~15k anonymous Gaia sources: only bright-enough ones are pickable, and they
    // are never labelled unless selected. Skips projection and allocation for the rest.
    if (entity.kind === "star" && entity.importance < 10 && entity.staticWorld && entity.id !== state.selectedId) {
      const w = entity.staticWorld;
      const d = Math.hypot(w[0] - cam[0], w[1] - cam[1], w[2] - cam[2]);
      const m = (entity.absoluteMagnitude ?? 5) + 5 * (Math.log10(Math.max(1e-12, d / (KM_PER_LY * 3.2615638))) - 1);
      if (m > limit - 0.75) continue;
    }
    const world = getEntityRenderWorld(entity, state.simTimeMs, state.cameraWorld);
    const screen = projectToScreen(state, world);
    const dx = world[0] - state.cameraWorld[0];
    const dy = world[1] - state.cameraWorld[1];
    const dz = world[2] - state.cameraWorld[2];
    const distanceKm = Math.hypot(dx, dy, dz);
    if (!screen) continue;
    const onScreen = screen.x > -40 && screen.y > -40 && screen.x < state.viewportWidth + 40 && screen.y < state.viewportHeight + 40;
    if (!onScreen && entity.id !== state.selectedId) continue;
    const extent = entity.kind === "galaxy" || entity.kind === "structure" || entity.kind === "nebula" || entity.kind === "cluster" ? entity.extentKm : entity.radiusKm;
    const pixelRadius = entity.direction
      ? ((entity.angularSizeArcMin ?? 2) / 120) * (Math.PI / 180) * (state.viewportHeight / 2 / Math.tan(state.fovY / 2))
      : pixelRadiusOf(state, extent, distanceKm);
    const magnitude = apparentMagnitude(state, entity, world as [number, number, number], distanceKm);
    const flux = Math.pow(10, -0.4 * (magnitude - limit));
    const prominence = Math.max(Math.log2(1 + pixelRadius) * 9, flux > 1 ? Math.log10(flux) * 8 : flux * 4);
    let score = entity.importance * 0.42 + (KIND_BASE[entity.kind] ?? 0) + prominence;
    // Relationship bonuses: the selected object's family stays legible.
    if (entity.id === state.selectedId) score += 1_000;
    if (entity.id === state.hoveredId) score += 400;
    if (entity.id === state.trackedId) score += 120;
    if (entity.id === state.contextId) score += 900;
    if (selected && (entity.parentId === selected.id || entity.id === selected.parentId)) score += 45;
    if (tracked && entity.parentId === tracked.id) score += 40;
    // Only label what the eye could actually find at this exposure — plus planets, spacecraft and
    // whatever the user is focused on. Everything else waits until it is visible or searched for.
    const focus = entity.id === state.selectedId || entity.id === state.hoveredId || entity.id === state.trackedId || entity.id === state.contextId;
    const starLike = entity.kind === "star" || entity.kind === "exoplanet-system";
    const visible = pixelRadius > 1.5 || (starLike ? flux > (entity.importance >= 60 ? 1.5 : 6) : flux > 0.6);
    const alwaysFindable = entity.kind === "planet" || entity.kind === "spacecraft" || entity.kind === "sun" || entity.kind === "structure" || (entity.kind === "moon" && entity.radiusKm > 1_000);
    if (!visible && !focus && !alwaysFindable) score -= 120;
    // Inside the Solar System, the sky beyond is backdrop: only the brightest stars keep labels.
    if (inSolarSystem && !entity.solarId && entity.kind !== "spacecraft" && !focus) {
      if (!(entity.kind === "star" && flux > 40)) score -= 140;
    }
    // Sky-sphere objects without distances stay quiet unless notable.
    if (entity.direction && entity.importance < 70 && !focus) score -= 25;
    out.push({ entity, x: screen.x, y: screen.y, pixelRadius, distanceKm, prominence, score, onScreen, occluded: false });
    if (pixelRadius > 3 && (entity.solarId || entity.kind === "star" || entity.kind === "sun")) {
      occluders.push({ x: screen.x, y: screen.y, r: pixelRadius, depth: distanceKm - entity.radiusKm, id: entity.id });
    }
  }
  // Occlusion: anything behind a resolved body's disc is hidden (labels and picking).
  if (occluders.length) {
    for (const candidate of out) {
      for (const occluder of occluders) {
        if (occluder.id === candidate.entity.id) continue;
        if (candidate.distanceKm <= occluder.depth) continue;
        const d = Math.hypot(candidate.x - occluder.x, candidate.y - occluder.y);
        if (d < occluder.r * 0.98) {
          candidate.occluded = true;
          break;
        }
      }
    }
  }
  // Children collapsed onto their parent are not separately labelled until they separate on screen.
  const byId = new Map(out.map((c) => [c.entity.id, c]));
  for (const candidate of out) {
    const parentId = candidate.entity.parentId;
    if (!parentId || parentId === "solar:sun") continue;
    const parent = byId.get(parentId);
    if (!parent) continue;
    const separation = Math.hypot(candidate.x - parent.x, candidate.y - parent.y);
    if (separation < Math.max(14, parent.pixelRadius + 10) && candidate.entity.id !== state.selectedId) candidate.score -= 200;
  }
  out.sort((a, b) => b.score - a.score);
  return out;
};

const KIND_CLASS: Record<string, string> = {
  sun: "star",
  star: "star",
  planet: "planet",
  "dwarf-planet": "planet",
  moon: "moon",
  comet: "small",
  spacecraft: "craft",
  "exoplanet-system": "exo",
  galaxy: "galaxy",
  structure: "galaxy",
  nebula: "nebula",
  cluster: "cluster",
  "black-hole": "bh",
};

export const createLabelLayer = (container: HTMLElement, onSelect: (id: string) => void, onHover: (id: string | null) => void): LabelLayer => {
  const pool: HTMLButtonElement[] = [];
  const texts: string[] = [];
  for (let i = 0; i < LABEL_POOL; i += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ex-label";
    button.tabIndex = -1;
    const dot = document.createElement("span");
    dot.className = "ex-label__ring";
    const text = document.createElement("span");
    text.className = "ex-label__text";
    button.append(dot, text);
    button.style.display = "none";
    container.appendChild(button);
    pool.push(button);
    texts.push("");
  }
  const handleClick = (event: MouseEvent) => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>(".ex-label");
    const id = target?.dataset.id;
    if (id) {
      event.stopPropagation();
      onSelect(id);
    }
  };
  const handleOver = (event: MouseEvent) => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>(".ex-label");
    onHover(target?.dataset.id ?? null);
  };
  container.addEventListener("click", handleClick);
  container.addEventListener("pointerover", handleOver);

  const rects: Array<[number, number, number, number]> = [];
  const update = (state: EngineState) => {
    state.candidates = projectCandidates(state);
    rects.length = 0;
    let used = 0;
    const threshold = 30;
    // A calm sky: a modest budget of labels, plus the selection and its family.
    const budget = state.viewportWidth < 760 ? 10 : 18;
    let ordinary = 0;
    if (!state.showLabels) {
      for (let i = 0; i < LABEL_POOL; i += 1) pool[i].style.display = "none";
      return;
    }
    for (const candidate of state.candidates) {
      if (used >= LABEL_POOL) break;
      if (!candidate.onScreen || candidate.occluded) continue;
      const isSelected = candidate.entity.id === state.selectedId;
      if (candidate.score < threshold && !isSelected) break;
      // The object you are standing next to doesn't need a label floating over it.
      if (candidate.pixelRadius > state.viewportHeight * 0.32 && !isSelected) continue;
      if (candidate.pixelRadius > state.viewportHeight * 0.32 && isSelected) continue;
      const name = candidate.entity.name;
      const width = 14 + name.length * 7.1;
      const height = 20;
      const offset = Math.max(5, Math.min(candidate.pixelRadius * 0.72, 60));
      const x = candidate.x + offset;
      const y = candidate.y + offset * 0.35 - height / 2;
      if (x < 4 || y < 50 || x + width > state.viewportWidth - 4 || y + height > state.viewportHeight - 4) {
        if (!isSelected) continue;
      }
      let collides = false;
      for (const r of rects) {
        if (x < r[0] + r[2] && x + width > r[0] && y < r[1] + r[3] && y + height > r[1]) {
          collides = true;
          break;
        }
      }
      if (collides && !isSelected) continue;
      const family = isSelected || candidate.entity.id === state.contextId || candidate.entity.id === state.hoveredId || candidate.entity.id === state.trackedId || (state.selectedId && (candidate.entity.parentId === state.selectedId));
      if (!family) {
        if (ordinary >= budget) continue;
        ordinary += 1;
      }
      rects.push([x - 2, y - 2, width + 4, height + 4]);
      const button = pool[used];
      if (texts[used] !== name) {
        (button.lastChild as HTMLElement).textContent = name;
        texts[used] = name;
      }
      button.dataset.id = candidate.entity.id;
      button.dataset.kind = KIND_CLASS[candidate.entity.kind] ?? "star";
      button.classList.toggle("is-selected", isSelected);
      button.classList.toggle("is-hovered", candidate.entity.id === state.hoveredId);
      button.classList.toggle("is-context", candidate.entity.id === state.contextId);
      button.style.display = "";
      const ringSize = candidate.pixelRadius > 26 ? 0 : Math.max(8, Math.min(candidate.pixelRadius * 2 + 10, 64));
      button.style.setProperty("--ring", `${ringSize}px`);
      button.style.setProperty("--ring-dx", `${-(offset) - ringSize / 2}px`);
      button.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      const fade = isSelected ? 1 : Math.min(1, (candidate.score - threshold) / 18 + 0.35);
      button.style.opacity = fade.toFixed(2);
      used += 1;
    }
    for (let i = used; i < LABEL_POOL; i += 1) pool[i].style.display = "none";
  };

  const pick = (state: EngineState, x: number, y: number) => {
    let best: UniverseEntity | null = null;
    let bestScore = -Infinity;
    for (const candidate of state.candidates) {
      if (!candidate.onScreen || candidate.occluded) continue;
      const d = Math.hypot(candidate.x - x, candidate.y - y);
      const reach = Math.max(14, candidate.pixelRadius + 6);
      if (d > reach) continue;
      // Inside a resolved disc wins outright (nearest first); otherwise prefer prominent + close.
      const inside = d < candidate.pixelRadius;
      const score = (inside ? 10_000 - candidate.distanceKm / 1e12 : 0) + candidate.score - d * 1.5;
      if (score > bestScore) {
        bestScore = score;
        best = candidate.entity;
      }
    }
    return best;
  };

  return {
    update,
    pick,
    dispose: () => {
      container.removeEventListener("click", handleClick);
      container.removeEventListener("pointerover", handleOver);
      pool.forEach((button) => button.remove());
    },
  };
};
