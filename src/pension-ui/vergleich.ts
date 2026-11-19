// So oder so (Schritt 6 im Formularmodus, im Tutor-Ergebnis unter «Weiter erkunden»): zwei Werte A und B eines
// Themas vergleichen, «wie beim Optiker».
// Ohne laufenden Vergleich: die Karten zur Wahl; dann ein Formular mit A und B; im Vergleich der Umschalter A | B, das
// Bild mit drei Linien und die Knöpfe «A übernehmen», «B übernehmen», «Verwerfen». Der Zustand ändert sich nur über
// themen.js (vergleichStarten, uebernehmen, verwerfen); A und B rechnet der Worker (R.varianten), hier wird nichts
// gerechnet. Die gewählte Seite und angefangene Eingaben liegen nur in diesem Modul, nicht im gespeicherten Zustand.
// Alles aus dem Zustand (Kartentitel, Wunschnamen, Werte) geht maskiert (esc) ins HTML.
import { esc, fmtIn } from '../lib/pension/format';
import { VAR_FELDER, limitFor } from '../lib/pension/state';
import { setErr, takeNum } from './fielderr';
import { KARTEN, karten, kartenName, vergleichAktiv, vergleichStarten, vergleichSig, uebernehmen, verwerfen, zeileWeiter, zeileAmort } from '../lib/pension/themen';
import { ZUSTAND_TXT } from './themenui';
import { bildLegende, bildVergleich, renderBild } from './bild';
import { reachData } from './reach';
import { ST, tragbar } from './results';
import type { Auswertung } from '../lib/pension/analyse';
import type { VariantenWerte } from '../lib/pension/themen';
import type { Amortisation, Einkommen, NumLeer, Person, Thema, Wunsch } from '../lib/pension/typen';
import type { App } from './app';

/** Rückgabe von createVergleich() (auch app.vergleich). */
export type Vergleich = ReturnType<typeof createVergleich>;
/** Feld einer Karte: [Schlüssel, Beschriftung, Dezimalfeld, Feld für negative Zahlen]. */
export type FeldDef = [k: string, label: string, dez?: boolean | 1, neg?: boolean | 1];
/** Karte eines Vergleichs: das Wunsch- bzw. Themen-Objekt selbst. */
type Ref = Wunsch | Thema;
/** Angezeigtes Formular: Rohtexte und geprüfte Werte (Zahl, '' = leer, null = ungültig) je Seite a und b. */
interface Formular { ref: Ref; sig: string; roh: Record<string, Record<string, string>>; zahl: Record<string, Record<string, NumLeer | null>> }
/** Aussage einer Variante für Umschalter und Textalternative. */
interface Aussage { st: string; wort: string; kern: string; trag: string; hyp: string; txt: string }
/** Seite des Umschalters: Aussage, «wird gerechnet» oder «liess sich nicht rechnen» (fehlt). */
interface SeitenText { txt: string; st: string; fehlt?: boolean; wort?: string; kern?: string; trag?: string; hyp?: string }
/** Laufender Vergleich (vergleichAktiv). */
type Aktiv = NonNullable<ReturnType<typeof vergleichAktiv>>;

const $ = (id: string) => document.getElementById(id);

/**
 * Felder je Karte: [Schlüssel, Beschriftung, Dezimalfeld, Feld für negative Zahlen]. Beschriftungen und Einheiten wie
 * im Formular bzw. im Karteneditor; die Grenzen kommen aus LIMITS (state.js), wie überall.
 */
