// @ts-nocheck — Referenztest, aus PensCheck (tests/befunde3.test.js, Stand 4830eff) übernommen; nur Pfade angepasst.
// @vitest-environment happy-dom
// Befunde des dritten Durchgangs ausserhalb der AHV-Rechnung: Texte (R10–R12), Übungsmodus (C10), Formular (N6, N7),
// Tabellen und Diagramme (N8), Prüflauf (Q9, Q10), Suchmuster (Q11), PDF (B8). Die AHV steht in ahv.test.js.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import params from '../../../public/data/params.json';
import verification from '../../../public/data/verification.json';
import { createEngine } from '../../../src/lib/pension/engine';
import { resolveParams, nextParams } from '../../../src/lib/pension/params';
import { analyse, applyBudget } from '../../../src/lib/pension/analyse';
import { EXAMPLE, clone, migrate, hatEigenes, markEdited, rangeError, save } from '../../../src/lib/pension/state';
import { createForm } from '../../../src/pension-ui/form';
import { createResults } from '../../../src/pension-ui/results';
import { createTutor } from '../../../src/pension-ui/tutor';
import { createSchritte } from '../../../src/pension-ui/schritte';
import { createBuehne } from '../../../src/pension-ui/buehne';
import { createThemen } from '../../../src/pension-ui/themenui';
import { createVergleich } from '../../../src/pension-ui/vergleich';
import { renderSources } from '../../../src/pension-ui/sources';
import { initGlossar } from '../../../src/pension-ui/glossar';
import { lineChart } from '../../../src/pension-ui/charts';
import { GRENZEN, DATENSCHUTZ } from '../../../src/lib/pension/config';
import { musterMitKontext } from '../../../scripts/verify-sources.mjs';

const lies = (f) => readFileSync(resolve(process.cwd(), f), 'utf8');
const html = lies('modules/07c-pension.html');
const body = html.slice(html.indexOf('<body'), html.indexOf('</body>')).replace(/^<body[^>]*>/, '').replace(/<script[\s\S]*?<\/script>/g, '');
const A0 = 2026 * 12 + 10;
const P = resolveParams(params, 2026), Pn = nextParams(params, 2026);

function boot(S) {
  document.body.innerHTML = body;
  const app = { version: 'test', params, verification, S, R: null, A0, P, Pn, E: createEngine(P, A0, Pn), toasts: [], confirms: [], antwort: true };
  app.persist = () => {};
  app.setLamp = () => {};
  app.toast = (t) => app.toasts.push(t);
  app.confirm = async (titel, text) => { app.confirms.push(`${titel} ${text}`); return app.antwort; };
  app.hatEigenes = () => hatEigenes(app.S);
  app.share = () => {};
  app.setMode = () => {};
  app.checkForUpdate = () => {};
  app.bestaetigt = (c) => !!c && c.confirmed >= 2;
  initGlossar(app);
  // Wie in main.js: Die Bühne zeigt die Ansichten in beiden Modi (Tutor-Ergebnis), Schritte und So oder so gehören dazu
  const form = createForm(app), schritte = createSchritte(app), results = createResults(app), buehne = createBuehne(app, results), tutor = createTutor(app), themen = createThemen(app), vergleich = createVergleich(app);
  app.formRender = () => form.render();
  const compute = () => { app.R = analyse(app.S, app.E, results.stopA()); results.render(); schritte.render(); themen.render(); vergleich.render(); buehne.render(); tutor.onResult(); };
  app.changed = (o = {}) => { applyBudget(app.S, app.E); markEdited(app.S); form.reflect(o.except || document.activeElement); if (o.rerender) o.rerender(); compute(); };
  app.stopChanged = () => { app.neuGerechnet = (app.neuGerechnet || 0) + 1; compute(); };
  app.replaceState = (ns) => { app.S = ns; form.render(); tutor.render(); compute(); return true; };
  form.render();
  schritte.render();
  tutor.render();
  renderSources(app);
  compute();
  return { app, form, results, buehne, tutor };
}
const q = (sel) => document.querySelector(sel);
const qa = (sel) => [...document.querySelectorAll(sel)];
const tick = () => new Promise((r) => setTimeout(r, 0));
const muster = (ui = {}) => { const s = migrate(clone(EXAMPLE)); Object.assign(s.ui, { mode: 'form', edited: true, open: { liegenschaften: true, wuensche: true, einkommen: true, vermoegen: true, annahmen: true } }, ui); return s; };

