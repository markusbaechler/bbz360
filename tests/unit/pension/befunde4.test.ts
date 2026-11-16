// @ts-nocheck — Referenztest, aus PensCheck (tests/befunde4.test.js, Stand 4830eff) übernommen; nur Pfade angepasst.
// @vitest-environment happy-dom
// Befunde der Begutachtung vom 15.11.2026 (Themenkarten, Vergleich, Bild): Rechnung und Zustand.
import { describe, it, expect } from 'vitest';
import params from '../../../public/data/params.json';
import { createEngine } from '../../../src/lib/pension/engine';
import { resolveParams } from '../../../src/lib/pension/params';
import { analyse, horizon } from '../../../src/lib/pension/analyse';
import { EXAMPLE, clone, migrate, sanitize } from '../../../src/lib/pension/state';
import { bildDaten } from '../../../src/pension-ui/bild';
import { KARTEN, themaHinzu, varianteAnwenden, variantenZustaende, vergleichStarten, uebernehmen, verwerfen } from '../../../src/lib/pension/themen';
import { boot, q } from './hilfen';

const A0 = 2026 * 12 + 10;
const E = createEngine(resolveParams(params, 2026), A0);
const neu = () => migrate(clone(EXAMPLE));
const sim = (S) => E.simulate({ ...S, ...horizon(S, E) });
const neben = (o = {}) => ({ person: 0, art: 'nebenerwerb', betrag: 30000, bisJahr: 0, text: '', ...o });

