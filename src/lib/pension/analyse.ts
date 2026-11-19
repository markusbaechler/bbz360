// Gesamtauswertung: führt alle Rechnungen für einen Eingabestand aus und liefert ein
// serialisierbares Resultat R (läuft im Web Worker, damit die Oberfläche flüssig bleibt).
import { chf, dec } from './format';
import { buildAktion } from './aktion';
import type { AktionEintrag } from './aktion';
import type { Engine } from './engine';
import type { Liegenschaft, NumLeer, PensState, Person } from './typen';

/** Planungshorizont, wie ihn horizon() liefert. */
export interface Horizont { horizontP: number[]; horizont: number; le: number[] }
/** Eingaben des Rechenkerns: Stand samt Planungshorizont. */
export type RechenInput = PensState & Horizont;
/** Resultat einer Simulation des Rechenkerns, seine Jahreszeilen, Personen und Kapitalbezüge. */
export type SimErgebnis = ReturnType<Engine['simulate']>;
export type SimZeile = SimErgebnis['rows'][number];
export type SimPerson = SimErgebnis['ps'][number];
export type KapBezug = SimErgebnis['kapListe'][number];
/** Wie T, aber «leer» ('') ist ausgeschlossen: für Vergleiche wie im Original ('' > 0 ist false). */
export type OhneLeer<T> = { [K in keyof T]: '' extends T[K] ? Exclude<T[K], ''> : T[K] };

/** Resultat von ausgabenCheck(). */
export interface AusgabenCheck { ausgaben: number; netto: number; quote: number; st: 'tief' | 'hoch' | 'ok' }
/** Hinweis aus dem Optimierungspotenzial: Titel, optional Wert, Erläuterung. */
export interface OptHinweis { t: string; v?: string; x: string }
/** Zwischenspeicher von analyse() für den frühesten grünen Zeitpunkt. */
export interface AnalyseCache { key?: string; ab?: ReturnType<Engine['sofort']>['ab'] }
export type FixHelfer = ReturnType<typeof fixHelpers>;
export type FixJahr = ReturnType<FixHelfer['fixJahr']>;
export type FixAuswertung = ReturnType<typeof calcFix>;
/** Beitrag eines Wunschs zum Ergebnis (R.wb). */
export interface WunschBeitrag {
  k: number;
  dEnd: number;
  dMax: number;
  stOhne: ReturnType<Engine['ampel']>['st'];
  ausland?: { r: ReturnType<Engine['rateHaupt']>; mi: ReturnType<Engine['auslandJahr']>; ka: ReturnType<Engine['auslandJahr']> };
}
/** Resultat von analyse(), solange keine Ausgaben erfasst sind. */
export interface AuswertungLeer extends Horizont { leer: true }
/** Vollständiges Resultat R von analyse(). */
export interface Auswertung extends Horizont {
  leer: false;
  inp: RechenInput;
  amp: ReturnType<Engine['ampel']>;
  base: SimErgebnis;
  maxA: ReturnType<Engine['maxAusgaben']>;
  tr: ReturnType<Engine['tragbarkeit']>;
  vs: ReturnType<Engine['vorschlagVorbezug']>;
  so: ReturnType<Engine['sofort']>;
  lk: ReturnType<Engine['luecke']> | null;
  stopA: number;
  wb: (WunschBeitrag | null)[];
  fix: FixAuswertung;
  fixRows: FixJahr[];
  wohnen: ReturnType<FixHelfer['wohnenMonat']>;
  uebrigeFix: number;
  ekHeute: ReturnType<Engine['eigenkapitalReal']>;
  opt: OptHinweis[];
  akt: AktionEintrag[];
}
export type AnalyseErgebnis = Auswertung | AuswertungLeer;

export const FIX_POS = [
  ['wohnen', 'Wohnen', 'leer = aus Liegenschaft bzw. Richtwert Miete'],
  ['kk', 'Krankenkasse', 'Grund- und Zusatzversicherung'],
  ['vers', 'Übrige Versicherungen', 'Hausrat, Haftpflicht, Rechtsschutz, Fahrzeug'],
  ['komm', 'Kommunikation', 'Internet, Mobiltelefon, TV'],
  ['geb', 'Gebühren', 'Serafe, Kontoführung usw.'],
  ['mob', 'Mobilität, fixer Teil', 'ÖV-Abo, Leasing, Parkplatz, Verkehrssteuer'],
  ['ges', 'Gesundheit, Sockel', 'Selbstbehalte, Franchise'],
  ['sonst', 'Weitere Verpflichtungen', 'Alimente, Kreditraten'],
];

const single = (S: PensState) => S.haushalt === 'single';
const personsOf = (S: PensState) => S.personen.slice(0, single(S) ? 1 : 2);

