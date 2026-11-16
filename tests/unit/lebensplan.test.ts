import { describe, it, expect } from 'vitest';
import params from '../../public/data/params.json';
import { kaufZiel, lebensplan } from '../../src/lib/lebensplan';
import { migrate } from '../../src/lib/schema';
import { analyse } from '../../src/lib/pension/analyse';
import { createEngine } from '../../src/lib/pension/engine';
import { resolveParams, nextParams } from '../../src/lib/pension/params';
import { EXAMPLE, clone, sanitize } from '../../src/lib/pension/state';
import type { ParamDatei, PensState } from '../../src/lib/pension/typen';

const H0 = (o: Record<string, unknown> = {}): PensState => sanitize({ ...clone(EXAMPLE), ...o }); // P1 Jahrgang 1972 (Juni), Pension 58
const session = (o: Record<string, unknown>) => migrate(o);
const daten = params as unknown as ParamDatei;
const A0 = 2026 * 12 + 10;
const E = createEngine(resolveParams(daten, 2026), A0, nextParams(daten, 2026));
const rechne = (S: PensState) => { const r = analyse(S, E, undefined, {}); if (r.leer) throw new Error('leer'); return r; };

describe('Lebensplan: ein Stand über 06, 07a, 07b und Haushalt', () => {
  it('Gate Phase 5: ein Ziel, ein Kauf und eine Anlage stehen im selben Plan und in derselben Rechnung', () => {
    const d = session({
      ziele: [
        { id: 'z1', katId: 'wohnen', typ: 'ziel', name: 'Erstwohnung', jahr: 2029, betrag: 950000 },
        { id: 'z2', katId: 'familie', typ: 'ziel', name: 'Weltreise', jahr: 2032, betrag: 40000 },
      ],
      finanzierung_data: { inputs: { price: "950'000", cashEquity: "190'000", pensionWithdraw: '50000', currentRent: '2500' }, rates: { '10J': 1.8 } },
      anlage_betrag: 60000,
      anlage_konklusion: { finaleStrategie: 'Ausgewogen' },
    });
    const { S, eintraege } = lebensplan(d, H0(), 2026);
    // Ziel → einmalige Ausgabe mit Kalenderjahr
    expect(S.wuensche).toContainEqual(expect.objectContaining({ typ: 'einmal', name: 'Weltreise', betrag: 40000, jahr: 2032, aktiv: true }));
    // Kauf → Liegenschaft mit Kaufjahr, Hypothek = Preis − Barmittel − Vorbezug; das Ziel des Kaufs ist keine Ausgabe
    expect(S.liegenschaften).toHaveLength(2);
    expect(S.liegenschaften[1]).toMatchObject({ name: 'Erstwohnung', typ: 'eigen', verkehrswert: 950000, hypothek: 710000, zins: 1.8, kaufJahr: 2029, kaufFremd: 50000, kaufMieteWeg: 2500 });
    expect(S.wuensche.filter((w) => w.name === 'Erstwohnung')).toHaveLength(0);
    expect(S.wuensche).toHaveLength(2); // Musterfall-Wunsch + Weltreise
    // PK-Vorbezug kürzt Rente und Kapital von Person 1 im Verhältnis zum Altersguthaben (695'000)
    const f = 1 - 50000 / 695000;
    expect(S.personen[0].pkRente).toBeCloseTo(30153 * f, 6);
    expect(S.personen[0].pkKapital).toBeCloseTo(238000 * f, 6);
    expect(S.personen[0].pkGuthabenPlan).toBe(645000);
    // Anlage → von der Liquidität in die Wertschriften, Rendite aus 07b
    expect(S.liquiditaet).toBe(40000);
    expect(S.wertschriften).toBe(360000);
    expect(S.renditeOverride).toBe(2.75);
    const kurz = eintraege.map((e) => [e.quelle, e.art, e.rechnet]);
    expect(kurz).toContainEqual(['06', 'ziel', true]);
    expect(kurz).toContainEqual(['07a', 'kauf', true]);
    expect(kurz).toContainEqual(['07b', 'anlage', true]);
    expect(kurz.filter(([q]) => q === '07c')).toHaveLength(2);
    const k = eintraege.find((e) => e.art === 'kauf')!;
    expect(k.hinweis).toMatch(/Davon PK-Vorbezug CHF 50.000: besteuert/);
    expect(k.hinweis).toMatch(/Miete von CHF 2.500 fällt weg/);
    expect(k.abfluss).toBe(190000);
    const jahre = eintraege.map((e) => e.jahr ?? 9999);
    expect(jahre).toEqual([...jahre].sort((a, b) => a - b));
  });

  it('leere Session: nur die Pensionierung steht im Plan, der Stand bleibt der Haushalt', () => {
    const H = H0();
    const { S, eintraege } = lebensplan(session({}), H, 2026);
    expect(eintraege.map((e) => e.art)).toEqual(['pension', 'pension']);
    expect(S).toEqual(H);
  });
});

