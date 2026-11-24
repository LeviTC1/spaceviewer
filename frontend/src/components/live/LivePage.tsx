// Live: real-time video from orbit and the launch pads, and science feeds of the Sun and Earth that
// refresh on their own. A dead stream never leaves you stuck: the player listens for YouTube's error
// and offers the broadcaster's live page instead.

import { useEffect, useMemo, useRef, useState, type FC } from "react";
import { Icon } from "../../shell/Icon";
import {
  fetchEpicDay,
  getLiveFeed,
  LIVE_FEEDS,
  LIVE_GROUPS,
  type EpicFrame,
  type LiveFeed,
} from "../../shell/liveFeeds";
import { readReduceMotion } from "../../shell/preferences";

interface LivePageProps {
  feedId: string | null;
  onSelectFeed: (id: string) => void;
  onOpenPlace: (placeId: string) => void;
}

// ---------------------------------------------------------------------------------------------
// YouTube IFrame API (loaded once, only when a stream is shown)

interface YTPlayer {
  destroy: () => void;
}
interface YTNamespace {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      host?: string;
      playerVars?: Record<string, string | number>;
      events?: { onError?: (event: { data: number }) => void; onReady?: () => void };
    },
  ) => YTPlayer;
}
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApi: Promise<YTNamespace> | null = null;
const loadYouTubeApi = () => {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (ytApi) return ytApi;
  ytApi = new Promise<YTNamespace>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT) resolve(window.YT);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => {
      ytApi = null;
      reject(new Error("YouTube player could not load"));
    };
    document.head.appendChild(script);
  });
  return ytApi;
};

const StreamPlayer: FC<{ feed: LiveFeed }> = ({ feed }) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!feed.youtubeId || !hostRef.current) return;
    setFailed(false);
    let player: YTPlayer | null = null;
    let cancelled = false;
    const mount = document.createElement("div");
    hostRef.current.replaceChildren(mount);
    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return;
        player = new YT.Player(mount, {
          videoId: feed.youtubeId!,
          host: "https://www.youtube-nocookie.com",
          playerVars: { autoplay: 1, mute: 1, playsinline: 1, rel: 0, modestbranding: 1 },
          events: {
            // 2, 5, 100, 101, 150: bad id, player error, removed/private, or embedding refused. YouTube
            // reports a retired private stream as 150, so every error gets the same honest fallback.
            onError: () => setFailed(true),
          },
        });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      player?.destroy();
    };
  }, [feed.youtubeId]);

  return (
    <div className="lv-player lv-player--stream">
      <div ref={hostRef} className="lv-player__frame" title={`${feed.title} — ${feed.source}`} />
      {failed ? (
        <div className="lv-player__fallback" role="status">
          <Icon name="live" size={28} />
          <strong>This broadcast isn't available right now</strong>
          <p>
            {feed.source} restarts its streams from time to time; the current one is always listed on {feed.fallbackLabel}.
          </p>
          <a className="sv-btn sv-btn--primary" href={feed.fallbackUrl} target="_blank" rel="noreferrer">
            Watch on {feed.fallbackLabel} <Icon name="external" size={14} />
          </a>
        </div>
      ) : null}
    </div>
  );
};

// ---------------------------------------------------------------------------------------------
// Movies, refreshing images and the EPIC day sequence

const MoviePlayer: FC<{ feed: LiveFeed }> = ({ feed }) => {
  const [failed, setFailed] = useState(false);
  const [reduce] = useState(readReduceMotion);
  useEffect(() => setFailed(false), [feed.id]);
  if (failed) return <FeedUnavailable feed={feed} />;
  return (
    <div className="lv-player lv-player--movie">
      <video
        key={feed.src}
        src={feed.src}
        poster={feed.poster}
        autoPlay={!reduce}
        muted
        loop
        playsInline
        controls
        preload="metadata"
        onError={() => setFailed(true)}
        aria-label={`${feed.title}, ${feed.cadence}`}
      />
    </div>
  );
};

const minutesAgo = (ms: number) => {
  const minutes = Math.max(0, Math.round((Date.now() - ms) / 60_000));
  return minutes < 1 ? "just now" : minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;
};