/** Planungshorizont pro Person: Lebenserwartung (+5), 95 oder eigenes Alter. */
export function horizon(S: PensState, E: Engine): Horizont {
  const ps = personsOf(S), m = S.horizontModus || 'le5';
  const horizontP = ps.map((p) =>
    m === 'le5' ? Math.round(E.leAlter(p) + 5) : m === 'le' ? Math.round(E.leAlter(p)) : m === '95' ? 95 : Math.max(70, Math.min(110, +S.horizontEigen || 95)),
  ).map((h, i) => Math.max(h, Math.floor(E.alterBei(ps[i], E.A0)) + 1)); // mindestens ein Jahr über dem heutigen Alter
  const Aend = Math.max(...ps.map((p, i) => E.birthA(p) + horizontP[i] * 12));
  return { horizontP, horizont: Math.floor((Aend - E.birthA(ps[0])) / 12), le: ps.map((p) => E.leAlter(p)) };
}

/**
 * Ausgaben im Ruhestand im Verhältnis zum heutigen Nettolohn (nach Sozialabgaben und pauschaler Steuer).
 * st: 'tief' unter 50%, 'hoch' über 100%, sonst 'ok'. null, solange Lohn oder Ausgaben fehlen.
 */
export function ausgabenCheck(S: PensState, E: Engine): AusgabenCheck | null {
  const a = +S.ausgabenRuhestand || 0, sE = (+S.steuerEink || 0) / 100;
  const netto = personsOf(S).reduce((x, p) => x + (+p.brutto || 0), 0) / 12 * (1 - E.P.annahmen.sozialabgaben) * (1 - sE);
  if (!(a > 0) || !(netto > 0)) return null;
  const quote = a / netto;
  return { ausgaben: a, netto, quote, st: quote < 0.5 ? 'tief' : quote > 1 ? 'hoch' : 'ok' };
}

// ---------- Budget im Ruhestand ----------
/** Positionen des Budgets; «wohnen» folgt bei Eigentum der Liegenschaft, bei Miete der erfassten Miete. */
export const BUDGET_KEYS = ['wohnen', 'kk', 'haushalt', 'mob', 'vers', 'freizeit', 'pers', 'rueck'];
const gesetzt = (v: NumLeer | null | undefined) => v !== '' && v != null && isFinite(+v);
/** Sind alle Positionen ausser Wohnen erfasst? */
export const budgetVoll = (S: PensState) => !!S.budget && BUDGET_KEYS.slice(1).every((k) => gesetzt(S.budget[k]));
export const hatEigenheim = (S: PensState, E: Engine): boolean => E.getLgs(S).some((l: Liegenschaft) => (l.typ || 'eigen') === 'eigen');
/** Budget pro Position (CHF pro Monat). Wohnen: Liegenschaft bzw. erfasste Miete, sonst Budgetwert, sonst Richtwert. */
export function budgetWerte(S: PensState, E: Engine): Record<string, number> {
  const F = fixHelpers(S, E), b = S.budget || {};
  const w = hatEigenheim(S, E) || F.fixSet('wohnen') ? F.wohnenMonat(null).v : gesetzt(b.wohnen) ? +b.wohnen : FIXK(E)[single(S) ? 'single' : 'paar'].miete;
  return Object.fromEntries(BUDGET_KEYS.map((k) => [k, k === 'wohnen' ? w : +b[k] || 0]));
}
const FIXK = (E: Engine) => E.P.annahmen.fixkosten;
export const budgetSumme = (S: PensState, E: Engine) => Math.round(Object.values(budgetWerte(S, E)).reduce((x, v) => x + v, 0));
/** Gilt das Budget, bestimmt seine Summe die Ausgaben im Ruhestand (nach jeder Änderung aufrufen). */
export function applyBudget(S: PensState, E: Engine) {
  if (!S.budgetAktiv) return;
  if (!budgetVoll(S)) { S.budgetAktiv = false; return; }
  S.ausgabenRuhestand = budgetSumme(S, E);
}
/** Musterbudget, dessen Total den Ausgaben am nächsten liegt (ohne Angabe: das mittlere). */
export function naechstesMuster(S: PensState, E: Engine): string {
  const mb = E.P.annahmen.musterbudget[single(S) ? 'single' : 'paar'], a = +S.ausgabenRuhestand || 0;
  const sum = (b: Record<string, number>) => Object.values(b).reduce((x, v) => x + v, 0);
  return a > 0 ? Object.keys(mb).reduce((best, k) => (Math.abs(sum(mb[k]) - a) < Math.abs(sum(mb[best]) - a) ? k : best), 'mittel') : 'mittel';
}

