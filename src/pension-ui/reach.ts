// Reichweite des freien Vermögens: Daten für die Marken im Bild (Pensionierung, AHV, Lebenserwartung, Dauer im Basisszenario
// und im Stresstest) und der Satz dazu für Bildschirmleser, Urteil und PDF. Achse: Alter von Person 1.
import type { Auswertung, SimPerson } from '../lib/pension/analyse';
import type { Engine } from '../lib/pension/engine';
import type { PensState } from '../lib/pension/typen';

/** Markierung auf dem Zeitstrahl (Pensionierung, AHV, Lebenserwartung). */
export interface ReachMarke { kind: string; x: number; label: string }
/** Leiste eines Szenarios: Ende der Achse, Alter beim Aufbrauchen (null: reicht), knappe Reserve, Liegenschaft als Reserve. */
export interface ReachLeiste { end: number; dep: number | null; knapp: boolean; lg: boolean }
/** Daten des Zeitstrahls, wie reachData() sie liefert. */
export type ReachDaten = ReturnType<typeof reachData>;

const HZ_TXT: Record<string, string> = { le5: 'Lebenserwartung plus 5 Jahre', le: 'Lebenserwartung', 95: 'fest bis 95', eigen: 'eigene Annahme' };
const fl = (x: number) => Math.floor(x + 1e-9);

/** Daten des Zeitstrahls aus dem Planergebnis R (analyse). */
export function reachData(R: Auswertung, E: Engine, S: PensState) {
  const b = R.amp.base, s = R.amp.stress, ps = b.ps, cpl = ps.length > 1, b1 = E.birthA(ps[0]);
  const age = (A: number) => (A - b1) / 12;
  const own = (p: SimPerson, A: number) => fl((A - 1 - E.birthA(p)) / 12); // eigenes Alter im letzten Monat davor
  const hP = R.horizontP || ps.map(() => R.horizont);
  const a0 = age(E.A0);
  // Leisten enden beim Alter, das in der Beschriftung steht (Horizont bzw. 100)
  const endB = Math.max(R.horizont, ...ps.map((p, i) => age(E.birthA(p) + hP[i] * 12)));
  const endS = Math.max(100, ...ps.map((p) => age(E.birthA(p) + 100 * 12)));
  const bar = (res: { depletedA: number | null }, end: number) => ({ end, dep: res.depletedA != null ? Math.max(a0, age(res.depletedA)) : null });
  const base: ReachLeiste = { ...bar(b, endB), knapp: b.depletedA == null && b.endV < b.reserve, lg: !!R.amp.lgRot || (!!R.amp.reserveLg && b.depletedA == null && b.endV < b.reserve) };
  const stress: ReachLeiste = { ...bar(s, endS), knapp: false, lg: !!R.amp.reserveLg && s.depletedA != null };

  // Markierungen: Pensionierung und AHV je Person (gleichzeitig = eine Markierung), Lebenserwartung
  const marks: ReachMarke[] = [];
  const pair = (kind: string, name: string, A: (p: SimPerson) => number) => {
    const xs = ps.map((p, i) => ({ x: age(A(p)), i, a: own(p, A(p)) })).filter((m) => m.x > a0 + 0.05);
    if (!xs.length) return;
    if (!cpl) marks.push({ kind, x: xs[0].x, label: `${name} ${xs[0].a}` });
    else if (xs.length === 2 && Math.abs(xs[0].x - xs[1].x) < 0.5) marks.push({ kind, x: Math.min(xs[0].x, xs[1].x), label: kind === 'pens' ? 'Pensionierung' : name });
    else xs.forEach((m) => marks.push({ kind, x: m.x, label: `${name} P${m.i + 1} (${m.a})` }));
  };
  pair('pens', cpl ? 'Pension' : 'Pensionierung', (p) => p.Aret);
  pair('ahv', 'AHV', (p) => p.Aahv);
  const leX = Math.max(...ps.map((p, i) => R.le[i] + (E.birthA(p) - b1) / 12));
  if (leX > a0) marks.push({ kind: 'le', x: leX, label: cpl ? 'Lebenserwartung' : `Lebenserwartung ${Math.round(R.le[0])}` });
  marks.sort((m, n) => m.x - n.x);

  return { cpl, a0, aMax: Math.max(endB, endS), H: R.horizont, base, stress, marks, le: R.le.map((x) => Math.round(x)), hzTxt: HZ_TXT[S.horizontModus] || HZ_TXT.le5 };
}

/** Zusammenfassung in einem Satz (Bildschirmleser, PDF). */
export function reachText(d: ReachDaten) {
  // als Satzteil: «im Basisszenario reicht es bis 91», «im Stresstest ist es mit 97 aufgebraucht»
  const c = (w: 'base' | 'stress') => {
    const r = d[w];
    if (r.dep == null) return `reicht es bis ${w === 'stress' ? (d.cpl ? '100 (beide Personen)' : 100) : d.H}${r.knapp ? (r.lg ? ', Reserve: Liegenschaft' : ', aber mit knapper Reserve') : ''}`;
    return `ist es mit ${fl(r.dep)} aufgebraucht${r.lg ? ', danach dient die Liegenschaft als Reserve' : ''}`;
  };
  return `Reichweite des freien Vermögens${d.cpl ? ' (Alter Person 1)' : ''}: im Basisszenario ${c('base')}, im Stresstest ${c('stress')}. `
    + `Durchschnittliche Lebenserwartung laut BFS: ${d.cpl ? `${d.le[0]} (Person 1) und ${d.le[1]} (Person 2)` : d.le[0]}; gerechnet bis ${d.H}${d.cpl ? ' (Alter Person 1)' : ''}: ${d.hzTxt}.`;
}
