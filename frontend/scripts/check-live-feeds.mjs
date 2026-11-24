#!/usr/bin/env node
/* global fetch, console, process */
// Re-checks every feed in src/shell/liveFeeds.ts.
//   YouTube streams: owner, still live, and allowed to embed.
//   Movies and images: reachable, and how long ago they were updated.
// Broadcasters restart streams with new ids from time to time; when a stream fails here, find the new
// id on the channel's /streams page and replace it in liveFeeds.ts.
//
//   npm run check:live
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(import.meta.dirname, "../src/shell/liveFeeds.ts"), "utf8");
const blocks = source.split(/\n {2}\{\n {4}id: "/).slice(1).map((block) => {
  const id = block.slice(0, block.indexOf('"'));
  const field = (name) => block.match(new RegExp(`\\n {4}${name}: "([^"]+)"`))?.[1];
  return { id, source: field("source"), youtubeId: field("youtubeId"), src: field("src"), poster: field("poster"), srcLarge: field("srcLarge") };
});

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131 Safari/537.36";
let failures = 0;
const ok = (id, text) => console.log(`✓ ${id.padEnd(18)} ${text}`);
const fail = (id, text) => {
  failures += 1;
  console.log(`✗ ${id.padEnd(18)} ${text}`);
};

const checkYouTube = async (feed) => {
  const oembed = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${feed.youtubeId}&format=json`);
  if (!oembed.ok) return fail(feed.id, `YouTube ${feed.youtubeId}: oEmbed ${oembed.status} (removed, private or not embeddable)`);
  const meta = await oembed.json();
  const page = await (await fetch(`https://www.youtube.com/watch?v=${feed.youtubeId}`, { headers: { "user-agent": UA, cookie: "CONSENT=YES+1; SOCS=CAI", "accept-language": "en-US" } })).text();
  const live = /"isLiveNow":true/.test(page);
  const embeddable = !/"playableInEmbed":false/.test(page);
  const owner = meta.author_name;
  const expected = feed.source?.split(" ")[0];
  if (!embeddable) return fail(feed.id, `${owner}: embedding disabled`);
  if (!live) return fail(feed.id, `${owner}: "${meta.title.slice(0, 60)}" is no longer live`);
  if (expected && !owner.toLowerCase().includes(expected.toLowerCase())) return fail(feed.id, `owned by ${owner}, expected ${feed.source}`);
  ok(feed.id, `live · ${owner} · ${meta.title.slice(0, 70)}`);
};

const checkUrl = async (feed, url, label) => {
  const response = await fetch(url, { method: "HEAD", headers: { "user-agent": UA } });
  if (!response.ok) return fail(feed.id, `${label} ${response.status} ${url}`);
  const modified = response.headers.get("last-modified");
  const age = modified ? Math.round((Date.now() - Date.parse(modified)) / 60_000) : null;
  const size = Number(response.headers.get("content-length") ?? 0);
  ok(feed.id, `${label} ${age === null ? "" : `updated ${age < 120 ? `${age} min` : `${Math.round(age / 60)} h`} ago`}${size ? ` · ${(size / 1e6).toFixed(1)} MB` : ""}`);
};

for (const feed of blocks) {
  try {
    if (feed.youtubeId) await checkYouTube(feed);
    else if (feed.id === "epic-day") {
      const response = await fetch("https://epic.gsfc.nasa.gov/api/natural");
      const items = response.ok ? await response.json() : [];
      if (!items.length) fail(feed.id, `EPIC API ${response.status}`);
      else ok(feed.id, `${items.length} photographs · latest ${items.at(-1).date} UTC`);
    }
    if (feed.src) await checkUrl(feed, feed.src, feed.src.endsWith(".mp4") ? "movie" : "image");
    if (feed.poster && !feed.youtubeId) await checkUrl(feed, feed.poster, "poster");
  } catch (error) {
    fail(feed.id, String(error));
  }
}
console.log(failures ? `\n${failures} feed check(s) failed` : `\nAll ${blocks.length} feeds are live.`);
process.exit(failures ? 1 : 0);
