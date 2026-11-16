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

---

## ADR-16 — Gemeinsamer Haushalts-Stand und Pensionierungs-Rechenkern (Fusion PensCheck)

**Kontext.** bbz360 soll zur Gesamtberatungs-App werden (`docs/ZIELBILD-FUSION.md`).
Der PensCheck (`bbzsg/PensCheck`, Stand `4830eff`) rechnet monatsgenau mit AHV,
Pensionskasse, Säule 3a, Freizügigkeit, Liegenschaften, Steuern und Wünschen und
bringt geprüfte Grundlagen mit Quellen mit. bbz360 hält dieselben Kundenangaben
bisher verteilt (`cockpit_*`, `finanzierung_data`, Stammdaten).

**Entscheid.**
- Der Rechenkern des PensCheck liegt als TypeScript-Port unter `src/lib/pension/`
  (`engine`, `analyse`, `aktion`, `params`, `state`, `themen`, `budget`,
  `auswertung`, `format`, `config`). Die Portierung ändert **keine** Rechenlogik:
  nur Typen kamen dazu. `finance.ts` (07a/07b) bleibt daneben unverändert.
- Die Grundlagen liegen unter `public/data/params.json` und `verification.json`,
  die Prüf- und Nachführskripte unter `scripts/`.
- `SessionData` erhält den Schlüssel `haushalt` (Typ `PensState`);
  `SCHEMA_VERSION` steigt auf 3. `migrate()` lässt Sessions ohne `haushalt`
  unverändert und schickt einen vorhandenen Stand durch `sanitize()`.
- `src/lib/haushalt.ts` ist der einzige Zugang: `haushaltLesen()` liefert den
  gespeicherten Stand oder leitet einen ersten Stand aus Stammdaten und Cockpit
  ab; `haushaltImport()` liest einen PensCheck-Link, -Code oder JSON-Stand.

**Abnahme.** Die PensCheck-Tests zum Rechenkern laufen unverändert als
Referenz unter `tests/unit/pension/` (Kopfzeile `@ts-nocheck`, da wörtlich
übernommen). Tests, die die PensCheck-Oberfläche oder dessen Datenschutztext
prüfen, wandern mit dem jeweiligen UI-Teil in späteren Phasen nach.

**Konsequenzen.**
- Der öffentliche PensCheck bleibt unabhängig; Grundlagen werden künftig in
  beiden Repos nachgeführt (bewusst in Kauf genommen, siehe Zielbild §7).
- `haushalt` ist Session-Scope und fällt bei `clearSession` weg.
- Die bisherigen `cockpit_*`-Schlüssel bleiben vorerst Quelle für 05/07a/07b;
  ihre Ablösung durch `haushalt` ist Phase 4.

**Nachtrag Phase 2 — Modul 07c.**
- Die Oberfläche des PensCheck liegt typisiert unter `src/pension-ui/`, die
  Seite ist `modules/07c-pension.html`, der Einstieg `src/modules/07c-pension.ts`
  (entspricht `main.js` des PensCheck). Für das Beratungsgespräch entfallen
  Service Worker, Installation, Link-Teilen, Kontakt-Fusszeile und der
  Datenschutztext der öffentlichen App; der Stand liegt als `haushalt` in bbzData.
- **Gestaltung:** 07c bringt das bbz Brand System mit (`src/styles/pension/`)
  und lädt `theme.css` bewusst **nicht** — gleichnamige Tokens (`--bg`,
  `--ink-2` …) und Klassen (`.panel`) würden sich überschreiben. Die Topbar ist
  in `07c-pension.css` nachgebaut. Die Seite scrollt (Regel 1 der DESIGN-SPEC
  gilt hier nicht); die Angleichung der übrigen Module ist Phase 9.
- **Build-Falle:** 07c darf `lib/speicher-hinweis` nicht statisch importieren,
  sonst lagert der Build `theme.css` aus und bindet es nach den Modul-Stilen
  ein (`tests/e2e/css-reihenfolge.spec.ts` hält das fest). Ein voller Speicher
  wird in 07c als Meldung gezeigt.
- **Navigation:** 12 Reiter; Abstände in der Topbar sind enger (ADR-15 bleibt:
  14px fix, kein Überlauf — `typografie.spec.ts`, `enge-schirme.spec.ts`).
- **Beratercockpit und Abschluss:** Pensionierung ist dritte Vertiefung
  (`b07c`); Modul 10 zeigt Urteil, tragbare Ausgaben und nächste Schritte
  (`src/lib/pension/kurz.ts`) und bietet «Bericht Pensionierung» an.
