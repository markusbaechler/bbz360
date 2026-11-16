// Schlanke SVG-Diagramme (Linie mit Fläche) und der Tooltip für Maus, Touch und Tastatur (auch für das Bild, bild.js).
import { axisChf } from '../lib/pension/format';

export interface ChartMarker { x: number; label: string }
export interface ChartSerie { color: string; area?: boolean; pts: [number, number][] }
export interface LineChartOptionen { label: string; series: ChartSerie[]; markers?: ChartMarker[]; height?: number; tip: (i: number) => string | null | undefined | false }
/** Zeile des Tooltips: [Farbe, Bezeichnung, Wert]. */
export type TipZeile = [c: string | null | undefined | false, l: string, v: string | number];

function niceStep(range: number, n: number) {
  const raw = range / n || 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}
export function yScale(ymin: number, ymax: number, n = 4) {
  const step = niceStep(ymax - ymin, n);
  const lo = Math.floor(ymin / step) * step, hi = Math.ceil(ymax / step) * step || step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(v);
  return { lo, hi, ticks };
}

function frame(host: HTMLElement, H: number, ys: ReturnType<typeof yScale>, xmin: number, xmax: number, markers: ChartMarker[] = []) {
  const W = Math.max(280, host.clientWidth || 600);
  const narrow = W < 480;
  const m = { l: narrow ? 44 : 58, r: 12, t: markers.length ? 30 : 12, b: 26 };
  const X = (x: number) => m.l + (xmax === xmin ? 0 : ((x - xmin) / (xmax - xmin)) * (W - m.l - m.r));
  const Y = (y: number) => m.t + (1 - (y - ys.lo) / (ys.hi - ys.lo)) * (H - m.t - m.b);
  let g = '';
  ys.ticks.forEach((t) => {
    g += `<line class="${t === 0 ? 'zero' : 'grid'}" x1="${m.l}" x2="${W - m.r}" y1="${Y(t)}" y2="${Y(t)}"/><text x="${m.l - 6}" y="${Y(t) + 4}" text-anchor="end">${axisChf(t)}</text>`;
  });
  const xs = niceStep(xmax - xmin, Math.max(3, Math.floor((W - 80) / (narrow ? 50 : 70))));
  for (let x = Math.ceil(xmin / xs) * xs; x <= xmax; x += xs) g += `<text x="${X(x)}" y="${H - 6}" text-anchor="middle">${x}</text>`;
  let lastX = -1e9;
  markers.forEach((mk, i) => {
    const x = X(mk.x);
    g += `<line class="mk" x1="${x}" x2="${x}" y1="${m.t - 4}" y2="${H - m.b}" stroke-dasharray="3 3"/>`;
    const dy = x - lastX < 90 ? 0 : 12;
    g += `<text class="mkt" x="${x + 3}" y="${m.t - 16 + (i % 2 && dy === 0 ? 10 : 0)}">${mk.label}</text>`;
    lastX = x;
  });
  return { W, H, m, X, Y, g };
}

/** Tooltip für Maus, Touch und Tastatur; f: { W, X }, svg braucht eine Linie .xh. Auch für das Bild (bild.js). */
export function attachTip(host: HTMLElement, svg: SVGSVGElement, f: { W: number; X: (x: number) => number }, xsList: number[], tip: (i: number) => string | null | undefined | false) {
  const el = document.createElement('div');
  el.className = 'tip';
  el.hidden = true;
  host.appendChild(el);
  const cross = svg.querySelector<SVGLineElement>('.xh')!;
  let akt = -1;
  const show = (clientX: number) => {
    const r = svg.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * f.W;
    let best = 0, bd = Infinity;
    xsList.forEach((x, i) => { const d = Math.abs(f.X(x) - px); if (d < bd) { bd = d; best = i; } });
    zeige(best);
  };
  const zeige = (best: number) => {
    akt = best;
    const html = tip(best);
    if (!html) { el.hidden = true; return; }
    el.innerHTML = html;
    el.hidden = false;
    const x = f.X(xsList[best]);
    cross.setAttribute('x1', x as unknown as string); cross.setAttribute('x2', x as unknown as string); cross.style.display = '';
    const hostW = host.clientWidth, tw = el.offsetWidth;
    const left = (x / f.W) * hostW;
    el.style.left = Math.max(0, Math.min(hostW - tw, left + (left > hostW / 2 ? -tw - 12 : 12))) + 'px';
    el.style.top = '6px';
  };
  const hide = () => { el.hidden = true; cross.style.display = 'none'; };
  // Tastatur: Das Diagramm ist fokussierbar, die Pfeiltasten gehen Jahr für Jahr durch die Werte; die Werte
  // werden dabei auch vorgelesen (aria-live), Escape blendet sie aus.
  svg.setAttribute('tabindex', '0');
  svg.setAttribute('aria-roledescription', 'Diagramm, Werte mit den Pfeiltasten');
  el.setAttribute('role', 'status');
  svg.addEventListener('keydown', (e) => {
    const n = xsList.length;
    const ziel = ({ ArrowRight: Math.min(n - 1, akt + 1), ArrowLeft: Math.max(0, akt - 1), Home: 0, End: n - 1 } as Record<string, number | undefined>)[e.key];
    if (e.key === 'Escape') { hide(); return; }
    if (ziel == null || !n) return;
    e.preventDefault();
    zeige(ziel);
  });
  svg.addEventListener('focus', () => { if (svg.matches(':focus-visible') && xsList.length) zeige(Math.max(0, akt)); });
  svg.addEventListener('blur', hide);
  svg.addEventListener('pointermove', (e) => show(e.clientX));
  svg.addEventListener('pointerdown', (e) => show(e.clientX));
  svg.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
}

/** Liniendiagramm: o = { label, series: [{ color, area, pts: [[x, y]] }], markers, tip(i) } */
export function lineChart(host: HTMLElement, o: LineChartOptionen) {
  const all = o.series.flatMap((s) => s.pts);
  const xmin = Math.min(...all.map((p) => p[0])), xmax = Math.max(...all.map((p) => p[0]));
  const ys = yScale(Math.min(0, ...all.map((p) => p[1])), Math.max(1, ...all.map((p) => p[1])));
  const H = o.height || (host.clientWidth < 480 ? 230 : 280);
  const f = frame(host, H, ys, xmin, xmax, o.markers);
  let paths = '';
  o.series.forEach((s) => {
    const d = s.pts.map((p, i) => `${i ? 'L' : 'M'}${f.X(p[0]).toFixed(1)},${f.Y(p[1]).toFixed(1)}`).join('');
    paths += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.2" stroke-linejoin="round"/>`;
  });
  host.innerHTML = `<svg viewBox="0 0 ${f.W} ${H}" role="img" aria-label="${o.label}">${f.g}${paths}<line class="xh" y1="${f.m.t}" y2="${H - f.m.b}" style="display:none"/></svg>`;
  attachTip(host, host.querySelector('svg')!, f, o.series[0].pts.map((p) => p[0]), o.tip);
}

export const tipRows = (title: string, rows: TipZeile[]) => `<div class="th">${title}</div>` + rows.map(([c, l, v]) => `<div class="tr"><span>${c ? `<i style="background:${c}"></i>` : ''}${l}</span><b>${v}</b></div>`).join('');
