import { test, expect, type Page } from '@playwright/test';
import { ADMIN_PARITY, INDEX_PARITY } from './index-admin-parity.fixture';

// ============================================================================
// GATE PARITÄT index+admin (ADR-12 analog MODAL-PARITÄT, DESIGN-SPEC §5.4):
// jedes v1-Feld/-Control MUSS im v2 existieren; Kern-Verhalten wird geprueft;
// Datenfluss admin-Kacheln → Modul 03 verifiziert. Fehlt etwas → roter Test.
// ============================================================================

async function assertExists(page: Page, selectors: string[]): Promise<void> {
  for (const sel of selectors) {
    await expect(page.locator(sel), `v1-Element "${sel}" fehlt`).toHaveCount(1);
  }
}

test('admin — PARITÄT (v1-Funktionsumfang vollständig)', async ({ page }) => {
  await page.goto('admin.html');
  await assertExists(page, ADMIN_PARITY.static);
  for (const [sel, c] of Object.entries(ADMIN_PARITY.counts)) {
    const n = await page.locator(sel).count();
    if ('eq' in c) expect(n, `${sel}: erwartet ${c.eq}`).toBe(c.eq);
    if ('min' in c) expect(n, `${sel}: erwartet ≥${c.min}`).toBeGreaterThanOrEqual(c.min);
  }
  // Rich-Text-Toolbar: alle 5 v1-Befehle
  for (const cmd of ADMIN_PARITY.toolbar) {
    await expect(page.locator(`[data-cmd="${cmd}"]`), `Toolbar-Befehl "${cmd}" fehlt`).toHaveCount(1);
  }
  await expect(page.locator(ADMIN_PARITY.editor)).toHaveCount(1);
  await expect(page.locator(ADMIN_PARITY.titleInput)).toHaveCount(1);
});

