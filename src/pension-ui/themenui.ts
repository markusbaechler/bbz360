// Themenkarten in der Oberfläche: Leiste unter dem Bild, Auswahl als Dialog, Karteneditor über den Schritten
// (im Tutor-Ergebnis im Block «Weiter erkunden», buehne.js). Der Editor einer Wunschkarte ist der vollständige Wunsch-Editor (früher Abschnitt «Wünsche und Ziele»).
// Der Zustand ändert sich nur über die Funktionen aus themen.js: Ein Wunsch wird allein mit themaEntfernen gelöscht,
// damit die Bezüge der Themen (w) stimmen. Alles aus dem Zustand geht maskiert (esc) ins HTML.
import { esc, fmtIn } from '../lib/pension/format';
import { W_DEF } from '../lib/pension/engine';
import { WTYP, VAR_FELDER, PERSON_KARTEN, LG_KARTEN, MAX_WUENSCHE, MAX_THEMEN } from '../lib/pension/state';
import { takeNum } from './fielderr';
import { SCHRITTE } from './schritte';
import { KARTEN, GRUPPEN, STELLE_TXT, karten, karteVonWunsch, kartenName, themaHinzu, themaEntfernen } from '../lib/pension/themen';
import type { KartenZiel } from '../lib/pension/themen';
import type { PensState, Thema, Wunsch } from '../lib/pension/typen';
import type { App } from './app';

/** Rückgabe von createThemen() (auch app.themen). */
export type Themen = ReturnType<typeof createThemen>;
/** Optionen eines Zahlenfelds im Wunsch-Editor: Dezimalfeld, Hinweis unter dem Feld. */
interface WfOptionen { dec?: boolean | 1; hint?: string }
/** Was fokus() annimmt: ein Element oder nichts (null, undefined, leerer Schlüssel). */
type FokusZiel = HTMLElement | null | undefined | '';

const $ = (id: string) => document.getElementById(id);

/** Zustand einer Karte als Text; er steht immer da, nicht nur als Form oder Farbe. */
export const ZUSTAND_TXT: Record<string, string> = { vor: 'vorgemerkt', gerechnet: 'gerechnet', vergleich: 'so oder so', ueber: 'übernommen' };

// Gleiche Grenzen wie themaHinzu (themen.js) und das Laden eines Stands (state.js)
const punkt = (t: string) => (/[.!?]$/.test(t) ? t : `${t}.`);
const mobil = () => !!window.matchMedia?.('(max-width: 768px)')?.matches;

/** Feld einer Feldkarte: Schritt und Element im Formular (das Feld ist die einzige Quelle des Werts). */
const FELD: Record<string, [schritt: string, sel: (t: Thema, S: PensState) => string]> = {
  aufhoeren: ['situation', (t) => `#f_personen_${t.person}_pensAlter`],
  teil: ['einkommen', (t) => `#f_personen_${t.person}_teilAb`],
  weiter: ['einkommen', (t, S) => {
    const i = S.einkommen.findIndex((x) => x.art === 'nebenerwerb' && (x.person || 0) === t.person);
    return i >= 0 ? `[data-ek="${i}"][data-k="betrag"]` : '[data-ekadd="nebenerwerb"]';
  }],
  rentekapital: ['einkommen', (t) => `#f_personen_${t.person}_pkRente`],
  ahv: ['einkommen', (t) => `#f_personen_${t.person}_ahvBezug`],
  verkauf: ['liegenschaft', (t) => `#lg_${t.lg}_verkaufAlter`],
  amort: ['liegenschaft', (t) => `[data-amadd="${t.lg}"]`],
};

