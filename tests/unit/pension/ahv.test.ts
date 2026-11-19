// @ts-nocheck — Referenztest, unverändert aus PensCheck (tests/ahv.test.js, Stand 4830eff) übernommen.
// AHV bei Ehepaaren: Plafonierung, Vorbezug, Aufschub, Einkommensteilung, Rentenzuschlag.
// Rechtsgrundlagen: Art. 29quinquies, 34bis, 35, 39, 40 AHVG; Art. 56 AHVV; Merkblatt 3.04 (Ziff. 24–26);
// BSV-Berechnungsvorschriften der AHV/IV-Renten (Kap. 3.3, 4 und 6). Die erwarteten Werte sind von Hand gerechnet.
import { describe, it, expect } from 'vitest';
import params from '../../../public/data/params.json';
import { createEngine } from '../../../src/lib/pension/engine';
import { resolveParams } from '../../../src/lib/pension/params';
import { analyse, horizon } from '../../../src/lib/pension/analyse';
import { EXAMPLE, clone, migrate } from '../../../src/lib/pension/state';

const A0 = 2026 * 12 + 10; // November 2026
const P = resolveParams(params, 2026);
const E = createEngine(P, A0);
const MAX = P.ahv.maxRente, PLAF = P.ahv.plafondEhepaar, N = P.ahv.beitragsjahre;
const inpOf = (s) => ({ ...s, ...horizon(s, E) });

/** Ehepaar, beide Jahrgang 1965 (Juni), Männer-Referenzalter für beide: gleiche Zeitpunkte, einfache Handrechnung. */
function paar(o = {}, o2 = o) {
  const s = migrate(clone(EXAMPLE));
  s.haushalt = 'verheiratet';
  s.inflation = 0;
  s.ahvAnpassung = 0;
  s.personen.forEach((p, i) => Object.assign(p, { jahrgang: 1965, geburtsmonat: 6, geschlecht: 'm', brutto: 200000, pensAlter: 65, ahvModus: 'schaetzung', ahvFehlJahre: 0, ahvBezug: 0 }, i ? o2 : o));
  return s;
}
const single = (o = {}) => { const s = paar(o); s.haushalt = 'single'; return s; };

describe('Plafonierung vor Kürzung und Zuschlag (F10)', () => {
  it('ohne Vorbezug: zwei Maximalrenten ergeben den Plafond', () => {
    const pl = E.ahvPlan(paar());
    expect(pl.summe).toBeCloseTo(PLAF, 6);
    expect(pl.plafoniert).toBe(true);
  });
  it('beide 2 Jahre Vorbezug: während des Vorbezugs Teilrente der Skala 42, plafoniert, dann gekürzt', () => {
    const pl = E.ahvPlan(paar({ ahvBezug: -2 }));
    const teil = ((PLAF * (N - 2)) / N) / 2; // je die Hälfte des Plafonds der Skala 42
    expect(pl.start[0]).toBeCloseTo(teil * (1 - 0.136), 4); // 1558.73
    expect(pl.start[0]).toBeCloseTo(1558.73, 1);
    // ab dem Referenzalter: plafonierte Vollrente minus 13,6% der durchschnittlich vorbezogenen (plafonierten) Rente
    expect(pl.dauer[0]).toBeCloseTo(PLAF / 2 - 0.136 * teil, 4);
    expect(pl.summe).toBeCloseTo(3289.29, 1);
    // der Vorbezug kostet etwas: deutlich weniger als der Plafond
    expect(pl.summe).toBeLessThan(PLAF - 400);
  });
  it('beide 5 Jahre Aufschub: Zuschlag von 31,5% auf der plafonierten Rente, über den Plafond hinaus', () => {
    const pl = E.ahvPlan(paar({ ahvBezug: 5 }));
    expect(pl.dauer[0]).toBeCloseTo((PLAF / 2) * 1.315, 4);
    expect(pl.summe).toBeCloseTo(4970.7, 1);
  });
  it('nur eine Person bezieht 2 Jahre vor: unplafonierte Teilrente im Vorbezug, Kürzungsbetrag bleibt daran bemessen', () => {
    const pl = E.ahvPlan(paar({ ahvBezug: -2 }, {}));
    const teil = (MAX * (N - 2)) / N; // 2405.45, die Partnerin hat noch keinen Anspruch
    expect(pl.start[0]).toBeCloseTo(teil * (1 - 0.136), 4); // 2078.31
    expect(pl.dauer[0]).toBeCloseTo(PLAF / 2 - 0.136 * teil, 4); // 1562.86
    expect(pl.dauer[1]).toBeCloseTo(PLAF / 2, 4);
  });
  it('in der Simulation kommt die Kürzung an: AHV mit Vorbezug liegt unter der AHV ohne', () => {
    const ahv = (s, y) => E.simulate(inpOf(s)).rows.find((r) => r.year === y).ahv;
    const ohne = ahv(paar(), 2033), mit = ahv(paar({ ahvBezug: -2 }), 2033), spaet = ahv(paar({ ahvBezug: 5 }), 2037);
    expect(ohne).toBeCloseTo(PLAF * 13, 0);
    expect(mit).toBeCloseTo(3289.29 * 13, -1);
    expect(spaet).toBeCloseTo(4970.7 * 13, -1);
  });
  it('unverheiratete Paare und Alleinstehende: kein Plafond, Kürzung auf der eigenen Rente', () => {
    const k = paar();
    k.haushalt = 'konkubinat';
    expect(E.ahvPlan(k).summe).toBeCloseTo(2 * MAX, 6);
    expect(E.ahvPlan(single({ ahvBezug: 1 })).summe).toBeCloseTo(MAX * 1.052, 4);
    // Alleinstehend mit 2 Jahren Vorbezug: 13,6% der Teilrente (Skala 42) werden lebenslang abgezogen
    expect(E.ahvPlan(single({ ahvBezug: -2 })).summe).toBeCloseTo(MAX - 0.136 * ((MAX * (N - 2)) / N), 4);
  });
});

