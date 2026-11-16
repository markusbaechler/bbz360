// Zustand der Eingaben: Musterfall, Prüfung und Migration fremder oder älterer Stände, Speicherung im Browser, Eingaben-Code.
// Alles, was von aussen kommt (Link, Browserspeicher), läuft durch sanitize(): Nur bekannte Felder mit geprüftem
// Typ und Wertebereich gelangen in den Zustand. Freitext (Namen, Bezeichnungen) bleibt Text und wird bei der
// Ausgabe maskiert (esc).

import grundlagen from '../../../public/data/params.json';
import { valueFor } from './params';
import type { Amortisation, Anlage, Einkommen, Liegenschaft, NumLeer, PensState, PensUi, Person, Thema, Wunsch } from './typen';

/** Ungeprüfter Eingang (Link, Browserspeicher, ältere Stände): beliebige Felder, erst sanitize() prüft sie. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Roh = Record<string, any>;
/** Wertebereich eines Zahlenfelds: [min, max, ganzzahlig]; max null = zur Laufzeit bestimmt (Jahrgang). */
export type Limit = [min: number, max: number | null, int?: boolean];
/** Werte der Varianten A und B eines Vergleichs. */
/** Der Musterfall trägt kein eigenes Budget; die drei Felder ergänzt sanitize() (wie im Original). */
type Musterfall = Omit<PensState, 'budget' | 'budgetAktiv' | 'budgetBasis'>;
type Varianten = { a: Record<string, number>; b: Record<string, number> };

export const STORAGE_KEY = 'penscheck-v1';

export const KANTONE = ['AG', 'AI', 'AR', 'BE', 'BL', 'BS', 'FR', 'GE', 'GL', 'GR', 'JU', 'LU', 'NE', 'NW', 'OW', 'SG', 'SH', 'SO', 'SZ', 'TG', 'TI', 'UR', 'VD', 'VS', 'ZG', 'ZH'];
const ANLAGEN: Anlage[] = ['konto', 'vorsichtig', 'ausgewogen', 'dynamisch'];
const FIX_KEYS = ['wohnen', 'kk', 'vers', 'komm', 'geb', 'mob', 'ges', 'sonst'];
const BUDGET_KEYS = ['wohnen', 'kk', 'haushalt', 'mob', 'vers', 'freizeit', 'pers', 'rueck'];

// Formularmodus «Bühne»: Schritte, Ansichten und Themenkarten
export const SCHRITT_IDS = ['situation', 'einkommen', 'vermoegen', 'liegenschaft', 'urteil', 'vergleich', 'ansatz', 'aktion'];
export const ANSICHT_IDS = ['bild', 'ablauf', 'jahre', 'kapital', 'bilanz', 'fix', 'wuensche', 'hinweise'];
export const KARTE_IDS = ['reisen', 'anschaffung', 'ausland', 'pflege', 'aufhoeren', 'teil', 'weiter', 'rentekapital', 'ahv', 'verkauf', 'amort', 'schenkung', 'erbschaft', 'hinterlassen', 'abklaeren'];
/** Karten, die einen Wunsch (S.wuensche) bearbeiten. */
export const WUNSCH_KARTEN = ['reisen', 'anschaffung', 'ausland', 'pflege', 'schenkung', 'hinterlassen'];
/** Bezeichnung der Wunscharten. */
export const WTYP = { ausland: 'Zeitweise im Ausland', jahr: 'Wiederkehrend', einmal: 'Einmalig', ziel: 'Vermögensziel' };
export const STELLEN = ['pk', 'ak', 'bank', 'steueramt'];
/** Je Karte die erlaubten Schlüssel einer Variante (a, b) im Vergleich. */
export const VAR_FELDER: Record<string, string[]> = {
  reisen: ['betrag', 'von', 'bis'], pflege: ['betrag', 'von', 'bis'],
  anschaffung: ['betrag', 'alter'], schenkung: ['betrag', 'alter'],
  ausland: ['monate', 'von', 'bis'], hinterlassen: ['betrag'],
  aufhoeren: ['pensAlter'], teil: ['teilAb', 'teilPensum'], weiter: ['betrag', 'bisJahr'],
  rentekapital: ['pkRente', 'pkKapital'], ahv: ['ahvBezug'], verkauf: ['verkaufAlter'], amort: ['betrag', 'jahr', 'monat'],
};
// Karten, die sich auf eine Person, eine Liegenschaft bzw. einen Wunsch beziehen
export const PERSON_KARTEN = ['aufhoeren', 'teil', 'weiter', 'rentekapital', 'ahv'];
export const LG_KARTEN = ['verkauf', 'amort'];
/** Höchstzahl der Zeilen je Liste; eine Quelle für Prüfung (sanitize), Karten und Meldungen. */
/** bbz360 (ADR-19): Höchstzahl der Zuflüsse. */
export const MAX_ZUFLUESSE = 20;
export const MAX_WUENSCHE = 20, MAX_THEMEN = 30, MAX_EINKOMMEN = 20, MAX_AMORT = 30;
// Merkerkarten rechnen nicht mit und kennen nur den Zustand «vorgemerkt»
const MERKER_KARTEN = ['erbschaft', 'abklaeren'];
// Wünsche aus dem Tutor tragen keine Karte, aber eine Kennung
const TKEY_KARTE: Record<string, string> = { reisen: 'reisen', auto: 'anschaffung', ausland: 'ausland', erbe: 'hinterlassen' };

