// @ts-nocheck — Referenztest, aus PensCheck (tests/rahmen.test.js, Stand 4830eff) übernommen; nur Pfade angepasst.
// App-Rahmen ohne Browser: Rechnen im Worker (rechner.js), zweites Fenster (state.js), Zähler der geprüften Grundlagen.
import { describe, it, expect } from 'vitest';
import params from '../../../public/data/params.json';
import verification from '../../../public/data/verification.json';
import { createRechner } from '../../../src/pension-ui/rechner';
import { pruefZahl, resolveParams } from '../../../src/lib/pension/params';
import { createEngine } from '../../../src/lib/pension/engine';
import { EXAMPLE, clone, migrate, nurAngaben, uebernehmeFremd } from '../../../src/lib/pension/state';

/** Worker-Attrappe: merkt sich Aufträge; antworte()/stuerze() spielen den Worker. */
function aufbau(o = {}) {
  const workers = [], ergebnisse = [], fehler = [], timer = [];
  let beginn = 0, stand = { S: { n: 1 }, params: { version: 1 }, A0: 1, stopA: null };
  const rechner = createRechner({
    neuerWorker: () => { const w = { post: [], beendet: false, postMessage(m) { this.post.push(m); }, terminate() { this.beendet = true; } }; workers.push(w); return w; },
    auftrag: () => stand,
    onErgebnis: (R) => ergebnisse.push(R),
    onFehler: (art, d) => fehler.push([art, d]),
    onBeginn: () => { beginn++; },
    limitMs: 20000,
    setTimer: (fn) => { timer.push(fn); return timer.length; },
    clearTimer: () => {},
    ...o,
  });
  const w = () => workers[workers.length - 1];
  const letzter = () => w().post[w().post.length - 1];
  return {
    rechner, workers, ergebnisse, fehler, timer, w, letzter,
    setze: (s) => { stand = { ...stand, ...s }; },
    antworte: (R, id = letzter().id) => w().onmessage({ data: { id, R } }),
    antworteFehler: (error, id = letzter().id) => w().onmessage({ data: { id, error } }),
    beginn: () => beginn,
  };
}

