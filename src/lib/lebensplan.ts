// ============================================================================
// lebensplan.ts — ein Plan ueber alle Module (Zielbild Fusion, Phase 5).
// Fuehrt Ziele & Wuensche (06), Eigenheimkauf (07a), Anlage (07b) und den
// Haushalts-Stand der Pensionierung (07c) zu EINEM Stand zusammen, den der
// Pensionierungs-Rechenkern rechnet. Der Stand ist abgeleitet und wird nicht
// gespeichert; Quelle bleiben die Module. KEIN DOM.
//
// Was mitrechnet und was nur vorgemerkt ist, steht je Eintrag in `hinweis` —
// nichts wird stillschweigend weggelassen.
// ============================================================================
import { STRATS } from './finance';
import type { SessionData } from './schema';
import { MAX_WUENSCHE, clone, sanitize } from './pension/state';
import type { PensState, Wunsch } from './pension/typen';

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
 * d: Session (bbzData), H: Haushalts-Stand, heute: laufendes Kalenderjahr.
 */
export function lebensplan(d: SessionData, H: PensState, heute: number = new Date().getFullYear()): Lebensplan {
  const S = clone(H);
  const eintraege: PlanEintrag[] = [];
  const jg = S.personen[0].jahrgang;
  const alterIn = (jahr: number | null): number | null => (jahr == null ? null : jahr - jg);
  const neu: Wunsch[] = [];
  /** Einmalige Ausgabe im Jahr; false, wenn die Höchstzahl der Wünsche erreicht ist. */
  const ausgabe = (name: string, betrag: number, jahr: number): boolean => {
    if (S.wuensche.length + neu.length >= MAX_WUENSCHE) return false;
    neu.push({ typ: 'einmal', aktiv: true, name: name.slice(0, 60), betrag, alter: Math.max(0, jahr - jg) });
    return true;
  };

  // ---------- 07a Eigenheimkauf ----------
  const fin = obj(obj(d.finanzierung_data).inputs);
  const preis = zahl(fin.price), bar = zahl(fin.cashEquity), vorbezug = zahl(fin.pensionWithdraw);
  const ziele = liste(d.ziele);
  // Wie in 07a: Das erste Ziel «Wohnen» steht für den Kauf (Kaufpreis-Prefill).
  const wohnZiel = ziele.find((z) => z.katId === 'wohnen' && z.typ !== 'zufluss');
  const kauf = preis > 0;
  if (kauf) {
    const jahr = jahrVon(wohnZiel?.jahr);
    const zusatz = `${vorbezug > 0 ? ` Der PK-Vorbezug von CHF ${Math.round(vorbezug).toLocaleString('de-CH')} ist nicht eingerechnet.` : ''} Liegenschaft und Hypothek sind nach dem Kauf in der Pensionierung zu erfassen.`;
    let rechnet = false, hinweis: string;
    if (jahr == null) hinweis = `Kaufjahr fehlt (Ziel «Wohnen» in 06).${zusatz}`;
    else if (jahr < heute) hinweis = `Das Kaufjahr liegt zurück.${zusatz}`;
    else if (!(bar > 0)) hinweis = `Keine eigenen Barmittel erfasst.${zusatz}`;
    else if (!ausgabe('Eigenmittel Eigenheim', bar, jahr)) hinweis = 'Höchstzahl der Ausgaben im Rechenkern erreicht.';
    else { rechnet = true; hinweis = `Die eigenen Barmittel von CHF ${Math.round(bar).toLocaleString('de-CH')} fliessen im Kaufjahr ab.${zusatz}`; }
    eintraege.push({ quelle: '07a', art: 'kauf', name: text(wohnZiel?.name) || 'Eigenheimkauf', jahr, alter: alterIn(jahr), betrag: preis, rechnet, hinweis });
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
    let rechnet = false, hinweis: string;
    if (art === 'zufluss') hinweis = 'Vorgemerkt: Zuflüsse (z. B. Erbschaft) rechnet der Kern noch nicht.';
    else if (jahr == null || !(betrag > 0)) hinweis = `Vorgemerkt: ${jahr == null ? 'Jahr' : 'Betrag'} fehlt.`;
    else if (jahr < heute) hinweis = 'Vorgemerkt: Das Jahr liegt zurück.';
    else if (!ausgabe(name, betrag, jahr)) hinweis = 'Vorgemerkt: Höchstzahl der Ausgaben im Rechenkern erreicht.';
    else { rechnet = true; hinweis = 'Einmalige Ausgabe im genannten Jahr, in heutiger Kaufkraft.'; }
    eintraege.push({ quelle: '06', art, name, jahr, alter: alterIn(jahr), betrag: betrag > 0 ? betrag : null, rechnet, hinweis });
  }
  S.wuensche = [...S.wuensche, ...neu];

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
      quelle: '07b', art: 'anlage', name: `Anlage «${strategie}»`, jahr: heute, alter: alterIn(heute), betrag: anlage, rechnet: um > 0,
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
      rechnet: true, hinweis: 'Lohn endet; AHV, Pensionskasse und Vermögen tragen die Ausgaben.',
    });
  });

  eintraege.sort((a, b) => (a.jahr ?? 9999) - (b.jahr ?? 9999));
  return { S: sanitize(S), eintraege };
}
