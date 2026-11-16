// Das Bild der Bühne: Einkommen, Ausgaben und freies Vermögen pro Jahr auf der Altersachse von Person 1.
// Es wächst mit den Angaben: Achse (Stufe 0), Marken (1), Einkommen (2), Ausgaben, Lücke und Vermögen (3).
// Alle Zahlen stammen aus den Jahreszeilen des Rechenkerns (R.base.rows bzw. R.vor.rows); hier wird nichts gerechnet
// ausser Umrechnung in heutige Kaufkraft und Lage auf der Achse.
import { chf, axisChf, esc } from '../lib/pension/format';
import { attachTip, tipRows, yScale } from './charts';
import { reachData, reachText } from './reach';
import { schrittStatus } from './schritte';
import { karten } from '../lib/pension/themen';
import type { TipZeile } from './charts';
import type { AnalyseErgebnis, Auswertung, AuswertungLeer } from '../lib/pension/analyse';
import type { Vorschau } from '../lib/pension/auswertung';
import type { Engine } from '../lib/pension/engine';
import type { PensState } from '../lib/pension/typen';

/** Ergebnis, wie es das Bild liest: volle Auswertung oder leeres Ergebnis (wahlweise mit Vorschau-Reihen). */
export type BildErgebnis = (Auswertung | AuswertungLeer) & { vor?: Vorschau };
/** Linie im Feld «Vermögen»: [Alter auf der Achse, Vermögen in heutiger Kaufkraft]. */
export type BildLinie = [number, number][];
export type BildReihe = 'lohn' | 'lohn1' | 'lohn2' | 'uebrig' | 'pk' | 'ahv';
export type BildReiheDef = [k: BildReihe, t: string, tk: string];
export interface BildJahr {
  alter: number; jahr: number; x0: number; x1: number; anteil: number;
  lohn: number; lohn1: number; lohn2: number; uebrig: number; pk: number; ahv: number;
  bedarf: number | null; ausVermoegen: number | null; vermoegen: number | null; stress: number | null;
}
export interface BildMarke { alter: number; text: string; art: string }
export interface BildPin { alter: number; text: string }
export interface BildDaten {
  stufe: number; jahre: BildJahr[]; lohnGetrennt: boolean; marken: BildMarke[]; pins: BildPin[];
  max: { proJahr: number; vermoegen: number }; cpl: boolean; a0: number; xEnd: number; H: number | null; vStart: number | null;
  reach: ReturnType<typeof reachData> | null;
  varianten?: { gewaehlt: 'a' | 'b'; a: BildLinie | null; b: BildLinie | null; ta: string; tb: string };
  szenario?: { plan: BildLinie; titel: string };
}
export interface BildOptionen { w?: number; h?: number; kurz?: boolean }
export interface BildRenderOptionen { kurz?: boolean; halb?: boolean; bis?: Element | null; frei?: number }
/** Host des Bilds mit seiner Zeichenfunktion und der zuletzt gezeichneten Breite. */
type BildHost = HTMLElement & { _bild?: () => void; _bildW?: number };
type Lauf = { a: number; b: number };

const personen = (S: PensState) => S.personen.slice(0, S.haushalt === 'single' ? 1 : 2);
/** Einkommensreihen von unten nach oben: [Feld, Bezeichnung, kurze Bezeichnung]. */
const REIHEN: BildReiheDef[] = [['lohn', 'Lohn', 'Lohn'], ['uebrig', 'Übriges Einkommen', 'Übriges'], ['pk', 'PK-Rente', 'PK-Rente'], ['ahv', 'AHV', 'AHV']];
const FARBE: Record<BildReihe, string> = { lohn: 'var(--s1)', lohn1: 'var(--s1)', lohn2: 'var(--bbz-color-blue-500)', uebrig: 'var(--s1)', pk: 'var(--s3)', ahv: 'var(--s4)' };
/** Bei Paaren mit Lohn je Person (Rechenkern: lohnP) steht der Lohn getrennt nach Person 1 und Person 2. */
const REIHEN_PAAR: BildReiheDef[] = [['lohn1', 'Lohn Person 1', 'Lohn P1'], ['lohn2', 'Lohn Person 2', 'Lohn P2'], ...REIHEN.slice(1)];
const reihen = (d: Pick<BildDaten, 'lohnGetrennt'>) => (d.lohnGetrennt ? REIHEN_PAAR : REIHEN);
/** Einkommensreihen des Bilds (auch für das Bild im PDF-Bericht, reportbild.js). */
export const bildReihen = reihen;
const ART: Record<string, string> = { pens: 'pension', ahv: 'ahv', le: 'le' };
const n = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : '0');

/**
 * Daten des Bilds. stufe: 0 Achse, 1 Marken, 2 Einkommen, 3 vollständig. jahre: je Jahreszeile die Werte in heutiger
 * Kaufkraft (Jahresbeträge der Zeile; x0/x1 = Lage auf der Achse, anteil = Anteil eines ganzen Jahres).
 */