export function createThemen(app: App) {
  const form = () => app.S.ui.mode === 'form';
  // Leiste unter dem Bild (#results) und, bis 768 px in der Ansicht «Eingaben», unter den Schritten (#formwrap)
  const leiste = $('themenleiste')!, leisteEin = $('themenleisteEin'), host = $('themaEdit')!, dlg = $('themenDlg') as HTMLDialogElement;
  const leisten = [leiste, leisteEin].filter(Boolean) as HTMLElement[];
  /** Die sichtbare Leiste: im Formular bis 768 px in «Eingaben» die unter den Schritten, sonst die unter dem Bild. */
  const sichtbar = () => (leisteEin && form() && mobil() && document.body.dataset.view !== 'results' ? leisteEin : leiste);
  const plus = () => sichtbar().querySelector<HTMLElement>('.th-plus');
  // Offener Editor: der Wunsch bzw. Themeneintrag selbst (die Schlüssel w3/t2 verschieben sich beim Entfernen)
  let offen: { ref: Wunsch | Thema } | null = null;

  /** Schlüssel des offenen Editors oder null, wenn der Eintrag nicht mehr besteht (zielWeg behält die Objekte). */
  function offenKey() {
    if (!offen) return null;
    const S = app.S, r = offen.ref;
    let i = S.wuensche.indexOf(r as Wunsch);
    if (i >= 0) return `w${i}`;
    i = S.themen.indexOf(r as Thema);
    return i >= 0 ? `t${i}` : null;
  }
  const wunsch = () => { const k = offenKey(); return k && k[0] === 'w' ? app.S.wuensche[+k.slice(1)] : null; };
  const eintrag = () => { const k = offenKey(); return k && k[0] === 't' ? app.S.themen[+k.slice(1)] : null; };

  /** Fokus auf das erste Element, das ihn annimmt (verborgene nehmen ihn nicht); sonst auf den aktiven Schritt. */
  function fokus(...els: FokusZiel[]) {
    for (const el of els) {
      if (!el) continue;
      el.focus();
      if (document.activeElement === el) return;
    }
    if (form()) $('schritte')?.querySelector<HTMLElement>('button[aria-current="step"]')?.focus();
  }

  // ---------- Themenleiste ----------
  function leisteHtml(S: PensState, plusId: string) {
    const ok = offenKey();
    const kn = karten(S).map((k) => `<li><button type="button" class="th-karte" data-thema="${k.key}" data-status="${esc(k.status)}" aria-controls="themaEdit" aria-expanded="${k.key === ok}"><span class="th-t">${esc(kartenName(S, k))}</span><span class="th-z"><span class="vh">, </span>${ZUSTAND_TXT[k.status] || ''}</span></button></li>`).join('');
    return `<h2 class="th-titel">Themen.</h2><ul class="th-liste">${kn}<li><button type="button" class="th-plus" id="${plusId}" aria-haspopup="dialog">+ Thema</button></li></ul>`;
  }
  function renderLeiste() {
    leisten.forEach((el) => {
      // Die Leiste unter den Schritten gibt es nur im Formular (im Tutor sind die Schritte verborgen)
      if (el === leisteEin && !form()) { el.hidden = true; el.innerHTML = ''; return; }
      const a = document.activeElement as HTMLElement;
      const sel = el.contains(a) ? (a.classList.contains('th-plus') ? '.th-plus' : a.dataset?.thema ? `[data-thema="${a.dataset.thema}"]` : null) : null;
      el.hidden = false;
      // Nur ein #btnThema im Dokument: die Leiste unter den Schritten hat ihre eigene Id
      el.innerHTML = leisteHtml(app.S, el === leiste ? 'btnThema' : 'btnThemaEin');
      if (sel) el.querySelector<HTMLElement>(sel)?.focus();
    });
  }

  // ---------- Auswahl (Dialog) ----------
  function auswahlHtml(S: PensState) {
    const ohneLg = !S.liegenschaften.length;
    const knopf = (id: string) => {
      const d = KARTEN[id], gesperrt = ohneLg && LG_KARTEN.includes(id);
      return `<button type="button" class="th-wahl" data-karte="${id}"${gesperrt ? ' disabled' : ''}><b>${esc(d.titel)}</b><span>${esc(d.braucht)}</span>${gesperrt ? '<span class="th-sperre">zuerst eine Liegenschaft erfassen</span>' : ''}</button>`;
    };
    return GRUPPEN.map(([g, t]) => `<h3>${esc(t)}.</h3><div class="th-gitter">${Object.keys(KARTEN).filter((k) => KARTEN[k].gruppe === g).map(knopf).join('')}</div>`).join('')
      + `<h3>${esc(KARTEN.abklaeren.titel)}.</h3><div class="th-gitter">${Object.entries(STELLE_TXT).map(([k, t]) => `<button type="button" class="th-wahl" data-stelle="${k}"><b>${esc(t)}</b></button>`).join('')}</div>`;
  }
  // Wer die Auswahl geöffnet hat (ausser «+ Thema»): dorthin kehrt der Fokus zurück, solange es ihn noch gibt
  let oeffner: HTMLElement | null = null;
  function zeigeAuswahl(von: HTMLElement | null = null) {
    oeffner = von;
    $('themenAuswahl')!.innerHTML = auswahlHtml(app.S);
    $('themenStatus')!.textContent = '';
    if (!dlg.open) dlg.showModal();
    $('themenTitel')!.focus();
  }
  /** Klick auf eine Karte oder Stelle: vormerken und im Dialog rückmelden (auch, wenn es nicht geht). */
  function waehle(b: HTMLElement) {
    const S = app.S, ziel: KartenZiel = {};
    let karte: string, titel;
    if (b.dataset.stelle) {
      if (!STELLE_TXT[b.dataset.stelle]) return;
      karte = 'abklaeren'; ziel.stelle = b.dataset.stelle;
      titel = `${KARTEN.abklaeren.titel} (${STELLE_TXT[ziel.stelle]})`;
    } else {
      karte = b.dataset.karte!;
      if (!KARTEN[karte] || karte === 'abklaeren') return;
      titel = KARTEN[karte].titel;
      // Bei Paaren zuerst Person 1, bei Liegenschaften die erste; im Editor lässt sich das ändern
      if (PERSON_KARTEN.includes(karte)) ziel.person = 0;
      if (LG_KARTEN.includes(karte)) ziel.lg = 0;
    }
    const nW = S.wuensche.length, nT = S.themen.length;
    const key = themaHinzu(S, karte, ziel);
    let msg;
    if (key == null) {
      msg = KARTEN[karte].art === 'wunsch' && nW >= MAX_WUENSCHE ? `Mehr als ${MAX_WUENSCHE} Wünsche lassen sich nicht erfassen.`
        : nT >= MAX_THEMEN ? `Mehr als ${MAX_THEMEN} Themen lassen sich nicht vormerken.`
          : `${titel} lässt sich mit den heutigen Angaben nicht vormerken.`;
    } else if (S.wuensche.length === nW && S.themen.length === nT) {
      msg = `${titel} ist bereits vorgemerkt.`;
    } else {
      msg = `${titel} ist vorgemerkt.`;
      app.changed();
      render();
    }
    $('themenStatus')!.textContent = msg;
  }

  // ---------- Karteneditor ----------
  /** Knopf «So oder so vergleichen» für Karten mit Varianten; ohne Ergebnis gesperrt, mit dem Grund als Text. */
  function vergleichHtml(karte: string | null) {
    if (!VAR_FELDER[karte!]) return '';
    const ohne = !app.R || app.R.leer;
    return `<div class="th-aktionen"><button type="button" class="bbz-button bbz-button--secondary sm" data-vergleich-start${ohne ? ' disabled aria-describedby="te_vgl_h"' : ''}>So oder so vergleichen</button></div>${ohne ? '<p class="hint" id="te_vgl_h">Möglich, sobald die Ausgaben erfasst sind.</p>' : ''}`;
  }
  /** Zahlenfeld des Wunsch-Editors (Felder wie bisher im Formular; Richtwerte des Rechenkerns, wo nichts erfasst ist). */
  const wf = (w: Wunsch, lbl: string, key: keyof Wunsch, o: WfOptionen = {}) => {
    const v = w[key] ?? (W_DEF as Partial<Record<keyof Wunsch, number>>)[key] ?? '', id = `te_${key}`;
    return `<div class="field"><label for="${id}">${lbl}</label><input type="text" inputmode="decimal" autocomplete="off" id="${id}" data-wk="${key}"${o.dec ? ' data-dec="1"' : ''} value="${fmtIn(v, o.dec as boolean)}"${o.hint ? ` aria-describedby="${id}_h"` : ''}>${o.hint ? `<div class="hint" id="${id}_h">${o.hint}</div>` : ''}</div>`;
  };
  function wunschHtml(S: PensState, w: Wunsch) {
    let body = '';
    if (w.typ === 'einmal') body = `<div class="grid2">${wf(w, 'Betrag (CHF)', 'betrag')}${wf(w, 'Alter', 'alter', { dec: 1 })}</div>`;
    if (w.typ === 'jahr') body = `<div class="grid3">${wf(w, 'CHF pro Jahr', 'betrag')}${wf(w, 'von Alter', 'von', { dec: 1 })}${wf(w, 'bis Alter', 'bis', { dec: 1 })}</div>`;
    if (w.typ === 'ziel') body = `<div class="grid2">${wf(w, 'Mindestvermögen am Horizont (CHF, heutige Kaufkraft)', 'betrag')}</div>`;
    if (w.typ === 'ausland') {
      const wohn = w.wohnform || 'miete';
      body = `<div class="grid3">${wf(w, 'Monate pro Jahr', 'monate', { dec: 1 })}${wf(w, 'von Alter', 'von', { dec: 1 })}${wf(w, 'bis Alter', 'bis', { dec: 1 })}</div>
        <div class="grid3">${wf(w, 'Preisniveau dort (% der CH)', 'preisniveau', { dec: 1 })}${wf(w, 'Ausgaben, die in der CH wegfallen (%)', 'anteilVariabel', { dec: 1, hint: 'Essen, Mobilität, Freizeit' })}${wf(w, 'Reisekosten pro Jahr (CHF)', 'reise')}</div>
        <div class="field" role="group" aria-labelledby="te_wohnform"><span class="flabel" id="te_wohnform">Wohnen vor Ort</span><div class="seg">${[['miete', 'Mieten'], ['kauf', 'Kaufen']].map(([v, l]) => `<button type="button" data-wk="wohnform" data-val="${v}" aria-pressed="${wohn === v}">${l}</button>`).join('')}</div></div>
        ${wohn === 'miete' ? `<div class="grid3">${wf(w, 'Miete pro Monat (CHF)', 'miete')}</div>` : `<div class="grid3">${wf(w, 'Kaufpreis (CHF)', 'kaufpreis')}${wf(w, 'Kaufnebenkosten (%)', 'nebenkosten', { dec: 1 })}${wf(w, 'Laufende Kosten (% p. a.)', 'laufend', { dec: 1, hint: 'Grundsteuer, Versicherung, Unterhalt' })}</div>
        <div class="grid3">${wf(w, 'Vermietete Wochen pro Jahr', 'wochen', { dec: 1 })}${wf(w, 'Miete pro Woche (CHF)', 'preisWoche')}${wf(w, 'Verwaltung, Reinigung, Plattform (%)', 'verwaltung', { dec: 1 })}</div>
        <div class="grid3">${wf(w, 'Steuer auf Mieteinnahmen vor Ort (%)', 'mietSteuer', { dec: 1, hint: 'Durchschnittssatz im Belegenheitsstaat' })}${wf(w, 'Verkauf mit Alter (0 = nie)', 'verkaufAlter', { dec: 1 })}</div>`}`;
    }
    return `<div class="th-wkopf"><label class="check"><input type="checkbox" data-wk="aktiv"${w.aktiv === false ? '' : ' checked'}> rechnet mit</label><span class="wtyp">${WTYP[w.typ]}</span></div>
      <div class="field"><label for="te_name">Bezeichnung (optional)</label><input type="text" class="txt" id="te_name" maxlength="60" autocomplete="off" data-wk="name" data-text="1" value="${esc(w.name)}"></div>
      ${body}
      <p class="hint">${S.haushalt !== 'single' ? 'Alter bezieht sich auf Person 1. ' : ''}Ohne Häkchen ist der Wunsch nur vorgemerkt und rechnet nicht mit.</p>
      <div data-vergleich-hook>${vergleichHtml(karteVonWunsch(w))}</div>`;
  }
  function feldHtml(S: PensState, t: Thema) {
    const d = KARTEN[t.karte], [schritt] = FELD[t.karte], nr = SCHRITTE.find((x) => x.id === schritt)!.nr;
    let h = '';
    if (PERSON_KARTEN.includes(t.karte) && S.haushalt !== 'single') h += `<div class="field"><label for="te_person">Person</label><select id="te_person" data-te="person">${[0, 1].map((i) => `<option value="${i}"${t.person === i ? ' selected' : ''}>Person ${i + 1}</option>`).join('')}</select></div>`;
    if (LG_KARTEN.includes(t.karte) && S.liegenschaften.length > 1) h += `<div class="field"><label for="te_lg">Liegenschaft</label><select id="te_lg" data-te="lg">${S.liegenschaften.map((l, i) => `<option value="${i}"${t.lg === i ? ' selected' : ''}>${esc(l.name || `Liegenschaft ${i + 1}`)}</option>`).join('')}</select></div>`;
    if (d.hinweis) h += `<p class="th-hinweis">${esc(d.hinweis)}</p>`;
    h += `<p class="cap">Der Wert gehört zum Feld in Schritt ${nr}. Entfernen der Karte ändert ihn nicht.</p>
      <div class="th-aktionen"><button type="button" class="bbz-button bbz-button--secondary sm" data-te-feld>Zum Feld in Schritt ${nr}</button></div>
      <div data-vergleich-hook>${vergleichHtml(t.karte)}</div>`;
    return h;
  }
  function merkerHtml(t: Thema) {
    const stelle = t.karte === 'abklaeren'
      ? `<div class="field"><label for="te_stelle">Stelle</label><select id="te_stelle" data-te="stelle">${Object.entries(STELLE_TXT).map(([k, x]) => `<option value="${k}"${t.stelle === k ? ' selected' : ''}>${x}</option>`).join('')}</select></div>`
      : '';
    return `${stelle}<p class="cap">Diese Karte wird nur vorgemerkt und rechnet nicht mit. Sie steht im Aktionsplan unter «Aus Ihren Themen».</p>`;
  }
  function renderEditor() {
    const key = offenKey();
    if (!key) { offen = null; host.hidden = true; host.innerHTML = ''; return; }
    const S = app.S, k = karten(S).find((x) => x.key === key);
    if (!k) { offen = null; host.hidden = true; host.innerHTML = ''; return; }
    const name = kartenName(S, k);
    const body = key[0] === 'w' ? wunschHtml(S, S.wuensche[+key.slice(1)]) : FELD[k.karte!] ? feldHtml(S, S.themen[+key.slice(1)]) : merkerHtml(S.themen[+key.slice(1)]);
    // Der Karteneditor steht im Formular in der linken Spalte: sie wird dafür eingeblendet
    if (form()) app.leiste?.(true);
    host.hidden = false;
    host.innerHTML = `<div class="th-ekopf"><h2 id="themaEditTitel" tabindex="-1">${esc(punkt(name))}</h2><span class="th-z">${ZUSTAND_TXT[k.status] || ''}</span></div>
      ${body}
      <div class="th-aktionen"><button type="button" class="bbz-button bbz-button--secondary sm" data-thema-weg aria-label="${esc(`${name} entfernen`)}">Entfernen</button><button type="button" class="bbz-button bbz-button--ghost sm" data-thema-zu>Schliessen</button></div>`;
  }

  /**
   * Editor zur Karte key öffnen; im Formular auf schmalen Bildschirmen in der Ansicht «Eingaben», im Tutor-Ergebnis
   * unter der Leiste. Fokus auf die Überschrift.
   */
  function oeffne(key: string | null) {
    const m = /^([wt])(\d+)$/.exec(String(key));
    const ref = m && (m[1] === 'w' ? app.S.wuensche[+m[2]] : app.S.themen[+m[2]]);
    if (!ref) return;
    offen = { ref };
    if (form() && mobil() && document.body.dataset.view === 'results') app.setView?.('form');
    renderEditor();
    renderLeiste();
    const h = $('themaEditTitel');
    h?.focus();
    h?.scrollIntoView?.({ block: 'nearest' });
  }
  function schliesse() {
    const key = offenKey();
    offen = null;
    renderEditor();
    renderLeiste();
    fokus(key && sichtbar().querySelector<HTMLElement>(`[data-thema="${key}"]`), plus());
  }
  async function entfernen() {
    const key = offenKey();
    if (!key) return;
    const S = app.S, k = karten(S).find((x) => x.key === key), name = kartenName(S, k!), istWunsch = key[0] === 'w';
    const text = istWunsch ? `«${name}» wird gelöscht und fällt aus der Rechnung.` : FELD[k!.karte!] ? `«${name}» verschwindet aus den Themen. Der Wert im Feld bleibt, wie er ist.` : `«${name}» verschwindet aus den Themen.`;
    if (!(await app.confirm(istWunsch ? 'Wunsch entfernen?' : 'Thema entfernen?', text, 'Ja, entfernen'))) return;
    if (app.S !== S || offenKey() !== key) return;
    const pos = karten(S).findIndex((x) => x.key === key);
    themaEntfernen(S, key);
    offen = null;
    app.changed();
    render();
    // Fokus auf die Karte, die nachrückt, sonst die vorige, sonst «+ Thema»
    const rest = [...sichtbar().querySelectorAll<HTMLElement>('[data-thema]')];
    fokus(rest[Math.min(pos, rest.length - 1)], plus());
  }
  /** Feldkarte: zum Feld im Schritt springen (aus dem Tutor über den Formularmodus), Abschnitte öffnen, Fokus ins Feld. */
  function zumFeld() {
    const S = app.S, t = eintrag();
    if (!t || !FELD[t.karte]) return;
    const [schritt, sel] = FELD[t.karte];
    if (!form()) app.setMode?.('form');
    app.schritt?.go(schritt);
    const el = $('form')?.querySelector<HTMLElement>(sel(t, S));
    if (!el) return;
    for (let d: HTMLDetailsElement | null | undefined = el.closest('details'); d; d = d.parentElement?.closest('details')) d.open = true;
    el.focus();
  }

  // ---------- Ereignisse ----------
  leisten.forEach((el) => el.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest('button');
    if (!b) return;
    if (b.classList.contains('th-plus')) zeigeAuswahl();
    else if (b.dataset.thema) oeffne(b.dataset.thema);
  }));
  $('themenAuswahl')!.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest<HTMLButtonElement>('button[data-karte], button[data-stelle]');
    if (b && !b.disabled) waehle(b);
  });
  $('btnThemaFertig')!.addEventListener('click', () => { dlg.close(); fokus(oeffner, plus()); });
  // Escape schliesst den Dialog ebenfalls: Fokus zurück auf «+ Thema» (bzw. den Knopf, der ihn geöffnet hat)
  dlg.addEventListener('close', () => { if (!leisten.some((el) => el.contains(document.activeElement)) && !(oeffner && document.activeElement === oeffner)) fokus(oeffner, plus()); });
  dlg.addEventListener('click', (ev) => {
    if (ev.target !== dlg) return;
    const r = dlg.getBoundingClientRect();
    if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) { dlg.close(); fokus(oeffner, plus()); }
  });

  host.addEventListener('input', (ev) => {
    const el = ev.target as HTMLInputElement, d = el.dataset, w = wunsch();
    if (!w || d.wk == null || el.tagName !== 'INPUT' || el.type === 'checkbox') return;
    if (d.text) { w.name = el.value; app.changed({ soft: true }); return; }
    // Ungültiges (keine Zahl, ausserhalb des Wertebereichs) wird nicht gespeichert; das Feld nennt den Grund
    if (!takeNum(el, d.wk, 'w', false, (v) => { (w as unknown as Record<string, unknown>)[d.wk!] = v; })) return;
    app.changed({ soft: true });
  });
  host.addEventListener('change', (ev) => {
    const el = ev.target as HTMLInputElement, d = el.dataset, S = app.S;
    if (d.wk === 'aktiv') {
      const w = wunsch();
      if (!w) return;
      w.aktiv = el.checked;
      app.changed();
      render(true);
      host.querySelector<HTMLElement>('[data-wk="aktiv"]')?.focus();
      return;
    }
    const t = eintrag();
    if (!t || !['person', 'lg', 'stelle'].includes(d.te!)) return;
    const v = d.te === 'stelle' ? el.value : Number(el.value);
    const neu = { ...t, [d.te!]: v };
    const gleich = S.themen.find((u) => u !== t && u.karte === neu.karte && u.person === neu.person && u.lg === neu.lg && u.stelle === neu.stelle);
    if (gleich) {
      // dieselbe Karte gibt es für dieses Ziel schon: diese entfällt, der Editor zeigt die vorhandene
      themaEntfernen(S, `t${S.themen.indexOf(t)}`);
      offen = { ref: gleich };
    } else if ((d.te === 'stelle' && STELLE_TXT[v as string]) || (d.te === 'person' && (v === 0 || (v === 1 && S.haushalt !== 'single'))) || (d.te === 'lg' && Number.isInteger(v) && (v as number) >= 0 && (v as number) < S.liegenschaften.length)) {
      (t as unknown as Record<string, unknown>)[d.te!] = v;
    } else return;
    app.changed();
    render(true);
    host.querySelector<HTMLElement>(`[data-te="${d.te}"]`)?.focus();
  });
  host.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest('button');
    if (!b) return;
    if (b.dataset.wk === 'wohnform') {
      const w = wunsch();
      if (!w) return;
      w.wohnform = b.dataset.val === 'kauf' ? 'kauf' : 'miete';
      app.changed();
      render(true);
      host.querySelector<HTMLElement>(`[data-wk="wohnform"][data-val="${w.wohnform}"]`)?.focus();
    } else if (b.hasAttribute('data-thema-zu')) schliesse();
    else if (b.hasAttribute('data-te-feld')) zumFeld();
    else if (b.hasAttribute('data-vergleich-start') && !b.disabled) { const key = offenKey(); if (key) app.vergleich?.entwurf(key); }
    else if (b.hasAttribute('data-thema-weg')) entfernen();
  });
  host.addEventListener('focusout', (ev) => {
    const el = ev.target as HTMLInputElement;
    if (el.tagName === 'INPUT' && el.dataset.wk != null && !el.dataset.text && el.classList.contains('bad')) {
      app.toast(`«${el.value}» wurde nicht übernommen: ${el.nextElementSibling?.classList.contains('ferr') ? el.nextElementSibling.textContent : 'ungültige Eingabe.'} Der bisherige Wert gilt weiter.`);
    }
    // Hat der Fokus den Editor verlassen: neu aufbauen (Werte formatiert, Titel nachgeführt)
    setTimeout(() => { if (host.isConnected && !host.contains(document.activeElement)) renderEditor(); }, 0);
  });

  /** Leiste und Editor nachführen; der Editor bleibt, solange der Fokus darin steht (ausser mit neu). */
  function render(neu = false) {
    renderLeiste();
    if (neu || !host.contains(document.activeElement) || !offenKey()) renderEditor();
  }

  /** Fokus auf die Karte key in der sichtbaren Leiste (sonst «+ Thema»); true, wenn er dort steht. */
  function fokusKarte(key: string | null) {
    const el = sichtbar().querySelector<HTMLElement>(`[data-thema="${key}"]`) || plus();
    el?.focus();
    return !!el && document.activeElement === el;
  }

  const themen = { render: () => render(), oeffne, fokusKarte, auswahl: (von?: HTMLElement | null) => zeigeAuswahl(von) };
  app.themen = themen;
  return themen;
}
