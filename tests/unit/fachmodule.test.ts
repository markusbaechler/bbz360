import { describe, it, expect } from 'vitest';
import params from '../../public/data/params.json';
import { ANTEILE, UVG_MAX_VERDIENST, PK_LEER, absicherung } from '../../src/lib/absicherung';
import type { AbsicherungEingaben } from '../../src/lib/absicherung';
import { bruchText, erbteilung, nachlassAnnahme, reinvermoegen } from '../../src/lib/nachlass';
import { abzugErsparnis, kapitalStaffelung } from '../../src/lib/steuern';
import { analyse } from '../../src/lib/pension/analyse';
import { createEngine } from '../../src/lib/pension/engine';
import { resolveParams, nextParams } from '../../src/lib/pension/params';
import { EXAMPLE, clone, sanitize } from '../../src/lib/pension/state';
import type { ParamDatei, PensState } from '../../src/lib/pension/typen';

const A0 = 2026 * 12 + 10;
const daten = params as unknown as ParamDatei;
const E = createEngine(resolveParams(daten, 2026), A0, nextParams(daten, 2026));
const muster = (o: Record<string, unknown> = {}): PensState => sanitize({ ...clone(EXAMPLE), ...o });

describe('Steuern (07d)', () => {
  const S = muster();
  const R = analyse(S, E, undefined, {});
  if (R.leer) throw new Error('leer');
  it('Kapitalbezüge je Jahr; die Steuer wie geplant stimmt mit dem Rechenkern überein', () => {
    const k = kapitalStaffelung(R, S, E);
    expect(k.jahre.length).toBeGreaterThan(1);
    expect(k.total).toBeCloseTo(k.jahre.reduce((x, j) => x + j.betrag, 0), 6);
    expect(k.steuerGeplant).toBeCloseTo(R.base.kapSteuerTotal, 4);
    expect(k.jahre.map((j) => j.jahr)).toEqual([...k.jahre.map((j) => j.jahr)].sort((a, b) => a - b));
  });
  it('alles im selben Jahr kostet am meisten, jeder Bezug einzeln am wenigsten (Progression)', () => {
    const k = kapitalStaffelung(R, S, E);
    expect(k.steuerEinJahr).toBeGreaterThan(k.steuerGeplant);
    expect(k.steuerEinzeln).toBeLessThanOrEqual(k.steuerGeplant + 1e-6);
    expect(k.steuerEinJahr).toBeCloseTo(E.kapSteuer('ZH', k.total, true), 6);
  });
  it('Unverheiratete werden je Person besteuert', () => {
    const K = muster({ haushalt: 'konkubinat' });
    const RK = analyse(K, E, undefined, {});
    if (RK.leer) throw new Error('leer');
    const k = kapitalStaffelung(RK, K, E);
    const je = [0, 1].map((i) => k.jahre.flatMap((j) => j.bezuege).filter((x) => x.person === i).reduce((x, y) => x + y.betrag, 0));
    expect(k.steuerEinJahr).toBeCloseTo(E.kapSteuer('ZH', je[0], false) + E.kapSteuer('ZH', je[1], false), 6);
  });
  it('Abzüge: ohne Grenzsteuersatz keine Ersparnis; mit Satz Betrag × Satz', () => {
    const ohne = abzugErsparnis(S, E, R, '', 50000, 2027);
    const max = E.P.s3a.maxMitPK; // Höchstbetrag des Rechnungsjahrs 2026
    expect(max).toBe(7258);
    expect(ohne.s3a).toEqual([max, max]);
    expect(ohne.s3aErsparnis).toBeNull();
    expect(ohne.einkaufErsparnis).toBeNull();
    const mit = abzugErsparnis(S, E, R, 30, 50000, 2027);
    expect(mit.s3aErsparnis).toBeCloseTo(2 * max * 0.3, 6);
    expect(mit.einkaufErsparnis).toBe(15000);
  });
  it('A15: Sperrfrist drei Jahre ab Einkauf, vorsichtig bis und mit dem dritten Folgejahr', () => {
    // Musterfall: PK-Kapital Person 1 bei der Pensionierung mit 58 (2030)
    const pkJahr = R.base.kapListe.find((k) => /^PK-/.test(k.art))!.year;
    // Einkauf drei Kalenderjahre vor dem Bezug: je nach Datum noch in der Frist (vorher: «nicht verletzt»)
    expect(abzugErsparnis(S, E, R, 30, 50000, pkJahr - 3)).toMatchObject({ sperrfristBis: pkJahr, sperrfristVerletzt: true, sperrfristJahre: [pkJahr] });
    expect(abzugErsparnis(S, E, R, 30, 50000, pkJahr - 1).sperrfristVerletzt).toBe(true);
    expect(abzugErsparnis(S, E, R, 30, 50000, pkJahr).sperrfristVerletzt).toBe(true);
    // vier Jahre davor: sicher ausserhalb
    expect(abzugErsparnis(S, E, R, 30, 50000, pkJahr - 4)).toMatchObject({ sperrfristBis: pkJahr - 1, sperrfristVerletzt: false, sperrfristJahre: [] });
    expect(abzugErsparnis(S, E, R, 30, 0, 2027).sperrfristBis).toBeNull();
  });
  it('B12: ein Einkauf nach dem Bezug löst keine Sperrfrist-Meldung aus', () => {
    const pkJahr = R.base.kapListe.find((k) => /^PK-/.test(k.art))!.year;
    expect(abzugErsparnis(S, E, R, 30, 50000, pkJahr + 2).sperrfristVerletzt).toBe(false);
    expect(abzugErsparnis(S, E, R, 30, 50000, pkJahr + 15).sperrfristVerletzt).toBe(false);
  });
  it('B16: keine 3a-Einzahlung für eine Person, die die geplante Pensionierung schon erreicht hat', () => {
    const P = muster({ personen: [{ ...clone(EXAMPLE).personen[0], jahrgang: 1960, pensAlter: 64 }, clone(EXAMPLE).personen[1]] });
    expect(abzugErsparnis(P, E, null, 30, 0, '').s3a[0]).toBe(0);
    expect(abzugErsparnis(P, E, null, 30, 0, '').s3a[1]).toBeGreaterThan(0);
  });
});

