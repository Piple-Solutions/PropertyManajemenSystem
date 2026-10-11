/**
 * Builds web-sized WebP derivatives of the two brand logos for the PUBLIC site.
 * Originals in frontend/assets are only READ (the PMS keeps using them untouched).
 * Uses the Chromium that Playwright already ships: no new packages.
 */
import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(process.cwd());
const OUT_DIR = path.join(ROOT, 'assets', 'public');
const TARGET_WIDTH = Number(process.env.LOGO_W || 480);
const QUALITY = Number(process.env.LOGO_Q || 0.9);

test('make logo derivatives', async ({ page }) => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  await page.goto('about:blank');
  for (const [src, out] of [
    ['LogoWhite.png', 'LogoWhite.webp'],
    ['LogoBrown.png', 'LogoBrown.webp'],
  ] as const) {
    const input = fs.readFileSync(path.join(ROOT, 'assets', src));
    const b64 = input.toString('base64');
    const res = await page.evaluate(
      async ({ b64, targetWidth, quality }) => {
        const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
        const full = await createImageBitmap(blob);
        // alpha bounding box of the original (to know whether there is transparent padding)
        const probe = new OffscreenCanvas(full.width, full.height);
        const pctx = probe.getContext('2d')!;
        pctx.drawImage(full, 0, 0);
        const data = pctx.getImageData(0, 0, full.width, full.height).data;
        let minX = full.width, minY = full.height, maxX = -1, maxY = -1;
        for (let y = 0; y < full.height; y++) {
          for (let x = 0; x < full.width; x++) {
            if (data[(y * full.width + x) * 4 + 3] > 8) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
        const bbox = { minX, minY, maxX, maxY, w: full.width, h: full.height };
        // crop to the visible artwork with a 1% safety margin, then scale to the target width
        const padX = Math.round(full.width * 0.01);
        const padY = Math.round(full.height * 0.01);
        const sx = Math.max(0, minX - padX);
        const sy = Math.max(0, minY - padY);
        const sw = Math.min(full.width - sx, maxX - minX + 1 + padX * 2);
        const sh = Math.min(full.height - sy, maxY - minY + 1 + padY * 2);
        const scale = targetWidth / sw;
        const dw = targetWidth;
        const dh = Math.round(sh * scale);
        const canvas = new OffscreenCanvas(dw, dh);
        const ctx = canvas.getContext('2d')!;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(full, sx, sy, sw, sh, 0, 0, dw, dh);
        const outBlob = await canvas.convertToBlob({ type: 'image/webp', quality });
        const buf = new Uint8Array(await outBlob.arrayBuffer());
        let bin = '';
        for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        // decode back to verify alpha survived
        const back = await createImageBitmap(outBlob);
        const bc = new OffscreenCanvas(back.width, back.height);
        const bctx = bc.getContext('2d')!;
        bctx.drawImage(back, 0, 0);
        const px = bctx.getImageData(0, 0, 1, 1).data;
        let transparent = 0;
        const bd = bctx.getImageData(0, 0, back.width, back.height).data;
        for (let i = 3; i < bd.length; i += 4) if (bd[i] < 8) transparent++;
        return {
          b64: btoa(bin),
          bbox,
          crop: { sx, sy, sw, sh },
          out: { w: dw, h: dh },
          cornerAlpha: px[3],
          transparentShare: +(transparent / (bd.length / 4)).toFixed(3),
        };
      },
      { b64, targetWidth: TARGET_WIDTH, quality: QUALITY },
    );
    const buf = Buffer.from(res.b64, 'base64');
    fs.writeFileSync(path.join(OUT_DIR, out), buf);
    console.log(
      JSON.stringify({ file: out, bytes: buf.length, original: input.length, bbox: res.bbox, crop: res.crop, out: res.out, cornerAlpha: res.cornerAlpha, transparentShare: res.transparentShare }),
    );
  }
});
