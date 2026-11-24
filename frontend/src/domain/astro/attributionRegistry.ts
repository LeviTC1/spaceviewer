export type AttributionReviewState = "verified" | "review-required";

export interface AttributionRecord {
  id: string;
  label: string;
  sourceUrl?: string;
  licenceLabel?: string;
  licenceUrl?: string;
  credit: string;
  reviewState: AttributionReviewState;
  notes?: string;
}

export const ATTRIBUTION_RECORDS: AttributionRecord[] = [
  {
    id: "vsop87-js",
    label: "VSOP87 JavaScript implementation",
    sourceUrl: "https://www.npmjs.com/package/vsop87",
    licenceLabel: "MIT",
    credit: "vsop87 package by G.C. Marty",
    reviewState: "verified",
    notes: "Licence verified from the installed package manifest for version 1.0.5.",
  },
  {
    id: "astronomy-engine-2.1.19",
    label: "Astronomy Engine analytical satellite ephemerides",
    sourceUrl: "https://github.com/cosinekitty/astronomy/releases/tag/v2.1.19",
    licenceLabel: "MIT",
    licenceUrl: "https://github.com/cosinekitty/astronomy/blob/v2.1.19/LICENSE",
    credit: "Astronomy Engine by Don Cross",
    reviewState: "verified",
    notes: "Exact package version, release commit, npm integrity and installed-file hashes are pinned in the generated satellite ephemeris manifest.",
  },
  {
    id: "imcce-l1.2-galilean",
    label: "IMCCE L1.2 Galilean satellite theory",
    sourceUrl: "https://ftp.imcce.fr/pub/ephem/satel/galilean/L1/L1.2/",
    licenceLabel: "Scientific theory with source citation",
    credit: "Institut de mécanique céleste et de calcul des éphémérides",
    reviewState: "verified",
    notes: "Astronomy Engine 2.1.19 implements this theory for jovicentric Io, Europa, Ganymede and Callisto state vectors; SpaceViewer does not redistribute the IMCCE source bundle.",
  },
  {
    id: "iau-wgccre-2015",
    label: "IAU WGCCRE 2015 rotational elements",
    sourceUrl: "https://astropedia.astrogeology.usgs.gov/download/Docs/WGCCRE/WGCCRE2015reprint.pdf",
    licenceLabel: "Scientific constants with source citation",
    credit: "Archinal et al. (2018), IAU Working Group on Cartographic Coordinates and Rotational Elements",
    reviewState: "verified",
    notes: "Tables 1 and 3 are transcribed as runtime equations; the source paper is linked and not redistributed.",
  },
  {
    id: "naif-pck00011",
    label: "NASA/JPL NAIF generic planetary constants kernel pck00011",
    sourceUrl: "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc",
    licenceLabel: "NASA/JPL scientific constants with source citation",
    credit: "NASA Navigation and Ancillary Information Facility, Jet Propulsion Laboratory",
    reviewState: "verified",
    notes: "The source version, full-file digest and transcribed Moon/Galilean orientation constants are pinned in the generated satellite-orientation manifest; the source kernel is linked and not redistributed.",
  },
  {
    id: "iers-conventions-2010",
    label: "IERS Conventions 2010 Earth Rotation Angle",
    sourceUrl: "https://iers-conventions.obspm.fr/conventions/content/tn36.pdf",
    licenceLabel: "Defining scientific constants with source citation",
    credit: "International Earth Rotation and Reference Systems Service",
    reviewState: "verified",
    notes: "The browser model uses UTC as an explicit approximation to UT1 and does not claim live EOP precision.",
  },
  {
    id: "iau-2015-nominal-solar-radius",
    label: "IAU 2015 nominal solar-radius conversion constant",
    sourceUrl: "https://www.iau.org/static/resolutions/IAU2015_English.pdf",
    licenceLabel: "Defining scientific conversion constant with source citation",
    credit: "International Astronomical Union Resolution B3",
    reviewState: "verified",
    notes: "Uses the exact 695,700 km nominal conversion factor; this is not presented as an instantaneous physical radius.",
  },
  {
    id: "nasa-eclipse-geometry",
    label: "NASA eclipse umbra and penumbra geometry",
    sourceUrl: "https://science.nasa.gov/eclipses/geometry/",
    licenceLabel: "Public scientific reference with source citation",
    credit: "NASA Science and NASA Goddard Space Flight Center",
    reviewState: "verified",
    notes: "Supports the finite apparent-disc umbra, antumbra and penumbra terminology; no NASA media is redistributed.",
  },
  {
    id: "nasa-saturn-ring-statistics",
    label: "NASA Saturnian Rings Fact Sheet",
    sourceUrl: "https://nssdc.gsfc.nasa.gov/planetary/factsheet/satringfact.html",
    licenceLabel: "Public scientific reference with source citation",
    credit: "NASA Goddard Space Flight Center / NSSDCA",
    reviewState: "verified",
    notes: "Supplies the main Saturn ring radii and representative optical-depth ranges; no source media is redistributed.",
  },
  {
    id: "nasa-cassini-ring-extent",
    label: "NASA Cassini mission ring extent FAQ",
    sourceUrl: "https://science.nasa.gov/mission/cassini/faq/",
    licenceLabel: "Public scientific reference with source citation",
    credit: "NASA Science / Cassini mission",
    reviewState: "verified",
    notes: "Supplies the cited mean outer extent of Saturn's F ring; no source media is redistributed.",
  },
  {
    id: "pds-uranus-ring-statistics",
    label: "NASA PDS Uranus ring statistics",
    sourceUrl: "https://pds-rings.seti.org/uranus/uranus_rings_table.html",
    licenceLabel: "Public scientific reference with source citation",
    credit: "NASA Planetary Data System Ring-Moon Systems Node",
    reviewState: "verified",
    notes: "Supplies the classical narrow-ring center radii, widths and representative optical depths; no source media is redistributed.",
  },
  {
    id: "nasa-image-library",
    label: "NASA Image and Video Library",
    sourceUrl: "https://images.nasa.gov/",
    licenceLabel: "NASA media usage guidelines",
    licenceUrl: "https://www.nasa.gov/nasa-brand-center/images-and-media/",
    credit: "NASA",
    reviewState: "verified",
    notes: "Individual items may carry additional credits or third-party restrictions; item metadata remains authoritative.",
  },
  {
    id: "nearby-stars-seed-v2",
    label: "SpaceViewer nearby-star seed",
    credit: "SpaceViewer curated seed data",
    reviewState: "review-required",
    notes: "Replace with a versioned Gaia/Hipparcos-derived build asset before describing this as a production catalogue.",
  },
  {
    id: "openngc-v20260501",
    label: "OpenNGC v20260501 deep-sky catalogue selection",
    sourceUrl: "https://github.com/mattiaverga/OpenNGC/tree/v20260501",
    licenceLabel: "CC BY-SA 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    credit: "OpenNGC by Mattia Verga and contributors; SpaceViewer filtered and adapted the catalogue",
    reviewState: "verified",
    notes: "Pinned to commit 36cb178a0f69dba8bfc03a99c10512831edf1c6b. Derived /catalogs/openngc assets carry the ShareAlike adaptation notice; catalogue directions use a non-physical angular shell.",
  },
  {
    id: "solar-texture-bundle",
    label: "Bundled Solar Explorer textures",
    credit: "Source review required",
    reviewState: "review-required",
    notes: "Do not publish an asset-origin claim until every texture has an adjacent source and usage record.",
  },
];

export class AttributionRegistry {
  private readonly byId = new Map(ATTRIBUTION_RECORDS.map((record) => [record.id, record]));

  get(id: string) {
    return this.byId.get(id) ?? null;
  }

  getReviewRequired() {
    return Array.from(this.byId.values()).filter((record) => record.reviewState === "review-required");
  }

  values() {
    return Array.from(this.byId.values());
  }
}

export const attributionRegistry = new AttributionRegistry();
