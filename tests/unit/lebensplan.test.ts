import { describe, it, expect } from 'vitest';
import params from '../../public/data/params.json';
import { lebensplan } from '../../src/lib/lebensplan';
import { migrate } from '../../src/lib/schema';
import { analyse } from '../../src/lib/pension/analyse';
import { createEngine } from '../../src/lib/pension/engine';
import { resolveParams, nextParams } from '../../src/lib/pension/params';
import { EXAMPLE, clone, sanitize } from '../../src/lib/pension/state';
import type { ParamDatei } from '../../src/lib/pension/typen';

const H0 = () => sanitize(clone(EXAMPLE)); // P1 Jahrgang 1972, Liquidität 100'000, Wertschriften 300'000, 1 Wunsch
const session = (o: Record<string, unknown>) => migrate(o);

describe('Lebensplan: ein Stand über 06, 07a, 07b und 07c', () => {
  it('Gate Phase 5: ein Ziel, ein Kauf und eine Anlage stehen im selben Plan und in derselben Rechnung', () => {
    const d = session({
      ziele: [
        { id: 'z1', katId: 'wohnen', typ: 'ziel', name: 'Erstwohnung', jahr: 2030, betrag: 950000 },
        { id: 'z2', katId: 'familie', typ: 'ziel', name: 'Weltreise', jahr: 2032, betrag: 40000 },
      ],
      finanzierung_data: { inputs: { price: "950'000", cashEquity: "190'000", pensionWithdraw: '50000', currentRent: '2500' }, rates: { '10J': 1.8 } },
      anlage_betrag: 60000,
      anlage_konklusion: { finaleStrategie: 'Ausgewogen' },
    });
    const { S, eintraege } = lebensplan(d, H0(), 2026);
    // Ziel → einmalige Ausgabe im Alter 60 (2032 − 1972)
    expect(S.wuensche).toContainEqual(expect.objectContaining({ typ: 'einmal', name: 'Weltreise', betrag: 40000, alter: 60, aktiv: true }));
    // Kauf → Liegenschaft mit Kaufalter 58 (2030 − 1972), Hypothek = Preis − Barmittel − Vorbezug; das Wohnen-Ziel
    // wird nicht zusätzlich als Ausgabe gezählt
    expect(S.liegenschaften).toHaveLength(2);
    expect(S.liegenschaften[1]).toMatchObject({ name: 'Erstwohnung', typ: 'eigen', verkehrswert: 950000, hypothek: 710000, zins: 1.8, kaufAlter: 58, kaufFremd: 50000, kaufMieteWeg: 2500 });
    expect(S.wuensche.filter((w) => w.name === 'Erstwohnung')).toHaveLength(0);
    expect(S.wuensche).toHaveLength(2); // Musterfall-Wunsch + Weltreise
    // PK-Vorbezug kürzt die Pensionskasse von Person 1 im Verhältnis zum Altersguthaben (695'000)
    const f = 1 - 50000 / 695000;
    expect(S.personen[0].pkRente).toBeCloseTo(30153 * f, 6);
    expect(S.personen[0].pkKapital).toBeCloseTo(238000 * f, 6);
    expect(S.personen[0].pkGuthabenPlan).toBe(645000);
    // Anlage → von der Liquidität in die Wertschriften, Rendite aus 07b
    expect(S.liquiditaet).toBe(40000);
    expect(S.wertschriften).toBe(360000);
    expect(S.renditeOverride).toBe(2.75);
    // alle drei stehen in der Liste und rechnen mit
    const kurz = eintraege.map((e) => [e.quelle, e.art, e.rechnet]);
    expect(kurz).toContainEqual(['06', 'ziel', true]);
    expect(kurz).toContainEqual(['07a', 'kauf', true]);
    expect(kurz).toContainEqual(['07b', 'anlage', true]);
    expect(kurz.filter(([q]) => q === '07c')).toHaveLength(2);
    const k = eintraege.find((e) => e.art === 'kauf')!;
    expect(k.hinweis).toMatch(/davon PK-Vorbezug CHF 50.000, besteuert/);
    expect(k.hinweis).toMatch(/Miete von CHF 2.500 fällt weg/);
    expect(k.abfluss).toBe(190000);
    // chronologisch
    const jahre = eintraege.map((e) => e.jahr ?? 9999);
    expect(jahre).toEqual([...jahre].sort((a, b) => a - b));
  });

  it('die Ziele verändern die Rechnung: weniger Vermögen als ohne Plan', () => {
    const daten = params as unknown as ParamDatei;
    const A0 = 2026 * 12 + 10;
    const E = createEngine(resolveParams(daten, 2026), A0, nextParams(daten, 2026));
    const H = H0();
    const { S } = lebensplan(session({ ziele: [{ katId: 'familie', typ: 'ziel', name: 'Weltreise', jahr: 2032, betrag: 200000 }] }), H, 2026);
    const ohne = analyse(H, E, undefined, {}), mit = analyse(S, E, undefined, {});
    if (ohne.leer || mit.leer) throw new Error('leer');
    expect(mit.base.endV).toBeLessThan(ohne.base.endV);
    expect(mit.maxA).toBeLessThan(ohne.maxA);
  });

  it('nicht Rechenbares wird ausgewiesen statt weggelassen', () => {
    const d = session({
      ziele: [
        { katId: 'zufluss', typ: 'zufluss', name: 'Erbschaft', jahr: 2035, betrag: 300000 },
        { katId: 'familie', typ: 'ziel', name: 'Ohne Jahr', jahr: null, betrag: 5000 },
        { katId: 'familie', typ: 'ziel', name: 'Ohne Betrag', jahr: 2030, betrag: null },
        { katId: 'familie', typ: 'ziel', name: 'Vergangen', jahr: 2020, betrag: 1000 },
      ],
      wuensche: [{ katId: null, name: 'Segelboot', jahr: 2031, betrag: 80000 }],
    });
    const { S, eintraege } = lebensplan(d, H0(), 2026);
    const von = (n: string) => eintraege.find((e) => e.name === n)!;
    // Zufluss mit Jahr und Betrag rechnet mit (ADR-19)
    expect(von('Erbschaft')).toMatchObject({ art: 'zufluss', rechnet: true, abfluss: -300000 });
    expect(S.zufluesse).toEqual([{ name: 'Erbschaft', betrag: 300000, jahr: 2035 }]);
    expect(von('Ohne Jahr')).toMatchObject({ rechnet: false, alter: null });
    expect(von('Ohne Betrag')).toMatchObject({ rechnet: false, betrag: null });
    expect(von('Vergangen').rechnet).toBe(false);
    expect(von('Segelboot')).toMatchObject({ art: 'wunsch', rechnet: true, alter: 59 });
    expect(S.wuensche).toHaveLength(2); // Musterfall-Wunsch + Segelboot
  });

  it('Kauf ohne Kaufjahr oder ohne Eigenmittel rechnet nicht mit; Anlage ohne abgeschlossenes Profil entfällt', () => {
    const ohneJahr = lebensplan(session({ finanzierung_data: { inputs: { price: 800000, cashEquity: 160000 } }, anlage_betrag: 50000 }), H0(), 2026);
    expect(ohneJahr.eintraege.find((e) => e.art === 'kauf')).toMatchObject({ rechnet: false, jahr: null });
    expect(ohneJahr.eintraege.some((e) => e.art === 'anlage')).toBe(false);
    expect(ohneJahr.S.liquiditaet).toBe(100000);
    const ohneBar = lebensplan(session({ ziele: [{ katId: 'wohnen', typ: 'ziel', name: 'Haus', jahr: 2030, betrag: 800000 }], finanzierung_data: { inputs: { price: 800000 } } }), H0(), 2026);
    expect(ohneBar.eintraege.find((e) => e.art === 'kauf')).toMatchObject({ rechnet: false, jahr: 2030, name: 'Haus' });
    expect(ohneBar.S.liegenschaften).toHaveLength(1);
    // Kaufjahr erreicht: nicht mehr als künftiger Kauf rechnen
    const heuer = lebensplan(session({ ziele: [{ katId: 'wohnen', typ: 'ziel', name: 'Haus', jahr: 2026, betrag: 800000 }], finanzierung_data: { inputs: { price: 800000, cashEquity: 200000 } } }), H0(), 2026);
    expect(heuer.eintraege.find((e) => e.art === 'kauf')!.rechnet).toBe(false);
  });

  it('ohne Kauf in 07a zählt das Wohnen-Ziel als gewöhnliches Ziel', () => {
    const { S } = lebensplan(session({ ziele: [{ katId: 'wohnen', typ: 'ziel', name: 'Renovation', jahr: 2029, betrag: 120000 }] }), H0(), 2026);
    expect(S.wuensche).toContainEqual(expect.objectContaining({ name: 'Renovation', betrag: 120000, alter: 57 }));
  });

  it('eine in der Pensionierung erfasste Rendite bleibt; Anlage über der Liquidität wird begrenzt', () => {
    const H = sanitize({ ...clone(EXAMPLE), renditeOverride: 3.5 });
    const { S, eintraege } = lebensplan(session({ anlage_betrag: 250000, anlage_konklusion: { finaleStrategie: 'Wachstum' } }), H, 2026);
    expect(S.renditeOverride).toBe(3.5);
    expect(S.liquiditaet).toBe(0);
    expect(S.wertschriften).toBe(400000);
    expect(eintraege.find((e) => e.art === 'anlage')!.hinweis).toMatch(/übersteigt die erfasste Liquidität/);
  });

  it('leere Session: nur die Pensionierung steht im Plan, der Stand bleibt der Haushalt', () => {
    const H = H0();
    const { S, eintraege } = lebensplan(session({}), H, 2026);
    expect(eintraege.map((e) => e.art)).toEqual(['pension', 'pension']);
    expect(S).toEqual(H);
  });
});

