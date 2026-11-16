import { test, expect } from '@playwright/test';

// Regression (ADR-16): theme.css muss VOR den Modul-Stilen geladen werden —
// die Module ueberschreiben Theme-Regeln gleicher Spezifitaet. Als 07c dazukam
// (laedt theme.css bewusst nicht) und dieselben Hilfsmodule importierte wie
// alle anderen, lagerte der Build theme.css in eine eigene Datei aus und band
// sie NACH den Modul-Stilen ein: 07a wurde 1px zu hoch, Regel 1 verletzt.
// 07c darf deshalb lib/speicher-hinweis nicht statisch importieren.
const MODULE = ['01-agenda', '05-cockpit', '06-ziele', '07a-finanzieren', '07b-anlegen', '10-abschluss'];

test('theme.css steht in jedem Modul vor den Modul-Stilen', async ({ page }) => {
  for (const m of MODULE) {
    await page.goto(`modules/${m}.html`);
    await page.waitForSelector('.bbz-nav-tab');
    const pos = await page.evaluate(() => {
      const hat = (sheet: CSSStyleSheet, sel: string): boolean => {
        try { return [...sheet.cssRules].some((r) => (r as CSSStyleRule).selectorText === sel); } catch { return false; }
      };
      const sheets = [...document.styleSheets];
      const theme = sheets.findIndex((s) => hat(s, 'body.bbz-app'));
      // erste Datei mit modulspezifischen Regeln = erste nach dem Theme ohne dessen Kennregel
      const modul = sheets.findIndex((s, i) => i !== theme && (() => { try { return s.cssRules.length > 0; } catch { return false; } })());
      return { theme, modul };
    });
    expect(pos.theme, `${m}: theme.css nicht gefunden`).toBeGreaterThanOrEqual(0);
    expect(pos.theme, `${m}: theme.css steht nach den Modul-Stilen`).toBeLessThan(pos.modul);
  }
});
