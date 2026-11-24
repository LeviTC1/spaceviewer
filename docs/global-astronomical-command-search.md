# Global astronomical command search

## Purpose

The app-wide Command palette is the instant navigation layer across SpaceViewer's renderer surfaces. It ranks known astronomical destinations ahead of the open-ended archive-imagery search, so pressing Enter on an object name moves to that object rather than silently changing the task into a Gallery query.

## Indexed targets

The command index includes:

- the Sun, planets, major moons, asteroid belt, four additional dwarf planets and five representative comets in Solar Explorer;
- the 55-record common-name stellar navigation seed in SkyMap;
- the curated high-importance deep-space targets already used for stable SkyMap navigation;
- the measured Milky Way structure and Solar-location targets;
- the measured DESI DR1 galaxy light-cone target.

Every target uses its canonical shareable route and the existing cross-renderer transition coordinator. Small-body aliases include JPL designations and orbit classes. Named-star results explicitly say `curated navigation seed`, preserving the catalogue review boundary.

The 67-target small-body/star/outer-domain supplement is a lazy production chunk requested on the first Command open. Existing modes, planets, moons and curated deep-space landmarks remain available from the app shell. While the supplement is loading, the palette exposes an accessible busy state and withholds the Gallery fallback so a fast Enter key cannot misroute an astronomical query.

## Ranking contract

`commandPaletteSearch.ts` normalizes punctuation and ranks matches in this order:

1. exact visible label;
2. exact label after a `SkyMap` or `Solar` scope prefix;
3. label prefix and word prefix;
4. label substring;
5. badge;
6. metadata, aliases and catalogue identifiers.

Stable source order breaks ties. Solar destinations intentionally precede their duplicated SkyMap representations. The ordinary archive-imagery search remains available as the last result for every non-empty query.

## Deliberate boundary

The app shell does not preload every Gaia, OpenNGC or NASA Exoplanet Archive sector merely to populate the Command palette. Their complete searchable navigation records load progressively inside SkyMap, where catalogue status and selection boundaries are visible. This keeps the initial command surface immediate and avoids turning a navigation action into a large hidden catalogue download.

## Verification

- Unit coverage pins exact-label priority, catalogue-alias matching and unrelated-query rejection.
- The browser smoke suite uses keyboard Enter—not a direct result click—for Halley's Comet and Sirius A, then asserts their canonical Solar and SkyMap routes.
- The phone-width smoke pass checks that a ranked Halley result is selected without horizontal overflow.
