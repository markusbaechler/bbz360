import { test, expect } from '@playwright/test';
import { musterEinlesen, stand } from './helfer';
import { MUSTER } from './muster.fixture';

// 07c — Pensionierung (PensCheck-Oberflaeche in bbz360, ADR-16, ADR-22).
// Die Rechenwerte selbst sichern die Referenztests unter tests/unit/pension;
// hier geht es um die Kette Seite → Worker → Anzeige → bbzData und um die
// Regel «ein Kundenfall pro Sitzung».

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

test('A1: ein Kundenfall — kein Musterfall, kein «Neu beginnen», kein Übungsmodus', async ({ page }) => {
  // Bedienelemente, die den Stand ersetzen würden, gibt es nicht
  for (const id of ['btnMuster', 'btnReset', 'btnNeu', 'btnNeuJa', 'exampleBar']) await expect(page.locator(`#${id}`)).toHaveCount(0);
  // Der geführte Modus beginnt beim ersten Erfassungsschritt, nicht bei der Auswahl «neu / Beispiel»
  await page.locator('.mode[data-mode="tutor"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-tstep', 'haushalt');
  await expect(page.locator('[data-tact="practice"]')).toHaveCount(0);
  await expect(page.locator('[data-tact="own"]')).toHaveCount(0);
  // «Zurück» im ersten Schritt führt nicht zur Startauswahl
  await page.locator('[data-tnav="back"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-tstep', 'haushalt');
});

test('A1: Cockpit-Daten überstehen die Arbeit in der Pensionierung', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('bbzData', JSON.stringify({ __schemaVersion: 3, p1name: 'Anna Muster', p1geb: '1975-04-10' })));
  await page.goto('modules/05-cockpit.html');
  await page.locator('#br-zahlen').click();
  await page.locator('#f-saldo').fill('20000');
  await page.locator('[data-save="zahlen"]').click();
  await page.locator('#br-vorsorgen').click();
  await page.locator('#f-pkSaldo').fill('150000');
  await page.locator('#f-s3Saldo').fill('30000');
  await page.locator('[data-save="vorsorgen"]').click();
  await page.locator('#cfr-eink').click();
  await page.locator('#f-brutto1').fill('90000');
  await page.locator('[data-save="ausgaben"]').click();

  // Pensionierung: beide Modi besuchen, einen Wert im Formular ändern
  await page.goto('modules/07c-pension.html');
  await page.locator('.mode[data-mode="tutor"]').click();
  await page.locator('.mode[data-mode="form"]').click();
  await page.locator('#schritte button[data-schritt="vermoegen"]').click();
  await page.locator('[data-path="ausgabenRuhestand"]').fill('6000');
  await page.locator('[data-path="ausgabenRuhestand"]').blur();
  await expect(page.locator('#verdictText')).toContainText(/Reicht|Knapp|aufgebraucht/);

  await page.goto('modules/05-cockpit.html');
  const d = await stand(page);
  expect(d.cockpit_einkommen).toBe(90000);
  expect(d.cockpit_pk_saldo).toBe(150000);
  await expect(page.locator('#bv-zahlen')).toContainText("20'000");
  await expect(page.locator('#bv-vorsorgen')).toContainText("30'000");
  expect(d.haushalt.personen[0]).toMatchObject({ jahrgang: 1975, brutto: 90000, s3a: 30000, pkGuthabenHeute: 150000 });
  expect(d.haushalt.haushalt).toBe('single');
});

test('eingelesener Stand: Urteil, Bild und Kennzahlen erscheinen; der Stand liegt als haushalt in bbzData', async ({ page }) => {
  await musterEinlesen(page);
  await expect(page.locator('#tabBody svg').first()).toBeVisible();
  const h = (await stand(page)).haushalt;
  expect(h.personen[0].jahrgang).toBe(1972);
  expect(h.ausgabenRuhestand).toBe(10000);
  expect(h.ui.practice).toBe(false);
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
  await expect(page.locator('#schritte')).toContainText('120’000');
});

test('gemeinsam erfassen: Wechsel in den geführten Modus und zurück', async ({ page }) => {
  await page.locator('.mode[data-mode="tutor"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'tutor');
  await expect(page.locator('#tutor')).toBeVisible();
  await page.locator('.mode[data-mode="form"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'form');
});

test('Abschluss (10) zeigt das Urteil von Lebensplan und Pensionierung aus dem gemeinsamen Stand', async ({ page }) => {
  await musterEinlesen(page);
  await page.goto('modules/10-abschluss.html');
  const sec = page.locator('.ab-sec', { hasText: '07 · LEBENSPLAN & PENSIONIERUNG' });
  await expect(sec).toContainText(/Reicht|Knapp|Reicht nicht/);
  await expect(sec).toContainText('58 / 60');
  await expect(page.locator('#printScope option[value="pension"]')).toHaveCount(1);
});

test('PensCheck-Stand einlesen: Link wird gelesen, Unlesbares abgewiesen', async ({ page }) => {
  const link = await page.evaluate((muster) => {
    const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify({ v: 1, ...muster })))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `https://bbzsg.ch/PensCheck/#angaben=${b64}`;
  }, MUSTER);
  await page.locator('#btnImport').click();
  await page.locator('#importText').fill('das ist kein Link');
  await page.locator('#btnImportJa').click();
  await expect(page.locator('#importFehler')).toBeVisible();
  await page.locator('#importText').fill(link);
  await page.locator('#btnImportJa').click();
  await expect(page.locator('#verdictText')).toContainText('Knapp. Wenn Person 1 mit 58 und Person 2 mit 60 aufhört');
});

test('A2: ein eingelesener Stand übernimmt die Stammdaten; die Rückfrage nennt, was ersetzt wird', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('bbzData', JSON.stringify({ __schemaVersion: 3, p1name: 'Anna Muster', p1geb: '1980-03-15' })));
  await page.reload();
  await page.locator('#btnImport').click();
  await page.locator('#importText').fill(JSON.stringify(MUSTER));
  await page.locator('#btnImportJa').click();
  // eigene Angaben (Stammdaten) sind da: Rückfrage
  await expect(page.locator('#confirmText')).toContainText('Finanz-Cockpit');
  await page.locator('#btnConfirmJa').click();
  await expect(page.locator('#verdictText')).toContainText(/reicht|Knapp|aufgebraucht/i);
  const h = (await stand(page)).haushalt;
  // Geburtsdatum und Name aus den Stammdaten gehen vor (vorher: Jahrgang des fremden Stands, kein Kundenname)
  expect(h.personen[0]).toMatchObject({ jahrgang: 1980, geburtsmonat: 3 });
  expect(h.bericht.kunde).toBe('Anna Muster');
  // … und bleiben nach dem Neuladen
  await page.reload();
  await expect(page.locator('#schritte')).toContainText('1980');
});
