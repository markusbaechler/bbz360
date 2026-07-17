// ============================================================================
// 03-berater.ts — Bühnen-Modul "Berater:in" (Grammatik v3, Vorlage 01/Spec §4).
// Funktionsumfang = v1 (03_berater.html): 3 Kacheln (Foto/Piktogramm/Titel/
// Rich-Text-Vorschau), Modal mit Foto-Panel + Editor (H3/Bold/Normal/Liste),
// stripInlineStyles, Persistenz beratervorstellung_<aktiverBerater>.
// Datenquellen wie v1: bbzAdmin-Profil (Vorrang, inkl. foto_b64 + Kachel-Titel)
// → sonst data/berater.json + img/berater/berater<ID><a|b|c>.jpg.
// Regel 4: Toolbar/Speichern/Editieren nur im edit-mode (v1 toggleMode).
// ============================================================================
import '../styles/theme.css';
import '../styles/modules/03-berater.css';
import { BBZ } from '../lib/data';
import { mountNav } from '../lib/nav';
import { beraterImageUrl } from '../lib/images';

interface Kachel { content: string; photo: string | null; placeholder: string; pikt: string }

// v1 kacheln/TITLES verbatim (Piktogramme weiss fuer Foto-Overlay)
const kacheln: Record<number, Kachel> = {
  1: { content: '', photo: null, placeholder: 'Rolle, Erfahrung, Qualifikationen …', pikt: '<circle cx="24" cy="17" r="8" fill="rgba(255,255,255,0.9)"/><path d="M8 40c0-8.837 7.163-16 16-16s16 7.163 16 16" stroke="rgba(255,255,255,0.9)" stroke-width="3" stroke-linecap="round"/>' },
  2: { content: '', photo: null, placeholder: 'Privates, Hobbys, Leidenschaften …', pikt: '<path d="M24 38s-16-9.6-16-20a10 10 0 0 1 16-8 10 10 0 0 1 16 8c0 10.4-16 20-16 20z" fill="rgba(255,255,255,0.9)"/>' },
  3: { content: '', photo: null, placeholder: 'Leistungsversprechen, Werte, Engagement …', pikt: '<path d="M24 6l4.5 9.1 10.1 1.5-7.3 7.1 1.7 10-9-4.7-9 4.7 1.7-10-7.3-7.1 10.1-1.5z" fill="rgba(255,255,255,0.9)"/>' },
};
const TITLES: Record<number, string> = { 1: 'Wer ich bin', 2: 'Was ich mag', 3: 'Was Sie von mir erwarten können' };

const el = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
let active: number | null = null;
let editMode = false;
let aktiverId = 1;

// v1 stripInlineStyles verbatim
function stripInlineStyles(html: string): string {
  return html
    .replace(/\s*style="[^"]*"/gi, '')
    .replace(/\s*style='[^']*'/gi, '')
    .replace(/<font[^>]*>/gi, '')
    .replace(/<\/font>/gi, '')
    .replace(/<span>([^<]*)<\/span>/gi, '$1');
}

function renderCards(): void {
  el('cards').innerHTML = [1, 2, 3]
    .map((i) => `
      <div class="br-card" data-id="${i}" role="button" tabindex="0">
        <div class="br-cimg"><div class="br-photo" id="photo-${i}"></div><div class="br-cgrad"></div><div class="br-ctitle">${TITLES[i]}</div></div>
        <div class="br-ctext">
          <div class="br-content${kacheln[i].content ? '' : ' empty'}" id="preview-${i}" data-placeholder="${kacheln[i].placeholder}"></div>
          <div class="br-chint edit-only">✎ Bearbeiten</div>
        </div>
      </div>`)
    .join('');
  [1, 2, 3].forEach(renderPreview);
  el('cards').querySelectorAll<HTMLElement>('.br-card').forEach((c) => {
    c.addEventListener('click', () => openModal(Number(c.dataset.id)));
    c.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(Number(c.dataset.id)); } });
  });
  // Fotos nach dem (Re-)Rendern wieder anhängen
  [1, 2, 3].forEach((i) => { if (kacheln[i].photo) setPhoto('photo-' + i, kacheln[i].photo!); });
}

function renderPreview(id: number): void {
  const p = document.getElementById('preview-' + id);
  if (!p) return;
  if (kacheln[id].content) { p.innerHTML = stripInlineStyles(kacheln[id].content); p.classList.remove('empty'); }
  else { p.innerHTML = ''; p.classList.add('empty'); }
}

function setPhoto(id: string, url: string): void {
  const node = document.getElementById(id);
  if (!node) return;
  node.style.backgroundImage = `url(${url})`;
  node.classList.add('loaded');
}

function loadPhotoFromUrl(id: number, url: string): void {
  const img = new Image();
  img.onload = () => { kacheln[id].photo = url; setPhoto('photo-' + id, url); };
  img.src = url;
}

