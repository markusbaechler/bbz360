// @ts-nocheck — Referenztest, unverändert aus PensCheck (tests/engine.test.js, Stand 4830eff) übernommen.
import { describe, it, expect } from 'vitest';
import params from '../../../public/data/params.json';
import { createEngine } from '../../../src/lib/pension/engine';
import { resolveParams } from '../../../src/lib/pension/params';
import { analyse, horizon } from '../../../src/lib/pension/analyse';
import { EXAMPLE, clone, migrate, encodeCode, decodeCode, emptyState } from '../../../src/lib/pension/state';

const A0 = 2026 * 12 + 10; // November 2026
const P = resolveParams(params, 2026);
const E = createEngine(P, A0);
const S = () => migrate(clone(EXAMPLE));

describe('AHV', () => {
  it('Rentenformel Art. 34 AHVG trifft Minimal-, Knick- und Maximalwert', () => {
    expect(E.ahvFormel(P.ahv.einkMin)).toBeCloseTo(P.ahv.minRente, 6);
    expect(E.ahvFormel(P.ahv.einkMax)).toBeCloseTo(P.ahv.maxRente, 6);
    expect(E.ahvFormel(5000)).toBe(P.ahv.minRente);
    expect(E.ahvFormel(500000)).toBe(P.ahv.maxRente);
    // stetig am Knick (36 × Minimalrente)
    const k = 36 * P.ahv.minRente;
    expect(E.ahvFormel(k - 0.01)).toBeCloseTo(E.ahvFormel(k + 0.01), 1);
    // monoton steigend
    let prev = 0;
    for (let e = 10000; e <= 100000; e += 1000) {
      const r = E.ahvFormel(e);
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
    }
  });
  it('Beitragslücken kürzen um je 1/44', () => {
    const p = { brutto: 200000, ahvFehlJahre: 4 };
    expect(E.ahvMonat(p)).toBeCloseTo((P.ahv.maxRente * 40) / 44, 6);
    expect(E.ahvMonat({ ahvModus: 'betrag', ahvBetrag: 2100 })).toBe(2100);
  });
  it('Vorbezug und Aufschub', () => {
    expect(E.ahvFaktor(-2)).toBeCloseTo(1 - 0.136, 6);
    expect(E.ahvFaktor(-1)).toBeCloseTo(1 - 0.068, 6);
    expect(E.ahvFaktor(0)).toBe(1);
    expect(E.ahvFaktor(5)).toBeCloseTo(1.315, 6);
  });
  it('Referenzalter Frauen der Übergangsgeneration', () => {
    expect(E.refAlter({ geschlecht: 'w', jahrgang: 1960 })).toBe(64);
    expect(E.refAlter({ geschlecht: 'w', jahrgang: 1961 })).toBe(64.25);
    expect(E.refAlter({ geschlecht: 'w', jahrgang: 1963 })).toBe(64.75);
    expect(E.refAlter({ geschlecht: 'w', jahrgang: 1970 })).toBe(65);
    expect(E.refAlter({ geschlecht: 'm', jahrgang: 1961 })).toBe(65);
  });
});

describe('Kapitalbezugssteuer (ESTV-Statistik)', () => {
  const T = P.kapSteuer;
  it('enthält alle 26 Kantonshauptorte, ledig und verheiratet', () => {
    expect(Object.keys(T.kantone)).toHaveLength(26);
    for (const k of Object.values(T.kantone)) {
      expect(k.ledig).toHaveLength(T.stuetzstellen.length);
      expect(k.verheiratet).toHaveLength(T.stuetzstellen.length);
    }
  });
  it('trifft die Stützstellen und ist monoton', () => {
    const i = T.stuetzstellen.indexOf(100000), zh = T.kantone.ZH;
    expect(E.kapSteuer('ZH', 100000, false)).toBeCloseTo(zh.ledig[i], 6);
    expect(E.kapSteuer('ZH', 100000, true)).toBeCloseTo(zh.verheiratet[i], 6);
    for (const k of Object.keys(T.kantone)) {
      for (const v of [false, true]) {
        let prev = 0;
        for (let b = 0; b <= 2000000; b += 25000) {
          const t = E.kapSteuer(k, b, v);
          expect(t).toBeGreaterThanOrEqual(prev);
          prev = t;
        }
      }
    }
  });
  it('Steuersatz liegt in einem plausiblen Bereich (1–12 % bei 500\'000)', () => {
    for (const k of Object.keys(T.kantone)) {
      const s = E.kapSteuer(k, 500000, false) / 500000;
      expect(s).toBeGreaterThan(0.01);
      expect(s).toBeLessThan(0.12);
    }
  });
});

