// ============================================================================
// berater-repo.ts — Serialisierung der Beraterprofile fuer das Repo.
//
// Die Profile leben browser-lokal in `bbzAdmin`; der geraeteuebergreifende
// Default ist die versionierte Datei `public/data/berater.json`. Hier entsteht
// genau dieser Dateiinhalt — und die Liste der Fotodateien, die daneben
// gehoeren. Reine Funktionen ohne DOM-Zugriff (unit-testbar); den Download
// selbst macht admin.ts.
//
// Regel: im JSON steht NIE Base64. Fotos sind Repo-Pfade, damit die Datei
// klein bleibt und bei jedem Seitenaufruf schnell laedt.
// ============================================================================
import type { Berater } from './schema';
import { beraterRepoTarget } from './images';

const SUFFIX = ['a', 'b', 'c'];
const KACHEL_FALLBACK = ['Wer ich bin', 'Was ich mag', 'Was Sie von mir erwarten können'];

export interface RepoKachel { titel: string; foto: string; content: string }
export interface RepoProfil { id: number; name: string; titel: string; foto: string; kacheln: RepoKachel[] }

interface AdminKachel { titel?: string; foto_b64?: string | null; content?: string }
const kachelnOf = (p: Berater): AdminKachel[] => ((p as { kacheln?: AdminKachel[] }).kacheln ?? []);

// Repo-Pfad, wie ihn berater.json fuehrt (relativ zu public/, ohne BASE).
export function beraterFotoPath(beraterId: number, kachelIdx: number): string {
  return `img/berater/berater${beraterId}${SUFFIX[kachelIdx] ?? 'a'}.jpg`;
}

// bbzAdmin-Stand -> Inhalt von public/data/berater.json.
export function buildRepoJson(profiles: Berater[]): RepoProfil[] {
  return profiles.map((p) => {
    const ks = kachelnOf(p);
    return {
      id: Number(p.id),
      name: String(p.name ?? 'Vorname Nachname'),
      titel: String(p.titel ?? 'Kundenberater:in'),
      foto: beraterFotoPath(Number(p.id), 0),
      kacheln: [0, 1, 2].map((i) => ({
        titel: String(ks[i]?.titel ?? KACHEL_FALLBACK[i]),
        foto: beraterFotoPath(Number(p.id), i),
        content: String(ks[i]?.content ?? ''),
      })),
    };
  });
}

export interface PendingFoto { beraterId: number; kachelIdx: number; label: string; filename: string; path: string; dataUrl: string }

// Fotos, die nur browser-lokal existieren und als Datei ins Repo gehoeren.
// Profile ohne eigenen Upload fehlen hier — dort gilt bereits der Repo-Default.
export function pendingFotos(profiles: Berater[]): PendingFoto[] {
  const out: PendingFoto[] = [];
  for (const p of profiles) {
    kachelnOf(p).forEach((k, i) => {
      if (!k.foto_b64) return;
      const path = beraterRepoTarget(Number(p.id), i);
      out.push({
        beraterId: Number(p.id),
        kachelIdx: i,
        label: `${String(p.name ?? 'Profil ' + p.id)} — ${k.titel ?? KACHEL_FALLBACK[i]}`,
        filename: path.split('/').pop() ?? 'berater.jpg',
        path,
        dataUrl: k.foto_b64,
      });
    });
  }
  return out;
}

// berater.json -> bbzAdmin-Struktur. Kacheltitel aus dem JSON gewinnen;
// geraetelokale foto_b64-Uploads gehen verloren (das ist der Sinn des Imports).
export function repoJsonToProfiles(raw: unknown): Berater[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => {
    const p = r as Berater;
    const ks = kachelnOf(p);
    return {
      id: Number(p.id),
      name: String(p.name ?? 'Vorname Nachname'),
      titel: String(p.titel ?? 'Kundenberater:in'),
      kacheln: [0, 1, 2].map((i) => ({
        titel: String(ks[i]?.titel ?? KACHEL_FALLBACK[i]),
        foto_b64: null,
        content: String(ks[i]?.content ?? ''),
      })),
    } as Berater;
  });
}
