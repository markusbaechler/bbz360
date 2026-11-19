# Zielbild: Fusion PensCheck → bbz360

Stand: 2026-11-16 · Status: **alle Phasen 1–9 gebaut, aber nicht einsatzbereit** — das Assessment (`docs/assessment-2026-11-fusion.md`) nennt 15 Fehler der Klasse A; fachliche Abnahme der Module 07d–07f durch die Bank steht aus · Grundlage: Interview mit dem Auftraggeber (drei Fragerunden)

## 1. Ziel

bbz360 wird zur umfassenden Gesamtberatungs-App der bbz bank st.gallen. Der PensCheck
(neuere Entwicklung) geht fachlich und gestalterisch in bbz360 (ältere, holistische
Beratungs-App) ein. Am Ende rechnen alle Beratungsfelder auf **einem gemeinsamen
Kundendatenmodell** und zeigen sich in **einem durchgängigen Lebensplan**.

## 2. Entscheide aus dem Interview (verbindlich)

| # | Thema | Entscheid |
|---|---|---|
| E1 | Integrationsform | **Tiefe Fusion**: Modul Pensionierung plus gemeinsamer Rechenkern; Cockpit, Ziele und Pensionierung teilen dieselben Daten, keine Doppelerfassung |
| E2 | Öffentlicher PensCheck | Bleibt live und **unabhängig**; bbz360 erhält eine einmalige Portierung, danach getrennte Pflege. Das Repo `bbzsg/PensCheck` wird nicht verändert |
| E3 | Übernahme-Umfang | Alles: Rechenkern + Parameter, Bühne + Auswertung, Themenkarten + «So oder so», Tutor + PDF-Bericht |
| E4 | Zielbild darüber hinaus | **Neue Beratungsfelder** und **durchgängiger Lebensplan** (eine Zeitachse über alle Module) |
| E5 | Neue Felder | Budget/Liquidität, Steuern, Absicherung/Risiko, Nachlass/Erbschaft |
| E6 | Nutzung | **Nur Berater:in im Gespräch**. Tutor = «gemeinsam mit dem Kunden erfassen», Bühne = Fachmodus |
| E7 | Technik | TypeScript und Multi-Page-Aufbau von bbz360 bleiben; Engine wird nach TS portiert |
| E8 | Gestaltung | **PensCheck-Look führt** (bbz Brand System «web»). Umfang: Tokens, Schriften (Selawik, Space Grotesk) und Markenzeichen (Vertikallinie, Punkt) in `theme.css`; Layout und Bühnen-Grammatik der Module 01–10 bleiben. `DESIGN-SPEC.md` wird als v4 nachgeführt |
| E9 | Fachtiefe neue Felder | **Rechnend, wo belegbar** (öffentlich prüfbare Grundlagen mit Quelle); der Rest als strukturierte Gesprächsführung mit Themenkarten; Annahmen sichtbar ausgewiesen |
| E10 | Reihenfolge | Kern → Pensionierung → Rest (siehe Phasenplan) |
| E11 | Leitplanken | Nur lokal, kein Backend · bestehende v1/v2-Sessions migrieren verlustfrei · offline-fähig als PWA · PensCheck-Stand (Link/Datei) importierbar |
| E12 | Lieferform | **Phasen mit Review**: je Phase ein prüfbarer Stand auf `claude/loving-albattani-efae2x`; kein Merge auf `main` ohne Freigabe |

### Nachträge aus dem Interview vor Phase 4

| # | Thema | Entscheid |
|---|---|---|
| E13 | Datenfluss | **Haushalt führt**: Cockpit 05 liest und schreibt die geteilten Felder direkt im Haushalts-Stand |
| E14 | Lohn | Cockpit erfasst **Bruttolohn pro Jahr und Geschlecht** je Person; Netto bleibt für den Cashflow |
| E15 | Budget | **Eigenes Modul 05b** mit dem Budget-Assistenten des PensCheck |
| E16 | Vorgehen | Weiterbauen bis und mit Phase 5; die Fachmodule Steuern, Absicherung, Nachlass (Phasen 6–8) erst nach Review |
| E17 | Review nach Phase 5 | **Freigabe, alles fertigbauen** (Phasen 6–9 ohne Zwischenstopp; fachliche Abnahme durch die Bank danach) |
| E18 | Rechenkern | **Additiv erweitern**: Zuflüsse und Liegenschaftskauf in der Zukunft (ADR-19) |
| E19 | Quellenprüfung | **Manuell**: kein automatischer Workflow; `npm run verify:sources` bei Bedarf |
| E20 | Abschluss | Urteil des **Lebensplans**, daneben das der Pensionierung allein |

### Stand der Umsetzung

| Phase | Stand |
|---|---|
| 1 Datenmodell + Rechenkern | umgesetzt (ADR-16) |
| 2 Modul 07c Pensionierung | umgesetzt (ADR-16, Nachtrag) |
| 3 Themenkarten, «So oder so», Import | umgesetzt |
| 4 Budget 05b, Cockpit auf gemeinsamen Daten | umgesetzt (ADR-17) |
| 5 Lebensplan | umgesetzt (ADR-18); Eigenheimkauf und Zuflüsse über die Kern-Erweiterung (ADR-19) |
| 6–8 Steuern, Absicherung, Nachlass | umgesetzt (ADR-20); **fachliche Abnahme durch die Bank steht aus** |
| 9 Look, Bericht, PWA | umgesetzt (ADR-21): Brand-Tokens und -Schriften in allen Modulen, PWA/offline; PDF-Bericht der Pensionierung seit Phase 2, Gesprächsbericht (10) mit Lebensplan und Fachmodulen |

## 3. Nicht-Ziele

