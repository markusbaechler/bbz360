// Das Bild der Bühne im PDF-Bericht: als Vektorgrafik direkt mit jsPDF gezeichnet, aus denselben Daten wie am
// Bildschirm (bildDaten bzw. bildSzenario, bild.js). Hier wird nichts gerechnet, nur gezeichnet.
// bbz Brand System (Diagramme): Reihenfarben aus chart.1 bis chart.4, Direktbeschriftung und zusätzlich eine Legende
// in der sichtbaren Reihenfolge, Schraffur chart.4 45° steigend, keine gestapelten Flächen über der Zeit (das
// Einkommen steht als gestapelte Säule je Jahr), Beschriftungen in der Grundschrift, Legenden in text.muted.
import { axisChf } from '../lib/pension/format';
import { yScale } from './charts';
import { bildReihen, markenLayout } from './bild';
import type { jsPDF } from 'jspdf';
import type { BildDaten, BildJahr, BildLinie, BildReihe } from './bild';

type Rgb = [number, number, number];
/** Eintrag der Legende: [Art, Farbe, Text]. */
export type BildPdfLegendenEintrag = [art: 'sq' | 'hx' | 'linie' | 'strich', rgb: Rgb, t: string];
export interface BildPdfOptionen { x: number; y: number; w: number; h: number; font?: string; txt?: (s: unknown) => string; legende?: boolean }
/** Längste Folge von Jahren mit gemeinsamem Band (Direktbeschriftung). */
type Band = { a: number; b: number; lo: number; hi: number };

// Markenfarben aus bbz-base.css als RGB
const mix = (c: Rgb, a: number) => c.map((v) => Math.round(255 - (255 - v) * a)) as Rgb;
const chart1: Rgb = [0, 33, 61], chart2: Rgb = [190, 55, 60], chart3: Rgb = [211, 198, 175], chart4: Rgb = [100, 162, 216];
export const BILD_RGB: Record<BildReihe | 'vermoegen' | 'flaeche' | 'stress' | 'luecke' | 'strong' | 'text' | 'muted' | 'line' | 'grid' | 'weiss', Rgb> = {
  lohn: chart1, lohn1: chart1, lohn2: [8, 81, 145], uebrig: mix(chart1, 0.45), pk: chart3, ahv: chart4,
  vermoegen: chart1, flaeche: mix(chart1, 0.12), stress: chart2, luecke: chart4,
  strong: [21, 24, 30], text: [60, 66, 78], muted: [83, 89, 101], line: [191, 196, 207], grid: [217, 220, 227], weiss: [255, 255, 255],
};
const C = BILD_RGB;
/** Reihen mit dunkler Fläche: Beschriftung darin weiss (text.on-brand). */
const DUNKEL = new Set(['lohn', 'lohn1', 'lohn2', 'uebrig']);

/**
 * Einträge der Legende in der sichtbaren Reihenfolge: [Art, Farbe, Text]; Art = 'sq' (Fläche), 'hx' (Schraffur),
 * 'linie' oder 'strich' (gestrichelt).
 */
export function bildPdfLegende(d: BildDaten): BildPdfLegendenEintrag[] {
  if (d.stufe < 2) return [];
  const it: BildPdfLegendenEintrag[] = bildReihen(d).filter(([k]) => d.jahre.some((j) => j[k] > 0.5)).map(([k, t]) => ['sq', C[k], t]);
  if (d.stufe >= 3) {
    it.push(['linie', C.strong, 'Ausgaben inkl. Steuern'], ['hx', C.luecke, 'Aus dem Vermögen']);
    if (d.szenario) it.push(['linie', C.vermoegen, 'Freies Vermögen im Szenario'], ['strich', C.text, 'heutiger Plan']);
    else it.push(['linie', C.vermoegen, 'Freies Vermögen'], ['strich', C.stress, 'Stresstest']);
  }
  return it;
}

/**
 * Zeichnet das Bild. o = { x, y, w, h (mm), font, txt (Zeichen auf den Schriftumfang bringen), legende }.
 * Gezeichnet wird in einem Raster von 700 Einheiten Breite wie am Bildschirm; k rechnet es in mm um.
 * Liefert die belegte Höhe in mm (Bild und Legende).
 */
