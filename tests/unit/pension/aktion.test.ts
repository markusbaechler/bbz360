// @ts-nocheck — Referenztest, unverändert aus PensCheck (tests/aktion.test.js, Stand 4830eff) übernommen.
import { describe, it, expect } from 'vitest';
import params from '../../../public/data/params.json';
import { createEngine } from '../../../src/lib/pension/engine';
import { resolveParams } from '../../../src/lib/pension/params';
import { analyse } from '../../../src/lib/pension/analyse';
import { buildAktion, buildIcs, aktGruppe, monTxt } from '../../../src/lib/pension/aktion';
import { EXAMPLE, clone, migrate, encodeCode, decodeCode, emptyState } from '../../../src/lib/pension/state';

const A0 = 2026 * 12 + 10; // November 2026
const P = resolveParams(params, 2026);
const E = createEngine(P, A0);
const S = () => migrate(clone(EXAMPLE));
const plan = (s) => analyse(s, E, undefined, {}).akt;
const byId = (L, id) => L.find((x) => x.id === id);

describe('Aktionsplan', () => {
  it('Musterfall: PK-Kapitalbezug ohne erfasste Frist mit 3 Jahren vor der Auszahlung', () => {
    const k = byId(plan(S()), 'pk-kap-0-0');
    // Person 1: Jahrgang 1972, Juni, Pensionierung mit 58 → Auszahlung Juli 2030
    expect(k.when).toBe('bis Ende Juni 2027');
    expect(k.art).toBe('reglement');
    expect(k.text).toContain('Auszahlung Juli 2030');
    expect(k.text).toContain('Zustimmung des Ehegatten');
  });

  it('erfasste Anmeldefrist ersetzt die Annahme und gilt als Frist', () => {
    const s = S();
    s.personen[0].pkFrist = 12;
    const k = byId(plan(s), 'pk-kap-0-0');
    expect(k.when).toBe('bis Ende Juni 2029');
    expect(k.art).toBe('frist');
    expect(k.text).toContain('12 Monate vor dem Bezug');
  });

  it('nach Termin sortiert, «jederzeit» am Schluss, IDs eindeutig', () => {
    const L = plan(S());
    const As = L.filter((x) => x.A != null).map((x) => x.A);
    expect(As).toEqual([...As].sort((a, b) => a - b));
    expect(L.slice(-2).every((x) => x.A == null)).toBe(true);
    expect(new Set(L.map((x) => x.id)).size).toBe(L.length);
  });

  it('Rentenvorausberechnung nur, solange die AHV-Rente geschätzt ist', () => {
    const s = S();
    expect(byId(plan(s), 'ahv-vb-0')).toBeTruthy();
    s.personen[0].ahvModus = 'betrag';
    s.personen[0].ahvBetrag = 2400;
    expect(byId(plan(s), 'ahv-vb-0')).toBeUndefined();
  });

  it('AHV-Vorbezug ist eine Frist, Aufschub braucht eine Erklärung', () => {
    const s = S();
    s.personen[1].ahvBezug = -1;
    const v = byId(plan(s), 'ahv-anm-1');
    expect(v.titel).toBe('AHV-Vorbezug anmelden (1 Jahr)');
    expect(v.art).toBe('frist');
    s.personen[1].ahvBezug = 2;
    const L = plan(s);
    expect(byId(L, 'ahv-auf-1').art).toBe('frist');
    expect(byId(L, 'ahv-abruf-1')).toBeTruthy();
  });

  it('Frühpensionierung: Anmeldung als Nichterwerbstätige im Monat der Pensionierung', () => {
    const ne = byId(plan(S()), 'ne-0');
    expect(ne.when).toBe(`im ${monTxt(E.abAlter(EXAMPLE.personen[0], 58))}`);
  });

  it('ohne Lohn keine Aufgaben beim Arbeitgeber', () => {
    const s = S();
    s.personen[1].brutto = 0;
    const L = plan(s);
    expect(byId(L, 'ag-1')).toBeUndefined();
    expect(byId(L, 'uvg-1')).toBeUndefined();
    expect(byId(L, '3a-einz-1')).toBeUndefined();
  });

  it('Gruppen: «Jetzt angehen», Jahre, «Jederzeit»', () => {
    expect(aktGruppe({ A: A0 }, A0)).toBe('Jetzt angehen');
    expect(aktGruppe({ A: A0 + 2 }, A0)).toBe('Jetzt angehen');
    expect(aktGruppe({ A: 2028 * 12 + 3 }, A0)).toBe('2028');
    expect(aktGruppe({ A: null }, A0)).toBe('Jederzeit');
  });

  it('Haken ändern die Rechnung nicht und lösen keine neue Suche aus', () => {
    const s = S(), cache = {};
    const R1 = analyse(s, E, undefined, cache), key = cache.key;
    s.aktion = { 'ahv-vb-0': 1 };
    const R2 = analyse(s, E, undefined, cache);
    expect(cache.key).toBe(key);
    expect(R2.akt).toEqual(R1.akt);
  });

  it('Haken reisen mit dem Link und überstehen die Migration', () => {
    const s = S();
    s.aktion = { 'pk-kap-0-0': 1 };
    expect(decodeCode(encodeCode(s)).aktion).toEqual({ 'pk-kap-0-0': 1 });
    expect(migrate({ ...s, aktion: 'kaputt' }).aktion).toEqual({});
    expect(emptyState().aktion).toEqual({});
  });
});

describe('Kalenderdatei', () => {
  const L = plan(S());
  const today = new Date(Date.UTC(2026, 10, 14));

  it('ein Termin pro offener Aufgabe mit Datum, ohne «jederzeit» und ohne Erledigtes', () => {
    const offen = L.filter((x) => x.ics && x.A != null);
    const n = (ics) => (ics.match(/BEGIN:VEVENT/g) || []).length;
    expect(n(buildIcs(L, A0, { today }))).toBe(offen.length);
    expect(n(buildIcs(L, A0, { today, done: (id) => id === offen[0].id }))).toBe(offen.length - 1);
  });

  it('gültiges Format: CRLF, Zeilen höchstens 75 Oktette, Datum am Monatsersten', () => {
    const ics = buildIcs(L, A0, { today, cpl: true });
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.includes('\n') && !/[^\r]\n/.test(ics)).toBe(true);
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    // PK-Kapitalbezug Person 1: Juni 2027
    expect(ics).toContain('DTSTART;VALUE=DATE:20270601');
    expect(ics).toContain('SUMMARY:P1: PK-Kapitalbezug anmelden');
    // «jetzt» → am Tag nach heute
    expect(ics).toContain('DTSTART;VALUE=DATE:20261115');
  });
});
