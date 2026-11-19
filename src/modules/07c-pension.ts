// ============================================================================
// 07c Pensionierung — Standortbestimmung nach PensCheck (Zielbild Fusion, Phase 2).
// Einstieg: Grundlagen, Haushalts-Stand, Rechnen im Worker, Darstellung.
// Entspricht main.js des PensCheck; fuer das Beratungsgespraech entfallen
// Service Worker, Installation, Link-Teilen und die Rueckfragen zum
// gespeicherten Stand (die Session gehoert bbz360). Der Stand liegt nicht mehr
// unter «penscheck-v1», sondern als `haushalt` in bbzData (lib/haushalt.ts).
// ============================================================================
import '../styles/pension/bbz-fonts-embedded.css';
import '../styles/pension/bbz-base.css';
import '../styles/pension/bbz-components.css';
import '../styles/pension/styles.css';
import '../styles/modules/07c-pension.css';
import bundledParams from '../../public/data/params.json';
import bundledVerification from '../../public/data/verification.json';
import { mountNav } from '../lib/nav';
import { BBZ } from '../lib/data';
import { cockpitNettoLoeschen, haushaltImport, haushaltLesen, haushaltSchreiben, stammdatenAnwenden } from '../lib/haushalt';
import { createEngine, monthOf } from '../lib/pension/engine';
import { applyBudget } from '../lib/pension/analyse';
import { resolveParams, nextParams, pruefZahl } from '../lib/pension/params';
import type { PruefDatei, PruefStand } from '../lib/pension/params';
import { hatEigenes, markEdited } from '../lib/pension/state';
import { variantenZustaende, vergleichSig, rechenEingaben } from '../lib/pension/themen';
import { HINWEIS, GRENZEN } from '../lib/pension/config';
import type { ParamDatei, PensState } from '../lib/pension/typen';
import type { App, AppErgebnis, ChangedOptionen } from '../pension-ui/app';
import { createRechner } from '../pension-ui/rechner';
import { createForm } from '../pension-ui/form';
import { createSchritte } from '../pension-ui/schritte';
import { createResults } from '../pension-ui/results';
import { createBuehne } from '../pension-ui/buehne';
import { createThemen } from '../pension-ui/themenui';
import { createVergleich } from '../pension-ui/vergleich';
import { renderSources } from '../pension-ui/sources';
import { createTutor } from '../pension-ui/tutor';
import { initGlossar } from '../pension-ui/glossar';

const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;

mountNav($('bbzNav'), { activeId: '07c' });

/**
 * Ein Wert gilt als geprüft, wenn ihn mindestens zwei Quellen bestätigen, davon mindestens eine amtliche und eine
 * laufend nachgeführte (gleiche Regel wie scripts/verify-sources.mjs; ältere Prüfdateien ohne diese Zähler: zwei Quellen).
 */
const bestaetigt = (c: PruefStand | undefined): boolean =>
  !!c && (c.confirmed || 0) >= 2 && (c.amtlichLaufend != null ? c.amtlichLaufend >= 1 : (c.official ?? 1) >= 1 && (c.live ?? 1) >= 1);

/** Alter des Prüfstands in Tagen (Infinity ohne Datum). */
const pruefAlterTage = (v: PruefDatei | undefined, jetzt = Date.now()): number =>
  (v?.checkedAt ? (jetzt - new Date(v.checkedAt as string).getTime()) / 864e5 : Infinity);

const app = {
  version: 'bbz360',
  params: bundledParams as unknown as ParamDatei,
  verification: bundledVerification as unknown as PruefDatei,
  S: haushaltLesen(),
  R: null,
  A0: monthOf(),
  bestaetigt,
  // Ein Kundenfall pro Sitzung (ADR-22): kein Musterfall, kein «Neu beginnen», kein Übungsmodus. Zurückgesetzt
  // wird nur im Beratercockpit («Neue Beratung»); der Stand gehört allen Modulen, nicht der Pensionierung allein.
  einFall: true,
} as unknown as App;
// Rechenvarianten A und B des laufenden Vergleichs «So oder so» (leer ohne Vergleich), gerechnet wie der Plan
app.varianten = () => variantenZustaende(app.S, app.E);