describe('Absicherung (07e)', () => {
  const eing = (o: Partial<AbsicherungEingaben> = {}): AbsicherungEingaben => { const e = { kinder: 2, ursache: 'krankheit' as const, bedarfMonat: 0, pk: [{ ...PK_LEER }, { ...PK_LEER }] as [typeof PK_LEER, typeof PK_LEER], ...o }; return { ...e, kinderAbh: o.kinderAbh ?? e.kinder }; };
  const S = muster({ ausgabenHeute: 12000 }); // P1 m 160'000, P2 w 45'000 (Jahrgang 1970), verheiratet
  const rente1 = E.ahvMonat(S.personen[0]) * 12;
  const fall = (r: ReturnType<typeof absicherung>, person: number, ereignis: 'invalid' | 'tod') => r.faelle.find((f) => f.person === person && f.ereignis === ereignis)!;
  const betrag = (f: ReturnType<typeof fall>, label: RegExp) => f.posten.find((p) => label.test(p.label))?.betrag ?? 0;

  it('Bedarf: heutige Ausgaben, sonst 80% des Nettoeinkommens, eine Eingabe geht vor', () => {
    expect(absicherung(S, E, eing())).toMatchObject({ bedarf: 144000, bedarfQuelle: 'ausgaben' });
    expect(absicherung(S, E, eing({ bedarfMonat: 9000 }))).toMatchObject({ bedarf: 108000, bedarfQuelle: 'eingabe' });
    const ohne = absicherung(muster(), E, eing());
    expect(ohne.bedarfQuelle).toBe('netto');
    expect(ohne.bedarf).toBeCloseTo((160000 + 45000) * 0.87 * 0.88 * 0.8, 4);
  });
  it('Invalidität bei Krankheit: IV-Rente = geschätzte Altersrente, Kinderrenten 40% je Kind, PK laut Ausweis', () => {
    const r = absicherung(S, E, eing({ pk: [{ ...PK_LEER, ivRente: 40000, kinderRente: 8000 }, { ...PK_LEER }] }));
    const f = fall(r, 0, 'invalid');
    expect(betrag(f, /^IV-Rente$/)).toBeCloseTo(rente1, 6);
    expect(betrag(f, /IV-Kinderrenten/)).toBeCloseTo(rente1 * 0.4 * 2, 6);
    expect(betrag(f, /Pensionskasse/)).toBe(56000);
    expect(betrag(f, /Nettolohn Person 2/)).toBeCloseTo(45000 * 0.87 * 0.88, 6);
    expect(f.summe).toBeCloseTo(f.posten.reduce((x, p) => x + p.betrag, 0), 6);
    expect(f.luecke).toBeCloseTo(144000 - f.summe, 6);
    expect(betrag(f, /UVG/)).toBe(0);
  });
  it('Pensionskasse ist auf 90% des Lohns begrenzt (zusammen mit den übrigen Renten)', () => {
    const r = absicherung(S, E, eing({ pk: [{ ...PK_LEER, ivRente: 120000 }, { ...PK_LEER }] }));
    const f = fall(r, 0, 'invalid');
    expect(betrag(f, /Pensionskasse/)).toBeCloseTo(0.9 * 160000 - rente1 * 1.8, 6);
    expect(f.hinweise.join(' ')).toMatch(/gekürzt/);
  });
  it('Unfall: UVG 80% des versicherten Verdienstes (höchstens 148’200), mit IV zusammen höchstens 90%', () => {
    const r = absicherung(S, E, eing({ ursache: 'unfall', kinder: 0 }));
    const f = fall(r, 0, 'invalid');
    expect(UVG_MAX_VERDIENST).toBe(148200);
    expect(betrag(f, /UVG-Invalidenrente/)).toBeCloseTo(Math.min(0.8 * 148200, 0.9 * 148200 - rente1), 6);
    expect(f.hinweise.join(' ')).toMatch(/über dem UVG-Höchstverdienst/);
    // mit Kindern greift die Komplementärgrenze
    const g = fall(absicherung(S, E, eing({ ursache: 'unfall', kinder: 3 })), 0, 'invalid');
    expect(betrag(g, /^IV-Rente$/) + betrag(g, /IV-Kinderrenten/) + betrag(g, /UVG/)).toBeCloseTo(Math.max(0.9 * 148200, rente1 * 2.2), 4);
  });
  it('Tod: Witwenrente 80%, Waisenrenten 40% je Kind; Todesfallkapital getrennt ausgewiesen', () => {
    const r = absicherung(S, E, eing({ pk: [{ ...PK_LEER, partnerRente: 24000, kinderRente: 8000, todesfallKapital: 100000 }, { ...PK_LEER }] }));
    const f = fall(r, 0, 'tod');
    expect(betrag(f, /AHV-Witwenrente/)).toBeCloseTo(rente1 * ANTEILE.witwe, 6);
    expect(betrag(f, /AHV-Waisenrenten/)).toBeCloseTo(rente1 * 0.4 * 2, 6);
    expect(betrag(f, /Pensionskasse/)).toBe(40000);
    expect(f.kapital).toBe(100000);
    // stirbt Person 2 (Frau), bleibt ein Witwer mit Kindern: Anspruch
    expect(betrag(fall(r, 1, 'tod'), /AHV-Witwerrente/)).toBeGreaterThan(0);
  });
  it('Anspruch vereinfacht: ohne Kinder nur die Witwe ab 45; Konkubinat ohne AHV-Hinterlassenenrente', () => {
    const ohneKinder = absicherung(S, E, eing({ kinder: 0 }));
    expect(betrag(fall(ohneKinder, 0, 'tod'), /AHV-Witwenrente/)).toBeGreaterThan(0); // Witwe, 56-jährig
    expect(betrag(fall(ohneKinder, 1, 'tod'), /AHV-Witwerrente/)).toBe(0);            // Witwer ohne Kinder
    expect(fall(ohneKinder, 1, 'tod').hinweise.join(' ')).toMatch(/Kein Anspruch/);
    const K = absicherung(muster({ haushalt: 'konkubinat', ausgabenHeute: 12000 }), E, eing());
    expect(betrag(fall(K, 0, 'tod'), /AHV-Witwenrente/)).toBe(0);
    expect(betrag(fall(K, 0, 'tod'), /AHV-Waisenrenten/)).toBeGreaterThan(0);
    expect(fall(K, 0, 'tod').hinweise.join(' ')).toMatch(/Konkubinat/);
  });
  it('Alleinstehende ohne Kinder: nur der Fall Invalidität', () => {
    const r = absicherung(muster({ haushalt: 'single' }), E, eing({ kinder: 0 }));
    expect(r.faelle.map((f) => [f.person, f.ereignis])).toEqual([[0, 'invalid']]);
    expect(r.hinweis).toBe('');
  });
  it('Unfalltod: Ehegatte 40% und 15% je Kind, höchstens 70%, mit AHV zusammen höchstens 90%', () => {
    const r = absicherung(S, E, eing({ ursache: 'unfall', kinder: 1 }));
    const f = fall(r, 0, 'tod');
    const ahv = rente1 * (0.8 + 0.4);
    expect(betrag(f, /UVG-Hinterlassenenrenten/)).toBeCloseTo(Math.max(0, Math.min(0.55 * 148200, 0.9 * 148200 - ahv)), 6);
  });
});

