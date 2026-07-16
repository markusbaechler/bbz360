// ============================================================================
// admin.ts — Administration Beraterprofile (Spec §4: nüchtern, ohne Säulen-
// Pathos). Funktionsumfang = v1 (admin.html): Profil-Liste, Stammdaten
// (Name/Titel live), 3 Porträtfotos mit Foto-Modal (Upload/Entfernen,
// FileReader→base64), Kachel-Tabs mit Titel-Input + Rich-Text-Editor
// (B/I/H/¶/•, stripStyles, autoSave), Speichern-Button + Toast.
// Persistenz: bbzAdmin als reines Array (einziger Writer, ADR/Schema-Regel);
// Spiegel beraterName/beraterTitel + berater_texte_<id> in bbzData (v1).
// ============================================================================
import './styles/theme.css';
import './styles/modules/admin.css';
import { BBZ } from './lib/data';
import type { Berater } from './lib/schema';

interface Kachel { titel: string; foto_b64: string | null; content: string }
interface Profil extends Berater { name: string; titel: string; kacheln: Kachel[] }

let profiles: Profil[] = [];
let activeId: number | null = null;
let activeKachel = 1;
let fotoModalIdx: number | null = null;

const el = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
const esc = (s: string): string => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const active = (): Profil => profiles.find((x) => x.id === activeId)!;

// v1 stripStyles verbatim
function stripStyles(html: string): string {
  return html.replace(/\s*style="[^"]*"/gi, '').replace(/\s*style='[^']*'/gi, '')
    .replace(/<font[^>]*>/gi, '').replace(/<\/font>/gi, '').replace(/<span>([^<]*)<\/span>/gi, '$1');
}
const getInitials = (name: string): string => {
  const parts = (name || '').split(' ').filter(Boolean);
  return parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : (name || '?').slice(0, 2).toUpperCase();
};

const KACHEL_TITLES = ['Wer ich bin', 'Was ich mag', 'Was Sie von mir erwarten können'];

async function loadProfiles(): Promise<void> {
  const saved = BBZ.getBeraterProfiles();
  if (saved.length) { profiles = saved as Profil[]; return; }
  const json = await BBZ.getAllProfiles();
  if (json.length) {
    profiles = json.map((p) => ({
      id: p.id,
      name: String(p.name ?? 'Vorname Nachname'),
      titel: String(p.titel ?? 'Kundenberater:in'),
      kacheln: KACHEL_TITLES.map((t, i) => ({
        titel: t, foto_b64: null,
        content: (p as { kacheln?: Array<{ content?: string }> }).kacheln?.[i]?.content || '',
      })),
    }));
    return;
  }
  profiles = [1, 2, 3, 4, 5].map((i) => ({
    id: i, name: 'Vorname Nachname', titel: 'Kundenberater:in',
    kacheln: KACHEL_TITLES.map((t) => ({ titel: t, foto_b64: null, content: '' })),
  }));
}

// v1 persist: bbzAdmin als Array + Spiegel in bbzData
function persist(): void {
  BBZ.setBeraterProfiles(profiles);
  const cur = (BBZ.get('aktiverBerater') as number | null) || 1;
  const p = profiles.find((x) => x.id === cur);
  if (p) {
    BBZ.merge({ beraterName: p.name, beraterTitel: p.titel });
    const texte: Record<number, string> = {};
    p.kacheln.forEach((k, i) => { texte[i + 1] = k.content || ''; });
    BBZ.merge({ [`berater_texte_${p.id}`]: texte });
  }
}

function renderSidebar(): void {
  el('sidebarList').innerHTML = profiles.map((p) => {
    const avatar = p.kacheln?.[0]?.foto_b64 ? `<img src="${p.kacheln[0].foto_b64}" alt="">` : esc(getInitials(p.name));
    return `<button class="ad-item${p.id === activeId ? ' active' : ''}" type="button" data-id="${p.id}">
      <span class="ad-avatar">${avatar}</span>
      <span class="ad-iinfo"><span class="ad-iname">${esc(p.name)}</span><span class="ad-ititel">${esc(p.titel)}</span></span>
    </button>`;
  }).join('');
  el('sidebarList').querySelectorAll<HTMLElement>('[data-id]').forEach((b) =>
    b.addEventListener('click', () => openProfile(Number(b.dataset.id))));
}

