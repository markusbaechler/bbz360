// Gemeinsame Typen des Pensionierungs-Rechenkerns (portiert aus PensCheck, Stand 4830eff).
// «Leer» ('') bedeutet bei vielen Feldern «automatisch» bzw. «unbekannt» – deshalb NumLeer.

export type NumLeer = number | '';
export type Anlage = 'konto' | 'vorsichtig' | 'ausgewogen' | 'dynamisch';
export type Haushalt = 'single' | 'verheiratet' | 'konkubinat';

export interface Person {
  jahrgang: number;
  geburtsmonat: number;
  geschlecht: 'm' | 'w';
  pensAlter: number;
  brutto: number;
  pkRente: number;
  pkKapital: number;
  pkGuthabenHeute: NumLeer;
  pkGuthabenPlan: NumLeer;
  minAlter: number;
  pkFrist: NumLeer;
  s3a: number;
  s3aModus: 'max' | 'eigen';
  s3aEinz: number;
  s3aAnlage: Anlage;
  fz: number;
  fzAnlage: Anlage;
  ahvModus: 'schaetzung' | 'betrag';
  ahvBetrag: NumLeer;
  ahvFehlJahre: number;
  ahvBezug: number;
  teilAb: number;
  teilPensum: number;
  teilPK: 'teilbezug' | 'weiter';
}

export interface Liegenschaft {
  name: string;
  typ: 'eigen' | 'ferien' | 'rendite';
  verkehrswert: number;
  hypothek: number;
  zins: number;
  unterhalt: number;
  nebenkosten: number;
  mietertrag: number;
  verkaufAlter: number;
}

export type AmortQuelle = 'frei' | '3a0' | '3a1' | 'fz0' | 'fz1';
export interface Amortisation {
  lg: number;
  betrag: number;
  jahr: number;
  monat: number;
  quelle: AmortQuelle;
  tkey?: 'karte';
}

export type EinkommenArt = 'dividende' | 'nebenerwerb' | 'spesen' | 'sonstiges';
export interface Einkommen {
  person: 0 | 1;
  art: EinkommenArt;
  betrag: number;
  bisJahr: number;
  text: string;
  tkey?: 'neben' | 'weiter';
  abPens?: boolean;
}

export type WunschTyp = 'ausland' | 'jahr' | 'einmal' | 'ziel';
export interface Wunsch {
  typ: WunschTyp;
  aktiv: boolean;
  name: string;
  tkey?: 'reisen' | 'auto' | 'ausland' | 'erbe';
  karte?: string;
  wohnform?: 'miete' | 'kauf';
  betrag?: number;
  von?: number;
  bis?: number;
  alter?: number;
  monate?: number;
  preisniveau?: number;
  anteilVariabel?: number;
  reise?: number;
  miete?: number;
  kaufpreis?: number;
  nebenkosten?: number;
  laufend?: number;
  wochen?: number;
  preisWoche?: number;
  verwaltung?: number;
  mietSteuer?: number;
  verkaufAlter?: number;
}

export type ThemaStatus = 'vor' | 'vergleich' | 'ueber';
export interface Thema {
  karte: string;
  status: ThemaStatus;
  ueber?: boolean;
  person?: 0 | 1;
  lg?: number;
  w?: number;
  stelle?: string;
  a?: Record<string, number>;
  b?: Record<string, number>;
}

/** Schalter der PensCheck-Oberfläche; reisen mit dem Stand mit (Import eines PensCheck-Links). */
export interface PensUi {
  leiste: 'auf' | 'zu';
  schritt: string;
  besucht: Record<string, boolean>;
  ansicht: string;
  jview: 'alle' | 'fix';
  edited: boolean;
  open: Record<string, boolean>;
  stopM: number | null;
  stopY: number | null;
  stopWer?: 0 | 1 | 'alle';
  tutorStep: string;
  tutorMax: number;
  practice: boolean;
  mode?: 'tutor' | 'form';
  twohnen?: 'eigen' | 'miete';
  tkap0?: boolean;
  tkap1?: boolean;
  t3a0?: boolean;
  t3a1?: boolean;
  datumSet?: boolean;
  savedAt?: number;
  entwurf?: unknown;
}

/** Vollständiger Stand eines Haushalts, wie ihn sanitize() liefert. */
export interface PensState {
  haushalt: Haushalt;
  kanton: string;
  personen: [Person, Person];
  liquiditaet: number;
  wertschriften: number;
  kontoZins: number;
  zins3aKonto: number;
  anlageprofil: 'vorsichtig' | 'ausgewogen' | 'dynamisch';
  renditeOverride: NumLeer;
  ausgabenRuhestand: number;
  ausgabenHeute: NumLeer;
  reduktion75: number;
  fix: Record<string, number>;
  budget: Record<string, number>;
  budgetAktiv: boolean;
  budgetBasis: '' | 'bescheiden' | 'mittel' | 'gehoben';
  liegenschaften: Liegenschaft[];
  amortisationen: Amortisation[];
  einkommen: Einkommen[];
  wuensche: Wunsch[];
  themen: Thema[];
  inflation: number;
  ahvAnpassung: number;
  horizontModus: 'le5' | 'le' | '95' | 'eigen';
  horizontEigen: number;
  steuerEink: number;
  steuerVerm: NumLeer;
  ertragSteuerbar: number;
  reserveJahre: number;
  tragGrenze: number;
  bericht: { kunde: string; datum: string; berater: string };
  aktion: Record<string, 1>;
  ui: PensUi;
}

// ---------- Grundlagen (public/data/params.json) ----------
export interface ParamQuelle { id: string; [k: string]: unknown }
export interface ParamEintrag {
  label?: string;
  unit?: string;
  kind?: string;
  note?: string;
  values: Record<string, unknown>;
  sources?: ParamQuelle[];
}
export interface ParamTabelle { kind?: string; byYear?: boolean; data: unknown; [k: string]: unknown }
export interface ParamDatei {
  schema?: number;
  version: string;
  sources: Record<string, Record<string, unknown>>;
  params: Record<string, ParamEintrag>;
  tables?: Record<string, ParamTabelle>;
}

/**
 * Aufgelöster Parametersatz eines Rechnungsjahrs (resolveParams). Die Struktur entsteht dynamisch aus den
 * Schlüsseln der Grundlagen-Datei (z. B. «ahv.minRente» → P.ahv.minRente) und ist deshalb offen typisiert.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Params = { meta: { jahr: number; version: string; veraltet: boolean; letztesDatenjahr: number } } & Record<string, any>;
