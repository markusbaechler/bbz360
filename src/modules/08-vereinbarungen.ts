// ============================================================================
// 08-vereinbarungen.ts — Archetyp G (Gefuehrter Prozess/Wizard).
// Vollstaendiger Port von v1 08_vereinbarungen.html (alle 34 Funktionen):
// 4 Phasen Erfassen -> Priorisieren -> Planen -> Abschluss, In-Content-Stepper.
// ============================================================================
import '../styles/theme.css';
import '../styles/modules/08-vereinbarungen.css';
import { BBZ } from '../lib/data';
import { mountNav } from '../lib/nav';
import { fmtDate } from '../lib/format';

// ── Typen ───────────────────────────────────────────────────────────────────
type Prio = 'sofort' | 'demnaechst' | 'gelegentlich' | null;
interface StepFields { wer: string; was: string; wann: string; wannChip: string | null; }
interface Agreement {
  id: string; sparte: string; reifegrad: string; reifegradLabel: string; text: string;
  prioritaet: Prio;
  stepWer: string; stepWas: string; stepWann: string; stepWannChip: string | null;
  keineAktivitaet: boolean; keineAktivitaetGrund: string; extraSteps: StepFields[];
}

// ── Konstanten (verbatim aus v1) ─────────────────────────────────────────────
const SPARTEN = ['Zahlen', 'Sparen', 'Vorsorgen', 'Anlegen', 'Finanzieren', 'Sonstiges'];
const REIFEGRADE = [
  { id: 'ueberblick', label: 'Überblick schaffen' },
  { id: 'optionen', label: 'Optionen prüfen' },
  { id: 'entscheid', label: 'Entscheid festhalten' },
  { id: 'umsetzung', label: 'Umsetzung starten' },
  { id: 'optimieren', label: 'Bestehendes optimieren' },
];
const WANN_CHIPS = [
  { id: 'woche', label: 'Diese Woche' },
  { id: 'monat', label: 'Diesen Monat' },
  { id: 'jahr', label: 'Dieses Jahr' },
];
const PRIO_ORDER: Record<string, number> = { sofort: 0, demnaechst: 1, gelegentlich: 2 };
const PHASE_LABELS = ['Erfassen', 'Priorisieren', 'Planen', 'Abschluss'];
const DEFAULT_ACTIONS: Record<string, string> = {
  Vorsorgen: 'Unterlagen sichten und Eröffnung vorbereiten',
  Anlegen: 'Depoteröffnung oder Zeichnung koordinieren',
  Finanzieren: 'Offerte erstellen und Unterlagen einfordern',
  Sparen: 'Sparauftrag einrichten',
  Zahlen: 'Kontoeröffnung auslösen',
  Sonstiges: 'Nächste Massnahme konkretisieren',
};
const SUGGESTIONS: Record<string, string> = {
  'Zahlen|ueberblick': 'Überblick über Konten, Zahlungsverkehr und laufende Kosten schaffen',
  'Zahlen|optionen': 'Möglichkeiten zur Vereinfachung des Zahlungsverkehrs und der Kontostruktur prüfen',
  'Zahlen|entscheid': 'Passende Konto- und Kartenlösung auswählen und Entscheid festhalten',
  'Zahlen|umsetzung': 'Passende Kontolösung eröffnen und in Betrieb nehmen',
  'Zahlen|optimieren': 'Bestehende Kontostruktur vereinfachen und Kontoführungskosten optimieren',
  'Sparen|ueberblick': 'Sparverhalten und mögliche Sparlösungen im Überblick besprechen',
  'Sparen|optionen': 'Verschiedene Sparmöglichkeiten und Zinskonditionen vergleichen',
  'Sparen|entscheid': 'Passende Sparlösung und Zielbetrag festlegen',
  'Sparen|umsetzung': 'Sparplan konkret starten und Dauerauftrag einrichten',
  'Sparen|optimieren': 'Bestehende Sparlösung an das heutige Sparziel anpassen',
  'Vorsorgen|ueberblick': 'Überblick über die heutige Vorsorgesituation und mögliche Handlungsfelder schaffen',
  'Vorsorgen|optionen': 'Vorsorgemöglichkeiten und Steueroptimierungspotenzial in der 2. und 3. Säule prüfen',
  'Vorsorgen|entscheid': 'Passende Vorsorgelösung auswählen und Entscheid festhalten',
  'Vorsorgen|umsetzung': 'Vorsorgelösung konkret einrichten und ersten Einzahlungsauftrag auslösen',
  'Vorsorgen|optimieren': 'Zusätzliches 3a-Konto zur Verbesserung der Steuersituation einrichten',
  'Anlegen|ueberblick': 'Überblick über bestehende Anlagen, Risikoprofil und mögliche Optimierungen schaffen',
  'Anlegen|optionen': 'Anlagemöglichkeiten und passendes Risikoprofil gemeinsam prüfen',
  'Anlegen|entscheid': 'Bevorzugte Anlagestrategie eingrenzen und Entscheid vorbereiten',
  'Anlegen|umsetzung': 'Anlagelösung konkret einrichten und ersten Schritt auslösen',
  'Anlegen|optimieren': 'Bestehende Anlagelösung an heutiges Zielbild und Risikoprofil anpassen',
  'Finanzieren|ueberblick': 'Finanzierungssituation, Tragbarkeit und mögliche Varianten transparent machen',
  'Finanzieren|optionen': 'Hypothekarvarianten, Laufzeiten und Konditionen vergleichen',
  'Finanzieren|entscheid': 'Bevorzugte Finanzierungsvariante festlegen und nächste Schritte definieren',
  'Finanzieren|umsetzung': 'Finanzierungsantrag auslösen und notwendige Unterlagen zusammenstellen',
  'Finanzieren|optimieren': 'Bestehende Hypothek auf Optimierungspotenzial bei Verlängerung oder Umstrukturierung prüfen',
  'Sonstiges|ueberblick': 'Überblick über die besprochenen Themen und offene Punkte schaffen',
  'Sonstiges|optionen': 'Mögliche Lösungsansätze zum besprochenen Thema prüfen',
  'Sonstiges|entscheid': 'Entscheid zum besprochenen Punkt festhalten',
  'Sonstiges|umsetzung': 'Nächste konkrete Massnahme einleiten',
  'Sonstiges|optimieren': 'Bestehende Lösung überprüfen und Verbesserungspotenzial identifizieren',
};

