// Richtwerte für die Ausgaben im Ruhestand: Bezeichnungen, Musterbudgets, Puffer und Vergleich mit dem Lohn.
// Gemeinsame Texte für Tutor, Formular, Ergebnis und PDF-Bericht.
import { chf, nf } from './format';
import type { AusgabenCheck } from './analyse';
import type { Params } from './typen';

/** Musterbudget einer Stufe: Betrag pro Position (CHF pro Monat). */
export type Musterbudget = Record<string, number>;
/** Stufen der Musterbudgets, siehe STUFEN. */
export type Stufe = keyof typeof STUFEN;

/** Anzeige der Stufen; die Schlüssel in params.json bleiben unverändert. */
export const STUFEN = { bescheiden: 'einfach', mittel: 'komfortabel', gehoben: 'grosszügig' };

/** Positionen der Musterbudgets: [Schlüssel, Bezeichnung, Erläuterung]. */
export const BUDGET_POS = [
  ['wohnen', 'Wohnen', 'Miete und Nebenkosten; beim Eigenheim Hypothekarzins, Unterhalt und Nebenkosten'],
  ['kk', 'Krankenkasse und Gesundheit', 'Prämien, Franchise, Selbstbehalt'],
  ['haushalt', 'Essen und Haushalt', ''],
  ['mob', 'Mobilität', 'ÖV oder Auto'],
  ['vers', 'Versicherungen, Kommunikation, Gebühren', ''],
  ['freizeit', 'Freizeit und Ferien', ''],
  ['pers', 'Persönliches', 'Kleider, Coiffeur, Geschenke'],
  ['rueck', 'Rückstellungen', 'Zahnarzt, Anschaffungen, Unvorhergesehenes'],
];

/** Total eines Musterbudgets. */
export const musterSumme = (b: Musterbudget) => BUDGET_POS.reduce((x, [k]) => x + (+b[k] || 0), 0);
/** Regler-Bereich einer Position: vom halben einfachen bis zum anderthalbfachen grosszügigen Musterbudget, in 50er-Schritten.
 * Ein enger Bereich macht den Regler ruhiger; mit «+» lässt sich darüber hinausgehen. */
export function budgetBereich(mb: Record<string, Musterbudget>, k: string, v = 0) {
  const min = Math.floor((mb.bescheiden[k] * 0.5) / 50) * 50, max = Math.ceil((mb.gehoben[k] * 1.5) / 50) * 50;
  return { min: Math.min(min, Math.floor(v / 50) * 50), max: Math.max(max, Math.ceil(v / 50) * 50) };
}

/** Aufklappbare Tabelle: Was steckt in den drei Richtwerten? */
export function musterHtml(P: Params, typ: 'single' | 'paar') {
  const mb = P.annahmen.musterbudget?.[typ];
  if (!mb) return '';
  const keys = (Object.keys(STUFEN) as Stufe[]).filter((k) => mb[k]);
  return `<details class="twhy tmuster"><summary>Was steckt in diesen Beträgen?</summary>
    <div class="tblwrap" tabindex="0" role="region" aria-label="Tabelle, seitlich scrollbar"><table class="cmp"><thead><tr><th>CHF/Mt.</th>${keys.map((k) => `<th>${STUFEN[k]}</th>`).join('')}</tr></thead>
    <tbody>${BUDGET_POS.map(([p, l, h]) => `<tr><td>${l}${h ? `<small>${h}</small>` : ''}</td>${keys.map((k) => `<td>${nf.format(mb[k][p])}</td>`).join('')}</tr>`).join('')}
    <tr class="tot"><td><b>Total</b></td>${keys.map((k) => `<td><b>${nf.format(musterSumme(mb[k]))}</b></td>`).join('')}</tr></tbody></table></div>
    <p>Beispiele zur Orientierung für ${typ === 'paar' ? 'ein Paar' : 'eine alleinstehende Person'}, keine Statistik. Ohne Steuern. Ihr eigenes Budget kann in jeder Position deutlich abweichen, vor allem beim Wohnen.</p></details>`;
}

/** Abstand zwischen tragbaren und angenommenen Ausgaben, z. B. «Puffer 19%» oder «es fehlen 12%». */
export function pufferText(maxA: number, annahme: number, ampel?: string | null) {
  if (!(annahme > 0) || !isFinite(maxA)) return '';
  const q = Math.round(((maxA - annahme) / annahme) * 100);
  // Die tragbaren Ausgaben gelten für das Basisszenario; die Ampel prüft zusätzlich den Stresstest
  return q > 0 ? `Puffer ${q}%${ampel && ampel !== 'gruen' ? ' im Basisszenario, ohne Stresstest' : ''}` : q < 0 ? `es fehlen ${-q}%` : 'kein Puffer';
}

/** Hinweis im Lohn-Schritt: Ausgaben im Ruhestand im Verhältnis zum heutigen Nettolohn. */
export function lohnCheckHtml(c: AusgabenCheck | null, paar?: boolean) {
  if (!c) return '';
  const pct = Math.round(c.quote * 100), basis = `Ihr heutiger Nettolohn nach Steuern beträgt geschätzt <b>${chf(c.netto)} pro Monat</b>${paar ? ' (beide zusammen)' : ''}. Ihre Ausgaben im Ruhestand von ${chf(c.ausgaben)} entsprechen <b>${pct}%</b> davon.`;
  if (c.st === 'tief') return `${basis} <b>Das liegt deutlich unter dem heutigen Lohn.</b> Prüfen Sie, ob Wohnen, Krankenkasse, Ferien und Rückstellungen enthalten sind.`;
  if (c.st === 'hoch') return `${basis} <b>Das ist mehr, als Sie heute verdienen.</b> Das geht nur mit Vermögen oder weiteren Einkommen; prüfen Sie den Betrag.`;
  return `${basis} Eine verbreitete Faustregel nennt 70 bis 80%.`;
}
