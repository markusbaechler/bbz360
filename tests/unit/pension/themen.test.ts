// @ts-nocheck — Referenztest, aus PensCheck (tests/themen.test.js, Stand 4830eff) übernommen; nur Pfade angepasst.
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import params from '../../../public/data/params.json';
import { createEngine } from '../../../src/lib/pension/engine';
import { resolveParams } from '../../../src/lib/pension/params';
import { analyse } from '../../../src/lib/pension/analyse';
import { EXAMPLE, KARTE_IDS, SCHRITT_IDS, VAR_FELDER, clone, migrate, sanitize, decodeCode, encodeCode } from '../../../src/lib/pension/state';
import { BOESE, b64, boot, keinSchadcode, q, tick, type } from './hilfen';
import { auswerten } from '../../../src/lib/pension/auswertung';
import { bildDaten, bildSvg, bildText, bildVergleich, linienLabels, markenLayout } from '../../../src/pension-ui/bild';
import { FELDER } from '../../../src/pension-ui/vergleich';
import { chf } from '../../../src/lib/pension/format';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GRENZEN, DATENSCHUTZ } from '../../../src/lib/pension/config';
import {
  KARTEN, GRUPPEN, STELLE_TXT, karteVonWunsch, karten, themaHinzu, themaEntfernen, zielWeg, liegenschaftEntfernt, liegenschaftEingefuegt,
  varianteAnwenden, uebernehmen, verwerfen, vergleichStarten, vergleichAktiv, variantenZustaende, vergleichSig,
} from '../../../src/lib/pension/themen';

const A0 = 2026 * 12 + 10;
const E = createEngine(resolveParams(params, 2026), A0);
const neu = () => migrate(clone(EXAMPLE));
/** Zustand ist nach dem Prüfen unverändert: Themen und Wünsche. */
const stabil = (S, msg) => {
  const r = sanitize(clone(S));
  expect(r.themen, msg).toEqual(S.themen);
  expect(r.wuensche, msg).toEqual(S.wuensche);
};

describe('Themenkarten: Katalog', () => {
  it('jede Karte aus KARTE_IDS ist beschrieben, Titel wie in der Spec', () => {
    expect(Object.keys(KARTEN).sort()).toEqual([...KARTE_IDS].sort());
    expect(KARTEN.reisen.titel).toBe('Mehr reisen');
    expect(KARTEN.erbschaft).toMatchObject({ art: 'merker', titel: 'Erbschaft erwartet', braucht: 'nur vormerken, rechnet nicht mit' });
    expect(KARTEN.verkauf.hinweis).toContain('Wohnkosten');
    expect(KARTEN.reisen).toMatchObject({ art: 'wunsch', typ: 'jahr', gruppe: 'leben' });
    expect(KARTEN.ausland.typ).toBe('ausland');
    expect(KARTEN.hinterlassen.typ).toBe('ziel');
    expect(KARTEN.schenkung).toMatchObject({ typ: 'einmal', gruppe: 'familie' });
    expect(KARTEN.aufhoeren.art).toBe('feld');
    expect(GRUPPEN.map((g) => g[0])).toEqual(['leben', 'arbeit', 'vorsorge', 'wohnen', 'familie']);
    expect(STELLE_TXT).toEqual({ pk: 'Pensionskasse', ak: 'Ausgleichskasse', bank: 'Bank', steueramt: 'Steueramt' });
    const text = JSON.stringify(KARTEN) + JSON.stringify(GRUPPEN);
    expect(text).not.toMatch(/empfohlen|Vorschlag|beste/i);
  });
  it('karteVonWunsch: Karte, Tutor-Kennung, sonst null', () => {
    expect(karteVonWunsch({ karte: 'pflege', tkey: 'reisen' })).toBe('pflege');
    expect(karteVonWunsch({ tkey: 'reisen' })).toBe('reisen');
    expect(karteVonWunsch({ tkey: 'auto' })).toBe('anschaffung');
    expect(karteVonWunsch({ tkey: 'ausland' })).toBe('ausland');
    expect(karteVonWunsch({ tkey: 'erbe' })).toBe('hinterlassen');
    expect(karteVonWunsch({ typ: 'jahr' })).toBeNull();
  });
});

describe('Themenkarten: vormerken, entfernen', () => {
  it('vormerken rechnet nicht mit', () => {
    const S = neu(), vor = analyse(S, E, A0 + 1).maxA;
    themaHinzu(S, 'reisen'); themaHinzu(S, 'verkauf', { lg: 0 }); themaHinzu(S, 'erbschaft'); themaHinzu(S, 'abklaeren', { stelle: 'pk' });
    expect(analyse(migrate(S), E, A0 + 1).maxA).toBe(vor);
    expect(karten(S).map((k) => [k.karte, k.status])).toEqual([['ausland', 'gerechnet'], ['reisen', 'vor'], ['verkauf', 'vor'], ['erbschaft', 'vor'], ['abklaeren', 'vor']]);
    stabil(S, 'nach vormerken');
  });
  it('Wunschkarte legt einen Wunsch an; Titel aus Name, Karte oder Typ', () => {
    const S = neu();
    const k = themaHinzu(S, 'ausland');
    expect(S.wuensche.at(-1)).toEqual({ typ: 'ausland', karte: 'ausland', aktiv: false, name: '', wohnform: 'miete' });
    expect(k).toBe('w1');
    S.wuensche.push({ typ: 'jahr', aktiv: true, name: '' });
    const ks = karten(S);
    expect(ks[0]).toMatchObject({ key: 'w0', titel: 'Griechenland', status: 'gerechnet' });
    expect(ks[1]).toMatchObject({ key: 'w1', titel: 'Zeitweise im Ausland', status: 'vor' });
    expect(ks[2]).toMatchObject({ key: 'w2', titel: 'Wiederkehrend', karte: null });
    stabil(S, 'Wunschkarte');
  });
  it('Feldkarte nur einmal je Ziel, Wunschkarte mehrfach', () => {
    const S = neu();
    const a = themaHinzu(S, 'ahv', { person: 0 });
    expect(themaHinzu(S, 'ahv', { person: 0 })).toBe(a);
    expect(themaHinzu(S, 'ahv', { person: 1 })).not.toBe(a);
    const e = themaHinzu(S, 'erbschaft');
    expect(themaHinzu(S, 'erbschaft')).toBe(e);
    const p = themaHinzu(S, 'abklaeren', { stelle: 'pk' });
    expect(themaHinzu(S, 'abklaeren', { stelle: 'pk' })).toBe(p);
    expect(themaHinzu(S, 'abklaeren', { stelle: 'ak' })).not.toBe(p);
    expect(themaHinzu(S, 'verkauf', { lg: 0 })).toBe(themaHinzu(S, 'verkauf', { lg: 0 }));
    expect(S.themen.length).toBe(6);
    expect(themaHinzu(S, 'reisen')).not.toBe(themaHinzu(S, 'reisen'));
    stabil(S, 'Duplikate');
  });
  it('Felder, die nicht zur Karte gehören, fallen weg; zweites Hinzufügen liefert den bestehenden Eintrag', () => {
    const S = neu();
    const k = themaHinzu(S, 'erbschaft', { person: 0, lg: 0, stelle: 'pk' });
    expect(S.themen).toEqual([{ karte: 'erbschaft', status: 'vor' }]);
    expect(themaHinzu(S, 'erbschaft')).toBe(k);
    expect(themaHinzu(S, 'ahv', { person: 0, lg: 0 })).toBe('t1');
    expect(S.themen[1]).toEqual({ karte: 'ahv', status: 'vor', person: 0 });
    expect(themaHinzu(S, 'ahv', { person: 0 })).toBe('t1');
    expect(S.themen.length).toBe(2);
    stabil(S, 'fremde Felder');
  });
  it('ungültiges Ziel ergibt null und ändert nichts', () => {
    const S = neu(); S.haushalt = 'single';
    expect(themaHinzu(S, 'ahv', { person: 1 })).toBeNull();
    expect(themaHinzu(S, 'ahv')).toBeNull();
    expect(themaHinzu(S, 'verkauf', { lg: 5 })).toBeNull();
    expect(themaHinzu(S, 'abklaeren', { stelle: 'x' })).toBeNull();
    expect(themaHinzu(S, 'gibtsnicht')).toBeNull();
    expect(S.themen).toEqual([]);
  });
  it('Grenzen: 20 Wünsche, 30 Themen', () => {
    const S = neu();
    while (S.wuensche.length < 20) expect(themaHinzu(S, 'reisen')).not.toBeNull();
    expect(themaHinzu(S, 'reisen')).toBeNull();
    expect(S.wuensche.length).toBe(20);
    const T = neu();
    T.themen = Array.from({ length: 30 }, () => ({ karte: 'erbschaft', status: 'vor' }));
    expect(themaHinzu(T, 'abklaeren', { stelle: 'bank' })).toBeNull();
    expect(T.themen.length).toBe(30);
  });
  it('Ziel verschwindet: Wunsch gelöscht, Liegenschaft entfernt, Haushalt gewechselt', () => {
    const S = neu();
    const k1 = themaHinzu(S, 'reisen'), k2 = themaHinzu(S, 'pflege');
    vergleichStarten(S, k2, { betrag: 1, von: 85, bis: 90 }, { betrag: 2, von: 85, bis: 90 });
    themaEntfernen(S, k1);
    expect(S.themen.at(-1).w).toBe(1); // zeigt weiter auf «Pflege»
    expect(S.wuensche.map((w) => w.karte)).toEqual([undefined, 'pflege']);
    stabil(S, 'Wunsch gelöscht');
    themaHinzu(S, 'verkauf', { lg: 0 }); themaHinzu(S, 'ahv', { person: 1 });
    S.liegenschaften = []; liegenschaftEntfernt(S, 0);
    S.haushalt = 'single'; zielWeg(S);
    expect(S.themen.map((t) => t.karte)).toEqual(['pflege']);
    stabil(S, 'Ziele weg');
  });
  it('Wunsch mit Vergleich löschen entfernt auch den Themeneintrag', () => {
    const S = neu();
    const k = themaHinzu(S, 'reisen');
    vergleichStarten(S, k, { betrag: 1, von: 66, bis: 70 }, { betrag: 2, von: 66, bis: 70 });
    themaEntfernen(S, k);
    expect(S.themen).toEqual([]);
    expect(S.wuensche.length).toBe(1);
  });
  it('Liegenschaft entfernen: höhere Indizes sinken, Feldwerte bleiben', () => {
    const S = neu();
    S.liegenschaften.push(clone(S.liegenschaften[0]), clone(S.liegenschaften[0]));
    themaHinzu(S, 'verkauf', { lg: 0 }); themaHinzu(S, 'amort', { lg: 1 }); themaHinzu(S, 'verkauf', { lg: 2 });
    S.liegenschaften[2].verkaufAlter = 70;
    S.liegenschaften.splice(1, 1); liegenschaftEntfernt(S, 1);
    expect(S.themen.map((t) => [t.karte, t.lg])).toEqual([['verkauf', 0], ['verkauf', 1]]);
    expect(S.liegenschaften[1].verkaufAlter).toBe(70);
    stabil(S, 'Liegenschaft entfernt');
  });
  it('Liegenschaft eingefügt: Karten ab dieser Stelle rücken eine Nummer weiter', () => {
    const S = neu();
    S.liegenschaften.push(clone(S.liegenschaften[0]));
    themaHinzu(S, 'verkauf', { lg: 0 }); themaHinzu(S, 'amort', { lg: 1 }); themaHinzu(S, 'ahv', { person: 0 });
    S.liegenschaften.splice(1, 0, clone(S.liegenschaften[0])); liegenschaftEingefuegt(S, 1);
    expect(S.themen.map((t) => [t.karte, t.lg])).toEqual([['verkauf', 0], ['amort', 2], ['ahv', undefined]]);
    S.liegenschaften.unshift(clone(S.liegenschaften[0])); liegenschaftEingefuegt(S, 0);
    expect(S.themen.map((t) => t.lg)).toEqual([1, 3, undefined]);
    stabil(S, 'Liegenschaft eingefügt');
  });
  it('Tutor «Im Eigenheim»: die neue Liegenschaft steht vorne, Karten der übrigen zeigen weiter auf dieselbe', async () => {
    const S = neu();
    S.liegenschaften = [{ ...clone(S.liegenschaften[0]), typ: 'rendite', name: 'Mietobjekt' }];
    S.amortisationen = [];
    themaHinzu(S, 'verkauf', { lg: 0 });
    Object.assign(S.ui, { mode: 'tutor', tutorStep: 'wohnen', tutorMax: 99, edited: true });
    const { app } = boot(S);
    q('#tutor [data-tact="wohnen-eigen"]').click();
    await tick();
    expect(app.S.liegenschaften.map((l) => l.typ)).toEqual(['eigen', 'rendite']);
    expect(app.S.themen).toEqual([{ karte: 'verkauf', status: 'vor', lg: 1 }]);
    expect(readFileSync(resolve(process.cwd(), 'src/pension-ui/tutor.ts'), 'utf8')).not.toMatch(/t\.lg \+= 1/);
  });
});

