// Themenkarten: Katalog und Zustandsfunktionen. Reine Funktionen auf dem Zustand, ohne Oberfläche.
// Die Prüfregeln der Themen liegen allein in sanitize() (state.js); hier wird nichts davon wiederholt.

import type { Amortisation, Einkommen, PensState, Person, Thema, ThemaStatus, Wunsch, WunschTyp } from './typen';
import { VAR_FELDER, WTYP, LG_KARTEN, MAX_WUENSCHE, MAX_THEMEN, MAX_EINKOMMEN, MAX_AMORT, clone, karteVonWunsch, sanitize } from './state';

export { karteVonWunsch };

/** Karten-Definition: Wunschkarten tragen die Wunschart (typ), Feld- und Merkerkarten nicht. */
export type KartenArt = 'wunsch' | 'feld' | 'merker';
interface KarteBasis { titel: string; gruppe: string; braucht: string; hinweis?: string }
export type KarteDef = (KarteBasis & { art: 'wunsch'; typ: WunschTyp }) | (KarteBasis & { art: 'feld' | 'merker'; typ?: undefined });
/** Ziel einer Karte: Person, Liegenschaft, Stelle (Feld- und Merkerkarten) bzw. Wunsch. */
export interface KartenZiel { person?: 0 | 1; lg?: number; stelle?: string; w?: number }
/** Sichtbare Karte, wie karten() sie liefert. */
export interface KartenEintrag { key: string; karte: string | null; titel: string; status: ThemaStatus | 'gerechnet'; ziel: KartenZiel }
/** Werte einer Variante (nur die Schlüssel aus VAR_FELDER der Karte zählen). */
export type VariantenWerte = Record<string, number>;
/** Aufgelöster Schlüssel: Wunschkarte (Eintrag nur im Vergleich) oder Themeneintrag. */
export type KartenBezug =
  | { wunsch: Wunsch; i: number; karte: string | null; eintrag: Thema | null }
  | { wunsch?: undefined; i?: undefined; karte: string; eintrag: Thema };
/** Was die Themenkarten vom Rechenkern (createEngine) brauchen. */
export interface ThemenRechenkern {
  A0: number;
  abAlter(p: Person, jahre: number): number;
  pkBeiAlter(p: Person, a: number): { rente: number; kapital: number; fz: number; G: number; renteRech?: number; kapitalRech?: number };
  maxVorbezug(p: Person): number;
}


const HINWEIS_VERKAUF = 'Nach dem Verkauf bleiben die Wohnkosten so, wie sie in den Ausgaben erfasst sind. Eine Miete danach bitte gesondert erfassen. Die Grundstückgewinnsteuer ist nicht gerechnet. Das Alter ist jenes von Person 1.';
const HINWEIS_AUFHOEREN = 'Rente und Kapital der Pensionskasse werden für das andere Alter geschätzt, gleich wie beim Regler «früher aufhören». Nach dem Übernehmen bitte die Werte laut Ausweis der Pensionskasse nachtragen.';
const HINWEIS_TEIL = 'Mit Teilbezug schätzt PensCheck Teilrente und Teilkapital der Pensionskasse. Mit «weiter versichert» bleibt die Rente bei der Pensionierung unverändert; ein tieferer versicherter Lohn kann sie senken. Bitte bei der Pensionskasse nachfragen.';
const HINWEIS_WEITER = 'Gerechnet wird der Lohn ab der Pensionierung der Person, nach Sozialabgaben und Steuern. «bis Jahr» 0 heisst unbefristet. Ein bereits erfasster Nebenerwerb ab der Pensionierung wird durch den Wert der Variante ersetzt.';
const HINWEIS_AMORT = 'Bezahlt aus dem freien Vermögen. Ein Vorbezug aus der Säule 3a oder der Freizügigkeit lässt sich im Formular unter «Liegenschaft» erfassen.';
/** Zeile, die eine Karte angelegt hat: Ein neuer Vergleich ersetzt sie, statt eine weitere anzuhängen. */
/** Nebenerwerb ab der Pensionierung aus Karte oder geführtem Modus; eine von Hand umgestellte Zeile (andere Art, «ab heute») zählt nicht dazu. */
const istWeiter = (x: Einkommen, person: number) => (x.tkey === 'weiter' || x.tkey === 'neben') && x.art === 'nebenerwerb' && x.abPens !== false && (x.person || 0) === person;
export const zeileWeiter = (S: PensState, person: number): Einkommen | null => S.einkommen.find((x) => istWeiter(x, person)) || null;
const istAmort = (x: Amortisation, lg: number) => x.tkey === 'karte' && x.lg === lg && (x.quelle || 'frei') === 'frei';
export const zeileAmort = (S: PensState, lg: number): Amortisation | null => S.amortisationen.find((x) => istAmort(x, lg)) || null;

