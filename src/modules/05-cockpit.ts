// ============================================================================
// 05-cockpit.ts — Finanz-Cockpit (Grammatik v3, design/referenz-05-cockpit.html).
// KPI-Mathematik, Kategorie-Modals, Prefills = v1 (05_cockpit.html, calc() Z.555)
// VERBATIM portiert. Chart nach Regel 5 (SVG-Pfade + HTML-Labels, non-scaling-stroke).
// Verbesserung 05.4 (PO-Feedback): a) Zeilen sind Klickziele (✎ immer sichtbar,
// Regel-4-Ausnahme), b) Modals auf Theme-Groessen + Sequenz-Nummern (Regel 2/3),
// c) Rendite 0% + freie Eingabe "Eigene…" (ADR-11).
// ============================================================================
import '../styles/theme.css';
import '../styles/modules/05-cockpit.css';
import { BBZ } from '../lib/data';
import { mountNav } from '../lib/nav';

// ── State (v1-Defaults) ──────────────────────────────────────────────────────
interface Cat { [k: string]: unknown }
const S = {
  zahlen: { saldo: 0, bank: '', konten: 1, banken: 1, kanaele: [] as string[], kommentar: '' },
  sparen: { saldo: 0, banken: 1, konten: 1, quoteBetrag: 0, quoteFreq: 'mtl', quoteTyp: 'positiv', reserve: 0, sichergestellt: 'nein', kommentar: '' },
  vorsorgen: { pkSaldo: 0, pkBekannt: 'nein', pkEinkaeufe: 'nein', pkAusbezahlt: 'nein', s3Saldo: 0, s3Konten: 1, s3Banken: 1, s3Form: 'Konto', s3Einz: 'nein', s3EinzBetrag: 7258, s3Strategie: 'Unbekannt', kommentar: '' },
  anlegen: { vorhanden: 'nein', volumen: 0, strategie: 'Unbekannt', typ: 'Beratungsdepot', kommentar: '' },
  ausgaben: { eMann: 0, eFrau: 0, typ: 'netto', freq: 'mtl', haushalt: 0, leasing: 0, unterhalt: 0, uebrige: 0, kommentar: '' },
  finanzieren: { vorhanden: 'nein', betrag: 0, form: 'Hypothek', laufzeit: '>3', kommentar: '' },
  chart: { mode: 'ohneBV', yld: 0, years: 10, spar: true },
};
type SKey = keyof typeof S;

// ── Helpers (v1) ─────────────────────────────────────────────────────────────
const CHF = (n: number): string => (n === 0 ? 'CHF 0' : new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 0 }).format(n));
const CHFk = (n: number): string => new Intl.NumberFormat('de-CH', { maximumFractionDigits: 0 }).format(Math.round(n));
const pN = (v: unknown): number => parseFloat(String(v).replace(/[^0-9.-]/g, '')) || 0;
const esc = (s: unknown): string => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const el = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
const $v = (id: string): string => (document.getElementById(id) as HTMLInputElement | null)?.value ?? '';
const $n = (id: string): number => pN($v(id));

// ── Rail-KPIs + Bühne-Skelett (Werte füllt calc) ─────────────────────────────
function renderSkeleton(): void {
  el('railKpis').innerHTML = `
    <div class="ck-kpi" id="kpi-gesamt-wrap"><div class="kl">GESAMTVERMÖGEN (INKL. BV)</div><div class="kv" id="k-gesamt">–</div><div class="ks">Vermögen exkl. PK <span id="k-exkl-inline">–</span></div></div>
    <div class="ck-kpi"><div class="kl">VERMÖGEN EXKL. PK</div><div class="kv" id="k-exkl">–</div><div class="ks">Liquidität + 3a + Anlagen</div></div>
    <div class="ck-kpi"><div class="kl">LIQUIDITÄT</div><div class="kv" id="k-liq">–</div><div class="ks">Zahlen &amp; Sparen</div></div>
    <div class="ck-kpi"><div class="kl">ANLAGEFÄHIGES KAPITAL</div><div class="kv" id="k-anlage">–</div><div class="ks" id="k-anlage-s">Liquidität − Wohlfühlreserve</div></div>
    <div class="ck-kpi"><div class="kl">SPARQUOTE</div><div class="kv" id="k-spar">–</div><div class="ks">Einkommen − Ausgaben</div></div>
    <div class="ck-kpi" id="kpi-fin-wrap"><div class="kl">FINANZIERUNG · KAPITALWERT</div><div class="kv" id="k-fin">–</div><div class="ks" id="k-fin-s">Kapitalwert</div></div>`;

  // Verbesserung 05.4a: Zeile = Klickziel (statt Mini-Linkleiste im Kicker).
  // ✎ immer sichtbar — Erfassen ist Kernfunktion dieses Moduls (Regel-4-Ausnahme
  // wie "+ Erwartung ergaenzen" in 01).
  const bar = (key: string, label: string) => `<div class="ck-brow" id="br-${key}" data-cat="${key}" role="button" tabindex="0"><span class="bic">${label}</span><div class="trk"><div class="fl" id="bf-${key}"></div></div><span class="bv" id="bv-${key}">Erfassen →</span><span class="ck-pen">✎</span></div>`;
  el('work').innerHTML = `
    <div class="ck-row1">
      <section class="panel ck-panel">
        <div class="panel-kicker">VERMÖGEN</div>
        <div class="ck-body">${bar('zahlen', 'Zahlungsverkehr')}${bar('sparen', 'Sparen')}${bar('vorsorgen', 'Vorsorgen')}${bar('anlegen', 'Anlegen')}</div>
      </section>
      <section class="panel ck-panel">
        <div class="panel-kicker">VERPFLICHTUNGEN &amp; MONATLICHER CASHFLOW</div>
        <div class="ck-body">
          <div class="ck-cf" id="cfr-eink" data-cat="ausgaben" role="button" tabindex="0"><span class="cfl">Einkommen</span><div class="cft"><div class="fl" id="bf-eink" style="width:100%;background:var(--blue)"></div></div><span class="bv" id="bv-eink">Erfassen →</span><span class="ck-pen">✎</span></div>
          <div class="ck-cf" id="cfr-ausg" data-cat="ausgaben" role="button" tabindex="0"><span class="cfl">Ausgaben</span><div class="cft"><div class="fl" id="bf-ausg" style="background:#8fa8bd"></div></div><span class="bv" id="bv-ausg">Erfassen →</span><span class="ck-pen">✎</span></div>
          <div class="ck-note" id="ck-note"></div>
          <div class="ck-spar"><span class="spdot" id="spar-dot"></span><span id="spar-txt">Sparquote im Sparen-Layer erfassen</span></div>
          <div class="ck-finrow" id="cfr-fin" data-cat="finanzieren" role="button" tabindex="0"><span class="cfl">Finanzierung</span><span class="bv" id="bv-fin">Erfassen →</span><span class="ck-pen">✎</span></div>
        </div>
      </section>
    </div>
    <section class="panel ck-simp">
      <div class="ck-simhead"><span class="panel-kicker" style="margin:0">VERMÖGENSENTWICKLUNG (SIMULATION)</span>
        <div class="ck-leg"><span class="lg1">Mit Rendite</span><span class="lg2">Ohne Rendite</span><span class="ck-legstart" id="ck-legstart"></span></div>
      </div>
      <div class="ck-sim">
        <div class="ck-chartwrap"><div class="ck-chart" id="gChart"></div><div class="ck-axis" id="ck-axis"></div></div>
        <div class="ck-ctrl">
          <div class="cg"><div class="cl">STARTKAPITAL</div><div class="ck-chips" id="ck-mode"></div></div>
          <div class="cg"><div class="cl">RENDITE P.A.</div><div class="ck-chips" id="ck-yld"></div></div>
          <div class="cg"><div class="cl">ZEITHORIZONT</div><div class="ck-chips" id="ck-years"></div></div>
          <div class="cg"><div class="cl">SPARQUOTE EINBEZIEHEN</div><div class="ck-chips" id="ck-spar"></div></div>
          <div class="ck-badge" id="rendite-badge" hidden></div>
        </div>
      </div>
    </section>`;
  wireControls();
  el('work').querySelectorAll<HTMLElement>('[data-cat]').forEach((b) => {
    b.addEventListener('click', () => openModal(b.dataset.cat as SKey));
    b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(b.dataset.cat as SKey); } });
  });
}

