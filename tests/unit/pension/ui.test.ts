// @ts-nocheck — Referenztest, aus PensCheck (tests/ui.test.js, Stand 4830eff) übernommen; nur Pfade angepasst.
// @vitest-environment happy-dom
// Oberfläche: Formular, Tutor und Ergebnis mit dem echten Seitengerüst (index.html), gerechnet ohne Worker.
// Kern ist die Prüfung, dass Inhalte aus einem präparierten Link nie als HTML in die Seite gelangen.
import { describe, it, expect, beforeEach } from 'vitest';
import { EXAMPLE, clone, migrate, encodeCode, decodeCode, emptyState, ANSICHT_IDS } from '../../../src/lib/pension/state';
import { terms } from '../../../src/pension-ui/glossar';
import { pdfTxt, themenZeilen } from '../../../src/pension-ui/report';
import { A0, b64, boot, bootR, type, blur, q, tick, BOESE, boeserLink, keinSchadcode } from './hilfen';

beforeEach(() => { delete window.__xss; });

describe('Präparierter Link (XSS)', () => {
  it('Schadcode erscheint in keiner Ansicht als HTML', () => {
    const ns = decodeCode(boeserLink());
    Object.assign(ns.ui, { edited: true, tutorStep: 'ergebnis', tutorMax: 99, mode: 'form', open: {} });
    const { app, results, buehne, tutor, themen, vergleich } = boot(ns);
    expect(app.R.leer).toBe(false);
    keinSchadcode();
    // alle Ansichten des Ergebnisses
    for (const k of ANSICHT_IDS) { app.S.ui.ansicht = k; results.render(); buehne.render(); keinSchadcode(); }
    app.S.ui.ansicht = 'jahre'; app.S.ui.jview = 'fix'; buehne.render(); keinSchadcode();
    // alle Schritte des Tutors
    for (const id of ['start', 'haushalt', 'personen', 'pension', 'ausgaben', 'lohn', 'ahv', 'pk', 's3a', 'vermoegen', 'wohnen', 'wuensche', 'sofort', 'ergebnis']) { tutor.go(id); keinSchadcode(); }
    // Tutor-Ergebnis: Themenleiste, Karteneditor und So oder so unter «Weiter erkunden»
    app.S.wuensche[1].karte = 'reisen'; // Wunsch mit Schadcode im Namen als Karte, die So oder so anbietet
    Object.assign(app.S.ui, { mode: 'tutor', tutorStep: 'ergebnis' }); document.body.dataset.mode = 'tutor';
    buehne.ordne(); tutor.render(); results.render(); themen.render(); vergleich.render(); buehne.render();
    keinSchadcode();
    q('#themenleiste [data-thema="w1"]').click();
    expect(q('#erkunden #themaEdit').hidden).toBe(false);
    expect(q('#erkunden #vergleich h2').textContent).toBe('So oder so.');
    expect(q('#erkunden #vergleich [data-vgl-karte="w1"]').textContent).toContain('<img src=x');
    keinSchadcode();
    expect(q('#erkunden').textContent).toContain('<img src=x');
    expect(q('#themaEdit #te_name').value).toContain('<img src=x');
    app.S.ui.mode = 'form'; document.body.dataset.mode = 'form'; buehne.ordne(); buehne.render();
    // Der Text steht als Text da: im Ergebnis und in den Feldern des Formulars
    expect(q('#results').textContent).toContain('<img src=x');
    expect([...document.querySelectorAll('#form input.wname')].some((el) => el.value.includes('<img src=x'))).toBe(true);
    // Auswahlwerte und Zahlen sind auf gültige Werte zurückgesetzt
    expect(app.S.kanton).toBe('ZH');
    expect(app.S.tragGrenze).toBe(35);
    expect(app.S.personen[0].pensAlter).toBe(65);
    expect(app.S.amortisationen[1].quelle).toBe('frei');
  });

  it('auch ein von Hand eingegebener Name wird maskiert', () => {
    const s = migrate(clone(EXAMPLE));
    const { app } = boot(s);
    app.S.ui.mode = 'form';
    const name = q('#form input.wname[data-lg="0"]');
    type(name, BOESE);
    keinSchadcode();
    expect(app.S.liegenschaften[0].name.startsWith('"><img')).toBe(true);
  });
});

