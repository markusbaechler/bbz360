// Anbieter und Kontakt für «Ergebnis mit einer Fachperson besprechen» (App, PDF-Bericht, Fusszeile).
export const ANBIETER = {
  name: 'Bankenberatungszentrum (bbz)',
  kontaktUrl: 'https://www.bankenberatungszentrum.ch/kontakt/',
  kontaktText: 'Ergebnis mit einer Fachperson besprechen',
  webUrl: 'https://www.bankenberatungszentrum.ch/',
  // Fusszeile wie auf der Website: Claim, Datenschutz, Kontakt, Firma
  claim: 'Wir bilden aus. Und weiter.',
  firma: 'bbz st.gallen ag',
  datenschutzUrl: 'https://www.bankenberatungszentrum.ch/datenschutzerklaerung-impressum/',
  telefon: '+41 71 274 02 40',
  email: 'info@bankenberatung.ch',
  linkedinUrl: 'https://www.linkedin.com/company/bankenberatungszentrum',
};

// Wichtiger Hinweis (Fusszeile, Ergebnis, Tutor, PDF-Bericht). Eine Quelle für alle Stellen.
export const HINWEIS = {
  kurz: 'PensCheck ersetzt keine Pensionierungsplanung. Er liefert eine erste Einschätzung als Grundlage für eine weiterführende Beratung.',
  absaetze: [
    'PensCheck ersetzt keine Pensionierungsplanung. Er liefert eine erste, vereinfachte Einschätzung auf Basis weniger Angaben und dient als Grundlage für eine weiterführende Beratung.',
    'Gerechnet wird mit Ihren Angaben, den gesetzlichen Werten des laufenden Jahres und Annahmen zu Rendite, Teuerung, Steuern und Lebenserwartung. Reglement der Pensionskasse, AHV-Kontoauszug, Steuersituation und Anlagen werden nicht im Einzelnen geprüft. Massgebend sind die Angaben von Pensionskasse, AHV-Ausgleichskasse und Steuerbehörden.',
    'Die Ergebnisse sind keine Anlage-, Steuer- oder Rechtsberatung und keine Empfehlung für einen bestimmten Pensionierungszeitpunkt, einen Kapitalbezug oder ein Finanzprodukt. Die genannten Ansatzpunkte sind rechnerische Hinweise zum Prüfen, keine Empfehlung. Für Richtigkeit und Vollständigkeit wird keine Gewähr übernommen.',
    'Bevor Sie über Ihre Pensionierung entscheiden, lassen Sie sich persönlich beraten.',
    'Einsatz im Beratungsgespräch: Wer PensCheck mit Kundinnen und Kunden einsetzt, bleibt für die Beratung selbst verantwortlich. PensCheck prüft weder Kenntnisse und Erfahrungen noch finanzielle Verhältnisse und Anlageziele, nennt keine Finanzinstrumente und ersetzt weder die Eignungs- und Angemessenheitsprüfung noch die Informations- und Dokumentationspflichten des Finanzdienstleisters.',
  ],
  daten: 'Ihre Angaben bleiben auf diesem Gerät und werden nicht übertragen. Sie sind in diesem Browser gespeichert, bis Sie «Neu beginnen» wählen oder die Browserdaten löschen; beim Start fragt PensCheck, ob Sie weitermachen oder neu beginnen wollen. Auf einem Gerät, das auch andere nutzen, löschen Sie die Angaben nach dem Gespräch.',
};