describe('A8/B4/B5: Zeitpunkt der Ziele', () => {
  it('ein Ziel im laufenden Jahr wird wirklich abgezogen (vorher: «rechnet mit», aber ohne Wirkung)', () => {
    const H = H0();
    const { S, eintraege } = lebensplan(session({ ziele: [{ id: 'z', katId: 'mobil', typ: 'ziel', name: 'Auto', jahr: 2026, betrag: 200000 }] }), H, 2026);
    expect(eintraege.find((e) => e.name === 'Auto')).toMatchObject({ rechnet: true, abfluss: 200000 });
    const ohne = rechne(H), mit = rechne(S);
    expect(ohne.base.endV - mit.base.endV).toBeGreaterThan(200000);
  });
  it('Geburtsmonat Dezember: die Ausgabe fällt im genannten Jahr an, nicht im Folgejahr', () => {
    const H = H0({ personen: [{ ...clone(EXAMPLE).personen[0], geburtsmonat: 12 }, clone(EXAMPLE).personen[1]] });
    const { S } = lebensplan(session({ ziele: [{ id: 'z', katId: 'mobil', typ: 'ziel', name: 'Auto', jahr: 2030, betrag: 80000 }] }), H, 2026);
    const r = rechne(S);
    expect(r.base.rows.find((x) => x.year === 2030)!.wAus).toBeGreaterThan(80000);
    expect(r.base.events.find((e) => e.text === 'Wunsch: Auto')!.A).toBe(2030 * 12);
  });
  it('Einträge nach dem Planungshorizont, ohne Jahr, ohne Betrag oder in der Vergangenheit sind vorgemerkt', () => {
    const d = session({
      ziele: [
        { id: 'a', katId: 'familie', typ: 'ziel', name: 'Zu spät', jahr: 2070, betrag: 5000 },
        { id: 'b', katId: 'zufluss', typ: 'zufluss', name: 'Erbe zu spät', jahr: 2070, betrag: 5000 },
        { id: 'c', katId: 'familie', typ: 'ziel', name: 'Ohne Jahr', jahr: null, betrag: 5000 },
        { id: 'e', katId: 'familie', typ: 'ziel', name: 'Ohne Betrag', jahr: 2030, betrag: null },
        { id: 'f', katId: 'familie', typ: 'ziel', name: 'Vergangen', jahr: 2020, betrag: 1000 },
      ],
      wuensche: [{ id: 'w', katId: null, name: 'Segelboot', jahr: 2031, betrag: 80000 }],
    });
    const { S, eintraege } = lebensplan(d, H0(), 2026, { bisJahr: 2063 });
    const von = (n: string) => eintraege.find((e) => e.name === n)!;
    expect(von('Zu spät')).toMatchObject({ rechnet: false, abfluss: 0 });
    expect(von('Zu spät').hinweis).toMatch(/nach dem Planungshorizont \(2063\)/);
    expect(von('Erbe zu spät').rechnet).toBe(false);
    expect(von('Ohne Jahr')).toMatchObject({ rechnet: false, alter: null });
    expect(von('Ohne Betrag')).toMatchObject({ rechnet: false, betrag: null });
    expect(von('Vergangen').rechnet).toBe(false);
    expect(von('Segelboot')).toMatchObject({ art: 'wunsch', rechnet: true, alter: 59 });
    expect(S.wuensche).toHaveLength(2); // Musterfall-Wunsch + Segelboot
    expect('zufluesse' in S).toBe(false);
  });
  it('ein Zufluss mit Jahr und Betrag rechnet mit; der Hinweis nennt eine unsichere Eintrittswahrscheinlichkeit', () => {
    const { S, eintraege } = lebensplan(session({ ziele: [{ id: 'z', katId: 'zufluss', typ: 'zufluss', insp: 'Erbschaft / Legat', name: 'Erbschaft', jahr: 2035, betrag: 300000, prob: 'moeglich' }] }), H0(), 2026);
    expect(S.zufluesse).toEqual([{ name: 'Erbschaft', betrag: 300000, jahr: 2035 }]);
    const e = eintraege.find((x) => x.name === 'Erbschaft')!;
    expect(e).toMatchObject({ rechnet: true, abfluss: -300000 });
    expect(e.hinweis).toMatch(/Eintritt laut Ziel: möglich; gerechnet ist der volle Betrag/);
  });
});

