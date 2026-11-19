import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { MUSTER } from './muster.fixture';

/** Stand der Session, wie er im Browser liegt. */
export const stand = (page: Page): Promise<Record<string, any>> => page.evaluate(() => JSON.parse(localStorage.getItem('bbzData') || '{}'));

/**
 * Liest den Musterfall über die Oberfläche ein («PensCheck-Stand einlesen» in 07c) — so entsteht der
 * Haushalts-Stand wie im Betrieb durch das Modul, nicht durch einen von Hand gesetzten Speicher.
 * leeren: Speicher vorher leeren (Standard). Danach steht die Seite auf 07c mit einem Urteil.
 */
export async function musterEinlesen(page: Page, { leeren = true }: { leeren?: boolean } = {}): Promise<void> {
  await page.goto('modules/07c-pension.html');
  if (leeren) {
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  }
  await page.locator('#btnImport').click();
  await page.locator('#importText').fill(JSON.stringify(MUSTER));
  await page.locator('#btnImportJa').click();
  // Rückfrage erscheint nur, wenn schon eigene Angaben da sind
  const ja = page.locator('#btnConfirmJa');
  if (await ja.isVisible().catch(() => false)) await ja.click();
  await expect(page.locator('#verdictText')).toContainText(/Reicht|Knapp|reicht/);
}
