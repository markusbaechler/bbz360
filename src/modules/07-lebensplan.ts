// ============================================================================
// 07 Lebensplan (Zielbild Fusion, Phase 5).
// Ein Bild und eine Rechnung ueber Ziele (06), Eigenheim (07a), Anlegen (07b)
// und Pensionierung (07c). Der Plan ist abgeleitet (lib/lebensplan.ts) und
// wird nicht gespeichert; gerechnet wird im Worker der Pensionierung.
// ============================================================================
import '../styles/pension/bbz-fonts-embedded.css';
import '../styles/pension/bbz-base.css';
import '../styles/pension/bbz-components.css';
import '../styles/pension/styles.css';
import '../styles/modules/07c-pension.css'; // Topbar im Brand-Look
import '../styles/modules/05b-budget.css';  // Hero und Fussnavigation
import '../styles/modules/07-lebensplan.css';
import grundlagen from '../../public/data/params.json';
import { BBZ } from '../lib/data';
import { mountNav } from '../lib/nav';
import { haushaltLesen } from '../lib/haushalt';
import { lebensplan, planBisJahr } from '../lib/lebensplan';
import type { PlanEintrag } from '../lib/lebensplan';
import { horizon } from '../lib/pension/analyse';
import type { AnalyseErgebnis, Auswertung } from '../lib/pension/analyse';
import type { Gesamtauswertung } from '../lib/pension/auswertung';
import { createEngine, monthOf } from '../lib/pension/engine';
import { chf, esc } from '../lib/pension/format';
import { resolveParams, nextParams } from '../lib/pension/params';
import { rechenEingaben } from '../lib/pension/themen';
import type { ParamDatei } from '../lib/pension/typen';
import { bildDaten, bildLegende, bildText, renderBild } from '../pension-ui/bild';

const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;

mountNav($('bbzNav'), { activeId: '07' });

const A0 = monthOf(), jahr = Math.floor(A0 / 12);
const daten = grundlagen as unknown as ParamDatei;
const E = createEngine(resolveParams(daten, jahr), A0, nextParams(daten, jahr));
const H = haushaltLesen();
// Planungshorizont wie im Rechenkern: Einträge danach können nicht gerechnet werden
const plan = lebensplan(BBZ.all(), H, jahr, { uws65: E.P.annahmen.uws65, bisJahr: planBisJahr(H, horizon(H, E)), A0 });

const WORT = { gruen: 'Reicht', gelb: 'Knapp', rot: 'Reicht nicht' } as const;
type Ampel = keyof typeof WORT;
const QUELLE: Record<PlanEintrag['quelle'], [string, string]> = {
  '06': ['06 Ziele & Wünsche', '06-ziele.html'],
  '07a': ['07a Finanzieren', '07a-finanzieren.html'],
  '07b': ['07b Anlegen', '07b-anlegen.html'],
  '07c': ['07c Pensionierung', '07c-pension.html'],
  '07f': ['07f Nachlass', '07f-nachlass.html'],
};

// ---------- Liste (braucht keine Rechnung) ----------
$('lpListe').innerHTML = plan.eintraege.map((e) => `<tr data-rechnet="${e.rechnet ? 'ja' : 'nein'}">
    <td><b>${esc(e.name)}</b><small>${esc(e.hinweis)}</small></td>
    <td>${e.jahr ?? 'offen'}</td>
    <td>${e.alter != null && e.alter >= 0 ? e.alter : '–'}</td>
    <td>${e.betrag != null ? chf(e.betrag) : '–'}</td>
    <td><a href="${QUELLE[e.quelle][1]}">${QUELLE[e.quelle][0]}</a></td>
    <td>${e.rechnet ? 'rechnet mit' : 'vorgemerkt'}</td>
  </tr>`).join('');

// ---------- Rechnung: der Plan und, zum Vergleich, die Pensionierung allein ----------
const kpi = (l: string, v: string, s: string): string => `<div class="kpi"><span class="l">${l}</span><span class="v">${v}</span><span class="s">${s}</span></div>`;
const pille = (st: Ampel): string => `<span class="pill" data-st="${st}">${WORT[st]}</span>`;
const reichweite = (r: Auswertung): string => (r.base.depleted != null ? `Vermögen aufgebraucht mit ${r.base.depleted}` : `reicht bis ${r.horizont}`);