describe('Rechnen im Worker ohne Stau (C11, C13)', () => {
  it('ein Lauf: Auftrag geht an den Worker, das Ergebnis kommt an', () => {
    const a = aufbau();
    a.rechner.rechne();
    expect(a.w().post).toHaveLength(1);
    expect(a.letzter().params).toEqual({ version: 1 });
    a.antworte({ x: 1 });
    expect(a.ergebnisse).toEqual([{ x: 1 }]);
    expect(a.rechner.zustand()).toMatchObject({ unterwegs: false, wartet: false, laeufe: 1 });
  });
  it('viele Eingaben während eines Laufs: danach genau ein Lauf mit dem neuesten Stand, das überholte Ergebnis entfällt', () => {
    const a = aufbau();
    a.rechner.rechne();
    for (let n = 2; n <= 6; n++) { a.setze({ S: { n } }); a.rechner.rechne(); }
    expect(a.w().post).toHaveLength(1); // nichts staut sich im Worker
    expect(a.beginn()).toBe(6); // «rechnet» wird jedes Mal angezeigt
    a.antworte({ alt: true });
    expect(a.ergebnisse).toEqual([]); // überholt
    expect(a.w().post).toHaveLength(2);
    expect(a.letzter().S).toEqual({ n: 6 });
    a.antworte({ neu: true });
    expect(a.ergebnisse).toEqual([{ neu: true }]);
    expect(a.rechner.zustand().laeufe).toBe(2);
  });
  it('die Grundlagen reisen nur mit, wenn der Worker sie noch nicht hat', () => {
    const a = aufbau();
    a.rechner.rechne();
    a.antworte({});
    a.rechner.rechne();
    expect(a.letzter().params).toBeNull();
    a.antworte({});
    a.setze({ params: { version: 2 } });
    a.rechner.rechne();
    expect(a.letzter().params).toEqual({ version: 2 });
  });
  it('Fehler der Rechnung wird gemeldet; ein Fehler eines überholten Laufs nicht', () => {
    const a = aufbau();
    a.rechner.rechne();
    a.antworteFehler('TypeError');
    expect(a.fehler).toEqual([['fehler', 'TypeError']]);
    a.rechner.rechne();
    a.rechner.rechne();
    a.antworteFehler('alt');
    expect(a.fehler).toHaveLength(1);
    a.antworte({ ok: 1 });
    expect(a.ergebnisse).toEqual([{ ok: 1 }]);
  });
  it('Zeitüberschreitung: Worker wird ersetzt, die Grundlagen gehen neu mit, der Fehler wird gemeldet', () => {
    const a = aufbau();
    a.rechner.rechne();
    const alt = a.w();
    a.timer[a.timer.length - 1]();
    expect(alt.beendet).toBe(true);
    expect(a.workers).toHaveLength(2);
    expect(a.fehler).toEqual([['zeit', undefined]]);
    a.rechner.rechne();
    expect(a.letzter().params).toEqual({ version: 1 });
    // eine späte Antwort des ersetzten Workers wird übergangen
    alt.onmessage({ data: { id: 1, R: { spaet: true } } });
    expect(a.ergebnisse).toEqual([]);
  });
  it('Zeitüberschreitung mit wartender Eingabe: kein Fehler, der neueste Stand wird gerechnet', () => {
    const a = aufbau();
    a.rechner.rechne();
    a.setze({ S: { n: 2 } });
    a.rechner.rechne();
    a.timer[0]();
    expect(a.fehler).toEqual([]);
    expect(a.workers).toHaveLength(2);
    expect(a.letzter().S).toEqual({ n: 2 });
    a.antworte({ ok: 2 });
    expect(a.ergebnisse).toEqual([{ ok: 2 }]);
  });
  it('ein abgelaufener Wachhund eines beendeten Laufs tut nichts', () => {
    const a = aufbau();
    a.rechner.rechne();
    a.antworte({ ok: 1 });
    a.timer[0]();
    expect(a.workers).toHaveLength(1);
    expect(a.fehler).toEqual([]);
  });
  it('Absturz des Workers: Neustart; mit wartender Eingabe wird diese gerechnet, sonst der Fehler gemeldet', () => {
    const a = aufbau();
    a.rechner.rechne();
    a.w().onerror({ message: 'kaputt' });
    expect(a.workers).toHaveLength(2);
    expect(a.fehler).toEqual([['fehler', 'kaputt']]);
    a.rechner.rechne();
    a.setze({ S: { n: 9 } });
    a.rechner.rechne();
    a.w().onerror({ message: 'nochmals' });
    expect(a.fehler).toHaveLength(1);
    expect(a.workers).toHaveLength(3);
    expect(a.letzter().S).toEqual({ n: 9 });
  });
  it('Worker lässt sich nicht laden: begrenzte Neustarts, eine Meldung, der nächste Auftrag versucht es wieder', () => {
    const a = aufbau();
    a.rechner.rechne();
    for (let k = 0; k < 10 && a.w().onerror; k++) { const w = a.w(); w.onerror({ message: 'nicht ladbar' }); if (a.w() === w) break; }
    expect(a.workers.length).toBeLessThanOrEqual(3);
    expect(a.fehler).toHaveLength(1);
    expect(a.rechner.zustand()).toMatchObject({ unterwegs: false, bereit: false });
    // weitere Fehlerereignisse alter Worker ändern nichts
    a.workers.forEach((w) => w.onerror({ message: 'spät' }));
    expect(a.fehler).toHaveLength(1);
    a.rechner.rechne();
    expect(a.rechner.zustand().bereit).toBe(true);
    a.antworte({ ok: 1 });
    expect(a.ergebnisse).toEqual([{ ok: 1 }]);
  });
  it('Fehlerereignis ohne laufende Rechnung: Neustart ohne Fehlalarm', () => {
    const a = aufbau();
    a.rechner.rechne();
    a.antworte({ ok: 1 });
    a.w().onerror({ message: 'später Fehler' });
    expect(a.fehler).toEqual([]);
    expect(a.workers).toHaveLength(2);
  });
  it('Ereignisse eines ersetzten Workers werden übergangen', () => {
    const a = aufbau();
    a.rechner.rechne();
    const alt = a.w();
    a.timer[0](); // Zeitüberschreitung: ersetzt
    a.fehler.length = 0;
    a.rechner.rechne();
    alt.onerror({ message: 'alt' });
    alt.onmessage({ data: { id: a.letzter().id, R: { falsch: true } } });
    expect(a.fehler).toEqual([]);
    expect(a.ergebnisse).toEqual([]);
    a.antworte({ richtig: true });
    expect(a.ergebnisse).toEqual([{ richtig: true }]);
  });
  it('lässt sich der Auftrag nicht übergeben, wird das gemeldet und die nächste Rechnung läuft', () => {
    let wirf = true;
    const a = aufbau({});
    const w = a.w(), post = w.postMessage.bind(w);
    w.postMessage = (m) => { if (wirf) throw new Error('nicht übertragbar'); post(m); };
    a.rechner.rechne();
    expect(a.fehler).toHaveLength(1);
    expect(a.rechner.zustand().unterwegs).toBe(false);
    wirf = false;
    a.rechner.rechne();
    expect(w.post).toHaveLength(1);
    expect(a.letzter().params).toEqual({ version: 1 }); // die Grundlagen gelten erst nach geglückter Übergabe als gesendet
  });
  it('lässt sich kein Worker erzeugen, bleibt nichts hängen: Meldung, und der nächste Auftrag versucht es wieder', () => {
    let wirf = false;
    const workers = [], fehler = [], ergebnisse = [], timer = [];
    const rechner = createRechner({
      neuerWorker: () => { if (wirf) throw new Error('kein Worker'); const w = { post: [], postMessage(m) { this.post.push(m); }, terminate() {} }; workers.push(w); return w; },
      auftrag: () => ({ S: {}, params: { v: 1 }, A0: 1, stopA: null }),
      onErgebnis: (R) => ergebnisse.push(R), onFehler: (art) => fehler.push(art),
      setTimer: (fn) => { timer.push(fn); return timer.length; }, clearTimer: () => {},
    });
    rechner.rechne();
    wirf = true;
    workers[0].onerror({ message: 'Absturz' }); // Neustart scheitert
    expect(fehler).toEqual(['fehler']);
    expect(rechner.zustand()).toMatchObject({ unterwegs: false, wartet: false, bereit: false });
    rechner.rechne(); // immer noch kein Worker
    expect(fehler).toEqual(['fehler', 'fehler']);
    expect(rechner.zustand().unterwegs).toBe(false);
    wirf = false;
    rechner.rechne();
    const w = workers[workers.length - 1];
    w.onmessage({ data: { id: w.post[0].id, R: { ok: 1 } } });
    expect(ergebnisse).toEqual([{ ok: 1 }]);
    // eine zweite Antwort mit derselben id wird nicht nochmals angezeigt
    w.onmessage({ data: { id: w.post[0].id, R: { doppelt: 1 } } });
    expect(ergebnisse).toHaveLength(1);
  });
  it('Zeitüberschreitung, wenn sich danach kein Worker erzeugen lässt: Meldung statt Hänger', () => {
    let wirf = false;
    const fehler = [], timer = [];
    const rechner = createRechner({
      neuerWorker: () => { if (wirf) throw new Error('kein Worker'); return { postMessage() {}, terminate() {} }; },
      auftrag: () => ({ S: {}, params: {}, A0: 1, stopA: null }),
      onErgebnis: () => {}, onFehler: (art) => fehler.push(art),
      setTimer: (fn) => { timer.push(fn); return timer.length; }, clearTimer: () => {},
    });
    rechner.rechne();
    rechner.rechne(); // wartet
    wirf = true;
    timer[0]();
    expect(fehler).toEqual(['zeit']);
    expect(rechner.zustand()).toMatchObject({ unterwegs: false, wartet: false });
  });
  it('der Rahmen der App verwendet diesen Ablauf', async () => {
    const { readFileSync } = await import('node:fs');
    const main = readFileSync('src/modules/07c-pension.ts', 'utf8');
    expect(main).toMatch(/const rechner = createRechner\(/);
    expect(main).toMatch(/const compute = \(\): void => \{ rechner\.rechne\(\); \};/); // bbz360: typisierte Form
    expect(main).not.toMatch(/worker\.postMessage|worker\.onmessage/);
  });
});

describe('Zweites Fenster (C12)', () => {
  const s = () => migrate(clone(EXAMPLE));
  it('nur die Oberfläche unterscheidet sich: nichts wird übernommen', () => {
    const a = s(), b = s();
    Object.assign(b.ui, { ansicht: 'jahre', tutorStep: 'pk', stopM: 3, stopY: 2029, open: { ahv: true }, mode: 'form' });
    expect(nurAngaben(a)).toBe(nurAngaben(b));
    expect(uebernehmeFremd(a, b)).toBeNull();
  });
  it('geänderte Angaben werden übernommen, die eigene Ansicht bleibt', () => {
    const a = s(), b = s();
    Object.assign(a.ui, { ansicht: 'kapital', tutorStep: 'ahv', mode: 'tutor', stopY: 2031 });
    b.liquiditaet = 555555;
    Object.assign(b.ui, { ansicht: 'jahre', tutorStep: 'pk', mode: 'form', edited: true, practice: false, savedAt: 123 });
    const neu = uebernehmeFremd(a, b);
    expect(neu.liquiditaet).toBe(555555);
    expect(neu.ui).toMatchObject({ ansicht: 'kapital', tutorStep: 'ahv', mode: 'tutor', stopY: 2031, edited: true, practice: false, savedAt: 123 });
  });
  it('kein Hin und Her: Der übernommene Stand gilt im anderen Fenster als gleich', () => {
    const a = s(), b = s();
    b.personen[0].brutto = 99000;
    const neu = uebernehmeFremd(a, b);
    // das schreibende Fenster erhält den gespeicherten Stand zurück: keine Änderung der Angaben mehr
    expect(uebernehmeFremd(b, JSON.parse(JSON.stringify(neu)))).toBeNull();
    // auch wenn der Stand durch Speichern und Laden andere Schlüsselreihenfolge oder ergänzte Vorgaben hat
    const rund = migrate(JSON.parse(JSON.stringify({ ...neu, wuensche: neu.wuensche.map((w) => ({ ...w })) })));
    expect(uebernehmeFremd(neu, rund)).toBeNull();
  });
});

describe('Zweites Fenster und Link bei offenem Budget-Assistenten', () => {
  const mitEntwurf = () => {
    const s = migrate(clone(EXAMPLE));
    Object.assign(s, { liegenschaften: [], amortisationen: [], budgetAktiv: false });
    s.fix.wohnen = 2900; // Miete des Beispiels im Entwurf
    s.budget = { kk: 1350, haushalt: 1700, mob: 900, vers: 400, freizeit: 1500, pers: 700, rueck: 550 };
    s.budgetBasis = 'gehoben';
    s.ui.entwurf = { budget: {}, basis: '', miete: 1830 }; // Stand vor dem Öffnen
    return s;
  };
  it('ein fremder Stand wird ohne den eigenen Entwurf übernommen: kein veralteter Stand kann später angewandt werden', () => {
    const eigen = mitEntwurf();
    const fremd = migrate(clone(EXAMPLE));
    Object.assign(fremd, { liegenschaften: [], amortisationen: [] });
    fremd.fix.wohnen = 2000;
    const neu = uebernehmeFremd(eigen, fremd);
    expect(neu.fix.wohnen).toBe(2000);
    expect(neu.ui.entwurf).toBeUndefined();
    expect(eigen.ui.entwurf).toBeTruthy(); // der eigene Zustand bleibt unverändert, bis er ersetzt wird
  });
  it('für den Vergleich zählt der Stand vor dem Entwurf: Lädt das andere Fenster nur, ändert sich hier nichts', () => {
    const eigen = mitEntwurf();
    const geladen = migrate(JSON.parse(JSON.stringify(eigen))); // so sieht ihn das andere Fenster
    expect(geladen.fix.wohnen).toBe(1830);
    expect(uebernehmeFremd(eigen, geladen)).toBeNull();
  });
  it('ein Link enthält den Stand vor dem Öffnen, nicht den Entwurf', async () => {
    const { encodeCode, decodeCode } = await import('../../../src/lib/pension/state');
    const eigen = mitEntwurf();
    const ausLink = decodeCode(encodeCode(migrate(clone(eigen))));
    expect(ausLink.fix.wohnen).toBe(1830);
    expect(Object.keys(ausLink.budget)).toHaveLength(0);
    // bbz360: «Link kopieren» gibt es im Modul nicht (Session-Export, ADR-5); die Quelltextprüfung entfällt.
  });
});

describe('Zähler der geprüften Grundlagen (Q12) und Standardwerte (S1)', () => {
  const ok = (c) => !!c && (c.confirmed || 0) >= 2 && (c.amtlichLaufend ?? 0) >= 1;
  it('zählt gesetzliche Werte und gesetzliche Tabellen', () => {
    const werte = Object.values(params.params).filter((p) => p.kind === 'gesetz').length;
    const tabellen = Object.values(params.tables).filter((t) => t.kind === 'gesetz').length;
    expect(tabellen).toBe(3);
    const z = pruefZahl(params, verification, 2026, ok);
    expect(z.alle).toBe(werte + tabellen);
    expect(z.ok).toBe(z.alle);
  });
  it('eine nicht bestätigte Tabelle senkt den Zähler', () => {
    const v = JSON.parse(JSON.stringify(verification));
    v.tables.referenzalter.amtlichLaufend = 0;
    const z = pruefZahl(params, v, 2026, ok);
    expect(z.ok).toBe(z.alle - 1);
  });
  it('der Standard der 3a-Einzahlung stammt aus den geprüften Grundlagen', () => {
    const jahr = new Date().getFullYear();
    const max = resolveParams(params, jahr).s3a.maxMitPK;
    expect(migrate({}).personen[0].s3aEinz).toBe(max);
    expect(() => createEngine(resolveParams(params, jahr), jahr * 12)).not.toThrow();
  });
});
