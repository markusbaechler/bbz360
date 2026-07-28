// ============================================================================
// data.ts — typisierte Datenschicht (Port von v1 bbz-data.js). localStorage-Persistenz.
// - Beim Laden wird migrate() angewandt (v2 liest v1-Daten, ADR-4).
// - bbzAdmin (Berater[]) ist separat; NUR ueber setBeraterProfiles() schreibbar,
//   das ausschliesslich admin importiert (ADR/Schema-Regel).
// - Export/Import der Session als JSON (ADR-5).
// ============================================================================
import { migrate, migrateAdmin, SCHEMA_VERSION } from './schema';
import type { SessionData, Berater } from './schema';

const STORAGE_KEY = 'bbzData';
const ADMIN_KEY = 'bbzAdmin';
// Bild-Override-Store aus images.ts — bewusst als loser String-Store gefuehrt,
// damit data.ts nicht an images.ts koppelt (siehe exportSession/importSession).
const IMAGES_KEY = 'bbzImages';

// Speicher voll: unterscheidbar von "Datei kaputt", damit die Oberflaeche das
// Richtige sagen kann. Bei diesem Fehler ist der bisherige Stand unveraendert.
export class SpeicherVollError extends Error {
  constructor() {
    super('Speicher voll');
    this.name = 'SpeicherVollError';
  }
}

// Betrags-Keys -> number-Zwang beim Schreiben (wie v1 _coerce type:'number').
const NUMBER_KEYS = new Set<string>([
  'cockpit_einkommen', 'cockpit_verpflichtungen', 'cockpit_pk_saldo',
  'cockpit_anlage_f', 'anlage_betrag', 'anlage_horizont', 'aktiverBerater',
]);

// config-Keys bleiben bei clearSession() erhalten (v1 SCHEMA scope:'config').
const CONFIG_KEYS = new Set<string>([
  'bankTexts', 'bankHeroSub', 'vereinbarungenHeroImage', 'fb_s1_img',
  'abschluss_bgImage', 'aktiverBerater', 'beraterName', 'beraterTitel',
  'beratervorstellung', 'activeBranches', 'disabled',
]);

function isConfigKey(k: string): boolean {
  return CONFIG_KEYS.has(k) || k.startsWith('beratervorstellung_') || k.startsWith('berater_texte_');
}

