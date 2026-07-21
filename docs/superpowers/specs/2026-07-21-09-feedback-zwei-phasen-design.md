# Modul 09 (Feedback) — Zwei Phasen: Erwartungsabgleich, dann Schlussfragen

**Datum:** 2026-07-21
**Status:** Abgenommen (Design), bereit für Umsetzungsplan

## Problem

Modul 09 zeigt heute zwei Dinge gleichzeitig auf einer Bühne: links den
Erwartungsabgleich (Slider je Erwartung aus Modul 01), rechts das Panel
„ZWEI FRAGEN ZUM SCHLUSS". Die Schlussfragen ziehen Aufmerksamkeit ab,
während Kundin oder Kunde die Erwartungen bewerten — der Erwartungsabgleich
verliert seinen Ernst, und die Fragen selbst gehen im Gedränge unter
(`.fb-qpanel` hat `overflow:hidden`, auf niedrigen Bildschirmen wird die
zweite Frage sogar angeschnitten).

Das widerspricht der eigenen Spec: `design/DESIGN-SPEC.md` §1 verlangt
„genau EIN Arbeitsfokus" pro Bühne, §2 sequenzielle Freischaltung.

## Ziel

Die zwei Schlussfragen kommen **nach** dem Erwartungsabgleich und bekommen
einen eigenen, ruhigen Screen. Sie bleiben als Paar erhalten („Zwei Fragen
zum Schluss"), werden aber deutlich grösser dargestellt.

Nicht Ziel: neue Inhalte, neue Datenfelder für Antworten (die Fragen sind
Gesprächsimpulse, keine Erfassung), Änderungen an Modul 01 oder 10.

## Lösung

Modul 09 wird ein Zwei-Phasen-Modul nach dem Wizard-Muster, das 07b und 08
bereits verwenden (`design/referenz-08-planen.html`).

### Säule

Bleibt Erzähler. Reihenfolge von oben:

1. Kicker `09 · GESPRÄCHSABSCHLUSS`, Titel „Wie haben wir Ihre Erwartungen
   erfüllt?", Untertitel (`#railSub`) — phasenabhängig:
   - Phase 1: „Sie haben zu Beginn etwas von sich geteilt. Jetzt ist der
     Moment, ehrlich Bilanz zu ziehen."
   - Phase 2: „Zum Schluss zwei Fragen, die uns beiden etwas mitgeben."
2. **Neu:** Phasenliste `#railPhases` im bestehenden Theme-Muster
   (`.rail-phase` + `.pc`, Zustände `done` / `active` / `next`):
   `1 Erwartungsabgleich` · `2 Zwei Fragen zum Schluss`.
   Erledigte Phase trägt `data-goto` und ist anklickbar (Rücksprung), exakt
   wie `08-vereinbarungen.ts`.
3. Gesamteindruck (`#railAvg` / `#railAdj`) als Arbeitsstand — bleibt in
   beiden Phasen sichtbar, in Phase 2 als Quittung des Bewerteten.
4. `.rail-foot` unverändert.

### Phase 1 — Erwartungsabgleich

Bühne (Standardbreite `--stage-max`), zwei Spalten wie heute:

- **Links** `.fb-panel`: Kicker „IHRE ERWARTUNGEN ZU BEGINN · BILANZ",
  darunter je Erwartung eine `.fb-row` (Nummer, Erwartungstext mit roter
  Kante, Slider 1–10, Zahl + Adjektiv, Skalenbeschriftung). Unverändert
  gegenüber heute, inkl. Fallback-Erwartung und Live-Persistenz.
- **Rechts** `.fb-side` (grid-template-rows `auto 1fr`):
  - oben `.fb-thumbpanel`: grosser Daumen, Ø-Wert, Adjektiv — unverändert;
  - unten **neu** `.fb-titlepanel`: das Feedback-Titelbild (`#s1img`,
    Registry-Slot `fb_title`) füllt als Panel den Platz, den heute das
    Fragen-Panel belegt. Upload-Label `⇪ Bild` bleibt `edit-only`.

Aktionsleiste: links „Phase 1 von 2 · Erwartungsabgleich", rechts
Primäraktion **„Weiter: Zwei Fragen zum Schluss →"** (nicht gedimmt — jede
Erwartung hat den Vorgabewert 7, es gibt keinen unvollständigen Zustand).

### Phase 2 — Zwei Fragen zum Schluss

Bühne im Fokus-Container (`bbz-work--focus`, `--stage-focus` = 1100px; die
Aktionsleiste folgt automatisch über den bestehenden Theme-Selektor).
Ein einziges Panel `.fb-qpanel`, Kicker „ZWEI FRAGEN ZUM SCHLUSS", darin
zwei Karten `.fb-q` untereinander, getrennt durch `--line-soft`:

- Bild links (`#qimg-0` / `#qimg-1`, Slots `fb_q1` / `fb_q2`), Breite ~240px,
  Höhe ~180px statt heute 96×76.
- Rechts: Kicker „FRAGE 1 VON 2", Fragetext in `--fs-kpi` (24px, heute 19px),
  `--w-black`, darunter der Untertitel in `--fs-base`.
