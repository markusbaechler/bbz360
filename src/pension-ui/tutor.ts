// Tutor: geführte Erfassung in kurzen, nachvollziehbaren Schritten für Laien.
// Schreibt in denselben Zustand wie das Formular; ein Wechsel ist jederzeit möglich.
import { chf, dec, fmtIn, esc } from '../lib/pension/format';
import { getPath, setPath, clone, emptyState, migrate, EXAMPLE, rangeError } from '../lib/pension/state';
import { readNum, setErr, clearErr, revertErr } from './fielderr';
import { horizon, ausgabenCheck, fixHelpers, BUDGET_KEYS, budgetVoll, budgetWerte, budgetSumme, hatEigenheim, naechstesMuster } from '../lib/pension/analyse';
import { STUFEN, BUDGET_POS, budgetBereich, musterHtml, lohnCheckHtml } from '../lib/pension/budget';
import { tragKurzHtml, varianteHtml } from './trag';
import { ctrlHtml, summaryHtml, bindWhatIf } from './whatif';
import { gl } from './glossar';
import { reglerSchritt } from './slider';
import { themaEntfernen, liegenschaftEntfernt, liegenschaftEingefuegt, zielWeg } from '../lib/pension/themen';
import type { Auswertung } from '../lib/pension/analyse';
import type { Stufe } from '../lib/pension/budget';
import type { Engine } from '../lib/pension/engine';
import type { Liegenschaft, NumLeer, Params, PensState, Wunsch } from '../lib/pension/typen';
import type { App } from './app';

