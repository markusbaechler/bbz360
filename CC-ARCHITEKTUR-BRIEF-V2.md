# Claude-Code-Auftrag — Neues Repo `bbz360`: Stabile Architektur + Migration

**Ausgangslage:** Bestehendes Repo `bbz-Dialog`, Branch `refactor/produktiv`
(rem-Typografie + unified Nav bereits migriert). Dieser Branch ist die
**Portierungsquelle** — nicht `main`.

**Ziel:** Neues Repo mit professioneller Struktur. **Funktionsumfang identisch.**
Layout und Informationsarchitektur DUERFEN neu gedacht werden — aber ausschliesslich
entlang **LAYOUT-KONZEPT-V2.md** (Archetypen A–F, Seiten-Anatomie, Co-Creation-Regeln).
Kein Framework-Rewrite — Stabilität kommt aus Build, Typen, Tests, CI, Schema.

---

## 0. Architektur-Entscheide (ratifiziert — nicht neu diskutieren)

| # | Entscheid | Begründung |
|---|---|---|
| ADR-1 | **Vite + TypeScript, Multi-Page-App** (1 Modul = 1 HTML-Entry) | Mentales Modell bleibt, DOM-Logik portierbar, minimales Regressionsrisiko |
| ADR-2 | **Kein UI-Framework** (kein React/Vue) | Charts/DnD/contenteditable laufen; Rewrite = Risiko ohne Funktionsgewinn |
| ADR-3 | `bbz-theme.css` als einziges globales Stylesheet (Tokens), modulspezifisches CSS als je eigene Datei pro Modul | Single Source of Truth, kein Inline-Drift mehr |
| ADR-4 | Datenschicht `src/lib/data.ts`: typisiertes Schema + **Schema-Version + Migrationsfunktion** | Untypisierter localStorage ist die grösste Fehlerquelle |
| ADR-5 | **Export/Import** der Session als JSON-Datei (Button im Index) | Löst das «bbzAdmin ist gerätespezifisch»- und Datenverlust-Problem ohne Backend |
| ADR-6 | Tests: **Vitest** (Unit, Finanzmathematik + Datenschicht) + **Playwright** (Smoke je Modul) | Tragbarkeitsrechnung etc. ist bankfachlich — darf nie still brechen |
| ADR-7 | **GitHub Actions**: push → typecheck → test → build → Deploy auf Pages | Autonomes Deploy ohne visuelle Kontrolle setzt grüne Checks voraus |
| ADR-8 | localStorage bleibt Persistenz (kein Backend) | Scope-Disziplin: kein Server, keine Kundendaten verlassen das Gerät |
| ADR-9 | **Layout-Redesign erlaubt, aber archetyp-gebunden** (LAYOUT-KONZEPT-V2.md) | «Neu denken» ohne Leitplanke erzeugt 13 Einzeldesigns — das Konzept erzwingt Konsistenz |

---

## 1. Repo-Struktur (Zielbild)

```
bbz360/
├── index.html                     # Vite-Entry: Hub
├── modules/
│   ├── 01-agenda.html … 10-abschluss.html, admin.html   # je Vite-Entry
├── src/
│   ├── styles/
│   │   ├── theme.css              # = bbz-theme.css (Tokens, Shell, Nav, Primitive)
│   │   └── modules/05-cockpit.css # nur modulspezifisches CSS
│   ├── lib/
│   │   ├── data.ts                # BBZ-Datenschicht, typisiert (ersetzt bbz-data.js)
│   │   ├── schema.ts              # SessionData-Interface + SCHEMA_VERSION + migrate()
│   │   ├── format.ts              # fmt/fmtDate/age (de-CH, Apostroph)
│   │   ├── finance.ts             # Tragbarkeit, Amortisation, Rendite — PUR, testbar
│   │   └── nav.ts                 # unified Nav (Port von bbz-nav.js, Theme-Klassen)
│   └── modules/
│       └── 05-cockpit.ts …        # je Modul: DOM-Logik als ES-Modul
├── public/img/…                   # Bilder unverändert übernehmen
├── tests/
│   ├── unit/finance.test.ts       # Vitest
│   ├── unit/data.test.ts
│   └── e2e/smoke.spec.ts          # Playwright: jedes Modul lädt, Nav klickbar,
│                                  #   keine Console-Errors, Prefill-Kette 05→07a/07b
├── .github/workflows/deploy.yml   # typecheck → test → build → Pages
├── vite.config.ts                 # MPA-Entries, base: '/bbz360/'
└── docs/
    ├── DESIGN-SYSTEM.md           # v3.0 (rem-Regeln, Co-Creation, Farb-Semantik)
    └── ADR.md                     # Entscheide aus Abschnitt 0
```

---

