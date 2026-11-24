# Nearby confirmed exoplanet catalogue

## Source contract

SkyMap uses a pinned snapshot of the NASA Exoplanet Archive Planetary Systems Composite Parameters table (`pscomppars`). The archive documents `PSCompPars` as one row per confirmed planet with comparatively complete composite parameters; it also warns that values in one row can originate from different literature references and may not form one self-consistent physical solution.

- TAP guide: https://exoplanetarchive.ipac.caltech.edu/docs/TAP/usingTAP.html
- PS/PSCompPars column definitions: https://exoplanetarchive.ipac.caltech.edu/docs/API_PS_columns.html
- composite-table caveat: https://exoplanetarchive.ipac.caltech.edu/docs/pscp_about.html
- required archive acknowledgment: https://exoplanetarchive.ipac.caltech.edu/docs/acknowledge.html

The deterministic selection predicate is:

```text
sy_dist is not null and ra is not null and dec is not null and sy_dist <= 100
```

The 2026-09-02 snapshot contains 1,568 confirmed planets around 1,056 hosts. It is not an occurrence-rate or completeness-limited population. Discovery methods, target selection, observing sensitivity, follow-up history and which systems have published distances all shape it.

`frontend/catalog-source/nasa-exoplanet-archive-nearby/source-receipt.json` records the exact TAP query, retrieval date, counts, source URLs and SHA-256 hashes. The compressed JSON snapshot is 189,531 bytes with SHA-256 `4b6e91917a3475e2e03f54109b0b4af0108b81c6fcdb487229e75f9d8fecad4f`. The retrieved acknowledgment page is 26,806 bytes with SHA-256 `f006c7fc22a68bf3c224f25e34f49decae716f4473a5af2e0b3b9372c4491f1c`.

The archive is credited as operated by Caltech under contract with NASA's Exoplanet Exploration Program. The receipt also preserves the archive's required acknowledgment and notes that parameter-level literature references and third-party rights remain with the originating sources.

## Build and runtime assets

`npm run catalog:exoplanets:build` groups rows by host name, verifies that every planet in a system has consistent host coordinates and distance, and writes:

- `/catalogs/exoplanets/manifest.json`;
- twelve 30-degree ICRS right-ascension sector files, `ra-00.json` through `ra-11.json`.

The manifest pins every sector's system count, planet count, byte length and SHA-256. The browser fetches the sectors in batches of three and verifies each complete response before parsing. A generic SkyMap cold load gives Gaia priority and begins the exoplanet stream after Gaia is ready and the browser has been idle for 1.5 seconds. An exoplanet deep link starts the exoplanet stream immediately.

The v2 builder also verifies the receipted Gaia source snapshot and performs an identifier-only host cross-match. Of 1,056 systems, 1,033 publish a `gaia_dr3_id`; 497 of those identifiers are exact members of SpaceViewer's current 100 pc / G <= 9 Gaia visualization subset. The remaining 536 identified hosts are outside that deliberately bright renderer subset, and 23 systems have no Gaia DR3 identifier in the pinned PSCompPars row. No nearest-neighbour identity is inferred.

Every exact match records the NASA identifier, Gaia source ID, both catalogue versions, the Gaia source hash, catalogue-position separation and the separate NASA/Gaia distance values. The largest coordinate separation in the pinned pair of snapshots is 5.197 arcseconds, below the 10-arcsecond validation ceiling; the high-proper-motion stars in the sample make a zero-separation requirement inappropriate across catalogue epochs. The cross-match establishes identity only. It does not replace the PSCompPars host position with Gaia's J2016.0 coordinate or claim that the composite archive distance and naive inverse-parallax distance are the same measurement.

This bounded 1,056-system layer remains a single shared GPU point field rather than creating a mesh per planet. Each system becomes one searchable `exoplanet-system` object. Host names, planet names and available Gaia/HIP/HD/TIC identifiers all participate in global search, so a query such as `TRAPPIST-1 e` resolves the `TRAPPIST-1 system` object without pretending to resolve the planet's orbit in the wide-field map.

Matched systems expose a related jump to the exact Gaia renderer host. The Gaia metadata builder guarantees all 497 linked sources as navigation records even when a source is outside that chunk's ordinary brightness-limited navigation slice. The reciprocal Gaia dossier carries the NASA Exoplanet Archive provenance and links back to the confirmed planetary system.

## Coordinates and visual semantics

The source RA and Dec are ICRS host coordinates. The source distance in parsecs is converted to a heliocentric ICRS Cartesian light-year vector and then passed through the existing 0.8 scene-units/light-year stellar projection. The direction and radius are physical for the published host position.

All confirmed planets around the same star share that host point. Planetary orbits are many orders of magnitude smaller than the SkyMap scale and are neither separated nor animated here. Available period, semi-major axis, radius, mass, equilibrium temperature, discovery method/year/facility and their published asymmetric uncertainties remain dossier metadata; missing values remain absent.

Host colour uses the existing stellar temperature/spectral-type point shader when those fields are available. Visual brightness uses the archive V magnitude when available. Neither colour nor brightness is presented as a direct planet observation.

## Verification

The continuation passes:

- source-receipt and generated-asset drift checks;
- full manifest, sector, count, coordinate, search-alias and selection-boundary unit coverage;
- 174/174 frontend tests, TypeScript, zero-error lint at the unchanged 50-warning baseline and production build;
- the full desktop/mobile Playwright smoke matrix, including exactly one manifest plus 12 sector requests, direct Proxima restoration, TRAPPIST-1 planet-name search, dossier boundaries and mobile overflow checks;
- headed 1280×720 and 390×844 inspection with one canvas, no Vite error overlay and no warning/error console entries.

## Continuation boundary

This layer is a confirmed-planet discovery map, not an occurrence-rate estimator and not a dynamically propagated multi-system orbital engine. Higher-value next steps are parameter-level literature links and a dedicated close-system representation that can display selected planetary orbits at an explicitly separate scale without distorting the stellar map.
