// ============================================================================
// 06-ziele-zweistufig.spec.ts — Ziel- und Wunsch-Modal fuehren in zwei Stufen.
//
// Stufe 1 fragt nur "Worum geht es?". Erst nach der Wahl klappt die
// Erfassungsmaske auf; die Wahl schrumpft dann auf eine Zeile mit "aendern".
// Bearbeiten startet direkt in Stufe 2 — dort ist die Wahl schon getroffen.
// ============================================================================
import { test, expect } from '@playwright/test';

test('neues Ziel: Stufe 1 zeigt nur die Wahl', async ({ page }) => {
  await page.goto('modules/06-ziele.html');
  await page.waitForSelector('[data-kat]');
  await page.locator('[data-kat]').first().click();

  await expect(page.locator('#modalZiel .zl-wahl')).toBeVisible();
  await expect(page.locator('#modalZiel .zl-inspchip').first()).toBeVisible();
  // Erfassungsmaske und Speichern sind noch nicht da.
  await expect(page.locator('#mz-nm')).toBeHidden();
  await expect(page.locator('#mz-bt')).toBeHidden();
  await expect(page.locator('#mz-save')).toBeHidden();
  await expect(page.locator('#modalZiel .zl-auswahl')).toBeHidden();
});

test('Wahl oeffnet die Erfassungsmaske und schrumpft zur Zeile', async ({ page }) => {
  await page.goto('modules/06-ziele.html');
  await page.waitForSelector('[data-kat]');
  await page.locator('[data-kat]').first().click();
  const ersterChip = page.locator('#modalZiel .zl-inspchip').first();
  const begriff = (await ersterChip.innerText()).trim();
  await ersterChip.click();

  await expect(page.locator('#mz-nm')).toBeVisible();
  await expect(page.locator('#mz-bt')).toBeVisible();
  await expect(page.locator('#mz-save')).toBeVisible();
  await expect(page.locator('#modalZiel .zl-wahl')).toBeHidden();
  const zeile = page.locator('#modalZiel .zl-auswahl');
  await expect(zeile).toBeVisible();
  await expect(zeile).toContainText(begriff);
  await expect(zeile).toContainText('ändern');
});

test('"aendern" fuehrt zurueck zu Stufe 1, Auswahl bleibt markiert', async ({ page }) => {
  await page.goto('modules/06-ziele.html');
  await page.waitForSelector('[data-kat]');
  await page.locator('[data-kat]').first().click();
  await page.locator('#modalZiel .zl-inspchip').first().click();
  await page.locator('#modalZiel .zl-auswahl').click();

  await expect(page.locator('#modalZiel .zl-wahl')).toBeVisible();
  await expect(page.locator('#mz-save')).toBeHidden();
  await expect(page.locator('#modalZiel .zl-inspchip').first()).toHaveClass(/active/);
});

test('Bearbeiten eines erfassten Ziels startet in Stufe 2', async ({ page }) => {
  await page.goto('modules/06-ziele.html');
  await page.waitForSelector('[data-kat]');
  await page.locator('[data-kat]').first().click();
  await page.locator('#modalZiel .zl-inspchip').first().click();
  await page.locator('#mz-nm').fill('Eigenheim Testfall');
  await page.locator('#mz-save').click();
  await expect(page.locator('#modalZiel')).toBeHidden();

  // Erfasste Ziele erscheinen als Blase auf der Zeitachse; der Kreis oeffnet sie.
  await page.locator('.zl-bubble .zl-circle').first().click();

  await expect(page.locator('#mz-nm')).toBeVisible();
  await expect(page.locator('#mz-save')).toBeVisible();
  await expect(page.locator('#modalZiel .zl-wahl')).toBeHidden();
  await expect(page.locator('#mz-nm')).toHaveValue('Eigenheim Testfall');
});

test('Wunsch-Modal fuehrt genauso in zwei Stufen', async ({ page }) => {
  await page.goto('modules/06-ziele.html');
  await page.waitForSelector('#btnWunsch');
  await page.locator('#btnWunsch').click();

  await expect(page.locator('#modalWunsch .zl-wahl')).toBeVisible();
  await expect(page.locator('#w-name')).toBeHidden();
  await expect(page.locator('#mw-save')).toBeHidden();

  await page.locator('#mw-kat .zl-inspchip').first().click();

  await expect(page.locator('#w-name')).toBeVisible();
  await expect(page.locator('#mw-save')).toBeVisible();
  await expect(page.locator('#modalWunsch .zl-auswahl')).toBeVisible();
});

// Der Leerzustand trug einen handgesetzten Zeilenumbruch fuer die alte
// Schriftgroesse — dadurch klebte der Gedankenstrich am naechsten Wort
// ("Sie –heute") und der Satz brach mitten drin um.
test('Leerzustand: Satz bricht natuerlich, Gedankenstrich sauber gesetzt', async ({ page }) => {
  await page.goto('modules/06-ziele.html');
  await page.waitForSelector('#emptyHint');

  const m = await page.evaluate(() => {
    const e = document.getElementById('emptyHint')!;
    const t = document.querySelector('.zl-empty-text') as HTMLElement;
    const norm = (s: string | null | undefined): string =>
      (s ?? '').replace(/[«»?.]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    return {
      text: (t.textContent ?? '').trim(),
      block: (e.textContent ?? '').trim(),
      harteUmbrueche: e.querySelectorAll('br').length,
      buehne: norm(t.textContent),
      saeuleTitel: norm(document.querySelector('.rail-title')?.textContent),
      eyebrow: norm(document.querySelector('.zl-empty-eyebrow')?.textContent),
      saeuleKicker: norm(document.querySelector('.rail-kicker')?.textContent),
      passt: t.scrollWidth <= t.clientWidth + 1,
    };
  });

  expect(m.harteUmbrueche).toBe(0);
  expect(m.text).not.toContain('–heute');
  expect(m.block).not.toMatch(/\S[–—]\S/); // Gedankenstrich braucht Luft
  expect(m.passt).toBe(true);

  // Die Buehne darf die Saeule nicht wiederholen — links steht die Frage,
  // rechts der naechste Schritt.
  expect(m.buehne).not.toBe(m.saeuleTitel);
  expect(m.saeuleTitel).not.toContain(m.buehne);
  expect(m.eyebrow).not.toContain('ziele & wünsche');
  expect(m.eyebrow).not.toBe(m.saeuleKicker);
});

// Der Leerzustand wurde per Inline-Style auf display:block geschaltet und
// verlor damit die Zentrierung aus .zl-empty (display:flex) — der Titelblock
// klebte oben statt mittig in der leeren Flaeche zu stehen.
test('Leerzustand steht mittig in der leeren Zeitachse', async ({ page }) => {
  await page.goto('modules/06-ziele.html');
  await page.waitForSelector('#emptyHint');

  const m = await page.evaluate(() => {
    const e = document.getElementById('emptyHint')!;
    const t = document.querySelector('.zl-empty-text') as HTMLElement;
    const eb = e.getBoundingClientRect(), tb = t.getBoundingClientRect();
    return {
      display: getComputedStyle(e).display,
      abweichung: Math.abs((eb.top + eb.bottom) / 2 - (tb.top + tb.bottom) / 2),
    };
  });

  expect(m.display).toBe('flex');
  expect(m.abweichung).toBeLessThan(60); // Titelzeile nahe der Mitte
});