// ---------- Fixkosten ----------
export function fixHelpers(S: PensState, E: Engine) {
  const FX = E.P.annahmen.fixkosten;
  /**
   * Richtwerte der Fixkosten. Krankenkasse: mittlere Prämie für Erwachsene (BAG, geprüfter Jahreswert) pro
   * erwachsene Person. Gilt ein eigenes Budget, folgen die Richtwerte dessen Positionen: «Krankenkasse und
   * Gesundheit» sowie «Versicherungen, Kommunikation, Gebühren» werden im Verhältnis der Richtwerte aufgeteilt,
   * der fixe Teil der Mobilität ist höchstens so hoch wie die Mobilität im Budget.
   */
  const def = () => {
    const d = { ...FX[single(S) ? 'single' : 'paar'], kk: Math.round(E.P.kk.praemieErw * (single(S) ? 1 : 2)) };
    if (!S.budgetAktiv || !budgetVoll(S)) return d;
    const teile = (total: number, keys: string[]) => {
      const sum = keys.reduce((x, k) => x + d[k], 0);
      keys.forEach((k) => { d[k] = sum > 0 ? Math.round((total * d[k]) / sum) : 0; });
    };
    teile(+S.budget.kk, ['kk', 'ges']);
    teile(+S.budget.vers, ['vers', 'komm', 'geb']);
    d.mob = Math.min(d.mob, +S.budget.mob);
    return d;
  };
  const fixSet = (k: string) => S.fix && (S.fix[k] as NumLeer) !== '' && S.fix[k] != null && isFinite(+S.fix[k]);
  /** Wohnkosten selbst bewohntes Eigentum pro Monat (heutige Kaufkraft). */
  function wohnenMonat(row: SimZeile | null) {
    if (fixSet('wohnen')) return { v: +S.fix.wohnen, art: 'eigene Angabe' };
    let v = 0, n = 0;
    E.getLgs(S).forEach((l: Liegenschaft, k: number) => {
      if ((l.typ || 'eigen') !== 'eigen') return;
      if (row && !(row.lgWerte[k] > 0)) return;
      const hyp = row ? row.lgHyp[k] / row.I : +l.hypothek || 0;
      v += (hyp * (+l.zins || 0)) / 100 / 12 + ((+l.verkehrswert || 0) * (l.unterhalt ?? 0.5)) / 100 / 12 + (l.nebenkosten ?? 400);
      n++;
    });
    return n ? { v, art: 'aus Liegenschaft' } : { v: def().miete, art: 'Richtwert Miete' };
  }
  /** Weitere Liegenschaften: Kosten minus Mietertrag, wenn negativ (pro Monat, heutige Kaufkraft). */
  function lgFixMonat(row: SimZeile) {
    let v = 0;
    E.getLgs(S).forEach((l: Liegenschaft, k: number) => {
      if ((l.typ || 'eigen') === 'eigen' || !(row.lgWerte[k] > 0)) return;
      v += Math.max(0, ((row.lgHyp[k] / row.I) * (+l.zins || 0)) / 100 / 12 + (l.verkehrswert * (l.unterhalt ?? 1)) / 100 / 12 - (+l.mietertrag || 0) / 12);
    });
    return v;
  }
  const uebrigeFix = () => FIX_POS.slice(1).reduce((x, [k]) => x + (fixSet(k) ? +S.fix[k] : def()[k]), 0);
  function fixJahr(r: SimZeile) {
    const sE = (+S.steuerEink || 0) / 100, w = wohnenMonat(r).v, lg = lgFixMonat(r), ueb = uebrigeFix();
    const renten = r.ahv + r.pk, steuern = renten * sE;
    const wohnen = w * 12 * r.I, uebrig = (ueb + lg) * 12 * r.I, fix = wohnen + uebrig + steuern;
    return { year: r.year, age: r.age, ages: r.ages, ahv: r.ahv, pk: r.pk, renten, wohnen, uebrig, steuern, fix, saldo: renten - fix, q: fix > 0 ? renten / fix : 0, erwerb: r.lohn > 0, I: r.I };
  }
  return { def, fixSet, wohnenMonat, lgFixMonat, uebrigeFix, fixJahr };
}

function calcFix(S: PensState, E: Engine, base: SimErgebnis, F: FixHelfer) {
  const ps = base.ps, sE = (+S.steuerEink || 0) / 100, A = E.P.annahmen;
  const Aall = Math.max(...ps.map((p: SimPerson) => Math.max(p.Aahv, p.Aret)));
  // erstes ganzes Jahr, in dem alle Renten laufen; beziehen schon alle, das erste ganze Jahr der Rechnung
  const Y = Math.max(Math.floor(Aall / 12) + 1, E.BASIS + (E.A0 % 12 === 0 ? 0 : 1));
  const row = base.rows.find((r: SimZeile) => r.year === Y);
  if (!row) return null;
  const a = F.fixJahr(row);
  const r85 = base.rows.find((r: SimZeile) => r.age === 85 && r.year > Y);
  const b = r85 ? F.fixJahr(r85) : null;
  const mitG = ps.filter((p: SimPerson) => (p.pkGuthabenPlan as number) > 0 && p.pkRente > 0 && (p.pkGuthabenPlan as number) > (+p.pkKapital || 0));
  const u = mitG.length
    ? mitG.reduce((x: number, p: SimPerson) => x + +p.pkRente, 0) / mitG.reduce((x: number, p: SimPerson) => x + (p.pkGuthabenPlan as number) - (+p.pkKapital || 0), 0)
    : ps.reduce((x: number, p: SimPerson) => x + (A.uws65 - A.uwsProJahr * Math.max(0, 65 - p.pensAlter)) / 100, 0) / ps.length;
  const m = b && b.saldo < a.saldo ? b : a;
  const kapHeute = ps.reduce((x: number, p: SimPerson) => x + (+p.pk.kapital || 0), 0);
  const kapDelta = -(m.saldo / (1 - sE)) / u;
  return { a, b, m, u, uAus: mitG.length > 0, kapDelta, kapHeute, Y, wohnenArt: F.wohnenMonat(row).art, lgw: [a, b].filter(Boolean).some((x) => x!.uebrig / 12 / x!.I > F.uebrigeFix() + 1) };
}

