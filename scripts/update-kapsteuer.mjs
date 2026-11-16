#!/usr/bin/env node
// Kapitalbezugssteuer aus der amtlichen ESTV-Steuerbelastungsstatistik «Kapitalleistung aus beruflicher Vorsorge»
// (https://swisstaxcalculator.estv.admin.ch/#/taxburden/capital-payment) für alle 26 Kantonshauptorte abrufen
// und in public/data/params.json (tables.kapSteuer) schreiben. Ledig = lediger Mann, Auszahlung mit 65;
// verheiratet = verheirateter Mann, Auszahlung mit 65; ohne Kirchensteuer. Verwendet wird das laufende Steuerjahr,
// sofern die ESTV dafür eigene, vollständige Daten liefert (sonst das Vorjahr).
//
//   node scripts/update-kapsteuer.mjs          abrufen und bei Änderungen schreiben
//   node scripts/update-kapsteuer.mjs --dry    nur anzeigen

import { readFile, writeFile } from 'node:fs/promises';

const PARAMS = new URL('../public/data/params.json', import.meta.url);
const API = 'https://swisstaxcalculator.estv.admin.ch/delegate/ost-integration/v1/maps/capital-tax-values/DE';
const BETRAEGE = [20000, 50000, 100000, 150000, 200000, 300000, 500000, 750000, 1000000];
const MODELLE = { ledig: 1, verheiratet: 3 };
// Kantonshauptorte (Name laut ESTV, BFS-Gemeindenummer als Rückfall)
export const HAUPTORTE = {
  AG: ['Aarau', 4001], AI: ['Appenzell', 3101], AR: ['Herisau', 3001], BE: ['Bern', 351], BL: ['Liestal', 2829], BS: ['Basel', 2701],
  FR: ['Fribourg', 2196], GE: ['Genève', 6621], GL: ['Glarus', 1630], GR: ['Chur', 3901], JU: ['Delémont', 6711], LU: ['Luzern', 1061],
  NE: ['Neuchâtel', 6458], NW: ['Stans', 1509], OW: ['Sarnen', 1407], SG: ['St. Gallen', 3203], SH: ['Schaffhausen', 2939], SO: ['Solothurn', 2601],
  SZ: ['Schwyz', 1372], TG: ['Frauenfeld', 4566], TI: ['Bellinzona', 5002], UR: ['Altdorf', 1205], VD: ['Lausanne', 5586], VS: ['Sion', 6266],
  ZG: ['Zug', 1711], ZH: ['Zürich', 261],
};

async function abfrage(modell, jahr) {
  const body = { massExportModelId: modell, taxGroup: 99, simKey: null, simName: null, years: [jahr], capitals: BETRAEGE, confession1: 5, confession2: 5, belastungsVergleich: 2, output: 1 };
  let last;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      return d.data || [];
    } catch (e) { last = e; await new Promise((r) => setTimeout(r, 3000 * (i + 1))); }
  }
  throw last;
}

/** Tabelle { KT: [Ort, Steuer@Betrag…] } aus den ESTV-Zeilen; null, wenn unvollständig. */
function tabelle(rows) {
  const out = {};
  for (const [kt, [ort, bfs]] of Object.entries(HAUPTORTE)) {
    const mine = rows.filter((r) => r.canton === kt && (r.municipality === ort || r.bfsId === bfs));
    const werte = BETRAEGE.map((b) => mine.find((r) => r.income === b)?.totalAbsoluteTax?.[0]);
    if (werte.some((v) => !(v >= 0))) return null;
    out[kt] = [ort, ...werte.map((v) => Math.round(v))];
  }
  return out;
}

/**
 * Jüngstes freigegebenes Steuerjahr. Für noch nicht freigegebene Jahre liefert die Schnittstelle Ersatzdaten
 * eines früheren Jahres; ein Jahr gilt daher nur als freigegeben, wenn es sich von beiden Vorjahren unterscheidet.
 */
export async function holeKapSteuer(log = console.log) {
  const heute = new Date().getFullYear();
  const cache = new Map();
  const ledig = async (y) => {
    if (!cache.has(y)) cache.set(y, await abfrage(MODELLE.ledig, y).then(tabelle).catch((e) => { log(`ESTV ${y}: ${e.message}`); return null; }));
    return cache.get(y);
  };
  const same = (a, b) => a && b && JSON.stringify(a) === JSON.stringify(b);
  // Künftige Steuerjahre liefert die Schnittstelle nur vorläufig (die ESTV-Oberfläche bietet sie nicht an): nie verwenden.
  for (const jahr of [heute, heute - 1]) {
    const t = await ledig(jahr);
    if (!t) continue;
    const letzte = jahr === heute - 1;
    if (!letzte && (same(t, await ledig(jahr - 1)) || same(t, await ledig(jahr - 2)))) { log(`ESTV ${jahr}: identisch mit einem Vorjahr – noch nicht freigegeben`); continue; }
    const verheiratet = tabelle(await abfrage(MODELLE.verheiratet, jahr));
    if (!verheiratet) { log(`ESTV ${jahr} verheiratet: unvollständig`); continue; }
    return { jahr, ledig: t, verheiratet };
  }
  throw new Error('ESTV-Daten nicht verfügbar');
}

