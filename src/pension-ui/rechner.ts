// Rechnen im Web Worker ohne Stau: Höchstens eine Rechnung ist unterwegs. Kommt währenddessen eine neuere Eingabe,
// wird danach genau einmal mit dem dann aktuellen Stand gerechnet; überholte Läufe entfallen. Dauert eine Rechnung zu
// lange oder stürzt der Worker ab, wird er neu gestartet. Ohne DOM, damit sich der Ablauf testen lässt.

/** So oft wird ein Worker, der nicht startet oder sofort abstürzt, hintereinander ersetzt (dann erst wieder beim nächsten Auftrag). */
const MAX_NEUSTARTS = 2;

/**
 * @param {object} o
 * @param {() => {postMessage: Function, terminate: Function, onmessage: any, onerror: any}} o.neuerWorker
 * @param {() => {S: object, params: object, A0: number, stopA: any}} o.auftrag  aktueller Stand, gelesen beim Start eines Laufs
 * @param {(R: object) => void} o.onErgebnis  Ergebnis des neuesten Stands
 * @param {(art: 'fehler' | 'zeit', detail?: any) => void} o.onFehler  Rechnung gescheitert bzw. abgebrochen
 * @param {() => void} [o.onBeginn]  eine Rechnung wurde verlangt (auch wenn sie warten muss)
 * @param {number} [o.limitMs]  Höchstdauer eines Laufs
 */
export function createRechner({ neuerWorker, auftrag, onErgebnis, onFehler, onBeginn, limitMs = 20000, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let worker = null, nr = 0, unterwegs = false, wartet = false, wachhund = null, gesendet = null, laeufe = 0, neustarts = 0;

  /** Nach einem Lauf: Wartet ein neuerer Stand, wird er gerechnet (true); sonst ist die Reihe leer (false). */
  const weiter = () => {
    unterwegs = false;
    clearTimer(wachhund);
    if (!wartet) return false;
    wartet = false;
    rechne();
    return true;
  };
  function start() {
    gesendet = null; // ein neuer Worker kennt die Grundlagen noch nicht
    const w = neuerWorker();
    worker = w;
    w.onmessage = (ev) => {
      if (w !== worker) return; // Nachricht eines Workers, der inzwischen ersetzt wurde
      const { id, R, error } = ev.data || {};
      if (id !== nr || !unterwegs) return; // nicht der laufende Auftrag (auch eine doppelte Antwort)
      neustarts = 0; // der Worker arbeitet
      if (weiter()) return; // überholt: nur der neueste Stand zählt
      if (error) onFehler('fehler', error);
      else onErgebnis(R);
    };
    w.onerror = (ev) => {
      if (w !== worker) return;
      const lief = unterwegs;
      // Der Worker ist nicht mehr verlässlich: ersetzen. Startet er wiederholt nicht (Skript nicht ladbar), wird nicht
      // endlos neu gestartet; der nächste Auftrag versucht es wieder.
      neustarts++;
      if (neustarts <= MAX_NEUSTARTS) neustart();
      else { try { w.terminate(); } catch { /* bereits beendet */ } worker = null; }
      if (!lief) return; // kein Lauf betroffen: das angezeigte Ergebnis bleibt gültig
      if (worker && weiter()) return;
      unterwegs = false;
      wartet = false;
      clearTimer(wachhund);
      onFehler('fehler', ev && (ev.message || ev));
    };
  }
  /** Startet einen Worker; lässt er sich nicht erzeugen, gibt es keinen (der nächste Auftrag versucht es wieder). */
  function sicherStart() {
    try { start(); return true; } catch { worker = null; return false; }
  }
  function neustart() {
    try { worker?.terminate(); } catch { /* bereits beendet */ }
    sicherStart();
  }
  function rechne() {
    onBeginn?.();
    if (unterwegs) { wartet = true; return; }
    if (!worker) {
      neustarts = 0;
      // Der Worker lässt sich nicht erzeugen: melden statt hängen bleiben
      if (!sicherStart()) { onFehler('fehler', 'Worker nicht verfügbar'); return; }
    }
    const id = ++nr;
    unterwegs = true;
    laeufe++;
    clearTimer(wachhund);
    wachhund = setTimer(() => {
      if (id !== nr || !unterwegs) return;
      neustart();
      if (worker && weiter()) return;
      unterwegs = false;
      wartet = false;
      onFehler('zeit');
    }, limitMs);
    try {
      // Die Grundlagen (rund 75 KB) reisen nur mit, wenn der Worker sie noch nicht hat
      const a = auftrag();
      const neu = gesendet !== a.params;
      worker.postMessage({ id, ...a, params: neu ? a.params : null });
      gesendet = a.params;
    } catch (e) {
      // Der Auftrag liess sich nicht übergeben (z. B. nicht übertragbarer Stand): melden statt hängen bleiben
      unterwegs = false;
      wartet = false;
      clearTimer(wachhund);
      onFehler('fehler', e);
    }
  }
  sicherStart();
  return { rechne, zustand: () => ({ unterwegs, wartet, laeufe, bereit: !!worker }) };
}
