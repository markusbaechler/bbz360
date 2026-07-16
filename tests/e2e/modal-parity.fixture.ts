// ============================================================================
// modal-parity.fixture.ts — v1-Feldinventar der Erfassungsmodale.
// VERBATIM extrahiert aus v1 buildForm()/save() (bbz-Dialog @ 225d8f2,
// 05_cockpit.html Z.974–1089). Grundlage des Gates MODAL-PARITÄT (ADR-12):
// jedes hier gelistete v1-Element MUSS im gerenderten v2-Modal existieren.
// Aenderung nur, wenn v1 selbst sich aendert — NICHT, um v2-Luecken zu kaschieren.
//
// Token-Konvention (== data-v1-field im v2-DOM):
//   f-<id>            Input/Select/Textarea
//   <key>|<val>       rb-/yesno-/Mehrweg-Button (data-rset|data-v)
//   tag|<label>       mehrfach wählbarer Kanal-Tag
// options: Select-id → alle v1-Optionswerte (option.value)
// extras:  Pflicht-Elemente ohne f-*-id (Live-Vorschau, konditionale Wrapper)
// ============================================================================

export interface ModalSpec {
  trigger: string;                       // Selektor, der das Modal öffnet
  fields: string[];                      // data-v1-field-Tokens
  options: Record<string, string[]>;     // selectId → Optionswerte
  extras: string[];                      // Pflicht-Element-ids (prevCF, Konditionale)
}

// ── 06 Ziele (v1 06_ziele.html buildZielBody/buildJahrSlider/Wunsch-Modal) ───
// Ziel-Modal: Inspirations-Chips je Kategorie (KATS verbatim), Bezeichnung,
// Zeithorizont (4 Wege, konditional Jahr-Kacheln bzw. Slider), Betrag, Prob
// (nur Ziele), Notiz, Löschen im Edit. Wunsch-Modal: 7 Kategorie-Chips,
// Name/Jahr/Betrag/Notiz, Löschen.
export const MODAL_PARITY_06 = {
  zielCommon: ['mz-nm', 'mz-bt', 'mz-nt', 'horizon|kurz', 'horizon|mittel', 'horizon|lang', 'horizon|offen'],
  zielProb: ['prob|moeglich', 'prob|wahrscheinlich', 'prob|sicher'],   // entfällt bei Zufluss (v1)
  inspProKat: {
    familie: ['Heirat / Hochzeit', 'Familienplanung / Nachwuchs', 'Ausbildung Kind', 'Scheidungsvorsorge', 'Erbschaftsplanung', 'Sonstiges'],
    wohnen: ['Erstwohnung kaufen', 'Renovation / Umbau', 'Zweitwohnung / Ferienhaus', 'Liegenschaft verkaufen', 'Umzug / Verkleinerung', 'Sonstiges'],
    karriere: ['Selbständigkeit / Firmengründung', 'Frühpensionierung', 'Teilzeitanstellung', 'Sabbatical', 'Weiterbildung / Studium', 'Sonstiges'],
    freizeit: ['Weltreise', 'Reisen & Ferien', 'Boot / Segelschiff', 'Ferienwohnung', 'Hobby vertiefen', 'Sonstiges'],
    vermoegen: ['Liquidität aufbauen (Sparziel)', 'Anlageziel Wertschriften', 'Schulden abbauen', 'Vorsorgelücke schliessen', 'Vermögen strukturieren', 'Sonstiges'],
    vorsorge: ['BVG-Einkauf', 'Säule 3a aufbauen', 'Testament / Vorsorgeauftrag', 'Lebensversicherung', 'Invaliditätsschutz', 'Todesfallkapital sichern', 'Kinderrente', 'Pflegevorsorge', 'Sonstiges'],
    anschaffungen: ['Auto / Fahrzeug', 'Einrichtung / Möbel', 'Elektromobilität', 'Luxusobjekt', 'Technologie / Ausrüstung', 'Sonstiges'],
    zufluss: ['Erbschaft / Legat', 'Schenkung', 'Kapitalleistung BVG', 'Auszahlung Säule 3a / 3b', 'Verkauf (Liegenschaft, Firma, Depot)', 'Versicherungsleistung', 'Sonstiges'],
  } as Record<string, string[]>,
  wunsch: ['w-name', 'w-jahr', 'w-betrag', 'w-notiz',
    'wkat|familie', 'wkat|wohnen', 'wkat|karriere', 'wkat|freizeit', 'wkat|vermoegen', 'wkat|vorsorge', 'wkat|anschaffungen'],
};