function openProfile(id: number): void {
  if (activeId !== null) flushEditor();
  activeId = id;
  activeKachel = 1;
  const p = active();
  el('chTitle').textContent = p.name;
  el('chSubtitle').textContent = p.titel;
  (document.getElementById('fieldName') as HTMLInputElement).value = p.name;
  (document.getElementById('fieldTitel') as HTMLInputElement).value = p.titel;
  renderSidebar();
  renderFotos();
  renderKachelTabs();
  renderKachelEditor();
}

function renderFotos(): void {
  const p = active();
  el('fotoRow').innerHTML = [0, 1, 2].map((i) => {
    const k = p.kacheln[i];
    return `<div class="ad-fotowrap">
      <button class="ad-foto${k.foto_b64 ? ' has-img' : ''}" type="button" data-foto="${i}">
        ${k.foto_b64 ? `<img src="${esc(k.foto_b64)}" alt="">` : '<span class="ad-fotohint">Hochladen</span>'}
      </button>
      <div class="ad-fotolbl">${esc(k.titel)}</div>
    </div>`;
  }).join('');
  el('fotoRow').querySelectorAll<HTMLElement>('[data-foto]').forEach((b) =>
    b.addEventListener('click', () => openFotoModal(Number(b.dataset.foto))));
}

function openFotoModal(idx: number): void {
  fotoModalIdx = idx;
  const k = active().kacheln[idx];
  el('fmTitle').textContent = `Foto — ${k.titel}`;
  const img = document.getElementById('fmImg') as HTMLImageElement;
  if (k.foto_b64) { img.src = k.foto_b64; img.hidden = false; el('fmEmpty').hidden = true; }
  else { img.hidden = true; el('fmEmpty').hidden = false; }
  (el('fmBtnRemove') as HTMLButtonElement).disabled = !k.foto_b64;
  el('fotoModalBg').hidden = false;
}
function closeFotoModal(): void { el('fotoModalBg').hidden = true; fotoModalIdx = null; }

function renderKachelTabs(): void {
  const p = active();
  el('kachelTabs').innerHTML = p.kacheln.map((k, i) =>
    `<button class="ad-tab${activeKachel === i + 1 ? ' active' : ''}" type="button" data-tab="${i + 1}">${esc(k.titel || `Kachel ${i + 1}`)}</button>`).join('');
  el('kachelTabs').querySelectorAll<HTMLElement>('[data-tab]').forEach((b) =>
    b.addEventListener('click', () => { flushEditor(); activeKachel = Number(b.dataset.tab); renderKachelTabs(); renderKachelEditor(); }));
}

function renderKachelEditor(): void {
  const k = active().kacheln[activeKachel - 1];
  el('kachelEditorWrap').innerHTML = `
    <div class="ad-titlerow"><span class="ad-lbl">Kachel-Titel</span><input type="text" class="ad-input" id="kachelTitleInput" value="${esc(k.titel)}" placeholder="Kachel-Titel"></div>
    <div class="ad-toolbar">
      <button class="ad-tb" type="button" data-cmd="bold"><b>B</b></button>
      <button class="ad-tb" type="button" data-cmd="italic"><i>I</i></button>
      <button class="ad-tb" type="button" data-cmd="h3">H</button>
      <button class="ad-tb" type="button" data-cmd="p">¶</button>
      <button class="ad-tb" type="button" data-cmd="ul">•</button>
    </div>
    <div class="ad-kacheleditor" id="kachelEditor" contenteditable="true" data-placeholder="Inhalt für «${esc(k.titel)}» …">${k.content || ''}</div>`;
  el('kachelEditorWrap').querySelectorAll<HTMLElement>('[data-cmd]').forEach((b) =>
    b.addEventListener('click', () => {
      const c = b.dataset.cmd!;
      if (c === 'h3') document.execCommand('formatBlock', false, 'h3');
      else if (c === 'p') document.execCommand('formatBlock', false, 'p');
      else if (c === 'ul') document.execCommand('insertUnorderedList');
      else document.execCommand(c);
      document.getElementById('kachelEditor')?.focus();
    }));
  (document.getElementById('kachelTitleInput') as HTMLInputElement).addEventListener('input', onKachelTitleChange);
  el('kachelEditor').addEventListener('input', autoSave);
}

