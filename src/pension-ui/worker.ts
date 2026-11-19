// Web Worker: rechnet die Auswertung ausserhalb des UI-Threads.
import { createEngine } from '../lib/pension/engine';
import { resolveParams, nextParams } from '../lib/pension/params';
import { auswerten } from '../lib/pension/auswertung';
import type { Engine } from '../lib/pension/engine';
import type { AnalyseCache } from '../lib/pension/analyse';
import type { ParamDatei } from '../lib/pension/typen';
import type { AppErgebnis } from './app';

let cache: { key: string | null; E: Engine | null; so: AnalyseCache } = { key: null, E: null, so: {} };
let grundlagen: ParamDatei | null = null; // zuletzt übertragene Grundlagen; spätere Aufträge schicken sie nur bei Änderung mit

self.onmessage = (ev) => {
  const { id, S, A0, stopA } = ev.data;
  if (ev.data.params) grundlagen = ev.data.params;
  const params = grundlagen as ParamDatei;
  try {
    const key = `${params.version}|${A0}`;
    const jahr = Math.floor(A0 / 12);
    if (cache.key !== key) cache = { key, E: createEngine(resolveParams(params, jahr), A0, nextParams(params, jahr)), so: {} };
    const t0 = performance.now();
    const R: AppErgebnis = auswerten(S, cache.E!, stopA, cache.so, ev.data.varianten || []);
    R.ms = Math.round(performance.now() - t0);
    self.postMessage({ id, R });
  } catch (err: any) {
    self.postMessage({ id, error: String(err && err.stack ? err.stack : err) });
  }
};
