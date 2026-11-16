import { describe, it, expect } from 'vitest';
import { migrate, SCHEMA_VERSION } from '../../src/lib/schema';
import { haushaltAusSession, haushaltImport } from '../../src/lib/haushalt';
import { EXAMPLE, clone, encodeCode, sanitize } from '../../src/lib/pension/state';

describe('Schema v3: gemeinsamer Haushalts-Stand', () => {
  it('v2-Session ohne haushalt migriert verlustfrei und bleibt ohne haushalt', () => {
    const v2 = { __schemaVersion: 2, p1name: 'Anna Muster', cockpit_einkommen: 145000, ziele: [{ id: 'wohnen' }] };
    const out = migrate(v2);
    expect(out.__schemaVersion).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBe(3);
    expect(out.p1name).toBe('Anna Muster');
    expect(out.cockpit_einkommen).toBe(145000);
    expect(out.ziele).toEqual([{ id: 'wohnen' }]);
    expect('haushalt' in out).toBe(false);
  });
  it('ein gespeicherter haushalt wird geprueft: Fremdes faellt weg, Zahlen werden begrenzt', () => {
    const out = migrate({ haushalt: { kanton: 'XX', boese: '<script>', personen: [{ brutto: -5 }] } });
    expect(out.haushalt?.kanton).toBe('ZH');
    expect('boese' in (out.haushalt as object)).toBe(false);
    expect(out.haushalt?.personen[0].brutto).toBeGreaterThanOrEqual(0);
    expect(out.haushalt?.personen).toHaveLength(2);
  });
  it('ein unbrauchbarer haushalt (kein Objekt) faellt weg', () => {
    expect('haushalt' in migrate({ haushalt: 'kaputt' })).toBe(false);
    expect('haushalt' in migrate({ haushalt: [1, 2] })).toBe(false);
  });
  it('migrate ist idempotent', () => {
    const einmal = migrate({ haushalt: clone(EXAMPLE) });
    expect(migrate(clone(einmal))).toEqual(einmal);
  });
});

describe('Erster Haushalts-Stand aus Stammdaten und Cockpit', () => {
  const session = () => migrate({
    p1name: 'Anna Muster', p1geb: '1980-03-15', p2name: 'Beat Muster', p2geb: '1978-11-02',
    cockpit_pk_saldo: 420000,
    cockpit_data: {
      zahlen: { saldo: 30000 }, sparen: { saldo: 70000 }, anlegen: { volumen: 250000 },
      vorsorgen: { s3Saldo: 88000, pkSaldo: 420000 },
      ausgaben: { eMann: 9000, eFrau: 4000, typ: 'brutto', freq: 'mtl' },
    },
  });
  it('uebernimmt Personen, Lohn, Vermoegen und Vorsorge', () => {
    const S = haushaltAusSession(session());
    expect(S.haushalt).toBe('verheiratet');
    expect(S.personen[0]).toMatchObject({ jahrgang: 1980, geburtsmonat: 3, brutto: 108000, s3a: 88000, pkGuthabenHeute: 420000 });
    expect(S.personen[1]).toMatchObject({ jahrgang: 1978, geburtsmonat: 11, brutto: 48000 });
    expect(S.liquiditaet).toBe(100000);
    expect(S.wertschriften).toBe(250000);
    expect(S.bericht.kunde).toBe('Anna Muster & Beat Muster');
  });
  it('Nettolohn wird nicht als Bruttolohn uebernommen; Jahreswerte werden nicht vervielfacht', () => {
    const netto = session();
    (netto.cockpit_data as { ausgaben: { typ: string } }).ausgaben.typ = 'netto';
    expect(haushaltAusSession(netto).personen[0].brutto).toBe(0);
    const pa = session();
    Object.assign((pa.cockpit_data as { ausgaben: object }).ausgaben, { freq: 'pa', eMann: 120000 });
    expect(haushaltAusSession(pa).personen[0].brutto).toBe(120000);
  });
  it('ohne zweite Person: Einzelhaushalt; leere Session ergibt einen gueltigen Stand', () => {
    expect(haushaltAusSession(migrate({ p1name: 'Anna' })).haushalt).toBe('single');
    const leer = haushaltAusSession(migrate({}));
    expect(sanitize(clone(leer))).toEqual(leer);
  });
});

describe('Import eines PensCheck-Stands', () => {
  const muster = sanitize(clone(EXAMPLE));
  const code = encodeCode(muster);
  it('liest Link, blossen Code und JSON mit denselben Angaben', () => {
    const ausLink = haushaltImport(`https://bbzsg.ch/PensCheck/#angaben=${code}`);
    const ausCode = haushaltImport(code);
    const ausJson = haushaltImport(JSON.stringify(muster));
    for (const S of [ausLink, ausCode, ausJson]) {
      expect(S.personen).toEqual(muster.personen);
      expect(S.liegenschaften).toEqual(muster.liegenschaften);
      expect(S.wuensche).toEqual(muster.wuensche);
      expect(S.ausgabenRuhestand).toBe(muster.ausgabenRuhestand);
    }
  });
  it('weist Unlesbares zurueck', () => {
    expect(() => haushaltImport('kein code')).toThrow();
    expect(() => haushaltImport('{"foo":1}')).toThrow();
  });
});
