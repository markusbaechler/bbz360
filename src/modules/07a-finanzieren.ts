// ============================================================================
// 07a-finanzieren.ts — Eigenheimfinanzierung (Grammatik v3, Spec §4:
// 05-Simulations-Muster — Regler rechts, Ergebnis + Ampel-Kernzahl gross;
// Säule = KPI Tragbarkeit/Belehnung/Eigenmittel). Funktionsumfang = v1
// (07a_finanzieren.html) VOLLSTÄNDIG:
// - Rechenkern lib/finance.tragbarkeit() (verbatim, Fixtures T1–T3)
// - Prefills: cockpit_einkommen/-verpflichtungen, PK-Info-Label, erstes
//   Wohnen-Ziel → Kaufpreis, Alter aus p1geb; hydrate() aus
//   finanzierung_data überschreibt (v1-Reihenfolge)
// - Analyse: Status-Banner (5 Zustände), Gauge (Limit 33.5), Haus-Füllstand
//   (66.7/80-Schwellen, Amort-Badge), Amortisationsverlauf (Balken alle 2
//   Jahre, Tooltip, Labels Heute/+i/65), Warnhinweise (5 Regeln)
// - Varianten: Referenzkarte + 3 Varianten mit je 3 Tranchen (Produkt-
//   Select aus Marktzinsen, Betrag, Slider, Auto-Rebalance), Balkenvergleich
//   Kalk/Aktuell/Neu als SVG (Regel 5 statt Chart.js), Diff-Annotation,
//   Detail-Modal mit Tranchen-Aufstellung + Gegenüberstellung
// - Marktzinsen-Modal (10 Produkte) — edit-mode-Werkzeug (Regel 4)
// - Persistenz debounced als finanzierung_data {inputs, variants, rates}
// Regel 6: Banner-Zustände über ORT/Ikonografie + gedeckte Farben; kritisch
// nutzt --red NICHT (neutral dunkel), Grenzbereich Amber-Ton nur im Banner.
// ============================================================================
import '../styles/theme.css';
import '../styles/modules/07a-finanzieren.css';
import { BBZ } from '../lib/data';
import { mountNav } from '../lib/nav';
import { tragbarkeit, type TragbarkeitResult } from '../lib/finance';
import { fmt, parseNum as pN, age as calcAge } from '../lib/format';

interface Tranche { p: string; a: number }
interface Variant { id: number; tranches: Tranche[]; mtlTotal?: number }
const S = {
  tab: 'analysis' as 'analysis' | 'comparison',
  rates: { SARON: 1.65, '2J': 1.55, '3J': 1.45, '4J': 1.40, '5J': 1.35, '6J': 1.35, '7J': 1.40, '8J': 1.45, '9J': 1.50, '10J': 1.55 } as Record<string, number>,
  variants: [
    { id: 1, tranches: [{ p: 'SARON', a: 0 }, { p: 'SARON', a: 0 }, { p: 'SARON', a: 0 }] },
    { id: 2, tranches: [{ p: '10J', a: 0 }, { p: 'SARON', a: 0 }, { p: 'SARON', a: 0 }] },
    { id: 3, tranches: [{ p: 'SARON', a: 0 }, { p: '10J', a: 0 }, { p: 'SARON', a: 0 }] },
  ] as Variant[],
  C: {} as TragbarkeitResult & { curRent: number; age: number },
};

const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
const $i = (id: string): HTMLInputElement => document.getElementById(id) as HTMLInputElement;

// ── Prefills (v1 preload) ────────────────────────────────────────────────────
function preload(): void {
  const d = BBZ.all();
  const setIfEmpty = (id: string, val: number | null | undefined): void => {
    const e = $i(id);
    if (e && val && !pN(e.value)) e.value = fmt(val);
  };
  if (d.cockpit_einkommen) setIfEmpty('income', d.cockpit_einkommen);
  if (d.cockpit_verpflichtungen) setIfEmpty('obligations', d.cockpit_verpflichtungen);
  if (typeof d.cockpit_pk_saldo === 'number' && d.cockpit_pk_saldo > 0) {
    const e = $('pk-info-label');
    e.textContent = 'Vorhandenes PK-Guthaben (Cockpit): CHF ' + fmt(Math.round(d.cockpit_pk_saldo));
    e.hidden = false;
  }
  const ziele = Array.isArray(d.ziele) ? (d.ziele as Array<{ katId: string; betrag: number }>) : [];
  const wohnZiel = ziele.find((z) => z.katId === 'wohnen' && z.betrag > 0);
  if (wohnZiel) setIfEmpty('price', wohnZiel.betrag);
  if (typeof d.p1geb === 'string' && d.p1geb) {
    const alter = calcAge(d.p1geb);
    if (alter && !pN($i('age').value)) $i('age').value = String(alter);
  }
}