const prioLabel = (p: Prio): string =>
  p === 'sofort' ? 'Sofort' : p === 'demnaechst' ? 'Demnächst' : p === 'gelegentlich' ? 'Gelegentlich' : '–';
const wannChipLabel = (id: string | null): string => WANN_CHIPS.find((c) => c.id === id)?.label || '';
const esc = (s: string): string =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const uid = (): string => Math.random().toString(36).slice(2, 9) + (agreements.length + 1);

// ── State ────────────────────────────────────────────────────────────────────
let phase = 1;
let editingId: string | null = null;
let selectedSparte: string | null = null;
let selectedReifegrad: string | null = null;
let agreements: Agreement[] = [];
let beraterName = 'Berater:in';

const el = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;

// ── Persistenz ───────────────────────────────────────────────────────────────
function save(): void {
  const flat = agreements.map((a) => ({
    sparte: a.sparte, reifegrad: a.reifegrad, text: a.text, prioritaet: a.prioritaet,
    stepWer: a.stepWer, stepWas: a.stepWas, stepWann: a.stepWann,
    keineAktivitaet: a.keineAktivitaet, keineAktivitaetGrund: a.keineAktivitaetGrund,
  }));
  BBZ.merge({ vereinbarungen_v1: { agreements, phase }, vereinbarungen: flat });
}

function load(): void {
  const v1 = BBZ.get('vereinbarungen_v1') as { agreements?: unknown[]; phase?: number } | null;
  if (v1 && Array.isArray(v1.agreements)) {
    agreements = v1.agreements.map((raw) => {
      const a = raw as Partial<Agreement>;
      return {
        id: a.id || uid(), sparte: a.sparte || '', reifegrad: a.reifegrad || '',
        reifegradLabel: a.reifegradLabel || REIFEGRADE.find((r) => r.id === a.reifegrad)?.label || '',
        text: a.text || '', prioritaet: (a.prioritaet as Prio) ?? null,
        stepWer: a.stepWer || 'Berater:in', stepWas: a.stepWas || '', stepWann: a.stepWann || '',
        stepWannChip: a.stepWannChip ?? null, keineAktivitaet: !!a.keineAktivitaet,
        keineAktivitaetGrund: a.keineAktivitaetGrund || '',
        extraSteps: Array.isArray(a.extraSteps)
          ? a.extraSteps.map((s) => ({ wer: s.wer || 'Berater:in', was: s.was || '', wann: s.wann || '', wannChip: s.wannChip ?? null }))
          : [],
      };
    });
    phase = v1.phase && v1.phase <= 4 ? v1.phase : 1;
  }
  const bn = BBZ.get('beraterName');
  if (typeof bn === 'string' && bn) beraterName = bn;
  const img = BBZ.get('vereinbarungenHeroImage');
  if (typeof img === 'string' && img) (el('phaseImg') as HTMLImageElement).src = img;
}

