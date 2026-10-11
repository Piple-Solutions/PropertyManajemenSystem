import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { loginAsAdmin } from '../e2e/helpers';
const OUT = path.resolve(process.cwd(), '.tmp-responsive', 'tblcmp');
test('compare tables deep', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await loginAsAdmin(page);
  for (const [w, h] of [[375, 812], [1440, 900]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/dashboard/finance/sales', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    for (const [key, title] of [['revenue', 'Revenue by Source'], ['history', 'Riwayat Transaksi']] as const) {
      const card = page.locator('h3', { hasText: title }).locator('..');
      await card.screenshot({ path: path.join(OUT, `${w}-${key}.png`) });
    }
    const r = await page.evaluate(() => {
      const props = ['backgroundColor','color','fontSize','fontWeight','letterSpacing','textTransform','textAlign','padding','borderTop','borderBottom','borderLeft','borderRight','boxShadow','position','whiteSpace','verticalAlign','height','width','lineHeight','outline'] as const;
      const grab = (el: Element) => { const cs = getComputedStyle(el as HTMLElement); const o: Record<string,string> = {}; for (const p of props) o[p] = (cs as any)[p]; return o; };
      const pick = (title: string) => {
        const card = [...document.querySelectorAll('h3')].find((e) => (e.textContent || '').includes(title))!.parentElement as HTMLElement;
        const wrap = card.querySelector('.tbl-wrap') as HTMLElement; const t = card.querySelector('table') as HTMLElement;
        return {
          wrap: grab(wrap), table: grab(t),
          trHead: grab(t.querySelector('thead tr')!), th0: grab(t.querySelector('th')!), thN: grab(t.querySelector('th:last-child')!),
          tr0: grab(t.querySelector('tbody tr')!), tr1: grab(t.querySelectorAll('tbody tr')[1] || t.querySelector('tbody tr')!),
          td0: grab(t.querySelector('td')!), td1: grab(t.querySelectorAll('td')[1]), tdN: grab(t.querySelector('td:last-child')!),
          cls: { table: t.className, wrap: wrap.className, td0: (t.querySelector('td') as HTMLElement).className },
        };
      };
      return { revenue: pick('Revenue by Source'), history: pick('Riwayat Transaksi') };
    });
    const diffs: string[] = [];
    for (const part of Object.keys(r.revenue) as Array<keyof typeof r.revenue>) {
      const a = r.revenue[part] as Record<string, string>, b = r.history[part] as Record<string, string>;
      for (const k of Object.keys(a)) if (a[k] !== b[k]) diffs.push(`${part}.${k}: revenue=${a[k]} | history=${b[k]}`);
    }
    console.log(`=== ${w}px diffs (${diffs.length})\n` + diffs.join('\n'));
  }
});
