// @ts-nocheck — Referenztest, unverändert aus PensCheck (tests/fach.test.js, Stand 4830eff) übernommen.
// Fachliche Regeln aus dem Assessment vom 14.11.2026: Folgejahreswerte, Beitragsbasis, Befreiungsschwelle,
// Liegenschaft als Reserve, Kalenderdatei.
import { describe, it, expect } from 'vitest';
import params from '../../../public/data/params.json';
import { createEngine } from '../../../src/lib/pension/engine';
import { resolveParams, nextParams } from '../../../src/lib/pension/params';
import { analyse, horizon } from '../../../src/lib/pension/analyse';
import { buildIcs } from '../../../src/lib/pension/aktion';
import { EXAMPLE, clone, migrate } from '../../../src/lib/pension/state';

const A0 = 2026 * 12 + 10; // November 2026
const P = resolveParams(params, 2026), Pn = nextParams(params, 2026);
const E = createEngine(P, A0), En = createEngine(P, A0, Pn);
const inpOf = (s, e = E) => ({ ...s, ...horizon(s, e) });
const rentner = (o = {}) => migrate({ haushalt: 'single', personen: [{ jahrgang: 1958, geburtsmonat: 1, geschlecht: 'm', pensAlter: 65, brutto: 200000 }], ausgabenRuhestand: 4000, liquiditaet: 500000, ahvAnpassung: 0, inflation: 0, steuerEink: 0, ...o });

describe('Werte des Folgejahres (B1)', () => {
  it('nextParams liefert die Werte 2027, solange 2026 läuft, und danach nichts mehr', () => {
    expect(Pn.ahv.maxRente).toBe(2560);
    expect(Pn.s3a.maxMitPK).toBe(7373);
    expect(nextParams(params, 2027)).toBeNull();
  });
  it('die AHV-Rente steigt in der Projektion am 1. Januar auf den beschlossenen Wert', () => {
    const s = rentner();
    const alt = E.simulate(inpOf(s)), neu = En.simulate(inpOf(s, En));
    const j = (r, y) => r.rows.find((x) => x.year === y);
    // 2026: November und Dezember mit dem Wert 2026 (13 Monatsrenten pro Jahr, monatlich verteilt)
    expect(j(neu, 2026).ahv).toBeCloseTo((2520 * 13 / 12) * 2, 6);
    expect(j(neu, 2027).ahv).toBeCloseTo(2560 * 13, 6);
    expect(j(alt, 2027).ahv).toBeCloseTo(2520 * 13, 6);
    expect(j(neu, 2030).ahv).toBeCloseTo(2560 * 13, 6);
  });
  it('ohne Sprung am Jahreswechsel: Die Rechnung vom Januar 2027 beginnt mit demselben Wert', () => {
    const s = rentner();
    const E27 = createEngine(resolveParams(params, 2027), 2027 * 12, nextParams(params, 2027));
    const r27 = E27.simulate(inpOf(s, E27)), r26 = En.simulate(inpOf(s, En));
    expect(r27.rows[0].ahv).toBeCloseTo(r26.rows.find((x) => x.year === 2027).ahv, 6);
  });
  it('ein eigener AHV-Betrag steigt im gleichen Verhältnis wie die Minimalrente', () => {
    const p = { ahvModus: 'betrag', ahvBetrag: 2100 };
    expect(E.ahvMonat(p)).toBe(2100);
    expect(E.ahvMonat(p, Pn.ahv)).toBeCloseTo(2100 * 1280 / 1260, 6);
  });
  it('Säule 3a: ab Januar gilt das neue Maximum', () => {
    const p = { brutto: 100000, s3aModus: 'max' };
    expect(En.s3aJahr({ ahvAnpassung: 0 }, p, 0)).toBe(7258);
    expect(En.s3aJahr({ ahvAnpassung: 0 }, p, 2)).toBe(7373);
    expect(E.s3aJahr({ ahvAnpassung: 0 }, p, 2)).toBe(7258);
  });
});

