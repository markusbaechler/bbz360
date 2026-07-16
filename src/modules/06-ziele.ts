// ============================================================================
// 06-ziele.ts — Ziele & Wünsche (Grammatik v3). Funktionsumfang = v1
// (06_ziele.html) VOLLSTÄNDIG portiert:
// - 8 Lebensthemen-Kacheln (7 Ziele + Geldeingänge grün) mit Count-Badges
// - Zeitachse mit Bubbles (Grösse = Eintrittswahrscheinlichkeit), Drag ändert
//   Jahr, Alters-Ticks + 65er-Milestones (P1/P2 aus Stammdaten), Zoom
//   kurz (2J) / mittel (5J) / lang (alles), Kollisionvermeidung (findY)
// - Rechte Sammelspalte: Mittelfristig (bei Kurz-Zoom), Langfristig (bei
//   Kurz/Mittel), Zeitpunkt offen, Wunschliste (rot = Kundeninhalt, Regel 6)
// - Ziel-Modal: Inspirations-Chips je Kategorie (v1 KATS verbatim),
//   Bezeichnung, Zeithorizont (kurz→Jahr-Kacheln, mittel→Kacheln,
//   lang→Slider now+6..now+35, offen), Betrag (Tausender), Eintritts-
//   wahrscheinlichkeit (nur Ziele), Notiz, Löschen im Edit
// - Wunsch-Modal: Kategorie-Chips (ohne Zufluss), Name (Pflicht), Jahr/
//   Betrag optional, Notiz, Löschen
// - Recap-Modal: 4 Zeithorizont-Buckets mit Totals (Kapital/Zuflüsse),
//   Klick → Edit; Legende
// Persistenz: BBZ.merge({ ziele, wuensche }) wie v1. Gate MODAL-PARITÄT
// (ADR-12) via data-v1-field + Fixture modal-parity.fixture.ts (06-Teil).
// Regel 6: Amber NUR Zeithorizont "mittelfristig" (hier zulässig), Wünsche
// rot (Kundeninhalt).
// ============================================================================
import '../styles/theme.css';
import '../styles/modules/06-ziele.css';
import { BBZ } from '../lib/data';
import { mountNav } from '../lib/nav';

// ── Icons (v1, unverändert) ──────────────────────────────────────────────────
const I: Record<string, string> = {
  heart: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>',
  home: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>',
  brief: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>',
  globe: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
  chart: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>',
  shield: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>',
  bag: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>',
  cash: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
  ring: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path stroke-linecap="round" d="M12 2v2M12 20v2M2 12h2M20 12h2"/></svg>',
  baby: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
  grad: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M12 14l9-5-9-5-9 5 9 5z"/><path d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"/></svg>',
  tools: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z"/></svg>',
  plane: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>',
  car: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0zM13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0"/></svg>',
  sun: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/></svg>',
  book: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>',
  star: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/></svg>',
  doc: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>',
  lock: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>',
  gift: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"/></svg>',
  piggy: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/></svg>',
  sell: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/></svg>',
  ins: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>',
};

