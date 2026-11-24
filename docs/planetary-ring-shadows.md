# Planetary ring geometry and shadows

SpaceViewer now treats Saturn and Uranus as source-carrying ring systems rather than applying one generic decorative annulus. The runtime keeps physical radii in kilometres and converts them to the presentation-scaled spherical body only at the renderer boundary.

## Source contract

- Saturn's D, C, B and A boundaries and representative normal optical depths come from the [NASA Saturnian Rings Fact Sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/satringfact.html). The [NASA Cassini mission FAQ](https://science.nasa.gov/mission/cassini/faq/) supplies the cited mean outer extent of the F ring.
- Uranus's nine classical narrow rings use the center radii, widths and representative optical depths in the [NASA PDS Ring-Moon Systems Node table](https://pds-rings.seti.org/uranus/uranus_rings_table.html).
- The finite solar-disc softening uses the exact IAU 2015 nominal solar-radius conversion constant already registered by the eclipse model.

Every record keeps its source URL, credit and an explicit accuracy note. Saturn's local colour/alpha strip remains hash-inventoried but has unresolved original-source and redistribution metadata, so the code does not claim that texture as a reviewed scientific product.

## Geometry and light transmission

The ring plane is the equatorial `x-z` plane of the date-evaluated body-fixed frame. Two complementary shader paths share the same radial profile:

1. **Planet onto rings.** Each ring fragment traces toward the heliocentric Sun and evaluates the closest approach to the spherical planet. The physical solar angular radius creates a penumbral transition rather than a fixed painted edge.
2. **Rings onto planet.** Each sunlit surface fragment traces toward the Sun, intersects the equatorial plane and samples the radial ring profile. Normal optical depth is converted to a longer slant-path transmission at shallow solar elevation. Five bounded radial samples approximate finite-disc softening.

The model is deterministic at a selected simulation time and uses no scene-scale distances to calculate solar angular size. The overlay is depth-tested, pointer-passive and does not write depth.

## Rendering and LOD

- Saturn uses its existing one-dimensional colour/alpha strip when that streamed texture is resident; a sourced broad-band profile is the immediate fallback.
- Uranus uses a procedural nine-band profile because the repository contains no reviewed Uranian ring texture. Narrow physical widths remain in the data; shader feathering only antialiases their screen presentation.
- Ultra, High and Balanced enable the planet-received surface pass. Low/mobile keeps the ring geometry and its analytic planet shadow but removes the extra spherical overlay draw.
- The surface pass mounts only when a ringed planet is selected or near the camera. Runtime diagnostics expose the model ID, selected ring-system ID and quality state.

## Scientific boundary

The renderer intentionally models a spherical planet and an infinitesimally thin, coplanar ring sheet. It does not yet model planetary oblateness, vertical ring thickness, self-shadowing, multiple scattering, wavelength-dependent optical depth, time-variable ring structure or the extremely faint outer Uranian Nu and Mu rings. The diffuse Uranian Zeta material is also omitted. These limitations are visible in the object dossier.

## Verification

Pure tests cover source records, the nine classical Uranian bands, ray/plane intersection, slant-path transmission and fixed-size shader profiles. Browser smoke opens Saturn at a fixed date, checks the visible source/model readout and runtime diagnostics, switches to Low/mobile and confirms that only the surface pass is disabled. Headed desktop inspection verifies the focused Saturn geometry and visible planet/ring occlusion; Uranus is checked separately for its narrow dark ring profile.
