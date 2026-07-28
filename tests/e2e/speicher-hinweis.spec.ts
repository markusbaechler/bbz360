// ============================================================================
// speicher-hinweis.spec.ts — Regression: scheitert das Schreiben von bbzData,
// muss der Berater es erfahren.
//
// BBZ.set/merge verschluckten den QuotaExceededError (nur console.warn). Die
// Module schreiben bei jeder Eingabe; war der Speicher voll, ging eine ganze
// Beratung verloren, ohne dass die Oberflaeche etwas anmerkte.
// ============================================================================
import { test, expect } from '@playwright/test';
import { speicherFuellen } from './speicher.fixture';

const HINWEIS = '.bbz-speicherhinweis';

test('Modul 05 meldet den vollen Speicher sichtbar', async ({ page }) => {
  await page.goto('index.html');
  await speicherFuellen(page);

  await page.goto('modules/05-cockpit.html');

  await expect(page.locator(HINWEIS)).toContainText('Speicher voll');
  await expect(page.locator(HINWEIS)).toContainText('nicht gespeichert');
});

test('Hinweis laesst sich schliessen und bleibt einmalig', async ({ page }) => {
  await page.goto('index.html');
  await speicherFuellen(page);
  await page.goto('modules/05-cockpit.html');

  await expect(page.locator(HINWEIS)).toHaveCount(1);
  await page.locator(`${HINWEIS} button`).click();
  await expect(page.locator(HINWEIS)).toHaveCount(0);
});

test('kein Fehlalarm im Normalbetrieb', async ({ page }) => {
  await page.goto('modules/05-cockpit.html');
  await page.waitForSelector('.bbz-nav-tab');
  await expect(page.locator(HINWEIS)).toHaveCount(0);
});

test('auch das Beratercockpit meldet den vollen Speicher', async ({ page }) => {
  await page.goto('index.html');
  await speicherFuellen(page);
  await page.reload();

  await page.locator('#p1name').fill('Anna Muster'); // onKundeChange -> BBZ.merge
  await expect(page.locator(HINWEIS)).toContainText('Speicher voll');
});
