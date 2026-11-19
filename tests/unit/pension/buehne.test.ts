// @ts-nocheck — Referenztest, aus PensCheck (tests/buehne.test.js, Stand 4830eff) übernommen; nur Pfade angepasst.
// @vitest-environment happy-dom
// Bühne: gemeinsamer Rechenweg für Worker und Tests (auswerten) mit Vorschau-Reihen und Varianten.
import { describe, it, expect } from 'vitest';
import params from '../../../public/data/params.json';
import { createEngine } from '../../../src/lib/pension/engine';
import { resolveParams, nextParams } from '../../../src/lib/pension/params';
import { analyse } from '../../../src/lib/pension/analyse';
import { auswerten } from '../../../src/lib/pension/auswertung';
import { EXAMPLE, clone, migrate, emptyState, SCHRITT_IDS, ANSICHT_IDS } from '../../../src/lib/pension/state';
import { schrittStatus } from '../../../src/pension-ui/schritte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { bildDaten, bildSvg, hoeheFuer, markenLayout, renderBild, renderMiniBild } from '../../../src/pension-ui/bild';
import { kopfHtml, ANSICHTEN } from '../../../src/pension-ui/buehne';
import { ansatzHtml, ersterSatz } from '../../../src/pension-ui/ansatz';
import { A0, boot, bootR, q, tick, type } from './hilfen';

const E = createEngine(resolveParams(params, 2026), A0, nextParams(params, 2026));

describe('auswerten', () => {
  it('ohne Ausgaben: Vorschau-Reihen mit Lohn und Renten', () => {
    const S = migrate({ ...clone(EXAMPLE), ausgabenRuhestand: 0 });
    const R = auswerten(S, E, A0 + 1);
    expect(R.leer).toBe(true);
    expect(R.vor.rows[1].lohn).toBeGreaterThan(0);
    expect(R.vor.rows.some((x) => x.ahv > 0 && x.pk > 0)).toBe(true);
  });
  it('mit Ausgaben: gleiches Ergebnis wie analyse(), keine Vorschau', () => {
    const S = migrate(clone(EXAMPLE));
    const R = auswerten(S, E, A0 + 1), R0 = analyse(S, E, A0 + 1);
    expect(R.vor).toBeUndefined();
    expect(R.maxA).toBe(R0.maxA);
    expect(R.amp.st).toBe(R0.amp.st);
  });
  it('Varianten werden mit demselben Rechenweg gerechnet', () => {
    const S = migrate(clone(EXAMPLE)), S2 = migrate({ ...clone(EXAMPLE), ausgabenRuhestand: 12000 });
    const R = auswerten(S, E, A0 + 1, {}, [S2]);
    expect(R.varianten[0].maxA).toBe(analyse(S2, E, A0 + 1).maxA);
  });
});

describe('Schritte', () => {
  it('Musterfall: acht Schritte, 1 bis 4 erledigt, aktiver Schritt markiert', () => {
    const S = migrate(clone(EXAMPLE)); S.ui.mode = 'form';
    boot(S);
    const b = [...document.querySelectorAll('#schritte button[data-schritt]')];
    expect(b.map((x) => x.dataset.schritt)).toEqual(SCHRITT_IDS);
    expect(q('#schritte [aria-current="step"]').dataset.schritt).toBe('situation');
    expect(schrittStatus(S, bootR())).toMatchObject({ situation: 'erledigt', vermoegen: 'erledigt', urteil: 'offen' });
  });
  it('leerer Stand: 5 bis 8 gesperrt, Klick wirkt nicht, Hinweis sichtbar', () => {
    const { app } = boot(emptyState());
    q('#schritte [data-schritt="ansatz"]').click();
    expect(app.S.ui.schritt).toBe('situation');
    expect(q('#schritte [data-schritt="ansatz"]').getAttribute('aria-disabled')).toBe('true');
    expect(q('#schritte').textContent).toContain('sobald die Ausgaben erfasst sind');
    expect(document.body.textContent).not.toMatch(/undefined|NaN/);
  });
  it('Springen: Klick setzt Schritt, Marke am body und merkt den verlassenen Schritt', () => {
    const { app } = boot(migrate(clone(EXAMPLE)));
    q('#schritte button[data-schritt="liegenschaft"]').click();
    expect(app.S.ui.schritt).toBe('liegenschaft');
    expect(document.body.dataset.schritt).toBe('liegenschaft');
    expect(app.S.ui.besucht.situation).toBe(true);
    expect(q('#form details[data-sec="liegenschaften"]').open).toBe(true);
  });
  it('«Weiter» führt zum nächsten Schritt', () => {
    const { app } = boot(migrate(clone(EXAMPLE)));
    q('#form [data-weiter="einkommen"]').click();
    expect(app.S.ui.schritt).toBe('einkommen');
  });
  it('Abschnitte anderer Schritte verborgen; Fokus auf der Überschrift der Bühne; Blockmarken in #results', () => {
    const S = migrate(clone(EXAMPLE)); S.ui.mode = 'form';
    const { app } = boot(S);
    expect(q('#form details[data-sec="haushalt"]').hidden).toBe(false);
    expect(q('#form details[data-sec="liegenschaften"]').hidden).toBe(true);
    // Wünsche und Ziele: kein Abschnitt mehr, sondern Themenkarten
    expect(q('#form details[data-sec="wuensche"]')).toBeNull();
    app.schritt.go('urteil');
    expect(document.activeElement.id).toBe('verdictText');
    expect([...document.querySelectorAll('#results > [data-block]')].map((x) => x.dataset.block))
      .toEqual(['kopf', 'kopf', 'trag', 'vergleich', 'ansichten', 'themen', 'ansatz', 'aktion', 'erkunden', 'abschluss', 'hinweis']);
  });
  it('leerer Stand: «Weiter: Urteil» gesperrt; Gesprächszeile maskiert', () => {
    const S = emptyState(); S.bericht.kunde = '<b>Muster</b>';
    boot(S);
    expect(q('#form [data-weiter="urteil"]').disabled).toBe(true);
    expect(q('#gespraech').textContent).toBe('<b>Muster</b>');
    expect(q('#gespraech b')).toBeNull();
  });
  it('leerer Stand: eigener sichtbarer Sperrhinweis in #schritteMobil', () => {
    boot(emptyState());
    const p = q('#schritteMobil #smSperre');
    expect(p.hidden).toBe(false);
    expect(p.textContent).toBe('sobald die Ausgaben erfasst sind');
    document.querySelectorAll('#schritteMobil button[data-schritt]').forEach((b) => expect(b.getAttribute('aria-describedby')).toBe('smSperre'));
  });
  it('Felder des aktiven Schritts direkt unter seinem Eintrag, vor den folgenden Schritten', () => {
    const { app } = boot(migrate(clone(EXAMPLE)));
    const knopf = (id) => q(`#schritte button[data-schritt="${id}"]`), form = q('#form');
    const davor = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(knopf('situation').parentElement.contains(form)).toBe(true);
    expect(davor(knopf('situation'), form) && davor(form, knopf('einkommen'))).toBe(true);
    app.schritt.go('liegenschaft');
    expect(knopf('liegenschaft').parentElement.contains(form)).toBe(true);
    expect(davor(form, knopf('urteil'))).toBe(true);
    app.schritt.go('urteil');
    expect(q('#schritte').contains(form)).toBe(false);
    expect(q('#formwrap').contains(form)).toBe(true);
  });
  it('Neuberechnung: Fokus und Eingabefeld bleiben, das Formular wird nicht verschoben', () => {
    const { schritte } = boot(migrate(clone(EXAMPLE)));
    const feld = q('#form [data-path="kanton"]'), eltern = q('#form').parentElement;
    feld.focus();
    schritte.render();
    expect(document.activeElement).toBe(feld);
    expect(q('#form').parentElement).toBe(eltern);
  });
  it('Fokus: kein Fokus beim ersten Rendern; go() zu Schritt 1 bis 4 fokussiert dessen Eintrag', () => {
    const { app } = boot(migrate(clone(EXAMPLE)));
    expect(document.activeElement).toBe(document.body);
    app.schritt.go('einkommen');
    expect(document.activeElement).toBe(q('#schritte button[data-schritt="einkommen"]'));
  });
  it('gesperrter aktiver Schritt 5 bis 8 führt ohne Fokuswechsel zu «Vermögen und Ausgaben»', () => {
    const { app, compute } = boot(migrate(clone(EXAMPLE)));
    app.schritt.go('urteil');
    const fokus = document.activeElement;
    app.S.ausgabenRuhestand = 0;
    compute();
    expect(app.R.leer).toBe(true);
    expect(app.S.ui.schritt).toBe('vermoegen');
    expect(document.body.dataset.schritt).toBe('vermoegen');
    expect(document.activeElement).toBe(fokus);
    expect(q('#schritte button[data-schritt="vermoegen"]').parentElement.contains(q('#form'))).toBe(true);
  });
  it('leerer Stand: Schritt 2 erst erledigt, wenn besucht und ein Lohn erfasst ist', () => {
    const S = emptyState();
    expect(schrittStatus(S, { leer: true }).einkommen).toBe('offen');
    S.ui.besucht.einkommen = true; S.personen[0].brutto = 90000;
    expect(schrittStatus(S, { leer: true }).einkommen).toBe('erledigt');
  });
});

