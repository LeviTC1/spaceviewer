// Moments: real events you can replay in the live universe at their real date.
// Each one sets the universe clock, picks a subject and a camera, and tells you what happened.

export type MomentCamera =
  /** The explorer's normal arrival framing. */
  | { mode: "arrive" }
  /** Stand at Earth and look at the subject, as an observer here would have. */
  | { mode: "from-earth" }
  /** Stand inside the Moon's shadow just above Earth, looking back at the Moon (eclipses). */
  | { mode: "in-shadow" };

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
    at: "2015-07-14T11:49:57Z",
    subject: "solar:planet:pluto",
    camera: { mode: "arrive" },
    rate: 3_600,
    story:
      "After nine and a half years and almost five billion kilometres, New Horizons passed 12,500 km above Pluto. Its photographs revealed a heart-shaped plain of nitrogen ice and mountains of water ice.",
    note: "Pluto and Charon are positioned for 14 July 2015. The spacecraft itself is not modelled.",
    imageQuery: "Pluto New Horizons",
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
  {
    id: "halley-1986",
    title: "Halley's Comet at perihelion",
    at: "1986-02-09T00:00:00Z",
    subject: "solar:small-body:halley",
    camera: { mode: "arrive" },
    rate: 86_400,
    story:
      "Halley's Comet swung closest to the Sun on 9 February 1986. Five spacecraft flew out to meet it, and Giotto photographed its nucleus. Its next return is in 2061.",
    note: "Orbit from JPL Small-Body Database elements. Time runs at one day per second so you can watch it round the Sun.",
    imageQuery: "Halley's Comet 1986",
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
