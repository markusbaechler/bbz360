#!/usr/bin/env node
// Quellenprüfung: ruft jede in public/data/params.json hinterlegte Quelle ab (HTML oder PDF),
// sucht die erwarteten Werte im Text und schreibt das Ergebnis nach public/data/verification.json.
// Ein gesetzlicher Wert gilt als bestätigt, wenn ihn mindestens zwei Quellen enthalten, davon mindestens eine, die
// zugleich amtlich ist und laufend nachgeführt wird (keine feste Fassung eines Erlasses). Bestätigt eine amtliche
// Quelle einen Wert nicht mehr, wird das gemeldet, auch wenn zwei andere Quellen ihn noch nennen.
// Suchmuster enthalten immer Kontext (Begriff oder Tabellenzeile); eine Quelle ohne Suchmuster bestätigt nichts.
//
//   node scripts/verify-sources.mjs            Prüfen und Datei schreiben
//   node scripts/verify-sources.mjs --strict   zusätzlich mit Exit-Code 1, wenn ein Wert < 2 Bestätigungen hat
//   node scripts/verify-sources.mjs --dry      nur ausgeben, nichts schreiben

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extractText, getDocumentProxy } from 'unpdf';
import { holeKapSteuer } from './update-kapsteuer.mjs';
import { holeVermSteuer } from './update-vermsteuer.mjs';

const ROOT = new URL('..', import.meta.url);
const PARAMS = new URL('public/data/params.json', ROOT);
const OUT = new URL('public/data/verification.json', ROOT);
const args = new Set(process.argv.slice(2));
const UA = 'Mozilla/5.0 (compatible; PensCheck-Quellenpruefung/1.0; +https://github.com/bbzsg/PensCheck)';

// ---------- Text-Normalisierung ----------
const ENT = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", rsquo: '’', lsquo: '‘', ndash: '–', mdash: '—', auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', eacute: 'é', egrave: 'è', agrave: 'à', szlig: 'ß', ccedil: 'ç', laquo: '«', raquo: '»', thinsp: ' ', ensp: ' ', emsp: ' ' };
export function htmlToText(html) {
  // Skripte bleiben erhalten: manche Seiten (bsv/estv) liefern Tabellenwerte nur im eingebetteten JSON.
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/\\u0027/g, "'")
    .replace(/\\u00a0/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h\d|\/td|\/th)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n] ?? m);
}
/**
 * Vereinheitlicht Leerraum und entfernt Tausendertrennzeichen, aber nur eindeutige: Apostrophe sowie geschützte und
 * schmale Leerzeichen zwischen Zifferngruppen (2’520, 2'520, 2&nbsp;520 → 2520). Ein gewöhnliches Leerzeichen bleibt
 * stehen: In Tabellen trennt es Spalten («1 260» kann Stufe 1 und Betrag 260 sein), und verschmolzene Spalten würden
 * Werte vortäuschen, die so nicht in der Quelle stehen. Schreibt eine Quelle Tausender mit gewöhnlichem Leerzeichen,
 * nennt das Suchmuster die Lücke ausdrücklich («27 ?050»).
 */
