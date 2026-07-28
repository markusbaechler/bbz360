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

---

## ADR-13 — Zentrale Bild-Registry (images.ts) + Repo-Speicherung

**Kontext.** Bilder waren über die Module verstreut (hardcodierte Pfade
`../img/…`) und Overrides lagen in uneinheitlichen Keys (`abschluss_bgImage`,
`fb_s1_img`, Philosophie `phases[].image`, `bbzAdmin.foto_b64`,
`modulbilder.feedback`); 02/Bank hatte gar keinen Override. Keine zentrale
Verwaltung, keine klare Repo-Ablage.

**Entscheid.** Eine **Registry** `src/lib/images.ts` als Single Source of Truth:
jede Bildstelle ist ein Slot mit Repo-Default (`public/img/…`). Overrides liegen
zentral in EINEM Store `bbzImages` (localStorage); `imageUrl(slot)` löst
Override → Legacy-Fallback → Repo-Default auf. Berater-Porträts bleiben dynamisch
pro Profil (`berater<id>{a,b,c}.jpg` + `foto_b64`-Override).

**Konsequenzen.**
- GitHub Pages ist statisch → In-App-Upload landet browser-lokal, nicht im Repo.
  Dauerhafte Änderung: Admin → App-Bilder → „⬇ Für Repo" → Datei unter dem
  Slot-Pfad ablegen + committen (neuer Default für alle).
- Admin bekommt die Ansicht **App-Bilder** (Ersetzen/Zurücksetzen/Repo-Download).
  In-Modul-Uploads (Philosophie, Feedback, Abschluss) schreiben in denselben
  zentralen Store.
- Alte Bild-Keys werden weiter GELESEN (verlustfreie Migration), nicht mehr
  geschrieben. `bbzImages` ist Teil von Export/Import (ADR-5).
- Tests: `images.spec.ts` (Defaults, Override-Fallback, Legacy-Migration,
  Admin-Panel, Export).

---

## ADR-14 — Speicherfehler sind sichtbar; Uploads werden vor dem Speichern verkleinert

**Kontext.** Ein hochgeladenes Beraterfoto erschien im Admin, kam aber in
Modul 03 nie an. Ursache: Uploads landeten ungeskaliert als Base64 in
`bbzAdmin`. localStorage fasst rund 5 MB pro Origin — geteilt von `bbzData`,
`bbzAdmin` und `bbzImages`. Ab dem dritten Porträt scheiterte `setItem` mit
`QuotaExceededError`. Der Fehler wurde verschluckt (nur `console.warn`), der
Admin arbeitete auf der In-Memory-Kopie weiter und meldete „Foto
gespeichert" — geschrieben wurde nichts. Dasselbe Muster steckte in
`BBZ.set/merge` (33 Schreibstellen in 12 Dateien) und in beiden Import-Pfaden.

**Entscheid.** Zwei Ebenen.

1. *Ursache:* `toStorableDataUrl()` in `images.ts` verkleinert jeden Upload
   vor dem Speichern auf max. 1400px Kantenlänge und kodiert ihn als JPEG neu.
   Genutzt von beiden Upload-Pfaden (Porträts und App-Bilder). Nicht
   dekodierbare Dateien (z. B. SVG) und Bilder, die durch die Umkodierung
   wachsen würden, gehen unverändert durch.
2. *Sicherheitsnetz:* Schreibende Funktionen geben `boolean` zurück
   (`setBeraterProfiles`, `save`, `setImageOverride`, `BBZ.set/merge/
   setIfEmpty`). Zusätzlich meldet die Datenschicht jeden Fehlschlag als
   `CustomEvent('bbz:speicherfehler')` und bleibt selbst UI-frei;
   `lib/speicher-hinweis.ts` macht daraus einen Banner über der Topbar
   (schliessbar, einmalig). Ein Seiteneffekt-Import je Einstiegspunkt — eine
   gemeinsame Bootstrap-Datei gibt es nicht, jedes Modul ist ein eigener
   Vite-Entry.

**Konsequenzen.**
- Ein gescheiterter Upload wird zurückgenommen: der Admin darf kein Bild
  zeigen, das kein Modul zu sehen bekommt.
- `importSession()` ist alles-oder-nichts: `bbzData`/`bbzAdmin`/`bbzImages`
  werden vorab gesichert und bei jedem Fehlschlag wiederhergestellt, danach
  `SpeicherVollError`. Die Oberfläche unterscheidet das von „Datei kaputt".
- Bestehende Browser: das dritte Foto ist dort nie angekommen und muss
  einmalig neu hochgeladen werden.
- Tests: `bild-persistenz.spec.ts`, `import-persistenz.spec.ts`,
  `speicher-hinweis.spec.ts`. Die Fixture erzeugt ein echtes, dekodierbares
  PNG — ein Zufalls-Buffer würde die Umkodierung stillschweigend umgehen.

---

## ADR-15 — Lesegrösse skaliert mit der Bildschirmhöhe (ersetzt „Root fix 16px")

**Kontext.** Die Schrift war für ein Gerät, auf das Berater und Kunde
gemeinsam schauen, zu klein (Fliesstext 15px). DESIGN-SPEC §3 schrieb bis
hierhin „Root fix 16px — der fluide clamp-Root ist ABGESCHAFFT", Regel 1
verbietet „Fit-to-screen durch Schrift-Schrumpfen (kein vw/vh-Font)".

**Entscheid.** `html { font-size: clamp(16px, 2.2vh, 20px) }`, und
`--fs-nav` wird ABSOLUT auf 14px gesetzt.

**Abgrenzung zu Regel 1.** Das alte Verbot zielt auf *Schrumpfen*, damit
Inhalt in eine feste Fläche passt — Text wurde dort zur Manövriermasse des
Layouts. Hier ist die Richtung umgekehrt: die Untergrenze ist der bisherige
Zustand (16px), grössere Schirme bekommen mehr. Kein Inhalt wird je kleiner
als vorher. Regel 1 bleibt im Übrigen unangetastet: die Seite scrollt nicht.

**Messgrundlage** (statt Schätzung, 1440px Breite):
- Vertikal trägt es bis 20px in allen 13 Einstiegspunkten; erst bei 21px
  schneidet `index.html` ab. Treffer bei 16px sind dekorative Elemente mit
  `overflow:visible`.
- Horizontal war die Topbar der Engpass: mit mitskalierender Navigation lief
  sie ab 17px über (27px → 88px → 151px) und kürzte „10 Abschluss" auf „10".
  Mit fixierten 14px verschwindet der Überlauf bei jeder getesteten Grösse.
  Navigation ist Chrome — der Kunde liest sie nicht.
- Geprüft auf 1440x900 (19.8px), 1280x1024 (20px), 1920x1080 (20px),
  1280x800 (17.6px).

**Konsequenzen.**
- DESIGN-SPEC §3 ist entsprechend angepasst; der Satz „Root fix 16px" gilt
  nicht mehr.
- Typo läuft weiterhin ausschliesslich über `--fs-*`-Tokens (ADR-3 unberührt).
  Abstände und Container sind weiterhin px — Schrift wächst, Kästen nicht.
  Das ist der Grund, warum die Obergrenze gemessen und nicht geschätzt wird.
- Wer die Grenze verschieben will, misst neu: `typografie.spec.ts` nagelt
  Lesegrösse und Navigations-Überlauf fest.
