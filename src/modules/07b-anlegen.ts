// ============================================================================
// 07b-anlegen.ts — Anlegen (Grammatik v3, Spec §4: referenz-08 Phasenmuster,
// Säule = Phasenliste + Stand). Funktionsumfang = v1 (07b_anlegen.html)
// VOLLSTÄNDIG — Teil A Anlegerprofilierung (6 Phasen) + Teil B Umsetzung (3):
// 1 Parameter (Horizont-Slider 1–35 + Betrag, Cockpit-Prefill cockpit_anlage_f)
// 2 Strategiewunsch (5 STRATS-Karten, Simulation Endwert/Gewinn/95%-Band via
//   lib/finance.simulate — Fixtures A1–A3; Charakteristik + Verlust-Hinweis;
//   Marktverlauf-Chart als SVG statt Chart.js, Regel 5)
// 3 Stresstest (3 Fragen mit v1-Visualisierungen Crash/Erholung/Ereignisse)
// 4 Kenntnisse (5×4-Matrix mehrfach wählbar + Komplexitäts-Pyramide)
// 5 ESG (4 Optionen, abwählbar; bewusst NICHT restored — v1)
// 6 Konklusion (calculateRecommendation — Fixtures E1–E3, Herleitung,
//   finale Wahl mit recommended-Rahmen + Abweichungs-Hinweis)
// B1 Präferenz, B2 Alltag (Vergleichstabelle + Kostenvergleich),
// B3 Auswahl (Bestätigung); Preisparameter-Modal (edit-mode) + Kostenrechner.
// Persistenz: anlage_strategiewunsch/_kenntnisse/_stresstest/_esg/
// _konklusion/_preise/_produktwahl (auswahl bewusst nicht restored — v1).
// Regel 6: Pessimistisch/Verlustwerte neutral (slate/ink), nicht rot.
// ============================================================================
import '../styles/theme.css';
import '../styles/modules/07b-anlegen.css';
import { BBZ } from '../lib/data';
import { mountNav } from '../lib/nav';
import { STRATS as CORE_STRATS, simulate, stressStrategyIdx, stressScore, horizonMaxStrategyIdx } from '../lib/finance';
import { fmt } from '../lib/format';

// v1 STRATS-Zusatzfelder (loss/desc) — Kernwerte aus lib/finance (verbatim)
const STRAT_META = [
  { loss: '2–5%', desc: 'Fokus auf Werterhalt. Sehr geringe Schwankungen durch Fokus auf Geldmarkt und erstklassige Obligationen.' },
  { loss: '5–10%', desc: 'Moderater Zuwachs bei begrenztem Risiko. Geeignet für mittelfristige Horizonte oder vorsichtige Anleger.' },
  { loss: '10–20%', desc: 'Klassische Balance zwischen Aktienchancen und Anleihen-Stabilität. Erfordert Durchhaltewillen.' },
  { loss: '20–30%', desc: 'Deutliche Ausrichtung auf globale Aktienmärkte. Hohes Renditepotenzial bei akzeptierten Marktkorrekturen.' },
  { loss: '30–50%', desc: 'Maximaler Aktienanteil für langfristigen Vermögensaufbau. Hohe Volatilität und markante Einbrüche sind Teil der Strategie.' },
];
const STRATS = CORE_STRATS.map((s, i) => ({ ...s, ...STRAT_META[i] }));

const KNOWLEDGE_CATS = [
  { id: 'anleihen', name: 'Anleihen / Obligationen', complexity: 1 },
  { id: 'aktien', name: 'Aktien', complexity: 2 },
  { id: 'fonds', name: 'Fonds / ETFs', complexity: 2 },
  { id: 'hebel', name: 'Hebelprodukte / Derivate', complexity: 3 },
  { id: 'krypto', name: 'Kryptowährungen', complexity: 3 },
] as const;
const KNOWLEDGE_LEVELS = [
  { id: 'kenntnisse', label: 'Kenntnisse vorhanden' },
  { id: 'erfahrung', label: 'Erfahrung vorhanden' },
  { id: 'im-gespraech', label: 'Im Gespräch erworben' },
  { id: 'n-r', label: 'Nicht relevant' },
] as const;
const ESG_OPTIONS = [
  { id: 'none', title: 'Keine Bedeutung', desc: 'Rendite steht klar im Vordergrund.' },
  { id: 'nachrangig', title: 'Nachrangig', desc: 'Nachhaltigkeit ist ein Plus, kein Muss.' },
  { id: 'gleichwertig', title: 'Gleichwertig', desc: 'Rendite und ESG sind gleich wichtig.' },
  { id: 'vorrangig', title: 'Vorrangig', desc: 'Ich investiere nur in nachhaltige Anlagen.' },
];
const STRESS_DATA = [
  {
    title: 'Reaktion auf Markteinbruch', subtitle: 'Ihr Portfolio verliert 20%. Wie handeln Sie?',
    options: [
      { id: 'sell', t: 'Positionen schliessen', d: 'Ich sichere mein restliches Kapital und verkaufe sofort.' },
      { id: 'wait', t: 'Abwarten & Beobachten', d: 'Ich bin beunruhigt, unternehme aber vorerst nichts.' },
      { id: 'hold', t: 'Strategie treu bleiben', d: 'Schwankungen gehören dazu. Ich sitze den Verlust aus.' },
      { id: 'buy', t: 'Zukaufen / Rebalancing', d: 'Günstige Einstiegspreise nutzen und Zukäufe tätigen.' },
    ], vis: 'crash',
  },
  {
    title: 'Durchhaltevermögen', subtitle: 'Wie lange halten Sie eine Durststrecke aus?',
    options: [
      { id: '1y', t: 'Maximal 1 Jahr', d: 'Danach benötige ich das Kapital oder verliere das Vertrauen.' },
      { id: '3y', t: 'Bis zu 3 Jahre', d: 'Eine normale Marktphase, die ich aussitzen kann.' },
      { id: '5y', t: '5 Jahre und länger', d: 'Ich habe einen langen Atem und brauche das Geld nicht.' },
      { id: 'open', t: 'Zeitpunkt offen', d: 'Ich investiere für Generationen.' },
    ], vis: 'recovery',
  },
  {
    title: 'Bisherige Erfahrung', subtitle: 'Haben Sie bereits einen Crash aktiv miterlebt?',
    options: [
      { id: 'none', t: 'Nein, keine Erfahrung', d: 'Ich bin Neuanleger.' },
      { id: 'little', t: 'Ja, am Rande', d: 'Ich hatte kleine Beträge investiert.' },
      { id: 'lot', t: 'Ja, voll investiert', d: 'Ich kenne das Gefühl realer Verluste.' },
    ], vis: 'history',
  },
];

