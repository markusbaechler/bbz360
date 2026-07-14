import { describe, it, expect } from 'vitest';
import {
  tragbarkeit, simulate, stressScore, stressStrategyIdx,
  horizonMaxStrategyIdx, calculateRecommendation, STRATS,
} from '../../src/lib/finance';
import { fmt } from '../../src/lib/format';

// Referenzwerte: FIXTURES.md (in Node aus v1-Code d3e1cfd verifiziert).
// Rohwerte exakt (Float, toBeCloseTo), Anzeigewerte gerundet de-CH (fmt / Math.round).

const idx = (name: string) => STRATS.findIndex((s) => s.name === name);

describe('07a Tragbarkeit (calcRate 5.00%, sideRate 0.75%)', () => {
  const base = { calcRate: 5.0, sideRate: 0.75 };

  it('T1 — Grenzbereich ORANGE', () => {
    const r = tragbarkeit({
      ...base, income: 145000, obligations: 0, price: 950000,
      cashEquity: 190000, pensionWithdraw: 0, pensionPledge: 0, age: 40,
    });
    expect(r.affordPct).toBeCloseTo(36.94, 2);
    expect(Math.round(r.affordPct)).toBe(37);
    expect(Math.round(r.ltv)).toBe(80);
    expect(fmt(r.totalHypo)).toBe("760'000");
    expect(fmt(r.monthly)).toBe("4'464");
    expect(fmt(r.annAmort)).toBe("8'442");
    expect(r.banner).toBe('ORANGE');
  });

  it('T2 — kritisch ROT (afford > 40)', () => {
    const r = tragbarkeit({
      ...base, income: 180000, obligations: 12000, price: 1200000,
      cashEquity: 150000, pensionWithdraw: 90000, pensionPledge: 0, age: 48,
    });
    expect(r.affordPct).toBeCloseTo(40.28, 2);
    expect(Math.round(r.ltv)).toBe(80);
    expect(fmt(r.totalHypo)).toBe("960'000");
    expect(fmt(r.monthly)).toBe("5'639");
    expect(fmt(r.annAmort)).toBe("10'664");
    expect(r.banner).toBe('ROT');
  });

  it('T3 — Verpfaendung /30J, ORANGE', () => {
    const r = tragbarkeit({
      ...base, income: 110000, obligations: 0, price: 800000,
      cashEquity: 160000, pensionWithdraw: 0, pensionPledge: 80000, age: 35,
    });
    expect(r.affordPct).toBeCloseTo(38.58, 2);
    expect(Math.round(r.ltv)).toBe(70);
    expect(fmt(r.totalHypo)).toBe("640'000");
    expect(fmt(r.monthly)).toBe("3'537");
    expect(fmt(r.annAmort)).toBe("4'443");
    expect(r.banner).toBe('ORANGE');
  });
});

describe('07b Simulation (Endkapital + Renditeband)', () => {
  it('A1 — 100k, Ausgewogen, 10J', () => {
    const r = simulate(100000, idx('Ausgewogen'), 10);
    expect(Math.round(r.endAmt)).toBe(131165);
    expect(Math.round(r.gain)).toBe(31165);
    expect(Math.round(r.bandLow)).toBe(84292);
    expect(Math.round(r.bandHigh)).toBe(204103);
  });

  it('A2 — 250k, Wachstum, 15J', () => {
    const r = simulate(250000, idx('Wachstum'), 15);
    expect(Math.round(r.endAmt)).toBe(483821);
    expect(Math.round(r.gain)).toBe(233821);
    expect(Math.round(r.bandLow)).toBe(218183);
    expect(Math.round(r.bandHigh)).toBe(1072874);
  });

  it('A3 — 100k, Konservativ, 4J', () => {
    const r = simulate(100000, idx('Konservativ'), 4);
    expect(Math.round(r.endAmt)).toBe(105095);
    expect(Math.round(r.gain)).toBe(5095);
    expect(Math.round(r.bandLow)).toBe(90632);
    expect(Math.round(r.bandHigh)).toBe(121865);
  });
});

describe('07b Empfehlung (Stress-Score + Horizont-Deckel)', () => {
  it('E1 — Abstand Wunsch-Stress = 1 -> Wunsch', () => {
    const stress = { react: 'hold', wait: '5y', exp: 'little' };
    expect(stressScore(stress)).toBeCloseTo(1.8, 10);
    const r = calculateRecommendation({ wishIdx: idx('Wachstum'), horizon: 10, stress });
    expect(STRATS[r.stressIdx].name).toBe('Ausgewogen');
    expect(STRATS[r.horizonMaxIdx].name).toBe('Dynamisch');
    expect(STRATS[r.recommendationIdx].name).toBe('Wachstum');
  });

  it('E2 — min(Wunsch, Stress+1) + Horizont-Deckel', () => {
    const stress = { react: 'wait', wait: '3y', exp: 'none' };
    expect(stressScore(stress)).toBeCloseTo(0.8, 10);
    const r = calculateRecommendation({ wishIdx: idx('Dynamisch'), horizon: 7, stress });
    expect(STRATS[r.stressIdx].name).toBe('Konservativ');
    expect(STRATS[r.horizonMaxIdx].name).toBe('Wachstum');
    expect(STRATS[r.recommendationIdx].name).toBe('Ausgewogen');
  });

  it('E3 — Horizont deckelt', () => {
    const stress = { react: 'buy', wait: 'open', exp: 'lot' };
    expect(stressScore(stress)).toBeCloseTo(2.8, 10);
    const r = calculateRecommendation({ wishIdx: idx('Ausgewogen'), horizon: 4, stress });
    expect(STRATS[r.stressIdx].name).toBe('Dynamisch');
    expect(STRATS[r.horizonMaxIdx].name).toBe('Ausgewogen');
    expect(STRATS[r.recommendationIdx].name).toBe('Ausgewogen');
  });
});

describe('Hilfs-Mappings', () => {
  it('stressStrategyIdx Schwellen', () => {
    expect(stressStrategyIdx(0.74)).toBe(0);
    expect(stressStrategyIdx(0.75)).toBe(1);
    expect(stressStrategyIdx(2.8)).toBe(4);
  });
  it('horizonMaxStrategyIdx Schwellen', () => {
    expect(horizonMaxStrategyIdx(2)).toBe(1);
    expect(horizonMaxStrategyIdx(5)).toBe(2);
    expect(horizonMaxStrategyIdx(9)).toBe(3);
    expect(horizonMaxStrategyIdx(10)).toBe(4);
  });
});
