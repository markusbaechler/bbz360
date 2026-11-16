# Assessment der Fusion PensCheck → bbz360

Stand: 2026-11-16 · Geprüfter Commit: `446225f` (Branch `claude/loving-albattani-efae2x`) · Status: **Befunde des ersten und zweiten Prüflaufs behoben (siehe am Ende); dritter Prüflauf siehe dort**

## Urteil

Der Stand ist **nicht einsatzbereit**. Die Gates (Typecheck, 627 Unit-Tests, Build, 98 E2E-Tests) sind
grün, decken die unten genannten Fälle aber nicht ab. Es gibt Fehler mit Datenverlust und Fehler, die
im Kundengespräch falsche Zahlen zeigen. Der übernommene PensCheck-Teil selbst ist sauber; die Fehler
liegen in dem, was für bbz360 neu geschrieben wurde.

| Klasse | Bedeutung | Anzahl |
|---|---|---|
| **A** | Datenverlust oder falsche Zahl/Aussage im Kundengespräch im normalen Ablauf | 15 |
| **B** | Randfall mit falscher Zahl oder irreführender Anzeige | 16 |
| **C** | Kosmetik, Text, Zugänglichkeit | 9 |

## Wie geprüft wurde

1. **Drei unabhängige Reviews** der neu geschriebenen Logik (Datenfluss Haushalt; Kern-Erweiterung mit
   Lebensplan und Abschluss; Fachmodule mit Rechtsgrundlagen). Die Reviewer kannten die Einschätzung
   des Autors nicht und mussten Befunde reproduzieren.
2. **Mechanischer Vergleich** jeder portierten PensCheck-Datei mit dem Original nach Entfernen der Typen.
3. **Schadcode-Test**: Markup in allen frei eingebbaren Texten, über alle Seiten, Ansichten und den Druckbericht.
4. **Zugänglichkeit** (axe, WCAG 2.1 AA) auf allen 19 Seiten, mit Vergleich gegen `main`.
5. **Handy-Breite** (390 px) auf den neuen Seiten.

Status je Befund: **R** = reproduziert (Test oder Browser), **N** = im Code nachvollzogen,
**Q** = mit Quelle belegt, **U** = fachlich unsicher, bei der Bank zu klären.

## Was in Ordnung ist

- **Port des PensCheck:** 27 von 32 Dateien sind nach Entfernen der Typen identisch mit dem Original.
  Die übrigen weichen nur ab durch umbenannte unbenutzte Parameter, zwei entfernte tote Variablen,
  `String(v)` an einer Zuweisung und die bewusste Kern-Erweiterung (ADR-19).
- **Rechnung ohne neue Felder:** identisch mit dem Original, von zwei Seiten unabhängig bestätigt
  (sieben bzw. fünf Zustände, je mit Plan, früherem Ausstieg und Stresstest).
- **Schadcode:** keine Ausführung, kein eingeschleustes Element.
- **Handy-Breite:** kein Querüberlauf auf den neuen Seiten.
- **Zugänglichkeit bestehende Seiten:** 234 Kontrastbefunde weniger als auf `main`, keiner schwächer.
- **Datenschicht:** `migrate()` und `sanitize()` sind idempotent; `clearSession`, Export und Import
  behandeln `haushalt` und `haushalt_stamm` richtig; ein Modulbesuch ohne Eingabe verändert in 05b und
  07c nichts.
- **Fachlich bestätigt:** Anteile AHV/IV (80%, 40%, 40%), UVG-Invalidenrente und Komplementärrente,
  UVG-Höchstverdienst 148’200 für 2026, BVG-Überentschädigung, Reihenfolge der Kürzungen; Kapitalsteuer
  «wie geplant» stimmt mit dem Kern überein; alle sechs Konstellationen der gesetzlichen Erbfolge und
  der Pflichtteile (ZGB, Fassung seit 2023).

