// ============================================================================
// 09-feedback.ts — Feedback nach Grammatik v3, ZWEI PHASEN (Spec §1: genau EIN
// Arbeitsfokus je Buehne; Wizard-Muster wie 07b/08):
//   Phase 1 "Erwartungsabgleich"      — Slider-Zeilen je Erwartung
//                                       (agenda_erwartungen) + grosse Daumen,
//                                       rechts das Feedback-Titelbild.
//   Phase 2 "Zwei Fragen zum Schluss" — die beiden Gespraechsimpulse allein
//                                       im Fokus-Container (--stage-focus).
// Funktionsumfang = v1 (09_feedback.html): Bewertung 1–10 je Erwartung mit
// Adjektiv-Skala + Farbe, Fallback-Erwartung wenn keine erfasst, Persistenz
// fb_ratings/fb_q_text_0/fb_q_text_1/fb_s1_img, editierbare Abschluss-Fragen,
// Bildtausch ueber die zentrale Registry. Neu: fb_phase (Session-Scope).
// Regel 6: keine roten Zustands-Farben — untere Skala neutral/slate
// (v1: #7f1d1d/#991b1b). Erwartungs-Texte = Kundeninhalt (rote Kante).
// ============================================================================
import '../styles/theme.css';
import '../styles/modules/09-feedback.css';
import { BBZ } from '../lib/data';
import { mountNav } from '../lib/nav';
import { imageUrl, setImageOverride } from '../lib/images';

// v1 ADJ (Labels verbatim; 1–2 neutral statt rot, Regel 6)
const ADJ: Array<{ label: string; color: string }> = [
  { label: 'Enttäuschend', color: '#3d4c5c' },
  { label: 'Schwierig', color: '#475569' },
  { label: 'Ausbaufähig', color: '#b45309' },
  { label: 'Okay', color: '#78716c' },
  { label: 'Solide', color: '#475569' },
  { label: 'Gut', color: '#004078' },
  { label: 'Sehr gut', color: '#004078' },
  { label: 'Sehr gut', color: '#004078' },
  { label: 'Hervorragend', color: '#2e6b45' },
  { label: 'Ausgezeichnet', color: '#2e6b45' },
];

// Bilder (Titelbild + 2 Frage-Bilder) laufen über die zentrale Registry.
const FB_SLOT = ['fb_title', 'fb_q1', 'fb_q2'];   // s1img, qimg-0, qimg-1
const FALLBACK_EW = 'Wie hat das Gespräch als Ganzes für Sie funktioniert?';
const PHASE_LABELS = ['Erwartungsabgleich', 'Zwei Fragen zum Schluss'];
const Q_DEFAULT = [
  'Was hat Sie in diesem Gespräch am meisten überrascht?',
  'Was geben Sie mir mit auf den Weg?',
];
const Q_SUB = [
  'Ihr erster Gedanke zählt. Nehmen Sie sich einen Moment.',
  'Ihr Feedback ist ein Geschenk – ich nehme es mit in jede künftige Begegnung.',
];

const el = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

let phase = 1;
let erwartungen: string[] = [];
let ratings: number[] = [];
let qText: string[] = Q_DEFAULT.slice();
let editMode = false;

function loadData(): void {
  const d = BBZ.all();
  if (Array.isArray(d.agenda_erwartungen) && (d.agenda_erwartungen as string[]).length) {
    erwartungen = d.agenda_erwartungen as string[];
  }
  if (Array.isArray(d.fb_ratings)) ratings = (d.fb_ratings as number[]).slice();
  if (typeof d.fb_q_text_0 === 'string' && d.fb_q_text_0) qText[0] = d.fb_q_text_0;
  if (typeof d.fb_q_text_1 === 'string' && d.fb_q_text_1) qText[1] = d.fb_q_text_1;
  if (d.fb_phase === 2) phase = 2;
  if (!erwartungen.length) erwartungen = [FALLBACK_EW]; // v1 startStep2-Fallback
  if (ratings.length !== erwartungen.length) ratings = erwartungen.map(() => 7);
  // Bilder: zentrale Registry (Override || Repo-Default); images.ts liest
  // Legacy fb_s1_img weiter. modulbilder.feedback (selten) → nicht mehr genutzt.
}

function saveData(): void {
  BBZ.merge({ fb_ratings: ratings, fb_q_text_0: qText[0], fb_q_text_1: qText[1], fb_phase: phase });
}

