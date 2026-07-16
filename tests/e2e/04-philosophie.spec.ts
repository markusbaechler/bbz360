import { test, expect } from '@playwright/test';

// Smoke 04 — Funktionsumfang = v1 04_philosophie.html: 4 Phasen-Karten,
// Modal (Haltungssatz + Nutzen) editierbar im edit-mode, Persistenz unter
// v1-Key 'bbz_beratungsphilosophie_v1', moduleTitle editierbar.
test('04 Philosophie — Smoke (Phasen, Modal, v1-Persistenz)', async ({ page }) => {
  await page.goto('modules/04-philosophie.html');
  await expect(page.locator('#moduleTitle')).toContainText('Klarheit');
  await expect(page.locator('.ph-card')).toHaveCount(4);
  for (const t of ['Verstehen', 'Klarheit gewinnen', 'Entscheiden', 'Begleiten']) {
    await expect(page.locator('.ph-ctitle', { hasText: t })).toBeVisible();
  }
  // Default-Bilder geladen
  await expect(page.locator('#img-panel-0 img')).toHaveAttribute('src', /philosophie_a/);

  // Modal read-only im Normalmodus, v1-Defaults
  await page.locator('#card-0').click();
  await expect(page.locator('#modalBg')).toBeVisible();
  await expect(page.locator('#modalQuote')).toContainText('Verstehen kommt vor Lösen');
  await expect(page.locator('#modalQuote')).toHaveAttribute('contenteditable', 'false');
  await expect(page.locator('#modalSave')).toBeHidden();  // Regel 4
  await page.locator('#modalCloseBtn').click();

  // edit-mode: Zitat ändern → Speichern → v1-Key + Reload-fest
  await page.locator('#editToggle').click();
  await page.locator('#card-1').click();
  await expect(page.locator('#modalQuote')).toHaveAttribute('contenteditable', 'true');
  await page.locator('#modalQuote').fill('«Neuer Haltungssatz.»');
  await page.locator('#modalSave').click();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('bbz_beratungsphilosophie_v1') || '{}'));
  expect(stored.phases[1].quote).toBe('«Neuer Haltungssatz.»');
  await page.reload();
  await page.locator('#card-1').click();
  await expect(page.locator('#modalQuote')).toHaveText('«Neuer Haltungssatz.»');
  await page.keyboard.press('Escape');

  // moduleTitle: im edit-mode ändern, beim Verlassen gespeichert
  await page.locator('#editToggle').click();
  await page.locator('#moduleTitle').fill('Unser Titel-Test.');
  await page.locator('#editToggle').click(); // verlassen → speichert (v1)
  await page.reload();
  await expect(page.locator('#moduleTitle')).toHaveText('Unser Titel-Test.');

  const fits = await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight);
  expect(fits).toBe(true);
});