const TAUSENDER = /(?<![\d.,])(\d{1,3})((?:[’'`´ʼ‘\u00a0\u202f\u2009\u2007]\d{3})+)(?!\d)/g;
export function normalize(text) {
  return text
    .replace(/\u00ad/g, '')
    .replace(TAUSENDER, (m, a, b) => a + b.replace(/\D/g, ''))
    .replace(/[\u00a0\u202f\u2009\u2007\u2002\u2003]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n');
}
/** Ein Muster: reiner Text (Gross-/Kleinschreibung egal) oder «re:…» als regulärer Ausdruck. */
export function matches(text, pattern) {
  if (pattern.startsWith('re:')) return new RegExp(pattern.slice(3), 'is').test(text);
  return text.toLowerCase().replace(/\s+/g, ' ').includes(normalize(pattern).toLowerCase().replace(/\s+/g, ' '));
}

/**
 * Bestätigt: mindestens zwei Quellen, davon mindestens eine, die zugleich amtlich ist und laufend nachgeführt wird.
 * Eine feste Fassung eines Erlasses (amtlich, aber eingefroren) zusammen mit einer nicht amtlichen laufenden Quelle
 * genügt nicht: Keine der beiden belegt, dass der Wert heute amtlich so gilt.
 */
export const bestaetigt = (c) => !!c && c.confirmed >= 2 && (c.amtlichLaufend ?? 0) >= 1;
/** Was zur Bestätigung fehlt, als Text. */
export function mangel(c) {
  if (c.confirmed < 2) return `nur ${c.confirmed} von ${c.total} Quellen bestätigen den Wert`;
  if (!(c.official >= 1)) return 'keine amtliche Quelle bestätigt den Wert';
  if (!(c.live >= 1)) return 'nur feste Fassungen von Erlassen bestätigen den Wert, keine laufend nachgeführte Quelle';
  if (!(c.amtlichLaufend >= 1)) return 'keine Quelle, die amtlich ist und laufend nachgeführt wird, bestätigt den Wert (nur feste Fassungen und nicht amtliche Quellen)';
  return '';
}
/**
 * Ein Suchmuster braucht Kontext: ein Wort oder mindestens zwei Zahlen (Tabellenzeile). Eine einzelne Zahl
 * («1280») träfe auch andere Angaben derselben Seite und gilt nicht als Beleg.
 */
export function musterMitKontext(m) {
  // «27 ?050» ist eine Zahl mit ausdrücklich genannter Tausenderlücke, nicht zwei Zahlen
  const kern = m.replace(/^re:/, '').replace(/(\d) \?(?=\d{3}(?!\d))/g, '$1').replace(/\\u[0-9a-fA-F]{4}/g, ' ').replace(/\(\?<?[!=][^)]*\)/g, ' ').replace(/\\[bsdDwW]/g, ' ').replace(/\{\d+,?\d*\}/g, ' ');
  if (/[A-Za-zÄÖÜäöüéèà]{3,}/.test(kern)) return true;
  return (kern.replace(/\\\./g, '.').match(/\d+(?:[.,]\d+)?/g) || []).length >= 2;
}

// ---------- Abruf ----------
async function fetchText(url) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 30000);
      const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'de-CH,de;q=0.9' }, redirect: 'follow', signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const type = res.headers.get('content-type') || '';
      const buf = new Uint8Array(await res.arrayBuffer());
      if (type.includes('pdf') || url.toLowerCase().endsWith('.pdf') || (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46)) {
        const pdf = await getDocumentProxy(buf);
        const { text } = await extractText(pdf, { mergePages: true });
        return text;
      }
      return htmlToText(new TextDecoder('utf-8').decode(buf));
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw lastErr;
}

