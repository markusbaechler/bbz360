// Fachbegriffe zum Antippen: kurze Erklärung in einem kleinen Fenster beim Begriff (Toggletip).
// gl(key, text) erzeugt den Begriff im Text; initGlossar(app) richtet das Fenster einmal für die ganze App ein.
import { chf, dec } from '../lib/pension/format';
import type { PensState } from '../lib/pension/typen';
import type { App } from './app';

/** Stufen der Ampel. */
export type AmpelStufe = 'gruen' | 'gelb' | 'rot';

const pc = (v: number) => `${dec(v * 100)}%`;

/** Was die drei Stufen der Ampel bedeuten, je ein Satz (Glossar, Ausdruck und PDF-Bericht verwenden denselben Wortlaut). */
export function ampelSaetze(S: Partial<Pick<PensState, 'reserveJahre'>> = {}) {
  return {
    gruen: `Das freie Vermögen reicht im Basisszenario bis zum Planungshorizont, am Schluss bleibt die Reserve${+S.reserveJahre! > 0 ? ` von ${+S.reserveJahre!} Jahresausgaben` : ''}, und auch im Stresstest geht das Geld nicht aus.`,
    gelb: 'Im Basisszenario reicht es, aber die Reserve wird unterschritten oder das Geld geht im Stresstest aus.',
    rot: 'Schon im Basisszenario ist das freie Vermögen vor dem Planungshorizont aufgebraucht.',
    liegenschaft: 'Eine Liegenschaft kann die Ampel um eine Stufe verbessern, wenn eine Lücke erst ab 85 entsteht und ihr Eigenkapital sie deckt (für «Reicht» muss zudem die Hypothek tragbar sein).',
  };
}
/** Ein Satz zur erreichten Stufe für Ausdruck und PDF-Bericht: «Reicht» bedeutet: … */
export const ampelSatz = (st: string, S?: Partial<Pick<PensState, 'reserveJahre'>>) => `«${{ gruen: 'Reicht', gelb: 'Knapp', rot: 'Reicht nicht' }[st as AmpelStufe]}» bedeutet: ${ampelSaetze(S)[st as AmpelStufe]}`;

