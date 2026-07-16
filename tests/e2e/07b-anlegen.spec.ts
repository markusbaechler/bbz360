import { test, expect, type Page } from '@playwright/test';

// Smoke 07b — Fixtures A1–A3 (Simulation) + E1–E3 (Empfehlung) EXAKT in der UI.
// Rohwerte deckt finance.test.ts; hier die komplette Anzeige-/Interaktionskette.

async function setParams(page: Page, amount: string, horizon: number): Promise<void> {
  await page.goto('modules/07b-anlegen.html');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('#amtInput').fill(amount);
  // Range-Slider deterministisch setzen
  await page.locator('#hzInput').evaluate((el, v) => {
    (el as HTMLInputElement).value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, horizon);
}

test('07b Anlegen — Simulation A1–A3 exakt', async ({ page }) => {
  const CASES = [
    { amt: '100000', hz: 10, strat: 'Ausgewogen', end: "131'165", gain: "31'165", band: "CHF 84'292 — CHF 204'103" },
    { amt: '250000', hz: 15, strat: 'Wachstum', end: "483'821", gain: "233'821", band: "CHF 218'183 — CHF 1'072'874" },
    { amt: '100000', hz: 4, strat: 'Konservativ', end: "105'095", gain: "5'095", band: "CHF 90'632 — CHF 121'865" },
  ];
  for (const c of CASES) {
    await test.step(`${c.amt} · ${c.strat} · ${c.hz}J`, async () => {
      await setParams(page, c.amt, c.hz);
      await page.locator('#btnNext').click();                       // → Strategiewunsch
      await page.locator('.an-strat', { hasText: c.strat }).first().click();
      await expect(page.locator('#simEndAmt')).toHaveText('CHF ' + c.end);
      await expect(page.locator('#simGain')).toContainText(c.gain);
      await expect(page.locator('#bandRange')).toHaveText(c.band);
    });
  }
});

async function runProfil(page: Page, opts: { hz: number; wish: string; react: string; wait: string; exp: string }): Promise<void> {
  await setParams(page, '100000', opts.hz);
  await page.locator('#btnNext').click();                            // → Strategiewunsch
  await page.locator('.an-strat', { hasText: opts.wish }).first().click();
  await page.locator('#btnNext').click();                            // → Stresstest F1
  await page.locator(`[data-opt="${opts.react}"]`).click();
  await page.locator('#btnNext').click();                            // F2
  await page.locator(`[data-opt="${opts.wait}"]`).click();
  await page.locator('#btnNext').click();                            // F3
  await page.locator(`[data-opt="${opts.exp}"]`).click();
  await page.locator('#btnNext').click();                            // → Kenntnisse
  await page.locator('#btnNext').click();                            // → ESG
  await page.locator('#btnNext').click();                            // → Konklusion
}

test('07b Anlegen — Empfehlung E1–E3 exakt', async ({ page }) => {
  // E1: Wunsch Wachstum, 10J, hold/5y/little → Empfehlung Wachstum
  await runProfil(page, { hz: 10, wish: 'Wachstum', react: 'hold', wait: '5y', exp: 'little' });
  await expect(page.locator('#recommendedStrategyLabel')).toHaveText('Wachstum');
  // E2: Wunsch Dynamisch, 7J, wait/3y/none → Empfehlung Ausgewogen
  await runProfil(page, { hz: 7, wish: 'Dynamisch', react: 'wait', wait: '3y', exp: 'none' });
  await expect(page.locator('#recommendedStrategyLabel')).toHaveText('Ausgewogen');
  // E3: Wunsch Ausgewogen, 4J, buy/open/lot → Empfehlung Ausgewogen (Horizont deckelt)
  await runProfil(page, { hz: 4, wish: 'Ausgewogen', react: 'buy', wait: 'open', exp: 'lot' });
  await expect(page.locator('#recommendedStrategyLabel')).toHaveText('Ausgewogen');
  // Finale Wahl abweichend → deviation note + Persistenz anlage_konklusion beim Weitergehen
  await page.locator('#finalStratGrid .an-strat', { hasText: 'Konservativ' }).click();
  await expect(page.locator('#deviationNote')).toBeVisible();
  await page.locator('#btnNext').click();                            // → Umsetzung (persistiert)
  const konk = await page.evaluate(() => JSON.parse(localStorage.getItem('bbzData') || '{}').anlage_konklusion);
  expect(konk.empfehlung).toBe('Ausgewogen');
  expect(konk.finaleStrategie).toBe('Konservativ');
});

test('07b Anlegen — Teil B (Präferenz-Gate, Auswahl, Kostenrechner)', async ({ page }) => {
  await runProfil(page, { hz: 10, wish: 'Wachstum', react: 'hold', wait: '5y', exp: 'little' });
  await page.locator('#btnNext').click();                            // → B1 Präferenz

  // Gedimmte Primäraktion nennt Bedingung (Grammatik §1); Wahl schaltet frei
  await expect(page.locator('#btnNext')).toBeDisabled();
  await expect(page.locator('#btnNext')).toContainText('Präferenz wählen');
  await page.locator('[data-pref="vv"]').click();
  await expect(page.locator('#btnNext')).toBeEnabled();
  await page.locator('#btnNext').click();                            // → B2 Alltag
  await expect(page.locator('.an-b2tbl tbody tr')).toHaveCount(4);

  // Kostenvergleich (v1-Formeln): 250'000, 6 Trades à 50'000 →
  // Depot max(750,120)=750 + TA 600 + 90 = 1'440; VV 1.5% = 3'750
  await page.locator('[data-calc]').click();
  await page.locator('#calcAmount').fill('250000');
  await page.locator('#calcTrades').fill('6');
  await page.locator('#calcAvgTradeAmount').fill('50000');
  await page.locator('#calcRun').click();
  await expect(page.locator('#resAdvisoryTotal')).toHaveText("CHF 1'440");
  await expect(page.locator('#resVvTotal')).toHaveText("CHF 3'750");
  await page.keyboard.press('Escape');

  await page.locator('#btnNext').click();                            // → B3 Auswahl
  await expect(page.locator('#btnNext')).toBeDisabled();
  await page.locator('[data-choice="advisory"]').click();
  await expect(page.locator('#confirmationBox')).toBeVisible();
  await expect(page.locator('#confirmationTitle')).toContainText('Beratungsdepot');
  const wahl = await page.evaluate(() => JSON.parse(localStorage.getItem('bbzData') || '{}').anlage_produktwahl);
  expect(wahl).toEqual({ praeferenz: 'vv', auswahl: 'advisory' });
  await expect(page.locator('#btnNext')).toBeEnabled();

  const fits = await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight);
  expect(fits).toBe(true);
});
