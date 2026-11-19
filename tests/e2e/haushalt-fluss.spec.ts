import { test, expect } from '@playwright/test';

// «Haushalt fuehrt» (ADR-17): Was im Cockpit 05 erfasst wird, steht in der
// Pensionierung 07c — und umgekehrt. Keine Doppelerfassung.

test.beforeEach(async ({ page }) => {
  await page.goto('modules/05-cockpit.html');
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(() => localStorage.setItem('bbzData', JSON.stringify({
    __schemaVersion: 3, p1name: 'Anna Muster', p1geb: '1975-04-10', p2name: 'Beat Muster', p2geb: '1973-09-01',
  })));
  await page.reload();
});

test('05 → 07c: Bruttolohn, Geschlecht, Vermoegen und Vorsorge kommen in der Pensionierung an', async ({ page }) => {
  await page.locator('#cfr-eink').click();
  await expect(page.locator('#modalBody')).toContainText('Bruttolohn Anna Muster');
  await page.locator('#f-brutto1').fill('120000');
  await page.locator('[data-v1-field="ausgaben__geschlecht1|w"]').click();
  await page.locator('#f-brutto2').fill('60000');
  await page.locator('[data-v1-field="ausgaben__geschlecht2|m"]').click();
  await page.locator('#f-eMann').fill('8000');
  await page.locator('#f-haushalt').fill('6500');
  await page.locator('[data-save="ausgaben"]').click();
  await page.locator('#br-sparen').click();
  await page.locator('#f-saldo').fill('80000');
  await page.locator('[data-save="sparen"]').click();
  await page.locator('#br-anlegen').click();
  await page.locator('#f-volumen').fill('250000');
  await page.locator('[data-save="anlegen"]').click();
  await page.locator('#br-vorsorgen').click();
  await page.locator('#f-pkSaldo').fill('400000');
  await page.locator('#f-s3Saldo').fill('90000');
  await page.locator('[data-save="vorsorgen"]').click();

  const d = await page.evaluate(() => JSON.parse(localStorage.getItem('bbzData') || '{}'));
  expect(d.cockpit_einkommen).toBe(180000); // Bruttoloehne, nicht mehr Netto × 12
  expect(d.haushalt.personen[0]).toMatchObject({ jahrgang: 1975, geburtsmonat: 4, geschlecht: 'w', brutto: 120000, s3a: 90000, pkGuthabenHeute: 400000 });
  expect(d.haushalt.personen[1]).toMatchObject({ jahrgang: 1973, geschlecht: 'm', brutto: 60000 });
  expect(d.haushalt).toMatchObject({ haushalt: 'verheiratet', liquiditaet: 80000, wertschriften: 250000, ausgabenHeute: 6500 });

  await page.goto('modules/07c-pension.html');
  await expect(page.locator('#schritte')).toContainText('120’000');
  await expect(page.locator('#schritte')).toContainText('330’000'); // Liquiditaet + Wertschriften
});

test('07c → 05: eine Aenderung in der Pensionierung steht im Cockpit', async ({ page }) => {
  // Cockpit: Zahlungsverkehr 20'000, Sparen 60'000
  await page.locator('#br-zahlen').click();
  await page.locator('#f-saldo').fill('20000');
  await page.locator('[data-save="zahlen"]').click();
  await page.locator('#br-sparen').click();
  await page.locator('#f-saldo').fill('60000');
  await page.locator('[data-save="sparen"]').click();

  // Pensionierung: Wertschriften und Liquiditaet aendern (Schritt «Vermoegen und Ausgaben»)
  await page.goto('modules/07c-pension.html');
  await page.locator('#schritte button[data-schritt="vermoegen"]').click();
  await page.locator('[data-path="wertschriften"]').fill('300000');
  await page.locator('[data-path="wertschriften"]').blur();
  await page.locator('[data-path="liquiditaet"]').fill('100000');
  await page.locator('[data-path="liquiditaet"]').blur();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('bbzData') || '{}').haushalt?.liquiditaet)).toBe(100000);

  await page.goto('modules/05-cockpit.html');
  await expect(page.locator('#bv-anlegen')).toContainText("300'000");
  // Zahlungsverkehr bleibt, die Differenz traegt das Sparen: 20'000 + 80'000
  await expect(page.locator('#bv-zahlen')).toContainText("20'000");
  await expect(page.locator('#bv-sparen')).toContainText("80'000");
  await expect(page.locator('#k-liq')).toContainText("100'000");
});

test('Stammdaten: ein geaendertes Geburtsdatum wird in der Pensionierung nachgefuehrt', async ({ page }) => {
  await page.locator('#br-anlegen').click();
  await page.locator('#f-volumen').fill('1000');
  await page.locator('[data-save="anlegen"]').click();
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('bbzData') || '{}');
    d.p1geb = '1968-02-20';
    localStorage.setItem('bbzData', JSON.stringify(d));
  });
  await page.goto('modules/07c-pension.html');
  await expect(page.locator('#schritte')).toContainText('1968');
});

// ---------- Befunde des Assessments 2026-11 ----------

