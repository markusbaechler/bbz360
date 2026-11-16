// ============================================================================
// 05b Budget & Liquiditaet (Zielbild Fusion, Phase 4).
// Budget im Ruhestand mit den acht Positionen und Musterbudgets des PensCheck,
// dazu Ausgaben heute, Sparquote und Liquiditaetsreserve. Liest und schreibt
// den gemeinsamen Haushalts-Stand (lib/haushalt.ts): dieselben Betraege gelten
// im Cockpit 05 und in der Pensionierung 07c.
// ============================================================================
import '../styles/pension/bbz-fonts-embedded.css';
import '../styles/pension/bbz-base.css';
import '../styles/pension/bbz-components.css';
import '../styles/pension/styles.css';
import '../styles/modules/07c-pension.css'; // Topbar im Brand-Look
import '../styles/modules/05b-budget.css';
import grundlagen from '../../public/data/params.json';
import { BBZ } from '../lib/data';
import { mountNav } from '../lib/nav';
import { cockpitEinkommen, haushaltLesen, haushaltSchreiben } from '../lib/haushalt';
import { budgetKennzahlen, musterUebernehmen } from '../lib/budget';
import { applyBudget } from '../lib/pension/analyse';
import { STUFEN, musterHtml } from '../lib/pension/budget';
import type { Stufe } from '../lib/pension/budget';
import { createEngine, monthOf } from '../lib/pension/engine';
import { chf, esc, fmtIn, parseNum } from '../lib/pension/format';
import { resolveParams, nextParams } from '../lib/pension/params';
import type { ParamDatei } from '../lib/pension/typen';

const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
const feld = (id: string): HTMLInputElement => document.getElementById(id) as HTMLInputElement;

mountNav($('bbzNav'), { activeId: '05b' });

const A0 = monthOf(), jahr = Math.floor(A0 / 12);
const daten = grundlagen as unknown as ParamDatei;
const E = createEngine(resolveParams(daten, jahr), A0, nextParams(daten, jahr));
const S = haushaltLesen();

/**
 * Nettoeinkommen pro Monat aus dem Cockpit 05 (0 = dort nicht erfasst). Aeltere Staende mit Einkommens-Typ
 * «brutto» tragen kein Netto (lib/haushalt.ts: cockpitEinkommen); gezaehlt werden die Personen des Haushalts.
 */
function nettoCockpit(): number[] {
  return cockpitEinkommen(BBZ.all()).netto.map((v) => v / 12); // je Person; fehlt eines, schätzt die Bibliothek aus dem Bruttolohn
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
function toast(t: string): void {
  const el = $('toast');
  el.textContent = t;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 5000);
}

let speicherGewarnt = false;
/** Nach jeder Eingabe: Budget nachfuehren, speichern, Kennzahlen neu zeigen. */
function geaendert(): void {
  applyBudget(S, E);
  S.ui.edited = true;
  if (!haushaltSchreiben(S) && !speicherGewarnt) {
    speicherGewarnt = true;
    toast('Speicher voll — das Budget wird nicht gespeichert. Bitte die Session im Beratercockpit exportieren.');
  }
  zeigen();
}

/** Betrag aus einem Feld: leer bleibt leer, Ungueltiges wird abgewiesen (Feld rot, Stand unveraendert). */
function lesen(el: HTMLInputElement): number | '' | null {
  const v = parseNum(el.value);
  const ok = v === '' || (typeof v === 'number' && isFinite(v) && v >= 0 && v <= 100000);
  el.classList.toggle('bad', !ok);
  return ok ? (v === '' ? '' : Math.round(v as number)) : null;
}