// ── v1 KATS verbatim ─────────────────────────────────────────────────────────
export interface Insp { t: string; i: string }
export interface Kat { id: string; lbl: string; type: 'ziel' | 'zufluss'; ikon: string; defaultJahr: 'kurz' | 'mittel' | 'lang'; defaultBetrag: number; insp: Insp[] }
export const KATS: Kat[] = [
  { id: 'familie', lbl: 'Familie &\nPartnerschaft', type: 'ziel', ikon: 'heart', defaultJahr: 'kurz', defaultBetrag: 20000, insp: [{ t: 'Heirat / Hochzeit', i: 'ring' }, { t: 'Familienplanung / Nachwuchs', i: 'baby' }, { t: 'Ausbildung Kind', i: 'grad' }, { t: 'Scheidungsvorsorge', i: 'doc' }, { t: 'Erbschaftsplanung', i: 'doc' }, { t: 'Sonstiges', i: 'star' }] },
  { id: 'wohnen', lbl: 'Wohnen &\nImmobilien', type: 'ziel', ikon: 'home', defaultJahr: 'lang', defaultBetrag: 800000, insp: [{ t: 'Erstwohnung kaufen', i: 'home' }, { t: 'Renovation / Umbau', i: 'tools' }, { t: 'Zweitwohnung / Ferienhaus', i: 'sun' }, { t: 'Liegenschaft verkaufen', i: 'sell' }, { t: 'Umzug / Verkleinerung', i: 'home' }, { t: 'Sonstiges', i: 'star' }] },
  { id: 'karriere', lbl: 'Karriere &\nErwerbsleben', type: 'ziel', ikon: 'brief', defaultJahr: 'mittel', defaultBetrag: 50000, insp: [{ t: 'Selbständigkeit / Firmengründung', i: 'brief' }, { t: 'Frühpensionierung', i: 'sun' }, { t: 'Teilzeitanstellung', i: 'brief' }, { t: 'Sabbatical', i: 'plane' }, { t: 'Weiterbildung / Studium', i: 'book' }, { t: 'Sonstiges', i: 'star' }] },
  { id: 'freizeit', lbl: 'Freizeit &\nGenuss', type: 'ziel', ikon: 'globe', defaultJahr: 'mittel', defaultBetrag: 30000, insp: [{ t: 'Weltreise', i: 'plane' }, { t: 'Reisen & Ferien', i: 'plane' }, { t: 'Boot / Segelschiff', i: 'globe' }, { t: 'Ferienwohnung', i: 'sun' }, { t: 'Hobby vertiefen', i: 'star' }, { t: 'Sonstiges', i: 'star' }] },
  { id: 'vermoegen', lbl: 'Vermögensaufbau', type: 'ziel', ikon: 'chart', defaultJahr: 'lang', defaultBetrag: 100000, insp: [{ t: 'Liquidität aufbauen (Sparziel)', i: 'piggy' }, { t: 'Anlageziel Wertschriften', i: 'chart' }, { t: 'Schulden abbauen', i: 'piggy' }, { t: 'Vorsorgelücke schliessen', i: 'shield' }, { t: 'Vermögen strukturieren', i: 'doc' }, { t: 'Sonstiges', i: 'star' }] },
  { id: 'vorsorge', lbl: 'Vorsorge &\nAbsicherung', type: 'ziel', ikon: 'shield', defaultJahr: 'lang', defaultBetrag: 50000, insp: [{ t: 'BVG-Einkauf', i: 'piggy' }, { t: 'Säule 3a aufbauen', i: 'lock' }, { t: 'Testament / Vorsorgeauftrag', i: 'doc' }, { t: 'Lebensversicherung', i: 'shield' }, { t: 'Invaliditätsschutz', i: 'shield' }, { t: 'Todesfallkapital sichern', i: 'shield' }, { t: 'Kinderrente', i: 'baby' }, { t: 'Pflegevorsorge', i: 'heart' }, { t: 'Sonstiges', i: 'star' }] },
  { id: 'anschaffungen', lbl: 'Anschaffungen', type: 'ziel', ikon: 'bag', defaultJahr: 'kurz', defaultBetrag: 40000, insp: [{ t: 'Auto / Fahrzeug', i: 'car' }, { t: 'Einrichtung / Möbel', i: 'home' }, { t: 'Elektromobilität', i: 'car' }, { t: 'Luxusobjekt', i: 'star' }, { t: 'Technologie / Ausrüstung', i: 'tools' }, { t: 'Sonstiges', i: 'star' }] },
  { id: 'zufluss', lbl: 'Erwartete Geldeingänge', type: 'zufluss', ikon: 'cash', defaultJahr: 'lang', defaultBetrag: 200000, insp: [{ t: 'Erbschaft / Legat', i: 'gift' }, { t: 'Schenkung', i: 'gift' }, { t: 'Kapitalleistung BVG', i: 'piggy' }, { t: 'Auszahlung Säule 3a / 3b', i: 'lock' }, { t: 'Verkauf (Liegenschaft, Firma, Depot)', i: 'sell' }, { t: 'Versicherungsleistung', i: 'ins' }, { t: 'Sonstiges', i: 'star' }] },
];

// ── State (v1) ───────────────────────────────────────────────────────────────
interface Ziel { id: string; katId: string; typ: string; insp: string | null; name: string; jahr: number | null; betrag: number | null; prob: string; notiz: string }
interface Wunsch { id: string; katId: string | null; name: string; jahr: number | null; betrag: number | null; notiz: string }
let ziele: Ziel[] = [];
let wuensche: Wunsch[] = [];
let editId: string | null = null, editTyp = 'ziel', curKat: string | null = null;
let curProb = 'wahrscheinlich', curInsp: string | null = null;
let curWKat: string | null = null, editWId: string | null = null;
let slJahrVal: number | null = new Date().getFullYear() + 5;
let zoomYears: 10 | 25 | 0 = 10;
let axS = 2025, axE = 2060;

const el = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
const esc = (s: unknown): string => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (n: unknown): string => { const v = parseInt(String(n ?? '').replace(/[^0-9]/g, ''), 10); return isNaN(v) ? '' : v.toLocaleString('de-CH'); };
const parseAmt = (v: unknown): number => parseInt(String(v ?? '').replace(/[^0-9]/g, ''), 10) || 0;
const NOW = new Date().getFullYear();

function getSD(): { p1name: string; p1geb: string | null; p2name: string | null; p2geb: string | null } {
  const d = BBZ.all();
  return {
    p1name: (d.p1name as string) || 'P1', p1geb: (d.p1geb as string) || null,
    p2name: (d.p2name as string) || null, p2geb: (d.p2geb as string) || null,
  };
}
function load(): void {
  const d = BBZ.all();
  ziele = Array.isArray(d.ziele) ? (d.ziele as Ziel[]) : [];
  wuensche = Array.isArray(d.wuensche) ? (d.wuensche as Wunsch[]) : [];
}
function persist(): void { BBZ.merge({ ziele, wuensche }); }
const age = (geb: string | null, yr: number): number | null => (geb ? yr - new Date(geb).getFullYear() : null);