/**
 * Plausibilität neuer Tabellenwerte vor der Übernahme. Liefert eine Liste von Auffälligkeiten (leer = in Ordnung):
 * Steuer steigt mit dem Betrag, Satz in einem vertretbaren Bereich, Verheiratete nicht höher als Ledige,
 * Änderung gegenüber dem bisherigen Wert höchstens ±30%.
 */
export function plausibel(neu, alt) {
  const out = [];
  for (const [kt, k] of Object.entries(neu.kantone)) {
    for (const stand of ['ledig', 'verheiratet']) {
      const w = k[stand];
      if (!Array.isArray(w) || w.length !== neu.stuetzstellen.length) { out.push(`${kt} ${stand}: unvollständig`); continue; }
      w.forEach((v, i) => {
        const b = neu.stuetzstellen[i], satz = v / b;
        if (!(v >= 0) || !Number.isFinite(v)) out.push(`${kt} ${stand} ${b}: kein Betrag`);
        else if (i && v < w[i - 1]) out.push(`${kt} ${stand} ${b}: Steuer sinkt mit steigendem Betrag`);
        else if (satz > 0.2 || (b >= 200000 && satz < 0.01)) out.push(`${kt} ${stand} ${b}: Satz ${(satz * 100).toFixed(1)}% ausserhalb 1–20%`);
        const vorher = alt?.kantone?.[kt]?.[stand]?.[i];
        if (vorher > 500 && Math.abs(v / vorher - 1) > 0.3) out.push(`${kt} ${stand} ${b}: ${vorher} → ${v} (mehr als ±30%)`);
      });
    }
    if (Array.isArray(k.ledig) && Array.isArray(k.verheiratet)) k.verheiratet.forEach((v, i) => { if (v > k.ledig[i] * 1.02 + 50) out.push(`${kt} ${neu.stuetzstellen[i]}: verheiratet (${v}) höher als ledig (${k.ledig[i]})`); });
  }
  if (Object.keys(neu.kantone).length !== 26) out.push(`${Object.keys(neu.kantone).length} statt 26 Kantone`);
  return out;
}

async function main() {
  const dry = process.argv.includes('--dry');
  const data = JSON.parse(await readFile(PARAMS, 'utf8'));
  const r = await holeKapSteuer();
  const kantone = Object.fromEntries(Object.keys(HAUPTORTE).sort().map((kt) => [kt, { ort: r.ledig[kt][0], ledig: r.ledig[kt].slice(1), verheiratet: r.verheiratet[kt].slice(1) }]));
  const neu = { steuerjahr: r.jahr, stuetzstellen: BETRAEGE, kantone };
  const alt = data.tables.kapSteuer.data;
  const same = JSON.stringify({ ...alt, abgerufen: undefined }) === JSON.stringify({ ...neu, abgerufen: undefined });
  console.log(`ESTV Steuerjahr ${r.jahr}: ZH 100'000 ledig ${kantone.ZH.ledig[2]}, verheiratet ${kantone.ZH.verheiratet[2]} – ${same ? 'unverändert' : 'GEÄNDERT'}`);
  if (same || dry) return;
  // Nichts übernehmen, was unplausibel aussieht: melden und mit Fehler enden (die Quellenprüfung eröffnet dann ein Issue)
  const auff = plausibel(neu, alt);
  if (auff.length) {
    console.error(`ESTV-Daten nicht übernommen, ${auff.length} Auffälligkeit(en):\n  ${auff.slice(0, 20).join('\n  ')}`);
    process.exit(3);
  }
  data.tables.kapSteuer.data = { ...neu, abgerufen: new Date().toISOString().slice(0, 10) };
  data.version = new Date().toISOString().slice(0, 16) + 'Z';
  await writeFile(PARAMS, JSON.stringify(data, null, 2) + '\n');
  console.log('→ params.json aktualisiert');
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/update-kapsteuer.mjs')) {
  main().catch((e) => { console.error(e); process.exit(2); });
}
