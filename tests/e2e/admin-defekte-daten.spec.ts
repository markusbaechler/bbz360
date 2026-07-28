// ============================================================================
// admin-defekte-daten.spec.ts — Regression: unvollstaendige bbzAdmin-Profile
// duerfen die Administration nicht lahmlegen.
//
// bbzAdmin ist ein browser-lokaler Store, den auch ein Session-Import oder eine
// haendische Korrektur fuellt. Fehlten die Kacheln, warf renderFotos() beim
// Laden — init() brach ab, KEIN Listener wurde angehaengt, die Seite war tot.
// ============================================================================
import { test, expect } from '@playwright/test';

test('Profil ohne Kacheln: Administration bleibt vollstaendig bedienbar', async ({ page }) => {
  const fehler: string[] = [];
  page.on('pageerror', (e) => fehler.push(e.message));

  await page.goto('admin.html');
  await page.evaluate(() => localStorage.setItem('bbzAdmin', JSON.stringify([
    { id: 1, name: 'Unvollstaendig Gespeichert', titel: 'Kundenberater:in' },
  ])));
  await page.reload();

  await expect(page.locator('#chTitle')).toHaveText('Unvollstaendig Gespeichert');
  await expect(page.locator('#fotoRow .ad-foto')).toHaveCount(3);
  await expect(page.locator('#kachelTabs .ad-tab')).toHaveCount(3);

  // Listener haengen wirklich: dritte Kachel oeffnen und beschriften.
  await page.locator('#fotoRow [data-foto="2"]').click();
  await expect(page.locator('#fotoModalBg')).toBeVisible();
  await page.locator('#fmClose').click();
  await page.locator('#kachelTabs [data-tab="3"]').click();
  await page.locator('#kachelEditor').fill('Verlaesslichkeit.');
  await page.locator('#btnSave').click();
  await expect(page.locator('#toast')).toContainText('Profil gespeichert');

  const gespeichert = await page.evaluate(() => {
    const a = JSON.parse(localStorage.getItem('bbzAdmin') || '[]') as Array<{ kacheln: Array<{ content: string }> }>;
    return a[0].kacheln.map((k) => k.content);
  });
  expect(gespeichert[2]).toContain('Verlaesslichkeit');
  expect(fehler).toEqual([]);
});
