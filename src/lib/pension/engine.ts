// PensCheck – Rechenkern (monatsgenau).
// createEngine(P, A0, Pn) liefert alle Rechenfunktionen für einen Parametersatz P (siehe params.js)
// und den Startmonat A0. Monatsnummer A = Jahr * 12 + (Monat - 1).
// Pn (optional): bereits beschlossene Werte des Folgejahres; sie gelten in der Projektion ab dem 1. Januar.

import type { Amortisation, AmortQuelle, Liegenschaft, NumLeer, Params, PensState, Person, Wunsch } from './typen';

export const MON = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
export const fmtA = (A: number) => `${MON[((A % 12) + 12) % 12]} ${Math.floor(A / 12)}`;
export const monthOf = (date = new Date()) => date.getFullYear() * 12 + date.getMonth();
export const EINK_ART = { dividende: 'Dividenden', nebenerwerb: 'Nebenerwerb', spesen: 'Pauschalspesen', sonstiges: 'Sonstiges Einkommen' };
export const QUELLEN = { frei: 'freies Vermögen', '3a0': 'Säule 3a P1', '3a1': 'Säule 3a P2', fz0: 'Freizügigkeit P1', fz1: 'Freizügigkeit P2' };
export const W_DEF = { preisniveau: 55, anteilVariabel: 35, reise: 1500, miete: 1200, kaufpreis: 250000, nebenkosten: 5.5, laufend: 1.5, wochen: 12, preisWoche: 800, verwaltung: 25, mietSteuer: 20, verkaufAlter: 0 };

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const mz = (r: number) => Math.pow(1 + r, 1 / 12) - 1;
const pct = (v: Zahl, def: number) => (v === '' || v == null || !isFinite(+v) ? def : +v / 100);
const num = (v: Zahl) => (isFinite(+v!) ? +v! : 0);
/** AHV/IV/EO-Beitragssatz auf dem Lohn, Arbeitnehmer und Arbeitgeber zusammen. */
const AHV_LOHNBEITRAG = 0.106;

// ---------- Typen ----------
type Zahl = NumLeer | null | undefined;
/** Teilbaum der gesetzlichen Werte (z. B. P.ahv): entsteht dynamisch aus den Grundlagen, deshalb offen typisiert. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Werte = any;
type PGeb = Pick<Person, 'jahrgang' | 'geburtsmonat'>;
type PJg = Pick<Person, 'geschlecht' | 'jahrgang'>;
type PAhv = Pick<Person, 'brutto' | 'ahvModus' | 'ahvBetrag' | 'ahvFehlJahre'>;
type PPk = PGeb & Pick<Person, 'pensAlter' | 'pkRente' | 'pkKapital' | 'pkGuthabenHeute' | 'pkGuthabenPlan' | 'minAlter'>;
/** Amortisation, wie sie die Engine liest: «alter» (Alter von Person 1) gilt, wenn kein Jahr erfasst ist. */
export type AmortEingabe = Amortisation & { alter?: number };
/** Eingaben der Rechnung: Stand des Haushalts, wahlweise mit dem Horizont aus horizon() (horizont, horizontP). */
export type EngineInput = Pick<PensState,
  'haushalt' | 'kanton' | 'liquiditaet' | 'wertschriften' | 'kontoZins' | 'zins3aKonto' | 'anlageprofil' | 'renditeOverride' | 'ausgabenRuhestand' | 'ausgabenHeute' | 'reduktion75'
  | 'liegenschaften' | 'einkommen' | 'wuensche' | 'zufluesse' | 'inflation' | 'ahvAnpassung' | 'steuerEink' | 'steuerVerm' | 'ertragSteuerbar' | 'reserveJahre' | 'tragGrenze'
> & { personen: Person[]; amortisationen: AmortEingabe[]; horizont?: number; horizontP?: number[] | null };
/** Abweichungen vom Plan für einen Rechenlauf (Was-wäre-wenn, Stresstest). */
export interface SimOptionen {
  renditeDelta?: number;
  horizont?: number;
  ausgaben?: number | null;
  stopA?: number | null;
  stopWer?: number | null;
  ohneVorbezug?: boolean;
  ohneWunsch?: number;
}
interface AhvPerson extends PAhv, PJg { Aahv: number; Aref: number; ahvF: number; ahvBez: number }
interface AhvZustand { sV: number; nV: number; sA: number; nA: number; kV: number | null; kA: number | null; zs: number | null }
interface AhvZahlung { pay: number; zs: number; akk: 'V' | 'A' | null; rn: number }
interface AhvMonat { rente: number; zuschlag: number; pers: (0 | AhvZahlung)[]; plafoniert: boolean; geteilt: boolean }
/** Jahreszeile der Simulation (Beträge in Franken des jeweiligen Jahres, I = Teuerungsfaktor). */
export interface SimRow {
  year: number; ages: number[]; age: number; Vstart: number; lohn: number; lohnP: number[]; ahv: number; pk: number; kapBrutto: number; kapSt: number; kapZu: number;
  amort: number; ne: number; uebrig: number; steuern: number; stVerm: number; stErtrag: number; ausgaben: number; ertrag: number; einz3a: number;
  wAus: number; wEin: number; wEinLauf: number; lgNetto: number; amortFrei: number; I: number;
  V: number; hyp: number; lgAusland: number; anyRet: boolean; allRet: boolean; allAhv: boolean;
  lgWerte: number[]; lgHyp: number[]; s3a: number; fz: number;
  /** bbz360 (ADR-19): Zuflüsse (z. B. Erbschaft) und Liegenschaftskäufe des Jahres; fehlen ohne solche Einträge. */
  zufluss?: number; lgKauf?: number;
}
export interface SimEvent {
  A: number; datum: string; person: number | null; text: string; betrag: number | null | undefined;
  proJahr?: boolean; wunsch?: boolean; warn?: boolean; ahv?: boolean; amort?: boolean; steuer?: number;
}
type EventExtra = Pick<SimEvent, 'proJahr' | 'wunsch' | 'warn' | 'ahv' | 'amort' | 'steuer'>;
export interface KapBezug { year: number; A: number; datum: string; person: number; age: number; art: string; betrag: number; steuer: number; I: number }
/** Momentaufnahme für die Tragbarkeit (nach der Pensionierung, mit AHV). */
export interface SimSnap { A: number; datum: string; age: number; year: number; V: number; offen: number; ahv12: number; pk: number; hyp: number; vw: number; miete: number }
export interface TragPunkt { label: string; A: number; age: number; datum: string; eink: number; kosten: number; quote: number; maxHyp: number; hyp: number; amort: number; st: string }

