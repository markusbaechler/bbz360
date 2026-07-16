import { test, expect } from '@playwright/test';

// ============================================================================
// Modulübergreifende Integration (Endspurt):
// 1) Prefill-Kette: Cockpit (05) erfasst → 07a/07b/10 lesen die Prefills
// 2) v1-Migrations-Test: rohes v1-bbzData (Strings, Legacy-Formate) → v2
//    liest verlustfrei (ADR-4, schema.migrate)
// ============================================================================

test('Prefill-Kette: 05 → 07a → 07b → 10', async ({ page }) => {
  // 05: Ausgaben + Sparen + Vorsorgen erfassen (füllt cockpit_*-Prefills)
  await page.goto('modules/05-cockpit.html');
  await page.locator('#cfr-eink').click();
  await page.locator('#f-eMann').fill('9000');
  await page.locator('#f-haushalt').fill('4000');
  await page.locator('[data-save="ausgaben"]').click();
  await page.locator('#br-sparen').click();
  await page.locator('#f-saldo').fill('80000');
  await page.locator('#f-reserve').fill('30000');
  await page.locator('[data-save="sparen"]').click();
  await page.locator('#br-vorsorgen').click();
  await page.locator('#f-pkSaldo').fill('260000');
  await page.locator('[data-save="vorsorgen"]').click();

  const d = await page.evaluate(() => JSON.parse(localStorage.getItem('bbzData') || '{}'));
  expect(d.cockpit_einkommen).toBe(108000);   // 9'000 × 12
  expect(d.cockpit_anlage_f).toBe(50000);     // 80'000 − 30'000
  expect(d.cockpit_pk_saldo).toBe(260000);

  // 06: Wohnen-Ziel erfassen (→ 07a-Kaufpreis-Prefill)
  await page.goto('modules/06-ziele.html');
  await page.locator('[data-kat="wohnen"]').click();
  await page.locator('[data-v1-field="insp|Erstwohnung kaufen"]').click();
  await page.locator('#mz-save').click();

  // 07a: Prefills aus 05/06
  await page.goto('modules/07a-finanzieren.html');
  await expect(page.locator('#income')).toHaveValue("108'000");
  await expect(page.locator('#price')).toHaveValue("800'000");   // Default-Betrag Wohnen-Kategorie
  await expect(page.locator('#pk-info-label')).toContainText("260'000");

  // 07b: anlagefähiges Kapital aus 05
  await page.goto('modules/07b-anlegen.html');
  await expect(page.locator('#amtInput')).toHaveValue("50'000");
  await expect(page.locator('#cockpitAmtHint')).toContainText("50'000");

  // 10: Zusammenfassung zeigt Kundenbild aus 05
  await page.goto('modules/10-abschluss.html');
  await expect(page.locator('.ab-kpi', { hasText: 'Bruttoeinkommen' })).toContainText("108'000");
  await expect(page.locator('.ab-kpi', { hasText: '2. Säule' })).toContainText("260'000");
});

test('v1-Migration: rohes v1-bbzData wird verlustfrei gelesen (ADR-4)', async ({ page }) => {
  // v1 schrieb Beträge teils als formatierte STRINGS; alte Keys bleiben erhalten.
  await page.addInitScript(() => {
    if (!localStorage.getItem('bbzData')) {
      localStorage.setItem('bbzData', JSON.stringify({
        // KEIN __schemaVersion — rohes v1-Objekt
        p1name: 'Alt Kunde', p1geb: '1975-05-05', beratungsdatum: '2026-07-01',
        cockpit_einkommen: "120'000",                       // v1: String mit Apostroph
        cockpit_anlage_f: '45000',
        agenda_erwartungen: ['Weniger Gebühren zahlen'],
        finanzierung_data: {
          inputs: { income: "120'000", price: "900'000", cashEquity: "180'000", pensionWithdraw: '', pensionPledge: '0', calcRate: '5.00', sideRate: '0.75', age: '50', obligations: '', currentRent: '' },
          variants: [{ id: 1, tranches: [{ p: 'SARON', a: 720000 }, { p: 'SARON', a: 0 }, { p: 'SARON', a: 0 }] }],
          rates: { SARON: 1.65 },
        },
        ziele: [{ id: 'z_1', katId: 'familie', typ: 'ziel', insp: 'Heirat / Hochzeit', name: 'Hochzeit', jahr: 2027, betrag: 20000, prob: 'sicher', notiz: '' }],
        bankTexts: { tradition: 'Alter v1-Text.' },
        fb_ratings: [8],
      }));
      // v1-Philosophie-Key (eigener Store)
      localStorage.setItem('bbz_beratungsphilosophie_v1', JSON.stringify({
        moduleTitle: 'v1-Titel bleibt.', phases: [{ quote: '«v1-Zitat.»', benefit: 'v1-Nutzen.' }],
      }));
    }
  });

  // 07a: migrierte number-Inputs korrekt formatiert, Fixtures rechnen (120k/900k/180k/50J)
  await page.goto('modules/07a-finanzieren.html');
  await expect(page.locator('#income')).toHaveValue("120'000");
  await expect(page.locator('#price')).toHaveValue("900'000");
  await expect(page.locator('#kpiLTV')).toHaveText('80%');
  await page.waitForTimeout(350); // Persist-Debounce (200ms)
  const mig = await page.evaluate(() => JSON.parse(localStorage.getItem('bbzData') || '{}'));
  expect(mig.__schemaVersion).toBe(2); // migrate() hat das v1-Objekt angehoben
  // Reload: migrierte Werte bleiben korrekt lesbar (String → number → Anzeige)
  await page.reload();
  await expect(page.locator('#price')).toHaveValue("900'000");

  // 02: v1-bankTexts bleiben
  await page.goto('modules/02-bank.html');
  await page.locator('[data-key="tradition"]').click();
  await expect(page.locator('#modalText')).toHaveText('Alter v1-Text.');
  await page.keyboard.press('Escape');

  // 04: v1-Philosophie-Store bleibt lesbar
  await page.goto('modules/04-philosophie.html');
  await expect(page.locator('#moduleTitle')).toHaveText('v1-Titel bleibt.');
  await page.locator('#card-0').click();
  await expect(page.locator('#modalQuote')).toHaveText('«v1-Zitat.»');
  await page.keyboard.press('Escape');

  // 06: v1-Ziele erscheinen
  await page.goto('modules/06-ziele.html');
  await expect(page.locator('#stZiele')).toHaveText('1');

  // 09: v1-Ratings + Erwartungen
  await page.goto('modules/09-feedback.html');
  await expect(page.locator('#fb-num-0')).toHaveText('8');
});
