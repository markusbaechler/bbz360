// ============================================================================
// 08-vereinbarungen.ts — Wizard (Grammatik v3).
// Bühne je Phase: Erfassen = sequenzielle Freischaltung (referenz-08-erfassen);
// Priorisieren = Einordnen in Gruppen; Planen = Fokus-Karte + Warteschlange
// (referenz-08-planen); Zusammenfassung. Säule = Phasenliste + Arbeitsstand.
// Logik/Datenfluss = v1 (unverändert). ADR-10: Hero-Bild entfällt.
// ============================================================================
import '../styles/theme.css';
import '../styles/modules/08-vereinbarungen.css';
import { BBZ } from '../lib/data';
import { mountNav } from '../lib/nav';
import { fmtDate } from '../lib/format';

// ── Typen ────────────────────────────────────────────────────────────────────
type Prio = 'sofort' | 'demnaechst' | 'gelegentlich' | null;
interface StepFields { wer: string; was: string; wann: string; wannChip: string | null; }
interface Agreement {
  id: string; sparte: string; reifegrad: string; reifegradLabel: string; text: string;
  prioritaet: Prio;
  stepWer: string; stepWas: string; stepWann: string; stepWannChip: string | null;
  keineAktivitaet: boolean; keineAktivitaetGrund: string; extraSteps: StepFields[];
}

// ── Konstanten (verbatim v1) ─────────────────────────────────────────────────
const SPARTEN = ['Zahlen', 'Sparen', 'Vorsorgen', 'Anlegen', 'Finanzieren', 'Sonstiges'];
const REIFEGRADE = [
  { id: 'ueberblick', label: 'Überblick schaffen' },
  { id: 'optionen', label: 'Optionen prüfen' },
  { id: 'entscheid', label: 'Entscheidung treffen' },
  { id: 'umsetzung', label: 'Umsetzung starten' },
  { id: 'optimieren', label: 'Bestehendes optimieren' },
];
const WANN_CHIPS = [{ id: 'woche', label: 'Woche' }, { id: 'monat', label: 'Monat' }, { id: 'jahr', label: 'Jahr' }];
const PRIO_ORDER: Record<string, number> = { sofort: 0, demnaechst: 1, gelegentlich: 2 };
const PRIOS: { id: Exclude<Prio, null>; label: string }[] = [
  { id: 'sofort', label: 'Sofort' }, { id: 'demnaechst', label: 'Demnächst' }, { id: 'gelegentlich', label: 'Gelegentlich' },
];
const PHASE_LABELS = ['Festhalten', 'Priorisieren', 'Nächste Schritte planen', 'Zusammenfassung'];
const DEFAULT_ACTIONS: Record<string, string> = {
  Vorsorgen: 'Unterlagen sichten und Eröffnung vorbereiten', Anlegen: 'Depoteröffnung oder Zeichnung koordinieren',
  Finanzieren: 'Offerte erstellen und Unterlagen einfordern', Sparen: 'Sparauftrag einrichten',
  Zahlen: 'Kontoeröffnung auslösen', Sonstiges: 'Nächste Massnahme konkretisieren',
};
const SUGGESTIONS: Record<string, string> = {
  'Zahlen|ueberblick': 'Überblick über Konten, Zahlungsverkehr und laufende Kosten schaffen',
  'Zahlen|optionen': 'Möglichkeiten zur Vereinfachung des Zahlungsverkehrs prüfen',
  'Zahlen|entscheid': 'Passende Konto- und Kartenlösung auswählen und Entscheid festhalten',
  'Zahlen|umsetzung': 'Passende Kontolösung eröffnen und in Betrieb nehmen',
  'Zahlen|optimieren': 'Bestehende Kontostruktur vereinfachen und Kontoführungskosten optimieren',
  'Sparen|ueberblick': 'Sparverhalten und mögliche Sparlösungen im Überblick besprechen',
  'Sparen|optionen': 'Verschiedene Sparmöglichkeiten und Zinskonditionen vergleichen',
  'Sparen|entscheid': 'Passende Sparlösung und Zielbetrag festlegen',
  'Sparen|umsetzung': 'Sparplan konkret starten und Dauerauftrag einrichten',
  'Sparen|optimieren': 'Bestehende Sparlösung an das heutige Sparziel anpassen',
  'Vorsorgen|ueberblick': 'Überblick über die heutige Vorsorgesituation schaffen',
  'Vorsorgen|optionen': 'Vorsorgemöglichkeiten und Steueroptimierung in der 2. und 3. Säule prüfen',
  'Vorsorgen|entscheid': 'Passende Vorsorgelösung auswählen und Entscheid festhalten',
  'Vorsorgen|umsetzung': 'Vorsorgelösung konkret einrichten und ersten Einzahlungsauftrag auslösen',
  'Vorsorgen|optimieren': 'Zusätzliches 3a-Konto zur Verbesserung der Steuersituation einrichten',
  'Anlegen|ueberblick': 'Überblick über bestehende Anlagen und Risikoprofil schaffen',
  'Anlegen|optionen': 'Anlagemöglichkeiten und passendes Risikoprofil gemeinsam prüfen',
  'Anlegen|entscheid': 'Bevorzugte Anlagestrategie eingrenzen und Entscheid vorbereiten',
  'Anlegen|umsetzung': 'Anlagelösung konkret einrichten und ersten Schritt auslösen',
  'Anlegen|optimieren': 'Bestehende Anlagelösung an heutiges Zielbild und Risikoprofil anpassen',
  'Finanzieren|ueberblick': 'Finanzierungssituation, Tragbarkeit und Varianten transparent machen',
  'Finanzieren|optionen': 'Hypothekarvarianten, Laufzeiten und Konditionen vergleichen',
  'Finanzieren|entscheid': 'Bevorzugte Finanzierungsvariante festlegen und nächste Schritte definieren',
  'Finanzieren|umsetzung': 'Finanzierungsantrag auslösen und Unterlagen zusammenstellen',
  'Finanzieren|optimieren': 'Bestehende Hypothek auf Optimierungspotenzial prüfen',
  'Sonstiges|ueberblick': 'Überblick über die besprochenen Themen und offene Punkte schaffen',
  'Sonstiges|optionen': 'Mögliche Lösungsansätze zum besprochenen Thema prüfen',
  'Sonstiges|entscheid': 'Entscheid zum besprochenen Punkt festhalten',
  'Sonstiges|umsetzung': 'Nächste konkrete Massnahme einleiten',
  'Sonstiges|optimieren': 'Bestehende Lösung überprüfen und Verbesserungspotenzial identifizieren',
};

