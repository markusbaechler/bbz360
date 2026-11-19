// Eingabeformular: Abschnitte zum Auf- und Zuklappen, Personen nebeneinander, dynamische Listen.
import { nf, chf, dec, fmtIn, esc } from '../lib/pension/format';
import { EINK_ART, QUELLEN } from '../lib/pension/engine';
import { FIX_POS, fixHelpers, horizon, budgetVoll, budgetWerte, budgetSumme, hatEigenheim } from '../lib/pension/analyse';
import { getPath, setPath, markEdited, WTYP } from '../lib/pension/state';
import { takeNum, revertErr } from './fielderr';
import { gl } from './glossar';
import { STUFEN, BUDGET_POS } from '../lib/pension/budget';
import { naechster, abschnittTexte } from './schritte';
import { liegenschaftEntfernt, zielWeg } from '../lib/pension/themen';
import { HINWEIS_VERKAUF_WOHNEN } from '../lib/pension/config';
import type { Horizont } from '../lib/pension/analyse';
import type { Roh } from '../lib/pension/state';
import type { Amortisation, EinkommenArt, Liegenschaft, NumLeer, PensState } from '../lib/pension/typen';
import type { App } from './app';

/** Auswahl [Wert, Beschriftung] für Auswahllisten und Schaltflächengruppen. */
type Opt = (string | number)[];
/** Optionen eines Zahlenfelds (inp). */
interface InpOpt { dec?: number; empty?: number; ph?: string; aria?: string }
/** data-Attribute eines Elements, wie die Ereignisbehandlung sie liest. */
type Daten = Record<string, string>;
/** Oberfläche des Eingabeformulars. */
export type Form = ReturnType<typeof createForm>;

const $ = (id: string) => document.getElementById(id)!;
const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const MON3 = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
export { WTYP };
export const LGTYP = { eigen: 'Selbst bewohnt', ferien: 'Ferienliegenschaft', rendite: 'Vermietet' };
/** Schritt der Schrittleiste je Formularabschnitt. Wünsche werden über die Themenkarten erfasst (themenui.js). */
const SEC_SCHRITT: Record<string, string> = { haushalt: 'situation', personen: 'situation', einkommen: 'einkommen', teil: 'einkommen', vermoegen: 'vermoegen', annahmen: 'vermoegen', liegenschaften: 'liegenschaft' };
/** Abschnitte, die auch im aktiven Schritt nach der letzten Wahl auf- oder zugeklappt sind. */
const FREI_OFFEN = new Set(['teil', 'annahmen']);

