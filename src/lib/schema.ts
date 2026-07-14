// ============================================================================
// schema.ts — typisiertes SessionData + SCHEMA_VERSION + migrate() (ADR-4).
// Empirisch hergeleitet: bbz-data.js SCHEMA (Doku) ⨯ grep aller BBZ.*/localStorage
// -Keys ueber alle 13 v1-Dateien (bbz-Dialog @ main). Abweichungen unten.
// ============================================================================
//
// ── SCHEMA-ABWEICHUNGEN (Doku vs. tatsaechlicher v1-Code) ───────────────────
// A) NUR im CODE, NICHT in bbz-data.js SCHEMA (07b real geschrieben):
//      anlage_strategiewunsch, anlage_stresstest, anlage_konklusion,
//      anlage_preise, anlage_produktwahl
//    Prefix-Keys (kein Schema-Eintrag, aber als config behandelt):
//      berater_texte_<id>, beratervorstellung_<id>
// B) NUR im SCHEMA, im CODE NICHT (mehr) verwendet -> Legacy/tot:
//      anlage_strategie, anlage_reaktion, anlage_profil, anlage_impl,
//      anlage_horizont, anlage_betrag  (07b nutzt stattdessen die A-Keys)
//      cockpit_income (in bbz-data.js selbst als Legacy markiert)
// C) SEPARATE localStorage-Stores (nicht in bbzData):
//      bbzCockpit  = Legacy-Config-Spiegel { aktiverBerater, disabled, branches }
//      bbzAdmin    = Berater[] (reines Array; NUR admin schreibt) -> migrateAdmin()
//      bbzBgImage  = Session (wird bei clearSession geloescht)
// D) TYP-MEHRDEUTIGKEIT bei Betraegen (ADR-4: number gewinnt):
//      finanzierung_data.inputs werden in v1 als STRINGS geschrieben
//      -> migrate() normalisiert sie zu number.
//      cockpit_* werden von v1 per _coerce bereits zu number gezwungen.
// ============================================================================

export const SCHEMA_VERSION = 2;

export interface FinanzierungInputs {
  income: number;
  obligations: number;
  currentRent: number;
  age: number;
  price: number;
  cashEquity: number;
  pensionWithdraw: number;
  pensionPledge: number;
  calcRate: number;
  sideRate: number;
}

export interface FinanzierungData {
  inputs: Partial<FinanzierungInputs>;
  variants: Array<{ id: string; tranches: Array<{ p: string; a: number }> }>;
  rates: Record<string, number>;
}

export interface AnlageKonklusion {
  strategiewunsch: string;
  stresstest: string;
  horizonMax: string;
  empfehlung: string;
  finaleStrategie: string;
  esg: string | null;
  esgText: string;
  begruendung: string;
}

export interface Berater {
  id: number;
  name?: string;
  titel?: string;
  [k: string]: unknown;
}

export interface SessionData {
  __schemaVersion: number;
  // Stammdaten
  p1name?: string;
  p1geb?: string;
  p2name?: string;
  p2geb?: string;
  beratungsdatum?: string;
  // Cockpit (05) — Betraege number (ADR-4)
  cockpit_einkommen?: number | null;
  cockpit_verpflichtungen?: number | null;
  cockpit_pk_saldo?: number | null;
  cockpit_anlage_f?: number | null;
  cockpit_data?: unknown;
  // Anlegen (07b) — reale Keys (siehe Abweichungen A)
  anlage_betrag?: number | null;
  anlage_horizont?: number | null;
  anlage_konklusion?: AnlageKonklusion | null;
  // Finanzieren (07a)
  finanzierung_data?: FinanzierungData | null;
  // Passthrough: alle weiteren v1-Keys bleiben erhalten (kein Feldverlust).
  [key: string]: unknown;
}

// Betrags-Keys in bbzData, die als number erzwungen werden.
const NUMBER_KEYS = [
  'cockpit_einkommen', 'cockpit_verpflichtungen', 'cockpit_pk_saldo',
  'cockpit_anlage_f', 'anlage_betrag', 'anlage_horizont',
] as const;

const FIN_INPUT_KEYS: (keyof FinanzierungInputs)[] = [
  'income', 'obligations', 'currentRent', 'age', 'price', 'cashEquity',
  'pensionWithdraw', 'pensionPledge', 'calcRate', 'sideRate',
];

function toNum(v: unknown): number {
  if (typeof v === 'number') return v;
  return parseFloat(String(v).replace(/['\s]/g, '').replace(',', '.')) || 0;
}

// migrate(): hebt ein rohes v1-`bbzData`-Objekt auf SCHEMA_VERSION an.
// Verlustfrei (unbekannte Keys bleiben), Betraege werden zu number normalisiert.
export function migrate(raw: unknown): SessionData {
  const src: Record<string, unknown> =
    raw && typeof raw === 'object' ? { ...(raw as Record<string, unknown>) } : {};

  for (const k of NUMBER_KEYS) {
    if (k in src && src[k] != null && src[k] !== '') src[k] = toNum(src[k]);
  }

  const fd = src['finanzierung_data'];
  if (fd && typeof fd === 'object') {
    const f = { ...(fd as Record<string, unknown>) };
    if (f.inputs && typeof f.inputs === 'object') {
      const ins = f.inputs as Record<string, unknown>;
      const norm: Record<string, number> = {};
      for (const key of FIN_INPUT_KEYS) {
        if (key in ins && ins[key] != null && ins[key] !== '') norm[key] = toNum(ins[key]);
      }
      f.inputs = norm;
    }
    src['finanzierung_data'] = f;
  }

  src['__schemaVersion'] = SCHEMA_VERSION;
  return src as SessionData;
}

// bbzAdmin ist ein separater Store: reines Berater[]-Array.
// v1-Altform (Objekt mit .profiles-Array) wird mitgelesen.
export function migrateAdmin(raw: unknown): Berater[] {
  if (Array.isArray(raw)) return raw as Berater[];
  if (raw && typeof raw === 'object' && Array.isArray((raw as { profiles?: unknown }).profiles)) {
    return (raw as { profiles: Berater[] }).profiles;
  }
  return [];
}