/** Alle Karten: Titel und «Braucht» wörtlich aus der Spec (6.3). art: Wunsch, Feld im Plan oder reiner Merker. */
export const KARTEN: Record<string, KarteDef> = {
  reisen: { titel: 'Mehr reisen', gruppe: 'leben', art: 'wunsch', typ: 'jahr', braucht: 'Betrag pro Jahr, von, bis' },
  anschaffung: { titel: 'Grössere Anschaffung', gruppe: 'leben', art: 'wunsch', typ: 'einmal', braucht: 'Betrag, Alter' },
  ausland: { titel: 'Zeitweise im Ausland', gruppe: 'leben', art: 'wunsch', typ: 'ausland', braucht: 'Monate pro Jahr u. a.' },
  pflege: { titel: 'Pflege und Gesundheit', gruppe: 'leben', art: 'wunsch', typ: 'jahr', braucht: 'Betrag pro Jahr, von, bis' },
  aufhoeren: { titel: 'Früher oder später aufhören', gruppe: 'arbeit', art: 'feld', braucht: 'Alter je Person', hinweis: HINWEIS_AUFHOEREN },
  teil: { titel: 'Teilpensionierung', gruppe: 'arbeit', art: 'feld', braucht: 'Pensum, ab Alter', hinweis: HINWEIS_TEIL },
  weiter: { titel: 'Weiterarbeiten danach', gruppe: 'arbeit', art: 'feld', braucht: 'Lohn pro Jahr, bis Jahr', hinweis: HINWEIS_WEITER },
  rentekapital: { titel: 'Rente oder Kapital', gruppe: 'vorsorge', art: 'feld', braucht: 'Rente und Kapital je Variante, laut Pensionskasse' },
  ahv: { titel: 'AHV vorbeziehen oder aufschieben', gruppe: 'vorsorge', art: 'feld', braucht: 'Jahre' },
  verkauf: { titel: 'Liegenschaft verkaufen', gruppe: 'wohnen', art: 'feld', braucht: 'Alter', hinweis: HINWEIS_VERKAUF },
  amort: { titel: 'Hypothek amortisieren', gruppe: 'wohnen', art: 'feld', braucht: 'Betrag, Jahr', hinweis: HINWEIS_AMORT },
  schenkung: { titel: 'Schenkung', gruppe: 'familie', art: 'wunsch', typ: 'einmal', braucht: 'Betrag, Alter' },
  erbschaft: { titel: 'Erbschaft erwartet', gruppe: 'familie', art: 'merker', braucht: 'nur vormerken, rechnet nicht mit' },
  hinterlassen: { titel: 'Etwas hinterlassen', gruppe: 'familie', art: 'wunsch', typ: 'ziel', braucht: 'Zielbetrag' },
  abklaeren: { titel: 'Noch abklären', gruppe: '', art: 'merker', braucht: 'Stelle: Pensionskasse, Ausgleichskasse, Bank, Steueramt' },
};