// ── Phase 1: Erfassen ────────────────────────────────────────────────────────
function renderChips(): void {
  const sc = el('sparteChips'), rc = el('reifegradChips'), wrap = el('reifegradWrap');
  sc.innerHTML = ''; rc.innerHTML = '';
  SPARTEN.forEach((s) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'wz-chip' + (selectedSparte === s ? ' sel' : '');
    b.textContent = s;
    b.onclick = () => {
      selectedSparte = selectedSparte === s ? null : s;
      selectedReifegrad = null;
      renderChips(); updateHint(); updateAddBtn();
    };
    sc.appendChild(b);
  });
  wrap.hidden = !selectedSparte;
  REIFEGRADE.forEach((r) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'wz-chip' + (selectedReifegrad === r.id ? ' sel' : '');
    b.textContent = r.label;
    b.onclick = () => {
      selectedReifegrad = selectedReifegrad === r.id ? null : r.id;
      renderChips(); updateHint(); updateAddBtn();
    };
    rc.appendChild(b);
  });
}

function updateHint(): void {
  const hint = el('hintText'), ta = el('vereinbarungText') as HTMLTextAreaElement;
  if (!selectedSparte || !selectedReifegrad) {
    hint.textContent = 'Thema und Fokus wählen für einen Vorschlag.';
    hint.className = 'wz-hint'; hint.onclick = null;
    ta.placeholder = 'Vereinbarung formulieren…';
    return;
  }
  const sug = SUGGESTIONS[`${selectedSparte}|${selectedReifegrad}`];
  if (sug) {
    ta.placeholder = sug;
    hint.textContent = '→ Vorschlag übernehmen';
    hint.className = 'wz-hint has-hint';
    hint.onclick = () => { ta.value = sug; updateAddBtn(); };
  } else {
    hint.textContent = 'Frei formulieren.'; hint.className = 'wz-hint'; hint.onclick = null;
  }
}

function updateAddBtn(): void {
  const txt = (el('vereinbarungText') as HTMLTextAreaElement).value.trim();
  const btn = el('addBtn') as HTMLButtonElement;
  btn.disabled = !(selectedSparte && selectedReifegrad && txt.length > 0);
  btn.textContent = editingId ? 'Änderung speichern' : 'Festhalten';
}

function resetForm(clearAll: boolean): void {
  if (clearAll) { selectedSparte = null; selectedReifegrad = null; }
  (el('vereinbarungText') as HTMLTextAreaElement).value = '';
  renderChips(); updateHint(); updateAddBtn();
}

function addOrUpdateAgreement(): void {
  const text = (el('vereinbarungText') as HTMLTextAreaElement).value.trim();
  if (!selectedSparte || !selectedReifegrad || !text) return;
  const reifegradLabel = REIFEGRADE.find((r) => r.id === selectedReifegrad)?.label || selectedReifegrad;
  if (editingId) {
    const item = agreements.find((a) => a.id === editingId);
    if (item) { item.sparte = selectedSparte; item.reifegrad = selectedReifegrad; item.reifegradLabel = reifegradLabel; item.text = text; }
    editingId = null; el('editingBadge').hidden = true;
  } else {
    agreements.push({
      id: uid(), sparte: selectedSparte, reifegrad: selectedReifegrad, reifegradLabel, text,
      prioritaet: null, stepWer: 'Berater:in', stepWas: '', stepWann: '', stepWannChip: null,
      keineAktivitaet: false, keineAktivitaetGrund: '', extraSteps: [],
    });
  }
  resetForm(false); renderAgreementList(); updatePhaseButton(); save();
}

function editAgreement(id: string): void {
  const item = agreements.find((a) => a.id === id);
  if (!item) return;
  editingId = id; selectedSparte = item.sparte; selectedReifegrad = item.reifegrad;
  (el('vereinbarungText') as HTMLTextAreaElement).value = item.text;
  el('editingBadge').hidden = false;
  renderChips(); updateHint(); updateAddBtn();
}