**Einschränkung:** `bsv.admin.ch` und `fedlex.admin.ch` waren aus der Prüfumgebung nicht abrufbar.
Rechtsbelege stammen aus Suchtreffern, Sekundärquellen und dem bekannten Gesetzeswortlaut. Die
fachliche Abnahme durch die Bank ersetzt das nicht.

---

## Klasse A — Datenverlust oder falsche Zahl im normalen Ablauf

### Datenfluss Haushalt (ADR-16, ADR-17)

**A1 · «Musterfall laden» und «Neu beginnen» in 07c überschreiben bzw. löschen Kundendaten im Cockpit** · R
`src/modules/07c-pension.ts` (replaceState → persist), `src/modules/05-cockpit.ts` (ausHaushalt, calc).
Weil der Haushalt führt, übernimmt das Cockpit beim nächsten Öffnen die Musterwerte (Einkommen 205’000,
3a 98’000, Anlagen 300’000) als Kundendaten, auch für 07a und 10; nach «Neu beginnen» stehen Einkommen,
PK, Konten und 3a auf 0. Die Rückfrage nennt nur «Angaben zur Pensionierung»; «Musterfall
wiederherstellen» und der Übungsmodus fragen gar nicht. Auch 05b, 07, 07d–07f lesen den Musterfall als
Kundenstand.

**A2 · Nach «Neu beginnen», Musterfall oder Import werden die Stammdaten nicht mehr nachgeführt** · R
`src/lib/haushalt.ts` (haushaltSchreiben setzt den Merker `haushalt_stamm`, obwohl der Stand die
Stammdaten nicht enthält). Eine Einzelperson, geboren 1980, wird danach als Ehepaar mit Jahrgang 1970
gerechnet; der Bericht hat keinen Kundennamen.

**A3 · Einzelperson: der im Cockpit erfasste Bruttolohn von Person 2 verschwindet beim nächsten Öffnen** · R
`src/lib/haushalt.ts` (gemeinsamAusHaushalt), `src/modules/05-cockpit.ts`. Ohne Namen für Person 2 gilt
der Haushalt als Einzelperson; das Feld wird trotzdem angeboten. `cockpit_einkommen` fällt z. B. von
160’000 auf 100’000. Bei älteren Sessions mit Einkommens-Typ «brutto» geht so das Einkommen von
Person 2 im Cockpit verloren.

**A4 · «Ausgaben heute»: Cockpit und Budget überschreiben sich; Löschen ist nicht möglich** · R
`src/modules/05-cockpit.ts` (ausHaushalt, inHaushalt). Ein im Budget gesetzter Wert wird vom nächsten
beliebigen Cockpit-Modal überschrieben. Werden im Cockpit alle Ausgaben gelöscht, bleibt der alte Wert
und erscheint nach dem Neuladen in der falschen Kategorie.

**A5 · `cockpit_einkommen` mischt Brutto und Netto** · R
`src/modules/05-cockpit.ts` (calc). Paar mit Netto 7’000 + 5’000: 144’000. Wird nur für eine Person ein
Bruttolohn erfasst (100’000), fällt das Einkommen der anderen ganz aus dem Prefill für die Tragbarkeit
in 07a.

**A6 · Ältere Sessions: Bruttolohn gilt im Budget als Netto, «Ausgaben heute» fehlen** · R
`src/lib/haushalt.ts` (haushaltAusSession), `src/modules/05b-budget.ts` (nettoCockpit). 05b zeigt
«Nettoeinkommen CHF 13’000 aus dem Finanz-Cockpit», obwohl es Brutto ist.

### Kern-Erweiterung und Lebensplan (ADR-18, ADR-19)

**A7 · Die Anlage aus 07b kommt im echten Betrieb nie im Lebensplan an** · R
`src/lib/lebensplan.ts`. Gelesen wird `anlage_betrag`; diesen Schlüssel schreibt kein Modul (07b hält
den Betrag nur im Arbeitsspeicher). Die Tests setzen den Wert von Hand und haben den Fehler verdeckt.
ADR-18 beschreibt damit eine Funktion, die nicht wirkt.