const prioLabel = (p: Prio): string => PRIOS.find((x) => x.id === p)?.label ?? '–';
const wannChipLabel = (id: string | null): string => WANN_CHIPS.find((c) => c.id === id)?.label || '';
const esc = (s: string): string =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const uid = (): string => Math.random().toString(36).slice(2, 9) + (agreements.length + 1);

// ── State ────────────────────────────────────────────────────────────────────
let phase = 1;
let agreements: Agreement[] = [];
let beraterName = 'Berater:in';
// Erfassen (sequenzielle Freischaltung)
let capSparte: string | null = null;
let capReifegrad: string | null = null;
let capStep = 1; // 1 Thema · 2 Fokus · 3 Formulieren
let editingId: string | null = null;
// Priorisieren: welche Quittungszeile gerade "umentscheiden" zeigt
let reopenPrio: string | null = null;
// Planen: fokussierte Vereinbarung
let focusId: string | null = null;

const el = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
const byPrio = (p: Prio): Agreement[] => agreements.filter((a) => a.prioritaet === p);
const unprio = (): Agreement[] => agreements.filter((a) => a.prioritaet === null);
const sortedAgreements = (): Agreement[] =>
  [...agreements].sort((a, b) => (PRIO_ORDER[a.prioritaet ?? ''] ?? 3) - (PRIO_ORDER[b.prioritaet ?? ''] ?? 3));
