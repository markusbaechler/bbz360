// de-CH Formatierung — Port der v1-Hilfsfunktionen (bbz-Dialog bbz-data.js), verbatim.
// Apostroph-Tausender (U+0027) wie v1; kein toLocaleString (ICU-unabhaengig, deterministisch).

export function fmt(n: number | null | undefined, decimals = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '–';
  const abs = Math.abs(n).toFixed(decimals).split('.');
  abs[0] = abs[0].replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  return (n < 0 ? '-' : '') + abs.join('.');
}

export function parseNum(s: string | number | null | undefined): number {
  if (typeof s === 'number') return s;
  return parseFloat(String(s ?? '').replace(/['\s]/g, '').replace(',', '.')) || 0;
}

export function fmtDate(iso: string): string {
  if (!iso) return '–';
  try {
    return new Date(iso).toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return iso;
  }
}

// now injizierbar fuer testbare, deterministische Altersberechnung.
export function age(isoDate: string, now: Date = new Date()): number | null {
  if (!isoDate) return null;
  const geb = new Date(isoDate);
  const alter =
    now.getFullYear() - geb.getFullYear() -
    (now < new Date(now.getFullYear(), geb.getMonth(), geb.getDate()) ? 1 : 0);
  return alter > 0 && alter < 130 ? alter : null;
}