// ── Persistenz (v1, debounced) ───────────────────────────────────────────────
let persistTimer: number | undefined;
function schedulePersist(): void {
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(persist, 200);
}
const INPUT_IDS = ['income', 'obligations', 'currentRent', 'age', 'price', 'cashEquity', 'pensionWithdraw', 'pensionPledge', 'calcRate', 'sideRate'];
function persist(): void {
  const inputs: Record<string, string> = {};
  INPUT_IDS.forEach((id) => { inputs[id] = $i(id).value; });
  BBZ.set('finanzierung_data', {
    inputs,
    variants: S.variants.map((v) => ({ id: v.id, tranches: v.tranches.map((t) => ({ p: t.p, a: t.a })) })),
    rates: { ...S.rates },
  });
}
function hydrate(): void {
  const d = BBZ.get('finanzierung_data') as { inputs?: Record<string, unknown>; variants?: Array<{ tranches: Tranche[] }>; rates?: Record<string, number> } | null;
  if (!d || typeof d !== 'object') return;
  if (d.inputs) Object.entries(d.inputs).forEach(([id, val]) => {
    const e = document.getElementById(id) as HTMLInputElement | null;
    if (!e || val === '' || val == null) return;
    // migrate() normalisiert Beträge zu number (ADR-4) → Betragsfelder formatieren
    e.value = e.classList.contains('ni') && typeof val === 'number' ? fmt(val) : String(val);
  });
  if (Array.isArray(d.variants)) d.variants.forEach((sv, vi) => {
    if (S.variants[vi] && Array.isArray(sv.tranches)) sv.tranches.forEach((st, ti) => {
      if (S.variants[vi].tranches[ti]) {
        S.variants[vi].tranches[ti].p = st.p || S.variants[vi].tranches[ti].p;
        S.variants[vi].tranches[ti].a = Number(st.a) || 0;
      }
    });
  });
  if (d.rates) Object.entries(d.rates).forEach(([k, v]) => { if (k in S.rates) S.rates[k] = Number(v) || S.rates[k]; });
}

// ── Berechnung (Rechenkern lib/finance) ──────────────────────────────────────
function calculate(): void {
  const R = tragbarkeit({
    income: pN($i('income').value), obligations: pN($i('obligations').value),
    price: pN($i('price').value), cashEquity: pN($i('cashEquity').value),
    pensionWithdraw: pN($i('pensionWithdraw').value), pensionPledge: pN($i('pensionPledge').value),
    calcRate: pN($i('calcRate').value), sideRate: pN($i('sideRate').value),
    age: pN($i('age').value) || 40,
  });
  S.C = { ...R, curRent: pN($i('currentRent').value), age: pN($i('age').value) || 40 };
  updateAnalysis();
  updateVariants();
  schedulePersist();
}

