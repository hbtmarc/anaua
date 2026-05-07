/**
 * @fileoverview reserva.js — Multi-step booking wizard controller.
 *
 * Steps:
 *  1 — Saída (exit date)
 *  2 — Ponto de encontro (meeting point)
 *  3 — Perfis / quantidades (profile quantities)
 *  4 — Responsável / pagador (payer)
 *  5 — Participantes (participants)
 *  6 — Emergência + observações (emergency contact)
 *  7 — Termos (terms acceptance)
 *  8 — Pagamento (payment)
 *  9 — Comprovante (voucher)
 */

import { initPage, renderBreadcrumb, showToast, maskPhone, maskCPF } from './components.js';
import {
  getSession, isLoggedIn, saveProfile, loadProfile,
} from './services/UserService.js';
import { formatBRL, formatDate } from './data.js';
import { getExperienceBySlug, listDeparturesByExperience } from './repositories/experienceRepo.js';
import { listBoardingPointsByDeparture } from './repositories/boardingPointRepo.js';
import {
  PROFILES, PAYMENT_LABEL, TERMS_VERSION,
  STATUS_LABEL, STATUS_CLASS,
} from './types/booking.types.js';
import {
  createDraft, saveDraft, loadDraft,
  validateStep1, validateStep2, validateStep3,
  validateStep4, validateStep5, validateStep6, validateStep7,
  computeTotal, computeSplit, submitBooking,
} from './services/BookingService.js';
import { supabase } from './supabaseClient.js';
import {
  insertReservation, insertParticipants, insertPaymentRecord,
} from './repositories/reservationRepo.js';

// Expõe showToast globalmente para onclick inline em templates de string
window.__anauaToast = showToast;

// ─── Init ──────────────────────────────────────────────────────────────────────

initPage('reserva.html');
renderBreadcrumb([
  { label: 'Início',      href: 'index.html' },
  { label: 'Experiências', href: 'experiencias.html' },
  { label: 'Reservar' },
]);

// ─── Variáveis de módulo (preenchidas pelo init assíncrono) ───────────────────

/** @type {object|null} Experiência carregada do Supabase */
let exp = null;

/** @type {Partial<import('./types/booking.types.js').Booking>|null} */
let draft = null;

let selectedPaymentMethod = null;
let signalPct = 50;

/** Loaded from app_settings.image_consent_required */
let imageConsentRequired = false;

// ─── Wizard state ─────────────────────────────────────────────────────────────

const TOTAL_STEPS = 9;
let currentStep = 1;

const $progress = document.getElementById('wizard-progress');
const $context  = document.getElementById('booking-context');
const $errBanner= document.getElementById('wiz-error');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

