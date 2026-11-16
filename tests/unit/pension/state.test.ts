// @ts-nocheck — Referenztest, unverändert aus PensCheck (tests/state.test.js, Stand 4830eff) übernommen.
import { describe, it, expect } from 'vitest';
import { parseNum, fmtIn, esc } from '../../../src/lib/pension/format';
import { EXAMPLE, clone, migrate, sanitize, emptyState, encodeCode, decodeCode, rangeError, limitFor, jgMax, CODE_MAX, KANTONE } from '../../../src/lib/pension/state';
import params from '../../../public/data/params.json';

const b64 = (o) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

describe('Zahlen lesen (parseNum)', () => {
  it('Tausendertrennung mit Apostroph, Leerzeichen, Punkt und Komma', () => {
    expect(parseNum("160'000")).toBe(160000);
    expect(parseNum('160’000')).toBe(160000);
    expect(parseNum('160 000')).toBe(160000);
    expect(parseNum('160.000')).toBe(160000);
    expect(parseNum('1.250')).toBe(1250);
    expect(parseNum('1,250')).toBe(1250);
    expect(parseNum('1.250.000')).toBe(1250000);
    expect(parseNum('1,250,000')).toBe(1250000);
  });
  it('Dezimalzeichen Punkt oder Komma', () => {
    expect(parseNum('1.250,50')).toBe(1250.5);
    expect(parseNum('1,250.50')).toBe(1250.5);
    expect(parseNum('1250.5')).toBe(1250.5);
    expect(parseNum('1,8', true)).toBe(1.8);
    expect(parseNum('0.5')).toBe(0.5);
    expect(parseNum('12.75')).toBe(12.75);
  });
  it('in Feldern mit Nachkommastellen ist «1.250» ein Dezimalwert', () => {
    expect(parseNum('1.250', true)).toBe(1.25);
    expect(parseNum('1,250', true)).toBe(1.25);
  });
  it('Zusätze: Prozent, CHF, Fr., «.-», Minus', () => {
    expect(parseNum('12%', true)).toBe(12);
    expect(parseNum('12 %', true)).toBe(12);
    expect(parseNum("CHF 1'000")).toBe(1000);
    expect(parseNum('Fr. 2500.-')).toBe(2500);
    expect(parseNum('1000 CHF')).toBe(1000);
    expect(parseNum('-0.5', true)).toBe(-0.5);
    expect(parseNum('−3')).toBe(-3);
  });
  it('leer bleibt leer, Unsinn ist NaN', () => {
    expect(parseNum('')).toBe('');
    expect(parseNum('   ')).toBe('');
    for (const x of ['abc', '12a', '1.2.3', '1,2,3', '--5', '1e9', '<b>', '12.5.000,1,2']) expect(parseNum(x), x).toBeNaN();
  });
  it('fmtIn gibt nur Zahlen aus', () => {
    expect(fmtIn(160000)).toBe('160’000');
    expect(fmtIn(1.8, true)).toBe('1.8');
    expect(fmtIn('')).toBe('');
    expect(fmtIn('"><img src=x>')).toBe('');
    expect(fmtIn({})).toBe('');
  });
  it('esc maskiert HTML-Zeichen', () => {
    expect(esc('<img src=x onerror="a(\'b\')">&')).toBe('&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;');
  });
});

describe('Wertebereiche', () => {
  it('Jahrgang: vierstellig und volljährig', () => {
    expect(rangeError('jahrgang', 1972)).toBeNull();
    expect(rangeError('jahrgang', 19725)).toMatch(/Erlaubt/);
    expect(rangeError('jahrgang', 197)).toMatch(/Erlaubt/);
    expect(rangeError('jahrgang', 1972.5)).toMatch(/ganze Zahl/);
    expect(limitFor('jahrgang').max).toBe(jgMax());
  });
  it('Nebenkosten: CHF bei der Liegenschaft, Prozent beim Wunsch', () => {
    expect(rangeError('nebenkosten', 400)).toBeNull();
    expect(rangeError('nebenkosten', 400, 'w')).toMatch(/Erlaubt/);
  });
  it('leer ist kein Bereichsfehler', () => expect(rangeError('brutto', '')).toBeNull());
});