export const GRUPPEN: [id: string, titel: string][] = [['leben', 'Leben'], ['arbeit', 'Arbeit'], ['vorsorge', 'Vorsorge'], ['wohnen', 'Wohnen'], ['familie', 'Familie']];
export const STELLE_TXT: Record<string, string> = { pk: 'Pensionskasse', ak: 'Ausgleichskasse', bank: 'Bank', steueramt: 'Steueramt' };

const istWunschKarte = (karte: string) => KARTEN[karte]?.art === 'wunsch';

/** «w3» → { art: 'w', i: 3 } (Wunsch), «t2» → { art: 't', i: 2 } (Themeneintrag). */
function lesKey(key: string): { art: 'w' | 't'; i: number } | null {
  const m = /^([wt])(\d+)$/.exec(String(key));
  return m ? { art: m[1] as 'w' | 't', i: Number(m[2]) } : null;
}
const wunschEintrag = (S: Pick<PensState, 'themen'>, i: number) => S.themen.find((t) => t.w === i);
const gleichesZiel = (t: Thema, u: Thema) => t.karte === u.karte && t.person === u.person && t.lg === u.lg && t.stelle === u.stelle;
const nurVar = (karte: string, werte: VariantenWerte | null | undefined): VariantenWerte => {
  const out: VariantenWerte = {};
  for (const k of VAR_FELDER[karte] || []) if (werte && typeof werte[k] === 'number') out[k] = werte[k];
  return out;
};

/** Der Themeneintrag und die Karte zu einem Schlüssel; für Wunschkarten ist der Eintrag nur im Vergleich vorhanden. */
function aufloesen(S: Pick<PensState, 'wuensche' | 'themen'>, key: string): KartenBezug | null {
  const k = lesKey(key);
  if (!k) return null;
  if (k.art === 'w') {
    const wunsch = S.wuensche[k.i];
    if (!wunsch) return null;
    return { wunsch, i: k.i, karte: karteVonWunsch(wunsch), eintrag: wunschEintrag(S, k.i) || null };
  }
  const eintrag = S.themen[k.i];
  return eintrag ? { eintrag, karte: eintrag.karte } : null;
}

/** Alle sichtbaren Karten: erst die Wünsche, dann die Themeneinträge (Wunschkarten im Vergleich zählen nur als Wunsch). */
export function karten(S: PensState): KartenEintrag[] {
  const out = S.wuensche.map((w, i): KartenEintrag => {
    const karte = karteVonWunsch(w);
    const vergleich = !!wunschEintrag(S, i);
    return {
      key: `w${i}`, karte, titel: w.name || (karte ? KARTEN[karte].titel : WTYP[w.typ]),
      // ein Vergleich zeigt sich auch bei einem vorgemerkten Wunsch (der Wunsch bleibt dabei ausgeschaltet)
      status: vergleich ? 'vergleich' : w.aktiv === false ? 'vor' : 'gerechnet', ziel: { w: i },
    };
  });
  S.themen.forEach((t, i) => {
    if (istWunschKarte(t.karte)) return;
    const ziel: KartenZiel = {};
    for (const k of ['person', 'lg', 'stelle'] as const) if (t[k] != null) (ziel as Record<string, unknown>)[k] = t[k];
    out.push({ key: `t${i}`, karte: t.karte, titel: KARTEN[t.karte].titel, status: t.status, ziel });
  });
  return out;
}

/**
 * Name einer Karte (aus karten()) in Leiste, Editor, Vergleich, Aktionsplan und Bericht: Titel, bei Bedarf mit Stelle,
 * Person bzw. Liegenschaft. Rohtext; maskiert wird beim Einsetzen ins HTML.
 */
export function kartenName(S: PensState, k: Pick<KartenEintrag, 'titel'> & { ziel?: KartenZiel }): string {
  const z: KartenZiel = k.ziel || {};
  if (z.stelle) return `${k.titel}: ${STELLE_TXT[z.stelle]}`;
  if (z.person != null && S.haushalt !== 'single') return `${k.titel} (P${z.person + 1})`;
  if (z.lg != null && S.liegenschaften.length > 1) return `${k.titel} (${S.liegenschaften[z.lg]?.name || `Liegenschaft ${z.lg + 1}`})`;
  return k.titel;
}

