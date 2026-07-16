// ============================================================================
// 10-abschluss.ts — Abschluss (Grammatik v3, Spec §4: 01-Grammatik, Säule =
// Dank/Botschaft, Bühne = Zusammenfassung aus der Datenschicht).
// Funktionsumfang = v1 (10_abschluss.html):
// - Abschluss-Moment mit Hintergrundbild (Upload im edit-mode; Persistenz
//   abschluss_bgImage (config) + Legacy-Spiegel bbzBgImage wie v1),
//   Kunden-Pill (Name P1 & P2 + Beratungsdatum)
// - Gesprächsbericht drucken: Modi total / finanzieren / anlegen (v1
//   printBericht; activeBranches aus bbzCockpit/bbzData) — Cover, 01
//   Gesprächsrahmen, 05 Kundenbild, 06 Ziele & Wünsche, 07a/07b, 09
//   Vereinbarungen, 10 Feedback, Schlussnotiz, Seitenfuss
// - KORREKTUR gegenüber v1: Der Bericht liest die REALEN Keys der Daten-
//   schicht (cockpit_data, finanzierung_data→tragbarkeit(), anlage_konklusion,
//   vereinbarungen, fb_ratings, agenda_*) — v1 las teils tote Legacy-Keys
//   (cockpit_income, trag_*, anlage_profil; vgl. schema.ts Abweichung B).
// - Schlussnotiz (schlussNotiz) editierbar im edit-mode, erscheint im Bericht.
// - Bühne zeigt dieselbe Zusammenfassung als Screen-Ansicht.
// ============================================================================
import '../styles/theme.css';
import '../styles/modules/10-abschluss.css';
import { BBZ } from '../lib/data';
import { mountNav } from '../lib/nav';
import { tragbarkeit } from '../lib/finance';
import { fmt, parseNum, fmtDate } from '../lib/format';

const BG_KEY = 'bbzBgImage'; // v1-Legacy-Spiegel
const DEFAULT_BG = '../img/abschluss/abschluss.jpg';

const el = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
const esc = (s: unknown): string => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const CHF = (n: unknown): string => {
  const v = Number(n);
  return !v || isNaN(v) ? '–' : 'CHF ' + fmt(Math.round(v));
};
const stars = (n: number): string => { const f = Math.round(n / 2); return '★'.repeat(f) + '☆'.repeat(5 - f); };

let D: Record<string, unknown> = {};
let activeBranches: string[] = ['07a'];
let printBranches: string[] = ['07a'];

function load(): void {
  D = BBZ.all() as Record<string, unknown>;
  try {
    const ck = JSON.parse(localStorage.getItem('bbzCockpit') || '{}') as { branches?: string[] };
    if (Array.isArray(ck.branches) && ck.branches.length) activeBranches = ck.branches.map((b) => b.replace('b', ''));
  } catch { /* noop */ }
  if (Array.isArray(D.activeBranches) && (D.activeBranches as string[]).length) {
    activeBranches = (D.activeBranches as string[]).map((b) => b.replace('b', ''));
  }
  const savedBg = (D.abschluss_bgImage as string) || localStorage.getItem(BG_KEY);
  el('heroBg').style.backgroundImage = `url('${savedBg || DEFAULT_BG}')`;
}

