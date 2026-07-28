# Ziele: Erfassungs-Modal in zwei Stufen

**Datum:** 2026-07-28
**Modul:** 06 Ziele & Wünsche

## Ziel

Das Modal stellte alles auf einmal dar — Wahl, Bezeichnung, Zeithorizont,
Betrag, Wahrscheinlichkeit, Notiz. Beim Öffnen sah der Kunde ein Formular
statt einer Frage. Stufe 1 fragt jetzt nur „Worum geht es?"; erst nach der
Wahl klappt die Erfassungsmaske auf.

Das ist keine neue Regel, sondern DESIGN-SPEC Regel 2 (sequenzielle
Freischaltung, „Erledigtes kollabiert zur Quittungszeile") endlich auf die
Modals angewendet.

## Ablauf

| | Stufe 1 | Stufe 2 |
|---|---|---|
| sichtbar | Chip-Raster der Kategorie/Inspiration | Erfassungsmaske |
| Wahl | — | Quittungszeile: Symbol + Begriff + „ändern" |
| Fuss | nur „Abbrechen" | „Abbrechen" + „Speichern" |

- **Bearbeiten startet in Stufe 2** — dort ist die Wahl längst getroffen.
- „ändern" führt zurück zu Stufe 1, die bisherige Wahl bleibt markiert.
- Gilt für **beide** Modals (Ziel/Geldeingang und Wunsch), damit sich das
  Modul einheitlich verhält.

## Umsetzung

Der Zustand hängt als `data-stufe` am `.zl-modal`, **nicht** am Körper: der
Speichern-Knopf liegt im Fuss und muss mitgesteuert werden.

```css
.zl-modal[data-stufe="1"] .zl-stufe2,
.zl-modal[data-stufe="1"] .zl-auswahl,
.zl-modal[data-stufe="2"] .zl-wahl { display: none; }
```

Die Felder sind **einzeln** mit `.zl-stufe2` markiert statt in einen Wrapper
gepackt — `.zl-mbody` ist ein Flex-Container mit `gap`, ein Wrapper hätte die
Abstände eingeebnet.

`setStufe(modalId, stufe, begriff?)` schaltet um und beschriftet die
Quittungszeile.

## Tests

`tests/e2e/06-ziele-zweistufig.spec.ts`: Stufe 1 zeigt nur die Wahl · Wahl
öffnet die Maske und schrumpft zur Zeile · „ändern" führt zurück, Auswahl
bleibt markiert · Bearbeiten startet in Stufe 2 · Wunsch-Modal ebenso.

Ein Bestandstest in `06-ziele.spec.ts` füllte die Bezeichnung vor der
Kategoriewahl; die Reihenfolge folgt jetzt dem neuen Ablauf.

## Nachtrag: Leerzustand der Zeitachse

Beim Sichttest an derselben Stelle gefunden und mitbehoben:

- Ein handgesetztes `<br>` brach den Satz mitten drin um; da davor kein
  Leerzeichen stand, klebte der Gedankenstrich am nächsten Wort („Sie –heute").
  Jetzt bricht der Satz selbst um (`max-width` + `text-wrap: balance`).
- Säule und Bühne benutzten verschiedene Gedankenstriche.
- Der Leerzustand wurde per Inline-Style auf `display:block` geschaltet und
  verlor damit die Zentrierung aus `.zl-empty` (`display:flex`). Jetzt
  schaltet das `hidden`-Attribut, die Darstellung bleibt in der CSS.
- Die Bühne wiederholte den Säulentitel wörtlich (und der Eyebrow den
  Säulen-Kicker). Neu: die Säule stellt die Frage, die Bühne zeigt den
  nächsten Schritt („IHRE ZEITACHSE / «Womit fangen wir an?» / Wählen Sie
  oben ein Lebensthema — …").
