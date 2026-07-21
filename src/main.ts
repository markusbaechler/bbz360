// ============================================================================
// main.ts — index/Beratercockpit (Grammatik v3, Spec §4: 05-Grammatik,
// Säule = Beraterprofil, Bühne = Kunden-Karten, Primäraktion "Gespräch starten").
// Funktionsumfang = v1 (index.html): Berater-Picker (bbzAdmin-Vorrang →
// berater.json → Fallback), Beratungsdatum, Kundendaten P1/P2, Modul-Grid mit
// Toggles (bbzCockpit-State), Vertiefungs-Wahl (min. 1, activeBranches),
// Readiness, Neue Beratung (clearSession, config bleibt), Footer-Info.
// NEU (ADR-5): Session-Export/-Import als JSON in der Säule.
// ============================================================================
import './styles/theme.css';
import './styles/modules/index.css';
import { BBZ } from './lib/data';
import { beraterImageUrl } from './lib/images';
import type { Berater } from './lib/schema';

interface Mod { id: string; num: string; name: string; desc: string; file: string; toggleable: boolean }
// v1 MODULES/BRANCHES (Dateien → v2-Namen in modules/)
const MODULES: Record<'einstieg' | 'kundenbild' | 'abschluss', Mod[]> = {
  einstieg: [
    { id: 'm01', num: '01', name: 'Agenda', desc: 'Traktanden & Gesprächsziel', file: 'modules/01-agenda.html', toggleable: false },
    { id: 'm02', num: '02', name: 'bbz bank', desc: 'Tradition, Innovation, Verantwortung', file: 'modules/02-bank.html', toggleable: true },
    { id: 'm03', num: '03', name: 'Berater:in', desc: 'Person & Werdegang', file: 'modules/03-berater.html', toggleable: true },
    { id: 'm04', num: '04', name: 'Philosophie', desc: 'Werte & Beratungsansatz', file: 'modules/04-philosophie.html', toggleable: true },
  ],
  kundenbild: [
    { id: 'm05', num: '05', name: 'Finanzcockpit', desc: 'Vermögen, Einkommen, Verpflichtungen', file: 'modules/05-cockpit.html', toggleable: false },
    { id: 'm06', num: '06', name: 'Ziele & Wünsche', desc: 'Zeitachse & Lebensplanung', file: 'modules/06-ziele.html', toggleable: false },
  ],
  abschluss: [
    { id: 'm08', num: '08', name: 'Vereinbarungen', desc: 'Nächste Schritte', file: 'modules/08-vereinbarungen.html', toggleable: false },
    { id: 'm09', num: '09', name: 'Feedback', desc: 'Zufriedenheitsdialog', file: 'modules/09-feedback.html', toggleable: true },
    { id: 'm10', num: '10', name: 'Abschluss', desc: 'Ausstieg & Gesprächsbericht', file: 'modules/10-abschluss.html', toggleable: false },
  ],
};
const BRANCHES = [
  { id: 'b07a', num: '07a', name: 'Finanzieren', desc: 'Eigenheim & Tragbarkeit' },
  { id: 'b07b', num: '07b', name: 'Anlegen', desc: 'Anlegerprofil & Risiko' },
];

const COCKPIT_KEY = 'bbzCockpit'; // v1: separater Config-Key, übersteht clearSession
interface CockpitState { aktiverBerater: number; beratungsdatum: string; disabled: Record<string, boolean>; branches: string[] }
const todayISO = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const state: CockpitState = { aktiverBerater: 1, beratungsdatum: todayISO(), disabled: {}, branches: ['b07a'] };
let profiles: Berater[] = [];

const el = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
const val = (id: string): string => (document.getElementById(id) as HTMLInputElement).value.trim();
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function loadState(): void {
  try {
    const saved = JSON.parse(localStorage.getItem(COCKPIT_KEY) || '{}') as Partial<CockpitState>;
    if (saved.aktiverBerater !== undefined) state.aktiverBerater = saved.aktiverBerater;
    if (saved.beratungsdatum) state.beratungsdatum = saved.beratungsdatum;
    if (saved.disabled) state.disabled = saved.disabled;
    if (saved.branches) state.branches = saved.branches;
  } catch { /* noop */ }
}
function saveState(): void { localStorage.setItem(COCKPIT_KEY, JSON.stringify(state)); }