describe('Themenkarten: So oder so', () => {
  it('Vergleich lässt den Plan unberührt; übernehmen ergibt genau die Vorschau', () => {
    const S = neu();
    const key = themaHinzu(S, 'reisen');
    vergleichStarten(S, key, { betrag: 15000, von: 58, bis: 75 }, { betrag: 25000, von: 58, bis: 75 });
    stabil(S, 'Vergleich');
    const plan = analyse(migrate(clone(S)), E, A0 + 1).maxA;
    expect(plan).toBe(analyse(migrate(clone(EXAMPLE)), E, A0 + 1).maxA);
    const [SA, SB] = variantenZustaende(S);
    const a = analyse(SA, E, A0 + 1), b = analyse(SB, E, A0 + 1);
    expect(b.maxA).toBeLessThan(a.maxA);
    uebernehmen(S, key, 'a');
    const nach = analyse(migrate(S), E, A0 + 1);
    expect(nach.maxA).toBe(a.maxA);
    expect(nach.amp.st).toBe(a.amp.st);
    expect(vergleichAktiv(S)).toBeNull();
    expect(S.themen).toEqual([]);
    expect(S.wuensche.at(-1)).toMatchObject({ aktiv: true, betrag: 15000, von: 58, bis: 75 });
    stabil(S, 'übernommen');
  });
  it('varianteAnwenden verändert S nicht und liefert einen gültigen Stand', () => {
    const S = neu(), key = themaHinzu(S, 'aufhoeren', { person: 0 });
    const vorher = clone(S);
    const R = varianteAnwenden(S, key, { pensAlter: 999 });
    expect(S).toEqual(vorher);
    expect(R.personen[0].pensAlter).toBe(70); // wie num(): auf den Wertebereich begrenzt
    expect(R.ui).toEqual(S.ui);
    expect(sanitize(clone(R))).toEqual(R);
    expect(R).not.toBe(S);
  });
  it('verwerfen schreibt nichts in den Plan', () => {
    const S = neu(), vorher = JSON.stringify(migrate(clone(S)).personen);
    const key = themaHinzu(S, 'ahv', { person: 0 });
    vergleichStarten(S, key, { ahvBezug: -2 }, { ahvBezug: 2 });
    expect(S.themen.at(-1)).toMatchObject({ status: 'vergleich', a: { ahvBezug: -2 }, b: { ahvBezug: 2 } });
    verwerfen(S, key);
    expect(JSON.stringify(migrate(S).personen)).toBe(vorher);
    expect(S.themen.at(-1)).toEqual({ karte: 'ahv', status: 'vor', person: 0 });
    stabil(S, 'verworfen');
  });
  it('verwerfen bei einer Wunschkarte: Eintrag weg, Wunsch vorgemerkt', () => {
    const S = neu(), key = themaHinzu(S, 'anschaffung');
    vergleichStarten(S, key, { betrag: 1, alter: 60 }, { betrag: 2, alter: 62 });
    verwerfen(S, key);
    expect(S.themen).toEqual([]);
    expect(S.wuensche.at(-1).aktiv).toBe(false);
    expect(S.wuensche.at(-1).betrag).toBeUndefined();
    stabil(S, 'Wunsch verworfen');
  });
  it('verwerfen lässt einen Wunsch, wie er war (aktiv bleibt aktiv, vorgemerkt bleibt vorgemerkt)', () => {
    const S = neu(), plan = analyse(migrate(clone(S)), E, A0 + 1).maxA;
    vergleichStarten(S, 'w0', { monate: 1, von: 58, bis: 80 }, { monate: 9, von: 58, bis: 80 });
    verwerfen(S, 'w0');
    expect(S.wuensche[0].aktiv).toBe(true);
    expect(S.wuensche[0].monate).toBe(4);
    expect(S.themen).toEqual([]);
    expect(analyse(migrate(S), E, A0 + 1).maxA).toBe(plan);
    // ein zweiter Vergleich verwirft den laufenden, ohne dessen Wunsch zu verändern
    const w = themaHinzu(S, 'reisen'), a = themaHinzu(S, 'ahv', { person: 0 });
    vergleichStarten(S, 'w0', { monate: 1, von: 58, bis: 80 }, { monate: 9, von: 58, bis: 80 });
    vergleichStarten(S, a, { ahvBezug: -1 }, { ahvBezug: 1 });
    expect(S.wuensche[0].aktiv).toBe(true);
    expect(analyse(migrate(S), E, A0 + 1).maxA).toBe(plan);
    vergleichStarten(S, w, { betrag: 1, von: 66, bis: 70 }, { betrag: 2, von: 66, bis: 70 });
    verwerfen(S, w);
    expect(S.wuensche[1].aktiv).toBe(false);
    stabil(S, 'Wunsch verworfen 2');
  });
  it('Feldkarten: jede schreibt beim Übernehmen in ihr Feld', () => {
    const faelle = [['aufhoeren', { person: 0 }, { pensAlter: 60 }, (s) => s.personen[0].pensAlter, 60],
      ['teil', { person: 0 }, { teilAb: 56, teilPensum: 60 }, (s) => s.personen[0].teilAb, 56],
      ['rentekapital', { person: 0 }, { pkRente: 20000, pkKapital: 400000 }, (s) => s.personen[0].pkKapital, 400000],
      ['ahv', { person: 1 }, { ahvBezug: 2 }, (s) => s.personen[1].ahvBezug, 2],
      ['verkauf', { lg: 0 }, { verkaufAlter: 70 }, (s) => s.liegenschaften[0].verkaufAlter, 70],
      ['weiter', { person: 0 }, { betrag: 30000, bisJahr: 2035 }, (s) => s.einkommen.at(-1).betrag, 30000],
      ['amort', { lg: 0 }, { betrag: 100000, jahr: 2030, monat: 7 }, (s) => s.amortisationen.at(-1).betrag, 100000]];
    for (const [karte, ziel, werte, lies, erw] of faelle) {
      const S = neu(), key = themaHinzu(S, karte, ziel);
      vergleichStarten(S, key, werte, werte); uebernehmen(S, key, 'a');
      expect(lies(S), karte).toBe(erw);
      expect(S.themen.at(-1), karte).toEqual({ karte, status: 'ueber', ...ziel });
      stabil(S, karte);
    }
  });
  it('weiter und amort hängen die Zeile in der vorgesehenen Form an', () => {
    const S = neu();
    const k1 = themaHinzu(S, 'weiter', { person: 1 }), k2 = themaHinzu(S, 'amort', { lg: 0 });
    vergleichStarten(S, k1, { betrag: 30000, bisJahr: 2035 }, { betrag: 10000, bisJahr: 2030 });
    vergleichStarten(S, k2, { betrag: 5000, jahr: 2030, monat: 7 }, { betrag: 8000, jahr: 2031, monat: 1 });
    const [, SB] = variantenZustaende(S);
    expect(SB.amortisationen.at(-1)).toEqual({ lg: 0, betrag: 8000, jahr: 2031, monat: 1, quelle: 'frei', tkey: 'karte' });
    uebernehmen(S, k2, 'b');
    vergleichStarten(S, k1, { betrag: 30000, bisJahr: 2035 }, { betrag: 10000, bisJahr: 2030 });
    uebernehmen(S, k1, 'a');
    expect(S.einkommen.at(-1)).toEqual({ person: 1, art: 'nebenerwerb', betrag: 30000, bisJahr: 2035, text: 'nach der Pensionierung', tkey: 'weiter', abPens: true });
  });
  it('nur ein Vergleich gleichzeitig', () => {
    const S = neu();
    const a = themaHinzu(S, 'ahv', { person: 0 }), b = themaHinzu(S, 'aufhoeren', { person: 0 });
    vergleichStarten(S, a, { ahvBezug: -1 }, { ahvBezug: 1 }); vergleichStarten(S, b, { pensAlter: 57 }, { pensAlter: 60 });
    expect(S.themen.filter((t) => t.status === 'vergleich').length).toBe(1);
    expect(vergleichAktiv(S)).toMatchObject({ key: 't1', thema: { karte: 'aufhoeren' } });
    expect(S.themen[0]).toEqual({ karte: 'ahv', status: 'vor', person: 0 });
    stabil(S, 'ein Vergleich');
  });
  it('zweiter Vergleich über einen Wunsch: Eintrag des ersten weg, Schlüssel stimmt', () => {
    const S = neu();
    const w = themaHinzu(S, 'reisen'), a = themaHinzu(S, 'ahv', { person: 0 });
    vergleichStarten(S, w, { betrag: 1, von: 66, bis: 70 }, { betrag: 2, von: 66, bis: 70 });
    const neuKey = vergleichStarten(S, a, { ahvBezug: -1 }, { ahvBezug: 1 });
    expect(S.themen.length).toBe(1);
    expect(vergleichAktiv(S).key).toBe(neuKey);
    expect(S.wuensche.at(-1).aktiv).toBe(false);
    expect(variantenZustaende(neu())).toEqual([]);
    stabil(S, 'Wechsel');
  });
  it('Werte ausserhalb der Grenzen werden wie sonst begrenzt', () => {
    const S = neu(), key = themaHinzu(S, 'ahv', { person: 0 });
    vergleichStarten(S, key, { ahvBezug: -9 }, { ahvBezug: 99, fremd: 1 });
    expect(S.themen.at(-1).a).toEqual({ ahvBezug: -3 });
    expect(S.themen.at(-1).b).toEqual({ ahvBezug: 5 });
    stabil(S, 'begrenzt');
  });
  it('vergleichStarten behält die Objekte der Einträge (ein offener Editor bleibt offen)', () => {
    const S = neu();
    const a = themaHinzu(S, 'ahv', { person: 0 }), b = themaHinzu(S, 'aufhoeren', { person: 0 });
    themaHinzu(S, 'erbschaft');
    const vorher = [...S.themen];
    vergleichStarten(S, a, { ahvBezug: -1 }, { ahvBezug: 1 });
    expect(S.themen.every((t, i) => t === vorher[i])).toBe(true);
    // ein zweiter Vergleich verwirft den ersten im selben Objekt
    expect(vergleichStarten(S, b, { pensAlter: 57 }, { pensAlter: 60 })).toBe(b);
    expect(S.themen.every((t, i) => t === vorher[i])).toBe(true);
    expect(S.themen[0]).toEqual({ karte: 'ahv', status: 'vor', person: 0 });
    expect(S.themen[1]).toMatchObject({ status: 'vergleich', a: { pensAlter: 57 }, b: { pensAlter: 60 } });
    stabil(S, 'Objekte');
  });
  it('vergleichStarten scheitert ohne Nebenwirkung: laufender Vergleich und Einträge bleiben, wie sie waren', () => {
    // Grenze: ein Wunsch braucht einen neuen Eintrag, es sind schon 30
    const S = neu();
    S.themen = [{ karte: 'ahv', status: 'vergleich', person: 0, a: { ahvBezug: -1 }, b: { ahvBezug: 1 } }, ...Array.from({ length: 29 }, () => ({ karte: 'erbschaft', status: 'vor' }))];
    const vorher = clone(S.themen);
    expect(vergleichStarten(S, 'w0', { monate: 1, von: 58, bis: 80 }, { monate: 9, von: 58, bis: 80 })).toBeNull();
    expect(S.themen).toEqual(vorher);
    // ein Eintrag, den die Prüfung verwirft: der gewählte Eintrag wird nicht verändert
    const T = neu();
    T.themen = [{ karte: 'ahv', status: 'vor', person: 0 }, { karte: 'ahv', status: 'vor', person: 7 }];
    expect(vergleichStarten(T, 't0', { ahvBezug: -1 }, { ahvBezug: 1 })).toBeNull();
    expect(T.themen[0]).toEqual({ karte: 'ahv', status: 'vor', person: 0 });
  });
  it('verwerfen wirkt nur auf einen laufenden Vergleich', () => {
    const S = neu();
    S.themen = [{ karte: 'teil', status: 'ueber', person: 0 }, { karte: 'erbschaft', status: 'vor' }];
    verwerfen(S, 't0');
    verwerfen(S, 't1');
    expect(S.themen).toEqual([{ karte: 'teil', status: 'ueber', person: 0 }, { karte: 'erbschaft', status: 'vor' }]);
  });
  it('vergleichSig: Kennung des laufenden Vergleichs, leer ohne', () => {
    const S = neu(), key = themaHinzu(S, 'ahv', { person: 0 });
    expect(vergleichSig(S)).toBe('');
    vergleichStarten(S, key, { ahvBezug: -1 }, { ahvBezug: 1 });
    const s1 = vergleichSig(S);
    expect(s1).not.toBe('');
    vergleichStarten(S, key, { ahvBezug: -1 }, { ahvBezug: 2 });
    expect(vergleichSig(S)).not.toBe(s1);
  });
});

