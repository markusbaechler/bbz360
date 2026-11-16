import { test, expect } from '@playwright/test';
import { musterEinlesen, stand } from './helfer';

// Befunde des zweiten Prüflaufs (2026-11-16), je mit der Abfolge, die den Fehler zeigte.

const leer = async (page: import('@playwright/test').Page, d: Record<string, unknown>) => {
  await page.goto('index.html');
  await page.evaluate((x) => { localStorage.clear(); localStorage.setItem('bbzData', JSON.stringify({ __schemaVersion: 3, ...x })); }, d);
};
const PAAR = { p1name: 'Anna Muster', p1geb: '1975-04-10', p2name: 'Beat Muster', p2geb: '1973-09-01' };

test('Cockpit: Verpflichtungen pro Jahr hängen nicht an der Eingabe-Frequenz des Einkommens (vorher zwölfmal zu klein)', async ({ page }) => {
  await leer(page, { p1name: 'Anna Muster', p1geb: '1975-04-10' });
  await page.goto('modules/05-cockpit.html');
  await page.locator('#cfr-eink').click();
  await page.locator('#f-leasing').fill('500');
  await page.locator('#f-unterhalt').fill('1000');
  await page.locator('[data-save="ausgaben"]').click();
  expect((await stand(page)).cockpit_verpflichtungen).toBe(18000);
  await page.locator('#cfr-eink').click();
  await page.locator('[data-v1-field="ausgaben__freq|pa"]').click();
  await page.locator('[data-save="ausgaben"]').click();
  expect((await stand(page)).cockpit_verpflichtungen).toBe(18000);
});

test('zweite Person aus den Stammdaten entfernt: 07a und Abschluss rechnen sofort als Einzelperson (vorher Paar-Einkommen)', async ({ page }) => {
  await leer(page, PAAR);
  await page.goto('modules/05-cockpit.html');
  await page.locator('#cfr-eink').click();
  await page.locator('#f-brutto1').fill('100000');
  await page.locator('#f-brutto2').fill('80000');
  await page.locator('[data-save="ausgaben"]').click();
  expect((await stand(page)).cockpit_einkommen).toBe(180000);
  // Stammdaten: Person 2 entfällt; das Cockpit wird danach nicht mehr besucht
  await page.goto('index.html');
  await page.locator('#p2name').fill('');
  await page.locator('#p2name').blur();
  await page.goto('modules/07a-finanzieren.html');
  await expect(page.locator('#income')).toHaveValue(/100.000/);
  await page.goto('modules/10-abschluss.html');
  await expect(page.locator('.ab-kpi', { hasText: 'Bruttoeinkommen p.a.' }).first()).toContainText(/100.000/);
});

test('07b: anlagefähiges Kapital folgt dem Haushalt (vorher der alte Wert aus dem Cockpit)', async ({ page }) => {
  await leer(page, { p1name: 'Anna Muster', p1geb: '1975-04-10' });
  await page.goto('modules/05-cockpit.html');
  await page.locator('#br-zahlen').click();
  await page.locator('#f-saldo').fill('20000');
  await page.locator('[data-save="zahlen"]').click();
  await page.locator('#br-sparen').click();
  await page.locator('#f-saldo').fill('80000');
  await page.locator('#f-reserve').fill('20000');
  await page.locator('[data-save="sparen"]').click();
  await page.goto('modules/07c-pension.html');
  await page.locator('#schritte button[data-schritt="vermoegen"]').click();
  await page.locator('[data-path="liquiditaet"]').fill('300000');
  await page.locator('[data-path="liquiditaet"]').blur();
  await expect.poll(async () => (await stand(page)).haushalt?.liquiditaet).toBe(300000);
  await page.goto('modules/07b-anlegen.html');
  await expect(page.locator('#cockpitAmtHint')).toContainText(/280.000/);
});