// ── State (v1 stateA/stateB) ─────────────────────────────────────────────────
type Knowledge = Record<string, string[]>;
const stateA = {
  horizon: null as number | null, amount: 0, stratIdx: null as number | null,
  stressStep: 0, maxUnlocked: 0,
  stress: { react: null as string | null, wait: null as string | null, exp: null as string | null },
  knowledge: { anleihen: [], aktien: [], fonds: [], hebel: [], krypto: [] } as Knowledge,
  esg: null as string | null,
  riskFromStress: null as number | null, recommendation: null as number | null,
  finalStrategy: null as number | null, finalStrategyTouched: false,
};
const defaultAdmin = {
  advisory: { depotPct: 0.30, depotMin: 120, taPct: 0.20, taxFee: 90 },
  vv: { limit1: 500000, pct1: 1.50, limit2: 1000000, pct2: 1.20, limit3: 1000000, pct3: 1.00 },
};
const stateB = {
  amount: 250000,
  productPreference: null as string | null,
  productChoice: null as string | null,
  admin: JSON.parse(JSON.stringify(defaultAdmin)) as typeof defaultAdmin,
};
// Phasen: 0–5 Teil A, 6–8 Teil B
const PHASES = ['Parameter', 'Strategiewunsch', 'Stresstest', 'Kenntnisse', 'ESG', 'Konklusion', 'Präferenz', 'Alltag', 'Auswahl'];
let cur = 0;

const el = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
const fmtCH = (n: number): string => fmt(Math.round(n));
const seededRandom = (seed: number): number => { const x = Math.sin(seed) * 10000; return x - Math.floor(x); };

// ── Säule: Phasenliste ───────────────────────────────────────────────────────
function renderPhases(): void {
  el('phaseList').innerHTML = PHASES.map((p, i) => {
    const cls = i === cur ? ' active' : i < cur || i <= stateA.maxUnlocked ? '' : ' next';
    const done = i < cur;
    return `${i === 6 ? '<div class="an-phsec">UMSETZUNG</div>' : ''}
      <button class="rail-phase${cls}${done ? ' done' : ''}" type="button" data-ph="${i}" ${i > stateA.maxUnlocked ? 'disabled' : ''}>
        <span class="pc">${done ? '✓' : i + 1}</span>${p}
      </button>`;
  }).join('');
  el('phaseList').querySelectorAll<HTMLButtonElement>('[data-ph]').forEach((b) =>
    b.addEventListener('click', () => { if (!b.disabled) showScreen(Number(b.dataset.ph)); }));
  el('railTitle').textContent = cur >= 6 ? 'Umsetzung der Anlagestrategie' : 'Anlegerprofilierung';
}

// ── Screen-Navigation ────────────────────────────────────────────────────────
function showScreen(idx: number): void {
  cur = idx;
  stateA.maxUnlocked = Math.max(stateA.maxUnlocked, idx);
  const render = [renderScr0, renderScr1, renderScr2, renderScr3, renderScr4, renderScr5, renderB1, renderB2, renderB3][idx];
  render();
  renderPhases();
  updateBar();
}

function updateBar(): void {
  el('barPos').textContent = `07b von 10 · Anlegen · ${cur >= 6 ? 'Umsetzung' : 'Profil'} — ${PHASES[cur]}`;
  const back = el('btnBack') as HTMLButtonElement;
  const next = el('btnNext') as HTMLButtonElement;
  back.hidden = cur === 0 && stateA.stressStep === 0;
  next.disabled = false;
  if (cur === 2) next.textContent = stateA.stressStep === 2 ? 'Weiter: Kenntnisse →' : 'Nächste Frage →';
  else if (cur === 5) next.textContent = 'Weiter: Umsetzung →';
  else if (cur === 6) {
    if (stateB.productPreference) next.textContent = 'Weiter: Alltag →';
    else { next.innerHTML = 'Weiter: Alltag <small>→ Präferenz wählen</small>'; next.disabled = true; }
  } else if (cur === 8) {
    if (stateB.productChoice) next.textContent = 'Weiter: Vereinbarungen →';
    else { next.innerHTML = 'Weiter: Vereinbarungen <small>→ Form wählen</small>'; next.disabled = true; }
  } else next.textContent = `Weiter: ${PHASES[cur + 1]} →`;
}

function goNext(): void {
  if (cur === 2) { // Stresstest-Subschritte (v1 nextStressStep)
    if (stateA.stressStep < 2) { stateA.stressStep++; renderScr2(); updateBar(); return; }
    BBZ.set('anlage_stresstest', stateA.stress);
    showScreen(3);
    return;
  }
  if (cur === 5) { persistConclusion(); showScreen(6); return; }
  if (cur === 8) { window.location.href = '08-vereinbarungen.html'; return; }
  showScreen(cur + 1);
}
function goBack(): void {
  if (cur === 2 && stateA.stressStep > 0) { stateA.stressStep--; renderScr2(); updateBar(); return; }
  if (cur > 0) showScreen(cur - 1);
}

