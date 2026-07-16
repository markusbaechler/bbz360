import { test, expect } from '@playwright/test';

// Smoke 02 — Bühnen-Modul "Wer wir sind". Funktionsumfang = v1 02_bank.html:
// 4 Pfeiler + Modal (DEFAULTS-Texte), Text-Edit persistiert in bankTexts,
// heroSub persistiert in bankHeroSub.
test('02 Bank — Smoke (Pfeiler, Modal, Persistenz)', async ({ page }) => {
  await page.goto('modules/02-bank.html');
  await expect(page.locator('.rail-title')).toContainText('bbz bank');
  await expect(page.locator('.bk-mission')).toContainText('menschlicher');

  // 4 Pfeiler (v1: tradition/innovation/verantwortung/naehe)
  await expect(page.locator('.bk-pillar')).toHaveCount(4);
  for (const t of ['Tradition', 'Innovation', 'Verantwortung', 'Nähe']) {
    await expect(page.locator('.bk-ptitle', { hasText: t })).toBeVisible();
  }

  // Modal: Default-Text, Read-only im Normalmodus
  await page.locator('[data-key="tradition"]').click();
  await expect(page.locator('#modalBg')).toBeVisible();
  await expect(page.locator('#modalEyebrow')).toHaveText('UNSERE GESCHICHTE');
  await expect(page.locator('#modalText')).toContainText('Gegründet 1974');
  await expect(page.locator('#modalText')).toHaveAttribute('contenteditable', 'false');
  await page.locator('#modalClose').click();
  await expect(page.locator('#modalBg')).toBeHidden();

  // edit-mode: Text ändern → persistiert (v1: Save bei Modal-Close), Reload-fest
  await page.locator('#editToggle').click();
  await page.locator('[data-key="naehe"]').click();
  await expect(page.locator('#modalText')).toHaveAttribute('contenteditable', 'true');
  await page.locator('#modalText').fill('Nähe neu formuliert für den Test.');
  await page.locator('#modalClose').click();
  await page.reload();
  await page.locator('[data-key="naehe"]').click();
  await expect(page.locator('#modalText')).toHaveText('Nähe neu formuliert für den Test.');
  await page.keyboard.press('Escape');
  await expect(page.locator('#modalBg')).toBeHidden();

  // heroSub editierbar + persistiert (bankHeroSub)
  await page.locator('#editToggle').click();
  await expect(page.locator('#heroSub')).toHaveAttribute('contenteditable', 'true');
  await page.locator('#heroSub').fill('Testuntertitel 1974.');
  await page.locator('#heroSub').blur();
  await page.reload();
  await expect(page.locator('#heroSub')).toHaveText('Testuntertitel 1974.');

  // Regel 1: Seite scrollt nie
  const fits = await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight);
  expect(fits).toBe(true);
});
