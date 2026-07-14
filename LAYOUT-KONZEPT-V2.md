# LAYOUT-KONZEPT v2 — bbz-Dialog

**Status:** Verbindliche Leitplanke fuer den v2-Umbau. Ergaenzt CC-ARCHITEKTUR-BRIEF-V2.
**Freiheitsgrad:** Layout und Informationsarchitektur duerfen neu gedacht werden.
**Null Freiheitsgrad:** Funktionsumfang, Datenfluss (localStorage-Schema, Prefill-Kette
05→07a/07b, 01→09), Farb-Semantik (Rot=Kundeninhalt, Amber=mittelfristig), Wording.

---

## 1. Leitidee: Ein Werkzeug, ein Rhythmus

Die App ist die **gemeinsame Arbeitsflaeche im Beratungsgespraech** — Berater und
Kunde schauen auf denselben Screen, editieren teils gemeinsam. Daraus folgen die
drei Gesetze, an denen JEDES Modul-Layout gemessen wird:

1. **Eine Kernaussage pro Screen.** Was der Kunde in 3 Sekunden erfassen soll,
   steht groesst und zuerst. Alles andere ist visuell nachgeordnet.
2. **Gleiche Dinge sehen ueberall gleich aus.** Ein Wert, ein Regler, eine Karte,
   ein Modal hat app-weit EIN Erscheinungsbild (Theme-Primitive verwenden).
3. **Der rote Faden ist sichtbar.** Das Gespraech ist eine Dramaturgie
   (Ankommen → Kennenlernen → Analysieren → Rechnen → Vereinbaren → Abschluss).
   Die Navigation zeigt Position und Fortschritt, nicht nur Links.

## 2. Einheitliche Seiten-Anatomie (alle Module)

```
┌──────────────────────────────────────────────────────────┐
│ TOPBAR   Logo · Modul-Stepper (Nav) · Edit-Toggle · Home │  3.5rem, fix
├──────────────────────────────────────────────────────────┤
│ SEITENKOPF   H1 + optional 1 Zeile Kontext (t-subtitle)  │  kompakt
├──────────────────────────────────────────────────────────┤
│                                                          │
│ ARBEITSFLAECHE   (Archetyp-spezifisch, siehe 4)          │  1fr
│                                                          │
└──────────────────────────────────────────────────────────┘
```

- Topbar-Nav als **Stepper**: nummerierte Chips 01–10, aktueller Schritt
  hervorgehoben, besuchte Schritte dezent markiert. Freies Springen bleibt
  moeglich (Berater-Realitaet), aber die lineare Ordnung ist sichtbar.
- Seitenkopf ist ueberall identisch aufgebaut — nie Hero-Typografie mitten
  im Arbeitsmodul, nie fehlender Titel im Story-Modul.
- Modals: zentriert, max-width 640px, ein Zweck pro Modal, Primaeraktion
  rechts unten. Keine verschachtelten Modals.

## 3. Raster & Dichte

- 12-Spalten-Grid, `gap: var(--sp-5)`, Inhalt in `.bbz-shell` (max 1600px).
- **Einspaltige Archetypen (B, G):** Inhaltsspalte `max-width: 64rem`, zentriert
  in der Shell. Volle Shell-Breite nur fuer mehrspaltige Archetypen (A, C, D).
- **Zwei Dichtestufen**, mehr nicht:
  - `Gespraech` (Story-Module): grosszuegig, fs-lg-Fliesstext, viel Weissraum.
    H1 = `--fs-3xl` (Hero-Typografie bleibt den Story-Modulen vorbehalten).
  - `Arbeit` (Cockpit/Rechner/Wizard): kompakter, fs-base/fs-sm, Klickziele ≥44px.
    H1 = `--fs-2xl` (nicht 3xl).
- Zeilenlaenge Fliesstext: max ~70 Zeichen (Lesbarkeit auf Distanz).

## 4. Modul-Archetypen (das Herz des Konzepts)

Jedes Modul wird EINEM Archetyp zugeordnet. Neues Layout = Archetyp-Muster
anwenden, nicht frei erfinden.

### A — BUEHNE (Story/Rapport): 02 Bank, 03 Berater, 04 Philosophie, 10 Abschluss
Zweck: Vertrauen, Emotion, Abschlussmoment. Kunde schaut, Berater erzaehlt.
```
[ Bild/Visual 55–60% ] [ Kernbotschaft 40–45%: H1 + max 3 Punkte/Zitat ]
```
- Ein Blickfang, eine Botschaft. Keine Datentabellen, keine Formulare.
- Bilder mit `object-fit: cover; object-position` pro Bild kuratiert.
- 10 Abschluss: zusaetzlich die Zusammenfassungs-/Naechste-Schritte-Liste
  als rechte Spalte (aus Datenschicht befuellt) — Funktionsumfang bleibt.

### B — LISTE MIT LEBEN (Co-Creation-Liste): 01 Agenda, 08 Vereinbarungen
Zweck: gemeinsam Punkte festhalten/abhaken.
```
[ Titelbereich ]
[ Einspaltige Liste, Karten je Punkt, Checkbox/Status links, Text editierbar ]
[ + Punkt hinzufuegen ]  (edit-mode)
```
- Maximal eine Spalte — Listen sind zum Vorlesen und Abnicken da.
- Erledigt-Zustand sichtbar (Haken + abgeschwaechte Karte), nie geloescht.