function showError(msg) {
  $errBanner.textContent = msg;
  $errBanner.classList.add('is-visible');
  $errBanner.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function clearError() {
  $errBanner.textContent = '';
  $errBanner.classList.remove('is-visible');
}

function showErrors(errors) {
  const msgs = Object.values(errors);
  if (!msgs.length) return;
  showError(msgs[0]);

  // Also set inline errors where inputs have matching error spans
  Object.entries(errors).forEach(([field, msg]) => {
    const errEl = document.getElementById(`payer-${field}-err`)
      ?? document.getElementById(`ec-${field}-err`);
    if (errEl) {
      errEl.textContent = msg;
      errEl.style.display = 'flex';
    }
  });
}

function clearInlineErrors() {
  document.querySelectorAll('.field-error').forEach(el => {
    el.textContent = '';
    el.style.display = '';
  });
}

function setInlineError(inputId, msg) {
  const input = document.getElementById(inputId);
  if (input) {
    input.classList.add('has-error');
    const errEl = document.getElementById(inputId + '-err');
    if (errEl) { errEl.textContent = msg; errEl.style.display = 'flex'; }
  }
}

/** Show/hide processing overlay */
function setProcessing(visible, msg = 'Processando pagamento…') {
  const overlay = $('processing-overlay');
  const msgEl   = $('processing-msg');
  overlay.classList.toggle('is-visible', visible);
  if (msgEl) msgEl.textContent = msg;
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

const STEP_LABELS = ['Saída','Encontro','Perfis','Responsável','Participantes','Emergência','Termos','Pagamento','Confirmação'];

function renderProgress(active) {
  $progress.innerHTML = Array.from({ length: TOTAL_STEPS }, (_, i) => {
    const n    = i + 1;
    const done = n < active;
    const cls  = done ? 'is-done' : n === active ? 'is-active' : '';
    return `
      <div class="wiz-step ${cls}" aria-label="Etapa ${n}: ${STEP_LABELS[i]}">
        <div class="wiz-step__dot">${done ? '✓' : n}</div>
        <span class="wiz-step__label">${STEP_LABELS[i]}</span>
      </div>`;
  }).join('');
}

// ─── Context bar ──────────────────────────────────────────────────────────────

function renderContext() {
  if (currentStep < 2) { $context.style.display = 'none'; return; }
  $context.style.display = '';

  const dep   = currentStep >= 2
    ? (exp.departures ?? []).find(d => d.id === draft.exitId)
    : null;
  const total = computeTotal(draft.profileQtys ?? []);

  $context.innerHTML = `
    <div class="booking-context__title">${exp.title}</div>
    <div class="booking-context__meta">
      ${dep   ? `<span>📅 ${dep.start_at.split('T')[0]}</span>` : ''}
      ${total ? `<span>💰 ${formatBRL(total)}</span>` : ''}
    </div>`;
}

// ─── Step navigation ──────────────────────────────────────────────────────────

function goTo(step) {
  clearError();
  clearInlineErrors();

  document.querySelectorAll('.wiz-panel').forEach(p => p.classList.remove('is-active'));
  const panel = $(`panel-${step}`);
  if (panel) {
    panel.classList.add('is-active');
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  currentStep = step;
  renderProgress(step);
  renderContext();
  saveDraft(draft);
}

// ─── STEP 1: Exits ────────────────────────────────────────────────────────────

function renderStep1() {
  const exits = exp.departures ?? [];
  if (!exits.length) {
    $('exit-cards').innerHTML = `<div class="empty-state"><p>Nenhuma saída disponível no momento.</p></div>`;
    return;
  }
  $('exit-cards').innerHTML = exits.map(dep => {
    const soldOut = dep.status !== 'scheduled';
    const sel     = draft.exitId === dep.id;
    const dateStr = dep.start_at?.split('T')[0] ?? '';
    return `
      <div class="exit-card ${sel ? 'is-selected' : ''} ${soldOut ? 'is-soldout' : ''}"
           data-exit="${dep.id}" role="button" tabindex="${soldOut ? -1 : 0}"
           aria-pressed="${sel}" aria-disabled="${soldOut}">
        <span class="exit-card__check" aria-hidden="true">✓</span>
        <p class="exit-card__date">${formatDate(dateStr)}</p>
        <p class="exit-card__spots">
          ${soldOut ? 'Esgotado' : `${dep.capacity ?? '?'} vaga${dep.capacity !== 1 ? 's' : ''}`}
        </p>
      </div>`;
  }).join('');

  $('exit-cards').addEventListener('click', (e) => {
    const card = e.target.closest('.exit-card');
    if (!card || card.classList.contains('is-soldout')) return;
    document.querySelectorAll('.exit-card').forEach(c => {
      c.classList.remove('is-selected');
      c.setAttribute('aria-pressed', 'false');
    });
    card.classList.add('is-selected');
    card.setAttribute('aria-pressed', 'true');
    draft.exitId = card.dataset.exit;
    clearError();
  });
}

$('next-1').addEventListener('click', async () => {
  if (!draft.exitId) { showError('Selecione uma saída.'); return; }
  // Try to load boarding points for the selected departure
  const { data: boardingPoints } = await listBoardingPointsByDeparture(draft.exitId);
  draft._boardingPoints = boardingPoints ?? [];
  // Preserve pre-selected boardingPointId (from experiencia.html) if still valid
  if (!draft._boardingPoints.some(b => b.id === draft.boardingPointId)) {
    draft.boardingPointId = null;
  }
  if (draft._boardingPoints.length > 0 && !draft.boardingPointId) {
    // Boarding points exist but none selected yet → show step 2
    goTo(2);
    renderStep2();
  } else {
    // Either no BPs for this departure, or bp already pre-selected → skip to step 3
    goTo(3);
    renderStep3();
  }
});

// ─── STEP 2: Meeting points ───────────────────────────────────────────────────

function renderStep2() {
  const points = draft._boardingPoints ?? [];
  const panel = $('panel-2');
  if (!panel) return;

  const cardsHtml = points.map(bp => {
    const timeStr = bp.pickupAt
      ? new Date(bp.pickupAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : '--:--';
    const sel = draft.boardingPointId === bp.id;
    return `
      <div class="exit-card boarding-point-card ${sel ? 'is-selected' : ''}"
           data-bp="${bp.id}" role="button" tabindex="0"
           aria-pressed="${sel}" style="cursor:pointer">
        <div class="exit-card__info">
          <p class="exit-card__title">${bp.displayName}</p>
          <p class="exit-card__meta">⏰ Embarque: ${timeStr}</p>
          ${bp.displayAddress ? `<p class="exit-card__meta" style="font-size:12px;color:var(--color-muted)">${bp.displayAddress}</p>` : ''}
          ${bp.notes   ? `<p class="exit-card__meta" style="font-size:11px;color:var(--color-muted);font-style:italic">${bp.notes}</p>` : ''}
        </div>
      </div>`;
  }).join('');

  // Inject into panel-2 content area (after heading)
  const contentArea = panel.querySelector('[data-step-content]') ?? panel;
  // Replace or append the cards block
  let cardsWrap = panel.querySelector('#bp-cards-wrap');
  if (!cardsWrap) {
    cardsWrap = document.createElement('div');
    cardsWrap.id = 'bp-cards-wrap';
    cardsWrap.style.cssText = 'display:flex;flex-direction:column;gap:10px;margin-top:16px';
    // Insert before the nav buttons (last child)
    const navEl = panel.querySelector('.wiz-nav');
    if (navEl) panel.insertBefore(cardsWrap, navEl);
    else contentArea.appendChild(cardsWrap);
  }
  cardsWrap.innerHTML = cardsHtml;

  cardsWrap.addEventListener('click', (e) => {
    const card = e.target.closest('.boarding-point-card');
    if (!card) return;
    cardsWrap.querySelectorAll('.boarding-point-card').forEach(c => {
      c.classList.remove('is-selected');
      c.setAttribute('aria-pressed', 'false');
    });
    card.classList.add('is-selected');
    card.setAttribute('aria-pressed', 'true');
    draft.boardingPointId = card.dataset.bp;
    clearError();
  });
}

$('next-2').addEventListener('click', () => {
  const hasBps = (draft._boardingPoints ?? []).length > 0;
  if (hasBps && !draft.boardingPointId) { showError('Selecione um ponto de embarque.'); return; }
  clearError();
  goTo(3);
  renderStep3();
});

$('back-2').addEventListener('click', () => goTo(1));

// ─── STEP 3: Profile quantities ──────────────────────────────────────────────

/** @type {Record<string, number>} */
const qtyMap = { adult: 0, child: 0, senior: 0, pcd: 0 };

// Rehydrate from draft (guard: draft is null until async initReserva runs)
if (draft?.profileQtys?.length) {
  draft.profileQtys.forEach(pq => { qtyMap[pq.profile] = pq.qty; });
}

function profilePrice(profile) {
  if (profile === 'adult')  return exp.pricePerPerson;
  if (profile === 'child')  return exp.priceChildren ?? exp.pricePerPerson;
  if (profile === 'senior') return Math.round(exp.pricePerPerson * 0.85);
  if (profile === 'pcd')    return Math.round(exp.pricePerPerson * 0.85);
  return exp.pricePerPerson;
}

function buildProfileQtys() {
  return Object.entries(qtyMap)
    .filter(([, qty]) => qty > 0)
    .map(([profile, qty]) => ({ profile, qty, unitPrice: profilePrice(profile) }));
}

function updatePriceSummary(containerId) {
  const qtys  = buildProfileQtys();
  const total = computeTotal(qtys);
  const container = $(containerId);
  if (!container) return;

  const rows = qtys.map(pq =>
    `<div class="price-summary__row">
      <span>${PROFILES[pq.profile].label} × ${pq.qty}</span>
      <span>${formatBRL(pq.qty * pq.unitPrice)}</span>
    </div>`
  ).join('');

  container.innerHTML = rows + `
    <div class="price-summary__row is-total">
      <span>Total</span>
      <span>${formatBRL(total)}</span>
    </div>`;
}

function renderStep3() {
  const dep      = (exp.departures ?? []).find(d => d.id === draft.exitId);
  const maxSpots = dep?.capacity ?? 9;
  const hasChildren = exp.priceChildren !== null;

  $('profile-rows').innerHTML = Object.entries(PROFILES).map(([key, profile]) => {
    if (key === 'child' && !hasChildren) return '';
    const price   = profilePrice(key);
    const enabled = key !== 'child' || (exp.minAge < 18);
    return `
      <div class="profile-row">
        <div class="profile-row__info">
          <p class="profile-row__label">${profile.label}</p>
          <p class="profile-row__sub">${
            key === 'child'  ? `${profile.minAge ?? 0}–${profile.maxAge} anos` :
            key === 'senior' ? `${profile.minAge}+ anos — desconto 15%` :
            key === 'pcd'    ? 'Pessoa com deficiência — desconto 15%' :
            `${profile.minAge}+ anos`
          }</p>
        </div>
        <span class="profile-row__price">${formatBRL(price)}</span>
        <div class="qty-control">
          <button class="qty-btn" data-action="dec" data-profile="${key}" aria-label="Remover ${profile.label}" ${!enabled ? 'disabled' : ''}>−</button>
          <span class="qty-value" id="qty-${key}" aria-live="polite">${qtyMap[key]}</span>
          <button class="qty-btn" data-action="inc" data-profile="${key}" aria-label="Adicionar ${profile.label}" ${!enabled ? 'disabled' : ''}>+</button>
        </div>
      </div>`;
  }).join('');

  updatePriceSummary('price-summary-3');

  $('profile-rows').addEventListener('click', (e) => {
    const btn = e.target.closest('.qty-btn');
    if (!btn || btn.disabled) return;
    const profile = btn.dataset.profile;
    const action  = btn.dataset.action;
    const total   = Object.values(qtyMap).reduce((a, b) => a + b, 0);

    if (action === 'inc' && total < maxSpots) qtyMap[profile]++;
    if (action === 'dec' && qtyMap[profile] > 0) qtyMap[profile]--;

    const span = $(`qty-${profile}`);
    if (span) span.textContent = qtyMap[profile];
    updatePriceSummary('price-summary-3');
    clearError();
  });
}

$('next-3').addEventListener('click', () => {
  const profileQtys = buildProfileQtys();
  const errs = validateStep2({ profileQtys, minAge: exp.minAge ?? 0 });
  if (Object.keys(errs).length) { showError(Object.values(errs)[0]); return; }
  draft.profileQtys = profileQtys;
  draft.totalAmount  = computeTotal(profileQtys);
  goTo(4);
});

$('back-3').addEventListener('click', () => {
  if ((draft._boardingPoints ?? []).length > 0) {
    goTo(2);
  } else {
    goTo(1);
  }
});

// ─── STEP 4: Payer ────────────────────────────────────────────────────────────

// Apply masks
maskCPF(/** @type {HTMLInputElement} */ ($('payer-cpf')));
maskPhone(/** @type {HTMLInputElement} */ ($('payer-phone')));

function collectPayer() {
  return {
    fullName:          $('payer-name').value.trim(),
    cpf:               $('payer-cpf').value.trim(),
    email:             $('payer-email').value.trim(),
    phone:             $('payer-phone').value.trim(),
    birthdate:         $('payer-birthdate').value,
    isAlsoParticipant: $('payer-is-participant').checked,
  };
}

// ── Prefill payer fields from session/profile ───────────────────────────────
// Called from initReserva() after draft is populated
async function prefillPayerFields() {
  // Priority 1: wizard draft already has payer data (user navigated back)
  if (draft?.payer) {
    $('payer-name').value             = draft.payer.fullName  ?? '';
    $('payer-cpf').value              = draft.payer.cpf       ?? '';
    $('payer-email').value            = draft.payer.email     ?? '';
    $('payer-phone').value            = draft.payer.phone     ?? '';
    $('payer-birthdate').value        = draft.payer.birthdate ?? '';
    $('payer-is-participant').checked = draft.payer.isAlsoParticipant ?? false;
    return;
  }

  // Priority 2: logged-in Supabase user metadata
  let supabaseEmail = null;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const m = user.user_metadata ?? {};
      if (m.full_name)  $('payer-name').value      = m.full_name;
      if (m.cpf)        $('payer-cpf').value        = m.cpf;
      if (user.email)   $('payer-email').value      = user.email;
      if (m.phone)      $('payer-phone').value      = m.phone;
      if (m.birthdate)  $('payer-birthdate').value  = m.birthdate;
      supabaseEmail = user.email ?? null;
    }
  } catch (_) { /* silencioso */ }

  // Priority 3: saved profile in localStorage — preenche apenas campos ainda vazios
  const savedProfile = loadProfile();
  if (savedProfile) {
    if (!$('payer-name').value      && savedProfile.fullName)  $('payer-name').value      = savedProfile.fullName;
    if (!$('payer-cpf').value       && savedProfile.cpf)       $('payer-cpf').value        = savedProfile.cpf;
    if (!$('payer-email').value     && savedProfile.email)     $('payer-email').value      = savedProfile.email;
    if (!$('payer-phone').value     && savedProfile.phone)     $('payer-phone').value      = savedProfile.phone;
    if (!$('payer-birthdate').value && savedProfile.birthdate) $('payer-birthdate').value  = savedProfile.birthdate;
  }
}

// ── Show/hide account section based on login state ───────────────────────────
(async function setupAccountSection() {
  const loggedNotice  = $('account-logged-notice');
  const createSection = $('account-create-section');

  // Verificar sessão Supabase (real) — com fallback para sessionStorage legado
  let displayName = null;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      displayName = user.user_metadata?.full_name ?? user.email.split('@')[0];
    }
  } catch (_) {
    const legacy = getSession();
    if (legacy) displayName = legacy.name;
  }

  if (displayName) {
    // Usuário logado: exibe aviso, oculta seção de criar conta
    const nameEl = document.getElementById('account-logged-name');
    if (nameEl) nameEl.textContent = displayName.split(' ')[0];
    loggedNotice.style.display  = '';
    createSection.style.display = 'none';
  } else {
    // Não logado: exibe seção de criar conta
    loggedNotice.style.display  = 'none';
    createSection.style.display = '';
  }

  // Toggle password fields visibility
  const cb     = /** @type {HTMLInputElement} */ ($('account-create-cb'));
  const fields = $('account-create-fields');
  fields.style.display = 'none'; // start collapsed

  cb?.addEventListener('change', () => {
    fields.style.display = cb.checked ? '' : 'none';
    if (cb.checked) {
      $('account-password')?.focus();
    }
  });

  // Password visibility toggles
  setupPasswordToggle('toggle-pwd', 'account-password');
  setupPasswordToggle('toggle-pwd-confirm', 'account-password-confirm');
})();

