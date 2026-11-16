// @ts-nocheck — Referenztest, unverändert aus PensCheck (tests/params.test.js, Stand 4830eff) übernommen.
import { describe, it, expect } from 'vitest';
import data from '../../../public/data/params.json';
import { normalize, matches, htmlToText, bestaetigt, mangel, musterMitKontext } from '../../../scripts/verify-sources.mjs';
import { plausibel } from '../../../scripts/update-kapsteuer.mjs';
import { resolveParams } from '../../../src/lib/pension/params';

const sourceIds = (refs, year, allYears) => new Set((refs || []).filter((r) => (r.years || allYears).includes(year)).map((r) => r.id));

describe('Quellenangaben in params.json', () => {
  it('jede referenzierte Quelle ist mit https-URL definiert', () => {
    const refs = [
      ...Object.values(data.params).flatMap((p) => p.sources || []),
      ...Object.values(data.tables || {}).flatMap((t) => t.sources || []),
      ...(data.watch || []).map((w) => ({ id: w.source })),
    ];
    for (const r of refs) {
      expect(data.sources[r.id], `Quelle ${r.id}`).toBeTruthy();
      expect(data.sources[r.id].url).toMatch(/^https:\/\//);
    }
  });

  it('jeder gesetzliche Wert hat pro Gültigkeitsjahr mindestens zwei unabhängige Quellen, davon mindestens eine amtliche', () => {
    for (const [key, p] of Object.entries(data.params)) {
      if (p.kind !== 'gesetz' && p.kind !== 'statistik') continue;
      const years = Object.keys(p.values).map(Number);
      // massgebend sind die Jahre ab 2026 (bzw. das jüngste ältere, das 2026 noch gilt)
      const relevant = years.filter((y) => y >= 2026);
      const base = years.filter((y) => y <= 2026).sort((a, b) => b - a)[0];
      if (base != null) relevant.push(base);
      for (const y of new Set(relevant)) {
        const ids = sourceIds(p.sources, y, years);
        expect(ids.size, `${key} (${y}): ${[...ids].join(', ')}`).toBeGreaterThanOrEqual(2);
        expect([...ids].some((id) => data.sources[id].official), `${key} (${y}) ohne amtliche Quelle`).toBe(true);
        // Gesetzliche Werte: Quellen verschiedener Herausgeber (Statistik: das BFS ist die einzige amtliche Stelle)
        const pubs = new Set([...ids].map((id) => data.sources[id].publisher));
        if (p.kind === 'gesetz') expect(pubs.size, `${key} (${y}): Quellen vom selben Herausgeber`).toBeGreaterThanOrEqual(2);
      }
      for (const r of p.sources) expect((r.match || []).length, `${key}/${r.id} ohne Suchmuster`).toBeGreaterThan(0);
    }
  });

  it('die Krankenkassenprämie ist pro Jahr amtlich und von einem unabhängigen Herausgeber belegt', () => {
    const p = data.params['kk.praemieErw'];
    for (const y of Object.keys(p.values).map(Number)) {
      const ids = [...sourceIds(p.sources, y, [])];
      expect(ids.some((id) => data.sources[id].official), `${y} ohne amtliche Quelle`).toBe(true);
      expect(ids.some((id) => !data.sources[id].official && data.sources[id].publisher !== 'BAG'), `${y} ohne unabhängige Quelle`).toBe(true);
    }
  });

  it('gesetzliche Tabellen haben mindestens zwei Quellen, amtliche Statistiken die Schnittstelle der ESTV, Schätzungen mindestens eine', () => {
    for (const [key, t] of Object.entries(data.tables)) {
      const n = new Set((t.sources || []).map((s) => s.id)).size;
      if (t.kind === 'gesetz') expect(n, key).toBeGreaterThanOrEqual(2);
      // amtliche Statistik: eine einzige Quelle, die ESTV selbst; sie wird täglich über die Schnittstelle abgeglichen
      if (t.kind === 'amtlich') expect((t.sources || []).some((s) => data.sources[s.id].api && data.sources[s.id].official), key).toBe(true);
      if (t.kind === 'schaetzung') expect(n, key).toBeGreaterThanOrEqual(1);
    }
  });

  it('Werte sind plausibel und konsistent', () => {
    for (const y of [2026, 2027]) {
      const P = resolveParams(data, y);
      expect(P.ahv.maxRente).toBe(2 * P.ahv.minRente);
      expect(P.ahv.plafondEhepaar).toBe(1.5 * P.ahv.maxRente);
      expect(P.ahv.einkMin).toBe(12 * P.ahv.minRente);
      expect(P.ahv.einkMax).toBe(6 * P.ahv.einkMin);
      expect(P.s3a.maxMitPK).toBeGreaterThan(6000);
      expect(P.ne.max).toBeGreaterThan(P.ne.min * 40);
      expect(P.le65.m).toBeGreaterThan(18);
      expect(P.le65.w).toBeGreaterThan(P.le65.m);
    }
  });
});

describe('Regeln der Quellenprüfung', () => {
  it('jedes Suchmuster hat Kontext: ein Wort oder eine Tabellenzeile, nie eine einzelne Zahl', () => {
    for (const t of ['re:1260', '1280', 're:\\b530\\b', 're:541\\.00', 're:(?<![\\d,])6,8(?![\\d])', 're:(?<![\\d,])10,8(?![\\d])', 're:8950000', 're:1 ?260', 're:8 ?950 ?000', 're:\\b27 ?050\\b']) expect(musterMitKontext(t), t).toBe(false);
    for (const t of ['re:bis 15 ?120 1 ?260\\b', 're:45 ?360 1 ?915 2 ?298']) expect(musterMitKontext(t), t).toBe(true);
    for (const t of ['re:Minimale Altersrente 1280 Fr', 're:5,7\\s+6,2\\s+1\\s+6,8\\s+7,4', 're:ab\\s+8950000\\s+21750\\b', '2’520 Franken']) expect(musterMitKontext(t), t).toBe(true);
    for (const [key, p] of Object.entries({ ...data.params, ...data.tables })) {
      for (const r of p.sources || []) {
        if (data.sources[r.id].api) continue;
        expect((r.match || []).length, `${key}/${r.id} ohne Suchmuster`).toBeGreaterThan(0);
        for (const m of r.match) expect(musterMitKontext(m), `${key}/${r.id}: «${m}» ist eine nackte Zahl`).toBe(true);
      }
    }
  });
  it('bestätigt heisst: zwei Quellen, davon eine, die zugleich amtlich ist und laufend nachgeführt wird', () => {
    expect(bestaetigt({ confirmed: 2, official: 1, live: 1, amtlichLaufend: 1, total: 3 })).toBe(true);
    expect(bestaetigt({ confirmed: 1, official: 1, live: 1, amtlichLaufend: 1, total: 3 })).toBe(false);
    expect(bestaetigt({ confirmed: 2, official: 0, live: 2, amtlichLaufend: 0, total: 2 })).toBe(false);
    expect(bestaetigt({ confirmed: 2, official: 2, live: 0, amtlichLaufend: 0, total: 2 })).toBe(false);
    // feste Fedlex-Fassung (amtlich, eingefroren) plus nicht amtliche laufende Quelle: nicht bestätigt
    expect(bestaetigt({ confirmed: 2, official: 1, live: 1, amtlichLaufend: 0, total: 2 })).toBe(false);
    expect(bestaetigt({ confirmed: 2, official: 1, live: 1, total: 2 })).toBe(false);
    expect(mangel({ confirmed: 2, official: 1, live: 1, amtlichLaufend: 0, total: 2 })).toMatch(/amtlich ist und laufend/);
    expect(mangel({ confirmed: 2, official: 1, live: 1, amtlichLaufend: 1, total: 2 })).toBe('');
    expect(mangel({ confirmed: 2, official: 0, live: 2, total: 2 })).toMatch(/keine amtliche/);
    expect(mangel({ confirmed: 2, official: 2, live: 0, total: 2 })).toMatch(/feste Fassungen/);
  });
  it('jeder gesetzliche Wert und jede gesetzliche Tabelle hat pro Jahr eine Quelle, die amtlich ist und laufend nachgeführt wird', () => {
    const amtlichLaufend = (id) => data.sources[id].official && !data.sources[id].fassung;
    for (const [key, p] of Object.entries(data.params)) {
      if (p.kind !== 'gesetz') continue;
      const years = Object.keys(p.values).map(Number);
      for (const y of years.filter((x) => x >= 2026).concat(years.filter((x) => x <= 2026).sort((a, b) => b - a).slice(0, 1))) {
        const ids = [...sourceIds(p.sources, y, years)];
        expect(ids.some(amtlichLaufend), `${key} (${y}): keine amtliche, laufend nachgeführte Quelle`).toBe(true);
      }
    }
    for (const [key, t] of Object.entries(data.tables)) {
      if (t.kind !== 'gesetz' && t.kind !== 'amtlich') continue;
      expect((t.sources || []).some((r) => amtlichLaufend(r.id)), `${key}: keine amtliche, laufend nachgeführte Quelle`).toBe(true);
    }
  });
  it('Fedlex-Quellen sind als feste Fassung gekennzeichnet', () => {
    for (const [id, s] of Object.entries(data.sources)) if (/fedlex/.test(s.url)) expect(s.fassung, id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('Übergangsgeneration: Die Suchmuster prüfen die Kürzungssätze, nicht nur den Artikel', () => {
    const refs = data.tables['ahv.uebergang'].sources;
    const alle = refs.flatMap((r) => r.match).join(' ');
    for (const satz of ['2,5', '3,5', '4,5', '6,5', '10,5']) expect(alle).toContain(satz);
    expect(alle).toContain('62\\. Altersjahr');
    // Die laufend nachgeführte amtliche Quelle (BSV-Berechnungsvorschriften, Tabelle 6.3.2) prüft die Sätze selbst,
    // nicht die Einkommensgrenzen des Rentenzuschlags.
    const bsv = refs.find((r) => r.id === 'bsv-vorbezug-2027').match.join(' ');
    expect(bsv).toContain('6\\.3\\.2');
    for (const zeile of ['0,0 0,0 2,0 3,0', '0,0 2,5 4,5 6,5', '0,0 3,5 6,5 10,5']) expect(bsv).toContain(zeile);
    const { saetze } = data.tables['ahv.uebergang'].data;
    const de = (x) => x.toFixed(1).replace('.', ',');
    for (const band of saetze) expect(bsv).toContain(`0,0 ${band.map(de).join(' ')}`);
  });
});

describe('Kapitalbezugssteuer: Plausibilität vor der Übernahme', () => {
  const alt = data.tables.kapSteuer.data;
  const kopie = () => JSON.parse(JSON.stringify(alt));
  it('die geltende Tabelle ist plausibel', () => expect(plausibel(alt, alt)).toEqual([]));
  it('erkennt Sprünge, sinkende Steuer, fehlende Kantone und unsinnige Sätze', () => {
    let n = kopie(); n.kantone.ZH.ledig[4] = Math.round(n.kantone.ZH.ledig[4] * 1.6);
    expect(plausibel(n, alt).join(' ')).toMatch(/ZH ledig 200000.*±30%/);
    n = kopie(); n.kantone.BE.verheiratet[5] = n.kantone.BE.verheiratet[3] - 1;
    expect(plausibel(n, alt).join(' ')).toMatch(/BE verheiratet 300000: Steuer sinkt/);
    n = kopie(); delete n.kantone.TI;
    expect(plausibel(n, alt).join(' ')).toMatch(/25 statt 26 Kantone/);
    n = kopie(); n.kantone.GE.ledig = n.kantone.GE.ledig.map(() => 0);
    expect(plausibel(n, alt).length).toBeGreaterThan(0);
    n = kopie(); n.kantone.SG.verheiratet[8] = n.kantone.SG.ledig[8] * 2;
    expect(plausibel(n, alt).join(' ')).toMatch(/SG 1000000: verheiratet/);
  });
  it('lässt übliche jährliche Änderungen durch', () => {
    const n = kopie();
    for (const k of Object.values(n.kantone)) { k.ledig = k.ledig.map((v) => Math.round(v * 1.04)); k.verheiratet = k.verheiratet.map((v) => Math.round(v * 1.04)); }
    expect(plausibel(n, alt)).toEqual([]);
  });
});

describe('Text-Normalisierung der Quellenprüfung', () => {
  it('entfernt eindeutige Tausendertrennzeichen: Apostrophe, geschützte und schmale Leerzeichen', () => {
    expect(normalize('CHF 2’520 und 2\'520 und 2\u202f520 und 2\u00a0520 und 2\u2009520')).toBe('CHF 2520 und 2520 und 2520 und 2520 und 2520');
    expect(normalize('8’950’000')).toBe('8950000');
    expect(normalize('1\u00a0760\u00a0000 Franken')).toBe('1760000 Franken');
    expect(normalize('6.8 %')).toBe('6.8 %');
  });
  it('lässt Tabellenspalten getrennt: Ein gewöhnliches Leerzeichen ist kein Tausendertrennzeichen', () => {
    // Stufe 1, Betrag 260; Skala 44, Rente 1 260; Satz 10,5 und Betrag 100
    for (const t of ['1 260', '44 1 260 2 520', '10,5 100', '0 3 500', '2025 100 200']) expect(normalize(t), t).toBe(t);
    // Dezimalstellen und laufende Ziffernfolgen werden nie zusammengezogen
    expect(normalize('3,5\u00a0100')).toBe('3,5 100');
    expect(normalize('12345\u00a0678')).toBe('12345 678');
    // früher wurde aus zwei Spalten ein Wert, der so nicht in der Quelle steht
    expect(matches(normalize('Stufe 1 260 Franken'), 're:\\b1260 Franken')).toBe(false);
    // schreibt die Quelle Tausender mit Leerzeichen, nennt das Muster die Lücke ausdrücklich
    expect(matches(normalize('beträgt 27 050 Franken pro Jahr'), 're:beträgt 27 ?050 Franken')).toBe(true);
    expect(matches(normalize('beträgt 27’050 Franken pro Jahr'), 're:beträgt 27 ?050 Franken')).toBe(true);
  });
  it('findet Text und reguläre Ausdrücke', () => {
    const t = normalize(htmlToText('<p>Die Maximalrente beträgt <b>2&#8217;520</b>&nbsp;Franken.</p>'));
    expect(matches(t, '2’520 Franken')).toBe(true);
    expect(matches(t, 're:Maximalrente\\D{0,40}2520')).toBe(true);
    expect(matches(t, '2’540')).toBe(false);
  });
});
