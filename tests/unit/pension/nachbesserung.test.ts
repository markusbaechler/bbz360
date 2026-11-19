// @ts-nocheck — Referenztest, aus PensCheck (tests/nachbesserung.test.js, Stand 4830eff) übernommen; nur Pfade angepasst.
// @vitest-environment happy-dom
// Nachbesserung der Bühne nach dem ersten Gespräch: volle Breite und einklappbare linke Spalte, Ansichten als Knöpfe,
// Bild (Achse, Kernaussage, Szenario «früher aufhören»), Planungshorizont aus dem Bild, Erklärung der Ampel.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import params from '../../../public/data/params.json';
import { createEngine } from '../../../src/lib/pension/engine';
import { resolveParams, nextParams } from '../../../src/lib/pension/params';
import { auswerten } from '../../../src/lib/pension/auswertung';
import { EXAMPLE, clone, migrate, sanitize } from '../../../src/lib/pension/state';
import { bildDaten, bildSzenario, bildSvg, bildLegende, bildText } from '../../../src/pension-ui/bild';
import { terms } from '../../../src/pension-ui/glossar';
import { themaHinzu, vergleichStarten } from '../../../src/lib/pension/themen';
import { A0, boot, q } from './hilfen';

const E = createEngine(resolveParams(params, 2026), A0, nextParams(params, 2026));
const neu = () => migrate(clone(EXAMPLE));
const css = readFileSync(resolve(process.cwd(), 'src/styles/pension/styles.css'), 'utf8');
const formular = () => { const S = neu(); S.ui.mode = 'form'; return boot(S); };

describe('Linke Spalte ein- und ausblenden', () => {
  it('sanitize: nur «auf» und «zu», Stände ohne das Feld bleiben gültig', () => {
    const S = neu();
    delete S.ui.leiste; expect(sanitize(clone(S)).ui.leiste).toBe('auf');
    S.ui.leiste = 'zu'; expect(sanitize(clone(S)).ui.leiste).toBe('zu');
    S.ui.leiste = '<img>'; expect(sanitize(clone(S)).ui.leiste).toBe('auf');
  });
  it('Knopf blendet aus, der Knopf über der Bühne wieder ein; der Fokus steht auf der Gegenrichtung', () => {
    const { app } = formular();
    q('#schritte [data-leiste="zu"]').click();
    expect(document.body.dataset.leiste).toBe('zu');
    expect(app.S.ui.leiste).toBe('zu');
    expect(document.activeElement).toBe(q('#schritteMobil [data-leiste="auf"]'));
    q('#schritteMobil [data-leiste="auf"]').click();
    expect(document.body.dataset.leiste).toBe('auf');
    expect(document.activeElement).toBe(q('#schritte [data-leiste="zu"]'));
  });
  it('ein Schritt 1 bis 4 und der Karteneditor blenden die Spalte wieder ein; 5 bis 8 lassen sie zu', () => {
    const { app } = formular();
    app.leiste(false);
    app.schritt.go('ansatz');
    expect(document.body.dataset.leiste).toBe('zu');
    app.schritt.go('einkommen');
    expect(document.body.dataset.leiste).toBe('auf');
    app.leiste(false);
    const key = themaHinzu(app.S, 'reisen'); app.changed(); app.themen.render();
    app.themen.oeffne(key);
    expect(document.body.dataset.leiste).toBe('auf');
  });
  it('wirkt nur ab 1025 px am Bildschirm; der Formularmodus nutzt dort die ganze Breite', () => {
    const i = css.indexOf('/* Der Formularmodus nutzt die ganze Fensterbreite');
    expect(css.slice(0, i).trimEnd().endsWith('@media screen and (min-width: 1025px) {')).toBe(true);
    expect(css.slice(i)).toContain('body[data-mode="form"] .wrap { max-width: none; }');
    expect(css.slice(i)).toContain('body[data-mode="form"][data-leiste="zu"] .formwrap { display: none; }');
    expect(css).toContain('.leisteknopf, .schritte-mobil .leisteauf { display: none; }');
  });
});