function setupPasswordToggle(btnId, inputId) {
  const btn   = document.getElementById(btnId);
  const input = /** @type {HTMLInputElement|null} */ (document.getElementById(inputId));
  if (!btn || !input) return;
  btn.addEventListener('click', () => {
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    btn.setAttribute('aria-label', isHidden ? 'Ocultar senha' : 'Mostrar senha');
  });
}

$('next-4').addEventListener('click', async () => {
  clearInlineErrors();
  const payer = collectPayer();
  const errs  = validateStep3(payer);
  if (Object.keys(errs).length) {
    Object.entries(errs).forEach(([f, msg]) => setInlineError(`payer-${f}`, msg));
    showError('Corrija os campos destacados.');
    return;
  }

  // ── Handle account creation ─────────────────────────────────────────────
  const createCb = /** @type {HTMLInputElement|null} */ ($('account-create-cb'));
  if (createCb?.checked) {
    const pwd    = /** @type {HTMLInputElement} */ ($('account-password')).value;
    const pwdCfm = /** @type {HTMLInputElement} */ ($('account-password-confirm')).value;
    let hasErr = false;

    if (!pwd || pwd.length < 6) {
      setInlineError('account-password', 'A senha precisa ter no mínimo 6 caracteres.');
      hasErr = true;
    }
    if (pwd !== pwdCfm) {
      setInlineError('account-password-confirm', 'As senhas não coincidem.');
      hasErr = true;
    }
    if (hasErr) { showError('Corrija os campos destacados.'); return; }

    // ── Criar conta no Supabase ────────────────────────────────────────────
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email:   payer.email,
      password: pwd,
      options: { data: {
        full_name: payer.fullName,
        cpf:       payer.cpf       ?? '',
        phone:     payer.phone     ?? '',
        birthdate: payer.birthdate ?? '',
      }},
    });

    if (signUpError) {
      const jaExiste = signUpError.message.toLowerCase().includes('already')
        || signUpError.message.toLowerCase().includes('exist');
      if (jaExiste) {
        // E-mail já cadastrado — salva rascunho e redireciona para login
        sessionStorage.setItem('anaua_booking_resume', JSON.stringify({
          ...draft, payer, experienceId: draft.experienceId ?? expId,
        }));
        showToast(
          'Esse e-mail já possui cadastro. Faça login para continuar sua reserva.',
          'warn', 6000,
        );
        setTimeout(() => {
          location.href = `cliente.html?resumeBooking=1&id=${draft.experienceId ?? expId}`;
        }, 2500);
        return;
      }
      setInlineError('account-password', signUpError.message);
      showError(signUpError.message);
      return;
    }

    if (signUpData?.user) {
      console.log('[reserva] Conta Supabase criada ✓', signUpData.user.id);
      showToast('Conta criada! Verifique seu e-mail para confirmar.');
    }
  }

  // Sempre persiste o perfil do pagador para auto-preenchimento futuro
  saveProfile(payer);

  // Se o usuário já está logado, atualiza o user_metadata do Supabase
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.auth.updateUser({ data: {
        full_name: payer.fullName,
        cpf:       payer.cpf       ?? '',
        phone:     payer.phone     ?? '',
        birthdate: payer.birthdate ?? '',
      }});
    }
  } catch (_) { /* best-effort */ }

  draft.payer = payer;
  goTo(5);
  renderStep5();
});