- **Tests:** Die Oberflächentests des PensCheck laufen unter
  `tests/unit/pension/` (happy-dom). Angepasst bzw. weggelassen sind nur
  Prüfungen, die die öffentliche App betreffen (Datenschutztext, Link-Teilen,
  README, Prüf-Workflow); jede Stelle ist mit «bbz360:» kommentiert.

---

## ADR-17 — Haushalt führt: Cockpit 05 und Budget 05b auf dem gemeinsamen Stand

**Kontext.** Nach ADR-16 übernahm die Pensionierung Lohn, Vermögen und Vorsorge
nur einmalig aus dem Cockpit; danach konnten zwei Stände auseinanderlaufen.
Entscheid des Auftraggebers (Interview, Phase 4): **Haushalt führt**, das
Cockpit erfasst **Bruttolohn**, das Budget wird ein **eigenes Modul 05b**.

**Entscheid.**
- Die geteilten Grössen stehen nur im Haushalts-Stand: Liquidität,
  Wertschriften, Säule 3a, PK-Guthaben, Bruttolohn und Geschlecht je Person,
  Ausgaben heute. Das Cockpit liest sie beim Öffnen (`ausHaushalt`) und
  schreibt sie beim Übernehmen eines Modals (`inHaushalt`,
  `lib/haushalt.ts: gemeinsamAusHaushalt / gemeinsamInHaushalt`).
- Details ohne Gegenstück bleiben in `cockpit_data` (Bank, Anzahl Konten,
  Kanäle, Kommentare, Aufteilung Zahlungsverkehr/Sparen). Ändert die
  Pensionierung die Liquidität, trägt das Sparen die Differenz; ändert das
  Cockpit die Summe von 3a oder PK, geht die Differenz an Person 1.
- **Abweichung vom v1-Feldinventar (ADR-12):** Im Modal «Ausgaben & Einkommen»
  ersetzt je Person ein Feld Bruttolohn pro Jahr plus Geschlecht den
  Umschalter netto/brutto. `f-eMann`/`f-eFrau` bleiben als Nettoeinkommen für
  den Cashflow. Ältere Stände mit Typ «brutto» werden beim Öffnen in die
  Bruttofelder verschoben. `cockpit_einkommen` (Prefill 07a) ist neu die Summe
  der Bruttolöhne.
- **Stammdaten:** Geänderte Namen und Geburtsdaten werden im Haushalts-Stand
  nachgeführt (`stammdatenNachfuehren`, Merker `haushalt_stamm`); eine
  Anpassung in der Pensionierung bleibt stehen, solange die Stammdaten
  unverändert sind.
- **05b Budget & Liquidität** (`modules/05b-budget.html`, `lib/budget.ts`):
  Budget im Ruhestand mit den acht Positionen und Musterbudgets des PensCheck,
  Ausgaben heute, Sparbetrag, Reserve. Im bbz Brand System wie 07c.
- **Navigation:** 13 Reiter. Unter-Module (05b, 07a–07c) zeigen inaktiv nur
  ihre Nummer; die Bezeichnung steht im Tooltip und im `aria-label`.

**Annahmen (sichtbar im Modul 05b unter «So ist gerechnet»).**
- Nettoeinkommen ohne Cockpit-Angabe: Bruttolohn abzüglich Sozialabgaben und
  pauschaler Einkommenssteuer (wie im Rechenkern).
- Reserve: Faustregel drei bis sechs Monatsausgaben — Richtwert, keine Quelle.

**Nicht abgeglichen.** Die Finanzierung im Cockpit (Betrag, Kreditform) und die
Liegenschaften der Pensionierung (Verkehrswert, Hypothek) sind noch getrennt;
das gehört zum Lebensplan (Phase 5) bzw. zu 07a.

---

## ADR-18 — Lebensplan: ein abgeleiteter Stand über 06, 07a, 07b und 07c

**Kontext.** Zielbild Phase 5: Ziele, Eigenheim, Anlegen und Pensionierung
sollen in einer Zeitachse und einer Rechnung zusammenkommen.

**Entscheid.**
- `lib/lebensplan.ts` leitet aus Session und Haushalts-Stand **einen** Stand
  ab, den der Pensionierungs-Rechenkern unverändert rechnet. Der Stand wird
  nicht gespeichert; Quelle bleiben die Module.
- Modul **07 Lebensplan** (`modules/07-lebensplan.html`) zeigt das Bild des
  PensCheck mit Marken für alles, was mitrechnet, das Urteil mit und ohne
  Ziele sowie die Liste aller Einträge mit Quelle und Status.
