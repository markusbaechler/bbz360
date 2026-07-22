import { test, expect } from '@playwright/test';

// Smoke 07a — Fixtures T1–T3 EXAKT in der UI (Rechenkern-Fixtures aus
// FIXTURES.md; Unit-Tests decken Rohwerte, hier die Anzeige-Kette).
const T = [
  { name: 'T1', income: '145000', oblig: '', price: '950000', cashEq: '190000', pensBez: '', pensVp: '0', age: '40', afford: '37%', ltv: '80%', hypo: "760'000", monat: "4'464", banner: 's-warn' },
  { name: 'T2', income: '180000', oblig: '12000', price: '1200000', cashEq: '150000', pensBez: '90000', pensVp: '0', age: '48', afford: '40%', ltv: '80%', hypo: "960'000", monat: "5'639", banner: 's-crit' },
  { name: 'T3', income: '110000', oblig: '', price: '800000', cashEq: '160000', pensBez: '', pensVp: '80000', age: '35', afford: '39%', ltv: '70%', hypo: "640'000", monat: "3'537", banner: 's-warn' },
];

test('07a Finanzieren — Fixtures T1–T3 exakt (KPIs + Banner)', async ({ page }) => {
  for (const t of T) {
    await test.step(t.name, async () => {
      await page.goto('modules/07a-finanzieren.html');
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await page.locator('#income').fill(t.income);
      if (t.oblig) await page.locator('#obligations').fill(t.oblig);
      await page.locator('#price').fill(t.price);
      await page.locator('#cashEquity').fill(t.cashEq);
      if (t.pensBez) await page.locator('#pensionWithdraw').fill(t.pensBez);
      await page.locator('#pensionPledge').fill(t.pensVp);
      await page.locator('#age').fill(t.age);

      await expect(page.locator('#kpiAfford')).toHaveText(t.afford);
      await expect(page.locator('#kpiLTV')).toHaveText(t.ltv);
      await expect(page.locator('#kpiHypo')).toHaveText(t.hypo);
      await expect(page.locator('#kpiMonthly')).toHaveText(t.monat);
      await expect(page.locator('#statusBanner')).toHaveClass(new RegExp(t.banner));
    });
  }
});

test('07a Finanzieren — Prefill, Varianten, Persistenz, Zins-Modal', async ({ page }) => {
  // Prefills aus Cockpit/Zielen/Stammdaten (v1 preload)
  await page.addInitScript(() => {
    if (!localStorage.getItem('bbzData')) {
      localStorage.setItem('bbzData', JSON.stringify({
        cockpit_einkommen: 145000, cockpit_verpflichtungen: 6000, cockpit_pk_saldo: 260000,
        p1geb: '1986-01-15',
        ziele: [{ id: 'z1', katId: 'wohnen', typ: 'ziel', name: 'Erstwohnung', jahr: 2030, betrag: 950000, prob: 'wahrscheinlich', notiz: '' }],
      }));
    }
  });
  await page.goto('modules/07a-finanzieren.html');
  await expect(page.locator('#income')).toHaveValue("145'000");
  await expect(page.locator('#obligations')).toHaveValue("6'000");
  await expect(page.locator('#price')).toHaveValue("950'000");
  await expect(page.locator('#age')).toHaveValue('40');
  await expect(page.locator('#pk-info-label')).toContainText("260'000");

  // Eigenmittel erfassen → Varianten-Tab: Tranchen = totalHypo, v2 = 10J
  await page.locator('#cashEquity').fill('190000');
  await page.locator('#tabComparison').click();
  await expect(page.locator('.fz-vcard[data-v="1"] .v-amt').first()).toHaveValue("760'000");
  await expect(page.locator('.fz-vcard[data-v="2"] .v-prod').first()).toHaveValue('10J');
  // Variante 3: 50/50-Split
  await expect(page.locator('.fz-vcard[data-v="3"] .v-amt').nth(0)).toHaveValue("380'000");
  await expect(page.locator('.fz-vcard[data-v="3"] .v-amt').nth(1)).toHaveValue("380'000");

  // Detail-Modal per Karten-Klick (nicht Tranchen)
  await page.locator('.fz-vcard[data-v="1"] .fz-vhead').click();
  await expect(page.locator('#detailModal')).toBeVisible();
  await expect(page.locator('#detailTitle')).toContainText('Variante 1');
  await expect(page.locator('#dtKalk')).toContainText('CHF');
  await page.locator('#detailClose').click();

  // Marktzinsen-Modal (edit-mode-Werkzeug): alle 10 Produkte (Parität)
  await page.locator('#editToggle').click();
  await page.locator('#btnRates').click();
  for (const r of ['SARON', '2J', '3J', '4J', '5J', '6J', '7J', '8J', '9J', '10J']) {
    await expect(page.locator(`[data-v1-field="rate|${r}"]`)).toHaveCount(1);
  }
  await page.locator('[data-v1-field="rate|SARON"]').fill('2.00');
  await page.locator('#ratesApply').click();

  // Persistenz finanzierung_data (inputs + variants + rates), Reload-fest
  await page.waitForTimeout(350); // debounce 200ms
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('bbzData') || '{}'));
  expect(stored.finanzierung_data.inputs.cashEquity).toBe("190'000");
  expect(stored.finanzierung_data.rates.SARON).toBe(2);
  await page.reload();
  await expect(page.locator('#cashEquity')).toHaveValue("190'000");

  const fits = await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight);
  expect(fits).toBe(true);
});

