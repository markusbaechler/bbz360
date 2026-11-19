// Ansatzpunkte als Karten: erster Satz sichtbar, voller Text hinter «mehr», ab der vierten Karte hinter einem Knopf.
import { esc } from '../lib/pension/format';
import type { OptHinweis } from '../lib/pension/analyse';

/** Wörter, nach denen ein Punkt keinen Satz beendet. */
const KUERZEL = new Set(['z', 'b', 'ca', 'bzw', 'usw', 'etc', 'art', 'abs', 'nr', 'max', 'min', 'ggf', 'inkl', 'evtl', 'vgl', 'resp', 'd', 'h', 'u', 'a', 'mio', 'mrd', 'ev', 'bspw', 'sog']);
const GROSS = /[A-ZÄÖÜ«"„(]/;

/** Erster Satz von x; null, wenn der Text nur aus einem Satz besteht. */
export function ersterSatz(x: unknown): string | null {
  const t = String(x ?? '').trim();
  const re = /\. +(?=\S)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const naechstes = t[m.index + m[0].length];
    if (!GROSS.test(naechstes)) continue;
    const wort = t.slice(0, m.index).split(/\s/).pop()!.toLowerCase().replace(/^[^a-zäöü0-9]+/, '');
    if (KUERZEL.has(wort) || /^\d{1,2}$/.test(wort) || wort.length === 1) continue;
    return t.slice(0, m.index + 1);
  }
  return null;
}

function karte(o: OptHinweis) {
  const kurz = ersterSatz(o.x), voll = String(o.x ?? '');
  return `<article class="apk"><h4>${esc(o.t)}</h4>${o.v ? `<p class="apk-v optv">${esc(o.v)}</p>` : ''}<p class="apk-t">${esc(kurz ?? voll)}</p>${kurz ? `<details><summary>mehr</summary><p>${esc(voll)}</p></details>` : ''}</article>`;
}

/** HTML des Blocks «Ansatzpunkte»; opt = Liste { t, v, x }; { offen, h2 } (h2: verborgene Überschrift der Ebene 2 davor). */
export function ansatzHtml(opt: OptHinweis[] | null | undefined, { offen = false, h2 = false }: { offen?: boolean; h2?: boolean } = {}) {
  const kopf = `${h2 ? '<h2 class="vh">Ansatzpunkte.</h2>' : ''}<h3>Ansatzpunkte zum Prüfen.</h3>`;
  if (!opt?.length) return `${kopf}<p class="cap">Mit den erfassten Angaben sind keine offensichtlichen Ansatzpunkte erkennbar.</p>`;
  const vorn = opt.slice(0, 3), rest = opt.slice(3);
  const mehr = rest.length
    ? `<div class="apk-mehr" id="apkMehr"${offen ? '' : ' hidden'}>${rest.map(karte).join('')}</div><button type="button" class="apk-knopf" data-mehr-ansatz data-n="${rest.length}" aria-expanded="${offen}" aria-controls="apkMehr">${mehrText(rest.length, offen)}</button>`
    : '';
  return `${kopf}<div class="apk-liste">${vorn.map(karte).join('')}</div>${mehr}<p class="cap">Rechnerische Hinweise aus Ihren Angaben, keine Empfehlung. Grobe Schätzungen: Die Wirkung hängt von Reglement, Steuersituation, Risikofähigkeit und Anlage ab und ist mit einer Fachperson zu prüfen.</p>`;
}

export const mehrText = (n: number | string, offen: boolean) => (offen ? 'Weitere Ansatzpunkte ausblenden' : `${n} weitere Ansatzpunkte zeigen`);
