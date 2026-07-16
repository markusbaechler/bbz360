import { test, expect } from '@playwright/test';

// Smoke 03 — Funktionsumfang = v1 03_berater.html: 3 Kacheln, Modal mit
// Rich-Text-Editor (H3/Bold/Normal/Liste), stripInlineStyles, Persistenz
// beratervorstellung_<aktiverBerater>, Placeholder bei leerem Inhalt.
test('03 Berater — Smoke (Kacheln, Editor, Persistenz)', async ({ page }) => {
  await page.goto('modules/03-berater.html');
  await expect(page.locator('.rail-title')).toBeVisible();
  await expect(page.locator('.br-card')).toHaveCount(3);
  for (const t of ['Wer ich bin', 'Was ich mag', 'Was Sie von mir erwarten können']) {
    await expect(page.locator('.br-ctitle', { hasText: t })).toBeVisible();
  }

  // Leerer Inhalt → Placeholder-Klasse; Modal read-only im Normalmodus
  await expect(page.locator('#preview-1')).toHaveClass(/empty/);
  await page.locator('[data-id="1"]').click();
  await expect(page.locator('#modalBg')).toBeVisible();
  await expect(page.locator('#modalNr')).toHaveText('01 / 03');
  await expect(page.locator('#editor')).toHaveAttribute('contenteditable', 'false');
  await expect(page.locator('#toolbar')).toBeHidden();   // Regel 4
  await page.locator('#modalClose').click();

  // edit-mode: Text erfassen, Übernehmen → Vorschau + Persistenz (Reload-fest)
  await page.locator('#editToggle').click();
  await page.locator('[data-id="2"]').click();
  await expect(page.locator('#editor')).toHaveAttribute('contenteditable', 'true');
  await expect(page.locator('#toolbar')).toBeVisible();
  await page.locator('#editor').fill('Wandern und gute Bücher.');
  await page.locator('#modalSave').click();
  await expect(page.locator('#modalBg')).toBeHidden();
  await expect(page.locator('#preview-2')).toContainText('Wandern und gute Bücher.');
  await page.reload();
  await expect(page.locator('#preview-2')).toContainText('Wandern und gute Bücher.');

  // Persistenz-Key pro Berater-ID (v1: beratervorstellung_1)
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('bbzData') || '{}'));
  expect(stored['beratervorstellung_1']?.['2']).toContain('Wandern');

  // Regel 1
  const fits = await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight);
  expect(fits).toBe(true);
});