describe('Beiträge als Nichterwerbstätige', () => {
  const frueh = (o = {}) => migrate({ haushalt: 'single', personen: [{ jahrgang: 1966, geburtsmonat: 1, geschlecht: 'm', pensAlter: 60, brutto: 0 }], ausgabenRuhestand: 3000, liquiditaet: 300000, inflation: 0, ahvAnpassung: 0, ...o });
  const ne = (s, e = E, y = 2026) => e.simulate(inpOf(s, e)).rows.find((x) => x.year === y).ne;
  it('Liegenschaften zählen abzüglich Hypothek zum Vermögen (B2)', () => {
    const ohne = ne(frueh()), mit = ne(frueh({ liegenschaften: [{ typ: 'eigen', verkehrswert: 1500000, hypothek: 500000 }] }));
    // 300'000 liegt unter der Mindestgrenze: Mindestbeitrag, zwei Monate
    expect(ohne).toBeCloseTo((530 / 12) * 2, 6);
    // 1.3 Mio. Vermögen im ersten Monat, nach den Ausgaben knapp darunter (nächsttiefere Stufe): Beitrag laut Tabelle
    expect(mit).toBeCloseTo((E.neBeitrag(1300000) + E.neBeitrag(1290000)) / 12, 6);
    expect(mit).toBeGreaterThan(ohne * 4);
  });
  it('eine Hypothek über dem Wert der Liegenschaft senkt das Vermögen, aber nie unter null', () => {
    expect(ne(frueh({ liquiditaet: 0, liegenschaften: [{ typ: 'eigen', verkehrswert: 500000, hypothek: 900000 }] }))).toBeCloseTo((530 / 12) * 2, 6);
  });
  it('Befreiung über den erwerbstätigen Ehegatten: Schwelle = doppelter Mindestbeitrag ÷ 10.6% (B3)', () => {
    const paar = (lohn) => migrate({ haushalt: 'verheiratet', personen: [{ jahrgang: 1966, geburtsmonat: 1, geschlecht: 'm', pensAlter: 60, brutto: 0 }, { jahrgang: 1970, geburtsmonat: 1, geschlecht: 'w', pensAlter: 65, brutto: lohn }], ausgabenRuhestand: 3000, liquiditaet: 300000, inflation: 0, ahvAnpassung: 0 });
    // 2026: Schwelle 10'000; 2027: 10'208
    expect(ne(paar(10100), En, 2026)).toBe(0);
    expect(ne(paar(10100), En, 2027)).toBeGreaterThan(0);
    expect(ne(paar(10300), En, 2027)).toBe(0);
    expect(ne(paar(9900), En, 2026)).toBeGreaterThan(0);
  });
});

describe('Liegenschaft als Reserve (F3)', () => {
  it('zählt nicht, wenn die Hypothek nach der Pensionierung nicht tragbar ist', () => {
    const s = migrate(clone(EXAMPLE)), inp = inpOf(s);
    const amp = E.ampel(inp), tr = E.tragbarkeit(amp.base, inp);
    expect(tr.worst.st).toBe('rot');
    expect(amp.reserveLg).toBeNull();
    // Der Musterfall war nur dank der Liegenschaft grün: jetzt knapp, mit Begründung
    expect(amp.st).toBe('gelb');
    expect(amp.reserveGesperrt.quote).toBeCloseTo(tr.worst.quote, 9);
  });
  it('zählt weiter, wenn die Hypothek tragbar ist', () => {
    const s = migrate(clone(EXAMPLE));
    s.liegenschaften[0].hypothek = 200000;
    const inp = inpOf(s), amp = E.ampel(inp), tr = E.tragbarkeit(amp.base, inp);
    expect(tr.worst.st).not.toBe('rot');
    expect(amp.reserveGesperrt).toBeNull();
  });
  it('die Auswertung liefert die Tragbarkeit für Ergebnis, Tutor und Bericht', () => {
    const R = analyse(migrate(clone(EXAMPLE)), E);
    expect(R.tr.worst.st).toBe('rot');
    expect(R.amp.st).toBe('gelb');
  });
});

