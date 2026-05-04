/**
 * @fileoverview Área do Cliente — Anauá Ecoturismo
 * Login + dashboard with reservations.
 */
import { initPage, validateField, VALIDATORS, showToast } from './components.js';
import { EXPERIENCES, formatBRL, formatDate } from './data.js';
import {
  getSession, clearSession, login,
  createAccount,
} from './services/UserService.js';

initPage('cliente.html');

/* ── Seed demo accounts (only if they don’t exist yet) ───────────────────
   So the demo credentials always work on a fresh localStorage. */
(function seedDemoAccounts() {
  const demos = [
    { profile: { fullName: 'Maria Fernanda', email: 'demo@anaua.com.br', cpf: '', phone: '', birthdate: '' }, password: '12345678' },
    { profile: { fullName: 'João Silva',     email: 'test@test.com',         cpf: '', phone: '', birthdate: '' }, password: 'password'  },
  ];
  const existing = JSON.parse(localStorage.getItem('anaua_accounts') ?? '[]');
  demos.forEach(d => {
    if (!existing.find(a => a.email === d.profile.email)) {
      createAccount(d.profile, d.password);
      clearSession(); // seedeing should not start a session
    }
  });
})();


/* ── Mock reservations ───────────────────────────────────── */
function buildMockReservations(userName) {
  const exps = EXPERIENCES.slice(0, 3);
  return [
    {
      id: 'RES-001',
      experience: exps[0],
      date: '2025-03-15',
      pax: 2,
      status: 'confirmed',
      totalPaid: exps[0].pricePerPerson * 2,
    },
    {
      id: 'RES-002',
      experience: exps[1],
      date: '2025-04-20',
      pax: 1,
      status: 'pending',
      totalPaid: 0,
    },
    {
      id: 'RES-003',
      experience: exps[2],
      date: '2025-02-10',
      pax: 3,
      status: 'cancelled',
      totalPaid: exps[2].pricePerPerson * 3,
    },
  ];
}

const STATUS_LABEL = { confirmed: 'Confirmada', pending: 'Aguardando pagamento', cancelled: 'Cancelada' };
const STATUS_CLASS = { confirmed: 'badge--confirmed', pending: 'badge--pending', cancelled: 'badge--cancelled' };

function renderReservations(userName) {
  const container = document.getElementById('reservation-list');
  if (!container) return;

  const reservations = buildMockReservations(userName);

  if (!reservations.length) {
    container.innerHTML = `
      <div class="reservations-empty">
        <div class="reservations-empty__icon">🌿</div>
        <p>Você ainda não tem reservas.</p>
        <a href="experiencias.html" class="btn btn--primary">Ver experiências</a>
      </div>`;
    return;
  }

  container.innerHTML = reservations.map(r => `
    <article class="reservation-card">
      <div>
        <p class="reservation-card__name">${r.experience.title}</p>
        <div class="reservation-card__meta">
          <span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            ${formatDate(r.date)}
          </span>
          <span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            ${r.pax} ${r.pax === 1 ? 'participante' : 'participantes'}
          </span>
          <span><span class="badge ${STATUS_CLASS[r.status]}">${STATUS_LABEL[r.status]}</span></span>
        </div>
      </div>

      <div class="reservation-card__price">
        ${r.totalPaid > 0 ? formatBRL(r.totalPaid) : '<span style="font-size:var(--text-sm);font-weight:400;color:var(--color-text-muted)">A pagar</span>'}
      </div>

      <div class="reservation-card__actions">
        <a href="experiencia.html?id=${r.experience.id}" class="btn btn--secondary btn--sm">Ver experiência</a>
        ${r.status === 'pending' ? `<button class="btn btn--primary btn--sm" onclick="alert('Funcionalidade de pagamento em breve!')">Pagar agora</button>` : ''}
        ${r.status === 'confirmed' ? `<button class="btn btn--ghost-light btn--sm" style="color:var(--color-text-muted)" onclick="alert('Cancelamento disponível via contato.')">Cancelar</button>` : ''}
      </div>
    </article>
  `).join('');
}

/* ── Auth state ───────────────────────────────────────────── */
// getSession / setSession / clearSession imported from UserService

function showDashboard(user) {
  document.getElementById('login-view').style.display     = 'none';
  document.getElementById('dashboard-view').classList.add('is-visible');
  const nameEl = document.getElementById('user-name');
  if (nameEl) nameEl.textContent = user.name.split(' ')[0];
  renderReservations(user.name);
}

function showLogin() {
  document.getElementById('login-view').style.display = '';
  document.getElementById('dashboard-view').classList.remove('is-visible');
}

/* ── Boot ─────────────────────────────────────────────────── */
const existingSession = getSession();
if (existingSession) showDashboard(existingSession);

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

  await new Promise(r => setTimeout(r, 800));

  const result = login(emailEl.value.trim(), passEl.value);

  if (!result.ok) {
    if (globalErr) { globalErr.textContent = result.error; globalErr.style.display = 'flex'; }
    if (loginBtn) { loginBtn.disabled = false; loginBtn.textContent = 'Entrar'; }
    return;
  }

  const { user } = result;
  showToast(`Bem-vinda(o), ${user.name.split(' ')[0]}!`, 'success');
  showDashboard(user);
  if (loginBtn) { loginBtn.disabled = false; loginBtn.textContent = 'Entrar'; }
});

/* ── Logout ──────────────────────────────────────────────── */
document.getElementById('logout-btn')?.addEventListener('click', () => {
  clearSession();
  showLogin();
  showToast('Sessão encerrada.', 'info');
});
