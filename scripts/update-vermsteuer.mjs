#!/usr/bin/env node
// Vermögenssteuer aus der amtlichen ESTV-Steuerbelastungsstatistik «Einkommens- und Vermögenssteuer»
// (https://swisstaxcalculator.estv.admin.ch/#/taxburden/income-wealth-tax, Steuerart Vermögen, geografischer Vergleich)
// für alle 26 Kantonshauptorte abrufen und in public/data/params.json (tables.vermSteuer) schreiben.
// Ledig = «Rentner/in, ledig», verheiratet = «Verheiratet, eine Rente»; ohne Konfession.
// Übernommen wird die Kantons- und Gemeindesteuer auf dem Reinvermögen (ohne Personalsteuer, ohne Kirchensteuer;
// der Bund erhebt keine Vermögenssteuer). Verwendet wird das laufende Steuerjahr, sofern die ESTV dafür eigene,
// vollständige Daten liefert (sonst das Vorjahr).
//
//   node scripts/update-vermsteuer.mjs          abrufen und bei Änderungen schreiben
//   node scripts/update-vermsteuer.mjs --dry    nur anzeigen

import { readFile, writeFile } from 'node:fs/promises';
import { HAUPTORTE } from './update-kapsteuer.mjs';

const PARAMS = new URL('../public/data/params.json', import.meta.url);
const API = 'https://swisstaxcalculator.estv.admin.ch/delegate/ost-integration/v1/maps/income-tax-values/DE';
// Vermögensklassen, wie sie die ESTV-Oberfläche anbietet
export const VERMOEGEN = [25000, 50000, 75000, 100000, 150000, 200000, 250000, 300000, 400000, 500000, 750000, 1000000, 5000000, 10000000];
const MODELLE = { ledig: 17, verheiratet: 18 };