// ── Screen 0: Parameter ──────────────────────────────────────────────────────
function renderScr0(): void {
  el('work').innerHTML = `<section class="panel an-screen">
    <div class="kicker">SCHRITT 1 VON 9</div>
    <h2 class="an-h1">Ausgangslage</h2>
    <p class="an-sub">Wie lange soll das Kapital arbeiten — und wie viel steht zur Verfügung?</p>
    <div class="an-paramgrid">
      <div class="an-param">
        <div class="an-plbl">ANLAGEHORIZONT</div>
        <div class="an-hzrow"><span class="an-hzval" id="hzDisplay">${stateA.horizon ?? '–'}</span><span class="an-hzunit">Jahre</span></div>
        <input type="range" id="hzInput" min="1" max="35" value="${stateA.horizon ?? 1}" aria-label="Anlagehorizont in Jahren">
        <div class="an-hzticks"><span>1 Jahr</span><span>15 Jahre</span><span>30+ Jahre</span></div>
        <div class="an-hzhint" id="hzHint"></div>
      </div>
      <div class="an-param">
        <div class="an-plbl">INVESTITIONSBETRAG</div>
        <div class="an-amtbox"><span>CHF</span><input type="text" id="amtInput" placeholder="100'000" value="${stateA.amount ? fmtCH(stateA.amount) : ''}" aria-label="Investitionsbetrag"></div>
        <p class="an-note">Der Betrag fliesst in die Stresstest-Simulation ein und gibt dem Beratungsgespräch einen realistischen Rahmen.</p>
        <p class="an-cockpithint" id="cockpitAmtHint" hidden></p>
      </div>
    </div>
  </section>`;
  const hz = document.getElementById('hzInput') as HTMLInputElement;
  hz.addEventListener('input', () => updateHz(hz.value));
  if (stateA.horizon !== null) updateHz(String(stateA.horizon));
  (document.getElementById('amtInput') as HTMLInputElement).addEventListener('input', (e) => {
    const inp = e.target as HTMLInputElement;
    const val = inp.value.replace(/\D/g, '');
    stateA.amount = val ? parseInt(val, 10) : 0;
    inp.value = stateA.amount ? fmtCH(stateA.amount) : '';
  });
  const saved = BBZ.get('cockpit_anlage_f') as number | null;
  if (saved) {
    const hint = el('cockpitAmtHint');
    hint.textContent = 'Ihr anlagefähiges Kapital aus dem Finanz-Cockpit: CHF ' + fmtCH(saved);
    hint.hidden = false;
  }
}
function updateHz(val: string): void {
  stateA.horizon = parseInt(val, 10);
  const d = document.getElementById('hzDisplay');
  if (d) d.textContent = val;
  const hint = document.getElementById('hzHint');
  if (hint) {
    if (stateA.horizon <= 2) hint.textContent = 'Kurzer Horizont: Kapitalerhalt steht im Vordergrund.';
    else if (stateA.horizon <= 5) hint.textContent = 'Mittlerer Horizont: Konservative bis ausgewogene Strategien denkbar.';
    else if (stateA.horizon <= 9) hint.textContent = 'Mittlerer bis langer Horizont: Wachstumsorientierung denkbar.';
    else hint.textContent = 'Langer Horizont: Auch dynamische Strategien sind vertretbar.';
  }
}

// ── Screen 1: Strategiewunsch + Simulation ───────────────────────────────────
const stratCard = (i: number, activeIdx: number | null, recIdx: number | null = null): string =>
  `<button class="an-strat${activeIdx === i ? ' active' : ''}${recIdx === i ? ' recommended' : ''}" type="button" data-strat="${i}">
    <span class="an-sname">${STRATS[i].name}</span><span class="an-syield">${STRATS[i].yield.toFixed(2)}% – ${(STRATS[i].yield + 0.5).toFixed(2)}%</span>
  </button>`;
