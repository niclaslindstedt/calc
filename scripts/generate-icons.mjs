#!/usr/bin/env node
// Generate the PWA install icons and the social-preview image from the same
// geometry as public/icons/icon.svg — a bold equals sign filled with an amber
// gradient on the app's dark surface (the single-glyph style shared with the
// sibling notes, checklist, and contacts apps, in this app's own hue). Pure
// Node (zlib + a minimal PNG encoder), so the pipeline needs no native image
// dependencies. Rerun with `npm run icons` / `make icons` after changing the
// mark.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const iconsDir = join(root, "public", "icons");
mkdirSync(iconsDir, { recursive: true });

// The app look's surface (see src/app/look.ts) and the mark's amber gradient.
// Kept in lockstep with the <linearGradient> stops in public/icons/icon.svg.
const BG = [11, 13, 16]; // #0b0d10
const GRAD_TOP = [253, 224, 71]; // #fde047
const GRAD_BOT = [245, 158, 11]; // #f59e0b
// The gradient runs top-to-bottom over the mark's vertical extent (unit
// space), matching the userSpaceOnUse y1/y2 span in the SVG.
const GRAD_Y0 = 0.3;
const GRAD_Y1 = 0.7;

// The mark's ink at unit-space height `y`, interpolated along the gradient.
function markInk(y) {
  const t = Math.max(0, Math.min(1, (y - GRAD_Y0) / (GRAD_Y1 - GRAD_Y0)));
  return [
    GRAD_TOP[0] + (GRAD_BOT[0] - GRAD_TOP[0]) * t,
    GRAD_TOP[1] + (GRAD_BOT[1] - GRAD_TOP[1]) * t,
    GRAD_TOP[2] + (GRAD_BOT[2] - GRAD_TOP[2]) * t,
  ];
}

// --- minimal PNG encoder ----------------------------------------------------

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// Pack already-encoded PNG blobs into a single ICONDIR (a .ico file). PNG-
// compressed entries are honoured by every current browser and by Windows
// since Vista, so one .ico carrying 16/32/48 px PNGs is the whole legacy-
// favicon story — the raster fallback for tabs that don't render the SVG mark.
function encodeIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // resource type: icon
  header.writeUInt16LE(pngs.length, 4);
  const dir = Buffer.alloc(16 * pngs.length);
  let offset = header.length + dir.length;
  pngs.forEach(({ size, data }, i) => {
    const e = dir.subarray(i * 16);
    e[0] = size >= 256 ? 0 : size; // width  (0 encodes 256)
    e[1] = size >= 256 ? 0 : size; // height (0 encodes 256)
    e[2] = 0; // palette size (0 for a true-colour PNG entry)
    e[3] = 0; // reserved
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(data.length, 8); // bytes in this entry
    e.writeUInt32LE(offset, 12); // byte offset from the file start
    offset += data.length;
  });
  return Buffer.concat([header, dir, ...pngs.map((p) => p.data)]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- the mark ----------------------------------------------------------------

// Sub-pixel sample offsets, used on both axes (a 4×4 grid per pixel).
const SAMPLES = [1 / 8, 3 / 8, 5 / 8, 7 / 8];

// The equals sign: two rounded horizontal bars (unit space). Mirrors the
// <rect> geometry in public/icons/icon.svg — bars from x=0.24 to x=0.76,
// height 0.14, centred at y=0.385 and y=0.615, corner radius 0.055.
const BAR_X0 = 0.24;
const BAR_X1 = 0.76;
const BAR_H = 0.14;
const BAR_R = 0.055;
const BAR_CY = [0.385, 0.615];

// Signed-distance test for one rounded bar centred at `cy`.
function inBar(x, y, cy) {
  const hw = (BAR_X1 - BAR_X0) / 2 - BAR_R;
  const hh = BAR_H / 2 - BAR_R;
  const qx = Math.abs(x - (BAR_X0 + BAR_X1) / 2) - hw;
  const qy = Math.abs(y - cy) - hh;
  const d =
    Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
    Math.min(Math.max(qx, qy), 0) -
    BAR_R;
  return d <= 0;
}

// Whether unit-space point (x, y) lands on the solid equals mark.
function inMark(x, y) {
  return inBar(x, y, BAR_CY[0]) || inBar(x, y, BAR_CY[1]);
}

// Render size×size RGBA. The mark carries its own margin inside the unit
// box, so `pad` is 0 by default and only the maskable icon insets further for
// its safe zone; `radius` rounds the background corners (0 = square, for
// maskable).
function renderIcon(size, { pad = 0, radius = 0.2 } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const r = radius * size;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const i = (py * size + px) * 4;
      // Rounded-rect background coverage, from the shape's signed distance at
      // the pixel centre (negative inside). The straight-edge term matters:
      // without it a radius of 0 reads as "on the boundary" everywhere and the
      // whole square comes out half-transparent.
      const qx = Math.abs(px + 0.5 - size / 2) - (size / 2 - r);
      const qy = Math.abs(py + 0.5 - size / 2) - (size / 2 - r);
      const outside =
        Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
        Math.min(Math.max(qx, qy), 0) -
        r;
      const bgAlpha = Math.max(0, Math.min(1, 0.5 - outside));
      // Mark coverage in padded unit space, 4×4 supersampled so the bars'
      // rounded ends stay smooth down to 16 px. The gradient ink is sampled
      // at the pixel's own height so the mark shades top-to-bottom.
      let hit = 0;
      for (const oy of SAMPLES) {
        for (const ox of SAMPLES) {
          const sx = ((px + ox) / size - pad) / (1 - 2 * pad);
          const sy = ((py + oy) / size - pad) / (1 - 2 * pad);
          if (inMark(sx, sy)) hit += 1 / (SAMPLES.length * SAMPLES.length);
        }
      }
      const [br, bg2, bb] = BG;
      const sy = ((py + 0.5) / size - pad) / (1 - 2 * pad);
      const [fr, fg2, fb] = markInk(sy);
      rgba[i] = Math.round(br + (fr - br) * hit);
      rgba[i + 1] = Math.round(bg2 + (fg2 - bg2) * hit);
      rgba[i + 2] = Math.round(bb + (fb - bb) * hit);
      rgba[i + 3] = Math.round(bgAlpha * 255);
    }
  }
  return encodePng(size, size, rgba);
}

