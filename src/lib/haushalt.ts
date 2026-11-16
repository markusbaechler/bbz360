// ============================================================================
// haushalt.ts — gemeinsamer Haushalts-Stand (Zielbild Fusion, Phase 1).
// Ein einziger Stand `haushalt` in bbzData speist Pensionierung, Budget und
// den Lebensplan. Struktur und Pruefung stammen aus dem PensCheck
// (lib/pension/state.ts): Alles Fremde laeuft durch sanitize().
// KEIN DOM-Zugriff ausser ueber BBZ (localStorage).
// ============================================================================
import { BBZ } from './data';
import type { SessionData } from './schema';
import { sanitize, decodeCode } from './pension/state';
import type { PensState } from './pension/typen';

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const zahl = (v: unknown): number => (typeof v === 'number' && isFinite(v) && v > 0 ? v : 0);

/** Jahrgang und Geburtsmonat aus einem ISO-Datum (Stammdaten p1geb/p2geb); null, wenn nicht lesbar. */
function geburt(v: unknown): { jahrgang: number; geburtsmonat: number } | null {
  const m = typeof v === 'string' ? v.match(/^(\d{4})-(\d{2})/) : null;
  if (!m) return null;
  const monat = Number(m[2]);
  return monat >= 1 && monat <= 12 ? { jahrgang: Number(m[1]), geburtsmonat: monat } : null;
}

/**
 * Erster Haushalts-Stand aus dem, was im Gespraech schon erfasst ist (Stammdaten, Finanz-Cockpit 05).
 * Uebernommen wird nur, was eindeutig ist; alles andere bleibt leer und wird im Modul erfasst:
 * - Zwei Namen → Paar. Der Zivilstand ist in den Stammdaten nicht erfasst; Annahme «verheiratet».
 * - Geburtsdaten → Jahrgang und Geburtsmonat.
 * - Bruttolohn und Geschlecht je Person aus dem Cockpit (aus Netto laesst sich der Bruttolohn nicht ableiten).
 * - Zahlungsverkehr + Sparen → Liquiditaet, Anlagevolumen → Wertschriften.
 * - Saeule 3a und PK-Guthaben stehen im Cockpit als Summe des Haushalts; sie gehen an Person 1.
 */
export function haushaltAusSession(d: SessionData): PensState {
  const cd = obj(d.cockpit_data);
  const ausgaben = obj(cd.ausgaben), vorsorgen = obj(cd.vorsorgen);
  const paar = typeof d.p2name === 'string' && d.p2name.trim() !== '';
  const mult = ausgaben.freq === 'pa' ? 1 : 12;
  // Seit Phase 4 erfasst das Cockpit den Bruttolohn pro Jahr eigens (brutto1/brutto2); aeltere Staende
  // trugen ihn in eMann/eFrau, sofern der Einkommens-Typ «brutto» gewaehlt war.
  const altBrutto = ausgaben.typ === 'brutto';
  const lohn = [
    zahl(ausgaben.brutto1) || (altBrutto ? zahl(ausgaben.eMann) * mult : 0),
    zahl(ausgaben.brutto2) || (altBrutto ? zahl(ausgaben.eFrau) * mult : 0),
  ];
  const geschlecht = [ausgaben.geschlecht1, ausgaben.geschlecht2];
  const geb = [geburt(d.p1geb), geburt(d.p2geb)];
  const pk = zahl(d.cockpit_pk_saldo) || zahl(vorsorgen.pkSaldo);

  const personen = [0, 1].map((i) => ({
    ...(geb[i] ?? {}),
    ...(lohn[i] ? { brutto: lohn[i] } : {}),
    ...(geschlecht[i] === 'm' || geschlecht[i] === 'w' ? { geschlecht: geschlecht[i] } : {}),
    ...(i === 0 && zahl(vorsorgen.s3Saldo) ? { s3a: zahl(vorsorgen.s3Saldo) } : {}),
    ...(i === 0 && pk ? { pkGuthabenHeute: pk } : {}),
  }));

  const liquiditaet = zahl(obj(cd.zahlen).saldo) + zahl(obj(cd.sparen).saldo);
  const wertschriften = zahl(obj(cd.anlegen).volumen);
  const kunde = [d.p1name, d.p2name].filter((n) => typeof n === 'string' && n.trim()).join(' & ');
  // «Eigene Angaben» (Rueckfrage vor dem Ersetzen) nur, wenn aus der Session etwas uebernommen wurde
  const edited = !!kunde || liquiditaet > 0 || wertschriften > 0 || personen.some((p) => Object.keys(p).length > 0);

  return sanitize({
    haushalt: paar ? 'verheiratet' : 'single',
    personen,
    liquiditaet,
    wertschriften,
    bericht: { kunde },
    ui: { edited, mode: 'form' },
  });
}