const isPlanned = (a: Agreement): boolean => a.keineAktivitaet || a.stepWas.trim().length > 0;

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
        stepWer: a.stepWer || beraterName, stepWas: a.stepWas || '', stepWann: a.stepWann || '',
        stepWannChip: a.stepWannChip ?? null, keineAktivitaet: !!a.keineAktivitaet,
        keineAktivitaetGrund: a.keineAktivitaetGrund || '',
        extraSteps: Array.isArray(a.extraSteps)
          ? a.extraSteps.map((s) => ({ wer: s.wer || beraterName, was: s.was || '', wann: s.wann || '', wannChip: s.wannChip ?? null }))
          : [],
      };
    });
    phase = v1.phase && v1.phase <= 4 ? v1.phase : 1;
  }
}

// ── Rendering: Säule ─────────────────────────────────────────────────────────
function renderRail(): void {
  el('railSub').textContent =
    phase >= 3 ? 'Was wir heute gemeinsam festhalten — und wer was bis wann übernimmt.' : 'Was wir heute gemeinsam festhalten — Schritt für Schritt.';
  el('railPhases').innerHTML = PHASE_LABELS.map((label, i) => {
    const p = i + 1;
    const cls = p < phase ? 'done' : p === phase ? 'active' : 'next';
    const mark = p < phase ? '✓' : String(p);
    return `<div class="rail-phase ${cls}"${p < phase ? ` data-goto="${p}"` : ''}><span class="pc">${mark}</span><span>${label}</span></div>`;
  }).join('');

  const st = el('railStatus');
  if (phase === 1) {
    st.innerHTML = `<div class="wz-plt">${agreements.length} ${agreements.length === 1 ? 'Vereinbarung' : 'Vereinbarungen'} festgehalten</div>`;
  } else if (phase === 2) {
    const done = agreements.length - unprio().length;
    st.innerHTML = `<div class="wz-plt">${done} VON ${agreements.length} EINGEORDNET</div>`;
  } else if (phase === 3) {
    const planned = agreements.filter(isPlanned).length;
    const rows = sortedAgreements().map((a, i) => {
      const state = a.keineAktivitaet || isPlanned(a) ? 'ok' : a.id === focusId ? 'cur' : 'later';
      const inner = state === 'ok' ? '✓' : String(i + 1);
      return `<div class="wz-pli${state === 'later' ? ' dim' : ''}"><span class="wz-dot ${state}">${inner}</span>${esc(shortTitle(a))}</div>`;
    }).join('');
    st.innerHTML = `<div class="wz-plt">HEUTE FESTGEHALTEN · ${planned} VON ${agreements.length} GEPLANT</div>${rows}`;
  } else {
    st.innerHTML = `<div class="wz-plt">${agreements.length} Vereinbarungen · Gespräch abgeschlossen</div>`;
  }
}

const shortTitle = (a: Agreement): string => (a.text.length > 34 ? a.text.slice(0, 33) + '…' : a.text);

// ── Rendering: Bar ───────────────────────────────────────────────────────────
function renderBar(): void {
  el('work').classList.toggle('bbz-work--focus', phase === 1);
  let right = '';
  if (phase === 1) {
    const ok = agreements.length >= 1;
    right = `<button class="btn${ok ? '' : ' off'}" id="btnFwd"${ok ? '' : ' disabled'}>Bereit zur Priorisierung →${ok ? '' : ' <small>ab 1 Vereinbarung</small>'}</button>`;
  } else if (phase === 2) {
    const ok = unprio().length === 0 && agreements.length > 0;
    right = `<span class="wz-back" id="btnBack">← Zurück</span><button class="btn${ok ? '' : ' off'}" id="btnFwd"${ok ? '' : ' disabled'}>Weiter zu den nächsten Schritten →${ok ? '' : ' <small>ab alle eingeordnet</small>'}</button>`;
  } else if (phase === 3) {
    right = `<span class="wz-back" id="btnBack">← Zurück zur Priorisierung</span><button class="btn" id="btnFwd">Weiter zur Zusammenfassung →</button>`;
  } else {
    right = `<span class="wz-back" id="btnBack">← Zurück</span><a class="btn" href="09-feedback.html">Weiter: Feedback →</a>`;
  }
  el('barIn').innerHTML = `<span class="bar-pos">Phase ${phase} von 4 · ${['Festhalten', 'Priorisieren', 'Planen', 'Zusammenfassung'][phase - 1]}</span><span class="wz-bar-right">${right}</span>`;
  el('barIn').querySelector('#btnFwd')?.addEventListener('click', goForward);
  el('barIn').querySelector('#btnBack')?.addEventListener('click', goBack);
}

