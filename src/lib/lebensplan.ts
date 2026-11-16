// ============================================================================
// lebensplan.ts — ein Plan ueber alle Module (Zielbild Fusion, Phase 5).
// Fuehrt Ziele & Wuensche (06), Eigenheimkauf (07a), Anlage (07b) und den
// Haushalts-Stand der Pensionierung (07c) zu EINEM Stand zusammen, den der
// Pensionierungs-Rechenkern rechnet. Der Stand ist abgeleitet und wird nicht
// gespeichert; Quelle bleiben die Module. KEIN DOM.
//
// Was mitrechnet und was nur vorgemerkt ist, steht je Eintrag in `hinweis` —
// nichts wird stillschweigend weggelassen. Eigenheimkauf und Zuflüsse rechnet
// die additive Erweiterung des Rechenkerns (ADR-19).
// ============================================================================
import { STRATS } from './finance';
import type { SessionData } from './schema';
import { MAX_WUENSCHE, MAX_ZUFLUESSE, clone, sanitize } from './pension/state';
import type { PensState, Wunsch, Zufluss } from './pension/typen';

/** Hypothekarzins, wenn 07a keinen eigenen 10-Jahres-Satz trägt (Vorgabe der Marktzinsen in 07a). */
const ZINS_10J = 1.55;
/** Umwandlungssatz mit 65 in Prozent, wenn der Aufrufer keinen aus den Grundlagen mitgibt (annahmen.uws65). */
const UWS65 = 5.4;

export type PlanQuelle = '06' | '07a' | '07b' | '07c';
export type PlanArt = 'ziel' | 'wunsch' | 'zufluss' | 'kauf' | 'anlage' | 'pension';

export interface PlanEintrag {
  quelle: PlanQuelle;
  art: PlanArt;
  name: string;
  /** Kalenderjahr; null = offen. */
  jahr: number | null;
  /** Alter von Person 1 in diesem Jahr (Achse des Bildes); null ohne Jahr. */
  alter: number | null;
  /** Betrag in CHF; null = nicht erfasst. */
  betrag: number | null;
  /** Geht der Eintrag in die Rechnung ein? */
  rechnet: boolean;
  /** Wie er eingeht bzw. warum nicht. */
  hinweis: string;
  /** Wirkung auf das freie Vermögen in CHF (heutige Kaufkraft): Abfluss positiv, Zufluss negativ, 0 ohne direkte Wirkung. */
  abfluss: number;
}

export interface Lebensplan {
  /** Stand, mit dem gerechnet wird: Haushalt plus alles, was mitrechnet. */
  S: PensState;
  eintraege: PlanEintrag[];
}