describe('Ansichtswahl', () => {
  const form = (o = {}) => { const S = migrate({ ...clone(EXAMPLE), ...o }); S.ui.mode = 'form'; S.ui.schritt = 'urteil'; return S; };
  it('acht Ansichten, Bild ist gewählt', () => {
    boot(form());
    const t = [...document.querySelectorAll('#resTabs [role="tab"]')];
    expect(t.map((x) => x.dataset.ansicht)).toEqual(ANSICHT_IDS);
    expect(q('#resTabs [aria-selected="true"]').dataset.ansicht).toBe('bild');
    expect([...q('#ansichtWahl').options].map((o) => o.value)).toEqual(ANSICHT_IDS);
    expect(q('label[for="ansichtWahl"]').textContent).toBe('Ansicht');
  });
  it('Jahresrechnung, Bilanz und Hinweise zeigen den heutigen Inhalt', () => {
    boot(form());
    q('#resTabs [data-ansicht="jahre"]').click();
    expect(q('#tabBody').textContent).toContain('Jahresrechnung des freien Vermögens');
    q('#resTabs [data-ansicht="bilanz"]').click();
    expect(q('#tabBody').textContent).toContain('Vermögensbilanz des Haushalts');
    q('#resTabs [data-ansicht="hinweise"]').click();
    expect(q('#tabBody').textContent).toContain('Was PensCheck vereinfacht oder nicht rechnet');
  });
  it('ohne Wünsche keine Ansicht «Wünsche und Ziele»; gewählte fällt auf Bild zurück', () => {
    const S = form({ wuensche: [] }); S.ui.ansicht = 'wuensche';
    boot(S);
    expect(q('#resTabs [data-ansicht="wuensche"]')).toBeNull();
    expect(q('#resTabs [aria-selected="true"]').dataset.ansicht).toBe('bild');
  });
  it('Auswahlfeld und Register bleiben gleich', () => {
    const { app } = boot(form());
    const sel = q('#ansichtWahl'); sel.value = 'kapital'; sel.dispatchEvent(new Event('change', { bubbles: true }));
    expect(app.S.ui.ansicht).toBe('kapital');
    expect(q('#resTabs [aria-selected="true"]').dataset.ansicht).toBe('kapital');
    q('#resTabs [data-ansicht="fix"]').click();
    expect(q('#ansichtWahl').value).toBe('fix');
    expect(q('#tabBody').textContent).toContain('Renten und Fixkosten');
  });
  it('Pfeiltasten, Home und End wechseln die Ansicht, der Fokus bleibt auf dem Register', () => {
    const { app } = boot(form());
    q('#resTabs').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(app.S.ui.ansicht).toBe('ablauf');
    expect(document.activeElement.id).toBe('ansicht-ablauf');
    q('#resTabs').dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(app.S.ui.ansicht).toBe('hinweise');
    q('#resTabs').dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(app.S.ui.ansicht).toBe('bild');
    expect(q('#tabBody').getAttribute('aria-labelledby')).toBe('ansicht-bild');
  });
  it('Tutor: dieselben Ansichten über das Auswahlfeld, gemerkt in ui.ansicht', () => {
    const S = migrate(clone(EXAMPLE)); S.ui.mode = 'tutor';
    const { app } = boot(S);
    expect([...q('#ansichtWahl').options].map((o) => o.value)).toEqual(ANSICHT_IDS);
    const sel = q('#ansichtWahl'); sel.value = 'kapital'; sel.dispatchEvent(new Event('change', { bubbles: true }));
    expect(app.S.ui.ansicht).toBe('kapital');
    expect(q('#ansichtBox').hidden).toBe(false);
  });
});