/** Kartenart eines Wunsches: gemerkte Karte, sonst aus der Kennung des Tutors, sonst null. */
export const karteVonWunsch = (w: Pick<Wunsch, 'karte' | 'tkey'>): string | null => w.karte || TKEY_KARTE[w.tkey!] || null;

/** Jüngster zulässiger Jahrgang: heute 18 Jahre alt. */
export const jgMax = () => new Date().getFullYear() - 18;

/**
 * Wertebereiche der Zahlenfelder, nach Feldname (letzter Teil des Pfads): [min, max, ganzzahlig].
 * Gilt für Formular, Tutor und für Stände aus Link oder Speicher.
 */
export const LIMITS: Record<string, Limit> = {
  jahrgang: [1920, null, true], geburtsmonat: [1, 12, true], pensAlter: [55, 70, true], minAlter: [50, 70],
  brutto: [0, 1e8], pkRente: [0, 1e8], pkKapital: [0, 1e9], pkGuthabenHeute: [0, 1e9], pkGuthabenPlan: [0, 1e9], pkFrist: [0, 120],
  s3a: [0, 1e8], s3aEinz: [0, 1e5], fz: [0, 1e9], ahvBetrag: [0, 1e4], ahvFehlJahre: [0, 44], ahvBezug: [-3, 5, true],
  teilAb: [0, 70, true], teilPensum: [0, 100],
  liquiditaet: [0, 1e10], wertschriften: [0, 1e10], kontoZins: [-5, 20], zins3aKonto: [-5, 20], renditeOverride: [-10, 20],
  ausgabenRuhestand: [0, 1e6], ausgabenHeute: [0, 1e6], reduktion75: [0.5, 1],
  inflation: [-5, 20], ahvAnpassung: [-5, 20], horizontEigen: [70, 110, true], steuerEink: [0, 60], steuerVerm: [0, 20], ertragSteuerbar: [0, 100], reserveJahre: [0, 20], tragGrenze: [10, 60],
  // Liegenschaften, Amortisationen
  verkehrswert: [0, 1e9], hypothek: [0, 1e9], zins: [0, 20], unterhalt: [0, 10], nebenkosten: [0, 1e5], mietertrag: [0, 1e8], verkaufAlter: [0, 120],
  jahr: [1990, 2150, true], monat: [1, 12, true],
  // Einkommen, Wünsche
  betrag: [0, 1e9], bisJahr: [0, 2150, true], von: [0, 120], bis: [0, 120], alter: [0, 120], monate: [0, 12],
  preisniveau: [0, 500], anteilVariabel: [0, 100], reise: [0, 1e7], miete: [0, 1e6], kaufpreis: [0, 1e9], laufend: [0, 20],
  wochen: [0, 52], preisWoche: [0, 1e6], verwaltung: [0, 100], mietSteuer: [0, 100],
};
// Kaufnebenkosten eines Wunsches sind Prozent, Nebenkosten einer Liegenschaft CHF pro Monat
const LIMITS_WUNSCH: Record<string, Limit> = { nebenkosten: [0, 50] };
const DEFAULT_LIMIT: Limit = [0, 1e9];

/** Wertebereich eines Felds; scope 'w' = Wunsch. */
export function limitFor(key: string, scope?: string) {
  const l = (scope === 'w' && LIMITS_WUNSCH[key]) || LIMITS[key] || (FIX_KEYS.includes(key) || BUDGET_KEYS.includes(key) ? ([0, 1e6] as Limit) : DEFAULT_LIMIT);
  return { min: l[0], max: (key === 'jahrgang' ? jgMax() : l[1]) as number, int: !!l[2] };
}
/** Zahl für Meldungen: mit Tausendertrennung, grosse Werte in Millionen oder Milliarden. */
const zahlTxt = (v: number) => (Math.abs(v) >= 1e9 ? `${v / 1e9} Mrd` : Math.abs(v) >= 1e6 ? `${v / 1e6} Mio` : Math.abs(v) < 10000 ? String(v) : String(v).replace(/\B(?=(\d{3})+(?!\d))/g, '’'));
/** Prüft eine eingegebene Zahl gegen den Wertebereich; liefert null oder einen Fehlertext. */
export function rangeError(key: string, v: NumLeer | null | undefined, scope?: string): string | null {
  if (v === '' || v == null) return null;
  const { min, max, int } = limitFor(key, scope);
  if (int && !Number.isInteger(v)) return 'Bitte eine ganze Zahl eingeben.';
  if (v < min || v > max) return `Erlaubt sind Werte von ${zahlTxt(min)} bis ${zahlTxt(max)}.`;
  return null;
}

