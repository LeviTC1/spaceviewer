# Shared adaptive quality

SpaceViewer's Solar Explorer and SkyMap use the same four renderer profiles and the same bounded sustained-frame monitor. A new browser starts in `Auto`; choosing Ultra, High, Balanced or Low explicitly switches to `Manual override` and pauses automatic changes. The setting is visible on desktop and mobile.

## Runtime contract

Automatic mode starts from the device recommendation derived from viewport width, pointer type, reduced-motion preference, hardware concurrency and reported device memory. Each mounted 3D surface samples only frames the demand renderer actually produces. Sampling state lives in refs, so a frame does not cause a React render.

The monitor applies these frame-time budgets:

| Tier | Average frame-time budget |
| --- | ---: |
| Ultra | 20 ms |
| High | 24 ms |
| Balanced | 32 ms |
| Low | floor; no further reduction |

Each tier receives a 1.5-second warm-up followed by a minimum three-second measurement window. A reduction requires at least 20 rendered frames, average frame time over the tier budget, and at least 60% of sampled frames above 115% of that budget. Gaps over 250 ms are treated as tab suspension or scheduling interruption and ignored. A hidden tab resets the warm-up rather than manufacturing a slow-frame event.

A qualifying window reduces exactly one tier. The newly selected tier starts a fresh warm-up and can reduce again if sustained frame pressure continues. The system never automatically promotes quality: returning to a higher tier is an explicit named-tier choice, while switching from a manual tier back to `Auto` restarts from the current device recommendation.

## User control and persistence

- `Auto · <current tier>` enables the shared monitor.
- Selecting a named tier creates a manual override and disables both surface monitors.
- The status line reports monitoring, a measured reduction with observed FPS, or the active manual override.
- `spaceviewer.astro.quality.v2` stores only `{ mode, tier }` and is protected against unavailable or corrupt storage.
- The legacy v1 tier is migrated conservatively as a manual override so an existing explicit choice is never silently changed.

Runtime tier changes update the profile-driven DPR, catalogue/label/asteroid budgets, texture tier, shadows and procedural detail exposed by the mounted surface. WebGL context-creation attributes such as antialiasing and power preference take full effect on the next surface mount; the monitor does not force a disruptive canvas remount merely to change those attributes.

## Verification

`tests/adaptiveQuality.test.ts` covers healthy and sustained-slow streams, the Low floor, suspended-tab gaps, auto defaults, legacy migration and v2 parsing. The end-to-end smoke journey verifies that a manual High override persists through reload, selecting Auto resumes monitoring, and the quality control remains visible at phone width on both Solar Explorer and SkyMap.

The frame monitor is intentionally a degradation guard, not a benchmark. Headless/software-rendered FPS remains diagnostic and must not be presented as headed hardware performance.