describe('Plafond bei Teilrenten (F12) und Einkommensteilung (F15)', () => {
  it('beide mit 11 Fehljahren: Plafond der Rentenskala 33', () => {
    const pl = E.ahvPlan(paar({ ahvFehlJahre: 11 }));
    expect(pl.summe).toBeCloseTo((PLAF * 33) / 44, 4); // 2835
  });
  it('unterschiedliche Lücken: die höhere Skala zählt doppelt (Art. 53bis AHVV)', () => {
    // Skalen 33 und 44: ip = ent((2 × 44 + 33) / 3 + 0.9) = 41, Plafond 3780 × 41/44 = 3522.27
    expect(E.plafond(33 / 44, 1)).toBeCloseTo((PLAF * 41) / 44, 6);
    expect(E.ahvPlan(paar({ ahvFehlJahre: 11 }, { ahvFehlJahre: 0 })).summe).toBeCloseTo(3522.27, 1);
    // Skalen 39 und 24: ip = ent((78 + 24) / 3 + 0.9) = 34
    expect(E.ahvPlan(paar({ ahvFehlJahre: 5 }, { ahvFehlJahre: 20 })).summe).toBeCloseTo((PLAF * 34) / 44, 4);
    // gleiche Skalen: unverändert die Skala selbst
    expect(E.plafond(42 / 44, 42 / 44)).toBeCloseTo((PLAF * 42) / 44, 6);
    expect(E.plafond(1, 1)).toBe(PLAF);
  });
  it('Einkommensteilung: 40’000 und 0 ergeben zweimal die Rente für 20’000', () => {
    const pl = E.ahvPlan(paar({ brutto: 40000 }, { brutto: 0 }));
    const r = E.ahvFormel(20000);
    expect(r).toBeCloseTo(0.74 * P.ahv.minRente + (13 / 600) * 20000, 6);
    expect(pl.summe).toBeCloseTo(2 * r, 4); // 2731.47 statt 3059 ohne Teilung
    expect(pl.plafoniert).toBe(true);
  });
  it('solange erst eine Person rentenberechtigt ist, zählt ihr eigenes Einkommen', () => {
    // Person 2 ist fünf Jahre jünger: Person 1 erhält zuerst die Rente aus dem eigenen Lohn
    const s = paar({ brutto: 40000 }, { brutto: 0, jahrgang: 1970 });
    const pl = E.ahvPlan(s);
    expect(pl.start[0]).toBeCloseTo(E.ahvFormel(40000), 4);
    expect(pl.dauer[0]).toBeCloseTo(E.ahvFormel(20000), 4);
  });
  it('Teilung erst, wenn beide das Referenzalter erreicht haben: Die vorbezogene Rente beruht auf dem eigenen Einkommen', () => {
    // Mann 1965-06 mit 100’000 und 2 Jahren Vorbezug; Frau 1963-06 (Referenzalter April 2028) ohne Lohn.
    // Von Hand: Mann im Vorbezug 2520 × 42/44 × 0.864 = 2078.31, Frau 1260 + 120 Rentenzuschlag (160 × 0.75).
    const s = paar({ brutto: 100000, ahvBezug: -2 }, { brutto: 0, jahrgang: 1963, geschlecht: 'w' });
    const pl = E.ahvPlan(s);
    expect(pl.start[0]).toBeCloseTo(2078.31, 1);
    // ab seinem Referenzalter: geteilt (je 50’000 → 1890 nach Plafond? nein: 2 × f(50’000) = 3792.6 > 3780), minus 13,6% von 2405.45
    expect(pl.dauer[0]).toBeCloseTo(1562.86, 0);
    const jahr = (y) => E.simulate(inpOf(s)).rows.find((r) => r.year === y).ahv;
    expect(jahr(2029)).toBeCloseTo(44838, -1);
    expect(jahr(2031)).toBeCloseTo(46327, -1);
  });
  it('Merkblatt 3.04 Ziff. 24/25 sinngemäss: 1 Jahr Vorbezug, die Partnerin erreicht das Referenzalter während des Vorbezugs', () => {
    // Mann 1965-06, Frau 1964-10, beide Maximaleinkommen. Start 2520 × 43/44 × 0.932 = 2295.26.
    // Ab seinem Referenzalter: 1890 − 6,8% × (4 × 2462.73 + 8 × 1868.27) / 12 = 1749.48.
    const pl = E.ahvPlan(paar({ ahvBezug: -1 }, { jahrgang: 1964, geburtsmonat: 10, geschlecht: 'w' }));
    expect(pl.start[0]).toBeCloseTo(2295.26, 1);
    expect(pl.dauer[0]).toBeCloseTo(1749.48, 1);
    expect(pl.dauer[1]).toBeCloseTo(1890 + 50, 1); // mit Rentenzuschlag 50 (oberstes Band, Jahrgang 1964)
  });
  it('Merkblatt 3.04 Ziff. 26 sinngemäss: 3 Jahre Aufschub, der Partner erreicht das Referenzalter nach 2 Jahren', () => {
    // 1890 + 17,1% × (24 × 2520 + 12 × 1890) / 36 = 2285.01
    const pl = E.ahvPlan(paar({ ahvBezug: 3 }, { jahrgang: 1967 }));
    expect(pl.dauer[0]).toBeCloseTo(2285.01, 1);
    expect(pl.dauer[1]).toBeCloseTo(1890, 1);
  });
  it('eigener Betrag und Schätzung: geteilt wird mit dem Einkommen, das dem Betrag entspricht, nicht mit dem Lohnfeld', () => {
    // P1 trägt 1500 ein (entspricht rund 26’200 Einkommen), P2 wird aus 60’000 geschätzt
    const e1 = E.einkAusRente(1500);
    const erwartet = E.ahvFormel((e1 + 60000) / 2);
    for (const lohnfeld of [0, 26200, 100000]) {
      const pl = E.ahvPlan(paar({ ahvModus: 'betrag', ahvBetrag: 1500, brutto: lohnfeld }, { brutto: 60000 }));
      expect(pl.dauer[0], String(lohnfeld)).toBeCloseTo(1500, 4);
      expect(pl.dauer[1], String(lohnfeld)).toBeCloseTo(erwartet, 4);
    }
  });
  it('geplante Pensionierung vor dem frühesten Pensionsalter der Pensionskasse: Freizügigkeit statt Rente und Kapital', () => {
    const s = single({ jahrgang: 1975, pensAlter: 56, brutto: 100000 });
    Object.assign(s.personen[0], { minAlter: 60, pkRente: 30000, pkKapital: 100000, pkGuthabenPlan: '', fz: 0, s3a: 0 });
    const r = E.simulate(inpOf(s));
    expect(r.events.some((e) => /PK-Rente beginnt/.test(e.text))).toBe(false);
    expect(r.kapListe.some((k) => k.art === 'PK-Kapital')).toBe(false);
    expect(r.events.some((e) => /wird zu Freizügigkeit/.test(e.text))).toBe(true);
    expect(r.kapListe.some((k) => k.art === 'Freizügigkeit' && k.betrag > 500000)).toBe(true);
    expect(r.rows.every((x) => x.pk === 0)).toBe(true);
    const o = analyse(s, E).opt.find((x) => x.t === 'Eingaben prüfen');
    expect(o.x).toMatch(/Statt Rente und Kapital der Pensionskasse wird das Guthaben als Freizügigkeit gerechnet/);
  });
  it('ein eigener Betrag aus der Rentenvorausberechnung wird nicht geteilt, aber plafoniert', () => {
    const pl = E.ahvPlan(paar({ ahvModus: 'betrag', ahvBetrag: 2400 }));
    expect(pl.summe).toBeCloseTo(PLAF, 4);
  });
});

