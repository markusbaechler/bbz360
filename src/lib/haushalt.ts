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
 * - Lohn nur, wenn im Cockpit als Brutto erfasst (aus Netto laesst sich der Bruttolohn nicht ableiten).
 *   Zuordnung wie im Cockpit: erstes Einkommen → Person 1, zweites → Person 2.
 * - Zahlungsverkehr + Sparen → Liquiditaet, Anlagevolumen → Wertschriften.
 * - Saeule 3a und PK-Guthaben stehen im Cockpit als Summe des Haushalts; sie gehen an Person 1.
 */
export function haushaltAusSession(d: SessionData): PensState {
  const cd = obj(d.cockpit_data);
  const ausgaben = obj(cd.ausgaben), vorsorgen = obj(cd.vorsorgen);
  const paar = typeof d.p2name === 'string' && d.p2name.trim() !== '';
  const mult = ausgaben.freq === 'pa' ? 1 : 12;
  const brutto = ausgaben.typ === 'brutto';
  const lohn = [zahl(ausgaben.eMann) * mult, zahl(ausgaben.eFrau) * mult];
  const geb = [geburt(d.p1geb), geburt(d.p2geb)];
  const pk = zahl(d.cockpit_pk_saldo) || zahl(vorsorgen.pkSaldo);

  const personen = [0, 1].map((i) => ({
    ...(geb[i] ?? {}),
    ...(brutto && lohn[i] ? { brutto: lohn[i] } : {}),
    ...(i === 0 && zahl(vorsorgen.s3Saldo) ? { s3a: zahl(vorsorgen.s3Saldo) } : {}),
    ...(i === 0 && pk ? { pkGuthabenHeute: pk } : {}),
  }));

  return sanitize({
    haushalt: paar ? 'verheiratet' : 'single',
    personen,
    liquiditaet: zahl(obj(cd.zahlen).saldo) + zahl(obj(cd.sparen).saldo),
    wertschriften: zahl(obj(cd.anlegen).volumen),
    bericht: { kunde: [d.p1name, d.p2name].filter((n) => typeof n === 'string' && n.trim()).join(' & ') },
    ui: { edited: true, mode: 'form' },
  });
}

/** Aktueller Haushalts-Stand: der gespeicherte, sonst ein erster Stand aus Stammdaten und Cockpit (nicht gespeichert). */
export function haushaltLesen(): PensState {
  const d = BBZ.all();
  return d.haushalt ? sanitize(d.haushalt) : haushaltAusSession(d);
}

/** Speichert den Haushalts-Stand; false, wenn der Speicher voll ist (ADR-14). */
export function haushaltSchreiben(S: PensState): boolean {
  return BBZ.set('haushalt', sanitize(S));
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
