// Formularmodus «Bühne»: Schrittleiste links (acht Schritte in zwei Gruppen) und Wahl der Blöcke auf der Bühne.
import { chf, esc } from '../lib/pension/format';
import { SCHRITT_IDS } from '../lib/pension/state';

const $ = (id) => document.getElementById(id);

/** Die acht Schritte: 1 bis 4 erfassen die Angaben, 5 bis 8 lesen das Ergebnis. */
export const SCHRITTE = [
  { id: 'situation', nr: 1, titel: 'Situation', gruppe: 'eingabe' },
  { id: 'einkommen', nr: 2, titel: 'Einkommen und Vorsorge', gruppe: 'eingabe' },
  { id: 'vermoegen', nr: 3, titel: 'Vermögen und Ausgaben', gruppe: 'eingabe' },
  { id: 'liegenschaft', nr: 4, titel: 'Liegenschaft', gruppe: 'eingabe' },
  { id: 'urteil', nr: 5, titel: 'Urteil', gruppe: 'auswertung' },
  { id: 'vergleich', nr: 6, titel: 'So oder so', gruppe: 'auswertung' },
  { id: 'ansatz', nr: 7, titel: 'Ansatzpunkte', gruppe: 'auswertung' },
  { id: 'aktion', nr: 8, titel: 'Aktionsplan', gruppe: 'auswertung' },
];
const NACH_ID = Object.fromEntries(SCHRITTE.map((s) => [s.id, s]));
/** Der Schritt nach id (oder null nach dem letzten). */
export const naechster = (id) => SCHRITTE[SCHRITTE.findIndex((s) => s.id === id) + 1] || null;

/**
 * Sichtbare Blöcke der Bühne je Schritt, gleich wie in styles.css (dort für die Darstellung, hier für den Fokus);
 * «hinweis» ist immer sichtbar. In Schritt 6 steht «vergleich» zuerst; «ansichten» entfällt dort, solange ein Vergleich
 * läuft (#results[data-vgl], vergleich.js): Das Bild steht dann im Block «vergleich».
 */
const BLOECKE = {
  situation: ['kopf', 'ansichten', 'themen'], einkommen: ['kopf', 'ansichten', 'themen'], vermoegen: ['kopf', 'ansichten', 'themen'],
  liegenschaft: ['kopf', 'trag', 'ansichten', 'themen'], urteil: ['kopf', 'trag', 'ansichten', 'themen'],
  vergleich: ['vergleich', 'ansichten', 'themen'], ansatz: ['ansatz'], aktion: ['aktion', 'abschluss'],
};

const personen = (S) => S.personen.slice(0, S.haushalt === 'single' ? 1 : 2);

/** Pflichtangabe der Schritte 1 bis 4 (1 und 4: keine). */
const PFLICHT = {
  einkommen: (S) => personen(S).some((p) => p.brutto > 0 || p.pkRente > 0 || p.ahvBetrag > 0),
  vermoegen: (S) => S.ausgabenRuhestand > 0,
};

/**
 * Zustand jedes Schritts: 'offen', 'erledigt' oder 'gesperrt'. 5 bis 8 sind gesperrt, solange kein Ergebnis vorliegt.
 * 1 bis 4 gelten als erledigt, wenn ein Ergebnis vorliegt oder der Schritt besucht wurde und seine Pflichtangabe vorliegt.
 */
export function schrittStatus(S, R) {
  const ergebnis = !!R && !R.leer, besucht = S.ui?.besucht || {};
  return Object.fromEntries(SCHRITTE.map(({ id, gruppe }) => {
    if (gruppe === 'auswertung') return [id, ergebnis ? 'offen' : 'gesperrt'];
    const ok = ergebnis || (!!besucht[id] && (!PFLICHT[id] || PFLICHT[id](S)));
    return [id, ok ? 'erledigt' : 'offen'];
  }));
}

/** Zusammenfassungen der Formularabschnitte (Rohtext; die Abschnittsköpfe setzen sie als textContent). */
export function abschnittTexte(S) {
  const ps = personen(S);
  const lgs = Array.isArray(S.liegenschaften) ? S.liegenschaften.filter((l) => l && l.verkehrswert > 0) : [];
  const V = (+S.liquiditaet || 0) + (+S.wertschriften || 0);
  return {
    haushalt: `${{ single: 'Alleinstehend', verheiratet: 'Verheiratet', konkubinat: 'Konkubinat' }[S.haushalt]}, ${S.kanton}`,
    personen: ps.map((p, i) => `P${i + 1}: ${p.jahrgang} ${p.geschlecht}, Pension ${p.pensAlter}`).join(' · '),
    einkommen: `Lohn ${ps.map((p) => chf(p.brutto || 0)).join(' / ')}${S.einkommen.length ? ` · ${S.einkommen.length} weitere` : ''}`,
    vermoegen: `${chf(V)} · ${chf(S.ausgabenRuhestand)}/Mt.`,
    liegenschaften: lgs.length ? `${lgs.length} Objekt${lgs.length > 1 ? 'e' : ''}, Hypotheken ${chf(lgs.reduce((x, l) => x + (+l.hypothek || 0), 0))}${S.amortisationen.length ? ` · ${S.amortisationen.length} Amortisation${S.amortisationen.length > 1 ? 'en' : ''}` : ''}` : 'keine',
  };
}