// ── Simulation-Controls ──────────────────────────────────────────────────────
function chip(on: boolean, label: string, attrs: string): string {
  return `<button class="ck-chip${on ? ' on' : ''}" ${attrs}>${label}</button>`;
}
// Verbesserung 05.4c (ADR-11): Rendite 0% + freie Eingabe "Eigene…" (0–10, Schritt 0.05).
const YLD_PRESETS = [0, 1.25, 2.75, 4.5];
let yldEdit = false; // Inline-Zahlenfeld offen (ephemer, nicht persistiert)
const yldPct = (): number => parseFloat((S.chart.yld * 100).toFixed(2));
function commitYld(): void {
  const inp = document.getElementById('yldIn') as HTMLInputElement | null;
  if (!inp) return;
  const v = Math.min(10, Math.max(0, pN(inp.value)));
  S.chart.yld = Math.round(v * 20) / 20 / 100; // Schritt 0.05, clamp 0–10
  yldEdit = false; renderControls(); calc();
}
function wireControls(): void {
  renderControls();
  const w = el('work');
  w.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('[data-yldok]')) { commitYld(); return; }
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-sim]');
    if (!b) return;
    const k = b.dataset.sim!, v = b.dataset.v ?? '';
    if (k === 'yldc') { yldEdit = true; renderControls(); (document.getElementById('yldIn') as HTMLInputElement | null)?.focus(); return; }
    if (k === 'mode') S.chart.mode = v;
    else if (k === 'yld') { S.chart.yld = Number(v); yldEdit = false; }
    else if (k === 'years') S.chart.years = Number(v);
    else if (k === 'spar') S.chart.spar = v === '1';
    renderControls(); calc();
  });
}
function renderControls(): void {
  const liq = S.zahlen.saldo + S.sparen.saldo;
  const anlageF = Math.max(0, liq - S.sparen.reserve);
  const totalOhne = liq + S.vorsorgen.s3Saldo + S.anlegen.volumen;
  el('ck-mode').innerHTML = chip(S.chart.mode === 'anlage', `Anlagefähig<small>${CHF(anlageF)}</small>`, 'data-sim="mode" data-v="anlage"') + chip(S.chart.mode !== 'anlage', `Vermögen exkl. PK<small>${CHF(totalOhne)}</small>`, 'data-sim="mode" data-v="ohneBV"');
  const yp = yldPct(), isPreset = YLD_PRESETS.includes(yp);
  el('ck-yld').innerHTML = YLD_PRESETS.map((y) => chip(yp === y, y + '%', `data-sim="yld" data-v="${y / 100}"`)).join('')
    + (yldEdit
      ? `<span class="ck-yldin"><input id="yldIn" type="number" min="0" max="10" step="0.05" value="${isPreset ? '' : yp}" aria-label="Eigene Rendite in Prozent"><span class="pct">%</span><button class="ck-yldok" data-yldok type="button" aria-label="Übernehmen">✓</button></span>`
      : chip(!isPreset, isPreset ? 'Eigene…' : yp + '%', 'data-sim="yldc"'));
  document.getElementById('yldIn')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') commitYld();
    else if (e.key === 'Escape') { yldEdit = false; renderControls(); }
  });
  el('ck-years').innerHTML = [5, 10, 15, 20].map((y) => chip(S.chart.years === y, y + ' J', `data-sim="years" data-v="${y}"`)).join('');
  el('ck-spar').innerHTML = chip(S.chart.spar, 'Ja', 'data-sim="spar" data-v="1"') + chip(!S.chart.spar, 'Nein', 'data-sim="spar" data-v="0"');
}