// ── Berater-Picker (v1: bbzAdmin → berater.json → Fallback) ─────────────────
async function loadProfiles(): Promise<void> {
  const admin = BBZ.getBeraterProfiles();
  if (admin.length) { profiles = admin; renderPicker(); return; }
  profiles = await BBZ.getAllProfiles();
  if (!profiles.length) profiles = [{ id: 1, name: 'Berater:in', titel: 'bbz bank' }];
  renderPicker();
}
const initials = (name: string): string => {
  const parts = name.split(' ').filter(Boolean);
  return parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : (name || '?').slice(0, 2).toUpperCase();
};
function renderPicker(): void {
  el('beraterPicker').innerHTML = profiles
    .map((p) => {
      // Kachel 0 = Portraet. beraterImageUrl kennt BASE und den Repo-Default;
      // ein roher foto-Pfad aus berater.json wuerde nur zufaellig aufloesen.
      // Fehlt die Repo-Datei, uebernehmen die Initialen (onerror unten).
      const k0 = (p as { kacheln?: Array<{ foto_b64?: string | null }> }).kacheln?.[0];
      const foto = beraterImageUrl(p.id, 0, k0?.foto_b64 ?? (p as { foto_b64?: string }).foto_b64);
      const avatar = `<span class="ix-binit" hidden>${esc(initials(String(p.name ?? '')))}</span><img src="${esc(foto)}" alt="">`;
      return `<button class="ix-bopt${p.id === state.aktiverBerater ? ' active' : ''}" type="button" data-id="${p.id}">
        <span class="ix-bavatar">${avatar}</span>
        <span class="ix-binfo"><span class="ix-bname">${esc(String(p.name ?? 'Berater:in'))}</span><span class="ix-btitel">${esc(String(p.titel ?? ''))}</span></span>
        <span class="ix-bcheck">${p.id === state.aktiverBerater ? '✓' : ''}</span>
      </button>`;
    })
    .join('');
  el('beraterPicker').querySelectorAll<HTMLImageElement>('.ix-bavatar img').forEach((img) =>
    img.addEventListener('error', () => {
      (img.previousElementSibling as HTMLElement | null)?.removeAttribute('hidden');
      img.remove();
    }));
  el('beraterPicker').querySelectorAll<HTMLElement>('[data-id]').forEach((b) =>
    b.addEventListener('click', () => selectBerater(Number(b.dataset.id))));
}
function selectBerater(id: number): void {
  state.aktiverBerater = id;
  saveState();
  const p = profiles.find((x) => x.id === id);
  if (p) BBZ.merge({ aktiverBerater: id, beraterName: p.name ?? '', beraterTitel: p.titel ?? '' }); // v1: Spiegel in bbzData
  renderPicker();
  updateReadiness();
}

// ── Kundendaten ──────────────────────────────────────────────────────────────
function loadKunde(): void {
  const d = BBZ.all();
  (['p1name', 'p1geb', 'p2name', 'p2geb'] as const).forEach((k) => {
    if (typeof d[k] === 'string' && d[k]) (document.getElementById(k) as HTMLInputElement).value = d[k] as string;
  });
}
function onKundeChange(): void {
  BBZ.merge({ p1name: val('p1name'), p1geb: val('p1geb'), p2name: val('p2name'), p2geb: val('p2geb') });
  updateReadiness();
}

// ── Module & Vertiefung ──────────────────────────────────────────────────────
function renderGrid(containerId: string, mods: Mod[]): void {
  el(containerId).innerHTML = mods
    .map((m) => {
      const off = state.disabled[m.id] === true;
      return `<div class="ix-mod${off ? ' off' : ''}${m.toggleable ? ' tog' : ''}" ${m.toggleable ? `data-tog="${m.id}" role="button" tabindex="0"` : ''}>
        <span class="ix-mnum">${m.num}</span>
        <span class="ix-mname">${m.name}</span>
        <span class="ix-mdesc">${m.desc}</span>
        ${m.toggleable ? `<span class="ix-mcheck">${off ? '✕' : '✓'}</span>` : ''}
      </div>`;
    })
    .join('');
  el(containerId).querySelectorAll<HTMLElement>('[data-tog]').forEach((c) => {
    const t = () => { state.disabled[c.dataset.tog!] = !state.disabled[c.dataset.tog!]; saveState(); renderAll(); };
    c.addEventListener('click', t);
    c.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); t(); } });
  });
}
function renderBranches(): void {
  el('gridVertiefung').innerHTML = BRANCHES.map((b) => {
    const on = state.branches.includes(b.id);
    return `<div class="ix-mod tog${on ? '' : ' off'}" data-branch="${b.id}" role="button" tabindex="0">
      <span class="ix-mnum">${b.num}</span><span class="ix-mname">${b.name}</span><span class="ix-mdesc">${b.desc}</span>
      <span class="ix-mcheck">${on ? '✓' : ''}</span>
    </div>`;
  }).join('');
  el('branchHint').textContent = state.branches.length === 2
    ? '⚡ Beide Vertiefungen aktiv – im Abschluss wählbar, welche gedruckt wird.'
    : 'Mindestens eine Vertiefung muss aktiv sein. Beide gleichzeitig möglich.';
  el('gridVertiefung').querySelectorAll<HTMLElement>('[data-branch]').forEach((c) => {
    const t = () => toggleBranch(c.dataset.branch!);
    c.addEventListener('click', t);
    c.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); t(); } });
  });
}
function toggleBranch(bid: string): void {
  const idx = state.branches.indexOf(bid);
  if (idx > -1) { if (state.branches.length > 1) state.branches.splice(idx, 1); }
  else state.branches.push(bid);
  saveState();
  BBZ.set('activeBranches', state.branches);
  renderBranches();
  updateReadiness();
}
function renderAll(): void {
  renderGrid('gridEinstieg', MODULES.einstieg);
  renderGrid('gridKundenbild', MODULES.kundenbild);
  renderBranches();
  renderGrid('gridAbschluss', MODULES.abschluss);
  updateReadiness();
}