// ---------- Aufbau (einmal) ----------
function aufbau(): void {
  $('buMuster').innerHTML = (Object.keys(STUFEN) as Stufe[]).map((k) => `<button type="button" class="chip" data-muster="${k}" aria-pressed="false">${STUFEN[k]}</button>`).join('');
  const k = budgetKennzahlen(S, E, nettoCockpit());
  $('buPos').innerHTML = k.positionen.map((p) => `<div class="bu-row">
      <label for="bu_${p.key}">${esc(p.label)}${p.fest ? '<small>folgt der Liegenschaft (Hypothekarzins, Unterhalt, Nebenkosten) — in der Pensionierung erfasst</small>' : p.hinweis ? `<small>${esc(p.hinweis)}</small>` : ''}</label>
      ${p.fest ? `<output id="bu_${p.key}"></output>` : `<input type="text" inputmode="decimal" id="bu_${p.key}" data-pos="${p.key}" autocomplete="off">`}
    </div>`).join('');
  $('buMusterTabelle').outerHTML = musterHtml(E.P, S.haushalt === 'single' ? 'single' : 'paar') || '<span id="buMusterTabelle"></span>';
  $('buAnnahmen').innerHTML = [
    'Das Budget im Ruhestand steht in heutiger Kaufkraft und ohne Steuern; Teuerung und Steuern rechnet die Pensionierung dazu.',
    'Die Beispiele (einfach, komfortabel, grosszügig) sind Orientierungswerte aus den Grundlagen des PensCheck, keine Statistik.',
    'Sparbetrag = Nettoeinkommen − Ausgaben heute. Fehlt das Nettoeinkommen im Cockpit, wird es aus dem Bruttolohn geschätzt (abzüglich Sozialabgaben und pauschaler Einkommenssteuer).',
    'Reserve = Liquidität (Zahlungsverkehr und Sparen) geteilt durch die Ausgaben heute. Faustregel: drei bis sechs Monatsausgaben; sie ist ein Richtwert und keine Vorschrift.',
  ].map((t) => `<li>${t}</li>`).join('');
  felderFuellen();
}

/** Felder aus dem Stand fuellen (Start, Musterbudget). */
function felderFuellen(): void {
  const k = budgetKennzahlen(S, E, nettoCockpit());
  for (const p of k.positionen) {
    if (p.fest) continue;
    const el = feld(`bu_${p.key}`);
    el.value = p.erfasst ? fmtIn(p.wert, false) : '';
    el.placeholder = p.key === 'wohnen' ? `Richtwert ${fmtIn(p.wert, false)}` : '';
    el.classList.remove('bad');
  }
  feld('buHeute').value = k.ausgabenHeute > 0 ? fmtIn(k.ausgabenHeute, false) : '';
  feld('buRuhe').value = S.ausgabenRuhestand > 0 ? fmtIn(S.ausgabenRuhestand, false) : '';
}

