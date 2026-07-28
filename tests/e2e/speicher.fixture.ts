// Hilfsmittel fuer Tests, die das Verhalten bei vollem localStorage pruefen.
import type { Page } from '@playwright/test';

// Fuellt den Origin-Speicher bis auf wenige Bytes. Absteigende Blockgroessen,
// damit am Ende wirklich kein nennenswerter Platz mehr frei ist.
export async function speicherFuellen(page: Page): Promise<void> {
  await page.evaluate(() => {
    const fuellen = (groesse: number, praefix: string): void => {
      const block = 'x'.repeat(groesse);
      for (let i = 0; i < 500; i++) {
        try { localStorage.setItem(praefix + i, block); } catch { return; }
      }
    };
    fuellen(64 * 1024, '__f64_');
    fuellen(4 * 1024, '__f4_');
    fuellen(256, '__f256_');
    fuellen(32, '__f32_'); // fein genug, dass auch ein kurzer bbzData-Write scheitert
  });
}
