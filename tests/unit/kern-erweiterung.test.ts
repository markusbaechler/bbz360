import { describe, it, expect } from 'vitest';
import params from '../../public/data/params.json';
import { createEngine } from '../../src/lib/pension/engine';
import { resolveParams, nextParams } from '../../src/lib/pension/params';
import { EXAMPLE, clone, sanitize } from '../../src/lib/pension/state';
import type { ParamDatei, PensState } from '../../src/lib/pension/typen';

// bbz360 (ADR-19): additive Erweiterung des Rechenkerns — Zuflüsse und Liegenschaftskauf in der Zukunft.
const A0 = 2026 * 12 + 10; // November 2026
const daten = params as unknown as ParamDatei;
const E = createEngine(resolveParams(daten, 2026), A0, nextParams(daten, 2026));
const basis = (): PensState => sanitize(clone(EXAMPLE)); // P1 Jahrgang 1972 (Juni), ZH, verheiratet
const sim = (S: PensState) => E.simulate({ ...S, horizont: 91 });
const zeile = (r: ReturnType<typeof sim>, jahr: number) => r.rows.find((x) => x.year === jahr)!;

describe('Stand: neue Felder nur, wenn gesetzt', () => {
  it('ohne Zuflüsse und Kauf bleibt der Stand wie im PensCheck', () => {
    const S = basis();
    expect('zufluesse' in S).toBe(false);
    expect(Object.keys(S.liegenschaften[0]).sort()).toEqual(['hypothek', 'mietertrag', 'name', 'nebenkosten', 'typ', 'unterhalt', 'verkaufAlter', 'verkehrswert', 'zins']);
  });
  it('Zuflüsse und Kauf-Felder werden geprüft und begrenzt', () => {
    const S = sanitize({ ...clone(EXAMPLE), zufluesse: [{ name: 'Erbschaft', betrag: 300000, jahr: 2035 }, { name: 'leer', betrag: 0, jahr: 2030 }, { name: 'ohne Jahr', betrag: 5 }, 'kaputt'],
      liegenschaften: [{ name: 'Neu', typ: 'eigen', verkehrswert: 900000, hypothek: 600000, zins: 2, kaufAlter: 60, kaufFremd: 50000, kaufMieteWeg: 2000, boese: 1 }] });
    expect(S.zufluesse).toEqual([{ name: 'Erbschaft', betrag: 300000, jahr: 2035 }]);
    expect(S.liegenschaften[0]).toMatchObject({ kaufAlter: 60, kaufFremd: 50000, kaufMieteWeg: 2000 });
    expect('boese' in S.liegenschaften[0]).toBe(false);
  });
});

describe('Zufluss', () => {
  it('erhöht das freie Vermögen im Jahr des Zuflusses um den Betrag (heutige Kaufkraft) und erscheint im Ablauf', () => {
    const ohne = sim(basis());
    const S = basis();
    S.zufluesse = [{ name: 'Erbschaft', betrag: 300000, jahr: 2035 }];
    const mit = sim(S);
    const z = zeile(mit, 2035);
    // Zufluss im Januar; z.I ist der Teuerungsstand Ende Jahr (1% Teuerung): knapp unter dem Betrag
    expect(z.zufluss! / z.I).toBeGreaterThan(300000 / 1.011);
    expect(z.zufluss! / z.I).toBeLessThanOrEqual(300000);
    // vorher identisch, ab dann mehr Vermögen
    expect(zeile(mit, 2034).V).toBe(zeile(ohne, 2034).V);
    expect(z.V - zeile(ohne, 2035).V).toBeGreaterThan(z.zufluss! * 0.99);
    expect(mit.endV).toBeGreaterThan(ohne.endV);
    expect(mit.events.some((e) => e.text === 'Zufluss: Erbschaft' && e.betrag === 300000)).toBe(true);
    expect(zeile(ohne, 2035).zufluss).toBeUndefined();
  });
  it('verbessert tragbare Ausgaben und kann die Ampel drehen', () => {
    const S = basis();
    S.zufluesse = [{ name: 'Erbschaft', betrag: 800000, jahr: 2032 }];
    expect(E.maxAusgaben({ ...S, horizont: 91 })).toBeGreaterThan(E.maxAusgaben({ ...basis(), horizont: 91 }));
    expect(E.ampel({ ...basis(), horizont: 91 }).st).toBe('gelb');
    expect(E.ampel({ ...S, horizont: 91 }).st).toBe('gruen');
  });
  it('ein Zufluss im laufenden oder in einem vergangenen Jahr gilt sofort', () => {
    const S = basis();
    S.zufluesse = [{ name: 'Schenkung', betrag: 100000, jahr: 2020 }];
    expect(zeile(sim(S), 2026).zufluss).toBe(100000);
  });
});

