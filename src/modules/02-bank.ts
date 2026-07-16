// ============================================================================
// 02-bank.ts — Bühnen-Modul "Wer wir sind" (Grammatik v3, Vorlage 01/Spec §4).
// Säule = Kernbotschaft (v1 hero + Mission), Bühne = Bild-Panel + 4 Pfeiler.
// Funktionsumfang = v1 (02_bank.html): DEFAULTS/PILLARS verbatim, Pfeiler-Modal
// mit editierbarem Text → bankTexts[key], heroSub → bankHeroSub. Editieren nach
// Regel 4 im edit-mode (v3-Gating, kein Funktionsverlust). Regel 6: Pfeiler-
// Farbwelt in Blau — Rot bleibt Kundeninhalt vorbehalten (v1 nutzte red/sky/violet).
// ============================================================================
import '../styles/theme.css';
import '../styles/modules/02-bank.css';
import { BBZ } from '../lib/data';
import { mountNav } from '../lib/nav';

// v1 DEFAULTS (verbatim)
const DEFAULTS: Record<string, string> = {
  tradition: 'Gegründet 1974 – über 50 Jahre Erfahrung in der persönlichen Finanzberatung. Was als lokale Sparkasse begann, ist heute eine der beständigsten Regionalbanken der Ostschweiz. Diese Verwurzelung gibt uns Stabilität und unseren Kundinnen und Kunden Vertrauen über Generationen hinweg.',
  innovation: 'Digitalste Regionalbank der Schweiz – modernste Prozesse, ohne den persönlichen Kontakt zu ersetzen. Wir investieren konsequent in digitale Infrastruktur, damit unsere Beraterinnen und Berater mehr Zeit für das haben, was wirklich zählt: echte Gespräche mit echten Menschen.',
  verantwortung: 'Ausbildungsbank: Jede zehnte Stelle ist ein Ausbildungsplatz. Wir bilden nicht nur Bankfachleute aus – wir investieren in die Region und in die nächste Generation. Soziale Verantwortung ist für uns kein Marketingbegriff, sondern gelebte Unternehmenskultur seit über zwei Jahrhunderten.',
  naehe: 'Ob persönlich vor Ort, per Video-Call oder über digitale Kanäle – unsere Beratenden sind da, wo Sie sind. Nähe bedeutet für uns nicht Distanz überbrücken, sondern echte Beziehungen pflegen: verlässlich, verständlich und auf Augenhöhe. Egal auf welchem Kanal.',
};