describe('Übungsmodus (C10)', () => {
  it('der unveränderte Musterfall gilt nicht als eigene Angabe, nach der ersten Eingabe schon', () => {
    const s = migrate(clone(EXAMPLE));
    Object.assign(s.ui, { practice: true, edited: false });
    expect(hatEigenes(s)).toBe(false);
    markEdited(s);
    expect(s.ui.practice).toBe(false);
    expect(hatEigenes(s)).toBe(true);
  });
  it('nach einer Eingabe im Übungsmodus fragt der Tutor nach, bevor er die Angaben ersetzt', async () => {
    const s = migrate(clone(EXAMPLE));
    Object.assign(s.ui, { practice: true, edited: false, mode: 'form', tutorStep: 'start', open: { vermoegen: true } });
    const { app } = boot(s);
    const el = q('#form [data-path="liquiditaet"]');
    el.focus();
    el.value = '123456';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    expect(app.S.liquiditaet).toBe(123456);
    app.antwort = false;
    q('#tutor [data-tact="own"]').click();
    await tick();
    expect(app.confirms).toHaveLength(1);
    expect(app.S.liquiditaet).toBe(123456);
  });
  it('der Rahmen der App verwendet dieselbe Regel und beendet den Übungsmodus bei jeder Eingabe', () => {
    const main = lies('src/modules/07c-pension.ts');
    expect(main).toMatch(/app\.hatEigenes = \(\) => hatEigenes\(app\.S\)/);
    expect(main).toMatch(/app\.changed = \(o: ChangedOptionen = \{\}\) => \{[\s\S]{0,200}?markEdited\(app\.S\)/); // bbz360: typisierte Form
    expect(lies('src/pension-ui/tutor.ts')).not.toMatch(/s\.ui\.edited = true;(?! s\.ui\.practice = false;)/);
  });
});

describe('Formular: Fokus, Rückfrage und Beschriftungen (N6, N7)', () => {
  // Wünsche werden über die Themenkarten bearbeitet (Leiste #themenleiste, Editor #themaEdit)
  it('nach dem Entfernen eines Wunsches bleibt der Fokus in der Liste', async () => {
    const s = muster();
    s.wuensche.push({ typ: 'einmal', aktiv: true, name: 'Weltreise', betrag: 30000, alter: 66 });
    boot(s);
    const n = qa('#themenleiste [data-thema]').length;
    expect(n).toBeGreaterThan(1);
    q('#themenleiste [data-thema="w0"]').click();
    q('#themaEdit [data-thema-weg]').click();
    await tick();
    expect(qa('#themenleiste [data-thema]')).toHaveLength(n - 1);
    expect(document.activeElement.dataset.thema).toBe('w0');
  });
  it('wird der letzte Eintrag entfernt, steht der Fokus auf «hinzufügen»; ein neuer Eintrag erhält den Fokus', async () => {
    const s = muster();
    s.wuensche = [{ typ: 'einmal', aktiv: true, name: 'Weltreise', betrag: 30000, alter: 66 }];
    const { app } = boot(s);
    q('#themenleiste [data-thema="w0"]').click();
    q('#themaEdit [data-thema-weg]').click();
    await tick();
    expect(app.S.wuensche).toHaveLength(0);
    expect(document.activeElement.id).toBe('btnThema');
    q('#form [data-amadd="0"]').click();
    await tick();
    expect(document.activeElement.dataset.am).toBe(String(app.S.amortisationen.length - 1));
    expect(document.activeElement.dataset.k).toBe('betrag');
  });
  it('eine Liegenschaft mit Amortisationen wird erst nach Rückfrage entfernt', async () => {
    const s = muster();
    s.amortisationen = [{ lg: 0, betrag: 50000, jahr: 2029, monat: 3, quelle: 'frei' }];
    const { app } = boot(s);
    app.antwort = false;
    q('#form [data-lgdel="0"]').click();
    await tick();
    expect(app.confirms[0]).toMatch(/Liegenschaft entfernen\?.*Amortisation/);
    expect(app.S.liegenschaften).toHaveLength(1);
    app.antwort = true;
    q('#form [data-lgdel="0"]').click();
    await tick();
    expect(app.S.liegenschaften).toHaveLength(0);
    expect(app.S.amortisationen).toHaveLength(0);
  });
  it('die Zahl der Einträge ist begrenzt und wird gemeldet', async () => {
    const s = muster();
    s.wuensche = Array.from({ length: 20 }, (_, k) => ({ typ: 'einmal', aktiv: false, name: `W${k}`, betrag: 1, alter: 70 }));
    const { app } = boot(s);
    q('#btnThema').click();
    q('#themenDlg [data-karte="anschaffung"]').click();
    await tick();
    expect(app.S.wuensche).toHaveLength(20);
    expect(q('#themenDlg [role="status"]').textContent).toMatch(/Mehr als 20 Wünsche/);
  });
  it('«×» nennt, was entfernt wird', () => {
    const s = muster();
    s.wuensche.push({ typ: 'einmal', aktiv: true, name: 'Weltreise', betrag: 30000, alter: 66 });
    boot(s);
    expect(q('#form [data-lgdel="0"]').getAttribute('aria-label')).toBe('Liegenschaft Eigenheim entfernen');
    const namen = ['w0', 'w1'].map((k) => { q(`#themenleiste [data-thema="${k}"]`).click(); return q('#themaEdit [data-thema-weg]').getAttribute('aria-label'); });
    expect(namen).toEqual(['Griechenland entfernen', 'Weltreise entfernen']);
  });
  it('Felder mit sichtbarer Beschriftung heissen wie diese (mit Einheit) und sind mit ihrem Hinweis verbunden', () => {
    boot(muster());
    const mitLabel = qa('#form label[for]').map((l) => [l, document.getElementById(l.getAttribute('for'))]).filter(([, f]) => f);
    expect(mitLabel.length).toBeGreaterThan(25);
    for (const [l, f] of mitLabel) {
      const al = f.getAttribute('aria-label');
      if (al) expect(l.textContent.trim(), f.id).toContain(al);
    }
    const aus = q('#f_ausgabenRuhestand');
    expect(aus.hasAttribute('aria-label')).toBe(false);
    expect(document.getElementById(aus.getAttribute('aria-describedby')).textContent).toMatch(/ohne Steuern/);
    // keine Beschriftung ohne Feld
    expect(qa('#form label:not([for]):not(.check)')).toHaveLength(0);
  });
  it('Felder, die negative Werte erlauben, haben eine Tastatur mit Minuszeichen', () => {
    boot(muster());
    expect(q('#f_inflation').getAttribute('inputmode')).toBe('text');
    expect(q('#f_liquiditaet').getAttribute('inputmode')).toBe('decimal');
  });
  it('der Hinweis zum Nebenerwerb nennt die Bedingung der Befreiung', () => {
    boot(muster());
    expect(q('#form').textContent).toMatch(/mindestens der Mindestbeitrag und die Hälfte dieser Beiträge/);
    expect(q('#form').textContent).not.toMatch(/Solange ein Nebenerwerb läuft, fallen keine AHV-Beiträge/);
  });
});

describe('Tutor, Tabellen und Diagramme (N7, N8)', () => {
  it('die Felder beider Personen stehen in benannten Gruppen', () => {
    boot(muster({ mode: 'tutor', tutorStep: 'personen', tutorMax: 99 }));
    const g = qa('#tutor .tperson[role="group"]').map((x) => x.getAttribute('aria-label'));
    expect(g).toEqual(['Person 1 (Sie)', 'Person 2']);
  });
  it('breite Tabellen sind per Tastatur scrollbar, Spaltenköpfe sind ausgezeichnet', () => {
    const { results } = boot(muster());
    q('#resTabs [data-ansicht="jahre"]').click();
    results.render();
    const wraps = qa('#results .tblwrap');
    expect(wraps.length).toBeGreaterThan(0);
    for (const w of wraps) { expect(w.getAttribute('tabindex')).toBe('0'); expect(w.getAttribute('role')).toBe('region'); }
    expect(qa('#results table.cmp thead th:not([scope])')).toHaveLength(0);
    expect(q('#resTabs').getAttribute('aria-label')).toBe('Auswertungen');
  });
  it('Diagrammwerte sind mit den Pfeiltasten erreichbar und werden angesagt', () => {
    document.body.innerHTML = '<div id="c" style="width:600px"></div>';
    const host = q('#c');
    lineChart(host, { label: 'Vermögensverlauf', series: [{ color: 'black', pts: [[60, 1], [61, 2], [62, 3]] }], tip: (i) => `<b>Alter ${60 + i}</b>` });
    const svg = q('#c svg'), tip = q('#c .tip');
    expect(svg.getAttribute('tabindex')).toBe('0');
    expect(tip.getAttribute('role')).toBe('status');
    svg.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(tip.hidden).toBe(false);
    expect(tip.textContent).toBe('Alter 60');
    svg.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }));
    expect(tip.textContent).toBe('Alter 62');
    svg.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(tip.hidden).toBe(true);
  });
  it('die Ampel im mobilen Reiter trägt Text, Statusleisten werden angesagt, externe Links kündigen das neue Fenster an', () => {
    expect(html).toMatch(/id="mlampTxt"/);
    expect(lies('src/modules/07c-pension.ts')).toMatch(/gruen: ': reicht', gelb: ': knapp', rot: ': reicht nicht'/);
    // bbz360: Die Leisten «Willkommen zurück» und «Neue Version» gibt es im Modul nicht.
    expect(html).toMatch(/id="rechenFehler" role="alert" hidden/);
    // der Hinweis steht ausserhalb des Ergebnisses, damit er auch im Tutor und in der mobilen Ansicht «Eingaben» sichtbar ist
    expect(html.indexOf('id="rechenFehler"')).toBeLessThan(html.indexOf('<main'));
    const extern = [...html.matchAll(/<a\b[^>]*target="_blank"[^>]*>([\s\S]*?)<\/a>/g)].filter((m) => !/aria-label=/.test(m[0]));
    for (const m of extern) expect(m[0]).toMatch(/öffnet in neuem Fenster/);
  });
});