export function createForm(app: App) {
  const root = $('form');
  const S = () => app.S;
  const single = () => S().haushalt === 'single';

  /**
   * Geschätzte AHV-Rente der Person i pro Monat im Referenzalter, so wie sie gerechnet wird: bei Ehepaaren mit
   * Einkommensteilung und Plafond, sobald beide eine Rente beziehen (ohne Rentenzuschlag, ohne Vorbezug oder Aufschub).
   */
  const ahvGeschaetzt = (s: PensState, i: number) => {
    const pl = app.E.ahvPlan({ ...s, personen: s.personen.map((p, j) => ({ ...p, ahvBezug: 0, ...(j === i ? { ahvModus: 'schaetzung' } : {}) })) } as PensState);
    return pl.dauer[i] - pl.zuschlag[i];
  };

  // ---------- Bausteine ----------
  const NEGATIV = /(^|\.)(kontoZins|zins3aKonto|renditeOverride|inflation|ahvAnpassung)$/;
  const inp = (path: string, o: InpOpt = {}) =>
    `<input type="text" inputmode="${NEGATIV.test(path) ? 'text' : 'decimal'}"${NEGATIV.test(path) ? ' class="neg"' : ''} autocomplete="off" id="f_${path.replace(/\./g, '_')}" data-path="${path}"${o.dec ? ' data-dec="1"' : ''}${o.empty ? ' data-empty="1"' : ''}${o.ph ? ` placeholder="${esc(o.ph)}"` : ''} aria-label="${esc(o.aria || path)}">`;
  const txt = (path: string, aria: string, ph = '') => `<input type="text" class="txt" id="f_${path.replace(/\./g, '_')}" maxlength="80" data-path="${path}" data-text="1" aria-label="${esc(aria)}" placeholder="${esc(ph)}">`;
  const sel = (path: string, opts: Opt[], aria: string, numeric?: boolean) => `<select id="f_${path.replace(/\./g, '_')}" data-path="${path}"${numeric ? ' data-num="1"' : ''} aria-label="${esc(aria)}">${opts.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>`;
  const seg = (path: string, opts: Opt[], aria?: string) => `<div class="seg"${aria ? ` role="group" aria-label="${esc(aria)}"` : ''}>${opts.map(([v, l]) => `<button type="button" data-seg="${path}" data-val="${v}"${typeof v === 'number' ? ' data-num="1"' : ''} aria-pressed="false">${l}</button>`).join('')}</div>`;
  const prow = (label: string, sub: string, fn: (i: number) => string) => `<div class="lb">${label}${sub ? `<small>${sub}</small>` : ''}</div><div class="p1">${fn(0)}</div><div class="p2">${fn(1)}</div>`;
  const pgrid = (rows: string) => `<div class="pgrid" data-persons><div class="hd lb0"></div><div class="hd p1">Person 1</div><div class="hd p2">Person 2</div>${rows}</div>`;
  // Die Beschriftung zeigt auf das erste Feld mit id; Gruppen von Schaltflächen erhalten sie als Gruppenname
  let fldNr = 0;
  const fld = (label: string, html: string, hint?: string) => {
    const id = (html.match(/^\s*<(?:input|select)[^>]*\sid="([^"]+)"/) || [])[1];
    if (id) {
      // Das Feld heisst wie seine sichtbare Beschriftung (mit Einheit); ein abweichendes aria-label entfällt
      const feld = html.replace(/^(\s*<(?:input|select)[^>]*?)\saria-label="[^"]*"/, '$1').replace(/^(\s*<(?:input|select))/, hint ? `$1 aria-describedby="h_${id}"` : '$1');
      return `<div class="field"><label for="${id}">${label}</label>${feld}${hint ? `<div class="hint" id="h_${id}">${hint}</div>` : ''}</div>`;
    }
    const lid = `fl_${++fldNr}`;
    return `<div class="field" role="group" aria-labelledby="${lid}"${hint ? ` aria-describedby="${lid}_h"` : ''}><span class="flabel" id="${lid}">${label}</span>${html}${hint ? `<div class="hint" id="${lid}_h">${hint}</div>` : ''}</div>`;
  };
  const anl = (path: string, aria: string) => `<select data-path="${path}" aria-label="${esc(aria)}"><option value="konto">Konto</option><optgroup label="Wertschriften"><option value="vorsichtig">Vorsichtig</option><option value="ausgewogen">Ausgewogen</option><option value="dynamisch">Dynamisch</option></optgroup></select>`;
  const combo = (a: string, b: string) => `<div class="combo">${a}${b}</div>`;
  // Jeder Abschnitt gehört zu einem Schritt; sichtbar sind nur die Abschnitte des aktiven Schritts, und diese sind
  // aufgeklappt (ausser «Teilpensionierung» und «Weitere Annahmen»: diese bleiben, wie zuletzt gewählt)
  const sec = (key: string, title: string, inner: string, defOpen: boolean) => {
    const schritt = SEC_SCHRITT[key], aktiv = schritt === S().ui.schritt;
    const offen = aktiv && (FREI_OFFEN.has(key) ? (S().ui.open[key] ?? defOpen) : true);
    return `<details class="sec" data-sec="${key}" data-schritt="${schritt}"${offen ? ' open' : ''}${aktiv ? '' : ' hidden'}><summary><span class="st">${title}</span><span class="ss" data-sum="${key}"></span></summary><div class="secbody">${inner}</div></details>`;
  };
  /** Knopf am Ende eines Schritts 1 bis 4: weiter zum nächsten Schritt (nach Schritt 4 erst mit einem Ergebnis). */
  const weiter = (id: string) => {
    const n = naechster(id)!, ohne = n.id === 'urteil' && (!app.R || app.R.leer);
    return `<div class="weiter" data-schritt="${id}"${id === S().ui.schritt ? '' : ' hidden'}><button type="button" class="bbz-button bbz-button--primary" data-weiter="${n.id}"${ohne ? ' disabled' : ''}>Weiter: ${n.titel}</button></div>`;
  };
  const sub = (key: string, title: string, inner: string, defOpen: boolean) => `<details class="sub" data-sec="${key}"${(S().ui.open[key] ?? defOpen) ? ' open' : ''}><summary><span class="st">${title}</span><span class="ss" data-sum="${key}"></span></summary><div class="subbody">${inner}</div></details>`;

  function render() {
    fldNr = 0;
    const P = app.P, KT = Object.entries<{ ort: string }>(P.kapSteuer.kantone).map(([k, v]) => [k, `${k} – ${v.ort}`]).sort((a, b) => a[0].localeCompare(b[0]));
    // Vorbezug/Aufschub pro Person (Übergangsgeneration: bis 3 Jahre, tiefere Kürzung je nach Einkommen)
    const bezOpts = (i: number) => {
      const p = S().personen[i], E = app.E;
      return [-E.maxVorbezug(p), ...[-2, -1, 0, 1, 2, 3, 4, 5]].filter((b, k, a) => a.indexOf(b) === k && b >= -E.maxVorbezug(p)).sort((a, b) => a - b)
        .map((b) => [b, b === 0 ? 'Referenzalter' : b < 0 ? `${-b} J. früher (-${dec((1 - E.ahvFaktor(b, p)) * 100)}%)` : `${b} J. später (+${dec(P.ahv.aufschub[b] * 100)}%)`]);
    };
    root.innerHTML = `
    <h2>Ihre Eckdaten</h2><p class="lead">Rund zehn Angaben genügen für einen ersten Eindruck. Die Werte zur Pensionskasse stehen auf dem Vorsorgeausweis.</p>
    ${sec('haushalt', 'Haushalt', `${seg('haushalt', [['single', 'Alleinstehend'], ['verheiratet', 'Verheiratet'], ['konkubinat', 'Konkubinat']], 'Haushalt')}
      <div class="grid3">${fld('Kunde / Kundin', txt('bericht.kunde', 'Kunde', 'Name für den Bericht'))}${fld('Gesprächsdatum', txt('bericht.datum', 'Gesprächsdatum', 'heute'), 'Leer = Datum des Berichts')}${fld('Berater/in', txt('bericht.berater', 'Berater/in', 'optional'))}</div>
      ${fld('Wohnkanton', sel('kanton', KT, 'Wohnkanton'), 'Für die Steuer auf Kapitalbezügen (gerechnet am Kantonshauptort).')}`, true)}
    ${sec('personen', 'Personen', pgrid(`
      ${prow('Jahrgang', '', (i) => inp(`personen.${i}.jahrgang`, { dec: 1, aria: `Jahrgang Person ${i + 1}` }))}
      ${prow('Geburtsmonat', '', (i) => sel(`personen.${i}.geburtsmonat`, MONATE.map((m, k) => [k + 1, m]), `Geburtsmonat Person ${i + 1}`, true))}
      ${prow('Geschlecht', 'für Lebenserwartung und Referenzalter', (i) => sel(`personen.${i}.geschlecht`, [['m', 'Mann'], ['w', 'Frau']], `Geschlecht Person ${i + 1}`))}
      ${prow('Pensionierung mit', 'Beginn im Monat nach dem Geburtstag', (i) => sel(`personen.${i}.pensAlter`, Array.from({ length: 16 }, (_, k) => [55 + k, 55 + k]), `Pensionsalter Person ${i + 1}`, true))}
      ${prow(gl('referenzalter', 'AHV-Referenzalter'), 'AHV 21', (i) => `<span class="est" data-ref="${i}"></span>`)}
      ${prow(gl('lebenserwartung', 'Lebenserwartung'), `mit 65 laut BFS, Durchschnitt`, (i) => `<span class="est" data-le="${i}"></span>`)}`), true)}
    ${weiter('situation')}
    ${sec('einkommen', 'Einkommen und Vorsorge', `
      ${sub('lohn', 'Lohn und Einkommen', `${pgrid(prow('Bruttolohn heute', 'CHF pro Jahr, inkl. 13. Lohn und Bonus', (i) => inp(`personen.${i}.brutto`, { aria: `Bruttolohn Person ${i + 1}` })))}
        <div class="amhd">Übriges Einkommen</div><div id="ekList" class="eklist"></div>
        <div class="chips">${Object.entries(EINK_ART).map(([k, t]) => `<button type="button" class="chip" data-ekadd="${k}">+ ${t}</button>`).join('')}</div>
        <div class="hint">Beträge brutto pro Jahr. Nebenerwerb und Pauschalspesen steigen mit der Teuerung, Dividenden und Sonstiges bleiben gleich. Spesen enden mit der Pensionierung. Ein Nebenerwerb zählt wahlweise ab heute oder erst ab der Pensionierung. Ein Nebenerwerb befreit von den AHV-Beiträgen als Nichterwerbstätige, wenn darauf mindestens der Mindestbeitrag und die Hälfte dieser Beiträge bezahlt wird; sonst werden die Lohnbeiträge angerechnet. «bis Jahr» leer = unbefristet.</div>`, true)}
      ${sub('ahv', 'AHV', `${pgrid(`
          ${prow('AHV-Rente', 'pro Monat, heutiger Wert', (i) => combo(sel(`personen.${i}.ahvModus`, [['schaetzung', 'Schätzung aus Lohn'], ['betrag', 'Eigener Betrag']], `AHV-Rente Person ${i + 1}`), `<span data-showahv="${i}">${inp(`personen.${i}.ahvBetrag`, { empty: 1, ph: 'CHF/Mt.', aria: `AHV-Rente Person ${i + 1}` })}</span><span class="est" data-ahvest="${i}"></span>`))}
          ${prow('Fehlende Beitragsjahre', `jedes Jahr kürzt die Rente um rund 1/${P.ahv.beitragsjahre}`, (i) => inp(`personen.${i}.ahvFehlJahre`, { dec: 1, aria: `Fehlende AHV-Jahre Person ${i + 1}` }))}
          ${prow('Bezug', `${gl('vorbezug', 'Vorbezug')} oder ${gl('aufschub', 'Aufschub')}`, (i) => sel(`personen.${i}.ahvBezug`, bezOpts(i), `AHV-Bezug Person ${i + 1}`, true))}`)}
        <div class="hint">Eigener Betrag: die ungekürzte, nicht plafonierte Einzelrente im Referenzalter laut Rentenvorausberechnung, ohne Rentenzuschlag. Plafond für Ehepaare, Vorbezug, Aufschub und Rentenzuschlag rechnet PensCheck dazu. Schätzung nach der Rentenformel (Art. 34 AHVG) mit dem heutigen Lohn als massgebendem Einkommen und voller Beitragsdauer. Die Rententabellen rechnen in Einkommensstufen, massgebend ist das Durchschnittseinkommen aller Beitragsjahre. Den genauen Betrag liefert eine Rentenvorausberechnung der Ausgleichskasse. Mit der 13. Altersrente werden ${P.ahv.monatsrentenProJahr} Monatsrenten pro Jahr gerechnet; Ehepaare erhalten zusammen höchstens ${chf(P.ahv.plafondEhepaar)} pro Monat.</div>`, false)}
      ${sub('pk', 'Pensionskasse', pgrid(`
          ${prow('PK-Rente ab Pensionierung', 'CHF pro Jahr, laut Ausweis für dieses Alter', (i) => inp(`personen.${i}.pkRente`, { aria: `PK-Rente Person ${i + 1}` }))}
          ${prow(`${gl('kapitalbezug', 'PK-Kapitalbezug')} bei Pensionierung`, 'CHF, z. B. Kaderkasse oder Kapitalanteil', (i) => inp(`personen.${i}.pkKapital`, { aria: `PK-Kapital Person ${i + 1}` }))}
          ${prow('Guthaben heute', 'für «sofort aufhören»', (i) => inp(`personen.${i}.pkGuthabenHeute`, { empty: 1, ph: 'optional', aria: `PK-Guthaben heute Person ${i + 1}` }))}
          ${prow('Guthaben bei Pensionierung', 'laut Ausweis', (i) => inp(`personen.${i}.pkGuthabenPlan`, { empty: 1, ph: 'optional', aria: `PK-Guthaben bei Pensionierung Person ${i + 1}` }))}
          ${prow('Frühestes Pensionsalter', `laut Reglement, gesetzlich ab ${P.bvg.minAlter}`, (i) => inp(`personen.${i}.minAlter`, { dec: 1, aria: `Reglementsalter Person ${i + 1}` }))}
          ${prow('Anmeldefrist Kapitalbezug', 'Monate vor dem Bezug, laut Reglement; für den Aktionsplan', (i) => inp(`personen.${i}.pkFrist`, { dec: 1, empty: 1, ph: 'unbekannt', aria: `Anmeldefrist Kapitalbezug in Monaten Person ${i + 1}` }))}`), false)}
      ${sub('s3a', 'Säule 3a und Freizügigkeit', `${pgrid(`
          ${prow(`${gl('s3a', 'Säule 3a')} heute`, 'CHF und Anlage', (i) => combo(inp(`personen.${i}.s3a`, { aria: `Säule 3a Person ${i + 1}` }), anl(`personen.${i}.s3aAnlage`, `Anlage 3a Person ${i + 1}`)))}
          ${prow('3a-Einzahlung pro Jahr', `solange Sie arbeiten; Maximum ${nf.format(P.s3a.maxMitPK)}`, (i) => combo(sel(`personen.${i}.s3aModus`, [['max', 'Maximum'], ['eigen', 'Eigener Betrag']], `3a-Einzahlung Person ${i + 1}`), `<span data-show3a="${i}">${inp(`personen.${i}.s3aEinz`, { aria: `3a-Betrag Person ${i + 1}` })}</span>`))}
          ${prow(`${gl('freizuegigkeit', 'Freizügigkeit')} heute`, 'CHF und Anlage', (i) => combo(inp(`personen.${i}.fz`, { aria: `Freizügigkeit Person ${i + 1}` }), anl(`personen.${i}.fzAnlage`, `Anlage Freizügigkeit Person ${i + 1}`)))}`)}
        <div class="hint">3a und Freizügigkeit werden frühestens ${P.vorsorge.bezugJahreVorRef} Jahre vor dem Referenzalter bezogen. PensCheck rechnet den Bezug mit der Pensionierung, spätestens im Referenzalter; wer weiterarbeitet, kann ihn bis 5 Jahre aufschieben.</div>`, false)}`, true)}
    ${sec('teil', 'Teilpensionierung', `${pgrid(`
        ${prow('Teilpensionierung ab', 'Alter, danach volle Pensionierung wie oben', (i) => sel(`personen.${i}.teilAb`, [[0, 'keine'], ...Array.from({ length: 16 }, (_, k) => [50 + k, 50 + k])], `Teilpensionierung ab Person ${i + 1}`, true))}
        ${prow('Pensum danach', '% des heutigen Pensums', (i) => inp(`personen.${i}.teilPensum`, { dec: 1, aria: `Pensum Teilpensionierung Person ${i + 1}` }))}
        ${prow('Pensionskasse', 'während der Teilpensionierung', (i) => sel(`personen.${i}.teilPK`, [['teilbezug', 'Teilbezug'], ['weiter', 'Kein Bezug, weiter versichert']], `PK bei Teilpensionierung Person ${i + 1}`))}`)}
      <div class="hint">Teilbezug: Die PK richtet die Leistung im Verhältnis der Reduktion aus, der Rest folgt bei der vollen Pensionierung. Weiter versichert: Der bisherige Lohn bleibt versichert, die Werte vom Ausweis gelten unverändert.</div>`, false)}
    ${weiter('einkommen')}
    ${sec('vermoegen', 'Vermögen und Ausgaben', `<div class="grid2">
        ${fld('Konten / Liquidität (CHF)', inp('liquiditaet', { aria: 'Konten und Liquidität' }), 'Privat-, Spar- und Geschäftskonten')}
        ${fld('Wertschriften (CHF)', inp('wertschriften', { aria: 'Wertschriften' }), 'Depot, Fonds, Vermögensverwaltung')}
        ${fld('Zins auf Konten (%)', inp('kontoZins', { dec: 1, aria: 'Zins auf Konten' }), 'Ohne Verzinsung: 0')}
        <div class="field"><span class="flabel">${gl('freiesVermoegen', 'Freies Vermögen')} total</span><div class="vsum" id="vsum"></div></div></div>
      ${fld('Anlage der Wertschriften', seg('anlageprofil', Object.entries({ vorsichtig: 'Vorsichtig', ausgewogen: 'Ausgewogen', dynamisch: 'Dynamisch' }).map(([k, l]) => [k, `${l} ${dec(P.annahmen.profile[k] * 100)}%`])))}
      <div class="grid2">${fld('Ausgaben im Ruhestand (CHF pro Monat)', inp('ausgabenRuhestand', { aria: 'Ausgaben im Ruhestand' }), 'Alles inkl. Wohnen im Eigenheim, ohne Steuern: Einkommens- und Vermögenssteuern rechnet das Tool pauschal dazu (Sätze unter «Weitere Annahmen»).')}</div>
      <div class="chips" id="chips"></div>
      ${sub('budget', 'Budget im Ruhestand', `<div class="grid2">${BUDGET_POS.slice(1).map(([k, l, h]) => fld(l + ' (CHF/Mt.)', inp(`budget.${k}`, { empty: 1, aria: l }), h)).join('')}<div class="field"><span class="flabel">Total inklusive Wohnen</span><div class="vsum" id="budgetsum"></div></div></div>
        <div class="chips"><button type="button" class="chip" data-budget="toggle" id="budgetBtn" aria-pressed="false">Budget als Ausgaben verwenden</button></div>
        <div class="hint">Optional. Wohnen kommt aus der Liegenschaft bzw. aus der Miete bei den Fixkosten. Verwenden Sie das Budget, folgt der Betrag «Ausgaben im Ruhestand» seiner Summe; tragen Sie dort wieder einen Betrag ein, gilt dieser. Steuern gehören nicht ins Budget; das Tool rechnet sie separat.</div>`, false)}
      ${sub('fixk', 'Fixkosten im Ruhestand', `<div class="grid2">${FIX_POS.map(([k, l, h]) => fld(l + ' (CHF/Mt.)', inp(`fix.${k}`, { empty: 1, ph: 'Richtwert', aria: l }), h)).join('')}<div class="field"><span class="flabel">Total ohne Steuern</span><div class="vsum" id="fixsum"></div></div></div>
        <div class="hint">Teil der Ausgaben oben, der sich kurzfristig kaum senken lässt. Leere Felder = Richtwert je nach Haushalt. Die Steuern auf den Renten rechnet das Tool dazu. Wohnen beim Eigenheim: Hypothekarzins, Unterhalt und Nebenkosten aus der Liegenschaft.</div>`, false)}
      <div class="hint">Das Tool rechnet mit dem heutigen Verhältnis von Konten und Wertschriften über die ganze Laufzeit. Der Stresstest (-1 Prozentpunkt) betrifft nur die Wertschriften.</div>`, true)}
    ${sec('annahmen', 'Weitere Annahmen', `<div class="grid2">
        ${fld('Heutige Ausgaben (CHF pro Monat)', inp('ausgabenHeute', { empty: 1, ph: 'automatisch', aria: 'Heutige Ausgaben' }), 'Leer = Ruhestandsausgaben ÷ 0.9')}
        ${fld('Planungshorizont', `${sel('horizontModus', [['le5', 'Lebenserwartung + 5 Jahre'], ['le', 'Lebenserwartung (Durchschnitt)'], ['95', 'Bis 95'], ['eigen', 'Eigenes Alter']], 'Planungshorizont')}<span data-showhz>${inp('horizontEigen', { dec: 1, aria: 'Eigener Horizont' })}</span>`, '<span id="hzInfo"></span>')}
        ${fld('Steuersatz auf Renten (%)', inp('steuerEink', { dec: 1, aria: 'Steuersatz Einkommen' }), 'Pauschal auf AHV- und PK-Rente und auf dem steuerbaren Teil der Vermögenserträge; Kapitalbezüge separat nach Kanton.')}
        ${fld('Vermögenssteuer: eigener Satz (‰ pro Jahr)', inp('steuerVerm', { dec: 1, empty: 1, ph: 'gemäss Kanton', aria: 'Vermögenssteuer, eigener Satz in Promille' }), '<span id="vsInfo"></span> Leer = Tarif des Kantonshauptorts (ESTV-Statistik), je nach Vermögen und Zivilstand. Ein eigener Satz gilt für das ganze Reinvermögen; 0 = nicht rechnen.')}
        ${fld('Steuerbarer Anteil der Erträge (%)', inp('ertragSteuerbar', { dec: 1, aria: 'Steuerbarer Anteil der Vermögenserträge' }), 'Zinsen und Dividenden sind als Einkommen steuerbar, Kursgewinne nicht. Annahme: die Hälfte des Ertrags; gerechnet mit dem Steuersatz auf Renten.')}
        ${fld('Inflation (%)', inp('inflation', { dec: 1, aria: 'Inflation' }), 'Für Ausgaben und Lohn')}
        ${fld('AHV-Anpassung pro Jahr (%)', inp('ahvAnpassung', { dec: 1, aria: 'AHV-Anpassung' }), 'Anpassung der AHV-Renten (Mischindex aus Löhnen und Preisen). Vorsichtig angesetzt: Liegt der Wert unter der Inflation, verliert die AHV-Rente über die Jahre an Kaufkraft.')}
        ${fld('Rendite Wertschriften selbst festlegen (%)', inp('renditeOverride', { dec: 1, empty: 1, ph: 'gemäss Profil', aria: 'Rendite Wertschriften' }))}
        ${fld('Zins 3a- und Freizügigkeitskonten (%)', inp('zins3aKonto', { dec: 1, aria: 'Zins 3a-Konto' }), 'Gilt, wo bei 3a/Freizügigkeit «Konto» gewählt ist')}
        ${fld('Reserve am Horizont (Jahresausgaben)', inp('reserveJahre', { dec: 1, aria: 'Reserve' }))}
        ${fld(`${gl('tragbarkeit', 'Tragbarkeitsgrenze')} Bank (%)`, inp('tragGrenze', { dec: 1, aria: 'Tragbarkeitsgrenze' }), 'Üblich 33 bis 38%; viele Banken rechnen mit einem Drittel')}
      </div>
      ${fld('Ausgaben ab 75', seg('reduktion75', [[1, 'Gleich'], [0.9, '-10%'], [0.8, '-20%']]), 'Bis 75 bleiben die Ausgaben real gleich.')}`, false)}
    ${weiter('vermoegen')}
    ${sec('liegenschaften', 'Liegenschaften und Hypotheken', `<div id="lgList" class="wlist"></div>
      <div class="chips"><button type="button" class="chip" data-lgadd="eigen">+ Selbst bewohnt</button><button type="button" class="chip" data-lgadd="ferien">+ Ferienliegenschaft</button><button type="button" class="chip" data-lgadd="rendite">+ Vermietet</button></div>
      <div class="hint">Beim selbst bewohnten Eigenheim sind Zins und Unterhalt in den Ausgaben enthalten; eine Amortisation senkt die Zinskosten. Bei weiteren Liegenschaften rechnet das Tool Zins, Unterhalt und Mietertrag separat.</div>`, true)}
    ${weiter('liegenschaft')}`;
    root.querySelectorAll<HTMLDetailsElement>('details.sec, details.sub').forEach((d) => d.addEventListener('toggle', () => { S().ui.open[d.dataset.sec!] = d.open; app.persist(); }));
    reflect();
  }

  /** AHV-Bezugsoptionen neu aufbauen (Übergangsgeneration hängt von Geschlecht und Jahrgang ab). */
  function refreshBezOpts() {
    const s = S(), E = app.E, P = app.P;
    [0, 1].forEach((i) => {
      const el = root.querySelector<HTMLSelectElement>(`[data-path="personen.${i}.ahvBezug"]`);
      if (!el) return;
      const p = s.personen[i];
      const opts = [-3, -2, -1, 0, 1, 2, 3, 4, 5].filter((b) => b >= -E.maxVorbezug(p));
      if (p.ahvBezug < -E.maxVorbezug(p)) p.ahvBezug = -E.maxVorbezug(p);
      el.innerHTML = opts.map((b) => `<option value="${b}">${b === 0 ? 'Referenzalter' : b < 0 ? `${-b} J. früher (-${dec((1 - E.ahvFaktor(b, p)) * 100)}%)` : `${b} J. später (+${dec(P.ahv.aufschub[b] * 100)}%)`}</option>`).join('');
      el.value = String(p.ahvBezug ?? 0);
    });
  }

  // ---------- Werte in die Felder schreiben ----------
  function reflect(except?: Element | null) {
    const s = S(), E = app.E, P = app.P;
    root.querySelectorAll<HTMLInputElement>('[data-path]').forEach((el) => {
      if (el === except) return;
      const v = getPath(s, el.dataset.path!);
      el.value = el.tagName === 'SELECT' || el.dataset.text ? (v ?? '') : fmtIn(v, el.dataset.dec as unknown as boolean);
      el.classList.remove('bad');
    });
    root.querySelectorAll<HTMLElement>('[data-seg]').forEach((b) => b.setAttribute('aria-pressed', String(String(getPath(s, b.dataset.seg!)) === b.dataset.val)));
    root.querySelectorAll('[data-persons]').forEach((el) => el.classList.toggle('single', single()));
    const typ = single() ? 'single' : 'paar';
    $('chips').innerHTML = '<span class="chiplbl">Richtwerte:</span>' + Object.entries<number>(P.annahmen.erfahrung[typ]).map(([k, v]) => `<button type="button" class="chip" data-chip="${v}" aria-pressed="${!s.budgetAktiv && +s.ausgabenRuhestand === v}">${((STUFEN as Record<string, string>)[k] || k).replace(/^./, (c) => c.toUpperCase())} ${nf.format(v)}</button>`).join('');
    const V = (+s.liquiditaet || 0) + (+s.wertschriften || 0);
    $('vsum').innerHTML = chf(V) + (V > 0 ? `<small>${Math.round(E.liqAnteil(s) * 100)}% auf Konten</small>` : '');
    const F = fixHelpers(s, E), d = F.def(), wm = F.wohnenMonat(null);
    FIX_POS.forEach(([k]) => {
      const el = root.querySelector<HTMLInputElement>(`[data-path="fix.${k}"]`);
      const ausBudget = s.budgetAktiv && ['kk', 'ges', 'vers', 'komm', 'geb', 'mob'].includes(k);
      if (el) el.placeholder = k === 'wohnen' ? `${nf.format(Math.round(wm.v))} (${wm.art === 'aus Liegenschaft' ? 'Liegenschaft' : 'Richtwert'})` : `${nf.format(d[k])} (${ausBudget ? 'aus Budget' : 'Richtwert'})`;
    });
    const voll = budgetVoll(s), bw = budgetWerte(s, E);
    $('budgetsum').innerHTML = voll ? `${chf(budgetSumme(s, E))}<small>davon Wohnen ${chf(bw.wohnen)}</small>` : '<small>Alle Positionen ausfüllen</small>';
    const bb = $('budgetBtn');
    bb.setAttribute('aria-pressed', String(!!s.budgetAktiv));
    bb.textContent = s.budgetAktiv ? 'Budget gilt als Ausgaben ✓' : 'Budget als Ausgaben verwenden';
    $('fixsum').innerHTML = chf(wm.v + F.uebrigeFix()) + '<small>pro Monat, heutige Kaufkraft</small>';
    const hz = horizon(s, E);
    root.querySelectorAll<HTMLElement>('[data-le]').forEach((el) => { el.textContent = `≈ ${dec(E.leAlter(s.personen[+el.dataset.le!]))} Jahre`; });
    root.querySelectorAll<HTMLElement>('[data-ref]').forEach((el) => {
      const p = s.personen[+el.dataset.ref!], r = E.refAlter(p), y = Math.floor(r), m = Math.round((r - y) * 12);
      el.textContent = m ? `${y} Jahre ${m} Monate` : `${y} Jahre`;
    });
    root.querySelectorAll<HTMLElement>('[data-showhz]').forEach((el) => { el.hidden = s.horizontModus !== 'eigen'; });
    const ps = s.personen.slice(0, single() ? 1 : 2), le = ps.map((p) => Math.round(E.leAlter(p)));
    $('hzInfo').textContent = `Lebenserwartung ${ps.length > 1 ? `P1 ${le[0]}, P2 ${le[1]}` : le[0]}; gerechnet bis ${ps.length > 1 ? `P1 ${hz.horizontP[0]}, P2 ${hz.horizontP[1]}` : hz.horizont}. Stresstest bis 100.`;
    const vs = E.vermSteuerHeute({ ...s }), vsEl = $('vsInfo');
    if (vsEl) vsEl.textContent = vs.eigen ? `Eigener Satz: rund ${chf(vs.steuer)} pro Jahr auf einem Reinvermögen von ${chf(vs.rein)}.` : `Heute: rund ${chf(vs.steuer)} pro Jahr (${dec(vs.promille)}‰) in ${vs.ort || s.kanton} auf einem Reinvermögen von ${chf(vs.rein)} (Liegenschaften zu 70% des Verkehrswerts, abzüglich Hypotheken).`;
    root.querySelectorAll<HTMLElement>('[data-showahv]').forEach((el) => { el.hidden = s.personen[+el.dataset.showahv!].ahvModus !== 'betrag'; });
    root.querySelectorAll<HTMLElement>('[data-ahvest]').forEach((el) => {
      const p = s.personen[+el.dataset.ahvest!];
      el.hidden = p.ahvModus === 'betrag';
      el.textContent = `≈ ${nf.format(Math.round(ahvGeschaetzt(s, +el.dataset.ahvest!)))}/Mt.`;
      el.title = s.haushalt === 'verheiratet' ? 'Bei Ehepaaren begrenzt auf zusammen 150% der Maximalrente, sobald beide eine Rente beziehen; die Einkommen werden geteilt, sobald beide das Referenzalter erreicht haben' : 'Schätzung aus dem heutigen Lohn';
    });
    root.querySelectorAll<HTMLElement>('[data-show3a]').forEach((el) => { el.hidden = (s.personen[+el.dataset.show3a!].s3aModus || 'max') === 'max'; });
    renderSums(hz);
    const a: DOMStringMap = (document.activeElement as HTMLElement | null)?.dataset || {};
    if (!(a.path || '').endsWith('.ahvBezug')) refreshBezOpts();
    if (a.ek == null) renderEink();
    if (a.lg == null && a.am == null) renderLgs();
  }

  function renderSums(hz: Horizont) {
    const s = S(), E = app.E, ps = s.personen.slice(0, single() ? 1 : 2), F = fixHelpers(s, E);
    // Haushalt, Personen, Einkommen, Vermögen und Liegenschaften: gleiche Texte wie in der Schrittleiste
    const t: Record<string, string> = {
      ...abschnittTexte(s),
      lohn: `${ps.map((p) => chf(p.brutto || 0)).join(' / ')}${s.einkommen.length ? ` + ${chf(s.einkommen.reduce((x, e) => x + (+e.betrag || 0), 0))} übrige` : ''}`,
      ahv: ps.map((p, i) => `P${i + 1}: ${p.ahvModus === 'betrag' && (p.ahvBetrag as number) > 0 ? chf(p.ahvBetrag as number) : '≈ ' + chf(ahvGeschaetzt(s, i))}/Mt.`).join(' · '),
      pk: ps.map((p, i) => `P${i + 1}: ${chf(p.pkRente || 0)}/J.${p.pkKapital > 0 ? ' + ' + chf(p.pkKapital) : ''}`).join(' · '),
      s3a: ps.map((p, i) => `P${i + 1}: ${chf((+p.s3a || 0) + (+p.fz || 0))}`).join(' · '),
      teil: ps.some((p) => p.teilAb > 0) ? ps.map((p, i) => (p.teilAb > 0 ? `P${i + 1} ab ${p.teilAb} zu ${p.teilPensum}%` : '')).filter(Boolean).join(' · ') : 'keine',
      fixk: `${chf(F.wohnenMonat(null).v + F.uebrigeFix())} pro Monat`,
      annahmen: `Inflation ${s.inflation}%, AHV +${s.ahvAnpassung}%, bis ${hz.horizont}${s.horizontModus === 'le5' ? ' (LE + 5)' : ''}`,
    };
    root.querySelectorAll<HTMLElement>('[data-sum]').forEach((el) => { el.textContent = t[el.dataset.sum!] || ''; });
  }

  function renderEink() {
    const el = $('ekList'), s = S(), cpl = !single();
    el.innerHTML = s.einkommen.length
      ? s.einkommen.map((x, k) => `<div class="ekrow">${cpl ? `<select data-ek="${k}" data-k="person" data-num="1" aria-label="Person"><option value="0"${(x.person || 0) === 0 ? ' selected' : ''}>P1</option><option value="1"${x.person === 1 ? ' selected' : ''}>P2</option></select>` : ''}<select data-ek="${k}" data-k="art" aria-label="Art">${Object.entries(EINK_ART).map(([v, t]) => `<option value="${v}"${v === x.art ? ' selected' : ''}>${t}</option>`).join('')}</select><input type="text" inputmode="decimal" data-ek="${k}" data-k="betrag" value="${fmtIn(x.betrag)}" aria-label="Betrag pro Jahr" placeholder="CHF/Jahr"><input type="text" inputmode="numeric" data-ek="${k}" data-k="bisJahr" data-dec="1" value="${x.bisJahr > 0 ? fmtIn(x.bisJahr, true) : ''}" aria-label="bis Jahr" placeholder="bis Jahr">${x.art === 'nebenerwerb' ? `<select class="ab" data-ek="${k}" data-k="abPens" aria-label="Beginn des Nebenerwerbs"><option value="0"${x.abPens ? '' : ' selected'}>ab heute</option><option value="1"${x.abPens ? ' selected' : ''}>ab Pensionierung</option></select>` : ''}<input type="text" class="t" maxlength="60" data-ek="${k}" data-k="text" data-text="1" value="${esc(x.text)}" aria-label="Bezeichnung" placeholder="Bezeichnung"><button type="button" class="x" data-ekdel="${k}" aria-label="${esc(`${EINK_ART[x.art] || 'Einkommen'}${x.text ? ' ' + x.text : ''} entfernen`)}">×</button></div>`).join('')
      : '<div class="hint">Keine weiteren Einkommen erfasst.</div>';
    el.classList.toggle('cpl', cpl);
  }

  function renderLgs() {
    const el = $('lgList'), s = S(), cpl = !single();
    const f = (k: number, lbl: string, key: keyof Liegenschaft, o: { dec?: number; hint?: string } = {}) => `<div class="field"><label for="lg_${k}_${key}">${lbl}</label><input type="text" inputmode="decimal" id="lg_${k}_${key}" data-lg="${k}" data-k="${key}"${o.dec ? ' data-dec="1"' : ''} value="${fmtIn(s.liegenschaften[k][key] ?? '', o.dec as unknown as boolean)}">${o.hint ? `<div class="hint">${o.hint}</div>` : ''}</div>`;
    const q = Object.entries(QUELLEN).filter(([k]) => cpl || !k.endsWith('1'));
    el.innerHTML = s.liegenschaften.map((l, k) => {
      const typ = l.typ || 'eigen';
      const ams = s.amortisationen.map((x, j): [Amortisation, number] => [x, j]).filter(([x]) => x.lg === k);
      return `<div class="wcard"><div class="whead lg"><select data-lg="${k}" data-k="typ" aria-label="Art">${Object.entries(LGTYP).map(([v, t]) => `<option value="${v}"${v === typ ? ' selected' : ''}>${t}</option>`).join('')}</select><input type="text" class="wname" maxlength="60" data-lg="${k}" data-k="name" data-text="1" value="${esc(l.name)}" aria-label="Bezeichnung"><button type="button" class="x" data-lgdel="${k}" aria-label="${esc(`Liegenschaft ${l.name || k + 1} entfernen`)}">×</button></div>
        <div class="grid3">${f(k, 'Verkehrswert (CHF)', 'verkehrswert')}${f(k, 'Hypothek (CHF)', 'hypothek')}${f(k, 'Zins (%)', 'zins', { dec: 1 })}</div>
        <div class="grid3">${typ !== 'eigen' ? f(k, 'Unterhalt (% p. a.)', 'unterhalt', { dec: 1 }) + f(k, 'Mietertrag netto (CHF/Jahr)', 'mietertrag') : f(k, 'Unterhalt (% des Verkehrswerts p. a.)', 'unterhalt', { dec: 1, hint: 'Faustregel 1% des Gebäudeversicherungswerts, meist 0.4–0.7% des Verkehrswerts' }) + f(k, 'Nebenkosten (CHF/Mt.)', 'nebenkosten', { hint: 'Heizung, Strom, Wasser, Kehricht, Versicherung' })}${f(k, 'Verkauf mit Alter (0 = nie)', 'verkaufAlter', { dec: 1, ...(typ === 'eigen' ? { hint: HINWEIS_VERKAUF_WOHNEN } : {}) })}</div>
        <div class="amlist"><div class="amhd">Ausserordentliche Amortisationen</div>
          ${ams.map(([x, j]) => `<div class="amrow"><input type="text" inputmode="decimal" data-am="${j}" data-k="betrag" value="${fmtIn(x.betrag)}" aria-label="Betrag"><span>im</span><select data-am="${j}" data-k="monat" data-num="1" aria-label="Monat">${MON3.map((m, i) => `<option value="${i + 1}"${i + 1 === (x.monat || 1) ? ' selected' : ''}>${m}</option>`).join('')}</select><input type="text" inputmode="numeric" data-am="${j}" data-k="jahr" data-dec="1" value="${fmtIn(x.jahr || '', true)}" aria-label="Jahr"><button type="button" class="x" data-amdel="${j}" aria-label="${esc(`Amortisation ${x.jahr || ''} entfernen`)}">×</button><div class="amq"><span>aus</span><select data-am="${j}" data-k="quelle" aria-label="Quelle">${q.map(([v, t]) => `<option value="${v}"${v === (x.quelle || 'frei') ? ' selected' : ''}>${t}</option>`).join('')}</select></div></div>`).join('')}
          <div><button type="button" class="bbz-button bbz-button--secondary sm" data-amadd="${k}">+ Amortisation</button></div>
          ${ams.some(([x]) => (x.quelle || 'frei') !== 'frei') ? `<div class="hint">${typ === 'eigen' ? 'Vorbezug aus 3a oder Freizügigkeit (Wohneigentumsförderung): wird als Kapitalleistung besteuert, pro Person höchstens alle 5 Jahre; Freizügigkeit bis 3 Jahre vor der Altersleistung.' : '<b>Achtung:</b> 3a und Freizügigkeit dürfen nur für selbst bewohntes Wohneigentum vorbezogen werden.'}</div>` : ''}
        </div></div>`;
    }).join('');
  }

  // ---------- Ereignisse ----------
  // Zahlen lesen und übernehmen: takeNum (fielderr.js), gemeinsam mit Karteneditor und So oder so
  const setNum = (obj: Roh, key: string, el: HTMLInputElement, scope?: string) => takeNum(el, key, scope, false, (v) => { obj[key] = v; });
  root.addEventListener('input', (ev) => {
    const el = ev.target as HTMLInputElement, s = S(), d = el.dataset as Daten;
    if (d.lg != null) {
      const l: Roh = s.liegenschaften[+d.lg];
      if (el.tagName === 'SELECT' || d.text) l[d.k] = el.value;
      else if (!setNum(l, d.k, el)) return;
      app.changed({ soft: el.tagName !== 'SELECT', rerender: el.tagName === 'SELECT' ? renderLgs : null! });
      if (el.tagName === 'SELECT') root.querySelector<HTMLElement>(`select[data-lg="${d.lg}"][data-k="${d.k}"]`)?.focus();
      return;
    }
    if (d.am != null) {
      const x: Roh = s.amortisationen[+d.am];
      if (el.tagName === 'SELECT') x[d.k] = d.num ? Number(el.value) : el.value;
      else if (!setNum(x, d.k, el)) return;
      app.changed({ soft: el.tagName !== 'SELECT', rerender: el.tagName === 'SELECT' ? renderLgs : null! });
      if (el.tagName === 'SELECT') root.querySelector<HTMLElement>(`select[data-am="${d.am}"][data-k="${d.k}"]`)?.focus();
      return;
    }
    if (d.ek != null) {
      const x: Roh = s.einkommen[+d.ek];
      if (d.k === 'abPens') { if (el.value === '1') x.abPens = true; else if (x.tkey) x.abPens = false; else delete x.abPens; }
      else if (el.tagName === 'SELECT') x[d.k] = d.num ? Number(el.value) : el.value;
      else if (d.text) x[d.k] = el.value;
      else if (!setNum(x, d.k, el)) return;
      if (d.k === 'art') {
        // «Beginn» gibt es nur beim Nebenerwerb: Zeile neu aufbauen, Fokus bleibt auf der Auswahl
        if (x.art !== 'nebenerwerb') delete x.abPens;
        renderEink();
        root.querySelector<HTMLElement>(`select[data-ek="${d.ek}"][data-k="art"]`)?.focus();
      }
      app.changed({ soft: true });
      return;
    }
    if (!d.path) return;
    if (d.text) {
      setPath(s, d.path, el.value);
      // Ein von Hand erfasstes Gesprächsdatum bleibt; ein leeres Feld bedeutet «Datum des Berichts»
      if (d.path === 'bericht.datum') s.ui.datumSet = el.value.trim() !== '';
      markEdited(s);
      app.persist();
      return;
    }
    if (el.tagName === 'SELECT') {
      setPath(s, d.path, d.num ? Number(el.value) : el.value);
      app.changed({ except: el });
      if (d.path.endsWith('.geschlecht')) refreshBezOpts();
      return;
    }
    // Betrag von Hand gesetzt: Das Budget gilt nicht mehr (bleibt aber gespeichert)
    if (!takeNum(el, d.path.split('.').pop()!, null, !!d.empty, (v) => setPath(s, d.path, v))) return;
    if (d.path === 'ausgabenRuhestand') s.budgetAktiv = false;
    app.changed({ except: el });
  });
  root.addEventListener('focusout', (ev) => {
    const el = ev.target as HTMLInputElement, d = (el.dataset || {}) as Daten;
    // Ungültige Eingabe: zuletzt gültigen Wert wieder einsetzen und sagen, dass und warum
    if (d.path && el.tagName === 'INPUT' && !d.text) { const shown = fmtIn(getPath(S(), d.path), d.dec as unknown as boolean); if (!revertErr(el, shown)) el.value = shown; }
    if (el.tagName === 'INPUT' && !d.text && !d.path && el.classList.contains('bad')) app.toast(`«${el.value}» wurde nicht übernommen: ${el.nextElementSibling?.classList.contains('ferr') ? el.nextElementSibling.textContent : 'ungültige Eingabe.'} Der bisherige Wert gilt weiter.`);
    if (d.path && d.path.endsWith('.jahrgang')) refreshBezOpts();
    setTimeout(() => {
      const a: DOMStringMap = (document.activeElement as HTMLElement | null)?.dataset || {};
      if (d.ek != null && a.ek == null) renderEink();
      if ((d.lg != null || d.am != null) && a.lg == null && a.am == null) renderLgs();
    }, 0);
  });
  /** Höchstzahl der Einträge je Liste (gleich wie beim Laden eines Stands). */
  const MAX = { einkommen: 20, liegenschaften: 10, amortisationen: 30 };
  const voll = (liste: keyof typeof MAX, was: string) => {
    if (S()[liste].length < MAX[liste]) return false;
    app.toast(`Mehr als ${MAX[liste]} ${was} lassen sich nicht erfassen.`);
    return true;
  };
  /** Nach dem Neuaufbau einer Liste den Fokus setzen: auf den neuen Eintrag bzw. den Nachbarn des entfernten. */
  const fokus = (...sel: (string | null)[]) => { for (const q of sel) { const el = q && root.querySelector<HTMLElement>(q); if (el) { el.focus(); return; } } };
  root.addEventListener('click', async (ev) => {
    const b = (ev.target as Element).closest('button');
    if (!b) return;
    const s = S(), d = b.dataset as Daten;
    if ((d.ekadd && voll('einkommen', 'Einkommen')) || (d.lgadd && voll('liegenschaften', 'Liegenschaften')) || (d.amadd != null && voll('amortisationen', 'Amortisationen'))) return;
    if (d.lgdel != null) {
      const k = +d.lgdel, nAm = s.amortisationen.filter((x) => x.lg === k).length;
      if (nAm && !(await app.confirm('Liegenschaft entfernen?', `Mit «${s.liegenschaften[k].name || 'Liegenschaft'}» ${nAm === 1 ? 'wird auch die erfasste Amortisation' : `werden auch ${nAm} Amortisationen`} entfernt.`, 'Ja, entfernen'))) return;
      if (S() !== s) return;
    }
    // Zu welcher Liegenschaft gehört die Amortisation, die entfernt wird? (für den Fokus danach)
    const amLg = d.amdel != null ? s.amortisationen[+d.amdel]?.lg : null;
    if (d.seg) {
      setPath(s, d.seg, d.num ? Number(d.val) : d.val);
      // Ein Wechsel des Haushalts lässt Karten für Person 2 wegfallen
      if (d.seg === 'haushalt') zielWeg(s);
      app.changed();
    }
    else if (d.ekadd) { s.einkommen.push({ person: 0, art: d.ekadd as EinkommenArt, betrag: { dividende: 20000, nebenerwerb: 15000, spesen: 6000, sonstiges: 10000 }[d.ekadd as EinkommenArt], bisJahr: 0, text: '' }); app.changed(); }
    else if (d.ekdel != null) { s.einkommen.splice(+d.ekdel, 1); app.changed(); }
    else if (d.lgadd) { s.liegenschaften.push({ name: LGTYP[d.lgadd as Liegenschaft['typ']], typ: d.lgadd as Liegenschaft['typ'], verkehrswert: 800000, hypothek: 400000, zins: 2, unterhalt: d.lgadd === 'eigen' ? 0.5 : 1, nebenkosten: 400, mietertrag: d.lgadd === 'rendite' ? 30000 : 0, verkaufAlter: 0 }); app.changed(); }
    // Karten und Amortisationen der Liegenschaft fallen mit ihr weg (liegenschaftEntfernt)
    else if (d.lgdel != null) { const k = +d.lgdel; s.liegenschaften.splice(k, 1); liegenschaftEntfernt(s, k); app.changed(); }
    else if (d.amadd != null) { s.amortisationen.push({ lg: +d.amadd, betrag: 100000, jahr: Math.max(app.E.BASIS + 1, s.personen[0].jahrgang + s.personen[0].pensAlter), monat: 1, quelle: 'frei' }); app.changed(); }
    else if (d.amdel != null) { s.amortisationen.splice(+d.amdel, 1); app.changed(); }
    else if (d.chip) { s.budgetAktiv = false; s.ausgabenRuhestand = Number(d.chip); app.changed(); }
    else if (d.budget) {
      if (s.budgetAktiv) s.budgetAktiv = false;
      else if (budgetVoll(s)) {
        s.budgetAktiv = true;
        if (!hatEigenheim(s, app.E) && (s.budget.wohnen as NumLeer) !== '' && s.budget.wohnen != null && ((s.fix.wohnen as NumLeer) === '' || s.fix.wohnen == null)) s.fix.wohnen = s.budget.wohnen;
      }
      else { app.toast('Bitte zuerst alle Positionen des Budgets ausfüllen.'); return; }
      app.changed();
    }
    const n = (liste: keyof typeof MAX) => S()[liste].length, nah = (k: string, anz: number) => Math.min(+k, anz - 1);
    if (d.ekadd) fokus(`[data-ek="${n('einkommen') - 1}"][data-k="betrag"]`, `[data-ek="${n('einkommen') - 1}"]`);
    else if (d.lgadd) fokus(`[data-lg="${n('liegenschaften') - 1}"][data-k="name"]`);
    else if (d.amadd != null) fokus(`[data-am="${n('amortisationen') - 1}"][data-k="betrag"]`);
    else if (d.ekdel != null) fokus(n('einkommen') ? `[data-ekdel="${nah(d.ekdel, n('einkommen'))}"]` : null, '[data-ekadd]');
    else if (d.lgdel != null) fokus(n('liegenschaften') ? `[data-lgdel="${nah(d.lgdel, n('liegenschaften'))}"]` : null, '[data-lgadd]');
    else if (d.amdel != null) fokus(`[data-amadd="${amLg}"]`, '[data-amadd]');
  });

  return { render, reflect, renderLgs };
}
