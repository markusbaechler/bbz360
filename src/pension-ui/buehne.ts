// Bühne: Kopfzeile je Schritt, Ansichtswahl über dem Bild (Register und Auswahlfeld «Ansicht»), Inhalte aus
// results.js, das kleine Bild über der Schrittleiste (schmale Bildschirme). Im Tutor-Ergebnis dieselben Bausteine auf
// einer Seite: Auswahlfeld «Mehr Auswertungen» statt der Register, feste Reihenfolge der Blöcke, Sprungleiste.
import { ANSICHT_IDS } from '../lib/pension/state';
import { bildDaten, bildSvg, renderMiniBild } from './bild';
import { esc } from '../lib/pension/format';

export const ANSICHTEN = [['bild', 'Bild'], ['ablauf', 'Ablauf'], ['jahre', 'Jahresrechnung'], ['kapital', 'Kapitalbezüge und Steuern'], ['bilanz', 'Vermögensbilanz'], ['fix', 'Renten und Fixkosten'], ['wuensche', 'Wünsche und Ziele'], ['hinweise', 'Hinweise']];

/** Frage der Kopfzeile, solange kein Ergebnis vorliegt (Schritte 1 bis 4). */
const FRAGEN = { situation: 'Wann möchten Sie aufhören?', einkommen: 'Wovon leben Sie nach der Pensionierung?', vermoegen: 'Was brauchen Sie, und was ist da?', liegenschaft: 'Wie wohnen Sie?' };

/** Kopfzeile je Schritt: ohne Ergebnis die Frage des Schritts, mit Ergebnis leer (dann gilt der Urteilsblock). */
export function kopfHtml(S, R) {
  if (R && !R.leer) return '';
  const t = FRAGEN[S.ui?.schritt];
  return t ? `<h2>${t}</h2>` : '';
}

const $ = (id) => document.getElementById(id);