describe('Lohn nach der Pensionierung zählt erst ab der Pensionierung', () => {
  it('Rechenkern: «ab Pensionierung» bringt vor dem Pensionsjahr nichts, danach den Lohn; «ab heute» zählt sofort', () => {
    const S = neu(); S.einkommen = [neben({ abPens: true })];
    const r = sim(migrate(S)), pj = Math.floor(r.ps[0].Aret / 12);
    const vor = r.rows.filter((x) => x.year < pj), nach = r.rows.filter((x) => x.year > pj && x.year < pj + 5);
    expect(vor.length).toBeGreaterThan(2);
    vor.forEach((x) => expect(x.uebrig).toBe(0));
    nach.forEach((x) => expect(x.uebrig).toBeGreaterThan(15000));
    const S2 = neu(); S2.einkommen = [neben()];
    expect(sim(migrate(S2)).rows.find((x) => x.year === 2027).uebrig).toBeGreaterThan(15000);
  });
  it('im Pensionsjahr zählen nur die Monate nach dem Pensionsmonat', () => {
    const S = neu(); S.einkommen = [neben({ abPens: true })];
    const r = sim(migrate(S)), pj = Math.floor(r.ps[0].Aret / 12), monate = 12 - (r.ps[0].Aret % 12);
    const S2 = neu(); S2.einkommen = [neben()];
    const voll = sim(migrate(S2)).rows.find((x) => x.year === pj).uebrig, teil = r.rows.find((x) => x.year === pj).uebrig;
    expect(teil / voll).toBeGreaterThan(monate / 12 - 0.03);
    expect(teil / voll).toBeLessThan(monate / 12 + 0.03);
  });
  it('die Zeile aus dem geführten Modus («nach der Pensionierung dazuverdienen») gilt ab der Pensionierung, auch aus älteren Ständen', () => {
    const S = neu(); S.einkommen = [neben({ tkey: 'neben', text: 'nach der Pensionierung' })];
    const m = migrate(S);
    expect(m.einkommen[0]).toMatchObject({ tkey: 'neben', abPens: true });
    expect(sanitize(clone(m)).einkommen).toEqual(m.einkommen);
    expect(sim(m).rows.find((x) => x.year === 2027).uebrig).toBe(0);
    // «ab heute» bleibt möglich; bei anderen Arten gibt es das Feld nicht
    expect(migrate({ ...neu(), einkommen: [neben()] }).einkommen[0].abPens).toBeUndefined();
    expect(migrate({ ...neu(), einkommen: [neben({ art: 'dividende', abPens: true })] }).einkommen[0].abPens).toBeUndefined();
  });
  it('Hinweis, wenn «bis Jahr» vor der Pensionierung liegt', () => {
    const S = neu(); S.einkommen = [neben({ abPens: true, bisJahr: 2028 })];
    const R = analyse(migrate(S), E, A0 + 1);
    expect(JSON.stringify(R)).toContain('liegt vor der Pensionierung');
  });
  it('Karte «Weiterarbeiten danach»: Zeile ab der Pensionierung; ein zweiter Vergleich ersetzt sie, Betrag 0 entfernt sie', () => {
    const S = neu(), key = themaHinzu(S, 'weiter', { person: 0 });
    vergleichStarten(S, key, { betrag: 30000, bisJahr: 2040 }, { betrag: 60000, bisJahr: 2040 });
    const [SA] = variantenZustaende(S, E);
    expect(SA.einkommen.at(-1)).toMatchObject({ betrag: 30000, abPens: true, tkey: 'weiter' });
    expect(sim(SA).rows.find((x) => x.year === 2027).uebrig).toBe(sim(S).rows.find((x) => x.year === 2027).uebrig);
    uebernehmen(S, key, 'a', E);
    const n = S.einkommen.length;
    vergleichStarten(S, key, { betrag: 30000, bisJahr: 2040 }, { betrag: 40000, bisJahr: 2040 });
    const [SA2, SB2] = variantenZustaende(S, E);
    expect(SA2.einkommen.filter((x) => x.tkey === 'weiter').map((x) => x.betrag)).toEqual([30000]);
    expect(SB2.einkommen.filter((x) => x.tkey === 'weiter').map((x) => x.betrag)).toEqual([40000]);
    uebernehmen(S, key, 'b', E);
    expect(S.einkommen.length).toBe(n);
    vergleichStarten(S, key, { betrag: 0, bisJahr: 0 }, { betrag: 40000, bisJahr: 2040 });
    uebernehmen(S, key, 'a', E);
    expect(S.einkommen.some((x) => x.tkey === 'weiter')).toBe(false);
    expect(KARTEN.weiter.hinweis).toContain('ab der Pensionierung');
  });
  it('«ab heute» von Hand gewählt bleibt nach dem Speichern; die Karte ersetzt die Zeile des geführten Modus, statt dazuzuzählen', () => {
    const S = neu(); S.einkommen = [neben({ tkey: 'neben', abPens: false, betrag: 20000 })];
    const m = migrate(S);
    expect(m.einkommen[0].abPens).toBe(false);
    expect(sanitize(clone(m)).einkommen).toEqual(m.einkommen);
    expect(sim(m).rows.find((x) => x.year === 2027).uebrig).toBeGreaterThan(10000);
    const T = neu(); T.einkommen = [neben({ tkey: 'neben', betrag: 20000 })];
    const t = migrate(T), key = themaHinzu(t, 'weiter', { person: 0 });
    vergleichStarten(t, key, { betrag: 30000, bisJahr: 0 }, { betrag: 60000, bisJahr: 0 });
    const [SA, SB] = variantenZustaende(t, E);
    expect(SA.einkommen.filter((x) => x.art === 'nebenerwerb').map((x) => [x.betrag, x.tkey])).toEqual([[30000, 'neben']]);
    expect(SB.einkommen.filter((x) => x.art === 'nebenerwerb').map((x) => x.betrag)).toEqual([60000]);
    // eine von Hand auf Dividenden umgestellte Kartenzeile wird nicht gelöscht
    const U = neu(); U.einkommen = [neben({ tkey: 'weiter', art: 'dividende', betrag: 5000 })];
    const u = migrate(U), k2 = themaHinzu(u, 'weiter', { person: 0 });
    expect(varianteAnwenden(u, k2, { betrag: 30000, bisJahr: 0 }, E).einkommen.map((x) => x.art)).toEqual(['dividende', 'nebenerwerb']);
  });
  it('Ablauf: «beginnt» zur Pensionierung; kein «endet», wenn der Nebenerwerb nie beginnt', () => {
    const S = neu(); S.einkommen = [neben({ abPens: true, bisJahr: 2040 })];
    const txt = sim(migrate(S)).events.map((e) => e.text).join('|');
    expect(txt).toContain('Nebenerwerb beginnt');
    expect(txt).toContain('Nebenerwerb endet');
    const S2 = neu(); S2.einkommen = [neben({ abPens: true, bisJahr: 2028 })];
    expect(sim(migrate(S2)).events.map((e) => e.text).join('|')).not.toContain('Nebenerwerb');
  });
  it('volle Liste: Der Vergleich startet nicht, statt eine wirkungslose Variante zu zeigen', () => {
    const S = neu(); S.einkommen = Array.from({ length: 20 }, () => neben({ art: 'dividende', betrag: 100 }));
    const key = themaHinzu(S, 'weiter', { person: 0 });
    expect(vergleichStarten(S, key, { betrag: 1, bisJahr: 0 }, { betrag: 60000, bisJahr: 0 })).toBeNull();
    expect(S.themen.at(-1).status).toBe('vor');
  });
});

