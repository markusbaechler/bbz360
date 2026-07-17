// ============================================================================
// index-admin-parity.fixture.ts — v1-Feld-/Funktionsinventar für index + admin.
// VERBATIM extrahiert aus v1 (bbz-Dialog @ 225d8f2): index.html Z.270–718,
// admin.html Z.150–460. Grundlage des Paritäts-Gates analog MODAL-PARITÄT
// (ADR-12, DESIGN-SPEC §5.4): jedes gelistete v1-Element/-Verhalten MUSS im
// v2 existieren. Aenderung nur, wenn v1 selbst sich aendert.
//
// KLARSTELLUNGEN (Nachtrag-Verifikation gegen v1-Code):
// - admin "stripStyles beim Paste": v1 hat KEINEN Paste-Handler; stripStyles
//   laeuft in flushEditor/autoSave (an oninput). Paste loest input aus →
//   Speicherwert wird gestrippt. Gate prueft das VERHALTEN (styled HTML rein →
//   bbzAdmin-Content ohne Style).
// - index "Kundenbild": KEIN Kunden-Foto-Upload. "Kundenbild" ist der Modul-
//   Abschnitt (v1 MODULES.kundenbild = [05 Finanzcockpit, 06 Ziele]).
//   foto/foto_b64 betreffen ausschliesslich den Berater-Avatar im Picker.
// ============================================================================

// ── ADMIN: statische Pflicht-Elemente (Selektor → v1-Herkunft) ──────────────
export const ADMIN_PARITY = {
  // v1 24 Funktionen (Existenz via UI-Wirkung geprueft)
  static: [
    '#sidebarList',        // renderSidebar — MEHRERE Profile
    '#chTitle', '#chSubtitle', '#btnSave',
    '#fieldName', '#fieldTitel',       // onNameChange / onTitelChange
    '#fotoRow',                        // renderFotos — 3 Portraetfotos
    '#kachelTabs', '#kachelEditorWrap',
    '#fotoModalBg', '#fmTitle', '#fmImg', '#fmEmpty', '#fmBtnRemove', '#fmUpload', '#fotoFileInput',
    '#toast',
  ],
  counts: {
    '.ad-item': { min: 2 },            // MEHRERE Berater-Profile (loadProfiles: 5 aus berater.json)
    '.ad-foto': { eq: 3 },             // 3 Portraetfoto-Thumbs pro Profil
    '.ad-tab': { eq: 3 },              // 3 Kacheln pro Profil
  },
  // Rich-Text-Toolbar: v1 execCmd bold/italic/formatBlock-h3/formatBlock-p/insertUnorderedList
  toolbar: ['bold', 'italic', 'h3', 'p', 'ul'],
  editor: '#kachelEditor',
  titleInput: '#kachelTitleInput',
};

// ── INDEX: statische Pflicht-Elemente ───────────────────────────────────────
export const INDEX_PARITY = {
  static: [
    '#beraterPicker',                  // renderBeraterPicker
    '#p1name', '#p1geb', '#p2name', '#p2geb',   // Kundendaten / onKundeChange
    '#beratungsdatum', '#topbarDate',  // initDatum / setTopbarDate
    '#gridEinstieg', '#gridKundenbild', '#gridVertiefung', '#gridAbschluss', '#branchHint',
    '#readinessText', '#btnStart', '#footerDataInfo',   // updateReadiness
    '#btnReset', '#resetModal', '#resetConfirm', '#resetCancel',  // Neue Beratung / clearSession
    '#btnExport', '#importFile',       // NEU ADR-5 (Zusatz, keine v1-Simplifikation)
  ],
  counts: {
    '.ix-bopt': { min: 2 },            // MEHRERE Berater (Picker)
    '#gridEinstieg .ix-mod': { eq: 4 },   // 01–04
    '#gridKundenbild .ix-mod': { eq: 2 }, // 05–06 (= "Kundenbild"-Abschnitt)
    '#gridVertiefung .ix-mod': { eq: 2 }, // 07a/07b (BRANCHES)
    '#gridAbschluss .ix-mod': { eq: 3 },  // 08–10
  },
  // v1 module toggleable-Flags: 02/03/04/09 umschaltbar; 01/05/06/08/10 & Kundenbild-Pflicht
  toggleable: ['m02', 'm03', 'm04'],
  pflicht: ['Agenda', 'Finanzcockpit', 'Ziele & Wünsche'],
  branches: ['b07a', 'b07b'],
};
