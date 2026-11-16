// ============================================================================
// 07f Nachlass (Zielbild Fusion, Phase 8): gesetzliche Erbfolge, Pflichtteile,
// erwartete Erbschaften (Zuflüsse im Haushalts-Stand) und Themen zum Regeln.
// Eingaben des Moduls liegen als `nachlass` in bbzData, die Kinderzahl als
// `familie_kinder`.
// ============================================================================
import '../styles/pension/bbz-fonts-embedded.css';
import '../styles/pension/bbz-base.css';
import '../styles/pension/bbz-components.css';
import '../styles/pension/styles.css';
import '../styles/modules/07c-pension.css'; // Topbar im Brand-Look
import '../styles/modules/fach.css';
import { BBZ } from '../lib/data';
import { $, feld, inFeld, kpi, lesen, personName, start, tausender, themenListe, zahlAus } from '../lib/fach-ui';
import { NACHLASS_THEMEN } from '../lib/fach-themen';
import { haushaltLesen, haushaltSchreiben } from '../lib/haushalt';
import { bruchText, erbteilung, nachlassAnnahme } from '../lib/nachlass';
import { chf, esc } from '../lib/pension/format';
import { MAX_ZUFLUESSE } from '../lib/pension/state';
import type { Zufluss } from '../lib/pension/typen';

const { jahr } = start('07f');
const S = haushaltLesen();
const paar = S.haushalt !== 'single';
const zahl = (v: unknown): number => (typeof v === 'number' && isFinite(v) && v > 0 ? v : 0);

const roh = lesen<{ erblasser: number; elternStamm: boolean; nachlass: number }>('nachlass', { erblasser: 0, elternStamm: true, nachlass: 0 });
const ein = {
  erblasser: paar && roh.erblasser === 1 ? 1 : 0,
  elternStamm: roh.elternStamm !== false,
  nachlass: zahl(roh.nachlass),
  kinder: Math.min(12, Math.round(zahl(BBZ.get('familie_kinder')))),
};
function sichern(): void {
  BBZ.merge({ nachlass: { ...lesen<object>('nachlass', {}), erblasser: ein.erblasser, elternStamm: ein.elternStamm, nachlass: ein.nachlass }, familie_kinder: ein.kinder });
}


themenListe($('naThemen'), document.getElementById('naNotiz') as HTMLTextAreaElement, 'nachlass', NACHLASS_THEMEN);

// ---------- Erbfolge ----------
$('naWerFeld').hidden = !paar;
$('naWer').innerHTML = [0, 1].slice(0, paar ? 2 : 1).map((i) => `<button type="button" class="chip" data-wer="${i}" aria-pressed="false">${esc(personName(i))}</button>`).join('');
$('naZivil').textContent = `Zivilstand laut Pensionierung: ${{ verheiratet: 'verheiratet', konkubinat: 'Konkubinat', single: 'alleinstehend' }[S.haushalt]}.`;
feld('naKinder').value = ein.kinder > 0 ? String(ein.kinder) : '';
feld('naNachlass').value = inFeld(ein.nachlass);