describe('A9: der Kauf gehört zu genau einem Ziel', () => {
  const fin = { inputs: { price: 900000, cashEquity: 200000 } };
  const ziele = [
    { id: 'r', katId: 'wohnen', typ: 'ziel', name: 'Renovation', jahr: 2028, betrag: null },
    { id: 'e', katId: 'wohnen', typ: 'ziel', name: 'Erstwohnung', jahr: 2032, betrag: 900000 },
  ];
  it('ohne Wahl gilt dieselbe Regel wie beim Kaufpreis in 07a: das erste Wohnen-Ziel MIT Betrag', () => {
    const d = session({ ziele, finanzierung_data: fin });
    expect(kaufZiel(d)?.id).toBe('e');
    const { S, eintraege } = lebensplan(d, H0(), 2026);
    const kauf = eintraege.find((x) => x.art === 'kauf')!;
    expect(kauf).toMatchObject({ name: 'Erstwohnung', jahr: 2032, rechnet: true, abfluss: 200000 });
    // die Erstwohnung ist keine zusätzliche Ausgabe von 900'000 (vorher: Kauf «Renovation» 2028 plus Ausgabe 900'000)
    expect(S.wuensche.some((w) => w.name === 'Erstwohnung')).toBe(false);
    expect(eintraege.filter((x) => x.rechnet).reduce((x, y) => x + Math.max(0, y.abfluss), 0)).toBe(200000);
    expect(eintraege.find((x) => x.name === 'Renovation')).toMatchObject({ art: 'ziel', rechnet: false });
  });
  it('das in 07a gewählte Ziel gilt; weitere Wohnen-Ziele zählen als gewöhnliche Ziele', () => {
    const d = session({ ziele: [{ ...ziele[0], betrag: 120000 }, ziele[1]], finanzierung_data: { ...fin, zielId: 'e' } });
    const { S, eintraege } = lebensplan(d, H0(), 2026);
    expect(eintraege.find((x) => x.art === 'kauf')).toMatchObject({ name: 'Erstwohnung', jahr: 2032 });
    expect(S.wuensche).toContainEqual(expect.objectContaining({ name: 'Renovation', betrag: 120000, jahr: 2028 }));
  });
  it('ausdrücklich keinem Ziel zugeordnet: der Kauf ist vorgemerkt, die Ziele zählen normal', () => {
    const d = session({ ziele, finanzierung_data: { ...fin, zielId: '-' } });
    expect(kaufZiel(d)).toBeNull();
    const { S, eintraege } = lebensplan(d, H0(), 2026);
    expect(eintraege.find((x) => x.art === 'kauf')).toMatchObject({ rechnet: false, jahr: null });
    expect(S.liegenschaften).toHaveLength(1);
    expect(S.wuensche).toContainEqual(expect.objectContaining({ name: 'Erstwohnung', betrag: 900000 }));
  });
  it('Kauf ohne Eigenmittel oder mit erreichtem Kaufjahr rechnet nicht mit', () => {
    const ohneBar = lebensplan(session({ ziele: [{ id: 'h', katId: 'wohnen', typ: 'ziel', name: 'Haus', jahr: 2030, betrag: 800000 }], finanzierung_data: { inputs: { price: 800000 } } }), H0(), 2026);
    expect(ohneBar.eintraege.find((e) => e.art === 'kauf')).toMatchObject({ rechnet: false, jahr: 2030, name: 'Haus' });
    expect(ohneBar.S.liegenschaften).toHaveLength(1);
    const heuer = lebensplan(session({ ziele: [{ id: 'h', katId: 'wohnen', typ: 'ziel', name: 'Haus', jahr: 2026, betrag: 800000 }], finanzierung_data: { inputs: { price: 800000, cashEquity: 200000 } } }), H0(), 2026);
    expect(heuer.eintraege.find((e) => e.art === 'kauf')!.rechnet).toBe(false);
  });
  it('Vorschläge aus 06, die der Kern schon rechnet, werden nicht doppelt gezählt', () => {
    const d = session({ ziele: [
      { id: '1', katId: 'zufluss', typ: 'zufluss', insp: 'Kapitalleistung BVG', name: 'PK-Kapital', jahr: 2030, betrag: 238000 },
      { id: '2', katId: 'zufluss', typ: 'zufluss', insp: 'Auszahlung Säule 3a / 3b', name: '3a', jahr: 2030, betrag: 49000 },
      { id: '3', katId: 'zufluss', typ: 'zufluss', insp: 'Verkauf (Liegenschaft, Firma, Depot)', name: 'Hausverkauf', jahr: 2040, betrag: 700000 },
      { id: '4', katId: 'wohnen', typ: 'ziel', insp: 'Liegenschaft verkaufen', name: 'Haus verkaufen', jahr: 2040, betrag: 700000 },
    ] });
    const { S, eintraege } = lebensplan(d, H0(), 2026);
    expect(eintraege.filter((e) => e.quelle === '06').every((e) => !e.rechnet)).toBe(true);
    expect(eintraege.find((e) => e.name === 'PK-Kapital')!.hinweis).toMatch(/rechnet die Pensionierung bereits/);
    expect('zufluesse' in S).toBe(false);
    expect(S.wuensche).toHaveLength(1);
  });
});

