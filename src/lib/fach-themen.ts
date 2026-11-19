// Themen zum Vormerken in den Fachmodulen 07d Steuern und 07f Nachlass (Gesprächsführung ohne Rechnung).
// DOM-frei: Das Modul zeigt sie als Liste, der Abschluss (10) nennt die vorgemerkten im Bericht.
export interface ThemaDef { id: string; titel: string; text: string }

export const STEUER_THEMEN: ThemaDef[] = [
  { id: 'staffeln', titel: 'Kapitalbezüge auf mehrere Jahre verteilen', text: 'Mehrere 3a-Konten, Teilpensionierung, Freizügigkeit getrennt beziehen; Reglement der Pensionskasse prüfen.' },
  { id: 'rentekapital', titel: 'Rente oder Kapital', text: 'Die Rente wird als Einkommen besteuert, das Kapital einmalig zum Sondertarif.' },
  { id: 'einkauf', titel: 'Einkauf in die Pensionskasse', text: 'Einkaufspotenzial laut Vorsorgeausweis; Sperrfrist von drei Jahren für Kapitalbezüge beachten.' },
  { id: 's3a', titel: 'Säule 3a ausschöpfen', text: 'Jährlicher Höchstbetrag; Beitragslücken ab 2025 lassen sich unter Bedingungen nachträglich schliessen.' },
  { id: 'unterhalt', titel: 'Liegenschaftsunterhalt planen', text: 'Grössere Arbeiten auf Jahre mit hohem Einkommen legen. Der Abzug gilt, solange der Eigenmietwert besteuert wird; die Abschaffung ist auf 2029 angesetzt.' },
  { id: 'wohnsitz', titel: 'Wohnsitz bei der Pensionierung', text: 'Die Steuer auf Kapitalbezügen unterscheidet sich je Kanton und Gemeinde deutlich.' },
  { id: 'schenkung', titel: 'Schenkung oder Erbvorbezug', text: 'Erbschafts- und Schenkungssteuer je nach Kanton und Verwandtschaftsgrad.' },
];

export const NACHLASS_THEMEN: ThemaDef[] = [
  { id: 'testament', titel: 'Testament', text: 'Frei verfügbare Quote zuweisen, Teilungsvorschriften, Willensvollstreckung.' },
  { id: 'ehevertrag', titel: 'Ehevertrag', text: 'Güterstand und Zuweisung des Vorschlags; wirkt vor der Erbteilung.' },
  { id: 'erbvertrag', titel: 'Erbvertrag', text: 'Verbindliche Regelung mit den Erben, auch Erbverzicht.' },
  { id: 'vorsorgeauftrag', titel: 'Vorsorgeauftrag', text: 'Wer handelt bei Urteilsunfähigkeit: Personensorge, Vermögenssorge, Rechtsverkehr.' },
  { id: 'patientenverfuegung', titel: 'Patientenverfügung', text: 'Medizinische Massnahmen und Vertretung bei Urteilsunfähigkeit.' },
  { id: 'beguenstigung', titel: 'Begünstigung Pensionskasse und Säule 3a', text: 'Begünstigtenordnung prüfen; Konkubinatspartner der Vorsorgeeinrichtung melden.' },
  { id: 'schenkung', titel: 'Schenkung oder Erbvorbezug', text: 'Zu Lebzeiten weitergeben; Ausgleichung unter den Erben und Tragbarkeit im eigenen Plan prüfen.' },
  { id: 'vollmachten', titel: 'Vollmachten und Zugänge', text: 'Bankvollmachten, digitale Zugänge, Aufbewahrungsort der Dokumente.' },
];

/** Titel der vorgemerkten Themen eines Moduls, in der Reihenfolge der Liste. */
export function vorgemerkt(defs: ThemaDef[], stand: unknown): string[] {
  const t = stand && typeof stand === 'object' ? (stand as { themen?: unknown }).themen : null;
  const themen = t && typeof t === 'object' ? (t as Record<string, unknown>) : {};
  return defs.filter((d) => themen[d.id] === true).map((d) => d.titel);
}
