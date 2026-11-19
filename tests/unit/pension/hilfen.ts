// @ts-nocheck — Testhilfen, aus PensCheck (tests/hilfen.js, Stand 4830eff) übernommen; nur Pfade angepasst.
// Gemeinsame Hilfen der Oberflächentests: Seitengerüst, App ohne Worker, Eingabe-Helfer, Schadcode-Prüfung.
import { expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import params from '../../../public/data/params.json';
import verification from '../../../public/data/verification.json';
import { createEngine } from '../../../src/lib/pension/engine';
import { resolveParams, nextParams } from '../../../src/lib/pension/params';
import { applyBudget } from '../../../src/lib/pension/analyse';
import { auswerten } from '../../../src/lib/pension/auswertung';
import { EXAMPLE, clone, hatEigenes, markEdited } from '../../../src/lib/pension/state';
import { createForm } from '../../../src/pension-ui/form';
import { createResults } from '../../../src/pension-ui/results';
import { createTutor } from '../../../src/pension-ui/tutor';
import { createSchritte } from '../../../src/pension-ui/schritte';
import { createBuehne } from '../../../src/pension-ui/buehne';
import { createThemen } from '../../../src/pension-ui/themenui';
import { createVergleich } from '../../../src/pension-ui/vergleich';
import { variantenZustaende, vergleichSig, rechenEingaben } from '../../../src/lib/pension/themen';
import { renderSources } from '../../../src/pension-ui/sources';
import { initGlossar } from '../../../src/pension-ui/glossar';

const html = readFileSync(resolve(process.cwd(), 'modules/07c-pension.html'), 'utf8');
const body = html.slice(html.indexOf('<body'), html.indexOf('</body>')).replace(/^<body[^>]*>/, '').replace(/<script[\s\S]*?<\/script>/g, '');
export const A0 = 2026 * 12 + 10;
export const b64 = (o) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

let letzteApp = null;
/** Ergebnis (app.R) der App aus dem letzten boot(). */
export const bootR = () => letzteApp?.R;

/** App wie in main.js, aber ohne Worker: Die Rechnung läuft direkt. */
export function boot(S) {
  document.body.innerHTML = body;
  const P = resolveParams(params, 2026), Pn = nextParams(params, 2026);
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
  const form = createForm(app), schritte = createSchritte(app), results = createResults(app), buehne = createBuehne(app, results), tutor = createTutor(app), themen = createThemen(app), vergleich = createVergleich(app);
  app.varianten = () => variantenZustaende(app.S, app.E);
  app.formRender = () => form.render();
  // Wie im Worker-Ablauf (main.js): Auftrag aus rechenEingaben, das Ergebnis trägt die Kennung des Vergleichs, zu dem
  // R.varianten gehört. Wie in fullRender (main.js) läuft die Schrittleiste beim Start einmal vor dem ersten Ergebnis.
  const compute = () => { app.R = auswerten(rechenEingaben(app.S), app.E, results.stopA(), {}, app.varianten().map(rechenEingaben)); app.R.vsig = vergleichSig(app.S); results.render(); schritte.render(); themen.render(); vergleich.render(); buehne.render(); tutor.onResult(); };
  app.changed = (o = {}) => { applyBudget(app.S, app.E); markEdited(app.S); form.reflect(o.except || document.activeElement); if (o.rerender) o.rerender(); compute(); };
  app.stopChanged = compute;
  app.replaceState = (ns) => { app.S = ns; form.render(); schritte.render(); tutor.render(); compute(); return true; };
  letzteApp = app;
  form.render();
  schritte.render();
  tutor.render();
  renderSources(app);
  compute();
  return { app, form, schritte, results, buehne, tutor, themen, vergleich, compute };
}
export const type = (el, v) => { el.focus(); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
export const blur = (el) => el.dispatchEvent(new Event('focusout', { bubbles: true }));
export const q = (sel) => document.querySelector(sel);
export const tick = () => new Promise((r) => setTimeout(r, 0));

export const BOESE = '"><img src=x onerror="window.__xss=1"><svg onload="window.__xss=1"></svg><script>window.__xss=1</script>';
/** Präparierter Link: Schadcode in jedem Freitext und in Feldern, die Zahlen oder Auswahlwerte erwarten. */
export function boeserLink() {
  const s = clone(EXAMPLE);
  delete s.ui;
  s.kanton = BOESE;
  s.tragGrenze = BOESE;
  s.steuerEink = BOESE;
  s.inflation = BOESE;
  s.bericht = { kunde: BOESE, datum: BOESE, berater: BOESE };
  s.personen[0].pensAlter = BOESE;
  s.liegenschaften = [{ ...s.liegenschaften[0], name: BOESE, zins: BOESE }, { name: BOESE, typ: 'rendite', verkehrswert: 800000, hypothek: 300000, zins: 2, unterhalt: 1, mietertrag: 30000, verkaufAlter: 70 }];
  s.amortisationen = [{ lg: 0, betrag: 50000, jahr: 2029, monat: 3, quelle: '3a0' }, { lg: 0, betrag: 20000, jahr: 2031, monat: 3, quelle: BOESE }];
  s.einkommen = [{ person: 0, art: 'dividende', betrag: 12000, bisJahr: 2035, text: BOESE }, { person: 1, art: BOESE, betrag: 5000, bisJahr: 0, text: BOESE }];
  s.wuensche = [
    { typ: 'ausland', aktiv: true, name: BOESE, monate: 8, von: 60, bis: BOESE, wohnform: 'kauf', nebenkosten: BOESE, verkaufAlter: 80 },
    { typ: 'jahr', aktiv: true, name: BOESE, betrag: 5000, von: 60, bis: 70 },
    { typ: 'einmal', aktiv: false, name: BOESE, betrag: 30000, alter: 66 },
    { typ: 'ziel', aktiv: true, name: BOESE, betrag: 100000 },
  ];
  s.aktion = { [BOESE]: 1 };
  return b64({ v: 1, ...s });
}
export function keinSchadcode() {
  expect(window.__xss).toBeUndefined();
  expect(document.querySelectorAll('img[src="x"], svg[onload], [onerror], [onload], script').length).toBe(0);
}