// The 1200×630 Open Graph card: the mark on the left, accent bars suggesting
// tape entries on the right.
function renderOg() {
  const w = 1200;
  const h = 630;
  const rgba = Buffer.alloc(w * h * 4);
  const markSize = 440;
  const markX = 120;
  const markY = (h - markSize) / 2;
  // The tape bars pick up a mid-gradient accent so they sit with the mark.
  const BAR = markInk(0.5);
  const rows = [
    { x: 640, y: 200, w: 380, h: 26, a: 1 },
    { x: 640, y: 260, w: 300, h: 18, a: 0.55 },
    { x: 640, y: 320, w: 340, h: 18, a: 0.4 },
    { x: 640, y: 380, w: 260, h: 18, a: 0.55 },
    { x: 640, y: 440, w: 320, h: 18, a: 0.4 },
  ];
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const i = (py * w + px) * 4;
      let [cr, cg, cb] = BG;
      // The equals mark, drawn with the same gradient ink as the icons.
      if (
        px >= markX &&
        px < markX + markSize &&
        py >= markY &&
        py < markY + markSize
      ) {
        const sx = (px - markX) / markSize;
        const sy = (py - markY) / markSize;
        if (inMark(sx, sy)) [cr, cg, cb] = markInk(sy).map(Math.round);
      }
      // The tape bars.
      for (const rrow of rows) {
        if (
          px >= rrow.x &&
          px < rrow.x + rrow.w &&
          py >= rrow.y &&
          py < rrow.y + rrow.h
        ) {
          cr = Math.round(BG[0] + (BAR[0] - BG[0]) * rrow.a);
          cg = Math.round(BG[1] + (BAR[1] - BG[1]) * rrow.a);
          cb = Math.round(BG[2] + (BAR[2] - BG[2]) * rrow.a);
        }
      }
      rgba[i] = cr;
      rgba[i + 1] = cg;
      rgba[i + 2] = cb;
      rgba[i + 3] = 255;
    }
  }
  return encodePng(w, h, rgba);
}

writeFileSync(join(iconsDir, "pwa-192.png"), renderIcon(192));
writeFileSync(join(iconsDir, "pwa-512.png"), renderIcon(512));
writeFileSync(
  join(iconsDir, "pwa-512-maskable.png"),
  renderIcon(512, { pad: 0.1, radius: 0 }),
);
writeFileSync(
  join(iconsDir, "apple-touch-icon-180.png"),
  renderIcon(180, { radius: 0 }),
);
writeFileSync(join(root, "public", "og.png"), renderOg());

// favicon.ico — the browser-tab fallback for engines that ignore the SVG
// favicon (Safari, search crawlers) and for the implicit /favicon.ico request.
// Packs the mark at the three classic tab sizes. Lives at the public root so it
// deploys as `<base>favicon.ico` (see pwa-plugin.ts link tag).
writeFileSync(
  join(root, "public", "favicon.ico"),
  encodeIco([16, 32, 48].map((size) => ({ size, data: renderIcon(size) }))),
);
console.log(
  "icons: wrote pwa-192/512/512-maskable, apple-touch-180, og.png, favicon.ico",
);