describe('Texte ohne persönliche Vorschläge (R10, R11) und Ergänzungen (R12)', () => {
  const E = createEngine(P, A0, Pn);
  const faelle = () => {
    const a = migrate(clone(EXAMPLE));
    const b = migrate(clone(EXAMPLE));
    Object.assign(b.personen[0], { pensAlter: 56, ahvBezug: -1, pkKapital: 300000 });
    b.liquiditaet = 600000;
    return [a, b];
  };
  const wertung = /\bVorschlag\b|\bvertretbar\b|\beinplanen\b|nicht anlegen|\bempfehl|\bsollten Sie\b|Auf zwei Stiftungen aufteilen, damit/i;
  it('Aktionsplan und Ansatzpunkte enthalten keine Wertung oder Anweisung zum Kapital', () => {
    for (const s of faelle()) {
      const R = analyse(s, E);
      for (const x of R.akt) expect(`${x.titel} ${x.text}`, x.titel).not.toMatch(wertung);
      for (const o of R.opt) expect(`${o.t} ${o.x}`, o.t).not.toMatch(wertung);
    }
  });
  it('die Tragbarkeitsbox spricht von einer Rechenvariante, der Fixkostentext wertet nicht', () => {
    boot(muster());
    const t = q('#results').textContent;
    expect(t).not.toMatch(/Vorschlag|vertretbar|einplanen|nicht anlegen/);
    expect(t).toMatch(/Rechenvariante/);
    expect(q('#results [data-apply]').textContent).toBe('Variante in die Eingaben übernehmen');
  });
  it('Rechenbeispiele zu Wertschriften sind als solche bezeichnet und verweisen auf die Eignungsprüfung', () => {
    const b = migrate(clone(EXAMPLE));
    b.liquiditaet = 900000;
    const opt = analyse(b, E).opt.filter((o) => /Anlage der|Höhe der Liquidität/.test(o.t));
    expect(opt.length).toBeGreaterThan(0);
    for (const o of opt) { expect(o.x).toMatch(/Rechenbeispiel, keine Renditeprognose/); expect(o.x).toMatch(/Eignungsprüfung|Risikofähigkeit/); }
  });
  it('die Datenschutzhinweise nennen Teilen-Dialog, Kalenderdatei, Aktualisierungen und die Grundlage für die USA', () => {
    const ds = DATENSCHUTZ.punkte.map(([t, x]) => `${t}: ${x}`).join('\n');
    expect(ds).toMatch(/Teilen-Dialog/);
    expect(ds).toMatch(/Kalenderdatei enthält Termine mit Beträgen/);
    expect(ds).toMatch(/nach Aktualisierungen sucht/);
    expect(ds).toMatch(/Swiss-U\.S\. Data Privacy Framework/);
    expect(ds).toMatch(/Standardvertragsklauseln/);
    expect(ds).toMatch(/zwei technische Merker/);
    // bbz360: Die beiden Merker (iOS-Hinweis, Sitzung) setzt nur der öffentliche PensCheck; das Modul setzt keine.
    const main = lies('src/modules/07c-pension.ts');
    expect(main).not.toMatch(/penscheck-ioshint|penscheck-sitzung/);
  });
  it('die Grenzen nennen Einkommensteilung, Plafonierung, Kapitalbezugssteuer und bereits Pensionierte', () => {
    const g = GRENZEN.map(([t, x]) => `${t}: ${x}`).join('\n');
    expect(g).toMatch(/Einkommen hälftig geteilt/);
    expect(g).toMatch(/Erziehungs- und Betreuungsgutschriften/);
    expect(g).toMatch(/150% der Maximalrente/);
    expect(g).toMatch(/Steuer auf Kapitalbezügen:.*Teuerung fortgeschrieben/);
    expect(g).toMatch(/Bereits pensioniert:/);
  });
  it('README widerspricht der App nicht mehr; Sperrfrist und Unfalldeckung sind genau gefasst', () => {
    // bbz360: Die Prüfung des PensCheck-README entfällt (anderes Repo).
    expect(lies('src/pension-ui/glossar.ts')).toMatch(/Art\. 79b Abs\. 3 BVG/);
    const akt = lies('src/lib/pension/aktion.ts');
    expect(akt).toMatch(/Art\. 3 Abs\. 2 UVG/);
    expect(akt).toMatch(/Abredeversicherung/);
  });
});

