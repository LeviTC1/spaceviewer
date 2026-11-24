export type SmallBodyId =
  | "ceres"
  | "haumea"
  | "eris"
  | "makemake"
  | "halley"
  | "encke"
  | "67p"
  | "swift-tuttle"
  | "hale-bopp";

export type SmallBodyKind = "dwarf-planet" | "comet";

export interface SmallBodyOsculatingElements {
  epochJulianDateTdb: number;
  equinox: "J2000";
  semiMajorAxisAu: number;
  eccentricity: number;
  perihelionAu: number;
  aphelionAu: number;
  inclinationDeg: number;
  longitudeOfAscendingNodeDeg: number;
  argumentOfPerihelionDeg: number;
  meanAnomalyAtEpochDeg: number;
  meanMotionDegPerDay: number;
  orbitalPeriodDays: number;
}

export interface SmallBodySourceReceipt {
  provider: "NASA/JPL Small-Body Database";
  designation: string;
  spkId: string;
  orbitClassCode: string;
  orbitClassName: string;
  orbitSolutionId: string;
  lastObservationDate: string;
  dataArcDays: number;
  queryUrl: string;
  upstreamCanonicalJsonSha256: string;
  retrievedAtUtc: string;
}

export interface SmallBodyDef {
  id: SmallBodyId;
  name: string;
  catalogName: string;
  kind: SmallBodyKind;
  radiusKm: number;
  radiusBasis: string;
  radiusSourceUrl: string;
  colorHint: string;
  aliases: string[];
  searchQuery: string;
  facts: string[];
  shapeNote?: string;
  orbit: SmallBodyOsculatingElements;
  source: SmallBodySourceReceipt;
}

const RETRIEVED_AT_UTC = "2026-09-02T12:54:26Z";
const NASA_DWARF_SIZE_SOURCE =
  "https://science.nasa.gov/solar-system/planet-sizes-and-locations-in-our-solar-system/";

export const SMALL_BODY_SOURCE_MANIFEST_HREF = "/data/solar/small-bodies/source-manifest.json";

