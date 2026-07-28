# Agenda: Traktanden abhaken

**Datum:** 2026-07-28
**Modul:** 01 Agenda (Auswirkung auf 10 Abschluss)

## Ziel

Jedes Traktandum lässt sich im Gespräch prominent als erledigt markieren. Die
Agenda wird damit von einer Liste zu einem sichtbaren Gesprächsfortschritt —
der Kunde sieht, was abgearbeitet ist.

## Datenmodell

Neuer Session-Key `agenda_erledigt: boolean[]`, parallel zu
`agenda_traktanden`. `agenda_traktanden` bleibt ein `string[]`: Modul 10 liest
es unverändert, das v1-Schema bleibt gültig, ein Import alter Sessions
funktioniert weiter.

`agenda_erledigt` ist **kein** Config-Key (siehe `CONFIG_KEYS` in `data.ts`).
"Neue Beratung" (`clearSession`) setzt die Haken damit zurück — genau wie die
Traktanden selbst, die ebenfalls Session-Scope haben.

### Synchron halten

Der Zustand hängt am Index. Beide Arrays müssen bei jeder Strukturänderung
gemeinsam wandern:

| Aktion | Wirkung |
|---|---|
| Traktandum hinzufügen | `erledigt.push(false)` |
| Traktandum löschen | `erledigt.splice(idx, 1)` |
| Sortieren (Drag) | beide Arrays aus dem DOM neu aufbauen |

Beim Sortieren trägt jede Zeile ihren Zustand als `data-done` am
`.ag-tr`-Element. `onEnd` liest Text **und** Zustand aus dem DOM — dasselbe
Muster, das heute schon für die Texte gilt, statt Sortable-Indizes zu remappen.

Beim Laden wird `agenda_erledigt` defensiv auf die Länge von
`agenda_traktanden` gebracht (fehlende Werte = `false`, überzählige fallen
weg). Deckt alte Sessions, Importe und von Hand bearbeitete Stände ab.

## Interaktion

Die Positionsnummer **wird** der Schalter:

```html
<button class="ag-tn" type="button" role="checkbox" aria-checked="false"
        aria-label="Traktandum erledigt">01</button>
```

Bedienbar per Klick und Tastatur (Leertaste/Enter, native Button-Semantik).
Klickziel mindestens 44 px (Layout-Konzept: Klickziele ≥44px in
Arbeitsflächen).

**Ohne Bearbeiten-Modus bedienbar.** Abhaken ist Gesprächsführung, keine
Konfiguration — im Gespräch soll niemand erst den Bearbeiten-Modus suchen.
Das ist die zweite dokumentierte Ausnahme zu Regel 4 ("Werkzeuge nur in
`body.edit-mode`") neben "+ Erwartung ergänzen"; sie wird im Datei-Header von
`01-agenda.ts` vermerkt.

## Darstellung

| Zustand | Nummer | Text |
|---|---|---|
| offen | Positionsnummer wie heute (`--blue`) | `--ink-2` |
| erledigt | gefüllter Kreis `--green` mit weissem Haken | `--mut`, `line-through` |

Der Übergang wird über `--dur` animiert, damit das Abhaken im Gespräch
sichtbar *passiert* statt nur da zu sein.

Zähler im Panel-Kicker: `TRAKTANDEN · 3 von 6 erledigt`. Erscheint erst ab dem
ersten Haken, damit die Bühne beim Gesprächsstart ruhig bleibt.

## Modul 10 (Gesprächsbericht)

Erledigte Traktanden bekommen in der Berichtszeile statt der Nummer den Haken.
Nur wenn echte Traktanden vorliegen — bei leerer Agenda zeigt Modul 10 eine
Fallback-Liste, zu der es keinen Erledigt-Stand gibt.

## Tests (E2E)

- Abhaken übersteht einen Reload
- Zähler erscheint erst ab dem ersten Haken und zählt korrekt
- Sortieren nimmt den Haken an das richtige Traktandum mit
- Löschen eines offenen Traktandums verschiebt den Haken nicht
- Funktioniert ohne Bearbeiten-Modus
- Modul 10 zeigt den Haken für erledigte Traktanden

## Bewusst nicht enthalten

Kein "alle abhaken", kein Zeitstempel, kein Filter oder Ausblenden erledigter
Traktanden. Erst nachrüsten, wenn es im Gespräch wirklich fehlt.