export function bildDaten(S: PensState, R: BildErgebnis | null | undefined, E: Engine): BildDaten {
  const ps = personen(S), b1 = E.birthA(ps[0]), voll = !!R && !R.leer;
  const st = schrittStatus(S, R);
  const quelle = voll ? R.base.rows : (R?.vor?.rows || []);
  const hatEinkommen = quelle.length > 0 && (ps.some((p) => p.brutto > 0 || p.pkRente > 0 || (p.ahvBetrag as number) > 0) || (S.einkommen || []).some((x) => x.betrag > 0));
  const stufe = voll ? 3 : st.situation !== 'erledigt' ? 0 : hatEinkommen ? 2 : 1;
  const a0 = (E.A0 - b1) / 12;
  // Letzter Monat der Rechnung wie im Rechenkern: Horizont der jeweiligen Person, Ende ihres Geburtsjahrs
  const H = R?.horizont, hP = R?.horizontP;
  const Aend = H != null ? Math.max(E.A0, ...ps.map((p, i) => E.birthA(p) + (hP && hP[i] > 0 ? hP[i] : H) * 12 + 11)) : null;
  const xEnd = Aend != null ? (Aend + 1 - b1) / 12 : a0 + 30;
  const stress = voll ? new Map(R.amp.stress.rows.map((x) => [x.year, x])) : null;
  const jahre = quelle.map((x) => {
    const x0 = Math.max(a0, (x.year * 12 - b1) / 12), x1 = Math.max(x0 + 1 / 12, Math.min(xEnd, ((x.year + 1) * 12 - b1) / 12));
    const f = 1 / x.I, ein = (x.lohn + x.uebrig + x.pk + x.ahv) * f, s = stress?.get(x.year);
    // Ausgaben, alle Steuern (Einkommen, Vermögen, Erträge), AHV-Beiträge als Nichterwerbstätige und Wünsche; bei
    // Wünschen netto der laufenden Einnahmen (eingesparte Lebenskosten, Vermietung), ohne Verkaufserlöse
    const bedarf = voll ? (x.ausgaben + x.steuern + (x.stVerm || 0) + (x.stErtrag || 0) + x.ne + (x.wAus || 0) - (x.wEinLauf || 0)) * f : null;
    return {
      alter: x.age, jahr: x.year, x0, x1, anteil: x1 - x0,
      lohn: x.lohn * f, lohn1: (x.lohn - (x.lohnP?.[1] || 0)) * f, lohn2: (x.lohnP?.[1] || 0) * f, uebrig: x.uebrig * f, pk: x.pk * f, ahv: x.ahv * f,
      bedarf, ausVermoegen: voll ? Math.max(0, bedarf! - ein) : null,
      vermoegen: voll ? x.V * f : null, stress: voll && s ? s.V / s.I : null,
    };
  });
  const vStart = voll && quelle.length ? quelle[0].Vstart : null;

  const marken: BildMarke[] = [{ alter: a0, text: 'heute', art: 'heute' }];
  let reach: BildDaten['reach'] = null;
  if (stufe >= 1 && R && H != null && (voll || R.vor?.ps?.length)) {
    // Vor dem ersten Ergebnis: Pensionierung und AHV-Beginn aus den Personen des Vorschau-Laufs (R.vor.ps)
    const rd = reachData(voll ? R : { ...R, amp: { base: { ps: R.vor!.ps }, stress: {} } } as unknown as Auswertung, E, S);
    if (voll) reach = rd;
    rd.marks.forEach((m) => marken.push({ alter: m.x, text: m.label, art: ART[m.kind] }));
    marken.push({ alter: H, text: `Horizont ${H}`, art: 'horizont' });
  }

  const proJahr = Math.max(0, ...jahre.map((j) => Math.max(stufe >= 2 ? (j.lohn + j.uebrig + j.pk + j.ahv) / j.anteil : 0, stufe >= 3 ? j.bedarf! / j.anteil : 0)));
  const vermoegen = stufe >= 3 ? Math.max(0, vStart || 0, ...jahre.map((j) => Math.max(j.vermoegen || 0, j.stress || 0))) : 0;
  const lohnGetrennt = ps.length > 1 && quelle.some((x) => Array.isArray(x.lohnP));
  return { stufe, jahre, lohnGetrennt, marken, pins: pinsVon(S, a0, Math.max(xEnd, a0 + 1)), max: { proJahr, vermoegen }, cpl: ps.length > 1, a0, xEnd: Math.max(xEnd, a0 + 1), H: H ?? null, vStart, reach };
}

/**
 * Vorgemerkte Karten mit bekanntem Alter (Person 1): Wunsch mit «von» bzw. «Alter»; «Liegenschaft verkaufen» mit dem
 * Verkaufsalter einer Variante. Nur innerhalb der Achse. text: Titel der Karte (Rohtext, beim Zeichnen maskiert).
 */
function pinsVon(S: PensState, a0: number, xEnd: number) {
  if (!Array.isArray(S.wuensche) || !Array.isArray(S.themen)) return [];
  const pins: BildPin[] = [];
  karten(S).forEach((k) => {
    let alter: number | null = null;
    if (k.key[0] === 'w') {
      if (k.status !== 'vor') return;
      const w = S.wuensche[k.ziel.w!];
      alter = w.von ?? w.alter ?? null;
    } else if (k.karte === 'verkauf') {
      const t = S.themen[+k.key.slice(1)];
      alter = [t.a?.verkaufAlter, t.b?.verkaufAlter].find((v) => v! > 0) ?? null;
    }
    if (Number.isFinite(alter) && alter! > 0 && alter! >= a0 && alter! <= xEnd) pins.push({ alter: alter!, text: k.titel });
  });
  return pins;
}

/** Vermögensreihe einer Rechnung wie die Linie des Plans: [Alter auf der Achse, Vermögen in heutiger Kaufkraft]. */
function vermoegensReihe(S: PensState, Rv: BildErgebnis | null | undefined, E: Engine): BildLinie | null {
  if (!Rv || Rv.leer) return null;
  const d = bildDaten(S, Rv, E);
  return [[d.a0, d.vStart ?? 0], ...d.jahre.filter((j) => j.vermoegen != null).map((j): [number, number] => [j.x1, j.vermoegen!])];
}

/**
 * Daten des Bilds im Vergleich «So oder so»: das Bild des Plans mit d.varianten = { gewaehlt, a, b, ta, tb }.
 * a und b sind die Vermögensreihen aus R.varianten (null, wenn eine Variante nicht gerechnet werden konnte), ta und tb
 * die Kernaussagen («reicht bis …») für die Textalternative. Die Skala umfasst alle drei Linien.
 */
