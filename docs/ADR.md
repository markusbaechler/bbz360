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