describe('AHV-Beiträge Nichterwerbstätige (Beitragstabelle)', () => {
  it('2026: Stufen gemäss Merkblatt 2.03', () => {
    expect(E.neBeitrag(0)).toBe(530);
    expect(E.neBeitrag(349999)).toBe(530);
    expect(E.neBeitrag(350000)).toBe(636);
    expect(E.neBeitrag(399999)).toBe(636);
    expect(E.neBeitrag(400000)).toBe(742);
    expect(E.neBeitrag(1750000)).toBe(3604);
    expect(E.neBeitrag(1800000)).toBe(3763);
    expect(E.neBeitrag(8950000)).toBe(26500);
    expect(E.neBeitrag(20000000)).toBe(26500);
  });
  it('2027: neue Grenzwerte', () => {
    const E27 = createEngine(resolveParams(params, 2027), 2027 * 12);
    expect(E27.neBeitrag(359999)).toBe(541);
    expect(E27.neBeitrag(360000)).toBeCloseTo(657.2, 6);
    expect(E27.neBeitrag(1760000)).toBeCloseTo(3625.2, 6);
    expect(E27.neBeitrag(9160000)).toBe(27050);
    expect(E27.P.ahv.maxRente).toBe(2560);
    expect(E27.P.s3a.maxMitPK).toBe(7373);
  });
});

describe('AHV 21: Übergangsgeneration', () => {
  const frau = (jahrgang, brutto) => ({ geschlecht: 'w', jahrgang, brutto });
  it('reduzierte Kürzungssätze je nach Einkommen, bis 3 Jahre Vorbezug', () => {
    expect(E.uebergang(frau(1963, 50000))).toBe(true);
    expect(E.uebergang(frau(1970, 50000))).toBe(false);
    // 3 Jahre nur, wenn der Vorbezug nicht vor 62 beginnt: Jahrgänge 1961 bis 1963 (Referenzalter unter 65) höchstens 2
    expect(E.maxVorbezug(frau(1963, 50000))).toBe(2);
    expect(E.maxVorbezug(frau(1961, 50000))).toBe(2);
    expect(E.maxVorbezug(frau(1964, 50000))).toBe(3);
    expect(E.maxVorbezug(frau(1969, 50000))).toBe(3);
    expect(E.ahvFaktor(-1, frau(1963, 50000))).toBe(1);
    expect(E.ahvFaktor(-3, frau(1965, 50000))).toBeCloseTo(0.97, 6);
    expect(E.ahvFaktor(-2, frau(1963, 70000))).toBeCloseTo(0.955, 6);
    expect(E.ahvFaktor(-3, frau(1965, 120000))).toBeCloseTo(0.895, 6);
    // ordentliche Sätze für alle anderen
    expect(E.ahvFaktor(-2, frau(1970, 120000))).toBeCloseTo(0.864, 6);
    expect(E.ahvFaktor(-2, { geschlecht: 'm', jahrgang: 1963, brutto: 50000 })).toBeCloseTo(0.864, 6);
  });
});

describe('Simulation Musterfall', () => {
  const s = S();
  const hz = horizon(s, E);
  const inp = { ...s, ...hz };
  it('liefert Jahreszeilen bis zum Horizont', () => {
    const res = E.simulate(inp);
    expect(res.rows[0].year).toBe(2026);
    // P2 (Frau, Juni 1970): Rechnung bis Ende des Lebensjahres am Horizont (LE + 5)
    const p2 = s.personen[1];
    const endA = p2.jahrgang * 12 + (p2.geburtsmonat - 1) + hz.horizontP[1] * 12 + 11;
    expect(res.rows.length).toBe(res.rows[res.rows.length - 1].year - 2026 + 1);
    expect(res.rows[res.rows.length - 1].year).toBe(Math.floor(endA / 12));
    expect(res.events.length).toBeGreaterThan(5);
    expect(res.kapListe.some((e) => e.art === 'PK-Kapital')).toBe(true);
  });
  it('Vermögensbilanz ist plausibel (keine NaN)', () => {
    const res = E.simulate(inp);
    for (const r of res.rows) for (const k of ['V', 'ahv', 'pk', 'ausgaben', 'steuern', 'ne']) expect(Number.isFinite(r[k])).toBe(true);
  });
  it('Ampel und tragbare Ausgaben sind konsistent', () => {
    const amp = E.ampel(inp);
    expect(['gruen', 'gelb', 'rot']).toContain(amp.st);
    const maxA = E.maxAusgaben(inp);
    expect(maxA).toBeGreaterThan(0);
    expect(E.reicht(E.simulate(inp, { ausgaben: maxA * 0.98 }))).toBe(true);
    expect(E.reicht(E.simulate(inp, { ausgaben: maxA * 1.05 }))).toBe(false);
  });
  it('mehr Ausgaben verschlechtern das Endvermögen', () => {
    const a = E.simulate(inp, { ausgaben: 8000 }), b = E.simulate(inp, { ausgaben: 12000 });
    expect(a.endV).toBeGreaterThan(b.endV);
  });
  it('Gesamtauswertung läuft durch', () => {
    const R = analyse(s, E);
    expect(R.leer).toBe(false);
    expect(R.so.now).toBeTruthy();
    expect(Array.isArray(R.opt)).toBe(true);
    expect(R.fixRows.length).toBeGreaterThan(0);
    expect(() => structuredClone(R)).not.toThrow();
  });
  it('leerer Stand liefert «leer»', () => {
    expect(analyse(emptyState(), E).leer).toBe(true);
  });
});