- Der Rechenkern bleibt unangetastet. Was er nicht abbilden kann, wird als
  «vorgemerkt» mit Begründung ausgewiesen, nie stillschweigend weggelassen.

**Was mitrechnet.**
- 06: Ziele und Wünsche mit Jahr und Betrag als einmalige Ausgabe.
- 07a: die eigenen Barmittel im Kaufjahr (Jahr des ersten Ziels «Wohnen»,
  wie beim Kaufpreis-Prefill); dieses Ziel wird nicht zusätzlich gezählt.
- 07b: der Anlagebetrag wechselt von der Liquidität in die Wertschriften;
  ohne eigene Rendite in der Pensionierung gilt die erwartete Rendite der
  finalen Strategie (`finance.ts: STRATS`) für alle Wertschriften.

**Bekannte Grenzen (im Modul unter «So ist gerechnet» genannt).**
- Eigenheimkauf und Zuflüsse rechnet seit ADR-19 der erweiterte Kern.
- 07b und der PensCheck führen eigene Renditeannahmen (z. B. «Ausgewogen»
  2.75% gegenüber Profil «ausgewogen» 3%). Der Lebensplan nimmt die Annahme
  aus 07b, weil sie dem Kunden dort gezeigt wurde.
- Der Abschluss (10) zeigt seit ADR-19 das Urteil des Lebensplans und daneben
  das der Pensionierung allein.

---

## ADR-19 — Additive Erweiterung des Rechenkerns: Zuflüsse und Liegenschaftskauf in der Zukunft

**Kontext.** Der PensCheck-Kern kannte weder einen Zufluss ins Vermögen noch
einen Kauf in der Zukunft; im Lebensplan waren beide nur vorgemerkt bzw. auf
den Abfluss der Barmittel verkürzt. Entscheid des Auftraggebers (Review nach
Phase 5): **Kern additiv erweitern.**

**Entscheid.** Erste fachliche Änderung am Kern gegenüber PensCheck
(`src/lib/pension/engine.ts`, jede Stelle mit «bbz360 (ADR-19)» markiert):
- **Zuflüsse** (`PensState.zufluesse`: Name, Betrag, Kalenderjahr): gehen im
  Januar des Jahres ins freie Vermögen, in heutiger Kaufkraft. Keine
  Erbschafts- oder Schenkungssteuer.
- **Kauf in der Zukunft** (optionale Felder an der Liegenschaft):
  `kaufAlter` (Alter Person 1), `kaufFremd` (PK-Vorbezug), `kaufMieteWeg`.
  Bis zum Kauf gibt es die Liegenschaft nicht (kein Wert, keine Hypothek,
  keine Kosten). Beim Kauf fliessen die Eigenmittel (Preis − Hypothek, beide
  auf den Kaufmonat fortgeschrieben) aus dem freien Vermögen ab; ein
  PK-Vorbezug fliesst als besteuerter Kapitalbezug zu. Bei einem Eigenheim
  kommen danach Zins, Unterhalt und Nebenkosten zu den Ausgaben, die
  bisherige Miete fällt weg.
- Die Kürzung der Pensionskasse nach einem Vorbezug macht der Lebensplan am
  Stand (im Verhältnis zum Altersguthaben, sonst über den Umwandlungssatz
  `annahmen.uws65`), nicht der Kern.

**Gleichheit mit PensCheck.** Die neuen Felder entstehen in `sanitize()` nur,
wenn sie gesetzt sind. Ohne sie ist die Rechnung unverändert: Die
Referenztests laufen weiter, und der Vergleich Port ↔ Original (sieben Fälle,
je mit und ohne früheren Ausstieg) ist nach der Änderung erneut identisch.
Mit den neuen Feldern rechnet bbz360 mehr als PensCheck.

**Tests.** `tests/unit/kern-erweiterung.test.ts`, `tests/unit/lebensplan.test.ts`.

**Grenzen.**
- Ohne Jahreszeile («heute») zählt `eigenkapitalReal` eine Liegenschaft mit
  `kaufAlter` nicht mit.
- Auswertungen, die Liegenschaften statisch lesen (Fixkosten «Wohnen»,
  Amortisationsvorschlag), kennen den Kaufzeitpunkt nicht. Sie werden für
  den Lebensplan-Stand nicht angezeigt; ein künftiger Kauf wird deshalb nur
  im Lebensplan abgeleitet und nicht im Haushalts-Stand gespeichert.