// ── Achse + Zoom (v1 buildAxis) ──────────────────────────────────────────────
function setZoom(years: 10 | 25 | 0): void {
  zoomYears = years;
  const map: Record<string, string> = { 10: 'zoom-10', 25: 'zoom-25', 0: 'zoom-all' };
  ['zoom-10', 'zoom-25', 'zoom-all'].forEach((id) => el(id).classList.toggle('on', id === map[years]));
  renderAll();
}
function buildAxis(): void {
  const sd = getSD();
  const ys = [...ziele.filter((z) => z.jahr).map((z) => +z.jahr!), ...wuensche.filter((w) => w.jahr).map((w) => +w.jahr!)];
  let fullS = NOW, fullE = NOW + 35;
  if (ys.length) { fullS = Math.min(fullS, Math.min(...ys) - 1); fullE = Math.max(fullE, Math.max(...ys) + 3); }
  if (sd.p1geb) fullE = Math.max(fullE, new Date(sd.p1geb).getFullYear() + 70);
  if (sd.p2geb) fullE = Math.max(fullE, new Date(sd.p2geb).getFullYear() + 70);
  fullS = Math.floor(fullS / 5) * 5; fullE = Math.ceil(fullE / 5) * 5;
  let s: number, e: number, step: number;
  if (zoomYears === 10) { s = NOW; e = NOW + 2; step = 1; }
  else if (zoomYears === 25) { s = NOW; e = NOW + 5; step = 1; }
  else { s = fullS; e = fullE; step = 5; }
  axS = s; axE = e;
  const ticks = el('axisTicks');
  ticks.innerHTML = '';
  for (let y = s; y <= e; y += step) {
    const maj = zoomYears === 0 ? y % 10 === 0 : y % 5 === 0;
    const a1 = age(sd.p1geb, y), a2 = age(sd.p2geb, y);
    let ag = '';
    if (a1 !== null && a2 !== null) ag = a1 + ' / ' + a2;
    else if (a1 !== null) ag = String(a1);
    let ms = '';
    if (sd.p1geb && a1 === 65) ms += `<span class="zl-ms">${esc(sd.p1name.split(' ')[0])} 65</span>`;
    if (sd.p2geb && a2 === 65) ms += `<span class="zl-ms zl-ms2">${esc((sd.p2name || 'P2').split(' ')[0])} 65</span>`;
    const t = document.createElement('div');
    t.className = 'zl-tick';
    t.innerHTML = `${ms}<span class="zl-tickdot${maj ? ' maj' : ''}"></span><span class="zl-tickyr${maj ? ' maj' : ''}">${y}</span>${ag ? `<span class="zl-tickage">${ag}</span>` : ''}`;
    ticks.appendChild(t);
  }
}
const y2f = (y: number): number => Math.max(0, Math.min(1, (y - axS) / (axE - axS || 1)));
const f2y = (f: number): number => Math.round(axS + f * (axE - axS));

// ── Kacheln ──────────────────────────────────────────────────────────────────
function renderKacheln(): void {
  const g = el('kachelnGrid');
  g.innerHTML = KATS.map((k) => {
    const cnt = ziele.filter((z) => z.katId === k.id).length;
    return `<button class="zl-kachel${cnt ? ' active' : ''}${k.type === 'zufluss' ? ' green' : ''}" type="button" data-kat="${k.id}">
      <span class="zl-kicon">${I[k.ikon]}</span><span class="zl-klbl">${k.lbl.replace('\n', '<br>')}</span>
      <span class="zl-kbadge${cnt ? ' vis' : ''}">${cnt}</span>
    </button>`;
  }).join('');
  g.querySelectorAll<HTMLElement>('[data-kat]').forEach((b) => b.addEventListener('click', () => openItem(b.dataset.kat!)));
}

// ── Bubbles (v1 renderBubbles inkl. findY-Kollisionsvermeidung) ─────────────
const TR = [14, 32, 50, 14, 32, 50, 14];
interface Placed { frac: number; y: number; r: number }
function findY(placed: Placed[], frac: number, r: number, prefY: number): number {
  const candidates = [prefY, prefY - 20, prefY + 20, prefY - 38, prefY + 38, 10, 28, 46, 60];
  for (const y of candidates) {
    if (y < 5 || y > 72) continue;
    let ok = true;
    for (const p of placed) {
      const dx = Math.abs(p.frac - frac) * 100, dy = Math.abs(p.y - y);
      if (dx < p.r + r + 1.5 && dy < p.r + r + 2) { ok = false; break; }
    }
    if (ok) return y;
  }
  return prefY;
}
const SZ: Record<string, number> = { sicher: 96, wahrscheinlich: 74, moeglich: 54, zufluss: 74, wunsch: 54 };

