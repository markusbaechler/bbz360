import { test, expect } from '@playwright/test';

// Smoke 09 — Funktionsumfang = v1 09_feedback.html: Bewertung je Erwartung
// (agenda_erwartungen) mit Adjektiv-Skala, Fallback ohne Erwartungen,
// fb_ratings-Persistenz, editierbare Abschluss-Fragen (fb_q_text_*).
// Neu (Design 2026-07-21): zwei Phasen — Erwartungsabgleich, dann die zwei
// Schlussfragen allein im Fokus (fb_phase).
test('09 Feedback — Smoke (Slider, Adjektive, Persistenz)', async ({ page }) => {
  // Erwartungen aus 01 seeden (v1: agenda_erwartungen)
  await page.addInitScript(() => {
    if (!localStorage.getItem('bbzData')) {
      localStorage.setItem('bbzData', JSON.stringify({
        agenda_erwartungen: ['Klarheit über meine Vorsorge', 'Konkrete nächste Schritte'],
      }));
    }
  });
  await page.goto('modules/09-feedback.html');
  await expect(page.locator('.rail-title')).toContainText('Erwartungen');
  await expect(page.locator('.fb-row')).toHaveCount(2);
  await expect(page.locator('.fb-ewtext').first()).toHaveText('Klarheit über meine Vorsorge');

  // Phase 1 aktiv, Schlussfragen noch nicht auf der Bühne (genau EIN Fokus)
  await expect(page.locator('.bar-pos')).toHaveText('Phase 1 von 2 · Erwartungsabgleich');
  await expect(page.locator('#q-text-0')).toHaveCount(0);

  // Default 7 → "Sehr gut"; Slider auf 10 → "Ausgezeichnet"
  await expect(page.locator('#fb-num-0')).toHaveText('7');
  await expect(page.locator('#fb-adj-0')).toHaveText('Sehr gut');
  await page.locator('.fb-row[data-idx="0"] .fb-slider').fill('10');
  await expect(page.locator('#fb-adj-0')).toHaveText('Ausgezeichnet');

  // Persistenz fb_ratings + grosse Daumen / Durchschnitt
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('bbzData') || '{}'));
  expect(stored.fb_ratings).toEqual([10, 7]);
  await expect(page.locator('#fbAvg')).toHaveText('8.5');
  await expect(page.locator('#fbThumb')).toHaveText('👍');

  const fitsP1 = await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight);
  expect(fitsP1).toBe(true);

  // → Phase 2: die zwei Fragen, Erwartungs-Slider verlassen die Bühne
  await page.locator('#btnFwd').click();
  await expect(page.locator('.bar-pos')).toHaveText('Phase 2 von 2 · Zwei Fragen zum Schluss');
  await expect(page.locator('.fb-row')).toHaveCount(0);
  await expect(page.locator('.fb-q')).toHaveCount(2);
  await expect(page.locator('#work')).toHaveClass(/bbz-work--focus/);
  // Gesamteindruck bleibt als Quittung in der Säule
  await expect(page.locator('#railAvg')).toHaveText('8.5 / 10');

  // Abschluss-Fragen editierbar nur im edit-mode, persistieren (fb_q_text_0)
  await expect(page.locator('#q-text-0')).toHaveAttribute('contenteditable', 'false');
  await page.locator('#editToggle').click();
  await page.locator('#q-text-0').fill('Was nehmen Sie heute mit?');
  await page.locator('#editToggle').click();
  await page.reload();
  // fb_phase überlebt den Reload
  await expect(page.locator('.bar-pos')).toHaveText('Phase 2 von 2 · Zwei Fragen zum Schluss');
  await expect(page.locator('#q-text-0')).toHaveText('Was nehmen Sie heute mit?');

  const fitsP2 = await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight);
  expect(fitsP2).toBe(true);

  // Rücksprung über die Phasenliste in der Säule
  await page.locator('.rail-phase.done').click();
  await expect(page.locator('.bar-pos')).toHaveText('Phase 1 von 2 · Erwartungsabgleich');
  await expect(page.locator('.fb-row')).toHaveCount(2);
});

// Fallback: keine Erwartungen erfasst → generische Frage (v1 startStep2)
test('09 Feedback — Fallback ohne Erwartungen', async ({ page }) => {
  await page.goto('modules/09-feedback.html');
  await expect(page.locator('.fb-row')).toHaveCount(1);
  await expect(page.locator('.fb-ewtext')).toContainText('Gespräch als Ganzes');
});
