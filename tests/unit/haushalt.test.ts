import { describe, it, expect } from 'vitest';
import { migrate, SCHEMA_VERSION } from '../../src/lib/schema';
import { cockpitEinkommen, gemeinsamAusHaushalt, gemeinsamInHaushalt, haushaltAusSession, haushaltImport, prefills, stammdatenAnwenden, stammdatenNachfuehren } from '../../src/lib/haushalt';
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
  it('eine blosse Geschlechts-Vorgabe aus dem Cockpit gilt nicht als eigene Angabe', () => {
    const nurVorgabe = haushaltAusSession(migrate({ cockpit_data: { ausgaben: { geschlecht1: 'w', geschlecht2: 'm' } } }));
    expect(nurVorgabe.personen.map((p) => p.geschlecht)).toEqual(['w', 'm']);
    expect(nurVorgabe.ui.edited).toBe(false);
    expect(haushaltAusSession(migrate({ cockpit_data: { ausgaben: { brutto1: 90000 } } })).ui.edited).toBe(true);
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

describe('Cockpit ↔ Haushalt: Haushalt führt', () => {
  const basis = () => sanitize(clone(EXAMPLE)); // P1 3a 49'000, P2 3a 49'000, keine PK-Guthaben heute
  it('liest Summen über beide Personen', () => {
    const g = gemeinsamAusHaushalt(basis());
    expect(g).toMatchObject({ paar: true, liquiditaet: 100000, wertschriften: 300000, s3a: 98000, pk: 0, brutto: [160000, 45000], geschlecht: ['m', 'w'], ausgabenHeute: 0 });
  });
  it('unveränderte Summen lassen die Aufteilung aus der Pensionierung stehen', () => {
    const H = basis();
    const out = gemeinsamInHaushalt(H, gemeinsamAusHaushalt(H));
    expect(out.personen.map((p) => p.s3a)).toEqual([49000, 49000]);
    expect(out.personen.map((p) => p.pkGuthabenHeute)).toEqual(['', '']);
  });
  it('eine höhere Summe geht an Person 1; eine tiefere als der Anteil von Person 2 senkt Person 2', () => {
    const H = basis();
    const mehr = gemeinsamInHaushalt(H, { ...gemeinsamAusHaushalt(H), s3a: 120000, pk: 500000 });
    expect(mehr.personen.map((p) => p.s3a)).toEqual([71000, 49000]);
    expect(mehr.personen.map((p) => p.pkGuthabenHeute)).toEqual([500000, '']);
    const weniger = gemeinsamInHaushalt(H, { ...gemeinsamAusHaushalt(H), s3a: 30000 });
    expect(weniger.personen.map((p) => p.s3a)).toEqual([0, 30000]);
    expect(gemeinsamAusHaushalt(weniger).s3a).toBe(30000);
  });
  it('schreibt Lohn, Geschlecht, Vermögen und Ausgaben heute; hin und zurück ist stabil', () => {
    const g = { paar: true, liquiditaet: 80000, wertschriften: 150000, s3a: 98000, pk: 0, brutto: [120000, 60000] as [number, number], geschlecht: ['w', 'm'] as ['m' | 'w', 'm' | 'w'], ausgabenHeute: 8500 };
    const out = gemeinsamInHaushalt(basis(), g);
    expect(gemeinsamAusHaushalt(out)).toEqual(g);
    expect(out.ui.edited).toBe(true);
    // alles Übrige bleibt
    expect(out.liegenschaften).toEqual(basis().liegenschaften);
    expect(out.ausgabenRuhestand).toBe(10000);
  });
  it('Einzelperson: Summen betreffen nur Person 1', () => {
    const H = sanitize({ ...clone(EXAMPLE), haushalt: 'single' });
    expect(gemeinsamAusHaushalt(H).s3a).toBe(49000);
    const out = gemeinsamInHaushalt(H, { ...gemeinsamAusHaushalt(H), s3a: 60000 });
    expect(out.personen[0].s3a).toBe(60000);
    expect(out.personen[1].s3a).toBe(49000);
  });
});

describe('Stammdaten nachführen', () => {
  const H0 = () => sanitize(clone(EXAMPLE)); // Jahrgänge 1972 / 1970, verheiratet
  it('geänderte Geburtsdaten und Namen werden übernommen', () => {
    const d = migrate({ p1name: 'Anna', p1geb: '1980-03-15', p2name: 'Beat', p2geb: '1979-12-01', haushalt_stamm: { p1geb: '', p2geb: '', paar: true, kunde: '' } });
    const r = stammdatenNachfuehren(H0(), d);
    expect(r.geaendert).toBe(true);
    expect(r.H.personen[0]).toMatchObject({ jahrgang: 1980, geburtsmonat: 3 });
    expect(r.H.personen[1]).toMatchObject({ jahrgang: 1979, geburtsmonat: 12 });
    expect(r.H.bericht.kunde).toBe('Anna & Beat');
  });
  it('unveränderte Stammdaten überschreiben eine Anpassung in der Pensionierung nicht', () => {
    const stamm = { p1geb: '1980-03-15', p2geb: '', paar: true, kunde: 'Anna & Beat' };
    const d = migrate({ p1name: 'Anna', p1geb: '1980-03-15', p2name: 'Beat', haushalt_stamm: stamm });
    const r = stammdatenNachfuehren(H0(), d); // Haushalt trägt bewusst 1972
    expect(r.geaendert).toBe(false);
    expect(r.H.personen[0].jahrgang).toBe(1972);
  });
  it('fällt die zweite Person weg, wird der Haushalt zur Einzelperson — und umgekehrt', () => {
    const weg = stammdatenNachfuehren(H0(), migrate({ p1name: 'Anna', haushalt_stamm: { p1geb: '', p2geb: '', paar: true, kunde: 'Anna & Beat' } }));
    expect(weg.H.haushalt).toBe('single');
    const single = sanitize({ ...clone(EXAMPLE), haushalt: 'single' });
    const dazu = stammdatenNachfuehren(single, migrate({ p1name: 'Anna', p2name: 'Beat', haushalt_stamm: { p1geb: '', p2geb: '', paar: false, kunde: 'Anna' } }));
    expect(dazu.H.haushalt).toBe('verheiratet');
  });
});

// ---------- Befunde des Assessments 2026-11 (docs/assessment-2026-11-fusion.md) ----------

describe('A3: zweite Person — Einkommen im Cockpit heisst zwei Personen', () => {
  it('ohne Namen für Person 2, aber mit ihrem Einkommen im Cockpit: der erste Stand ist ein Paar', () => {
    const mitBrutto = haushaltAusSession(migrate({ p1name: 'Anna', cockpit_data: { ausgaben: { brutto1: 100000, brutto2: 60000 } } }));
    expect(mitBrutto.haushalt).toBe('verheiratet');
    expect(mitBrutto.personen.map((p) => p.brutto)).toEqual([100000, 60000]);
    const mitNetto = haushaltAusSession(migrate({ p1name: 'Anna', cockpit_data: { ausgaben: { eMann: 7000, eFrau: 4000, freq: 'mtl' } } }));
    expect(mitNetto.haushalt).toBe('verheiratet');
    expect(haushaltAusSession(migrate({ p1name: 'Anna', cockpit_data: { ausgaben: { brutto1: 100000 } } })).haushalt).toBe('single');
  });
  it('ältere Session mit Einkommens-Typ «brutto» und ohne Namen für Person 2: beide Löhne bleiben', () => {
    const d = migrate({ p1name: 'Anna', cockpit_data: { ausgaben: { eMann: 8000, eFrau: 5000, typ: 'brutto', freq: 'mtl' } } });
    const H = haushaltAusSession(d);
    expect(H.haushalt).toBe('verheiratet');
    expect(H.personen.map((p) => p.brutto)).toEqual([96000, 60000]);
    expect(prefills(d, H).cockpit_einkommen).toBe(156000);
  });
  it('das Cockpit macht aus einer Einzelperson ein Paar, sobald es ein Einkommen für Person 2 trägt — und nie umgekehrt', () => {
    const single = sanitize({ ...clone(EXAMPLE), haushalt: 'single' });
    const g = gemeinsamAusHaushalt(single);
    expect(g.paar).toBe(false);
    const paar = gemeinsamInHaushalt(single, { ...g, paar: true, brutto: [100000, 60000] });
    expect(paar.haushalt).toBe('verheiratet');
    expect(paar.personen[1].brutto).toBe(60000);
    const bleibt = gemeinsamInHaushalt(sanitize(clone(EXAMPLE)), { ...gemeinsamAusHaushalt(sanitize(clone(EXAMPLE))), paar: false });
    expect(bleibt.haushalt).toBe('verheiratet');
  });
});

describe('A5/A6: Einkommen und Ausgaben aus dem Cockpit', () => {
  it('cockpitEinkommen trennt Brutto und Netto; ältere Brutto-Stände tragen kein Netto', () => {
    const neu = cockpitEinkommen(migrate({ cockpit_data: { ausgaben: { eMann: 7000, eFrau: 5000, freq: 'mtl', brutto1: 100000, haushalt: 4000, leasing: 800 } } }));
    expect(neu).toMatchObject({ brutto: [100000, 0], netto: [84000, 60000], ausgabenMonat: 4800 });
    const alt = cockpitEinkommen(migrate({ cockpit_data: { ausgaben: { eMann: 8000, eFrau: 5000, typ: 'brutto', freq: 'mtl' } } }));
    expect(alt).toMatchObject({ brutto: [96000, 60000], netto: [0, 0] });
    expect(cockpitEinkommen(migrate({ cockpit_data: { ausgaben: { eMann: 120000, freq: 'pa' } } })).netto[0]).toBe(120000);
  });
  it('Prefill Einkommen: je Person der Bruttolohn, sonst ihr Netto — niemand fällt heraus', () => {
    const d = migrate({ p1name: 'A', p2name: 'B', cockpit_data: { ausgaben: { eMann: 7000, eFrau: 5000, freq: 'mtl', brutto1: 100000 } } });
    const H = haushaltAusSession(d);
    // Person 1 brutto 100'000, Person 2 netto 5'000 × 12 (vorher: nur 100'000)
    expect(prefills(d, H).cockpit_einkommen).toBe(160000);
    expect(prefills(migrate({ p1name: 'A', p2name: 'B', cockpit_data: { ausgaben: { eMann: 7000, eFrau: 5000, freq: 'mtl' } } }), haushaltAusSession(migrate({ p1name: 'A', p2name: 'B' }))).cockpit_einkommen).toBe(144000);
  });
  it('der erste Stand übernimmt die Ausgaben des Cockpits als «Ausgaben heute»', () => {
    const H = haushaltAusSession(migrate({ p1name: 'A', cockpit_data: { ausgaben: { haushalt: 4000, leasing: 800, unterhalt: 0, uebrige: 200 } } }));
    expect(H.ausgabenHeute).toBe(5000);
    expect(haushaltAusSession(migrate({ p1name: 'A' })).ausgabenHeute).toBe('');
  });
  it('Beträge als Zeichenketten aus älteren Ständen werden gelesen', () => {
    const H = haushaltAusSession(migrate({ p1name: 'A', cockpit_data: { zahlen: { saldo: "30'000" }, anlegen: { volumen: '250000' }, ausgaben: { brutto1: "145'000" } } }));
    expect(H).toMatchObject({ liquiditaet: 30000, wertschriften: 250000 });
    expect(H.personen[0].brutto).toBe(145000);
  });
  it('Rappen in der Pensionierung verschieben die Aufteilung nicht, wenn das Cockpit die gerundete Summe zurückschreibt', () => {
    const H = sanitize({ ...clone(EXAMPLE), personen: [{ ...clone(EXAMPLE).personen[0], s3a: 40000.6 }, { ...clone(EXAMPLE).personen[1], s3a: 20000.7 }] });
    const out = gemeinsamInHaushalt(H, { ...gemeinsamAusHaushalt(H), s3a: 60001 });
    expect(out.personen.map((p) => p.s3a)).toEqual([40000.6, 20000.7]);
  });
});

describe('A2/B1/C6: Stammdaten', () => {
  it('ein eingelesener Stand übernimmt Namen und Geburtsdaten der Stammdaten', () => {
    const d = migrate({ p1name: 'Anna', p1geb: '1980-03-15' });
    const fremd = sanitize(clone(EXAMPLE)); // Ehepaar 1972/1970
    const H = stammdatenAnwenden(fremd, d);
    expect(H.personen[0]).toMatchObject({ jahrgang: 1980, geburtsmonat: 3 });
    expect(H.bericht.kunde).toBe('Anna');
    // die zweite Person des eingelesenen Stands bleibt, auch wenn die Stammdaten sie nicht nennen
    expect(H.haushalt).toBe('verheiratet');
    expect(H.personen[1].jahrgang).toBe(1970);
  });
  it('nennen die Stammdaten eine zweite Person, wird aus einer eingelesenen Einzelperson ein Paar', () => {
    const H = stammdatenAnwenden(sanitize({ ...clone(EXAMPLE), haushalt: 'single' }), migrate({ p1name: 'Anna', p2name: 'Beat', p2geb: '1979-12-01' }));
    expect(H.haushalt).toBe('verheiratet');
    expect(H.personen[1]).toMatchObject({ jahrgang: 1979, geburtsmonat: 12 });
    expect(H.bericht.kunde).toBe('Anna & Beat');
  });
  it('Paar → Einzelperson → Paar: der frühere Zivilstand «Konkubinat» gilt wieder', () => {
    const konk = sanitize({ ...clone(EXAMPLE), haushalt: 'konkubinat' });
    const weg = stammdatenNachfuehren(konk, migrate({ p1name: 'Anna', haushalt_stamm: { p1geb: '', p2geb: '', paar: true, kunde: 'Anna & Beat', paarArt: 'konkubinat' } }));
    expect(weg.H.haushalt).toBe('single');
    const wieder = stammdatenNachfuehren(weg.H, migrate({ p1name: 'Anna', p2name: 'Beat', haushalt_stamm: { p1geb: '', p2geb: '', paar: false, kunde: 'Anna', paarArt: 'konkubinat' } }));
    expect(wieder.H.haushalt).toBe('konkubinat');
  });
  it('geleerte Namen leeren auch den Kundennamen im Bericht', () => {
    const H = sanitize({ ...clone(EXAMPLE), bericht: { kunde: 'Anna & Beat', datum: '', berater: '' } });
    const r = stammdatenNachfuehren(H, migrate({ haushalt_stamm: { p1geb: '', p2geb: '', paar: true, kunde: 'Anna & Beat' } }));
    expect(r.H.bericht.kunde).toBe('');
  });
});

describe('Zweiter Prüflauf: aus der Einzelperson wird im Cockpit ein Paar', () => {
  it('3a und PK von Person 1 bleiben; die verborgenen Werte von Person 2 kommen dazu (vorher: Person 1 gekürzt)', () => {
    const H = sanitize({ ...clone(EXAMPLE), haushalt: 'single' });
    H.personen[0].s3a = 50000; H.personen[0].pkGuthabenHeute = 300000;
    H.personen[1].s3a = 40000; H.personen[1].pkGuthabenHeute = 100000;
    const g = gemeinsamAusHaushalt(H); // was das Cockpit zeigt: nur Person 1
    expect([g.s3a, g.pk]).toEqual([50000, 300000]);
    const neu = gemeinsamInHaushalt(H, { ...g, paar: true, brutto: [g.brutto[0], 60000] });
    expect(neu.haushalt).toBe('verheiratet');
    expect(neu.personen.map((p) => p.s3a)).toEqual([50000, 40000]);
    expect(neu.personen.map((p) => p.pkGuthabenHeute)).toEqual([300000, 100000]);
    // ändert das Cockpit im selben Schritt die Summe, gilt sie für Person 1
    const neu2 = gemeinsamInHaushalt(H, { ...g, paar: true, s3a: 70000, brutto: [g.brutto[0], 60000] });
    expect(neu2.personen.map((p) => p.s3a)).toEqual([70000, 40000]);
  });
});
