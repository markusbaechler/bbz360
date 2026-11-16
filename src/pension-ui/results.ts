// Resultatansicht (Formularmodus und Tutor-Ergebnis): Ampel, Tragbarkeit, «Sofort aufhören», Kennzahlen, Ansatzpunkte,
// Aktionsplan und die Inhalte der Ansichten (Bilanz, Fixkosten, Wünsche, Tabellen, Hinweise) für die Bühne.
import { nf, chf, chfSigned, dec, esc } from '../lib/pension/format';
import { ctrlHtml, summaryHtml, bindWhatIf, fmtMonat } from './whatif';
import { vergleichAktiv } from '../lib/pension/themen';
import { WTYP } from './form';
import { createAktion } from './aktion';
import { reachData } from './reach';
import { bildDaten, bildLegende, bildSzenario, renderBild } from './bild';
import { ansatzHtml, mehrText } from './ansatz';
import { gl, ampelSatz } from './glossar';
import { pufferText } from '../lib/pension/budget';
import { QUELLEN, W_DEF } from '../lib/pension/engine';
import { GRENZEN } from '../lib/pension/config';
import { tragPill, tragSatz, varianteHtml } from './trag';

const $ = (id) => document.getElementById(id);
/** Wort der Ampel wie im Kicker des Urteils. */
export const ST = { gruen: 'Reicht', gelb: 'Knapp', rot: 'Reicht nicht' };
/** Kennzahl «Tragbare Ausgaben pro Monat» eines Ergebnisses (Kachel, Kopfzeile, So oder so). */
export const tragbar = (r) => chf(r.maxA);
const real = (r) => 1 / r.I;