$('back-4').addEventListener('click', () => goTo(3));

// ─── STEP 5: Participants ─────────────────────────────────────────────────────

function renderStep5() {
  const profileQtys = draft.profileQtys ?? [];
  const isAlsoPart  = draft.payer?.isAlsoParticipant ?? false;

  /** Build flat list: [[profile, index], ...] */
  const slots = [];
  profileQtys.forEach(pq => {
    for (let i = 0; i < pq.qty; i++) slots.push({ profile: pq.profile, idx: slots.length });
  });

  /** Rehydrate existing participants */
  const existing = draft.participants ?? [];

  $('participant-cards').innerHTML = slots.map((slot, i) => {
    const p   = existing[i] ?? {};
    const isPayer = isAlsoPart && i === 0;
    const label   = `${PROFILES[slot.profile].label} ${i + 1}`;
    const prefill = isPayer ? { fullName: draft.payer.fullName, docNumber: draft.payer.cpf, birthdate: draft.payer.birthdate } : {};

    return `
      <div class="participant-card" data-slot="${i}">
        <div class="participant-card__header">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          ${label}${isPayer ? ' <span style="color:var(--color-earth);font-size:10px;font-weight:400;margin-inline-start:4px">(responsável)</span>' : ''}
        </div>
        <div class="participant-card__body">
          <div class="field" style="grid-column:1/-1">
            <label class="label" for="p${i}-name">Nome completo *</label>
            <input class="input" type="text" id="p${i}-name" value="${p.fullName ?? prefill.fullName ?? ''}" placeholder="Como no documento" />
            <span class="field-error" id="p${i}-name-err" role="alert"></span>
          </div>
          <div class="field">
            <label class="label" for="p${i}-doc">CPF / RG / Passaporte *</label>
            <input class="input" type="text" id="p${i}-doc" value="${p.docNumber ?? prefill.docNumber ?? ''}" />
            <span class="field-error" id="p${i}-doc-err" role="alert"></span>
          </div>
          <div class="field">
            <label class="label" for="p${i}-birth">Data de nascimento *</label>
            <input class="input" type="date" id="p${i}-birth" value="${p.birthdate ?? prefill.birthdate ?? ''}" />
            <span class="field-error" id="p${i}-birth-err" role="alert"></span>
          </div>
        </div>
      </div>`;
  }).join('');
}

