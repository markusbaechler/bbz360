# bbz360 — Beratungsdialog v2

Digitales Beratungsgespräch der bbz bank st.gallen: 13 Module von der Agenda
bis zum Gesprächsbericht, neu aufgebaut nach **Design-Grammatik v3**
(`design/DESIGN-SPEC.md`) mit Vite + TypeScript.

**Live:** https://markusbaechler.github.io/bbz360/

## Module

| # | Modul | Vorlage (Spec §4) |
|---|---|---|
| index | Beratercockpit (Berater, Kunde, Modulwahl, Session-Export/-Import) | 05-Grammatik |
| 01 | Agenda — Traktanden & Erwartungen | Gastgeber (referenz-01) |
| 02–04 | Bank / Berater:in / Philosophie | Bühnen-Module |
| 05 | Finanz-Cockpit — KPIs, Erfassungsmodale, Simulation | referenz-05 |
| 06 | Ziele & Wünsche — Zeitachse, Lebensthemen, Wunschliste | Zielkarten + Sequenz |
| 07a | Eigenheimfinanzierung — Tragbarkeit, Varianten | 05-Simulations-Muster |
| 07b | Anlegen — Profilierung (6 Phasen) + Umsetzung (3 Phasen) | referenz-08 |
| 08 | Vereinbarungen — Wizard | referenz-08 |
| 09 | Feedback — Slider-Zeilen, grosse Daumen | 01-Panel-Muster |
| 10 | Abschluss — Zusammenfassung + Druckbericht | 01-Grammatik |
| admin | Beraterprofile (bbzAdmin) | nüchtern |

## Entwicklung

```bash
npm install
npm run dev          # Vite-Devserver
npm run typecheck    # tsc --noEmit
npm run test         # Vitest (Rechenkern-Fixtures T1–T3 / A1–A3 / E1–E3, FIXTURES.md)
npm run test:e2e     # Playwright (Smoke je Modul, Modal-Paritäts-Gate, Integration)
npm run build        # Produktion nach dist/
```

## Architektur

- **Datenschicht** `src/lib/data.ts` + `schema.ts`: typisiertes `bbzData`
  (localStorage), `migrate()` liest v1-Daten verlustfrei (ADR-4);
  Session-Export/-Import als JSON (ADR-5); `bbzAdmin` (Beraterprofile)
  hat genau einen Writer (admin).
- **Rechenkern** `src/lib/finance.ts`: Tragbarkeit (07a), Simulation und
  Empfehlung (07b) — verbatim aus v1 portiert, Unit-Tests gegen die
  eingefrorenen Referenzwerte in `FIXTURES.md`.
- **Design**: `src/styles/theme.css` ist Single Source of Truth;
  verbindliche Regeln in `design/DESIGN-SPEC.md` (Bühnen-Grammatik,
  6 Regeln, Inventar-Pflicht §5 inkl. Vereinfachungs-Verbot §5.4).
- **Gate MODAL-PARITÄT** (ADR-12): v1-Feldinventare als checked-in
  Fixtures (`tests/e2e/modal-parity.fixture.ts`); fehlt ein v1-Feld,
  ist der Build rot.
- **Entscheide**: `docs/ADR.md`.

## Bilder (zentrale Verwaltung)

Alle App-Bilder haben eine **einzige Registry** `src/lib/images.ts` und liegen
als versionierte Dateien unter `public/img/…` (Repo = Default, geräteübergreifend).

- **Slots:** Bank-Titelbild, Philosophie 1–4, Feedback (Titel + 2 Fragen),
  Abschluss-Hintergrund. Berater-Porträts sind dynamisch pro Profil
  (`berater<id>{a,b,c}.jpg`, überschreibbar im Admin → Beraterprofile).
- **Ändern im Betrieb:** Admin → **App-Bilder** → „Ersetzen". Der Upload wird
  browser-lokal gespeichert (Override im Store `bbzImages`); der Repo-Default
  bleibt Fallback. „↺ Default" entfernt den Override.
- **Dauerhaft für alle** (statischer Host kann nicht selbst committen):
  in der App-Bilder-Ansicht „⬇ Für Repo" klicken → die Datei unter dem
  angezeigten Pfad ablegen, z.B. `public/img/bank/bbzbank.jpg`, committen +
  pushen. Ab dem nächsten Deploy ist es der neue Default für alle Geräte.
- **Session-Portabilität:** die Overrides sind Teil von Export/Import (ADR-5).

## Deploy

Push auf `main` → GitHub Actions (`.github/workflows/deploy.yml`):
typecheck → Unit → Build → E2E → GitHub Pages (ADR-7).