// ---------- Prüfung ----------
async function main() {
  const data = JSON.parse(await readFile(PARAMS, 'utf8'));
  const now = new Date();
  const jahr = now.getFullYear();
  // nächstes Jahr ohne erfasste Werte (für die Beobachtung neuer Publikationen)
  const NEXT = Math.max(...Object.values(data.params).flatMap((p) => Object.keys(p.values).map(Number))) + 1;
  const watch = (data.watch || []).map((w) => ({ ...w, pattern: w.pattern.replaceAll('{NEXT}', NEXT), message: w.message.replaceAll('{NEXT}', NEXT) }));
  const urls = new Map();
  const refs = [];
  for (const [key, p] of Object.entries(data.params)) for (const r of p.sources || []) refs.push({ scope: 'params', key, ref: r });
  for (const [key, t] of Object.entries(data.tables || {})) for (const r of t.sources || []) refs.push({ scope: 'tables', key, ref: r });
  for (const w of watch) refs.push({ scope: 'watch', key: w.id, ref: { id: w.source, match: [w.pattern] }, watch: w });
  for (const { ref } of refs) {
    const s = data.sources[ref.id];
    if (!s) throw new Error(`Quelle «${ref.id}» ist nicht definiert`);
    if (!s.api) urls.set(s.url, null);
  }

  // Quellen parallel (begrenzt) abrufen
  const list = [...urls.keys()];
  const results = new Map();
  let i = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (i < list.length) {
      const url = list[i++];
      try { const roh = await fetchText(url); results.set(url, { roh, text: normalize(roh) }); }
      catch (e) { results.set(url, { error: String(e.message || e) }); }
    }
  }));

  // Amtliche Schnittstellen: Kapitalbezugssteuer direkt bei der ESTV abfragen und mit der Tabelle vergleichen
  const api = {};
  if (Object.values(data.sources).some((s) => s.api === 'estv-kapital')) {
    try {
      const r = await holeKapSteuer(() => {});
      const t = data.tables.kapSteuer.data;
      const diffs = Object.entries(t.kantone).filter(([kt, k]) => JSON.stringify(k.ledig) !== JSON.stringify(r.ledig[kt]?.slice(1)) || JSON.stringify(k.verheiratet) !== JSON.stringify(r.verheiratet[kt]?.slice(1))).map(([kt]) => kt);
      api['estv-kapital'] = r.jahr !== t.steuerjahr ? { error: `ESTV liefert Steuerjahr ${r.jahr}, Tabelle ist ${t.steuerjahr}` } : diffs.length ? { error: `abweichend in ${diffs.join(', ')}` } : { ok: true };
    } catch (e) { api['estv-kapital'] = { error: `nicht erreichbar (${e.message})` }; }
  }
  // Vermögenssteuer: gleicher Abgleich mit der ESTV-Statistik
  if (Object.values(data.sources).some((s) => s.api === 'estv-vermoegen')) {
    try {
      const r = await holeVermSteuer(() => {});
      const t = data.tables.vermSteuer.data;
      const diffs = Object.entries(t.kantone).filter(([kt, k]) => JSON.stringify(k.ledig) !== JSON.stringify(r.ledig[kt]?.slice(1)) || JSON.stringify(k.verheiratet) !== JSON.stringify(r.verheiratet[kt]?.slice(1))).map(([kt]) => kt);
      api['estv-vermoegen'] = r.jahr !== t.steuerjahr ? { error: `ESTV liefert Steuerjahr ${r.jahr}, Tabelle ist ${t.steuerjahr}` } : diffs.length ? { error: `abweichend in ${diffs.join(', ')}` } : { ok: true };
    } catch (e) { api['estv-vermoegen'] = { error: `nicht erreichbar (${e.message})` }; }
  }

  if (args.has('--dump')) {
    const dir = new URL('../.quellen-dump/', import.meta.url);
    await mkdir(dir, { recursive: true });
    for (const [id, s] of Object.entries(data.sources)) {
      const r = results.get(s.url);
      if (r?.text) await writeFile(new URL(`${id}.txt`, dir), r.text);
      if (r?.roh) await writeFile(new URL(`${id}.roh.txt`, dir), r.roh);
    }
  }

  const out = { checkedAt: now.toISOString(), params: {}, tables: {}, alerts: [], sources: {} };
  for (const [id, s] of Object.entries(data.sources)) {
    const r = s.api ? api[s.api] : results.get(s.url);
    if (r) out.sources[id] = r.error ? { ok: false, error: r.error } : { ok: true, ...(r.text ? { chars: r.text.length } : {}) };
  }
  const check = (ref) => {
    const s = data.sources[ref.id];
    if (s.api) return api[s.api]?.ok ? { id: ref.id, ok: true } : { id: ref.id, ok: false, error: api[s.api]?.error || 'nicht geprüft' };
    const r = results.get(s.url);
    if (r.error) return { id: ref.id, ok: false, error: `nicht erreichbar (${r.error})` };
    if (!(ref.match || []).length) return { id: ref.id, ok: false, error: 'kein Suchmuster hinterlegt' };
    const missing = ref.match.filter((m) => !matches(r.text, m));
    return missing.length ? { id: ref.id, ok: false, error: `nicht gefunden: ${missing.join(' | ')}` } : { id: ref.id, ok: true };
  };
  /** Quellenangaben prüfen und zählen: bestätigt, davon amtlich, davon laufend nachgeführt. */
  const zaehle = (rs) => {
    const checked = rs.map(check);
    const okIds = [...new Set(checked.filter((c) => c.ok).map((c) => c.id))];
    return {
      confirmed: okIds.length,
      official: okIds.filter((id) => data.sources[id].official).length,
      live: okIds.filter((id) => !data.sources[id].fassung).length,
      amtlichLaufend: okIds.filter((id) => data.sources[id].official && !data.sources[id].fassung).length,
      total: new Set(rs.map((r) => r.id)).size,
      sources: checked,
    };
  };
  /** Amtliche Quellen, die den Wert nicht (mehr) bestätigen. */
  const amtlichOhne = (c) => c.sources.filter((x) => !x.ok && data.sources[x.id].official).map((x) => `«${data.sources[x.id].title}» (${x.error})`);

  // Parameter: Status pro Gültigkeitsjahr
  for (const [key, p] of Object.entries(data.params)) {
    const years = Object.keys(p.values).map(Number).sort((a, b) => a - b);
    const cur = years.filter((y) => y <= jahr).pop() ?? years[0];
    const byYear = {};
    for (const y of years) {
      const rs = (p.sources || []).filter((r) => (r.years || years).includes(y));
      if (!rs.length) continue;
      byYear[y] = zaehle(rs);
    }
    const c = byYear[cur] || { confirmed: 0, official: 0, live: 0, amtlichLaufend: 0, total: 0, sources: [] };
    out.params[key] = { checkedAt: out.checkedAt, gueltigAb: cur, ...c, byYear };
    // Statistische Werte (Lebenserwartung, Krankenkassenprämie) werden gleich streng gemeldet wie gesetzliche
    if (p.kind !== 'gesetz' && p.kind !== 'statistik') continue;
    // laufendes Jahr und bereits erfasste Folgejahre: fehlende Bestätigung und Wegfall einer amtlichen Quelle melden
    for (const y of [cur, ...years.filter((y) => y > jahr)]) {
      const b = byYear[y];
      if (!b) continue;
      const wert = `${JSON.stringify(p.values[y])} (gültig ab ${y})`;
      if (!bestaetigt(b)) out.alerts.push(`${p.label}: ${mangel(b)} ${wert}.`);
      const ohne = amtlichOhne(b);
      if (ohne.length) out.alerts.push(`${p.label}: amtliche Quelle bestätigt den Wert ${wert} nicht: ${ohne.join('; ')}.`);
    }
  }
  for (const [key, t] of Object.entries(data.tables || {})) {
    const rs = t.sources || [];
    if (!rs.length) continue;
    const c = zaehle(rs);
    out.tables[key] = { checkedAt: out.checkedAt, ...c };
    if (t.kind !== 'gesetz' && t.kind !== 'amtlich') continue;
    // Amtliche Statistik: Die ESTV ist die einzige Quelle; massgebend ist der Abgleich mit ihrer Schnittstelle
    // (ein Fehlschlag steht unten bei den amtlichen Quellen). Gesetzliche Tabellen brauchen zwei Quellen.
    const nurStatistik = t.kind === 'amtlich' && rs.some((r) => data.sources[r.id].api);
    if (!nurStatistik && !bestaetigt(c)) out.alerts.push(`${t.label}: ${mangel(c)}.`);
    const ohne = amtlichOhne(c);
    if (ohne.length) out.alerts.push(`${t.label}: amtliche Quelle bestätigt die Tabelle nicht: ${ohne.join('; ')}.`);
  }
  // Beobachtung: neue Werte für das nächste Jahr publiziert?
  for (const w of watch) {
    const c = check({ id: w.source, match: [w.pattern] });
    if (c.ok) out.alerts.push(w.message);
  }

  // Ausgabe
  const legal = Object.entries(data.params).filter(([, p]) => p.kind === 'gesetz');
  const ok = legal.filter(([k]) => bestaetigt(out.params[k])).length;
  const lines = [`Quellenprüfung ${out.checkedAt}`, `Gesetzliche Werte bestätigt (≥ 2 Quellen, davon eine amtlich und laufend nachgeführt): ${ok}/${legal.length}`, `Quellen erreichbar: ${Object.values(out.sources).filter((s) => s.ok).length}/${Object.keys(out.sources).length}`];
  for (const [id, s] of Object.entries(out.sources)) if (!s.ok) lines.push(`  ✗ ${id}: ${s.error}`);
  if (out.alerts.length) lines.push('', 'Hinweise:', ...out.alerts.map((a) => '  • ' + a));
  console.log(lines.join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY) {
    const md = [`### Quellenprüfung`, '', `**${ok}/${legal.length}** gesetzliche Werte von mindestens zwei Quellen bestätigt, davon mindestens eine amtliche.`, '', ...(out.alerts.length ? ['**Hinweise**', '', ...out.alerts.map((a) => `- ${a}`)] : ['Keine Auffälligkeiten.'])];
    await writeFile(process.env.GITHUB_STEP_SUMMARY, md.join('\n') + '\n', { flag: 'a' });
  }
  if (!args.has('--dry')) {
    // Datei nur ändern, wenn sich am Ergebnis etwas geändert hat (sonst täglich ein Commit nur wegen des Datums)
    let prev = null;
    try { prev = JSON.parse(await readFile(OUT, 'utf8')); } catch { /* erste Prüfung */ }
    const strip = (o) => JSON.stringify(o, (k, v) => (k === 'checkedAt' || k === 'chars' ? undefined : v));
    const ageDays = prev?.checkedAt ? (now - new Date(prev.checkedAt)) / 864e5 : Infinity;
    if (!prev || strip(prev) !== strip(out) || ageDays >= 7) {
      await writeFile(OUT, JSON.stringify(out, null, 1) + '\n');
      console.log(`→ ${fileURLToPath(OUT)} geschrieben`);
    } else console.log('→ unverändert, Datei nicht neu geschrieben');
  }
  if (out.alerts.length && process.env.GITHUB_OUTPUT) await writeFile(process.env.GITHUB_OUTPUT, `alerts<<EOF\n${out.alerts.map((a) => '- ' + a).join('\n')}\nEOF\n`, { flag: 'a' });
  // Zahl der nicht bestätigten gesetzlichen Werte: Der Workflow schliesst damit rot ab (nach Commit und Issue)
  if (process.env.GITHUB_OUTPUT) await writeFile(process.env.GITHUB_OUTPUT, `unbestaetigt=${legal.length - ok}\n`, { flag: 'a' });
  if (args.has('--strict') && ok < legal.length) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error(e); process.exit(2); });
