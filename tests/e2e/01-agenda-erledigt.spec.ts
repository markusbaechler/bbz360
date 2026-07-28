// ============================================================================
// 01-agenda-erledigt.spec.ts — Traktanden als erledigt markieren.
// Spec: docs/superpowers/specs/2026-07-28-agenda-traktanden-abhaken-design.md
//
// Heikel ist nicht das Umschalten, sondern die Kopplung an den Index:
// agenda_erledigt[] muss bei Sortieren, Loeschen und Hinzufuegen mit
// agenda_traktanden[] mitwandern.
// ============================================================================
import { test, expect, type Page } from '@playwright/test';

const HAKEN = (n: number) => `#trakList .ag-tr:nth-child(${n}) .ag-tn`;

const erledigtStand = (page: Page): Promise<boolean[]> =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('#trakList .ag-tn'))
      .map((b) => b.getAttribute('aria-checked') === 'true'));

const texte = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('#trakList .ag-tt')).map((n) => n.textContent ?? ''));

test('Traktandum abhaken funktioniert ohne Bearbeiten-Modus und uebersteht den Reload', async ({ page }) => {
  await page.goto('modules/01-agenda.html');
  await page.waitForSelector('#trakList .ag-tr');
  await expect(page.locator('body')).not.toHaveClass(/edit-mode/);

  await page.locator(HAKEN(2)).click();

  await expect(page.locator(HAKEN(2))).toHaveAttribute('aria-checked', 'true');
  expect(await erledigtStand(page)).toEqual([false, true, false, false, false, false]);

  await page.reload();
  await page.waitForSelector('#trakList .ag-tr');
  expect(await erledigtStand(page)).toEqual([false, true, false, false, false, false]);

  // Erledigt wird durch die graue Zeile markiert, NICHT durch Durchstreichen.
  const stil = await page.locator('#trakList .ag-tr:nth-child(2)').evaluate((row) => ({
    strich: getComputedStyle(row.querySelector('.ag-tt')!).textDecorationLine,
    zeile: getComputedStyle(row).backgroundColor,
    offen: getComputedStyle(row.parentElement!.children[0]).backgroundColor,
  }));
  expect(stil.strich).toBe('none');
  expect(stil.zeile).not.toBe(stil.offen);
});

test('Klick auf den Traktandentext hakt ab', async ({ page }) => {
  await page.goto('modules/01-agenda.html');
  await page.waitForSelector('#trakList .ag-tr');

  await page.locator('#trakList .ag-tr:nth-child(3) .ag-tt').click();

  expect(await erledigtStand(page)).toEqual([false, false, true, false, false, false]);
});

test('im Bearbeiten-Modus bearbeitet ein Klick auf den Text, statt abzuhaken', async ({ page }) => {
  await page.goto('modules/01-agenda.html');
  await page.waitForSelector('#trakList .ag-tr');
  await page.locator('#editToggle').click();

  const text = page.locator('#trakList .ag-tr:nth-child(3) .ag-tt');
  await text.click();
  await page.keyboard.type('X');

  expect(await erledigtStand(page)).toEqual([false, false, false, false, false, false]);
  await expect(text).toContainText('X');
  // Die Nummer bleibt auch im Bearbeiten-Modus der Schalter.
  await page.locator(HAKEN(3)).click();
  expect(await erledigtStand(page)).toEqual([false, false, true, false, false, false]);
});

test('Loeschen und Ziehgriff haken nicht ab', async ({ page }) => {
  await page.goto('modules/01-agenda.html');
  await page.waitForSelector('#trakList .ag-tr');
  await page.locator('#editToggle').click();

  await page.locator('#trakList .ag-tr:nth-child(2) .ag-grip').click();
  expect(await erledigtStand(page)).toEqual([false, false, false, false, false, false]);

  await page.locator('#trakList .ag-tr:nth-child(2) [data-act="del"]').click();
  expect(await erledigtStand(page)).toEqual([false, false, false, false, false]);
});