export function bildPdf(doc: jsPDF, d: BildDaten, o: BildPdfOptionen) {
  const { x, y, w, h, font = 'helvetica', txt = (s) => String(s), legende = true } = o;
  const W = 700, k = w / W, H = h / k, fs = 12, L = 76, Rr = 56;
  const mx = (v: number) => x + v * k, my = (v: number) => y + v * k, pt = (px: number) => (px * k) / 0.3528;
  const xs = d.a0, xe = Math.max(d.xEnd, xs + 1);
  const X = (a: number) => L + ((Math.max(xs, Math.min(xe, a)) - xs) / (xe - xs)) * (W - L - Rr);
  const lay = markenLayout(d, { w: W }), nZeilen = Math.max(1, ...lay.map((m) => m.zeile + 1));
  const top = 4, gap = nZeilen * (fs + 4) + 12, ax = fs + 10;
  const ph = Math.max(24, (H - top - gap - ax) / 2), t1 = top, u1 = t1 + ph, t2 = u1 + gap, u2 = t2 + ph;
  const s1 = yScale(0, Math.max(1, d.max.proJahr), 3), s2 = yScale(0, Math.max(1, d.max.vermoegen), 2);
  const Y1 = (v: number) => u1 - (Math.max(0, v) / s1.hi) * ph, Y2 = (v: number) => u2 - (Math.max(0, v) / s2.hi) * ph;
  const J = d.jahre, RH = bildReihen(d);

  // ---------- Zeichenhilfen (Einheiten des Rasters) ----------
  const strich = (rgb: Rgb, px: number, dash?: number[] | null) => { doc.setDrawColor(...rgb); doc.setLineWidth(px * k); doc.setLineDashPattern(dash ? dash.map((v) => v * k) : [], 0); };
  const linie = (xa: number, ya: number, xb: number, yb: number) => doc.line(mx(xa), my(ya), mx(xb), my(yb));
  const flaeche = (rgb: Rgb, xa: number, ya: number, bw: number, bh: number) => { doc.setFillColor(...rgb); doc.rect(mx(xa), my(ya), bw * k, bh * k, 'F'); };
  const pfad = (pts: number[][]) => { pts.forEach(([a, b], i) => (i ? doc.lineTo(mx(a), my(b)) : doc.moveTo(mx(a), my(b)))); };
  const zug = (pts: number[][], rgb: Rgb, px: number, dash?: number[]) => { if (pts.length < 2) return; strich(rgb, px, dash); doc.setLineJoin('round'); pfad(pts); doc.stroke(); };
  const schrift = (gr: number, fett: boolean) => { doc.setFont(font, fett ? 'bold' : 'normal'); doc.setFontSize(pt(gr)); };
  const breite = (t: unknown) => doc.getTextWidth(txt(t)) / k;
  /** Text; o.halo: weisse Fläche dahinter, damit er über Linien lesbar bleibt. */
  const text = (t: unknown, px: number, py: number, { gr = fs, fett = false, rgb = C.muted, align = 'left', halo = false }: { gr?: number; fett?: boolean; rgb?: Rgb; align?: 'left' | 'center' | 'right'; halo?: boolean } = {}) => {
    schrift(gr, fett);
    const s = txt(t);
    if (halo) { const bw = breite(s) + 4, xl = align === 'right' ? px - bw + 2 : align === 'center' ? px - bw / 2 : px - 2; flaeche(C.weiss, xl, py - gr + 1, bw, gr + 2); }
    doc.setTextColor(...rgb);
    doc.text(s, mx(px), my(py), { align });
  };

  // ---------- Vermögensfläche (unter Raster und Linien) ----------
  const reihe = (feld: 'vermoegen' | 'stress') => [[xs, d.vStart ?? 0], ...J.filter((j) => j[feld] != null).map((j) => [j.x1, j[feld]])] as BildLinie;
  const pv = d.stufe >= 3 && J.length ? reihe('vermoegen') : [];
  if (pv.length > 1) {
    doc.setFillColor(...C.flaeche);
    pfad([...pv.map(([a, v]) => [X(a), Y2(v)]), [X(pv[pv.length - 1][0]), u2], [X(xs), u2]]);
    doc.close(); doc.fill();
  }

  // ---------- Raster, Grundlinien, Werte ----------
  const pxJahr = (W - L - Rr) / (xe - xs), schritt = pxJahr * 5 >= 3 * fs + 4 ? 5 : 10;
  const ticks: number[] = [];
  for (let a = Math.ceil(xs / schritt) * schritt; a <= xe + 1e-9; a += schritt) if (X(a) - X(xs) >= 44) ticks.push(a);
  strich(C.grid, 0.6);
  ticks.forEach((a) => { linie(X(a), t1, X(a), u1); linie(X(a), t2, X(a), u2); });
  if (d.stufe >= 2) s1.ticks.filter((t) => t > 0).forEach((t) => { strich(C.grid, 0.6); linie(L, Y1(t), W - Rr, Y1(t)); text(axisChf(t), W - Rr + 6, Y1(t) + 4); });
  if (d.stufe >= 3) s2.ticks.filter((t) => t > 0).forEach((t) => { strich(C.grid, 0.6); linie(L, Y2(t), W - Rr, Y2(t)); text(axisChf(t), W - Rr + 6, Y2(t) + 4); });

  // ---------- Einkommen: gestapelte Säule je Jahr (Jahresbeträge, angefangene Jahre hochgerechnet) ----------
  const stapel = J.map((j) => { let acc = 0; return RH.map(([f]) => { const lo = acc; acc += j[f] / j.anteil; return [lo, acc]; }); });
  const ein = (j: BildJahr) => (j.lohn + j.uebrig + j.pk + j.ahv) / j.anteil;
  const spalt = Math.min(1.6, pxJahr * 0.14);
  const saeule = (j: BildJahr) => { const bw = X(j.x1) - X(j.x0); return bw > 3 * spalt ? [X(j.x0) + spalt / 2, bw - spalt] : [X(j.x0), bw]; };
  if (d.stufe >= 2) J.forEach((j, i) => RH.forEach(([f], s) => {
    const [lo, hi] = stapel[i][s];
    if (hi - lo <= 0) return;
    const [xa, bw] = saeule(j);
    flaeche(C[f], xa, Y1(hi), bw, Y1(lo) - Y1(hi));
  }));

  // ---------- Lücke «aus dem Vermögen» (Schraffur 45° steigend), Ausgaben ----------
  if (d.stufe >= 3 && J.length) {
    strich(C.luecke, 1.1);
    J.filter((j) => j.ausVermoegen! > 0.5).forEach((j) => {
      const [xa, bw] = saeule(j), xb = xa + bw, ya = Y1(j.bedarf! / j.anteil), yb = Y1(ein(j));
      // Schar x + y = c, durchgehend über alle Jahre; je Jahr auf die Fläche begrenzt
      for (let c = Math.ceil((xa + ya) / 6) * 6; c < xb + yb; c += 6) {
        const p0 = Math.max(xa, c - yb), p1 = Math.min(xb, c - ya);
        if (p1 - p0 > 0.2) linie(p0, c - p0, p1, c - p1);
      }
    });
    const pts: number[][] = [];
    J.forEach((j) => { const yb = Y1(j.bedarf! / j.anteil); pts.push([X(j.x0), yb], [X(j.x1), yb]); });
    zug(pts, C.strong, 2);
  }
  strich(C.line, 1);
  linie(L, u1, W - Rr, u1); linie(L, u2, W - Rr, u2);

  // ---------- Vermögen, Stresstest bzw. heutiger Plan ----------
  if (pv.length > 1) {
    if (d.szenario) zug((d.szenario.plan || []).map(([a, v]) => [X(a), Y2(v)]), C.text, 1.6, [7, 5]);
    else zug(reihe('stress').map(([a, v]) => [X(a), Y2(v)]), C.stress, 1.6, [5, 4]);
    zug(pv.map(([a, v]) => [X(a), Y2(v)]), C.vermoegen, 2.5);
  }

  // ---------- Marken und vorgemerkte Themen ----------
  lay.forEach((m) => { strich(m.pin ? C.muted : C.text, 0.8, m.pin ? [2, 3] : [4, 4]); linie(m.x, t1, m.x, u2); });
  doc.setLineDashPattern([], 0);
  // Beschriftungen nach allen Linien, auf weisser Fläche: keine Linie läuft durch einen Text
  lay.forEach((m) => text(m.t, m.rechts ? m.r : m.l, u1 + (m.zeile + 1) * (fs + 4) + 2, { fett: !m.pin, rgb: m.pin ? C.muted : C.strong, align: m.rechts ? 'right' : 'left', halo: true }));

  // ---------- Achse ----------
  const ya = u2 + fs + 5;
  text('heute', X(xs), ya, { rgb: C.text });
  ticks.forEach((a) => text(String(a), X(a), ya, { align: 'center' }));
  text(d.cpl ? 'Alter P1' : 'Alter', L - 8, ya, { align: 'right' });

  // ---------- Direktbeschriftung in den Flächen, wo sie Platz hat ----------
  if (d.stufe >= 2 && J.length) RH.forEach(([f, t], s) => {
    schrift(fs, true);
    const bw = breite(t) + 6;
    // Längste Folge von Jahren mit einem gemeinsamen Band, das die Schrift fasst (der Text bleibt in seiner Fläche)
    let best = null as Band | null, run = null as Band | null;
    const weite = (r: Band) => X(J[r.b].x1) - X(J[r.a].x0);
    J.forEach((_j, i) => {
      const [lo, hi] = stapel[i][s], ok = Y1(lo) - Y1(hi) >= fs + 4;
      const lo2 = run ? Math.max(run.lo, lo) : lo, hi2 = run ? Math.min(run.hi, hi) : hi;
      if (run && Y1(lo2) - Y1(hi2) >= fs + 4) run = { a: run.a, b: i, lo: lo2, hi: hi2 };
      else run = ok ? { a: i, b: i, lo, hi } : null;
      if (run && (!best || weite(run) > weite(best))) best = run;
    });
    if (!best || weite(best) < bw + 4) return;
    text(t, (X(J[best.a].x0) + X(J[best.b].x1)) / 2, (Y1(best.lo) + Y1(best.hi)) / 2 + fs * 0.35, { fett: true, rgb: DUNKEL.has(f) ? C.weiss : C.strong, align: 'center' });
  });
  if (d.stufe >= 3 && J.length) {
    schrift(fs, true);
    const t = 'Ausgaben inkl. Steuern', bw = breite(t) + 6;
    const j = J[Math.min(J.length - 1, Math.floor(J.length * 0.7))], xm = Math.min(W - Rr - bw / 2, Math.max(L + bw / 2, X((j.x0 + j.x1) / 2)));
    const yb = Y1(j.bedarf! / j.anteil);
    text(t, xm, yb - 6 < t1 + fs ? yb + fs + 4 : yb - 6, { fett: true, rgb: C.strong, align: 'center', halo: true });
    // Kernaussage am Vermögen: aufgebraucht mit … bzw. reicht bis …
    const dep = d.reach?.base?.dep;
    if (dep != null) {
      const tt = `aufgebraucht mit ${Math.floor(dep + 1e-9)}`, px = X(dep);
      schrift(fs + 1, true);
      const rechts = px + breite(tt) + 8 > W - Rr;
      doc.setFillColor(...C.stress); doc.circle(mx(px), my(u2), 5 * k, 'F');
      text(tt, rechts ? px - 6 : px + 6, u2 - 8, { gr: fs + 1, fett: true, rgb: C.strong, align: rechts ? 'right' : 'left', halo: true });
    } else if (d.H != null) {
      const tt = `reicht bis ${d.H}`;
      schrift(fs + 1, true);
      const ab = xs + ((W - Rr - breite(tt) - 12 - L) / (W - L - Rr)) * (xe - xs);
      const ys = J.filter((q) => q.x1 >= ab).flatMap((q) => [q.vermoegen, d.szenario ? null : q.stress]).filter((v) => v != null).map(Y2);
      (d.szenario?.plan || []).filter(([a]) => a >= ab).forEach(([, v]) => ys.push(Y2(v)));
      const oben = t2 + fs + 2, unter = Math.max(...ys, t2) + fs + 7;
      text(tt, W - Rr - 4, ys.length && Math.min(...ys) < oben + 6 && unter <= u2 - 4 ? unter : oben, { gr: fs + 1, fett: true, rgb: C.strong, align: 'right', halo: true });
    }
  }
  // Feldnamen
  text('pro Jahr', L - 8, t1 + fs, { fett: true, rgb: C.strong, align: 'right' });
  text('Vermögen', L - 8, t2 + fs, { fett: true, rgb: C.strong, align: 'right' });

  // ---------- Legende in der sichtbaren Reihenfolge ----------
  let yl = u2 + ax + 6;
  const it = legende ? bildPdfLegende(d) : [];
  if (it.length) {
    schrift(fs - 1, false);
    let xl = L;
    it.forEach(([art, rgb, t]) => {
      const bw = 22 + breite(t) + 14;
      if (xl + bw > W && xl > L) { xl = L; yl += fs + 5; }
      const ym = yl + 5;
      if (art === 'sq') flaeche(rgb, xl, yl, 14, 10);
      else if (art === 'hx') { strich(rgb, 1.1); for (let c = 4; c < 24; c += 5) { const p0 = Math.max(0, c - 10), p1 = Math.min(14, c); linie(xl + p0, yl + c - p0, xl + p1, yl + c - p1); } }
      else { strich(rgb, art === 'strich' ? 1.6 : 2.2, art === 'strich' ? [4, 3] : null); linie(xl, ym, xl + 16, ym); doc.setLineDashPattern([], 0); }
      text(t, xl + 21, yl + 9, { gr: fs - 1 });
      xl += bw;
    });
    yl += fs + 4;
  }
  return yl * k;
}