function updateAnalysis(): void {
  const C = S.C;
  const price = pN($i('price').value);
  const kA = $('kpiAfford');
  kA.textContent = price > 0 ? Math.round(C.affordPct) + '%' : '–';
  kA.className = 'kv' + (C.affordPct > 40 || C.ltv > 80 ? ' crit' : C.affordPct > 33.5 ? ' warn' : '');
  const kL = $('kpiLTV');
  kL.textContent = price > 0 ? Math.round(C.ltv) + '%' : '–';
  kL.className = 'kv' + (C.ltv > 80 ? ' crit' : C.ltv > 66.7 ? ' warn' : '');
  $('kpiEquity').textContent = price > 0 ? Math.round(C.hardEqPct) + '%' : '–';
  $('kpiMonthly').textContent = price > 0 ? fmt(C.totalAnn / 12) : '–';
  $('kpiHypo').textContent = price > 0 ? fmt(C.totalHypo) : '–';

  // Banner (v1: 5 Zustände)
  const noAmort = C.annAmort <= 0;
  const banner = $('statusBanner');
  if (price <= 0) { banner.className = 'fz-banner s-idle'; $('statusIcon').textContent = '○'; $('statusText').textContent = 'Bitte Kaufpreis und Eigenmittel erfassen'; }
  else if (C.banner === 'ROT') { banner.className = 'fz-banner s-crit'; $('statusIcon').textContent = '✕'; $('statusText').textContent = 'Finanzierung kritisch – Prüfung erforderlich'; }
  else if (C.banner === 'ORANGE') { banner.className = 'fz-banner s-warn'; $('statusIcon').textContent = '⚠'; $('statusText').textContent = 'Grenzbereich – vertiefte Prüfung empfohlen'; }
  else if (noAmort) { banner.className = 'fz-banner s-ok'; $('statusIcon').textContent = '✓'; $('statusText').textContent = 'Ohne Amortisationspflicht finanzierbar – solide Ausgangslage'; }
  else { banner.className = 'fz-banner s-ok'; $('statusIcon').textContent = '✓'; $('statusText').textContent = 'Tragbarkeit und Belehnung gegeben'; }

  // Gauge
  $('gaugeVal').textContent = price > 0 ? Math.round(C.affordPct) + '%' : '–';
  const offset = 282 - (Math.min(C.affordPct, 60) / 60) * 282;
  const gp = document.getElementById('gaugePath') as unknown as SVGPathElement;
  gp.style.strokeDashoffset = String(price > 0 ? offset : 282);
  gp.style.stroke = C.affordPct > 33.5 ? (C.affordPct > 40 ? 'var(--ink)' : 'var(--amber)') : 'var(--blue)';

  // Haus
  $('houseVal').textContent = price > 0 ? Math.round(C.ltv) + '%' : '–';
  const fillH = price > 0 ? (Math.min(C.ltv, 100) / 100) * 80 : 0;
  const hf = document.getElementById('houseFill') as unknown as SVGRectElement;
  hf.setAttribute('y', String(90 - fillH));
  hf.setAttribute('height', String(fillH));
  hf.style.fill = C.ltv > 80.01 ? 'var(--ink)' : 'var(--blue)';
  const pVerp = pN($i('pensionPledge').value);
  const hasAmort = (C.h2ForAmort > 0 || pVerp > 0) && price > 0;
  $('houseBadge').innerHTML = hasAmort
    ? `<span class="fz-badge">${pVerp > 0 && C.h2ForAmort <= 0 ? 'Verpfändung amortisationspflichtig' : 'amortisationspflichtig'}</span>` : '';

  // Amort-Kopfzeilen (v1: 3 Label-Varianten)
  $('h1Val').textContent = price > 0 ? 'CHF ' + fmt(Math.min(C.totalHypo, C.limit1)) : '–';
  const h2Box = $('h2Box');
  if (C.h2ForAmort <= 0 && pVerp <= 0) h2Box.style.display = 'none';
  else {
    h2Box.style.display = 'flex';
    if (C.h2ForAmort > 0 && pVerp > 0) { $('h2Lbl').textContent = '2. Hypothek + Verpfändung (amortisationspflichtig)'; $('h2Val').textContent = 'CHF ' + fmt(C.h2ForAmort) + ' + CHF ' + fmt(pVerp); }
    else if (pVerp > 0) { $('h2Lbl').textContent = 'Verpfändung – zur Rückführung amortisationspflichtig'; $('h2Val').textContent = 'CHF ' + fmt(pVerp); }
    else { $('h2Lbl').textContent = '2. Hypothek / amortisationspflichtig'; $('h2Val').textContent = 'CHF ' + fmt(C.h2ForAmort); }
  }
  const amortBox = $('amortRateBox');
  amortBox.hidden = !(price > 0 && C.annAmort > 0);
  if (!amortBox.hidden) $('amortRateVal').textContent = 'CHF ' + fmt(C.annAmort) + ' / Jahr';

  renderAmortChart(C.h2ForAmort, C.y65, S.C.age, pVerp);
  renderWarnings(C.affordPct, C.ltv, C.hardEqPct, C.totalEqPct, pVerp, price);
}

