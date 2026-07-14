// ============================================================================
// finance.ts — PURE Finanzmathematik, VERBATIM aus v1 (bbz-Dialog @ main) portiert.
//   07a: calculate()/updateAnalysis()  -> tragbarkeit()
//   07b: updateSimulation()            -> simulate()
//        getStressScore()/getStressStrategyIdx()/getHorizonMaxStrategyIdx()/
//        calculateRecommendation()     -> stressScore()/…/calculateRecommendation()
// KEIN DOM-Zugriff. Referenzwerte: FIXTURES.md (in Node aus v1 verifiziert).
// ============================================================================

// STRATS verbatim aus 07b_anlegen.html (Reihenfolge = Index!).
export const STRATS = [
  { name: 'Einkommen', yield: 0.25, vol: 1.5 },
  { name: 'Konservativ', yield: 1.25, vol: 4.5 },
  { name: 'Ausgewogen', yield: 2.75, vol: 8.5 },
  { name: 'Wachstum', yield: 4.5, vol: 12.5 },
  { name: 'Dynamisch', yield: 5.5, vol: 18.0 },
] as const;

// ── 07a TRAGBARKEIT ─────────────────────────────────────────────────────────
export interface TragbarkeitInput {
  income: number;
  obligations: number;
  price: number;
  cashEquity: number;
  pensionWithdraw: number; // 2. Saeule Vorbezug (harte EM)
  pensionPledge: number; // 2. Saeule Verpfaendung
  calcRate: number; // kalk. Zins in PROZENT (z.B. 5.00)
  sideRate: number; // Nebenkosten in PROZENT (z.B. 0.75)
  age: number;
}

export type Banner = 'ROT' | 'ORANGE' | 'GRUEN';

export interface TragbarkeitResult {
  hardEq: number;
  totalHypo: number;
  ltvExp: number;
  ltv: number;
  hardEqPct: number;
  totalEqPct: number;
  netIncome: number;
  limit1: number;
  h2ForAmort: number;
  y65: number;
  annAmort: number;
  annInterest: number;
  annSide: number;
  totalAnn: number;
  monthly: number;
  affordPct: number;
  banner: Banner;
}

export function tragbarkeit(i: TragbarkeitInput): TragbarkeitResult {
  const calcR = i.calcRate / 100;
  const sideR = i.sideRate / 100;
  const age = i.age || 40;

  const hardEq = i.cashEquity + i.pensionWithdraw;
  const totalHypo = Math.max(0, i.price - hardEq);
  const ltvExp = Math.max(0, totalHypo - i.pensionPledge);
  const ltv = i.price > 0 ? (ltvExp / i.price) * 100 : 0;
  const hardEqPct = i.price > 0 ? (hardEq / i.price) * 100 : 0;
  const totalEqPct = i.price > 0 ? ((hardEq + i.pensionPledge) / i.price) * 100 : 0;
  const netIncome = i.income - i.obligations;
  const limit1 = i.price * 0.6667;
  const h2ForAmort = Math.max(0, ltvExp - limit1);
  const y65 = Math.max(1, 65 - age);
  const annAmort = h2ForAmort / Math.min(15, y65) + i.pensionPledge / y65;
  const annInterest = totalHypo * calcR;
  const annSide = i.price * sideR;
  const totalAnn = annInterest + annAmort + annSide;
  const affordPct = netIncome > 0 ? (totalAnn / netIncome) * 100 : 0;

  // Banner-Logik verbatim aus updateAnalysis().
  const isRed = i.price > 0 && (affordPct > 40 || ltv > 80.01 || totalEqPct < 19.99);
  const isOrange = !isRed && i.price > 0 && (affordPct > 33.51 || hardEqPct < 10);
  const banner: Banner = isRed ? 'ROT' : isOrange ? 'ORANGE' : 'GRUEN';

  return {
    hardEq, totalHypo, ltvExp, ltv, hardEqPct, totalEqPct, netIncome, limit1,
    h2ForAmort, y65, annAmort, annInterest, annSide, totalAnn,
    monthly: totalAnn / 12, affordPct, banner,
  };
}

// ── 07b SIMULATION ──────────────────────────────────────────────────────────
export interface SimulationResult {
  endAmt: number;
  gain: number;
  bandLow: number; // end * exp(-1.645 * vol * sqrt(t))
  bandHigh: number; // end * exp(+1.645 * vol * sqrt(t))
}

export function simulate(amount: number, stratIdx: number, horizon: number): SimulationResult {
  const strat = STRATS[stratIdx];
  const endAmt = amount * Math.pow(1 + strat.yield / 100, horizon);
  const sigmaScale = (strat.vol / 100) * Math.sqrt(horizon);
  return {
    endAmt,
    gain: endAmt - amount,
    bandLow: endAmt * Math.exp(-1.645 * sigmaScale),
    bandHigh: endAmt * Math.exp(1.645 * sigmaScale),
  };
}

// ── 07b STRESS / EMPFEHLUNG ──────────────────────────────────────────────────
export interface StressInput {
  react: string; // sell | wait | hold | buy
  wait: string; // 1y | 3y | 5y | open
  exp: string; // none | little | lot
}

export function stressScore(s: StressInput): number {
  const crashMap: Record<string, number> = { sell: 0, wait: 1, hold: 2, buy: 3 };
  const waitMap: Record<string, number> = { '1y': 0, '3y': 1, '5y': 2, open: 3 };
  const expMap: Record<string, number> = { none: 0, little: 1, lot: 2 };
  return (
    (crashMap[s.react] ?? 0) * 0.5 +
    (waitMap[s.wait] ?? 0) * 0.3 +
    (expMap[s.exp] ?? 0) * 0.2
  );
}

export function stressStrategyIdx(score: number): number {
  if (score < 0.75) return 0;
  if (score < 1.5) return 1;
  if (score < 2.25) return 2;
  if (score < 2.75) return 3;
  return 4;
}

export function horizonMaxStrategyIdx(horizon: number): number {
  if (horizon <= 2) return 1;
  if (horizon <= 5) return 2;
  if (horizon <= 9) return 3;
  return 4;
}

export interface RecommendationInput {
  wishIdx: number; // Strategiewunsch-Index (ungeklemmt)
  horizon: number;
  stress: StressInput;
}

export interface RecommendationResult {
  horizonMaxIdx: number;
  wishIdx: number; // geklemmt auf horizonMax (wie v1)
  stressIdx: number;
  recommendationIdx: number;
}

export function calculateRecommendation(inp: RecommendationInput): RecommendationResult {
  const horizonMaxIdx = horizonMaxStrategyIdx(inp.horizon);
  const wishIdx = Math.min(inp.wishIdx, horizonMaxIdx);
  const stressIdx = stressStrategyIdx(stressScore(inp.stress));
  let recommendation = wishIdx;
  if (stressIdx >= wishIdx) recommendation = wishIdx;
  else if (wishIdx - stressIdx === 1) recommendation = wishIdx;
  else recommendation = Math.min(wishIdx, stressIdx + 1);
  recommendation = Math.min(recommendation, horizonMaxIdx);
  return { horizonMaxIdx, wishIdx, stressIdx, recommendationIdx: recommendation };
}