/** Höchstbetrag der Säule 3a mit Pensionskasse im laufenden Jahr, aus den geprüften Grundlagen. */
const S3A_MAX = valueFor(grundlagen.params['s3a.maxMitPK'], new Date().getFullYear())!.value;
const person = (o: Partial<Person>): Person => ({
  jahrgang: 1970, geburtsmonat: 6, geschlecht: 'm', pensAlter: 65, brutto: 0,
  pkRente: 0, pkKapital: 0, pkGuthabenHeute: '', pkGuthabenPlan: '', minAlter: 58, pkFrist: '',
  s3a: 0, s3aModus: 'max', s3aEinz: S3A_MAX, s3aAnlage: 'konto', fz: 0, fzAnlage: 'konto',
  ahvModus: 'schaetzung', ahvBetrag: '', ahvFehlJahre: 0, ahvBezug: 0,
  teilAb: 0, teilPensum: 60, teilPK: 'teilbezug',
  ...o,
});

const UI0: PensUi = { leiste: 'auf', schritt: 'situation', besucht: {}, ansicht: 'bild', jview: 'alle', edited: false, open: {}, stopM: null, stopY: null, tutorStep: 'start', tutorMax: 0, practice: false };
// Annahmen, die für jeden Stand gelten, solange nichts anderes erfasst ist
const ANNAHMEN = { kontoZins: 0, zins3aKonto: 0.5, anlageprofil: 'ausgewogen', renditeOverride: '', reduktion75: 0.9, inflation: 1, ahvAnpassung: 0.3, horizontModus: 'le5', horizontEigen: 95, steuerEink: 12, steuerVerm: '', ertragSteuerbar: 50, reserveJahre: 2, tragGrenze: 35 } as const;

/** Neutrale Grundwerte: Fehlt in einem Stand ein Feld, wird es hieraus ergänzt (nie aus dem Musterfall). */
const neutral = (): PensState => ({
  haushalt: 'verheiratet', kanton: 'ZH',
  personen: [person({ geschlecht: 'm' }), person({ geschlecht: 'w' })],
  liquiditaet: 0, wertschriften: 0, ausgabenRuhestand: 0, ausgabenHeute: '', fix: {}, budget: {}, budgetAktiv: false, budgetBasis: '',
  liegenschaften: [], amortisationen: [], einkommen: [], wuensche: [], themen: [],
  ...ANNAHMEN,
  bericht: { kunde: '', datum: '', berater: '' },
  aktion: {},
  ui: { ...UI0, besucht: {}, open: {} },
});

export const EXAMPLE = {
  haushalt: 'verheiratet',
  kanton: 'ZH',
  personen: [
    person({ jahrgang: 1972, geburtsmonat: 6, geschlecht: 'm', pensAlter: 58, brutto: 160000, pkRente: 30153, pkKapital: 238000, s3a: 49000, fz: 1300000, fzAnlage: 'dynamisch', pkGuthabenPlan: 695000 }),
    person({ jahrgang: 1970, geburtsmonat: 6, geschlecht: 'w', pensAlter: 60, brutto: 45000, pkRente: 6953, s3a: 49000, pkGuthabenPlan: 200000 }),
  ],
  liquiditaet: 100000, wertschriften: 300000, kontoZins: 0, zins3aKonto: 0.5,
  anlageprofil: 'ausgewogen', renditeOverride: '',
  ausgabenRuhestand: 10000, ausgabenHeute: '', reduktion75: 0.9, fix: {},
  liegenschaften: [{ name: 'Eigenheim', typ: 'eigen', verkehrswert: 1600000, hypothek: 900000, zins: 1.8, unterhalt: 0.5, nebenkosten: 400, mietertrag: 0, verkaufAlter: 0 }],
  amortisationen: [], einkommen: [],
  // tkey: Der Wunsch erscheint im Tutor unter «Zeit im Süden»
  wuensche: [{ typ: 'ausland', tkey: 'ausland', aktiv: true, name: 'Griechenland', monate: 4, von: 58, bis: 80, wohnform: 'miete', preisniveau: 55, anteilVariabel: 35, reise: 1500, miete: 1200, kaufpreis: 250000, nebenkosten: 5.5, laufend: 1.5, wochen: 12, preisWoche: 800, verwaltung: 25, mietSteuer: 20, verkaufAlter: 0 }],
  inflation: 1, ahvAnpassung: 0.3, horizontModus: 'le5', horizontEigen: 95, steuerEink: 12, steuerVerm: '', ertragSteuerbar: 50, reserveJahre: 2, tragGrenze: 35,
  // datum leer = Datum des Tages, an dem der Bericht erstellt wird
  bericht: { kunde: '', datum: '', berater: '' },
  // Aktionsplan: erledigte Aufgaben (id → 1); reist mit dem Link mit
  aktion: {},
  themen: [],
  ui: { ...UI0, besucht: {} },
} satisfies Musterfall as Musterfall as PensState;

