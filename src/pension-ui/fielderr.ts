// Rückmeldung zu ungültigen Eingaben: Das Feld wird markiert, der Grund steht direkt darunter und wird vorgelesen.
// Der zuletzt gültige Wert bleibt gespeichert; die Meldung sagt das ausdrücklich.
import { parseNum } from '../lib/pension/format';
import { rangeError } from '../lib/pension/state';
import type { NumLeer } from '../lib/pension/typen';

/** Ergebnis von readNum: gültiger Wert (Zahl oder '' für leer) oder der Grund der Ablehnung. */
export type NumGelesen = { ok: true; v: NumLeer; msg?: undefined } | { ok: false; msg: string; v?: undefined };

/**
 * Liest ein Zahlenfeld. Rückgabe { ok, v } mit v = Zahl oder '' (leer), sonst { ok: false, msg }.
 * key: Feldname für den Wertebereich; scope 'w' für Wünsche.
 */
export function readNum(el: HTMLInputElement, key: string, scope?: string | null): NumGelesen {
  const v = parseNum(el.value, !!el.dataset.dec);
  if (Number.isNaN(v)) return { ok: false, msg: 'Bitte eine Zahl eingeben.' };
  const msg = rangeError(key, v, scope!);
  return msg ? { ok: false, msg } : { ok: true, v };
}

/**
 * Zahl aus einem Feld lesen und übernehmen (Formular, Karteneditor, So oder so). Ungültiges (keine Zahl, ausserhalb
 * des Wertebereichs) wird nicht gespeichert; das Feld wird markiert und der Grund angezeigt. Ein leeres Feld gilt
 * mit allowEmpty als '' (sonst als 0). Rückgabe: übernommen ja/nein.
 */
export function takeNum(el: HTMLInputElement, key: string, scope: string | null | undefined, allowEmpty: boolean, store: (v: NumLeer) => void) {
  const r = readNum(el, key, scope);
  let v = r.v, msg: string | null = r.ok ? null : r.msg;
  if (r.ok && v === '' && !allowEmpty) { v = 0; if (rangeError(key, 0, scope!)) msg = 'Bitte einen Wert eingeben.'; }
  if (msg) { setErr(el, msg); return false; }
  clearErr(el);
  store(v as NumLeer);
  return true;
}

/** Element für die Meldung: ein vorhandenes (data-errbox = id) oder ein neues direkt nach dem Feld. */
function box(el: HTMLInputElement): HTMLElement {
  const fest = el.dataset.errbox && document.getElementById(el.dataset.errbox);
  if (fest) return fest;
  let b = el.nextElementSibling as HTMLElement | null;
  if (b && b.classList.contains('ferr')) return b;
  b = document.createElement('span');
  b.className = 'ferr';
  b.setAttribute('role', 'status');
  el.insertAdjacentElement('afterend', b);
  return b;
}

/** Feld als ungültig markieren und den Grund anzeigen. */
export function setErr(el: HTMLInputElement, msg: string) {
  el.classList.add('bad');
  el.setAttribute('aria-invalid', 'true');
  const b = box(el);
  b.textContent = msg;
  b.dataset.raw = el.value;
}

/** Markierung und Meldung entfernen. */
export function clearErr(el: HTMLInputElement) {
  el.classList.remove('bad');
  el.removeAttribute('aria-invalid');
  const fest = el.dataset.errbox && document.getElementById(el.dataset.errbox);
  if (fest) { fest.textContent = ''; return; }
  const b = el.nextElementSibling;
  if (b && b.classList.contains('ferr')) b.remove();
}

/**
 * Beim Verlassen eines ungültigen Felds: zuletzt gültigen Wert wieder einsetzen und sagen, was geschehen ist.
 * shown = Anzeige des gültigen Werts.
 */
export function revertErr(el: HTMLInputElement, shown: string) {
  if (!el.classList.contains('bad')) return false;
  const b = box(el), raw = b.dataset.raw ?? el.value, grund = b.textContent;
  el.classList.remove('bad');
  el.removeAttribute('aria-invalid');
  el.value = shown;
  b.textContent = `«${raw}» wurde nicht übernommen. ${grund} ${shown === '' ? 'Das Feld bleibt leer.' : `Es gilt weiter ${shown}.`}`;
  // Die Meldung bleibt eine Weile stehen und verschwindet dann von selbst
  setTimeout(() => { if (b.isConnected && !el.classList.contains('bad')) { if (b.classList.contains('ferr')) b.remove(); else b.textContent = ''; } }, 15000);
  return true;
}