const zahl = (v: unknown): number => {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  if (typeof v !== 'string') return 0;
  const n = parseFloat(v.replace(/['’\s]/g, '').replace(',', '.'));
  return isFinite(n) ? n : 0;
};
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const liste = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') as Record<string, unknown>[] : []);
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const jahrVon = (v: unknown): number | null => { const n = zahl(v); return n >= 1900 && n <= 2200 ? Math.round(n) : null; };

/**
 * Baut den Lebensplan.
 * d: Session (bbzData), H: Haushalts-Stand, heute: laufendes Kalenderjahr,
 * uws65: Umwandlungssatz in Prozent für die Kürzung der PK-Rente nach einem Vorbezug (Planungsannahme der Grundlagen).
 */
export function lebensplan(d: SessionData, H: PensState, heute: number = new Date().getFullYear(), uws65: number = UWS65): Lebensplan {
  const S = clone(H);
  const eintraege: PlanEintrag[] = [];
  const jg = S.personen[0].jahrgang;
  const alterIn = (jahr: number | null): number | null => (jahr == null ? null : jahr - jg);
  const neu: Wunsch[] = [];
  const zufluesse: Zufluss[] = [...(S.zufluesse ?? [])];
  const fmt = (n: number): string => Math.round(n).toLocaleString('de-CH');
  /** Einmalige Ausgabe im Jahr; false, wenn die Höchstzahl der Wünsche erreicht ist. */
  const ausgabe = (name: string, betrag: number, jahr: number): boolean => {
    if (S.wuensche.length + neu.length >= MAX_WUENSCHE) return false;
    neu.push({ typ: 'einmal', aktiv: true, name: name.slice(0, 60), betrag, alter: Math.max(0, jahr - jg) });
    return true;
  };

  // ---------- 07a Eigenheimkauf ----------
  // Gerechnet als Liegenschaftskauf in der Zukunft (ADR-19): Eigenmittel fliessen ab, Hypothek und Wohnkosten
  // entstehen, die bisherige Miete fällt weg, ein PK-Vorbezug wird besteuert und kürzt die Pensionskasse.
  const fd = obj(d.finanzierung_data), fin = obj(fd.inputs);
  const preis = zahl(fin.price), bar = zahl(fin.cashEquity), vorbezug = zahl(fin.pensionWithdraw), miete = zahl(fin.currentRent);
  const zins = zahl(obj(fd.rates)['10J']) || ZINS_10J;
  const ziele = liste(d.ziele);
  // Wie in 07a: Das erste Ziel «Wohnen» steht für den Kauf (Kaufpreis-Prefill).
  const wohnZiel = ziele.find((z) => z.katId === 'wohnen' && z.typ !== 'zufluss');
  const kauf = preis > 0;
  if (kauf) {
    const jahr = jahrVon(wohnZiel?.jahr), eigen = bar + vorbezug, hypothek = Math.max(0, preis - eigen);
    const name = text(wohnZiel?.name) || 'Eigenheimkauf';
    let rechnet = false, hinweis: string, abfluss = 0;
    if (jahr == null) hinweis = 'Vorgemerkt: Kaufjahr fehlt (Ziel «Wohnen» in 06).';
    else if (jahr <= heute) hinweis = 'Vorgemerkt: Das Kaufjahr ist erreicht. Die Liegenschaft ist in der Pensionierung zu erfassen.';
    else if (!(eigen > 0)) hinweis = 'Vorgemerkt: keine Eigenmittel erfasst (Barmittel oder PK-Vorbezug in 07a).';
    else if (S.liegenschaften.length >= 10) hinweis = 'Vorgemerkt: Höchstzahl der Liegenschaften im Rechenkern erreicht.';
    else {
      S.liegenschaften.push({
        name: name.slice(0, 60), typ: 'eigen', verkehrswert: preis, hypothek, zins, unterhalt: 0.5, nebenkosten: 400, mietertrag: 0, verkaufAlter: 0,
        kaufAlter: jahr - jg, ...(vorbezug > 0 ? { kaufFremd: vorbezug } : {}), ...(miete > 0 ? { kaufMieteWeg: miete } : {}),
      });
      // PK-Vorbezug kürzt die Altersleistung von Person 1: im Verhältnis zum Altersguthaben, sonst über den Umwandlungssatz
      if (vorbezug > 0) {
        const p = S.personen[0], G = typeof p.pkGuthabenPlan === 'number' ? p.pkGuthabenPlan : 0;
        if (G > 0) { const f = Math.max(0, 1 - vorbezug / G); p.pkRente *= f; p.pkKapital *= f; p.pkGuthabenPlan = Math.max(0, G - vorbezug); }
        else p.pkRente = Math.max(0, p.pkRente - (vorbezug * uws65) / 100);
      }
      rechnet = true;
      abfluss = bar;
      hinweis = `Kauf mit Eigenmitteln von CHF ${fmt(eigen)}${vorbezug > 0 ? ` (davon PK-Vorbezug CHF ${fmt(vorbezug)}, besteuert; kürzt die Pensionskasse von Person 1)` : ''} und Hypothek CHF ${fmt(hypothek)} zu ${zins}%. `
        + `Danach Zins, 0.5% Unterhalt und CHF 400 Nebenkosten pro Monat${miete > 0 ? `; die Miete von CHF ${fmt(miete)} fällt weg` : '; eine wegfallende Miete ist nicht erfasst (07a «Aktuelle Wohnkosten»)'}.`;
    }
    eintraege.push({ quelle: '07a', art: 'kauf', name, jahr, alter: alterIn(jahr), betrag: preis, rechnet, hinweis, abfluss });
  }

  // ---------- 06 Ziele & Wünsche ----------
  const posten = [
    ...ziele.map((z) => ({ z, art: (z.typ === 'zufluss' ? 'zufluss' : 'ziel') as PlanArt })),
    ...liste(d.wuensche).map((z) => ({ z, art: 'wunsch' as PlanArt })),
  ];
  for (const { z, art } of posten) {
    if (kauf && z === wohnZiel) continue; // als Eigenheimkauf (07a) abgebildet
    const jahr = jahrVon(z.jahr), betrag = zahl(z.betrag);
    const name = text(z.name) || text(z.insp) || (art === 'zufluss' ? 'Geldzufluss' : art === 'wunsch' ? 'Wunsch' : 'Ziel');
    let rechnet = false, hinweis: string, abfluss = 0;
    if (jahr == null || !(betrag > 0)) hinweis = `Vorgemerkt: ${jahr == null ? 'Jahr' : 'Betrag'} fehlt.`;
    else if (jahr < heute) hinweis = 'Vorgemerkt: Das Jahr liegt zurück.';
    else if (art === 'zufluss') {
      if (zufluesse.length >= MAX_ZUFLUESSE) hinweis = 'Vorgemerkt: Höchstzahl der Zuflüsse im Rechenkern erreicht.';
      else {
        zufluesse.push({ name: name.slice(0, 60), betrag, jahr });
        rechnet = true;
        abfluss = -betrag;
        hinweis = 'Einmaliger Zufluss ins freie Vermögen im genannten Jahr, in heutiger Kaufkraft; ohne Erbschafts- oder Schenkungssteuer.';
      }
    } else if (!ausgabe(name, betrag, jahr)) hinweis = 'Vorgemerkt: Höchstzahl der Ausgaben im Rechenkern erreicht.';
    else { rechnet = true; abfluss = betrag; hinweis = 'Einmalige Ausgabe im genannten Jahr, in heutiger Kaufkraft.'; }
    eintraege.push({ quelle: '06', art, name, jahr, alter: alterIn(jahr), betrag: betrag > 0 ? betrag : null, rechnet, hinweis, abfluss });
  }
  S.wuensche = [...S.wuensche, ...neu];
  if (zufluesse.length) S.zufluesse = zufluesse;

  // ---------- 07b Anlage ----------
  const konk = obj(d.anlage_konklusion);
  const strategie = text(konk.finaleStrategie), anlage = zahl(d.anlage_betrag);
  if (strategie && anlage > 0) {
    const um = Math.min(anlage, S.liquiditaet);
    S.liquiditaet -= um;
    S.wertschriften += um;
    const strat = STRATS.find((s) => s.name === strategie);
    let rendite = '';
    if (strat && S.renditeOverride === '') { S.renditeOverride = strat.yield; rendite = ` Erwartete Rendite ${strat.yield}% (Annahme aus 07b) für alle Wertschriften.`; }
    else if (S.renditeOverride !== '') rendite = ` Es gilt die in der Pensionierung erfasste Rendite von ${S.renditeOverride}%.`;
    eintraege.push({
      quelle: '07b', art: 'anlage', name: `Anlage «${strategie}»`, jahr: heute, alter: alterIn(heute), betrag: anlage, rechnet: um > 0, abfluss: 0,
      hinweis: um > 0
        ? `CHF ${Math.round(um).toLocaleString('de-CH')} gehen von der Liquidität in die Wertschriften.${um < anlage ? ' Der Anlagebetrag übersteigt die erfasste Liquidität.' : ''}${rendite}`
        : 'Keine Liquidität erfasst, aus der angelegt werden könnte.',
    });
  }

  // ---------- 07c Pensionierung ----------
  S.personen.slice(0, S.haushalt === 'single' ? 1 : 2).forEach((p, i) => {
    const jahr = p.jahrgang + p.pensAlter;
    eintraege.push({
      quelle: '07c', art: 'pension', name: `Pensionierung${S.haushalt === 'single' ? '' : ` Person ${i + 1}`} mit ${p.pensAlter}`, jahr, alter: alterIn(jahr), betrag: null,
      rechnet: true, abfluss: 0, hinweis: 'Lohn endet; AHV, Pensionskasse und Vermögen tragen die Ausgaben.',
    });
  });

  eintraege.sort((a, b) => (a.jahr ?? 9999) - (b.jahr ?? 9999));
  return { S: sanitize(S), eintraege };
}