describe('Absicherung: Befunde A12, A13, B13', () => {
  const pk = [{ ...PK_LEER }, { ...PK_LEER }] as [typeof PK_LEER, typeof PK_LEER];
  // junges Paar: P1 Mann 1988, P2 Frau 1990 (36-jährig), verheiratet
  const jung = (o: Record<string, unknown> = {}) => muster({ personen: [{ ...clone(EXAMPLE).personen[0], jahrgang: 1988 }, { ...clone(EXAMPLE).personen[1], jahrgang: 1990 }], ausgabenHeute: 9000, ...o });
  const fall = (r: ReturnType<typeof absicherung>, person: number, ereignis: 'invalid' | 'tod') => r.faelle.find((f) => f.person === person && f.ereignis === ereignis)!;
  const betrag = (f: ReturnType<typeof fall>, label: RegExp) => f.posten.find((p) => label.test(p.label))?.betrag ?? 0;

  it('A12: Unfalltod ohne Kinder — keine UVG-Rente für die Witwe unter 45 und für den Witwer (vorher 40% des Lohns)', () => {
    const r = absicherung(jung(), E, { kinder: 0, kinderAbh: 0, ursache: 'unfall', bedarfMonat: 0, pk });
    expect(betrag(fall(r, 0, 'tod'), /UVG-Hinterlassenenrenten/)).toBe(0);
    expect(fall(r, 0, 'tod').hinweise.join(' ')).toMatch(/Keine UVG-Rente für die Witwe .*einmalige Abfindung/);
    expect(betrag(fall(r, 1, 'tod'), /UVG-Hinterlassenenrenten/)).toBe(0);
    expect(fall(r, 1, 'tod').hinweise.join(' ')).toMatch(/Keine UVG-Rente für den Witwer/);
  });
  it('A12: mit rentenberechtigten Kindern erhalten Witwe und Witwer die UVG-Rente; die Witwe auch mit erwachsenen Kindern oder ab 45', () => {
    const mitKind = absicherung(jung(), E, { kinder: 1, kinderAbh: 1, ursache: 'unfall', bedarfMonat: 0, pk });
    expect(betrag(fall(mitKind, 0, 'tod'), /UVG-Hinterlassenenrenten/)).toBeGreaterThan(0);
    expect(betrag(fall(mitKind, 1, 'tod'), /UVG-Hinterlassenenrenten/)).toBeGreaterThan(0);
    const erwachsen = absicherung(jung(), E, { kinder: 2, kinderAbh: 0, ursache: 'unfall', bedarfMonat: 0, pk });
    expect(betrag(fall(erwachsen, 0, 'tod'), /UVG-Hinterlassenenrenten/)).toBeGreaterThan(0); // Witwe mit erwachsenen Kindern
    expect(betrag(fall(erwachsen, 1, 'tod'), /UVG-Hinterlassenenrenten/)).toBe(0);            // Witwer ohne rentenberechtigte Kinder
    // Musterfall: Witwe 56-jährig, kinderlos
    const ab45 = absicherung(muster({ ausgabenHeute: 9000 }), E, { kinder: 0, kinderAbh: 0, ursache: 'unfall', bedarfMonat: 0, pk });
    expect(betrag(fall(ab45, 0, 'tod'), /UVG-Hinterlassenenrenten/)).toBeGreaterThan(0);
  });
  it('A13: für die AHV zählen Kinder gleich welchen Alters — Witwe unter 45 und Witwer mit erwachsenen Kindern haben Anspruch', () => {
    const r = absicherung(jung(), E, { kinder: 2, kinderAbh: 0, ursache: 'krankheit', bedarfMonat: 0, pk });
    expect(betrag(fall(r, 0, 'tod'), /AHV-Witwenrente/)).toBeGreaterThan(0);
    expect(betrag(fall(r, 1, 'tod'), /AHV-Witwerrente/)).toBeGreaterThan(0);
    // erwachsene Kinder lösen keine Waisen- oder Kinderrenten aus
    expect(fall(r, 0, 'tod').posten.some((p) => /Waisenrenten/.test(p.label))).toBe(false);
    expect(fall(r, 0, 'invalid').posten.some((p) => /Kinderrenten/.test(p.label))).toBe(false);
    // ohne Kinder: Witwe unter 45 und Witwer ohne Anspruch
    const ohne = absicherung(jung(), E, { kinder: 0, kinderAbh: 0, ursache: 'krankheit', bedarfMonat: 0, pk });
    expect(betrag(fall(ohne, 0, 'tod'), /AHV-Witwenrente/)).toBe(0);
    expect(betrag(fall(ohne, 1, 'tod'), /AHV-Witwerrente/)).toBe(0);
  });
  it('«davon unter 18 oder in Ausbildung» kann nicht grösser sein als die Zahl der Kinder', () => {
    const r = absicherung(jung(), E, { kinder: 1, kinderAbh: 5, ursache: 'krankheit', bedarfMonat: 0, pk });
    expect(fall(r, 0, 'tod').posten.find((p) => /Waisenrenten/.test(p.label))!.label).toBe('AHV-Waisenrenten (1)');
  });
  it('B13: Pensionierte und Personen ohne Lohn werden nicht als «wird invalid» gerechnet; leerer Stand ergibt einen Hinweis', () => {
    const rentner = muster({ personen: [{ ...clone(EXAMPLE).personen[0], jahrgang: 1955, brutto: 0 }, { ...clone(EXAMPLE).personen[1], jahrgang: 1956, brutto: 0 }] });
    const r = absicherung(rentner, E, { kinder: 0, kinderAbh: 0, ursache: 'krankheit', bedarfMonat: 0, pk });
    expect(r.faelle).toEqual([]);
    expect(r.hinweis).toMatch(/Keine Person des Haushalts ist heute erwerbstätig/);
    // 66-jährig mit Lohn: über dem Referenzalter → kein Fall
    const alt = muster({ personen: [{ ...clone(EXAMPLE).personen[0], jahrgang: 1960 }, { ...clone(EXAMPLE).personen[1], brutto: 0 }] });
    expect(absicherung(alt, E, { kinder: 0, kinderAbh: 0, ursache: 'krankheit', bedarfMonat: 0, pk }).faelle).toEqual([]);
    // nur Person 1 erwerbstätig: nur ihre Fälle
    const eine = muster({ personen: [clone(EXAMPLE).personen[0], { ...clone(EXAMPLE).personen[1], brutto: 0 }] });
    expect(absicherung(eine, E, { kinder: 0, kinderAbh: 0, ursache: 'krankheit', bedarfMonat: 0, pk }).faelle.map((f) => f.person)).toEqual([0, 0]);
  });
  it('B13: hat die hinterbliebene Person das Referenzalter erreicht, wird keine Witwenrente dazugezählt', () => {
    const S = muster({ personen: [clone(EXAMPLE).personen[0], { ...clone(EXAMPLE).personen[1], jahrgang: 1958, brutto: 0 }] });
    const r = absicherung(S, E, { kinder: 0, kinderAbh: 0, ursache: 'krankheit', bedarfMonat: 0, pk });
    expect(betrag(fall(r, 0, 'tod'), /AHV-Witwenrente/)).toBe(0);
    expect(fall(r, 0, 'tod').hinweise.join(' ')).toMatch(/Referenzalter erreicht/);
  });
  it('Konkubinat: keine Zeile «Witwenrente», Hinweis nennt AHV und UVG', () => {
    const K = absicherung(jung({ haushalt: 'konkubinat' }), E, { kinder: 1, kinderAbh: 1, ursache: 'unfall', bedarfMonat: 0, pk });
    const f = fall(K, 0, 'tod');
    expect(f.posten.some((p) => /Witwe/.test(p.label))).toBe(false);
    expect(betrag(f, /AHV-Waisenrenten/)).toBeGreaterThan(0);
    // UVG: nur das Kind (15%), kein Ehegattenanteil
    expect(f.hinweise.join(' ')).toMatch(/weder eine AHV- noch eine UVG-Rente/);
  });
});