**A8 · Ziel oder Wunsch im laufenden Jahr gilt als «rechnet mit», wird aber nie abgezogen** · R
`src/lib/lebensplan.ts`, `src/lib/pension/engine.ts`. Liegt der Monat nach dem Geburtstag vor dem
laufenden Monat, trifft der Kern den Zeitpunkt nie. Ziel «Auto» 2026 über 200’000: Endvermögen
unverändert; die Kennzahl «Ziele in der Rechnung» zählt den Betrag trotzdem. Modul 06 bietet das
laufende Jahr an.

**A9 · Doppelzählung beim Eigenheim: Lebensplan und 07a wählen das Wohnen-Ziel nach verschiedenen Regeln** · R
`src/lib/lebensplan.ts`, `src/modules/07a-finanzieren.ts`. Der Lebensplan nimmt das erste Ziel der
Kategorie Wohnen, 07a das erste mit Betrag. Beispiel: Renovation 2028 ohne Betrag und Erstwohnung 2032
über 900’000 ergeben einen Kauf «Renovation» 2028 und zusätzlich eine Ausgabe von 900’000 im Jahr 2032.
Verwandt (N): Die Vorschläge «Liegenschaft verkaufen», «Kapitalleistung BVG» und «Auszahlung Säule 3a»
in 06 werden als Ausgabe bzw. Zufluss gerechnet, zusätzlich zu dem, was der Kern schon auszahlt.

**A10 · PK-Vorbezug wird nicht immer gekürzt: Geld aus dem Nichts** · R
`src/lib/lebensplan.ts`, `src/lib/pension/engine.ts`. Ohne erfasstes Altersguthaben wird nur die Rente
gekürzt, das PK-Kapital bleibt; bei Kapitalbezügern ist der Vorbezug bis auf die Steuer geschenkt.
Übersteigt der Vorbezug das Guthaben, fliesst der Überschuss trotzdem zu. Liegt der Kauf nach der
Pensionierung, zahlt der Kern den Vorbezug dennoch aus (N).

**A11 · Der PK-Vorbezug ist nominal, der Rest des Kaufs wird mit der Teuerung fortgeschrieben** · R
`src/lib/pension/engine.ts`. Bei Kauf in 14 Jahren und 1% Teuerung fehlen real rund 25’000, die still
das freie Vermögen trägt. In ADR-19 nicht als Grenze genannt.

### Fachmodule (ADR-20)

**A12 · Unfalltod: UVG-Ehegattenrente ohne Anspruchsprüfung** · R, Q
`src/lib/absicherung.ts`. Jeder verheiratete Hinterbliebene erhält 40% des versicherten Verdienstes.
Nach Art. 29 Abs. 3 UVG braucht es rentenberechtigte Kinder oder Invalidität; die Witwe zusätzlich ab
45 oder mit erwachsenen Kindern, sonst nur eine Abfindung, der Witwer nichts. Für ein junges kinderloses
Paar wird die Lücke deutlich zu klein ausgewiesen (59’280 statt 0).

**A13 · AHV-Anspruch Witwe/Witwer hängt am falschen Kinderbegriff** · N, Q
`src/lib/absicherung.ts`, `modules/07e-absicherung.html`. Das Feld fragt «Kinder in Ausbildung oder
unter 18»; für den Anspruch zählt, ob überhaupt Kinder da sind. Eine Witwe unter 45 mit erwachsenen
Kindern und ein Witwer mit erwachsenen Kindern erhalten fälschlich 0. Die Übergangsregelung nach dem
EGMR-Urteil zu Witwerrenten ist nicht berücksichtigt.

**A14 · Ein gemeinsamer Schlüssel `familie_kinder` für zwei verschiedene Grössen** · N
`src/modules/07e-absicherung.ts`, `src/modules/07f-nachlass.ts`, `src/modules/10-abschluss.ts`. 07e meint
rentenberechtigte Kinder, 07f alle Nachkommen. Zwei erwachsene Kinder im Nachlass ergeben in der
Absicherung zwei Kinder- und Waisenrenten; «0» in der Absicherung macht im Nachlass die Eltern zu Erben.