/** Kurzer Text für einen erledigten Schritt 1 bis 4, bereits maskiert; sonst ''. */
export function zusammenfassung(S, id) {
  const t = abschnittTexte(S);
  const roh = { situation: `${t.haushalt} · ${t.personen}`, einkommen: t.einkommen, vermoegen: t.vermoegen, liegenschaft: t.liegenschaften }[id];
  return roh ? esc(roh) : '';
}

const SPERRE = 'sobald die Ausgaben erfasst sind';

export function createSchritte(app) {
  const nav = $('schritte'), mobil = $('schritteMobil'), form = $('form');
  const knopf = ({ id, nr, titel }) => `<li><button type="button" class="schritt" data-schritt="${id}"><span class="snr" aria-hidden="true">${nr}</span><span class="stx"><b>${titel}</b><small data-szus></small></span><span class="vh" data-sstat></span></button></li>`;
  // Ab 1025 px lässt sich die linke Spalte ausblenden; die Schritte 5 bis 8 stehen dann über der Bühne (styles.css)
  nav.innerHTML = `<button type="button" class="leisteknopf" data-leiste="zu" aria-expanded="true" aria-controls="formwrap"><span aria-hidden="true">‹</span> Leiste ausblenden</button><details class="sleiste" open><summary><span class="st" data-sakt></span></summary>
    <ol class="sliste">${SCHRITTE.filter((s) => s.gruppe === 'eingabe').map(knopf).join('')}</ol>
    <p class="sgruppe" id="sgAuswertung"><b><span class="smob">5 bis 8 · </span>Auswertung</b><small id="sgSperre">${SPERRE}</small><small class="smob" id="sgMobil">unter «Ergebnis»</small></p>
    <ol class="sliste sliste-aus" start="5">${SCHRITTE.filter((s) => s.gruppe === 'auswertung').map(knopf).join('')}</ol></details>`;
  // Schmale Felder: lange Wörter trennen nur an der Silbengrenze
  const KURZ = { ansatz: 'Ansatz&shy;punkte', aktion: 'Aktions&shy;plan' };
  mobil.innerHTML = '<button type="button" class="schritt leisteauf" data-leiste="auf" aria-expanded="false" aria-controls="formwrap"><span class="snr" aria-hidden="true">›</span><b>Schritte und Eingaben</b></button>' + SCHRITTE.filter((s) => s.gruppe === 'auswertung')
    .map(({ id, nr, titel }) => `<button type="button" class="schritt" data-schritt="${id}"><span class="snr" aria-hidden="true">${nr}</span><b>${KURZ[id] || titel}</b></button>`).join('')
    + `<p class="cap" id="smSperre">${SPERRE}</p>`;
  // Die Felder des aktiven Schritts 1 bis 4 stehen in der Leiste direkt unter seinem Eintrag, sonst am Ende von #formwrap
  const heim = form.parentElement;
  const leiste = nav.querySelector('details');
  // Die Schrittleiste lässt sich nur bei mittlerer Breite einklappen; sonst ist sie immer offen
  const mittel = window.matchMedia?.('(min-width: 769px) and (max-width: 1024px)');
  mittel?.addEventListener?.('change', () => { if (!mittel.matches) leiste.open = true; });

  let offenFuer = null; // Schritt, für den die Abschnitte zuletzt aufgeklappt wurden

  function render() {
    const S = app.S, st = schrittStatus(S, app.R), gesperrt = st.urteil === 'gesperrt';
    // Ist das Ergebnis leer (keine Ausgaben), führt ein gesperrter Schritt 5 bis 8 zu den Ausgaben zurück (ohne
    // Fokuswechsel). Vor dem ersten Ergebnis (Neuladen) bleibt der gespeicherte Schritt; die Bühne rechnet noch.
    if (app.R && st[S.ui.schritt] === 'gesperrt') { S.ui.schritt = 'vermoegen'; app.persist(); }
    const aktiv = S.ui.schritt;
    document.body.dataset.schritt = aktiv;
    document.body.dataset.leiste = S.ui.leiste === 'zu' ? 'zu' : 'auf';
    const akt = NACH_ID[aktiv];
    nav.querySelector('[data-sakt]').textContent = `Schritt ${akt.nr} von ${SCHRITTE.length}: ${akt.titel}`;
    [nav, mobil].forEach((host) => host.querySelectorAll('button[data-schritt]').forEach((b) => {
      const id = b.dataset.schritt;
      b.dataset.status = st[id];
      if (id === aktiv) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      if (st[id] === 'gesperrt') { b.setAttribute('aria-disabled', 'true'); b.setAttribute('aria-describedby', host === mobil ? 'smSperre' : 'sgSperre'); } else { b.removeAttribute('aria-disabled'); b.removeAttribute('aria-describedby'); }
      const zus = b.querySelector('[data-szus]');
      if (zus) { zus.innerHTML = st[id] === 'erledigt' && id !== aktiv ? zusammenfassung(S, id) : ''; }
      const stat = b.querySelector('[data-sstat]');
      if (stat) stat.textContent = st[id] === 'erledigt' ? ', erledigt' : '';
    }));
    $('sgSperre').hidden = !gesperrt;
    $('sgMobil').hidden = gesperrt;
    $('smSperre').hidden = !gesperrt;
    const g = $('gespraech');
    if (g) {
      const b = S.bericht || {};
      g.textContent = [b.kunde, b.datum].map((x) => String(x ?? '').trim()).filter(Boolean).join(' · ');
      g.hidden = !g.textContent;
    }
    // Formular: nur die Abschnitte des aktiven Schritts; beim Wechsel des Schritts sind sie aufgeklappt
    form.querySelectorAll('[data-schritt]').forEach((el) => { el.hidden = el.dataset.schritt !== aktiv; });
    // Das Formular wandert zum aktiven Schritt; mit dem Fokus in einem Feld nur, wenn der Schritt gewechselt hat
    const ziel = akt.gruppe === 'eingabe' ? nav.querySelector(`button[data-schritt="${aktiv}"]`).parentElement : heim;
    if (form.parentElement !== ziel && (offenFuer !== aktiv || !form.contains(document.activeElement))) ziel.append(form);
    if (offenFuer !== aktiv) {
      form.querySelectorAll(`details.sec[data-schritt="${aktiv}"]`).forEach((d) => { if (d.dataset.sec !== 'annahmen' && d.dataset.sec !== 'teil') d.open = true; });
      offenFuer = aktiv;
    }
    const w = form.querySelector('[data-weiter="urteil"]');
    if (w) w.disabled = gesperrt;
  }

  /** Fokus nach dem Wechsel: Schritte 1 bis 4 auf den Knopf in der Leiste, 5 bis 8 auf die erste Überschrift der Bühne. */
  function fokus(id) {
    if (NACH_ID[id].gruppe === 'auswertung') {
      const sichtbar = BLOECKE[id];
      const block = [...document.querySelectorAll('#results > [data-block]')].find((el) => sichtbar.includes(el.dataset.block) && !el.hidden);
      const h = block?.querySelector('h2, h3, h4');
      if (h) { h.setAttribute('tabindex', '-1'); h.focus(); return; }
    }
    nav.querySelector(`button[data-schritt="${id}"]`)?.focus();
  }

  /** Linke Spalte ein- oder ausblenden (wirkt ab 1025 px); mit fokus steht er danach auf dem Knopf der Gegenrichtung. */
  function spalte(auf, fokus) {
    const neu = auf ? 'auf' : 'zu';
    if (app.S.ui.leiste === neu) return;
    app.S.ui.leiste = neu;
    document.body.dataset.leiste = neu;
    app.persist();
    if (fokus) (auf ? nav.querySelector('[data-leiste="zu"]') : mobil.querySelector('[data-leiste="auf"]'))?.focus();
  }
  function go(id) {
    if (!SCHRITT_IDS.includes(id)) return;
    if (schrittStatus(app.S, app.R)[id] === 'gesperrt') return;
    // Die Schritte 1 bis 4 haben ihre Felder in der linken Spalte
    if (NACH_ID[id].gruppe === 'eingabe') spalte(true);
    const ui = app.S.ui, alt = ui.schritt;
    if (alt !== id) ui.besucht[alt] = true;
    ui.schritt = id;
    document.body.dataset.schritt = id;
    app.persist();
    render();
    app.vergleich?.render();
    app.buehne?.render();
    fokus(id);
  }

  const klick = (ev) => {
    const b = ev.target.closest('button[data-schritt], button[data-weiter], button[data-leiste]');
    if (!b || b.disabled) return;
    if (b.dataset.leiste) { spalte(b.dataset.leiste === 'auf', true); return; }
    go(b.dataset.weiter || b.dataset.schritt);
  };
  // Klicks im eingebetteten Formular («Weiter») behandelt der Listener am Formular
  nav.addEventListener('click', (ev) => { if (!form.contains(ev.target)) klick(ev); });
  mobil.addEventListener('click', klick);
  form.addEventListener('click', (ev) => { if (ev.target.closest('button[data-weiter]')) klick(ev); });

  app.schritt = { go, render };
  app.leiste = spalte;
  return { render, go };
}