test('A3: Einkommen für Person 2 ohne Namen in den Stammdaten bleibt erhalten; der Haushalt rechnet mit zwei Personen', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('bbzData', JSON.stringify({ __schemaVersion: 3, p1name: 'Anna Muster', p1geb: '1975-04-10' })));
  await page.reload();
  await page.locator('#cfr-eink').click();
  await page.locator('#f-brutto1').fill('100000');
  await page.locator('#f-brutto2').fill('60000');
  await page.locator('[data-save="ausgaben"]').click();
  let d = await page.evaluate(() => JSON.parse(localStorage.getItem('bbzData') || '{}'));
  expect(d.cockpit_einkommen).toBe(160000);
  expect(d.haushalt.haushalt).toBe('verheiratet');
  // Neuladen: der Lohn von Person 2 ist noch da (vorher: 100'000, Person 2 gelöscht)
  await page.reload();
  d = await page.evaluate(() => JSON.parse(localStorage.getItem('bbzData') || '{}'));
  expect(d.cockpit_einkommen).toBe(160000);
  expect(d.cockpit_data.ausgaben.brutto2).toBe(60000);
  await page.locator('#cfr-eink').click();
  await expect(page.locator('#f-brutto2')).toHaveValue("60'000");
});

test('A4: «Ausgaben heute» haben eine Quelle — Budget und Cockpit überschreiben sich nicht, Löschen wirkt', async ({ page }) => {
  // Cockpit: Haushalt 5'000 + Leasing 800
  await page.locator('#cfr-ausg').click();
  await page.locator('#f-haushalt').fill('5000');
  await page.locator('#f-leasing').fill('800');
  await page.locator('[data-save="ausgaben"]').click();
  const h = () => page.evaluate(() => JSON.parse(localStorage.getItem('bbzData') || '{}').haushalt.ausgabenHeute);
  expect(await h()).toBe(5800);

  // Budget ändert auf 6'500 → Cockpit zeigt 6'500 (Differenz in «Haushalt»); ein fremdes Modal überschreibt nichts
  await page.goto('modules/05b-budget.html');
  await page.locator('#buHeute').fill('6500');
  await page.goto('modules/05-cockpit.html');
  await expect(page.locator('#bv-ausg')).toContainText("6'500");
  await page.locator('#br-zahlen').click();
  await page.locator('#f-saldo').fill('1000');
  await page.locator('[data-save="zahlen"]').click();
  expect(await h()).toBe(6500);

  // Budget ändert unter die Summe der übrigen Kategorien (800) → Kategorien werden gekürzt, die Summe stimmt
  await page.goto('modules/05b-budget.html');
  await page.locator('#buHeute').fill('500');
  await page.goto('modules/05-cockpit.html');
  await expect(page.locator('#bv-ausg')).toContainText('500');
  await page.locator('#br-zahlen').click();
  await page.locator('[data-save="zahlen"]').click();
  expect(await h()).toBe(500);

  // Im Cockpit alle Ausgaben löschen → «Ausgaben heute» ist leer und bleibt es nach dem Neuladen
  await page.locator('#cfr-ausg').click();
  for (const f of ['f-haushalt', 'f-leasing', 'f-unterhalt', 'f-uebrige']) await page.locator(`#${f}`).fill('');
  await page.locator('[data-save="ausgaben"]').click();
  expect(await h()).toBe('');
  await page.reload();
  await expect(page.locator('#bv-ausg')).toContainText('Erfassen');
  expect(await h()).toBe('');
});

test('A5/B2: Einkommen für 07a — Brutto je Person, sonst ihr Netto; Änderungen aus der Pensionierung kommen ohne Cockpit-Besuch an', async ({ page }) => {
  await page.locator('#cfr-eink').click();
  await page.locator('#f-eMann').fill('7000');
  await page.locator('#f-eFrau').fill('5000');
  await page.locator('[data-save="ausgaben"]').click();
  const eink = () => page.evaluate(() => JSON.parse(localStorage.getItem('bbzData') || '{}').cockpit_einkommen);
  expect(await eink()).toBe(144000);
  // nur für Person 1 ein Bruttolohn: Person 2 fällt nicht heraus (vorher: 100'000)
  await page.locator('#cfr-eink').click();
  await page.locator('#f-brutto1').fill('100000');
  await page.locator('[data-save="ausgaben"]').click();
  expect(await eink()).toBe(160000);
  // Lohn in der Pensionierung ändern → 07a sieht ihn sofort
  await page.goto('modules/07c-pension.html');
  await page.locator('#schritte button[data-schritt="einkommen"]').click();
  await page.locator('[data-path="personen.0.brutto"]').fill('120000');
  await page.locator('[data-path="personen.0.brutto"]').blur();
  await expect.poll(eink).toBe(180000);
  await page.goto('modules/07a-finanzieren.html');
  await expect(page.locator('#income')).toHaveValue("180'000");
});

test('A6: ältere Session mit Einkommens-Typ «brutto» — das Budget zeigt keinen Bruttolohn als Netto und kennt die Ausgaben', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('bbzData', JSON.stringify({
    __schemaVersion: 2, p1name: 'Anna', p2name: 'Beat',
    cockpit_data: { ausgaben: { eMann: 8000, eFrau: 5000, typ: 'brutto', freq: 'mtl', haushalt: 4000, leasing: 0, unterhalt: 0, uebrige: 0 } },
  })));
  await page.goto('modules/05b-budget.html');
  const kpis = page.locator('#buKpis .kpi');
  await expect(kpis.nth(0)).toContainText('geschätzt aus dem Bruttolohn');
  await expect(kpis.nth(0)).not.toContainText('CHF 13’000');
  await expect(page.locator('#buHeute')).toHaveValue('4’000');
});
