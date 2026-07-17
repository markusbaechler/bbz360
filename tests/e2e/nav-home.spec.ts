import { test, expect } from '@playwright/test';

// Regression: v1 hatte in jeder Modul-Topbar einen Home-Button (→ index.html).
// Ohne ihn kommt man aus einer laufenden Beratung nicht zurück ins
// Beratercockpit. Fix: bbz-Logo = Home-Link (../index.html) in ALLEN Modulen.
const MODULES = [
  '01-agenda', '02-bank', '03-berater', '04-philosophie', '05-cockpit',
  '06-ziele', '07a-finanzieren', '07b-anlegen', '08-vereinbarungen',
  '09-feedback', '10-abschluss',
];

test('Jedes Modul hat einen Rücksprung zum Beratercockpit (Logo = Home-Link)', async ({ page }) => {
  for (const m of MODULES) {
    await page.goto(`modules/${m}.html`);
    const logo = page.locator('a.bbz-logo');
    await expect(logo, `${m}: Logo ist kein Home-Link`).toHaveCount(1);
    await expect(logo).toHaveAttribute('href', '../index.html');
    await expect(logo).toHaveAttribute('aria-label', /Beratercockpit/);
  }
});

test('Klick aufs Logo führt zurück ins Beratercockpit', async ({ page }) => {
  await page.goto('modules/05-cockpit.html');
  await page.locator('a.bbz-logo').click();
  await expect(page).toHaveURL(/\/$|index\.html/);
  await expect(page.locator('#beraterPicker')).toBeVisible();
});
