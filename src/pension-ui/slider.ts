// Ruhige Schieberegler auf Touch-Geräten: Ein Regler bewegt sich nur, wenn man den Knopf anfasst und waagrecht zieht.
// Tippen auf die Schiene und senkrechtes Wischen (Scrollen der Seite) ändern den Wert nicht.
/** Laufende Berührung eines Reglers. */
interface Griff { el: HTMLInputElement; start: string; x: number; y: number; entschieden: boolean; sperre: boolean }
type ReglerEvent = Event & { reglerOk?: boolean };
const gebunden = new WeakSet<HTMLElement>();
const KNOPF = 22; // ungefähre Breite des Knopfs in px
const NAH = 30; // so nah am Knopf muss die Berührung beginnen (px)
const SCHWELLE = 8; // ab dieser Bewegung steht fest, ob gezogen oder gescrollt wird (px)

/** Mitte des Knopfs eines Reglers in Bildschirmkoordinaten. */
export function knopfX(el: HTMLInputElement) {
  const r = el.getBoundingClientRect(), min = +el.min || 0, max = +el.max || 100;
  const f = max > min ? (+el.value - min) / (max - min) : 0;
  return r.left + KNOPF / 2 + f * (r.width - KNOPF);
}

export function ruhigeRegler(root: HTMLElement) {
  if (gebunden.has(root)) return;
  gebunden.add(root);
  let g: Griff | null = null;
  const zurueck = () => {
    if (!g || g.el.value === g.start) return;
    g.el.value = g.start;
    // einmal durchlassen, damit Anzeige und Rechnung wieder zum Startwert passen
    const ev: ReglerEvent = new Event('input', { bubbles: true });
    ev.reglerOk = true;
    g.el.dispatchEvent(ev);
  };
  root.addEventListener('pointerdown', (ev) => {
    const el = ev.target as HTMLInputElement;
    if (ev.pointerType !== 'touch' || !el.matches?.('input[type=range]')) { g = null; return; }
    g = { el, start: el.value, x: ev.clientX, y: ev.clientY, entschieden: false, sperre: Math.abs(ev.clientX - knopfX(el)) > NAH };
  }, true);
  root.addEventListener('pointermove', (ev) => {
    if (!g || g.entschieden || g.sperre || ev.target !== g.el) return;
    const dx = Math.abs(ev.clientX - g.x), dy = Math.abs(ev.clientY - g.y);
    if (Math.max(dx, dy) < SCHWELLE) return;
    g.entschieden = true;
    if (dy > dx) { g.sperre = true; zurueck(); }
  }, true);
  // Der Browser übernimmt die Geste als Scrollen: Wert nicht verändern
  root.addEventListener('pointercancel', () => { if (g) { g.sperre = true; zurueck(); } }, true);
  root.addEventListener('input', (ev) => {
    if (!g || ev.target !== g.el || !g.sperre || (ev as ReglerEvent).reglerOk) return;
    g.el.value = g.start;
    ev.stopImmediatePropagation();
  }, true);
  const ende = () => { const alt = g; setTimeout(() => { if (g === alt) g = null; }, 0); };
  root.addEventListener('pointerup', ende, true);
  root.addEventListener('touchend', ende, true);
}

/** Schrittknöpfe «−» und «+» neben einem Regler: setzt den Wert und meldet ihn wie eine Eingabe. */
export function reglerSchritt(el: HTMLInputElement, d: number, { offen = false }: { offen?: boolean } = {}) {
  let v = Math.round((+el.value + d) * 1000) / 1000;
  v = Math.max(+el.min, v);
  if (v > +el.max) { if (offen) el.max = v as unknown as string; else v = +el.max; }
  if (v === +el.value) return;
  el.value = v as unknown as string;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
