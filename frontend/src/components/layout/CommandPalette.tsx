// Find anything: places to fly to, photographs, moments, your saved things and every tool, in one box.
// The ranking is deterministic (commandPaletteSearch); results are grouped so you can see at a glance
// whether a hit takes you somewhere in the universe or into the photograph archive.

import { useEffect, useMemo, useRef, useState, type FC, type KeyboardEvent } from "react";
import { Icon } from "../../shell/Icon";
import { rankCommandItems } from "./commandPaletteSearch";

export type CommandGroup = "Places" | "Moments" | "Live" | "Photographs" | "Your sky" | "Recent" | "Go to" | "Tools";

export interface CommandItem {
  id: string;
  label: string;
  meta: string;
  badge: string;
  keywords?: string;
  defaultHidden?: boolean;
  group?: CommandGroup;
  icon?: string;
  thumb?: string;
  onSelect: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  items: CommandItem[];
  supplementalItemsLoading?: boolean;
  onClose: () => void;
  onSearch: (query: string) => void;
}

const GROUP_ORDER: CommandGroup[] = ["Places", "Moments", "Live", "Photographs", "Your sky", "Recent", "Go to", "Tools"];
const GROUP_ICON: Record<CommandGroup, string> = {
  Places: "universe",
  Moments: "clock",
  Live: "live",
  Photographs: "images",
  "Your sky": "star",
  Recent: "now",
  "Go to": "next",
  Tools: "tools",
};

const groupOf = (item: CommandItem): CommandGroup => item.group ?? "Go to";

const CommandPalette: FC<CommandPaletteProps> = ({ open, items, supplementalItemsLoading = false, onClose, onSearch }) => {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const sections = useMemo(() => {
    const normalized = query.trim();
    const ranked = normalized ? rankCommandItems(items, normalized) : items.filter((item) => !item.defaultHidden);
    const photoSearch: CommandItem | null = normalized
      ? {
          id: `search:${normalized.toLowerCase()}`,
          label: `Photographs of “${normalized}”`,
          meta: "Search NASA, SDSS and Pan-STARRS archives",
          badge: "Search",
          group: "Photographs",
          icon: "images",
          onSelect: () => onSearch(normalized),
        }
      : null;
    const byGroup = new Map<CommandGroup, CommandItem[]>();
    const firstSeen: CommandGroup[] = [];
    const push = (item: CommandItem) => {
      const group = groupOf(item);
      if (!byGroup.has(group)) {
        byGroup.set(group, []);
        firstSeen.push(group);
      }
      const list = byGroup.get(group)!;
      if (list.length < (normalized ? 6 : 8)) list.push(item);
    };
    ranked.forEach(push);
    if (photoSearch) {
      // The archive search always sits right after the best places, never buried.
      if (!byGroup.has("Photographs")) {
        byGroup.set("Photographs", []);
        firstSeen.splice(Math.min(1, firstSeen.length), 0, "Photographs");
      }
      byGroup.get("Photographs")!.unshift(photoSearch);
    }
    const order = normalized ? firstSeen : GROUP_ORDER.filter((group) => byGroup.has(group));
    return order.map((group) => ({ group, items: byGroup.get(group) ?? [] })).filter((section) => section.items.length);
  }, [items, onSearch, query]);

  const flat = useMemo(() => sections.flatMap((section) => section.items), [sections]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIndex(0);
      restoreFocusRef.current?.focus?.();
      return;
    }
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, open]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!open) return null;

  const chooseItem = (item: CommandItem) => {
    item.onSelect();
    onClose();
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!flat.length) return;
      setActiveIndex((prev) => (event.key === "ArrowDown" ? (prev + 1) % flat.length : (prev - 1 + flat.length) % flat.length));
      return;
    }
    if (event.key === "Enter" && flat[activeIndex]) {
      event.preventDefault();
      chooseItem(flat[activeIndex]);
    }
  };

  let running = -1;
  return (
    <div className="sv-find" role="dialog" aria-modal="true" aria-label="Find anything">
      <button type="button" className="sv-find__backdrop" onClick={onClose} aria-label="Close Find" tabIndex={-1} />
      <div className="sv-find__panel">
        <div className="sv-find__search">
          <Icon name="search" size={20} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Saturn, M31, Carina, Webb, eclipse…"
            aria-label="Find a place, photograph, moment or tool"
            aria-controls="sv-find-list"
            aria-activedescendant={flat[activeIndex] ? `sv-find-${flat[activeIndex].id}` : undefined}
            role="combobox"
            aria-expanded="true"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd>esc</kbd>
        </div>
        <div className="sv-find__list" id="sv-find-list" role="listbox" aria-label="Results" aria-busy={supplementalItemsLoading} ref={listRef}>
          {sections.length ? (
            sections.map((section) => (
              <div key={section.group} className="sv-find__section" role="group" aria-label={section.group}>
                <p className="sv-find__heading">
                  <Icon name={GROUP_ICON[section.group]} size={13} />
                  {section.group}
                </p>
                {section.items.map((item) => {
                  running += 1;
                  const index = running;
                  return (
                    <button
                      key={item.id}
                      id={`sv-find-${item.id}`}
                      data-index={index}
                      type="button"
                      className={`sv-find__item${index === activeIndex ? " is-active" : ""}`}
                      onMouseMove={() => setActiveIndex(index)}
                      onClick={() => chooseItem(item)}
                      role="option"
                      aria-selected={index === activeIndex}
                      tabIndex={-1}
                    >
                      {item.thumb ? (
                        <img className="sv-find__thumb" src={item.thumb} alt="" loading="lazy" />
                      ) : (
                        <span className="sv-find__glyph">
                          <Icon name={item.icon ?? GROUP_ICON[groupOf(item)]} size={16} />
                        </span>
                      )}
                      <span className="sv-find__text">
                        <strong>{item.label}</strong>
                        <em>{item.meta}</em>
                      </span>
                      <i>{item.badge}</i>
                    </button>
                  );
                })}
              </div>
            ))
          ) : supplementalItemsLoading ? (
            <p className="sv-find__empty" role="status">
              Loading more destinations…
            </p>
          ) : (
            <p className="sv-find__empty">Nothing matches yet. Try a planet, a Messier number or a telescope.</p>
          )}
        </div>
        <footer className="sv-find__foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> move
          </span>
          <span>
            <kbd>↵</kbd> open
          </span>
          <span className="sv-find__foot-note">Places open in the universe · photographs open in Images</span>
        </footer>
      </div>
    </div>
  );
};

export default CommandPalette;
