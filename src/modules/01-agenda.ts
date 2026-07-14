// ============================================================================
// 01-agenda.ts — Gastgeber-Modul (design/referenz-01-agenda.html, Grammatik v3).
// Logik/Datenfluss = v1 (unveraendert); Markup nach Referenz. Regel 4:
// Editieren/Werkzeuge nur in body.edit-mode (Ausnahme: "+ Erwartung ergaenzen").
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
  'Ihre Ziele und Wünsche',
  'Handlungsfelder und Optimierungen',
  'Entscheidungen',
  'Nächste Schritte',
];

let agenda: string[] = DEFAULT_AGENDA.slice();
let expect: string[] = [];
let editMode = false;

const el = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const listEl = (w: Which): HTMLElement => el(w === 'agenda' ? 'trakList' : 'expList');
const dataOf = (w: Which): string[] => (w === 'agenda' ? agenda : expect);
const RAIL_EDITABLE = ['welcomeName', 'welcomeSub', 'goalText', 'metaDuration'];

function init(): void {
  mountNav(el('bbzNav'), { activeId: '01' });

  el('editToggle').addEventListener('click', () => setEditMode(!editMode));

  // Datum & Uhrzeit (auto), Dauer editierbar
  const now = new Date();
  el('metaDate').textContent = now.toLocaleDateString('de-CH', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  el('metaTime').textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} Uhr`;

  // Welcome-Prefill
  const savedWelcome = BBZ.get('agenda_welcome');
  if (typeof savedWelcome === 'string' && savedWelcome.trim()) {
    el('welcomeName').textContent = savedWelcome;
  } else {
    const p1 = BBZ.get('p1name');
    const p2 = BBZ.get('p2name');
    if (typeof p1 === 'string' && p1) {
      el('welcomeName').textContent = typeof p2 === 'string' && p2 ? `Schön, sind Sie da,\n${p1} & ${p2}.` : `Schön, sind Sie da,\n${p1}.`;
    }
  }
  const berater = BBZ.get('beraterName');
  el('beraterFoot').textContent = typeof berater === 'string' && berater ? `Ihr Berater: ${berater} · bbz bank` : 'Ihr Berater · bbz bank';

  const all = BBZ.all();
  if (Array.isArray(all.agenda_traktanden) && all.agenda_traktanden.length) agenda = all.agenda_traktanden as string[];
  else BBZ.set('agenda_traktanden', agenda);
  if (Array.isArray(all.agenda_erwartungen)) expect = all.agenda_erwartungen as string[];

  hydrateText('goalText', 'agenda_goal');
  hydrateText('welcomeSub', 'agenda_welcome_sub');
  hydrateText('metaDuration', 'agenda_duration');

  bindTextPersist('welcomeName', 'agenda_welcome');
  bindTextPersist('goalText', 'agenda_goal');
  bindTextPersist('welcomeSub', 'agenda_welcome_sub');
  bindTextPersist('metaDuration', 'agenda_duration');

  el('trakAdd').addEventListener('click', () => addItem('agenda'));
  el('expAdd').addEventListener('click', () => addItem('expect'));

  renderList('agenda');
  renderList('expect');
}

function setEditMode(on: boolean): void {
  editMode = on;
  document.body.classList.toggle('edit-mode', on);
  el('editToggle').setAttribute('aria-pressed', String(on));
  for (const id of RAIL_EDITABLE) el(id).contentEditable = on ? 'true' : 'false';
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
    if (e.key === 'Enter') { e.preventDefault(); node.blur(); }
  });
}

function persist(): void {
  BBZ.merge({ agenda_traktanden: agenda, agenda_erwartungen: expect });
}

function renderList(w: Which): void {
  const data = dataOf(w);
  const list = listEl(w);
  const ed = editMode ? 'true' : 'false';

  if (!data.length) {
    list.innerHTML = `<div class="ag-empty">${w === 'agenda' ? 'Noch keine Traktanden.' : 'Noch keine Erwartungen erfasst.'}</div>`;
  } else if (w === 'agenda') {
    list.innerHTML = data
      .map(
        (t, i) => `<div class="ag-tr" data-idx="${i}">
          <span class="ag-grip edit-only" aria-hidden="true">⋮⋮</span>
          <span class="ag-tn">${String(i + 1).padStart(2, '0')}</span>
          <span class="ag-tt" contenteditable="${ed}" spellcheck="false">${esc(t)}</span>
          <button class="ag-del edit-only" type="button" data-act="del" title="Löschen" aria-label="Löschen">×</button>
        </div>`
      )
      .join('');
  } else {
    list.innerHTML = data
      .map(
        (t, i) => `<div class="quote" data-idx="${i}">
          <span contenteditable="${ed}" spellcheck="false">${esc(t)}</span>
          <button class="ag-del edit-only" type="button" data-act="del" title="Löschen" aria-label="Löschen">×</button>
        </div>`
      )
      .join('');
  }

  const indexOf = (node: Element): number =>
    Array.from(list.children).indexOf(node.closest('[data-idx]') as Element);

  list.querySelectorAll<HTMLElement>('.ag-tt, .quote span').forEach((textEl) => {
    textEl.addEventListener('input', () => {
      const idx = indexOf(textEl);
      if (idx < 0) return;
      dataOf(w)[idx] = textEl.textContent ?? '';
      persist();
    });
    textEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); textEl.blur(); }
    });
  });
  list.querySelectorAll<HTMLButtonElement>('[data-act="del"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = indexOf(btn);
      if (idx < 0) return;
      dataOf(w).splice(idx, 1);
      persist();
      renderList(w);
    });
  });

  if (w === 'agenda') {
    Sortable.create(list, {
      handle: '.ag-grip', animation: 120, ghostClass: 'sortable-ghost',
      onEnd: () => {
        agenda = Array.from(list.querySelectorAll<HTMLElement>('.ag-tt')).map((n) => n.textContent ?? '');
        persist();
        renderList('agenda');
      },
    });
  }
}

function addItem(w: Which): void {
  dataOf(w).push(w === 'agenda' ? 'Neues Thema …' : 'Was wünschen Sie sich?');
  persist();
  renderList(w);
  // Neuen Eintrag sofort editierbar machen + fokussieren (Erwartung: Regel-4-Ausnahme).
  const list = listEl(w);
  const spans = list.querySelectorAll<HTMLElement>(w === 'agenda' ? '.ag-tt' : '.quote span');
  const last = spans[spans.length - 1];
  if (last) {
    last.contentEditable = 'true';
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