// ---------- Optimierungspotenzial ----------
function buildOpt(S: PensState, E: Engine, R: Auswertung): OptHinweis[] {
  const o: OptHinweis[] = [], P = E.P, base = R.base, ps = base.ps, cpl = ps.length > 1, verh = S.haushalt === 'verheiratet';
  const w = (i: number) => (cpl ? `Person ${i + 1}: ` : '');
  const jahreBis = (Am: number) => Math.max(0, (Am - E.A0) / 12);
  const grp: Record<string, KapBezug[]> = {};
  base.kapListe.forEach((e: KapBezug) => { const k = verh ? `${e.year}` : `${e.year}-${e.person}`; (grp[k] = grp[k] || []).push(e); });
  let spar = 0;
  const txt: string[] = [];
  Object.values(grp).filter((g) => g.length > 1).forEach((g) => {
    const zus = g.reduce((x, e) => x + e.steuer, 0), einzeln = g.reduce((x, e) => x + E.kapSteuer(S.kanton, e.betrag / e.I, verh) * e.I, 0);
    const d = (zus - einzeln) / g[0].I;
    if (d > 500) { spar += d; txt.push(`${g[0].year}: ${g.map((e) => `${e.art}${cpl ? ' P' + (e.person + 1) : ''} ${chf(e.betrag)}`).join(', ')}`); }
  });
  // Angaben, die zusammen keinen Sinn ergeben: Der Rechenkern übergeht sie still, hier werden sie genannt
  const pruef: string[] = [];
  (S.personen.slice(0, ps.length) as OhneLeer<Person>[]).forEach((p, i) => {
    // Rente und Kapital zusammen müssen zum Guthaben passen: Ein Umwandlungssatz über 7,2% deutet auf eine volle Rente neben einem Kapitalbezug
    const rest = (+p.pkGuthabenPlan || 0) - (+p.pkKapital || 0);
    if (p.pkGuthabenPlan > 0 && p.pkRente > 0 && p.pkKapital > 0 && (rest <= 0 || p.pkRente / rest > 0.072)) pruef.push(`${w(i)}PK-Rente ${chf(p.pkRente)} und Kapitalbezug ${chf(p.pkKapital)} passen nicht zum Guthaben von ${chf(p.pkGuthabenPlan)} bei der Pensionierung: Die Rente gilt laut Ausweis nur für den Teil, der nicht als Kapital bezogen wird`);
    if (p.pkGuthabenPlan > 0 && !(p.pkRente > 0) && !(p.pkKapital > 0)) pruef.push(`${w(i)}Zur Pensionskasse ist ein Guthaben erfasst, aber weder Rente noch Kapitalbezug: Gerechnet wird ohne Leistung der Pensionskasse`);
    if (p.teilAb > 0 && p.teilPensum > 0 && p.teilPensum < 100 && p.teilAb >= p.pensAlter) pruef.push(`${w(i)}Die Teilpensionierung ab ${p.teilAb} liegt nicht vor der Pensionierung mit ${p.pensAlter} und wird nicht gerechnet`);
    if ((p.pkRente > 0 || p.pkKapital > 0 || p.pkGuthabenPlan > 0) && (p.minAlter || P.bvg.minAlter) > p.pensAlter && E.abAlter(p, p.pensAlter) >= E.A0) pruef.push(`${w(i)}Das früheste Pensionsalter der Pensionskasse (${p.minAlter || P.bvg.minAlter}) liegt über dem geplanten Alter (${p.pensAlter}): Statt Rente und Kapital der Pensionskasse wird das Guthaben als Freizügigkeit gerechnet`);
  });
  (S.wuensche || []).forEach((x) => {
    if (x.aktiv !== false && (x.typ === 'jahr' || x.typ === 'ausland') && !(+x.von! < +x.bis!)) pruef.push(`Wunsch «${x.name || 'ohne Namen'}»: «von Alter» liegt nicht vor «bis Alter»; ${x.typ === 'ausland' && x.wohnform === 'kauf' ? 'gerechnet werden nur Kauf, laufende Kosten und Vermietung der Liegenschaft, nicht der Aufenthalt' : 'er wird nicht gerechnet'}`);
  });
  (S.einkommen || []).forEach((x) => {
    if (x.betrag > 0 && x.bisJahr > 0 && x.bisJahr < E.BASIS) pruef.push(`Übriges Einkommen von ${chf(x.betrag)}: «bis Jahr» ${x.bisJahr} liegt in der Vergangenheit, es wird nicht gerechnet`);
    const pe = S.personen[x.person || 0];
    if (x.betrag > 0 && x.abPens && x.art === 'nebenerwerb' && pe && x.bisJahr >= E.BASIS && x.bisJahr * 12 + 12 <= E.abAlter(pe, pe.pensAlter)) pruef.push(`Nebenerwerb ab der Pensionierung von ${chf(x.betrag)}: «bis Jahr» ${x.bisJahr} liegt vor der Pensionierung, er wird nicht gerechnet`);
  });
  (S.amortisationen || []).forEach((x) => {
    if (x.betrag > 0 && x.jahr > 0 && x.jahr < E.BASIS) pruef.push(`Amortisation von ${chf(x.betrag)}: Das Jahr ${x.jahr} liegt in der Vergangenheit, gerechnet wird sie im laufenden Monat`);
  });
  if (pruef.length) o.push({ t: 'Eingaben prüfen', x: pruef.join('. ') + '.' });
  if (spar > 0) o.push({ t: 'Staffelung der Kapitalbezüge prüfen', v: `bis ${chf(spar)} Steuern`, x: `Im selben Steuerjahr werden die Bezüge zusammengezählt${verh ? ' (auch die des Ehepartners)' : ''} und progressiv besteuert: ${txt.join('; ')}. Einzeln in verschiedenen Jahren bezogen, wäre die Steuer um bis zu ${chf(spar)} tiefer (heutige Kaufkraft). Wege: 3a ab ${Math.min(...ps.map((p: SimPerson) => p.ref)) - P.vorsorge.bezugJahreVorRef} in den Jahren vor der Pensionierung beziehen, künftige 3a-Einzahlungen auf ein weiteres Konto leiten (ein bestehendes Guthaben lässt sich nicht aufteilen), die Austrittsleistung beim Austritt auf zwei Freizügigkeitsstiftungen verteilen, Bezüge der Partner in verschiedene Jahre legen.` });
  ps.forEach((p: SimPerson, i: number) => {
    if (!(p.brutto > 0) || (p.s3aModus || 'max') === 'max' || !(p.s3aEinz < P.s3a.maxMitPK)) return;
    const n = Math.floor(jahreBis(p.Aret));
    if (n < 1) return;
    const d = P.s3a.maxMitPK - (+p.s3aEinz || 0);
    o.push({ t: `${w(i)}Volle Einzahlung in die Säule 3a prüfen`, v: `ca. ${chf(d * 0.25)} Steuern pro Jahr`, x: `Heute ${chf(p.s3aEinz || 0)} statt des Maximums von ${chf(P.s3a.maxMitPK)} pro Jahr. Die zusätzlichen ${chf(d)} sind vom Einkommen abziehbar; bei einem Grenzsteuersatz von rund 25% spart das etwa ${chf(d * 0.25)} Steuern pro Jahr, über ${n} Jahre rund ${chf(d * 0.25 * n)}. Lücken ab dem Jahr 2025 lassen sich unter Bedingungen nachträglich einkaufen (Art. 7a BVV 3).` });
  });
  ps.forEach((p: SimPerson, i: number) => {
    ([['s3a', 's3aAnlage', 'Säule 3a'], ['fz', 'fzAnlage', 'Freizügigkeit']] as const).forEach(([k, a, name]) => {
      const amt = +p[k] || 0, n = jahreBis(p.Akap);
      if ((p[a] || 'konto') !== 'konto' || amt < 20000 || n < 5) return;
      const zk = (S.zins3aKonto as NumLeer) === '' || S.zins3aKonto == null ? 0.5 : +S.zins3aKonto;
      const d = amt * (Math.pow(1.03, n) - Math.pow(1 + zk / 100, n));
      o.push({ t: `${w(i)}Anlage der ${name} prüfen`, v: `ca. + ${chf(d)}`, x: `${chf(amt)} liegen auf einem Konto (${dec(zk)}%), der Bezug ist erst in rund ${Math.round(n)} Jahren. Rechenbeispiel, keine Renditeprognose: Mit angenommenen 3% statt des Kontozinses ergäben sich am Ende rund ${chf(d)} mehr (nominal, ohne weitere Einzahlungen). Wertschriften schwanken und können an Wert verlieren; ob und welche Anlage passt, hängt von Risikofähigkeit, Risikobereitschaft und Anlagehorizont ab und ist mit der Bank oder Stiftung zu klären.` });
    });
  });
  {
    const bedarf = 12 * Math.max(+S.ausgabenRuhestand || 0, +S.ausgabenHeute || 0), ueber = (+S.liquiditaet || 0) - bedarf;
    const rWs = S.renditeOverride !== '' && S.renditeOverride != null ? +S.renditeOverride : (P.annahmen.profile[S.anlageprofil] ?? 0.03) * 100, rK = +S.kontoZins || 0;
    if (ueber >= 50000 && rWs > rK) {
      const alt = { ...R.inp, liquiditaet: bedarf, wertschriften: (+S.wertschriften || 0) + ueber };
      const b1 = E.simulate(alt), l1 = b1.rows[b1.rows.length - 1], l0 = base.rows[base.rows.length - 1];
      const dEnd = l1.V / l1.I - l0.V / l0.I, dMax = E.maxAusgaben(alt) - R.maxA;
      const d10 = ueber * (Math.pow(1 + rWs / 100, 10) - Math.pow(1 + rK / 100, 10));
      const prof = ({ vorsichtig: 'vorsichtig', dynamisch: 'dynamisch' } as Record<string, string>)[S.anlageprofil] || 'ausgewogen';
      o.push({ t: 'Höhe der Liquidität prüfen', v: dEnd > 0 ? `ca. + ${chf(dEnd)} am Horizont` : '', x: `Auf Konten liegen ${chf(S.liquiditaet)} zu ${dec(rK)}%. Als Reserve gerechnet ist ein Jahresbedarf von rund ${chf(bedarf)}. Rechenbeispiel, keine Renditeprognose: Die übrigen ${chf(ueber)} mit der Rendite des gewählten Profils (${prof}, ${dec(rWs)}%) ergäben in 10 Jahren rund ${chf(d10)} mehr. In der Gesamtrechnung wären es am Horizont rund ${chf(Math.max(0, dEnd))} mehr (heutige Kaufkraft)${dMax > 50 ? `, die tragbaren Ausgaben stiegen um rund ${chf(dMax)} pro Monat` : ''}. Bei einer Inflation von ${dec(+S.inflation || 0)}% verliert Geld ohne Zins jedes Jahr an Kaufkraft. Wertschriften schwanken und können an Wert verlieren; die passende Aufteilung hängt von Risikofähigkeit und Anlagehorizont ab und ist mit der Bank zu klären (Eignungsprüfung).` });
    }
  }
  if (R.fix) {
    const F = R.fix, q = F.m.q;
    if (q >= 1.1 && -F.kapDelta > 50000) o.push({ t: 'Mehr Kapital statt Rente prüfen', v: `Renten decken Fixkosten ${dec(q)}-fach`, x: `Die Renten decken die Fixkosten auch im knappsten Jahr mit Reserve. Rund ${chf(Math.floor(-F.kapDelta / 10000) * 10000)} mehr Kapitalbezug wären möglich, ohne diese Deckung zu verlieren (Umwandlungssatz ${dec(F.u * 100)}%). Vorteile: Flexibilität, Erbmasse, Amortisation. Nachteile: Anlagerisiko, Kapitalsteuer, Langlebigkeitsrisiko. Reglement und Anmeldefrist beachten.` });
    else if (q < 1 && F.kapHeute > 0) o.push({ t: 'Mehr Rente statt Kapital prüfen', v: `Renten decken Fixkosten ${dec(q)}-fach`, x: `Die Renten decken die Fixkosten nicht (Lücke rund ${chf(-F.m.saldo / 12)} pro Monat im Jahr ${F.m.year}). Mit weniger Kapitalbezug (bis rund ${chf(Math.min(F.kapHeute, Math.ceil(F.kapDelta / 10000) * 10000))}) stiege die lebenslange Rente. Das schützt vor dem Risiko eines langen Lebens.` });
  }
  ps.forEach((p: SimPerson, i: number) => {
    const fzAb = p.ref - P.vorsorge.bezugJahreVorRef;
    if (p.pensAlter < fzAb && p.fz > 50000 && p.pensAlter >= (p.minAlter || P.bvg.minAlter)) o.push({ t: `${w(i)}Einbringen der Freizügigkeit in die PK prüfen`, x: `${chf(p.fz)} Freizügigkeit sind erst ab ${dec(fzAb, 0)} verfügbar, PK-Leistungen dagegen schon mit der Frühpensionierung. Besteht in der Pensionskasse Einkaufspotenzial, ist das Freizügigkeitsguthaben grundsätzlich dorthin zu übertragen (Art. 4 Abs. 2bis FZG); es erhöht dann Rente oder Kapital. Mit der PK klären.` });
  });
  ps.forEach((p: SimPerson, i: number) => {
    if (!(p.brutto > 0)) return;
    const n = jahreBis(p.Aret);
    if (n > 3) o.push({ t: `${w(i)}Einkauf in die Pensionskasse prüfen`, x: `Ein Einkauf ist voll vom Einkommen abziehbar und erhöht Rente oder Kapital. Das Einkaufspotenzial steht auf dem Vorsorgeausweis. ${p.pk.kapital > 0 ? `Die aus einem Einkauf stammenden Leistungen dürfen 3 Jahre lang nicht als Kapital bezogen werden (Art. 79b Abs. 3 BVG); die Steuerbehörden verweigern den Abzug in der Regel bei jedem Kapitalbezug innert dieser Frist. Für den geplanten Kapitalbezug also bis Ende ${E.fmtA(p.Aret - 37)} einkaufen.` : 'Wer später Kapital beziehen will: Nach einem Einkauf gilt eine Sperrfrist von 3 Jahren.'} Offene WEF-Vorbezüge müssen zuerst zurückbezahlt werden.` });
    else if (p.pk.kapital > 0) o.push({ t: `${w(i)}Sperrfrist für PK-Einkäufe vor dem Kapitalbezug prüfen`, x: 'Bis zur Pensionierung bleiben weniger als 3 Jahre. Leistungen aus einem Einkauf dürfen 3 Jahre lang nicht als Kapital bezogen werden (Art. 79b Abs. 3 BVG), und die Steuerbehörden verweigern den Abzug in der Regel bei jedem Kapitalbezug innert dieser Frist; ein Einkauf jetzt könnte den geplanten Kapitalbezug sperren oder den Steuerabzug kosten. Mit Pensionskasse und Steueramt klären.' });
  });
  if (R.tr && R.tr.worst.st !== 'gruen') {
    const am = Math.ceil(R.tr.worst.amort / 1000) * 1000;
    o.push({ t: 'Tragbarkeit der Hypothek mit der Bank klären', v: R.tr.worst.amort > 1000 ? `Amortisation ca. ${chf(am)}` : '', x: `Die Bank rechnet mit ${dec(P.annahmen.tragbarkeit.zins * 100, 0)}% Zins, ${dec(P.annahmen.tragbarkeit.unterhalt * 100, 0)}% Unterhalt und dem Einkommen nach der Pensionierung. ${R.tr.worst.amort > 1000 ? `Mit einer Amortisation von rund ${chf(am)} bis ${R.tr.worst.datum} wäre sie tragbar. ` : ''}Frühzeitig mit der Bank besprechen; eine Amortisation aus 3a oder Freizügigkeit ist nur für selbst bewohntes Eigentum möglich.` });
  }
  ps.forEach((p: SimPerson, i: number) => {
    if (p.ahvFehlJahre > 0 && !(p.ahvModus === 'betrag' && (p.ahvBetrag as number) > 0)) {
      // Verlust, wie er in der Rechnung ankommt: Dauerrenten des Haushalts mit und ohne die Lücke dieser Person
      const mit = E.ahvPlan(S), ohneL = E.ahvPlan({ ...S, personen: S.personen.map((q, j) => (j === i ? { ...q, ahvFehlJahre: 0 } : q)) });
      const zs = (x: ReturnType<Engine['ahvPlan']>) => x.zuschlag.reduce((a: number, b: number) => a + b, 0);
      const verl = Math.max(0, (ohneL.summe - zs(ohneL) - (mit.summe - zs(mit))) * P.ahv.monatsrentenProJahr + (zs(ohneL) - zs(mit)) * 12);
      o.push({ t: `${w(i)}AHV-Beitragslücken prüfen`, v: verl >= 1 ? `bis ${chf(verl)} pro Jahr` : '', x: `${verl >= 1 ? `${p.ahvFehlJahre} fehlende Beitragsjahre kürzen die ${verh ? 'Renten des Ehepaars zusammen' : 'Rente'} um rund ${chf(verl)} pro Jahr (lebenslang${verh ? '; gerechnet mit dem Plafond für Ehepaare' : ''}).` : `${p.ahvFehlJahre} fehlende Beitragsjahre wirken sich nicht mehr aus, sobald beide das Referenzalter erreicht haben, weil die Renten des Ehepaars dann ohnehin auf den Plafond begrenzt sind. Solange erst eine Person eine Rente bezieht, ist diese gekürzt.`} Nachzahlen lassen sich nur die letzten 5 Jahre; Beitragszeiten vor dem 20. Altersjahr können spätere Lücken teilweise füllen. IK-Auszug prüfen.` });
    }
    if ((p.ahvBez || 0) < 0) o.push({ t: `${w(i)}AHV-Vorbezug prüfen`, x: `Der Vorbezug kürzt die Rente lebenslang um ${dec((1 - p.ahvF) * 100)}%${E.uebergang(p) ? ' (reduzierter Satz für die Übergangsgeneration; der Rentenzuschlag entfällt)' : ''}${verh ? '; bei Ehepaaren wird zuerst plafoniert und dann gekürzt' : ''}. Während des Vorbezugs zählt zudem eine Teilrente, weil Beitragsjahre fehlen. Rechnerisch fällt er eher ins Gewicht, je länger die Rente bezogen wird; für ihn sprechen kann knappe Liquidität bis zum Referenzalter. Die Abwägung ist persönlich.` });
  });
  const ohne: [SimPerson, number][] = ps.map((p: SimPerson, i: number) => [p, i] as [SimPerson, number]).filter(([p]: [SimPerson, number]) => p.ahvModus !== 'betrag');
  if (ohne.length) o.push({ t: `${ohne.length === ps.length && cpl ? 'Beide: ' : ohne.length < ps.length ? w(ohne[0][1]) : ''}AHV-Rentenvorausberechnung bestellen`, x: `Die AHV-Rente ist aus dem heutigen Lohn geschätzt${verh ? ' (bei Ehepaaren mit hälftiger Teilung der Einkommen, ohne Erziehungsgutschriften)' : ''}.${ohne.some(([p]) => !(p.brutto > 0)) ? ' Ohne erfassten Lohn rechnet PensCheck mit der Minimalrente; wer bereits pensioniert ist, erfasst besser den Betrag der Vorausberechnung.' : ''} Die Ausgleichskasse berechnet sie auf Antrag, in der Regel kostenlos; der Auszug aus dem individuellen Konto (IK) zeigt zudem allfällige Beitragslücken. Den Betrag danach unter «AHV» als eigenen Betrag erfassen.` });
  base.pkKapVorbei.forEach((v: unknown, i: number) => {
    if (v) o.push({ t: `${w(i)}Bereits bezogenes PK-Kapital im freien Vermögen prüfen`, x: `Die Pensionierung liegt zurück. PensCheck nimmt an, dass das PK-Kapital von ${chf(ps[i].pkKapital)} bereits bezogen ist, und rechnet es nicht noch einmal ein. Liegt es auf Konten oder in Wertschriften, gehört es zum freien Vermögen.` });
  });
  const ne = base.rows.reduce((x: number, r: SimZeile) => x + r.ne / r.I, 0);
  if (ne > 2000) o.push({ t: 'AHV-Beiträge als Nichterwerbstätige prüfen', v: `bis ${chf(ne)}`, x: `Bis zum Referenzalter fallen rund ${chf(ne)} Beiträge als Nichterwerbstätige an (heutige Kaufkraft), berechnet auf dem Vermögen (inklusive Liegenschaften abzüglich Hypotheken) und der ${P.ne.rentenFaktor}-fachen Rente. Wer nicht dauernd voll erwerbstätig ist, ist befreit, wenn auf einem Erwerbseinkommen (z. B. Mandat, Teilzeit) mindestens der Mindestbeitrag und mindestens die Hälfte dieser Beiträge bezahlt wird; tiefere Lohnbeiträge werden auf Gesuch angerechnet.${cpl ? ` Bei Ehepaaren ist die nichterwerbstätige Person befreit, wenn der Partner im Sinne der AHV erwerbstätig ist und mindestens den doppelten Mindestbeitrag (${chf(2 * P.ne.min)}) bezahlt, also ab rund ${chf(Math.ceil((2 * P.ne.min) / (P.ahv.lohnbeitrag ?? 0.106) / 100) * 100)} Lohn im Jahr. Als erwerbstätig gilt, wer dauernd voll arbeitet; bei Teilzeit unter 50% oder einem Nebenerwerb müssen die Lohnbeiträge zudem die Hälfte der eigenen Beiträge als Nichterwerbstätige erreichen, sonst zahlen beide.` : ''} Im Tool unter «Übriges Einkommen» als Nebenerwerb durchrechnen.` });
  return o;
}