describe('Tragbarkeit im Tutor-Ergebnis (F1)', () => {
  it('der Musterfall zeigt «Hypothek nicht tragbar» und die Ampel ist nicht grün', () => {
    const s = migrate(clone(EXAMPLE));
    Object.assign(s.ui, { tutorStep: 'ergebnis', tutorMax: 99 });
    const { app } = boot(s);
    const t = q('#tutor .tresult');
    expect(t.querySelector('.trag').textContent).toContain('Hypothek nicht tragbar');
    expect(t.querySelector('.trag').textContent).toMatch(/Amortisation von rund CHF/);
    expect(app.R.amp.st).toBe('gelb');
    expect(q('#verdictSub').textContent).toContain('zählt hier nicht als Reserve');
    // Im Ergebnis-Schritt steht die Ampel nur einmal: im Urteil der Bausteine, nicht noch einmal in der Einleitung
    expect(document.querySelectorAll('#tutor .lamp, #results [data-block="kopf"] .lamp').length).toBe(1);
  });
  it('ohne Liegenschaft erscheint kein Hinweis zur Tragbarkeit', () => {
    const s = migrate(clone(EXAMPLE));
    s.liegenschaften = [];
    Object.assign(s.ui, { tutorStep: 'ergebnis', tutorMax: 99 });
    boot(s);
    expect(q('#tutor .tresult .trag')).toBeNull();
  });
});

describe('Eingaben im Formular', () => {
  it('ein Jahrgang ausserhalb des Bereichs wird nicht übernommen und begründet', () => {
    const { app } = boot(migrate(clone(EXAMPLE)));
    const el = q('#f_personen_0_jahrgang');
    type(el, '19725');
    expect(app.S.personen[0].jahrgang).toBe(1972);
    expect(el.classList.contains('bad')).toBe(true);
    expect(el.getAttribute('aria-invalid')).toBe('true');
    expect(el.nextElementSibling.textContent).toMatch(/Erlaubt sind Werte von 1920/);
    blur(el);
    expect(el.value).toBe('1972');
    expect(el.nextElementSibling.textContent).toMatch(/«19725» wurde nicht übernommen.*Es gilt weiter 1972/);
    type(el, '1971');
    expect(app.S.personen[0].jahrgang).toBe(1971);
    expect(el.classList.contains('bad')).toBe(false);
    expect(el.nextElementSibling?.classList.contains('ferr')).toBeFalsy();
  });
  it('«160.000» ist 160’000, «1.250,50» ist 1250.5, «12%» ist 12', () => {
    const { app } = boot(migrate(clone(EXAMPLE)));
    type(q('#f_personen_0_brutto'), '160.000');
    expect(app.S.personen[0].brutto).toBe(160000);
    type(q('#f_liquiditaet'), '1.250,50');
    expect(app.S.liquiditaet).toBe(1250.5);
    type(q('#f_steuerEink'), '12%');
    expect(app.S.steuerEink).toBe(12);
  });
  it('Buchstaben werden abgelehnt, ein leeres Pflichtfeld mit Mindestwert ebenfalls', () => {
    const { app } = boot(migrate(clone(EXAMPLE)));
    type(q('#f_personen_0_brutto'), 'viel');
    expect(app.S.personen[0].brutto).toBe(160000);
    expect(q('#f_personen_0_brutto').nextElementSibling.textContent).toBe('Bitte eine Zahl eingeben.');
    type(q('#f_personen_0_jahrgang'), '');
    expect(app.S.personen[0].jahrgang).toBe(1972);
    expect(q('#f_personen_0_jahrgang').nextElementSibling.textContent).toBe('Bitte einen Wert eingeben.');
  });
  it('jedes Feld hat eine Beschriftung, die auf es zeigt, oder einen Namen', () => {
    boot(migrate(clone(EXAMPLE)));
    const ohne = [...document.querySelectorAll('#form input, #form select')].filter((el) => !(el.getAttribute('aria-label') || (el.id && document.querySelector(`label[for="${el.id}"]`)) || el.closest('label')));
    expect(ohne.map((el) => el.outerHTML.slice(0, 80))).toEqual([]);
    const labelsOhneZiel = [...document.querySelectorAll('#form label[for]')].filter((l) => !document.getElementById(l.getAttribute('for')));
    expect(labelsOhneZiel.length).toBe(0);
  });
  it('ein von Hand erfasstes Gesprächsdatum bleibt, sonst gilt das Datum des Berichts', () => {
    const { app } = boot(migrate(clone(EXAMPLE)));
    expect(app.S.bericht.datum).toBe('');
    type(q('#f_bericht_datum'), '3.12.2026');
    expect(app.S.ui.datumSet).toBe(true);
    expect(migrate(app.S).bericht.datum).toBe('3.12.2026');
    expect(decodeCode(encodeCode(app.S)).bericht.datum).toBe('3.12.2026');
  });
});