export const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));

// ---------- Prüfung von Werten ----------
const isObj = (o: unknown): o is Roh => !!o && typeof o === 'object' && !Array.isArray(o);
/** Zahl im Wertebereich des Felds; ungültig → def. */
function num<const D>(v: unknown, key: string, def: D, scope?: string): number | D {
  if (typeof v === 'string') v = v.trim() === '' ? NaN : Number(v);
  if (typeof v !== 'number' || !isFinite(v)) return def;
  const { min, max, int } = limitFor(key, scope);
  if (int) v = Math.round(v);
  return Math.min(max, Math.max(min, v as number));
}
/** Zahl oder leer (Felder, die leer «automatisch» bzw. «unbekannt» bedeuten). */
const numOrEmpty = (v: unknown, key: string, scope?: string): NumLeer => (v === '' || v == null ? '' : num(v, key, '', scope));
const oneOf = <const T, const D>(v: unknown, list: readonly T[], def: D): T | D => (list.includes(v as T) ? (v as T) : def);
/** Freitext: nur Zeichenketten, ohne Steuerzeichen, begrenzte Länge. */
const text = (v: unknown, max = 60) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max) : '');
const bool = (v: unknown, def = false) => (typeof v === 'boolean' ? v : def);
const list = (v: unknown, max: number): Roh[] => (Array.isArray(v) ? v.filter(isObj).slice(0, max) : []);

function cleanPerson(o: Roh | undefined, d: Person): Person {
  o = isObj(o) ? o : {};
  const p = {} as Person;
  for (const k of ['jahrgang', 'geburtsmonat', 'pensAlter', 'brutto', 'pkRente', 'pkKapital', 'minAlter', 's3a', 's3aEinz', 'fz', 'ahvFehlJahre', 'ahvBezug', 'teilAb', 'teilPensum'] as const) p[k] = num(o[k], k, d[k]);
  for (const k of ['pkGuthabenHeute', 'pkGuthabenPlan', 'pkFrist', 'ahvBetrag'] as const) p[k] = numOrEmpty(o[k], k);
  p.geschlecht = oneOf(o.geschlecht, ['m', 'w'], d.geschlecht);
  // ältere Stände ohne Modus: aus dem Betrag ableiten
  p.s3aModus = oneOf(o.s3aModus, ['max', 'eigen'], o.s3aEinz != null && p.s3aEinz < S3A_MAX ? 'eigen' : 'max');
  p.s3aAnlage = oneOf(o.s3aAnlage, ANLAGEN, d.s3aAnlage);
  p.fzAnlage = oneOf(o.fzAnlage, ANLAGEN, d.fzAnlage);
  p.ahvModus = oneOf(o.ahvModus, ['schaetzung', 'betrag'], d.ahvModus);
  p.teilPK = oneOf(o.teilPK, ['teilbezug', 'weiter'], d.teilPK);
  return p;
}
function cleanLg(l: Roh): Liegenschaft {
  const typ = oneOf(l.typ, ['eigen', 'ferien', 'rendite'], 'eigen');
  return {
    name: text(l.name), typ,
    verkehrswert: num(l.verkehrswert, 'verkehrswert', 0), hypothek: num(l.hypothek, 'hypothek', 0), zins: num(l.zins, 'zins', 0),
    unterhalt: num(l.unterhalt, 'unterhalt', typ === 'eigen' ? 0.5 : 1), nebenkosten: num(l.nebenkosten, 'nebenkosten', 400),
    mietertrag: num(l.mietertrag, 'mietertrag', 0), verkaufAlter: num(l.verkaufAlter, 'verkaufAlter', 0),
    // bbz360 (ADR-19): Kauf in der Zukunft; die Felder gibt es nur, wenn sie gesetzt sind (sonst bleibt der Stand wie im PensCheck)
    ...(num(l.kaufAlter, 'verkaufAlter', 0) > 0 ? { kaufAlter: num(l.kaufAlter, 'verkaufAlter', 0) } : {}),
    ...(num(l.kaufFremd, 'betrag', 0) > 0 ? { kaufFremd: num(l.kaufFremd, 'betrag', 0) } : {}),
    ...(num(l.kaufMieteWeg, 'nebenkosten', 0) > 0 ? { kaufMieteWeg: num(l.kaufMieteWeg, 'nebenkosten', 0) } : {}),
  };
}
function cleanWunsch(w: Roh): Wunsch | null {
  const typ = oneOf(w.typ, ['ausland', 'jahr', 'einmal', 'ziel'], null);
  if (!typ) return null;
  const out: Wunsch = { typ, aktiv: w.aktiv !== false, name: text(w.name) };
  if (['reisen', 'auto', 'ausland', 'erbe'].includes(w.tkey)) out.tkey = w.tkey;
  if (WUNSCH_KARTEN.includes(w.karte)) out.karte = w.karte;
  if (typ === 'ausland') out.wohnform = oneOf(w.wohnform, ['miete', 'kauf'], 'miete');
  // nur erfasste Zahlen übernehmen; für fehlende gelten die Richtwerte des Rechenkerns (W_DEF)
  for (const k of ['betrag', 'von', 'bis', 'alter', 'monate', 'preisniveau', 'anteilVariabel', 'reise', 'miete', 'kaufpreis', 'nebenkosten', 'laufend', 'wochen', 'preisWoche', 'verwaltung', 'mietSteuer', 'verkaufAlter'] as const) {
    if (w[k] != null && w[k] !== '') { const v = num(w[k], k, null, 'w'); if (v != null) out[k] = v; }
  }
  return out;
}

