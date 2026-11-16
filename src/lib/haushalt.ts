// ============================================================================
// haushalt.ts — gemeinsamer Haushalts-Stand (ADR-16, ADR-17, ADR-22).
// EIN Kundenfall pro Sitzung: Der Stand `haushalt` in bbzData speist Cockpit,
// Budget, Pensionierung, Lebensplan und die Fachmodule. Struktur und Pruefung
// stammen aus dem PensCheck (lib/pension/state.ts): Alles Fremde laeuft durch
// sanitize(). KEIN DOM-Zugriff ausser ueber BBZ (localStorage).
//
// Regeln (ADR-22):
// - Haushalt fuehrt: geteilte Groessen stehen nur hier; Module lesen und
//   schreiben sie, sie halten keine eigene Kopie als Quelle.
// - Stammdaten (Namen, Geburtsdaten) kommen aus dem Beratercockpit und werden
//   nachgefuehrt, sobald sie sich aendern.
// - Zwei Personen gibt es, wenn die Stammdaten eine zweite Person nennen ODER
//   im Cockpit ein Einkommen fuer Person 2 erfasst ist.
// ============================================================================
import { BBZ } from './data';
import type { SessionData } from './schema';
import { sanitize, decodeCode } from './pension/state';
import type { Haushalt, PensState } from './pension/typen';

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
/** Positiver Betrag; Zahlen und Zeichenketten wie «145'000» (aeltere Staende), sonst 0. */
const zahl = (v: unknown): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v.replace(/['’\s]/g, '').replace(',', '.')) : NaN;
  return isFinite(n) && n > 0 ? n : 0;
};
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Jahrgang und Geburtsmonat aus einem ISO-Datum (Stammdaten p1geb/p2geb); null, wenn nicht lesbar. */
function geburt(v: unknown): { jahrgang: number; geburtsmonat: number } | null {
  const m = typeof v === 'string' ? v.match(/^(\d{4})-(\d{2})/) : null;
  if (!m) return null;
  const monat = Number(m[2]);
  return monat >= 1 && monat <= 12 ? { jahrgang: Number(m[1]), geburtsmonat: monat } : null;
}

// ---------- Was das Cockpit ueber Einkommen und Ausgaben haelt ----------
export interface CockpitEinkommen {
  /** Bruttolohn pro Jahr je Person (0 = nicht erfasst). */
  brutto: [number, number];
  /** Nettoeinkommen pro Jahr je Person (0 = nicht erfasst). */
  netto: [number, number];
  geschlecht: [unknown, unknown];
  /** Ausgaben pro Monat: Haushalt + Leasing + Unterhalt + Uebrige. */
  ausgabenMonat: number;
}
/**
 * Liest Einkommen und Ausgaben aus `cockpit_data`. Aeltere Staende trugen den Lohn in eMann/eFrau mit dem
 * Einkommens-Typ «brutto»: Dann gelten diese Betraege als Bruttolohn und nicht als Netto.
 */
export function cockpitEinkommen(d: SessionData): CockpitEinkommen {
  const a = obj(obj(d.cockpit_data).ausgaben);
  const mult = a.freq === 'pa' ? 1 : 12;
  const alt = a.typ === 'brutto';
  const e = [zahl(a.eMann) * mult, zahl(a.eFrau) * mult];
  return {
    brutto: [zahl(a.brutto1) || (alt ? e[0] : 0), zahl(a.brutto2) || (alt ? e[1] : 0)],
    netto: [alt ? 0 : e[0], alt ? 0 : e[1]],
    geschlecht: [a.geschlecht1, a.geschlecht2],
    ausgabenMonat: zahl(a.haushalt) + zahl(a.leasing) + zahl(a.unterhalt) + zahl(a.uebrige),
  };
}

/** Nennen die Stammdaten eine zweite Person? */
const stammPaar = (d: SessionData): boolean => text(d.p2name) !== '';

/**
 * Erster Haushalts-Stand aus dem, was im Gespraech schon erfasst ist (Stammdaten, Finanz-Cockpit 05).
 * Uebernommen wird nur, was eindeutig ist; alles andere bleibt leer und wird im Modul erfasst:
 * - Zweite Person: laut Stammdaten oder weil das Cockpit ein Einkommen fuer Person 2 traegt.
 *   Der Zivilstand ist nicht erfasst; Annahme «verheiratet» (in der Pensionierung aenderbar).
 * - Geburtsdaten → Jahrgang und Geburtsmonat.
 * - Bruttolohn und Geschlecht je Person aus dem Cockpit (aus Netto laesst sich der Bruttolohn nicht ableiten).
 * - Zahlungsverkehr + Sparen → Liquiditaet, Anlagevolumen → Wertschriften, Ausgaben → Ausgaben heute.
 * - Saeule 3a und PK-Guthaben stehen im Cockpit als Summe des Haushalts; sie gehen an Person 1.
 */
export function haushaltAusSession(d: SessionData): PensState {
  const cd = obj(d.cockpit_data);
  const vorsorgen = obj(cd.vorsorgen);
  const ek = cockpitEinkommen(d);
  const paar = stammPaar(d) || ek.brutto[1] > 0 || ek.netto[1] > 0;
  const geb = [geburt(d.p1geb), geburt(d.p2geb)];
  const pk = zahl(d.cockpit_pk_saldo) || zahl(vorsorgen.pkSaldo);

  const personen = [0, 1].map((i) => ({
    ...(geb[i] ?? {}),
    ...(ek.brutto[i] ? { brutto: ek.brutto[i] } : {}),
    ...(ek.geschlecht[i] === 'm' || ek.geschlecht[i] === 'w' ? { geschlecht: ek.geschlecht[i] } : {}),
    ...(i === 0 && zahl(vorsorgen.s3Saldo) ? { s3a: zahl(vorsorgen.s3Saldo) } : {}),
    ...(i === 0 && pk ? { pkGuthabenHeute: pk } : {}),
  }));

  const liquiditaet = zahl(obj(cd.zahlen).saldo) + zahl(obj(cd.sparen).saldo);
  const wertschriften = zahl(obj(cd.anlegen).volumen);
  const kunde = [d.p1name, d.p2name].map(text).filter(Boolean).join(' & ');
  // «Eigene Angaben» nur, wenn aus der Session etwas uebernommen wurde
  // (das Geschlecht allein zaehlt nicht: Das Cockpit traegt dafuer immer eine Vorgabe)
  const edited = !!kunde || liquiditaet > 0 || wertschriften > 0 || ek.ausgabenMonat > 0 || personen.some((p) => Object.keys(p).some((k) => k !== 'geschlecht'));

  return sanitize({
    haushalt: paar ? 'verheiratet' : 'single',
    personen,
    liquiditaet,
    wertschriften,
    ...(ek.ausgabenMonat > 0 ? { ausgabenHeute: ek.ausgabenMonat } : {}),
    bericht: { kunde },
    ui: { edited, mode: 'form' },
  });
}

/**
 * Aktueller Haushalts-Stand: der gespeicherte (mit nachgefuehrten Stammdaten), sonst ein erster Stand aus
 * Stammdaten und Cockpit (nicht gespeichert). Es gibt keinen Uebungsfall: Der Stand ist immer der Kundenfall.
 */
export function haushaltLesen(): PensState {
  const d = BBZ.all();
  const H = d.haushalt ? stammdatenNachfuehren(sanitize(d.haushalt), d).H : haushaltAusSession(d);
  H.ui.practice = false;
  return H;
}

/**
 * Speichert den Haushalts-Stand; false, wenn der Speicher voll ist (ADR-14).
 * Mitgeschrieben werden der Merker der uebernommenen Stammdaten und die Prefills fuer 07a und 10
 * (`cockpit_einkommen`, `cockpit_pk_saldo`), damit sie nach einer Aenderung in einem anderen Modul nicht veralten.
 */
export function haushaltSchreiben(S: PensState): boolean {
  const d = BBZ.all();
  const H = sanitize(S);
  H.ui.practice = false;
  const alt = obj(d.haushalt_stamm) as Partial<StammStand>;
  const stamm: StammStand = { ...stammVon(d), paarArt: H.haushalt !== 'single' ? H.haushalt : alt.paarArt };
  return BBZ.merge({ haushalt: H, haushalt_stamm: stamm, ...prefills(d, H) });
}

/** Bruttoeinkommen des Haushalts pro Jahr und PK-Guthaben, wie 07a und 10 sie vorbelegen. */
export function prefills(d: SessionData, H: PensState): { cockpit_einkommen: number; cockpit_pk_saldo: number } {
  const ek = cockpitEinkommen(d), n = anzahl(H);
  // Je Person der Bruttolohn; fehlt er, das im Cockpit erfasste Nettoeinkommen (wie bisher, bis der Bruttolohn erfasst ist)
  const einkommen = [0, 1].slice(0, n).reduce((x, i) => x + (H.personen[i].brutto > 0 ? H.personen[i].brutto : ek.netto[i]), 0);
  return { cockpit_einkommen: Math.round(einkommen), cockpit_pk_saldo: gemeinsamAusHaushalt(H).pk };
}

/**
 * Vorbelegungen fuer 07a, 07b und 10, immer aus dem aktuellen Stand gerechnet (ADR-22, Regeln 2 und 3): Die
 * gespeicherten Schluessel `cockpit_einkommen`, `cockpit_pk_saldo` und `cockpit_anlage_f` koennen veralten, wenn
 * sich die Stammdaten oder der Stand in einem anderen Modul aendern.
 * anlageFaehig: Liquiditaet abzueglich der im Cockpit erfassten Reserve.
 */
export function vorbelegung(): { einkommen: number; pkSaldo: number; anlageFaehig: number; verpflichtungen: number } {
  const d = BBZ.all(), H = haushaltLesen();
  const p = prefills(d, H);
  const reserve = zahl(obj(obj(d.cockpit_data).sparen).reserve);
  const anlage = Math.max(0, Math.round(H.liquiditaet - reserve));
  // Ohne gespeicherten Haushalts-Stand (ältere Sitzung, Cockpit seit der Umstellung nicht besucht) gelten die
  // Schlüssel, die das Cockpit damals geschrieben hat; sie können dann nicht veraltet sein.
  // Verpflichtungen pro Jahr: Leasing und Unterhalt aus dem Cockpit (Monatsbeträge)
  const a = obj(obj(d.cockpit_data).ausgaben);
  const verpflichtungen = Math.round((zahl(a.leasing) + zahl(a.unterhalt)) * 12);
  if (!d.haushalt) return { einkommen: zahl(d.cockpit_einkommen) || p.cockpit_einkommen, pkSaldo: zahl(d.cockpit_pk_saldo) || p.cockpit_pk_saldo, anlageFaehig: zahl(d.cockpit_anlage_f) || anlage, verpflichtungen: zahl(d.cockpit_verpflichtungen) || verpflichtungen };
  return { einkommen: p.cockpit_einkommen, pkSaldo: p.cockpit_pk_saldo, anlageFaehig: anlage, verpflichtungen };
}

/**
 * Nach dem Einlesen eines fremden Stands: Was im Cockpit nur zum bisherigen Fall gehoerte, entfaellt — das
 * Nettoeinkommen und die Gliederung der Ausgaben samt Verpflichtungen (Leasing, Unterhalt). Der Bruttolohn und
 * die Ausgaben kommen aus dem eingelesenen Stand; das Cockpit gliedert sie beim naechsten Besuch neu.
 */
export function cockpitNettoLoeschen(): void {
  const d = BBZ.all(), cd = obj(d.cockpit_data), a = obj(cd.ausgaben);
  BBZ.merge({
    ...(d.cockpit_data ? { cockpit_data: { ...cd, ausgaben: { ...a, eMann: 0, eFrau: 0, haushalt: 0, leasing: 0, unterhalt: 0, uebrige: 0 } } } : {}),
    cockpit_verpflichtungen: 0,
  });
}

/**
 * Liest einen im oeffentlichen PensCheck erfassten Stand: Link («…#angaben=CODE»), blosser Code oder JSON-Stand.
 * Der Inhalt ist fremd und wird vollstaendig geprueft. Wirft bei unlesbarem Inhalt.
 */
export function haushaltImport(eingabe: string): PensState {
  const t = eingabe.trim();
  const link = t.match(/#angaben=([\w-]+)/);
  if (link) return decodeCode(link[1]);
  if (t.startsWith('{')) {
    const o = obj(JSON.parse(t));
    if (!Array.isArray(o.personen)) throw new Error('ungültig');
    return sanitize(o);
  }
  return decodeCode(t);
}

// ---------- Cockpit 05 ↔ Haushalt: «Haushalt fuehrt» ----------
// Das Cockpit haelt Details, die der Haushalts-Stand nicht kennt (Bank, Anzahl Konten, Kommentare, Aufteilung
// Zahlungsverkehr/Sparen, Gliederung der Ausgaben). Die gemeinsamen Groessen stehen nur im Haushalts-Stand;
// das Cockpit liest sie beim Oeffnen und schreibt sie beim Uebernehmen eines Modals zurueck.

/** Die Groessen, die Cockpit und Haushalts-Stand teilen (Summen ueber den Haushalt). */
export interface Gemeinsam {
  /** Rechnet der Haushalt mit zwei Personen? */
  paar: boolean;
  /** Zahlungsverkehr + Sparen. */
  liquiditaet: number;
  /** Anlagevolumen. */
  wertschriften: number;
  /** Saeule 3a, Summe der Personen. */
  s3a: number;
  /** Pensionskassen-Guthaben heute, Summe der Personen (0 = nicht erfasst). */
  pk: number;
  /** Bruttolohn pro Jahr je Person (Person 2: 0 bei einer Einzelperson). */
  brutto: [number, number];
  geschlecht: ['m' | 'w', 'm' | 'w'];
  /** Heutige Ausgaben pro Monat (0 = nicht erfasst). */
  ausgabenHeute: number;
}

const anzahl = (H: PensState): number => (H.haushalt === 'single' ? 1 : 2);
const zahlLeer = (v: number | ''): number => (typeof v === 'number' ? v : 0);

/** Liest die gemeinsamen Groessen aus dem Haushalts-Stand. Bei Einzelpersonen zaehlt nur Person 1. */
export function gemeinsamAusHaushalt(H: PensState): Gemeinsam {
  const ps = H.personen.slice(0, anzahl(H));
  return {
    paar: anzahl(H) === 2,
    liquiditaet: H.liquiditaet,
    wertschriften: H.wertschriften,
    s3a: ps.reduce((x, p) => x + p.s3a, 0),
    pk: ps.reduce((x, p) => x + zahlLeer(p.pkGuthabenHeute), 0),
    brutto: [H.personen[0].brutto, anzahl(H) === 2 ? H.personen[1].brutto : 0],
    geschlecht: [H.personen[0].geschlecht, H.personen[1].geschlecht],
    ausgabenHeute: zahlLeer(H.ausgabenHeute),
  };
}

/**
 * Schreibt die gemeinsamen Groessen in den Haushalts-Stand (neuer, geprüfter Stand).
 * - `g.paar`: Traegt das Cockpit ein Einkommen fuer Person 2, wird aus einer Einzelperson ein Paar
 *   (Annahme «verheiratet»). Umgekehrt macht das Cockpit aus einem Paar nie eine Einzelperson.
 * - Summen ueber zwei Personen (3a, PK): Die Aufteilung aus der Pensionierung bleibt, solange die Summe auf den
 *   Franken stimmt. Aendert das Cockpit die Summe, geht die Differenz an Person 1; reicht das nicht, sinkt Person 2.
 */
export function gemeinsamInHaushalt(H0: PensState, g: Gemeinsam): PensState {
  const H: PensState = g.paar && H0.haushalt === 'single' ? { ...H0, haushalt: 'verheiratet' } : H0;
  const n = anzahl(H);
  // Wird hier aus der Einzelperson ein Paar, hat das Cockpit die Summen der Einzelperson gezeigt: Verglichen und
  // geteilt wird wie bei einer Person; die bisher verborgenen Werte von Person 2 bleiben und kommen dazu.
  const nSumme = anzahl(H0);
  const alt = gemeinsamAusHaushalt(H0);
  const personen = H.personen.map((p) => ({ ...p }));
  const teile = (summe: number, p2: number): [number, number] => (nSumme === 1 ? [summe, p2] : summe >= p2 ? [summe - p2, p2] : [0, summe]);
  const gleich = (a: number, b: number): boolean => Math.round(a) === Math.round(b);
  if (!gleich(g.s3a, alt.s3a)) {
    const [a, b] = teile(Math.max(0, g.s3a), personen[1].s3a);
    personen[0].s3a = a;
    if (nSumme === 2) personen[1].s3a = b;
  }
  if (!gleich(g.pk, alt.pk)) {
    const [a, b] = teile(Math.max(0, g.pk), zahlLeer(personen[1].pkGuthabenHeute));
    personen[0].pkGuthabenHeute = a > 0 ? a : '';
    if (nSumme === 2) personen[1].pkGuthabenHeute = b > 0 ? b : '';
  }
  personen[0].brutto = g.brutto[0];
  personen[0].geschlecht = g.geschlecht[0];
  if (n === 2) { personen[1].brutto = g.brutto[1]; personen[1].geschlecht = g.geschlecht[1]; }
  return sanitize({
    ...H,
    personen,
    liquiditaet: g.liquiditaet,
    wertschriften: g.wertschriften,
    ausgabenHeute: g.ausgabenHeute > 0 ? g.ausgabenHeute : '',
    ui: { ...H.ui, edited: true },
  });
}

// ---------- Stammdaten → Haushalt ----------
/** Was aus den Stammdaten zuletzt in den Haushalts-Stand uebernommen wurde (Schluessel `haushalt_stamm`). */
interface StammStand {
  p1geb: string; p2geb: string; paar: boolean; kunde: string;
  /** Letzter Paar-Zivilstand des Stands: Faellt die zweite Person weg und kommt wieder, gilt er erneut. */
  paarArt?: Haushalt;
}
const stammVon = (d: SessionData): StammStand => ({
  p1geb: text(d.p1geb),
  p2geb: text(d.p2geb),
  paar: stammPaar(d),
  kunde: [d.p1name, d.p2name].map(text).filter(Boolean).join(' & '),
});

/**
 * Fuehrt geaenderte Stammdaten (Namen, Geburtsdaten, zweite Person) in einem gespeicherten Haushalts-Stand nach.
 * Uebernommen wird nur, was sich in den Stammdaten seit der letzten Uebernahme geaendert hat — eine Anpassung im
 * Modul Pensionierung (z. B. Jahrgang) bleibt sonst stehen. Liefert den Stand und ob er sich geaendert hat.
 */
export function stammdatenNachfuehren(H: PensState, d: SessionData): { H: PensState; geaendert: boolean } {
  return anwenden(H, d, obj(d.haushalt_stamm) as Partial<StammStand>);
}

/**
 * Wendet die Stammdaten auf einen fremden Stand an (PensCheck-Import): Was das Beratercockpit kennt, gilt.
 * Geburtsdaten und Kundenname werden uebernommen; nennen die Stammdaten eine zweite Person, wird aus einer
 * Einzelperson ein Paar. Bringt der Import eine zweite Person mit, die den Stammdaten fehlt, bleibt sie.
 */
export function stammdatenAnwenden(H: PensState, d: SessionData): PensState {
  // Ohne zweite Person in den Stammdaten bleibt der Haushalt des Imports, wie er ist
  return anwenden(H, d, { paar: stammPaar(d) ? H.haushalt !== 'single' : false }).H;
}

function anwenden(H: PensState, d: SessionData, alt: Partial<StammStand>): { H: PensState; geaendert: boolean } {
  const neu = stammVon(d);
  const roh: { personen: Record<string, unknown>[]; haushalt: Haushalt; bericht: { kunde: string; datum: string; berater: string } } = {
    personen: H.personen.map((p) => ({ ...p })), haushalt: H.haushalt, bericht: { ...H.bericht },
  };
  let geaendert = false;
  ([['p1geb', 0], ['p2geb', 1]] as const).forEach(([k, i]) => {
    const g = geburt(neu[k]);
    if (g && neu[k] !== alt[k] && (roh.personen[i].jahrgang !== g.jahrgang || roh.personen[i].geburtsmonat !== g.geburtsmonat)) {
      Object.assign(roh.personen[i], g);
      geaendert = true;
    }
  });
  if (alt.paar !== undefined && neu.paar !== alt.paar) {
    // Zweite Person kommt dazu: der fruehere Paar-Zivilstand gilt wieder, sonst die Annahme «verheiratet».
    // Zweite Person faellt weg: Einzelperson.
    const soll: Haushalt = neu.paar ? (H.haushalt !== 'single' ? H.haushalt : alt.paarArt && alt.paarArt !== 'single' ? alt.paarArt : 'verheiratet') : 'single';
    if (soll !== roh.haushalt) { roh.haushalt = soll; geaendert = true; }
  }
  // Der Kundenname folgt den Stammdaten, auch wenn sie geleert werden
  if (neu.kunde !== alt.kunde && roh.bericht.kunde !== neu.kunde) { roh.bericht.kunde = neu.kunde; geaendert = true; }
  return { H: geaendert ? sanitize({ ...H, ...roh }) : H, geaendert };
}
