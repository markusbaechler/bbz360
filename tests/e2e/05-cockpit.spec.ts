import { test, expect } from '@playwright/test';

// Smoke 05 Cockpit (Grammatik v3): laedt, keine Console-Errors, Nav 11, Regel 1;
// Zeilen-Klick oeffnet korrektes Modal (Verbesserung 05.4a, alle 6 Zeilen);
// Erfassen -> KPI/Prefill aktualisiert; Chart Regel 5 (kein SVG-Text);
// Rendite 0% + eigener Wert (ADR-11); Persistenz nach Reload.
test('05 Cockpit — Smoke', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon/i.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('modules/05-cockpit.html');
  await expect(page.locator('.rail-title')).toHaveText('Finanz-Cockpit');
  await expect(page.locator('#bbzNav .bbz-nav-tab')).toHaveCount(11);
  await expect(page.locator('.ck-kpi')).toHaveCount(6);
  const noScroll = await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1);
  expect(noScroll, 'Regel 1').toBe(true);

  // Verbesserung 05.4a: Mini-Linkleiste entfernt, Zeile = Klickziel
  await expect(page.locator('.ck-catlink')).toHaveCount(0);

  // Alle 6 Zeilen oeffnen das korrekte Erfassungs-Modal
  const rows: Array<[string, string]> = [
    ['#br-zahlen', 'Erfassung: Zahlungsverkehr & Alltag'],
    ['#br-sparen', 'Erfassung: Sparen'],
    ['#br-vorsorgen', 'Erfassung: Vorsorgen'],
    ['#br-anlegen', 'Erfassung: Anlegen'],
    ['#cfr-eink', 'Erfassung: Ausgaben & Einkommen'],
    ['#cfr-ausg', 'Erfassung: Ausgaben & Einkommen'],
  ];
  for (const [sel, title] of rows) {
    await page.locator(sel).click();
    await expect(page.locator('#modalBg')).toBeVisible();
    await expect(page.locator('#modalTitle')).toHaveText(title);
    await page.locator('#modalClose').click();
    await expect(page.locator('#modalBg')).toBeHidden();
  }

  // Zahlungsverkehr erfassen (Zeilen-Klick)
  await page.locator('#br-zahlen').click();
  await page.locator('#f-saldo').fill('52000');
  await page.locator('[data-save="zahlen"]').click();
  await expect(page.locator('#modalBg')).toBeHidden();
  await expect(page.locator('#k-liq')).toContainText("52'000");

  // Sparen erfassen (Saldo + Reserve + Sparquote) -> Anlagefähig = Liq - Reserve
  await page.locator('#br-sparen').click();
  await page.locator('#f-saldo').fill('93000');
  await page.locator('#f-reserve').fill('30000');
  await page.locator('#f-quoteBetrag').fill('1000');
  await page.locator('[data-save="sparen"]').click();
  await expect(page.locator('#k-liq')).toContainText("145'000");
  await expect(page.locator('#k-anlage')).toContainText("115'000");

  // Rendite 0% (ADR-11): reine Sparakkumulation — 145'000 + 10×12'000 = 265'000,
  // Badge weist "+ CHF 0 Rendite-Effekt" aus
  await page.locator('[data-sim="yld"][data-v="0"]').click();
  await expect(page.locator('.ck-end1')).toContainText("265'000");
  await expect(page.locator('#rendite-badge')).toBeVisible();
  await expect(page.locator('#rendite-badge')).toContainText('CHF 0 Rendite-Effekt');

  // Eigener Wert 3.2% (ADR-11): aktiver Chip, Endwert veraendert sich
  await page.locator('[data-sim="yldc"]').click();
  await page.locator('#yldIn').fill('3.2');
  await page.locator('[data-yldok]').click();
  await expect(page.locator('.ck-chip.on', { hasText: '3.2%' })).toBeVisible();
  const endCustom = await page.locator('.ck-end1').textContent();
  expect(endCustom, 'Endwert weicht von 0%-Wert ab').not.toContain("265'000");
  await expect(page.locator('#rendite-badge')).toContainText('Rendite-Effekt');

  // Chart (Regel 5): SVG-Pfade vorhanden, KEIN Text im SVG
  await expect(page.locator('#gChart svg path')).not.toHaveCount(0);
  await expect(page.locator('#gChart svg text')).toHaveCount(0);

  // Chart Y-Domain (Korrektur 05.2a): gerundete Ticks, kein 0-Start bei hohen Daten
  const ylabs = await page.locator('.ck-ylab').allTextContents();
  expect(ylabs.length, 'Y-Ticks vorhanden').toBeGreaterThan(1);
  expect(ylabs, 'kein 0-Tick bei hohen Daten').not.toContain('0');

  // Korrektur 05.3: kein Wert-Umbruch in Wertspalten (.bv / KPI .kv)
  const wraps = await page.evaluate(() =>
    [...document.querySelectorAll('.bv, .ck-kpi .kv')]
      .filter((e) => (e as HTMLElement).clientHeight > parseFloat(getComputedStyle(e).fontSize) * 1.6)
      .map((e) => e.textContent?.trim()));
  expect(wraps, 'kein Wert-Umbruch (.bv/.kv <= 1.6em)').toEqual([]);

  // Prefill cockpit_anlage_f unveraendert geschrieben
  const anlageF = await page.evaluate(() => JSON.parse(localStorage.getItem('bbzData') || '{}').cockpit_anlage_f);
  expect(anlageF).toBe(115000);

  // Persistenz nach Reload: Daten UND eigener Rendite-Wert (S.chart.yld)
  await page.reload();
  await expect(page.locator('#k-liq')).toContainText("145'000");
  await expect(page.locator('.ck-chip.on', { hasText: '3.2%' })).toBeVisible();
  expect(await page.locator('.ck-end1').textContent(), 'Endwert nach Reload identisch').toBe(endCustom);

  expect(errors, 'keine Console-Errors').toEqual([]);
});