**A15 · Sperrfrist nach PK-Einkauf um bis zu ein Jahr zu kurz** · R, Q (Detail U)
`src/lib/steuern.ts`, `src/modules/07d-steuern.ts`. Gerechnet und angezeigt wird «bis Ende Einkaufsjahr
+ 2». Die Frist läuft drei Jahre ab dem Einkauf: Einkauf Dezember 2027 und Kapitalbezug Juli 2030 liegen
in der Frist, gemeldet wird «nicht verletzt». Der Unit-Test schreibt das falsche Verhalten fest.

---

## Klasse B — Randfälle

**B1 · Stammdaten Paar → Einzel → Paar verliert Angaben** · R — `haushalt.ts`. Aus «Konkubinat» wird
«verheiratet», Themenkarten von Person 2 fallen weg.

**B2 · In 07c geänderte Werte stehen in 07a und im Abschluss erst nach einem Cockpit-Besuch** · N —
`cockpit_einkommen`, `cockpit_pk_saldo`, `cockpit_data` werden nur vom Cockpit geschrieben.

**B3 · Zweite Person ohne Geburtsdatum rechnet still mit Jahrgang 1970** · N — `haushalt.ts`.

**B4 · Geburtsmonat Dezember: Ziel und Kauf landen im Folgejahr** · R — `lebensplan.ts`. Liste und Bild
zeigen das erfasste Jahr, gerechnet wird im Januar danach. Zuflüsse fallen dagegen immer im Januar an.

**B5 · Einträge nach dem Planungshorizont gelten als «rechnet mit», wirken aber nicht** · R —
`lebensplan.ts`, `engine.ts`.

**B6 · Kauf nach der Pensionierung: keine Tragbarkeitsprüfung** · R — `engine.ts`. `tragbarkeit()`
liefert nichts; die Ampel gibt die Liegenschaft ohne Bankprüfung als Reserve frei.

**B7 · Wegfallende Miete wird nach 75 voll abgezogen, die Ausgaben sinken aber um den Reduktionssatz;
keine Untergrenze** · R — `engine.ts`. Bei Miete 2’500 und 10% Reduktion sind die Ausgaben ab 75 um 250
pro Monat zu tief; negative Ausgaben sind möglich.

**B8 · Kaufalter in der Vergangenheit: Simulation rechnet «im Besitz», das Eigenkapital von heute zählt
0** · R — `engine.ts`. Über den Lebensplan nicht erreichbar, über einen importierten Stand schon.

**B9 · Verkaufsalter vor Kaufalter: gekauft und nie verkauft, ohne Warnung; Amortisation vor dem Kauf
wird still übersprungen** · R — `engine.ts`.

**B10 · «Vermögenssteuer heute» zählt künftige Liegenschaftskäufe mit** · R — `engine.ts`
(vermSteuerHeute), `07d-steuern.ts`. Wirkt, sobald ein Stand mit Kaufalter gespeichert ist.

**B11 · Abschluss: Druckbericht meldet «Keine Angaben zur Pensionierung», solange der Worker rechnet
oder nach einem Fehler; ohne gespeicherten Haushalt fehlt der Abschnitt, obwohl 07 denselben Fall
rechnet; der Umwandlungssatz wird nicht aus den Grundlagen übergeben** · N — `10-abschluss.ts`.

**B12 · Sperrfrist-Meldung schlägt auch bei Bezügen vor dem Einkauf und personenübergreifend an** · R —
`steuern.ts`. Bezug 2030, Einkauf 2045: «verletzt».