describe('Eingaben-Code', () => {
  it('Kodieren und Dekodieren ergibt denselben Stand', () => {
    const s = S();
    s.bericht.kunde = 'Müller – Test ’25';
    const back = decodeCode(encodeCode(s));
    expect(back.personen[0].brutto).toBe(s.personen[0].brutto);
    expect(back.bericht.kunde).toBe('Müller – Test ’25');
  });
});

describe('Parameter', () => {
  it('Vorjahreswerte gelten weiter, wenn für ein Jahr nichts erfasst ist', () => {
    const P30 = resolveParams(params, 2030);
    expect(P30.ahv.maxRente).toBeGreaterThan(0);
    expect(P30.meta.veraltet).toBe(true);
  });
});

describe('Was wäre, wenn: früher aufhören', () => {
  // Paar mit Altersunterschied: Person 1 Jahrgang 1968, Person 2 Jahrgang 1974
  const paar = () => {
    const s = S();
    Object.assign(s.personen[0], { jahrgang: 1968, pensAlter: 65 });
    Object.assign(s.personen[1], { jahrgang: 1974, pensAlter: 65 });
    return { ...s, ...horizon(s, E) };
  };
  it('nur die gewählte Person hört früher auf, die andere arbeitet wie geplant', () => {
    const inp = paar(), stop = 2029 * 12 + 4;
    const nur1 = E.simulate(inp, { stopA: stop, stopWer: 0 });
    expect(nur1.ps[0].Aret).toBe(stop);
    expect(nur1.ps[1].Aret).toBe(E.abAlter(inp.personen[1], 65));
    const beide = E.simulate(inp, { stopA: stop });
    expect(beide.ps[1].Aret).toBe(stop);
  });
  it('sofort heisst Ende des laufenden Monats, nicht im Vormonat', () => {
    const so = E.sofort(paar(), undefined, undefined, 0);
    expect(so.now.base.ps[0].Aret).toBe(A0 + 1);
    expect(so.ab == null || so.ab >= A0 + 1).toBe(true);
  });
  it('frühester grüner Zeitpunkt liegt im Bereich der gewählten Person und ist grün', () => {
    const inp = paar();
    const so = E.sofort(inp, undefined, undefined, 0);
    expect(so.plan).toBe(E.abAlter(inp.personen[0], 65));
    if (so.ab != null) {
      expect(so.ab).toBeLessThanOrEqual(so.plan);
      expect(E.ampel(inp, { stopA: so.ab, stopWer: 0 }).st).toBe('gruen');
      if (so.ab > A0 + 1) expect(E.ampel(inp, { stopA: so.ab - 1, stopWer: 0 }).st).not.toBe('gruen');
    }
    const alle = E.sofort(inp, undefined, undefined, null);
    expect(alle.plan).toBe(E.abAlter(inp.personen[1], 65));
  });
  it('Auswertung rechnet mit der Wer-Auswahl und merkt sich den frühesten Zeitpunkt pro Auswahl', () => {
    const s = S(), cache = {};
    const r0 = analyse(s, E, undefined, cache);
    expect(r0.so.wer).toBe(0);
    expect(r0.stopA).toBe(A0 + 1);
    s.ui.stopWer = 'alle';
    const r1 = analyse(s, E, undefined, cache);
    expect(r1.so.wer).toBe(null);
  });
});