/** Karte vormerken. Gibt den Schlüssel zurück, bei bereits vorhandener Feld-/Merkerkarte den des bestehenden Eintrags; null bei Grenze oder ungültigem Ziel. */
export function themaHinzu(S: PensState, karte: string, ziel: KartenZiel = {}): string | null {
  const def = KARTEN[karte];
  if (!def) return null;
  if (def.art === 'wunsch') {
    if (S.wuensche.length >= MAX_WUENSCHE) return null;
    S.wuensche.push({ typ: def.typ, karte, aktiv: false, name: '', ...(def.typ === 'ausland' ? { wohnform: 'miete' } : {}) });
    return `w${S.wuensche.length - 1}`;
  }
  const roh: Record<string, unknown> = { karte, status: 'vor' };
  for (const k of ['person', 'lg', 'stelle'] as const) if (ziel[k] != null) roh[k] = ziel[k];
  // Der Eintrag entsteht aus der Prüfung von sanitize: fremde Felder fallen weg, ein ungültiges Ziel ergibt null
  const gepr = sanitize({ ...S, themen: [roh] }).themen;
  if (gepr.length !== 1) return null;
  const eintrag = gepr[0];
  const vorhanden = S.themen.findIndex((t) => gleichesZiel(t, eintrag));
  if (vorhanden >= 0) return `t${vorhanden}`;
  if (S.themen.length >= MAX_THEMEN) return null;
  S.themen.push(eintrag);
  return `t${S.themen.length - 1}`;
}

/** Karte entfernen. Wunsch: löschen und Bezüge anpassen. Themeneintrag: löschen. Feldwerte im Plan bleiben. */
export function themaEntfernen(S: PensState, key: string): void {
  const k = lesKey(key);
  if (!k) return;
  if (k.art === 'w') {
    if (!S.wuensche[k.i]) return;
    S.wuensche.splice(k.i, 1);
    S.themen = S.themen.filter((t) => t.w !== k.i);
    S.themen.forEach((t) => { if (t.w! > k.i) t.w! -= 1; });
  } else if (S.themen[k.i]) {
    S.themen.splice(k.i, 1);
  }
}

/** Räumt die Themen nach einer Strukturänderung (Haushalt, Wünsche, Liegenschaften) mit den Regeln von sanitize auf. */
export function zielWeg(S: PensState): void {
  // Geprüfte Einträge gehen in die bisherigen Objekte zurück: Wer einen Eintrag festhält (offener Editor), behält
  // ihn; ein weggefallener Eintrag ist nicht mehr in der Liste
  const frei: (Thema | null)[] = [...S.themen];
  S.themen = sanitize({ ...S }).themen.map((g) => {
    const i = frei.findIndex((t) => t && (['karte', 'status', 'person', 'lg', 'stelle', 'w'] as const).every((k) => t[k] === g[k]));
    if (i < 0) return g;
    const o = frei[i]!;
    frei[i] = null;
    for (const k of Object.keys(o)) delete (o as unknown as Record<string, unknown>)[k];
    return Object.assign(o, g);
  });
}

/**
 * Eine Liegenschaft ist entfernt: ihre Karten und Amortisationen fallen weg, die Nummern der späteren rücken auf.
 * Die Liste der Liegenschaften darf dabei noch die alte oder schon die neue sein.
 */
export function liegenschaftEntfernt(S: PensState, k: number): void {
  S.themen = S.themen.filter((t) => !(LG_KARTEN.includes(t.karte) && t.lg === k));
  S.themen.forEach((t) => { if (LG_KARTEN.includes(t.karte) && t.lg! > k) t.lg! -= 1; });
  S.amortisationen = S.amortisationen.filter((x) => x.lg !== k).map((x) => ({ ...x, lg: x.lg > k ? x.lg - 1 : x.lg }));
  zielWeg(S);
}