describe('So oder so', () => {
  const start = () => { const S = migrate(clone(EXAMPLE)); S.ui.mode = 'form'; const b = boot(S); const key = themaHinzu(b.app.S, 'reisen'); b.app.changed(); return { ...b, key }; };
  it('Vergleich zeigt A und B mit denselben Zahlen wie eine normale Rechnung', () => {
    const { app, key } = start();
    vergleichStarten(app.S, key, { betrag: 15000, von: 58, bis: 75 }, { betrag: 25000, von: 58, bis: 75 }); app.changed(); app.schritt.go('vergleich');
    const [SA, SB] = variantenZustaende(app.S);
    expect(app.R.varianten[0].maxA).toBe(analyse(SA, app.E, A0 + 1).maxA);
    expect(app.R.varianten[1].maxA).toBe(analyse(SB, app.E, A0 + 1).maxA);
    expect(q('#vergleich h3').textContent).toContain('Mehr reisen: so … oder so?');
    expect(document.querySelectorAll('#vergleich [role="radio"]').length).toBe(2);
    expect(q('#vergleich [role="radio"][aria-checked="true"]').textContent).toContain('A');
  });
  it('Plan bleibt bis zum Übernehmen unverändert; danach gilt die Vorschau', () => {
    const { app, key } = start();
    const plan = app.R.maxA;
    vergleichStarten(app.S, key, { betrag: 15000, von: 58, bis: 75 }, { betrag: 25000, von: 58, bis: 75 }); app.changed(); app.schritt.go('vergleich');
    expect(app.R.maxA).toBe(plan);
    const vorschau = app.R.varianten[1].maxA;
    q('#vergleich [data-uebernehmen="b"]').click();
    expect(app.R.maxA).toBe(vorschau);
    expect(app.S.wuensche.at(-1)).toMatchObject({ betrag: 25000, aktiv: true });
    expect(app.toasts.at(-1)).toContain('B ist jetzt Teil Ihres Plans.');
  });
  it('Verwerfen ändert den Plan nicht', () => {
    const { app, key } = start();
    const plan = app.R.maxA;
    vergleichStarten(app.S, key, { betrag: 15000, von: 58, bis: 75 }, { betrag: 25000, von: 58, bis: 75 }); app.changed(); app.schritt.go('vergleich');
    q('#vergleich [data-verwerfen]').click();
    expect(app.R.maxA).toBe(plan);
    expect(app.S.themen).toEqual([]);
  });
  it('Feld im Schritt geändert, während verglichen wird: Plan folgt dem Feld, A und B bleiben', () => {
    const S = migrate(clone(EXAMPLE)); S.ui.mode = 'form';
    const { app } = boot(S);
    const key = themaHinzu(app.S, 'ahv', { person: 0 });
    vergleichStarten(app.S, key, { ahvBezug: -2 }, { ahvBezug: 2 }); app.changed();
    app.S.personen[0].ahvBezug = 1; app.changed();
    expect(app.S.themen.at(-1)).toMatchObject({ status: 'vergleich', a: { ahvBezug: -2 }, b: { ahvBezug: 2 } });
    expect(migrate(clone(app.S)).personen[0].ahvBezug).toBe(1);
    expect(variantenZustaende(app.S)[0].personen[0].ahvBezug).toBe(-2);
  });
  it('Umschalter mit Pfeiltaste', () => {
    const { app, key } = start();
    vergleichStarten(app.S, key, { betrag: 1, von: 58, bis: 75 }, { betrag: 2, von: 58, bis: 75 }); app.changed(); app.schritt.go('vergleich');
    const a = q('#vergleich [role="radio"]'); a.focus();
    a.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(q('#vergleich [role="radio"][aria-checked="true"]').textContent).toContain('B');
  });
  it('Wortwahl: nirgends «empfohlen», «Vorschlag», «besser»', () => {
    const { app, key } = start();
    vergleichStarten(app.S, key, { betrag: 1, von: 58, bis: 75 }, { betrag: 2, von: 58, bis: 75 }); app.changed(); app.schritt.go('vergleich');
    expect(q('#vergleich').textContent).not.toMatch(/empfohlen|Vorschlag|besser|beste/i);
  });
  it('laufender Vergleich reist im Link mit', () => {
    const { app, key } = start();
    vergleichStarten(app.S, key, { betrag: 1, von: 58, bis: 75 }, { betrag: 2, von: 58, bis: 75 });
    expect(decodeCode(encodeCode(app.S)).themen[0]).toMatchObject({ status: 'vergleich', a: { betrag: 1 }, b: { betrag: 2 } });
  });
});

