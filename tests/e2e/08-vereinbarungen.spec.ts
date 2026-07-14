import { test, expect } from '@playwright/test';

// Smoke 08 Vereinbarungen (Archetyp G): laedt, Console-clean, Nav 11 Tabs,
// Erfassen->Priorisieren->Planen->Abschluss durchlaufen, Phasen-Roundtrip
// (vor + zurueck, Zustand bleibt), Persistenz nach Reload.
test('08 Vereinbarungen — Smoke (Wizard-Roundtrip)', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon/i.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('modules/08-vereinbarungen.html');
  await expect(page.locator('h1')).toHaveText('Vereinbarungen');
  await expect(page.locator('#bbzNav .bbz-nav-tab')).toHaveCount(11);
  await expect(page.locator('#bbzNav .bbz-nav-tab.active')).toContainText('Vereinbarungen');

  // ── Phase 1: Erfassen ──
  await page.locator('#sparteChips .wz-chip', { hasText: 'Anlegen' }).click();
  await expect(page.locator('#reifegradWrap')).toBeVisible();
  await page.locator('#reifegradChips .wz-chip', { hasText: 'Optionen prüfen' }).click();
  // Vorschlag uebernehmen
  await expect(page.locator('#hintText.has-hint')).toBeVisible();
  await page.locator('#hintText').click();
  await expect(page.locator('#vereinbarungText')).not.toHaveValue('');
  await page.locator('#addBtn').click();
  await expect(page.locator('#agreementList .wz-card')).toHaveCount(1);

  // ── Weiter-Button navigiert (Archetyp G) ──
  await expect(page.locator('#btnForward')).toContainText('Weiter zu Priorisieren');
  await page.locator('#btnForward').click();
  await expect(page.locator('#phase2')).toBeVisible();
  await expect(page.locator('#phase1')).toBeHidden(); // [hidden] wirkt wirklich
  await expect(page.locator('.wz-step[data-phase="2"]')).toHaveClass(/active/);
  await expect(page.locator('.wz-step[data-phase="1"]')).toHaveClass(/done/);
  await page.locator('.wz-prio--sofort').first().click();
  await expect(page.locator('.wz-prio--sofort').first()).toHaveClass(/sel/);

  // ── Phase 3: Planen ──
  await page.locator('#btnForward').click();
  await expect(page.locator('#phase3')).toBeVisible();
  await expect(page.locator('#stepsList select')).toHaveCount(1);
  // Extra-Schritt hinzufuegen (edit-only Werkzeug -> Edit-Modus)
  await page.locator('#editToggle').click();
  await page.locator('.wz-add-step').first().click();
  await expect(page.locator('#stepsList select')).toHaveCount(2);

  // ── Phase 4: Abschluss ──
  await page.locator('#btnForward').click();
  await expect(page.locator('#phase4')).toBeVisible();
  await expect(page.locator('#abschlussGrid')).toContainText('Anlagemöglichkeiten');

  // ── Roundtrip: zurueck zu Phase 2 ueber den Stepper, Zustand bleibt ──
  await page.locator('.wz-step[data-phase="2"]').click();
  await expect(page.locator('#phase2')).toBeVisible();
  await expect(page.locator('.wz-prio--sofort').first()).toHaveClass(/sel/);

  // ── Persistenz nach Reload ──
  await page.reload();
  await expect(page.locator('#phase2')).toBeVisible(); // phase=2 persistiert
  await expect(page.locator('#prioList .wz-card')).toHaveCount(1);
  await expect(page.locator('.wz-prio--sofort').first()).toHaveClass(/sel/);

  expect(errors, 'keine Console-Errors').toEqual([]);
});
