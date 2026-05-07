/**
 * @fileoverview cliente.js — Área do Cliente — Anauá Ecoturismo
 *
 * Tabs: Minhas Reservas | Dados da Conta | Emergência | Pagamento
 *
 * Auth: Supabase Auth (email + senha)
 * Dados: customer_profiles, emergency_contacts, customer_payment_methods (RLS por user_id)
 * Reservas: public.reservations com join em experiences + departures
 */
import { initPage, validateField, VALIDATORS, showToast, maskPhone, maskCPF } from './components.js';
import {
  getCustomerProfile, upsertCustomerProfile,
  getEmergencyContact, upsertEmergencyContact,
  listPaymentMethods, addPaymentMethod, removePaymentMethod, setDefaultPaymentMethod,
} from './repositories/customerRepo.js';
import { supabase } from './supabaseClient.js';
import { getUserReservations } from './repositories/reservationRepo.js';

initPage('cliente.html');

// ─── Módulo vars ─────────────────────────────────────────────────────────────
let _currentUser = null;

// Expõe funções em window para onclick inline em HTML gerado
window.__anauaToast        = showToast;
window.__removeCard        = removeCard;
window.__setDefaultCard    = setDefaultCard;
window.__reloadReservations = () => { if (_currentUser) loadReservations(_currentUser.id); };

// ─── Helpers ─────────────────────────────────────────────────────────────────
/** Escapa HTML para uso em template strings */
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtBRL(n) {
  return `R$ ${Number(n ?? 0).toFixed(2).replace('.', ',')}`;
}

function setFeedback(id, msg, type = 'error') {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className   = `dash-form__feedback dash-form__feedback--${type}`;
  el.style.display = msg ? '' : 'none';
}

// ─── Tabs ────────────────────────────────────────────────────────────────────
function initTabs() {
  document.querySelectorAll('.dash-tab').forEach(btn => {
    btn.addEventListener('click', () => activateTab(btn.dataset.tab));
  });
}

function activateTab(tabId) {
  document.querySelectorAll('.dash-tab').forEach(b =>
    b.classList.toggle('is-active', b.dataset.tab === tabId));
  document.querySelectorAll('.dash-panel').forEach(p =>
    p.classList.toggle('is-active', p.id === `panel-${tabId}`));
}

// ─── Status helpers ──────────────────────────────────────────────────────────
const STATUS_LABEL = {
  confirmed:       'Confirmada',
  reserved:        'Reservada',
  pending_payment: 'Aguardando pagamento',
  pending:         'Aguardando pagamento',
  cancelled:       'Cancelada',
  draft:           'Rascunho',
};
const STATUS_CLASS = {
  confirmed:       'resa-badge--confirmed',
  reserved:        'resa-badge--reserved',
  pending_payment: 'resa-badge--pending',
  pending:         'resa-badge--pending',
  cancelled:       'resa-badge--cancelled',
  draft:           'resa-badge--pending',
};

/**
 * Renders a reservation card using joined data from reservations + experiences + departures.
 * @param {object} r
 */
