// ============================================================================
// enge-schirme.spec.ts — kleine Praesentationsgeraete.
//
// Zwei Altlasten, gefunden beim Anheben der Lesegroesse:
//  1. Die Saeule auf index.html war fuer 800px hohe Schirme zu hoch — der
//     Berater-Picker (5 Profile) schob Session-Aktionen und Fuss aus dem Bild.
//     Sichtbar wurde davon nichts: .bbz-rail ist overflow:hidden.
//  2. Die Topbar mit 11 Tabs passte bei 1280px Breite nicht; die letzten
//     Module waren ohne horizontales Scrollen nicht erreichbar.
// ============================================================================
import { test, expect } from '@playwright/test';

const MODULE = ['01-agenda', '05-cockpit', '07b-anlegen', '10-abschluss'];

test('Beratercockpit: auf 800px Hoehe wird nichts abgeschnitten', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('index.html');
  await page.waitForSelector('#beraterPicker .ix-bopt');

  const rail = await page.locator('.bbz-rail').evaluate((n) => ({
    sicht: n.clientHeight, inhalt: n.scrollHeight,
  }));
  expect(rail.inhalt).toBeLessThanOrEqual(rail.sicht + 2);

  // Was unten steht, muss erreichbar bleiben.
  await expect(page.locator('#btnReset')).toBeInViewport();
  await expect(page.locator('.rail-foot')).toBeInViewport();
});

test('Beratercockpit: auch bei sehr kurzem Schirm erreichbar', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 700 });
  await page.goto('index.html');
  await page.waitForSelector('#beraterPicker .ix-bopt');

  const rail = await page.locator('.bbz-rail').evaluate((n) => ({
    sicht: n.clientHeight, inhalt: n.scrollHeight,
  }));
  expect(rail.inhalt).toBeLessThanOrEqual(rail.sicht + 2);
  await expect(page.locator('#btnReset')).toBeInViewport();
});

test('Navigation passt bei 1280px Breite', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const eng: string[] = [];
  for (const m of MODULE) {
    await page.goto(`modules/${m}.html`);
    await page.waitForSelector('.bbz-nav-tab');
    const fehlt = await page.evaluate(() => {
      const nav = document.querySelector('.bbz-nav') as HTMLElement;
      return nav.scrollWidth - nav.clientWidth;
    });
    if (fehlt > 0) eng.push(`${m}: ${fehlt}px`);
  }
  expect(eng).toEqual([]);
});

test('Navigation behaelt bei 1280px ihre Beschriftung', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('modules/05-cockpit.html');
  await page.waitForSelector('.bbz-nav-tab');
  // Der letzte Tab muss lesbar bleiben, nicht nur seine Nummer.
  await expect(page.locator('.bbz-nav-tab').last()).toContainText('Abschluss');
});