/** Begriff → [Titel, Erklärung]; Werte aus den Grundlagen des laufenden Jahres. */
export function terms(app: Pick<App, 'P' | 'S'>): Record<string, string[]> {
  const P = app.P, S = app.S || {}, A = P.ahv, U = A.uebergang, T = P.annahmen.tragbarkeit, j = P.meta.jahr;
  return {
    referenzalter: ['AHV-Referenzalter', `Das Alter, ab dem die AHV-Rente ohne Kürzung oder Zuschlag ausbezahlt wird: 65 Jahre für Männer und Frauen. Für Frauen der Jahrgänge 1961 bis 1963 gelten Übergangsstufen zwischen 64 Jahren und 3 Monaten und 64 Jahren und 9 Monaten.`],
    vorbezug: ['AHV-Vorbezug', `Die AHV-Rente lässt sich bis zu 2 Jahre vor dem Referenzalter beziehen${U ? `, Frauen der Jahrgänge ${U.jahrgaenge[0]} bis ${U.jahrgaenge[1]} bis zu ${U.maxJahre} Jahre, frühestens ab 62` : ''}. Sie ist dann lebenslang gekürzt, um ${pc(A.vorbezug['1'])} pro Jahr Vorbezug${U ? ' (für die Übergangsgeneration je nach Einkommen weniger)' : ''}.`],
    aufschub: ['AHV-Aufschub', `Die AHV-Rente lässt sich um 1 bis 5 Jahre aufschieben. Sie steigt dafür lebenslang, um ${pc(A.aufschub['1'])} nach einem Jahr bis ${pc(A.aufschub['5'])} nach fünf Jahren. Den Aufschub muss man bei der Ausgleichskasse erklären.`],
    vorausberechnung: ['Rentenvorausberechnung', 'Die Ausgleichskasse berechnet auf Antrag und in der Regel kostenlos, wie hoch die AHV-Rente voraussichtlich wird. Der Auszug aus dem individuellen Konto (IK) zeigt zudem, ob Beitragsjahre fehlen.'],
    plafonierung: ['Begrenzung bei Ehepaaren', `Verheiratete erhalten zusammen höchstens 150% der maximalen Einzelrente, ${j} sind das ${chf(A.plafondEhepaar)} pro Monat. Unverheiratete Paare erhalten zwei volle Renten.`],
    nichterwerbstaetige: ['AHV-Beiträge als Nichterwerbstätige', `Wer vor dem Referenzalter aufhört zu arbeiten, bleibt AHV-beitragspflichtig. Der Beitrag richtet sich nach dem Vermögen, einschliesslich Liegenschaften abzüglich Hypotheken; dazu zählen auch die Renten (das ${P.ne.rentenFaktor}-Fache der Jahresrente). ${j}: mindestens ${chf(P.ne.min)}, höchstens ${chf(P.ne.max)} pro Jahr. Anmelden muss man sich selbst.`],
    kapitalbezug: ['Kapitalbezug', 'Statt einer Rente zahlt die Pensionskasse einen Teil oder das ganze Altersguthaben auf einmal aus. Mindestens ein Viertel des gesetzlichen Guthabens ist immer möglich, mehr je nach Reglement. Der Bezug muss je nach Reglement bis zu 3 Jahre im Voraus angemeldet werden und wird einmalig, getrennt vom übrigen Einkommen besteuert. Verheiratete brauchen die Zustimmung des Ehegatten.'],
    umwandlungssatz: ['Umwandlungssatz', `Mit diesem Satz rechnet die Pensionskasse das Altersguthaben in eine Rente um: Bei 5% ergibt ein Guthaben von ${chf(500000)} eine Rente von ${chf(25000)} pro Jahr. Für den gesetzlichen Teil gilt mindestens 6.8%; viele Kassen rechnen insgesamt tiefer, und bei einer Frühpensionierung sinkt der Satz.`],
    einkauf: ['Einkauf in die Pensionskasse', 'Eine freiwillige Einzahlung, die Lücken in der Pensionskasse schliesst und Rente oder Kapital erhöht. Sie ist voll vom steuerbaren Einkommen abziehbar. Die Leistungen aus dem Einkauf dürfen danach 3 Jahre lang nicht als Kapital bezogen werden (Art. 79b Abs. 3 BVG); steuerlich gilt das in der Praxis für jeden Kapitalbezug innert dieser Frist.'],
    freizuegigkeit: ['Freizügigkeit', `Wer die Pensionskasse ohne neue Stelle verlässt, etwa bei einer Frühpensionierung vor dem frühesten Pensionsalter, erhält sein Guthaben auf ein Freizügigkeitskonto oder -depot. Ausbezahlt wird es frühestens ${P.vorsorge.bezugJahreVorRef} Jahre vor dem AHV-Referenzalter.`],
    s3a: ['Säule 3a', `Steuerbegünstigtes Vorsorgesparen. Einzahlungen sind vom steuerbaren Einkommen abziehbar, mit Pensionskasse ${j} höchstens ${chf(P.s3a.maxMitPK)} pro Jahr, und nur mit Erwerbseinkommen möglich. Bezug frühestens ${P.vorsorge.bezugJahreVorRef} Jahre vor dem AHV-Referenzalter.`],
    freiesVermoegen: ['Freies Vermögen', 'Geld auf Konten und in Wertschriften, über das Sie jederzeit verfügen. Nicht dazu gehören Liegenschaften sowie Pensionskasse, Säule 3a und Freizügigkeit, solange sie nicht ausbezahlt sind.'],
    kaufkraft: ['Heutige Kaufkraft', `Künftige Beträge, mit der angenommenen Teuerung von ${dec(+S.inflation || 0)}% pro Jahr auf heutige Preise zurückgerechnet. So lassen sich Beträge aus verschiedenen Jahren direkt vergleichen.`],
    stresstest: ['Stresstest', 'Dieselbe Rechnung mit 1 Prozentpunkt weniger Rendite auf den Wertschriften und einem Leben bis 100. Reicht es auch dann, ist der Plan robust.'],
    lebenserwartung: ['Lebenserwartung', 'Durchschnittliche Lebenserwartung laut Bundesamt für Statistik (BFS). Viele Menschen leben länger als der Durchschnitt; PensCheck rechnet deshalb standardmässig 5 Jahre darüber hinaus.'],
    ampel: ['Ampel: Reicht, Knapp, Reicht nicht', (() => { const a = ampelSaetze(S); return `<b>Reicht</b>: ${a.gruen} <b>Knapp</b>: ${a.gelb} <b>Reicht nicht</b>: ${a.rot} ${a.liegenschaft}`; })()],
    tragbarkeit: ['Tragbarkeit', `Die Bank rechnet mit einem kalkulatorischen Zins von ${pc(T.zins)} auf der Hypothek und ${pc(T.unterhalt)} Unterhalt auf dem Wert der Liegenschaft. Diese Kosten sollen höchstens rund ${dec(+S.tragGrenze || 35, 0)}% des Einkommens ausmachen (Einstellung im Formular; üblich sind 33 bis 38%, viele Banken rechnen mit einem Drittel). Nach der Pensionierung sinkt das Einkommen; dann wird es oft knapp.`],
  };
}

