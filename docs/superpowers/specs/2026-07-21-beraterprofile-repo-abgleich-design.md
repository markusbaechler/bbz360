# Beraterprofile ins Repo — Export/Import im Admin

**Datum:** 2026-07-21
**Status:** Abgenommen (Design), bereit für Umsetzung

## Problem

Beraterprofile (Name, Titel, Kacheltitel, Kacheltexte, Porträtfotos) leben
ausschliesslich im localStorage-Store `bbzAdmin` — also in genau einem Browser
auf genau einem Gerät und unter genau einer Origin. `localhost:5173` und
`markusbaechler.github.io` sind getrennte Welten; ein zweites Beraterlaptop
ebenso.

Auf jedem anderen Gerät greift der Repo-Default `public/data/berater.json`.
Die Datei existiert, ist aber eine Blanko-Vorlage: fünf Profile „Vorname
Nachname", `content` durchgehend leer. Deshalb wirkt die App dort „leer".

Die Architektur ist bereits auf den Repo-Weg ausgelegt — es fehlt nur der
Rückweg aus dem Admin ins Repo:

- `main.ts:66` / `admin.ts:41`: `bbzAdmin` schlägt `berater.json` schlägt
  Notfall-Platzhalter — dasselbe Override-Modell wie bei den App-Bildern.
- `images.ts:129` `beraterRepoTarget()` liefert bereits
  `public/img/berater/berater<id>{a,b,c}.jpg`.
- `03-berater.ts:159` fällt bereits auf genau diese Repo-Dateien zurück.

