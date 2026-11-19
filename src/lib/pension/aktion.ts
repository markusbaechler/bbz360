// Aktionsplan: Fristen und To-dos rund um die Pensionierung, aus den Eingaben abgeleitet und
// rückwärts ab der Pensionierung gerechnet. Monatsnummer A = Jahr * 12 + (Monat - 1).
// art: 'frist' = gesetzliche oder feste Frist, 'reglement' = laut Reglement der PK prüfen, 'empfehlung' = Richtwert für den Zeitpunkt (keine Empfehlung im rechtlichen Sinn).
import { chf } from './format';
import type { Engine } from './engine';
import type { Auswertung, KapBezug, SimPerson, SimZeile } from './analyse';
import type { Liegenschaft, PensState, Person } from './typen';

/** Art einer Aufgabe, siehe AKT_ART. */
export type AktArt = keyof typeof AKT_ART;
/** Aufgabe des Aktionsplans (buildAktion). A = Monatsnummer des Termins oder null = jederzeit. */
export interface AktionEintrag {
  id: string;
  person: number | null;
  A: number | null;
  when: string;
  art: AktArt;
  stelle: string;
  titel: string;
  text: string;
  ics: boolean;
}
/** Optionen von buildIcs(). */
export interface IcsOptionen { done?: (id: string) => boolean; cpl?: boolean; today?: Date }

export const AKT_ART = { frist: 'Frist', reglement: 'Reglement prüfen', empfehlung: 'Richtwert' };
const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
export const monTxt = (A: number) => `${MONATE[((A % 12) + 12) % 12]} ${Math.floor(A / 12)}`;
/** Anmeldefrist der PK, wenn nichts erfasst ist: 3 Jahre, die längste übliche Frist. */
export const PK_FRIST_DEFAULT = 36;

/** Anmeldefrist in Monaten laut Eingabe oder null, wenn unbekannt. */
export const pkFrist = (p: Pick<Person, 'pkFrist'>) => (p.pkFrist === '' || p.pkFrist == null || !isFinite(+p.pkFrist) ? null : Math.max(0, Math.round(+p.pkFrist)));

/**
 * Aufgaben aus dem Planergebnis R (analyse) für den Eingabestand S, sortiert nach Termin.
 * Jede Aufgabe: { id, person, A (Monat oder null = jederzeit), when, art, stelle, titel, text, ics }.
 */
