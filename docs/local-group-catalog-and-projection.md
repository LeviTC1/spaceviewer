# Local Group catalogue and scene projection

SkyMap's Local Group layer is a deterministic 117-galaxy subset of the [Local Volume Database (LVDB)](https://github.com/apace7/local_volume_database) release `v1.1.1`. It replaces the former hand-staged Andromeda, Triangulum and Large Magellanic Cloud scene positions with physical heliocentric supergalactic directions and source distances. The original stable object IDs remain valid.

## Source contract

- Source asset: the release's recommended combined catalogue, `comb_all.csv`.
- Release: [`v1.1.1`, published 12 August 2026](https://github.com/apace7/local_volume_database/releases/tag/v1.1.1).
- Licence: [CC0 1.0](https://raw.githubusercontent.com/apace7/local_volume_database/main/LICENSE).
- Scientific overview: [Pace et al., *Research Notes of the AAS*, DOI 10.33232/001c.144859](https://doi.org/10.33232/001c.144859).
- Versioned archive: [Zenodo DOI 10.5281/zenodo.14076714](https://doi.org/10.5281/zenodo.14076714).

`npm run catalog:local-group:fetch` downloads the pinned release, validates required columns and the 1,727-row source count, normalizes line endings, writes a deterministic gzip snapshot, and records SHA-256 checksums plus provenance in a receipt. Ordinary builds never need the network.

`npm run catalog:local-group:build` verifies both source checksums, parses quoted CSV fields, applies the declared selection, validates that every selected supergalactic vector agrees with its source distance, and writes the generated application catalogue plus a public manifest. `npm run catalog:local-group:check` fails when either generated asset is stale.

## Selection

The application subset contains:

- confirmed real, confirmed galaxies in the LVDB Milky Way-satellite table;
- confirmed real, confirmed galaxies in the M31-satellite table;
- confirmed real, confirmed Local Group field galaxies with heliocentric distance at most 1,400 kpc;
- the LVDB M31 and M33 records.

The current deterministic result is 117 objects: 54 Milky Way satellites, 42 M31 satellites, 19 Local Group field galaxies, M31, and M33. The catalogue is not advertised as an all-galaxy Local Volume sample; it is the explicit Local Group visualization selection above.

## Coordinates, distances and uncertainty

The source `ra`/`dec` values are J2000 ICRS sky coordinates. LVDB's upstream pipeline uses Astropy to derive heliocentric supergalactic Cartesian `sg_xx`, `sg_yy` and `sg_zz` in kiloparsecs. SkyMap preserves those physical source values in each dossier together with:

- heliocentric distance and asymmetric distance errors;
- the distance method and reference key when present;
- host and membership classification;
- V-band apparent and absolute magnitude when present;
- stellar mass, radial velocity, and proper motion when present.

Blank fields remain unknown. Zero-valued uncertainty placeholders are normalized to unknown rather than presented as perfect measurements. Proper motion is displayed but not propagated through time.

## Renderer projection boundary

The Local Group is too large to combine linearly with the existing solar, nearby-star, and Milky Way overview in one usable camera range. The renderer therefore separates physical catalogue coordinates from scene projection:

1. Normalize the physical supergalactic vector to preserve its direction.
2. Map heliocentric radius logarithmically from 10–1,400 kpc into 74–128 scene units.
3. Multiply the preserved direction by that scene radius.

Objects below 10 kpc use a linear lead-in; the selected galaxy set begins at 21.58 kpc. Values beyond 1,400 kpc clamp at the documented visualization boundary. Scene-space separations and marker sizes are not physical scales and must not be interpreted as kiloparsecs. This disclosure is carried by the layer description, object dossier, and map-placement note.

M31, M33, LMC and SMC remain inspectable mesh landmarks. The remaining 113 galaxies share the point renderer, avoiding one React or draw-call path per dwarf galaxy. Search, source filtering, route history, related-host jumps, and direct object focus use the same canonical records.
