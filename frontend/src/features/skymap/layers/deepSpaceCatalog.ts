import type { SceneVector3 } from "../core/coordinates";
import type { OpenNgcCatalogManifest, OpenNgcCatalogObject } from "../../../lib/catalog/openNgcCatalog";
import type {
  DeepSkyObjectClass,
  GalaxySkyObject,
  NebulaSkyObject,
  SkyObjectImportanceMetadata,
  StarClusterSkyObject,
} from "../core/objects";

export type DeepSpaceFamily = "galaxy" | "nebula" | "cluster";

export type DeepSpaceSkyObject = GalaxySkyObject | NebulaSkyObject | StarClusterSkyObject;

export interface DeepSpaceSeedObject {
  id: string;
  name: string;
  family: DeepSpaceFamily;
  objectClass: DeepSkyObjectClass;
  catalogIds: string[];
  aliases: string[];
  constellation: string;
  distanceLy: number;
  apparentMagnitude?: number;
  angularSizeArcMin?: number;
  scenePosition: Omit<SceneVector3, "unit" | "sourceFrame">;
  visual: {
    color: string;
    radiusSceneUnits: number;
    brightness: number;
    labelPriority: number;
    rotation?: [number, number, number];
  };
  facts: string[];
  discoveryBlurb?: string;
  observationContext?: string;
  relatedIds?: string[];
  importance?: SkyObjectImportanceMetadata;
  imagery?: {
    label: string;
    source: string;
    targetId?: string;
    previewUrl?: string;
    credit?: string;
    alt?: string;
  }[];
}

export const DEEP_SPACE_CATALOG_VERSION = "openngc-v20260501";

export const DEEP_SPACE_MAP_PLACEMENT_NOTE =
  "Measured OpenNGC J2000 direction projected on a fixed angular guide sphere; radial position is undefined and must not be read as physical distance.";

const nasaImagery = (
  label: string,
  targetId: string,
  previewUrl: string,
  alt: string,
  credit = "NASA Image and Video Library",
): NonNullable<DeepSpaceSeedObject["imagery"]> => [
  {
    label,
    source: "NASA Image and Video Library",
    targetId,
    previewUrl,
    credit,
    alt,
  },
];

const toObjectId = (family: DeepSpaceFamily, id: string) => `deep:${family}:${id}`;

const createDefaultImportance = (seed: DeepSpaceSeedObject): SkyObjectImportanceMetadata => {
  const visualScore = seed.visual.labelPriority * 0.55 + seed.visual.brightness * 28;
  const fameBoost = seed.imagery?.length ? 8 : 0;
  const nearbyBoost = seed.distanceLy < 2_000 ? 7 : seed.distanceLy < 100_000 ? 4 : 0;
  const score = Math.round(Math.max(42, Math.min(100, visualScore + fameBoost + nearbyBoost)));
  return {
    score,
    tier: score >= 90 ? "landmark" : score >= 74 ? "notable" : "context",
    reasons: [
      seed.family === "galaxy" ? "recognisable galaxy target" : seed.family === "nebula" ? "visually rich nebula target" : "notable cluster target",
      seed.imagery?.length ? "imagery-backed" : "catalog-backed",
    ],
  };
};