/** Aktueller Haushalts-Stand: der gespeicherte, sonst ein erster Stand aus Stammdaten und Cockpit (nicht gespeichert). */
export function haushaltLesen(): PensState {
  const d = BBZ.all();
  if (!d.haushalt) return haushaltAusSession(d);
  return stammdatenNachfuehren(sanitize(d.haushalt), d).H;
}

/** Speichert den Haushalts-Stand; false, wenn der Speicher voll ist (ADR-14). */
export function haushaltSchreiben(S: PensState): boolean {
  // Mit dem Stand wird festgehalten, welche Stammdaten er schon kennt (stammdatenNachfuehren).
  return BBZ.merge({ haushalt: sanitize(S), haushalt_stamm: stammVon(BBZ.all()) });
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

// ---------- Cockpit 05 ↔ Haushalt: «Haushalt fuehrt» (Phase 4) ----------
// Das Cockpit haelt Details, die der Haushalts-Stand nicht kennt (Bank, Anzahl Konten, Kommentare, Aufteilung
// Zahlungsverkehr/Sparen). Die gemeinsamen Groessen stehen nur im Haushalts-Stand; das Cockpit liest sie beim
// Oeffnen und schreibt sie beim Uebernehmen eines Modals zurueck.

/** Die Groessen, die Cockpit und Haushalts-Stand teilen (Summen ueber den Haushalt). */
export interface Gemeinsam {
  /** Zahlungsverkehr + Sparen. */
  liquiditaet: number;
  /** Anlagevolumen. */
  wertschriften: number;
  /** Saeule 3a, Summe der Personen. */
  s3a: number;
  /** Pensionskassen-Guthaben heute, Summe der Personen (0 = nicht erfasst). */
  pk: number;
  /** Bruttolohn pro Jahr je Person. */
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
 * Schreibt die gemeinsamen Groessen in den Haushalts-Stand (neuer, gepruefter Stand).
 * Summen ueber zwei Personen (3a, PK): Die Aufteilung aus dem Modul Pensionierung bleibt, solange die Summe
 * stimmt. Aendert das Cockpit die Summe, geht die Differenz an Person 1; reicht das nicht, sinkt Person 2.
 */
export function gemeinsamInHaushalt(H: PensState, g: Gemeinsam): PensState {
  const n = anzahl(H);
  const alt = gemeinsamAusHaushalt(H);
  const personen = H.personen.map((p) => ({ ...p }));
  const teile = (summe: number, p2: number): [number, number] => (n === 1 ? [summe, p2] : summe >= p2 ? [summe - p2, p2] : [0, summe]);
  if (g.s3a !== alt.s3a) {
    const [a, b] = teile(Math.max(0, g.s3a), personen[1].s3a);
    personen[0].s3a = a;
    if (n === 2) personen[1].s3a = b;
  }
  if (g.pk !== alt.pk) {
    const [a, b] = teile(Math.max(0, g.pk), zahlLeer(personen[1].pkGuthabenHeute));
    personen[0].pkGuthabenHeute = a > 0 ? a : '';
    if (n === 2) personen[1].pkGuthabenHeute = b > 0 ? b : '';
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
interface StammStand { p1geb: string; p2geb: string; paar: boolean; kunde: string }
const stammVon = (d: SessionData): StammStand => ({
  p1geb: typeof d.p1geb === 'string' ? d.p1geb : '',
  p2geb: typeof d.p2geb === 'string' ? d.p2geb : '',
  paar: typeof d.p2name === 'string' && d.p2name.trim() !== '',
  kunde: [d.p1name, d.p2name].filter((x) => typeof x === 'string' && x.trim()).join(' & '),
});

/**
 * Fuehrt geaenderte Stammdaten (Namen, Geburtsdaten, zweite Person) in einem gespeicherten Haushalts-Stand nach.
 * Uebernommen wird nur, was sich in den Stammdaten seit der letzten Uebernahme geaendert hat — eine Anpassung im
 * Modul Pensionierung (z. B. Jahrgang) bleibt sonst stehen. Liefert den Stand und ob er sich geaendert hat.
 */
export function stammdatenNachfuehren(H: PensState, d: SessionData): { H: PensState; geaendert: boolean; stamm: StammStand } {
  const neu = stammVon(d);
  const alt = obj(d.haushalt_stamm) as Partial<StammStand>;
  const roh: { personen: Record<string, unknown>[]; haushalt: string; bericht: { kunde: string; datum: string; berater: string } } = {
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
  if (neu.paar !== alt.paar && alt.paar !== undefined) {
    const soll = neu.paar ? (H.haushalt === 'single' ? 'verheiratet' : H.haushalt) : 'single';
    if (soll !== roh.haushalt) { roh.haushalt = soll; geaendert = true; }
  }
  if (neu.kunde !== alt.kunde && neu.kunde && roh.bericht.kunde !== neu.kunde) { roh.bericht.kunde = neu.kunde; geaendert = true; }
  return { H: geaendert ? sanitize({ ...H, ...roh }) : H, geaendert, stamm: neu };
}