/** Eine Liegenschaft ist an der Stelle k eingefügt: Karten und Amortisationen ab dieser Stelle rücken eine Nummer weiter. */
export function liegenschaftEingefuegt(S: PensState, k: number): void {
  S.themen.forEach((t) => { if (LG_KARTEN.includes(t.karte) && t.lg! >= k) t.lg! += 1; });
  S.amortisationen = S.amortisationen.map((x) => ({ ...x, lg: x.lg >= k ? x.lg + 1 : x.lg }));
  zielWeg(S);
}

/**
 * Anderes Pensionsalter: Rente, Kapital und Guthaben der Pensionskasse gelten laut Ausweis für das bisherige Alter und
 * werden für das neue geschätzt (pkBeiAlter des Rechenkerns, wie beim Regler «früher aufhören»).
 */
function pkNachfuehren(p: Person, alter: number, E: ThemenRechenkern): void {
  // ohne Rente und Kapital gibt es nichts nachzuführen (ein Guthaben allein rechnet nicht mit)
  if (!(p.pkRente > 0 || p.pkKapital > 0) || !(alter > 0) || alter === p.pensAlter) return;
  // bereits pensioniert oder neues Alter schon erreicht: Die laufende Leistung gilt, wie sie erfasst ist
  if (E.abAlter(p, p.pensAlter) <= E.A0 || E.abAlter(p, alter) <= E.A0) return;
  const neu = E.pkBeiAlter(p, alter);
  if (!(neu.G > 0)) return;
  // unter dem frühesten Pensionsalter der Kasse führt der Rechenkern das Guthaben als Freizügigkeit; gemerkt werden
  // die rechnerischen Werte, damit der Weg zurück wieder bei den Ausgangswerten ankommt
  const rente = neu.fz > 0 ? neu.renteRech! : neu.rente, kapital = neu.fz > 0 ? neu.kapitalRech! : neu.kapital;
  p.pkRente = p.pkRente > 0 ? Math.round(rente) : 0;
  p.pkKapital = Math.round(kapital);
  p.pkGuthabenPlan = Math.round(neu.G);
}

/**
 * Kopie des Zustands mit den Werten einer Variante; S bleibt unverändert. Mit dem Rechenkern E werden abhängige Werte
 * nachgeführt (Pensionskasse bei anderem Pensionsalter, Grenze des AHV-Vorbezugs).
 */
export function varianteAnwenden(S: PensState, key: string, werte: VariantenWerte | null | undefined, E?: ThemenRechenkern | null): PensState {
  const c = clone(S);
  const z = aufloesen(c, key);
  if (z && z.karte) {
    const v = nurVar(z.karte, werte);
    if (z.wunsch) {
      Object.assign(z.wunsch, v, { aktiv: true });
    } else if (['aufhoeren', 'teil', 'rentekapital', 'ahv'].includes(z.karte)) {
      const p = c.personen[z.eintrag.person!];
      if (E && z.karte === 'aufhoeren' && v.pensAlter != null) pkNachfuehren(p, v.pensAlter, E);
      // gerechnet wird höchstens der zulässige Vorbezug: Derselbe Wert steht nach dem Übernehmen im Plan
      if (E && z.karte === 'ahv' && typeof v.ahvBezug === 'number') v.ahvBezug = Math.max(v.ahvBezug, -E.maxVorbezug(p));
      Object.assign(p, v);
    } else if (z.karte === 'verkauf') {
      Object.assign(c.liegenschaften[z.eintrag.lg!], v);
    } else if (z.karte === 'weiter') {
      // Lohn nach der Pensionierung: eine Zeile je Person, die ein neuer Vergleich ersetzt (Betrag 0: keine Zeile)
      const alt = zeileWeiter(c, z.eintrag.person!);
      c.einkommen = c.einkommen.filter((x) => !istWeiter(x, z.eintrag.person!));
      // die Zeile aus dem geführten Modus bleibt dessen Zeile (dort weiter sichtbar und änderbar)
      if (v.betrag > 0) c.einkommen.push({ art: 'nebenerwerb', person: z.eintrag.person!, betrag: v.betrag, bisJahr: v.bisJahr, text: 'nach der Pensionierung', tkey: alt?.tkey || 'weiter', abPens: true });
    } else if (z.karte === 'amort') {
      c.amortisationen = c.amortisationen.filter((x) => !istAmort(x, z.eintrag.lg!));
      if (v.betrag > 0) c.amortisationen.push({ lg: z.eintrag.lg!, betrag: v.betrag, jahr: v.jahr, monat: v.monat, quelle: 'frei', tkey: 'karte' });
    }
  }
  // Ein offener Budget-Entwurf gehört zur Oberfläche und darf die Prüfung nicht beeinflussen
  delete c.ui.entwurf;
  const r = sanitize(c);
  r.ui = clone(S.ui);
  return r;
}