/**
 * Themenkarte prüfen; null, wenn Karte, Zustand oder Ziel (Person, Liegenschaft, Wunsch) nicht gültig sind.
 * Auch die Bedeutung zählt: Ein Vergleich braucht eine Karte mit Varianten und vollständige Werte für A und B, und es
 * gibt höchstens einen (laeuft: ein früherer Eintrag ist schon im Vergleich); sonst fällt eine Feldkarte auf
 * «vorgemerkt» zurück, ein Wunscheintrag fällt weg.
 * Merkerkarten sind immer «vorgemerkt»; ein Wunscheintrag zeigt auf einen Wunsch seiner Kartenart.
 */
function cleanThema(t: Roh, s: PensState, laeuft: boolean): Thema | null {
  const karte = oneOf(t.karte, KARTE_IDS, null);
  let status = oneOf(t.status, ['vor', 'vergleich', 'ueber'], null);
  if (!karte || !status) return null;
  if (MERKER_KARTEN.includes(karte)) status = 'vor';
  let ab: Varianten | null = null;
  if (status === 'vergleich') {
    ab = VAR_FELDER[karte] && !laeuft ? varianten(t, karte) : null;
    if (!ab) {
      if (WUNSCH_KARTEN.includes(karte)) return null;
      status = t.ueber === true ? 'ueber' : 'vor';
    }
  }
  const out: Thema = { karte, status };
  if (status === 'vergleich' && t.ueber === true && !WUNSCH_KARTEN.includes(karte)) out.ueber = true;
  if (PERSON_KARTEN.includes(karte)) {
    if (t.person !== 0 && t.person !== 1) return null;
    if (t.person === 1 && s.haushalt === 'single') return null;
    out.person = t.person;
  }
  if (LG_KARTEN.includes(karte)) {
    if (!Number.isInteger(t.lg) || t.lg < 0 || t.lg >= s.liegenschaften.length) return null;
    out.lg = t.lg;
  }
  if (WUNSCH_KARTEN.includes(karte)) {
    // ein vorgemerkter Wunsch ist ein Wunsch mit aktiv: false und braucht keinen Eintrag
    if (status !== 'vergleich' || !Number.isInteger(t.w) || t.w < 0 || t.w >= s.wuensche.length) return null;
    if (karteVonWunsch(s.wuensche[t.w]) !== karte) return null;
    out.w = t.w;
  }
  if (karte === 'abklaeren') {
    if (!STELLEN.includes(t.stelle)) return null;
    out.stelle = t.stelle;
  }
  if (ab) Object.assign(out, ab);
  return out;
}
/** Werte A und B eines Vergleichs, begrenzt wie überall; null, wenn für eine Seite ein Wert der Karte fehlt. */
function varianten(t: Roh, karte: string): Varianten | null {
  const out = {} as Varianten;
  for (const v of ['a', 'b'] as const) {
    const q = isObj(t[v]) ? t[v] : {};
    out[v] = {};
    for (const k of VAR_FELDER[karte]) { const z = num(q[k], k, null); if (z == null) return null; out[v][k] = z; }
  }
  return out;
}

/**
 * Bringt einen beliebigen (fremden, älteren oder unvollständigen) Stand in die aktuelle Struktur.
 * Unbekannte Felder fallen weg, Zahlen werden auf ihren Wertebereich begrenzt, Fehlendes neutral ergänzt.
 */