export function bildVergleich(S: PensState, R: (BildErgebnis & { varianten?: (AnalyseErgebnis | null)[] }) | null | undefined, E: Engine, gewaehlt?: string | null, texte: { a?: string; b?: string } = {}): BildDaten {
  const d = bildDaten(S, R, E);
  const [ra, rb] = R?.varianten || [];
  const a = vermoegensReihe(S, ra, E), b = vermoegensReihe(S, rb, E);
  const hoch = Math.max(d.max.vermoegen, ...([a, b].filter(Boolean) as BildLinie[]).flat().map(([, v]) => v));
  return { ...d, max: { ...d.max, vermoegen: hoch }, varianten: { gewaehlt: gewaehlt === 'b' ? 'b' : 'a', a, b, ta: texte.a || '', tb: texte.b || '' } };
}
/**
 * Daten des Bilds für das Szenario «früher aufhören» (R.so.now): Einkommen, Ausgaben und Vermögen des Szenarios;
 * d.szenario = { plan, titel } mit der Vermögensreihe des heutigen Plans (gestrichelt) und dem Titel (Rohtext).
 */
export function bildSzenario(S: PensState, R: Auswertung, E: Engine, titel = ''): BildDaten {
  const d = bildDaten(S, { ...R, base: R.so.now.base, amp: R.so.now }, E);
  const plan = vermoegensReihe(S, R, E) || [];
  return { ...d, max: { ...d.max, vermoegen: Math.max(d.max.vermoegen, ...plan.map(([, v]) => v)) }, szenario: { plan, titel } };
}
/** d.varianten mit mindestens einer Reihe (sonst bleibt das Bild das des Plans). */
const mitVarianten = (d: BildDaten) => d.stufe >= 3 && !!(d.varianten?.a || d.varianten?.b);

/** Textalternative: ein Satz je Stufe; vollständig mit Reichweite und Kernaussage. */
export function bildText(d: BildDaten) {
  const pt = d.pins?.length ? ` Vorgemerkt, nicht gerechnet: ${d.pins.map((p) => `${p.text} (${Math.floor(p.alter)})`).join(', ')}.` : '';
  const sz = d.szenario ? ` Szenario${d.szenario.titel ? `: ${d.szenario.titel}` : ''}; der heutige Plan als gestrichelte Linie.` : '';
  return grundText(d) + vergleichText(d) + sz + pt;
}
/** Satz zum Vergleich: welche Linie wofür steht, mit den Kernaussagen. */
function vergleichText(d: BildDaten) {
  if (!mitVarianten(d)) return '';
  const v = d.varianten!, teil = (w: 'a' | 'b') => {
    const t = w === 'a' ? v.ta : v.tb, art = v.gewaehlt === w ? 'kräftige Linie' : 'dünne Linie';
    return v[w] ? `Variante ${w.toUpperCase()} (${art})${t ? `: ${t}` : ''}` : `Variante ${w.toUpperCase()}: nicht gerechnet`;
  };
  return ` Vergleich des freien Vermögens: ${teil('a')}; ${teil('b')}; heutiger Plan als gestrichelte Linie.`;
}
function grundText(d: BildDaten) {
  const ac = d.cpl ? ' (Alter Person 1)' : '', bis = d.H != null ? ` bis ${d.H}` : '';
  const mk = d.marken.filter((m) => m.art !== 'heute' && m.art !== 'horizont').map((m) => m.text).join(', ');
  if (d.stufe === 0) return `Bild Ihrer Jahre von heute${bis}${ac}. Es füllt sich, sobald die Situation erfasst ist.`;
  if (d.stufe === 1) return `Bild Ihrer Jahre von heute${bis}${ac}${mk ? `: ${mk}` : ''}. Lohn, Renten und Vermögen erscheinen mit den nächsten Angaben.`;
  if (d.stufe === 2) {
    const ganz = d.jahre.find((j) => j.anteil > 0.99) || d.jahre[0], letzt = d.jahre[d.jahre.length - 1];
    const ein = (j: BildJahr) => chf((j.lohn + j.uebrig + j.pk + j.ahv) / j.anteil);
    return `Einkommen pro Jahr in heutiger Kaufkraft, von heute${bis}${ac}${mk ? `; ${mk}` : ''}. Im ersten ganzen Jahr rund ${ein(ganz)}, im letzten rund ${ein(letzt)}. Ausgaben und Vermögen erscheinen, sobald die Ausgaben erfasst sind.`;
  }
  return `Einkommen, Ausgaben und freies Vermögen pro Jahr in heutiger Kaufkraft${ac}. ${reachText(d.reach!)}`;
}

/** Legende zum Bild (HTML), nur mit Reihen, die vorkommen. */
export function bildLegende(d: BildDaten) {
  if (d.stufe < 2) return '';
  const it = reihen(d).filter(([k]) => d.jahre.some((j) => j[k] > 0.5)).map(([k, t, tk]) => [k, k.startsWith('lohn') ? tk : t]).map(([k, t]) => `<span><i class="sq bl-${k}"></i>${t}</span>`);
  if (d.stufe >= 3) it.push('<span><i class="bl-bedarf"></i>Ausgaben inkl. Steuern</span>', '<span><i class="sq bl-luecke"></i>Aus dem Vermögen</span>');
  if (mitVarianten(d)) {
    // Im Vergleich: gewählte Variante kräftig, die andere dünn, der Plan gestrichelt (unterscheidbar auch ohne Farbe)
    const g = d.varianten!.gewaehlt;
    ['a', 'b'].forEach((w) => it.push(`<span><i class="${w === g ? 'bl-vsel' : 'bl-vand'}"></i>Vermögen ${w.toUpperCase()}${w === g ? ' (gewählt)' : ''}</span>`));
    it.push('<span><i class="bl-plan"></i>heutiger Plan</span>');
  } else if (d.stufe >= 3 && d.szenario) it.push('<span><i class="bl-verm"></i>Freies Vermögen im Szenario</span>', '<span><i class="bl-plan"></i>heutiger Plan</span>');
  else if (d.stufe >= 3) it.push('<span><i class="bl-verm"></i>Freies Vermögen</span>', '<span><i class="bl-stress"></i>Stresstest</span>');
  return `<div class="legend">${it.join('')}</div>`;
}