// Datenschutzhinweise für PensCheck (Hinweis-Dialog, PDF-Bericht). Sie ergänzen die allgemeine Datenschutzerklärung des
// bbz, die bbzsg.ch, das Hosting bei GitHub Pages und den Browserspeicher nicht nennt (geprüft am 14.11.2026).
// Bei jeder Änderung an Hosting, Speicherung oder Auswertung hier nachführen.
export const DATENSCHUTZ = {
  titel: 'Datenschutz bei PensCheck',
  stand: 'November 2026',
  punkte: [
    ['Verantwortlich', 'bbz st.gallen ag (Bankenberatungszentrum), Zürcherstrasse 202, 9014 St. Gallen, info@bankenberatung.ch, +41 71 274 02 40.'],
    ['Ihre Angaben', 'Alles, was Sie in PensCheck eingeben, wird nur in Ihrem Browser gerechnet und dort gespeichert (lokaler Speicher des Browsers). Die Angaben werden weder an das bbz noch an Dritte übertragen. Es gibt kein Benutzerkonto, und das bbz kann Ihre Angaben nicht einsehen. Vorgemerkte Themen gehören zu den Angaben: Sie sind im Browser gespeichert und im Link enthalten.'],
    ['Speicherdauer und Löschen', 'Die Angaben bleiben in diesem Browser, bis Sie «Neu beginnen» wählen oder die Browserdaten löschen. Beim Start fragt PensCheck, ob Sie weitermachen oder neu beginnen wollen. Auf einem Gerät, das auch andere nutzen, löschen Sie die Angaben nach dem Gespräch.'],
    ['Link, PDF und Kalenderdatei', '«Link kopieren» legt Ihre Angaben in den Teil der Adresse nach dem Zeichen #; dieser Teil wird nicht an den Server gesendet. Wer den Link erhält, kann die Angaben lesen: Geben Sie ihn nur weiter, wem Sie die Angaben zeigen wollen. Auf Mobilgeräten öffnet «Link kopieren» den Teilen-Dialog des Geräts: Die gewählte App (Mail, Messenger) erhält den Link mit allen Angaben, auch Namen und Gesprächsdatum. PDF-Bericht und Kalenderdatei entstehen auf Ihrem Gerät; die Kalenderdatei enthält Termine mit Beträgen und gelangt beim Import in einen Online-Kalender zu dessen Anbieter.'],
    ['Abruf der Seite', 'PensCheck wird über GitHub Pages ausgeliefert, einen Dienst der GitHub, Inc. (USA, Microsoft-Konzern). Beim Abruf verarbeitet GitHub technische Zugriffsdaten, namentlich die IP-Adresse, den Zeitpunkt und Angaben zum Browser, um die Seite auszuliefern und den Dienst zu schützen. Das geschieht bei jedem Abruf, auch wenn die geöffnete oder installierte App regelmässig nach Aktualisierungen sucht. Die Auslieferung läuft über ein weltweites Servernetz; die Daten können in den USA und in weiteren Ländern bearbeitet werden. GitHub ist nach eigenen Angaben unter dem Swiss-U.S. Data Privacy Framework zertifiziert und stützt Übermittlungen im Übrigen auf Standardvertragsklauseln. Ihre Eingaben gehören nicht zu diesen Daten.'],
    ['Keine Cookies, keine Analyse', 'PensCheck setzt keine Cookies, misst keine Nutzung und bindet keine Inhalte von Dritten ein. Schriften, Programmcode und Daten stammen von derselben Adresse. Für die Nutzung ohne Netz legt der Browser die Dateien der App in einem Zwischenspeicher ab. Im Browser stehen ausser Ihren Angaben zwei technische Merker ohne Personenbezug (Hinweis zur Installation gesehen, Start-Rückfrage in dieser Sitzung gestellt) und die Verwaltungsdaten dieses Zwischenspeichers (Adressen und Zeitpunkte der abgelegten Dateien).'],
    ['Links nach aussen', 'Für die Website des bbz, die Kontaktaufnahme und die verlinkten Quellen gelten die Datenschutzbestimmungen der jeweiligen Anbieter.'],
    ['Ihre Rechte', 'Zu PensCheck sind beim bbz keine Angaben über Sie gespeichert. Fragen zum Datenschutz und Begehren um Auskunft, Berichtigung oder Löschung richten Sie an die oben genannte Adresse. Im Übrigen gilt die allgemeine Datenschutzerklärung des bbz.'],
  ],
};

/** Wohnkosten nach dem Verkauf des Eigenheims: in den Grenzen und als Hinweis am Feld «Verkauf mit Alter» (form.js). */
export const HINWEIS_VERKAUF_WOHNEN = 'Wird das selbst bewohnte Eigenheim verkauft, bleiben die Wohnkosten so, wie sie in den Ausgaben erfasst sind. Eine Miete danach ist gesondert zu erfassen.';

