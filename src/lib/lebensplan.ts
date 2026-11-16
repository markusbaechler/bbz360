// ============================================================================
// lebensplan.ts — ein Plan ueber alle Module (ADR-18, ADR-19, ADR-22).
// Fuehrt Ziele & Wuensche (06), Eigenheimkauf (07a), Anlage (07b) und den
// Haushalts-Stand (Cockpit, Budget, Pensionierung) zu EINEM Stand zusammen,
// den der Pensionierungs-Rechenkern rechnet. Der Stand ist abgeleitet und wird
// nicht gespeichert; Quelle bleiben die Module. KEIN DOM.
//
// Was mitrechnet und was nur vorgemerkt ist, steht je Eintrag in `hinweis` —
// nichts wird stillschweigend weggelassen.
//
// Zeit: Der Lebensplan denkt in Kalenderjahren. Ausgaben, Zufluesse und der
// Kauf fallen im Januar des Jahres an; im laufenden Jahr sofort.
// ============================================================================
import { STRATS } from './finance';
import type { SessionData } from './schema';
import { MAX_WUENSCHE, MAX_ZUFLUESSE, clone, sanitize } from './pension/state';
import type { PensState, Wunsch, Zufluss } from './pension/typen';

/** Hypothekarzins, wenn 07a keinen eigenen 10-Jahres-Satz traegt (Vorgabe der Marktzinsen in 07a). */
const ZINS_10J = 1.55;
/** Umwandlungssatz mit 65 in Prozent, wenn der Aufrufer keinen aus den Grundlagen mitgibt (annahmen.uws65). */
const UWS65 = 5.4;

/**
 * Vorschlaege aus Modul 06, die der Rechenkern schon selbst rechnet: Sie als Zufluss bzw. Ausgabe dazuzuzaehlen,
 * waere doppelt. Sie bleiben vorgemerkt, mit Verweis auf die Stelle, an der sie erfasst sind.
 */
const SCHON_GERECHNET: Record<string, string> = {
  'Kapitalleistung BVG': 'Das Kapital der Pensionskasse rechnet die Pensionierung bereits (Rente oder Kapital je Person).',
  'Auszahlung Säule 3a / 3b': 'Die Säule 3a zahlt die Pensionierung bereits aus; ein Guthaben der Säule 3b gehört ins freie Vermögen.',
  'Verkauf (Liegenschaft, Firma, Depot)': 'Den Verkauf einer Liegenschaft erfasst die Pensionierung («Verkauf mit Alter»); Depots stehen bereits im Vermögen.',
  'Liegenschaft verkaufen': 'Den Verkauf einer Liegenschaft erfasst die Pensionierung («Verkauf mit Alter»); er ist keine Ausgabe.',
  // Sparen, Anlegen und Vorsorgen sind keine Ausgaben: Das Geld bleibt im Vermögen bzw. in der Vorsorge.
  'Liquidität aufbauen (Sparziel)': 'Sparen ist keine Ausgabe; das Geld bleibt im Vermögen. Den Sparbetrag zeigt das Budget (05b).',
  'Anlageziel Wertschriften': 'Anlegen schichtet Vermögen um und ist keine Ausgabe; den Anlagebetrag erfasst Modul 07b.',
  'Vermögen strukturieren': 'Eine Umschichtung im Vermögen ist keine Ausgabe.',
  'Vorsorgelücke schliessen': 'Sparen oder Einzahlen in die Vorsorge ist keine Ausgabe; das Geld bleibt im Vermögen bzw. in der Vorsorge.',
  'BVG-Einkauf': 'Ein Einkauf ist keine Ausgabe, er erhöht die Pensionskasse. Seine Steuerwirkung zeigt Modul 07d; die höhere Leistung ist in der Pensionierung zu erfassen.',
  'Säule 3a aufbauen': 'Die Einzahlungen in die Säule 3a rechnet die Pensionierung bereits.',
};
const PROB: Record<string, string> = { moeglich: 'möglich', wahrscheinlich: 'wahrscheinlich', sicher: 'sicher' };

export type PlanQuelle = '06' | '07a' | '07b' | '07c' | '07f';
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

