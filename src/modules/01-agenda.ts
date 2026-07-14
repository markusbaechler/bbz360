// ============================================================================
// 01-agenda.ts — Archetyp B (Liste mit Leben). Inline-Editieren statt Modal.
// Funktionsumfang = v1 01_agenda.html (Checkliste im Commit). Kein fit-to-canvas.
// ============================================================================
import '../styles/theme.css';
import '../styles/modules/01-agenda.css';
import Sortable from 'sortablejs';
import { BBZ } from '../lib/data';
import { mountNav } from '../lib/nav';

type Which = 'agenda' | 'expect';

const DEFAULT_AGENDA = [
  'Ihre aktuelle Gesamtsituation',
  'Veränderungen mit finanziellen Auswirkungen',
  'Ihre Ziele & Wünsche',
  'Handlungsfelder & Optimierungen',
  'Entscheidungen',
  'Nächste Schritte',
];

let agenda: string[] = DEFAULT_AGENDA.slice();
let expect: string[] = [];

const el = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const listEl = (w: Which): HTMLElement => el(w === 'agenda' ? 'trakList' : 'expList');
const dataOf = (w: Which): string[] => (w === 'agenda' ? agenda : expect);

function init(): void {
  mountNav(el('bbzNav'), { activeId: '01' });

  const toggle = el('editToggle') as HTMLButtonElement;
  toggle.addEventListener('click', () => {
    const on = document.body.classList.toggle('edit-mode');
    toggle.setAttribute('aria-pressed', String(on));
  });

  // Datum & Uhrzeit: automatisch, editierbar, NICHT persistiert (wie v1).
  const now = new Date();
  el('metaDate').textContent = now.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
  el('metaTime').textContent =
    `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} Uhr`;

  // Welcome-Prefill aus Stammdaten (nur Default, wenn kein eigener Titel).
  const savedWelcome = BBZ.get('agenda_welcome');
  if (typeof savedWelcome === 'string' && savedWelcome.trim()) {
    el('welcomeName').textContent = savedWelcome;
  } else {
    const p1 = BBZ.get('p1name');
    const p2 = BBZ.get('p2name');
    if (typeof p1 === 'string' && p1) {
      el('welcomeName').textContent =
        typeof p2 === 'string' && p2 ? `Herzlich willkommen, ${p1} & ${p2}` : `Herzlich willkommen, ${p1}`;
    }
  }

  const all = BBZ.all();
  if (Array.isArray(all.agenda_traktanden) && all.agenda_traktanden.length) {
    agenda = all.agenda_traktanden as string[];
  } else {
    BBZ.set('agenda_traktanden', agenda);
  }
  if (Array.isArray(all.agenda_erwartungen)) expect = all.agenda_erwartungen as string[];

  hydrateText('goalText', 'agenda_goal');
  hydrateText('welcomeSub', 'agenda_welcome_sub');
  hydrateText('metaDuration', 'agenda_duration');

  bindTextPersist('welcomeName', 'agenda_welcome');
  bindTextPersist('goalText', 'agenda_goal');
  bindTextPersist('welcomeSub', 'agenda_welcome_sub');
  bindTextPersist('metaDuration', 'agenda_duration');

  document.querySelectorAll<HTMLButtonElement>('.ag-add').forEach((btn) => {
    btn.addEventListener('click', () => addItem(btn.dataset.list === 'agenda' ? 'agenda' : 'expect'));
  });

  renderList('agenda');
  renderList('expect');
}

function hydrateText(id: string, key: string): void {
  const v = BBZ.get(key);
  if (typeof v === 'string' && v.trim()) el(id).textContent = v;
}

const timers: Record<string, number> = {};
function bindTextPersist(id: string, key: string): void {
  const node = el(id);
  node.addEventListener('input', () => {
    window.clearTimeout(timers[id]);
    timers[id] = window.setTimeout(() => BBZ.set(key, node.textContent ?? ''), 200);
  });
  node.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      node.blur();
    }
  });
}

function persist(): void {
  BBZ.merge({ agenda_traktanden: agenda, agenda_erwartungen: expect });
}

function renderList(w: Which): void {
  const data = dataOf(w);
  const list = listEl(w);

  if (!data.length) {
    list.innerHTML =
      w === 'agenda'
        ? '<li class="ag-empty">Noch keine Traktanden — im Bearbeiten-Modus hinzufügen.</li>'
        : '<li class="ag-empty">«Was wünschen Sie sich vom heutigen Gespräch?»</li>';
    return;
  }

  list.innerHTML = data
    .map(
      (t, i) => `
    <li class="ag-item" data-idx="${i}">
      <span class="ag-grip edit-only" aria-hidden="true">⋮⋮</span>
      ${w === 'agenda' ? `<span class="ag-num">${String(i + 1).padStart(2, '0')}</span>` : ''}
      <span class="ag-text" contenteditable="true" spellcheck="false">${esc(t)}</span>
      <button class="ag-del edit-only" type="button" title="Löschen" aria-label="Eintrag löschen">×</button>
    </li>`
    )
    .join('');

  const indexOf = (node: Element): number => Array.from(list.children).indexOf(node.closest('.ag-item') as Element);

  list.querySelectorAll<HTMLElement>('.ag-text').forEach((textEl) => {
    textEl.addEventListener('input', () => {
      const idx = indexOf(textEl);
      if (idx < 0) return;
      dataOf(w)[idx] = textEl.textContent ?? '';
      persist();
    });
    textEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        textEl.blur();
      }
    });
  });

  list.querySelectorAll<HTMLButtonElement>('.ag-del').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = indexOf(btn);
      if (idx < 0) return;
      dataOf(w).splice(idx, 1);
      persist();
      renderList(w);
    });
  });

  Sortable.create(list, {
    handle: '.ag-grip',
    animation: 120,
    ghostClass: 'sortable-ghost',
    onEnd: () => {
      const items = Array.from(list.querySelectorAll<HTMLElement>('.ag-text')).map((n) => n.textContent ?? '');
      if (w === 'agenda') agenda = items;
      else expect = items;
      persist();
      renderList(w);
    },
  });
}

function addItem(w: Which): void {
  dataOf(w).push(w === 'agenda' ? 'Neues Thema …' : 'Neue Erwartung …');
  persist();
  renderList(w);
  const inputs = listEl(w).querySelectorAll<HTMLElement>('.ag-text');
  const last = inputs[inputs.length - 1];
  if (last) {
    last.focus();
    const range = document.createRange();
    range.selectNodeContents(last);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