function renderReservationCard(r) {
  const status    = r.reservation_status ?? r.status ?? 'pending_payment';
  const statusLbl = STATUS_LABEL[status]  ?? status;
  const statusCls = STATUS_CLASS[status]  ?? 'resa-badge--pending';

  const exp      = r.experiences;
  const dep      = r.departures;
  const expTitle = exp?.title ?? r.experience_id ?? 'Experiência';
  const expSlug  = exp?.slug  ?? r.experience_id;
  const expHref  = expSlug ? `experiencia.html?id=${esc(expSlug)}` : 'experiencias.html';
  const bpLabel  = r.boarding_points?.name ?? dep?.boarding_points?.name ?? null;

  const departureDate = dep?.start_at
    ? new Date(dep.start_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
    : null;
  const bookedDate = r.created_at
    ? new Date(r.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

  const paid  = Number(r.amount_paid  ?? 0);
  const total = Number(r.total_amount ?? 0);
  const code  = r.reservation_code ?? r.id?.slice(0, 8).toUpperCase() ?? '—';

  const priceMain = paid > 0 ? fmtBRL(paid) : fmtBRL(total);
  const priceSub  = paid > 0 ? 'pago' : 'a confirmar';

  const payBtn = status === 'pending_payment'
    ? `<button class="btn btn--primary btn--sm" onclick="window.__anauaToast('Pagamento disponível em breve.','warn',4000)">Pagar agora</button>`
    : '';
  const cancelBtn = (status === 'confirmed' || status === 'reserved')
    ? `<button class="btn btn--ghost btn--sm" style="color:var(--color-muted)" onclick="window.__anauaToast('Para cancelar, entre em contato pelo WhatsApp.','info',6000)">Cancelar reserva</button>`
    : '';

  const calIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;

  return `
    <article class="resa-card" data-status="${esc(status)}" aria-label="Reserva ${esc(code)}">
      <div class="resa-card__body">
        <div>
          <p class="resa-card__title">${esc(expTitle)}</p>
          <p class="resa-card__code">Código: <strong>${esc(code)}</strong></p>
        </div>
        <div>
          <p class="resa-card__price">${priceMain}</p>
          <p class="resa-card__price-sub">${priceSub}</p>
        </div>
        <div class="resa-card__meta">
          ${departureDate ? `<span class="resa-meta-item">${calIcon} Saída: <strong>${esc(departureDate)}</strong></span>` : ''}
          ${bpLabel       ? `<span class="resa-meta-item">${calIcon} Embarque: <strong>${esc(bpLabel)}</strong></span>` : ''}
          <span class="resa-meta-item">${calIcon} Reservado em: ${esc(bookedDate)}</span>
        </div>
        <div class="resa-card__badges">
          <span class="resa-badge ${esc(statusCls)}">${esc(statusLbl)}</span>
        </div>
      </div>
      <div class="resa-card__footer">
        <a href="${esc(expHref)}" class="btn btn--secondary btn--sm">Ver experiência</a>
        ${payBtn}
        ${cancelBtn}
      </div>
    </article>`;
}

async function loadReservations(userId) {
  const container = document.getElementById('reservation-list');
  const countEl   = document.getElementById('resa-count');
  if (!container) return;

  // Skeleton loading
  container.innerHTML = `
    ${[1,2].map(() => `
      <div class="skel-card">
        <div class="skel skel-line skel-line--lg"></div>
        <div class="skel skel-line skel-line--md"></div>
        <div class="skel skel-line skel-line--full" style="margin-top:var(--sp-3)"></div>
        <div class="skel skel-line skel-line--sm" style="margin-top:var(--sp-2);max-width:20%"></div>
      </div>`).join('')}`;

  const { ok, data, error } = await getUserReservations(userId);

  if (!ok) {
    container.innerHTML = `
      <div class="resa-empty resa-empty--error">
        <div class="resa-empty__icon">🌲</div>
        <p>Não foi possível carregar suas reservas agora.</p>
        ${error ? `<p class="resa-empty__msg-detail">${esc(error)}</p>` : ''}
        <div class="resa-empty__actions">
          <button class="btn btn--primary" onclick="window.__reloadReservations()">Tentar novamente</button>
          <a href="contato.html" class="btn btn--secondary">Fale conosco</a>
        </div>
      </div>`;
    return;
  }
  if (!data.length) {
    container.innerHTML = `
      <div class="resa-empty">
        <div class="resa-empty__icon">🌿</div>
        <p>Você ainda não possui reservas. Que tal explorar nossas experiências?</p>
        <div class="resa-empty__actions">
          <a href="experiencias.html" class="btn btn--primary">Ver experiências</a>
        </div>
      </div>`;
    return;
  }
  if (countEl) { countEl.textContent = data.length; countEl.style.display = ''; }
  container.innerHTML = data.map(renderReservationCard).join('');
}

// ─── Booking draft resume ────────────────────────────────────────────────────
const BOOKING_RESUME_KEY = 'anaua_booking_resume';

function checkAndShowDraftResumeBanner() {
  const raw = sessionStorage.getItem(BOOKING_RESUME_KEY);
  if (!raw) return;
  try {
    const draft = JSON.parse(raw);
    const expId = draft?.experienceId;
    if (!expId) return;
    const banner = document.createElement('div');
    banner.setAttribute('role', 'alert');
    banner.className = 'draft-banner';
    banner.innerHTML = `
      <span>🌿</span>
      <span>Você tem uma reserva em andamento.</span>
      <a href="reserva.html?id=${esc(expId)}">Continuar reserva</a>
      <button type="button" aria-label="Fechar" onclick="this.parentElement.remove();sessionStorage.removeItem('anaua_booking_resume')">&times;</button>
    `;
    document.querySelector('.dash-tabs-wrap')?.insertAdjacentElement('beforebegin', banner);
  } catch {
    sessionStorage.removeItem(BOOKING_RESUME_KEY);
  }
}

// ─── Masks ───────────────────────────────────────────────────────────────────
// maskCPF / maskPhone (de components.js) são binders: recebem um elemento DOM
// e registram o listener de input internamente.
function initMasks() {
  const cpfEl   = document.getElementById('p-cpf');
  const phoneEl = document.getElementById('p-phone');
  const ecPh    = document.getElementById('ec-phone-acc');
  if (cpfEl)   maskCPF(cpfEl);
  if (phoneEl) maskPhone(phoneEl);
  if (ecPh)    maskPhone(ecPh);
}

// Formata CPF já salvo como string (sem alterar o DOM)
function fmtCPF(v) {
  if (!v) return '';
  v = v.replace(/\D/g, '').slice(0, 11);
  v = v.replace(/(\d{3})(\d)/, '$1.$2');
  v = v.replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3');
  v = v.replace(/\.(\d{3})(\d)/, '.$1-$2');
  return v;
}

// Formata telefone já salvo como string
function fmtPhone(v) {
  if (!v) return '';
  v = v.replace(/\D/g, '').slice(0, 11);
  if (v.length > 10) return v.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
  if (v.length > 6)  return v.replace(/^(\d{2})(\d{4,5})(\d{0,4})$/, '($1) $2-$3');
  if (v.length > 2)  return v.replace(/^(\d{2})(\d+)$/, '($1) $2');
  return v;
}

// ─── Perfil (Dados da Conta) ──────────────────────────────────────────────────
async function loadProfileForm() {
  const { data } = await getCustomerProfile();
  if (!data) return;
  const f = (id, val) => { const el = document.getElementById(id); if (el && val != null) el.value = val; };
  f('p-name',     data.full_name);
  f('p-email',    data.email);
  f('p-cpf',      data.document_number ? fmtCPF(data.document_number)   : '');
  f('p-phone',    data.phone           ? fmtPhone(data.phone)           : '');
  f('p-birthdate',data.birthdate?.slice(0, 10) ?? '');
  f('p-pax',      data.default_participants_count);
}

function initProfileForm() {
  document.getElementById('profile-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('profile-save-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando…'; }
    setFeedback('profile-feedback', '');

    const payload = {
      userId:                   _currentUser.id,
      fullName:                 document.getElementById('p-name')?.value.trim()              || null,
      email:                    document.getElementById('p-email')?.value.trim()             || null,
      documentNumber:           document.getElementById('p-cpf')?.value.replace(/\D/g,'')   || null,
      phone:                    document.getElementById('p-phone')?.value.replace(/\D/g,'') || null,
      birthdate:                document.getElementById('p-birthdate')?.value               || null,
      defaultParticipantsCount: Number(document.getElementById('p-pax')?.value)             || 1,
    };

    const { ok, error } = await upsertCustomerProfile(payload);
    if (ok) {
      setFeedback('profile-feedback', '✓ Dados salvos com sucesso.', 'success');
    } else {
      setFeedback('profile-feedback', error?.message ?? 'Erro ao salvar. Tente novamente.', 'error');
    }
    if (btn) { btn.disabled = false; btn.textContent = 'Salvar'; }
  });
}

// ─── Contato de Emergência ────────────────────────────────────────────────────
async function loadEcForm() {
  const { data } = await getEmergencyContact();
  if (!data) return;
  const f = (id, val) => { const el = document.getElementById(id); if (el && val != null) el.value = val; };
  f('ec-name-acc',         data.full_name);
  f('ec-phone-acc',        data.phone ? fmtPhone(data.phone) : '');
  f('ec-relationship-acc', data.relationship);
  f('ec-notes-acc',        data.notes);
}

function initEcForm() {
  document.getElementById('ec-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('ec-save-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando…'; }
    setFeedback('ec-feedback', '');

    const payload = {
      userId:       _currentUser.id,
      fullName:     document.getElementById('ec-name-acc')?.value.trim()               || null,
      phone:        document.getElementById('ec-phone-acc')?.value.replace(/\D/g,'')   || null,
      relationship: document.getElementById('ec-relationship-acc')?.value.trim()       || null,
      notes:        document.getElementById('ec-notes-acc')?.value.trim()              || null,
    };

    const { ok, error } = await upsertEmergencyContact(payload);
    if (ok) {
      setFeedback('ec-feedback', '✓ Contato de emergência salvo.', 'success');
    } else {
      setFeedback('ec-feedback', error?.message ?? 'Erro ao salvar. Tente novamente.', 'error');
    }
    if (btn) { btn.disabled = false; btn.textContent = 'Salvar'; }
  });
}

