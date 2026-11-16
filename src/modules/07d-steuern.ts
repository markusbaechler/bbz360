// ============================================================================
// 07d Steuern (Zielbild Fusion, Phase 6): Kapitalbezüge staffeln, Abzüge,
// Vermögenssteuer. Rechnet auf dem Haushalts-Stand; Eingaben des Moduls liegen
// als `steuern` in bbzData.
// ============================================================================
import '../styles/pension/bbz-fonts-embedded.css';
import '../styles/pension/bbz-base.css';
import '../styles/pension/bbz-components.css';
import '../styles/pension/styles.css';
import '../styles/modules/07c-pension.css'; // Topbar im Brand-Look
import '../styles/modules/fach.css';
import { BBZ } from '../lib/data';
import { $, feld, inFeld, kpi, lesen, personName, rechne, start, tausender, themenListe, zahlAus } from '../lib/fach-ui';
import { STEUER_THEMEN } from '../lib/fach-themen';
import { haushaltLesen } from '../lib/haushalt';
import { abzugErsparnis, kapitalStaffelung } from '../lib/steuern';
import type { Auswertung } from '../lib/pension/analyse';
import { chf, esc } from '../lib/pension/format';

const { E, A0, daten } = start('07d');
const S = haushaltLesen();
const paar = S.haushalt !== 'single';

interface Eingaben { grenzsatz: number; einkauf: number; einkaufJahr: number }
// Gespeicherte Werte prüfen (ein importierter Stand kann alles enthalten)
const roh = lesen<Partial<Eingaben>>('steuern', {});
const imBereich = (v: unknown, max: number): number => (typeof v === 'number' && isFinite(v) && v > 0 && v <= max ? v : 0);
const ein: Eingaben = {
  grenzsatz: imBereich(roh.grenzsatz, 60),
  einkauf: Math.round(imBereich(roh.einkauf, 5e6)),
  einkaufJahr: Number.isInteger(roh.einkaufJahr) && (roh.einkaufJahr as number) >= 2000 && (roh.einkaufJahr as number) <= 2100 ? (roh.einkaufJahr as number) : 0,
};
const sichern = (): void => { BBZ.set('steuern', { ...lesen<object>('steuern', {}), grenzsatz: ein.grenzsatz, einkauf: ein.einkauf, einkaufJahr: ein.einkaufJahr }); };


themenListe($('stThemen'), document.getElementById('stNotiz') as HTMLTextAreaElement, 'steuern', STEUER_THEMEN);

// ---------- Vermögenssteuer heute (ohne Rechnung im Worker) ----------
{
  const v = E.vermSteuerHeute(S);
  $('stVermKpis').innerHTML = kpi('Reinvermögen steuerbar', chf(v.rein), 'freies Vermögen und Liegenschaften abzüglich Hypotheken')
    + kpi('Vermögenssteuer pro Jahr', chf(v.steuer), v.rein > 0 ? `${v.promille.toFixed(2)}‰ des Reinvermögens` : '');
  $('stVermText').textContent = v.eigen ? 'Gerechnet mit dem in der Pensionierung erfassten eigenen Satz.' : `Tarif ${v.ort ?? 'Kantonshauptort'} (${S.kanton}), Steuerjahr ${v.steuerjahr ?? '–'}.`;
}