function initUI(): void {
  const name = [D.p1name, D.p2name].filter(Boolean).join(' & ') || '–';
  el('stageName').textContent = name;
  const datum = D.beratungsdatum
    ? new Date(String(D.beratungsdatum)).toLocaleDateString('de-CH', { day: '2-digit', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('de-CH', { day: '2-digit', month: 'long', year: 'numeric' });
  el('stageDate').textContent = datum;
  const notiz = el('schlussNotiz');
  if (typeof D.schlussNotiz === 'string' && D.schlussNotiz.trim()) notiz.textContent = D.schlussNotiz;
  notiz.addEventListener('blur', () => BBZ.set('schlussNotiz', (notiz.textContent ?? '').trim()));
}

// ── Datenaggregation (reale Keys) ────────────────────────────────────────────
interface CockpitData { zahlen?: { saldo?: number }; sparen?: { saldo?: number }; vorsorgen?: { s3Saldo?: number; pkSaldo?: number }; anlegen?: { volumen?: number } }
function gather(): {
  traktanden: string[]; erwartungen: string[];
  kpis: Array<{ label: string; val: string; sub: string }>;
  items: Array<Record<string, unknown>>;
  fin: ReturnType<typeof tragbarkeit> & { price: number } | null;
  konk: Record<string, string> | null; produktwahl: { praeferenz?: string; auswahl?: string } | null;
  vereinb: Array<Record<string, unknown>>; ratings: number[];
} {
  const traktanden = Array.isArray(D.agenda_traktanden) ? (D.agenda_traktanden as string[]) : [];
  const erwartungen = Array.isArray(D.agenda_erwartungen) ? (D.agenda_erwartungen as string[]) : [];
  const cd = (D.cockpit_data ?? {}) as CockpitData;
  const liq = (cd.zahlen?.saldo ?? 0) + (cd.sparen?.saldo ?? 0);
  const kpis = [
    { label: 'Bruttoeinkommen p.a.', val: CHF(D.cockpit_einkommen), sub: 'annualisiert' },
    { label: 'Verpflichtungen p.a.', val: CHF(D.cockpit_verpflichtungen), sub: 'laufend' },
    { label: 'Liquide Mittel', val: liq > 0 ? CHF(liq) : '–', sub: 'Zahlungs- & Sparkonten' },
    { label: '3. Säule (Säule 3a)', val: (cd.vorsorgen?.s3Saldo ?? 0) > 0 ? CHF(cd.vorsorgen!.s3Saldo) : '–', sub: 'Vorsorge' },
    { label: '2. Säule (PK)', val: CHF(D.cockpit_pk_saldo ?? cd.vorsorgen?.pkSaldo), sub: 'Pensionskasse' },
    { label: 'Anlagevermögen', val: (cd.anlegen?.volumen ?? 0) > 0 ? CHF(cd.anlegen!.volumen) : '–', sub: 'Depots & Fonds' },
  ];
  const ziele = Array.isArray(D.ziele) ? (D.ziele as Array<Record<string, unknown>>) : [];
  const wuensche = Array.isArray(D.wuensche) ? (D.wuensche as Array<Record<string, unknown>>) : [];
  const items: Array<Record<string, unknown>> = [
    ...ziele.map((z) => ({ ...z, _typ: (z.typ as string) || 'ziel' })),
    ...wuensche.map((w) => ({ ...w, _typ: 'wunsch' })),
  ];
  items.sort((a, b) => ((a.jahr as number) || 9999) - ((b.jahr as number) || 9999));

  // 07a aus finanzierung_data neu rechnen (Rechenkern)
  let fin: (ReturnType<typeof tragbarkeit> & { price: number }) | null = null;
  const fd = D.finanzierung_data as { inputs?: Record<string, unknown> } | null;
  if (fd?.inputs) {
    const n = (k: string): number => parseNum(fd.inputs![k] as string | number | null);
    const price = n('price');
    if (price > 0) {
      fin = {
        ...tragbarkeit({
          income: n('income'), obligations: n('obligations'), price, cashEquity: n('cashEquity'),
          pensionWithdraw: n('pensionWithdraw'), pensionPledge: n('pensionPledge'),
          calcRate: n('calcRate') || 5, sideRate: n('sideRate') || 0.75, age: n('age') || 40,
        }),
        price,
      };
    }
  }
  const konk = (D.anlage_konklusion as Record<string, string>) || null;
  const produktwahl = (D.anlage_produktwahl as { praeferenz?: string; auswahl?: string }) || null;
  const vereinb = Array.isArray(D.vereinbarungen) ? (D.vereinbarungen as Array<Record<string, unknown>>) : [];
  const ratings = Array.isArray(D.fb_ratings) ? (D.fb_ratings as number[]) : [];
  return { traktanden, erwartungen, kpis, items, fin, konk, produktwahl, vereinb, ratings };
}

// ── Bühnen-Zusammenfassung ───────────────────────────────────────────────────
const TYP_LABEL: Record<string, string> = { ziel: 'Ziel', wunsch: 'Wunsch', zufluss: 'Geldzufluss' };
function renderSummary(): void {
  const g = gather();
  const produktLabel: Record<string, string> = { advisory: 'Beratungsdepot', vv: 'Vermögensverwaltung' };
  el('summary').innerHTML = `
    <div class="ab-sec"><div class="ab-sech">01 · GESPRÄCHSRAHMEN</div>
      ${g.erwartungen.length ? g.erwartungen.map((e) => `<div class="ab-quote">«${esc(e)}»</div>`).join('') : '<div class="ab-empty">Keine Erwartungen erfasst.</div>'}
    </div>
    <div class="ab-sec"><div class="ab-sech">05 · FINANZIELLES KUNDENBILD</div>
      <div class="ab-kpis">${g.kpis.map((k) => `<div class="ab-kpi"><span class="ab-kl">${esc(k.label)}</span><span class="ab-kv">${k.val}</span></div>`).join('')}</div>
    </div>
    <div class="ab-sec"><div class="ab-sech">06 · ZIELE &amp; WÜNSCHE <small>${g.items.length} Einträge</small></div>
      ${g.items.length ? `<div class="ab-ziele">${g.items.map((i) => `<span class="ab-ziel t-${i._typ}">${esc(i.name || i.insp || '–')}${i.jahr ? ` · ${i.jahr}` : ''}${(i.betrag as number) > 0 ? ` · ${CHF(i.betrag)}` : ''}</span>`).join('')}</div>` : '<div class="ab-empty">Keine Ziele oder Wünsche erfasst.</div>'}
    </div>
    ${g.fin ? `<div class="ab-sec"><div class="ab-sech">07a · EIGENHEIMFINANZIERUNG</div>
      <div class="ab-kpis">
        <div class="ab-kpi"><span class="ab-kl">Kaufpreis</span><span class="ab-kv">${CHF(g.fin.price)}</span></div>
        <div class="ab-kpi"><span class="ab-kl">Hypothek</span><span class="ab-kv">${CHF(g.fin.totalHypo)}</span></div>
        <div class="ab-kpi"><span class="ab-kl">Tragbarkeit kalk.</span><span class="ab-kv">${Math.round(g.fin.affordPct)}%</span></div>
        <div class="ab-kpi"><span class="ab-kl">Belehnung</span><span class="ab-kv">${Math.round(g.fin.ltv)}%</span></div>
      </div></div>` : ''}
    ${g.konk ? `<div class="ab-sec"><div class="ab-sech">07b · ANLEGEN</div>
      <div class="ab-kpis">
        <div class="ab-kpi"><span class="ab-kl">Empfehlung</span><span class="ab-kv">${esc(g.konk.empfehlung)}</span></div>
        <div class="ab-kpi"><span class="ab-kl">Finale Strategie</span><span class="ab-kv">${esc(g.konk.finaleStrategie)}</span></div>
        ${g.produktwahl?.auswahl ? `<div class="ab-kpi"><span class="ab-kl">Produktwahl</span><span class="ab-kv">${esc(produktLabel[g.produktwahl.auswahl] ?? g.produktwahl.auswahl)}</span></div>` : ''}
      </div></div>` : ''}
    <div class="ab-sec"><div class="ab-sech">08 · VEREINBARUNGEN <small>${g.vereinb.length}</small></div>
      ${g.vereinb.length ? g.vereinb.map((v) => `<div class="ab-vrow"><span class="ab-vcheck">✓</span><span>${esc(v.text || v.sparte || '–')}${v.stepWer ? ` <small>· ${esc(v.stepWer)}</small>` : ''}${v.stepWann ? ` <small>· ${esc(v.stepWann)}</small>` : ''}</span></div>`).join('') : '<div class="ab-empty">Keine Vereinbarungen erfasst.</div>'}
    </div>
    ${g.ratings.length && g.erwartungen.length ? `<div class="ab-sec"><div class="ab-sech">09 · ZUFRIEDENHEIT</div>
      ${g.erwartungen.map((e, i) => { const r = g.ratings[i] ?? 7; return `<div class="ab-fbrow"><span class="ab-fbe">«${esc(e)}»</span><span class="ab-fbs">${stars(r)}</span><b>${r}/10</b></div>`; }).join('')}
    </div>` : ''}`;
}

// ── Druckbericht (v1 buildReport, reale Keys) ────────────────────────────────
function buildReport(): string {
  const g = gather();
  const berater = (D.beraterName as string) || 'Berater:in';
  const beraterTitel = (D.beraterTitel as string) || '';
  const kunde = [D.p1name, D.p2name].filter(Boolean).join(' & ') || 'Kunde';
  const datum = D.beratungsdatum
    ? new Date(String(D.beratungsdatum)).toLocaleDateString('de-CH', { day: '2-digit', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('de-CH', { day: '2-digit', month: 'long', year: 'numeric' });
  const notiz = ((D.schlussNotiz as string) || '').trim();
  const traktanden = g.traktanden.length ? g.traktanden : [
    'Ihre aktuelle Gesamtsituation', 'Veränderungen mit finanziellen Auswirkungen', 'Ihre Ziele & Wünsche',
    'Handlungsfelder & Optimierungen', 'Entscheidungen', 'Nächste Schritte',
  ];

  let html = `<div class="rp-cover">
    <div class="rp-logo-row"><span class="rp-logo-box">bbz</span><span class="rp-logo-name">bbz bank st.gallen</span></div>
    <div class="rp-cover-title">Gesprächsbericht</div>
    <div class="rp-cover-sub">Persönliches Beratungsgespräch – Zusammenfassung</div>
    <div class="rp-meta-grid">
      <div class="rp-meta"><span>Kunde / Kundin</span><b>${esc(kunde)}</b></div>
      <div class="rp-meta"><span>Datum</span><b>${esc(datum)}</b></div>
      <div class="rp-meta"><span>Berater:in</span><b>${esc(berater)}${beraterTitel ? ' · ' + esc(beraterTitel) : ''}</b></div>
      ${D.p1geb ? `<div class="rp-meta"><span>Jahrgang</span><b>${fmtDate(String(D.p1geb))}${D.p2geb ? ' / ' + fmtDate(String(D.p2geb)) : ''}</b></div>` : ''}
    </div>
  </div>`;

  const section = (num: string, title: string, sub: string, body: string): string =>
    `<div class="rp-section"><div class="rp-sh"><span class="rp-snum">${num}</span><span class="rp-stitle">${title}</span><span class="rp-ssub">${sub}</span></div>${body}</div>`;

  html += section('01', 'Gesprächsrahmen', 'Agenda & Erwartungen', `
    <div class="rp-2col">
      <div><div class="rp-lbl">Traktanden</div>${traktanden.map((t, i) => `<div class="rp-lrow"><span class="rp-lnum">${String(i + 1).padStart(2, '0')}</span>${esc(t)}</div>`).join('')}</div>
      <div><div class="rp-lbl">Ihre Erwartungen</div>${g.erwartungen.length ? g.erwartungen.map((e) => `<div class="rp-quote">«${esc(e)}»</div>`).join('') : '<div class="rp-empty">Keine Erwartungen erfasst.</div>'}</div>
    </div>`);

  html += section('05', 'Finanzielles Kundenbild', 'Vermögen, Einkommen, Cashflow',
    `<div class="rp-kpis">${g.kpis.map((k) => `<div class="rp-kpi"><span>${esc(k.label)}</span><b>${k.val}</b><small>${esc(k.sub)}</small></div>`).join('')}</div>`);

  html += section('06', 'Ziele & Wünsche', `${g.items.length} Einträge`,
    g.items.length
      ? `<div class="rp-ziele">${g.items.map((item) => {
          const t = (item._typ as string) || 'ziel';
          return `<div class="rp-ziel t-${t}"><div class="rp-zh"><b>${esc(item.name || item.insp || '–')}</b><span class="rp-ztag t-${t}">${TYP_LABEL[t] ?? t}</span></div>
            <div class="rp-zmeta">${item.jahr ? `<span>${item.jahr}</span>` : '<span>Zeitpunkt offen</span>'}${(item.betrag as number) > 0 ? `<span>${CHF(item.betrag)}</span>` : ''}${item.prob ? `<span class="rp-cap">${esc(item.prob)}</span>` : ''}</div>
            ${item.notiz ? `<div class="rp-znote">${esc(item.notiz)}</div>` : ''}</div>`;
        }).join('')}</div>`
      : '<div class="rp-empty">Keine Ziele oder Wünsche erfasst.</div>');

  if (printBranches.includes('07a')) {
    html += section('7a', 'Eigenheimfinanzierung', 'Tragbarkeit & Hypothek',
      g.fin
        ? `<div class="rp-kpis rp-kpis4">
            <div class="rp-kpi"><span>Kaufpreis</span><b>${CHF(g.fin.price)}</b></div>
            <div class="rp-kpi"><span>Hypothek</span><b>${CHF(g.fin.totalHypo)}</b></div>
            <div class="rp-kpi"><span>Tragbarkeit kalk.</span><b class="${g.fin.affordPct > 40 ? 'crit' : g.fin.affordPct > 33.5 ? 'warn' : ''}">${Math.round(g.fin.affordPct)}%</b></div>
            <div class="rp-kpi"><span>Belehnung</span><b class="${g.fin.ltv > 80 ? 'crit' : g.fin.ltv > 66.7 ? 'warn' : ''}">${Math.round(g.fin.ltv)}%</b></div>
          </div>`
        : '<div class="rp-empty">Keine Tragbarkeitsdaten erfasst.</div>');
  }
  if (printBranches.includes('07b')) {
    const produktLabel: Record<string, string> = { advisory: 'Beratungsdepot', vv: 'Vermögensverwaltung' };
    html += section('7b', 'Anlegen', 'Anlegerprofil & Strategie',
      g.konk
        ? `<div class="rp-kvs">${[
            ['Strategiewunsch', g.konk.strategiewunsch], ['Stresstest', g.konk.stresstest],
            ['Horizont erlaubt max.', g.konk.horizonMax], ['Empfehlung', g.konk.empfehlung],
            ['Finale Strategie', g.konk.finaleStrategie],
            ['Nachhaltigkeit', g.konk.esgText || 'Nicht erfasst'],
            ...(g.produktwahl?.auswahl ? [['Produktwahl', produktLabel[g.produktwahl.auswahl] ?? g.produktwahl.auswahl]] : []),
          ].map((kv) => `<div class="rp-kv"><span>${esc(kv[0])}</span><b>${esc(kv[1] ?? '–')}</b></div>`).join('')}</div>
          ${g.konk.begruendung ? `<p class="rp-reason">${esc(g.konk.begruendung)}</p>` : ''}`
        : '<div class="rp-empty">Keine Anlegerdaten erfasst.</div>');
  }

  html += section('08', 'Vereinbarungen & nächste Schritte', `${g.vereinb.length} Vereinbarungen`,
    g.vereinb.length
      ? g.vereinb.map((v) => `<div class="rp-vrow"><span class="rp-vcheck">✓</span><div><b>${esc(v.text || v.sparte || '–')}</b>
          ${v.stepWas ? `<div class="rp-vwho">${esc(v.stepWas)}</div>` : ''}
          ${v.stepWer ? `<div class="rp-vwho">Verantwortlich: ${esc(v.stepWer)}</div>` : ''}
          ${v.stepWann ? `<div class="rp-vwho">Bis: ${esc(v.stepWann)}</div>` : ''}</div></div>`).join('')
      : '<div class="rp-empty">Keine Vereinbarungen erfasst.</div>');

  if (g.ratings.length && g.erwartungen.length) {
    html += section('09', 'Zufriedenheit', 'Feedback nach dem Gespräch',
      g.erwartungen.map((e, i) => {
        const r = g.ratings[i] ?? 7;
        return `<div class="rp-fbrow"><span class="rp-fbe">«${esc(e)}»</span><span class="rp-fbs">${stars(r)}</span><b>${r * 10}%</b></div>`;
      }).join(''));
  }
  if (notiz) html += section('✎', 'Persönliche Notiz', '', `<div class="rp-notiz">${esc(notiz)}</div>`);

  html += `<div class="rp-foot"><span>bbz bank st.gallen · Vertraulich</span><span>Erstellt am ${new Date().toLocaleDateString('de-CH')} · ${esc(berater)}</span></div>`;
  return html;
}

// v1 printBericht (Modi)
function printBericht(mode: string): void {
  D = BBZ.all() as Record<string, unknown>; // frisch lesen (z.B. Schlussnotiz)
  if (mode === 'total') printBranches = ['07a', '07b'];
  else if (mode === 'finanzieren') printBranches = ['07a'];
  else if (mode === 'anlegen') printBranches = ['07b'];
  else printBranches = activeBranches.length ? activeBranches : ['07a'];
  el('printReport').innerHTML = buildReport();
  window.print();
}

function init(): void {
  mountNav(el('bbzNav'), { activeId: '10' });
  el('editToggle').addEventListener('click', () => {
    const on = document.body.classList.toggle('edit-mode');
    el('editToggle').setAttribute('aria-pressed', String(on));
    el('schlussNotiz').contentEditable = on ? 'true' : 'false';
  });
  (document.getElementById('bgUploadInput') as HTMLInputElement).addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      el('heroBg').style.backgroundImage = `url('${dataUrl}')`;
      try { localStorage.setItem(BG_KEY, dataUrl); } catch { /* noop */ }
      BBZ.set('abschluss_bgImage', dataUrl); // config-scope wie v1
    };
    reader.readAsDataURL(file);
  });
  el('btnPrint').addEventListener('click', () => printBericht((document.getElementById('printScope') as HTMLSelectElement).value));
  // Nur aktive Vertiefungen anbieten (index: "im Abschluss wählbar welche gedruckt wird")
  load();
  const scope = document.getElementById('printScope') as HTMLSelectElement;
  if (!activeBranches.includes('07a')) (scope.querySelector('[value="finanzieren"]') as HTMLOptionElement).disabled = true;
  if (!activeBranches.includes('07b')) (scope.querySelector('[value="anlegen"]') as HTMLOptionElement).disabled = true;
  initUI();
  renderSummary();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