function deleteAgreement(id: string): void {
  agreements = agreements.filter((a) => a.id !== id);
  if (editingId === id) { editingId = null; el('editingBadge').hidden = true; resetForm(true); }
  renderAgreementList(); updatePhaseButton(); save();
}

function renderAgreementList(): void {
  const list = el('agreementList'), empty = el('emptyState');
  list.innerHTML = '';
  empty.hidden = agreements.length > 0;
  agreements.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'wz-card' + (editingId === item.id ? ' editing' : '');
    card.innerHTML = `
      <div class="wz-card-body">
        <div class="wz-tags"><span class="wz-tag">${esc(item.sparte)}</span><span class="wz-tag wz-tag--soft">${esc(item.reifegradLabel)}</span></div>
        <div class="wz-card-text">${esc(item.text)}</div>
      </div>
      <div class="wz-card-actions edit-only">
        <button class="ag-del" type="button" data-act="edit" data-id="${item.id}" title="Bearbeiten" aria-label="Bearbeiten">✎</button>
        <button class="ag-del" type="button" data-act="del" data-id="${item.id}" title="Löschen" aria-label="Löschen">✕</button>
      </div>`;
    list.appendChild(card);
  });
}

// ── Phase 2: Priorisieren ────────────────────────────────────────────────────
function renderPrioList(): void {
  const c = el('prioList'); c.innerHTML = '';
  agreements.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'wz-card';
    const mk = (p: Prio, label: string) =>
      `<button class="wz-prio wz-prio--${p}${item.prioritaet === p ? ' sel' : ''}" type="button" data-id="${item.id}" data-prio="${p}">${label}</button>`;
    card.innerHTML = `
      <div class="wz-card-body">
        <div class="wz-tags"><span class="wz-tag">${esc(item.sparte)}</span><span class="wz-tag wz-tag--soft">${esc(item.reifegradLabel)}</span></div>
        <div class="wz-card-text">${esc(item.text)}</div>
      </div>
      <div class="wz-prio-btns">${mk('sofort', 'Sofort')}${mk('demnaechst', 'Demnächst')}${mk('gelegentlich', 'Gelegentlich')}</div>`;
    c.appendChild(card);
  });
}

function setPrio(id: string, prio: Exclude<Prio, null>): void {
  const item = agreements.find((a) => a.id === id);
  if (!item) return;
  item.prioritaet = item.prioritaet === prio ? null : prio;
  save(); renderPrioList();
}

// ── Phase 3: Planen ──────────────────────────────────────────────────────────
const sortedAgreements = (): Agreement[] =>
  [...agreements].sort((a, b) => (PRIO_ORDER[a.prioritaet ?? ''] ?? 3) - (PRIO_ORDER[b.prioritaet ?? ''] ?? 3));

function stepFieldsHtml(item: Agreement, stepIdx: number): string {
  const isMain = stepIdx === 0;
  const extra = isMain ? null : item.extraSteps[stepIdx - 1];
  const wer = isMain ? item.stepWer : extra!.wer;
  const was = isMain ? item.stepWas : extra!.was;
  const wann = isMain ? item.stepWann : extra!.wann;
  const chip = isMain ? item.stepWannChip : extra!.wannChip;
  const werOptions = [beraterName, 'Kund:in', 'Gemeinsam'];
  const defAction = DEFAULT_ACTIONS[item.sparte] || 'Nächste Massnahme festhalten';
  return `
    <div class="wz-step-fields"${item.keineAktivitaet ? ' style="opacity:.35;pointer-events:none;"' : ''}>
      <div class="field"><label>Wer</label>
        <select class="input" data-id="${item.id}" data-step="${stepIdx}" data-field="wer">
          ${werOptions.map((w) => `<option value="${esc(w)}"${wer === w ? ' selected' : ''}>${esc(w)}</option>`).join('')}
        </select></div>
      <div class="field"><label>Was</label>
        <input class="input" type="text" value="${esc(was)}" placeholder="${esc(defAction)}" data-id="${item.id}" data-step="${stepIdx}" data-field="was"></div>
      <div class="field wz-wann"><label>Wann</label>
        <div class="chip-row wz-wann-chips">
          ${WANN_CHIPS.map((c) => `<button class="wz-chip wz-chip--sm${chip === c.id ? ' sel' : ''}" type="button" data-id="${item.id}" data-step="${stepIdx}" data-chip="${c.id}">${c.label}</button>`).join('')}
        </div>
        <input class="input wz-date" type="date" value="${esc(wann)}" data-id="${item.id}" data-step="${stepIdx}" data-field="wann"></div>
    </div>`;
}