// ── Phase 1: Erfassen (sequenzielle Freischaltung) ───────────────────────────
function renderErfassen(): void {
  const w = el('work');
  const sug = capSparte && capReifegrad ? SUGGESTIONS[`${capSparte}|${capReifegrad}`] || '' : '';
  // Schritt-Zustände
  const s1 = capStep > 1 ? 'done' : 'act';
  const s2 = capStep > 2 ? 'done' : capStep === 2 ? 'act' : 'lock';
  const s3 = capStep === 3 ? 'act' : 'lock';
  const sparteChips = SPARTEN.map((s) => `<span class="wz-chip" data-cap="sparte" data-v="${s}">${s}</span>`).join('');
  const fokusChips = REIFEGRADE.map((r) => `<span class="wz-chip" data-cap="reifegrad" data-v="${r.id}">${r.label}</span>`).join('');

  let card = `<div class="wz-card"><div class="wz-cardbody">`;
  // Schritt 1 Thema
  card += stepBlock(s1, 1, 'Thema', 'Worum geht es?', capSparte
    ? `<div class="wz-sv">${esc(capSparte)}</div>` : `<div class="wz-chips">${sparteChips}</div>`, s1 === 'done' ? 'sparte' : '');
  // Schritt 2 Fokus
  card += stepBlock(s2, 2, 'Fokus wählen', 'Worum geht es bei dieser Vereinbarung?', s2 === 'lock'
    ? `<div class="wz-lockv">Nach der Themenwahl.</div>`
    : capReifegrad ? `<div class="wz-sv">${esc(REIFEGRADE.find((r) => r.id === capReifegrad)?.label || '')}</div>` : `<div class="wz-chips">${fokusChips}</div>`, s2 === 'done' ? 'reifegrad' : '');
  // Schritt 3 Formulieren
  card += stepBlock(s3, 3, 'Vereinbarung formulieren', 'Mit Formulierungsvorschlag.', s3 === 'lock'
    ? `<div class="wz-lockv">Folgt nach der Fokus-Wahl.</div>`
    : `<textarea class="input wz-ta" id="capText" rows="2" placeholder="${esc(sug || 'Vereinbarung formulieren…')}">${esc(capText())}</textarea>
       <div class="wz-caprow"><button class="btn" id="capSave">${editingId ? 'Änderung speichern' : 'Festhalten'} →</button>${sug ? `<button class="wz-sugbtn" id="capSug">Vorschlag übernehmen</button>` : ''}</div>`, '');
  card += `</div></div>`;

  // Queue: erfasste Vereinbarungen
  const queue = agreements.map((a) => `
    <div class="wz-listrow" data-id="${a.id}">
      <span class="wz-ck">✓</span>
      <span class="wz-lt"><b>${esc(a.sparte)} · ${esc(a.reifegradLabel)}</b> — ${esc(a.text)}</span>
      <span class="wz-lc"><button class="wz-icon" data-act="edit" data-id="${a.id}" aria-label="Bearbeiten">✎</button><button class="wz-icon" data-act="del" data-id="${a.id}" aria-label="Löschen">×</button></span>
    </div>`).join('');
  w.innerHTML = card + queue;
  wireErfassen();
}

let _draft = '';
const capText = (): string => _draft;