Anders als bei den App-Bildern (`admin.ts:205` „⬇ Für Repo") gibt es für
Profile keinen Export. Die Daten können den Browser nicht verlassen.

## Ziel

Der gepflegte Profilstand lässt sich aus dem Admin als versionierbare
Repo-Dateien herausschreiben, und ein Gerät mit veraltetem lokalem Stand kann
den Repo-Stand zurückholen.

Nicht Ziel: Backend, GitHub-Token im Browser, automatische Commits,
Änderungen am Profil-Editor selbst.

## Lösung

Ein **Repo-Abgleich-Modal** im Admin, erreichbar über eine Kopfaktion
„⇅ Repo-Abgleich" neben „✓ Speichern" in der Beraterprofil-Ansicht.

### Export — „⬇ Für Repo"

Das Modal listet die zu erzeugenden Dateien, je mit Zielpfad und
Download-Knopf — dasselbe Muster wie die App-Bilder-Karten:

1. **`public/data/berater.json`** — der gesamte Profilstand als JSON:

   ```json
   [{ "id": 1, "name": "…", "titel": "…",
      "foto": "img/berater/berater1a.jpg",
      "kacheln": [{ "titel": "…", "foto": "img/berater/berater1a.jpg", "content": "…" }] }]
   ```

   `foto` ist **immer** der Repo-Pfad, nie Base64 — das Format bleibt
   identisch zur heutigen Vorlage, damit `getAllProfiles()` und
   `migrateAdmin()` unverändert weiterlesen.

2. **Je Kachelfoto mit `foto_b64` eine Bilddatei** mit dem korrekten
   Zieldateinamen (`berater1a.jpg`, `berater1b.jpg`, …) und der Pfadangabe
   `public/img/berater/…`. Profile ohne eigenes Foto erscheinen nicht in der
   Liste — dort gilt bereits der Repo-Default.

Kein Sammel-Download: Browser blockieren Mehrfach-Downloads, und die
Einzelliste macht sichtbar, was wohin gehört. Unter der Liste ein kurzer
Hinweis auf den Ablauf (Dateien ablegen → committen → nächster Deploy).

### Import — „Aus Repo laden"

Zweiter Bereich im selben Modal: lädt `berater.json` per
`BBZ.getAllProfiles()`, zeigt eine Bestätigung („überschreibt die Profile auf
diesem Gerät") und schreibt bei Zustimmung über `BBZ.setBeraterProfiles()`.

Beim Import gewinnen die **Kacheltitel aus dem JSON**; heute überschreibt
`admin.ts:47` sie stumm mit den festen `KACHEL_TITLES`. Vorhandene
`foto_b64`-Uploads des Geräts gehen verloren — das ist der Sinn des
Überschreibens und steht so in der Bestätigung.

Ist `berater.json` leer oder nicht erreichbar, bleibt der lokale Stand
unangetastet und das Modal meldet es.

### Mitgenommene Korrektur

`main.ts:78` liest im Berater-Picker das rohe `foto`-Feld als `img src`. Bei
einem aus `berater.json` geladenen Profil ist das ein Pfad *ohne* `BASE` — er
funktioniert nur, weil `index.html` zufällig auf der Basis-Ebene liegt. Der
Picker wird auf `beraterImageUrl(p.id, 0, foto_b64)` umgestellt, die einzige
Stelle, die `BASE` korrekt kennt.

## Technische Umsetzung

- **`src/lib/images.ts`**: nichts Neues nötig — `beraterImageUrl()` und
  `beraterRepoTarget()` decken beide Richtungen ab. Der Datei-Download je
  Foto nutzt dieselbe Anker-Technik wie `downloadForRepo()`; dafür wird eine
  generische `downloadDataUrl(url, filename)` extrahiert, die `downloadForRepo()`
  intern mitbenutzt (keine zweite Implementierung).
- **`src/admin.ts`**: `buildRepoJson()` (Profile → Export-Struktur),
  `renderRepoModal()`, `importFromRepo()`. Die Serialisierung ist eine reine
  Funktion ohne DOM-Zugriff, damit sie im Unit-Test prüfbar ist.
- **`admin.html`**: Kopfaktion „⇅ Repo-Abgleich" + Modal-Gerüst nach dem
  Muster des bestehenden Foto-Modals (`#fotoModalBg`).
- **`src/styles/modules/admin.css`**: Dateiliste im Modal; erbt die
  vorhandenen `.ad-img*`-Muster, wo möglich.

Kein Schema-Eingriff: `bbzAdmin` bleibt ein reines `Berater[]`, `admin` bleibt
der einzige Writer (ADR/Schema-Regel).

## Verifikation

- **Unit** (`tests/unit/`): `buildRepoJson()` — Base64 taucht nirgends im
  Ergebnis auf, `foto`-Pfade folgen `berater<id>{a,b,c}.jpg`, Kacheltitel und
  `content` bleiben erhalten, Reihenfolge stabil.
- **E2E** (`tests/e2e/index-admin.spec.ts` oder neue Spec):
  - Export: Profil bearbeiten → Modal → Download von `berater.json` abfangen,
    JSON parsen, Name und Kacheltext wiederfinden, kein `data:`-Präfix.
  - Import: `bbzAdmin` mit abweichendem Stand vorbelegen → „Aus Repo laden"
    → bestätigen → `bbzAdmin` entspricht `berater.json`, Kacheltitel aus JSON.
  - Picker: Profil ohne `foto_b64` zeigt im Cockpit die Repo-Datei
    (`img/berater/berater1a.jpg` mit `BASE`-Präfix).
- Bestehende Gates unberührt: `index-admin-parity` prüft v1-Funktionsumfang,
  nicht die Abwesenheit neuer Aktionen.
- `npm run typecheck`, `npm run test`, `npm run test:e2e` grün.

## Verworfene Alternativen

- **Base64-Fotos ins `berater.json`**: ein Klick statt vieler, aber die Datei
  wächst auf mehrere MB und lädt bei jedem Seitenaufruf mit.
- **Fotos gerätelokal lassen**: einfachster Export, aber jedes neue Gerät
  zeigt Initialen statt Porträts — genau das Problem, das gelöst werden soll.
- **Commit per GitHub-API aus dem Admin**: echte physische Ablage ohne
  manuellen Schritt, verlangt aber ein Schreib-Token im Browser — für eine
  Bankanwendung nicht vertretbar.
