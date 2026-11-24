# OpenNGC deep-sky catalogue

## Source contract

SpaceViewer's galaxy, nebula and star-cluster context layer is derived from OpenNGC release `v20260501`, pinned to immutable Git commit `36cb178a0f69dba8bfc03a99c10512831edf1c6b`.

The reproducible fetch step stores and receipts:

- `NGC.csv`: 13,969 records; raw SHA-256 `840fe0c9ee1332e551b2e722a0e92726cd7b157914a3d2177602832aadd3aa9e`;
- `addendum.csv`: 64 records; raw SHA-256 `1d8f0914e643ada325a5a94d88d8fefad6a4937a2f77cc34f21483af22b11983`;
- the upstream README, field guide and complete CC BY-SA 4.0 licence text.

`frontend/catalog-source/openngc-v20260501/source-receipt.json` pins the download URLs, exact stored and uncompressed sizes, both hashes, release tag, commit, DOI, creator, retrieval date and source boundary. `npm run catalog:openngc:fetch:check` decompresses the snapshots, revalidates their hashes, schemas and record counts, and fails on drift.

OpenNGC documents that it merges fields from NED, HyperLEDA, SIMBAD, HEASARC and Harold Corwin's NGC/IC work. Source availability and precision therefore vary by object. SpaceViewer preserves the release and source-code field instead of presenting the result as one homogeneous survey.

## Deterministic selection

The builder accepts OpenNGC classes for galaxies, galaxy pairs/triplets/groups, planetary/diffuse/reflection/dark/emission nebulae, H II regions, supernova remnants, open/globular clusters and cluster-plus-nebula records. Every selected row must have finite J2000 RA/Dec and at least one of:

- a Messier cross-reference;
- preferred V magnitude, or B when V is absent, no fainter than 12;
- a major axis of at least 2 arcminutes.

Ten galaxy identities already represented by the physical LVDB Local Group layer are excluded by normalized NGC, IC or Messier identity. This prevents an angular-only OpenNGC marker from duplicating a better physical LVDB object.

The result is 3,004 objects from 14,033 source rows:

| Family | Objects |
|---|---:|
| Galaxies | 1,997 |
| Nebulae and remnants | 315 |
| Star clusters | 692 |

This selection is for useful all-sky display and search. It is not complete, volume-limited, magnitude-complete or statistically uniform. OpenNGC's contributing surveys, field availability, photometric bands and angular-size sources remain observable selection effects.

## Coordinate and distance semantics

OpenNGC supplies J2000 right ascension and declination but not a homogeneous physical distance for this selection. SpaceViewer therefore:

1. preserves RA/Dec and the J2000 reference in every object dossier;
2. converts direction to Cartesian renderer coordinates on a fixed 108-scene-unit sphere;
3. labels that placement `Measured J2000 direction · angular shell`;
4. reports distance as `Not supplied · angular catalogue`;
5. never interprets the shell radius as light-years, parsecs or radial ordering.

Explicit distance filters exclude angular-only OpenNGC records rather than silently treating missing distance as zero. The separate LVDB and DESI layers retain their own physical/log-radius and redshift-space contracts.

## Generated assets and runtime loading

`npm run catalog:openngc:build` emits one manifest plus 12 independent 30-degree J2000 right-ascension sectors in `frontend/public/catalogs/openngc/`. The manifest pins every sector's object/family counts, byte length and SHA-256. `npm run catalog:openngc:check` deterministically rebuilds all outputs in memory and fails if any committed byte is stale.

The browser requests three sectors at a time. Each response is checked for byte length and SHA-256 before JSON parsing, then validated for catalogue identity, J2000 bounds, licence marker, object IDs, types and family totals. A generic SkyMap session starts the OpenNGC stream three seconds after Gaia is ready; a direct `deep:` object URL starts immediately.

The renderer keeps high-importance landmarks as family-specific meshes and batches the remaining catalogue as selectable points. Search indexes names, Messier/NGC/IC identities, common names and a bounded identifier list. Existing landmark URLs such as `deep:nebula:orion-nebula` remain stable through explicit source cross-matches, while catalogue imagery remains a separate NASA-attributed editorial overlay.

## Licence and adaptation boundary

OpenNGC is licensed under Creative Commons Attribution-ShareAlike 4.0. The derived assets under `frontend/public/catalogs/openngc/` are filtered, normalized, classified and chunked adapted material and are offered under CC BY-SA 4.0 with OpenNGC/Mattia Verga contributor credit. The complete upstream licence text is stored beside the source receipt.

That ShareAlike statement applies to the OpenNGC-derived catalogue assets. It does not relicense unrelated SpaceViewer source code, NASA imagery or other independently sourced assets.

## Verification

Automated coverage validates the source/build contracts, exact 3,004-object and family totals, stable Orion route, 108-unit angular radius, absence of false distance, Local Group deduplication, source/distance filters, point-versus-mesh LOD and shared search registry. The full browser smoke suite requires one manifest plus 12 sector requests, a restored Orion dossier, visible selection/licence boundaries and mobile `M42` search.

The verified 2026-09-02 state passes TypeScript, 179 frontend tests, production build, zero-error lint at the existing 50-warning baseline and the complete desktop/mobile smoke matrix. In-app browser inspection at 1280×720 and 390×844 confirmed one canvas, no error overlay, no horizontal overflow, the exact catalogue HUD and the generated-manifest link.
