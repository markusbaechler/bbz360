// @ts-nocheck — Referenztest, aus PensCheck (tests/zweig.test.js, Stand 4830eff) übernommen; nur Pfade angepasst.
// @vitest-environment happy-dom
// Begutachtung des ganzen Zweigs «Bühne» (Fix-Welle vor der Zusammenführung): Vergleich und Rechnung (I1, T),
// Neuladen in den Schritten 5 bis 8 (I2), Druck (M1, M2), Liegenschaften (M3), AHV im Vergleich (M6),
// Kartennamen (M7), Tragbarkeit in Schritt 4 und Lesereihenfolge (M8).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import params from '../../../public/data/params.json';
import { createEngine } from '../../../src/lib/pension/engine';
import { resolveParams, nextParams } from '../../../src/lib/pension/params';
import { analyse } from '../../../src/lib/pension/analyse';
import { auswerten } from '../../../src/lib/pension/auswertung';
import { EXAMPLE, VAR_FELDER, clone, migrate } from '../../../src/lib/pension/state';
import {
  themaHinzu, vergleichStarten, vergleichAktiv, variantenZustaende, uebernehmen, vergleichSig, rechenEingaben,
  liegenschaftEingefuegt, liegenschaftEntfernt, kartenName, karten,
} from '../../../src/lib/pension/themen';
import { themenZeilen } from '../../../src/pension-ui/report';
import { A0, boot, q, tick, type } from './hilfen';

const E = createEngine(resolveParams(params, 2026), A0, nextParams(params, 2026));
const neu = () => migrate(clone(EXAMPLE));
const lies = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');
const druckCss = () => { const css = lies('src/styles/pension/styles.css'); return css.slice(css.indexOf('@media print'), css.indexOf('/* Ansichten für den Druck')); };
const reisen = { betrag: 15000, von: 58, bis: 75 }, reisenB = { betrag: 25000, von: 58, bis: 75 };
const haken = () => { const cb = q('#akt [data-akt]'); cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); };

describe('I1: Was nicht neu rechnet, hält den Vergleich nicht an', () => {
  const laufend = () => {
    const S = neu(); S.ui.mode = 'form';
    const b = boot(S);
    const key = themaHinzu(b.app.S, 'reisen');
    vergleichStarten(b.app.S, key, reisen, reisenB); b.app.changed();
    return b;
  };
  const bereit = () => {
    expect(q('#vergleich').hasAttribute('aria-busy')).toBe(false);
    expect(q('#vergleich .vg-status').textContent).toBe('');
    expect(q('#vergleich [data-uebernehmen="a"]').disabled).toBe(false);
  };
  it('Haken im Aktionsplan: Schritt 6 bleibt bereit, «A übernehmen» wirkt', () => {
    const { app } = laufend();
    app.schritt.go('aktion');
    haken();
    expect(Object.keys(app.S.aktion)).toHaveLength(1);
    app.schritt.go('vergleich');
    bereit();
    q('#vergleich [data-uebernehmen="a"]').click();
    expect(vergleichAktiv(app.S)).toBeNull();
    expect(app.S.wuensche.at(-1)).toMatchObject({ aktiv: true, betrag: 15000 });
  });
  it('Kundenname und Gesprächsdatum: Schritt 6 bleibt bereit, «B übernehmen» wirkt', () => {
    const { app } = laufend();
    app.schritt.go('vergleich');
    type(q('[data-path="bericht.kunde"]'), 'Muster');
    type(q('[data-path="bericht.datum"]'), '1.12.2026');
    expect(app.S.bericht).toMatchObject({ kunde: 'Muster', datum: '1.12.2026' });
    app.vergleich.render();
    bereit();
    q('#vergleich [data-uebernehmen="b"]').click();
    expect(app.S.wuensche.at(-1)).toMatchObject({ aktiv: true, betrag: 25000 });
  });
  it('Tutor-Ergebnis: nach einem Haken übernimmt «A übernehmen» die Variante', () => {
    const S = neu(); Object.assign(S.ui, { mode: 'tutor', tutorStep: 'ergebnis', tutorMax: 99 });
    const { app } = boot(S);
    vergleichStarten(app.S, 'w0', { monate: 2, von: 58, bis: 80 }, { monate: 9, von: 58, bis: 80 }); app.changed();
    haken();
    app.vergleich.render();
    q('#vergleich [data-uebernehmen="a"]').click();
    expect(app.S.themen).toEqual([]);
    expect(app.S.wuensche[0].monate).toBe(2);
  });
  it('Kennung und Auftrag an den Rechner kommen aus derselben Funktion; ui, Haken und Bericht gehören nicht dazu', () => {
    const S = neu(), key = themaHinzu(S, 'ahv', { person: 0 });
    vergleichStarten(S, key, { ahvBezug: -1 }, { ahvBezug: 1 });
    const sig = vergleichSig(S);
    expect(sig).toBe(JSON.stringify([key, rechenEingaben(S)]));
    Object.assign(S, { aktion: { x: 1 }, bericht: { kunde: 'K', datum: 'D', berater: 'B' } });
    S.ui.ansicht = 'jahre';
    expect(vergleichSig(S)).toBe(sig);
    S.personen[0].brutto += 1;
    expect(vergleichSig(S)).not.toBe(sig);
    // Was die Rechnung aus ui liest (wer im Was-wäre-wenn aufhört), bleibt im Auftrag
    S.ui.stopWer = 1;
    expect(rechenEingaben(S).ui).toEqual({ stopWer: 1 });
    expect(rechenEingaben(S)).not.toHaveProperty('aktion');
    expect(rechenEingaben(S)).not.toHaveProperty('bericht');
    const main = lies('src/modules/07c-pension.ts');
    expect(main).toMatch(/S: rechenEingaben\(app\.S\)/);
    expect(main).toMatch(/varianten: app\.varianten\(\)\.map\(rechenEingaben\)/);
  });
});

