// PDF-Bericht (jsPDF, wird erst beim Klick geladen) nach bbz Brand System:
// Grundschrift Selawik, Titel ab 20 pt in Space Grotesk, Markenfarben, Logo 15 mm hoch.
import { chf, chfSigned, nf, dec } from '../lib/pension/format';
import { ANBIETER, HINWEIS, GRENZEN, DATENSCHUTZ } from '../lib/pension/config';
import { tragText } from './trag';
import { pufferText, BUDGET_POS } from '../lib/pension/budget';
import { budgetWerte } from '../lib/pension/analyse';
import { reportText } from './whatif';
import { AKT_ART } from '../lib/pension/aktion';
import { reachText } from './reach';
import { karten, kartenName, STELLE_TXT } from '../lib/pension/themen';
import { bildDaten, bildSzenario } from './bild';
import { bildPdf } from './reportbild';
import { ampelSatz } from './glossar';
import selawikRegular from '../styles/pension/fonts/Selawik-Regular.ttf?url';
import selawikBold from '../styles/pension/fonts/Selawik-Bold.ttf?url';
import groteskBold from '../styles/pension/fonts/SpaceGrotesk-Bold.ttf?url';
import logoPng from '../styles/pension/bbz-logo-240.png?url';

const strip = (s) => String(s ?? '').replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
// Buchstaben ausserhalb von Latin-1 auf den Grundbuchstaben zurückführen («Kovačević» → «Kovacevic»), statt sie zu verlieren
const TRANSLIT = { ł: 'l', Ł: 'L', đ: 'd', Đ: 'D', ı: 'i', œ: 'oe', Œ: 'OE', ő: 'ö', Ő: 'Ö', ű: 'ü', Ű: 'Ü', ĳ: 'ij' };
const latin1 = (s) => s.replace(/[^\u0000-\u00ff]/g, (c) => {
  if (TRANSLIT[c]) return TRANSLIT[c];
  const basis = c.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return basis !== c && /^[\u0000-\u00ff]+$/.test(basis) ? basis : c;
});
// Zeichen ausserhalb des Schriftumfangs ersetzen
export const pdfTxt = (s) => latin1(strip(s))
  .replace(/−/g, '-').replace(/≈/g, 'ca.').replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/✓/g, 'ok')
  .replace(/[   ]/g, ' ')
  .replace(/[^\u0000-ÿ–—‘’“”…€]/g, '');
// Von Hand erfasste Texte (Namen von Personen, Wünschen, Liegenschaften): spitze Klammern sind Text, kein Markup
const frei = (s) => String(s ?? '').replace(/</g, '(').replace(/>/g, ')');

/**
 * Zeilen des Abschnitts «Vorgemerkte Themen»: nur Karten im Zustand «vorgemerkt», mit ihrem Ziel (Person,
 * Liegenschaft); eine laufende Variante gehört nicht in den Bericht.
 */
export function themenZeilen(S) {
  return karten(S).filter((k) => k.status === 'vor').map((k) => pdfTxt(frei(
    k.karte === 'abklaeren' ? `Noch abklären${STELLE_TXT[k.ziel.stelle] ? ': ' + STELLE_TXT[k.ziel.stelle] : ''}` : `${kartenName(S, k)}: vorgemerkt, noch zu klären`)));
}

// Markenfarben aus bbz-base.css als RGB
const C = {
  brand: [0, 64, 120], strong: [21, 24, 30], text: [60, 66, 78], muted: [83, 89, 101], line: [191, 196, 207], subtle: [247, 248, 250],
  gruen: [17, 95, 59], gelb: [142, 94, 12], rot: [147, 37, 40],
};