function stepBlock(state: string, n: number, label: string, hint: string, body: string, chgKind: string): string {
  if (state === 'done') {
    return `<div class="wz-step done"><span class="wz-sn">✓</span><div class="wz-sb"><div class="wz-sl">${label}</div>${body}</div><span class="wz-chg" data-chg="${chgKind}">ändern</span></div>`;
  }
  if (state === 'act') {
    return `<div class="wz-step act"><span class="wz-sn">${n}</span><div class="wz-sb"><div class="wz-sl act">${label}</div><div class="wz-hint">${hint}</div>${body}</div></div>`;
  }
  return `<div class="wz-step lock"><span class="wz-sn">${n}</span><div class="wz-sb"><div class="wz-sl">${label}</div>${body}</div></div>`;
}

function wireErfassen(): void {
  const w = el('work');
  w.querySelectorAll<HTMLElement>('[data-cap]').forEach((chip) => chip.addEventListener('click', () => {
    const kind = chip.dataset.cap, v = chip.dataset.v!;
    if (kind === 'sparte') { capSparte = v; capReifegrad = null; capStep = 2; }
    else if (kind === 'reifegrad') { capReifegrad = v; capStep = 3; }
    renderErfassen();
    setTimeout(() => el('capText')?.focus(), 0);
  }));
  w.querySelectorAll<HTMLElement>('[data-chg]').forEach((b) => b.addEventListener('click', () => {
    capStep = b.dataset.chg === 'sparte' ? 1 : 2;
    renderErfassen();
  }));
  const ta = document.getElementById('capText') as HTMLTextAreaElement | null;
  if (ta) ta.addEventListener('input', () => { _draft = ta.value; });
  document.getElementById('capSug')?.addEventListener('click', () => {
    _draft = SUGGESTIONS[`${capSparte}|${capReifegrad}`] || '';
    (el('capText') as HTMLTextAreaElement).value = _draft;
  });
  document.getElementById('capSave')?.addEventListener('click', commitCapture);
  w.querySelectorAll<HTMLElement>('[data-act]').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.id!;
    if (b.dataset.act === 'edit') startEdit(id);
    else if (b.dataset.act === 'del') { agreements = agreements.filter((a) => a.id !== id); save(); render(); }
  }));
}

function commitCapture(): void {
  const text = _draft.trim();
  if (!capSparte || !capReifegrad || !text) return;
  const reifegradLabel = REIFEGRADE.find((r) => r.id === capReifegrad)?.label || capReifegrad;
  if (editingId) {
    const a = agreements.find((x) => x.id === editingId);
    if (a) { a.sparte = capSparte; a.reifegrad = capReifegrad; a.reifegradLabel = reifegradLabel; a.text = text; }
  } else {
    agreements.push({
      id: uid(), sparte: capSparte, reifegrad: capReifegrad, reifegradLabel, text,
      prioritaet: null, stepWer: beraterName, stepWas: '', stepWann: '', stepWannChip: null,
      keineAktivitaet: false, keineAktivitaetGrund: '', extraSteps: [],
    });
  }
  editingId = null; capSparte = null; capReifegrad = null; capStep = 1; _draft = '';
  save(); render();
}
function startEdit(id: string): void {
  const a = agreements.find((x) => x.id === id);
  if (!a) return;
  editingId = id; capSparte = a.sparte; capReifegrad = a.reifegrad; capStep = 3; _draft = a.text;
  renderErfassen();
}