- Der PK-Vorbezug wird Person 1 zugerechnet; Verzinsung des vorbezogenen
  Betrags bis zur Pensionierung ist nicht berücksichtigt.
- Ein vom Kunden im öffentlichen PensCheck geöffneter Link kennt diese
  Felder nicht (dort fallen sie weg).

---

## ADR-20 — Fachmodule 07d Steuern, 07e Absicherung, 07f Nachlass

**Kontext.** Zielbild Phasen 6–8, Vorgabe «rechnend, wo belegbar»: gerechnet
wird nur mit öffentlich prüfbaren Grundlagen; alles Übrige ist
Gesprächsführung mit Themen zum Vormerken. Freigabe des Auftraggebers: bauen,
fachliche Abnahme durch die Bank danach. **Diese Abnahme steht aus.**

**07d Steuern** (`lib/steuern.ts`).
- Gerechnet: Steuer auf Kapitalbezügen je Jahr wie geplant, verglichen mit
  «alles im selben Jahr» und «jeder Bezug einzeln» (ESTV-Tabelle der
  Kantonshauptorte aus den geprüften Grundlagen); Vermögenssteuer heute.
- Abzüge (Säule 3a, PK-Einkauf): Betrag × **erfasster** Grenzsteuersatz. Der
  Grenzsteuersatz wird nicht geschätzt (kantonale Einkommenssteuertarife sind
  Nicht-Ziel). Sperrfrist Art. 79b Abs. 3 BVG wird gegen den Plan geprüft.

**07e Absicherung** (`lib/absicherung.ts`).
- Gerechnet je Person für Invalidität und Tod: AHV/IV-Renten als gesetzliche
  Anteile der geschätzten Altersrente (Art. 36/37 AHVG, Art. 37/38 IVG), bei
  Unfall die UVG-Renten samt Komplementärgrenze (Art. 20/31 UVG,
  Höchstverdienst CHF 148’200), Pensionskasse **laut Vorsorgeausweis**
  (Eingabe), begrenzt auf 90% des Lohns (Art. 34a BVG, Art. 24 BVV 2).
- Nicht geschätzt: BVG-Minimalleistungen. Nicht gerechnet: Plafonierung von
  Kinderrenten, Taggelder, Wartefristen, Teilinvalidität, Steuern.
- **Nicht automatisch geprüft:** Die Anteile und der UVG-Höchstverdienst
  stehen als Konstanten im Code (`ANTEILE`, `UVG_MAX_VERDIENST`), nicht in
  `params.json`. Der Höchstverdienst wurde im November 2026 für 2026
  nachgeschlagen; für 2027 ist er zu prüfen. Die Reform der
  Hinterlassenenrenten ist im Parlament hängig; gerechnet ist das geltende
  Recht mit vereinfachter Anspruchsprüfung.

**07f Nachlass** (`lib/nachlass.ts`).
- Gerechnet: gesetzliche Erbteile (Art. 457–462 ZGB), Pflichtteile (Art. 471
  ZGB, Fassung seit 1.1.2023) und frei verfügbare Quote.
- Der Nachlass ist eine Eingabe; ohne Eingabe gilt als ausgewiesene Annahme
  die Hälfte (Paare) bzw. das Ganze (Alleinstehende) des Reinvermögens.
  Güterrecht, Verträge, Vorempfänge und Erbschaftssteuern sind nicht gerechnet.
- Erwartete Erbschaften werden als **Zuflüsse** im Haushalts-Stand gespeichert
  und rechnen in Pensionierung und Lebensplan mit (ADR-19).

**Gemeinsam.**
- Eingaben liegen in bbzData unter `steuern`, `absicherung`, `nachlass` und
  `familie_kinder` (Session-Scope). Themen zum Vormerken: `lib/fach-themen.ts`.
- Der Abschluss (10) nennt vorgemerkte Themen und die grösste Lücke der
  Absicherung; der Druckbericht hat je aktive Vertiefung einen Abschnitt.
- Beratercockpit: 07d–07f sind Vertiefungen (`b07d`–`b07f`).
- **Navigation:** 17 Reiter. Unter-Module zeigen inaktiv nur die Nummer;
  reicht der Platz auch dann nicht, verzichtet das aktive Unter-Modul auf
  seine Bezeichnung (`nav.ts`, Klasse `eng`). Auf den Brand-Seiten wird die
  gleichnamige Komponente `.bbz-nav` des Brand System zurückgesetzt.
- Jedes Modul nennt unter «So ist gerechnet» Grundlagen und Vereinfachungen
  und hält fest, dass es keine Steuer- bzw. Rechtsberatung ist.