- Fragetexte bleiben im Edit-Mode editierbar (`contenteditable`) und
  persistieren wie bisher unter `fb_q_text_0` / `fb_q_text_1`.

Kein `overflow:hidden` mehr auf dem Panel; der Platz reicht, weil sonst
nichts auf der Bühne steht.

Aktionsleiste: links „Phase 2 von 2 · Zwei Fragen zum Schluss", rechts
„← Zurück" (Ghost) + Primäraktion **„Weiter: Abschluss →"** (`10-abschluss.html`).

## Technische Umsetzung

### Datenschicht

- Neuer Session-Key `fb_phase?: number` in `src/lib/schema.ts` (`SessionData`).
  Session-Scope, also **nicht** in `CONFIG_KEYS` — beim „Neue Beratung"-Reset
  (`BBZ.clearSession()`) verschwindet er automatisch.
- Kein `migrate()`-Eingriff nötig: fehlender Key ⇒ Phase 1.
- Keine Änderung an `fb_ratings`, `fb_q_text_0/1`, `fb_s1_img` oder an der
  Bild-Registry.

### `src/modules/09-feedback.ts`

Umbau auf das Render-Muster von `08-vereinbarungen.ts`:

- Modul-State: `phase`, `erwartungen`, `ratings`, `qText: [string, string]`,
  `editMode`. Die Fragetexte kommen aus dem State, nicht mehr aus statischem
  HTML — `loadData()` darf keine DOM-Knoten mehr voraussetzen.
- `render()` ruft `renderRail()`, `renderStage()`, `renderBar()`.
  `renderStage()` schreibt je nach Phase das Markup nach `#work` und
  verdrahtet danach die Listener neu (Slider-`input`, Datei-Uploads,
  `blur` auf den Fragetexten, `data-goto` in der Phasenliste).
- `setPhase(p)` persistiert `fb_phase` und rendert neu.
- Edit-Mode-Toggle setzt `contenteditable` auf den in dieser Phase
  vorhandenen Fragetexten und speichert beim Verlassen — wie heute.
- Adjektiv-Skala `ADJ`, `paintRow()`, `renderAvg()`, Fallback-Erwartung und
  die Live-Speicherung bleiben inhaltlich unverändert.

### `modules/09-feedback.html`

Schrumpft auf das Gerüst: Topbar, Säule mit `#railSub`, `#railPhases`,
Gesamteindruck-Block und Fussnote; Bühne mit leerem `#work` und `#barIn`.
Alles Phasen-Markup entsteht in TypeScript.

### `src/styles/modules/09-feedback.css`

- Neu `.fb-phaselist` (flex column, gap 5px) und die `.rail-phase.done`-
  Ergänzungen analog `08-vereinbarungen.css` — bewusst modul-lokal, damit
  `theme.css` unangetastet bleibt.
- Neu `.fb-titlepanel` (Panel, Hintergrundbild `cover`, füllt `1fr`).
- `.fb-qpanel` / `.fb-q` / `.fb-qimg` / `.fb-qtext` auf die Phase-2-Grössen;
  `overflow:hidden` entfällt.
- `@media (max-height: 820px)` wird für beide Phasen nachgeführt
  (kleineres Frage-Bild, engere Zeilen).

## Verifikation

- **Regel 1 (Bildschirmstabilität):** `document.scrollHeight <= innerHeight`
  in beiden Phasen bei 1920×1080 **und** 1366×768, mit 2 und mit 6
  Erwartungen.
- `tests/e2e/09-feedback.spec.ts`:
  - Phase-1-Assertions (Slider, Adjektive, `fb_ratings`, Ø/Daumen) bleiben.
  - Der Block zu `#q-text-0` (Edit-Mode + Persistenz über Reload) wechselt
    zuerst per Primäraktion in Phase 2.
  - Neu: Phasenwechsel vor und zurück (Rücksprung über die Phasenliste),
    `fb_phase` überlebt einen Reload.
  - Fallback-Test ohne Erwartungen bleibt unverändert.
- `tests/e2e/images.spec.ts`: `#s1img` bleibt in Phase 1 prüfbar; `#qimg-0`
  wird erst nach dem Wechsel in Phase 2 geprüft (betrifft Default- und
  Override-Test).
- `tests/e2e/integration.spec.ts`, `nav-home.spec.ts`, Modal-Paritäts-Gate:
  nicht betroffen.
- `npm run typecheck`, `npm run test`, `npm run test:e2e` grün.

## Verworfene Alternativen

- **Sequenzielle Freischaltung auf einem Screen** (Erwartungsabgleich
  kollabiert zur Quittungszeile, Fragen klappen darunter auf): kein
  Screenwechsel, aber bei sechs Erwartungen wird die Höhe eng — Regel 1
  wäre gefährdet.
- **Nur Umbau der Bühne** (Fragen-Panel unter statt neben den
  Erwartungsabgleich): kleinster Eingriff, beide Bereiche bleiben jedoch
  gleichzeitig sichtbar und lösen das Fokusproblem nicht.
- **Eine Frage pro Screen** (drei Phasen): maximaler Fokus, aber die Klammer
  „zwei Fragen zum Schluss" zerfällt und das Gespräch bekommt einen
  zusätzlichen Screenwechsel.
