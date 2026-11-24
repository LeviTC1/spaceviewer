# IAU constellation-boundary overlay

SkyMap includes an optional all-sky guide derived from the International Astronomical Union's published J2000 constellation-boundary coordinates. It covers all 88 official constellation regions. Serpens is correctly retained as two disjoint source paths, so the source contains 89 region paths in total.

## Scientific boundary

The overlay represents official areas of the sky, not constellation artwork. The IAU defines a constellation as a bounded sky region and does not standardise one official set of stick-figure lines. SpaceViewer therefore renders only the region boundaries and does not invent connecting figures or redistribute the separate IAU/Sky & Telescope chart images.

The source vertices are right ascension and declination at J2000. The renderer converts those angular coordinates to J2000 equatorial Cartesian unit directions and places them on a sphere of radius 132 scene units. It does not relabel the published coordinate set as a time-propagated ICRS position. The radius has no physical distance meaning; it is an angular interface guide that keeps the boundary network visible around the staged multi-scale scene.

## Authoritative inputs

- IAU overview and per-constellation J2000 text files: [The Constellations](https://iauarchive.eso.org/public/themes/constellations/)
- Published catalogue record: [Davenhall & Leggett, Catalogue of Constellation Boundary Data, VizieR VI/49](https://cdsarc.cds.unistra.fr/viz-bin/cat/VI/49)
- Snapshot receipt: `frontend/catalog-source/iau-constellation-boundaries-j2000-v1.receipt.json`
- Reproducible source snapshot: `frontend/catalog-source/iau-constellation-boundaries-j2000-v1.json.gz`

The receipt records the official URL, retrieval time, per-file checksums, compressed and uncompressed checksums, path count, constellation count and source-vertex count. It deliberately makes no claim that public coordinate access grants rights to the separately presented chart artwork.

## Reproducible pipeline

Run these commands from `frontend`:

```bash
npm run catalog:constellations:fetch
npm run catalog:constellations:build
npm run catalog:constellations:check
```

`catalog:constellations:fetch` is the only networked step. It uses bounded concurrency and retry handling, validates every source line, normalises the `SER1` and `SER2` source labels to the official `SER` abbreviation while preserving the raw values, and writes the deterministic gzip snapshot and receipt.

`catalog:constellations:build` verifies both snapshot checksums and each original text checksum. It closes all 89 region paths, validates coordinate ranges, deduplicates shared undirected edges, interpolates long RA/Dec boundary segments at no more than 1.5 degrees per display step, and writes:

- `frontend/src/generated/constellationBoundaries.generated.json`;
- `frontend/public/catalogs/constellations/manifest.json`.

The current deterministic output contains 1,565 source vertices, 788 unique boundary edges, 776 shared edges and 4,189 rendered interpolation vertices. `catalog:constellations:check` rebuilds in memory and fails if either generated asset is stale.

## Runtime design

The layer is named **Constellation boundaries** and is off by default. It emits one passive line renderable backed by one typed position buffer rather than a React object or draw call per boundary. The renderer ignores raycasting, does not create searchable pseudo-objects, remains available when object filters are active, and culls beyond the all-sky camera band.

The layer-control description explicitly calls the display a J2000 symbolic angular guide. Time playback does not precess the boundary set; the published J2000 reference epoch remains visible in the catalogue metadata. A future epoch-aware overlay would need an explicit precession model and should remain separately selectable from the fixed published reference.