function renderStepsList(): void {
  const c = el('stepsList'); c.innerHTML = '';
  sortedAgreements().forEach((item) => {
    const total = 1 + item.extraSteps.length;
    const canAdd = total < 3;
    const card = document.createElement('div');
    card.className = 'wz-card wz-step-card';
    // Kopf: dominante Vereinbarungszeile, Meta-Chips darueber, Prio-Badge oben rechts.
    let html = `
      <div class="wz-step-head">
        <div class="wz-step-headmain">
          <div class="wz-meta"><span class="wz-tag wz-tag--soft">${esc(item.sparte)}</span><span class="wz-tag wz-tag--soft">${esc(item.reifegradLabel)}</span></div>
          <div class="wz-card-text">${esc(item.text)}</div>
        </div>
        ${item.prioritaet ? `<span class="wz-prio-badge wz-prio-badge--${item.prioritaet}">${prioLabel(item.prioritaet)}</span>` : ''}
      </div>`;
    if (total > 1) html += `<div class="wz-step-num">Schritt 1</div>`;
    html += stepFieldsHtml(item, 0);
    item.extraSteps.forEach((_, i) => {
      html += `<div class="wz-step-num">Schritt ${i + 2}<button class="wz-step-rm edit-only" type="button" data-id="${item.id}" data-rm="${i}" aria-label="Schritt entfernen">✕</button></div>`;
      html += stepFieldsHtml(item, i + 1);
    });
    if (!item.keineAktivitaet) {
      html += `<button class="btn btn--ghost wz-add-step edit-only" type="button" data-id="${item.id}" data-act="addstep"${canAdd ? '' : ' disabled'}>${canAdd ? '+ Schritt hinzufügen' : 'Max. 3 Schritte'}</button>`;
    }
    // "Kein Handlungsbedarf" ans ENDE, durch feine Linie abgetrennt.
    html += `
      <div class="wz-noaction-row">
        <label class="wz-noaction"><input type="checkbox" data-id="${item.id}" data-act="noaction"${item.keineAktivitaet ? ' checked' : ''}> Kein Handlungsbedarf momentan</label>
        <input class="input wz-noaction-reason" type="text" placeholder="Notiz oder Wiedervorlage…" value="${esc(item.keineAktivitaetGrund)}" data-id="${item.id}" data-field="grund"${item.keineAktivitaet ? '' : ' hidden'}>
      </div>`;
    card.innerHTML = html;
    c.appendChild(card);
  });
}

function setWannChip(id: string, stepIdx: number, chipId: string): void {
  const item = agreements.find((a) => a.id === id);
  if (!item) return;
  if (stepIdx === 0) item.stepWannChip = item.stepWannChip === chipId ? null : chipId;
  else if (item.extraSteps[stepIdx - 1]) {
    const s = item.extraSteps[stepIdx - 1];
    s.wannChip = s.wannChip === chipId ? null : chipId;
  }
  save(); renderStepsList();
}

function updateStepField(id: string, stepIdx: number, field: string, value: string): void {
  const item = agreements.find((a) => a.id === id);
  if (!item) return;
  if (stepIdx === 0) {
    if (field === 'wer') item.stepWer = value;
    else if (field === 'was') item.stepWas = value;
    else if (field === 'wann') item.stepWann = value;
  } else if (item.extraSteps[stepIdx - 1]) {
    const s = item.extraSteps[stepIdx - 1];
    if (field === 'wer') s.wer = value;
    else if (field === 'was') s.was = value;
    else if (field === 'wann') s.wann = value;
  }
  save();
}

function addExtraStep(id: string): void {
  const item = agreements.find((a) => a.id === id);
  if (!item || item.extraSteps.length >= 2) return;
  item.extraSteps.push({ wer: 'Berater:in', was: '', wann: '', wannChip: null });
  save(); renderStepsList();
}
function removeExtraStep(id: string, idx: number): void {
  const item = agreements.find((a) => a.id === id);
  if (!item) return;
  item.extraSteps.splice(idx, 1); save(); renderStepsList();
}
function toggleNoAction(id: string, checked: boolean): void {
  const item = agreements.find((a) => a.id === id);
  if (!item) return;
  item.keineAktivitaet = checked;
  if (!checked) item.keineAktivitaetGrund = '';
  save(); renderStepsList();
}

