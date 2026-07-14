import { test, expect } from '@playwright/test';

// Smoke 01 Agenda (Grammatik v3): laedt, keine Console-Errors, Nav 11 Tabs,
// Traktanden Add/Edit/Delete-Roundtrip (edit-mode), Persistenz nach Reload,
// Regel 1: kein Seiten-Scroll.
test('01 Agenda — Smoke', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon/i.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('modules/01-agenda.html');
  await expect(page.locator('.rail-title')).toBeVisible();
  await expect(page.locator('#bbzNav .bbz-nav-tab')).toHaveCount(11);
  await expect(page.locator('#bbzNav .bbz-nav-tab.active')).toContainText('Agenda');

  const rows = page.locator('#trakList .ag-tr');
  await expect(rows).toHaveCount(6);

  // Regel 1: Seite scrollt nicht
  const noScroll = await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1);
  expect(noScroll, 'Seite darf nicht scrollen (Regel 1)').toBe(true);

  // Edit-Modus: Werkzeuge sichtbar, ADD -> 7
  await page.locator('#editToggle').click();
  await page.locator('#trakAdd').click();
  await expect(rows).toHaveCount(7);

  // EDIT letzten
  const last = page.locator('#trakList .ag-tt').last();
  await last.selectText();
  await page.keyboard.type('Smoke-Eintrag');
  await expect(last).toHaveText('Smoke-Eintrag');

  // DELETE letzten -> 6
  await page.locator('#trakList .ag-del').last().click();
  await expect(rows).toHaveCount(6);

  // PERSISTENZ ersten Eintrag -> reload
  const first = page.locator('#trakList .ag-tt').first();
  await first.selectText();
  await page.keyboard.type('Persist-Check');
  await expect(first).toHaveText('Persist-Check');

  await page.reload();
  await expect(page.locator('#trakList .ag-tt').first()).toHaveText('Persist-Check');

  expect(errors, 'keine Console-Errors').toEqual([]);
});