// Amortisationsverlauf (v1, HTML-Balken + Tooltip)
function renderAmortChart(h2: number, y65: number, age: number, pVerp: number): void {
  const box = $('amortChart');
  const maxVal = h2 + pVerp;
  if (maxVal <= 0.01) { box.innerHTML = '<div class="fz-noamort">Keine Amortisation erforderlich</div>'; return; }
  const steps = Math.max(y65, 15), aH2 = h2 / Math.min(15, y65), aP = pVerp / y65;
  const barData: Array<{ year: number; rH2: number; rP: number; total: number }> = [];
  let html = '';
  for (let i = 0; i <= steps; i += 2) {
    const rH2 = Math.max(0, h2 - aH2 * i), rP = Math.max(0, pVerp - aP * i);
    barData.push({ year: i, rH2, rP, total: rH2 + rP });
    const pH2 = (rH2 / maxVal) * 100, pP = (rP / maxVal) * 100;
    const lbl = i === 0 ? 'Heute' : age + i >= 65 ? '65' : '+' + i;
    html += `<div class="fz-acol" data-idx="${barData.length - 1}">
      <div class="fz-aseg fz-aseg-p" style="height:${pP}%"></div>
      <div class="fz-aseg fz-aseg-h" style="height:${pH2}%;border-radius:${pP > 0 ? '0' : '3px 3px 0 0'}"></div>
      <div class="fz-albl">${lbl}</div>
    </div>`;
  }
  box.innerHTML = html;
  const tip = $('amortTooltip');
  const card = box.closest('.fz-amort') as HTMLElement;
  box.querySelectorAll<HTMLElement>('.fz-acol').forEach((col) => {
    col.addEventListener('mouseenter', () => {
      const d = barData[parseInt(col.dataset.idx!, 10)];
      if (!d) return;
      const yr = d.year === 0 ? 'Heute' : age + d.year >= 65 ? 'Pensionierung (65)' : 'Jahr +' + d.year;
      let lines = `<b>${yr}</b><br>Restschuld: CHF ${fmt(Math.round(d.total))}`;
      if (d.rH2 > 0 && d.rP > 0) lines += `<br><span>2. Hypo: CHF ${fmt(Math.round(d.rH2))}</span><br><span>Verpfändung: CHF ${fmt(Math.round(d.rP))}</span>`;
      else if (d.rP > 0) lines += `<br><span>Verpfändung: CHF ${fmt(Math.round(d.rP))}</span>`;
      tip.innerHTML = lines;
      tip.hidden = false;
      const rect = col.getBoundingClientRect(), cRect = card.getBoundingClientRect();
      tip.style.left = rect.left - cRect.left + rect.width / 2 - tip.offsetWidth / 2 + 'px';
      tip.style.top = rect.top - cRect.top - tip.offsetHeight - 6 + 'px';
    });
    col.addEventListener('mouseleave', () => { tip.hidden = true; });
  });
}

function renderWarnings(aff: number, ltv: number, hardEqPct: number, totalEqPct: number, pVerp: number, price: number): void {
  if (price <= 0) { $('warningBox').innerHTML = ''; return; }
  const w: string[] = [];
  if (totalEqPct < 19.99) w.push('Gesamt-Eigenmittelquote (inkl. Verpfändung) unter 20%.');
  if (hardEqPct < 9.99) w.push('Harte Eigenmittelquote unter 10% – Minimum nicht-PK-Mittel nicht erfüllt.');
  if (aff > 33.51) w.push('Tragbarkeitslimit von 33.5% überschritten.');
  if (ltv > 80.01) w.push('Belehnung über 80% – Finanzierung i.d.R. nicht möglich.');
  if (pVerp > 0) w.push(`Verpfändung von CHF ${fmt(pVerp)} entlastet die Belehnung, erhöht jedoch die Amortisationspflicht.`);
  $('warningBox').innerHTML = w.map((t) => `<div class="fz-warn">⚠ ${t}</div>`).join('');
}