export function createResults(app) {
  const S = () => app.S, R = () => app.R, E = () => app.E;
  const single = () => S().haushalt === 'single';
  const ps = () => S().personen.slice(0, single() ? 1 : 2);
  const aktion = createAktion(app);

  function ageText() {
    const p = ps();
    if (p.length === 1) return `Bei einer Pensionierung mit ${p[0].pensAlter}`;
    return p[0].pensAlter === p[1].pensAlter ? `Wenn beide mit ${p[0].pensAlter} aufhören,` : `Wenn Person 1 mit ${p[0].pensAlter} und Person 2 mit ${p[1].pensAlter} aufhört,`;
  }
  /** Letzter Arbeitsmonat laut Auswahl → erster Monat ohne Lohn; ohne Auswahl: sofort (Ende des laufenden Monats). */
  function stopA() {
    const { stopY: y, stopM: m } = S().ui, A0 = E().A0;
    if (!y || !m) return A0 + 1;
    return Math.max(A0 + 1, y * 12 + (m - 1) + 1);
  }

  function render() {
    const r = R();
    const res = $('results');
    res.classList.toggle('leer', !r || r.leer);
    app.setLamp(r && !r.leer ? r.amp.st : '');
    if (!r || r.leer) {
      $('lamp').dataset.st = '';
      $('kicker').dataset.st = '';
      $('kicker').textContent = 'Noch keine Rechnung';
      $('verdictText').textContent = 'Bitte erfassen Sie die Eckdaten, mindestens die Ausgaben im Ruhestand.';
      $('verdictSub').textContent = 'Sobald die Ausgaben erfasst sind, erscheinen Ampel, Kennzahlen und Bericht.';
      if ($('ampelDruck')) $('ampelDruck').textContent = '';
      app.reach = null;
      return;
    }
    renderVerdict(); renderSofort(); renderKpis(); renderOpt(); aktion.render();
    // Für den Bericht (report.js): Bilanz und Hinweise ohne Darstellung; die Ansichten baut die Bühne bei Bedarf
    app.bilanz = bilanzDaten();
    app.hints = hintsList();
  }

  function renderVerdict() {
    const r = R(), { amp, base, maxA } = r, st = amp.st, who = single() ? '' : ' (Alter Person 1)', s = S(), H = r.horizont;
    $('lamp').dataset.st = st;
    const k = $('kicker');
    k.dataset.st = st;
    // Das Wort der Ampel erklärt sich beim Antippen oder Darüberfahren (glossar.js)
    k.innerHTML = gl('ampel', ST[st]);
    const last = base.rows[base.rows.length - 1];
    // Kurz halten: Reichweite, Stresstest und Lebenserwartung zeigt der Zeitstrahl darunter
    let h, sub;
    const ekTxt = amp.ekEnde > 1000 ? ` Nicht eingerechnet ist die Liegenschaft: Eigenkapital mit ${H} rund ${chf(amp.ekEnde)} (heutige Kaufkraft).` : '';
    const rest = `Mit ${H} bleiben rund ${chf(last.V * real(last))} in heutiger Kaufkraft`;
    if (st === 'gruen' && amp.reserveLg) {
      h = `Ja. ${ageText()} reicht Ihr Vermögen voraussichtlich bis ${H}.`;
      sub = `${rest}. Im Stresstest dient die Liegenschaft als Reserve: Es bräuchte rund ${chf(amp.reserveLg.bedarf)} aus einem Eigenkapital von rund ${chf(amp.reserveLg.ek)}.`;
    } else if (st === 'gruen') {
      h = `Ja. ${ageText()} reicht Ihr Vermögen voraussichtlich bis ${H}.`;
      sub = `${rest}, und auch im Stresstest reicht es.`;
    } else if (st === 'gelb' && amp.lgRot) {
      h = `Knapp. ${ageText()} ist das freie Vermögen mit ${amp.lgRot.ab}${who} aufgebraucht, die Liegenschaft deckt die Lücke.`;
      sub = `Bis ${H} fehlen rund ${chf(amp.lgRot.bedarf)}; das Eigenkapital der Liegenschaft (rund ${chf(amp.lgRot.ek)}) deckt das, verlangt aber einen Verkauf, einen Umzug oder eine höhere Hypothek. Ohne Liegenschaft tragbar: rund ${chf(maxA)} pro Monat.`;
    } else if (st === 'gelb') {
      h = `Knapp. ${ageText()} reicht es bis ${H}, aber mit wenig Spielraum.`;
      sub = (amp.stress.depleted != null ? `Im Stresstest ist das Vermögen mit ${amp.stress.depleted}${who} aufgebraucht.` : `Am Ende bleibt weniger als die Reserve von ${s.reserveJahre} Jahresausgaben.`)
        + (amp.reserveGesperrt ? ` Die Liegenschaft zählt hier nicht als Reserve: Die Hypothek ist nach der Pensionierung nicht tragbar (Belastung ${Math.round(amp.reserveGesperrt.quote * 100)}%), eine höhere Belehnung wäre kaum möglich.` : '') + ekTxt;
    } else if (base.depletedBeforeRet) {
      h = `Schon vor der Pensionierung reicht das Einkommen nicht: Das Vermögen ist mit ${base.depleted}${who} aufgebraucht.`;
      sub = 'Prüfen Sie Lohn, heutige Ausgaben und Vermögen. Fehlt eine Angabe, rechnet das Tool mit 0.';
    } else {
      h = `${ageText()} ist Ihr Vermögen voraussichtlich mit ${base.depleted}${who} aufgebraucht.`;
      sub = `Tragbar wären rund ${chf(maxA)} pro Monat statt ${chf(s.ausgabenRuhestand)}.${amp.ekEnde > 1000 ? ` Nicht eingerechnet ist die Liegenschaft: Eigenkapital mit ${H} rund ${chf(amp.ekEnde)}, Lücke bis ${H} rund ${chf(amp.defBase)} (heutige Kaufkraft).${base.depleted < 85 ? ' Die Lücke beginnt früh; die Liegenschaft müsste dann schon verkauft oder höher belehnt werden.' : ''}` : ''}`;
    }
    $('verdictText').textContent = h;
    $('verdictSub').textContent = sub;
    if ($('ampelDruck')) $('ampelDruck').textContent = ampelSatz(st, s);
    // Reichweite für Bericht und Vergleich; im Bild stehen dieselben Marken
    app.reach = reachData(r, E(), s);
    const tb = $('tragBox');
    if (r.tr) {
      tb.hidden = false;
      const am = s.amortisationen.length ? `<p class="amlist2">Erfasste Amortisationen: ${s.amortisationen.map((x) => `${chf(x.betrag)} im ${E().fmtA(E().amortMonat(s, x))} aus ${(x.quelle || 'frei') === 'frei' ? 'freiem Vermögen' : QUELLEN[x.quelle]}${r.tr.pts[0] && E().amortMonat(s, x) > r.tr.pts[0].A ? ' (nach dem ersten Prüfzeitpunkt, wirkt dort noch nicht)' : ''}`).join(', ')}.</p>` : '';
      tb.innerHTML = `${tragPill(r.tr)}<p>${tragSatz(r.tr, s)}</p>${am}${varianteHtml(r.vs, s, E())}`;
    } else tb.hidden = true;
  }

  function renderSofort() {
    const r = R(), so = r.so, el = $('sofort'), cpl = !single(), s = S(), H = r.horizont;
    const dep = so.now.base.depleted;
    const ein = (s.einkommen || []).filter((x) => x.betrag > 0 && ps()[x.person || 0]);
    const einTxt = ein.length ? `<p class="cap"><b>Berücksichtigt:</b> ${ein.map((x) => `${{ dividende: 'Dividenden', nebenerwerb: 'Nebenerwerb', spesen: 'Pauschalspesen', sonstiges: 'Sonstiges Einkommen' }[x.art]}${x.text ? ' ' + esc(x.text) : ''}${single() ? '' : ' P' + ((x.person || 0) + 1)} ${chf(x.betrag)} pro Jahr ${x.art === 'nebenerwerb' && x.abPens ? 'ab der Pensionierung, ' : ''}${x.art === 'spesen' ? 'bis zum Ausstieg' : x.bisJahr > 0 ? 'bis ' + x.bisJahr : 'unbefristet'}`).join('; ')} (brutto; gerechnet nach ${s.steuerEink}% Steuern${ein.some((x) => x.art === 'nebenerwerb') ? ', Nebenerwerb auch nach Sozialabgaben' : ''}).</p>` : '';
    // Regler nur neu aufbauen, wenn er gerade nicht bedient wird
    if (!el.querySelector('.wi-ctrlbox')) el.innerHTML = '<div class="sh"></div><div class="wi-ctrlbox"></div><div class="wi-body"></div>';
    el.querySelector('.sh').innerHTML = `<h3>Was wäre, wenn Sie früher aufhören?</h3><p class="cap">Schieben Sie den Regler und finden Sie den frühesten Zeitpunkt, an dem die Ampel grün wird. Ihr Plan bleibt dabei unverändert.</p>`;
    const box = el.querySelector('.wi-ctrlbox');
    if (!box.contains(document.activeElement)) box.innerHTML = ctrlHtml(app);
    const body = el.querySelector('.wi-body');
    body.removeAttribute('aria-busy');
    const r85 = so.now.base.rows.find((x) => x.age === 85);
    body.innerHTML = `${summaryHtml(app, true)}
      ${r85 && dep == null ? `<p class="cap">In diesem Szenario: freies Vermögen mit 85 rund ${chf(r85.V / r85.I)} (heutige Kaufkraft)${cpl ? ', Alter Person 1' : ''}.${so.now.reserveLg ? ` Reserve: Liegenschaft. Im Stresstest bräuchte es rund ${chf(so.now.reserveLg.bedarf)} aus der Liegenschaft (Eigenkapital rund ${chf(so.now.reserveLg.ek)}).` : ''}</p>` : ''}
      ${einTxt}
      ${so.now.lgRot ? `<p class="cap"><b>Knapp dank Liegenschaft:</b> Das freie Vermögen ist mit ${so.now.lgRot.ab}${cpl ? ' (Person 1)' : ''} aufgebraucht. Bis ${H} fehlen rund ${chf(so.now.lgRot.bedarf)}, das Eigenkapital der Liegenschaft beträgt dann rund ${chf(so.now.lgRot.ek)} (heutige Kaufkraft).</p>` : dep != null && so.now.ekEnde > 1000 ? `<p class="cap">Die Liegenschaft ist nicht eingerechnet: Eigenkapital mit ${H} rund ${chf(so.now.ekEnde)} (heutige Kaufkraft).</p>` : ''}
      <p class="cap">Die Ampel beurteilt das freie Vermögen. ${r.base.lgs.length ? 'Die Liegenschaft zählt als Reserve, wenn das Geld erst ab 85 ausgeht und ihr Eigenkapital die Lücke deckt. ' : ''}Die Kennzahlen oben gelten für Ihren Plan, nicht für dieses Szenario.${ps().some((p) => !(p.pkGuthabenHeute > 0)) ? ' Genauer wird es mit dem PK-Guthaben heute (Formular, Abschnitt Pensionskasse).' : ''}</p>`;
  }

  function renderKpis() {
    const r = R(), { base, maxA } = r, cpl = !single();
    const r85 = base.rows.find((x) => x.age === 85);
    const k = [
      ['Vermögen reicht bis', base.depleted != null ? `Alter ${base.depleted}` : `über ${r.horizont}`, cpl ? 'Alter Person 1' : 'Planungshorizont'],
      ['Tragbare Ausgaben pro Monat', tragbar(r), `Ihre Annahme: ${chf(S().ausgabenRuhestand)} · ${pufferText(maxA, S().ausgabenRuhestand, R().amp.st)}`],
      ['Freies Vermögen mit 85', r85 ? chf(Math.max(0, r85.V) * real(r85)) : '–', `ohne Liegenschaft, ${gl('kaufkraft', 'heutige Kaufkraft')}` + (cpl ? ', Alter P1' : '')],
    ];
    $('kpis').innerHTML = k.map(([l, v, s]) => `<div class="kpi"><span class="l">${l}</span><span class="v">${v}</span><span class="s">${s}</span></div>`).join('');
  }

  /** «Renten und Fixkosten» als HTML; leer, wenn es keine Fixkosten-Rechnung gibt. */
  function fixHtml() {
    const F = R().fix, s = S();
    if (!F) return '';
    const mo = (v) => chf(v / 12), cols = [F.a, F.b].filter(Boolean);
    const tr = (l, fn, cls) => `<tr${cls ? ` class="${cls}"` : ''}><td>${l}</td>${cols.map((x) => `<td>${fn(x)}</td>`).join('')}</tr>`;
    const qcls = (q) => (q >= 1.1 ? 'ok' : q >= 1 ? 'mid' : 'bad');
    const endQ = (F.b || F.a).q;
    let t;
    if (F.a.q >= 1 && endQ >= 1) t = `<b>Die Renten decken die Fixkosten${F.b ? ' auch mit 85' : ''}.</b> Das Vermögen und die Kapitalbezüge stehen für den übrigen Lebensunterhalt, Freizeit, Reisen und Reserven zur Verfügung.${-F.kapDelta > 50000 ? ` Rechnerisch blieben die Fixkosten auch mit einem um rund ${chf(Math.floor(-F.kapDelta / 10000) * 10000)} höheren Kapitalbezug gedeckt; ob das passt, ist eine persönliche Abwägung.` : ''}`;
    else if (F.a.q >= 1) t = `<b>Die Renten decken die Fixkosten zu Beginn, mit 85 nicht mehr ganz</b>, weil die PK-Rente nicht an die Teuerung angepasst wird. Die Lücke von rund ${mo(-F.b.saldo)} pro Monat deckt das Vermögen.`;
    else t = `<b>Die Renten decken die Fixkosten nicht.</b> Es fehlen rund ${mo(-F.a.saldo)} pro Monat, die das Vermögen decken muss.${F.kapHeute > 0 ? ` Prüfen: mehr Rente statt Kapital (bis rund ${chf(Math.min(F.kapHeute, Math.ceil(F.kapDelta / 10000) * 10000))} weniger Kapitalbezug).` : ''}`;
    return `<h3>Renten und Fixkosten</h3>
      <p class="cap">Deckt das sichere Einkommen (AHV und PK-Rente) die Kosten, die sich kaum senken lassen? Beträge pro Monat, nominal wie in der Jahresrechnung.</p>
      <div class="tblwrap" tabindex="0" role="region" aria-label="Tabelle, seitlich scrollbar"><table class="cmp fxt"><thead><tr><th scope="col"><span class="vh">Posten</span></th>${cols.map((x) => `<th scope="col">${x.year}<small>${x === F.a ? 'alle mit AHV' : 'Alter 85' + (single() ? '' : ' P1')}</small></th>`).join('')}</tr></thead><tbody>
        ${tr('AHV', (x) => mo(x.ahv))}${tr('PK-Rente', (x) => mo(x.pk))}${tr('<b>Renten total</b>', (x) => `<b>${mo(x.renten)}</b>`, 'tot')}
        ${tr(`Wohnen <small>${F.wohnenArt}</small>`, (x) => mo(-x.wohnen))}${tr(`Übrige Fixkosten${F.lgw ? ' <small>inkl. weitere Liegenschaften</small>' : ''}`, (x) => mo(-x.uebrig))}${tr(`Steuern auf Renten <small>${s.steuerEink}%</small>`, (x) => mo(-x.steuern))}
        ${tr('<b>Fixkosten inkl. Steuern</b>', (x) => `<b>${mo(-x.fix)}</b>`, 'tot')}
        ${tr('<b>Überschuss / Lücke</b>', (x) => `<b class="${x.saldo >= 0 ? 'pos' : 'neg'}">${chfSigned(x.saldo / 12)}</b>`, 'tot')}
        ${tr('Deckung', (x) => `<span class="dq ${qcls(x.q)}">${dec(x.q)}-fach</span>`)}
      </tbody></table></div>
      <p>${t}</p>
      <p class="cap">Fixkosten wachsen mit der Teuerung (${s.inflation}%), die AHV mit ${s.ahvAnpassung}%, die PK-Rente bleibt gleich. Die Entwicklung Jahr für Jahr zeigt die Jahresrechnung (Ansicht «Renten und Fixkosten»).</p>`;
  }

  /** «Wünsche und Ziele» als HTML; leer ohne Wünsche. */
  function wbHtml() {
    const s = S(), r = R();
    if (!s.wuensche.length) return '';
    const stTxt = { gruen: 'grün', gelb: 'gelb', rot: 'rot' };
    let html = `<h3>Wünsche und Ziele</h3><p class="cap">Wirkung jedes Wunsches: Vergleich der Rechnung mit und ohne diesen Wunsch, in heutiger Kaufkraft. Eine gekaufte Liegenschaft im Ausland ist nicht im freien Vermögen enthalten, sondern in der Vermögensbilanz.</p>
      <div class="tblwrap" tabindex="0" role="region" aria-label="Tabelle, seitlich scrollbar"><table class="cmp"><thead><tr><th scope="col">Wunsch</th><th scope="col">Freies Vermögen am Horizont</th><th scope="col">Tragbare Ausgaben</th><th scope="col">Ampel ohne</th></tr></thead><tbody>
      ${s.wuensche.map((w, k) => {
        const x = r.wb[k];
        if (!x) return `<tr class="off"><td>${esc(w.name || WTYP[w.typ])} (aus)</td><td>–</td><td>–</td><td>–</td></tr>`;
        return `<tr><td>${esc(w.name || WTYP[w.typ])}</td><td>${w.typ === 'ziel' ? 'Ziel ' + chf(w.betrag) : chfSigned(x.dEnd)}</td><td>${w.typ === 'ziel' ? chfSigned(-Math.max(0, x.dMax)) + ' / Mt.' : chfSigned(-x.dMax) + ' / Mt.'}</td><td><span class="pill" data-st="${x.stOhne}">${stTxt[x.stOhne]}</span></td></tr>`;
      }).join('')}
      </tbody></table></div>`;
    s.wuensche.forEach((w, k) => {
      const x = r.wb[k];
      if (w.typ !== 'ausland' || !x || !x.ausland) return;
      const { mi, ka, r: rr } = x.ausland, g = { ...W_DEF, ...w }, cur = w.wohnform || 'miete';
      const row = (l, a, b, neg) => `<tr><td>${l}</td><td>${a == null ? '–' : chf(neg ? -a : a)}</td><td>${b == null ? '–' : chf(neg ? -b : b)}</td></tr>`;
      const sg = chfSigned;
      html += `<h3>${esc(w.name || 'Ausland')}: ${g.monate} Monate pro Jahr, Miete oder Kauf</h3>
        <p class="cap">Pro Jahr in heutiger Kaufkraft, bei Ausgaben von ${chf(s.ausgabenRuhestand)} pro Monat in der Schweiz. Die Fixkosten in der Schweiz (Wohnen, Krankenkasse, Versicherungen) laufen weiter.</p>
        <div class="tblwrap" tabindex="0" role="region" aria-label="Tabelle, seitlich scrollbar"><table class="cmp"><thead><tr><th scope="col"><span class="vh">Posten</span></th><th scope="col"${cur === 'miete' ? ' class="cur"' : ''}>Mieten</th><th scope="col"${cur === 'kauf' ? ' class="cur"' : ''}>Kaufen</th></tr></thead><tbody>
        ${row(`Wegfallende Ausgaben in der Schweiz (${g.anteilVariabel}%)`, mi.einsparung, ka.einsparung, true)}
        ${row(`Leben vor Ort (Preisniveau ${g.preisniveau}%)`, mi.leben, ka.leben)}
        ${row('Wohnen vor Ort (Miete bzw. laufende Kosten)', mi.wohnen, ka.wohnen)}
        ${row('Reisen', mi.reise, ka.reise)}
        ${row(`Vermietung ${g.wochen} Wochen (brutto)`, null, ka.vermietung, true)}
        ${row('Verwaltung, Reinigung, Plattform', null, ka.verwaltung)}
        ${row(`Steuer auf Mieteinnahmen vor Ort (${g.mietSteuer}%)`, null, ka.steuerVorOrt)}
        <tr class="tot"><td><b>Mehr- (+) bzw. Minderkosten (-) pro Jahr</b></td><td><b>${sg(mi.netto)}</b></td><td><b>${sg(ka.netto)}</b></td></tr>
        ${row(`Entgangener Ertrag auf Kaufpreis inkl. Nebenkosten (${dec(rr * 100)}%)`, null, ka.kapitalkosten)}
        <tr><td><b>Wirtschaftlich pro Jahr</b></td><td><b>${sg(mi.netto)}</b></td><td><b>${sg(ka.netto + ka.kapitalkosten)}</b></td></tr>
        </tbody></table></div>
        <p class="cap">Beim Kauf fliessen einmalig ${chf(g.kaufpreis * (1 + g.nebenkosten / 100))} aus dem freien Vermögen ab. Die Liegenschaft erscheint in der Vermögensbilanz (Wert wächst mit der Teuerung). Preisniveau, Mieten, Nebenkosten und Steuersatz bitte an den konkreten Ort anpassen.</p>`;
    });
    return html;
  }

  /** Spalten und Zeilen der Vermögensbilanz (für die Ansicht und den Bericht). */
  function bilanzDaten() {
    const r = R(), b = r.base, s = S(), lgs = b.lgs;
    const retRow = b.rows.find((x) => x.allRet) || b.rows[0], last = b.rows[b.rows.length - 1];
    const heute = { fv: (+s.liquiditaet || 0) + (+s.wertschriften || 0), s3: b.ps.reduce((x, p) => x + (+p.s3a || 0), 0), fz: b.ps.reduce((x, p) => x + (+p.fz || 0), 0), lw: lgs.map((l) => l.verkehrswert), lh: lgs.map((l) => -(+l.hypothek || 0)), la: 0, I: 1 };
    const col = (x) => ({ fv: x.V, s3: x.s3a, fz: x.fz, lw: x.lgWerte || [], lh: (x.lgHyp || []).map((h) => -h), la: x.lgAusland || 0, I: x.I });
    const cols = [['Heute', heute], [`Ende ${retRow.year} (pensioniert)`, col(retRow)], [`Horizont ${last.year}`, col(last)]];
    const lines = [['Freies Vermögen', (c) => c.fv], ['Säule 3a', (c) => c.s3], ['Freizügigkeit', (c) => c.fz]];
    lgs.forEach((l, k) => { lines.push([`${l.name || 'Liegenschaft'} (Verkehrswert)`, (c) => c.lw[k] || 0]); lines.push([`Hypothek ${l.name || ''}`.trim(), (c) => c.lh[k] || 0]); });
    lines.push(['Liegenschaft Ausland', (c) => c.la]);
    const net = (c) => lines.reduce((x, [, g]) => x + g(c), 0);
    return { cols, lines, net };
  }
  /** «Vermögensbilanz des Haushalts» als HTML. */
  function bilanzHtml() {
    const s = S(), cpl = !single(), { cols, lines, net } = bilanzDaten();
    const amTot = s.amortisationen.reduce((x, a) => x + (+a.betrag || 0), 0);
    const html = `<h3>Vermögensbilanz des Haushalts</h3><p class="cap">Beträge zum jeweiligen Zeitpunkt (nominal). Liegenschaften wachsen mit der Teuerung (${s.inflation}%). Hypotheken ändern sich nur durch Amortisation${amTot > 0 ? ` (erfasst: ${chf(amTot)})` : ''} oder Verkauf. PK-Renten und AHV sind laufendes Einkommen und nicht enthalten.</p>
      <div class="tblwrap" tabindex="0" role="region" aria-label="Tabelle, seitlich scrollbar"><table class="cmp"><thead><tr><th scope="col"><span class="vh">Posten</span></th>${cols.map(([l]) => `<th scope="col">${esc(l)}</th>`).join('')}</tr></thead><tbody>
      ${lines.filter(([, g]) => cols.some(([, c]) => Math.abs(g(c)) > 0.5)).map(([l, g]) => `<tr><td>${esc(l)}</td>${cols.map(([, c]) => `<td>${Math.abs(g(c)) > 0.5 ? chf(g(c)) : '–'}</td>`).join('')}</tr>`).join('')}
      <tr class="tot"><td><b>Nettovermögen</b></td>${cols.map(([, c]) => `<td><b>${chf(net(c))}</b></td>`).join('')}</tr>
      <tr><td>in heutiger Kaufkraft</td>${cols.map(([, c]) => `<td>${chf(net(c) / c.I)}</td>`).join('')}</tr></tbody></table></div>
      <p class="cap">Die Kennzahlen und der Vermögensverlauf zeigen nur das freie Vermögen des ganzen Haushalts${cpl ? ' (beide Personen zusammen)' : ''}.</p>`;
    return html;
  }

  const jviewSeg = () => { const v = S().ui.jview || 'alle'; return `<div class="seg jseg" role="group">${[['alle', 'Vermögen'], ['fix', 'Renten und Fixkosten']].map(([k, l]) => `<button type="button" data-jview="${k}" aria-pressed="${v === k}">${l}</button>`).join('')}</div>`; };
  const xlText = () => (single() ? 'Alter' : 'Alter Person 1');
  /** Tabellen der Ansichten «Ablauf», «Jahresrechnung» und «Kapitalbezüge und Steuern». */
  function tabHtml(tab) {
    const r = R(), s = S(), cpl = !single();
    const c = (v) => (Math.abs(v) < 0.5 ? '–' : nf.format(Math.round(v)));
    if (tab === 'ablauf') {
      const evs = r.base.events;
      const tief = r.base.retRows.reduce((m, x) => (x.V / x.I < m.V / m.I ? x : m), r.base.retRows[0]);
      return `<h3>Was wann geschieht</h3><p class="cap">Chronologisch, Beträge nominal. Renten pro Jahr, Kapitalbezüge mit der Steuer (Kanton ${esc(s.kanton)}).</p>
        <div class="tblwrap" tabindex="0" role="region" aria-label="Tabelle, seitlich scrollbar"><table class="cmp ev"><thead><tr><th scope="col">Datum</th>${cpl ? '<th scope="col">Person</th>' : ''}<th scope="col">Ereignis</th><th scope="col">Betrag</th><th scope="col">Steuer</th></tr></thead><tbody>
        ${evs.map((e) => `<tr${e.warn ? ' class="warn"' : ''}><td>${e.datum}</td>${cpl ? `<td>${e.person == null ? 'Haushalt' : e.person + 1}</td>` : ''}<td>${esc(e.text)}</td><td>${e.betrag ? chf(e.betrag) + (e.proJahr ? ' / Jahr' : '') : ''}</td><td>${e.steuer ? chf(e.steuer) : ''}</td></tr>`).join('')}
        </tbody></table></div>
        <p class="cap">Tiefster Stand des freien Vermögens nach der Pensionierung: Ende ${tief.year}, rund ${chf(tief.V / tief.I)} in heutiger Kaufkraft. AHV mit ${app.P.ahv.monatsrentenProJahr} Monatsrenten pro Jahr, bei Ehepaaren höchstens ${chf(app.P.ahv.plafondEhepaar)} pro Monat.${app.Pn ? ` Ab ${app.P.meta.jahr + 1} gelten die bereits beschlossenen Werte ${app.P.meta.jahr + 1} (AHV-Rente bis ${chf(app.Pn.ahv.maxRente)}, Ehepaare bis ${chf(app.Pn.ahv.plafondEhepaar)}).` : ''}</p>`;
    } else if (tab === 'jahre' && s.ui.jview === 'fix') {
      const rows = r.fixRows, mx = Math.max(1.5, ...rows.map((x) => x.q));
      return `${jviewSeg()}<h3>Renten und Fixkosten pro Jahr</h3><p class="cap">Nominal in CHF pro Jahr, ab der ersten Rente. Deckung = Renten ÷ Fixkosten inkl. Steuern; die Linie markiert 1.0.</p>
        <div class="tblwrap" tabindex="0" role="region" aria-label="Tabelle, seitlich scrollbar"><table class="cmp yt fy"><thead><tr><th scope="col">Jahr</th><th scope="col">Alter${cpl ? ' P1/P2' : ''}</th><th scope="col">AHV</th><th scope="col">PK-Rente</th><th scope="col">Renten</th><th scope="col">Fixkosten inkl. Steuern</th><th scope="col">Überschuss / Lücke</th><th scope="col">Deckung</th></tr></thead><tbody>
        ${rows.map((x) => `<tr${x.erwerb ? ' class="erw"' : ''}><td>${x.year}</td><td>${cpl ? x.ages.join('/') : x.age}</td><td>${c(x.ahv)}</td><td>${c(x.pk)}</td><td><b>${c(x.renten)}</b></td><td title="Wohnen ${c(x.wohnen)} · übrige ${c(x.uebrig)} · Steuern ${c(x.steuern)}">${c(-x.fix)}</td><td class="${x.saldo >= 0 ? 'pos' : 'neg'}">${x.saldo >= 0 ? '+' : ''}${c(x.saldo)}</td><td class="dqc"><div class="dqw">${x.erwerb ? '<small>mit Erwerb</small>' : `<div class="dqb"><i class="${x.q >= 1.1 ? 'ok' : x.q >= 1 ? 'mid' : 'bad'}" style="width:${Math.min(100, (x.q / mx) * 100).toFixed(1)}%"></i><s style="left:${((1 / mx) * 100).toFixed(1)}%"></s></div><span>${dec(x.q, 2)}</span>`}</div></td></tr>`).join('')}
        </tbody></table></div>
        <p class="cap">Wohnen: ${r.wohnen.art}. Übrige Fixkosten mit der Teuerung fortgeschrieben. Steuern = pauschal ${s.steuerEink}% auf AHV und PK-Rente. Vermögenssteuer und Steuern auf Vermögenserträgen zählen nicht zu den Fixkosten; sie stehen in der Jahresrechnung des freien Vermögens. Jahre mit Erwerbseinkommen sind grau.</p>`;
    } else if (tab === 'jahre') {
      const rows = r.base.rows;
      return `${jviewSeg()}<h3>Jahresrechnung des freien Vermögens</h3><p class="cap">Nominal in CHF. ${rows[0].year} ab ${E().fmtA(E().A0)}. Vermögen = Konten und Wertschriften, ohne Liegenschaft, 3a, Freizügigkeit und PK.</p>
        <div class="tblwrap" tabindex="0" role="region" aria-label="Tabelle, seitlich scrollbar"><table class="cmp yt"><thead><tr><th scope="col">Jahr</th><th scope="col">Alter${cpl ? ' P1/P2' : ''}</th><th scope="col">Lohn netto</th><th scope="col">Übr. Eink.</th><th scope="col">AHV</th><th scope="col">PK-Rente</th><th scope="col">Kapital netto</th><th scope="col">Ertrag</th><th scope="col">Ausgaben</th><th scope="col">Steuern</th><th scope="col">AHV-Beitr.</th><th scope="col">3a-Einz.</th><th scope="col">Wünsche</th><th scope="col">Liegensch.</th><th scope="col">Vermögen Ende</th></tr></thead><tbody>
        ${rows.map((x) => `<tr><td>${x.year}</td><td>${cpl ? x.ages.join('/') : x.age}</td><td>${c(x.lohn)}</td><td>${c(x.uebrig)}</td><td>${c(x.ahv)}</td><td>${c(x.pk)}</td><td>${c(x.kapZu)}</td><td>${c(x.ertrag)}</td><td>${c(-x.ausgaben)}</td><td>${c(-x.steuern - x.stVerm - x.stErtrag)}</td><td>${c(-x.ne)}</td><td>${c(-x.einz3a)}</td><td>${c(x.wEin - x.wAus)}</td><td>${c(x.lgNetto - x.amortFrei)}</td><td><b>${c(x.V)}</b></td></tr>`).join('')}
        </tbody></table></div>
        <p class="cap">Kapital netto = Bezüge aus PK-Kapital, 3a und Freizügigkeit nach Steuern, abzüglich Vorbezügen für Amortisationen (gehen direkt an die Bank). Liegensch. = Mieterträge minus Zins, Unterhalt und Steuer weiterer Liegenschaften, Verkaufserlöse, Amortisationen aus freiem Vermögen. Steuern = pauschal ${s.steuerEink}% auf AHV und PK-Rente und auf ${dec(+s.ertragSteuerbar || 0, 0)}% der Vermögenserträge, dazu die Vermögenssteuer auf dem Reinvermögen: ${s.steuerVerm === '' || s.steuerVerm == null ? `nach dem Tarif des Kantonshauptorts (${esc(s.kanton)}, ESTV-Statistik ${E().P.vermSteuer?.steuerjahr ?? ''})` : `eigener Satz ${dec(+s.steuerVerm)}‰`}. Die Sätze stehen im Formular unter «Weitere Annahmen».</p>`;
    } else if (tab === 'kapital') {
      const L = r.base.kapListe;
      const tot = L.reduce((a, e) => a + e.betrag / e.I, 0), tx = L.reduce((a, e) => a + e.steuer / e.I, 0);
      return `<h3>Kapitalbezüge und Steuern</h3><p class="cap">Alle Bezüge aus PK-Kapital, Säule 3a und Freizügigkeit, inklusive 3a-Vorbezug zur Amortisation. Steuer gemäss Kanton ${esc(s.kanton)} (Hauptort). Bezüge im gleichen Jahr werden ${s.haushalt === 'verheiratet' ? 'für das Ehepaar ' : ''}zusammengerechnet.</p>
        <div class="tblwrap" tabindex="0" role="region" aria-label="Tabelle, seitlich scrollbar"><table class="cmp"><thead><tr><th scope="col">Datum</th>${cpl ? '<th scope="col">Person</th>' : ''}<th scope="col">Alter</th><th scope="col">Bezug</th><th scope="col">Betrag</th><th scope="col">Steuer</th><th scope="col">Satz</th></tr></thead><tbody>
        ${L.map((e) => `<tr><td>${e.datum}</td>${cpl ? `<td>${e.person + 1}</td>` : ''}<td>${e.age}</td><td>${esc(e.art)}</td><td>${chf(e.betrag)}</td><td>${chf(e.steuer)}</td><td>${e.betrag > 0 ? dec((e.steuer / e.betrag) * 100) + '%' : ''}</td></tr>`).join('') || `<tr><td colspan="7">Keine Kapitalbezüge.</td></tr>`}
        </tbody></table></div>
        <p class="cap">Beträge nominal im Jahr des Bezugs. Total in heutiger Kaufkraft: Bezüge ${chf(tot)}, Steuern ${chf(tx)} (${tot > 0 ? dec((tx / tot) * 100) : 0}%).</p>`;
    }
    return '';
  }

  // Lesehilfe unter der Legende: auf- oder zugeklappt bleibt sie über Neuberechnungen hinweg (nur Oberfläche)
  let lesehilfeOffen = false;
  $('tabBody')?.addEventListener('toggle', (e) => { if (e.target.classList?.contains('lesehilfe')) lesehilfeOffen = e.target.open; }, true);
  /**
   * Inhalt einer Ansicht der Bühne; leer, wenn es dazu nichts gibt. «bild» auch ohne Ergebnis (wachsendes Bild); im Tutor
   * mit dem erklärenden Satz unter dem Bild.
   */
  /**
   * Szenario «früher aufhören» im Bild: im Formular in Schritt 6, solange der Regler aufgeklappt ist und kein
   * Vergleich läuft. Titel: letzter Arbeitstag und wer aufhört (Rohtext).
   */
  function szenario() {
    const s = S(), r = R();
    if (s.ui.mode !== 'form' || s.ui.schritt !== 'vergleich' || !r || r.leer || !r.so?.now || !$('sofortBox')?.open || vergleichAktiv(s)) return null;
    const L = (r.stopA ?? E().A0 + 1) - 1, wer = r.so.wer;
    return `letzter Arbeitstag ${L <= E().A0 ? 'sofort, ' : ''}Ende ${fmtMonat(L)}${single() ? '' : wer == null ? ', beide' : `, Person ${wer + 1}`}`;
  }
  const bildD = () => { const t = szenario(); return t ? bildSzenario(S(), R(), E(), t) : bildDaten(S(), R(), E()); };
  function ansichtHtml(id) {
    if (id === 'bild') {
      const d = bildD();
      const sz = d.szenario ? `<p class="cap bildszen"><b>Das Bild zeigt das Szenario:</b> ${esc(d.szenario.titel)}. Gestrichelt: Ihr heutiger Plan.</p>` : '';
      // Im Formular führt ein Knopf in der Lesehilfe (und die Marke «Horizont» im Bild) zur Einstellung des
      // Planungshorizonts (Schritt 3, «Weitere Annahmen»)
      const hz = S().ui.mode === 'form' && d.H != null && d.stufe >= 1 ? `<p class="cap">Gerechnet wird bis ${d.H}${single() ? '' : ' (Alter Person 1)'}${d.reach?.hzTxt ? `: ${d.reach.hzTxt}` : ''}. Die Lebenserwartung ist der Durchschnitt laut Bundesamt für Statistik. <button type="button" class="hzknopf" data-horizont>Planungshorizont anpassen</button></p>` : '';
      // Die Lesehilfe steht zugeklappt neben der Legende, damit Bild und Themenleiste auf den Bildschirm passen
      return `${sz}<div class="bildkopf">${bildLegende(d)}<details class="lesehilfe"${lesehilfeOffen ? ' open' : ''}><summary>Lesehilfe</summary><p class="cap">${d.stufe >= 2 ? 'Pro Jahr in heutiger Kaufkraft; angefangene Jahre auf ein ganzes Jahr hochgerechnet. ' : ''}X-Achse: ${xlText()}.${d.stufe >= 3 ? ' Stresstest: Rendite 1 Prozentpunkt tiefer, bis 100.' : ''}${d.stufe >= 2 ? ' Tippen, darüberfahren oder die Pfeiltasten zeigen die Werte.' : ''}</p>${hz}</details></div><div class="bild" id="bild"></div>${S().ui.mode === 'tutor' ? '<p class="cap bildsatz">Oben: Wovon Sie pro Jahr leben. Unten: Ihr freies Vermögen. Tippen zeigt die Werte.</p>' : ''}`;
    }
    if (id === 'bilanz') return bilanzHtml();
    if (id === 'fix') return fixHtml();
    if (id === 'wuensche') return wbHtml();
    if (id === 'hinweise') return hintsHtml();
    return ['ablauf', 'jahre', 'kapital'].includes(id) ? tabHtml(id) : '';
  }
  /** Nach dem Einsetzen von ansichtHtml(): Diagramm zeichnen. Im Tutor gibt es keine feste Bühne: Die Höhe folgt der Breite. */
  function ansichtNach(id) {
    if (id !== 'bild') return;
    const d = bildD();
    // Das Szenario steht unter dem Regler (unterhalb des sichtbaren Bereichs): feste Höhe statt des gemessenen Platzes
    renderBild($('bild'), d, S().ui.mode === 'tutor' ? { frei: Infinity } : d.szenario ? { frei: 420 } : {});
  }
  // «Gerechnet bis N: anpassen»: Schritt 3, Abschnitt «Weitere Annahmen», Feld «Planungshorizont»
  $('tabBody')?.addEventListener('click', (e) => {
    if (!e.target.closest?.('[data-horizont]') || S().ui.mode !== 'form') return;
    app.leiste?.(true);
    app.schritt?.go('vermoegen');
    const feld = $('f_horizontModus'), sec = feld?.closest('details.sec');
    if (sec) sec.open = true;
    feld?.closest('details.sub')?.setAttribute('open', '');
    feld?.scrollIntoView?.({ block: 'center' });
    feld?.focus();
  });

  // Auf-/Zu-Zustand von «N weitere Ansatzpunkte zeigen»: nur Oberfläche, nicht im Link
  let ansatzOffen = false;
  function renderOpt() {
    const host = $('opt'), form = document.body.dataset.mode === 'form';
    const fokus = document.activeElement?.hasAttribute?.('data-mehr-ansatz') && host.contains(document.activeElement);
    // Das halbe Bild unter den Karten nur im Formular (Schritt 7 allein auf der Bühne); im Tutor steht das Bild weiter oben
    host.innerHTML = ansatzHtml(R().opt, { offen: ansatzOffen, h2: true }) + (form ? '<div class="bild bild-halb" id="ansatzBild"></div>' : '');
    if (form) renderBild($('ansatzBild'), bildDaten(S(), R(), E()), { halb: true });
    if (fokus) host.querySelector('[data-mehr-ansatz]')?.focus();
  }
  $('opt')?.addEventListener('click', (e) => {
    const k = e.target.closest?.('[data-mehr-ansatz]');
    if (!k) return;
    ansatzOffen = k.getAttribute('aria-expanded') !== 'true';
    k.setAttribute('aria-expanded', String(ansatzOffen));
    k.textContent = mehrText(Number(k.dataset.n), ansatzOffen);
    $('apkMehr').hidden = !ansatzOffen;
  });

  function hintsList() {
    const h = [], r = R(), base = r.base, s = S(), P = app.P;
    base.ps.forEach((p, i) => {
      const ab = p.ref - P.vorsorge.bezugJahreVorRef;
      if (p.pensAlter < ab && (p.s3a > 0 || p.fz > 0)) h.push(`<b>${single() ? '' : 'Person ' + (i + 1) + ': '}3a und Freizügigkeit erst ab ${dec(ab, ab % 1 ? 2 : 0)}.</b> Bis dahin tragen das freie Vermögen und das PK-Kapital die Ausgaben. Ausnahme: 3a-Vorbezug zur Amortisation der Hypothek.`);
    });
    base.ps.forEach((p, i) => {
      if (!p.teil) return;
      const w = single() ? '' : `Person ${i + 1}: `;
      if (p.teil.zuFrueh) h.push(`<b>${w}PK-Teilbezug vor ${p.minAlter || P.bvg.minAlter} nicht möglich.</b> Gerechnet wird ohne Bezug, weiter versichert.`);
      if (p.teil.q < 0.2) h.push(`<b>${w}Teilpensionierung:</b> Beim ersten Teilbezug verlangt das Gesetz mindestens 20% der Altersleistung (Art. 13a Abs. 3 BVG); das Reglement kann einen tieferen Anteil zulassen.`);
      if (!p.teil.bezug && p.teilPK === 'weiter') h.push(`<b>${w}Weiterversicherung:</b> Gesetzlich möglich ab 58 bei einer Lohnreduktion um höchstens die Hälfte, sofern das Reglement sie vorsieht.${p.teil.q > 0.5 ? ' Ihre Reduktion ist grösser als 50%: mit der PK klären.' : ''}`);
      if (p.teil.bezug && p.teil.pk.kapital > 0) h.push(`<b>${w}Kapital in Etappen:</b> Kapitalbezüge sind in höchstens drei Schritten möglich. Teilkapital und Restkapital fallen in verschiedene Jahre, das senkt die Steuer.`);
    });
    base.ps.forEach((p, i) => {
      if (E().uebergang(p)) h.push(`<b>${single() ? '' : 'Person ' + (i + 1) + ': '}Übergangsgeneration AHV 21.</b> Referenzalter ${dec(p.ref, p.ref % 1 ? 2 : 0)} Jahre. Beim Vorbezug (bis ${E().maxVorbezug(p)} Jahre, frühestens ab 62) gelten je nach Einkommen tiefere Kürzungssätze; sie sind eingerechnet. Wer nicht vorbezieht, erhält einen lebenslangen Rentenzuschlag (Art. 34bis AHVG); er ist eingerechnet${(p.ahvBez || 0) < 0 ? ', entfällt hier aber wegen des Vorbezugs' : ''}.`);
    });
    s.wuensche.filter((w) => w.aktiv !== false && w.typ === 'ausland').forEach((w) => {
      if ((w.monate || 0) > 6) h.push(`<b>${esc(w.name || 'Ausland')}: mehr als 6 Monate.</b> Damit kann der Wohnsitz ins Ausland wechseln, mit Folgen für Steuern und Krankenversicherung. Unbedingt vorher abklären.`);
      else h.push(`<b>${esc(w.name || 'Ausland')}:</b> Bei ${w.monate || 0} Monaten bleibt der Wohnsitz in der Regel in der Schweiz. AHV- und PK-Renten werden auch im Ausland ausbezahlt.`);
      if (w.wohnform === 'kauf') h.push('<b>Liegenschaft im Ausland:</b> Mieteinnahmen werden im Belegenheitsstaat besteuert. In der Schweiz sind sie steuerfrei, zählen aber für den Steuersatz. Vorschriften für Kurzzeitvermietung vor Ort beachten.');
    });
    if (base.zielReal > 0) h.push(`<b>Vermögensziel:</b> Am Horizont sollen mindestens ${chf(base.zielReal)} (heutige Kaufkraft) übrig bleiben. Die tragbaren Ausgaben sind entsprechend tiefer.`);
    h.push(`<b>Steuern auf Kapitalbezügen</b> (${esc(s.kanton)}, ${single() ? 'ledig' : s.haushalt === 'verheiratet' ? 'verheiratet' : 'je Person'}): insgesamt rund ${chf(base.kapSteuerTotal)} in heutiger Kaufkraft.`);
    if (r.amp.st !== 'gruen' && r.maxA > 0) h.push(`<b>Ausgaben:</b> Mit ${chf(r.maxA)} pro Monat wäre die Ampel grün.`);
    h.push('<b>PK-Rente:</b> Nehmen Sie den Wert für Ihr Wunsch-Pensionsalter vom Vorsorgeausweis. Wer das Alter ändert, muss auch die Rente anpassen.');
    if (P.meta.veraltet) h.unshift(`<b>Grundlagen ${P.meta.jahr} noch nicht bestätigt:</b> Gerechnet wird mit den Werten ${P.meta.letztesDatenjahr}. Die App aktualisiert sich automatisch, sobald neue, geprüfte Werte vorliegen.`);
    return h;
  }
  /** «Hinweise» und «Was PensCheck vereinfacht oder nicht rechnet» als HTML. */
  function hintsHtml() {
    const h = hintsList();
    return `<h3>Hinweise</h3><ul>${h.map((x) => `<li>${x}</li>`).join('')}</ul>
      <h3>Was PensCheck vereinfacht oder nicht rechnet</h3><ul>${GRENZEN.map(([t, x]) => `<li><b>${t}:</b> ${x}</li>`).join('')}</ul>`;
  }

  // ---------- Ereignisse im Resultatbereich ----------
  $('results').addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    const s = S(), d = b.dataset;
    if (d.jview) { s.ui.jview = d.jview; app.persist(); app.buehne?.renderBody(); }
    else if (d.apply) varianteUebernehmen();
  });
  /** Rechenvariante der Tragbarkeit in die Eingaben übernehmen (Block «trag» und Tutor-Ergebnis, trag.js). */
  function varianteUebernehmen() {
    const s = S();
    if (!R()?.vs) return;
    const neu = JSON.parse(JSON.stringify(R().vs.amortisationen));
    if (s.amortisationen.length + neu.length > 30) { app.toast('Mehr als 30 Amortisationen lassen sich nicht erfassen.'); return; }
    s.amortisationen.push(...neu);
    s.ui.open.liegenschaften = true;
    app.formRender();
    app.changed();
    app.toast(`${neu.length === 1 ? 'Die Amortisation steht' : `${neu.length} Amortisationen stehen`} jetzt bei der Liegenschaft im Formular und lässt sich dort wieder entfernen.`);
  }
  app.varianteUebernehmen = varianteUebernehmen;
  // Was-wäre-wenn-Regler
  bindWhatIf($('sofort'), app);
  let rt;
  // Das Bild auch ohne Ergebnis neu zeichnen (Höhe aus dem Platz bzw. der Breite)
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => app.buehne?.renderBody(), 150); });

  return { render, stopA, hintsList, ansichtHtml, ansichtNach };
}
