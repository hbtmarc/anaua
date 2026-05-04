import { initPage, validateField, VALIDATORS, showToast } from './components.js';
import { formatBRL, formatDate } from './data.js';
import { supabase } from './supabaseClient.js';
import { signInCustomer, getCurrentUser, getMyReservations } from './services/SupabaseBookingService.js';

initPage('cliente.html');
window.__anauaToast = showToast;
const BOOKING_RESUME_KEY = 'anaua_booking_resume';

function renderCard(r) {
  return `<article class="reservation-card"><p class="reservation-card__name">${r.reservation_code || 'Reserva'}</p><div class="reservation-card__meta"><span>${formatDate((r.created_at||'').slice(0,10))}</span><span>${r.reservation_status || 'requested'}</span></div><div class="reservation-card__price">${formatBRL(Number(r.total_amount||0))}</div></article>`;
}

async function loadReservations() {
  const el = document.getElementById('reservation-list');
  const res = await getMyReservations();
  if (!res.ok || !res.data.length) {
    el.innerHTML = '<div class="reservations-empty"><p>Você ainda não possui reservas.</p></div>';
    return;
  }
  el.innerHTML = res.data.map(renderCard).join('');
}

function showDashboard(user) {
  document.getElementById('login-view').style.display = 'none';
  document.getElementById('dashboard-view').classList.add('is-visible');
  document.getElementById('user-name').textContent = (user.email || 'Cliente').split('@')[0];
  const raw = sessionStorage.getItem(BOOKING_RESUME_KEY);
  if (raw) {
    const draft = JSON.parse(raw);
    const cta = `<div class="account-notice" style="margin-bottom:12px">Você tem uma reserva em andamento. <a href="reserva.html?id=${draft.experienceId}" class="btn btn--primary btn--sm">Continuar reserva</a></div>`;
    document.getElementById('dashboard-view')?.insertAdjacentHTML('afterbegin', cta);
  }
  loadReservations();
}

async function boot() {
  const user = await getCurrentUser();
  if (user) showDashboard(user);
}
boot();

document.getElementById('login-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const emailEl = document.getElementById('login-email');
  const passEl = document.getElementById('login-password');
  if (!validateField(emailEl, [VALIDATORS.required, VALIDATORS.email]) || !validateField(passEl, [VALIDATORS.required, VALIDATORS.minLen(6)])) return;
  const ret = await signInCustomer(emailEl.value.trim(), passEl.value);
  if (!ret.ok) return showToast('Não foi possível entrar. Verifique e-mail e senha.', 'error');
  showToast('Login realizado com sucesso.', 'success');
  showDashboard(ret.user);
});

document.getElementById('logout-btn')?.addEventListener('click', async () => {
  await supabase.auth.signOut();
  location.reload();
});