describe('Tutor', () => {
  it('fragt nach, bevor eigene Angaben ersetzt werden, und lässt sie bei «Abbrechen» stehen', async () => {
    const s = migrate(clone(EXAMPLE));
    Object.assign(s.ui, { edited: true, tutorStep: 'start' });
    s.personen[0].brutto = 123456;
    const { app } = boot(s);
    app.antwort = false;
    q('#tutor [data-tact="practice"]').click();
    await tick();
    expect(app.confirms).toHaveLength(1);
    expect(app.S.personen[0].brutto).toBe(123456);
    q('#tutor [data-tact="own"]').click();
    await tick();
    expect(app.confirms).toHaveLength(2);
    expect(app.S.personen[0].brutto).toBe(123456);
    app.antwort = true;
    q('#tutor [data-tact="own"]').click();
    await tick();
    expect(app.S.personen[0].brutto).toBe(0);
  });
  it('«Zur Miete» entfernt die Liegenschaft erst nach Rückfrage', async () => {
    const s = migrate(clone(EXAMPLE));
    Object.assign(s.ui, { edited: true, tutorStep: 'wohnen', tutorMax: 99 });
    const { app } = boot(s);
    app.antwort = false;
    q('#tutor [data-tact="wohnen-miete"]').click();
    await tick();
    expect(app.confirms[0]).toContain('«Eigenheim»');
    expect(app.S.liegenschaften).toHaveLength(1);
    app.antwort = true;
    q('#tutor [data-tact="wohnen-miete"]').click();
    await tick();
    expect(app.S.liegenschaften).toHaveLength(0);
  });
  it('zeigt den Wunsch des Musterfalls und nennt Wünsche, die nur im Formular stehen', () => {
    const s = migrate(clone(EXAMPLE));
    s.wuensche.push({ typ: 'einmal', aktiv: true, name: 'Dachsanierung', betrag: 60000, alter: 66 });
    Object.assign(s.ui, { tutorStep: 'wuensche', tutorMax: 99 });
    boot(s);
    expect(q('#tutor [data-tact="wish-ausland"]').getAttribute('aria-checked')).toBe('true');
    expect(q('#tutor').textContent).toContain('Zusätzlich im Formular erfasst: Dachsanierung');
  });
  it('nennt den Horizont, mit dem gerechnet wird', () => {
    const s = migrate(clone(EXAMPLE));
    Object.assign(s, { horizontModus: '95' });
    Object.assign(s.ui, { tutorStep: 'personen', tutorMax: 99 });
    boot(s);
    expect(q('#tutor [data-live="person0"]').textContent).toContain('gerechnet wird bis 95');
    expect(q('#tutor').textContent).not.toContain('Wir rechnen sicherheitshalber 5 Jahre länger');
  });
  it('ein ungültiger Jahrgang wird im Tutor begründet und nicht gespeichert', () => {
    const s = migrate(clone(EXAMPLE));
    Object.assign(s.ui, { tutorStep: 'personen', tutorMax: 99 });
    const { app } = boot(s);
    const el = q('#tutor [data-tpath="personen.0.jahrgang"]');
    type(el, '19725');
    expect(app.S.personen[0].jahrgang).toBe(1972);
    expect(q('#tutor [data-err="personen.0.jahrgang"]').textContent).toMatch(/Erlaubt/);
  });
});