// ─── Pagamento ────────────────────────────────────────────────────────────────
async function loadPaymentMethods() {
  const list = document.getElementById('payment-list');
  if (!list) return;
  list.innerHTML = `<p class="dash-loading">Carregando…</p>`;
  const { ok, data } = await listPaymentMethods();
  if (!ok || !data?.length) {
    list.innerHTML = `<p class="payment-empty">Nenhum cartão salvo.</p>`;
    return;
  }
  list.innerHTML = data.map(c => `
    <div class="payment-card${c.is_default ? ' payment-card--default' : ''}" data-id="${esc(c.id)}">
      <div class="payment-card__info">
        <span class="payment-card__brand">${esc(c.brand ?? '—')}</span>
        <span class="payment-card__last4">•••• ${esc(c.last4 ?? '????')}</span>
        <span class="payment-card__holder">${esc(c.holder_name ?? '')}</span>
        <span class="payment-card__exp">${String(c.exp_month ?? '??').padStart(2,'0')}/${esc(c.exp_year ?? '??')}</span>
        ${c.is_default ? `<span class="payment-card__badge">Padrão</span>` : ''}
      </div>
      <div class="payment-card__actions">
        ${!c.is_default ? `<button class="btn btn--ghost btn--sm" onclick="window.__setDefaultCard('${esc(c.id)}')">Tornar padrão</button>` : ''}
        <button class="btn btn--ghost btn--sm" style="color:var(--color-muted)" onclick="window.__removeCard('${esc(c.id)}')">Remover</button>
      </div>
    </div>`).join('');
}