// v1 PILLARS: eyebrow/title verbatim; Icons in Blau-Familie (Regel 6).
interface Pillar { eyebrow: string; title: string; icon: string; modalIcon: string }
const ICON_TRADITION = '<rect x="3" y="33" width="34" height="4" rx="1.5" fill="#dce8f4"/><polygon points="1,14 20,2 39,14" fill="#dce8f4"/><polygon points="1,14 20,4 39,14 39,16 1,16" fill="#a8c4e0"/><rect x="6" y="16" width="5.5" height="16" rx="1.5" fill="#004078"/><rect x="17.25" y="16" width="5.5" height="16" rx="1.5" fill="#004078"/><rect x="28.5" y="16" width="5.5" height="16" rx="1.5" fill="#004078"/>';
const ICON_INNOVATION = '<line x1="20" y1="20" x2="6" y2="9" stroke="#a8c4e0" stroke-width="2.5"/><line x1="20" y1="20" x2="34" y2="9" stroke="#a8c4e0" stroke-width="2.5"/><line x1="20" y1="20" x2="6" y2="33" stroke="#a8c4e0" stroke-width="2.5"/><line x1="20" y1="20" x2="34" y2="33" stroke="#a8c4e0" stroke-width="2.5"/><line x1="6" y1="9" x2="34" y2="9" stroke="#6f9cc0" stroke-width="1.5" stroke-dasharray="3 2"/><line x1="6" y1="33" x2="34" y2="33" stroke="#6f9cc0" stroke-width="1.5" stroke-dasharray="3 2"/><circle cx="6" cy="9" r="4" fill="#2f6ea3"/><circle cx="34" cy="9" r="4" fill="#2f6ea3"/><circle cx="6" cy="33" r="4" fill="#2f6ea3"/><circle cx="34" cy="33" r="4" fill="#2f6ea3"/><circle cx="20" cy="20" r="6" fill="#004078"/><circle cx="18.5" cy="18.5" r="2" fill="rgba(255,255,255,0.35)"/>';
const ICON_VERANTWORTUNG = '<rect x="12" y="33" width="16" height="5" rx="2" fill="#a8c4e0"/><path d="M20 33 Q20 26 20 18" stroke="#6f9cc0" stroke-width="3" stroke-linecap="round"/><path d="M20 28 C15 24 8 18 11 9 C15.5 12.5 20 20 20 28Z" fill="#a8c4e0"/><path d="M20 24 C26 20 34 12 30 4 C25 8 20 17 20 24Z" fill="#004078"/><path d="M20 15 C22 12 25 9 24 6 C22 8 20 12 20 15Z" fill="#2f6ea3" opacity="0.7"/>';
const ICON_NAEHE = '<path d="M26 12 Q30 16 26 20" stroke="#a8c4e0" stroke-width="2" stroke-linecap="round" fill="none"/><path d="M29 9 Q35 16 29 23" stroke="#a8c4e0" stroke-width="2" stroke-linecap="round" fill="none" opacity="0.6"/><path d="M20 32 C20 32 6 22 6 14 C6 10 9 7 13 7 C15.5 7 17.5 8.5 20 11 C22.5 8.5 24.5 7 27 7 C28 7 29 7.3 29.5 7.7" stroke="#2f6ea3" stroke-width="2.5" stroke-linecap="round" fill="none"/><path d="M20 11 C22.5 8.5 24.5 7 27 7 C31 7 34 10 34 14 C34 22 20 32 20 32Z" fill="#004078"/><circle cx="28" cy="11" r="2" fill="rgba(255,255,255,0.35)"/>';
const white = (svg: string): string => svg
  .replace(/#004078|#2f6ea3/g, 'white')
  .replace(/#a8c4e0|#6f9cc0|#dce8f4/g, 'rgba(255,255,255,0.4)');
const PILLARS: Record<string, Pillar> = {
  tradition: { eyebrow: 'UNSERE GESCHICHTE', title: 'Tradition', icon: ICON_TRADITION, modalIcon: white(ICON_TRADITION) },
  innovation: { eyebrow: 'UNSERE STÄRKE', title: 'Innovation', icon: ICON_INNOVATION, modalIcon: white(ICON_INNOVATION) },
  verantwortung: { eyebrow: 'UNSER ENGAGEMENT', title: 'Verantwortung', icon: ICON_VERANTWORTUNG, modalIcon: white(ICON_VERANTWORTUNG) },
  naehe: { eyebrow: 'UNSERE VERBINDUNG', title: 'Nähe', icon: ICON_NAEHE, modalIcon: white(ICON_NAEHE) },
};

const el = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
let activeKey: string | null = null;
let editMode = false;

function textOf(key: string): string {
  const texts = BBZ.get('bankTexts') as Record<string, string> | null;
  return (texts && texts[key]) || DEFAULTS[key];
}

function renderPillars(): void {
  el('pillars').innerHTML = Object.entries(PILLARS)
    .map(([key, p], i) => `
      <button class="bk-pillar" type="button" data-key="${key}">
        <span class="bk-deco">${String(i + 1).padStart(2, '0')}</span>
        <svg class="bk-picon" viewBox="0 0 40 40" fill="none">${p.icon}</svg>
        <span class="bk-ptitle">${p.title}</span>
        <span class="bk-pcta">Mehr erfahren →</span>
      </button>`)
    .join('');
  el('pillars').querySelectorAll<HTMLElement>('[data-key]').forEach((b) =>
    b.addEventListener('click', () => openModal(b.dataset.key!)));
}

function openModal(key: string): void {
  activeKey = key;
  const p = PILLARS[key];
  el('modalEyebrow').textContent = p.eyebrow;
  el('modalTitle').textContent = p.title;
  el('modalIcon').innerHTML = p.modalIcon;
  const t = el('modalText');
  t.textContent = textOf(key);
  t.contentEditable = editMode ? 'true' : 'false';
  el('modalBg').hidden = false;
}

// v1: speichert beim Schliessen in bankTexts[key] (merge).
function closeModal(): void {
  if (activeKey) {
    const text = (el('modalText').textContent ?? '').trim();
    const texts = (BBZ.get('bankTexts') as Record<string, string> | null) ?? {};
    texts[activeKey] = text;
    BBZ.merge({ bankTexts: texts });
  }
  activeKey = null;
  el('modalBg').hidden = true;
}

function init(): void {
  mountNav(el('bbzNav'), { activeId: '02' });
  el('editToggle').addEventListener('click', () => {
    editMode = document.body.classList.toggle('edit-mode');
    el('editToggle').setAttribute('aria-pressed', String(editMode));
    el('heroSub').contentEditable = editMode ? 'true' : 'false';
    if (!el('modalBg').hidden) el('modalText').contentEditable = editMode ? 'true' : 'false';
  });

  // Bild-Fallback (v1 onerror)
  const img = el('heroImg') as HTMLImageElement;
  img.addEventListener('error', () => { img.hidden = true; el('imgFallback').hidden = false; });

  // heroSub laden + persistieren (v1 bankHeroSub)
  const sub = el('heroSub');
  const saved = BBZ.get('bankHeroSub');
  if (typeof saved === 'string' && saved.trim()) sub.textContent = saved;
  sub.addEventListener('blur', () => BBZ.merge({ bankHeroSub: (sub.textContent ?? '').trim() }));
  sub.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sub.blur(); } });

  el('modalClose').addEventListener('click', closeModal);
  el('modalBg').addEventListener('click', (e) => { if (e.target === el('modalBg')) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !el('modalBg').hidden) closeModal(); });

  renderPillars();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
