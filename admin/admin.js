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
import { createExperience, updateExperience, createDeparture, updateDeparture, setDepartureStatus, createExperienceBundle, getExperienceById } from '../assets/js/repositories/experienceRepo.js';
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
window.setWlStatus            = setWlStatus;

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

      <!-- ══ A: DADOS DA EXPERIÊNCIA ══════════════════════════════════ -->
      <div class="adm-section-hd">Dados da experiência</div>

      <div class="adm-field">
        <label>Título *</label>
        <input id="ne-title" class="adm-input" required placeholder="Ex: Trilha do Pico" />
      </div>
      <div class="adm-field">
        <label>Slug *</label>
        <input id="ne-slug" class="adm-input" required placeholder="trilha-do-pico" />
        <span class="adm-hint">Gerado automaticamente. Pode editar.</span>
      </div>
      <div class="adm-field">
        <label>Subtítulo</label>
        <input id="ne-subtitle" class="adm-input" placeholder="Frase curta de apresentação" />
      </div>
      <div class="adm-field">
        <label>Descrição</label>
        <textarea id="ne-description" class="adm-input" rows="3" placeholder="Descrição completa da experiência"></textarea>
      </div>
      <div class="adm-grid-2">
        <div class="adm-field"><label>Local</label><input id="ne-location" class="adm-input" placeholder="Ex: Serra da Canastra" /></div>
        <div class="adm-field"><label>Categoria</label>
          <select id="ne-category" class="adm-select">
            <option value="">— selecione —</option>
            <option value="day-experience">Experiência de 1 dia</option>
            <option value="expedition">Expedição</option>
            <option value="event">Evento</option>
            <option value="kids">Kids</option>
          </select>
        </div>
      </div>
      <div class="adm-grid-2">
        <div class="adm-field"><label>Dificuldade</label>
          <select id="ne-difficulty" class="adm-select">
            <option value="">— selecione —</option>
            <option value="iniciante">Iniciante (Fácil)</option>
            <option value="moderado">Moderado</option>
            <option value="aventura">Aventura (Difícil)</option>
          </select>
        </div>
        <div class="adm-field"><label>Preço base (R$)</label>
          <input id="ne-price" class="adm-input" type="number" min="0" step="0.01" placeholder="0,00" />
        </div>
      </div>
      <div class="adm-grid-2">
        <div class="adm-field"><label>Duração (horas)</label>
          <input id="ne-duration" class="adm-input" type="number" min="0.5" step="0.5" placeholder="Ex: 8" />
        </div>
        <div class="adm-field"><label>Capacidade máxima</label>
          <input id="ne-maxpax" class="adm-input" type="number" min="1" step="1" placeholder="Ex: 20" />
        </div>
      </div>
      <div class="adm-field">
        <label>Imagem de capa</label>
        <div class="adm-upload-widget">
          <input type="file" id="ne-cover-file" accept="image/*" style="display:none" />
          <div id="ne-cover-preview" style="display:none;align-items:center;gap:10px">
            <img id="ne-cover-img" src="" alt="" style="width:56px;height:56px;object-fit:cover;border-radius:6px;border:1px solid var(--adm-border)" />
            <div>
              <span id="ne-cover-name" style="font-size:12px;color:var(--adm-text-muted)"></span><br>
              <button type="button" class="adm-btn adm-btn--ghost adm-btn--sm" id="ne-cover-change-btn">Trocar</button>
            </div>
          </div>
          <div id="ne-cover-empty">
            <button type="button" class="adm-btn adm-btn--secondary adm-btn--sm" id="ne-cover-pick-btn">📷 Escolher imagem</button>
            <span id="ne-cover-status" style="font-size:12px;color:var(--adm-text-muted);margin-left:8px"></span>
          </div>
          <input type="hidden" id="ne-cover" />
        </div>
      </div>
      <div class="adm-grid-2" style="margin-top:4px">
        <div class="adm-field" style="flex-direction:row;align-items:center;gap:8px">
          <input id="ne-active" type="checkbox" checked style="width:16px;height:16px" />
          <label for="ne-active" style="margin:0;font-weight:400">Ativa (visível no site)</label>
        </div>
        <div class="adm-field" style="flex-direction:row;align-items:center;gap:8px">
          <input id="ne-featured" type="checkbox" style="width:16px;height:16px" />
          <label for="ne-featured" style="margin:0;font-weight:400">Destaque</label>
        </div>
      </div>

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
    if (depCap && !depCap.value) depCap.value = e.target.value;
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
      if (depCap   && !depCap.value)   depCap.value   = document.getElementById('ne-maxpax')?.value ?? '';
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
                if (sv && !document.getElementById(pid)?.value) dtpSetValue(pid, sv);
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
    // Pre-fill checked catalog BPs
    document.querySelectorAll('#ne-dep-bp-catalog-list input[type="checkbox"]:checked').forEach(cb => {
      const pid = 'ne-bpcat-' + cb.dataset.bpId + '-pickup';
      if (!document.getElementById(pid)?.value) dtpSetValue(pid, sv);
    });
    // Pre-fill custom BPs
    document.querySelectorAll('[id^="ne-dep-custom-bp-"]').forEach(r => {
      const pid = 'ne-custom-bp-pickup-' + r.id.replace('ne-dep-custom-bp-', '');
      if (!document.getElementById(pid)?.value) dtpSetValue(pid, sv);
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
    const experience = {
      title:            document.getElementById('ne-title').value.trim(),
      slug:             document.getElementById('ne-slug').value.trim(),
      subtitle:         document.getElementById('ne-subtitle')?.value.trim() || null,
      description:      document.getElementById('ne-description')?.value.trim() || null,
      location:         document.getElementById('ne-location')?.value.trim() || null,
      category:         document.getElementById('ne-category')?.value || null,
      difficulty:       document.getElementById('ne-difficulty')?.value || null,
      base_price:       parseFloat(document.getElementById('ne-price')?.value) || 0,
      duration_hours:   parseFloat(document.getElementById('ne-duration')?.value) || null,
      max_participants: parseInt(document.getElementById('ne-maxpax')?.value, 10) || null,
      cover_image_url:  document.getElementById('ne-cover')?.value.trim() || null,
      is_active:        document.getElementById('ne-active')?.checked ?? true,
      featured:         document.getElementById('ne-featured')?.checked ?? false,
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
        capacity:      parseInt(document.getElementById('ne-dep-capacity')?.value, 10) || experience.max_participants || null,
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

  $('adm-drawer-title').textContent = 'Editar experiência';
  $('adm-drawer-body').innerHTML = `
    <form id="edit-exp-form" autocomplete="off">

      <!-- ══ DADOS DA EXPERIÊNCIA ══════════════════════════════════ -->
      <div class="adm-section-hd">Dados da experiência</div>

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
        <input id="ee-subtitle" class="adm-input" value="${esc(row.subtitle ?? '')}" placeholder="Frase curta de apresentação" />
      </div>
      <div class="adm-field">
        <label>Descrição</label>
        <textarea id="ee-description" class="adm-input" rows="3">${esc(row.description ?? '')}</textarea>
      </div>
      <div class="adm-grid-2">
        <div class="adm-field"><label>Local</label><input id="ee-location" class="adm-input" value="${esc(row.location ?? '')}" /></div>
        <div class="adm-field"><label>Categoria</label>
          <select id="ee-category" class="adm-select">
            <option value="">— selecione —</option>
            <option value="day-experience" ${sel(row.category,'day-experience')}>Experiência de 1 dia</option>
            <option value="expedition" ${sel(row.category,'expedition')}>Expedição</option>
            <option value="event" ${sel(row.category,'event')}>Evento</option>
            <option value="kids" ${sel(row.category,'kids')}>Kids</option>
          </select>
        </div>
      </div>
      <div class="adm-grid-2">
        <div class="adm-field"><label>Dificuldade</label>
          <select id="ee-difficulty" class="adm-select">
            <option value="">— selecione —</option>
            <option value="iniciante" ${sel(row.difficulty,'iniciante')}>Iniciante (Fácil)</option>
            <option value="moderado" ${sel(row.difficulty,'moderado')}>Moderado</option>
            <option value="aventura" ${sel(row.difficulty,'aventura')}>Aventura (Difícil)</option>
          </select>
        </div>
        <div class="adm-field"><label>Preço base (R$)</label>
          <input id="ee-price" class="adm-input" type="number" min="0" step="0.01" value="${row.base_price ?? 0}" />
        </div>
      </div>
      <div class="adm-grid-2">
        <div class="adm-field"><label>Duração (horas)</label>
          <input id="ee-duration" class="adm-input" type="number" min="0.5" step="0.5" value="${row.duration_hours ?? ''}" />
        </div>
        <div class="adm-field"><label>Capacidade máxima</label>
          <input id="ee-maxpax" class="adm-input" type="number" min="1" value="${row.max_participants ?? ''}" />
        </div>
      </div>
      <div class="adm-field">
        <label>Imagem de capa</label>
        <div class="adm-upload-widget">
          <input type="file" id="ee-cover-file" accept="image/*" style="display:none" />
          <div id="ee-cover-preview" style="display:${row.cover_image_url ? 'flex' : 'none'};align-items:center;gap:10px">
            <img id="ee-cover-img" src="${esc(row.cover_image_url ?? '')}" alt="" style="width:56px;height:56px;object-fit:cover;border-radius:6px;border:1px solid var(--adm-border)" />
            <div>
              <span id="ee-cover-name" style="font-size:12px;color:var(--adm-text-muted)"></span><br>
              <button type="button" class="adm-btn adm-btn--ghost adm-btn--sm" id="ee-cover-change-btn">Trocar</button>
            </div>
          </div>
          <div id="ee-cover-empty" style="display:${row.cover_image_url ? 'none' : 'block'}">
            <button type="button" class="adm-btn adm-btn--secondary adm-btn--sm" id="ee-cover-pick-btn">📷 Escolher imagem</button>
            <span id="ee-cover-status" style="font-size:12px;color:var(--adm-text-muted);margin-left:8px"></span>
          </div>
          <input type="hidden" id="ee-cover" value="${esc(row.cover_image_url ?? '')}" />
        </div>
      </div>
      <div class="adm-grid-2" style="margin-top:4px">
        <div class="adm-field" style="flex-direction:row;align-items:center;gap:8px">
          <input id="ee-active" type="checkbox" ${row.is_active !== false ? 'checked' : ''} style="width:16px;height:16px" />
          <label for="ee-active" style="margin:0;font-weight:400">Ativa (visível no site)</label>
        </div>
        <div class="adm-field" style="flex-direction:row;align-items:center;gap:8px">
          <input id="ee-featured" type="checkbox" ${row.featured ? 'checked' : ''} style="width:16px;height:16px" />
          <label for="ee-featured" style="margin:0;font-weight:400">Destaque</label>
        </div>
      </div>

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

  // ── Section B toggle ──────────────────────────────────────────────────────
  document.getElementById('ee-dep-check')?.addEventListener('change', async e => {
    const sec = document.getElementById('ee-dep-section');
    if (sec) sec.style.display = e.target.checked ? 'flex' : 'none';
    if (e.target.checked) {
      const depPrice = document.getElementById('ee-dep-price');
      const depCap   = document.getElementById('ee-dep-capacity');
      if (depPrice && !depPrice.value) depPrice.value = document.getElementById('ee-price')?.value ?? '';
      if (depCap   && !depCap.value)   depCap.value   = document.getElementById('ee-maxpax')?.value ?? '';
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
                if (sv && !document.getElementById(pid)?.value) dtpSetValue(pid, sv);
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
    document.querySelectorAll('#ee-dep-bp-catalog-list input[type="checkbox"]:checked').forEach(cb => {
      const pid = 'ee-bpcat-' + cb.dataset.bpId + '-pickup';
      if (!document.getElementById(pid)?.value) dtpSetValue(pid, sv);
    });
    document.querySelectorAll('[id^="ee-dep-custom-bp-"]').forEach(r => {
      const pid = 'ee-custom-bp-pickup-' + r.id.replace('ee-dep-custom-bp-', '');
      if (!document.getElementById(pid)?.value) dtpSetValue(pid, sv);
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
    const expPayload = {
      title:            document.getElementById('ee-title').value.trim(),
      slug:             document.getElementById('ee-slug').value.trim(),
      subtitle:         document.getElementById('ee-subtitle')?.value.trim() || null,
      description:      document.getElementById('ee-description')?.value.trim() || null,
      location:         document.getElementById('ee-location')?.value.trim() || null,
      category:         document.getElementById('ee-category')?.value || null,
      difficulty:       document.getElementById('ee-difficulty')?.value || null,
      base_price:       parseFloat(document.getElementById('ee-price')?.value) || 0,
      duration_hours:   parseFloat(document.getElementById('ee-duration')?.value) || null,
      max_participants: parseInt(document.getElementById('ee-maxpax')?.value, 10) || null,
      cover_image_url:  document.getElementById('ee-cover')?.value.trim() || null,
      is_active:        document.getElementById('ee-active')?.checked ?? true,
      featured:         document.getElementById('ee-featured')?.checked ?? false,
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
        capacity:      parseInt(document.getElementById('ee-dep-capacity')?.value, 10) || expPayload.max_participants || null,
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
//  MODULE: LISTA DE ESPERA
// ─────────────────────────────────────────────────────────────────────────────

async function renderListaEspera(root) {
  root.innerHTML = `
    <div class="adm-card">
      <div class="adm-card__header">Lista de espera</div>
      <div style="padding:16px;color:var(--adm-text-muted)">Carregando…</div>
    </div>`;

  const db = window.anauaDb;
  if (!db) { root.innerHTML = `<div class="adm-empty"><p style="color:var(--adm-danger)">Supabase não disponível.</p></div>`; return; }

  const { data, error } = await db
    .from('waitlist_entries')
    .select('id, created_at, name, email, phone, participants_count, message, status, experience_id, experiences(title)')
    .order('created_at', { ascending: false });

  if (error) {
    root.innerHTML = `<div class="adm-empty" style="padding:48px;text-align:center"><p style="color:var(--adm-danger)">Erro ao carregar lista de espera.</p></div>`;
    console.error('[admin-db] Lista de espera:', error.message);
    return;
  }

  const entries = data ?? [];

  if (entries.length === 0) {
    root.innerHTML = `
      <div class="adm-empty" style="padding:64px 32px;text-align:center">
        <div style="font-size:2.5rem;margin-bottom:12px">📋</div>
        <p style="font-weight:600;font-size:1.1rem">Nenhum interessado na lista de espera</p>
        <p class="text-muted" style="margin-top:8px">Quando visitantes preencherem o formulário, aparecerão aqui.</p>
      </div>`;
    return;
  }

  const STATUS_WL = {
    pending:    { label: 'Pendente',    cls: 'badge--pending' },
    contacted:  { label: 'Contatado',   cls: 'badge--draft' },
    converted:  { label: 'Convertido',  cls: 'badge--active' },
    cancelled:  { label: 'Descartado',  cls: 'badge--cancelled' },
  };

  root.innerHTML = `
    <div class="adm-card">
      <div class="adm-card__header">Lista de espera <span class="adm-count">${entries.length}</span></div>
      <div class="adm-table-wrap">
        <table class="adm-table">
          <thead><tr>
            <th>Data</th><th>Experiência</th><th>Nome</th><th>E-mail</th>
            <th>WhatsApp</th><th>Pax</th><th>Status</th><th></th>
          </tr></thead>
          <tbody>${entries.map(e => {
            const s = STATUS_WL[e.status] ?? { label: e.status, cls: 'badge--draft' };
            const expTitle = e.experiences?.title ?? e.experience_id ?? '—';
            return `<tr>
              <td class="text-small text-muted no-wrap">${fmtDate(e.created_at)}</td>
              <td class="text-small">${escHtml(expTitle)}</td>
              <td class="text-bold">${escHtml(e.name ?? '—')}</td>
              <td class="text-small">${escHtml(e.email ?? '—')}</td>
              <td class="text-small">${escHtml(e.phone ?? '—')}</td>
              <td class="text-small" style="text-align:center">${e.participants_count ?? 1}</td>
              <td><span class="badge ${s.cls}">${s.label}</span></td>
              <td>
                <div style="display:flex;gap:4px;flex-wrap:wrap">
                  ${e.status !== 'contacted'  ? `<button class="adm-btn adm-btn--ghost adm-btn--sm" onclick="setWlStatus('${e.id}','contacted')">Contatado</button>` : ''}
                  ${e.status !== 'converted'  ? `<button class="adm-btn adm-btn--ghost adm-btn--sm" onclick="setWlStatus('${e.id}','converted')">Convertido</button>` : ''}
                  ${e.status !== 'cancelled'  ? `<button class="adm-btn adm-btn--danger adm-btn--sm" onclick="setWlStatus('${e.id}','cancelled')">Descartar</button>` : ''}
                </div>
              </td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>
    </div>`;
}

async function setWlStatus(id, status) {
  const db = window.anauaDb;
  if (!db) return;
  const { error } = await db.from('waitlist_entries').update({ status }).eq('id', id);
  if (error) { toast('Erro ao atualizar: ' + error.message, 'error'); return; }
  toast('Status atualizado.', 'success');
  navigate('#lista-espera');
}

// ─────────────────────────────────────────────────────────────────────────────
//  MODULE: PONTOS DE EMBARQUE (catálogo reutilizável)
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
    <div class="adm-card">
      <div class="adm-filter-bar">
        <input type="search" class="adm-input" id="saidas-filter" placeholder="Filtrar por experiência, título ou data…" />
        <select id="saidas-status">
          <option value="">Todos os status</option>
          <option value="scheduled">Aberta</option>
          <option value="sold_out">Esgotada</option>
          <option value="cancelled">Cancelada</option>
        </select>
        <button class="adm-btn adm-btn--primary" id="saidas-new-btn">➕ Nova Saída</button>
        <span class="adm-filter-count" id="saidas-count"></span>
      </div>
      <div class="adm-table-wrap">
        <table class="adm-table">
          <thead><tr><th>Data</th><th>Título / Experiência</th><th>Capacidade</th><th>Preço</th><th>Status</th><th></th></tr></thead>
          <tbody id="saidas-tbody"><tr><td colspan="6" class="adm-table__empty text-muted">Carregando…</td></tr></tbody>
        </table>
      </div>
    </div>`;

  const db = window.anauaDb;
  let allExits = [];
  let experiences = [];

  if (db) {
    const [exitsRes, expsRes] = await Promise.all([
      db.from('departures')
        .select('id, experience_id, title, start_at, capacity, price, status, experiences(title)')
        .order('start_at', { ascending: false }),
      db.from('experiences').select('id, title').eq('is_active', true).order('title'),
    ]);

    if (exitsRes.error) {
      console.warn('[hardening-2.1] Erro ao carregar saídas:', exitsRes.error.message);
      $('saidas-tbody').innerHTML = `<tr><td colspan="6" class="adm-table__empty" style="color:var(--adm-danger)">Não foi possível carregar as saídas.</td></tr>`;
      return;
    }

    allExits = (exitsRes.data ?? []).map(d => ({
      exp:  { title: d.experiences?.title ?? d.experience_id ?? '—', id: d.experience_id },
      exit: { id: d.id, start_at: d.start_at, status: d.status ?? 'scheduled', capacity: d.capacity ?? 0, title: d.title ?? '', price: d.price ?? null },
    }));
    _exitsCache = allExits;
    experiences = expsRes.data ?? [];
    console.log('[hardening-2.1] Saídas carregadas ✓', allExits.length);
  }

  function renderRows(data) {
    const tbody = $('saidas-tbody');
    $('saidas-count').textContent = `${data.length} saída(s)`;
    tbody.innerHTML = data.map(({ exp, exit }) => {
      const st = exit.status === 'cancelled' ? 'cancelled' : exit.status === 'sold_out' ? 'soldout' : 'active';
      const stLabel = st === 'soldout' ? 'Esgotada' : st === 'cancelled' ? 'Cancelada' : 'Aberta';
      const depTitle = exit.title ?? exp.title;
      return `<tr>
        <td class="no-wrap">${fmtDate(exit.start_at)}</td>
        <td>
          <div class="text-bold">${escHtml(depTitle)}</div>
          <div class="text-small text-muted">${escHtml(exp.title)}</div>
        </td>
        <td>${exit.capacity} vagas</td>
        <td class="no-wrap">${exit.price != null ? fmt(exit.price) : '<span class="text-muted">—</span>'}</td>
        <td><span class="badge badge--${st}">${stLabel}</span></td>
        <td style="white-space:nowrap">
          <button class="adm-btn adm-btn--ghost adm-btn--sm" data-exit="${exit.id}">Detalhes</button>
          <button class="adm-btn adm-btn--ghost adm-btn--sm" onclick="duplicateDeparture('${exit.id}')">Duplicar</button>
        </td>
      </tr>`;
    }).join('') || `<tr><td colspan="6" class="adm-table__empty text-muted">Nenhuma saída encontrada.</td></tr>`;
    tbody.querySelectorAll('[data-exit]').forEach(btn => btn.addEventListener('click', () => openExitDrawer(btn.dataset.exit)));
  }

  function filtered() {
    const q = $('saidas-filter').value.toLowerCase();
    const s = $('saidas-status').value;
    return allExits.filter(({ exp, exit }) => {
      const matchQ = !q || exp.title.toLowerCase().includes(q)
        || (exit.title ?? '').toLowerCase().includes(q)
        || (exit.start_at ?? '').includes(q);
      const matchS = !s || exit.status === s;
      return matchQ && matchS;
    });
  }

  $('saidas-filter').addEventListener('input',  () => renderRows(filtered()));
  $('saidas-status').addEventListener('change', () => renderRows(filtered()));

  $('saidas-new-btn').addEventListener('click', async () => {
    if (!experiences.length) {
      const { data: freshExps } = await db.from('experiences').select('id, title').eq('is_active', true).order('title');
      experiences = freshExps ?? [];
    }
    openExitFormDrawer(null, null, experiences, () => renderSaidas(root));
  });

  renderRows(allExits);
}

// ─────────────────────────────────────────────────────────────────────────────
//  MODULE: RESERVAS
// ─────────────────────────────────────────────────────────────────────────────

async function renderReservas(root, openId) {
  const STATUS_TABS = [
    { key: 'all',             label: 'Todas'       },
    { key: 'pending_payment', label: 'Aguardando'  },
    { key: 'reserved',        label: 'Reservado'   },
    { key: 'confirmed',       label: 'Confirmado'  },
    { key: 'cancelled',       label: 'Cancelado'   },
    { key: 'completed',       label: 'Concluído'   },
  ];

  let allBookings = [];
  let activeTab   = 'all';
  let search      = '';

  root.innerHTML = `
    <div class="adm-card">
      <div class="adm-tabs" id="reservas-tabs"></div>
      <div class="adm-filter-bar">
        <input type="search" class="adm-input" id="reservas-search" placeholder="Buscar por nome, e-mail, código…" />
        <span class="adm-filter-count" id="reservas-count"></span>
      </div>
      <div class="adm-table-wrap">
        <table class="adm-table">
          <thead><tr><th>Código</th><th>Responsável</th><th>Experiência</th><th>Status</th><th>Total</th><th>Pago</th><th>Criado em</th></tr></thead>
          <tbody id="reservas-tbody"><tr><td colspan="7" class="adm-table__empty text-muted">Carregando…</td></tr></tbody>
        </table>
      </div>
    </div>`;

  const db = window.anauaDb;
  if (db) {
    const { data, error } = await db
      .from('reservations')
      .select('id, experience_id, reservation_status, total_amount, amount_paid, created_at, customer_name, customer_email, departure_id')
      .order('created_at', { ascending: false });
    if (!error) {
      allBookings = data ?? [];
      console.log('[admin-db] Reservas carregadas:', allBookings.length);
    } else {
      console.warn('[admin-db] Erro ao carregar reservas:', error.message);
      $('reservas-tbody').innerHTML = `<tr><td colspan="7" class="adm-table__empty" style="color:var(--adm-danger)">Não foi possível carregar as reservas.</td></tr>`;
      return;
    }
  }

  function countTab(key) {
    return key === 'all' ? allBookings.length : allBookings.filter(b => b.reservation_status === key).length;
  }

  function renderTabs() {
    $('reservas-tabs').innerHTML = STATUS_TABS.map(t => `
      <button class="adm-tab ${activeTab === t.key ? 'is-active' : ''}" data-tab="${t.key}">
        ${t.label} <span class="adm-count">${countTab(t.key)}</span>
      </button>`).join('');
    $('reservas-tabs').querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => { activeTab = btn.dataset.tab; renderTabs(); renderTable(filtered()); });
    });
  }

  function filtered() {
    return allBookings.filter(b => {
      const matchTab = activeTab === 'all' || b.reservation_status === activeTab;
      const q = search.toLowerCase();
      const matchSearch = !q
        || b.id.toLowerCase().includes(q)
        || (b.customer_name  ?? '').toLowerCase().includes(q)
        || (b.customer_email ?? '').toLowerCase().includes(q);
      return matchTab && matchSearch;
    });
  }

  function renderTable(data) {
    $('reservas-count').textContent = `${data.length} reserva(s)`;
    $('reservas-tbody').innerHTML = data.length ? data.map(b => `<tr>
      <td class="no-wrap text-small text-muted">${escHtml(b.id)}</td>
      <td>
        <div style="display:flex;align-items:center;gap:7px">
          <div class="adm-avatar">${escHtml((b.customer_name ?? '?')[0].toUpperCase())}</div>
          <div>
            <div class="text-bold">${escHtml(b.customer_name ?? '—')}</div>
            <div class="text-small text-muted">${escHtml(b.customer_email ?? '')}</div>
          </div>
        </div>
      </td>
      <td class="text-small">${escHtml(b.experience_id ?? '—')}</td>
      <td>${badge(b.reservation_status ?? 'pending_payment')}</td>
      <td class="text-bold no-wrap">${fmt(b.total_amount ?? 0)}</td>
      <td class="no-wrap">${b.amount_paid > 0 ? '<span class="text-green">' + fmt(b.amount_paid) + '</span>' : '<span class="text-muted">—</span>'}</td>
      <td class="text-small text-muted no-wrap">${fmtDateShort(b.created_at)}</td>
    </tr>`).join('') : `<tr><td colspan="7" class="adm-table__empty text-muted">Nenhuma reserva.</td></tr>`;
  }

  renderTabs();
  renderTable(filtered());

  $('reservas-search').addEventListener('input', e => { search = e.target.value; renderTable(filtered()); });
}

// ─────────────────────────────────────────────────────────────────────────────
//  MODULE: PARTICIPANTES
// ─────────────────────────────────────────────────────────────────────────────

async function renderParticipantes(root) {
  let participants = [];
  let search = '';

  root.innerHTML = `
    <div class="adm-card">
      <div class="adm-filter-bar">
        <input type="search" class="adm-input" id="part-search" placeholder="Buscar por nome ou documento…" />
        <span class="adm-filter-count" id="part-count"></span>
      </div>
      <div class="adm-table-wrap">
        <table class="adm-table">
          <thead><tr><th>Nome</th><th>Documento</th><th>Perfil</th><th>Nascimento</th><th>Reserva</th><th>Status</th></tr></thead>
          <tbody id="part-tbody"><tr><td colspan="6" class="adm-table__empty text-muted">Carregando…</td></tr></tbody>
        </table>
      </div>
    </div>`;

  const db = window.anauaDb;
  if (db) {
    const { data, error } = await db
      .from('participants')
      .select('id, name, profile_type, birthdate, reservation_id, reservations(reservation_status)')
      .order('id');
    if (!error) {
      participants = data ?? [];
      console.log('[admin-db] Participantes carregados:', participants.length);
    } else {
      console.warn('[admin-db] Erro ao carregar participantes:', error.message);
      $('part-tbody').innerHTML = `<tr><td colspan="6" class="adm-table__empty" style="color:var(--adm-danger)">Não foi possível carregar os participantes.</td></tr>`;
      return;
    }
  }

  function filtered() {
    const q = search.toLowerCase();
    return !q ? participants : participants.filter(p =>
      (p.name ?? '').toLowerCase().includes(q)
    );
  }

  function renderTable(data) {
    $('part-count').textContent = `${data.length} participante(s)`;
    $('part-tbody').innerHTML = data.length ? data.map(p => `<tr>
      <td>
        <div style="display:flex;align-items:center;gap:7px">
          <div class="adm-avatar">${initials(p.name)}</div>
          <div class="text-bold">${escHtml(p.name ?? '—')}</div>
        </div>
      </td>
      <td class="text-small text-muted">—</td>
      <td class="text-small">${escHtml(p.profile_type ?? '—')}</td>
      <td class="text-small text-muted">${p.birthdate ? fmtDate(p.birthdate) : '—'}</td>
      <td class="text-small text-muted">${escHtml(p.reservation_id ?? '—')}</td>
      <td>${badge(p.reservations?.reservation_status ?? 'pending_payment')}</td>
    </tr>`).join('') : `<tr><td colspan="6" class="adm-table__empty text-muted">Nenhum participante.</td></tr>`;
  }

  renderTable(filtered());
  $('part-search').addEventListener('input', e => { search = e.target.value; renderTable(filtered()); });
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
      db.from('payments').select('id, reservation_id, amount, payment_method, status, paid_at, reservations(experience_id, reservation_status)').order('paid_at', { ascending: false }),
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
      return [p.reservation_id, r.experience_id ?? '', p.payment_method ?? '', p.amount ?? 0, p.status ?? '', p.paid_at ?? '', r.reservation_status ?? '']
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
    .single();

  const cfg = (error || !data) ? {} : (data.value ?? {});
  const res = cfg.reservations ?? {};
  const ntf = cfg.notifications ?? {};

  if (error && error.code !== 'PGRST116') {
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
        .single();

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

  const st = exit.status === 'cancelled' ? 'cancelled' : exit.status === 'sold_out' ? 'soldout' : 'active';
  const stLabel = st === 'soldout' ? 'Esgotada' : st === 'cancelled' ? 'Cancelada' : 'Aberta';

  // Load boarding points eagerly
  const { data: bps } = await listAllBoardingPointsByDeparture(exit.id);
  const bpsHtml = bps?.length
    ? bps.map(bp => {
        const pickupStr = bp.pickupAt
          ? new Date(bp.pickupAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
          : '—';
        const activeTag = bp.isActive ? '' : ' <span style="font-size:10px;background:#999;color:#fff;border-radius:3px;padding:0 4px">inativo</span>';
        return `<div style="border-left:3px solid var(--adm-primary,#2d6a4f);padding:6px 10px;margin-bottom:6px;line-height:1.5">
          <strong>${escHtml(bp.displayName)}</strong>${activeTag}<br>
          <span style="font-size:12px;color:var(--adm-text-muted)">🕐 Embarque: ${pickupStr}${bp.displayAddress ? ' · ' + escHtml(bp.displayAddress) : ''}</span>
          ${bp.notes ? `<br><span style="font-size:11px;color:var(--adm-text-muted)">${escHtml(bp.notes)}</span>` : ''}
        </div>`;
      }).join('')
    : '<p class="text-muted text-small">Nenhum ponto cadastrado.</p>';

  const html = `
    <div class="adm-section">
      <div class="adm-section__title">Saída</div>
      <div class="adm-dl">
        <dt>Experiência</dt><dd class="text-bold">${escHtml(exp.title)}</dd>
        ${exit.title ? `<dt>Título</dt><dd>${escHtml(exit.title)}</dd>` : ''}
        <dt>Data/Hora início</dt><dd>${fmtDate(exit.start_at)}</dd>
        ${exit.end_at ? `<dt>Data/Hora fim</dt><dd>${fmtDate(exit.end_at)}</dd>` : ''}
        <dt>Capacidade</dt><dd>${exit.capacity} vagas</dd>
        ${exit.price != null ? `<dt>Preço</dt><dd>${fmt(exit.price)}</dd>` : ''}
        <dt>Status</dt><dd><span class="badge badge--${st}">${stLabel}</span></dd>
      </div>
    </div>

    <div class="adm-section">
      <div class="adm-section__title">Pontos de embarque (${bps?.length ?? 0})</div>
      ${bpsHtml}
    </div>

    <div class="adm-section">
      <div class="adm-section__title">Ações</div>
      <div style="display:flex;flex-direction:column;gap:var(--sp-3)">
        <button class="adm-btn adm-btn--secondary" id="exit-edit-btn">✏️ Editar saída</button>
        ${exit.status !== 'scheduled'
          ? `<button class="adm-btn adm-btn--secondary" data-set-status="scheduled">✅ Reabrir saída</button>`
          : ''}
        ${exit.status !== 'sold_out'
          ? `<button class="adm-btn adm-btn--secondary" data-set-status="sold_out">🔒 Marcar como esgotada</button>`
          : ''}
        ${exit.status !== 'cancelled'
          ? `<button class="adm-btn adm-btn--danger" data-set-status="cancelled">🚫 Cancelar saída</button>`
          : ''}
      </div>
    </div>

    <div class="adm-section">
      <div class="adm-section__title">Reservas nesta saída</div>
      <div class="text-muted text-small">Visualização por saída disponível em breve.</div>
    </div>
  `;

  openDrawer(`${exp.title} — ${fmtDate(exit.start_at)}`, html);

  // Edit button
  document.getElementById('exit-edit-btn')?.addEventListener('click', async () => {
    const db = window.anauaDb;
    const { data: exps } = db ? await db.from('experiences').select('id, title').eq('is_active', true).order('title') : { data: [] };
    closeDrawer();
    openExitFormDrawer(exit, exp, exps ?? [], (updatedPayload) => {
      const r = findExit(exit.id);
      if (r && updatedPayload) Object.assign(r.exit, updatedPayload);
    });
  });

  // Status change buttons
  document.querySelectorAll('[data-set-status]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const newStatus = btn.dataset.setStatus;
      const label = { scheduled: 'reaberta', sold_out: 'marcada como esgotada', cancelled: 'cancelada' }[newStatus];
      const { error } = await setDepartureStatus(exit.id, newStatus);
      if (error) { toast('Erro: ' + error.message, 'error'); return; }
      exit.status = newStatus;
      const r = findExit(exit.id);
      if (r) r.exit.status = newStatus;
      toast(`Saída ${label} com sucesso!`, 'success');
      closeDrawer();
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
  const isEdit = exit !== null;

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
            value="${exit?.capacity ?? ''}" min="1" placeholder="10" />
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
      <div id="ef-bp-list" style="display:flex;flex-direction:column;gap:10px"></div>
      <button type="button" class="adm-btn adm-btn--ghost adm-btn--sm" id="ef-add-bp-btn" style="margin-top:8px">+ Adicionar ponto de embarque</button>

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
          if (sv && !document.getElementById(pid)?.value) dtpSetValue(pid, sv);
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
  document.getElementById('ef-add-custom-bp-btn')?.addEventListener('click', () => addCustomBpRow());

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
    if (capEl   && !capEl.value)   capEl.value   = fullExp.max_participants ?? '';
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
    document.querySelectorAll('#ef-bp-catalog-list input[type="checkbox"]:checked').forEach(cb => {
      const pid = 'ef-bpcat-pickup-' + cb.dataset.bpid;
      if (!document.getElementById(pid)?.value) dtpSetValue(pid, sv);
    });
    document.querySelectorAll('[id^="ef-custom-bp-"]').forEach(r => {
      const pid = 'ef-cust-pickup-' + r.id.replace('ef-custom-bp-', '');
      if (!document.getElementById(pid)?.value) dtpSetValue(pid, sv);
    });
  });

  // ── Form submit ──────────────────────────────────────────────────────────
  document.getElementById('ef-form')?.addEventListener('submit', async e => {
    e.preventDefault();

    const expId    = document.getElementById('ef-exp')?.value;
    const depTitle = document.getElementById('ef-title')?.value.trim() || null;
    const startAt  = document.getElementById('ef-start')?.value;
    const endAt    = document.getElementById('ef-end')?.value || null;
    const capacity = parseInt(document.getElementById('ef-capacity')?.value, 10);
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
  toast('Saindo do backoffice…', 'info');
  setTimeout(adminLogout, 800);
});

$('adm-notif-dot').classList.add('is-visible');