function initEngine(): void {
  app.A0 = monthOf();
  const jahr = Math.floor(app.A0 / 12);
  app.P = resolveParams(app.params, jahr);
  // Bereits beschlossene Werte des Folgejahres gelten in der Projektion ab dem 1. Januar
  app.Pn = nextParams(app.params, jahr);
  app.E = createEngine(app.P, app.A0, app.Pn);
  const { ok, alle } = pruefZahl(app.params, app.verification, app.P.meta.jahr, bestaetigt);
  const b = $('dataBadge');
  // Ist der Prüfstand älter als 10 Tage, sagen die Häkchen nichts über den heutigen Stand der Quellen.
  const alt = pruefAlterTage(app.verification);
  app.pruefungVeraltet = alt > 10;
  b.textContent = `Werte ${app.P.meta.veraltet ? app.P.meta.letztesDatenjahr : app.P.meta.jahr}, ${ok} von ${alle} geprüft${app.pruefungVeraltet ? (Number.isFinite(alt) ? `, Prüfung vor ${Math.floor(alt)} Tagen` : ', Prüfdatum unbekannt') : ''}`;
  b.classList.toggle('warn', app.P.meta.veraltet || ok < alle || !!app.pruefungVeraltet);
}
initEngine();

// Speichern in bbzData. Das zentrale Banner (lib/speicher-hinweis.ts) gehoert zu theme.css, das diese Seite nicht
// laedt (siehe 07c-pension.css) — ein voller Speicher wird hier deshalb einmal pro Sitzung als Meldung gezeigt (ADR-14).
let speicherGewarnt = false;
app.persist = () => {
  app.gespeichert = haushaltSchreiben(app.S);
  if (app.gespeichert === false && !speicherGewarnt) {
    speicherGewarnt = true;
    toast('Speicher voll — die Eingaben zur Pensionierung werden nicht gespeichert. Bitte die Session im Beratercockpit exportieren.');
  }
  return app.gespeichert;
};
app.setLamp = (st) => {
  $('mlamp').dataset.st = st || '';
  $('mlampTxt').textContent = ({ gruen: ': reicht', gelb: ': knapp', rot: ': reicht nicht' } as Record<string, string>)[st || ''] || '';
};

// ---------- Rechnen im Worker ----------
// Dauert eine Rechnung zu lange, wird der Worker beendet und neu gestartet; die Oberfläche bleibt bedienbar.
const RECHEN_LIMIT_MS = 20000;
let timer: ReturnType<typeof setTimeout> | undefined;
// Kennung des Vergleichs im zuletzt gesendeten Auftrag: Das Ergebnis trägt sie mit (R.vsig), damit «So oder so»
// erkennt, ob R.varianten schon zu den angezeigten Werten gehört.
let vsigGesendet = '';
/** Die Rechnung ist gescheitert: Das zuletzt gezeigte Ergebnis passt nicht mehr zu den Eingaben. */
function rechenFehler(text: string): void {
  $('results').removeAttribute('aria-busy');
  document.body.dataset.veraltet = '1';
  $('rechenFehlerText').textContent = app.R ? 'Das angezeigte Ergebnis stammt vom letzten gültigen Stand und passt nicht mehr zu den Eingaben.' : 'Es liegt noch kein Ergebnis vor.';
  $('rechenFehler').hidden = false;
  toast(text);
}
function rechenOk(): void {
  delete document.body.dataset.veraltet;
  $('rechenFehler').hidden = true;
}
const rechner = createRechner({
  neuerWorker: () => new Worker(new URL('../pension-ui/worker.ts', import.meta.url), { type: 'module' }),
  auftrag: () => { vsigGesendet = vergleichSig(app.S); return { S: rechenEingaben(app.S), params: app.params, A0: app.A0, stopA: results.stopA(), varianten: app.varianten().map(rechenEingaben) }; },
  limitMs: RECHEN_LIMIT_MS,
  onBeginn: () => { $('results').setAttribute('aria-busy', 'true'); vergleich.pruefen(); },
  onErgebnis: (R: AppErgebnis) => {
    $('results').removeAttribute('aria-busy');
    rechenOk();
    R.vsig = vsigGesendet;
    app.R = R;
    results.render();
    schritte.render();
    // Die Themenleiste vor dem Bild: Das Bild rechnet ihre Höhe in den verfügbaren Platz ein
    themen.render();
    vergleich.render();
    buehne.render();
    tutor.onResult();
  },
  onFehler: (art: string, detail?: unknown) => {
    if (detail) console.error(detail);
    rechenFehler(art === 'zeit' ? 'Die Rechnung dauert ungewöhnlich lange und wurde abgebrochen. Bitte die letzte Eingabe prüfen.' : 'Die Rechnung ist fehlgeschlagen. Bitte die letzte Eingabe prüfen.');
  },
});
const compute = (): void => { rechner.rechne(); };
const schedule = (ms = 220): void => { clearTimeout(timer); timer = setTimeout(compute, ms); };