/** Begriff im Text, der beim Antippen seine Erklärung zeigt. */
export const gl = (key: string, text: string) => `<button type="button" class="gl" data-gl="${key}" aria-expanded="false" aria-controls="glTip">${text}</button>`;

export function initGlossar(app: Pick<App, 'P' | 'S'>) {
  const tip = document.createElement('div');
  tip.id = 'glTip';
  tip.className = 'gltip';
  tip.hidden = true;
  tip.innerHTML = '<div class="gl-body" role="status" aria-live="polite"></div><button type="button" class="gl-x" aria-label="Erklärung schliessen">×</button>';
  document.body.appendChild(tip);
  const body = tip.querySelector('.gl-body')!;
  let cur: HTMLElement | null = null;

  function close(focus?: boolean) {
    if (!cur) return;
    tip.hidden = true;
    cur.setAttribute('aria-expanded', 'false');
    if (focus && cur.isConnected) cur.focus();
    cur = null;
  }
  function place(btn: HTMLElement) {
    const r = btn.getBoundingClientRect(), w = Math.min(340, window.innerWidth - 32);
    tip.style.width = `${w}px`;
    const left = Math.max(16, Math.min(window.innerWidth - 16 - w, r.left));
    const h = tip.offsetHeight, below = r.bottom + 8 + h <= window.innerHeight || r.top - 8 - h < 0;
    tip.style.left = `${left + window.scrollX}px`;
    tip.style.top = `${(below ? r.bottom + 8 : r.top - 8 - h) + window.scrollY}px`;
  }
  function open(btn: HTMLElement) {
    const t = terms(app)[btn.dataset.gl!];
    if (!t) return;
    if (cur) cur.setAttribute('aria-expanded', 'false');
    cur = btn;
    btn.setAttribute('aria-expanded', 'true');
    tip.hidden = false;
    body.innerHTML = `<b>${t[0]}</b><p>${t[1]}</p>`;
    place(btn);
  }

  // Mit der Maus genügt Darüberfahren; ein Klick hält die Erklärung offen, bis sie geschlossen wird
  let schwebt = false;
  document.addEventListener('pointerover', (ev) => {
    if (ev.pointerType !== 'mouse') return;
    const b = (ev.target as Element).closest?.<HTMLElement>('[data-gl]');
    if (!b || cur === b) return;
    open(b); schwebt = true;
  });
  document.addEventListener('pointerout', (ev) => {
    if (!schwebt || !cur) return;
    const von = (ev.target as Element).closest?.('[data-gl]') === cur || tip.contains(ev.target as Node), nach = ev.relatedTarget as Node | null;
    if (von && !(nach && (tip.contains(nach) || cur.contains(nach)))) { schwebt = false; close(); }
  });
  document.addEventListener('click', (ev) => {
    const b = (ev.target as Element).closest<HTMLElement>('[data-gl]');
    if (b) {
      // Begriffe stehen auch in Feldbeschriftungen: das Feld dahinter nicht auslösen
      ev.preventDefault();
      if (cur === b && !tip.hidden && !schwebt) close();
      else open(b);
      schwebt = false;
      return;
    }
    if ((ev.target as Element).closest('.gl-x')) { close(true); return; }
    if (!tip.contains(ev.target as Node)) close();
  });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && cur) close(true); });
  window.addEventListener('resize', () => close());
}