// Grenzen der Rechnung: was PensCheck vereinfacht oder nicht rechnet (Ergebnis, Hinweis-Dialog, PDF-Bericht).
export const GRENZEN = [
  ['Steuern im Ruhestand', 'Die Einkommenssteuer ist pauschal gerechnet, nicht nach den Tarifen von Kanton und Gemeinde: ein Satz auf der AHV- und der PK-Rente, derselbe Satz auf dem steuerbaren Teil der Vermögenserträge (Annahme: die Hälfte) und die Vermögenssteuer nach dem Tarif des Kantonshauptorts (Steuerbelastungsstatistik der ESTV für Rentnerinnen und Rentner, ohne Kirchensteuer) auf dem Reinvermögen; Liegenschaften zählen zu 70% des Verkehrswerts, abzüglich Hypotheken. Andere Gemeinden haben andere Steuerfüsse, und der Steuerwert einer Liegenschaft kann abweichen. Im Formular lässt sich unter «Weitere Annahmen» ein eigener Satz erfassen; genaue Werte liefert der Steuerrechner der ESTV.'],
  ['Todesfall bei Paaren', 'PensCheck rechnet damit, dass beide Personen bis zum Planungshorizont leben. Stirbt eine Person früher, fällt eine AHV-Rente weg, und die Pensionskasse zahlt statt der Altersrente eine tiefere Ehegatten- oder Partnerrente. Dieses Szenario ist nicht gerechnet.'],
  ['Verkauf einer Liegenschaft', 'Vom Erlös werden 3% Kosten und die Hypothek abgezogen. Die Grundstückgewinnsteuer ist nicht eingerechnet; sie hängt von Kanton, Gewinn und Besitzdauer ab.'],
  ['Wohnkosten nach einem Verkauf', HINWEIS_VERKAUF_WOHNEN],
  ['AHV-Rente', 'Die Schätzung folgt der Rentenformel mit dem heutigen Lohn. Massgebend ist das Durchschnittseinkommen über alle Beitragsjahre, und die Rententabellen (Skala 44) rechnen in Einkommensstufen; der tatsächliche Betrag kann abweichen. Vorbezug und Aufschub sind nur in ganzen Jahren gerechnet. Bei Ehepaaren werden die Einkommen hälftig geteilt, sobald beide das Referenzalter erreicht haben; PensCheck teilt die heutigen Löhne und rechnet ohne Erziehungs- und Betreuungsgutschriften. Ohne erfassten Lohn gilt die Minimalrente. Die Summe beider Renten ist auf 150% der Maximalrente begrenzt (bei Beitragslücken entsprechend tiefer); Kürzung beim Vorbezug und Zuschlag beim Aufschub werden danach gerechnet. Der Rentenzuschlag für Frauen der Jahrgänge 1961 bis 1969 ohne Vorbezug ist eingerechnet.'],
  ['Steuer auf Kapitalbezügen', 'Gerechnet wird mit dem Tarif des Kantonshauptorts aus der Steuerbelastungsstatistik der ESTV (inkl. Bund, ohne Kirchensteuer). Bezüge im selben Jahr werden zusammengezählt. Für künftige Bezüge werden die Tarifstufen mit der Teuerung fortgeschrieben (Ausgleich der kalten Progression, wie bei der Vermögenssteuer); gleichen Bund oder Kanton die Teuerung nicht aus, fällt die Steuer höher aus.'],
  ['Bereits pensioniert', 'Liegt die Pensionierung zurück, gelten ein PK-Kapitalbezug und der Kapitalteil einer Teilpensionierung als erfolgt (sie gehören ins freie Vermögen) und heute erfasste Guthaben der Säule 3a und der Freizügigkeit als sofort fällig.'],
  ['AHV-Beiträge als Nichterwerbstätige', 'Zum Vermögen zählen auch Liegenschaften, hier zum Verkehrswert abzüglich Hypothek. Massgebend ist der meist tiefere Repartitionswert (Steuerwert mal Faktor des Kantons); die Beiträge sind insoweit eher zu hoch geschätzt. Zum Renteneinkommen zählen PK-Renten und bereits laufende AHV-Renten.'],
];