describe('Rentenzuschlag der Übergangsgeneration (Art. 34bis AHVG)', () => {
  const frau = (jahrgang, brutto, o = {}) => single({ geschlecht: 'w', jahrgang, brutto, ...o });
  it('Grundzuschlag nach Einkommen, Faktor nach Jahrgang, aufgerundet', () => {
    expect(E.ahvPlan(frau(1965, 50000)).zuschlag[0]).toBe(160);
    expect(E.ahvPlan(frau(1965, 70000)).zuschlag[0]).toBe(100);
    expect(E.ahvPlan(frau(1965, 90000)).zuschlag[0]).toBe(50);
    expect(E.ahvPlan(frau(1966, 70000)).zuschlag[0]).toBe(81);
    expect(E.ahvPlan(frau(1968, 50000)).zuschlag[0]).toBe(71); // 160 × 0.44 = 70.4, aufgerundet
    expect(E.ahvPlan(frau(1969, 90000)).zuschlag[0]).toBe(13); // 50 × 0.25 = 12.5, aufgerundet
  });
  it('gekürzt mit der Rentenskala, kein Zuschlag bei Vorbezug, ausserhalb der Jahrgänge und für Männer', () => {
    expect(E.ahvPlan(frau(1965, 50000, { ahvFehlJahre: 11 })).zuschlag[0]).toBe(120); // 160 × 33/44
    expect(E.ahvPlan(frau(1965, 50000, { ahvBezug: -1 })).zuschlag[0]).toBe(0);
    expect(E.ahvPlan(frau(1970, 50000)).zuschlag[0]).toBe(0);
    expect(E.ahvPlan(single({ jahrgang: 1965, brutto: 50000 })).zuschlag[0]).toBe(0);
  });
  it('die Einstufung gilt ab dem Referenzalter und ändert sich später nicht mehr (Art. 53quater AHVV)', () => {
    // Frau 1965 mit 50’000 erreicht das Referenzalter vor dem Mann (1968, 150’000): 160 bleiben, auch nach der Teilung
    expect(E.ahvPlan(paar({ geschlecht: 'w', brutto: 50000 }, { jahrgang: 1968, brutto: 150000 })).zuschlag[0]).toBe(160);
    // umgekehrt: 100’000 und Partner ohne Lohn: 50 bleiben, obwohl das geteilte Einkommen tiefer wäre
    expect(E.ahvPlan(paar({ geschlecht: 'w', brutto: 100000 }, { jahrgang: 1968, brutto: 0 })).zuschlag[0]).toBe(50);
    // hat der Mann das Referenzalter schon erreicht, zählt das geteilte Einkommen
    expect(E.ahvPlan(paar({ geschlecht: 'w', brutto: 50000 }, { jahrgang: 1962, brutto: 150000 })).zuschlag[0]).toBe(50);
  });
  it('eigener Betrag: das Band ergibt sich aus der Rente, nicht aus dem Lohnfeld', () => {
    expect(E.ahvPlan(frau(1964, 0, { ahvModus: 'betrag', ahvBetrag: MAX })).zuschlag[0]).toBe(50);
    expect(E.ahvPlan(frau(1964, 0, { ahvModus: 'betrag', ahvBetrag: 1500 })).zuschlag[0]).toBe(160);
    expect(E.einkAusRente(E.ahvFormel(50000))).toBeCloseTo(50000, 4);
    expect(E.einkAusRente(E.ahvFormel(80000))).toBeCloseTo(80000, 4);
  });
  it('nicht plafoniert und nicht in der 13. Rente', () => {
    const s = paar({}, { geschlecht: 'w', jahrgang: 1965 });
    const pl = E.ahvPlan(s);
    expect(pl.summe).toBeCloseTo(PLAF + 50, 4); // geteiltes Einkommen 200’000: oberstes Band
    const jahr = E.simulate(inpOf(s)).rows.find((r) => r.year === 2033).ahv;
    expect(jahr).toBeCloseTo(PLAF * 13 + 50 * 12, 0);
  });
  it('die Daten stimmen mit dem Gesetz überein', () => {
    const Z = P.ahv.uebergang.zuschlag;
    expect(Z.betraege).toEqual([160, 100, 50]);
    expect(Z.faktor).toEqual({ 1961: 0.25, 1962: 0.5, 1963: 0.75, 1964: 1, 1965: 1, 1966: 0.81, 1967: 0.63, 1968: 0.44, 1969: 0.25 });
  });
});

