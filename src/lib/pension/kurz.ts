// Kurzfassung der Pensionierungs-Auswertung für Stellen ausserhalb des Moduls 07c
// (Abschluss/Gesprächsbericht, später Lebensplan). Rechnet synchron mit denselben Grundlagen wie das Modul.
import grundlagen from '../../../public/data/params.json';
import { createEngine, monthOf } from './engine';
import { analyse } from './analyse';
import type { AnalyseErgebnis } from './analyse';
import { resolveParams, nextParams } from './params';
import { rechenEingaben } from './themen';
import type { ParamDatei, PensState } from './typen';

export interface PensionKurz {
  /** Ampel der Auswertung. */
  st: 'gruen' | 'gelb' | 'rot';
  wort: 'Reicht' | 'Knapp' | 'Reicht nicht';
  /** Planungshorizont (Alter Person 1). */
  horizont: number;
  /** Alter (Person 1), in dem das freie Vermögen aufgebraucht ist; null, wenn es bis zum Horizont reicht. */
  aufgebraucht: number | null;
  /** Geplante und tragbare Ausgaben pro Monat im Ruhestand (heutige Kaufkraft). */
  ausgaben: number;
  tragbar: number;
  /** Pensionierungsalter je Person. */
  pensAlter: number[];
  /** Die nächsten Schritte aus dem Aktionsplan (höchstens drei, ohne erledigte). */
  schritte: { id: string; titel: string; when: string; stelle: string }[];
}

const WORT = { gruen: 'Reicht', gelb: 'Knapp', rot: 'Reicht nicht' } as const;

/** Kurzfassung aus einer fertigen Auswertung (z. B. aus dem Worker); null bei leerer Auswertung. */
export function kurzAus(R: AnalyseErgebnis | null | undefined, S: PensState): PensionKurz | null {
  if (!R || R.leer) return null;
  const st = R.amp.st as PensionKurz['st'];
  return {
    st,
    wort: WORT[st],
    horizont: R.horizont,
    aufgebraucht: R.base.depleted ?? null,
    ausgaben: S.ausgabenRuhestand,
    tragbar: Math.round(R.maxA),
    pensAlter: S.personen.slice(0, S.haushalt === 'single' ? 1 : 2).map((p) => p.pensAlter),
    schritte: R.akt.filter((a) => !S.aktion[a.id]).slice(0, 3).map((a) => ({ id: a.id, titel: a.titel, when: a.when, stelle: a.stelle })),
  };
}

/** Kurzfassung für einen Haushalts-Stand; null, solange die Ausgaben im Ruhestand fehlen. Rechnet synchron (rund eine Sekunde). */
export function pensionKurz(S: PensState, A0: number = monthOf()): PensionKurz | null {
  const jahr = Math.floor(A0 / 12);
  const daten = grundlagen as unknown as ParamDatei;
  const E = createEngine(resolveParams(daten, jahr), A0, nextParams(daten, jahr));
  // Wie im Worker: gerechnet wird ohne Bedienzustand (rechenEingaben), die Auswertung liest ihn nicht.
  return kurzAus(analyse(rechenEingaben(S) as unknown as PensState, E, undefined, {}), S);
}