export interface PlanOptionen {
  /** Umwandlungssatz in Prozent für die Kürzung der Pensionskasse nach einem Vorbezug (annahmen.uws65). */
  uws65?: number;
  /** Letztes Kalenderjahr der Rechnung (Planungshorizont); spätere Einträge rechnen nicht mit. */
  bisJahr?: number;
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
const fmt = (n: number): string => Math.round(n).toLocaleString('de-CH');

/**
 * Das Ziel aus Modul 06, zu dem der Kauf in 07a gehört: das dort gewählte (`finanzierung_data.zielId`), sonst —
 * wie beim Kaufpreis-Prefill von 07a — das erste Ziel der Kategorie Wohnen mit Betrag.
 */
export function kaufZiel(d: SessionData): Record<string, unknown> | null {
  const ziele = liste(d.ziele).filter((z) => z.typ !== 'zufluss');
  const id = text(obj(d.finanzierung_data).zielId);
  if (id === '-') return null; // ausdrücklich keinem Ziel zugeordnet
  return (id ? ziele.find((z) => z.id === id) : null) ?? ziele.find((z) => z.katId === 'wohnen' && zahl(z.betrag) > 0) ?? null;
}

/**
 * Letztes Kalenderjahr, das der Rechenkern rechnet: Er läuft je Person bis zum Monat vor dem Geburtstag nach dem
 * Horizont-Alter (engine: Aend = Geburtsmonat + Horizont × 12 + 11), also ausser bei Januar-Geburt ins Folgejahr.
 */
export function planBisJahr(S: PensState, hz: { horizont: number; horizontP?: number[] | null }): number {
  const ps = S.personen.slice(0, S.haushalt === 'single' ? 1 : 2);
  return Math.max(...ps.map((p, i) => {
    const h = hz.horizontP && hz.horizontP[i] > 0 ? hz.horizontP[i] : hz.horizont;
    return Math.floor((p.jahrgang * 12 + ((p.geburtsmonat || 6) - 1) + h * 12 + 11) / 12);
  }));
}

/**
 * Baut den Lebensplan.
 * d: Session (bbzData), H: Haushalts-Stand, heute: laufendes Kalenderjahr.
 */
export function lebensplan(d: SessionData, H: PensState, heute: number = new Date().getFullYear(), opt: PlanOptionen = {}): Lebensplan {
  const uws65 = opt.uws65 ?? UWS65, bisJahr = opt.bisJahr ?? Infinity;
  const S = clone(H);
  const eintraege: PlanEintrag[] = [];
  const jg = S.personen[0].jahrgang;
  const alterIn = (jahr: number | null): number | null => (jahr == null ? null : jahr - jg);
  const neu: Wunsch[] = [];
  const zufluesse: Zufluss[] = [...(S.zufluesse ?? [])];
  const erwartet = [...zufluesse]; // aus Nachlass (07f): rechnen bereits mit, erscheinen unten in der Liste
  /** Warum ein Eintrag mit diesem Jahr nicht gerechnet werden kann; '' wenn er kann. */
  const zeitHinweis = (jahr: number | null): string =>
    jahr == null ? 'Vorgemerkt: Jahr fehlt.' : jahr < heute ? 'Vorgemerkt: Das Jahr liegt zurück.' : jahr > bisJahr ? `Vorgemerkt: liegt nach dem Planungshorizont (${bisJahr}).` : '';

  // ---------- 07a Eigenheimkauf ----------
  // Gerechnet als Liegenschaftskauf in der Zukunft (ADR-19): Eigenmittel fliessen ab, Hypothek und Wohnkosten
  // entstehen, die bisherige Miete fällt weg, ein PK-Vorbezug wird besteuert und kürzt die Pensionskasse.
  const fd = obj(d.finanzierung_data), fin = obj(fd.inputs);
  const preis = zahl(fin.price), bar = zahl(fin.cashEquity), vorbezug = zahl(fin.pensionWithdraw), miete = zahl(fin.currentRent);
  const zins = zahl(obj(fd.rates)['10J']) || ZINS_10J;
  const kauf = preis > 0;
  const wohnZiel = kauf ? kaufZiel(d) : null;
  if (kauf) {
    // Eigenmittel zählen höchstens bis zum Kaufpreis (wie im Rechenkern)
    const jahr = jahrVon(wohnZiel?.jahr), eigen = Math.min(preis, bar + vorbezug), hypothek = Math.max(0, preis - eigen);
    const name = text(wohnZiel?.name) || text(wohnZiel?.insp) || 'Eigenheimkauf';
    let rechnet = false, hinweis: string, abfluss = 0;
    if (!wohnZiel) hinweis = 'Vorgemerkt: Der Kauf ist keinem Ziel zugeordnet (in 07a wählen), das Kaufjahr fehlt.';
    else if (jahr != null && jahr <= heute) hinweis = 'Vorgemerkt: Das Kaufjahr ist erreicht. Die Liegenschaft ist in der Pensionierung zu erfassen.';
    else if (zeitHinweis(jahr)) hinweis = zeitHinweis(jahr).replace('Jahr fehlt', 'Das Ziel hat kein Jahr');
    else if (!(eigen > 0)) hinweis = 'Vorgemerkt: keine Eigenmittel erfasst (Barmittel oder PK-Vorbezug in 07a).';
    else if (S.liegenschaften.length >= 10) hinweis = 'Vorgemerkt: Höchstzahl der Liegenschaften im Rechenkern erreicht.';
    else {
      // PK-Vorbezug: nur vor der Pensionierung von Person 1 und höchstens bis zum vorhandenen Guthaben. Die
      // Altersleistung sinkt im selben Verhältnis (Rente und Kapital). Ohne erfasstes Altersguthaben gilt als
      // Guthaben: Rente geteilt durch den Umwandlungssatz, plus Kapital.
      const p = S.personen[0];
      const G = typeof p.pkGuthabenPlan === 'number' && p.pkGuthabenPlan > 0 ? p.pkGuthabenPlan : p.pkRente / (uws65 / 100) + p.pkKapital;
      const vorPension = jahr! < jg + p.pensAlter;
      // Der Rechenkern zahlt den Vorbezug in heutiger Kaufkraft aus (× Teuerung bis zum Kauf); um denselben,
      // teuerungsbereinigten Betrag sinkt das Guthaben.
      const teuerung = Math.pow(1 + (+S.inflation || 0) / 100, Math.max(0, jahr! - heute));
      const fremd = vorPension && G > 0 ? Math.min(vorbezug, eigen, G / teuerung) : 0;
      if (fremd > 0) {
        const f = Math.max(0, 1 - (fremd * teuerung) / G);
        p.pkRente *= f;
        p.pkKapital *= f;
        if (typeof p.pkGuthabenPlan === 'number') p.pkGuthabenPlan = Math.max(0, p.pkGuthabenPlan - fremd * teuerung);
      }
      S.liegenschaften.push({
        name: name.slice(0, 60), typ: 'eigen', verkehrswert: preis, hypothek, zins, unterhalt: 0.5, nebenkosten: 400, mietertrag: 0, verkaufAlter: 0,
        kaufJahr: jahr!, ...(fremd > 0 ? { kaufFremd: fremd } : {}), ...(miete > 0 ? { kaufMieteWeg: miete } : {}),
      });
      rechnet = true;
      abfluss = eigen - fremd;
      const vbText = vorbezug <= 0 ? ''
        : !vorPension ? ` Der PK-Vorbezug von CHF ${fmt(vorbezug)} ist nach der Pensionierung nicht mehr möglich; der Betrag kommt aus dem freien Vermögen.`
          : !(G > 0) ? ` Für Person 1 ist kein Pensionskassenguthaben erfasst; der PK-Vorbezug von CHF ${fmt(vorbezug)} kommt in der Rechnung aus dem freien Vermögen.`
            : fremd < vorbezug ? ` Vom PK-Vorbezug von CHF ${fmt(vorbezug)} rechnen nur CHF ${fmt(fremd)} mit (Grenze: Eigenmittel bzw. das Altersguthaben von Person 1); der Rest kommt aus dem freien Vermögen.`
            : ` Davon PK-Vorbezug CHF ${fmt(fremd)}: besteuert, kürzt die Pensionskasse von Person 1.`;
      hinweis = `Kauf im Januar ${jahr} mit Eigenmitteln von CHF ${fmt(eigen)} und Hypothek CHF ${fmt(hypothek)} zu ${zins}%.${vbText} `
        + `Danach Zins, 0.5% Unterhalt und CHF 400 Nebenkosten pro Monat${miete > 0 ? `; die Miete von CHF ${fmt(miete)} fällt weg` : '; eine wegfallende Miete ist nicht erfasst (07a «Aktuelle Wohnkosten»)'}.`;
    }
    eintraege.push({ quelle: '07a', art: 'kauf', name, jahr, alter: alterIn(jahr), betrag: preis, rechnet, hinweis, abfluss });
  }

  // ---------- 06 Ziele & Wünsche ----------
  const posten = [
    ...liste(d.ziele).map((z) => ({ z, art: (z.typ === 'zufluss' ? 'zufluss' : 'ziel') as PlanArt })),
    ...liste(d.wuensche).map((z) => ({ z, art: 'wunsch' as PlanArt })),
  ];
  for (const { z, art } of posten) {
    if (kauf && z === wohnZiel) continue; // als Eigenheimkauf (07a) abgebildet
    const jahr = jahrVon(z.jahr), betrag = zahl(z.betrag);
    const name = text(z.name) || text(z.insp) || (art === 'zufluss' ? 'Geldzufluss' : art === 'wunsch' ? 'Wunsch' : 'Ziel');
    const doppelt = SCHON_GERECHNET[text(z.insp)];
    const eintritt = art !== 'wunsch' && PROB[text(z.prob)] && text(z.prob) !== 'sicher' ? ` Eintritt laut Ziel: ${PROB[text(z.prob)]}; gerechnet ist der volle Betrag.` : '';
    let rechnet = false, hinweis: string, abfluss = 0;
    if (doppelt) hinweis = `Vorgemerkt: ${doppelt}`;
    else if (!(betrag > 0)) hinweis = 'Vorgemerkt: Betrag fehlt.';
    else if (zeitHinweis(jahr)) hinweis = zeitHinweis(jahr);
    else if (art === 'zufluss') {
      if (zufluesse.length >= MAX_ZUFLUESSE) hinweis = 'Vorgemerkt: Höchstzahl der Zuflüsse im Rechenkern erreicht.';
      else {
        zufluesse.push({ name: name.slice(0, 60), betrag, jahr: jahr! });
        rechnet = true;
        abfluss = -betrag;
        hinweis = `Einmaliger Zufluss ins freie Vermögen im Januar ${jahr}, in heutiger Kaufkraft; ohne Erbschafts- oder Schenkungssteuer.${eintritt}`;
      }
    } else if (S.wuensche.length + neu.length >= MAX_WUENSCHE) hinweis = 'Vorgemerkt: Höchstzahl der Ausgaben im Rechenkern erreicht.';
    else {
      neu.push({ typ: 'einmal', aktiv: true, name: name.slice(0, 60), betrag, jahr: jahr!, alter: Math.max(0, jahr! - jg) });
      rechnet = true;
      abfluss = betrag;
      hinweis = `Einmalige Ausgabe ${jahr === heute ? 'sofort' : `im Januar ${jahr}`}, in heutiger Kaufkraft.${eintritt}`;
    }
    eintraege.push({ quelle: '06', art, name, jahr, alter: alterIn(jahr), betrag: betrag > 0 ? betrag : null, rechnet, hinweis, abfluss });
  }
  // ---------- 07f erwartete Zuflüsse ----------
  for (const z of erwartet) {
    const zh = z.jahr > bisJahr ? `Vorgemerkt: liegt nach dem Planungshorizont (${bisJahr}).` : '';
    eintraege.push({
      quelle: '07f', art: 'zufluss', name: z.name || 'Erwarteter Zufluss', jahr: z.jahr, alter: alterIn(z.jahr), betrag: z.betrag, rechnet: !zh, abfluss: zh ? 0 : -z.betrag,
      hinweis: zh || `Einmaliger Zufluss ins freie Vermögen ${z.jahr <= heute ? 'sofort' : `im Januar ${z.jahr}`}, in heutiger Kaufkraft (erfasst unter Nachlass).`,
    });
  }
  S.wuensche = [...S.wuensche, ...neu];
  if (zufluesse.length) S.zufluesse = zufluesse;

  // ---------- 07b Anlage ----------
  // Betrag und finale Strategie schreibt Modul 07b (`anlage_betrag`, `anlage_konklusion`).
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
        ? `CHF ${fmt(um)} gehen von der Liquidität in die Wertschriften.${um < anlage ? ' Der Anlagebetrag übersteigt die erfasste Liquidität.' : ''}${rendite}`
        : 'Vorgemerkt: keine Liquidität erfasst, aus der angelegt werden könnte.',
    });
  }

  // ---------- Pensionierung ----------
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
