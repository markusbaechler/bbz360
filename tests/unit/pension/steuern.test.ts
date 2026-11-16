// @ts-nocheck — Referenztest, unverändert aus PensCheck (tests/steuern.test.js, Stand 4830eff) übernommen.
// Steuern auf Vermögen und Erträgen (F2, F8).
// Vermögenssteuer: Tarif des Kantonshauptorts aus der Steuerbelastungsstatistik der ESTV (tables.vermSteuer), oder ein
// eigener Satz in Promille. Steuer auf Erträgen: Pauschale.
// Die Vergleichswerte stammen aus dem Steuerrechner der ESTV (swisstaxcalculator.estv.admin.ch, Einkommens- und
// Vermögenssteuer), von Hand im Browser abgefragt am 14.11.2026: Steuerjahr 2026, Alter 66, ohne Kinder, konfessionslos,
// Renteneinkommen 60'000. Vermögenssteuer = Total Steuern mit Vermögen minus Total Steuern ohne Vermögen.
// Der Rechner ist ein anderer Weg zu den Zahlen als die Statistik-Schnittstelle, aus der die Tabelle stammt.
import { describe, it, expect } from 'vitest';
import params from '../../../public/data/params.json';
import { createEngine } from '../../../src/lib/pension/engine';
import { resolveParams } from '../../../src/lib/pension/params';
import { horizon } from '../../../src/lib/pension/analyse';
import { migrate, sanitize, LIMITS, KANTONE, EXAMPLE, clone } from '../../../src/lib/pension/state';
import { plausibelVerm, VERMOEGEN } from '../../../scripts/update-vermsteuer.mjs';

const A0 = 2026 * 12 + 10;
const P = resolveParams(params, 2026), E = createEngine(P, A0);
const T = params.tables.vermSteuer.data;
const inpOf = (s) => ({ ...s, ...horizon(s, E) });
const rentner = (o = {}) => migrate({ haushalt: 'single', kanton: 'SG', personen: [{ jahrgang: 1958, geburtsmonat: 1, geschlecht: 'm', pensAlter: 65, brutto: 0, ahvFehlJahre: 44 }], ausgabenRuhestand: 0, liquiditaet: 1000000, wertschriften: 0, kontoZins: 0, ahvAnpassung: 0, inflation: 0, steuerEink: 0, steuerVerm: 0, ertragSteuerbar: 0, ...o });
const jahr = (s, y = 2027) => E.simulate(inpOf(s)).rows.find((r) => r.year === y);

// [Kanton, Zivilstand, Reinvermögen, Total ohne Vermögen, Total mit Vermögen] aus dem Steuerrechner
const RECHNER = [
  ['SG', 'ledig', 500000, 7962, 9718], ['SG', 'ledig', 1000000, 7962, 11783],
  ['SG', 'verheiratet', 500000, 4017, 5463], ['SG', 'verheiratet', 1000000, 4017, 7528],
  ['ZH', 'ledig', 500000, 5784, 6423], ['ZH', 'ledig', 1000000, 5784, 7786],
  ['ZH', 'verheiratet', 500000, 3317, 3783], ['ZH', 'verheiratet', 1000000, 3317, 5062],
  ['TI', 'ledig', 500000, 7429, 9185], ['TI', 'ledig', 1000000, 7429, 11887],
  ['GE', 'ledig', 500000, 5820, 7458], ['GE', 'ledig', 1000000, 5820, 10366],
  ['SZ', 'ledig', 500000, 4429, 5071], ['SZ', 'ledig', 1000000, 4429, 5926],
].map(([kt, ziv, verm, ohne, mit]) => ({ kt, ziv, verm, steuer: mit - ohne }));