function coerce(key: string, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (NUMBER_KEYS.has(key)) {
    return typeof value === 'string'
      ? parseFloat(value.replace(/['\s]/g, '').replace(',', '.')) || null
      : Number(value);
  }
  return value;
}

function load(): SessionData {
  try {
    return migrate(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'));
  } catch {
    return migrate({});
  }
}

function save(data: SessionData): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    console.warn('data: localStorage write failed', e);
    return false;
  }
}

function saveImages(o: unknown): boolean {
  try {
    localStorage.setItem(IMAGES_KEY, JSON.stringify(o));
    return true;
  } catch (e) {
    console.warn('data: bbzImages write failed', e);
    return false;
  }
}

export const BBZ = {
  get<K extends keyof SessionData>(key: K): SessionData[K] | null {
    const data = load();
    return key in data ? data[key] : null;
  },

  set(key: string, value: unknown): void {
    const data = load();
    (data as Record<string, unknown>)[key] = coerce(key, value);
    save(data);
  },

  merge(obj: Record<string, unknown>): void {
    const data = load();
    for (const [k, v] of Object.entries(obj)) (data as Record<string, unknown>)[k] = coerce(k, v);
    save(data);
  },

  setIfEmpty(key: string, value: unknown): void {
    const cur = this.get(key as keyof SessionData);
    if (cur === null || cur === '' || cur === undefined) this.set(key, value);
  },

  all(): SessionData {
    return load();
  },

  clearSession(): void {
    const data = load();
    const kept: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      if (k === '__schemaVersion') continue;
      if (isConfigKey(k)) kept[k] = v;
    }
    save(migrate(kept));
    try {
      localStorage.removeItem('bbzBgImage');
    } catch {
      /* noop */
    }
  },

  clearAll(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* noop */
    }
  },

  // ── Berater-Profile aus data/berater.json (v1 BBZ.getProfile/getAllProfiles) ──
  async getAllProfiles(): Promise<Berater[]> {
    try {
      const res = await fetch(import.meta.env.BASE_URL + 'data/berater.json');
      if (!res.ok) return [];
      return (await res.json()) as Berater[];
    } catch {
      return [];
    }
  },

  async getProfile(id?: number): Promise<Berater | null> {
    const activeId = id || (this.get('aktiverBerater') as number | null) || 1;
    const profiles = await this.getAllProfiles();
    return profiles.find((p) => p.id === activeId) || profiles[0] || null;
  },

  // ── Berater-Profile (bbzAdmin) ────────────────────────────────────────────
  getBeraterProfiles(): Berater[] {
    try {
      return migrateAdmin(JSON.parse(localStorage.getItem(ADMIN_KEY) || '[]'));
    } catch {
      return [];
    }
  },

  // WICHTIG: einziger bbzAdmin-Writer. Ausschliesslich von admin importieren.
  // false = nicht geschrieben (Quota). Der Aufrufer MUSS das melden, sonst
  // zeigt der Admin ein Bild, das in keinem Modul ankommt.
  setBeraterProfiles(profiles: Berater[]): boolean {
    try {
      localStorage.setItem(ADMIN_KEY, JSON.stringify(profiles));
      return true;
    } catch (e) {
      console.warn('data: bbzAdmin write failed', e);
      return false;
    }
  },

  // ── Export / Import (ADR-5) ───────────────────────────────────────────────
  // bbzImages = zentraler Bild-Override-Store (images.ts); als Teil der Session
  // portiert, ohne data.ts an images.ts zu koppeln (loser String-Store).
  exportSession(): Blob {
    let bbzImages: unknown = {};
    try { bbzImages = JSON.parse(localStorage.getItem(IMAGES_KEY) || '{}'); } catch { /* noop */ }
    const payload = {
      __schemaVersion: SCHEMA_VERSION,
      bbzData: load(),
      bbzAdmin: this.getBeraterProfiles(),
      bbzImages,
    };
    return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  },

  // Alles-oder-nichts: reicht der Speicher nicht, wird der vorherige Stand
  // wiederhergestellt und SpeicherVollError geworfen. Ein halb geschriebener
  // Import wuerde alte und neue Sitzung vermischen — schlimmer als kein Import.
  async importSession(file: Blob): Promise<void> {
    const raw = JSON.parse(await file.text()) as unknown;
    if (!raw || typeof raw !== 'object') throw new Error('Ungueltige Session-Datei');
    const obj = raw as Record<string, unknown>;
    // Sowohl das Export-Format {bbzData, bbzAdmin} als auch ein blankes bbzData akzeptieren.
    const bbzData = 'bbzData' in obj ? obj.bbzData : obj;

    const vorher: Array<[string, string | null]> =
      [STORAGE_KEY, ADMIN_KEY, IMAGES_KEY].map((k) => [k, localStorage.getItem(k)]);
    const zuruecksetzen = (): void => {
      for (const [k, v] of vorher) {
        try {
          if (v === null) localStorage.removeItem(k);
          else localStorage.setItem(k, v);
        } catch { /* noop */ }
      }
    };

    const ok =
      save(migrate(bbzData)) &&
      (!Array.isArray(obj.bbzAdmin) || this.setBeraterProfiles(migrateAdmin(obj.bbzAdmin))) &&
      (!obj.bbzImages || typeof obj.bbzImages !== 'object' || saveImages(obj.bbzImages));
    if (!ok) {
      zuruecksetzen();
      throw new SpeicherVollError();
    }
  },
};