describe('Ergebnis', () => {
  it('Register sind mit Pfeiltasten bedienbar und behalten den Fokus', () => {
    const s = migrate(clone(EXAMPLE)); s.ui.mode = 'form';
    const { app } = boot(s);
    q('#resTabs [data-ansicht="ablauf"]').click();
    expect(app.S.ui.ansicht).toBe('ablauf');
    expect(document.activeElement.id).toBe('ansicht-ablauf');
    q('#resTabs').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(app.S.ui.ansicht).toBe('jahre');
    expect(document.activeElement.id).toBe('ansicht-jahre');
    expect(q('#tabBody').getAttribute('aria-labelledby')).toBe('ansicht-jahre');
  });
  it('nur das Urteil ist als Live-Bereich ausgezeichnet, nicht das ganze Ergebnis', () => {
    boot(migrate(clone(EXAMPLE)));
    expect(q('#results').hasAttribute('aria-live')).toBe(false);
    expect(q('#verdictText').parentElement.getAttribute('aria-live')).toBe('polite');
  });
  it('nennt, was nicht gerechnet ist, und spricht von Ansatzpunkten statt Empfehlungen', () => {
    boot(migrate(clone(EXAMPLE)));
    const sel = q('#ansichtWahl'); sel.value = 'hinweise'; sel.dispatchEvent(new Event('change', { bubbles: true }));
    const h = q('#tabBody').textContent;
    for (const t of ['Tarif des Kantonshauptorts', 'Todesfall bei Paaren', 'Grundstückgewinnsteuer']) expect(h).toContain(t);
    expect(q('#opt').textContent).toContain('keine Empfehlung');
  });
  it('leerer Stand: keine Rechnung, kein Fehler', () => {
    const { app } = boot(emptyState());
    expect(app.R.leer).toBe(true);
    expect(q('#kicker').textContent).toBe('Noch keine Rechnung');
  });
});

describe('Sonstiges', () => {
  it('Glossar-Texte lassen sich für jeden Begriff bilden', () => {
    const { app } = boot(migrate(clone(EXAMPLE)));
    for (const [k, [titel, text]] of Object.entries(terms(app))) { expect(titel, k).toBeTruthy(); expect(text, k).not.toMatch(/undefined|NaN/); }
  });
  it('PDF-Text: Namen ausserhalb von Latin-1 verlieren keine Buchstaben', () => {
    expect(pdfTxt('Kovačević')).toBe('Kovacevic');
    expect(pdfTxt('Łukasz Żółć')).toBe('Lukasz Zólc');
    expect(pdfTxt('Müller & Söhne – «Test» ’26')).toBe('Müller & Söhne – «Test» ’26');
  });
});