const KURZ: [RegExp, string][] = [[/Pensionierung/g, 'Pension'], [/Lebenserwartung/g, 'Lebenserw.']];
const kurzText = (t: string) => KURZ.reduce((s, [re, k]) => s.replace(re, k), t);
/** Geschätzte Breite einer Beschriftung (fett, grosszügig), damit sich nichts überlagert. */
const breite = (t: string, fs: number) => t.length * fs * 0.62 + 6;

/** Waagrechte Masse: Schriftgrösse, Ränder, Achse. Text bleibt bei echter Breite mindestens 11 px gross. */
function waagrecht(d: Pick<BildDaten, 'a0' | 'xEnd'>, w: number, kurz: boolean) {
  const fs = kurz ? 11 : 12, L = kurz ? 6 : 76, Rr = kurz ? 6 : 56;
  const xs = d.a0, xe = Math.max(d.xEnd, xs + 1);
  const X = (a: number) => L + ((Math.max(xs, Math.min(xe, a)) - xs) / (xe - xs)) * (w - L - Rr);
  return { fs, L, Rr, xs, xe, X };
}

/**
 * Beschriftungen der Marken zwischen den Feldern: Marken am gleichen Ort werden zusammengefasst
 * («Pension P2 (65), AHV»), die übrigen auf so viele Zeilen verteilt, dass sich keine zwei überlagern.
 * Pins vorgemerkter Karten (d.pins) folgen nach den Marken, werden nicht mit ihnen zusammengefasst und tragen
 * pin: true; schmal nur «?» (der Titel steht dann im Tooltip und in der Textalternative).
 * Liefert je Beschriftung { x, t, l, r, rechts, zeile } (Pixel bei Breite w).
 */
export function markenLayout(d: Pick<BildDaten, 'a0' | 'xEnd' | 'marken'> & { pins?: BildPin[] }, { w = 880, kurz = false }: { w?: number; kurz?: boolean } = {}) {
  const { fs, xe, X } = waagrecht(d, w, kurz);
  const gruppen: { x: number; t: string; titel?: string; pin?: boolean }[] = [];
  d.marken.filter((m) => m.art !== 'heute' && !(kurz && m.art === 'horizont'))
    .map((m) => ({ x: X(m.art === 'horizont' ? xe : m.alter), t: kurz ? kurzText(m.text) : m.text }))
    .sort((a, b) => a.x - b.x)
    .forEach((m) => { const p = gruppen[gruppen.length - 1]; if (p && m.x - p.x < 3) p.t += `, ${m.t}`; else gruppen.push(m); });
  (d.pins || []).forEach((p) => gruppen.push({ x: X(p.alter), t: kurz ? '?' : `${p.text} ?`, titel: p.text, pin: true }));
  const zeilen: [number, number][][] = [];
  return gruppen.map((m) => {
    const bw = breite(m.t, fs), rechts = m.x + 4 + bw > w - 2;
    const l = Math.max(0, rechts ? m.x - 4 - bw : m.x + 4), r = rechts ? m.x - 4 : m.x + 4 + bw;
    let zeile = zeilen.findIndex((q) => q.every(([a, b]) => r + 6 <= a || l >= b + 6));
    if (zeile < 0) { zeile = zeilen.length; zeilen.push([]); }
    zeilen[zeile].push([l, r]);
    return { ...m, l, r, rechts, zeile };
  });
}

/**
 * Beschriftungen am Ende der Linien im Vergleich, senkrecht so verteilt, dass sich keine zwei überlagern: sortiert
 * nach der Höhe ihres Linienendes, je mindestens eine Zeile (fs + 3) auseinander, innerhalb von [oben + fs, unten].
 * items: [{ y, t }]; liefert dieselben Einträge mit der Lage der Grundlinie ly.
 */
export function linienLabels<T extends { y: number }>(items: T[], { oben, unten, fs }: { oben: number; unten: number; fs: number }) {
  const z = fs + 3, s = [...items].sort((p, q) => p.y - q.y).map((p) => ({ ...p, ly: Math.max(oben + fs, Math.min(unten, p.y - 4)) }));
  for (let i = 1; i < s.length; i++) s[i].ly = Math.max(s[i].ly, s[i - 1].ly + z);
  // unten übergelaufen: von unten her wieder nach oben schieben
  for (let i = s.length - 1; i >= 0; i--) s[i].ly = Math.min(s[i].ly, i === s.length - 1 ? unten : s[i + 1].ly - z);
  return s;
}