// ── Readiness + Primäraktion ─────────────────────────────────────────────────
function updateReadiness(): void {
  const berater = profiles.find((p) => p.id === state.aktiverBerater);
  const missing: string[] = [];
  if (!berater) missing.push('Berater:in');
  if (!val('p1name')) missing.push('Kundenname');
  if (!val('p1geb')) missing.push('Geburtsdatum');
  const ready = missing.length === 0;
  const btn = el('btnStart') as HTMLButtonElement;
  btn.disabled = !ready;
  // Gedimmte Primäraktion nennt ihre Freischalt-Bedingung (Grammatik §1)
  btn.innerHTML = ready ? 'Gespräch starten →' : `Gespräch starten <small>→ fehlt: ${missing.join(', ')}</small>`;
  el('readinessText').textContent = ready ? 'Bereit zum Start' : 'Daten unvollständig';
  const name = BBZ.get('p1name');
  const datum = BBZ.get('beratungsdatum');
  el('footerDataInfo').textContent = typeof name === 'string' && name
    ? `Aktive Beratung: ${name} · ${typeof datum === 'string' && datum ? datum.split('-').reverse().join('.') : ''}`
    : 'Keine aktiven Beratungsdaten';
}

function startBeratung(): void {
  BBZ.set('beratungsdatum', (document.getElementById('beratungsdatum') as HTMLInputElement).value || todayISO());
  BBZ.set('activeBranches', state.branches);
  const first = MODULES.einstieg.find((m) => !state.disabled[m.id]);
  if (first) window.location.href = first.file;
}

// ── Export / Import (ADR-5) ──────────────────────────────────────────────────
function exportSession(): void {
  const blob = BBZ.exportSession();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const name = BBZ.get('p1name');
  a.download = `bbz360-session${typeof name === 'string' && name ? '-' + name.replace(/\s+/g, '_') : ''}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
async function importSession(file: File): Promise<void> {
  try {
    await BBZ.importSession(file);
    window.location.reload();
  } catch {
    el('footerDataInfo').textContent = 'Import fehlgeschlagen: ungültige Session-Datei';
  }
}

function init(): void {
  el('topbarDate').textContent = new Date().toLocaleDateString('de-CH', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  loadState();
  void loadProfiles().then(() => updateReadiness());
  loadKunde();

  const datum = document.getElementById('beratungsdatum') as HTMLInputElement;
  datum.value = (BBZ.get('beratungsdatum') as string | null) || state.beratungsdatum;
  datum.addEventListener('change', () => {
    state.beratungsdatum = datum.value;
    saveState();
    BBZ.set('beratungsdatum', datum.value);
    updateReadiness();
  });

  (['p1name', 'p1geb', 'p2name', 'p2geb']).forEach((id) =>
    (document.getElementById(id) as HTMLInputElement).addEventListener('input', onKundeChange));

  el('btnStart').addEventListener('click', startBeratung);
  el('btnExport').addEventListener('click', exportSession);
  (document.getElementById('importFile') as HTMLInputElement).addEventListener('change', (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) void importSession(f);
  });

  el('btnReset').addEventListener('click', () => { el('resetModal').hidden = false; });
  el('resetCancel').addEventListener('click', () => { el('resetModal').hidden = true; });
  el('resetModal').addEventListener('click', (e) => { if (e.target === el('resetModal')) el('resetModal').hidden = true; });
  el('resetConfirm').addEventListener('click', () => {
    BBZ.clearSession(); // Session weg, Config bleibt (v1)
    (['p1name', 'p1geb', 'p2name', 'p2geb']).forEach((id) => { (document.getElementById(id) as HTMLInputElement).value = ''; });
    el('resetModal').hidden = true;
    updateReadiness();
  });

  renderAll();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
