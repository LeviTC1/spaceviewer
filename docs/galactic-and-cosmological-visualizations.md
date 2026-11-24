# Galactic and cosmological visualizations

SkyMap supplies explicit bridge representations between its 15,448-source Gaia DR3 local stellar subset, a measured 199-source Milky Way tracer catalogue, a 117-object LVDB Local Group catalogue, curated more-distant landmarks, and a 22,648-galaxy DESI DR1 redshift light cone. The Milky Way distinguishes observations from fitted density cues, and the cosmological layer now distinguishes measured survey points from selection, distance-model, and display boundaries.

## Local Group physical-coordinate bridge

The Local Group layer uses the Local Volume Database `v1.1.1` combined catalogue. It retains physical heliocentric supergalactic directions, source distances, asymmetric uncertainties, hosts, references, and available motion fields. A declared logarithmic radial mapping compresses 10–1,400 kpc into 74–128 scene units; scene separations are therefore not a linear physical ruler. See `docs/local-group-catalog-and-projection.md` for the complete source and projection contract.

## Milky Way measured-tracer layer

The Galactic layer uses Reid et al. (2019), VizieR catalogue `J/ApJ/885/131`. The complete published table contains 199 high-mass star-forming regions measured through VLBI molecular-maser parallaxes. Each binary record retains ICRS position, parallax and uncertainty, east/north proper motions and uncertainties, LSR velocity and uncertainty, published arm code, references, and the deterministic ICRS-to-Galactic transform result.

