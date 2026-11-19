// Gemeinsamer Rechenweg für Worker und Tests: Auswertung samt Vorschau-Reihen und Rechenvarianten.
import { analyse, horizon } from './analyse';
import type { AnalyseCache, AnalyseErgebnis, Auswertung, AuswertungLeer, SimPerson, SimZeile } from './analyse';
import type { Engine } from './engine';
import type { PensState } from './typen';

/** Vorschau-Reihen ohne Ausgaben (R.vor). */
export interface Vorschau { rows: SimZeile[]; ps: SimPerson[] }
/** Resultat von auswerten(): analyse() samt Vorschau (nur ohne Ausgaben) und Rechenvarianten. */
export type Gesamtauswertung = (Auswertung | (AuswertungLeer & { vor?: Vorschau })) & { varianten: (AnalyseErgebnis | null)[] };

/**
 * Wie analyse(), zusätzlich:
 * - R.vor (nur ohne Ausgaben): { rows, ps } mit Lohn und Renten, bevor Ausgaben erfasst sind; ps = Personen des
 *   Rechenkerns (Aret, Aahv …) für die Marken des Bilds
 * - R.varianten: je Variante analyse() mit eigenem Zwischenspeicher, null bei einem Fehler
 */
export function auswerten(S: PensState, E: Engine, stopA?: number | null, cache: AnalyseCache = {}, varianten: PensState[] = []): Gesamtauswertung {
  const R = analyse(S, E, stopA, cache) as Gesamtauswertung;
  if (R.leer) { const v = E.simulate({ ...S, ...horizon(S, E) }, { ausgaben: 0 }); R.vor = { rows: v.rows, ps: v.ps }; }
  R.varianten = varianten.map((Sx) => {
    try { return analyse(Sx, E, stopA, {}); } catch { return null; }
  });
  return R;
}