/** Der laufende Vergleich: { key, thema } oder null. */
export function vergleichAktiv(S: Pick<PensState, 'themen'>): { key: string; thema: Thema } | null {
  const i = S.themen.findIndex((t) => t.status === 'vergleich');
  if (i < 0) return null;
  const thema = S.themen[i];
  return { key: istWunschKarte(thema.karte) ? `w${thema.w}` : `t${i}`, thema };
}

/** Zustände der Varianten A und B des laufenden Vergleichs; leer, wenn keiner läuft. */
export function variantenZustaende(S: PensState, E?: ThemenRechenkern | null): PensState[] {
  const v = vergleichAktiv(S);
  return v ? [varianteAnwenden(S, v.key, v.thema.a, E), varianteAnwenden(S, v.key, v.thema.b, E)] : [];
}

/** Variante übernehmen: Werte in den Plan, Feldkarte «übernommen», Wunschkarte ohne Eintrag. */
export function uebernehmen(S: PensState, key: string, welche: string, E?: ThemenRechenkern | null): void {
  const z = aufloesen(S, key);
  if (!z || !z.eintrag || z.eintrag.status !== 'vergleich' || (welche !== 'a' && welche !== 'b')) return;
  const r = varianteAnwenden(S, key, z.eintrag[welche], E);
  for (const k of Object.keys(r)) if (k !== 'ui' && k !== 'themen') (S as unknown as Record<string, unknown>)[k] = (r as unknown as Record<string, unknown>)[k];
  if (z.wunsch) S.themen.splice(S.themen.indexOf(z.eintrag), 1);
  else { z.eintrag.status = 'ueber'; delete z.eintrag.a; delete z.eintrag.b; delete z.eintrag.ueber; }
}

/** Vergleich verwerfen: nichts im Plan ändern, Feldkarte zurück auf «vorgemerkt», bei einem Wunsch nur der Eintrag weg (der Wunsch bleibt, wie er war). Wirkt nur auf einen laufenden Vergleich. */
export function verwerfen(S: Pick<PensState, 'wuensche' | 'themen'>, key: string): void {
  const z = aufloesen(S, key);
  if (!z || !z.eintrag || z.eintrag.status !== 'vergleich') return;
  if (z.wunsch) {
    S.themen.splice(S.themen.indexOf(z.eintrag), 1);
  } else {
    // eine schon übernommene Karte bleibt «übernommen»: Ihr Wert steht weiterhin im Plan
    z.eintrag.status = z.eintrag.ueber ? 'ueber' : 'vor';
    delete z.eintrag.a; delete z.eintrag.b; delete z.eintrag.ueber;
  }
}

/**
 * Vergleich starten oder ersetzen; ein anderer laufender Vergleich wird zuvor verworfen. Gibt den (ggf. neuen)
 * Schlüssel zurück, sonst null. Geprüft wird auf einer Kopie der Themen: Scheitert etwas, bleibt S unverändert.
 * Gelingt es, gehen die geprüften Einträge in die bisherigen Objekte zurück (wie zielWeg), damit ein offener Editor
 * seinen Eintrag behält.
 */