async function b64(url) {
  const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function buildReport(app) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const S = app.S, R = app.R, P = app.P;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setProperties({ title: 'PensCheck – Standortbestimmung zur Pensionierung', subject: 'Bericht', creator: 'PensCheck' });
  doc.setLanguage('de-CH');
  // Hausschriften einbetten; ohne Netz und Cache bleibt Helvetica als Rückfall
  let BODY = 'helvetica', HEAD = 'helvetica', logo = null;
  try {
    const [r, b, g, l] = await Promise.all([b64(selawikRegular), b64(selawikBold), b64(groteskBold), b64(logoPng)]);
    doc.addFileToVFS('Selawik-Regular.ttf', r); doc.addFont('Selawik-Regular.ttf', 'Selawik', 'normal');
    doc.addFileToVFS('Selawik-Bold.ttf', b); doc.addFont('Selawik-Bold.ttf', 'Selawik', 'bold');
    doc.addFileToVFS('SpaceGrotesk-Bold.ttf', g); doc.addFont('SpaceGrotesk-Bold.ttf', 'SpaceGrotesk', 'bold');
    BODY = 'Selawik'; HEAD = 'SpaceGrotesk'; logo = l;
  } catch { /* Rückfall Helvetica */ }
  const W = 210, M = 16, CW = W - 2 * M;
  let y = M;
  const ensure = (h) => { if (y + h > 297 - 18) { doc.addPage(); y = M; } };
  // Titel unter 20 pt stehen in der Grundschrift
  const h2 = (t) => { ensure(12); doc.setFont(BODY, 'bold'); doc.setFontSize(12.5); doc.setTextColor(...C.brand); doc.text(pdfTxt(t), M, y + 5); y += 8; };
  const p = (t, o = {}) => {
    doc.setFont(BODY, o.bold ? 'bold' : 'normal');
    doc.setFontSize(o.size || 9.5);
    doc.setTextColor(...(o.muted ? C.muted : o.bold ? C.strong : C.text));
    const lines = doc.splitTextToSize(pdfTxt(t), o.w || CW);
    lines.forEach((ln) => { ensure(4.6); doc.text(ln, o.x || M, y + 3.6); y += (o.size || 9.5) * 0.45; });
    y += 1.6;
  };
  // Zellen als Text oder als Objekt { content, rowSpan, styles } (autoTable)
  const cell = (c) => (c && typeof c === 'object' ? { ...c, content: pdfTxt(c.content) } : pdfTxt(c));
  const table = (head, body, o = {}) => {
    autoTable(doc, {
      startY: y, head: [head.map(pdfTxt)], body: body.map((r) => r.map(cell)), margin: { left: M, right: M },
      theme: o.theme || 'striped', rowPageBreak: o.rowPageBreak || 'auto',
      styles: { font: BODY, fontSize: o.size || 8.5, cellPadding: 1.4, textColor: C.text, lineColor: C.line, lineWidth: 0.1 },
      headStyles: { font: BODY, fillColor: C.subtle, textColor: C.strong, fontStyle: 'bold' },
      columnStyles: o.cols || {}, didParseCell: o.didParseCell,
    });
    y = doc.lastAutoTable.finalY + 5;
  };
  const right = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [i + 1, { halign: 'right' }]));

  // Kopf: Titel links als Kopfzeile, Logo rechtsbündig (15 mm hoch, Schutzraum Logohöhe / 5.24), darunter eine Linie
  const heute = new Date().toLocaleDateString('de-CH');
  const LH = 15, LW = LH * (424 / 240);
  y = 12;
  if (logo) doc.addImage(logo, 'PNG', W - M - LW, y, LW, LH);
  doc.setFont(HEAD, 'bold'); doc.setFontSize(26); doc.setTextColor(...C.strong);
  doc.text('PensCheck.', M, y + 8.5);
  doc.setFont(BODY, 'bold'); doc.setFontSize(10); doc.setTextColor(...C.brand);
  doc.text(pdfTxt('Mit Klarheit und Weitblick in den Ruhestand.'), M, y + 14.2);
  y += LH + LH / 5.24 + 1;
  doc.setDrawColor(...C.brand); doc.setLineWidth(0.5); doc.line(M, y, W - M, y);
  y += 3.5;
  // Ohne erfasstes Gesprächsdatum gilt das Datum, an dem der Bericht erstellt wird
  p([S.bericht.kunde && `Für: ${frei(S.bericht.kunde)}`, S.bericht.datum ? `Datum: ${frei(S.bericht.datum)}` : `Erstellt am ${heute}`, S.bericht.berater && `Beratung: ${frei(S.bericht.berater)}`].filter(Boolean).join('   ·   '), { muted: true, size: 9 });
  y += 2;
  if (!R || R.leer) { p('Es sind noch keine Ausgaben im Ruhestand erfasst; daher liegt keine Rechnung vor.'); return save(doc, S); }

  // Ergebnis als eigenes Feld: Ampel mit drei Lichtern, Stufe als Wort (Status nie allein über Farbe), Urteil
  const st = R.amp.st, col = C[st], STUFEN = ['rot', 'gelb', 'gruen'];
  const urteil = doc.setFont(BODY, 'bold').setFontSize(12).splitTextToSize(pdfTxt(document.getElementById('verdictText').textContent), CW - 26);
  const fh = Math.max(27, 15.5 + urteil.length * 5.4 + 4.5);
  ensure(fh + 4);
  doc.setFillColor(...C.subtle); doc.rect(M, y, CW, fh, 'F');
  doc.setFillColor(...col); doc.rect(M, y, 1.6, fh, 'F');
  // Ampel: das erreichte Licht gefüllt, die beiden andern nur als Ring
  const ax = M + 9.5, ay = y + 4.2;
  doc.setFillColor(255, 255, 255); doc.setDrawColor(...C.line); doc.setLineWidth(0.25); doc.roundedRect(ax - 4, ay, 8, fh - 8.4, 4, 4, 'FD');
  const lichtAbstand = (fh - 8.4 - 6.4) / 2;
  STUFEN.forEach((k, i) => {
    const cy = ay + 3.2 + i * lichtAbstand;
    if (k === st) { doc.setFillColor(...col); doc.circle(ax, cy, 2.6, 'F'); } else { doc.setDrawColor(...C.line); doc.setLineWidth(0.3); doc.circle(ax, cy, 2.2, 'S'); }
  });
  const tx = M + 19;
  doc.setFont(BODY, 'normal'); doc.setFontSize(8); doc.setTextColor(...C.muted);
  doc.text('Ergebnis', tx, y + 6.2);
  doc.setFont(BODY, 'bold'); doc.setFontSize(17); doc.setTextColor(...col);
  doc.text({ gruen: 'Reicht', gelb: 'Knapp', rot: 'Reicht nicht' }[st], tx, y + 13);
  doc.setFontSize(12); doc.setTextColor(...C.strong);
  urteil.forEach((ln, i) => doc.text(ln, tx, y + 19.6 + i * 5.4));
  y += fh + 3.5;
  p(document.getElementById('verdictSub').textContent, { muted: true, size: 9 });
  // Was die erreichte Stufe der Ampel bedeutet (derselbe Wortlaut wie im Glossar)
  p(ampelSatz(st, S), { muted: true, size: 9 });

  // Das Bild der Bühne, gross und direkt unter dem Urteil (reportbild.js)
  const bild = (d, hoehe) => { y += bildPdf(doc, d, { x: M, y, w: CW, h: hoehe, font: BODY, txt: (t) => pdfTxt(frei(t)) }) + 2; };
  const cplTxt = S.haushalt === 'single' ? 'Alter' : 'Alter von Person 1';
  ensure(120);
  h2('Ihr Plan im Bild');
  bild(bildDaten(S, R, app.E), 92);
  p(`Oben: wovon Sie pro Jahr leben, als Säule je Jahr. Unten: Ihr freies Vermögen. Alle Beträge in heutiger Kaufkraft; angefangene Jahre sind auf ein ganzes Jahr hochgerechnet. Waagrecht: ${cplTxt}. Stresstest: Rendite 1 Prozentpunkt tiefer, bis 100.`, { muted: true, size: 8.5 });
  if (app.reach) p(reachText(app.reach), { muted: true, size: 9 });

  if (R.tr) {
    h2('Tragbarkeit der Hypothek');
    p(tragText(R.tr, S));
  }

  ensure(42); // Titel und Tabelle zusammenhalten
  h2('Kennzahlen');
  const r85 = R.base.rows.find((x) => x.age === 85);
  table(['Kennzahl', 'Wert', 'Bemerkung'], [
    ['Vermögen reicht bis', R.base.depleted != null ? `Alter ${R.base.depleted}` : `über ${R.horizont}`, S.haushalt === 'single' ? 'Planungshorizont' : 'Alter Person 1'],
    ['Tragbare Ausgaben pro Monat', chf(R.maxA), `Annahme: ${chf(S.ausgabenRuhestand)}, ${pufferText(R.maxA, S.ausgabenRuhestand, R.amp.st)}`],
    ['Freies Vermögen mit 85', r85 ? chf(Math.max(0, r85.V) / r85.I) : '–', 'heutige Kaufkraft'],
    ['Steuern auf Kapitalbezügen', chf(R.base.kapSteuerTotal), `Kanton ${S.kanton}, heutige Kaufkraft`],
  ]);

  h2('Was wäre, wenn Sie früher aufhören?');
  p(reportText(app));
  // Das Szenario im Bild, wenn es vom heutigen Plan abweicht; der Plan steht gestrichelt daneben
  const szen = R.so?.now?.base?.rows;
  if (szen?.length && (szen.length !== R.base.rows.length || szen.some((x, i) => Math.abs(x.V - R.base.rows[i].V) > 1))) {
    ensure(94);
    bild(bildSzenario(S, R, app.E), 72);
    p('Das Bild zeigt dieses Szenario; gestrichelt steht Ihr heutiger Plan.', { muted: true, size: 8.5 });
  }

  if (S.budgetAktiv) {
    const bw = budgetWerte(S, app.E);
    ensure(85); // Tabelle nicht über zwei Seiten verteilen
    h2('Budget im Ruhestand (pro Monat)');
    table(['Position', 'CHF'], [...BUDGET_POS.map(([k, l]) => [l, nf.format(Math.round(bw[k]))]), ['Total = Ausgaben im Ruhestand', nf.format(S.ausgabenRuhestand)]], { cols: right(1) });
    p('Eigene Angaben. Ohne Steuern; Einkommens- und Vermögenssteuern sind separat gerechnet.');
  }

  if (R.fix) {
    const F = R.fix, cols = [F.a, F.b].filter(Boolean), mo = (v) => chf(v / 12);
    h2('Renten und Fixkosten (pro Monat)');
    table(['', ...cols.map((x) => `${x.year}${x === F.a ? ' (alle mit AHV)' : ' (Alter 85)'}`)], [
      ['AHV', ...cols.map((x) => mo(x.ahv))], ['PK-Rente', ...cols.map((x) => mo(x.pk))], ['Renten total', ...cols.map((x) => mo(x.renten))],
      ['Wohnen', ...cols.map((x) => mo(-x.wohnen))], ['Übrige Fixkosten', ...cols.map((x) => mo(-x.uebrig))], [`Steuern auf Renten (${S.steuerEink}%)`, ...cols.map((x) => mo(-x.steuern))],
      ['Überschuss / Lücke', ...cols.map((x) => chfSigned(x.saldo / 12))], ['Deckung', ...cols.map((x) => `${dec(x.q)}-fach`)],
    ], { cols: right(cols.length) });
  }

  if (app.bilanz) {
    const { cols, lines, net } = app.bilanz;
    h2('Vermögensbilanz (nominal)');
    table(['', ...cols.map(([l]) => l)], [
      ...lines.filter(([, g]) => cols.some(([, c]) => Math.abs(g(c)) > 0.5)).map(([l, g]) => [l, ...cols.map(([, c]) => (Math.abs(g(c)) > 0.5 ? chf(g(c)) : '–'))]),
      ['Nettovermögen', ...cols.map(([, c]) => chf(net(c)))], ['in heutiger Kaufkraft', ...cols.map(([, c]) => chf(net(c) / c.I))],
    ], { cols: right(3) });
  }

  if (R.base.kapListe.length) {
    h2('Kapitalbezüge und Steuern');
    table(['Datum', 'Person', 'Bezug', 'Betrag', 'Steuer', 'Satz'], R.base.kapListe.map((e) => [e.datum, String(e.person + 1), frei(e.art), chf(e.betrag), chf(e.steuer), e.betrag > 0 ? dec((e.steuer / e.betrag) * 100) + '%' : '']), { cols: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } } });
  }

  h2('Ablauf');
  table(['Datum', 'Person', 'Ereignis', 'Betrag'], R.base.events.map((e) => [e.datum, e.person == null ? 'Haushalt' : String(e.person + 1), frei(e.text), e.betrag ? chf(e.betrag) + (e.proJahr ? ' / Jahr' : '') : '']), { size: 8, cols: { 3: { halign: 'right' } } });

  h2('Jahresrechnung (nominal, CHF)');
  const c = (v) => (Math.abs(v) < 0.5 ? '–' : nf.format(Math.round(v)));
  table(['Jahr', 'Alter', 'Lohn', 'Übr. Eink.', 'AHV', 'PK', 'Kapital', 'Ertrag', 'Ausgaben', 'Steuern', 'AHV-Beitr.', 'Übriges', 'Vermögen'],
    R.base.rows.map((x) => [String(x.year), S.haushalt === 'single' ? String(x.age) : x.ages.join('/'), c(x.lohn), c(x.uebrig), c(x.ahv), c(x.pk), c(x.kapZu), c(x.ertrag), c(-x.ausgaben), c(-x.steuern - x.stVerm - x.stErtrag), c(-x.ne), c(x.wEin - x.wAus - x.einz3a + x.lgNetto - x.amortFrei), c(x.V)]),
    { size: 7, cols: right(12) });
  p('Steuern = Einkommenssteuer auf Renten und auf dem steuerbaren Teil der Vermögenserträge sowie Vermögenssteuer. Übriges = Wünsche, Einzahlungen in die Säule 3a, weitere Liegenschaften und Amortisationen aus freiem Vermögen. Vermögen = Stand am Jahresende.', { muted: true, size: 8 });

  if (R.opt.length) {
    h2('Ansatzpunkte zum Prüfen');
    p('Rechnerische Hinweise aus den Angaben, keine Empfehlung. Die Wirkung hängt von Reglement, Steuersituation, Risikofähigkeit und Anlage ab und ist mit einer Fachperson zu prüfen.', { muted: true, size: 9 });
    R.opt.forEach((o) => { p(frei(`${o.t}${o.v ? ' – ' + o.v : ''}`), { bold: true }); p(frei(o.x), { muted: true, size: 9 }); });
  }

  const themen = themenZeilen(S);
  if (themen.length) {
    h2('Vorgemerkte Themen');
    p('Themen, die Sie vorgemerkt haben und noch klären möchten.', { muted: true, size: 9 });
    themen.forEach((t) => p('• ' + t, { size: 9.5 }));
  }

  if (R.akt && R.akt.length) {
    const cpl = S.haushalt !== 'single', erl = (id) => !!(S.aktion || {})[id], now = app.E.A0, artCol = cpl ? 4 : 3;
    h2('Aktionsplan');
    p('Was wann zu tun ist, aus den Angaben abgeleitet und rückwärts ab der Pensionierung gerechnet. Die Fristen der Pensionskasse stehen im Reglement; massgebend ist das Reglement.', { muted: true, size: 9 });
    // Pro Aufgabe zwei Zeilen: Titel fett, darunter die Erläuterung; die übrigen Spalten überspannen beide
    const lw = 0.1, pad = 1.4, span = (content) => ({ content, rowSpan: 2 });
    table(['Termin', ...(cpl ? ['Person'] : []), 'Was ist zu tun', 'Bei', 'Art', 'Erledigt'],
      R.akt.flatMap((x) => [
        [span((x.A != null && x.A < now && !erl(x.id) ? 'vorbei: ' : '') + x.when), ...(cpl ? [span(x.person == null ? 'Haushalt' : String(x.person + 1))] : []),
          { content: x.titel, styles: { fontStyle: 'bold', textColor: C.strong, cellPadding: { top: pad, right: pad, bottom: 0.3, left: pad }, lineWidth: { top: lw, right: lw, bottom: 0, left: lw } } },
          span(x.stelle), span(AKT_ART[x.art]), span(erl(x.id) ? 'ja' : '')],
        [{ content: x.text, styles: { cellPadding: { top: 0.3, right: pad, bottom: pad, left: pad }, lineWidth: { top: 0, right: lw, bottom: lw, left: lw } } }],
      ]),
      {
        size: 7.8, theme: 'grid', rowPageBreak: 'avoid',
        cols: cpl ? { 0: { cellWidth: 25 }, 1: { cellWidth: 14 }, 3: { cellWidth: 34 }, 4: { cellWidth: 19 }, 5: { cellWidth: 14 } } : { 0: { cellWidth: 27 }, 2: { cellWidth: 34 }, 3: { cellWidth: 19 }, 4: { cellWidth: 14 } },
        didParseCell: (d) => { if (d.section === 'body' && d.column.index === artCol && d.cell.raw?.content === 'Frist') { d.cell.styles.textColor = C.rot; d.cell.styles.fontStyle = 'bold'; } },
      });
  }

  h2('Hinweise');
  (app.hints || []).forEach((h) => p('• ' + h, { size: 9 }));

  h2('Was PensCheck vereinfacht oder nicht rechnet');
  GRENZEN.forEach(([t, x]) => p(`• ${t}: ${x}`, { size: 9 }));

  h2('Grundlagen');
  p(`Gesetzliche Werte ${P.meta.jahr}: AHV-Rente ${chf(P.ahv.minRente)} bis ${chf(P.ahv.maxRente)} pro Monat (${P.ahv.monatsrentenProJahr} Monatsrenten pro Jahr), Ehepaare höchstens ${chf(P.ahv.plafondEhepaar)}; Säule 3a max. ${chf(P.s3a.maxMitPK)}; Beiträge Nichterwerbstätige ${chf(P.ne.min)} bis ${chf(P.ne.max)}; Lebenserwartung mit 65: Männer ${dec(P.le65.m)}, Frauen ${dec(P.le65.w)} Jahre.${app.Pn ? ` Ab ${P.meta.jahr + 1} rechnet die Projektion mit den bereits beschlossenen Werten ${P.meta.jahr + 1} (AHV-Rente ${chf(app.Pn.ahv.minRente)} bis ${chf(app.Pn.ahv.maxRente)}).` : ''} Kapitalbezugssteuer: ESTV-Steuerbelastungsstatistik ${P.kapSteuer.steuerjahr}, Kantonshauptort. Quellen und Prüfstatus: Abschnitt «Grundlagen und Quellen» in der App (Datenstand ${app.params.version}).`, { size: 8.5, muted: true });
  h2('Wichtiger Hinweis');
  HINWEIS.absaetze.forEach((t) => p(t, { size: 8.5, muted: true }));
  h2(DATENSCHUTZ.titel);
  DATENSCHUTZ.punkte.forEach(([t, x]) => p(`• ${t}: ${x}`, { size: 8.5, muted: true }));

  // Kontakt
  h2('Ergebnis besprechen');
  p(`${ANBIETER.kontaktText}: ${ANBIETER.name}`, { size: 9.5 });
  ensure(6);
  doc.setFont(BODY, 'bold'); doc.setFontSize(9.5); doc.setTextColor(...C.brand);
  const linkTxt = pdfTxt(ANBIETER.kontaktUrl.replace(/^https?:\/\//, '').replace(/\/$/, ''));
  doc.textWithLink(linkTxt, M, y + 3.6, { url: ANBIETER.kontaktUrl });
  // Verweise immer unterstrichen
  doc.setDrawColor(...C.brand); doc.setLineWidth(0.2); doc.line(M, y + 4.4, M + doc.getTextWidth(linkTxt), y + 4.4);
  y += 7;
  p(`Telefon ${ANBIETER.telefon} · ${ANBIETER.email}`, { size: 9.5 });

  // Fusszeilen
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFont(BODY, 'normal'); doc.setFontSize(7.5); doc.setTextColor(...C.muted);
    doc.text(pdfTxt(`PensCheck · ${ANBIETER.name} · vereinfachte Schätzung, keine Beratung · Seite ${i} von ${n}`), M, 297 - 8);
  }
  return save(doc, S);
}

function save(doc, S) {
  const kname = (S.bericht.kunde || '').replace(/[^A-Za-z0-9ÄÖÜäöüéèà_-]+/g, '_').slice(0, 40);
  const name = `PensCheck_${kname ? kname + '_' : ''}${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(name);
  return name;
}
