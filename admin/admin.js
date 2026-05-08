/**
 * @fileoverview admin.js — Backoffice SPA controller for Anauá Ecoturismo.
 *
 * Modules: dashboard | agenda | experiencias | saidas | reservas | participantes | financeiro | configuracoes
 *
 * Architecture:
 *  - Hash router: location.hash = '#module' or '#module/id'
 *  - All data sourced from Supabase (window.anauaDb) — DB-first, no localStorage mocks
 */

import { formatBRL, formatDate } from '../assets/js/data.js';
import { STATUS_LABEL, STATUS_CLASS, STATUS_TRANSITIONS } from '../assets/js/types/booking.types.js';
import { createExperience, updateExperience, createDeparture, updateDeparture, setDepartureStatus, deleteDeparture, createExperienceBundle, getExperienceById } from '../assets/js/repositories/experienceRepo.js';
import {
  listActiveBoardingPoints, listAllBoardingPoints,
  createBoardingPoint, updateBoardingPoint, deleteBoardingPoint,
  listAllBoardingPointsByDeparture,
  saveDepartureBoardingPoints,
  // aliases legados
  createBoardingPoints, replaceBoardingPoints,
} from '../assets/js/repositories/boardingPointRepo.js';
// ReservationStore removido — dados vêm do Supabase

// ─── Admin auth guard ─────────────────────────────────────────────────────────
// Oculta o body imediatamente para evitar flash de conteúdo antes da validação
document.body.style.visibility = 'hidden';

// ─── Logout helper ────────────────────────────────────────────────────────────
function adminLogout() {
  localStorage.removeItem('anaua_admin_session');
  sessionStorage.removeItem('anaua_admin_session');
  if (window.anauaDb) window.anauaDb.auth.signOut();
  console.log('[auth] Logout realizado');
  location.replace('login.html');
}



// seedMockBookings removida — mock data removido completamente

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

/** Formata CPF: digits → 000.000.000-00 */
function fmtCpfAdmin(v) {
  const d = String(v ?? '').replace(/\D/g, '');
  if (d.length === 11) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
  return v ?? '—';
}

/**
 * Calcula disponibilidade real de uma saída.
 * @param {object} departure  — objeto com .id, .capacity, .status
 * @param {object} occMap     — { [departure_id]: occupiedCount }
 * @returns {{ capacity, occupied, available, isSoldOut }}
 */
function getDepartureAvailability(departure, occMap = {}) {
  const capacity  = departure?.capacity ?? 0;
  const occupied  = occMap[departure?.id] ?? 0;
  const available = Math.max(0, capacity - occupied);
  const isSoldOut = departure?.status === 'sold_out' || available === 0;
  return { capacity, occupied, available, isSoldOut };
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
  return {
    pix:            'PIX',
    credit_card:    'Cartão de crédito',
    signal_balance: 'Sinal + Saldo',
    bank_transfer:  'Transferência',
    cash:           'Dinheiro',
    boleto:         'Boleto',
    other:          'Outro',
  }[m] ?? m ?? '—';
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

// findExit — busca no cache carregado por renderSaidas / renderAgenda
let _exitsCache = [];
function findExit(exitId) {
  return _exitsCache.find(r => r.exit.id === exitId) ?? null;
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
  // Move focus into the drawer so keyboard navigation works correctly
  requestAnimationFrame(() => {
    const first = $('adm-drawer')?.querySelector(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    (first ?? $('adm-drawer-close'))?.focus();
  });
}

function closeDrawer() {
  // Move focus OUT before aria-hidden=true to avoid the aria-hidden-on-ancestor warning
  const active = document.activeElement;
  const drawer = $('adm-drawer');
  if (drawer?.contains(active)) {
    // Return focus to the element that triggered the drawer, or fall back to body
    (_lastDrawerTrigger ?? document.body)?.focus();
  }
  drawer?.classList.remove('is-open');
  drawer?.setAttribute('aria-hidden', 'true');
  $('adm-drawer-overlay').classList.remove('is-open');
  _lastDrawerTrigger = null;
}

// Track which element triggered the drawer so we can restore focus on close
let _lastDrawerTrigger = null;
document.addEventListener('click', e => {
  const btn = e.target.closest('button, a[href]');
  if (btn && !$('adm-drawer')?.contains(btn)) _lastDrawerTrigger = btn;
}, true);

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
  const modal = $('adm-modal');
  // Move focus out before setting aria-hidden to avoid accessibility warning
  if (modal?.contains(document.activeElement)) document.activeElement.blur();
  modal?.classList.remove('is-open', 'adm-modal--convert');
  modal?.setAttribute('aria-hidden', 'true');
  $('adm-modal-overlay').classList.remove('is-open');
  window._wlConvertCleanup?.();
  window._wlConvertCleanup = null;
}

$('adm-modal-close').addEventListener('click', closeModal);
$('adm-modal-overlay').addEventListener('click', closeModal);

/** Returns a Promise<boolean> — resolves true if user confirms, false otherwise */
function showConfirmModal(title, bodyHtml, confirmLabel = 'Confirmar', variant = 'danger') {
  return new Promise(resolve => {
    const btnCls = variant === 'danger' ? 'adm-btn--danger' : 'adm-btn--primary';
    openModal(title, bodyHtml, `
      <button class="adm-btn adm-btn--ghost" id="confirm-modal-cancel">Cancelar</button>
      <button class="adm-btn ${btnCls}" id="confirm-modal-ok">${escHtml(confirmLabel)}</button>
    `);
    const cleanup = (result) => { closeModal(); resolve(result); };
    document.getElementById('confirm-modal-cancel')?.addEventListener('click', () => cleanup(false));
    document.getElementById('confirm-modal-ok')?.addEventListener('click',     () => cleanup(true));
  });
}

// ─── Router ───────────────────────────────────────────────────────────────────

const MODULES = {
  dashboard:      { title: 'Dashboard',      render: renderDashboard },
  agenda:         { title: 'Agenda',         render: renderAgenda },
  experiencias:   { title: 'Experiências',   render: renderExperiencias, primaryAction: pa => { pa.innerHTML = '<button class="adm-btn adm-btn--primary adm-btn--sm" onclick="openNovaExperienciaModal()">+ Nova experiência</button>'; pa.style.display = ''; } },
  saidas:         { title: 'Saídas',         render: renderSaidas },
  embarque:       { title: 'Pontos de embarque', render: renderBoardingPoints, primaryAction: pa => { pa.innerHTML = '<button class="adm-btn adm-btn--primary adm-btn--sm" onclick="openBpFormDrawer(null)">+ Novo ponto</button>'; pa.style.display = ''; } },
  reservas:       { title: 'Reservas',       render: renderReservas },
  participantes:  { title: 'Participantes',  render: renderParticipantes },
  financeiro:     { title: 'Financeiro',     render: renderFinanceiro },
  configuracoes:  { title: 'Configurações',  render: renderConfiguracoes },
  usuarios:       { title: 'Usuários',       render: renderUsuarios },
  'lista-espera': { title: 'Lista de espera', render: renderListaEspera },
};

/** Cache das experiências carregadas para uso nos modais de edição */
let _expCache = [];

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

  // Primary action — reset and let each module configure if needed
  const pa = $('adm-primary-action');
  pa.style.display = 'none';
  pa.innerHTML = '';
  if (m.primaryAction) m.primaryAction(pa);

  // Render
  closeDrawer();
  const main = $('adm-main');
  main.innerHTML = '';
  currentModule = mod;

  m.render(main, id);
}

window.addEventListener('hashchange', () => navigate(location.hash));

// Expõe funções ao escopo global para uso em onclick="" no HTML
// (ES Modules não expõem automaticamente ao window)
window.navigate               = navigate;
window.adminLogout            = adminLogout;
window.toast                  = toast;
window.closeDrawer            = closeDrawer;
window.closeModal             = closeModal;
window.openNovaExperienciaModal = openNovaExperienciaModal;
window.openEditExperienciaModal = openEditExperienciaModal;
window.deactivateExp          = deactivateExp;

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