describe('Bericht: vorgemerkte Themen', () => {
  const mitThemen = (themen, wuensche) => ({ ...clone(EXAMPLE), themen, ...(wuensche ? { wuensche } : {}) });
  it('Bericht nennt vorgemerkte Themen, nicht die laufende Variante', () => {
    const S = migrate(mitThemen([{ karte: 'erbschaft', status: 'vor' }, { karte: 'abklaeren', status: 'vor', stelle: 'ak' }, { karte: 'ahv', status: 'vergleich', person: 0, a: { ahvBezug: -2 }, b: { ahvBezug: 2 } }]));
    const zeilen = themenZeilen(S);
    expect(zeilen).toEqual(['Erbschaft erwartet: vorgemerkt, noch zu klären', 'Noch abklären: Ausgleichskasse']);
  });
  it('Bericht ohne vorgemerkte Themen: kein Abschnitt', () => {
    expect(themenZeilen(migrate(clone(EXAMPLE)))).toEqual([]);
  });
  it('ein vorgemerkter Wunsch erscheint mit seinem Namen, frei erfasster Text läuft durch pdfTxt und ohne spitze Klammern', () => {
    const S = migrate(mitThemen([], [{ typ: 'jahr', karte: 'reisen', aktiv: false, name: 'Reise nach Łask <b>Asien</b>', betrag: 5000, von: 66, bis: 75 }, { typ: 'jahr', karte: 'pflege', aktiv: false, name: '', betrag: 3000, von: 80 }, { typ: 'jahr', aktiv: true, name: 'Läuft schon', betrag: 1000, von: 66, bis: 70 }]));
    expect(themenZeilen(S)).toEqual(['Reise nach Lask (b)Asien(/b): vorgemerkt, noch zu klären', 'Pflege und Gesundheit: vorgemerkt, noch zu klären']);
  });
  it('eine laufende Variante ändert weder die Zeilen noch die Zahlen, die der Bericht übernimmt', () => {
    const ohne = migrate(clone(EXAMPLE));
    const mit = migrate({ ...clone(EXAMPLE), themen: [{ karte: 'ahv', status: 'vergleich', person: 0, a: { ahvBezug: -2 }, b: { ahvBezug: 2 } }] });
    expect(mit.themen.some((t) => t.status === 'vergleich')).toBe(true);
    boot(ohne); const Rohne = bootR();
    boot(mit); const Rmit = bootR();
    for (const k of ['base', 'amp', 'opt', 'akt', 'trag', 'horizont']) expect(JSON.stringify(Rmit[k]), k).toBe(JSON.stringify(Rohne[k]));
    expect(themenZeilen(mit)).toEqual(themenZeilen(ohne));
  });
});