export function buildAktion(S: PensState, R: Auswertung, E: Engine): AktionEintrag[] {
  const base = R.base, ps = base.ps, cpl = ps.length > 1, verh = S.haushalt === 'verheiratet', now = E.A0, out: AktionEintrag[] = [];
  const add = (o: Omit<AktionEintrag, 'person' | 'ics'> & Partial<Pick<AktionEintrag, 'person' | 'ics'>>) => out.push({ person: null, ics: true, ...o });
  const bis = (A: number) => `bis Ende ${monTxt(A)}`;
  // AHV-Beiträge als Nichterwerbstätige bis zum Referenzalter (heutige Kaufkraft, Haushalt)
  const neSum = base.rows.reduce((x: number, r: SimZeile) => x + (r.ne || 0) / r.I, 0);

  ps.forEach((p: SimPerson, i: number) => {
    const frueh = p.Aret < p.Aref, erwerb = +p.brutto > 0, fr = pkFrist(p);
    // AHV: IK-Auszug und Rentenvorausberechnung
    if (!(p.ahvModus === 'betrag' && (p.ahvBetrag as number) > 0) && p.Aahv > now) add({ id: `ahv-vb-${i}`, person: i, A: now, when: 'jetzt', art: 'empfehlung', stelle: 'AHV-Ausgleichskasse',
      titel: 'IK-Auszug und Rentenvorausberechnung bestellen', text: 'Bei der Ausgleichskasse, in der Regel kostenlos. Zeigt Beitragslücken (nur 5 Jahre rückwirkend nachzahlbar) und die voraussichtliche AHV-Rente. Den Betrag danach unter «AHV» als eigenen Betrag erfassen.' });
    // Arbeitgeber
    if (erwerb && p.Aret > now) add({ id: `ag-${i}`, person: i, A: p.Aret - 4, when: bis(p.Aret - 4), art: 'empfehlung', stelle: 'Arbeitgeber',
      titel: frueh ? 'Arbeitsverhältnis kündigen' : 'Pensionierungstermin mit dem Arbeitgeber bestätigen',
      text: frueh ? `Letzter Arbeitstag Ende ${monTxt(p.Aret - 1)}. Kündigungsfrist laut Arbeitsvertrag prüfen (oft 3 Monate, bei Kaderstellen länger). Vorher die Bezugsform bei der Pensionskasse geklärt haben.` : `Letzter Arbeitstag Ende ${monTxt(p.Aret - 1)}. Viele Verträge enden mit dem Referenzalter automatisch; den Termin trotzdem schriftlich bestätigen lassen.` });
    // Teilpensionierung
    if (erwerb && p.teil && p.teil.Ateil > now) add({ id: `teil-${i}`, person: i, A: p.teil.Ateil - 6, when: bis(p.teil.Ateil - 6), art: 'empfehlung', stelle: 'Arbeitgeber, Pensionskasse',
      titel: `Teilpensionierung (Pensum ${Math.round(p.teil.pensum * 100)}%) vereinbaren`, text: `Ab ${monTxt(p.teil.Ateil)}. Das Pensum mit dem Arbeitgeber vertraglich regeln und der Pensionskasse melden: Teilbezug oder Weiterversicherung, je nach Reglement.` });

    // Pensionskasse: Kapitalbezug anmelden oder Bezugsform festlegen
    const kapBez: { A: number; betrag: number; teil?: boolean }[] = [];
    if (p.teil && p.teil.bezug && p.teil.pk.kapital > 0) kapBez.push({ A: p.teil.Ateil, betrag: p.teil.pk.kapital, teil: true });
    if (p.pk.kapital > 0) kapBez.push({ A: p.Aret, betrag: p.pk.kapital });
    const m = fr ?? PK_FRIST_DEFAULT;
    kapBez.forEach((k, j) => {
      const A = k.A - m - 1;
      add({ id: `pk-kap-${i}-${j}`, person: i, A, when: bis(A), art: fr == null ? 'reglement' : 'frist', stelle: 'Pensionskasse',
        titel: `${k.teil ? 'PK-Teilkapital' : 'PK-Kapitalbezug'} anmelden (${chf(k.betrag)})`,
        text: `Auszahlung ${monTxt(k.A)}. ${fr == null ? 'Anmeldefrist laut Reglement prüfen: Sie kann bis 3 Jahre betragen; gerechnet mit 3 Jahren. Die Frist unter «Pensionskasse» erfassen.' : `Anmeldefrist laut Reglement: ${m} Monate vor dem Bezug.`} Schriftlich anmelden; ohne Anmeldung gibt es eine Rente.${verh ? ' Bei Verheirateten braucht es die schriftliche Zustimmung des Ehegatten (meist beglaubigt).' : ''}` });
    });
    if (!kapBez.length && p.pk.rente > 0 && p.Aret > now) {
      const A = p.Aret - m - 1;
      add({ id: `pk-form-${i}`, person: i, A, when: bis(A), art: fr == null ? 'reglement' : 'frist', stelle: 'Pensionskasse',
        titel: 'Bezugsform festlegen: Rente oder Kapital', text: `Geplant ist die Rente (${chf(p.pk.rente)} pro Jahr). Wer ganz oder teilweise Kapital will, muss das fristgerecht anmelden${fr == null ? ' (laut Reglement, bis 3 Jahre vorher)' : ` (${fr} Monate vorher)`}. Später ist ein Wechsel nicht mehr möglich.` });
    }
    // Einkauf: Kapital erst 3 Jahre nach dem letzten Einkauf; ist der Termin vorbei, entfällt die Aufgabe
    if (kapBez.length && kapBez[0].A - 37 >= now) {
      const A = kapBez[0].A - 37;
      add({ id: `pk-eink-${i}`, person: i, A, when: bis(A), art: 'frist', stelle: 'Pensionskasse',
        titel: 'Letzter möglicher PK-Einkauf', text: 'Leistungen aus einem Einkauf dürfen 3 Jahre lang nicht als Kapital bezogen werden (Art. 79b Abs. 3 BVG); die Steuerbehörden verweigern den Abzug in der Regel bei jedem Kapitalbezug innert dieser Frist. Ein späterer Einkauf kann deshalb Steuerabzug und Kapitalbezug gefährden; mit Pensionskasse und Steueramt klären. Offene WEF-Vorbezüge zuerst zurückzahlen.' });
    }
    if (p.pk.fz > 0 && p.Aret > now) add({ id: `fz-konto-${i}`, person: i, A: p.Aret - 2, when: bis(p.Aret - 2), art: 'empfehlung', stelle: 'Freizügigkeitsstiftung',
      titel: 'Freizügigkeitskonten eröffnen', text: `Austritt vor dem frühesten Pensionsalter der Pensionskasse: Das Guthaben (rund ${chf(p.pk.fz)}) geht auf Freizügigkeit. Beim Austritt lässt sich das Guthaben auf zwei Stiftungen aufteilen; nur so ist später ein gestaffelter Bezug möglich. Bezug frühestens ${E.P.vorsorge.bezugJahreVorRef} Jahre vor dem Referenzalter.` });

    // Unfallversicherung
    if (erwerb && p.Aret > now) add({ id: `uvg-${i}`, person: i, A: p.Aret - 1, when: bis(p.Aret - 1), art: 'empfehlung', stelle: 'Krankenkasse',
      titel: 'Unfalldeckung in der Krankenkasse einschliessen', text: 'Die Nichtberufsunfallversicherung über den Arbeitgeber endet am 31. Tag nach dem Ende des Lohnanspruchs (Art. 3 Abs. 2 UVG); sie lässt sich mit einer Abredeversicherung um bis zu 6 Monate verlängern. Danach die Unfalldeckung in der Grundversicherung einschliessen.' });
    // Säule 3a: letzte Einzahlung
    if (erwerb && p.Aret > now && ((p.s3aModus || 'max') === 'max' || p.s3aEinz > 0)) add({ id: `3a-einz-${i}`, person: i, A: p.Aret - 1, when: bis(p.Aret - 1), art: 'empfehlung', stelle: 'Bank / 3a-Stiftung',
      titel: 'Letzte Einzahlung in die Säule 3a', text: 'Einzahlen ist nur mit Erwerbseinkommen möglich, im Jahr der Pensionierung also letztmals. Danach nur noch bei einem Nebenerwerb.' });

    // AHV: Beitragspflicht als Nichterwerbstätige
    if (frueh && p.Aret >= now - 12) {
      const A = Math.max(p.Aret, now);
      add({ id: `ne-${i}`, person: i, A, when: p.Aret > now ? `im ${monTxt(p.Aret)}` : 'jetzt', art: neSum > 0 ? 'frist' : 'empfehlung', stelle: 'Bisherige Ausgleichskasse (ab dem Jahr des 58. Geburtstags), sonst Ausgleichskasse des Wohnkantons',
        titel: neSum > 0 ? 'Als Nichterwerbstätige/r bei der AHV anmelden' : 'AHV-Beitragspflicht bis zum Referenzalter klären',
        text: neSum > 0 ? `Bis zum Referenzalter bleibt die Beitragspflicht. Die AHV meldet sich nicht von selbst; ohne Anmeldung droht eine Beitragslücke und damit eine tiefere Rente. Geschätzte Beiträge im Haushalt: rund ${chf(neSum)} bis zum Referenzalter (heutige Kaufkraft).` : 'Gemäss Rechnung fallen keine Beiträge als Nichterwerbstätige an (Nebenerwerb oder erwerbstätiger Ehepartner). Das von der Ausgleichskasse bestätigen lassen, damit keine Beitragslücke entsteht.' });
    }
    // AHV-Rente anmelden, vorbeziehen oder aufschieben
    if (p.Aahv > now) {
      const vor = p.ahvBez < 0, auf = p.ahvBez > 0;
      if (auf) {
        add({ id: `ahv-auf-${i}`, person: i, A: p.Aref - 2, when: bis(p.Aref - 2), art: 'frist', stelle: 'AHV-Ausgleichskasse',
          titel: `AHV-Aufschub erklären (${p.ahvBez} ${p.ahvBez === 1 ? 'Jahr' : 'Jahre'})`, text: `Den Aufschub mit der Anmeldung zum Referenzalter (${monTxt(p.Aref)}) erklären, spätestens innerhalb eines Jahres. Ohne Erklärung wird die Rente ab dem Referenzalter ausbezahlt.` });
        add({ id: `ahv-abruf-${i}`, person: i, A: p.Aahv - 4, when: bis(p.Aahv - 4), art: 'empfehlung', stelle: 'AHV-Ausgleichskasse',
          titel: 'Aufgeschobene AHV-Rente abrufen', text: `Rentenbeginn ${monTxt(p.Aahv)}. Abruf 3 bis 4 Monate vorher; ein Abruf ist auch früher monatsweise möglich.` });
      } else add({ id: `ahv-anm-${i}`, person: i, A: p.Aahv - 4, when: vor ? `${bis(p.Aahv - 4)}, spätestens Ende ${monTxt(p.Aahv - 1)}` : bis(p.Aahv - 4), art: vor ? 'frist' : 'empfehlung', stelle: 'AHV-Ausgleichskasse',
        titel: vor ? `AHV-Vorbezug anmelden (${-p.ahvBez} ${p.ahvBez === -1 ? 'Jahr' : 'Jahre'})` : 'AHV-Rente anmelden',
        text: `Rentenbeginn ${monTxt(p.Aahv)}. Anmeldeformular bei der Ausgleichskasse einreichen, bei der zuletzt Beiträge bezahlt wurden${cpl ? '; bezieht der Partner bereits eine Rente, bei dessen Kasse' : ''}. Empfohlen 3 bis 4 Monate vorher.${vor ? ` Beim Vorbezug gilt: Auszahlung frühestens ab dem Folgemonat der Anmeldung, rückwirkend nicht möglich. Die Rente ist lebenslang um ${((1 - p.ahvF) * 100).toFixed(1)}% gekürzt; die Beitragspflicht bis zum Referenzalter bleibt.` : ' Die Rente kommt nicht automatisch.'}` });
    }
  });

  // Kapitalbezüge aus 3a und Freizügigkeit, Vorbezüge zur Amortisation
  base.kapListe.forEach((e: KapBezug) => {
    if (e.A < now - 1 || /^PK/.test(e.art)) return;
    const i = e.person, vb = /Vorbezug/.test(e.art), A = e.A - (vb ? 3 : 2);
    add({ id: `kap-${i}-${e.art}-${e.year}`, person: i, A, when: bis(A), art: 'empfehlung', stelle: /3a/.test(e.art) ? 'Bank / 3a-Stiftung' : 'Freizügigkeitsstiftung',
      titel: vb ? `${e.art.replace(/ für Amortisation.*/, '')} zur Amortisation organisieren` : `${e.art} beziehen (${chf(e.betrag)})`,
      text: vb ? `Vorbezug im ${monTxt(e.A)} über ${chf(e.betrag)}; das Geld geht direkt an die Bank. Mit Bank und Stiftung koordinieren; nur für selbst bewohntes Eigentum.${verh ? ' Zustimmung des Ehegatten nötig.' : ''}`
        : `Auszahlung im ${monTxt(e.A)} beantragen (Formular der Stiftung, Ausweiskopie${/Freiz/.test(e.art) && verh ? ', Zustimmung des Ehegatten' : ''}). Massgebend für die Steuer ist das Kalenderjahr ${e.year}; den Termin nicht ins Folgejahr rutschen lassen.` });
  });
  // Steuern auf Kapitalbezügen pro Jahr bereithalten
  const jahre: Record<string, { A: number; st: number; n: number }> = {};
  base.kapListe.forEach((e: KapBezug) => {
    if (e.A < now - 1) return;
    const j = (jahre[e.year] = jahre[e.year] || { A: e.A, st: 0, n: 0 });
    j.A = Math.min(j.A, e.A);
    j.st += e.steuer;
    j.n++;
  });
  Object.entries(jahre).forEach(([y, j]) => {
    if (j.st < 500) return;
    add({ id: `steuer-${y}`, A: j.A, when: `ab ${monTxt(j.A)}`, art: 'empfehlung', stelle: 'Steueramt',
      titel: `Steuer auf Kapitalbezügen ${y} zurückstellen (rund ${chf(Math.round(j.st / 100) * 100)})`, text: `Die Kapitalleistungssteuer wird separat veranlagt, meist einige Monate nach dem Bezug. Der Betrag wird dann fällig.${j.n > 1 ? ` Mehrere Bezüge im selben Jahr werden ${verh ? 'beim Ehepaar ' : ''}zusammengezählt.` : ''}` });
  });
  // Hypothek und Tragbarkeit
  const eigen = E.getLgs(S).filter((l: Liegenschaft) => (l.typ || 'eigen') === 'eigen' && l.hypothek > 0);
  if (eigen.length) {
    const r1 = Math.min(...ps.map((p: SimPerson) => p.Aret)), A = Math.max(now, r1 - 24), w = R.tr && R.tr.worst;
    add({ id: 'hyp', A, when: A <= now ? 'jetzt' : `ab ${monTxt(A)}`, art: 'empfehlung', stelle: 'Bank',
      titel: 'Hypothek und Tragbarkeit mit der Bank klären', text: `Die Bank rechnet die Tragbarkeit mit dem Einkommen nach der Pensionierung. Laufzeiten der Festhypotheken und Verlängerung vor der Pensionierung regeln.${w && w.st !== 'gruen' ? ` Gemäss Rechnung liegt die Belastung bei ${Math.round(w.quote * 100)}%; eine Amortisation von rund ${chf(Math.ceil(w.amort / 1000) * 1000)} bis ${w.datum} würde die Hypothek rechnerisch tragbar machen.` : ''}` });
  }
  // Jederzeit
  add({ id: 'dok', A: null, when: 'jederzeit', art: 'empfehlung', stelle: 'Notariat, Pensionskasse, Bank', ics: false,
    titel: 'Vorsorgedokumente prüfen', text: `Begünstigung bei Pensionskasse, 3a und Freizügigkeit, Testament${verh ? ' und Ehevertrag' : ''}, Vorsorgeauftrag und Patientenverfügung an die neue Situation anpassen.` });
  add({ id: 'budget', A: null, when: 'jederzeit', art: 'empfehlung', stelle: 'eigene Unterlagen', ics: false,
    titel: 'Budget für den Ruhestand nachführen', text: 'Die Ausgaben ein Jahr vor der Pensionierung erfassen und mit den Annahmen in PensCheck vergleichen, insbesondere Krankenkasse, Wohnen und Mobilität.' });

  out.sort((a, b) => (a.A ?? 1e9) - (b.A ?? 1e9) || (a.person ?? 9) - (b.person ?? 9));
  return out;
}