// ── Varianten (v1) ───────────────────────────────────────────────────────────
function renderVariants(): void {
  const container = $('variantsContainer');
  container.innerHTML = S.variants.map((v) => `
    <div class="panel fz-vcard" data-v="${v.id}">
      <div class="fz-vhead">Variante ${v.id}</div>
      <div class="fz-vtranches">
        ${[0, 1, 2].map((ti) => `<div class="fz-tbox" data-ti="${ti}">
          <div class="fz-tlbl"><span>Tranche ${ti + 1}</span><span class="t-pct">0%</span></div>
          <div class="fz-tinputs">
            <select class="v-prod" aria-label="Produkt Tranche ${ti + 1}">${Object.keys(S.rates).map((r) => `<option value="${r}"${v.tranches[ti].p === r ? ' selected' : ''}>${r}</option>`).join('')}</select>
            <input type="text" class="v-amt" aria-label="Betrag Tranche ${ti + 1}">
          </div>
          <input type="range" class="v-sli" min="0" step="1000" aria-label="Betrag Tranche ${ti + 1}">
        </div>`).join('')}
      </div>
      <div class="fz-vchart"></div>
      <div class="fz-vfoot"><span class="fz-vfl">Total Monatlich<span class="v-diff"></span></span><span class="fz-vtotal v-total">–</span></div>
    </div>`).join('');

  container.querySelectorAll<HTMLElement>('.fz-vcard').forEach((card, vIdx) => {
    card.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.fz-vtranches')) return;
      openDetail(vIdx);
    });
    card.querySelectorAll<HTMLElement>('.fz-tbox').forEach((box, tIdx) => {
      (box.querySelector('.v-prod') as HTMLSelectElement).addEventListener('change', (e) => {
        S.variants[vIdx].tranches[tIdx].p = (e.target as HTMLSelectElement).value;
        calculate();
      });
      (box.querySelector('.v-amt') as HTMLInputElement).addEventListener('change', (e) =>
        handleAmountChange(vIdx, tIdx, pN((e.target as HTMLInputElement).value)));
      (box.querySelector('.v-sli') as HTMLInputElement).addEventListener('input', (e) =>
        handleAmountChange(vIdx, tIdx, parseFloat((e.target as HTMLInputElement).value)));
    });
  });
}

function handleAmountChange(vIdx: number, tIdx: number, val: number): void {
  const th = S.C.totalHypo || 0, nv = Math.min(val, th);
  const t = S.variants[vIdx].tranches;
  if (tIdx === 0) { t[0].a = nv; t[1].a = th - nv; t[2].a = 0; }
  else if (tIdx === 1) { const m2 = th - t[0].a; t[1].a = Math.min(nv, m2); t[2].a = m2 - t[1].a; }
  else { const m3 = th - t[0].a - t[1].a; t[2].a = Math.min(nv, m3); }
  calculate();
}

function updateVariants(): void {
  const { totalHypo, annAmort, annSide, totalAnn, curRent } = S.C;
  $('refAmort').textContent = 'CHF ' + fmt(annAmort / 12);
  $('refSide').textContent = 'CHF ' + fmt(annSide / 12);
  $('refTotal').textContent = fmt(totalAnn / 12);
  document.querySelectorAll('.kalk-rate-disp').forEach((d) => { d.textContent = $i('calcRate').value + ' %'; });

  document.querySelectorAll<HTMLElement>('#variantsContainer .fz-vcard').forEach((card, vIdx) => {
    const v = S.variants[vIdx];
    if (!v) return;
    const sum = v.tranches.reduce((s, t) => s + t.a, 0);
    if (Math.abs(sum - totalHypo) > 100) {
      if (v.id === 1 || v.id === 2) { v.tranches[0].a = totalHypo; v.tranches[1].a = 0; v.tranches[2].a = 0; }
      else { v.tranches[0].a = totalHypo * 0.5; v.tranches[1].a = totalHypo * 0.5; v.tranches[2].a = 0; }
    }
    let vAnnInt = 0;
    v.tranches.forEach((t, tIdx) => {
      vAnnInt += t.a * (S.rates[t.p] / 100);
      const box = card.querySelectorAll<HTMLElement>('.fz-tbox')[tIdx];
      const prevSum = v.tranches.slice(0, tIdx).reduce((s, tr) => s + tr.a, 0);
      box.classList.toggle('inactive', !(tIdx === 0 || prevSum < totalHypo - 1));
      (box.querySelector('.v-amt') as HTMLInputElement).value = fmt(t.a);
      (box.querySelector('.t-pct') as HTMLElement).textContent = totalHypo > 0 ? Math.round((t.a / totalHypo) * 100) + '%' : '0%';
      const sl = box.querySelector('.v-sli') as HTMLInputElement;
      sl.max = String(totalHypo);
      sl.value = String(t.a);
    });
    v.mtlTotal = (vAnnInt + annAmort + annSide) / 12;
    (card.querySelector('.v-total') as HTMLElement).textContent = fmt(v.mtlTotal);

    const diffEl = card.querySelector('.v-diff') as HTMLElement;
    const baseV = curRent > 0 ? curRent : totalAnn / 12 || 0;
    const lbl = curRent > 0 ? '' : 'vs. Kalk. ';
    if (baseV > 0) {
      const diffCHF = v.mtlTotal - baseV;
      const diffPct = (v.mtlTotal / baseV - 1) * 100;
      diffEl.className = 'v-diff ' + (diffCHF > 0 ? 'extra' : 'saving');
      diffEl.textContent = lbl + (diffCHF > 0 ? '+' : '') + fmt(Math.round(diffCHF)) + ' CHF · ' + (diffPct >= 0 ? '+' : '') + Math.round(diffPct) + '%';
    } else diffEl.textContent = '';
    renderVChart(card, vIdx);
  });
}

