// ============================================================================
// images.ts — Zentrale Bild-Registry (Single Source of Truth für alle in der
// App verwendeten Bilder). Ziel: zentrale Verwaltung + Repo-Speicherung.
//
// Modell:
//  - Default = versionierte Datei unter public/img/… (im Repo, geräteübergreifend).
//  - Override = optionaler Upload, gespeichert im EINEN Store `bbzImages`
//    (localStorage, browser-lokal). resolve() gibt Override || Repo-Default.
//  - Legacy-Fallback: alte, verstreute v1/v2-Keys werden weiter GELESEN
//    (abschluss_bgImage/bbzBgImage, fb_s1_img, philosophie phases[].image),
//    aber nicht mehr geschrieben — Migration ohne Datenverlust.
//  - Berater-Bilder sind dynamisch PRO PROFIL (bbzAdmin.kacheln[].foto_b64)
//    mit Repo-Default img/berater/berater<id>{a,b,c}.jpg.
//
// GitHub Pages ist statisch: ein Upload kann nur browser-lokal landen. Ein
// hochgeladenes Bild wird über repoTarget()/downloadForRepo() dauerhaft ins
// Repo übernommen (Datei ablegen + committen → neuer Default für alle).
// ============================================================================

const BASE = import.meta.env.BASE_URL; // '/bbz360/'
const OVERRIDE_KEY = 'bbzImages';

export type ImageGroup = 'Bank' | 'Philosophie' | 'Feedback' | 'Abschluss';
export interface ImageSlot {
  id: string;
  label: string;
  group: ImageGroup;
  file: string; // relativ zu public/img/ — zugleich Repo-Zielpfad
}

// Alle statischen Bildstellen der App. Berater-Bilder: siehe beraterImageUrl().
export const IMAGE_SLOTS: ImageSlot[] = [
  { id: 'bank_hero', label: 'Bank — Titelbild', group: 'Bank', file: 'bank/bbzbank.jpg' },
  { id: 'phil_1', label: 'Philosophie 1 · Verstehen', group: 'Philosophie', file: 'philosophie/philosophie_a.jpg' },
  { id: 'phil_2', label: 'Philosophie 2 · Klarheit gewinnen', group: 'Philosophie', file: 'philosophie/philosophie_b.jpg' },
  { id: 'phil_3', label: 'Philosophie 3 · Entscheiden', group: 'Philosophie', file: 'philosophie/philosophie_c.jpg' },
  { id: 'phil_4', label: 'Philosophie 4 · Begleiten', group: 'Philosophie', file: 'philosophie/philosophie_d.jpg' },
  { id: 'fb_title', label: 'Feedback — Titelbild', group: 'Feedback', file: 'feedback/feedback_a.jpg' },
  { id: 'fb_q1', label: 'Feedback — Frage 1', group: 'Feedback', file: 'feedback/feedback_b.jpg' },
  { id: 'fb_q2', label: 'Feedback — Frage 2', group: 'Feedback', file: 'feedback/feedback_c.jpg' },
  { id: 'abschluss_bg', label: 'Abschluss — Hintergrund', group: 'Abschluss', file: 'abschluss/abschluss.jpg' },
];
const SLOT = Object.fromEntries(IMAGE_SLOTS.map((s) => [s.id, s]));

// ── Override-Store (zentral) ────────────────────────────────────────────────
type Overrides = Record<string, string>;
function loadOverrides(): Overrides {
  try {
    const raw = JSON.parse(localStorage.getItem(OVERRIDE_KEY) || '{}');
    return raw && typeof raw === 'object' ? (raw as Overrides) : {};
  } catch {
    return {};
  }
}
function saveOverrides(o: Overrides): void {
  try {
    localStorage.setItem(OVERRIDE_KEY, JSON.stringify(o));
  } catch (e) {
    console.warn('images: bbzImages write failed', e);
  }
}

export function defaultUrl(slotId: string): string {
  const s = SLOT[slotId];
  return s ? BASE + 'img/' + s.file : '';
}

// Legacy-Leseschicht: verstreute v1/v2-Override-Keys (nur lesen, nie schreiben).
function legacyOverride(slotId: string): string | null {
  const data = (): Record<string, unknown> => {
    try { return JSON.parse(localStorage.getItem('bbzData') || '{}'); } catch { return {}; }
  };
  if (slotId === 'abschluss_bg') return (data().abschluss_bgImage as string) || localStorage.getItem('bbzBgImage') || null;
  if (slotId === 'fb_title') return (data().fb_s1_img as string) || null;
  if (slotId.startsWith('phil_')) {
    try {
      const p = JSON.parse(localStorage.getItem('bbz_beratungsphilosophie_v1') || '{}');
      return p.phases?.[Number(slotId.slice(-1)) - 1]?.image || null;
    } catch { return null; }
  }
  return null;
}

// Resolve: Override (zentral) → Legacy-Override → Repo-Default.
export function imageUrl(slotId: string): string {
  return loadOverrides()[slotId] || legacyOverride(slotId) || defaultUrl(slotId);
}
export function hasOverride(slotId: string): boolean {
  return !!loadOverrides()[slotId] || !!legacyOverride(slotId);
}
export function setImageOverride(slotId: string, dataUrl: string): void {
  const o = loadOverrides();
  o[slotId] = dataUrl;
  saveOverrides(o);
}
export function resetImageOverride(slotId: string): void {
  const o = loadOverrides();
  delete o[slotId];
  saveOverrides(o);
  // Auch Legacy-Quelle räumen, damit "Zurücksetzen" wirklich den Repo-Default zeigt.
  if (slotId === 'abschluss_bg') {
    try { localStorage.removeItem('bbzBgImage'); } catch { /* noop */ }
  }
}

// Repo-Zielpfad + Download, um einen Upload dauerhaft ins Repo zu übernehmen.
export function repoTarget(slotId: string): string {
  const s = SLOT[slotId];
  return s ? 'public/img/' + s.file : '';
}
// Generischer Datei-Download (data:-URL oder Repo-Pfad) unter festem Namen.
// Einzige Download-Implementierung der App — auch Beraterfotos/berater.json
// gehen hier durch (admin.ts).
export function downloadDataUrl(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function downloadForRepo(slotId: string): void {
  const s = SLOT[slotId];
  if (!s) return;
  downloadDataUrl(imageUrl(slotId), s.file.split('/').pop() || 'bild.jpg'); // Zieldateiname wie im Repo
}

// ── Berater-Bilder (dynamisch pro Profil) ───────────────────────────────────
// foto_b64 (Admin-Upload, Override) → Repo-Datei berater<id>{a,b,c}.jpg (Default).
const BERATER_SUFFIX = ['a', 'b', 'c'];
export function beraterImageUrl(beraterId: number, kachelIdx: number, foto_b64?: string | null): string {
  return foto_b64 || BASE + `img/berater/berater${beraterId}${BERATER_SUFFIX[kachelIdx] ?? 'a'}.jpg`;
}
export function beraterRepoTarget(beraterId: number, kachelIdx: number): string {
  return `public/img/berater/berater${beraterId}${BERATER_SUFFIX[kachelIdx] ?? 'a'}.jpg`;
}

// Export/Import (ADR-5): der zentrale Override-Store als Teil der Session.
export function exportOverrides(): Overrides {
  return loadOverrides();
}
export function importOverrides(o: unknown): void {
  if (o && typeof o === 'object') saveOverrides(o as Overrides);
}