const RefreshingImage: FC<{ feed: LiveFeed }> = ({ feed }) => {
  const [stamp, setStamp] = useState(() => Date.now());
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => {
    setFailed(false);
    setLoadedAt(null);
    setStamp(Date.now());
    if (!feed.refreshMinutes) return;
    const refresh = window.setInterval(() => setStamp(Date.now()), feed.refreshMinutes * 60_000);
    const clock = window.setInterval(() => tick((value) => value + 1), 30_000);
    return () => {
      window.clearInterval(refresh);
      window.clearInterval(clock);
    };
  }, [feed.id, feed.refreshMinutes]);
  if (failed) return <FeedUnavailable feed={feed} />;
  const src = `${feed.src}${feed.src?.includes("?") ? "&" : "?"}t=${Math.floor(stamp / 60_000)}`;
  return (
    <div className="lv-player lv-player--image">
      <img src={src} alt={`${feed.title}: ${feed.summary}`} onLoad={() => setLoadedAt(Date.now())} onError={() => setFailed(true)} />
      {loadedAt ? (
        <span className="lv-player__stamp">
          Fetched {minutesAgo(loadedAt)} · {feed.cadence.toLowerCase()}
        </span>
      ) : null}
      {feed.srcLarge ? (
        <a className="lv-player__full sv-btn sv-btn--small" href={feed.srcLarge} target="_blank" rel="noreferrer">
          Full resolution <Icon name="external" size={13} />
        </a>
      ) : null}
    </div>
  );
};

const EpicSequence: FC<{ feed: LiveFeed }> = ({ feed }) => {
  const [frames, setFrames] = useState<EpicFrame[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(() => !readReduceMotion());
  const loaded = useRef(new Set<string>());
  useEffect(() => {
    const controller = new AbortController();
    fetchEpicDay(controller.signal)
      .then((items) => {
        setFrames(items);
        setState(items.length ? "ready" : "error");
        // Warm the cache so the day plays smoothly.
        items.forEach((frame) => {
          const image = new Image();
          image.onload = () => loaded.current.add(frame.url);
          image.src = frame.url;
        });
      })
      .catch((error: unknown) => {
        if ((error as Error).name !== "AbortError") setState("error");
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!playing || frames.length < 2) return;
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % frames.length), 900);
    return () => window.clearInterval(timer);
  }, [frames.length, playing]);
  if (state === "error") return <FeedUnavailable feed={feed} />;
  const frame = frames[index];
  return (
    <div className="lv-player lv-player--epic">
      {frame ? <img src={frame.url} alt={`Earth from DSCOVR, ${frame.date} UTC`} /> : <span className="im-skeleton lv-player__skeleton" />}
      {frame ? (
        <div className="lv-epic__bar">
          <button type="button" className="sv-icon-btn" onClick={() => setPlaying((value) => !value)} aria-label={playing ? "Pause" : "Play the day"}>
            <Icon name={playing ? "pause" : "play"} size={16} />
          </button>
          <input
            type="range"
            min={0}
            max={Math.max(0, frames.length - 1)}
            value={index}
            onChange={(event) => {
              setPlaying(false);
              setIndex(Number(event.target.value));
            }}
            aria-label="Photograph in the sequence"
          />
          <span>
            {frame.date.slice(0, 16)} UTC · over {Math.abs(frame.lat).toFixed(0)}°{frame.lat >= 0 ? "N" : "S"} {Math.abs(frame.lon).toFixed(0)}°{frame.lon >= 0 ? "E" : "W"}
          </span>
        </div>
      ) : null}
    </div>
  );
};

const FeedUnavailable: FC<{ feed: LiveFeed }> = ({ feed }) => (
  <div className="lv-player lv-player--fallback" role="status">
    <div className="lv-player__fallback">
      <Icon name="info" size={26} />
      <strong>This feed didn't answer just now</strong>
      <p>{feed.source} may be updating it. The instrument's own page always has the latest.</p>
      <a className="sv-btn sv-btn--primary" href={feed.fallbackUrl} target="_blank" rel="noreferrer">
        {feed.fallbackLabel} <Icon name="external" size={14} />
      </a>
    </div>
  </div>
);