/** Wer hört im Was-wäre-wenn früher auf? Index der Person oder null für alle. Bei Paaren standardmässig Person 1. */
export function stopWerOf(S: PensState): 0 | 1 | null {
  if (single(S)) return null;
  const w = S.ui && S.ui.stopWer;
  return w === 'alle' ? null : w === 1 ? 1 : 0;
}

/** Vollständige Auswertung für die Oberfläche. stopA: erster Monat ohne Lohn im Was-wäre-wenn. */
export function analyse(S: PensState, E: Engine, stopA?: number | null, cache: AnalyseCache = {}): AnalyseErgebnis {
  const hz = horizon(S, E);
  const inp = { ...S, ...hz };
  const F = fixHelpers(inp, E);
  if (!(S.ausgabenRuhestand > 0)) return { leer: true, ...hz };
  const amp = E.ampel(inp), base = amp.base;
  const maxA = E.maxAusgaben(inp), tr = E.tragbarkeit(base, inp);
  const vs = E.vorschlagVorbezug(inp);
  // Frühester grüner Zeitpunkt nur neu suchen, wenn sich die Eingaben (nicht nur der Regler) geändert haben
  const wer = stopWerOf(S);
  const key = JSON.stringify({ ...S, ui: undefined, aktion: undefined }) + '|' + E.A0 + '|' + wer;
  const so = E.sofort(inp, stopA ?? E.A0 + 1, cache.key === key ? cache.ab : undefined, wer);
  cache.key = key;
  cache.ab = so.ab;
  const lk = so.now.st !== 'gruen' ? E.luecke(inp, stopA ?? E.A0 + 1, wer) : null;
  const R = { leer: false, ...hz, inp, amp, base, maxA, tr, vs, so, lk, stopA: stopA ?? E.A0 + 1 } as Auswertung;
  R.wb = S.wuensche.map((w, k) => {
    if (w.aktiv === false) return null;
    const res0 = E.simulate(inp, { ohneWunsch: k });
    const l0 = res0.rows[res0.rows.length - 1], l1 = base.rows[base.rows.length - 1];
    const ohne = { ...inp, wuensche: S.wuensche.filter((_x, j) => j !== k) };
    const out: WunschBeitrag = { k, dEnd: l1.V / l1.I - l0.V / l0.I, dMax: maxA - E.maxAusgaben(ohne), stOhne: E.ampel(ohne).st };
    if (w.typ === 'ausland') {
      const r = E.rateHaupt(inp, 0);
      out.ausland = { r, mi: E.auslandJahr(w, S.ausgabenRuhestand, 'miete', r), ka: E.auslandJahr(w, S.ausgabenRuhestand, 'kauf', r) };
    }
    return out;
  });
  R.fix = calcFix(inp, E, base, F);
  // ohne das angebrochene Startjahr: Dort stünden Renten weniger Monate den Fixkosten eines ganzen Jahres gegenüber
  const fr = base.rows.filter((x: SimZeile) => x.ahv + x.pk > 0 && (x.year > E.BASIS || E.A0 % 12 === 0));
  const n = fr.length;
  R.fixRows = (n > 1 && fr[n - 1].ahv + fr[n - 1].pk < 0.9 * (fr[n - 2].ahv + fr[n - 2].pk) ? fr.slice(0, -1) : fr).map(F.fixJahr);
  R.wohnen = F.wohnenMonat(null);
  R.uebrigeFix = F.uebrigeFix();
  R.ekHeute = E.eigenkapitalReal(inp, null);
  R.opt = buildOpt(S, E, R);
  R.akt = buildAktion(S, R, E);
  return R;
}
