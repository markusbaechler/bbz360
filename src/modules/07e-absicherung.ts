// ============================================================================
// 07e Absicherung (Zielbild Fusion, Phase 7): Invalidität und Tod je Person.
// Rechnet auf dem Haushalts-Stand (lib/absicherung.ts); Eingaben des Moduls
// liegen als `absicherung` in bbzData, die Kinderzahl als `familie_kinder`.
// ============================================================================
import '../styles/pension/bbz-fonts-embedded.css';
import '../styles/pension/bbz-base.css';
import '../styles/pension/bbz-components.css';
import '../styles/pension/styles.css';
import '../styles/modules/07c-pension.css'; // Topbar im Brand-Look
import '../styles/modules/fach.css';
import { BBZ } from '../lib/data';
import { GRUNDLAGEN, PK_LEER, absicherung } from '../lib/absicherung';
import type { AbsicherungEingaben, PkLeistungen } from '../lib/absicherung';
import { $, feld, inFeld, lesen, personName, start, tausender, zahlAus } from '../lib/fach-ui';
import { haushaltLesen } from '../lib/haushalt';
import { chf, esc } from '../lib/pension/format';

const { E } = start('07e');
const S = haushaltLesen();
const anzahl = S.haushalt === 'single' ? 1 : 2;

const roh = lesen<{ ursache: string; bedarfMonat: number; pk: Partial<PkLeistungen>[] }>('absicherung', { ursache: 'krankheit', bedarfMonat: 0, pk: [] });
const zahl = (v: unknown): number => (typeof v === 'number' && isFinite(v) && v > 0 ? v : 0);
const pkVon = (i: number): PkLeistungen => {
  const p = Array.isArray(roh.pk) ? roh.pk[i] ?? {} : {};
  return { ivRente: zahl(p.ivRente), partnerRente: zahl(p.partnerRente), kinderRente: zahl(p.kinderRente), todesfallKapital: zahl(p.todesfallKapital) };
};
// Zwei Angaben (ADR-22): alle Kinder (gemeinsam mit dem Nachlass) und davon die rentenberechtigten
const kinderAlle = Math.min(12, Math.round(zahl(BBZ.get('familie_kinder'))));
const ein: AbsicherungEingaben = {
  kinder: kinderAlle,
  kinderAbh: Math.min(kinderAlle, Math.round(zahl(BBZ.get('familie_kinder_abh')))),
  ursache: roh.ursache === 'unfall' ? 'unfall' : 'krankheit',
  bedarfMonat: zahl(roh.bedarfMonat),
  pk: [pkVon(0), pkVon(1)],
};
function sichern(): void {
  BBZ.merge({ absicherung: { ursache: ein.ursache, bedarfMonat: ein.bedarfMonat, pk: ein.pk }, familie_kinder: ein.kinder, familie_kinder_abh: ein.kinderAbh });
}

const PK_FELDER: [keyof PkLeistungen, string, string][] = [
  ['ivRente', 'Invalidenrente', 'bei voller Invalidität'],
  ['partnerRente', 'Ehegatten- oder Partnerrente', 'im Todesfall'],
  ['kinderRente', 'Kinder- bzw. Waisenrente je Kind', ''],
  ['todesfallKapital', 'Todesfallkapital (einmalig)', ''],
];
$('abPk').innerHTML = Array.from({ length: anzahl }, (_x, i) => `<div><p class="fm-lbl"><b>${esc(personName(i))}</b></p><div class="fm-felder">${PK_FELDER.map(([k, l, h]) =>
  `<div class="fm-feld"><label for="abPk_${i}_${k}">${l}</label><input type="text" inputmode="decimal" id="abPk_${i}_${k}" data-pk="${i}" data-k="${k}" autocomplete="off" value="${inFeld(ein.pk[i][k])}">${h ? `<small>${h}</small>` : ''}</div>`).join('')}</div></div>`).join('');
$('abGrundlagen').innerHTML = GRUNDLAGEN.map((t) => `<li>${t}</li>`).join('');
feld('abKinder').value = ein.kinder > 0 ? String(ein.kinder) : '';
feld('abKinderAbh').value = ein.kinderAbh > 0 ? String(ein.kinderAbh) : '';
feld('abBedarf').value = inFeld(ein.bedarfMonat);

