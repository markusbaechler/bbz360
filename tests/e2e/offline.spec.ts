import { test, expect } from '@playwright/test';
import { musterEinlesen } from './helfer';

// PWA / offline (ADR-21): Nach dem ersten Laden laeuft das Beratungsgespraech
// ohne Netz — alle Seiten, der Rechen-Worker, Grundlagen und Schriften kommen
// aus dem Zwischenspeicher. Kundendaten bleiben im localStorage.

test('ohne Netz: Module laden, die Pensionierung rechnet, der Stand bleibt', async ({ page, context }) => {
  await page.goto('index.html');
  // warten, bis der Service Worker aktiv ist und der Vorab-Cache steht
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(async () => page.evaluate(async () => {
    const namen = await caches.keys();
    for (const n of namen) {
      const c = await caches.open(n);
      const urls = (await c.keys()).map((r) => r.url);
      if (urls.some((u) => u.includes('modules/07c-pension.html')) && urls.some((u) => u.includes('modules/10-abschluss.html'))) return true;
    }
    return false;
  }), { timeout: 30_000 }).toBe(true);

  await context.setOffline(true);
  const fehler: string[] = [];
  page.on('pageerror', (e) => fehler.push(e.message));

  await page.goto('modules/05-cockpit.html');
  await expect(page.locator('.rail-title')).toHaveText('Finanz-Cockpit');

  await musterEinlesen(page, { leeren: false }); // Seite, Worker und Grundlagen aus dem Cache

  await page.goto('modules/07-lebensplan.html');
  await expect(page.locator('#lpKpis .kpi')).toHaveCount(4);

  await page.goto('modules/10-abschluss.html');
  await expect(page.locator('.ab-sec', { hasText: '07 · LEBENSPLAN' })).toContainText(/Reicht|Knapp/);
  expect(fehler).toEqual([]);
});

test('Manifest und Icons sind eingebunden; keine fremden Adressen im Seitengerüst', async ({ page, request }) => {
  await page.goto('index.html');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();
  const m = await (await request.get(new URL(href as string, page.url()).toString())).json();
  expect(m).toMatchObject({ short_name: 'bbz360', display: 'standalone', start_url: '/bbz360/', theme_color: '#004078' });
  expect(m.icons.length).toBeGreaterThanOrEqual(2);
  // Schriften sind eingebettet: nichts wird von fremden Hosts geladen
  for (const seite of ['index.html', 'modules/05-cockpit.html', 'modules/07c-pension.html']) {
    await page.goto(seite);
    const fremd = await page.evaluate(() => [...document.querySelectorAll('link[href], script[src]')]
      .map((e) => (e as HTMLLinkElement).href || (e as HTMLScriptElement).src).filter((u) => !u.startsWith(location.origin)));
    expect(fremd, seite).toEqual([]);
  }
});