describe('Bild', () => {
  const S = neu(), R = auswerten(S, E);
  it('Achse: kein Alter steht in der Beschriftung «heute»', () => {
    const svg = bildSvg(bildDaten(S, R, E), { w: 880, h: 400 });
    const heuteX = +svg.match(/class="heute" x="([\d.]+)"/)[1];
    const ticks = [...svg.matchAll(/<text x="([\d.]+)" y="[\d.]+" text-anchor="middle">\d+<\/text>/g)].map((m) => +m[1]);
    expect(ticks.length).toBeGreaterThan(3);
    ticks.forEach((x) => expect(x - heuteX).toBeGreaterThanOrEqual(44));
  });
  it('Kernaussage «reicht bis»: steht unter den Linien, wenn sie oben rechts im Feld verlaufen', () => {
    const s = neu(); s.ausgabenRuhestand = 4000; s.wuensche = [];
    const r = auswerten(s, E), d = bildDaten(s, r, E);
    expect(d.reach.base.dep).toBeNull();
    const svg = bildSvg(d, { w: 880, h: 400 });
    const y = +svg.match(/<text class="kern halo" x="[\d.]+" y="([\d.]+)"[^>]*>reicht bis/)[1];
    const pfad = svg.match(/<path d="(M[^"]+)" fill="none" stroke="var\(--s1\)" stroke-width="2.5"/)[1];
    const ende = +pfad.split('L').at(-1).split(',')[1];
    // Grundlinie des Texts mindestens eine Schrifthöhe unter dem Linienende oder klar darüber
    expect(y - ende >= 12 || ende - y >= 6).toBe(true);
  });
  it('Szenario «früher aufhören»: Einkommen und Vermögen des Szenarios, der Plan gestrichelt, ohne Stresstest', () => {
    const plan = bildDaten(S, R, E), d = bildSzenario(S, R, E, 'letzter Arbeitstag sofort');
    expect(d.szenario.plan.length).toBe(plan.jahre.length + 1);
    const lohn = (x) => x.jahre.reduce((a, j) => a + j.lohn, 0);
    expect(lohn(d)).toBeLessThan(lohn(plan));
    expect(d.max.vermoegen).toBeGreaterThanOrEqual(plan.max.vermoegen);
    const svg = bildSvg(d, { w: 880, h: 400 });
    expect(svg).toContain('data-linie="plan"');
    expect(svg).not.toContain('stroke-dasharray="5 4"');
    expect(bildLegende(d)).toContain('Freies Vermögen im Szenario');
    expect(bildLegende(d)).not.toContain('Stresstest');
    expect(bildText(d)).toContain('Szenario: letzter Arbeitstag sofort; der heutige Plan als gestrichelte Linie.');
    expect(bildSvg(bildSzenario(S, R, E, '<b>x'), { w: 880, h: 400 })).not.toContain('<b>x');
  });
});

describe('Lohn je Person und Satz zum früheren Ausstieg', () => {
  const S = neu(), R = auswerten(S, E);
  it('Rechenkern: lohnP je Jahr ergibt zusammen den Lohn', () => {
    R.base.rows.forEach((x) => expect(x.lohnP.reduce((a, b) => a + b, 0)).toBeCloseTo(x.lohn, 6));
    expect(R.base.rows.some((x) => x.lohnP[1] > 0)).toBe(true);
  });
  it('Paar: Lohn Person 1 und Person 2 getrennt in Bild und Legende; die Summe bleibt', () => {
    const d = bildDaten(S, R, E);
    expect(d.lohnGetrennt).toBe(true);
    d.jahre.forEach((j) => expect(j.lohn1 + j.lohn2).toBeCloseTo(j.lohn, 6));
    const svg = bildSvg(d, { w: 880, h: 400 });
    expect(svg).toContain('data-reihe="lohn1"');
    expect(svg).toContain('data-reihe="lohn2"');
    expect(svg).not.toContain('data-reihe="lohn"');
    expect(bildLegende(d)).toContain('Lohn P1');
    expect(bildLegende(d)).toContain('Lohn P2');
  });
  it('Alleinstehend: ein Lohn wie bisher', () => {
    const s = neu(); s.haushalt = 'single';
    const d = bildDaten(s, auswerten(s, E), E);
    expect(d.lohnGetrennt).toBe(false);
    expect(bildSvg(d, { w: 880, h: 400 })).toContain('data-reihe="lohn"');
    expect(bildLegende(d)).toContain('>Lohn<');
  });
  it('«Geschafft» nennt, dass der Zeitpunkt des Reglers gerechnet ist', () => {
    const { app } = formular();
    app.schritt.go('vergleich');
    const b = q('#sofortBox'); b.open = true; b.dispatchEvent(new Event('toggle'));
    q('#sofort [data-wi-set="max"]').click();
    const R2 = auswerten(app.S, E, undefined);
    const t = q('#sofort .wi-goaltxt')?.textContent || '';
    if (t.startsWith('Geschafft.') && t.includes('früheren Ausstieg')) expect(t).toContain('Gerechnet und im Bild gezeigt ist der Zeitpunkt des Reglers');
    expect(t).not.toContain('Es ginge sogar noch früher');
    expect(R2).toBeTruthy();
  });
});

