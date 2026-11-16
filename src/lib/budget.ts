// ============================================================================
// budget.ts — Kennzahlen des Moduls 05b Budget & Liquiditaet (Phase 4).
// Rechnet auf dem gemeinsamen Haushalts-Stand mit den Budget-Funktionen des
// Pensionierungs-Rechenkerns (acht Positionen, Musterbudgets). KEIN DOM.
// ============================================================================
import { BUDGET_KEYS, budgetSumme, budgetVoll, budgetWerte, hatEigenheim } from './pension/analyse';
import { BUDGET_POS } from './pension/budget';
import type { Engine } from './pension/engine';
import type { PensState } from './pension/typen';

export interface BudgetPosition {
  key: string;
  label: string;
  hinweis: string;
  /** Betrag pro Monat, wie er in die Summe eingeht. */
  wert: number;
  /** Wohnen bei Eigenheim: folgt der Liegenschaft und ist hier nicht erfassbar. */
  fest: boolean;
  /** Erfasst (bei Wohnen: Miete erfasst oder Eigenheim)? */
  erfasst: boolean;
}

export interface BudgetKennzahlen {
  positionen: BudgetPosition[];
  /** Summe des Budgets im Ruhestand pro Monat. */
  summe: number;
  /** Alle Positionen ausser Wohnen erfasst? Erst dann kann das Budget als Ausgaben im Ruhestand gelten. */
  voll: boolean;
  aktiv: boolean;
  ausgabenRuhestand: number;
  /** Heutige Ausgaben pro Monat (0 = nicht erfasst). */
  ausgabenHeute: number;
  /** Nettoeinkommen pro Monat: aus dem Cockpit erfasst, sonst aus dem Bruttolohn geschaetzt; null ohne Lohn. */
  netto: number | null;
  nettoQuelle: 'cockpit' | 'schaetzung' | null;
  /** Netto − Ausgaben heute (pro Monat) und Anteil am Netto; null, wenn eines von beiden fehlt. */
  sparbetrag: number | null;
  sparquote: number | null;
  /** Liquiditaet in Monatsausgaben von heute; null ohne Ausgaben. */
  reserveMonate: number | null;
  /** Budget im Ruhestand im Verhaeltnis zu den heutigen Ausgaben; null ohne beide Werte. */
  ruhestandZuHeute: number | null;
}

/**
 * Kennzahlen zum Budget.
 * nettoCockpit: im Cockpit 05 erfasstes Nettoeinkommen pro Monat (0 = nicht erfasst). Fehlt es, wird das Netto
 * wie im Rechenkern geschaetzt: Bruttolohn abzueglich Sozialabgaben und pauschaler Einkommenssteuer.
 */
export function budgetKennzahlen(S: PensState, E: Engine, nettoCockpit = 0): BudgetKennzahlen {
  const werte = budgetWerte(S, E), eigen = hatEigenheim(S, E);
  const positionen = BUDGET_KEYS.map((key) => {
    const [, label, hinweis] = BUDGET_POS.find(([k]) => k === key)!;
    const istWohnen = key === 'wohnen';
    const erfasst = istWohnen ? eigen || (S.fix.wohnen != null && isFinite(+S.fix.wohnen)) : S.budget[key] != null && isFinite(+S.budget[key]);
    return { key, label, hinweis, wert: werte[key], fest: istWohnen && eigen, erfasst };
  });
  const brutto = S.personen.slice(0, S.haushalt === 'single' ? 1 : 2).reduce((x, p) => x + (+p.brutto || 0), 0);
  const geschaetzt = (brutto / 12) * (1 - E.P.annahmen.sozialabgaben) * (1 - (+S.steuerEink || 0) / 100);
  const netto = nettoCockpit > 0 ? nettoCockpit : geschaetzt > 0 ? Math.round(geschaetzt) : null;
  const ausgabenHeute = typeof S.ausgabenHeute === 'number' ? S.ausgabenHeute : 0;
  const summe = budgetSumme(S, E);
  const ruhe = S.budgetAktiv ? summe : S.ausgabenRuhestand;
  return {
    positionen,
    summe,
    voll: budgetVoll(S),
    aktiv: S.budgetAktiv,
    ausgabenRuhestand: S.ausgabenRuhestand,
    ausgabenHeute,
    netto,
    nettoQuelle: nettoCockpit > 0 ? 'cockpit' : netto != null ? 'schaetzung' : null,
    sparbetrag: netto != null && ausgabenHeute > 0 ? netto - ausgabenHeute : null,
    sparquote: netto != null && ausgabenHeute > 0 ? (netto - ausgabenHeute) / netto : null,
    reserveMonate: ausgabenHeute > 0 ? S.liquiditaet / ausgabenHeute : null,
    ruhestandZuHeute: ausgabenHeute > 0 && ruhe > 0 ? ruhe / ausgabenHeute : null,
  };
}

/** Uebernimmt ein Musterbudget (alle Positionen ausser Wohnen) in den Stand. */
export function musterUebernehmen(S: PensState, E: Engine, stufe: 'bescheiden' | 'mittel' | 'gehoben'): void {
  const mb = E.P.annahmen.musterbudget[S.haushalt === 'single' ? 'single' : 'paar'][stufe];
  for (const k of BUDGET_KEYS.slice(1)) S.budget[k] = mb[k];
  S.budgetBasis = stufe;
}
