import { test, expect } from '@playwright/test';

// Smoke index — Funktionsumfang = v1 index.html: Berater-Picker, Kundendaten,
// Modul-Toggles (bbzCockpit), Vertiefung min. 1, Readiness-gedimmte
// Primäraktion mit Freischalt-Bedingung, Neue Beratung (config bleibt),
// Export/Import (ADR-5).
test('index — Beratercockpit (Picker, Readiness, Toggles, Reset)', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.ix-bopt')).toHaveCount(5);       // berater.json Fallback

  // Readiness: gedimmt + Freischalt-Bedingung im Button (Grammatik §1)
  const btn = page.locator('#btnStart');
  await expect(btn).toBeDisabled();
  await expect(btn).toContainText('fehlt:');

  await page.locator('#p1name').fill('Anna Muster');
  await page.locator('#p1geb').fill('1980-03-15');
  await expect(btn).toBeEnabled();
  await expect(page.locator('#readinessText')).toHaveText('Bereit zum Start');

  // Berater wählen → Spiegel in bbzData (v1)
  await page.locator('.ix-bopt').nth(1).click();
  const mirror = await page.evaluate(() => JSON.parse(localStorage.getItem('bbzData') || '{}'));
  expect(mirror.aktiverBerater).toBe(2);

  // Modul-Toggle (02 abwählbar), Pflichtmodule nicht
  await page.locator('[data-tog="m02"]').click();
  await expect(page.locator('[data-tog="m02"]')).toHaveClass(/off/);
  await expect(page.locator('.ix-mod', { hasText: 'Agenda' })).not.toHaveClass(/tog/);

  // Vertiefung: letzte aktive nicht abwählbar; zweite zuschaltbar
  await page.locator('[data-branch="b07a"]').click();          // einzige aktive → bleibt
  await expect(page.locator('[data-branch="b07a"]')).not.toHaveClass(/off/);
  await page.locator('[data-branch="b07b"]').click();
  await expect(page.locator('#branchHint')).toContainText('Beide Vertiefungen aktiv');

  // Neue Beratung: Session weg, Config (bbzCockpit/Toggles) bleibt
  await page.locator('#btnReset').click();
  await page.locator('#resetConfirm').click();
  await expect(page.locator('#p1name')).toHaveValue('');
  const after = await page.evaluate(() => ({
    data: JSON.parse(localStorage.getItem('bbzData') || '{}'),
    cockpit: JSON.parse(localStorage.getItem('bbzCockpit') || '{}'),
  }));
  expect(after.data.p1name ?? '').toBe('');
  expect(after.cockpit.disabled.m02).toBe(true);

  // Gespräch starten → erstes aktives Einstiegs-Modul (01)
  await page.locator('#p1name').fill('Anna Muster');
  await page.locator('#p1geb').fill('1980-03-15');
  await page.locator('#btnStart').click();
  await expect(page).toHaveURL(/01-agenda\.html/);
});

// Smoke admin — Funktionsumfang = v1 admin.html: Profil-Liste, Stammdaten,
// Kachel-Editor mit autoSave → bbzAdmin (Array) + Spiegel berater_texte_<id>.
test('admin — Beraterprofile (Editor, Persistenz bbzAdmin)', async ({ page }) => {
  await page.goto('admin.html');
  await expect(page.locator('.ad-item')).toHaveCount(5);
  await expect(page.locator('#chTitle')).toHaveText('Vorname Nachname');

  // Name ändern → live in Kopf + Sidebar + bbzAdmin
  await page.locator('#fieldName').fill('Petra Beispiel');
  await expect(page.locator('#chTitle')).toHaveText('Petra Beispiel');
  const admin = await page.evaluate(() => JSON.parse(localStorage.getItem('bbzAdmin') || '[]'));
  expect(Array.isArray(admin)).toBe(true);
  expect(admin[0].name).toBe('Petra Beispiel');

  // Kachel-Editor: Inhalt tippen → autoSave in bbzAdmin + berater_texte_1-Spiegel
  await page.locator('#kachelEditor').fill('Seit 20 Jahren in der Beratung.');
  const saved = await page.evaluate(() => ({
    admin: JSON.parse(localStorage.getItem('bbzAdmin') || '[]'),
    data: JSON.parse(localStorage.getItem('bbzData') || '{}'),
  }));
  expect(saved.admin[0].kacheln[0].content).toContain('Seit 20 Jahren');
  expect(saved.data['berater_texte_1']['1']).toContain('Seit 20 Jahren');

  // Kachel-Tab wechseln, Titel ändern
  await page.locator('[data-tab="2"]').click();
  await page.locator('#kachelTitleInput').fill('Meine Hobbys');
  await expect(page.locator('.ad-tab.active')).toHaveText('Meine Hobbys');
});

// Export/Import-Roundtrip (ADR-5): Export lädt JSON, Import stellt Session her
test('index — Export/Import-Roundtrip (ADR-5)', async ({ page }) => {
  await page.goto('./');
  await page.locator('#p1name').fill('Roundtrip Kunde');
  await page.locator('#p1geb').fill('1975-01-01');

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#btnExport').click();
  const download = await downloadPromise;
  const path = await download.path();
  const fs = await import('fs');
  const exported = JSON.parse(fs.readFileSync(path!, 'utf-8'));
  expect(exported.bbzData.p1name).toBe('Roundtrip Kunde');
  expect(exported).toHaveProperty('bbzAdmin');
  expect(exported).toHaveProperty('__schemaVersion');

  // Alles löschen, dann importieren → Daten wieder da
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('#p1name')).toHaveValue('');
  await page.locator('#importFile').setInputFiles(path!);
  await page.waitForURL(/\/$|index\.html/);
  await expect(page.locator('#p1name')).toHaveValue('Roundtrip Kunde');
});
