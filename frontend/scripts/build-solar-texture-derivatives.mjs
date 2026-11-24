import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const execFile = promisify(execFileCallback);
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const frontendDirectory = resolve(scriptDirectory, "..");
const textureDirectory = resolve(frontendDirectory, "public/solar-textures");
const highDirectory = resolve(textureDirectory, "high");
const performanceDirectory = resolve(textureDirectory, "perf");
const plutoSource = resolve(frontendDirectory, "catalog-source/solar-textures/nasa-pluto-global-color-map.jpg");

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

const crc32 = (buffer) => {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const pngChunk = (type, data) => {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.byteLength);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
};

const createDeterministicNoisePng = (width, height, seed) => {
  let state = seed >>> 0;
  const nextByte = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state & 0xff;
  };
  const scanlines = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (width * 3 + 1);
    scanlines[rowOffset] = 0;
    for (let x = 0; x < width * 3; x += 1) scanlines[rowOffset + 1 + x] = nextByte();
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(scanlines, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
};

const resize = async (input, output, width, height, quality = 88) => {
  const extension = extname(output).toLowerCase();
  const sharedArguments = [input, "-filter", "Lanczos", "-resize", `${width}x${height}!`, "-strip"];
  const encodingArguments =
    extension === ".png"
      ? ["-define", "png:compression-level=9"]
      : ["-interlace", "Plane", "-sampling-factor", "4:2:0", "-quality", String(quality)];
  await execFile("magick", [...sharedArguments, ...encodingArguments, output]);
};

await readFile(plutoSource).catch(() => {
  throw new Error("Pinned NASA Pluto source is missing. Run: npm run textures:fetch");
});

await resize(plutoSource, resolve(highDirectory, "2k_pluto.jpg"), 2048, 1024, 92);

const halfSizeDerivatives = [
  ["2k_earth_daymap.jpg", 1024, 512],
  ["2k_jupiter.jpg", 1024, 512],
  ["2k_mars.jpg", 1024, 512],
  ["2k_mercury.jpg", 1024, 512],
  ["2k_neptune.jpg", 1024, 512],
  ["2k_pluto.jpg", 1024, 512],
  ["2k_saturn.jpg", 1024, 512],
  ["2k_saturn_ring_alpha.png", 1024, 63],
  ["2k_sun.jpg", 1024, 512],
  ["2k_uranus.jpg", 1024, 512],
  ["2k_venus_surface.jpg", 1024, 512],
  ["earth_atmos_2048.jpg", 1024, 512],
  ["earth_clouds_1024.png", 512, 256],
  ["earth_lights_2048.png", 1024, 512],
  ["earth_specular_2048.jpg", 1024, 512],
  ["moon_1024.jpg", 512, 256],
];

for (const [filename, width, height] of halfSizeDerivatives) {
  await resize(resolve(highDirectory, filename), resolve(performanceDirectory, filename), width, height);
}

const noise = createDeterministicNoisePng(256, 256, 0x53505632);
await writeFile(resolve(highDirectory, "noise.png"), noise);
await copyFile(resolve(highDirectory, "noise.png"), resolve(performanceDirectory, "noise.png"));

const outputHash = createHash("sha256").update(noise).digest("hex");
console.log(`Rebuilt 18 controlled texture derivatives; deterministic noise SHA-256 ${outputHash}.`);
