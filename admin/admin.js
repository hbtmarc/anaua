/**
 * @fileoverview admin.js — Backoffice SPA controller for Anauá Ecoturismo.
 *
 * Modules: dashboard | agenda | experiencias | saidas | reservas | participantes | financeiro | configuracoes
 *
 * Architecture:
 *  - Hash router: location.hash = '#module' or '#module/id'
 *  - All data sourced from:
 *    - EXPERIENCES + exits from data.js (experiences catalog)
 *    - Bookings from ReservationStore (localStorage)
 *    - Seeded mock bookings injected on first load if empty
 */

import { EXPERIENCES, formatBRL, formatDate } from '../assets/js/data.js';
import { STATUS_LABEL, STATUS_CLASS, STATUS_TRANSITIONS } from '../assets/js/types/booking.types.js';
import {
  listBookings, saveBooking, getBooking, transitionStatus, recordPayment,
} from '../assets/js/services/ReservationStore.js';

// ─── Admin auth guard ─────────────────────────────────────────────────────────
// Oculta o body imediatamente para evitar flash de conteúdo antes da validação
document.body.style.visibility = 'hidden';

// ─── Logout helper ────────────────────────────────────────────────────────────
function adminLogout() {
  localStorage.removeItem('anaua_admin_session');
  sessionStorage.removeItem('anaua_admin_session');
  if (window.anauaDb) window.anauaDb.auth.signOut();
  location.replace('login.html');
}



// seedMockBookings removida — dashboard usa Supabase
function seedMockBookings() {
  const existing = listBookings();
  if (existing.length >= 3) return;

  const now = Date.now();
  const mock = [
    {
      id: 'BK-001', experienceId: 'trekking-vale-sombra', exitId: 'exit-vs-01',
      meetingPointId: 'mp-vs-01-a',
      status: 'confirmed',
      payer: { fullName: 'Maria Clara Torres', cpf: '529.982.247-25', email: 'maria@email.com', phone: '(21) 99001-1234', birthdate: '1991-04-10', isAlsoParticipant: true },
      participants: [{ id: 'p1', fullName: 'Maria Clara Torres', profile: 'adult', docNumber: '529.982.247-25', birthdate: '1991-04-10' }],
      emergencyContact: { fullName: 'Pedro Torres', phone: '(21) 99002-5678', relationship: 'Marido' },
      termsAcceptance: { terms: true, cancellation: true, riskAwareness: true, imageConsent: true, version: '2026-01', acceptedAt: new Date().toISOString() },
      profileQtys: [{ profile: 'adult', qty: 2, unitPrice: 390 }],
      totalAmount: 780, paidAmount: 780, pendingAmount: 0,
      paymentMethod: 'pix',
      paymentHistory: [{ transactionId: 'TX001', method: 'pix', amountPaid: 780, paidAt: new Date(now - 86400000 * 5).toISOString(), success: true }],
      voucherCode: 'ANA-2026-001',
      notes: '',
      createdAt: new Date(now - 86400000 * 10).toISOString(),
      updatedAt: new Date(now - 86400000 * 5).toISOString(),
    },
    {
      id: 'BK-002', experienceId: 'kids-trilha-bicho', exitId: 'exit-kb-01',
      meetingPointId: 'mp-kb-01-a',
      status: 'reserved',
      payer: { fullName: 'Roberto Alvim', cpf: '111.222.333-44', email: 'roberto@email.com', phone: '(31) 98877-6655', birthdate: '1984-09-22', isAlsoParticipant: false },
      participants: [
        { id: 'p2', fullName: 'Roberto Alvim', profile: 'adult', docNumber: '111.222.333-44', birthdate: '1984-09-22' },
        { id: 'p3', fullName: 'Sofia Alvim', profile: 'child', docNumber: '', birthdate: '2018-03-15' },
      ],
      emergencyContact: { fullName: 'Ana Alvim', phone: '(31) 97766-4433', relationship: 'Esposa' },
      termsAcceptance: { terms: true, cancellation: true, riskAwareness: true, imageConsent: false, version: '2026-01', acceptedAt: new Date().toISOString() },
      profileQtys: [{ profile: 'adult', qty: 1, unitPrice: 220 }, { profile: 'child', qty: 1, unitPrice: 120 }],
      totalAmount: 340, paidAmount: 102, pendingAmount: 238,
      paymentMethod: 'signal_balance',
      paymentHistory: [{ transactionId: 'TX002', method: 'pix', amountPaid: 102, paidAt: new Date(now - 86400000 * 3).toISOString(), success: true }],
      voucherCode: 'ANA-2026-002',
      notes: 'Sofia é alérgica a amendoim.',
      createdAt: new Date(now - 86400000 * 7).toISOString(),
      updatedAt: new Date(now - 86400000 * 3).toISOString(),
    },
    {
      id: 'BK-003', experienceId: 'expedicao-pantanal', exitId: 'exit-pt-01',
      meetingPointId: 'mp-pt-01-a',
      status: 'pending_payment',
      payer: { fullName: 'Juliana Bispo', cpf: '555.666.777-88', email: 'juliana@email.com', phone: '(11) 91234-5678', birthdate: '1995-07-30', isAlsoParticipant: true },
      participants: [{ id: 'p4', fullName: 'Juliana Bispo', profile: 'adult', docNumber: '555.666.777-88', birthdate: '1995-07-30' }],
      emergencyContact: { fullName: 'Carla Bispo', phone: '(11) 99999-0000', relationship: 'Mãe' },
      termsAcceptance: { terms: true, cancellation: true, riskAwareness: true, imageConsent: true, version: '2026-01', acceptedAt: new Date().toISOString() },
      profileQtys: [{ profile: 'adult', qty: 1, unitPrice: 1890 }],
      totalAmount: 1890, paidAmount: 0, pendingAmount: 1890,
      paymentMethod: 'credit_card',
      paymentHistory: [],
      voucherCode: 'ANA-2026-003',
      notes: '',
      createdAt: new Date(now - 86400000 * 2).toISOString(),
      updatedAt: new Date(now - 86400000 * 2).toISOString(),
    },
    {
      id: 'BK-004', experienceId: 'trekking-vale-sombra', exitId: 'exit-vs-02',
      meetingPointId: 'mp-vs-01-b',
      status: 'cancelled',
      payer: { fullName: 'Carlos Menezes', cpf: '123.456.789-00', email: 'carlos@email.com', phone: '(51) 99222-3344', birthdate: '1988-12-01', isAlsoParticipant: true },
      participants: [{ id: 'p5', fullName: 'Carlos Menezes', profile: 'adult', docNumber: '123.456.789-00', birthdate: '1988-12-01' }],
      emergencyContact: { fullName: 'Lucia Menezes', phone: '(51) 99111-2233', relationship: 'Mãe' },
      termsAcceptance: { terms: true, cancellation: true, riskAwareness: true, imageConsent: true, version: '2026-01', acceptedAt: new Date().toISOString() },
      profileQtys: [{ profile: 'adult', qty: 1, unitPrice: 390 }],
      totalAmount: 390, paidAmount: 390, pendingAmount: 0,
      paymentMethod: 'credit_card',
      paymentHistory: [{ transactionId: 'TX004', method: 'credit_card', amountPaid: 390, paidAt: new Date(now - 86400000 * 14).toISOString(), success: true }],
      voucherCode: 'ANA-2026-004',
      notes: 'Solicitou cancelamento por motivos particulares.',
      createdAt: new Date(now - 86400000 * 20).toISOString(),
      updatedAt: new Date(now - 86400000 * 12).toISOString(),
    },
    {
      id: 'BK-005', experienceId: 'retiro-yoga-selva', exitId: 'exit-ry-01',
      meetingPointId: 'mp-ry-01-a',
      status: 'confirmed',
      payer: { fullName: 'Ana Paula Freitas', cpf: '321.654.987-11', email: 'anapaula@email.com', phone: '(19) 98765-4321', birthdate: '1992-02-14', isAlsoParticipant: true },
      participants: [
        { id: 'p6', fullName: 'Ana Paula Freitas', profile: 'adult', docNumber: '321.654.987-11', birthdate: '1992-02-14' },
        { id: 'p7', fullName: 'Renata Souza', profile: 'adult', docNumber: '444.555.666-77', birthdate: '1990-11-20' },
      ],
      emergencyContact: { fullName: 'Rogério Freitas', phone: '(19) 97654-3210', relationship: 'Pai' },
      termsAcceptance: { terms: true, cancellation: true, riskAwareness: true, imageConsent: true, version: '2026-01', acceptedAt: new Date().toISOString() },
      profileQtys: [{ profile: 'adult', qty: 2, unitPrice: 1200 }],
      totalAmount: 2400, paidAmount: 2400, pendingAmount: 0,
      paymentMethod: 'pix',
      paymentHistory: [{ transactionId: 'TX005', method: 'pix', amountPaid: 2400, paidAt: new Date(now - 86400000 * 1).toISOString(), success: true }],
      voucherCode: 'ANA-2026-005',
      notes: '',
      createdAt: new Date(now - 86400000 * 4).toISOString(),
      updatedAt: new Date(now - 86400000 * 1).toISOString(),
    },
  ];

  mock.forEach(b => saveBooking(b));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

function qs(sel, ctx = document) { return ctx.querySelector(sel); }

function fmt(n) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 }).format(n); }