**B13 · Absicherung rechnet auch für Pensionierte und für den leeren Stand** · R — `absicherung.ts`.
Rentnerpaar ohne Lohn: «IV-Rente 15’120», «Witwenrente 12’096», «Der Bedarf ist gedeckt». Nach dem
Referenzalter gibt es keine IV-Rente; die eigene Rente der hinterbliebenen Person fehlt.

**B14 · Absicherung: Annahmen nicht offengelegt** · N — Bedarf ist in allen Fällen derselbe (auch im
Todesfall); die Herleitung steht nur am Feld; UVG wird für jede Person mit Lohn angenommen (nicht für
Selbständige und Kleinpensen).

**B15 · Zuflüsse-Editor in 07f verliert Eingaben ohne Rückmeldung** · N — unvollständige Zeilen sind
nach dem Neuladen weg; ein ungültiges Jahr entfernt einen gespeicherten Zufluss sofort aus der Rechnung;
jeder Tastendruck legt einen noch nicht gespeicherten Haushalts-Stand an.

**B16 · 07d übernimmt gespeicherte Werte ungeprüft; ein Grenzsteuersatz für beide Personen; 3a-Einzahlung
auch für bereits Pensionierte** · N — `07d-steuern.ts`, `steuern.ts`.

Weitere, hier zusammengefasst (N): Die Eintrittswahrscheinlichkeit der Ziele aus 06 wird nicht beachtet.
Beträge mit Rappen verschieben beim Öffnen des Vorsorgen-Modals die 3a-Aufteilung. Im Kaufmonat zählt
die Vermögenssteuer altes Vermögen und Liegenschaft; Zufluss und Kauf fehlen in den Jahressummen der
Tabelle. Nach dem Verkauf eines gekauften Eigenheims kommt die Miete nicht zurück.

---

## Klasse C — Kosmetik, Text, Zugänglichkeit

**C1 · Kontrast der inaktiven Navigationsreiter 4.4:1 statt 4.5:1** auf allen Seiten (bestand schon).
**C2 · Kontrast der inaktiven Vertiefungs-Kacheln im Beratercockpit** (2.0 bis 3.8:1); mit fünf statt
einer inaktiven Kachel jetzt sichtbarer.
**C3 · Hinweis zu Art. 473 ZGB unvollständig** (Nutzniessungsvariante verkürzt; erscheint auch bei nicht
gemeinsamen Kindern). · Q
**C4 · «Säule 3a nicht im Nachlass» ohne Hinweis auf die Hinzurechnung zur Pflichtteilsmasse** (Art. 476,
529 ZGB). · Q
**C5 · «Eltern oder Geschwister am Leben?»**: der elterliche Stamm umfasst auch Nichten und Neffen.
**C6 · Kundenname bleibt nach dem Leeren der Stammdaten im Bericht stehen.** · R
**C7 · 07d: bei nur einem Bezugsjahr steht «CHF 0 mehr als geplant»; im Konkubinat heisst die Nullzeile
«AHV-Witwenrente»; Ganzzahlfelder nehmen «1e1» an.**
**C8 · Eigenmietwert**: Der Text ist richtig, liesse sich aber konkret fassen (Inkrafttreten der
Abschaffung laut Bundesrat 1.1.2029).
**C9 · Zwei Tests schreiben falsches Verhalten fest** (Sperrfrist; ungekürztes PK-Kapital nach Vorbezug)
und sind mit den Fehlern zu korrigieren.

---

## Fachlich offen (bei der Bank zu klären)

- UVG-Höchstverdienst für 2027: sehr wahrscheinlich unverändert, amtlich nicht ausdrücklich bestätigt.
- Stand der Reform der Hinterlassenenrenten nach der Herbstsession 2026.
- Zählweise der Sperrfrist nach PK-Einkauf (tag- oder jahresgenau) in der Praxis des Wohnkantons.
- Ob der volle Haushaltsbedarf auch im Todesfall gelten soll.

## Ursachen

1. **«Haushalt führt» ohne Schutz vor dem Ersetzen.** Die PensCheck-Funktionen «Musterfall» und «Neu
   beginnen» ersetzen einen Stand, der in bbz360 nicht mehr nur der Pensionierung gehört (A1, A2).