describe('Budget-Assistent im Tutor (Stufe 2)', () => {
  const start = (edit) => {
    const s = migrate(clone(EXAMPLE));
    s.liegenschaften = []; s.amortisationen = []; s.ausgabenRuhestand = 7500;
    Object.assign(s.ui, { tutorStep: 'ausgaben', tutorMax: 99, mode: 'tutor' });
    if (edit) edit(s);
    return boot(s);
  };
  const klick = async (sel) => { q(sel).click(); await tick(); };
  const schiebe = (path, v) => { const el = q(`#tutor input[data-tpath="${path}"]`); el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); };

  it('vierte Karte öffnet den Assistenten mit dem nächsten Musterbudget; ohne Übernehmen ändert sich nichts', async () => {
    const { app } = start();
    expect(document.querySelectorAll('#tutor .tchoices .tchoice').length).toBe(4);
    await klick('#tutor [data-tact="budget-open"]');
    expect(q('#tutor h2').textContent).toBe('Ihr Budget im Ruhestand');
    // Navigation des Tutors ist verborgen, solange der Assistent offen ist
    expect(q('#tutor .tnav')).toBeNull();
    expect(document.querySelectorAll('#tutor input[type=range]').length).toBe(8);
    expect(q('#tutor [data-live="budgetsum"]').textContent).toContain("CHF 7’500");
    schiebe('budget.freizeit', 2050);
    expect(q('#tutor [data-live="budgetsum"]').textContent).toContain("CHF 8’500");
    expect(app.S.ausgabenRuhestand).toBe(7500);
    await klick('#tutor [data-tact="budget-close"]');
    expect(app.S.budget).toEqual({});
    expect(app.S.budgetAktiv).toBe(false);
    expect(app.S.ausgabenRuhestand).toBe(7500);
    expect(q('#tutor .tnav')).not.toBeNull();
  });
  it('Übernehmen setzt die Ausgaben auf die Budgetsumme; ein Betrag von Hand hebt das Budget auf', async () => {
    const { app } = start();
    await klick('#tutor [data-tact="budget-open"]');
    schiebe('budget.freizeit', 2050);
    schiebe('budget.wohnen', 1800);
    await klick('#tutor [data-tact="budget-apply"]');
    expect(app.S.budgetAktiv).toBe(true);
    expect(app.S.ausgabenRuhestand).toBe(7500 + 1000 - 300);
    expect(app.S.fix.wohnen).toBe(1800);
    // vierte Karte gewählt, Richtwert-Karten nicht
    expect(q('#tutor [data-tact="budget-open"]').getAttribute('aria-checked')).toBe('true');
    expect(document.querySelectorAll('#tutor .tchoice[data-tset="ausgabenRuhestand"][aria-checked="true"]').length).toBe(0);
    expect(q('#tutor [data-live="ausgaben"]').textContent).toContain('aus Ihrem Budget');
    expect(q('#fixsum').textContent).toBeTruthy();
    // Regler von Hand: Betrag gilt, Budget bleibt gespeichert
    schiebe('ausgabenRuhestand', 6000);
    expect(app.S.budgetAktiv).toBe(false);
    expect(app.S.ausgabenRuhestand).toBe(6000);
    expect(app.S.budget.freizeit).toBe(2050);
    expect(q('#tutor [data-live="ausgaben"]').textContent).toContain('von Hand angepasst');
    await klick('#tutor [data-live="ausgaben"] [data-tact="budget-apply"]');
    expect(app.S.budgetAktiv).toBe(true);
    expect(app.S.ausgabenRuhestand).toBe(8200);
  });
  it('Beispiel laden und Richtwert-Karte', async () => {
    const { app } = start();
    await klick('#tutor [data-tact="budget-open"]');
    await klick('#tutor [data-tact="budget-preset"][data-k="gehoben"]');
    expect(q('#tutor [data-live="budgetsum"]').textContent).toContain("CHF 11’000");
    await klick('#tutor [data-tact="budget-apply"]');
    expect(app.S.ausgabenRuhestand).toBe(11000);
    await klick('#tutor .tchoice[data-tset="ausgabenRuhestand"][data-val=\'5000\']');
    expect(app.S.budgetAktiv).toBe(false);
    expect(app.S.ausgabenRuhestand).toBe(5000);
  });
  it('Eigenheim: Wohnkosten folgen der Liegenschaft, auch nach dem Übernehmen', async () => {
    const { app } = start();
    await klick('#tutor [data-tact="budget-open"]');
    await klick('#tutor [data-tact="wohnen-eigen"]');
    expect(q('#tutor h2').textContent).toBe('Ihr Budget im Ruhestand');
    expect(document.querySelectorAll('#tutor input[type=range]').length).toBe(7);
    // 500'000 × 1,8% + 900'000 × 0,5% pro Jahr, plus 400 pro Monat = 1'525
    expect(q('#tutor [data-live="bwohnen"]').textContent).toContain("CHF 1’525");
    await klick('#tutor [data-tact="budget-apply"]');
    expect(app.S.ausgabenRuhestand).toBe(7500 - 2100 + 1525);
    expect(app.S.fix.wohnen).toBeUndefined();
    app.S.liegenschaften[0].zins = 3;
    app.changed();
    expect(app.S.ausgabenRuhestand).toBe(7500 - 2100 + 2025);
  });
  it('Formular: Budget verwenden und wieder aufheben', async () => {
    const { app } = start((s) => { s.ui.mode = 'form'; });
    q('#budgetBtn').click();
    expect(app.toasts.join(' ')).toContain('alle Positionen');
    expect(app.S.budgetAktiv).toBe(false);
    for (const [k, v] of Object.entries({ kk: 1150, haushalt: 1250, mob: 600, vers: 450, freizeit: 1050, pers: 500, rueck: 400 })) type(q(`#form [data-path="budget.${k}"]`), String(v));
    q('#budgetBtn').click();
    expect(app.S.budgetAktiv).toBe(true);
    // Wohnen: Richtwert Miete, solange keine eigene erfasst ist
    expect(app.S.ausgabenRuhestand).toBe(5400 + app.P.annahmen.fixkosten.paar.miete);
    expect(q('#budgetBtn').getAttribute('aria-pressed')).toBe('true');
    type(q('#form [data-path="ausgabenRuhestand"]'), '7000');
    expect(app.S.budgetAktiv).toBe(false);
    expect(app.S.ausgabenRuhestand).toBe(7000);
  });
});