export function sanitize(input: unknown): PensState {
  const o: Roh = isObj(input) ? input : {};
  const d = neutral();
  const s = {} as PensState;
  s.haushalt = oneOf(o.haushalt, ['single', 'verheiratet', 'konkubinat'], d.haushalt);
  s.kanton = oneOf(o.kanton, KANTONE, d.kanton);
  const ps = Array.isArray(o.personen) ? o.personen : [];
  s.personen = [0, 1].map((i) => cleanPerson(ps[i], d.personen[i])) as [Person, Person];
  // frühere Struktur: nur «vermoegen» → als Wertschriften übernehmen
  const alt = o.vermoegen != null && o.liquiditaet == null;
  s.liquiditaet = alt ? 0 : num(o.liquiditaet, 'liquiditaet', 0);
  s.wertschriften = num(alt ? o.vermoegen : o.wertschriften, 'wertschriften', 0);
  for (const k of ['kontoZins', 'zins3aKonto', 'ausgabenRuhestand', 'reduktion75', 'inflation', 'ahvAnpassung', 'horizontEigen', 'steuerEink', 'ertragSteuerbar', 'reserveJahre', 'tragGrenze'] as const) s[k] = num(o[k], k, d[k]);
  // steuerVerm leer = Tarif des Kantonshauptorts; eine Zahl = eigener Satz in Promille
  for (const k of ['renditeOverride', 'ausgabenHeute', 'steuerVerm'] as const) s[k] = numOrEmpty(o[k], k);
  s.anlageprofil = oneOf(o.anlageprofil, ['vorsichtig', 'ausgewogen', 'dynamisch'], d.anlageprofil);
  s.horizontModus = oneOf(o.horizontModus, ['le5', 'le', '95', 'eigen'], d.horizontModus);
  s.fix = {};
  if (isObj(o.fix)) for (const k of FIX_KEYS) { const v = numOrEmpty(o.fix[k], k); if (v !== '') s.fix[k] = v; }
  // Eigenes Budget: gilt nur, wenn alle Positionen ausser Wohnen erfasst sind
  s.budget = {};
  if (isObj(o.budget)) for (const k of BUDGET_KEYS) { const v = numOrEmpty(o.budget[k], k); if (v !== '') s.budget[k] = v; }
  s.budgetAktiv = bool(o.budgetAktiv) && BUDGET_KEYS.slice(1).every((k) => s.budget[k] != null);
  // Beispiel, von dem das Budget ausgeht (nur Anzeige)
  s.budgetBasis = Object.keys(s.budget).length ? oneOf(o.budgetBasis, ['bescheiden', 'mittel', 'gehoben'], '') : '';
  s.liegenschaften = list(o.liegenschaften, 10).map(cleanLg);
  s.amortisationen = list(o.amortisationen, MAX_AMORT).filter((x) => x.jahr > 0).map((x): Amortisation => ({
    lg: Number.isInteger(x.lg) ? x.lg : -1, betrag: num(x.betrag, 'betrag', 0), jahr: num(x.jahr, 'jahr', 2030), monat: num(x.monat, 'monat', 1),
    quelle: oneOf(x.quelle, ['frei', '3a0', '3a1', 'fz0', 'fz1'], 'frei'), ...(x.tkey === 'karte' ? { tkey: 'karte' } : {}),
  })).filter((x) => x.lg >= 0 && x.lg < s.liegenschaften.length);
  s.einkommen = list(o.einkommen, MAX_EINKOMMEN).map((x): Einkommen => ({
    person: x.person === 1 ? 1 : 0, art: oneOf(x.art, ['dividende', 'nebenerwerb', 'spesen', 'sonstiges'], 'sonstiges'),
    betrag: num(x.betrag, 'betrag', 0), bisJahr: num(x.bisJahr, 'bisJahr', 0), text: text(x.text), ...(x.tkey === 'neben' || x.tkey === 'weiter' ? { tkey: x.tkey } : {}),
    // Nebenerwerb erst ab der Pensionierung; die Frage im geführten Modus («nach der Pensionierung dazuverdienen») meint das immer
    // «ab heute» von Hand gewählt (abPens: false) bleibt; fehlt die Angabe (älterer Stand), gilt «ab Pensionierung»
    ...(x.art !== 'nebenerwerb' ? {} : x.abPens === true ? { abPens: true } : x.tkey === 'neben' || x.tkey === 'weiter' ? { abPens: x.abPens !== false } : {}),
  }));
  s.wuensche = list(o.wuensche, MAX_WUENSCHE).map(cleanWunsch).filter(Boolean) as Wunsch[];
  // bbz360 (ADR-19): Zuflüsse; der Schlüssel fehlt, solange keine erfasst sind (Stand bleibt wie im PensCheck)
  const zf = list(o.zufluesse, MAX_ZUFLUESSE).map((z) => ({ name: text(z.name), betrag: num(z.betrag, 'betrag', 0), jahr: num(z.jahr, 'jahr', 0) })).filter((z) => z.betrag > 0 && z.jahr > 0);
  if (zf.length) s.zufluesse = zf;
  // Feld- und Merkerkarten gibt es je Ziel nur einmal (die erste bleibt); Wunschkarten dürfen mehrfach vorkommen.
  // Der erste gültige Vergleich bleibt; spätere fallen zurück bzw. weg (cleanThema).
  const gesehen = new Set<string>();
  let laeuft = false;
  s.themen = [];
  for (const t of list(o.themen, 30)) {
    const g = cleanThema(t, s, laeuft);
    if (!g) continue;
    if (!WUNSCH_KARTEN.includes(g.karte)) {
      const k = `${g.karte}|${g.person ?? ''}|${g.lg ?? ''}|${g.stelle ?? ''}`;
      if (gesehen.has(k)) continue;
      gesehen.add(k);
    }
    if (g.status === 'vergleich') laeuft = true;
    s.themen.push(g);
  }
  const b = isObj(o.bericht) ? o.bericht : {};
  s.bericht = { kunde: text(b.kunde, 80), datum: text(b.datum, 40), berater: text(b.berater, 80) };
  s.aktion = {};
  if (isObj(o.aktion)) Object.keys(o.aktion).slice(0, 200).forEach((k) => { if (o.aktion[k] && k.length <= 160) s.aktion[k] = 1; });
  // Oberfläche: nur bekannte Schalter
  const u = isObj(o.ui) ? o.ui : {};
  const ui: PensUi = { ...UI0, besucht: {}, open: {} };
  ui.schritt = oneOf(u.schritt, SCHRITT_IDS, 'situation');
  ui.ansicht = oneOf(u.ansicht, ANSICHT_IDS, 'bild');
  ui.leiste = oneOf(u.leiste, ['auf', 'zu'], 'auf');
  if (isObj(u.besucht)) SCHRITT_IDS.forEach((k) => { if (u.besucht[k]) ui.besucht[k] = true; });
  ui.jview = oneOf(u.jview, ['alle', 'fix'], 'alle');
  ui.edited = bool(u.edited);
  ui.practice = bool(u.practice);
  if (isObj(u.open)) Object.keys(u.open).slice(0, 40).forEach((k) => { if (/^\w{1,30}$/.test(k)) ui.open[k] = !!u.open[k]; });
  ui.stopY = Number.isInteger(u.stopY) && u.stopY >= 2000 && u.stopY <= 2200 ? u.stopY : null;
  ui.stopM = ui.stopY && Number.isInteger(u.stopM) && u.stopM >= 1 && u.stopM <= 12 ? u.stopM : null;
  if (!ui.stopM) ui.stopY = null;
  if (u.stopWer === 0 || u.stopWer === 1 || u.stopWer === 'alle') ui.stopWer = u.stopWer;
  ui.tutorStep = typeof u.tutorStep === 'string' && /^\w{1,20}$/.test(u.tutorStep) ? u.tutorStep : 'start';
  ui.tutorMax = Number.isInteger(u.tutorMax) ? Math.min(99, Math.max(0, u.tutorMax)) : 0;
  // Modus: neue Nutzende starten im Tutor, bestehende Stände im Formular
  ui.mode = oneOf(u.mode, ['tutor', 'form'], ui.edited ? 'form' : 'tutor');
  if (u.twohnen === 'eigen' || u.twohnen === 'miete') ui.twohnen = u.twohnen;
  for (const k of ['tkap0', 'tkap1', 't3a0', 't3a1', 'datumSet'] as const) if (typeof u[k] === 'boolean') ui[k] = u[k];
  // Zeitpunkt der letzten Änderung (für den Hinweis auf alte gespeicherte Angaben)
  if (Number.isFinite(u.savedAt) && u.savedAt > 0) ui.savedAt = u.savedAt;
  // Offener Budget-Entwurf (Stand vor dem Öffnen des Assistenten): Beim Laden eines Stands ist der Assistent zu.
  // Ein nicht übernommener Entwurf gilt dann als verworfen: Budget, Grundlage und Miete gelten wie vor dem Öffnen.
  // So bleibt nach Neuladen, Schliessen oder in einem zweiten Fenster kein halber Entwurf zurück.
  if (isObj(u.entwurf) && !s.budgetAktiv) {
    const e = u.entwurf, b: Record<string, number> = {};
    if (isObj(e.budget)) for (const k of BUDGET_KEYS) { const v = numOrEmpty(e.budget[k], k); if (v !== '') b[k] = v; }
    s.budget = b;
    s.budgetBasis = Object.keys(b).length ? oneOf(e.basis, ['bescheiden', 'mittel', 'gehoben'], '') : '';
    const eigenheim = s.liegenschaften.some((l) => (l.typ || 'eigen') === 'eigen' && l.verkehrswert > 0);
    const miete = numOrEmpty(e.miete, 'wohnen');
    if (eigenheim || miete === '') delete s.fix.wohnen;
    else s.fix.wohnen = miete;
  }
  // Gesprächsdatum nur behalten, wenn es von Hand erfasst wurde (sonst gilt das Datum des Berichts)
  if (!ui.datumSet) s.bericht.datum = '';
  s.ui = ui;
  return s;
}