describe('Lebensplan: Kauf und Zufluss in der Rechnung (ADR-19)', () => {
  const daten = params as unknown as ParamDatei;
  const A0 = 2026 * 12 + 10;
  const E = createEngine(resolveParams(daten, 2026), A0, nextParams(daten, 2026));
  it('ohne Altersguthaben kürzt der Vorbezug die Rente über den Umwandlungssatz', () => {
    const H = sanitize({ ...clone(EXAMPLE), personen: [{ ...clone(EXAMPLE).personen[0], pkGuthabenPlan: '' }, clone(EXAMPLE).personen[1]] });
    const { S } = lebensplan(session({ ziele: [{ katId: 'wohnen', typ: 'ziel', name: 'Haus', jahr: 2030, betrag: 900000 }], finanzierung_data: { inputs: { price: 900000, cashEquity: 100000, pensionWithdraw: 100000 } } }), H, 2026, 5.4);
    expect(S.personen[0].pkRente).toBeCloseTo(30153 - 5400, 6);
  });
  it('eine Erbschaft verbessert, ein Kauf verändert die Rechnung gegenüber dem Haushalt allein', () => {
    const H = H0();
    const erbe = lebensplan(session({ ziele: [{ katId: 'zufluss', typ: 'zufluss', name: 'Erbschaft', jahr: 2035, betrag: 500000 }] }), H, 2026).S;
    const kauf = lebensplan(session({ ziele: [{ katId: 'wohnen', typ: 'ziel', name: 'Ferienhaus', jahr: 2031, betrag: 600000 }], finanzierung_data: { inputs: { price: 600000, cashEquity: 200000 } } }), H, 2026).S;
    const a = analyse(H, E, undefined, {}), b = analyse(erbe, E, undefined, {}), c = analyse(kauf, E, undefined, {});
    if (a.leer || b.leer || c.leer) throw new Error('leer');
    expect(b.maxA).toBeGreaterThan(a.maxA);
    expect(c.maxA).toBeLessThan(a.maxA);
    // der Kauf steht im Ablauf der Rechnung
    expect(c.base.events.some((e) => /^Kauf Ferienhaus/.test(e.text))).toBe(true);
  });
});
