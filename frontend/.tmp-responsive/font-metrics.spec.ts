/** Measures Inter (web font) vs Arial so a size-adjusted fallback can match it. Read-only. */
import { test } from '@playwright/test';

test('font metrics', async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: 'http://localhost:5173', viewport: { width: 375, height: 812 } });
  const page = await ctx.newPage();
  await page.goto('/contact', { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  const r = await page.evaluate(async () => {
    await document.fonts.ready;
    const faces = [...document.fonts].map((f) => `${f.family} ${f.weight} ${f.status}`);
    const texts = [
      'Sampaikan tanggal menginap dan jumlah tamu. Kami bantu mengecek ketersediaan dan menjawab pertanyaan Anda.',
      'Homestay bernuansa joglo yang dirancang sederhana, rapi, dan menenangkan untuk keluarga.',
      'Setiap tipe kamar dijaga bersih dan tenang. Pilih yang sesuai dengan jumlah tamu, lalu tanyakan ketersediaan lewat WhatsApp.',
    ];
    const c = document.createElement('canvas').getContext('2d')!;
    const width = (font: string, t: string) => {
      c.font = font;
      return c.measureText(t).width;
    };
    const out: Array<Record<string, number>> = [];
    for (const weight of [400, 600]) {
      for (const t of texts) {
        const inter = width(`${weight} 100px Inter`, t);
        const arial = width(`${weight} 100px Arial`, t);
        const sys = width(`${weight} 100px system-ui`, t);
        out.push({ weight, inter: Math.round(inter), arial: Math.round(arial), ratioArial: +(inter / arial).toFixed(4), ratioSys: +(inter / sys).toFixed(4) });
      }
    }
    const bodyFont = getComputedStyle(document.querySelector('.pub-root')!).fontFamily;
    return { faces, out, bodyFont };
  });
  console.log(JSON.stringify(r, null, 1));
  await ctx.close();
});