const JAHR: FeldDef[] = [['betrag', 'CHF pro Jahr'], ['von', 'von Alter', 1], ['bis', 'bis Alter', 1]];
const EINMAL: FeldDef[] = [['betrag', 'Betrag (CHF)'], ['alter', 'Alter', 1]];
export const FELDER: Record<string, FeldDef[]> = {
  reisen: JAHR, pflege: JAHR, anschaffung: EINMAL, schenkung: EINMAL,
  ausland: [['monate', 'Monate pro Jahr', 1], ['von', 'von Alter', 1], ['bis', 'bis Alter', 1]],
  hinterlassen: [['betrag', 'Mindestvermögen am Horizont (CHF, heutige Kaufkraft)']],
  aufhoeren: [['pensAlter', 'Pensionierung mit (Alter, ganze Jahre)', 1]],
  teil: [['teilAb', 'Teilpensionierung ab (Alter, 0 = keine)', 1], ['teilPensum', 'Pensum danach (% des heutigen Pensums)', 1]],
  weiter: [['betrag', 'Lohn pro Jahr (CHF)'], ['bisJahr', 'bis Jahr', 1]],
  rentekapital: [['pkRente', 'PK-Rente ab Pensionierung (CHF pro Jahr)'], ['pkKapital', 'PK-Kapitalbezug bei Pensionierung (CHF)']],
  ahv: [['ahvBezug', 'AHV-Bezug in Jahren (minus: Vorbezug, plus: Aufschub)', 1, 1]],
  verkauf: [['verkaufAlter', 'Verkauf mit Alter (0 = nie)', 1]],
  amort: [['betrag', 'Betrag (CHF)'], ['jahr', 'Jahr', 1], ['monat', 'Monat (1 bis 12)', 1]],
};
const PERSON_FELD = ['aufhoeren', 'teil', 'rentekapital', 'ahv'];
const HINWEIS_RK = 'Bitte für jede Variante Rente und Kapital laut Pensionskasse erfassen. PensCheck rechnet nicht zwischen Rente und Kapital um. Ein Kapitalbezug muss bei der Pensionskasse fristgerecht angemeldet werden und braucht bei Verheirateten und in eingetragener Partnerschaft die schriftliche Zustimmung der Partnerin oder des Partners.';
const TRAG_ST: Record<string, string> = { gruen: 'tragbar', gelb: 'knapp tragbar', rot: 'nicht tragbar' };
const LEER = 'Bitte einen Wert eingeben.';
const SEITEN = ['a', 'b'];
const gross = (w: string) => w.toUpperCase();