describe('Bereits pensioniert: fällige Guthaben (F11)', () => {
  const s = () => {
    const x = single({ jahrgang: 1963, geburtsmonat: 1, pensAlter: 62, brutto: 0, ahvModus: 'betrag', ahvBetrag: 2000 });
    Object.assign(x.personen[0], { s3a: 100000, fz: 50000, pkKapital: 300000, pkRente: 20000 });
    return x;
  };
  it('Säule 3a und Freizügigkeit werden im ersten Monat ausbezahlt, nicht vergessen', () => {
    const r = E.simulate(inpOf(s()));
    const arten = r.kapListe.map((k) => k.art);
    expect(arten).toContain('Säule 3a');
    expect(arten).toContain('Freizügigkeit');
    expect(r.kapListe.every((k) => k.A === A0)).toBe(true);
    expect(r.rows[r.rows.length - 1].s3a).toBe(0);
  });
  it('ein PK-Kapital aus der Vergangenheit wird nicht eingerechnet, aber gemeldet', () => {
    const r = E.simulate(inpOf(s()));
    expect(r.kapListe.some((k) => k.art === 'PK-Kapital')).toBe(false);
    expect(r.pkKapVorbei).toEqual([true]);
    expect(r.events.some((e) => /PK-Kapital nicht eingerechnet/.test(e.text))).toBe(true);
    const R = analyse(s(), E);
    expect(R.opt.some((o) => /Bereits bezogenes PK-Kapital/.test(o.t))).toBe(true);
  });
  it('wer heute pensioniert wird, erhält das PK-Kapital', () => {
    const x = single({ jahrgang: 1961, geburtsmonat: 10, pensAlter: 65 }); // Monat nach dem 65. Geburtstag = November 2026
    x.personen[0].pkKapital = 300000;
    const r = E.simulate(inpOf(x));
    expect(r.kapListe.some((k) => k.art === 'PK-Kapital' && k.A === A0)).toBe(true);
    expect(r.pkKapVorbei).toEqual([false]);
  });
});

