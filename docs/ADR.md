# Architektur-Entscheide (ADR) — bbz360

ADR-1 bis ADR-9 sind in `CC-ARCHITEKTUR-BRIEF-V2.md` §0 ratifiziert
(Vite+TS MPA, kein Framework, Theme als SSoT, typisierte Datenschicht +
Migration, Export/Import, Vitest+Playwright, GitHub-Actions-Deploy,
localStorage-Persistenz, archetyp-gebundenes Layout).

Ab v3 gilt zusätzlich `design/DESIGN-SPEC.md` (ersetzt LAYOUT-KONZEPT-V2).

---

## ADR-10 — Hero-Bild in Modul 08 entfällt (einziger bewusster Funktions-Schnitt)

**Kontext.** v1 `08_vereinbarungen.html` trug ein Hero-Bild (Upload,
persistiert unter `vereinbarungenHeroImage`, Scope `config`). Die abgenommenen
Referenzen (`design/referenz-08-erfassen.html`, `-planen.html`) zeigen in 08
**kein** Bild — die Grammatik v3 kennt in einem Prozess-Modul (Säule = Erzähler
mit Phasenliste + Arbeitsstand, Bühne = Fokus-Karte/Warteschlange) keinen Ort
für ambientes Bildmaterial.

**Entscheid.** Das Hero-Bild in 08 **entfällt bewusst**. Bilder sind das
Kernelement der Bühnen-Module (02/03/04/10) und leben nur dort.

**Konsequenzen.**
- **Schema unverändert:** der Key `vereinbarungenHeroImage` bleibt im Schema und
  vorhandene gespeicherte Bilddaten werden NICHT angefasst (verlustfrei, ADR-4).
- Es ist der **einzige** bewusste Funktions-Schnitt der Migration; alle übrigen
  v1-Funktionen von 08 (Erfassen, Priorisieren, Planen, Zusammenfassung) bleiben
  vollständig erhalten.
- Im Modul-Inventar von 08 als „entfällt bewusst (Deck-Ambiente ohne Ort in
  Grammatik v3)" geführt.

---

## ADR-11 — Freie Rendite-Eingabe in 05 (bewusste Funktionserweiterung)

**Kontext.** v1 kannte in der Vermögens-Simulation drei feste Rendite-Chips
(1.25% / 2.75% / 4.5%). Der Product Owner wünscht zusätzlich einen expliziten
**0%-Chip** (reine Sparakkumulation — der Badge weist dann „+ CHF 0
Rendite-Effekt" korrekt aus) und **„Eigene…"**: ein Inline-Zahlenfeld
(Suffix %, Bereich 0–10, Schritt 0.05), dessen bestätigter Wert als aktiver
Chip erscheint (z.B. „3.2%") und in `S.chart` persistiert.

**Entscheid.** Bewusste Funktionserweiterung auf PO-Wunsch — **Ausnahme von
„keine neuen Features"** der Migration (VERBESSERUNGEN 05, abgenommene
Richtung).

**Konsequenzen.**
- Persistenz unverändert über `cockpit_data.chart.yld` (Zahl, z.B. `0.032`) —
  kein Schema-Zusatz, v1-Daten bleiben lesbar.
- Nicht-Preset-Werte rendern als eigener aktiver Chip; erneuter Klick öffnet
  das Feld wieder. Ephemerer Editier-Zustand wird nicht persistiert.
- Smoke 05 deckt ab: 0%-Chip rechnet korrekt, eigener Wert verändert den
  Endwert und übersteht einen Reload.

---

## ADR-12 — Automatisches Gate MODAL-PARITÄT (Konsequenz aus REGELVERSTOSS 05)

**Kontext.** Bei der v3-Migration von 05 wurden Erfassungsmodale gegenüber v1
stillschweigend vereinfacht (fehlende Felder: Kanäle-Tags, PK-Mechanik,
3a-Einzahlung/konditionaler Betrag, Strategie, Einkommen-Typ/Frequenz,
prevCF-Live-Vorschau, quoteTyp `neutral`, komplettes Finanzieren-Modal). Das
verletzt „Funktionsumfang identisch" (DESIGN-SPEC §5.4).

**Entscheid.** Ein automatisches Gate prüft die Modal-Parität. Das v1-Feld-
inventar wird VERBATIM aus dem v1-Quellcode extrahiert und als checked-in
Fixture geführt (`tests/e2e/modal-parity.fixture.ts`, Muster wie
`FIXTURES.md`). Der Test (`05-cockpit-modalparity.spec.ts`) rendert jedes
v2-Modal und asserted, dass jedes v1-Element (`data-v1-field`), jeder
Options-Wert und jede Pflicht-Live-/Konditional-Komponente existiert.

**Konsequenzen.**
- Läuft in **jedem Modul-Gate mit Erfassungsmodalen** mit. Fehlendes v1-Feld =
  roter Test = kein Commit.
- Feld-ids sind nicht Teil der Parität (interne Bezeichner); geprüft werden
  Existenz, Optionswerte und Verhalten. Abweichung nur, wenn v1 sich ändert —
  nicht, um eine v2-Lücke zu kaschieren.
- Bewusstes Weglassen bleibt möglich, aber ausschließlich via ADR nach
  PO-Freigabe (wie ADR-10); ein solcher Eintrag nimmt das Feld explizit aus
  der Fixture.
