// ============================================================================
// nachlass.ts — Modul 07f Nachlass (Zielbild Fusion, Phase 8).
// Gesetzliche Erbteile, Pflichtteile und frei verfügbare Quote nach ZGB
// (Erbrecht in der seit 1.1.2023 geltenden Fassung). Die güterrechtliche
// Auseinandersetzung wird NICHT gerechnet: Der Nachlass ist eine Eingabe bzw.
// eine ausgewiesene Annahme. KEIN DOM.
// ============================================================================
import type { PensState } from './pension/typen';

export interface Bruch { z: number; n: number }
const b = (z: number, n: number): Bruch => ({ z, n });
export const bruchWert = (x: Bruch): number => x.z / x.n;
export const bruchText = (x: Bruch): string => (x.z === 0 ? '0' : x.z === x.n ? 'alles' : `${x.z}/${x.n}`);

export interface Erbe {
  wer: string;
  /** Gesetzlicher Erbteil (Art. 457–462 ZGB). */
  gesetzlich: Bruch;
  /** Pflichtteil am Nachlass (Art. 471 ZGB: die Hälfte des gesetzlichen Erbanspruchs; Eltern haben keinen). */
  pflichtteil: Bruch;
  betrag: number;
  pflichtBetrag: number;
}
export interface Erbteilung {
  erben: Erbe[];
  /** Frei verfügbare Quote: Nachlass abzüglich aller Pflichtteile. */
  frei: Bruch;
  freiBetrag: number;
  hinweise: string[];
}

export interface ErbFall {
  zivil: PensState['haushalt'];
  kinder: number;
  /** Lebt mindestens ein Elternteil oder gibt es Nachkommen der Eltern (Geschwister, Nichten, Neffen)? */
  elternStamm: boolean;
  nachlass: number;
}

/** Gesetzliche Erbfolge ohne Testament oder Erbvertrag. */
export function erbteilung(f: ErbFall): Erbteilung {
  const N = Math.max(0, f.nachlass), kinder = Math.max(0, Math.round(f.kinder));
  const verheiratet = f.zivil === 'verheiratet';
  const erben: { wer: string; gesetzlich: Bruch; pflichtteil: Bruch }[] = [];
  const hinweise: string[] = [];
  const nachkommen = kinder === 1 ? 'Kind' : `Nachkommen (${kinder} Kinder, zu gleichen Teilen)`;
  let frei: Bruch;
  if (verheiratet && kinder > 0) {
    erben.push({ wer: 'Ehegatte', gesetzlich: b(1, 2), pflichtteil: b(1, 4) }, { wer: nachkommen, gesetzlich: b(1, 2), pflichtteil: b(1, 4) });
    frei = b(1, 2);
  } else if (verheiratet && f.elternStamm) {
    erben.push({ wer: 'Ehegatte', gesetzlich: b(3, 4), pflichtteil: b(3, 8) }, { wer: 'Eltern bzw. deren Nachkommen', gesetzlich: b(1, 4), pflichtteil: b(0, 1) });
    frei = b(5, 8);
  } else if (verheiratet) {
    erben.push({ wer: 'Ehegatte', gesetzlich: b(1, 1), pflichtteil: b(1, 2) });
    frei = b(1, 2);
  } else if (kinder > 0) {
    erben.push({ wer: nachkommen, gesetzlich: b(1, 1), pflichtteil: b(1, 2) });
    frei = b(1, 2);
  } else if (f.elternStamm) {
    erben.push({ wer: 'Eltern bzw. deren Nachkommen', gesetzlich: b(1, 1), pflichtteil: b(0, 1) });
    frei = b(1, 1);
  } else {
    erben.push({ wer: 'Grosselterlicher Stamm, sonst das Gemeinwesen', gesetzlich: b(1, 1), pflichtteil: b(0, 1) });
    frei = b(1, 1);
  }
  if (f.zivil === 'konkubinat') hinweise.push('Die Konkubinatspartnerin oder der Konkubinatspartner erbt von Gesetzes wegen nichts. Eine Begünstigung ist nur über Testament oder Erbvertrag im Rahmen der frei verfügbaren Quote möglich; je nach Kanton fällt darauf Erbschaftssteuer an.');
  if (verheiratet && kinder > 0) hinweise.push('Mit Testament oder Erbvertrag kann der Ehegatte bis zu 3/4 des Nachlasses zu Eigentum erhalten (Pflichtteil der Nachkommen 1/4), oder die Nutzniessung am ganzen Teil der gemeinsamen Nachkommen (Art. 473 ZGB).');
  hinweise.push('Vor der Erbteilung steht bei Verheirateten die güterrechtliche Auseinandersetzung; sie ist hier nicht gerechnet. Vorsorgeguthaben (Pensionskasse, Säule 3a) folgen der Begünstigtenordnung und sind im Nachlass nicht enthalten.');
  return {
    erben: erben.map((x) => ({ ...x, betrag: N * bruchWert(x.gesetzlich), pflichtBetrag: N * bruchWert(x.pflichtteil) })),
    frei, freiBetrag: N * bruchWert(frei), hinweise,
  };
}

/**
 * Reinvermögen des Haushalts heute: freies Vermögen plus Liegenschaften abzüglich Hypotheken (ohne Vorsorge).
 * Eine Liegenschaft mit Kaufjahr nach `heute` zählt noch nicht.
 */
export function reinvermoegen(S: PensState, heute: number = new Date().getFullYear()): number {
  return Math.max(0, S.liquiditaet + S.wertschriften + S.liegenschaften.reduce((x, l) => x + ((l.kaufJahr ?? 0) > heute ? 0 : l.verkehrswert - l.hypothek), 0));
}

/**
 * Annahme für den Nachlass einer Person, solange nichts erfasst ist: Alleinstehende das ganze Reinvermögen,
 * Paare die Hälfte (Verheiratete: als wäre alles Errungenschaft und hälftig zu teilen; keine Eigengüter).
 */
export const nachlassAnnahme = (S: PensState): number => reinvermoegen(S) * (S.haushalt === 'single' ? 1 : 0.5);
