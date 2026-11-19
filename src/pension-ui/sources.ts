// Panel «Grundlagen und Quellen»: alle gesetzlichen Werte mit Gültigkeit, Quellen und Prüfstatus.
import { paramOverview } from '../lib/pension/params';
import { nf, chf, dec, esc } from '../lib/pension/format';
import type { PruefDatei, PruefStand } from '../lib/pension/params';
import type { ParamQuelle } from '../lib/pension/typen';
import type { App } from './app';

type ParamZeile = ReturnType<typeof paramOverview>[number];

const GROUPS = [
  ['ahv.', 'AHV-Renten'],
  ['ne.', 'AHV-Beiträge Nichterwerbstätige'],
  ['s3a.', 'Säule 3a'],
  ['bvg.', 'Berufliche Vorsorge'],
  ['vorsorge.', 'Berufliche Vorsorge'],
  ['le65.', 'Lebenserwartung'],
  ['kk.', 'Krankenkasse'],
];

function fmtVal(p: Pick<ParamZeile, 'unit' | 'key'>, v: any) {
  if (v == null) return '–';
  if (p.unit === 'CHF/Monat') return chf(v) + ' / Mt.';
  if (p.unit === 'CHF/Jahr') return chf(v) + ' / Jahr';
  if (p.unit === 'CHF') return chf(v);
  if (p.unit === 'Anteil') return dec(v * 100) + '%';
  if (p.key.endsWith('varTief')) return '13/600';
  if (p.key.endsWith('varHoch')) return '8/600';
  if (p.unit === '× Minimalrente') return dec(v * 100, 0) + '%';
  if (p.unit === 'Jahre') return dec(v, Number.isInteger(v) ? 0 : 1) + ' Jahre';
  return nf.format(v) + (p.unit && p.unit !== 'Renten' ? ' ' + p.unit : '');
}

const dateCH = (iso: any) => (iso ? new Date(iso).toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '–');

function badge(v: PruefStand | undefined, kind: string | undefined, ok: (c: PruefStand | undefined) => boolean) {
  if (kind === 'annahme') return '<span class="vb a">Annahme</span>';
  if (!v) return '<span class="vb n" title="Noch nicht automatisch geprüft">ungeprüft</span>';
  const t = `${v.confirmed}/${v.total} Quellen`;
  // Amtliche Statistik: Die Tabelle stammt aus der ESTV-Schnittstelle und wird mit ihr abgeglichen (keine zweite Quelle)
  if (kind === 'amtlich') {
    const api = (v.sources || []).find((x: any) => x.id === 'estv-kapital' || x.id === 'estv-vermoegen');
    return api?.ok ? '<span class="vb ok" title="Stimmt mit der ESTV-Statistik überein">✓ mit ESTV abgeglichen</span>' : '<span class="vb mid" title="Abgleich mit der ESTV-Statistik steht aus oder weicht ab">Abgleich offen</span>';
  }
  if (ok(v)) return `<span class="vb ok" title="Automatisch bestätigt: mindestens zwei Quellen, davon eine amtliche, laufend nachgeführte">✓ ${t}</span>`;
  if (v.confirmed >= 1) return `<span class="vb mid" title="${v.confirmed >= 2 ? 'Keine Quelle, die amtlich ist und laufend nachgeführt wird, bestätigt den Wert' : 'Nur eine Quelle bestätigt den Wert'}">${t}</span>`;
  return `<span class="vb bad" title="Keine Quelle bestätigt den Wert">${t}</span>`;
}