describe('Kalenderdatei', () => {
  const L = [
    { id: 'jetzt', ics: true, A: A0, when: 'jetzt', art: 'empfehlung', titel: 'Sofort', text: 't', stelle: 's' },
    { id: 'bald', ics: true, A: A0 + 8, when: 'bald', art: 'frist', titel: 'Später', text: 't', stelle: 's' },
  ];
  const tag = (d) => new Date(Date.UTC(2026, 10, d, 8));
  it('die Erinnerung liegt nie in der Vergangenheit', () => {
    const ics = buildIcs(L, A0, { today: tag(14) });
    const ev = ics.split('BEGIN:VEVENT').slice(1);
    expect(ev[0]).toContain('DTSTART;VALUE=DATE:20261115');
    expect(ev[0]).toContain('TRIGGER:PT9H');
    expect(ev[1]).toContain('TRIGGER:-P7D');
  });
  it('ein erneuter Export verwendet dieselben UID und eine höhere SEQUENCE', () => {
    const uid = (ics) => ics.match(/UID:.*/g), seq = (ics) => +ics.match(/SEQUENCE:(\d+)/)[1];
    const a = buildIcs(L, A0, { today: tag(14) }), b = buildIcs(L, A0, { today: tag(20) });
    expect(uid(a)).toEqual(uid(b));
    expect(new Set(uid(a)).size).toBe(2);
    expect(seq(b)).toBeGreaterThan(seq(a));
  });
});

describe('Richtwerte und Musterbudgets für die Ausgaben (Stufe 1)', () => {
  it('jedes Musterbudget ergibt genau den Richtwert der Karte', async () => {
    const { BUDGET_POS, musterSumme: budgetSumme, STUFEN } = await import('../../../src/lib/pension/budget');
    const A = params.tables.annahmen.data;
    for (const typ of ['single', 'paar']) for (const k of Object.keys(STUFEN)) {
      const b = A.musterbudget[typ][k];
      expect(Object.keys(b).sort(), `${typ}/${k}`).toEqual(BUDGET_POS.map(([p]) => p).sort());
      expect(budgetSumme(b), `${typ}/${k}`).toBe(A.erfahrung[typ][k]);
    }
  });
  it('der Krankenkassen-Richtwert folgt der geprüften mittleren Prämie für Erwachsene, auch im Folgejahr', async () => {
    const { fixHelpers } = await import('../../../src/lib/pension/analyse');
    const A = params.tables.annahmen.data;
    // keine zweite, ungeprüfte Zahl in den Annahmen
    expect(A.fixkosten.single.kk).toBeUndefined();
    expect(A.fixkosten.paar.kk).toBeUndefined();
    const paar = migrate(clone(EXAMPLE)), allein = { ...migrate(clone(EXAMPLE)), haushalt: 'single' };
    expect(P.kk.praemieErw).toBe(465.3);
    expect(fixHelpers(paar, E).def().kk).toBe(931);
    expect(fixHelpers(allein, E).def().kk).toBe(465);
    const E27 = createEngine(resolveParams(params, 2027), A0 + 12);
    expect(fixHelpers(paar, E27).def().kk).toBe(975);
    // Musterbudgets enthalten zusätzlich Franchise und Selbstbehalt: nie unter der reinen Prämie
    for (const [typ, n] of [['single', 1], ['paar', 2]]) for (const b of Object.values(A.musterbudget[typ])) expect(b.kk).toBeGreaterThanOrEqual(n * P.kk.praemieErw);
  });
  it('Puffer zwischen tragbaren und angenommenen Ausgaben', async () => {
    const { pufferText } = await import('../../../src/lib/pension/budget');
    expect(pufferText(8925, 7500)).toBe('Puffer 19%');
    expect(pufferText(6600, 7500)).toBe('es fehlen 12%');
    expect(pufferText(7500, 7500)).toBe('kein Puffer');
    expect(pufferText(5000, 0)).toBe('');
  });
  it('Vergleich der Ausgaben mit dem heutigen Nettolohn', async () => {
    const { ausgabenCheck } = await import('../../../src/lib/pension/analyse');
    const s = migrate(clone(EXAMPLE));
    s.steuerEink = 12;
    s.personen[0].brutto = 120000; s.personen[1].brutto = 0;
    const netto = 10000 * (1 - P.annahmen.sozialabgaben) * 0.88;
    s.ausgabenRuhestand = 6000;
    expect(ausgabenCheck(s, E).netto).toBeCloseTo(netto, 6);
    expect(ausgabenCheck(s, E).st).toBe('ok');
    s.ausgabenRuhestand = 3000;
    expect(ausgabenCheck(s, E).st).toBe('tief');
    s.ausgabenRuhestand = 9000;
    expect(ausgabenCheck(s, E).st).toBe('hoch');
    s.personen[0].brutto = 0;
    expect(ausgabenCheck(s, E)).toBeNull();
    s.personen[0].brutto = 120000; s.ausgabenRuhestand = 0;
    expect(ausgabenCheck(s, E)).toBeNull();
  });
});

