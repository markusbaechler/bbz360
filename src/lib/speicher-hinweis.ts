// ============================================================================
// speicher-hinweis.ts — sichtbare Warnung, wenn localStorage nichts mehr
// annimmt.
//
// Die Module schreiben bei jeder Eingabe ueber BBZ.set/merge. Scheiterte das
// (Quota), verschwand der Fehler in einem console.warn — eine ganze Beratung
// konnte lautlos verloren gehen. data.ts meldet den Fehlschlag jetzt als
// Event und bleibt UI-frei; die Darstellung passiert hier.
//
// Seiteneffekt-Import je Einstiegspunkt (11 Module + index + admin): eine
// gemeinsame Bootstrap-Datei gibt es nicht, jedes Modul ist ein eigener
// Vite-Entry.
// ============================================================================
import { SPEICHERFEHLER_EVENT } from './data';

const KLASSE = 'bbz-speicherhinweis';
const TEXT = 'Speicher voll — Eingaben werden nicht gespeichert. '
  + 'Beratung exportieren und Browserdaten aufräumen.';

// Einmal weggeklickt bleibt weg: bei vollem Speicher schlaegt jede weitere
// Eingabe fehl, ein wiederkehrender Banner waere unbenutzbar.
let erledigt = false;

function zeigen(): void {
  if (erledigt || !document.body || document.querySelector('.' + KLASSE)) return;
  erledigt = true;

  const box = document.createElement('div');
  box.className = KLASSE;
  box.setAttribute('role', 'alert');

  const text = document.createElement('span');
  text.textContent = TEXT;

  const schliessen = document.createElement('button');
  schliessen.type = 'button';
  schliessen.setAttribute('aria-label', 'Hinweis schliessen');
  schliessen.textContent = '×';
  schliessen.addEventListener('click', () => box.remove());

  box.append(text, schliessen);
  document.body.prepend(box);
}

window.addEventListener(SPEICHERFEHLER_EVENT, zeigen);
