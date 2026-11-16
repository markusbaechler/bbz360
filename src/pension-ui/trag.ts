// Tragbarkeit der Hypothek aus Sicht der Bank: gemeinsame Texte für Ergebnis, Tutor und PDF-Bericht.
import { chf } from '../lib/pension/format';
import { gl } from './glossar';

const ST = { gruen: 'tragbar', gelb: 'knapp tragbar', rot: 'nicht tragbar' };
const pct = (q) => `${Math.round(q * 100)}%`;

/** Status-Etikett «Hypothek tragbar / knapp tragbar / nicht tragbar». */
export const tragPill = (tr) => `<span class="pill" data-st="${tr.worst.st}">Hypothek ${ST[tr.worst.st]}</span>`;

/** Satz mit Belastung, Grenze und fehlender Amortisation (HTML, Zahlen und feste Texte). */
export function tragSatz(tr, s) {
  const w = tr.worst;
  const pts = tr.pts.map((x) => `${x.label} (${x.datum}): <b>${pct(x.quote)}</b>`).join(' · ');
  return `Belastung aus Sicht der Bank (${gl('tragbarkeit', 'Tragbarkeit')}) ${pts}. Grenze ${s.tragGrenze}%, bis ${+s.tragGrenze + 5}% gilt als knapp.${w.amort > 1000 ? ` Für ${s.tragGrenze}% fehlt eine Amortisation von rund <b>${chf(w.amort)}</b> bis ${w.datum}.` : ''}`;
}

/**
 * Rechenvariante zur Tragbarkeit (3a-Vorbezüge zur Amortisation) mit dem Knopf «Variante in die Eingaben übernehmen»
 * (data-apply, Handlung in results.js: app.varianteUebernehmen); für den Block «trag» und das Tutor-Ergebnis.
 */
export function varianteHtml(vs, s, E) {
  if (!vs) return '';
  return `<div class="sugg"><p><b>Rechenvariante${vs.zusaetzlich ? ' (zusätzlich)' : ''}:</b> ${vs.amortisationen.map((v) => `3a-Vorbezug Person ${+v.quelle.slice(-1) + 1} ${chf(v.betrag)} im ${E.fmtA(E.amortMonat(s, v))}`).join(', ')}, jeweils vor der Pensionierung. Damit läge die Belastung rechnerisch bei <b>${Math.round(vs.trag.worst.quote * 100)}%</b>${vs.restBedarf > 1000 ? `; es fehlen noch rund ${chf(vs.restBedarf)}` : ''}.</p><button type="button" class="bbz-button bbz-button--secondary sm" data-apply="1">Variante in die Eingaben übernehmen</button></div>`;
}

/** Kurzfassung für das Tutor-Ergebnis. */
export function tragKurzHtml(tr, s) {
  if (!tr) return '';
  return `<div class="trag">${tragPill(tr)}<p>${tragSatz(tr, s)}${tr.worst.st !== 'gruen' ? ' Das ist unabhängig von der Ampel: Sie beurteilt, ob das Geld reicht, nicht ob die Bank die Hypothek weiterführt.' : ''}</p></div>`;
}

/** Klartext für den PDF-Bericht. */
export function tragText(tr, s) {
  if (!tr) return '';
  const w = tr.worst;
  return `Hypothek ${ST[w.st]}. Belastung aus Sicht der Bank ${tr.pts.map((x) => `${x.label} (${x.datum}): ${pct(x.quote)}`).join(', ')}. Grenze ${s.tragGrenze}%, bis ${+s.tragGrenze + 5}% gilt als knapp.${w.amort > 1000 ? ` Für ${s.tragGrenze}% fehlt eine Amortisation von rund ${chf(w.amort)} bis ${w.datum}.` : ''}${w.st !== 'gruen' ? ' Die Ampel beurteilt nur, ob das Geld reicht; ob die Bank die Hypothek nach der Pensionierung weiterführt, ist frühzeitig mit ihr zu klären.' : ''}`;
}
