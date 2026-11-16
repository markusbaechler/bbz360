// ============================================================================
// absicherung.ts — Modul 07e Absicherung (ADR-20, ADR-22).
// Was bleibt dem Haushalt, wenn eine erwerbstätige Person invalid wird oder
// stirbt? Gerechnet wird mit gesetzlichen Anteilen (AHV/IV, UVG) und mit den
// Leistungen der Pensionskasse laut Vorsorgeausweis (im Gespräch erfasst —
// BVG-Minima werden nicht geschätzt). KEIN DOM.
//
// Vereinfachungen stehen in GRUNDLAGEN und im Modul unter «So ist gerechnet».
// ============================================================================
import type { Engine } from './pension/engine';
import type { PensState } from './pension/typen';

/** Gesetzliche Anteile. Quelle je Wert in GRUNDLAGEN. */
export const ANTEILE = {
  /** Witwen-/Witwerrente in Prozent der Altersrente (Art. 36 AHVG). */
  witwe: 0.8,
  /** Waisenrente in Prozent der Altersrente (Art. 37 AHVG). */
  waise: 0.4,
  /** Kinderrente der IV in Prozent der Invalidenrente (Art. 38 IVG). */
  ivKind: 0.4,
  /** UVG: Invalidenrente bei Vollinvalidität in Prozent des versicherten Verdienstes (Art. 20 UVG). */
  uvgInvalid: 0.8,
  /** UVG: Hinterlassenenrenten Ehegatte / Halbwaise / Höchstsumme (Art. 31 UVG). */
  uvgEhegatte: 0.4, uvgHalbwaise: 0.15, uvgMaxHinterlassene: 0.7,
  /** Komplementärrente: UVG-Rente und AHV/IV-Renten zusammen höchstens (Art. 20 Abs. 2, Art. 31 Abs. 4 UVG). */
  komplementaer: 0.9,
  /** Überentschädigung in der beruflichen Vorsorge: höchstens 90% des mutmasslich entgangenen Verdienstes (Art. 34a BVG, Art. 24 BVV 2). */
  ueberentschaedigung: 0.9,
} as const;
/** Höchstbetrag des versicherten Verdienstes nach UVG pro Jahr (Art. 22 Abs. 1 UVV; seit 1.1.2016, für 2026 geprüft im November 2026). */
export const UVG_MAX_VERDIENST = 148200;
/** Alter, ab dem eine kinderlose Witwe Anspruch auf eine Rente hat (Art. 24 AHVG, Art. 29 Abs. 3 UVG). */
const WITWE_AB = 45;

export const GRUNDLAGEN: string[] = [
  'Gerechnet wird für jede Person, die heute einen Lohn hat und das Referenzalter noch nicht erreicht hat. Der Bedarf ist in allen Fällen derselbe (auch im Todesfall): die eigene Angabe, sonst die heutigen Ausgaben, sonst 80% des heutigen Nettolohns.',
  'IV: Die ganze Invalidenrente entspricht der Altersrente (Art. 37 IVG); gerechnet ist die volle Invalidität. Kinderrente 40% je Kind unter 18 oder in Ausbildung (Art. 38 IVG).',
  'AHV: Witwen- und Witwerrente 80%, Waisenrente 40% der Altersrente (Art. 36 und 37 AHVG). Hinterlassenen- und IV-Renten werden zwölfmal pro Jahr ausbezahlt (die 13. Rente gibt es nur auf Altersrenten).',
  'Die AHV/IV-Rente ist wie in der Pensionierung aus dem heutigen Lohn geschätzt (Rentenformel, Beitragslücken berücksichtigt).',
  'Anspruch auf eine Witwen- oder Witwerrente der AHV (vereinfacht nach Art. 23 und 24 AHVG): verheiratet und mindestens ein Kind, gleich welchen Alters; ohne Kinder nur die Witwe ab 45. Witwer mit Kindern erhalten die Rente seit der Übergangsregelung vom Oktober 2022 auch über das 18. Altersjahr des jüngsten Kindes hinaus. Ehedauer, Scheidung und das Zusammentreffen mit einer eigenen Rente sind nicht geprüft; eine Reform der Hinterlassenenrenten ist im Parlament hängig.',
  'Pensionskasse: Es zählen die Leistungen laut Vorsorgeausweis. Ohne Angabe wird keine Leistung eingerechnet.',
  'Unfall: Gerechnet wird, als wäre die Person nach UVG versichert (Angestellte; Nichtberufsunfälle ab acht Wochenstunden beim selben Arbeitgeber). Invalidenrente 80% des versicherten Verdienstes (höchstens CHF 148’200), Kinder 15% je Kind unter 18 oder in Ausbildung, Ehegatte 40%, zusammen höchstens 70% (Art. 20 und 31 UVG). Mit den AHV/IV-Renten zusammen höchstens 90% (Komplementärrente).',
  'Die UVG-Rente für den Ehegatten gibt es nur mit rentenberechtigten Kindern; die Witwe erhält sie zudem mit erwachsenen Kindern oder ab 45, sonst eine einmalige Abfindung (Art. 29 und 32 UVG). Die Abfindung ist nicht gerechnet.',
  'Pensionskassenleistungen sind auf 90% des entgangenen Lohns begrenzt, zusammen mit AHV/IV und UVG (Art. 34a BVG, Art. 24 BVV 2).',
  'Plafonierung von Kinder- und Waisenrenten, Taggelder, Wartefristen, Teilinvalidität und Steuern auf den Renten sind nicht gerechnet.',
];

