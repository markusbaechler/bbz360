import { test, expect } from '@playwright/test';
import { MODAL_PARITY } from './modal-parity.fixture';

// ============================================================================
// GATE MODAL-PARITÄT (ADR-12): Jedes v1-Modalelement MUSS im v2-Modal existieren.
// Vereinfachung von v1-Funktionalität ist kein zulässiger Design-Entscheid
// (DESIGN-SPEC §5). Fehlt ein Feld/Option → roter Test → kein Commit.
// Läuft ab jetzt in jedem Modul-Gate mit Erfassungsmodalen.
// ============================================================================
test('05 Cockpit — MODAL-PARITÄT (v1-Funktionsumfang vollständig)', async ({ page }) => {
  await page.goto('modules/05-cockpit.html');
  await expect(page.locator('.rail-title')).toHaveText('Finanz-Cockpit');

  for (const [modal, spec] of Object.entries(MODAL_PARITY)) {
    await test.step(`Modal ${modal}`, async () => {
      await page.locator(spec.trigger).click();
      await expect(page.locator('#modalBg')).toBeVisible();

      // 1) Jedes v1-Feld / jeder Options-Button ist vorhanden (data-v1-field).
      for (const token of spec.fields) {
        await expect(
          page.locator(`#modalBody [data-v1-field="${token}"]`),
          `${modal}: v1-Element "${token}" fehlt im v2-Modal`,
        ).toHaveCount(1);
      }

      // 2) Selects tragen ALLE v1-Optionswerte.
      for (const [selectId, values] of Object.entries(spec.options)) {
        const actual = await page.locator(`#${selectId} option`).evaluateAll(
          (opts) => opts.map((o) => (o as HTMLOptionElement).value));
        for (const v of values) {
          expect(actual, `${modal}: Option "${v}" fehlt in ${selectId}`).toContain(v);
        }
      }

      // 3) Pflicht-Elemente ohne f-*-id: Live-Vorschau + konditionale Wrapper (im DOM).
      for (const id of spec.extras) {
        await expect(
          page.locator(`#${id}`),
          `${modal}: Pflicht-Element #${id} fehlt`,
        ).toHaveCount(1);
      }

      await page.locator('#modalClose').click();
      await expect(page.locator('#modalBg')).toBeHidden();
    });
  }
});

// Verhaltens-Parität: konditionale Felder, Kanäle-Mehrfachwahl, quoteTyp-Persistenz,
// prevCF-Live, Snapshot-Rollback bei Abbruch.
test('05 Cockpit — Modal-Verhalten (Konditionale, Tags, Rollback, prevCF)', async ({ page }) => {
  await page.goto('modules/05-cockpit.html');

  // Vorsorgen: 3a-Einzahlung "anderer" blendet Betragsfeld ein; Anlageform steuert Strategie
  await page.locator('#br-vorsorgen').click();
  await expect(page.locator('#s3bw')).toBeHidden();
  await page.locator('[data-v1-field="vorsorgen__s3Einz|anderer"]').click();
  await expect(page.locator('#s3bw')).toBeVisible();
  await expect(page.locator('#strat-wrap')).toBeHidden();
  await page.locator('[data-v1-field="vorsorgen__s3Form|Wertschriften"]').click();
  await expect(page.locator('#strat-wrap')).toBeVisible();
  await page.locator('#modalClose').click();  // Abbruch → Rollback

  // Rollback: erneut öffnen, s3Einz zurück auf Default (nein) → Betragsfeld versteckt
  await page.locator('#br-vorsorgen').click();
  await expect(page.locator('#s3bw')).toBeHidden();
  await expect(page.locator('[data-v1-field="vorsorgen__s3Einz|nein"]')).toHaveClass(/on/);
  await page.locator('#modalClose').click();

  // Zahlen: Kanäle mehrfach wählbar, Zustand persistiert nach Save + Reopen
  await page.locator('#br-zahlen').click();
  await page.locator('[data-v1-field="tag|eBanking"]').click();
  await page.locator('[data-v1-field="tag|Mobile Banking"]').click();
  await page.locator('[data-save="zahlen"]').click();
  await expect(page.locator('#modalBg')).toBeHidden();
  await page.locator('#br-zahlen').click();
  await expect(page.locator('[data-v1-field="tag|eBanking"]')).toHaveClass(/on/);
  await expect(page.locator('[data-v1-field="tag|Mobile Banking"]')).toHaveClass(/on/);
  await expect(page.locator('[data-v1-field="tag|Klassisch"]')).not.toHaveClass(/on/);
  await page.locator('#modalClose').click();

  // Sparen: quoteTyp 'neutral' existiert und persistiert (v1 kennt 3 Tendenzen)
  await page.locator('#br-sparen').click();
  await page.locator('#f-quoteBetrag').fill('800');
  await page.locator('[data-v1-field="sparen__quoteTyp|neutral"]').click();
  await page.locator('[data-save="sparen"]').click();
  await page.locator('#br-sparen').click();
  await expect(page.locator('[data-v1-field="sparen__quoteTyp|neutral"]')).toHaveClass(/on/);
  await page.locator('#modalClose').click();

  // Ausgaben: prevCF live — Einkommen > Ausgaben → positiver Cashflow im Modal
  await page.locator('#cfr-eink').click();
  await page.locator('#f-eMann').fill('9000');
  await page.locator('#f-haushalt').fill('4000');
  await expect(page.locator('#cf-prev')).toContainText('/ Monat');
  await expect(page.locator('#cf-prev')).toHaveClass(/pos/);
  await page.locator('#modalClose').click();
});
