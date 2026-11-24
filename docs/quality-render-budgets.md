# Quality renderer work budgets

SpaceViewer has one authoritative quality profile per tier in `frontend/src/lib/rendering/qualityManager.ts`. Solar Explorer and SkyMap consume the same selected profile, so a quality change now alters concrete GPU and CPU work limits rather than only changing canvas pixel ratio or a display label.

## Shared profile matrix

| Work limit | Low / mobile | Balanced | High | Ultra |
|---|---:|---:|---:|---:|
| Gaia point budget | 8,000 | 28,000 | 70,000 | 120,000 |
| Background stars | 420 | 800 | 1,200 | 1,600 |
| Screen-space labels | 8 | 12 | 16 | 20 |
| Asteroid instances | 700 | 1,600 | 3,500 | 5,000 |
| Sun sphere segments | 28 | 40 | 56 | 64 |
| Planet sphere segments | 24 | 36 | 48 | 64 |
| Moon sphere segments | 16 | 24 | 32 | 40 |
| Atmosphere sphere segments | 18 | 28 | 40 | 48 |
| Atmosphere LUT width | 32 | 64 | 96 | 128 |
| Atmosphere LUT height | 16 | 32 | 48 | 64 |
| Planet orbit samples | 64 | 96 | 144 | 192 |
| Moon orbit samples | 48 | 72 | 96 | 128 |
| Selected-orbit trail samples | 24 | 34 | 48 | 64 |
| SkyMap mesh longitude segments | 20 | 28 | 36 | 48 |
| Milky Way fitted-corridor points | 1,200 | 2,400 | 3,800 | 5,200 |
| DESI measured galaxy points | 10,240 | 16,384 | 22,648 | 22,648 |
| Shadow-map edge | 256 | 512 | 1,024 | 2,048 |

The existing DPR, antialias, shadow-enable, texture-resolution, Gaia magnitude and performance-mode settings remain part of the same profiles. Shadow maps are allocated only on tiers where shadows are enabled. Asteroid mode and view-distance LOD may render fewer instances than the tier maximum.

## Runtime ownership

- Solar Explorer uses the profile for Sun, planet, moon and atmosphere tessellation; generated atmosphere-table resolution; planet/moon orbit sampling; selected-orbit trails; rings; background stars; asteroid capacity; catalogue points; and shadow-map resolution.
- SkyMap uses it for catalogue and background stars, collision-managed labels, landmark mesh tessellation, the Milky Way fitted-corridor population and deterministic prefixes of the DESI measured-galaxy catalogue. All 199 measured Milky Way tracers remain present at every tier; the DESI tier cap never creates or reweights a source.
- Structured `window.__SPACEVIEWER_PERF__` diagnostics publish the active tier and its relevant limits for browser verification. These values are diagnostic caps, not scientific measurements.
- Automatic degradation and manual selection both flow through the same profile object, avoiding a separate low-quality implementation path.

## Contract and scientific boundary

Every numeric work budget is finite, positive and monotonic from Low through Ultra. Automated tests enforce that ordering and verify that SkyMap label density is derived from the shared profile. Browser smoke switches both renderers between Low and High and checks the exact reported limits.

Quality changes presentation density, tessellation and maximum population. It does not change authoritative ephemerides, source coordinates, reference frames, timestamps, the 199 observed Milky Way tracers, or the physical meaning of catalogue data. Generated Milky Way arm-corridor particles remain disclosed fitted density cues. DESI LODs are stable hashed prefixes of 22,648 measured records; increasing the count reveals additional retained observations and never generates a galaxy or inferred filament.
