import { test, expect } from '@playwright/test';
import { MODAL_PARITY_06 } from './modal-parity.fixture';

const NOW = new Date().getFullYear();

// GATE MODAL-PARITÄT 06 (ADR-12): jedes v1-Element in Ziel- und Wunsch-Modal.
test('06 Ziele — MODAL-PARITÄT (Ziel-/Wunsch-Modal, alle Kategorien)', async ({ page }) => {
  await page.goto('modules/06-ziele.html');

  for (const [katId, inspLabels] of Object.entries(MODAL_PARITY_06.inspProKat)) {
    await test.step(`Kategorie ${katId}`, async () => {
      await page.locator(`[data-kat="${katId}"]`).click();
      await expect(page.locator('#modalZiel')).toBeVisible();
      for (const t of [...MODAL_PARITY_06.zielCommon, ...inspLabels.map((l) => `insp|${l}`)]) {
        await expect(page.locator(`#modalZiel [data-v1-field="${t}"]`), `${katId}: "${t}" fehlt`).toHaveCount(1);
      }
      // Prob nur bei Zielen, nie bei Zufluss (v1)
      for (const t of MODAL_PARITY_06.zielProb) {
        await expect(page.locator(`#modalZiel [data-v1-field="${t}"]`)).toHaveCount(katId === 'zufluss' ? 0 : 1);
      }
      await page.keyboard.press('Escape');
    });
  }

  // Wunsch-Modal
  await page.locator('#btnWunsch').click();
  for (const t of MODAL_PARITY_06.wunsch) {
    await expect(page.locator(`#modalWunsch [data-v1-field="${t}"]`), `Wunsch: "${t}" fehlt`).toHaveCount(1);
  }
  await page.keyboard.press('Escape');
});

// Verhalten: Zeithorizont-Konditionale, Speichern/Bubble, Persistenz, Recap
test('06 Ziele — Smoke (Erfassen, Zeithorizont, Persistenz, Recap)', async ({ page }) => {
  await page.goto('modules/06-ziele.html');
  await expect(page.locator('.zl-kachel')).toHaveCount(8);
  await expect(page.locator('#emptyHint')).toBeVisible();

  // Ziel erfassen: Kategorie Anschaffungen (defaultJahr kurz → Jahr-Kacheln sichtbar)
  await page.locator('[data-kat="anschaffungen"]').click();
  await expect(page.locator('.zl-yrtile')).toHaveCount(3);
  await page.locator('[data-v1-field="insp|Auto / Fahrzeug"]').click();
  await expect(page.locator('#mz-nm')).toHaveValue('Auto / Fahrzeug');   // v1: Chip prefillt Name
  // Horizont lang → Slider erscheint; offen → Detail verschwindet
  await page.locator('[data-v1-field="horizon|lang"]').click();
  await expect(page.locator('#sl-yr')).toBeVisible();
  await page.locator('[data-v1-field="horizon|offen"]').click();
  await expect(page.locator('#sl-detail-wrap')).toBeHidden();
  // zurück auf kurz, Jahr wählen, sicher, speichern
  await page.locator('[data-v1-field="horizon|kurz"]').click();
  await page.locator('.zl-yrtile').first().click();
  await page.locator('[data-v1-field="prob|sicher"]').click();
  await page.locator('#mz-save').click();
  await expect(page.locator('#modalZiel')).toBeHidden();
  await expect(page.locator('.zl-bubble')).toHaveCount(1);
  await expect(page.locator('.zl-kbadge.vis')).toHaveText('1');
  await expect(page.locator('#stZiele')).toHaveText('1');

  // Persistenz (BBZ.merge {ziele})
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('bbzData') || '{}'));
  expect(stored.ziele).toHaveLength(1);
  expect(stored.ziele[0]).toMatchObject({ katId: 'anschaffungen', name: 'Auto / Fahrzeug', prob: 'sicher', jahr: NOW });

  // Ziel ohne Jahr → Sammelspalte "Zeitpunkt offen"
  await page.locator('[data-kat="vorsorge"]').click();
  await page.locator('[data-v1-field="insp|BVG-Einkauf"]').click();
  await page.locator('#mz-save').click();
  await expect(page.locator('#rc-offen-body .zl-ndchip')).toHaveCount(1);

  // Wunsch erfassen (rot, Kundeninhalt)
  await page.locator('#btnWunsch').click();
  await page.locator('#w-name').fill('Segeltörn Karibik');
  await page.locator('[data-v1-field="wkat|freizeit"]').click();
  await page.locator('#mw-save').click();
  await expect(page.locator('.zl-wchip')).toHaveCount(1);
  await expect(page.locator('#stWuensche')).toHaveText('1');

  // Recap: 3 Ereignisse, Klick auf Eintrag öffnet Edit
  await page.locator('#btnRecap').click();
  await expect(page.locator('#recap-sub')).toHaveText('3 Ereignisse erfasst');
  await expect(page.locator('.zl-rcrow')).toHaveCount(3);
  await page.locator('.zl-rcrow.wsh').click();
  await expect(page.locator('#modalRecap')).toBeHidden();
  await expect(page.locator('#mw-title')).toHaveText('Wunsch bearbeiten');
  await expect(page.locator('#w-name')).toHaveValue('Segeltörn Karibik');
  // Löschen im Edit (v1)
  await page.locator('#mw-del').click();
  await expect(page.locator('#stWuensche')).toHaveText('0');

  // Reload: Daten bleiben
  await page.reload();
  await expect(page.locator('#stZiele')).toHaveText('2');

  const fits = await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight);
  expect(fits).toBe(true);
});

// Achse: Zoom-Fenster + 65er-Milestones aus Stammdaten
test('06 Ziele — Achse (Zoom, Milestones)', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('bbzData')) {
      localStorage.setItem('bbzData', JSON.stringify({ p1name: 'Anna Muster', p1geb: '1980-06-01' }));
    }
  });
  await page.goto('modules/06-ziele.html');
  // Kurzfristig: 3 Ticks (now..now+2)
  await expect(page.locator('.zl-tick')).toHaveCount(3);
  await page.locator('#zoom-25').click();
  await expect(page.locator('.zl-tick')).toHaveCount(6);
  // Langfristig: Milestone "Anna 65" (1980+65=2045 innerhalb Achse)
  await page.locator('#zoom-all').click();
  await expect(page.locator('.zl-ms')).toContainText('Anna 65');
});