// ── Phase 4: Abschluss ───────────────────────────────────────────────────────
function wannText(chip: string | null, wann: string): string {
  return chip ? wannChipLabel(chip) + (wann ? ', ' + fmtDate(wann) : '') : wann ? fmtDate(wann) : '–';
}
function renderAbschluss(): void {
  el('abschlussName').textContent = beraterName !== 'Berater:in' ? `Beratung mit ${beraterName}` : 'Beratungsgespräch';
  const grid = el('abschlussGrid');
  let html = '<div class="wz-ab-head">Was wir festgehalten haben</div><div class="wz-ab-head">Wie es weitergeht</div>';
  sortedAgreements().forEach((item) => {
    html += `<div class="wz-ab-item">
      <div class="wz-tags"><span class="wz-tag wz-tag--white">${esc(item.sparte)}</span><span class="wz-tag wz-tag--white">${esc(item.reifegradLabel)}</span>${item.prioritaet ? `<span class="wz-tag wz-tag--white">${prioLabel(item.prioritaet)}</span>` : ''}</div>
      <div class="wz-ab-text">${esc(item.text)}</div></div>`;
    if (item.keineAktivitaet) {
      html += `<div class="wz-ab-item"><div class="wz-ab-text wz-ab-none">Kein Handlungsbedarf momentan</div>${item.keineAktivitaetGrund ? `<div class="wz-ab-step">${esc(item.keineAktivitaetGrund)}</div>` : ''}</div>`;
    } else {
      const steps = [
        { wer: item.stepWer || beraterName, was: item.stepWas || DEFAULT_ACTIONS[item.sparte] || '–', wann: wannText(item.stepWannChip, item.stepWann) },
        ...item.extraSteps.map((s) => ({ wer: s.wer || beraterName, was: s.was || '–', wann: wannText(s.wannChip, s.wann) })),
      ];
      const nums = steps.length > 1;
      html += '<div class="wz-ab-item">';
      steps.forEach((s, i) => {
        if (nums) html += `<div class="wz-ab-stepnum">SCHRITT ${i + 1}</div>`;
        html += `<div class="wz-ab-step"><strong>Was:</strong> ${esc(s.was)}</div><div class="wz-ab-step"><strong>Wer:</strong> ${esc(s.wer)}</div><div class="wz-ab-step"><strong>Wann:</strong> ${esc(s.wann)}</div>`;
      });
      html += '</div>';
    }
  });
  grid.innerHTML = html;
}

function resetAll(): void {
  agreements = []; phase = 1; editingId = null; selectedSparte = null; selectedReifegrad = null;
  save(); resetForm(true); renderAgreementList(); applyPhase();
}

// ── Phasen-Navigation ────────────────────────────────────────────────────────
function updatePhaseButton(): void {
  if (phase === 1) (el('btnForward') as HTMLButtonElement).disabled = agreements.length === 0;
}

function applyPhase(): void {
  for (let p = 1; p <= 4; p++) el('phase' + p).hidden = p !== phase;
  // Prozess-Stepper: Fortschrittslinie, Kreis-Zustaende (✓/Ziffer), Kontextzeile.
  el('wzCtx').textContent = `Phase ${phase} von 4 — ${PHASE_LABELS[phase - 1]}`;
  (el('wzFill') as HTMLElement).style.width = `${(phase - 1) * 25}%`;
  document.querySelectorAll<HTMLButtonElement>('#wzPhases .wz-step').forEach((step) => {
    const p = Number(step.dataset.phase);
    const done = p < phase;
    step.classList.toggle('active', p === phase);
    step.classList.toggle('done', done);
    step.dataset.clickable = done ? '1' : ''; // nur erledigte sind rueck-navigierbar
    step.setAttribute('aria-current', p === phase ? 'step' : 'false');
    (step.querySelector('.wz-step-circle') as HTMLElement).textContent = done ? '✓' : String(p);
  });
  const back = el('btnBack') as HTMLButtonElement;
  const fwd = el('btnForward') as HTMLButtonElement;
  back.hidden = phase === 1;
  fwd.hidden = phase === 4;
  if (phase < 4) fwd.textContent = `Weiter zu ${PHASE_LABELS[phase]} →`;
  if (phase === 1) { updatePhaseButton(); }
  else fwd.disabled = false;
  if (phase === 2) renderPrioList();
  else if (phase === 3) renderStepsList();
  else if (phase === 4) renderAbschluss();
}