// Balkenvergleich Kalk/Aktuell/Neu als SVG (Regel 5; ersetzt v1 Chart.js)
function renderVChart(card: HTMLElement, vIdx: number): void {
  const v = S.variants[vIdx];
  const kalkV = S.C.totalAnn / 12 || 0, rentV = S.C.curRent || 0, newV = v.mtlTotal || 0;
  const allTotals = S.variants.map((vv) => vv.mtlTotal || 0);
  const globalMax = Math.max(kalkV, rentV, ...allTotals) * 1.4 || 1;
  const has3 = rentV > 0;
  const bars = has3
    ? [{ l: 'Kalk.', v: kalkV, c: '#dce8f4' }, { l: 'Aktuell', v: rentV, c: '#cbd5e1' }, { l: 'Neu', v: newV, c: '#004078' }]
    : [{ l: 'Kalk.', v: kalkV, c: '#dce8f4' }, { l: 'Neu', v: newV, c: '#004078' }];
  const baseV = rentV > 0 ? rentV : kalkV;
  const diffCHF = newV - baseV;
  const diffPct = baseV > 0 ? (newV / baseV - 1) * 100 : 0;
  const isPos = diffCHF > 0;
  const W = 200, H = 120, top = 30, bw = 24;
  const gap = W / (bars.length + 1);
  const y = (val: number): number => H - 14 - (val / globalMax) * (H - 14 - top);
  const baseIdx = bars.length - 2;
  const svg = `<svg viewBox="0 0 ${W} ${H}" class="fz-vsvg" preserveAspectRatio="xMidYMid meet">
    ${bars.map((b, i) => `<rect x="${gap * (i + 1) - bw / 2}" y="${y(b.v)}" width="${bw}" height="${H - 14 - y(b.v)}" rx="4" fill="${b.c}"/>`).join('')}
    ${baseV > 0 && bars.length > 1 ? `<line x1="${gap * (baseIdx + 1)}" y1="${y(baseV)}" x2="${gap * bars.length - bw / 2}" y2="${y(baseV)}" stroke="${isPos ? '#3d4c5c' : '#2e6b45'}" stroke-width="1" stroke-dasharray="3 3" opacity="0.55"/>` : ''}
  </svg>
  <div class="fz-vlbls">${bars.map((b) => `<span>${b.l}</span>`).join('')}</div>
  <div class="fz-vdiff ${isPos ? 'extra' : 'saving'}" style="left:${((gap * bars.length) / W) * 100}%">${(isPos ? '+' : '') + fmt(Math.round(diffCHF))}<small>${(diffPct >= 0 ? '+' : '') + Math.round(diffPct)}%</small></div>`;
  (card.querySelector('.fz-vchart') as HTMLElement).innerHTML = svg;
}

