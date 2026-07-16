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

function save(data: SessionData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('data: localStorage write failed', e);
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
  setBeraterProfiles(profiles: Berater[]): void {
    try {
      localStorage.setItem(ADMIN_KEY, JSON.stringify(profiles));
    } catch (e) {
      console.warn('data: bbzAdmin write failed', e);
    }
  },

  // ── Export / Import (ADR-5) ───────────────────────────────────────────────
  exportSession(): Blob {
    const payload = {
      __schemaVersion: SCHEMA_VERSION,
      bbzData: load(),
      bbzAdmin: this.getBeraterProfiles(),
    };
    return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  },

  async importSession(file: Blob): Promise<void> {
    const raw = JSON.parse(await file.text()) as unknown;
    if (!raw || typeof raw !== 'object') throw new Error('Ungueltige Session-Datei');
    const obj = raw as Record<string, unknown>;
    // Sowohl das Export-Format {bbzData, bbzAdmin} als auch ein blankes bbzData akzeptieren.
    const bbzData = 'bbzData' in obj ? obj.bbzData : obj;
    save(migrate(bbzData));
    if (Array.isArray(obj.bbzAdmin)) this.setBeraterProfiles(migrateAdmin(obj.bbzAdmin));
  },
};