/** Optionen eines Zahlenfelds (num). */
interface NumOpt { dec?: boolean; empty?: boolean; ph?: string; big?: boolean; help?: string }
/** Stand vor dem Öffnen des Budget-Assistenten (S.ui.entwurf). */
interface Entwurf { budget: Record<string, number>; basis: PensState['budgetBasis']; miete: NumLeer }
/** Fixkosten, wie sie im Stand stehen: '' bedeutet «Richtwert». */
type FixLeer = Record<string, NumLeer>;
/** data-Attribute eines Elements, wie die Ereignisbehandlung sie liest. */
type Daten = Record<string, string>;
/** Schalter des Tutors je Person (Kapitalbezug, 3a-Einzahlung). */
type TKap = 'tkap0' | 'tkap1';
type T3a = 't3a0' | 't3a1';
/** Oberfläche des Tutors. */
export type Tutor = ReturnType<typeof createTutor>;

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const svg = (d: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const I = {
  person: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>'),
  couple: svg('<circle cx="8" cy="8" r="3.5"/><circle cx="16.5" cy="9" r="3"/><path d="M2 21c0-3.5 3-5.5 6-5.5s6 2 6 5.5M14 15.5c3.5-.5 7 1.2 7 5.5"/>'),
  heart: svg('<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/>'),
  pen: svg('<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>'),
  book: svg('<path d="M4 19V5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2Z"/><path d="M8 7h6"/>'),
  resume: svg('<path d="M5 12h12M13 6l6 6-6 6"/>'),
  female: svg('<circle cx="12" cy="9" r="5"/><path d="M12 14v7M9 18h6"/>'),
  male: svg('<circle cx="10" cy="14" r="5"/><path d="M14 10l6-6M15 4h5v5"/>'),
  calc: svg('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h2M12 11h2M8 15h2M12 15h2M16 11v4"/>'),
  doc: svg('<path d="M6 3h9l4 4v14H6Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>'),
  no: svg('<circle cx="12" cy="12" r="9"/><path d="m8 8 8 8"/>'),
  yes: svg('<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>'),
  coins: svg('<ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v4c0 1.7 2.7 3 6 3s6-1.3 6-3V7M9 14v3c0 1.7 2.7 3 6 3s6-1.3 6-3v-4c0-1.6-2.4-2.9-5.5-3"/>'),
  bank: svg('<path d="M3 10 12 4l9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>'),
  chart: svg('<path d="M4 19h16M6 15l4-4 3 3 5-6"/>'),
  shield: svg('<path d="M12 3 4 7v5c0 4.4 3.4 8.3 8 9 4.6-.7 8-4.6 8-9V7l-8-4Z"/>'),
  rocket: svg('<path d="M5 15c-1 2-1 4-1 4s2 0 4-1M9 15l-3-3c2-5 6-8 12-8 0 6-3 10-8 12l-1-1Z"/><circle cx="14" cy="10" r="1.5"/>'),
  home: svg('<path d="M4 11 12 4l8 7v9H4Z"/><path d="M10 20v-5h4v5"/>'),
  key: svg('<circle cx="8" cy="15" r="4"/><path d="m11 12 8-8M16 7l2 2"/>'),
  plane: svg('<path d="M3 13 21 6l-4 14-5-5-4 3v-5Z"/>'),
  car: svg('<path d="M3 16v-4l2-5h11l3 5h2v4H3Z"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>'),
  globe: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>'),
  gift: svg('<rect x="3" y="9" width="18" height="12" rx="1"/><path d="M12 9v12M3 13h18M12 9c-2-4-6-4-6-1s6 1 6 1Zm0 0c2-4 6-4 6-1s-6 1-6 1Z"/>'),
};

const STEPS = [
  { id: 'start', label: 'Start' },
  { id: 'haushalt', label: 'Haushalt und Wohnort' },
  { id: 'personen', label: 'Zu Ihrer Person' },
  { id: 'pension', label: 'Wunsch-Pensionierung' },
  { id: 'ausgaben', label: 'Ausgaben im Ruhestand' },
  { id: 'lohn', label: 'Lohn' },
  { id: 'ahv', label: 'AHV' },
  { id: 'pk', label: 'Pensionskasse' },
  { id: 's3a', label: 'Säule 3a und Freizügigkeit' },
  { id: 'vermoegen', label: 'Erspartes' },
  { id: 'wohnen', label: 'Wohnen' },
  { id: 'wuensche', label: 'Wünsche' },
  { id: 'sofort', label: 'Sofort aufhören?' },
  { id: 'ergebnis', label: 'Ergebnis' },
];
type Icon = keyof typeof I;
const IDX = Object.fromEntries(STEPS.map((s, i) => [s.id, i]));
const WISH: Record<string, { icon: Icon; title: string; sub: string; make: () => Wunsch }> = {
  reisen: { icon: 'plane', title: 'Mehr reisen', sub: 'jedes Jahr ein Reisebudget', make: () => ({ typ: 'jahr', aktiv: true, name: 'Reisen', betrag: 10000, von: 65, bis: 75 }) },
  auto: { icon: 'car', title: 'Wohnmobil oder Auto', sub: 'einmalige Anschaffung', make: () => ({ typ: 'einmal', aktiv: true, name: 'Wohnmobil', betrag: 80000, alter: 66 }) },
  ausland: { icon: 'globe', title: 'Zeit im Süden', sub: 'einige Monate pro Jahr im Ausland', make: () => ({ typ: 'ausland', aktiv: true, name: 'Ausland', monate: 3, von: 65, bis: 80, wohnform: 'miete' }) },
  erbe: { icon: 'gift', title: 'Etwas vererben', sub: 'ein Betrag soll übrig bleiben', make: () => ({ typ: 'ziel', aktiv: true, name: 'Erbe', betrag: 300000 }) },
};

export function createTutor(app: App) {
  const root = document.getElementById('tutor')!;
  const S = () => app.S;
  const E = () => app.E;
  const cpl = () => S().haushalt !== 'single';
  const persons = () => (cpl() ? [0, 1] : [0]);
  const pname = (i: number) => (cpl() ? (i === 0 ? 'Person 1 (Sie)' : 'Person 2') : 'Sie');
  const step = () => (IDX[S().ui.tutorStep] != null ? S().ui.tutorStep : 'start');
  // Budget-Assistent: Unteransicht im Schritt «Ausgaben» (kein eigener Schritt)
  let budgetOffen = false, entwurfNeu = false;
  // Miete der Fixkosten vor einem neuen Budget-Entwurf: Wird der Entwurf verworfen, gilt sie wieder
  // Stand vor dem Öffnen des Budget-Assistenten (Budget, Grundlage, Miete) steht in S.ui.entwurf und wird mitgespeichert.
  // «Zurück ohne Übernehmen», das Verlassen über die Fortschrittsleiste und der Wechsel ins Formular stellen ihn wieder
  // her; nach Neuladen oder Schliessen der Seite tut das die Prüfung beim Laden (sanitize in state.js).
  // Vor «Eigenheim» erfasste Miete, gebunden an den Datenbestand: «Zur Miete» stellt sie wieder her
  let mieteVorEigenheim: { s: PensState; wert: number } | null = null;
  /** Nicht übernommenen Entwurf verwerfen: Budget, Grundlage und Miete gelten wie vor dem Öffnen. */
  const verwerfeEntwurf = (s: PensState) => {
    const e = s.ui.entwurf as Entwurf | undefined;
    if (!e) return;
    s.budget = { ...e.budget };
    s.budgetBasis = e.basis;
    // Wurde inzwischen ein Eigenheim erfasst, folgt Wohnen der Liegenschaft
    (s.fix as FixLeer).wohnen = hatEigenheim(s, app.E) ? '' : e.miete;
  };
  /**
   * Assistent schliessen, ohne zu übernehmen (Fortschrittsleiste, Wechsel ins Formular, «Zurück ohne Übernehmen»).
   * Ein aktives Budget bleibt mit seinen Änderungen; sonst gilt der Stand vor dem Öffnen. Liefert true, wenn offen war.
   */
  function entwurfBeenden() {
    const s = S(), offen = budgetOffen || !!s.ui.entwurf;
    if (s.ui.entwurf && !s.budgetAktiv) verwerfeEntwurf(s);
    delete s.ui.entwurf;
    budgetOffen = false;
    return offen;
  }
  const imBudget = () => budgetOffen && step() === 'ausgaben';

  // ---------- Bausteine ----------
  const choice = (path: string, val: string | number, title: string, sub: string, icon?: Icon) => {
    const cur = getPath(S(), path);
    return `<button type="button" class="tchoice" role="radio" aria-checked="${String(cur) === String(val)}" data-tset="${path}" data-val='${esc(JSON.stringify(val))}'>${icon ? `<span class="ico">${I[icon]}</span>` : ''}<b>${title}</b>${sub ? `<span>${sub}</span>` : ''}</button>`;
  };
  // role: 'radio' = eine von mehreren, 'checkbox' = an/aus, '' = Schaltfläche, die etwas auslöst
  const action = (act: string, title: string, sub: string, icon: Icon, checked = false, role = 'radio') => `<button type="button" class="tchoice"${role ? ` role="${role}" aria-checked="${checked}"` : ''} data-tact="${act}">${icon ? `<span class="ico">${I[icon]}</span>` : ''}<b>${title}</b>${sub ? `<span>${sub}</span>` : ''}</button>`;
  const num = (path: string, label: string, o: NumOpt = {}) => {
    const id = 't_' + path.replace(/\./g, '_');
    return `<div class="tfield"><label for="${id}">${label}</label><input type="text" id="${id}" inputmode="decimal" autocomplete="off" data-tpath="${path}"${o.dec ? ' data-dec="1"' : ''}${o.empty ? ' data-empty="1"' : ''} value="${fmtIn(getPath(S(), path), o.dec)}" placeholder="${esc(o.ph || '')}"${o.big ? ' class="tbig"' : ''}${o.help ? ` aria-describedby="${id}_h"` : ''}>${o.help ? `<span class="thelp" id="${id}_h">${o.help}</span>` : ''}</div>`;
  };
  // Regler mit Schrittknöpfen: «−» und «+» für genaue Schritte, auch ohne den Regler zu ziehen
  const rkopf = (path: string, label: string, stepv: number, wert: string, offen = false) => `<div class="tr-head"><span class="tval" data-rout="${path}">${wert}</span><span class="tr-btns"><button type="button" class="tr-btn" data-rstep="${path}" data-d="${-stepv}"${offen ? ' data-offen="1"' : ''} aria-label="${esc(label)}: ${stepv} weniger">−</button><button type="button" class="tr-btn" data-rstep="${path}" data-d="${stepv}"${offen ? ' data-offen="1"' : ''} aria-label="${esc(label)}: ${stepv} mehr">+</button></span></div>`;
  const range = (path: string, label: string, min: number, max: number, stepv: number, fmt: (v: number) => string) => {
    const id = 'r_' + path.replace(/\./g, '_'), v = +getPath(S(), path) || min;
    return `<div class="tfield trange"><label for="${id}">${label}</label>${rkopf(path, label, stepv, fmt(v))}<input type="range" id="${id}" min="${min}" max="${max}" step="${stepv}" value="${v}" data-tpath="${path}" data-range="1" aria-valuetext="${esc(fmt(v))}"><span class="tr-scale"><span>${fmt(min)}</span><span>${fmt(max)}</span></span></div>`;
  };
  const stepper = (path: string, label: string, min: number, max: number) => {
    const id = 't_' + path.replace(/\./g, '_');
    return `<div class="tfield"><label for="${id}">${label}</label><div class="tstepper"><button type="button" data-tinc="${path}" data-d="-1" data-min="${min}" data-max="${max}" aria-label="${label} minus 1">−</button><input type="text" id="${id}" inputmode="numeric" data-tpath="${path}" data-dec="1" data-errbox="${id}_e" value="${fmtIn(getPath(S(), path), true)}" class="tbig" aria-describedby="${id}_e"><button type="button" data-tinc="${path}" data-d="1" data-min="${min}" data-max="${max}" aria-label="${label} plus 1">+</button></div><span class="thelp terr" id="${id}_e" role="status" data-err="${path}"></span></div>`;
  };
  const sel = (path: string, label: string, opts: (string | number)[][]) => {
    const id = 't_' + path.replace(/\./g, '_'), cur = String(getPath(S(), path));
    return `<div class="tfield"><label for="${id}">${label}</label><select id="${id}" data-tpath="${path}" data-sel="1">${opts.map(([v, l]) => `<option value="${esc(v)}"${String(v) === cur ? ' selected' : ''}>${l}</option>`).join('')}</select></div>`;
  };
  const why = (txt: string, q = 'Warum fragen wir das?') => `<details class="twhy"><summary>${q}</summary><p>${txt}</p></details>`;
  const tip = (txt: string) => `<div class="ttip"><b>Gut zu wissen.</b> ${txt}</div>`;
  const q = (txt: string) => `<p class="tq">${txt}</p>`;
  const live = (key: string) => `<div class="tlive" data-live="${key}" aria-live="polite"></div>`;
  const pblock = (i: number, inner: string) => `<div class="tperson${i ? ' p2' : ''}" role="group" aria-label="${esc(pname(i))}"><div class="tph"><span class="dot" aria-hidden="true"></span>${pname(i)}</div>${inner}</div>`;
  const forPersons = (fn: (i: number) => string) => `<div class="tpersons">${persons().map((i) => pblock(i, fn(i))).join('')}</div>`;
  // Titel mit der Vertikallinie aus dem Logo; der Schrittname steht in der Fortschrittszeile
  const head = (_kick: string, title: string, lead?: string) => `<div class="thead"><h2 tabindex="-1">${title}</h2>${lead ? `<p class="tlead">${lead}</p>` : ''}</div>`;

  // ---------- Budget-Assistent ----------
  const bslider = (path: string, label: string, hint: string, v: number, min: number, max: number) => {
    const id = 'r_' + path.replace(/\./g, '_');
    return `<div class="tfield trange"><label for="${id}">${label}</label>${hint ? `<span class="thelp" id="${id}_h">${hint}</span>` : ''}${rkopf(path, label, 50, chf(v), true)}<input type="range" id="${id}" min="${min}" max="${max}" step="50" value="${v}" data-tpath="${path}" data-range="1" aria-valuetext="${esc(chf(v))}"${hint ? ` aria-describedby="${id}_h"` : ''}><span class="tr-scale"><span>${chf(min)}</span><span>${chf(max)}</span></span></div>`;
  };
  /** Entspricht das Budget (ohne Wohnen) genau einem Musterbudget? */
  const istMuster = (s: PensState, m: Record<string, number>) => BUDGET_KEYS.slice(1).every((k) => +s.budget?.[k] === m[k]);
  /** «Grundlage: komfortabel» bzw. «…, angepasst», solange das Budget von einem Beispiel ausgeht. */
  const basisText = (s: PensState, mb: Record<string, Record<string, number>>) => (s.budgetBasis && mb[s.budgetBasis] ? `Grundlage: ${STUFEN[s.budgetBasis]}${istMuster(s, mb[s.budgetBasis]) ? '' : ', angepasst'}` : '');
  function budgetView(s: PensState, P: Params, e: Engine, typ: 'paar' | 'single') {
    const mb = P.annahmen.musterbudget[typ], w = budgetWerte(s, e), eigen = hatEigenheim(s, e);
    const k = (s.liegenschaften || []).findIndex((l) => (l.typ || 'eigen') === 'eigen');
    const n = cpl() ? 2 : 1, praemie = Math.round(P.kk.praemieErw * n);
    const hint: Record<string, string> = {
      kk: `Mittlere Prämie ${P.meta.jahr} laut BAG: ${chf(praemie)} für ${n === 2 ? 'zwei Erwachsene' : 'eine erwachsene Person'}, ohne Franchise und Selbstbehalt. Ihre genaue Prämie zeigt der <a href="https://www.priminfo.admin.ch/de/praemien" target="_blank" rel="noopener">Prämienrechner des Bundes<span class="vh"> (öffnet in neuem Fenster)</span></a>.`,
    };
    const pos = (key: string) => {
      const [, label, h] = BUDGET_POS.find(([p]) => p === key)!, b = budgetBereich(mb, key, w[key]);
      return bslider(`budget.${key}`, label, hint[key] || h, w[key], b.min, b.max);
    };
    return `${head('', 'Ihr Budget im Ruhestand', 'Stellen Sie Ihre Ausgaben pro Monat zusammen. Beginnen Sie mit einem Beispiel und passen Sie die Positionen an. Steuern gehören nicht dazu: Einkommens- und Vermögenssteuern rechnen wir separat.')}
      <div class="tbstart" role="group" aria-label="Mit einem Beispiel beginnen"><span class="chiplbl">Beispiel laden:</span>${Object.keys(STUFEN).map((x) => `<button type="button" class="chip" data-tact="budget-preset" data-k="${x}" aria-pressed="${s.budgetBasis === x}">${STUFEN[x as Stufe]}</button>`).join('')}</div>
      ${live('budgettop')}
      <h3 class="gh">Wohnen</h3>
      <div class="tchoices" role="radiogroup" aria-label="Wohnform">${action('wohnen-eigen', 'Im Eigenheim', 'Haus oder Eigentumswohnung', 'home', eigen)}${action('wohnen-miete', 'Zur Miete', '', 'key', !eigen)}</div>
      ${eigen && k >= 0 ? `<div class="grid2">${num(`liegenschaften.${k}.verkehrswert`, 'Wert der Liegenschaft (CHF)', { help: 'geschätzter heutiger Verkaufswert' })}${num(`liegenschaften.${k}.hypothek`, 'Hypothek (CHF)')}${num(`liegenschaften.${k}.zins`, 'Hypothekarzins (%)', { dec: true })}</div>${live('bwohnen')}` : pos('wohnen')}
      <h3 class="gh">Fixe Kosten</h3>
      ${pos('kk')}${pos('vers')}${pos('mob')}
      <h3 class="gh">Lebensstil</h3>
      ${pos('haushalt')}${pos('freizeit')}${pos('pers')}${pos('rueck')}
      ${live('budgetsum')}
      <div class="tactions">
        <button type="button" class="bbz-button bbz-button--primary" data-tact="budget-apply">${s.budgetAktiv ? 'Fertig' : 'Als Ausgaben übernehmen'}</button>
        ${s.budgetAktiv ? '' : '<button type="button" class="bbz-button bbz-button--ghost" data-tact="budget-close">Zurück ohne Übernehmen</button>'}
      </div>`;
  }

  // ---------- Schritte ----------
  function body(id: string) {
    const s = S(), P = app.P, e = E();
    switch (id) {
      case 'start': {
        const own = s.ui.edited && !s.ui.practice;
        return `${head('Willkommen', 'In zwölf kurzen Schritten zur ersten Einschätzung.', 'Wir fragen nach Ihrer Situation, rechnen im Hintergrund mit und zeigen Ihnen am Schluss, ob Ihr Geld für die gewünschte Pensionierung reicht und wo es Ansatzpunkte gibt.')}
          <div class="tchoices" role="group" aria-label="Wie möchten Sie beginnen?">
            ${own ? action('resume', 'Mit meinen Angaben weitermachen', 'Ihre bisherigen Eingaben bleiben erhalten.', 'resume', false, '') : ''}
            ${action('own', own ? 'Neu beginnen' : 'Mit meinen eigenen Angaben', own ? 'Alle Angaben auf null setzen und neu erfassen.' : 'Sie erfassen Ihre Situation Schritt für Schritt.', 'pen', false, '')}
            ${action('practice', 'Zuerst mit einem Beispiel üben', own ? 'Ein Ehepaar mit Eigenheim. Ersetzt Ihre Angaben; vorher wird nachgefragt.' : 'Ein Ehepaar mit Eigenheim; alle Werte lassen sich ändern.', 'book', false, '')}
          </div>
          ${tip('Halten Sie wenn möglich Ihren <b>Vorsorgeausweis der Pensionskasse</b> und die Kontoauszüge Ihrer Säule 3a bereit. Wo Ihnen eine Angabe fehlt, setzen wir einen Richtwert ein.')}
          <p class="cap">Ihre Angaben bleiben auf diesem Gerät und werden nicht übertragen.</p>`;
      }
      case 'haushalt':
        return `${head(STEPS[IDX[id]].label, 'Für wen planen wir?', 'Bei Paaren rechnen wir beide Personen gemeinsam, denn Einkommen und Ausgaben teilen Sie.')}
          <div class="tchoices" role="radiogroup" aria-label="Haushalt">
            ${choice('haushalt', 'single', 'Nur für mich', 'alleinstehend', 'person')}
            ${choice('haushalt', 'verheiratet', 'Für uns als Ehepaar', 'verheiratet oder eingetragene Partnerschaft', 'couple')}
            ${choice('haushalt', 'konkubinat', 'Für uns als Paar', 'unverheiratet zusammenlebend', 'heart')}
          </div>
          ${sel('kanton', 'In welchem Kanton wohnen Sie?', Object.entries<{ ort: string }>(P.kapSteuer.kantone).sort().map(([k, v]) => [k, `${v.ort} (${k})`]))}
          ${why(`Der Kanton bestimmt, wie hoch die Steuer ist, wenn Sie Geld aus der Pensionskasse oder der Säule 3a als ${gl('kapitalbezug', 'Kapital beziehen')}. Die Unterschiede zwischen den Kantonen betragen schnell einige Tausend Franken.`)}
          ${s.haushalt === 'konkubinat' ? tip(`Unverheiratete Paare erhalten zwei volle AHV-Renten. Bei Ehepaaren sind die beiden Renten zusammen ${gl('plafonierung', 'auf 150% einer Maximalrente begrenzt')}.`) : ''}`;
      case 'personen':
        return `${head(STEPS[IDX[id]].label, cpl() ? 'Erzählen Sie uns etwas über sich beide.' : 'Erzählen Sie uns etwas über sich.', 'Alter und Geschlecht bestimmen, ab wann Sie AHV erhalten und wie lange das Geld voraussichtlich reichen muss.')}
          ${forPersons((i) => `${stepper(`personen.${i}.jahrgang`, 'Jahrgang', 1940, e.BASIS - 18)}
            ${sel(`personen.${i}.geburtsmonat`, 'Geburtsmonat', MONATE.map((m, k) => [k + 1, m]))}
            ${q('Geschlecht')}<div class="tchoices" role="radiogroup" aria-label="Geschlecht ${pname(i)}">${choice(`personen.${i}.geschlecht`, 'w', 'Frau', '', 'female')}${choice(`personen.${i}.geschlecht`, 'm', 'Mann', '', 'male')}</div>
            ${live('person' + i)}`)}
          ${why(`Das ${gl('referenzalter', 'AHV-Referenzalter')} liegt bei 65 Jahren; für Frauen der Jahrgänge 1961 bis 1963 gelten Übergangsstufen. Die ${gl('lebenserwartung', 'Lebenserwartung')} stammt vom Bundesamt für Statistik. ${(s.horizontModus || 'le5') === 'le5' ? 'Wir rechnen sicherheitshalber 5 Jahre länger.' : 'Wie lange gerechnet wird, legt der Planungshorizont fest (Formular, «Weitere Annahmen»).'}`)}`;
      case 'pension':
        return `${head(STEPS[IDX[id]].label, 'Wann möchten Sie aufhören zu arbeiten?', 'Schieben Sie den Regler auf Ihr Wunschalter. Ausprobieren ist ausdrücklich erwünscht, Sie können das Alter am Schluss noch ändern.')}
          ${forPersons((i) => `${range(`personen.${i}.pensAlter`, 'Pensionierung mit', 55, 70, 1, (v) => `${v} Jahren`)}${live('pension' + i)}`)}
          ${tip(`Die Pensionskasse zahlt frühestens ab ${P.bvg.minAlter} eine Rente. ${gl('s3a', 'Säule 3a')} und ${gl('freizuegigkeit', 'Freizügigkeitsguthaben')} sind frühestens ${P.vorsorge.bezugJahreVorRef} Jahre vor dem ${gl('referenzalter', 'AHV-Referenzalter')} verfügbar.`)}`;
      case 'ausgaben': {
        const typ = cpl() ? 'paar' : 'single', erf = P.annahmen.erfahrung[typ];
        if (budgetOffen) return budgetView(s, P, e, typ);
        // Richtwert-Karten: gewählt nur, solange kein eigenes Budget gilt
        const rw = (k: Stufe) => `<button type="button" class="tchoice" role="radio" aria-checked="${!s.budgetAktiv && +s.ausgabenRuhestand === erf[k]}" data-tset="ausgabenRuhestand" data-val='${erf[k]}'><span class="ico">${I.coins}</span><b>${chf(erf[k])}</b><span>${STUFEN[k]}</span></button>`;
        return `${head(STEPS[IDX[id]].label, 'Wie viel brauchen Sie im Ruhestand pro Monat?', 'Gemeint ist alles, was Sie zum Leben ausgeben, inklusive Wohnen, Krankenkasse, Ferien und Freizeit, aber ohne Steuern: Einkommens- und Vermögenssteuern rechnen wir separat dazu. Wählen Sie einen Richtwert, stellen Sie Ihr Budget selbst zusammen oder passen Sie den Betrag an.')}
          <div class="tchoices" role="radiogroup" aria-label="Richtwerte">
            ${rw('bescheiden')}${rw('mittel')}${rw('gehoben')}
            ${action('budget-open', 'Eigenes Budget', s.budgetAktiv ? `${chf(s.ausgabenRuhestand)}${basisText(s, P.annahmen.musterbudget[typ]) ? ` · ${basisText(s, P.annahmen.musterbudget[typ])}` : ''}` : 'in 8 Positionen zusammenstellen', 'calc', !!s.budgetAktiv)}
          </div>
          ${musterHtml(P, typ)}
          ${range('ausgabenRuhestand', 'Ausgaben pro Monat', 2000, 20000, 250, (v) => chf(v))}
          ${num('ausgabenRuhestand', 'Oder genau eingeben (CHF pro Monat)', { big: true })}
          ${live('ausgaben')}
          ${tip('Ab jetzt zeigt die Ampel rechts bzw. oben, ob Ihr Geld reicht. Mit jeder weiteren Angabe wird die Rechnung genauer: Lohn, Renten und Erspartes kommen in den nächsten Schritten dazu.')}`;
      }
      case 'lohn': {
        const nb = (s.einkommen || []).findIndex((x) => x.tkey === 'neben');
        return `${head(STEPS[IDX[id]].label, 'Was verdienen Sie heute?', 'Der Lohn finanziert die Jahre bis zur Pensionierung und bestimmt die Höhe Ihrer AHV-Rente.')}
          ${forPersons((i) => `${num(`personen.${i}.brutto`, 'Bruttolohn pro Jahr (CHF)', { big: true, help: 'inklusive 13. Monatslohn und Bonus' })}${live('lohn' + i)}`)}
          ${live('lohncheck')}
          ${q('Möchten Sie nach der Pensionierung noch etwas dazuverdienen?')}
          <div class="tchoices" role="radiogroup" aria-label="Nebenerwerb">
            ${action('neben-nein', 'Nein', 'ganz aufhören', 'no', nb < 0)}
            ${action('neben-ja', 'Ja, etwas', 'z. B. Mandat, Teilzeit, Beratung', 'yes', nb >= 0)}
          </div>
          ${nb >= 0 ? `<div class="grid2">${num(`einkommen.${nb}.betrag`, 'Brutto pro Jahr (CHF)')}${num(`einkommen.${nb}.bisJahr`, 'bis Jahr', { dec: true, ph: 'unbefristet' })}</div>` : ''}
          ${why(`Wer vor dem AHV-Referenzalter nicht mehr erwerbstätig ist, zahlt ${gl('nichterwerbstaetige', 'AHV-Beiträge als Nichterwerbstätige')}. Ein kleiner Nebenerwerb kann diese Beiträge ersetzen.`)}`;
      }
      case 'ahv':
        return `${head(STEPS[IDX[id]].label, 'Ihre AHV-Rente.', `Wir schätzen die Rente aus Ihrem Lohn. Haben Sie bei der Ausgleichskasse eine ${gl('vorausberechnung', 'Rentenvorausberechnung')} bestellt, können Sie den genauen Betrag eintragen.`)}
          ${forPersons((i) => {
            const p = s.personen[i];
            return `${q('Wie hoch ist die AHV-Rente?')}<div class="tchoices" role="radiogroup" aria-label="AHV-Rente ${pname(i)}">${choice(`personen.${i}.ahvModus`, 'schaetzung', 'Schätzen lassen', '', 'calc')}${choice(`personen.${i}.ahvModus`, 'betrag', 'Ich kenne den Betrag', 'aus der Rentenvorausberechnung', 'doc')}</div>
              ${p.ahvModus === 'betrag' ? num(`personen.${i}.ahvBetrag`, 'AHV-Rente pro Monat (CHF)', { empty: true, big: true }) : ''}
              ${num(`personen.${i}.ahvFehlJahre`, 'Fehlende Beitragsjahre', { dec: true, help: 'z. B. Jahre im Ausland ohne AHV-Beiträge; sonst 0' })}
              ${sel(`personen.${i}.ahvBezug`, 'AHV beziehen', bezugOpts(i))}
              ${live('ahv' + i)}`;
          })}
          ${tip(`Seit 2026 gibt es jedes Jahr im Dezember eine 13. AHV-Rente. Die Maximalrente beträgt ${chf(P.ahv.maxRente)} pro Monat; dafür braucht es ${P.ahv.beitragsjahre} volle Beitragsjahre und ein durchschnittliches Einkommen von ${chf(P.ahv.einkMax)} oder mehr. Früher beziehen (${gl('vorbezug', 'Vorbezug')}) kürzt die Rente lebenslang, später beziehen (${gl('aufschub', 'Aufschub')}) erhöht sie.`)}`;
      case 'pk':
        return `${head(STEPS[IDX[id]].label, 'Ihre Pensionskasse.', 'Die Angaben stehen auf Ihrem Vorsorgeausweis, meist in einer Tabelle «Altersleistungen» für verschiedene Pensionierungsalter. Nehmen Sie die Zeile für Ihr Wunschalter.')}
          ${forPersons((i) => {
            const p = s.personen[i];
            return `${num(`personen.${i}.pkRente`, `Altersrente mit ${p.pensAlter} (CHF pro Jahr)`, { big: true })}
              ${num(`personen.${i}.pkGuthabenPlan`, `Altersguthaben mit ${p.pensAlter} (CHF)`, { empty: true, ph: 'optional', help: `Steht oft neben der Rente. Kennen Sie nur das Guthaben, schätzen wir die Rente daraus (mit einem üblichen ${gl('umwandlungssatz', 'Umwandlungssatz')}).` })}
              <button type="button" class="bbz-button bbz-button--secondary sm" data-tact="pkschaetzen" data-p="${i}">Rente aus dem Guthaben schätzen</button>
              ${q('Einen Teil als Kapital beziehen?')}
              <div class="tchoices" role="radiogroup" aria-label="Kapitalbezug ${pname(i)}">${action('kap-nein-' + i, 'Nein', 'nur Rente', 'no', !(p.pkKapital > 0))}${action('kap-ja-' + i, 'Ja', 'Betrag festlegen', 'coins', p.pkKapital > 0)}</div>
              ${p.pkKapital > 0 || s.ui[('tkap' + i) as TKap] ? num(`personen.${i}.pkKapital`, 'Kapitalbezug (CHF)') + num(`personen.${i}.pkFrist`, 'Anmeldefrist für den Kapitalbezug (Monate)', { dec: true, empty: true, ph: 'unbekannt', help: 'Steht im Reglement der Pensionskasse, oft 1 bis 3 Jahre vor dem Bezug. Leer lassen, wenn unbekannt; der Aktionsplan rechnet dann mit 3 Jahren.' }) : ''}
              ${live('pk' + i)}`;
          })}
          ${why(`Die Rente ist lebenslang sicher, das ${gl('kapitalbezug', 'Kapital')} gibt Flexibilität, wird aber beim Bezug besteuert und muss angelegt werden. Viele kombinieren beides.`)}`;
      case 's3a':
        return `${head(STEPS[IDX[id]].label, 'Säule 3a und Freizügigkeit.', 'Das ist Ihr gebundenes Vorsorgesparen. Es wird bei der Pensionierung ausbezahlt und besteuert.')}
          ${forPersons((i) => {
            const p = s.personen[i];
            return `${num(`personen.${i}.s3a`, 'Säule 3a heute (CHF)', { big: true, help: 'alle 3a-Konten und -Depots zusammen' })}
              ${q('Zahlen Sie jedes Jahr in die Säule 3a ein?')}
              <div class="tchoices" role="radiogroup" aria-label="3a-Einzahlung ${pname(i)}">${action('3a-max-' + i, 'Ja, das Maximum', chf(P.s3a.maxMitPK) + ' pro Jahr', 'yes', (p.s3aModus || 'max') === 'max' && p.brutto > 0)}${action('3a-teil-' + i, 'Einen Teil', 'eigener Betrag', 'coins', p.s3aModus === 'eigen' && p.s3aEinz > 0)}${action('3a-nein-' + i, 'Nein', '', 'no', p.s3aModus === 'eigen' && !(p.s3aEinz > 0))}</div>
              ${p.s3aModus === 'eigen' && (p.s3aEinz > 0 || s.ui[('t3a' + i) as T3a]) ? num(`personen.${i}.s3aEinz`, 'Einzahlung pro Jahr (CHF)') : ''}
              ${q('Wie ist das 3a-Geld angelegt?')}
              <div class="tchoices" role="radiogroup" aria-label="3a-Anlage ${pname(i)}">${choice(`personen.${i}.s3aAnlage`, 'konto', '3a-Konto', 'mit Zins', 'bank')}${choice(`personen.${i}.s3aAnlage`, 'ausgewogen', '3a-Wertschriften', 'mit Fonds angelegt', 'chart')}</div>
              ${num(`personen.${i}.fz`, 'Freizügigkeitsguthaben (CHF)', { help: `nur falls Sie ein ${gl('freizuegigkeit', 'Freizügigkeitskonto')} haben, sonst 0` })}`;
          })}
          ${tip(`${gl('s3a', '3a-Einzahlungen')} können Sie vom steuerbaren Einkommen abziehen. Wer mehrere 3a-Konten hat, kann sie in verschiedenen Jahren beziehen und so Steuern sparen.`)}`;
      case 'vermoegen':
        return `${head(STEPS[IDX[id]].label, 'Ihr Erspartes.', `Gemeint ist alles, was Sie ${gl('freiesVermoegen', 'frei verwenden')} können: Spar- und Privatkonten sowie Wertschriften. Die Pensionskasse, die Säule 3a und Ihr Eigenheim zählen hier nicht dazu.`)}
          <div class="grid2">${num('liquiditaet', 'Auf Konten (CHF)', { big: true })}${num('wertschriften', 'In Wertschriften (CHF)', { big: true, help: 'Depot, Fonds, Vermögensverwaltung' })}</div>
          ${q('Wie sind Ihre Wertschriften angelegt?')}
          <div class="tchoices" role="radiogroup" aria-label="Anlageprofil">
            ${choice('anlageprofil', 'vorsichtig', 'Vorsichtig', `rund ${dec(P.annahmen.profile.vorsichtig * 100)}% Rendite, wenig Schwankung`, 'shield')}
            ${choice('anlageprofil', 'ausgewogen', 'Ausgewogen', `rund ${dec(P.annahmen.profile.ausgewogen * 100)}% Rendite`, 'chart')}
            ${choice('anlageprofil', 'dynamisch', 'Dynamisch', `rund ${dec(P.annahmen.profile.dynamisch * 100)}% Rendite, mehr Schwankung`, 'rocket')}
          </div>
          ${live('vermoegen')}
          ${why(`Ihr Erspartes muss vor allem die Jahre zwischen Pensionierung und AHV überbrücken. Die Ampel prüft zusätzlich einen ${gl('stresstest', 'Stresstest')} mit 1 Prozentpunkt weniger Rendite.`)}`;
      case 'wohnen': {
        const k = (s.liegenschaften || []).findIndex((l) => (l.typ || 'eigen') === 'eigen');
        const eigen = s.ui.twohnen === 'eigen' || (k >= 0 && s.ui.twohnen !== 'miete');
        return `${head(STEPS[IDX[id]].label, 'Wie wohnen Sie?', `Wohnen ist der grösste Ausgabenposten. Beim Eigenheim prüfen wir zusätzlich, ob die Bank die Hypothek nach der Pensionierung noch als ${gl('tragbarkeit', 'tragbar')} beurteilt.`)}
          <div class="tchoices" role="radiogroup" aria-label="Wohnform">${action('wohnen-eigen', 'Im Eigenheim', 'Haus oder Eigentumswohnung', 'home', eigen)}${action('wohnen-miete', 'Zur Miete', '', 'key', !eigen)}</div>
          ${eigen && k >= 0 ? `<div class="grid2">${num(`liegenschaften.${k}.verkehrswert`, 'Wert der Liegenschaft (CHF)', { big: true, help: 'geschätzter heutiger Verkaufswert' })}${num(`liegenschaften.${k}.hypothek`, 'Hypothek (CHF)', { big: true })}${num(`liegenschaften.${k}.zins`, 'Hypothekarzins (%)', { dec: true })}</div>` : ''}
          ${!eigen ? num('fix.wohnen', 'Miete inkl. Nebenkosten pro Monat (CHF)', { empty: true, ph: 'Richtwert', help: 'Ist bereits in Ihren Ausgaben enthalten; wir verwenden sie für den Vergleich mit den Fixkosten.' }) : ''}
          ${live('wohnen')}`;
      }
      case 'wuensche': {
        const has = (key: string) => (s.wuensche || []).findIndex((w) => w.tkey === key);
        return `${head(STEPS[IDX[id]].label, 'Was möchten Sie sich im Ruhestand gönnen?', 'Wählen Sie, was für Sie dazugehört. Wir zeigen Ihnen danach, was jeder Wunsch kostet.')}
          <div class="tchoices" role="group" aria-label="Wünsche">${Object.entries(WISH).map(([key, w]) => action('wish-' + key, w.title, w.sub, w.icon, has(key) >= 0, 'checkbox')).join('')}</div>
          ${Object.entries(WISH).map(([key, w]) => {
            const k = has(key);
            if (k < 0) return '';
            const x = s.wuensche[k];
            if (x.typ === 'jahr') return `<div class="tperson"><div class="tph">${w.title}</div><div class="grid3">${num(`wuensche.${k}.betrag`, 'CHF pro Jahr')}${num(`wuensche.${k}.von`, 'ab Alter', { dec: true })}${num(`wuensche.${k}.bis`, 'bis Alter', { dec: true })}</div></div>`;
            if (x.typ === 'einmal') return `<div class="tperson"><div class="tph">${w.title}</div><div class="grid2">${num(`wuensche.${k}.betrag`, 'Betrag (CHF)')}${num(`wuensche.${k}.alter`, 'mit Alter', { dec: true })}</div></div>`;
            if (x.typ === 'ausland') return `<div class="tperson"><div class="tph">${w.title}</div><div class="grid3">${num(`wuensche.${k}.monate`, 'Monate pro Jahr', { dec: true })}${num(`wuensche.${k}.von`, 'ab Alter', { dec: true })}${num(`wuensche.${k}.miete`, 'Miete dort pro Monat (CHF)')}</div></div>`;
            return `<div class="tperson"><div class="tph">${w.title}</div>${num(`wuensche.${k}.betrag`, 'Betrag, der am Schluss übrig bleiben soll (CHF, heutige Kaufkraft)')}</div>`;
          }).join('')}
          ${weitereWuensche()}
          ${tip('Die Alter beziehen sich auf ' + (cpl() ? 'Person 1' : 'Sie') + '. Im Formular lassen sich weitere Wünsche detailliert erfassen, etwa ein Kauf im Ausland.')}`;
      }
      case 'sofort':
        return `${head(STEPS[IDX[id]].label, 'Was wäre, wenn Sie jetzt aufhören?', `${cpl() ? 'Wählen Sie, wer früher aufhört, und schieben' : 'Schieben'} Sie den Regler auf den letzten Arbeitstag. Ihr Ziel: der früheste Zeitpunkt, an dem die Ampel grün wird. Ihr Plan aus den bisherigen Schritten bleibt dabei unverändert.`)}
          <div class="wi-ctrlbox">${ctrlHtml(app)}</div>
          <div class="wi-live" data-live="sofort" aria-live="polite">${summaryHtml(app)}</div>
          ${why(`Wer früher aufhört, verzichtet auf Lohn und Vorsorgebeiträge und muss die Zeit bis zur AHV aus dem Ersparten überbrücken. Vor ${app.P.bvg.minAlter} zahlt die Pensionskasse keine Rente; Säule 3a und Freizügigkeit sind erst ${app.P.vorsorge.bezugJahreVorRef} Jahre vor dem AHV-Referenzalter verfügbar. Gerechnet wird mit denselben Annahmen wie Ihr Plan, inklusive Stresstest. Wer laut Plan ohnehin früher aufhört, wird mit seinem geplanten Datum gerechnet.`, 'Wie wird das gerechnet?')}`;
      case 'ergebnis':
        return resultBody();
      default:
        return '';
    }
  }

  /** Wünsche, die nur im Formular erfasst sind: im Tutor nennen, damit die Rechnung nachvollziehbar bleibt. */
  function weitereWuensche() {
    const w = (S().wuensche || []).filter((x) => !x.tkey);
    if (!w.length) return '';
    const liste = w.map((x) => `${esc(x.name || 'Wunsch')}${x.aktiv === false ? ' (ausgeschaltet)' : ''}`).join(', ');
    return `<p class="cap"><b>Zusätzlich im Formular erfasst:</b> ${liste}. ${w.some((x) => x.aktiv !== false) ? 'Diese Wünsche sind eingerechnet; ändern lassen sie sich im Formular.' : ''}</p>`;
  }

  function bezugOpts(i: number) {
    const p = S().personen[i], e = E();
    return [-3, -2, -1, 0, 1, 2, 3, 4, 5].filter((b) => b >= -e.maxVorbezug(p)).map((b) => [b, b === 0 ? 'zum Referenzalter' : b < 0 ? `${-b} Jahr${b < -1 ? 'e' : ''} früher (Rente -${dec((1 - e.ahvFaktor(b, p)) * 100)}%)` : `${b} Jahr${b > 1 ? 'e' : ''} später (Rente +${dec(app.P.ahv.aufschub[b] * 100)}%)`]);
  }

  /** Tragbarkeit (F1) mit der Rechenvariante; leer ohne Liegenschaft. */
  const tragHtml = (r: Auswertung) => `${tragKurzHtml(r.tr, S())}${r.tr ? varianteHtml(r.vs, S(), E()) : ''}`;
  /**
   * Neue Rechnung im Ergebnis-Schritt: Steht das Urteil schon in der Karte, nur die Tragbarkeit erneuern. Das Urteil
   * (mit seiner Live-Region) bleibt dabei im Baum, damit Bildschirmleser die neue Aussage ansagen; sonst neu aufbauen.
   */
  function onResult() {
    if (step() !== 'ergebnis') { updateLive(); return; }
    const r = app.R, platz = root.querySelector<HTMLElement>('[data-tkopf]'), trag = root.querySelector<HTMLElement>('[data-ttrag]');
    if (!r || r.leer || !platz || !trag || !platz.contains(document.getElementById('urteilBlock')) || S().ui.mode !== 'tutor') { render(); return; }
    const html = tragHtml(r);
    if (trag.innerHTML !== html) {
      const fokus = trag.contains(document.activeElement);
      trag.innerHTML = html;
      if (fokus) trag.querySelector<HTMLElement>('[data-apply]')?.focus();
    }
    updateLive();
  }

  /**
   * Einleitung des Ergebnisses: Überschrift und Satz, darunter das Urteil der Bühne (Platz [data-tkopf], buehne.js setzt
   * #urteilBlock und #kpis ein), dann Tragbarkeit (F1) mit der Rechenvariante und der Rückweg. Bild, Aktionsplan,
   * Ansatzpunkte, Themen und Abschluss folgen in #results; die Tragbarkeit steht am Bildschirm nur hier.
   */
  function resultBody() {
    const r = app.R;
    if (!r || r.leer) {
      return `${head('Ergebnis', 'Fast geschafft.', 'Für eine Rechnung fehlen noch Ihre Ausgaben im Ruhestand.')}<button type="button" class="bbz-button bbz-button--primary" data-tgo="ausgaben">Ausgaben erfassen</button>`;
    }
    return `${head('Ergebnis', 'Ihre Einschätzung.', 'So steht es um Ihre Pläne. Darunter finden Sie Ansatzpunkte zum Prüfen und den Weg zu allen Details.')}
      <div class="tkopf" data-tkopf></div>
      <div class="tresult">
        <div class="ttrag" data-ttrag>${tragHtml(r)}</div>
        <div class="tactions">
          <button type="button" class="bbz-button bbz-button--secondary" data-tgo="haushalt">Angaben ändern</button>
          <button type="button" class="bbz-button bbz-button--ghost" data-tact="toform">Im Formular verfeinern</button>
        </div>
        <p class="tdone-note">Probieren Sie aus: Gehen Sie zurück zu «Wunsch-Pensionierung» oder «Ausgaben» und beobachten Sie, wie sich die Ampel verändert.</p>
      </div>`;
  }

  // ---------- Live-Rückmeldungen ----------
  function updateLive() {
    const s = S(), e = E(), P = app.P, hz = horizon(s, e);
    const set = (key: string, html: string) => { const el = root.querySelector(`[data-live="${key}"]`); if (el && el.innerHTML !== html) el.innerHTML = html; };
    persons().forEach((i) => {
      const p = s.personen[i];
      const alter = e.BASIS - p.jahrgang, ref = e.refAlter(p), le = e.leAlter(p);
      const refTxt = ref % 1 ? `${Math.floor(ref)} Jahre und ${Math.round((ref % 1) * 12)} Monate` : `${ref} Jahre`;
      set('person' + i, `Alter heute: <b>${alter} Jahre</b>. AHV-Referenzalter: <b>${refTxt}</b>. Durchschnittliche Lebenserwartung laut BFS: <b>rund ${Math.round(le)} Jahre</b>; gerechnet wird bis ${hz.horizontP[i]}.`);
      const Ar = e.abAlter(p, p.pensAlter), bis = Ar - e.A0;
      const ahvAb = ref - p.pensAlter;
      let ptxt = bis > 0 ? `Pensionierung im <b>${MONATE[Ar % 12]} ${Math.floor(Ar / 12)}</b>, in ${Math.floor(bis / 12)} Jahren${bis % 12 ? ` und ${bis % 12} Monaten` : ''}.` : '<b>Sofort</b>: Das Wunschalter ist bereits erreicht.';
      if (ahvAb > 0) ptxt += ` Bis zur AHV dauert es danach noch rund ${dec(ahvAb, ahvAb % 1 ? 1 : 0)} Jahre.`;
      const vorMin = bis >= 0 && p.pensAlter < (p.minAlter || P.bvg.minAlter);
      if (vorMin) ptxt += ` <b>Hinweis:</b> Vor ${p.minAlter || P.bvg.minAlter} gibt es keine Leistung der Pensionskasse; das Guthaben geht auf ein Freizügigkeitskonto.`;
      set('pension' + i, ptxt);
      // dieselbe Schätzung wie in der Rechnung: bei Ehepaaren mit Einkommensteilung und Plafond
      const plEst = e.ahvPlan({ ...s, personen: s.personen.map((x, j) => ({ ...x, ahvBezug: 0, ...(j === i ? { ahvModus: 'schaetzung' } : {}) })) } as PensState);
      const ahvEst = plEst.dauer[i] - plEst.zuschlag[i], verh = s.haushalt === 'verheiratet';
      set('lohn' + i, p.brutto > 0 ? `Daraus schätzen wir die AHV-Rente auf <b>${chf(ahvEst)} pro Monat</b>${verh ? `, sobald beide das Referenzalter erreicht haben (Einkommen geteilt; sobald beide eine Rente beziehen, zusammen höchstens ${chf(P.ahv.plafondEhepaar)})` : ahvEst >= P.ahv.maxRente - 1 ? ' (Maximalrente)' : ''}.` : 'Ohne Erwerbseinkommen rechnen wir mit der AHV-Minimalrente, sofern keine Beitragslücken bestehen.');
      const plan = e.ahvPlan(s), ahv = plan.dauer[i] - plan.zuschlag[i], zs = plan.zuschlag[i];
      set('ahv' + i, `Ihre AHV-Rente: <b>${chf(ahv + zs)} pro Monat</b>, mit der 13. Rente <b>${chf(ahv * P.ahv.monatsrentenProJahr + zs * 12)} pro Jahr</b>${zs > 0 ? ` (darin ${chf(zs)} Rentenzuschlag der Übergangsgeneration)` : ''}.${plan.plafoniert ? ` Gerechnet für die Zeit, in der beide das Referenzalter erreicht haben: mit Einkommensteilung und begrenzt auf zusammen ${chf(P.ahv.plafondEhepaar)} pro Monat.` : ''}`);
      const tot = +p.pkRente || 0;
      set('pk' + i, vorMin && (p.pkRente > 0 || p.pkKapital > 0 || (p.pkGuthabenPlan as number) > 0) ? `Mit ${p.pensAlter} gibt es noch keine Leistung der Pensionskasse (frühestens mit ${p.minAlter || P.bvg.minAlter}): Gerechnet wird das Guthaben als Freizügigkeit, nicht die hier erfasste Rente oder das Kapital.` : p.pkRente > 0 ? `Das sind <b>${chf(p.pkRente / 12)} pro Monat</b> aus der Pensionskasse${p.pkKapital > 0 ? `, dazu einmalig ${chf(p.pkKapital)} Kapital` : ''}.` : tot === 0 && !(p.pkKapital > 0) ? 'Noch keine Leistung erfasst. Ohne Pensionskasse rechnen wir nur mit AHV und Erspartem.' : `Kapitalbezug ${chf(p.pkKapital)}.`);
    });
    const fixTyp = cpl() ? 'paar' : 'single', erf = P.annahmen.erfahrung[fixTyp];
    const a = +s.ausgabenRuhestand || 0;
    const bsum = budgetVoll(s) ? budgetSumme(s, e) : null;
    set('ausgaben', a > 0
      ? s.budgetAktiv
        ? `<b>${chf(a)} pro Monat</b> aus Ihrem Budget, also ${chf(a * 12)} pro Jahr. <button type="button" class="linkbtn" data-tact="budget-open">Budget ansehen</button>`
        : `<b>${chf(a)} pro Monat</b>, also ${chf(a * 12)} pro Jahr. Zum Vergleich: Richtwert «${STUFEN.mittel}» für ${cpl() ? 'Paare' : 'Alleinstehende'} ${chf(erf.mittel)}.${bsum != null && bsum !== a ? ` Ihr Budget ergab ${chf(bsum)}; Sie haben den Betrag von Hand angepasst. <button type="button" class="linkbtn" data-tact="budget-apply">Budget wieder übernehmen</button>` : ''}`
      : 'Noch keine Ausgaben erfasst.');
    if (imBudget()) {
      const wm = fixHelpers(s, e).wohnenMonat(null);
      set('bwohnen', `Wohnkosten: <b>${chf(wm.v)} pro Monat</b>${wm.art === 'eigene Angabe' ? ' (Ihre Angabe bei den Fixkosten)' : ' aus Hypothekarzins, Unterhalt und Nebenkosten'}.`);
      set('budgettop', `Total: <b>${chf(bsum ?? 0)} pro Monat</b>${basisText(s, P.annahmen.musterbudget[fixTyp]) ? ` · ${basisText(s, P.annahmen.musterbudget[fixTyp])}` : ''}`);
      set('budgetsum', `Ihr Budget: <b>${chf(bsum ?? 0)} pro Monat</b>, also ${chf((bsum ?? 0) * 12)} pro Jahr.${s.budgetAktiv ? ' Gilt als Ihre Ausgaben im Ruhestand.' : a > 0 ? ` Bisher angenommen: ${chf(a)}.` : ''}`);
    }
    set('lohncheck', lohnCheckHtml(ausgabenCheck(s, e), cpl()));
    const V = (+s.liquiditaet || 0) + (+s.wertschriften || 0);
    set('vermoegen', `Freies Vermögen total: <b>${chf(V)}</b>${V > 0 ? `, davon ${Math.round(e.liqAnteil(s) * 100)}% auf Konten` : ''}.`);
    const k = (s.liegenschaften || []).findIndex((l) => (l.typ || 'eigen') === 'eigen');
    if (k >= 0 && s.ui.twohnen !== 'miete') {
      const l = s.liegenschaften[k], bel = l.verkehrswert > 0 ? (l.hypothek || 0) / l.verkehrswert : 0;
      set('wohnen', `Eigenkapital in der Liegenschaft: <b>${chf((l.verkehrswert || 0) - (l.hypothek || 0))}</b>, Belehnung ${dec(bel * 100, 0)}%. Zins pro Jahr rund ${chf((l.hypothek || 0) * (l.zins || 0) / 100)}.`);
    } else set('wohnen', 'Die Miete ist Teil Ihrer Ausgaben. Für den Vergleich mit den Renten verwenden wir Ihren Betrag oder einen Richtwert.');
    const wl = root.querySelector('[data-live="sofort"]');
    if (wl) { wl.innerHTML = summaryHtml(app); wl.removeAttribute('aria-busy'); }
    const box = root.querySelector('.wi-ctrlbox'), rng = box?.querySelector('[data-wi-range]');
    if (box && document.activeElement !== rng) box.innerHTML = ctrlHtml(app);
    renderSide();
  }

  // ---------- Seitenleiste: Fortschritt und Ampel ----------
  function renderSide() {
    const side = root.querySelector('.tside');
    if (!side) return;
    const cur = IDX[step()], max = S().ui.tutorMax ?? 0, r = app.R;
    let status;
    // Im Ergebnis-Schritt steht das Urteil schon gross daneben: hier nicht wiederholen
    if (step() === 'ergebnis') status = '';
    else if (!r || r.leer) status = `<div class="tstatus"><span class="ts-h">Ihr Plan</span><p>Die Ampel erscheint, sobald Ihre Ausgaben erfasst sind.</p></div>`;
    else {
      const st = r.amp.st;
      status = `<div class="tstatus" aria-live="polite"><span class="ts-h">Ihr Plan</span><div class="ts-row"><div class="lamp" data-st="${st}" aria-hidden="true"><i></i><i></i><i></i></div><span class="pill" data-st="${st}">${{ gruen: 'Reicht', gelb: 'Knapp', rot: 'Reicht nicht' }[st]}</span></div><p>Tragbar wären <span class="ts-fig">${chf(r.maxA)}</span> pro Monat.</p><p class="cap">${r.base.depleted != null ? `Das Vermögen ist mit ${r.base.depleted} aufgebraucht` : `Das Vermögen reicht über Alter ${r.horizont} hinaus`}${cpl() ? ' (Alter Person 1)' : ''}. Wird mit jeder Angabe genauer.</p></div>`;
    }
    side.classList.toggle('early', !r || r.leer);
    side.classList.toggle('none', step() === 'start');
    const cls = (i: number) => (i === cur ? 'cur' : i < cur || i <= max ? 'done' : 'todo');
    side.innerHTML = `${status}<ol class="tchecklist" aria-label="Schritte">${STEPS.map((x, i) => `<li><button type="button" data-tgo="${x.id}" class="${cls(i)}"${i === cur ? ' aria-current="step"' : ''}${i > max && i !== cur ? ' disabled' : ''}><span class="mk" aria-hidden="true"></span>${x.label}</button></li>`).join('')}</ol>`;
  }

  // ---------- Darstellung ----------
  function render(focus = false) {
    const id = step(), i = IDX[id], n = STEPS.length - 1;
    const s = S();
    if (budgetOffen && !s.ui.entwurf) budgetOffen = false;
    if (i > (s.ui.tutorMax ?? 0)) { s.ui.tutorMax = i; app.persist(); }
    document.body.dataset.tstep = id;
    // Im Ergebnis-Schritt stehen die Bausteine der Bühne (#results) immer unter der Einleitung
    if (id === 'ergebnis') document.body.dataset.tdetails = '1'; else delete document.body.dataset.tdetails;
    // Fortschritt: ein Punkt pro Schritt (der Punkt aus dem Logo), danach das Ergebnis
    const total = n - 1, nr = Math.min(i, total), rest = total - i;
    const lbl = id === 'ergebnis' ? `Alle ${total} Schritte erledigt` : `Schritt <b>${nr}</b> von ${total}: ${STEPS[i].label}`;
    const sub = id === 'ergebnis' ? '' : rest > 0 ? `noch ${rest} Schritt${rest === 1 ? '' : 'e'} bis zum Ergebnis` : 'als Nächstes: Ihr Ergebnis';
    const reach = (k: number) => k <= s.ui.tutorMax || k === i;
    const dot = (x: { id: string; label: string }, k: number, txt = '') => `<button type="button" data-tgo="${x.id}" aria-label="${x.label}"${k === i ? ' aria-current="step"' : ''}${reach(k) ? '' : ' disabled'} class="${txt ? 'tres ' : ''}${k === i ? 'cur' : k < i || k <= s.ui.tutorMax ? 'done' : ''}">${txt}</button>`;
    const prog = id === 'start' ? '' : `<div class="tprog"><div class="tsteps">${STEPS.slice(1, -1).map((x, k) => dot(x, k + 1)).join('')}${dot(STEPS[n], n, 'Ergebnis')}</div><div class="tp-head"><span>${lbl}</span>${sub ? `<span class="tp-sub">${sub}</span>` : ''}</div></div>`;
    const nav = id === 'start' || imBudget() ? '' : `<div class="tnav"><button type="button" class="bbz-button bbz-button--ghost" data-tnav="back">Zurück</button><span class="grow"></span>${id !== 'ergebnis' ? `<button type="button" class="bbz-button bbz-button--primary" data-tnav="next">${i === n - 1 ? 'Zum Ergebnis' : 'Weiter'}</button>` : ''}</div>`;
    // Das Urteil der Bühne steht im Ergebnis-Schritt in der Karte: vor dem Neuaufbau zurück nach #results, danach wieder hinein
    app.buehne?.kopfHeim();
    root.innerHTML = `<div class="tcard">${prog}<div class="tstep">${body(id)}</div>${nav}${s.ui.practice && id !== 'start' ? '<p class="cap tnote">Sie üben mit dem Musterfall. Über «Start» beginnen Sie jederzeit mit Ihren eigenen Angaben.</p>' : ''}</div><aside class="tside" aria-label="Fortschritt und Zwischenstand"></aside>`;
    if (s.ui.mode === 'tutor') app.buehne?.kopfIn(root.querySelector('[data-tkopf]'));
    updateLive();
    if (focus) {
      const h = root.querySelector('h2');
      h?.focus({ preventScroll: true });
      const top = root.getBoundingClientRect().top + window.scrollY - 12;
      if (Math.abs(window.scrollY - top) > 40) window.scrollTo({ top, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
  }

  function go(id: string) {
    if (IDX[id] == null) return;
    if (entwurfBeenden()) app.stopChanged();
    S().ui.tutorStep = id;
    app.persist();
    render(true);
  }
  const next = () => go(STEPS[Math.min(STEPS.length - 1, IDX[step()] + 1)].id);
  const back = () => go(STEPS[Math.max(0, IDX[step()] - 1)].id);

  // ---------- Aktionen ----------
  async function act(a: string, btn: HTMLElement) {
    const s = S();
    const m = a.match(/^(kap|3a)-(\w+)-(\d)$/);
    // Rückfrage, bevor erfasste Angaben verloren gehen
    if ((a === 'own' || a === 'practice') && app.hatEigenes()) {
      const ok = a === 'own'
        ? await app.confirm('Neu beginnen?', 'Alle Angaben auf diesem Gerät werden gelöscht.', 'Ja, alles löschen')
        : await app.confirm('Mit dem Beispiel üben?', 'Ihre erfassten Angaben auf diesem Gerät werden durch den Musterfall ersetzt.');
      if (!ok) return;
    }
    if (a === 'wohnen-miete' && !s.ui.practice) {
      const eig = s.liegenschaften.map((l, k): [Liegenschaft, number] => [l, k]).filter(([l]) => (l.typ || 'eigen') === 'eigen');
      if (eig.length) {
        const nAm = s.amortisationen.filter((x) => eig.some(([, k]) => k === x.lg)).length;
        const was = `${eig.length === 1 ? `Die Liegenschaft «${eig[0][0].name || 'Eigenheim'}»` : `${eig.length} selbst bewohnte Liegenschaften`}${nAm ? ` und ${nAm} Amortisation${nAm > 1 ? 'en' : ''}` : ''}`;
        if (!(await app.confirm('Zur Miete wechseln?', `${was} ${eig.length === 1 && !nAm ? 'wird' : 'werden'} aus Ihren Angaben entfernt.`, 'Ja, entfernen'))) return;
      }
    }
    if (a === 'own') {
      const ns = emptyState();
      Object.assign(ns.ui, { mode: 'tutor', tutorStep: 'haushalt', tutorMax: 1, practice: false, edited: true });
      ns.personen.forEach((p) => { p.jahrgang = app.E.BASIS - 55; p.geburtsmonat = 6; p.pensAlter = 63; p.minAlter = app.P.bvg.minAlter; });
      ns.personen[1].geschlecht = 'w';
      ns.ausgabenRuhestand = 0;
      app.replaceState(ns);
      render(true);
      return;
    }
    if (a === 'practice') {
      const ns = migrate(clone(EXAMPLE));
      Object.assign(ns.ui, { mode: 'tutor', tutorStep: 'haushalt', tutorMax: STEPS.length - 1, practice: true, edited: false });
      app.replaceState(ns);
      render(true);
      return;
    }
    if (a === 'resume') { go('haushalt'); return; }
    if (a === 'neben-ja' || a === 'neben-nein') {
      const k = s.einkommen.findIndex((x) => x.tkey === 'neben');
      if (a === 'neben-ja' && k < 0) s.einkommen.push({ person: 0, art: 'nebenerwerb', betrag: 20000, bisJahr: 0, text: 'nach der Pensionierung', tkey: 'neben', abPens: true });
      if (a === 'neben-nein' && k >= 0) s.einkommen.splice(k, 1);
    } else if (m && m[1] === 'kap') {
      const p = s.personen[+m[3]];
      if (m[2] === 'nein') { p.pkKapital = 0; s.ui[('tkap' + m[3]) as TKap] = false; } else { s.ui[('tkap' + m[3]) as TKap] = true; if (!(p.pkKapital > 0)) p.pkKapital = 100000; }
    } else if (m && m[1] === '3a') {
      const p = s.personen[+m[3]];
      if (m[2] === 'max') { p.s3aModus = 'max'; s.ui[('t3a' + m[3]) as T3a] = false; }
      else if (m[2] === 'teil') { p.s3aModus = 'eigen'; s.ui[('t3a' + m[3]) as T3a] = true; if (!(p.s3aEinz > 0) || p.s3aEinz >= app.P.s3a.maxMitPK) p.s3aEinz = 3000; }
      else { p.s3aModus = 'eigen'; p.s3aEinz = 0; s.ui[('t3a' + m[3]) as T3a] = false; }
    } else if (a === 'pkschaetzen') {
      const i = +btn.dataset.p!, p = s.personen[i], A = app.P.annahmen;
      if ((p.pkGuthabenPlan as number) > 0) {
        const uws = (A.uws65 - A.uwsProJahr * Math.max(0, 65 - p.pensAlter)) / 100;
        p.pkRente = Math.round((((p.pkGuthabenPlan as number) - (+p.pkKapital || 0)) * uws) / 100) * 100;
      } else { const el = root.querySelector<HTMLElement>(`[data-tpath="personen.${i}.pkGuthabenPlan"]`); el?.focus(); return; }
    } else if (a === 'budget-open') {
      // Start mit dem Musterbudget, das dem bisherigen Betrag am nächsten liegt; gilt erst nach «Übernehmen»
      entwurfNeu = !budgetVoll(s);
      s.ui.entwurf = { budget: { ...(s.budget || {}) }, basis: s.budgetBasis, miete: s.fix.wohnen ?? '' };
      if (entwurfNeu) ladeMuster(s, naechstesMuster(s, app.E));
      budgetOffen = true;
      app.persist();
      render(true);
      return;
    } else if (a === 'budget-preset') {
      // ausdrücklich gewählt: Bei Miete gilt auch die Miete des Beispiels
      ladeMuster(s, btn.dataset.k!, true);
      const eig = hatEigenheim(s, app.E);
      app.toast(`Beispiel «${STUFEN[btn.dataset.k as Stufe]}» geladen: ${chf(budgetSumme(s, app.E))} pro Monat.${eig ? ' Wohnen bleibt gemäss Ihrer Liegenschaft.' : ''}`);
    } else if (a === 'budget-apply') {
      if (!budgetVoll(s)) return;
      // Die Miete aus dem Budget gilt auch für den Vergleich mit den Fixkosten
      if (!hatEigenheim(s, app.E) && s.budget.wohnen != null) s.fix.wohnen = s.budget.wohnen;
      s.budgetAktiv = true;
      delete s.ui.entwurf;
      budgetOffen = false;
      app.changed();
      render(true);
      return;
    } else if (a === 'budget-close') {
      // in dieser Sitzung neu begonnen und nicht übernommen: Entwurf verwerfen
      // nicht übernommen: Budget, Grundlage und Miete gelten wieder wie vor dem Öffnen (ein aktives Budget bleibt)
      if (entwurfBeenden()) app.stopChanged();
      app.persist();
      render(true);
      return;
    } else if (a === 'wohnen-eigen') {
      s.ui.twohnen = 'eigen';
      if ((s.fix.wohnen as NumLeer) !== '' && s.fix.wohnen != null) {
        const vorher = s.ui.entwurf && !s.budgetAktiv ? (s.ui.entwurf as Entwurf).miete : s.fix.wohnen;
        mieteVorEigenheim = vorher !== '' && vorher != null ? { s, wert: vorher } : null;
        (s.fix as FixLeer).wohnen = '';
      }
      if (!s.liegenschaften.some((l) => (l.typ || 'eigen') === 'eigen')) {
        s.liegenschaften.unshift({ name: 'Eigenheim', typ: 'eigen', verkehrswert: 900000, hypothek: 500000, zins: 1.8, unterhalt: 0.5, nebenkosten: 400, mietertrag: 0, verkaufAlter: 0 });
        // Das neue Eigenheim steht vorne: Karten und Amortisationen zeigen danach eine Stelle weiter
        liegenschaftEingefuegt(s, 0);
      }
    } else if (a === 'wohnen-miete') {
      s.ui.twohnen = 'miete';
      if (((s.fix.wohnen as NumLeer) === '' || s.fix.wohnen == null) && mieteVorEigenheim && mieteVorEigenheim.s === s) s.fix.wohnen = mieteVorEigenheim.wert;
      mieteVorEigenheim = null;
      const keep = s.liegenschaften.map((l, k): [Liegenschaft, number] => [l, k]).filter(([l]) => (l.typ || 'eigen') !== 'eigen');
      const map = new Map(keep.map(([, k], n) => [k, n]));
      // Karten und Amortisationen der entfernten Eigenheime fallen weg, die übrigen rücken auf (von hinten, solange die
      // Liste noch die alte ist)
      s.liegenschaften.map((_l, k) => k).filter((k) => !map.has(k)).reverse().forEach((k) => liegenschaftEntfernt(s, k));
      s.liegenschaften = keep.map(([l]) => l);
    } else if (a.startsWith('wish-')) {
      const key = a.slice(5), k = s.wuensche.findIndex((w) => w.tkey === key);
      // Entfernen über die Themen: Bezüge auf spätere Wünsche rücken nach
      if (k >= 0) themaEntfernen(s, `w${k}`);
      else { const w = WISH[key].make(); w.tkey = key as Wunsch['tkey']; if (w.von) w.von = Math.max(w.von, s.personen[0].pensAlter); s.wuensche.push(w); }
    } else if (a === 'toform') { app.setMode('form'); return; }
    app.changed();
    render();
    restoreFocus(btn);
  }
  /** Musterbudget in den Entwurf laden; die Miete nur, wenn keine eigene erfasst ist bzw. das Budget bereits gilt. */
  function ladeMuster(s: PensState, k: string, mitMiete = false) {
    const mb = app.P.annahmen.musterbudget[cpl() ? 'paar' : 'single'][k];
    if (!mb) return;
    const erfasst = (s.fix.wohnen as NumLeer) !== '' && s.fix.wohnen != null;
    const miete = erfasst && !mitMiete ? +s.fix.wohnen : mb.wohnen;
    s.budget = { ...Object.fromEntries(BUDGET_KEYS.map((p) => [p, mb[p]])), wohnen: miete };
    s.budgetBasis = k as PensState['budgetBasis'];
    // eine bereits erfasste Miete folgt dem Beispiel (nicht beim Eigenheim: dort gilt die Liegenschaft)
    if (mitMiete && !hatEigenheim(s, app.E) && (erfasst || s.budgetAktiv)) s.fix.wohnen = miete;
  }
  function restoreFocus(btn: HTMLElement) {
    if (!btn) return;
    const sel = btn.dataset.tact ? `[data-tact="${btn.dataset.tact}"]${btn.dataset.p != null ? `[data-p="${btn.dataset.p}"]` : ''}${btn.dataset.k != null ? `[data-k="${btn.dataset.k}"]` : ''}` : btn.dataset.tset ? `[data-tset="${btn.dataset.tset}"][data-val='${btn.dataset.val}']` : null;
    if (sel) root.querySelector<HTMLElement>(sel)?.focus();
  }

  // ---------- Ereignisse ----------
  root.addEventListener('click', (ev) => {
    const b = (ev.target as Element).closest('button');
    if (!b) return;
    const d = b.dataset as Daten, s = S();
    if (d.apply) app.varianteUebernehmen?.();
    else if (d.tnav === 'next') next();
    else if (d.tnav === 'back') back();
    else if (d.tgo) go(d.tgo);
    else if (d.tact) act(d.tact, b);
    else if (d.tset) {
      const v = JSON.parse(d.val);
      if (d.tset === 'ausgabenRuhestand') s.budgetAktiv = false;
      setPath(s, d.tset, v);
      if (d.tset === 'haushalt') zielWeg(s);
      s.ui.edited = true; s.ui.practice = false;
      if (d.tset.endsWith('.geschlecht')) { const p = s.personen[+d.tset.split('.')[1]]; const e = E(); if (p.ahvBezug < -e.maxVorbezug(p)) p.ahvBezug = -e.maxVorbezug(p); }
      app.changed();
      render();
      restoreFocus(b);
    } else if (d.rstep) {
      const el = root.querySelector<HTMLInputElement>(`input[type=range][data-tpath="${d.rstep}"]`);
      if (el) reglerSchritt(el, +d.d, { offen: !!d.offen });
    } else if (d.tinc) {
      const cur = +getPath(s, d.tinc) || 0, v = Math.max(+d.min, Math.min(+d.max, cur + +d.d));
      setPath(s, d.tinc, v);
      s.ui.edited = true; s.ui.practice = false;
      const inp = root.querySelector<HTMLInputElement>(`input[data-tpath="${d.tinc}"]`);
      if (inp) { inp.value = v as unknown as string; clearErr(inp); }
      app.changed({ soft: true });
      updateLive();
    }
  });
  root.addEventListener('input', (ev) => {
    const el = ev.target as HTMLInputElement, d = el.dataset as Daten, s = S();
    if (!d.tpath) return;
    let v: number | string;
    if (d.sel) v = /^-?\d+(\.\d+)?$/.test(el.value) ? Number(el.value) : el.value;
    else if (d.range) v = Number(el.value);
    else {
      // Ungültiges (keine Zahl, ausserhalb des Wertebereichs) wird nicht gespeichert; der Grund steht beim Feld
      const key = d.tpath.split('.').pop()!, scope = d.tpath.startsWith('wuensche.') ? 'w' : null;
      const r = readNum(el, key, scope);
      let msg = r.ok ? null : r.msg;
      v = r.v as NumLeer;
      if (r.ok && v === '' && !d.empty) { v = 0; if (rangeError(key, 0, scope!)) msg = 'Bitte einen Wert eingeben.'; }
      if (msg) { setErr(el, msg); return; }
      clearErr(el);
    }
    // Betrag von Hand gesetzt: Das Budget gilt nicht mehr (bleibt aber gespeichert)
    if (d.tpath === 'ausgabenRuhestand' && s.budgetAktiv) { s.budgetAktiv = false; root.querySelector('[data-tact="budget-open"]')?.setAttribute('aria-checked', 'false'); }
    setPath(s, d.tpath, v);
    // Miete im Budget: gilt auch als Miete für den Vergleich mit den Fixkosten, sobald dort eine erfasst ist oder das Budget gilt
    if (d.tpath === 'budget.wohnen' && (s.budgetAktiv || ((s.fix.wohnen as NumLeer) !== '' && s.fix.wohnen != null))) s.fix.wohnen = v as number;
    s.ui.edited = true; s.ui.practice = false;
    // gekoppelte Regler und Felder nachführen
    root.querySelectorAll<HTMLInputElement>(`[data-tpath="${d.tpath}"]`).forEach((o) => {
      if (o === el) return;
      if (o.dataset.range) { o.value = v as string; o.setAttribute('aria-valuetext', d.tpath.endsWith('pensAlter') ? `${v} Jahren` : chf(v as number)); }
      else if (!o.dataset.sel) o.value = fmtIn(v, o.dataset.dec as unknown as boolean);
    });
    const out = root.querySelector(`[data-rout="${d.tpath}"]`);
    if (out) {
      const isAlter = d.tpath.endsWith('pensAlter');
      out.textContent = isAlter ? `${v} Jahren` : chf(v as number);
      if (d.range) el.setAttribute('aria-valuetext', out.textContent);
    }
    root.querySelectorAll<HTMLElement>(`.tchoice[data-tset="${d.tpath}"]`).forEach((c) => c.setAttribute('aria-checked', (String(JSON.parse(c.dataset.val!)) === String(v)) as unknown as string));
    app.changed({ soft: true });
    updateLive();
    if (d.sel && d.tpath === 'kanton') return;
    if (d.tpath.endsWith('.pensAlter') && step() === 'pension') return;
  });
  root.addEventListener('change', (ev) => {
    const el = ev.target as HTMLElement;
    // Pensionsalter beeinflusst Beschriftungen in späteren Schritten; Haushalt die Personenblöcke
    if (el.dataset.tpath && /pensAlter|ahvBezug|ahvModus/.test(el.dataset.tpath) && step() !== 'pension') render();
  });
  root.addEventListener('focusout', (ev) => {
    const el = ev.target as HTMLInputElement, d = (el.dataset || {}) as Daten;
    // Ungültige Eingabe: zuletzt gültigen Wert wieder einsetzen und sagen, dass und warum
    if (d.tpath && el.tagName === 'INPUT' && !d.range) { const shown = fmtIn(getPath(S(), d.tpath), d.dec as unknown as boolean); if (!revertErr(el, shown)) el.value = shown; }
  });
  root.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && (ev.target as HTMLInputElement).tagName === 'INPUT' && (ev.target as HTMLInputElement).type !== 'range') {
      ev.preventDefault();
      // Ungültige Eingabe: beim Feld bleiben, die Meldung steht direkt darunter
      if ((ev.target as HTMLInputElement).classList.contains('bad')) { (ev.target as HTMLInputElement).select?.(); return; }
      if (!imBudget()) next();
    }
  });

  (bindWhatIf as (root: HTMLElement, app: App) => void)(root, app);

  return { render, updateLive, onResult, go, entwurfBeenden };
}