async function abfrage(modell, jahr) {
  const body = { massExportModelId: modell, belastungsVergleich: 2, taxGroup: 99, confession: 5, incomes: [], fortunes: VERMOEGEN, klasse: 2, simKey: null, simName: null, years: [jahr], output: 1, considerMaximumExposureLimit: false, investmentIncome: null };
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

const erste = (v) => (Array.isArray(v) ? v[0] : v);
/** Tabelle { KT: [Ort, Steuer@Vermögen…] } aus den ESTV-Zeilen; null, wenn unvollständig. */
function tabelle(rows) {
  const out = {};
  for (const [kt, [ort, bfs]] of Object.entries(HAUPTORTE)) {
    const mine = rows.filter((r) => r.canton === kt && (r.municipality === ort || r.bfsId === bfs));
    const werte = VERMOEGEN.map((b) => {
      const r = mine.find((x) => x.fortune === b);
      if (!r) return undefined;
      const k = erste(r.cantonalTax), g = erste(r.municipalityTax), c = erste(r.churchTax) || 0;
      return k >= 0 && g >= 0 ? k + g + c : undefined;
    });
    if (werte.some((v) => !(v >= 0))) return null;
    out[kt] = [ort, ...werte.map((v) => Math.round(v))];
  }
  return out;
}

/**
 * Jüngstes freigegebenes Steuerjahr. Für noch nicht freigegebene Jahre liefert die Schnittstelle Ersatzdaten
 * eines früheren Jahres; ein Jahr gilt daher nur als freigegeben, wenn es sich von beiden Vorjahren unterscheidet.
 */
export async function holeVermSteuer(log = console.log) {
  const heute = new Date().getFullYear();
  const cache = new Map();
  const ledig = async (y) => {
    if (!cache.has(y)) cache.set(y, await abfrage(MODELLE.ledig, y).then(tabelle).catch((e) => { log(`ESTV Vermögen ${y}: ${e.message}`); return null; }));
    return cache.get(y);
  };
  const same = (a, b) => a && b && JSON.stringify(a) === JSON.stringify(b);
  for (const jahr of [heute, heute - 1]) {
    const t = await ledig(jahr);
    if (!t) continue;
    const letzte = jahr === heute - 1;
    if (!letzte && (same(t, await ledig(jahr - 1)) || same(t, await ledig(jahr - 2)))) { log(`ESTV Vermögen ${jahr}: identisch mit einem Vorjahr – noch nicht freigegeben`); continue; }
    const verheiratet = tabelle(await abfrage(MODELLE.verheiratet, jahr));
    if (!verheiratet) { log(`ESTV Vermögen ${jahr} verheiratet: unvollständig`); continue; }
    return { jahr, ledig: t, verheiratet };
  }
  throw new Error('ESTV-Daten zur Vermögenssteuer nicht verfügbar');
}

/**
 * Plausibilität neuer Tabellenwerte vor der Übernahme. Liefert eine Liste von Auffälligkeiten (leer = in Ordnung):
 * Steuer steigt mit dem Vermögen, Satz höchstens 1,5%, ab 1 Mio. mindestens 0,05%, Verheiratete nicht höher als
 * Ledige, Änderung gegenüber dem bisherigen Wert höchstens ±30%.
 */
export function plausibelVerm(neu, alt) {
  const out = [];
  for (const [kt, k] of Object.entries(neu.kantone)) {
    for (const stand of ['ledig', 'verheiratet']) {
      const w = k[stand];
      if (!Array.isArray(w) || w.length !== neu.stuetzstellen.length) { out.push(`${kt} ${stand}: unvollständig`); continue; }
      w.forEach((v, i) => {
        const b = neu.stuetzstellen[i], satz = v / b;
        if (!(v >= 0) || !Number.isFinite(v)) out.push(`${kt} ${stand} ${b}: kein Betrag`);
        else if (i && v < w[i - 1]) out.push(`${kt} ${stand} ${b}: Steuer sinkt mit steigendem Vermögen`);
        else if (satz > 0.015 || (b >= 1000000 && satz < 0.0005)) out.push(`${kt} ${stand} ${b}: Satz ${(satz * 1000).toFixed(2)}‰ ausserhalb 0,5–15‰`);
        const vorher = alt?.kantone?.[kt]?.[stand]?.[i];
        if (vorher > 300 && Math.abs(v / vorher - 1) > 0.3) out.push(`${kt} ${stand} ${b}: ${vorher} → ${v} (mehr als ±30%)`);
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
  const r = await holeVermSteuer();
  const kantone = Object.fromEntries(Object.keys(HAUPTORTE).sort().map((kt) => [kt, { ort: r.ledig[kt][0], ledig: r.ledig[kt].slice(1), verheiratet: r.verheiratet[kt].slice(1) }]));
  const neu = { steuerjahr: r.jahr, stuetzstellen: VERMOEGEN, kantone };
  const alt = data.tables.vermSteuer?.data;
  const same = !!alt && JSON.stringify({ ...alt, abgerufen: undefined }) === JSON.stringify({ ...neu, abgerufen: undefined });
  const i = VERMOEGEN.indexOf(1000000);
  console.log(`ESTV Vermögenssteuer ${r.jahr}: ZH 1 Mio. ledig ${kantone.ZH.ledig[i]}, verheiratet ${kantone.ZH.verheiratet[i]} – ${same ? 'unverändert' : 'GEÄNDERT'}`);
  if (same || dry) return;
  if (!data.tables.vermSteuer) throw new Error('tables.vermSteuer fehlt in params.json (Beschreibung und Quellen zuerst anlegen)');
  // Nichts übernehmen, was unplausibel aussieht: melden und mit Fehler enden (die Quellenprüfung eröffnet dann ein Issue)
  const auff = plausibelVerm(neu, alt);
  if (auff.length) {
    console.error(`ESTV-Daten nicht übernommen, ${auff.length} Auffälligkeit(en):\n  ${auff.slice(0, 20).join('\n  ')}`);
    process.exit(3);
  }
  data.tables.vermSteuer.data = { ...neu, abgerufen: new Date().toISOString().slice(0, 10) };
  data.version = new Date().toISOString().slice(0, 16) + 'Z';
  await writeFile(PARAMS, JSON.stringify(data, null, 2) + '\n');
  console.log('→ params.json aktualisiert');
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/update-vermsteuer.mjs')) {
  main().catch((e) => { console.error(e); process.exit(2); });
}