test('admin — Verhalten (Profile, Stammdaten, Foto, Kachel, stripStyles, bbzAdmin)', async ({ page }) => {
  await page.goto('admin.html');

  // Mehrere Profile: zweites wählbar (openProfile/renderSidebar)
  await expect(page.locator('.ad-item')).toHaveCount(5);
  await page.locator('.ad-item').nth(1).click();
  await expect(page.locator('.ad-item').nth(1)).toHaveClass(/active/);

  // Profil 1 bearbeiten
  await page.locator('.ad-item').first().click();
  // Stammdaten live → Kopf + Sidebar + bbzAdmin (onNameChange/onTitelChange/persist)
  await page.locator('#fieldName').fill('Petra Beispiel');
  await page.locator('#fieldTitel').fill('Vorsorgeexpertin');
  await expect(page.locator('#chTitle')).toHaveText('Petra Beispiel');
  await expect(page.locator('#chSubtitle')).toHaveText('Vorsorgeexpertin');
  await expect(page.locator('.ad-item').first()).toContainText('Petra Beispiel');

  // Foto-Modal: Upload (FileReader) → Thumb has-img + fmImg + bbzAdmin.foto_b64 + Toast
  await page.locator('.ad-foto').first().click();
  await expect(page.locator('#fotoModalBg')).toBeVisible();
  await expect(page.locator('#fmBtnRemove')).toBeDisabled();     // leer → Entfernen gesperrt
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  await page.locator('#fotoFileInput').setInputFiles({ name: 'p.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('#fmImg')).toBeVisible();
  await expect(page.locator('#toast')).toHaveText('Foto gespeichert');
  await expect(page.locator('.ad-foto').first()).toHaveClass(/has-img/);
  // Entfernen (removeFotoModal)
  await expect(page.locator('#fmBtnRemove')).toBeEnabled();
  await page.locator('#fmBtnRemove').click();
  await expect(page.locator('#fmEmpty')).toBeVisible();
  await page.locator('#fmClose').click();

  // Kachel-System: Tab-Wechsel, Titel editierbar (onKachelTitleChange → Tab-Label)
  await expect(page.locator('.ad-tab')).toHaveCount(3);
  await page.locator('[data-tab="2"]').click();
  await page.locator('#kachelTitleInput').fill('Meine Hobbys');
  await expect(page.locator('.ad-tab.active')).toHaveText('Meine Hobbys');
  // Rich-Text: Liste einfügen (execCmd insertUnorderedList) — kein Fehler, Editor fokussiert
  await page.locator('#kachelEditor').click();
  await page.locator('#kachelEditor').type('Wandern');
  await page.locator('[data-cmd="ul"]').click();
  // stripStyles (Paste-Äquivalent): gestyltes HTML → bbzAdmin-Content OHNE style-Attribute
  await page.locator('#kachelEditor').evaluate((el) => {
    el.innerHTML = '<span style="color:red;font-weight:900">Gestylt</span> <font face="Arial">Text</font>';
    el.dispatchEvent(new Event('input', { bubbles: true }));   // v1: input → autoSave → stripStyles
  });
  const admin = await page.evaluate(() => JSON.parse(localStorage.getItem('bbzAdmin') || '[]'));
  expect(Array.isArray(admin)).toBe(true);
  const k2 = admin[0].kacheln[1].content as string;
  expect(k2).toContain('Gestylt');
  expect(k2).not.toMatch(/style=|<font/i);        // Styles/Font gestrippt (stripStyles)
  expect(admin[0].kacheln[1].titel).toBe('Meine Hobbys');

  // Speichern-Button (saveAll) → Toast
  await page.locator('#btnSave').click();
  await expect(page.locator('#toast')).toHaveText('Profil gespeichert');
});

test('index — PARITÄT (v1-Funktionsumfang vollständig)', async ({ page }) => {
  await page.goto('./');
  await assertExists(page, INDEX_PARITY.static);
  for (const [sel, c] of Object.entries(INDEX_PARITY.counts)) {
    const n = await page.locator(sel).count();
    if ('eq' in c) expect(n, `${sel}: erwartet ${c.eq}`).toBe(c.eq);
    if ('min' in c) expect(n, `${sel}: erwartet ≥${c.min}`).toBeGreaterThanOrEqual(c.min);
  }
  // Toggle-Flags: 02/03/04 umschaltbar; Pflichtmodule NICHT
  for (const id of INDEX_PARITY.toggleable) {
    await expect(page.locator(`[data-tog="${id}"]`), `Toggle ${id} fehlt`).toHaveCount(1);
  }
  for (const name of INDEX_PARITY.pflicht) {
    await expect(page.locator('.ix-mod', { hasText: name })).not.toHaveClass(/tog/);
  }
  for (const b of INDEX_PARITY.branches) {
    await expect(page.locator(`[data-branch="${b}"]`), `Branch ${b} fehlt`).toHaveCount(1);
  }
});

// Datenfluss admin-Kacheln → Modul 03 (v1: bbzAdmin.kacheln[] speist 03).
test('Datenfluss admin → Modul 03 (Name, Kachel-Titel, Content, Foto)', async ({ page }) => {
  await page.goto('admin.html');
  await page.locator('.ad-item').first().click();      // Profil 1 (= Default aktiverBerater)
  await page.locator('#fieldName').fill('Petra Beispiel');
  await page.locator('#fieldTitel').fill('Vorsorgeexpertin');
  // Kachel 1: Titel + Content
  await page.locator('[data-tab="1"]').click();
  await page.locator('#kachelTitleInput').fill('Wer ich bin');
  await page.locator('#kachelEditor').fill('20 Jahre Erfahrung in der Vorsorge.');
  // Foto Kachel 1
  await page.locator('.ad-foto').first().click();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  await page.locator('#fotoFileInput').setInputFiles({ name: 'p.png', mimeType: 'image/png', buffer: png });
  await page.locator('#fmClose').click();
  await page.locator('#btnSave').click();

  // Modul 03 liest bbzAdmin-Profil 1
  await page.goto('modules/03-berater.html');
  await expect(page.locator('#beraterName')).toHaveText('Petra Beispiel');
  await expect(page.locator('#beraterTitel')).toContainText('Vorsorgeexpertin');
  await expect(page.locator('.br-ctitle').first()).toHaveText('Wer ich bin');   // Kachel-Titel aus Admin
  await expect(page.locator('#preview-1')).toContainText('20 Jahre Erfahrung'); // Content aus Admin
  const bg = await page.locator('#photo-1').evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(bg).toContain('data:image');                 // foto_b64 aus Admin
});
