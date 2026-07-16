import { test, expect } from '@playwright/test';

// Smoke 08 Vereinbarungen (Wizard, Grammatik v3):
//  - Erfassen (sequenzielle Freischaltung): Thema→Fokus→Formulieren→Festhalten
//  - Priorisieren-Roundtrip: einordnen → umentscheiden → Gate erst bei voller Einordnung
//  - Planen: Fokus-Karte; Persistenz nach Reload; Regel 1 (kein Seiten-Scroll)
test('08 Vereinbarungen — Smoke (Wizard)', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon/i.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('modules/08-vereinbarungen.html');
  await expect(page.locator('.rail-title')).toHaveText('Vereinbarungen');
  await expect(page.locator('#bbzNav .bbz-nav-tab')).toHaveCount(11);
  const noScroll = await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1);
  expect(noScroll, 'Regel 1').toBe(true);

  // ── Erfassen: eine Vereinbarung sequenziell festhalten ──
  async function capture(sparte: string, fokus: string) {
    await page.locator(`.wz-chip[data-cap="sparte"][data-v="${sparte}"]`).click();
    await page.locator(`.wz-chip[data-cap="reifegrad"][data-v="${fokus}"]`).click();
    await page.locator('#capSug').click(); // Vorschlag übernehmen
    await page.locator('#capSave').click();
  }
  await capture('Anlegen', 'optionen');
  await expect(page.locator('.wz-listrow')).toHaveCount(1);

  // Queue-Roundtrip: erfasste Zeile editieren
  await page.locator('.wz-listrow [data-act="edit"]').first().click();
  await expect(page.locator('#capText')).not.toHaveValue('');
  await page.locator('#capText').fill('Editierte Vereinbarung');
  await page.locator('#capSave').click();
  await expect(page.locator('.wz-listrow')).toHaveCount(1);
  await expect(page.locator('.wz-listrow').first()).toContainText('Editierte Vereinbarung');
  // ... und löschen
  await page.locator('.wz-listrow [data-act="del"]').first().click();
  await expect(page.locator('.wz-listrow')).toHaveCount(0);

  // zwei Vereinbarungen für die weiteren Phasen
  await capture('Anlegen', 'optionen');
  await capture('Vorsorgen', 'umsetzung');
  await expect(page.locator('.wz-listrow')).toHaveCount(2);
  // Queue-Persistenz nach Reload (bleibt Phase 1)
  await page.reload();
  await expect(page.locator('.wz-listrow')).toHaveCount(2);

  // Forward-Gate: ab 1 Vereinbarung aktiv
  await expect(page.locator('#btnFwd')).toBeEnabled();
  await page.locator('#btnFwd').click();
  await expect(page.locator('.rail-phase.active')).toContainText('Priorisieren');

  // ── Priorisieren-Roundtrip ──
  await expect(page.locator('.wz-todo .wz-prow')).toHaveCount(2);
  await expect(page.locator('#btnFwd')).toBeDisabled(); // Gate: noch nicht alle eingeordnet
  // erste einordnen -> SOFORT
  await page.locator('.wz-todo .wz-prow').first().locator('.wz-chip[data-prio="sofort"]').click();
  await expect(page.locator('.wz-todo .wz-prow')).toHaveCount(1);
  // umentscheiden: Quittungszeile klicken -> Chips wieder da
  await page.locator('.wz-group .wz-qrow').first().click();
  await expect(page.locator('.wz-prow.reopen')).toHaveCount(1);
  await page.locator('.wz-prow.reopen .wz-chip[data-prio="demnaechst"]').click();
  // zweite einordnen
  await page.locator('.wz-todo .wz-prow').first().locator('.wz-chip[data-prio="sofort"]').click();
  await expect(page.locator('.wz-todo .wz-prow')).toHaveCount(0);
  await expect(page.locator('#btnFwd')).toBeEnabled(); // Gate offen

  // ── Planen ──
  await page.locator('#btnFwd').click();
  await expect(page.locator('.rail-phase.active')).toContainText('planen');
  await expect(page.locator('.card-focus')).toHaveCount(1);

  // ── Persistenz ──
  await page.reload();
  await expect(page.locator('.rail-phase.active')).toContainText('planen');
  await expect(page.locator('.card-focus')).toHaveCount(1);

  expect(errors, 'keine Console-Errors').toEqual([]);
});