test('Zaehler erscheint erst ab dem ersten Haken und zaehlt mit', async ({ page }) => {
  await page.goto('modules/01-agenda.html');
  await page.waitForSelector('#trakList .ag-tr');
  await expect(page.locator('#trakCount')).toHaveText('');

  await page.locator(HAKEN(1)).click();
  await expect(page.locator('#trakCount')).toContainText('1 von 6 erledigt');

  await page.locator(HAKEN(3)).click();
  await expect(page.locator('#trakCount')).toContainText('2 von 6 erledigt');

  await page.locator(HAKEN(1)).click(); // wieder oeffnen
  await expect(page.locator('#trakCount')).toContainText('1 von 6 erledigt');
});

test('Loeschen eines offenen Traktandums laesst den Haken am richtigen Eintrag', async ({ page }) => {
  await page.goto('modules/01-agenda.html');
  await page.waitForSelector('#trakList .ag-tr');
  const vorher = await texte(page);

  await page.locator(HAKEN(3)).click(); // drittes erledigt
  await page.locator('#editToggle').click(); // Loeschen ist edit-only
  await page.locator('#trakList .ag-tr:nth-child(1) [data-act="del"]').click();

  expect(await texte(page)).toEqual(vorher.slice(1));
  // Der Haken haengt weiterhin am selben Text, jetzt an Position 2.
  expect(await erledigtStand(page)).toEqual([false, true, false, false, false]);
});

test('Sortieren nimmt den Haken an das richtige Traktandum mit', async ({ page }) => {
  await page.goto('modules/01-agenda.html');
  await page.waitForSelector('#trakList .ag-tr');
  const vorher = await texte(page);

  await page.locator(HAKEN(1)).click(); // erstes erledigt
  await page.locator('#editToggle').click(); // Griff ist edit-only

  // Erstes Traktandum an die dritte Position ziehen.
  const griff = page.locator('#trakList .ag-tr:nth-child(1) .ag-grip');
  const ziel = page.locator('#trakList .ag-tr:nth-child(3)');
  const g = (await griff.boundingBox())!;
  const z = (await ziel.boundingBox())!;
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(z.x + z.width / 2, z.y + z.height / 2, { steps: 12 });
  await page.mouse.up();

  // Wo genau Sortable einfuegt, ist Nebensache — der Haken muss am selben
  // Traktandum haengen bleiben, und zwar auch nach dem Neuladen.
  const neuePos = (await texte(page)).indexOf(vorher[0]);
  expect(neuePos).toBeGreaterThan(0); // wirklich verschoben
  const stand = await erledigtStand(page);
  expect(stand[neuePos]).toBe(true);
  expect(stand.filter(Boolean)).toHaveLength(1);

  await page.reload();
  await page.waitForSelector('#trakList .ag-tr');
  expect((await texte(page)).indexOf(vorher[0])).toBe(neuePos);
  const nachReload = await erledigtStand(page);
  expect(nachReload[neuePos]).toBe(true);
  expect(nachReload.filter(Boolean)).toHaveLength(1);
});

test('Modul 10 zeigt den Haken fuer erledigte Traktanden', async ({ page }) => {
  // Vor der ersten Navigation registrieren: der Bericht entsteht beim Drucken,
  // ein echter Druckdialog wuerde den Test blockieren.
  await page.addInitScript(() => { window.print = () => { /* Test */ }; });
  await page.goto('modules/01-agenda.html');
  await page.waitForSelector('#trakList .ag-tr');
  await page.locator(HAKEN(2)).click();

  await page.goto('modules/10-abschluss.html');
  // Der Button steht im statischen HTML — erst nach mountNav() haengen die
  // Listener aus init(), vorher verpufft der Klick.
  await page.waitForSelector('#bbzNav .bbz-nav-tab');
  await page.locator('#btnPrint').click();
  // #printReport ist am Bildschirm ausgeblendet (Druck-CSS) — auf 'attached' pruefen.
  await page.waitForSelector('#printReport .rp-lrow', { state: 'attached' });
  const zeilen = page.locator('#printReport .rp-lrow');
  await expect(zeilen.nth(1).locator('.rp-ldone')).toHaveCount(1);
  await expect(zeilen.nth(1)).toContainText('Veränderungen');
  await expect(zeilen.nth(0).locator('.rp-ldone')).toHaveCount(0);
});