describe('Prüfung fremder Stände (sanitize)', () => {
  it('der Musterfall bleibt unverändert', () => {
    const s = migrate(clone(EXAMPLE));
    for (const k of ['haushalt', 'kanton', 'personen', 'liegenschaften', 'wuensche', 'liquiditaet', 'wertschriften', 'ausgabenRuhestand', 'inflation', 'tragGrenze', 'fix', 'amortisationen', 'einkommen']) expect(s[k], k).toEqual(EXAMPLE[k]);
    expect(migrate(s)).toEqual(s);
  });

  it('ergänzt Fehlendes neutral, nie mit Werten des Musterfalls', () => {
    const s = migrate({ personen: [{ jahrgang: 1965 }], haushalt: 'single' });
    expect(s.personen[0].jahrgang).toBe(1965);
    expect(s.personen[0].brutto).toBe(0);
    expect(s.personen[0].fz).toBe(0);
    expect(s.personen[0].pkKapital).toBe(0);
    expect(s.personen[1].brutto).toBe(0);
    expect(s.liquiditaet).toBe(0);
    expect(s.wertschriften).toBe(0);
    expect(s.ausgabenRuhestand).toBe(0);
    expect(s.liegenschaften).toEqual([]);
    expect(s.wuensche).toEqual([]);
    const leer = migrate({});
    expect(JSON.stringify(leer)).not.toContain('Griechenland');
    expect(JSON.stringify(leer)).not.toContain('1300000');
  });

  it('ältere Struktur: «vermoegen» wird zu Wertschriften', () => {
    const s = migrate({ vermoegen: 250000 });
    expect(s.wertschriften).toBe(250000);
    expect(s.liquiditaet).toBe(0);
    expect(s.vermoegen).toBeUndefined();
  });

  it('defekte Listen und Einträge fallen weg', () => {
    const s = migrate({ liegenschaften: [null, 'x', 7, { name: 'Haus', verkehrswert: 500000 }], wuensche: [null, { typ: 'gibtesnicht' }, { typ: 'jahr', betrag: 1000 }], einkommen: 'kaputt', amortisationen: [{ lg: 5, betrag: 1, jahr: 2030 }, { lg: 0, betrag: 50000, jahr: 2030 }], personen: 'kaputt', fix: [1], bericht: null, aktion: 'kaputt' });
    expect(s.liegenschaften).toHaveLength(1);
    expect(s.liegenschaften[0].typ).toBe('eigen');
    expect(s.wuensche).toHaveLength(1);
    expect(s.einkommen).toEqual([]);
    expect(s.amortisationen).toEqual([{ lg: 0, betrag: 50000, jahr: 2030, monat: 1, quelle: 'frei' }]);
    expect(s.personen).toHaveLength(2);
    expect(s.bericht).toEqual({ kunde: '', datum: '', berater: '' });
  });

  it('Zahlenfelder nehmen nur Zahlen im Wertebereich an', () => {
    const evil = '"><img src=x onerror=alert(1)>';
    const s = migrate({
      kanton: evil, haushalt: evil, inflation: evil, tragGrenze: evil, steuerEink: '<b>', reserveJahre: {}, horizontModus: evil, anlageprofil: evil, reduktion75: evil,
      personen: [{ jahrgang: 19725, pensAlter: evil, brutto: evil, geschlecht: evil, ahvBezug: 99, geburtsmonat: 13, s3aAnlage: evil, ahvModus: evil, pkFrist: evil, minAlter: -5 }, { jahrgang: 'abc' }],
      liegenschaften: [{ typ: evil, verkehrswert: evil, zins: 1e9, hypothek: -5 }],
      wuensche: [{ typ: 'ausland', monate: evil, bis: evil, von: 500, nebenkosten: evil, wohnform: evil, tkey: evil }],
      einkommen: [{ art: evil, person: evil, betrag: evil, bisJahr: evil }],
      amortisationen: [{ lg: 0, betrag: evil, jahr: 2030, monat: evil, quelle: evil }],
      fix: { wohnen: evil, kk: 400, fremd: 1 },
    });
    expect(s.kanton).toBe('ZH');
    expect(s.haushalt).toBe('verheiratet');
    expect(s.inflation).toBe(1);
    expect(s.tragGrenze).toBe(35);
    expect(s.steuerEink).toBe(12);
    expect(s.reserveJahre).toBe(2);
    expect(s.horizontModus).toBe('le5');
    expect(s.anlageprofil).toBe('ausgewogen');
    const p = s.personen[0];
    expect(p.jahrgang).toBe(jgMax());
    expect(p.pensAlter).toBe(65);
    expect(p.brutto).toBe(0);
    expect(p.geschlecht).toBe('m');
    expect(p.ahvBezug).toBe(5);
    expect(p.geburtsmonat).toBe(12);
    expect(p.s3aAnlage).toBe('konto');
    expect(p.pkFrist).toBe('');
    expect(p.minAlter).toBe(50);
    expect(s.personen[1].jahrgang).toBe(1970);
    expect(s.liegenschaften[0]).toMatchObject({ typ: 'eigen', verkehrswert: 0, zins: 20, hypothek: 0 });
    expect(s.wuensche[0]).toEqual({ typ: 'ausland', aktiv: true, name: '', wohnform: 'miete', von: 120 });
    expect(s.einkommen[0]).toEqual({ person: 0, art: 'sonstiges', betrag: 0, bisJahr: 0, text: '' });
    expect(s.amortisationen[0]).toEqual({ lg: 0, betrag: 0, jahr: 2030, monat: 1, quelle: 'frei' });
    expect(s.fix).toEqual({ kk: 400 });
    // Ausser Freitext enthält der Stand keine Zeichenkette mit «<»
    const ohneText = JSON.stringify({ ...s, bericht: null, liegenschaften: s.liegenschaften.map((l) => ({ ...l, name: '' })) });
    expect(ohneText).not.toContain('<');
  });

  it('Freitext bleibt Text, begrenzt und ohne Steuerzeichen; Unbekanntes fällt weg', () => {
    const s = migrate({ bericht: { kunde: 'x'.repeat(500), datum: 5, berater: 'A\u0000B\nC' }, liegenschaften: [{ name: { toString: 1 }, verkehrswert: 1 }], fremd: 'x', __proto__: { polluted: true }, constructor: 1 });
    expect(s.bericht.kunde).toHaveLength(80);
    expect(s.bericht.berater).toBe('A B C');
    expect(s.liegenschaften[0].name).toBe('');
    expect(s.fremd).toBeUndefined();
    expect({}.polluted).toBeUndefined();
  });

  it('jeder Kanton der Steuertabelle ist zulässig und umgekehrt', () => {
    expect([...KANTONE].sort()).toEqual(Object.keys(params.tables.kapSteuer.data.kantone).sort());
  });

  it('Gesprächsdatum: nur ein von Hand erfasstes bleibt', () => {
    expect(migrate({ bericht: { datum: '1.1.2026' } }).bericht.datum).toBe('');
    expect(migrate({ bericht: { datum: '1.1.2026' }, ui: { datumSet: true } }).bericht.datum).toBe('1.1.2026');
  });

  it('leerer Stand ist wirklich leer', () => {
    const e = emptyState();
    expect(e.personen.every((p) => p.brutto === 0 && p.fz === 0 && p.s3a === 0)).toBe(true);
    expect(e.liegenschaften).toEqual([]);
    expect(e.ui.edited).toBe(true);
  });
});