let nr = 0;
/** SVG und Achsenfunktion; o = { w, h, kurz }. d.pins: vorgemerkte Karten; d.varianten: Vergleich «So oder so» (drei Linien im Feld «Vermögen»). */
function zeichne(d: BildDaten, { w = 880, h = 300, kurz = false }: BildOptionen = {}) {
  const id = `bild-${++nr}`, { fs, L, Rr, xs, xe, X } = waagrecht(d, w, kurz);
  const lay = markenLayout(d, { w, kurz }), nZeilen = Math.max(1, ...lay.map((m) => m.zeile + 1));
  const top = kurz ? 4 : 8, gap = nZeilen * (fs + 4) + 12, ax = fs + 10;
  const ph = Math.max(24, (h - top - gap - ax) / 2), t1 = top, u1 = t1 + ph, t2 = u1 + gap, u2 = t2 + ph;
  const s1 = yScale(0, Math.max(1, d.max.proJahr), 3), s2 = yScale(0, Math.max(1, d.max.vermoegen), 2);
  const Y1 = (v: number) => u1 - (Math.max(0, v) / s1.hi) * ph, Y2 = (v: number) => u2 - (Math.max(0, v) / s2.hi) * ph;
  const J = d.jahre;
  let g = '';

  // Raster, Grundlinien, Feldnamen, Werte
  const pxJahr = (w - L - Rr) / (xe - xs), schritt = pxJahr * 5 >= 3 * fs + 4 ? 5 : 10;
  const ticks: number[] = [];
  for (let a = Math.ceil(xs / schritt) * schritt; a <= xe + 1e-9; a += schritt) if (X(a) - X(xs) >= 44) ticks.push(a);
  ticks.forEach((a) => { g += `<line class="grid" x1="${n(X(a))}" x2="${n(X(a))}" y1="${n(t1)}" y2="${n(u1)}"/><line class="grid" x1="${n(X(a))}" x2="${n(X(a))}" y1="${n(t2)}" y2="${n(u2)}"/>`; });
  if (!kurz) {
    if (d.stufe >= 2) s1.ticks.filter((t) => t > 0).forEach((t) => { g += `<line class="grid" x1="${L}" x2="${w - Rr}" y1="${n(Y1(t))}" y2="${n(Y1(t))}"/><text x="${w - Rr + 6}" y="${n(Y1(t) + 4)}">${axisChf(t)}</text>`; });
    if (d.stufe >= 3) s2.ticks.filter((t) => t > 0).forEach((t) => { g += `<line class="grid" x1="${L}" x2="${w - Rr}" y1="${n(Y2(t))}" y2="${n(Y2(t))}"/><text x="${w - Rr + 6}" y="${n(Y2(t) + 4)}">${axisChf(t)}</text>`; });
  }
  g += `<line x1="${L}" x2="${w - Rr}" y1="${n(u1)}" y2="${n(u1)}" stroke="var(--line)"/><line x1="${L}" x2="${w - Rr}" y1="${n(u2)}" y2="${n(u2)}" stroke="var(--line)"/>`;
  const fl = (y: number, t: string) => (kurz ? `<text class="fl halo" x="${L + 2}" y="${n(y + fs)}">${t}</text>` : `<text class="fl" x="${L - 8}" y="${n(y + fs)}" text-anchor="end">${t}</text>`);

  // Einkommen: gestapelte Stufenflächen (Jahresbeträge, angefangene Jahre auf ein ganzes Jahr hochgerechnet)
  const RH = reihen(d);
  if (d.stufe >= 2 && J.length) {
    const stapel = J.map((j) => { let acc = 0; return RH.map(([k]) => { const lo = acc; acc += j[k] / j.anteil; return [lo, acc]; }); });
    RH.forEach(([k], s) => {
      if (!J.some((j) => j[k] > 0.5)) return;
      let oben = '', unten = '';
      J.forEach((j, i) => {
        const [lo, hi] = stapel[i][s];
        oben += `${i ? 'L' : 'M'}${n(X(j.x0))},${n(Y1(hi))}L${n(X(j.x1))},${n(Y1(hi))}`;
        unten = `L${n(X(j.x1))},${n(Y1(lo))}L${n(X(j.x0))},${n(Y1(lo))}` + unten;
      });
      g += `<path data-reihe="${k}" d="${oben}${unten}Z" fill="${FARBE[k]}"${k === 'uebrig' ? ' fill-opacity="0.45"' : ''}/>`;
    });
  }
  // Ausgaben, Lücke «aus dem Vermögen», Vermögen und Stresstest
  if (d.stufe >= 3 && J.length) {
    const ein = (j: BildJahr) => (j.lohn + j.uebrig + j.pk + j.ahv) / j.anteil;
    const luecke = J.filter((j) => j.ausVermoegen! > 0.5).map((j) => `M${n(X(j.x0))},${n(Y1(j.bedarf! / j.anteil))}H${n(X(j.x1))}V${n(Y1(ein(j)))}H${n(X(j.x0))}Z`).join('');
    if (luecke) g += `<path d="${luecke}" fill="url(#${id}-hx)"/>`;
    g += `<path d="${J.map((j, i) => `${i ? 'V' : `M${n(X(j.x0))},`}${n(Y1(j.bedarf! / j.anteil))}H${n(X(j.x1))}`).join('')}" fill="none" stroke="var(--ink)" stroke-width="2"/>`;
    const linie = (feld: 'vermoegen' | 'stress'): BildLinie => [[xs, d.vStart ?? 0], ...J.filter((j) => j[feld] != null).map((j): [number, number] => [j.x1, j[feld]!])];
    const pv = linie('vermoegen'), pfad = (p: BildLinie) => p.map(([a, v], i) => `${i ? 'L' : 'M'}${n(X(a))},${n(Y2(v))}`).join('');
    if (mitVarianten(d)) {
      // Vergleich: der Plan gestrichelt, die gewählte Variante kräftig mit Fläche, die andere dünn; ohne Stresstest
      const v = d.varianten!, sel = v[v.gewaehlt];
      if (sel) g += `<path d="${pfad(sel)}L${n(X(sel[sel.length - 1][0]))},${n(u2)}L${n(X(xs))},${n(u2)}Z" fill="var(--s1)" fill-opacity="0.12"/>`;
      g += `<path data-linie="plan" d="${pfad(pv)}" fill="none" stroke="var(--ink-2)" stroke-width="2" stroke-dasharray="7 5" stroke-linejoin="round"/>`;
      (['a', 'b'] as const).filter((k) => v[k]).forEach((k) => {
        const dick = k === v.gewaehlt;
        g += `<path data-linie="${k}" d="${pfad(v[k]!)}" fill="none" stroke="${dick ? 'var(--s1)' : 'var(--s2)'}" stroke-width="${dick ? 3.5 : 1.5}" stroke-linejoin="round"/>`;
      });
      const ende = (p: BildLinie) => Y2(p[p.length - 1][1]);
      const lab: { y: number; t: string; sel?: boolean }[] = [{ y: ende(pv), t: kurz ? 'Plan' : 'heutiger Plan' }, ...(['a', 'b'] as const).filter((k) => v[k]).map((k) => ({ y: ende(v[k]!), t: k.toUpperCase(), sel: k === v.gewaehlt }))];
      linienLabels(lab, { oben: t2, unten: u2 - 2, fs }).forEach((m) => { g += `<text class="ll halo${m.sel ? ' sel' : ''}" x="${n(w - Rr - 4)}" y="${n(m.ly)}" text-anchor="end">${esc(m.t)}</text>`; });
    } else {
      g += `<path d="${pfad(pv)}L${n(X(pv[pv.length - 1][0]))},${n(u2)}L${n(X(xs))},${n(u2)}Z" fill="var(--s1)" fill-opacity="0.12"/><path d="${pfad(pv)}" fill="none" stroke="var(--s1)" stroke-width="2.5" stroke-linejoin="round"/>`;
      // Szenario «früher aufhören»: statt des Stresstests der heutige Plan, gestrichelt
      if (d.szenario) { if (d.szenario.plan.length > 1) g += `<path data-linie="plan" d="${pfad(d.szenario.plan)}" fill="none" stroke="var(--ink-2)" stroke-width="2" stroke-dasharray="7 5" stroke-linejoin="round"/>`; } else {
        const pst = linie('stress');
        if (pst.length > 1) g += `<path d="${pfad(pst)}" fill="none" stroke="var(--s2)" stroke-width="2" stroke-dasharray="5 4" stroke-linejoin="round"/>`;
      }
    }
  }

  // Marken: gestrichelte Linien über beide Felder, Beschriftung zwischen den Feldern (markenLayout)
  lay.forEach((m) => {
    const tx = `x="${n(m.rechts ? m.r : m.l)}" y="${n(u1 + (m.zeile + 1) * (fs + 4) + 2)}"${m.rechts ? ' text-anchor="end"' : ''}`;
    // Pin einer vorgemerkten Karte: fein gestrichelt, Titel und «?»; der Titel auch als Tooltip
    if (m.pin) g += `<g class="pin"><title>${esc(`${m.titel}: noch nicht Teil des Plans`)}</title><line class="pinl" x1="${n(m.x)}" x2="${n(m.x)}" y1="${n(t1)}" y2="${n(u2)}" stroke-dasharray="2 3"/><text class="pint" ${tx}>${esc(m.t)}</text></g>`;
    // Die Marke «Horizont» führt im Formular zur Einstellung des Planungshorizonts (results.js)
    else g += `<line class="mk" x1="${n(m.x)}" x2="${n(m.x)}" y1="${n(t1)}" y2="${n(u2)}" stroke-dasharray="4 4"/><text class="mkt" ${tx}${m.t.includes('Horizont') ? ' data-horizont=""' : ''}>${esc(m.t)}</text>`;
  });

  // Achse: «heute» am Anfang, dann Alter in Schritten von 5 bzw. 10 Jahren
  const ya = u2 + fs + 5;
  g += `<text class="heute" x="${n(X(xs))}" y="${n(ya)}">heute</text>`;
  ticks.forEach((a) => { g += `<text x="${n(X(a))}" y="${n(ya)}" text-anchor="middle">${a}</text>`; });
  if (!kurz) g += `<text x="${L - 8}" y="${n(ya)}" text-anchor="end">${d.cpl ? 'Alter P1' : 'Alter'}</text>`;

  // Beschriftungen in den Flächen, wo sie Platz haben
  if (d.stufe >= 2 && J.length) {
    const stapel = J.map((j) => { let acc = 0; return RH.map(([k]) => { const lo = acc; acc += j[k] / j.anteil; return [lo, acc]; }); });
    RH.forEach(([k, t, tk], s) => {
      const txt = kurz ? tk : t, bw = breite(txt, fs);
      let best = null as Lauf | null, run = null as Lauf | null;
      J.forEach((_j, i) => {
        const [lo, hi] = stapel[i][s];
        if (Y1(lo) - Y1(hi) >= fs + 4) { run = run || ({ a: i } as Lauf); run.b = i; } else run = null;
        if (run && (!best || X(J[run.b].x1) - X(J[run.a].x0) > X(J[best.b].x1) - X(J[best.a].x0))) best = { ...run };
      });
      if (!best || X(J[best.b].x1) - X(J[best.a].x0) < bw + 4) return;
      const m = Math.floor((best.a + best.b) / 2), [lo, hi] = stapel[m][s];
      const xm = (X(J[best.a].x0) + X(J[best.b].x1)) / 2;
      g += `<text class="al${k.startsWith('lohn') ? ' hell' : ''}" x="${n(xm)}" y="${n((Y1(lo) + Y1(hi)) / 2 + fs * 0.35)}" text-anchor="middle">${txt}</text>`;
    });
  }
  if (d.stufe >= 3 && J.length) {
    const ein = (j: BildJahr) => (j.lohn + j.uebrig + j.pk + j.ahv) / j.anteil;
    const t = kurz ? 'Ausgaben' : 'Ausgaben inkl. Steuern', bw = breite(t, fs);
    const j = J[Math.min(J.length - 1, Math.floor(J.length * 0.7))], xm = Math.min(w - Rr - bw / 2, Math.max(L + bw / 2, X((j.x0 + j.x1) / 2)));
    const yb = Y1(j.bedarf! / j.anteil);
    g += `<text class="al halo" x="${n(xm)}" y="${n(yb - 6 < t1 + fs ? yb + fs + 4 : yb - 6)}" text-anchor="middle">${t}</text>`;
    const gr = J.reduce((b, x) => (Y1(ein(x)) - Y1(x.bedarf! / x.anteil) > Y1(ein(b)) - Y1(b.bedarf! / b.anteil) ? x : b), J[0]);
    const hoehe = Y1(ein(gr)) - Y1(gr.bedarf! / gr.anteil), tl = 'aus dem Vermögen';
    if (!kurz && gr.ausVermoegen! > 0.5 && hoehe >= fs + 6) {
      // beginnt frühestens am Anfang des Jahres mit der grössten Lücke (nicht über der Fläche davor)
      const xl = Math.min(w - Rr - breite(tl, fs) / 2, Math.max(X(gr.x0) + 4 + breite(tl, fs) / 2, X((gr.x0 + gr.x1) / 2)));
      g += `<text class="al akzent halo" x="${n(xl)}" y="${n((Y1(ein(gr)) + Y1(gr.bedarf! / gr.anteil)) / 2 + fs * 0.35)}" text-anchor="middle">${tl}</text>`;
    }
    // Kernaussage am Vermögen: aufgebraucht mit … bzw. reicht bis … (im Vergleich steht sie im Umschalter)
    const dep = d.reach?.base?.dep;
    if (mitVarianten(d)) { /* Vergleich: keine Kernaussage des Plans im Bild */ } else if (dep != null) {
      const x = X(dep), tt = `aufgebraucht mit ${Math.floor(dep + 1e-9)}`, rechts = x + breite(tt, fs + 1) > w - Rr;
      g += `<circle cx="${n(x)}" cy="${n(u2)}" r="5" fill="var(--s2)"/><text class="kern halo" x="${n(rechts ? x - 6 : x + 6)}" y="${n(u2 - 8)}"${rechts ? ' text-anchor="end"' : ''} font-size="${fs + 1}">${tt}</text>`;
    } else if (d.H != null) {
      // Oben rechts im Feld; verlaufen die Linien dort, steht die Aussage unter ihnen in der Fläche
      const tt = `reicht bis ${d.H}`, ab = xs + ((w - Rr - breite(tt, fs + 1) - 8 - L) / (w - L - Rr)) * (xe - xs);
      const ys = J.filter((j) => j.x1 >= ab).flatMap((j) => [j.vermoegen, d.szenario ? null : j.stress]).filter((v) => v != null).map(Y2);
      (d.szenario?.plan || []).filter(([a]) => a >= ab).forEach(([, v]) => ys.push(Y2(v)));
      const oben = t2 + fs + 2, unter = Math.max(...ys, t2) + fs + 7;
      const y = ys.length && Math.min(...ys) < oben + 6 && unter <= u2 - 4 ? unter : oben;
      g += `<text class="kern halo" x="${n(w - Rr - 4)}" y="${n(y)}" text-anchor="end" font-size="${fs + 1}">${tt}</text>`;
    }
  }

  // Platzhalter für leere Felder
  const xc = (L + w - Rr) / 2;
  if (d.stufe < 2) g += `<text class="ph" x="${n(xc)}" y="${n(t1 + ph / 2 + fs / 2)}" text-anchor="middle" font-size="${fs + 1}">Hier erscheinen Lohn, Renten und Ausgaben</text>`;
  if (d.stufe < 3) g += `<text class="ph" x="${n(xc)}" y="${n(t2 + ph / 2 + fs / 2)}" text-anchor="middle" font-size="${fs + 1}">Hier erscheint das Vermögen</text>`;
  g += fl(t1, 'pro Jahr') + fl(t2, 'Vermögen');

  const defs = `<defs><pattern id="${id}-hx" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3" height="7" fill="var(--s4)"/></pattern></defs>`;
  const svg = `<svg class="bildsvg" viewBox="0 0 ${w} ${n(h)}" font-size="${fs}" role="img" aria-label="${esc(bildText(d))}">${defs}${g}<line class="xh" y1="${n(t1)}" y2="${n(u2)}" style="display:none"/></svg>`;
  return { svg, X };
}