// Regel 5b (DESIGN-SPEC §2.5b): jeder Chart hat Gitterlinien, Werteskala,
// X-Achse und eine Legende im Panel-Kopf. Der Amortisationsverlauf hatte
// bisher nur X-Beschriftungen — Balken waren ohne Bezugsgrösse.
test('07a Amortisationsverlauf — Werteskala, Gitter, X-Achse, Legende', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('bbzData', JSON.stringify({
      finanzierung_data: {
        inputs: { income: 148000, price: 950000, cashEquity: 200000, calcRate: 5, sideRate: 0.75, age: 47, obligations: 12000, currentRent: 2200, pensionWithdraw: 0, pensionPledge: 60000 },
        variants: [{ id: 1, tranches: [{ p: 'SARON', a: 760000 }] }], rates: { SARON: 1.65 },
      },
    }));
  });
  await page.goto('modules/07a-finanzieren.html');

  // Werteskala: 5 Ticks, oberster >= Maximum, Schritte sind runde Zahlen
  const ticks = await page.locator('.fz-ytick').allTextContents();
  expect(ticks).toHaveLength(5);
  expect(ticks[ticks.length - 1]).toBe('0');
  const nums = ticks.map((t) => Number(t.replace(/\D/g, '')));
  const step = nums[nums.length - 2]; // erster Schritt über 0
  expect(step).toBeGreaterThan(0);
  nums.forEach((n, i) => expect(n).toBe(step * (nums.length - 1 - i))); // gleichmässig
  expect(step % 1000).toBe(0); // keine Krümel wie 31'250

  // Gitterlinien je Tick, X-Achse je Balken
  await expect(page.locator('.fz-gridline')).toHaveCount(5);
  const bars = await page.locator('.fz-acol').count();
  await expect(page.locator('.fz-albl')).toHaveCount(bars);

  // Legende im Panel-Kopf, Reihenfolge = Stapel von oben nach unten
  const legend = await page.locator('#amortLegend .fz-lgi').allTextContents();
  expect(legend).toEqual(['Verpfändung', '2. Hypothek']);
  await expect(page.locator('.fz-lgunit')).toContainText('CHF');

  // Höchster Balken bleibt innerhalb der Skala (Balken und Achse teilen den Deckel)
  const fill = await page.evaluate(() => {
    const col = document.querySelector('.fz-acol') as HTMLElement;
    const area = document.querySelector('.fz-plotarea') as HTMLElement;
    const segs = Array.from(col.querySelectorAll('.fz-aseg')) as HTMLElement[];
    const h = segs.reduce((s, e) => s + e.getBoundingClientRect().height, 0);
    return h / area.getBoundingClientRect().height;
  });
  expect(fill).toBeGreaterThan(0.5);
  expect(fill).toBeLessThanOrEqual(1.0001);
});

// Ohne Amortisationspflicht bleibt die Fläche leer — dann auch ohne Achsen.
test('07a Amortisationsverlauf — keine Amortisation, keine Achsen', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('bbzData', JSON.stringify({
      finanzierung_data: {
        inputs: { income: 250000, price: 600000, cashEquity: 400000, calcRate: 5, sideRate: 0.75, age: 45, obligations: 0, currentRent: 2000, pensionWithdraw: 0, pensionPledge: 0 },
        variants: [{ id: 1, tranches: [{ p: 'SARON', a: 200000 }] }], rates: { SARON: 1.65 },
      },
    }));
  });
  await page.goto('modules/07a-finanzieren.html');
  await expect(page.locator('.fz-noamort')).toBeVisible();
  await expect(page.locator('.fz-ytick')).toHaveCount(0);
  await expect(page.locator('.fz-gridline')).toHaveCount(0);
  await expect(page.locator('#amortLegend')).toBeEmpty();
});
