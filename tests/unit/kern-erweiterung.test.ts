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
      liegenschaften: [{ name: 'Neu', typ: 'eigen', verkehrswert: 900000, hypothek: 600000, zins: 2, kaufJahr: 2032, kaufFremd: 50000, kaufMieteWeg: 2000, boese: 1 }],
      wuensche: [{ typ: 'einmal', aktiv: true, name: 'Auto', betrag: 50000, jahr: 2030, alter: 58 }] });
    expect(S.zufluesse).toEqual([{ name: 'Erbschaft', betrag: 300000, jahr: 2035 }]);
    expect(S.liegenschaften[0]).toMatchObject({ kaufJahr: 2032, kaufFremd: 50000, kaufMieteWeg: 2000 });
    expect(S.wuensche[0]).toMatchObject({ typ: 'einmal', jahr: 2030, alter: 58 });
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

describe('Einmalige Ausgabe mit Kalenderjahr (Befunde A8, B4)', () => {
  const mit = (jahr: number, extra: Record<string, unknown> = {}): PensState => sanitize({ ...clone(EXAMPLE), ...extra, wuensche: [{ typ: 'einmal', aktiv: true, name: 'Auto', betrag: 200000, jahr, alter: jahr - 1972 }] });
  const ohne = (extra: Record<string, unknown> = {}): PensState => sanitize({ ...clone(EXAMPLE), ...extra, wuensche: [] });
  it('im laufenden Jahr wird sofort abgezogen (vorher: nie, wenn der Geburtstag schon vorbei war)', () => {
    const a = sim(mit(2026)), b = sim(ohne());
    expect(zeile(a, 2026).wAus).toBeGreaterThan(199000);
    expect(b.endV - a.endV).toBeGreaterThan(200000);
    expect(a.events.some((e) => e.text === 'Wunsch: Auto' && e.A === A0)).toBe(true);
  });
  it('in einem künftigen Jahr im Januar dieses Jahres, auch bei Geburtsmonat Dezember (vorher: Januar des Folgejahrs)', () => {
    const dez = { personen: [{ ...clone(EXAMPLE).personen[0], geburtsmonat: 12 }, clone(EXAMPLE).personen[1]] };
    const a = sim(mit(2030, dez));
    expect(zeile(a, 2030).wAus).toBeGreaterThan(200000);
    expect(zeile(a, 2031).wAus).toBe(0);
    expect(a.events.find((e) => e.text === 'Wunsch: Auto')!.A).toBe(2030 * 12);
  });
  it('ohne Kalenderjahr gilt weiterhin das Alter von Person 1 (wie im PensCheck)', () => {
    const S = sanitize({ ...clone(EXAMPLE), wuensche: [{ typ: 'einmal', aktiv: true, name: 'Auto', betrag: 200000, alter: 60 }] });
    // Juni 1972 + 60 Jahre → Monat nach dem Geburtstag: Juli 2032
    expect(sim(S).events.find((e) => e.text === 'Wunsch: Auto')!.A).toBe(2032 * 12 + 6);
  });
});

