// Zahlen- und Textformate nach bbz Brand System (Deutsch Schweiz), zentral für die ganze App:
// Tausender mit ’ (U+2019), Dezimalpunkt, Prozent ohne Leerzeichen (4.25%), negativ mit - (U+002D).
const intl = new Intl.NumberFormat('de-CH', { maximumFractionDigits: 0 });
const apos = (s: string) => s.replace(/['’]/g, '’').replace(/−/g, '-');
export const nf = { format: (v: number) => apos(intl.format(Math.round(v || 0) === 0 ? 0 : v)) };
export const chf = (v: number) => 'CHF ' + nf.format(Math.round(v || 0));
/** Betrag mit Vorzeichen: CHF +1’250 bzw. CHF -1’250. */
export const chfSigned = (v: number) => (Math.round(v || 0) >= 0 ? 'CHF +' : 'CHF -') + nf.format(Math.abs(Math.round(v || 0)));
export const dec = (v: number | string, d = 1) => Number(v).toFixed(d);
export const pctTxt = (v: number, d = 1) => (v * 100).toFixed(d) + '%';
export const axisChf = (v: number) =>
  Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(Math.abs(v) >= 1e7 ? 0 : 1).replace('.0', '') + ' Mio' : v === 0 ? '0' : nf.format(Math.round(v / 1000)) + 'k';
/**
 * Eingegebene Zahl lesen; '' bleibt leer, ungültig → NaN.
 * Akzeptiert Apostroph und Leerzeichen als Tausendertrennung, Komma oder Punkt als Dezimalzeichen sowie
 * «CHF», «Fr.», «%» und «.-» als Zusatz. Punkt oder Komma vor genau drei Ziffern gilt in Betragsfeldern
 * als Tausendertrennung («160.000» = 160’000), in Feldern mit Nachkommastellen (isDec, z. B. Prozent) als Dezimalzeichen.
 */
export const parseNum = (s: unknown, isDec = false): number | '' => {
  let t = String(s ?? '')
    .replace(/[’'`´\s   ]/g, '')
    .replace(/[−–]/g, '-')
    .replace(/^(chf|sfr\.?|fr\.?)/i, '')
    .replace(/(chf|sfr\.?|fr\.?|%|\.-)$/i, '');
  if (t === '') return '';
  const neg = t.startsWith('-');
  if (neg) t = t.slice(1);
  if (!/^\d[\d.,]*$|^[.,]\d+$/.test(t)) return NaN;
  const nd = (t.match(/\./g) || []).length, nc = (t.match(/,/g) || []).length;
  if (nd && nc) {
    // beide Zeichen: das letzte ist das Dezimalzeichen («1.250,50», «1,250.50»)
    const dez = t.lastIndexOf('.') > t.lastIndexOf(',') ? '.' : ',';
    if ((dez === '.' ? nd : nc) > 1) return NaN;
    t = t.split(dez === '.' ? ',' : '.').join('').replace(dez, '.');
  } else if (nd + nc > 1) {
    // mehrfach dasselbe Zeichen: nur als Tausendertrennung gültig («1.250.000»)
    if (!/^\d{1,3}([.,]\d{3})+$/.test(t)) return NaN;
    t = t.replace(/[.,]/g, '');
  } else if (nd + nc === 1) {
    t = !isDec && /^\d{1,3}[.,]\d{3}$/.test(t) ? t.replace(/[.,]/, '') : t.replace(',', '.');
  }
  const n = Number(t);
  return isFinite(n) ? (neg ? -n : n) : NaN;
};
/** Zahl für ein Eingabefeld; alles andere als eine Zahl ergibt ein leeres Feld. */
export const fmtIn = (v: unknown, isDec?: boolean): string => {
  if (v === '' || v == null) return '';
  const n = typeof v === 'number' ? v : Number(v);
  if (!isFinite(n)) return '';
  return isDec ? String(n) : nf.format(n);
};
export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