describe('Beiträge als Nichterwerbstätige und Nebenerwerb (F13)', () => {
  const s = (neben) => {
    const x = single({ jahrgang: 1966, geburtsmonat: 6, pensAlter: 60, brutto: 0 });
    Object.assign(x, { liquiditaet: 3000000, wertschriften: 0, liegenschaften: [], amortisationen: [], wuensche: [] });
    x.einkommen = neben ? [{ person: 0, art: 'nebenerwerb', betrag: neben, bisJahr: 0, text: '' }] : [];
    return x;
  };
  const ne2027 = (x) => E.simulate(inpOf(x)).rows.find((r) => r.year === 2027).ne;
  it('ein kleiner Nebenerwerb befreit nicht; die Lohnbeiträge werden angerechnet', () => {
    const ohne = ne2027(s(0)), klein = ne2027(s(1000));
    expect(ohne).toBeGreaterThan(5000);
    expect(klein).toBeGreaterThan(0);
    expect(klein).toBeCloseTo(ohne - 1000 * P.ahv.lohnbeitrag, 0);
  });
  it('ab der Hälfte des Beitrags und dem Mindestbeitrag ist die Person befreit', () => {
    const ohne = ne2027(s(0));
    // Abstand zur Schwelle, weil der Beitrag mit dem Vermögen in Stufen steigt
    const schwelle = ohne / 2 / P.ahv.lohnbeitrag;
    expect(ne2027(s(Math.round(schwelle + 5000)))).toBe(0);
    expect(ne2027(s(Math.round(schwelle - 5000)))).toBeGreaterThan(0);
  });
  it('der Lohnbeitrag ist ein geprüfter gesetzlicher Wert', () => {
    expect(P.ahv.lohnbeitrag).toBe(0.106);
    expect(params.params['ahv.lohnbeitrag'].kind).toBe('gesetz');
  });
});

