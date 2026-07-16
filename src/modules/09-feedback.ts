// ============================================================================
// 09-feedback.ts — Feedback nach Grammatik v3 (Spec §4: Slider-Zeilen im
// 01-Panel-Muster, grosse Daumen; Säule = Kontext). Funktionsumfang = v1
// (09_feedback.html): Bewertung 1–10 je Erwartung (agenda_erwartungen) mit
// Adjektiv-Skala + Farbe, Fallback-Erwartung wenn keine erfasst, Persistenz
// fb_ratings/fb_q_text_0/fb_q_text_1/fb_s1_img, editierbare Abschluss-Fragen,
// Bildtausch (Frage-Bilder session-only wie v1; Admin-Override
// bbzAdmin.modulbilder.feedback). v1-Wizard (3 Steps) → Ein-Screen nach
// abgenommener Vorlage; 7-Emoji-Reihe → grosse Daumen (Spec §4).
// Regel 6: keine roten Zustands-Farben — untere Skala neutral/slate
// (v1: #7f1d1d/#991b1b). Erwartungs-Texte = Kundeninhalt (rote Kante).
// ============================================================================
import '../styles/theme.css';
import '../styles/modules/09-feedback.css';
import { BBZ } from '../lib/data';
import { mountNav } from '../lib/nav';

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

const DEFAULT_IMGS = ['../img/feedback/feedback_b.jpg', '../img/feedback/feedback_c.jpg'];
const DEFAULT_S1_IMG = '../img/feedback/feedback_a.jpg';
let customS1Image: string | null = null;
const FALLBACK_EW = 'Wie hat das Gespräch als Ganzes für Sie funktioniert?';

const el = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

let erwartungen: string[] = [];
let ratings: number[] = [];
const customImages: Array<string | null> = [null, null];
let editMode = false;

function loadData(): void {
  const d = BBZ.all();
  if (Array.isArray(d.agenda_erwartungen) && (d.agenda_erwartungen as string[]).length) {
    erwartungen = d.agenda_erwartungen as string[];
  }
  if (Array.isArray(d.fb_ratings)) ratings = (d.fb_ratings as number[]).slice();
  if (typeof d.fb_q_text_0 === 'string' && d.fb_q_text_0) el('q-text-0').textContent = d.fb_q_text_0;
  if (typeof d.fb_q_text_1 === 'string' && d.fb_q_text_1) el('q-text-1').textContent = d.fb_q_text_1;
  if (typeof d.fb_s1_img === 'string' && d.fb_s1_img) customS1Image = d.fb_s1_img; // v1 Titelbild (config)
  if (!erwartungen.length) erwartungen = [FALLBACK_EW]; // v1 startStep2-Fallback
  if (ratings.length !== erwartungen.length) ratings = erwartungen.map(() => 7);
  // Frage-Bilder: Admin-Override (v1 modulbilder.feedback), sonst Defaults
  try {
    const admin = JSON.parse(localStorage.getItem('bbzAdmin') || 'null') as unknown;
    const mb = (!Array.isArray(admin) && (admin as { modulbilder?: { feedback?: string } } | null)?.modulbilder?.feedback) || null;
    if (mb) { customImages[0] = mb; customImages[1] = mb; }
  } catch { /* noop */ }
}

function saveData(): void {
  BBZ.merge({
    fb_ratings: ratings,
    fb_q_text_0: (el('q-text-0').textContent ?? '').trim(),
    fb_q_text_1: (el('q-text-1').textContent ?? '').trim(),
  });
}

function renderRows(): void {
  el('fbRows').innerHTML = erwartungen
    .map((e, i) => {
      const v = ratings[i] ?? 7;
      return `<div class="fb-row" data-idx="${i}">
        <div class="fb-ew"><span class="fb-ewnum">${String(i + 1).padStart(2, '0')}</span><span class="fb-ewtext">${esc(e)}</span></div>
        <div class="fb-sliderrow">
          <input type="range" class="fb-slider" min="1" max="10" value="${v}" aria-label="Bewertung ${esc(e)}">
          <div class="fb-val"><span class="fb-num" id="fb-num-${i}">${v}</span><span class="fb-adj" id="fb-adj-${i}"></span></div>
        </div>
        <div class="fb-scale"><span>Gar nicht erfüllt</span><span>Vollständig erfüllt</span></div>
      </div>`;
    })
    .join('');
  el('fbRows').querySelectorAll<HTMLInputElement>('.fb-slider').forEach((s, i) => {
    paintRow(i, ratings[i] ?? 7, s);
    s.addEventListener('input', () => {
      ratings[i] = parseInt(s.value, 10);
      paintRow(i, ratings[i], s);
      renderAvg();
      saveData(); // v1 speicherte bei "Weiter" — hier live
    });
  });
  renderAvg();
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

// Grosse Daumen: Durchschnitt aller Bewertungen (Spec §4)
function renderAvg(): void {
  const avg = ratings.reduce((s, v) => s + v, 0) / ratings.length;
  const a = ADJ[Math.min(9, Math.max(0, Math.round(avg) - 1))];
  el('fbAvg').textContent = (Math.round(avg * 10) / 10).toLocaleString('de-CH');
  el('fbAvgAdj').textContent = a.label;
  el('fbAvgAdj').style.color = a.color;
  const thumb = el('fbThumb');
  thumb.textContent = avg >= 5 ? '👍' : '👎';
  thumb.style.opacity = String(0.35 + (avg / 10) * 0.65);
  thumb.style.transform = `scale(${0.8 + (avg / 10) * 0.35}) ${avg >= 5 ? '' : 'scaleY(1)'}`;
  el('railAvg').textContent = (Math.round(avg * 10) / 10).toLocaleString('de-CH') + ' / 10';
  el('railAdj').textContent = a.label;
}

function renderQImages(): void {
  [0, 1].forEach((i) => {
    const src = customImages[i] || DEFAULT_IMGS[i];
    el('qimg-' + i).style.backgroundImage = `url('${src}')`;
  });
  el('s1img').style.backgroundImage = `url('${customS1Image || DEFAULT_S1_IMG}')`;
}

function init(): void {
  mountNav(el('bbzNav'), { activeId: '09' });
  loadData();
  renderRows();
  renderQImages();

  el('editToggle').addEventListener('click', () => {
    editMode = document.body.classList.toggle('edit-mode');
    el('editToggle').setAttribute('aria-pressed', String(editMode));
    [0, 1].forEach((i) => { el('q-text-' + i).contentEditable = editMode ? 'true' : 'false'; });
    if (!editMode) saveData(); // v1 toggleEditMode: speichert beim Verlassen
  });

  // Frage-Bilder tauschen (v1 changeImage — session-only)
  [0, 1].forEach((i) => {
    (document.getElementById('qfile-' + i) as HTMLInputElement).addEventListener('change', (ev) => {
      const file = (ev.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const r = new FileReader();
      r.onload = (e) => { customImages[i] = e.target?.result as string; renderQImages(); };
      r.readAsDataURL(file);
    });
  });

  // Titelbild tauschen (v1 changeStep1Image — persistiert fb_s1_img, config-scope)
  (document.getElementById('s1file') as HTMLInputElement).addEventListener('change', (ev) => {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = (e) => {
      customS1Image = e.target?.result as string;
      renderQImages();
      BBZ.merge({ fb_s1_img: customS1Image });
    };
    r.readAsDataURL(file);
  });

  // Fragen-Text speichern bei Blur (zusätzlich zum edit-mode-Exit)
  [0, 1].forEach((i) => el('q-text-' + i).addEventListener('blur', saveData));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
