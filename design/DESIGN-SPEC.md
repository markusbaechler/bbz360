# DESIGN-SPEC v3 — bbz360
**Status: VERBINDLICH. Ersetzt LAYOUT-KONZEPT-V2.md vollstaendig** (dieses als
DEPRECATED markieren, nicht loeschen). Grundlage: vier vom Product Owner im
Live-Browser abgenommene Referenz-Screens in `design/`.
**Rangordnung bei Widerspruch: Referenz-HTML > diese Spec > Theme > alles andere.**

## 0. Referenzdateien (eingefroren, nicht veraendern)
| Datei | massgeblich fuer |
|---|---|
| design/referenz-01-agenda.html | Gastgeber-/Panel-Muster |
| design/referenz-05-cockpit.html | Zahlen-Module, KPI-Saeule, Chart-Regeln |
| design/referenz-08-planen.html | Wizard-Arbeitsphase: Fokus-Karte + Warteschlange |
| design/referenz-08-erfassen.html | Sequenzielle Freischaltung (app-weit) |
Vor jedem Modul-Bau: passende Referenz im Browser oeffnen und daneben legen.

## 1. Buehnen-Grammatik (jeder Screen, keine Ausnahme)
```
[ TOPBAR 56px  Logo · Modul-Nav · Bearbeiten ]
[ SAEULE 360px | BUEHNE (Arbeitsflaeche)      ]
[   #004078    | AKTIONSLEISTE 68px           ]
```
- **Saeule** (immer #004078): Erzaehler des Screens. Traegt je Modultyp:
  Begruessung+Gespraechsziel (01) / KPI-Zahlen (05) / Phasenliste vertikal +
  Arbeitsstand (Wizards) / Kernbotschaft (Buehnen-Module). Fussnote unten.
- **Buehne**: genau EIN Arbeitsfokus. Inhalt horizontal zentriert,
  max-width 1500–1560px (fokussierte Dialoge: 1100px), vertikal zentriert
  wenn Inhalt kleiner als Flaeche.
- **Aktionsleiste**: links Positionsangabe ("05 von 10 · …" bzw. "Phase 2
  von 4 · …"), rechts genau EINE Primaeraktion ("Weiter: <Ziel> →"),
  optional Zurueck-Link daneben. Immer am selben Ort. Gedimmte Primaeraktion
  nennt ihre Freischalt-Bedingung im Button ("→ ab 1 Vereinbarung").

## 2. Die sechs Regeln
1. **Bildschirmstabil.** body=100vh, overflow hidden. Die Seite scrollt NIE;
   scrollen duerfen nur definierte Listen-Regionen. Abnahme automatisch:
   document.scrollHeight <= innerHeight bei 1920x1080 UND 1366x768.
   Fit-to-screen durch Schrift-Schrumpfen bleibt verboten (kein vw/vh-Font).
2. **Sequenzielle Freischaltung.** Genau EIN aktiver Bereich (heller Grund,
   blaue Nummer). Erledigtes kollabiert zur Quittungszeile (✓ + "aendern").
   Kommendes sichtbar, gedimmt, gesperrt — und benennt selbst, wann es dran
   ist. Nur die Chips des aktiven Schritts sind sichtbar (nie >1 Chip-Gruppe
   aktiv). Referenz: 08-erfassen.
3. **Wert schlaegt Label.** Feld-Labels sind Kicker (11px Versalien, grau).
   Gewaehlte/erfasste WERTE tragen das Gewicht (Quittung: 19px/900 dunkel).
   Gilt app-weit fuer jede Anzeige erfasster Inhalte.
4. **Ruhige Praesentationsflaeche.** Im Normalzustand: keine dashed-Underlines,
   keine Loesch-/Upload-/Sortier-Werkzeuge. Alles Editier-Werkzeug erscheint
   erst mit body.edit-mode (Stift-Toggle Topbar). Ausnahmen nur, wo Erfassen
   die Kernfunktion des Screens ist (z.B. "+ Erwartung ergaenzen" in 01).
5. **Sauberkeit.** (a) Kein Text in skalierten SVGs — Chart-Beschriftungen
   als HTML positioniert, Endwerte INNERHALB der Flaeche; Linien mit
   vector-effect:non-scaling-stroke. (b) Jeder Chart hat Gitterlinien,
   Werteskala, Zeit-/X-Achse und Legende im Panel-Kopf. (c) Nebeneinander-
   liegende Panels schliessen buendig ab (align-items:stretch + verteilter
   Inhalt). (d) Titel max ~34ch, Eingabefelder duerfen Text nie abschneiden.
6. **Semantik-Farben unantastbar.** Rot #950e13 NUR Kundeninhalt (Zitate,
   Erwartungen — linke rote Kante + kursiv). Amber nur Zeithorizont
   "mittelfristig". Prioritaet/Zustand wird durch ORT und GEWICHT codiert,
   nicht durch Farb-Badges (vgl. 08-planen: Warteschlange statt Konfetti).

## 3. Typografie & Masse (Deckel, px bei Standard-Zoom)
Topbar-Nav 14 · Fliesstext/Zeilen 15–16 · Panel-Kicker 11 Versalien ·
Karten-Titel 20–22/700 · Saeulen-Titel 26–30/900 · KPI-Zahl 24/900 ·
Quittungs-Wert 19/900 · Buttons 14.5/700, Hoehe ≥40px · Klickziele ≥44px.
NICHTS ueber 30px ausser Begruessungs-Momenten in Gastgeber-/Buehnen-Modulen
(max 34px). Schriften ausschliesslich rem-Tokens aus theme.css (Root fix 16px
— der fluide clamp-Root ist ABGESCHAFFT).

## 4. Modul-Zuordnung (alle 13)
| Modul | Vorlage | Saeule traegt |
|---|---|---|
| 01 Agenda | referenz-01 | Begruessung, Meta, Gespraechsziel |
| 02/03/04 Bank/Berater/Philosophie | 01-Grammatik, Buehne = Bild/Story-Panel + max 3 Punkte | Kernbotschaft |
| 05 Cockpit | referenz-05 | KPI-Set (v1: Gesamtvermoegen inkl. BV, Liquiditaet, Anlagefaehig, Sparquote, Kapitalwert) |
| 06 Ziele | 08-erfassen-Sequenz + Zielkarten auf der Buehne | Phasen/Stand |
| 07a Finanzieren | 05-Simulations-Muster: Regler rechts, Ergebnis-Chart + Ampel-Kernzahl gross | KPI: Tragbarkeit, Belehnung, Eigenmittel |
| 07b Anlegen | referenz-08 (beide Phasenmuster) | Phasenliste + Stand |
| 08 Vereinbarungen | referenz-08 (beide) | Phasenliste + "heute festgehalten" |
| 09 Feedback | Slider-Zeilen in 01-Panel-Muster, grosse Daumen | Kontext |
| 10 Abschluss | 01-Grammatik: Saeule=Dank/Botschaft, Buehne=Zusammenfassung aus Datenschicht | Kernbotschaft |
| index | 05-Grammatik: Saeule=Berater, Buehne=Kunden-Karten, Primaeraktion "Gespraech starten" | Beraterprofil |
| admin | nuechtern, table.bbz, ohne Saeulen-Pathos | — |

## 5. Inventar-Pflicht (Cockpit-Lektion — zwingend VOR jedem Modul-Bau)
1. v1-Code des Moduls lesen (bbz-Dialog @ main) und ALLE Funktionen, Felder,
   KPIs, Berechnungen, Prefills als Tabelle extrahieren (aus dem Code, nie
   aus dem Gedaechtnis; V2-RESTSCHULD.md einbeziehen).
2. Jeder Zeile einen Ort im neuen Layout zuweisen (sichtbar / edit-mode /
   Modal / Saeule / entfaellt-mit-Begruendung).
3. Diese Tabelle ist Teil des Checkpoints. Ohne vollstaendiges Inventar
   kein Bau. Abnahme je Modul zusaetzlich: Regel-1-Check automatisch,
   Screenshot beide Aufloesungen, Build-Identitaets-Probe VOR Screenshot.

## 6. Checkpoint-Regel (unveraendert)
Nach dem ersten Modul je Vorlagen-Typ stoppen: Screenshots 1920x1080 +
1366x768, Inventar-Tabelle abgehakt, max 3 Saetze Abweichungen. Commit erst
nach "weiter".
