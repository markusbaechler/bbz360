// ============================================================================
// 06-ziele-zweistufig.spec.ts — Ziel- und Wunsch-Modal fuehren in zwei Stufen.
//
// Stufe 1 fragt nur "Worum geht es?". Erst nach der Wahl klappt die
// Erfassungsmaske auf; die Wahl schrumpft dann auf eine Zeile mit "aendern".
// Bearbeiten startet direkt in Stufe 2 — dort ist die Wahl schon getroffen.
// ============================================================================
import { test, expect } from '@playwright/test';

test('neues Ziel: Stufe 1 zeigt nur die Wahl', async ({ page }) => {
  await page.goto('modules/06-ziele.html');
  await page.waitForSelector('[data-kat]');
  await page.locator('[data-kat]').first().click();

  await expect(page.locator('#modalZiel .zl-wahl')).toBeVisible();
  await expect(page.locator('#modalZiel .zl-inspchip').first()).toBeVisible();
  // Erfassungsmaske und Speichern sind noch nicht da.
  await expect(page.locator('#mz-nm')).toBeHidden();
  await expect(page.locator('#mz-bt')).toBeHidden();
  await expect(page.locator('#mz-save')).toBeHidden();
  await expect(page.locator('#modalZiel .zl-auswahl')).toBeHidden();
});

test('Wahl oeffnet die Erfassungsmaske und schrumpft zur Zeile', async ({ page }) => {
  await page.goto('modules/06-ziele.html');
  await page.waitForSelector('[data-kat]');
  await page.locator('[data-kat]').first().click();
  const ersterChip = page.locator('#modalZiel .zl-inspchip').first();
  const begriff = (await ersterChip.innerText()).trim();
  await ersterChip.click();

  await expect(page.locator('#mz-nm')).toBeVisible();
  await expect(page.locator('#mz-bt')).toBeVisible();
  await expect(page.locator('#mz-save')).toBeVisible();
  await expect(page.locator('#modalZiel .zl-wahl')).toBeHidden();
  const zeile = page.locator('#modalZiel .zl-auswahl');
  await expect(zeile).toBeVisible();
  await expect(zeile).toContainText(begriff);
  await expect(zeile).toContainText('ändern');
});

test('"aendern" fuehrt zurueck zu Stufe 1, Auswahl bleibt markiert', async ({ page }) => {
  await page.goto('modules/06-ziele.html');
  await page.waitForSelector('[data-kat]');
  await page.locator('[data-kat]').first().click();
  await page.locator('#modalZiel .zl-inspchip').first().click();
  await page.locator('#modalZiel .zl-auswahl').click();

  await expect(page.locator('#modalZiel .zl-wahl')).toBeVisible();
  await expect(page.locator('#mz-save')).toBeHidden();
  await expect(page.locator('#modalZiel .zl-inspchip').first()).toHaveClass(/active/);
});

test('Bearbeiten eines erfassten Ziels startet in Stufe 2', async ({ page }) => {
  await page.goto('modules/06-ziele.html');
  await page.waitForSelector('[data-kat]');
  await page.locator('[data-kat]').first().click();
  await page.locator('#modalZiel .zl-inspchip').first().click();
  await page.locator('#mz-nm').fill('Eigenheim Testfall');
  await page.locator('#mz-save').click();
  await expect(page.locator('#modalZiel')).toBeHidden();

  // Erfasste Ziele erscheinen als Blase auf der Zeitachse; der Kreis oeffnet sie.
  await page.locator('.zl-bubble .zl-circle').first().click();

  await expect(page.locator('#mz-nm')).toBeVisible();
  await expect(page.locator('#mz-save')).toBeVisible();
  await expect(page.locator('#modalZiel .zl-wahl')).toBeHidden();
  await expect(page.locator('#mz-nm')).toHaveValue('Eigenheim Testfall');
});

test('Wunsch-Modal fuehrt genauso in zwei Stufen', async ({ page }) => {
  await page.goto('modules/06-ziele.html');
  await page.waitForSelector('#btnWunsch');
  await page.locator('#btnWunsch').click();

  await expect(page.locator('#modalWunsch .zl-wahl')).toBeVisible();
  await expect(page.locator('#w-name')).toBeHidden();
  await expect(page.locator('#mw-save')).toBeHidden();

  await page.locator('#mw-kat .zl-inspchip').first().click();

  await expect(page.locator('#w-name')).toBeVisible();
  await expect(page.locator('#mw-save')).toBeVisible();
  await expect(page.locator('#modalWunsch .zl-auswahl')).toBeVisible();
});