// ── Säule ───────────────────────────────────────────────────────────────────
function renderRail(): void {
  el('railSub').textContent = phase === 1
    ? 'Sie haben zu Beginn etwas von sich geteilt. Jetzt ist der Moment, ehrlich Bilanz zu ziehen.'
    : 'Zum Schluss zwei Fragen, die uns beiden etwas mitgeben.';
  el('railPhases').innerHTML = PHASE_LABELS.map((label, i) => {
    const p = i + 1;
    const cls = p < phase ? 'done' : p === phase ? 'active' : 'next';
    const mark = p < phase ? '✓' : String(p);
    return `<div class="rail-phase ${cls}"${p < phase ? ` data-goto="${p}"` : ''}><span class="pc">${mark}</span><span>${esc(label)}</span></div>`;
  }).join('');
  el('railPhases').querySelectorAll<HTMLElement>('[data-goto]').forEach((b) =>
    b.addEventListener('click', () => setPhase(Number(b.dataset.goto))));
}

// ── Phase 1: Erwartungsabgleich ─────────────────────────────────────────────
function renderPhase1(): void {
  el('work').innerHTML = `<div class="fb-cols">
    <section class="panel fb-panel">
      <div class="panel-kicker">IHRE ERWARTUNGEN ZU BEGINN · BILANZ</div>
      <div class="bbz-scroll fb-rows" id="fbRows">${erwartungen.map(rowHtml).join('')}</div>
    </section>
    <div class="fb-side">
      <section class="panel fb-thumbpanel">
        <div class="fb-thumb" id="fbThumb">👍</div>
        <div class="fb-avg"><span id="fbAvg">–</span><small> von 10</small></div>
        <div class="fb-avgadj" id="fbAvgAdj">–</div>
      </section>
      <section class="panel fb-titlepanel" id="s1img">
        <label class="fb-imgbtn edit-only" for="s1file">⇪ Bild</label>
        <input type="file" id="s1file" accept="image/*" hidden>
      </section>
    </div>
  </div>`;

  el('fbRows').querySelectorAll<HTMLInputElement>('.fb-slider').forEach((s, i) => {
    paintRow(i, ratings[i] ?? 7, s);
    s.addEventListener('input', () => {
      ratings[i] = parseInt(s.value, 10);
      paintRow(i, ratings[i], s);
      renderAvg();
      saveData(); // v1 speicherte bei "Weiter" — hier live
    });
  });
  el('s1img').style.backgroundImage = `url('${imageUrl('fb_title')}')`;
  wireUpload('s1file', 'fb_title');
}

function rowHtml(e: string, i: number): string {
  const v = ratings[i] ?? 7;
  return `<div class="fb-row" data-idx="${i}">
    <div class="fb-ew"><span class="fb-ewnum">${String(i + 1).padStart(2, '0')}</span><span class="fb-ewtext">${esc(e)}</span></div>
    <div class="fb-sliderrow">
      <input type="range" class="fb-slider" min="1" max="10" value="${v}" aria-label="Bewertung ${esc(e)}">
      <div class="fb-val"><span class="fb-num" id="fb-num-${i}">${v}</span><span class="fb-adj" id="fb-adj-${i}"></span></div>
    </div>
    <div class="fb-scale"><span>Gar nicht erfüllt</span><span>Vollständig erfüllt</span></div>
  </div>`;
}

function paintRow(i: number, val: number, slider: HTMLInputElement): void {
  const a = ADJ[val - 1];
  const num = document.getElementById('fb-num-' + i) as HTMLElement;
  const adj = document.getElementById('fb-adj-' + i) as HTMLElement;
  num.textContent = String(val);
  num.style.color = a.color;
  adj.textContent = a.label;
  adj.style.color = a.color;
  const pct = ((val - 1) / 9) * 100;
  slider.style.background = `linear-gradient(to right, ${a.color} ${pct}%, var(--line) ${pct}%)`;
  slider.style.setProperty('--thumbc', a.color);
}