## 2. Datenschicht (Kern der Stabilisierung)

`schema.ts` — vollständiges Interface aus den Schema-Keys des alten
`bbz-data.js` ableiten (Feldliste siehe altes Design-System, Abschnitt
«Stammdaten» + «Modul-spezifische Felder»). Regeln:

- **Beträge ausschliesslich `number`** — auf Typebene erzwungen.
- `SCHEMA_VERSION` als Konstante; `migrate(raw: unknown): SessionData`
  hebt alte `bbzData`-Objekte an (v2 liest v1-Daten des alten Repos!).
- Scopes `session` / `config` wie bisher; `clearSession()` erhält config.
- `bbzAdmin` bleibt separater Key; **nur** `admin.ts` darf ihn schreiben —
  per exportiertem, nur dort importiertem Writer erzwingen.
- Neu (ADR-5): `exportSession(): Blob` und `importSession(file)` mit
  Versions-/Schema-Validierung vor dem Merge.

`finance.ts` — sämtliche Berechnungen aus 05/07a/07b als **pure Functions**
extrahieren (Tragbarkeit inkl. kalk. Zins, Amortisation, Anlagebetrag,
Renditebänder). Kein DOM-Zugriff. Das ist die Testbasis.

---

## 3. Migrationsreihenfolge (autonom, ein Commit pro Schritt)

1. **Scaffold:** `npm create vite@latest` (vanilla-ts), MPA-Entries in
   `vite.config.ts`, Theme rein, CI-Workflow rein. → Deploy «Hello»-Hub grün.
2. **Lib-Port:** `data.ts`/`schema.ts`/`format.ts`/`nav.ts` + Unit-Tests.
   Erst weiter, wenn `npm test` grün.
3. **Module portieren, je einzeln,** in dieser Reihenfolge (steigende
   Komplexität, Datenfluss-Abhängigkeiten zuletzt):
   `01 → 02 → 03 → 09 → 04 → index → admin → 06 → 08 → 05 → 07a → 07b → 10`.
   Pro Modul: **Layout nach Archetyp aus LAYOUT-KONZEPT-V2.md neu aufbauen**
   (nicht 1:1 Markup uebernehmen); `refactor/produktiv` dient als Referenz fuer
   Funktions-Checkliste, Texte und die bereits gemappten rem-Tokens. Inline-CSS
   in Modul-CSS-Datei, Logik in Modul-TS (typisiert, `BBZ`-Aufrufe →
   `data.ts`-Imports), Berechnungen nach `finance.ts`, Co-Creation-Regeln
   anwenden (`.edit-only` + `body.edit-mode`, contenteditable-Affordanz,
   Targets ≥ 44px). Vor dem Bau je Modul: **Funktions-Checkliste aus v1-Code
   extrahieren** (jede Aktion/jedes Feld) — sie ist das Regressions-Netz,
   weil das Markup nicht mehr vergleichbar ist. Playwright-Smoke ergänzen.
4. **Prefill-Kette end-to-end testen** (Playwright): index→05→07a und
   05→07b mit realen Werten; 01→09-Erwartungsübernahme.
5. **README + docs** schreiben, altes Repo: README-Hinweis «archiviert,
   Nachfolger: bbz360» (Archivierung selbst macht der Mensch).

## 4. Validierung pro Schritt (Gate vor jedem Commit)

```powershell
npm run typecheck; if ($LASTEXITCODE) { throw "types" }
npm run test;      if ($LASTEXITCODE) { throw "unit" }
npm run build;     if ($LASTEXITCODE) { throw "build" }
npx playwright test --grep $modul
# zusätzlich: kein font-size in vw/vh, kein Inline-<style>/<script> im Modul-HTML
```

## 5. Definition of Done

- [ ] Alle 13 Seiten laufen aus dem Vite-Build auf GitHub Pages (Actions grün).
- [ ] Null Inline-CSS/JS in Modul-HTML; ein Theme, ein Nav-Modul.
- [ ] `finance.ts` mit Unit-Tests ≥ 90 % Coverage; Zahlen identisch zur v1
      (Vergleichsfälle aus v1 manuell einmal durchrechnen und als Fixtures ablegen).
- [ ] v1-`bbzData` wird von `migrate()` verlustfrei gelesen (Test mit echtem Export).
- [ ] Session-Export/-Import funktioniert (Roundtrip-Test).
- [ ] Co-Creation-Kriterien aus Brief v1 (edit-mode, Affordanzen, Targets) erfüllt.
- [ ] Farb-/Wording-Semantik unangetastet (Rot=Kundeninhalt, Amber=mittelfristig, «»-Anführungszeichen, de-CH-Formate).

**Nicht bauen:** Backend, Login, Framework, neue Features über ADR-5 hinaus.