2. **Abgleich mit Summen und Rückfallwerten.** Wo zwei Module dieselbe Grösse verschieden gliedern,
   entscheiden «wenn grösser 0, sonst alt»-Regeln, die Löschen und Einzelpersonen nicht tragen (A3–A6).
3. **Tests mit handgesetzten Daten.** Mehrere Tests schreiben Session-Schlüssel direkt, statt sie durch
   das schreibende Modul entstehen zu lassen; ein toter Schlüssel fiel so nicht auf (A7).
4. **Jahr gegen Monat.** Der Lebensplan denkt in Kalenderjahren, der Kern in Monaten nach dem
   Geburtstag (A8, B4, B5).
5. **Fachregeln nur zur Hälfte umgesetzt.** Anspruchsvoraussetzungen wurden für die AHV geprüft, für
   das UVG nicht; Fristen jahres- statt datumsgenau (A12–A15).

## Vorschlag zur Behebung

Reihenfolge: zuerst Klasse A in der Folge A1–A6 (Datenfluss), A7–A11 (Lebensplan und Kern), A12–A15
(Fachmodule), dann Klasse B, dann C. Zu jedem Befund ein Test, der den Fehler vor der Korrektur zeigt
und danach grün ist; Tests erzeugen ihre Daten über die Module, nicht von Hand. Danach derselbe
Prüflauf noch einmal (unabhängige Reviews, Port-Vergleich, Schadcode, Zugänglichkeit).

Vier Entscheide des Auftraggebers sind dafür nötig:

1. **A1:** Soll «Musterfall laden» in 07c den Kundenstand gar nicht mehr ersetzen (Übungsfall getrennt
   vom Kundenstand), oder nach deutlicher Rückfrage weiterhin?
2. **A13/A14:** Zwei getrennte Angaben «Kinder (Nachkommen)» und «davon in Ausbildung oder unter 18»?
3. **A15:** Sperrfrist vorsichtig rechnen (Bezug im dritten Jahr nach dem Einkauf gilt als «möglicherweise
   in der Frist») oder das Einkaufsdatum erfassen?
4. **A9:** Soll der Kauf in 07a ausdrücklich einem Ziel zugeordnet werden, statt ihn aus dem ersten
   Wohnen-Ziel abzuleiten?


---

## Behebung (2026-11-16, nach dem Assessment)

Entscheide des Auftraggebers: ein Kundenfall statt zwei (A1), zwei Kinderangaben (A13/A14), Sperrfrist
vorsichtig nach Usanz (A15), der Kauf ist ein Ziel (A9). Regeln und Einzelheiten: ADR-22.