describe('Weitere Korrekturen im Rechenkern', () => {
  it('Kapitalbezugssteuer: Tarifstufen wachsen mit der Teuerung (B6)', () => {
    const s = single({ jahrgang: 1975, pensAlter: 65, brutto: 0 });
    Object.assign(s.personen[0], { s3a: 0, fz: 500000, fzAnlage: 'konto', pkKapital: 0 });
    Object.assign(s, { inflation: 2, zins3aKonto: 2, kanton: 'ZH', liegenschaften: [], amortisationen: [] });
    const k = E.simulate(inpOf(s)).kapListe.find((x) => x.art === 'Freizügigkeit');
    expect(k.I).toBeGreaterThan(1.2);
    // in heutiger Kaufkraft dieselbe Steuer wie auf demselben realen Betrag heute
    expect(k.steuer / k.I).toBeCloseTo(E.kapSteuer('ZH', k.betrag / k.I, false), 2);
    expect(k.steuer).toBeLessThan(E.kapSteuer('ZH', k.betrag, false));
  });
  it('kurzer Horizont bricht die Rechnung nicht ab (B7)', () => {
    const s = single({ jahrgang: 1950, pensAlter: 65, brutto: 0 });
    Object.assign(s, { horizontModus: 'eigen', horizontEigen: 75 });
    expect(horizon(s, E).horizontP[0]).toBeGreaterThanOrEqual(77);
    expect(() => analyse(s, E)).not.toThrow();
    // auch der Rechenkern selbst hält einen Horizont in der Vergangenheit aus
    expect(() => E.simulate({ ...s, horizont: 70, horizontP: [70] })).not.toThrow();
    const alt = single({ jahrgang: 1926, pensAlter: 65, brutto: 0 });
    alt.horizontModus = '95';
    expect(() => analyse(alt, E)).not.toThrow();
  });
  it('Tragbarkeit rechnet die AHV mit 13 Renten (B9)', () => {
    const s = single({ jahrgang: 1965, pensAlter: 65 });
    const r = E.simulate(inpOf(s));
    expect(r.snapAhv.ahv12).toBeCloseTo(MAX * 13, 0);
  });
  it('früherer Ausstieg bei Mischbezug: der Umwandlungssatz gilt für den Rententeil', () => {
    const p = { ...migrate(clone(EXAMPLE)).personen[0], jahrgang: 1970, geburtsmonat: 6, pensAlter: 64, pkRente: 30000, pkKapital: 200000, pkGuthabenPlan: 700000, pkGuthabenHeute: '', minAlter: 58 };
    const plan = E.pkBeiAlter(p, 64), frueh = E.pkBeiAlter(p, 63);
    expect(plan.rente).toBe(30000);
    expect(plan.kapital).toBe(200000);
    const uws = 30000 / 500000 - P.annahmen.uwsProJahr / 100;
    expect(frueh.rente).toBeCloseTo((frueh.G - frueh.kapital) * uws, 6);
    // vor dem frühesten Pensionsalter geht das ganze Guthaben (einmal) auf Freizügigkeit
    const fz = E.pkBeiAlter(p, 57);
    expect(fz.fz).toBeCloseTo(fz.G, 6);
    expect(fz.rente).toBe(0);
  });
  it('tragbare Ausgaben sind nicht bei 50’000 gedeckelt', () => {
    const s = single({ jahrgang: 1961, geburtsmonat: 10, pensAlter: 65, brutto: 0 });
    Object.assign(s, { liquiditaet: 0, wertschriften: 500000000, liegenschaften: [], amortisationen: [], wuensche: [], einkommen: [] });
    expect(E.maxAusgaben(inpOf(s))).toBeGreaterThan(200000);
  });
  it('«Ausgaben sinken» steht beim 75. Geburtstag der jüngeren Person', () => {
    const s = paar({ jahrgang: 1960 }, { jahrgang: 1970 });
    const ev = E.simulate(inpOf(s)).events.find((e) => /Ausgaben sinken/.test(e.text));
    expect(Math.floor(ev.A / 12)).toBe(2045);
  });
  it('Sperrfrist: Ansatzpunkt und Aktionsplan nennen denselben Monat', () => {
    const R = analyse(migrate(clone(EXAMPLE)), E);
    const o = R.opt.find((x) => /Einkauf in die Pensionskasse prüfen/.test(x.t) && /bis Ende/.test(x.x));
    const a = R.akt.find((x) => /Letzter möglicher PK-Einkauf/.test(x.titel));
    expect(o && a).toBeTruthy();
    const monat = o.x.match(/bis Ende (\S+) (\d{4}) einkaufen/);
    expect(monat).toBeTruthy();
    expect(a.A != null ? E.fmtA(a.A) : JSON.stringify(a)).toContain(monat[2]);
  });
});