export const DEEP_SPACE_SEED_OBJECTS: DeepSpaceSeedObject[] = [
  {
    id: "andromeda-galaxy",
    name: "Andromeda Galaxy",
    family: "galaxy",
    objectClass: "barred-spiral-galaxy",
    catalogIds: ["M31", "NGC 224"],
    aliases: ["Andromeda", "M31"],
    constellation: "Andromeda",
    distanceLy: 2540000,
    apparentMagnitude: 3.44,
    angularSizeArcMin: 190,
    scenePosition: { x: -58, y: 24, z: -42 },
    visual: { color: "#b7c8ff", radiusSceneUnits: 4.9, brightness: 0.92, labelPriority: 99, rotation: [0.1, 0.25, -0.3] },
    facts: ["Nearest large galaxy to the Milky Way.", "Used here as a wide-field navigation anchor."],
    discoveryBlurb: "The nearest large galaxy and the map's clearest extragalactic anchor.",
    observationContext: "Best found as a broad, diffuse target in dark northern skies.",
    relatedIds: ["triangulum-galaxy", "large-magellanic-cloud"],
    importance: { score: 100, tier: "landmark", reasons: ["nearest large galaxy", "recognisable naked-eye target", "imagery-backed"] },
    imagery: nasaImagery(
      "Wide-field optical image",
      "PIA04921",
      "https://images-assets.nasa.gov/image/PIA04921/PIA04921~medium.jpg",
      "NASA image of the Andromeda Galaxy",
    ),
  },
  {
    id: "triangulum-galaxy",
    name: "Triangulum Galaxy",
    family: "galaxy",
    objectClass: "spiral-galaxy",
    catalogIds: ["M33", "NGC 598"],
    aliases: ["M33", "Pinwheel Galaxy"],
    constellation: "Triangulum",
    distanceLy: 2730000,
    apparentMagnitude: 5.72,
    angularSizeArcMin: 71,
    scenePosition: { x: -42, y: 10, z: -58 },
    visual: { color: "#9fd6ff", radiusSceneUnits: 3.4, brightness: 0.72, labelPriority: 80, rotation: [0.18, -0.1, 0.4] },
    facts: ["A Local Group spiral galaxy.", "The current placement is symbolic, not a physical Local Group transform."],
    discoveryBlurb: "A quieter Local Group spiral that pairs naturally with Andromeda.",
    relatedIds: ["andromeda-galaxy"],
  },
  {
    id: "whirlpool-galaxy",
    name: "Whirlpool Galaxy",
    family: "galaxy",
    objectClass: "spiral-galaxy",
    catalogIds: ["M51", "NGC 5194"],
    aliases: ["M51", "Whirlpool"],
    constellation: "Canes Venatici",
    distanceLy: 23000000,
    apparentMagnitude: 8.4,
    angularSizeArcMin: 11.2,
    scenePosition: { x: 64, y: 34, z: -38 },
    visual: { color: "#d7e4ff", radiusSceneUnits: 3.1, brightness: 0.62, labelPriority: 76, rotation: [-0.2, 0.45, 0.25] },
    facts: ["Famous interacting spiral system.", "Included as a deep-space search and focus target."],
    discoveryBlurb: "A textbook interacting spiral pair with strong visual identity.",
    relatedIds: ["pinwheel-galaxy"],
    imagery: nasaImagery(
      "Whirlpool Galaxy image",
      "PIA04230",
      "https://images-assets.nasa.gov/image/PIA04230/PIA04230~small.jpg",
      "NASA image of the Whirlpool Galaxy",
    ),
  },
  {
    id: "sombrero-galaxy",
    name: "Sombrero Galaxy",
    family: "galaxy",
    objectClass: "lenticular-galaxy",
    catalogIds: ["M104", "NGC 4594"],
    aliases: ["M104", "Sombrero"],
    constellation: "Virgo",
    distanceLy: 31100000,
    apparentMagnitude: 8,
    angularSizeArcMin: 8.7,
    scenePosition: { x: 52, y: -30, z: -62 },
    visual: { color: "#ffd9aa", radiusSceneUnits: 2.8, brightness: 0.56, labelPriority: 72, rotation: [0.04, 0.1, -0.7] },
    facts: ["Recognized for its bright nucleus and dust lane.", "Rendered as a symbolic disk marker in SkyMap v1."],
    discoveryBlurb: "A clean, memorable galaxy profile dominated by a dust-lane silhouette.",
    imagery: nasaImagery(
      "Sombrero Galaxy infrared image",
      "PIA15426",
      "https://images-assets.nasa.gov/image/PIA15426/PIA15426~medium.jpg",
      "NASA image of the Sombrero Galaxy",
    ),
  },
  {
    id: "large-magellanic-cloud",
    name: "Large Magellanic Cloud",
    family: "galaxy",
    objectClass: "irregular-galaxy",
    catalogIds: ["LMC"],
    aliases: ["LMC"],
    constellation: "Dorado / Mensa",
    distanceLy: 160000,
    apparentMagnitude: 0.9,
    angularSizeArcMin: 645,
    scenePosition: { x: -24, y: -46, z: -34 },
    visual: { color: "#c5f0ff", radiusSceneUnits: 4.2, brightness: 0.82, labelPriority: 86, rotation: [0.16, 0.25, 0.1] },
    facts: ["Satellite galaxy of the Milky Way.", "Distance is approximate; map placement is staged for overview readability."],
    discoveryBlurb: "A nearby satellite galaxy that helps bridge Milky Way context and deep-space scale.",
    relatedIds: ["tarantula-nebula", "andromeda-galaxy"],
  },
  {
    id: "bodes-galaxy",
    name: "Bode's Galaxy",
    family: "galaxy",
    objectClass: "spiral-galaxy",
    catalogIds: ["M81", "NGC 3031"],
    aliases: ["M81", "Bode Galaxy"],
    constellation: "Ursa Major",
    distanceLy: 11700000,
    apparentMagnitude: 6.9,
    angularSizeArcMin: 26.9,
    scenePosition: { x: 72, y: 22, z: -30 },
    visual: { color: "#cbdcff", radiusSceneUnits: 2.9, brightness: 0.64, labelPriority: 78, rotation: [0.08, 0.38, 0.18] },
    facts: ["Large spiral galaxy in the M81 Group.", "Paired with M82 as a useful discovery hop."],
    discoveryBlurb: "A bright nearby spiral that gives the galaxy layer more navigable structure.",
    relatedIds: ["cigar-galaxy", "whirlpool-galaxy"],
    imagery: nasaImagery(
      "M81 galaxy image",
      "PIA09579",
      "https://images-assets.nasa.gov/image/PIA09579/PIA09579~medium.jpg",
      "NASA image of M81",
    ),
  },
  {
    id: "cigar-galaxy",
    name: "Cigar Galaxy",
    family: "galaxy",
    objectClass: "irregular-galaxy",
    catalogIds: ["M82", "NGC 3034"],
    aliases: ["M82"],
    constellation: "Ursa Major",
    distanceLy: 12000000,
    apparentMagnitude: 8.4,
    angularSizeArcMin: 11.2,
    scenePosition: { x: 76, y: 18, z: -34 },
    visual: { color: "#ffcab1", radiusSceneUnits: 2.5, brightness: 0.58, labelPriority: 76, rotation: [0.2, 0.5, -0.55] },
    facts: ["Starburst galaxy in the M81 Group.", "Shown symbolically as a compact disturbed galaxy marker."],
    discoveryBlurb: "A dramatic starburst companion to Bode's Galaxy.",
    relatedIds: ["bodes-galaxy"],
    imagery: nasaImagery(
      "M82 galaxy image",
      "PIA04218",
      "https://images-assets.nasa.gov/image/PIA04218/PIA04218~medium.jpg",
      "NASA image of M82",
    ),
  },
  {
    id: "pinwheel-galaxy",
    name: "Pinwheel Galaxy",
    family: "galaxy",
    objectClass: "spiral-galaxy",
    catalogIds: ["M101", "NGC 5457"],
    aliases: ["M101"],
    constellation: "Ursa Major",
    distanceLy: 21000000,
    apparentMagnitude: 7.9,
    angularSizeArcMin: 28.8,
    scenePosition: { x: 48, y: 46, z: -72 },
    visual: { color: "#bfe3ff", radiusSceneUnits: 3.2, brightness: 0.6, labelPriority: 78, rotation: [-0.12, 0.28, 0.5] },
    facts: ["Large face-on spiral galaxy.", "Included as a high-value galaxy morphology target."],
    discoveryBlurb: "A face-on spiral that makes galaxy morphology legible without overloading the map.",
    relatedIds: ["whirlpool-galaxy"],
    imagery: nasaImagery(
      "Pinwheel Galaxy multiwavelength image",
      "PIA15630",
      "https://images-assets.nasa.gov/image/PIA15630/PIA15630~medium.jpg",
      "NASA image of the Pinwheel Galaxy",
    ),
  },
  {
    id: "southern-pinwheel-galaxy",
    name: "Southern Pinwheel Galaxy",
    family: "galaxy",
    objectClass: "barred-spiral-galaxy",
    catalogIds: ["M83", "NGC 5236"],
    aliases: ["M83"],
    constellation: "Hydra",
    distanceLy: 15000000,
    apparentMagnitude: 7.5,
    angularSizeArcMin: 12.9,
    scenePosition: { x: 30, y: -58, z: -72 },
    visual: { color: "#ffc7d7", radiusSceneUnits: 3.0, brightness: 0.61, labelPriority: 74, rotation: [0.1, -0.25, -0.35] },
    facts: ["Nearby barred spiral with active star formation.", "A southern-sky counterpart to the brighter northern galaxy anchors."],
    discoveryBlurb: "A southern spiral anchor with strong color and structure.",
    imagery: nasaImagery(
      "Southern Pinwheel image",
      "PIA13117",
      "https://images-assets.nasa.gov/image/PIA13117/PIA13117~medium.jpg",
      "NASA image of the Southern Pinwheel Galaxy",
    ),
  },
  {
    id: "orion-nebula",
    name: "Orion Nebula",
    family: "nebula",
    objectClass: "emission-nebula",
    catalogIds: ["M42", "NGC 1976"],
    aliases: ["M42", "Great Orion Nebula"],
    constellation: "Orion",
    distanceLy: 1344,
    apparentMagnitude: 4,
    angularSizeArcMin: 85,
    scenePosition: { x: 16, y: -18, z: -28 },
    visual: { color: "#9fffe5", radiusSceneUnits: 3.4, brightness: 0.86, labelPriority: 96 },
    facts: ["A nearby stellar nursery visible to the naked eye.", "Useful as a bridge between local stars and broader deep-sky targets."],
    discoveryBlurb: "A spectacular nearby stellar nursery and one of the strongest first stops in SkyMap.",
    observationContext: "Visible in Orion; a rare deep-sky object that is easy to locate.",
    relatedIds: ["horsehead-nebula", "pleiades"],
    importance: { score: 98, tier: "landmark", reasons: ["nearby stellar nursery", "naked-eye deep-sky target", "imagery-backed"] },
    imagery: nasaImagery(
      "Infrared Orion Nebula image",
      "PIA25434",
      "https://images-assets.nasa.gov/image/PIA25434/PIA25434~medium.jpg",
      "NASA infrared image of the Orion Nebula",
    ),
  },
  {
    id: "eagle-nebula",
    name: "Eagle Nebula",
    family: "nebula",
    objectClass: "emission-nebula",
    catalogIds: ["M16", "NGC 6611"],
    aliases: ["M16", "Pillars of Creation"],
    constellation: "Serpens",
    distanceLy: 7000,
    apparentMagnitude: 6,
    angularSizeArcMin: 35,
    scenePosition: { x: 42, y: 18, z: -46 },
    visual: { color: "#c9ff98", radiusSceneUnits: 3.2, brightness: 0.72, labelPriority: 88 },
    facts: ["Star-forming region associated with the Pillars of Creation.", "Rendered as a soft symbolic cloud marker."],
    discoveryBlurb: "Home of the Pillars of Creation, one of the most iconic Hubble views.",
    relatedIds: ["carina-nebula", "orion-nebula"],
    importance: { score: 96, tier: "landmark", reasons: ["Pillars of Creation", "star-forming region", "imagery-backed"] },
    imagery: nasaImagery(
      "Pillars of Creation image",
      "GSFC_20171208_Archive_e000842",
      "https://images-assets.nasa.gov/image/GSFC_20171208_Archive_e000842/GSFC_20171208_Archive_e000842~medium.jpg",
      "NASA image of the Pillars of Creation in the Eagle Nebula",
    ),
  },
  {
    id: "ring-nebula",
    name: "Ring Nebula",
    family: "nebula",
    objectClass: "planetary-nebula",
    catalogIds: ["M57", "NGC 6720"],
    aliases: ["M57"],
    constellation: "Lyra",
    distanceLy: 2567,
    apparentMagnitude: 8.8,
    angularSizeArcMin: 1.4,
    scenePosition: { x: 12, y: 42, z: -52 },
    visual: { color: "#8fe7ff", radiusSceneUnits: 2.1, brightness: 0.58, labelPriority: 70 },
    facts: ["Planetary nebula formed from a dying star's outer layers.", "Small angular size is represented symbolically."],
    discoveryBlurb: "A compact planetary nebula that adds variety beyond diffuse emission clouds.",
    imagery: nasaImagery(
      "Ring Nebula image",
      "GSFC_20171208_Archive_e001464",
      "https://images-assets.nasa.gov/image/GSFC_20171208_Archive_e001464/GSFC_20171208_Archive_e001464~small.jpg",
      "NASA image of the Ring Nebula",
    ),
  },
  {
    id: "crab-nebula",
    name: "Crab Nebula",
    family: "nebula",
    objectClass: "supernova-remnant",
    catalogIds: ["M1", "NGC 1952"],
    aliases: ["M1", "Crab"],
    constellation: "Taurus",
    distanceLy: 6500,
    apparentMagnitude: 8.4,
    angularSizeArcMin: 6,
    scenePosition: { x: -16, y: 30, z: -34 },
    visual: { color: "#ffb5a8", radiusSceneUnits: 2.5, brightness: 0.64, labelPriority: 82 },
    facts: ["Supernova remnant with an energetic pulsar.", "Static in this layer; expansion over time is deferred."],
    discoveryBlurb: "A compact remnant that brings high-energy history into the map.",
    observationContext: "The current layer keeps it static; expansion and pulsar behaviour are deferred.",
    importance: { score: 86, tier: "notable", reasons: ["supernova remnant", "pulsar host", "imagery-backed"] },
    imagery: nasaImagery(
      "Crab Nebula image",
      "PIA03606",
      "https://images-assets.nasa.gov/image/PIA03606/PIA03606~medium.jpg",
      "NASA composite image of the Crab Nebula",
    ),
  },
  {
    id: "lagoon-nebula",
    name: "Lagoon Nebula",
    family: "nebula",
    objectClass: "emission-nebula",
    catalogIds: ["M8", "NGC 6523"],
    aliases: ["M8"],
    constellation: "Sagittarius",
    distanceLy: 4100,
    apparentMagnitude: 6,
    angularSizeArcMin: 90,
    scenePosition: { x: 36, y: -8, z: -48 },
    visual: { color: "#ff9ecb", radiusSceneUnits: 3.7, brightness: 0.7, labelPriority: 74 },
    facts: ["Large star-forming region in Sagittarius.", "Included as a visible nebula layer target."],
    discoveryBlurb: "A broad, luminous star-forming region that rewards wide-field exploration.",
    imagery: nasaImagery(
      "Lagoon Nebula image",
      "GSFC_20171208_Archive_e001955",
      "https://images-assets.nasa.gov/image/GSFC_20171208_Archive_e001955/GSFC_20171208_Archive_e001955~medium.jpg",
      "NASA image of the Lagoon Nebula",
    ),
  },
  {
    id: "carina-nebula",
    name: "Carina Nebula",
    family: "nebula",
    objectClass: "emission-nebula",
    catalogIds: ["NGC 3372"],
    aliases: ["Cosmic Cliffs"],
    constellation: "Carina",
    distanceLy: 8500,
    apparentMagnitude: 1,
    angularSizeArcMin: 120,
    scenePosition: { x: -8, y: -64, z: -70 },
    visual: { color: "#ffcf88", radiusSceneUnits: 4.0, brightness: 0.84, labelPriority: 92 },
    facts: ["Huge star-forming region in the southern Milky Way.", "The current map represents it as a wide symbolic cloud."],
    discoveryBlurb: "JWST's Cosmic Cliffs make this one of the strongest imagery-led stops.",
    observationContext: "Best treated as a southern Milky Way landmark in this staged map.",
    relatedIds: ["eagle-nebula", "tarantula-nebula"],
    importance: { score: 97, tier: "landmark", reasons: ["JWST Cosmic Cliffs", "major star-forming region", "imagery-backed"] },
    imagery: nasaImagery(
      "JWST Cosmic Cliffs image",
      "carina_nebula",
      "https://images-assets.nasa.gov/image/carina_nebula/carina_nebula~medium.jpg",
      "NASA JWST image of the Cosmic Cliffs in the Carina Nebula",
    ),
  },
  {
    id: "horsehead-nebula",
    name: "Horsehead Nebula",
    family: "nebula",
    objectClass: "emission-nebula",
    catalogIds: ["Barnard 33", "IC 434"],
    aliases: ["B33"],
    constellation: "Orion",
    distanceLy: 1375,
    apparentMagnitude: 6.8,
    angularSizeArcMin: 8,
    scenePosition: { x: 20, y: -22, z: -30 },
    visual: { color: "#d7a07e", radiusSceneUnits: 2.3, brightness: 0.56, labelPriority: 78 },
    facts: ["Dark nebula silhouetted against emission nebulosity.", "Grouped near Orion as a contextual discovery target."],
    discoveryBlurb: "A silhouette landmark that adds a different kind of nebula to the map.",
    relatedIds: ["orion-nebula"],
    imagery: nasaImagery(
      "Horsehead Nebula image",
      "GSFC_20171208_Archive_e001518",
      "https://images-assets.nasa.gov/image/GSFC_20171208_Archive_e001518/GSFC_20171208_Archive_e001518~medium.jpg",
      "NASA image of the Horsehead Nebula",
    ),
  },
  {
    id: "tarantula-nebula",
    name: "Tarantula Nebula",
    family: "nebula",
    objectClass: "emission-nebula",
    catalogIds: ["30 Doradus", "NGC 2070"],
    aliases: ["30 Dor"],
    constellation: "Dorado",
    distanceLy: 160000,
    apparentMagnitude: 8,
    angularSizeArcMin: 40,
    scenePosition: { x: -30, y: -52, z: -38 },
    visual: { color: "#b2ffef", radiusSceneUnits: 3.2, brightness: 0.68, labelPriority: 82 },
    facts: ["Giant star-forming region in the Large Magellanic Cloud.", "Included to connect satellite-galaxy and nebula exploration."],
    discoveryBlurb: "A giant stellar nursery outside the Milky Way, nested conceptually with the LMC.",
    relatedIds: ["large-magellanic-cloud", "carina-nebula"],
    imagery: nasaImagery(
      "Tarantula Nebula image",
      "PIA05062",
      "https://images-assets.nasa.gov/image/PIA05062/PIA05062~small.jpg",
      "NASA image of the Tarantula Nebula",
    ),
  },
  {
    id: "dumbbell-nebula",
    name: "Dumbbell Nebula",
    family: "nebula",
    objectClass: "planetary-nebula",
    catalogIds: ["M27", "NGC 6853"],
    aliases: ["M27"],
    constellation: "Vulpecula",
    distanceLy: 1360,
    apparentMagnitude: 7.5,
    angularSizeArcMin: 8,
    scenePosition: { x: 18, y: 38, z: -44 },
    visual: { color: "#96ffe8", radiusSceneUnits: 2.2, brightness: 0.58, labelPriority: 68 },
    facts: ["One of the brightest planetary nebulae.", "Symbolic rendering keeps it inspectable without claiming resolved structure."],
    discoveryBlurb: "A classic planetary nebula and a clean comparison point for the Ring Nebula.",
    relatedIds: ["ring-nebula"],
    imagery: nasaImagery(
      "Dumbbell Nebula image",
      "PIA14417",
      "https://images-assets.nasa.gov/image/PIA14417/PIA14417~medium.jpg",
      "NASA image of the Dumbbell Nebula",
    ),
  },
  {
    id: "north-america-nebula",
    name: "North America Nebula",
    family: "nebula",
    objectClass: "emission-nebula",
    catalogIds: ["NGC 7000"],
    aliases: ["NGC 7000"],
    constellation: "Cygnus",
    distanceLy: 2590,
    apparentMagnitude: 4,
    angularSizeArcMin: 120,
    scenePosition: { x: 2, y: 52, z: -48 },
    visual: { color: "#ffb6d0", radiusSceneUnits: 3.5, brightness: 0.64, labelPriority: 72 },
    facts: ["Large emission nebula in Cygnus.", "Displayed as a wide-field cloud target."],
    discoveryBlurb: "A big, named nebula that rewards filter-led browsing.",
    imagery: nasaImagery(
      "North America Nebula image",
      "PIA13845",
      "https://images-assets.nasa.gov/image/PIA13845/PIA13845~medium.jpg",
      "NASA image of the North America Nebula",
    ),
  },
  {
    id: "pleiades",
    name: "Pleiades",
    family: "cluster",
    objectClass: "open-cluster",
    catalogIds: ["M45"],
    aliases: ["Seven Sisters", "M45"],
    constellation: "Taurus",
    distanceLy: 444,
    apparentMagnitude: 1.6,
    angularSizeArcMin: 110,
    scenePosition: { x: -22, y: 12, z: -24 },
    visual: { color: "#dfe9ff", radiusSceneUnits: 2.6, brightness: 0.88, labelPriority: 94 },
    facts: ["Nearby open cluster with bright blue stars.", "Mapped as a cluster halo rather than individual member stars."],
    discoveryBlurb: "A nearby open cluster with immediate visual recognition.",
    observationContext: "A strong local-cluster target before jumping outward to globular clusters.",
    importance: { score: 94, tier: "landmark", reasons: ["nearby open cluster", "naked-eye target", "imagery-backed"] },
    imagery: nasaImagery(
      "Pleiades infrared image",
      "PIA09262",
      "https://images-assets.nasa.gov/image/PIA09262/PIA09262~medium.jpg",
      "NASA image of the Pleiades",
    ),
  },
  {
    id: "beehive-cluster",
    name: "Beehive Cluster",
    family: "cluster",
    objectClass: "open-cluster",
    catalogIds: ["M44", "NGC 2632"],
    aliases: ["M44", "Praesepe"],
    constellation: "Cancer",
    distanceLy: 577,
    apparentMagnitude: 3.7,
    angularSizeArcMin: 95,
    scenePosition: { x: -34, y: -10, z: -20 },
    visual: { color: "#fff1c4", radiusSceneUnits: 2.4, brightness: 0.68, labelPriority: 72 },
    facts: ["Open cluster visible as a hazy patch under dark skies.", "Cluster member resolution is intentionally deferred."],
    discoveryBlurb: "A compact open-cluster stop that helps local cluster browsing feel less sparse.",
    relatedIds: ["pleiades"],
  },
  {
    id: "hercules-globular-cluster",
    name: "Hercules Globular Cluster",
    family: "cluster",
    objectClass: "globular-cluster",
    catalogIds: ["M13", "NGC 6205"],
    aliases: ["M13", "Great Globular Cluster in Hercules"],
    constellation: "Hercules",
    distanceLy: 22200,
    apparentMagnitude: 5.8,
    angularSizeArcMin: 20,
    scenePosition: { x: 28, y: 38, z: -58 },
    visual: { color: "#ffe2aa", radiusSceneUnits: 2.5, brightness: 0.66, labelPriority: 82 },
    facts: ["One of the best-known northern globular clusters.", "Currently rendered as a symbolic dense halo."],
    discoveryBlurb: "A classic globular cluster that gives the cluster layer a high-density anchor.",
    relatedIds: ["omega-centauri"],
    imagery: nasaImagery(
      "Messier 13 image",
      "GSFC_20171208_Archive_e001116",
      "https://images-assets.nasa.gov/image/GSFC_20171208_Archive_e001116/GSFC_20171208_Archive_e001116~small.jpg",
      "NASA image of Messier 13",
    ),
  },
  {
    id: "omega-centauri",
    name: "Omega Centauri",
    family: "cluster",
    objectClass: "globular-cluster",
    catalogIds: ["NGC 5139"],
    aliases: ["Omega Centauri", "NGC 5139"],
    constellation: "Centaurus",
    distanceLy: 15800,
    apparentMagnitude: 3.9,
    angularSizeArcMin: 36,
    scenePosition: { x: 12, y: -52, z: -60 },
    visual: { color: "#ffdca8", radiusSceneUnits: 2.9, brightness: 0.74, labelPriority: 80 },
    facts: ["Massive globular cluster visible from southern latitudes.", "A future catalog could resolve this into member-density structure."],
    discoveryBlurb: "A massive southern globular cluster that broadens the map beyond northern showpieces.",
    relatedIds: ["hercules-globular-cluster"],
    imagery: nasaImagery(
      "Omega Centauri infrared image",
      "PIA10372",
      "https://images-assets.nasa.gov/image/PIA10372/PIA10372~medium.jpg",
      "NASA image of Omega Centauri",
    ),
  },
];