// ── Phase 2: Priorisieren (Einordnen in Gruppen) ─────────────────────────────
function renderPriorisieren(): void {
  const w = el('work');
  const pending = unprio();
  const pendingRows = pending.map((a) => `
    <div class="wz-prow" data-id="${a.id}">
      <span class="wz-pt">${esc(a.text)}</span>
      <span class="wz-chips">${PRIOS.map((p) => `<span class="wz-chip" data-prio="${p.id}" data-id="${a.id}">${p.label}</span>`).join('')}</span>
    </div>`).join('');
  const group = (p: Exclude<Prio, null>, label: string): string => {
    const items = byPrio(p);
    const rows = items.map((a) => a.id === reopenPrio
      ? `<div class="wz-prow reopen" data-id="${a.id}"><span class="wz-pt">${esc(a.text)}</span><span class="wz-chips">${PRIOS.map((x) => `<span class="wz-chip${x.id === p ? ' on' : ''}" data-prio="${x.id}" data-id="${a.id}">${x.label}</span>`).join('')}</span></div>`
      : `<div class="wz-qrow" data-reopen="${a.id}"><span class="wz-ck">✓</span><span class="wz-lt"><b>${esc(a.text)}</b></span><span class="wz-lc">ändern</span></div>`).join('');
    return `<div class="wz-group"><div class="wz-glabel">${label} · ${items.length}</div>${rows || '<div class="wz-gempty">—</div>'}</div>`;
  };
  w.innerHTML =
    `<div class="wz-todo"><div class="wz-glabel work">NOCH EINZUORDNEN · ${pending.length}</div>${pending.length ? pendingRows : '<div class="wz-gempty">Alle eingeordnet ✓</div>'}</div>` +
    `<div class="wz-groups">${group('sofort', 'SOFORT')}${group('demnaechst', 'DEMNÄCHST')}${group('gelegentlich', 'GELEGENTLICH')}</div>`;
  w.querySelectorAll<HTMLElement>('[data-prio]').forEach((c) => c.addEventListener('click', () => {
    const a = agreements.find((x) => x.id === c.dataset.id);
    if (!a) return;
    a.prioritaet = c.dataset.prio as Exclude<Prio, null>;
    reopenPrio = null; save(); renderPriorisieren(); renderRail(); renderBar();
  }));
  w.querySelectorAll<HTMLElement>('[data-reopen]').forEach((r) => r.addEventListener('click', () => {
    reopenPrio = r.dataset.reopen!; renderPriorisieren();
  }));
}