describe('Eingaben-Code (Link)', () => {
  it('Hin und zurück ohne Verlust', () => {
    const s = migrate(clone(EXAMPLE));
    s.bericht.kunde = 'Kovačević & Söhne';
    s.liegenschaften[0].name = 'Haus «Am Bach»';
    const back = decodeCode(encodeCode(s));
    expect(back.bericht.kunde).toBe('Kovačević & Söhne');
    expect(back.liegenschaften).toEqual(s.liegenschaften);
    expect(back.personen).toEqual(s.personen);
  });
  it('Schalter der Oberfläche reisen nicht mit und lassen sich nicht einschleusen', () => {
    const back = decodeCode(b64({ personen: [{}], ui: { edited: true, mode: 'form', tab: '<img>', open: { '<x>': true }, tutorStep: 'ergebnis' } }));
    expect(back.ui.edited).toBe(false);
    expect(back.ui.tab).toBeUndefined();
    expect(back.ui.open).toEqual({});
    expect(back.ui.tutorStep).toBe('start');
  });
  it('ein gespeicherter Stand oder Link mit dem früheren ui.tab lädt ohne Fehler; der Schlüssel entfällt', () => {
    const alt = clone(EXAMPLE);
    alt.ui = { ...alt.ui, tab: 'deckung', ansicht: 'jahre', mode: 'tutor' };
    const s = sanitize(alt);
    expect('tab' in s.ui).toBe(false);
    expect(s.ui.ansicht).toBe('jahre');
    expect('tab' in migrate(clone(EXAMPLE)).ui).toBe(false);
    const back = decodeCode(b64({ ...clone(EXAMPLE), ui: { tab: 'kapital' } }));
    expect('tab' in back.ui).toBe(false);
    expect(back.personen.length).toBe(2);
  });
  it('weist Unbrauchbares ab', () => {
    expect(() => decodeCode('%%%')).toThrow();
    expect(() => decodeCode(b64({ foo: 1 }))).toThrow();
    expect(() => decodeCode(b64([1, 2]))).toThrow();
    expect(() => decodeCode(b64('text'))).toThrow();
    expect(() => decodeCode('A'.repeat(CODE_MAX + 1))).toThrow();
    expect(() => decodeCode(null)).toThrow();
  });
  it('ein unvollständiger Link bringt keine Musterwerte mit', () => {
    const back = decodeCode(b64({ personen: [{ jahrgang: 1968, brutto: 90000 }] }));
    expect(back.personen[0].brutto).toBe(90000);
    expect(back.personen[0].fz).toBe(0);
    expect(back.liegenschaften).toEqual([]);
    expect(back.wuensche).toEqual([]);
    expect(back.wertschriften).toBe(0);
  });
});

