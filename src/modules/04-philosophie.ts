// ============================================================================
// 04-philosophie.ts — Bühnen-Modul "Beratungsphilosophie" (Grammatik v3,
// Archetyp Prozess-Flow). Funktionsumfang = v1 (04_philosophie.html):
// - 4 Phasen-Karten (Nummer, Icon, Titel, Tagline, Bild-Panel mit Upload/
//   Ersetzen/Entfernen im edit-mode) + Fluss-Pfeile
// - Karte klick → Modal: Haltungssatz (Zitat) + Nutzen, editierbar im
//   edit-mode, Speichern mit Default-Fallback (v1 saveModal verbatim)
// - moduleTitle editierbar, gespeichert beim Verlassen des edit-mode
// - Persistenz VERBATIM unter 'bbz_beratungsphilosophie_v1' (eigener Key,
//   v1-Daten bleiben lesbar); Default-Bilder aus img/philosophie/ statt
//   eingebettetem Base64 (identische Assets, ADR-4-Geist: kein Datenverlust)
// Regel 6: Phasen-Farben in Blau/Slate (v1 Phase 4 war #950e13 — Rot bleibt
// Kundeninhalt vorbehalten).
// ============================================================================
import '../styles/theme.css';
import '../styles/modules/04-philosophie.css';
import { mountNav } from '../lib/nav';
import { imageUrl, setImageOverride, resetImageOverride } from '../lib/images';

interface PhaseDef { phase: string; title: string; color: string; quote: string; benefit: string; icon: string; tagline: string }
interface PhaseState { quote: string; benefit: string; image?: string | null }

const ICONS = [
  // Ohr (Verstehen)
  '<path d="M24 8C17.4 8 12 13.4 12 20c0 4.4 2.4 8.3 6 10.4V36a3 3 0 0 0 3 3h2a3 3 0 0 0 3-3v-1.8c4.6-1.4 8-5.7 8-10.8 0-7-5.7-12-12-12z" fill="rgba(255,255,255,0.15)"/><path d="M24 8C17.4 8 12 13.4 12 20c0 4.4 2.4 8.3 6 10.4V36a3 3 0 0 0 3 3h2a3 3 0 0 0 3-3v-1.8c4.6-1.4 8-5.7 8-10.8C34 13.6 29.5 8 24 8z" stroke="white" stroke-width="2.2" fill="none"/><path d="M24 14c3.3 0 6 2.7 6 6 0 2.2-1.2 4.2-3 5.3" stroke="white" stroke-width="1.8" stroke-linecap="round" opacity="0.5"/><path d="M37 11c2.5 2.2 4 5.4 4 9" stroke="white" stroke-width="2" stroke-linecap="round" opacity="0.45"/>',
  // Lupe (Klarheit)
  '<circle cx="19" cy="19" r="12" fill="rgba(255,255,255,0.15)"/><circle cx="19" cy="19" r="12" stroke="white" stroke-width="2.2"/><line x1="28" y1="28" x2="41" y2="41" stroke="white" stroke-width="3" stroke-linecap="round"/><path d="M12 13c1.5-1.5 3.5-2.5 6-2.8" stroke="white" stroke-width="1.8" stroke-linecap="round" opacity="0.45"/>',
  // Waage (Entscheiden)
  '<path d="M6 20 Q14 30 22 20" fill="rgba(255,255,255,0.15)"/><path d="M26 20 Q34 30 42 20" fill="rgba(255,255,255,0.15)"/><line x1="24" y1="6" x2="24" y2="42" stroke="white" stroke-width="2" stroke-linecap="round"/><line x1="15" y1="42" x2="33" y2="42" stroke="white" stroke-width="2.4" stroke-linecap="round"/><circle cx="24" cy="8" r="2.5" fill="rgba(255,255,255,0.7)"/><line x1="6" y1="16" x2="42" y2="16" stroke="white" stroke-width="2" stroke-linecap="round"/><line x1="6" y1="16" x2="6" y2="20" stroke="white" stroke-width="1.6" opacity="0.6"/><line x1="22" y1="16" x2="22" y2="20" stroke="white" stroke-width="1.6" opacity="0.6"/><line x1="26" y1="16" x2="26" y2="20" stroke="white" stroke-width="1.6" opacity="0.6"/><line x1="42" y1="16" x2="42" y2="20" stroke="white" stroke-width="1.6" opacity="0.6"/><path d="M6 20 Q14 31 22 20" stroke="white" stroke-width="2" fill="none"/><path d="M26 20 Q34 29 42 20" stroke="white" stroke-width="2" fill="none"/>',
  // Zwei Figuren (Begleiten)
  '<path d="M6 42c0-5 3.6-9 8-9s8 4 8 9" fill="rgba(255,255,255,0.15)"/><path d="M26 42c0-5 3.6-9 8-9s8 4 8 9" fill="rgba(255,255,255,0.15)"/><circle cx="14" cy="13" r="5" fill="rgba(255,255,255,0.2)" stroke="white" stroke-width="2"/><circle cx="34" cy="13" r="5" fill="rgba(255,255,255,0.2)" stroke="white" stroke-width="2"/><path d="M6 42c0-5 3.6-9 8-9s8 4 8 9" stroke="white" stroke-width="2" fill="none"/><path d="M26 42c0-5 3.6-9 8-9s8 4 8 9" stroke="white" stroke-width="2" fill="none"/><path d="M19 30 Q24 26 29 30" stroke="white" stroke-width="2" fill="none" opacity="0.6"/><path d="M4 46 Q24 43 44 46" stroke="white" stroke-width="1.6" opacity="0.3"/>',
];