describe('Regler und Beispiele im Budget-Assistenten (Rückmeldungen vom Handy)', () => {
  const start = () => {
    const s = migrate(clone(EXAMPLE));
    s.liegenschaften = []; s.amortisationen = []; s.ausgabenRuhestand = 7500;
    Object.assign(s.ui, { tutorStep: 'ausgaben', tutorMax: 99, mode: 'tutor' });
    return boot(s);
  };
  const klick = async (sel) => { q(sel).click(); await tick(); };
  const regler = (path) => q(`#tutor input[type=range][data-tpath="${path}"]`);
  const zeiger = (el, typ, x, y, art = 'touch') => { const ev = new Event(typ, { bubbles: true }); Object.assign(ev, { pointerType: art, clientX: x, clientY: y }); el.dispatchEvent(ev); };
  const setze = (el, v) => { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); };

  it('ein geladenes Beispiel ist markiert, das Total steht oben, und eine Meldung bestätigt es', async () => {
    const { app } = start();
    await klick('#tutor [data-tact="budget-open"]');
    const chip = (k) => q(`#tutor [data-tact="budget-preset"][data-k="${k}"]`);
    expect(chip('mittel').getAttribute('aria-pressed')).toBe('true');
    expect(q('#tutor [data-live="budgettop"]').textContent).toContain('CHF 7’500');
    await klick('#tutor [data-tact="budget-preset"][data-k="gehoben"]');
    expect(chip('gehoben').getAttribute('aria-pressed')).toBe('true');
    expect(chip('mittel').getAttribute('aria-pressed')).toBe('false');
    expect(q('#tutor [data-live="budgettop"]').textContent).toContain('CHF 11’000');
    expect(app.toasts.at(-1)).toMatch(/Beispiel «grosszügig» geladen: CHF 11’000/);
    expect(q('#tutor [data-live="budgettop"]').textContent).toContain('Grundlage: grosszügig');
    expect(q('#tutor [data-live="budgettop"]').textContent).not.toContain('angepasst');
    // eigene Anpassung: Die Grundlage bleibt markiert und ist als angepasst bezeichnet
    setze(regler('budget.freizeit'), 1500);
    expect(chip('gehoben').getAttribute('aria-pressed')).toBe('true');
    expect(q('#tutor [data-live="budgettop"]').textContent).toContain('Grundlage: grosszügig, angepasst');
    // übernommen: Die Karte «Eigenes Budget» nennt Betrag und Grundlage
    await klick('#tutor [data-tact="budget-apply"]');
    const karte = q('#tutor .tchoice[data-tact="budget-open"]');
    expect(karte.getAttribute('aria-checked')).toBe('true');
    expect(karte.textContent).toContain('CHF 10’400');
    expect(karte.textContent).toContain('Grundlage: grosszügig, angepasst');
    expect(app.S.budgetBasis).toBe('gehoben');
  });
  it('Richtwerte: Der gewählte Wert ist in Tutor und Formular markiert', async () => {
    const { app } = start();
    const karten = () => [...document.querySelectorAll('#tutor .tchoice[data-tset="ausgabenRuhestand"]')].map((c) => c.getAttribute('aria-checked'));
    const chips = () => [...document.querySelectorAll('#chips .chip')].map((c) => c.getAttribute('aria-pressed'));
    expect(karten()).toEqual(['false', 'true', 'false']);
    expect(chips()).toEqual(['false', 'true', 'false']);
    await klick('#tutor .tchoice[data-tset="ausgabenRuhestand"][data-val=\'11000\']');
    expect(karten()).toEqual(['false', 'false', 'true']);
    expect(chips()).toEqual(['false', 'false', 'true']);
    q('#chips .chip[data-chip="5000"]').click();
    expect(chips()).toEqual(['true', 'false', 'false']);
    // ein eigener Betrag: kein Richtwert markiert
    setze(regler('ausgabenRuhestand'), 6250);
    expect(karten()).toEqual(['false', 'false', 'false']);
    expect(chips()).toEqual(['false', 'false', 'false']);
  });
  it('ein von Hand geladenes Beispiel setzt auch eine bereits erfasste Miete', async () => {
    const { app } = start();
    app.S.fix.wohnen = 1800;
    await klick('#tutor [data-tact="budget-open"]');
    expect(regler('budget.wohnen').value).toBe('1800'); // beim Öffnen bleibt die erfasste Miete
    await klick('#tutor [data-tact="budget-preset"][data-k="bescheiden"]');
    expect(app.S.fix.wohnen).toBe(1500);
    expect(q('#tutor [data-live="budgettop"]').textContent).toContain('CHF 5’000');
  });
  it('Schrittknöpfe ändern den Wert um genau einen Schritt, auch über den Reglerbereich hinaus', async () => {
    const { app } = start();
    await klick('#tutor [data-tact="budget-open"]');
    const plus = q('#tutor [data-rstep="budget.pers"][data-d="50"]'), minus = q('#tutor [data-rstep="budget.pers"][data-d="-50"]');
    plus.click(); plus.click(); minus.click();
    expect(app.S.budget.pers).toBe(550);
    expect(q('#tutor [data-rout="budget.pers"]').textContent).toBe('CHF 550');
    const el = regler('budget.pers'), max = +el.max;
    setze(el, max);
    plus.click();
    expect(app.S.budget.pers).toBe(max + 50);
    // der Regler der Gesamtausgaben bleibt in seinem Bereich
    await klick('#tutor [data-tact="budget-close"]');
    setze(regler('ausgabenRuhestand'), 20000);
    q('#tutor [data-rstep="ausgabenRuhestand"][data-d="250"]').click();
    expect(app.S.ausgabenRuhestand).toBe(20000);
    q('#tutor [data-rstep="ausgabenRuhestand"][data-d="-250"]').click();
    expect(app.S.ausgabenRuhestand).toBe(19750);
  });
  it('Touch: Tippen auf die Schiene und senkrechtes Wischen ändern nichts, waagrechtes Ziehen am Knopf schon', async () => {
    const { app } = start();
    await klick('#tutor [data-tact="budget-open"]');
    const el = regler('budget.freizeit'); // im Test liegt der Knopf bei x ≈ 11
    // 1. Tippen auf die Schiene, weit weg vom Knopf
    zeiger(el, 'pointerdown', 300, 10);
    setze(el, 3000);
    zeiger(el, 'pointerup', 300, 10);
    await tick();
    expect(app.S.budget.freizeit).toBe(1050);
    expect(el.value).toBe('1050');
    // 2. am Knopf angefasst, aber senkrecht gewischt (Seite scrollen)
    zeiger(el, 'pointerdown', 12, 10);
    setze(el, 1100); // erste kleine Bewegung kommt noch durch
    expect(app.S.budget.freizeit).toBe(1100);
    zeiger(el, 'pointermove', 14, 40);
    expect(app.S.budget.freizeit).toBe(1050); // zurück auf den Startwert
    setze(el, 1600);
    expect(app.S.budget.freizeit).toBe(1050);
    zeiger(el, 'pointerup', 14, 60);
    await tick();
    // 3. am Knopf angefasst und waagrecht gezogen
    zeiger(el, 'pointerdown', 12, 10);
    zeiger(el, 'pointermove', 60, 12);
    setze(el, 1600);
    zeiger(el, 'pointerup', 60, 12);
    await tick();
    expect(app.S.budget.freizeit).toBe(1600);
    // 4. der Browser bricht die Geste ab (übernimmt sie als Scrollen)
    zeiger(el, 'pointerdown', 12, 10);
    setze(el, 2000);
    zeiger(el, 'pointercancel', 12, 30);
    expect(app.S.budget.freizeit).toBe(1600);
    await tick();
    // Maus und Tastatur sind nicht betroffen
    zeiger(el, 'pointerdown', 300, 10, 'mouse');
    setze(el, 2500);
    expect(app.S.budget.freizeit).toBe(2500);
  });
});