const TITEL = { invalid: 'wird invalid', tod: 'stirbt' } as const;
function zeigen(): void {
  document.querySelectorAll<HTMLElement>('[data-ursache]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.ursache === ein.ursache)));
  const r = absicherung(S, E, ein);
  $('abBedarfHinweis').textContent = r.bedarfQuelle === 'eingabe' ? 'eigene Angabe'
    : r.bedarfQuelle === 'ausgaben' ? `leer = heutige Ausgaben, ${chf(r.bedarf / 12)} pro Monat`
      : `leer = 80% des Nettoeinkommens, ${chf(r.bedarf / 12)} pro Monat (Ausgaben heute im Budget erfassen)`;
  if (!r.faelle.length) { $('abFaelle').innerHTML = `<p class="fm-hinweis">${esc(r.hinweis)}</p>`; return; }
  $('abFaelle').innerHTML = r.faelle.map((f) => {
    const gedeckt = f.luecke <= 0;
    return `<article class="panel fm-panel" data-fall="${f.person}-${f.ereignis}">
      <h2>${esc(personName(f.person))} ${TITEL[f.ereignis]}.</h2>
      <div class="tblwrap"><table class="cmp fm-tab">
        <thead><tr><th>Pro Jahr</th><th>CHF</th></tr></thead>
        <tbody>${f.posten.map((p) => `<tr><td>${esc(p.label)}</td><td>${chf(p.betrag)}</td></tr>`).join('')}
          <tr class="tot"><td>Einnahmen</td><td>${chf(f.summe)}</td></tr>
          <tr><td>Bedarf</td><td>${chf(f.bedarf)}</td></tr>
          <tr class="tot luecke"><td>${gedeckt ? 'Überschuss' : 'Lücke'}</td><td data-st="${gedeckt ? 'gut' : 'schlecht'}">${chf(Math.abs(f.luecke))}</td></tr>
        </tbody></table></div>
      <p class="cap">${gedeckt ? 'Der Bedarf ist gedeckt.' : `Es fehlen ${chf(f.luecke / 12)} pro Monat.`}${f.kapital > 0 ? ` Dazu kommt einmalig ein Todesfallkapital von ${chf(f.kapital)}.` : ''}</p>
      ${f.hinweise.map((h) => `<p class="fm-hinweis">${esc(h)}</p>`).join('')}
    </article>`;
  }).join('');
}

document.querySelectorAll<HTMLElement>('[data-ursache]').forEach((b) => b.addEventListener('click', () => { ein.ursache = b.dataset.ursache === 'unfall' ? 'unfall' : 'krankheit'; sichern(); zeigen(); }));
/** Ganze Zahl 0 bis max aus einem Feld; null bei ungültiger Eingabe (Feld rot, Stand bleibt). */
function ganz(el: HTMLInputElement, max: number): number | null {
  const t = el.value.trim();
  const ok = t === '' || (/^\d{1,2}$/.test(t) && Number(t) <= max);
  el.classList.toggle('bad', !ok);
  return ok ? (t === '' ? 0 : Number(t)) : null;
}
feld('abKinder').addEventListener('input', () => {
  const n = ganz(feld('abKinder'), 12);
  if (n === null) return;
  ein.kinder = n;
  // «davon» kann nicht grösser sein als die Zahl aller Kinder
  if (ein.kinderAbh > n) { ein.kinderAbh = n; feld('abKinderAbh').value = n > 0 ? String(n) : ''; }
  feld('abKinderAbh').classList.remove('bad');
  sichern(); zeigen();
});
feld('abKinderAbh').addEventListener('input', () => {
  const n = ganz(feld('abKinderAbh'), ein.kinder);
  if (n === null) return;
  ein.kinderAbh = n; sichern(); zeigen();
});
feld('abBedarf').addEventListener('input', () => { const v = zahlAus(feld('abBedarf'), 100000); if (v === null) return; ein.bedarfMonat = v; sichern(); zeigen(); });
$('abPk').addEventListener('input', (ev) => {
  const el = ev.target as HTMLInputElement;
  if (el.dataset.pk == null) return;
  const v = zahlAus(el, 5e6);
  if (v === null) return;
  ein.pk[Number(el.dataset.pk)][el.dataset.k as keyof PkLeistungen] = v;
  sichern(); zeigen();
});
tausender($('main'));
void PK_LEER;
zeigen();
