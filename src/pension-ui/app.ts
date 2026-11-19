// Gemeinsamer Zustand der Pensionierungs-Oberfläche: Jedes UI-Modul (form, tutor, results, buehne …) erhält `app`.
// Im PensCheck entstand das Objekt in main.js; in bbz360 baut es src/modules/07c-pension.ts auf.
import type { Engine } from '../lib/pension/engine';
import type { Gesamtauswertung } from '../lib/pension/auswertung';
import type { ParamDatei, Params, PensState } from '../lib/pension/typen';
import type { PruefDatei, PruefStand } from '../lib/pension/params';

/** Ergebnis der Rechnung, wie es die Oberfläche hält: Auswertung samt Kennung des Vergleichs und Rechenzeit. */
export type AppErgebnis = Gesamtauswertung & { vsig?: string; ms?: number };

export interface ChangedOptionen {
  /** Feld, das beim Nachführen des Formulars nicht überschrieben wird (meist das aktive Eingabefeld). */
  except?: Element | null;
  /** Zusätzlicher Neuaufbau nach dem Nachführen. */
  rerender?: () => void;
  /** Längere Wartezeit bis zur Rechnung (Schieberegler). */
  soft?: boolean;
}

export interface App {
  version: string;
  params: ParamDatei;
  verification: PruefDatei;
  S: PensState;
  R: AppErgebnis | null;
  A0: number;
  P: Params;
  Pn: Params | null;
  E: Engine;
  pruefungVeraltet?: boolean;
  gespeichert?: boolean;
  /** Rechenvarianten A und B des laufenden Vergleichs «So oder so» (leer ohne Vergleich). */
  varianten: () => PensState[];
  bestaetigt: (c: PruefStand | undefined) => boolean;
  persist: () => boolean | void;
  setLamp: (st?: string) => void;
  stopChanged: () => void;
  changed: (o?: ChangedOptionen) => void;
  formRender: () => void;
  setMode: (m: 'tutor' | 'form') => void;
  replaceState: (ns: PensState, keepMode?: boolean) => boolean;
  confirm: (titel: string, text: string, ja?: string) => Promise<boolean>;
  hatEigenes: () => boolean;
  toast: (t: string) => void;
  share: () => void | Promise<void>;
  setView: (v: string) => void;
  checkForUpdate: (manual?: boolean) => void | Promise<void>;
  /** bbz360 (ADR-22): ein Kundenfall pro Sitzung — der Tutor bietet weder «Neu beginnen» noch einen Übungsfall an. */
  einFall?: boolean;
  /** Bühne (buehne.ts hängt sich selbst an): Urteil und Kennzahlen wandern im Tutor-Ergebnis in die Karte des Tutors. */
  buehne?: { render(): void; renderBody(): void; ordne(): void; springe(id: string): void; kopfHeim(): void; kopfIn(platz: Element | null): void };
  /** Reichweite für Bericht und Vergleich (results.ts setzt sie aus reach.ts: reachData); null ohne Ergebnis. */
  reach?: ReturnType<typeof import('./reach').reachData> | null;
  /** Vermögensbilanz ohne Darstellung, für den Bericht (results.ts). */
  bilanz?: import('./results').BilanzDaten;
  /** Hinweise als HTML-Zeilen, für den Bericht (results.ts). */
  hints?: string[];
  /** Schrittleiste (schritte.ts hängt sich selbst an): Schritt anspringen bzw. neu aufbauen. */
  schritt?: { go(id: string): void; render(): void };
  /** Themenkarten (themenui.ts hängt sich selbst an): Leiste und Editor nachführen, Editor öffnen, Fokus auf eine Karte, Auswahl zeigen. */
  themen?: { render(): void; oeffne(key: string | null): void; fokusKarte(key: string | null): boolean; auswahl(von?: HTMLElement | null): void };
  /** So oder so (vergleich.ts hängt sich selbst an): neu aufbauen, Vorschau prüfen, Vergleich zu einer Karte vorbereiten. */
  vergleich?: { render(): void; pruefen(): void; entwurf(key: string | null): void };
  /** Linke Spalte ein- oder ausblenden (schritte.ts hängt sich selbst an). */
  leiste?: (auf?: boolean, fokus?: boolean) => void;
  /** Rechenvariante der Tragbarkeit übernehmen (results.ts hängt sich selbst an). */
  varianteUebernehmen?: () => void;
}
