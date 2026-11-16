import { it, expect } from 'vitest';
import params from '../../public/data/params.json';
import { createEngine } from '../../src/lib/pension/engine';
import { resolveParams, nextParams } from '../../src/lib/pension/params';
import { EXAMPLE, clone, sanitize } from '../../src/lib/pension/state';
import type { ParamDatei } from '../../src/lib/pension/typen';
// bbz360 (ADR-19): Die Jahresrechnung des freien Vermögens (07c, PDF) muss auch mit Zufluss und Kauf aufgehen.
it('Jahresrechnung: Anfangsvermögen plus alle Spalten ergibt das Endvermögen, auch mit Zufluss, Kauf und PK-Vorbezug', () => {
  const d = params as unknown as ParamDatei; const E = createEngine(resolveParams(d, 2026), 2026 * 12 + 10, nextParams(d, 2026));
  const S = sanitize({ ...clone(EXAMPLE), zufluesse: [{ name: 'Erbe', betrag: 300000, jahr: 2035 }] });
  S.liegenschaften.push({ name: 'F', typ: 'ferien', verkehrswert: 500000, hypothek: 300000, zins: 2, unterhalt: 1, nebenkosten: 0, mietertrag: 0, verkaufAlter: 0, kaufJahr: 2031, kaufFremd: 40000 });
  const r = E.simulate({ ...S, horizont: 91 });
  let maxAbw = 0;
  for (const x of r.rows) {
    const summe = x.lohn + x.uebrig + (x.zufluss || 0) + x.ahv + x.pk + x.kapZu + x.ertrag - x.ausgaben - (x.steuern + x.stVerm + x.stErtrag) - x.ne - x.einz3a + (x.wEin - x.wAus) + (x.lgNetto - x.amortFrei - (x.lgKauf || 0));
    maxAbw = Math.max(maxAbw, Math.abs(x.Vstart + summe - x.V));
  }
  expect(maxAbw).toBeLessThan(1);
});