function goForward(): void {
  if (phase === 1 && agreements.length === 0) return;
  if (phase < 4) { phase++; save(); applyPhase(); }
}
function goBack(): void {
  if (phase > 1) { phase--; save(); applyPhase(); }
}
function gotoPhase(target: number): void {
  // Freie Rueck-Navigation ueber Stepper; vorwaerts nur ueber Button (Validierung).
  if (target < phase) { phase = target; save(); applyPhase(); }
}

// ── Init + Event-Wiring (Delegation) ─────────────────────────────────────────
function init(): void {
  mountNav(el('bbzNav'), { activeId: '08' });
  const toggle = el('editToggle') as HTMLButtonElement;
  toggle.addEventListener('click', () => {
    const on = document.body.classList.toggle('edit-mode');
    toggle.setAttribute('aria-pressed', String(on));
  });

  load();
  renderChips(); updateHint(); updateAddBtn(); renderAgreementList();

  // Phase 1 Formular
  el('vereinbarungText').addEventListener('input', updateAddBtn);
  el('addBtn').addEventListener('click', addOrUpdateAgreement);
  el('resetBtn').addEventListener('click', () => {
    if (editingId) { editingId = null; el('editingBadge').hidden = true; }
    resetForm(true);
  });

  // Hero-Bild (edit-only)
  el('phaseImgBtn').addEventListener('click', () => (el('phaseImgInput') as HTMLInputElement).click());
  el('phaseImgInput').addEventListener('change', function (this: HTMLInputElement) {
    const file = this.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target?.result;
      if (typeof url === 'string') { (el('phaseImg') as HTMLImageElement).src = url; BBZ.merge({ vereinbarungenHeroImage: url }); }
    };
    reader.readAsDataURL(file);
    this.value = '';
  });

  // Agreement-Liste (edit/delete) — Delegation
  el('agreementList').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!b) return;
    const id = b.dataset.id!;
    if (b.dataset.act === 'edit') editAgreement(id);
    else if (b.dataset.act === 'del') deleteAgreement(id);
  });

  // Prio-Buttons — Delegation
  el('prioList').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-prio]');
    if (b) setPrio(b.dataset.id!, b.dataset.prio as Exclude<Prio, null>);
  });

  // Steps — Delegation (click + input/change)
  const steps = el('stepsList');
  steps.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const chip = t.closest<HTMLElement>('[data-chip]');
    if (chip) { setWannChip(chip.dataset.id!, Number(chip.dataset.step), chip.dataset.chip!); return; }
    const rm = t.closest<HTMLElement>('[data-rm]');
    if (rm) { removeExtraStep(rm.dataset.id!, Number(rm.dataset.rm)); return; }
    const add = t.closest<HTMLElement>('[data-act="addstep"]');
    if (add) addExtraStep(add.dataset.id!);
  });
  steps.addEventListener('change', (e) => {
    const t = e.target as HTMLElement;
    if (t.matches('[data-act="noaction"]')) toggleNoAction((t as HTMLInputElement).dataset.id!, (t as HTMLInputElement).checked);
    else if (t.matches('[data-field="wer"],[data-field="wann"]')) {
      const i = t as HTMLInputElement | HTMLSelectElement;
      updateStepField(i.dataset.id!, Number(i.dataset.step), i.dataset.field!, i.value);
    }
  });
  steps.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.dataset.field === 'was') updateStepField(t.dataset.id!, Number(t.dataset.step), 'was', t.value);
    else if (t.dataset.field === 'grund') { const it = agreements.find((a) => a.id === t.dataset.id); if (it) { it.keineAktivitaetGrund = t.value; save(); } }
  });

  // Phasen-Navigation
  el('btnForward').addEventListener('click', goForward);
  el('btnBack').addEventListener('click', goBack);
  el('resetAllBtn').addEventListener('click', resetAll);
  el('wzPhases').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('.wz-step');
    if (b) gotoPhase(Number(b.dataset.phase));
  });

  applyPhase();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
