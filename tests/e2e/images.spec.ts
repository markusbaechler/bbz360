import { test, expect, type Page } from '@playwright/test';

// ============================================================================
// Zentrale Bildverwaltung: Registry-Resolve (Repo-Default), Override-Fallback,
// Admin-"App-Bilder"-Panel (Ersetzen/Zurücksetzen), Export enthält bbzImages,
// Legacy-Migration alter Bild-Keys.
// ============================================================================

const BASE = '/bbz360/';
const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function setOverride(page: Page, slot: string, dataUrl: string): Promise<void> {
  await page.evaluate(([s, u]) => {
    const o = JSON.parse(localStorage.getItem('bbzImages') || '{}');
    o[s] = u;
    localStorage.setItem('bbzImages', JSON.stringify(o));
  }, [slot, dataUrl]);
}

test('Registry-Defaults: Module zeigen die Repo-Bilder (public/img)', async ({ page }) => {
  // 02 Bank Titelbild
  await page.goto('modules/02-bank.html');
  await expect(page.locator('#heroImg')).toHaveAttribute('src', new RegExp(`${BASE}img/bank/bbzbank\\.jpg`));
  // 04 Philosophie Phase-Bilder
  await page.goto('modules/04-philosophie.html');
  await expect(page.locator('#img-panel-0 img')).toHaveAttribute('src', new RegExp('philosophie_a\\.jpg'));
  await expect(page.locator('#img-panel-3 img')).toHaveAttribute('src', new RegExp('philosophie_d\\.jpg'));
  // 09 Feedback Titel + Frage-Bilder (background-image)
  await page.goto('modules/09-feedback.html');
  const s1 = await page.locator('#s1img').evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(s1).toContain('feedback_a.jpg');
  const q0 = await page.locator('#qimg-0').evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(q0).toContain('feedback_b.jpg');
  // 10 Abschluss Hintergrund
  await page.goto('modules/10-abschluss.html');
  const bg = await page.locator('#heroBg').evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(bg).toContain('abschluss/abschluss.jpg');
});

test('Override-Fallback: bbzImages überschreibt Default, wirkt modulübergreifend', async ({ page }) => {
  await page.addInitScript((u) => {
    if (!localStorage.getItem('bbzImages')) {
      localStorage.setItem('bbzImages', JSON.stringify({ bank_hero: u, abschluss_bg: u, phil_2: u }));
    }
  }, tinyPng);
  await page.goto('modules/02-bank.html');
  await expect(page.locator('#heroImg')).toHaveAttribute('src', tinyPng);
  await page.goto('modules/04-philosophie.html');
  await expect(page.locator('#img-panel-1 img')).toHaveAttribute('src', tinyPng);   // phil_2
  await expect(page.locator('#img-panel-0 img')).toHaveAttribute('src', /philosophie_a\.jpg/); // phil_1 = Default
  await page.goto('modules/10-abschluss.html');
  const bg = await page.locator('#heroBg').evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(bg).toContain(tinyPng.slice(0, 40));
});

test('Legacy-Migration: alte Bild-Keys werden weiter gelesen', async ({ page }) => {
  await page.addInitScript((u) => {
    if (!localStorage.getItem('bbzData')) {
      localStorage.setItem('bbzData', JSON.stringify({ abschluss_bgImage: u, fb_s1_img: u }));
      localStorage.setItem('bbz_beratungsphilosophie_v1', JSON.stringify({ phases: [{ image: u }] }));
    }
  }, tinyPng);
  await page.goto('modules/10-abschluss.html');
  const bg = await page.locator('#heroBg').evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(bg).toContain(tinyPng.slice(0, 40));   // aus abschluss_bgImage
  await page.goto('modules/09-feedback.html');
  const s1 = await page.locator('#s1img').evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(s1).toContain(tinyPng.slice(0, 40));   // aus fb_s1_img
  await page.goto('modules/04-philosophie.html');
  await expect(page.locator('#img-panel-0 img')).toHaveAttribute('src', tinyPng); // aus phases[0].image
});

test('Admin App-Bilder-Panel: Ersetzen (Override) + Zurücksetzen (Default)', async ({ page }) => {
  await page.goto('admin.html');
  // In die App-Bilder-Ansicht wechseln
  await page.locator('#tabImages').click();
  await expect(page.locator('#viewImages')).toBeVisible();
  await expect(page.locator('#viewProfiles')).toBeHidden();
  // Alle 9 Slots sichtbar (Bank 1, Philosophie 4, Feedback 3, Abschluss 1)
  await expect(page.locator('.ad-imgcard')).toHaveCount(9);
  await expect(page.locator('.ad-imgcard[data-slot="bank_hero"] .ad-imgpath')).toHaveText('public/img/bank/bbzbank.jpg');

  // Ersetzen: Upload → Override + Badge "angepasst" + reset aktivierbar
  const png = Buffer.from(tinyPng.split(',')[1], 'base64');
  await page.locator('.ad-imgcard[data-slot="bank_hero"] [data-act="replace"]').click();
  await page.locator('#slotFileInput').setInputFiles({ name: 'hero.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('.ad-imgcard[data-slot="bank_hero"] .ad-imgbadge')).toHaveText('angepasst');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('bbzImages') || '{}'));
  expect(stored.bank_hero).toContain('data:image/png');

  // Wirkt in Modul 02
  await page.goto('modules/02-bank.html');
  await expect(page.locator('#heroImg')).toHaveAttribute('src', /^data:image\/png/);

  // Zurücksetzen → Repo-Default
  await page.goto('admin.html');
  await page.locator('#tabImages').click();
  await page.locator('.ad-imgcard[data-slot="bank_hero"] [data-act="reset"]').click();
  await expect(page.locator('.ad-imgcard[data-slot="bank_hero"] .ad-imgbadge')).toHaveCount(0);
  const cleared = await page.evaluate(() => JSON.parse(localStorage.getItem('bbzImages') || '{}'));
  expect(cleared.bank_hero).toBeUndefined();
});

test('Export/Import enthält bbzImages (ADR-5)', async ({ page }) => {
  await page.goto('./');
  await setOverride(page, 'abschluss_bg', tinyPng);
  const dl = page.waitForEvent('download');
  await page.locator('#btnExport').click();
  const path = await (await dl).path();
  const fs = await import('fs');
  const exported = JSON.parse(fs.readFileSync(path!, 'utf-8'));
  expect(exported.bbzImages.abschluss_bg).toBe(tinyPng);

  // Import stellt Bild-Overrides wieder her
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('#importFile').setInputFiles(path!);
  // importSession lädt neu — auf den wiederhergestellten Store warten (übersteht Reload).
  await page.waitForFunction(() => {
    try { return !!JSON.parse(localStorage.getItem('bbzImages') || '{}').abschluss_bg; } catch { return false; }
  });
  const back = await page.evaluate(() => JSON.parse(localStorage.getItem('bbzImages') || '{}'));
  expect(back.abschluss_bg).toBe(tinyPng);
});