export function renderSources(app: App) {
  const el = document.getElementById('sources');
  if (!el) return;
  const data = app.params, ver = (app.verification || {}) as PruefDatei & { alerts?: string[] }, jahr = app.P.meta.jahr;
  const items = paramOverview(data, jahr);
  const groups = new Map<string | null, ParamZeile[]>();
  items.forEach((it) => {
    const g = (GROUPS.find(([pre]) => it.key.startsWith(pre)) || [null, 'Weitere'])[1];
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(it);
  });
  // Prüfstatus für den Wert, der im Rechnungsjahr gilt
  const vp = Object.fromEntries(items.map((i) => {
    const v = (ver.params || {})[i.key];
    const y = v?.byYear?.[i.gueltigAb!];
    return [i.key, y ? { ...y, checkedAt: v.checkedAt } : v];
  }));
  const all = items.filter((i) => i.kind === 'gesetz');
  const istOk = app.bestaetigt || ((c) => !!c && c.confirmed >= 2);
  const ok = all.filter((i) => istOk(vp[i.key])).length;
  const srcList = (sources: ParamQuelle[], vsrc?: any[]) => sources.length
    ? `<ul class="srcs">${sources.map((s) => {
        const st = (vsrc || []).find((x) => x.id === s.id);
        const mark = st ? (st.ok ? '<span class="sok">✓</span>' : `<span class="sno" title="${esc(st.error || 'Wert nicht gefunden')}">✗</span>`) : '<span class="sna">·</span>';
        return `<li>${mark} <a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title || s.id)}</a>${s.publisher ? ` <small>${esc(s.publisher)}${s.official ? ', amtlich' : ''}${s.fassung ? `, Fassung vom ${dateCH(s.fassung)}` : ''}</small>` : ''}</li>`;
      }).join('')}</ul>`
    : '<p class="cap">Keine Quelle hinterlegt.</p>';
  let html = `<div class="srchead"><div><h1>Grundlagen und Quellen</h1>
    <p class="lead">Gerechnet wird mit den gesetzlichen Werten ${jahr}${app.P.meta.veraltet ? ` (für ${jahr} noch nicht bestätigt, daher Werte ${app.P.meta.letztesDatenjahr})` : ''}. Jeder gesetzliche Wert des laufenden und der folgenden Jahre ist mit mindestens zwei Quellen hinterlegt, davon mindestens einer amtlichen. Ein automatischer Prüflauf ruft die Quellen täglich ab und sucht den Wert in seinem Zusammenhang; der hier gezeigte Stand wird bei jeder Änderung und sonst wöchentlich nachgeführt. Als bestätigt gilt ein Wert, wenn ihn zwei Quellen nennen, davon eine amtliche und eine laufend nachgeführte.${app.Pn ? ` Ab ${jahr + 1} rechnet die Projektion mit den bereits beschlossenen Werten ${jahr + 1}.` : ''}</p></div>
    <div class="srcstat"><span class="big">${ok}/${all.length}</span><span>gesetzliche Werte bestätigt</span><span class="cap">Letzte Prüfung: ${dateCH(ver.checkedAt)} · Datenstand ${esc(data.version)}</span></div></div>`;
  if (app.pruefungVeraltet) html += `<div class="note warnbox" role="status"><b>Prüfung veraltet:</b> Die letzte automatische Prüfung liegt mehr als 10 Tage zurück (${dateCH(ver.checkedAt)}). Die Häkchen zeigen den Stand von damals; ob die Quellen die Werte heute noch bestätigen, ist nicht geprüft.</div>`;
  if (ver.alerts?.length) html += `<div class="note warnbox"><b>Hinweis aus der letzten Prüfung:</b><ul>${ver.alerts.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></div>`;
  for (const [g, list] of groups) {
    html += `<h2 class="srcg">${esc(g)}</h2><div class="srctbl">`;
    list.forEach((it) => {
      const v = vp[it.key];
      html += `<details class="srow"><summary><span class="sl">${esc(it.label)}</span><span class="sv">${fmtVal(it, it.value)}${it.next && it.next.value !== it.value ? `<small>ab 1.1.${it.next.year}: ${fmtVal(it, it.next.value)}</small>` : ''}</span>${badge(v, it.kind, istOk)}</summary>
        <div class="sdet">${it.note ? `<p class="cap">${esc(it.note)}</p>` : ''}${srcList(it.sources, v?.sources)}${v?.checkedAt ? `<p class="cap">Geprüft am ${dateCH(v.checkedAt)}.</p>` : ''}</div></details>`;
    });
    html += '</div>';
  }
  for (const [key, t] of Object.entries(data.tables || {})) {
    const v = (ver.tables || {})[key];
    const srcs = ((t.sources || []) as ParamQuelle[]).map((s) => ({ ...s, ...(data.sources[s.id] || {}) }));
    html += `<h2 class="srcg">${esc(t.label)}</h2><details class="srow"><summary><span class="sl">${t.kind === 'amtlich' ? 'Amtliche Statistik, täglich abgeglichen' : t.kind === 'schaetzung' ? 'Schätzung aus Vergleichstabellen' : t.kind === 'annahme' ? 'Planungsannahmen, im Formular anpassbar' : 'Gesetzliche Tabelle'}</span><span class="sv"></span>${badge(v, t.kind, istOk)}</summary>
      <div class="sdet">${t.note ? `<p class="cap">${esc(t.note)}</p>` : ''}${key === 'kapSteuer' ? kapTable(t.data) : ''}${key === 'vermSteuer' ? kapTable(t.data, 'ein Reinvermögen', [200000, 500000, 1000000, 5000000]) : ''}${key === 'referenzalter' ? refTable(t.data) : ''}${srcList(srcs, v?.sources)}</div></details>`;
  }
  html += `<p class="cap appver">App-Version ${esc(app.version)} · <button type="button" class="linkbtn" id="btnCheckUpdate">Nach Updates suchen</button> <span id="updMsg"></span></p>`;
  el.innerHTML = html;
  document.getElementById('btnCheckUpdate')?.addEventListener('click', () => app.checkForUpdate(true));
}

function kapTable(d: any, was = 'einen Kapitalbezug', stufen = [50000, 100000, 200000, 500000, 1000000]) {
  const cols = d.stuetzstellen.map((x: number, i: number) => [x, i]).filter(([x]: number[]) => stufen.includes(x));
  return `<p class="cap">Steuerjahr ${d.steuerjahr}${d.abgerufen ? `, abgerufen am ${new Date(d.abgerufen).toLocaleDateString('de-CH')}` : ''}. Steuer in CHF für ${was} von … (ledig / verheiratet).</p>
    <div class="tblwrap"><table class="cmp"><thead><tr><th>Kanton</th>${cols.map(([x]: number[]) => `<th>${nf.format(x)}</th>`).join('')}</tr></thead><tbody>${(Object.entries(d.kantone) as [string, any][]).sort().map(([k, v]) => `<tr><td>${k} – ${esc(v.ort)}</td>${cols.map(([, i]: number[]) => `<td>${nf.format(v.ledig[i])} / ${nf.format(v.verheiratet[i])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function refTable(d: any) {
  return `<p class="cap">Männer: ${d.m} Jahre. Frauen: ${d.w.map(([jg, a]: number[], i: number) => `${i === 0 ? `bis Jahrgang ${d.w[1][0] - 1}` : i === d.w.length - 1 ? `ab Jahrgang ${jg}` : `Jahrgang ${jg}`} ${dec(a, Number.isInteger(a) ? 0 : 2)}`).join(', ')}.</p>`;
}
