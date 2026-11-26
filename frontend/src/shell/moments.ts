// Moments: real events you can replay in the live universe at their real date.
// Each one sets the universe clock, picks a subject and a camera, and tells you what happened.

export type MomentCamera =
  /** The explorer's normal arrival framing. */
  | { mode: "arrive" }
  /** Stand at Earth and look at the subject, as an observer here would have. */
  | { mode: "from-earth" }
  /** Stand inside the Moon's shadow just above Earth, looking back at the Moon (eclipses). */
  | { mode: "in-shadow" }
  /** Ride with a spacecraft: the camera follows it, `distanceKm` behind, looking past it at `look`. */
  | { mode: "ride-along"; look: string; distanceKm: number };

export interface Moment {
  id: string;
  title: string;
  /** ISO timestamp of the event (UTC). */
  at: string;
  /** Explorer entity id. */
  subject: string;
  camera: MomentCamera;
  /** Seconds of simulated time per real second once the moment opens (0 = paused). */
  rate: number;
  story: string;
  /** Telescope view: vertical field of view in degrees (omit for the normal 50° lens). */
  lensDeg?: number;
  /** What in the scene is measured vs. what we added. */
  note: string;
  imageQuery: string;
}

export const MOMENTS: Moment[] = [
  {
    id: "eclipse-2024",
    title: "The Great North American Eclipse",
    at: "2024-04-08T18:17:20Z",
    subject: "solar:moon:moon",
    camera: { mode: "in-shadow" },
    lensDeg: 1.6,
    rate: 0,
    story:
      "On 8 April 2024 the Moon's shadow crossed Mexico, the United States and Canada. Totality lasted up to 4 minutes 28 seconds near Torreón. Here the camera stands inside that shadow and looks back at the Moon covering the Sun.",
    note: "Sun and Moon positions are computed for the moment of greatest eclipse. The camera sits on the Sun–Moon line at Earth's distance from the Moon.",
    imageQuery: "total solar eclipse 2024",
  },
  {
    id: "new-horizons-pluto",
    title: "New Horizons reaches Pluto",
    at: "2015-07-14T10:20:00Z",
    subject: "spacecraft:new-horizons",
    camera: { mode: "ride-along", look: "solar:planet:pluto", distanceKm: 0.02 },
    rate: 60,
    story:
      "After nine and a half years and almost five billion kilometres, New Horizons passed 12,500 km above Pluto at 11:50 UTC. Ride along for the last ninety minutes: its photographs revealed a heart-shaped plain of nitrogen ice and mountains of water ice.",
    note: "New Horizons follows its JPL Horizons trajectory and Pluto JPL's ephemeris for the encounter; the clock runs a minute a second. The spacecraft model is simplified.",
    imageQuery: "Pluto New Horizons",
  },
  {
    id: "juno-perijove-1",
    title: "Juno's first close pass over Jupiter",
    at: "2016-08-27T12:20:00Z",
    subject: "spacecraft:juno",
    camera: { mode: "ride-along", look: "solar:planet:jupiter", distanceKm: 0.06 },
    rate: 30,
    story:
      "On 27 August 2016 Juno swept from pole to pole 4,200 km above Jupiter's cloud tops at 208,000 km/h, the closest any spacecraft had come. Every 53 days it dives in again, then swings out beyond the moons.",
    note: "Juno and Jupiter are both positioned for the pass (JPL Horizons and VSOP87A agree to about a thousand kilometres); the clock runs thirty seconds a second.",
    imageQuery: "Juno Jupiter",
  },
  {
    id: "parker-closest",
    title: "Parker Solar Probe touches the Sun",
    at: "2024-12-24T09:30:00Z",
    subject: "spacecraft:parker-solar-probe",
    camera: { mode: "ride-along", look: "solar:sun", distanceKm: 0.012 },
    rate: 300,
    story:
      "On Christmas Eve 2024 Parker Solar Probe passed 6.1 million km above the Sun's surface at 692,000 km/h, the fastest any human-made object has travelled, its heat shield facing temperatures near 1,000 °C.",
    note: "Positions from JPL Horizons. The clock runs five minutes a second so you can watch it whip round the Sun.",
    imageQuery: "Parker Solar Probe",
  },
  {
    id: "jwst-arrives",
    title: "Webb arrives at L2",
    at: "2022-01-24T12:00:00Z",
    subject: "spacecraft:jwst",
    camera: { mode: "ride-along", look: "solar:planet:earth", distanceKm: 0.06 },
    rate: 0,
    story:
      "A month after launch, the James Webb Space Telescope fired its thrusters for the last time on its outbound trip and settled into a halo orbit around the Sun–Earth L2 point, 1.5 million km from Earth, its sunshield always between it and the Sun, Earth and Moon.",
    note: "Webb's position is its JPL Horizons trajectory. Look back past the sunshield to find the Earth and Moon.",
    imageQuery: "James Webb Space Telescope",
  },
  {
    id: "voyager-2-neptune",
    title: "Voyager 2 at Neptune",
    at: "1989-08-25T02:00:00Z",
    subject: "spacecraft:voyager-2",
    camera: { mode: "ride-along", look: "solar:planet:neptune", distanceKm: 0.05 },
    rate: 120,
    story:
      "Twelve years after launch, Voyager 2 skimmed 4,950 km over Neptune's north pole, the last stop of its Grand Tour. It found the Great Dark Spot, the fastest winds in the Solar System and geysers on Triton.",
    note: "Voyager 2 follows its JPL Horizons trajectory and Neptune VSOP87A; they agree to within a few thousand kilometres here.",
    imageQuery: "Voyager 2 Neptune",
  },
  {
    id: "halley-1986",
    title: "Halley's Comet returns",
    at: "1986-03-10T00:00:00Z",
    subject: "solar:small-body:halley",
    camera: { mode: "from-earth" },
    lensDeg: 36,
    rate: 3_600,
    story:
      "In March 1986 a fleet of spacecraft met Halley's Comet. ESA's Giotto flew 596 km from its nucleus, a dark peanut 15 km long, jetting gas and dust as it rounded the Sun. Here you see it from Earth, tails streaming away from the Sun. It next returns in 2061.",
    note: "Halley is positioned from JPL's orbital elements. The tails are a model: the blue ion tail points straight away from the Sun, the dust tail curves back along the orbit, and their length follows the distance from the Sun.",
    imageQuery: "Halley's Comet 1986",
  },
  {
    id: "cassini-finale",
    title: "Cassini's Grand Finale",
    at: "2017-09-15T10:31:00Z",
    subject: "solar:planet:saturn",
    camera: { mode: "arrive" },
    rate: 600,
    story:
      "After 13 years orbiting Saturn, Cassini was steered into the planet's atmosphere so it could never contaminate Enceladus or Titan. It sent data until the very end.",
    note: "Saturn, its rings and moons are positioned for the final day. Cassini is not modelled.",
    imageQuery: "Cassini Saturn",
  },
  {
    id: "great-conjunction-2020",
    title: "The Great Conjunction",
    at: "2020-12-21T18:00:00Z",
    subject: "solar:planet:jupiter",
    camera: { mode: "from-earth" },
    lensDeg: 0.6,
    rate: 0,
    story:
      "On 21 December 2020 Jupiter and Saturn appeared just a tenth of a degree apart in Earth's sky, the closest they had looked since 1623. In reality they were more than 700 million km apart.",
    note: "The camera stands at Earth looking toward Jupiter through a 0.6° telescope view. Switch to the normal lens and orbit to see how far apart the two planets really were.",
    imageQuery: "Jupiter Saturn conjunction",
  },
  {
    id: "mars-2003",
    title: "Mars at its closest in 60,000 years",
    at: "2003-08-27T09:51:00Z",
    subject: "solar:planet:mars",
    camera: { mode: "from-earth" },
    lensDeg: 0.3,
    rate: 0,
    story:
      "On 27 August 2003 Mars came within 55.76 million km of Earth, its closest approach in almost 60,000 years. It will not come this close again until 2287.",
    note: "Positions from the VSOP87 planetary theory for that moment. Distance from Earth is shown in the facts.",
    imageQuery: "Mars Hubble 2003",
  },
  {
    id: "voyager-heliopause",
    title: "Voyager 1 leaves the heliosphere",
    at: "2012-08-25T00:00:00Z",
    subject: "spacecraft:voyager-1",
    camera: { mode: "arrive" },
    rate: 0,
    story:
      "Around 25 August 2012, about 121 AU from the Sun, Voyager 1 crossed the heliopause. It became the first human-made object to reach interstellar space, 35 years after launch.",
    note: "Voyager's position is propagated from JPL Horizons vectors. The heliopause boundary itself is not drawn.",
    imageQuery: "Voyager 1",
  },
];

export const getMoment = (id: string | null | undefined) => MOMENTS.find((moment) => moment.id === id) ?? null;

/** The moment whose anniversary is nearest (on or after) today, for the "Today" card. */
export const momentForToday = (now = new Date()): { moment: Moment; daysAway: number } => {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  let best: { moment: Moment; daysAway: number } | null = null;
  for (const moment of MOMENTS) {
    const at = new Date(moment.at);
    let next = Date.UTC(now.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate());
    if (next < today) next = Date.UTC(now.getUTCFullYear() + 1, at.getUTCMonth(), at.getUTCDate());
    const daysAway = Math.round((next - today) / 86_400_000);
    if (!best || daysAway < best.daysAway) best = { moment, daysAway };
  }
  return best ?? { moment: MOMENTS[0], daysAway: 0 };
};

export const momentHref = (moment: Moment) => `/explore?object=${encodeURIComponent(moment.subject)}&moment=${moment.id}`;

export const formatMomentDate = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(iso));