const familyColor: Record<DeepSpaceFamily, string> = {
  galaxy: "#b7c8ff",
  nebula: "#9fffe5",
  cluster: "#ffe2aa",
};

const toAngularShellPosition = (record: OpenNgcCatalogObject, manifest: OpenNgcCatalogManifest) => {
  const radius = manifest.coordinates.angularShellRadiusSceneUnits;
  const ra = (record.raDeg * Math.PI) / 180;
  const dec = (record.decDeg * Math.PI) / 180;
  return {
    mode: "cartesian" as const,
    frame: "equatorial-j2000" as const,
    unit: "scene-unit" as const,
    x: radius * Math.cos(dec) * Math.cos(ra),
    y: radius * Math.cos(dec) * Math.sin(ra),
    z: radius * Math.sin(dec),
    epoch: { kind: "static" as const },
  };
};

const findEditorialSeed = (record: OpenNgcCatalogObject) =>
  DEEP_SPACE_SEED_OBJECTS.find((seed) => toObjectId(seed.family, seed.id) === record.id);

const recordToSkyObject = (
  record: OpenNgcCatalogObject,
  manifest: OpenNgcCatalogManifest,
): DeepSpaceSkyObject => {
  const seed = findEditorialSeed(record);
  const importance = seed?.importance ?? (seed ? createDefaultImportance(seed) : {
    score: record.importance,
    tier: record.importance >= 90 ? "landmark" as const : record.importance >= 74 ? "notable" as const : "context" as const,
    reasons: [record.messier ? "Messier cross-reference" : "OpenNGC selection", record.aliases.length > record.catalogIds.length ? "named catalogue object" : "catalogue object"],
  });
  const aliases = Array.from(new Set([...(seed?.aliases ?? []), ...record.aliases, ...record.catalogIds]));
  const relatedObjectIds = seed?.relatedIds?.map((id) => {
    const relatedSeed = DEEP_SPACE_SEED_OBJECTS.find((candidate) => candidate.id === id);
    return toObjectId(relatedSeed?.family ?? seed.family, id);
  });
  const base = {
    id: record.id,
    name: seed?.name ?? record.name,
    position: toAngularShellPosition(record, manifest),
    epoch: { kind: "static" as const },
    provenance: [{
      source: "OpenNGC",
      catalog: `OpenNGC ${manifest.catalog.version}`,
      sourceId: record.sourceName,
      retrievedAt: manifest.catalog.retrievedAt,
      confidence: "catalog" as const,
      url: manifest.catalog.releaseUrl,
    }],
    visual: {
      color: seed?.visual.color ?? familyColor[record.family],
      brightness: seed?.visual.brightness ?? Math.max(0.28, Math.min(0.82, 0.74 - ((record.apparentMagnitude ?? 11) - 6) * 0.035)),
      pointSize: seed?.visual.radiusSceneUnits ?? Math.max(0.66, Math.min(2.4, 0.7 + Math.log2((record.majorAxisArcMin ?? 1) + 1) * 0.22)),
      labelPriority: seed?.visual.labelPriority ?? record.importance,
    },
    search: {
      aliases,
      tags: ["deep-space", "OpenNGC", record.family, record.typeCode, record.typeLabel, record.constellation, ...record.catalogIds],
      description: `${record.typeLabel} in ${record.constellation}. OpenNGC ${manifest.catalog.version} J2000 catalogue direction; physical distance is not supplied by this layer.`,
      keywords: [seed?.name ?? record.name, record.typeLabel, record.objectClass.replace(/-/g, " "), record.constellation, ...aliases],
    },
    scientific: {
      objectClass: record.objectClass as DeepSkyObjectClass,
      redshift: record.redshift,
      angularSizeArcMin: record.majorAxisArcMin,
      minorAngularSizeArcMin: record.minorAxisArcMin,
      positionAngleDeg: record.positionAngleDeg,
      apparentMagnitude: record.apparentMagnitude,
      apparentMagnitudeBand: record.apparentMagnitudeBand,
      magnitudeB: record.magnitudeB,
      magnitudeV: record.magnitudeV,
      surfaceBrightness: record.surfaceBrightness,
      hubbleType: record.hubbleType,
      radialVelocityKmS: record.radialVelocityKmS,
      constellation: record.constellation,
      catalogIds: record.catalogIds,
      facts: [
        `${record.typeLabel} in ${record.constellation}, classified by OpenNGC ${manifest.catalog.version}.`,
        `J2000 catalogue direction RA ${record.raDeg.toFixed(5)}°, Dec ${record.decDeg.toFixed(5)}°; no homogeneous physical distance is inferred.`,
      ],
      imagery: seed?.imagery,
      discoveryBlurb: seed?.discoveryBlurb ?? `${record.typeLabel} from the integrity-checked OpenNGC ${manifest.catalog.version} selection.`,
      observationContext: seed?.observationContext,
      relatedObjectIds,
      mapPlacementNote: manifest.coordinates.placementBoundary,
      symbolRotation: seed?.visual.rotation,
      raDeg: record.raDeg,
      decDeg: record.decDeg,
      sourceRelease: manifest.catalog.version,
      coordinateConvention: manifest.coordinates.sourceFrame,
      manifestUrl: "/catalogs/openngc/manifest.json",
      selectionBoundary: manifest.selection.boundary,
      parameterBoundary: manifest.parameters.magnitudeRule,
      licenceBoundary: manifest.licence.adaptationNotice,
    },
    importance,
    time: {
      behavior: "static" as const,
      model: `OpenNGC-${manifest.catalog.version}-J2000-angular-catalogue`,
      note: "Static J2000 catalogue direction; proper motion and radial evolution are not propagated by this layer.",
    },
  };

  if (record.family === "galaxy") return { ...base, kind: "galaxy" };
  if (record.family === "nebula") return { ...base, kind: "nebula" };
  return { ...base, kind: "star-cluster" };
};

export const createDeepSpaceCatalog = (
  family: DeepSpaceFamily,
  records: readonly OpenNgcCatalogObject[] = [],
  manifest: OpenNgcCatalogManifest | null = null,
) => ({
  objects: manifest ? records.filter((record) => record.family === family).map((record) => recordToSkyObject(record, manifest)) : [],
  version: manifest?.catalog.version ?? DEEP_SPACE_CATALOG_VERSION,
});
