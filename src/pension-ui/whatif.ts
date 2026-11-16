// «Sofort aufhören?» – Was wäre, wenn …: Regler für den letzten Arbeitstag, Ziel grüne Ampel.
// Gemeinsamer Baustein für Tutor und Resultatansicht.
// Zustand: S.ui.stopY / S.ui.stopM = letzter Arbeitsmonat (ohne Wert: sofort, d. h. Ende des laufenden Monats),
// S.ui.stopWer = wer früher aufhört (0, 1 oder 'alle'; bei Paaren standardmässig Person 1).
import { ruhigeRegler } from './slider';
import { chf } from '../lib/pension/format';
import { stopWerOf } from '../lib/pension/analyse';
import type { Auswertung, SimPerson } from '../lib/pension/analyse';
import type { PensState } from '../lib/pension/typen';
import type { App } from './app';

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
export const fmtMonat = (A: number) => `${MONATE[((A % 12) + 12) % 12]} ${Math.floor(A / 12)}`;
const ST: Record<string, string> = { gruen: 'Reicht', gelb: 'Knapp', rot: 'Reicht nicht' };
const aTxt = (x: number) => { const y = Math.floor(x + 1e-6), mo = Math.round((x - y) * 12); return mo ? `${y} Jahren und ${mo} Monat${mo > 1 ? 'en' : ''}` : `${y} Jahren`; };
const dauer = (m: number) => { const y = Math.floor(m / 12), r = m % 12; return [y ? `${y} Jahr${y > 1 ? 'e' : ''}` : '', r ? `${r} Monat${r > 1 ? 'e' : ''}` : ''].filter(Boolean).join(' und '); };
const persons = (s: PensState) => s.personen.slice(0, s.haushalt === 'single' ? 1 : 2);
const pn = (i: number) => `Person ${i + 1}`;

/** Bereich des Reglers: letzter Arbeitsmonat von «sofort» (laufender Monat) bis «wie geplant». */
export function stopInfo(app: App) {
  const s = app.S, e = app.E, wer = stopWerOf(s), ps = persons(s);
  const sel = wer == null ? ps : [ps[wer]];
  const plan = Math.max(...sel.map((p) => e.abAlter(p, p.pensAlter)));
  const min = e.A0, max = Math.max(min, plan - 1);
  const cur = s.ui.stopY && s.ui.stopM ? Math.min(max, Math.max(min, s.ui.stopY * 12 + s.ui.stopM - 1)) : min;
  return { min, max, cur, plan, wer, cpl: ps.length > 1, kein: max <= min };
}

export function setStop(app: App, L: number) {
  const { min, max } = stopInfo(app), v = Math.max(min, Math.min(max, Math.round(L)));
  if (v <= min) { app.S.ui.stopY = null; app.S.ui.stopM = null; }
  else { app.S.ui.stopY = Math.floor(v / 12); app.S.ui.stopM = (v % 12) + 1; }
  app.stopChanged();
  return v;
}

const label = (app: App, L: number) => (L <= app.E.A0 ? `Sofort, Ende ${fmtMonat(L)}` : `Ende ${fmtMonat(L)}`);
const pct = (L: number, min: number, max: number) => (max > min ? ((L - min) / (max - min)) * 100 : 0);

