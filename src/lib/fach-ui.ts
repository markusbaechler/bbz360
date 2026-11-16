// ============================================================================
// fach-ui.ts — gemeinsame DOM-Bausteine der Fachmodule 07d/07e/07f
// (Felder lesen, Kennzahl-Kacheln, Themenliste mit Vormerken, Rechnen im
// Worker der Pensionierung).
// ============================================================================
import grundlagen from '../../public/data/params.json';
import { BBZ } from './data';
import { mountNav } from './nav';
import type { Gesamtauswertung } from './pension/auswertung';
import { createEngine, monthOf } from './pension/engine';
import type { Engine } from './pension/engine';
import { esc, fmtIn, parseNum } from './pension/format';
import { resolveParams, nextParams } from './pension/params';
import { rechenEingaben } from './pension/themen';
import type { ParamDatei, PensState } from './pension/typen';
import type { ThemaDef } from './fach-themen';

export const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
export const feld = (id: string): HTMLInputElement => document.getElementById(id) as HTMLInputElement;

/** Navigation einhängen und Rechenkern für das laufende Jahr bereitstellen. */
export function start(activeId: string): { E: Engine; A0: number; jahr: number; daten: ParamDatei } {
  mountNav($('bbzNav'), { activeId });
  const A0 = monthOf(), jahr = Math.floor(A0 / 12);
  const daten = grundlagen as unknown as ParamDatei;
  return { E: createEngine(resolveParams(daten, jahr), A0, nextParams(daten, jahr)), A0, jahr, daten };
}

/** Namen der Personen aus den Stammdaten («Person 1» ohne Namen). */
export const personName = (i: number): string => String(BBZ.get(i === 0 ? 'p1name' : 'p2name') || '').trim() || `Person ${i + 1}`;

/** Zahl aus einem Feld: leer → 0; ungültig oder ausserhalb [0, max] → null (Feld rot, Stand bleibt). */
export function zahlAus(el: HTMLInputElement, max = 1e9, dez = false): number | null {
  const v = parseNum(el.value, dez);
  const ok = v === '' || (typeof v === 'number' && isFinite(v) && v >= 0 && v <= max);
  el.classList.toggle('bad', !ok);
  return ok ? (v === '' ? 0 : dez ? (v as number) : Math.round(v as number)) : null;
}
export const inFeld = (v: number, dez = false): string => (v > 0 ? fmtIn(v, dez) : '');

export const kpi = (l: string, v: string, s: string, st = ''): string =>
  `<div class="kpi"${st ? ` data-st="${st}"` : ''}><span class="l">${l}</span><span class="v">${v}</span><span class="s">${s}</span></div>`;

/** Session-Objekt eines Fachmoduls lesen (immer ein Objekt). */
export function lesen<T extends object>(key: string, vorgabe: T): T {
  const v = BBZ.get(key);
  return v && typeof v === 'object' && !Array.isArray(v) ? { ...vorgabe, ...(v as Partial<T>) } : { ...vorgabe };
}

/**
 * Themenliste zum Vormerken (Gesprächsführung ohne Rechnung): Haken und Notiz landen im Session-Objekt
 * `key` unter `themen` bzw. `notiz` und erscheinen im Abschluss.
 */
export function themenListe(host: HTMLElement, notizEl: HTMLTextAreaElement, key: string, defs: ThemaDef[]): void {
  const st = lesen<{ themen: Record<string, boolean>; notiz: string }>(key, { themen: {}, notiz: '' });
  const themen: Record<string, boolean> = { ...(st.themen && typeof st.themen === 'object' ? st.themen : {}) };
  host.innerHTML = defs.map((d) => `<label class="fm-thema"><input type="checkbox" data-thema="${d.id}"${themen[d.id] ? ' checked' : ''}><span><b>${esc(d.titel)}</b><small>${esc(d.text)}</small></span></label>`).join('');
  notizEl.value = typeof st.notiz === 'string' ? st.notiz : '';
  const sichern = (): void => { BBZ.set(key, { ...lesen<object>(key, {}), themen, notiz: notizEl.value.slice(0, 2000) }); };
  host.addEventListener('change', (ev) => {
    const el = ev.target as HTMLInputElement;
    if (!el.dataset.thema) return;
    if (el.checked) themen[el.dataset.thema] = true; else delete themen[el.dataset.thema];
    sichern();
  });
  notizEl.addEventListener('input', sichern);
}

/** Rechnet die Auswertung eines Stands im Worker der Pensionierung; ruft `fertig` mit dem Ergebnis bzw. null bei Fehler. */
export function rechne(S: PensState, daten: ParamDatei, A0: number, fertig: (R: Gesamtauswertung | null) => void): void {
  document.body.setAttribute('aria-busy', 'true');
  const worker = new Worker(new URL('../pension-ui/worker.ts', import.meta.url), { type: 'module' });
  const ende = (R: Gesamtauswertung | null): void => { worker.terminate(); document.body.removeAttribute('aria-busy'); fertig(R); };
  worker.onmessage = (ev: MessageEvent<{ R?: Gesamtauswertung; error?: string }>) => { if (ev.data.error) console.error(ev.data.error); ende(ev.data.R ?? null); };
  worker.onerror = (e) => { console.error(e); ende(null); };
  worker.postMessage({ id: 1, S: rechenEingaben(S), params: daten, A0, stopA: undefined, varianten: [] });
}

/** Beim Verlassen eines Betragsfelds Tausenderzeichen setzen. */
export function tausender(host: HTMLElement): void {
  host.addEventListener('focusout', (ev) => {
    const el = ev.target as HTMLInputElement;
    if (el.tagName !== 'INPUT' || el.type !== 'text' || el.dataset.frei != null || el.classList.contains('bad')) return;
    const v = parseNum(el.value, el.dataset.dez != null);
    if (typeof v === 'number' && isFinite(v)) el.value = fmtIn(el.dataset.dez != null ? v : Math.round(v), el.dataset.dez != null);
  });
}
