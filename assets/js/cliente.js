/**
 * @fileoverview cliente.js — Área do Cliente — Anauá Ecoturismo
 *
 * Auth: Supabase Auth (email + senha)
 * Reservas: public.reservations por user_id (RLS)
 * Fallback: usuário sem reservas no Supabase vê mensagem "Nenhuma reserva"
 */
import { initPage, validateField, VALIDATORS, showToast } from './components.js';
import { supabase } from './supabaseClient.js';
import { getUserReservations } from './repositories/reservationRepo.js';

initPage('cliente.html');
console.log('[cliente-auth] Inicializando área do cliente');

// Expõe showToast em window para uso em onclick inline sem necessitar de import
window.__anauaToast = showToast;

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
  const expHref  = expSlug ? `experiencia.html?id=${expSlug}` : 'experiencias.html';

  const departureDate = dep?.start_at
    ? new Date(dep.start_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
    : null;
  const bookedDate = r.created_at
    ? new Date(r.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

  const paid  = Number(r.amount_paid  ?? 0);
  const total = Number(r.total_amount ?? 0);
  const code  = r.reservation_code ?? r.id?.slice(0, 8).toUpperCase() ?? '—';

  const priceMain = paid > 0
    ? `R$ ${paid.toFixed(2).replace('.', ',')}`
    : `R$ ${total.toFixed(2).replace('.', ',')}`;
  const priceSub  = paid > 0 ? 'pago' : 'a confirmar';

  const payBtn = status === 'pending_payment'
    ? `<button class="btn btn--primary btn--sm" onclick="window.__anauaToast('Pagamento disponível em breve.','warn',4000)">Pagar agora</button>`
    : '';
  const cancelBtn = (status === 'confirmed' || status === 'reserved')
    ? `<button class="btn btn--ghost btn--sm" style="color:var(--color-muted)" onclick="window.__anauaToast('Para cancelar, entre em contato pelo WhatsApp.','info',6000)">Cancelar reserva</button>`
    : '';

  const calIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;

  return `
    <article class="resa-card" data-status="${status}" aria-label="Reserva ${code}">
      <div class="resa-card__body">
        <div>
          <p class="resa-card__title">${expTitle}</p>
          <p class="resa-card__code">Código: <strong>${code}</strong></p>
        </div>
        <div>
          <p class="resa-card__price">${priceMain}</p>
          <p class="resa-card__price-sub">${priceSub}</p>
        </div>
        <div class="resa-card__meta">
          ${departureDate ? `<span class="resa-meta-item">${calIcon} Saída: <strong>${departureDate}</strong></span>` : ''}
          <span class="resa-meta-item">${calIcon} Reservado em: ${bookedDate}</span>
        </div>
        <div class="resa-card__badges">
          <span class="resa-badge ${statusCls}">${statusLbl}</span>
        </div>
      </div>
      <div class="resa-card__footer">
        <a href="${expHref}" class="btn btn--secondary btn--sm">Ver experiência</a>
        ${payBtn}
        ${cancelBtn}
      </div>
    </article>`;
}

async function renderReservations(userId) {
  const container = document.getElementById('reservation-list');
  const countEl   = document.getElementById('resa-count');
  if (!container) return;
  container.innerHTML = `<p style="color:var(--color-muted);font-size:var(--text-sm);padding:var(--sp-4) 0">Carregando reservas\u2026</p>`;
  const { ok, data, error } = await getUserReservations(userId);
  if (!ok) {
    console.warn('[cliente] Erro ao carregar reservas:', error);
    container.innerHTML = `
      <div class="resa-empty">
        <div class="resa-empty__icon">⚠️</div>
        <p>Não foi possível carregar suas reservas.</p>
        <a href="contato.html" class="btn btn--secondary">Fale conosco</a>
      </div>`;
    return;
  }
  if (!data.length) {
    container.innerHTML = `
      <div class="resa-empty">
        <div class="resa-empty__icon">🌿</div>
        <p>Você ainda não possui reservas. Que tal explorar nossas experiências?</p>
        <a href="experiencias.html" class="btn btn--primary">Ver experiências</a>
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
      <a href="reserva.html?id=${expId}">Continuar reserva</a>
      <button type="button" aria-label="Fechar" onclick="this.parentElement.remove();sessionStorage.removeItem('anaua_booking_resume')">&times;</button>
    `;
    document.querySelector('.dash-section .container')?.insertAdjacentElement('afterbegin', banner);
  } catch {
    sessionStorage.removeItem(BOOKING_RESUME_KEY);
  }
}

/* ── Auth state ───────────────────────────────────────────── */

async function showDashboard(user) {
  document.getElementById('login-view').style.display     = 'none';
  document.getElementById('dashboard-view').classList.add('is-visible');
  const profile = await loadProfile(user.id);
  const displayName = profile?.display_name ?? user.email?.split('@')[0] ?? 'visitante';
  const nameEl   = document.getElementById('user-name');
  const emailEl  = document.getElementById('user-email');
  const avatarEl = document.getElementById('user-avatar');
  if (nameEl)   nameEl.textContent   = displayName.split(' ')[0];
  if (emailEl)  emailEl.textContent  = user.email ?? '';
  if (avatarEl) avatarEl.textContent = (displayName[0] ?? 'A').toUpperCase();
  renderReservations(user.id);
  checkAndShowDraftResumeBanner();
}

function showLogin() {
  document.getElementById('login-view').style.display = '';
  document.getElementById('dashboard-view').classList.remove('is-visible');
}

/* ── Segurança: remover dados sensiveis da URL ───────────────────── */
(function sanitizeUrl() {
  if (/[?&](password|senha|email)=/i.test(location.search)) {
    console.warn('[security] Dados sensíveis removidos da URL');
    const clean = location.pathname + location.hash;
    history.replaceState(null, '', clean);
    showToast('Por segurança, removemos dados sensíveis da URL.', 'warn');
  }
})();

/* ── Perfil: carrega public.profiles e exibe link ao backoffice ───── */
async function loadProfile(userId) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, display_name, role')
    .eq('id', userId)
    .single();
  console.log('[auth] Perfil carregado');
  if (profile) console.log('[cliente-auth] Role detectada:', profile.role);
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
    if (session?.user) {
      console.log('[cliente-auth] Sessão encontrada');
      await showDashboard(session.user);
    }
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

  console.log('[cliente-auth] Login iniciado');
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email:    emailEl.value.trim(),
      password: passEl.value,
    });

    // Limpar campo de senha imediatamente após tentativa
    passEl.value = '';

    if (error || !data.user) {
      const msg = error?.message?.toLowerCase().includes('invalid login')
        ? 'E-mail ou senha incorretos.'
        : (error?.message ?? 'Erro ao fazer login. Tente novamente.');
      if (globalErr) { globalErr.textContent = msg; globalErr.style.display = 'flex'; }
      return;
    }

    console.log('[cliente-auth] Login realizado com sucesso');
    // Redirecionar sem query params
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
  console.log('[cliente-auth] Logout realizado');
  showLogin();
  showToast('Sessão encerrada.', 'info');
});