/** Regler mit Wer-Auswahl, Ziel-Markierung (frühester Zeitpunkt mit grüner Ampel) und Schnellwahl. */
// Der Regler erscheint im Tutor und im Ergebnis: jede Ausgabe erhält eine eigene id
let ridNr = 0;
export function ctrlHtml(app: App) {
  const rid = `wiRange${++ridNr}`;
  const { min, max, cur, plan, wer, cpl, kein } = stopInfo(app), R = app.R;
  const werSel = cpl
    ? `<div class="wi-wer" role="radiogroup" aria-label="Wer hört früher auf?"><span class="wi-lbl" aria-hidden="true">Wer hört früher auf?</span><div class="wi-opts">${[[0, 'Person 1 (Sie)'], [1, 'Person 2'], ['alle', 'Beide']].map(([k, l]) => `<button type="button" role="radio" data-wi-wer="${k}" aria-checked="${(k === 'alle' ? wer == null : wer === k)}">${l}</button>`).join('')}</div></div>`
    : '';
  if (kein) {
    return `<div class="wi-ctrl">${werSel}<p class="wi-kein">${cpl && wer != null ? pn(wer) : 'Sie'} ${cpl && wer != null ? 'ist' : 'sind'} laut Plan bereits pensioniert oder hört diesen Monat auf. Hier gibt es nichts mehr vorzuziehen.</p></div>`;
  }
  // Ziel nur zeigen, wenn das Resultat zur aktuellen Auswahl gehört
  const fits = R && !R.leer && R.so.wer === wer;
  const ab = fits && R.so.ab != null ? R.so.ab - 1 : null;
  const goalPos = ab != null && ab >= min && ab <= max ? pct(ab, min, max) : null;
  const p = pct(cur, min, max);
  return `<div class="wi-ctrl">${werSel}
    <div class="wi-head"><label for="${rid}">Letzter Arbeitstag${cpl && wer != null ? ` von ${pn(wer)}` : cpl ? ' für beide' : ''}</label><output class="wi-val" data-wi-val for="${rid}">${label(app, cur)}</output></div>
    <div class="wi-track">
      <input type="range" id="${rid}" data-wi-range min="${min}" max="${max}" step="1" value="${cur}" style="--p:${p.toFixed(2)}%" aria-valuetext="${label(app, cur)}">
      ${goalPos != null ? `<span class="wi-goal${goalPos > 70 ? ' wi-goal--end' : ''}" style="left:${goalPos.toFixed(2)}%" aria-hidden="true"><span>ab hier grün</span></span>` : ''}
    </div>
    <div class="wi-scale"><span>sofort</span><span>wie geplant: Ende ${fmtMonat(plan - 1)}</span></div>
    <div class="wi-chips" role="group" aria-label="Schnellwahl">
      <button type="button" data-wi-set="min">Sofort</button>
      ${max - min > 12 ? '<button type="button" data-wi-set="12">In einem Jahr</button>' : ''}
      ${ab != null && ab > min ? '<button type="button" class="wi-goalchip" data-wi-set="ab"><i aria-hidden="true"></i>Frühester grüner Zeitpunkt</button>' : ''}
      <button type="button" data-wi-set="max">Wie geplant</button>
    </div>
  </div>`;
}

/** Wer hört wann auf (aus dem gerechneten Szenario). */
function werText(app: App) {
  const R = app.R as Auswertung, so = R.so, e = app.E, ps = so.now.base.ps, L = (R.stopA ?? e.A0 + 1) - 1;
  const wann = L <= e.A0 ? `sofort (Ende ${fmtMonat(L)})` : `Ende ${fmtMonat(L)}`;
  if (ps.length === 1) return `Sie hören ${wann} auf, mit ${aTxt(ps[0].stopAlter)}.`;
  const rest = (i: number) => {
    const p = ps[i];
    return p.Aret <= e.A0 ? `${pn(i)} ist bereits pensioniert.` : `${pn(i)} arbeitet wie geplant bis Ende ${fmtMonat(p.Aret - 1)}.`;
  };
  if (so.wer != null) return `${pn(so.wer)} hört ${wann} auf, mit ${aTxt(ps[so.wer].stopAlter)}. ${rest(1 - so.wer)}`;
  const stopA = L + 1, frueher = ps.map((p, i): [SimPerson, number] => [p, i]).filter(([p]) => p.Aret < stopA);
  if (!frueher.length) return `Beide hören ${wann} auf: Person 1 mit ${aTxt(ps[0].stopAlter)}, Person 2 mit ${aTxt(ps[1].stopAlter)}.`;
  const andere = ps.map((p, i): [SimPerson, number] => [p, i]).filter(([p]) => p.Aret >= stopA);
  return `${andere.map(([p, i]) => `${pn(i)} hört ${wann} auf, mit ${aTxt(p.stopAlter)}.`).join(' ')} ${frueher.map(([p, i]) => (p.Aret <= e.A0 ? `${pn(i)} ist bereits pensioniert.` : `${pn(i)} geht wie geplant schon Ende ${fmtMonat(p.Aret - 1)} in Pension.`)).join(' ')}`.trim();
}

function satzText(app: App) {
  const R = app.R as Auswertung, so = R.so, cpl = app.S.haushalt !== 'single', dep = so.now.base.depleted, st = so.now.st;
  const alt = cpl ? ' (Alter Person 1)' : '';
  if (dep != null && so.now.lgRot) return `Knapp: Das freie Vermögen ist mit ${dep}${alt} aufgebraucht, die Liegenschaft deckt die Lücke.`;
  if (dep != null) return so.now.base.depletedBeforeRet ? 'Das Geld reicht schon vor dem Ausstieg nicht.' : `Das Geld ist mit ${dep}${alt} aufgebraucht.`;
  if (st === 'gruen') return `Das Geld reicht bis ${R.horizont}${alt}, auch im Stresstest.`;
  return so.now.stress.depleted != null ? `Knapp: Im Stresstest ist das Geld mit ${so.now.stress.depleted}${alt} aufgebraucht.` : 'Knapp: Am Schluss bleibt weniger als die Reserve.';
}