const FeedPlayer: FC<{ feed: LiveFeed }> = ({ feed }) => {
  if (feed.kind === "stream") return <StreamPlayer feed={feed} />;
  if (feed.kind === "movie") return <MoviePlayer feed={feed} />;
  if (feed.kind === "sequence") return <EpicSequence feed={feed} />;
  return <RefreshingImage feed={feed} />;
};

const kindLabel = (feed: LiveFeed) =>
  feed.kind === "stream" ? "Live" : feed.kind === "movie" ? "Last 48 h" : feed.kind === "sequence" ? "Today" : "Now";

// ---------------------------------------------------------------------------------------------

const LivePage: FC<LivePageProps> = ({ feedId, onSelectFeed, onOpenPlace }) => {
  const feed = useMemo(() => getLiveFeed(feedId) ?? LIVE_FEEDS[0], [feedId]);
  const stageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // On phones the list sits under the player: bring the new feed into view when chosen.
    if (feedId && window.innerWidth < 900) stageRef.current?.scrollIntoView({ behavior: readReduceMotion() ? "auto" : "smooth", block: "start" });
  }, [feedId]);

  return (
    <div className="lv-page">
      <header className="lv-head">
        <p className="sv-eyebrow">
          <span className="im-live__dot" aria-hidden="true" /> Live
        </p>
        <h1 className="sv-serif">Live from space</h1>
        <p>Earth from the Space Station, the launch pads, the Sun over the last two days, and our planet right now. Every feed comes straight from the people running the camera.</p>
      </header>

      <div className="lv-layout">
        <section className="lv-stage" ref={stageRef} aria-label={`${feed.title}, ${feed.source}`}>
          <FeedPlayer feed={feed} />
          <div className="lv-info">
            <div className="lv-info__title">
              <span className={`lv-badge lv-badge--${feed.kind}`}>{kindLabel(feed)}</span>
              <h2 className="sv-serif">{feed.title}</h2>
            </div>
            <p className="lv-info__source">
              {feed.source} · {feed.cadence}
            </p>
            <p className="lv-info__about">{feed.about}</p>
            <div className="lv-info__actions">
              {feed.place ? (
                <button type="button" className="sv-btn sv-btn--small" onClick={() => onOpenPlace(feed.place!.id)}>
                  <Icon name="fly" size={14} /> {feed.place.label}
                </button>
              ) : null}
              <a className="sv-btn sv-btn--small sv-btn--quiet" href={feed.fallbackUrl} target="_blank" rel="noreferrer">
                {feed.fallbackLabel} <Icon name="external" size={13} />
              </a>
            </div>
          </div>
        </section>

        <nav className="lv-list" aria-label="Live feeds">
          {LIVE_GROUPS.map((group) => (
            <section key={group} className="lv-group">
              <h3>{group}</h3>
              <ul>
                {LIVE_FEEDS.filter((item) => item.group === group).map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`lv-item${item.id === feed.id ? " is-active" : ""}`}
                      aria-current={item.id === feed.id ? "true" : undefined}
                      onClick={() => onSelectFeed(item.id)}
                    >
                      <span className="lv-item__thumb">
                        {item.poster || (item.src && item.kind === "image") ? <img src={item.poster ?? item.src} alt="" loading="lazy" decoding="async" /> : <Icon name={item.kind === "sequence" ? "universe" : "live"} size={18} />}
                        <i className={`lv-badge lv-badge--${item.kind}`}>{kindLabel(item)}</i>
                      </span>
                      <span className="lv-item__text">
                        <strong>{item.title}</strong>
                        <small>{item.source}</small>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>
      </div>
      <footer className="lv-foot">
        <p>
          Video streams are embedded from the broadcasters' official YouTube channels. Solar imagery: NASA/SDO and the AIA and HMI science
          teams; ESA/NASA SOHO LASCO. Earth: NASA EPIC team / NOAA DSCOVR; NOAA/NESDIS/STAR GOES. Aurora: NOAA Space Weather Prediction
          Center. Images are hot-linked from their sources and keep their credits.
        </p>
      </footer>
    </div>
  );
};

export default LivePage;