describe('«Früher oder später aufhören» führt die Pensionskasse nach', () => {
  it('Rente, Kapital und Guthaben folgen der Schätzung des Rechenkerns; das geplante Alter bleibt wie erfasst', () => {
    const S = neu(), p = S.personen[0], key = themaHinzu(S, 'aufhoeren', { person: 0 });
    expect(p.pkRente).toBeGreaterThan(0);
    const spaeter = p.pensAlter + 3, soll = E.pkBeiAlter(p, spaeter);
    vergleichStarten(S, key, { pensAlter: p.pensAlter }, { pensAlter: spaeter });
    const [SA, SB] = variantenZustaende(S, E);
    expect(SA.personen[0]).toEqual(migrate(clone(S)).personen[0]);
    expect(SB.personen[0].pensAlter).toBe(spaeter);
    expect(SB.personen[0].pkRente).toBe(Math.round(soll.rente));
    expect(SB.personen[0].pkKapital).toBe(Math.round(soll.kapital));
    expect(SB.personen[0].pkRente).toBeGreaterThan(p.pkRente);
    // die Rechnung nimmt die nachgeführte Rente
    const pk = (Sx) => sim(Sx).rows.find((x) => x.year === 2045).pk;
    expect(pk(SB)).toBeGreaterThan(pk(SA) * 1.05);
    // Vorschau und Übernehmen sind dasselbe
    uebernehmen(S, key, 'b', E);
    expect(S.personen[0]).toEqual(SB.personen[0]);
    expect(KARTEN.aufhoeren.hinweis).toContain('geschätzt');
  });
  it('früher aufhören senkt die Rente (Umwandlungssatz und Guthaben), nicht nur die Zahl der Lohnjahre', () => {
    const S = neu(); Object.assign(S.personen[0], { pensAlter: 65, pkRente: 42000, pkKapital: 0, pkGuthabenPlan: 750000, pkGuthabenHeute: 500000 });
    const m = migrate(S), key = themaHinzu(m, 'aufhoeren', { person: 0 });
    const B = varianteAnwenden(m, key, { pensAlter: 62 }, E).personen[0];
    expect(B.pkRente).toBeLessThan(42000 * 0.85);
    expect(B.pkRente).toBe(Math.round(E.pkBeiAlter(m.personen[0], 62).rente));
    expect(B.pkGuthabenPlan).toBeLessThan(750000);
  });
  it('Hin und zurück kommt bei den Ausgangswerten an, auch über ein Alter unter dem frühesten Pensionsalter der Kasse', () => {
    const lauf = (weg, o = {}) => {
      const S = neu(); Object.assign(S.personen[0], o);
      const m = migrate(S), start = { ...m.personen[0] }, key = themaHinzu(m, 'aufhoeren', { person: 0 });
      weg.forEach((alter) => { vergleichStarten(m, key, { pensAlter: m.personen[0].pensAlter }, { pensAlter: alter }); uebernehmen(m, key, 'b', E); });
      return [start, m.personen[0]];
    };
    const p0 = neu().personen[0].pensAlter;
    for (const [weg, o] of [[[p0 - 2, p0], {}], [[p0 - 3, p0 + 4, p0], {}], [[62, 65], { pensAlter: 65, pkRente: 27000, pkKapital: 200000, pkGuthabenPlan: 700000 }], [[59, 65], { pensAlter: 65, pkRente: 27000, pkKapital: 200000, pkGuthabenPlan: 700000, minAlter: 60 }]]) {
      const [a, b] = lauf(weg, o);
      expect(Math.abs(b.pkRente - a.pkRente), JSON.stringify(weg)).toBeLessThanOrEqual(3);
      expect(Math.abs(b.pkKapital - a.pkKapital), JSON.stringify(weg)).toBeLessThanOrEqual(3);
      expect(b.pensAlter).toBe(a.pensAlter);
    }
  });
  it('Guthaben ohne Rente erfindet keine Rente; bereits Pensionierte behalten ihre laufende Leistung', () => {
    const S = neu(); Object.assign(S.personen[0], { pensAlter: 65, pkRente: 0, pkKapital: 200000, pkGuthabenPlan: 700000 });
    const m = migrate(S), key = themaHinzu(m, 'aufhoeren', { person: 0 });
    expect(varianteAnwenden(m, key, { pensAlter: 64 }, E).personen[0].pkRente || 0).toBe(0);
    const S2 = neu(); Object.assign(S2.personen[0], { jahrgang: 1962, pensAlter: 63, pkRente: 30000, pkKapital: 0 });
    const m2 = migrate(S2), k2 = themaHinzu(m2, 'aufhoeren', { person: 0 });
    expect(varianteAnwenden(m2, k2, { pensAlter: 65 }, E).personen[0].pkRente).toBe(30000);
    // Meldung, wenn nur ein Guthaben erfasst ist
    const S3 = neu(); Object.assign(S3.personen[0], { pkRente: 0, pkKapital: 0, pkGuthabenPlan: 700000 });
    expect(JSON.stringify(analyse(migrate(S3), E, A0 + 1))).toContain('weder Rente noch Kapitalbezug');
    // volle Rente neben einem Kapitalbezug fällt auf
    const S4 = neu(); Object.assign(S4.personen[0], { pkRente: 30000, pkKapital: 100000, pkGuthabenPlan: 500000 });
    expect(JSON.stringify(analyse(migrate(S4), E, A0 + 1))).toContain('passen nicht zum Guthaben');
    expect(JSON.stringify(analyse(neu(), E, A0 + 1))).not.toContain('passen nicht zum Guthaben');
  });
  it('ohne Pensionskasse und bei unverändertem Alter ändert sich nichts', () => {
    const S = neu(); Object.assign(S.personen[0], { pkRente: 0, pkKapital: 0, pkGuthabenPlan: 0, pkGuthabenHeute: 0 });
    const m = migrate(S), key = themaHinzu(m, 'aufhoeren', { person: 0 });
    const B = varianteAnwenden(m, key, { pensAlter: m.personen[0].pensAlter + 2 }, E).personen[0];
    expect([B.pkRente || 0, B.pkKapital || 0, B.pkGuthabenPlan || 0]).toEqual([0, 0, 0]);
    const S2 = neu(), k2 = themaHinzu(S2, 'aufhoeren', { person: 0 });
    expect(varianteAnwenden(S2, k2, { pensAlter: S2.personen[0].pensAlter }, E).personen[0]).toEqual(migrate(clone(S2)).personen[0]);
  });
});

