/**
 * Rebuild jn-monogram-transparent.png from the vector JN mark and
 * Playfair Display 700. Run from the repo root:
 *
 *   node scripts/build-jn-monogram.mjs
 *
 * Requires puppeteer-core and Chrome (CHROME_PATH overrides detection).
 * The canvas stays 1333×1516 and transparent. Mark and wordmark are
 * oxidized #2A3A4A. The lowest ink sits about 6% of the canvas above
 * the bottom edge.
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WIDTH = 1333;
const HEIGHT = 1516;
const INK = "#2A3A4A";
const MARK_WIDTH = 788;
const WORDMARK = "JUNTO NOVA";
const WORDMARK_WIDTH_RATIO = 0.92;
const GAP_RATIO = 0.05;
const BOTTOM_PADDING_RATIO = 0.06;
const SCALE = 2;

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  return "/usr/local/bin/google-chrome";
}

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

const svg = readFileSync(resolve(root, "assets/jn-mark.svg"), "utf8")
  .replace(/fill="[^"]*"/g, `fill="${INK}"`);
const font = readFileSync(resolve(root, "assets/fonts/playfair-display-latin.woff2")).toString("base64");
const viewBox = svg.match(/viewBox="([^"]+)"/)[1].trim().split(/\s+/).map(Number);
const markAspect = viewBox[3] / viewBox[2];

const browser = await puppeteer.launch({
  executablePath: chromePath(),
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=slight", "--force-color-profile=srgb"],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
  await page.setContent("<!doctype html><html><body></body></html>", { waitUntil: "load" });
  const result = await page.evaluate(async (spec) => {
    const face = new FontFace("Playfair Display", `url(data:font/woff2;base64,${spec.font})`, {
      weight: "600 700",
      style: "normal",
    });
    await face.load();
    document.fonts.add(face);
    if (!document.fonts.check('700 120px "Playfair Display"')) {
      throw new Error("Playfair Display 700 did not load");
    }

    const markImg = new Image();
    markImg.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(spec.svg)))}`;
    await markImg.decode();

    const markW = spec.markWidth * spec.scale;
    const markH = Math.round(markW * spec.markAspect);
    const targetWordW = Math.round(spec.markWidth * spec.wordmarkWidthRatio * spec.scale);

    function inkBox(canvas) {
      const { width, height } = canvas;
      const data = canvas.getContext("2d").getImageData(0, 0, width, height).data;
      let minX = width;
      let minY = height;
      let maxX = -1;
      let maxY = -1;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (data[(y * width + x) * 4 + 3] > 8) {
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
          }
        }
      }
      return { minX, minY, maxX, maxY, w: maxX - minX + 1, h: maxY - minY + 1 };
    }

    function renderWord(fontPx) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(targetWordW * 1.8);
      canvas.height = Math.ceil(fontPx * 2.2);
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = spec.ink;
      ctx.font = `700 ${fontPx}px "Playfair Display"`;
      ctx.letterSpacing = "-0.02em";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(spec.wordmark, Math.round(fontPx * 0.3), Math.round(fontPx * 1.25));
      return { canvas, box: inkBox(canvas) };
    }

    let lo = 20 * spec.scale;
    let hi = 280 * spec.scale;
    let word = renderWord(lo);
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      word = renderWord(mid);
      if (word.box.w > targetWordW) hi = mid;
      else lo = mid;
    }

    const gap = Math.round(spec.markWidth * spec.markAspect * spec.gapRatio * spec.scale);
    const bottomPad = Math.round(spec.height * spec.bottomPaddingRatio * spec.scale);
    const canvasH = spec.height * spec.scale;
    const canvasW = spec.width * spec.scale;
    const wordBottom = canvasH - bottomPad;
    const wordTop = wordBottom - word.box.h;
    const markBottom = wordTop - gap;
    const markTop = markBottom - markH;
    if (markTop < 0) throw new Error(`Lockup is taller than the canvas (mark top ${markTop})`);

    const big = document.createElement("canvas");
    big.width = canvasW;
    big.height = canvasH;
    const ctx = big.getContext("2d");
    ctx.drawImage(markImg, Math.round((canvasW - markW) / 2), markTop, markW, markH);
    ctx.drawImage(
      word.canvas,
      word.box.minX,
      word.box.minY,
      word.box.w,
      word.box.h,
      Math.round((canvasW - word.box.w) / 2),
      wordTop,
      word.box.w,
      word.box.h,
    );

    // Box-filter the 2× bitmap in premultiplied alpha so edges stay
    // oxidized instead of picking up a dark halo from transparent black.
    const src = ctx.getImageData(0, 0, canvasW, canvasH).data;
    const out = document.createElement("canvas");
    out.width = spec.width;
    out.height = spec.height;
    const octx = out.getContext("2d");
    const img = octx.createImageData(spec.width, spec.height);
    const dest = img.data;
    for (let y = 0; y < spec.height; y++) {
      for (let x = 0; x < spec.width; x++) {
        let pr = 0;
        let pg = 0;
        let pb = 0;
        let pa = 0;
        for (let oy = 0; oy < spec.scale; oy++) {
          for (let ox = 0; ox < spec.scale; ox++) {
            const i = ((y * spec.scale + oy) * canvasW + (x * spec.scale + ox)) * 4;
            const a = src[i + 3] / 255;
            pr += src[i] * a;
            pg += src[i + 1] * a;
            pb += src[i + 2] * a;
            pa += a;
          }
        }
        const n = spec.scale * spec.scale;
        pr /= n;
        pg /= n;
        pb /= n;
        pa /= n;
        const o = (y * spec.width + x) * 4;
        if (pa < 1 / 255) {
          dest[o] = dest[o + 1] = dest[o + 2] = dest[o + 3] = 0;
        } else {
          dest[o] = Math.round(pr / pa);
          dest[o + 1] = Math.round(pg / pa);
          dest[o + 2] = Math.round(pb / pa);
          dest[o + 3] = Math.round(pa * 255);
        }
      }
    }
    octx.putImageData(img, 0, 0);
    // One ink color. Coverage stays in alpha; drop near-invisible noise.
    const inkRgb = spec.ink.match(/\w\w/g).map((h) => parseInt(h, 16));
    const cleaned = octx.getImageData(0, 0, spec.width, spec.height);
    const cd = cleaned.data;
    for (let i = 0; i < cd.length; i += 4) {
      if (cd[i + 3] < 8) {
        cd[i] = cd[i + 1] = cd[i + 2] = cd[i + 3] = 0;
      } else {
        cd[i] = inkRgb[0];
        cd[i + 1] = inkRgb[1];
        cd[i + 2] = inkRgb[2];
      }
    }
    octx.putImageData(cleaned, 0, 0);

    const finalBox = inkBox(out);
    const data = octx.getImageData(0, 0, spec.width, spec.height).data;
    let opaque = 0;
    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 200) {
        opaque++;
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
      }
    }
    let raw = "";
    const chunk = 8192;
    for (let i = 0; i < data.length; i += chunk) {
      raw += String.fromCharCode(...data.subarray(i, i + chunk));
    }
    return {
      rgba: btoa(raw),
      fontPx: (lo + hi) / 2 / spec.scale,
      mark: { w: Math.round(markW / spec.scale), h: Math.round(markH / spec.scale), top: Math.round(markTop / spec.scale) },
      word: { w: Math.round(word.box.w / spec.scale), h: Math.round(word.box.h / spec.scale) },
      gap: Math.round(gap / spec.scale),
      bottomPad: spec.height - 1 - finalBox.maxY,
      ink: { minX: finalBox.minX, minY: finalBox.minY, maxX: finalBox.maxX, maxY: finalBox.maxY },
      interior: { r: Math.round(r / opaque), g: Math.round(g / opaque), b: Math.round(b / opaque), opaque },
    };
  }, {
    svg,
    font,
    width: WIDTH,
    height: HEIGHT,
    scale: SCALE,
    ink: INK,
    markWidth: MARK_WIDTH,
    markAspect,
    wordmark: WORDMARK,
    wordmarkWidthRatio: WORDMARK_WIDTH_RATIO,
    gapRatio: GAP_RATIO,
    bottomPaddingRatio: BOTTOM_PADDING_RATIO,
  });

  const rgba = Buffer.from(result.rgba, "base64");
  const ink = [0x2a, 0x3a, 0x4a];
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 8) {
      rgba[i] = rgba[i + 1] = rgba[i + 2] = rgba[i + 3] = 0;
    } else {
      rgba[i] = ink[0];
      rgba[i + 1] = ink[1];
      rgba[i + 2] = ink[2];
    }
  }
  const png = encodePng(WIDTH, HEIGHT, rgba);
  const outPath = resolve(root, "jn-monogram-transparent.png");
  writeFileSync(outPath, png);
  const { rgba: _rgba, ...report } = result;
  console.log(JSON.stringify({ out: outPath, bytes: png.length, ...report }, null, 2));
} finally {
  await browser.close();
}
