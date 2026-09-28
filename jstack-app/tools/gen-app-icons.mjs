/**
 * The PWA icons (P-1, ADR-38) — 192 and 512, generated, no dependency.
 *
 * A PNG is a zlib stream in a container, and `node:zlib` is in the standard
 * library, so the whole encoder is the forty lines below. The alternative the
 * prompt offers is rasterising an SVG with Playwright's Chromium: simpler to
 * write once, and worse forever — it puts a browser download in the path of
 * icon generation and of any drift test the board runs on it. This is
 * deterministic, takes no external input, and produces byte-identical output
 * on any machine (B-14's lesson).
 *
 * The mark is deliberately plain: the wordmark's J on the app's own ground
 * colour, drawn with filled rectangles rather than a font, because a font
 * would be a second thing that has to be present at generation time. It is a
 * home-screen icon at 48 device pixels, not a logo.
 *
 * Run: `node tools/gen-app-icons.mjs` (or `pnpm codemap`). `--out <dir>`
 * writes elsewhere, which is how the drift test regenerates without touching
 * the committed files.
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The app's own ground and ink, from `theme/tokens.ts`'s light scheme. Read
 * as text rather than imported, so this tool stays dependency-free .mjs. */
const GROUND = [0xed, 0xeb, 0xe5];
const INK = [0x19, 0x18, 0x15];

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** `pixels` is RGB, row-major, length size*size*3. */
function encodePng(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  // 10..12 stay zero: deflate, adaptive filtering, no interlace

  // one filter byte per row (0 = None) — a filter would compress better and
  // this is a 512px flat-colour square; the file is already small
  const raw = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 3);
    raw[rowStart] = 0;
    pixels.copy(raw, rowStart + 1, y * size * 3, (y + 1) * size * 3);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    // level 9 for a stable, small result — determinism matters more than speed
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Fill a rectangle in the RGB buffer. */
function fill(pixels, size, x0, y0, w, h, rgb) {
  for (let y = y0; y < y0 + h && y < size; y++) {
    for (let x = x0; x < x0 + w && x < size; x++) {
      const i = (y * size + x) * 3;
      pixels[i] = rgb[0];
      pixels[i + 1] = rgb[1];
      pixels[i + 2] = rgb[2];
    }
  }
}

/** A J, in rectangles, on the ground. Proportions are fractions of the icon
 * so 192 and 512 are the same mark rather than two drawings. */
function drawIcon(size) {
  const pixels = Buffer.alloc(size * size * 3);
  for (let i = 0; i < size * size; i++) {
    pixels[i * 3] = GROUND[0];
    pixels[i * 3 + 1] = GROUND[1];
    pixels[i * 3 + 2] = GROUND[2];
  }
  const u = size / 32; // one unit
  const round = (n) => Math.round(n);
  // the stem
  fill(pixels, size, round(17 * u), round(7 * u), round(3 * u), round(15 * u), INK);
  // the hook: a short riser, not a second stem. At full height it read as
  // two strokes side by side rather than as one letter.
  fill(pixels, size, round(10 * u), round(19 * u), round(10 * u), round(3 * u), INK);
  fill(pixels, size, round(10 * u), round(17 * u), round(3 * u), round(5 * u), INK);
  // the bar over the top, the wordmark's own flourish
  fill(pixels, size, round(12 * u), round(7 * u), round(8 * u), round(3 * u), INK);
  return pixels;
}

const SIZES = [192, 512];

function generate(outDir = join(root, "public", "icons")) {
  mkdirSync(outDir, { recursive: true });
  const written = [];
  for (const size of SIZES) {
    const file = join(outDir, `icon-${size}.png`);
    writeFileSync(file, encodePng(size, drawIcon(size)));
    written.push(file);
  }
  return written;
}

if (process.argv[1] && process.argv[1].endsWith("gen-app-icons.mjs")) {
  const i = process.argv.indexOf("--out");
  const written = generate(i === -1 ? undefined : process.argv[i + 1]);
  console.log(`app icons written: ${written.length} (${SIZES.join(", ")})`);
}