export const SMALL_BODIES: SmallBodyDef[] = [
  {
    id: "ceres",
    name: "Ceres",
    catalogName: "1 Ceres",
    kind: "dwarf-planet",
    radiusKm: 469.7,
    radiusBasis: "Half the 939.4 km JPL SBDB diameter",
    radiusSourceUrl: "https://ssd-api.jpl.nasa.gov/sbdb.api?des=1&phys-par=1&full-prec=1&cd-epoch=1",
    colorHint: "#a9a39b",
    aliases: ["1 Ceres", "A801 AA", "dwarf planet", "main belt"],
    searchQuery: "Ceres Dawn dwarf planet",
    facts: [
      "The only officially recognized dwarf planet in the inner solar system.",
      "NASA's Dawn spacecraft entered orbit around Ceres in 2015.",
    ],
    orbit: {
      epochJulianDateTdb: 2461200.5,
      equinox: "J2000",
      semiMajorAxisAu: 2.765552595034094,
      eccentricity: 0.07969229514816586,
      perihelionAu: 2.545159361382861,
      aphelionAu: 2.985945828685327,
      inclinationDeg: 10.58802780183462,
      longitudeOfAscendingNodeDeg: 80.24862682043221,
      argumentOfPerihelionDeg: 73.29421453021587,
      meanAnomalyAtEpochDeg: 274.4193463761342,
      meanMotionDegPerDay: 0.21430445064843,
      orbitalPeriodDays: 1679.853119758983,
    },
    source: {
      provider: "NASA/JPL Small-Body Database",
      designation: "1",
      spkId: "20000001",
      orbitClassCode: "MBA",
      orbitClassName: "Main-belt Asteroid",
      orbitSolutionId: "48",
      lastObservationDate: "2021-01-28",
      dataArcDays: 9520,
      queryUrl: "https://ssd-api.jpl.nasa.gov/sbdb.api?des=1&phys-par=1&full-prec=1&cd-epoch=1",
      upstreamCanonicalJsonSha256: "b635050217477a9fe4bbeda801577c31e0bb89c81446a7c5c47a1a720b18c6c4",
      retrievedAtUtc: RETRIEVED_AT_UTC,
    },
  },
  {
    id: "haumea",
    name: "Haumea",
    catalogName: "136108 Haumea",
    kind: "dwarf-planet",
    radiusKm: 870,
    radiusBasis: "Half the approximately 1,740 km NASA equatorial diameter",
    radiusSourceUrl: NASA_DWARF_SIZE_SOURCE,
    colorHint: "#dad9d3",
    aliases: ["136108 Haumea", "2003 EL61", "dwarf planet", "Kuiper belt"],
    searchQuery: "Haumea dwarf planet",
    facts: [
      "Fast rotation gives Haumea an elongated, oval shape.",
      "NASA lists an equatorial diameter of about 1,740 kilometres.",
    ],
    shapeNote:
      "The source diameter is equatorial. The current marker is a softly elongated presentation glyph, not a recovered shape model.",
    orbit: {
      epochJulianDateTdb: 2461200.5,
      equinox: "J2000",
      semiMajorAxisAu: 43.06029023650952,
      eccentricity: 0.1944430148898797,
      perihelionAu: 34.68751758088936,
      aphelionAu: 51.43306289212968,
      inclinationDeg: 28.20847393040364,
      longitudeOfAscendingNodeDeg: 121.7860561329425,
      argumentOfPerihelionDeg: 240.6905472508661,
      meanAnomalyAtEpochDeg: 223.2104118812299,
      meanMotionDegPerDay: 0.003488097731816818,
      orbitalPeriodDays: 103208.1173403618,
    },
    source: {
      provider: "NASA/JPL Small-Body Database",
      designation: "136108",
      spkId: "20136108",
      orbitClassCode: "TNO",
      orbitClassName: "Trans-Neptunian Object",
      orbitSolutionId: "132",
      lastObservationDate: "2026-04-14",
      dataArcDays: 25956,
      queryUrl: "https://ssd-api.jpl.nasa.gov/sbdb.api?des=136108&phys-par=1&full-prec=1&cd-epoch=1",
      upstreamCanonicalJsonSha256: "d191a7c0ffe77de4d70c6a021f83c70d09c78be23ebd0efa46e5f25ad046b7a3",
      retrievedAtUtc: RETRIEVED_AT_UTC,
    },
  },
  {
    id: "eris",
    name: "Eris",
    catalogName: "136199 Eris",
    kind: "dwarf-planet",
    radiusKm: 1163,
    radiusBasis: "Half the approximately 2,326 km NASA equatorial diameter",
    radiusSourceUrl: NASA_DWARF_SIZE_SOURCE,
    colorHint: "#d8dbe0",
    aliases: ["136199 Eris", "2003 UB313", "Xena", "dwarf planet", "scattered disc"],
    searchQuery: "Eris dwarf planet Dysnomia",
    facts: [
      "Eris is the second-largest officially recognized dwarf planet by diameter.",
      "Its highly inclined orbit carries it far beyond the main Kuiper belt.",
    ],
    orbit: {
      epochJulianDateTdb: 2461200.5,
      equinox: "J2000",
      semiMajorAxisAu: 67.93394687853566,
      eccentricity: 0.4382385347971672,
      perihelionAu: 38.16267353549761,
      aphelionAu: 97.70522022157373,
      inclinationDeg: 43.9258279471791,
      longitudeOfAscendingNodeDeg: 36.00477044417249,
      argumentOfPerihelionDeg: 150.7949235840312,
      meanAnomalyAtEpochDeg: 211.774434275007,
      meanMotionDegPerDay: 0.001760247770619088,
      orbitalPeriodDays: 204516.6629430732,
    },
    source: {
      provider: "NASA/JPL Small-Body Database",
      designation: "136199",
      spkId: "20136199",
      orbitClassCode: "TNO",
      orbitClassName: "Trans-Neptunian Object",
      orbitSolutionId: "103",
      lastObservationDate: "2026-02-06",
      dataArcDays: 26089,
      queryUrl: "https://ssd-api.jpl.nasa.gov/sbdb.api?des=136199&phys-par=1&full-prec=1&cd-epoch=1",
      upstreamCanonicalJsonSha256: "94a20dca7c774c283b5a230cb24e58d02c1bde21ac6f22e4e97c5fbc617f9520",
      retrievedAtUtc: RETRIEVED_AT_UTC,
    },
  },
  {
    id: "makemake",
    name: "Makemake",
    catalogName: "136472 Makemake",
    kind: "dwarf-planet",
    radiusKm: 717,
    radiusBasis: "Half the approximately 1,434 km NASA equatorial diameter",
    radiusSourceUrl: NASA_DWARF_SIZE_SOURCE,
    colorHint: "#b58b76",
    aliases: ["136472 Makemake", "2005 FY9", "dwarf planet", "Kuiper belt"],
    searchQuery: "Makemake dwarf planet",
    facts: [
      "Makemake is one of the five officially recognized dwarf planets.",
      "NASA lists an equatorial diameter of about 1,434 kilometres.",
    ],
    orbit: {
      epochJulianDateTdb: 2461200.5,
      equinox: "J2000",
      semiMajorAxisAu: 45.57093317300052,
      eccentricity: 0.1588889953992523,
      perihelionAu: 38.33021338173601,
      aphelionAu: 52.81165296426503,
      inclinationDeg: 29.02785603743067,
      longitudeOfAscendingNodeDeg: 79.2948338209406,
      argumentOfPerihelionDeg: 297.0922733397207,
      meanAnomalyAtEpochDeg: 169.9379962048232,
      meanMotionDegPerDay: 0.003203850120050116,
      orbitalPeriodDays: 112364.8068762869,
    },
    source: {
      provider: "NASA/JPL Small-Body Database",
      designation: "136472",
      spkId: "20136472",
      orbitClassCode: "TNO",
      orbitClassName: "Trans-Neptunian Object",
      orbitSolutionId: "130",
      lastObservationDate: "2026-04-05",
      dataArcDays: 25999,
      queryUrl: "https://ssd-api.jpl.nasa.gov/sbdb.api?des=136472&phys-par=1&full-prec=1&cd-epoch=1",
      upstreamCanonicalJsonSha256: "ee8b2e89931e4125397d6a1f343e3ae039978b6b435ea9e905f36cb714038ffe",
      retrievedAtUtc: RETRIEVED_AT_UTC,
    },
  },
  {
    id: "halley",
    name: "Halley's Comet",
    catalogName: "1P/Halley",
    kind: "comet",
    radiusKm: 5.5,
    radiusBasis: "Half the 11.0 km JPL SBDB nucleus diameter",
    radiusSourceUrl: "https://ssd-api.jpl.nasa.gov/sbdb.api?des=1P&phys-par=1&full-prec=1&cd-epoch=1&cd-tp=1",
    colorHint: "#d9e2df",
    aliases: ["1P", "1P/Halley", "Halley", "Halley's comet", "comet"],
    searchQuery: "1P Halley comet",
    facts: ["JPL classifies 1P/Halley as a Halley-type comet.", "The SBDB physical record lists an 11 km nucleus diameter."],
    orbit: {
      epochJulianDateTdb: 2439875.5,
      equinox: "J2000",
      semiMajorAxisAu: 17.92863504856923,
      eccentricity: 0.9679359956953211,
      perihelionAu: 0.5748638313743413,
      aphelionAu: 35.28240626576412,
      inclinationDeg: 162.1905300439129,
      longitudeOfAscendingNodeDeg: 59.09894720612437,
      argumentOfPerihelionDeg: 112.2414314637764,
      meanAnomalyAtEpochDeg: 274.3823371366792,
      meanMotionDegPerDay: 0.01298324443268444,
      orbitalPeriodDays: 27728.04608790421,
    },
    source: {
      provider: "NASA/JPL Small-Body Database",
      designation: "1P",
      spkId: "1000036",
      orbitClassCode: "HTC",
      orbitClassName: "Halley-type Comet",
      orbitSolutionId: "75",
      lastObservationDate: "1994-01-11",
      dataArcDays: 57852,
      queryUrl: "https://ssd-api.jpl.nasa.gov/sbdb.api?des=1P&phys-par=1&full-prec=1&cd-epoch=1&cd-tp=1",
      upstreamCanonicalJsonSha256: "8e540f6a2fd146042b5fa5156eb9bcdb0ed834231e0291acc0a60e325b67371a",
      retrievedAtUtc: RETRIEVED_AT_UTC,
    },
  },
  {
    id: "encke",
    name: "Comet Encke",
    catalogName: "2P/Encke",
    kind: "comet",
    radiusKm: 2.4,
    radiusBasis: "Half the 4.8 km JPL SBDB nucleus diameter",
    radiusSourceUrl: "https://ssd-api.jpl.nasa.gov/sbdb.api?des=2P&phys-par=1&full-prec=1&cd-epoch=1&cd-tp=1",
    colorHint: "#c9d7d1",
    aliases: ["2P", "2P/Encke", "Encke", "comet"],
    searchQuery: "2P Encke comet",
    facts: ["JPL classifies 2P/Encke as an Encke-type comet.", "The SBDB physical record lists a 4.8 km nucleus diameter."],
    orbit: {
      epochJulianDateTdb: 2459891.5,
      equinox: "J2000",
      semiMajorAxisAu: 2.219671347799601,
      eccentricity: 0.8475034197640028,
      perihelionAu: 0.3384922897872659,
      aphelionAu: 4.100850405811936,
      inclinationDeg: 11.3868073505599,
      longitudeOfAscendingNodeDeg: 334.1498910332493,
      argumentOfPerihelionDeg: 187.1740630668253,
      meanAnomalyAtEpochDeg: 256.1941744229795,
      meanMotionDegPerDay: 0.2980376015666619,
      orbitalPeriodDays: 1207.901278589101,
    },
    source: {
      provider: "NASA/JPL Small-Body Database",
      designation: "2P",
      spkId: "1000025",
      orbitClassCode: "ETc",
      orbitClassName: "Encke-type Comet",
      orbitSolutionId: "K273/11",
      lastObservationDate: "2026-08-24",
      dataArcDays: 2849,
      queryUrl: "https://ssd-api.jpl.nasa.gov/sbdb.api?des=2P&phys-par=1&full-prec=1&cd-epoch=1&cd-tp=1",
      upstreamCanonicalJsonSha256: "beb7530751597c02783bab5b522f3d1a33af39a6b9712b8e300d9b6460059e5e",
      retrievedAtUtc: RETRIEVED_AT_UTC,
    },
  },
  {
    id: "67p",
    name: "Comet 67P",
    catalogName: "67P/Churyumov-Gerasimenko",
    kind: "comet",
    radiusKm: 1.7,
    radiusBasis: "Half the 3.4 km JPL SBDB nucleus diameter",
    radiusSourceUrl: "https://ssd-api.jpl.nasa.gov/sbdb.api?des=67P&phys-par=1&full-prec=1&cd-epoch=1&cd-tp=1",
    colorHint: "#bbb7ad",
    aliases: ["67P", "67P/Churyumov-Gerasimenko", "Churyumov Gerasimenko", "Rosetta", "comet"],
    searchQuery: "67P Churyumov Gerasimenko Rosetta",
    facts: ["JPL classifies 67P as a Jupiter-family comet.", "The SBDB physical record lists a 3.4 km nucleus diameter."],
    orbit: {
      epochJulianDateTdb: 2457305.5,
      equinox: "J2000",
      semiMajorAxisAu: 3.462249489765068,
      eccentricity: 0.6409081306555051,
      perihelionAu: 1.243265641416762,
      aphelionAu: 5.681233338113374,
      inclinationDeg: 7.040294906760007,
      longitudeOfAscendingNodeDeg: 50.13557380441372,
      argumentOfPerihelionDeg: 12.79824973415729,
      meanAnomalyAtEpochDeg: 8.859927418758764,
      meanMotionDegPerDay: 0.1529912292115438,
      orbitalPeriodDays: 2353.076067532089,
    },
    source: {
      provider: "NASA/JPL Small-Body Database",
      designation: "67P",
      spkId: "1000012",
      orbitClassCode: "JFc",
      orbitClassName: "Jupiter-family Comet",
      orbitSolutionId: "K213/6",
      lastObservationDate: "2023-04-26",
      dataArcDays: 5442,
      queryUrl: "https://ssd-api.jpl.nasa.gov/sbdb.api?des=67P&phys-par=1&full-prec=1&cd-epoch=1&cd-tp=1",
      upstreamCanonicalJsonSha256: "41511ffbfa5d0ba81a163598fb28b5ae4a874cc4fbf5ff11f4db9b9fb7bdea98",
      retrievedAtUtc: RETRIEVED_AT_UTC,
    },
  },
  {
    id: "swift-tuttle",
    name: "Comet Swift-Tuttle",
    catalogName: "109P/Swift-Tuttle",
    kind: "comet",
    radiusKm: 13,
    radiusBasis: "Half the 26 km JPL SBDB nucleus diameter",
    radiusSourceUrl: "https://ssd-api.jpl.nasa.gov/sbdb.api?des=109P&phys-par=1&full-prec=1&cd-epoch=1&cd-tp=1",
    colorHint: "#c7d4cf",
    aliases: ["109P", "109P/Swift-Tuttle", "Swift Tuttle", "Perseids", "comet"],
    searchQuery: "109P Swift Tuttle comet",
    facts: ["JPL classifies 109P/Swift-Tuttle as a Halley-type comet.", "The SBDB physical record lists a 26 km nucleus diameter."],
    orbit: {
      epochJulianDateTdb: 2450000.5,
      equinox: "J2000",
      semiMajorAxisAu: 26.0920694978266,
      eccentricity: 0.963225755046038,
      perihelionAu: 0.959516155068868,
      aphelionAu: 51.22462284058444,
      inclinationDeg: 113.453816997171,
      longitudeOfAscendingNodeDeg: 139.3811920815948,
      argumentOfPerihelionDeg: 152.9821676305871,
      meanAnomalyAtEpochDeg: 7.631696167124212,
      meanMotionDegPerDay: 0.007395052881692476,
      orbitalPeriodDays: 48681.19346262312,
    },
    source: {
      provider: "NASA/JPL Small-Body Database",
      designation: "109P",
      spkId: "1000140",
      orbitClassCode: "HTC",
      orbitClassName: "Halley-type Comet",
      orbitSolutionId: "32",
      lastObservationDate: "1995-03-29",
      dataArcDays: 94131,
      queryUrl: "https://ssd-api.jpl.nasa.gov/sbdb.api?des=109P&phys-par=1&full-prec=1&cd-epoch=1&cd-tp=1",
      upstreamCanonicalJsonSha256: "3efe499fa382ac3d1e9db9e1217c6b73e5462cba555848143e6ac505a9c9b3b2",
      retrievedAtUtc: RETRIEVED_AT_UTC,
    },
  },
  {
    id: "hale-bopp",
    name: "Comet Hale-Bopp",
    catalogName: "C/1995 O1 (Hale-Bopp)",
    kind: "comet",
    radiusKm: 30,
    radiusBasis: "Half the 60 km JPL SBDB nucleus diameter",
    radiusSourceUrl: "https://ssd-api.jpl.nasa.gov/sbdb.api?des=C%2F1995%20O1&phys-par=1&full-prec=1&cd-epoch=1&cd-tp=1",
    colorHint: "#d4dedb",
    aliases: ["C/1995 O1", "1995 O1", "Hale Bopp", "Hale-Bopp", "comet"],
    searchQuery: "C 1995 O1 Hale Bopp comet",
    facts: ["JPL classifies C/1995 O1 as a comet on a very long-period orbit.", "The SBDB physical record lists a 60 km nucleus diameter."],
    orbit: {
      epochJulianDateTdb: 2459837.5,
      equinox: "J2000",
      semiMajorAxisAu: 177.4333839117583,
      eccentricity: 0.9949810027633206,
      perihelionAu: 0.890537663547794,
      aphelionAu: 353.9762301599687,
      inclinationDeg: 89.28759424740302,
      longitudeOfAscendingNodeDeg: 282.7334213961641,
      argumentOfPerihelionDeg: 130.4146670659176,
      meanAnomalyAtEpochDeg: 3.878386339423241,
      meanMotionDegPerDay: 0.0004170144183266921,
      orbitalPeriodDays: 863279.5034870314,
    },
    source: {
      provider: "NASA/JPL Small-Body Database",
      designation: "1995 O1",
      spkId: "1000132",
      orbitClassCode: "COM",
      orbitClassName: "Comet",
      orbitSolutionId: "226",
      lastObservationDate: "2022-07-09",
      dataArcDays: 10665,
      queryUrl: "https://ssd-api.jpl.nasa.gov/sbdb.api?des=C%2F1995%20O1&phys-par=1&full-prec=1&cd-epoch=1&cd-tp=1",
      upstreamCanonicalJsonSha256: "75dbff02da95f4d876a332cdd5a07127d07f8641c6434ee9d57e4ef630c6fbc0",
      retrievedAtUtc: RETRIEVED_AT_UTC,
    },
  },
];

export const SMALL_BODY_BY_ID = new Map<SmallBodyId, SmallBodyDef>(
  SMALL_BODIES.map((body) => [body.id, body]),
);

export const isSmallBodyId = (value: string): value is SmallBodyId =>
  SMALL_BODY_BY_ID.has(value as SmallBodyId);