// Anmeldung der Druckereignisse der bisherigen Instanz; jede neue ersetzt sie (Tests bauen die Seite mehrfach auf)
let abmeldenDruck: (() => void) | null = null;
export function createVergleich(app: App) {
  const host = $('vergleich')!, box = $('sofortBox') as HTMLDetailsElement | null;
  const form = () => app.S.ui.mode === 'form';
  let gewaehlt = 'a', gewaehltFuer: string | null = null; // Seite im Bild; gilt für den Vergleich mit diesem Schlüssel
  let entwurf: { ref: Ref } | null = null; // { ref }: Karte, für die ein Vergleich vorbereitet wird (Wunsch- bzw. Themen-Objekt)
  let fm: Formular | null = null; // angezeigtes Formular: { ref, sig, roh: { a, b }, zahl: { a, b } }
  let werteOffen = false, sofortOffen = false;
  let druck = false, vorDruck = false; // Druck läuft; Zustand von #sofortBox davor

  // ---------- Bezüge ----------
  /** Schlüssel (w3/t2) zu einem Wunsch- oder Themen-Objekt, null wenn es nicht mehr besteht. */
  function keyVon(ref: Ref) {
    const S = app.S;
    let i = S.wuensche.indexOf(ref as Wunsch);
    if (i >= 0) return `w${i}`;
    i = S.themen.indexOf(ref as Thema);
    return i >= 0 ? `t${i}` : null;
  }
  const refVon = (key: string): Ref | null => (key[0] === 'w' ? app.S.wuensche[+key.slice(1)] : app.S.themen[+key.slice(1)]) || null;
  const karteZu = (key: string | null) => karten(app.S).find((k) => k.key === key) || null;
  /** Themeneintrag einer Feldkarte (für Person und Liegenschaft); bei Wunschkarten null. */
  const eintragVon = (key: string) => (key[0] === 't' ? app.S.themen[+key.slice(1)] : null);
  const scope = (karte: string | null | undefined) => (KARTEN[karte!]?.art === 'wunsch' ? 'w' : null);
  const felder = (karte: string) => (FELDER[karte] || []).filter(([k]) => VAR_FELDER[karte]?.includes(k));

  /** Heutiger Wert eines Felds (Vorgabe für A); leer, wo die Karte eine Zeile hinzufügt (weiter, amort) oder nichts erfasst ist. */
  function heute(key: string, karte: string, k: string) {
    const S = app.S;
    if (key[0] === 'w') return S.wuensche[+key.slice(1)]?.[k as keyof Wunsch] ?? '';
    const t = eintragVon(key);
    if (PERSON_FELD.includes(karte)) return S.personen[t!.person!]?.[k as keyof Person] ?? '';
    if (karte === 'verkauf') return S.liegenschaften[t!.lg!]?.verkaufAlter ?? '';
    // Zeile, die diese Karte früher angelegt hat: A zeigt, was heute im Plan steht
    if (karte === 'weiter') return zeileWeiter(S, t!.person!)?.[k as keyof Einkommen] ?? '';
    if (karte === 'amort') return zeileAmort(S, t!.lg!)?.[k as keyof Amortisation] ?? '';
    return '';
  }
  /** Ziel einer Feldkarte als Satz (Rohtext): Person bzw. Liegenschaft. */
  function zielText(key: string) {
    const t = eintragVon(key), S = app.S;
    if (!t) return '';
    if (t.person != null) return `Gilt für Person ${t.person + 1}.`;
    if (t.lg != null) return `Gilt für die Liegenschaft «${S.liegenschaften[t.lg]?.name || `Liegenschaft ${t.lg + 1}`}».`;
    return '';
  }
  const hinweisText = (karte: string) => (karte === 'rentekapital' ? HINWEIS_RK : KARTEN[karte]?.hinweis || '');

  // ---------- Formular A und B ----------
  /** Formular zur Karte ref; im laufenden Vergleich mit dessen Werten (sig), sonst A = heutiger Wert, B = leer. */
  function formularFuer(ref: Ref, thema: Thema | null) {
    const key = keyVon(ref), k = karteZu(key), sig = thema ? JSON.stringify([thema.a, thema.b]) : '';
    if (fm && fm.ref === ref && fm.sig === sig) return fm;
    const roh: Formular['roh'] = { a: {}, b: {} };
    felder(k!.karte!).forEach(([f, , dez]) => {
      roh.a[f] = fmtIn(thema ? thema.a?.[f] ?? '' : heute(key!, k!.karte!, f), dez as boolean);
      roh.b[f] = thema ? fmtIn(thema.b?.[f] ?? '', dez as boolean) : '';
    });
    fm = { ref, sig, roh, zahl: { a: {}, b: {} } };
    return fm;
  }
  const vollstaendig = (f: Formular, karte: string) => felder(karte).every(([k]) => SEITEN.every((s) => typeof f.zahl[s][k] === 'number'));

  function formHtml(f: Formular, karte: string, { laufend }: { laufend: boolean }) {
    const zeile = ([k, label, dez, neg]: FeldDef) => `<span class="vg-l" id="vg_l_${k}">${esc(label)}</span>${SEITEN.map((s) => {
      const id = `vg_${s}_${k}`, roh = f.roh[s][k] ?? '';
      return `<div class="vg-zelle"><input type="text" inputmode="${neg ? 'text' : 'decimal'}" autocomplete="off" id="${id}" data-vg="${s}" data-k="${k}"${dez ? ' data-dec="1"' : ''}${neg ? ' class="neg"' : ''} value="${esc(roh)}" aria-labelledby="vg_kopf_${s} vg_l_${k}" aria-describedby="${id}_l"><span class="vg-leer" id="${id}_l"${String(roh).trim() ? ' hidden' : ''}>${LEER}</span></div>`;
    }).join('')}`;
    const h = hinweisText(karte);
    const v = vergleichAktiv(app.S), anderer = !laufend && v && refVon(v.key) !== f.ref ? karteZu(v.key) : null;
    return `<div class="vg-raster"><span class="vg-sp0" aria-hidden="true"></span><span class="vg-sp" id="vg_kopf_a">A</span><span class="vg-sp" id="vg_kopf_b">B</span>${felder(karte).map(zeile).join('')}</div>
      ${h ? `<p class="th-hinweis">${esc(h)}</p>` : ''}
      ${anderer ? `<p class="cap">Der laufende Vergleich «${esc(kartenName(app.S, anderer))}» wird dabei verworfen.</p>` : ''}
      <div class="th-aktionen"><button type="button" class="bbz-button bbz-button--primary sm" data-vgl-los aria-describedby="vgGrund">Vergleichen</button>${laufend ? '' : '<button type="button" class="bbz-button bbz-button--ghost sm" data-vgl-abbrechen>Abbrechen</button>'}</div>
      <p class="cap vg-grund" id="vgGrund" role="status"></p>`;
  }
  /**
   * Untergrenze des AHV-Bezugs der Person einer Karte: so viele Jahre Vorbezug, wie der Rechenkern zulässt (sonst
   * stünde bei A «3 Jahre früher», gerechnet würde mit weniger); null für alle anderen Felder.
   */
  function ahvMin(key: string | null, karte: string | null | undefined, k: string) {
    const p = app.S.personen[eintragVon(key!)?.person!];
    // Pensionsalter: nur künftige Alter lassen sich vergleichen (wer schon pensioniert ist, hat nichts zu wählen)
    if (karte === 'aufhoeren' && k === 'pensAlter' && p && app.E.abAlter(p, p.pensAlter) > app.E.A0) return Math.floor(app.E.alterBei(p, app.E.A0)) + 1;
    if (karte !== 'ahv' || k !== 'ahvBezug') return null;
    return p ? -app.E.maxVorbezug(p) : null;
  }
  /** Ein Feld prüfen (Meldung am Feld, wie im Formular) und den Wert merken: Zahl, '' (leer) oder null (ungültig). */
  function pruefeFeld(el: HTMLInputElement) {
    const s = el.dataset.vg!, k = el.dataset.k!, key = keyVon(fm!.ref), karte = karteZu(key)?.karte;
    fm!.roh[s][k] = el.value;
    if (!takeNum(el, k, scope(karte), true, (v) => { fm!.zahl[s][k] = v; })) fm!.zahl[s][k] = null;
    const min = ahvMin(key, karte, k), v = fm!.zahl[s][k];
    if (min != null && typeof v === 'number' && v < min) {
      setErr(el, `Erlaubt sind Werte von ${min} bis ${limitFor(k).max}.`);
      fm!.zahl[s][k] = null;
    }
    const leer = $(`${el.id}_l`);
    if (leer) leer.hidden = el.value.trim() !== '';
  }
  /** «Vergleichen» nur mit allen Werten für A und B; der Grund steht als Text daneben. */
  function knopfNachfuehren() {
    const los = host.querySelector<HTMLButtonElement>('[data-vgl-los]'), grund = $('vgGrund');
    if (!los || !fm) return;
    const karte = karteZu(keyVon(fm.ref))?.karte, ok = !!karte && vollstaendig(fm, karte);
    los.disabled = !ok;
    const t = ok ? '' : 'Vergleichen ist möglich, sobald für A und B alle Felder gültig ausgefüllt sind.';
    if (grund && grund.textContent !== t) grund.textContent = t;
  }
  function formBinden() {
    host.querySelectorAll<HTMLInputElement>('input[data-vg]').forEach(pruefeFeld);
    knopfNachfuehren();
  }

  // ---------- Darstellung ----------
  function listeHtml() {
    const S = app.S, ks = karten(S).filter((k) => k.karte && KARTEN[k.karte]?.art !== 'merker' && VAR_FELDER[k.karte]);
    const liste = ks.length
      ? `<ul class="vg-liste">${ks.map((k) => `<li><button type="button" class="vg-karte" data-vgl-karte="${k.key}"><span class="vg-kt">${esc(kartenName(S, k))}</span><span class="vg-kz"><span class="vh">, </span>${ZUSTAND_TXT[k.status] || ''}</span></button></li>`).join('')}</ul>`
      : '<p class="cap">Noch kein Thema zum Vergleichen. Merken Sie ein Thema vor; dann lassen sich hier zwei Werte vergleichen.</p><div class="th-aktionen"><button type="button" class="vg-plus" data-vgl-plus aria-haspopup="dialog">+ Thema</button></div>';
    return `<h2 tabindex="-1">So oder so.</h2><p class="vg-satz">Wählen Sie ein Thema und vergleichen Sie zwei Werte. Ihr Plan bleibt unverändert, bis Sie einen Wert übernehmen.</p>${liste}`;
  }
  function entwurfHtml(key: string) {
    const S = app.S, k = karteZu(key)!, f = formularFuer(entwurf!.ref, null), z = zielText(key);
    return `<h2 tabindex="-1">So oder so.</h2><h3 id="vglFrage" tabindex="-1">${esc(kartenName(S, k))}: zwei Werte.</h3>${z ? `<p class="vg-ziel">${esc(z)}</p>` : ''}
      <p class="cap">Erfassen Sie für A und B je einen Wert. Ihr Plan bleibt unverändert, bis Sie einen Wert übernehmen.</p>
      <div class="vg-form">${formHtml(f, k.karte!, { laufend: false })}</div>`;
  }

  /** Zustand der Rechnung zum laufenden Vergleich: unterwegs (busy) und je Seite das Ergebnis oder null (gescheitert). */
  function rechnung(): { busy: boolean; r: (Auswertung | null | undefined)[] } {
    const R = app.R, S = app.S;
    const busy = !R || R.leer || R.vsig !== vergleichSig(S) || !Array.isArray(R.varianten) || R.varianten.length < 2;
    return { busy, r: busy ? [undefined, undefined] : R!.varianten as (Auswertung | null)[] };
  }
  /** Kernaussage einer Variante: «reicht bis N» bzw. «aufgebraucht mit N». */
  function kern(Rv: Auswertung) {
    const dep = reachData(Rv, app.E, app.S).base.dep;
    const p1 = app.S.haushalt === 'single' ? '' : ' (Alter Person 1)';
    return dep == null ? `reicht bis ${Rv.horizont}${p1}` : `aufgebraucht mit ${Math.floor(dep + 1e-9)}${p1}`;
  }
  /**
   * Aussage einer Variante, einmal gebaut für Umschalter und Textalternative: Wort der Ampel wie im Urteil
   * («Reicht», «Knapp», «Reicht nicht»), Kernaussage und die Kennzahl «Tragbare Ausgaben pro Monat» wie in der Kachel.
   */
  function aussage(Rv: Auswertung) {
    const a = { st: Rv.amp.st, wort: ST[Rv.amp.st], kern: kern(Rv), trag: `tragbare Ausgaben ${tragbar(Rv)}/Mt.` } as Aussage;
    // Tragbarkeit der Hypothek aus Sicht der Bank: bei einer Amortisation oder einem Verkauf der eigentliche Zweck
    const w = Rv.tr?.worst;
    a.hyp = w ? `Hypothek ${TRAG_ST[w.st]} (${Math.round(w.quote * 100)}%)` : '';
    a.txt = `${a.wort}, ${a.kern}, ${a.trag}${a.hyp ? `, ${a.hyp}` : ''}`;
    return a;
  }
  function seite(Rv: Auswertung | null | undefined, busy: boolean): SeitenText {
    if (busy) return { txt: 'wird gerechnet …', st: '' };
    if (!Rv) return { txt: 'Diese Variante liess sich nicht rechnen. Bitte die Werte prüfen.', st: '', fehlt: true };
    return aussage(Rv);
  }

  function laufendHtml(v: Aktiv) {
    const S = app.S, k = karteZu(v.key)!, { busy, r } = rechnung(), z = zielText(v.key);
    const sx: Record<string, SeitenText> = { a: seite(r[0], busy), b: seite(r[1], busy) };
    const radio = (w: string) => {
      const x = sx[w], an = w === gewaehlt;
      // Leerzeichen und verborgenes Komma trennen die Teile im Namen, den Bildschirmleser vorlesen
      const inhalt = x.wort ? `<span class="vg-amp" data-st="${x.st}"><i aria-hidden="true"></i>${x.wort}</span><span class="vh">, </span><span class="vg-kern">${x.kern}</span><span class="vh">, </span><span class="vg-trag">${esc(x.trag)}</span>${x.hyp ? `<span class="vh">, </span><span class="vg-trag vg-hyp">${esc(x.hyp)}</span>` : ''}` : `<span class="vg-kern" id="vg_fehlt_${w}">${x.txt}</span>`;
      return `<button type="button" role="radio" class="vg-r" data-ab="${w}" aria-checked="${an}" tabindex="${an ? 0 : -1}"><b class="vg-ab">${gross(w)}</b> ${inhalt}</button>`;
    };
    const knopf = (w: string) => {
      const gesperrt = busy || sx[w].fehlt;
      return `<button type="button" class="bbz-button bbz-button--secondary sm" data-uebernehmen="${w}"${gesperrt ? ' disabled' : ''}${sx[w].fehlt ? ` aria-describedby="vg_fehlt_${w}"` : ''}>${gross(w)} übernehmen</button>`;
    };
    const f = formularFuer(refVon(v.key)!, v.thema);
    // Verschiedene Werte, gleiches Ergebnis: meist eine Eingabe ohne Wirkung, nicht «macht keinen Unterschied»
    const gleich = !busy && r[0] && r[1] && sx.a.txt === sx.b.txt && JSON.stringify(v.thema.a) !== JSON.stringify(v.thema.b) && Math.abs(r[0].maxA - r[1].maxA) < 0.5;
    return `<h2 class="vh" tabindex="-1">So oder so.</h2>
      <div class="vg-kopf"><div class="vg-frage"><h3 id="vglFrage" tabindex="-1">${esc(kartenName(S, k))}: so … oder so?</h3>${z ? `<p class="vg-ziel">${esc(z)}</p>` : ''}</div>
        <div class="vg-schalter" role="radiogroup" aria-label="Variante im Bild hervorheben">${radio('a')}${radio('b')}</div></div>
      <p class="vg-status" role="status">${busy ? 'Die Varianten werden gerechnet …' : gleich ? 'A und B ergeben dasselbe Ergebnis. Bitte die Werte prüfen: Ein Wunsch, Verkauf oder eine Teilpensionierung mit Alter in der Vergangenheit und ein Pensum von 0 werden nicht gerechnet.' : ''}</p>
      <div class="bildkopf" data-vgl-legende></div>
      <div class="bild" id="vglBild"></div>
      <div class="vg-knoepfe" data-vgl-knoepfe>${knopf('a')}${knopf('b')}<button type="button" class="bbz-button bbz-button--ghost sm" data-verwerfen>Verwerfen</button></div>
      <details class="vg-werte"${werteOffen ? ' open' : ''}><summary>Werte anpassen</summary><div class="vg-form">${formHtml(f, k.karte!, { laufend: true })}</div></details>`;
  }
  /** Bild und Legende des laufenden Vergleichs mit der gewählten Seite zeichnen. */
  function zeichneBild() {
    const host2 = $('vglBild'), leg = host.querySelector('[data-vgl-legende]'), v = vergleichAktiv(app.S);
    if (!host2 || !v || !app.R || app.R.leer) return;
    const { busy, r } = rechnung();
    const R = busy ? { ...app.R, varianten: [] } : app.R;
    const texte = busy ? {} : { a: r[0] ? aussage(r[0]).txt : '', b: r[1] ? aussage(r[1]).txt : '' };
    const d = bildVergleich(app.S, R, app.E, gewaehlt, texte);
    if (leg) leg.innerHTML = bildLegende(d);
    // Im Tutor gibt es keine feste Bühne: Die Höhe folgt der Breite
    renderBild(host2, d, form() ? { bis: host.querySelector('[data-vgl-knoepfe]') } : { frei: Infinity });
  }

  /** Fokus merken (als Selektor), damit er nach dem Neuaufbau an derselben Stelle steht. */
  function fokusSel() {
    const a = document.activeElement as HTMLElement | null;
    if (!a || !host.contains(a)) return null;
    if (a.dataset.vg) return `[data-vg="${a.dataset.vg}"][data-k="${a.dataset.k}"]`;
    for (const x of ['ab', 'uebernehmen', 'vglKarte']) if (a.dataset[x]) return `[data-${x === 'vglKarte' ? 'vgl-karte' : x}="${a.dataset[x]}"]`;
    for (const x of ['data-verwerfen', 'data-vgl-los', 'data-vgl-abbrechen', 'data-vgl-plus']) if (a.hasAttribute(x)) return `[${x}]`;
    return a.id ? `#${a.id}` : null;
  }

  /** Nach einer Änderung des Plans: Passt die Vorschau nicht mehr, sofort als unterwegs zeigen (einmal neu aufbauen). */
  function pruefen() {
    if (!vergleichAktiv(app.S) || entwurf || host.hasAttribute('aria-busy')) return;
    if (rechnung().busy) render();
  }

  function render() {
    const S = app.S, res = $('results');
    // Tutor: der Regler «früher aufhören» ist immer offen (ohne Zusammenfassung, styles.css)
    const sofortSoll = form() ? sofortOffen : true;
    if (box && !druck && box.open !== sofortSoll) box.open = sofortSoll;
    const v = vergleichAktiv(S);
    if (v && gewaehltFuer !== v.key) { gewaehlt = 'a'; gewaehltFuer = v.key; }
    if (!v) gewaehltFuer = null;
    if (entwurf && (!keyVon(entwurf.ref) || (v && refVon(v.key) === entwurf.ref))) entwurf = null;
    const sel = fokusSel();
    res?.toggleAttribute('data-vgl', !!v && !entwurf);
    host.removeAttribute('aria-busy');
    if (entwurf) host.innerHTML = entwurfHtml(keyVon(entwurf.ref)!);
    else if (v) {
      host.innerHTML = laufendHtml(v);
      if (rechnung().busy) host.setAttribute('aria-busy', 'true');
    } else { fm = null; host.innerHTML = listeHtml(); }
    if (entwurf || v) formBinden();
    if (v && !entwurf) zeichneBild();
    if (sel) host.querySelector<HTMLElement>(sel)?.focus();
  }

  // ---------- Handlungen ----------
  /** Vergleich zur Karte key vorbereiten (aus dem Editor oder der Liste); läuft er schon, zeigt Schritt 6 ihn (im Tutor der Block). */
  function entwurfStarten(key: string | null) {
    const ref = refVon(String(key)), k = karteZu(String(key));
    if (!ref || !k || !VAR_FELDER[k.karte!]) return;
    const v = vergleichAktiv(app.S);
    entwurf = v && refVon(v.key) === ref ? null : { ref };
    if (entwurf) fm = null;
    if (form()) app.schritt?.go('vergleich');
    render();
    const ziel = entwurf ? host.querySelector<HTMLElement>('input[data-vg="a"]') : $('vglFrage');
    ziel?.focus();
  }
  function starten() {
    if (!fm) return;
    const key = keyVon(fm.ref), k = karteZu(key);
    if (!key || !k || !vollstaendig(fm, k.karte!)) { knopfNachfuehren(); return; }
    const neu = vergleichStarten(app.S, key, { ...fm.zahl.a } as VariantenWerte, { ...fm.zahl.b } as VariantenWerte);
    if (neu == null) { $('vgGrund')!.textContent = 'Der Vergleich liess sich mit diesen Werten nicht starten. Bitte die Werte prüfen. Sind schon 20 Einkommen oder 30 Amortisationen erfasst, bitte zuerst eine Zeile entfernen.'; return; }
    entwurf = null;
    app.changed();
    if (form()) app.schritt?.go('vergleich');
    render();
    $('vglFrage')?.focus();
  }
  function abbrechen() {
    const key = entwurf && keyVon(entwurf.ref);
    entwurf = null; fm = null;
    render();
    (key && host.querySelector<HTMLElement>(`[data-vgl-karte="${key}"]`) || host.querySelector('h2'))?.focus();
  }
  /** Seite im Bild wählen; nur Umschalter und Bild ändern sich, der Fokus bleibt auf dem Umschalter. */
  function waehle(w: string, fokus?: boolean) {
    if (w !== 'a' && w !== 'b') return;
    gewaehlt = w;
    host.querySelectorAll<HTMLElement>('[role="radio"][data-ab]').forEach((r) => { const an = r.dataset.ab === w; r.setAttribute('aria-checked', String(an)); r.tabIndex = an ? 0 : -1; });
    zeichneBild();
    if (fokus) host.querySelector<HTMLElement>(`[role="radio"][data-ab="${w}"]`)?.focus();
  }
  function nimm(w: string) {
    const S = app.S, v = vergleichAktiv(S), { busy, r } = rechnung();
    if (!v || busy || !r[SEITEN.indexOf(w)]) return;
    const key = v.key;
    uebernehmen(S, key, w, app.E);
    entwurf = null; fm = null;
    // Neue Zeilen (Einkommen, Amortisationen) brauchen den Neuaufbau des Formulars
    app.formRender?.();
    app.changed();
    app.themen?.render();
    render();
    if (!app.themen?.fokusKarte?.(key)) host.querySelector('h2')?.focus();
    app.toast(`${gross(w)} ist jetzt Teil Ihres Plans.`);
  }
  function weg() {
    const S = app.S, v = vergleichAktiv(S);
    if (!v) return;
    verwerfen(S, v.key);
    entwurf = null; fm = null;
    app.changed();
    app.themen?.render();
    render();
    (host.querySelector<HTMLElement>(`[data-vgl-karte="${v.key}"]`) || host.querySelector('h2'))?.focus();
    app.toast('Der Vergleich ist verworfen. Ihr Plan ist unverändert.');
  }

  host.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest('button');
    if (!b || b.disabled) return;
    const d = b.dataset;
    if (d.ab) waehle(d.ab, true);
    else if (d.uebernehmen) nimm(d.uebernehmen);
    else if (b.hasAttribute('data-verwerfen')) weg();
    else if (d.vglKarte) entwurfStarten(d.vglKarte);
    else if (b.hasAttribute('data-vgl-los')) starten();
    else if (b.hasAttribute('data-vgl-abbrechen')) abbrechen();
    else if (b.hasAttribute('data-vgl-plus')) app.themen?.auswahl(b);
  });
  // Umschalter: Pfeiltasten wechseln und wählen (zwei Seiten: jede Richtung wechselt); Leertaste und Enter wie ein Knopf
  host.addEventListener('keydown', (ev) => {
    const r = (ev.target as HTMLElement).closest?.<HTMLElement>('[role="radio"][data-ab]');
    if (!r || !['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(ev.key)) return;
    ev.preventDefault();
    ev.stopPropagation(); // die allgemeine Bedienung der Auswahlkarten (main.js) wählt nicht ein zweites Mal
    waehle(r.dataset.ab === 'a' ? 'b' : 'a', true);
  });
  host.addEventListener('input', (ev) => {
    const el = ev.target as HTMLInputElement;
    if (!fm || el.tagName !== 'INPUT' || !el.dataset.vg) return;
    pruefeFeld(el);
    knopfNachfuehren();
  });
  host.addEventListener('toggle', (ev) => { if ((ev.target as HTMLDetailsElement).classList?.contains('vg-werte')) werteOffen = (ev.target as HTMLDetailsElement).open; }, true);
  // Aufgeklappt zeigt das Bild darunter das Szenario des Reglers (results.js), zugeklappt wieder den Plan
  box?.addEventListener('toggle', () => { if (form() && !druck) { sofortOffen = box!.open; app.buehne?.renderBody(); } });
  // Druck: «früher aufhören» gedruckt wie jeder Block (ein zugeklappter details-Inhalt erscheint nicht), danach wie zuvor
  const druckAuf = () => { if (!box || druck) return; druck = true; vorDruck = box.open; box.open = true; };
  const druckZu = () => { if (!box || !druck) return; druck = false; box.open = form() ? vorDruck : true; };
  // Jede Instanz ersetzt die Anmeldung der vorigen (Tests bauen die Seite mehrfach auf)
  abmeldenDruck?.();
  window.addEventListener('beforeprint', druckAuf);
  window.addEventListener('afterprint', druckZu);
  abmeldenDruck = () => { window.removeEventListener('beforeprint', druckAuf); window.removeEventListener('afterprint', druckZu); };

  const vergleich = { render, pruefen, entwurf: entwurfStarten };
  app.vergleich = vergleich;
  return vergleich;
}