describe('A10: PK-Vorbezug kürzt die Pensionskasse vollständig und nie über das Guthaben hinaus', () => {
  const kaufSession = (vorbezug: number, bar = 100000, jahr = 2029) => session({
    ziele: [{ id: 'h', katId: 'wohnen', typ: 'ziel', name: 'Haus', jahr, betrag: 900000 }],
    finanzierung_data: { inputs: { price: 900000, cashEquity: bar, pensionWithdraw: vorbezug } },
  });
  const p1 = (o: Record<string, unknown>) => H0({ personen: [{ ...clone(EXAMPLE).personen[0], ...o }, clone(EXAMPLE).personen[1]] });
  it('Kapitalbezüger ohne erfasstes Altersguthaben: auch das Kapital sinkt (vorher: Vorbezug geschenkt)', () => {
    const H = p1({ pkRente: 0, pkKapital: 600000, pkGuthabenPlan: '' });
    const { S } = lebensplan(kaufSession(200000), H, 2026, { uws65: 5.4 });
    expect(S.personen[0].pkKapital).toBeCloseTo(400000, 6);
    expect(S.liegenschaften[1].kaufFremd).toBe(200000);
    // Vorbezug statt Barmittel ist kein Geschenk mehr. Es bleibt ein kleiner echter Vorteil: Das Kapital wird in
    // zwei Jahren statt in einem besteuert (Progression). Vorher lag der Unterschied bei rund CHF 460 pro Monat.
    const bar = lebensplan(kaufSession(0, 300000), H, 2026, { uws65: 5.4 }).S;
    const unterschied = rechne(S).maxA - rechne(bar).maxA;
    expect(unterschied).toBeGreaterThan(-100);
    expect(unterschied).toBeLessThan(100);
  });
  it('Rente und Kapital ohne Altersguthaben: beide sinken im selben Verhältnis (Guthaben = Rente / Umwandlungssatz + Kapital)', () => {
    const H = p1({ pkRente: 5400, pkKapital: 100000, pkGuthabenPlan: '' }); // 5'400 / 5.4% = 100'000 → Guthaben 200'000
    const { S } = lebensplan(kaufSession(50000), H, 2026, { uws65: 5.4 });
    expect(S.personen[0].pkRente).toBeCloseTo(5400 * 0.75, 6);
    expect(S.personen[0].pkKapital).toBeCloseTo(75000, 6);
  });
  it('ein Vorbezug über dem Guthaben wird begrenzt; der Rest kommt aus dem freien Vermögen', () => {
    const H = p1({ pkRente: 0, pkKapital: 200000, pkGuthabenPlan: 200000 });
    const { S, eintraege } = lebensplan(kaufSession(300000), H, 2026);
    expect(S.liegenschaften[1].kaufFremd).toBe(200000);
    expect(S.personen[0].pkKapital).toBe(0);
    const k = eintraege.find((e) => e.art === 'kauf')!;
    expect(k.abfluss).toBe(200000); // 100'000 bar + 100'000 ungedeckter Vorbezug
    expect(k.hinweis).toMatch(/nur CHF 200.000 durch das Guthaben gedeckt/);
  });
  it('nach der Pensionierung von Person 1 ist kein Vorbezug mehr möglich', () => {
    const H = H0(); // Pension mit 58 → 2030
    const { S, eintraege } = lebensplan(kaufSession(50000, 100000, 2035), H, 2026);
    expect(S.liegenschaften[1].kaufFremd).toBeUndefined();
    expect(S.personen[0].pkRente).toBe(H.personen[0].pkRente);
    const k = eintraege.find((e) => e.art === 'kauf')!;
    expect(k.abfluss).toBe(150000);
    expect(k.hinweis).toMatch(/nach der Pensionierung nicht mehr möglich/);
  });
});

