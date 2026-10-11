import { test } from '@playwright/test';

/** Logs main/page geometry on every DOM mutation + every frame, to see what moves while chunks/CSS arrive. */
test('cls debug 4', async ({ browser }) => {
  const w = Number(process.env.CLS_W || 1440);
  const h = Number(process.env.CLS_H || 900);
  const ctx = await browser.newContext({ baseURL: 'http://localhost:5173', viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    const win = window as unknown as { __log: string[] };
    win.__log = [];
    let last = '';
    const snap = (why: string) => {
      const main = document.querySelector('main');
      const root = document.querySelector('.pub-root') as HTMLElement | null;
      const hdr = document.querySelector('.pub-header');
      const kid = main?.firstElementChild?.firstElementChild as HTMLElement | null;
      const mr = main?.getBoundingClientRect();
      const kr = kid?.getBoundingClientRect();
      const s =
        `main[y=${mr ? Math.round(mr.y) : '-'} h=${mr ? Math.round(mr.height) : '-'} pt=${main ? getComputedStyle(main).paddingTop : '-'}] ` +
        `kid=${kid?.tagName}[y=${kr ? Math.round(kr.y) : '-'} h=${kr ? Math.round(kr.height) : '-'}] ` +
        `hdr=${hdr ? 'Y' : 'n'} tone=${root?.dataset.tone ?? '-'} sheets=${document.styleSheets.length} bodyKids=${document.body?.children.length ?? 0}`;
      if (s !== last) {
        win.__log.push(`${Math.round(performance.now())}ms [${why}] ${s}`);
        last = s;
      }
    };
    new MutationObserver(() => snap('mut')).observe(document, { subtree: true, childList: true, attributes: true });
    const loop = () => {
      snap('raf');
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  await page.goto(process.env.CLS_URL || '/rooms');
  await page.waitForTimeout(1500);
  const log = await page.evaluate(() => (window as unknown as { __log: string[] }).__log);
  console.log('LOG\n' + log.join('\n'));
});