function openModal(id: number): void {
  active = id;
  const k = kacheln[id];
  el('modalNr').textContent = '0' + id + ' / 03';
  el('modalTtl').textContent = TITLES[id];
  el('modalPikt').innerHTML = k.pikt;
  el('modalPiktLabel').textContent = TITLES[id];
  const mp = el('modalPhoto');
  if (k.photo) { mp.style.backgroundImage = `url(${k.photo})`; mp.classList.add('loaded'); }
  else { mp.style.backgroundImage = ''; mp.classList.remove('loaded'); }
  const editor = el('editor');
  editor.setAttribute('data-placeholder', k.placeholder);
  editor.innerHTML = k.content || '';
  editor.contentEditable = editMode ? 'true' : 'false';
  el('modalBg').hidden = false;
  if (editMode) window.setTimeout(() => editor.focus(), 80);
}

function closeModal(): void { active = null; el('modalBg').hidden = true; }

// v1 saveModal: strippt Styles, rendert Vorschau, persistiert pro Berater-ID.
function saveModal(): void {
  if (active === null) return;
  kacheln[active].content = stripInlineStyles(el('editor').innerHTML.trim());
  renderPreview(active);
  const texte: Record<number, string> = {};
  for (let i = 1; i <= 3; i++) texte[i] = kacheln[i].content;
  BBZ.merge({ ['beratervorstellung_' + aktiverId]: texte });
  closeModal();
}

function fmt(cmd: string): void {
  el('editor').focus();
  if (cmd === 'h3') document.execCommand('formatBlock', false, 'H3');
  else if (cmd === 'bold') document.execCommand('bold');
  else if (cmd === 'normal') { document.execCommand('removeFormat'); document.execCommand('formatBlock', false, 'P'); }
  else if (cmd === 'list') document.execCommand('insertUnorderedList');
}

async function init(): Promise<void> {
  mountNav(el('bbzNav'), { activeId: '03' });
  el('editToggle').addEventListener('click', () => {
    editMode = document.body.classList.toggle('edit-mode');
    el('editToggle').setAttribute('aria-pressed', String(editMode));
    if (!el('modalBg').hidden) el('editor').contentEditable = editMode ? 'true' : 'false';
  });
  el('modalClose').addEventListener('click', closeModal);
  el('modalSave').addEventListener('click', saveModal);
  el('modalBg').addEventListener('click', (e) => { if (e.target === el('modalBg')) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !el('modalBg').hidden) closeModal(); });
  el('toolbar').querySelectorAll<HTMLElement>('[data-fmt]').forEach((b) =>
    b.addEventListener('click', () => fmt(b.dataset.fmt!)));

  aktiverId = (BBZ.get('aktiverBerater') as number | null) || 1;

  // 1) bbzAdmin-Profil (Vorrang) — Name, Kachel-Titel, foto_b64, Content-Fallback
  const adminProfile = BBZ.getBeraterProfiles().find((p) => p.id === aktiverId) ?? null;
  if (adminProfile) {
    if (adminProfile.name) el('beraterName').textContent = String(adminProfile.name);
    if (adminProfile.titel) el('beraterTitel').textContent = `${adminProfile.titel} · bbz bank`;
    const ak = (adminProfile as { kacheln?: Array<{ titel?: string; foto_b64?: string; content?: string }> }).kacheln ?? [];
    [1, 2, 3].forEach((i) => {
      const k = ak[i - 1];
      if (k?.titel) TITLES[i] = k.titel;
      if (k?.foto_b64) kacheln[i].photo = k.foto_b64;
    });
    const saved = BBZ.get('beratervorstellung_' + aktiverId) as Record<number, string> | null;
    [1, 2, 3].forEach((i) => { kacheln[i].content = (saved && saved[i]) || ak[i - 1]?.content || ''; });
    renderCards();
  } else {
    // 2) Fallback: berater.json + Datei-Fotos berater<ID><a|b|c>.jpg
    const profil = await BBZ.getProfile(aktiverId);
    if (profil?.name) el('beraterName').textContent = String(profil.name);
    if (profil?.titel) el('beraterTitel').textContent = `${profil.titel} · bbz bank`;
    const saved = BBZ.get('beratervorstellung_' + aktiverId) as Record<number, string> | null;
    if (saved) [1, 2, 3].forEach((i) => { if (saved[i]) kacheln[i].content = saved[i]; });
    renderCards();
    // Repo-Default pro Berater-ID (images.ts: berater<id>{a,b,c}.jpg); onerror = kein Foto.
    [1, 2, 3].forEach((i) => loadPhotoFromUrl(i, beraterImageUrl(aktiverId, i - 1)));
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { void init(); });
else void init();
