import { test, expect } from '@playwright/test';

// 05b Budget & Liquiditaet (ADR-17): rechnet auf dem gemeinsamen Haushalts-Stand.

test.beforeEach(async ({ page }) => {
  await page.goto('modules/05b-budget.html');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('Smoke: 8 Positionen, Navigation, ohne Skriptfehler', async ({ page }) => {
  const fehler: string[] = [];
  page.on('pageerror', (e) => fehler.push(e.message));
  await page.reload();
  await expect(page.locator('.bbz-nav-tab.active')).toContainText('Budget');
  await expect(page.locator('#buPos .bu-row')).toHaveCount(8);
  await expect(page.locator('#buAktiv')).toBeDisabled();
  expect(fehler).toEqual([]);
});

test('Musterbudget, eigene Miete und «gilt als Ausgaben im Ruhestand» landen im Haushalts-Stand', async ({ page }) => {
  await page.locator('[data-muster="mittel"]').click();
  await page.locator('#bu_wohnen').fill('2000');
  await expect(page.locator('#buAktiv')).toBeEnabled();
  await page.locator('#buAktiv').check();
  const summe = await page.locator('#buSumme').textContent();
  const h = await page.evaluate(() => JSON.parse(localStorage.getItem('bbzData') || '{}').haushalt);
  expect(h.budgetAktiv).toBe(true);
  expect(h.budgetBasis).toBe('mittel');
  expect(h.fix.wohnen).toBe(2000);
  expect(`CHF ${new Intl.NumberFormat('de-CH').format(h.ausgabenRuhestand).replace(/['’]/g, '’')}`).toBe(summe);
  // eine Position aendern: die Ausgaben im Ruhestand folgen
  await page.locator('#bu_freizeit').fill('2000');
  const h2 = await page.evaluate(() => JSON.parse(localStorage.getItem('bbzData') || '{}').haushalt);
  expect(h2.ausgabenRuhestand).toBe(h.ausgabenRuhestand - h.budget.freizeit + 2000);
  // Reload: Felder und Haken stehen wieder
  await page.reload();
  await expect(page.locator('#buAktiv')).toBeChecked();
  await expect(page.locator('#bu_freizeit')).toHaveValue('2’000');
});

test('Kennzahlen: Netto aus dem Cockpit, Sparbetrag, Reserve', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('bbzData', JSON.stringify({
    __schemaVersion: 3, p1name: 'Anna',
    cockpit_data: { zahlen: { saldo: 20000 }, sparen: { saldo: 40000 }, ausgaben: { eMann: 9000, eFrau: 0, freq: 'mtl' } },
  })));
  await page.reload();
  await page.locator('#buHeute').fill('7500');
  const kpis = page.locator('#buKpis .kpi');
  await expect(kpis.nth(0)).toContainText('CHF 9’000');
  await expect(kpis.nth(0)).toContainText('aus dem Finanz-Cockpit');
  await expect(kpis.nth(1)).toContainText('CHF 1’500');
  await expect(kpis.nth(2)).toContainText('8.0 Monate');
  // dieselben Ausgaben stehen im Cockpit
  await page.goto('modules/05-cockpit.html');
  await expect(page.locator('#bv-ausg')).toContainText("7'500");
});

test('ungueltige Eingabe wird abgewiesen, der Stand bleibt', async ({ page }) => {
  await page.locator('#bu_kk').fill('800');
  await page.locator('#bu_kk').fill('abc');
  await expect(page.locator('#bu_kk')).toHaveClass(/bad/);
  const h = await page.evaluate(() => JSON.parse(localStorage.getItem('bbzData') || '{}').haushalt);
  expect(h.budget.kk).toBe(800);
});
