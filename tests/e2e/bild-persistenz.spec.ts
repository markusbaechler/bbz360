// ============================================================================
// bild-persistenz.spec.ts — Regression: hochgeladene Bilder muessen den
// localStorage-Schreibvorgang ueberleben und in den Modulen ankommen.
//
// Historie: Uploads landeten ungeskaliert als Base64 in `bbzAdmin`/`bbzImages`.
// Ab ca. 5 MB pro Origin scheiterte setItem mit QuotaExceededError, der Fehler
// wurde verschluckt — der Admin zeigte das Bild (In-Memory) und meldete
// "gespeichert", Modul 03 zeigte es nie. Typisch beim dritten Portraet.
// ============================================================================
import { test, expect, type Page } from '@playwright/test';
import { deflateSync } from 'node:zlib';

// ── Echtes, gross-datiges PNG (Rauschen komprimiert kaum) ──────────────────
// Muss ein DEKODIERBARES Bild sein: die Umkodierung im Browser laeuft ueber
// den Bild-Decoder, ein Zufalls-Buffer wuerde sie stillschweigend umgehen.
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(head));
  return Buffer.concat([len, head, crc]);
}
function noisePng(w: number, h: number): Buffer {
  const raw = Buffer.alloc(h * (1 + w * 3));
  // xorshift32: deterministisch, aber echte Entropie — ein schwacher Generator
  // liesse sich wegkomprimieren und die Datei waere nie gross genug.
  let s = 0x9e3779b9;
  for (let y = 0; y < h; y++) {
    const off = y * (1 + w * 3);
    for (let x = 0; x < w * 3; x++) {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      raw[off + 1 + x] = s & 0xff;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8 bit, Truecolor
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 1 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const GROSSES_PORTRAET = noisePng(700, 700); // ~1.5 MB — drei davon sprengen roh die Quota

async function uploadPortraet(page: Page, idx: number, bytes: Buffer): Promise<void> {
  await page.locator(`#fotoRow [data-foto="${idx}"]`).click();
  await page.locator('#fotoFileInput').setInputFiles({
    name: `portrait${idx}.png`, mimeType: 'image/png', buffer: bytes,
  });
  await expect(page.locator('#fmImg')).toBeVisible();
  await page.locator('#fmClose').click();
}

test('drei grosse Portraetfotos bleiben gespeichert und erscheinen in Modul 03', async ({ page }) => {
  await page.goto('admin.html');
  await page.waitForSelector('#fotoRow [data-foto="0"]');
  for (const idx of [0, 1, 2]) await uploadPortraet(page, idx, GROSSES_PORTRAET);

  const persistiert = await page.evaluate(() => {
    const arr = JSON.parse(localStorage.getItem('bbzAdmin') || '[]') as Array<{ kacheln?: Array<{ foto_b64?: string | null }> }>;
    return (arr[0]?.kacheln ?? []).map((k) => !!k.foto_b64);
  });
  expect(persistiert).toEqual([true, true, true]);

  await page.goto('modules/03-berater.html');
  await page.waitForSelector('#cards .br-card');
  const sichtbar = await page.evaluate(() =>
    [1, 2, 3].map((i) => {
      const n = document.getElementById('photo-' + i);
      return !!n && !!n.style.backgroundImage && n.style.backgroundImage !== 'none';
    }));
  expect(sichtbar).toEqual([true, true, true]);
});

test('grosses App-Bild bleibt im Override-Store gespeichert', async ({ page }) => {
  await page.goto('admin.html');
  await page.locator('#tabImages').click();
  await page.waitForSelector('[data-act="replace"][data-slot="bank_hero"]');

  for (const slot of ['bank_hero', 'phil_1', 'phil_2']) {
    await page.locator(`[data-act="replace"][data-slot="${slot}"]`).click();
    await page.locator('#slotFileInput').setInputFiles({
      name: `${slot}.png`, mimeType: 'image/png', buffer: GROSSES_PORTRAET,
    });
    await expect(page.locator(`[data-slot="${slot}"] .ad-imgbadge`)).toBeVisible();
  }

  const gespeichert = await page.evaluate(() => {
    const o = JSON.parse(localStorage.getItem('bbzImages') || '{}') as Record<string, string>;
    return ['bank_hero', 'phil_1', 'phil_2'].map((s) => !!o[s]);
  });
  expect(gespeichert).toEqual([true, true, true]);
});

test('voller Speicher meldet den Fehlschlag statt "Foto gespeichert"', async ({ page }) => {
  await page.goto('admin.html');
  await page.waitForSelector('#fotoRow [data-foto="0"]');

  // Origin-Speicher bis kurz unter die Quota fuellen -> der naechste Upload MUSS scheitern.
  await page.evaluate(() => {
    const block = 'x'.repeat(64 * 1024);
    let i = 0;
    try { for (; i < 200; i++) localStorage.setItem('__fill' + i, block); } catch { /* voll */ }
  });

  // Ohne Helper: im Fehlerfall darf gerade KEINE Vorschau erscheinen.
  await page.locator('#fotoRow [data-foto="0"]').click();
  await page.locator('#fotoFileInput').setInputFiles({
    name: 'portrait0.png', mimeType: 'image/png', buffer: GROSSES_PORTRAET,
  });

  await expect(page.locator('#toast')).toContainText('nicht gespeichert');
  await expect(page.locator('#fmImg')).toBeHidden();
  const uebriggeblieben = await page.evaluate(() => {
    const arr = JSON.parse(localStorage.getItem('bbzAdmin') || '[]') as Array<{ kacheln?: Array<{ foto_b64?: string | null }> }>;
    return (arr[0]?.kacheln ?? []).some((k) => !!k.foto_b64);
  });
  expect(uebriggeblieben).toBe(false);
});