function zeigen(R: Gesamtauswertung): void {
  const nur = R.varianten[0] as AnalyseErgebnis | null;
  if (R.leer) {
    $('lpKpis').innerHTML = kpi('Lebensplan', '–', 'Noch keine Rechnung');
    $('lpUrteilText').innerHTML = 'Für eine Rechnung fehlen die Ausgaben im Ruhestand. Erfassen Sie sie im <a href="05b-budget.html">Budget</a> oder in der <a href="07c-pension.html">Pensionierung</a>.';
  } else {
    const st = R.amp.st as Ampel;
    const wirksam = plan.eintraege.filter((e) => e.rechnet && e.abfluss !== 0);
    const ab = wirksam.reduce((x, e) => x + Math.max(0, e.abfluss), 0), zu = wirksam.reduce((x, e) => x + Math.max(0, -e.abfluss), 0);
    $('lpKpis').innerHTML = [
      kpi('Mit allen Zielen', pille(st), reichweite(R)),
      kpi('Nur Pensionierung', nur && !nur.leer ? pille(nur.amp.st as Ampel) : '–', nur && !nur.leer ? reichweite(nur) : ''),
      kpi('Tragbare Ausgaben pro Monat', chf(R.maxA), `geplant ${chf(plan.S.ausgabenRuhestand)}${nur && !nur.leer ? ` · ohne Ziele tragbar ${chf(nur.maxA)}` : ''}`),
      kpi('Ziele in der Rechnung', chf(ab), `Abflüsse aus Zielen und Eigenmitteln${zu > 0 ? ` · Zuflüsse ${chf(zu)}` : ''}`),
    ].join('');
    const vorgemerkt = plan.eintraege.filter((e) => !e.rechnet).length;
    $('lpUrteilText').textContent = (nur && !nur.leer && nur.amp.st !== st
      ? `Mit den Zielen ändert das Urteil von «${WORT[nur.amp.st as Ampel]}» auf «${WORT[st]}».`
      : 'Die Ziele ändern das Urteil der Pensionierung nicht.')
      + (vorgemerkt ? ` ${vorgemerkt} ${vorgemerkt === 1 ? 'Eintrag ist' : 'Einträge sind'} vorgemerkt und nicht gerechnet (siehe Liste).` : '');
  }
  // Bild: Marken für alles, was aus 06/07a/07b mitrechnet; Fragezeichen für Vorgemerktes mit Jahr
  const d = bildDaten(plan.S, R, E);
  const kurz = (t: string): string => (t.length > 22 ? `${t.slice(0, 21)}…` : t);
  // Lage auf der Altersachse von Person 1: Januar des Jahres (laufendes Jahr: heute)
  const p1 = plan.S.personen[0];
  for (const e of plan.eintraege) {
    if (e.quelle === '07c' || e.jahr == null) continue;
    const x = Math.max(d.a0, e.jahr - p1.jahrgang - (p1.geburtsmonat - 1) / 12);
    if (x > d.xEnd) continue;
    if (e.rechnet) d.marken.push({ alter: x, text: kurz(e.name), art: 'ziel' });
    else if (e.jahr >= jahr) d.pins.push({ alter: x, text: kurz(e.name) });
  }
  $('lpBildKopf').innerHTML = bildLegende(d);
  $('lpBildText').textContent = bildText(d);
  renderBild($('lpBild'), d, { frei: 460 });
}

document.body.setAttribute('aria-busy', 'true');
const worker = new Worker(new URL('../pension-ui/worker.ts', import.meta.url), { type: 'module' });
worker.onmessage = (ev: MessageEvent<{ id: number; R?: Gesamtauswertung; error?: string }>) => {
  document.body.removeAttribute('aria-busy');
  if (ev.data.error || !ev.data.R) { console.error(ev.data.error); $('lpFehler').hidden = false; return; }
  zeigen(ev.data.R);
};
worker.onerror = (e) => { console.error(e); document.body.removeAttribute('aria-busy'); $('lpFehler').hidden = false; };
worker.postMessage({ id: 1, S: rechenEingaben(plan.S), params: daten, A0, stopA: undefined, varianten: [rechenEingaben(H)] });