function collectParticipants() {
  const profileQtys = draft.profileQtys ?? [];
  const slots = [];
  profileQtys.forEach(pq => {
    for (let i = 0; i < pq.qty; i++) slots.push({ profile: pq.profile });
  });

  return slots.map((slot, i) => ({
    id:           `part-${i}`,
    fullName:     $(`p${i}-name`)?.value.trim() ?? '',
    docNumber:    $(`p${i}-doc`)?.value.trim() ?? '',
    birthdate:    $(`p${i}-birth`)?.value ?? '',
    profile:      slot.profile,
    isResponsible:i === 0 && (draft.payer?.isAlsoParticipant ?? false),
    observations: null,
  }));
}

$('next-5').addEventListener('click', () => {
  clearInlineErrors();
  const participants = collectParticipants();
  const errs = validateStep4(participants, draft.profileQtys ?? []);

  if (Object.keys(errs).length) {
    Object.entries(errs).forEach(([key, msg]) => {
      // key like "p0_fullName" → input id "p0-name"
      const match = key.match(/^p(\d+)_(\w+)$/);
      if (match) {
        const [, i, field] = match;
        const idMap = { fullName: `p${i}-name`, docNumber: `p${i}-doc`, birthdate: `p${i}-birth` };
        if (idMap[field]) setInlineError(idMap[field], msg);
      }
    });
    showError(errs._count ?? 'Corrija os dados dos participantes.');
    return;
  }

  draft.participants = participants;
  goTo(6);
});

$('back-5').addEventListener('click', () => goTo(4));

// ─── STEP 6: Emergency + observations ────────────────────────────────────────

maskPhone(/** @type {HTMLInputElement} */ ($('ec-phone')));

if (draft?.emergencyContact) {
  $('ec-name').value         = draft.emergencyContact.fullName ?? '';
  $('ec-phone').value        = draft.emergencyContact.phone ?? '';
  $('ec-relationship').value = draft.emergencyContact.relationship ?? '';
}
if (draft?.observations) $('observations').value = draft.observations;

$('next-6').addEventListener('click', () => {
  clearInlineErrors();
  const ec = {
    fullName:     $('ec-name').value.trim(),
    phone:        $('ec-phone').value.trim(),
    relationship: $('ec-relationship').value.trim(),
  };
  const errs = validateStep5(ec);
  if (Object.keys(errs).length) {
    Object.entries(errs).forEach(([f, msg]) => setInlineError(`ec-${f}`, msg));
    showError('Preencha os dados de emergência.');
    return;
  }
  draft.emergencyContact = ec;
  draft.observations     = $('observations').value.trim();
  goTo(7);
  renderStep7();
});

$('back-6').addEventListener('click', () => goTo(5));

// ─── STEP 7: Terms ────────────────────────────────────────────────────────────

/** Built lazily inside renderStep7 so exp.cancellationPolicy is available */
function buildTermsItems() {
  return [
    {
      key:   'terms',
      label: '<strong>Termos de Uso</strong> — Li e aceito os <a href="termos.html" target="_blank">Termos de Uso</a> da Anauá Ecoturismo.',
      required: true,
    },
    {
      key:   'cancellation',
      label: `<strong>Política de Cancelamento</strong> — Estou ciente da política: "${exp?.cancellationPolicy ?? ''}"`,
      required: true,
    },
    {
      key:   'riskAwareness',
      label: '<strong>Ciência de riscos</strong> — Declaro que estou ciente dos riscos inerentes a atividades de ecoturismo e que todos os participantes estão em condições físicas adequadas, salvo declaração em contrário nas observações.',
      required: true,
    },
    {
      key:   'imageConsent',
      label: '<strong>Uso de imagem</strong> — Autorizo o uso de fotos e vídeos da minha participação para fins de divulgação da Anauá Ecoturismo.',
      required: imageConsentRequired,
    },
  ];
}

function renderStep7() {
  const TERMS_ITEMS = buildTermsItems();
  const saved = draft.termsAcceptance ?? {};
  $('terms-list').innerHTML = TERMS_ITEMS.map(item => `
    <label class="term-item ${saved[item.key] ? 'is-checked' : ''}" data-key="${item.key}">
      <input type="checkbox" name="${item.key}" ${saved[item.key] ? 'checked' : ''} />
      <span class="term-item__text">${item.label}${item.required ? '' : ' <em style="color:var(--color-text-muted)">(opcional)</em>'}</span>
    </label>
  `).join('');

  $('terms-list').querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      cb.closest('.term-item').classList.toggle('is-checked', cb.checked);
      clearError();
    });
  });
}

$('next-7').addEventListener('click', () => {
  const acceptance = {};
  $('terms-list').querySelectorAll('input[type=checkbox]').forEach(cb => {
    acceptance[cb.name] = cb.checked;
  });
  if (imageConsentRequired && !acceptance.imageConsent) {
    showError('O consentimento de uso de imagem é obrigatório para esta experiência.');
    return;
  }
  const errs = validateStep6(acceptance);
  if (Object.keys(errs).length) { showError(Object.values(errs)[0]); return; }

  draft.termsAcceptance = {
    ...acceptance,
    acceptedAt: new Date().toISOString(),
    version:    TERMS_VERSION,
  };
  goTo(8);
  renderStep8();
});

$('back-7').addEventListener('click', () => goTo(6));