// Grosse Daumen: Durchschnitt aller Bewertungen (Spec §4). Säule immer,
// Daumen-Panel nur in Phase 1.
function renderAvg(): void {
  const avg = ratings.reduce((s, v) => s + v, 0) / ratings.length;
  const a = ADJ[Math.min(9, Math.max(0, Math.round(avg) - 1))];
  const txt = (Math.round(avg * 10) / 10).toLocaleString('de-CH');
  const thumb = document.getElementById('fbThumb');
  if (thumb) {
    el('fbAvg').textContent = txt;
    el('fbAvgAdj').textContent = a.label;
    el('fbAvgAdj').style.color = a.color;
    thumb.textContent = avg >= 5 ? '👍' : '👎';
    thumb.style.opacity = String(0.35 + (avg / 10) * 0.65);
    thumb.style.transform = `scale(${0.8 + (avg / 10) * 0.35})`;
  }
  el('railAvg').textContent = txt + ' / 10';
  el('railAdj').textContent = a.label;
}

// ── Phase 2: Zwei Fragen zum Schluss ────────────────────────────────────────
function renderPhase2(): void {
  el('work').innerHTML = `<section class="panel fb-qpanel">
    <div class="panel-kicker">ZWEI FRAGEN ZUM SCHLUSS</div>
    ${[0, 1].map((i) => `<div class="fb-q" id="q-${i}">
      <div class="fb-qimg" id="qimg-${i}"><label class="fb-imgbtn edit-only" for="qfile-${i}">⇪ Bild</label><input type="file" id="qfile-${i}" accept="image/*" hidden></div>
      <div>
        <div class="fb-qnum">Frage ${i + 1} von 2</div>
        <div class="fb-qtext" id="q-text-${i}" contenteditable="${editMode}" spellcheck="false">${esc(qText[i])}</div>
        <div class="fb-qsub">${esc(Q_SUB[i])}</div>
      </div>
    </div>`).join('')}
  </section>`;

  [0, 1].forEach((i) => {
    el('qimg-' + i).style.backgroundImage = `url('${imageUrl(FB_SLOT[i + 1])}')`;
    wireUpload('qfile-' + i, FB_SLOT[i + 1]);
    el('q-text-' + i).addEventListener('blur', () => {
      qText[i] = (el('q-text-' + i).textContent ?? '').trim();
      saveData();
    });
  });
}

// Bilder tauschen → zentraler Override-Store.
function wireUpload(inputId: string, slot: string): void {
  (document.getElementById(inputId) as HTMLInputElement).addEventListener('change', (ev) => {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = (e) => { setImageOverride(slot, e.target?.result as string); render(); };
    r.readAsDataURL(file);
  });
}

// ── Aktionsleiste ───────────────────────────────────────────────────────────
function renderBar(): void {
  el('work').classList.toggle('bbz-work--focus', phase === 2);
  const right = phase === 1
    ? '<button class="btn" id="btnFwd" type="button">Weiter: Zwei Fragen zum Schluss →</button>'
    : '<span class="fb-back" id="btnBack">← Zurück</span><a class="btn" href="10-abschluss.html">Weiter: Abschluss →</a>';
  el('barIn').innerHTML = `<span class="bar-pos">Phase ${phase} von 2 · ${PHASE_LABELS[phase - 1]}</span><span class="fb-bar-right">${right}</span>`;
  el('barIn').querySelector('#btnFwd')?.addEventListener('click', () => setPhase(2));
  el('barIn').querySelector('#btnBack')?.addEventListener('click', () => setPhase(1));
}

function setPhase(p: number): void {
  if (p === phase) return;
  phase = p;
  saveData();
  render();
}

function render(): void {
  renderRail();
  renderBar();
  if (phase === 1) renderPhase1();
  else renderPhase2();
  renderAvg(); // Säulen-Gesamteindruck in beiden Phasen, Daumen nur in Phase 1
}

function init(): void {
  mountNav(el('bbzNav'), { activeId: '09' });
  loadData();
  render();

  el('editToggle').addEventListener('click', () => {
    editMode = document.body.classList.toggle('edit-mode');
    el('editToggle').setAttribute('aria-pressed', String(editMode));
    [0, 1].forEach((i) => {
      const node = document.getElementById('q-text-' + i);
      if (node) node.contentEditable = editMode ? 'true' : 'false';
    });
    if (!editMode) {
      [0, 1].forEach((i) => {
        const node = document.getElementById('q-text-' + i);
        if (node) qText[i] = (node.textContent ?? '').trim();
      });
      saveData(); // v1 toggleEditMode: speichert beim Verlassen
    }
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
