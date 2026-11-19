import { test, expect } from '@playwright/test';
import { musterEinlesen, stand } from './helfer';

// 07 Lebensplan (Phase 5): Ziel, Kauf, Anlage und Pensionierung in einem Bild
// und einer Rechnung. Die Zusammenfuehrung selbst sichert tests/unit/lebensplan.

async function musterMitZielen(page: import('@playwright/test').Page): Promise<void> {
  await musterEinlesen(page);
  // Ziele und Finanzierung wie von 06 und 07a geschrieben (deren Oberfläche prüfen die eigenen Specs);
  // die Anlage entsteht unten über die Oberfläche von 07b (A7).
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('bbzData') || '{}');
    d.ziele = [
      { id: 'z1', katId: 'wohnen', typ: 'ziel', name: 'Ferienwohnung', jahr: 2031, betrag: 600000 },
      { id: 'z2', katId: 'familie', typ: 'ziel', name: 'Weltreise', jahr: 2034, betrag: 60000 },
      { id: 'z3', katId: 'zufluss', typ: 'zufluss', name: 'Erbschaft', jahr: 2040, betrag: 300000 },
      { id: 'z4', katId: 'familie', typ: 'ziel', name: 'Irgendwann', jahr: null, betrag: 5000 },
    ];
    d.finanzierung_data = { inputs: { price: "600'000", cashEquity: "150'000" }, zielId: 'z1' };
    d.anlage_konklusion = { finaleStrategie: 'Ausgewogen' };
    localStorage.setItem('bbzData', JSON.stringify(d));
  });
  // 07b: den Anlagebetrag im Modul erfassen — er muss von dort im Lebensplan ankommen
  await page.goto('modules/07b-anlegen.html');
  await page.locator('#amtInput').fill('60000');
  expect((await stand(page)).anlage_betrag).toBe(60000);
}

test('Ziel, Kauf und Anlage erscheinen in derselben Zeitachse und Rechnung', async ({ page }) => {
  const fehler: string[] = [];
  page.on('pageerror', (e) => fehler.push(e.message));
  await musterMitZielen(page);
  await page.goto('modules/07-lebensplan.html');
  await expect(page.locator('.bbz-nav-tab.active')).toContainText('Lebensplan');

  // Liste: alle Quellen, mit Status
  const zeile = (name: string) => page.locator('#lpListe tr', { hasText: name });
  await expect(zeile('Weltreise')).toContainText('rechnet mit');
  await expect(zeile('Ferienwohnung')).toContainText('07a Finanzieren');
  await expect(zeile('Ferienwohnung')).toContainText('rechnet mit');
  await expect(zeile('Anlage «Ausgewogen»')).toContainText('rechnet mit');
  await expect(zeile('Erbschaft')).toContainText('rechnet mit');
  await expect(zeile('Pensionierung Person 1')).toContainText('07c Pensionierung');
  await expect(zeile('Irgendwann')).toContainText('vorgemerkt');

  // Rechnung: Urteil mit und ohne Ziele, tragbare Ausgaben
  const kpis = page.locator('#lpKpis .kpi');
  await expect(kpis).toHaveCount(4);
  await expect(kpis.nth(0)).toContainText(/Reicht|Knapp|Reicht nicht/);
  await expect(kpis.nth(1)).toContainText(/Reicht|Knapp|Reicht nicht/);
  await expect(kpis.nth(3)).toContainText('CHF 210’000'); // Barmittel 150'000 + Weltreise 60'000
  await expect(kpis.nth(3)).toContainText('Zuflüsse CHF 300’000');

  // Bild: Marken der mitrechnenden Eintraege, Fragezeichen fuer Vorgemerktes
  const bild = page.locator('#lpBild svg');
  await expect(bild).toBeVisible();
  await expect(bild).toContainText('Weltreise');
  await expect(bild).toContainText('Ferienwohnung');
  await expect(bild).toContainText('Erbschaft');

  // gespeichert wird nichts: der Haushalts-Stand traegt die Ziele nicht
  const h = (await stand(page)).haushalt;
  expect(h.wuensche.map((w: { name: string }) => w.name)).toEqual(['Griechenland']);
  expect(h.liquiditaet).toBe(100000);
  expect(fehler).toEqual([]);
});

test('ohne Ausgaben im Ruhestand: Hinweis statt Urteil, die Liste steht trotzdem', async ({ page }) => {
  await page.goto('modules/07-lebensplan.html');
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(() => localStorage.setItem('bbzData', JSON.stringify({ __schemaVersion: 3, p1name: 'Anna', ziele: [{ katId: 'familie', typ: 'ziel', name: 'Weltreise', jahr: 2034, betrag: 60000 }] })));
  await page.reload();
  await expect(page.locator('#lpUrteilText')).toContainText('fehlen die Ausgaben im Ruhestand');
  await expect(page.locator('#lpListe tr', { hasText: 'Weltreise' })).toContainText('rechnet mit');
});