/** SVG-Zeichenkette des Bilds; o = { w, h, kurz }. */
export const bildSvg = (d: BildDaten, o?: BildOptionen) => zeichne(d, o).svg;

/**
 * Platz für das Bild: vom oberen Rand des Bilds bis zum sichtbaren Ende der Bühne (höchstens Fensterunterkante),
 * abzüglich dessen, was darunter sichtbar bleiben soll: im Formularmodus alles bis und mit «+ Thema» in der
 * Themenleiste (gemessen; der Abstand hängt nicht von der Höhe des Bilds ab), sonst der Hinweis unter dem Bild und der
 * Innenabstand. Gemessen ohne Scrollen der Bühne.
 */
function platz(host: HTMLElement, bis?: Element | null) {
  const vh = typeof window !== 'undefined' && window.innerHeight > 0 ? window.innerHeight : 800;
  const box = host.closest?.('.results');
  if (!box) return vh;
  const b = box.getBoundingClientRect(), hb = host.getBoundingClientRect();
  // bis: was unter dem Bild ohne Scrollen sichtbar bleiben soll (im Vergleich die Knöpfe), sonst «+ Thema»
  const plus = (bis || box.querySelector?.('#themenleiste .th-plus')) as HTMLElement | null;
  const unten = plus && plus.offsetHeight ? plus.getBoundingClientRect().bottom - hb.bottom + 16 : ((host.nextElementSibling as HTMLElement | null)?.offsetHeight || 0) + 32;
  // bis zur Fensterunterkante (nicht bis zum Ende der Bühne: ihre Höhe hängt selbst von der Höhe des Bilds ab)
  return vh - Math.max(0, b.top) - (hb.top - b.top + box.scrollTop) - unten;
}