// Detail-Modal (v1 openDetail)
function openDetail(vIdx: number): void {
  const v = S.variants[vIdx], R = S.C;
  $('detailTitle').textContent = `Variante ${v.id} – Detailaufstellung`;
  let html = '';
  v.tranches.forEach((t, i) => {
    if (t.a <= 0) return;
    const mi = (t.a * (S.rates[t.p] / 100)) / 12;
    html += `<div class="fz-dt"><div><div class="dl">Tranche ${i + 1}: ${t.p} (${S.rates[t.p].toFixed(2)}%)</div><div class="dv2">CHF ${fmt(t.a)}</div></div>
      <div class="fz-dtr"><div class="dl">Zins / Monat</div><div class="dv">CHF ${fmt(mi)}</div></div></div>`;
  });
  html += `<div class="fz-dt"><div class="dl">Amortisation / Monat</div><div class="dv">CHF ${fmt(R.annAmort / 12)}</div></div>
    <div class="fz-dt"><div class="dl">Nebenkosten / Monat</div><div class="dv">CHF ${fmt(R.annSide / 12)}</div></div>`;
  $('detailBody').innerHTML = html;

  const kalkV = R.totalAnn / 12 || 0, rentV = R.curRent || 0, newV = v.mtlTotal || 0;
  $('dtKalk').textContent = 'CHF ' + fmt(kalkV);
  const aktuellBox = $('dtAktuellBox');
  aktuellBox.style.opacity = rentV > 0 ? '1' : '0.4';
  $('dtAktuell').textContent = rentV > 0 ? 'CHF ' + fmt(rentV) : 'nicht erfasst';
  $('dtNeu').textContent = 'CHF ' + fmt(newV);
  const baseV = rentV > 0 ? rentV : kalkV;
  const baseLbl = rentV > 0 ? 'vs. Aktuell' : 'vs. Kalk.';
  const diff = newV - baseV;
  const pct = baseV > 0 ? (newV / baseV - 1) * 100 : 0;
  $('dtNeuPct').innerHTML = `<span class="${diff > 0 ? 'fz-neg' : 'fz-pos'}">${diff > 0 ? '+' : ''}${fmt(Math.round(diff))} CHF (${pct >= 0 ? '+' : ''}${Math.round(pct)}%)</span> <span class="fz-mut">${baseLbl}</span>`;
  $('detailModal').hidden = false;
}

// Marktzinsen-Modal (v1 Admin)
function renderAdminRates(): void {
  $('adminRatesGrid').innerHTML = Object.entries(S.rates).map(([l, v]) => `
    <div class="fz-rfield"><label>${l}</label><div class="fz-rrow"><input type="text" value="${v.toFixed(2)}" data-rate="${l}" data-v1-field="rate|${l}"><span>%</span></div></div>`).join('');
  $('adminRatesGrid').querySelectorAll<HTMLInputElement>('[data-rate]').forEach((inp) =>
    inp.addEventListener('change', () => { S.rates[inp.dataset.rate!] = parseFloat(inp.value) || 0; }));
}

function switchTab(tab: 'analysis' | 'comparison'): void {
  S.tab = tab;
  $('tabAnalysis').classList.toggle('on', tab === 'analysis');
  $('tabComparison').classList.toggle('on', tab === 'comparison');
  $('viewAnalysis').hidden = tab !== 'analysis';
  $('viewComparison').hidden = tab !== 'comparison';
  if (tab === 'comparison') updateVariants();
}

function init(): void {
  mountNav($('bbzNav'), { activeId: '07a' });
  $('editToggle').addEventListener('click', () => {
    const on = document.body.classList.toggle('edit-mode');
    $('editToggle').setAttribute('aria-pressed', String(on));
  });
  preload();
  hydrate(); // persistierte Werte überschreiben Prefills (v1-Reihenfolge)
  renderVariants();

  document.querySelectorAll<HTMLInputElement>('.ni').forEach((inp) => {
    inp.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      const pos = t.selectionStart ?? 0, oldL = t.value.length;
      const n = pN(t.value);
      if (t.value !== '' && !isNaN(n)) {
        t.value = fmt(n);
        const diff = t.value.length - oldL;
        t.setSelectionRange(pos + diff, pos + diff);
      }
      calculate();
    });
  });
  ['calcRate', 'sideRate', 'age'].forEach((id) => $i(id).addEventListener('input', calculate));

  $('tabAnalysis').addEventListener('click', () => switchTab('analysis'));
  $('tabComparison').addEventListener('click', () => switchTab('comparison'));
  $('btnRates').addEventListener('click', () => { $('ratesModal').hidden = false; renderAdminRates(); });
  const closeRates = (): void => { $('ratesModal').hidden = true; calculate(); };
  $('ratesClose').addEventListener('click', closeRates);
  $('ratesApply').addEventListener('click', closeRates);
  $('ratesModal').addEventListener('click', (e) => { if (e.target === $('ratesModal')) closeRates(); });
  $('detailClose').addEventListener('click', () => { $('detailModal').hidden = true; });
  $('detailModal').addEventListener('click', (e) => { if (e.target === $('detailModal')) $('detailModal').hidden = true; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { $('detailModal').hidden = true; $('ratesModal').hidden = true; } });

  calculate();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
