// @ts-nocheck — Referenztest, aus PensCheck (tests/reach.test.js, Stand 4830eff) übernommen; nur Pfade angepasst.
import { describe, it, expect } from 'vitest';
import params from '../../../public/data/params.json';
import { createEngine } from '../../../src/lib/pension/engine';
import { resolveParams } from '../../../src/lib/pension/params';
import { analyse } from '../../../src/lib/pension/analyse';
import { reachData, reachText } from '../../../src/pension-ui/reach';
import { terms } from '../../../src/pension-ui/glossar';
import { EXAMPLE, clone, migrate } from '../../../src/lib/pension/state';

const A0 = 2026 * 12 + 10; // November 2026
const P = resolveParams(params, 2026);
const E = createEngine(P, A0);
const S = () => migrate(clone(EXAMPLE));
const data = (s) => reachData(analyse(s, E, undefined, {}), E, s);

describe('Reichweiten-Zeitstrahl', () => {
  it('Musterfall: Achse ab heute, Basis bis zum Horizont, Stresstest bis 100', () => {
    const d = data(S());
    // Person 1: Juni 1972, heute November 2026
    expect(d.a0).toBeCloseTo(54 + 5 / 12, 6);
    expect(d.base.end).toBeLessThanOrEqual(d.stress.end);
    expect(d.aMax).toBe(d.stress.end);
    expect(d.stress.end).toBeGreaterThanOrEqual(100);
  });

  it('Markierungen: gemeinsame Pensionierung, AHV je Person mit eigenem Alter, Lebenserwartung', () => {
    const d = data(S());
    const labels = d.marks.map((m) => m.label);
    expect(labels).toContain('Pensionierung');
    expect(labels).toContain('AHV P1 (65)');
    expect(labels).toContain('AHV P2 (65)');
    expect(labels).toContain('Lebenserwartung');
    const xs = d.marks.map((m) => m.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(xs.every((x) => x > d.a0 && x <= d.aMax)).toBe(true);
  });

  it('zu hohe Ausgaben: Vermögen im Basisszenario aufgebraucht', () => {
    const s = S();
    s.ausgabenRuhestand = 25000;
    const d = data(s);
    expect(d.base.dep).not.toBeNull();
    expect(d.base.dep).toBeLessThan(d.base.end);
    expect(reachText(d)).toMatch(/im Basisszenario ist es mit \d+ aufgebraucht/);
  });

  it('Text: Zusammenfassung mit Basisszenario, Stresstest und Lebenserwartung', () => {
    const d = data(S());
    expect(reachText(d)).toMatch(/Basisszenario .*Stresstest .*Lebenserwartung laut BFS: \d+ \(Person 1\) und \d+ \(Person 2\)/);
    expect(reachText(d)).not.toMatch(/undefined|NaN/);
  });

  it('Alleinstehend: Beschriftungen mit Alter', () => {
    const s = S();
    s.haushalt = 'single';
    const labels = data(s).marks.map((m) => m.label);
    expect(labels).toContain('Pensionierung 58');
    expect(labels).toContain('AHV 65');
    expect(labels.some((l) => /^Lebenserwartung \d+$/.test(l))).toBe(true);
  });
});

describe('Fachbegriffe', () => {
  it('jeder Begriff hat Titel und Erklärung, Werte aus den Grundlagen', () => {
    const t = terms({ P, S: S() });
    expect(Object.keys(t).length).toBeGreaterThanOrEqual(15);
    for (const [k, [titel, text]] of Object.entries(t)) {
      expect(titel, k).toBeTruthy();
      expect(text.length, k).toBeGreaterThan(60);
      expect(text, k).not.toMatch(/undefined|NaN/);
    }
    expect(t.s3a[1]).toContain(String(P.s3a.maxMitPK).replace(/\B(?=(\d{3})+(?!\d))/g, '’'));
    expect(t.vorbezug[1]).toContain(`${(P.ahv.vorbezug['1'] * 100).toFixed(1)}%`);
  });
});