// Anmeldung der Druckereignisse der bisherigen Instanz; jede neue ersetzt sie (Tests bauen die Seite mehrfach auf)
let abmeldenDruck = null, abmeldenBreite = null;
export function createBuehne(app, results) {
  /** Verfügbare Ansichten: «Wünsche und Ziele» nur mit Wünschen, «Renten und Fixkosten» nur mit Fixkosten-Rechnung. */
  const liste = () => ANSICHTEN.filter(([id]) => (id !== 'wuensche' || app.S.wuensche.length > 0) && (id !== 'fix' || !!app.R?.fix));
  /** Gewählte Ansicht; ist sie nicht verfügbar, gilt das Bild. */
  const aktuell = () => (liste().some(([id]) => id === app.S.ui.ansicht) ? app.S.ui.ansicht : 'bild');
  const form = () => app.S.ui.mode === 'form';
  const aktiv = () => !!app.R && !app.R.leer;

  // ---------- Reihenfolge der Blöcke ----------
  // Die Reihenfolge im Dokument ist die Lesereihenfolge (Bildschirmleser, Tabulator). Der Formularmodus braucht
  // «vergleich» vor «ansichten» (Schritt 6) und «ansatz» vor «aktion» (Druck); das Tutor-Ergebnis liest Urteil, Bild,
  // nächste Schritte, Ansatzpunkte und am Schluss «Weiter erkunden» mit Themen, Karteneditor und So oder so.
  // Formularmodus ab 1025 px am Bildschirm: Ergänzung, Kennzahlen und Tragbarkeit stehen unter Bild und Themenleiste
  // (Schritte 4 und 5, styles.css); im Dokument dann ebenso, damit der Tabulator sie nach den Registern erreicht.
  // Schmaler, im Tutor und im Druck gilt die Reihenfolge von index.html.
  const res = $('results'), erk = $('erkunden'), edit = $('themaEdit');
  const ordnung = [...res.children];
  const editHeim = [edit.parentElement, edit.nextSibling];
  const UNTEN = ['subUnten', 'kpis', 'tragBox'], OBEN = ['kpis', 'subUnten', 'tragBox']; // breit bzw. wie in index.html
  const breit = window.matchMedia?.('screen and (min-width: 1025px)');
  let imDruck = false;
  // Urteil (Block «kopf») im Tutor-Ergebnis: in der Karte des Tutors zwischen Einleitung und Tragbarkeit (tutor.js)
  const kopfEl = () => [$('urteilBlock'), $('kpis')];
  /** Urteil und Kennzahlen zurück an ihren Platz in #results (vor dem Neuaufbau der Tutor-Karte und im Druck). */
  function kopfHeim() {
    const [v, k] = kopfEl(), unter = $('subUnten');
    if (v.parentElement === res) return;
    res.insertBefore(v, unter); res.insertBefore(k, unter);
  }
  /** Urteil und Kennzahlen in den Platz der Tutor-Karte (nur im Tutor-Ergebnis). */
  function kopfIn(platz) {
    if (!platz || form()) return;
    platz.append(...kopfEl());
  }
  function ordne() {
    const m = form() ? (breit?.matches && !imDruck ? 'form-breit' : 'form') : 'tutor';
    if (res.dataset.ordnung === m) return;
    const vorher = res.dataset.ordnung, fokus = document.activeElement;
    res.dataset.ordnung = m;
    if (m === 'tutor') {
      // aus dem breiten Formular: Ergänzung, Kennzahlen und Tragbarkeit zuerst zurück an ihren Platz vor «vergleich»
      if (vorher === 'form-breit') { const vg = res.querySelector(':scope > [data-block="vergleich"]'); OBEN.forEach((id) => res.insertBefore($(id), vg)); }
      erk.append($('themenleiste'), edit, res.querySelector('[data-block="vergleich"]'));
      res.insertBefore($('akt'), $('opt'));
    } else {
      ordnung.forEach((el) => res.append(el));
      editHeim[0].insertBefore(edit, editHeim[1]);
      if (m === 'form-breit') { const nach = $('druckAnsichten'); UNTEN.forEach((id) => res.insertBefore($(id), nach)); }
    }
    // Ein verschobenes Element verliert den Fokus; er bleibt, wo er war
    if (fokus && fokus !== document.activeElement && fokus.isConnected && fokus !== document.body) fokus.focus({ preventScroll: true });
  }
  // Jede Bühne ersetzt die Anmeldung der vorigen (Tests bauen die Seite mehrfach auf)
  abmeldenBreite?.();
  const beiWechsel = () => ordne();
  breit?.addEventListener?.('change', beiWechsel);
  abmeldenBreite = () => breit?.removeEventListener?.('change', beiWechsel);

  /** Kopfzeile: Frage oder Urteil; im Tutor immer das Urteil. */
  function renderKopf() {
    const html = form() ? kopfHtml(app.S, app.R) : '', el = $('kopfFrage');
    if (el.innerHTML !== html) el.innerHTML = html;
    el.hidden = !html;
    el.closest('[data-block="kopf"]').classList.toggle('frage', !!html);
    // Kompakte Kopfzeile (ab 1025 px, styles.css): die ersten zwei Kennzahlen ohne Zusatzzeile. In Schritt 5 stehen
    // alle drei Kennzahlen unter dem Bild; dann ist die Kopie für Bildschirmleser verborgen.
    const kk = $('kopfKpis'), mitErgebnis = form() && app.R && !app.R.leer;
    kk.innerHTML = '';
    if (mitErgebnis) {
      [...$('kpis').querySelectorAll('.kpi')].slice(0, 2).forEach((k) => { const c = k.cloneNode(true); c.querySelectorAll('.s').forEach((x) => x.remove()); kk.append(c); });
    }
    kk.setAttribute('aria-hidden', String(app.S.ui.schritt === 'urteil'));
    $('subUnten').textContent = mitErgebnis ? $('verdictSub').textContent : '';
  }

  /** Abschnitt id anspringen (Sprungleiste, Tutor): Fokus auf seine erste Überschrift, sonst auf den Abschnitt. */
  function springe(id) {
    const ziel = $(id);
    if (!ziel) return;
    const h = ziel.matches('h1, h2, h3') ? ziel : ziel.querySelector('h2, h3') || ziel;
    if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1');
    h.scrollIntoView?.({ behavior: matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 'auto' : 'smooth', block: 'start' });
    h.focus({ preventScroll: true });
  }

  function renderMini() {
    const host = $('miniBild')?.querySelector('[data-minibild]');
    if (!host) return;
    if (form()) renderMiniBild(host, bildDaten(app.S, app.R, app.E)); else host.innerHTML = '';
  }

  function renderBody() {
    renderMini();
    const id = aktiv() ? aktuell() : 'bild';
    $('tabBody').innerHTML = results.ansichtHtml(id);
    results.ansichtNach(id);
  }

  function render() {
    ordne();
    renderKopf();
    const tb = $('tabBody');
    // Im Tutor heisst das Auswahlfeld «Mehr Auswertungen» und steht auf jeder Breite statt der Register (styles.css)
    $('ansichtLabel').textContent = form() ? 'Ansicht' : 'Mehr Auswertungen';
    const reg = $('resTabs'), box = $('ansichtBox'), sel = $('ansichtWahl');
    if (!aktiv()) {
      // Ohne Ergebnis: nur das wachsende Bild, ohne Ansichtswahl
      reg.innerHTML = ''; sel.innerHTML = ''; box.hidden = true;
      tb.setAttribute('role', 'region'); tb.setAttribute('aria-label', 'Ihr Bild'); tb.removeAttribute('aria-labelledby'); tb.removeAttribute('tabindex');
      renderBody();
      return;
    }
    const id = aktuell(), L = liste(), ids = L.map(([k]) => k).join();
    box.hidden = false;
    // Register und Auswahlfeld nur neu aufbauen, wenn sich die Liste ändert; sonst bleibt der Fokus, wo er ist
    if ([...reg.querySelectorAll('button[data-ansicht]')].map((b) => b.dataset.ansicht).join() !== ids) {
      const fokus = reg.contains(document.activeElement);
      reg.innerHTML = L.map(([k, t]) => `<button type="button" role="tab" id="ansicht-${k}" data-ansicht="${k}" aria-controls="tabBody">${t}</button>`).join('');
      if (fokus) $(`ansicht-${id}`)?.focus();
    }
    reg.querySelectorAll('button[data-ansicht]').forEach((b) => { const an = b.dataset.ansicht === id; b.setAttribute('aria-selected', String(an)); b.tabIndex = an ? 0 : -1; });
    if ([...sel.options].map((o) => o.value).join() !== ids) sel.innerHTML = L.map(([k, t]) => `<option value="${k}">${t}</option>`).join('');
    sel.value = id;
    tb.setAttribute('role', 'tabpanel'); tb.removeAttribute('aria-label'); tb.setAttribute('tabindex', '0');
    tb.setAttribute('aria-labelledby', `ansicht-${id}`);
    renderBody();
  }

  /** Ansicht wählen; mit refokus bleibt der Fokus auf dem gewählten Register. */
  function waehle(id, refokus) {
    if (!ANSICHT_IDS.includes(id)) return;
    app.S.ui.ansicht = id;
    app.persist();
    render();
    if (refokus) $(`ansicht-${aktuell()}`)?.focus();
  }

  $('resTabs').addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-ansicht]');
    if (b) waehle(b.dataset.ansicht, true);
  });
  $('resTabs').addEventListener('keydown', (ev) => {
    const L = liste(), n = L.length, i = L.findIndex(([k]) => k === aktuell());
    const j = ev.key === 'ArrowRight' ? (i + 1) % n : ev.key === 'ArrowLeft' ? (i + n - 1) % n : ev.key === 'Home' ? 0 : ev.key === 'End' ? n - 1 : -1;
    if (j < 0) return;
    ev.preventDefault();
    waehle(L[j][0], true);
  });
  $('ansichtWahl').addEventListener('change', (ev) => waehle(ev.target.value, false));
  // Sprungleiste des Tutor-Ergebnisses: kein Wechsel der Adresse (#angaben=… bleibt dem Link vorbehalten)
  $('sprung')?.addEventListener('click', (ev) => {
    const a = ev.target.closest('a[href^="#"]');
    if (!a) return;
    ev.preventDefault();
    springe(a.getAttribute('href').slice(1));
  });
  // Das kleine Bild führt zum Bild in der Ansicht «Ergebnis»
  $('miniBild')?.addEventListener('click', () => {
    if (aktiv() && app.S.ui.ansicht !== 'bild') waehle('bild', false);
    app.setView?.('results');
  });

  // ---------- Drucken: alle verfügbaren Ansichten nacheinander (#druckAnsichten), mit Ergebnis (Formular und Tutor) ----------
  // Die interaktive Ansicht (#tabBody) wird dafür geleert, damit keine Element-Id doppelt vorkommt; Register und
  // Auswahlfeld blendet styles.css im Druck aus. Das Bild hat im Druck eine feste Breite und keinen Beobachter.
  let tabGeleert = false, alleAufgeklappt = false;
  let kopfGedruckt = false;
  function druckFuellen() {
    // Die Tutor-Karte wird nicht gedruckt: Das Urteil steht im Druck wieder in #results
    kopfGedruckt = !!$('urteilBlock').closest('[data-tkopf]');
    if (kopfGedruckt) kopfHeim();
    // Gedruckt wird in der Reihenfolge von index.html
    imDruck = true; ordne();
    const host = $('druckAnsichten');
    if (!host || !aktiv()) return;
    host.innerHTML = liste().map(([id, t]) => `<section class="druckansicht" data-ansicht="${id}"><h2>${esc(t)}.</h2>${results.ansichtHtml(id)}</section>`).join('');
    const bild = host.querySelector('#bild');
    if (bild) bild.innerHTML = bildSvg(bildDaten(app.S, app.R, app.E), { w: 700, h: 420, kurz: false });
    // Ohne Inhalt entfällt der Block der Ansicht im Druck (styles.css); die Ansichten stehen in #druckAnsichten
    $('tabBody').innerHTML = ''; tabGeleert = true; $('ansichtenBlock').setAttribute('data-druck-leer', '');
    // Aktionsplan: im Druck die vollständige Liste (sonst nur beim Aufklappen vorhanden)
    const alle = document.querySelector('#akt [data-akt-alle][aria-expanded="false"]');
    if (alle) { alle.click(); alleAufgeklappt = true; }
  }
  function druckLeeren() {
    // Platz neu suchen: Die Karte des Tutors kann inzwischen neu aufgebaut sein
    if (kopfGedruckt) { kopfIn(document.querySelector('#tutor [data-tkopf]')); kopfGedruckt = false; }
    const host = $('druckAnsichten');
    if (host) host.innerHTML = '';
    if (alleAufgeklappt) { document.querySelector('#akt [data-akt-alle][aria-expanded="true"]')?.click(); alleAufgeklappt = false; }
    if (tabGeleert) { tabGeleert = false; $('ansichtenBlock').removeAttribute('data-druck-leer'); renderBody(); }
    imDruck = false; ordne();
  }
  // Jede Bühne ersetzt die Anmeldung der vorigen (Tests bauen die Seite mehrfach auf)
  abmeldenDruck?.();
  window.addEventListener('beforeprint', druckFuellen);
  window.addEventListener('afterprint', druckLeeren);
  abmeldenDruck = () => { window.removeEventListener('beforeprint', druckFuellen); window.removeEventListener('afterprint', druckLeeren); };

  const buehne = { render, renderBody, ordne, springe, kopfHeim, kopfIn };
  app.buehne = buehne;
  return buehne;
}