async function removeCard(id) {
  if (!confirm('Remover este cartão?')) return;
  const { ok } = await removePaymentMethod(id);
  if (ok) { showToast('Cartão removido.', 'success'); loadPaymentMethods(); }
  else    showToast('Erro ao remover. Tente novamente.', 'error');
}

async function setDefaultCard(id) {
  if (!_currentUser) return;
  const { ok } = await setDefaultPaymentMethod(_currentUser.id, id);
  if (ok) { showToast('Cartão padrão atualizado.', 'success'); loadPaymentMethods(); }
  else    showToast('Erro ao atualizar. Tente novamente.', 'error');
}

function initCardForm() {
  document.getElementById('card-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('card-save-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando…'; }
    setFeedback('card-feedback', '');

    const last4raw = document.getElementById('card-last4')?.value.replace(/\D/g,'') ?? '';
    if (last4raw.length !== 4) {
      setFeedback('card-feedback', 'Informe apenas os 4 últimos dígitos.', 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Adicionar cartão'; }
      return;
    }

    const payload = {
      provider:    'manual',
      brand:       document.getElementById('card-brand')?.value.trim()  || null,
      last4:       last4raw,
      exp_month:   Number(document.getElementById('card-exp-month')?.value) || null,
      exp_year:    Number(document.getElementById('card-exp-year')?.value)  || null,
      holder_name: document.getElementById('card-holder')?.value.trim() || null,
    };

    const { ok, error } = await addPaymentMethod(payload);
    if (ok) {
      setFeedback('card-feedback', '✓ Cartão adicionado.', 'success');
      e.target.reset();
      document.getElementById('add-card-details')?.removeAttribute('open');
      loadPaymentMethods();
    } else {
      setFeedback('card-feedback', error?.message ?? 'Erro ao adicionar.', 'error');
    }
    if (btn) { btn.disabled = false; btn.textContent = 'Adicionar cartão'; }
  });
}

/* ── Auth state ───────────────────────────────────────────── */