// ---------- Kapitalbezüge und Abzüge ----------
let R: Auswertung | null = null;
function zeigeAbzuege(): void {
  const a = abzugErsparnis(S, E, R, ein.grenzsatz > 0 ? ein.grenzsatz : '', ein.einkauf, ein.einkaufJahr > 0 ? ein.einkaufJahr : '');
  const ohne = 'Grenzsteuersatz erfassen';
  $('stAbzKpis').innerHTML = kpi('Säule 3a pro Jahr', chf(a.s3aSumme), a.s3a.length > 1 ? a.s3a.map((v, i) => `${esc(personName(i))} ${chf(v)}`).join(' · ') : a.s3aSumme > 0 ? 'Einzahlung laut Pensionierung' : 'ohne Erwerbseinkommen keine Einzahlung')
    + kpi('Ersparnis 3a pro Jahr', a.s3aErsparnis != null ? chf(a.s3aErsparnis) : '–', a.s3aErsparnis != null ? `bei ${ein.grenzsatz}% Grenzsteuersatz` : ohne, a.s3aErsparnis != null && a.s3aErsparnis > 0 ? 'gut' : '')
    + kpi('Ersparnis PK-Einkauf', a.einkaufErsparnis != null ? chf(a.einkaufErsparnis) : '–', a.einkaufErsparnis != null ? `einmalig auf ${chf(ein.einkauf)}` : ein.einkauf > 0 ? ohne : 'Einkauf erfassen', a.einkaufErsparnis != null ? 'gut' : '');
  const sp = $('stSperre');
  sp.hidden = a.sperrfristBis == null;
  if (a.sperrfristBis != null) {
    sp.dataset.st = a.sperrfristVerletzt ? 'schlecht' : '';
    sp.textContent = a.sperrfristVerletzt
      ? `Sperrfrist: Nach einem Einkauf darf der eingekaufte Betrag drei Jahre lang nicht als Kapital bezogen werden. Der Plan sieht ${a.sperrfristJahre.join(' und ')} einen Kapitalbezug aus der Pensionskasse vor; das liegt innerhalb von drei Jahren nach einem Einkauf ${ein.einkaufJahr} oder kann je nach Datum des Einkaufs hineinfallen. Der Abzug kann dann verweigert werden.`
      : `Sperrfrist: drei Jahre ab dem Einkauf, je nach Datum bis ${a.sperrfristBis}. In dieser Zeit darf der eingekaufte Betrag nicht als Kapital bezogen werden; der Plan sieht bis dahin keinen Kapitalbezug aus der Pensionskasse vor.`;
  }
}
function zeigeKapital(): void {
  if (!R) {
    $('stKapKpis').innerHTML = kpi('Kapitalbezüge', '–', 'Noch keine Rechnung');
    $('stKapText').innerHTML = 'Für die Rechnung fehlen die Ausgaben im Ruhestand. Erfassen Sie sie im <a href="05b-budget.html">Budget</a> oder in der <a href="07c-pension.html">Pensionierung</a>.';
    return;
  }
  const k = kapitalStaffelung(R, S, E);
  $('stKapOrt').textContent = `Kanton ${S.kanton}, ${S.haushalt === 'verheiratet' ? 'gemeinsam besteuert' : 'je Person besteuert'}; Beträge in heutiger Kaufkraft.`;
  if (!k.jahre.length) {
    $('stKapKpis').innerHTML = kpi('Kapitalbezüge', chf(0), 'Der Plan sieht keine Kapitalbezüge vor');
    $('stKapText').textContent = '';
    return;
  }
  $('stKapKpis').innerHTML = kpi('Steuer wie geplant', chf(k.steuerGeplant), `auf ${chf(k.total)} in ${k.jahre.length} ${k.jahre.length === 1 ? 'Jahr' : 'Jahren'}`)
    + kpi('Alles im selben Jahr', chf(k.steuerEinJahr), k.steuerEinJahr - k.steuerGeplant > 1 ? `${chf(k.steuerEinJahr - k.steuerGeplant)} mehr als geplant` : 'wie geplant', k.steuerEinJahr - k.steuerGeplant > 1 ? 'schlecht' : '')
    + kpi('Jeder Bezug einzeln', chf(k.steuerEinzeln), k.steuerGeplant - k.steuerEinzeln > 1 ? `${chf(k.steuerGeplant - k.steuerEinzeln)} weniger als geplant` : 'wie geplant', k.steuerGeplant - k.steuerEinzeln > 1 ? 'gut' : '');
  const mehrfach = k.jahre.filter((j) => j.bezuege.length > 1);
  $('stKapText').textContent = mehrfach.length
    ? `In ${mehrfach.map((j) => j.jahr).join(', ')} fallen mehrere Bezüge ins selbe Jahr und werden zusammen besteuert. Eine Verteilung auf verschiedene Jahre senkt die Steuer.`
    : 'Die geplanten Bezüge liegen bereits in verschiedenen Jahren.';
  $('stKapListe').innerHTML = k.jahre.map((j) => `<tr><td>${j.jahr}</td><td>${j.bezuege.map((x) => `${esc(x.art)}${paar ? ` (${esc(personName(x.person))})` : ''}: ${chf(x.betrag)}`).join('<br>')}</td><td>${chf(j.betrag)}</td><td>${chf(j.steuer)}</td></tr>`).join('')
    + `<tr class="tot"><td>Total</td><td></td><td>${chf(k.total)}</td><td>${chf(k.steuerGeplant)}</td></tr>`;
}

feld('stGrenz').value = inFeld(ein.grenzsatz, true);
feld('stEinkauf').value = inFeld(ein.einkauf);
feld('stEinkaufJahr').value = ein.einkaufJahr > 0 ? String(ein.einkaufJahr) : '';
feld('stGrenz').addEventListener('input', () => { const v = zahlAus(feld('stGrenz'), 60, true); if (v === null) return; ein.grenzsatz = v; sichern(); zeigeAbzuege(); });
feld('stEinkauf').addEventListener('input', () => { const v = zahlAus(feld('stEinkauf'), 5e6); if (v === null) return; ein.einkauf = v; sichern(); zeigeAbzuege(); });
feld('stEinkaufJahr').addEventListener('input', () => {
  const el = feld('stEinkaufJahr'), t = el.value.trim(), n = Number(t);
  const ok = t === '' || (/^\d{4}$/.test(t) && n >= 2000 && n <= 2100);
  el.classList.toggle('bad', !ok);
  if (!ok) return;
  ein.einkaufJahr = t === '' ? 0 : n; sichern(); zeigeAbzuege();
});
tausender($('main'));

zeigeAbzuege();
rechne(S, daten, A0, (r) => {
  if (!r) { $('fmFehler').hidden = false; return; }
  R = r.leer ? null : r;
  zeigeKapital();
  zeigeAbzuege();
});