| Befund | Stand | Wie | Test |
|---|---|---|---|
| A1 | behoben | Musterfall, «Neu beginnen» und Übungsmodus aus 07c entfernt | `07c-pension.spec.ts` (A1, zwei Tests) |
| A2 | behoben | Import wendet die Stammdaten an; keine anderen Wege, den Stand zu ersetzen | `07c-pension.spec.ts` (A2), `haushalt.test.ts` |
| A3 | behoben | zweite Person auch bei Einkommen im Cockpit; kein Nullsetzen | `haushalt-fluss.spec.ts` (A3), `haushalt.test.ts` |
| A4 | behoben | ein Betrag, Cockpit gliedert; Löschen wirkt | `haushalt-fluss.spec.ts` (A4) |
| A5 | behoben | je Person Brutto, sonst ihr Netto | `haushalt-fluss.spec.ts` (A5/B2), `haushalt.test.ts` |
| A6 | behoben | ältere Brutto-Stände tragen kein Netto; Ausgaben werden übernommen | `haushalt-fluss.spec.ts` (A6), `haushalt.test.ts` |
| A7 | behoben | 07b schreibt `anlage_betrag` | `07-lebensplan.spec.ts` (Betrag über die Oberfläche von 07b) |
| A8 | behoben | Ausgaben mit Kalenderjahr; laufendes Jahr sofort | `kern-erweiterung.test.ts`, `lebensplan.test.ts` |
| A9 | behoben | Zuordnung des Kaufs zu einem Ziel in 07a; keine Doppelzählung bekannter Vorschläge | `07a-finanzieren.spec.ts` (A9), `lebensplan.test.ts` |
| A10 | behoben | Vorbezug kürzt Rente und Kapital, höchstens bis zum Guthaben, nur vor der Pensionierung | `lebensplan.test.ts` |
| A11 | behoben | Vorbezug in heutiger Kaufkraft, auf die Eigenmittel begrenzt | `kern-erweiterung.test.ts` |
| A12 | behoben | UVG-Ehegattenrente nur mit Anspruch | `fachmodule.test.ts` |
| A13, A14 | behoben | zwei Kinderangaben; AHV-Anspruch mit Kindern gleich welchen Alters | `fachmodule.test.ts`, `07def-fachmodule.spec.ts` |
| A15 | behoben | Sperrfrist vom Einkaufsjahr bis und mit dem dritten Folgejahr | `fachmodule.test.ts`, `07def-fachmodule.spec.ts` |
| B1 | behoben | früherer Paar-Zivilstand wird gemerkt (Themenkarten von Person 2 gehen weiterhin verloren, wenn der Haushalt zur Einzelperson wird) | `haushalt.test.ts` |
| B2 | behoben | Vorbelegungen werden mit dem Stand geschrieben; der Abschluss liest die geteilten Grössen aus dem Haushalt | `haushalt-fluss.spec.ts` |
| B3 | Grenze | ADR-22 | – |
| B4, B5 | behoben | Kalenderjahre; Einträge nach dem Horizont vorgemerkt | `lebensplan.test.ts`, `kern-erweiterung.test.ts` |
| B6 | behoben | später Kauf zählt nicht ungeprüft als Reserve | `kern-erweiterung.test.ts` |
| B7 | behoben | Miete sinkt ab 75 mit; Ausgaben nicht negativ | `kern-erweiterung.test.ts` |
| B8, B10 | behoben | ein Kriterium «künftig» für Simulation, Eigenkapital, Vermögenssteuer | `kern-erweiterung.test.ts` |
| B9 | Grenze | ADR-22 | – |
| B11 | behoben | Drucken wartet auf die Rechnung; derselbe Stand wie Modul 07; Fehler wird genannt | – (im Code geprüft) |
| B12 | behoben | nur Bezüge ab dem Einkaufsjahr | `fachmodule.test.ts`, `07def-fachmodule.spec.ts` |
| B13, B14 | behoben | nur Erwerbstätige vor dem Referenzalter; Annahmen offengelegt | `fachmodule.test.ts` |
| B15 | behoben | Entwurf für unvollständige Zeilen; ungültige Eingaben ändern nichts | `07def-fachmodule.spec.ts` |
| B16 | behoben | gespeicherte Werte geprüft; keine 3a-Einzahlung nach der Pensionierung; Hinweis zum Grenzsteuersatz | `fachmodule.test.ts` |
| weitere | behoben bzw. Grenze | Wahrscheinlichkeit im Hinweis; Rappen; Jahresrechnung geht auf; Miete nach Verkauf und Kaufmonat als Grenzen | `haushalt.test.ts`, `jahresrechnung.test.ts` |
| C1, C2 | behoben | Kontrast | zweiter Prüflauf |
| C3–C5, C8 | behoben | Texte | – |
| C6 | behoben | Kundenname folgt den Stammdaten | `haushalt.test.ts` |
| C7 | behoben | Anzeige «wie geplant»; keine Zeile «Witwenrente» im Konkubinat; Ganzzahlfelder nur Ziffern | `fachmodule.test.ts` |
| C9 | behoben | die beiden Tests sind korrigiert | – |