describe('Pensionierung vor dem frühesten Pensionsalter: Hinweise passen zur Rechnung', () => {
  it('liegt die Pensionierung zurück, bleibt die Rente und es erscheint kein Hinweis auf Freizügigkeit', () => {
    const s = single({ jahrgang: 1966, pensAlter: 57, brutto: 0, ahvModus: 'betrag', ahvBetrag: 2000 });
    Object.assign(s.personen[0], { minAlter: 58, pkRente: 30000, pkKapital: 0, fz: 0, s3a: 0 });
    const R = analyse(s, E);
    expect(R.base.rows.find((r) => r.year === 2027).pk).toBeCloseTo(30000, 0);
    expect(R.opt.some((o) => o.t === 'Eingaben prüfen')).toBe(false);
  });
  it('Pensionierung in der Vergangenheit mit Rente und Kapital: kein Folgetext spricht von einem künftigen Kapitalbezug', () => {
    const s = migrate(clone(EXAMPLE));
    Object.assign(s.personen[0], { jahrgang: 1966, geburtsmonat: 1, pensAlter: 57, pkRente: 40000, pkKapital: 200000 });
    const R = analyse(s, E);
    expect(R.base.pkKapVorbei[0]).toBe(true);
    expect(R.base.ps[0].pk.kapital).toBe(0);
    expect(R.opt.some((o) => /Bereits bezogenes PK-Kapital/.test(o.t))).toBe(true);
    expect(R.akt.some((x) => x.person === 0 && /PK-Kapitalbezug anmelden|Letzter möglicher PK-Einkauf/.test(x.titel))).toBe(false);
    expect(R.opt.some((o) => /^Person 1: Sperrfrist für PK-Einkäufe/.test(o.t))).toBe(false);
  });
  it('reiner Kapitalbezug oder nur ein erfasstes Guthaben: Freizügigkeit und Hinweis', () => {
    for (const felder of [{ pkRente: 0, pkKapital: 300000, pkGuthabenPlan: '' }, { pkRente: 0, pkKapital: 0, pkGuthabenPlan: 400000 }]) {
      const s = single({ jahrgang: 1975, pensAlter: 56, brutto: 100000 });
      Object.assign(s.personen[0], { minAlter: 60, fz: 0, s3a: 0, ...felder });
      const R = analyse(s, E);
      expect(R.base.kapListe.some((k) => k.art === 'PK-Kapital')).toBe(false);
      expect(R.base.kapListe.some((k) => k.art === 'Freizügigkeit' && k.betrag >= 300000)).toBe(true);
      expect(R.opt.find((o) => o.t === 'Eingaben prüfen')?.x).toMatch(/als Freizügigkeit gerechnet/);
      // kein Folgetext spricht von einem geplanten Kapitalbezug aus der Pensionskasse
      expect(R.opt.some((o) => /für den geplanten Kapitalbezug|Mehr Rente statt Kapital/.test(`${o.t} ${o.x}`))).toBe(false);
    }
  });
  it('Beiträge als Nichterwerbstätige: Tabellenstufen wachsen in ganzen Jahren mit der Teuerung', () => {
    const s = single({ jahrgang: 1970, pensAlter: 58, brutto: 0 });
    Object.assign(s, { inflation: 2, liquiditaet: 1000000, wertschriften: 0, liegenschaften: [], amortisationen: [], wuensche: [], einkommen: [], ausgabenRuhestand: 1 });
    Object.assign(s.personen[0], { pkRente: 0, pkKapital: 0, fz: 0, s3a: 0 });
    // innerhalb eines Kalenderjahrs gilt eine Tabelle: kein Wechsel der Stufe von Monat zu Monat allein durch die Teuerung
    expect(E.neBeitrag(1000000)).toBe(E.neBeitrag(1000000 / 1.0));
    const r = E.simulate(inpOf(s));
    expect(r.rows.find((x) => x.year === 2030).ne).toBeGreaterThan(1500);
  });
});