// ---------- Anzeige (nach jeder Aenderung) ----------
const pct = (v: number): string => `${Math.round(v * 100)}%`;
function zeigen(): void {
  const k = budgetKennzahlen(S, E, nettoCockpit());
  const fest = k.positionen.find((p) => p.fest);
  if (fest) $(`bu_${fest.key}`).textContent = chf(fest.wert);
  $('buSumme').textContent = chf(k.summe);
  const aktiv = feld('buAktiv');
  aktiv.checked = k.aktiv;
  aktiv.disabled = !k.voll;
  $('buAktivHinweis').textContent = !k.voll
    ? 'Sobald alle Positionen erfasst sind, kann das Budget als Ausgaben im Ruhestand gelten.'
    : k.aktiv ? `Die Pensionierung rechnet mit ${chf(k.summe)} pro Monat (${chf(k.summe * 12)} pro Jahr).`
      : `Die Pensionierung rechnet derzeit mit ${S.ausgabenRuhestand > 0 ? chf(S.ausgabenRuhestand) : 'keinem Betrag'} pro Monat.`;
  $('buRuheFeld').hidden = k.aktiv;
  if (k.aktiv) feld('buRuhe').value = fmtIn(S.ausgabenRuhestand, false);
  document.querySelectorAll<HTMLElement>('[data-muster]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.muster === S.budgetBasis)));

  const kpi = (l: string, v: string, s: string, st = ''): string => `<div class="kpi"${st ? ` data-st="${st}"` : ''}><span class="l">${l}</span><span class="v">${v}</span><span class="s">${s}</span></div>`;
  const ruhe = k.aktiv ? k.summe : k.ausgabenRuhestand;
  $('buKpis').innerHTML = [
    kpi('Nettoeinkommen pro Monat', k.netto != null ? chf(k.netto) : '–', k.nettoQuelle === 'cockpit' ? 'aus dem Finanz-Cockpit' : k.nettoQuelle === 'gemischt' ? 'Cockpit und Schätzung aus dem Bruttolohn' : k.nettoQuelle === 'schaetzung' ? 'geschätzt aus dem Bruttolohn' : 'Lohn im Cockpit erfassen'),
    kpi('Sparbetrag pro Monat', k.sparbetrag != null ? chf(k.sparbetrag) : '–', k.sparquote != null ? `${pct(k.sparquote)} des Nettoeinkommens` : 'Einkommen und Ausgaben erfassen', k.sparbetrag == null ? '' : k.sparbetrag < 0 ? 'schlecht' : 'gut'),
    kpi('Reserve', k.reserveMonate != null ? `${k.reserveMonate.toFixed(1)} Monate` : '–', `Liquidität ${chf(S.liquiditaet)}`, k.reserveMonate == null ? '' : k.reserveMonate < 3 ? 'knapp' : 'gut'),
    kpi('Ruhestand zu heute', k.ruhestandZuHeute != null ? pct(k.ruhestandZuHeute) : '–', ruhe > 0 ? `${chf(ruhe)} im Ruhestand` : 'Budget oder Betrag erfassen'),
  ].join('');
  $('buHinweis').textContent = k.sparbetrag != null && k.sparbetrag < 0
    ? 'Die heutigen Ausgaben übersteigen das Nettoeinkommen: Der Haushalt lebt vom Vermögen.'
    : k.reserveMonate != null && k.reserveMonate < 3
      ? 'Die Reserve liegt unter der Faustregel von drei Monatsausgaben.'
      : k.ruhestandZuHeute != null && k.ruhestandZuHeute < 0.6
        ? 'Das Budget im Ruhestand liegt deutlich unter den heutigen Ausgaben. Sind Wohnen, Krankenkasse, Ferien und Rückstellungen enthalten?'
        : '';
}

// ---------- Eingaben ----------
$('buPos').addEventListener('input', (ev) => {
  const el = ev.target as HTMLInputElement;
  const key = el.dataset.pos;
  if (!key) return;
  const v = lesen(el);
  if (v === null) return;
  if (key === 'wohnen') { if (v === '') delete S.fix.wohnen; else S.fix.wohnen = v; }
  else if (v === '') delete S.budget[key]; else S.budget[key] = v;
  geaendert();
});
$('buMuster').addEventListener('click', (ev) => {
  const b = (ev.target as Element).closest<HTMLElement>('[data-muster]');
  if (!b) return;
  musterUebernehmen(S, E, b.dataset.muster as Stufe);
  felderFuellen();
  geaendert();
});
feld('buAktiv').addEventListener('change', () => { S.budgetAktiv = feld('buAktiv').checked; geaendert(); });
feld('buHeute').addEventListener('input', () => { const v = lesen(feld('buHeute')); if (v === null) return; S.ausgabenHeute = v === 0 ? '' : v; geaendert(); });
feld('buRuhe').addEventListener('input', () => { const v = lesen(feld('buRuhe')); if (v === null) return; S.ausgabenRuhestand = v === '' ? 0 : v; geaendert(); });
// Beim Verlassen eines Felds: Tausenderzeichen setzen
$('main').addEventListener('focusout', (ev) => {
  const el = ev.target as HTMLInputElement;
  if (el.tagName !== 'INPUT' || el.type !== 'text' || el.classList.contains('bad')) return;
  const v = parseNum(el.value);
  if (typeof v === 'number' && isFinite(v)) el.value = fmtIn(Math.round(v), false);
});

aufbau();
zeigen();