export function createEngine(P: Params, A0: number, Pn: Params | null = null) {
  const BASIS = Math.floor(A0 / 12);
  const A = P.annahmen;
  // Gesetzliche Werte je Monat: bis Ende Jahr die laufenden, ab dem 1. Januar die des Folgejahres (falls beschlossen).
  // Die Fortschreibung (AHV-Anpassung, Teuerung) beginnt jeweils mit der Gültigkeit der Werte.
  const A1 = (BASIS + 1) * 12;
  const PX = (Am: number) => (Pn && Am >= A1 ? Pn : P);
  const tX = (Am: number) => (Pn && Am >= A1 ? Am - A1 : Am - A0);

  // ---------- Personen und Zeitpunkte ----------
  const birthA = (p: PGeb) => p.jahrgang * 12 + ((p.geburtsmonat || 6) - 1);
  const abAlter = (p: PGeb, jahre: number) => birthA(p) + Math.round(jahre * 12) + 1; // Monat nach dem Geburtstag
  const alterBei = (p: PGeb, Am: number) => (Am - birthA(p)) / 12;

  /** AHV-Referenzalter (AHV 21: Übergangsjahrgänge Frauen 1961–1963). */
  function refAlter(p: PJg) {
    const ra = P.referenzalter;
    if (p.geschlecht !== 'w') return ra.m;
    let a = ra.w[0][1];
    for (const [jg, alter] of ra.w) if (p.jahrgang >= jg) a = alter;
    return a;
  }

  // ---------- AHV ----------
  const AHV = P.ahv;
  /** Volle Monatsrente nach Art. 34 AHVG aus dem massgebenden durchschnittlichen Jahreseinkommen. */
  function ahvFormel(e: number, H = AHV) {
    if (e <= H.einkMin) return H.minRente;
    if (e >= H.einkMax) return H.maxRente;
    const f = H.formel;
    const r = e <= f.grenze * H.minRente ? f.festTief * H.minRente + f.varTief * e : f.festHoch * H.minRente + f.varHoch * e;
    return clamp(r, H.minRente, H.maxRente);
  }
  /**
   * AHV-Monatsrente: eigener Betrag (Rentenvorausberechnung) oder Schätzung aus dem Lohn.
   * H: AHV-Werte des betreffenden Jahres (Standard: laufendes Jahr). Ein eigener Betrag steigt mit der Minimalrente.
   */
  function ahvMonat(p: PAhv, H = AHV, e = num(p.brutto)) {
    return ahvVoll(p, H, e) * ahvSkala(p, 0, H);
  }
  const eigenerBetrag = (p: Pick<Person, 'ahvModus' | 'ahvBetrag'>) => p.ahvModus === 'betrag' && (p.ahvBetrag as number) > 0;
  /** Rente der Vollskala: eigener Betrag oder Rentenformel mit dem massgebenden Einkommen e. */
  const ahvVoll = (p: Pick<Person, 'ahvModus' | 'ahvBetrag'>, H: Werte, e: number) => (eigenerBetrag(p) ? (+p.ahvBetrag * H.minRente) / AHV.minRente : ahvFormel(e, H));
  /**
   * Teilrentenfaktor (Rentenskala): Beitragsjahre der Person im Verhältnis zur vollen Beitragsdauer.
   * vj: Jahre Vorbezug; während des Vorbezugs fehlen diese Beitragsjahre noch, im Referenzalter wird neu gerechnet.
   * Ein eigener Betrag (Rentenvorausberechnung) enthält allfällige Lücken bereits.
   */
  function ahvSkala(p: Pick<Person, 'ahvModus' | 'ahvBetrag' | 'ahvFehlJahre'>, vj = 0, H = AHV) {
    const n = H.beitragsjahre;
    return clamp(n - (eigenerBetrag(p) ? 0 : num(p.ahvFehlJahre)) - vj, 0, n) / n;
  }
  /**
   * Massgebendes Einkommen für die Schätzung. Die Einkommen werden je hälftig angerechnet, sobald beide Ehegatten das
   * Referenzalter erreicht haben (Einkommensteilung, Art. 29quinquies Abs. 3 Bst. a AHVG; hier über die ganze
   * Beitragszeit angenommen). Eine vorbezogene Rente beruht bis dahin auf dem eigenen Einkommen.
   */
  const ahvEink = (ps: PAhv[], i: number, geteilt: boolean, H = AHV) => {
    if (!(geteilt && ps.length === 2)) return num(ps[i].brutto);
    // Person mit eigenem Betrag: Für die Teilung zählt das Einkommen, das ihrer Rente entspricht (nicht das Lohnfeld)
    const eink = (p: PAhv) => (eigenerBetrag(p) ? einkAusRente(ahvVoll(p, H, 0), H) : num(p.brutto));
    return (eink(ps[0]) + eink(ps[1])) / 2;
  };
  /** Einkommen, das einer Vollrente R entspricht (Umkehrung der Rentenformel): stuft einen eigenen Betrag in die Einkommensbänder ein. */
  function einkAusRente(R: number, H = AHV) {
    if (R <= H.minRente) return H.einkMin;
    if (R >= H.maxRente) return H.einkMax;
    const fo = H.formel, tief = (R - fo.festTief * H.minRente) / fo.varTief;
    return tief <= fo.grenze * H.minRente ? tief : (R - fo.festHoch * H.minRente) / fo.varHoch;
  }
  /**
   * Rentenzuschlag für Frauen der Übergangsgeneration ohne Vorbezug (Art. 34bis AHVG), pro Monat:
   * Grundbetrag nach Einkommen, Faktor nach Jahrgang, gekürzt mit der Rentenskala, auf den Franken aufgerundet.
   * Er wird nicht plafoniert, nicht an die Teuerung angepasst und zählt nicht für die 13. Rente.
   */
  function rentenzuschlag(p: PJg, e: number, skala = 1, H = AHV) {
    const U = P.ahv.uebergang, Z = U && U.zuschlag;
    if (!Z || !uebergang(p)) return 0;
    const band = e <= U.baender[0] * H.minRente ? 0 : e <= U.baender[1] * H.minRente ? 1 : 2;
    const z = Z.betraege[band] * skala * (Z.faktor[String(p.jahrgang)] ?? 0);
    return z > 0 ? Math.ceil(Math.round(z * 100) / 100 - 1e-9) : 0;
  }
  /**
   * Höchstbetrag der beiden Renten eines Ehepaars (Art. 35 AHVG, Art. 53bis AHVV): 150% der Maximalrente der
   * massgebenden Rentenskala. Bei ungleichen Skalen zählt die höhere doppelt: ip = ent((2 × höhere + tiefere) / 3 + 0.9)
   * (BSV-Berechnungsvorschriften, Kap. 4.2). s1, s2: Teilrentenfaktoren der beiden Personen.
   */
  function plafond(s1: number, s2: number, H = AHV) {
    const n = H.beitragsjahre, hoch = Math.max(s1, s2) * n, tief = Math.min(s1, s2) * n;
    const ip = Math.min(n, Math.floor((2 * hoch + tief) / 3 + 0.9 + 1e-9));
    return (H.plafondEhepaar * ip) / n;
  }
  /**
   * AHV-Renten eines Monats für alle Personen (Art. 29quinquies, 34bis, 35, 39, 40 AHVG; Art. 53bis, 53quater, 56 AHVV;
   * BSV-Berechnungsvorschriften Kap. 3.3, 4 und 6; Merkblatt 3.04 Ziff. 24–26):
   * 1. Rente jeder Person mit Anspruch (Vorbezug begonnen oder Referenzalter erreicht), auch wenn sie aufgeschoben ist.
   *    Einkommensteilung erst, wenn beide das Referenzalter erreicht haben.
   * 2. Haben beide Ehegatten Anspruch: Plafonierung (siehe plafond), anteilig auf beide verteilt.
   * 3. Erst danach Kürzung (Vorbezug) bzw. Zuschlag (Aufschub): Der Betrag bemisst sich am Durchschnitt der
   *    vorbezogenen bzw. aufgeschobenen, allenfalls plafonierten Renten in Franken; er wird im Referenzalter bzw.
   *    beim Abruf festgelegt und folgt danach den Rentenanpassungen.
   * 4. Rentenzuschlag der Übergangsgeneration: beim Erreichen des Referenzalters eingestuft, danach unverändert.
   * z: Zustand je Person (wird fortgeschrieben). niv: Rentenniveau des Monats (Minimalrente in Franken, mit
   * Fortschreibung). Liefert die Monatsbeträge in Werten von H (ohne Fortschreibung).
   */
  function ahvMonatAlle(ps: AhvPerson[], Am: number, H: Werte, married: boolean, z: AhvZustand[], niv: number = H.minRente): AhvMonat {
    const claim = ps.map((p) => Am >= Math.min(p.Aahv, p.Aref));
    const paar = married && ps.length === 2;
    const beide = paar && claim[0] && claim[1];
    const geteilt = paar && Am >= ps[0].Aref && Am >= ps[1].Aref;
    const b = ps.map((p, i) => {
      if (!claim[i]) return { r: 0, s: 0, e: 0 };
      const s = ahvSkala(p, p.ahvBez < 0 && Am < p.Aref ? -p.ahvBez : 0, H);
      // eigener Betrag: nicht geteilt; das Einkommen dazu ergibt sich aus der Rentenformel
      const e = eigenerBetrag(p) ? einkAusRente(ahvVoll(p, H, 0), H) : ahvEink(ps, i, geteilt, H);
      return { r: ahvVoll(p, H, e) * s, s, e };
    });
    if (beide) {
      const PG = plafond(b[0].s, b[1].s, H), sum = b[0].r + b[1].r;
      if (sum > PG) b.forEach((x) => (x.r *= PG / sum));
    }
    let rente = 0, zuschlag = 0;
    const pers = ps.map((p, i): 0 | AhvZahlung => {
      if (!claim[i]) return 0;
      // rn: Rente in Minimalrenten; rn × niv ist der Frankenbetrag des Monats
      const a = z[i], r = b[i].r, rn = r / H.minRente, satz = Math.abs(1 - p.ahvF);
      let pay = r;
      if (p.ahvBez < 0) {
        if (Am < p.Aref) { a.sV += rn * niv; a.nV++; pay = r * (1 - satz); }
        else {
          // Kürzungsbetrag einmal festlegen. Hat die Rechnung erst nach dem Vorbezug begonnen, fehlt der Durchschnitt:
          // dann gilt die Teilrente der Vorbezugszeit auf der heutigen Rente.
          if (a.kV == null) a.kV = (satz * (a.nV ? a.sV / a.nV : (rn * niv * ahvSkala(p, -p.ahvBez, H)) / (ahvSkala(p, 0, H) || 1))) / niv;
          pay = r - a.kV * H.minRente;
        }
      } else if (p.ahvBez > 0) {
        if (Am < p.Aahv) { a.sA += rn * niv; a.nA++; pay = 0; }
        else {
          if (a.kA == null) a.kA = (satz * (a.nA ? a.sA / a.nA : rn * niv)) / niv;
          pay = r + a.kA * H.minRente;
        }
      }
      pay = Math.max(0, pay);
      rente += pay;
      // Rentenzuschlag: Einstufung beim Erreichen des Referenzalters, spätere Änderungen wirken nicht mehr (Art. 53quater AHVV)
      if (a.zs == null && Am >= p.Aref) a.zs = p.ahvBez >= 0 ? rentenzuschlag(p, b[i].e, ahvSkala(p, 0, H), H) : 0;
      const zs = Am >= p.Aahv && a.zs ? a.zs : 0;
      zuschlag += zs;
      // akk: In den Folgemonaten derselben Phase wird nur der Durchschnitt fortgeschrieben (siehe ahvWeiter)
      return { pay, zs, akk: p.ahvBez < 0 && Am < p.Aref ? 'V' : p.ahvBez > 0 && Am < p.Aahv ? 'A' : null, rn };
    });
    return { rente, zuschlag, pers, plafoniert: beide, geteilt };
  }
  const ahvZustand = (ps: unknown[]): AhvZustand[] => ps.map(() => ({ sV: 0, nV: 0, sA: 0, nA: 0, kV: null, kA: null, zs: null }));
  /** Monat ohne Änderung der Verhältnisse: Ergebnis des Vormonats gilt weiter, die Durchschnitte laufen mit. */
  function ahvWeiter(m: AhvMonat, z: AhvZustand[], niv: number) {
    m.pers.forEach((x, i) => {
      if (!x || !x.akk) return;
      if (x.akk === 'V') { z[i].sV += x.rn * niv; z[i].nV++; } else { z[i].sA += x.rn * niv; z[i].nA++; }
    });
    return m;
  }
  /** Frau der AHV-21-Übergangsgeneration (Jahrgänge 1961–1969): tiefere Kürzungssätze beim Vorbezug. */
  const uebergang = (p: PJg | null | undefined) => {
    const U = P.ahv.uebergang;
    return !!(U && p && p.geschlecht === 'w' && p.jahrgang >= U.jahrgaenge[0] && p.jahrgang <= U.jahrgaenge[1]);
  };
  /** Höchster Vorbezug in ganzen Jahren. Übergangsgeneration: bis 3 Jahre, aber frühestens ab 62. */
  const maxVorbezug = (p: PJg) => (uebergang(p) ? Math.max(2, Math.min(P.ahv.uebergang.maxJahre, Math.floor(refAlter(p) - 62))) : 2);
  /** Faktor für Vorbezug (negativ) bzw. Aufschub (positiv) in ganzen Jahren; p für die Übergangsgeneration. */
  function ahvFaktor(bez: number, p: PAhv & PJg) {
    if (bez < 0 && uebergang(p)) {
      // Bänder: massgebendes Jahreseinkommen bis 48 × bzw. 60 × monatliche Minimalrente (2026: 60'480 / 75'600)
      const U = P.ahv.uebergang, e = eigenerBetrag(p) ? einkAusRente(+p.ahvBetrag, AHV) : num(p.brutto);
      const band = e <= U.baender[0] * AHV.minRente ? 0 : e <= U.baender[1] * AHV.minRente ? 1 : 2;
      return 1 - (U.saetze[band][Math.min(-bez, maxVorbezug(p)) - 1] ?? 0) / 100;
    }
    if (bez < 0) return 1 - (AHV.vorbezug[String(-bez)] ?? 0);
    if (bez > 0) return 1 + (AHV.aufschub[String(bez)] ?? 0);
    return 1;
  }

  /**
   * AHV-Renten gemäss Plan in heutigen Werten pro Monat (inkl. Rentenzuschlag, ohne 13. Rente): je Person beim
   * eigenen Rentenbeginn («start») und sobald alle beziehen und das Referenzalter erreicht haben («dauer»).
   */
  function ahvPlan(inp: Pick<EngineInput, 'haushalt' | 'personen'>) {
    const ps = (inp.haushalt === 'single' ? inp.personen.slice(0, 1) : inp.personen.slice(0, 2)).map((p) => {
      const ref = refAlter(p), bez = clamp(Math.round(num(p.ahvBezug)), -maxVorbezug(p), 5);
      return { ...p, Aahv: abAlter(p, ref + bez), Aref: abAlter(p, ref), ahvF: ahvFaktor(bez, p), ahvBez: bez };
    });
    const married = inp.haushalt === 'verheiratet', z = ahvZustand(ps), start = ps.map((): number | null => null);
    const von = Math.min(...ps.map((p) => Math.min(p.Aahv, p.Aref))), bis = Math.max(...ps.map((p) => Math.max(p.Aahv, p.Aref)));
    let m: AhvMonat | null = null;
    const grenzen = new Set(ps.flatMap((p) => [p.Aahv, p.Aref]));
    for (let Am = von; Am <= bis; Am++) {
      m = m && !grenzen.has(Am) ? ahvWeiter(m, z, AHV.minRente) : ahvMonatAlle(ps, Am, AHV, married, z, AHV.minRente);
      ps.forEach((p, i) => { if (start[i] == null && Am >= p.Aahv) start[i] = (m!.pers[i] as AhvZahlung).pay + (m!.pers[i] as AhvZahlung).zs; });
    }
    const dauer = m!.pers.map((x) => (x ? x.pay + x.zs : 0));
    return { start, dauer, summe: dauer.reduce((a, b) => a + b, 0), plafoniert: m!.plafoniert, geteilt: m!.geteilt, zuschlag: m!.pers.map((x) => (x ? x.zs : 0)) };
  }

  // ---------- Steuern und Beiträge ----------
  /** Kapitalbezugssteuer (Kantonshauptort, inkl. Bund, ESTV-Statistik) durch Interpolation zwischen Stützstellen. */
  const kapSteuer = (kanton: string, betrag: number, verheiratet: boolean) => ausTabelle(P.kapSteuer, kanton, betrag, verheiratet);
  /**
   * Vermögenssteuer pro Jahr (Kanton und Gemeinde am Kantonshauptort, ESTV-Statistik für Rentnerinnen und Rentner)
   * für ein Reinvermögen in heutigen Franken. Ohne Tabelle (ältere Datenstände): 0.
   */
  const vermSteuerTab = (kanton: string, rein: number, verheiratet: boolean) => (P.vermSteuer ? ausTabelle(P.vermSteuer, kanton, rein, verheiratet) : 0);
  /** Hat die Person einen eigenen Satz für die Vermögenssteuer erfasst? Leer = Tarif des Kantons. */
  const vermEigen = (inp: Pick<EngineInput, 'steuerVerm'>) => inp.steuerVerm !== '' && inp.steuerVerm != null && isFinite(+inp.steuerVerm);
  /**
   * Vermögenssteuer pro Jahr auf dem Reinvermögen «rein» (nominal im betreffenden Jahr, I = Teuerungsfaktor).
   * Eigener Satz: Promille des Reinvermögens. Sonst der Tarif des Kantonshauptorts; die Tarifstufen werden mit der
   * Teuerung fortgeschrieben (Ausgleich der kalten Progression). Unverheiratete Paare: zwei Personen mit je der Hälfte.
   */
  function vermSteuerJahr(inp: Pick<EngineInput, 'steuerVerm' | 'haushalt' | 'kanton'>, rein: number, I = 1) {
    if (!(rein > 0)) return 0;
    if (vermEigen(inp)) return (clamp(+inp.steuerVerm, 0, 50) / 1000) * rein;
    const real = rein / I;
    if (inp.haushalt === 'verheiratet') return vermSteuerTab(inp.kanton, real, true) * I;
    if (inp.haushalt === 'single') return vermSteuerTab(inp.kanton, real, false) * I;
    return 2 * vermSteuerTab(inp.kanton, real / 2, false) * I;
  }
  /** Reinvermögen für die Vermögenssteuer heute: freies Vermögen plus Liegenschaften zum Steuerwert abzüglich Hypotheken. */
  function vermSteuerHeute(inp: Pick<EngineInput, 'steuerVerm' | 'haushalt' | 'kanton' | 'liquiditaet' | 'wertschriften' | 'liegenschaften'>) {
    const q = A.steuerwertLg ?? 0.7;
    const rein = Math.max(0, num(inp.liquiditaet) + num(inp.wertschriften) + getLgs(inp).reduce((x, l) => x + (kuenftig(l) ? 0 : l.verkehrswert * q - num(l.hypothek)), 0));
    const steuer = vermSteuerJahr(inp, rein, 1);
    return { rein, steuer, promille: rein > 0 ? (steuer / rein) * 1000 : 0, eigen: vermEigen(inp), ort: (P.vermSteuer?.kantone?.[inp.kanton] || P.vermSteuer?.kantone?.ZH)?.ort, steuerjahr: P.vermSteuer?.steuerjahr };
  }
  /** Steuer aus einer Tabelle je Kanton und Zivilstand: zwischen den Stützstellen linear, darüber linear fortgeschrieben. */
  function ausTabelle(T: Werte, kanton: string, betrag: number, verheiratet: boolean) {
    if (!(betrag > 0)) return 0;
    const k = T.kantone[kanton] || T.kantone.ZH;
    const xs = [0, ...T.stuetzstellen];
    const ys = [0, ...(verheiratet ? k.verheiratet : k.ledig)];
    const n = xs.length - 1;
    let t;
    if (betrag >= xs[n]) t = ys[n] + ((betrag - xs[n]) * (ys[n] - ys[n - 1])) / (xs[n] - xs[n - 1]);
    else {
      let i = 1;
      while (betrag > xs[i]) i++;
      t = ys[i - 1] + ((betrag - xs[i - 1]) * (ys[i] - ys[i - 1])) / (xs[i] - xs[i - 1]);
    }
    return t;
  }
  /** AHV/IV/EO-Beitrag Nichterwerbstätige pro Jahr nach der Beitragstabelle (Art. 28 AHVV): Stufen à 50'000. */
  const neBeitrag = (basis: number, Px = P) => {
    const N = Px.ne, T = Px.neTabelle;
    if (basis < N.vermoegenMin) return N.min;
    const stufe = 50000;
    let b;
    if (basis < T.grenze2) b = T.start + Math.floor((basis - N.vermoegenMin) / stufe) * T.schritt1;
    else b = T.start + ((T.grenze2 - N.vermoegenMin) / stufe) * T.schritt1 + Math.floor((basis - T.grenze2) / stufe) * T.schritt2;
    return Math.min(N.max, b);
  };

  // ---------- Renditen ----------
  const profil = (k: string) => A.profile[k] ?? A.profile.ausgewogen;
  const rate = (key: string, delta: number, inp?: Pick<EngineInput, 'zins3aKonto'> | null) => (key === 'konto' ? pct(inp?.zins3aKonto, A.kontoZins) : profil(key) + delta);
  const liqAnteil = (inp: Pick<EngineInput, 'liquiditaet' | 'wertschriften'>) => {
    const l = num(inp.liquiditaet), w = num(inp.wertschriften);
    return l + w > 0 ? l / (l + w) : 0;
  };
  const rateWs = (inp: Pick<EngineInput, 'renditeOverride' | 'anlageprofil'>, delta: number) => (inp.renditeOverride !== '' && inp.renditeOverride != null ? inp.renditeOverride / 100 : profil(inp.anlageprofil)) + delta;
  const rateHaupt = (inp: Pick<EngineInput, 'liquiditaet' | 'wertschriften' | 'kontoZins' | 'renditeOverride' | 'anlageprofil'>, delta: number) => {
    const q = liqAnteil(inp);
    return q * pct(inp.kontoZins, 0) + (1 - q) * rateWs(inp, delta);
  };

  // ---------- Pensionskasse ----------
  /** PK-Leistungen, wenn eine Person mit Alter a statt mit dem geplanten Alter aufhört. */
  function pkBeiAlter(p: PPk, a: number) {
    const plan = p.pensAlter;
    const uwsPlanDef = (A.uws65 - A.uwsProJahr * (65 - plan)) / 100;
    // Gesamtguthaben im Planalter: laut Ausweis (enthält den Teil für den Kapitalbezug) oder aus Rente und Kapital geschätzt
    const kapPlan = num(p.pkKapital);
    const Gplan = (p.pkGuthabenPlan as number) > 0 ? Math.max(+p.pkGuthabenPlan, kapPlan) : num(p.pkRente) / uwsPlanDef + kapPlan;
    // Umwandlungssatz auf dem Teil, der als Rente bezogen wird
    const uwsPlan = Gplan - kapPlan > 0 && num(p.pkRente) > 0 ? num(p.pkRente) / (Gplan - kapPlan) : uwsPlanDef;
    const a0 = alterBei(p, A0);
    let g = A.pkWachstum;
    if ((p.pkGuthabenHeute as number) > 0 && Gplan > 0 && plan > a0) g = Math.pow(Gplan / (p.pkGuthabenHeute as number), 1 / (plan - a0)) - 1;
    const f = Math.pow(1 + g, a - plan);
    const G = Gplan * f, kap = kapPlan * f;
    const uws = Math.max(0, uwsPlan - (A.uwsProJahr / 100) * (plan - a));
    if (a < (p.minAlter || P.bvg.minAlter)) return { rente: 0, kapital: 0, fz: G, G, renteRech: (G - kap) * uws, kapitalRech: kap };
    return { rente: Math.abs(a - plan) < 0.01 ? num(p.pkRente) : (G - kap) * uws, kapital: kap, fz: 0, G };
  }

  // ---------- Liegenschaften, Amortisationen ----------
  const getLgs = (inp: Pick<EngineInput, 'liegenschaften'>) => (Array.isArray(inp.liegenschaften) ? inp.liegenschaften.filter((l) => l && l.verkehrswert > 0) : []);
  /** bbz360 (ADR-19): Kaufmonat einer Liegenschaft mit Kaufjahr (Januar), sonst «schon immer im Besitz». */
  const kaufA = (l: Pick<Liegenschaft, 'kaufJahr'>) => ((l.kaufJahr ?? 0) > 0 ? l.kaufJahr! * 12 : -Infinity);
  /** bbz360 (ADR-19): Liegt der Kauf noch vor uns? Ein Kaufjahr, das erreicht oder vergangen ist, heisst: im Besitz. */
  const kuenftig = (l: Pick<Liegenschaft, 'kaufJahr'>) => kaufA(l) > A0;
  const getAmort = (inp: Pick<EngineInput, 'amortisationen'>) => (Array.isArray(inp.amortisationen) ? inp.amortisationen : []);
  const amortMonat = (inp: Pick<EngineInput, 'personen'>, x: Pick<AmortEingabe, 'jahr' | 'monat' | 'alter'>) => Math.max(A0, x.jahr > 0 ? x.jahr * 12 + ((x.monat || 1) - 1) : abAlter(inp.personen[0], x.alter || 0));

  /** 3a-Einzahlung pro Jahr im Monat A0 + t: Maximum (mit der AHV-Anpassung fortgeschrieben) oder eigener Betrag; nur mit Erwerbseinkommen. */
  function s3aJahr(inp: Pick<EngineInput, 'ahvAnpassung'>, p: Pick<Person, 'brutto' | 's3aModus' | 's3aEinz'>, t: number) {
    if (!(num(p.brutto) > 0)) return 0;
    if ((p.s3aModus || 'max') === 'max') return PX(A0 + t).s3a.maxMitPK * Math.pow(1 + mz((inp.ahvAnpassung ?? 0.3) / 100), tX(A0 + t));
    return num(p.s3aEinz);
  }

  // ---------- Wünsche: Auslandaufenthalt ----------
  /** Jahreswerte eines Auslandaufenthalts in heutigen CHF (ohne Kauf-Einmalbetrag). */
  function auslandJahr(w: Partial<Wunsch>, ausgMonat: number, wohnform: string | undefined, rendite: number) {
    const g = { ...W_DEF, ...w }, m = clamp(num(g.monate), 0, 12);
    const variabel = (ausgMonat * g.anteilVariabel) / 100;
    const einsparung = variabel * m;
    const leben = ((variabel * g.preisniveau) / 100) * m;
    let wohnen = 0, vermietung = 0, steuerVorOrt = 0, verwaltung = 0, kapitalkosten = 0;
    if ((wohnform || g.wohnform) === 'kauf') {
      wohnen = (g.kaufpreis * g.laufend) / 100;
      const brutto = num(g.wochen) * num(g.preisWoche);
      verwaltung = (brutto * g.verwaltung) / 100;
      steuerVorOrt = Math.max(0, brutto - verwaltung) * num(g.mietSteuer) / 100;
      vermietung = brutto;
      kapitalkosten = g.kaufpreis * (1 + g.nebenkosten / 100) * (rendite || 0);
    } else wohnen = g.miete * m;
    const netto = leben + wohnen + g.reise - einsparung - (vermietung - verwaltung - steuerVorOrt);
    return { m, einsparung, leben, wohnen, reise: g.reise, vermietung, verwaltung, steuerVorOrt, netto, kapitalkosten };
  }

  // ---------- Simulation ----------
  function simulate(inp: EngineInput, ov: SimOptionen = {}) {
    const ps0 = inp.haushalt === 'single' ? inp.personen.slice(0, 1) : inp.personen.slice(0, 2);
    const married = inp.haushalt === 'verheiratet';
    const d = ov.renditeDelta || 0;
    const rm = mz(rateHaupt(inp, d)), infM = mz(num(inp.inflation) / 100), sE = num(inp.steuerEink) / 100;
    const ahvM = mz((inp.ahvAnpassung ?? 0.3) / 100);
    // Vermögenssteuer: Tarif des Kantonshauptorts oder eigener Satz (siehe vermSteuerJahr); steuerbarer Anteil der Erträge
    const qE = clamp(num(inp.ertragSteuerbar), 0, 100) / 100;
    const steuerwertLg = A.steuerwertLg ?? 0.7;
    const horizont = ov.horizont || inp.horizont || 95;
    const ausgRuhe = ov.ausgaben != null ? ov.ausgaben : num(inp.ausgabenRuhestand);
    const ausgHeute = (inp.ausgabenHeute as number) > 0 ? +inp.ausgabenHeute : ausgRuhe / 0.9;
    const lgs = getLgs(inp);
    // bbz360 (ADR-19): Eine Liegenschaft mit Kaufjahr in der Zukunft gibt es bis zum Kauf (Januar des Jahres) nicht.
    // Bis dahin gilt sie wie «verkauft» (kein Wert, keine Hypothek, keine Kosten); beim Kauf entstehen Wert und Hypothek.
    const lgSt = lgs.map((l) => { const kommt = kuenftig(l); return { hyp: kommt ? 0 : num(l.hypothek), hyp0: kommt ? 0 : num(l.hypothek), verkauft: kommt, kommt }; });
    // bbz360 (ADR-19): Zuflüsse im Januar des Jahres (ein laufendes oder vergangenes Jahr: sofort)
    const zufluesse = (inp.zufluesse || []).filter((z) => z.betrag > 0 && z.jahr > 0).map((z) => ({ ...z, A: Math.max(A0, z.jahr * 12) }));
    const ps = ps0.map((p, idx) => {
      const ref = refAlter(p);
      const Aplan = abAlter(p, p.pensAlter);
      let Aret = Aplan, pk = { rente: num(p.pkRente), kapital: num(p.pkKapital), fz: 0 };
      // Geplante Pensionierung vor dem frühesten Pensionsalter der Pensionskasse: keine Rente und kein Kapital,
      // das Guthaben geht auf Freizügigkeit (wie im Was-wäre-wenn; nicht für eine Pensionierung in der Vergangenheit)
      if (Aplan >= A0 && p.pensAlter < (p.minAlter || P.bvg.minAlter) && (pk.rente > 0 || pk.kapital > 0 || (p.pkGuthabenPlan as number) > 0)) pk = pkBeiAlter(p, p.pensAlter);
      // «Was wäre, wenn»: früherer Ausstieg für alle oder nur für eine Person (ov.stopWer = Index)
      if (ov.stopA != null && ov.stopA < Aplan && (ov.stopWer == null || ov.stopWer === idx)) {
        Aret = Math.max(A0, ov.stopA);
        pk = pkBeiAlter(p, alterBei(p, Aret - 1));
      }
      const stopAlter = alterBei(p, Aret - 1);
      // Bezug von 3a und Freizügigkeit: mit der Pensionierung, frühestens 5 Jahre vor und spätestens im Referenzalter.
      // Liegt dieser Monat schon zurück, sind die heute erfassten Guthaben sofort fällig.
      const Akap = Math.max(A0, clamp(Aret, abAlter(p, ref - P.vorsorge.bezugJahreVorRef), abAlter(p, ref)));
      let teil = null;
      if (p.teilAb > 0 && p.teilPensum > 0 && p.teilPensum < 100) {
        const Ateil = Math.max(A0, abAlter(p, p.teilAb));
        if (Ateil < Aret) {
          const q = 1 - p.teilPensum / 100, ta = alterBei(p, Ateil - 1);
          const bezug = p.teilPK === 'teilbezug' && ta >= (p.minAlter || P.bvg.minAlter);
          let tpk = { rente: 0, kapital: 0 };
          if (bezug) {
            const e = pkBeiAlter(p, ta);
            // Liegt der Beginn der Teilpensionierung zurück, gilt das Teilkapital als bezogen (wie bei «Bereits pensioniert»)
            tpk = { rente: e.rente * q, kapital: abAlter(p, p.teilAb) < A0 ? 0 : e.kapital * q };
            pk = { ...pk, rente: pk.rente * (1 - q), kapital: pk.kapital * (1 - q) };
          }
          teil = { Ateil, pensum: p.teilPensum / 100, q, bezug, pk: tpk, zuFrueh: p.teilPK === 'teilbezug' && !bezug };
        }
      }
      const bez = clamp(Math.round(num(p.ahvBezug)), -maxVorbezug(p), 5);
      const kapVorbei = Aret < A0 && pk.kapital > 0;
      if (kapVorbei) pk = { ...pk, kapital: 0 };
      return { ...p, kapVorbei, ref, Aret, Aahv: abAlter(p, ref + bez), Aref: abAlter(p, ref), ahvF: ahvFaktor(bez, p), ahvBez: bez, Akap, A75: abAlter(p, 75), stopAlter, stop: Math.floor(stopAlter), pk, teil };
    });
    const hP = ov.horizont ? null : inp.horizontP;
    // Der Horizont liegt mindestens im laufenden Monat (sonst gäbe es nichts zu rechnen)
    const Aend = Math.max(A0, ...ps.map((p, i) => birthA(p) + (hP && hP[i] > 0 ? hP[i] : horizont) * 12 + 11));
    const lgNr: number[] = [];
    { let k = 0; (Array.isArray(inp.liegenschaften) ? inp.liegenschaften : []).forEach((l, i) => { lgNr[i] = l && l.verkehrswert > 0 ? k++ : -1; }); }
    const amorts = (ov.ohneVorbezug ? [] : getAmort(inp)).map((x) => ({ ...x, lg: lgNr[x.lg] ?? -1 })).filter((x) => x.betrag > 0 && x.lg >= 0 && lgs[x.lg]).map((x) => ({ ...x, A: amortMonat(inp, x) }));
    const st = ps.map((p) => ({ s3a: num(p.s3a), fz: num(p.fz) }));
    const p1 = ps[0];
    const eink = (inp.einkommen || []).filter((x) => x.betrag > 0 && ps[x.person || 0]).map((x) => {
      const p = ps[x.person || 0];
      let endA = x.bisJahr > 0 ? x.bisJahr * 12 + 12 : Infinity;
      if (x.art === 'spesen') endA = Math.min(endA, p.Aret);
      // Nebenerwerb «ab Pensionierung»: beginnt mit dem Pensionsmonat der Person (sonst ab heute)
      const startA = x.abPens && x.art === 'nebenerwerb' ? p.Aret : -Infinity;
      return { ...x, endA, startA };
    });
    /** Lohn aus Nebenerwerb pro Jahr (heutige Kaufkraft) der Person i im Monat Am. */
    const nebenLohn = (i: number, Am: number) => eink.reduce((x, e) => x + ((e.person || 0) === i && e.art === 'nebenerwerb' && Am >= e.startA && Am < e.endA ? e.betrag : 0), 0);
    const ahvZ = ahvZustand(ps), ahvStart = ps.map((): number | null => null);
    // Die AHV-Renten ändern nur beim Rentenbeginn, im Referenzalter und beim Wechsel der gesetzlichen Werte
    const ahvGrenzen = new Set([A1, ...ps.flatMap((p) => [p.Aahv, p.Aref])]);
    let am: AhvMonat | null = null;
    const pkKapVorbei = ps.map((p) => p.kapVorbei);
    const wuensche = (inp.wuensche || []).filter((w, k) => w.aktiv !== false && k !== ov.ohneWunsch);
    const zielReal = Math.max(0, ...wuensche.filter((w) => w.typ === 'ziel').map((w) => num(w.betrag)));
    const wState = wuensche.map(() => ({ gekauft: false, verkauft: false }));
    // bbz360 (ADR-19): Monat einer einmaligen Ausgabe — mit Kalenderjahr im Januar (laufendes oder vergangenes Jahr:
    // sofort), sonst wie im PensCheck im Monat nach dem Geburtstag von Person 1.
    const einmalA = (w: Wunsch) => ((w.jahr ?? 0) > 0 ? Math.max(A0, w.jahr! * 12) : abAlter(p1, w.alter || 0));
    let V = num(inp.liquiditaet) + num(inp.wertschriften);
    const hypSum = () => lgSt.reduce((x, s) => x + (s.verkauft ? 0 : s.hyp), 0);
    const rows: SimRow[] = [], events: SimEvent[] = [], kapListe: KapBezug[] = [], kapSumJahr: Record<string, number> = {};
    let depleted: number | null = null, depletedA: number | null = null, depletedBeforeRet = false, kapSteuerTotal = 0, cur: SimRow | null = null, snapRet: SimSnap | null = null, snapAhv: SimSnap | null = null;
    /** Jahreszeile abschliessen: Stände am Jahresende (Liegenschaften, Vorsorgeguthaben). */
    const schliesse = (c: SimRow) => {
      c.lgWerte = lgs.map((l, k) => (lgSt[k].verkauft ? 0 : l.verkehrswert * c.I));
      c.lgHyp = lgSt.map((s) => (s.verkauft ? 0 : s.hyp));
      c.s3a = st.reduce((x, y) => x + y.s3a, 0);
      c.fz = st.reduce((x, y) => x + y.fz, 0);
      return c;
    };
    const ev = (Am: number, person: number | null, text: string, betrag?: number | null, extra?: EventExtra) => events.push({ A: Am, datum: fmtA(Am), person, text, betrag, ...(extra || {}) });

    eink.forEach((x) => {
      if (x.startA >= x.endA) return;
      if (x.startA > A0) ev(x.startA, x.person || 0, `${EINK_ART[x.art] || 'Einkommen'}${x.text ? ' (' + x.text + ')' : ''} beginnt`, x.betrag, { proJahr: true });
      if (isFinite(x.endA) && x.endA > A0) ev(x.endA, x.person || 0, `${EINK_ART[x.art] || 'Einkommen'}${x.text ? ' (' + x.text + ')' : ''} endet`, x.betrag, { proJahr: true });
    });
    wuensche.forEach((w) => {
      const nm = w.name || '';
      if (w.typ === 'einmal' && w.betrag! > 0) ev(einmalA(w), 0, `Wunsch: ${nm || 'einmalige Ausgabe'}`, w.betrag, { wunsch: true });
      if (w.typ === 'jahr' && w.betrag! > 0) ev(abAlter(p1, w.von || 0), 0, `Wunsch beginnt: ${nm || 'wiederkehrend'} (bis ${w.bis})`, w.betrag, { proJahr: true, wunsch: true });
      if (w.typ === 'ausland') ev(abAlter(p1, w.von || 0), 0, `Wunsch beginnt: ${w.monate || 0} Monate pro Jahr ${nm || 'im Ausland'} (${w.wohnform === 'kauf' ? 'Kauf' : 'Miete'}, bis ${w.bis})`, null, { wunsch: true });
    });
    ps.forEach((p, i) => {
      if (p.teil) {
        ev(p.teil.Ateil, i, `Teilpensionierung: Pensum ${Math.round(p.teil.pensum * 100)}% (Alter ${Math.floor(alterBei(p, p.teil.Ateil))})`);
        if (p.teil.pk.rente > 0) ev(p.teil.Ateil, i, `PK-Teilrente beginnt (${Math.round(p.teil.q * 100)}% der Leistung)`, p.teil.pk.rente, { proJahr: true });
        if (!p.teil.bezug) ev(p.teil.Ateil, i, p.teil.zuFrueh ? `PK-Teilbezug erst ab ${p.minAlter || P.bvg.minAlter} möglich: weiter versichert` : 'PK: kein Teilbezug, weiter versichert');
      }
      if (p.Aret > A0) ev(p.Aret, i, `${p.teil ? 'Volle ' : ''}Pensionierung, Lohn endet (Alter ${Math.floor(alterBei(p, p.Aret))})`);
      else ev(A0, i, p.Aret < A0 ? `Bereits pensioniert (Alter ${Math.floor(alterBei(p, A0))})` : `Sofort aufhören (Alter ${Math.floor(alterBei(p, A0))})`);
      if (pkKapVorbei[i]) ev(A0, i, 'PK-Kapital nicht eingerechnet: Die Pensionierung liegt zurück, ein bezogenes Kapital gehört ins freie Vermögen', null, { warn: true });
      if (p.pk.rente > 0) ev(p.Aret, i, 'PK-Rente beginnt', p.pk.rente, { proJahr: true });
      if (p.pk.fz > 0) ev(p.Aret, i, `Austritt vor ${p.minAlter || P.bvg.minAlter}: PK-Guthaben wird zu Freizügigkeit`, p.pk.fz);
      const bezTxt = p.ahvBez < 0 ? ` (Vorbezug ${-p.ahvBez} J., -${((1 - p.ahvF) * 100).toFixed(1)}%)` : p.ahvBez > 0 ? ` (Aufschub ${p.ahvBez} J., +${((p.ahvF - 1) * 100).toFixed(1)}%)` : '';
      // Betrag wird nach der Rechnung mit der tatsächlich ausbezahlten (allenfalls plafonierten) Rente ersetzt
      ev(Math.max(A0, p.Aahv), i, `AHV-Rente ${p.Aahv < A0 ? 'läuft' : 'beginnt'}${bezTxt}`, ahvMonat(p, PX(p.Aahv).ahv) * p.ahvF * PX(p.Aahv).ahv.monatsrentenProJahr, { proJahr: true, ahv: true });
    });
    zufluesse.filter((z) => z.A <= Aend).forEach((z) => ev(z.A, null, `Zufluss: ${z.name || 'einmaliger Zufluss'}`, z.betrag));
    if (ps.length) ev(Math.max(...ps.map((p) => p.A75)), null, `Ausgaben sinken um ${Math.round((1 - inp.reduktion75) * 100)}% (jüngere Person 75)`);

    for (let Am = A0; Am <= Aend; Am++) {
      const year = Math.floor(Am / 12), t = Am - A0, I = Math.pow(1 + infM, t);
      if (!cur || cur.year !== year) {
        if (cur) rows.push(schliesse(cur));
        cur = { year, ages: ps0.map((p) => year - p.jahrgang), Vstart: V, lohn: 0, lohnP: ps0.map(() => 0), ahv: 0, pk: 0, kapBrutto: 0, kapSt: 0, kapZu: 0, amort: 0, ne: 0, uebrig: 0, steuern: 0, stVerm: 0, stErtrag: 0, ausgaben: 0, ertrag: 0, einz3a: 0, wAus: 0, wEin: 0, wEinLauf: 0, lgNetto: 0, amortFrei: 0, I } as SimRow;
        cur.age = cur.ages[0];
      }
      let lohn = 0, pk = 0, ne = 0, einz3a = 0, amort = 0, kapIn = 0, kapSt = 0;
      const lohnP = ps.map(() => 0); // Lohn je Person (nur zur Darstellung; die Summe ist lohn)
      const Px = PX(Am), H = Px.ahv, tG = tX(Am);
      // Vermögen für die Beiträge als Nichterwerbstätige: freies Vermögen plus Liegenschaften abzüglich Hypotheken
      const immo = lgs.reduce((x, l, k) => x + (lgSt[k].verkauft ? 0 : l.verkehrswert * I - lgSt[k].hyp), 0)
        + wuensche.reduce((x, w, k) => x + (w.typ === 'ausland' && w.wohnform === 'kauf' && wState[k].gekauft && !wState[k].verkauft ? { ...W_DEF, ...w }.kaufpreis * I : 0), 0);
      const vermNE = Math.max(0, V + immo);
      // Ehegatten sind befreit, wenn der erwerbstätige Partner mindestens den doppelten Mindestbeitrag bezahlt
      const LB = AHV.lohnbeitrag ?? AHV_LOHNBEITRAG;
      const addKap = (i: number, betrag: number, art: string, still?: boolean) => {
        if (!(betrag > 0)) return 0;
        const key = married ? `${year}` : `${year}-${i}`;
        // Die Tarifstufen werden wie bei der Vermögenssteuer mit der Teuerung fortgeschrieben (Ausgleich der kalten
        // Progression): gerechnet wird in heutiger Kaufkraft, die Steuer danach wieder in Franken des Bezugsjahres.
        const before = kapSumJahr[key] || 0, after = before + betrag / I;
        const tx = (kapSteuer(inp.kanton, after, married) - kapSteuer(inp.kanton, before, married)) * I;
        kapSumJahr[key] = after;
        kapIn += betrag;
        kapSt += tx;
        kapListe.push({ year, A: Am, datum: fmtA(Am), person: i, age: Math.floor(alterBei(ps[i], Am)), art, betrag, steuer: tx, I });
        if (!still) ev(Am, i, `${art} ausbezahlt`, betrag, { steuer: tx });
        return tx;
      };
      const Iahv = Math.pow(1 + ahvM, tG), niv = H.minRente * Iahv;
      am = am && !ahvGrenzen.has(Am) ? ahvWeiter(am, ahvZ, niv) : ahvMonatAlle(ps, Am, H, married, ahvZ, niv);
      // Jahresbetrag: Renten mit der 13. Rente, fortgeschrieben; der Rentenzuschlag zwölfmal und ohne Fortschreibung
      const ahvJahr = am.rente * H.monatsrentenProJahr * Iahv + am.zuschlag * 12;
      const ahv = ahvJahr / 12;
      ps.forEach((p, i) => {
        if (ahvStart[i] == null && Am >= p.Aahv && am!.pers[i]) ahvStart[i] = am!.pers[i].pay * H.monatsrentenProJahr * Iahv + am!.pers[i].zs * 12;
      });
      /** AHV-Rente der Person j pro Jahr in Franken des Monats (0, solange sie keine bezieht). */
      const ahvJ = (j: number) => (am!.pers[j] ? am!.pers[j].pay * H.monatsrentenProJahr * Iahv + am!.pers[j].zs * 12 : 0);
      ps.forEach((p, i) => {
        const s = st[i], working = Am < p.Aret;
        const inTeil = p.teil && Am >= p.teil.Ateil && working;
        if (working) { lohnP[i] = ((num(p.brutto) * (inTeil ? p.teil!.pensum : 1)) / 12) * I * (1 - A.sozialabgaben) * (1 - sE); lohn += lohnP[i]; }
        if (p.teil && Am === p.teil.Ateil && p.teil.pk.kapital > 0) addKap(i, p.teil.pk.kapital, 'PK-Teilkapital');
        if (p.teil && Am >= p.teil.Ateil) pk += p.teil.pk.rente / 12;
        if (Am === p.Aret) {
          if (p.pk.kapital > 0) addKap(i, p.pk.kapital, 'PK-Kapital');
          if (p.pk.fz > 0) s.fz += p.pk.fz;
        }
        if (Am === p.Akap) {
          addKap(i, s.s3a, 'Säule 3a');
          s.s3a = 0;
          addKap(i, s.fz, 'Freizügigkeit');
          s.fz = 0;
        }
        if (Am > p.Akap && s.fz > 0) {
          addKap(i, s.fz, 'Freizügigkeit');
          s.fz = 0;
        }
        if (Am < p.Akap) {
          s.s3a *= 1 + mz(rate(p.s3aAnlage || 'konto', d, inp));
          s.fz *= 1 + mz(rate(p.fzAnlage || 'konto', d, inp));
          const e3 = working ? s3aJahr(inp, p, t) / 12 : 0;
          if (e3 > 0) {
            s.s3a += e3;
            einz3a += e3;
          }
        }
        if (!working) pk += p.pk.rente / 12;
        // Beiträge als Nichterwerbstätige: wer nicht mehr arbeitet, und wer nur noch mit einem Pensum unter 50% arbeitet
        // (nicht dauernd voll erwerbstätig; die Vergleichsrechnung entscheidet)
        {
          if (Am < p.Aref && (!working || (inTeil && p.teil!.pensum < 0.5))) {
            // Beitrag als Nichterwerbstätige (Art. 28 AHVV; Merkblatt 2.03): Vermögen plus 20-faches jährliches
            // Renteneinkommen. Dazu zählen Renten und Pensionen aller Art, also PK-Renten und bereits laufende
            // AHV-Renten; Verheiratete je die Hälfte des gemeinsamen Betrags.
            const renten = (q: (typeof ps)[number], j: number) => (Am >= q.Aret ? q.pk.rente : 0) + (q.teil && Am >= q.teil.Ateil ? q.teil.pk.rente : 0) + ahvJ(j);
            const basis = married ? (vermNE + Px.ne.rentenFaktor * ps.reduce((x, q, j) => x + renten(q, j), 0)) / 2 : (ps.length > 1 ? vermNE / 2 : vermNE) + Px.ne.rentenFaktor * renten(p, i);
            const idx = Math.pow(1 + num(inp.inflation) / 100, year - (Pn && Am >= A1 ? BASIS + 1 : BASIS));
            const voll = neBeitrag(basis / idx, Px) * idx;
            /**
             * Gilt Person j im Sinne der AHV als erwerbstätig, und wie viel Beitrag zahlt sie auf dem Lohn?
             * Dauernd voll erwerbstätig (Hauptstelle mit mindestens 50%) oder, bei Teilzeit unter 50% und bei einem
             * Nebenerwerb, wenn die Lohnbeiträge den Mindestbeitrag und die Hälfte des eigenen Beitrags als
             * Nichterwerbstätige erreichen (Vergleichsrechnung, Art. 28bis AHVV).
             */
            const erwerb = (q: (typeof ps)[number], j: number) => {
              const stelle = Am < q.Aret, inTeil = stelle && q.teil && Am >= q.teil.Ateil;
              let lohn = (stelle ? num(q.brutto) * (inTeil ? q.teil!.pensum : 1) : 0) + nebenLohn(j, Am);
              // Ab dem Referenzalter sind Beiträge nur auf dem Teil über dem Freibetrag geschuldet (Art. 6quater AHVV)
              if (Am >= q.Aref) lohn = Math.max(0, lohn - (AHV.freibetragRentner ?? 16800));
              const beitrag = lohn * I * LB;
              const voll50 = stelle && num(q.brutto) > 0 && !(inTeil && q.teil!.pensum < 0.5);
              return { beitrag, gilt: voll50 || (beitrag >= Px.ne.min * idx && beitrag >= voll / 2) };
            };
            // Ehegatten: befreit, wenn der Partner als erwerbstätig gilt und mindestens den doppelten Mindestbeitrag
            // bezahlt (Art. 3 Abs. 3 Bst. a AHVG; Merkblatt 2.03 Ziff. 3)
            const partnerBefreit = married && ps.some((q, j) => { if (j === i) return false; const e = erwerb(q, j); return e.gilt && e.beitrag >= 2 * Px.ne.min * idx; });
            if (!partnerBefreit) {
              // Eigener Nebenerwerb: befreit nach der Vergleichsrechnung, sonst werden die Lohnbeiträge angerechnet
              const eig = erwerb(p, i);
              if (!eig.gilt) ne += Math.max(0, voll - eig.beitrag) / 12;
            }
          }
        }
      });
      let uebrig = 0;
      eink.forEach((x) => {
        if (Am >= x.endA || Am < x.startA) return;
        const idx = x.art === 'nebenerwerb' || x.art === 'spesen' ? I : 1;
        const netto = x.art === 'spesen' ? 1 : x.art === 'nebenerwerb' ? (1 - A.sozialabgaben) * (1 - sE) : 1 - sE;
        uebrig += (x.betrag / 12) * idx * netto;
      });
      let amortFrei = 0;
      amorts.filter((x) => x.A === Am).forEach((x) => {
        const ls = lgSt[x.lg];
        if (!ls || ls.verkauft) return;
        const q = x.quelle || 'frei';
        let b = Math.min(x.betrag, ls.hyp);
        const nm = lgs[x.lg].name || 'Liegenschaft';
        if (q === 'frei') {
          if (b <= 0) return;
          ls.hyp -= b;
          amortFrei += b;
          ev(Am, null, `Amortisation ${nm} aus freiem Vermögen (Hypothek neu ${Math.round(ls.hyp).toLocaleString('de-CH')})`, b, { amort: true });
          return;
        }
        const i = +q.slice(-1), s = st[i];
        if (!s) return;
        const key = q.startsWith('3a') ? 's3a' : 'fz';
        b = Math.min(b, s[key]);
        if (b <= 0) return;
        s[key] -= b;
        ls.hyp -= b;
        amort += b;
        const tx = addKap(i, b, `${key === 's3a' ? '3a' : 'Freizügigkeit'}-Vorbezug für Amortisation ${nm}`, true);
        ev(Am, i, `Amortisation ${nm} aus ${key === 's3a' ? 'Säule 3a' : 'Freizügigkeit'} (Vorbezug, Hypothek neu ${Math.round(ls.hyp).toLocaleString('de-CH')})`, b, { steuer: tx, amort: true });
      });
      const anyRet = ps.some((p) => Am >= p.Aret), allRet = ps.every((p) => Am >= p.Aret);
      const youngestA = Math.max(...ps.map((p) => birthA(p)));
      let ausg = (anyRet ? ausgRuhe : ausgHeute) * I;
      if (anyRet && Am >= youngestA + 75 * 12 + 1) ausg *= inp.reduktion75;
      let lgKosten = 0, lgMiete = 0, lgVerkauf = 0, lgKauf = 0;
      lgs.forEach((l, k) => {
        const s = lgSt[k];
        // bbz360 (ADR-19): Kauf. Der Preis steht in heutiger Kaufkraft, die Hypothek im selben Verhältnis dazu. Die
        // Eigenmittel fliessen aus dem freien Vermögen ab; ein PK-Vorbezug fliesst als besteuerter Kapitalbezug zu.
        if (s.kommt && Am === kaufA(l)) {
          // Der PK-Vorbezug steht wie der Kaufpreis in heutiger Kaufkraft
          s.kommt = false;
          s.verkauft = false;
          s.hyp = num(l.hypothek) * I;
          s.hyp0 = s.hyp;
          const eigen = Math.max(0, l.verkehrswert * I - s.hyp);
          lgKauf += eigen;
          const fremd = Math.min(num(l.kaufFremd) * I, eigen);
          const tx = fremd > 0 ? addKap(0, fremd, `PK-Vorbezug für ${l.name || 'Liegenschaft'}`, true) : 0;
          ev(Am, null, `Kauf ${l.name || 'Liegenschaft'} (Eigenmittel${fremd > 0 ? `, davon PK-Vorbezug ${Math.round(fremd).toLocaleString('de-CH')}` : ''}; Hypothek ${Math.round(s.hyp).toLocaleString('de-CH')})`, eigen, tx > 0 ? { steuer: tx } : undefined);
        }
        if (s.verkauft) return;
        if (l.verkaufAlter > 0 && Am === abAlter(ps0[0], l.verkaufAlter)) {
          s.verkauft = true;
          const erl = l.verkehrswert * I * 0.97 - s.hyp;
          lgVerkauf += erl;
          ev(Am, null, `Verkauf ${l.name || 'Liegenschaft'} (Erlös nach 3% Kosten und Rückzahlung Hypothek)`, erl);
          s.hyp = 0;
          return;
        }
        if (l.typ === 'eigen' || !l.typ) {
          ausg -= (Math.max(0, s.hyp0 - s.hyp) * num(l.zins)) / 100 / 12;
          // bbz360 (ADR-19): Bei einem heute bewohnten Eigenheim stecken die Wohnkosten in den erfassten Ausgaben.
          // Nach einem Kauf in der Zukunft kommen Zins, Unterhalt und Nebenkosten dazu, die bisherige Miete fällt weg.
          // Die bisherige Miete steckt in den Ausgaben und sinkt mit ihnen ab 75 um denselben Satz; die Ausgaben
          // werden nicht negativ.
          if (kuenftig(l)) {
            const red75 = anyRet && Am >= youngestA + 75 * 12 + 1 ? inp.reduktion75 : 1;
            ausg = Math.max(0, ausg + (s.hyp0 * num(l.zins)) / 100 / 12 + (l.verkehrswert * I * (l.unterhalt ?? 0.5)) / 100 / 12 + num(l.nebenkosten) * I - num(l.kaufMieteWeg) * I * red75);
          }
        } else {
          const kost = (s.hyp * num(l.zins)) / 100 / 12 + (l.verkehrswert * I * (l.unterhalt ?? 1)) / 100 / 12;
          const miete = (num(l.mietertrag) * I) / 12;
          lgKosten += kost + sE * Math.max(0, miete - kost);
          lgMiete += miete;
        }
      });
      const hyp = hypSum();
      let wAus = 0, wEin = 0, wEinLauf = 0;
      // bbz360 (ADR-19): Zuflüsse in heutiger Kaufkraft
      const zufluss = zufluesse.reduce((x, z) => x + (z.A === Am ? z.betrag * I : 0), 0);
      const a1 = alterBei(p1, Am);
      wuensche.forEach((w, k) => {
        const s = wState[k];
        if (w.typ === 'einmal' && Am === einmalA(w)) wAus += num(w.betrag) * I;
        if (w.typ === 'jahr' && a1 >= (w.von || 0) && a1 < (w.bis || 0)) wAus += (num(w.betrag) / 12) * I;
        if (w.typ === 'ausland') {
          const g = { ...W_DEF, ...w }, aktiv = a1 >= (w.von || 0) && a1 < (w.bis || 0);
          if (w.wohnform === 'kauf') {
            if (!s.gekauft && Am >= abAlter(p1, w.von || 0)) {
              s.gekauft = true;
              const b = g.kaufpreis * (1 + g.nebenkosten / 100) * I;
              wAus += b;
              ev(Am, 0, `Kauf Liegenschaft ${w.name || 'Ausland'} inkl. ${g.nebenkosten}% Nebenkosten`, b, { wunsch: true });
            }
            if (s.gekauft && !s.verkauft && g.verkaufAlter > 0 && Am === abAlter(p1, g.verkaufAlter)) {
              s.verkauft = true;
              const v = g.kaufpreis * I * 0.97;
              wEin += v;
              ev(Am, 0, `Verkauf Liegenschaft ${w.name || 'Ausland'} (abzüglich 3% Kosten)`, v, { wunsch: true });
            }
          }
          const besitz = w.wohnform === 'kauf' && s.gekauft && !s.verkauft;
          if (aktiv || besitz) {
            const j = auslandJahr(aktiv ? g : { ...g, monate: 0, reise: 0 }, ausg / I, w.wohnform, 0);
            if (!aktiv && besitz) j.wohnen = (g.kaufpreis * g.laufend) / 100;
            wAus += ((j.leben + j.wohnen + (aktiv ? j.reise : 0) + j.verwaltung + j.steuerVorOrt) / 12) * I;
            wEin += ((j.einsparung + j.vermietung) / 12) * I;
            wEinLauf += ((j.einsparung + j.vermietung) / 12) * I;
          }
        }
      });
      const lgAusland = wuensche.reduce((x, w, k) => x + (w.typ === 'ausland' && w.wohnform === 'kauf' && wState[k].gekauft && !wState[k].verkauft ? { ...W_DEF, ...w }.kaufpreis * I : 0), 0);
      const steuern = sE * (ahv + pk);
      const ertrag = V > 0 ? V * rm : 0;
      // Vermögenssteuer auf dem Reinvermögen: freies Vermögen plus Liegenschaften in der Schweiz zum Steuerwert
      // (Anteil des Verkehrswerts) abzüglich Hypotheken; 3a, Freizügigkeit und PK sind steuerfrei.
      const lgRein = lgs.reduce((x, l, k) => x + (lgSt[k].verkauft ? 0 : l.verkehrswert * I * steuerwertLg - lgSt[k].hyp), 0);
      const stVerm = vermSteuerJahr(inp, Math.max(0, Math.max(0, V) + lgRein), I) / 12;
      // Einkommenssteuer auf dem steuerbaren Teil der Erträge (Zinsen, Dividenden; Kursgewinne sind steuerfrei)
      const stErtrag = sE * qE * Math.max(0, ertrag);
      const kapZu = kapIn - kapSt - amort;
      V = V + ertrag + lohn + uebrig + ahv + pk + kapZu - ausg - steuern - stVerm - stErtrag - ne - einz3a - wAus + wEin - amortFrei - lgKosten + lgMiete + lgVerkauf + zufluss - lgKauf;
      if (zufluss) cur.zufluss = (cur.zufluss || 0) + zufluss;
      if (lgKauf) cur.lgKauf = (cur.lgKauf || 0) + lgKauf;
      kapSteuerTotal += kapSt / I;
      cur.lohn += lohn; lohnP.forEach((l, i) => { cur!.lohnP[i] += l; }); cur.ahv += ahv; cur.pk += pk; cur.kapBrutto += kapIn; cur.kapSt += kapSt; cur.kapZu += kapZu; cur.amort += amort;
      cur.ne += ne; cur.uebrig += uebrig; cur.steuern += steuern; cur.stVerm += stVerm; cur.stErtrag += stErtrag; cur.ausgaben += ausg; cur.ertrag += ertrag; cur.einz3a += einz3a;
      cur.wAus += wAus; cur.wEin += wEin; cur.wEinLauf += wEinLauf; cur.lgAusland = lgAusland; cur.lgNetto += lgMiete - lgKosten + lgVerkauf; cur.amortFrei += amortFrei;
      cur.V = V; cur.hyp = hyp; cur.I = I; cur.anyRet = cur.anyRet || anyRet; cur.allRet = allRet; cur.allAhv = ps.every((p) => Am >= p.Aahv);
      const snap = () => ({
        A: Am, datum: fmtA(Am), age: Math.floor(alterBei(ps[0], Am)), year, V: Math.max(0, V), offen: st.reduce((x, y) => x + y.s3a + y.fz, 0), ahv12: ahvJahr, pk: pk * 12, hyp,
        vw: lgs.reduce((x, l, k) => x + (lgSt[k].verkauft ? 0 : l.verkehrswert), 0),
        miete: lgs.reduce((x, l, k) => x + (lgSt[k].verkauft || l.typ === 'eigen' ? 0 : num(l.mietertrag)), 0) * I,
      });
      if (allRet && !snapRet) snapRet = snap();
      if (allRet && ps.every((p) => Am >= Math.max(p.Aahv, p.Aref)) && !snapAhv) snapAhv = snap();
      if (V < 0 && depleted == null) {
        depleted = Math.floor(alterBei(ps[0], Am));
        depletedA = Am;
        depletedBeforeRet = !anyRet;
        ev(Am, null, 'Freies Vermögen aufgebraucht', null, { warn: true });
      }
    }
    rows.push(schliesse(cur!));
    events.forEach((e) => { if (e.ahv && ahvStart[e.person!] != null) e.betrag = ahvStart[e.person!]; });
    const firstRet = Math.min(...ps.map((p) => p.Aret));
    const retRows = rows.filter((r) => r.year >= Math.floor(firstRet / 12));
    const last = rows[rows.length - 1];
    events.sort((a, b) => a.A - b.A || (a.person ?? 9) - (b.person ?? 9));
    const lastYearAusg = last.ausgaben * (12 / Math.max(1, (Aend % 12) + 1));
    return { rows, events, depleted, depletedA, depletedBeforeRet, endV: last.V, reserve: Math.max(num(inp.reserveJahre) * lastYearAusg, zielReal * last.I), zielReal, lgs, ps, kapListe, horizont, kapSteuerTotal, snapRet, snapAhv, retRows, pkKapVorbei };
  }

  // ---------- Auswertungen ----------
  const reicht = (res: Pick<ReturnType<typeof simulate>, 'depleted' | 'endV' | 'reserve'>) => res.depleted == null && res.endV >= res.reserve;
  /** Eigenkapital der Liegenschaften in heutiger Kaufkraft. */
  function eigenkapitalReal(inp: Pick<EngineInput, 'liegenschaften'>, row?: Pick<SimRow, 'lgWerte' | 'lgHyp' | 'I'> | null) {
    const lgs = getLgs(inp);
    if (!lgs.length) return 0;
    if (row && row.lgWerte) return Math.max(0, row.lgWerte.reduce((x, v, k) => x + v / row.I - row.lgHyp[k] / row.I, 0));
    // bbz360 (ADR-19): Ohne Jahreszeile ist der Stand von heute gemeint; ein Kauf in der Zukunft zählt noch nicht.
    return Math.max(0, lgs.reduce((x, l) => x + (kuenftig(l) ? 0 : l.verkehrswert - num(l.hypothek)), 0));
  }
  /** Ampel: Basisszenario und Stresstest (Rendite -1 Prozentpunkt, Horizont 100). */
  function ampel(inp: EngineInput, ov: SimOptionen = {}) {
    const base = simulate(inp, ov), stress = simulate(inp, { ...ov, renditeDelta: -0.01, horizont: 100 });
    let st = base.depleted != null ? 'rot' : reicht(base) && stress.depleted == null ? 'gruen' : 'gelb';
    let reserveLg = null, reserveGesperrt = null;
    const lastB = base.rows[base.rows.length - 1];
    if (st === 'gelb') {
      const lastS = stress.rows[stress.rows.length - 1];
      const defStress = stress.depleted != null ? -Math.min(0, ...stress.rows.map((r) => r.V / r.I)) : 0;
      const defReserve = Math.max(0, (base.reserve - base.endV) / lastB.I);
      const ek = eigenkapitalReal(inp, stress.depleted != null ? lastS : lastB);
      const spaet = stress.depleted == null || stress.depleted >= 85;
      const bedarf = Math.max(defStress, defReserve);
      if (spaet && ek > 0 && ek >= bedarf) {
        // Die Liegenschaft zählt nur als Reserve, wenn die Bank die Hypothek nach der Pensionierung noch als tragbar
        // beurteilt: Sonst wäre eine höhere Belehnung nicht möglich, und es bliebe nur der Verkauf.
        const tr = tragbarkeit(base, inp);
        if (tr && tr.worst.st === 'rot') reserveGesperrt = { bedarf, ek, quote: tr.worst.quote };
        // bbz360 (ADR-19): Für eine erst später gekaufte Liegenschaft gibt es keine Tragbarkeitsprüfung zum
        // Zeitpunkt der Pensionierung; ohne Prüfung zählt sie nicht als Reserve (die Ampel bleibt gelb).
        else if (!tr && getLgs(inp).some(kuenftig)) reserveLg = null;
        else {
          st = 'gruen';
          reserveLg = { bedarf, ek, ab: stress.depleted };
        }
      }
    }
    const defBase = base.depleted != null ? -Math.min(0, ...base.rows.map((r) => r.V / r.I)) : 0;
    const ekEnde = eigenkapitalReal(inp, lastB);
    let lgRot = null;
    if (st === 'rot' && !base.depletedBeforeRet && base.depleted! >= 85 && ekEnde > 0 && ekEnde >= defBase) {
      st = 'gelb';
      lgRot = { bedarf: defBase, ek: ekEnde, ab: base.depleted };
    }
    return { st, base, stress, reserveLg, reserveGesperrt, lgRot, ekEnde, defBase };
  }
  /** Höchste tragbare Ausgaben im Ruhestand (CHF pro Monat, heutige Kaufkraft). */
  function maxAusgaben(inp: EngineInput, ov: SimOptionen = {}) {
    let lo = 0, hi = 50000;
    const ok = (x: number) => reicht(simulate(inp, { ...ov, ausgaben: x }));
    if (!ok(0)) return 0;
    // Sehr grosse Vermögen: obere Grenze verdoppeln, bis sie nicht mehr tragbar ist (höchstens 1,6 Mio. pro Monat)
    for (let k = 0; k < 5 && ok(hi); k++) { lo = hi; hi *= 2; }
    for (let k = 0; k < 24; k++) {
      const mid = (lo + hi) / 2;
      if (ok(mid)) lo = mid;
      else hi = mid;
    }
    return lo;
  }
  /** Tragbarkeit der Hypotheken aus Sicht der Bank nach der Pensionierung und mit AHV. */
  function tragbarkeit(res: Pick<ReturnType<typeof simulate>, 'snapRet' | 'snapAhv'>, inp: Pick<EngineInput, 'liegenschaften' | 'tragGrenze'>) {
    const lgs = getLgs(inp);
    if (!lgs.some((l) => l.hypothek > 0)) return null;
    const g = num(inp.tragGrenze) / 100, T = A.tragbarkeit;
    const pick = (s: SimSnap | null, label: string) => {
      if (!s || !(s.vw > 0)) return null;
      const eink = s.ahv12 + s.pk + (s.miete || 0) + T.verzehr * (s.V + s.offen * 0.9);
      const kosten = s.hyp * T.zins + s.vw * T.unterhalt;
      const quote = eink > 0 ? kosten / eink : 9;
      const maxHyp = Math.max(0, (g * eink - s.vw * T.unterhalt) / T.zins);
      return { label, A: s.A, age: s.age, datum: s.datum, eink, kosten, quote, maxHyp, hyp: s.hyp, amort: Math.max(0, s.hyp - maxHyp), st: quote <= g ? 'gruen' : quote <= g + 0.05 ? 'gelb' : 'rot' };
    };
    const pts = [pick(res.snapRet, 'nach der Pensionierung'), pick(res.snapAhv, 'mit AHV')].filter(Boolean) as TragPunkt[];
    if (!pts.length) return null;
    return { pts, worst: pts.reduce((m, x) => (x.quote > m.quote ? x : m)), grenze: g };
  }
  /** Vorschlag zusätzlicher 3a-Vorbezüge zur Amortisation, damit die Hypothek tragbar bleibt. */
  function vorschlagVorbezug(inp: EngineInput) {
    const res = simulate(inp);
    const tr = tragbarkeit(res, inp);
    if (!tr || tr.worst.st === 'gruen') return null;
    let need = tr.worst.amort;
    const ps = res.ps, out: { person: number; alter: number; betrag: number }[] = [], bestehend = getAmort(inp);
    const order = ps.map((_p, i) => i).sort((a, b) => ps[a].Aret - ps[b].Aret);
    const jahre = new Set(bestehend.filter((x) => x.quelle !== 'frei').map((x) => Math.floor(amortMonat(inp, x) / 12)));
    for (const i of order) {
      if (need <= 0) break;
      const p = ps[i], a0 = Math.ceil(alterBei(p, A0));
      let alter = Math.max(a0, Math.floor(p.stopAlter) - 1);
      while (jahre.has(Math.floor(abAlter(p, alter) / 12)) && alter > a0) alter--;
      const n = Math.max(0, abAlter(p, alter) - A0), r3 = mz(rate(p.s3aAnlage || 'konto', 0, inp));
      let s = num(p.s3a);
      for (let k = 0; k < n; k++) s = s * (1 + r3) + s3aJahr(inp, p, k) / 12;
      s -= bestehend.filter((x) => x.quelle === '3a' + i).reduce((x, y) => x + num(y.betrag), 0);
      const b = Math.min(need, Math.floor(Math.max(0, s) / 1000) * 1000);
      if (b > 0) {
        out.push({ person: i, alter, betrag: b });
        need -= b;
        jahre.add(Math.floor(abAlter(p, alter) / 12));
      }
    }
    if (!out.length) return null;
    const erfasst = Array.isArray(inp.liegenschaften) ? inp.liegenschaften : [];
    const mitWert = (l: Liegenschaft) => l && l.verkehrswert > 0;
    let lgIdx = erfasst.findIndex((l) => mitWert(l) && (l.typ || 'eigen') === 'eigen');
    if (lgIdx < 0) lgIdx = Math.max(0, erfasst.findIndex(mitWert));
    const am = out.map((v) => {
      const Am = Math.max(A0, abAlter(ps[v.person], v.alter));
      return { lg: lgIdx, betrag: v.betrag, jahr: Math.floor(Am / 12), monat: (Am % 12) + 1, quelle: ('3a' + v.person) as AmortQuelle };
    });
    const inp2 = { ...inp, amortisationen: [...bestehend, ...am] };
    return { vorbezug: out, amortisationen: am, restBedarf: Math.max(0, need), trag: tragbarkeit(simulate(inp2, {}), inp2), ohne: tr, zusaetzlich: bestehend.length > 0 };
  }
  /** Geplanter Ausstiegsmonat (erster Monat ohne Lohn) der betroffenen Person(en). */
  function planStop(inp: Pick<EngineInput, 'haushalt' | 'personen'>, wer?: number | null) {
    const ps = inp.haushalt === 'single' ? inp.personen.slice(0, 1) : inp.personen.slice(0, 2);
    const sel = wer == null || !ps[wer] ? ps : [ps[wer]];
    return Math.max(...sel.map((p) => abAlter(p, p.pensAlter)));
  }
  /**
   * «Sofort aufhören»: Ampel bei Ausstieg im Monat stopA (erster Monat ohne Lohn) und frühester Monat mit
   * grüner Ampel. wer: Index der Person, die früher aufhört; null = alle. Frühestens möglich ist ein Ausstieg
   * Ende des laufenden Monats (stopA = A0 + 1).
   */
  function sofort(inp: EngineInput, stopA = A0 + 1, knownAb?: number | null, wer: number | null = null) {
    const ov = { stopWer: wer };
    const now = ampel(inp, { ...ov, stopA: Math.max(A0 + 1, stopA) });
    const lastPlan = planStop(inp, wer);
    // frühester Monat mit grüner Ampel; hängt nicht vom gewählten Zeitpunkt ab und kann übergeben werden
    let ab = knownAb !== undefined ? knownAb : null;
    if (knownAb === undefined) {
      for (let Am = A0 + 1; Am <= lastPlan; Am++) {
        if (ampel(inp, { ...ov, stopA: Am }).st === 'gruen') {
          ab = Am;
          break;
        }
      }
    }
    const abRes = ab != null ? simulate(inp, { ...ov, stopA: ab }) : null;
    return { now, ab, wer, plan: lastPlan, abDatum: ab != null ? fmtA(ab) : null, abAges: abRes ? abRes.ps.map((p) => p.stopAlter) : null };
  }
  /** Was fehlt: Kapital (Überbrückung, bis Horizont, mit Reserve) oder tiefere Ausgaben. */
  function luecke(inp: EngineInput, stopA = A0 + 1, wer: number | null = null) {
    const ov = { stopA, stopWer: wer };
    // zusätzliches Kapital wird angelegt wie das übrige freie Vermögen (gleiches Verhältnis Konten/Wertschriften)
    const q = liqAnteil(inp);
    const run = (x: number) => simulate({ ...inp, liquiditaet: num(inp.liquiditaet) + x * q, wertschriften: num(inp.wertschriften) + x * (1 - q) }, ov);
    const need = (cond: (r: ReturnType<typeof simulate>) => boolean) => {
      if (cond(run(0))) return 0;
      let lo = 0, hi = 10000000;
      if (!cond(run(hi))) return null;
      for (let k = 0; k < 24; k++) {
        const mid = (lo + hi) / 2;
        if (cond(run(mid))) hi = mid;
        else lo = mid;
      }
      return hi;
    };
    const base = simulate(inp, ov);
    const bridgeA = Math.max(...base.ps.map((p) => Math.max(p.Akap, p.Aret)));
    const bridge = need((r) => r.depletedA == null || r.depletedA >= bridgeA);
    const liq = need((r) => r.depleted == null);
    const total = need(reicht);
    const ausg = maxAusgaben(inp, ov);
    return { bridge, bridgeDatum: fmtA(bridgeA), liq, total, ausg, ek: eigenkapitalReal(inp, null), depA: base.depletedA, depDatum: base.depletedA != null ? fmtA(base.depletedA) : null };
  }
  /** Erwartetes Sterbealter (BFS, Lebenserwartung mit 65), für Ältere grob fortgeschrieben. */
  function leAlter(p: PJg) {
    const e65 = P.le65[p.geschlecht === 'w' ? 'w' : 'm'], x = BASIS - p.jahrgang;
    if (x <= 65) return 65 + e65;
    return Math.max(65 + e65, x + e65 * Math.pow(Math.max(0, 100 - x) / 35, 1.3));
  }

  return {
    P, Pn, A0, BASIS, fmtA, birthA, abAlter, alterBei, refAlter, uebergang, maxVorbezug, ahvFormel, ahvMonat, ahvFaktor, ahvPlan, ahvSkala, rentenzuschlag, plafond, einkAusRente, kapSteuer, vermSteuerTab, vermSteuerJahr, vermSteuerHeute, neBeitrag,
    rateHaupt, liqAnteil, pkBeiAlter, getLgs, getAmort, amortMonat, s3aJahr, auslandJahr, simulate, reicht,
    eigenkapitalReal, ampel, maxAusgaben, tragbarkeit, vorschlagVorbezug, planStop, sofort, luecke, leAlter,
  };
}

export type Engine = ReturnType<typeof createEngine>;
/** Ergebnis eines Rechenlaufs (simulate). */
export type SimErgebnis = ReturnType<Engine['simulate']>;
/** Person mit den Zeitpunkten und Leistungen der Rechnung (SimErgebnis.ps). */
export type SimPerson = SimErgebnis['ps'][number];
export type AmpelErgebnis = ReturnType<Engine['ampel']>;
export type Tragbarkeit = NonNullable<ReturnType<Engine['tragbarkeit']>>;