// v1 DEFAULTS (Texte verbatim); Farben Regel-6-konform in Blau/Slate.
const DEFAULTS: PhaseDef[] = [
  { phase: 'Phase 01', title: 'Verstehen', color: '#004078', icon: ICONS[0], tagline: 'Wir hören zu, was hinter der Agenda steht. Ihre Situation, Ihre Sorgen, Ihre Träume.', quote: '«Verstehen kommt vor Lösen.»', benefit: 'Sie erleben, dass wir zuerst zuhören – nicht sofort Produkte empfehlen. Das schafft Vertrauen und sorgt dafür, dass unsere Empfehlungen wirklich zu Ihnen passen.' },
  { phase: 'Phase 02', title: 'Klarheit gewinnen', color: '#00528a', icon: ICONS[1], tagline: 'Komplexes wird sichtbar. Wir strukturieren, was wirklich zählt.', quote: '«Klarheit ist keine Vereinfachung – sie ist das Ergebnis echter Auseinandersetzung.»', benefit: 'Komplexe Zusammenhänge werden für Sie sichtbar und verständlich. Sie wissen, wo Sie stehen – und warum.' },
  { phase: 'Phase 03', title: 'Entscheiden', color: '#2f6ea3', icon: ICONS[2], tagline: 'Optionen transparent abwägen – damit Ihre Wahl eine informierte ist.', quote: '«Wir begleiten Ihre Entscheidung – wir treffen sie nicht für Sie.»', benefit: 'Sie entscheiden informiert, mit dem guten Gefühl, alle relevanten Optionen kennen und abgewogen zu haben. Keine Überraschungen.' },
  { phase: 'Phase 04', title: 'Begleiten', color: '#475569', icon: ICONS[3], tagline: 'Entscheidungen brauchen Kontinuität. Wir bleiben an Ihrer Seite.', quote: '«Eine Entscheidung ist erst gut, wenn sie auch dauerhaft trägt.»', benefit: 'Wir sind nicht nur beim Abschluss da. Wir überprüfen regelmässig, ob Ihre Lösung noch zu Ihrer Lebenssituation passt – und passen an, wenn nötig.' },
];

const STORAGE_KEY = 'bbz_beratungsphilosophie_v1'; // v1-Key (Titel/Zitate/Nutzen)
// Bilder laufen über die zentrale Registry (Slot phil_1..4), nicht mehr über
// den Philosophie-Store. images.ts liest alte phases[].image weiter als Fallback.
const PHIL_SLOT = (i: number): string => `phil_${i + 1}`;
const DEFAULT_TITLE = 'Wir schaffen Klarheit, damit Sie sicher entscheiden können.';

const el = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
let currentPhase = 0;
let editMode = false;

interface Data { moduleTitle: string; phases: PhaseState[] }
// v1 loadData verbatim (Merge Defaults + Gespeichertes)
function loadData(): Data {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Partial<Data>;
    return {
      moduleTitle: stored.moduleTitle || DEFAULT_TITLE,
      phases: DEFAULTS.map((def, i) => ({
        quote: stored.phases?.[i]?.quote ?? def.quote,
        benefit: stored.phases?.[i]?.benefit ?? def.benefit,
        image: stored.phases?.[i]?.image ?? null,
      })),
    };
  } catch {
    return { moduleTitle: DEFAULT_TITLE, phases: DEFAULTS.map((d) => ({ quote: d.quote, benefit: d.benefit, image: null })) };
  }
}
let data = loadData();
function saveData(): void { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }

function renderFlow(): void {
  el('flow').innerHTML = DEFAULTS.map((d, i) => `
    ${i ? '<div class="ph-arrow" aria-hidden="true">→</div>' : ''}
    <div class="ph-card" id="card-${i}" data-idx="${i}" role="button" tabindex="0" style="--phc:${d.color}">
      <div class="ph-imgpanel" id="img-panel-${i}">
        <div class="ph-imgtools edit-only">
          <button class="ph-imgbtn" type="button" data-up="${i}" title="Bild ersetzen">⇪</button>
          <button class="ph-imgbtn" type="button" data-del="${i}" title="Bild entfernen">×</button>
        </div>
        <input type="file" accept="image/*" id="file-input-${i}" hidden>
      </div>
      <div class="ph-cbody">
        <div class="ph-num">${d.phase}</div>
        <svg class="ph-icon" viewBox="0 0 48 48" fill="none">${d.icon}</svg>
        <div class="ph-ctitle">${d.title}</div>
        <div class="ph-tagline">${d.tagline}</div>
      </div>
    </div>`).join('');

  el('flow').querySelectorAll<HTMLElement>('.ph-card').forEach((card) => {
    const i = Number(card.dataset.idx);
    card.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.ph-imgtools, input[type=file]')) return; // v1: Bild-Werkzeuge öffnen kein Modal
      openModal(i);
    });
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(i); } });
  });
  el('flow').querySelectorAll<HTMLElement>('[data-up]').forEach((b) =>
    b.addEventListener('click', () => (document.getElementById('file-input-' + b.dataset.up) as HTMLInputElement).click()));
  el('flow').querySelectorAll<HTMLElement>('[data-del]').forEach((b) =>
    b.addEventListener('click', () => removeImage(Number(b.dataset.del))));
  DEFAULTS.forEach((_, i) => {
    (document.getElementById('file-input-' + i) as HTMLInputElement).addEventListener('change', (e) => handleImage(e, i));
  });
  loadImages();
}

// ── Bilder (zentrale Registry; Upload = Override im Store bbzImages) ─────────
function handleImage(event: Event, index: number): void {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    setImageOverride(PHIL_SLOT(index), e.target?.result as string);
    renderImage(index, imageUrl(PHIL_SLOT(index)));
  };
  reader.readAsDataURL(file);
}
function renderImage(index: number, src: string): void {
  const panel = el('img-panel-' + index);
  let img = panel.querySelector('img');
  if (!img) { img = document.createElement('img'); panel.insertBefore(img, panel.firstChild); }
  img.src = src;
  img.alt = '';
}
function removeImage(index: number): void {
  resetImageOverride(PHIL_SLOT(index));           // zurück auf Repo-Default
  renderImage(index, imageUrl(PHIL_SLOT(index)));
}
function loadImages(): void {
  DEFAULTS.forEach((_, i) => renderImage(i, imageUrl(PHIL_SLOT(i))));
}

// ── Modal (v1 openModal/saveModal verbatim) ──────────────────────────────────
function openModal(index: number): void {
  currentPhase = index;
  const def = DEFAULTS[index];
  const stored = data.phases[index];
  el('modalBadge').textContent = def.phase;
  el('modalBadge').style.background = def.color;
  el('modalTitle').textContent = def.title;
  el('modalQuoteBlock').style.borderColor = def.color;
  el('modalQuote').textContent = stored.quote;
  el('modalBenefit').textContent = stored.benefit;
  el('modalQuote').contentEditable = editMode ? 'true' : 'false';
  el('modalBenefit').contentEditable = editMode ? 'true' : 'false';
  el('modalBg').hidden = false;
}
function closeModal(): void { el('modalBg').hidden = true; }
function saveModal(): void {
  const quote = (el('modalQuote').textContent ?? '').trim();
  const benefit = (el('modalBenefit').textContent ?? '').trim();
  data.phases[currentPhase].quote = quote || DEFAULTS[currentPhase].quote;
  data.phases[currentPhase].benefit = benefit || DEFAULTS[currentPhase].benefit;
  saveData();
  closeModal();
}

function init(): void {
  mountNav(el('bbzNav'), { activeId: '04' });
  el('moduleTitle').textContent = data.moduleTitle;
  el('editToggle').addEventListener('click', () => {
    editMode = document.body.classList.toggle('edit-mode');
    el('editToggle').setAttribute('aria-pressed', String(editMode));
    el('moduleTitle').contentEditable = editMode ? 'true' : 'false';
    if (!el('modalBg').hidden) {
      el('modalQuote').contentEditable = editMode ? 'true' : 'false';
      el('modalBenefit').contentEditable = editMode ? 'true' : 'false';
    }
    // v1: Titel speichern beim Verlassen des Edit-Modus
    if (!editMode) {
      const t = (el('moduleTitle').textContent ?? '').trim();
      if (t) { data.moduleTitle = t; saveData(); }
    }
  });
  el('modalClose').addEventListener('click', closeModal);
  el('modalCloseBtn').addEventListener('click', closeModal);
  el('modalSave').addEventListener('click', saveModal);
  el('modalBg').addEventListener('click', (e) => { if (e.target === el('modalBg')) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !el('modalBg').hidden) closeModal(); });
  renderFlow();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