async function renderDashboard(root) {
  const db = window.anauaDb;

  // Shell imediato com KPI placeholders e tabelas vazias
  root.innerHTML = `
    <div class="adm-kpi-row" id="dash-kpi-row">
      ${kpi('A Receber', '…', 'carregando…', 'green', '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>')}
      ${kpi('Reservas ativas', '…', 'confirmadas + reservadas', 'blue', '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>')}
      ${kpi('Inadimplentes', '…', 'pendente de pagamento', 'red', '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>')}
      ${kpi('Cancelamentos', '…', 'total geral', 'gray', '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>')}
      ${kpi('Total Bruto', '…', 'volume de vendas', 'gold', '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg>')}
      ${kpi('Total Recebido', '…', 'pagamentos confirmados', 'purple', '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>')}
    </div>
    <div class="adm-grid-2">
      <div class="adm-card" id="dash-reservas-card">
        <div class="adm-card__header">Reservas recentes <div class="adm-card__actions"><a href="#reservas" class="adm-btn adm-btn--ghost adm-btn--sm">Ver todas</a></div></div>
        <div style="padding:16px;color:var(--adm-text-muted)">Carregando…</div>
      </div>
      <div class="adm-card" id="dash-saidas-card">
        <div class="adm-card__header">Próximas saídas <div class="adm-card__actions"><a href="#agenda" class="adm-btn adm-btn--ghost adm-btn--sm">Agenda</a></div></div>
        <div style="padding:16px;color:var(--adm-text-muted)">Carregando…</div>
      </div>
    </div>`;

  if (!db) {
    document.getElementById('dash-kpi-row').innerHTML = `<p style="color:var(--adm-danger)">Supabase não disponível.</p>`;
    return;
  }

  const safeCount = async (tbl, filter) => {
    try {
      let q = db.from(tbl).select('*', { count: 'exact', head: true });
      if (filter) q = filter(q);
      const { count, error } = await q;
      if (error) { console.warn('[admin-db] Count bloqueado por RLS:', tbl, error.message); return 0; }
      return count ?? 0;
    } catch { return 0; }
  };

  const [totalRes, activeRes, pendingRes, cancelledRes, recentRows, upcomingRows, paidSum] = await Promise.all([
    safeCount('reservations'),
    safeCount('reservations', q => q.in('reservation_status', ['confirmed', 'reserved'])),
    safeCount('reservations', q => q.eq('reservation_status', 'pending_payment')),
    safeCount('reservations', q => q.eq('reservation_status', 'cancelled')),
    db.from('reservations').select('id, reservation_status, total_amount, created_at, customer_name').order('created_at', { ascending: false }).limit(6),
    db.from('departures').select('id, start_at, status, capacity, experience_id, experiences(title)').gte('start_at', new Date().toISOString().split('T')[0]).eq('status', 'scheduled').order('start_at').limit(5),
    db.from('payments').select('amount').eq('status', 'paid'),
  ]);

  const paidTotal = (paidSum.data ?? []).reduce((s, p) => s + Number(p.amount ?? 0), 0);
  const recent    = recentRows.data  ?? [];
  const upcoming  = upcomingRows.data ?? [];

  // KPIs
  document.getElementById('dash-kpi-row').innerHTML =
    kpi('Reservas ativas',  activeRes,        'confirmadas + reservadas',   'blue',   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>') +
    kpi('Aguardando pag.',  pendingRes,       'pending_payment',            'gold',   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>') +
    kpi('Cancelamentos',   cancelledRes,     'total geral',                 'gray',   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>') +
    kpi('Total reservas',  totalRes,         'tabela reservations',         'purple', '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg>') +
    kpi('Total Recebido',  fmt(paidTotal),   'pagamentos confirmados',      'green',  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>');

  // Reservas recentes
  document.getElementById('dash-reservas-card').innerHTML = `
    <div class="adm-card__header">Reservas recentes <div class="adm-card__actions"><a href="#reservas" class="adm-btn adm-btn--ghost adm-btn--sm">Ver todas</a></div></div>
    <div class="adm-table-wrap">
      <table class="adm-table">
        <thead><tr><th>Código</th><th>Responsável</th><th>Status</th><th>Total</th></tr></thead>
        <tbody>${recent.length
          ? recent.map(r => `<tr>
              <td class="no-wrap text-small text-muted">${escHtml(r.id)}</td>
              <td class="text-bold">${escHtml(r.customer_name ?? '—')}</td>
              <td>${badge(r.reservation_status ?? 'pending_payment')}</td>
              <td class="no-wrap text-bold">${fmt(r.total_amount ?? 0)}</td>
            </tr>`).join('')
          : '<tr><td colspan="4" class="adm-table__empty text-muted">Nenhuma reserva ainda.</td></tr>'
        }</tbody>
      </table>
    </div>`;

  // Próximas saídas
  document.getElementById('dash-saidas-card').innerHTML = `
    <div class="adm-card__header">Próximas saídas <div class="adm-card__actions"><a href="#agenda" class="adm-btn adm-btn--ghost adm-btn--sm">Agenda</a></div></div>
    <div class="adm-table-wrap">
      <table class="adm-table">
        <thead><tr><th>Data</th><th>Experiência</th><th>Ocupação</th><th>Vagas</th></tr></thead>
        <tbody>${upcoming.length
          ? upcoming.map(d => {
              const title  = d.experiences?.title ?? d.experience_id ?? '—';
              return `<tr>
                <td class="no-wrap">${fmtDateShort(d.start_at)}</td>
                <td>${escHtml(title)}</td>
                <td class="text-muted text-small">—</td>
                <td class="text-bold">${d.capacity ?? 0} vagas</td>
              </tr>`;
            }).join('')
          : '<tr><td colspan="4" class="adm-table__empty text-muted">Sem saídas futuras agendadas.</td></tr>'
        }</tbody>
      </table>
    </div>`;

  console.log('[admin-db] Dashboard carregado do Supabase');
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

async function renderAgenda(root) {
  const db = window.anauaDb;
  const today = new Date();
  let viewYear  = today.getFullYear();
  let viewMonth = today.getMonth();
  let listView  = false;
  let allExits  = [];

  root.innerHTML = '<div class="adm-empty" style="padding:32px;text-align:center"><p class="text-muted">Carregando agenda…</p></div>';

  if (db) {
    const { data, error } = await db
      .from('departures')
      .select('id, start_at, status, capacity, experience_id, experiences(title)')
      .order('start_at');
    if (!error) {
      allExits = (data ?? []).map(d => ({
        exp:  { title: d.experiences?.title ?? d.experience_id ?? '—', id: d.experience_id },
        exit: { id: d.id, start_at: d.start_at, status: d.status, capacity: d.capacity ?? 0 },
      }));
      _exitsCache = allExits;
      console.log('[admin-db] Saídas carregadas (agenda):', allExits.length);
    } else {
      console.warn('[admin-db] Erro ao carregar saídas:', error.message);
    }
  }

  function render() { listView ? renderList() : renderCal(); }

  function renderCal() {
    const firstDay = new Date(viewYear, viewMonth, 1);
    const lastDay  = new Date(viewYear, viewMonth + 1, 0);
    const startWeekday = firstDay.getDay();
    const monthName = firstDay.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
    const cells = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) cells.push(d);
    const todayStr = today.toISOString().split('T')[0];

    const dayEventsHtml = cells.map(d => {
      if (d === null) return '<div class="adm-cal__day is-empty"></div>';
      const ds = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const dayEx = allExits.filter(x => (x.exit.start_at ?? '').slice(0, 10) === ds);
      const isToday = ds === todayStr;
      const evts = dayEx.map(({ exp, exit }) => {
        const cls = exit.status === 'sold_out' ? 'is-sold' : exit.status === 'cancelled' ? 'is-hot' : '';
        return `<span class="adm-cal__evt ${cls}" data-exit="${exit.id}" title="${escHtml(exp.title)}">${escHtml(exp.title.slice(0,18))}</span>`;
      }).join('');
      return `<div class="adm-cal__day ${isToday ? 'is-today' : ''}" data-date="${ds}"><div class="adm-cal__daynum">${d}</div>${evts}</div>`;
    }).join('');

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
            ${dayEventsHtml}
          </div>
        </div>
      </div>`;

    root.querySelectorAll('.adm-cal__evt').forEach(el => el.addEventListener('click', e => { e.stopPropagation(); openExitDrawer(el.dataset.exit); }));
    $('cal-prev').addEventListener('click',  () => { viewMonth--; if (viewMonth < 0) { viewMonth = 11; viewYear--; } render(); });
    $('cal-next').addEventListener('click',  () => { viewMonth++; if (viewMonth > 11) { viewMonth = 0; viewYear++; } render(); });
    $('cal-today').addEventListener('click', () => { viewYear = today.getFullYear(); viewMonth = today.getMonth(); render(); });
    $('tog-list').addEventListener('click',  () => { listView = true;  render(); });
    $('tog-cal').addEventListener('click',   () => { listView = false; render(); });
  }

  function renderList() {
    const sorted = [...allExits].sort((a, b) => (a.exit.start_at ?? '').localeCompare(b.exit.start_at ?? ''));
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
            <thead><tr><th>Data</th><th>Experiência</th><th>Vagas</th><th>Status</th><th></th></tr></thead>
            <tbody>${sorted.length ? sorted.map(({ exp, exit }) => {
              const statusLabel = exit.status === 'cancelled' ? 'Cancelada' : exit.status === 'sold_out' ? 'Esgotada' : 'Aberta';
              const statusCls   = exit.status === 'cancelled' ? 'cancelled' : exit.status === 'sold_out' ? 'sold-out' : 'active';
              return `<tr>
                <td class="no-wrap">${fmtDate(exit.start_at)}</td>
                <td>${escHtml(exp.title)}</td>
                <td>${exit.capacity ?? '—'} vagas</td>
                <td><span class="badge badge--${statusCls}">${statusLabel}</span></td>
                <td><button class="adm-btn adm-btn--ghost adm-btn--sm" data-exit="${exit.id}">Detalhes</button></td>
              </tr>`;
            }).join('') : '<tr><td colspan="6" class="adm-table__empty text-muted">Nenhuma saída cadastrada.</td></tr>'}</tbody>
          </table>
        </div>
      </div>`;
    root.querySelectorAll('[data-exit]').forEach(btn => btn.addEventListener('click', () => openExitDrawer(btn.dataset.exit)));
    $('tog-cal').addEventListener('click',  () => { listView = false; render(); });
    $('tog-list').addEventListener('click', () => { listView = true;  render(); });
  }

  render();
}

// ─────────────────────────────────────────────────────────────────────────────
//  MODULE: EXPERIÊNCIAS
// ─────────────────────────────────────────────────────────────────────────────

async function renderExperiencias(root) {
  root.innerHTML = `
    <div class="adm-card">
      <div class="adm-card__header">Experiências cadastradas</div>
      <div style="padding:16px;color:var(--adm-text-muted)">Carregando…</div>
    </div>`;

  const db = window.anauaDb;
  if (!db) {
    root.innerHTML = `<div class="adm-empty"><p style="color:var(--adm-danger)">Supabase não disponível.</p></div>`;
    return;
  }

  const { data, error } = await db
    .from('experiences')
    .select('id, title, slug, location, category, difficulty, base_price, is_active, cover_image_url, created_at')
    .order('title');

  if (error) {
    console.warn('[admin-db] Erro ao carregar experiências:', error.message);
    root.innerHTML = `
      <div class="adm-empty" style="padding:48px;text-align:center">
        <p style="color:var(--adm-danger);font-weight:600">Não foi possível carregar as experiências.</p>
        <p class="text-small text-muted" style="margin-top:8px">Verifique o console para detalhes técnicos.</p>
        <button class="adm-btn adm-btn--secondary" style="margin-top:16px" onclick="navigate('#experiencias')">Tentar novamente</button>
      </div>`;
    return;
  }

  const exps = data ?? [];
  _expCache = exps;

  if (exps.length === 0) {
    console.log('[admin-db] Nenhuma experiência cadastrada');
    root.innerHTML = `
      <div class="adm-empty" style="padding:64px 32px;text-align:center">
        <div style="font-size:2.5rem;margin-bottom:12px">🌿</div>
        <p style="font-weight:600;font-size:1.1rem">Nenhuma experiência cadastrada</p>
        <p class="text-muted" style="margin-top:8px;max-width:360px;margin-inline:auto">Cadastre sua primeira experiência para começar a vender pelo site.</p>
        <button class="adm-btn adm-btn--primary" style="margin-top:24px" onclick="openNovaExperienciaModal()">Cadastrar primeira experiência</button>
      </div>`;
    return;
  }

  console.log('[admin-db] Experiências carregadas:', exps.length);

  root.innerHTML = `
    <div class="adm-card">
      <div class="adm-card__header">Experiências cadastradas <span class="adm-count">${exps.length}</span></div>
      <div class="adm-table-wrap">
        <table class="adm-table">
          <thead><tr><th>Título</th><th>Categoria</th><th>Dificuldade</th><th>Preço base</th><th>Status</th><th></th></tr></thead>
          <tbody>${exps.map(exp => `<tr>
            <td>
              <div class="text-bold">${escHtml(exp.title ?? '—')}</div>
              <div class="text-small text-muted">${escHtml(exp.location ?? '—')}</div>
            </td>
            <td class="text-small">${escHtml(exp.category ?? '—')}</td>
            <td><span class="adm-tag">${escHtml(exp.difficulty ?? '—')}</span></td>
            <td class="no-wrap">${fmt(exp.base_price ?? 0)}</td>
            <td><span class="badge badge--${exp.is_active !== false ? 'active' : 'cancelled'}">${exp.is_active !== false ? 'Ativa' : 'Inativa'}</span></td>
            <td>
              <div style="display:flex;gap:6px;flex-wrap:wrap">
                <a href="../experiencia.html?id=${escHtml(exp.slug ?? exp.id)}" target="_blank" class="adm-btn adm-btn--ghost adm-btn--sm">Ver</a>
                <button class="adm-btn adm-btn--secondary adm-btn--sm" onclick="openEditExperienciaModal('${exp.id}')">Editar</button>
                <button class="adm-btn adm-btn--ghost adm-btn--sm" onclick="duplicateExperience('${exp.id}')">Duplicar</button>
                <button class="adm-btn adm-btn--danger adm-btn--sm" onclick="deactivateExp('${exp.id}','${escHtml(exp.title ?? '')}')">${exp.is_active !== false ? 'Desativar' : 'Reativar'}</button>
              </div>
            </td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════════
//  ANAUÁ DTP — Custom Date/Time Picker
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build HTML for a DTP trigger (hidden input + styled button).
 * The hidden input retains the original fieldId so all existing .value reads work unchanged.
 */
function dtpFieldHtml(fieldId, currentValue = '', placeholder = 'Selecionar data e hora') {
  const display = currentValue ? formatDateTimeBR(currentValue) : '';
  const hasVal  = !!display;
  const inner   = hasVal ? display : `<span class="adm-dtp-ph">${placeholder}</span>`;
  return `<div class="adm-dtp-wrap">
    <input type="hidden" id="${fieldId}" value="${currentValue}" />
    <button type="button" class="adm-dtp-btn${hasVal ? ' is-set' : ''}" onclick="openDTP(this,'${fieldId}')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;opacity:.55">
        <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
      <span id="${fieldId}-dtp-label" style="flex:1;text-align:left">${inner}</span>
      <span class="adm-dtp-btn__clear" style="display:${hasVal ? '' : 'none'}"
        onclick="event.stopPropagation();dtpClearField('${fieldId}')">×</span>
    </button>
  </div>`;
}

/** Programmatically update a DTP field value + display label (no change event). */
function dtpSetValue(fieldId, isoVal) {
  const hidden = document.getElementById(fieldId);
  const label  = document.getElementById(fieldId + '-dtp-label');
  const btn    = label?.closest('.adm-dtp-btn');
  const clr    = btn?.querySelector('.adm-dtp-btn__clear');
  if (hidden) hidden.value = isoVal ?? '';
  if (label) {
    label.innerHTML = isoVal
      ? formatDateTimeBR(isoVal)
      : `<span class="adm-dtp-ph">Selecionar data e hora</span>`;
  }
  if (clr) clr.style.display = isoVal ? '' : 'none';
  if (btn) btn.classList.toggle('is-set', !!isoVal);
}
  /** Add `mins` minutes to a datetime-local string (YYYY-MM-DDTHH:mm) */
  function _addBpMinutes(isoStr, mins) {
    if (!isoStr) return isoStr;
    const d = new Date(isoStr);
    d.setMinutes(d.getMinutes() + mins);
    return d.toISOString().slice(0, 16);
  }


/** Format "YYYY-MM-DDTHH:MM…" → "DD/MM/AAAA, HH:MM" */
function formatDateTimeBR(v) {
  if (!v) return '';
  const m = String(v).match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}, ${m[4]}:${m[5]}` : v;
}

/** Auto-calculate end datetime from start + duration in a DTP field pair. */
function dtpAutoCalcEnd(startId, endId, durId) {
  const sv = document.getElementById(startId)?.value;
  if (!sv) return;
  const dur = parseFloat(document.getElementById(durId)?.value) || 8;
  const ms  = new Date(sv).getTime();
  if (isNaN(ms)) return;
  const iso = new Date(ms + dur * 3_600_000).toISOString().slice(0, 16);
  dtpSetValue(endId, iso);
  // Mark end field as auto-set (not manually overridden)
  const endEl = document.getElementById(endId);
  if (endEl) delete endEl.dataset.dtpManual;
}

/** Clear a DTP field (also resets manual-override flag). */
window.dtpClearField = function(fieldId) {
  dtpSetValue(fieldId, null);
  const el = document.getElementById(fieldId);
  if (el) delete el.dataset.dtpManual;
  el?.dispatchEvent(new Event('change', { bubbles: true }));
};

// ─── Picker core ─────────────────────────────────────────────────────────────

function _ensureDTPOverlay() {
  if (document.getElementById('adm-dtp-overlay')) return;
  const ov = document.createElement('div');
  ov.id = 'adm-dtp-overlay';
  ov.innerHTML = '<div class="adm-dtp" id="adm-dtp-panel"></div>';
  ov.addEventListener('mousedown', e => { if (e.target === ov) closeDTP(); });
  document.body.appendChild(ov);
}

let _dtp = null;

/**
 * Open the picker.
 * @param {Element} _el   - clicked trigger element (unused, matches onclick signature)
 * @param {string} fieldId
 * @param {object} [opts] - { minDate:'YYYY-MM-DD', onSelect, prefillDate:'YYYY-MM-DD' }
 */
function openDTP(_el, fieldId, opts = {}) {
  _ensureDTPOverlay();
  const cur = document.getElementById(fieldId)?.value || '';
  const m   = cur.match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  _dtp = {
    fieldId,
    onSelect:     opts.onSelect ?? null,
    minDate:      opts.minDate  ?? null,
    year:         m ? +m[1] : new Date().getFullYear(),
    month:        m ? +m[2] - 1 : new Date().getMonth(),
    selectedDate: m ? `${m[1]}-${m[2]}-${m[3]}` : (opts.prefillDate ?? null),
    selectedTime: m ? `${m[4]}:${m[5]}` : null,
  };
  if (!m && opts.prefillDate) {
    const [py, pm] = opts.prefillDate.split('-');
    _dtp.year = +py; _dtp.month = +pm - 1;
  }
  _renderDTP();
  document.getElementById('adm-dtp-overlay').classList.add('is-open');
}
window.openDTP = openDTP;

function closeDTP() {
  document.getElementById('adm-dtp-overlay')?.classList.remove('is-open');
  _dtp = null;
}
window.closeDTP = closeDTP;

function _pad(n) { return String(n).padStart(2, '0'); }
function _fmtDs(y, m, d) { return `${y}-${_pad(m + 1)}-${_pad(d)}`; }

function _renderDTP() {
  const panel = document.getElementById('adm-dtp-panel');
  if (!panel || !_dtp) return;
  const { year, month, selectedDate, selectedTime, minDate } = _dtp;
  const today = new Date();
  const todStr  = _fmtDs(today.getFullYear(), today.getMonth(), today.getDate());
  const MONTHS  = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const WDAYS   = ['D','S','T','Q','Q','S','S'];

  // Calendar cells
  const fw  = new Date(year, month, 1).getDay();
  const dim = new Date(year, month + 1, 0).getDate();
  const dip = new Date(year, month, 0).getDate();
  let days  = '';
  for (let i = fw - 1; i >= 0; i--)
    days += `<button type="button" class="adm-dtp__day other-month" disabled>${dip - i}</button>`;
  for (let d = 1; d <= dim; d++) {
    const ds  = _fmtDs(year, month, d);
    const dis = minDate && ds < minDate;
    let   cls = 'adm-dtp__day';
    if (ds === todStr)      cls += ' today';
    if (ds === selectedDate) cls += ' selected';
    days += `<button type="button" class="${cls}"${dis?' disabled':''} onclick="_dtpPickDate('${ds}')">${d}</button>`;
  }
  const pad = Math.ceil((fw + dim) / 7) * 7 - fw - dim;
  for (let r = 1; r <= pad; r++)
    days += `<button type="button" class="adm-dtp__day other-month" disabled>${r}</button>`;

  // Time grid (15-min steps)
  let times = '';
  for (let h = 0; h < 24; h++) for (let mx = 0; mx < 60; mx += 15) {
    const ts  = `${_pad(h)}:${_pad(mx)}`;
    const sel = ts === selectedTime;
    times += `<button type="button" class="adm-dtp__time-btn${sel?' selected':''}" onclick="_dtpPickTime('${ts}')">${ts}</button>`;
  }

  // Quick shortcuts
  const tom = new Date(today); tom.setDate(today.getDate() + 1);
  const sat = new Date(today); sat.setDate(today.getDate() + ((6 - today.getDay() + 7) % 7 || 7));
  const fds = d => _fmtDs(d.getFullYear(), d.getMonth(), d.getDate());

  const selDisp = selectedDate && selectedTime
    ? formatDateTimeBR(`${selectedDate}T${selectedTime}`)
    : (selectedDate ? selectedDate.split('-').reverse().join('/') : '—');

  panel.innerHTML = `
    <div class="adm-dtp__head">
      <div>
        <div class="adm-dtp__head-title">Selecionar data e hora</div>
        <div class="adm-dtp__head-selected">${selDisp}</div>
      </div>
    </div>
    <div class="adm-dtp__body">
      <div class="adm-dtp__shortcuts">
        <button type="button" class="adm-dtp__sc-btn" onclick="_dtpPickDate('${todStr}')">Hoje</button>
        <button type="button" class="adm-dtp__sc-btn" onclick="_dtpPickDate('${fds(tom)}')">Amanhã</button>
        <button type="button" class="adm-dtp__sc-btn" onclick="_dtpPickDate('${fds(sat)}')">Próx. sábado</button>
        <button type="button" class="adm-dtp__sc-btn" onclick="dtpClearField(_dtp?.fieldId);closeDTP()">Limpar</button>
      </div>
      <div class="adm-dtp__nav">
        <button type="button" onclick="_dtpNavMonth(-1)">‹</button>
        <span class="adm-dtp__nav-label">${MONTHS[month]} ${year}</span>
        <button type="button" onclick="_dtpNavMonth(1)">›</button>
      </div>
      <div class="adm-dtp__cal">
        <div class="adm-dtp__cal-head">${WDAYS.map(w=>`<span>${w}</span>`).join('')}</div>
        <div class="adm-dtp__cal-grid">${days}</div>
      </div>
      <div class="adm-dtp__time-section">
        <div class="adm-dtp__time-label">Horário</div>
        <div class="adm-dtp__time-grid">${times}</div>
        <div class="adm-dtp__time-manual">
          <label style="font-size:12px;white-space:nowrap;color:var(--adm-muted)">Digitar:</label>
          <input type="time" class="adm-input adm-input--sm" id="adm-dtp-manual"
            value="${selectedTime||''}" oninput="_dtpPickTime(this.value)" style="width:88px" />
        </div>
      </div>
    </div>
    <div class="adm-dtp__footer">
      <button type="button" class="adm-btn adm-btn--secondary" onclick="closeDTP()">Cancelar</button>
      <button type="button" class="adm-btn adm-btn--primary"   onclick="_dtpApply()">Aplicar</button>
    </div>`;

  requestAnimationFrame(() => {
    panel.querySelector('.adm-dtp__time-btn.selected')?.scrollIntoView({ block: 'nearest' });
  });
}

window._dtpPickDate  = function(ds) { if (_dtp) { _dtp.selectedDate = ds; _dtp.year = +ds.slice(0,4); _dtp.month = +ds.slice(5,7)-1; _renderDTP(); } };
window._dtpPickTime  = function(ts) { if (_dtp) { _dtp.selectedTime = ts; _renderDTP(); } };
window._dtpNavMonth  = function(dir) {
  if (!_dtp) return;
  _dtp.month += dir;
  if (_dtp.month < 0)  { _dtp.month = 11; _dtp.year--; }
  if (_dtp.month > 11) { _dtp.month =  0; _dtp.year++; }
  _renderDTP();
};
window._dtpApply = function() {
  if (!_dtp) return;
  if (!_dtp.selectedDate) { toast('Selecione uma data.', 'error'); return; }
  if (!_dtp.selectedTime) { toast('Selecione um horário.', 'error'); return; }
  const iso = `${_dtp.selectedDate}T${_dtp.selectedTime}`;
  const fid = _dtp.fieldId;
  const cb  = _dtp.onSelect;
  dtpSetValue(fid, iso);
  // Mark as manually set (not auto-filled)
  const el = document.getElementById(fid);
  if (el) el.dataset.dtpManual = '1';
  closeDTP();
  // Notify change listeners
  el?.dispatchEvent(new Event('change', { bubbles: true }));
  cb?.(iso);
};

function openNovaExperienciaModal() {
  openDrawer('Nova experiência', `
    <form id="nova-exp-form" autocomplete="off">

      <!-- ═══ 1. DADOS PRINCIPAIS ══════════════════════════════════════ -->
      <fieldset class="exp-section">
        <legend class="exp-section__title">Dados principais</legend>
        <div class="exp-section__body">
          <div class="adm-field">
            <label>Título *</label>
            <input id="ne-title" class="adm-input" required placeholder="Ex: Trilha do Pico da Bandeira" />
          </div>
          <div class="adm-field">
            <label>Slug *</label>
            <input id="ne-slug" class="adm-input" required placeholder="trilha-pico-bandeira" />
            <span class="adm-hint">Gerado automaticamente. Pode editar.</span>
          </div>
          <div class="adm-field">
            <label>Subtítulo</label>
            <input id="ne-subtitle" class="adm-input" placeholder="Frase curta para o card e SEO" />
          </div>
          <div class="adm-field">
            <label>Descrição curta</label>
            <textarea id="ne-short-desc" class="adm-input" rows="2" placeholder="1–2 frases para redes e compartilhamento"></textarea>
          </div>
          <div class="adm-field">
            <label>Descrição completa</label>
            <textarea id="ne-description" class="adm-input" rows="4" placeholder="Texto narrativo completo da experiência"></textarea>
          </div>
        </div>
      </fieldset>

      <!-- ═══ 2. CLASSIFICAÇÃO ══════════════════════════════════════════ -->
      <fieldset class="exp-section">
        <legend class="exp-section__title">Classificação</legend>
        <div class="exp-section__body">
          <div class="adm-grid-2">
            <div class="adm-field"><label>Categoria</label>
              <select id="ne-category" class="adm-select">
                <option value="">— selecione —</option>
                <option value="day-experience">Experiência de 1 dia</option>
                <option value="expedition">Expedição</option>
                <option value="event">Evento</option>
                <option value="kids">Kids</option>
              </select>
            </div>
            <div class="adm-field"><label>Dificuldade</label>
              <select id="ne-difficulty" class="adm-select">
                <option value="">— selecione —</option>
                <option value="iniciante">Iniciante (Fácil)</option>
                <option value="moderado">Moderado</option>
                <option value="aventura">Aventura (Difícil)</option>
              </select>
            </div>
          </div>
          <div class="adm-grid-2">
            <div class="adm-field"><label>Região</label>
              <input id="ne-region" class="adm-input" placeholder="Ex: Serra do Espinhaço" />
            </div>
            <div class="adm-field"><label>Local / ponto de partida</label>
              <input id="ne-location" class="adm-input" placeholder="Ex: Serra da Canastra" />
            </div>
          </div>
        </div>
      </fieldset>

      <!-- ═══ 3. OPERAÇÃO ════════════════════════════════════════════════ -->
      <fieldset class="exp-section">
        <legend class="exp-section__title">Operação</legend>
        <div class="exp-section__body">
          <div class="adm-grid-2">
            <div class="adm-field">
              <label>Duração (texto)</label>
              <input id="ne-duration-text" class="adm-input" placeholder="Ex: 2 dias / 1 noite" />
              <span class="adm-hint">Texto livre exibido na página pública.</span>
            </div>
            <div class="adm-field">
              <label>Duração (horas)</label>
              <input id="ne-duration" class="adm-input" type="number" min="0.5" step="0.5" placeholder="Ex: 8" />
              <span class="adm-hint">Usado para calcular término da saída.</span>
            </div>
          </div>
          <div class="adm-grid-2">
            <div class="adm-field"><label>Capacidade máxima (pax)</label>
              <input id="ne-maxpax" class="adm-input" type="number" min="1" step="1" placeholder="Ex: 20" />
            </div>
            <div class="adm-field"><label>Idade mínima (anos)</label>
              <input id="ne-minage" class="adm-input" type="number" min="0" step="1" placeholder="Ex: 10" />
            </div>
          </div>
          <div class="adm-grid-2">
            <div class="adm-field"><label>Distância (km)</label>
              <input id="ne-distance" class="adm-input" type="number" min="0" step="0.1" placeholder="Ex: 14.5" />
            </div>
            <div class="adm-field"><label>Ganho de elevação (m)</label>
              <input id="ne-elevation" class="adm-input" type="number" min="0" step="1" placeholder="Ex: 850" />
            </div>
          </div>
        </div>
      </fieldset>

      <!-- ═══ 4. COMERCIAL ══════════════════════════════════════════════ -->
      <fieldset class="exp-section">
        <legend class="exp-section__title">Comercial</legend>
        <div class="exp-section__body">
          <div class="adm-grid-2">
            <div class="adm-field"><label>Preço base (R$)</label>
              <input id="ne-price" class="adm-input" type="number" min="0" step="0.01" placeholder="0,00" />
            </div>
            <div class="adm-field"><label>Moeda</label>
              <select id="ne-currency" class="adm-select">
                <option value="BRL">BRL — Real</option>
                <option value="USD">USD — Dólar</option>
                <option value="EUR">EUR — Euro</option>
              </select>
            </div>
          </div>
        </div>
      </fieldset>

      <!-- ═══ 5. CONTEÚDO DA PÁGINA ══════════════════════════════════════ -->
      <fieldset class="exp-section">
        <legend class="exp-section__title">Conteúdo da página pública</legend>
        <div class="exp-section__body">
          <div class="adm-field">
            <label>Destaques / Highlights</label>
            <textarea id="ne-highlights" class="adm-input" rows="4" placeholder="Uma linha por item&#10;Ex: Guia especializado&#10;Vista 360° do pico"></textarea>
            <span class="adm-hint">Uma linha por item.</span>
          </div>
          <div class="adm-grid-2">
            <div class="adm-field">
              <label>O que está incluído</label>
              <textarea id="ne-includes" class="adm-input" rows="4" placeholder="Uma linha por item&#10;Ex: Transporte&#10;Refeição"></textarea>
              <span class="adm-hint">Uma linha por item.</span>
            </div>
            <div class="adm-field">
              <label>O que NÃO está incluído</label>
              <textarea id="ne-excludes" class="adm-input" rows="4" placeholder="Uma linha por item&#10;Ex: Bebidas"></textarea>
              <span class="adm-hint">Uma linha por item.</span>
            </div>
          </div>
          <div class="adm-field">
            <label>O que levar / trazer</label>
            <textarea id="ne-bring" class="adm-input" rows="3" placeholder="Uma linha por item&#10;Ex: Garrafa d'água&#10;Protetor solar"></textarea>
            <span class="adm-hint">Uma linha por item.</span>
          </div>
          <div class="adm-field">
            <label>Política de cancelamento</label>
            <textarea id="ne-cancel-policy" class="adm-input" rows="2" placeholder="Ex: Cancelamento gratuito até 7 dias antes."></textarea>
          </div>
        </div>
      </fieldset>

      <!-- ═══ 6. MÍDIA ══════════════════════════════════════════════════ -->
      <fieldset class="exp-section">
        <legend class="exp-section__title">Mídia</legend>
        <div class="exp-section__body">
          <div class="adm-field">
            <label>Imagem de capa</label>
            <div class="adm-upload-widget">
              <input type="file" id="ne-cover-file" accept="image/*" style="display:none" />
              <div id="ne-cover-preview" style="display:none;align-items:center;gap:10px">
                <img id="ne-cover-img" src="" alt="" style="width:56px;height:56px;object-fit:cover;border-radius:6px;border:1px solid var(--adm-border)" />
                <div>
                  <span id="ne-cover-name" style="font-size:12px;color:var(--adm-muted)"></span><br>
                  <button type="button" class="adm-btn adm-btn--ghost adm-btn--sm" id="ne-cover-change-btn">Trocar</button>
                </div>
              </div>
              <div id="ne-cover-empty">
                <button type="button" class="adm-btn adm-btn--secondary adm-btn--sm" id="ne-cover-pick-btn">📷 Escolher imagem</button>
                <span id="ne-cover-status" style="font-size:12px;color:var(--adm-muted);margin-left:8px"></span>
              </div>
              <input type="hidden" id="ne-cover" />
            </div>
          </div>
          <div class="adm-field">
            <label>Galeria (URLs)</label>
            <textarea id="ne-gallery" class="adm-input" rows="3" placeholder="Uma URL por linha&#10;https://...imagem1.jpg"></textarea>
            <span class="adm-hint">Uma URL por linha.</span>
          </div>
        </div>
      </fieldset>

      <!-- ═══ 7. VISIBILIDADE ════════════════════════════════════════════ -->
      <fieldset class="exp-section">
        <legend class="exp-section__title">Visibilidade</legend>
        <div class="exp-section__body">
          <div class="exp-section__checks">
            <label class="exp-check"><input id="ne-active" type="checkbox" checked /><span><strong>Ativa</strong> — visível no site público</span></label>
            <label class="exp-check"><input id="ne-featured" type="checkbox" /><span><strong>Destaque</strong> — aparece em promoções e home</span></label>
            <label class="exp-check"><input id="ne-is-new" type="checkbox" /><span><strong>Novidade</strong> — exibe selo "Novo" no card</span></label>
          </div>
        </div>
      </fieldset>

      <!-- ══ B: SAÍDA INICIAL ═════════════════════════════════════════ -->
      <div class="adm-section-hd" style="margin-top:20px">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:600">
          <input id="ne-dep-check" type="checkbox" style="width:16px;height:16px" />
          Criar primeira saída agora
        </label>
      </div>
      <div id="ne-dep-section" style="display:none;display:flex;flex-direction:column;gap:12px">
        <div class="adm-grid-2">
          <div class="adm-field"><label>Data/hora de início *</label>
            ${dtpFieldHtml('ne-dep-start')}
          </div>
          <div class="adm-field"><label>Data/hora de término</label>
            ${dtpFieldHtml('ne-dep-end')}
          </div>
        </div>
        <div class="adm-grid-2">
          <div class="adm-field"><label>Capacidade (vagas)</label>
            <input id="ne-dep-capacity" class="adm-input" type="number" min="1" placeholder="Igual à capacidade máxima" />
          </div>
          <div class="adm-field"><label>Preço (R$)</label>
            <input id="ne-dep-price" class="adm-input" type="number" min="0" step="0.01" placeholder="Igual ao preço base" />
          </div>
        </div>
        <div class="adm-field"><label>Status da saída</label>
          <select id="ne-dep-status" class="adm-select">
            <option value="scheduled">Aberta</option>
            <option value="sold_out">Esgotada</option>
            <option value="cancelled">Cancelada</option>
          </select>
        </div>
        <div class="adm-field"><label>Título da saída (opcional)</label>
          <input id="ne-dep-title" class="adm-input" placeholder="Ex: Saída de verão" />
        </div>

        <!-- Pontos de embarque -->
        <div style="margin-top:4px">
          <label style="font-weight:600;font-size:13px;display:block;margin-bottom:6px">Pontos de embarque (catálogo)</label>
          <div id="ne-dep-bp-catalog-list" style="display:flex;flex-direction:column;gap:6px"><p style="font-size:11px;color:var(--adm-text-muted)">Ative «Criar primeira saída» para carregar os pontos.</p></div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-top:10px;margin-bottom:6px">
            <label style="font-size:12px;color:var(--adm-text-muted)">Ponto personalizado (não catalogado)</label>
            <button type="button" class="adm-btn adm-btn--ghost adm-btn--sm" id="ne-dep-add-custom-bp-btn">+ Ponto avulso</button>
          </div>
          <div id="ne-dep-bp-custom-list" style="display:flex;flex-direction:column;gap:10px"></div>
        </div>
      </div>

      <!-- ══ C: PRÉ-RESERVA MANUAL ════════════════════════════════════ -->
      <div class="adm-section-hd" style="margin-top:20px">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:600">
          <input id="ne-res-check" type="checkbox" style="width:16px;height:16px" />
          Criar reserva manual inicial
        </label>
      </div>
      <div id="ne-res-section" style="display:none;display:flex;flex-direction:column;gap:12px">
        <p style="font-size:12px;color:var(--adm-text-muted)">Preencha os dados do responsável pela reserva.</p>
        <div class="adm-field"><label>Nome do responsável *</label>
          <input id="ne-res-name" class="adm-input" placeholder="Nome completo" />
        </div>
        <div class="adm-grid-2">
          <div class="adm-field"><label>E-mail</label>
            <input id="ne-res-email" class="adm-input" type="email" placeholder="email@exemplo.com" />
          </div>
          <div class="adm-field"><label>Telefone</label>
            <input id="ne-res-phone" class="adm-input" type="tel" placeholder="(99) 99999-9999" />
          </div>
        </div>
        <div class="adm-grid-2">
          <div class="adm-field"><label>Forma de pagamento</label>
            <select id="ne-res-payment" class="adm-select">
              <option value="">— selecione —</option>
              <option value="pix">Pix</option>
              <option value="credit_card">Cartão de crédito</option>
              <option value="bank_transfer">Transferência</option>
              <option value="cash">Dinheiro</option>
              <option value="other">Outro</option>
            </select>
          </div>
          <div class="adm-field"><label>Status da reserva</label>
            <select id="ne-res-status" class="adm-select">
              <option value="reserved">Reservado</option>
              <option value="pending_payment">Aguardando pagamento</option>
              <option value="paid">Pago</option>
              <option value="cancelled">Cancelado</option>
            </select>
          </div>
        </div>
        <div class="adm-grid-2">
          <div class="adm-field"><label>Valor total (R$)</label>
            <input id="ne-res-total" class="adm-input" type="number" min="0" step="0.01" placeholder="0,00" />
          </div>
          <div class="adm-field"><label>Valor pago (R$)</label>
            <input id="ne-res-paid" class="adm-input" type="number" min="0" step="0.01" placeholder="0,00" />
          </div>
        </div>
        <div class="adm-field"><label>Observações</label>
          <textarea id="ne-res-notes" class="adm-input" rows="2" placeholder="Informações adicionais..."></textarea>
        </div>
      </div>

      <!-- ══ D: PARTICIPANTES ═════════════════════════════════════════ -->
      <div id="ne-parts-wrapper" style="display:none">
        <div class="adm-section-hd" style="margin-top:20px">Participantes</div>
        <div id="ne-parts-list" style="display:flex;flex-direction:column;gap:10px"></div>
        <button type="button" class="adm-btn adm-btn--ghost adm-btn--sm" id="ne-add-part-btn" style="margin-top:8px">+ Adicionar participante</button>
      </div>

      <!-- ══ FOOTER ════════════════════════════════════════════════════ -->
      <div style="display:flex;gap:10px;margin-top:24px;padding-top:16px;border-top:1px solid var(--adm-border)">
        <button type="submit" id="ne-save-btn" class="adm-btn adm-btn--primary" style="flex:1">Salvar experiência</button>
        <button type="button" class="adm-btn adm-btn--secondary" onclick="closeDrawer()">Cancelar</button>
      </div>

    </form>
  `);

  // ── Auto-slug ──────────────────────────────────────────────────────────────
  let slugEdited = false;
  document.getElementById('ne-slug')?.addEventListener('input', () => { slugEdited = true; });
  document.getElementById('ne-title')?.addEventListener('input', e => {
    if (slugEdited) return;
    const sl = e.target.value.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
    const el = document.getElementById('ne-slug');
    if (el) el.value = sl;
  });

  // ── Price → departure price default ───────────────────────────────────────
  document.getElementById('ne-price')?.addEventListener('change', e => {
    const depPrice = document.getElementById('ne-dep-price');
    if (depPrice && !depPrice.value) depPrice.value = e.target.value;
  });
  document.getElementById('ne-maxpax')?.addEventListener('change', e => {
    const depCap = document.getElementById('ne-dep-capacity');
    if (!depCap) return;
    depCap.max = e.target.value;
    if (!depCap.value) depCap.value = e.target.value;
    else if (parseInt(depCap.value) > parseInt(e.target.value)) depCap.value = e.target.value;
  });

  // ── Section B: pontos de embarque ────────────────────────────────────────
  let neCustomBpCount = 0;
  function addNeCustomBpRow() {
    const i = neCustomBpCount++;
    const row = document.createElement('div');
    row.id = `ne-dep-custom-bp-${i}`;
    row.style.cssText = 'background:var(--adm-surface-2,#f8f8f8);border:1px solid var(--adm-border);border-radius:6px;padding:10px;display:flex;flex-direction:column;gap:8px';
    row.innerHTML = `
      <div class="adm-grid-2" style="gap:8px">
        <div class="adm-field" style="margin:0"><label style="font-size:11px">Local / ponto *</label>
          <input id="ne-custom-bp-label-${i}" class="adm-input adm-input--sm" placeholder="Ex: Estacionamento do Parque" />
        </div>
        <div class="adm-field" style="margin:0"><label style="font-size:11px">Horário de embarque</label>
          ${dtpFieldHtml('ne-custom-bp-pickup-' + i, '', 'Horário de embarque')}
        </div>
        <div class="adm-field" style="margin:0"><label style="font-size:11px">Endereço</label>
          <input id="ne-custom-bp-address-${i}" class="adm-input adm-input--sm" placeholder="Endereço completo" />
        </div>
        <div class="adm-field" style="margin:0"><label style="font-size:11px">Obs.</label>
          <input id="ne-custom-bp-notes-${i}" class="adm-input adm-input--sm" placeholder="Opcional" />
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end">
        <button type="button" class="adm-btn adm-btn--danger adm-btn--sm" onclick="document.getElementById('ne-dep-custom-bp-${i}').remove()">Remover</button>
      </div>`;
    document.getElementById('ne-dep-bp-custom-list')?.appendChild(row);
  }
  document.getElementById('ne-dep-add-custom-bp-btn')?.addEventListener('click', addNeCustomBpRow);

  // ── Section B toggle ───────────────────────────────────────────────────────
  document.getElementById('ne-dep-check')?.addEventListener('change', async e => {
    const sec = document.getElementById('ne-dep-section');
    if (sec) sec.style.display = e.target.checked ? 'flex' : 'none';
    if (e.target.checked) {
      const depPrice = document.getElementById('ne-dep-price');
      const depCap   = document.getElementById('ne-dep-capacity');
      if (depPrice && !depPrice.value) depPrice.value = document.getElementById('ne-price')?.value ?? '';
      const maxpaxVal = document.getElementById('ne-maxpax')?.value ?? '';
      if (depCap) depCap.max = maxpaxVal;
      if (depCap && !depCap.value) depCap.value = maxpaxVal;
      const listEl = document.getElementById('ne-dep-bp-catalog-list');
      if (listEl && !listEl.dataset.loaded) {
        listEl.innerHTML = '<p style="font-size:11px;color:var(--adm-text-muted)">Carregando catálogo…</p>';
        const { data: catalog = [] } = await listActiveBoardingPoints();
        if (catalog.length === 0) {
          listEl.innerHTML = '<p style="font-size:11px;color:var(--adm-text-muted)">Nenhum ponto no catálogo. Use ponto avulso abaixo.</p>';
        } else {
          listEl.innerHTML = catalog.map(bp => `
            <div style="display:flex;flex-direction:column;gap:4px;padding:8px;background:var(--adm-surface-2,#f8f8f8);border:1px solid var(--adm-border);border-radius:6px">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px">
                <input type="checkbox" id="ne-bpcat-${bp.id}" data-bp-id="${bp.id}" data-bp-name="${bp.name}" style="width:14px;height:14px" />
                <strong>${bp.name}</strong>${bp.city ? ` — ${bp.city}` : ''}
              </label>
              <div id="ne-bpcat-${bp.id}-details" style="display:none;padding-left:22px;flex-wrap:wrap;gap:8px">
                <div class="adm-field" style="margin:0;flex:1;min-width:160px"><label style="font-size:11px">Horário de embarque</label>
                  ${dtpFieldHtml('ne-bpcat-' + bp.id + '-pickup', '', 'Horário de embarque')}
                </div>
                <div class="adm-field" style="margin:0;flex:1;min-width:160px"><label style="font-size:11px">Obs. nesta saída</label>
                  <input id="ne-bpcat-${bp.id}-notes" class="adm-input adm-input--sm" placeholder="Opcional" />
                </div>
              </div>
            </div>`).join('');
          catalog.forEach(bp => {
            document.getElementById(`ne-bpcat-${bp.id}`)?.addEventListener('change', ev => {
              const det = document.getElementById(`ne-bpcat-${bp.id}-details`);
              if (det) det.style.display = ev.target.checked ? 'flex' : 'none';
              if (ev.target.checked) {
                const sv  = document.getElementById('ne-dep-start')?.value;
                const pid = 'ne-bpcat-' + bp.id + '-pickup';
                if (sv && !document.getElementById(pid)?.value) {
                  const _allChecked = [...document.querySelectorAll('#ne-dep-bp-catalog-list input[type="checkbox"]:checked')];
                  const _catIdx     = _allChecked.findIndex(c => c.dataset.bpId === String(bp.id));
                  const _bpIdx      = _catIdx >= 0 ? _catIdx : _allChecked.length;
                  dtpSetValue(pid, _addBpMinutes(sv, _bpIdx * 15));
                }
              }
            });
          });
        }
        listEl.dataset.loaded = '1';
      }
    }
  });

  // ── Smart end_at + BP prefill for ne ──────────────────────────────────────
  let _neEndOverride = false;
  document.getElementById('ne-dep-start')?.addEventListener('change', () => {
    _neEndOverride = false; // start changed → allow recalc
    dtpAutoCalcEnd('ne-dep-start', 'ne-dep-end', 'ne-duration');
    const sv = document.getElementById('ne-dep-start')?.value;
    if (!sv) return;
    let _neBpIdx = 0;
    // Pre-fill checked catalog BPs
    document.querySelectorAll('#ne-dep-bp-catalog-list input[type="checkbox"]:checked').forEach(cb => {
      const pid = 'ne-bpcat-' + cb.dataset.bpId + '-pickup';
      if (!document.getElementById(pid)?.value) dtpSetValue(pid, _addBpMinutes(sv, _neBpIdx * 15));
      _neBpIdx++;
    });
    // Pre-fill custom BPs
    document.querySelectorAll('[id^="ne-dep-custom-bp-"]').forEach(r => {
      const pid = 'ne-custom-bp-pickup-' + r.id.replace('ne-dep-custom-bp-', '');
      if (!document.getElementById(pid)?.value) dtpSetValue(pid, _addBpMinutes(sv, _neBpIdx * 15));
      _neBpIdx++;
    });
  });
  document.getElementById('ne-dep-end')?.addEventListener('change', () => {
    if (document.getElementById('ne-dep-end')?.dataset.dtpManual === '1') _neEndOverride = true;
  });
  document.getElementById('ne-duration')?.addEventListener('change', () => {
    if (!_neEndOverride) dtpAutoCalcEnd('ne-dep-start', 'ne-dep-end', 'ne-duration');
  });

  // ── Section C toggle ───────────────────────────────────────────────────────
  document.getElementById('ne-res-check')?.addEventListener('change', e => {
    const sec   = document.getElementById('ne-res-section');
    const parts = document.getElementById('ne-parts-wrapper');
    if (sec)   sec.style.display   = e.target.checked ? 'flex' : 'none';
    if (parts) parts.style.display = e.target.checked ? 'block' : 'none';
  });

  // ── Section D: add/remove participant rows ────────────────────────────────
  let partCount = 0;
  function addParticipantRow() {
    const i = partCount++;
    const row = document.createElement('div');
    row.className = 'adm-part-row';
    row.id = `ne-part-row-${i}`;
    row.innerHTML = `
      <div class="adm-grid-2" style="gap:8px">
        <div class="adm-field" style="margin:0"><label style="font-size:11px">Nome *</label>
          <input id="ne-p-name-${i}" class="adm-input adm-input--sm" placeholder="Nome completo" />
        </div>
        <div class="adm-field" style="margin:0"><label style="font-size:11px">Perfil</label>
          <select id="ne-p-profile-${i}" class="adm-select adm-select--sm">
            <option value="adult">Adulto</option>
            <option value="child">Criança</option>
            <option value="senior">Idoso (60+)</option>
            <option value="pcd">PCD</option>
          </select>
        </div>
        <div class="adm-field" style="margin:0"><label style="font-size:11px">Data de nascimento</label>
          <input id="ne-p-birth-${i}" class="adm-input adm-input--sm" type="date" />
        </div>
        <div class="adm-field" style="margin:0;align-self:flex-end">
          <button type="button" class="adm-btn adm-btn--danger adm-btn--sm" onclick="document.getElementById('ne-part-row-${i}').remove()">Remover</button>
        </div>
      </div>`;
    document.getElementById('ne-parts-list')?.appendChild(row);
  }

  document.getElementById('ne-add-part-btn')?.addEventListener('click', addParticipantRow);
  addParticipantRow(); // one row by default

  // ── Image upload ──────────────────────────────────────────────────────────
  const pickCover = () => document.getElementById('ne-cover-file')?.click();
  document.getElementById('ne-cover-pick-btn')?.addEventListener('click', pickCover);
  document.getElementById('ne-cover-change-btn')?.addEventListener('click', pickCover);
  document.getElementById('ne-cover-file')?.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const db = window.anauaDb;
    if (!db) { toast('Supabase não disponível.', 'error'); return; }
    const statusEl = document.getElementById('ne-cover-status');
    if (statusEl) statusEl.textContent = 'Enviando…';
    const ext  = file.name.split('.').pop();
    const path = `covers/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: upErr } = await db.storage.from('experience-covers').upload(path, file, { cacheControl:'3600', upsert:false, contentType:file.type });
    if (upErr) { if (statusEl) statusEl.textContent = '✗ Falha'; toast('Upload falhou: '+upErr.message,'error'); return; }
    const { data: pub } = db.storage.from('experience-covers').getPublicUrl(path);
    const url = pub.publicUrl;
    const hiddenEl  = document.getElementById('ne-cover');
    const imgEl     = document.getElementById('ne-cover-img');
    const nameEl    = document.getElementById('ne-cover-name');
    const previewEl = document.getElementById('ne-cover-preview');
    const emptyEl   = document.getElementById('ne-cover-empty');
    if (hiddenEl)  hiddenEl.value  = url;
    if (imgEl)     imgEl.src       = url;
    if (nameEl)    nameEl.textContent = file.name;
    if (previewEl) previewEl.style.display = 'flex';
    if (emptyEl)   emptyEl.style.display   = 'none';
    toast('Imagem enviada!', 'success');
  });

  // ── Submit ─────────────────────────────────────────────────────────────────
  document.getElementById('nova-exp-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const saveBtn = document.getElementById('ne-save-btn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Salvando…'; }

    // A — Experience payload
    const _taToArr = v => (v || '').split('\n').map(s => s.trim()).filter(Boolean);
    const experience = {
      title:               document.getElementById('ne-title').value.trim(),
      slug:                document.getElementById('ne-slug').value.trim(),
      subtitle:            document.getElementById('ne-subtitle')?.value.trim() || null,
      short_description:   document.getElementById('ne-short-desc')?.value.trim() || null,
      description:         document.getElementById('ne-description')?.value.trim() || null,
      location:            document.getElementById('ne-location')?.value.trim() || null,
      region:              document.getElementById('ne-region')?.value.trim() || null,
      category:            document.getElementById('ne-category')?.value || null,
      difficulty:          document.getElementById('ne-difficulty')?.value || null,
      base_price:          parseFloat(document.getElementById('ne-price')?.value) || 0,
      currency:            document.getElementById('ne-currency')?.value || 'BRL',
      duration_text:       document.getElementById('ne-duration-text')?.value.trim() || null,
      duration_hours:      parseFloat(document.getElementById('ne-duration')?.value) || null,
      max_participants:    parseInt(document.getElementById('ne-maxpax')?.value, 10) || null,
      min_age:             parseInt(document.getElementById('ne-minage')?.value, 10) || null,
      distance_km:         parseFloat(document.getElementById('ne-distance')?.value) || null,
      elevation_gain_m:    parseInt(document.getElementById('ne-elevation')?.value, 10) || null,
      highlights:          _taToArr(document.getElementById('ne-highlights')?.value),
      includes:            _taToArr(document.getElementById('ne-includes')?.value),
      excludes:            _taToArr(document.getElementById('ne-excludes')?.value),
      what_to_bring:       _taToArr(document.getElementById('ne-bring')?.value),
      cancellation_policy: document.getElementById('ne-cancel-policy')?.value.trim() || null,
      cover_image_url:     document.getElementById('ne-cover')?.value.trim() || null,
      gallery:             _taToArr(document.getElementById('ne-gallery')?.value),
      is_active:           document.getElementById('ne-active')?.checked ?? true,
      featured:            document.getElementById('ne-featured')?.checked ?? false,
      is_new:              document.getElementById('ne-is-new')?.checked ?? false,
    };

    if (!experience.title || !experience.slug) {
      toast('Título e slug são obrigatórios.', 'error');
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Salvar experiência'; }
      return;
    }

    // B — Departure payload (optional)
    let departure = null;
    if (document.getElementById('ne-dep-check')?.checked) {
      const startVal = document.getElementById('ne-dep-start')?.value;
      if (!startVal) {
        toast('Informe a data/hora de início da saída.', 'error');
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Salvar experiência'; }
        return;
      }
      // Collect boarding points (catalog + custom)
      let neSortIdx = 0;
      const neBpSelections = [];
      document.querySelectorAll('#ne-dep-bp-catalog-list input[type="checkbox"]:checked').forEach(cb => {
        const bpId = cb.dataset.bpId;
        const pickupEl = document.getElementById(`ne-bpcat-${bpId}-pickup`);
        const notesEl  = document.getElementById(`ne-bpcat-${bpId}-notes`);
        neBpSelections.push({
          boardingPointId: bpId,
          pickupAt:  pickupEl?.value ? new Date(pickupEl.value).toISOString() : null,
          notes:     notesEl?.value.trim() || null,
          isActive:  true,
          sortOrder: neSortIdx++,
        });
      });
      document.querySelectorAll('[id^="ne-dep-custom-bp-"]').forEach(r => {
        const i = r.id.replace('ne-dep-custom-bp-', '');
        const lbl = document.getElementById(`ne-custom-bp-label-${i}`)?.value.trim() || null;
        if (!lbl) return;
        neBpSelections.push({
          boardingPointId: null,
          customLabel:   lbl,
          customAddress: document.getElementById(`ne-custom-bp-address-${i}`)?.value.trim() || null,
          pickupAt:      document.getElementById(`ne-custom-bp-pickup-${i}`)?.value ? new Date(document.getElementById(`ne-custom-bp-pickup-${i}`).value).toISOString() : null,
          notes:         document.getElementById(`ne-custom-bp-notes-${i}`)?.value.trim() || null,
          isActive:      true,
          sortOrder:     neSortIdx++,
        });
      });
      const firstBpName = neBpSelections[0]
        ? (neBpSelections[0].boardingPointId
            ? (document.querySelector(`#ne-dep-bp-catalog-list input[data-bp-id="${neBpSelections[0].boardingPointId}"]`)?.dataset.bpName ?? null)
            : neBpSelections[0].customLabel)
        : null;
      departure = {
        start_at:      new Date(startVal).toISOString(),
        end_at:        document.getElementById('ne-dep-end')?.value ? new Date(document.getElementById('ne-dep-end').value).toISOString() : null,
        meeting_point: firstBpName,
        capacity:      Math.min(parseInt(document.getElementById('ne-dep-capacity')?.value, 10) || experience.max_participants || Infinity, experience.max_participants || Infinity) || null,
        price:         parseFloat(document.getElementById('ne-dep-price')?.value) || experience.base_price || null,
        status:        document.getElementById('ne-dep-status')?.value || 'scheduled',
        title:         document.getElementById('ne-dep-title')?.value.trim() || null,
        _bpPoints:     neBpSelections,
      };
    }

    // C — Reservation payload (optional)
    let reservation = null;
    if (document.getElementById('ne-res-check')?.checked) {
      const resName = document.getElementById('ne-res-name')?.value.trim();
      if (!resName) {
        toast('Nome do responsável é obrigatório para criar reserva.', 'error');
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Salvar experiência'; }
        return;
      }
      reservation = {
        customer_name:      resName,
        customer_email:     document.getElementById('ne-res-email')?.value.trim() || null,
        customer_phone:     document.getElementById('ne-res-phone')?.value.trim() || null,
        payment_method:     document.getElementById('ne-res-payment')?.value || null,
        reservation_status: document.getElementById('ne-res-status')?.value || 'reserved',
        total_amount:       parseFloat(document.getElementById('ne-res-total')?.value) || 0,
        amount_paid:        parseFloat(document.getElementById('ne-res-paid')?.value) || 0,
        notes:              document.getElementById('ne-res-notes')?.value.trim() || null,
      };
    }

    // D — Participants
    let participants = null;
    if (document.getElementById('ne-res-check')?.checked) {
      const rows = document.querySelectorAll('[id^="ne-part-row-"]');
      participants = Array.from(rows).map((row, idx) => {
        const i = row.id.replace('ne-part-row-', '');
        return {
          name:         document.getElementById(`ne-p-name-${i}`)?.value.trim() || null,
          profile_type: document.getElementById(`ne-p-profile-${i}`)?.value || 'adult',
          birthdate:    document.getElementById(`ne-p-birth-${i}`)?.value || null,
        };
      }).filter(p => p.name);
    }

    // Persist
    const bpPointsToCreate = departure?._bpPoints ?? [];
    if (departure) delete departure._bpPoints;

    const { data, error } = await createExperienceBundle({ experience, departure, reservation, participants });

    if (error) {
      console.error('[nova-exp] Erro:', error.message ?? error);
      toast('Erro ao salvar: ' + (error.message ?? 'verifique o console.'), 'error');
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Salvar experiência'; }
      return;
    }

    console.log('[nova-exp] Bundle criado ✓', data);

    const msgs = ['Experiência cadastrada!'];
    if (data?.departure_id) {
      msgs.push('Saída criada.');
      if (bpPointsToCreate.length > 0) {
        const { error: bpErr } = await createBoardingPoints(data.departure_id, bpPointsToCreate);
        if (bpErr) toast('Pontos de embarque não salvos: ' + bpErr.message, 'error');
        else msgs.push(`${bpPointsToCreate.length} ponto(s) de embarque criados.`);
      }
    }
    if (data?.reservation_id) msgs.push('Reserva criada.');
    toast(msgs.join(' '), 'success');

    closeDrawer();
    navigate('#experiencias');
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  HELPER: UPLOAD DE IMAGEM DE CAPA
// ─────────────────────────────────────────────────────────────────────────────
async function uploadExperienciaCover(file) {
  const db = window.anauaDb;
  const statusEl   = document.getElementById('exp-cover-status');
  const previewEl  = document.getElementById('exp-cover-preview');
  const emptyEl    = document.getElementById('exp-cover-empty');
  const imgEl      = document.getElementById('exp-cover-img');
  const nameEl     = document.getElementById('exp-cover-name');
  const hiddenInput = document.getElementById('exp-cover');

  if (!db) { toast('Supabase não disponível.', 'error'); return; }

  if (statusEl) statusEl.textContent = 'Enviando…';

  const ext  = file.name.split('.').pop();
  const path = `covers/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

  const { error: uploadError } = await db.storage
    .from('experience-covers')
    .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });

  if (uploadError) {
    console.warn('[upload] Erro ao enviar capa:', uploadError.message);
    if (statusEl) statusEl.textContent = '✗ Falha no upload';
    toast('Erro ao fazer upload da imagem: ' + uploadError.message, 'error');
    return;
  }

  const { data } = db.storage.from('experience-covers').getPublicUrl(path);
  const url = data.publicUrl;

  if (hiddenInput) hiddenInput.value = url;

  // Show preview, hide empty state
  if (imgEl)     imgEl.src = url;
  if (nameEl)    nameEl.textContent = file.name;
  if (previewEl) previewEl.style.display = 'flex';
  if (emptyEl)   emptyEl.style.display   = 'none';

  console.log('[upload] Capa enviada com sucesso:', url);
  toast('Imagem enviada!', 'success');
}

// ─────────────────────────────────────────────────────────────────────────────
//  EDITAR EXPERIÊNCIA
// ─────────────────────────────────────────────────────────────────────────────

async function openEditExperienciaModal(id) {
  const db = window.anauaDb;
  if (!db) { toast('Supabase não disponível.', 'error'); return; }

  openDrawer('Editar experiência', `<div style="padding:24px;color:var(--adm-text-muted)">Carregando…</div>`);

  const { data: row, error } = await db
    .from('experiences')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !row) {
    $('adm-drawer-body').innerHTML = `<p style="color:var(--adm-danger);padding:16px">Não foi possível carregar a experiência.</p>`;
    return;
  }

  const esc = escHtml;
  const sel = (val, opt) => val === opt ? 'selected' : '';
  const toArr = v => Array.isArray(v) ? v : (!v ? [] : (typeof v === 'string' ? (() => { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } })() : []));
  const arrToTa = arr => toArr(arr).join('\n');

  $('adm-drawer-title').textContent = 'Editar experiência';
  $('adm-drawer-body').innerHTML = `
    <form id="edit-exp-form" autocomplete="off">

      <!-- ═══ 1. DADOS PRINCIPAIS ══════════════════════════════════════ -->
      <fieldset class="exp-section">
        <legend class="exp-section__title">Dados principais</legend>
        <div class="exp-section__body">
          <div class="adm-field">
            <label>Título *</label>
            <input id="ee-title" class="adm-input" required value="${esc(row.title ?? '')}" />
          </div>
          <div class="adm-field">
            <label>Slug *</label>
            <input id="ee-slug" class="adm-input" required value="${esc(row.slug ?? '')}" />
          </div>
          <div class="adm-field">
            <label>Subtítulo</label>
            <input id="ee-subtitle" class="adm-input" value="${esc(row.subtitle ?? '')}" placeholder="Frase curta para o card e SEO" />
          </div>
          <div class="adm-field">
            <label>Descrição curta</label>
            <textarea id="ee-short-desc" class="adm-input" rows="2">${esc(row.short_description ?? '')}</textarea>
          </div>
          <div class="adm-field">
            <label>Descrição completa</label>
            <textarea id="ee-description" class="adm-input" rows="4">${esc(row.description ?? '')}</textarea>
          </div>
        </div>
      </fieldset>

      <!-- ═══ 2. CLASSIFICAÇÃO ══════════════════════════════════════════ -->
      <fieldset class="exp-section">
        <legend class="exp-section__title">Classificação</legend>
        <div class="exp-section__body">
          <div class="adm-grid-2">
            <div class="adm-field"><label>Categoria</label>
              <select id="ee-category" class="adm-select">
                <option value="">— selecione —</option>
                <option value="day-experience" ${sel(row.category,'day-experience')}>Experiência de 1 dia</option>
                <option value="expedition" ${sel(row.category,'expedition')}>Expedição</option>
                <option value="event" ${sel(row.category,'event')}>Evento</option>
                <option value="kids" ${sel(row.category,'kids')}>Kids</option>
              </select>
            </div>
            <div class="adm-field"><label>Dificuldade</label>
              <select id="ee-difficulty" class="adm-select">
                <option value="">— selecione —</option>
                <option value="iniciante" ${sel(row.difficulty,'iniciante')}>Iniciante (Fácil)</option>
                <option value="moderado" ${sel(row.difficulty,'moderado')}>Moderado</option>
                <option value="aventura" ${sel(row.difficulty,'aventura')}>Aventura (Difícil)</option>
              </select>
            </div>
          </div>
          <div class="adm-grid-2">
            <div class="adm-field"><label>Região</label>
              <input id="ee-region" class="adm-input" value="${esc(row.region ?? '')}" placeholder="Ex: Serra do Espinhaço" />
            </div>
            <div class="adm-field"><label>Local / ponto de partida</label>
              <input id="ee-location" class="adm-input" value="${esc(row.location ?? '')}" />
            </div>
          </div>
        </div>
      </fieldset>

      <!-- ═══ 3. OPERAÇÃO ════════════════════════════════════════════════ -->
      <fieldset class="exp-section">
        <legend class="exp-section__title">Operação</legend>
        <div class="exp-section__body">
          <div class="adm-grid-2">
            <div class="adm-field">
              <label>Duração (texto)</label>
              <input id="ee-duration-text" class="adm-input" value="${esc(row.duration_text ?? '')}" placeholder="Ex: 2 dias / 1 noite" />
              <span class="adm-hint">Texto livre exibido na página pública.</span>
            </div>
            <div class="adm-field">
              <label>Duração (horas)</label>
              <input id="ee-duration" class="adm-input" type="number" min="0.5" step="0.5" value="${row.duration_hours ?? ''}" />
            </div>
          </div>
          <div class="adm-grid-2">
            <div class="adm-field"><label>Capacidade máxima (pax)</label>
              <input id="ee-maxpax" class="adm-input" type="number" min="1" value="${row.max_participants ?? ''}" />
            </div>
            <div class="adm-field"><label>Idade mínima (anos)</label>
              <input id="ee-minage" class="adm-input" type="number" min="0" value="${row.min_age ?? ''}" />
            </div>
          </div>
          <div class="adm-grid-2">
            <div class="adm-field"><label>Distância (km)</label>
              <input id="ee-distance" class="adm-input" type="number" min="0" step="0.1" value="${row.distance_km ?? ''}" />
            </div>
            <div class="adm-field"><label>Ganho de elevação (m)</label>
              <input id="ee-elevation" class="adm-input" type="number" min="0" value="${row.elevation_gain_m ?? ''}" />
            </div>
          </div>
        </div>
      </fieldset>

      <!-- ═══ 4. COMERCIAL ══════════════════════════════════════════════ -->
      <fieldset class="exp-section">
        <legend class="exp-section__title">Comercial</legend>
        <div class="exp-section__body">
          <div class="adm-grid-2">
            <div class="adm-field"><label>Preço base (R$)</label>
              <input id="ee-price" class="adm-input" type="number" min="0" step="0.01" value="${row.base_price ?? 0}" />
            </div>
            <div class="adm-field"><label>Moeda</label>
              <select id="ee-currency" class="adm-select">
                <option value="BRL" ${sel(row.currency ?? 'BRL','BRL')}>BRL — Real</option>
                <option value="USD" ${sel(row.currency,'USD')}>USD — Dólar</option>
                <option value="EUR" ${sel(row.currency,'EUR')}>EUR — Euro</option>
              </select>
            </div>
          </div>
        </div>
      </fieldset>

      <!-- ═══ 5. CONTEÚDO DA PÁGINA ══════════════════════════════════════ -->
      <fieldset class="exp-section">
        <legend class="exp-section__title">Conteúdo da página pública</legend>
        <div class="exp-section__body">
          <div class="adm-field">
            <label>Destaques / Highlights</label>
            <textarea id="ee-highlights" class="adm-input" rows="4" placeholder="Uma linha por item">${esc(arrToTa(row.highlights))}</textarea>
            <span class="adm-hint">Uma linha por item.</span>
          </div>
          <div class="adm-grid-2">
            <div class="adm-field">
              <label>O que está incluído</label>
              <textarea id="ee-includes" class="adm-input" rows="4" placeholder="Uma linha por item">${esc(arrToTa(row.includes))}</textarea>
              <span class="adm-hint">Uma linha por item.</span>
            </div>
            <div class="adm-field">
              <label>O que NÃO está incluído</label>
              <textarea id="ee-excludes" class="adm-input" rows="4" placeholder="Uma linha por item">${esc(arrToTa(row.excludes))}</textarea>
              <span class="adm-hint">Uma linha por item.</span>
            </div>
          </div>
          <div class="adm-field">
            <label>O que levar / trazer</label>
            <textarea id="ee-bring" class="adm-input" rows="3" placeholder="Uma linha por item">${esc(arrToTa(row.what_to_bring))}</textarea>
            <span class="adm-hint">Uma linha por item.</span>
          </div>
          <div class="adm-field">
            <label>Política de cancelamento</label>
            <textarea id="ee-cancel-policy" class="adm-input" rows="2">${esc(row.cancellation_policy ?? '')}</textarea>
          </div>
        </div>
      </fieldset>

      <!-- ═══ 6. MÍDIA ══════════════════════════════════════════════════ -->
      <fieldset class="exp-section">
        <legend class="exp-section__title">Mídia</legend>
        <div class="exp-section__body">
          <div class="adm-field">
            <label>Imagem de capa</label>
            <div class="adm-upload-widget">
              <input type="file" id="ee-cover-file" accept="image/*" style="display:none" />
              <div id="ee-cover-preview" style="display:${row.cover_image_url ? 'flex' : 'none'};align-items:center;gap:10px">
                <img id="ee-cover-img" src="${esc(row.cover_image_url ?? '')}" alt="" style="width:56px;height:56px;object-fit:cover;border-radius:6px;border:1px solid var(--adm-border)" />
                <div>
                  <span id="ee-cover-name" style="font-size:12px;color:var(--adm-muted)"></span><br>
                  <button type="button" class="adm-btn adm-btn--ghost adm-btn--sm" id="ee-cover-change-btn">Trocar</button>
                </div>
              </div>
              <div id="ee-cover-empty" style="display:${row.cover_image_url ? 'none' : 'block'}">
                <button type="button" class="adm-btn adm-btn--secondary adm-btn--sm" id="ee-cover-pick-btn">📷 Escolher imagem</button>
                <span id="ee-cover-status" style="font-size:12px;color:var(--adm-muted);margin-left:8px"></span>
              </div>
              <input type="hidden" id="ee-cover" value="${esc(row.cover_image_url ?? '')}" />
            </div>
          </div>
          <div class="adm-field">
            <label>Galeria (URLs)</label>
            <textarea id="ee-gallery" class="adm-input" rows="3" placeholder="Uma URL por linha">${esc(arrToTa(row.gallery))}</textarea>
            <span class="adm-hint">Uma URL por linha.</span>
          </div>
        </div>
      </fieldset>

      <!-- ═══ 7. VISIBILIDADE ════════════════════════════════════════════ -->
      <fieldset class="exp-section">
        <legend class="exp-section__title">Visibilidade</legend>
        <div class="exp-section__body">
          <div class="exp-section__checks">
            <label class="exp-check"><input id="ee-active" type="checkbox" ${row.is_active !== false ? 'checked' : ''} /><span><strong>Ativa</strong> — visível no site público</span></label>
            <label class="exp-check"><input id="ee-featured" type="checkbox" ${row.featured ? 'checked' : ''} /><span><strong>Destaque</strong> — aparece em promoções e home</span></label>
            <label class="exp-check"><input id="ee-is-new" type="checkbox" ${row.is_new ? 'checked' : ''} /><span><strong>Novidade</strong> — exibe selo "Novo" no card</span></label>
          </div>
        </div>
      </fieldset>

      <!-- ══ NOVA SAÍDA ═════════════════════════════════════════════ -->
      <div class="adm-section-hd" style="margin-top:20px">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:600">
          <input id="ee-dep-check" type="checkbox" style="width:16px;height:16px" />
          Criar nova saída
        </label>
      </div>
      <div id="ee-dep-section" style="display:none;flex-direction:column;gap:12px">
        <div class="adm-grid-2">
          <div class="adm-field"><label>Data/hora de início *</label>
            ${dtpFieldHtml('ee-dep-start')}
          </div>
          <div class="adm-field"><label>Data/hora de término</label>
            ${dtpFieldHtml('ee-dep-end')}
          </div>
        </div>
        <div class="adm-grid-2">
          <div class="adm-field"><label>Capacidade (vagas)</label>
            <input id="ee-dep-capacity" class="adm-input" type="number" min="1" placeholder="Igual à capacidade máxima" />
          </div>
          <div class="adm-field"><label>Preço (R$)</label>
            <input id="ee-dep-price" class="adm-input" type="number" min="0" step="0.01" placeholder="Igual ao preço base" />
          </div>
        </div>
        <div class="adm-field"><label>Status da saída</label>
          <select id="ee-dep-status" class="adm-select">
            <option value="scheduled">Aberta</option>
            <option value="sold_out">Esgotada</option>
            <option value="cancelled">Cancelada</option>
          </select>
        </div>
        <div class="adm-field"><label>Título da saída (opcional)</label>
          <input id="ee-dep-title" class="adm-input" placeholder="Ex: Saída de verão" />
        </div>

        <!-- Pontos de embarque -->
        <div style="margin-top:4px">
          <label style="font-weight:600;font-size:13px;display:block;margin-bottom:6px">Pontos de embarque (catálogo)</label>
          <div id="ee-dep-bp-catalog-list" style="display:flex;flex-direction:column;gap:6px"><p style="font-size:11px;color:var(--adm-text-muted)">Ative «Nova saída» para carregar os pontos.</p></div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-top:10px;margin-bottom:6px">
            <label style="font-size:12px;color:var(--adm-text-muted)">Ponto personalizado (não catalogado)</label>
            <button type="button" class="adm-btn adm-btn--ghost adm-btn--sm" id="ee-dep-add-custom-bp-btn">+ Ponto avulso</button>
          </div>
          <div id="ee-dep-bp-custom-list" style="display:flex;flex-direction:column;gap:10px"></div>
        </div>
      </div>

      <!-- ══ NOVA RESERVA MANUAL ════════════════════════════════════ -->
      <div class="adm-section-hd" style="margin-top:20px">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:600">
          <input id="ee-res-check" type="checkbox" style="width:16px;height:16px" />
          Criar reserva manual
        </label>
      </div>
      <div id="ee-res-section" style="display:none;flex-direction:column;gap:12px">
        <p style="font-size:12px;color:var(--adm-text-muted)">Preencha os dados do responsável pela reserva.</p>
        <div class="adm-field"><label>Nome do responsável *</label>
          <input id="ee-res-name" class="adm-input" placeholder="Nome completo" />
        </div>
        <div class="adm-grid-2">
          <div class="adm-field"><label>E-mail</label>
            <input id="ee-res-email" class="adm-input" type="email" placeholder="email@exemplo.com" />
          </div>
          <div class="adm-field"><label>Telefone</label>
            <input id="ee-res-phone" class="adm-input" type="tel" placeholder="(99) 99999-9999" />
          </div>
        </div>
        <div class="adm-grid-2">
          <div class="adm-field"><label>Forma de pagamento</label>
            <select id="ee-res-payment" class="adm-select">
              <option value="">— selecione —</option>
              <option value="pix">Pix</option>
              <option value="credit_card">Cartão de crédito</option>
              <option value="bank_transfer">Transferência</option>
              <option value="cash">Dinheiro</option>
              <option value="other">Outro</option>
            </select>
          </div>
          <div class="adm-field"><label>Status da reserva</label>
            <select id="ee-res-status" class="adm-select">
              <option value="reserved">Reservado</option>
              <option value="pending_payment">Aguardando pagamento</option>
              <option value="paid">Pago</option>
              <option value="cancelled">Cancelado</option>
            </select>
          </div>
        </div>
        <div class="adm-grid-2">
          <div class="adm-field"><label>Valor total (R$)</label>
            <input id="ee-res-total" class="adm-input" type="number" min="0" step="0.01" placeholder="0,00" />
          </div>
          <div class="adm-field"><label>Valor pago (R$)</label>
            <input id="ee-res-paid" class="adm-input" type="number" min="0" step="0.01" placeholder="0,00" />
          </div>
        </div>
        <div class="adm-field"><label>Observações</label>
          <textarea id="ee-res-notes" class="adm-input" rows="2" placeholder="Informações adicionais..."></textarea>
        </div>
      </div>

      <!-- ══ PARTICIPANTES ══════════════════════════════════════════ -->
      <div id="ee-parts-wrapper" style="display:none">
        <div class="adm-section-hd" style="margin-top:20px">Participantes</div>
        <div id="ee-parts-list" style="display:flex;flex-direction:column;gap:10px"></div>
        <button type="button" class="adm-btn adm-btn--ghost adm-btn--sm" id="ee-add-part-btn" style="margin-top:8px">+ Adicionar participante</button>
      </div>

      <!-- ══ FOOTER ════════════════════════════════════════════════ -->
      <div style="display:flex;gap:10px;margin-top:24px;padding-top:16px;border-top:1px solid var(--adm-border)">
        <button type="submit" id="ee-save-btn" class="adm-btn adm-btn--primary" style="flex:1">Salvar alterações</button>
        <button type="button" class="adm-btn adm-btn--secondary" onclick="closeDrawer()">Cancelar</button>
      </div>

      ${row.is_active === false ? `
      <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--adm-border)">
        <button type="button" id="ee-delete-btn" class="adm-btn adm-btn--danger" style="width:100%">🗑️ Excluir experiência permanentemente</button>
        <p style="font-size:11px;color:var(--adm-text-muted);margin-top:6px;text-align:center">Remove a experiência, saídas e entradas de lista de espera vinculadas.</p>
      </div>` : ''}

    </form>`;

  // ── Image upload ──────────────────────────────────────────────────────────
  const pickCover = () => document.getElementById('ee-cover-file')?.click();
  document.getElementById('ee-cover-pick-btn')?.addEventListener('click', pickCover);
  document.getElementById('ee-cover-change-btn')?.addEventListener('click', pickCover);
  document.getElementById('ee-cover-file')?.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const statusEl = document.getElementById('ee-cover-status');
    if (statusEl) statusEl.textContent = 'Enviando…';
    const ext  = file.name.split('.').pop();
    const path = `covers/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: upErr } = await db.storage.from('experience-covers').upload(path, file, { cacheControl:'3600', upsert:false, contentType:file.type });
    if (upErr) { if (statusEl) statusEl.textContent = '✗ Falha'; toast('Upload falhou: '+upErr.message,'error'); return; }
    const { data: pub } = db.storage.from('experience-covers').getPublicUrl(path);
    const url = pub.publicUrl;
    const hiddenEl  = document.getElementById('ee-cover');
    const imgEl     = document.getElementById('ee-cover-img');
    const nameEl    = document.getElementById('ee-cover-name');
    const previewEl = document.getElementById('ee-cover-preview');
    const emptyEl   = document.getElementById('ee-cover-empty');
    if (hiddenEl)  hiddenEl.value  = url;
    if (imgEl)     imgEl.src       = url;
    if (nameEl)    nameEl.textContent = file.name;
    if (previewEl) previewEl.style.display = 'flex';
    if (emptyEl)   emptyEl.style.display   = 'none';
    toast('Imagem enviada!', 'success');
  });

  // ── Section B: pontos de embarque ────────────────────────────────────────
  let eeCustomBpCount = 0;
  function addEeCustomBpRow() {
    const i = eeCustomBpCount++;
    const row = document.createElement('div');
    row.id = `ee-dep-custom-bp-${i}`;
    row.style.cssText = 'background:var(--adm-surface-2,#f8f8f8);border:1px solid var(--adm-border);border-radius:6px;padding:10px;display:flex;flex-direction:column;gap:8px';
    row.innerHTML = `
      <div class="adm-grid-2" style="gap:8px">
        <div class="adm-field" style="margin:0"><label style="font-size:11px">Local / ponto *</label>
          <input id="ee-custom-bp-label-${i}" class="adm-input adm-input--sm" placeholder="Ex: Estacionamento do Parque" />
        </div>
        <div class="adm-field" style="margin:0"><label style="font-size:11px">Horário de embarque</label>
          ${dtpFieldHtml('ee-custom-bp-pickup-' + i, '', 'Horário de embarque')}
        </div>
        <div class="adm-field" style="margin:0"><label style="font-size:11px">Endereço</label>
          <input id="ee-custom-bp-address-${i}" class="adm-input adm-input--sm" placeholder="Endereço completo" />
        </div>
        <div class="adm-field" style="margin:0"><label style="font-size:11px">Obs.</label>
          <input id="ee-custom-bp-notes-${i}" class="adm-input adm-input--sm" placeholder="Opcional" />
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end">
        <button type="button" class="adm-btn adm-btn--danger adm-btn--sm" onclick="document.getElementById('ee-dep-custom-bp-${i}').remove()">Remover</button>
      </div>`;
    document.getElementById('ee-dep-bp-custom-list')?.appendChild(row);
  }
  document.getElementById('ee-dep-add-custom-bp-btn')?.addEventListener('click', addEeCustomBpRow);

  // ── maxpax → limita ee-dep-capacity ───────────────────────────────────────
  document.getElementById('ee-maxpax')?.addEventListener('change', e => {
    const depCap = document.getElementById('ee-dep-capacity');
    if (!depCap) return;
    depCap.max = e.target.value;
    if (!depCap.value) depCap.value = e.target.value;
    else if (parseInt(depCap.value) > parseInt(e.target.value)) depCap.value = e.target.value;
  });

  // ── Section B toggle ──────────────────────────────────────────────────────
  document.getElementById('ee-dep-check')?.addEventListener('change', async e => {
    const sec = document.getElementById('ee-dep-section');
    if (sec) sec.style.display = e.target.checked ? 'flex' : 'none';
    if (e.target.checked) {
      const depPrice = document.getElementById('ee-dep-price');
      const depCap   = document.getElementById('ee-dep-capacity');
      if (depPrice && !depPrice.value) depPrice.value = document.getElementById('ee-price')?.value ?? '';
      const eeMaxpaxVal = document.getElementById('ee-maxpax')?.value ?? '';
      if (depCap) depCap.max = eeMaxpaxVal;
      if (depCap && !depCap.value) depCap.value = eeMaxpaxVal;
      const listEl = document.getElementById('ee-dep-bp-catalog-list');
      if (listEl && !listEl.dataset.loaded) {
        listEl.innerHTML = '<p style="font-size:11px;color:var(--adm-text-muted)">Carregando catálogo…</p>';
        const { data: catalog = [] } = await listActiveBoardingPoints();
        if (catalog.length === 0) {
          listEl.innerHTML = '<p style="font-size:11px;color:var(--adm-text-muted)">Nenhum ponto no catálogo. Use ponto avulso abaixo.</p>';
        } else {
          listEl.innerHTML = catalog.map(bp => `
            <div style="display:flex;flex-direction:column;gap:4px;padding:8px;background:var(--adm-surface-2,#f8f8f8);border:1px solid var(--adm-border);border-radius:6px">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px">
                <input type="checkbox" id="ee-bpcat-${bp.id}" data-bp-id="${bp.id}" data-bp-name="${bp.name}" style="width:14px;height:14px" />
                <strong>${bp.name}</strong>${bp.city ? ` — ${bp.city}` : ''}
              </label>
              <div id="ee-bpcat-${bp.id}-details" style="display:none;padding-left:22px;flex-wrap:wrap;gap:8px">
                <div class="adm-field" style="margin:0;flex:1;min-width:160px"><label style="font-size:11px">Horário de embarque</label>
                  ${dtpFieldHtml('ee-bpcat-' + bp.id + '-pickup', '', 'Horário de embarque')}
                </div>
                <div class="adm-field" style="margin:0;flex:1;min-width:160px"><label style="font-size:11px">Obs. nesta saída</label>
                  <input id="ee-bpcat-${bp.id}-notes" class="adm-input adm-input--sm" placeholder="Opcional" />
                </div>
              </div>
            </div>`).join('');
          catalog.forEach(bp => {
            document.getElementById(`ee-bpcat-${bp.id}`)?.addEventListener('change', ev => {
              const det = document.getElementById(`ee-bpcat-${bp.id}-details`);
              if (det) det.style.display = ev.target.checked ? 'flex' : 'none';
              if (ev.target.checked) {
                const sv  = document.getElementById('ee-dep-start')?.value;
                const pid = 'ee-bpcat-' + bp.id + '-pickup';
                if (sv && !document.getElementById(pid)?.value) {
                  const _allChecked = [...document.querySelectorAll('#ee-dep-bp-catalog-list input[type="checkbox"]:checked')];
                  const _catIdx     = _allChecked.findIndex(c => c.dataset.bpId === String(bp.id));
                  const _bpIdx      = _catIdx >= 0 ? _catIdx : _allChecked.length;
                  dtpSetValue(pid, _addBpMinutes(sv, _bpIdx * 15));
                }
              }
            });
          });
        }
        listEl.dataset.loaded = '1';
      }
    }
  });

  // ── Smart end_at + BP prefill for ee ──────────────────────────────────────
  let _eeEndOverride = false;
  document.getElementById('ee-dep-start')?.addEventListener('change', () => {
    _eeEndOverride = false;
    dtpAutoCalcEnd('ee-dep-start', 'ee-dep-end', 'ee-duration');
    const sv = document.getElementById('ee-dep-start')?.value;
    if (!sv) return;
    let _eeBpIdx = 0;
    document.querySelectorAll('#ee-dep-bp-catalog-list input[type="checkbox"]:checked').forEach(cb => {
      const pid = 'ee-bpcat-' + cb.dataset.bpId + '-pickup';
      if (!document.getElementById(pid)?.value) dtpSetValue(pid, _addBpMinutes(sv, _eeBpIdx * 15));
      _eeBpIdx++;
    });
    document.querySelectorAll('[id^="ee-dep-custom-bp-"]').forEach(r => {
      const pid = 'ee-custom-bp-pickup-' + r.id.replace('ee-dep-custom-bp-', '');
      if (!document.getElementById(pid)?.value) dtpSetValue(pid, _addBpMinutes(sv, _eeBpIdx * 15));
      _eeBpIdx++;
    });
  });
  document.getElementById('ee-dep-end')?.addEventListener('change', () => {
    if (document.getElementById('ee-dep-end')?.dataset.dtpManual === '1') _eeEndOverride = true;
  });
  document.getElementById('ee-duration')?.addEventListener('change', () => {
    if (!_eeEndOverride) dtpAutoCalcEnd('ee-dep-start', 'ee-dep-end', 'ee-duration');
  });

  // ── Section C toggle ──────────────────────────────────────────────────────
  document.getElementById('ee-res-check')?.addEventListener('change', e => {
    const sec   = document.getElementById('ee-res-section');
    const parts = document.getElementById('ee-parts-wrapper');
    if (sec)   sec.style.display   = e.target.checked ? 'flex' : 'none';
    if (parts) parts.style.display = e.target.checked ? 'block' : 'none';
  });

  // ── Participant rows ──────────────────────────────────────────────────────
  let partCount = 0;
  function addPartRow() {
    const i = partCount++;
    const r = document.createElement('div');
    r.className = 'adm-part-row'; r.id = `ee-part-row-${i}`;
    r.innerHTML = `
      <div class="adm-grid-2" style="gap:8px">
        <div class="adm-field" style="margin:0"><label style="font-size:11px">Nome *</label>
          <input id="ee-p-name-${i}" class="adm-input adm-input--sm" placeholder="Nome completo" />
        </div>
        <div class="adm-field" style="margin:0"><label style="font-size:11px">Perfil</label>
          <select id="ee-p-profile-${i}" class="adm-select adm-select--sm">
            <option value="adult">Adulto</option>
            <option value="child">Criança</option>
            <option value="senior">Idoso (60+)</option>
            <option value="pcd">PCD</option>
          </select>
        </div>
        <div class="adm-field" style="margin:0"><label style="font-size:11px">Data de nascimento</label>
          <input id="ee-p-birth-${i}" class="adm-input adm-input--sm" type="date" />
        </div>
        <div class="adm-field" style="margin:0;align-self:flex-end">
          <button type="button" class="adm-btn adm-btn--danger adm-btn--sm" onclick="document.getElementById('ee-part-row-${i}').remove()">Remover</button>
        </div>
      </div>`;
    document.getElementById('ee-parts-list')?.appendChild(r);
  }
  document.getElementById('ee-add-part-btn')?.addEventListener('click', addPartRow);
  addPartRow();

  // ── Delete button (inactive only) ─────────────────────────────────────────
  document.getElementById('ee-delete-btn')?.addEventListener('click', () => {
    openModal(
      'Excluir experiência',
      `<p style="font-size:var(--text-sm);color:var(--adm-text-muted);line-height:1.6">
         Você está prestes a <strong>excluir permanentemente</strong> a experiência:<br><br>
         <strong style="color:var(--adm-text)">${esc(row.title ?? '')}</strong><br><br>
         Esta ação também removerá:<br>
         &bull; Todas as <strong>saídas</strong> vinculadas<br>
         &bull; Todas as <strong>entradas da lista de espera</strong> vinculadas<br><br>
         <span style="color:var(--adm-danger);font-weight:600">Esta ação é irreversível.</span>
       </p>`,
      `<button class="adm-btn adm-btn--secondary" onclick="closeModal()">Cancelar</button>
       <button class="adm-btn adm-btn--danger" id="confirm-delete-exp-btn">Sim, excluir tudo</button>`
    );
    document.getElementById('confirm-delete-exp-btn')?.addEventListener('click', async () => {
      closeModal();
      await db.from('departures').delete().eq('experience_id', id);
      await db.from('waitlist_entries').delete().eq('experience_id', id);
      const { error: delErr } = await db.from('experiences').delete().eq('id', id);
      if (delErr) { toast('Erro ao excluir: ' + delErr.message, 'error'); return; }
      toast('Experiência excluída.', 'success');
      closeDrawer();
      navigate('#experiencias');
    });
  });

  // ── Submit: save experience + optional departure/reservation/participants ──
  document.getElementById('edit-exp-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const saveBtn = document.getElementById('ee-save-btn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Salvando…'; }

    // 1. Update experience
    const _taToArr = v => (v || '').split('\n').map(s => s.trim()).filter(Boolean);
    const expPayload = {
      title:               document.getElementById('ee-title').value.trim(),
      slug:                document.getElementById('ee-slug').value.trim(),
      subtitle:            document.getElementById('ee-subtitle')?.value.trim() || null,
      short_description:   document.getElementById('ee-short-desc')?.value.trim() || null,
      description:         document.getElementById('ee-description')?.value.trim() || null,
      location:            document.getElementById('ee-location')?.value.trim() || null,
      region:              document.getElementById('ee-region')?.value.trim() || null,
      category:            document.getElementById('ee-category')?.value || null,
      difficulty:          document.getElementById('ee-difficulty')?.value || null,
      base_price:          parseFloat(document.getElementById('ee-price')?.value) || 0,
      currency:            document.getElementById('ee-currency')?.value || 'BRL',
      duration_text:       document.getElementById('ee-duration-text')?.value.trim() || null,
      duration_hours:      parseFloat(document.getElementById('ee-duration')?.value) || null,
      max_participants:    parseInt(document.getElementById('ee-maxpax')?.value, 10) || null,
      min_age:             parseInt(document.getElementById('ee-minage')?.value, 10) || null,
      distance_km:         parseFloat(document.getElementById('ee-distance')?.value) || null,
      elevation_gain_m:    parseInt(document.getElementById('ee-elevation')?.value, 10) || null,
      highlights:          _taToArr(document.getElementById('ee-highlights')?.value),
      includes:            _taToArr(document.getElementById('ee-includes')?.value),
      excludes:            _taToArr(document.getElementById('ee-excludes')?.value),
      what_to_bring:       _taToArr(document.getElementById('ee-bring')?.value),
      cancellation_policy: document.getElementById('ee-cancel-policy')?.value.trim() || null,
      cover_image_url:     document.getElementById('ee-cover')?.value.trim() || null,
      gallery:             _taToArr(document.getElementById('ee-gallery')?.value),
      is_active:           document.getElementById('ee-active')?.checked ?? true,
      featured:            document.getElementById('ee-featured')?.checked ?? false,
      is_new:              document.getElementById('ee-is-new')?.checked ?? false,
    };

    if (!expPayload.title || !expPayload.slug) {
      toast('Título e slug são obrigatórios.', 'error');
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Salvar alterações'; }
      return;
    }

    const { error: updErr } = await updateExperience(id, expPayload);
    if (updErr) {
      toast('Não foi possível salvar: ' + updErr.message, 'error');
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Salvar alterações'; }
      return;
    }

    const msgs = ['Experiência atualizada!'];

    // 2. Optional new departure
    if (document.getElementById('ee-dep-check')?.checked) {
      const startVal = document.getElementById('ee-dep-start')?.value;
      if (!startVal) {
        toast('Informe a data/hora de início da saída.', 'error');
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Salvar alterações'; }
        return;
      }
      let eeSortIdx = 0;
      const eeBpSelections = [];
      document.querySelectorAll('#ee-dep-bp-catalog-list input[type="checkbox"]:checked').forEach(cb => {
        const bpId = cb.dataset.bpId;
        const pickupEl = document.getElementById(`ee-bpcat-${bpId}-pickup`);
        const notesEl  = document.getElementById(`ee-bpcat-${bpId}-notes`);
        eeBpSelections.push({
          boardingPointId: bpId,
          pickupAt:  pickupEl?.value ? new Date(pickupEl.value).toISOString() : null,
          notes:     notesEl?.value.trim() || null,
          isActive:  true,
          sortOrder: eeSortIdx++,
        });
      });
      document.querySelectorAll('[id^="ee-dep-custom-bp-"]').forEach(r => {
        const i = r.id.replace('ee-dep-custom-bp-', '');
        const lbl = document.getElementById(`ee-custom-bp-label-${i}`)?.value.trim() || null;
        if (!lbl) return;
        eeBpSelections.push({
          boardingPointId: null,
          customLabel:   lbl,
          customAddress: document.getElementById(`ee-custom-bp-address-${i}`)?.value.trim() || null,
          pickupAt:      document.getElementById(`ee-custom-bp-pickup-${i}`)?.value ? new Date(document.getElementById(`ee-custom-bp-pickup-${i}`).value).toISOString() : null,
          notes:         document.getElementById(`ee-custom-bp-notes-${i}`)?.value.trim() || null,
          isActive:      true,
          sortOrder:     eeSortIdx++,
        });
      });
      const firstEeBpName = eeBpSelections[0]
        ? (eeBpSelections[0].boardingPointId
            ? (document.querySelector(`#ee-dep-bp-catalog-list input[data-bp-id="${eeBpSelections[0].boardingPointId}"]`)?.dataset.bpName ?? null)
            : eeBpSelections[0].customLabel)
        : null;
      const depPayload = {
        experience_id: id,
        start_at:      new Date(startVal).toISOString(),
        end_at:        document.getElementById('ee-dep-end')?.value ? new Date(document.getElementById('ee-dep-end').value).toISOString() : null,
        meeting_point: firstEeBpName,
        capacity:      Math.min(parseInt(document.getElementById('ee-dep-capacity')?.value, 10) || expPayload.max_participants || Infinity, expPayload.max_participants || Infinity) || null,
        price:         parseFloat(document.getElementById('ee-dep-price')?.value) || expPayload.base_price || null,
        status:        document.getElementById('ee-dep-status')?.value || 'scheduled',
        title:         document.getElementById('ee-dep-title')?.value.trim() || null,
      };
      const { data: newDep, error: depErr } = await createDeparture(depPayload);
      if (depErr) toast('Saída não criada: ' + depErr.message, 'error');
      else {
        msgs.push('Saída criada.');
        if (eeBpSelections.length > 0 && newDep?.id) {
          const { error: bpErr } = await createBoardingPoints(newDep.id, eeBpSelections);
          if (bpErr) toast('Pontos de embarque não salvos: ' + bpErr.message, 'error');
          else msgs.push(`${eeBpSelections.length} ponto(s) de embarque criados.`);
        }
      }
    }

    // 3. Optional new reservation
    let newResId = null;
    if (document.getElementById('ee-res-check')?.checked) {
      const resName = document.getElementById('ee-res-name')?.value.trim();
      if (!resName) {
        toast('Nome do responsável é obrigatório para criar reserva.', 'error');
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Salvar alterações'; }
        return;
      }
      const resPayload = {
        experience_id:      id,
        customer_name:      resName,
        customer_email:     document.getElementById('ee-res-email')?.value.trim() || null,
        customer_phone:     document.getElementById('ee-res-phone')?.value.trim() || null,
        payment_method:     document.getElementById('ee-res-payment')?.value || null,
        reservation_status: document.getElementById('ee-res-status')?.value || 'reserved',
        total_amount:       parseFloat(document.getElementById('ee-res-total')?.value) || 0,
        amount_paid:        parseFloat(document.getElementById('ee-res-paid')?.value) || 0,
        notes:              document.getElementById('ee-res-notes')?.value.trim() || null,
      };
      const { data: resData, error: resErr } = await db.from('reservations').insert(resPayload).select('id').single();
      if (resErr) toast('Reserva não criada: ' + resErr.message, 'error');
      else { newResId = resData?.id; msgs.push('Reserva criada.'); }
    }

    // 4. Optional participants
    if (newResId) {
      const rows = document.querySelectorAll('[id^="ee-part-row-"]');
      const parts = Array.from(rows).map(r => {
        const i = r.id.replace('ee-part-row-', '');
        return {
          reservation_id: newResId,
          name:           document.getElementById(`ee-p-name-${i}`)?.value.trim() || null,
          profile_type:   document.getElementById(`ee-p-profile-${i}`)?.value || 'adult',
          birthdate:      document.getElementById(`ee-p-birth-${i}`)?.value || null,
        };
      }).filter(p => p.name);
      if (parts.length) {
        const { error: pErr } = await db.from('participants').insert(parts);
        if (pErr) toast('Participantes não salvos: ' + pErr.message, 'error');
      }
    }

    toast(msgs.join(' '), 'success');
    closeDrawer();
    navigate('#experiencias');
  });
}

