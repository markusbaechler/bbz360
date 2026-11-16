import { test, expect } from '@playwright/test';
import { musterEinlesen, stand } from './helfer';

// 07d Steuern, 07e Absicherung, 07f Nachlass (Phasen 6–8). Die Rechenregeln
// sichern tests/unit/fachmodule.test.ts; hier die Kette Seite → Stand → Abschluss.

const musterfall = (page: import('@playwright/test').Page): Promise<void> => musterEinlesen(page);

test('07d Steuern: Kapitalbezüge, Abzüge, Sperrfrist, Themen', async ({ page }) => {
  const fehler: string[] = [];
  page.on('pageerror', (e) => fehler.push(e.message));
  await musterfall(page);
  await page.goto('modules/07d-steuern.html');
  await expect(page.locator('.bbz-nav-tab.active')).toContainText('Steuern');
  // Kapitalbezüge aus der Rechnung
  const kpis = page.locator('#stKapKpis .kpi');
  await expect(kpis).toHaveCount(3);
  await expect(kpis.nth(0)).toContainText('Steuer wie geplant');
  await expect(page.locator('#stKapListe tr.tot')).toContainText('Total');
  // Abzüge erst mit Grenzsteuersatz
  await expect(page.locator('#stAbzKpis')).toContainText('Grenzsteuersatz erfassen');
  await page.locator('#stGrenz').fill('30');
  await page.locator('#stEinkauf').fill('50000');
  await expect(page.locator('#stAbzKpis .kpi').nth(2)).toContainText('CHF 15’000');
  // Sperrfrist: PK-Kapital des Musterfalls 2030 → Einkauf 2029 kollidiert
  await page.locator('#stEinkaufJahr').fill('2029');
  await expect(page.locator('#stSperre')).toContainText('Sperrfrist bis Ende 2031');
  await expect(page.locator('#stSperre')).toHaveAttribute('data-st', 'schlecht');
  // Vermögenssteuer und Themen
  await expect(page.locator('#stVermKpis')).toContainText('Vermögenssteuer pro Jahr');
  await page.locator('[data-thema="staffeln"]').check();
  await page.locator('#stNotiz').fill('3a-Konten aufteilen');
  const d = await stand(page);
  expect(d.steuern).toMatchObject({ grenzsatz: 30, einkauf: 50000, einkaufJahr: 2029, themen: { staffeln: true }, notiz: '3a-Konten aufteilen' });
  await page.reload();
  await expect(page.locator('#stGrenz')).toHaveValue('30');
  await expect(page.locator('[data-thema="staffeln"]')).toBeChecked();
  expect(fehler).toEqual([]);
});

test('07e Absicherung: Fälle je Person, Unfall, Pensionskasse laut Ausweis', async ({ page }) => {
  await musterfall(page);
  await page.goto('modules/07e-absicherung.html');
  await expect(page.locator('#abFaelle article')).toHaveCount(4); // 2 Personen × Invalidität/Tod
  const f = page.locator('[data-fall="0-tod"]');
  await expect(f).toContainText('AHV-Witwenrente');
  await page.locator('#abKinder').fill('2');
  await expect(f).toContainText('AHV-Waisenrenten (2)');
  await page.locator('#abPk_0_partnerRente').fill('28000');
  await expect(f.locator('tr', { hasText: 'Pensionskasse' })).toContainText('CHF 28’000');
  await page.locator('[data-ursache="unfall"]').click();
  await expect(f).toContainText('UVG-Hinterlassenenrenten');
  await expect(page.locator('[data-fall="0-invalid"]')).toContainText('UVG-Invalidenrente');
  const d = await stand(page);
  expect(d.familie_kinder).toBe(2);
  expect(d.absicherung).toMatchObject({ ursache: 'unfall' });
  expect(d.absicherung.pk[0].partnerRente).toBe(28000);
});

test('07f Nachlass: Erbfolge, freie Quote, erwartete Erbschaft als Zufluss in Pensionierung und Lebensplan', async ({ page }) => {
  await musterfall(page);
  await page.goto('modules/07f-nachlass.html');
  // verheiratet, ohne Kinder, Eltern leben: 3/4 und 1/4
  await expect(page.locator('#naErben')).toContainText('3/4');
  await page.locator('#naKinder').fill('2');
  await expect(page.locator('#naErben tr').nth(0)).toContainText('1/2');
  await expect(page.locator('#naKpis .kpi').nth(0)).toContainText('1/2');
  await page.locator('#naNachlass').fill('800000');
  await expect(page.locator('#naKpis .kpi').nth(1)).toContainText('CHF 400’000');
  // Erbschaft erfassen → Zufluss im Haushalts-Stand
  await page.locator('#naZuPlus').click();
  await page.locator('[data-zf="name"]').fill('Erbschaft Eltern');
  await page.locator('[data-zf="betrag"]').fill('300000');
  await page.locator('[data-zf="jahr"]').fill('2036');
  await page.locator('[data-thema="testament"]').check();
  const d = await stand(page);
  expect(d.haushalt.zufluesse).toEqual([{ name: 'Erbschaft Eltern', betrag: 300000, jahr: 2036 }]);
  expect(d.familie_kinder).toBe(2);
  // … und in der Pensionierung im Ablauf
  await page.goto('modules/07c-pension.html');
  await page.locator('#schritte button[data-schritt="urteil"]').click();
  await page.locator('#resTabs [role="tab"]', { hasText: 'Ablauf' }).click();
  await expect(page.locator('#tabBody')).toContainText('Zufluss: Erbschaft Eltern');
  // Entfernen räumt den Stand wieder auf
  await page.goto('modules/07f-nachlass.html');
  await expect(page.locator('[data-zf="name"]')).toHaveValue('Erbschaft Eltern');
  await page.locator('[data-zf-weg]').click();
  expect('zufluesse' in (await stand(page)).haushalt).toBe(false);
});

test('Abschluss nennt vorgemerkte Themen und die grösste Lücke', async ({ page }) => {
  await musterfall(page);
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('bbzData') || '{}');
    d.steuern = { themen: { staffeln: true } };
    d.nachlass = { themen: { testament: true, vorsorgeauftrag: true } };
    d.absicherung = { ursache: 'krankheit', bedarfMonat: 14000, pk: [] };
    localStorage.setItem('bbzData', JSON.stringify(d));
  });
  await page.goto('modules/10-abschluss.html');
  const sec = page.locator('.ab-sec', { hasText: '07d–07f' });
  await expect(sec).toContainText('Kapitalbezüge auf mehrere Jahre verteilen');
  await expect(sec).toContainText('Testament · Vorsorgeauftrag');
  await expect(sec).toContainText('grösste Lücke');
});