describe('Vermögenssteuer nach Kanton (Tabelle der ESTV)', () => {
  it('die Tabelle deckt alle 26 Kantone ab und ist plausibel', () => {
    expect(Object.keys(T.kantone).sort()).toEqual([...KANTONE].sort());
    expect(T.stuetzstellen).toEqual(VERMOEGEN);
    expect(T.steuerjahr).toBeGreaterThanOrEqual(2026);
    expect(plausibelVerm(T, T)).toEqual([]);
  });
  it('trifft die Beträge aus dem Steuerrechner der ESTV auf den Franken', () => {
    for (const x of RECHNER) expect(E.vermSteuerTab(x.kt, x.verm, x.ziv === 'verheiratet'), `${x.kt} ${x.ziv} ${x.verm}`).toBeCloseTo(x.steuer, 0);
  });
  it('steigt in jedem Kanton mit dem Vermögen, und der Satz steigt mit (Freibeträge, Progression)', () => {
    for (const kt of KANTONE) for (const verh of [false, true]) {
      let vor = -1, satzVor = -1;
      for (const v of [50000, 200000, 500000, 1000000, 3000000, 8000000, 20000000]) {
        const s = E.vermSteuerTab(kt, v, verh);
        expect(s, `${kt} ${v}`).toBeGreaterThanOrEqual(vor);
        if (v <= 1000000) { expect(s / v, `${kt} ${v} Satz`).toBeGreaterThanOrEqual(satzVor - 1e-9); satzVor = s / v; }
        vor = s;
      }
      // über der letzten Stützstelle linear fortgeschrieben: nie über 1,5% des Vermögens
      expect(E.vermSteuerTab(kt, 20000000, verh) / 20000000).toBeLessThan(0.015);
    }
  });
  it('zwischen den Stützstellen wird linear interpoliert', () => {
    const i = T.stuetzstellen.indexOf(500000), j = T.stuetzstellen.indexOf(750000), zh = T.kantone.ZH.ledig;
    expect(E.vermSteuerTab('ZH', 625000, false)).toBeCloseTo((zh[i] + zh[j]) / 2, 6);
    expect(E.vermSteuerTab('ZH', 0, false)).toBe(0);
    expect(E.vermSteuerTab('XX', 500000, false)).toBe(zh[i]);
  });
  it('wird automatisch gesetzt: leeres Feld = Tarif des gewählten Kantons', () => {
    expect(sanitize({}).steuerVerm).toBe('');
    expect(migrate(clone(EXAMPLE)).steuerVerm).toBe('');
    const zh = jahr(rentner({ kanton: 'ZH', steuerVerm: '' })), sg = jahr(rentner({ kanton: 'SG', steuerVerm: '' })), ne = jahr(rentner({ kanton: 'NE', steuerVerm: '' }));
    // 1 Mio. zu Beginn, das Vermögen sinkt nur um die Steuer: knapp unter dem Tabellenwert für 1 Mio.
    for (const [r, kt] of [[zh, 'ZH'], [sg, 'SG'], [ne, 'NE']]) {
      const voll = E.vermSteuerTab(kt, 1000000, false);
      expect(r.stVerm).toBeGreaterThan(voll * 0.985);
      expect(r.stVerm).toBeLessThanOrEqual(voll);
    }
    expect(zh.stVerm).toBeLessThan(sg.stVerm);
    expect(sg.stVerm).toBeLessThan(ne.stVerm);
  });
  it('Zivilstand: Verheiratete nach dem Tarif für Verheiratete, unverheiratete Paare als zwei Ledige mit je der Hälfte', () => {
    const basis = { kanton: 'ZH', steuerVerm: '', liquiditaet: 1000000, wertschriften: 0 };
    expect(E.vermSteuerJahr({ ...basis, haushalt: 'single' }, 1000000)).toBeCloseTo(E.vermSteuerTab('ZH', 1000000, false), 6);
    expect(E.vermSteuerJahr({ ...basis, haushalt: 'verheiratet' }, 1000000)).toBeCloseTo(E.vermSteuerTab('ZH', 1000000, true), 6);
    expect(E.vermSteuerJahr({ ...basis, haushalt: 'konkubinat' }, 1000000)).toBeCloseTo(2 * E.vermSteuerTab('ZH', 500000, false), 6);
  });
  it('die Tarifstufen wachsen mit der Teuerung: gleiches Vermögen in heutiger Kaufkraft, gleiche Steuer in heutiger Kaufkraft', () => {
    const inp = { kanton: 'SG', haushalt: 'single', steuerVerm: '' };
    expect(E.vermSteuerJahr(inp, 800000 * 1.3, 1.3)).toBeCloseTo(1.3 * E.vermSteuerJahr(inp, 800000, 1), 6);
  });
  it('ein eigener Satz hat Vorrang und gilt für das ganze Reinvermögen; 0 schaltet die Steuer aus', () => {
    expect(jahr(rentner({ steuerVerm: 0 })).stVerm).toBe(0);
    const r = jahr(rentner({ kanton: 'ZH', steuerVerm: 3 }));
    expect(r.stVerm).toBeGreaterThan(0.003 * r.V);
    expect(r.stVerm).toBeLessThan(0.003 * r.Vstart);
    expect(r.Vstart - r.V).toBeCloseTo(r.stVerm, 6);
    // unabhängig vom Kanton
    expect(jahr(rentner({ kanton: 'NE', steuerVerm: 3 })).stVerm).toBeCloseTo(r.stVerm, 6);
  });
  it('Liegenschaften zählen zum Steuerwert (70% des Verkehrswerts) abzüglich Hypothek, das Reinvermögen nie unter null', () => {
    const lg = (vw, hyp) => [{ typ: 'eigen', verkehrswert: vw, hypothek: hyp, zins: 0, unterhalt: 0, nebenkosten: 0 }];
    expect(jahr(rentner({ liquiditaet: 0, steuerVerm: 3 })).stVerm).toBe(0);
    expect(jahr(rentner({ liquiditaet: 0, steuerVerm: 3, liegenschaften: lg(1000000, 200000) })).stVerm).toBeCloseTo(0.003 * (700000 - 200000), 6);
    expect(jahr(rentner({ liquiditaet: 300000, steuerVerm: 3, liegenschaften: lg(1000000, 800000) })).stVerm).toBeLessThan(0.003 * 200000);
    expect(jahr(rentner({ liquiditaet: 0, steuerVerm: 3, liegenschaften: lg(1000000, 900000) })).stVerm).toBe(0);
    // mit dem Tarif: 500'000 Reinvermögen aus der Liegenschaft, St. Gallen ledig
    expect(jahr(rentner({ liquiditaet: 0, steuerVerm: '', liegenschaften: lg(1000000, 200000) })).stVerm).toBeCloseTo(E.vermSteuerTab('SG', 500000, false), 6);
  });
  it('Säule 3a und Freizügigkeit sind vor dem Bezug steuerfrei', () => {
    const s = rentner({ liquiditaet: 0, steuerVerm: '' });
    s.personen[0] = { ...s.personen[0], jahrgang: 1975, pensAlter: 65, s3a: 300000, fz: 300000 };
    expect(jahr(s).stVerm).toBe(0);
  });
  it('die Anzeige im Formular nennt Betrag, Satz und Ort des heutigen Stands', () => {
    const h = E.vermSteuerHeute(rentner({ kanton: 'ZH', steuerVerm: '', liquiditaet: 400000, wertschriften: 600000 }));
    expect(h.rein).toBe(1000000);
    expect(h.steuer).toBeCloseTo(2002, 0);
    expect(h.promille).toBeCloseTo(2.0, 1);
    expect(h.ort).toBe('Zürich');
    expect(h.eigen).toBe(false);
    expect(E.vermSteuerHeute(rentner({ steuerVerm: 4 })).eigen).toBe(true);
  });
  it('das Feld hat einen Wertebereich; Ungültiges fällt auf «gemäss Kanton» zurück', () => {
    expect(LIMITS.steuerVerm).toEqual([0, 20]);
    expect(LIMITS.ertragSteuerbar).toEqual([0, 100]);
    expect(sanitize({ steuerVerm: '<b>' }).steuerVerm).toBe('');
    expect(sanitize({ steuerVerm: 0 }).steuerVerm).toBe(0);
    expect(sanitize({ steuerVerm: 4.5 }).steuerVerm).toBe(4.5);
    expect(sanitize({ ertragSteuerbar: 500 }).ertragSteuerbar).toBe(100);
  });
});

