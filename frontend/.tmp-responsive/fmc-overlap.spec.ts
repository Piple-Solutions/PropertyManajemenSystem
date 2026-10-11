/** Find the smallest floor-map width with no label overlap / overflow (read-only). */
import { test } from '@playwright/test';
import { loginAsAdmin } from '../e2e/helpers';

test('fmc min width', async ({ page }) => {
  await loginAsAdmin(page);
  // Mobile text rules apply at <=767px; use a phone-width viewport but a wide container is not needed:
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/dashboard/rooms', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  const floors = await page.locator('.fmc-tabs [role="tab"]').count();
  for (let f = 0; f < floors; f++) {
    await page.locator('.fmc-tabs [role="tab"]').nth(f).click();
    await page.waitForTimeout(400);
    const out: string[] = [];
    for (const w of [269, 300, 340, 380, 420, 460, 500, 540, 580, 620, 670]) {
      const r = await page.evaluate((width) => {
        const map = document.querySelector('.fmc-map') as HTMLElement;
        map.style.setProperty('width', `${width}px`, 'important');
        map.style.setProperty('min-width', `${width}px`, 'important');
        const spans = [...map.querySelectorAll('span')] as HTMLElement[];
        const boxes = spans.map((s) => ({ s, r: s.getBoundingClientRect() }));
        let overlaps = 0;
        const names: string[] = [];
        for (let i = 0; i < boxes.length; i++)
          for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i].r, b = boxes[j].r;
            const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            if (ix > 1 && iy > 1) { overlaps++; names.push((boxes[i].s.textContent || '') + '~' + (boxes[j].s.textContent || '')); }
          }
        // text wider/taller than its own area box
        let overflow = 0;
        for (const { s, r: sr } of boxes) {
          const p = s.parentElement as HTMLElement;
          if (p === map) continue;
          const pr = p.getBoundingClientRect();
          const isGroupLabel = s.style.position === 'absolute';
          if (!isGroupLabel && (sr.width > pr.width + 1 || sr.height > pr.height + 1)) { overflow++; names.push('OVF:' + (s.textContent || '')); }
        }
        // anything outside the map box
        const mr = map.getBoundingClientRect();
        let outside = 0;
        for (const { s, r: sr } of boxes) if (sr.left < mr.left - 1 || sr.right > mr.right + 1) { outside++; names.push('OUT:' + (s.textContent || '')); }
        return { overlaps, overflow, outside, names: [...new Set(names)].slice(0, 6) };
      }, w);
      out.push(`${w}: ov=${r.overlaps} txtOvf=${r.overflow} outside=${r.outside} ${r.names.join(', ')}`);
    }
    console.log(`FLOOR ${f + 1}\n` + out.join('\n'));
  }
});