let formDirty = false;
/** Was-wäre-wenn-Zeitpunkt geändert: speichern und neu rechnen, ohne die Eingaben als bearbeitet zu markieren. */
app.stopChanged = () => { app.persist(); schedule(260); };
app.changed = (o: ChangedOptionen = {}) => {
  // Gilt ein eigenes Budget, folgt der Ausgabenbetrag dessen Summe
  applyBudget(app.S, app.E);
  markEdited(app.S);
  app.persist();
  // Im Tutor ist das Formular verborgen: erst beim Wechsel neu aufbauen
  if (app.S.ui.mode === 'form') { form.reflect(o.except || document.activeElement); if (o.rerender) o.rerender(); } else formDirty = true;
  schedule(o.soft ? 350 : 150);
  // Eine laufende Vorschau passt nicht mehr zum geänderten Plan: sofort als unterwegs zeigen, «übernehmen» gesperrt
  vergleich.pruefen();
  // Karten folgen dem Zustand sofort (Person oder Liegenschaft entfernt), nicht erst mit dem Rechenergebnis
  themen.render();
};

// ---------- Werkzeuge, die die UI-Module erwarten ----------
function toast(t: string): void {
  const el = $('toast');
  el.textContent = t;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.remove('on'); toastTimer = setTimeout(() => { el.textContent = ''; }, 300); }, Math.min(15000, 4500 + Math.max(0, t.length - 60) * 60));
}
let toastTimer: ReturnType<typeof setTimeout> | undefined;
app.toast = toast;
// Im Beratungsgespräch gibt es weder Link-Teilen noch Selbst-Update (Session-Export/-Import in bbz360, ADR-5).
app.share = () => {};
app.checkForUpdate = () => {};
app.hatEigenes = () => hatEigenes(app.S);

initGlossar(app);
const form = createForm(app);
const schritte = createSchritte(app);
const results = createResults(app);
const buehne = createBuehne(app, results);
const tutor = createTutor(app);
const themen = createThemen(app);
const vergleich = createVergleich(app);
app.formRender = () => form.render();

// ---------- Modus: gemeinsam erfassen (Tutor) oder Formular ----------
function applyMode(): void {
  const m = app.S.ui.mode as string;
  document.body.dataset.mode = m;
  document.body.dataset.schritt = app.S.ui.schritt;
  if (m !== 'tutor') delete document.body.dataset.tstep;
  document.querySelectorAll<HTMLElement>('.mode').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
  // Reihenfolge der Blöcke im Ergebnis je Modus (Bühne bzw. eine Seite im Tutor), auch ohne Ergebnis
  buehne.ordne();
}
app.setMode = (m) => {
  // Ein offener, nicht übernommener Budget-Entwurf gilt beim Wechsel der Ansicht als verworfen
  if (m !== app.S.ui.mode && tutor.entwurfBeenden()) { formDirty = true; schedule(150); }
  app.S.ui.mode = m;
  app.persist();
  applyMode();
  if (m === 'form') { if (formDirty) { form.render(); formDirty = false; } } else tutor.render();
  if (app.R) results.render();
  themen.render();
  vergleich.render();
  if (app.R) buehne.render();
  setView('form');
  $('main').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
};
document.querySelectorAll<HTMLElement>('.mode').forEach((b) => b.addEventListener('click', () => app.setMode(b.dataset.mode as 'tutor' | 'form')));

/** Zustand ersetzen (nur beim Einlesen eines PensCheck-Stands); der gewählte Modus bleibt. */
app.replaceState = (ns: PensState, keepMode = false) => {
  if (keepMode) ns.ui.mode = app.S.ui.mode;
  applyBudget(ns, app.E);
  const alt = app.S;
  app.S = ns;
  // Erst darstellen, dann speichern: Ein Stand, der sich nicht darstellen lässt, wird nicht übernommen.
  try { fullRender(); } catch (e) {
    console.error(e);
    app.S = alt;
    fullRender();
    toast('Diese Angaben konnten nicht übernommen werden. Der bisherige Stand bleibt erhalten.');
    return false;
  }
  if (ns.ui.edited) ns.ui.savedAt = Date.now();
  app.persist();
  return true;
};

