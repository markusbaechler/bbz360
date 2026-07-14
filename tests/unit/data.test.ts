import { describe, it, expect } from 'vitest';
import { migrate, migrateAdmin, SCHEMA_VERSION } from '../../src/lib/schema';

// Synthetisches v1-Fixture — CODE-GETREU: exakt die Objektformen, die v1 real
// per BBZ.set schreibt. v1 hat keinen Export, daher hier rekonstruiert:
//  - finanzierung_data.inputs als STRINGS (07a persist()), variants, rates
//  - anlage_konklusion (07b persistConclusion())
//  - Betrags-Keys teils als String (Legacy) -> migrate muss zu number normalisieren
//  - bbzAdmin ist ein SEPARATER Store (Berater[]), nicht Teil von bbzData
function v1BbzData(): Record<string, unknown> {
  return {
    p1name: 'Anna Muster',
    p1geb: '1980-03-15',
    p2name: '',
    beratungsdatum: '2026-07-14',
    agenda_traktanden: ['Gesamtsituation', 'Ziele & Wünsche'],
    ziele: [{ id: 'wohnen', horizont: 'mittel' }],
    cockpit_einkommen: "145'000", // Legacy: als String geschrieben
    cockpit_verpflichtungen: 0, // bereits number
    anlage_betrag: '100000', // String -> number
    anlage_horizont: 10,
    anlage_konklusion: {
      strategiewunsch: 'Wachstum',
      stresstest: 'Ausgewogen',
      horizonMax: 'Dynamisch',
      empfehlung: 'Wachstum',
      finaleStrategie: 'Wachstum',
      esg: null,
      esgText: '',
      begruendung: 'Der Anlagehorizont … erlaubt maximal Dynamisch.',
    },
    finanzierung_data: {
      inputs: {
        income: '145000', obligations: '0', currentRent: '2500', age: '40',
        price: '950000', cashEquity: '190000', pensionWithdraw: '0',
        pensionPledge: '0', calcRate: '5.00', sideRate: '0.75',
      },
      variants: [{ id: 'A', tranches: [{ p: 'fix10', a: 760000 }] }],
      rates: { fix10: 1.5 },
    },
    // config
    aktiverBerater: 2,
    beraterName: 'Markus',
  };
}

describe('migrate() — v1 bbzData -> SessionData (ADR-4)', () => {
  const src = v1BbzData();
  const out = migrate(src);

  it('stempelt SCHEMA_VERSION', () => {
    expect(out.__schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('kein Feldverlust: alle v1-Top-Level-Keys bleiben erhalten', () => {
    for (const k of Object.keys(src)) expect(k in out).toBe(true);
  });

  it('Betraege sind number (number gewinnt)', () => {
    expect(out.cockpit_einkommen).toBe(145000);
    expect(typeof out.cockpit_einkommen).toBe('number');
    expect(out.anlage_betrag).toBe(100000);
    expect(typeof out.anlage_betrag).toBe('number');
    expect(out.anlage_horizont).toBe(10);
  });

  it('finanzierung_data.inputs: STRINGS -> number, keine Feldverluste', () => {
    const inputs = out.finanzierung_data!.inputs as Record<string, number>;
    for (const [k, v] of Object.entries(inputs)) {
      expect(typeof v, `${k} muss number sein`).toBe('number');
    }
    expect(inputs.income).toBe(145000);
    expect(inputs.price).toBe(950000);
    expect(inputs.calcRate).toBe(5);
    expect(inputs.sideRate).toBe(0.75);
    expect(Object.keys(inputs).length).toBe(10);
    // variants/rates unveraendert erhalten
    expect(out.finanzierung_data!.variants[0].tranches[0].a).toBe(760000);
    expect(out.finanzierung_data!.rates.fix10).toBe(1.5);
  });

  it('anlage_konklusion unveraendert erhalten', () => {
    expect(out.anlage_konklusion!.empfehlung).toBe('Wachstum');
    expect(out.anlage_konklusion!.esg).toBeNull();
  });

  it('ist idempotent (migrate∘migrate stabil)', () => {
    const twice = migrate(out);
    expect(twice).toEqual(out);
  });

  it('robust gegen Muell-Input', () => {
    expect(migrate(null).__schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrate('nonsense').__schemaVersion).toBe(SCHEMA_VERSION);
  });
});

describe('migrateAdmin() — bbzAdmin (separater Store)', () => {
  it('reines Array bleibt Array', () => {
    const admin = [{ id: 1, name: 'Berater 1' }, { id: 2, name: 'Berater 2' }];
    expect(migrateAdmin(admin)).toHaveLength(2);
    expect(migrateAdmin(admin)[1].name).toBe('Berater 2');
  });
  it('v1-Altform {profiles:[…]} wird gelesen', () => {
    expect(migrateAdmin({ profiles: [{ id: 1 }] })).toHaveLength(1);
  });
  it('Muell -> leeres Array', () => {
    expect(migrateAdmin(null)).toEqual([]);
    expect(migrateAdmin({})).toEqual([]);
  });
});