describe('T: Vorgemerkte Karten und Vergleich ändern das Ergebnis nicht; Vorschau gleich «übernehmen»', () => {
  it('ganzes Ergebnis ohne Varianten gleich, ausser Echo der Eingaben und wb des ausgeschalteten Wunsches', () => {
    const ohne = neu(), mit = neu();
    themaHinzu(mit, 'reisen'); themaHinzu(mit, 'verkauf', { lg: 0 }); themaHinzu(mit, 'erbschaft'); themaHinzu(mit, 'abklaeren', { stelle: 'pk' });
    const a = themaHinzu(mit, 'ahv', { person: 0 });
    expect(vergleichStarten(mit, a, { ahvBezug: -1 }, { ahvBezug: 1 })).not.toBeNull();
    const R0 = auswerten(rechenEingaben(ohne), E, A0 + 1, {}, []);
    const R1 = auswerten(rechenEingaben(mit), E, A0 + 1, {}, variantenZustaende(mit).map(rechenEingaben));
    expect(R1.varianten).toHaveLength(2);
    const rest = ({ inp, varianten, wb, ...r }) => r;
    expect(JSON.stringify(rest(R1))).toBe(JSON.stringify(rest(R0)));
    // wb: je Wunsch eine Zeile; der vorgemerkte (ausgeschaltete) Wunsch hat null
    expect(R1.wb.at(-1)).toBeNull();
    expect(JSON.stringify(R1.wb.filter(Boolean))).toBe(JSON.stringify(R0.wb));
  });
  it('für jede Karte mit Varianten: «übernehmen» ergibt genau die Vorschau', () => {
    const WERTE = {
      reisen: { betrag: 12000, von: 66, bis: 75 }, pflege: { betrag: 20000, von: 80, bis: 95 },
      anschaffung: { betrag: 50000, alter: 66 }, schenkung: { betrag: 100000, alter: 70 },
      ausland: { monate: 3, von: 60, bis: 75 }, hinterlassen: { betrag: 500000 },
      aufhoeren: { pensAlter: 62 }, teil: { teilAb: 60, teilPensum: 50 }, weiter: { betrag: 30000, bisJahr: 2033 },
      rentekapital: { pkRente: 25000, pkKapital: 300000 }, ahv: { ahvBezug: 1 }, verkauf: { verkaufAlter: 75 }, amort: { betrag: 100000, jahr: 2031, monat: 6 },
    };
    expect(Object.keys(WERTE).sort()).toEqual(Object.keys(VAR_FELDER).sort());
    const ZIEL = { aufhoeren: { person: 0 }, teil: { person: 0 }, weiter: { person: 1 }, rentekapital: { person: 0 }, ahv: { person: 1 }, verkauf: { lg: 0 }, amort: { lg: 0 } };
    const kern = (R) => JSON.stringify([R.maxA, R.amp.st, R.base.rows.map((x) => x.V), R.endV ?? null]);
    for (const [karte, w] of Object.entries(WERTE)) {
      const S = neu(), key = themaHinzu(S, karte, ZIEL[karte] || {});
      expect(vergleichStarten(S, key, w, w), karte).not.toBeNull();
      const vorschau = analyse(variantenZustaende(S)[0], E, A0 + 1);
      uebernehmen(S, key, 'a');
      expect(vergleichAktiv(S), karte).toBeNull();
      expect(kern(analyse(migrate(clone(S)), E, A0 + 1)), karte).toBe(kern(vorschau));
    }
  });
});