describe('Bühne: Schritte und Themen', () => {
  it('alter Stand ohne neue Felder bleibt gültig', () => {
    const alt = clone(EXAMPLE); delete alt.themen; delete alt.ui.schritt; delete alt.ui.besucht; delete alt.ui.ansicht;
    const s = migrate(alt);
    expect(s.themen).toEqual([]);
    expect(s.ui.schritt).toBe('situation');
    expect(s.ui.besucht).toEqual({});
    expect(s.ui.ansicht).toBe('bild');
  });
  it('Themen: nur bekannte Karten, Zustände und Werte', () => {
    const s = migrate({ ...clone(EXAMPLE), wuensche: [{ typ: 'jahr', karte: 'reisen', aktiv: false }], themen: [
      { karte: 'reisen', status: 'vergleich', w: 0, a: { betrag: 15000, von: 58, bis: 75, boese: '<img>' }, b: { betrag: -5, von: 58, bis: 999 } },
      { karte: '<img src=x>', status: 'vor' },
      { karte: 'abklaeren', status: 'vor', stelle: 'pk' },
      { karte: 'abklaeren', status: 'vor', stelle: '<b>' },
      { karte: 'verkauf', status: 'vor', lg: 7 },
      { karte: 'ahv', status: 'vor', person: 1, a: { ahvBezug: -2 } },
    ] });
    expect(s.themen.map((t) => t.karte)).toEqual(['reisen', 'abklaeren', 'ahv']);
    expect(s.themen[0].a).toEqual({ betrag: 15000, von: 58, bis: 75 });
    expect(Object.keys(s.themen[0].b).sort()).toEqual(['betrag', 'bis', 'von']);
    expect(s.themen[0].b.betrag).toBeGreaterThanOrEqual(0);
    expect(s.themen[0].b.bis).toBeLessThanOrEqual(120);
    expect(s.themen[2].a).toBeUndefined(); // Varianten nur im Zustand «vergleich»
    expect(JSON.stringify(s.themen)).not.toContain('<');
  });
  it('Themen ohne gültiges Ziel fallen weg', () => {
    const s = migrate({ ...clone(EXAMPLE), haushalt: 'single', themen: [{ karte: 'ahv', status: 'vor', person: 1 }, { karte: 'reisen', status: 'vergleich', w: 5, a: {}, b: {} }] });
    expect(s.themen).toEqual([]);
  });
  it('Wunsch behält eine bekannte Karte, verwirft eine unbekannte', () => {
    const s = migrate({ ...clone(EXAMPLE), wuensche: [{ typ: 'jahr', karte: 'pflege', betrag: 1 }, { typ: 'jahr', karte: 'x<y', betrag: 1 }] });
    expect(s.wuensche.map((w) => w.karte)).toEqual(['pflege', undefined]);
  });
  it('Themen: doppelte Feld- und Merkerkarten fallen weg; von zwei Vergleichen über Wünsche bleibt der erste', () => {
    const s = migrate({ ...clone(EXAMPLE), wuensche: [{ typ: 'jahr', karte: 'reisen' }, { typ: 'jahr', karte: 'reisen' }], themen: [
      { karte: 'ahv', status: 'vor', person: 0 }, { karte: 'ahv', status: 'vor', person: 1 }, { karte: 'ahv', status: 'ueber', person: 0 },
      { karte: 'erbschaft', status: 'vor' }, { karte: 'erbschaft', status: 'vor' },
      { karte: 'abklaeren', status: 'vor', stelle: 'pk' }, { karte: 'abklaeren', status: 'vor', stelle: 'ak' }, { karte: 'abklaeren', status: 'vor', stelle: 'pk' },
      { karte: 'reisen', status: 'vergleich', w: 0, a: { betrag: 1, von: 66, bis: 70 }, b: { betrag: 2, von: 66, bis: 70 } }, { karte: 'reisen', status: 'vergleich', w: 1, a: { betrag: 1, von: 66, bis: 70 }, b: { betrag: 2, von: 66, bis: 70 } },
    ] });
    expect(s.themen.map((t) => [t.karte, t.person ?? t.stelle ?? t.w ?? null, t.status])).toEqual([
      ['ahv', 0, 'vor'], ['ahv', 1, 'vor'], ['erbschaft', null, 'vor'], ['abklaeren', 'pk', 'vor'], ['abklaeren', 'ak', 'vor'],
      ['reisen', 0, 'vergleich']]);
  });
  it('ui.besucht nimmt nur bekannte Schritte', () => {
    const s = migrate({ ...clone(EXAMPLE), ui: { schritt: 'ansatz', besucht: { situation: 1, '<x>': 1 }, ansicht: 'jahre' } });
    expect(s.ui).toMatchObject({ schritt: 'ansatz', besucht: { situation: true }, ansicht: 'jahre' });
  });
  // Bedeutung der Themen (Begutachtung des ganzen Zweigs, M5)
  const mitReise = (themen) => migrate({ ...clone(EXAMPLE), wuensche: [clone(EXAMPLE.wuensche[0]), { typ: 'jahr', karte: 'reisen', aktiv: false, name: '' }], themen });
  const reiseA = { betrag: 10000, von: 66, bis: 75 }, reiseB = { betrag: 20000, von: 66, bis: 75 };
  it('Vergleich nur für Karten mit Varianten: Merkerkarten stehen nur im Zustand «vorgemerkt»', () => {
    const s = migrate({ ...clone(EXAMPLE), themen: [
      { karte: 'erbschaft', status: 'vergleich', a: { betrag: 1 }, b: { betrag: 2 } },
      { karte: 'abklaeren', status: 'ueber', stelle: 'pk' },
      { karte: 'abklaeren', status: 'vergleich', stelle: 'ak' },
    ] });
    expect(s.themen).toEqual([{ karte: 'erbschaft', status: 'vor' }, { karte: 'abklaeren', status: 'vor', stelle: 'pk' }, { karte: 'abklaeren', status: 'vor', stelle: 'ak' }]);
  });
  it('Vergleich nur mit vollständigen A und B: sonst Feldkarte vorgemerkt, Wunschkarte weg', () => {
    const feld = migrate({ ...clone(EXAMPLE), themen: [{ karte: 'aufhoeren', status: 'vergleich', person: 0, a: {}, b: {} }] });
    expect(feld.themen).toEqual([{ karte: 'aufhoeren', status: 'vor', person: 0 }]);
    const teil = migrate({ ...clone(EXAMPLE), themen: [{ karte: 'teil', status: 'vergleich', person: 0, a: { teilAb: 60, teilPensum: 50 }, b: { teilAb: 60, teilPensum: 'x' } }] });
    expect(teil.themen).toEqual([{ karte: 'teil', status: 'vor', person: 0 }]);
    expect(mitReise([{ karte: 'reisen', status: 'vergleich', w: 1, a: reiseA, b: { betrag: 20000 } }]).themen).toEqual([]);
    const ok = mitReise([{ karte: 'reisen', status: 'vergleich', w: 1, a: reiseA, b: reiseB }]);
    expect(ok.themen).toEqual([{ karte: 'reisen', status: 'vergleich', w: 1, a: reiseA, b: reiseB }]);
  });
  it('höchstens ein Vergleich: der erste bleibt, weitere fallen zurück bzw. weg', () => {
    const s = mitReise([
      { karte: 'ahv', status: 'vergleich', person: 0, a: { ahvBezug: -1 }, b: { ahvBezug: 1 } },
      { karte: 'aufhoeren', status: 'vergleich', person: 0, a: { pensAlter: 60 }, b: { pensAlter: 62 } },
      { karte: 'reisen', status: 'vergleich', w: 1, a: reiseA, b: reiseB },
    ]);
    expect(s.themen).toEqual([{ karte: 'ahv', status: 'vergleich', person: 0, a: { ahvBezug: -1 }, b: { ahvBezug: 1 } }, { karte: 'aufhoeren', status: 'vor', person: 0 }]);
  });
  it('ein Wunscheintrag zeigt auf einen Wunsch derselben Kartenart', () => {
    // w: 0 ist «Zeitweise im Ausland» (tkey ausland), nicht «Mehr reisen»
    expect(mitReise([{ karte: 'reisen', status: 'vergleich', w: 0, a: reiseA, b: reiseB }]).themen).toEqual([]);
    const aus = mitReise([{ karte: 'ausland', status: 'vergleich', w: 0, a: { monate: 2, von: 60, bis: 70 }, b: { monate: 6, von: 60, bis: 70 } }]);
    expect(aus.themen).toHaveLength(1);
    // ein Wunsch ohne Kartenart (weder Karte noch Tutor-Kennung) trägt keinen Eintrag
    const ohne = migrate({ ...clone(EXAMPLE), wuensche: [{ typ: 'jahr', aktiv: true, name: 'x', betrag: 1 }], themen: [{ karte: 'reisen', status: 'vergleich', w: 0, a: reiseA, b: reiseB }] });
    expect(ohne.themen).toEqual([]);
  });
  it('karteVonWunsch liegt in state.js und ist in themen.js dieselbe Funktion', async () => {
    const st = await import('../../../src/lib/pension/state'), th = await import('../../../src/lib/pension/themen');
    expect(typeof st.karteVonWunsch).toBe('function');
    expect(th.karteVonWunsch).toBe(st.karteVonWunsch);
  });
  it('Themen reisen im Link mit, der Schritt nicht', () => {
    const s = migrate({ ...clone(EXAMPLE), themen: [{ karte: 'erbschaft', status: 'vor' }], ui: { schritt: 'aktion' } });
    const r = decodeCode(encodeCode(s));
    expect(r.themen).toEqual([{ karte: 'erbschaft', status: 'vor' }]);
  });
});