describe('Steuer auf Vermögenserträgen als Pauschale', () => {
  it('Steuersatz × steuerbarer Anteil × Ertrag', () => {
    const r = jahr(rentner({ kontoZins: 2, steuerEink: 20, ertragSteuerbar: 50 }));
    expect(r.ertrag).toBeGreaterThan(19000);
    expect(r.stErtrag).toBeCloseTo(0.2 * 0.5 * r.ertrag, 6);
    expect(jahr(rentner({ kontoZins: 2, steuerEink: 20, ertragSteuerbar: 0 })).stErtrag).toBe(0);
    expect(jahr(rentner({ kontoZins: 2, steuerEink: 0, ertragSteuerbar: 50 })).stErtrag).toBe(0);
  });
  it('beide Steuern verkürzen die Reichweite des Vermögens, nie umgekehrt', () => {
    const basis = { ausgabenRuhestand: 6000, liquiditaet: 0, wertschriften: 800000, steuerEink: 15 };
    const ende = (o) => { const r = E.simulate(inpOf(rentner({ ...basis, ...o }))); return r.depletedA ?? Infinity; };
    const ohne = ende({}), mit = ende({ steuerVerm: '', ertragSteuerbar: 50 });
    expect(ohne).toBeLessThan(Infinity);
    expect(mit).toBeLessThan(ohne);
  });
});