export interface PkLeistungen {
  /** Invalidenrente pro Jahr laut Vorsorgeausweis. */
  ivRente: number;
  /** Ehegatten- bzw. Partnerrente pro Jahr. */
  partnerRente: number;
  /** Kinder- bzw. Waisenrente pro Jahr und Kind. */
  kinderRente: number;
  /** Todesfallkapital (einmalig). */
  todesfallKapital: number;
}
export interface AbsicherungEingaben {
  /** Alle Kinder, gleich welchen Alters (für den Anspruch auf Witwen- oder Witwerrente). */
  kinder: number;
  /** Davon unter 18 oder in Ausbildung (für Kinder- und Waisenrenten); höchstens `kinder`. */
  kinderAbh: number;
  ursache: 'krankheit' | 'unfall';
  /** Bedarf pro Monat; 0 = aus den heutigen Ausgaben bzw. aus dem Nettoeinkommen abgeleitet. */
  bedarfMonat: number;
  pk: [PkLeistungen, PkLeistungen];
}
export const PK_LEER: PkLeistungen = { ivRente: 0, partnerRente: 0, kinderRente: 0, todesfallKapital: 0 };

export interface Posten { label: string; betrag: number; art: 'lohn' | 'ahv' | 'pk' | 'uvg' }
export interface Fall {
  person: number;
  ereignis: 'invalid' | 'tod';
  /** Einnahmen pro Jahr nach dem Ereignis. */
  posten: Posten[];
  summe: number;
  bedarf: number;
  /** Bedarf − Einnahmen pro Jahr; positiv = Lücke. */
  luecke: number;
  /** Einmaliges Kapital (Todesfallkapital der Pensionskasse). */
  kapital: number;
  hinweise: string[];
}
export interface AbsicherungErgebnis {
  bedarf: number;
  bedarfQuelle: 'eingabe' | 'ausgaben' | 'netto';
  faelle: Fall[];
  /** Warum es keine Fälle gibt (niemand erwerbstätig vor dem Referenzalter); sonst ''. */
  hinweis: string;
}

/**
 * Rechnet je erwerbstätige Person die Fälle Invalidität und Tod.
 * Der Bedarf ist für alle Fälle derselbe: die Eingabe, sonst die heutigen Ausgaben, sonst 80% des Nettoeinkommens.
 */