// ─── STEP 8: Payment ──────────────────────────────────────────────────────────

function renderPaymentSummary(method, pct) {
  const total  = draft.totalAmount ?? 0;
  const split  = computeSplit(total, method, pct);
  const sum    = $('price-summary-8');
  if (!sum) return;

  let rows = `<div class="price-summary__row is-total"><span>Total da reserva</span><span>${formatBRL(total)}</span></div>`;

  if (method === 'signal_balance') {
    const dueStr = new Date(split.balanceDueDate).toLocaleDateString('pt-BR');
    rows += `
      <div class="price-summary__row is-signal"><span>Sinal agora (${pct}%)</span><span>${formatBRL(split.signalAmount)}</span></div>
      <div class="price-summary__row"><span>Saldo até ${dueStr}</span><span>${formatBRL(split.balanceAmount)}</span></div>`;
  }

  sum.innerHTML = rows;
}

function renderStep8() {
  const methods = [
    {
      id:   'pix',
      icon: '⚡',
      name: 'PIX',
      desc: 'Pagamento instantâneo — confirmação imediata.',
      body: `<p style="font-size:var(--text-sm);color:var(--color-text-muted);padding-block-start:var(--sp-3)">Após confirmar, um QR Code e o código copia-e-cola serão gerados.</p>`,
    },
    {
      id:   'credit_card',
      icon: '💳',
      name: 'Cartão de crédito',
      desc: 'Até 12× sem juros.',
      body: `
        <div style="padding-block-start:var(--sp-4);display:grid;gap:var(--sp-3)">
          <div class="field">
            <label class="label" for="cc-number">Número do cartão</label>
            <input class="input" type="text" id="cc-number" placeholder="0000 0000 0000 0000" inputmode="numeric" maxlength="19" />
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:var(--sp-3)">
            <div class="field">
              <label class="label" for="cc-name">Nome no cartão</label>
              <input class="input" type="text" id="cc-name" placeholder="NOME SOBRENOME" style="text-transform:uppercase" />
            </div>
            <div class="field">
              <label class="label" for="cc-exp">Validade</label>
              <input class="input" type="text" id="cc-exp" placeholder="MM/AA" maxlength="5" />
            </div>
            <div class="field">
              <label class="label" for="cc-cvv">CVV</label>
              <input class="input" type="text" id="cc-cvv" placeholder="000" maxlength="4" inputmode="numeric" />
            </div>
          </div>
          <div class="field">
            <label class="label" for="cc-installments">Parcelamento</label>
            <select class="input" id="cc-installments">
              ${[1,2,3,4,5,6,8,10,12].map(n => `<option value="${n}x">${n}× sem juros de ${formatBRL((draft.totalAmount ?? 0)/n)}</option>`).join('')}
            </select>
          </div>
        </div>`,
    },
    {
      id:   'signal_balance',
      icon: '🤝',
      name: 'Sinal + Saldo',
      desc: 'Pague parte agora e o restante antes da saída.',
      body: `
        <div class="signal-slider-wrap">
          <label>Percentual do sinal: <strong id="signal-pct-label">${signalPct}%</strong></label>
          <input class="signal-slider" type="range" id="signal-slider" min="30" max="70" step="5" value="${signalPct}" />
          <div class="signal-slider-row"><span>Mín. 30%</span><span>Máx. 70%</span></div>
        </div>`,
    },
  ];

  $('payment-methods').innerHTML = methods.map(m => `
    <div class="payment-method ${selectedPaymentMethod === m.id ? 'is-selected' : ''}" data-method="${m.id}" role="button" tabindex="0">
      <div class="payment-method__header">
        <div class="payment-method__radio" aria-hidden="true"></div>
        <span class="payment-method__icon">${m.icon}</span>
        <div>
          <p class="payment-method__name">${m.name}</p>
          <p class="payment-method__desc">${m.desc}</p>
        </div>
      </div>
      <div class="payment-method__body">${m.body}</div>
    </div>
  `).join('');

  renderPaymentSummary(selectedPaymentMethod, signalPct);

  $('payment-methods').addEventListener('click', (e) => {
    const card = e.target.closest('.payment-method');
    if (!card) return;
    document.querySelectorAll('.payment-method').forEach(c => c.classList.remove('is-selected'));
    card.classList.add('is-selected');
    selectedPaymentMethod = card.dataset.method;
    draft.paymentMethod   = selectedPaymentMethod;
    renderPaymentSummary(selectedPaymentMethod, signalPct);
    clearError();
  });

  document.addEventListener('input', (e) => {
    if (e.target?.id === 'signal-slider') {
      signalPct = Number(e.target.value);
      const lbl = $('signal-pct-label');
      if (lbl) lbl.textContent = signalPct + '%';
      renderPaymentSummary('signal_balance', signalPct);
    }
  });
}