async function deactivateExp(id, title) {
  const db = window.anauaDb;
  if (!db) { toast('Supabase não disponível.', 'error'); return; }

  const row = _expCache.find(e => e.id === id);
  const isActive = row ? row.is_active !== false : true;
  const action = isActive ? 'desativar' : 'reativar';
  const newState = !isActive;

  openModal(
    `${isActive ? 'Desativar' : 'Reativar'} experiência`,
    `<p style="font-size:var(--text-sm);color:var(--adm-text-muted)">
       Tem certeza que deseja <strong>${action}</strong> a experiência<br>
       <strong>"${escHtml(title)}"</strong>?
       ${isActive ? '<br><br>Ela ficará invisível no site público.' : ''}
     </p>`,
    `<button class="adm-btn adm-btn--secondary" onclick="closeModal()">Cancelar</button>
     <button class="adm-btn adm-btn--${isActive ? 'danger' : 'primary'}" id="confirm-deactivate-btn">
       ${isActive ? 'Desativar' : 'Reativar'}
     </button>`
  );

  document.getElementById('confirm-deactivate-btn')?.addEventListener('click', async () => {
    closeModal();
    const { error } = await db.from('experiences').update({ is_active: newState }).eq('id', id);
    if (error) {
      toast('Não foi possível executar a ação. ' + error.message, 'error');
      return;
    }
    toast(`Experiência ${newState ? 'reativada' : 'desativada'} com sucesso.`, 'success');
    navigate('#experiencias');
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  MODULE: LISTA DE ESPERA  —  CRM operacional completo
// ─────────────────────────────────────────────────────────────────────────────

let _wlEntries   = [];
let _wlExpMap    = {};
var _wlFltStatus = '';
var _wlFltExp    = '';
var _wlFltSearch = '';
var _wlFltDateFrom = '';

const WL_STATUS = {
  pending:   { label: 'Pendente',       cls: 'wl-s-pending'   },
  contacted: { label: 'Contatado',      cls: 'wl-s-contacted' },
  offered:   { label: 'Oferta enviada', cls: 'wl-s-offered'   },
  converted: { label: 'Convertido',     cls: 'wl-s-converted' },
  discarded: { label: 'Descartado',     cls: 'wl-s-discarded' },
};

const WL_SOURCE_LABEL = {
  site_form: 'Formulário', whatsapp_direct: 'WhatsApp',
  instagram: 'Instagram',  referral: 'Indicação', manual: 'Manual',
};

const WL_CH_ICON = { whatsapp:'📱', email:'✉️', phone:'📞', system:'⚙️', manual:'👤' };
const WL_ACTION_LABEL = {
  contacted: 'Contatado', offered_departure: 'Saída oferecida',
  offered_experience: 'Experiência oferecida', converted: 'Convertido',
  discarded: 'Descartado', note: 'Nota',
};

// ── WA SVG icon ──────────────────────────────────────────────────────────────
const WL_SVG_WA = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.136.562 4.14 1.54 5.874L.057 23.875a.5.5 0 0 0 .612.612l5.998-1.484A11.953 11.953 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.96 0-3.8-.522-5.383-1.432l-.361-.215-3.746.927.945-3.645-.233-.38A9.96 9.96 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>`;
const WL_SVG_EMAIL = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`;
const WL_SVG_CAL  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
const WL_SVG_PIN  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`;
const WL_SVG_CHK  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
const WL_SVG_TRASH= `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
const WL_SVG_DEL  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
const WL_SVG_MSG  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;width:11px;height:11px"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
const WL_SVG_HIST = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;

// ── Main render ───────────────────────────────────────────────────────────────
async function renderListaEspera(root) {
  root.innerHTML = `<div class="wl-page"><div class="wl-skeleton-toolbar"></div><div class="wl-skeleton-list">${Array(4).fill('<div class="wl-skeleton-card"></div>').join('')}</div></div>`;

  const db = window.anauaDb;
  if (!db) { root.innerHTML = `<div class="adm-empty"><p style="color:var(--adm-danger)">Supabase não disponível.</p></div>`; return; }

  let entries, error;
  // Use explicit FK hint (fk_wl_departure) to disambiguate multiple FK refs to departures
  ({ data: entries, error } = await db.from('waitlist_entries')
    .select(`id, created_at, name, email, phone, participants_count, message, status, source, notes,
             experience_id, experiences(id, title),
             departure_id, departures!fk_wl_departure(id, start_at, price, status),
             pickup_point_id, pickup_point_label, pickup_time,
             preferred_departure_id, offered_departure_id, converted_reservation_id,
             contacted_at, offered_at, converted_at, discarded_at, discard_reason,
             last_contact_channel, last_contact_message`)
    .order('created_at', { ascending: false }));

  // Fallback for: migration not applied (42xxx), ambiguous FK (PGRST201), missing column, etc.
  if (error && (
    error.code === 'PGRST201' || error.code === 'PGRST204' ||
    error.code?.startsWith('42') || error.message?.includes('column') ||
    error.message?.includes('relationship') || error.message?.includes('embed')
  )) {
    console.warn('[waitlist] Fallback: usando colunas base. Motivo:', error.code, error.message);
    ({ data: entries, error } = await db.from('waitlist_entries')
      .select('id, created_at, name, email, phone, participants_count, message, status, experience_id, experiences(id, title)')
      .order('created_at', { ascending: false }));
  }

  const { data: exps } = await db.from('experiences').select('id, title').eq('is_active', true).order('title');

  if (error) {
    root.innerHTML = `<div class="adm-empty" style="padding:48px;text-align:center">
      <p style="color:var(--adm-danger)">Erro: ${escHtml(error.message)}</p>
      <p style="font-size:.85rem;color:var(--adm-text-muted);margin-top:8px">Execute a migração <code>20260508_waitlist_funnel.sql</code> no Supabase.</p></div>`;
    return;
  }

  _wlEntries = entries ?? [];
  _wlExpMap  = {};
  (exps ?? []).forEach(e => { _wlExpMap[e.id] = e; });

  const expOpts = (exps ?? []).map(e => `<option value="${e.id}" ${_wlFltExp===e.id?'selected':''}>${escHtml(e.title)}</option>`).join('');

  // Status stats
  const counts = {};
  Object.keys(WL_STATUS).forEach(k => { counts[k] = 0; });
  _wlEntries.forEach(e => { if (counts[e.status] !== undefined) counts[e.status]++; });

  root.innerHTML = `
    <div class="wl-page">
      <div class="wl-toolbar">
        <div class="wl-toolbar__top">
          <h2 class="wl-title">Lista de espera <span class="wl-count">${_wlEntries.length}</span></h2>
          <div class="wl-status-pills">
            <button class="wl-pill ${!_wlFltStatus?'wl-pill--active':''}" onclick="(()=>{_wlFltStatus='';document.getElementById('wl-flt-status').value='';_wlRenderList();})()">Todos <span>${_wlEntries.length}</span></button>
            ${Object.entries(WL_STATUS).map(([k, v]) => `
              <button class="wl-pill wl-pill--${k} ${_wlFltStatus===k?'wl-pill--active':''}" onclick="(()=>{_wlFltStatus='${k}';document.getElementById('wl-flt-status').value='${k}';_wlRenderList();})()">
                ${v.label} <span>${counts[k]}</span>
              </button>`).join('')}
          </div>
        </div>
        <div class="wl-toolbar__filters">
          <div class="wl-search-wrap">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input id="wl-search" type="search" placeholder="Nome, e-mail, telefone…" class="wl-search-input" value="${escHtml(_wlFltSearch)}">
          </div>
          <select id="wl-flt-status" class="wl-filter-sel">
            <option value="">Todos os status</option>
            ${Object.entries(WL_STATUS).map(([k,v]) => `<option value="${k}" ${_wlFltStatus===k?'selected':''}>${v.label}</option>`).join('')}
          </select>
          <select id="wl-flt-exp" class="wl-filter-sel">
            <option value="">Todas as exp.</option>
            ${expOpts}
          </select>
          <input id="wl-flt-date" type="date" class="wl-filter-sel" title="Desde esta data" value="${_wlFltDateFrom}">
        </div>
      </div>
      <div id="wl-list"></div>
    </div>`;

  _wlRenderList();

  document.getElementById('wl-search')?.addEventListener('input', e => { _wlFltSearch = e.target.value.toLowerCase().trim(); _wlRenderList(); });
  document.getElementById('wl-flt-status')?.addEventListener('change', e => { _wlFltStatus = e.target.value; _wlRenderList(); });
  document.getElementById('wl-flt-exp')?.addEventListener('change', e => { _wlFltExp = e.target.value; _wlRenderList(); });
  document.getElementById('wl-flt-date')?.addEventListener('change', e => { _wlFltDateFrom = e.target.value; _wlRenderList(); });
}

// ── List rendering (exposed globally for inline onclick handlers) ─────────────
window._wlRenderList = function _wlRenderList() {
  const list = document.getElementById('wl-list');
  if (!list) return;

  let items = _wlEntries;
  if (_wlFltStatus)   items = items.filter(e => e.status === _wlFltStatus);
  if (_wlFltExp)      items = items.filter(e => e.experience_id === _wlFltExp);
  if (_wlFltDateFrom) items = items.filter(e => e.created_at >= _wlFltDateFrom);
  if (_wlFltSearch)   items = items.filter(e =>
    [e.name, e.email, e.phone, e.message].some(v => v?.toLowerCase().includes(_wlFltSearch)));

  if (items.length === 0) {
    list.innerHTML = `
      <div class="wl-empty">
        <div class="wl-empty__icon">📋</div>
        <p class="wl-empty__title">Nenhum interessado encontrado</p>
        <p class="wl-empty__sub">Ajuste os filtros ou aguarde novos cadastros no formulário do site.</p>
      </div>`;
    return;
  }

  list.innerHTML = items.map(e => {
    const s       = WL_STATUS[e.status] ?? { label: e.status, cls: 'wl-s-pending' };
    const expTit  = e.experiences?.title ?? '—';
    const pax     = e.participants_count ?? 1;
    const phone   = e.phone ?? '';
    const isDone  = e.status === 'converted' || e.status === 'discarded';
    const depDate = e.departures?.start_at ? fmtDate(e.departures.start_at) : null;
    const src     = e.source ? (WL_SOURCE_LABEL[e.source] ?? e.source) : null;

    const statusOpts = Object.entries(WL_STATUS)
      .map(([k,v]) => `<option value="${k}"${e.status===k?' selected':''}>${v.label}</option>`).join('');

    const waDigits = _wlPhoneDigits(phone);
    const waChip = phone
      ? `<a class="wl-chip wl-chip--wa" href="https://wa.me/55${waDigits}" target="_blank" onclick="event.stopPropagation()">${WL_SVG_WA}${escHtml(phone)}</a>`
      : '';
    const emailChip = e.email
      ? `<a class="wl-chip wl-chip--email" href="mailto:${escHtml(e.email)}" onclick="event.stopPropagation()">${WL_SVG_EMAIL}${escHtml(e.email)}</a>`
      : '';

    return `<div class="wl-card ${isDone?'wl-card--done':''}" data-id="${e.id}">

      <div class="wl-card__main">
        <button class="wl-card__name-btn" onclick="wlOpenDetail('${e.id}')">${escHtml(e.name ?? '—')}</button>

        <div class="wl-card__meta" onclick="wlOpenDetail('${e.id}')">
          <span class="wl-chip wl-chip--exp">${escHtml(expTit)}</span>
          ${depDate ? `<span class="wl-chip wl-chip--dep">${WL_SVG_CAL}${depDate}</span>` : ''}
          <span class="wl-chip wl-chip--pax"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>${pax} pax</span>
          ${src ? `<span class="wl-chip wl-chip--src">${escHtml(src)}</span>` : ''}
        </div>

        <span class="wl-card__date">${fmtDateShort(e.created_at)}</span>

        <div class="wl-card__contact" onclick="event.stopPropagation()">
          ${waChip}${emailChip}
        </div>

        <div class="wl-card__actions" onclick="event.stopPropagation()">
          <select class="wl-status-sel ${s.cls}" title="Alterar status" onchange="_wlQuickStatus('${e.id}',this)">${statusOpts}</select>
          ${!isDone ? `<button class="wl-act-btn wl-act-btn--convert" title="Converter em reserva" onclick="wlConvert('${e.id}')">${WL_SVG_CHK}</button>` : ''}
          ${!isDone ? `<button class="wl-act-btn wl-act-btn--discard" title="Descartar" onclick="wlDiscard('${e.id}')">${WL_SVG_TRASH}</button>` : ''}
          <button class="wl-act-btn wl-act-btn--delete" title="Excluir permanentemente" onclick="wlDeleteEntry('${e.id}')">${WL_SVG_DEL}</button>
        </div>
      </div>

      ${e.message ? `<div class="wl-card__msg-row" onclick="wlOpenDetail('${e.id}')">${WL_SVG_MSG}<span class="wl-card__msg-text">${escHtml(e.message.substring(0,200))}${e.message.length>200?'\u2026':''}</span></div>` : ''}

      ${e.status==='converted' ? `<div class="wl-card__done wl-card__done--converted" onclick="wlOpenDetail('${e.id}')">${WL_SVG_CHK} Convertido em reserva${e.converted_at?' · '+fmtDate(e.converted_at):''}</div>` : ''}
      ${e.status==='discarded'&&e.discard_reason ? `<div class="wl-card__done wl-card__done--discarded" onclick="wlOpenDetail('${e.id}')">${WL_SVG_TRASH} ${escHtml(e.discard_reason.substring(0,100))}</div>` : ''}

    </div>`;
  }).join('');
}

// ── Internal helpers ──────────────────────────────────────────────────────────
function _wlGetEntry(id) { return _wlEntries.find(e => e.id === id); }
function _wlPhoneDigits(p) { return (p ?? '').replace(/\D/g, ''); }

function _wlBuildProposal(entry, dep = null) {
  const exp     = entry.experiences?.title ?? 'nossa experiência';
  const nome    = (entry.name ?? '').split(' ')[0] || 'você';
  const dtDep   = dep ? fmtDate(dep.start_at) : (entry.departures?.start_at ? fmtDate(entry.departures.start_at) : 'a definir');
  const prc     = dep?.price ? `R$ ${Number(dep.price).toLocaleString('pt-BR',{minimumFractionDigits:2})}` : '';
  const bp      = entry.pickup_point_label ?? '';
  const bpLine  = bp ? `\n📍 Embarque: ${bp}${entry.pickup_time ? ' às ' + entry.pickup_time : ''}` : '';
  const paxLine = entry.participants_count ? `\n👥 ${entry.participants_count} pessoa(s)` : '';
  return `Olá ${nome}! 👋\n\nTemos a saída de *${exp}* em *${dtDep}*${prc?' por '+prc:''} disponível!\n${paxLine}${bpLine}\n\nVagas são limitadas — gostaria de garantir a sua? 🌿\n\nResponda aqui ou acesse nosso site para reservar.`;
}

function _wlWaMsg(entry) {
  const exp  = entry.experiences?.title ?? 'nossa experiência';
  const nome = (entry.name ?? '').split(' ')[0] || 'você';
  return `Olá ${nome}! 👋 Vi que você demonstrou interesse em *${exp}*.\nTemos saídas disponíveis — vagas limitadas! Posso te ajudar a garantir a sua? 🌿`;
}

function _wlEmailSubject(entry) {
  return `Lista de espera — ${entry.experiences?.title ?? 'experiência'}`;
}

function _wlEmailBody(entry) {
  const exp  = entry.experiences?.title ?? 'nossa experiência';
  const nome = (entry.name ?? '').split(' ')[0] || 'você';
  return `Olá ${nome},\n\nVi que você se inscreveu na lista de espera para "${exp}".\nTemos saídas disponíveis — adoraríamos te ter conosco!\n\nResponda este e-mail ou nos chame no WhatsApp para garantir sua vaga.\n\nAbçs,\nAnauá Ecoturismo`;
}

// Quick status change directly from card dropdown
window._wlQuickStatus = async function(id, sel) {
  const newStatus = sel.value;
  const entry = _wlGetEntry(id);
  if (!entry || entry.status === newStatus) return;
  const s = WL_STATUS[newStatus] ?? { label: newStatus, cls: '' };
  sel.className = `wl-status-sel ${s.cls}`;
  try {
    const patch = { status: newStatus };
    if (newStatus === 'contacted' && !entry.contacted_at) patch.contacted_at = new Date().toISOString();
    if (newStatus === 'offered'   && !entry.offered_at)   patch.offered_at   = new Date().toISOString();
    if (newStatus === 'discarded' && !entry.discarded_at) patch.discarded_at = new Date().toISOString();
    await _wlPatchEntry(id, patch);
    await _wlLogAction(id, newStatus, 'manual', `Status alterado para: ${s.label}`);
    toast(`Status → ${s.label}`, 'success');
  } catch (err) {
    toast('Erro: ' + err.message, 'error');
    sel.value = entry.status;
    sel.className = `wl-status-sel ${WL_STATUS[entry.status]?.cls ?? ''}`;
  }
};

async function _wlPatchEntry(id, patch) {
  const { error } = await window.anauaDb.from('waitlist_entries').update(patch).eq('id', id);
  if (error) throw error;
  const idx = _wlEntries.findIndex(e => e.id === id);
  if (idx !== -1) _wlEntries[idx] = { ..._wlEntries[idx], ...patch };
  _wlRenderList();
}

async function _wlLogAction(entryId, action, channel, message, metadata = {}) {
  const { error } = await window.anauaDb.from('waitlist_entry_logs').insert({ entry_id: entryId, action, channel, message, metadata });
  if (error) console.warn('[wl-log]', error.message);
}

window._wlCopy = function _wlCopy(text) {
  navigator.clipboard?.writeText(text).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
  });
  toast('Copiado!', 'success');
}

// ── Detail Drawer ─────────────────────────────────────────────────────────────
window.wlOpenDetail = async function(id) {
  const entry = _wlGetEntry(id);
  if (!entry) return;

  const s = WL_STATUS[entry.status] ?? { label: entry.status, cls: 'wl-s-pending' };
  const src = entry.source ? (WL_SOURCE_LABEL[entry.source] ?? entry.source) : null;
  const isDone = entry.status === 'converted' || entry.status === 'discarded';

  // Skeleton open
  openDrawer(entry.name ?? 'Detalhe', `<div class="wl-detail-loading"><div class="wl-skeleton-card" style="height:72px;margin-bottom:12px"></div><div class="wl-skeleton-card" style="height:120px;margin-bottom:12px"></div><div class="wl-skeleton-card" style="height:200px"></div></div>`);

  // Load logs in background
  const { data: logs } = await window.anauaDb.from('waitlist_entry_logs')
    .select('id, action, channel, message, created_at')
    .eq('entry_id', id).order('created_at', { ascending: false });

  // ── Build body ──
  const phone   = entry.phone ?? '';
  const pax     = entry.participants_count ?? 1;
  const expTit  = entry.experiences?.title ?? '—';
  const depDate = entry.departures?.start_at ? fmtDate(entry.departures.start_at) : null;
  const depPrc  = entry.departures?.price ? `R$ ${Number(entry.departures.price).toLocaleString('pt-BR',{minimumFractionDigits:2})}` : null;
  const proposal = _wlBuildProposal(entry);

  // Interest section
  let interestHtml = `
    <div class="wl-detail-section">
      <div class="wl-detail-section__title">Interesse original</div>
      <div class="wl-detail-rows">
        <div class="wl-detail-row"><span>Experiência</span><strong>${escHtml(expTit)}</strong></div>
        ${depDate ? `<div class="wl-detail-row"><span>Saída desejada</span><strong>${depDate}</strong></div>` : ''}
        ${depPrc  ? `<div class="wl-detail-row"><span>Preço</span><strong>${depPrc}</strong></div>` : ''}
        <div class="wl-detail-row"><span>Participantes</span><strong>${pax}</strong></div>
        ${entry.pickup_point_label ? `<div class="wl-detail-row"><span>Embarque</span><strong>${escHtml(entry.pickup_point_label)}${entry.pickup_time?' · '+entry.pickup_time:''}</strong></div>` : ''}
        ${src ? `<div class="wl-detail-row"><span>Origem</span><strong>${escHtml(src)}</strong></div>` : ''}
        <div class="wl-detail-row"><span>Cadastrado em</span><strong>${fmtDate(entry.created_at)}</strong></div>
      </div>
    </div>`;

  // Contact section
  let contactHtml = `
    <div class="wl-detail-section">
      <div class="wl-detail-section__title">Dados de contato</div>
      <div class="wl-detail-rows">
        ${phone ? `<div class="wl-detail-row"><span>WhatsApp</span><a href="tel:${escHtml(phone)}" class="wl-contact-link">${escHtml(phone)}</a></div>` : ''}
        ${entry.email ? `<div class="wl-detail-row"><span>E-mail</span><a href="mailto:${escHtml(entry.email)}" class="wl-contact-link">${escHtml(entry.email)}</a></div>` : ''}
        ${entry.last_contact_channel ? `<div class="wl-detail-row"><span>Último contato</span><strong>${WL_CH_ICON[entry.last_contact_channel]??''} ${entry.last_contact_channel}${entry.contacted_at?' · '+fmtDate(entry.contacted_at):''}</strong></div>` : ''}
      </div>
    </div>`;

  // Message / notes
  let msgHtml = '';
  if (entry.message || entry.notes) {
    msgHtml = `<div class="wl-detail-section">
      <div class="wl-detail-section__title">Mensagem / observações</div>
      ${entry.message ? `<div class="wl-detail-msg">"${escHtml(entry.message)}"</div>` : ''}
      ${entry.notes   ? `<div class="wl-detail-notes">${escHtml(entry.notes)}</div>` : ''}
    </div>`;
  }

  // Converted reservation
  let convHtml = '';
  if (entry.converted_reservation_id) {
    convHtml = `<div class="wl-detail-section wl-detail-section--converted">
      <div class="wl-detail-section__title">Reserva vinculada</div>
      <div class="wl-detail-rows">
        <div class="wl-detail-row"><span>ID</span><strong>${entry.converted_reservation_id.substring(0,8).toUpperCase()}</strong></div>
        ${entry.converted_at ? `<div class="wl-detail-row"><span>Convertido em</span><strong>${fmtDate(entry.converted_at)}</strong></div>` : ''}
      </div>
    </div>`;
  }

  if (entry.discard_reason) {
    convHtml += `<div class="wl-detail-section wl-detail-section--discarded">
      <div class="wl-detail-section__title">Motivo do descarte</div>
      <div class="wl-detail-msg">${escHtml(entry.discard_reason)}</div>
    </div>`;
  }

  // Action buttons
  let actionsHtml = `<div class="wl-detail-section">
    <div class="wl-detail-section__title">Ações</div>
    <div class="wl-detail-actions">
      ${phone ? `<button class="wl-detail-action-btn wl-detail-action-btn--wa" onclick="wlWhatsApp('${id}')">${WL_SVG_WA} WhatsApp</button>` : ''}
      ${entry.email ? `<button class="wl-detail-action-btn wl-detail-action-btn--email" onclick="wlEmail('${id}')">${WL_SVG_EMAIL} E-mail</button>` : ''}
      <button class="wl-detail-action-btn wl-detail-action-btn--copy" onclick="_wlCopy(${JSON.stringify(proposal)})">${WL_SVG_CAL} Copiar proposta</button>
      ${!isDone ? `
      <button class="wl-detail-action-btn wl-detail-action-btn--offer" onclick="wlOfferDeparture('${id}')">${WL_SVG_CAL} Oferecer saída</button>
      <button class="wl-detail-action-btn wl-detail-action-btn--offerexp" onclick="wlOfferOtherExp('${id}')">${WL_SVG_PIN} Outra experiência</button>
      <button class="wl-detail-action-btn wl-detail-action-btn--convert" onclick="closeDrawer();wlConvert('${id}')">${WL_SVG_CHK} Converter em reserva</button>
      <button class="wl-detail-action-btn wl-detail-action-btn--discard" onclick="wlDiscard('${id}')">${WL_SVG_TRASH} Descartar</button>` : ''}
      <button class="wl-detail-action-btn wl-detail-action-btn--delete" onclick="closeDrawer();wlDeleteEntry('${id}')">${WL_SVG_DEL} Excluir</button>
    </div>
  </div>`;

  // History section
  const logItems = logs ?? [];
  let histHtml = `<div class="wl-detail-section">
    <div class="wl-detail-section__title">Histórico de contatos</div>`;
  if (logItems.length === 0) {
    histHtml += `<p class="wl-detail-empty-hist">Sem registros de contato ainda.</p>`;
  } else {
    histHtml += `<div class="wl-log-list">`;
    logItems.forEach(l => {
      const icon  = WL_CH_ICON[l.channel] ?? '•';
      const label = WL_ACTION_LABEL[l.action] ?? l.action;
      histHtml += `
        <div class="wl-log-item">
          <div class="wl-log-item__header">
            <span class="wl-log-item__icon">${icon}</span>
            <span class="wl-log-item__label">${escHtml(label)}</span>
            <span class="wl-log-item__date">${fmtDate(l.created_at)}</span>
          </div>
          ${l.message ? `<div class="wl-log-item__msg">${escHtml(l.message.substring(0,200))}${l.message.length>200?'…':''}</div>` : ''}
        </div>`;
    });
    histHtml += `</div>`;
  }
  histHtml += `</div>`;

  // Assemble drawer body
  const bodyHtml = `
    <div class="wl-detail">
      <div class="wl-detail-header">
        <div class="wl-detail-header__name">${escHtml(entry.name ?? '—')}</div>
        <span class="wl-badge ${s.cls}">${s.label}</span>
      </div>
      ${interestHtml}
      ${contactHtml}
      ${msgHtml}
      ${convHtml}
      ${actionsHtml}
      ${histHtml}
    </div>`;

  document.getElementById('adm-drawer-body').innerHTML = bodyHtml;
};

// ── WhatsApp modal ────────────────────────────────────────────────────────────
window.wlWhatsApp = function(id) {
  const e = _wlGetEntry(id);
  if (!e) return;
  const digits = _wlPhoneDigits(e.phone);
  const msg    = _wlWaMsg(e);
  openModal('WhatsApp', `
    <div class="wl-action-modal">
      <p class="wl-action-modal__label">Mensagem para <strong>${escHtml(e.name ?? '')}</strong>:</p>
      <textarea id="wl-wa-msg" class="wl-textarea" rows="5">${escHtml(msg)}</textarea>
      ${!digits ? `<p class="wl-warn">⚠️ Nenhum telefone cadastrado.</p>` : ''}
    </div>`,
    `<button class="adm-btn adm-btn--ghost" onclick="closeModal()">Cancelar</button>
     <button class="adm-btn adm-btn--secondary" id="wl-wa-copy">Copiar msg</button>
     ${digits ? `<button class="adm-btn adm-btn--primary" id="wl-wa-open">Abrir WhatsApp →</button>` : ''}`);

  document.getElementById('wl-wa-copy')?.addEventListener('click', () => {
    _wlCopy(document.getElementById('wl-wa-msg').value);
  });

  document.getElementById('wl-wa-open')?.addEventListener('click', async () => {
    const t = document.getElementById('wl-wa-msg').value;
    window.open(`https://wa.me/55${digits}?text=${encodeURIComponent(t)}`, '_blank');
    closeModal();
    await _wlPatchEntry(id, { status: 'contacted', contacted_at: new Date().toISOString(), last_contact_channel: 'whatsapp', last_contact_message: t });
    await _wlLogAction(id, 'contacted', 'whatsapp', t);
    toast('WhatsApp aberto · status → Contatado', 'success');
  });
};

// ── E-mail modal ──────────────────────────────────────────────────────────────
window.wlEmail = function(id) {
  const e = _wlGetEntry(id);
  if (!e) return;
  const subj = _wlEmailSubject(e);
  const body = _wlEmailBody(e);
  openModal('Enviar e-mail', `
    <div class="wl-action-modal">
      <div class="adm-form-group"><label class="adm-label">Para</label>
        <input class="adm-input" readonly value="${escHtml(e.email ?? '')}"></div>
      <div class="adm-form-group"><label class="adm-label">Assunto</label>
        <input id="wl-em-subj" class="adm-input" value="${escHtml(subj)}"></div>
      <div class="adm-form-group"><label class="adm-label">Mensagem</label>
        <textarea id="wl-em-body" class="wl-textarea" rows="7">${escHtml(body)}</textarea></div>
    </div>`,
    `<button class="adm-btn adm-btn--ghost" onclick="closeModal()">Cancelar</button>
     <button class="adm-btn adm-btn--secondary" id="wl-em-copy">Copiar</button>
     <button class="adm-btn adm-btn--primary" id="wl-em-open">Abrir cliente de e-mail →</button>`);

  document.getElementById('wl-em-copy')?.addEventListener('click', () => {
    _wlCopy(document.getElementById('wl-em-body').value);
  });

  document.getElementById('wl-em-open')?.addEventListener('click', async () => {
    const s = document.getElementById('wl-em-subj').value;
    const b = document.getElementById('wl-em-body').value;
    window.open(`mailto:${e.email}?subject=${encodeURIComponent(s)}&body=${encodeURIComponent(b)}`);
    closeModal();
    await _wlPatchEntry(id, { status: 'contacted', contacted_at: new Date().toISOString(), last_contact_channel: 'email', last_contact_message: b });
    await _wlLogAction(id, 'contacted', 'email', b);
    toast('E-mail aberto · status → Contatado', 'success');
  });
};

// ── Offer departure modal ─────────────────────────────────────────────────────
window.wlOfferDeparture = async function(id) {
  const entry = _wlGetEntry(id);
  if (!entry) return;

  openModal('Oferecer saída', `<div class="wl-action-modal"><p style="color:var(--adm-text-muted);padding:12px 0">Carregando saídas…</p></div>`, '');

  const minDate = new Date(); minDate.setDate(minDate.getDate() - 1);
  const { data: deps = [] } = await window.anauaDb.from('departures')
    .select('id, start_at, price, capacity, status, experience_id, experiences(id,title)')
    .in('status', ['scheduled', 'sold_out'])
    .gte('start_at', minDate.toISOString())
    .order('start_at', { ascending: true }).limit(30);

  const same  = (deps ?? []).filter(d => d.experience_id === entry.experience_id);
  const other = (deps ?? []).filter(d => d.experience_id !== entry.experience_id);

  function depCard(d) {
    const expN  = d.experiences?.title ?? '—';
    const full  = d.status === 'sold_out';
    const dt    = fmtDate(d.start_at);
    const prc   = d.price ? `R$ ${Number(d.price).toLocaleString('pt-BR',{minimumFractionDigits:2})}` : '—';
    const nom   = (entry.name ?? '').split(' ')[0] || 'você';
    const msg   = _wlBuildProposal(entry, d);
    return `
      <div class="wl-dep-card ${full?'wl-dep-card--full':''}">
        <div class="wl-dep-card__info">
          <div class="wl-dep-card__exp">${escHtml(expN)}</div>
          <div class="wl-dep-card__meta">${dt} · ${prc} · ${full?'<span style="color:var(--adm-danger)">Esgotada</span>':d.capacity+' vaga(s)'}</div>
        </div>
        <div class="wl-dep-card__btns">
          <button class="adm-btn adm-btn--ghost adm-btn--sm wl-dep-copy-btn" data-msg="${escHtml(msg)}">Copiar proposta</button>
          ${!full ? `<button class="adm-btn adm-btn--primary adm-btn--sm wl-dep-offer-btn"
            data-id="${d.id}" data-msg="${escHtml(msg)}">Marcar oferecida</button>` : ''}
        </div>
      </div>`;
  }

  document.getElementById('adm-modal-body').innerHTML = `
    <div class="wl-action-modal">
      ${same.length ? `<p class="wl-section-label">Mesma experiência — ${escHtml(entry.experiences?.title??'')}:</p>${same.map(depCard).join('')}` : `<p style="color:var(--adm-text-muted);font-size:.85rem">Sem saídas futuras para esta experiência.</p>`}
      ${other.length ? `<p class="wl-section-label" style="margin-top:16px">Outras experiências:</p>${other.map(depCard).join('')}` : ''}
      ${(deps??[]).length===0 ? '<p style="color:var(--adm-text-muted)">Nenhuma saída ativa encontrada.</p>' : ''}
    </div>`;
  document.getElementById('adm-modal-footer').innerHTML = `<button class="adm-btn adm-btn--ghost" onclick="closeModal()">Fechar</button>`;

  document.querySelectorAll('.wl-dep-copy-btn').forEach(btn => {
    btn.addEventListener('click', () => _wlCopy(btn.dataset.msg));
  });

  document.querySelectorAll('.wl-dep-offer-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const depId = btn.dataset.id;
      const msgText = btn.dataset.msg;
      closeModal();
      await _wlPatchEntry(id, { status: 'offered', offered_departure_id: depId, offered_at: new Date().toISOString(), last_contact_channel: 'manual', last_contact_message: msgText });
      await _wlLogAction(id, 'offered_departure', 'manual', msgText, { departure_id: depId });
      toast('Saída marcada como oferecida', 'success');
    });
  });
};