// ---------- Wichtiger Hinweis: kurz an mehreren Stellen, vollständig im Dialog ----------
document.querySelectorAll('[data-hinweis-kurz]').forEach((el) => { el.textContent = HINWEIS.kurz; });
$('hinweisText').innerHTML = HINWEIS.absaetze.map((t) => `<p>${t}</p>`).join('')
  + `<p>Die Angaben bleiben auf diesem Gerät: Sie sind Teil der bbz360-Session im Browser und werden nicht übertragen.</p>`
  + `<h3>Was die Rechnung vereinfacht oder nicht rechnet</h3><ul>${GRENZEN.map(([t, x]) => `<li><b>${t}:</b> ${x}</li>`).join('')}</ul>`;
const dlg = $('hinweisDlg') as HTMLDialogElement;
/** Klick auf den abgedunkelten Hintergrund (nicht auf den Rand des Dialogs selbst). */
const klickDaneben = (d: HTMLElement, ev: MouseEvent): boolean => {
  if (ev.target !== d) return false;
  const r = d.getBoundingClientRect();
  return ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom;
};
document.addEventListener('click', (ev) => {
  const ziel = ev.target as Element;
  if (ziel.closest('[data-hinweis]')) {
    ev.preventDefault();
    dlg.showModal();
    $('hinweisTitel').focus();
    dlg.scrollTop = 0;
    return;
  }
  if (ziel.closest('[data-close]') || klickDaneben(dlg, ev)) dlg.close();
});

// ---------- Rückfrage, bevor Angaben verloren gehen ----------
const cdlg = $('confirmDlg') as HTMLDialogElement;
let confirmDone: ((ok: boolean) => void) | null = null;
/** Fragt nach; liefert true, wenn die Person bestätigt. ja: Beschriftung der Bestätigung. */
app.confirm = (titel, textInhalt, ja = 'Ja, ersetzen') => new Promise<boolean>((resolve) => {
  $('confirmTitel').textContent = titel;
  $('confirmText').textContent = textInhalt;
  $('btnConfirmJa').textContent = ja;
  confirmDone = resolve;
  cdlg.returnValue = '';
  cdlg.showModal();
  $('btnConfirmNein').focus();
});
$('btnConfirmJa').addEventListener('click', () => cdlg.close('ja'));
$('btnConfirmNein').addEventListener('click', () => cdlg.close(''));
cdlg.addEventListener('click', (ev) => { if (klickDaneben(cdlg, ev)) cdlg.close(''); });
cdlg.addEventListener('close', () => { const f = confirmDone; confirmDone = null; f?.(cdlg.returnValue === 'ja'); });

// Auswahlkarten (role="radio") wie Optionsfelder bedienen: Pfeiltasten wechseln und wählen
document.addEventListener('keydown', (ev) => {
  const d = ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as Record<string, number>)[ev.key];
  const cur = d ? (ev.target as Element).closest?.<HTMLElement>('[role="radio"]') : null;
  const grp = cur?.closest('[role="radiogroup"]');
  if (!cur || !grp) return;
  const all = [...grp.querySelectorAll<HTMLElement>('[role="radio"]:not([disabled])')];
  const nxt = all[(all.indexOf(cur) + d + all.length) % all.length];
  if (!nxt || nxt === cur) return;
  ev.preventDefault();
  const key: [string, string] | null = nxt.dataset.tact ? ['tact', nxt.dataset.tact] : nxt.dataset.tset ? ['val', nxt.dataset.val as string] : nxt.dataset.wiWer != null ? ['wiWer', nxt.dataset.wiWer] : null;
  const label = grp.getAttribute('aria-label');
  nxt.focus();
  if (nxt.dataset.tact === 'budget-open') return;
  nxt.click();
  // Nach dem Neuaufbau steht der Fokus wieder auf der gewählten Karte
  if (key && label && !document.activeElement?.matches?.('[role="radio"]')) {
    [...document.querySelectorAll('[role="radiogroup"]')].find((g) => g.getAttribute('aria-label') === label)
      ?.querySelectorAll<HTMLElement>('[role="radio"]').forEach((b) => { if (b.dataset[key[0]] === key[1]) b.focus(); });
  }
});

function fullRender(): void {
  form.render();
  formDirty = false;
  schritte.render();
  tutor.render();
  applyMode();
  themen.render();
  vergleich.render();
  renderSources(app);
  compute();
}

