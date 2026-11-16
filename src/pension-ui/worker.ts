// Web Worker: rechnet die Auswertung ausserhalb des UI-Threads.
import { createEngine } from '../lib/pension/engine';
import { resolveParams, nextParams } from '../lib/pension/params';
import { auswerten } from '../lib/pension/auswertung';

let cache = { key: null, E: null, so: {} };
let grundlagen = null; // zuletzt übertragene Grundlagen; spätere Aufträge schicken sie nur bei Änderung mit

self.onmessage = (ev) => {
  const { id, S, A0, stopA } = ev.data;
  if (ev.data.params) grundlagen = ev.data.params;
  const params = grundlagen;
  try {
    const key = `${params.version}|${A0}`;
    const jahr = Math.floor(A0 / 12);
    if (cache.key !== key) cache = { key, E: createEngine(resolveParams(params, jahr), A0, nextParams(params, jahr)), so: {} };
    const t0 = performance.now();
    const R = auswerten(S, cache.E, stopA, cache.so, ev.data.varianten || []);
    R.ms = Math.round(performance.now() - t0);
    self.postMessage({ id, R });
  } catch (err) {
    self.postMessage({ id, error: String(err && err.stack ? err.stack : err) });
  }
};
