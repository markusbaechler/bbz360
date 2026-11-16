// ============================================================================
// steuern.ts — Kennzahlen des Moduls 07d Steuern (Zielbild Fusion, Phase 6).
// Rechnet nur, was belegbar ist: die Steuer auf Kapitalbezügen und die
// Vermögenssteuer aus den Tabellen der ESTV (Kantonshauptorte, Grundlagen des
// PensCheck). Für Abzüge (Säule 3a, PK-Einkauf) braucht es den
// Grenzsteuersatz; er wird im Gespräch erfasst und nicht geschätzt. KEIN DOM.
// ============================================================================
import type { Auswertung } from './pension/analyse';
import type { Engine } from './pension/engine';
import type { PensState } from './pension/typen';

export interface KapitalJahr {
  jahr: number;
  /** Bezüge des Jahres: Art, Person (Index), Betrag in heutiger Kaufkraft. */
  bezuege: { art: string; person: number; betrag: number }[];
  betrag: number;
  /** Steuer des Jahres in heutiger Kaufkraft. */
  steuer: number;
}
export interface KapitalStaffelung {
  jahre: KapitalJahr[];
  /** Summe aller Kapitalbezüge (heutige Kaufkraft). */
  total: number;
  /** Steuer wie geplant. */
  steuerGeplant: number;
  /** Steuer, wenn alle Bezüge ins selbe Jahr fielen. */
  steuerEinJahr: number;
  /** Steuer, wenn jeder einzelne Bezug in ein eigenes Jahr fiele (untere Grenze; nicht immer umsetzbar). */
  steuerEinzeln: number;
}

/**
 * Kapitalbezüge des Plans (PK-Kapital, Säule 3a, Freizügigkeit) je Jahr mit ihrer Steuer und zwei Vergleichen.
 * Verheiratete werden gemeinsam besteuert, alle anderen je Person (wie im Rechenkern).
 */
export function kapitalStaffelung(R: Auswertung, S: PensState, E: Engine): KapitalStaffelung {
  const verheiratet = S.haushalt === 'verheiratet';
  const liste = R.base.kapListe.map((k) => ({ jahr: k.year, art: k.art, person: k.person, betrag: k.betrag / k.I, steuer: k.steuer / k.I }));
  const jahre: KapitalJahr[] = [];
  for (const k of liste) {
    let j = jahre.find((x) => x.jahr === k.jahr);
    if (!j) { j = { jahr: k.jahr, bezuege: [], betrag: 0, steuer: 0 }; jahre.push(j); }
    j.bezuege.push({ art: k.art, person: k.person, betrag: k.betrag });
    j.betrag += k.betrag;
    j.steuer += k.steuer;
  }
  jahre.sort((a, b) => a.jahr - b.jahr);
  const total = liste.reduce((x, k) => x + k.betrag, 0);
  const st = (betrag: number): number => E.kapSteuer(S.kanton, betrag, verheiratet);
  // Alles im selben Jahr: Verheiratete auf der Summe, sonst je Person auf ihrer Summe
  const jePerson = [0, 1].map((i) => liste.filter((k) => k.person === i).reduce((x, k) => x + k.betrag, 0));
  const steuerEinJahr = verheiratet ? st(total) : jePerson.reduce((x, b) => x + (b > 0 ? st(b) : 0), 0);
  const steuerEinzeln = liste.reduce((x, k) => x + st(k.betrag), 0);
  return { jahre, total, steuerGeplant: liste.reduce((x, k) => x + k.steuer, 0), steuerEinJahr, steuerEinzeln };
}

export interface AbzugErsparnis {
  /** Einzahlung in die Säule 3a pro Jahr je Person (0 ohne Erwerbseinkommen). */
  s3a: number[];
  s3aSumme: number;
  /** Steuerersparnis pro Jahr aus den 3a-Einzahlungen; null ohne Grenzsteuersatz. */
  s3aErsparnis: number | null;
  /** Einmalige Steuerersparnis eines PK-Einkaufs; null ohne Grenzsteuersatz oder Betrag. */
  einkaufErsparnis: number | null;
  /**
   * Sperrfrist nach Art. 79b Abs. 3 BVG: Jahr, bis zu dem (einschliesslich) kein Kapital bezogen werden darf,
   * und ob ein geplanter PK-Kapitalbezug in diese Frist fällt.
   */
  sperrfristBis: number | null;
  sperrfristVerletzt: boolean;
}

/**
 * Wirkung von Abzügen. grenzsatz: Grenzsteuersatz in Prozent (im Gespräch erfasst; '' = unbekannt).
 * Die Ersparnis ist Betrag × Grenzsteuersatz: eine Näherung, die bei grossen Beträgen zu hoch ausfällt, weil der
 * Grenzsteuersatz mit sinkendem steuerbarem Einkommen fällt.
 */
export function abzugErsparnis(S: PensState, E: Engine, R: Auswertung | null, grenzsatz: number | '', einkauf: number, einkaufJahr: number | ''): AbzugErsparnis {
  const ps = S.personen.slice(0, S.haushalt === 'single' ? 1 : 2);
  const s3a = ps.map((p) => Math.round(E.s3aJahr(S, p, 0)));
  const s3aSumme = s3a.reduce((x, v) => x + v, 0);
  const g = typeof grenzsatz === 'number' && grenzsatz > 0 ? grenzsatz / 100 : null;
  const sperrfristBis = einkauf > 0 && typeof einkaufJahr === 'number' && einkaufJahr > 0 ? einkaufJahr + 2 : null;
  // PK-Kapitalbezüge des Plans (ohne 3a und Freizügigkeit)
  const pkJahre = R ? R.base.kapListe.filter((k) => /^PK-/.test(k.art)).map((k) => k.year) : [];
  return {
    s3a, s3aSumme,
    s3aErsparnis: g != null ? s3aSumme * g : null,
    einkaufErsparnis: g != null && einkauf > 0 ? einkauf * g : null,
    sperrfristBis,
    sperrfristVerletzt: sperrfristBis != null && pkJahre.some((j) => j <= sperrfristBis),
  };
}