describe('Weitere Befunde: Amortisation, AHV-Grenze, Status, Bild', () => {
  it('eine Amortisation trifft die gewählte Liegenschaft, auch wenn davor ein Objekt ohne Verkehrswert steht', () => {
    const lg0 = { name: 'Leer', typ: 'eigen', verkehrswert: 0, hypothek: 0, zins: 1.5, unterhalt: 1, nebenkosten: 0, mietertrag: 0, verkaufAlter: 0 };
    const mit = neu(); mit.liegenschaften.unshift(lg0); mit.amortisationen = [{ lg: 1, betrag: 300000, jahr: 2030, monat: 1, quelle: 'frei' }];
    const ohne = neu(); ohne.amortisationen = [{ lg: 0, betrag: 300000, jahr: 2030, monat: 1, quelle: 'frei' }];
    const keine = neu(); keine.amortisationen = [];
    const V = (S) => sim(migrate(S)).rows.map((x) => Math.round(x.V));
    expect(V(mit)).toEqual(V(ohne));
    expect(V(mit)).not.toEqual(V(keine));
  });
  it('Vorschlag «3a-Vorbezug zur Amortisation» trifft das Eigenheim, auch hinter einem Objekt ohne Verkehrswert', () => {
    const lg0 = { name: 'Leer', typ: 'eigen', verkehrswert: 0, hypothek: 0, zins: 1.5, unterhalt: 1, nebenkosten: 0, mietertrag: 0, verkaufAlter: 0 };
    const basis = () => { const S = neu(); S.liegenschaften[0].hypothek = 1300000; S.ausgaben = 7000; S.amortisationen = []; return S; };
    const ohne = analyse(migrate(basis()), E, A0 + 1);
    const S = basis(); S.liegenschaften.unshift(lg0);
    const mit = analyse(migrate(S), E, A0 + 1);
    expect(ohne.vs).toBeTruthy();
    expect(mit.vs.amortisationen.every((x) => x.lg === 1)).toBe(true);
    expect(mit.vs.trag.worst.quote).toBeCloseTo(ohne.vs.trag.worst.quote, 6);
    expect(mit.vs.trag.worst.quote).toBeLessThan(mit.tr.worst.quote);
  });
  it('Karte «Hypothek amortisieren»: ein zweiter Vergleich ersetzt die eigene Zeile', () => {
    const S = neu(); S.amortisationen = [];
    const key = themaHinzu(S, 'amort', { lg: 0 });
    vergleichStarten(S, key, { betrag: 100000, jahr: 2030, monat: 1 }, { betrag: 200000, jahr: 2030, monat: 1 });
    uebernehmen(S, key, 'a', E);
    vergleichStarten(S, key, { betrag: 100000, jahr: 2030, monat: 1 }, { betrag: 200000, jahr: 2031, monat: 6 });
    uebernehmen(S, key, 'b', E);
    expect(S.amortisationen.map((x) => [x.betrag, x.jahr, x.tkey])).toEqual([[200000, 2031, 'karte']]);
    expect(KARTEN.amort.braucht).toBe('Betrag, Jahr');
  });
  it('AHV-Vorbezug: gerechnet und übernommen wird höchstens der zulässige Wert', () => {
    const S = neu(), key = themaHinzu(S, 'ahv', { person: 0 }), max = E.maxVorbezug(S.personen[0]);
    const B = varianteAnwenden(S, key, { ahvBezug: -5 }, E);
    expect(B.personen[0].ahvBezug).toBe(-max);
  });
  it('eine übernommene Karte bleibt übernommen, wenn ein weiterer Vergleich verworfen wird', () => {
    const S = neu(), key = themaHinzu(S, 'ahv', { person: 0 });
    vergleichStarten(S, key, { ahvBezug: 1 }, { ahvBezug: 2 });
    uebernehmen(S, key, 'a', E);
    vergleichStarten(S, key, { ahvBezug: 1 }, { ahvBezug: 3 });
    expect(sanitize(clone(S)).themen).toEqual(S.themen);
    verwerfen(S, key);
    expect(S.themen.at(-1)).toEqual({ karte: 'ahv', status: 'ueber', person: 0 });
    expect(S.personen[0].ahvBezug).toBe(1);
  });
  it('Bild: «Ausgaben inkl. Steuern» enthält Wünsche, Vermögens- und Ertragssteuern', () => {
    const S = neu(); S.wuensche = [{ name: 'Reisen', typ: 'jahr', betrag: 20000, von: 66, bis: 75, aktiv: true }];
    const m = migrate(S), R = analyse(m, E, A0 + 1), d = bildDaten(m, R, E);
    const x = R.base.rows.find((y) => y.wAus > 0 && y.year > 2040), j = d.jahre.find((y) => y.jahr === x.year);
    expect(x.wAus).toBeGreaterThan(10000);
    expect(j.bedarf).toBeCloseTo((x.ausgaben + x.steuern + x.stVerm + x.stErtrag + x.ne + x.wAus - x.wEinLauf) / x.I, 2);
    const ohne = migrate({ ...S, wuensche: [] }), Ro = analyse(ohne, E, A0 + 1);
    expect(j.bedarf).toBeGreaterThan(bildDaten(ohne, Ro, E).jahre.find((y) => y.jahr === x.year).bedarf + 10000);
  });
});