function renderScr1(): void {
  el('work').innerHTML = `<section class="panel an-screen">
    <h2 class="an-h1">Strategiewunsch</h2>
    <p class="an-sub">Welche Renditeerwartung haben Sie? (Netto nach Kosten)</p>
    <div class="an-stratgrid" id="stratGrid">${STRATS.map((_, i) => stratCard(i, stateA.stratIdx)).join('')}</div>
    <div class="an-simgrid">
      <div class="an-simcol">
        <div><div class="an-plbl">ERWARTETER ENDWERT (MEDIAN)</div><div class="an-simval" id="simEndAmt">–</div><div class="an-simgain" id="simGain"></div></div>
        <div class="an-bandbox"><div class="an-plbl">WAHRSCHEINLICHE BANDBREITE (95%)</div><div class="an-band" id="bandRange">–</div></div>
      </div>
      <div class="an-simcol">
        <div class="an-plbl">CHARAKTERISTIK</div>
        <p class="an-desc" id="stratDesc">Wählen Sie eine Strategie.</p>
        <div class="an-behav" id="behavioralNote" hidden>⚠ <span id="behavioralText"></span></div>
      </div>
      <div class="an-simchart">
        <div class="an-plbl">MARKTVERLAUF (SIMULATION)</div>
        <div class="an-volwrap" id="volChart"></div>
        <div class="an-legend"><span><i style="background:var(--blue)"></i> Erwartet</span><span><i style="background:rgba(0,64,120,0.12)"></i> Korridor</span><span><i style="background:var(--slate)"></i> Pessimistisch (Crash-Szenario)</span></div>
      </div>
    </div>
  </section>`;
  el('stratGrid').querySelectorAll<HTMLElement>('[data-strat]').forEach((b) =>
    b.addEventListener('click', () => {
      stateA.stratIdx = Number(b.dataset.strat);
      BBZ.set('anlage_strategiewunsch', stateA.stratIdx);
      el('stratGrid').innerHTML = STRATS.map((_, i) => stratCard(i, stateA.stratIdx)).join('');
      el('stratGrid').querySelectorAll<HTMLElement>('[data-strat]').forEach((x) =>
        x.addEventListener('click', () => { stateA.stratIdx = Number(x.dataset.strat); BBZ.set('anlage_strategiewunsch', stateA.stratIdx); renderScr1(); }));
      updateSimulation();
    }));
  updateSimulation();
}
function updateSimulation(): void {
  const end = document.getElementById('simEndAmt');
  if (!end) return;
  if (stateA.stratIdx === null || stateA.horizon === null) {
    end.textContent = '–';
    (document.getElementById('simGain') as HTMLElement).textContent = '';
    (document.getElementById('bandRange') as HTMLElement).textContent = '–';
    (document.getElementById('behavioralNote') as HTMLElement).hidden = true;
    renderVolChart();
    return;
  }
  const r = simulate(stateA.amount, stateA.stratIdx, stateA.horizon);
  end.textContent = 'CHF ' + fmtCH(r.endAmt);
  (document.getElementById('simGain') as HTMLElement).textContent = '+ CHF ' + fmtCH(r.gain) + ' Gewinn';
  (document.getElementById('bandRange') as HTMLElement).textContent = 'CHF ' + fmtCH(r.bandLow) + ' — CHF ' + fmtCH(r.bandHigh);
  (document.getElementById('stratDesc') as HTMLElement).textContent = STRATS[stateA.stratIdx].desc;
  const note = document.getElementById('behavioralNote') as HTMLElement;
  if (STRATS[stateA.stratIdx].vol > 3) {
    note.hidden = false;
    (document.getElementById('behavioralText') as HTMLElement).textContent = `Zwischenzeitliche Verluste von ${STRATS[stateA.stratIdx].loss} sind jederzeit möglich.`;
  } else note.hidden = true;
  renderVolChart();
}
// Marktverlauf als SVG (v1 updateVolChart-Daten verbatim; Regel 5)
function renderVolChart(): void {
  const box = document.getElementById('volChart');
  if (!box) return;
  if (stateA.stratIdx === null || stateA.horizon === null) { box.innerHTML = ''; return; }
  const strat = STRATS[stateA.stratIdx], horizon = stateA.horizon, startAmt = stateA.amount || 100000;
  const expectedP: number[] = [], upperP: number[] = [], lowerP: number[] = [];
  for (let i = 0; i <= horizon; i++) {
    const mu = strat.yield / 100, sigma = strat.vol / 100, sqrtT = Math.sqrt(i);
    const expected = startAmt * Math.pow(1 + mu, i);
    expectedP.push(expected + (i > 0 ? (seededRandom(i + stateA.stratIdx) - 0.5) * 2 * (expected * sigma * 0.15) : 0));
    upperP.push(expected * Math.exp(1.28 * sigma * sqrtT));
    if (i === 0) lowerP.push(startAmt);
    else if (i <= 2) lowerP.push(startAmt * (1 - (strat.vol / 100) * 1.8 * (i / 2)));
    else lowerP.push(startAmt * (1 - (strat.vol / 100) * 1.8) * Math.pow(1 + mu * 0.4, i - 2));
  }
  const all = [...expectedP, ...upperP, ...lowerP];
  const min = Math.min(...all, startAmt * 0.5), max = Math.max(...all);
  const W = 560, H = 190, dom = max - min || 1;
  const xs = (i: number): number => (horizon ? (i / horizon) * W : 0);
  const ys = (v: number): number => H - ((v - min) / dom) * H;
  const path = (d: number[]): string => d.map((v, i) => `${i ? 'L' : 'M'}${xs(i).toFixed(1)},${ys(v).toFixed(1)}`).join(' ');
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="an-volsvg">
    <path d="${path(upperP)} L${W},${ys(expectedP[horizon]).toFixed(1)} ${path(expectedP).split(' ').reverse().join(' ').replace(/M/g, 'L').replace(/^L/, 'L')} Z" fill="rgba(0,64,120,0.08)" stroke="none"/>
    <path d="${path(upperP)}" fill="none" stroke="rgba(0,64,120,0.18)" stroke-width="1.5" vector-effect="non-scaling-stroke"/>
    <path d="${path(lowerP)}" fill="none" stroke="var(--slate)" stroke-width="2" stroke-dasharray="6 4" vector-effect="non-scaling-stroke"/>
    <path d="${path(expectedP)}" fill="none" stroke="var(--blue)" stroke-width="3" vector-effect="non-scaling-stroke"/>
  </svg>
  <div class="an-volx"><span>Jahr 0</span><span>Jahr ${horizon}</span></div>`;
}

// ── Screen 2: Stresstest ─────────────────────────────────────────────────────
function renderScr2(): void {
  const step = STRESS_DATA[stateA.stressStep];
  const key = Object.keys(stateA.stress)[stateA.stressStep] as keyof typeof stateA.stress;
  let vis = '';
  if (step.vis === 'crash') {
    const W = 320, H = 130;
    const pts = [[0, 30], [80, 22], [130, 88], [200, 74], [320, 58]];
    vis = `<div class="an-plbl">BEISPIELHAFTER VERLAUF (−20%)</div>
      <svg viewBox="0 0 ${W} ${H}" class="an-crashsvg" preserveAspectRatio="none"><path d="${pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ')}" fill="none" stroke="var(--slate)" stroke-width="3" vector-effect="non-scaling-stroke"/></svg>
      <div class="an-lossbadge"><div><div class="lb-l">DEPOTVERLUST</div><div class="lb-v">CHF −${fmtCH(stateA.amount * 0.2)}</div></div><div class="an-lossr"><div class="lb-l">RESTWERT</div><div class="lb-v2">CHF ${fmtCH(stateA.amount * 0.8)}</div></div></div>`;
  } else if (step.vis === 'recovery') {
    vis = `<div class="an-plbl">HISTORISCHE ERHOLUNGSZEITEN</div>
      <p class="an-note">Je nach Strategie dauert es unterschiedlich lange, bis ein Verlust wieder aufgeholt ist.</p>
      <div class="an-recbox"><div class="an-plbl" style="color:var(--blue)">Ø ERHOLUNG BEI −20%</div><div class="an-recval">~ 18 bis 36 Monate</div><p class="an-note">Basierend auf historischen Aktienmarkt-Daten.</p></div>`;
  } else {
    const EV = [['Dotcom (2000)', '−50% in 2 Jahren'], ['Finanzkrise (2008)', '−55% in 1.5 Jahren'], ['Corona (2020)', '−35% in 4 Wochen'], ['Ukraine (2022)', '−25% in 10 Monaten']];
    vis = `<div class="an-plbl">GROSSE MARKTEREIGNISSE</div>
      <div class="an-events">${EV.map((e) => `<div class="an-event"><b>${e[0]}</b><span>${e[1]}</span></div>`).join('')}</div>`;
  }
  el('work').innerHTML = `<section class="panel an-screen">
    <h2 class="an-h1">Stresstest &amp; Belastbarkeit</h2>
    <p class="an-sub" id="stressSubtitle">Frage ${stateA.stressStep + 1} von 3: ${step.title}</p>
    <div class="an-split">
      <div class="an-visbox">${vis}</div>
      <div class="an-questions">
        <h3 class="an-q">${step.subtitle}</h3>
        ${step.options.map((o) => `<button class="an-opt${stateA.stress[key] === o.id ? ' active' : ''}" type="button" data-opt="${o.id}"><span class="ot">${o.t}</span><span class="od">${o.d}</span></button>`).join('')}
      </div>
    </div>
  </section>`;
  el('work').querySelectorAll<HTMLElement>('[data-opt]').forEach((b) =>
    b.addEventListener('click', () => { stateA.stress[key] = b.dataset.opt!; renderScr2(); }));
}

// ── Screen 3: Kenntnisse ─────────────────────────────────────────────────────
const isRelevant = (catId: string): boolean => {
  const s = stateA.knowledge[catId] ?? [];
  return s.length > 0 && !s.includes('n-r');
};
function complexityLevel(): number {
  const highRelevant = isRelevant('hebel') || isRelevant('krypto');
  const bothHighNR = (stateA.knowledge.hebel || []).includes('n-r') && (stateA.knowledge.krypto || []).includes('n-r');
  if (highRelevant && !bothHighNR) return 3;
  if (isRelevant('aktien') || isRelevant('fonds') || bothHighNR) return 2;
  if (isRelevant('anleihen')) return 1;
  return 0;
}
function renderScr3(): void {
  el('work').innerHTML = `<section class="panel an-screen">
    <h2 class="an-h1">Kenntnisse &amp; Erfahrungen</h2>
    <p class="an-sub">Detaillierte Erfassung Ihrer Erfahrungen pro Anlageklasse.</p>
    <div class="an-split an-split-k">
      <div class="an-visbox">
        <div class="an-plbl">KOMPLEXITÄTS-PYRAMIDE</div>
        <div class="an-pyramid" id="pyramid"></div>
        <div class="an-knote"><b>Hinweis</b><p>Die dargestellte Komplexität basiert auf Ihren Angaben zu Kenntnissen und Erfahrungen. Höhere Komplexitätsstufen erfordern ein vertieftes Verständnis der Funktionsweise und Risiken.</p></div>
      </div>
      <div class="an-ktable" id="knowledgeGrid"></div>
    </div>
  </section>`;
  renderKnowledgeGrid();
  renderPyramid();
}
function renderKnowledgeGrid(): void {
  const grid = document.getElementById('knowledgeGrid');
  if (!grid) return;
  grid.innerHTML = `<table class="an-ktbl"><thead><tr><th>Anlageklasse</th>${KNOWLEDGE_LEVELS.map((l) => `<th>${l.label}</th>`).join('')}</tr></thead>
    <tbody>${KNOWLEDGE_CATS.map((cat) => `<tr><td>${cat.name}</td>${KNOWLEDGE_LEVELS.map((lvl) => {
      const active = (stateA.knowledge[cat.id] || []).includes(lvl.id);
      return `<td><button class="an-kcheck${active ? ' active' : ''}" type="button" data-k="${cat.id}|${lvl.id}" aria-label="${cat.name} – ${lvl.label}"></button></td>`;
    }).join('')}</tr>`).join('')}</tbody></table>`;
  grid.querySelectorAll<HTMLElement>('[data-k]').forEach((b) =>
    b.addEventListener('click', () => {
      const [catId, lvlId] = b.dataset.k!.split('|');
      const currentSel = Array.isArray(stateA.knowledge[catId]) ? [...stateA.knowledge[catId]] : [];
      stateA.knowledge[catId] = currentSel.includes(lvlId) ? currentSel.filter((v) => v !== lvlId) : [...currentSel, lvlId];
      renderKnowledgeGrid();
      renderPyramid();
      BBZ.set('anlage_kenntnisse', stateA.knowledge);
    }));
}
function renderPyramid(): void {
  const p = document.getElementById('pyramid');
  if (!p) return;
  const maxLevel = complexityLevel();
  // Regel 6: HOCHKOMPLEX neutral dunkel statt v1-Rot
  const layers = [
    { id: 3, label: 'HOCHKOMPLEX', w: '36%', active: 'var(--ink)' },
    { id: 2, label: 'MODERAT', w: '56%', active: 'var(--blue)' },
    { id: 1, label: 'BASIS', w: '74%', active: 'var(--slate)' },
  ];
  p.innerHTML = layers.map((l) => `<div class="an-pyrstep${maxLevel >= l.id ? ' active' : ''}" style="width:${l.w};background:${maxLevel >= l.id ? l.active : '#d9e1ea'}">${l.label}</div>`).join('');
}

// ── Screen 4: ESG ────────────────────────────────────────────────────────────
function renderScr4(): void {
  el('work').innerHTML = `<section class="panel an-screen">
    <h2 class="an-h1">Nachhaltigkeit (ESG)</h2>
    <p class="an-sub">Welche Bedeutung hat Nachhaltigkeit bei Ihrer Anlageentscheidung?</p>
    <div class="an-split">
      <div class="an-visbox">
        <div class="an-plbl">WAS IST ESG?</div>
        <p class="an-desc">ESG steht für Umwelt, Soziales und gute Unternehmensführung. Nachhaltigkeitspräferenzen helfen dabei, Ihre Anlagen nicht nur nach Rendite und Risiko, sondern auch nach Wirkung auszurichten.</p>
        <div class="an-esgpts">
          <div class="an-esgpt"><b>Environment:</b> Umgang mit Klima, Ressourcen und Umweltbelastungen.</div>
          <div class="an-esgpt"><b>Social:</b> Umgang mit Mitarbeitenden, Gesellschaft und Lieferketten.</div>
          <div class="an-esgpt"><b>Governance:</b> Transparenz, Kontrollmechanismen und verantwortungsvolle Führung.</div>
        </div>
        <div class="an-recbox"><b>Einordnung</b><p class="an-note">Ihre Präferenz beeinflusst nicht die Risikohöhe der Strategie, sondern die inhaltliche Ausrichtung der Anlagen.</p></div>
      </div>
      <div class="an-esgopts" id="esgOptions"></div>
    </div>
  </section>`;
  renderESGOptions();
}
function renderESGOptions(): void {
  const box = document.getElementById('esgOptions');
  if (!box) return;
  box.innerHTML = ESG_OPTIONS.map((o) => `<button class="an-esgopt${stateA.esg === o.id ? ' active' : ''}" type="button" data-esg="${o.id}"><span class="an-radio"></span><span><span class="et">${o.title}</span><span class="ed">${o.desc}</span></span></button>`).join('');
  box.querySelectorAll<HTMLElement>('[data-esg]').forEach((b) =>
    b.addEventListener('click', () => {
      stateA.esg = stateA.esg === b.dataset.esg ? null : b.dataset.esg!;
      if (stateA.esg !== null) BBZ.set('anlage_esg', stateA.esg);
      renderESGOptions();
    }));
}

// ── Screen 5: Konklusion (Fixtures E1–E3 via lib/finance) ────────────────────
function calcRecommendation(): void {
  if (stateA.stratIdx === null || stateA.horizon === null) {
    stateA.riskFromStress = null;
    stateA.recommendation = null;
    if (!stateA.finalStrategyTouched) stateA.finalStrategy = null;
    return;
  }
  const horizonMax = horizonMaxStrategyIdx(stateA.horizon);
  const wishIdx = Math.min(stateA.stratIdx, horizonMax);
  const stressIdx = stressStrategyIdx(stressScore({ react: stateA.stress.react ?? '', wait: stateA.stress.wait ?? '', exp: stateA.stress.exp ?? '' }));
  let rec = wishIdx;
  if (stressIdx >= wishIdx) rec = wishIdx;
  else if (wishIdx - stressIdx === 1) rec = wishIdx;
  else rec = Math.min(wishIdx, stressIdx + 1);
  rec = Math.min(rec, horizonMax);
  stateA.riskFromStress = stressIdx;
  stateA.recommendation = rec;
  if (!stateA.finalStrategyTouched) stateA.finalStrategy = rec;
}
const ESG_TEXT: Record<string, string> = {
  none: 'Nachhaltigkeit hat keine besondere Bedeutung.',
  nachrangig: 'Nachhaltigkeit wird als ergänzender Faktor berücksichtigt.',
  gleichwertig: 'Nachhaltigkeit und Rendite werden gleichwertig gewichtet.',
  vorrangig: 'Nachhaltige Ausrichtung steht im Vordergrund der Anlagepolitik.',
};
function recommendationLead(): string {
  const horizonMax = STRATS[horizonMaxStrategyIdx(stateA.horizon!)].name;
  const stressName = STRATS[stateA.riskFromStress!].name;
  return `Die Empfehlung verbindet den Anlagehorizont mit dem Strategiewunsch und spiegelt eine im Stresstest tragbare Risikobereitschaft wider. Der zeitliche Rahmen erlaubt maximal ${horizonMax}; der Stresstest deutet auf ${stressName}.`;
}
function recommendationReason(): string {
  const horizonMax = horizonMaxStrategyIdx(stateA.horizon!);
  const wishIdx = stateA.stratIdx!, stressIdx = stateA.riskFromStress!, recIdx = stateA.recommendation!;
  const parts = [
    `Der Anlagehorizont von ${stateA.horizon} Jahren bildet die objektive Leitplanke und erlaubt maximal die Strategie ${STRATS[horizonMax].name}.`,
    `Ihr Strategiewunsch lautet ${STRATS[wishIdx].name}.`,
  ];
  if (stressIdx > recIdx) parts.push(`Im Stresstest zeigt sich eine höhere Risikobereitschaft. Die Empfehlung bleibt dennoch innerhalb des zeitlich sinnvollen Rahmens bei ${STRATS[recIdx].name}.`);
  else if (stressIdx === recIdx) parts.push(`Im Stresstest zeigt sich eine dazu passende Risikobereitschaft. Damit wird ${STRATS[recIdx].name} als stimmige Empfehlung bestätigt.`);
  else if (wishIdx - stressIdx >= 2 && recIdx > stressIdx) parts.push(`Im Stresstest zeigt sich eine spürbar vorsichtigere Risikobereitschaft. Deshalb wird mit ${STRATS[recIdx].name} ein Schritt Richtung Sicherheit empfohlen.`);
  else if (stressIdx < recIdx) parts.push(`Im Stresstest zeigt sich eine etwas vorsichtigere Risikobereitschaft. Die Empfehlung bleibt mit ${STRATS[recIdx].name} nah am Wunsch.`);
  else parts.push(`Aus der Gesamtschau ergibt sich ${STRATS[recIdx].name} als stimmige Empfehlung.`);
  return parts.join(' ');
}
function renderScr5(): void {
  calcRecommendation();
  const rec = stateA.recommendation, fin = stateA.finalStrategy;
  el('work').innerHTML = `<section class="panel an-screen">
    <h2 class="an-h1">Konklusion</h2>
    <p class="an-sub">Systemische Empfehlung und finale Strategiewahl im Überblick.</p>
    <div class="an-conclgrid">
      <div class="an-summary">
        <div class="an-plbl">EMPFOHLENE STRATEGIE</div>
        <div class="an-recoframe">
          <div class="an-reco receipt-value" id="recommendedStrategyLabel">${rec !== null ? STRATS[rec].name : '–'}</div>
          <p class="an-note" id="recommendationLead">${rec !== null ? recommendationLead() : '–'}</p>
        </div>
        <div class="an-sumsec"><div class="an-plbl">STRATEGIEWUNSCH DES KUNDEN</div><div class="receipt-value" id="customerWishLine">${stateA.stratIdx !== null ? STRATS[stateA.stratIdx].name : '–'}</div></div>
        <div class="an-sumsec"><div class="an-plbl">HERLEITUNG</div><div class="an-desc" id="recommendationReason">${rec !== null ? recommendationReason() : '–'}</div></div>
        <div class="an-sumsec"><div class="an-plbl">NACHHALTIGKEIT</div><div class="an-desc" id="esgConclusionText">${stateA.esg ? ESG_TEXT[stateA.esg] : '–'}</div></div>
        <div class="an-deviation" id="deviationNote" ${fin !== null && rec !== null && fin !== rec ? '' : 'hidden'}>Die gewählte Strategie weicht von der systemischen Empfehlung ab.</div>
      </div>
      <div class="an-summary">
        <div class="an-plbl">FINALE STRATEGIEWAHL</div>
        <p class="an-note">Die Empfehlung dient als Ausgangspunkt. Im Beratungsgespräch kann die finale Strategie bewusst angepasst werden.</p>
        <div class="an-stratgrid an-stratgrid-v" id="finalStratGrid">${STRATS.map((_, i) => stratCard(i, fin, rec)).join('')}</div>
      </div>
    </div>
  </section>`;
  el('finalStratGrid').querySelectorAll<HTMLElement>('[data-strat]').forEach((b) =>
    b.addEventListener('click', () => {
      stateA.finalStrategyTouched = true;
      stateA.finalStrategy = Number(b.dataset.strat);
      renderScr5();
    }));
}
function persistConclusion(): void {
  if (stateA.stratIdx === null || stateA.recommendation === null || stateA.finalStrategy === null) return;
  calcRecommendation();
  BBZ.set('anlage_konklusion', {
    strategiewunsch: STRATS[stateA.stratIdx].name,
    stresstest: stateA.riskFromStress !== null ? STRATS[stateA.riskFromStress].name : '–',
    horizonMax: STRATS[horizonMaxStrategyIdx(stateA.horizon!)].name,
    empfehlung: STRATS[stateA.recommendation].name,
    finaleStrategie: STRATS[stateA.finalStrategy!].name,
    esg: stateA.esg, esgText: stateA.esg ? ESG_TEXT[stateA.esg] : '', begruendung: recommendationReason(),
  });
}

// ── Teil B ───────────────────────────────────────────────────────────────────
function renderB1(): void {
  el('work').innerHTML = `<section class="panel an-screen">
    <h2 class="an-h1">Welche Form der Zusammenarbeit passt besser zu Ihnen?</h2>
    <p class="an-sub">Freuen Sie sich darüber, selbst entscheiden zu dürfen? Oder legen Sie lieber Ihre Präferenzen fest und überlassen die Anlageentscheide anschliessend der Bank?</p>
    <div class="an-choicegrid">
      ${[
        { id: 'advisory', eyebrow: 'Beratungsdepot', title: 'Ich entscheide selbst', intro: 'Sie bleiben aktiv eingebunden und treffen die Anlageentscheide selbst.', flow: ['Beratung und Einordnung', 'Ihr Entscheid', 'Umsetzung bei Bedarf'], note: 'Passt eher, wenn Sie aktiv eingebunden bleiben und den Zeitpunkt von Anpassungen selbst bestimmen möchten.' },
        { id: 'vv', eyebrow: 'Vermögensverwaltung', title: 'Die Bank entscheidet für mich', intro: 'Sie definieren den Rahmen, die Bank übernimmt die laufende Umsetzung.', flow: ['Präferenzen festlegen', 'Entscheid durch die Bank', 'Laufende Umsetzung'], note: 'Passt eher, wenn Sie die laufende Umsetzung delegieren und nicht selbst jede Anpassung auslösen möchten.' },
      ].map((c) => `<button class="an-choice${stateB.productPreference === c.id ? ' active' : ''}" type="button" data-pref="${c.id}">
        <span class="kicker">${c.eyebrow.toUpperCase()}</span>
        <span class="an-ctitle">${c.title}</span>
        <span class="an-cintro">${c.intro}</span>
        <span class="an-flow">${c.flow.map((f, i) => `<span class="an-fnode"><i>${i + 1}</i>${f}</span>`).join('<span class="an-fline"></span>')}</span>
        <span class="an-cnote">${c.note}</span>
      </button>`).join('')}
    </div>
  </section>`;
  el('work').querySelectorAll<HTMLElement>('[data-pref]').forEach((b) =>
    b.addEventListener('click', () => {
      stateB.productPreference = b.dataset.pref!;
      persistChoiceB();
      renderB1();
      renderPhases();
      updateBar();
    }));
}
const B2_ROWS = [
  ['Entscheid', 'Sie treffen jede Anlageentscheidung selbst — die Bank berät und ordnet ein.', 'Die Bank entscheidet innerhalb Ihrer Strategie und Präferenzen.'],
  ['Umsetzung', 'Anpassungen erfolgen erst nach Ihrem Auftrag.', 'Anpassungen werden laufend durch die Bank umgesetzt.'],
  ['Betreuung', 'Begleitung durch Beratung und regelmässige Gespräche.', 'Laufende professionelle Überwachung des Portfolios.'],
  ['Kosten', 'Depotgebühr plus Transaktionskosten je Auftrag.', 'All-in-Fee gemäss Vermögensstaffel.'],
];
function renderB2(): void {
  el('work').innerHTML = `<section class="panel an-screen">
    <h2 class="an-h1">Was bedeutet das für Sie im Alltag?</h2>
    <p class="an-sub">Die strategische Ausrichtung bleibt dieselbe. Der Unterschied liegt darin, wie Entscheidungen, Umsetzung, Betreuung und Kostenstruktur organisiert sind.</p>
    <div class="an-tblwrap"><table class="an-b2tbl">
      <colgroup><col style="width:18%"><col style="width:41%"><col style="width:41%"></colgroup>
      <thead><tr><th></th><th class="h-adv">Beratungsdepot</th><th class="h-vv">Vermögensverwaltung</th></tr></thead>
      <tbody>${B2_ROWS.map((r, i) => `<tr><td class="rl"><i>${i + 1}</i>${r[0]}</td><td class="c-adv">${r[1]}</td><td class="c-vv">${r[2]}</td></tr>`).join('')}</tbody>
    </table>
    <div class="an-tblfoot"><button class="an-costlink" data-calc type="button">Kostenvergleich</button></div></div>
  </section>`;
  wireCalcLinks();
}
function renderB3(): void {
  el('work').innerHTML = `<section class="panel an-screen">
    <h2 class="an-h1">Welche Form wählen Sie?</h2>
    <p class="an-sub">Es gibt kein richtig oder falsch. Entscheidend ist, welche Form der Zusammenarbeit besser zu Ihren Präferenzen passt.</p>
    <div class="an-choicegrid">
      ${[
        { id: 'advisory', eyebrow: 'Beratungsdepot', title: 'Ich möchte die Anlageentscheide selbst treffen', sub: 'Ich bleibe aktiv eingebunden und entscheide situativ, wann Anpassungen umgesetzt werden sollen.' },
        { id: 'vv', eyebrow: 'Vermögensverwaltung', title: 'Ich möchte die Anlageentscheide der Bank überlassen', sub: 'Ich definiere den Rahmen und delegiere die laufende Umsetzung anschliessend an die Bank.' },
      ].map((c) => `<button class="an-choice an-choice-sel${stateB.productChoice === c.id ? ' active' : ''}" type="button" data-choice="${c.id}">
        <span class="kicker">${c.eyebrow.toUpperCase()}</span>
        <span class="an-ctitle">${c.title}</span>
        <span class="an-cintro">${c.sub}</span>
        <span class="an-check">✓</span>
      </button>`).join('')}
    </div>
    <div class="an-tblfoot"><button class="an-costlink" data-calc type="button">Kostenvergleich</button></div>
    <div class="an-confirm" id="confirmationBox" ${stateB.productChoice ? '' : 'hidden'}>
      <span class="an-cmark">✓</span>
      <div>
        <div class="an-ctitle2" id="confirmationTitle">${stateB.productChoice === 'advisory' ? 'Sie haben sich für das Beratungsdepot entschieden' : stateB.productChoice === 'vv' ? 'Sie haben sich für die Vermögensverwaltung entschieden' : ''}</div>
        <div class="an-note" id="confirmationText">${stateB.productChoice === 'advisory' ? 'Sie bleiben aktiv eingebunden und treffen die Anlageentscheide selbst.' : stateB.productChoice === 'vv' ? 'Sie definieren den Rahmen, die Bank übernimmt die laufende Umsetzung.' : ''}</div>
      </div>
    </div>
  </section>`;
  el('work').querySelectorAll<HTMLElement>('[data-choice]').forEach((b) =>
    b.addEventListener('click', () => {
      stateB.productChoice = b.dataset.choice!;
      persistChoiceB();
      renderB3();
      updateBar();
    }));
  wireCalcLinks();
}
function persistChoiceB(): void {
  BBZ.set('anlage_produktwahl', { praeferenz: stateB.productPreference, auswahl: stateB.productChoice });
}

// ── Preisparameter + Kostenrechner (v1) ──────────────────────────────────────
function fillAdminFields(): void {
  const a = stateB.admin;
  const set = (id: string, v: number): void => { (document.getElementById(id) as HTMLInputElement).value = String(v); };
  set('adminDepotPct', a.advisory.depotPct); set('adminDepotMin', a.advisory.depotMin);
  set('adminTaPct', a.advisory.taPct); set('adminTax', a.advisory.taxFee);
  set('adminVvLimit1', a.vv.limit1); set('adminVvPct1', a.vv.pct1);
  set('adminVvLimit2', a.vv.limit2); set('adminVvPct2', a.vv.pct2);
  set('adminVvLimit3', a.vv.limit3); set('adminVvPct3', a.vv.pct3);
}
function saveAdminSettings(): void {
  const num = (id: string): number => Number((document.getElementById(id) as HTMLInputElement).value || 0);
  stateB.admin.advisory = { depotPct: num('adminDepotPct'), depotMin: num('adminDepotMin'), taPct: num('adminTaPct'), taxFee: num('adminTax') };
  stateB.admin.vv = { limit1: num('adminVvLimit1'), pct1: num('adminVvPct1'), limit2: num('adminVvLimit2'), pct2: num('adminVvPct2'), limit3: num('adminVvLimit3'), pct3: num('adminVvPct3') };
  BBZ.set('anlage_preise', stateB.admin);
  el('adminModal').hidden = true;
}
function getVvRate(amount: number): number {
  const vv = stateB.admin.vv;
  if (amount <= vv.limit1) return vv.pct1;
  if (amount <= vv.limit2) return vv.pct2;
  return vv.pct3;
}
function calculateCosts(): void {
  const num = (id: string): number => Number((document.getElementById(id) as HTMLInputElement).value || 0);
  const amount = num('calcAmount'), trades = num('calcTrades'), avgTA = num('calcAvgTradeAmount');
  const adv = stateB.admin.advisory;
  const depotFee = Math.max(amount * (adv.depotPct / 100), adv.depotMin);
  const tradeFee = trades * avgTA * (adv.taPct / 100);
  const advisoryTotal = depotFee + tradeFee + adv.taxFee;
  const vvRate = getVvRate(amount), vvTotal = amount * (vvRate / 100);
  el('resAdvisoryTotal').textContent = 'CHF ' + fmt(advisoryTotal, 0);
  el('resAdvisorySub').textContent = `Depot: CHF ${fmt(depotFee, 0)} · Transaktionen: CHF ${fmt(tradeFee, 0)} · Steuerauszug: CHF ${fmt(adv.taxFee, 0)}`;
  el('resVvTotal').textContent = 'CHF ' + fmt(vvTotal, 0);
  el('resVvSub').textContent = `All-in-Fee mit ${vvRate.toFixed(2)}% auf CHF ${fmt(amount, 0)}`;
  const maxVal = Math.max(advisoryTotal, vvTotal, 1);
  el('barAdv').style.width = (advisoryTotal / maxVal) * 100 + '%';
  el('barVv').style.width = (vvTotal / maxVal) * 100 + '%';
  el('barValueAdv').textContent = 'CHF ' + fmt(advisoryTotal, 0);
  el('barValueVv').textContent = 'CHF ' + fmt(vvTotal, 0);
}
function openCalcModal(): void {
  (document.getElementById('calcAmount') as HTMLInputElement).value = String(stateB.amount || '');
  (document.getElementById('calcTrades') as HTMLInputElement).value = '6';
  (document.getElementById('calcAvgTradeAmount') as HTMLInputElement).value = String(Math.round((stateB.amount || 0) * 0.2));
  el('calcModal').hidden = false;
  calculateCosts();
}
function wireCalcLinks(): void {
  el('work').querySelectorAll<HTMLElement>('[data-calc]').forEach((b) => b.addEventListener('click', openCalcModal));
}

// ── Restore (v1 window.onload) ───────────────────────────────────────────────
function restore(): void {
  const saved = BBZ.get('cockpit_anlage_f') as number | null;
  if (saved) { stateA.amount = Math.round(Number(saved)); stateB.amount = Number(saved); }
  const savedWish = BBZ.get('anlage_strategiewunsch');
  if (savedWish !== null && savedWish !== undefined && savedWish !== '') stateA.stratIdx = parseInt(String(savedWish), 10);
  const savedKnowledge = BBZ.get('anlage_kenntnisse') as Knowledge | null;
  if (savedKnowledge && typeof savedKnowledge === 'object') {
    KNOWLEDGE_CATS.forEach((cat) => {
      const val = savedKnowledge[cat.id];
      if (Array.isArray(val)) stateA.knowledge[cat.id] = val.filter((v) => KNOWLEDGE_LEVELS.some((l) => l.id === v));
      else if (typeof val === 'string' && KNOWLEDGE_LEVELS.some((l) => l.id === val)) stateA.knowledge[cat.id] = [val];
    });
  }
  const savedStress = BBZ.get('anlage_stresstest') as typeof stateA.stress | null;
  if (savedStress) stateA.stress = { ...stateA.stress, ...savedStress };
  // ESG bewusst nicht restored (v1) — wird jede Session neu erfasst
  const savedConclusion = BBZ.get('anlage_konklusion') as { finaleStrategie?: string } | null;
  if (savedConclusion?.finaleStrategie) {
    const idx = STRATS.findIndex((s) => s.name === savedConclusion.finaleStrategie);
    if (idx >= 0) { stateA.finalStrategy = idx; stateA.finalStrategyTouched = true; }
  }
  const savedAdmin = BBZ.get('anlage_preise') as typeof defaultAdmin | null;
  if (savedAdmin) stateB.admin = { advisory: { ...defaultAdmin.advisory, ...(savedAdmin.advisory || {}) }, vv: { ...defaultAdmin.vv, ...(savedAdmin.vv || {}) } };
  const savedChoice = BBZ.get('anlage_produktwahl') as { praeferenz?: string } | null;
  if (savedChoice) stateB.productPreference = savedChoice.praeferenz || null;
  // productChoice bewusst nicht restored (v1) — B3 startet ohne Vorauswahl
}

function init(): void {
  mountNav(el('bbzNav'), { activeId: '07b' });
  el('editToggle').addEventListener('click', () => {
    const on = document.body.classList.toggle('edit-mode');
    el('editToggle').setAttribute('aria-pressed', String(on));
  });
  el('btnNext').addEventListener('click', goNext);
  el('btnBack').addEventListener('click', goBack);
  document.querySelectorAll<HTMLElement>('[data-close]').forEach((b) =>
    b.addEventListener('click', () => { el(b.dataset.close!).hidden = true; }));
  ['adminModal', 'calcModal'].forEach((id) =>
    el(id).addEventListener('click', (e) => { if (e.target === el(id)) el(id).hidden = true; }));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { el('adminModal').hidden = true; el('calcModal').hidden = true; } });
  el('adminSave').addEventListener('click', saveAdminSettings);
  el('calcRun').addEventListener('click', calculateCosts);
  // Preisparameter (v1 Admin-Button in Teil B) — edit-mode-Werkzeug in der Säule (Regel 4)
  el('btnPrices').addEventListener('click', () => { fillAdminFields(); el('adminModal').hidden = false; });
  restore();
  showScreen(0);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