// ── Berechnung (v1 calc, verbatim portiert) ──────────────────────────────────
function calc(): void {
  const liq = S.zahlen.saldo + S.sparen.saldo;
  const s3 = S.vorsorgen.s3Saldo, pk = S.vorsorgen.pkSaldo, anlagen = S.anlegen.volumen;
  const totalMit = liq + pk + s3 + anlagen;
  const totalOhne = liq + s3 + anlagen;
  const anlageF = Math.max(0, liq - S.sparen.reserve);
  const sparLayerM = S.sparen.quoteFreq === 'mtl' ? S.sparen.quoteBetrag : S.sparen.quoteBetrag / 12;
  const sparSign = S.sparen.quoteTyp === 'negativ' ? -1 : 1;
  const eMannM = S.ausgaben.freq === 'mtl' ? S.ausgaben.eMann : S.ausgaben.eMann / 12;
  const eFrauM = S.ausgaben.freq === 'mtl' ? S.ausgaben.eFrau : S.ausgaben.eFrau / 12;
  const einkGesM = eMannM + eFrauM;
  const ausgGesM = S.ausgaben.haushalt + S.ausgaben.leasing + S.ausgaben.unterhalt + S.ausgaben.uebrige;
  const hasSpar = sparLayerM > 0, hasCF = einkGesM > 0, hasAusg = ausgGesM > 0;
  const cashflowSaldoM = hasCF ? einkGesM - ausgGesM : 0;
  const verzehr = hasCF && ausgGesM > einkGesM;
  const effSparM = hasSpar ? sparLayerM * sparSign : 0;
  const finBetrag = S.finanzieren.vorhanden === 'ja' ? S.finanzieren.betrag : 0;
  const pkBekannt = S.vorsorgen.pkBekannt === 'ja';

  // KPIs
  el('kpi-gesamt-wrap').hidden = !(pkBekannt && totalMit > 0);
  el('k-gesamt').textContent = totalMit > 0 ? CHF(totalMit) : '–';
  el('k-exkl-inline').textContent = totalOhne > 0 ? CHF(totalOhne) : '–';
  el('k-exkl').textContent = totalOhne > 0 ? CHF(totalOhne) : '–';
  el('k-liq').textContent = liq > 0 ? CHF(liq) : '–';
  el('k-anlage').textContent = anlageF > 0 ? CHF(anlageF) : '–';
  el('k-anlage-s').textContent = S.sparen.reserve > 0 ? 'Liquidität − Wohlfühlreserve ' + CHF(S.sparen.reserve) : 'Liquidität − Wohlfühlreserve';
  const ks = el('k-spar');
  if (sparLayerM > 0) { ks.textContent = (sparSign > 0 ? '+ ' : '− ') + CHF(sparLayerM); ks.className = 'kv ' + (sparSign > 0 ? 'pos' : 'neg'); }
  else { ks.textContent = '–'; ks.className = 'kv dim'; }
  el('kpi-fin-wrap').hidden = !(finBetrag > 0);
  el('k-fin').textContent = finBetrag > 0 ? CHF(finBetrag) : '–';
  el('k-fin-s').textContent = finBetrag > 0 ? S.finanzieren.form : 'Kapitalwert';
  el('bv-fin').textContent = finBetrag > 0 ? CHF(finBetrag) + ' · ' + S.finanzieren.form : 'Erfassen →';

  // Vermögen-Balken
  const aMax = Math.max(1, S.zahlen.saldo, S.sparen.saldo, s3, anlagen);
  setABar('zahlen', S.zahlen.saldo, aMax, CHF(S.zahlen.saldo), '#004078');
  setABar('sparen', S.sparen.saldo, aMax, CHF(S.sparen.saldo), '#2f6ea3');
  setABar('vorsorgen', s3, aMax, s3 > 0 ? CHF(s3) + ' (3a)' : 'Erfassen →', '#6f9cc0');
  setABar('anlegen', anlagen, aMax, CHF(anlagen), '#a9c3d8');

  // Cashflow
  if (einkGesM > 0) {
    el('bv-eink').textContent = CHF(einkGesM) + ' / mtl.';
    const ausgabenNachSpar = einkGesM - effSparM;
    const ausgPct = Math.min(100, Math.round((ausgabenNachSpar / einkGesM) * 100));
    (el('bf-ausg') as HTMLElement).style.width = ausgPct + '%';
    el('bv-ausg').textContent = ausgabenNachSpar > 0 || ausgGesM > 0 ? (ausgGesM > 0 ? CHF(ausgGesM) + ' / mtl.' : CHF(ausgabenNachSpar) + ' / mtl. (abgeleitet)') : 'Erfassen →';
    el('ck-note').textContent = ausgGesM > 0 ? `Ausgaben: Haushalt ${CHF(S.ausgaben.haushalt)} · Leasing ${CHF(S.ausgaben.leasing)} · Unterhalt ${CHF(S.ausgaben.unterhalt)} · übrige ${CHF(S.ausgaben.uebrige)}` : '';
    // Sparquote-Zeile: alle v1-Zustände
    const dot = el('spar-dot'), txt = el('spar-txt');
    const decke = hasSpar && hasCF && hasAusg && cashflowSaldoM >= sparLayerM;
    const limit = hasSpar && hasCF && hasAusg && cashflowSaldoM < sparLayerM;
    let color = 'var(--mut)', msg = 'Sparquote im Sparen-Layer erfassen';
    if (verzehr) { color = '#c0392b'; msg = 'Kapitalverzehr – Ausgaben übersteigen Einkommen um ' + CHF(ausgGesM - einkGesM) + ' / mtl.'; }
    else if (hasSpar && limit) { color = 'var(--amber)'; msg = 'Sparquote: ' + CHF(effSparM) + ' / mtl. – Cashflow (' + CHF(Math.max(0, cashflowSaldoM)) + ') deckt die Sparquote nicht'; }
    else if (hasSpar && decke) { color = 'var(--green)'; msg = 'Sparquote: ' + CHF(effSparM) + ' / mtl. – durch Cashflow (' + CHF(cashflowSaldoM) + ') gedeckt'; }
    else if (hasSpar) { color = 'var(--green)'; msg = 'Sparquote: ' + CHF(effSparM) + ' / mtl.'; }
    else if (hasCF && hasAusg && cashflowSaldoM > 0) { msg = 'Sparquote im Sparen-Layer erfassen (Cashflow-Indikation: + ' + CHF(cashflowSaldoM) + ' / mtl.)'; }
    else if (hasCF && !hasAusg) { msg = 'Ausgaben erfassen für Cashflow-Plausibilisierung'; }
    dot.style.background = color; txt.style.color = color; txt.textContent = msg;
  } else {
    el('bv-eink').textContent = 'Erfassen →';
    (el('bf-ausg') as HTMLElement).style.width = '0%';
    el('bv-ausg').textContent = ausgGesM > 0 ? CHF(ausgGesM) + ' / mtl.' : 'Erfassen →';
    el('ck-note').textContent = '';
    el('spar-txt').textContent = 'Einkommen erfassen für Cashflow-Analyse'; el('spar-dot').style.background = 'var(--mut)'; el('spar-txt').style.color = 'var(--mut)';
  }

  // Chart
  const chartStart = S.chart.mode === 'anlage' ? anlageF : totalOhne;
  el('ck-legstart').textContent = 'Startkapital: ' + (S.chart.mode === 'anlage' ? 'Anlagefähig ' + CHF(anlageF) : 'Vermögen exkl. PK ' + CHF(totalOhne));
  renderChart(Math.max(0, chartStart), effSparM);

  // Prefills (v1 Z.731–737, unverändert)
  const mult = S.ausgaben.freq === 'mtl' ? 12 : 1;
  BBZ.set('cockpit_einkommen', (S.ausgaben.eMann + S.ausgaben.eFrau) * mult);
  BBZ.set('cockpit_verpflichtungen', (S.ausgaben.leasing + S.ausgaben.unterhalt) * mult);
  BBZ.set('cockpit_pk_saldo', S.vorsorgen.pkSaldo || 0);
  BBZ.set('cockpit_anlage_f', anlageF);
  BBZ.set('cockpit_data', JSON.parse(JSON.stringify(S)));
}