function renderBubbles(): void {
  const area = el('bubblesArea');
  area.querySelectorAll('.zl-bubble').forEach((b) => b.remove());
  el('emptyHint').style.display = ziele.length || wuensche.length ? 'none' : 'block';
  const placed: Placed[] = [];
  const rPct = (px: number): number => (px / area.clientWidth) * 100 / 2;

  ziele.filter((z) => z.jahr && +z.jahr >= axS && +z.jahr <= axE).forEach((z, i) => {
    const k = KATS.find((x) => x.id === z.katId);
    if (!k) return;
    const isZ = z.typ === 'zufluss';
    const prob = isZ ? 'zufluss' : z.prob || 'wahrscheinlich';
    const frac = y2f(+z.jahr!);
    const r = rPct(SZ[prob]);
    const yp = findY(placed, frac, r, TR[i % TR.length]);
    placed.push({ frac, y: yp, r });
    const bs = z.betrag ? 'CHF ' + fmt(z.betrag) : '';
    const b = document.createElement('div');
    b.className = 'zl-bubble';
    b.dataset.id = z.id;
    b.dataset.typ = z.typ;
    b.style.cssText = `left:${Math.max(3, Math.min(97, frac * 100))}%;top:${yp}%`;
    const sn = (z.name || k.lbl.replace('\n', ' ')).substring(0, 15);
    b.innerHTML = `<span class="zl-dragyr" hidden>${z.jahr}</span><span class="zl-tip">${esc(z.name || k.lbl.replace('\n', ' '))}${bs ? ' · ' + bs : ''}</span>
      <div class="zl-circle p-${prob}${isZ ? ' is-z' : ''}" style="width:${SZ[prob]}px;height:${SZ[prob]}px"><span class="zl-bicon">${I[k.ikon]}</span><span class="zl-bname">${esc(sn)}</span></div>
      <span class="zl-stem"></span>`;
    b.querySelector('.zl-circle')!.addEventListener('pointerdown', (e) => { e.stopPropagation(); openItemEdit(z.id); });
    drag(b);
    area.appendChild(b);
  });

  wuensche.filter((w) => w.jahr && +w.jahr >= axS && +w.jahr <= axE).forEach((w, i) => {
    const k = KATS.find((x) => x.id === w.katId);
    const frac = y2f(+w.jahr!);
    const r = rPct(SZ.wunsch);
    const yp = findY(placed, frac, r, 12 + (i % 3) * 18);
    placed.push({ frac, y: yp, r });
    const bs = w.betrag ? '~CHF ' + fmt(w.betrag) : '';
    const b = document.createElement('div');
    b.className = 'zl-bubble';
    b.dataset.id = w.id;
    b.dataset.typ = 'wunsch';
    b.style.cssText = `left:${Math.max(3, Math.min(97, frac * 100))}%;top:${yp}%`;
    b.innerHTML = `<span class="zl-dragyr" hidden>${w.jahr}</span><span class="zl-tip">${esc(w.name)}${bs ? ' · ' + bs : ''}</span>
      <div class="zl-circle p-moeglich is-w" style="width:${SZ.wunsch}px;height:${SZ.wunsch}px"><span class="zl-bicon">${k ? I[k.ikon] : I.star}</span><span class="zl-bname">${esc(w.name.substring(0, 15))}</span></div>
      <span class="zl-stem"></span>`;
    b.querySelector('.zl-circle')!.addEventListener('pointerdown', (e) => { e.stopPropagation(); openWEdit(w.id); });
    drag(b);
    area.appendChild(b);
  });

  renderRightCol();
}

// Drag am Bubble-Rand (nicht Kreis) ändert das Jahr (v1 drag)
function drag(b: HTMLElement): void {
  const area = el('bubblesArea');
  b.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('.zl-circle')) return;
    e.preventDefault();
    const ar = area.getBoundingClientRect();
    const sx = e.clientX;
    const sf = parseFloat(b.style.left) / 100;
    let dragging = false;
    const tag = b.querySelector('.zl-dragyr') as HTMLElement;
    const mv = (e2: PointerEvent): void => {
      if (Math.abs(e2.clientX - sx) > 3) dragging = true;
      if (!dragging) return;
      const nf = Math.max(0, Math.min(1, sf + (e2.clientX - sx) / ar.width));
      b.style.left = nf * 100 + '%';
      tag.hidden = false;
      tag.textContent = String(f2y(nf));
      b.classList.add('dragging');
    };
    const up = (): void => {
      document.removeEventListener('pointermove', mv);
      document.removeEventListener('pointerup', up);
      b.classList.remove('dragging');
      tag.hidden = true;
      if (!dragging) return;
      const ny = f2y(parseFloat(b.style.left) / 100);
      if (b.dataset.typ === 'wunsch') { const w = wuensche.find((x) => x.id === b.dataset.id); if (w) w.jahr = ny; }
      else { const z = ziele.find((x) => x.id === b.dataset.id); if (z) z.jahr = ny; }
      persist();
      renderAll();
    };
    document.addEventListener('pointermove', mv);
    document.addEventListener('pointerup', up);
  });
}

// ── Rechte Sammelspalte (v1) ─────────────────────────────────────────────────
function makeChip(item: (Ziel | Wunsch) & { _w?: boolean }): HTMLElement {
  const k = KATS.find((x) => x.id === item.katId);
  const isZ = (item as Ziel).typ === 'zufluss', isW = !!item._w;
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'zl-ndchip' + (isZ ? ' nd-g' : isW ? ' nd-r' : '');
  chip.innerHTML = `${k ? `<span class="zl-ndicon">${I[k.ikon]}</span>` : ''}<span class="zl-ndname">${esc(item.name || k?.lbl.replace('\n', ' ') || '–')}</span>${item.jahr ? `<span class="zl-ndamt" style="opacity:.5">${item.jahr}</span>` : ''}${item.betrag ? `<span class="zl-ndamt">${isZ ? '+' : ''}CHF ${fmt(item.betrag)}</span>` : ''}`;
  chip.addEventListener('click', () => { if (isW) openWEdit(item.id); else openItemEdit(item.id); });
  return chip;
}
function fillSection(bodyId: string, items: Array<(Ziel | Wunsch) & { _w?: boolean }>): void {
  const body = el(bodyId);
  body.innerHTML = '';
  if (!items.length) body.innerHTML = '<span class="zl-rcempty">–</span>';
  else items.forEach((i) => body.appendChild(makeChip(i)));
}
function renderRightCol(): void {
  const rMittel = { s: NOW + 3, e: NOW + 5 }, rLang = { s: NOW + 6 };
  const showM = zoomYears === 10, showL = zoomYears === 10 || zoomYears === 25;
  el('rc-mittel').hidden = !showM;
  if (showM) {
    fillSection('rc-mittel-body', ziele.filter((z) => z.jahr && +z.jahr >= rMittel.s && +z.jahr <= rMittel.e));
    el('rc-mittel-hint').textContent = `${NOW + 3}–${NOW + 5}`;
  }
  el('rc-lang').hidden = !showL;
  if (showL) {
    fillSection('rc-lang-body', ziele.filter((z) => z.jahr && +z.jahr >= rLang.s));
    el('rc-lang-hint').textContent = `ab ${NOW + 6}`;
  }
  fillSection('rc-offen-body', ziele.filter((z) => !z.jahr));
}
function renderWuensche(): void {
  const items = el('wunschItems');
  items.innerHTML = '';
  if (!wuensche.length) { items.innerHTML = '<span class="zl-rcempty zl-rcempty-r">Noch keine Wünsche erfasst</span>'; return; }
  wuensche.forEach((w) => {
    const c = document.createElement('button');
    c.type = 'button';
    c.className = 'zl-wchip';
    c.innerHTML = `<span class="zl-wchiptext">${esc(w.name)}</span>${w.betrag ? `<span class="zl-wchipamt">~CHF ${fmt(w.betrag)}</span>` : ''}${w.jahr ? `<span class="zl-wchipamt">${w.jahr}</span>` : ''}`;
    c.addEventListener('click', () => openWEdit(w.id));
    items.appendChild(c);
  });
}

