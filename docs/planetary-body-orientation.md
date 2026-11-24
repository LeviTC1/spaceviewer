# Planetary body orientation

Solar Explorer now derives the Sun, planet, Moon and Galilean body frames from published pole and prime-meridian conventions. Surface rotation is a deterministic function of the shared simulation timestamp; it is not accumulated from render-frame delta time.

## Sources and receipt

| Scope | Runtime source | Equations used |
|---|---|---|
| Sun, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune and Pluto | Archinal et al. (2018), *Report of the IAU Working Group on Cartographic Coordinates and Rotational Elements: 2015* | WGCCRE Tables 1 and 3: ICRF pole right ascension `alpha`, declination `delta`, and prime meridian `W`, including the published Mercury, Mars, Jupiter and Neptune periodic terms |
| Earth | IERS Conventions (2010), Technical Note 36 | Earth Rotation Angle, `theta = 2pi(0.7790572732640 + 1.00273781191135448 Du)` |
| Moon | NASA/JPL NAIF `pck00011.tpc` | `BODY3_NUT_PREC_ANGLES` and `BODY301_*`: the trigonometric text-PCK approximation to the lunar Mean Earth/Polar Axis frame (`IAU_MOON`) |
| Io, Europa, Ganymede and Callisto | NASA/JPL NAIF `pck00011.tpc`, principally sourced from WGCCRE 2015 | `BODY5_NUT_PREC_ANGLES` and `BODY501_*` through `BODY504_*`: ICRF pole and prime-meridian models with Jupiter-system periodic terms |

The WGCCRE report was retrieved from the USGS-hosted IAU working-group copy on 2026-09-02. The downloaded PDF SHA-256 was `4e446975d238b38aad5c1b4ed7ba6d62a4411d503fe5ebbd6100493a4ace7980`. The PDF is linked rather than redistributed. Runtime source links and the reference table locations are carried by every orientation result and appear in the Solar details panel.

NAIF's 27 December 2022 `pck00011.tpc` was retrieved on 2026-09-02. The 131,226-byte source had SHA-256 `3dff7b1dbeceaa01f25467767d3fa25816051c85d162d1edf04acb310ee28bb1`. `frontend/orientation-source/naif-pck00011.receipt.json` pins this identity and the selected kernel-variable scope; `frontend/public/orientation/satellites/manifest.json` is its generated browser-facing contract. The source kernel is linked rather than redistributed.

## Time and frame contract

The equations use the J2000 standard epoch, 2000-01-01 12:00:00 UTC in this browser implementation. WGCCRE and NAIF text-PCK `d` and `T` arguments formally use TDB; SpaceViewer evaluates them from the simulation UTC timestamp. Earth ERA formally uses UT1; SpaceViewer substitutes UTC and does not apply live Earth-orientation parameters, polar motion or precession-nutation. Those boundaries are visible in the object readout.

For each non-Earth body, the implementation constructs the WGCCRE equatorial node direction `Q` at right ascension `alpha + 90 degrees`, rotates it about the source pole by `W`, and obtains a complete right-handed body frame:

- local `+X`: prime-meridian direction;
- local `+Y`: source pole direction;
- local `+Z`: `X cross Y`.

Earth uses the ICRF `+X` direction as ERA zero in the deliberately precession/nutation-free approximation. The resulting ICRF vectors are rotated by the J2000 mean obliquity into ecliptic coordinates, then mapped into SpaceViewer's scene axes. The same frame feeds the rendered mesh, Solar diagnostics and SkyMap planet metadata.

## Rotation conventions

- Venus, Uranus and Pluto retain their negative recommended `W` rates and are reported as retrograde.
- Jupiter, Saturn and Uranus use the cited System III convention; visible cloud features can move at other rates.
- Neptune uses the WGCCRE optical atmospheric System II convention, not a rigid deep-interior solution.
- The Sun uses the nominal IAU prime meridian; latitude-dependent differential rotation is not resolved.
- Earth's Moon and the four Galilean moons combine controlled parent-relative analytical states with date-evaluated NAIF body frames. The Moon uses NAIF's `IAU_MOON` Mean Earth/Polar Axis text-PCK approximation; the Galileans include their published Jupiter-system periodic terms.
- Moons outside that controlled five retain approximate orbital positions and a fixed surface presentation. The object readout distinguishes this fallback from installed attitude models.

## Texture and accuracy boundary

The body frame is date anchored, but the bundled texture files have no recorded cartographic seam, longitude origin or transformation history. SpaceViewer therefore does not claim that a visible surface landmark lies on the computed model prime meridian. The details panel states this next to the current `W` or ERA value.

This is an orientation convention renderer, not a full SPICE attitude pipeline. NAIF specifically recommends binary lunar PCK and lunar frame kernels for higher-accuracy Moon orientation, and warns that generic natural-satellite models can change as observations improve. A future high-precision path should use versioned binary PCK/CK kernels, explicit time-scale conversion, Earth-orientation data and cartographically controlled texture products.

## Verification

Pure tests cover the planet, Moon and Galilean J2000 constants and periodic terms, forward/reverse determinism, retrograde sense, nominal periods, pole transforms, orthonormal body-frame construction, source metadata and UTC approximation notes. The deterministic manifest check rejects source-identity or body-scope drift. Browser smoke additionally checks the visible source readout and runtime diagnostics while a controlled body is selected.

```bash
cd frontend
npm run orientation:satellites:build
npm run orientation:satellites:check
```
