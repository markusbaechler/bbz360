import { test, expect } from '@playwright/test';

// Smoke 10 — Zusammenfassung aus der Datenschicht (reale Keys), Kunden-Pill,
// Berichtsmodi (v1 printBericht), Schlussnotiz (edit-mode, persistiert).
test('10 Abschluss — Zusammenfassung, Bericht, Notiz', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('bbzData')) {
      localStorage.setItem('bbzData', JSON.stringify({
        p1name: 'Anna Muster', p2name: 'Ben Muster', beratungsdatum: '2026-07-16',
        beraterName: 'Petra Beispiel',
        agenda_erwartungen: ['Klarheit über meine Vorsorge'],
        cockpit_einkommen: 145000, cockpit_verpflichtungen: 6000, cockpit_pk_saldo: 260000,
        cockpit_data: { zahlen: { saldo: 24000 }, sparen: { saldo: 48000 }, vorsorgen: { s3Saldo: 48000, pkSaldo: 260000 }, anlegen: { volumen: 120000 } },
        ziele: [{ id: 'z1', katId: 'wohnen', typ: 'ziel', name: 'Erstwohnung kaufen', jahr: 2030, betrag: 950000, prob: 'wahrscheinlich', notiz: '' }],
        wuensche: [{ id: 'w1', katId: 'freizeit', name: 'Weltreise', jahr: null, betrag: 60000, notiz: '' }],
        finanzierung_data: { inputs: { income: 145000, obligations: 0, price: 950000, cashEquity: 190000, pensionWithdraw: 0, pensionPledge: 0, calcRate: 5, sideRate: 0.75, age: 40 }, variants: [], rates: {} },
        anlage_konklusion: { strategiewunsch: 'Wachstum', stresstest: 'Wachstum', horizonMax: 'Dynamisch', empfehlung: 'Wachstum', finaleStrategie: 'Wachstum', esg: 'nachrangig', esgText: 'Nachhaltigkeit wird als ergänzender Faktor berücksichtigt.', begruendung: 'Test.' },
        vereinbarungen: [{ sparte: 'Vorsorge', text: '3a-Konto eröffnen', prioritaet: 'hoch', stepWer: 'Bank', stepWas: 'Unterlagen senden', stepWann: 'bis Ende Monat', keineAktivitaet: false }],
        fb_ratings: [9],
      }));
    }
  });
  await page.goto('modules/10-abschluss.html');

  // Kunden-Pill + Säulen-Dank
  await expect(page.locator('#stageName')).toHaveText('Anna Muster & Ben Muster');
  await expect(page.locator('#stageDate')).toContainText('Juli 2026');
  await expect(page.locator('.ab-thanks')).toContainText('Vielen Dank');

  // Zusammenfassung: alle Sektionen aus der Datenschicht
  await expect(page.locator('.ab-quote')).toContainText('Klarheit über meine Vorsorge');
  await expect(page.locator('.ab-kv').first()).toHaveText("CHF 145'000");
  await expect(page.locator('.ab-ziel')).toHaveCount(2);
  await expect(page.locator('.ab-sec', { hasText: '07a' }).locator('.ab-kv').nth(2)).toHaveText('37%');   // T1-Tragbarkeit
  await expect(page.locator('.ab-sec', { hasText: '07b' })).toContainText('Wachstum');
  await expect(page.locator('.ab-vrow')).toContainText('3a-Konto eröffnen');
  await expect(page.locator('.ab-fbrow b')).toHaveText('9/10');

  // Bericht: Modus "finanzieren" → 7a-Sektion enthalten, 7b nicht
  await page.evaluate(() => { window.print = () => undefined; });
  await page.locator('#printScope').selectOption('finanzieren');
  await page.locator('#btnPrint').click();
  const rp1 = await page.locator('#printReport').innerHTML();
  expect(rp1).toContain('Eigenheimfinanzierung');
  expect(rp1).not.toContain('Anlegerprofil');
  // Modus "total" → beide + Feedback + Vereinbarungen + Cover-Meta
  await page.locator('#printScope').selectOption('total');
  await page.locator('#btnPrint').click();
  const rp2 = await page.locator('#printReport').innerHTML();
  for (const s of ['Gesprächsbericht', 'Anna Muster &amp; Ben Muster', 'Petra Beispiel', 'Eigenheimfinanzierung', 'Anlegerprofil', '3a-Konto eröffnen', 'Zufriedenheit']) {
    expect(rp2).toContain(s);
  }

  // Schlussnotiz: edit-mode, persistiert, erscheint im Bericht
  await page.locator('#editToggle').click();
  await page.locator('#schlussNotiz').fill('Sehr angenehmes Gespräch.');
  await page.locator('#schlussNotiz').blur();
  await page.locator('#btnPrint').click();
  expect(await page.locator('#printReport').innerHTML()).toContain('Sehr angenehmes Gespräch.');
  await page.reload();
  await expect(page.locator('#schlussNotiz')).toHaveText('Sehr angenehmes Gespräch.');

  const fits = await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight);
  expect(fits).toBe(true);
});
