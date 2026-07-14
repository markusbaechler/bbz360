import { test, expect } from '@playwright/test';

// Smoke 01 Agenda (Archetyp B): laedt, keine Console-Errors, Nav 11 Tabs,
// Traktanden Add/Edit/Delete-Roundtrip, Persistenz nach Reload.
test('01 Agenda — Smoke', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon/i.test(m.text())) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('modules/01-agenda.html');
  await expect(page.locator('h1')).toBeVisible();

  // Stepper-Nav: 11 Tabs, 01 aktiv
  await expect(page.locator('#bbzNav .bbz-nav-tab')).toHaveCount(11);
  await expect(page.locator('#bbzNav .bbz-nav-tab.active')).toContainText('Agenda');

  const items = page.locator('#trakList .ag-item');
  await expect(items).toHaveCount(6);

  // Edit-Modus an -> Werkzeuge sichtbar
  await page.locator('#editToggle').click();

  // ADD -> 7
  await page.locator('.ag-add[data-list="agenda"]').click();
  await expect(items).toHaveCount(7);

  // EDIT letzten Eintrag (Text ersetzen)
  const last = page.locator('#trakList .ag-item .ag-text').last();
  await last.selectText();
  await page.keyboard.type('Smoke-Test-Eintrag');
  await expect(last).toHaveText('Smoke-Test-Eintrag');

  // DELETE letzten -> zurueck auf 6
  await page.locator('#trakList .ag-del').last().click();
  await expect(items).toHaveCount(6);

  // PERSISTENZ: ersten Eintrag editieren, reload, Wert muss bleiben
  const first = page.locator('#trakList .ag-item .ag-text').first();
  await first.selectText();
  await page.keyboard.type('Persist-Check');
  await expect(first).toHaveText('Persist-Check');

  await page.reload();
  await expect(page.locator('#trakList .ag-item .ag-text').first()).toHaveText('Persist-Check');

  expect(errors, 'keine Console-Errors').toEqual([]);
});
