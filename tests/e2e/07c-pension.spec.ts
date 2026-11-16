import { test, expect } from '@playwright/test';

// Smoke 07c — Pensionierung (PensCheck-Oberflaeche in bbz360, ADR-16).
// Die Rechenwerte selbst sichern die Referenztests unter tests/unit/pension;
// hier geht es um die Kette Seite → Worker → Anzeige → bbzData.

test.beforeEach(async ({ page }) => {
  await page.goto('modules/07c-pension.html');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('leere Session: Formular startet ohne Urteil und ohne Skriptfehler', async ({ page }) => {
  const fehler: string[] = [];
  page.on('pageerror', (e) => fehler.push(e.message));
  await page.reload();
  await expect(page.locator('.bbz-nav-tab.active')).toHaveText(/07c\s+Pension/);
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'form');
  await expect(page.locator('#verdictText')).toContainText('Bitte erfassen Sie die Eckdaten');
  expect(fehler).toEqual([]);
});

test('Musterfall: Urteil, Bild und Kennzahlen erscheinen; der Stand liegt als haushalt in bbzData', async ({ page }) => {
  await page.locator('#btnMuster').click();
  await expect(page.locator('#verdictText')).toContainText(/Reicht|Knapp|Reicht nicht/);
  await expect(page.locator('#tabBody svg').first()).toBeVisible();
  const h = await page.evaluate(() => JSON.parse(localStorage.getItem('bbzData') || '{}').haushalt);
  expect(h.personen[0].jahrgang).toBe(1972);
  expect(h.ausgabenRuhestand).toBe(10000);
  // Reload: derselbe Stand, dasselbe Urteil
  const urteil = await page.locator('#verdictText').textContent();
  await page.reload();
  await expect(page.locator('#verdictText')).toHaveText(urteil as string);
});

test('Stammdaten und Cockpit fliessen in den ersten Stand ein (keine Doppelerfassung)', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('bbzData', JSON.stringify({
    __schemaVersion: 3, p1name: 'Anna Muster', p1geb: '1975-04-10', p2name: 'Beat Muster', p2geb: '1973-09-01',
    cockpit_data: { zahlen: { saldo: 40000 }, sparen: { saldo: 60000 }, anlegen: { volumen: 200000 },
      vorsorgen: { s3Saldo: 50000, pkSaldo: 300000 }, ausgaben: { eMann: 10000, eFrau: 5000, typ: 'brutto', freq: 'mtl' } },
  })));
  await page.reload();
  await expect(page.locator('#schritte')).toContainText('1975');
  await expect(page.locator('#schritte')).toContainText("120’000");
});

test('gemeinsam erfassen: Wechsel in den gefuehrten Modus und zurueck', async ({ page }) => {
  await page.locator('.mode[data-mode="tutor"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'tutor');
  await expect(page.locator('#tutor')).toBeVisible();
  await page.locator('.mode[data-mode="form"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'form');
});

test('Abschluss (10) zeigt das Urteil der Pensionierung aus dem gemeinsamen Stand', async ({ page }) => {
  await page.locator('#btnMuster').click();
  await expect(page.locator('#verdictText')).toContainText(/Reicht|Knapp/);
  await page.goto('modules/10-abschluss.html');
  const sec = page.locator('.ab-sec', { hasText: '07c · PENSIONIERUNG' });
  await expect(sec).toContainText(/Reicht|Knapp|Reicht nicht/);
  await expect(sec).toContainText('58 / 60');
  await expect(page.locator('#printScope option[value="pension"]')).toHaveCount(1);
});