// bbz360: Der tägliche Prüflauf (Workflow) ist nicht übernommen; die Prüfungen laufen, sobald die Datei existiert.
const wfDa = (() => { try { lies('.github/workflows/verify-sources.yml'); return true; } catch { return false; } })();
describe.skipIf(!wfDa)('Prüflauf und Prüfstand (Q9, Q10, Q11)', () => {
  const wf = wfDa ? lies('.github/workflows/verify-sources.yml') : '';
  it('ein abgebrochener Lauf eröffnet ein Issue', () => {
    expect(wf).toMatch(/if: \$\{\{ !cancelled\(\) && \(failure\(\) \|\| steps\.verify\.outputs\.alerts != ''/);
    expect(wf).toMatch(/Der Prüflauf ist abgebrochen/);
    // Funktionen wie failure() sind nur in «if» erlaubt, nicht in env (sonst weist GitHub die Datei ab)
    const envZeilen = wf.split('\n').filter((z) => /^\s+[A-Z_]+: \$\{\{/.test(z));
    expect(envZeilen.length).toBeGreaterThan(5);
    for (const z of envZeilen) expect(z, z).not.toMatch(/failure\(\)|success\(\)|cancelled\(\)|always\(\)/);
    expect(wf).toMatch(/JOB_STATUS: \$\{\{ job\.status \}\}/);
    expect(wf).toMatch(/if: \$\{\{ !cancelled\(\) && needs\.verify\.outputs\.unbestaetigt != ''/);
  });
  it('bei offenem Pull Request wird der Prüfstand auf main trotzdem nachgeführt', () => {
    const teil = wf.slice(wf.indexOf('branch="daten/grundlagen"'), wf.indexOf('elif ! git diff --quiet -- public/data/verification.json'));
    // zuerst main nachführen, dann den Branch davon abzweigen (kein Konflikt im Pull Request)
    const iMain = teil.indexOf('node scripts/verify-sources.mjs'), iBranch = teil.indexOf('git switch -c "$branch"');
    expect(iMain).toBeGreaterThan(0);
    expect(iBranch).toBeGreaterThan(iMain);
    expect(teil.slice(0, iBranch)).toMatch(/git checkout -- public\/data\/params\.json public\/data\/verification\.json/);
    expect(teil.slice(0, iBranch)).toMatch(/git add public\/data\/verification\.json[\s\S]*git push[\s\S]*changed=true/);
    expect(teil.slice(iBranch)).toMatch(/cp "\$neu\/params\.json" "\$neu\/verification\.json" public\/data\//);
  });
  it('ein alter Prüfstand wird in der App als veraltet gezeigt', () => {
    const { app } = boot(muster());
    app.pruefungVeraltet = true;
    renderSources(app);
    expect(q('#sources')?.textContent || document.body.textContent).toMatch(/Prüfung veraltet/);
    const main = lies('src/modules/07c-pension.ts');
    expect(main).toMatch(/app\.pruefungVeraltet = alt > 10/);
    expect(main).toMatch(/Prüfung vor \$\{Math\.floor\(alt\)\} Tagen/);
  });
  it('kein Suchmuster besteht nur aus einem Bruch oder zwei nackten Zahlen ohne Zusammenhang', () => {
    const alle = [];
    for (const p of [...Object.values(params.params), ...Object.values(params.tables)]) for (const s of p.sources || []) for (const m of s.match || []) alle.push(m);
    expect(alle.length).toBeGreaterThan(100);
    for (const m of alle) {
      expect(musterMitKontext(m), m).toBe(true);
      expect(m, m).not.toMatch(/^re:\d+\/\d+$/);
      expect(m, m).not.toMatch(/^re:\d+\\\.\d+\\s\+\d+\\\.\d+$/);
    }
  });
});

describe('Anzeigen stimmen mit der Rechnung überein', () => {
  it('die AHV-Schätzung im Formular zeigt bei Ehepaaren die plafonierte Rente', () => {
    const { app } = boot(muster({ open: { ahv: true, personen: true, einkommen: true } }));
    const pl = app.E.ahvPlan(app.S);
    const est = qa('#form [data-ahvest]').map((el) => el.textContent);
    expect(est).toHaveLength(2);
    expect(est[0]).toContain(String(Math.round(pl.dauer[0])).replace(/\B(?=(\d{3})+(?!\d))/g, '’'));
    expect(pl.summe).toBeCloseTo(P.ahv.plafondEhepaar, 0);
    expect(q('#form [data-sum="ahv"]').textContent).toMatch(/≈ CHF 1’8\d\d/);
  });
  it('der Hinweis zur Übergangsgeneration sagt, dass der Rentenzuschlag eingerechnet ist', () => {
    const s = muster();
    Object.assign(s.personen[1], { geschlecht: 'w', jahrgang: 1966 });
    const { app } = boot(s);
    // Die Hinweise stehen in der Ansicht «Hinweise» und im Bericht (app.hints), nicht mehr in «Weitere Auswertungen»
    const t = document.body.textContent + app.hints.join(' ');
    expect(t).toMatch(/Rentenzuschlag \(Art\. 34bis AHVG\); er ist eingerechnet/);
    expect(t).not.toMatch(/Rentenzuschlag, der hier nicht enthalten ist/);
  });
  it('auch ein Kundenname gilt als eigene Angabe', () => {
    const s = migrate(clone(EXAMPLE));
    Object.assign(s.ui, { practice: true, edited: false, mode: 'form', open: { haushalt: true } });
    const { app } = boot(s);
    const el = q('#f_bericht_kunde');
    el.value = 'Muster AG';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    expect(app.S.bericht.kunde).toBe('Muster AG');
    expect(hatEigenes(app.S)).toBe(true);
  });
  it('nach dem Entfernen einer Amortisation steht der Fokus bei derselben Liegenschaft', async () => {
    const s = muster();
    s.liegenschaften.push({ name: 'Ferienhaus', typ: 'ferien', verkehrswert: 500000, hypothek: 200000, zins: 2, unterhalt: 1, nebenkosten: 0, mietertrag: 0, verkaufAlter: 0 });
    s.amortisationen = [{ lg: 0, betrag: 50000, jahr: 2029, monat: 3, quelle: 'frei' }, { lg: 1, betrag: 20000, jahr: 2030, monat: 3, quelle: 'frei' }];
    boot(s);
    q('#form [data-amdel="1"]').click();
    await tick();
    expect(document.activeElement.dataset.amadd).toBe('1');
  });
});

describe('Angaben, die nicht zusammenpassen (C12)', () => {
  it('werden als Ansatzpunkt «Eingaben prüfen» genannt statt still übergangen', () => {
    const E = createEngine(P, A0, Pn);
    const s = migrate(clone(EXAMPLE));
    s.wuensche = [{ typ: 'jahr', aktiv: true, name: '<b>Segeln</b>', betrag: 5000, von: 70, bis: 65 }];
    s.einkommen = [{ person: 0, art: 'dividende', betrag: 12000, bisJahr: 2020, text: '' }];
    s.amortisationen = [{ lg: 0, betrag: 50000, jahr: 1995, monat: 3, quelle: 'frei' }];
    Object.assign(s.personen[0], { teilAb: 66, teilPensum: 50 });
    const o = analyse(s, E).opt.find((x) => x.t === 'Eingaben prüfen');
    expect(o).toBeTruthy();
    expect(o.x).toMatch(/«von Alter» liegt nicht vor «bis Alter»/);
    expect(o.x).toMatch(/«bis Jahr» 2020 liegt in der Vergangenheit/);
    expect(o.x).toMatch(/Das Jahr 1995 liegt in der Vergangenheit/);
    expect(o.x).toMatch(/Teilpensionierung ab 66 liegt nicht vor der Pensionierung/);
    // der Text steht roh im Resultat; maskiert wird einmal, bei der Darstellung
    expect(o.x).toContain('«<b>Segeln</b>»');
    const { app } = boot(s);
    expect(app.R.opt.some((x) => x.t === 'Eingaben prüfen')).toBe(true);
    expect(q('#opt').innerHTML).toContain('«&lt;b&gt;Segeln&lt;/b&gt;»');
    expect(q('#opt').textContent).toContain('«<b>Segeln</b>»');
    expect(q('#opt b')?.textContent === 'Segeln').toBe(false);
    expect(analyse(migrate(clone(EXAMPLE)), E).opt.some((x) => x.t === 'Eingaben prüfen')).toBe(false);
    // Auslandwunsch mit Kauf: Der Kauf wird gerechnet, der Hinweis sagt das
    const k = migrate(clone(EXAMPLE));
    k.wuensche = [{ typ: 'ausland', aktiv: true, name: 'Kreta', monate: 6, von: 62, bis: 62, wohnform: 'kauf' }];
    const R = analyse(k, E);
    expect(R.opt.find((x) => x.t === 'Eingaben prüfen').x).toMatch(/gerechnet werden nur Kauf, laufende Kosten und Vermietung/);
    expect(R.base.rows.some((r) => r.wAus > 100000)).toBe(true);
    // Vorbezug über dem Höchstwert (z. B. aus einem Link): Der Hinweis nennt den Satz, mit dem gerechnet wird
    const v = migrate(clone(EXAMPLE));
    v.personen[0].ahvBezug = -3;
    const vo = analyse(v, E).opt.find((x) => /AHV-Vorbezug prüfen/.test(x.t));
    expect(vo.x).toMatch(/um 13\.6%/);
    // Lücke ohne Wirkung wegen des Plafonds wird so benannt, nicht mit «CHF 0»
    const l = migrate(clone(EXAMPLE));
    l.personen.forEach((p) => { p.brutto = 200000; });
    l.personen[0].ahvFehlJahre = 1;
    const lo = analyse(l, E).opt.find((x) => /AHV-Beitragslücken prüfen/.test(x.t));
    expect(lo.x).toMatch(/wirken sich nicht mehr aus, sobald beide das Referenzalter erreicht haben/);
    expect(lo.x).not.toMatch(/CHF 0/);
  });
});

describe('Kleineres', () => {
  it('Fehlermeldungen nennen Bereiche mit Tausendertrennung, Jahre ohne', () => {
    expect(rangeError('s3aEinz', 2e5)).toBe('Erlaubt sind Werte von 0 bis 100’000.');
    expect(rangeError('jahrgang', 1900)).toMatch(/^Erlaubt sind Werte von 1920 bis \d{4}\.$/);
    expect(rangeError('liquiditaet', -1)).toBe('Erlaubt sind Werte von 0 bis 10 Mrd.');
  });
  it('Speichern meldet, ob es geklappt hat', () => {
    expect(save(migrate(clone(EXAMPLE)))).toBe(true);
    const orig = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { setItem() { throw new Error('voll'); }, getItem: () => null } });
    try { expect(save(migrate(clone(EXAMPLE)))).toBe(false); } finally { if (orig) Object.defineProperty(globalThis, 'localStorage', orig); else delete globalThis.localStorage; }
  });
  it('die Jahresrechnung im PDF enthält alle Steuern und geht zum Vermögen auf', () => {
    const rep = lies('src/pension-ui/report.ts');
    expect(rep).toMatch(/c\(-x\.steuern - x\.stVerm - x\.stErtrag\), c\(-x\.ne\), c\(x\.wEin - x\.wAus - x\.einz3a \+ x\.lgNetto - x\.amortFrei - \(x\.lgKauf \|\| 0\)\), c\(x\.V\)/); // bbz360: mit Kauf (ADR-19/22)
    // dieselbe Rechnung wie im Rechenkern: Endvermögen = Anfang + alle Spalten
    const E = createEngine(P, A0, Pn);
    const R = analyse(migrate(clone(EXAMPLE)), E);
    for (const x of R.base.rows.slice(0, 12)) {
      const summe = x.lohn + x.uebrig + x.ahv + x.pk + x.kapZu + x.ertrag - x.ausgaben - x.steuern - x.stVerm - x.stErtrag - x.ne + (x.wEin - x.wAus - x.einz3a + x.lgNetto - x.amortFrei);
      expect(x.Vstart + summe, String(x.year)).toBeCloseTo(x.V, 2);
    }
  });
  it('Druck: Das Ergebnis wird auch aus dem Formular und bei schmaler Druckbreite gedruckt', () => {
    const css = lies('src/styles/pension/styles.css');
    const druck = css.slice(css.lastIndexOf('@media print'));
    expect(druck).toMatch(/body\[data-view\] \.results, body\[data-mode\] \.results \{ display: flex !important; \}/);
    expect(druck).toMatch(/\.tblwrap \{ overflow: visible; \}/);
    expect(lies('src/modules/07c-pension.ts')).toMatch(/beforeprint/);
  });
  it('Druck: Im Tutor steht «früher aufhören» im Ausdruck, der übrige Block «Weiter erkunden» nicht', () => {
    const css = lies('src/styles/pension/styles.css');
    const druck = css.slice(css.lastIndexOf('@media print'));
    expect(druck).toMatch(/body\[data-mode="tutor"\] #erkunden \{ display: block; \}/);
    // Geprüft am Aufbau: In «Weiter erkunden» stehen Überschrift, Themenleiste, Karteneditor und der Block «vergleich»
    // (buehne.js verschiebt ihn dorthin); #sofortBox liegt in diesem Block, nicht direkt in #erkunden
    const m = druck.match(/body\[data-mode="tutor"\] #erkunden > ([^{]+?) \{ display: none !important; \}/);
    expect(m).not.toBeNull();
    const html = lies('modules/07c-pension.html');
    document.body.innerHTML = html.slice(html.indexOf('<body'), html.indexOf('</body>')).replace(/^<body[^>]*>/, '').replace(/<script[\s\S]*?<\/script>/g, '');
    expect(lies('src/pension-ui/buehne.ts')).toMatch(/erk\.append\(\$\('themenleiste'\), edit, res\.querySelector\('\[data-block="vergleich"\]'\)\)/);
    const block = document.getElementById('sofortBox').closest('[data-block="vergleich"]');
    expect(block).not.toBeNull();
    expect(block.matches(m[1])).toBe(false);
    for (const id of ['erkundenTitel', 'themenleiste', 'themaEdit']) expect(document.getElementById(id).matches(m[1]), id).toBe(true);
    // Überschrift, Themenleiste und Karteneditor bleiben ohnehin weg
    expect(druck).toMatch(/#erkundenTitel[^{]*#themenleiste[^{]*#themaEdit[^{]*\{ display: none !important; \}/);
  });
});

describe('Budget-Assistent und Fixkosten (Begutachtung nach der Zusammenführung)', () => {
  const E = createEngine(P, A0, Pn);
  it('Budget als Mieter übernommen, danach Eigenheim gewählt: Wohnen folgt der Liegenschaft', async () => {
    const s = migrate(clone(EXAMPLE));
    Object.assign(s, { liegenschaften: [], amortisationen: [] });
    Object.assign(s.ui, { mode: 'tutor', tutorStep: 'ausgaben', tutorMax: 99, edited: true, twohnen: 'miete' });
    const { app, tutor } = boot(s);
    q('#tutor [data-tact="budget-open"]').click();
    await tick();
    q('#tutor [data-tact="budget-apply"]').click();
    await tick();
    expect(app.S.budgetAktiv).toBe(true);
    const miete = +app.S.budget.wohnen;
    expect(+app.S.fix.wohnen).toBe(miete);
    const mitMiete = app.S.ausgabenRuhestand;
    app.S.ui.tutorStep = 'wohnen';
    tutor.render();
    q('#tutor [data-tact="wohnen-eigen"]').click();
    await tick();
    expect(app.S.liegenschaften).toHaveLength(1);
    expect(app.S.fix.wohnen === '' || app.S.fix.wohnen == null).toBe(true);
    // Wohnen des Eigenheims: 500’000 × 1,8% + 900’000 × 0,5% pro Jahr, plus 400 Nebenkosten pro Monat = 1’525
    expect(app.S.ausgabenRuhestand).toBe(mitMiete - miete + 1525);
  });
  it('«Puffer» nennt bei gelber oder roter Ampel, dass er ohne Stresstest gilt', async () => {
    const { pufferText } = await import('../../../src/lib/pension/budget');
    expect(pufferText(10578, 10000, 'gruen')).toBe('Puffer 6%');
    expect(pufferText(10578, 10000, 'gelb')).toBe('Puffer 6% im Basisszenario, ohne Stresstest');
    expect(pufferText(9000, 10000, 'rot')).toBe('es fehlen 10%');
  });
  it('«Renten und Fixkosten» bei bereits Pensionierten: ganze Jahre, kein angebrochenes Startjahr', () => {
    const s = migrate(clone(EXAMPLE));
    Object.assign(s.personen[0], { jahrgang: 1960, pensAlter: 64, brutto: 0 });
    Object.assign(s.personen[1], { jahrgang: 1961, pensAlter: 64, brutto: 0 });
    const R = analyse(s, E);
    expect(R.fix).toBeTruthy();
    expect(R.fix.Y).toBe(2027);
    expect(R.fix.a.q).toBeGreaterThan(1);
    expect(R.fixRows[0].year).toBe(2027);
    // auch wenn der Rentenbeginn Jahre zurückliegt
    Object.assign(s.personen[0], { jahrgang: 1957 });
    Object.assign(s.personen[1], { jahrgang: 1958 });
    expect(analyse(s, E).fix).toBeTruthy();
  });
  it('Teilpensionierung in der Vergangenheit: Das Teilkapital gilt als bezogen', () => {
    const s = migrate(clone(EXAMPLE));
    Object.assign(s.personen[0], { jahrgang: 1964, pensAlter: 65, teilAb: 60, teilPensum: 60, teilPK: 'teilbezug', pkKapital: 238000 });
    const r = E.simulate({ ...s, horizont: 95 });
    expect(r.kapListe.some((k) => k.art === 'PK-Teilkapital')).toBe(false);
  });
});

describe('Budget-Assistent: Miete bleibt erhalten oder weicht dem Eigenheim', () => {
  it('eine von Hand erfasste Miete weicht dem Eigenheim und kommt mit «Zur Miete» zurück', async () => {
    const s = migrate(clone(EXAMPLE));
    Object.assign(s, { liegenschaften: [], amortisationen: [] });
    s.fix.wohnen = 1830;
    Object.assign(s.ui, { mode: 'tutor', tutorStep: 'wohnen', tutorMax: 99, edited: true, twohnen: 'miete' });
    const { app } = boot(s);
    q('#tutor [data-tact="wohnen-eigen"]').click();
    await tick();
    expect(app.S.fix.wohnen === '' || app.S.fix.wohnen == null).toBe(true);
    expect(app.R.wohnen.art).toBe('aus Liegenschaft');
    app.antwort = true;
    q('#tutor [data-tact="wohnen-miete"]').click();
    await tick();
    expect(+app.S.fix.wohnen).toBe(1830);
  });
  it('ein verworfener Entwurf überschreibt die erfasste Miete nicht', async () => {
    const s = migrate(clone(EXAMPLE));
    Object.assign(s, { liegenschaften: [], amortisationen: [], budget: {}, budgetAktiv: false });
    s.fix.wohnen = 1830;
    Object.assign(s.ui, { mode: 'tutor', tutorStep: 'ausgaben', tutorMax: 99, edited: true, twohnen: 'miete' });
    const { app } = boot(s);
    q('#tutor [data-tact="budget-open"]').click();
    await tick();
    const preset = q('#tutor [data-tact="budget-preset"]');
    if (preset) { preset.click(); await tick(); }
    q('#tutor [data-tact="budget-close"]').click();
    await tick();
    expect(+app.S.fix.wohnen).toBe(1830);
    expect(Object.keys(app.S.budget || {})).toHaveLength(0);
  });
});

describe('Budget-Entwurf: Stand vor dem Öffnen wird vollständig wiederhergestellt', () => {
  const start = (aendern = () => {}) => {
    const s = migrate(clone(EXAMPLE));
    Object.assign(s, { liegenschaften: [], amortisationen: [], budget: {}, budgetAktiv: false });
    s.fix.wohnen = 1830;
    Object.assign(s.ui, { mode: 'tutor', tutorStep: 'ausgaben', tutorMax: 99, edited: true, twohnen: 'miete' });
    aendern(s);
    return boot(s);
  };
  const klick = async (sel) => { q(sel).click(); await tick(); };
  const beispiel = async () => { [...document.querySelectorAll('#tutor [data-tact="budget-preset"]')].pop().click(); await tick(); };
  /** Der Stand, wie er nach Speichern und erneutem Laden gilt (Neuladen, zweites Fenster, Schliessen der Seite). */
  const neuGeladen = (app) => migrate(JSON.parse(JSON.stringify(app.S)));

  it('gespeichertes, nicht aktives Budget: «Zurück ohne Übernehmen» lässt Budget und Miete unverändert', async () => {
    const { app } = start();
    await klick('#tutor [data-tact="budget-open"]');
    await klick('#tutor [data-tact="budget-apply"]');
    const budget = { ...app.S.budget }, miete = app.S.fix.wohnen;
    app.S.budgetAktiv = false; // Betrag danach von Hand geändert: Das Budget bleibt gespeichert, gilt aber nicht
    await klick('#tutor [data-tact="budget-open"]');
    await beispiel();
    expect(app.S.budget).not.toEqual(budget);
    await klick('#tutor [data-tact="budget-close"]');
    expect(app.S.budget).toEqual(budget);
    expect(app.S.fix.wohnen).toBe(miete);
    expect(app.S.ui.entwurf).toBeUndefined();
  });
  it('Seite wird mitten im Entwurf neu geladen oder geschlossen: Es gilt der Stand vor dem Öffnen', async () => {
    const { app } = start();
    await klick('#tutor [data-tact="budget-open"]');
    await beispiel();
    expect(+app.S.fix.wohnen).not.toBe(1830);
    const geladen = neuGeladen(app);
    expect(+geladen.fix.wohnen).toBe(1830);
    expect(Object.keys(geladen.budget)).toHaveLength(0);
    expect(geladen.budgetAktiv).toBe(false);
    expect(geladen.ui.entwurf).toBeUndefined();
    // mit einem gespeicherten, nicht aktiven Budget: dieses Budget, nicht der Entwurf
    const b = start();
    await klick('#tutor [data-tact="budget-open"]');
    await klick('#tutor [data-tact="budget-apply"]');
    const budget = { ...b.app.S.budget };
    b.app.S.budgetAktiv = false;
    await klick('#tutor [data-tact="budget-open"]');
    await beispiel();
    expect(neuGeladen(b.app).budget).toEqual(budget);
  });
  it('ein aktives Budget bleibt mit seinen Änderungen bestehen: beim Neuladen, über die Leiste und beim Wechsel ins Formular', async () => {
    const { app, tutor } = start();
    await klick('#tutor [data-tact="budget-open"]');
    await klick('#tutor [data-tact="budget-apply"]');
    await klick('#tutor [data-tact="budget-open"]');
    await beispiel();
    const budget = { ...app.S.budget };
    expect(app.S.budgetAktiv).toBe(true);
    const geladen = neuGeladen(app);
    expect(geladen.budgetAktiv).toBe(true);
    expect(geladen.budget).toEqual(budget);
    expect(tutor.entwurfBeenden()).toBe(true);
    expect(app.S.budget).toEqual(budget);
    expect(app.S.budgetAktiv).toBe(true);
    expect(app.S.ui.entwurf).toBeUndefined();
  });
  it('Wechsel ins Formular bei offenem Entwurf: Der Entwurf ist verworfen, spätere Eingaben im Formular bleiben', async () => {
    const { app, tutor } = start();
    await klick('#tutor [data-tact="budget-open"]');
    await beispiel();
    expect(tutor.entwurfBeenden()).toBe(true); // so ruft es app.setMode auf
    expect(+app.S.fix.wohnen).toBe(1830);
    expect(Object.keys(app.S.budget)).toHaveLength(0);
    // Eingaben danach gelten und überstehen das Neuladen
    app.S.fix.wohnen = 2000;
    app.S.budget = { kk: 777 };
    const geladen = neuGeladen(app);
    expect(+geladen.fix.wohnen).toBe(2000);
    expect(geladen.budget).toEqual({ kk: 777 });
    expect(lies('src/modules/07c-pension.ts')).toMatch(/m !== app\.S\.ui\.mode && tutor\.entwurfBeenden\(\)\) \{ formDirty = true; schedule\(150\); \}/);
  });
  it('wird der Datenbestand ersetzt, ist der Assistent zu und nichts aus dem alten Entwurf wird angewandt', async () => {
    const { app, tutor } = start();
    await klick('#tutor [data-tact="budget-open"]');
    await beispiel();
    const neu = migrate(clone(EXAMPLE));
    Object.assign(neu, { liegenschaften: [], amortisationen: [], budget: {}, budgetAktiv: false });
    neu.fix.wohnen = 999;
    Object.assign(neu.ui, { mode: 'tutor', tutorStep: 'ausgaben', tutorMax: 99, edited: true, twohnen: 'miete' });
    app.replaceState(neu);
    expect(q('#tutor [data-tact="budget-close"]')).toBeNull();
    expect(q('#tutor [data-tact="budget-open"]')).toBeTruthy();
    tutor.go('lohn');
    expect(+app.S.fix.wohnen).toBe(999);
  });
  it('im Entwurf ein Eigenheim erfasst, dann verworfen: Wohnen folgt der Liegenschaft, nicht der alten Miete', async () => {
    const { app, tutor } = start();
    await klick('#tutor [data-tact="budget-open"]');
    app.S.liegenschaften.unshift({ name: 'Eigenheim', typ: 'eigen', verkehrswert: 900000, hypothek: 500000, zins: 1.8, unterhalt: 0.5, nebenkosten: 400, mietertrag: 0, verkaufAlter: 0 });
    app.S.fix.wohnen = '';
    tutor.entwurfBeenden();
    expect(app.S.fix.wohnen === '' || app.S.fix.wohnen == null).toBe(true);
    // dasselbe nach Neuladen statt Schliessen
    const b = start();
    await klick('#tutor [data-tact="budget-open"]');
    b.app.S.liegenschaften.unshift({ name: 'Eigenheim', typ: 'eigen', verkehrswert: 900000, hypothek: 500000, zins: 1.8, unterhalt: 0.5, nebenkosten: 400, mietertrag: 0, verkaufAlter: 0 });
    const geladen = neuGeladen(b.app);
    expect(geladen.fix.wohnen === '' || geladen.fix.wohnen == null).toBe(true);
  });
  it('ein präparierter Entwurf im Link oder Speicher wird geprüft wie alles andere', () => {
    const s = migrate({ ...clone(EXAMPLE), ui: { entwurf: { budget: { kk: '<img onerror=1>', haushalt: 1e99, __proto__: { x: 1 } }, basis: '<b>', miete: -5 } } });
    expect(s.ui.entwurf).toBeUndefined();
    expect(s.budget.kk).toBeUndefined();
    expect(s.budget.haushalt).toBeLessThanOrEqual(1e6);
    expect(s.budgetBasis).toBe('');
    expect(Object.prototype.x).toBeUndefined();
  });
  it('eine gemerkte Miete gilt nur für denselben Datenbestand', async () => {
    const { app, tutor } = start((s) => { s.ui.tutorStep = 'wohnen'; });
    await klick('#tutor [data-tact="wohnen-eigen"]');
    const neu = migrate(clone(EXAMPLE));
    Object.assign(neu, { liegenschaften: [], amortisationen: [] });
    Object.assign(neu.ui, { mode: 'tutor', tutorStep: 'wohnen', tutorMax: 99, edited: true, twohnen: 'miete' });
    app.replaceState(neu);
    tutor.render();
    await klick('#tutor [data-tact="wohnen-eigen"]');
    app.antwort = true;
    await klick('#tutor [data-tact="wohnen-miete"]');
    expect(app.S.fix.wohnen === '' || app.S.fix.wohnen == null).toBe(true);
  });
});

describe('Budget-Entwurf: Neuberechnung und gemerkte Miete', () => {
  const start = () => {
    const s = migrate(clone(EXAMPLE));
    Object.assign(s, { liegenschaften: [], amortisationen: [], budget: {}, budgetAktiv: false });
    s.fix.wohnen = 1830;
    Object.assign(s.ui, { mode: 'tutor', tutorStep: 'ausgaben', tutorMax: 99, edited: true, twohnen: 'miete' });
    return boot(s);
  };
  const klick = async (sel) => { q(sel).click(); await tick(); };
  it('nach dem Verwerfen wird neu gerechnet: Die Wohnkosten im Ergebnis sind wieder die alten', async () => {
    const { app } = start();
    await klick('#tutor [data-tact="budget-open"]');
    [...document.querySelectorAll('#tutor [data-tact="budget-preset"]')].pop().click();
    await tick();
    expect(Math.round(app.R.wohnen.v)).not.toBe(1830);
    await klick('#tutor [data-tact="budget-close"]');
    expect(app.neuGerechnet).toBeGreaterThan(0);
    expect(Math.round(app.R.wohnen.v)).toBe(1830);
  });
  it('«Im Eigenheim» im offenen Entwurf merkt die Miete von vor dem Entwurf', async () => {
    const { app, tutor } = start();
    await klick('#tutor [data-tact="budget-open"]');
    [...document.querySelectorAll('#tutor [data-tact="budget-preset"]')].pop().click();
    await tick();
    expect(+app.S.fix.wohnen).not.toBe(1830);
    tutor.entwurfBeenden();
    await tick();
    // jetzt gilt wieder 1830; der Ablauf «Eigenheim → Miete» stellt genau diese Miete wieder her
    app.S.ui.tutorStep = 'wohnen';
    tutor.render();
    await klick('#tutor [data-tact="wohnen-eigen"]');
    app.antwort = true;
    await klick('#tutor [data-tact="wohnen-miete"]');
    expect(+app.S.fix.wohnen).toBe(1830);
  });
});