// ── Offer other experience modal ──────────────────────────────────────────────
window.wlOfferOtherExp = async function(id) {
  const entry = _wlGetEntry(id);
  if (!entry) return;

  openModal('Oferecer outra experiência', `<div class="wl-action-modal"><p style="color:var(--adm-text-muted);padding:12px 0">Carregando…</p></div>`, '');

  const { data: exps = [] } = await window.anauaDb.from('experiences')
    .select('id, title, short_description').eq('is_active', true).order('title');

  const list = (exps ?? []).filter(ex => ex.id !== entry.experience_id);

  document.getElementById('adm-modal-body').innerHTML = `
    <div class="wl-action-modal">
      ${list.length === 0 ? '<p style="color:var(--adm-text-muted)">Sem outras experiências ativas.</p>' : ''}
      ${list.map(ex => {
        const nom = (entry.name ?? '').split(' ')[0] || 'você';
        const msg = `Olá ${nom}! Que tal conhecer *${ex.title}*? ${ex.short_description ?? 'Uma experiência incrível com a Anauá Ecoturismo!'} Posso te contar mais? 🌿`;
        return `
          <div class="wl-dep-card">
            <div class="wl-dep-card__info">
              <div class="wl-dep-card__exp">${escHtml(ex.title)}</div>
              ${ex.short_description ? `<div class="wl-dep-card__meta">${escHtml(ex.short_description.substring(0,80))}</div>` : ''}
            </div>
            <div class="wl-dep-card__btns">
              <button class="adm-btn adm-btn--ghost adm-btn--sm wl-exp-copy-btn" data-msg="${escHtml(msg)}">Copiar msg</button>
              <button class="adm-btn adm-btn--primary adm-btn--sm wl-exp-offer-btn" data-exp="${ex.id}" data-msg="${escHtml(msg)}">Marcar oferecida</button>
            </div>
          </div>`;
      }).join('')}
    </div>`;
  document.getElementById('adm-modal-footer').innerHTML = `<button class="adm-btn adm-btn--ghost" onclick="closeModal()">Fechar</button>`;

  document.querySelectorAll('.wl-exp-copy-btn').forEach(btn => {
    btn.addEventListener('click', () => _wlCopy(btn.dataset.msg));
  });

  document.querySelectorAll('.wl-exp-offer-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const expId   = btn.dataset.exp;
      const msgText = btn.dataset.msg;
      closeModal();
      await _wlPatchEntry(id, { status: 'offered', offered_at: new Date().toISOString(), last_contact_channel: 'manual', last_contact_message: msgText });
      await _wlLogAction(id, 'offered_experience', 'manual', msgText, { experience_id: expId });
      toast('Oferta registrada', 'success');
    });
  });
};