function flushEditor(): void {
  if (activeId === null) return;
  const editor = document.getElementById('kachelEditor');
  const titleEl = document.getElementById('kachelTitleInput') as HTMLInputElement | null;
  if (!editor) return;
  const p = active();
  p.kacheln[activeKachel - 1].content = stripStyles(editor.innerHTML.trim());
  if (titleEl) p.kacheln[activeKachel - 1].titel = titleEl.value.trim();
}

function autoSave(): void { flushEditor(); persist(); }

function onKachelTitleChange(): void {
  const v = (document.getElementById('kachelTitleInput') as HTMLInputElement | null)?.value ?? '';
  const p = active();
  p.kacheln[activeKachel - 1].titel = v;
  const tabs = document.querySelectorAll('.ad-tab');
  if (tabs[activeKachel - 1]) tabs[activeKachel - 1].textContent = v || `Kachel ${activeKachel}`;
  renderFotos();
}

function showToast(msg: string): void {
  const t = el('toast');
  t.textContent = msg;
  t.classList.add('show');
  window.setTimeout(() => t.classList.remove('show'), 2200);
}

async function init(): Promise<void> {
  await loadProfiles();
  renderSidebar();
  if (profiles.length) openProfile(profiles[0].id);

  (document.getElementById('fieldName') as HTMLInputElement).addEventListener('input', (e) => {
    const p = active();
    p.name = (e.target as HTMLInputElement).value;
    el('chTitle').textContent = p.name;
    renderSidebar();
    persist();
  });
  (document.getElementById('fieldTitel') as HTMLInputElement).addEventListener('input', (e) => {
    const p = active();
    p.titel = (e.target as HTMLInputElement).value;
    el('chSubtitle').textContent = p.titel;
    renderSidebar();
    persist();
  });

  el('btnSave').addEventListener('click', () => { flushEditor(); persist(); renderSidebar(); showToast('Profil gespeichert'); });
  el('fmClose').addEventListener('click', closeFotoModal);
  el('fotoModalBg').addEventListener('click', (e) => { if (e.target === el('fotoModalBg')) closeFotoModal(); });
  el('fmUpload').addEventListener('click', () => (document.getElementById('fotoFileInput') as HTMLInputElement).click());
  el('fmBtnRemove').addEventListener('click', () => {
    if (fotoModalIdx === null) return;
    active().kacheln[fotoModalIdx].foto_b64 = null;
    persist(); renderFotos(); renderSidebar();
    (document.getElementById('fmImg') as HTMLImageElement).hidden = true;
    el('fmEmpty').hidden = false;
    (el('fmBtnRemove') as HTMLButtonElement).disabled = true;
    showToast('Foto entfernt');
  });
  (document.getElementById('fotoFileInput') as HTMLInputElement).addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || fotoModalIdx === null) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      active().kacheln[fotoModalIdx!].foto_b64 = ev.target?.result as string;
      persist(); renderFotos(); renderSidebar();
      const img = document.getElementById('fmImg') as HTMLImageElement;
      img.src = ev.target?.result as string;
      img.hidden = false;
      el('fmEmpty').hidden = true;
      (el('fmBtnRemove') as HTMLButtonElement).disabled = false;
      showToast('Foto gespeichert');
    };
    reader.readAsDataURL(file);
    input.value = '';
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { void init(); });
else void init();