describe('Bild', () => {
  const E = createEngine(resolveParams(params, 2026), A0, nextParams(params, 2026));
  it('Stufe 3: Einkommen, Bedarf und Vermögen ab heute, in heutiger Kaufkraft', () => {
    const S = migrate(clone(EXAMPLE)), R = auswerten(S, E, A0 + 1), d = bildDaten(S, R, E);
    expect(d.stufe).toBe(3);
    expect(d.jahre[0].jahr).toBe(R.base.rows[0].year);
    expect(d.jahre.length).toBe(R.base.rows.length);
    const x = R.base.rows[6], j = d.jahre[6];
    expect(j.vermoegen).toBeCloseTo(x.V / x.I, 6);
    expect(j.lohn + j.uebrig + j.pk + j.ahv + j.ausVermoegen).toBeGreaterThanOrEqual(j.bedarf - 1e-6);
    expect(d.marken.map((m) => m.art)).toEqual(expect.arrayContaining(['heute', 'pension', 'ahv', 'le', 'horizont']));
  });
  it('Stufe 2 ohne Ausgaben: Einkommen ja, Bedarf und Vermögen nein', () => {
    const S = migrate({ ...clone(EXAMPLE), ausgabenRuhestand: 0 }); S.ui.besucht = { situation: true, einkommen: true };
    const d = bildDaten(S, auswerten(S, E, A0 + 1), E);
    expect(d.stufe).toBe(2);
    expect(d.jahre[1].lohn).toBeGreaterThan(0);
    expect(d.jahre.every((j) => j.bedarf === null && j.vermoegen === null)).toBe(true);
    expect(bildSvg(d, { w: 880, h: 500 })).toContain('Hier erscheint das Vermögen');
  });
  it('Stufe 0: leerer Stand zeigt nur Achse und Platzhalter, kein NaN', () => {
    const S = emptyState(), svg = bildSvg(bildDaten(S, auswerten(S, E, A0 + 1), E), { w: 880, h: 500 });
    expect(svg).toContain('Hier erscheinen Lohn, Renten und Ausgaben');
    expect(svg).not.toMatch(/NaN|undefined/);
  });
  it('eine Person: eine Pensionsmarke', () => {
    const S = migrate({ ...clone(EXAMPLE), haushalt: 'single' });
    expect(bildDaten(S, auswerten(S, E, A0 + 1), E).marken.filter((m) => m.art === 'pension').length).toBe(1);
  });
  it('Textalternative nennt das Urteil', () => {
    const S = migrate(clone(EXAMPLE)), d = bildDaten(S, auswerten(S, E, A0 + 1), E);
    expect(bildSvg(d, { w: 880, h: 500 })).toMatch(/role="img" aria-label="[^"]*reicht[^"]*"/);
  });
  it('Kopfzeile: Frage ohne Ergebnis, Urteil mit Ergebnis', () => {
    const leer = emptyState(); leer.ui.mode = 'form';
    boot(leer);
    expect(q('[data-block="kopf"]').textContent).toContain('Wann möchten Sie aufhören?');
    const S = migrate(clone(EXAMPLE)); S.ui.mode = 'form';
    boot(S);
    expect(q('#verdictText').textContent).toMatch(/^(Ja|Knapp)/);
  });

  // Ergänzende Prüfungen dieser Aufgabe
  it('Stufe 1: Situation erledigt, ohne Einkommen: Marken, beide Platzhalter, keine Flächen', () => {
    const S = emptyState(); S.ui.besucht = { situation: true };
    const d = bildDaten(S, auswerten(S, E, A0 + 1), E), svg = bildSvg(d, { w: 880, h: 500 });
    expect(d.stufe).toBe(1);
    expect(d.marken.map((m) => m.art)).toEqual(expect.arrayContaining(['heute', 'pension', 'ahv', 'le', 'horizont']));
    expect(svg).toContain('Hier erscheinen Lohn, Renten und Ausgaben');
    expect(svg).toContain('Hier erscheint das Vermögen');
    expect(svg).not.toContain('data-reihe');
    expect(svg).not.toMatch(/NaN|undefined/);
  });
  it('Stufe 0: nur die Marke «heute»; ohne Rechnung kein Fehler', () => {
    const S = emptyState(), d = bildDaten(S, auswerten(S, E, A0 + 1), E);
    expect(d.stufe).toBe(0);
    expect(d.marken.map((m) => m.art)).toEqual(['heute']);
    const d0 = bildDaten(S, null, E);
    expect(d0.stufe).toBe(0);
    expect(bildSvg(d0, { w: 880, h: 500 })).not.toMatch(/NaN|undefined/);
    expect(bildDaten(S, { leer: true }, E).jahre).toEqual([]); // ohne Vorschau-Reihen
  });
  it('Stufe 3: Farben nur über CSS-Variablen, gekürzte Beschriftung, Überlagerungen ohne Wirkung', () => {
    const S = migrate(clone(EXAMPLE)), d = bildDaten(S, auswerten(S, E, A0 + 1), E), svg = bildSvg(d, { w: 880, h: 500 });
    expect(svg).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
    expect(svg).toContain('Ausgaben inkl. Steuern');
    expect(bildSvg(d, { w: 343, h: 150, kurz: true })).not.toContain('Ausgaben inkl. Steuern');
    expect(bildSvg({ ...d, pins: [], varianten: [] }, { w: 880, h: 500 }).replace(/bild-\d+/g, '')).toBe(svg.replace(/bild-\d+/g, ''));
    expect(svg).not.toContain('Hier erscheint');
  });
  it('Kopfzeile je Schritt; mit Ergebnis keine Frage', () => {
    const S = emptyState();
    const frage = (id) => { S.ui.schritt = id; return kopfHtml(S, { leer: true }); };
    expect(frage('situation')).toContain('Wann möchten Sie aufhören?');
    expect(frage('einkommen')).toContain('Wovon leben Sie nach der Pensionierung?');
    expect(frage('vermoegen')).toContain('Was brauchen Sie, und was ist da?');
    expect(frage('liegenschaft')).toContain('Wie wohnen Sie?');
    expect(frage('vergleich')).toBe('');
    const M = migrate(clone(EXAMPLE));
    expect(kopfHtml(M, auswerten(M, E, A0 + 1))).toBe('');
  });
  it('Formular ohne Ergebnis: Bühne zeigt Frage und Bild; mit Ergebnis Urteil, Frage verborgen', () => {
    const leer = emptyState(); leer.ui.mode = 'form';
    const { app, compute } = boot(leer);
    expect(q('#kopfFrage').hidden).toBe(false);
    expect(q('#kopfFrage h2').textContent).toBe('Wann möchten Sie aufhören?');
    expect(q('[data-block="kopf"]').classList.contains('frage')).toBe(true);
    expect(q('#tabBody svg[role="img"]')).not.toBeNull();
    expect(q('#resTabs').children.length).toBe(0);
    app.S = migrate(clone(EXAMPLE)); app.S.ui.mode = 'form';
    compute();
    expect(q('#kopfFrage').hidden).toBe(true);
    expect(q('[data-block="kopf"]').classList.contains('frage')).toBe(false);
    expect(q('#tabBody svg[role="img"]').getAttribute('aria-label')).toMatch(/reicht/);
  });
  it('Bild: Werte mit den Pfeiltasten', () => {
    const S = migrate(clone(EXAMPLE)); S.ui.mode = 'form';
    boot(S);
    const svg = q('#tabBody svg[role="img"]');
    expect(svg.getAttribute('tabindex')).toBe('0');
    svg.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    const tip = q('#tabBody .tip');
    expect(tip.hidden).toBe(false);
    expect(tip.textContent).toMatch(/Vermögen/);
  });
  it('Tutor: keine Frage in der Kopfzeile', () => {
    const S = emptyState(); S.ui.mode = 'tutor';
    boot(S);
    expect(q('#kopfFrage').hidden).toBe(true);
  });
  it('kleines Bild: Knopf «Ihr Bild ansehen» über der Schrittleiste wechselt zur Ansicht «Ergebnis»', () => {
    const leer = emptyState(); leer.ui.mode = 'form';
    const { app } = boot(leer);
    const views = []; app.setView = (v) => views.push(v);
    const b = q('#miniBild');
    expect(b.tagName).toBe('BUTTON');
    const name = b.cloneNode(true); name.querySelectorAll('[aria-hidden="true"]').forEach((x) => x.remove());
    expect(name.textContent.trim()).toBe('Ihr Bild ansehen');
    expect(b.querySelector('svg').closest('[aria-hidden="true"]')).not.toBeNull();
    expect(b.compareDocumentPosition(q('#schritte')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    b.click();
    expect(views).toEqual(['results']);
  });
});

describe('Bild: Nachbesserungen (Runde 1)', () => {
  const E = createEngine(resolveParams(params, 2026), A0, nextParams(params, 2026));
  it('Marken vor dem ersten Ergebnis aus den Personen des Rechenkerns (R.vor.ps)', () => {
    const S = migrate({ ...clone(EXAMPLE), ausgabenRuhestand: 0, haushalt: 'single' }); S.ui.besucht = { situation: true };
    S.personen[0].ahvBezug = '-1';
    const R = auswerten(S, E, A0 + 1), p = R.vor.ps[0], b1 = E.birthA(S.personen[0]);
    expect(p.Aret).toBeGreaterThan(0);
    const m = bildDaten(S, R, E).marken;
    expect(m.find((x) => x.art === 'pension').alter).toBeCloseTo((p.Aret - b1) / 12, 9);
    expect(m.find((x) => x.art === 'ahv').alter).toBeCloseTo((p.Aahv - b1) / 12, 9);
    expect(bildDaten(S, { ...R, vor: { rows: R.vor.rows } }, E).marken.map((x) => x.art)).toEqual(['heute']);
  });
  it('Marken überlagern sich nie: Paar, Pension 62 und 65, AHV 65', () => {
    const S = migrate(clone(EXAMPLE)); S.personen[0].pensAlter = 62; S.personen[1].pensAlter = 65;
    const d = bildDaten(S, auswerten(S, E, A0 + 1), E);
    [[880, false], [600, false], [343, true], [300, true]].forEach(([w, kurz]) => {
      const lay = markenLayout(d, { w, kurz });
      expect(lay.length).toBeGreaterThan(2);
      lay.forEach((a, i) => lay.slice(i + 1).forEach((b) => {
        if (a.zeile === b.zeile) expect(a.r <= b.l || b.r <= a.l).toBe(true);
      }));
      // jede Marke steht in einer Beschriftung
      const txt = lay.map((x) => x.t).join(' | ');
      d.marken.filter((x) => x.art !== 'heute' && !(kurz && x.art === 'horizont')).forEach((x) => expect(txt).toContain(x.text.replace('Pensionierung', kurz ? 'Pension' : 'Pensionierung').replace('Lebenserwartung', kurz ? 'Lebenserw.' : 'Lebenserwartung')));
    });
  });
  it('Bild in der echten Breite: viewBox = Breite, Schrift mindestens 11 px, Höhe mindestens 300', () => {
    const S = migrate(clone(EXAMPLE)), d = bildDaten(S, auswerten(S, E, A0 + 1), E);
    document.body.innerHTML = '<div id="h"></div><div id="m"></div>';
    const h = q('#h'), m = q('#m');
    Object.defineProperty(h, 'clientWidth', { value: 294 });
    Object.defineProperty(m, 'clientWidth', { value: 317 });
    renderBild(h, d);
    const vb = h.querySelector('svg').getAttribute('viewBox').split(' ').map(Number);
    expect(vb[2]).toBe(294);
    expect(vb[3]).toBeGreaterThanOrEqual(300);
    expect(+h.querySelector('svg').getAttribute('font-size')).toBeGreaterThanOrEqual(11);
    expect(h.querySelector('svg').innerHTML).not.toContain('Ausgaben inkl. Steuern'); // gekürzt
    renderMiniBild(m, d);
    expect(m.querySelector('svg').getAttribute('viewBox')).toBe('0 0 317 150.0');
    expect(+m.querySelector('svg').getAttribute('font-size')).toBeGreaterThanOrEqual(11);
  });
  it('Höhe des Bilds: bei knappem Platz ab 769 px mindestens 220, schmal weiterhin mindestens 300', () => {
    expect(hoeheFuer(880, 600, true)).toBe(495);
    expect(hoeheFuer(880, 250, true)).toBe(250);
    expect(hoeheFuer(880, 150, true)).toBe(220);
    expect(hoeheFuer(880, 150, false)).toBe(300);
    expect(hoeheFuer(294, 2000, true)).toBe(300);
  });
  it('Lesehilfe zum Bild zugeklappt neben der Legende; der Zustand bleibt beim Neuaufbau', () => {
    const S = migrate(clone(EXAMPLE)); S.ui.mode = 'form';
    const { buehne } = boot(S);
    const l = q('#tabBody .bildkopf details.lesehilfe');
    expect(l.open).toBe(false);
    expect(l.textContent).toContain('Pro Jahr in heutiger Kaufkraft');
    expect(q('#tabBody > .cap')).toBeNull();
    l.open = true; l.dispatchEvent(new Event('toggle'));
    buehne.render();
    expect(q('#tabBody details.lesehilfe').open).toBe(true);
  });
  it('Kopfzeile kompakt: zwei Kennzahlen als Kopie, in Schritt 5 für Bildschirmleser verborgen; Ergänzung unter dem Bild', () => {
    const S = migrate(clone(EXAMPLE)); S.ui.mode = 'form';
    const { app } = boot(S);
    const kk = q('#kopfKpis');
    expect([...kk.querySelectorAll('.kpi .l')].map((x) => x.textContent)).toEqual(['Vermögen reicht bis', 'Tragbare Ausgaben pro Monat']);
    expect(kk.querySelector('.s')).toBeNull();
    expect(kk.getAttribute('aria-hidden')).toBe('false');
    expect(q('#subUnten').textContent).toBe(q('#verdictSub').textContent);
    app.schritt.go('urteil');
    expect(kk.getAttribute('aria-hidden')).toBe('true');
    expect(q('#kpis').querySelectorAll('.kpi').length).toBe(3);
  });
  it('Live-Region des Urteils bleibt vor dem ersten Ergebnis im Baum', () => {
    const leer = emptyState(); leer.ui.mode = 'form';
    boot(leer);
    const live = q('[data-block="kopf"] [aria-live]');
    expect(q('[data-block="kopf"]').classList.contains('frage')).toBe(true);
    expect(live.hidden).toBe(false);
    expect(live.classList.contains('urteil-live')).toBe(true);
    const css = readFileSync(resolve(process.cwd(), 'src/styles/pension/styles.css'), 'utf8');
    expect(css).toContain('.verdict.frage > :not(.kfrage):not(.urteil-live) { display: none; }');
    expect(css).not.toMatch(/(^|[\s,>])\.urteil-live[^{]*\{[^}]*display:\s*none/m); // nur in :not(), nie selbst ausgeblendet
  });
});

describe('Ansichtswahl: Fokus und verfügbare Ansichten', () => {
  const form = () => { const S = migrate(clone(EXAMPLE)); S.ui.mode = 'form'; S.ui.schritt = 'urteil'; return S; };
  it('Neuberechnung behält den Fokus auf dem Register', () => {
    const { compute } = boot(form());
    q('#resTabs [data-ansicht="ablauf"]').click();
    const t = q('#ansicht-ablauf');
    expect(document.activeElement).toBe(t);
    compute();
    expect(document.activeElement).toBe(t);
  });
  it('Neuberechnung behält den Fokus auf dem Auswahlfeld', () => {
    const { compute } = boot(form());
    const sel = q('#ansichtWahl'); sel.focus();
    compute();
    expect(document.activeElement).toBe(sel);
    expect(sel.value).toBe('bild');
  });
  it('ohne Fixkosten-Rechnung keine Ansicht «Renten und Fixkosten»; gewählte fällt auf Bild zurück', () => {
    const S = form(); S.ui.ansicht = 'fix';
    const { app, buehne } = boot(S);
    app.R.fix = null;
    buehne.render();
    expect(q('#resTabs [data-ansicht="fix"]')).toBeNull();
    expect([...q('#ansichtWahl').options].map((o) => o.value)).not.toContain('fix');
    expect(q('#resTabs [aria-selected="true"]').dataset.ansicht).toBe('bild');
  });
});

describe('Ansatzpunkte', () => {
  const opt = Array.from({ length: 5 }, (_, i) => ({ t: `Titel ${i + 1}`, v: i ? '' : 'ca. CHF 1', x: `Erster Satz ${i + 1}. Zweiter Satz.` }));
  it('Reihenfolge wie geliefert, drei sichtbar, Rest hinter einem Knopf', () => {
    document.body.innerHTML = ansatzHtml(opt, { offen: false });
    expect([...document.querySelectorAll('.apk h4')].map((h) => h.textContent.trim())).toEqual(opt.map((o) => o.t));
    expect(q('[data-mehr-ansatz]').textContent).toContain('2 weitere');
    expect(q('[data-mehr-ansatz]').getAttribute('aria-expanded')).toBe('false');
    expect(q('#apkMehr').hidden).toBe(true);
    expect(document.querySelectorAll('#apkMehr .apk').length).toBe(2);
  });
  it('der Satz «keine Empfehlung» steht vollständig da, keine Rangbehauptung', () => {
    const h = ansatzHtml(opt, { offen: false });
    expect(h).toContain('Rechnerische Hinweise aus Ihren Angaben, keine Empfehlung.');
    expect(h).not.toMatch(/grösste Wirkung|wirksamste|empfohlen/i);
  });
  it('Texte sind maskiert', () => {
    expect(ansatzHtml([{ t: '<img src=x>', v: '<b>', x: '<script>1</script>' }], {})).not.toMatch(/<img|<script|<b>/);
  });
  it('erster Satz: Abkürzungen und Zahlen schneiden nicht', () => {
    expect(ersterSatz('Prüfen Sie die 3. Säule genau. Danach folgt mehr.')).toBe('Prüfen Sie die 3. Säule genau.');
    expect(ersterSatz('Das gilt z. B. für Einkäufe. Mehr dazu später.')).toBe('Das gilt z. B. für Einkäufe.');
    expect(ersterSatz("Rund CHF 1'000.50 sparen, ca. 5% mehr. Weiter.")).toBe("Rund CHF 1'000.50 sparen, ca. 5% mehr.");
    expect(ersterSatz('Nur ein Satz.')).toBe(null);
    expect(ersterSatz('Im 10. Jahr sinkt die Rente. Danach mehr.')).toBe('Im 10. Jahr sinkt die Rente.');
    expect(ersterSatz('Ab dem 15. Mai gilt es. Weiter.')).toBe('Ab dem 15. Mai gilt es.');
  });
  it('ein Satz: ganzer Text sichtbar, kein «mehr»; sonst voller Text hinter «mehr»', () => {
    document.body.innerHTML = ansatzHtml([{ t: 'A', v: '', x: 'Nur ein Satz.' }, { t: 'B', v: '', x: 'Eins. Zwei.' }], {});
    const k = document.querySelectorAll('.apk');
    expect(k[0].querySelector('details')).toBe(null);
    expect(k[0].textContent).toContain('Nur ein Satz.');
    expect(k[1].querySelector('.apk-t').textContent).toBe('Eins.');
    expect(k[1].querySelector('details p').textContent).toBe('Eins. Zwei.');
  });
  it('ohne Einträge der bisherige Satz', () => {
    expect(ansatzHtml([], {})).toContain('Mit den erfassten Angaben sind keine offensichtlichen Ansatzpunkte erkennbar.');
  });
  it('Formularmodus: Knopf öffnet, bleibt offen und behält den Fokus beim Neuberechnen; Bild unter den Karten', () => {
    const { app, results } = boot(migrate(clone(EXAMPLE)));
    document.body.dataset.mode = 'form';
    app.R.opt = Array.from({ length: 5 }, (_, i) => ({ t: `Titel ${i + 1}`, v: '', x: `Satz ${i + 1}. Zweiter Satz.` }));
    results.render();
    expect(q('#opt h2.vh')).not.toBe(null);
    expect(q('#opt #ansatzBild svg')).not.toBe(null);
    const k = q('[data-mehr-ansatz]');
    k.focus(); k.click();
    expect(q('#apkMehr').hidden).toBe(false);
    results.render();
    expect(q('#apkMehr').hidden).toBe(false);
    expect(q('[data-mehr-ansatz]').getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(q('[data-mehr-ansatz]'));
  });
});

describe('Aktionsplan kompakt', () => {
  const start = () => { const S = migrate(clone(EXAMPLE)); S.ui.mode = 'form'; S.ui.schritt = 'aktion'; return boot(S); };
  const haken = (cb) => { cb.focus(); cb.checked = !cb.checked; cb.dispatchEvent(new Event('change', { bubbles: true })); };
  it('drei nächste Aufgaben, früheste zuerst', () => {
    const { app } = start();
    const ids = [...document.querySelectorAll('#akt .anext [data-akt]')].map((x) => x.dataset.akt);
    const erw = [...app.R.akt].sort((a, b) => (a.A ?? Infinity) - (b.A ?? Infinity)).slice(0, 3).map((x) => x.id);
    expect(ids).toEqual(erw);
  });
  it('Gruppen mit Anzahl; Summe ist die Zahl aller Aufgaben', () => {
    const { app } = start();
    const n = [...document.querySelectorAll('#akt [data-agr] .n')].reduce((s, e) => s + +e.textContent, 0);
    expect(n).toBe(app.R.akt.length);
    expect(q('#akt [role="group"]').getAttribute('aria-label')).toBe('Aufgaben nach Zeitraum');
    expect(document.querySelectorAll('#akt [data-agr][aria-pressed="true"]').length).toBe(1);
  });
  it('Haken: Aufgabe verlässt «Als Nächstes», Zähler steigt, Zustand gemerkt; Fokus auf erstem Kästchen dort', () => {
    const { app } = start();
    const cb = q('#akt .anext [data-akt]'), id = cb.dataset.akt;
    haken(cb);
    expect(app.S.aktion[id]).toBe(1);
    expect(q('#akt .acnt').textContent).toContain('1 von');
    const rest = [...document.querySelectorAll('#akt .anext [data-akt]')];
    expect(rest.map((x) => x.dataset.akt)).not.toContain(id);
    expect(document.activeElement).toBe(rest[0]);
  });
  it('Haken in Gruppenliste und vollständiger Liste: Fokus bleibt, alle Kopien nachgeführt, Ids eindeutig', () => {
    const { app } = start();
    q('#akt [data-akt-alle]').click();
    const g = q('#akt .agsel [data-akt]'), id = g.dataset.akt;
    haken(g);
    const kopien = [...document.querySelectorAll('#akt [data-akt]')].filter((x) => x.dataset.akt === id);
    expect(kopien.length).toBeGreaterThan(1);
    expect(kopien.every((x) => x.checked)).toBe(true);
    expect(document.activeElement.dataset.akt).toBe(id);
    expect(document.activeElement.closest('.agsel')).not.toBe(null);
    const ids = [...document.querySelectorAll('#akt [id]')].map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    haken(q('#akt .aalle [data-akt]:not(:checked)'));
    expect(document.activeElement.closest('.aalle')).not.toBe(null);
    expect(Object.keys(app.S.aktion).length).toBe(2);
  });
  it('Gruppenwahl und «alle zeigen» bleiben beim Neuberechnen; Fokus bleibt auf dem Knopf', () => {
    const { app, results } = start();
    const knoepfe = [...document.querySelectorAll('#akt [data-agr]')];
    expect(knoepfe.length).toBeGreaterThan(1);
    knoepfe[1].focus(); knoepfe[1].click();
    expect(q('#akt [data-agr][aria-pressed="true"]').dataset.agr).toBe(knoepfe[1].dataset.agr);
    expect(document.activeElement.dataset.agr).toBe(knoepfe[1].dataset.agr);
    const alle = q('#akt [data-akt-alle]');
    alle.focus(); alle.click();
    expect(q('#akt [data-akt-alle]').getAttribute('aria-expanded')).toBe('true');
    results.render();
    expect(q('#akt [data-agr][aria-pressed="true"]').dataset.agr).toBe(knoepfe[1].dataset.agr);
    expect(q('#akt [data-akt-alle]').getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(q('#akt [data-akt-alle]'));
    expect(app.R.akt.length).toBeGreaterThan(0);
  });
  it('«Alle zeigen» öffnet die vollständige Liste', () => {
    const { app } = start();
    q('#akt [data-akt-alle]').click();
    expect(document.querySelectorAll('#akt .aalle [data-akt]').length).toBe(app.R.akt.length);
  });
  it('alle erledigt: kurzer Satz statt leerer Liste; Platzhalter für Themen leer', () => {
    const { app, results } = start();
    app.S.aktion = Object.fromEntries(app.R.akt.map((x) => [x.id, 1]));
    results.render();
    expect(q('#akt .anext').textContent).toContain('Alle Aufgaben sind erledigt.');
    expect(q('#akt #aktThemen').innerHTML).toBe('');
  });
  it('Überschriften in gültiger Reihenfolge (h2 vor h3)', () => {
    start();
    const h = [...document.querySelectorAll('#akt h1, #akt h2, #akt h3, #akt h4')].map((x) => +x.tagName[1]);
    expect(h[0]).toBe(2);
    h.forEach((x, i) => { if (i) expect(x - h[i - 1]).toBeLessThanOrEqual(1); });
  });
  it('Tutor: dieselbe kompakte Form mit Gruppenknöpfen, Überschrift «Ihre nächsten drei Schritte.»', () => {
    const S = migrate(clone(EXAMPLE)); S.ui.mode = 'tutor';
    const { app } = boot(S);
    expect(q('#akt [data-agr]')).not.toBe(null);
    expect(q('#akt h2').textContent).toBe('Ihre nächsten drei Schritte.');
    expect(q('#akt').textContent).not.toContain('Als Nächstes.');
    q('#akt [data-akt-alle]').click();
    expect(document.querySelectorAll('#akt .aalle [data-akt]').length).toBe(app.R.akt.length);
  });
});

describe('Drucken aus dem Formularmodus', () => {
  const form = () => { const S = migrate(clone(EXAMPLE)); S.ui.mode = 'form'; S.ui.schritt = 'urteil'; return S; };
  const vorDruck = () => window.dispatchEvent(new Event('beforeprint'));
  const nachDruck = () => window.dispatchEvent(new Event('afterprint'));
  const ids = () => [...document.querySelectorAll('[id]')].map((e) => e.id);
  const doppelt = () => ids().filter((x, i, a) => a.indexOf(x) !== i);

  it('alle verfügbaren Ansichten in der Reihenfolge von ANSICHTEN, je mit Überschrift', () => {
    const S = form(); S.ui.ansicht = 'jahre';
    const { app } = boot(S);
    const erwartet = ANSICHTEN.map(([id]) => id).filter((id) => (id !== 'wuensche' || app.S.wuensche.length > 0) && (id !== 'fix' || !!app.R.fix));
    vorDruck();
    const sek = [...document.querySelectorAll('#druckAnsichten > section')];
    expect(sek.map((x) => x.dataset.ansicht)).toEqual(erwartet);
    sek.forEach((x, i) => {
      const t = ANSICHTEN.find(([id]) => id === erwartet[i])[1];
      expect(x.querySelector('h2').textContent).toBe(`${t}.`);
    });
    expect(q('#druckAnsichten #bild svg')).not.toBeNull();
    expect(q('#druckAnsichten #bild svg').getAttribute('viewBox')).toMatch(/^0 0 700 420(.0)?$/);
    expect(q('#tabBody').innerHTML).toBe('');
    expect(doppelt()).toEqual([]);
    nachDruck();
  });
  it('keine doppelte Element-Id, auch mit Wünschen und offenem Aktionsplan', () => {
    const { app } = boot(form());
    q('#akt [data-akt-alle]')?.click();
    vorDruck();
    expect(doppelt()).toEqual([]);
    expect(q('#druckAnsichten').children.length).toBeGreaterThan(3);
    nachDruck();
    expect(app.S.ui.mode).toBe('form');
  });
  it('Aktionsplan im Druck: volle Liste vorhanden; danach wieder wie vorher', () => {
    boot(form());
    const knopf = q('#akt [data-akt-alle]');
    expect(knopf.getAttribute('aria-expanded')).toBe('false');
    vorDruck();
    expect(q('#aktAlle').children.length).toBeGreaterThan(0);
    nachDruck();
    expect(q('#akt [data-akt-alle]').getAttribute('aria-expanded')).toBe('false');
    expect(q('#aktAlle').hidden).toBe(true);
  });
  it('afterprint leert das Druckelement und stellt die Ansicht wieder her', () => {
    boot(form());
    const vorher = q('#tabBody').innerHTML;
    vorDruck();
    nachDruck();
    expect(q('#druckAnsichten').innerHTML).toBe('');
    expect(q('#tabBody').innerHTML).not.toBe('');
    expect(q('#tabBody svg')).not.toBeNull();
    expect(vorher).not.toBe('');
  });
  it('Tutor: beforeprint füllt das Druckelement wie im Formularmodus', () => {
    const S = migrate(clone(EXAMPLE)); S.ui.mode = 'tutor';
    boot(S);
    vorDruck();
    expect(q('#druckAnsichten').children.length).toBeGreaterThan(3);
    expect(doppelt()).toEqual([]);
    nachDruck();
    expect(q('#druckAnsichten').innerHTML).toBe('');
  });
  it('ohne Ergebnis bleibt das Druckelement leer', () => {
    const leer = emptyState(); leer.ui.mode = 'form';
    boot(leer);
    vorDruck();
    expect(q('#druckAnsichten').innerHTML).toBe('');
    nachDruck();
  });
  it('Druck-CSS: Schrittleisten und kleines Bild ausgeblendet, keine Blöcke ausgeschlossen, Druckelement nur im Druck', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/pension/styles.css'), 'utf8');
    const druck = css.slice(css.indexOf('@media print'), css.indexOf('/* Ansichten für den Druck'));
    expect(druck).toMatch(/#schritte, #schritteMobil, #miniBild[^{]*\{[^}]*display: none !important/);
    expect(druck).not.toContain('[data-block="mehr"]');
    expect(druck).not.toMatch(/\[data-block\][^{]*\{[^}]*none/);
    expect(css).toMatch(/\.druckansichten \{ display: none; \}/);
    expect(druck).toContain('  .druckansichten { display: block; }');
  });
});

describe('Ergebnis im geführten Modus', () => {
  const start = () => { const S = migrate(clone(EXAMPLE)); S.ui.mode = 'tutor'; S.ui.tutorStep = 'ergebnis'; S.ui.tutorMax = 99; return boot(S); };
  it('eine Seite mit allen Bausteinen, ohne Schrittleiste', () => {
    start();
    expect(document.body.dataset.tdetails).toBe('1');
    // #main statt #results: Das Urteil (Block «kopf») steht im Tutor-Ergebnis in der Karte des Tutors (Runde 1, Befund 2)
    for (const b of ['kopf', 'ansichten', 'aktion', 'ansatz', 'themen', 'abschluss']) expect(q(`#main [data-block="${b}"]`), b).not.toBeNull();
    expect(q('#results').textContent).toContain('Ihre nächsten drei Schritte.');
    expect(q('#results').textContent).toContain('Weiter erkunden.');
    expect([...document.querySelectorAll('#sprung a')].map((a) => a.textContent)).toEqual(['Urteil', 'Bild', 'Schritte', 'Ansatzpunkte', 'Themen']);
  });
  it('Themen sind freiwillig: Ergebnis ohne Karte vollständig', () => {
    const { app } = start();
    expect(app.S.themen).toEqual([]);
    expect(q('#verdictText').textContent.length).toBeGreaterThan(10);
  });
  it('alte Register und «Weitere Auswertungen» gibt es nicht mehr', () => {
    start();
    expect(q('#more')).toBeNull();
    expect(q('[data-tab]')).toBeNull();
  });

  // Ergänzende Prüfungen dieser Aufgabe
  const bloecke = () => [...document.querySelectorAll('#results [data-block]')].map((x) => x.dataset.block);
  it('Reihenfolge im Dokument wie auf dem Bildschirm; Themen und So oder so unter «Weiter erkunden»', () => {
    start();
    expect(bloecke()).toEqual(['trag', 'ansichten', 'aktion', 'ansatz', 'erkunden', 'themen', 'vergleich', 'abschluss', 'hinweis']);
    const erk = q('#erkunden');
    expect(erk.querySelector('h2').textContent).toBe('Weiter erkunden.');
    expect(erk.contains(q('#themenleiste')) && erk.contains(q('#vergleich')) && erk.contains(q('#sofortBox')) && erk.contains(q('#themaEdit'))).toBe(true);
    // Die Einleitung des Tutors steht vor dem Ergebnis
    expect(q('#tutor').compareDocumentPosition(q('#results')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it('oben: Einleitung, dann Urteil mit Ampel und drei Kennzahlen, dann Tragbarkeit mit Rechenvariante, dann der Rückweg', () => {
    start();
    const folge = ['#tutor .thead h2', '#tutor #lamp', '#tutor #verdictText', '#tutor #kpis', '#tutor .tresult .trag', '#tutor .tresult [data-apply]', '#tutor .tresult [data-tgo="haushalt"]', '#sprung', '#results [data-block="ansichten"]'].map((x) => { const el = q(x); expect(el, x).not.toBeNull(); return el; });
    folge.forEach((el, i) => { if (i) expect(folge[i - 1].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING, String(i)).toBeTruthy(); });
    expect(document.querySelectorAll('#tutor #kpis .kpi').length).toBe(3);
    expect(q('#sprung a').getAttribute('href')).toBe('#urteilBlock');
    expect(q('#tutor #urteilBlock')).not.toBeNull();
  });
  it('neue Rechnung im Ergebnis: Das Urteil bleibt derselbe Knoten am selben Platz, der Text ist neu', async () => {
    const { app, compute } = start();
    const block = q('#urteilBlock'), platz = block.parentElement, live = q('#urteilBlock .urteil-live'), alt = q('#verdictText').textContent;
    expect(platz.matches('[data-tkopf]')).toBe(true);
    block.dataset.marke = '1';
    const weg = [];
    const mo = new MutationObserver((ms) => ms.forEach((m) => m.removedNodes.forEach((n) => weg.push(n))));
    mo.observe(platz, { childList: true });
    app.S.ausgabenRuhestand = 6000;
    compute();
    await tick();
    weg.push(...mo.takeRecords().flatMap((m) => [...m.removedNodes]));
    mo.disconnect();
    expect(weg).not.toContain(block);
    expect(q('#urteilBlock')).toBe(block);
    expect(block.parentElement).toBe(platz);
    expect(q('#urteilBlock').dataset.marke).toBe('1');
    expect(q('#urteilBlock .urteil-live')).toBe(live);
    expect(q('#verdictText').textContent).not.toBe(alt);
    expect(q('#tutor .tresult .trag')).not.toBeNull();
  });
  it('Druck: nach einem Neuaufbau der Karte kommt das Urteil in den neuen Platz zurück', () => {
    const { tutor } = start();
    window.dispatchEvent(new Event('beforeprint'));
    tutor.render();
    window.dispatchEvent(new Event('afterprint'));
    expect(q('#urteilBlock').parentElement).toBe(q('#tutor [data-tkopf]'));
    expect(q('#urteilBlock').isConnected).toBe(true);
  });
  it('Rechenvariante der Tragbarkeit im Tutor übernehmen: dieselben Amortisationen wie im Formular', () => {
    const { app } = start();
    expect(app.R.vs).toBeTruthy();
    const erwartet = [...app.S.amortisationen, ...JSON.parse(JSON.stringify(app.R.vs.amortisationen))];
    // in der Einleitung und im Block «trag» (dieser erscheint im Tutor nur im Druck)
    expect(document.querySelectorAll('[data-apply]').length).toBe(2);
    q('#tutor .tresult [data-apply]').click();
    expect(app.S.amortisationen).toEqual(erwartet);
    expect(app.toasts.at(-1)).toMatch(/jetzt bei der Liegenschaft im Formular/);
    const f = migrate(clone(EXAMPLE)); f.ui.mode = 'form'; f.ui.schritt = 'urteil';
    const b = boot(f);
    q('#tragBox [data-apply]').click();
    expect(b.app.S.amortisationen).toEqual(erwartet);
  });
  it('Hin und zurück über den Moduswechsel: Reihenfolge und Platz des Editors stimmen jedes Mal', () => {
    const { app, form, tutor, results, themen, vergleich, buehne } = start();
    // wie app.setMode in main.js (applyMode mit buehne.ordne, Neuaufbau, Rechnung bleibt)
    const wechsle = (m) => { tutor.entwurfBeenden(); app.S.ui.mode = m; document.body.dataset.mode = m; buehne.ordne(); if (m === 'form') form.render(); else tutor.render(); results.render(); themen.render(); vergleich.render(); buehne.render(); };
    const FORM = ['kopf', 'kopf', 'trag', 'vergleich', 'ansichten', 'themen', 'ansatz', 'aktion', 'erkunden', 'abschluss', 'hinweis'];
    const TUTOR = ['trag', 'ansichten', 'aktion', 'ansatz', 'erkunden', 'themen', 'vergleich', 'abschluss', 'hinweis'];
    const pruefe = (m) => {
      if (m === 'form') {
        expect([...document.querySelectorAll('#results > [data-block]')].map((x) => x.dataset.block)).toEqual(FORM);
        expect(q('#themaEdit').parentElement.id).toBe('formwrap');
        expect(q('#themaEdit').nextElementSibling.id).toBe('schritte');
      } else {
        expect(bloecke()).toEqual(TUTOR);
        expect(q('#themaEdit').parentElement.id).toBe('erkunden');
        expect(q('#tutor [data-tkopf] #urteilBlock')).not.toBeNull();
      }
    };
    pruefe('tutor');
    q('#themenleiste [data-thema="w0"]').click();
    expect(q('#themaEdit').hidden).toBe(false);
    for (const m of ['form', 'tutor', 'form']) {
      wechsle(m);
      pruefe(m);
      expect(q('#themaEdit').hidden).toBe(false);
      expect(q('#themaEditTitel')).not.toBeNull();
    }
    const d = [...document.querySelectorAll('[id]')].map((e) => e.id).filter((x, i, l) => l.indexOf(x) !== i);
    expect(d).toEqual([]);
  });
  it('Wechsel ins Formular stellt die Bühne wieder her', () => {
    const { app, buehne } = start();
    app.S.ui.mode = 'form'; document.body.dataset.mode = 'form';
    buehne.render();
    expect([...document.querySelectorAll('#results > [data-block]')].map((x) => x.dataset.block))
      .toEqual(['kopf', 'kopf', 'trag', 'vergleich', 'ansichten', 'themen', 'ansatz', 'aktion', 'erkunden', 'abschluss', 'hinweis']);
    expect(q('#erkunden').querySelector('[data-block]')).toBeNull();
    expect(q('#formwrap').contains(q('#themaEdit'))).toBe(true);
    expect(q('#themaEdit').nextElementSibling.id).toBe('schritte');
    expect(q('label[for="ansichtWahl"]').textContent).toBe('Ansicht');
  });
  it('Einleitung: Tragbarkeit einmal (im Tutor), Rückweg «Angaben ändern», keine eigenen Diagramme', () => {
    const { app } = start();
    expect(q('#tutor .tresult .trag').textContent).toContain('Hypothek nicht tragbar');
    const zurueck = [...document.querySelectorAll('#tutor button')].find((b) => b.textContent === 'Angaben ändern');
    zurueck.click();
    expect(app.S.ui.tutorStep).toBe('haushalt');
    start();
    expect(q('#tutor [data-reach], #tutor #tch, #tutor .tresult .kpis, [data-tact="details"]')).toBeNull();
    const css = readFileSync(resolve(process.cwd(), 'src/styles/pension/styles.css'), 'utf8');
    expect(css).toMatch(/@media screen \{[^}]*body\[data-mode="tutor"\] #tragBox \{ display: none; \}/);
  });
  it('Ansichtswahl als Auswahlfeld «Mehr Auswertungen», Bild mit erklärendem Satz', () => {
    const { app } = start();
    expect(q('label[for="ansichtWahl"]').textContent).toBe('Mehr Auswertungen');
    expect(q('#ansichtBox').hidden).toBe(false);
    expect([...q('#ansichtWahl').options].map((o) => o.value)).toEqual(ANSICHT_IDS);
    expect(q('#tabBody svg[role="img"]')).not.toBeNull();
    expect(q('#tabBody').textContent).toContain('Oben: Wovon Sie pro Jahr leben. Unten: Ihr freies Vermögen. Tippen zeigt die Werte.');
    const sel = q('#ansichtWahl'); sel.value = 'jahre'; sel.dispatchEvent(new Event('change', { bubbles: true }));
    expect(app.S.ui.ansicht).toBe('jahre');
    expect(q('#tabBody').textContent).toContain('Jahresrechnung des freien Vermögens');
    expect(q('#tabBody').textContent).not.toContain('Oben: Wovon Sie pro Jahr leben.');
  });
  it('Aktionsplan kompakt: drei nächste Schritte, Zugang zu allen Aufgaben', () => {
    const { app } = start();
    expect(q('#akt h2').textContent).toBe('Ihre nächsten drei Schritte.');
    expect(document.querySelectorAll('#akt .anext [data-akt]').length).toBe(3);
    const alle = q('#akt [data-akt-alle]');
    expect(alle.textContent).toBe('Alle ' + app.R.akt.length + ' Aufgaben zeigen');
    alle.click();
    expect(document.querySelectorAll('#akt .aalle [data-akt]').length).toBe(app.R.akt.length);
  });
  it('Sprungleiste: Anker auf die Abschnitte; ein Sprung setzt den Fokus auf die Überschrift', () => {
    const { buehne } = start();
    const a = [...document.querySelectorAll('#sprung a')];
    expect(q('#sprung').tagName).toBe('NAV');
    expect(q('#sprung').getAttribute('aria-label')).toBe('Abschnitte');
    a.forEach((x) => expect(q(x.getAttribute('href')), x.textContent).not.toBeNull());
    a[2].click();
    expect(document.activeElement.textContent).toBe('Ihre nächsten drei Schritte.');
    buehne.springe('erkunden');
    expect(document.activeElement.textContent).toBe('Weiter erkunden.');
    a[0].click();
    expect(document.activeElement.id).toBe('verdictText');
    a[1].click();
    expect(q('[data-block="ansichten"]').contains(document.activeElement)).toBe(true);
  });
  it('Themen wie im Formular: Leiste, Auswahl, Editor im Block «Weiter erkunden»; Wunsch aus dem Tutor als Karte', () => {
    const { app } = start();
    expect(q('#themenleiste').hidden).toBe(false);
    expect(q('#themenleiste [data-thema="w0"]').textContent).toContain('Griechenland');
    q('#btnThema').click();
    expect(q('#themenDlg').open).toBe(true);
    q('#themenAuswahl [data-karte="reisen"]').click();
    q('#btnThemaFertig').click();
    expect(app.S.wuensche.length).toBe(2);
    q('#themenleiste [data-thema="w1"]').click();
    expect(q('#themaEdit').hidden).toBe(false);
    expect(q('#erkunden').contains(q('#themaEdit'))).toBe(true);
    expect(document.activeElement.id).toBe('themaEditTitel');
    const d = [...document.querySelectorAll('[id]')].map((e) => e.id).filter((x, i, l) => l.indexOf(x) !== i);
    expect(d).toEqual([]);
  });
  it('So oder so im Tutor: starten, umschalten, übernehmen', () => {
    const { app } = start();
    expect(q('#vergleich h2').textContent).toBe('So oder so.');
    q('#vergleich [data-vgl-karte="w0"]').click();
    expect(app.S.ui.tutorStep).toBe('ergebnis');
    const f = (s, k) => q(`#vergleich [data-vg="${s}"][data-k="${k}"]`);
    type(f('b', 'monate'), '9'); type(f('b', 'von'), '58'); type(f('b', 'bis'), '80');
    q('#vergleich [data-vgl-los]').click();
    expect(q('#vergleich h3').textContent).toBe('Griechenland: so … oder so?');
    expect(q('#vglBild svg')).not.toBeNull();
    q('#vergleich [data-ab="b"]').click();
    expect(q('#vergleich [data-ab="b"]').getAttribute('aria-checked')).toBe('true');
    q('#vergleich [data-uebernehmen="b"]').click();
    expect(app.S.wuensche[0].monate).toBe(9);
    expect(app.S.themen).toEqual([]);
    expect(app.S.ui.mode).toBe('tutor');
  });
  it('So oder so im Tutor: verwerfen', () => {
    const S = migrate(clone(EXAMPLE)); Object.assign(S.ui, { mode: 'tutor', tutorStep: 'ergebnis', tutorMax: 99 });
    S.themen = [{ karte: 'ausland', status: 'vergleich', w: 0, a: { monate: 2, von: 58, bis: 80 }, b: { monate: 10, von: 58, bis: 80 } }];
    const { app } = boot(S);
    q('#vergleich [data-verwerfen]').click();
    expect(app.S.themen).toEqual([]);
    expect(app.S.wuensche[0].monate).toBe(4);
  });
  it('Druck aus dem Tutor: dieselben Ansichten wie im Formularmodus, danach wie vorher', () => {
    start();
    window.dispatchEvent(new Event('beforeprint'));
    expect([...document.querySelectorAll('#druckAnsichten > section')].map((x) => x.dataset.ansicht)).toContain('jahre');
    // Die Tutor-Karte wird nicht gedruckt: Das Urteil steht im Druck in #results, danach wieder in der Karte
    expect(q('#urteilBlock').parentElement.id).toBe('results');
    expect(q('#aktAlle').children.length).toBeGreaterThan(0);
    window.dispatchEvent(new Event('afterprint'));
    expect(q('#druckAnsichten').innerHTML).toBe('');
    expect(q('#tabBody svg')).not.toBeNull();
    expect(q('#tutor [data-tkopf] #urteilBlock')).not.toBeNull();
    const css = readFileSync(resolve(process.cwd(), 'src/styles/pension/styles.css'), 'utf8');
    const druck = css.slice(css.indexOf('@media print'), css.indexOf('/* Ansichten für den Druck'));
    expect(druck).toContain('  .druckansichten { display: block; }');
    expect(druck).toMatch(/#sprung[^{]*\{[^}]*display: none !important/);
  });
  it('ohne Ergebnis: «Fast geschafft», kein Fehler', () => {
    const S = migrate({ ...clone(EXAMPLE), ausgabenRuhestand: 0 }); Object.assign(S.ui, { mode: 'tutor', tutorStep: 'ergebnis', tutorMax: 99 });
    boot(S);
    expect(q('#tutor h2').textContent).toBe('Fast geschafft.');
    expect(document.body.textContent).not.toMatch(/undefined|NaN/);
  });
  it('Bildhöhe im Tutor aus der Breite, nicht aus dem Platz der Bühne', () => {
    const S2 = migrate(clone(EXAMPLE)), d = bildDaten(S2, auswerten(S2, E, A0 + 1), E);
    document.body.innerHTML = '<div class="results"><div id="h"></div></div>';
    const h = q('#h'), hoehe = () => +h.querySelector('svg').getAttribute('viewBox').split(' ')[3];
    Object.defineProperty(h, 'clientWidth', { value: 600 });
    // Das Fenster wäre nur 200 Pixel hoch: auf der Bühne richtet sich das Bild nach dem Platz bis zur
    // Fensterunterkante (nicht nach der Höhe der Bühne, die selbst vom Bild abhängt), im Tutor nicht
    q('.results').getBoundingClientRect = () => ({ top: 0, bottom: 900, left: 0, right: 600, width: 600, height: 900 });
    const vh = window.innerHeight;
    window.innerHeight = 200;
    renderBild(h, d);
    expect(hoehe()).toBeLessThan(300);
    renderBild(h, d, { frei: Infinity });
    expect(hoehe()).toBe(338);
    window.innerHeight = vh;
    expect(hoeheFuer(1200, Infinity, true)).toBe(520);
    expect(hoeheFuer(320, Infinity, false)).toBe(300);
  });
});

describe('Barrierefreiheit: Tabellenköpfe und Hauptüberschrift', () => {
  it('kein leerer Spaltenkopf in «Vermögensbilanz», «Renten und Fixkosten» und «Wünsche und Ziele»', () => {
    const S = migrate(clone(EXAMPLE)); S.ui.mode = 'form'; S.ui.schritt = 'urteil';
    const { results, app } = boot(S);
    expect(app.R.fix).toBeTruthy();
    for (const id of ['bilanz', 'fix', 'wuensche']) {
      q('#tabBody').innerHTML = results.ansichtHtml(id);
      const leer = [...document.querySelectorAll('#tabBody th')].filter((th) => !th.textContent.trim());
      expect(leer.length, id).toBe(0);
    }
  });
  it('die Hauptüberschrift bleibt in der Ansicht «Ergebnis» im Baum (nur verborgen, nie display: none)', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/pension/styles.css'), 'utf8');
    expect(css).not.toMatch(/body:not\(\[data-view="form"\]\) \.hero \{ display: none; \}/);
    expect(css).toMatch(/body\[data-view="results"\] \.hero \{ position: absolute;[^}]*clip: rect\(0 0 0 0\)/);
    boot(migrate(clone(EXAMPLE)));
    expect(q('.hero h1#heroTitle')).not.toBeNull();
  });
});