// ── Convert to reservation modal ──────────────────────────────────────────────
window.wlConvert = async function(id) {
  const entry = _wlGetEntry(id);
  if (!entry) return;

  // Abre modal largo e mostra skeleton
  const modalEl = document.getElementById('adm-modal');
  modalEl?.classList.add('adm-modal--convert');
  const origClose = window._wlConvertCleanup;
  window._wlConvertCleanup = () => modalEl?.classList.remove('adm-modal--convert');

  const STATUS_BADGE = { pending:'Pendente', contacted:'Contatado', offered:'Oferta enviada', converted:'Convertido', discarded:'Descartado' };
  const statusBadgeHtml = (s) => `<span class="adm-badge adm-badge--${s === 'pending' ? 'warning' : s === 'converted' ? 'success' : 'info'}">${STATUS_BADGE[s] ?? s}</span>`;

  openModal('Converter em reserva', `<div class="wlc-skeleton">Carregando saídas disponíveis…</div>`, '');

  const minDate = new Date(); minDate.setDate(minDate.getDate() - 1);
  const { data: deps = [] } = await window.anauaDb.from('departures')
    .select('id, start_at, price, capacity, status, experience_id, experiences(id,title)')
    .in('status', ['scheduled', 'sold_out'])
    .gte('start_at', minDate.toISOString())
    .order('start_at', { ascending: true }).limit(40);

  if (!deps || deps.length === 0) {
    document.getElementById('adm-modal-body').innerHTML =
      `<div class="wlc-empty"><span>Nenhuma saída disponível para conversão no momento.</span></div>`;
    document.getElementById('adm-modal-footer').innerHTML =
      `<button class="adm-btn adm-btn--ghost" onclick="closeModal()">Fechar</button>`;
    return;
  }

  // ── Contagem de ocupação por saída ────────────────────────────────────────
  const depIds = deps.map(d => d.id);
  const { data: occRows = [] } = await window.anauaDb
    .from('reservations')
    .select('departure_id, participants(id)')
    .in('departure_id', depIds)
    .not('reservation_status', 'in', '(cancelled,refunded,discarded)');

  const occMap = {};
  (occRows ?? []).forEach(r => {
    occMap[r.departure_id] = (occMap[r.departure_id] ?? 0) + (r.participants?.length ?? 0);
  });

  const same  = deps.filter(d => d.experience_id === entry.experience_id);
  const other = deps.filter(d => d.experience_id !== entry.experience_id);

  function depOptHtml(d) {
    const dt   = fmtDate(d.start_at);
    const exp  = d.experiences?.title ?? '—';
    const { capacity, occupied, available, isSoldOut } = getDepartureAvailability(d, occMap);
    const prc  = d.price != null ? ` · R$ ${Number(d.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '';
    const soldLbl = isSoldOut ? ' · ⚠ Esgotada' : ` · ${available} disp.`;
    return `<option value="${d.id}"
      data-price="${d.price ?? 0}"
      data-exp="${d.experience_id}"
      data-avail="${available}"
      data-occupied="${occupied}"
      data-capacity="${capacity}"
      data-sold="${isSoldOut ? '1' : '0'}"
    >${escHtml(exp)} — ${dt}${prc}${soldLbl}</option>`;
  }

  const paxCount = entry.participants_count ?? 1;

  function buildPaxFields(count, name = '', email = '', phone = '') {
    let html = '';
    for (let i = 0; i < count; i++) {
      const isFirst = i === 0;
      html += `<div class="wlc-pax-row" data-idx="${i}">
        <span class="wlc-pax-idx">${i + 1}</span>
        <div class="wlc-pax-fields">
          <input class="adm-input wlc-pax-name" placeholder="Nome completo${isFirst ? ' (responsável)' : ''}"
            value="${escHtml(isFirst ? name : '')}">
          <input class="adm-input wlc-pax-doc" placeholder="CPF / documento" style="max-width:160px">
        </div>
        ${!isFirst ? `<button type="button" class="wlc-pax-remove adm-btn adm-btn--ghost adm-btn--sm" title="Remover">✕</button>` : '<span style="width:28px"></span>'}
      </div>`;
    }
    return html;
  }

  // Prefers the entry's own desired departure date as display
  const prefDate = entry.preferred_departure_id
    ? deps.find(d => d.id === entry.preferred_departure_id)
    : null;

  document.getElementById('adm-modal-body').innerHTML = `
    <div class="wlc-form">

      <!-- Interesse original -->
      <div class="adm-section">
        <div class="adm-section__title">Interesse original</div>
        <div class="wlc-origin-card">
          <dl class="wlc-origin-dl">
            <dt>Experiência</dt>
            <dd>${escHtml(entry.experiences?.title ?? entry.experience_id ?? '—')}</dd>
            <dt>Saída desejada</dt>
            <dd>${prefDate ? fmtDate(prefDate.start_at) : '—'}</dd>
            <dt>Participantes</dt>
            <dd>${paxCount} pax</dd>
            ${entry.message ? `
            <dt>Mensagem</dt>
            <dd class="wlc-origin-msg">${escHtml(entry.message)}</dd>` : ''}
          </dl>
        </div>
      </div>

      <!-- Nova reserva -->
      <div class="adm-section">
        <div class="adm-section__title">Nova reserva</div>
        <div class="adm-field">
          <label for="wlc-dep">Saída *</label>
          <select id="wlc-dep" class="adm-input">
            <option value="">— Selecione uma saída —</option>
            ${same.length  ? `<optgroup label="Mesma experiência">${same.map(depOptHtml).join('')}</optgroup>` : ''}
            ${other.length ? `<optgroup label="Outras experiências">${other.map(depOptHtml).join('')}</optgroup>` : ''}
          </select>
          <div id="wlc-dep-info" class="wlc-dep-info" style="display:none"></div>
        </div>
        <div id="wlc-bp-wrap" class="adm-field" style="display:none; margin-top:10px">
          <label for="wlc-bp">Ponto de embarque</label>
          <select id="wlc-bp" class="adm-input">
            <option value="">— Selecione —</option>
          </select>
        </div>
      </div>

      <!-- Responsável -->
      <div class="adm-section">
        <div class="adm-section__title">Responsável pela reserva</div>
        <div class="adm-grid-3">
          <div class="adm-field">
            <label for="wlc-name">Nome completo *</label>
            <input id="wlc-name" class="adm-input" placeholder="Nome completo" value="${escHtml(entry.name ?? '')}">
          </div>
          <div class="adm-field">
            <label for="wlc-email">E-mail</label>
            <input id="wlc-email" class="adm-input" type="email" placeholder="email@ex.com" value="${escHtml(entry.email ?? '')}">
          </div>
          <div class="adm-field">
            <label for="wlc-phone">WhatsApp</label>
            <input id="wlc-phone" class="adm-input" type="tel" placeholder="(00) 00000-0000" value="${escHtml(entry.phone ?? '')}">
          </div>
        </div>
      </div>

      <!-- Participantes -->
      <div class="adm-section">
        <div class="adm-section__title">Participantes</div>
        <div class="wlc-pax-controls">
          <button type="button" id="wlc-rem-pax" class="adm-btn adm-btn--ghost adm-btn--sm">− Remover</button>
          <span id="wlc-pax-count" class="wlc-pax-badge">${paxCount}</span>
          <button type="button" id="wlc-add-pax" class="adm-btn adm-btn--ghost adm-btn--sm">+ Adicionar</button>
        </div>
        <div id="wlc-pax" class="wlc-pax-list">${buildPaxFields(paxCount, entry.name ?? '')}</div>
        <div id="wlc-cap-warn" class="wlc-cap-warn" style="display:none"></div>
      </div>

      <!-- Pagamento -->
      <div class="adm-section">
        <div class="adm-section__title">Pagamento</div>
        <div class="wlc-pay-grid">
          <div class="adm-field">
            <label for="wlc-method">Forma de pagamento</label>
            <select id="wlc-method" class="adm-input">
              <option value="pix">PIX</option>
              <option value="credit_card">Cartão de crédito</option>
              <option value="bank_transfer">Transferência bancária</option>
              <option value="cash">Dinheiro</option>
              <option value="signal_balance">Sinal + saldo</option>
            </select>
          </div>
          <div class="adm-field">
            <label for="wlc-total">Valor total (R$)</label>
            <input id="wlc-total" class="adm-input" type="number" min="0" step="0.01" placeholder="0,00">
          </div>
          <div class="adm-field">
            <label for="wlc-paid">Valor pago (R$)</label>
            <input id="wlc-paid" class="adm-input" type="number" min="0" step="0.01" value="0">
          </div>
        </div>
        <div id="wlc-pay-warn" class="wlc-cap-warn" style="display:none"></div>
        <div id="wlc-pending-row" class="wlc-pending-row" style="display:none">
          <span>Saldo pendente após esta reserva:</span>
          <strong id="wlc-pending-val">R$ 0,00</strong>
        </div>
      </div>

      <!-- Observações -->
      <div class="adm-section">
        <div class="adm-section__title">Observações</div>
        <div class="adm-field">
          <textarea id="wlc-notes" class="adm-input wlc-notes" rows="2"
            placeholder="Restrições alimentares, pedidos especiais…">${escHtml(entry.message ?? '')}</textarea>
        </div>
      </div>

    </div>`;

  document.getElementById('adm-modal-footer').innerHTML = `
    <button class="adm-btn adm-btn--ghost" onclick="closeModal()">Cancelar</button>
    <button id="wlc-submit" class="adm-btn adm-btn--primary">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
      Converter em reserva
    </button>`;

  // ── Helpers de UI ─────────────────────────────────────────────────────────

  function getPaxRows()    { return document.querySelectorAll('#wlc-pax .wlc-pax-row'); }
  function getPaxCount()   { return getPaxRows().length; }
  function updatePaxBadge() {
    const badge = document.getElementById('wlc-pax-count');
    if (badge) badge.textContent = getPaxCount();
  }
  function syncNameToFirst() {
    const nameInp = document.getElementById('wlc-name');
    const firstPax = document.querySelector('#wlc-pax .wlc-pax-row:first-child .wlc-pax-name');
    if (nameInp && firstPax && !firstPax._manual) firstPax.value = nameInp.value;
  }
  function checkCapAndPay() {
    const depSel   = document.getElementById('wlc-dep');
    const opt      = depSel?.options[depSel.selectedIndex];
    const avail    = opt ? parseInt(opt.dataset.avail ?? '999') : 999;
    const sold     = opt?.dataset.sold === '1';
    const pax      = getPaxCount();
    const capWarn  = document.getElementById('wlc-cap-warn');
    const submitBtn = document.getElementById('wlc-submit');

    if (capWarn) {
      if (sold) {
        capWarn.style.display = 'flex';
        capWarn.className = 'wlc-cap-warn wlc-cap-warn--error';
        capWarn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Saída esgotada — não é possível adicionar reservas.`;
        if (submitBtn) submitBtn.disabled = true;
      } else if (pax > avail) {
        capWarn.style.display = 'flex';
        capWarn.className = 'wlc-cap-warn wlc-cap-warn--error';
        capWarn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Capacidade insuficiente: ${avail} vaga${avail !== 1 ? 's' : ''} disponível, ${pax} solicitada${pax !== 1 ? 's' : ''}.`;
        if (submitBtn) submitBtn.disabled = true;
      } else if (depSel?.value && pax > 0) {
        capWarn.style.display = 'flex';
        capWarn.className = 'wlc-cap-warn wlc-cap-warn--ok';
        capWarn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> ${avail} vaga${avail !== 1 ? 's' : ''} disponível — ${pax} participante${pax !== 1 ? 's' : ''} selecionado${pax !== 1 ? 's' : ''}.`;
        if (submitBtn) submitBtn.disabled = false;
      } else {
        capWarn.style.display = 'none';
        if (submitBtn) submitBtn.disabled = false;
      }
    }

    // Paid <= total + pending display
    const total = parseFloat(document.getElementById('wlc-total')?.value || '0');
    const paid  = parseFloat(document.getElementById('wlc-paid')?.value  || '0');
    const payWarn    = document.getElementById('wlc-pay-warn');
    const pendingRow = document.getElementById('wlc-pending-row');
    const pendingVal = document.getElementById('wlc-pending-val');
    if (payWarn) {
      if (paid > total && total > 0) {
        payWarn.style.display = 'flex';
        payWarn.className = 'wlc-cap-warn wlc-cap-warn--error';
        payWarn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Valor pago não pode exceder o total.`;
        if (submitBtn) submitBtn.disabled = true;
      } else {
        payWarn.style.display = 'none';
      }
    }
    // Pendente
    if (pendingRow && pendingVal) {
      const pending = Math.max(0, total - paid);
      if (total > 0) {
        pendingRow.style.display = 'flex';
        pendingVal.textContent = `R$ ${pending.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        pendingVal.style.color = pending > 0 ? 'var(--adm-warning, #d97706)' : 'var(--adm-success)';
      } else {
        pendingRow.style.display = 'none';
      }
    }
  }

  // ── Seleção de saída ──────────────────────────────────────────────────────
  document.getElementById('wlc-dep').addEventListener('change', async function() {
    const depId  = this.value;
    const bpWrap = document.getElementById('wlc-bp-wrap');
    const bpSel  = document.getElementById('wlc-bp');
    const depInfo = document.getElementById('wlc-dep-info');

    if (!depId) {
      bpWrap.style.display = 'none';
      depInfo.style.display = 'none';
      checkCapAndPay();
      return;
    }

    const opt   = this.options[this.selectedIndex];
    const price = parseFloat(opt.dataset.price || '0');
    const avail = parseInt(opt.dataset.avail ?? '0');
    const sold  = opt.dataset.sold === '1';

    const occupied = parseInt(opt.dataset.occupied ?? '0');
    const capacity  = parseInt(opt.dataset.capacity ?? '0');

    // Mostra grid de disponibilidade
    depInfo.style.display = 'block';
    depInfo.innerHTML = `
      <div class="wlc-avail-grid">
        <div class="wlc-avail-cell">
          <span class="wlc-avail-label">Capacidade</span>
          <span class="wlc-avail-val">${capacity}</span>
        </div>
        <div class="wlc-avail-cell">
          <span class="wlc-avail-label">Ocupadas</span>
          <span class="wlc-avail-val">${occupied}</span>
        </div>
        <div class="wlc-avail-cell wlc-avail-cell--${avail === 0 ? 'danger' : avail <= 2 ? 'warn' : 'ok'}">
          <span class="wlc-avail-label">Disponíveis</span>
          <span class="wlc-avail-val">${sold ? '0' : avail}</span>
        </div>
        <div class="wlc-avail-cell wlc-avail-cell--req">
          <span class="wlc-avail-label">Solicitadas</span>
          <span class="wlc-avail-val">${paxCount}</span>
        </div>
      </div>
      ${price > 0 ? `<div class="wlc-avail-price">R$ ${Number(price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / pax</div>` : ''}
      ${(sold || avail < paxCount) ? `
      <div class="wlc-extend-bar" id="wlc-extend-bar">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span>${sold ? 'Saída esgotada' : `Apenas ${avail} vaga${avail !== 1 ? 's' : ''} disponível`}.</span>
        <button type="button" id="wlc-extend-btn" class="adm-btn adm-btn--ghost adm-btn--sm wlc-extend-trigger">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Estender saída
        </button>
      </div>
      <div class="wlc-extend-panel" id="wlc-extend-panel" style="display:none">
        <div class="wlc-extend-panel__row">
          <label class="wlc-extend-panel__lbl">Adicionar vagas:</label>
          <input id="wlc-extend-extra" type="number" min="1" max="999" value="${Math.max(1, paxCount - avail)}"
            class="adm-input wlc-extend-panel__input" />
          <span class="wlc-extend-panel__preview">
            → nova capacidade: <strong id="wlc-extend-newcap">${capacity + Math.max(1, paxCount - avail)}</strong> vagas
          </span>
        </div>
        <div class="wlc-extend-panel__actions">
          <button type="button" id="wlc-extend-cancel" class="adm-btn adm-btn--ghost adm-btn--sm">Cancelar</button>
          <button type="button" id="wlc-extend-confirm" class="adm-btn adm-btn--primary adm-btn--sm">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
            Confirmar extensão
          </button>
        </div>
      </div>` : ''}`;

    // Wire up inline extend panel
    const extendBtn     = document.getElementById('wlc-extend-btn');
    const extendPanel   = document.getElementById('wlc-extend-panel');
    const extendBar     = document.getElementById('wlc-extend-bar');
    const extendExtra   = document.getElementById('wlc-extend-extra');
    const extendNewCap  = document.getElementById('wlc-extend-newcap');
    const extendCancel  = document.getElementById('wlc-extend-cancel');
    const extendConfirm = document.getElementById('wlc-extend-confirm');

    if (extendBtn && extendPanel) {
      extendBtn.addEventListener('click', () => {
        extendBar.style.display  = 'none';
        extendPanel.style.display = 'block';
        extendExtra?.focus();
      });

      extendExtra?.addEventListener('input', () => {
        const extra = Math.max(1, parseInt(extendExtra.value) || 1);
        if (extendNewCap) extendNewCap.textContent = capacity + extra;
      });

      extendCancel?.addEventListener('click', () => {
        extendPanel.style.display = 'none';
        extendBar.style.display   = 'flex';
      });

      extendConfirm?.addEventListener('click', async () => {
        const extra  = Math.max(1, parseInt(extendExtra?.value) || 1);
        const newCap = capacity + extra;
        extendConfirm.disabled = true;
        extendConfirm.textContent = 'Salvando…';

        const { error } = await window.anauaDb
          .from('departures')
          .update({ capacity: newCap, status: 'scheduled', updated_at: new Date().toISOString() })
          .eq('id', depId);

        if (error) {
          toast('Erro ao estender: ' + error.message, 'error');
          extendConfirm.disabled = false;
          extendConfirm.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Confirmar extensão';
          return;
        }

        // Patch the <option> data attributes so re-firing change reflects new state
        const newAvail = newCap - occupied;
        opt.dataset.capacity = newCap;
        opt.dataset.avail    = newAvail;
        opt.dataset.sold     = '0';
        // Update the option label
        const [labelBase] = opt.textContent.split(' · ');
        const newPrice = price > 0 ? ` · R$ ${Number(price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '';
        opt.textContent = `${labelBase}${newPrice} · ${newAvail} disp.`;

        // Also update occMap entry so getDepartureAvailability stays consistent
        occMap[depId] = occupied;

        toast(`Saída estendida: +${extra} vaga${extra !== 1 ? 's' : ''} (total ${newCap})`, 'success');

        // Re-fire change event to refresh the whole dep-info panel
        const depSel2 = document.getElementById('wlc-dep');
        depSel2?.dispatchEvent(new Event('change'));
      });
    }

    // Auto-preenche total
    if (price > 0) {
      document.getElementById('wlc-total').value = (price * getPaxCount()).toFixed(2);
    }

    // Carrega pontos de embarque
    bpSel.innerHTML = '<option value="">Carregando…</option>';
    bpWrap.style.display = 'block';
    const { data: bps } = await window.anauaDb
      .from('departure_boarding_points')
      .select('id, pickup_at, custom_label, custom_address, boarding_points(name, address)')
      .eq('departure_id', depId)
      .order('pickup_at', { ascending: true });

    if (!bps || bps.length === 0) {
      bpWrap.style.display = 'none';
    } else {
      bpSel.innerHTML = `<option value="">— Selecione —</option>` +
        bps.map(b => {
          const nm   = b.custom_label || b.boarding_points?.name || '—';
          const time = b.pickup_at ? b.pickup_at.substring(0, 5) : '';
          const addr = b.custom_address || b.boarding_points?.address || '';
          return `<option value="${b.id}">${escHtml(nm)}${time ? ' · ' + time : ''}${addr ? ' — ' + escHtml(addr.substring(0, 40)) : ''}</option>`;
        }).join('');
    }

    checkCapAndPay();
  });

  // ── Nome responsável → 1º participante ──────────────────────────────────
  document.getElementById('wlc-name').addEventListener('input', syncNameToFirst);

  // ── Adicionar participante ────────────────────────────────────────────────
  document.getElementById('wlc-add-pax').addEventListener('click', () => {
    const depSel = document.getElementById('wlc-dep');
    const opt    = depSel?.options[depSel.selectedIndex];
    const avail  = opt ? parseInt(opt.dataset.avail ?? '999') : 999;
    const cur    = getPaxCount();
    if (cur >= avail && avail < 999) {
      toast(`Capacidade máxima atingida (${avail} vagas).`, 'error');
      return;
    }
    const wrap = document.getElementById('wlc-pax');
    const n    = cur + 1;
    const row  = document.createElement('div');
    row.className = 'wlc-pax-row';
    row.dataset.idx = n - 1;
    row.innerHTML = `
      <span class="wlc-pax-idx">${n}</span>
      <div class="wlc-pax-fields">
        <input class="adm-input wlc-pax-name" placeholder="Nome completo">
        <input class="adm-input wlc-pax-doc" placeholder="CPF / documento" style="max-width:160px">
      </div>
      <button type="button" class="wlc-pax-remove adm-btn adm-btn--ghost adm-btn--sm" title="Remover">✕</button>`;
    row.querySelector('.wlc-pax-remove').addEventListener('click', () => {
      row.remove();
      renumberPax();
      updatePaxBadge();
      checkCapAndPay();
    });
    wrap.appendChild(row);
    updatePaxBadge();
    checkCapAndPay();
    // Auto-update total
    const price = parseFloat(opt?.dataset.price ?? '0');
    if (price > 0) document.getElementById('wlc-total').value = (price * getPaxCount()).toFixed(2);
  });

  // ── Remover último participante ──────────────────────────────────────────
  document.getElementById('wlc-rem-pax').addEventListener('click', () => {
    const rows = Array.from(getPaxRows());
    if (rows.length <= 1) { toast('Deve haver pelo menos 1 participante.', 'error'); return; }
    rows[rows.length - 1].remove();
    updatePaxBadge();
    checkCapAndPay();
    const depSel = document.getElementById('wlc-dep');
    const price  = parseFloat(depSel?.options[depSel.selectedIndex]?.dataset.price ?? '0');
    if (price > 0) document.getElementById('wlc-total').value = (price * getPaxCount()).toFixed(2);
  });

  function renumberPax() {
    getPaxRows().forEach((row, i) => {
      const idx = row.querySelector('.wlc-pax-idx');
      if (idx) idx.textContent = i + 1;
      row.dataset.idx = i;
      const namePh = row.querySelector('.wlc-pax-name');
      if (namePh) namePh.placeholder = `Nome completo${i === 0 ? ' (responsável)' : ''}`;
    });
  }

  // Delegação para botões de remoção existentes
  document.getElementById('wlc-pax').addEventListener('click', e => {
    const btn = e.target.closest('.wlc-pax-remove');
    if (!btn) return;
    const row = btn.closest('.wlc-pax-row');
    if (document.querySelectorAll('#wlc-pax .wlc-pax-row').length <= 1) {
      toast('Deve haver pelo menos 1 participante.', 'error'); return;
    }
    row?.remove();
    renumberPax();
    updatePaxBadge();
    checkCapAndPay();
  });

  // ── Pagamento: validação em tempo real ───────────────────────────────────
  ['wlc-total', 'wlc-paid'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', checkCapAndPay);
  });

  // Marca edição manual no 1º participante para não sobrescrever
  document.getElementById('wlc-pax').addEventListener('input', e => {
    if (e.target.classList.contains('wlc-pax-name') && e.target.closest('[data-idx="0"]')) {
      e.target._manual = true;
    }
  });

  // ── Submit ────────────────────────────────────────────────────────────────
  document.getElementById('wlc-submit').addEventListener('click', async function() {
    const depId  = document.getElementById('wlc-dep').value;
    const bpId   = document.getElementById('wlc-bp')?.value || null;
    const name   = document.getElementById('wlc-name').value.trim();
    const email  = document.getElementById('wlc-email').value.trim();
    const phone  = document.getElementById('wlc-phone').value.trim();
    const method = document.getElementById('wlc-method').value;
    const total  = parseFloat(document.getElementById('wlc-total').value  || '0');
    const paid   = parseFloat(document.getElementById('wlc-paid').value   || '0');
    const notes  = document.getElementById('wlc-notes').value.trim();

    if (!depId)  { toast('Selecione uma saída.', 'error'); return; }
    if (!name)   { toast('Informe o nome do responsável.', 'error'); return; }
    if (paid > total && total > 0) { toast('Valor pago não pode exceder o total.', 'error'); return; }

    const depSel = document.getElementById('wlc-dep');
    const expId  = depSel.options[depSel.selectedIndex]?.dataset.exp ?? null;

    const participants = Array.from(document.querySelectorAll('#wlc-pax .wlc-pax-name')).map((inp, i) => ({
      full_name:       inp.value.trim() || (i === 0 ? name : `Participante ${i + 1}`),
      document_number: document.querySelectorAll('#wlc-pax .wlc-pax-doc')[i]?.value.trim() || null,
      profile_type:    'adult',
    }));

    this.disabled = true;
    this.innerHTML = `<span class="adm-spinner" style="width:14px;height:14px;border-width:2px"></span> Convertendo…`;

    const { data: rpcData, error: rpcErr } = await window.anauaDb.rpc('reserve_departure', {
      p_departure_id:      depId,
      p_pickup_point_id:   bpId,
      p_responsible_name:  name,
      p_responsible_email: email,
      p_responsible_phone: phone,
      p_payment_method:    method,
      p_total_amount:      total,
      p_amount_paid:       paid,
      p_notes:             notes,
      p_participants:      participants,
      p_waitlist_entry_id: id,
    });

    if (rpcErr || !rpcData?.ok) {
      toast((rpcErr?.message ?? rpcData?.error) || 'Conversão falhou.', 'error');
      this.disabled = false;
      this.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Converter em reserva`;
      return;
    }

    // Atualiza cache local da lista de espera
    await _wlPatchEntry(id, {
      status: 'converted',
      converted_reservation_id: rpcData.reservation_id,
      converted_at: new Date().toISOString(),
    });

    closeModal();
    toast(`✓ Reserva ${rpcData.code ?? ''} criada com sucesso!`, 'success');
    window._wlConvertCleanup?.();
  });
};



// ── Discard modal ─────────────────────────────────────────────────────────────
window.wlDiscard = function(id) {
  const entry = _wlGetEntry(id);
  if (!entry) return;

  openModal('Descartar contato', `
    <div class="wl-action-modal">
      <p style="margin-bottom:12px">Descartar <strong>${escHtml(entry.name ?? 'este contato')}</strong>? Informe o motivo:</p>
      <select id="wl-disc-preset" class="adm-input">
        <option value="">— Selecione um motivo —</option>
        <option>Não respondeu ao contato</option>
        <option>Desistiu da viagem</option>
        <option>Encontrou outra operadora</option>
        <option>Fora do perfil</option>
        <option>Dados inválidos / duplicado</option>
        <option value="outro">Outro (descreva abaixo)</option>
      </select>
      <textarea id="wl-disc-reason" class="wl-textarea" style="margin-top:8px" rows="3" placeholder="Complemento opcional…"></textarea>
    </div>`,
    `<button class="adm-btn adm-btn--ghost" onclick="closeModal()">Cancelar</button>
     <button class="adm-btn adm-btn--danger" id="wl-disc-confirm">Descartar</button>`);

  document.getElementById('wl-disc-confirm').addEventListener('click', async function() {
    const preset = document.getElementById('wl-disc-preset').value;
    const extra  = document.getElementById('wl-disc-reason').value.trim();
    if (!preset) { toast('Selecione um motivo.', 'error'); return; }
    const reason = [preset !== 'outro' ? preset : '', extra].filter(Boolean).join(' — ');
    this.disabled = true; this.textContent = 'Descartando…';
    try {
      await _wlPatchEntry(id, { status: 'discarded', discarded_at: new Date().toISOString(), discard_reason: reason });
      await _wlLogAction(id, 'discarded', 'system', reason);
      closeModal();
      toast('Contato descartado.', 'info');
    } catch (err) {
      this.disabled = false; this.textContent = 'Descartar';
      toast('Erro: ' + err.message, 'error');
    }
  });
};

window.wlDeleteEntry = async function(id) {
  const entry = _wlGetEntry(id);
  const nome = entry?.name ?? 'este contato';
  if (!confirm(`Excluir permanentemente "${nome}" da lista de espera?\nEsta ação não pode ser desfeita.`)) return;
  try {
    const db = window.anauaDb;
    const { error } = await db.from('waitlist_entries').delete().eq('id', id);
    if (error) throw error;
    _wlEntries = _wlEntries.filter(e => e.id !== id);
    window._wlRenderList();
    toast('Entrada excluída.', 'info');
  } catch (err) {
    toast('Erro ao excluir: ' + err.message, 'error');
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  MODULE: PONTOS DE EMBARQUE (catálogo reutilizável)
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
//  DUPLICATION HELPERS
// ─────────────────────────────────────────────────────────────────────────────

window.duplicateExperience = async function duplicateExperience(id) {
  const db = window.anauaDb;
  const { data: src, error: fetchErr } = await db.from('experiences').select('*').eq('id', id).single();
  if (fetchErr || !src) { toast('Experiência não encontrada.', 'error'); return; }
  const { id: _id, created_at, updated_at, ...fields } = src;
  const copy = {
    ...fields,
    title:     'Cópia de ' + src.title,
    slug:      src.slug + '-copia-' + Date.now(),
    is_active: false,
  };
  const { error } = await db.from('experiences').insert(copy);
  if (error) { toast('Erro ao duplicar experiência: ' + error.message, 'error'); return; }
  toast('Experiência duplicada como rascunho. Edite antes de ativar.', 'success');
  navigate('#experiencias');
};

window.duplicateBoardingPoint = async function duplicateBoardingPoint(id) {
  const db = window.anauaDb;
  const { data: src, error: fetchErr } = await db.from('boarding_points').select('*').eq('id', id).single();
  if (fetchErr || !src) { toast('Ponto de embarque não encontrado.', 'error'); return; }
  const { id: _id, created_at, updated_at, ...fields } = src;
  const { error } = await db.from('boarding_points').insert({ ...fields, name: 'Cópia de ' + src.name, is_active: false });
  if (error) { toast('Erro ao duplicar ponto: ' + error.message, 'error'); return; }
  toast('Ponto de embarque duplicado como inativo.', 'success');
  navigate('#embarque');
};

window.duplicateDeparture = async function duplicateDeparture(exitId) {
  const db = window.anauaDb;
  const { data: src, error: fetchErr } = await db.from('departures').select('*').eq('id', exitId).single();
  if (fetchErr || !src) { toast('Saída não encontrada.', 'error'); return; }
  const { id: _id, created_at, updated_at, ...fields } = src;
  const newTitle = fields.title ? 'Cópia de ' + fields.title : null;
  const { data: newDep, error: depErr } = await db
    .from('departures')
    .insert({ ...fields, title: newTitle, status: 'scheduled' })
    .select('id')
    .single();
  if (depErr || !newDep?.id) { toast('Erro ao duplicar saída: ' + (depErr?.message ?? 'sem resposta'), 'error'); return; }
  // Clone boarding points
  const { data: bps } = await listAllBoardingPointsByDeparture(exitId);
  if (bps?.length) {
    const selections = bps.map((bp, i) => ({
      boardingPointId: bp.boardingPointId ?? null,
      customLabel:     bp.customLabel ?? null,
      customAddress:   bp.customAddress ?? null,
      pickupAt:        bp.pickupAt ?? null,
      notes:           bp.notes ?? null,
      isActive:        bp.isActive ?? true,
      sortOrder:       i,
    }));
    const { error: bpErr } = await saveDepartureBoardingPoints(newDep.id, selections);
    if (bpErr) toast('Saída duplicada, mas pontos de embarque falharam: ' + bpErr.message, 'warning');
  }
  toast('Saída duplicada com sucesso! Edite a data e os detalhes da nova.', 'success');
  navigate('#saidas');
};

async function renderBoardingPoints(root) {
  root.innerHTML = '<div style="padding:24px;color:var(--adm-text-muted)">Carregando…</div>';
  const { data: bps, error } = await listAllBoardingPoints();
  if (error) {
    root.innerHTML = `<p style="color:var(--adm-danger);padding:16px">Erro ao carregar: ${escHtml(error.message)}</p>`;
    return;
  }

  if (!bps || bps.length === 0) {
    root.innerHTML = `
      <div class="adm-card" style="text-align:center;padding:48px 24px">
        <p style="color:var(--adm-text-muted)">Nenhum ponto de embarque cadastrado.</p>
        <button class="adm-btn adm-btn--primary" style="margin-top:16px" onclick="openBpFormDrawer(null)">Cadastrar primeiro ponto</button>
      </div>`;
    return;
  }

  root.innerHTML = `
    <div class="adm-card">
      <table class="adm-table">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Endereço / Referência</th>
            <th>Cidade/UF</th>
            <th>Ordem</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="bp-table-body"></tbody>
      </table>
    </div>`;

  const tbody = document.getElementById('bp-table-body');
  bps.forEach(bp => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight:600">${escHtml(bp.name)}</td>
      <td style="font-size:12px;color:var(--adm-text-muted)">${escHtml([bp.address, bp.reference].filter(Boolean).join(' · '))}</td>
      <td style="font-size:12px">${escHtml([bp.city, bp.state].filter(Boolean).join('/'))||'—'}</td>
      <td style="text-align:center">${bp.sortOrder}</td>
      <td><span class="badge ${bp.isActive ? 'badge--active' : 'badge--inactive'}">${bp.isActive ? 'Ativo' : 'Inativo'}</span></td>
      <td style="white-space:nowrap">
        <button class="adm-btn adm-btn--ghost adm-btn--sm" onclick="openBpFormDrawer('${bp.id}')">Editar</button>
        <button class="adm-btn adm-btn--ghost adm-btn--sm" onclick="toggleBpActive('${bp.id}', ${bp.isActive},'${escHtml(bp.name)}')"
          style="color:var(--adm-${bp.isActive ? 'warning' : 'success'})">
          ${bp.isActive ? 'Desativar' : 'Reativar'}
        </button>
        <button class="adm-btn adm-btn--ghost adm-btn--sm" onclick="tryDeleteBp('${bp.id}','${escHtml(bp.name)}')"
          style="color:var(--adm-danger)">Excluir</button>
        <button class="adm-btn adm-btn--ghost adm-btn--sm" onclick="duplicateBoardingPoint('${bp.id}')">Duplicar</button>
      </td>`;
    tbody.appendChild(tr);
  });
}

window.openBpFormDrawer = async function openBpFormDrawer(idOrNull) {
  let bp = null;
  if (idOrNull) {
    const { data: all } = await listAllBoardingPoints();
    bp = all?.find(b => b.id === idOrNull) ?? null;
  }
  const isEdit = bp !== null;
  const v = (field) => escHtml(bp?.[field] ?? '');

  openDrawer(isEdit ? 'Editar ponto de embarque' : 'Novo ponto de embarque', `
    <form id="bp-form" autocomplete="off">
      <div class="adm-field">
        <label>Nome do ponto *</label>
        <input id="bp-name" class="adm-input" required value="${v('name')}" placeholder="Ex: Terminal Central" />
      </div>
      <div class="adm-field">
        <label>Endereço</label>
        <input id="bp-address" class="adm-input" value="${v('address')}" placeholder="Rua, número" />
      </div>
      <div class="adm-field">
        <label>Referência / ponto de encontro</label>
        <input id="bp-reference" class="adm-input" value="${v('reference')}" placeholder="Ex: Em frente ao Banco X" />
      </div>
      <div class="adm-grid-2">
        <div class="adm-field">
          <label>Cidade</label>
          <input id="bp-city" class="adm-input" value="${v('city')}" placeholder="Ex: São João del Rei" />
        </div>
        <div class="adm-field">
          <label>UF</label>
          <input id="bp-state" class="adm-input" maxlength="2" value="${v('state')}" placeholder="MG" style="text-transform:uppercase" />
        </div>
      </div>
      <div class="adm-grid-2" style="margin-top:4px">
        <div class="adm-field">
          <label>Ordem de exibição</label>
          <input id="bp-order" class="adm-input" type="number" min="0" value="${bp?.sortOrder ?? 0}" />
        </div>
        <div class="adm-field" style="flex-direction:row;align-items:center;gap:8px;padding-top:20px">
          <input id="bp-active" type="checkbox" ${bp?.isActive !== false ? 'checked' : ''} style="width:16px;height:16px" />
          <label for="bp-active" style="margin:0;font-weight:400">Ativo</label>
        </div>
      </div>
      <div style="display:flex;gap:10px;margin-top:24px;padding-top:16px;border-top:1px solid var(--adm-border)">
        <button type="submit" id="bp-save-btn" class="adm-btn adm-btn--primary" style="flex:1">${isEdit ? 'Salvar alterações' : 'Criar ponto'}</button>
        <button type="button" class="adm-btn adm-btn--secondary" onclick="closeDrawer()">Cancelar</button>
      </div>
    </form>
  `);

  document.getElementById('bp-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const saveBtn = document.getElementById('bp-save-btn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Salvando…'; }

    const payload = {
      name:       document.getElementById('bp-name')?.value.trim(),
      address:    document.getElementById('bp-address')?.value.trim() || null,
      reference:  document.getElementById('bp-reference')?.value.trim() || null,
      city:       document.getElementById('bp-city')?.value.trim() || null,
      state:      document.getElementById('bp-state')?.value.trim().toUpperCase() || null,
      sort_order: parseInt(document.getElementById('bp-order')?.value, 10) || 0,
      is_active:  document.getElementById('bp-active')?.checked ?? true,
    };
    if (!payload.name) {
      toast('Nome é obrigatório.', 'error');
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = isEdit ? 'Salvar alterações' : 'Criar ponto'; }
      return;
    }

    let error;
    if (isEdit) ({ error } = await updateBoardingPoint(bp.id, payload));
    else         ({ error } = await createBoardingPoint(payload));

    if (error) {
      toast('Erro: ' + error.message, 'error');
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = isEdit ? 'Salvar alterações' : 'Criar ponto'; }
      return;
    }
    toast(isEdit ? 'Ponto atualizado!' : 'Ponto criado!', 'success');
    closeDrawer();
    navigate('#embarque');
  });
};

window.toggleBpActive = async function toggleBpActive(id, isActive, name) {
  const { error } = await updateBoardingPoint(id, { is_active: !isActive });
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  toast(`Ponto "${name}" ${isActive ? 'desativado' : 'reativado'}.`, 'success');
  navigate('#embarque');
};

window.tryDeleteBp = function tryDeleteBp(id, name) {
  openModal(
    'Excluir ponto de embarque',
    `<p style="font-size:var(--text-sm);color:var(--adm-text-muted)">
       Excluir <strong>${escHtml(name)}</strong>?<br><br>
       Só é possível excluir se o ponto não estiver vinculado a nenhuma saída.
     </p>`,
    `<button class="adm-btn adm-btn--secondary" onclick="closeModal()">Cancelar</button>
     <button class="adm-btn adm-btn--danger" id="confirm-del-bp">Excluir</button>`
  );
  document.getElementById('confirm-del-bp')?.addEventListener('click', async () => {
    closeModal();
    const { deleted, error } = await deleteBoardingPoint(id);
    if (!deleted) { toast(error?.message ?? 'Não foi possível excluir.', 'error'); return; }
    toast('Ponto excluído.', 'success');
    navigate('#embarque');
  });
};

// ─────────────────────────────────────────────────────────────────────────────
//  MODULE: SAÍDAS
// ─────────────────────────────────────────────────────────────────────────────

async function renderSaidas(root) {
  root.innerHTML = `
    <div class="saidas-toolbar">
      <div class="saidas-filters">
        <div class="saidas-filter-group">
          <div class="saidas-search-wrap">
            <svg class="saidas-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="search" class="adm-input adm-input--sm saidas-search-input" id="saidas-filter" placeholder="Filtrar por experiência, título ou data…" />
          </div>
          <select class="adm-input adm-input--sm" id="saidas-status">
            <option value="">Todos os status</option>
            <option value="scheduled">Aberta</option>
            <option value="sold_out">Esgotada</option>
            <option value="cancelled">Cancelada</option>
            <option value="completed">Concluída</option>
          </select>
        </div>
        <div class="saidas-filter-actions">
          <span class="adm-filter-count" id="saidas-count"></span>
          <button class="adm-btn adm-btn--primary adm-btn--sm" id="saidas-new-btn">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Nova Saída
          </button>
        </div>
      </div>
    </div>

    <div id="saidas-list-wrap">
      <div class="saidas-skeleton">
        <div class="saidas-skeleton__row"></div>
        <div class="saidas-skeleton__row"></div>
        <div class="saidas-skeleton__row"></div>
      </div>
    </div>`;

  const db = window.anauaDb;
  let allExits = [];
  let experiences = [];
  // occupancy map: departure_id → participant count
  const occMap = {};

  if (db) {
    const [exitsRes, expsRes] = await Promise.all([
      db.from('departures')
        .select('id, experience_id, title, start_at, end_at, capacity, price, status, experiences(id, title)')
        .order('start_at', { ascending: false }),
      db.from('experiences').select('id, title, max_participants').eq('is_active', true).order('title'),
    ]);

    if (exitsRes.error) {
      console.warn('[saidas] Erro ao carregar saídas:', exitsRes.error.message);
      $('saidas-list-wrap').innerHTML = `
        <div class="saidas-empty">
          <div class="saidas-empty__icon">⚠️</div>
          <div class="saidas-empty__title">Não foi possível carregar as saídas</div>
          <div class="saidas-empty__sub">Verifique sua conexão ou recarregue a página.</div>
        </div>`;
      return;
    }

    allExits = (exitsRes.data ?? []).map(d => ({
      exp:  { title: d.experiences?.title ?? '—', id: d.experience_id },
      exit: { id: d.id, start_at: d.start_at, end_at: d.end_at, status: d.status ?? 'scheduled',
              capacity: d.capacity ?? 0, title: d.title ?? '', price: d.price ?? null },
    }));
    _exitsCache = allExits;
    experiences = expsRes.data ?? [];

    // Batch-load occupancy: count participants per departure across non-cancelled reservations
    if (allExits.length) {
      const { data: resRows } = await db
        .from('reservations')
        .select('id, departure_id')
        .not('reservation_status', 'in', '(cancelled,refunded)');
      if (resRows?.length) {
        const resIds = resRows.map(r => r.id);
        const depByRes = Object.fromEntries(resRows.map(r => [r.id, r.departure_id]));
        const { data: paxRows } = await db
          .from('participants')
          .select('id, reservation_id')
          .in('reservation_id', resIds);
        (paxRows ?? []).forEach(p => {
          const depId = depByRes[p.reservation_id];
          if (depId) occMap[depId] = (occMap[depId] ?? 0) + 1;
        });
      }
    }
  }

  // ─── Status helpers ───────────────────────────────────────────────────────
  function statusInfo(status) {
    return {
      scheduled: { cls: 'active',    label: 'Aberta' },
      sold_out:  { cls: 'soldout',   label: 'Esgotada' },
      cancelled: { cls: 'cancelled', label: 'Cancelada' },
      completed: { cls: 'completed', label: 'Concluída' },
    }[status] ?? { cls: 'draft', label: status };
  }

  // ─── Row renderer ────────────────────────────────────────────────────────────────────────────
  function buildRow({ exp, exit }) {
    const { cls, label } = statusInfo(exit.status);
    const depTitle  = exit.title || exp.title;
    const occupied  = occMap[exit.id] ?? 0;
    const available = Math.max(0, (exit.capacity ?? 0) - occupied);
    const capPct    = exit.capacity > 0 ? Math.min(100, Math.round(occupied / exit.capacity * 100)) : 0;
    const fullness  = capPct >= 100 ? 'full' : capPct >= 75 ? 'high' : capPct >= 50 ? 'mid' : 'low';
    const dt        = exit.start_at ? new Date(exit.start_at) : null;
    const dayNum    = dt ? dt.toLocaleDateString('pt-BR', { day: '2-digit' }) : '—';
    const monthStr  = dt ? dt.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase() : '';
    const yearStr   = dt ? dt.getFullYear() : '';
    const timeStr   = dt ? dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
    const isPast    = dt && dt < new Date();
    const hasCustomTitle = exit.title && exit.title !== exp.title;

    return `
      <div class="saida-row saida-row--${cls}${isPast && exit.status === 'scheduled' ? ' saida-row--past' : ''}" data-exit="${exit.id}">
        <div class="saida-row__date-col">
          <span class="saida-row__day">${dayNum}</span>
          <span class="saida-row__month">${monthStr}</span>
          <span class="saida-row__year">${yearStr}</span>
          ${timeStr ? `<span class="saida-row__time">${timeStr}</span>` : ''}
        </div>
        <div class="saida-row__body">
          <div class="saida-row__top">
            <span class="saida-row__title">${escHtml(depTitle)}</span>
            <span class="badge badge--${cls}">${label}</span>
          </div>
          ${hasCustomTitle ? `<div class="saida-row__exp">${escHtml(exp.title)}</div>` : ''}
          <div class="saida-row__occ">
            <div class="saida-occ-bar" title="${occupied} de ${exit.capacity ?? 0}">
              <div class="saida-occ-bar__fill saida-occ-bar--${fullness}" style="width:${capPct}%"></div>
            </div>
            <span class="saida-occ-label saida-occ-label--${fullness}">${occupied} ocup. · <strong>${available} disp.</strong> / ${exit.capacity ?? 0}</span>
          </div>
        </div>
        <div class="saida-row__side">
          <span class="saida-row__price">${exit.price != null ? fmt(exit.price) : '<span class="text-muted">—</span>'}</span>
          <button class="adm-btn adm-btn--ghost adm-btn--sm saida-row__open" data-exit="${exit.id}">Detalhes <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg></button>
        </div>
      </div>`;
  }

    function renderList(data) {
    const wrap = $('saidas-list-wrap');
    $('saidas-count').textContent = `${data.length} saída${data.length !== 1 ? 's' : ''}`;
    if (!data.length) {
      wrap.innerHTML = `
        <div class="saidas-empty">
          <div class="saidas-empty__icon">🗓️</div>
          <div class="saidas-empty__title">Nenhuma saída encontrada</div>
          <div class="saidas-empty__sub">Tente ajustar os filtros ou cadastre uma nova saída.</div>
        </div>`;
      return;
    }
    wrap.innerHTML = `<div class="saidas-list">${data.map(buildRow).join('')}</div>`;
    wrap.querySelectorAll('[data-exit]').forEach(el =>
      el.addEventListener('click', () => openExitDrawer(el.dataset.exit))
    );
  }

  function filtered() {
    const q = ($('saidas-filter')?.value ?? '').toLowerCase();
    const s = $('saidas-status')?.value ?? '';
    return allExits.filter(({ exp, exit }) => {
      const matchQ = !q || exp.title.toLowerCase().includes(q)
        || (exit.title ?? '').toLowerCase().includes(q)
        || (exit.start_at ?? '').includes(q);
      const matchS = !s || exit.status === s;
      return matchQ && matchS;
    });
  }

  $('saidas-filter').addEventListener('input',  () => renderList(filtered()));
  $('saidas-status').addEventListener('change', () => renderList(filtered()));

  $('saidas-new-btn').addEventListener('click', async () => {
    if (!experiences.length) {
      const { data: freshExps } = await db.from('experiences').select('id, title').eq('is_active', true).order('title');
      experiences = freshExps ?? [];
    }
    openExitFormDrawer(null, null, experiences, () => renderSaidas(root));
  });

  if (!allExits.length && db) {
    $('saidas-list-wrap').innerHTML = `
      <div class="saidas-empty">
        <div class="saidas-empty__icon">🗓️</div>
        <div class="saidas-empty__title">Nenhuma saída cadastrada</div>
        <div class="saidas-empty__sub">Crie a primeira saída para começar a vender pelo site.</div>
        <button class="adm-btn adm-btn--primary" id="saidas-empty-new-btn">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Criar primeira saída
        </button>
      </div>`;
    $('saidas-empty-new-btn')?.addEventListener('click', () => $('saidas-new-btn').click());
    return;
  }

  renderList(allExits);
}

// ─────────────────────────────────────────────────────────────────────────────
//  MODULE: RESERVAS  (v2 — operational center)
// ─────────────────────────────────────────────────────────────────────────────

async function renderReservas(root, openId) {
  const STATUS_TABS = [
    { key: 'all',             label: 'Todas'      },
    { key: 'pending',         label: 'Pendente'   },
    { key: 'pending_payment', label: 'Aguardando' },
    { key: 'reserved',        label: 'Reservado'  },
    { key: 'confirmed',       label: 'Confirmado' },
    { key: 'cancelled',       label: 'Cancelado'  },
  ];

  let allBookings  = [];
  let expOptions   = [];
  let activeTab    = 'all';
  let filterSearch = '';
  let filterExp    = '';
  let filterStatus = '';
  let filterPay    = '';

  // ── Shell ──────────────────────────────────────────────────────────────────
  root.innerHTML = `
    <div class="adm-res-toolbar">
      <div class="adm-res-filters">
        <input type="search" class="adm-input adm-input--sm" id="res-search" placeholder="Código, nome, e-mail, telefone…" />
        <select class="adm-input adm-input--sm" id="res-filter-exp">
          <option value="">Todas as experiências</option>
        </select>
        <select class="adm-input adm-input--sm" id="res-filter-status">
          <option value="">Todos os status</option>
          <option value="pending">Pendente</option>
          <option value="pending_payment">Aguardando pagamento</option>
          <option value="reserved">Reservado</option>
          <option value="confirmed">Confirmado</option>
          <option value="cancelled">Cancelado</option>
        </select>
        <select class="adm-input adm-input--sm" id="res-filter-pay">
          <option value="">Situação de pagamento</option>
          <option value="paid">Pago</option>
          <option value="partial">Parcial</option>
          <option value="pending">Pendente</option>
        </select>
        <button class="adm-btn adm-btn--ghost adm-btn--sm" id="res-clear-filters" style="display:none">✕ Limpar filtros</button>
      </div>
      <button class="adm-btn adm-btn--secondary adm-btn--sm" id="btn-organizar">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
        Organizar saída
      </button>
    </div>

    <div class="adm-card" style="overflow:visible">
      <div class="adm-tabs" id="reservas-tabs"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 16px 12px">
        <span class="adm-filter-count text-muted text-small" id="reservas-count"></span>
        <button class="adm-btn adm-btn--ghost adm-btn--sm" id="res-export-csv">⬇ Exportar CSV</button>
      </div>
      <div class="adm-table-wrap">
        <table class="adm-table adm-res-table">
          <thead>
            <tr>
              <th>Código / Criado</th>
              <th>Responsável</th>
              <th>Experiência · Saída</th>
              <th>Embarque</th>
              <th class="text-center">Pax</th>
              <th>Status</th>
              <th class="text-right">Financeiro</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="reservas-tbody">
            <tr><td colspan="8" class="adm-table__empty text-muted">Carregando…</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Drawer overlay -->
    <div class="adm-drawer-overlay" id="res-drawer-overlay" aria-hidden="true"></div>
    <aside class="adm-drawer" id="res-drawer" role="dialog" aria-modal="true" aria-label="Detalhes da reserva">
      <div class="adm-drawer__header">
        <span class="adm-drawer__title">Detalhes da reserva</span>
        <button class="adm-drawer__close" id="res-drawer-close" aria-label="Fechar">✕</button>
      </div>
      <div class="adm-drawer__body" id="res-drawer-body">
        <p class="text-muted" style="padding:24px 16px">Clique em uma reserva para ver os detalhes.</p>
      </div>
    </aside>

    <!-- Organizar saída modal -->
    <div class="adm-modal-overlay" id="organizar-overlay" aria-hidden="true" style="display:none">
      <div class="adm-modal adm-modal--wide" role="dialog" aria-modal="true">
        <div class="adm-modal__header">
          <span style="font-weight:600;font-size:15px">Organizar saída</span>
          <button class="adm-drawer__close" id="organizar-close" aria-label="Fechar">✕</button>
        </div>
        <div class="adm-modal__body" id="organizar-body">
          <p class="text-muted">Carregando…</p>
        </div>
      </div>
    </div>`;

  const db = window.anauaDb;
  if (!db) {
    $('reservas-tbody').innerHTML = `<tr><td colspan="8" class="adm-table__empty" style="color:var(--adm-danger)">Supabase não inicializado.</td></tr>`;
    return;
  }

  // ── Load reservations with joins ───────────────────────────────────────────
  const joinSelect = [
    'id, customer_name, customer_email, customer_phone',
    'reservation_status, total_amount, amount_paid, payment_method, notes, created_at, capacity_restored',
    'experience_id, departure_id, boarding_point_id',
    'experiences(id, title)',
    'departures(id, start_at)',
    'departure_boarding_points(id, pickup_at, custom_label, custom_address, boarding_points(name, address))',
    'participants(id)',
  ].join(', ');

  const { data: bookings, error: bErr } = await db
    .from('reservations')
    .select(joinSelect)
    .order('created_at', { ascending: false });

  if (bErr) {
    // Fallback: joins may fail if FK columns not yet migrated
    console.warn('[admin-reservas] Join query falhou, tentando sem joins:', bErr.message);
    const { data: flat, error: fErr } = await db
      .from('reservations')
      .select('id, customer_name, customer_email, customer_phone, reservation_status, total_amount, amount_paid, payment_method, notes, created_at, experience_id, departure_id')
      .order('created_at', { ascending: false });
    if (fErr) {
      console.error('[admin-reservas] Erro fatal:', fErr.message);
      $('reservas-tbody').innerHTML = `<tr><td colspan="8" class="adm-table__empty" style="color:var(--adm-danger)">Erro: ${escHtml(fErr.message)}</td></tr>`;
      return;
    }
    allBookings = flat ?? [];
  } else {
    allBookings = bookings ?? [];
  }

  // Load experiences for filter dropdown
  const { data: exps } = await db.from('experiences').select('id, title').order('title');
  expOptions = exps ?? [];
  const expSel = $('res-filter-exp');
  expOptions.forEach(e => {
    const o = document.createElement('option');
    o.value = e.id;
    o.textContent = e.title;
    expSel.appendChild(o);
  });

  // Build experience lookup map (fallback when join not available)
  const expMap = Object.fromEntries(expOptions.map(e => [e.id, e.title]));

  // ── Display helpers ────────────────────────────────────────────────────────
  function getExpTitle(b) {
    return b.experiences?.title ?? expMap[b.experience_id] ?? '—';
  }

  function getDepDate(b) {
    const iso = b.departures?.start_at;
    return iso ? fmtDate(iso.split('T')[0]) : '—';
  }

  function getBPDisplay(b) {
    const dbp = b.departure_boarding_points;
    if (!dbp) return { name: '—', time: null, address: null };
    const name    = dbp.custom_label    || dbp.boarding_points?.name    || '—';
    const address = dbp.custom_address  || dbp.boarding_points?.address || null;
    const time    = dbp.pickup_at
      ? new Date(dbp.pickup_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : null;
    return { name, time, address };
  }

  function getPaxCount(b) {
    return (b.participants ?? []).length;
  }

  function getPayState(b) {
    if (b.reservation_status === 'cancelled') return 'cancelled';
    const total = b.total_amount ?? 0;
    const paid  = b.amount_paid  ?? 0;
    if (paid <= 0)    return 'pending';
    if (paid >= total) return 'paid';
    return 'partial';
  }

  // ── Filtering ──────────────────────────────────────────────────────────────
  function filtered() {
    return allBookings.filter(b => {
      if (activeTab !== 'all' && b.reservation_status !== activeTab) return false;
      if (filterStatus && b.reservation_status !== filterStatus) return false;
      if (filterExp    && b.experience_id       !== filterExp)    return false;
      if (filterPay    && getPayState(b)         !== filterPay)   return false;
      if (filterSearch) {
        const q   = filterSearch.toLowerCase();
        const hay = [b.id, b.customer_name, b.customer_email, b.customer_phone]
          .map(x => (x ?? '').toLowerCase()).join(' ');
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function updateClearBtn() {
    const active = filterSearch || filterExp || filterStatus || filterPay;
    $('res-clear-filters').style.display = active ? '' : 'none';
  }

  // ── Status tabs ────────────────────────────────────────────────────────────
  function countTab(key) {
    return key === 'all'
      ? allBookings.length
      : allBookings.filter(b => b.reservation_status === key).length;
  }

  function renderTabs() {
    $('reservas-tabs').innerHTML = STATUS_TABS.map(t => `
      <button class="adm-tab ${activeTab === t.key ? 'is-active' : ''}" data-tab="${t.key}">
        ${t.label} <span class="adm-count">${countTab(t.key)}</span>
      </button>`).join('');
    $('reservas-tabs').querySelectorAll('[data-tab]').forEach(btn =>
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.tab;
        renderTabs();
        renderTable(filtered());
      })
    );
  }

  // ── Table ──────────────────────────────────────────────────────────────────
  function payBadge(b) {
    const state = getPayState(b);
    const cfg = {
      paid:      ['text-green',      '✓ Pago'],
      partial:   ['text-amber',      '½ Parcial'],
      pending:   ['text-muted',      '… Pendente'],
      cancelled: ['text-muted',      '—'],
    };
    const [cls, lbl] = cfg[state] ?? ['text-muted', state];
    return `<span class="${cls}" style="font-size:11px;font-weight:600">${lbl}</span>`;
  }

  function renderTable(data) {
    $('reservas-count').textContent = `${data.length} reserva(s)`;
    if (!data.length) {
      $('reservas-tbody').innerHTML = `<tr><td colspan="8" class="adm-table__empty text-muted">Nenhuma reserva encontrada.</td></tr>`;
      return;
    }
    $('reservas-tbody').innerHTML = data.map(b => {
      const bp      = getBPDisplay(b);
      const pax     = getPaxCount(b);
      const pending = Math.max(0, (b.total_amount ?? 0) - (b.amount_paid ?? 0));
      const shortId = b.id.slice(0, 8).toUpperCase();
      return `<tr class="adm-res-row is-clickable" data-id="${escHtml(b.id)}">
        <td>
          <div class="adm-res-code" title="${escHtml(b.id)}">${shortId}…</div>
          <div class="text-small text-muted">${fmtDateShort(b.created_at)}</div>
        </td>
        <td>
          <div class="adm-avatar-row">
            <div class="adm-avatar adm-avatar--sm">${initials(b.customer_name)}</div>
            <div>
              <div style="font-weight:600;font-size:13px">${escHtml(b.customer_name ?? '—')}</div>
              <div class="text-small text-muted">${escHtml(b.customer_email ?? '')}</div>
              ${b.customer_phone ? `<div class="text-small text-muted">${escHtml(b.customer_phone)}</div>` : ''}
            </div>
          </div>
        </td>
        <td>
          <div style="font-weight:500;font-size:13px">${escHtml(getExpTitle(b))}</div>
          <div class="text-small text-muted">${getDepDate(b)}</div>
        </td>
        <td>
          <div style="font-size:12px;font-weight:500">${escHtml(bp.name)}</div>
          ${bp.time ? `<div class="text-small text-muted">${escHtml(bp.time)}</div>` : ''}
        </td>
        <td class="text-center">
          ${pax > 0 ? `<span class="adm-badge-pax">${pax}</span>` : '<span class="text-muted">—</span>'}
        </td>
        <td>${badge(b.reservation_status ?? 'pending')}</td>
        <td class="text-right">
          <div style="font-weight:700;font-size:13px">${fmt(b.total_amount ?? 0)}</div>
          ${payBadge(b)}
          ${pending > 0 && b.reservation_status !== 'cancelled'
            ? `<div class="text-small" style="color:var(--clr-pending)">Saldo: ${fmt(pending)}</div>`
            : ''}
        </td>
        <td>
          <button class="adm-btn adm-btn--ghost adm-btn--sm res-detail-btn" data-id="${escHtml(b.id)}" title="Ver detalhes">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </td>
      </tr>`;
    }).join('');

    // Bind detail buttons and row clicks
    $('reservas-tbody').querySelectorAll('.res-detail-btn').forEach(btn =>
      btn.addEventListener('click', e => { e.stopPropagation(); openDrawer(btn.dataset.id); })
    );
    $('reservas-tbody').querySelectorAll('.adm-res-row').forEach(row =>
      row.addEventListener('click', () => openDrawer(row.dataset.id))
    );
  }

  // ── Drawer ─────────────────────────────────────────────────────────────────
  function openDrawerOverlay() {
    $('res-drawer-overlay').classList.add('is-open');
    $('res-drawer').classList.add('is-open');
    document.body.classList.add('adm-drawer-open');
  }

  function closeDrawer() {
    $('res-drawer-overlay').classList.remove('is-open');
    $('res-drawer').classList.remove('is-open');
    document.body.classList.remove('adm-drawer-open');
  }

  async function openDrawer(id) {
    const b = allBookings.find(x => x.id === id);
    if (!b) return;
    openDrawerOverlay();
    $('res-drawer-body').innerHTML = `<div style="padding:40px;text-align:center;color:var(--adm-muted)">Carregando…<br/><br/><div class="adm-spinner"></div></div>`;

    const [{ data: parts, error: pErr }, { data: pmts, error: pmtErr }] = await Promise.all([
      db.from('participants').select('id, full_name, profile_type, birthdate, document_number').eq('reservation_id', id).order('id'),
      db.from('payments').select('id, amount, method, status, paid_at').eq('reservation_id', id).order('paid_at', { ascending: false }),
    ]);

    if (pErr)   console.warn('[admin-reservas] participants fetch erro:', pErr.message, '| code:', pErr.code);
    if (pmtErr) console.warn('[admin-reservas] payments fetch erro:', pmtErr.message, '| code:', pmtErr.code);
    console.log(`[admin-reservas] Drawer ${id} — participantes: ${(parts ?? []).length} | pagamentos: ${(pmts ?? []).length}${pErr ? ' (⚠ RLS ou schema)' : ''}`);

    const bp       = getBPDisplay(b);
    const expTitle = getExpTitle(b);
    const depDate  = getDepDate(b);
    const pending  = Math.max(0, (b.total_amount ?? 0) - (b.amount_paid ?? 0));

    const STATUS_OPTIONS = ['pending', 'pending_payment', 'reserved', 'confirmed', 'cancelled']
      .map(s => `<option value="${s}" ${b.reservation_status === s ? 'selected' : ''}>${STATUS_LABEL[s] ?? s}</option>`)
      .join('');

    $('res-drawer-body').innerHTML = `
      <!-- Reservation summary -->
      <div class="adm-drawer-section">
        <div class="adm-drawer-section__header">
          <span>Reserva</span>
          ${badge(b.reservation_status)}
        </div>
        <div class="adm-info-grid">
          <div class="adm-info-cell adm-info-cell--full">
            <span class="adm-info-cell__label">Código completo</span>
            <span class="adm-info-cell__val adm-mono" style="font-size:11px;word-break:break-all">${escHtml(b.id)}</span>
          </div>
          <div class="adm-info-cell">
            <span class="adm-info-cell__label">Criado em</span>
            <span class="adm-info-cell__val">${fmtDate(b.created_at)}</span>
          </div>
          <div class="adm-info-cell">
            <span class="adm-info-cell__label">Método de pagamento</span>
            <span class="adm-info-cell__val">${payMethodLabel(b.payment_method)}</span>
          </div>
        </div>
      </div>

      <!-- Experience & departure -->
      <div class="adm-drawer-section">
        <div class="adm-drawer-section__header">Experiência</div>
        <div class="adm-info-grid">
          <div class="adm-info-cell adm-info-cell--full">
            <span class="adm-info-cell__label">Experiência</span>
            <span class="adm-info-cell__val">${escHtml(expTitle)}</span>
          </div>
          <div class="adm-info-cell">
            <span class="adm-info-cell__label">Data da saída</span>
            <span class="adm-info-cell__val">${escHtml(depDate)}</span>
          </div>
          <div class="adm-info-cell">
            <span class="adm-info-cell__label">Horário de embarque</span>
            <span class="adm-info-cell__val">${bp.time ? escHtml(bp.time) : '—'}</span>
          </div>
          <div class="adm-info-cell adm-info-cell--full">
            <span class="adm-info-cell__label">Ponto de embarque</span>
            <span class="adm-info-cell__val">
              ${escHtml(bp.name)}
              ${bp.address ? `<br><small class="text-muted">${escHtml(bp.address)}</small>` : ''}
            </span>
          </div>
        </div>
      </div>

      <!-- Customer -->
      <div class="adm-drawer-section">
        <div class="adm-drawer-section__header">Responsável</div>
        <div class="adm-info-grid">
          <div class="adm-info-cell adm-info-cell--full">
            <span class="adm-info-cell__label">Nome</span>
            <span class="adm-info-cell__val">${escHtml(b.customer_name ?? '—')}</span>
          </div>
          <div class="adm-info-cell">
            <span class="adm-info-cell__label">E-mail</span>
            <span class="adm-info-cell__val">${escHtml(b.customer_email ?? '—')}</span>
          </div>
          <div class="adm-info-cell">
            <span class="adm-info-cell__label">Telefone</span>
            <span class="adm-info-cell__val">${escHtml(b.customer_phone ?? '—')}</span>
          </div>
        </div>
      </div>

      <!-- Financial -->
      <div class="adm-drawer-section">
        <div class="adm-drawer-section__header">Financeiro</div>
        <div class="adm-info-grid">
          <div class="adm-info-cell">
            <span class="adm-info-cell__label">Total</span>
            <span class="adm-info-cell__val" style="font-weight:700">${fmt(b.total_amount ?? 0)}</span>
          </div>
          <div class="adm-info-cell">
            <span class="adm-info-cell__label">Pago</span>
            <span class="adm-info-cell__val text-green">${fmt(b.amount_paid ?? 0)}</span>
          </div>
          ${pending > 0 ? `
          <div class="adm-info-cell">
            <span class="adm-info-cell__label">Saldo pendente</span>
            <span class="adm-info-cell__val" style="color:var(--clr-pending)">${fmt(pending)}</span>
          </div>` : ''}
        </div>
        ${(pmts ?? []).length ? `
        <div class="adm-sub-section">
          <div class="adm-sub-section__label">Registros de pagamento</div>
          <table class="adm-table adm-table--compact" style="margin-top:6px">
            <thead><tr><th>Método</th><th>Valor</th><th>Status</th><th>Data</th></tr></thead>
            <tbody>
              ${pmts.map(p => `<tr>
                <td style="font-size:12px">${payMethodLabel(p.method)}</td>
                <td style="font-size:12px;font-weight:600">${fmt(p.amount ?? 0)}</td>
                <td style="font-size:12px">${badge(p.status ?? 'pending')}</td>
                <td style="font-size:11px;color:var(--adm-muted)">${p.paid_at ? fmtDateShort(p.paid_at) : '—'}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>` : ''}
      </div>

      <!-- Participants -->
      <div class="adm-drawer-section">
        <div class="adm-drawer-section__header">
          Participantes
          ${(parts ?? []).length ? `<span class="adm-count">${parts.length}</span>` : ''}
        </div>
        ${(parts ?? []).length ? `
        <table class="adm-table adm-table--compact" style="margin-top:8px">
          <thead><tr><th>Nome</th><th>CPF</th><th>Perfil</th><th>Nascimento</th></tr></thead>
          <tbody>
            ${parts.map(p => `<tr>
              <td style="font-weight:500;font-size:12px">${escHtml(p.full_name ?? '—')}</td>
              <td style="font-size:11px;color:var(--adm-muted);font-family:monospace">${p.document_number ? fmtCpfAdmin(p.document_number) : '—'}</td>
              <td style="font-size:12px">${escHtml(p.profile_type ?? '—')}</td>
              <td style="font-size:11px;color:var(--adm-muted)">${p.birthdate ? fmtDate(p.birthdate) : '—'}</td>
            </tr>`).join('')}
          </tbody>
        </table>` : `<p class="text-muted text-small" style="padding:8px 0">Nenhum participante registrado.</p>`}
      </div>

      ${b.notes ? `
      <!-- Notes -->
      <div class="adm-drawer-section">
        <div class="adm-drawer-section__header">Observações</div>
        <p style="font-size:13px;color:var(--adm-text-2);white-space:pre-wrap;padding:8px 0">${escHtml(b.notes)}</p>
      </div>` : ''}

      <!-- Actions -->
      <div class="adm-drawer-section adm-drawer-section--actions">
        <div class="adm-drawer-section__header">Ações administrativas</div>
        <div class="adm-drawer-section__body">
          <div class="adm-status-row">
            <label for="status-sel-${escHtml(b.id)}">Alterar status:</label>
            <select class="adm-input adm-input--sm" id="status-sel-${escHtml(b.id)}">${STATUS_OPTIONS}</select>
            <button class="adm-btn adm-btn--secondary adm-btn--sm" id="btn-save-status" data-id="${escHtml(b.id)}">Salvar</button>
          </div>
          ${b.reservation_status !== 'cancelled' ? `
          <button class="adm-btn adm-btn--danger adm-btn--sm" id="btn-cancel-booking" data-id="${escHtml(b.id)}" data-pax="${b.participants?.length ?? 0}" data-dep="${escHtml(b.departure_id ?? '')}" data-name="${escHtml(b.customer_name ?? '')}">
            Cancelar reserva
          </button>` : `
          <button class="adm-btn adm-btn--danger adm-btn--sm" id="btn-delete-booking" data-id="${escHtml(b.id)}" data-name="${escHtml(b.customer_name ?? '')}">
            🗑 Excluir reserva permanentemente
          </button>`}
        </div>
      </div>`;

    // Save status
    document.getElementById('btn-save-status').addEventListener('click', async () => {
      const newStatus = document.getElementById(`status-sel-${b.id}`).value;
      const { error } = await db.from('reservations').update({ reservation_status: newStatus }).eq('id', b.id);
      if (error) {
        toast(`Erro ao alterar status: ${error.message}`, 'error');
        console.error('[admin-reservas] update status:', error);
      } else {
        toast('Status atualizado!', 'success');
        b.reservation_status = newStatus;
        renderTabs();
        renderTable(filtered());
        openDrawer(b.id); // re-render drawer
      }
    });

    // Cancel booking
    if (document.getElementById('btn-cancel-booking')) {
      document.getElementById('btn-cancel-booking').addEventListener('click', async () => {
        const btn  = document.getElementById('btn-cancel-booking');
        const name = btn.dataset.name;
        if (!confirm(`Cancelar a reserva de "${name}"? Esta ação não pode ser desfeita.`)) return;
        // The DB trigger fn_restore_departure_capacity (SECURITY DEFINER) handles
        // capacity restoration automatically on status → 'cancelled'.
        const { error } = await db.from('reservations').update({ reservation_status: 'cancelled' }).eq('id', b.id);
        if (error) {
          toast(`Erro ao cancelar: ${error.message}`, 'error');
          console.error('[admin-reservas] cancelar reserva:', error);
          return;
        }
        toast('Reserva cancelada.', 'success');
        b.reservation_status = 'cancelled';
        b.capacity_restored  = true; // trigger already ran
        renderTabs();
        renderTable(filtered());
        closeDrawer();
      });
    }

    // Delete booking (only visible when already cancelled)
    if (document.getElementById('btn-delete-booking')) {
      document.getElementById('btn-delete-booking').addEventListener('click', async () => {
        const name = document.getElementById('btn-delete-booking').dataset.name;
        if (!confirm(`Excluir permanentemente a reserva de "${name}"?\n\nTodos os participantes e dados associados também serão removidos. Esta ação NÃO pode ser desfeita.`)) return;

        // Restore capacity BEFORE deleting participants, but only if the
        // cancel step did not already restore it (capacity_restored flag).
        // This handles reservations cancelled before the DB trigger existed.
        if (!b.capacity_restored && b.departure_id) {
          const { data: parts } = await db.from('participants').select('id').eq('reservation_id', b.id);
          const paxCount = parts?.length ?? 0;
          if (paxCount > 0) {
            const { data: dep } = await db.from('departures').select('capacity').eq('id', b.departure_id).single();
            if (dep) {
              const { error: capErr } = await db.from('departures')
                .update({ capacity: dep.capacity + paxCount })
                .eq('id', b.departure_id);
              if (capErr) {
                console.warn('[admin-reservas] restore capacity on delete:', capErr.message);
              } else {
                console.log(`[admin-reservas] Vagas restauradas ao excluir: +${paxCount} → ${dep.capacity + paxCount}`);
              }
            }
          }
        }

        // Delete participants (FK)
        const { error: pErr } = await db.from('participants').delete().eq('reservation_id', b.id);
        if (pErr) console.warn('[admin-reservas] delete participants:', pErr.message);
        // Delete payments
        const { error: payErr } = await db.from('payments').delete().eq('reservation_id', b.id);
        if (payErr) console.warn('[admin-reservas] delete payments:', payErr.message);
        // Delete reservation
        const { error: rErr } = await db.from('reservations').delete().eq('id', b.id);
        if (rErr) {
          toast(`Erro ao excluir: ${rErr.message}`, 'error');
          console.error('[admin-reservas] delete reservation:', rErr);
          return;
        }
        toast('Reserva excluída permanentemente.', 'success');
        allBookings = allBookings.filter(x => x.id !== b.id);
        renderTabs();
        renderTable(filtered());
        closeDrawer();
      });
    }
  }

  $('res-drawer-close').addEventListener('click', closeDrawer);
  $('res-drawer-overlay').addEventListener('click', closeDrawer);

  // ── Organizar saída ────────────────────────────────────────────────────────
  $('btn-organizar').addEventListener('click', () => {
    renderOrganizarSaida();
    $('organizar-overlay').style.display = 'flex';
    $('organizar-overlay').setAttribute('aria-hidden', 'false');
  });

  $('organizar-close').addEventListener('click', () => {
    $('organizar-overlay').style.display = 'none';
    $('organizar-overlay').setAttribute('aria-hidden', 'true');
  });

  function renderOrganizarSaida() {
    const relevant = allBookings.filter(b => b.reservation_status !== 'cancelled');
    if (!relevant.length) {
      $('organizar-body').innerHTML = `<div class="adm-empty"><div class="adm-empty__icon">📋</div><div class="adm-empty__title">Nenhuma reserva ativa</div><div class="adm-empty__desc">Não há reservas não-canceladas no momento.</div></div>`;
      return;
    }

    // Group by departure → boarding point
    const byDep = {};
    relevant.forEach(b => {
      const depId    = b.departure_id ?? '__sem_saida__';
      const depLabel = `${getExpTitle(b)} — ${getDepDate(b)}`;
      if (!byDep[depId]) byDep[depId] = { label: depLabel, byBP: {} };
      const bp      = getBPDisplay(b);
      const bpKey   = b.boarding_point_id ?? '__sem_ponto__';
      const bpLabel = bp.name + (bp.time ? ` · ${bp.time}` : '');
      if (!byDep[depId].byBP[bpKey]) byDep[depId].byBP[bpKey] = { label: bpLabel, bookings: [] };
      byDep[depId].byBP[bpKey].bookings.push(b);
    });

    let html = '';
    Object.entries(byDep).forEach(([depId, dep]) => {
      const totalPax = Object.values(dep.byBP)
        .reduce((s, g) => s + g.bookings.reduce((ss, b) => ss + getPaxCount(b), 0), 0);

      html += `<div class="adm-org-dep">
        <div class="adm-org-dep__header">
          <div>
            <div class="adm-org-dep__title">${escHtml(dep.label)}</div>
            <div class="text-small text-muted">${Object.keys(dep.byBP).length} ponto(s) · ${totalPax} pessoa(s)</div>
          </div>
          <div style="display:flex;gap:8px;flex-shrink:0">
            <button class="adm-btn adm-btn--ghost adm-btn--sm org-csv-btn" data-dep="${escHtml(depId)}">⬇ CSV</button>
          </div>
        </div>`;

      Object.entries(dep.byBP).forEach(([, group]) => {
        const groupPax = group.bookings.reduce((s, b) => s + getPaxCount(b), 0);
        html += `<div class="adm-org-bp">
          <div class="adm-org-bp__header">
            <span class="adm-org-bp__name">${escHtml(group.label)}</span>
            <span class="adm-count">${groupPax} pax</span>
          </div>
          <table class="adm-table adm-table--compact">
            <thead><tr><th>Responsável</th><th>Telefone</th><th>Status</th><th class="text-center">Pax</th></tr></thead>
            <tbody>
              ${group.bookings.map(b => `<tr>
                <td style="font-weight:500;font-size:12px">${escHtml(b.customer_name ?? '—')}</td>
                <td style="font-size:12px;color:var(--adm-muted)">${escHtml(b.customer_phone ?? '—')}</td>
                <td>${badge(b.reservation_status)}</td>
                <td class="text-center"><span class="adm-badge-pax">${getPaxCount(b)}</span></td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
      });
      html += `</div>`;
    });

    $('organizar-body').innerHTML = html;

    // CSV export per departure
    $('organizar-body').querySelectorAll('.org-csv-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const dep = byDep[btn.dataset.dep];
        if (!dep) return;
        const rows = [['Responsável', 'E-mail', 'Telefone', 'Status', 'Ponto de embarque', 'Horário', 'Pax', 'Saída']];
        Object.values(dep.byBP).forEach(group => {
          group.bookings.forEach(b => {
            const bp = getBPDisplay(b);
            rows.push([b.customer_name ?? '', b.customer_email ?? '', b.customer_phone ?? '',
              b.reservation_status, bp.name, bp.time ?? '', getPaxCount(b), dep.label]);
          });
        });
        exportCsv(rows, `saida-${btn.dataset.dep.slice(0, 8)}.csv`);
      });
    });
  }

  // ── CSV helpers ────────────────────────────────────────────────────────────
  function exportCsv(rows, filename) {
    const csv  = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    toast('CSV exportado!', 'success');
  }

  $('res-export-csv').addEventListener('click', () => {
    const data = filtered();
    const rows = [['ID', 'Responsável', 'E-mail', 'Telefone', 'Experiência', 'Saída', 'Status',
      'Total', 'Pago', 'Saldo', 'Ponto de embarque', 'Horário embarque', 'Criado em']];
    data.forEach(b => {
      const bp = getBPDisplay(b);
      rows.push([b.id, b.customer_name ?? '', b.customer_email ?? '', b.customer_phone ?? '',
        getExpTitle(b), getDepDate(b), b.reservation_status,
        b.total_amount ?? 0, b.amount_paid ?? 0,
        Math.max(0, (b.total_amount ?? 0) - (b.amount_paid ?? 0)),
        bp.name, bp.time ?? '', b.created_at ?? '']);
    });
    exportCsv(rows, 'reservas.csv');
  });

  // ── Filter event bindings ──────────────────────────────────────────────────
  $('res-search').addEventListener('input', e => {
    filterSearch = e.target.value; updateClearBtn(); renderTable(filtered());
  });
  $('res-filter-exp').addEventListener('change', e => {
    filterExp = e.target.value; updateClearBtn(); renderTable(filtered());
  });
  $('res-filter-status').addEventListener('change', e => {
    filterStatus = e.target.value; updateClearBtn(); renderTable(filtered());
  });
  $('res-filter-pay').addEventListener('change', e => {
    filterPay = e.target.value; updateClearBtn(); renderTable(filtered());
  });
  $('res-clear-filters').addEventListener('click', () => {
    filterSearch = ''; filterExp = ''; filterStatus = ''; filterPay = '';
    $('res-search').value = '';
    $('res-filter-exp').value = '';
    $('res-filter-status').value = '';
    $('res-filter-pay').value = '';
    updateClearBtn();
    renderTable(filtered());
  });

  // ── Initial render ─────────────────────────────────────────────────────────
  renderTabs();
  renderTable(filtered());
  if (openId && allBookings.find(b => b.id === openId)) openDrawer(openId);
}

// ─────────────────────────────────────────────────────────────────────────────
//  MODULE: PARTICIPANTES
// ─────────────────────────────────────────────────────────────────────────────

async function renderParticipantes(root) {
  const db = window.anauaDb;
  const PROFILE_LABEL = { adult: 'Adulto', child: 'Criança', senior: 'Idoso', pcd: 'PCD' };
  const RES_STATUSES  = Object.keys(STATUS_TRANSITIONS);

  root.innerHTML = `
    <div class="adm-filter-bar" style="margin-bottom:16px">
      <input type="search" class="adm-input" id="part-search"
        placeholder="Buscar por nome ou CPF…" style="max-width:360px" />
      <span class="adm-filter-count" id="part-count"></span>
    </div>
    <div id="part-body"><div style="padding:40px;text-align:center;color:var(--adm-muted)">Carregando…</div></div>`;

  if (!db) return;

  // Detect current user role (for admin-only delete)
  let isAdmin = false;
  try {
    const { data: { user } } = await db.auth.getUser();
    if (user) {
      const { data: prof } = await db.from('profiles').select('role').eq('id', user.id).single();
      isAdmin = prof?.role === 'admin';
    }
  } catch (_) {}

  // ── Three-tier query strategy ────────────────────────────────────────────────
  let participants = [];

  async function tryLoadParticipants() {
    const { data: t1, error: e1 } = await db
      .from('participants')
      .select('id, full_name, document_number, profile_type, birthdate, reservation_id, reservations(id, reservation_status, customer_name, departure_id, experience_id, experiences(id, title), departures(id, start_at))')
      .order('full_name');
    if (!e1) return t1 ?? [];

    console.warn('[admin-parts] Tier-1 falhou:', e1.message);

    const [{ data: pFlat, error: e2 }, { data: resFlat }] = await Promise.all([
      db.from('participants').select('id, full_name, document_number, profile_type, birthdate, reservation_id').order('full_name'),
      db.from('reservations').select('id, reservation_status, customer_name, departure_id, experience_id').order('created_at', { ascending: false }),
    ]);
    if (!e2) {
      const resById = Object.fromEntries((resFlat ?? []).map(r => [r.id, r]));
      return (pFlat ?? []).map(p => ({ ...p, reservations: resById[p.reservation_id] ?? null }));
    }

    console.warn('[admin-parts] Tier-2 falhou:', e2.message);

    const [{ data: pMin, error: e3 }, { data: resMin }] = await Promise.all([
      db.from('participants').select('id, reservation_id').order('id'),
      db.from('reservations').select('id, reservation_status, customer_name, departure_id, experience_id').order('created_at', { ascending: false }),
    ]);
    if (e3) {
      $('part-body').innerHTML = `<div style="padding:40px;text-align:center;color:var(--adm-danger)">
        <strong>Tabela de participantes inacessível.</strong><br>
        Execute a migration <code>fix_schema_and_rls.sql</code> no Supabase SQL Editor e recarregue.
        <br><small style="color:var(--adm-muted)">${escHtml(e3.message)}</small></div>`;
      return null;
    }
    $('part-body').insertAdjacentHTML('afterbegin',
      `<div style="padding:10px 14px;margin-bottom:12px;background:#fff3cd;border:1px solid #ffd000;border-radius:6px;font-size:12px">
        ⚠️ <strong>Migration pendente:</strong> execute <code>fix_schema_and_rls.sql</code> no Supabase para ver todos os dados.
      </div>`);
    const resById = Object.fromEntries((resMin ?? []).map(r => [r.id, r]));
    return (pMin ?? []).map(p => ({ id: p.id, reservation_id: p.reservation_id,
      full_name: null, document_number: null, profile_type: null, birthdate: null,
      reservations: resById[p.reservation_id] ?? null }));
  }

  const loaded = await tryLoadParticipants();
  if (loaded === null) return;
  participants = loaded;

  // ── Status update handler (window-accessible for inline onchange) ────────────
  window._partSetStatus = async function(reservationId, sel) {
    const newStatus = sel.value;
    const prev = sel.dataset.prev;
    if (newStatus === prev) return;
    const { error } = await db.from('reservations')
      .update({ reservation_status: newStatus }).eq('id', reservationId);
    if (error) {
      toast('Erro ao atualizar status: ' + error.message, 'error');
      sel.value = prev;
      return;
    }
    sel.dataset.prev = newStatus;
    sel.className = `part-status-sel badge ${STATUS_CLASS[newStatus] ?? 'badge--draft'}`;
    // Update local cache
    participants.forEach(p => {
      if (p.reservation_id === reservationId && p.reservations)
        p.reservations.reservation_status = newStatus;
    });
    toast(`Status → ${STATUS_LABEL[newStatus] ?? newStatus}`, 'success');
  };

  // ── Delete participant handler (admin-only) ──────────────────────────────────
  window._partDelete = async function(participantId, name) {
    if (!isAdmin) { toast('Apenas administradores podem excluir participantes.', 'error'); return; }
    if (!confirm(`Excluir "${name}"?\n\nEsta ação é permanente e não pode ser desfeita.`)) return;
    const { error } = await db.from('participants').delete().eq('id', participantId);
    if (error) { toast('Erro: ' + error.message, 'error'); return; }
    participants = participants.filter(p => p.id !== participantId);
    renderGroups(participants);
    toast(`"${name}" removido.`, 'success');
  };

  // ── Grouping ──────────────────────────────────────────────────────────────────
  function buildGroups(list) {
    const byExp = {};
    list.forEach(p => {
      const res      = p.reservations;
      const expId    = res?.experience_id ?? res?.experiences?.id ?? '_unknown';
      const expTitle = res?.experiences?.title ?? expMap[expId] ?? '(Experiência desconhecida)';
      const depId    = res?.departure_id ?? '_unknown';
      const startAt  = res?.departures?.start_at ?? depMap[depId]?.start_at ?? null;
      if (!byExp[expId]) byExp[expId] = { title: expTitle, deps: {} };
      if (!byExp[expId].deps[depId]) byExp[expId].deps[depId] = { start_at: startAt, parts: [] };
      byExp[expId].deps[depId].parts.push(p);
    });
    return byExp;
  }

  function renderGroups(list) {
    $('part-count').textContent = `${list.length} participante(s)`;
    if (!list.length) {
      $('part-body').innerHTML = `<div class="adm-empty"><div class="adm-empty__icon">👥</div><div class="adm-empty__title">Nenhum participante encontrado</div></div>`;
      return;
    }
    const groups = buildGroups(list);
    const extraTh = isAdmin ? `<th style="width:36px"></th>` : '';
    const html = Object.entries(groups).map(([expId, exp]) => {
      const depSections = Object.entries(exp.deps)
        .sort(([, a], [, b]) => (a.start_at ?? '').localeCompare(b.start_at ?? ''))
        .map(([depId, dep]) => {
          const depLabel = dep.start_at ? fmtDate(dep.start_at.split('T')[0]) : 'Saída não informada';
          const rows = dep.parts.map(p => {
            const resStatus = p.reservations?.reservation_status ?? 'pending_payment';
            const resId     = p.reservations?.id ?? p.reservation_id ?? '';
            const statusSel = resId ? `
              <select class="part-status-sel badge ${STATUS_CLASS[resStatus]??'badge--draft'}"
                data-prev="${resStatus}"
                onchange="_partSetStatus('${resId}',this)">
                ${RES_STATUSES.map(s => `<option value="${s}"${resStatus===s?' selected':''}>${STATUS_LABEL[s]??s}</option>`).join('')}
              </select>` : badge(resStatus);

            const delBtn = isAdmin ? `
              <button class="part-del-btn" title="Excluir participante"
                onclick="_partDelete('${p.id}',${JSON.stringify(p.full_name??'—')})">
                ${WL_SVG_TRASH}
              </button>` : '';

            return `
              <tr>
                <td style="font-weight:500;font-size:12px">${escHtml(p.full_name ?? '—')}</td>
                <td style="font-size:11px;font-family:monospace;color:var(--adm-muted)">${p.document_number ? fmtCpfAdmin(p.document_number) : '—'}</td>
                <td style="font-size:12px">${escHtml(PROFILE_LABEL[p.profile_type] ?? p.profile_type ?? '—')}</td>
                <td style="font-size:11px;color:var(--adm-muted)">${p.birthdate ? fmtDate(p.birthdate) : '—'}</td>
                <td style="font-size:11px">${statusSel}</td>
                ${isAdmin ? `<td style="text-align:center">${delBtn}</td>` : ''}
              </tr>`;
          }).join('');
          return `
            <div style="margin-bottom:16px">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                <span style="font-size:12px;font-weight:600;color:var(--adm-text-2)">📅 ${escHtml(depLabel)}</span>
                <span class="adm-count">${dep.parts.length} pax</span>
              </div>
              <table class="adm-table adm-table--compact">
                <thead><tr><th>Nome</th><th>CPF</th><th>Perfil</th><th>Nascimento</th><th>Status reserva</th>${extraTh}</tr></thead>
                <tbody>${rows}</tbody>
              </table>
            </div>`;
        }).join('');
      return `
        <div class="adm-card" style="margin-bottom:20px">
          <div style="padding:14px 18px 10px;border-bottom:1px solid var(--adm-border,#e5e7eb);display:flex;align-items:center;justify-content:space-between">
            <span style="font-size:15px;font-weight:700">${escHtml(exp.title)}</span>
            <span class="adm-count">${Object.values(exp.deps).reduce((s,d) => s + d.parts.length, 0)} participante(s)</span>
          </div>
          <div style="padding:14px 18px">${depSections}</div>
        </div>`;
    }).join('');
    $('part-body').innerHTML = html;
  }

  renderGroups(participants);

  $('part-search')?.addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    const filtered = !q ? participants : participants.filter(p =>
      (p.full_name ?? '').toLowerCase().includes(q) ||
      (p.document_number ?? '').includes(q.replace(/\D/g,''))
    );
    renderGroups(filtered);
  });
}
// ─────────────────────────────────────────────────────────────────────────────
//  MODULE: FINANCEIRO
// ─────────────────────────────────────────────────────────────────────────────

async function renderFinanceiro(root) {
  let allPayments   = [];
  let allReservations = [];
  let activeTab     = 'all';

  const TABS = [
    { key: 'all',       label: 'Todos'                },
    { key: 'paid',      label: 'Pagos'                },
    { key: 'pending',   label: 'Pendentes'            },
    { key: 'cancelled', label: 'Cancelados/Créditos'  },
  ];

  root.innerHTML = `
    <div class="adm-kpi-row" id="fin-kpi-row">
      ${kpi('Carregando…','…','pagamentos','green','<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg>')}
    </div>
    <div class="adm-card">
      <div class="adm-tabs" id="fin-tabs"></div>
      <div style="padding:12px 16px;display:flex;justify-content:flex-end;gap:8px">
        <button class="adm-btn adm-btn--secondary adm-btn--sm" id="fin-export">⬇ Exportar CSV</button>
      </div>
      <div class="adm-table-wrap">
        <table class="adm-table">
          <thead><tr><th>Código</th><th>Responsável</th><th>Experiência</th><th>Método</th><th>Valor</th><th>Status pag.</th><th>Data pag.</th><th>Status reserva</th></tr></thead>
          <tbody id="fin-tbody"><tr><td colspan="8" class="adm-table__empty text-muted">Carregando…</td></tr></tbody>
        </table>
      </div>
    </div>`;

  const db = window.anauaDb;
  if (db) {
    const [paymentsRes, reservationsRes] = await Promise.all([
      db.from('payments').select('id, reservation_id, amount, method, status, paid_at, reservations(experience_id, reservation_status)').order('paid_at', { ascending: false }),
      db.from('reservations').select('id, total_amount, amount_paid, reservation_status').order('created_at', { ascending: false }),
    ]);
    if (!paymentsRes.error) {
      allPayments = paymentsRes.data ?? [];
      console.log('[admin-db] Pagamentos carregados:', allPayments.length);
    } else {
      console.warn('[admin-db] Erro ao carregar pagamentos:', paymentsRes.error.message);
    }
    if (!reservationsRes.error) {
      allReservations = reservationsRes.data ?? [];
    }
  }

  const totalPaid      = allPayments.filter(p => p.status === 'paid').reduce((s, p) => s + Number(p.amount ?? 0), 0);
  const totalPending   = allReservations.reduce((s, r) => s + Math.max(0, Number(r.total_amount ?? 0) - Number(r.amount_paid ?? 0)), 0);
  const totalCancelled = allReservations.filter(r => r.reservation_status === 'cancelled').reduce((s, r) => s + Number(r.amount_paid ?? 0), 0);

  document.getElementById('fin-kpi-row').innerHTML =
    kpi('Total recebido',      fmt(totalPaid),      'pagamentos confirmados',     'green',  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>') +
    kpi('A receber',           fmt(totalPending),   'saldo pendente',             'gold',   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>') +
    kpi('Cancelados/Créditos', fmt(totalCancelled), 'valor pago em canceladas',   'red',    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>') +
    kpi('Total de pagamentos', allPayments.length,  'registros na tabela',        'purple', '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg>');

  function tabPayments(key) {
    if (key === 'paid')      return allPayments.filter(p => p.status === 'paid');
    if (key === 'pending')   return allPayments.filter(p => p.status !== 'paid' && p.status !== 'cancelled');
    if (key === 'cancelled') return allPayments.filter(p => p.reservations?.reservation_status === 'cancelled');
    return allPayments;
  }

  function renderTabs() {
    document.getElementById('fin-tabs').innerHTML = TABS.map(t => `
      <button class="adm-tab ${activeTab === t.key ? 'is-active' : ''}" data-ftab="${t.key}">
        ${t.label} <span class="adm-count">${tabPayments(t.key).length}</span>
      </button>`).join('');
    document.getElementById('fin-tabs').querySelectorAll('[data-ftab]').forEach(btn => {
      btn.addEventListener('click', () => { activeTab = btn.dataset.ftab; renderTabs(); renderFTable(tabPayments(activeTab)); });
    });
  }

  function renderFTable(data) {
    $('fin-tbody').innerHTML = data.length ? data.map(p => {
      const r = p.reservations ?? {};
      return `<tr>
        <td class="text-small text-muted no-wrap">${escHtml(p.reservation_id ?? '—')}</td>
        <td>
          <div class="text-bold text-muted">—</div>
        </td>
        <td class="text-small">${escHtml(r.experience_id ?? '—')}</td>
        <td class="text-small">${payMethodLabel(p.payment_method ?? p.method)}</td>
        <td class="text-bold no-wrap">${fmt(p.amount ?? 0)}</td>
        <td>${badge(p.status ?? 'pending_payment')}</td>
        <td class="text-small text-muted no-wrap">${p.paid_at ? fmtDateShort(p.paid_at) : '—'}</td>
        <td>${badge(r.reservation_status ?? 'pending_payment')}</td>
      </tr>`;
    }).join('') : `<tr><td colspan="8" class="adm-table__empty text-muted">Nenhuma transação.</td></tr>`;
  }

  renderTabs();
  renderFTable(tabPayments(activeTab));

  $('fin-export').addEventListener('click', () => {
    const cols = ['Código','Experiência','Método','Valor','Status pag.','Data pag.','Status reserva'];
    const rows = tabPayments(activeTab).map(p => {
      const r = p.reservations ?? {};
      return [p.reservation_id, r.experience_id ?? '', p.method ?? p.payment_method ?? '', p.amount ?? 0, p.status ?? '', p.paid_at ?? '', r.reservation_status ?? '']
        .map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });
    const csv = [cols.join(','), ...rows].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `anaua-financeiro-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast('CSV exportado com sucesso!', 'success');
  });
}


// ─────────────────────────────────────────────────────────────────────────────
//  MODULE: CONFIGURAÇÕES
// ─────────────────────────────────────────────────────────────────────────────

async function renderConfiguracoes(root) {
  root.innerHTML = `
    <div style="max-width:680px">
      <div class="adm-card" style="padding:var(--adm-sp-6);text-align:center">
        <p class="text-muted">Carregando configurações…</p>
      </div>
    </div>`;

  const db = window.anauaDb;
  if (!db) {
    root.innerHTML = `<div class="adm-empty"><p style="color:var(--adm-danger)">Supabase não disponível.</p></div>`;
    return;
  }

  const { data, error } = await db
    .from('app_settings')
    .select('key, value, updated_at')
    .eq('key', 'company_settings')
    .maybeSingle();

  const cfg = (error || !data) ? {} : (data.value ?? {});
  const res = cfg.reservations ?? {};
  const ntf = cfg.notifications ?? {};

  if (error) {
    // PGRST116 = row not found — first-time use, show empty form
    console.warn('[admin-settings] Erro ao carregar configurações:', error.message);
    root.innerHTML = `
      <div class="adm-empty" style="padding:var(--adm-sp-8);text-align:center">
        <p style="color:var(--adm-danger);font-weight:600">Não foi possível carregar as configurações.</p>
        <p class="text-muted text-small">${error.message}</p>
        <button class="adm-btn adm-btn--primary" style="margin-top:16px" onclick="navigate('#configuracoes')">Tentar novamente</button>
      </div>`;
    return;
  }

  if (data?.updated_at) {
    console.log('[admin-settings] Configurações carregadas do Supabase — atualizado em:', data.updated_at);
  } else {
    console.log('[admin-settings] Configurações carregadas do Supabase — nenhum registro ainda, usando padrões');
  }

  root.innerHTML = `
    <div style="max-width:680px">

      <div class="adm-config-section">
        <div class="adm-config-section__title">Empresa</div>
        <div class="adm-config-section__body">
          <div class="adm-field">
            <label for="cfg-company-name">Nome da empresa</label>
            <input id="cfg-company-name" class="adm-input" value="${escHtml(cfg.company_name ?? '')}" placeholder="Anauá Ecoturismo" />
          </div>
          <div class="adm-grid-2">
            <div class="adm-field">
              <label for="cfg-contact-email">E-mail de contato</label>
              <input id="cfg-contact-email" class="adm-input" type="email" value="${escHtml(cfg.contact_email ?? '')}" placeholder="contato@anaua.com.br" />
            </div>
            <div class="adm-field">
              <label for="cfg-whatsapp">WhatsApp</label>
              <input id="cfg-whatsapp" class="adm-input" value="${escHtml(cfg.whatsapp ?? '')}" placeholder="(21) 99000-0000" />
            </div>
          </div>
          <div class="adm-field">
            <label for="cfg-cnpj">CNPJ</label>
            <input id="cfg-cnpj" class="adm-input" value="${escHtml(cfg.cnpj ?? '')}" placeholder="00.000.000/0001-00" />
          </div>
        </div>
      </div>

      <div class="adm-config-section">
        <div class="adm-config-section__title">Reservas</div>
        <div class="adm-config-section__body">
          ${configRow('cfg-auto-confirm',      'Confirmação automática',        'Confirmar reservas automaticamente após pagamento',     res.auto_confirm_after_payment ?? true)}
          ${configRow('cfg-voucher-email',     'Enviar voucher por e-mail',     'E-mail com voucher ao responsável após pagamento',      res.send_voucher_email ?? true)}
          ${configRow('cfg-signal-balance',    'Permitir sinal + saldo',        'Habilitar pagamento em duas etapas',                    res.allow_signal_balance ?? true)}
          ${configRow('cfg-image-consent',     'Aceite de imagem obrigatório',  'Tornar consentimento de imagem obrigatório',            res.image_consent_required ?? false)}
        </div>
      </div>

      <div class="adm-config-section">
        <div class="adm-config-section__title">Notificações</div>
        <div class="adm-config-section__body">
          ${configRow('cfg-notif-booking',     'Nova reserva',                  'Notificar ao criar nova reserva',                      ntf.new_booking ?? true)}
          ${configRow('cfg-notif-payment',     'Pagamento recebido',            'Notificar ao registrar pagamento',                     ntf.payment_received ?? true)}
          ${configRow('cfg-notif-overdue',     'Saldo vencido',                 'Alertar quando saldo ultrapassar vencimento',           ntf.overdue_balance ?? true)}
          ${configRow('cfg-notif-departure',   'Saída próxima (48h)',           'Lembrete 48h antes de cada saída',                     ntf.departure_48h ?? false)}
        </div>
      </div>

      <div class="adm-config-section">
        <div class="adm-config-section__body" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
          <span class="text-small text-muted" id="cfg-last-saved">
            ${data?.updated_at ? 'Última atualização: ' + fmtDateShort(data.updated_at) : 'Ainda não salvo no banco.'}
          </span>
          <button id="cfg-save-btn" class="adm-btn adm-btn--primary">Salvar configurações</button>
        </div>
      </div>

    </div>`;

  document.getElementById('cfg-save-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('cfg-save-btn');
    btn.disabled = true;
    btn.textContent = 'Salvando…';
    console.log('[admin-settings] Salvando configurações');

    const newCfg = {
      company_name:   document.getElementById('cfg-company-name')?.value.trim()  ?? '',
      contact_email:  document.getElementById('cfg-contact-email')?.value.trim() ?? '',
      whatsapp:       document.getElementById('cfg-whatsapp')?.value.trim()       ?? '',
      cnpj:           document.getElementById('cfg-cnpj')?.value.trim()           ?? '',
      reservations: {
        auto_confirm_after_payment: document.getElementById('cfg-auto-confirm')?.checked    ?? true,
        send_voucher_email:         document.getElementById('cfg-voucher-email')?.checked   ?? true,
        allow_signal_balance:       document.getElementById('cfg-signal-balance')?.checked  ?? true,
        image_consent_required:     document.getElementById('cfg-image-consent')?.checked   ?? false,
      },
      notifications: {
        new_booking:      document.getElementById('cfg-notif-booking')?.checked    ?? true,
        payment_received: document.getElementById('cfg-notif-payment')?.checked    ?? true,
        overdue_balance:  document.getElementById('cfg-notif-overdue')?.checked    ?? true,
        departure_48h:    document.getElementById('cfg-notif-departure')?.checked  ?? false,
      },
    };

    try {
      const { data: { user } } = await db.auth.getUser();

      const { error: saveErr } = await db
        .from('app_settings')
        .upsert({
          key:        'company_settings',
          value:      newCfg,
          updated_by: user?.id ?? null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'key' });

      if (saveErr) {
        console.error('[admin-settings] Erro ao salvar configurações:', saveErr.message);
        toast('Não foi possível salvar as configurações.', 'error');
        btn.disabled = false;
        btn.textContent = 'Salvar configurações';
        return;
      }

      console.log('[admin-settings] Configurações salvas com sucesso');
      toast('Configurações salvas com sucesso.', 'success');

      // Confirm persistence — reload updated_at
      const { data: reloaded } = await db
        .from('app_settings')
        .select('updated_at')
        .eq('key', 'company_settings')
        .maybeSingle();

      const savedEl = document.getElementById('cfg-last-saved');
      if (savedEl && reloaded?.updated_at) {
        savedEl.textContent = 'Última atualização: ' + fmtDateShort(reloaded.updated_at);
      }
    } catch (err) {
      console.error('[admin-settings] Erro inesperado:', err);
      toast('Não foi possível salvar as configurações.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Salvar configurações';
    }
  });
}

function configRow(id, label, desc, checked) {
  return `<div class="adm-config-row">
    <div class="adm-config-row__info">
      <div class="adm-config-row__label">${label}</div>
      <div class="adm-config-row__desc">${desc}</div>
    </div>
    <label class="adm-toggle">
      <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} />
      <span class="adm-toggle__track"></span>
    </label>
  </div>`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
        <dt>Data</dt><dd>${exit ? fmtDate(exit.start_at) : '—'}</dd>
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

async function openExitDrawer(exitId) {
  const ref = findExit(exitId);
  if (!ref) { toast('Saída não encontrada no cache. Recarregue a lista.', 'error'); return; }
  const { exp, exit } = ref;

  // ─── Status metadata ───────────────────────────────────────────────────────
  const STATUS = {
    scheduled: { cls: 'active',    label: 'Aberta' },
    sold_out:  { cls: 'soldout',   label: 'Esgotada' },
    cancelled: { cls: 'cancelled', label: 'Cancelada' },
    completed: { cls: 'completed', label: 'Concluída' },
  };
  const { cls: st, label: stLabel } = STATUS[exit.status] ?? { cls: 'draft', label: exit.status };

  // Show drawer with skeleton while loading
  const db = window.anauaDb;
  const drawerTitle = `${exp.title} — ${exit.start_at ? new Date(exit.start_at).toLocaleDateString('pt-BR', { day:'2-digit', month:'short', year:'numeric' }).replace('.','') : ''}`;
  openDrawer(drawerTitle, `<div class="exit-drawer-loading">Carregando…</div>`);

  // ─── Parallel data load ────────────────────────────────────────────────────
  const [{ data: bps }, reservationsResult] = await Promise.all([
    listAllBoardingPointsByDeparture(exit.id),
    (async () => {
      if (!db) return { data: [], error: null };
      return db.from('reservations')
        .select('id, customer_name, customer_phone, customer_email, reservation_status, total_amount, amount_paid, payment_method, boarding_point_id, participants(id, full_name, document_number)')
        .eq('departure_id', exit.id)
        .order('created_at', { ascending: true });
    })(),
  ]);

  const reservations = reservationsResult.data ?? [];
  const occupied = reservations
    .filter(r => !['cancelled','refunded'].includes(r.reservation_status))
    .reduce((s, r) => s + (r.participants?.length ?? 0), 0);
  const available = Math.max(0, (exit.capacity ?? 0) - occupied);
  const capPct    = exit.capacity > 0 ? Math.min(100, Math.round(occupied / exit.capacity * 100)) : 0;
  const fullness  = capPct >= 100 ? 'full' : capPct >= 75 ? 'high' : capPct >= 50 ? 'mid' : 'low';

  // ─── Boarding points HTML ──────────────────────────────────────────────────
  const bpMap = {};
  (bps ?? []).forEach(bp => { bpMap[bp.id] = bp; });

  const bpsHtml = bps?.length
    ? bps.map(bp => {
        const pickupStr = bp.pickupAt
          ? new Date(bp.pickupAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
          : null;
        const inactiveTag = bp.isActive ? '' : `<span class="exit-bp__inactive-tag">inativo</span>`;
        return `
          <div class="exit-bp-card${bp.isActive ? '' : ' exit-bp-card--inactive'}">
            <div class="exit-bp-card__header">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
              <span class="exit-bp-card__name">${escHtml(bp.displayName)}</span>
              ${inactiveTag}
              ${pickupStr ? `<span class="exit-bp-card__time">🕐 ${pickupStr}</span>` : ''}
            </div>
            ${bp.displayAddress ? `<div class="exit-bp-card__addr">${escHtml(bp.displayAddress)}</div>` : ''}
            ${bp.notes ? `<div class="exit-bp-card__notes">${escHtml(bp.notes)}</div>` : ''}
          </div>`;
      }).join('')
    : '<p class="text-muted text-small">Nenhum ponto de embarque cadastrado.</p>';

  // ─── Reservations / Boarding list data ───────────────────────────────────
  const RES_STATUS = {
    pending:         { cls: 'badge--pending',   label: 'Pendente' },
    pending_payment: { cls: 'badge--pending',   label: 'Ag. Pagamento' },
    reserved:        { cls: 'badge--reserved',  label: 'Reservado' },
    confirmed:       { cls: 'badge--confirmed', label: 'Confirmado' },
    cancelled:       { cls: 'badge--cancelled', label: 'Cancelado' },
    refunded:        { cls: 'badge--cancelled', label: 'Estornado' },
  };
  const PAY_STATUS = (r) => {
    const paid = r.amount_paid ?? 0;
    const total = r.total_amount ?? 0;
    if (paid <= 0)     return { cls: 'badge--pending', label: 'Não pago' };
    if (paid >= total) return { cls: 'badge--paid',    label: 'Pago' };
    return { cls: 'badge--pending', label: 'Parcial' };
  };

  const activeRes    = reservations.filter(r => !['cancelled','refunded'].includes(r.reservation_status));
  const cancelledRes = reservations.filter(r => ['cancelled','refunded'].includes(r.reservation_status));

  // ─── Boarding list builder ────────────────────────────────────────────────
  // bpMap: departure_boarding_points.id → normalized bp object
  // Group active reservations by their chosen departure_boarding_points.id
  const BL_NO_POINT = '__sem_ponto__';

  // Build an ordered list of groups: one per bp (preserving order), plus
  // a trailing "no point" bucket if needed.
  const bpGroupMap = new Map(); // bpId → { bp, reservations[] }
  (bps ?? []).forEach(bp => bpGroupMap.set(bp.id, { bp, reservations: [] }));
  bpGroupMap.set(BL_NO_POINT, { bp: null, reservations: [] });

  activeRes.forEach(r => {
    const key = r.boarding_point_id ?? BL_NO_POINT;
    if (!bpGroupMap.has(key)) bpGroupMap.set(key, { bp: null, reservations: [] });
    bpGroupMap.get(key).reservations.push(r);
  });

  // fmtCpf already exists (fmtCpfAdmin) — fallback inline to avoid dependency
  function _fmtCpf(v) {
    if (!v) return null;
    const d = String(v).replace(/\D/g, '');
    if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    return v;
  }

  // Flatten all active participants list for global counter
  let globalPaxIdx = 0;

  function buildBoardingGroup(key, { bp, reservations: groupRes }, isFirst) {
    const pickupStr = bp?.pickupAt
      ? new Date(bp.pickupAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : null;
    const bpName    = bp ? bp.displayName  : 'Ponto de embarque não definido';
    const bpAddr    = bp ? bp.displayAddress : null;
    const groupId   = `blg-${key.replace(/[^a-z0-9]/gi, '_')}`;

    const paxRows = groupRes.flatMap(r =>
      (r.participants ?? []).map(p => ({ p, r }))
    );

    const itemsHtml = paxRows.length
      ? paxRows.map(({ p, r }) => {
          globalPaxIdx++;
          const idx     = globalPaxIdx;
          const name    = p.full_name ?? r.customer_name ?? '—';
          const cpf     = _fmtCpf(p.document_number) ?? null;
          const phone   = r.customer_phone ?? null;
          const resCode = r.id?.slice(0, 8).toUpperCase();
          const rs      = RES_STATUS[r.reservation_status] ?? { cls: 'badge--draft', label: r.reservation_status };
          const pay     = PAY_STATUS(r);
          return `
            <div class="bl-pax-row">
              <span class="bl-pax-row__idx">${idx}</span>
              <div class="bl-pax-row__body">
                <span class="bl-pax-row__name">${escHtml(name)}</span>
                <div class="bl-pax-row__meta">
                  ${cpf   ? `<span class="bl-pax-row__detail">CPF: ${escHtml(cpf)}</span>` : '<span class="bl-pax-row__detail bl-pax-row__detail--missing">CPF não informado</span>'}
                  ${phone ? `<span class="bl-pax-row__detail">Tel: ${escHtml(phone)}</span>` : ''}
                  <span class="bl-pax-row__res">#${resCode}</span>
                  <span class="badge ${rs.cls}" style="font-size:10px">${rs.label}</span>
                  <span class="badge ${pay.cls}" style="font-size:10px">${pay.label}</span>
                </div>
              </div>
              <label class="bl-pax-row__check" title="Marcado como embarcado">
                <input type="checkbox" class="bl-pax-checkin" data-pax="${p.id}" aria-label="Embarcou" />
              </label>
            </div>`;
        }).join('')
      : `<div class="bl-empty-group">Nenhum participante neste ponto.</div>`;

    const copyBtnId = `bl-copy-group-${key.replace(/[^a-z0-9]/gi, '_')}`;
    return `
      <div class="bl-group" id="${groupId}" data-key="${escHtml(key)}">
        <div class="bl-group__header">
          <div class="bl-group__info">
            <div class="bl-group__name">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
              ${escHtml(bpName)}
              <span class="bl-group__pax-count">${paxRows.length} pax</span>
            </div>
            ${pickupStr ? `<div class="bl-group__time">🕐 Embarque: <strong>${pickupStr}</strong></div>` : ''}
            ${bpAddr    ? `<div class="bl-group__addr">${escHtml(bpAddr)}</div>` : ''}
          </div>
          <button class="adm-btn adm-btn--ghost adm-btn--sm bl-copy-group-btn" id="${copyBtnId}" title="Copiar lista deste ponto">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            Copiar grupo
          </button>
        </div>
        <div class="bl-pax-list">${itemsHtml}</div>
      </div>`;
  }

  // Build all groups HTML (reset global counter first)
  globalPaxIdx = 0;
  const boardingGroupsHtml = [...bpGroupMap.entries()]
    .map(([key, grp], i) => {
      // Skip BL_NO_POINT bucket if empty
      if (key === BL_NO_POINT && grp.reservations.length === 0) return '';
      return buildBoardingGroup(key, grp, i === 0);
    }).join('');

  const totalActivePax = activeRes.reduce((s, r) => s + (r.participants?.length ?? 0), 0);

  const boardingListHtml = activeRes.length === 0
    ? `<div class="bl-empty">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
        <span>Nenhuma reserva ativa nesta saída.</span>
       </div>`
    : boardingGroupsHtml;

  // ─── Markdown generator ───────────────────────────────────────────────────
  function buildMarkdown(filterKey) {
    const dtMd = exit.start_at
      ? new Date(exit.start_at).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '—';
    const statusLabelMd = STATUS[exit.status]?.label ?? exit.status;

    const groups = [...bpGroupMap.entries()].filter(([key, grp]) => {
      if (filterKey && key !== filterKey) return false;
      if (key === BL_NO_POINT && grp.reservations.length === 0) return false;
      return true;
    });

    let idx = 0;
    const groupLines = groups.map(([key, { bp, reservations: groupRes }]) => {
      const bpName    = bp ? bp.displayName  : 'Ponto de embarque não definido';
      const bpAddr    = bp ? bp.displayAddress : null;
      const pickupStr = bp?.pickupAt
        ? new Date(bp.pickupAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        : null;

      const paxRows = groupRes.flatMap(r => (r.participants ?? []).map(p => ({ p, r })));
      const paxLines = paxRows.map(({ p, r }) => {
        idx++;
        const name    = p.full_name ?? r.customer_name ?? '—';
        const cpf     = _fmtCpf(p.document_number) ?? 'não informado';
        const phone   = r.customer_phone ?? 'não informado';
        const resCode = r.id?.slice(0, 8).toUpperCase();
        return `- [ ] ${idx}. ${name} — CPF: ${cpf} — Tel: ${phone} — Reserva: #${resCode}`;
      }).join('\n') || '_(nenhum participante)_';

      const header = filterKey
        ? `## ${bpName}${pickupStr ? ` — ${pickupStr}` : ''}`
        : `## ${bpName}${pickupStr ? ` — ${pickupStr}` : ''}`;
      const addrLine = bpAddr ? `Endereço: ${bpAddr}` : '';

      return [header, addrLine, paxLines].filter(Boolean).join('\n');
    }).join('\n\n');

    // Pending/incomplete
    const pendencias = activeRes
      .filter(r => (r.participants ?? []).some(p => !p.full_name || !p.document_number))
      .flatMap(r => (r.participants ?? [])
        .filter(p => !p.full_name || !p.document_number)
        .map(p => `- #${r.id?.slice(0,8).toUpperCase()} ${r.customer_name ?? '?'}: dados incompletos (${!p.full_name ? 'nome' : ''}${!p.full_name && !p.document_number ? ', ' : ''}${!p.document_number ? 'CPF' : ''})`)
      );

    const header = filterKey ? '' : [
      `# Lista de embarque — ${exp.title}`,
      `Data: ${dtMd}`,
      `Status: ${statusLabelMd}`,
      `Ocupação: ${totalActivePax}/${exit.capacity ?? '?'}`,
      '',
    ].join('\n');

    const footer = pendencias.length
      ? `\n\nPendências:\n${pendencias.join('\n')}`
      : '';

    return (header + groupLines + footer).trim();
  }

  // ─── Reservations mini-cards (existing section kept compact) ─────────────
  function resCard(r) {
    const rs  = RES_STATUS[r.reservation_status] ?? { cls: 'badge--draft', label: r.reservation_status };
    const pay = PAY_STATUS(r);
    const pax = r.participants?.length ?? '?';
    const short = r.id?.slice(0, 8).toUpperCase();
    return `
      <div class="exit-res-card">
        <div class="exit-res-card__top">
          <span class="exit-res-card__name">${escHtml(r.customer_name ?? '—')}</span>
          <span class="exit-res-card__code text-muted">#${short}</span>
        </div>
        <div class="exit-res-card__meta">
          <span class="badge ${rs.cls}">${rs.label}</span>
          <span class="badge ${pay.cls}">${pay.label}</span>
          <span class="exit-res-card__pax">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
            ${pax} pax
          </span>
          ${r.customer_phone ? `<span class="exit-res-card__contact">${escHtml(r.customer_phone)}</span>` : ''}
        </div>
      </div>`;
  }

  const resHtml = !reservations.length
    ? `<p class="text-muted text-small" style="padding:8px 0">Nenhuma reserva nesta saída.</p>`
    : `${activeRes.length ? activeRes.map(resCard).join('') : ''}
       ${cancelledRes.length ? `
         <details class="exit-res-cancelled-details">
           <summary class="text-muted text-small">${cancelledRes.length} reserva(s) cancelada(s)</summary>
           <div style="margin-top:8px">${cancelledRes.map(resCard).join('')}</div>
         </details>` : ''}`;

  // ─── Actions ──────────────────────────────────────────────────────────────
  const canReopen   = exit.status !== 'scheduled';
  const canSoldOut  = exit.status === 'scheduled';
  const canCancel   = exit.status !== 'cancelled';

  const actionsHtml = `
    <button class="adm-btn adm-btn--secondary" id="exit-edit-btn">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      Editar saída
    </button>
    ${canReopen ? `
      <button class="adm-btn adm-btn--secondary" data-set-status="scheduled">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
        Reabrir saída
      </button>` : ''}
    ${canSoldOut ? `
      <button class="adm-btn adm-btn--secondary" data-set-status="sold_out">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
        Marcar como esgotada
      </button>` : ''}
    ${!['cancelled', 'completed'].includes(exit.status) ? `
      <button class="adm-btn adm-btn--secondary" id="exit-extend-btn">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Estender saída
      </button>` : ''}
    ${canCancel ? `
      <button class="adm-btn adm-btn--danger exit-cancel-btn" data-set-status="cancelled">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
        Cancelar saída
      </button>` : ''}
    ${exit.status === 'cancelled' ? `
      <button class="adm-btn adm-btn--danger" id="exit-delete-btn">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        Excluir saída permanentemente
      </button>` : ''}`;

  // ─── Date display ──────────────────────────────────────────────────────────
  const dtDisplay = exit.start_at
    ? new Date(exit.start_at).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',  hour: '2-digit', minute: '2-digit' })
    : '—';

  // ─── Final HTML ────────────────────────────────────────────────────────────
  const html = `
    <div class="exit-drawer-header">
      <div class="exit-drawer-header__exp">${escHtml(exp.title)}</div>
      <div class="exit-drawer-header__date">${escHtml(dtDisplay)}</div>
      ${exit.title ? `<div class="exit-drawer-header__title">"${escHtml(exit.title)}"</div>` : ''}
      <span class="badge badge--${st} exit-drawer-header__badge">${stLabel}</span>
    </div>

    <div class="exit-stats">
      <div class="exit-stat">
        <div class="exit-stat__val">${exit.capacity ?? '—'}</div>
        <div class="exit-stat__lbl">Total</div>
      </div>
      <div class="exit-stat exit-stat--occ">
        <div class="exit-stat__val">${occupied}</div>
        <div class="exit-stat__lbl">Ocupadas</div>
      </div>
      <div class="exit-stat exit-stat--avail exit-stat--${fullness}">
        <div class="exit-stat__val">${available}</div>
        <div class="exit-stat__lbl">Disponíveis</div>
      </div>
      <div class="exit-stat exit-stat--price">
        <div class="exit-stat__val">${exit.price != null ? fmt(exit.price) : '—'}</div>
        <div class="exit-stat__lbl">Valor/pax</div>
      </div>
    </div>
    <div class="exit-occ-bar-wrap">
      <div class="saida-occ-bar saida-occ-bar--lg" title="${capPct}% ocupado">
        <div class="saida-occ-bar__fill saida-occ-bar--${fullness}" style="width:${capPct}%"></div>
      </div>
      <span class="text-muted" style="font-size:11px">${capPct}% ocupado</span>
    </div>

    <div class="adm-section">
      <div class="adm-section__title">Pontos de embarque (${bps?.length ?? 0})</div>
      <div class="exit-bp-list">${bpsHtml}</div>
    </div>

    <div class="adm-section">
      <div class="adm-section__title">
        Reservas nesta saída
        <span class="badge badge--draft">${activeRes.length}</span>
      </div>
      <div class="exit-res-list">${resHtml}</div>
    </div>

    <div class="adm-section">
      <div class="adm-section__title">
        Lista de embarque
        <span class="badge badge--draft">${totalActivePax} pax</span>
      </div>
      <div class="bl-toolbar">
        <div class="bl-summary">
          <span>${totalActivePax} participantes · ${available} vagas disponíveis</span>
        </div>
        <button class="adm-btn adm-btn--secondary adm-btn--sm" id="bl-copy-all-btn">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          Copiar lista completa
        </button>
      </div>
      <div class="bl-groups" id="bl-groups-container">
        ${boardingListHtml}
      </div>
    </div>

    <div class="adm-section">
      <div class="adm-section__title">Ações</div>
      <div class="exit-actions">${actionsHtml}</div>
    </div>
  `;

  // Re-open drawer with full content
  openDrawer(drawerTitle, html);

  // ─── Copy helpers ──────────────────────────────────────────────────────────
  async function copyText(text) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      toast('Lista copiada para a área de transferência.', 'success');
    } catch {
      toast('Não foi possível copiar. Tente copiar manualmente.', 'error');
    }
  }

  document.getElementById('bl-copy-all-btn')?.addEventListener('click', () => {
    copyText(buildMarkdown(null));
  });

  document.querySelectorAll('.bl-copy-group-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.closest('.bl-group')?.dataset.key;
      copyText(buildMarkdown(key));
    });
  });

  // ─── Event listeners ───────────────────────────────────────────────────────
  document.getElementById('exit-edit-btn')?.addEventListener('click', async () => {
    const { data: exps } = db ? await db.from('experiences').select('id, title').eq('is_active', true).order('title') : { data: [] };
    closeDrawer();
    openExitFormDrawer(exit, exp, exps ?? [], (updatedPayload) => {
      const r = findExit(exit.id);
      if (r && updatedPayload) Object.assign(r.exit, updatedPayload);
    });
  });

  document.getElementById('exit-extend-btn')?.addEventListener('click', () => {
    const currentCap = exit.capacity ?? 0;
    const occupied   = activeRes.length;
    openModal(
      'Estender saída',
      `<p style="margin-bottom:12px">A saída <strong>${escHtml(exp.title)}</strong> tem
        <strong>${currentCap} vagas</strong> (${occupied} ocupadas).</p>
       <p style="margin-bottom:16px;color:var(--adm-text-muted);font-size:13px">
         Quantas vagas deseja adicionar a este mesmo grupo?
       </p>
       <div style="display:flex;align-items:center;gap:10px">
         <input id="extend-extra-vagas" type="number" min="1" max="999" value="1"
           class="adm-input" style="width:100px;font-size:18px;font-weight:700;text-align:center" />
         <span style="font-size:13px;color:var(--adm-text-muted)">
           → nova capacidade: <strong id="extend-new-cap">${currentCap + 1}</strong> vagas
         </span>
       </div>`,
      `<button class="adm-btn adm-btn--ghost" onclick="closeModal()">Cancelar</button>
       <button class="adm-btn adm-btn--primary" id="extend-confirm-btn">Estender saída</button>`
    );

    // Live preview new capacity
    const extraEl = document.getElementById('extend-extra-vagas');
    const newCapEl = document.getElementById('extend-new-cap');
    extraEl?.addEventListener('input', () => {
      const extra = Math.max(1, parseInt(extraEl.value) || 1);
      if (newCapEl) newCapEl.textContent = currentCap + extra;
    });

    document.getElementById('extend-confirm-btn')?.addEventListener('click', async () => {
      const extra   = Math.max(1, parseInt(extraEl?.value) || 1);
      const newCap  = currentCap + extra;
      const { error } = await updateDeparture(exit.id, { capacity: newCap, status: 'scheduled' });
      if (error) { toast('Erro: ' + error.message, 'error'); return; }
      exit.capacity = newCap;
      exit.status   = 'scheduled';
      const r = findExit(exit.id);
      if (r) { r.exit.capacity = newCap; r.exit.status = 'scheduled'; }
      toast(`Saída estendida: +${extra} vaga${extra !== 1 ? 's' : ''} (total ${newCap})`, 'success');
      closeModal();
      closeDrawer();
      setTimeout(() => openExitDrawer(exit.id), 150);
    });
  });

  document.getElementById('exit-delete-btn')?.addEventListener('click', async () => {
    const hasRes = activeRes.length > 0;
    const confirmed = await showConfirmModal(
      'Excluir saída permanentemente',
      `<p>Tem certeza que deseja <strong>excluir permanentemente</strong> a saída
        <strong>${escHtml(exp.title)}</strong> de <strong>${escHtml(dtDisplay)}</strong>?</p>
       ${hasRes ? `<p style="color:var(--adm-danger);margin-top:8px">⚠️ Esta saída possui <strong>${activeRes.length}</strong> reserva(s) ativa(s) vinculada(s). Exclua-as antes de remover a saída.</p>` : ''}
       <p style="margin-top:10px;font-size:12px;color:var(--adm-muted)">Esta ação não pode ser desfeita.</p>`,
      'Excluir permanentemente', 'danger'
    );
    if (!confirmed) return;
    if (hasRes) { toast('Remova as reservas ativas antes de excluir.', 'error'); return; }
    const { error } = await deleteDeparture(exit.id);
    if (error) { toast('Erro ao excluir: ' + error.message, 'error'); return; }
    // Remove from local cache
    _exitsCache = _exitsCache.filter(d => d.exit.id !== exit.id);
    toast('Saída excluída com sucesso.', 'success');
    closeDrawer();
    renderSaidas($('adm-main'));
  });

  document.querySelectorAll('[data-set-status]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const newStatus = btn.dataset.setStatus;
      const isCancelAction = newStatus === 'cancelled';
      const labels = { scheduled: 'reaberta', sold_out: 'marcada como esgotada', cancelled: 'cancelada' };

      if (isCancelAction) {
        const confirmed = await showConfirmModal(
          'Cancelar saída',
          `<p>Tem certeza que deseja <strong>cancelar</strong> a saída de <strong>${escHtml(exp.title)}</strong> em <strong>${escHtml(dtDisplay)}</strong>?</p>
           ${activeRes.length ? `<p style="color:var(--adm-danger);margin-top:8px">⚠️ Esta saída tem <strong>${activeRes.length}</strong> reserva(s) ativa(s).</p>` : ''}`,
          'Cancelar saída', 'danger'
        );
        if (!confirmed) return;
      }

      const { error } = await setDepartureStatus(exit.id, newStatus);
      if (error) { toast('Erro: ' + error.message, 'error'); return; }
      exit.status = newStatus;
      const r = findExit(exit.id);
      if (r) r.exit.status = newStatus;
      toast(`Saída ${labels[newStatus]} com sucesso!`, 'success');
      closeDrawer();
      setTimeout(() => openExitDrawer(exit.id), 150);
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  EXIT FORM DRAWER  (create / edit Saída + Pontos de embarque)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Opens a drawer to create or edit a departure, including boarding points.
 * @param {object|null} exit - Existing departure (null for create)
 * @param {object|null} expObj - Pre-selected experience object
 * @param {{ id: string, title: string }[]} experiences - Available experiences
 * @param {(updatedPayload?: object) => void} onAfterSave - Called after successful save
 */
async function openExitFormDrawer(exit, expObj, experiences, onAfterSave) {
  const isEdit = !!(exit?.id);

  const expOptions = experiences.map(e =>
    `<option value="${e.id}" ${exit?.experience_id === e.id ? 'selected' : ''}>${escHtml(e.title)}</option>`
  ).join('');

  const statusOptions = [
    { v: 'scheduled', l: 'Aberta' },
    { v: 'sold_out',  l: 'Esgotada' },
    { v: 'cancelled', l: 'Cancelada' },
  ].map(o =>
    `<option value="${o.v}" ${(exit?.status ?? 'scheduled') === o.v ? 'selected' : ''}>${o.l}</option>`
  ).join('');

  const startVal = exit?.start_at ? new Date(exit.start_at).toISOString().slice(0, 16) : '';
  const endVal   = exit?.end_at   ? new Date(exit.end_at  ).toISOString().slice(0, 16) : '';

  openDrawer(isEdit ? 'Editar Saída' : 'Nova Saída', `
    <form id="ef-form" autocomplete="off">

      <div class="adm-section-hd">Dados da saída</div>

      <div class="adm-field">
        <label>Experiência *</label>
        <select class="adm-select" id="ef-exp">
          <option value="">Selecione…</option>${expOptions}
        </select>
      </div>
      <div class="adm-field">
        <label>Título da saída (opcional)</label>
        <input class="adm-input" type="text" id="ef-title"
          value="${escHtml(exit?.title ?? '')}"
          placeholder="Ex: Saída especial de verão" />
      </div>
      <div class="adm-grid-2">
        <div class="adm-field">
          <label>Data e hora de início *</label>
          ${dtpFieldHtml('ef-start', startVal)}
        </div>
        <div class="adm-field">
          <label>Data/hora de término</label>
          ${dtpFieldHtml('ef-end', endVal)}
        </div>
      </div>
      <div class="adm-grid-2">
        <div class="adm-field">
          <label>Capacidade (vagas) *</label>
          <input class="adm-input" type="number" id="ef-capacity"
            value="${exit?.capacity ?? ''}" min="1"
            max="${expObj?.max_participants ?? ''}"
            placeholder="${expObj?.max_participants ?? 'Máximo da experiência'}" />
        </div>
        <div class="adm-field">
          <label>Preço (R$)</label>
          <input class="adm-input" type="number" id="ef-price"
            value="${exit?.price ?? ''}" min="0" step="0.01" placeholder="180.00" />
        </div>
      </div>
      ${isEdit ? `
      <div class="adm-field">
        <label>Status</label>
        <select class="adm-select" id="ef-status">${statusOptions}</select>
      </div>` : ''}

      <!-- ══ PONTOS DE EMBARQUE ═══════════════════════════════════════════ -->
      <div class="adm-section-hd" style="margin-top:20px">Pontos de embarque</div>
      <p style="font-size:12px;color:var(--adm-text-muted);margin-bottom:10px">
        Pelo menos um ponto ativo é obrigatório para criar a saída.
      </p>
      <div id="ef-bp-catalog-list" style="display:flex;flex-direction:column;gap:8px"></div>
      <div class="adm-section-hd" style="margin-top:14px;font-size:11px;text-transform:uppercase;letter-spacing:.05em">Pontos personalizados</div>
      <div id="ef-custom-bp-list" style="display:flex;flex-direction:column;gap:8px"></div>
      <button type="button" class="adm-btn adm-btn--ghost adm-btn--sm" id="ef-add-custom-bp-btn" style="margin-top:8px">+ Adicionar ponto personalizado</button>

      <!-- ══ FOOTER ═══════════════════════════════════════════════════════ -->
      <div style="display:flex;gap:10px;margin-top:24px;padding-top:16px;border-top:1px solid var(--adm-border)">
        <button type="submit" id="ef-save-btn" class="adm-btn adm-btn--primary" style="flex:1">${isEdit ? 'Salvar alterações' : 'Criar saída'}</button>
        <button type="button" class="adm-btn adm-btn--secondary" onclick="closeDrawer()">Cancelar</button>
      </div>

    </form>
  `);

  // ── Load BP catalog and pre-fill from existing selections ────────────────
  let _existingBPs = [];
  if (isEdit && exit.id) {
    const { data: exBps } = await listAllBoardingPointsByDeparture(exit.id);
    _existingBPs = exBps ?? [];
  }

  const { data: catalog } = await listActiveBoardingPoints();
  const catalogListEl = document.getElementById('ef-bp-catalog-list');
  if (!catalog || catalog.length === 0) {
    if (catalogListEl) catalogListEl.innerHTML =
      '<p style="font-size:12px;color:var(--adm-warning)">Nenhum ponto no catálogo. '
      + '<a href="#embarque" onclick="closeDrawer()">Cadastre primeiro</a> ou use ponto personalizado abaixo.</p>';
  } else {
    if (catalogListEl) catalogListEl.innerHTML = '';
    catalog.forEach(bp => {
      const existing  = _existingBPs.find(e => e.boardingPointId === bp.id);
      const pickupVal = existing?.pickupAt ? new Date(existing.pickupAt).toISOString().slice(0, 16) : '';
      const isChecked = !!existing;
      const addrLine  = [bp.address, bp.reference].filter(Boolean).join(' · ');
      const cityLine  = [bp.city, bp.state].filter(Boolean).join('/');

      const item = document.createElement('div');
      item.style.cssText = 'border:1px solid var(--adm-border);border-radius:6px;overflow:hidden';
      item.innerHTML = `
        <label style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;cursor:pointer;background:var(--adm-bg)">
          <input type="checkbox" id="ef-bpcat-${bp.id}" data-bpid="${bp.id}"
            ${isChecked ? 'checked' : ''} style="margin-top:2px;width:16px;height:16px;flex-shrink:0" />
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;font-size:13px">${escHtml(bp.name)}</div>
            ${addrLine ? `<div style="font-size:11px;color:var(--adm-text-muted)">${escHtml(addrLine)}</div>` : ''}
            ${cityLine ? `<div style="font-size:11px;color:var(--adm-text-muted)">${escHtml(cityLine)}</div>` : ''}
          </div>
        </label>
        <div id="ef-bpcat-detail-${bp.id}" style="display:${isChecked ? 'block' : 'none'};padding:0 12px 12px 14px">
          <div class="adm-grid-2" style="gap:8px">
            <div class="adm-field" style="margin:0">
              <label style="font-size:11px">Horário de embarque *</label>
              ${dtpFieldHtml('ef-bpcat-pickup-' + bp.id, pickupVal, 'Horário de embarque')}
            </div>
            <div class="adm-field" style="margin:0">
              <label style="font-size:11px">Obs. para esta saída</label>
              <input id="ef-bpcat-notes-${bp.id}" class="adm-input adm-input--sm"
                value="${escHtml(existing?.notes ?? '')}" placeholder="Opcional" />
            </div>
          </div>
        </div>`;
      catalogListEl?.appendChild(item);
      item.querySelector(`#ef-bpcat-${bp.id}`)?.addEventListener('change', ev => {
        const det = document.getElementById(`ef-bpcat-detail-${bp.id}`);
        if (det) det.style.display = ev.target.checked ? 'block' : 'none';
        if (ev.target.checked) {
          const sv  = document.getElementById('ef-start')?.value;
          const pid = 'ef-bpcat-pickup-' + bp.id;
          if (sv && !document.getElementById(pid)?.value) {
            const _allChecked = [...document.querySelectorAll('#ef-bp-catalog-list input[type="checkbox"]:checked')];
            const _custRows   = document.querySelectorAll('[id^="ef-custom-bp-"]').length;
            const _catIdx     = _allChecked.findIndex(c => c.dataset.bpid === String(bp.id));
            const _bpIdx      = _catIdx >= 0 ? _catIdx : _allChecked.length;
            dtpSetValue(pid, _addBpMinutes(sv, _bpIdx * 15));
          }
        }
      });
    });
  }

  // Custom (non-catalog) BP rows
  let customBpCount = 0;
  function addCustomBpRow(existing = null) {
    const i = customBpCount++;
    const pickupVal = existing?.pickupAt ? new Date(existing.pickupAt).toISOString().slice(0, 16) : '';
    const div = document.createElement('div');
    div.id = `ef-custom-bp-${i}`;
    div.style.cssText = 'background:var(--adm-bg-alt,#f9f9f9);border:1px solid var(--adm-border);border-radius:6px;padding:10px;display:flex;flex-direction:column;gap:8px';
    div.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:12px;font-weight:600;color:var(--adm-text-muted)">Ponto personalizado</span>
        <button type="button" class="adm-btn adm-btn--ghost adm-btn--sm"
          onclick="document.getElementById('ef-custom-bp-${i}').remove()"
          style="color:var(--adm-danger)">Remover</button>
      </div>
      <div class="adm-grid-2" style="gap:8px">
        <div class="adm-field" style="margin:0">
          <label style="font-size:11px">Nome do ponto *</label>
          <input id="ef-cust-label-${i}" class="adm-input adm-input--sm"
            value="${escHtml(existing?.displayName ?? '')}" placeholder="Ex: Estacionamento do Parque" />
        </div>
        <div class="adm-field" style="margin:0">
          <label style="font-size:11px">Horário *</label>
          ${dtpFieldHtml('ef-cust-pickup-' + i, pickupVal, 'Horário de embarque')}
        </div>
        <div class="adm-field" style="margin:0">
          <label style="font-size:11px">Endereço / referência</label>
          <input id="ef-cust-address-${i}" class="adm-input adm-input--sm"
            value="${escHtml(existing?.displayAddress ?? '')}" placeholder="Opcional" />
        </div>
        <div class="adm-field" style="margin:0">
          <label style="font-size:11px">Obs.</label>
          <input id="ef-cust-notes-${i}" class="adm-input adm-input--sm"
            value="${escHtml(existing?.notes ?? '')}" placeholder="Opcional" />
        </div>
      </div>`;
    document.getElementById('ef-custom-bp-list')?.appendChild(div);
  }

  // Pre-load any existing custom (non-catalog) BPs on edit
  _existingBPs.filter(e => !e.boardingPointId).forEach(addCustomBpRow);
  document.getElementById('ef-add-custom-bp-btn')?.addEventListener('click', () => {
    const sv = document.getElementById('ef-start')?.value;
    const _catChecked = document.querySelectorAll('#ef-bp-catalog-list input[type="checkbox"]:checked').length;
    const _custExist  = document.querySelectorAll('[id^="ef-custom-bp-"]').length;
    const _nextIdx    = _catChecked + _custExist;
    addCustomBpRow(sv ? { pickupAt: _addBpMinutes(sv, _nextIdx * 15) } : null);
  });

  // ── Auto-fill from experience on select ─────────────────────────────────
  async function autofillFromExp(expId) {
    if (!expId) return;
    const { data: fullExp } = await getExperienceById(expId);
    if (!fullExp) return;
    // Only fill if the field is empty (don't override user's changes)
    const capEl   = document.getElementById('ef-capacity');
    const priceEl = document.getElementById('ef-price');
    const endEl   = document.getElementById('ef-end');
    const startEl = document.getElementById('ef-start');
    if (capEl) capEl.max = fullExp.max_participants ?? '';
    if (capEl) capEl.placeholder = fullExp.max_participants ?? 'Máximo da experiência';
    if (capEl   && !capEl.value)   capEl.value   = fullExp.max_participants ?? '';
    else if (capEl && fullExp.max_participants && parseInt(capEl.value) > fullExp.max_participants) capEl.value = fullExp.max_participants;
    if (priceEl && !priceEl.value) priceEl.value = fullExp.base_price ?? '';
    // Auto-set end_at from start_at + duration_hours if both available
    if (fullExp.duration_hours && startEl?.value && endEl) {
      const endManual = endEl.dataset.dtpManual === '1';
      if (!endManual || !endEl.value) {
        const startMs = new Date(startEl.value).getTime();
        if (!isNaN(startMs)) {
          const endMs = startMs + fullExp.duration_hours * 3600_000;
          dtpSetValue(endEl.id, new Date(endMs).toISOString().slice(0, 16));
        }
      }
    }
  }

  document.getElementById('ef-exp')?.addEventListener('change', e => autofillFromExp(e.target.value));
  // If pre-selected experience, autofill on open (create only)
  if (!isEdit && expObj?.id) autofillFromExp(expObj.id);

  // ── end_at auto-calc when start changes ─────────────────────────────────
  document.getElementById('ef-start')?.addEventListener('change', async () => {
    // Reset end override so auto-calc can run
    const endEl = document.getElementById('ef-end');
    if (endEl) delete endEl.dataset.dtpManual;
    const expId = document.getElementById('ef-exp')?.value;
    if (expId) autofillFromExp(expId);
    // Pre-fill unchecked → checked BPs and custom rows with same departure datetime
    const sv = document.getElementById('ef-start')?.value;
    if (!sv) return;
    let _efBpIdx = 0;
    document.querySelectorAll('#ef-bp-catalog-list input[type="checkbox"]:checked').forEach(cb => {
      const pid = 'ef-bpcat-pickup-' + cb.dataset.bpid;
      if (!document.getElementById(pid)?.value) dtpSetValue(pid, _addBpMinutes(sv, _efBpIdx * 15));
      _efBpIdx++;
    });
    document.querySelectorAll('[id^="ef-custom-bp-"]').forEach(r => {
      const pid = 'ef-cust-pickup-' + r.id.replace('ef-custom-bp-', '');
      if (!document.getElementById(pid)?.value) dtpSetValue(pid, _addBpMinutes(sv, _efBpIdx * 15));
      _efBpIdx++;
    });
  });

  // ── Form submit ──────────────────────────────────────────────────────────
  document.getElementById('ef-form')?.addEventListener('submit', async e => {
    e.preventDefault();

    const expId    = document.getElementById('ef-exp')?.value;
    const depTitle = document.getElementById('ef-title')?.value.trim() || null;
    const startAt  = document.getElementById('ef-start')?.value;
    const endAt    = document.getElementById('ef-end')?.value || null;
    const _capEl   = document.getElementById('ef-capacity');
    const _capMax  = parseInt(_capEl?.max, 10) || Infinity;
    const capacity = Math.min(parseInt(_capEl?.value, 10), _capMax) || null;
    const price    = parseFloat(document.getElementById('ef-price')?.value) || null;
    const status   = document.getElementById('ef-status')?.value ?? 'scheduled';

    // Collect selections from catalog checkboxes
    const selections = [];
    document.querySelectorAll('#ef-bp-catalog-list [id^="ef-bpcat-"]').forEach(cb => {
      if (cb.type !== 'checkbox' || !cb.checked) return;
      const bpId      = cb.dataset.bpid;
      const pickupRaw = document.getElementById(`ef-bpcat-pickup-${bpId}`)?.value;
      const notes     = document.getElementById(`ef-bpcat-notes-${bpId}`)?.value.trim() || null;
      if (!pickupRaw) return;
      selections.push({ boardingPointId: bpId, pickupAt: new Date(pickupRaw).toISOString(), notes, isActive: true, sortOrder: selections.length });
    });
    // Collect custom BP rows
    document.querySelectorAll('#ef-custom-bp-list > div[id^="ef-custom-bp-"]').forEach(div => {
      const i      = div.id.replace('ef-custom-bp-', '');
      const label  = document.getElementById(`ef-cust-label-${i}`)?.value.trim();
      const pickupRaw = document.getElementById(`ef-cust-pickup-${i}`)?.value;
      if (!label || !pickupRaw) return;
      const address = document.getElementById(`ef-cust-address-${i}`)?.value.trim() || null;
      const notes   = document.getElementById(`ef-cust-notes-${i}`)?.value.trim() || null;
      selections.push({ boardingPointId: null, customLabel: label, customAddress: address, pickupAt: new Date(pickupRaw).toISOString(), notes, isActive: true, sortOrder: selections.length });
    });

    // Validate
    if (!expId)   { toast('Selecione uma experiência.', 'error'); return; }
    if (!startAt) { toast('Informe a data e hora de início.', 'error'); return; }
    if (!capacity || capacity < 1) { toast('Capacidade deve ser ≥ 1.', 'error'); return; }
    if (selections.length === 0)   { toast('Adicione ao menos um ponto de embarque ativo com horário.', 'error'); return; }

    const saveBtn = document.getElementById('ef-save-btn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Salvando…'; }

    const firstBpLabel = selections[0]?.customLabel || null; // meeting_point compat
    const depPayload = {
      experience_id: expId,
      title:         depTitle,
      start_at:      new Date(startAt).toISOString(),
      end_at:        endAt ? new Date(endAt).toISOString() : null,
      meeting_point: firstBpLabel,
      capacity,
      price,
      status: isEdit ? status : 'scheduled',
    };

    let departureId = exit?.id ?? null;

    if (isEdit) {
      const { error: updErr } = await updateDeparture(exit.id, depPayload);
      if (updErr) {
        toast('Erro ao salvar saída: ' + updErr.message, 'error');
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Salvar alterações'; }
        return;
      }
    } else {
      const { data: created, error: crtErr } = await createDeparture(depPayload);
      if (crtErr || !created?.id) {
        toast('Erro ao criar saída: ' + (crtErr?.message ?? 'sem resposta'), 'error');
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Criar saída'; }
        return;
      }
      departureId = created.id;
    }

    // Save boarding point selections
    const { error: bpErr } = await saveDepartureBoardingPoints(departureId, selections);
    if (bpErr) {
      if (!isEdit && departureId) {
        await window.anauaDb?.from('departures').delete().eq('id', departureId);
        toast(`Pontos de embarque falharam — saída revertida. ${bpErr.message}`, 'error');
      } else {
        toast('Saída salva, mas pontos de embarque falharam: ' + bpErr.message, 'error');
      }
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = isEdit ? 'Salvar alterações' : 'Criar saída'; }
      return;
    }

    toast(isEdit ? 'Saída atualizada!' : 'Saída criada com sucesso!', 'success');
    closeDrawer();
    if (onAfterSave) onAfterSave(depPayload);
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

$('adm-global-search').addEventListener('keydown', async e => {
  if (e.key !== 'Enter') return;
  const q = e.target.value.trim();
  if (!q) return;
  const db = window.anauaDb;
  if (!db) { toast('Supabase não disponível.', 'error'); return; }
  const { data } = await db
    .from('reservations')
    .select('id')
    .ilike('id', `%${q}%`)
    .limit(1)
    .single();
  if (data) {
    navigate('#reservas');
    e.target.value = '';
  } else {
    toast('Nenhuma reserva encontrada', 'error');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  MODULE: USUÁRIOS
// ─────────────────────────────────────────────────────────────────────────────

async function renderUsuarios(root) {
  const ROLES      = ['customer', 'operator', 'admin'];
  const ROLE_LABEL = { customer: 'Cliente', operator: 'Operador', admin: 'Administrador' };
  const ROLE_BADGE = { customer: 'badge--reserved', operator: 'badge--confirmed', admin: 'badge--paid' };
  const fmtDt = iso => iso ? new Date(iso).toLocaleDateString('pt-BR') : '—';

  const db = window.anauaDb;

  // ── Shell ──────────────────────────────────────────────────────────────────
  root.innerHTML = `
    <div class="adm-card">
      <div class="adm-card__header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div style="display:flex;align-items:center;gap:8px">
          Usuários
          <span class="text-small text-muted" id="adm-user-count"></span>
        </div>
        <button class="adm-btn adm-btn--primary adm-btn--sm" id="adm-user-invite-btn">+ Convidar usuário</button>
      </div>
      <div class="adm-filter-bar" style="padding:var(--adm-sp-3) var(--adm-sp-4)">
        <input type="search" class="adm-input" id="adm-user-search" placeholder="Buscar por nome ou e-mail…" style="flex:1;min-width:180px" />
        <select class="adm-input" id="adm-user-role-filter" style="width:auto">
          <option value="">Todos os perfis</option>
          ${ROLES.map(r => `<option value="${r}">${ROLE_LABEL[r]}</option>`).join('')}
          <option value="__suspended">Suspensos</option>
        </select>
      </div>
      <div class="adm-table-wrap">
        <table class="adm-table">
          <thead>
            <tr>
              <th>Usuário</th>
              <th>E-mail</th>
              <th>Perfil</th>
              <th>Status</th>
              <th>Criado em</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="adm-users-tbody">
            <tr><td colspan="6" class="adm-table__empty text-muted">Carregando…</td></tr>
          </tbody>
        </table>
      </div>
    </div>`;

  if (!db) {
    $('adm-users-tbody').innerHTML = `<tr><td colspan="6" class="adm-table__empty" style="color:var(--adm-danger)">Supabase não disponível.</td></tr>`;
    return;
  }

  // ── Load data ──────────────────────────────────────────────────────────────
  let allProfiles = [];

  async function loadProfiles() {
    const { data, error } = await db
      .from('profiles')
      .select('id, email, display_name, role, phone, notes, is_suspended, created_at')
      .order('created_at', { ascending: false });
    if (error) {
      console.warn('[admin-users]', error.message);
      $('adm-users-tbody').innerHTML =
        `<tr><td colspan="6" class="adm-table__empty" style="color:var(--adm-danger)">Erro ao carregar usuários: ${escHtml(error.message)}</td></tr>`;
      return;
    }
    allProfiles = data ?? [];
    const count = document.getElementById('adm-user-count');
    if (count) count.textContent = `(${allProfiles.length})`;
    renderRows(filtered());
  }

  // ── Filter ─────────────────────────────────────────────────────────────────
  function filtered() {
    const q  = $('adm-user-search').value.toLowerCase().trim();
    const rf = $('adm-user-role-filter').value;
    return allProfiles.filter(p => {
      const matchQ = !q
        || (p.display_name ?? '').toLowerCase().includes(q)
        || (p.email ?? '').toLowerCase().includes(q);
      const matchR = !rf
        || (rf === '__suspended' ? p.is_suspended : p.role === rf);
      return matchQ && matchR;
    });
  }

  // ── Render rows ────────────────────────────────────────────────────────────
  function renderRows(list) {
    const tbody = $('adm-users-tbody');
    if (!tbody) return;
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="adm-table__empty text-muted">Nenhum usuário encontrado.</td></tr>`;
      return;
    }
    tbody.innerHTML = list.map(p => {
      const initials = ((p.display_name ?? p.email ?? '?')[0] ?? '?').toUpperCase();
      const suspended = p.is_suspended;
      return `<tr style="${suspended ? 'opacity:.6' : ''}">
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            <div class="adm-avatar">${escHtml(initials)}</div>
            <div>
              <div style="font-weight:600;font-size:13px">${escHtml(p.display_name ?? '—')}</div>
              ${p.phone ? `<div class="text-small text-muted">${escHtml(p.phone)}</div>` : ''}
            </div>
          </div>
        </td>
        <td class="text-small text-muted">${escHtml(p.email ?? '—')}</td>
        <td><span class="badge ${ROLE_BADGE[p.role] ?? 'badge--draft'}">${ROLE_LABEL[p.role] ?? escHtml(p.role ?? '—')}</span></td>
        <td>${suspended
          ? '<span class="badge badge--cancelled">Suspenso</span>'
          : '<span class="badge badge--active">Ativo</span>'
        }</td>
        <td class="text-small text-muted no-wrap">${fmtDt(p.created_at)}</td>
        <td style="white-space:nowrap">
          <button class="adm-btn adm-btn--ghost adm-btn--sm" data-user-edit="${p.id}">Editar</button>
          <button class="adm-btn adm-btn--ghost adm-btn--sm" data-user-reset="${escHtml(p.email ?? '')}">Redefinir senha</button>
          <button class="adm-btn adm-btn--ghost adm-btn--sm" data-user-suspend="${p.id}" data-suspended="${suspended}"
            style="color:var(--adm-${suspended ? 'success' : 'warning'})"
          >${suspended ? 'Reativar' : 'Suspender'}</button>
          <button class="adm-btn adm-btn--ghost adm-btn--sm" data-user-delete="${p.id}" data-user-name="${escHtml(p.display_name ?? p.email ?? p.id)}"
            style="color:var(--adm-danger)">Excluir</button>
        </td>
      </tr>`;
    }).join('');

    // ── Row action listeners ─────────────────────────────────────────────────
    tbody.querySelectorAll('[data-user-edit]').forEach(btn =>
      btn.addEventListener('click', () => openUserDrawer(btn.dataset.userEdit)));

    tbody.querySelectorAll('[data-user-reset]').forEach(btn =>
      btn.addEventListener('click', () => sendPasswordReset(btn.dataset.userReset)));

    tbody.querySelectorAll('[data-user-suspend]').forEach(btn =>
      btn.addEventListener('click', () => toggleSuspend(
        btn.dataset.userSuspend,
        btn.dataset.suspended === 'true',
      )));

    tbody.querySelectorAll('[data-user-delete]').forEach(btn =>
      btn.addEventListener('click', () => confirmDeleteUser(
        btn.dataset.userDelete,
        btn.dataset.userName,
      )));
  }

  $('adm-user-search').addEventListener('input',       () => renderRows(filtered()));
  $('adm-user-role-filter').addEventListener('change', () => renderRows(filtered()));

  // ── Send password reset ────────────────────────────────────────────────────
  async function sendPasswordReset(email) {
    if (!email) return;
    const { error } = await db.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/admin/login.html`,
    });
    if (error) { toast('Erro ao enviar e-mail: ' + error.message, 'error'); return; }
    toast(`E-mail de redefinição enviado para ${email}.`, 'success');
  }

  // ── Suspend / reactivate ───────────────────────────────────────────────────
  async function toggleSuspend(userId, currentlySuspended) {
    const { error } = await db
      .from('profiles')
      .update({ is_suspended: !currentlySuspended })
      .eq('id', userId);
    if (error) { toast('Erro: ' + error.message, 'error'); return; }
    toast(currentlySuspended ? 'Usuário reativado.' : 'Usuário suspenso.', 'success');
    await loadProfiles();
  }

  // ── Delete user (profile only) ─────────────────────────────────────────────
  async function confirmDeleteUser(userId, name) {
    openDrawer('Excluir usuário', `
      <div style="padding:var(--adm-sp-4)">
        <p style="margin-bottom:var(--adm-sp-4)">
          Tem certeza que deseja excluir o usuário <strong>${escHtml(name)}</strong>?<br>
          <span class="text-small text-muted">Apenas o perfil será removido. A conta de autenticação permanece no Supabase Auth.</span>
        </p>
        <div style="display:flex;gap:8px">
          <button id="adm-del-confirm" class="adm-btn adm-btn--danger">Confirmar exclusão</button>
          <button onclick="closeDrawer()" class="adm-btn adm-btn--ghost">Cancelar</button>
        </div>
      </div>`);
    document.getElementById('adm-del-confirm')?.addEventListener('click', async () => {
      const { error } = await db.from('profiles').delete().eq('id', userId);
      if (error) { toast('Erro ao excluir: ' + error.message, 'error'); return; }
      toast('Usuário excluído.', 'success');
      closeDrawer();
      await loadProfiles();
    });
  }

  // ── Edit user drawer ───────────────────────────────────────────────────────
  async function openUserDrawer(userId) {
    const profile = allProfiles.find(p => p.id === userId);
    if (!profile) return;

    openDrawer(`Editar usuário — ${escHtml(profile.display_name ?? profile.email ?? '')}`, `
      <form id="adm-user-form" style="display:flex;flex-direction:column;gap:var(--adm-sp-4);padding:var(--adm-sp-4)">
        <div class="adm-form-group">
          <label class="adm-label">Nome de exibição</label>
          <input class="adm-input" id="adm-u-name" type="text" value="${escHtml(profile.display_name ?? '')}" placeholder="Nome completo" />
        </div>
        <div class="adm-form-group">
          <label class="adm-label">E-mail <span class="text-muted text-small">(somente leitura)</span></label>
          <input class="adm-input" type="email" value="${escHtml(profile.email ?? '')}" disabled style="opacity:.6;cursor:not-allowed" />
        </div>
        <div class="adm-form-group">
          <label class="adm-label">Telefone</label>
          <input class="adm-input" id="adm-u-phone" type="tel" value="${escHtml(profile.phone ?? '')}" placeholder="+55 (00) 00000-0000" />
        </div>
        <div class="adm-form-group">
          <label class="adm-label">Perfil / Nível de acesso</label>
          <select class="adm-input" id="adm-u-role">
            ${ROLES.map(r => `<option value="${r}"${r === profile.role ? ' selected' : ''}>${ROLE_LABEL[r]}</option>`).join('')}
          </select>
        </div>
        <div class="adm-form-group">
          <label class="adm-label">Notas internas</label>
          <textarea class="adm-input" id="adm-u-notes" rows="3" placeholder="Observações visíveis apenas pelo staff">${escHtml(profile.notes ?? '')}</textarea>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button type="submit" class="adm-btn adm-btn--primary" id="adm-u-save">Salvar alterações</button>
          <button type="button" onclick="closeDrawer()" class="adm-btn adm-btn--ghost">Cancelar</button>
        </div>
      </form>`);

    document.getElementById('adm-user-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const saveBtn = document.getElementById('adm-u-save');
      if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Salvando…'; }

      const payload = {
        display_name: document.getElementById('adm-u-name').value.trim() || null,
        role:         document.getElementById('adm-u-role').value,
        phone:        document.getElementById('adm-u-phone').value.trim() || null,
        notes:        document.getElementById('adm-u-notes').value.trim() || null,
      };
      const { error } = await db.from('profiles').update(payload).eq('id', userId);
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Salvar alterações'; }
      if (error) { toast('Erro ao salvar: ' + error.message, 'error'); return; }
      toast('Perfil atualizado.', 'success');
      closeDrawer();
      await loadProfiles();
    });
  }

  // ── Invite user drawer ─────────────────────────────────────────────────────
  function openInviteDrawer() {
    openDrawer('Convidar usuário', `
      <form id="adm-invite-form" style="display:flex;flex-direction:column;gap:var(--adm-sp-4);padding:var(--adm-sp-4)">
        <p class="text-small text-muted" style="margin:0">
          Uma conta será criada com senha temporária. O usuário receberá um e-mail de confirmação.
        </p>
        <div class="adm-form-group">
          <label class="adm-label">E-mail <span style="color:var(--adm-danger)">*</span></label>
          <input class="adm-input" id="adm-inv-email" type="email" required placeholder="usuario@email.com" />
        </div>
        <div class="adm-form-group">
          <label class="adm-label">Nome de exibição</label>
          <input class="adm-input" id="adm-inv-name" type="text" placeholder="Nome completo (opcional)" />
        </div>
        <div class="adm-form-group">
          <label class="adm-label">Perfil</label>
          <select class="adm-input" id="adm-inv-role">
            ${ROLES.map(r => `<option value="${r}"${r === 'customer' ? ' selected' : ''}>${ROLE_LABEL[r]}</option>`).join('')}
          </select>
        </div>
        <div id="adm-inv-err" style="display:none;color:var(--adm-danger);font-size:13px"></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button type="submit" class="adm-btn adm-btn--primary" id="adm-inv-save">Criar & enviar convite</button>
          <button type="button" onclick="closeDrawer()" class="adm-btn adm-btn--ghost">Cancelar</button>
        </div>
      </form>`);

    document.getElementById('adm-invite-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const saveBtn = document.getElementById('adm-inv-save');
      const errEl   = document.getElementById('adm-inv-err');
      const email   = document.getElementById('adm-inv-email').value.trim();
      const name    = document.getElementById('adm-inv-name').value.trim() || null;
      const role    = document.getElementById('adm-inv-role').value;

      if (!email) return;
      if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Criando…'; }
      errEl.style.display = 'none';

      // Create auth user with random temp password (user must reset via email)
      const tempPwd = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2).toUpperCase() + '!7';
      const { data: signUpData, error: signUpErr } = await db.auth.signUp({
        email,
        password: tempPwd,
        options: { data: { display_name: name } },
      });

      if (signUpErr) {
        errEl.textContent = signUpErr.message;
        errEl.style.display = 'block';
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Criar & enviar convite'; }
        return;
      }

      const newUserId = signUpData?.user?.id;
      if (newUserId) {
        // Upsert profile with chosen role
        await db.from('profiles').upsert({
          id:           newUserId,
          email,
          display_name: name,
          role,
        }, { onConflict: 'id' });
        // Send password reset so user can set their own password
        await db.auth.resetPasswordForEmail(email, {
          redirectTo: `${location.origin}/admin/login.html`,
        });
      }

      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Criar & enviar convite'; }
      toast(`Convite enviado para ${email}. O usuário deve confirmar o e-mail.`, 'success');
      closeDrawer();
      await loadProfiles();
    });
  }

  $('adm-user-invite-btn')?.addEventListener('click', openInviteDrawer);

  await loadProfiles();
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
// seedMockBookings() removida — dashboard carrega dados do Supabase

// Segurança: remover dados sensíveis da URL antes de qualquer render
(function sanitizeAdminUrl() {
  if (/[?&](password|senha)=/i.test(location.search)) {
    console.warn('[security] Dados sensíveis removidos da URL');
    history.replaceState(null, '', location.pathname + location.hash);
    toast('Por segurança, removemos dados sensíveis da URL.', 'warn');
  }
})();

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

    // Navega apenas após auth confirmada — evita race condition com RLS
    navigate(location.hash || '#dashboard');

  } catch (err) {
    console.error('[admin-auth] Erro ao validar sessão:', err);
    console.log('[admin-auth] Redirecionando para login');
    location.replace('login.html');
  }
})();

// Logout
$('admin-logout-btn')?.addEventListener('click', () => {
  adminLogout();
});

$('adm-notif-dot').classList.add('is-visible');
