// ============================================================================
// nav.ts — Unified Modul-Navigation als Stepper (Port von v1 bbz-nav.js).
// Nutzt Theme-Klassen (.bbz-nav / .bbz-nav-tab / .bbz-nav-num) statt vw-Inline-Styles.
// Layout-Konzept §2: nummerierte Chips 01–10, aktiver Schritt hervorgehoben,
// besuchte dezent markiert, freies Springen bleibt moeglich.
// ============================================================================

export interface NavModule {
  id: string;
  label: string;
  file: string;
  sub?: boolean;
}

// Reihenfolge = Gespraechsdramaturgie. Dateien liegen in modules/.
export const MODULES: NavModule[] = [
  { id: '01', label: 'Agenda', file: '01-agenda.html' },
  { id: '02', label: 'Bank', file: '02-bank.html' },
  { id: '03', label: 'Berater:in', file: '03-berater.html' },
  { id: '04', label: 'Philosophie', file: '04-philosophie.html' },
  { id: '05', label: 'Cockpit', file: '05-cockpit.html' },
  { id: '06', label: 'Ziele', file: '06-ziele.html' },
  { id: '07a', label: 'Finanzieren', file: '07a-finanzieren.html', sub: true },
  { id: '07b', label: 'Anlegen', file: '07b-anlegen.html', sub: true },
  { id: '08', label: 'Vereinbarungen', file: '08-vereinbarungen.html' },
  { id: '09', label: 'Feedback', file: '09-feedback.html' },
  { id: '10', label: 'Abschluss', file: '10-abschluss.html' },
];

export interface NavOptions {
  activeId: string;
  visited?: ReadonlySet<string>;
  base?: string; // Pfad-Praefix zu den Modul-Dateien (Default: '' = gleicher Ordner)
}

export function buildNav(opts: NavOptions): HTMLElement {
  const base = opts.base ?? '';
  const nav = document.createElement('nav');
  nav.className = 'bbz-nav';
  nav.setAttribute('aria-label', 'Module');

  for (const m of MODULES) {
    const a = document.createElement('a');
    a.href = base + m.file;
    const active = m.id === opts.activeId;
    a.className =
      'bbz-nav-tab' +
      (active ? ' active' : '') +
      (m.sub ? ' sub' : '') +
      (!active && opts.visited?.has(m.id) ? ' visited' : '');
    if (active) a.setAttribute('aria-current', 'step');

    const num = document.createElement('span');
    num.className = 'bbz-nav-num';
    num.textContent = m.id;
    a.appendChild(num);
    a.appendChild(document.createTextNode(m.label));
    nav.appendChild(a);
  }
  return nav;
}

// Montiert die Nav in ein vorhandenes Element (z.B. .bbz-topbar Platzhalter).
export function mountNav(target: Element, opts: NavOptions): void {
  target.replaceChildren(buildNav(opts));
}