function zeigen(): void {
  document.querySelectorAll<HTMLElement>('[data-wer]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.wer) === ein.erblasser)));
  document.querySelectorAll<HTMLElement>('[data-eltern]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.eltern === 'ja') === ein.elternStamm)));
  const annahme = nachlassAnnahme(S), N = ein.nachlass > 0 ? ein.nachlass : annahme;
  $('naNachlassHinweis').textContent = ein.nachlass > 0 ? 'eigene Angabe' : `leer = Annahme ${chf(annahme)} (${paar ? 'Hälfte des' : 'ganzes'} Reinvermögen heute)`;
  const r = erbteilung({ zivil: S.haushalt, kinder: ein.kinder, elternStamm: ein.elternStamm, nachlass: N });
  $('naErben').innerHTML = r.erben.map((e) => `<tr><td>${esc(e.wer)}</td><td>${bruchText(e.gesetzlich)}</td><td>${chf(e.betrag)}</td><td>${bruchText(e.pflichtteil)}</td><td>${chf(e.pflichtBetrag)}</td></tr>`).join('')
    + `<tr class="tot"><td>Nachlass${paar ? ` von ${esc(personName(ein.erblasser))}` : ''}</td><td></td><td>${chf(N)}</td><td></td><td>${chf(r.erben.reduce((x, e) => x + e.pflichtBetrag, 0))}</td></tr>`;
  $('naKpis').innerHTML = kpi('Frei verfügbare Quote', bruchText(r.frei), 'kann mit Testament oder Erbvertrag frei zugewiesen werden')
    + kpi('Frei verfügbar', chf(r.freiBetrag), `von ${chf(N)}`)
    + kpi('Pflichtteile', chf(N - r.freiBetrag), 'können nicht entzogen werden');
  $('naHinweise').innerHTML = r.hinweise.map((h) => `<p class="fm-hinweis">${esc(h)}</p>`).join('');
}
$('naWer').addEventListener('click', (ev) => { const b = (ev.target as Element).closest<HTMLElement>('[data-wer]'); if (!b) return; ein.erblasser = Number(b.dataset.wer) === 1 ? 1 : 0; sichern(); zeigen(); });
document.querySelectorAll<HTMLElement>('[data-eltern]').forEach((b) => b.addEventListener('click', () => { ein.elternStamm = b.dataset.eltern === 'ja'; sichern(); zeigen(); }));
feld('naKinder').addEventListener('input', () => {
  const el = feld('naKinder'), t = el.value.trim(), n = Number(t);
  const ok = t === '' || (Number.isInteger(n) && n >= 0 && n <= 12);
  el.classList.toggle('bad', !ok);
  if (!ok) return;
  ein.kinder = t === '' ? 0 : n; sichern(); zeigen();
});
feld('naNachlass').addEventListener('input', () => { const v = zahlAus(feld('naNachlass'), 1e9); if (v === null) return; ein.nachlass = v; sichern(); zeigen(); });

// ---------- Erwartete Erbschaften: Zuflüsse im Haushalts-Stand ----------
// Entwurf: Zeilen dürfen unvollständig sein; gespeichert wird, was Betrag und Jahr hat.
interface Zeile { name: string; betrag: number; jahr: number }
const zeilen: Zeile[] = (S.zufluesse ?? []).map((z) => ({ ...z }));
function zuSichern(): void {
  const gueltig: Zufluss[] = zeilen.filter((z) => z.betrag > 0 && z.jahr > 0).map((z) => ({ name: z.name, betrag: z.betrag, jahr: z.jahr }));
  const H = haushaltLesen();
  if (gueltig.length) H.zufluesse = gueltig; else delete H.zufluesse;
  H.ui.edited = true;
  haushaltSchreiben(H);
}
function zuZeigen(): void {
  $('naZufluesse').innerHTML = zeilen.length ? zeilen.map((z, i) => `<div class="fm-zeile" data-zeile="${i}">
      <input type="text" data-frei data-zf="name" maxlength="60" aria-label="Bezeichnung" placeholder="z. B. Erbschaft Eltern" value="${esc(z.name)}">
      <input type="text" inputmode="decimal" data-zf="betrag" aria-label="Betrag in CHF" placeholder="Betrag" value="${inFeld(z.betrag)}">
      <input type="text" inputmode="numeric" data-frei data-zf="jahr" aria-label="Jahr" placeholder="Jahr" value="${z.jahr > 0 ? z.jahr : ''}">
      <button type="button" class="bbz-button bbz-button--ghost sm" data-zf-weg aria-label="Zufluss entfernen">×</button>
    </div>`).join('') : '<p class="cap">Noch keine Zuflüsse erfasst.</p>';
  ($('naZuPlus') as HTMLButtonElement).disabled = zeilen.length >= MAX_ZUFLUESSE;
}
$('naZuPlus').addEventListener('click', () => { zeilen.push({ name: '', betrag: 0, jahr: 0 }); zuZeigen(); $('naZufluesse').querySelector<HTMLInputElement>('.fm-zeile:last-child input')?.focus(); });
$('naZufluesse').addEventListener('click', (ev) => {
  const b = (ev.target as Element).closest('[data-zf-weg]');
  if (!b) return;
  zeilen.splice(Number(b.closest<HTMLElement>('[data-zeile]')!.dataset.zeile), 1);
  zuSichern(); zuZeigen();
});
$('naZufluesse').addEventListener('input', (ev) => {
  const el = ev.target as HTMLInputElement, z = zeilen[Number(el.closest<HTMLElement>('[data-zeile]')?.dataset.zeile)];
  if (!z || !el.dataset.zf) return;
  if (el.dataset.zf === 'name') z.name = el.value.slice(0, 60);
  else if (el.dataset.zf === 'betrag') { const v = zahlAus(el, 1e9); if (v === null) return; z.betrag = v; }
  else {
    const t = el.value.trim(), n = Number(t), ok = t === '' || (Number.isInteger(n) && n >= jahr && n <= 2150);
    // Während des Tippens (z. B. «203») noch nicht als Fehler zeigen
    el.classList.toggle('bad', !ok && t.length >= 4);
    z.jahr = ok && t !== '' ? n : 0;
  }
  zuSichern();
});

tausender($('main'));
zeigen();
zuZeigen();