$('next-8').addEventListener('click', async () => {
  const errs = validateStep7({ paymentMethod: selectedPaymentMethod, signalPct });
  if (Object.keys(errs).length) { showError(Object.values(errs)[0]); return; }
  draft.paymentMethod = selectedPaymentMethod;

  const cardToken     = null;
  const installments  = selectedPaymentMethod === 'credit_card'
    ? ($('cc-installments')?.value ?? '1x')
    : null;

  setProcessing(true);
  try {
    const { booking, paymentResult, split } = await submitBooking(
      /** @type {any} */ (draft),
      { signalPct, cardToken, installments },
    );

    if (!paymentResult.success) {
      setProcessing(false);
      showError(paymentResult.errorMsg ?? 'Pagamento recusado. Tente novamente.');
      return;
    }

    setProcessing(false);
    goTo(9);
    renderVoucher(booking, paymentResult, split);
    // Toast reflete o status real — pagamento sem integração nunca chega em 'confirmed' diretamente
    const STATUS_TOAST = {
      confirmed:       'Reserva confirmada! ✓',
      reserved:        'Reserva solicitada! Aguardando confirmação de pagamento.',
      pending_payment: 'Solicitação recebida. Finalize o pagamento para garantir sua vaga.',
    };
    showToast(STATUS_TOAST[booking.status] ?? 'Solicitação recebida!', 'success', 6000);

    // ── Persistir no Supabase (destino primário — erros são logados mas não bloqueiam a UI) ──────────
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { ok: resOk, id: resId, error: resErr } = await insertReservation({
        userId:            user?.id ?? null,
        experienceId:      draft.experienceId,
        exitId:            draft.exitId ?? null,
        boardingPointId:   draft.boardingPointId ?? null,
        payer:             booking.payer,
        totalAmount:       booking.totalAmount,
        amountPaid:        booking.paidAmount ?? 0,
        reservationStatus: booking.status,
        paymentMethod:     booking.paymentMethod ?? null,
        notes:             draft.observations ?? null,
      });

      if (resOk && resId) {
        await insertParticipants(resId, booking.participants ?? []);

        // Decrementa vagas disponíveis na saída escolhida
        const totalPax = (draft.profileQtys ?? []).reduce((s, p) => s + p.qty, 0);
        if (totalPax > 0 && draft.exitId) {
          const dep = (exp?.departures ?? []).find(d => d.id === draft.exitId);
          const newCap = Math.max(0, (dep?.capacity ?? 0) - totalPax);
          const { error: capErr } = await supabase
            .from('departures')
            .update({ capacity: newCap })
            .eq('id', draft.exitId);
          if (capErr) {
            console.warn('[reserva] Falha ao decrementar vagas:', capErr.message);
          } else {
            console.log('[reserva] Vagas atualizadas ✓ novo capacity:', newCap);
          }
        }
        if (booking.paymentMethod) {
          await insertPaymentRecord({
            reservationId: resId,
            method:        paymentResult.method ?? booking.paymentMethod,
            amountPaid:    booking.paidAmount,
            status:        booking.paidAmount > 0 ? 'paid' : 'pending',
            notes:         null,
          });
        }
        console.log('[reserva] Reserva persistida no Supabase ✓ id:', resId);
      } else if (resErr) {
        console.warn('[reserva] Supabase insert falhou (reserva salva localmente):', resErr);
      }
    } catch (supaErr) {
      // Supabase persist é best-effort; não bloqueia o fluxo do usuário
      console.warn('[reserva] Supabase persist silenciou:', supaErr?.message ?? supaErr);
    }

  } catch (err) {
    setProcessing(false);
    showError('Erro ao processar reserva. Tente novamente.');
    console.error(err);
  }
});

$('back-8').addEventListener('click', () => goTo(7));

// ─── STEP 9: Voucher ──────────────────────────────────────────────────────────

/**
 * Gera link wa.me para cancelamento via WhatsApp.
 * Inclui: código da reserva, nome, experiência, data e valor.
 * @param {object} booking
 * @param {object} experience
 * @returns {string} URL wa.me
 */
function buildWhatsAppCancelLink(booking, experience) {
  const dep = (experience.departures ?? []).find(d => d.id === booking.exitId);
  const dateLabel = dep?.start_at?.split('T')[0] ? formatDate(dep.start_at.split('T')[0]) : 'data a confirmar';
  const msg = [
    `Olá! Gostaria de cancelar minha reserva.`,
    `Código: ${booking.voucherCode ?? booking.id}`,
    `Nome: ${booking.payer?.fullName ?? ''}`,
    `Experiência: ${experience.title}`,
    `Data: ${dateLabel}`,
    `Valor: ${formatBRL(booking.totalAmount ?? 0)}`,
    `Status: ${STATUS_LABEL[booking.status] ?? booking.status}`,
  ].join('\n');
  return `https://wa.me/5511999999999?text=${encodeURIComponent(msg)}`;
}

function renderVoucher(booking, paymentResult, split) {
  const dep    = (exp.departures ?? []).find(d => d.id === booking.exitId);
  const depDate = dep?.start_at?.split('T')[0] ?? null;
  const status  = booking.status;
  const hasPending = booking.pendingAmount > 0;

  const dueStr = split.balanceDueDate
    ? new Date(split.balanceDueDate).toLocaleDateString('pt-BR')
    : null;

  $('voucher-wrap').innerHTML = `
    ${hasPending ? `
      <div class="pending-balance-notice">
        <strong>⚠️ Saldo pendente: ${formatBRL(booking.pendingAmount)}</strong>
        Pague até ${dueStr} para confirmar sua vaga. Você receberá um lembrete por e-mail.
      </div>` : ''}

    <div class="voucher">
      <div class="voucher__header">
        <div>
          <p class="voucher__brand">Anauá</p>
          <p style="font-size:var(--text-sm);opacity:.8">Ecoturismo</p>
        </div>
        <div class="voucher__status">
          <span class="badge ${STATUS_CLASS[status]}">${STATUS_LABEL[status]}</span>
        </div>
      </div>

      <div class="voucher__body">
        <div class="voucher__code">${booking.voucherCode}</div>

        <dl class="voucher__grid">
          <div class="voucher__field">
            <dt>Experiência</dt>
            <dd>${exp.title}</dd>
          </div>
          <div class="voucher__field">
            <dt>Data</dt>
            <dd>${depDate ? formatDate(depDate) : '— a confirmar'}</dd>
          </div>
          <div class="voucher__field">
            <dt>Local de embarque</dt>
            <dd>${(() => {
              const bp = (draft._boardingPoints ?? []).find(p => p.id === (booking.boardingPointId ?? draft.boardingPointId));
              if (!bp) return 'A confirmar com o guia';
              const timeStr = bp.pickupAt
                ? new Date(bp.pickupAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                : null;
              return `${bp.displayName}${bp.displayAddress ? ' — ' + bp.displayAddress : ''}${timeStr ? ' às ' + timeStr : ''}`;
            })()}</dd>
          </div>
          <div class="voucher__field">
            <dt>Horário</dt>
            <dd>A confirmar</dd>
          </div>
          <div class="voucher__field">
            <dt>Responsável</dt>
            <dd>${booking.payer.fullName}</dd>
          </div>
          <div class="voucher__field">
            <dt>E-mail</dt>
            <dd>${booking.payer.email}</dd>
          </div>
        </dl>

        <div class="voucher__participants">
          <h4>Participantes</h4>
          <ul>
            ${(booking.participants ?? []).map(p => `
              <li>
                <span class="badge badge--${p.profile}">${PROFILES[p.profile]?.label ?? p.profile}</span>
                ${p.fullName}
              </li>`).join('')}
          </ul>
        </div>

        <div class="voucher__payment">
          ${(() => {
            const rows = [];
            rows.push(`<div class="price-summary__row is-total"><span>Total</span><span>${formatBRL(booking.totalAmount)}</span></div>`);
            rows.push(`<div class="price-summary__row is-signal"><span>Pago: ${PAYMENT_LABEL[paymentResult.method] ?? paymentResult.method}</span><span>${formatBRL(booking.paidAmount)}</span></div>`);
            if (hasPending) rows.push(`<div class="price-summary__row"><span>Saldo a pagar</span><span>${formatBRL(booking.pendingAmount)}</span></div>`);
            return rows.join('');
          })()}

          ${paymentResult.pixCode ? `
            <div class="pix-box" style="margin-block-start:var(--sp-4)">
              ${paymentResult.pixQrData ? `<img class="pix-box__qr" src="${paymentResult.pixQrData}" alt="QR Code PIX" />` : ''}
              <div class="pix-box__code">${paymentResult.pixCode}</div>
              <button class="btn btn--secondary btn--sm pix-box__copy" onclick="navigator.clipboard.writeText('${paymentResult.pixCode}').then(()=>window.__anauaToast('Código PIX copiado!','success',2500))">
                Copiar código PIX
              </button>
            </div>` : ''}
        </div>
      </div>

      <div class="voucher__actions">
        <button class="btn btn--secondary" onclick="window.print()">🖨️ Imprimir</button>
        <a href="cliente.html" class="btn btn--primary">Ver minhas reservas</a>
        <a
          href="${buildWhatsAppCancelLink(booking, exp)}"
          target="_blank"
          rel="noopener noreferrer"
          class="btn btn--ghost-light"
          style="color:var(--color-text-muted)"
          aria-label="Cancelar reserva via WhatsApp"
        >Cancelar reserva</a>
        <a href="experiencias.html" class="btn btn--ghost-light" style="color:var(--color-text-muted)">Ver mais experiências</a>
      </div>
    </div>`;
}