describe('Oberfläche: Vergleich und Themenleiste', () => {
  const start = (o = {}) => { const S = migrate({ ...clone(EXAMPLE), ...o }); S.ui.mode = 'form'; return boot(S); };
  const laufend = (app, key, a, b) => { vergleichStarten(app.S, key, a, b); app.changed(); app.schritt.go('vergleich'); };
  it('«Hypothek amortisieren» zeigt je Variante die Tragbarkeit der Hypothek und den Hinweis zur Quelle', () => {
    const { app } = start({ themen: [{ karte: 'amort', status: 'vor', lg: 0 }] });
    laufend(app, 't0', { betrag: 0, jahr: 2030, monat: 1 }, { betrag: 300000, jahr: 2030, monat: 1 });
    const [ra, rb] = document.querySelectorAll('#vergleich [role="radio"]');
    const pct = (el) => +el.textContent.match(/Hypothek [a-z ]+\((\d+)%\)/)[1];
    expect(pct(rb)).toBeLessThan(pct(ra));
    expect(q('#vergleich').textContent).toContain('Bezahlt aus dem freien Vermögen');
  });
  it('gleiche Ergebnisse bei verschiedenen Werten: Hinweis, die Werte zu prüfen', () => {
    const { app } = start({ themen: [{ karte: 'teil', status: 'vor', person: 0 }] });
    // Teilpensionierung nach der Pensionierung wird nicht gerechnet: beide Varianten gleich
    laufend(app, 't0', { teilAb: 70, teilPensum: 50 }, { teilAb: 72, teilPensum: 40 });
    expect(q('#vergleich .vg-status').textContent).toContain('A und B ergeben dasselbe Ergebnis');
    laufend(app, 't0', { teilAb: 0, teilPensum: 100 }, { teilAb: 56, teilPensum: 50 });
    expect(q('#vergleich .vg-status').textContent).toBe('');
  });
  it('«Früher oder später aufhören» nimmt nur künftige Alter an', () => {
    const { app } = start({ themen: [{ karte: 'aufhoeren', status: 'vor', person: 0 }] });
    app.schritt.go('vergleich');
    q('#vergleich [data-vgl-karte="t0"]').click();
    const b = q('#vergleich [data-vg="b"][data-k="pensAlter"]');
    b.value = '50'; b.dispatchEvent(new Event('input', { bubbles: true }));
    expect(q('#vergleich [data-vgl-los]').disabled).toBe(true);
    b.value = '61'; b.dispatchEvent(new Event('input', { bubbles: true }));
    expect(q('#vergleich [data-vgl-los]').disabled).toBe(false);
  });
  it('«Früher oder später aufhören» nennt die Schätzung der Pensionskasse', () => {
    const { app } = start({ themen: [{ karte: 'aufhoeren', status: 'vor', person: 0 }] });
    laufend(app, 't0', { pensAlter: 58 }, { pensAlter: 61 });
    expect(q('#vergleich').textContent).toContain('Rente und Kapital der Pensionskasse werden für das andere Alter geschätzt');
    expect(app.R.varianten[1].maxA).toBeGreaterThan(app.R.varianten[0].maxA);
  });
});
