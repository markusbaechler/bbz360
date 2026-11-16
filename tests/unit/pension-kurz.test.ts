import { describe, it, expect } from 'vitest';
import { pensionKurz } from '../../src/lib/pension/kurz';
import { EXAMPLE, clone, emptyState, migrate } from '../../src/lib/pension/state';

const A0 = 2026 * 12 + 10;

describe('Kurzfassung der Pensionierung (Abschluss, Lebensplan)', () => {
  it('Musterfall: Ampel, Horizont, tragbare Ausgaben und nächste Schritte', () => {
    const k = pensionKurz(migrate(clone(EXAMPLE)), A0)!;
    expect(k.st).toBe('gelb');
    expect(k.wort).toBe('Knapp');
    expect(k.horizont).toBe(91);
    expect(k.ausgaben).toBe(10000);
    expect(k.tragbar).toBeGreaterThan(9000);
    expect(k.tragbar).toBeLessThan(12000);
    expect(k.pensAlter).toEqual([58, 60]);
    expect(k.schritte.length).toBeGreaterThan(0);
    expect(k.schritte.length).toBeLessThanOrEqual(3);
    for (const s of k.schritte) expect(s.titel).toBeTruthy();
  });
  it('ohne Ausgaben im Ruhestand gibt es keine Kurzfassung', () => {
    expect(pensionKurz(emptyState(), A0)).toBeNull();
  });
  it('erledigte Schritte erscheinen nicht mehr', () => {
    const S = migrate(clone(EXAMPLE));
    const erster = pensionKurz(S, A0)!.schritte[0];
    S.aktion[erster.id] = 1;
    expect(pensionKurz(S, A0)!.schritte.map((s) => s.id)).not.toContain(erster.id);
  });
  it('Einzelperson: ein Pensionierungsalter', () => {
    const S = migrate({ ...clone(EXAMPLE), haushalt: 'single' });
    expect(pensionKurz(S, A0)!.pensAlter).toHaveLength(1);
  });
});
