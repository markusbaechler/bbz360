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
  const el = feld('naKinder'), t = el.value.trim();
  const ok = t === '' || (/^\d{1,2}$/.test(t) && Number(t) <= 12);
  el.classList.toggle('bad', !ok);
  if (!ok) return;
  ein.kinder = t === '' ? 0 : Number(t);
  // Dieselbe Angabe wie in der Absicherung; «davon unter 18 oder in Ausbildung» kann nicht grösser sein
  const abh = Math.round(zahl(BBZ.get('familie_kinder_abh')));
  sichern();
  if (abh > ein.kinder) BBZ.set('familie_kinder_abh', ein.kinder);
  zeigen();
});
feld('naNachlass').addEventListener('input', () => { const v = zahlAus(feld('naNachlass'), 1e9); if (v === null) return; ein.nachlass = v; sichern(); zeigen(); });

// ---------- Erwartete Erbschaften: Zuflüsse im Haushalts-Stand ----------
// Vollständige Zeilen (Betrag und Jahr) stehen im Haushalts-Stand und rechnen mit. Unvollständige Zeilen bleiben
// als Entwurf im Session-Objekt `nachlass`, damit nichts still verloren geht. Eine ungültige Eingabe ändert den
// gespeicherten Wert nicht (Feld rot).
interface Zeile { name: string; betrag: number; jahr: number }
const voll = (z: Zeile): boolean => z.betrag > 0 && z.jahr > 0;
const fehlt = (z: Zeile): string => `Rechnet noch nicht mit: ${z.betrag > 0 ? 'Jahr fehlt' : z.jahr > 0 ? 'Betrag fehlt' : 'Betrag und Jahr fehlen'}.`;
const entwurfRoh = (lesen<{ zuflussEntwurf: unknown }>('nachlass', { zuflussEntwurf: [] }).zuflussEntwurf);
const zeilen: Zeile[] = [
  ...(S.zufluesse ?? []).map((z) => ({ ...z })),
  ...(Array.isArray(entwurfRoh) ? entwurfRoh : []).filter((z) => z && typeof z === 'object').slice(0, MAX_ZUFLUESSE)
    .map((z: Record<string, unknown>) => ({ name: typeof z.name === 'string' ? z.name.slice(0, 60) : '', betrag: Math.round(zahl(z.betrag)), jahr: Number.isInteger(z.jahr) ? (z.jahr as number) : 0 }))
    .filter((z) => !voll(z)),
].slice(0, MAX_ZUFLUESSE);
let gespeichert = JSON.stringify((S.zufluesse ?? []));
function zuSichern(): void {
  const gueltig: Zufluss[] = zeilen.filter(voll).map((z) => ({ name: z.name, betrag: z.betrag, jahr: z.jahr }));
  // Entwurf: was noch nicht vollständig ist
  BBZ.set('nachlass', { ...lesen<object>('nachlass', {}), zuflussEntwurf: zeilen.filter((z) => !voll(z) && (z.name || z.betrag || z.jahr)) });
  // Haushalts-Stand nur schreiben, wenn sich die gültigen Zuflüsse geändert haben (kein Anlegen beim blossen Tippen)
  const neu = JSON.stringify(gueltig);
  if (neu === gespeichert) return;
  const H = haushaltLesen();
  if (gueltig.length) H.zufluesse = gueltig; else delete H.zufluesse;
  H.ui.edited = true;
  haushaltSchreiben(H);
  gespeichert = neu;
}
function zuZeigen(): void {
  $('naZufluesse').innerHTML = zeilen.length ? zeilen.map((z, i) => `<div class="fm-zeile" data-zeile="${i}">
      <input type="text" data-frei data-zf="name" maxlength="60" aria-label="Bezeichnung" placeholder="z. B. Erbschaft Eltern" value="${esc(z.name)}">
      <input type="text" inputmode="decimal" data-zf="betrag" aria-label="Betrag in CHF" placeholder="Betrag" value="${inFeld(z.betrag)}">
      <input type="text" inputmode="numeric" data-frei data-zf="jahr" aria-label="Jahr" placeholder="Jahr" value="${z.jahr > 0 ? z.jahr : ''}">
      <button type="button" class="bbz-button bbz-button--ghost sm" data-zf-weg aria-label="Zufluss entfernen">×</button>
    </div><p class="cap fm-entwurf" data-entwurf="${i}"${voll(z) ? ' hidden' : ''}>${fehlt(z)}</p>`).join('') : '<p class="cap">Noch keine Zuflüsse erfasst.</p>';
  ($('naZuPlus') as HTMLButtonElement).disabled = zeilen.length >= MAX_ZUFLUESSE;
}
$('naZuPlus').addEventListener('click', () => { zeilen.push({ name: '', betrag: 0, jahr: 0 }); zuZeigen(); $('naZufluesse').querySelector<HTMLInputElement>('.fm-zeile:last-of-type input')?.focus(); });
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
    // Jahr: leer = bewusst entfernt; ungültig (unvollständig getippt, Vergangenheit, über 2150) lässt den Wert stehen
    const t = el.value.trim(), n = Number(t), gueltig = /^\d{4}$/.test(t) && n >= jahr && n <= 2150;
    el.classList.toggle('bad', t !== '' && !gueltig && t.length >= 4);
    if (t === '') z.jahr = 0; else if (gueltig) z.jahr = n; else return;
  }
  // Hinweis der Zeile nachführen, ohne die Felder neu aufzubauen
  const hinweis = $('naZufluesse').querySelector<HTMLElement>(`[data-entwurf="${zeilen.indexOf(z)}"]`);
  if (hinweis) { hinweis.hidden = voll(z); hinweis.textContent = fehlt(z); }
  zuSichern();
});
// Feld verlassen mit ungültigem Jahr (z. B. «203»): Es gilt weiter der gespeicherte Wert, das Feld zeigt ihn wieder
$('naZufluesse').addEventListener('focusout', (ev) => {
  const el = ev.target as HTMLInputElement, z = zeilen[Number(el.closest<HTMLElement>('[data-zeile]')?.dataset.zeile)];
  if (!z || el.dataset.zf !== 'jahr') return;
  if (el.value.trim() !== (z.jahr > 0 ? String(z.jahr) : '')) { el.value = z.jahr > 0 ? String(z.jahr) : ''; el.classList.remove('bad'); }
});
tausender($('main'));
zeigen();
zuZeigen();
