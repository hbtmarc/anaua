/**
 * @fileoverview Contato page — Anauá Ecoturismo
 */
import { initPage, validateField, VALIDATORS, maskPhone, showToast, observeAnimations } from './components.js';

initPage('contato.html');
observeAnimations();

/* ── FAQ data ────────────────────────────────────────────── */
const FAQS = [
  {
    q: 'Posso pagar em parcelas?',
    a: 'Sim! Aceitamos parcelamento em até 12× sem juros no cartão de crédito para experiências acima de R$ 500.',
  },
  {
    q: 'Posso levar crianças em todas as experiências?',
    a: 'Cada experiência tem uma idade mínima indicada. As experiências Kids são especialmente desenhadas para crianças de 4 a 12 anos.',
  },
  {
    q: 'O que acontece se chover?',
    a: 'Na maioria das trilhas, operamos normalmente com chuva leve. Em casos de tempestade ou alerta meteorológico, remarcamos sem custo.',
  },
  {
    q: 'Posso cancelar minha reserva?',
    a: 'Cada experiência tem sua própria política de cancelamento, descrita na página de detalhes. Em geral, cancelamentos com mais de 72h têm reembolso total.',
  },
  {
    q: 'Vocês fazem grupos corporativos?',
    a: 'Sim! Temos programas personalizados para equipes de 10 a 80 pessoas, com atividades adaptadas ao objetivo do grupo.',
  },
];

function renderFAQ() {
  const list = document.getElementById('faq-list');
  if (!list) return;

  list.innerHTML = FAQS.map((faq, i) => `
    <div class="faq-item">
      <button
        class="faq-trigger"
        id="faq-trigger-${i}"
        aria-expanded="false"
        aria-controls="faq-panel-${i}"
      >
        <span>${faq.q}</span>
        <span class="faq-icon" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </span>
      </button>
      <div
        class="faq-panel"
        id="faq-panel-${i}"
        role="region"
        aria-labelledby="faq-trigger-${i}"
        aria-hidden="true"
      >
        <p class="faq-panel__body">${faq.a}</p>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.faq-trigger').forEach(btn => {
    btn.addEventListener('click', () => {
      const isOpen = btn.getAttribute('aria-expanded') === 'true';
      const panelId = btn.getAttribute('aria-controls') ?? '';
      const panel   = document.getElementById(panelId);

      // Close all
      list.querySelectorAll('.faq-trigger').forEach(b => b.setAttribute('aria-expanded', 'false'));
      list.querySelectorAll('.faq-panel').forEach(p => p.setAttribute('aria-hidden', 'true'));

      if (!isOpen) {
        btn.setAttribute('aria-expanded', 'true');
        panel?.setAttribute('aria-hidden', 'false');
      }
    });
  });
}

renderFAQ();

/* ── Form validation & submit ────────────────────────────── */
const form       = document.getElementById('contact-form');
const submitBtn  = document.getElementById('submit-btn');
const formStatus = document.getElementById('form-status');

const phoneInput = /** @type {HTMLInputElement} */ (document.getElementById('phone'));
if (phoneInput) maskPhone(phoneInput);

form?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name    = /** @type {HTMLInputElement} */    (document.getElementById('name'));
  const email   = /** @type {HTMLInputElement} */    (document.getElementById('email'));
  const phone   = /** @type {HTMLInputElement} */    (document.getElementById('phone'));
  const message = /** @type {HTMLTextAreaElement} */ (document.getElementById('message'));
  const consent = /** @type {HTMLInputElement} */    (document.getElementById('consent'));

  const validName    = validateField(name,    [VALIDATORS.required, VALIDATORS.minLen(2)]);
  const validEmail   = validateField(email,   [VALIDATORS.required, VALIDATORS.email]);
  const validPhone   = phone?.value.trim()
    ? validateField(phone, [VALIDATORS.phone])
    : true;
  const validMessage = validateField(message, [VALIDATORS.required, VALIDATORS.minLen(10)]);

  // Consent check
  const consentErr = document.getElementById('consent-err');
  let validConsent = true;
  if (!consent?.checked) {
    if (consentErr) { consentErr.textContent = 'Você precisa aceitar a política de privacidade.'; consentErr.style.display = 'flex'; }
    validConsent = false;
  } else {
    if (consentErr) consentErr.style.display = 'none';
  }

  if (!validName || !validEmail || !validPhone || !validMessage || !validConsent) return;

  // Simulate submit
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Enviando…';
  }

  await new Promise(r => setTimeout(r, 1200));

  form.reset();

  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Enviar mensagem';
  }

  if (formStatus) {
    formStatus.style.display = 'block';
    formStatus.style.color   = 'var(--color-success)';
    formStatus.textContent   = '✓ Mensagem enviada! Responderemos em até 24 horas úteis.';
  }

  showToast('Mensagem enviada com sucesso!', 'success');
});

// Inline live validation on blur
['name', 'email', 'message'].forEach(id => {
  const el = document.getElementById(id);
  el?.addEventListener('blur', () => {
    if (id === 'name')    validateField(/** @type {any} */ (el), [VALIDATORS.required, VALIDATORS.minLen(2)]);
    if (id === 'email')   validateField(/** @type {any} */ (el), [VALIDATORS.required, VALIDATORS.email]);
    if (id === 'message') validateField(/** @type {any} */ (el), [VALIDATORS.required, VALIDATORS.minLen(10)]);
  });
});
