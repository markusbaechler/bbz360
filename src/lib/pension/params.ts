// Parameter-Auflösung: Die Datei public/data/params.json enthält jeden Wert pro Gültigkeitsjahr
// zusammen mit seinen Quellen. resolveParams(data, jahr) liefert das verschachtelte Objekt P,
// mit dem der Rechenkern arbeitet: für jedes Jahr gilt der jüngste Wert, der bis dahin gültig ist.

import type { ParamDatei, Params } from './typen';

/** Ungeprüfter Inhalt von verification.json (Prüfstand je Parameter bzw. Tabelle); Struktur dynamisch. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PruefStand = Record<string, any>;
export interface PruefDatei { params?: Record<string, PruefStand>; tables?: Record<string, PruefStand>; [k: string]: unknown }

/** Wert eines Parameters für ein Jahr: jüngster Eintrag mit Jahr ≤ jahr (sonst ältester). */
export function valueFor<T = unknown>(param: { values: Record<string, T> }, jahr: number): { value: T; year: number } | undefined {
  const ys = Object.keys(param.values).map(Number).sort((a, b) => a - b);
  if (!ys.length) return undefined;
  let pick = ys[0];
  for (const y of ys) if (y <= jahr) pick = y;
  return { value: param.values[String(pick)], year: pick };
}

function setPath(obj: Params, path: string, v: unknown) {
  const ks = path.split('.');
  let o = obj;
  for (const k of ks.slice(0, -1)) o = o[k] ??= {};
  o[ks[ks.length - 1]] = v;
}

/**
 * Löst alle Parameter für ein Rechnungsjahr auf.
 * @returns {object} P mit P.meta = { jahr, datenJahr, veraltet }
 */
export function resolveParams(data: ParamDatei, jahr: number): Params {
  const P = {} as Params;
  let maxYear = 0;
  for (const [key, param] of Object.entries(data.params)) {
    const r = valueFor(param, jahr);
    if (!r) continue;
    setPath(P, key, r.value);
    if (param.kind === 'gesetz') maxYear = Math.max(maxYear, ...Object.keys(param.values).map(Number));
  }
  for (const [key, table] of Object.entries(data.tables || {})) {
    // Tabellen mit «byYear»: Daten pro Gültigkeitsjahr, es gilt das jüngste Jahr ≤ jahr
    setPath(P, key, table.byYear ? valueFor({ values: table.data as Record<string, unknown> }, jahr)?.value : table.data);
  }
  P.meta = {
    jahr,
    version: data.version,
    // Für das Rechnungsjahr liegen noch keine bestätigten Werte vor: Vorjahreswerte werden verwendet.
    veraltet: maxYear > 0 && jahr > maxYear,
    letztesDatenjahr: maxYear,
  };
  return P;
}

/**
 * Werte des Folgejahres, sofern für jahr + 1 bereits eigene Werte erfasst sind (sonst null).
 * Der Rechenkern verwendet sie in der Projektion ab dem 1. Januar.
 */
export function nextParams(data: ParamDatei, jahr: number): Params | null {
  const y = String(jahr + 1);
  const neu = Object.values(data.params).some((p) => p.values[y] !== undefined)
    || Object.values(data.tables || {}).some((t) => t.byYear && (t.data as Record<string, unknown>)[y] !== undefined);
  return neu ? resolveParams(data, jahr + 1) : null;
}

/**
 * Wie viele gesetzliche Grundlagen sind bestätigt? Gezählt werden die gesetzlichen Werte des Rechnungsjahrs und die
 * gesetzlichen Tabellen (Referenzalter, Übergangsgeneration, Beitragstabelle). ok(c): Regel für «bestätigt».
 */
export function pruefZahl(data: ParamDatei, verification: PruefDatei | null | undefined, jahr: number, ok: (c: PruefStand | undefined) => boolean) {
  const vp = verification?.params || {}, vt = verification?.tables || {};
  const werte = Object.entries(data.params).filter(([, p]) => p.kind === 'gesetz');
  const tabellen = Object.entries(data.tables || {}).filter(([, t]) => t.kind === 'gesetz');
  const n = werte.filter(([k, p]) => ok(vp[k]?.byYear?.[valueFor(p, jahr)?.year as number] ?? vp[k])).length + tabellen.filter(([k]) => ok(vt[k])).length;
  return { ok: n, alle: werte.length + tabellen.length };
}

/** Liste aller Parameter mit dem für ein Jahr gültigen Wert und dem Wert des Folgejahres. */
export function paramOverview(data: ParamDatei, jahr: number) {
  return Object.entries(data.params).map(([key, p]) => {
    const now = valueFor(p, jahr);
    const next = valueFor(p, jahr + 1);
    return {
      key,
      label: p.label,
      unit: p.unit,
      kind: p.kind,
      note: p.note,
      value: now?.value,
      gueltigAb: now?.year,
      next: next && next.year > (now?.year ?? 0) ? next : null,
      sources: (p.sources || []).map((s) => ({ ...s, ...(data.sources[s.id] || {}) })),
    };
  });
}