test('PensCheck-Stand einlesen: das Nettoeinkommen des bisherigen Falls entfällt', async ({ page }) => {
  await leer(page, { p1name: 'Anna Muster', p1geb: '1975-04-10' });
  await page.goto('modules/05-cockpit.html');
  await page.locator('#cfr-eink').click();
  await page.locator('#f-eMann').fill('4000');
  await page.locator('#f-brutto1').fill('60000');
  await page.locator('#f-haushalt').fill('3500');
  await page.locator('[data-save="ausgaben"]').click();
  await musterEinlesen(page, { leeren: false });
  const d = await stand(page);
  expect(d.cockpit_data.ausgaben.eMann).toBe(0);
  await page.goto('modules/05b-budget.html');
  await expect(page.locator('#buKpis')).toContainText('geschätzt aus dem Bruttolohn');
  await expect(page.locator('#buKpis')).not.toContainText('4’000');
});

test('Abschluss: ohne gerechneten Fall keine Entwarnung zur Absicherung; gleicher Stand wie 07e', async ({ page }) => {
  await musterEinlesen(page);
  // niemand erwerbstätig: beide Löhne 0
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('bbzData')!);
    d.haushalt.personen[0].brutto = 0; d.haushalt.personen[1].brutto = 0;
    localStorage.setItem('bbzData', JSON.stringify(d));
  });
  await page.goto('modules/07e-absicherung.html');
  await page.locator('[data-ursache="unfall"]').click();
  await expect(page.locator('#main')).toContainText('Keine Person des Haushalts ist heute erwerbstätig');
  await page.goto('modules/10-abschluss.html');
  const sec = page.locator('.ab-sec', { hasText: 'STEUERN, ABSICHERUNG, NACHLASS' });
  await expect(sec).toContainText('kein Fall gerechnet');
  await expect(sec).not.toContainText('gedeckt');
});

test('07e: das Feld «davon» zeigt nach einer abgewiesenen Eingabe wieder, womit gerechnet wird', async ({ page }) => {
  await musterEinlesen(page);
  await page.goto('modules/07e-absicherung.html');
  await page.locator('#abKinder').fill('2');
  await page.locator('#abKinderAbh').fill('1');
  await page.locator('#abKinderAbh').fill('5');
  await expect(page.locator('#abKinderAbh')).toHaveClass(/bad/);
  await page.locator('#abKinder').fill('6');
  await expect(page.locator('#abKinderAbh')).toHaveValue('1');
  await expect(page.locator('#abKinderAbh')).not.toHaveClass(/bad/);
  expect((await stand(page)).familie_kinder_abh).toBe(1);
});

test('07d: ohne Rechnung keine Aussage, der Plan sehe keinen Kapitalbezug vor', async ({ page }) => {
  await musterEinlesen(page);
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('bbzData')!);
    d.haushalt.ausgabenRuhestand = 0; d.haushalt.budgetAktiv = false;
    localStorage.setItem('bbzData', JSON.stringify(d));
  });
  await page.goto('modules/07d-steuern.html');
  await page.locator('#stEinkauf').fill('50000');
  await page.locator('#stEinkaufJahr').fill('2029');
  await expect(page.locator('#stSperre')).toContainText('nicht geprüft');
  await expect(page.locator('#stSperre')).not.toContainText('sieht bis dahin keinen Kapitalbezug');
});

test('07f: ein unvollständig getipptes Jahr gilt nicht; das Feld zeigt beim Verlassen wieder den gespeicherten Wert', async ({ page }) => {
  await musterEinlesen(page);
  await page.goto('modules/07f-nachlass.html');
  await page.locator('#naZuPlus').click();
  const z = page.locator('.fm-zeile').first();
  await z.locator('[data-zf="betrag"]').fill('100000');
  await expect(page.locator('[data-entwurf="0"]')).toHaveText('Rechnet noch nicht mit: Jahr fehlt.');
  await z.locator('[data-zf="jahr"]').fill('2035');
  await z.locator('[data-zf="jahr"]').fill('203');
  await z.locator('[data-zf="jahr"]').blur();
  await expect(z.locator('[data-zf="jahr"]')).toHaveValue('2035');
  expect((await stand(page)).haushalt.zufluesse).toEqual([{ name: '', betrag: 100000, jahr: 2035 }]);
});

// ---------- Dritter Prüflauf ----------