---

## Zweiter Prüflauf (2026-11-16, nach der Behebung, Commit `66aceb8`)

Derselbe Lauf wie beim Assessment: drei unabhängige Prüfer (Datenfluss; Kern/Lebensplan/Abschluss; Fachmodule),
Portvergleich, Schadcode, Zugänglichkeit, schmale Bildschirme.

**Hält:** Rechenkern ohne die neuen Felder bit-gleich zum PensCheck (1302 Zufallsläufe, 0 Abweichungen); Jahresbilanz
geht in 432 Läufen auf; Erbrecht (18 Kombinationen), AHV/IV, UVG und Kapitalbezugssteuer von Hand nachgerechnet;
keine HTML-Injektion; Portvergleich: 23 von 32 Dateien identisch, die übrigen 9 mit den dokumentierten Änderungen.

**Gefunden: 21 Befunde in Randfällen, dazu Kontrast auf den bestehenden Seiten.** Alle behoben, je mit Test:

| Bereich | Befund | Test |
|---|---|---|
| Datenfluss | Verpflichtungen bei Frequenz «pro Jahr» zwölfmal zu klein | `pruef2.spec.ts` |
| Datenfluss | Einzelperson → Paar im Cockpit kürzte 3a/PK von Person 1 | `haushalt.test.ts` |
| Datenfluss, Budget | Netto einer Person galt als Netto des Haushalts | `budget.test.ts` |
| Datenfluss | Person 2 aus den Stammdaten entfernt: 07a/10 mit Paar-Einkommen | `pruef2.spec.ts` |
| Datenfluss | Modul 10 rechnete die Absicherung ohne nachgeführte Stammdaten | `pruef2.spec.ts` |
| Datenfluss | anlagefähiges Kapital in 07b veraltet | `pruef2.spec.ts` |
| Datenfluss | Import liess das alte Netto stehen | `pruef2.spec.ts` |
| Lebensplan | Spar-, Anlage-, Vorsorgeziele als Ausgabe gerechnet | `lebensplan.test.ts` |
| Lebensplan | PK-Vorbezug: Auszahlung teuerungsbereinigt, Kürzung nominal | `lebensplan.test.ts` |
| Lebensplan | Planungshorizont ein Jahr zu früh | `lebensplan.test.ts` |
| Kern | Jahr 0 wurde zu 1990 und zählte sofort | `kern-erweiterung.test.ts` |
| Lebensplan | Eigenmittel über dem Kaufpreis: Anzeige ≠ Rechnung | `lebensplan.test.ts` |
| Lebensplan | Zuflüsse aus 07f gerechnet, aber nicht in der Liste | `lebensplan.test.ts` |
| Lebensplan | Hinweistexte zum Vorbezug | `lebensplan.test.ts` |
| Absicherung | alleinstehend, erwachsene Kinder: Todesfall mit vollem Bedarf als Lücke | `fachmodule.test.ts` |
| Abschluss | «gedeckt», obwohl kein Fall gerechnet | `pruef2.spec.ts` |
| Steuern | Sperrfrist-Entwarnung ohne Rechnung | `pruef2.spec.ts` |
| Absicherung | Feld «davon» zeigte anderen Wert als gerechnet | `pruef2.spec.ts` |
| Absicherung | Renten/übrige Einkommen fehlen ohne Hinweis | `fachmodule.test.ts` |
| Absicherung, Budget | «erwerbstätig» ohne Blick auf das Pensionierungsalter | `fachmodule.test.ts`, `budget.test.ts` |
| Nachlass, Texte | unvollständiges Jahr, Entwurfshinweis, Namen statt «Person N» | `pruef2.spec.ts`, `fachmodule.test.ts` |
| Kontrast | blasse Schrift auf den bestehenden Seiten, fehlendes Label | axe auf 19 Seiten: 0 Verstösse |

Regeln dazu: ADR-22, Nachtrag (Punkte 12–23) und die ergänzten Grenzen.