### C — COCKPIT (Datenuebersicht): 05 Finanz-Cockpit, index (Berater-Hub)
Zweck: Gesamtbild auf einen Blick, Einstieg in Details.
```
[ KPI-Zeile: 3–5 grosse Kennzahlen (.t-value) ]
[ Hauptvisual (Chart) 60% ][ Detail-/Eingabe-Panel 40% ]
```
- KPIs zuerst — das ist die «Eine Kernaussage».
- Eingaben (22 Inputs!) nicht als Formularwueste: in thematische Panels
  gruppieren (Einkommen / Vermoegen / Verpflichtungen), je Panel als Karte,
  Detailpflege in Modals wie bisher.
- index: Kundenliste als Karten-Grid mit klarer Primaeraktion «Gespraech starten».

### D — RECHNER (Simulation): 07a Finanzieren
Zweck: live gemeinsam rechnen — das Co-Creation-Kernstueck.
(07b Anlegen wandert zu Archetyp G — mehrstufige Strecke.)
```
[ EINGABEN links 40%          ][ ERGEBNIS rechts 60%, sticky        ]
[ Slider/Inputs, gruppiert    ][ Ampel/Gauge gross + Kernzahl       ]
[                             ][ darunter: Detailaufschluesselung   ]
```
- Ergebnis reagiert live auf jeden Slider — Latenz < 100ms wahrnehmbar.
- Die Kernzahl (Tragbarkeit in %, Endkapital) ist das groesste Element
  der Seite. Ampelfarben nur hier, semantisch korrekt.
- Prefill aus 05 sichtbar machen: dezenter Hinweis «uebernommen aus
  Finanz-Cockpit» mit Sprunglink — Vertrauen durch Nachvollziehbarkeit.

### E — DIALOG-BOARD (qualitativ): 06 Ziele & Wuensche, 09 Feedback
Zweck: Praeferenzen/Einschaetzungen des Kunden erfassen.
- 06: Karten-Board, Ziele als grosse waehlbare Karten (Bild + Titel),
  gewaehlte wandern in eine «Unsere Ziele»-Zone mit Horizont-Chip
  (kurz/mittel[Amber]/lang[Slate]). Drag ODER Klick — beides moeglich (Touch!).
- 09: Slider-Batterie als vertikale Liste, je Zeile: Aussage links,
  grosser Slider rechts, Momentanwert als Zahl sichtbar. Keine Miniatur-Slider.

### F — VERWALTUNG: admin
Zweck: Berater-Werkzeug ohne Kunde. Nuechtern, tabellarisch, `table.bbz`.
Kein Story-Styling. Export/Import (ADR-5) lebt hier + im index.

### G — GEFÜHRTER PROZESS (Wizard): 08 Vereinbarungen, 07b Anlegen
Zweck: mehrstufige Entscheidungsstrecke, gemeinsam durchlaufen.
- Einspaltig unter der Sticky-Topbar. Roter Faden = horizontaler
  **Prozess-Stepper**: Kreis je Phase, verbunden durch eine Linie; Linie
  bis zur aktiven Phase gefüllt (Fortschritt).
- Zustände eindeutig: **erledigt** = ✓ im gefüllten Kreis; **aktiv** =
  gefüllter Kreis + Label fett/blau; **kommend** = Kreis mit Ziffer,
  gedämpft (`--ink-4`).
- Kurzes Label (1–2 Worte) UNTER jedem Kreis; Kontextzeile
  „Phase 2 von 4 — Priorisieren" über/neben dem Stepper.
- Abgrenzung zum globalen Modul-Stepper kommt aus Verbindungslinie +
  Zustandssemantik + Grösse/Position — NICHT aus dem Verzicht auf Ziffern.
- Eine Phase sichtbar zugleich. Navigation NICHT nur über den Stepper:
  jede Phase endet mit klarer Primäraktion „Weiter zu <nächste Phase> →"
  (btn); zurück via Stepper-Klick auf erledigte Phasen.
- 1366×768: Labels dürfen auf `--fs-xs` fallen, Kreise bleiben ≥ 2rem (Touch).
- Innerhalb der Phasen gelten die übrigen Archetyp-Primitive
  (B-Karten-Listen, Chip-Gruppen, Abschluss = Zusammenfassung).
- Abnahme zusätzlich: Phasen-Roundtrip im Smoke (vor + zurück, Zustand
  bleibt; „Weiter"-Button navigiert).
07b wird bei seiner Portierung nach DEMSELBEN Muster gebaut.

## 5. Co-Creation-Regeln (aus Brief v1, hier verbindlich)

- Editierbares traegt IMMER die sichtbare Affordanz (dashed-Underline aus Theme).
- Werkzeuge (loeschen, Bild tauschen, umsortieren) nur bei `body.edit-mode`
  (Stift-Toggle in Topbar) — der Kunde sieht sonst eine ruhige Flaeche.
- Alle interaktiven Ziele ≥ 44px. Hover ist nie die einzige Interaktion.
- Slider mit grossem Daumen (≥ 28px) — sie werden vor dem Kunden bedient.

## 6. Abnahme je Modul (zusaetzlich zum v2-DoD)

- [ ] Archetyp benannt und Muster erkennbar umgesetzt.
- [ ] 3-Sekunden-Test: Kernaussage des Screens ohne Scrollen erfassbar (1920×1080).
- [ ] Kein Funktionsverlust: jede Aktion der v1 ist erreichbar (Checkliste je
      Modul aus v1-Code ableiten und abhaken).
- [ ] Dichtestufe korrekt (Story=Gespraech, Arbeit=Arbeit), keine Mischform.