/** Gruppe für die Anzeige: «Jetzt angehen» (bis 2 Monate), Jahr oder «Jederzeit». */
export const aktGruppe = (x: Pick<AktionEintrag, 'A'>, now: number) => (x.A == null ? 'Jederzeit' : x.A <= now + 2 ? 'Jetzt angehen' : String(Math.floor(x.A / 12)));

// ---------- Kalenderdatei (iCalendar, RFC 5545) ----------
const icsEsc = (s: string) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const utf8Len = (ch: string) => new TextEncoder().encode(ch).length;
/** Zeilen auf höchstens 75 Oktette falten; Folgezeilen beginnen mit einem Leerzeichen. */
function fold(line: string) {
  const out: string[] = [];
  let cur = '', len = 0;
  for (const ch of line) {
    const n = utf8Len(ch);
    if (len + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; len = 0; }
    cur += ch;
    len += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

/**
 * Offene Aufgaben mit Termin als ganztägige Termine am Monatsersten (bei «jetzt» oder vorbei: am nächsten Tag).
 * Erinnerung eine Woche vorher; läge sie in der Vergangenheit, am Tag selbst um 9 Uhr.
 * Die UID hängt nur von der Aufgabe ab: Ein erneuter Export aktualisiert die Termine, statt sie zu verdoppeln.
 * done(id) = erledigt; today = Datum für DTSTAMP und «jetzt».
 */
export function buildIcs(list: AktionEintrag[], now: number, { done = () => false, cpl = false, today = new Date() }: IcsOptionen = {}) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const ymd = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
  const stamp = today.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  // Spätere Exporte ersetzen frühere (höhere SEQUENCE): Minuten seit 2026
  const seq = Math.max(0, Math.floor((today.getTime() - Date.UTC(2026, 0, 1)) / 60000));
  const ev = list.filter((x) => x.ics && x.A != null && !done(x.id)).map((x) => {
    const A = Math.max(x.A!, now), y = Math.floor(A / 12), m = A % 12;
    const start = A === now ? new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() + 1)) : new Date(Date.UTC(y, m, 1));
    const end = new Date(start.getTime() + 864e5);
    const heute0 = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const trigger = start.getTime() - 7 * 864e5 > heute0 ? '-P7D' : 'PT9H';
    return [
      'BEGIN:VEVENT', `UID:penscheck-${x.id.replace(/[^\w-]+/g, '_')}@bankenberatungszentrum.ch`, `DTSTAMP:${stamp}`, `SEQUENCE:${seq}`,
      `DTSTART;VALUE=DATE:${ymd(start)}`, `DTEND;VALUE=DATE:${ymd(end)}`,
      fold(`SUMMARY:${icsEsc((cpl && x.person != null ? `P${x.person + 1}: ` : '') + x.titel)}`),
      fold(`DESCRIPTION:${icsEsc(`${x.when} (${AKT_ART[x.art]}). ${x.text} Bei: ${x.stelle}`)}`),
      'BEGIN:VALARM', 'ACTION:DISPLAY', `TRIGGER:${trigger}`, fold(`DESCRIPTION:${icsEsc(x.titel)}`), 'END:VALARM', 'END:VEVENT',
    ].join('\r\n');
  });
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Bankenberatungszentrum//PensCheck//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', ...ev, 'END:VCALENDAR', ''].join('\r\n');
}
