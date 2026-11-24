# Planetary atmosphere scattering

Solar Explorer now has two explicit atmosphere-rendering paths instead of presenting one generic halo as though it were a radiative-transfer model.

## Active model boundary

Earth and Mars use `generated-single-scattering-lut-v1`. A deterministic CPU precomputation integrates exponential molecular and aerosol density along spherical rays and uploads one small RGBA optical-depth table. The fragment shader reconstructs optical depth, applies RGB Rayleigh ratios, a Henyey-Greenstein aerosol phase term and the real scene Sun direction, then evaluates the table in constant time.

This is influenced by [Bruneton and Neyret's precomputed atmospheric-scattering method](https://doi.org/10.1111/j.1467-8659.2008.01245.x) and its [documented BSD reference implementation](https://ebruneton.github.io/precomputed_atmospheric_scattering/). It is not a port or claim of equivalent fidelity. SpaceViewer currently precomputes a compact single-scattering optical-depth table, not the reference model's full spectral multiple-scattering, irradiance, ozone and ground-coupling textures.

Venus, Jupiter, Saturn, Uranus and Neptune retain `sun-aware-analytic-limb-v1`. Their dossiers say that no reviewed body-specific radiative-transfer profile is mounted. Mercury and Pluto have no substantial atmosphere shell in the current material registry.

## Inputs and receipts

### Earth

The Earth table uses the reference implementation's published rendering parameterization:

- 8.0 km Rayleigh density scale;
- 1.2 km Mie/aerosol density scale;
- 60 km model top;
- `beta_R(lambda) = 1.24062e-6 lambda^-4 m^-1`, sampled at 680, 550 and 440 nm and converted to `0.005802`, `0.013558` and `0.0331 km^-1`;
- wavelength-independent Mie extinction derived from the reference `5.328e-3` column coefficient, 0.9 single-scattering albedo and `g = 0.8` phase asymmetry.

These are source-backed reference-renderer inputs. They are not live atmospheric observations or a weather state.

### Mars

The [JPL Mars propagation model](https://descanso.jpl.nasa.gov/propagation/mars/MarsPub020318.pdf) supplies an 11.1 km scale height and the surface number-density comparison used by the profile: `2.85e23 m^-3` for Mars versus `2.7e25 m^-3` for Earth. SpaceViewer scales the reference RGB molecular coefficients by that ratio.

The Mars table is deliberately labelled `density-scaled-provisional`. Mie/dust coefficients remain zero because the current repository has no controlled seasonal dust or aerosol phase-function product. The renderer does not claim CO2 refractivity, altitude/season variability, weather, or predictive radiance.

## Table construction

For each view-cosine and Sun-cosine sample, the builder integrates

`rho(h) = exp(-h / H)`

along a spherical ray from the modeled body or a representative scattering altitude to the top boundary. Rays that intersect the ground encode complete solar extinction. The table stores `1 - exp(-tau)` for:

1. view-path blue-reference molecular optical depth;
2. view-path aerosol optical depth;
3. Sun-path blue-reference molecular optical depth;
4. Sun-path aerosol optical depth.

The shader recovers `tau`, derives red/green molecular depth from the stored blue channel and computes phase-weighted single scattering. The table is a display asset derived from source-carrying parameters; scientific position, orientation and ephemeris state remain separate.

## Quality and lifecycle

| Tier | LUT size |
|---|---:|
| Low / mobile | 32 × 16 |
| Balanced | 64 × 32 |
| High | 96 × 48 |
| Ultra | 128 × 64 |

Tables are keyed by profile, radius and quality resolution in a module-level cache. A remount or camera frame reuses the same `DataTexture`; no geometry or table is regenerated per frame. Quality changes presentation sampling only and do not change physical profile inputs.

The selected-object dossier publishes the model ID, active size, physical-input receipt, sources and accuracy note. `window.__SPACEVIEWER_PERF__` separately reports the active model, profile status, table dimensions and mounted pass count for browser verification.

## Verification and continuation

Pure tests verify the reference values, Mars derivation boundary, deterministic byte output, stronger grazing columns, blocked night rays and the relative Earth/Mars optical depth. Browser smoke changes Low to High and verifies both the visible dossier and runtime work budget. Headed desktop and 390×844 inspection remain required for every shader change because a numerically valid table cannot prove a convincing limb.

Highest-value continuation:

1. replace provisional Mars molecular scaling with a controlled wavelength-dependent CO2/dust product;
2. add reviewed body-specific spectral profiles for Venus and the giant planets rather than reusing the terrestrial table;
3. add irradiance, ozone/absorption and multiple-scattering textures where profiling supports their visual value;
4. couple atmosphere shadows to the finite solar disc and reviewed oblateness/cloud inputs;
5. retain the analytic fallback for devices or bodies without a validated profile.