describe('Budget-Assistent (Stufe 2)', () => {
  const mieter = () => { const s = migrate(clone(EXAMPLE)); s.liegenschaften = []; s.amortisationen = []; return s; };
  const muster = (typ, k) => ({ ...params.tables.annahmen.data.musterbudget[typ][k] });

  it('Positionen von Budget, Musterbudget und Zustand sind dieselben', async () => {
    const { BUDGET_KEYS } = await import('../../../src/lib/pension/analyse');
    const { BUDGET_POS } = await import('../../../src/lib/pension/budget');
    expect(BUDGET_POS.map(([k]) => k)).toEqual(BUDGET_KEYS);
  });
  it('gilt das Budget, bestimmt seine Summe die Ausgaben; ein Musterbudget ergibt genau den Richtwert', async () => {
    const { applyBudget, budgetSumme } = await import('../../../src/lib/pension/analyse');
    const s = mieter();
    s.budget = muster('paar', 'mittel');
    s.ausgabenRuhestand = 9999;
    applyBudget(s, E);
    expect(s.ausgabenRuhestand).toBe(9999); // nicht übernommen: Betrag bleibt
    s.budgetAktiv = true;
    applyBudget(s, E);
    expect(s.ausgabenRuhestand).toBe(7500);
    s.budget.freizeit += 500;
    applyBudget(s, E);
    expect(s.ausgabenRuhestand).toBe(8000);
    expect(budgetSumme(s, E)).toBe(8000);
  });
  it('ein unvollständiges Budget gilt nie', async () => {
    const { applyBudget } = await import('../../../src/lib/pension/analyse');
    const s = mieter();
    s.budget = muster('paar', 'mittel');
    delete s.budget.pers;
    s.budgetAktiv = true; s.ausgabenRuhestand = 6000;
    applyBudget(s, E);
    expect(s.budgetAktiv).toBe(false);
    expect(s.ausgabenRuhestand).toBe(6000);
  });
  it('Wohnen: beim Eigenheim aus der Liegenschaft, bei Miete aus der erfassten Miete', async () => {
    const { budgetWerte, fixHelpers } = await import('../../../src/lib/pension/analyse');
    const eig = migrate(clone(EXAMPLE));
    eig.budget = muster('paar', 'mittel');
    // 900'000 × 1,8% + 1'600'000 × 0,5% pro Jahr, plus 400 Nebenkosten pro Monat
    expect(budgetWerte(eig, E).wohnen).toBeCloseTo((900000 * 0.018 + 1600000 * 0.005) / 12 + 400, 6);
    expect(budgetWerte(eig, E).wohnen).toBeCloseTo(fixHelpers(eig, E).wohnenMonat(null).v, 6);
    const m = mieter();
    m.budget = muster('paar', 'mittel');
    expect(budgetWerte(m, E).wohnen).toBe(2100);
    m.fix.wohnen = 1800; // im Schritt «Wohnen» erfasste Miete geht vor
    expect(budgetWerte(m, E).wohnen).toBe(1800);
    m.fix = {}; delete m.budget.wohnen;
    expect(budgetWerte(m, E).wohnen).toBe(P.annahmen.fixkosten.paar.miete);
  });
  it('Richtwerte der Fixkosten folgen dem Budget, die Gruppensummen bleiben erhalten', async () => {
    const { fixHelpers } = await import('../../../src/lib/pension/analyse');
    const s = mieter();
    const ohne = fixHelpers(s, E).def();
    s.budget = { ...muster('paar', 'mittel'), kk: 1400, vers: 600, mob: 200 };
    expect(fixHelpers(s, E).def()).toEqual(ohne); // Budget gilt noch nicht
    s.budgetAktiv = true;
    const d = fixHelpers(s, E).def();
    expect(d.kk + d.ges).toBe(1400);
    expect(Math.abs(d.vers + d.komm + d.geb - 600)).toBeLessThanOrEqual(1);
    expect(d.mob).toBe(200);
    expect(d.kk / d.ges).toBeCloseTo(ohne.kk / ohne.ges, 1);
    // eine eigene Angabe bei den Fixkosten geht weiterhin vor
    s.fix.kk = 1000;
    expect(fixHelpers(s, E).uebrigeFix()).toBe(1000 + d.vers + d.komm + d.geb + d.mob + d.ges + d.sonst);
  });
  it('das nächste Musterbudget richtet sich nach dem bisherigen Betrag', async () => {
    const { naechstesMuster } = await import('../../../src/lib/pension/analyse');
    const s = mieter();
    for (const [a, k] of [[0, 'mittel'], [5200, 'bescheiden'], [7000, 'mittel'], [10000, 'gehoben'], [20000, 'gehoben']]) { s.ausgabenRuhestand = a; expect(naechstesMuster(s, E), String(a)).toBe(k); }
    s.haushalt = 'single'; s.ausgabenRuhestand = 3600;
    expect(naechstesMuster(s, E)).toBe('bescheiden');
  });
  it('Budget reist im Link mit; Fremdes und Unvollständiges wird bereinigt', async () => {
    const { encodeCode, decodeCode, sanitize } = await import('../../../src/lib/pension/state');
    const s = mieter();
    s.budget = muster('paar', 'gehoben'); s.budgetAktiv = true;
    const z = decodeCode(encodeCode(s));
    expect(z.budget).toEqual(s.budget);
    expect(z.budgetAktiv).toBe(true);
    const b = sanitize({ budget: { kk: '<img src=x>', haushalt: -5, mob: 1e12, fremd: 1, vers: 300 }, budgetAktiv: true });
    expect(b.budget).toEqual({ haushalt: 0, mob: 1e6, vers: 300 });
    expect(b.budgetAktiv).toBe(false);
    expect(sanitize({ budgetAktiv: 'ja' }).budgetAktiv).toBe(false);
    expect(sanitize({}).budget).toEqual({});
    // Grundlage des Budgets: nur bekannte Beispiele, nur zusammen mit einem Budget
    expect(sanitize({ budget: { kk: 1 }, budgetBasis: 'gehoben' }).budgetBasis).toBe('gehoben');
    expect(sanitize({ budget: { kk: 1 }, budgetBasis: '<b>' }).budgetBasis).toBe('');
    expect(sanitize({ budgetBasis: 'mittel' }).budgetBasis).toBe('');
  });
});