export function vergleichStarten(S: PensState, key: string, a: VariantenWerte | null | undefined, b: VariantenWerte | null | undefined): string | null {
  const z = aufloesen(S, key);
  if (!z || !z.karte || !VAR_FELDER[z.karte]) return null;
  // Liste voll und keine eigene Zeile zum Ersetzen: Die Variante hätte keine Wirkung
  if (z.karte === 'weiter' && !zeileWeiter(S, z.eintrag!.person!) && S.einkommen.length >= MAX_EINKOMMEN) return null;
  if (z.karte === 'amort' && !zeileAmort(S, z.eintrag!.lg!) && S.amortisationen.length >= MAX_AMORT) return null;
  const herkunft = new Map<Thema, Thema>();
  const T = { ...S, themen: S.themen.map((t) => { const c = clone(t); herkunft.set(c, t); return c; }) };
  const zT = aufloesen(T, key)!;
  const laufend = vergleichAktiv(T);
  if (laufend && laufend.thema !== zT.eintrag) verwerfen(T, laufend.key);
  let eintrag: Thema | null | undefined = zT.wunsch ? wunschEintrag(T, zT.i) : zT.eintrag;
  if (!eintrag) {
    if (T.themen.length >= MAX_THEMEN) return null;
    eintrag = { karte: z.karte, status: 'vergleich', w: z.i };
    T.themen.push(eintrag);
  }
  const warUeber = eintrag.status === 'ueber' || eintrag.ueber === true;
  Object.assign(eintrag, { status: 'vergleich', a: nurVar(z.karte, a), b: nurVar(z.karte, b) });
  if (warUeber && !zT.wunsch) eintrag.ueber = true;
  // Werte der Varianten werden wie überall begrenzt: durch sanitize. Fehlt ein Wert, bleibt kein Vergleich übrig.
  const geprueft = sanitize({ ...T }).themen;
  if (geprueft.length !== T.themen.length || geprueft[T.themen.indexOf(eintrag)].status !== 'vergleich') return null;
  S.themen = geprueft.map((g, i) => {
    const o = herkunft.get(T.themen[i]);
    if (!o) return g;
    for (const k of Object.keys(o)) delete (o as unknown as Record<string, unknown>)[k];
    return Object.assign(o, g);
  });
  return z.wunsch ? `w${z.i}` : `t${S.themen.indexOf(herkunft.get(eintrag)!)}`;
}

/**
 * Was die Rechnung liest: der Stand ohne Bedienzustand, Haken des Aktionsplans und Angaben für den Bericht; aus ui nur
 * stopWer (wer im Was-wäre-wenn aufhört). Daraus entstehen der Auftrag an den Rechner (main.js) und vergleichSig: Ein
 * Feld, das keine Neuberechnung auslöst, gehört nicht hierher, sonst passt die Kennung nach einer Änderung nie mehr.
 */
export function rechenEingaben(S: PensState) {
  const { ui, aktion, bericht, ...plan } = S;
  return { ...plan, ui: { stopWer: ui?.stopWer } };
}

/** Eingaben der Rechnung, wie rechenEingaben() sie liefert. */
export type RechenEingaben = ReturnType<typeof rechenEingaben>;

/**
 * Kennung des laufenden Vergleichs samt allem, was die Rechnung liest (rechenEingaben), leer ohne Vergleich: zeigt,
 * ob R.varianten zu den angezeigten Werten und zum heutigen Plan gehört. Ändert sich der Plan, gilt die Vorschau als
 * unterwegs, bis die neue Rechnung da ist.
 */
export function vergleichSig(S: PensState): string {
  const v = vergleichAktiv(S);
  if (!v) return '';
  return JSON.stringify([v.key, rechenEingaben(S)]);
}
