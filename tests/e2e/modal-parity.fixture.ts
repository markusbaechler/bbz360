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