/**
 * Höhe des Bilds: etwa 16:9, höchstens max (520; auf der Bühne mit gemessenem Platz 680) und der verfügbare Platz, mindestens 300 Pixel; ab 769 px Fensterbreite
 * bei knappem Platz mindestens 220 Pixel (damit die Themenleiste sichtbar bleibt).
 */
export const hoeheFuer = (w: number, frei: number, breit = typeof window !== 'undefined' && window.innerWidth > 768, max = 520) =>
  Math.round(Math.max(frei < 300 && breit ? 220 : 300, Math.min(max, (w * 9) / 16, frei)));

// Neu zeichnen, sobald sich die Breite ändert (auch beim ersten Einblenden, z. B. «Ergebnis» auf dem Handy)
const beobachtet = new Set<BildHost>();
const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver((es) => es.forEach((e) => {
  const el = e.target as BildHost, w = Math.round(e.contentRect.width);
  if (el._bild && w > 0 && Math.abs(w - (el._bildW || 0)) > 4) el._bild();
})) : null;
function beobachte(el: BildHost, zeichnen: () => void) {
  el._bild = zeichnen;
  zeichnen();
  if (!ro) return;
  beobachtet.forEach((x) => { if (!x.isConnected) { ro.unobserve(x); beobachtet.delete(x); } });
  if (!beobachtet.has(el)) { ro.observe(el); beobachtet.add(el); }
}
// Die Höhe des Bilds folgt dem Platz im Fenster: neu zeichnen, wenn sich die Fensterhöhe ändert (Vollbild)
if (typeof window !== 'undefined') {
  let hoch = window.innerHeight, wartet = false;
  window.addEventListener('resize', () => {
    if (window.innerHeight === hoch || wartet) return;
    wartet = true;
    (window.requestAnimationFrame || setTimeout)(() => {
      wartet = false; hoch = window.innerHeight;
      beobachtet.forEach((el) => { if (el.isConnected && el.clientWidth > 0) el._bild?.(); });
    });
  });
}
/** Breite des Hosts; verborgen (0) gilt die Ersatzbreite, bis der Beobachter die echte meldet. */
const breiteVon = (host: BildHost, ersatz: number) => { const w = Math.round(host.clientWidth || 0); host._bildW = w; return Math.max(260, w || ersatz); };

