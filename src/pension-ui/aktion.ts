// Aktionsplan im Ergebnis: Aufgaben nach Termin gruppiert, abhaken, als Kalenderdatei (.ics) speichern.
// Die Aufgaben rechnet der Worker (R.akt); erledigt-Haken liegen in S.aktion und lösen keine Neuberechnung aus.
// Formularmodus und Tutor-Ergebnis: drei nächste Aufgaben, Auswahl nach Zeitraum, volle Liste auf Wunsch, darunter
// «Aus Ihren Themen» (vorgemerkte Themenkarten). Im Tutor heisst der Block «Ihre nächsten drei Schritte.».
import { AKT_ART, aktGruppe, buildIcs } from '../lib/pension/aktion';
import { esc } from '../lib/pension/format';
import { karten, kartenName, STELLE_TXT } from '../lib/pension/themen';

export function createAktion(app) {
  const el = document.getElementById('akt');
  const done = (id) => !!(app.S.aktion && app.S.aktion[id]);
  const cpl = () => app.S.haushalt !== 'single';
  const tutor = () => app.S.ui?.mode === 'tutor';

  // Oberflächenzustand: gewählte Gruppe, «alle zeigen»; nicht im Link
  let gruppeGew = null, alleOffen = false;

  /** Beschreibt das fokussierte Element, damit ein Neuaufbau den Fokus halten kann. */
  function fokusInfo() {
    const a = document.activeElement;
    if (!a || !el.contains(a)) return null;
    if (a.dataset.akt != null) return { art: 'cb', id: a.dataset.akt, liste: a.closest('[data-liste]')?.dataset.liste };
    if (a.dataset.agr != null) return { art: 'agr', g: a.dataset.agr };
    if (a.hasAttribute('data-akt-alle')) return { art: 'alle' };
    if (a.hasAttribute('data-ics')) return { art: 'ics' };
    return null;
  }
  function fokusSetzen(f) {
    if (!f) return;
    let t = null;
    if (f.art === 'cb') {
      const sel = f.liste ? `[data-liste="${f.liste}"] [data-akt]` : '[data-akt]';
      t = [...el.querySelectorAll(sel)].find((x) => x.dataset.akt === f.id);
    } else if (f.art === 'agr') t = [...el.querySelectorAll('[data-agr]')].find((x) => x.dataset.agr === f.g);
    else if (f.art === 'alle') t = el.querySelector('[data-akt-alle]');
    else if (f.art === 'ics') t = el.querySelector('[data-ics]');
    t?.focus();
  }

  /**
   * «Aus Ihren Themen»: alle vorgemerkten Karten mit ihrem Ziel (Name maskiert); die Stelle von «Noch abklären» steht
   * daneben («bei: …»). Ohne solche Karten leer.
   */
  function themenHtml() {
    const S = app.S, vor = karten(S).filter((k) => k.status === 'vor');
    if (!vor.length) return '';
    return `<h3 class="ath">Aus Ihren Themen.</h3><ul class="athemen">${vor.map((k) => `<li><b>${esc(k.ziel.stelle ? k.titel : kartenName(S, k))}</b><span>${k.ziel.stelle ? `bei: ${esc(STELLE_TXT[k.ziel.stelle])}` : 'noch klären'}</span></li>`).join('')}</ul>`;
  }

  function render() {
    const r = app.R;
    if (!r || r.leer || !r.akt) { el.hidden = true; return; }
    el.hidden = false;
    const fokus = fokusInfo();
    const L = r.akt, now = app.E.A0;
    const offen = L.filter((x) => !done(x.id));
    const vorbei = offen.filter((x) => x.A != null && x.A < now && x.art !== 'empfehlung');
    const termine = offen.filter((x) => x.ics && x.A != null).length;
    const gr = [];
    L.forEach((x) => {
      const g = aktGruppe(x, now);
      let e = gr.find((z) => z.g === g);
      if (!e) gr.push((e = { g, items: [] }));
      e.items.push(x);
    });
    // Jede Liste hat eigene Element-Ids (pre), da dieselbe Aufgabe an mehreren Stellen stehen kann
    const item = (x, pre, n) => {
      const d = done(x.id), late = !d && x.A != null && x.A < now;
      return `<li class="ai${d ? ' done' : ''}${late ? ' late' : ''}">
        <input type="checkbox" id="${pre}${n}" data-akt="${esc(x.id)}"${d ? ' checked' : ''} aria-labelledby="${pre}${n}t ${pre}${n}w">
        <div class="aw" id="${pre}${n}w">${late ? 'vorbei: ' : ''}${esc(x.when)}</div>
        <div class="ab"><div class="at"><label for="${pre}${n}" id="${pre}${n}t">${esc(x.titel)}</label>${cpl() && x.person != null ? `<span class="ap">P${x.person + 1}</span>` : ''}<span class="aa a-${x.art}">${AKT_ART[x.art]}</span></div>
        <p class="ax">${esc(x.text)}</p><p class="as">Bei: ${esc(x.stelle)}</p></div></li>`;
    };
    const liste = (items, pre) => `<ul class="alist">${items.map((x, n) => item(x, pre, n)).join('')}</ul>`;
    const volle = (pre) => {
      let k = 0;
      return gr.map((g) => `<h4 class="agr">${esc(g.g)}</h4><ul class="alist">${g.items.map((x) => item(x, pre, k++)).join('')}</ul>`).join('');
    };
    const kopf = (titel) => `<div class="ahd">${titel}<span class="acnt">${L.length - offen.length} von ${L.length} erledigt</span><button type="button" class="bbz-button bbz-button--secondary sm" data-ics${termine ? '' : ' disabled'}>In den Kalender (.ics)</button></div>
      <p class="cap">Was wann zu tun ist, aus Ihren Angaben abgeleitet und rückwärts ab der Pensionierung gerechnet. Haken setzen, sobald erledigt.</p>
      ${vorbei.length ? `<p class="awarn"><b>${vorbei.length} ${vorbei.length === 1 ? 'Frist ist' : 'Fristen sind'} bereits vorbei.</b> Sofort mit der betreffenden Stelle klären, ob es noch möglich ist (z. B. Kapitalbezug bei der Pensionskasse).</p>` : ''}`;
    const schluss = '<p class="cap">Die Termine folgen Ihrem Plan, nicht dem Was-wäre-wenn-Szenario. Fristen der Pensionskasse unterscheiden sich stark; massgebend ist das Reglement. Die Haken bleiben in diesem Browser gespeichert und reisen mit dem Link mit.</p>';

    // Die drei frühesten offenen Aufgaben; null (jederzeit) zuletzt, bei Gleichstand Reihenfolge der Engine
    const naechste = offen.map((x, i) => [x, i]).sort((a, b) => (a[0].A ?? Infinity) - (b[0].A ?? Infinity) || a[1] - b[1]).slice(0, 3).map((z) => z[0]);
    if (!gr.some((g) => g.g === gruppeGew)) gruppeGew = gr[0]?.g ?? null;
    const gew = gr.find((g) => g.g === gruppeGew);
    // Im Tutor steht die Liste der nächsten Aufgaben direkt unter der Überschrift des Blocks
    el.innerHTML = `${tutor() ? kopf('<h2 id="aktTitel">Ihre nächsten drei Schritte.</h2>') : `${kopf('<h2 id="aktTitel">Aktionsplan.</h2>')}
      <h3 class="ath">Als Nächstes.</h3>`}
      <div class="anext" data-liste="next">${naechste.length ? liste(naechste, 'an') : '<p class="cap">Alle Aufgaben sind erledigt.</p>'}</div>
      <h3 class="ath">Alle Aufgaben nach Jahr.</h3>
      <div class="agrp" role="group" aria-label="Aufgaben nach Zeitraum">${gr.map((g) => `<button type="button" class="agb" data-agr="${esc(g.g)}" aria-pressed="${g.g === gruppeGew}">${esc(g.g)} <span class="n">${g.items.length}</span></button>`).join('')}</div>
      <div class="agsel" data-liste="gruppe">${gew ? liste(gew.items, 'ag') : ''}</div>
      <button type="button" class="bbz-button bbz-button--secondary sm agalle" data-akt-alle aria-expanded="${alleOffen}" aria-controls="aktAlle">${alleOffen ? 'Alle Aufgaben ausblenden' : `Alle ${L.length} Aufgaben zeigen`}</button>
      <div class="aalle" id="aktAlle" data-liste="alle"${alleOffen ? '' : ' hidden'}>${alleOffen ? volle('aa') : ''}</div>
      <div id="aktThemen">${themenHtml()}</div>
      ${schluss}`;
    fokusSetzen(fokus);
  }

  function download() {
    const r = app.R;
    if (!r || !r.akt) return;
    const ics = buildIcs(r.akt, app.E.A0, { done, cpl: cpl() });
    const kname = (app.S.bericht.kunde || '').replace(/[^A-Za-z0-9ÄÖÜäöüéèà_-]+/g, '_').slice(0, 40);
    const name = `PensCheck_Aktionsplan_${kname ? kname + '_' : ''}${new Date().toISOString().slice(0, 10)}.ics`;
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    app.toast(`${name} gespeichert. Öffnen Sie die Datei, um die Termine in Ihren Kalender zu übernehmen.`);
  }

  el.addEventListener('change', (ev) => {
    const cb = ev.target;
    if (!cb.dataset || cb.dataset.akt == null) return;
    const id = cb.dataset.akt, s = app.S;
    const liste = cb.closest('[data-liste]')?.dataset.liste;
    s.aktion = s.aktion || {};
    if (cb.checked) s.aktion[id] = 1;
    else delete s.aktion[id];
    app.persist();
    render();
    if (liste === 'next') {
      // Die Aufgabe verlässt «Als Nächstes»: Fokus auf das erste Kästchen dort, sonst auf die Gruppenknöpfe
      (el.querySelector('.anext [data-akt]') || el.querySelector('[data-agr]'))?.focus();
    } else fokusSetzen({ art: 'cb', id, liste });
  });
  el.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-ics]')) { download(); return; }
    const g = ev.target.closest('[data-agr]');
    if (g) { gruppeGew = g.dataset.agr; render(); return; }
    if (ev.target.closest('[data-akt-alle]')) { alleOffen = !alleOffen; render(); }
  });

  return { render };
}
