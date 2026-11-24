export interface SearchableCommandItem {
  id: string;
  label: string;
  meta: string;
  badge: string;
  keywords?: string;
}

export const normalizeCommandQuery = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const scoreCommandItem = (item: SearchableCommandItem, normalizedQuery: string) => {
  const label = normalizeCommandQuery(item.label);
  const unscopedLabel = label.replace(/^(skymap|solar explorer|solar) /, "");
  const badge = normalizeCommandQuery(item.badge);
  const metadata = normalizeCommandQuery([item.meta, item.keywords].filter(Boolean).join(" "));

  if (label === normalizedQuery) return 1_000;
  if (unscopedLabel === normalizedQuery) return 980;
  if (label.startsWith(normalizedQuery) || unscopedLabel.startsWith(normalizedQuery)) return 860;
  if (label.split(" ").some((token) => token.startsWith(normalizedQuery))) return 780;
  if (label.includes(normalizedQuery)) return 700;
  if (badge === normalizedQuery || badge.startsWith(normalizedQuery)) return 520;
  if (metadata.includes(normalizedQuery)) return 400;
  return 0;
};

/**
 * Ranks deterministic navigation targets before the open-ended imagery search.
 * Stable source order breaks ties so the primary Solar target can intentionally
 * precede its SkyMap representation.
 */
export const rankCommandItems = <T extends SearchableCommandItem>(items: T[], query: string): T[] => {
  const normalizedQuery = normalizeCommandQuery(query);
  if (!normalizedQuery) return [];

  return items
    .map((item, index) => ({ item, index, score: scoreCommandItem(item, normalizedQuery) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((entry) => entry.item);
};
