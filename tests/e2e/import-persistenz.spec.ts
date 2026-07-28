// ============================================================================
// import-persistenz.spec.ts — Regression: Importe duerfen nicht still scheitern.
//
// Gleiche Fehlerklasse wie bild-persistenz.spec.ts: der localStorage-Schreib-
// fehler wurde verschluckt. Beim Import ist der Schaden groesser — ein halb
// geschriebener Stand vermischt alte und neue Sitzung. Erwartung: entweder
// vollstaendig uebernommen oder unveraendert, in jedem Fall sichtbar gemeldet.
// ============================================================================
import { test, expect } from '@playwright/test';
import { speicherFuellen } from './speicher.fixture';

test('Session-Import bei vollem Speicher: Meldung statt halber Uebernahme', async ({ page }) => {
  await page.goto('index.html');
  await page.evaluate(() => {
    localStorage.setItem('bbzData', JSON.stringify({ p1name: 'Anna Vorher', p1geb: '1980-03-15' }));
  });
  await speicherFuellen(page);
  // Ein Reload wuerde diese Markierung loeschen — so faellt er auf.
  await page.evaluate(() => { (window as unknown as Record<string, unknown>).__ohneReload = true; });

  const payload = JSON.stringify({
    __schemaVersion: 2,
    bbzData: { p1name: 'Bruno Neu', notiz: 'y'.repeat(300 * 1024) },
    bbzAdmin: [{ id: 1, name: 'Bruno Neu', kacheln: [] }],
    bbzImages: {},
  });
  await page.locator('#importFile').setInputFiles({
    name: 'session.json', mimeType: 'application/json', buffer: Buffer.from(payload),
  });

  await expect(page.locator('#footerDataInfo')).toContainText('Speicher');
  const nachher = await page.evaluate(() => ({
    ohneReload: (window as unknown as Record<string, unknown>).__ohneReload === true,
    daten: localStorage.getItem('bbzData') || '',
  }));
  expect(nachher.ohneReload).toBe(true);
  expect(nachher.daten).toContain('Anna Vorher');
  expect(nachher.daten).not.toContain('Bruno Neu');
});

test('Repo-Import bei vollem Speicher meldet den Fehlschlag', async ({ page }) => {
  // Vorhandener Stand bewusst KLEIN: beim Ueberschreiben wird nur sein eigener
  // Platz frei, die fuenf importierten Profile brauchen deutlich mehr.
  await page.goto('admin.html');
  await page.evaluate(() => localStorage.setItem('bbzAdmin', JSON.stringify([{
    id: 1, name: 'Vorher Bestand', titel: 'Kundenberater:in',
    kacheln: [0, 1, 2].map(() => ({ titel: 'K', foto_b64: null, content: '' })),
  }])));
  await page.reload();
  await page.waitForSelector('#sidebarList .ad-item');
  await speicherFuellen(page);

  await page.locator('#btnRepo').click();
  await page.locator('#rmImport').click();
  await page.locator('#rmImportConfirm').click();

  await expect(page.locator('#toast')).toContainText('nicht gespeichert');
  const gespeichert = await page.evaluate(() => localStorage.getItem('bbzAdmin') || '');
  expect(gespeichert).toContain('Vorher Bestand');
  await expect(page.locator('#chTitle')).toHaveText('Vorher Bestand');
});
