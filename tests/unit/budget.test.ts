import { describe, it, expect } from 'vitest';
import params from '../../public/data/params.json';
import { budgetKennzahlen, musterUebernehmen } from '../../src/lib/budget';
import { applyBudget } from '../../src/lib/pension/analyse';
import { createEngine } from '../../src/lib/pension/engine';
import { resolveParams, nextParams } from '../../src/lib/pension/params';
import { EXAMPLE, clone, emptyState, migrate } from '../../src/lib/pension/state';
import type { ParamDatei } from '../../src/lib/pension/typen';

const A0 = 2026 * 12 + 10;
const daten = params as unknown as ParamDatei;
const E = createEngine(resolveParams(daten, 2026), A0, nextParams(daten, 2026));

describe('Budget & Liquidität (05b)', () => {
  it('Musterbudget füllt alle Positionen ausser Wohnen; die Summe stimmt mit den Positionen überein', () => {
    const S = migrate(clone(EXAMPLE));
    expect(budgetKennzahlen(S, E).voll).toBe(false);
    musterUebernehmen(S, E, 'mittel');
    const k = budgetKennzahlen(S, E);
    expect(k.voll).toBe(true);
    expect(k.positionen).toHaveLength(8);
    expect(k.summe).toBe(Math.round(k.positionen.reduce((x, p) => x + p.wert, 0)));
    expect(S.budgetBasis).toBe('mittel');
    // Musterfall hat ein Eigenheim: Wohnen folgt der Liegenschaft
    expect(k.positionen[0]).toMatchObject({ key: 'wohnen', fest: true, erfasst: true });
  });
  it('aktives Budget bestimmt die Ausgaben im Ruhestand', () => {
    const S = migrate(clone(EXAMPLE));
    musterUebernehmen(S, E, 'gehoben');
    S.budgetAktiv = true;
    applyBudget(S, E);
    expect(S.ausgabenRuhestand).toBe(budgetKennzahlen(S, E).summe);
  });
  it('Miete: Wohnen ist erfassbar und geht in die Summe ein', () => {
    const S = emptyState();
    musterUebernehmen(S, E, 'bescheiden');
    const ohne = budgetKennzahlen(S, E);
    expect(ohne.positionen[0]).toMatchObject({ fest: false, erfasst: false });
    S.fix.wohnen = 2100;
    const mit = budgetKennzahlen(S, E);
    expect(mit.positionen[0]).toMatchObject({ wert: 2100, erfasst: true });
    expect(mit.summe - ohne.summe).toBe(2100 - ohne.positionen[0].wert);
  });
  it('Sparquote, Reserve und Verhältnis: aus Netto (Cockpit), Ausgaben heute und Liquidität', () => {
    const S = migrate(clone(EXAMPLE)); // Liquidität 100'000, Ausgaben Ruhestand 10'000
    S.ausgabenHeute = 12500;
    const k = budgetKennzahlen(S, E, 15000);
    expect(k.nettoQuelle).toBe('cockpit');
    expect(k.sparbetrag).toBe(2500);
    expect(k.sparquote).toBeCloseTo(2500 / 15000, 10);
    expect(k.reserveMonate).toBe(8);
    expect(k.ruhestandZuHeute).toBeCloseTo(0.8, 10);
  });
  it('ohne Netto aus dem Cockpit wird aus dem Bruttolohn geschätzt; ohne Lohn und Ausgaben bleiben die Kennzahlen leer', () => {
    const S = migrate(clone(EXAMPLE));
    const k = budgetKennzahlen(S, E);
    expect(k.nettoQuelle).toBe('schaetzung');
    expect(k.netto).toBeGreaterThan(10000);
    expect(k.netto).toBeLessThan((160000 + 45000) / 12);
    expect(k.sparbetrag).toBeNull();
    expect(k.reserveMonate).toBeNull();
    const leer = budgetKennzahlen(emptyState(), E);
    expect(leer.netto).toBeNull();
    expect(leer.nettoQuelle).toBeNull();
  });
});

describe('Zweiter Prüflauf: Nettoeinkommen je Person', () => {
  it('Netto nur für Person 1 im Cockpit: Person 2 wird aus ihrem Bruttolohn geschätzt (vorher: fehlte ganz)', () => {
    const S = migrate(clone(EXAMPLE));
    S.personen[1].brutto = 45000;
    const nur2 = budgetKennzahlen({ ...S, personen: [{ ...S.personen[0], brutto: 0 }, S.personen[1]] }, E).netto!;
    const k = budgetKennzahlen(S, E, [6000, 0]);
    expect(k.netto).toBe(Math.round(6000 + nur2));
    expect(k.nettoQuelle).toBe('gemischt');
    expect(budgetKennzahlen(S, E, [6000, 3000]).nettoQuelle).toBe('cockpit');
    expect(budgetKennzahlen(S, E, [0, 0]).nettoQuelle).toBe('schaetzung');
  });
  it('wer das Pensionierungsalter erreicht hat, hat keinen Lohn mehr (wie im Rechenkern)', () => {
    const S = migrate(clone(EXAMPLE));
    S.haushalt = 'single';
    S.personen[0].jahrgang = 1964; S.personen[0].pensAlter = 60; S.personen[0].brutto = 160000;
    expect(budgetKennzahlen(S, E).netto).toBeNull();
  });
});