describe('Kauf und Zufluss in der Rechnung (ADR-19)', () => {
  it('eine Erbschaft verbessert, ein Kauf verändert die Rechnung gegenüber dem Haushalt allein', () => {
    const H = H0();
    const erbe = lebensplan(session({ ziele: [{ id: 'z', katId: 'zufluss', typ: 'zufluss', name: 'Erbschaft', jahr: 2035, betrag: 500000 }] }), H, 2026).S;
    const kauf = lebensplan(session({ ziele: [{ id: 'f', katId: 'wohnen', typ: 'ziel', name: 'Ferienhaus', jahr: 2031, betrag: 600000 }], finanzierung_data: { inputs: { price: 600000, cashEquity: 200000 } } }), H, 2026).S;
    const a = rechne(H), b = rechne(erbe), c = rechne(kauf);
    expect(b.maxA).toBeGreaterThan(a.maxA);
    expect(c.maxA).toBeLessThan(a.maxA);
    expect(c.base.events.find((e) => /^Kauf Ferienhaus/.test(e.text))!.A).toBe(2031 * 12);
  });
  it('eine in der Pensionierung erfasste Rendite bleibt; Anlage über der Liquidität wird begrenzt; ohne Konklusion keine Anlage', () => {
    const H = H0({ renditeOverride: 3.5 });
    const { S, eintraege } = lebensplan(session({ anlage_betrag: 250000, anlage_konklusion: { finaleStrategie: 'Wachstum' } }), H, 2026);
    expect(S.renditeOverride).toBe(3.5);
    expect(S.liquiditaet).toBe(0);
    expect(S.wertschriften).toBe(400000);
    expect(eintraege.find((e) => e.art === 'anlage')!.hinweis).toMatch(/übersteigt die erfasste Liquidität/);
    expect(lebensplan(session({ anlage_betrag: 50000 }), H0(), 2026).eintraege.some((e) => e.art === 'anlage')).toBe(false);
  });
});