describe('So oder so: Oberfläche', () => {
  const start = (o = {}) => { const S = migrate({ ...clone(EXAMPLE), ...o }); S.ui.mode = 'form'; return boot(S); };
  const laufend = (app, key, a, b) => { vergleichStarten(app.S, key, a, b); app.changed(); app.schritt.go('vergleich'); };
  const reisen = { betrag: 15000, von: 58, bis: 75 }, reisenB = { betrag: 25000, von: 58, bis: 75 };
  it('ohne Vergleich: Überschrift, Satz, Karten als Knöpfe (ohne Merker), darunter «früher aufhören»', () => {
    const { app } = start({ themen: [{ karte: 'erbschaft', status: 'vor' }, { karte: 'ahv', status: 'vor', person: 0 }] });
    app.schritt.go('vergleich');
    expect(q('#vergleich h2').textContent).toBe('So oder so.');
    expect(document.activeElement).toBe(q('#vergleich h2'));
    expect(q('#vergleich').textContent).toContain('Wählen Sie ein Thema und vergleichen Sie zwei Werte. Ihr Plan bleibt unverändert, bis Sie einen Wert übernehmen.');
    const k = [...document.querySelectorAll('#vergleich [data-vgl-karte]')].map((b) => b.dataset.vglKarte);
    expect(k).toEqual(['w0', 't1']);
    expect(q('#sofortBox > summary').textContent).toBe('Was wäre, wenn Sie früher aufhören?');
    expect(q('#sofortBox #sofort .wi-ctrlbox')).not.toBeNull();
    expect(q('[data-block="vergleich"]').firstElementChild.id).toBe('vergleich');
    expect(q('#results').hasAttribute('data-vgl')).toBe(false);
  });
  it('ohne geeignete Karte: neutraler Satz und «+ Thema» öffnet die Auswahl', () => {
    const { app } = start({ wuensche: [] });
    app.schritt.go('vergleich');
    expect(q('#vergleich [data-vgl-karte]')).toBeNull();
    expect(q('#vergleich').textContent).toContain('Noch kein Thema zum Vergleichen.');
    q('#vergleich [data-vgl-plus]').click();
    expect(q('#themenDlg').open).toBe(true);
    q('#btnThemaFertig').click();
  });
  it('Start aus der Liste: Formular A und B, «Vergleichen» erst mit allen Werten; dann läuft der Vergleich', () => {
    const { app } = start();
    app.schritt.go('vergleich');
    q('#vergleich [data-vgl-karte="w0"]').click();
    const f = (s, k) => q(`#vergleich [data-vg="${s}"][data-k="${k}"]`);
    expect(f('a', 'monate').value).toBe('4');
    expect(f('b', 'monate').value).toBe('');
    expect(document.activeElement).toBe(f('a', 'monate'));
    const los = q('#vergleich [data-vgl-los]');
    expect(los.disabled).toBe(true);
    expect(q('#vergleich').textContent).toContain('Bitte einen Wert eingeben.');
    type(f('b', 'monate'), '9'); type(f('b', 'von'), '58');
    expect(los.disabled).toBe(true);
    type(f('b', 'bis'), 'abc');
    expect(f('b', 'bis').getAttribute('aria-invalid')).toBe('true');
    expect(los.disabled).toBe(true);
    type(f('b', 'bis'), '80');
    expect(los.disabled).toBe(false);
    los.click();
    expect(app.S.themen).toEqual([{ karte: 'ausland', status: 'vergleich', w: 0, a: { monate: 4, von: 58, bis: 80 }, b: { monate: 9, von: 58, bis: 80 } }]);
    expect(q('#vergleich h3').textContent).toBe('Griechenland: so … oder so?');
    expect(q('#results').hasAttribute('data-vgl')).toBe(true);
    expect(app.S.wuensche[0].monate).toBe(4);
  });
  it('Start aus dem Editor: Knopf «So oder so vergleichen» führt zu Schritt 6', () => {
    const { app } = start({ themen: [{ karte: 'aufhoeren', status: 'vor', person: 1 }] });
    q('#themenleiste [data-thema="t0"]').click();
    const b = q('#themaEdit [data-vergleich-hook] [data-vergleich-start]');
    expect(b.textContent).toBe('So oder so vergleichen');
    b.click();
    expect(app.S.ui.schritt).toBe('vergleich');
    const a = q('#vergleich [data-vg="a"][data-k="pensAlter"]');
    expect(a.value).toBe('60');
    expect(q('#vergleich').textContent).toContain('Person 2');
    expect(document.activeElement).toBe(a);
    // ganze Jahre 55 bis 70
    type(q('#vergleich [data-vg="b"][data-k="pensAlter"]'), '71');
    expect(q('#vergleich').textContent).toContain('Erlaubt sind Werte von 55 bis 70.');
    type(q('#vergleich [data-vg="b"][data-k="pensAlter"]'), '62');
    q('#vergleich [data-vgl-los]').click();
    expect(app.S.themen[0]).toEqual({ karte: 'aufhoeren', status: 'vergleich', person: 1, a: { pensAlter: 60 }, b: { pensAlter: 62 } });
    // der Editor der Feldkarte bleibt offen (dieselben Einträge)
    expect(q('#themaEdit').hidden).toBe(false);
  });
  it('ohne Ergebnis ist der Knopf im Editor gesperrt und sagt warum', () => {
    const { app } = start({ ausgabenRuhestand: 0, themen: [{ karte: 'ahv', status: 'vor', person: 0 }] });
    expect(app.R.leer).toBe(true);
    q('#themenleiste [data-thema="t0"]').click();
    const b = q('#themaEdit [data-vergleich-start]');
    expect(b.disabled).toBe(true);
    expect(q(`#${b.getAttribute('aria-describedby')}`).textContent).toContain('sobald die Ausgaben erfasst sind');
  });
  it('Merkerkarte und Wunsch ohne Kartenart: kein Knopf', () => {
    start({ themen: [{ karte: 'erbschaft', status: 'vor' }], wuensche: [{ typ: 'jahr', aktiv: true, name: '', betrag: 1, von: 60, bis: 70 }] });
    q('#themenleiste [data-thema="t0"]').click();
    expect(q('#themaEdit [data-vergleich-start]')).toBeNull();
    q('#themenleiste [data-thema="w0"]').click();
    expect(q('#themaEdit [data-vergleich-start]')).toBeNull();
  });
  it('Umschalter: Rollen, Namen, Zustand als Text, Tab-Reihenfolge; Wechsel zeichnet das Bild, Fokus bleibt', () => {
    const { app } = start();
    laufend(app, 'w0', { monate: 2, von: 58, bis: 80 }, { monate: 10, von: 58, bis: 80 });
    const g = q('#vergleich [role="radiogroup"]');
    expect(g.getAttribute('aria-labelledby') || g.getAttribute('aria-label')).toBeTruthy();
    const [ra, rb] = g.querySelectorAll('[role="radio"]');
    expect([ra.tabIndex, rb.tabIndex]).toEqual([0, -1]);
    expect(ra.textContent).toMatch(/Reicht nicht|Reicht|Knapp/);
    expect(ra.textContent).toMatch(/reicht bis \d+|aufgebraucht mit \d+/);
    const vorher = q('#vglBild svg').outerHTML;
    rb.focus();
    rb.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(ra.getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(ra);
    ra.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(rb.getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(rb);
    expect([ra.tabIndex, rb.tabIndex]).toEqual([-1, 0]);
    expect(q('#vglBild svg').outerHTML).not.toBe(vorher);
    rb.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(ra.getAttribute('aria-checked')).toBe('true');
    rb.click();
    expect(rb.getAttribute('aria-checked')).toBe('true');
    // die Wahl liegt nicht im gespeicherten Zustand
    expect(JSON.stringify(app.S)).not.toMatch(/gewaehlt/);
  });
  it('Bild im Vergleich: drei Linien, benannt in Legende und Textalternative; ohne Ansichtswahl', () => {
    const { app } = start();
    laufend(app, 'w0', { monate: 2, von: 58, bis: 80 }, { monate: 10, von: 58, bis: 80 });
    const svg = q('#vglBild svg');
    expect(svg.querySelectorAll('[data-linie]').length).toBe(3);
    expect(svg.querySelector('[data-linie="plan"]').getAttribute('stroke-dasharray')).toBeTruthy();
    expect(+svg.querySelector('[data-linie="a"]').getAttribute('stroke-width')).toBeGreaterThan(+svg.querySelector('[data-linie="b"]').getAttribute('stroke-width'));
    expect(svg.textContent).toContain('heutiger Plan');
    expect(svg.getAttribute('aria-label')).toMatch(/Variante A.*Variante B.*heutiger Plan/);
    expect(q('#vergleich .legend').textContent).toMatch(/A.*B.*heutiger Plan/);
    const d = [...document.querySelectorAll('[id]')].map((e) => e.id).filter((x, i, a) => a.indexOf(x) !== i);
    expect(d).toEqual([]);
  });
  it('Rechnung unterwegs: aria-busy, «übernehmen» gesperrt; gescheiterte Variante: Text und gesperrt', () => {
    const { app, compute } = start();
    laufend(app, 'w0', { monate: 2, von: 58, bis: 80 }, { monate: 10, von: 58, bis: 80 });
    app.R.vsig = 'alt'; app.vergleich.render();
    expect(q('#vergleich').getAttribute('aria-busy')).toBe('true');
    expect(q('#vergleich [data-uebernehmen="a"]').disabled).toBe(true);
    compute();
    expect(q('#vergleich').hasAttribute('aria-busy')).toBe(false);
    expect(q('#vergleich [data-uebernehmen="a"]').disabled).toBe(false);
    app.R.varianten[1] = null; app.vergleich.render();
    expect(q('#vergleich').textContent).toContain('Diese Variante liess sich nicht rechnen. Bitte die Werte prüfen.');
    expect(q('#vergleich [data-uebernehmen="b"]').disabled).toBe(true);
    expect(q('#vergleich [data-uebernehmen="a"]').disabled).toBe(false);
  });
  it('Übernehmen: Fokus auf die Karte in der Themenleiste; Verwerfen: Toast, eine übernommene Karte bleibt übernommen', () => {
    const { app } = start({ themen: [{ karte: 'ahv', status: 'vor', person: 0 }] });
    laufend(app, 't0', { ahvBezug: -1 }, { ahvBezug: 1 });
    q('#vergleich [data-uebernehmen="a"]').click();
    expect(app.S.personen[0].ahvBezug).toBe(-1);
    expect(app.S.themen[0].status).toBe('ueber');
    expect(document.activeElement).toBe(q('#themenleiste [data-thema="t0"]'));
    expect(app.toasts.at(-1)).toBe('A ist jetzt Teil Ihres Plans.');
    laufend(app, 't0', { ahvBezug: -1 }, { ahvBezug: 2 });
    q('#vergleich [data-verwerfen]').click();
    expect(app.toasts.at(-1)).toBe('Der Vergleich ist verworfen. Ihr Plan ist unverändert.');
    // der übernommene Wert steht weiterhin im Plan: Bericht und Aktionsplan dürfen nicht «noch zu klären» sagen
    expect(app.S.themen[0]).toEqual({ karte: 'ahv', status: 'ueber', person: 0 });
    expect(app.S.personen[0].ahvBezug).toBe(-1);
  });
  it('Werte nachstellen im laufenden Vergleich; Rente oder Kapital fragt beides je Variante', () => {
    const { app } = start({ themen: [{ karte: 'rentekapital', status: 'vor', person: 0 }] });
    laufend(app, 't0', { pkRente: 30000, pkKapital: 238000 }, { pkRente: 20000, pkKapital: 500000 });
    expect(q('#vergleich').textContent).toContain('PensCheck rechnet nicht zwischen Rente und Kapital um');
    const f = (s, k) => q(`#vergleich [data-vg="${s}"][data-k="${k}"]`);
    expect(f('b', 'pkKapital').value).toBe('500’000');
    type(f('b', 'pkKapital'), '450000');
    q('#vergleich [data-vgl-los]').click();
    expect(app.S.themen[0].b).toEqual({ pkRente: 20000, pkKapital: 450000 });
    expect(app.S.personen[0].pkKapital).toBe(238000);
  });
  it('Schritt 6 mit laufendem Vergleich: Überschriften in Reihenfolge, Ids eindeutig', () => {
    const { app } = start();
    laufend(app, 'w0', { monate: 2, von: 58, bis: 80 }, { monate: 10, von: 58, bis: 80 });
    const h = [...document.querySelectorAll('[data-block="vergleich"] :is(h2, h3, h4)')].map((x) => +x.tagName[1]);
    expect(h[0]).toBe(2);
    h.forEach((x, i) => { if (i) expect(x - h[i - 1]).toBeLessThanOrEqual(1); });
  });
  it('Felder je Karte: genau die Schlüssel aus VAR_FELDER, mit Beschriftung', () => {
    for (const karte of Object.keys(VAR_FELDER)) {
      expect(FELDER[karte].map(([k]) => k), karte).toEqual(VAR_FELDER[karte]);
      FELDER[karte].forEach(([, l]) => expect(l, karte).toBeTruthy());
    }
  });
  it('Bild: ohne Varianten wie bisher; mit Varianten drei Linien, Beschriftungen ohne Überlagerung, maskiert', () => {
    const S = neu(), key = themaHinzu(S, 'reisen');
    vergleichStarten(S, key, { betrag: 15000, von: 58, bis: 75 }, { betrag: 25000, von: 58, bis: 75 });
    const R = auswerten(S, E, A0 + 1, {}, variantenZustaende(S)), d = bildDaten(S, R, E);
    const ohne = bildSvg(d, { w: 880, h: 400 }).replace(/bild-\d+/g, '');
    expect(bildSvg({ ...d, varianten: { gewaehlt: 'a', a: null, b: null } }, { w: 880, h: 400 }).replace(/bild-\d+/g, '')).toBe(ohne);
    for (const [w, kurz] of [[880, false], [343, true]]) {
      const v = bildVergleich(S, R, E, 'b', { a: 'reicht bis 91', b: '<b>x</b>' });
      const svg = bildSvg(v, { w, h: 400, kurz });
      expect(svg.match(/data-linie=/g).length).toBe(3);
      expect(svg).not.toContain('<b>');
      expect(svg).toMatch(/stroke-width="3.5"[^>]*\/>/);
      expect(svg).not.toContain('stroke-dasharray="5 4"'); // kein Stresstest im Vergleich
      const ys = [...svg.matchAll(/class="ll[^"]*" x="[^"]+" y="([^"]+)"/g)].map((m) => +m[1]).sort((p, q) => p - q);
      expect(ys.length).toBe(3);
      ys.forEach((y, i) => { if (i) expect(y - ys[i - 1]).toBeGreaterThanOrEqual(kurz ? 14 : 15); });
    }
    // gleiche Linienenden: die Beschriftungen liegen trotzdem untereinander
    const lab = linienLabels([{ y: 100, t: 'A' }, { y: 100, t: 'B' }, { y: 100, t: 'heutiger Plan' }], { oben: 0, unten: 101, fs: 12 });
    expect(lab.map((m) => m.ly)).toEqual([71, 86, 101]);
    expect(bildText(bildVergleich(S, R, E, 'a', { a: 'reicht bis 91' }))).toMatch(/Variante A \(kräftige Linie\): reicht bis 91; Variante B \(dünne Linie\); heutiger Plan/);
  });
  it('Plan geändert, während verglichen wird: Vorschau gilt als unterwegs, bis die neue Rechnung da ist', () => {
    const { app, compute } = start();
    laufend(app, 'w0', { monate: 2, von: 58, bis: 80 }, { monate: 10, von: 58, bis: 80 });
    expect(q('#vergleich [data-uebernehmen="a"]').disabled).toBe(false);
    // Feld in einem anderen Schritt geändert, die Rechnung ist noch nicht da
    app.S.ausgabenRuhestand = 11000; app.vergleich.pruefen();
    expect(q('#vergleich').getAttribute('aria-busy')).toBe('true');
    document.querySelectorAll('#vergleich [data-uebernehmen]').forEach((b) => expect(b.disabled).toBe(true));
    compute();
    expect(q('#vergleich').hasAttribute('aria-busy')).toBe(false);
    const vorschau = app.R.varianten[0].maxA;
    q('#vergleich [data-uebernehmen="a"]').click();
    expect(app.R.maxA).toBe(vorschau);
    expect(app.S.ausgabenRuhestand).toBe(11000);
  });
  it('Umschalter nennt je Variante das Wort der Ampel und die tragbaren Ausgaben (Mehr reisen 15’000 oder 25’000)', () => {
    const { app } = start();
    const key = themaHinzu(app.S, 'reisen'); app.changed();
    laufend(app, key, reisen, reisenB);
    const [ra, rb] = document.querySelectorAll('#vergleich [role="radio"]');
    expect(app.R.varianten[0].maxA).not.toBe(app.R.varianten[1].maxA);
    expect(ra.textContent).not.toBe(rb.textContent);
    [ra, rb].forEach((r, i) => {
      expect(r.textContent).toContain(`tragbare Ausgaben ${chf(app.R.varianten[i].maxA)}/Mt.`);
      expect(r.textContent).toContain('(Alter Person 1)');
      expect(r.textContent).toMatch(/Hypothek (tragbar|knapp tragbar|nicht tragbar) \(\d+%\)/);
      expect(r.textContent).toMatch(/Reicht nicht|Reicht|Knapp/);
    });
  });
  it('Druck: «früher aufhören» wird offen gedruckt, danach wie zuvor', async () => {
    const { app } = start();
    app.schritt.go('vergleich');
    const box = q('#sofortBox');
    expect(box.open).toBe(false);
    window.dispatchEvent(new Event('beforeprint'));
    expect(box.open).toBe(true);
    app.vergleich.render(); // eine Neuberechnung während des Drucks klappt nicht zu
    expect(box.open).toBe(true);
    window.dispatchEvent(new Event('afterprint'));
    expect(box.open).toBe(false);
    box.open = true; await tick();
    window.dispatchEvent(new Event('beforeprint')); window.dispatchEvent(new Event('afterprint'));
    expect(box.open).toBe(true);
    // Das Öffnen der übrigen details in main.js lässt #sofortBox dem Modul
    expect(readFileSync(resolve(process.cwd(), 'src/modules/07c-pension.ts'), 'utf8')).toMatch(/details:not\(\[open\]\):not\(#sofortBox\)/);
  });
  it('Druck: ein zweites beforeprint ohne afterprint merkt sich den Zustand davor nicht neu', () => {
    const { app } = start();
    app.schritt.go('vergleich');
    const box = q('#sofortBox');
    expect(box.open).toBe(false);
    window.dispatchEvent(new Event('beforeprint'));
    window.dispatchEvent(new Event('beforeprint'));
    window.dispatchEvent(new Event('afterprint'));
    expect(box.open).toBe(false);
  });
  it('keine Anmeldung der Druckereignisse über eine globale Variable', () => {
    start();
    expect(Object.keys(window).filter((k) => k.startsWith('__penscheck'))).toEqual([]);
  });
  it('Tutor: der laufende Vergleich steht unter «Weiter erkunden», «früher aufhören» offen wie bisher', () => {
    const S = migrate(clone(EXAMPLE)); S.ui.mode = 'tutor';
    S.themen = [{ karte: 'ausland', status: 'vergleich', w: 0, a: { monate: 2 }, b: { monate: 10 } }];
    boot(S);
    expect(q('#vergleich h3').textContent).toBe('Griechenland: so … oder so?');
    expect(q('#erkunden').contains(q('#vergleich'))).toBe(true);
    expect(q('#sofortBox').open).toBe(true);
    expect(q('#sofort .wi-ctrlbox')).not.toBeNull();
  });
});

describe('Themen in sanitize: Fälle, in denen ein Eintrag wegfällt', () => {
  const mit = (themen, extra = {}) => migrate({ ...clone(EXAMPLE), themen, ...extra }).themen;
  it('Person 1 bei einem Einpersonenhaushalt', () => {
    expect(mit([{ karte: 'teil', status: 'vor', person: 1 }, { karte: 'teil', status: 'vor', person: 0 }], { haushalt: 'single' }).map((t) => t.person)).toEqual([0]);
  });
  it('Personenkarten ohne oder mit ungültiger Person', () => {
    for (const karte of ['aufhoeren', 'teil', 'weiter', 'rentekapital', 'ahv']) {
      expect(mit([{ karte, status: 'vor' }, { karte, status: 'vor', person: 2 }, { karte, status: 'vor', person: '0' }, { karte, status: 'vor', person: -1 }]), karte).toEqual([]);
    }
  });
  it('lg ausserhalb, nicht ganzzahlig oder fehlend', () => {
    for (const karte of ['verkauf', 'amort']) {
      expect(mit([{ karte, status: 'vor' }, { karte, status: 'vor', lg: -1 }, { karte, status: 'vor', lg: 1 }, { karte, status: 'vor', lg: 0.5 }, { karte, status: 'vor', lg: '0' }]), karte).toEqual([]);
      expect(mit([{ karte, status: 'vor', lg: 0 }]), karte).toEqual([{ karte, status: 'vor', lg: 0 }]);
    }
  });
  it('w ausserhalb oder nicht ganzzahlig', () => {
    for (const w of [-1, 1, 0.5, '0', undefined]) expect(mit([{ karte: 'reisen', status: 'vergleich', w, a: {}, b: {} }]), String(w)).toEqual([]);
  });
  it('Wunschkarte nur im Zustand «vergleich»', () => {
    expect(mit([{ karte: 'reisen', status: 'vor', w: 0 }, { karte: 'reisen', status: 'ueber', w: 0 }, { karte: 'reisen', status: 'vor' }])).toEqual([]);
    expect(mit([{ karte: 'ausland', status: 'vergleich', w: 0, a: { monate: 2, von: 58, bis: 80 }, b: { monate: 9, von: 58, bis: 80 } }]).length).toBe(1);
  });
  it('abklaeren ohne gültige Stelle', () => {
    expect(mit([{ karte: 'abklaeren', status: 'vor' }, { karte: 'abklaeren', status: 'vor', stelle: 'x' }, { karte: 'abklaeren', status: 'vor', stelle: 7 }])).toEqual([]);
    expect(mit([{ karte: 'abklaeren', status: 'vor', stelle: 'steueramt' }]).length).toBe(1);
  });
  it('unbekannter Zustand', () => {
    expect(mit([{ karte: 'erbschaft', status: 'x' }, { karte: 'erbschaft' }])).toEqual([]);
  });
});

describe('Themenkarten in der Oberfläche', () => {
  const start = (S = migrate(clone(EXAMPLE))) => { S.ui.mode = 'form'; return boot(S); };
  it('Auswahl: fünf Gruppen, 14 Karten, vier Stellen; ein Klick merkt vor', () => {
    const { app } = start();
    q('#btnThema').click();
    expect(q('#themenDlg').open).toBe(true);
    expect(document.querySelectorAll('#themenDlg [data-karte]').length).toBe(14);
    expect(document.querySelectorAll('#themenDlg [data-stelle]').length).toBe(4);
    q('#themenDlg [data-karte="reisen"]').click();
    expect(app.S.wuensche.at(-1)).toMatchObject({ typ: 'jahr', karte: 'reisen', aktiv: false });
    expect(q('#themenDlg [role="status"]').textContent).toContain('Mehr reisen ist vorgemerkt.');
    expect(q('#themenleiste').textContent).toContain('vorgemerkt');
  });
  it('ohne Liegenschaft sind «verkaufen» und «amortisieren» gesperrt', () => {
    start(migrate({ ...clone(EXAMPLE), liegenschaften: [] }));
    q('#btnThema').click();
    expect(q('#themenDlg [data-karte="verkauf"]').disabled).toBe(true);
    expect(q('#themenDlg [data-karte="amort"]').disabled).toBe(true);
  });
  it('Editor einer Wunschkarte: Zahl erfassen und «rechnet mit» ändert das Ergebnis', () => {
    const { app } = start();
    const vor = app.R.maxA;
    const key = themaHinzu(app.S, 'reisen'); app.changed(); app.themen.render();
    q(`#themenleiste [data-thema="${key}"]`).click();
    expect(document.activeElement.textContent).toContain('Mehr reisen');
    type(q('#themaEdit [data-wk="betrag"]'), '15000'); type(q('#themaEdit [data-wk="von"]'), '58'); type(q('#themaEdit [data-wk="bis"]'), '75');
    expect(app.R.maxA).toBe(vor);
    q('#themaEdit [data-wk="aktiv"]').click();
    expect(app.R.maxA).toBeLessThan(vor);
  });
  it('bestehender Wunsch erscheint als Karte mit seinem Namen; alle Ausland-Felder im Editor', () => {
    start();
    const b = q('#themenleiste [data-thema="w0"]');
    expect(b.textContent).toContain('Griechenland');
    b.click();
    for (const k of ['monate', 'von', 'bis', 'preisniveau', 'anteilVariabel', 'reise', 'miete']) expect(q(`#themaEdit [data-wk="${k}"]`), k).not.toBeNull();
  });
  it('Entfernen fragt nach und löscht den Wunsch', async () => {
    const { app } = start();
    q('#themenleiste [data-thema="w0"]').click();
    q('#themaEdit [data-thema-weg]').click(); await tick();
    expect(app.confirms.length).toBe(1);
    expect(app.S.wuensche.length).toBe(0);
  });
  it('vorgemerkte Karten stehen im Aktionsplan', () => {
    const S = migrate({ ...clone(EXAMPLE), themen: [{ karte: 'erbschaft', status: 'vor' }, { karte: 'abklaeren', status: 'vor', stelle: 'pk' }] });
    S.ui.schritt = 'aktion'; start(S);
    expect(q('#aktThemen').textContent).toContain('Erbschaft erwartet');
    expect(q('#aktThemen').textContent).toContain('Pensionskasse');
  });
  it('präparierter Link: Themen und Wunschnamen erscheinen nie als Markup', () => {
    const s = clone(EXAMPLE); delete s.ui;
    s.wuensche = [{ typ: 'jahr', karte: 'reisen', aktiv: false, name: BOESE, betrag: 1, von: 60, bis: 70 }];
    s.themen = [{ karte: BOESE, status: BOESE }, { karte: 'abklaeren', status: 'vor', stelle: BOESE }, { karte: 'verkauf', status: 'vergleich', lg: 0, a: { verkaufAlter: 70, [BOESE]: BOESE }, b: { verkaufAlter: 75, [BOESE]: 1 } }];
    const S = migrate(decodeCode(b64({ v: 1, ...s }))); S.ui.mode = 'form';
    const { app } = boot(S);
    // Editor des präparierten Wunsches und Dialog offen, in jedem Schritt geprüft; danach der Editor der Liegenschaftskarte
    q('#themenleiste [data-thema="w0"]').click();
    q('#btnThema').click();
    for (const id of SCHRITT_IDS) { app.schritt.go(id); expect(q('#themaEdit').hidden, id).toBe(false); expect(q('#themenDlg').open, id).toBe(true); keinSchadcode(); }
    expect(app.S.wuensche[0].name).toContain('<img');
    expect(q('#themaEdit [data-wk="name"]').value).toBe(app.S.wuensche[0].name);
    q('#themenleiste [data-thema="t0"]').click();
    expect(q('#themaEdit').textContent).toContain('Liegenschaft verkaufen');
    for (const id of SCHRITT_IDS) { app.schritt.go(id); expect(q('#themaEdit').hidden, id).toBe(false); keinSchadcode(); }
    expect(q('#themenleiste').innerHTML).not.toContain('<img');
    // Schritt 6 mit dem laufenden Vergleich aus dem Link, dann mit dem präparierten Wunsch im Vergleich und in der Liste
    app.schritt.go('vergleich');
    expect(q('#vergleich [role="radiogroup"]')).not.toBeNull();
    keinSchadcode();
    vergleichStarten(app.S, 'w0', { betrag: 1, von: 60, bis: 70 }, { betrag: 2, von: 60, bis: 70 }); app.changed(); app.schritt.go('vergleich');
    expect(q('#vergleich h3').textContent).toContain('<img');
    keinSchadcode();
    q('#vergleich [data-verwerfen]').click();
    expect(q('#vergleich [data-vgl-karte="w0"]').textContent).toContain('<img');
    q('#vergleich [data-vgl-karte="w0"]').click();
    keinSchadcode();
    expect(q('#vergleich').innerHTML).not.toContain('<img');
    // Themen mit falscher Bedeutung: Merker im Vergleich, Reisen auf dem Wunsch «Ausland», leere Varianten
    const t = clone(EXAMPLE); delete t.ui;
    t.themen = [{ karte: 'erbschaft', status: 'vergleich', a: { betrag: 1 }, b: { betrag: 1 } }, { karte: 'reisen', status: 'vergleich', w: 0, a: { betrag: 1, von: 60, bis: 70 }, b: { betrag: 2, von: 60, bis: 70 } }, { karte: 'aufhoeren', status: 'vergleich', person: 0, a: {}, b: {} }];
    const T = decodeCode(b64({ v: 1, ...t })); T.ui.mode = 'form';
    expect(T.themen).toEqual([{ karte: 'erbschaft', status: 'vor' }, { karte: 'aufhoeren', status: 'vor', person: 0 }]);
    boot(T).app.schritt.go('vergleich');
    expect(q('#vergleich [role="radiogroup"]')).toBeNull();
    expect(q('#vergleich').textContent).not.toContain('so … oder so?');
  });
  it('Liegenschaft entfernen räumt die Karte dazu weg', async () => {
    const S = migrate({ ...clone(EXAMPLE), themen: [{ karte: 'verkauf', status: 'vor', lg: 0 }] }); S.ui.schritt = 'liegenschaft';
    const { app } = start(S);
    q('#lgList [data-lgdel], #lgList button[aria-label*="entfernen"]').click(); await tick();
    expect(app.S.themen).toEqual([]);
  });
});

describe('Themenkarten in der Oberfläche: Ergänzungen', () => {
  const start = (S = migrate(clone(EXAMPLE))) => { S.ui.mode = 'form'; return boot(S); };
  const ids = () => [...document.querySelectorAll('[id]')].map((e) => e.id);
  it('doppelte Karte und Grenze: Rückmeldung im Dialog statt stillem Scheitern', () => {
    const S = migrate(clone(EXAMPLE));
    S.wuensche = Array.from({ length: 20 }, (_, k) => ({ typ: 'einmal', aktiv: false, name: `W${k}`, betrag: 1, alter: 70 }));
    const { app } = start(S);
    q('#btnThema').click();
    q('#themenDlg [data-karte="erbschaft"]').click();
    q('#themenDlg [data-karte="erbschaft"]').click();
    expect(q('#themenDlg [role="status"]').textContent).toBe('Erbschaft erwartet ist bereits vorgemerkt.');
    expect(app.S.themen.length).toBe(1);
    q('#themenDlg [data-karte="anschaffung"]').click();
    expect(app.S.wuensche.length).toBe(20);
    expect(q('#themenDlg [role="status"]').textContent).toMatch(/Mehr als 20 Wünsche/);
  });
  it('Personenkarte bei Paaren für Person 1, Liegenschaftskarte für die erste; «Noch abklären» mit Stelle', () => {
    const { app } = start();
    q('#btnThema').click();
    q('#themenDlg [data-karte="ahv"]').click();
    q('#themenDlg [data-karte="verkauf"]').click();
    q('#themenDlg [data-stelle="bank"]').click();
    expect(app.S.themen).toEqual([{ karte: 'ahv', status: 'vor', person: 0 }, { karte: 'verkauf', status: 'vor', lg: 0 }, { karte: 'abklaeren', status: 'vor', stelle: 'bank' }]);
    expect(q('#themenleiste').textContent).toContain('AHV vorbeziehen oder aufschieben');
  });
  it('«Fertig» schliesst, der Fokus kehrt zu «+ Thema» zurück', () => {
    start();
    q('#btnThema').click();
    q('#themenDlg [data-karte="erbschaft"]').click();
    q('#btnThemaFertig').click();
    expect(q('#themenDlg').open).toBe(false);
    expect(document.activeElement.id).toBe('btnThema');
  });
  it('Feldkarte: Hinweis der Karte, Sprung zum Feld in Schritt 4, Entfernen lässt den Wert', async () => {
    const S = migrate({ ...clone(EXAMPLE), themen: [{ karte: 'verkauf', status: 'vor', lg: 0 }] });
    S.liegenschaften[0].verkaufAlter = 75;
    const { app } = start(S);
    q('#themenleiste [data-thema="t0"]').click();
    expect(q('#themaEdit').textContent).toContain('Wohnkosten');
    q('#themaEdit [data-te-feld]').click();
    expect(app.S.ui.schritt).toBe('liegenschaft');
    expect(document.activeElement.id).toBe('lg_0_verkaufAlter');
    q('#themenleiste [data-thema="t0"]').click();
    q('#themaEdit [data-thema-weg]').click(); await tick();
    expect(app.S.themen).toEqual([]);
    expect(app.S.liegenschaften[0].verkaufAlter).toBe(75);
  });
  it('Zustand als Text; ein Vergleich heisst «so oder so»', () => {
    start(migrate({ ...clone(EXAMPLE), themen: [{ karte: 'ahv', status: 'vergleich', person: 0, a: { ahvBezug: -1 }, b: { ahvBezug: 1 } }, { karte: 'teil', status: 'ueber', person: 1 }] }));
    expect(q('#themenleiste [data-thema="t0"]').textContent).toContain('so oder so');
    expect(q('#themenleiste [data-thema="t1"]').textContent).toContain('übernommen');
    expect(q('#themenleiste [data-thema="w0"]').textContent).toContain('gerechnet');
  });
  it('Wunsch ohne Kartenart: Titel der Wunschart, im selben Editor bearbeitbar', () => {
    const { app } = start(migrate({ ...clone(EXAMPLE), wuensche: [{ typ: 'einmal', aktiv: true, name: '', betrag: 30000, alter: 66 }] }));
    q('#themenleiste [data-thema="w0"]').click();
    expect(q('#themaEdit h2').textContent).toContain('Einmalig');
    type(q('#themaEdit [data-wk="betrag"]'), '40000');
    expect(app.S.wuensche[0].betrag).toBe(40000);
  });
  it('Haushaltswechsel räumt Karten für Person 2 weg', () => {
    const { app } = start(migrate({ ...clone(EXAMPLE), themen: [{ karte: 'teil', status: 'vor', person: 1 }, { karte: 'teil', status: 'vor', person: 0 }] }));
    q('#form [data-seg="haushalt"][data-val="single"]').click();
    expect(app.S.themen).toEqual([{ karte: 'teil', status: 'vor', person: 0 }]);
  });
  it('Tutor: Wunsch abwählen verschiebt die Bezüge der Themen', () => {
    const S = migrate({ ...clone(EXAMPLE), wuensche: [{ typ: 'jahr', tkey: 'reisen', aktiv: true, name: 'Reisen', betrag: 1, von: 65, bis: 70 }, { typ: 'jahr', karte: 'pflege', aktiv: true, name: '', betrag: 1, von: 80, bis: 90 }] });
    S.themen = [{ karte: 'pflege', status: 'vergleich', w: 1, a: { betrag: 1, von: 80, bis: 90 }, b: { betrag: 2, von: 80, bis: 90 } }];
    S.ui = { ...S.ui, mode: 'tutor', tutorStep: 'wuensche', tutorMax: 99 };
    const { app, tutor } = boot(migrate(S));
    tutor.go('wuensche');
    q('#tutor [data-tact="wish-reisen"]').click();
    expect(app.S.wuensche.length).toBe(1);
    expect(app.S.themen).toEqual([{ karte: 'pflege', status: 'vergleich', w: 0, a: { betrag: 1, von: 80, bis: 90 }, b: { betrag: 2, von: 80, bis: 90 } }]);
  });
  it('Ids eindeutig und Überschriften in Reihenfolge mit Leiste, Dialog und Editor in allen Schritten', () => {
    const { app } = start();
    q('#btnThema').click();
    q('#themenleiste [data-thema="w0"]').click();
    for (const id of SCHRITT_IDS) {
      app.schritt.go(id);
      const d = ids().filter((x, i, a) => a.indexOf(x) !== i);
      expect(d, id).toEqual([]);
      const h = [...document.querySelectorAll('#themaEdit h1, #themaEdit h2, #themaEdit h3, #themenleiste h2, #themenleiste h3, #themenDlg h2, #themenDlg h3')].map((x) => +x.tagName[1]);
      h.forEach((x, i) => { if (i) expect(x - h[i - 1], id).toBeLessThanOrEqual(1); });
    }
  });
  it('Bild: vorgemerkte Karten mit bekanntem Alter als Pin, Titel maskiert, ohne Überlagerung', () => {
    const S = migrate({
      ...clone(EXAMPLE),
      wuensche: [...clone(EXAMPLE.wuensche), { typ: 'einmal', karte: 'anschaffung', aktiv: false, name: '<b>Boot</b>', betrag: 1, alter: 70 }, { typ: 'jahr', karte: 'reisen', aktiv: false, name: '' }],
      themen: [{ karte: 'verkauf', status: 'vergleich', lg: 0, a: { verkaufAlter: 72 }, b: { verkaufAlter: 0 } }, { karte: 'erbschaft', status: 'vor' }],
    });
    const d = bildDaten(S, auswerten(S, E, A0 + 1), E);
    expect(d.pins).toEqual([{ alter: 70, text: '<b>Boot</b>' }, { alter: 72, text: 'Liegenschaft verkaufen' }]);
    const svg = bildSvg(d, { w: 880, h: 400 });
    expect(svg).toContain('&lt;b&gt;Boot&lt;/b&gt; ?');
    expect(svg).not.toContain('<b>');
    expect(svg.match(/class="pin"/g).length).toBe(2);
    expect(bildSvg({ ...d, pins: [] }, { w: 880, h: 400 })).not.toContain('class="pin"');
    expect(bildText(d)).toContain('Vorgemerkt');
    const kurz = bildSvg(d, { w: 343, h: 150, kurz: true });
    // schmal: nur die Linie und «?»; der Titel steht im Tooltip (title) und in der Textalternative
    expect([...kurz.matchAll(/class="pint"[^>]*>([^<]*)</g)].map((m) => m[1])).toEqual(['?', '?']);
    expect(kurz).toContain('<title>&lt;b&gt;Boot&lt;/b&gt;: noch nicht Teil des Plans</title>');
    [[880, false], [343, true]].forEach(([w, k]) => {
      const lay = markenLayout(d, { w, kurz: k });
      expect(lay.filter((m) => m.pin).length).toBe(2);
      lay.forEach((a, i) => lay.slice(i + 1).forEach((b) => { if (a.zeile === b.zeile) expect(a.r <= b.l || b.r <= a.l).toBe(true); }));
    });
  });
  it('Texte: Grenze zum Verkauf, Hinweis am Feld, Datenschutz nennt die Themen', () => {
    const g = GRENZEN.find(([t]) => t === 'Wohnkosten nach einem Verkauf');
    expect(g[1]).toBe('Wird das selbst bewohnte Eigenheim verkauft, bleiben die Wohnkosten so, wie sie in den Ausgaben erfasst sind. Eine Miete danach ist gesondert zu erfassen.');
    expect(DATENSCHUTZ.punkte.map(([, x]) => x).join(' ')).toContain('Vorgemerkte Themen gehören zu den Angaben: Sie sind im Browser gespeichert und im Link enthalten.');
    const S = migrate(clone(EXAMPLE)); S.ui.schritt = 'liegenschaft';
    start(S);
    expect(q('#lgList').textContent).toContain(g[1]);
  });
  it('Liegenschaft entfernen bei offenem Editor: Editor schliesst, die Karte der anderen Liegenschaft bleibt', async () => {
    const S = migrate(clone(EXAMPLE));
    S.liegenschaften.push({ name: 'Ferienhaus', typ: 'ferien', verkehrswert: 500000, hypothek: 200000, zins: 2, unterhalt: 1, nebenkosten: 300, mietertrag: 0, verkaufAlter: 0 });
    S.themen = [{ karte: 'verkauf', status: 'vor', lg: 0 }, { karte: 'verkauf', status: 'vor', lg: 1 }, { karte: 'amort', status: 'vor', lg: 1 }];
    S.ui.schritt = 'liegenschaft';
    const { app } = start(S);
    const andere = app.S.themen[1];
    q('#themenleiste [data-thema="t0"]').click();
    expect(q('#themaEdit').hidden).toBe(false);
    q('#lgList [data-lgdel="0"]').click(); await tick();
    expect(app.S.liegenschaften.length).toBe(1);
    expect(app.S.themen).toEqual([{ karte: 'verkauf', status: 'vor', lg: 0 }, { karte: 'amort', status: 'vor', lg: 0 }]);
    expect(app.S.themen[0]).toBe(andere);
    expect(q('#themaEdit').hidden).toBe(true);
    expect(q('#themaEdit [data-thema-weg]')).toBeNull();
    // Amortisationskarte offen, ihre Liegenschaft wird entfernt: ebenfalls geschlossen
    q('#themenleiste [data-thema="t1"]').click();
    q('#lgList [data-lgdel="0"]').click(); await tick();
    expect(app.S.themen).toEqual([]);
    expect(q('#themaEdit').hidden).toBe(true);
  });
  it('bis 768 px: Leiste auch unter den Schritten in «Eingaben», Fokus kehrt in diese Leiste zurück', () => {
    const alt = window.matchMedia;
    window.matchMedia = (m) => ({ matches: m === '(max-width: 768px)', media: m, addEventListener() {}, removeEventListener() {} });
    try {
      start();
      document.body.dataset.view = 'form';
      expect(q('#themenleisteEin').hidden).toBe(false);
      expect(q('#themenleisteEin [data-thema="w0"]').textContent).toContain('Griechenland');
      expect(document.querySelectorAll('#btnThema').length).toBe(1);
      expect(q('#themenleisteEin #btnThemaEin')).not.toBeNull();
      const d = [...document.querySelectorAll('[id]')].map((e) => e.id).filter((x, i, a) => a.indexOf(x) !== i);
      expect(d).toEqual([]);
      q('#themenleisteEin [data-thema="w0"]').click();
      expect(q('#themaEdit').hidden).toBe(false);
      q('#themaEdit [data-thema-zu]').click();
      expect(document.activeElement).toBe(q('#themenleisteEin [data-thema="w0"]'));
      q('#btnThemaEin').click();
      expect(q('#themenDlg').open).toBe(true);
      q('#btnThemaFertig').click();
      expect(document.activeElement.id).toBe('btnThemaEin');
    } finally { window.matchMedia = alt; }
  });
  it('Tutor: Themenleiste im Ergebnis, keine unter den (verborgenen) Schritten des Formulars', () => {
    const S = migrate(clone(EXAMPLE)); S.ui.mode = 'tutor';
    boot(S);
    expect(q('#themenleiste').hidden).toBe(false);
    expect(q('#themenleiste #btnThema')).not.toBeNull();
    expect(q('#themenleisteEin').hidden).toBe(true);
    expect(q('#themenleisteEin').innerHTML).toBe('');
  });
});