describe('Nachlass (07f)', () => {
  const t = (zivil: PensState['haushalt'], kinder: number, elternStamm: boolean) => erbteilung({ zivil, kinder, elternStamm, nachlass: 800000 });
  const kurz = (r: ReturnType<typeof erbteilung>) => r.erben.map((e) => [e.wer.split(' ')[0], bruchText(e.gesetzlich), bruchText(e.pflichtteil)]);
  it('verheiratet mit Kindern: je 1/2, Pflichtteile je 1/4, frei 1/2', () => {
    const r = t('verheiratet', 2, true);
    expect(kurz(r)).toEqual([['Ehegatte', '1/2', '1/4'], ['Nachkommen', '1/2', '1/4']]);
    expect(bruchText(r.frei)).toBe('1/2');
    expect(r.erben[0]).toMatchObject({ betrag: 400000, pflichtBetrag: 200000 });
    expect(r.freiBetrag).toBe(400000);
    expect(r.hinweise.join(' ')).toMatch(/Art\. 473 ZGB/);
  });
  it('verheiratet ohne Kinder: 3/4 und 1/4 mit elterlichem Stamm (Eltern ohne Pflichtteil), sonst alles', () => {
    const r = t('verheiratet', 0, true);
    expect(kurz(r)).toEqual([['Ehegatte', '3/4', '3/8'], ['Eltern', '1/4', '0']]);
    expect(bruchText(r.frei)).toBe('5/8');
    const allein = t('verheiratet', 0, false);
    expect(kurz(allein)).toEqual([['Ehegatte', 'alles', '1/2']]);
  });
  it('unverheiratet: Nachkommen alles (Pflichtteil 1/2); ohne Nachkommen die Eltern ohne Pflichtteil', () => {
    expect(kurz(t('single', 1, true))).toEqual([['Kind', 'alles', '1/2']]);
    const r = t('konkubinat', 0, true);
    expect(kurz(r)).toEqual([['Eltern', 'alles', '0']]);
    expect(bruchText(r.frei)).toBe('alles');
    expect(r.hinweise.join(' ')).toMatch(/Konkubinatspartner/);
    expect(kurz(t('single', 0, false))[0][1]).toBe('alles');
  });
  it('Pflichtteile und freie Quote ergeben zusammen den Nachlass', () => {
    for (const z of ['verheiratet', 'konkubinat', 'single'] as const) for (const k of [0, 1, 3]) for (const e of [true, false]) {
      const r = t(z, k, e);
      expect(r.erben.reduce((x, y) => x + y.pflichtBetrag, 0) + r.freiBetrag).toBeCloseTo(800000, 6);
      expect(r.erben.reduce((x, y) => x + y.betrag, 0)).toBeCloseTo(800000, 6);
    }
  });
  it('Reinvermögen und Annahme für den Nachlass', () => {
    const S = muster(); // 100'000 + 300'000 + (1'600'000 − 900'000)
    expect(reinvermoegen(S)).toBe(1100000);
    expect(nachlassAnnahme(S)).toBe(550000);
    expect(nachlassAnnahme(muster({ haushalt: 'single' }))).toBe(1100000);
  });
});
