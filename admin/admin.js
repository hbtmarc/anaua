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

// findExit — retorna null (EXPERIENCES local removido; dados vêm do Supabase)
function findExit(_exitId) { return null; }

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
  experiencias:   { title: 'Experiências',   render: renderExperiencias, primaryAction: pa => { pa.innerHTML = '<button class="adm-btn adm-btn--primary adm-btn--sm" onclick="openNovaExperienciaModal()">+ Nova experiência</button>'; pa.style.display = ''; } },
  saidas:         { title: 'Saídas',         render: renderSaidas },
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
    db.from('reservations').select('id, reservation_code, payer_name, reservation_status, total_amount, created_at').order('created_at', { ascending: false }).limit(6),
    db.from('departures').select('id, date, status, spots_total, spots_available, experience_id, experiences(title)').gte('date', new Date().toISOString().split('T')[0]).eq('status', 'scheduled').order('date').limit(5),
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
              <td class="no-wrap text-small text-muted">${escHtml(r.reservation_code ?? r.id)}</td>
              <td class="text-bold">${escHtml(r.payer_name ?? '—')}</td>
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
              const booked = (d.spots_total ?? 0) - (d.spots_available ?? 0);
              const pct    = d.spots_total ? (booked / d.spots_total) * 100 : 0;
              const title  = d.experiences?.title ?? d.experience_id ?? '—';
              return `<tr>
                <td class="no-wrap">${fmtDateShort(d.date)}</td>
                <td>${escHtml(title)}</td>
                <td style="min-width:120px">${occFill(pct)}</td>
                <td class="text-bold">${d.spots_available ?? 0}/${d.spots_total ?? 0}</td>
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
      .select('id, date, status, spots_total, spots_available, experience_id, experiences(title)')
      .order('date');
    if (!error) {
      allExits = (data ?? []).map(d => ({
        exp:  { title: d.experiences?.title ?? d.experience_id ?? '—', id: d.experience_id },
        exit: { id: d.id, date: d.date, status: d.status, spotsTotal: d.spots_total ?? 0, spotsAvailable: d.spots_available ?? 0 },
      }));
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
      const dayEx = allExits.filter(x => x.exit.date === ds);
      const isToday = ds === todayStr;
      const evts = dayEx.map(({ exp, exit }) => {
        const pct = exit.spotsTotal ? ((exit.spotsTotal - exit.spotsAvailable) / exit.spotsTotal) * 100 : 0;
        const cls = exit.spotsAvailable === 0 ? 'is-sold' : pct >= 70 ? 'is-hot' : '';
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
    const sorted = [...allExits].sort((a, b) => a.exit.date.localeCompare(b.exit.date));
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
            <tbody>${sorted.length ? sorted.map(({ exp, exit }) => {
              const booked = exit.spotsTotal - exit.spotsAvailable;
              const pct = exit.spotsTotal ? (booked / exit.spotsTotal) * 100 : 0;
              const st = exit.spotsAvailable === 0 ? 'soldout' : exit.status === 'cancelled' ? 'cancelled' : 'active';
              return `<tr>
                <td class="no-wrap">${fmtDate(exit.date)}</td>
                <td>${escHtml(exp.title)}</td>
                <td>${exit.spotsAvailable}/${exit.spotsTotal}</td>
                <td style="min-width:120px">${occFill(pct)}</td>
                <td><span class="badge badge--${st}">${st === 'soldout' ? 'Esgotada' : st === 'cancelled' ? 'Cancelada' : 'Aberta'}</span></td>
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
                <button class="adm-btn adm-btn--danger adm-btn--sm" onclick="deactivateExp('${exp.id}','${escHtml(exp.title ?? '')}')">${exp.is_active !== false ? 'Desativar' : 'Reativar'}</button>
              </div>
            </td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
    </div>`;
}

function openNovaExperienciaModal() {
  openDrawer('Nova experiência', `
    <form id="exp-form" style="display:flex;flex-direction:column;gap:14px">
      <div class="adm-field"><label>Título *</label><input id="exp-title" class="adm-input" required placeholder="Ex: Trilha do Pico" /></div>
      <div class="adm-field">
        <label>Slug *</label>
        <input id="exp-slug" class="adm-input" required placeholder="trilha-do-pico" />
        <span style="font-size:11px;color:var(--adm-text-muted)">Gerado automaticamente. Pode editar.</span>
      </div>
      <div class="adm-field"><label>Subtítulo</label><input id="exp-subtitle" class="adm-input" placeholder="Frase curta de apresentação" /></div>
      <div class="adm-field"><label>Descrição</label><textarea id="exp-description" class="adm-input" rows="3" placeholder="Descrição completa da experiência"></textarea></div>
      <div class="adm-grid-2">
        <div class="adm-field"><label>Local</label><input id="exp-location" class="adm-input" placeholder="Ex: Serra da Canastra" /></div>
        <div class="adm-field"><label>Categoria</label>
          <select id="exp-category" class="adm-input">
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
          <select id="exp-difficulty" class="adm-input">
            <option value="">— selecione —</option>
            <option value="iniciante">Iniciante (Fácil)</option>
            <option value="moderado">Moderado</option>
            <option value="aventura">Aventura (Difícil)</option>
          </select>
        </div>
        <div class="adm-field"><label>Preço base (R$)</label><input id="exp-price" class="adm-input" type="number" min="0" step="0.01" placeholder="0,00" /></div>
      </div>
      <div class="adm-grid-2">
        <div class="adm-field"><label>Duração (horas)</label><input id="exp-duration" class="adm-input" type="number" min="0.5" step="0.5" placeholder="Ex: 8" /></div>
        <div class="adm-field"><label>Capacidade máxima</label><input id="exp-capacity" class="adm-input" type="number" min="1" step="1" placeholder="Ex: 20" /></div>
      </div>
      <div class="adm-field">
        <label>Imagem de capa</label>
        <div id="exp-cover-widget" class="adm-upload-widget">
          <input type="file" id="exp-cover-file" accept="image/*" style="display:none" />
          <div id="exp-cover-preview" class="adm-upload-preview" style="display:none">
            <img id="exp-cover-img" src="" alt="Pré-visualização" />
            <div style="display:flex;flex-direction:column;gap:6px">
              <span id="exp-cover-name" class="adm-upload-status"></span>
              <button type="button" class="adm-btn adm-btn--ghost adm-btn--sm" onclick="document.getElementById('exp-cover-file').click()">Trocar imagem</button>
            </div>
          </div>
          <div id="exp-cover-empty" class="adm-upload-empty">
            <button type="button" class="adm-btn adm-btn--secondary adm-btn--sm" onclick="document.getElementById('exp-cover-file').click()">📷 Escolher imagem</button>
            <span id="exp-cover-status" class="adm-upload-status"></span>
          </div>
          <input type="hidden" id="exp-cover" />
        </div>
      </div>
      <div class="adm-field" style="flex-direction:row;align-items:center;gap:10px">
        <input id="exp-active" type="checkbox" checked style="width:18px;height:18px" />
        <label for="exp-active" style="margin:0">Ativa (visível no site)</label>
      </div>
      <div style="display:flex;gap:10px;margin-top:8px">
        <button type="submit" id="exp-save-btn" class="adm-btn adm-btn--primary" style="flex:1">Salvar experiência</button>
        <button type="button" class="adm-btn adm-btn--secondary" onclick="closeDrawer()">Cancelar</button>
      </div>
    </form>`);

  // Auto-gera slug a partir do título (somente enquanto não foi editado manualmente)
  let slugManuallyEdited = false;
  document.getElementById('exp-slug')?.addEventListener('input', () => { slugManuallyEdited = true; });
  document.getElementById('exp-title')?.addEventListener('input', e => {
    if (slugManuallyEdited) return;
    const slug = e.target.value
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim().replace(/\s+/g, '-');
    const slugEl = document.getElementById('exp-slug');
    if (slugEl) slugEl.value = slug;
  });

  document.getElementById('exp-cover-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    await uploadExperienciaCover(file);
  });

  document.getElementById('exp-form').addEventListener('submit', async e => {
    e.preventDefault();
    const db = window.anauaDb;
    if (!db) { toast('Supabase não disponível.', 'error'); return; }

    const saveBtn = document.getElementById('exp-save-btn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Salvando…'; }

    const payload = {
      title:            document.getElementById('exp-title').value.trim(),
      slug:             document.getElementById('exp-slug').value.trim(),
      subtitle:         document.getElementById('exp-subtitle')?.value.trim() || null,
      description:      document.getElementById('exp-description')?.value.trim() || null,
      location:         document.getElementById('exp-location').value.trim() || null,
      category:         document.getElementById('exp-category').value.trim() || null,
      difficulty:       document.getElementById('exp-difficulty').value || null,
      base_price:       parseFloat(document.getElementById('exp-price').value) || 0,
      duration_hours:   parseFloat(document.getElementById('exp-duration')?.value) || null,
      max_participants: parseInt(document.getElementById('exp-capacity')?.value, 10) || null,
      cover_image_url:  document.getElementById('exp-cover').value.trim() || null,
      is_active:        document.getElementById('exp-active').checked,
    };

    const { error } = await db.from('experiences').insert(payload);
    if (error) {
      console.warn('[admin-db] Erro ao salvar experiência:', error.message);
      toast('Não foi possível salvar. ' + error.message, 'error');
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Salvar experiência'; }
      return;
    }

    console.log('[admin-db] Nova experiência salva:', payload.title);
    toast('Experiência cadastrada com sucesso!', 'success');
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

  $('adm-drawer-title').textContent = 'Editar experiência';
  $('adm-drawer-body').innerHTML = `
    <form id="exp-form" style="display:flex;flex-direction:column;gap:14px">
      <div class="adm-field"><label>Título *</label><input id="exp-title" class="adm-input" required value="${escHtml(row.title ?? '')}" /></div>
      <div class="adm-field">
        <label>Slug *</label>
        <input id="exp-slug" class="adm-input" required value="${escHtml(row.slug ?? '')}" />
      </div>
      <div class="adm-field"><label>Subtítulo</label><input id="exp-subtitle" class="adm-input" value="${escHtml(row.subtitle ?? '')}" /></div>
      <div class="adm-field"><label>Descrição</label><textarea id="exp-description" class="adm-input" rows="3">${escHtml(row.description ?? '')}</textarea></div>
      <div class="adm-grid-2">
        <div class="adm-field"><label>Local</label><input id="exp-location" class="adm-input" value="${escHtml(row.location ?? '')}" /></div>
        <div class="adm-field"><label>Categoria</label>
          <select id="exp-category" class="adm-input">
            <option value="">— selecione —</option>
            <option value="day-experience" ${row.category === 'day-experience' ? 'selected' : ''}>Experiência de 1 dia</option>
            <option value="expedition" ${row.category === 'expedition' ? 'selected' : ''}>Expedição</option>
            <option value="event" ${row.category === 'event' ? 'selected' : ''}>Evento</option>
            <option value="kids" ${row.category === 'kids' ? 'selected' : ''}>Kids</option>
          </select>
        </div>
      </div>
      <div class="adm-grid-2">
        <div class="adm-field"><label>Dificuldade</label>
          <select id="exp-difficulty" class="adm-input">
            <option value="">— selecione —</option>
            <option value="iniciante" ${row.difficulty === 'iniciante' ? 'selected' : ''}>Iniciante (Fácil)</option>
            <option value="moderado" ${row.difficulty === 'moderado' ? 'selected' : ''}>Moderado</option>
            <option value="aventura" ${row.difficulty === 'aventura' ? 'selected' : ''}>Aventura (Difícil)</option>
          </select>
        </div>
        <div class="adm-field"><label>Preço base (R$)</label><input id="exp-price" class="adm-input" type="number" min="0" step="0.01" value="${row.base_price ?? 0}" /></div>
      </div>
      <div class="adm-grid-2">
        <div class="adm-field"><label>Duração (horas)</label><input id="exp-duration" class="adm-input" type="number" min="0.5" step="0.5" value="${row.duration_hours ?? ''}" /></div>
        <div class="adm-field"><label>Capacidade máxima</label><input id="exp-capacity" class="adm-input" type="number" min="1" step="1" value="${row.max_participants ?? ''}" /></div>
      </div>
      <div class="adm-field">
        <label>URL da imagem de capa</label>
        <input id="exp-cover" class="adm-input" type="url" value="${escHtml(row.cover_image_url ?? '')}" placeholder="https://..." />
        <span style="font-size:11px;color:var(--adm-text-muted)">Cole a URL ou use o botão abaixo para fazer upload.</span>
        <button type="button" class="adm-btn adm-btn--ghost adm-btn--sm" style="margin-top:6px" onclick="document.getElementById('exp-cover-file-edit').click()">📷 Trocar imagem</button>
        <input type="file" id="exp-cover-file-edit" accept="image/*" style="display:none" />
      </div>
      <div class="adm-field" style="flex-direction:row;align-items:center;gap:10px">
        <input id="exp-active" type="checkbox" style="width:18px;height:18px" ${row.is_active !== false ? 'checked' : ''} />
        <label for="exp-active" style="margin:0">Ativa (visível no site)</label>
      </div>
      <div style="display:flex;gap:10px;margin-top:8px">
        <button type="submit" id="exp-save-btn" class="adm-btn adm-btn--primary" style="flex:1">Salvar alterações</button>
        <button type="button" class="adm-btn adm-btn--secondary" onclick="closeDrawer()">Cancelar</button>
      </div>
    </form>`;

  // Upload de imagem no modo edição
  document.getElementById('exp-cover-file-edit')?.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file || !db) return;
    const statusEl = document.getElementById('exp-cover');
    if (statusEl) statusEl.placeholder = 'Enviando…';
    const ext  = file.name.split('.').pop();
    const path = `covers/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: upErr } = await db.storage.from('experience-covers').upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });
    if (upErr) { toast('Erro no upload: ' + upErr.message, 'error'); return; }
    const { data: pub } = db.storage.from('experience-covers').getPublicUrl(path);
    if (statusEl) statusEl.value = pub.publicUrl;
    toast('Imagem enviada!', 'success');
  });

  document.getElementById('exp-form').addEventListener('submit', async e => {
    e.preventDefault();
    const saveBtn = document.getElementById('exp-save-btn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Salvando…'; }

    const payload = {
      title:            document.getElementById('exp-title').value.trim(),
      slug:             document.getElementById('exp-slug').value.trim(),
      subtitle:         document.getElementById('exp-subtitle')?.value.trim() || null,
      description:      document.getElementById('exp-description')?.value.trim() || null,
      location:         document.getElementById('exp-location').value.trim() || null,
      category:         document.getElementById('exp-category').value.trim() || null,
      difficulty:       document.getElementById('exp-difficulty').value || null,
      base_price:       parseFloat(document.getElementById('exp-price').value) || 0,
      duration_hours:   parseFloat(document.getElementById('exp-duration')?.value) || null,
      max_participants: parseInt(document.getElementById('exp-capacity')?.value, 10) || null,
      cover_image_url:  document.getElementById('exp-cover').value.trim() || null,
      is_active:        document.getElementById('exp-active').checked,
    };

    const { error: updErr } = await db.from('experiences').update(payload).eq('id', id);
    if (updErr) {
      console.error('[admin-db] Erro ao atualizar experiência:', updErr.message);
      toast('Não foi possível salvar. ' + updErr.message, 'error');
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Salvar alterações'; }
      return;
    }

    console.log('[admin-db] Experiência atualizada:', id);
    toast('Experiência atualizada!', 'success');
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
//  MODULE: SAÍDAS
// ─────────────────────────────────────────────────────────────────────────────

async function renderSaidas(root) {
  root.innerHTML = `
    <div class="adm-card">
      <div class="adm-filter-bar">
        <input type="search" class="adm-input" id="saidas-filter" placeholder="Filtrar por experiência ou data…" />
        <select id="saidas-status">
          <option value="">Todos os status</option>
          <option value="scheduled">Aberta</option>
          <option value="sold_out">Esgotada</option>
          <option value="cancelled">Cancelada</option>
        </select>
        <span class="adm-filter-count" id="saidas-count"></span>
      </div>
      <div class="adm-table-wrap">
        <table class="adm-table">
          <thead><tr><th>Data</th><th>Experiência</th><th>Vagas</th><th>Ocupação</th><th>Status</th><th></th></tr></thead>
          <tbody id="saidas-tbody"><tr><td colspan="6" class="adm-table__empty text-muted">Carregando…</td></tr></tbody>
        </table>
      </div>
    </div>`;

  const db = window.anauaDb;
  let allExits = [];

  if (db) {
    const { data, error } = await db
      .from('departures')
      .select('id, date, status, spots_total, spots_available, experience_id, experiences(title)')
      .order('date', { ascending: false });
    if (!error) {
      allExits = (data ?? []).map(d => ({
        exp:  { title: d.experiences?.title ?? d.experience_id ?? '—' },
        exit: { id: d.id, date: d.date, status: d.status ?? 'scheduled', spotsTotal: d.spots_total ?? 0, spotsAvailable: d.spots_available ?? 0 },
      }));
      console.log('[admin-db] Saídas carregadas:', allExits.length);
    } else {
      console.warn('[admin-db] Erro ao carregar saídas:', error.message);
      $('saidas-tbody').innerHTML = `<tr><td colspan="6" class="adm-table__empty" style="color:var(--adm-danger)">Não foi possível carregar as saídas.</td></tr>`;
      return;
    }
  }

  function renderRows(data) {
    const tbody = $('saidas-tbody');
    $('saidas-count').textContent = `${data.length} saída(s)`;
    tbody.innerHTML = data.map(({ exp, exit }) => {
      const booked = exit.spotsTotal - exit.spotsAvailable;
      const pct = exit.spotsTotal ? (booked / exit.spotsTotal) * 100 : 0;
      const isSoldOut = exit.spotsAvailable === 0;
      const st = isSoldOut ? 'soldout' : exit.status === 'cancelled' ? 'cancelled' : 'active';
      return `<tr>
        <td class="no-wrap">${fmtDate(exit.date)}</td>
        <td class="text-bold">${escHtml(exp.title)}</td>
        <td>${booked}/${exit.spotsTotal}</td>
        <td style="min-width:130px">${occFill(pct)}</td>
        <td><span class="badge badge--${st}">${st === 'soldout' ? 'Esgotada' : st === 'cancelled' ? 'Cancelada' : 'Aberta'}</span></td>
        <td><button class="adm-btn adm-btn--ghost adm-btn--sm" data-exit="${exit.id}">Detalhes</button></td>
      </tr>`;
    }).join('') || `<tr><td colspan="6" class="adm-table__empty text-muted">Nenhuma saída encontrada.</td></tr>`;
    tbody.querySelectorAll('[data-exit]').forEach(btn => btn.addEventListener('click', () => openExitDrawer(btn.dataset.exit)));
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

  $('saidas-filter').addEventListener('input',  () => renderRows(filtered()));
  $('saidas-status').addEventListener('change', () => renderRows(filtered()));
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
      .select('id, reservation_code, payer_name, payer_email, experience_id, reservation_status, total_amount, amount_paid, created_at')
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
      const matchSearch = !q ||
        (b.payer_name ?? '').toLowerCase().includes(q) ||
        (b.reservation_code ?? '').toLowerCase().includes(q) ||
        (b.payer_email ?? '').toLowerCase().includes(q);
      return matchTab && matchSearch;
    });
  }

  function renderTable(data) {
    $('reservas-count').textContent = `${data.length} reserva(s)`;
    $('reservas-tbody').innerHTML = data.length ? data.map(b => `<tr>
      <td class="no-wrap text-small text-muted">${escHtml(b.reservation_code ?? b.id)}</td>
      <td>
        <div style="display:flex;align-items:center;gap:7px">
          <div class="adm-avatar">${initials(b.payer_name)}</div>
          <div>
            <div class="text-bold">${escHtml(b.payer_name ?? '—')}</div>
            <div class="text-small text-muted">${escHtml(b.payer_email ?? '')}</div>
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
      .select('id, full_name, document_number, profile_type, birthdate, reservation_id, reservations(reservation_code, reservation_status)')
      .order('full_name');
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
      (p.full_name ?? '').toLowerCase().includes(q) ||
      (p.document_number ?? '').toLowerCase().includes(q)
    );
  }

  function renderTable(data) {
    $('part-count').textContent = `${data.length} participante(s)`;
    $('part-tbody').innerHTML = data.length ? data.map(p => `<tr>
      <td>
        <div style="display:flex;align-items:center;gap:7px">
          <div class="adm-avatar">${initials(p.full_name)}</div>
          <div class="text-bold">${escHtml(p.full_name ?? '—')}</div>
        </div>
      </td>
      <td class="text-small text-muted">${escHtml(p.document_number ?? '—')}</td>
      <td class="text-small">${escHtml(p.profile_type ?? '—')}</td>
      <td class="text-small text-muted">${p.birthdate ? fmtDate(p.birthdate) : '—'}</td>
      <td class="text-small text-muted">${escHtml(p.reservations?.reservation_code ?? p.reservation_id ?? '—')}</td>
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
      db.from('payments').select('id, reservation_id, amount, payment_method, status, paid_at, reservations(reservation_code, payer_name, payer_email, experience_id, reservation_status)').order('paid_at', { ascending: false }),
      db.from('reservations').select('id, reservation_code, payer_name, total_amount, amount_paid, reservation_status').order('created_at', { ascending: false }),
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
        <td class="text-small text-muted no-wrap">${escHtml(r.reservation_code ?? p.reservation_id ?? '—')}</td>
        <td>
          <div class="text-bold">${escHtml(r.payer_name ?? '—')}</div>
          <div class="text-small text-muted">${escHtml(r.payer_email ?? '')}</div>
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
    const cols = ['Código','Responsável','E-mail','Método','Valor','Status pag.','Data pag.','Status reserva'];
    const rows = tabPayments(activeTab).map(p => {
      const r = p.reservations ?? {};
      return [r.reservation_code ?? p.reservation_id, r.payer_name ?? '', r.payer_email ?? '', p.payment_method ?? '', p.amount ?? 0, p.status ?? '', p.paid_at ?? '', r.reservation_status ?? '']
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

  const bookings = []; // DB-first: detalhes de reservas por saída serão implementados no próximo sprint
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

$('adm-global-search').addEventListener('keydown', async e => {
  if (e.key !== 'Enter') return;
  const q = e.target.value.trim();
  if (!q) return;
  const db = window.anauaDb;
  if (!db) { toast('Supabase não disponível.', 'error'); return; }
  const { data } = await db
    .from('reservations')
    .select('id, reservation_code, payer_name, payer_email')
    .or(`reservation_code.ilike.%${q}%,payer_name.ilike.%${q}%`)
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
  root.innerHTML = `
    <div class="adm-card" style="max-width:900px">
      <div class="adm-card__header">
        Usuários
        <span class="text-small text-muted" style="margin-left:8px" id="adm-user-count"></span>
      </div>
      <div id="adm-users-body" style="padding:var(--adm-sp-4)">
        <p class="text-muted">Carregando usuários…</p>
      </div>
    </div>`;

  const db = window.anauaDb;
  if (!db) {
    $('adm-users-body').innerHTML = `<p style="color:var(--adm-danger)">Supabase não disponível.</p>`;
    return;
  }

  const { data: profiles, error } = await db
    .from('profiles')
    .select('id, email, display_name, role, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('[admin-users] Erro ao carregar usuários:', error.message);
    $('adm-users-body').innerHTML = `
      <p style="color:var(--adm-danger)">Não foi possível carregar os usuários.</p>
      <p class="text-muted text-small">${error.message}</p>`;
    return;
  }

  console.log('[admin-users] Usuários carregados:', profiles?.length ?? 0);
  const countEl = document.getElementById('adm-user-count');
  if (countEl) countEl.textContent = `(${profiles?.length ?? 0})`;

  const ROLES = ['customer', 'operator', 'admin'];
  const ROLE_LABEL = { customer: 'Cliente', operator: 'Operador', admin: 'Administrador' };
  const fmtDt = (iso) => iso ? new Date(iso).toLocaleDateString('pt-BR') : '—';

  $('adm-users-body').innerHTML = `
    <div class="adm-table-wrap">
      <table class="adm-table">
        <thead>
          <tr>
            <th>Nome</th>
            <th>E-mail</th>
            <th>Perfil</th>
            <th>Criado em</th>
          </tr>
        </thead>
        <tbody>
          ${(profiles ?? []).map(p => `
            <tr>
              <td>
                <div style="display:flex;align-items:center;gap:8px">
                  <div class="adm-avatar">${(p.display_name ?? p.email ?? '?')[0].toUpperCase()}</div>
                  <span>${p.display_name ?? '—'}</span>
                </div>
              </td>
              <td class="text-small text-muted">${p.email ?? '—'}</td>
              <td>
                <select
                  style="padding:4px 8px;border:1px solid var(--adm-border);border-radius:6px;background:var(--adm-surface);color:var(--adm-text);font-size:var(--adm-text-sm,0.8rem);cursor:pointer"
                  data-user-id="${p.id}"
                  aria-label="Perfil de ${p.display_name ?? p.email}"
                >
                  ${ROLES.map(r => `<option value="${r}"${r === p.role ? ' selected' : ''}>${ROLE_LABEL[r] ?? r}</option>`).join('')}
                </select>
              </td>
              <td class="text-small text-muted no-wrap">${fmtDt(p.created_at)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  // Role change handler
  $('adm-users-body').querySelectorAll('select[data-user-id]').forEach(sel => {
    sel.addEventListener('change', async () => {
      const userId  = sel.dataset.userId;
      const newRole = sel.value;
      sel.disabled  = true;

      const { error: updErr } = await db
        .from('profiles')
        .update({ role: newRole })
        .eq('id', userId);

      sel.disabled = false;

      if (updErr) {
        console.warn('[admin-users] Erro ao atualizar perfil:', updErr.message);
        toast('Erro ao atualizar perfil do usuário.', 'error');
        return;
      }

      console.log('[admin-users] Perfil atualizado — userId:', userId, '| role:', newRole);
      toast('Perfil atualizado com sucesso.', 'success');
    });
  });
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

    // renderDashboard carrega os dados do Supabase ao navegar para #dashboard

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
navigate(location.hash || '#dashboard');