function zielText(app: App, html = true) {
  const R = app.R as Auswertung, so = R.so, e = app.E, st = so.now.st, L = (R.stopA ?? e.A0 + 1) - 1;
  const b = (t: string) => (html ? `<b>${t}</b>` : t);
  if (so.ab == null) return `${b('Vor dem geplanten Termin wird die Ampel nicht grün.')} Ansatzpunkte: tiefere Ausgaben oder mehr Erspartes.`;
  const abL = so.ab - 1;
  // Spielraum gegenüber dem Plan; bei «Beide» für jede Person einzeln
  let frueh = '';
  const ps = persons(app.S);
  if (so.wer == null && ps.length > 1) {
    const d = ps.map((p, i): [number, number] => [i, e.abAlter(p, p.pensAlter) - so.ab!]).filter(([, m]) => m > 0);
    if (d.length) frueh = `, für ${d.map(([i, m]) => `${pn(i)} ${dauer(m)}`).join(' und ')} vor dem Plan`;
  } else if (so.plan - so.ab > 0) frueh = `, ${dauer(so.plan - so.ab)} vor dem Plan`;
  if (st === 'gruen') {
    if (L === abL || (abL <= e.A0 && L <= e.A0)) return `${b('Geschafft.')} Das ist der früheste Zeitpunkt mit grüner Ampel${frueh}.`;
    if (L > abL) return `${b('Geschafft.')} Die Ampel bliebe auch bei einem früheren Ausstieg grün, frühestens ${abL <= e.A0 ? 'ab sofort' : `Ende ${fmtMonat(abL)}`}${frueh}.${html ? ' Gerechnet und im Bild gezeigt ist der Zeitpunkt des Reglers; schieben Sie ihn, um einen früheren Ausstieg zu sehen.' : ''}`;
    return `${b('Geschafft.')} Zu diesem Zeitpunkt reicht das Geld.`;
  }
  return `${b('Ziel grüne Ampel:')} frühestens mit letztem Arbeitstag ${abL <= e.A0 ? 'sofort' : `Ende ${fmtMonat(abL)}`}${frueh}.${html ? ' Tippen Sie auf «Frühester grüner Zeitpunkt».' : ''}`;
}

/** Was fehlt, damit es reicht. full: ausführlich (Resultatansicht). */
function gapHtml(app: App, full: boolean) {
  const R = app.R as Auswertung, s = app.S, st = R.so.now.st, L = R.lk, H = R.horizont;
  if (!L || st === 'gruen') return '';
  if (!full) {
    return `<div class="gap">${L.liq != null && L.liq > 1000 ? `<div><span class="l">Fehlendes Kapital heute</span><span class="v">${chf(L.liq)}</span><span class="s">damit es zu diesem Zeitpunkt reicht</span></div>` : ''}<div><span class="l">Oder Ausgaben pro Monat</span><span class="v">${chf(L.ausg)}</span><span class="s">statt ${chf(s.ausgabenRuhestand)}</span></div></div>`;
  }
  const lang = L.liq != null ? Math.max(0, L.liq - L.bridge!) : null, diff = s.ausgabenRuhestand - L.ausg;
  const zus = L.total != null ? L.total : L.liq, resOnly = !(L.liq! > 1000) && zus! > 1000;
  const fixM = R.wohnen.v + R.uebrigeFix, frei = L.ausg - fixM;
  return `<h4 class="gh">Was fehlt, damit es ohne Liegenschaft reicht?</h4><div class="gap">
    ${L.liq != null && L.liq > 1000 ? `<div><span class="l">Fehlendes Kapital heute</span><span class="v">${chf(L.liq)}</span><span class="s">damit das Geld bis ${H} reicht${L.bridge! > 1000 && lang! > 1000 ? `; davon ${chf(L.bridge!)} Überbrückung bis ${L.bridgeDatum}, ${chf(lang!)} danach` : L.bridge! > 1000 ? ` (Überbrückung bis ${L.bridgeDatum})` : ''}</span></div>` : ''}
    ${L.liq == null ? '<div><span class="l">Fehlendes Kapital heute</span><span class="v">über CHF 10 Mio.</span><span class="s">mit Kapital allein nicht lösbar</span></div>' : ''}
    ${zus != null && zus > (L.liq || 0) + 1000 ? `<div><span class="l">${resOnly ? 'Fehlende Reserve' : 'Mit Reserve'}</span><span class="v">${chf(zus)}</span><span class="s">damit am Horizont zusätzlich ${s.reserveJahre} Jahresausgaben übrig bleiben</span></div>` : ''}
    <div><span class="l">Oder Ausgaben senken um</span><span class="v">${chf(Math.max(0, diff))}</span><span class="s">pro Monat, von ${chf(s.ausgabenRuhestand)} auf ${chf(L.ausg)}${s.reserveJahre > 0 ? ', inkl. Reserve' : ''}</span></div>
    <div><span class="l">Zur Verfügung pro Monat</span><span class="v">${chf(L.ausg)}</span><span class="s">${frei > 0 ? `davon nach Fixkosten (${chf(fixM)}) frei für Lebensunterhalt, Freizeit und Reisen: ${chf(frei)}` : `deckt die Fixkosten von ${chf(fixM)} nicht`}</span></div>
  </div><p class="cap">Heutige Kaufkraft, ohne Steuern. Fehlendes Kapital = Betrag, der heute zusätzlich vorhanden sein müsste (angelegt wie das übrige Vermögen). Kapital oder tiefere Ausgaben sind Alternativen, nicht zu addieren.${L.depDatum ? ` Ohne Massnahmen ist das Geld ab ${L.depDatum} aufgebraucht.` : ''}</p>`;
}