export function absicherung(S: PensState, E: Engine, e: AbsicherungEingaben): AbsicherungErgebnis {
  const paar = S.haushalt !== 'single', verheiratet = S.haushalt === 'verheiratet';
  const ps = S.personen.slice(0, paar ? 2 : 1);
  const kinder = Math.max(0, Math.round(e.kinder));
  const abh = Math.min(kinder, Math.max(0, Math.round(e.kinderAbh)));
  const nettoQuote = (1 - E.P.annahmen.sozialabgaben) * (1 - (+S.steuerEink || 0) / 100);
  const netto = ps.map((p) => p.brutto * nettoQuote);
  const alter = ps.map((p) => E.BASIS - p.jahrgang);
  /** Erwerbstätig vor dem Referenzalter: Nur dann gibt es IV-Rente, UVG-Deckung und einen Lohn, der wegfällt. */
  const aktiv = ps.map((p, i) => p.brutto > 0 && alter[i] < E.refAlter(p));
  const ausgaben = typeof S.ausgabenHeute === 'number' && S.ausgabenHeute > 0 ? S.ausgabenHeute * 12 : 0;
  const bedarf = e.bedarfMonat > 0 ? e.bedarfMonat * 12 : ausgaben > 0 ? ausgaben : netto.reduce((x, v) => x + v, 0) * 0.8;
  const bedarfQuelle = e.bedarfMonat > 0 ? 'eingabe' : ausgaben > 0 ? 'ausgaben' : 'netto';
  const unfall = e.ursache === 'unfall';
  const faelle: Fall[] = [];

  ps.forEach((p, i) => {
    if (!aktiv[i]) return;
    const partner = paar ? 1 - i : -1;
    const rente = E.ahvMonat(p) * 12; // geschätzte volle Rente pro Jahr (ohne 13. Rente)
    const vV = Math.min(p.brutto, UVG_MAX_VERDIENST);
    const pk = e.pk[i] ?? PK_LEER;
    const lohnPartner: Posten[] = partner >= 0 && netto[partner] > 0 ? [{ label: `Nettolohn Person ${partner + 1}`, betrag: netto[partner], art: 'lohn' }] : [];

    // ---------- Invalidität ----------
    {
      const iv = rente, ivKinder = rente * ANTEILE.ivKind * abh;
      const uvg = unfall ? Math.max(0, Math.min(ANTEILE.uvgInvalid * vV, ANTEILE.komplementaer * vV - iv - ivKinder)) : 0;
      const pkSoll = pk.ivRente + pk.kinderRente * abh;
      const pkIst = Math.min(pkSoll, Math.max(0, ANTEILE.ueberentschaedigung * p.brutto - iv - ivKinder - uvg));
      const posten: Posten[] = [
        ...lohnPartner,
        { label: 'IV-Rente', betrag: iv, art: 'ahv' },
        ...(abh ? [{ label: `IV-Kinderrenten (${abh})`, betrag: ivKinder, art: 'ahv' as const }] : []),
        ...(unfall ? [{ label: 'UVG-Invalidenrente', betrag: uvg, art: 'uvg' as const }] : []),
        { label: 'Pensionskasse', betrag: pkIst, art: 'pk' },
      ];
      const summe = posten.reduce((x, q) => x + q.betrag, 0);
      const hinweise: string[] = [];
      if (pkSoll <= 0) hinweise.push('Keine Invalidenleistung der Pensionskasse erfasst (Vorsorgeausweis).');
      else if (pkIst < pkSoll - 1) hinweise.push('Die Pensionskassenleistung ist gekürzt: Zusammen mit den übrigen Renten gilt die Grenze von 90% des Lohns.');
      if (unfall && p.brutto > UVG_MAX_VERDIENST) hinweise.push('Der Lohn liegt über dem UVG-Höchstverdienst; der Teil darüber ist nur mit einer Zusatzversicherung gedeckt.');
      faelle.push({ person: i, ereignis: 'invalid', posten, summe, bedarf, luecke: bedarf - summe, kapital: 0, hinweise });
    }

    // ---------- Tod ----------
    if (paar || kinder > 0) {
      const h = partner >= 0 ? ps[partner] : null;
      const witweAb45 = !!h && h.geschlecht === 'w' && alter[partner] >= WITWE_AB;
      const imRentenalter = !!h && alter[partner] >= E.refAlter(h);
      // AHV (Art. 23, 24 AHVG, Übergangsregelung Witwer): Kinder gleich welchen Alters, sonst die Witwe ab 45.
      // Bezieht die hinterbliebene Person schon eine Altersrente, wird nur die höhere Rente ausgerichtet: nicht gerechnet.
      const anspruchAhv = verheiratet && !imRentenalter && (kinder > 0 || witweAb45);
      // UVG (Art. 29 Abs. 3): rentenberechtigte Kinder; die Witwe auch mit erwachsenen Kindern oder ab 45.
      const anspruchUvg = verheiratet && (abh > 0 || (!!h && h.geschlecht === 'w' && (kinder > 0 || witweAb45)));
      const witwe = anspruchAhv ? rente * ANTEILE.witwe : 0, waisen = rente * ANTEILE.waise * abh;
      let uvg = 0;
      if (unfall) {
        const soll = Math.min(ANTEILE.uvgMaxHinterlassene, (anspruchUvg ? ANTEILE.uvgEhegatte : 0) + ANTEILE.uvgHalbwaise * abh) * vV;
        uvg = Math.max(0, Math.min(soll, ANTEILE.komplementaer * vV - witwe - waisen));
      }
      const pkSoll = (h ? pk.partnerRente : 0) + pk.kinderRente * abh;
      const pkIst = Math.min(pkSoll, Math.max(0, ANTEILE.ueberentschaedigung * p.brutto - witwe - waisen - uvg));
      const posten: Posten[] = [
        ...lohnPartner,
        ...(h && verheiratet ? [{ label: h.geschlecht === 'w' ? 'AHV-Witwenrente' : 'AHV-Witwerrente', betrag: witwe, art: 'ahv' as const }] : []),
        ...(abh ? [{ label: `AHV-Waisenrenten (${abh})`, betrag: waisen, art: 'ahv' as const }] : []),
        ...(unfall ? [{ label: 'UVG-Hinterlassenenrenten', betrag: uvg, art: 'uvg' as const }] : []),
        { label: 'Pensionskasse', betrag: pkIst, art: 'pk' },
      ];
      const summe = posten.reduce((x, q) => x + q.betrag, 0);
      const hinweise: string[] = [];
      if (h && !verheiratet) hinweise.push('Im Konkubinat gibt es weder eine AHV- noch eine UVG-Rente für die Partnerin oder den Partner; die Pensionskasse zahlt nur, wenn das Reglement es vorsieht und die Begünstigung gemeldet ist.');
      else if (h && imRentenalter) hinweise.push('Die hinterbliebene Person hat das Referenzalter erreicht: Witwen- bzw. Witwerrente und eigene Altersrente werden nicht zusammen ausgerichtet. Ihre eigenen Renten und der Verwitwetenzuschlag sind hier nicht gerechnet.');
      else if (h && !anspruchAhv) hinweise.push(`Kein Anspruch auf eine AHV-${h.geschlecht === 'w' ? 'Witwenrente' : 'Witwerrente'} nach der vereinfachten Prüfung (keine Kinder${h.geschlecht === 'w' ? '; Witwe unter 45' : ''}).`);
      if (unfall && h && verheiratet && !anspruchUvg) hinweise.push(h.geschlecht === 'w' ? 'Keine UVG-Rente für die Witwe (keine Kinder, unter 45); sie erhält eine einmalige Abfindung, die hier nicht gerechnet ist.' : 'Keine UVG-Rente für den Witwer ohne rentenberechtigte Kinder.');
      if (pkSoll <= 0) hinweise.push('Keine Hinterlassenenleistung der Pensionskasse erfasst (Vorsorgeausweis).');
      faelle.push({ person: i, ereignis: 'tod', posten, summe, bedarf, luecke: bedarf - summe, kapital: pk.todesfallKapital, hinweise });
    }
  });
  return {
    bedarf, bedarfQuelle, faelle,
    hinweis: faelle.length ? '' : 'Keine Person des Haushalts ist heute erwerbstätig und vor dem Referenzalter. Invalidität und Tod während des Erwerbslebens lassen sich so nicht rechnen; die Renten im Ruhestand zeigt die Pensionierung.',
  };
}