/** Kleines Bild (über den Schritten): echte Breite, 150 Pixel hoch, gekürzte Beschriftung. */
export function renderMiniBild(host: HTMLElement, d: BildDaten) {
  beobachte(host, () => { host.innerHTML = bildSvg(d, { w: breiteVon(host, 343), h: 150, kurz: true }); });
}

/**
 * Bild in host einsetzen, in der echten Breite (Text bleibt lesbar); Werte mit Pfeiltasten, Maus und Tippen.
 * bis: Element, das unter dem Bild ohne Scrollen sichtbar bleiben soll (die Höhe folgt dem Platz bis dorthin).
 * frei: verfügbare Höhe statt der gemessenen (Tutor: Infinity, die Höhe folgt allein der Breite).
 */
export function renderBild(host: HTMLElement, d: BildDaten, { kurz, halb, bis, frei }: BildRenderOptionen = {}) {
  beobachte(host, () => zeichneIn(host, d, kurz, halb, bis, frei));
}
function zeichneIn(host: HTMLElement, d: BildDaten, kurz?: boolean, halb?: boolean, bis?: Element | null, frei0?: number) {
  const w = breiteVon(host, 880), k = kurz ?? w < 480, frei = frei0 ?? platz(host, bis);
  const { svg, X } = zeichne(d, { w, h: halb ? Math.max(150, Math.round(hoeheFuer(w, frei) / 2)) : hoeheFuer(w, frei, undefined, frei0 == null ? 680 : 520), kurz: k });
  host.innerHTML = svg;
  if (d.stufe < 2 || !d.jahre.length) return;
  const xl = d.cpl ? 'Alter Person 1' : 'Alter';
  attachTip(host, host.querySelector('svg')!, { W: w, X }, d.jahre.map((j) => (j.x0 + j.x1) / 2), (i) => {
    const j = d.jahre[i];
    if (!j) return '';
    const mt = Math.round(j.anteil * 12), teil = mt < 12 ? ` (${mt} ${mt === 1 ? 'Monat' : 'Monate'})` : '';
    const z = reihen(d).filter(([k2]) => (k2 !== 'uebrig' || j.uebrig > 0.5) && (k2 !== 'lohn2' || d.jahre.some((x) => x.lohn2 > 0.5))).map(([k2, t]): TipZeile => [FARBE[k2], t, chf(j[k2])]);
    if (d.stufe >= 3 && mitVarianten(d)) {
      // Im Vergleich: Vermögen Ende Jahr je Variante (Punkt i + 1 der Reihe; Punkt 0 ist der Stand heute) und im Plan
      const v = d.varianten!;
      z.push(['var(--ink)', 'Ausgaben inkl. Steuern (Plan)', chf(j.bedarf!)]);
      (['a', 'b'] as const).forEach((k2) => z.push([k2 === v.gewaehlt ? 'var(--s1)' : 'var(--s2)', `Vermögen ${k2.toUpperCase()}`, v[k2]?.[i + 1] ? chf(v[k2]![i + 1][1]) : '–']));
      z.push(['var(--ink-2)', 'Vermögen heutiger Plan', chf(j.vermoegen!)]);
    } else if (d.stufe >= 3) z.push(['var(--ink)', 'Ausgaben inkl. Steuern', chf(j.bedarf!)], ['', 'Aus dem Vermögen', chf(j.ausVermoegen!)], ['var(--s1)', 'Freies Vermögen Ende Jahr', chf(j.vermoegen!)],
      d.szenario ? ['var(--ink-2)', 'Vermögen heutiger Plan', d.szenario.plan[i + 1] ? chf(d.szenario.plan[i + 1][1]) : '–'] : ['var(--s2)', 'Stresstest', j.stress == null ? '–' : chf(j.stress)]);
    return tipRows(`${xl} ${j.alter} · ${j.jahr}${teil}`, z);
  });
}
