import { describe, it, expect } from 'vitest';
import { buildRepoJson, pendingFotos, repoJsonToProfiles, beraterFotoPath } from '../../src/lib/berater-repo';
import type { Berater } from '../../src/lib/schema';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

const profil = (id: number, name: string, fotoAt: number[] = []): Berater => ({
  id, name, titel: 'Kundenberater:in',
  kacheln: ['Wer ich bin', 'Was ich mag', 'Was Sie von mir erwarten können'].map((t, i) => ({
    titel: t,
    foto_b64: fotoAt.includes(i) ? PNG : null,
    content: `<p>Text ${id}/${i}</p>`,
  })),
});

describe('buildRepoJson — bbzAdmin → public/data/berater.json', () => {
  it('schreibt niemals Base64 ins JSON, sondern Repo-Pfade', () => {
    const json = buildRepoJson([profil(1, 'Anna Meier', [0, 1, 2])]);
    const raw = JSON.stringify(json);
    expect(raw).not.toContain('data:image');
    expect(raw).not.toContain('base64');
    expect(json[0].foto).toBe('img/berater/berater1a.jpg');
    expect(json[0].kacheln.map((k) => k.foto)).toEqual([
      'img/berater/berater1a.jpg', 'img/berater/berater1b.jpg', 'img/berater/berater1c.jpg',
    ]);
  });

  it('erhält Name, Titel, Kacheltitel, Inhalte und Reihenfolge', () => {
    const json = buildRepoJson([profil(2, 'Bea Studer'), profil(1, 'Anna Meier')]);
    expect(json.map((p) => p.id)).toEqual([2, 1]); // Reihenfolge unverändert
    expect(json[0].name).toBe('Bea Studer');
    expect(json[0].titel).toBe('Kundenberater:in');
    expect(json[0].kacheln[1].titel).toBe('Was ich mag');
    expect(json[0].kacheln[2].content).toBe('<p>Text 2/2</p>');
  });

  it('füllt fehlende Kacheln mit den Standardtiteln auf', () => {
    const json = buildRepoJson([{ id: 3, name: 'Chris Frei' } as Berater]);
    expect(json[0].kacheln).toHaveLength(3);
    expect(json[0].kacheln[0].titel).toBe('Wer ich bin');
    expect(json[0].kacheln[0].content).toBe('');
  });
});

describe('pendingFotos — welche Bilddateien ins Repo gehören', () => {
  it('listet nur lokal hochgeladene Fotos, mit Zielpfad und Dateiname', () => {
    const list = pendingFotos([profil(1, 'Anna Meier', [0, 2]), profil(2, 'Bea Studer')]);
    expect(list).toHaveLength(2);
    expect(list[0].path).toBe('public/img/berater/berater1a.jpg');
    expect(list[0].filename).toBe('berater1a.jpg');
    expect(list[0].dataUrl).toBe(PNG);
    expect(list[1].filename).toBe('berater1c.jpg');
    expect(list[0].label).toContain('Anna Meier');
  });

  it('ist leer, wenn nur Repo-Defaults gelten', () => {
    expect(pendingFotos([profil(1, 'Anna Meier')])).toEqual([]);
  });
});

describe('repoJsonToProfiles — berater.json → bbzAdmin', () => {
  it('übernimmt die Kacheltitel aus dem JSON und verwirft lokale Fotos', () => {
    const next = repoJsonToProfiles([
      { id: 1, name: 'Anna Meier', titel: 'Beraterin', kacheln: [{ titel: 'Eigener Titel', content: '<p>A</p>' }] },
    ]);
    const k = (next[0] as { kacheln: Array<{ titel: string; foto_b64: null; content: string }> }).kacheln;
    expect(k[0].titel).toBe('Eigener Titel');
    expect(k[0].foto_b64).toBeNull();
    expect(k).toHaveLength(3);
    expect(k[1].titel).toBe('Was ich mag'); // fehlende Kachel → Standardtitel
  });

  it('gibt bei kaputtem Inhalt eine leere Liste zurück (lokaler Stand bleibt)', () => {
    expect(repoJsonToProfiles(null)).toEqual([]);
    expect(repoJsonToProfiles({ profiles: [] })).toEqual([]);
  });
});

describe('beraterFotoPath', () => {
  it('folgt der Namenskonvention berater<id>{a,b,c}.jpg', () => {
    expect(beraterFotoPath(4, 0)).toBe('img/berater/berater4a.jpg');
    expect(beraterFotoPath(4, 2)).toBe('img/berater/berater4c.jpg');
    expect(beraterFotoPath(4, 9)).toBe('img/berater/berater4a.jpg'); // Fallback
  });
});