describe('Schritt 6: das Bild folgt dem Regler «früher aufhören»', () => {
  const offen = (auf) => { const b = q('#sofortBox'); b.open = auf; b.dispatchEvent(new Event('toggle')); };
  it('aufgeklappt zeigt das Bild das Szenario mit Hinweis, zugeklappt und in Schritt 5 den Plan', () => {
    const { app } = formular();
    app.schritt.go('vergleich');
    expect(q('#tabBody .bildszen')).toBeNull();
    offen(true);
    expect(q('#tabBody .bildszen').textContent).toMatch(/^Das Bild zeigt das Szenario: letzter Arbeitstag .*Gestrichelt: Ihr heutiger Plan\.$/);
    expect(q('#bild [data-linie="plan"]')).not.toBeNull();
    app.schritt.go('urteil');
    expect(q('#tabBody .bildszen')).toBeNull();
    expect(q('#bild [data-linie="plan"]')).toBeNull();
    app.schritt.go('vergleich');
    expect(q('#tabBody .bildszen')).not.toBeNull();
    offen(false);
    expect(q('#tabBody .bildszen')).toBeNull();
  });
  it('mit laufendem Vergleich bleibt das Bild der Ansichten das des Plans', () => {
    const { app } = formular();
    const key = themaHinzu(app.S, 'reisen');
    vergleichStarten(app.S, key, { betrag: 15000, von: 58, bis: 75 }, { betrag: 25000, von: 58, bis: 75 }); app.changed();
    app.schritt.go('vergleich');
    offen(true);
    expect(q('#tabBody .bildszen')).toBeNull();
  });
});

describe('Planungshorizont und Ampel', () => {
  it('«Planungshorizont anpassen» in der Lesehilfe führt zum Feld in Schritt 3 und blendet die Spalte ein', () => {
    const { app } = formular();
    app.schritt.go('urteil');
    app.leiste(false);
    const knopf = q('#tabBody .lesehilfe button[data-horizont]');
    expect(knopf.textContent).toBe('Planungshorizont anpassen');
    expect(q('#tabBody .lesehilfe').textContent).toContain(`Gerechnet wird bis ${app.R.horizont}`);
    expect(q('#bild text[data-horizont]').textContent).toContain(`Horizont ${app.R.horizont}`);
    knopf.click();
    expect(app.S.ui.schritt).toBe('vermoegen');
    expect(document.body.dataset.leiste).toBe('auf');
    expect(document.activeElement).toBe(q('#f_horizontModus'));
    expect(q('#f_horizontModus').closest('details.sec').open).toBe(true);
  });
  it('im Tutor gibt es den Knopf nicht', () => {
    const S = neu(); S.ui.mode = 'tutor';
    boot(S);
    expect(q('#tabBody button[data-horizont]')).toBeNull();
  });
  it('das Wort der Ampel ist ein Begriff mit Erklärung', () => {
    const { app } = formular();
    const k = q('#kicker');
    expect(k.textContent).toBe({ gruen: 'Reicht', gelb: 'Knapp', rot: 'Reicht nicht' }[app.R.amp.st]);
    expect(k.querySelector('button.gl[data-gl="ampel"]')).not.toBeNull();
    const [titel, text] = terms(app).ampel;
    expect(titel).toBe('Ampel: Reicht, Knapp, Reicht nicht');
    for (const t of ['<b>Reicht</b>', '<b>Knapp</b>', '<b>Reicht nicht</b>', 'Basisszenario', 'Stresstest', `Reserve von ${app.S.reserveJahre} Jahresausgaben`, 'erst ab 85']) expect(text).toContain(t);
  });
  it('die Erklärung beschreibt die Ampel des Rechenkerns (ohne Liegenschaft)', () => {
    // rot: im Basisszenario aufgebraucht; grün: Basis reicht mit Reserve und der Stresstest geht nicht aus; sonst gelb
    const farben = new Set();
    for (const a of [3000, 6000, 8000, 9000, 10000, 12000, 16000]) {
      const s = neu(); s.liegenschaften = []; s.amortisationen = []; s.ausgabenRuhestand = a;
      const amp = auswerten(s, E).amp;
      const erwartet = amp.base.depleted != null ? 'rot' : E.reicht(amp.base) && amp.stress.depleted == null ? 'gruen' : 'gelb';
      expect(amp.st).toBe(erwartet);
      farben.add(amp.st);
    }
    expect(farben.size).toBeGreaterThanOrEqual(2);
  });
});

describe('Ansichten als Knöpfe', () => {
  it('im Formular ab 769 px gerahmt, die gewählte gefüllt; ohne Linie darunter', () => {
    const t = css.slice(css.indexOf('/* Die Ansichten sind Knöpfe'));
    expect(t).toContain('body[data-mode="form"] #resTabs[role="tablist"] { gap: 4px; border-bottom: 0;');
    expect(t).toContain('border: 1px solid var(--ctl-line)');
    expect(t).toContain('body[data-mode="form"] #resTabs button[aria-selected="true"] { color: var(--accent-ink); background: var(--accent); border-color: var(--accent); }');
    expect(t).toMatch(/#resTabs button \{ min-height: 44px;/);
  });
});