async function showDashboard(user) {
  _currentUser = user;
  document.getElementById('login-view').style.display = 'none';
  document.getElementById('dashboard-view').classList.add('is-visible');

  const profile      = await loadAdminProfile(user.id);
  const displayName  = profile?.display_name ?? user.email?.split('@')[0] ?? 'visitante';
  const nameEl       = document.getElementById('user-name');
  const emailEl      = document.getElementById('user-email');
  const avatarEl     = document.getElementById('user-avatar');

  if (nameEl)   nameEl.textContent   = displayName.split(' ')[0];
  if (emailEl)  emailEl.textContent  = user.email ?? '';
  if (avatarEl) avatarEl.textContent = (displayName[0] ?? 'A').toUpperCase();

  initTabs();
  initMasks();
  initProfileForm();
  initEcForm();
  initCardForm();

  activateTab('reservas');
  loadReservations(user.id);
  loadProfileForm();
  loadEcForm();
  loadPaymentMethods();
  checkAndShowDraftResumeBanner();
}

function showLogin() {
  _currentUser = null;
  document.getElementById('login-view').style.display = '';
  document.getElementById('dashboard-view').classList.remove('is-visible');
}

/* ── Segurança: remover dados sensíveis da URL ───────────────────── */
(function sanitizeUrl() {
  if (/[?&](password|senha|email)=/i.test(location.search)) {
    const clean = location.pathname + location.hash;
    history.replaceState(null, '', clean);
    showToast('Por segurança, removemos dados sensíveis da URL.', 'warn');
  }
})();

/* ── Perfil admin: carrega public.profiles e exibe link ao backoffice ── */
async function loadAdminProfile(userId) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, display_name, role')
    .eq('id', userId)
    .single();
  const btn = document.getElementById('backoffice-link');
  if (btn) {
    const isAdmin = profile && ['admin', 'operator'].includes(profile.role);
    btn.style.display = isAdmin ? 'inline-flex' : 'none';
  }
  return profile;
}

/* ── Boot: verificar sessão Supabase ───────────────────────────────── */
(async function boot() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) await showDashboard(session.user);
  } catch (err) {
    console.warn('[cliente-auth] getSession error:', err);
  }
  supabase.auth.onAuthStateChange(async (_event, session) => {
    if (session?.user) await showDashboard(session.user);
    else showLogin();
  });
})();

/* ── Login form ──────────────────────────────────────────── */
const form      = document.getElementById('login-form');
const loginBtn  = document.getElementById('login-btn');
const globalErr = document.getElementById('login-global-err');

form?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const emailEl = /** @type {HTMLInputElement} */ (document.getElementById('login-email'));
  const passEl  = /** @type {HTMLInputElement} */ (document.getElementById('login-password'));

  const validEmail = validateField(emailEl, [VALIDATORS.required, VALIDATORS.email]);
  const validPass  = validateField(passEl,  [VALIDATORS.required, VALIDATORS.minLen(6)]);
  if (!validEmail || !validPass) return;

  if (loginBtn) { loginBtn.disabled = true; loginBtn.textContent = 'Entrando…'; }
  if (globalErr) globalErr.textContent = '';

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email:    emailEl.value.trim(),
      password: passEl.value,
    });

    passEl.value = '';

    if (error || !data.user) {
      const msg = error?.message?.toLowerCase().includes('invalid login')
        ? 'E-mail ou senha incorretos.'
        : (error?.message ?? 'Erro ao fazer login. Tente novamente.');
      if (globalErr) { globalErr.textContent = msg; globalErr.style.display = 'flex'; }
      return;
    }

    if (location.search) history.replaceState(null, '', location.pathname + location.hash);
    showToast('Bem-vinda(o)!', 'success');
    await showDashboard(data.user);

    const resumeParam = new URLSearchParams(location.search).get('resumeBooking');
    if (resumeParam) checkAndShowDraftResumeBanner();

  } catch (err) {
    console.error('[cliente] login error:', err);
    if (globalErr) { globalErr.textContent = 'Erro inesperado. Tente novamente.'; globalErr.style.display = 'flex'; }
  } finally {
    if (loginBtn) { loginBtn.disabled = false; loginBtn.textContent = 'Entrar'; }
  }
});

/* ── Logout ──────────────────────────────────────────────── */
document.getElementById('logout-btn')?.addEventListener('click', async () => {
  localStorage.removeItem('anaua_admin_session');
  sessionStorage.removeItem('anaua_admin_session');
  await supabase.auth.signOut();
  showLogin();
  showToast('Sessão encerrada.', 'info');
});