// ─── Bootstrap assíncrono ─────────────────────────────────────────────────────

(async function initReserva() {
  const params  = new URLSearchParams(location.search);
  const expSlug = params.get('id');
  const wrap    = document.getElementById('wizard-wrap');

  if (!expSlug) {
    if (wrap) wrap.innerHTML = `<div class="empty-state"><p>Experiência não especificada. <a href="experiencias.html">Ver todas</a></p></div>`;
    return;
  }

  // Mostra loading enquanto busca no Supabase
  if (wrap) wrap.style.opacity = '0.5';

  const { data: loadedExp, error } = await getExperienceBySlug(expSlug);

  if (wrap) wrap.style.opacity = '';

  if (!loadedExp || error) {
    if (wrap) wrap.innerHTML = `<div class="empty-state"><p>Experiência não encontrada. <a href="experiencias.html">Ver todas</a></p></div>`;
    return;
  }

  exp = loadedExp;
  console.log('[reserva] Experiência carregada do Supabase ✓', exp.slug);

  // Carrega configurações da plataforma (ex.: consentimento de imagem obrigatório)
  try {
    const { data: appSettings } = await supabase
      .from('app_settings')
      .select('image_consent_required')
      .limit(1)
      .single();
    if (appSettings) {
      imageConsentRequired = appSettings.image_consent_required ?? false;
    }
  } catch (_) { /* app_settings pode não existir ainda; usa default false */ }

  // Carrega saídas reais do banco
  const { data: departures } = await listDeparturesByExperience(exp.id);
  exp.departures = departures ?? [];
  console.log('[hardening-2.1] Saídas carregadas ✓', exp.departures.length);

  // Guard: sem saídas futuras → estado vazio com link para lista de espera
  if (exp.departures.length === 0) {
    if (wrap) wrap.innerHTML = `
      <div class="empty-state">
        <p class="empty-state__title">Nenhuma saída disponível</p>
        <p class="empty-state__desc">Não há vagas abertas para esta experiência no momento.</p>
        <div style="display:flex;gap:var(--sp-4);justify-content:center;flex-wrap:wrap;margin-top:var(--sp-6)">
          <a href="experiencia.html?id=${exp.slug ?? exp.id}" class="btn btn--secondary">Ver detalhes</a>
        </div>
      </div>`;
    return;
  }

  console.log('[hardening-2.1] Próxima saída vinculada ✓', exp.departures[0]?.start_at);

  // Inicializa o rascunho usando o UUID (exp.id) como chave
  draft = loadDraft() ?? createDraft(exp.id);
  if (draft.experienceId !== exp.id) draft = createDraft(exp.id);
  selectedPaymentMethod = draft.paymentMethod ?? null;

  // Pre-seleciona saída passada via URL (?dep=<uuid>)
  const depParam = params.get('dep');
  if (depParam && (exp.departures ?? []).some(d => d.id === depParam)) {
    draft.exitId = depParam;
    console.log('[reserva] Saída pré-selecionada via URL ✓', depParam);
  } else if (!draft.exitId && exp.departures.length > 0) {
    draft.exitId = exp.departures[0].id;
  }

  // Pre-seleciona ponto de embarque passado via URL (?bp=<uuid>)
  const bpParam = params.get('bp');
  if (bpParam) {
    draft.boardingPointId = bpParam;
    console.log('[reserva] Ponto de embarque pré-selecionado via URL ✓', bpParam);
  }

  // Prefill payer fields agora que draft está populado
  prefillPayerFields();

  try {
    renderStep1();
    goTo(1);
  } catch (err) {
    console.error('[reserva] Erro ao inicializar wizard:', err);
    const wrap = document.getElementById('wizard-wrap');
    if (wrap) wrap.innerHTML = `<div class="empty-state"><p>Ocorreu um erro ao carregar a reserva. Por favor, <a href="experiencias.html">volte às experiências</a> e tente novamente.</p></div>`;
  }
})();
