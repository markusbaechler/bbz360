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
  nettoQuelle: 'cockpit' | 'schaetzung' | 'gemischt' | null;
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
export function budgetKennzahlen(S: PensState, E: Engine, nettoCockpit: number | number[] = 0): BudgetKennzahlen {
  const werte = budgetWerte(S, E), eigen = hatEigenheim(S, E);
  const positionen = BUDGET_KEYS.map((key) => {
    const [, label, hinweis] = BUDGET_POS.find(([k]) => k === key)!;
    const istWohnen = key === 'wohnen';
    const erfasst = istWohnen ? eigen || (S.fix.wohnen != null && isFinite(+S.fix.wohnen)) : S.budget[key] != null && isFinite(+S.budget[key]);
    return { key, label, hinweis, wert: werte[key], fest: istWohnen && eigen, erfasst };
  });
  // Je Person (ADR-22): das im Cockpit erfasste Netto, sonst die Schätzung aus ihrem Bruttolohn. Wer das geplante
  // Pensionierungsalter erreicht hat, hat keinen Lohn mehr (wie im Rechenkern), auch wenn das Feld noch gefüllt ist.
  const ps = S.personen.slice(0, S.haushalt === 'single' ? 1 : 2);
  const quote = (1 - E.P.annahmen.sozialabgaben) * (1 - (+S.steuerEink || 0) / 100);
  const jePerson = Array.isArray(nettoCockpit) ? nettoCockpit : null;
  const teile = ps.map((p, i) => {
    const erfasst = jePerson ? +jePerson[i] || 0 : 0;
    if (erfasst > 0) return { betrag: erfasst, quelle: 'cockpit' as const };
    const lohn = E.BASIS - p.jahrgang < p.pensAlter ? +p.brutto || 0 : 0;
    return { betrag: (lohn / 12) * quote, quelle: 'schaetzung' as const };
  }).filter((t) => t.betrag > 0);
  const gesamt = !jePerson && (nettoCockpit as number) > 0;
  const summeNetto = gesamt ? (nettoCockpit as number) : teile.reduce((x, t) => x + t.betrag, 0);
  const netto = summeNetto > 0 ? Math.round(summeNetto) : null;
  const nettoQuelle: BudgetKennzahlen['nettoQuelle'] = netto == null ? null : gesamt || teile.every((t) => t.quelle === 'cockpit') ? 'cockpit' : teile.every((t) => t.quelle === 'schaetzung') ? 'schaetzung' : 'gemischt';
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
    nettoQuelle,
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