export const MODAL_PARITY: Record<string, ModalSpec> = {
  zahlen: {
    trigger: '#br-zahlen',
    fields: ['f-bank', 'f-saldo', 'f-konten', 'f-banken',
      'tag|Klassisch', 'tag|eBanking', 'tag|Mobile Banking', 'tag|Bargeldlos', 'f-kommentar'],
    options: {},
    extras: [],
  },
  sparen: {
    trigger: '#br-sparen',
    fields: ['f-saldo', 'f-banken', 'f-konten', 'f-reserve',
      'sparen__sichergestellt|ja', 'sparen__sichergestellt|nein',
      'f-quoteBetrag', 'f-qFreq',
      'sparen__quoteTyp|positiv', 'sparen__quoteTyp|neutral', 'sparen__quoteTyp|negativ', 'f-kommentar'],
    options: { 'f-qFreq': ['mtl', 'pa'] },
    extras: [],
  },
  vorsorgen: {
    trigger: '#br-vorsorgen',
    fields: ['vorsorgen__pkBekannt|ja', 'vorsorgen__pkBekannt|nein', 'f-pkSaldo',
      'vorsorgen__pkEinkaeufe|ja', 'vorsorgen__pkEinkaeufe|nein',
      'vorsorgen__pkAusbezahlt|ja', 'vorsorgen__pkAusbezahlt|nein', 'f-s3Saldo',
      'vorsorgen__s3Form|Konto', 'vorsorgen__s3Form|Wertschriften', 'vorsorgen__s3Form|Gemischt',
      'f-s3Konten', 'f-s3Banken',
      'vorsorgen__s3Einz|nein', 'vorsorgen__s3Einz|maximal', 'vorsorgen__s3Einz|anderer', 'f-s3EinzB',
      'vorsorgen__s3Strategie|Unbekannt', 'vorsorgen__s3Strategie|Einkommen', 'vorsorgen__s3Strategie|Ausgewogen',
      'vorsorgen__s3Strategie|Wachstum', 'vorsorgen__s3Strategie|Dynamisch', 'f-kommentar'],
    options: {},
    extras: ['s3bw', 'strat-wrap'],
  },
  anlegen: {
    trigger: '#br-anlegen',
    fields: ['anlegen__vorhanden|ja', 'anlegen__vorhanden|nein', 'f-volumen',
      'anlegen__strategie|Unbekannt', 'anlegen__strategie|Einkommen', 'anlegen__strategie|Ausgewogen',
      'anlegen__strategie|Wachstum', 'anlegen__strategie|Dynamisch',
      'anlegen__typ|selbstorganisiert', 'anlegen__typ|Beratungsdepot',
      'anlegen__typ|Vermögensverwaltung', 'anlegen__typ|Verschiedene', 'f-kommentar'],
    options: {},
    extras: [],
  },
  ausgaben: {
    trigger: '#cfr-eink',
    fields: ['ausgaben__freq|mtl', 'ausgaben__freq|pa', 'ausgaben__typ|netto', 'ausgaben__typ|brutto',
      'f-eMann', 'f-eFrau', 'f-haushalt', 'f-leasing', 'f-unterhalt', 'f-uebrige', 'f-kommentar'],
    options: {},
    extras: ['cf-prev', 'cf-hint', 'cf-eff'],
  },
  finanzieren: {
    trigger: '#cfr-fin',
    fields: ['finanzieren__vorhanden|ja', 'finanzieren__vorhanden|nein', 'f-betrag', 'f-form', 'f-laufzeit', 'f-kommentar'],
    options: { 'f-form': ['Hypothek', 'Andere'], 'f-laufzeit': ['<1', '1-2', '>3'] },
    extras: [],
  },
};