test('07a: Vorbelegungen frieren beim ersten Besuch nicht ein; der Abschluss rechnet mit denselben Werten', async ({ page }) => {
  await leer(page, { p1name: 'Anna Muster', p1geb: '1975-04-10' });
  const cockpit = async (brutto: string, leasing: string) => {
    await page.goto('modules/05-cockpit.html');
    await page.locator('#cfr-eink').click();
    await page.locator('#f-brutto1').fill(brutto);
    await page.locator('#f-leasing').fill(leasing);
    await page.locator('[data-save="ausgaben"]').click();
  };
  await cockpit('100000', '500');
  await page.goto('modules/07a-finanzieren.html'); // nur ansehen
  await expect(page.locator('#income')).toHaveValue(/100.000/);
  await page.waitForTimeout(400); // 07a speichert verzögert
  await cockpit('150000', '900');
  await page.goto('modules/07a-finanzieren.html');
  await expect(page.locator('#income')).toHaveValue(/150.000/);
  await expect(page.locator('#obligations')).toHaveValue(/10.800/);
  // ein von Hand erfasster Wert bleibt
  await page.locator('#income').fill('160000');
  await page.locator('#income').blur();
  await page.waitForTimeout(400);
  await cockpit('170000', '900');
  await page.goto('modules/07a-finanzieren.html');
  await expect(page.locator('#income')).toHaveValue(/160.000/);
});

test('07a nur besucht: ein Ziel «Wohnen» bleibt im Lebensplan eine gerechnete Ausgabe; der Abschluss zeigt keine Finanzierung', async ({ page }) => {
  await musterEinlesen(page);
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('bbzData')!);
    d.ziele = [{ id: 'r', katId: 'wohnen', typ: 'ziel', insp: 'Renovation / Umbau', name: 'Umbau', jahr: 2030, betrag: 80000 }];
    localStorage.setItem('bbzData', JSON.stringify(d));
  });
  await page.goto('modules/07a-finanzieren.html');
  await expect(page.locator('#price')).toHaveValue(/80.000/);
  await page.waitForTimeout(400);
  expect((await stand(page)).finanzierung_data.vorbelegt).toContain('price');
  await page.goto('modules/07-lebensplan.html');
  const zeile = page.locator('tr', { hasText: 'Umbau' });
  await expect(zeile).toContainText('06 Ziele');
  await expect(zeile).toContainText('Einmalige Ausgabe');
  await page.goto('modules/10-abschluss.html');
  await expect(page.locator('.ab-sec', { hasText: 'EIGENHEIMFINANZIERUNG' })).toHaveCount(0);
});

test('Cockpit: aus der Einzelperson wird ein Paar — das nächste Speichern kürzt 3a von Person 1 nicht', async ({ page }) => {
  await musterEinlesen(page);
  const vorher = (await stand(page)).haushalt.personen.map((p: { s3a: number }) => p.s3a);
  expect(vorher[1]).toBeGreaterThan(0);
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('bbzData')!);
    d.haushalt.haushalt = 'single';
    localStorage.setItem('bbzData', JSON.stringify(d));
  });
  await page.goto('modules/05-cockpit.html');
  await page.locator('#cfr-eink').click();
  await page.locator('#f-brutto2').fill('60000');
  await page.locator('[data-save="ausgaben"]').click();
  // ohne Neuladen ein weiteres Modal unverändert übernehmen
  await page.locator('#br-vorsorgen').click();
  await page.locator('[data-save="vorsorgen"]').click();
  const h = (await stand(page)).haushalt;
  expect(h.haushalt).toBe('verheiratet');
  expect(h.personen.map((p: { s3a: number }) => p.s3a)).toEqual(vorher);
});

test('PensCheck-Stand einlesen: die Verpflichtungen des bisherigen Falls entfallen', async ({ page }) => {
  await leer(page, { p1name: 'Anna Muster', p1geb: '1975-04-10' });
  await page.goto('modules/05-cockpit.html');
  await page.locator('#cfr-eink').click();
  await page.locator('#f-leasing').fill('500');
  await page.locator('#f-unterhalt').fill('1000');
  await page.locator('[data-save="ausgaben"]').click();
  await musterEinlesen(page, { leeren: false });
  await page.goto('modules/07a-finanzieren.html');
  await expect(page.locator('#obligations')).toHaveValue('');
  await expect(page.locator('#income')).not.toHaveValue('');
});
