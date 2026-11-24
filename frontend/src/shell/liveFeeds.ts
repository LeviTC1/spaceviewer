// Live feeds: real-time video from orbit and launch sites, and science feeds that refresh on their own.
//
// Every YouTube id below was checked on 23 Nov 2026: owned by the named channel, live, and allowed to
// embed (`npm run check:live` re-checks them; ids are retired when a broadcaster restarts a stream).
// Each feed also names a stable page to fall back to, so a retired id never leaves a dead end.

export type LiveFeedKind = "stream" | "movie" | "image" | "sequence";

export interface LiveFeed {
  id: string;
  group: "From orbit" | "Launch sites" | "The Sun today" | "Earth today" | "Space weather";
  title: string;
  /** Who runs the camera / instrument (shown as the credit). */
  source: string;
  kind: LiveFeedKind;
  /** One line under the title in lists. */
  summary: string;
  /** A short paragraph on what you are looking at. */
  about: string;
  /** Cadence in plain words: "Live", "Last 48 hours, updated every few hours", "New image every 10 minutes". */
  cadence: string;
  youtubeId?: string;
  /** Movie (mp4) or still image URL. */
  src?: string;
  /** Larger still for the detail view (images). */
  srcLarge?: string;
  /** Poster / thumbnail. */
  poster?: string;
  /** Minutes between refreshes for images. */
  refreshMinutes?: number;
  /** A page that always works: the broadcaster's live list or the instrument's home. */
  fallbackUrl: string;
  fallbackLabel: string;
  /** Somewhere to go in the universe from here. */
  place?: { id: string; label: string };
}

const ytThumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault_live.jpg`;

export const LIVE_FEEDS: LiveFeed[] = [
  {
    id: "nasa-iss-hd",
    group: "From orbit",
    title: "Earth from the Space Station",
    source: "NASA",
    kind: "stream",
    summary: "High-definition views from the International Space Station",
    about:
      "NASA's official external cameras on the International Space Station, about 420 km up and moving at 7.66 km/s. Sixteen sunrises a day. When the station is on the night side or between ground stations, the picture goes dark or blue: that is normal.",
    cadence: "Live, 24/7",
    youtubeId: "ROboUHfPUrU",
    poster: ytThumb("ROboUHfPUrU"),
    fallbackUrl: "https://www.youtube.com/@NASA/streams",
    fallbackLabel: "NASA's live streams",
    place: { id: "solar:planet:earth", label: "Fly to Earth" },
  },
  {
    id: "sen-4k",
    group: "From orbit",
    title: "Earth in 4K",
    source: "Sen",
    kind: "stream",
    summary: "Sen's 4K cameras on the Space Station, around the clock",
    about:
      "Sen's SpaceTV-1 cameras reached the Space Station in March 2024 and stream Earth in 4K, nearly continuously. There are brief gaps whenever communication links change over.",
    cadence: "Live, 24/7",
    youtubeId: "fO9e9jnhYK8",
    poster: ytThumb("fO9e9jnhYK8"),
    fallbackUrl: "https://www.youtube.com/@SenSpace/streams",
    fallbackLabel: "Sen's live streams",
    place: { id: "solar:planet:earth", label: "Fly to Earth" },
  },
  {
    id: "nasa-iss-live",
    group: "From orbit",
    title: "Inside the Space Station",
    source: "NASA",
    kind: "stream",
    summary: "Station views with live crew and Mission Control audio",
    about:
      "NASA's official ISS stream, which switches between interior and exterior cameras and carries live audio between the crew and Mission Control. During spacewalks and dockings, this is where they happen.",
    cadence: "Live, 24/7",
    youtubeId: "M3HKLzjvKPc",
    poster: ytThumb("M3HKLzjvKPc"),
    fallbackUrl: "https://www.youtube.com/@NASA/streams",
    fallbackLabel: "NASA's live streams",
  },
  {
    id: "nsf-space-coast",
    group: "Launch sites",
    title: "Space Coast",
    source: "NASASpaceflight",
    kind: "stream",
    summary: "Cape Canaveral and Kennedy Space Center pads, Falcon 9 and Starship work",
    about:
      "Long-lens cameras on Florida's Space Coast: the Falcon 9 pads, the Vehicle Assembly Building and Starship construction. Between launches you'll see rollouts, static fires and boosters coming home.",
    cadence: "Live, 24/7",
    youtubeId: "Jm8wRjD3xVA",
    poster: ytThumb("Jm8wRjD3xVA"),
    fallbackUrl: "https://www.youtube.com/@NASASpaceflight/streams",
    fallbackLabel: "NASASpaceflight live",
  },
  {
    id: "nsf-starbase",
    group: "Launch sites",
    title: "Starbase",
    source: "NASASpaceflight",
    kind: "stream",
    summary: "Starship and Super Heavy at SpaceX's Boca Chica site",
    about:
      "Around-the-clock views of SpaceX's Starbase in Texas: the launch tower, Starship and Super Heavy rollouts, tests and flights.",
    cadence: "Live, 24/7",
    youtubeId: "mhJRzQsLZGg",
    poster: ytThumb("mhJRzQsLZGg"),
    fallbackUrl: "https://www.youtube.com/@NASASpaceflight/streams",
    fallbackLabel: "NASASpaceflight live",
  },
  {
    id: "nsf-mcgregor",
    group: "Launch sites",
    title: "McGregor engine tests",
    source: "NASASpaceflight",
    kind: "stream",
    summary: "SpaceX's Texas test site, where Raptor and Merlin engines fire",
    about:
      "SpaceX's McGregor test site, where every Merlin and Raptor engine is fired before it flies. Tests are loud and frequent, especially at night.",
    cadence: "Live, 24/7",
    youtubeId: "cOmmvhDQ2HM",
    poster: ytThumb("cOmmvhDQ2HM"),
    fallbackUrl: "https://www.youtube.com/@NASASpaceflight/streams",
    fallbackLabel: "NASASpaceflight live",
  },
  {
    id: "sdo-193",
    group: "The Sun today",
    title: "The Sun's corona",
    source: "NASA SDO · AIA 193 Å",
    kind: "movie",
    summary: "The last 48 hours at 1.2 million °C",
    about:
      "The Solar Dynamics Observatory photographs the Sun every few seconds. In extreme ultraviolet at 193 ångströms you see the corona at about 1.2 million degrees: bright active regions, loops, and dark coronal holes where the solar wind escapes.",
    cadence: "The last 48 hours, rebuilt every few hours",
    src: "https://sdo.gsfc.nasa.gov/assets/img/latest/mpeg/latest_512_0193.mp4",
    poster: "https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_0193.jpg",
    srcLarge: "https://sdo.gsfc.nasa.gov/assets/img/latest/latest_2048_0193.jpg",
    fallbackUrl: "https://sdo.gsfc.nasa.gov/data/",
    fallbackLabel: "SDO: The Sun now",
    place: { id: "solar:sun", label: "Fly to the Sun" },
  },
  {
    id: "sdo-304",
    group: "The Sun today",
    title: "Prominences and flares",
    source: "NASA SDO · AIA 304 Å",
    kind: "movie",
    summary: "The chromosphere at 50,000 °C",
    about:
      "At 304 ångströms SDO sees the chromosphere and transition region: prominences arching off the limb, filaments across the disc, and flares lighting up active regions.",
    cadence: "The last 48 hours, rebuilt every few hours",
    src: "https://sdo.gsfc.nasa.gov/assets/img/latest/mpeg/latest_512_0304.mp4",
    poster: "https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_0304.jpg",
    fallbackUrl: "https://sdo.gsfc.nasa.gov/data/",
    fallbackLabel: "SDO: The Sun now",
    place: { id: "solar:sun", label: "Fly to the Sun" },
  },
  {
    id: "sdo-171",
    group: "The Sun today",
    title: "Magnetic loops",
    source: "NASA SDO · AIA 171 Å",
    kind: "movie",
    summary: "Coronal loops traced by the Sun's magnetic field",
    about:
      "At 171 ångströms the quiet corona and the loops above active regions stand out. Each loop follows a magnetic field line, so this is the Sun's magnetism made visible.",
    cadence: "The last 48 hours, rebuilt every few hours",
    src: "https://sdo.gsfc.nasa.gov/assets/img/latest/mpeg/latest_512_0171.mp4",
    poster: "https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_0171.jpg",
    fallbackUrl: "https://sdo.gsfc.nasa.gov/data/",
    fallbackLabel: "SDO: The Sun now",
    place: { id: "solar:sun", label: "Fly to the Sun" },
  },
  {
    id: "sdo-sunspots",
    group: "The Sun today",
    title: "Sunspots",
    source: "NASA SDO · HMI visible light",
    kind: "movie",
    summary: "The Sun's surface in visible light, rotating",
    about:
      "The Helioseismic and Magnetic Imager sees the photosphere in visible light, the Sun as it would look through a safe filter. Sunspots march across the disc as the Sun rotates, once every 27 days or so as seen from Earth.",
    cadence: "The last 48 hours, rebuilt every few hours",
    src: "https://sdo.gsfc.nasa.gov/assets/img/latest/mpeg/latest_512_HMIIC.mp4",
    poster: "https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_HMIIC.jpg",
    fallbackUrl: "https://sdo.gsfc.nasa.gov/data/",
    fallbackLabel: "SDO: The Sun now",
    place: { id: "solar:sun", label: "Fly to the Sun" },
  },
  {
    id: "soho-c3",
    group: "Space weather",
    title: "Solar wind and eruptions",
    source: "ESA/NASA SOHO · LASCO C3",
    kind: "movie",
    summary: "A coronagraph blocks the Sun to reveal what it throws out",
    about:
      "SOHO's LASCO C3 coronagraph hides the Sun's disc (the white circle marks its size) to show the faint outer corona out to 30 solar radii. Watch for coronal mass ejections billowing outward, comets falling in, and planets drifting through the background stars.",
    cadence: "The last few days, updated through the day",
    src: "https://soho.nascom.nasa.gov/data/LATEST/current_c3small.mp4",
    poster: "https://soho.nascom.nasa.gov/data/realtime/c3/1024/latest.jpg",
    fallbackUrl: "https://soho.nascom.nasa.gov/data/realtime-images.html",
    fallbackLabel: "SOHO real-time images",
    place: { id: "solar:sun", label: "Fly to the Sun" },
  },
  {
    id: "soho-c2",
    group: "Space weather",
    title: "Close to the Sun",
    source: "ESA/NASA SOHO · LASCO C2",
    kind: "movie",
    summary: "The inner corona, where eruptions first leave the Sun",
    about:
      "LASCO C2 looks closer in, from 2 to 6 solar radii. Coronal mass ejections show up here first, as bright loops and fans leaving the Sun.",
    cadence: "The last few days, updated through the day",
    src: "https://soho.nascom.nasa.gov/data/LATEST/current_c2small.mp4",
    fallbackUrl: "https://soho.nascom.nasa.gov/data/realtime-images.html",
    fallbackLabel: "SOHO real-time images",
    place: { id: "solar:sun", label: "Fly to the Sun" },
  },
  {
    id: "epic-day",
    group: "Earth today",
    title: "A day on Earth",
    source: "NASA EPIC · NOAA DSCOVR",
    kind: "sequence",
    summary: "The whole sunlit Earth, from 1.5 million km away",
    about:
      "DSCOVR orbits the Sun–Earth L1 point, 1.5 million km sunward, so its EPIC camera always sees the full sunlit face of Earth. These are its most recent photographs, played in order: the planet turning through a day.",
    cadence: "About a dozen photographs a day, published within a day or two",
    fallbackUrl: "https://epic.gsfc.nasa.gov/",
    fallbackLabel: "NASA EPIC",
    place: { id: "solar:planet:earth", label: "Fly to Earth" },
  },
  {
    id: "goes-east",
    group: "Earth today",
    title: "The Americas now",
    source: "NOAA GOES-19 (GOES-East)",
    kind: "image",
    summary: "The full disc of Earth over the Americas, from 35,786 km",
    about:
      "GOES-19 hangs in geostationary orbit over the equator at 75° W, watching weather across North and South America and the Atlantic. GeoColor shows true colour by day and city lights and clouds by night.",
    cadence: "New full-disc image every 10 minutes",
    src: "https://cdn.star.nesdis.noaa.gov/GOES19/ABI/FD/GEOCOLOR/1808x1808.jpg",
    srcLarge: "https://cdn.star.nesdis.noaa.gov/GOES19/ABI/FD/GEOCOLOR/5424x5424.jpg",
    poster: "https://cdn.star.nesdis.noaa.gov/GOES19/ABI/FD/GEOCOLOR/678x678.jpg",
    refreshMinutes: 10,
    fallbackUrl: "https://www.star.nesdis.noaa.gov/GOES/fulldisk.php?sat=G19",
    fallbackLabel: "NOAA STAR GOES-East",
    place: { id: "solar:planet:earth", label: "Fly to Earth" },
  },
  {
    id: "goes-west",
    group: "Earth today",
    title: "The Pacific now",
    source: "NOAA GOES-18 (GOES-West)",
    kind: "image",
    summary: "The full disc of Earth over the Pacific",
    about: "GOES-18 watches the Pacific from 137° W: storms off Alaska, Hawaii, and the west coast of the Americas.",
    cadence: "New full-disc image every 10 minutes",
    src: "https://cdn.star.nesdis.noaa.gov/GOES18/ABI/FD/GEOCOLOR/1808x1808.jpg",
    srcLarge: "https://cdn.star.nesdis.noaa.gov/GOES18/ABI/FD/GEOCOLOR/5424x5424.jpg",
    poster: "https://cdn.star.nesdis.noaa.gov/GOES18/ABI/FD/GEOCOLOR/678x678.jpg",
    refreshMinutes: 10,
    fallbackUrl: "https://www.star.nesdis.noaa.gov/GOES/fulldisk.php?sat=G18",
    fallbackLabel: "NOAA STAR GOES-West",
    place: { id: "solar:planet:earth", label: "Fly to Earth" },
  },
  {
    id: "aurora-north",
    group: "Space weather",
    title: "Aurora forecast: north",
    source: "NOAA SWPC · OVATION model",
    kind: "image",
    summary: "Where the northern lights are likely in the next 30–90 minutes",
    about:
      "NOAA's Space Weather Prediction Center forecasts the aurora from real-time solar-wind measurements taken 1.5 million km upstream. Green to red marks increasing chance; the line shows how far south it could be seen. This is a model forecast, not a photograph.",
    cadence: "Updated every 5 minutes",
    src: "https://services.swpc.noaa.gov/images/animations/ovation/north/latest.jpg",
    refreshMinutes: 5,
    fallbackUrl: "https://www.swpc.noaa.gov/products/aurora-30-minute-forecast",
    fallbackLabel: "NOAA aurora forecast",
  },
  {
    id: "aurora-south",
    group: "Space weather",
    title: "Aurora forecast: south",
    source: "NOAA SWPC · OVATION model",
    kind: "image",
    summary: "Where the southern lights are likely right now",
    about: "The same forecast for the southern hemisphere: the aurora australis over Antarctica, the Southern Ocean, and sometimes Tasmania, New Zealand and Patagonia.",
    cadence: "Updated every 5 minutes",
    src: "https://services.swpc.noaa.gov/images/animations/ovation/south/latest.jpg",
    refreshMinutes: 5,
    fallbackUrl: "https://www.swpc.noaa.gov/products/aurora-30-minute-forecast",
    fallbackLabel: "NOAA aurora forecast",
  },
];

export const LIVE_GROUPS: LiveFeed["group"][] = ["From orbit", "Launch sites", "The Sun today", "Earth today", "Space weather"];

export const getLiveFeed = (id: string | null | undefined) => LIVE_FEEDS.find((feed) => feed.id === id) ?? null;

export const liveHref = (feed: LiveFeed) => `/live?feed=${feed.id}`;

/** Feeds that belong to a place in the universe (used for "Watch live" in object panels). */
export const liveFeedsForPlace = (placeId: string) => LIVE_FEEDS.filter((feed) => feed.place?.id === placeId);

export const youtubeEmbedUrl = (id: string, autoplay = true) =>
  `https://www.youtube-nocookie.com/embed/${id}?rel=0&playsinline=1&modestbranding=1${autoplay ? "&autoplay=1&mute=1" : ""}&enablejsapi=1&origin=${encodeURIComponent(typeof window === "undefined" ? "" : window.location.origin)}`;

// ---------------------------------------------------------------------------------------------
// DSCOVR EPIC: the most recent day of natural-colour Earth photographs.

export interface EpicFrame {
  url: string;
  thumb: string;
  date: string;
  lat: number;
  lon: number;
}

export const fetchEpicDay = async (signal?: AbortSignal): Promise<EpicFrame[]> => {
  const response = await fetch("https://epic.gsfc.nasa.gov/api/natural", { signal });
  if (!response.ok) throw new Error(`EPIC answered ${response.status}`);
  const items = (await response.json()) as Array<{ image: string; date: string; centroid_coordinates?: { lat: number; lon: number } }>;
  return items.map((item) => {
    const [day] = item.date.split(" ");
    const [y, m, d] = day.split("-");
    const base = `https://epic.gsfc.nasa.gov/archive/natural/${y}/${m}/${d}`;
    return {
      url: `${base}/jpg/${item.image}.jpg`,
      thumb: `${base}/thumbs/${item.image}.jpg`,
      date: item.date,
      lat: item.centroid_coordinates?.lat ?? 0,
      lon: item.centroid_coordinates?.lon ?? 0,
    };
  });
};