// ── Phase 3: Planen (Fokus-Karte + Warteschlange) ────────────────────────────
function renderPlanen(): void {
  const list = sortedAgreements();
  if (!focusId || !list.some((a) => a.id === focusId)) focusId = list.find((a) => !isPlanned(a))?.id ?? list[0]?.id ?? null;
  const w = el('work');
  const idx = list.findIndex((a) => a.id === focusId);
  let html = '';
  list.forEach((a, i) => {
    if (a.id === focusId) html += focusCard(a, i + 1, list.length);
    else if (i < idx) html += miniRow(a, false);
    else html += miniRow(a, true);
  });
  w.innerHTML = html;
  wirePlanen();
}
function miniRow(a: Agreement, queued: boolean): string {
  const detail = a.keineAktivitaet ? 'kein Handlungsbedarf'
    : a.stepWas ? `${esc(a.stepWer)}${a.stepWannChip || a.stepWann ? ', ' + esc(wannText(a.stepWannChip, a.stepWann)) : ''}` : '';
  const st = queued ? 'als Nächstes' : a.keineAktivitaet || a.stepWas ? 'geplant' : 'offen';
  return `<div class="wz-mini${queued ? ' q' : ''}" data-focus="${a.id}"><span class="wz-ck">${queued ? '' : '✓'}</span><span class="wz-lt"><b>${esc(shortTitle(a))}</b>${detail ? ' — ' + detail : ''}</span><span class="wz-st">${st}</span></div>`;
}
function focusCard(a: Agreement, pos: number, total: number): string {
  const kick = `VEREINBARUNG ${pos} VON ${total} · ${esc(a.sparte.toUpperCase())} · ${prioLabel(a.prioritaet).toUpperCase()}`;
  const dim = a.keineAktivitaet ? ' style="opacity:.4;pointer-events:none"' : '';
  let steps = stepRow(a, 0);
  a.extraSteps.forEach((_, i) => { steps += stepRow(a, i + 1); });
  const canAdd = a.extraSteps.length < 2;
  return `<div class="card-focus wz-focus"><div class="kicker">${kick}</div><div class="card-title">${esc(a.text)}</div>
    <div class="wz-steps"${dim}>${steps}
      ${canAdd ? `<div class="wz-add" data-addstep="${a.id}">+ ${a.extraSteps.length + 1 === 1 ? 'ersten' : a.extraSteps.length + 1 === 2 ? 'zweiten' : 'dritten'} Schritt hinzufügen</div>` : ''}
    </div>
    <label class="wz-cfoot"><input type="checkbox" data-noaction="${a.id}"${a.keineAktivitaet ? ' checked' : ''}> Kein Handlungsbedarf momentan</label></div>`;
}
function stepRow(a: Agreement, stepIdx: number): string {
  const isMain = stepIdx === 0;
  const extra = isMain ? null : a.extraSteps[stepIdx - 1];
  const wer = isMain ? a.stepWer : extra!.wer;
  const was = isMain ? a.stepWas : extra!.was;
  const wann = isMain ? a.stepWann : extra!.wann;
  const chip = isMain ? a.stepWannChip : extra!.wannChip;
  const werOpts = [beraterName, 'Kund:in', 'Gemeinsam'];
  const def = DEFAULT_ACTIONS[a.sparte] || 'Nächste Massnahme';
  const chips = WANN_CHIPS.map((c) => `<span class="wz-wchip${chip === c.id ? ' on' : ''}" data-id="${a.id}" data-step="${stepIdx}" data-wchip="${c.id}">${c.label}</span>`).join('');
  return `<div class="wz-planstep">
    <span class="wz-psl">Schritt ${stepIdx + 1}</span>
    <select class="wz-wer" data-id="${a.id}" data-step="${stepIdx}" data-field="wer">${werOpts.map((o) => `<option${wer === o ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>
    <input class="wz-was" type="text" value="${esc(was)}" placeholder="${esc(def)}…" data-id="${a.id}" data-step="${stepIdx}" data-field="was">
    <span class="wz-wchips">${chips}<input class="wz-date" type="date" value="${esc(wann)}" data-id="${a.id}" data-step="${stepIdx}" data-field="wann"></span>
    ${stepIdx > 0 ? `<button class="wz-rm" data-rm="${stepIdx - 1}" data-id="${a.id}" aria-label="Schritt entfernen">×</button>` : ''}
  </div>`;
}
function wirePlanen(): void {
  const w = el('work');
  w.querySelectorAll<HTMLElement>('[data-focus]').forEach((m) => m.addEventListener('click', () => { focusId = m.dataset.focus!; renderPlanen(); renderRail(); }));
  w.querySelectorAll<HTMLElement>('[data-wchip]').forEach((c) => c.addEventListener('click', () => {
    setWannChip(c.dataset.id!, Number(c.dataset.step), c.dataset.wchip!); renderPlanen();
  }));
  w.querySelectorAll<HTMLElement>('[data-addstep]').forEach((b) => b.addEventListener('click', () => { addExtraStep(b.dataset.addstep!); renderPlanen(); renderRail(); }));
  w.querySelectorAll<HTMLElement>('[data-rm]').forEach((b) => b.addEventListener('click', () => { removeExtraStep(b.dataset.id!, Number(b.dataset.rm)); renderPlanen(); }));
  w.querySelectorAll<HTMLInputElement>('[data-noaction]').forEach((c) => c.addEventListener('change', () => { toggleNoAction(c.dataset.noaction!, c.checked); renderPlanen(); renderRail(); }));
  w.querySelectorAll<HTMLElement>('[data-field]').forEach((f) => {
    const ev = f.tagName === 'SELECT' ? 'change' : 'input';
    f.addEventListener(ev, () => { updateStepField((f as HTMLInputElement).dataset.id!, Number((f as HTMLInputElement).dataset.step), (f as HTMLInputElement).dataset.field!, (f as HTMLInputElement).value); renderRail(); });
  });
}
function wannText(chip: string | null, wann: string): string {
  return chip ? wannChipLabel(chip) + (wann ? ', ' + fmtDate(wann) : '') : wann ? fmtDate(wann) : '';
}
function setWannChip(id: string, stepIdx: number, chipId: string): void {
  const a = agreements.find((x) => x.id === id); if (!a) return;
  if (stepIdx === 0) a.stepWannChip = a.stepWannChip === chipId ? null : chipId;
  else if (a.extraSteps[stepIdx - 1]) { const s = a.extraSteps[stepIdx - 1]; s.wannChip = s.wannChip === chipId ? null : chipId; }
  save();
}
function updateStepField(id: string, stepIdx: number, field: string, value: string): void {
  const a = agreements.find((x) => x.id === id); if (!a) return;
  if (stepIdx === 0) { if (field === 'wer') a.stepWer = value; else if (field === 'was') a.stepWas = value; else if (field === 'wann') a.stepWann = value; }
  else if (a.extraSteps[stepIdx - 1]) { const s = a.extraSteps[stepIdx - 1]; if (field === 'wer') s.wer = value; else if (field === 'was') s.was = value; else if (field === 'wann') s.wann = value; }
  save();
}
function addExtraStep(id: string): void { const a = agreements.find((x) => x.id === id); if (a && a.extraSteps.length < 2) { a.extraSteps.push({ wer: beraterName, was: '', wann: '', wannChip: null }); save(); } }
function removeExtraStep(id: string, idx: number): void { const a = agreements.find((x) => x.id === id); if (a) { a.extraSteps.splice(idx, 1); save(); } }
function toggleNoAction(id: string, on: boolean): void { const a = agreements.find((x) => x.id === id); if (a) { a.keineAktivitaet = on; if (!on) a.keineAktivitaetGrund = ''; save(); } }

// ── Phase 4: Zusammenfassung ─────────────────────────────────────────────────
function renderZusammenfassung(): void {
  const w = el('work');
  const rows = sortedAgreements().map((a) => {
    const steps = a.keineAktivitaet ? '<span class="wz-none">Kein Handlungsbedarf momentan</span>'
      : [{ wer: a.stepWer, was: a.stepWas || DEFAULT_ACTIONS[a.sparte] || '–', wann: wannText(a.stepWannChip, a.stepWann) },
         ...a.extraSteps.map((s) => ({ wer: s.wer, was: s.was || '–', wann: wannText(s.wannChip, s.wann) }))]
        .map((s) => `<div class="wz-sumstep"><b>${esc(s.was)}</b> — ${esc(s.wer)}${s.wann ? ', ' + esc(s.wann) : ''}</div>`).join('');
    return `<div class="wz-sumrow"><div class="wz-sumhead"><span class="receipt-label">${esc(a.sparte)} · ${prioLabel(a.prioritaet)}</span><div class="wz-sumtitle">${esc(a.text)}</div></div><div class="wz-sumsteps">${steps}</div></div>`;
  }).join('');
  w.innerHTML = `<div class="panel wz-summary"><div class="panel-kicker">HEUTE VEREINBART · ${agreements.length}</div>${rows || '<div class="wz-gempty">Keine Vereinbarungen.</div>'}</div>`;
}

// ── Phasen-Navigation ────────────────────────────────────────────────────────
function goForward(): void {
  if (phase === 1 && agreements.length === 0) return;
  if (phase === 2 && (unprio().length > 0 || agreements.length === 0)) return;
  if (phase < 4) { phase++; save(); render(); }
}
function goBack(): void { if (phase > 1) { phase--; save(); render(); } }
function gotoPhase(p: number): void { if (p < phase) { phase = p; save(); render(); } }

function render(): void {
  renderRail();
  renderBar();
  if (phase === 1) renderErfassen();
  else if (phase === 2) renderPriorisieren();
  else if (phase === 3) renderPlanen();
  else renderZusammenfassung();
  el('railPhases').querySelectorAll<HTMLElement>('[data-goto]').forEach((b) => b.addEventListener('click', () => gotoPhase(Number(b.dataset.goto))));
}

function init(): void {
  mountNav(el('bbzNav'), { activeId: '08' });
  el('editToggle').addEventListener('click', () => {
    const on = document.body.classList.toggle('edit-mode');
    el('editToggle').setAttribute('aria-pressed', String(on));
  });
  const bn = BBZ.get('beraterName');
  if (typeof bn === 'string' && bn) beraterName = bn;
  load();
  render();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
