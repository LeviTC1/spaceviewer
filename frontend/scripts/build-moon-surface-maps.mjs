#!/usr/bin/env node
// Builds real global surface maps for the Moon and the outer-planet moons from public-domain sources:
// USGS Astrogeology global mosaics (Galileo, Voyager, Cassini) and NASA SVS's LRO colour map.
//
//   node scripts/build-moon-surface-maps.mjs <source-dir>
//
// The source TIFFs are large (8–290 MB) and are not committed; this script records their URLs and
// writes 4K and 8K equirectangular JPEGs (longitude −180°…+180°, 0° at the centre, east to the right,
// matching the existing planet maps) to public/solar-textures/moons/.
// Monochrome mosaics are tinted towards each moon's natural colour; that tint is an illustrative
// choice and is disclosed in the attribution and in the explorer.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sourceDir = resolve(process.argv[2] ?? "");
if (!process.argv[2] || !existsSync(sourceDir)) {
  console.error("usage: build-moon-surface-maps.mjs <source-dir-with-downloaded-tiffs>");
  process.exit(1);
}
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const outRoot = resolve(scriptDirectory, "../public/solar-textures/moons");

const USGS = "https://planetarymaps.usgs.gov/mosaic/";
const MAPS = [
  { id: "moon", file: "lroc_color_poles_8k.tif", url: "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_poles_8k.tif", sizes: [4096, 8192], credit: "NASA's Scientific Visualization Studio, CGI Moon Kit (LRO LROC colour, LOLA polar fill)", colour: "measured colour" },
  { id: "io", file: "Io_GalileoSSI-Voyager_Global_Mosaic_ClrMerge_1km.tif", sizes: [4096, 8192], credit: "USGS Astrogeology / NASA–JPL Galileo SSI and Voyager colour-merge mosaic", colour: "enhanced colour from Galileo filters" },
  { id: "europa", file: "Europa_Voyager_GalileoSSI_global_mosaic_500m.tif", sizes: [4096, 8192], tint: "#efe5d6", fill: "#a39a8e", credit: "USGS Astrogeology / NASA–JPL Voyager–Galileo SSI global mosaic (500 m)", colour: "monochrome, tinted" },
  { id: "ganymede", file: "Ganymede_Voyager_GalileoSSI_Global_ClrMosaic_1435m.tif", sizes: [4096, 8192], fill: "#8a8378", credit: "USGS Astrogeology / NASA–JPL Voyager–Galileo SSI global colour mosaic", colour: "measured colour" },
  { id: "callisto", file: "Callisto_Voyager_GalileoSSI_global_mosaic_1km.tif", sizes: [4096, 8192], tint: "#b9a48c", level: "0%,62%", fill: "#5d5246", credit: "USGS Astrogeology / NASA–JPL Voyager–Galileo SSI global mosaic (1 km)", colour: "monochrome, tinted" },
  { id: "titan", file: "Titan_ISS_P19658_Mosaic_Global_4km.tif", sizes: [4096], tint: "#d9a46a", credit: "USGS Astrogeology / NASA–JPL–Space Science Institute Cassini ISS 938 nm global mosaic", colour: "surface seen through the haze at 938 nm, tinted" },
  { id: "enceladus", file: "Enceladus_Cassini_mosaic_global_110m.tif", sizes: [4096, 8192], tint: "#f3f6fb", roll: true, credit: "USGS Astrogeology / NASA–JPL–Space Science Institute Cassini ISS global mosaic (110 m)", colour: "monochrome, tinted" },
  { id: "tethys", file: "Tethys_Cassini_mosaic_global_293m.tif", sizes: [4096, 8192], tint: "#ecebe6", credit: "USGS Astrogeology / NASA–JPL–Space Science Institute Cassini ISS global mosaic (293 m)", colour: "monochrome, tinted" },
  { id: "triton", file: "Triton_Voyager2_ClrMosaic_GlobalFill_600m.tif", sizes: [4096, 8192], fill: "#b7b49f", credit: "USGS Astrogeology / NASA–JPL Voyager 2 colour mosaic (gaps filled)", colour: "measured colour; unimaged northern regions filled" },
];

const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

const build = async () => {
  const receipt = [];
  for (const map of MAPS) {
    const source = resolve(sourceDir, map.file);
    if (!existsSync(source)) throw new Error(`Missing source ${map.file}`);
    for (const width of map.sizes) {
      const dir = resolve(outRoot, width === 8192 ? "8k" : "4k");
      await mkdir(dir, { recursive: true });
      const out = resolve(dir, `${map.id}.jpg`);
      const args = [source + "[0]", "-colorspace", "sRGB"];
      // Enceladus is published 0°…360°; roll by half a turn so 0° sits at the centre like the others.
      if (map.roll) args.push("-roll", "+50%+0");
      args.push("-resize", `${width}x${width / 2}!`, "-depth", "8");
      // Stretch very dark mosaics so they read on screen (Callisto's albedo is low but not black).
      if (map.level) args.push("-level", map.level);
      if (map.tint) {
        // Multiply the monochrome mosaic by the moon's approximate natural colour.
        args.push("(", "+clone", "-fill", map.tint, "-colorize", "100", ")", "-compose", "Multiply", "-composite");
      }
      // Areas no spacecraft imaged (black in the mosaic) are filled with the moon's mean colour,
      // so the globe shows a neutral, honest "unknown" rather than a black cap.
      if (map.fill) args.push("-fuzz", "3%", "-fill", map.fill, "-opaque", "black");
      args.push("-sampling-factor", "4:2:0", "-quality", width === 8192 ? "80" : "84", "-interlace", "JPEG", "-strip", out);
      // ImageMagick does the heavy lifting; large TIFFs need a generous memory policy.
      execFileSync("magick", ["-limit", "memory", "4GiB", "-limit", "map", "8GiB", ...args], { stdio: "inherit" });
      receipt.push({ id: map.id, width, path: `public/solar-textures/moons/${width === 8192 ? "8k" : "4k"}/${map.id}.jpg`, sha256: sha256(out) });
      console.log(`built ${map.id} ${width}`);
    }
  }
  const manifest = {
    schema: "spaceviewer-moon-surface-maps-v1",
    projection: "equirectangular, longitude −180°…+180° (0° at centre), east to the right",
    sources: MAPS.map((map) => ({
      id: map.id,
      sourceFile: map.file,
      sourceUrl: map.url ?? `${USGS}${map.file}`,
      credit: map.credit,
      colour: map.colour,
      licence: map.id === "moon" ? "NASA media: free to use with credit to NASA's Scientific Visualization Studio" : "US Government work (USGS / NASA): public domain",
      tint: map.tint ?? null,
      unimagedFill: map.fill ?? null,
    })),
    outputs: receipt,
  };
  await writeFile(resolve(outRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
};

await build();