describe('Liegenschaftskauf in der Zukunft', () => {
  const mitKauf = (extra: Record<string, number> = {}): PensState => {
    const S = basis();
    S.liegenschaften = []; // ohne heutiges Eigenheim: der Kauf steht für sich
    const ohneHeim = clone(S);
    void ohneHeim;
    S.liegenschaften.push({ name: 'Eigenheim', typ: 'eigen', verkehrswert: 1000000, hypothek: 650000, zins: 2, unterhalt: 0.5, nebenkosten: 400, mietertrag: 0, verkaufAlter: 0, kaufAlter: 57, ...extra });
    return S;
  };
  const ohneKauf = (): PensState => { const S = basis(); S.liegenschaften = []; return S; };
  // Kauf im Monat nach dem 57. Geburtstag von Person 1: Juli 2029

  it('vor dem Kauf gibt es weder Wert noch Hypothek; der Verlauf ist bis dahin identisch', () => {
    const a = sim(mitKauf()), b = sim(ohneKauf());
    expect(zeile(a, 2028).V).toBe(zeile(b, 2028).V);
    expect(zeile(a, 2028).lgWerte).toEqual([0]);
    expect(zeile(a, 2028).hyp).toBe(0);
  });
  it('beim Kauf fliessen die Eigenmittel ab; Wert und Hypothek entstehen', () => {
    const a = sim(mitKauf()), b = sim(ohneKauf());
    const z = zeile(a, 2029);
    // Eigenmittel = Preis − Hypothek, beide in Franken des Kaufmonats
    expect(z.lgKauf! / z.I).toBeGreaterThan(350000 * 0.98);
    expect(z.lgKauf! / z.I).toBeLessThan(350000 * 1.02);
    expect(z.hyp / z.I).toBeGreaterThan(650000 * 0.98);
    expect(z.hyp / z.I).toBeLessThan(650000 * 1.02);
    expect(z.lgWerte[0]).toBeGreaterThan(1000000);
    expect(zeile(b, 2029).V - z.V).toBeGreaterThan(z.lgKauf! * 0.95);
    expect(a.events.some((e) => /^Kauf Eigenheim/.test(e.text))).toBe(true);
  });
  it('nach dem Kauf kommen Zins, Unterhalt und Nebenkosten dazu; die wegfallende Miete senkt die Ausgaben', () => {
    const ohneMiete = sim(mitKauf()), mitMiete = sim(mitKauf({ kaufMieteWeg: 2000 })), ohne = sim(ohneKauf());
    const j = 2031, I = zeile(ohne, j).I;
    // 650'000 × 2% + 1'000'000 × 0.5% + 12 × 400 = 22'800 pro Jahr in heutiger Kaufkraft (Hypothek nominal fest)
    const mehr = (zeile(ohneMiete, j).ausgaben - zeile(ohne, j).ausgaben) / I;
    expect(mehr).toBeGreaterThan(22800 * 0.95);
    expect(mehr).toBeLessThan(22800 * 1.02);
    const weg = (zeile(ohneMiete, j).ausgaben - zeile(mitMiete, j).ausgaben) / I;
    expect(weg).toBeGreaterThan(24000 * 0.99);
    expect(weg).toBeLessThan(24000 * 1.01);
  });
  it('PK-Vorbezug: fliesst als besteuerter Kapitalbezug zu', () => {
    const ohne = sim(mitKauf()), mit = sim(mitKauf({ kaufFremd: 100000 }));
    const bezug = mit.kapListe.find((k) => /PK-Vorbezug für Eigenheim/.test(k.art))!;
    expect(bezug.betrag).toBe(100000);
    expect(bezug.steuer).toBeGreaterThan(0);
    expect(bezug.steuer).toBeLessThan(15000);
    // Vermögen Ende Kaufjahr: um Vorbezug abzüglich Steuer höher (plus etwas Ertrag)
    const diff = zeile(mit, 2029).V - zeile(ohne, 2029).V;
    expect(diff).toBeGreaterThan((100000 - bezug.steuer) * 0.99);
    expect(diff).toBeLessThan((100000 - bezug.steuer) * 1.03);
  });
  it('das Eigenkapital von heute zählt einen künftigen Kauf nicht', () => {
    expect(E.eigenkapitalReal(mitKauf())).toBe(0);
    expect(E.eigenkapitalReal(basis())).toBe(700000);
  });
  it('ein Kaufalter in der Vergangenheit bedeutet: heute im Besitz', () => {
    const S = mitKauf({ kaufAlter: 40 });
    const z = zeile(sim(S), 2026);
    expect(z.lgWerte[0]).toBeGreaterThan(0);
    expect(z.lgKauf).toBeUndefined();
  });
});