describe('Plausibilität vor der Übernahme neuer Werte', () => {
  const kopie = () => JSON.parse(JSON.stringify(T));
  it('erkennt Sprünge, sinkende Steuer, fehlende Kantone und unsinnige Sätze', () => {
    const i = T.stuetzstellen.indexOf(1000000);
    let n = kopie(); n.kantone.ZH.ledig[i] = Math.round(n.kantone.ZH.ledig[i] * 1.6);
    expect(plausibelVerm(n, T).join(' ')).toMatch(/ZH ledig 1000000.*±30%/);
    n = kopie(); n.kantone.BE.verheiratet[i] = n.kantone.BE.verheiratet[i - 2] - 1;
    expect(plausibelVerm(n, T).join(' ')).toMatch(/BE verheiratet 1000000: Steuer sinkt/);
    n = kopie(); delete n.kantone.TI;
    expect(plausibelVerm(n, T).join(' ')).toMatch(/25 statt 26 Kantone/);
    n = kopie(); n.kantone.GE.ledig = n.kantone.GE.ledig.map(() => 0);
    expect(plausibelVerm(n, T).length).toBeGreaterThan(0);
    n = kopie(); n.kantone.SG.verheiratet[i] = n.kantone.SG.ledig[i] * 2;
    expect(plausibelVerm(n, T).join(' ')).toMatch(/SG 1000000: verheiratet/);
    n = kopie(); n.kantone.VD.ledig[i] = 20000; n.kantone.VD.ledig[i + 1] = 100000; n.kantone.VD.ledig[i + 2] = 200000;
    expect(plausibelVerm(n, null).join(' ')).toMatch(/VD ledig 1000000: Satz/);
  });
  it('lässt übliche jährliche Änderungen durch', () => {
    const n = kopie();
    for (const k of Object.values(n.kantone)) { k.ledig = k.ledig.map((v) => Math.round(v * 1.04)); k.verheiratet = k.verheiratet.map((v) => Math.round(v * 1.04)); }
    expect(plausibelVerm(n, T)).toEqual([]);
  });
});