describe('I2: Neuladen in den Schritten 5 bis 8', () => {
  it('der gespeicherte Schritt bleibt, bis das erste Ergebnis da ist, und danach', () => {
    const S = neu(); Object.assign(S.ui, { mode: 'form', schritt: 'aktion' });
    const { app, schritte } = boot(S);
    expect(app.S.ui.schritt).toBe('aktion');
    expect(document.body.dataset.schritt).toBe('aktion');
    // noch kein Ergebnis (wie beim Start, bevor der Worker antwortet): der Schritt bleibt stehen
    app.R = null; app.S.ui.schritt = 'ansatz';
    schritte.render();
    expect(app.S.ui.schritt).toBe('ansatz');
  });
  it('ohne Ausgaben: zurück zu «Vermögen und Ausgaben», sobald das (leere) Ergebnis da ist', () => {
    const S = migrate({ ...clone(EXAMPLE), ausgabenRuhestand: 0 }); Object.assign(S.ui, { mode: 'form', schritt: 'aktion' });
    const { app } = boot(S);
    expect(app.R.leer).toBe(true);
    expect(app.S.ui.schritt).toBe('vermoegen');
  });
  it('die Testhilfe bildet die Startfolge aus main.js nach (Schrittleiste vor dem ersten Ergebnis)', () => {
    expect(lies('src/pension-ui/schritte.ts')).toMatch(/if \(app\.R && st\[S\.ui\.schritt\] === 'gesperrt'\)/);
  });
});