describe('Liegenschaftskauf in der Zukunft', () => {
  const mitKauf = (extra: Record<string, number> = {}, basisExtra: Record<string, unknown> = {}): PensState => {
    const S = sanitize({ ...clone(EXAMPLE), ...basisExtra });
    S.liegenschaften = []; // ohne heutiges Eigenheim: der Kauf steht für sich
    S.liegenschaften.push({ name: 'Eigenheim', typ: 'eigen', verkehrswert: 1000000, hypothek: 650000, zins: 2, unterhalt: 0.5, nebenkosten: 400, mietertrag: 0, verkaufAlter: 0, kaufJahr: 2029, ...extra });
    return S;
  };
  const ohneKauf = (): PensState => { const S = basis(); S.liegenschaften = []; return S; };
  // Kauf im Januar 2029

  it('vor dem Kauf gibt es weder Wert noch Hypothek; der Verlauf ist bis dahin identisch', () => {
    const a = sim(mitKauf()), b = sim(ohneKauf());
    expect(zeile(a, 2028).V).toBe(zeile(b, 2028).V);
    expect(zeile(a, 2028).lgWerte).toEqual([0]);
    expect(zeile(a, 2028).hyp).toBe(0);
  });
  it('beim Kauf fliessen die Eigenmittel ab; Wert und Hypothek entstehen', () => {
    const a = sim(mitKauf()), b = sim(ohneKauf());
    const z = zeile(a, 2029);
    // Eigenmittel = Preis − Hypothek, beide in Franken des Kaufmonats (Januar; z.I ist der Stand Ende Jahr)
    expect(z.lgKauf! / z.I).toBeGreaterThan(350000 / 1.011);
    expect(z.lgKauf! / z.I).toBeLessThanOrEqual(350000);
    expect(z.hyp / z.I).toBeGreaterThan(650000 / 1.011);
    expect(z.hyp / z.I).toBeLessThanOrEqual(650000);
    expect(z.lgWerte[0]).toBeGreaterThan(1000000);
    expect(zeile(b, 2029).V - z.V).toBeGreaterThan(z.lgKauf! * 0.95);
    expect(a.events.find((e) => /^Kauf Eigenheim/.test(e.text))!.A).toBe(2029 * 12);
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
  it('B7: ab 75 sinkt die wegfallende Miete mit den Ausgaben um denselben Satz; die Ausgaben werden nie negativ', () => {
    // Musterfall: Reduktion ab 75 auf 90%; jüngere Person Jahrgang 1972 → ab 2048 voll wirksam
    const ohneMiete = sim(mitKauf()), mitMiete = sim(mitKauf({ kaufMieteWeg: 2000 }));
    const j = 2050, I = zeile(ohneMiete, j).I;
    const weg = (zeile(ohneMiete, j).ausgaben - zeile(mitMiete, j).ausgaben) / I;
    expect(weg).toBeGreaterThan(24000 * 0.9 * 0.99);
    expect(weg).toBeLessThan(24000 * 0.9 * 1.01);
    const absurd = sim(mitKauf({ kaufMieteWeg: 50000 }));
    expect(Math.min(...absurd.rows.map((r) => r.ausgaben))).toBeGreaterThanOrEqual(0);
  });
  it('A11: der PK-Vorbezug steht wie der Kaufpreis in heutiger Kaufkraft und fliesst als besteuerter Kapitalbezug zu', () => {
    const spaet = (extra: Record<string, number>): PensState => { const S = mitKauf(extra); S.liegenschaften[0].kaufJahr = 2040; return S; };
    const mit = sim(spaet({ kaufFremd: 200000 }));
    const bezug = mit.kapListe.find((k) => /PK-Vorbezug für Eigenheim/.test(k.art))!;
    // 14 Jahre Teuerung von 1%: der Vorbezug bleibt real 200'000 (vorher nominal 200'000 = real rund 174'000)
    expect(bezug.betrag / bezug.I).toBeGreaterThan(199000);
    expect(bezug.betrag / bezug.I).toBeLessThan(201000);
    expect(bezug.steuer).toBeGreaterThan(0);
    const ohne = sim(spaet({}));
    const diff = zeile(mit, 2040).V - zeile(ohne, 2040).V;
    expect(diff).toBeGreaterThan((bezug.betrag - bezug.steuer) * 0.99);
    expect(diff).toBeLessThan((bezug.betrag - bezug.steuer) * 1.04);
  });
  it('ein Vorbezug über den Eigenmitteln wird auf die Eigenmittel begrenzt', () => {
    const r = sim(mitKauf({ kaufFremd: 900000 }));
    const bezug = r.kapListe.find((k) => /PK-Vorbezug/.test(k.art))!;
    expect(bezug.betrag / bezug.I).toBeLessThanOrEqual(350000 * 1.001);
  });
  it('B8/B10: ein künftiger Kauf zählt heute weder zum Eigenkapital noch zur Vermögenssteuer; ein erreichtes Kaufjahr heisst «im Besitz»', () => {
    expect(E.eigenkapitalReal(mitKauf())).toBe(0);
    expect(E.eigenkapitalReal(basis())).toBe(700000);
    expect(E.vermSteuerHeute(mitKauf()).rein).toBe(E.vermSteuerHeute(ohneKauf()).rein);
    // Kaufjahr 2026 (laufendes Jahr, Januar vorbei) oder früher: im Besitz, in allen drei Sichten gleich
    for (const kaufJahr of [2026, 2010]) {
      const S = mitKauf({ kaufJahr });
      const z = zeile(sim(S), 2026);
      expect(z.lgWerte[0]).toBeGreaterThan(0);
      expect(z.lgKauf).toBeUndefined();
      expect(E.eigenkapitalReal(S)).toBe(350000);
      expect(E.vermSteuerHeute(S).rein).toBeGreaterThan(E.vermSteuerHeute(ohneKauf()).rein);
    }
  });
  it('B6: eine erst nach der Pensionierung gekaufte Liegenschaft zählt nicht ungeprüft als Reserve', () => {
    // Knapper Plan: im Stresstest reicht es bis 97, am Ende bleibt genug Eigenkapital der Liegenschaft. Für eine
    // heute gehaltene Liegenschaft gäbe das (nach Tragbarkeitsprüfung) «grün»; für eine erst 2042 gekaufte gibt es
    // zum Zeitpunkt der Pensionierung keine Prüfung, also keine Freigabe.
    const S = basis();
    S.wuensche = []; S.ausgabenRuhestand = 7500; S.liquiditaet = 100000;
    S.liegenschaften = [{ name: 'X', typ: 'eigen', verkehrswert: 900000, hypothek: 100000, zins: 2, unterhalt: 0.5, nebenkosten: 400, mietertrag: 0, verkaufAlter: 0, kaufJahr: 2042 }];
    const amp = E.ampel({ ...S, horizont: 91 });
    expect(amp.base.depleted).toBeNull();
    expect(amp.stress.depleted).toBeGreaterThanOrEqual(85);
    expect(amp.reserveLg).toBeNull();
    expect(amp.st).toBe('gelb');
  });
});

describe('Zweiter Prüflauf: ungültige Jahre werden verworfen, nicht auf 1990 geklemmt', () => {
  it('Zufluss, Ausgabe und Kauf mit Jahr 0 oder ausserhalb des Bereichs', async () => {
    const { sanitize, EXAMPLE, clone } = await import('../../src/lib/pension/state');
    const roh = clone(EXAMPLE) as any;
    roh.zufluesse = [{ name: 'a', betrag: 300000, jahr: 0 }, { name: 'b', betrag: 1000, jahr: 35 }, { name: 'c', betrag: 1000, jahr: 2040 }];
    roh.wuensche = [{ typ: 'einmal', aktiv: true, name: 'w', betrag: 5000, alter: 70, jahr: 0 }, { typ: 'einmal', aktiv: true, name: 'x', betrag: 5000, alter: 70, jahr: 2044 }];
    roh.liegenschaften[0].kaufJahr = 0;
    const s = sanitize(roh);
    expect(s.zufluesse).toEqual([{ name: 'c', betrag: 1000, jahr: 2040 }]);
    expect(s.wuensche[0].jahr).toBeUndefined();
    expect(s.wuensche[0].alter).toBe(70);
    expect(s.wuensche[1].jahr).toBe(2044);
    expect('kaufJahr' in s.liegenschaften[0]).toBe(false);
  });
});

describe('Dritter Prüflauf: Zufluss nach dem Horizont', () => {
  it('ist kein Ereignis im Ablauf (vorher: Ereignis mit Betrag, obwohl nicht gerechnet)', async () => {
    const { sanitize, EXAMPLE, clone } = await import('../../src/lib/pension/state');
    const { analyse } = await import('../../src/lib/pension/analyse');
    const S = sanitize({ ...clone(EXAMPLE), zufluesse: [{ name: 'spät', betrag: 50000, jahr: 2140 }, { name: 'früh', betrag: 50000, jahr: 2035 }] });
    const r = analyse(S, E, undefined, {});
    if (r.leer) throw new Error('leer');
    const texte = r.base.events.map((e) => e.text);
    expect(texte).toContain('Zufluss: früh');
    expect(texte).not.toContain('Zufluss: spät');
  });
});
