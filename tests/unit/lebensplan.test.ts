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
      finanzierung_data: { inputs: { price: "950'000", cashEquity: "190'000", pensionWithdraw: '50000' } },
      anlage_betrag: 60000,
      anlage_konklusion: { finaleStrategie: 'Ausgewogen' },
    });
    const { S, eintraege } = lebensplan(d, H0(), 2026);
    // Ziel → einmalige Ausgabe im Alter 60 (2032 − 1972)
    expect(S.wuensche).toContainEqual(expect.objectContaining({ typ: 'einmal', name: 'Weltreise', betrag: 40000, alter: 60, aktiv: true }));
    // Kauf → Barmittel im Kaufjahr (Alter 58); das Wohnen-Ziel wird nicht doppelt gezählt
    expect(S.wuensche).toContainEqual(expect.objectContaining({ typ: 'einmal', name: 'Eigenmittel Eigenheim', betrag: 190000, alter: 58 }));
    expect(S.wuensche.filter((w) => w.name === 'Erstwohnung')).toHaveLength(0);
    expect(S.wuensche).toHaveLength(3); // Musterfall-Wunsch + 2
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
    expect(eintraege.find((e) => e.art === 'kauf')!.hinweis).toMatch(/PK-Vorbezug von CHF 50.000 ist nicht eingerechnet/);
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
    expect(von('Erbschaft')).toMatchObject({ art: 'zufluss', rechnet: false });
    expect(von('Erbschaft').hinweis).toMatch(/Zuflüsse/);
    expect(von('Ohne Jahr')).toMatchObject({ rechnet: false, alter: null });
    expect(von('Ohne Betrag')).toMatchObject({ rechnet: false, betrag: null });
    expect(von('Vergangen').rechnet).toBe(false);
    expect(von('Segelboot')).toMatchObject({ art: 'wunsch', rechnet: true, alter: 59 });
    expect(S.wuensche).toHaveLength(2); // Musterfall-Wunsch + Segelboot
  });

  it('Kauf ohne Kaufjahr oder ohne Barmittel rechnet nicht mit; Anlage ohne abgeschlossenes Profil entfällt', () => {
    const ohneJahr = lebensplan(session({ finanzierung_data: { inputs: { price: 800000, cashEquity: 160000 } }, anlage_betrag: 50000 }), H0(), 2026);
    expect(ohneJahr.eintraege.find((e) => e.art === 'kauf')).toMatchObject({ rechnet: false, jahr: null });
    expect(ohneJahr.eintraege.some((e) => e.art === 'anlage')).toBe(false);
    expect(ohneJahr.S.liquiditaet).toBe(100000);
    const ohneBar = lebensplan(session({ ziele: [{ katId: 'wohnen', typ: 'ziel', name: 'Haus', jahr: 2030, betrag: 800000 }], finanzierung_data: { inputs: { price: 800000 } } }), H0(), 2026);
    expect(ohneBar.eintraege.find((e) => e.art === 'kauf')).toMatchObject({ rechnet: false, jahr: 2030, name: 'Haus' });
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