// ---------- Stand aus dem öffentlichen PensCheck einlesen (Link, Code oder JSON) ----------
// Der Inhalt ist fremd: haushaltImport prüft jedes Feld, bevor etwas in den Zustand gelangt.
const idlg = $('importDlg') as HTMLDialogElement;
$('btnImport').onclick = () => {
  ($('importText') as HTMLTextAreaElement).value = '';
  $('importFehler').hidden = true;
  idlg.showModal();
  $('importText').focus();
};
$('btnImportNein').onclick = () => idlg.close();
idlg.addEventListener('click', (ev) => { if (klickDaneben(idlg, ev)) idlg.close(); });
$('btnImportJa').onclick = async () => {
  let ns: PensState;
  try { ns = haushaltImport(($('importText') as HTMLTextAreaElement).value); } catch { $('importFehler').hidden = false; return; }
  idlg.close();
  // Der Stand gehört allen Modulen: Die Rückfrage nennt, was ersetzt wird.
  if (app.hatEigenes() && !(await app.confirm('Angaben ersetzen?', 'Der eingelesene Stand ersetzt die bisherigen Angaben zum Haushalt: Personen, Lohn, Vermögen, Vorsorge, Liegenschaften, Ausgaben und Wünsche. Sie gelten danach auch im Finanz-Cockpit, im Budget und im Lebensplan.'))) return;
  // Was das Beratercockpit kennt, gilt: Namen und Geburtsdaten der Stammdaten gehen dem eingelesenen Stand vor.
  ns = stammdatenAnwenden(ns, BBZ.all());
  // Wie beim Link im PensCheck: eigene Angaben, direkt im Ergebnis
  Object.assign(ns.ui, { edited: true, practice: false, tutorStep: 'ergebnis', tutorMax: 99 });
  cockpitNettoLoeschen(); // das Netto des bisherigen Falls gilt nicht für den eingelesenen
  if (app.replaceState(ns, true)) toast('Angaben aus dem PensCheck übernommen.');
};

$('btnPdf').onclick = async () => {
  if (!app.R) return;
  if (document.body.dataset.veraltet) { toast('Die letzte Rechnung ist fehlgeschlagen. Ein Bericht ist erst wieder möglich, wenn die Eingaben gerechnet werden können.'); return; }
  const b = $('btnPdf') as HTMLButtonElement; b.disabled = true; b.textContent = 'PDF wird erstellt …';
  try { const { buildReport } = await import('../pension-ui/report'); const name = await buildReport(app); toast(`${name} gespeichert.`); }
  catch (e) { console.error(e); toast('Das PDF konnte nicht erstellt werden.'); }
  finally { b.disabled = false; b.textContent = 'Bericht als PDF'; }
};

// ---------- Mobile Navigation ----------
function setView(v: string): void {
  document.body.dataset.view = v;
  document.querySelectorAll<HTMLElement>('.mnav button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
  window.scrollTo({ top: 0, behavior: 'instant' });
}
app.setView = setView; // für das kleine Bild (buehne.ts)
document.querySelectorAll<HTMLElement>('.mnav button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view as string)));
document.querySelector('.skip')?.addEventListener('click', () => setView('form'));
// Grundlagen und Quellen: eigene Ansicht, erreichbar über die Fusszeile
let viewBeforeSources = 'form';
$('btnSources').addEventListener('click', () => { viewBeforeSources = document.body.dataset.view === 'sources' ? viewBeforeSources : (document.body.dataset.view as string); setView('sources'); $('btnSrcBack').focus(); });
$('btnSrcBack').addEventListener('click', () => setView(viewBeforeSources || 'form'));

// Monatswechsel bei offenem Fenster: Die Rechnung beginnt im neuen Monat.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') return;
  if (monthOf() !== app.A0) { initEngine(); form.render(); tutor.render(); compute(); }
});

// Drucken: zugeklappte Abschnitte des Ergebnisses für den Ausdruck öffnen und danach wieder schliessen
let zuVorDruck: HTMLDetailsElement[] = [];
window.addEventListener('beforeprint', () => {
  // #sofortBox öffnet und schliesst vergleich.ts selbst (ihr Zustand gehört dem Modul, auch während des Drucks)
  zuVorDruck = [...document.querySelectorAll<HTMLDetailsElement>('#results details:not([open]):not(#sofortBox)')];
  zuVorDruck.forEach((d) => { d.open = true; });
});
window.addEventListener('afterprint', () => { zuVorDruck.forEach((d) => { d.open = false; }); zuVorDruck = []; });

// ---------- Start ----------
// Ein gespeicherter Stand mit aktivem Budget folgt dessen Summe
applyBudget(app.S, app.E);
try { fullRender(); } catch (e) {
  // Kein stiller Ersatz durch einen anderen Stand: Der Kundenfall bleibt, der Fehler wird gezeigt.
  console.error(e);
  $('rechenFehlerText').textContent = 'Die gespeicherten Angaben liessen sich nicht darstellen.';
  $('rechenFehler').hidden = false;
}