- [VizieR catalogue J/ApJ/885/131](https://cdsarc.cds.unistra.fr/viz-bin/cat/J/ApJ/885/131), catalogue DOI `10.26093/cds/vizier.18850131`
- [Reid et al., ApJ 885, 131 (2019)](https://doi.org/10.3847/1538-4357/ab4a11)
- [VizieR rules of usage](https://cds.unistra.fr/vizier-org/licences_vizier.html)

The committed source receipt SHA-256-locks the VizieR `ReadMe`, `table1.dat`, `refs.dat`, and the retrieved usage-policy page. VizieR states that scientific use is free with explicit citation, while commercial use depends on the data origin. SpaceViewer therefore labels this `VizieR-scientific-use`; it does **not** claim a permissive commercial redistribution licence. Public commercial deployment requires a separate rights decision from the originating journal or rights holder.

### Selection and coordinate contract

- Selection is all 199 rows with positive published parallax and quoted uncertainty. SpaceViewer applies no scientific quality cut.
- This is a targeted VLBI high-mass-star-forming-region sample, not a complete star census or an unbiased Galactic-density survey.
- The builder uses the standard J2000 ICRS-to-Galactic rotation matrix and rejects a build unless the transformed coordinates reproduce the Galactic coordinates encoded in every source name to within 0.08 degrees.
- The arm model uses Reid et al. Table 2's `R0 = 8.15 kpc`. In the Galactocentric renderer, `+X` points from the centre toward the Sun, `+Y` toward Galactic longitude 90 degrees, and `+Z` toward Galactic north.
- Scene placement remains linearly scaled in kpc inside the Galactic volume; the Solar origin is not visually log-compressed.

### Measurements, fits, and uncertainty

Bright markers are the 199 measured sources at nominal reciprocal-parallax distances. Fine line segments show the reciprocal of parallax plus/minus one quoted sigma along the sightline. That span is a display diagnostic, not a Bayesian posterior; one source has a non-positive `parallax - sigma`, so its upper span is correctly marked unbounded in the manifest and visually capped at the catalogue display radius. Nine records with fractional parallax uncertainty at or above one third remain present and are counted explicitly.

Seven diffuse arm corridors use the central values from Reid et al. Table 2: 3-kpc (near), Norma, Scutum-Centaurus, Sagittarius-Carina, Local, Perseus, and Outer. They are sampled only across each fit's published Galactocentric-azimuth range. Their scatter uses the published intrinsic Gaussian 1-sigma width at the kink plus the paper's adopted `42 pc/kpc` radial width slope. Parameter errors are surfaced as marginal 1-sigma values; no covariance matrix was published, so the renderer does not manufacture a joint confidence envelope. Diffuse corridor points are fitted density cues, not additional observed sources.

### Binary and fallback contract

`frontend/public/catalogs/milky-way/tracers.svmw` is a 22 KB, versioned, SHA-256-verified binary with fixed 96-byte records and a null-terminated UTF-8 string table. `manifest.json` carries source receipts, selection, frame transform, field layout, uncertainty caveats, arm parameters, source counts, and licence boundary. Runtime fetch and decode happen only when the Galactic structure is mounted. While it loads, a low-opacity four-arm schematic is visibly labelled temporary; if fetch, checksum, header, or record validation fails, the UI reports the fallback rather than silently presenting it as measured data.

Rebuild and verify from `frontend`:

```bash
npm run catalog:milky-way:fetch
npm run catalog:milky-way:fetch:check
npm run catalog:milky-way:build
npm run catalog:milky-way:check
```

## DESI DR1 measured redshift light cone

The cosmological layer uses the official DESI DR1 `BGS_BRIGHT-21.5_NGC_clustering.dat.fits` LSS catalogue, version `iron/LSScats/v1.5`. DESI DR1 is released under CC BY 4.0 with required DESI attribution and acknowledgment. The source FITS, its published NGC `n(z)` table, and the retrieved DESI licence/acknowledgment page are pinned by byte length and SHA-256.

- [DESI DR1 release](https://data.desi.lbl.gov/doc/releases/dr1/)
- [DESI LSS clustering catalogue data model](https://desidatamodel.readthedocs.io/en/stable/DESI_ROOT/survey/catalogs/RELEASE/LSS/SPECPROD/LSScats/VERSION/data_clustering.html)
- [DESI 2024 II sample paper](https://doi.org/10.1088/1475-7516/2025/07/017)
- [DESI licence and acknowledgments](https://data.desi.lbl.gov/doc/acknowledgments/)

### Source sample and displayed selection

The source is the cosmology-analysis BGS sample: BGS Bright targets in `0.1 < z < 0.4`, with an evolution-corrected Fastspecfit r-band absolute-magnitude cut `M_r < -21.5`, LSS vetoes, and published analysis weights. The NGC FITS contains 217,614 records. SpaceViewer applies one additional rectangular display cut: ICRS `130° ≤ RA ≤ 250°`, `30° ≤ Dec ≤ 40°`, and `0.1 ≤ z ≤ 0.4`. Exactly 22,648 measured galaxies pass.

This is a narrow survey strip chosen to make walls, filaments, and voids visually legible. It is not a volume-complete census of all galaxies. Angular coverage, the magnitude cut, target selection, veto masks, fibre assignment, redshift success, and the DESI footprint remain part of the selection function. The binary retains `FRAC_TLOBS_TILES`, `WEIGHT_ZFAIL`, `WEIGHT_SYS`, combined `WEIGHT`, `WEIGHT_COMP`, `NX`, `WEIGHT_FKP`, `NTILE`, and `PHOTSYS`. Those analysis quantities are surfaced in the manifest but never used to duplicate points, change marker brightness, or fabricate structure.

### Coordinates, distance model, and uncertainty

ICRS RA/Dec and Redrock spectroscopic redshift are measured catalogue values. Radial comoving distance is inferred under a declared Planck 2018 baseline flat Lambda-CDM reference (`H0 = 67.4 km/s/Mpc`, `Omega_m = 0.315`, `Omega_Lambda = 0.685`) using the line-of-sight comoving-distance integral. A local tangent basis centred on RA 190°, Dec 35° and a linear `0.04 scene unit/Mpc` scale are display transforms only.

The view is therefore an observer-centred redshift-space map, not a set of independent standard-candle distances. Peculiar velocities create redshift-space distortions. The LSS clustering file does not publish per-object `ZERR`, so SpaceViewer draws no radial error bars and does not invent them. The published completeness/systematics weights are not per-object measurement probabilities. The layer is a measured-galaxy visualization, not a density-field estimator or a replacement for the full DESI window function, random catalogues, covariance, or precision clustering pipeline.

### Binary, LOD, and fallback contract

`frontend/public/catalogs/desi-lightcone/galaxies.svlc` is a 1.63 MB fixed-record binary. Its header, field layout, source/selected counts, cosmology, selection bounds, byte length, and SHA-256 are validated before use. Records are ordered by a deterministic SplitMix64 hash of `TARGETID`, so any leading prefix is a uniform catalogue LOD rather than a density-selected or newly generated population. Low renders 10,240 measured galaxies, Balanced 16,384, and High/Ultra all 22,648.

No nearest-neighbour edges, inferred filaments, smoothed density, or procedural galaxies appear in the normal view. The thin wire outline marks the declared angular/redshift selection volume. While the binary loads, or if integrity validation fails, only 32 sparse low-opacity procedural points appear and the HUD explicitly reports a schematic fallback.

Rebuild and verify from `frontend`:

```bash
npm run catalog:desi-lightcone:fetch
npm run catalog:desi-lightcone:fetch:check
npm run catalog:desi-lightcone:build
npm run catalog:desi-lightcone:check
```

## LOD and interaction

- The Milky Way volume appears in the wide field or when its object is directly selected; its measured binary then loads on demand.
- The DESI light cone appears only in the farthest overview or when directly selected; its binary then loads on demand.
- Low, Balanced, High, and Ultra tiers vary fitted-corridor density and the count of measured DESI records drawn. They do not change any retained coordinates, weights, IDs, or fitted central values.
- Both layers have stable object IDs, provenance records, filters, searchable aliases, and direct scale-rail routes.
- The renderer remains WebGL 2 compatible and uses typed buffer attributes; no per-particle React interaction handlers are created.

## Production continuation

1. Add catalogue-completeness context and richer uncertainty comparison for the Local Group population.
2. Add an optional DESI random-catalogue/window-function comparison if the product needs quantitative density interpretation; do not present the current point view as one.
3. Replace reciprocal-parallax display spans with a reviewed distance-inference product if scientifically useful, retaining the raw parallax and error.
4. Profile the volumes in a headed hardware-accelerated browser before raising density budgets.