/** Bringt einen (auch älteren oder unvollständigen) Stand in die aktuelle Struktur. */
export const migrate = (o: unknown): PensState => sanitize(o);

/** Leerer Stand: alles auf 0, wichtige Abschnitte offen. */
export function emptyState(): PensState {
  const e = sanitize({});
  e.personen.forEach((p) => { p.geburtsmonat = 1; });
  Object.assign(e.ui, { edited: true, open: { haushalt: true, personen: true, einkommen: true, lohn: true, ahv: true, pk: true, s3a: true, vermoegen: true } });
  return e;
}

/** Eigene Angaben vorhanden, die beim Ersetzen verloren gingen? Der unveränderte Musterfall zählt nicht dazu. */
export const hatEigenes = (S: PensState) => !!S.ui.edited && !S.ui.practice;
/**
 * Eine Eingabe von Hand: Der Stand gilt als bearbeitet, und der Übungsmodus endet. Ab jetzt sind es eigene Angaben,
 * vor deren Ersetzen nachgefragt wird (auch wenn mit dem Beispiel begonnen wurde).
 */
export function markEdited(S: PensState) {
  S.ui.edited = true;
  S.ui.practice = false;
  S.ui.savedAt = Date.now();
}

/** Die Angaben ohne Zustand der Oberfläche, in fester Form (beide Seiten laufen durch dieselbe Prüfung). */
export const nurAngaben = (S: PensState) => { const { ui, ...rest } = sanitize(clone(S)); return JSON.stringify(rest); };
/**
 * Stand aus einem anderen Fenster desselben Browsers: Liefert den zu übernehmenden Stand oder null, wenn sich nur
 * die Oberfläche unterscheidet (Register, Regler, aufgeklappte Abschnitte, Tutor-Schritt). Übernommen werden die
 * Angaben; die eigene Ansicht bleibt.
 */
