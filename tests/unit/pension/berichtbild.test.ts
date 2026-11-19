// @ts-nocheck — Referenztest, aus PensCheck (tests/berichtbild.test.js, Stand 4830eff) übernommen; nur Pfade angepasst.
// @vitest-environment happy-dom
// Das Bild der Bühne in der Ausgabe: als Vektorgrafik im PDF-Bericht (reportbild.js), höher im Ausdruck, dazu der
// Satz zur Ampel in Ausdruck und PDF.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import params from '../../../public/data/params.json';
import { createEngine } from '../../../src/lib/pension/engine';
import { resolveParams, nextParams } from '../../../src/lib/pension/params';
import { auswerten } from '../../../src/lib/pension/auswertung';
import { EXAMPLE, clone, migrate } from '../../../src/lib/pension/state';
import { bildDaten, bildSzenario } from '../../../src/pension-ui/bild';
import { bildPdf, bildPdfLegende, BILD_RGB } from '../../../src/pension-ui/reportbild';
import { ampelSatz, ampelSaetze, terms } from '../../../src/pension-ui/glossar';
import { A0, boot, q } from './hilfen';

const P = resolveParams(params, 2026);
const E = createEngine(P, A0, nextParams(params, 2026));
const neu = () => migrate(clone(EXAMPLE));
const lies = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');

/** Zeichenfläche, die alle Aufrufe festhält (statt jsPDF). */
function blatt() {
  const rufe = [];
  const doc = new Proxy({}, {
    get: (_, name) => (name === 'getTextWidth' ? (t) => String(t).length * 1.4 : (...a) => { rufe.push([name, ...a]); }),
  });
  const texte = () => rufe.filter((r) => r[0] === 'text').map((r) => r[1]);
  const farben = (art) => rufe.filter((r) => r[0] === art).map((r) => r.slice(1, 4).join(','));
  return { doc, rufe, texte, farben };
}
const zeichne = (d, o = {}) => { const b = blatt(); const hoehe = bildPdf(b.doc, d, { x: 16, y: 40, w: 178, h: 92, ...o }); return { ...b, hoehe }; };