describe('M1, M2: Druck', () => {
  it('Tutor: «früher aufhören» steht im Ausdruck; Überschrift, Themenleiste, Editor und Vergleich nicht', () => {
    const S = neu(); Object.assign(S.ui, { mode: 'tutor', tutorStep: 'ergebnis', tutorMax: 99 });
    boot(S);
    const druck = druckCss();
    const m = druck.match(/body\[data-mode="tutor"\] #erkunden > ([^{]+?) \{ display: none !important; \}/);
    expect(m).not.toBeNull();
    const sel = m[1], erk = q('#erkunden'), kinder = [...erk.children];
    const mitSofort = kinder.find((c) => c.contains(q('#sofortBox')));
    expect(mitSofort).toBeTruthy();
    expect(mitSofort.matches(sel)).toBe(false);
    for (const c of kinder.filter((x) => x !== mitSofort)) expect(c.matches(sel), c.id || c.className).toBe(true);
    expect(kinder.map((c) => c.id).filter(Boolean)).toEqual(expect.arrayContaining(['erkundenTitel', 'themenleiste', 'themaEdit']));
    // im Block selbst: der Vergleich und die Zusammenfassung des Reglers fallen weg
    expect(mitSofort.contains(q('#vergleich'))).toBe(true);
    expect(druck).toMatch(/#vergleich, #sofortBox > summary \{ display: none !important; \}/);
  });
  it('die geleerte Ansicht (#tabBody) lässt im Druck keinen leeren Rahmen; #druckAnsichten bleibt', () => {
    const S = neu(); S.ui.mode = 'form'; S.ui.schritt = 'urteil';
    boot(S);
    const block = q('#ansichtenBlock');
    expect(block.contains(q('#druckAnsichten'))).toBe(false);
    window.dispatchEvent(new Event('beforeprint'));
    expect(q('#tabBody').innerHTML).toBe('');
    expect(block.hasAttribute('data-druck-leer')).toBe(true);
    expect(q('#druckAnsichten').children.length).toBeGreaterThan(0);
    window.dispatchEvent(new Event('afterprint'));
    expect(block.hasAttribute('data-druck-leer')).toBe(false);
    expect(q('#tabBody svg')).not.toBeNull();
    expect(druckCss()).toMatch(/#ansichtenBlock\[data-druck-leer\] \{ display: none !important; \}/);
    expect(druckCss().replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/#druckAnsichten[^{]*\{[^}]*display: none/);
  });
});

describe('M3: Liegenschaft eingefügt oder entfernt, Amortisationen folgen', () => {
  const am = (lg, betrag) => ({ lg, betrag, jahr: 2030, monat: 1, quelle: 'frei' });
  it('liegenschaftEingefuegt und liegenschaftEntfernt führen Themen und Amortisationen gemeinsam nach', () => {
    const S = neu();
    S.liegenschaften.push(clone(S.liegenschaften[0]), clone(S.liegenschaften[0]));
    S.amortisationen = [am(0, 1), am(1, 2), am(2, 3)];
    themaHinzu(S, 'amort', { lg: 2 });
    S.liegenschaften.splice(1, 0, clone(S.liegenschaften[0])); liegenschaftEingefuegt(S, 1);
    expect(S.amortisationen.map((x) => [x.lg, x.betrag])).toEqual([[0, 1], [2, 2], [3, 3]]);
    expect(S.themen[0].lg).toBe(3);
    S.liegenschaften.splice(2, 1); liegenschaftEntfernt(S, 2);
    expect(S.amortisationen.map((x) => [x.lg, x.betrag])).toEqual([[0, 1], [2, 3]]);
    expect(S.themen[0].lg).toBe(2);
  });
  it('Tutor «Im Eigenheim»: Amortisationen zeigen weiter auf ihre Liegenschaft', async () => {
    const S = neu();
    S.liegenschaften = [{ ...clone(S.liegenschaften[0]), typ: 'rendite', name: 'Mietobjekt' }];
    S.amortisationen = [am(0, 50000)];
    themaHinzu(S, 'amort', { lg: 0 });
    Object.assign(S.ui, { mode: 'tutor', tutorStep: 'wohnen', tutorMax: 99, edited: true });
    const { app } = boot(S);
    q('#tutor [data-tact="wohnen-eigen"]').click();
    await tick();
    expect(app.S.liegenschaften.map((l) => l.name)).toEqual(['Eigenheim', 'Mietobjekt']);
    expect(app.S.amortisationen.map((x) => [x.lg, x.betrag])).toEqual([[1, 50000]]);
    expect(app.S.themen).toEqual([{ karte: 'amort', status: 'vor', lg: 1 }]);
  });
  it('Tutor «Zur Miete»: Eigenheime fallen samt Amortisationen weg, die übrigen rücken auf (wie bisher)', async () => {
    const S = neu();
    S.liegenschaften = [clone(S.liegenschaften[0]), { ...clone(S.liegenschaften[0]), typ: 'rendite', name: 'Mietobjekt' }];
    S.amortisationen = [am(0, 1), am(1, 2)];
    themaHinzu(S, 'amort', { lg: 1 }); themaHinzu(S, 'verkauf', { lg: 0 });
    Object.assign(S.ui, { mode: 'tutor', tutorStep: 'wohnen', tutorMax: 99, edited: true, practice: true });
    const { app } = boot(S);
    q('#tutor [data-tact="wohnen-miete"]').click();
    await tick();
    expect(app.S.liegenschaften.map((l) => l.name)).toEqual(['Mietobjekt']);
    expect(app.S.amortisationen.map((x) => [x.lg, x.betrag])).toEqual([[0, 2]]);
    expect(app.S.themen).toEqual([{ karte: 'amort', status: 'vor', lg: 0 }]);
  });
  it('Formular: Liegenschaft entfernen nimmt ihre Amortisationen mit, die übrigen rücken auf (wie bisher)', async () => {
    const S = neu(); Object.assign(S.ui, { mode: 'form', schritt: 'liegenschaft' });
    S.liegenschaften = [clone(S.liegenschaften[0]), { ...clone(S.liegenschaften[0]), name: 'Zweites' }];
    S.amortisationen = [am(0, 1), am(1, 2)];
    themaHinzu(S, 'amort', { lg: 1 });
    const { app } = boot(S);
    q('#lgList [data-lgdel="0"]').click();
    await tick();
    expect(app.S.liegenschaften.map((l) => l.name)).toEqual(['Zweites']);
    expect(app.S.amortisationen.map((x) => [x.lg, x.betrag])).toEqual([[0, 2]]);
    expect(app.S.themen).toEqual([{ karte: 'amort', status: 'vor', lg: 0 }]);
  });
});

describe('M6: AHV im Vergleich', () => {
  it('Vorbezug nur so weit, wie der Rechenkern ihn für die Person zulässt; Meldung am Feld', () => {
    const S = neu(); S.ui.mode = 'form';
    const { app } = boot(S);
    const key = themaHinzu(app.S, 'ahv', { person: 0 }); app.changed();
    const max = app.E.maxVorbezug(app.S.personen[0]);
    expect(max).toBeLessThan(3);
    app.vergleich.entwurf(key);
    const a = q('#vergleich [data-vg="a"][data-k="ahvBezug"]'), b = q('#vergleich [data-vg="b"][data-k="ahvBezug"]');
    type(b, '1');
    type(a, String(-(max + 1)));
    expect(a.getAttribute('aria-invalid')).toBe('true');
    expect(a.parentElement.textContent).toContain(`Erlaubt sind Werte von ${-max} bis 5.`);
    expect(q('#vergleich [data-vgl-los]').disabled).toBe(true);
    type(a, String(-max));
    expect(a.hasAttribute('aria-invalid')).toBe(false);
    expect(q('#vergleich [data-vgl-los]').disabled).toBe(false);
  });
});

describe('M7: Vorgemerkte Karten mit ihrem Ziel', () => {
  const zwei = () => {
    const S = neu();
    S.liegenschaften.push({ ...clone(S.liegenschaften[0]), name: 'Ferienhaus', typ: 'ferien' });
    themaHinzu(S, 'ahv', { person: 0 }); themaHinzu(S, 'ahv', { person: 1 });
    themaHinzu(S, 'verkauf', { lg: 0 }); themaHinzu(S, 'verkauf', { lg: 1 });
    themaHinzu(S, 'abklaeren', { stelle: 'ak' });
    return S;
  };
  it('kartenName liegt in themen.js: Titel mit Person, Liegenschaft bzw. Stelle, als Rohtext', () => {
    const S = zwei();
    expect(karten(S).filter((k) => k.key[0] === 't').map((k) => kartenName(S, k))).toEqual([
      'AHV vorbeziehen oder aufschieben (P1)', 'AHV vorbeziehen oder aufschieben (P2)', 'Liegenschaft verkaufen (Eigenheim)', 'Liegenschaft verkaufen (Ferienhaus)', 'Noch abklären: Ausgleichskasse']);
    expect(lies('src/pension-ui/themenui.ts')).not.toMatch(/export function kartenName/);
  });
  it('Bericht: jede Zeile nennt das Ziel; der Satz darüber behauptet nichts über die Rechnung', () => {
    expect(themenZeilen(zwei())).toEqual([
      'AHV vorbeziehen oder aufschieben (P1): vorgemerkt, noch zu klären', 'AHV vorbeziehen oder aufschieben (P2): vorgemerkt, noch zu klären',
      'Liegenschaft verkaufen (Eigenheim): vorgemerkt, noch zu klären', 'Liegenschaft verkaufen (Ferienhaus): vorgemerkt, noch zu klären', 'Noch abklären: Ausgleichskasse']);
    const rep = lies('src/pension-ui/report.ts');
    expect(rep).not.toContain('noch nicht in der Rechnung berücksichtigt');
    expect(rep).toContain('Themen, die Sie vorgemerkt haben und noch klären möchten.');
  });
  it('Aktionsplan «Aus Ihren Themen»: die Karten für Person 1 und 2 und für zwei Liegenschaften sind unterscheidbar', () => {
    const S = zwei(); Object.assign(S.ui, { mode: 'form', schritt: 'aktion' });
    boot(S);
    const titel = [...document.querySelectorAll('#aktThemen li b')].map((b) => b.textContent);
    expect(titel).toEqual(['AHV vorbeziehen oder aufschieben (P1)', 'AHV vorbeziehen oder aufschieben (P2)', 'Liegenschaft verkaufen (Eigenheim)', 'Liegenschaft verkaufen (Ferienhaus)', 'Noch abklären']);
    expect(q('#aktThemen li:last-child span').textContent).toBe('bei: Ausgleichskasse');
  });
  it('Gruppen des Aktionsplans gehen maskiert ins HTML', () => {
    expect(lies('src/pension-ui/aktion.ts')).toMatch(/<h4 class="agr">\$\{esc\(g\.g\)\}<\/h4>/);
  });
});

describe('M8: Tragbarkeit in Schritt 4; Lesereihenfolge gleich der Darstellung ab 1025 px', () => {
  /** matchMedia nachbilden: «breit» gilt für screen and (min-width: 1025px); die Bühne meldet sich für Wechsel an. */
  const mitBreite = (breit, fn) => {
    const alt = window.matchMedia, hoerer = [];
    const mq = { get matches() { return breit.wert; }, media: 'screen and (min-width: 1025px)', addEventListener: (_, f) => hoerer.push(f), removeEventListener() {} };
    window.matchMedia = (m) => (m === 'screen and (min-width: 1025px)' ? mq : { matches: false, media: m, addEventListener() {}, removeEventListener() {} });
    try { return fn(() => hoerer.forEach((f) => f())); } finally { window.matchMedia = alt; }
  };
  const vor = (a, b) => !!(q(a).compareDocumentPosition(q(b)) & Node.DOCUMENT_POSITION_FOLLOWING);
  const folge = (...sel) => sel.forEach((s, i) => { if (i) expect(vor(sel[i - 1], s), `${sel[i - 1]} vor ${s}`).toBe(true); });
  it('Schritt 4, breit: Kopf, Ansichten, Themenleiste, dann Tragbarkeit', () => {
    const breit = { wert: true };
    mitBreite(breit, () => {
      const S = neu(); Object.assign(S.ui, { mode: 'form', schritt: 'liegenschaft' });
      boot(S);
      folge('#urteilBlock', '#ansichtenBlock', '#themenleiste', '#tragBox');
      expect(q('#tragBox').hidden).toBe(false);
    });
  });
  it('Schritt 5, breit: Ansichten, Themenleiste, Ergänzung, Kennzahlen, Tragbarkeit, Hinweis; schmal wieder wie im Dokument', () => {
    const breit = { wert: true };
    mitBreite(breit, (wechsel) => {
      const S = neu(); Object.assign(S.ui, { mode: 'form', schritt: 'urteil' });
      boot(S);
      folge('#urteilBlock', '#ansichtenBlock', '#themenleiste', '#subUnten', '#kpis', '#tragBox', '#results > [data-block="hinweis"]');
      const knopf = q('#tragBox [data-apply]');
      knopf.focus();
      breit.wert = false; wechsel();
      folge('#urteilBlock', '#kpis', '#subUnten', '#tragBox', '#results > [data-block="vergleich"]', '#ansichtenBlock', '#themenleiste');
      expect(document.activeElement).toBe(knopf);
      breit.wert = true; wechsel();
      folge('#ansichtenBlock', '#themenleiste', '#subUnten', '#kpis', '#tragBox');
      // Druck: die Reihenfolge des Dokuments (wie bisher), danach wieder die der Bühne
      window.dispatchEvent(new Event('beforeprint'));
      folge('#urteilBlock', '#kpis', '#tragBox', '#ansichtenBlock');
      window.dispatchEvent(new Event('afterprint'));
      folge('#themenleiste', '#kpis', '#tragBox');
    });
  });
  it('Tutor: die Reihenfolge der Bühne gilt nicht; Wechsel aus dem breiten Formular stellt sie zurück', () => {
    const breit = { wert: true };
    mitBreite(breit, () => {
      const S = neu(); Object.assign(S.ui, { mode: 'form', schritt: 'urteil' });
      const { app, buehne } = boot(S);
      folge('#themenleiste', '#tragBox');
      app.S.ui.mode = 'tutor'; document.body.dataset.mode = 'tutor'; buehne.ordne();
      expect([...document.querySelectorAll('#results [data-block]')].map((x) => x.dataset.block).slice(0, 3)).toEqual(['kopf', 'kopf', 'trag']);
      folge('#tragBox', '#ansichtenBlock');
    });
  });
  it('CSS: Tragbarkeit ab 1025 px in den Schritten 4 und 5, keine order für die Blöcke der Bühne', () => {
    const css = lies('src/styles/pension/styles.css');
    expect(css).toMatch(/body\[data-mode="form"\]:not\(\[data-schritt="urteil"\]\) #results > #kpis \{ display: none; \}/);
    expect(css).toMatch(/body\[data-mode="form"\]:not\(\[data-schritt="liegenschaft"\], \[data-schritt="urteil"\]\) #results > #tragBox \{ display: none; \}/);
    expect(css).not.toMatch(/#results > [^{]*\{[^}]*order:/);
  });
});

// bbz360: «M4: Wortwahl im README» prüfte das README des PensCheck und entfällt hier.