function fmtDate(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso + (iso.length === 10 ? 'T12:00:00' : '')));
}

function fmtDateShort(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(iso + (iso.length === 10 ? 'T12:00:00' : '')));
}

function initials(name) {
  const p = (name ?? '').trim().split(' ').filter(Boolean);
  if (!p.length) return '?';
  return (p[0][0] + (p[p.length - 1]?.[0] ?? '')).toUpperCase();
}

function badge(status) {
  const cls = STATUS_CLASS[status] ?? 'badge--draft';
  const lbl = STATUS_LABEL[status] ?? status;
  return `<span class="badge ${cls}">${lbl}</span>`;
}

function payMethodLabel(m) {
  return { pix: 'PIX', credit_card: 'Cartão', signal_balance: 'Sinal + Saldo' }[m] ?? m ?? '—';
}

function occFill(pct) {
  let cls = '';
  if (pct >= 100) cls = 'is-full';
  else if (pct >= 70) cls = 'is-hot';
  return `<div class="adm-occ">
    <div class="adm-occ__bar"><div class="adm-occ__fill ${cls}" style="width:${Math.min(pct,100)}%"></div></div>
    <span class="adm-occ__pct">${Math.round(pct)}%</span>
  </div>`;
}

function findExit(exitId) {
  for (const exp of EXPERIENCES) {
    const exit = exp.nextExits?.find(e => e.id === exitId);
    if (exit) return { exp, exit };
  }
  return null;
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function toast(msg, type = 'info') {
  const stack = $('adm-toasts');
  const el = document.createElement('div');
  el.className = `adm-toast is-${type}`;
  el.textContent = msg;
  stack.appendChild(el);
  setTimeout(() => { el.classList.add('is-leaving'); setTimeout(() => el.remove(), 250); }, 3000);
}

// ─── Drawer ───────────────────────────────────────────────────────────────────

function openDrawer(title, bodyHtml) {
  $('adm-drawer-title').textContent = title;
  $('adm-drawer-body').innerHTML = bodyHtml;
  $('adm-drawer').classList.add('is-open');
  $('adm-drawer').setAttribute('aria-hidden', 'false');
  $('adm-drawer-overlay').classList.add('is-open');
}

function closeDrawer() {
  $('adm-drawer').classList.remove('is-open');
  $('adm-drawer').setAttribute('aria-hidden', 'true');
  $('adm-drawer-overlay').classList.remove('is-open');
}

$('adm-drawer-close').addEventListener('click', closeDrawer);
$('adm-drawer-overlay').addEventListener('click', closeDrawer);

// ─── Modal ────────────────────────────────────────────────────────────────────

function openModal(title, bodyHtml, footerHtml = '') {
  $('adm-modal-title').textContent = title;
  $('adm-modal-body').innerHTML = bodyHtml;
  $('adm-modal-footer').innerHTML = footerHtml;
  $('adm-modal').classList.add('is-open');
  $('adm-modal').setAttribute('aria-hidden', 'false');
  $('adm-modal-overlay').classList.add('is-open');
}

function closeModal() {
  $('adm-modal').classList.remove('is-open');
  $('adm-modal').setAttribute('aria-hidden', 'true');
  $('adm-modal-overlay').classList.remove('is-open');
}

$('adm-modal-close').addEventListener('click', closeModal);
$('adm-modal-overlay').addEventListener('click', closeModal);

// ─── Router ───────────────────────────────────────────────────────────────────

const MODULES = {
  dashboard:      { title: 'Dashboard',      render: renderDashboard },
  agenda:         { title: 'Agenda',         render: renderAgenda },
  experiencias:   { title: 'Experiências',   render: renderExperiencias },
  saidas:         { title: 'Saídas',         render: renderSaidas },
  reservas:       { title: 'Reservas',       render: renderReservas },
  participantes:  { title: 'Participantes',  render: renderParticipantes },
  financeiro:     { title: 'Financeiro',     render: renderFinanceiro },
  configuracoes:  { title: 'Configurações',  render: renderConfiguracoes },
};

let currentModule = '';

function navigate(hash) {
  const [mod, id] = (hash.replace('#', '') || 'dashboard').split('/');
  const m = MODULES[mod] ?? MODULES.dashboard;

  // Update nav
  document.querySelectorAll('.adm-nav__item').forEach(el => {
    el.classList.toggle('is-active', el.dataset.module === mod);
  });

  // Update topbar
  $('adm-title').textContent = m.title;
  $('adm-breadcrumb').textContent = '';
  $('adm-primary-action').style.display = 'none';

  // Render
  closeDrawer();
  const main = $('adm-main');
  main.innerHTML = '';
  currentModule = mod;

  m.render(main, id);
}

window.addEventListener('hashchange', () => navigate(location.hash));

// ─── Sidebar toggle ───────────────────────────────────────────────────────────

$('sidebar-toggle').addEventListener('click', () => {
  if (window.innerWidth <= 900) {
    document.body.classList.toggle('sidebar-open');
  } else {
    document.body.classList.toggle('sidebar-collapsed');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  MODULE: DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────

function renderDashboard(root) {
  const all = []; // DB-first: dados reais virão do Supabase via loadSupabaseCounters()

  const total     = all.reduce((s, b) => s + (b.totalAmount ?? 0), 0);
  const paid      = all.reduce((s, b) => s + (b.paidAmount  ?? 0), 0);
  const pending   = all.reduce((s, b) => s + (b.pendingAmount ?? 0), 0);
  const confirmed = all.filter(b => b.status === 'confirmed' || b.status === 'reserved').length;
  const cancelled = all.filter(b => b.status === 'cancelled').length;
  const overdue   = all.filter(b => b.status === 'reserved' && (b.pendingAmount ?? 0) > 0).length;

  // Next exits
  const now = new Date().toISOString().split('T')[0];
  const nextExits = EXPERIENCES.flatMap(exp =>
    (exp.nextExits ?? [])
      .filter(e => e.date >= now && e.status !== 'cancelled')
      .map(e => ({ exp, exit: e }))
  ).sort((a, b) => a.exit.date.localeCompare(b.exit.date)).slice(0, 5);

  // Recent bookings — será populado quando CRUD de reservas for implementado
  const recent = [];

  root.innerHTML = `
    <div class="adm-kpi-row">
      ${kpi('A Receber', fmt(pending), 'Total saldo pendente', 'green',
        `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`)}
      ${kpi('Confirmadas', confirmed, 'Reservas ativas', 'blue',
        `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`)}
      ${kpi('Inadimplentes', overdue, 'Saldo vencido', 'red',
        `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`)}
      ${kpi('Cancelamentos', cancelled, 'Total geral', 'gray',
        `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`)}
      ${kpi('Total Bruto', fmt(total), 'Volume de vendas', 'gold',
        `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`)}
      ${kpi('Total Recebido', fmt(paid), 'Pago + confirmado', 'purple',
        `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>`)}
    </div>

    <div class="adm-grid-2">
      <div class="adm-card">
        <div class="adm-card__header">
          Reservas recentes
          <div class="adm-card__actions">
            <a href="#reservas" class="adm-btn adm-btn--ghost adm-btn--sm">Ver todas</a>
          </div>
        </div>
        <div class="adm-table-wrap">
          <table class="adm-table">
            <thead><tr><th>Voucher</th><th>Responsável</th><th>Status</th><th>Valor</th></tr></thead>
            <tbody>
              ${recent.map(b => `
                <tr class="is-clickable" data-booking="${b.id}">
                  <td class="no-wrap text-small text-muted">${b.voucherCode ?? b.id}</td>
                  <td>
                    <div style="display:flex;align-items:center;gap:7px">
                      <div class="adm-avatar">${initials(b.payer?.fullName)}</div>
                      <div>
                        <div class="text-bold">${b.payer?.fullName ?? '—'}</div>
                        <div class="text-small text-muted">${fmtDateShort(b.createdAt)}</div>
                      </div>
                    </div>
                  </td>
                  <td>${badge(b.status)}</td>
                  <td class="no-wrap text-bold">${fmt(b.totalAmount ?? 0)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="adm-card">
        <div class="adm-card__header">
          Próximas saídas
          <div class="adm-card__actions">
            <a href="#agenda" class="adm-btn adm-btn--ghost adm-btn--sm">Agenda</a>
          </div>
        </div>
        <div class="adm-table-wrap">
          <table class="adm-table">
            <thead><tr><th>Data</th><th>Experiência</th><th>Ocupação</th><th>Vagas</th></tr></thead>
            <tbody>
              ${nextExits.length ? nextExits.map(({ exp, exit }) => {
                const booked = exit.spotsTotal - exit.spotsAvailable;
                const pct = (booked / exit.spotsTotal) * 100;
                return `<tr class="is-clickable" data-exit="${exit.id}">
                  <td class="no-wrap">${fmtDateShort(exit.date)}</td>
                  <td>${exp.title}</td>
                  <td style="min-width:120px">${occFill(pct)}</td>
                  <td class="text-bold">${exit.spotsAvailable}/${exit.spotsTotal}</td>
                </tr>`;
              }).join('') : `<tr><td colspan="4" class="adm-table__empty text-muted">Sem saídas futuras cadastradas.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  // Row click → booking drawer or exit drawer
  root.querySelectorAll('[data-booking]').forEach(tr => {
    tr.addEventListener('click', () => openBookingDrawer(tr.dataset.booking));
  });
  root.querySelectorAll('[data-exit]').forEach(tr => {
    tr.addEventListener('click', () => openExitDrawer(tr.dataset.exit));
  });
}

function kpi(label, value, sub, color, iconSvg) {
  return `<div class="adm-kpi">
    <div class="adm-kpi__icon adm-kpi__icon--${color}" style="float:right;margin:-4px -2px 0 0">${iconSvg}</div>
    <div class="adm-kpi__label">${label}</div>
    <div class="adm-kpi__value">${value}</div>
    <div class="adm-kpi__sub">${sub}</div>
  </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  MODULE: AGENDA
// ─────────────────────────────────────────────────────────────────────────────

function renderAgenda(root) {
  const today = new Date();
  let viewYear = today.getFullYear();
  let viewMonth = today.getMonth(); // 0-indexed
  let listView = false;

  function render() {
    const allExits = EXPERIENCES.flatMap(exp =>
      (exp.nextExits ?? []).map(e => ({ exp, exit: e }))
    );

    if (listView) {
      renderList();
    } else {
      renderCal();
    }
  }

  function renderCal() {
    const allExits = EXPERIENCES.flatMap(exp =>
      (exp.nextExits ?? []).map(e => ({ exp, exit: e }))
    );

    const firstDay = new Date(viewYear, viewMonth, 1);
    const lastDay  = new Date(viewYear, viewMonth + 1, 0);
    const startWeekday = firstDay.getDay(); // 0=Sun
    const monthName = firstDay.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

    // Build cells
    const cells = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) cells.push(d);

    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

    root.innerHTML = `
      <div class="adm-card">
        <div class="adm-card__header">
          <div class="adm-cal__nav" style="width:100%">
            <div style="display:flex;align-items:center;gap:8px">
              <button class="adm-btn adm-btn--secondary adm-btn--sm" id="cal-prev">← </button>
              <span class="adm-cal__month">${monthName.charAt(0).toUpperCase() + monthName.slice(1)}</span>
              <button class="adm-btn adm-btn--secondary adm-btn--sm" id="cal-next"> →</button>
              <button class="adm-btn adm-btn--ghost adm-btn--sm" id="cal-today">Hoje</button>
            </div>
            <div style="display:flex;gap:8px">
              <button class="adm-btn ${listView ? 'adm-btn--secondary' : 'adm-btn--primary'} adm-btn--sm" id="tog-cal">Calendário</button>
              <button class="adm-btn ${listView ? 'adm-btn--primary' : 'adm-btn--secondary'} adm-btn--sm" id="tog-list">Lista</button>
            </div>
          </div>
        </div>
        <div style="padding:16px">
          <div class="adm-cal__grid">
            ${['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(d => `<div class="adm-cal__weekday">${d}</div>`).join('')}
            ${cells.map(d => {
              if (d === null) return `<div class="adm-cal__day is-empty"></div>`;
              const ds = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
              const dayExits = allExits.filter(x => x.exit.date === ds);
              const isToday = ds === todayStr;
              return `<div class="adm-cal__day ${isToday ? 'is-today' : ''}" data-date="${ds}">
                <div class="adm-cal__daynum">${d}</div>
                ${dayExits.map(({ exp, exit }) => {
                  const pct = ((exit.spotsTotal - exit.spotsAvailable) / exit.spotsTotal) * 100;
                  const cls = exit.spotsAvailable === 0 ? 'is-sold' : pct >= 70 ? 'is-hot' : '';
                  return `<span class="adm-cal__evt ${cls}" data-exit="${exit.id}" title="${exp.title}">${exp.title.slice(0, 18)}</span>`;
                }).join('')}
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>`;

    root.querySelectorAll('.adm-cal__evt').forEach(el => {
      el.addEventListener('click', e => { e.stopPropagation(); openExitDrawer(el.dataset.exit); });
    });
    $('cal-prev').addEventListener('click', () => { viewMonth--; if (viewMonth < 0) { viewMonth = 11; viewYear--; } render(); });
    $('cal-next').addEventListener('click', () => { viewMonth++; if (viewMonth > 11) { viewMonth = 0; viewYear++; } render(); });
    $('cal-today').addEventListener('click', () => { viewYear = today.getFullYear(); viewMonth = today.getMonth(); render(); });
    $('tog-list').addEventListener('click', () => { listView = true; render(); });
    $('tog-cal').addEventListener('click', () => { listView = false; render(); });
  }

  function renderList() {
    const allExits = EXPERIENCES.flatMap(exp =>
      (exp.nextExits ?? []).map(e => ({ exp, exit: e }))
    ).sort((a, b) => a.exit.date.localeCompare(b.exit.date));

    root.innerHTML = `
      <div class="adm-card">
        <div class="adm-card__header">
          Todas as saídas
          <div style="display:flex;gap:8px">
            <button class="adm-btn adm-btn--secondary adm-btn--sm" id="tog-cal">Calendário</button>
            <button class="adm-btn adm-btn--primary adm-btn--sm" id="tog-list">Lista</button>
          </div>
        </div>
        <div class="adm-table-wrap">
          <table class="adm-table">
            <thead><tr><th>Data</th><th>Experiência</th><th>Vagas</th><th>Ocupação</th><th>Status</th><th></th></tr></thead>
            <tbody>
              ${allExits.map(({ exp, exit }) => {
                const booked = exit.spotsTotal - exit.spotsAvailable;
                const pct = (booked / exit.spotsTotal) * 100;
                const st = exit.spotsAvailable === 0 ? 'soldout' : 'active';
                return `<tr>
                  <td class="no-wrap">${fmtDate(exit.date)}</td>
                  <td>${exp.title}</td>
                  <td>${exit.spotsAvailable}/${exit.spotsTotal}</td>
                  <td style="min-width:120px">${occFill(pct)}</td>
                  <td><span class="badge badge--${st}">${st === 'soldout' ? 'Esgotada' : 'Aberta'}</span></td>
                  <td><button class="adm-btn adm-btn--ghost adm-btn--sm" data-exit="${exit.id}">Detalhes</button></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>`;

    root.querySelectorAll('[data-exit]').forEach(btn => {
      btn.addEventListener('click', () => openExitDrawer(btn.dataset.exit));
    });
    $('tog-cal').addEventListener('click',  () => { listView = false; render(); });
    $('tog-list').addEventListener('click', () => { listView = true;  render(); });
  }

  render();
}

// ─────────────────────────────────────────────────────────────────────────────
//  MODULE: EXPERIÊNCIAS
// ─────────────────────────────────────────────────────────────────────────────

function renderExperiencias(root) {
  root.innerHTML = `
    <div class="adm-card">
      <div class="adm-card__header">
        Experiências cadastradas
        <div class="adm-card__actions">
          <button class="adm-btn adm-btn--primary adm-btn--sm">+ Nova experiência</button>
        </div>
      </div>
      <div class="adm-table-wrap">
        <table class="adm-table">
          <thead><tr><th>Título</th><th>Categoria</th><th>Dificuldade</th><th>Preço</th><th>Próxima saída</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${EXPERIENCES.map(exp => {
              const next = exp.nextExits?.find(e => e.status === 'active');
              return `<tr>
                <td>
                  <div class="text-bold">${exp.title}</div>
                  <div class="text-small text-muted">${exp.location}</div>
                </td>
                <td class="text-small">${exp.category}</td>
                <td><span class="adm-tag">${exp.difficulty ?? '—'}</span></td>
                <td class="no-wrap">${fmt(exp.pricePerPerson)}</td>
                <td class="no-wrap text-small">${next ? fmtDate(next.date) : '—'}</td>
                <td><span class="badge badge--${exp.status === 'active' ? 'active' : 'cancelled'}">${exp.status === 'active' ? 'Ativa' : exp.status}</span></td>
                <td>
                  <div style="display:flex;gap:6px">
                    <a href="../experiencia.html?id=${exp.id}" target="_blank" class="adm-btn adm-btn--ghost adm-btn--sm">Ver</a>
                    <button class="adm-btn adm-btn--secondary adm-btn--sm" onclick="alert('Edição em breve')">Editar</button>
                  </div>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  MODULE: SAÍDAS
// ─────────────────────────────────────────────────────────────────────────────

function renderSaidas(root) {
  const allExits = EXPERIENCES.flatMap(exp =>
    (exp.nextExits ?? []).map(e => ({ exp, exit: e }))
  ).sort((a, b) => b.exit.date.localeCompare(a.exit.date));

  root.innerHTML = `
    <div class="adm-card">
      <div class="adm-filter-bar">
        <input type="search" class="adm-input" id="saidas-filter" placeholder="Filtrar por experiência ou data…" />
        <select id="saidas-status">
          <option value="">Todos os status</option>
          <option value="active">Aberta</option>
          <option value="sold_out">Esgotada</option>
          <option value="cancelled">Cancelada</option>
        </select>
        <span class="adm-filter-count" id="saidas-count"></span>
      </div>
      <div class="adm-table-wrap">
        <table class="adm-table">
          <thead><tr><th>Data</th><th>Experiência</th><th>Pontos de encontro</th><th>Vagas</th><th>Ocupação</th><th>Status</th><th></th></tr></thead>
          <tbody id="saidas-tbody"></tbody>
        </table>
      </div>
    </div>`;

  function renderRows(data) {
    const tbody = $('saidas-tbody');
    $('saidas-count').textContent = `${data.length} saída(s)`;
    tbody.innerHTML = data.map(({ exp, exit }) => {
      const booked = exit.spotsTotal - exit.spotsAvailable;
      const pct = (booked / exit.spotsTotal) * 100;
      const st = exit.spotsAvailable === 0 ? 'soldout' : exit.status === 'cancelled' ? 'cancelled' : 'active';
      return `<tr>
        <td class="no-wrap">${fmtDate(exit.date)}</td>
        <td class="text-bold">${exp.title}</td>
        <td class="text-small text-muted">${(exit.meetingPoints ?? []).map(mp => mp.name).join(' · ')}</td>
        <td>${booked}/${exit.spotsTotal}</td>
        <td style="min-width:130px">${occFill(pct)}</td>
        <td><span class="badge badge--${st}">${st === 'soldout' ? 'Esgotada' : st === 'cancelled' ? 'Cancelada' : 'Aberta'}</span></td>
        <td><button class="adm-btn adm-btn--ghost adm-btn--sm" data-exit="${exit.id}">Detalhes</button></td>
      </tr>`;
    }).join('') || `<tr><td colspan="7" class="adm-table__empty text-muted">Nenhuma saída encontrada.</td></tr>`;

    tbody.querySelectorAll('[data-exit]').forEach(btn => {
      btn.addEventListener('click', () => openExitDrawer(btn.dataset.exit));
    });
  }

  function filtered() {
    const q = $('saidas-filter').value.toLowerCase();
    const s = $('saidas-status').value;
    return allExits.filter(({ exp, exit }) => {
      const matchQ = !q || exp.title.toLowerCase().includes(q) || exit.date.includes(q);
      const matchS = !s || (s === 'sold_out' ? exit.spotsAvailable === 0 : exit.status === s);
      return matchQ && matchS;
    });
  }

  $('saidas-filter').addEventListener('input', () => renderRows(filtered()));
  $('saidas-status').addEventListener('change', () => renderRows(filtered()));
  renderRows(allExits);
}

// ─────────────────────────────────────────────────────────────────────────────
//  MODULE: RESERVAS
// ─────────────────────────────────────────────────────────────────────────────

function renderReservas(root, openId) {
  let allBookings = listBookings();

  const STATUS_TABS = [
    { key: 'all',             label: 'Todas'           },
    { key: 'pending_payment', label: 'Aguardando'      },
    { key: 'reserved',        label: 'Reservado'       },
    { key: 'confirmed',       label: 'Confirmado'      },
    { key: 'cancelled',       label: 'Cancelado'       },
    { key: 'completed',       label: 'Concluído'       },
  ];

  let activeTab = 'all';
  let search = '';

  function countTab(key) {
    return key === 'all' ? allBookings.length : allBookings.filter(b => b.status === key).length;
  }

  function renderTabs() {
    return STATUS_TABS.map(t => `
      <button class="adm-tab ${activeTab === t.key ? 'is-active' : ''}" data-tab="${t.key}">
        ${t.label} <span class="adm-count">${countTab(t.key)}</span>
      </button>`).join('');
  }

  function filtered() {
    return allBookings.filter(b => {
      const matchTab = activeTab === 'all' || b.status === activeTab;
      const q = search.toLowerCase();
      const matchSearch = !q ||
        b.payer?.fullName.toLowerCase().includes(q) ||
        (b.voucherCode ?? '').toLowerCase().includes(q) ||
        b.payer?.email.toLowerCase().includes(q) ||
        b.id.toLowerCase().includes(q);
      return matchTab && matchSearch;
    });
  }

  function renderTable(data) {
    const tbody = $('reservas-tbody');
    $('reservas-count').textContent = `${data.length} reserva(s)`;
    tbody.innerHTML = data.map(b => {
      const ref = findExit(b.exitId);
      return `<tr class="is-clickable" data-booking="${b.id}">
        <td class="no-wrap text-small text-muted">${b.voucherCode ?? b.id}</td>
        <td>
          <div style="display:flex;align-items:center;gap:7px">
            <div class="adm-avatar">${initials(b.payer?.fullName)}</div>
            <div>
              <div class="text-bold">${b.payer?.fullName ?? '—'}</div>
              <div class="text-small text-muted">${b.payer?.email ?? ''}</div>
            </div>
          </div>
        </td>
        <td class="text-small">${ref ? ref.exp.title : b.experienceId}</td>
        <td class="text-small no-wrap">${ref ? fmtDate(ref.exit.date) : '—'}</td>
        <td>${badge(b.status)}</td>
        <td class="text-bold no-wrap">${fmt(b.totalAmount ?? 0)}</td>
        <td class="no-wrap">
          ${(b.pendingAmount ?? 0) > 0
            ? `<span class="text-red text-bold">${fmt(b.pendingAmount)}</span>`
            : `<span class="text-green">Quitado</span>`}
        </td>
        <td class="text-small text-muted no-wrap">${fmtDate(b.createdAt)}</td>
      </tr>`;
    }).join('') || `<tr><td colspan="8" class="adm-table__empty text-muted">Nenhuma reserva.</td></tr>`;

    tbody.querySelectorAll('[data-booking]').forEach(tr => {
      tr.addEventListener('click', () => {
        allBookings = listBookings();
        openBookingDrawer(tr.dataset.booking);
      });
    });
  }

  root.innerHTML = `
    <div class="adm-card">
      <div class="adm-tabs" id="reservas-tabs">${renderTabs()}</div>
      <div class="adm-filter-bar">
        <input type="search" class="adm-input" id="reservas-search" placeholder="Buscar por nome, e-mail, voucher…" />
        <span class="adm-filter-count" id="reservas-count"></span>
      </div>
      <div class="adm-table-wrap">
        <table class="adm-table">
          <thead><tr><th>Voucher</th><th>Responsável</th><th>Experiência</th><th>Data</th><th>Status</th><th>Total</th><th>Saldo</th><th>Criado em</th></tr></thead>
          <tbody id="reservas-tbody"></tbody>
        </table>
      </div>
    </div>`;

  $('reservas-tabs').addEventListener('click', e => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    activeTab = btn.dataset.tab;
    $('reservas-tabs').innerHTML = renderTabs();
    // re-bind after innerHTML
    $('reservas-tabs').addEventListener('click', arguments.callee);
    renderTable(filtered());
  });

  $('reservas-search').addEventListener('input', e => {
    search = e.target.value;
    renderTable(filtered());
  });

  renderTable(filtered());
  if (openId) openBookingDrawer(openId);
}

// ─────────────────────────────────────────────────────────────────────────────
//  MODULE: PARTICIPANTES
// ─────────────────────────────────────────────────────────────────────────────

function renderParticipantes(root) {
  const all = listBookings();
  const participants = [];

  all.forEach(b => {
    (b.participants ?? []).forEach(p => {
      participants.push({
        ...p,
        bookingId: b.id,
        voucherCode: b.voucherCode,
        bookingStatus: b.status,
        experienceId: b.experienceId,
        exitId: b.exitId,
      });
    });
  });

  let search = '';

  function filtered() {
    const q = search.toLowerCase();
    return !q ? participants : participants.filter(p =>
      p.fullName?.toLowerCase().includes(q) ||
      p.docNumber?.toLowerCase().includes(q)
    );
  }

  function renderTable(data) {
    const tbody = $('part-tbody');
    $('part-count').textContent = `${data.length} participante(s)`;
    tbody.innerHTML = data.map(p => {
      const ref = findExit(p.exitId);
      return `<tr>
        <td>
          <div style="display:flex;align-items:center;gap:7px">
            <div class="adm-avatar">${initials(p.fullName)}</div>
            <div class="text-bold">${p.fullName}</div>
          </div>
        </td>
        <td class="text-small text-muted">${p.docNumber || '—'}</td>
        <td class="text-small">${p.profile ?? '—'}</td>
        <td class="text-small text-muted">${p.birthdate ? fmtDate(p.birthdate) : '—'}</td>
        <td class="text-small">${ref ? ref.exp.title : p.experienceId}</td>
        <td class="text-small no-wrap">${ref ? fmtDate(ref.exit.date) : '—'}</td>
        <td>${badge(p.bookingStatus)}</td>
        <td><button class="adm-btn adm-btn--ghost adm-btn--sm" data-booking="${p.bookingId}">Reserva</button></td>
      </tr>`;
    }).join('') || `<tr><td colspan="8" class="adm-table__empty text-muted">Nenhum participante.</td></tr>`;

    tbody.querySelectorAll('[data-booking]').forEach(btn => {
      btn.addEventListener('click', () => openBookingDrawer(btn.dataset.booking));
    });
  }

  root.innerHTML = `
    <div class="adm-card">
      <div class="adm-filter-bar">
        <input type="search" class="adm-input" id="part-search" placeholder="Buscar por nome ou documento…" />
        <span class="adm-filter-count" id="part-count"></span>
      </div>
      <div class="adm-table-wrap">
        <table class="adm-table">
          <thead><tr><th>Nome</th><th>Documento</th><th>Perfil</th><th>Nascimento</th><th>Experiência</th><th>Data saída</th><th>Reserva</th><th></th></tr></thead>
          <tbody id="part-tbody"></tbody>
        </table>
      </div>
    </div>`;

  $('part-search').addEventListener('input', e => { search = e.target.value; renderTable(filtered()); });
  renderTable(filtered());
}

// ─────────────────────────────────────────────────────────────────────────────
//  MODULE: FINANCEIRO
// ─────────────────────────────────────────────────────────────────────────────

function renderFinanceiro(root) {
  const all = listBookings();

  const totalBruto  = all.reduce((s, b) => s + (b.totalAmount ?? 0), 0);
  const totalPago   = all.reduce((s, b) => s + (b.paidAmount  ?? 0), 0);
  const totalPend   = all.reduce((s, b) => s + (b.pendingAmount ?? 0), 0);
  const totalCancelled = all.filter(b => b.status === 'cancelled').reduce((s, b) => s + (b.paidAmount ?? 0), 0);

  let activeTab = 'all';

  const TABS = [
    { key: 'all',       label: 'Todos' },
    { key: 'paid',      label: 'Pagos' },
    { key: 'pending',   label: 'Pendentes' },
    { key: 'overdue',   label: 'Atrasados' },
    { key: 'cancelled', label: 'Cancelados/Créditos' },
  ];

  function tabBookings(key) {
    if (key === 'paid')      return all.filter(b => (b.pendingAmount ?? 0) === 0 && b.status !== 'cancelled' && b.status !== 'draft');
    if (key === 'pending')   return all.filter(b => (b.pendingAmount ?? 0) > 0 && b.status !== 'cancelled');
    if (key === 'overdue')   return all.filter(b => (b.pendingAmount ?? 0) > 0 && b.status === 'reserved');
    if (key === 'cancelled') return all.filter(b => b.status === 'cancelled');
    return all;
  }

  function renderTabs() {
    return TABS.map(t => `
      <button class="adm-tab ${activeTab === t.key ? 'is-active' : ''}" data-ftab="${t.key}">
        ${t.label} <span class="adm-count">${tabBookings(t.key).length}</span>
      </button>`).join('');
  }

  function renderFTable(data) {
    const tbody = $('fin-tbody');
    tbody.innerHTML = data.length ? data.map(b => {
      const ref = findExit(b.exitId);
      const pending = b.pendingAmount ?? 0;
      return `<tr class="is-clickable" data-booking="${b.id}">
        <td class="text-small text-muted no-wrap">${b.voucherCode ?? b.id}</td>
        <td>
          <div class="text-bold">${b.payer?.fullName ?? '—'}</div>
          <div class="text-small text-muted">${b.payer?.email ?? ''}</div>
        </td>
        <td class="text-small">${ref ? ref.exp.title : b.experienceId}</td>
        <td class="text-small no-wrap">${ref ? fmtDate(ref.exit.date) : '—'}</td>
        <td class="text-small">${payMethodLabel(b.paymentMethod)}</td>
        <td class="text-bold no-wrap">${fmt(b.totalAmount ?? 0)}</td>
        <td class="no-wrap text-green text-bold">${fmt(b.paidAmount ?? 0)}</td>
        <td class="no-wrap ${pending > 0 ? 'text-red' : 'text-muted'} text-bold">${pending > 0 ? fmt(pending) : '—'}</td>
        <td>${badge(b.status)}</td>
        <td>
          ${pending > 0 ? `<button class="adm-btn adm-btn--gold adm-btn--sm" data-pay="${b.id}">+ Pagamento</button>` : ''}
        </td>
      </tr>`;
    }).join('') : `<tr><td colspan="10" class="adm-table__empty text-muted">Nenhuma transação.</td></tr>`;

    tbody.querySelectorAll('[data-booking]').forEach(tr => {
      tr.addEventListener('click', e => { if (e.target.closest('[data-pay]')) return; openBookingDrawer(tr.dataset.booking); });
    });
    tbody.querySelectorAll('[data-pay]').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); openRegisterPaymentModal(btn.dataset.pay); });
    });
  }

  root.innerHTML = `
    <div class="adm-kpi-row">
      ${kpi('Faturamento bruto', fmt(totalBruto), 'Total de vendas', 'green', '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg>')}
      ${kpi('Total recebido', fmt(totalPago), 'Pagamentos confirmados', 'blue', '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>')}
      ${kpi('A receber', fmt(totalPend), 'Saldo pendente', 'gold', '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>')}
      ${kpi('Cancelados/Créditos', fmt(totalCancelled), 'Valor pago em canceladas', 'red', '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>')}
    </div>

    <div class="adm-card">
      <div class="adm-tabs" id="fin-tabs">${renderTabs()}</div>
      <div style="padding:12px 16px;display:flex;justify-content:flex-end;gap:8px">
        <button class="adm-btn adm-btn--secondary adm-btn--sm" id="fin-export">⬇ Exportar CSV</button>
      </div>
      <div class="adm-table-wrap">
        <table class="adm-table">
          <thead><tr><th>Voucher</th><th>Responsável</th><th>Experiência</th><th>Data</th><th>Método</th><th>Total</th><th>Pago</th><th>Pendente</th><th>Status</th><th></th></tr></thead>
          <tbody id="fin-tbody"></tbody>
        </table>
      </div>
    </div>`;

  document.getElementById('fin-tabs').addEventListener('click', e => {
    const btn = e.target.closest('[data-ftab]');
    if (!btn) return;
    activeTab = btn.dataset.ftab;
    document.getElementById('fin-tabs').innerHTML = renderTabs();
    document.getElementById('fin-tabs').dispatchEvent; // rebind
    document.getElementById('fin-tabs').addEventListener('click', arguments.callee);
    renderFTable(tabBookings(activeTab));
  });

  $('fin-export').addEventListener('click', () => exportCSV(tabBookings(activeTab)));
  renderFTable(tabBookings(activeTab));
}

function exportCSV(data) {
  const cols = ['Voucher','Responsável','E-mail','Experiência','Método','Total','Pago','Pendente','Status'];
  const rows = data.map(b => {
    const ref = findExit(b.exitId);
    return [
      b.voucherCode ?? b.id,
      b.payer?.fullName ?? '',
      b.payer?.email ?? '',
      ref ? ref.exp.title : b.experienceId,
      payMethodLabel(b.paymentMethod),
      b.totalAmount ?? 0,
      b.paidAmount  ?? 0,
      b.pendingAmount ?? 0,
      STATUS_LABEL[b.status] ?? b.status,
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
  });

  const csv = [cols.join(','), ...rows].join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `anaua-financeiro-${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
  toast('CSV exportado com sucesso!', 'success');
}

// ─────────────────────────────────────────────────────────────────────────────
//  MODULE: CONFIGURAÇÕES
// ─────────────────────────────────────────────────────────────────────────────

function renderConfiguracoes(root) {
  root.innerHTML = `
    <div style="max-width:680px">

      <div class="adm-config-section">
        <div class="adm-config-section__title">Empresa</div>
        <div class="adm-config-section__body">
          <div class="adm-field"><label>Nome da empresa</label><input class="adm-input" value="Anauá Ecoturismo" /></div>
          <div class="adm-grid-2">
            <div class="adm-field"><label>E-mail de contato</label><input class="adm-input" value="contato@anaua.com.br" /></div>
            <div class="adm-field"><label>WhatsApp</label><input class="adm-input" value="(21) 99000-0000" /></div>
          </div>
          <div class="adm-field"><label>CNPJ</label><input class="adm-input" value="00.000.000/0001-00" /></div>
          <button class="adm-btn adm-btn--primary" onclick="alert('Dados salvos (demo)') || void 0">Salvar</button>
        </div>
      </div>

      <div class="adm-config-section">
        <div class="adm-config-section__title">Reservas</div>
        <div class="adm-config-section__body">
          ${configRow('Confirmação automática', 'Confirmar reservas automaticamente após pagamento', true)}
          ${configRow('Enviar voucher por e-mail', 'E-mail com voucher ao responsável após pagamento', true)}
          ${configRow('Permitir sinal + saldo', 'Habilitar pagamento em duas etapas', true)}
          ${configRow('Aceite de imagem obrigatório', 'Tornar consentimento de imagem obrigatório', false)}
        </div>
      </div>

      <div class="adm-config-section">
        <div class="adm-config-section__title">Notificações</div>
        <div class="adm-config-section__body">
          ${configRow('Nova reserva', 'Notificar ao criar nova reserva', true)}
          ${configRow('Pagamento recebido', 'Notificar ao registrar pagamento', true)}
          ${configRow('Saldo vencido', 'Alertar quando saldo ultrapassar vencimento', true)}
          ${configRow('Saída próxima (48h)', 'Lembrete 48h antes de cada saída', false)}
        </div>
      </div>

      <div class="adm-config-section">
        <div class="adm-config-section__title">Dados e LGPD</div>
        <div class="adm-config-section__body">
          <div class="adm-config-row">
            <div class="adm-config-row__info">
              <div class="adm-config-row__label">Versão dos termos ativa</div>
              <div class="adm-config-row__desc">Altere apenas quando os termos forem revisados</div>
            </div>
            <input class="adm-input" value="2026-01" style="width:100px" />
          </div>
          <div class="adm-config-row" style="margin-top:12px;border:none">
            <button class="adm-btn adm-btn--danger adm-btn--sm" onclick="if(confirm('Limpar TODOS os dados de teste?')) { localStorage.clear(); toast('Dados limpos.','info'); }">Limpar dados de teste</button>
          </div>
        </div>
      </div>

    </div>`;
}

function configRow(label, desc, defaultOn) {
  const id = 'cfg-' + label.replace(/\s/g, '-').toLowerCase();
  return `<div class="adm-config-row">
    <div class="adm-config-row__info">
      <div class="adm-config-row__label">${label}</div>
      <div class="adm-config-row__desc">${desc}</div>
    </div>
    <label class="adm-toggle">
      <input type="checkbox" id="${id}" ${defaultOn ? 'checked' : ''} />
      <span class="adm-toggle__track"></span>
    </label>
  </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  BOOKING DRAWER
// ─────────────────────────────────────────────────────────────────────────────

function openBookingDrawer(bookingId) {
  const b = getBooking(bookingId);
  if (!b) { toast('Reserva não encontrada', 'error'); return; }

  const ref = findExit(b.exitId);
  const exp = ref?.exp;
  const exit = ref?.exit;

  // Status timeline
  const statusOrder = ['draft','pending_payment','reserved','confirmed','completed'];
  const currentIdx  = statusOrder.indexOf(b.status);
  const isCancelled = b.status === 'cancelled' || b.status === 'no_show';

  const timelineHtml = statusOrder.map((s, i) => {
    const done = !isCancelled && i <= currentIdx;
    return `<div class="adm-tl-item ${done ? 'is-done' : ''}">
      <div class="adm-tl-item__label">${STATUS_LABEL[s]}</div>
    </div>`;
  }).join('') + (isCancelled ? `<div class="adm-tl-item" style="--c:#ef4444">
    <div class="adm-tl-item__label" style="color:#ef4444">${STATUS_LABEL[b.status]}</div>
  </div>` : '');

  // Payment history
  const payHist = (b.paymentHistory ?? []).map(p => `
    <div class="adm-pay-row">
      <div class="adm-pay-row__icon" style="background:#d1fae5">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <div class="adm-pay-row__info">
        <div class="text-bold">${payMethodLabel(p.method)}</div>
        <div class="text-small text-muted">${fmtDate(p.paidAt)} · ID: ${p.transactionId}</div>
      </div>
      <div class="adm-pay-row__amount is-positive">${fmt(p.amountPaid)}</div>
    </div>`).join('') || '<div class="text-muted text-small">Nenhum pagamento registrado.</div>';

  // Participants
  const partsHtml = (b.participants ?? []).map(p => `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--adm-border)">
      <div class="adm-avatar">${initials(p.fullName)}</div>
      <div style="flex:1">
        <div class="text-bold">${p.fullName}</div>
        <div class="text-small text-muted">${p.profile ?? ''} · ${p.birthdate ? fmtDate(p.birthdate) : '—'}</div>
      </div>
      ${p.docNumber ? `<span class="text-small text-muted">${p.docNumber}</span>` : ''}
    </div>`).join('') || '<div class="text-muted text-small">Sem participantes.</div>';

  // Available actions
  const avail = STATUS_TRANSITIONS[b.status] ?? [];
  const actionBtns = [
    avail.includes('confirmed') ? `<button class="adm-btn adm-btn--primary adm-btn--sm" data-action="confirm">✓ Confirmar</button>` : '',
    avail.includes('cancelled') ? `<button class="adm-btn adm-btn--danger adm-btn--sm" data-action="cancel">✗ Cancelar</button>` : '',
    avail.includes('completed') ? `<button class="adm-btn adm-btn--secondary adm-btn--sm" data-action="complete">Concluir</button>` : '',
    (b.pendingAmount ?? 0) > 0  ? `<button class="adm-btn adm-btn--gold adm-btn--sm" data-action="pay">+ Registrar pagamento</button>` : '',
    `<button class="adm-btn adm-btn--ghost adm-btn--sm" data-action="msg">✉ Reenviar mensagem</button>`,
  ].filter(Boolean).join('');

  const html = `
    <div class="adm-actions-strip">${actionBtns}</div>

    <div class="adm-section">
      <div class="adm-section__title">Status da reserva</div>
      <div class="adm-timeline">${timelineHtml}</div>
    </div>

    <div class="adm-section">
      <div class="adm-section__title">Experiência</div>
      <div class="adm-dl">
        <dt>Título</dt><dd>${exp?.title ?? b.experienceId}</dd>
        <dt>Data</dt><dd>${exit ? fmtDate(exit.date) : '—'}</dd>
        <dt>Ponto</dt><dd>${exit?.meetingPoints?.find(mp => mp.id === b.meetingPointId)?.name ?? '—'}</dd>
        <dt>Voucher</dt><dd><strong>${b.voucherCode ?? b.id}</strong></dd>
      </div>
    </div>

    <div class="adm-section">
      <div class="adm-section__title">Responsável / Pagador</div>
      <div class="adm-dl">
        <dt>Nome</dt><dd>${b.payer?.fullName ?? '—'}</dd>
        <dt>CPF</dt><dd>${b.payer?.cpf ?? '—'}</dd>
        <dt>E-mail</dt><dd>${b.payer?.email ?? '—'}</dd>
        <dt>Telefone</dt><dd>${b.payer?.phone ?? '—'}</dd>
        <dt>Nascimento</dt><dd>${b.payer?.birthdate ? fmtDate(b.payer.birthdate) : '—'}</dd>
      </div>
    </div>

    <div class="adm-section">
      <div class="adm-section__title">Participantes (${(b.participants ?? []).length})</div>
      ${partsHtml}
    </div>

    <div class="adm-section">
      <div class="adm-section__title">Contato de emergência</div>
      <div class="adm-dl">
        <dt>Nome</dt><dd>${b.emergencyContact?.fullName ?? '—'}</dd>
        <dt>Telefone</dt><dd>${b.emergencyContact?.phone ?? '—'}</dd>
        <dt>Relação</dt><dd>${b.emergencyContact?.relationship ?? '—'}</dd>
      </div>
    </div>

    <div class="adm-section">
      <div class="adm-section__title">Financeiro</div>
      <div class="adm-dl">
        <dt>Método</dt><dd>${payMethodLabel(b.paymentMethod)}</dd>
        <dt>Total</dt><dd class="text-bold">${fmt(b.totalAmount ?? 0)}</dd>
        <dt>Pago</dt><dd class="text-green text-bold">${fmt(b.paidAmount ?? 0)}</dd>
        <dt>Saldo</dt><dd class="${(b.pendingAmount ?? 0) > 0 ? 'text-red' : 'text-muted'} text-bold">${(b.pendingAmount ?? 0) > 0 ? fmt(b.pendingAmount) : 'Quitado'}</dd>
      </div>
      <div style="margin-top:14px">${payHist}</div>
    </div>

    ${b.notes ? `<div class="adm-section">
      <div class="adm-section__title">Observações</div>
      <p style="font-size:13px;color:var(--adm-text-2);line-height:1.6">${b.notes}</p>
    </div>` : ''}

    <div class="adm-section">
      <div class="adm-section__title">Aceites / Documentos</div>
      <div class="adm-dl">
        <dt>Termos</dt><dd>${b.termsAcceptance?.terms ? '✓ Aceito' : '—'}</dd>
        <dt>Cancelamento</dt><dd>${b.termsAcceptance?.cancellation ? '✓ Aceito' : '—'}</dd>
        <dt>Risco</dt><dd>${b.termsAcceptance?.riskAwareness ? '✓ Aceito' : '—'}</dd>
        <dt>Imagem</dt><dd>${b.termsAcceptance?.imageConsent ? '✓ Aceito' : 'Recusado'}</dd>
        <dt>Versão</dt><dd>${b.termsAcceptance?.version ?? '—'}</dd>
        <dt>Data</dt><dd>${b.termsAcceptance?.acceptedAt ? fmtDate(b.termsAcceptance.acceptedAt) : '—'}</dd>
      </div>
    </div>
  `;

  openDrawer(`Reserva ${b.voucherCode ?? b.id}`, html);

  // Action buttons
  document.querySelector('[data-action="confirm"]')?.addEventListener('click', () => {
    try {
      transitionStatus(b.id, 'confirmed');
      toast('Reserva confirmada!', 'success');
      closeDrawer();
      if (currentModule === 'reservas') renderReservas($('adm-main'));
      else if (currentModule === 'dashboard') renderDashboard($('adm-main'));
    } catch (e) { toast(e.message, 'error'); }
  });

  document.querySelector('[data-action="cancel"]')?.addEventListener('click', () => {
    if (!confirm('Confirma o cancelamento desta reserva?')) return;
    try {
      transitionStatus(b.id, 'cancelled');
      toast('Reserva cancelada.', 'info');
      closeDrawer();
      if (currentModule === 'reservas') renderReservas($('adm-main'));
      else if (currentModule === 'dashboard') renderDashboard($('adm-main'));
    } catch (e) { toast(e.message, 'error'); }
  });

  document.querySelector('[data-action="complete"]')?.addEventListener('click', () => {
    try {
      transitionStatus(b.id, 'completed');
      toast('Reserva concluída!', 'success');
      closeDrawer();
    } catch (e) { toast(e.message, 'error'); }
  });

  document.querySelector('[data-action="pay"]')?.addEventListener('click', () => {
    closeDrawer();
    openRegisterPaymentModal(b.id);
  });

  document.querySelector('[data-action="msg"]')?.addEventListener('click', () => {
    toast(`Mensagem reenviada para ${b.payer?.email}`, 'info');
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  EXIT DRAWER
// ─────────────────────────────────────────────────────────────────────────────

function openExitDrawer(exitId) {
  const ref = findExit(exitId);
  if (!ref) { toast('Saída não encontrada', 'error'); return; }
  const { exp, exit } = ref;

  const bookings = listBookings().filter(b => b.exitId === exitId);
  const booked = exit.spotsTotal - exit.spotsAvailable;
  const pct = (booked / exit.spotsTotal) * 100;

  const mpHtml = (exit.meetingPoints ?? []).map(mp => `
    <div style="padding:8px 0;border-bottom:1px solid var(--adm-border);font-size:13px">
      <div class="text-bold">${mp.name}</div>
      <div class="text-small text-muted">${mp.address} · ${mp.time}</div>
    </div>`).join('');

  const bkHtml = bookings.length ? bookings.map(b => `
    <div class="adm-pay-row" style="cursor:pointer" data-booking="${b.id}">
      <div class="adm-avatar">${initials(b.payer?.fullName)}</div>
      <div class="adm-pay-row__info">
        <div class="text-bold">${b.payer?.fullName ?? '—'}</div>
        <div class="text-small text-muted">${b.voucherCode ?? b.id} · ${(b.participants ?? []).length} pax</div>
      </div>
      ${badge(b.status)}
    </div>`).join('') : '<div class="text-muted text-small">Nenhuma reserva ainda.</div>';

  const html = `
    <div class="adm-section">
      <div class="adm-section__title">Saída</div>
      <div class="adm-dl">
        <dt>Experiência</dt><dd class="text-bold">${exp.title}</dd>
        <dt>Data</dt><dd>${fmtDate(exit.date)}</dd>
        <dt>Status</dt><dd>${exit.spotsAvailable === 0 ? '<span class="badge badge--soldout">Esgotada</span>' : '<span class="badge badge--active">Aberta</span>'}</dd>
      </div>
    </div>

    <div class="adm-section">
      <div class="adm-section__title">Ocupação</div>
      ${occFill(pct)}
      <div class="text-small text-muted mt-12">${booked} reservados de ${exit.spotsTotal} vagas</div>
    </div>

    <div class="adm-section">
      <div class="adm-section__title">Pontos de encontro</div>
      ${mpHtml}
    </div>

    <div class="adm-section">
      <div class="adm-section__title">Reservas nesta saída (${bookings.length})</div>
      ${bkHtml}
    </div>
  `;

  openDrawer(`${exp.title} — ${fmtDate(exit.date)}`, html);

  document.querySelectorAll('[data-booking]').forEach(el => {
    el.addEventListener('click', () => {
      closeDrawer();
      setTimeout(() => openBookingDrawer(el.dataset.booking), 200);
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  REGISTER PAYMENT MODAL
// ─────────────────────────────────────────────────────────────────────────────

function openRegisterPaymentModal(bookingId) {
  const b = getBooking(bookingId);
  if (!b) return;

  const pending = b.pendingAmount ?? 0;

  openModal(
    'Registrar Pagamento',
    `<div class="adm-field">
      <label>Valor recebido (R$)</label>
      <input class="adm-input" type="number" id="pay-amount" value="${pending}" min="1" max="${pending}" step="0.01" />
    </div>
    <div class="adm-field">
      <label>Método</label>
      <select class="adm-select" id="pay-method">
        <option value="pix">PIX</option>
        <option value="credit_card">Cartão de crédito</option>
        <option value="cash">Dinheiro</option>
        <option value="bank_transfer">Transferência</option>
      </select>
    </div>
    <div class="adm-field">
      <label>Observação (opcional)</label>
      <textarea class="adm-textarea" id="pay-note" placeholder="Ex: segunda parcela do sinal"></textarea>
    </div>
    <p class="text-small text-muted mt-12">Saldo pendente atual: <strong>${fmt(pending)}</strong></p>`,
    `<button class="adm-btn adm-btn--secondary" id="pay-cancel-btn">Cancelar</button>
     <button class="adm-btn adm-btn--gold" id="pay-confirm-btn">Confirmar pagamento</button>`
  );

  $('pay-cancel-btn').addEventListener('click', closeModal);
  $('pay-confirm-btn').addEventListener('click', () => {
    const amount = parseFloat($('pay-amount').value);
    const method = $('pay-method').value;
    if (!amount || amount <= 0) { toast('Valor inválido', 'error'); return; }

    const result = {
      success: true,
      transactionId: 'MAN-' + Date.now(),
      method,
      amountPaid: amount,
      paidAt: new Date().toISOString(),
      pixCode: null, pixQrData: null,
      errorCode: null, errorMsg: null,
    };
    recordPayment(bookingId, result, amount);
    toast(`Pagamento de ${fmt(amount)} registrado!`, 'success');
    closeModal();

    // If pending now = 0, auto-confirm if reserved
    const updated = getBooking(bookingId);
    if (updated && (updated.pendingAmount ?? 0) === 0 && updated.status === 'reserved') {
      try { transitionStatus(bookingId, 'confirmed'); toast('Reserva confirmada automaticamente!', 'success'); }
      catch { /* ok */ }
    }

    // Refresh current module
    if (currentModule === 'financeiro') renderFinanceiro($('adm-main'));
    else if (currentModule === 'reservas') renderReservas($('adm-main'));
    else if (currentModule === 'dashboard') renderDashboard($('adm-main'));
  });
}

// ─── Global search ────────────────────────────────────────────────────────────

$('adm-global-search').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const q = e.target.value.trim();
  if (!q) return;
  const found = listBookings().find(b =>
    b.voucherCode?.toLowerCase().includes(q.toLowerCase()) ||
    b.payer?.fullName.toLowerCase().includes(q.toLowerCase())
  );
  if (found) {
    openBookingDrawer(found.id);
    e.target.value = '';
  } else {
    toast('Nenhuma reserva encontrada', 'error');
  }
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
// seedMockBookings() removida — dashboard carrega dados do Supabase

// ─── Supabase Auth Guard (async) ──────────────────────────────────────────────
// Inicializa o cliente Supabase reutilizando a mesma URL/key do projeto
(function initAdminSupabase() {
  if (window.supabase && !window.anauaDb) {
    window.anauaDb = window.supabase.createClient(
      'https://dmclvlarnoimrrfndcsx.supabase.co',
      'sb_publishable_5uEhWBG8FOnhK4FmoNfFcQ_4MP1jNbS'
    );
  }
})();

(async function validateAdminSession() {
  const db = window.anauaDb;

  if (!db) {
    // CDN não carregou — sem fallback, bloqueia acesso
    console.warn('[admin-auth] Supabase CDN não carregado. Redirecionando para login.');
    console.log('[admin-auth] Redirecionando para login');
    location.replace('login.html');
    return;
  }

  try {
    const { data: { user }, error } = await db.auth.getUser();

    if (!user || error) {
      console.log('[admin-auth] Redirecionando para login');
      location.replace('login.html');
      return;
    }

    console.log('[admin-auth] Usuário autenticado encontrado:', user.email);

    const { data: profile, error: profileError } = await db
      .from('profiles')
      .select('id, email, display_name, role')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('[admin-auth] Erro ao carregar perfil:', profileError.message, '| code:', profileError.code);
      document.body.style.visibility = 'visible';
      $('adm-main').innerHTML = `
        <div class="adm-empty" style="padding:var(--adm-sp-8);text-align:center">
          <p style="color:var(--adm-danger);font-size:1.1rem;font-weight:600">Não foi possível validar seu perfil administrativo.</p>
          <p style="color:var(--adm-text-muted);margin-top:8px">Verifique o console para detalhes ou tente novamente.</p>
          <button onclick="adminLogout()" class="adm-btn adm-btn--primary" style="margin-top:20px;display:inline-flex">Sair e voltar ao login</button>
        </div>`;
      return;
    }

    if (!profile) {
      console.warn('[admin-auth] Acesso negado — perfil não encontrado no Supabase');
      await db.auth.signOut();
      location.replace('login.html');
      return;
    }

    console.log('[admin-auth] Perfil carregado — role:', profile.role);
    console.log('[admin-auth] Role detectada:', profile.role);

    if (!['admin', 'operator'].includes(profile.role)) {
      console.warn('[admin-auth] Acesso negado — role:', profile.role);
      document.body.style.visibility = 'visible';
      $('adm-main').innerHTML = `
        <div class="adm-empty" style="padding:var(--adm-sp-8);text-align:center">
          <p style="color:var(--adm-danger);font-size:1.1rem;font-weight:600">Acesso não autorizado.</p>
          <p style="color:var(--adm-text-muted);margin-top:8px">Você não tem permissão para acessar o backoffice.</p>
          <div style="display:flex;gap:12px;justify-content:center;margin-top:20px">
            <button onclick="adminLogout()" class="adm-btn adm-btn--primary">Sair e voltar ao login</button>
            <a href="../index.html" class="adm-btn adm-btn--ghost">Voltar ao site</a>
          </div>
        </div>`;
      return;
    }

    console.log('[admin-auth] Acesso autorizado —', user.email);

    // Popula informações do usuário
    const displayName = profile.display_name ?? user.email.split('@')[0];
    const userNameEl  = $('adm-user-name');
    const avatarEl    = $('adm-user-avatar');
    if (userNameEl) userNameEl.textContent = displayName;
    if (avatarEl)   avatarEl.textContent   = displayName[0].toUpperCase();

    document.body.style.visibility = 'visible';

    // Contadores reais do Supabase carregados após navigate() inicial
    loadSupabaseCounters();
    console.log('[admin-db] Dashboard carregado do Supabase');

  } catch (err) {
    console.error('[admin-auth] Erro ao validar sessão:', err);
    console.log('[admin-auth] Redirecionando para login');
    location.replace('login.html');
  }
})();

/**
 * Carrega contadores reais do Supabase e adiciona uma linha de KPIs
 * abaixo dos KPIs locais no dashboard.
 * Se a RLS bloquear alguma query, exibe '—' sem quebrar.
 */
async function loadSupabaseCounters() {
  const db = window.anauaDb;
  if (!db) return;

  const safeCount = async (query) => {
    try {
      const { count, error } = await query;
      if (error) { console.warn('[admin] Contagem bloqueada por RLS ou erro:', error.message); return '—'; }
      return count ?? '—';
    } catch (_) { return '—'; }
  };

  const [expCount, depCount, resCount, pendCount] = await Promise.all([
    safeCount(db.from('experiences').select('*', { count: 'exact', head: true }).eq('is_active', true)),
    safeCount(db.from('departures').select('*', { count: 'exact', head: true }).eq('status', 'scheduled')),
    safeCount(db.from('reservations').select('*', { count: 'exact', head: true })),
    safeCount(db.from('reservations').select('*', { count: 'exact', head: true }).eq('status', 'pending_payment')),
  ]);

  const kpiRow = document.querySelector('.adm-kpi-row');
  if (!kpiRow) return;

  const row = document.createElement('div');
  row.className = 'adm-kpi-row';
  row.setAttribute('aria-label', 'Contadores do Supabase');
  row.innerHTML = [
    kpi('Experiências ativas', expCount,  'catálogo Supabase',           'green',  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/></svg>`),
    kpi('Saídas agendadas',    depCount,  'tabela departures',           'blue',   `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`),
    kpi('Total de reservas',   resCount,  'tabela reservations',         'purple', `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`),
    kpi('Pagamentos pendentes', pendCount, 'aguardando no Supabase',     'red',    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`),
  ].join('');
  kpiRow.parentElement?.insertBefore(row, kpiRow.nextSibling);

  if ([expCount, depCount, resCount, pendCount].some(v => v === '—')) {
    toast('Alguns contadores bloqueados por RLS — configure permissões no Supabase.', 'warn');
  }
}

// Logout
$('admin-logout-btn')?.addEventListener('click', () => {
  toast('Saindo do backoffice…', 'info');
  setTimeout(adminLogout, 800);
});

$('adm-notif-dot').classList.add('is-visible');
navigate(location.hash || '#dashboard');