describe('Beiträge als Nichterwerbstätige bei Ehepaaren (Art. 3 Abs. 3 AHVG, Art. 28bis AHVV; Merkblatt 2.03)', () => {
  /** Merkblatt 2.03, Beispiel 19: Ehemann 63 mit Kleinpensum, Ehefrau 61 nichterwerbstätig, Vermögen 500’000, Renten 75’000. */
  const bsp19 = (lohn) => {
    const s = paar({ jahrgang: 1963, pensAlter: 60, brutto: 0 }, { jahrgang: 1965, pensAlter: 60, brutto: 0, geschlecht: 'w' });
    Object.assign(s.personen[0], { pkRente: 75000, pkKapital: 0, fz: 0, s3a: 0 });
    Object.assign(s.personen[1], { pkRente: 0, pkKapital: 0, fz: 0, s3a: 0 });
    Object.assign(s, { liquiditaet: 500000, wertschriften: 0, kontoZins: 0, ausgabenRuhestand: 3000, liegenschaften: [], amortisationen: [], wuensche: [] });
    s.einkommen = lohn ? [{ person: 0, art: 'nebenerwerb', betrag: lohn, bisJahr: 0, text: '' }] : [];
    return E.simulate(inpOf(s)).rows[0].ne; // November und Dezember 2026
  };
  it('Beispiel 19: 8’000 Lohn genügen nicht, beide zahlen wie Nichterwerbstätige (848 werden angerechnet)', () => {
    // je 2’014 pro Jahr auf der Basis 1 Mio.; der Ehemann zahlt 2’014 − 848, die Ehefrau 2’014: zusammen 3’180 pro Jahr
    expect(E.neBeitrag(1000000)).toBe(2014);
    expect(bsp19(8000)).toBeCloseTo((3180 * 2) / 12, 0);
  });
  it('ohne Erwerb zahlen beide voll; mit 12’000 Lohn gilt der Ehemann als erwerbstätig und zahlt den doppelten Mindestbeitrag: beide befreit', () => {
    expect(bsp19(0)).toBeCloseTo((4028 * 2) / 12, 0);
    // 12’000 × 10,6% = 1’272: mehr als die Hälfte von 2’014 und mehr als 2 × 530
    expect(bsp19(12000)).toBe(0);
    // 9’700 × 10,6% = 1’028: Vergleichsrechnung bestanden, aber unter dem doppelten Mindestbeitrag: die Ehefrau zahlt
    expect(bsp19(9700)).toBeCloseTo((2014 * 2) / 12, 0);
  });
  it('eine laufende AHV-Rente zählt zum Renteneinkommen (Renten und Pensionen aller Art)', () => {
    const fall = (bezug) => {
      const s = single({ jahrgang: 1963, geburtsmonat: 6, pensAlter: 60, brutto: 0, ahvModus: 'betrag', ahvBetrag: 2400, ahvBezug: bezug });
      Object.assign(s.personen[0], { pkRente: 0, pkKapital: 0, fz: 0, s3a: 0 });
      Object.assign(s, { liquiditaet: 600000, wertschriften: 0, kontoZins: 0, ausgabenRuhestand: 1000, liegenschaften: [], amortisationen: [], wuensche: [], einkommen: [] });
      return E.simulate(inpOf(s)).rows[0].ne;
    };
    // mit Vorbezug (Rente läuft seit Juli 2026) ist die Basis um das 20-Fache der Jahresrente höher
    expect(fall(-2)).toBeGreaterThan(fall(0) + 100);
  });
});

describe('Beiträge als Nichterwerbstätige: Teilpensum unter 50% und Freibetrag im Rentenalter', () => {
  it('eigene Teilpensionierung mit 20%: Vergleichsrechnung nicht bestanden, Beitrag abzüglich der Lohnbeiträge', () => {
    const s = single({ jahrgang: 1964, geburtsmonat: 6, pensAlter: 65, brutto: 40000, teilAb: 62, teilPensum: 20, teilPK: 'weiter' });
    Object.assign(s.personen[0], { pkRente: 0, pkKapital: 0, fz: 0, s3a: 0 });
    Object.assign(s, { liquiditaet: 2000000, wertschriften: 0, kontoZins: 0, ausgabenRuhestand: 1000, liegenschaften: [], amortisationen: [], wuensche: [], einkommen: [] });
    const ne = E.simulate(inpOf(s)).rows[0].ne; // November und Dezember 2026
    // Basis rund 2 Mio.: Beitrag 4’399 pro Jahr, Lohnbeiträge 8’000 × 10,6% = 848: geschuldet rund 3’551 pro Jahr
    expect(ne).toBeGreaterThan((3400 * 2) / 12);
    expect(ne).toBeLessThan((3700 * 2) / 12);
    // mit 60% Pensum gilt die Person als erwerbstätig
    s.personen[0].teilPensum = 60;
    expect(E.simulate(inpOf(s)).rows[0].ne).toBe(0);
  });
  it('Ehegatte im Rentenalter mit 12’000 Nebenerwerb: unter dem Freibetrag fallen keine Beiträge an, die Ehefrau zahlt', () => {
    expect(P.ahv.freibetragRentner).toBe(16800);
    const fall = (lohn) => {
      const s = paar({ jahrgang: 1959, pensAlter: 64, brutto: 0, ahvModus: 'betrag', ahvBetrag: 2000 }, { jahrgang: 1965, pensAlter: 60, brutto: 0, geschlecht: 'w' });
      s.personen.forEach((p) => Object.assign(p, { pkRente: 0, pkKapital: 0, fz: 0, s3a: 0 }));
      Object.assign(s, { liquiditaet: 800000, wertschriften: 0, kontoZins: 0, ausgabenRuhestand: 2000, liegenschaften: [], amortisationen: [], wuensche: [] });
      s.einkommen = [{ person: 0, art: 'nebenerwerb', betrag: lohn, bisJahr: 0, text: '' }];
      return E.simulate(inpOf(s)).rows[0].ne;
    };
    expect(fall(12000)).toBeGreaterThan(100);
    // 30’000 Lohn: Beiträge auf 13’200, also 1’399: über dem doppelten Mindestbeitrag, die Ehefrau ist befreit
    expect(fall(30000)).toBe(0);
  });
});