describe('Bild im PDF-Bericht', () => {
  const S = neu(), R = auswerten(S, E), d = bildDaten(S, R, E);
  it('zeichnet beide Felder, Marken, Achse und die Kernaussage', () => {
    const { texte, hoehe } = zeichne(d);
    const t = texte();
    expect(t).toContain('pro Jahr');
    expect(t).toContain('Vermögen');
    expect(t).toContain('heute');
    expect(t).toContain('Ausgaben inkl. Steuern');
    expect(t.some((x) => /^(reicht bis|aufgebraucht mit) \d+$/.test(x))).toBe(true);
    expect(t.some((x) => x.includes('Horizont'))).toBe(true);
    // belegte Höhe: Bild und Legende
    expect(hoehe).toBeGreaterThan(92);
    expect(hoehe).toBeLessThan(92 + 16);
  });
  it('Paar: Lohn je Person, Legende in der sichtbaren Reihenfolge', () => {
    const leg = bildPdfLegende(d).map((x) => x[2]);
    expect(leg.slice(0, 2)).toEqual(['Lohn Person 1', 'Lohn Person 2']);
    expect(leg.indexOf('PK-Rente')).toBeLessThan(leg.indexOf('AHV'));
    expect(leg).toContain('Aus dem Vermögen');
    expect(leg.slice(-2)).toEqual(['Freies Vermögen', 'Stresstest']);
    expect(zeichne(d).texte()).toEqual(expect.arrayContaining(leg));
  });
  it('nur Markenfarben: jede Fläche und jede Linie stammt aus BILD_RGB', () => {
    const erlaubt = new Set(Object.values(BILD_RGB).map((c) => c.join(',')));
    const { farben } = zeichne(d);
    [...farben('setFillColor'), ...farben('setDrawColor'), ...farben('setTextColor')].forEach((f) => expect(erlaubt.has(f)).toBe(true));
    // Reihenfarben nach bbz Brand System: chart.1, chart.3, chart.4; Stresstest chart.2
    expect(BILD_RGB.lohn).toEqual([0, 33, 61]);
    expect(BILD_RGB.stress).toEqual([190, 55, 60]);
    expect(BILD_RGB.pk).toEqual([211, 198, 175]);
    expect(BILD_RGB.ahv).toEqual([100, 162, 216]);
  });
  it('keine gestapelte Fläche über der Zeit: das Einkommen steht als Säule je Jahr', () => {
    const { rufe } = zeichne(d, { legende: false });
    const saeulen = rufe.filter((r) => r[0] === 'rect' && r[5] === 'F');
    expect(saeulen.length).toBeGreaterThanOrEqual(d.jahre.length);
  });
  it('Szenario «früher aufhören»: heutiger Plan gestrichelt statt Stresstest', () => {
    const ds = bildSzenario(S, R, E);
    const leg = bildPdfLegende(ds).map((x) => x[2]);
    expect(leg).toContain('Freies Vermögen im Szenario');
    expect(leg).toContain('heutiger Plan');
    expect(leg).not.toContain('Stresstest');
    const { rufe } = zeichne(ds, { h: 72 });
    expect(rufe.some((r) => r[0] === 'setLineDashPattern' && r[1].length === 2)).toBe(true);
  });
  it('Alleinstehend: ein Lohn; Texte laufen durch die übergebene Umsetzung', () => {
    const s = neu(); s.haushalt = 'single';
    const ds = bildDaten(s, auswerten(s, E), E);
    expect(bildPdfLegende(ds)[0][2]).toBe('Lohn');
    const gesehen = [];
    zeichne(ds, { txt: (t) => { gesehen.push(t); return String(t); } });
    expect(gesehen).toContain('Alter');
  });
  it('ohne Ergebnis: Achse und Platz, keine Legende, kein Fehler', () => {
    const s = neu(); s.ausgabenRuhestand = 0;
    const ds = bildDaten(s, auswerten(s, E), E);
    expect(ds.stufe).toBeLessThan(3);
    expect(() => zeichne(ds)).not.toThrow();
  });
  it('report.js: Bild direkt nach dem Urteil und vor den Kennzahlen; die alte Grafik ist weg', () => {
    const rep = lies('src/pension-ui/report.ts');
    expect(rep.indexOf("h2('Ihr Plan im Bild')")).toBeGreaterThan(rep.indexOf('verdictSub'));
    expect(rep.indexOf("h2('Ihr Plan im Bild')")).toBeLessThan(rep.indexOf("h2('Kennzahlen')"));
    expect(rep).toContain('bildSzenario(S, R, app.E)');
    expect(rep).toContain('ampelSatz(st, S)');
    expect(rep).not.toContain('function chart(');
    expect(rep).not.toContain('Vermögensverlauf');
  });
});

describe('Satz zur Ampel in Ausdruck und PDF', () => {
  it('ein Satz je Stufe, derselbe Wortlaut wie im Glossar', () => {
    const S = neu(), a = ampelSaetze(S);
    expect(ampelSatz('gruen', S)).toBe(`«Reicht» bedeutet: ${a.gruen}`);
    expect(ampelSatz('gelb', S).startsWith('«Knapp» bedeutet: ')).toBe(true);
    expect(ampelSatz('rot', S).startsWith('«Reicht nicht» bedeutet: ')).toBe(true);
    const g = terms({ P, S }).ampel[1];
    [a.gruen, a.gelb, a.rot, a.liegenschaft].forEach((t) => expect(g).toContain(t));
  });
  it('Ausdruck: der Satz steht im Urteil, am Bildschirm ist er verborgen', () => {
    const { app } = boot(neu());
    expect(q('#ampelDruck').textContent).toBe(ampelSatz(app.R.amp.st, app.S));
    const css = lies('src/styles/pension/styles.css');
    expect(css).toMatch(/\n\.nurdruck \{ display: none; \}/);
    expect(css.slice(css.indexOf('@media print {'))).toMatch(/\n {2}\.nurdruck \{ display: block; \}/);
  });
  it('Ausdruck: das Bild ist 700 × 420 gross', () => {
    const S = neu(); S.ui.mode = 'form';
    boot(S);
    window.dispatchEvent(new Event('beforeprint'));
    expect(q('#druckAnsichten #bild svg').getAttribute('viewBox')).toBe('0 0 700 420.0');
    window.dispatchEvent(new Event('afterprint'));
    expect(q('#druckAnsichten').innerHTML).toBe('');
  });
});