export function uebernehmeFremd(eigen: PensState, fremd: PensState): PensState | null {
  if (nurAngaben(fremd) === nurAngaben(eigen)) return null;
  const { entwurf, ...eigenUi } = eigen.ui;
  return { ...fremd, ui: { ...eigenUi, edited: fremd.ui.edited, practice: fremd.ui.practice, savedAt: fremd.ui.savedAt, datumSet: fremd.ui.datumSet } };
}

export function load(): PensState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return sanitize(JSON.parse(raw));
  } catch { /* privater Modus, gesperrter oder beschädigter Speicher */ }
  return sanitize(clone(EXAMPLE));
}

/** Speichert den Stand; liefert false, wenn der Browser das Speichern verweigert. */
export function save(S: PensState): boolean {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(S)); return true; } catch { return false; }
}

// ---------- Eingaben-Code (Base64url von JSON) ----------
/** Obergrenze für die Länge eines Eingaben-Codes (ein voller Stand braucht wenige Tausend Zeichen). */
export const CODE_MAX = 60000;
const b64e = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64d = (c: string) => {
  const s = c.trim().replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '==='.slice((s.length + 3) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
};

export function encodeCode(S: PensState): string {
  const { ui, ...rest } = S;
  // Das Gesprächsdatum reist nur mit, wenn es von Hand erfasst wurde
  return b64e(JSON.stringify({ v: 1, ...rest, bericht: { ...rest.bericht, datum: ui && ui.datumSet ? rest.bericht.datum : '' } }));
}

/** Liest einen Eingaben-Code. Der Inhalt ist fremd: Er wird vollständig geprüft, Schalter der Oberfläche fallen weg. */
export function decodeCode(code: unknown): PensState {
  if (typeof code !== 'string' || code.length > CODE_MAX) throw new Error('ungültig');
  const o = JSON.parse(b64d(code));
  if (!isObj(o) || !Array.isArray(o.personen)) throw new Error('ungültig');
  const datumSet = isObj(o.bericht) && typeof o.bericht.datum === 'string' && o.bericht.datum.trim() !== '';
  return sanitize({ ...o, ui: { datumSet } });
}

/** Einfacher Pfadzugriff «personen.0.brutto». */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getPath = (S: object, path: string): any => path.split('.').reduce((o: any, k) => (o == null ? o : o[k]), S);
export const setPath = (S: object, path: string, v: unknown) => {
  const ks = path.split('.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let o: any = S;
  ks.slice(0, -1).forEach((k) => { if (o[k] == null) o[k] = {}; o = o[k]; });
  o[ks[ks.length - 1]] = v;
};