/** Ampel, Aussage, Wer/Wann, Ziel und Lücke. full: ausführliche Lücke für die Resultatansicht. */
export function summaryHtml(app: App, full = false) {
  const R = app.R;
  if (!R || R.leer) return '<p>Für diese Rechnung fehlen noch die Ausgaben im Ruhestand.</p>';
  const so = R.so, st = so.now.st, dep = so.now.base.depleted, P = app.P;
  const stoppen = so.now.base.ps.filter((_p, i) => so.wer == null || so.wer === i);
  const minAlter = Math.min(...stoppen.map((p) => p.minAlter || P.bvg.minAlter));
  const grund = dep != null && stoppen.some((p) => p.stopAlter < (p.minAlter || P.bvg.minAlter))
    ? `<p class="cap">Warum? Wer vor ${minAlter} aufhört, erhält noch keine PK-Rente. Das Guthaben kommt auf ein Freizügigkeitskonto und ist wie die Säule 3a erst ${P.vorsorge.bezugJahreVorRef} Jahre vor dem AHV-Referenzalter verfügbar. Bis dahin zahlt alles das Ersparte.</p>` : '';
  return `<div class="wi-result" data-st="${st}">
      <div class="lamp" data-st="${st}" aria-hidden="true"><i></i><i></i><i></i></div>
      <div class="wi-rtxt"><span class="pill" data-st="${st}">${ST[st]}</span><p class="wi-satz">${satzText(app)}</p><p class="wi-wer-txt">${werText(app)}</p></div>
    </div>
    <p class="wi-goaltxt${st === 'gruen' ? ' wi-ok' : ''}">${zielText(app)}</p>${gapHtml(app, full)}${grund}`;
}

/** Klartext für den PDF-Bericht. */
export function reportText(app: App) {
  const R = app.R;
  if (!R || R.leer) return '';
  return `${werText(app)} ${ST[R.so.now.st]}: ${satzText(app)} ${zielText(app, false)}`;
}

/** Ereignisse für Wer-Auswahl, Regler und Schnellwahl in einem Container. */
export function bindWhatIf(root: HTMLElement, app: App, onMove?: (v: number) => void) {
  ruhigeRegler(root);
  const move = (L: number) => {
    const v = setStop(app, L), { min, max } = stopInfo(app);
    root.querySelectorAll('[data-wi-val]').forEach((o) => { o.textContent = label(app, v); });
    const r = root.querySelector<HTMLInputElement>('[data-wi-range]');
    if (r) { r.value = String(v); r.setAttribute('aria-valuetext', label(app, v)); r.style.setProperty('--p', `${pct(v, min, max).toFixed(2)}%`); }
    root.querySelectorAll('.wi-body, [data-live="sofort"]').forEach((b) => b.setAttribute('aria-busy', 'true'));
    onMove?.(v);
  };
  root.addEventListener('input', (ev) => { if ((ev.target as HTMLInputElement).matches('[data-wi-range]')) move(+(ev.target as HTMLInputElement).value); });
  root.addEventListener('click', (ev) => {
    const w = (ev.target as HTMLElement).closest<HTMLElement>('[data-wi-wer]');
    if (w) {
      const k = w.dataset.wiWer;
      app.S.ui.stopWer = k === 'alle' ? 'alle' : +k! as 0 | 1;
      // Zeitpunkt behalten, aber auf den neuen Bereich begrenzen; Regler neu aufbauen
      move(stopInfo(app).cur);
      const box = w.closest('.wi-ctrlbox');
      if (box) { box.innerHTML = ctrlHtml(app); box.querySelector<HTMLElement>(`[data-wi-wer="${k}"]`)?.focus(); }
      return;
    }
    const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-wi-set]');
    if (!b) return;
    const { min, max } = stopInfo(app), R = app.R as Auswertung | null, k = b.dataset.wiSet;
    const L = k === 'min' ? min : k === 'max' ? max : k === 'ab' ? (R?.so?.ab ?? max + 1) - 1 : min + +k!;
    move(L);
  });
}