// ── Zeithorizont-Wahl im Ziel-Modal (v1 buildJahrSlider) ─────────────────────
function buildJahrSlider(container: HTMLElement, initVal: number | null, isGreen: boolean): void {
  const kurzYears = [NOW, NOW + 1, NOW + 2], mittelYears = [NOW + 3, NOW + 4, NOW + 5];
  const langMin = NOW + 6, langMax = NOW + 35;
  let curHorizon: string = 'offen';
  if (initVal && initVal <= NOW + 2) curHorizon = 'kurz';
  else if (initVal && initVal <= NOW + 5) curHorizon = 'mittel';
  else if (initVal && initVal > NOW + 5) curHorizon = 'lang';
  slJahrVal = initVal || null;
  const gc = isGreen ? ' green' : '';

  container.innerHTML = `<div class="zl-fg"><label>Zeithorizont</label>
    <div class="zl-horizon">
      <button class="zl-hbtn${curHorizon === 'kurz' ? ' active' : ''}" type="button" data-h="kurz" data-v1-field="horizon|kurz">Kurzfristig<span>bis ${NOW + 2}</span></button>
      <button class="zl-hbtn zl-hbtn-amber${curHorizon === 'mittel' ? ' active' : ''}" type="button" data-h="mittel" data-v1-field="horizon|mittel">Mittelfristig<span>${NOW + 3} – ${NOW + 5}</span></button>
      <button class="zl-hbtn${curHorizon === 'lang' ? ' active' : ''}" type="button" data-h="lang" data-v1-field="horizon|lang">Langfristig<span>ab ${NOW + 6}</span></button>
      <button class="zl-hbtn zl-hbtn-offen${curHorizon === 'offen' ? ' active' : ''}" type="button" data-h="offen" data-v1-field="horizon|offen">Zeitpunkt offen<span>kein Datum</span></button>
    </div></div>
    <div id="sl-detail-wrap" style="display:${curHorizon === 'offen' ? 'none' : 'flex'}"></div>`;

  function renderDetail(horizon: string, targetYear: number | null): void {
    const wrap = document.getElementById('sl-detail-wrap');
    if (!wrap) return;
    if (horizon === 'offen') { slJahrVal = null; wrap.style.display = 'none'; return; }
    wrap.style.display = 'flex';
    wrap.innerHTML = '';
    if (horizon === 'kurz' || horizon === 'mittel') {
      const years = horizon === 'kurz' ? kurzYears : mittelYears;
      slJahrVal = targetYear && years.includes(targetYear) ? targetYear : years[1];
      const tiles = document.createElement('div');
      tiles.className = 'zl-yrtiles';
      years.forEach((y) => {
        const t = document.createElement('button');
        t.type = 'button';
        t.className = 'zl-yrtile' + gc + (slJahrVal === y ? ' active' : '');
        t.textContent = String(y);
        t.addEventListener('click', () => {
          slJahrVal = y;
          tiles.querySelectorAll('.zl-yrtile').forEach((x) => x.classList.remove('active'));
          t.classList.add('active');
        });
        tiles.appendChild(t);
      });
      wrap.appendChild(tiles);
    } else {
      slJahrVal = Math.max(langMin, Math.min(langMax, targetYear || Math.floor((langMin + langMax) / 2)));
      wrap.innerHTML = `<div class="zl-slwrap"><div class="zl-sltop"><label>Zieljahr</label><span class="zl-slval${gc}" id="sl-yr-v">${slJahrVal}</span></div>
        <input type="range" id="sl-yr" data-v1-field="sl-yr" min="${langMin}" max="${langMax}" step="1" value="${slJahrVal}" aria-label="Zieljahr">
        <div class="zl-slticks"><span>${langMin}</span><span>${Math.floor((langMin + langMax) / 2)}</span><span>${langMax}</span></div></div>`;
      (document.getElementById('sl-yr') as HTMLInputElement).addEventListener('input', (e) => {
        slJahrVal = parseInt((e.target as HTMLInputElement).value, 10);
        (document.getElementById('sl-yr-v') as HTMLElement).textContent = String(slJahrVal);
      });
    }
  }
  container.querySelectorAll<HTMLElement>('.zl-hbtn').forEach((btn) =>
    btn.addEventListener('click', () => {
      curHorizon = btn.dataset.h!;
      container.querySelectorAll('.zl-hbtn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderDetail(curHorizon, null);
    }));
  renderDetail(curHorizon, slJahrVal);
}

// ── Ziel-Modal (v1) ──────────────────────────────────────────────────────────
function defaultJahrForKat(k: Kat): number | null {
  if (k.defaultJahr === 'kurz') return NOW + 1;
  if (k.defaultJahr === 'mittel') return NOW + 4;
  return null;
}
function openItem(katId: string): void {
  const k = KATS.find((x) => x.id === katId);
  if (!k) return;
  curKat = katId; editId = null; editTyp = k.type; curInsp = null; curProb = 'wahrscheinlich';
  slJahrVal = defaultJahrForKat(k);
  buildZielBody(k, null);
  el('modalZiel').hidden = false;
}
function openItemEdit(id: string): void {
  const z = ziele.find((x) => x.id === id);
  if (!z) return;
  const k = KATS.find((x) => x.id === z.katId)!;
  curKat = z.katId; editId = id; editTyp = z.typ; curInsp = z.insp; curProb = z.prob || 'wahrscheinlich';
  slJahrVal = z.jahr || NOW + 5;
  buildZielBody(k, z);
  el('modalZiel').hidden = false;
}
function buildZielBody(k: Kat, ex: Ziel | null): void {
  const isZ = k.type === 'zufluss', gc = isZ ? ' green' : '';
  el('mz-icon').className = 'zl-micon' + (isZ ? ' zl-micon-green' : '');
  el('mz-icon').innerHTML = I[k.ikon];
  el('mz-title').textContent = k.lbl.replace('\n', ' ');
  el('mz-title').className = 'zl-mtitle' + (isZ ? ' zl-green' : '');
  el('mz-sub').textContent = editId ? (isZ ? 'Erwartete Geldeingänge bearbeiten' : 'Ziel bearbeiten') : (isZ ? 'Erwartete Geldeingänge erfassen' : 'Neues Ziel erfassen');
  el('mz-del').hidden = !editId;
  const body = el('mz-body');
  body.innerHTML = `
    <div><div class="zl-fsec">${isZ ? 'Art des Zuflusses' : 'Worum geht es?'}</div><div class="zl-inspgrid" id="ig">${k.insp.map((insp) => `<button class="zl-inspchip${gc}${curInsp === insp.t ? ' active' : ''}" type="button" data-insp="${esc(insp.t)}" data-v1-field="insp|${esc(insp.t)}">${I[insp.i]}<span>${insp.t}</span></button>`).join('')}</div></div>
    <div class="zl-fg"><label>Bezeichnung</label><input type="text" class="zl-inp${gc}" id="mz-nm" data-v1-field="mz-nm" value="${esc(ex?.name || ex?.insp || '')}" placeholder="Eigene Bezeichnung..."></div>
    <div class="zl-fg" id="mz-jahr"></div>
    <div class="zl-fg"><label>Ungefährer Betrag (CHF)</label><input type="text" class="zl-inp${gc}" id="mz-bt" data-v1-field="mz-bt" value="${ex?.betrag != null ? fmt(ex.betrag) : k.defaultBetrag ? fmt(k.defaultBetrag) : ''}" placeholder="z.B. 150 000"></div>
    ${isZ ? '' : `<div class="zl-fg"><label>Eintrittswahrscheinlichkeit</label><div class="zl-prob">
      <button class="zl-pbtn${curProb === 'moeglich' ? ' active' : ''}" type="button" data-p="moeglich" data-v1-field="prob|moeglich">möglich</button>
      <button class="zl-pbtn${curProb === 'wahrscheinlich' ? ' active' : ''}" type="button" data-p="wahrscheinlich" data-v1-field="prob|wahrscheinlich">wahrscheinlich</button>
      <button class="zl-pbtn${curProb === 'sicher' ? ' active' : ''}" type="button" data-p="sicher" data-v1-field="prob|sicher">sicher</button>
    </div></div>`}
    <div class="zl-fg"><label>Notiz</label><input type="text" class="zl-inp${gc}" id="mz-nt" data-v1-field="mz-nt" value="${esc(ex?.notiz || '')}" placeholder="Weitere Angaben..."></div>`;
  buildJahrSlider(document.getElementById('mz-jahr') as HTMLElement, ex?.jahr || slJahrVal, isZ);
  // Insp-Chips: Auswahl + Name-Prefill (v1: ausser "Sonstiges")
  body.querySelectorAll<HTMLElement>('[data-insp]').forEach((c) =>
    c.addEventListener('click', () => {
      curInsp = c.dataset.insp!;
      body.querySelectorAll('.zl-inspchip').forEach((x) => x.classList.remove('active'));
      c.classList.add('active');
      const nf = document.getElementById('mz-nm') as HTMLInputElement;
      if (nf && curInsp !== 'Sonstiges') nf.value = curInsp;
    }));
  body.querySelectorAll<HTMLElement>('[data-p]').forEach((b) =>
    b.addEventListener('click', () => {
      curProb = b.dataset.p!;
      body.querySelectorAll('.zl-pbtn').forEach((x) => x.classList.toggle('active', (x as HTMLElement).dataset.p === curProb));
    }));
  // Tausender-Formatierung (v1 autoTh)
  (document.getElementById('mz-bt') as HTMLInputElement).addEventListener('input', (e) => {
    const inp = e.target as HTMLInputElement;
    const r = inp.value.replace(/[^0-9]/g, '');
    if (r) inp.value = parseInt(r, 10).toLocaleString('de-CH');
  });
}
function saveItem(): void {
  const name = ((document.getElementById('mz-nm') as HTMLInputElement)?.value || '').trim() || curInsp || '';
  const betrag = parseAmt((document.getElementById('mz-bt') as HTMLInputElement)?.value) || null;
  const notiz = ((document.getElementById('mz-nt') as HTMLInputElement)?.value || '').trim();
  if (editId) {
    const z = ziele.find((x) => x.id === editId);
    if (z) { z.name = name; z.insp = curInsp; z.jahr = slJahrVal; z.betrag = betrag; z.prob = curProb; z.notiz = notiz; }
  } else {
    ziele.push({ id: 'z_' + Date.now(), katId: curKat!, typ: editTyp, insp: curInsp, name, jahr: slJahrVal, betrag, prob: curProb, notiz });
  }
  persist();
  el('modalZiel').hidden = true;
  renderAll();
}
function deleteItem(): void {
  if (!editId) return;
  ziele = ziele.filter((z) => z.id !== editId);
  persist();
  el('modalZiel').hidden = true;
  renderAll();
}

// ── Wunsch-Modal (v1) ────────────────────────────────────────────────────────
function openWunschModal(): void {
  editWId = null; curWKat = null;
  el('mw-title').textContent = 'Wunsch erfassen';
  ['w-name', 'w-jahr', 'w-betrag', 'w-notiz'].forEach((id) => { (document.getElementById(id) as HTMLInputElement).value = ''; });
  el('mw-del').hidden = true;
  renderWKat();
  el('modalWunsch').hidden = false;
  window.setTimeout(() => document.getElementById('w-name')?.focus(), 50);
}
function openWEdit(id: string): void {
  const w = wuensche.find((x) => x.id === id);
  if (!w) return;
  editWId = id; curWKat = w.katId || null;
  el('mw-title').textContent = 'Wunsch bearbeiten';
  (document.getElementById('w-name') as HTMLInputElement).value = w.name || '';
  (document.getElementById('w-jahr') as HTMLInputElement).value = w.jahr ? String(w.jahr) : '';
  (document.getElementById('w-betrag') as HTMLInputElement).value = w.betrag ? fmt(w.betrag) : '';
  (document.getElementById('w-notiz') as HTMLInputElement).value = w.notiz || '';
  el('mw-del').hidden = false;
  renderWKat();
  el('modalWunsch').hidden = false;
}
function renderWKat(): void {
  const g = el('mw-kat');
  g.innerHTML = '';
  KATS.filter((k) => k.type !== 'zufluss').forEach((k) => {
    const c = document.createElement('button');
    c.type = 'button';
    c.className = 'zl-inspchip' + (curWKat === k.id ? ' active' : '');
    c.setAttribute('data-v1-field', 'wkat|' + k.id);
    c.innerHTML = I[k.ikon] + `<span>${k.lbl.replace('\n', ' ')}</span>`;
    c.addEventListener('click', () => {
      curWKat = k.id;
      g.querySelectorAll('.zl-inspchip').forEach((x) => x.classList.remove('active'));
      c.classList.add('active');
    });
    g.appendChild(c);
  });
}
function saveWunsch(): void {
  const name = ((document.getElementById('w-name') as HTMLInputElement).value || '').trim();
  if (!name) { document.getElementById('w-name')?.focus(); return; }
  const jahr = parseInt((document.getElementById('w-jahr') as HTMLInputElement).value, 10) || null;
  const betrag = parseAmt((document.getElementById('w-betrag') as HTMLInputElement).value) || null;
  const notiz = ((document.getElementById('w-notiz') as HTMLInputElement).value || '').trim();
  if (editWId) {
    const w = wuensche.find((x) => x.id === editWId);
    if (w) { w.name = name; w.katId = curWKat; w.jahr = jahr; w.betrag = betrag; w.notiz = notiz; }
  } else {
    wuensche.push({ id: 'w_' + Date.now(), katId: curWKat, name, jahr, betrag, notiz });
  }
  persist();
  el('modalWunsch').hidden = true;
  renderAll();
}
function deleteWunsch(): void {
  if (!editWId) return;
  wuensche = wuensche.filter((w) => w.id !== editWId);
  persist();
  el('modalWunsch').hidden = true;
  renderAll();
}

// ── Recap (v1 openRecap) ─────────────────────────────────────────────────────
function openRecap(): void {
  interface Bucket { key: string; lbl: string; sub: string; items: Array<Record<string, unknown>>; afl: number; zfl: number }
  const buckets: Bucket[] = [
    { key: 'k', lbl: 'Kurzfristig', sub: 'bis ' + (NOW + 2), items: [], afl: 0, zfl: 0 },
    { key: 'm', lbl: 'Mittelfristig', sub: NOW + 3 + ' – ' + (NOW + 5), items: [], afl: 0, zfl: 0 },
    { key: 'l', lbl: 'Langfristig', sub: 'ab ' + (NOW + 6), items: [], afl: 0, zfl: 0 },
    { key: 'n', lbl: 'Offen', sub: 'kein Datum', items: [], afl: 0, zfl: 0 },
  ];
  const bi = (jahr: number | null): number => { if (!jahr || isNaN(+jahr)) return 3; const d = +jahr - NOW; return d <= 2 ? 0 : d <= 5 ? 1 : 2; };
  ziele.forEach((z) => { const b = buckets[bi(z.jahr)]; b.items.push({ ...z, _art: z.typ === 'zufluss' ? 'zufluss' : 'ziel' }); const a = +(z.betrag ?? 0) || 0; if (z.typ === 'zufluss') b.zfl += a; else b.afl += a; });
  wuensche.forEach((w) => { const b = buckets[bi(w.jahr)]; b.items.push({ ...w, _art: 'wunsch' }); b.afl += +(w.betrag ?? 0) || 0; });
  el('recap-sub').textContent = ziele.length + wuensche.length + ' Ereignisse erfasst';
  const cols = el('recapCols');
  cols.innerHTML = '';
  const PROB_LBL: Record<string, string> = { moeglich: 'möglich', wahrscheinlich: 'wahrscheinlich', sicher: 'sicher' };
  buckets.forEach((b) => {
    const col = document.createElement('div');
    col.className = 'zl-recapcol';
    col.innerHTML = `<div class="zl-rchd zl-rchd-${b.key}"><span class="zl-rct">${b.lbl}</span><span class="zl-rcs">${b.sub}</span></div>`;
    if (!b.items.length) col.insertAdjacentHTML('beforeend', '<div class="zl-rcnone">Keine Ereignisse</div>');
    else b.items.forEach((item) => {
      const k = KATS.find((x) => x.id === item.katId);
      const isZ = item._art === 'zufluss', isW = item._art === 'wunsch';
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'zl-rcrow' + (isZ ? ' zfl' : '') + (isW ? ' wsh' : '');
      const amt = (item.betrag as number) || 0;
      row.innerHTML = `<span class="zl-rcicon${isZ ? ' g' : isW ? ' r' : ''}">${k ? I[k.ikon] : I.star}</span>
        <span class="zl-rcbody"><span class="zl-rcname">${esc((item.name as string) || (item.insp as string) || k?.lbl.replace('\n', ' ') || '–')}</span>
        <span class="zl-rcmeta">${item.jahr ? `<span>${item.jahr}</span>` : '<span style="opacity:.5">kein Datum</span>'}${!isZ && !isW && item.prob ? `<span>${PROB_LBL[item.prob as string] ?? ''}</span>` : ''}</span></span>
        ${amt ? `<span class="zl-rcamt ${isZ ? 'g' : isW ? 'r' : 'b'}">${isZ ? '+' : ''}CHF ${fmt(amt)}</span>` : ''}`;
      row.addEventListener('click', () => {
        el('modalRecap').hidden = true;
        if (isW) openWEdit(item.id as string);
        else openItemEdit(item.id as string);
      });
      col.appendChild(row);
    });
    if (b.afl || b.zfl) {
      const parts: string[] = [];
      if (b.afl) parts.push(`<span class="zl-rctotv b">CHF ${fmt(b.afl)}</span>`);
      if (b.zfl) parts.push(`<span class="zl-rctotv g">+CHF ${fmt(b.zfl)}</span>`);
      col.insertAdjacentHTML('beforeend', `<div class="zl-rctotal"><span>Total</span><span class="zl-rctotr">${parts.join('')}</span></div>`);
    }
    cols.appendChild(col);
  });
  el('modalRecap').hidden = false;
}

// ── Stand (Säule) ────────────────────────────────────────────────────────────
function renderStand(): void {
  el('stZiele').textContent = String(ziele.filter((z) => z.typ !== 'zufluss').length);
  el('stZufluss').textContent = String(ziele.filter((z) => z.typ === 'zufluss').length);
  el('stWuensche').textContent = String(wuensche.length);
}

function renderAll(): void {
  buildAxis();
  renderKacheln();
  renderBubbles();
  renderWuensche();
  renderStand();
}

function init(): void {
  mountNav(el('bbzNav'), { activeId: '06' });
  el('editToggle').addEventListener('click', () => {
    const on = document.body.classList.toggle('edit-mode');
    el('editToggle').setAttribute('aria-pressed', String(on));
  });
  el('zoom-10').addEventListener('click', () => setZoom(10));
  el('zoom-25').addEventListener('click', () => setZoom(25));
  el('zoom-all').addEventListener('click', () => setZoom(0));
  el('btnRecap').addEventListener('click', openRecap);
  el('btnWunsch').addEventListener('click', openWunschModal);
  el('mz-save').addEventListener('click', saveItem);
  el('mz-del').addEventListener('click', deleteItem);
  el('mw-save').addEventListener('click', saveWunsch);
  el('mw-del').addEventListener('click', deleteWunsch);
  document.querySelectorAll<HTMLElement>('[data-close]').forEach((b) =>
    b.addEventListener('click', () => { el(b.dataset.close!).hidden = true; }));
  ['modalZiel', 'modalWunsch', 'modalRecap'].forEach((id) =>
    el(id).addEventListener('click', (e) => { if (e.target === el(id)) el(id).hidden = true; }));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') ['modalZiel', 'modalWunsch', 'modalRecap'].forEach((id) => { el(id).hidden = true; });
  });
  window.addEventListener('resize', renderAll);
  load();
  renderAll();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