function setABar(key: string, val: number, max: number, lbl: string, color: string): void {
  const fill = el('bf-' + key) as HTMLElement;
  fill.style.width = val > 0 ? Math.max(4, Math.round((val / max) * 100)) + '%' : '0%';
  fill.style.background = color;
  el('bv-' + key).textContent = val > 0 ? lbl : 'Erfassen →';
}

// ── Chart als SVG (Regel 5) ──────────────────────────────────────────────────
// Runde Y-Domain fuer [lo, hi]: feinste Schrittweite (1/2/2.5/5 × 10^n), die die
// gerundete Domain auf hoechstens 6 Ticks haelt → runde Werte, kein 0-Start bei
// hoch liegenden Daten, nie zu dichte Gitterlinien.
function niceDomain(lo: number, hi: number): { min: number; max: number; step: number } {
  const cands = [1, 2, 2.5, 5].flatMap((m) => [1e3, 1e4, 1e5, 1e6, 1e7].map((p) => m * p)).sort((a, b) => a - b);
  for (const c of cands) {
    const min = Math.floor(lo / c) * c, max = Math.ceil(hi / c) * c;
    if (Math.round((max - min) / c) + 1 <= 6) return { min, max, step: c };
  }
  const c = cands[cands.length - 1];
  return { min: Math.floor(lo / c) * c, max: Math.ceil(hi / c) * c, step: c };
}
function renderChart(startCap: number, sparNetto: number): void {
  const { yld, years, spar } = S.chart;
  const annSpar = spar ? sparNetto * 12 : 0;
  const dataY: number[] = [], dataF: number[] = [];
  let cY = startCap, cF = startCap;
  for (let i = 0; i <= years; i++) { dataY.push(cY); dataF.push(cF); cY = cY * (1 + yld) + annSpar; cF = cF + annSpar; }
  const endVal = dataY[dataY.length - 1], flatVal = dataF[dataF.length - 1];
  const effekt = endVal - flatVal, hasEff = yld > 0 && effekt > 500;
  // Verbesserung 05.4c: 0% + Sparquote = reine Sparakkumulation — Badge weist
  // "+ CHF 0 Rendite-Effekt" korrekt aus statt zu verschwinden.
  const sparAkk = yld === 0 && annSpar > 0;
  const badge = el('rendite-badge');
  badge.hidden = !(hasEff || sparAkk);
  badge.innerHTML = hasEff ? `In ${years} Jahren: <b>${CHF(endVal)}</b><br>+ ${CHF(effekt)} Rendite-Effekt`
    : sparAkk ? `In ${years} Jahren: <b>${CHF(endVal)}</b><br>+ CHF 0 Rendite-Effekt (reine Sparakkumulation)` : '';

  if (startCap <= 0 && annSpar <= 0) { el('gChart').innerHTML = ''; el('ck-axis').innerHTML = ''; return; }

  // Y-Domain an die sichtbaren Kurven anpassen (Korrektur 05.2a): ~0.9×min..~1.05×max,
  // Ticks auf runde Werte — kein 0-Start, keine leere untere Haelfte.
  const drawn = hasEff ? dataY.concat(dataF) : dataY.slice();
  const dMin = Math.min(...drawn), dMax = Math.max(...drawn);
  let lo = dMin >= 0 ? dMin * 0.9 : dMin * 1.1;
  let hi = dMax >= 0 ? dMax * 1.05 : dMax * 0.9;
  const spanRef = Math.abs(dMax) || 1;
  if (hi - lo < spanRef * 0.05) { lo = dMin - spanRef * 0.1; hi = dMax + spanRef * 0.1; }  // flache Kurve: Luft geben
  const { min: domMin, max: domMax, step } = niceDomain(lo, hi);
  const ticks: number[] = [];
  for (let t = domMin; t <= domMax + step * 0.001; t += step) ticks.push(t);

  const W = 800, H = 230, dom = domMax - domMin || 1;
  const xs = (i: number) => (years ? (i / years) * W : 0);
  const ys = (v: number) => H - ((v - domMin) / dom) * H;
  const path = (d: number[]) => d.map((v, i) => `${i ? 'L' : 'M'}${xs(i).toFixed(1)},${ys(v).toFixed(1)}`).join(' ');
  const grid = ticks.map((t) => `<line x1="0" y1="${ys(t).toFixed(1)}" x2="${W}" y2="${ys(t).toFixed(1)}"/>`).join('');
  // Y-Tick-Labels links INNEN an den Gitterlinien (Korrektur 05.2c).
  const ylabs = ticks.map((t) => `<span class="ck-ylab" style="top:${((ys(t) / H) * 100).toFixed(1)}%">${CHFk(t)}</span>`).join('');
  el('gChart').innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="ck-svg">
    <g class="ck-grid">${grid}</g>
    <defs><linearGradient id="ckg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#004078" stop-opacity=".16"/><stop offset="1" stop-color="#004078" stop-opacity="0"/></linearGradient></defs>
    <path d="${path(dataY)} L${W},${H} L0,${H} Z" fill="url(#ckg)"/>
    ${hasEff ? `<path d="${path(dataF)}" fill="none" stroke="#a9c3d8" stroke-width="2.5" stroke-dasharray="7 6" vector-effect="non-scaling-stroke"/>` : ''}
    <path d="${path(dataY)}" fill="none" stroke="#004078" stroke-width="3" vector-effect="non-scaling-stroke"/>
    </svg>
    ${ylabs}
    <span class="ck-end1" style="top:${((ys(endVal) / H) * 100).toFixed(1)}%">${CHF(endVal)}</span>
    ${hasEff ? `<span class="ck-end2" style="top:${((ys(flatVal) / H) * 100).toFixed(1)}%">${CHF(flatVal)}</span>` : ''}`;
  const axisTicks = years <= 5 ? [0, years] : [0, Math.round(years / 2), years];
  el('ck-axis').innerHTML = axisTicks.map((t) => `<span>${t === 0 ? 'heute' : t + ' J'}</span>`).join('');
}

// ── Modals (buildForm/save = v1 05_cockpit.html Z.974–1089, VOLLSTAENDIG portiert) ──
// REGELVERSTOSS-05-Fix: Modal-Inhalte = Funktionsumfang. Jedes v1-Element ist hier
// wiederhergestellt und traegt data-v1-field für das Gate MODAL-PARITÄT.
const TITLES: Record<string, string> = {
  zahlen: 'Erfassung: Zahlungsverkehr & Alltag', sparen: 'Erfassung: Sparen', vorsorgen: 'Erfassung: Vorsorgen',
  anlegen: 'Erfassung: Anlegen', ausgaben: 'Erfassung: Ausgaben & Einkommen', finanzieren: 'Erfassung: Finanzierung',
};
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
// rb mit explizitem Label (v1-Optionswert bleibt in data-v, Anzeige lesbar).
const rbL = (key: string, val: string, label: string, cur: string): string =>
  `<button class="ck-rb${cur === val ? ' on' : ''}" data-rset="${key}" data-v="${val}" data-v1-field="${key}|${val}">${label}</button>`;
const rb = (key: string, val: string, cur: string): string => rbL(key, val, cap(val), cur);
const yesno = (key: string, val: string): string => `<div class="ck-rbg">${rbL(key, 'ja', 'Ja', val)}${rbL(key, 'nein', 'Nein', val)}</div>`;
const tag = (label: string, on: boolean): string => `<button class="ck-tag${on ? ' on' : ''}" type="button" data-tag data-v1-field="tag|${label}">${label}</button>`;
const sec = (n: number, label: string): string => `<div class="ck-sec"><span class="ck-secn">${n}</span>${label}</div>`;
// Textfeld (Betrag) — data-num für Tausender-Formatierung; NIE auf Freitext (f-bank) anwenden.
const num = (id: string, label: string, val: number, hint = ''): string =>
  `<div class="ck-ig"><label>${label}</label><input type="text" id="f-${id}" data-v1-field="f-${id}" data-num value="${val || ''}">${hint ? `<span class="ck-hint">${hint}</span>` : ''}</div>`;
// wie num, zusätzlich Live-Cashflow-Vorschau (prevCF) bei Eingabe.
const cfNum = (id: string, label: string, val: number): string =>
  `<div class="ck-ig"><label>${label}</label><input type="text" id="f-${id}" data-v1-field="f-${id}" data-num data-cf value="${val || ''}"></div>`;
const int = (id: string, label: string, val: number, min: number): string =>
  `<div class="ck-ig"><label>${label}</label><input type="number" id="f-${id}" data-v1-field="f-${id}" value="${val}" min="${min}"></div>`;
const komm = (cat: SKey): string =>
  `<div class="ck-ig f2"><label>Kommentar</label><textarea id="f-kommentar" data-v1-field="f-kommentar">${esc((S[cat] as Cat).kommentar)}</textarea></div>`;

function buildForm(t: SKey): string {
  if (t === 'zahlen') {
    const kanaele = ['Klassisch', 'eBanking', 'Mobile Banking', 'Bargeldlos'];
    return `<div class="ck-fg">
      <div class="ck-ig"><label>Hauptbank</label><input type="text" id="f-bank" data-v1-field="f-bank" value="${esc(S.zahlen.bank)}" placeholder="z.B. bbz bank"></div>
      ${num('saldo', 'Gesamtsaldo (CHF)', S.zahlen.saldo)}
      ${int('konten', 'Anzahl Konten', S.zahlen.konten, 1)}
      ${int('banken', 'Anzahl Banken', S.zahlen.banken, 1)}
      <div class="ck-ig f2"><label>Zahlungsverkehr-Kanäle</label><div class="ck-rbg">${kanaele.map((k) => tag(k, S.zahlen.kanaele.includes(k))).join('')}</div></div>
      ${komm('zahlen')}
    </div><button class="btn ck-save" data-save="zahlen">Übernehmen</button>`;
  }
  if (t === 'sparen') {
    return `<div class="ck-fg">${sec(1, 'Saldo & Reserve')}
      ${num('saldo', 'Gesamtsaldo (CHF)', S.sparen.saldo)}
      ${int('banken', 'Anzahl Banken', S.sparen.banken, 1)}
      ${int('konten', 'Anzahl Konten', S.sparen.konten, 1)}
      ${num('reserve', 'Wohlfühlreserve (CHF)', S.sparen.reserve, 'Betrag der immer liquide bleibt')}
      <div class="ck-ig f2"><label>Wohlfühlreserve sichergestellt?</label>${yesno('sparen__sichergestellt', S.sparen.sichergestellt)}</div>
      ${sec(2, 'Sparquote')}
      ${num('quoteBetrag', 'Betrag (CHF)', S.sparen.quoteBetrag)}
      <div class="ck-ig"><label>Frequenz</label><select id="f-qFreq" data-v1-field="f-qFreq"><option value="mtl"${S.sparen.quoteFreq === 'mtl' ? ' selected' : ''}>pro Monat</option><option value="pa"${S.sparen.quoteFreq === 'pa' ? ' selected' : ''}>pro Jahr</option></select></div>
      <div class="ck-ig f2"><label>Tendenz</label><div class="ck-rbg">${rb('sparen__quoteTyp', 'positiv', S.sparen.quoteTyp)}${rb('sparen__quoteTyp', 'neutral', S.sparen.quoteTyp)}${rb('sparen__quoteTyp', 'negativ', S.sparen.quoteTyp)}</div></div>
      ${komm('sparen')}
    </div><button class="btn ck-save" data-save="sparen">Übernehmen</button>`;
  }
  if (t === 'vorsorgen') {
    return `<div class="ck-fg">${sec(1, '2. Säule – Pensionskasse')}
      <div class="ck-ig"><label>Situation bekannt?</label>${yesno('vorsorgen__pkBekannt', S.vorsorgen.pkBekannt)}</div>
      ${num('pkSaldo', 'PK-Guthaben (CHF)', S.vorsorgen.pkSaldo, 'Fliesst ins Gesamtvermögen, nicht in Simulation')}
      <div class="ck-ig"><label>Einkäufe getätigt?</label>${yesno('vorsorgen__pkEinkaeufe', S.vorsorgen.pkEinkaeufe)}<span class="ck-hint">Details im Kommentar</span></div>
      <div class="ck-ig"><label>Beträge ausbezahlt / verpfändet?</label>${yesno('vorsorgen__pkAusbezahlt', S.vorsorgen.pkAusbezahlt)}<span class="ck-hint">Details im Kommentar</span></div>
      ${sec(2, '3. Säule (3a)')}
      ${num('s3Saldo', 'Gesamtsaldo (CHF)', S.vorsorgen.s3Saldo)}
      <div class="ck-ig"><label>Anlageform</label><div class="ck-rbg">${['Konto', 'Wertschriften', 'Gemischt'].map((f) => rbL('vorsorgen__s3Form', f, f, S.vorsorgen.s3Form)).join('')}</div></div>
      ${int('s3Konten', 'Anzahl Konten (3a)', S.vorsorgen.s3Konten, 0)}
      ${int('s3Banken', 'Anzahl Banken (3a)', S.vorsorgen.s3Banken, 0)}
      <div class="ck-ig f2"><label>Jährliche Einzahlungen</label><div class="ck-rbg">${rbL('vorsorgen__s3Einz', 'nein', 'Nein', S.vorsorgen.s3Einz)}${rbL('vorsorgen__s3Einz', 'maximal', "Maximalbetrag (CHF 7'258)", S.vorsorgen.s3Einz)}${rbL('vorsorgen__s3Einz', 'anderer', 'Anderer Betrag', S.vorsorgen.s3Einz)}</div></div>
      <div class="ck-ig f2" id="s3bw" style="display:${S.vorsorgen.s3Einz === 'anderer' ? '' : 'none'}"><label>Einzahlungsbetrag (CHF / Jahr)</label><input type="text" id="f-s3EinzB" data-v1-field="f-s3EinzB" data-num value="${S.vorsorgen.s3EinzBetrag || 7258}"><span class="ck-hint">Max. 2025: CHF 7'258 – anpassen falls abweichend</span></div>
      <div class="ck-ig f2" id="strat-wrap" style="display:${S.vorsorgen.s3Form !== 'Konto' ? '' : 'none'}"><label>Anlagestrategie 3a</label><div class="ck-rbg">${['Unbekannt', 'Einkommen', 'Ausgewogen', 'Wachstum', 'Dynamisch'].map((s) => rbL('vorsorgen__s3Strategie', s, s, S.vorsorgen.s3Strategie)).join('')}</div></div>
      ${komm('vorsorgen')}
    </div><button class="btn ck-save" data-save="vorsorgen">Übernehmen</button>`;
  }
  if (t === 'anlegen') {
    return `<div class="ck-fg">
      <div class="ck-ig"><label>Anlagen vorhanden?</label>${yesno('anlegen__vorhanden', S.anlegen.vorhanden)}</div>
      ${num('volumen', 'Anlagevolumen (CHF)', S.anlegen.volumen)}
      <div class="ck-ig f2"><label>Strategie</label><div class="ck-rbg">${['Unbekannt', 'Einkommen', 'Ausgewogen', 'Wachstum', 'Dynamisch'].map((s) => rbL('anlegen__strategie', s, s, S.anlegen.strategie)).join('')}</div></div>
      <div class="ck-ig f2"><label>Betreuungsform</label><div class="ck-rbg">${['selbstorganisiert', 'Beratungsdepot', 'Vermögensverwaltung', 'Verschiedene'].map((s) => rbL('anlegen__typ', s, s, S.anlegen.typ)).join('')}</div></div>
      ${komm('anlegen')}
    </div><button class="btn ck-save" data-save="anlegen">Übernehmen</button>`;
  }
  if (t === 'ausgaben') {
    return `<div class="ck-fg">${sec(1, 'Einkommen')}
      <div class="ck-ig f2"><label>Eingabe-Frequenz</label><div class="ck-rbg">${rbL('ausgaben__freq', 'mtl', 'pro Monat', S.ausgaben.freq)}${rbL('ausgaben__freq', 'pa', 'pro Jahr', S.ausgaben.freq)}</div></div>
      <div class="ck-ig f2"><label>Einkommen-Typ</label><div class="ck-rbg">${rbL('ausgaben__typ', 'netto', 'Netto', S.ausgaben.typ)}${rbL('ausgaben__typ', 'brutto', 'Brutto', S.ausgaben.typ)}</div></div>
      ${cfNum('eMann', 'Einkommen Mann (CHF)', S.ausgaben.eMann)}
      ${cfNum('eFrau', 'Einkommen Frau (CHF)', S.ausgaben.eFrau)}
      ${sec(2, 'Ausgaben (alle Kategorien)')}
      ${cfNum('haushalt', 'Haushalt &amp; Lebenshaltung (CHF / mtl.)', S.ausgaben.haushalt)}
      ${cfNum('leasing', 'Leasing (CHF / mtl.)', S.ausgaben.leasing)}
      ${cfNum('unterhalt', 'Unterhaltszahlungen (CHF / mtl.)', S.ausgaben.unterhalt)}
      ${cfNum('uebrige', 'Übrige Ausgaben (CHF / mtl.)', S.ausgaben.uebrige)}
      <div class="ck-calcbox">
        <span class="ck-calclbl">Cashflow-Saldo = Einkommen − Ausgaben total</span>
        <span class="ck-calcval" id="cf-prev">–</span>
        <span class="ck-hint" id="cf-hint">Cashflow ist indikativ. Die Sparquote wird im Sparen-Layer erfasst.</span>
        <div class="ck-calcrow"><span class="ck-calcsub">Plausibilisierung Sparen-Layer</span><span class="ck-calceff" id="cf-eff">–</span></div>
      </div>
      ${komm('ausgaben')}
    </div><button class="btn ck-save" data-save="ausgaben">Übernehmen</button>`;
  }
  return `<div class="ck-fg">
    <div class="ck-ig"><label>Finanzierung vorhanden?</label>${yesno('finanzieren__vorhanden', S.finanzieren.vorhanden)}</div>
    ${num('betrag', 'Betrag (CHF)', S.finanzieren.betrag)}
    <div class="ck-ig"><label>Kreditform</label><select id="f-form" data-v1-field="f-form"><option value="Hypothek"${S.finanzieren.form === 'Hypothek' ? ' selected' : ''}>Hypothek</option><option value="Andere"${S.finanzieren.form === 'Andere' ? ' selected' : ''}>Andere</option></select></div>
    <div class="ck-ig"><label>Restlaufzeit</label><select id="f-laufzeit" data-v1-field="f-laufzeit"><option value="&lt;1"${S.finanzieren.laufzeit === '<1' ? ' selected' : ''}>unter 1 Jahr</option><option value="1-2"${S.finanzieren.laufzeit === '1-2' ? ' selected' : ''}>1 – 2 Jahre</option><option value="&gt;3"${S.finanzieren.laufzeit === '>3' ? ' selected' : ''}>über 3 Jahre</option></select></div>
    ${komm('finanzieren')}
  </div><button class="btn ck-save" data-save="finanzieren">Übernehmen</button>`;
}

// Live-Vorschau Cashflow im Modal (v1 prevCF) — rein indikativ, fliesst NICHT in die
// Hauptberechnung ein. Alle 3 Hinweis- und 4 Plausibilisierungs-Zustände.
function prevCF(): void {
  const p = document.getElementById('cf-prev'), h = document.getElementById('cf-hint'), e = document.getElementById('cf-eff');
  if (!p) return;
  const freq = S.ausgaben.freq;
  const mM = freq === 'mtl' ? $n('f-eMann') : $n('f-eMann') / 12;
  const fM = freq === 'mtl' ? $n('f-eFrau') : $n('f-eFrau') / 12;
  const eink = mM + fM;
  const ausg = $n('f-haushalt') + $n('f-leasing') + $n('f-unterhalt') + $n('f-uebrige');
  const saldo = eink - ausg;
  const sparLayer = S.sparen.quoteFreq === 'mtl' ? S.sparen.quoteBetrag : S.sparen.quoteBetrag / 12;
  const hasEink = eink > 0, hasAusg = ausg > 0, hasSparLay = sparLayer > 0;
  p.textContent = hasEink ? (saldo >= 0 ? '+ ' : '− ') + CHF(Math.abs(saldo)) + ' / Monat' : '–';
  p.className = 'ck-calcval ' + (saldo >= 0 && hasEink ? 'pos' : saldo < 0 && hasEink ? 'neg' : '');
  if (h) {
    if (hasEink && hasAusg && hasSparLay) {
      if (saldo < sparLayer) { h.textContent = '⚠ Cashflow (' + CHF(Math.max(0, saldo)) + ') liegt unter Sparen-Layer (' + CHF(sparLayer) + ').'; h.style.color = 'var(--amber)'; }
      else { h.textContent = '✓ Cashflow deckt Sparen-Layer (' + CHF(sparLayer) + ' / mtl.) vollständig.'; h.style.color = 'var(--green)'; }
    } else { h.textContent = 'Cashflow ist indikativ. Die Sparquote wird im Sparen-Layer erfasst.'; h.style.color = ''; }
  }
  if (e) {
    if (!hasSparLay) { e.textContent = 'Sparen-Layer nicht erfasst'; e.style.color = 'var(--mut)'; }
    else if (!hasEink || !hasAusg) { e.textContent = 'Einkommen + Ausgaben für Plausibilisierung erfassen'; e.style.color = 'var(--mut)'; }
    else if (saldo < sparLayer) { e.textContent = 'Cashflow deckt Sparquote nicht'; e.style.color = 'var(--amber)'; }
    else { e.textContent = 'Cashflow deckt Sparquote ✓'; e.style.color = 'var(--green)'; }
  }
}
// Konditionale Felder (v1 toggleStrat / set3aEinz).
function toggleStrat(): void { const w = document.getElementById('strat-wrap'); if (w) w.style.display = S.vorsorgen.s3Form === 'Konto' ? 'none' : ''; }
function toggle3aBetrag(): void { const w = document.getElementById('s3bw'); if (w) w.style.display = S.vorsorgen.s3Einz === 'anderer' ? '' : 'none'; }

const fmtInput = (n: number): string => new Intl.NumberFormat('de-CH', { maximumFractionDigits: 0 }).format(n);
// Snapshot für Rollback bei Abbruch (v1 _modalSnapshot/_modalSaved).
let snapshot: string | null = null, snapSaved = false;

function openModal(cat: SKey): void {
  snapshot = JSON.stringify({ zahlen: S.zahlen, sparen: S.sparen, vorsorgen: S.vorsorgen, anlegen: S.anlegen, ausgaben: S.ausgaben, finanzieren: S.finanzieren });
  snapSaved = false;
  el('modalTitle').textContent = TITLES[cat];
  el('modalBody').innerHTML = buildForm(cat);
  el('modalBg').hidden = false;
  const body = el('modalBody');
  // rb / Mehrweg-Buttons: Zustand live setzen + Konditionale/Preview nachziehen.
  body.querySelectorAll<HTMLElement>('[data-rset]').forEach((b) => b.addEventListener('click', () => {
    const key = b.dataset.rset!, [k, sub] = key.split('__');
    (S[k as SKey] as Cat)[sub] = b.dataset.v!;
    b.parentElement!.querySelectorAll('.ck-rb').forEach((x) => x.classList.remove('on'));
    b.classList.add('on');
    if (k === 'ausgaben') prevCF();
    if (key === 'vorsorgen__s3Form') toggleStrat();
    if (key === 'vorsorgen__s3Einz') toggle3aBetrag();
  }));
  // Kanäle-Tags: mehrfach wählbar.
  body.querySelectorAll<HTMLElement>('[data-tag]').forEach((b) => b.addEventListener('click', () => b.classList.toggle('on')));
  // Live-Cashflow bei Zahleneingabe.
  body.querySelectorAll<HTMLElement>('[data-cf]').forEach((i) => i.addEventListener('input', prevCF));
  // Tausender-Formatierung nur auf numerischen Betragsfeldern (nie Freitext).
  body.querySelectorAll<HTMLInputElement>('input[data-num]').forEach((inp) => {
    const v = pN(inp.value); if (v > 0) inp.value = fmtInput(v);
    inp.addEventListener('focus', () => { inp.value = String(pN(inp.value) || ''); });
    inp.addEventListener('blur', () => { const n = pN(inp.value); if (n > 0) inp.value = fmtInput(n); });
  });
  body.querySelector<HTMLElement>('[data-save]')?.addEventListener('click', () => save(cat));
  if (cat === 'ausgaben') prevCF();
  if (cat === 'vorsorgen') { toggleStrat(); toggle3aBetrag(); }
}
function closeModal(): void {
  if (snapshot && !snapSaved) {
    const s = JSON.parse(snapshot) as Record<string, Cat>;
    (['zahlen', 'sparen', 'vorsorgen', 'anlegen', 'ausgaben', 'finanzieren'] as SKey[]).forEach((k) => Object.assign(S[k], s[k]));
  }
  snapshot = null; snapSaved = false;
  el('modalBg').hidden = true;
}
function save(t: SKey): void {
  if (t === 'zahlen') {
    S.zahlen.bank = $v('f-bank'); S.zahlen.saldo = $n('f-saldo');
    S.zahlen.konten = parseInt($v('f-konten'), 10) || 1; S.zahlen.banken = parseInt($v('f-banken'), 10) || 1;
    S.zahlen.kanaele = [...el('modalBody').querySelectorAll('.ck-tag.on')].map((b) => (b.textContent || '').trim());
    S.zahlen.kommentar = $v('f-kommentar');
  } else if (t === 'sparen') {
    S.sparen.saldo = $n('f-saldo'); S.sparen.reserve = $n('f-reserve');
    S.sparen.banken = parseInt($v('f-banken'), 10) || 1; S.sparen.konten = parseInt($v('f-konten'), 10) || 1;
    S.sparen.quoteBetrag = $n('f-quoteBetrag'); S.sparen.quoteFreq = $v('f-qFreq'); S.sparen.kommentar = $v('f-kommentar');
  } else if (t === 'vorsorgen') {
    S.vorsorgen.pkSaldo = $n('f-pkSaldo'); S.vorsorgen.s3Saldo = $n('f-s3Saldo');
    S.vorsorgen.s3Konten = parseInt($v('f-s3Konten'), 10) || 0; S.vorsorgen.s3Banken = parseInt($v('f-s3Banken'), 10) || 0;
    if (S.vorsorgen.s3Einz === 'maximal') S.vorsorgen.s3EinzBetrag = 7258;
    else if (S.vorsorgen.s3Einz === 'anderer') S.vorsorgen.s3EinzBetrag = $n('f-s3EinzB');
    S.vorsorgen.kommentar = $v('f-kommentar');
  } else if (t === 'anlegen') {
    S.anlegen.volumen = $n('f-volumen'); S.anlegen.kommentar = $v('f-kommentar');
  } else if (t === 'ausgaben') {
    S.ausgaben.eMann = $n('f-eMann'); S.ausgaben.eFrau = $n('f-eFrau');
    S.ausgaben.haushalt = $n('f-haushalt'); S.ausgaben.leasing = $n('f-leasing');
    S.ausgaben.unterhalt = $n('f-unterhalt'); S.ausgaben.uebrige = $n('f-uebrige'); S.ausgaben.kommentar = $v('f-kommentar');
  } else if (t === 'finanzieren') {
    S.finanzieren.betrag = $n('f-betrag'); S.finanzieren.form = $v('f-form');
    S.finanzieren.laufzeit = $v('f-laufzeit'); S.finanzieren.kommentar = $v('f-kommentar');
  }
  snapSaved = true;
  renderControls(); calc(); closeModal();
}

// ── Load / Init ──────────────────────────────────────────────────────────────
function loadFromBBZ(): void {
  const d = BBZ.get('cockpit_data') as Record<string, unknown> | null;
  if (!d || typeof d !== 'object') return;
  (['zahlen', 'sparen', 'vorsorgen', 'anlegen', 'ausgaben', 'finanzieren', 'chart'] as SKey[]).forEach((k) => {
    if (d[k] && typeof d[k] === 'object') Object.assign(S[k], d[k]);
  });
}
function init(): void {
  mountNav(el('bbzNav'), { activeId: '05' });
  el('editToggle').addEventListener('click', () => {
    const on = document.body.classList.toggle('edit-mode');
    el('editToggle').setAttribute('aria-pressed', String(on));
  });
  el('modalClose').addEventListener('click', closeModal);
  el('modalBg').addEventListener('click', (e) => { if (e.target === el('modalBg')) closeModal(); });
  loadFromBBZ();
  renderSkeleton();
  calc();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
