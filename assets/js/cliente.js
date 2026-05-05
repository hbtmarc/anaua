/**
 * @fileoverview cliente.js — Área do Cliente — Anauá Ecoturismo
 *
 * Auth: Supabase Auth (email + senha)
 * Reservas: public.reservations por user_id (RLS)
 * Fallback: usuário sem reservas no Supabase vê mensagem "Nenhuma reserva"
 */
import { initPage, validateField, VALIDATORS, showToast } from './components.js';
import { EXPERIENCES, formatBRL, formatDate } from './data.js';
import { supabase } from './supabaseClient.js';
import { getUserReservations } from './repositories/reservationRepo.js';

initPage('cliente.html');

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
  confirmed:       'badge--confirmed',
  reserved:        'badge--confirmed',
  pending_payment: 'badge--pending',
  pending:         'badge--pending',
  cancelled:       'badge--cancelled',
  draft:           'badge--pending',
};

/**
 * Renderiza um card de reserva a partir de uma linha de public.reservations.
 * @param {object} r
 */
function renderReservationCard(r) {
  const status    = r.reservation_status ?? r.status ?? 'pending_payment';
  const statusLbl = STATUS_LABEL[status]  ?? status;
  const statusCls = STATUS_CLASS[status]  ?? 'badge--pending';
  const expLocal  = EXPERIENCES.find(e => e.id === r.experience_id);
  const expTitle  = expLocal?.title ?? r.experience_id ?? 'Experiência';
  const expHref   = expLocal ? `experiencia.html?id=${r.experience_id}` : 'experiencias.html';
  const dateLabel = r.created_at ? formatDate(r.created_at.split('T')[0]) : '\u2014';
  const paid      = Number(r.amount_paid  ?? 0);
  const total     = Number(r.total_amount ?? 0);
  const code      = r.reservation_code ?? r.id ?? '\u2014';

  return `
    <article class="reservation-card" aria-label="Reserva ${code}">
      <div>
        <p class="reservation-card__name">${expTitle}</p>
        <p style="font-size:var(--text-xs);color:var(--color-text-muted);margin-top:2px">Código: <strong>${code}</strong></p>
        <div class="reservation-card__meta">
          <span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            ${dateLabel}
          </span>
          <span><span class="badge ${statusCls}">${statusLbl}</span></span>
        </div>
      </div>
      <div class="reservation-card__price">
        ${paid > 0 ? formatBRL(paid) : \`<span style="font-size:var(--text-sm);font-weight:400;color:var(--color-text-muted)">R$ ${total.toFixed(2).replace('.', ',')} a confirmar</span>\`}
      </div>
      <div class="reservation-card__actions">
        <a href="${expHref}" class="btn btn--secondary btn--sm">Ver experiência</a>
        ${status === 'pending_payment' ? \`<button class="btn btn--primary btn--sm" onclick="window.__anauaToast('Pagamento em breve aqui.','warn',4000)">Pagar agora</button>\` : ''}
        ${(status === 'confirmed' || status === 'reserved') ? \`<button class="btn btn--ghost-light btn--sm" style="color:var(--color-text-muted)" onclick="window.__anauaToast('Cancelamento via WhatsApp ou e-mail.','info',6000)">Cancelar</button>\` : ''}
      </div>
    </article>`;
}

async function renderReservations(userId) {
  const container = document.getElementById('reservation-list');
  if (!container) return;
  container.innerHTML = `<p style="color:var(--color-text-muted);font-size:var(--text-sm);padding:var(--sp-4) 0">Carregando reservas\u2026</p>`;
  const { ok, data, error } = await getUserReservations(userId);
  if (!ok || !data.length) {
    container.innerHTML = `
      <div class="reservations-empty">
        <div class="reservations-empty__icon">\U0001f33f</div>
        <p>Você ainda não possui reservas.</p>
        <a href="experiencias.html" class="btn btn--primary">Ver experiências</a>
      </div>`;
    if (!ok) console.warn('[cliente] Erro ao carregar reservas:', error);
    return;
  }
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
    banner.style.cssText = 'background:var(--color-leaf,#4a7c4a);color:#fff;padding:var(--sp-3) var(--sp-4);border-radius:var(--radius-md,8px);margin-bottom:var(--sp-4);display:flex;align-items:center;gap:var(--sp-3);font-size:var(--text-sm)';
    banner.innerHTML = `
      <span>\U0001f33f</span>
      <span>Você tem uma reserva em andamento.</span>
      <a href="reserva.html?id=${expId}" class="btn btn--sm" style="background:#fff;color:var(--color-leaf,#4a7c4a);margin-left:auto;white-space:nowrap">Continuar reserva</a>
      <button type="button" aria-label="Fechar" style="background:none;border:none;color:#fff;cursor:pointer;font-size:1.2rem;padding:0 var(--sp-1)" onclick="this.parentElement.remove();sessionStorage.removeItem('anaua_booking_resume')">&times;</button>
    `;
    document.getElementById('dashboard-view')?.insertAdjacentElement('afterbegin', banner);
  } catch {
    sessionStorage.removeItem(BOOKING_RESUME_KEY);
  }
}

/* ── Auth state ───────────────────────────────────────────── */

function showDashboard(user) {
  document.getElementById('login-view').style.display     = 'none';
  document.getElementById('dashboard-view').classList.add('is-visible');
  const nameEl = document.getElementById('user-name');
  if (nameEl) {
    const displayName = user.user_metadata?.full_name ?? user.email ?? 'visitante';
    nameEl.textContent = displayName.split(' ')[0];
  }
  renderReservations(user.id);
  checkAndShowDraftResumeBanner();
}

function showLogin() {
  document.getElementById('login-view').style.display = '';
  document.getElementById('dashboard-view').classList.remove('is-visible');
}

/* ── Boot: verificar sessão Supabase ───────────────────────────────── */

(async function boot() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) showDashboard(session.user);
  } catch (err) {
    console.warn('[cliente] getSession error:', err);
  }
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user) showDashboard(session.user);
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

    if (error || !data.user) {
      const msg = error?.message?.toLowerCase().includes('invalid login')
        ? 'E-mail ou senha incorretos.'
        : (error?.message ?? 'Erro ao fazer login. Tente novamente.');
      if (globalErr) { globalErr.textContent = msg; globalErr.style.display = 'flex'; }
      return;
    }

    const displayName =
      data.user.user_metadata?.full_name?.split(' ')[0]
      ?? data.user.email.split('@')[0];

    showToast(`Bem-vinda(o), ${displayName}!`, 'success');
    showDashboard(data.user);

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
  await supabase.auth.signOut();
  showLogin();
  showToast('Sessão encerrada.', 'info');
});
