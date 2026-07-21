import { test, expect } from '@playwright/test';
import fs from 'fs';

// Repo-Abgleich der Beraterprofile (Design 2026-07-21): Profile liegen
// browser-lokal in bbzAdmin; der geräteübergreifende Default ist
// public/data/berater.json. Export schreibt die Datei, Import holt sie zurück.

const seedAdmin = [{
  id: 1, name: 'Anna Meier', titel: 'Vorsorgeberaterin',
  kacheln: [
    { titel: 'Wer ich bin', foto_b64: null, content: '<p>Seit 12 Jahren bei der bbz.</p>' },
    { titel: 'Was ich mag', foto_b64: null, content: '<p>Berge.</p>' },
    { titel: 'Was Sie von mir erwarten können', foto_b64: null, content: '<p>Klartext.</p>' },
  ],
}];

test('admin — Export: berater.json trägt den lokalen Profilstand, ohne Base64', async ({ page }) => {
  await page.addInitScript((p) => localStorage.setItem('bbzAdmin', JSON.stringify(p)), seedAdmin);
  await page.goto('admin.html');
  await page.locator('#btnRepo').click();
  await expect(page.locator('#repoModalBg')).toBeVisible();
  // Ohne lokale Uploads steht nur das JSON in der Liste
  await expect(page.locator('.ad-repofile')).toHaveCount(1);
  await expect(page.locator('.ad-repoempty')).toBeVisible();

  const dl = page.waitForEvent('download');
  await page.locator('[data-dl="json"]').click();
  const download = await dl;
  expect(download.suggestedFilename()).toBe('berater.json');
  const raw = fs.readFileSync((await download.path())!, 'utf-8');
  expect(raw).not.toContain('data:image');
  const json = JSON.parse(raw);
  expect(json[0].name).toBe('Anna Meier');
  expect(json[0].titel).toBe('Vorsorgeberaterin');
  expect(json[0].kacheln[0].content).toContain('Seit 12 Jahren');
  expect(json[0].kacheln[2].foto).toBe('img/berater/berater1c.jpg');
});

test('admin — Export: lokal hochgeladenes Foto erscheint als eigene Repo-Datei', async ({ page }) => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  await page.addInitScript(([p, img]) => {
    const profs = JSON.parse(JSON.stringify(p));
    profs[0].kacheln[1].foto_b64 = img;
    localStorage.setItem('bbzAdmin', JSON.stringify(profs));
  }, [seedAdmin, png] as [typeof seedAdmin, string]);
  await page.goto('admin.html');
  await page.locator('#btnRepo').click();
  await expect(page.locator('.ad-repofile')).toHaveCount(2); // JSON + 1 Foto
  await expect(page.locator('.ad-repofile').nth(1)).toContainText('public/img/berater/berater1b.jpg');

  const dl = page.waitForEvent('download');
  await page.locator('[data-dl="foto-0"]').click();
  expect((await dl).suggestedFilename()).toBe('berater1b.jpg');
});

test('admin — Import: "Aus Repo laden" überschreibt erst nach Bestätigung', async ({ page }) => {
  await page.addInitScript((p) => localStorage.setItem('bbzAdmin', JSON.stringify(p)), seedAdmin);
  await page.goto('admin.html');
  await expect(page.locator('#chTitle')).toHaveText('Anna Meier');

  await page.locator('#btnRepo').click();
  // Erst nach dem ersten Klick erscheint die Bestätigung — kein Versehen
  await expect(page.locator('#rmImportConfirm')).toBeHidden();
  await page.locator('#rmImport').click();
  await expect(page.locator('#rmImportConfirm')).toBeVisible();
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('bbzAdmin') || '[]'));
  expect(before[0].name).toBe('Anna Meier');

  await page.locator('#rmImportConfirm').click();
  await expect(page.locator('#repoModalBg')).toBeHidden();
  // public/data/berater.json ist die Blanko-Vorlage → 5 Profile, Namen daraus
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('bbzAdmin') || '[]'));
  expect(after).toHaveLength(5);
  expect(after[0].name).toBe('Vorname Nachname');
  expect(after[0].kacheln).toHaveLength(3);
  expect(after[0].kacheln[0].foto_b64).toBeNull();
  await expect(page.locator('#chTitle')).toHaveText('Vorname Nachname');
});

test('index — Berater-Picker zeigt das Repo-Porträt mit BASE-Pfad', async ({ page }) => {
  await page.addInitScript((p) => localStorage.setItem('bbzAdmin', JSON.stringify(p)), seedAdmin);
  await page.goto('./');
  const img = page.locator('.ix-bopt[data-id="1"] .ix-bavatar img');
  await expect(img).toHaveAttribute('src', /\/bbz360\/img\/berater\/berater1a\.jpg$/);
});