- Kein Server, keine Cloud, keine Kundenkonten.
- Kein Kunden-Selbstbedienungsweg in bbz360 (dafür bleibt der öffentliche PensCheck).
- Kein Umbau des Layouts der Module 01–10 auf die PensCheck-Bühne.
- Keine volle kantonale Einkommenssteuer-Berechnung, keine güterrechtliche Auseinandersetzung, keine Leistungsberechnung aus PK-Reglementen.
- Kein gemeinsames Paket zwischen den beiden Repos.

## 4. Zielarchitektur

- **Datenmodell**: `SessionData` erhält einen typisierten Abschnitt «Haushalt» (Personen, Einkommen, Vorsorge, Vermögen, Liegenschaften, Budget, Wünsche, Themen) nach dem Vorbild des PensCheck-Stands. Die bisherigen `cockpit_*`-, `anlage_*`- und `finanzierung_*`-Felder werden per `migrate()` darauf abgebildet (neue Schemaversion, Vorgehen wie ADR-4).
- **Rechenkern**: `src/lib/engine/` (TS-Port von `engine.js`, `analyse.js`, `aktion.js`, `params.js`) neben dem bestehenden `finance.ts`. Die PensCheck-Tests werden als Fixtures übernommen und müssen identische Ergebnisse liefern.
- **Grundlagen**: Parameter mit Quellenangabe und Prüfskript (`verify-sources`) wandern mit; neue Felder folgen demselben Muster.
- **Lebensplan**: Eine Zeitachsen-Komponente (aus `bild.js`) zeigt Einkommen, Ausgaben und Vermögen pro Jahr; Ziele (06), Eigenheim (07a), Anlegen (07b) und Pensionierung speisen dieselbe Rechnung.
- **Modulfolge (Ziel)**: 01–04 unverändert · 05 Finanz-Cockpit (liest/schreibt Haushalt) · 05b Budget · 06 Ziele · 07a Finanzieren · 07b Anlegen · 07c Pensionierung · 07d Steuern · 07e Absicherung · 07f Nachlass · 08–10 (Bericht erweitert).

## 5. Phasenplan

| Phase | Inhalt | Abnahme (Gate) |
|---|---|---|
| 0 | Dieses Zielbild | Freigabe durch Auftraggeber |
| 1 | Gemeinsames Datenmodell + Migration; Engine-Port nach TS | Alte Sessions laden verlustfrei; portierte PensCheck-Tests grün; bestehende Fixtures T/A/E unverändert grün |
| 2 | Modul 07c Pensionierung: Bühne, Bild, Urteil/Ampel, Ansichten, Ansatzpunkte, Aktionsplan, Tutor als Erfassungsmodus | Musterfall liefert dieselben Zahlen wie PensCheck; E2E-Smoke |
| 3 | Themenkarten + «So oder so»; Import eines PensCheck-Stands | Import eines PensCheck-Links/-Datei ergibt identisches Urteil |
| 4 | Modul Budget/Liquidität; Cockpit 05 auf gemeinsame Daten | Keine Doppelerfassung zwischen 05, Budget und 07c |
| 5 | Durchgängiger Lebensplan über 06, 07a, 07b, 07c | Ein Ziel, ein Kauf und eine Anlage erscheinen in derselben Zeitachse und Rechnung |
| 6 | Modul Steuern (Kapitalbezugs- und Vermögenssteuer, 3a, PK-Einkauf, Staffelung) | Jede Zahl mit Quelle; Annahmen ausgewiesen |
| 7 | Modul Absicherung (Tod, Invalidität: AHV/IV, BVG-Minima) | wie Phase 6 |
| 8 | Modul Nachlass (gesetzliche Erbquoten, Pflichtteile, Erbschaft als Zufluss, Vorsorgeauftrag als Thema) | wie Phase 6 |
| 9 | Look: Brand-Tokens und Schriften in `theme.css`, DESIGN-SPEC v4; Bericht in Modul 10 inkl. PDF mit Vektorbild; PWA/offline | Typografie- und Enge-Schirme-Gates grün; App startet ohne Netz |

Für jede Phase gilt: `typecheck`, Unit, Build und E2E grün; ADR für jeden Entscheid, der einen bestehenden ADR berührt.

## 6. Definition of Done (Gesamtziel)

1. Ein Beratungsgespräch von Agenda bis Abschluss deckt Finanzen, Budget, Ziele, Eigenheim, Anlegen, Pensionierung, Steuern, Absicherung und Nachlass ab.
2. Jede Kundenangabe wird genau einmal erfasst und in allen Modulen verwendet.
3. Der Lebensplan zeigt alle Felder in einem Bild und einer Rechnung.
4. Das Pensionierungs-Urteil in bbz360 stimmt für die PensCheck-Testfälle mit dem PensCheck überein.
5. Alle gerechneten Grundlagen sind mit Quelle belegt und automatisch prüfbar.
6. Bestehende Sessions, Session-Export/-Import und Beraterprofile funktionieren weiter.
7. Die App läuft offline, speichert nur lokal und erscheint einheitlich im bbz Brand System.

## 7. Offene Risiken

- **Fachfehler in den neuen Feldern**: Steuern, Absicherung und Nachlass haben im PensCheck keine fertige Logik; sie brauchen fachliche Abnahme durch die Bank.
- **Speicherbudget**: localStorage fasst rund 5 MB (ADR-14); der Haushalts-Stand und PWA-Cache sind dagegen zu prüfen.
- **Parameterpflege**: Nach der einmaligen Portierung laufen die Grundlagen in zwei Repos auseinander, sofern sie nicht in beiden nachgeführt werden.
- **Gates**: Der Token-/Schriftwechsel berührt die Typografie-Gates (ADR-15) und die Modal-Parität (ADR-12).
