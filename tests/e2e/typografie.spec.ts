// ============================================================================
// typografie.spec.ts — Lesegroesse waechst mit dem Bildschirm.
//
// Die Typo laeuft komplett ueber rem-Tokens, Abstaende und Container aber ueber
// feste px. Schrift waechst also, Kaesten nicht. Beim Inhalt ist das
// unkritisch (die Panels haben Reserve), beim Chrome nicht: die Topbar mit 11
// Tabs lief ab 17px Root ueber. Darum ist --fs-nav absolut gesetzt — und hier
// festgenagelt, damit es niemand aus Versehen wieder mitskalieren laesst.
// ============================================================================
import { test, expect } from '@playwright/test';

const MODULE = ['01-agenda', '02-bank', '03-berater', '04-philosophie', '05-cockpit',
  '06-ziele', '07a-finanzieren', '07b-anlegen', '08-vereinbarungen', '09-feedback', '10-abschluss'];

const wurzelGroesse = (page: import('@playwright/test').Page): Promise<string> =>
  page.evaluate(() => getComputedStyle(document.documentElement).fontSize);

test('Praesentationsschirm bekommt die grosse Lesegroesse', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('modules/05-cockpit.html');
  expect(await wurzelGroesse(page)).toBe('18px');
});

test('kleiner Laptop bleibt bei der bisherigen Groesse', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('modules/05-cockpit.html');
  expect(await wurzelGroesse(page)).toBe('16px');
});

test('Navigation laeuft in keinem Modul ueber', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const ueberlauf: string[] = [];
  for (const m of MODULE) {
    await page.goto(`modules/${m}.html`);
    await page.waitForSelector('.bbz-nav-tab');
    const px = await page.evaluate(() => {
      const nav = document.querySelector('.bbz-nav') as HTMLElement;
      return nav.scrollWidth - nav.clientWidth;
    });
    if (px > 0) ueberlauf.push(`${m}: ${px}px`);
  }
  expect(ueberlauf).toEqual([]);
});
