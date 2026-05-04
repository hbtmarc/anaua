/**
 * @fileoverview Shared UI components — Anauá Ecoturismo
 * Utilities, header, footer, toast, modal and card rendering.
 */

import { EXPERIENCES, CATEGORIES, TESTIMONIALS, STATS, getNextActiveExit, formatBRL, formatDate } from './data.js';

/* ── SVG ICONS ───────────────────────────────────────────── */
export const Icon = {
  clock:    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  users:    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>`,
  map:      `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
  calendar: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  star:     `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  check:    `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`,
  x:        `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  close:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  arrow:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`,
  arrowDown:`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>`,
  leaf:     `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>`,
  instagram:`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>`,
  whatsapp: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`,
  youtube:  `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
};

/* ── HEADER ──────────────────────────────────────────────── */
const NAV_LINKS = [
  { href: 'index.html',         label: 'Início' },
  { href: 'experiencias.html',  label: 'Experiências' },
  { href: 'sobre.html',         label: 'Sobre' },
  { href: 'contato.html',       label: 'Contato' },
  { href: 'cliente.html',       label: 'Minha Conta' },
];

/**
 * Injeta o header fixo na página.
 * @param {string} activePage - href da página ativa
 */
export function renderHeader(activePage = '') {
  const navLinks = NAV_LINKS.map(l =>
    `<a href="${l.href}" class="nav__link" ${l.href === activePage ? 'aria-current="page"' : ''}>${l.label}</a>`
  ).join('');

  const drawerLinks = NAV_LINKS.map(l =>
    `<a href="${l.href}" class="nav-drawer__link" ${l.href === activePage ? 'aria-current="page"' : ''}>${l.label}</a>`
  ).join('');

  const html = `
    <header class="header" id="site-header" role="banner">
      <div class="container">
        <div class="header__inner">
          <a href="index.html" class="header__logo" aria-label="Anauá Ecoturismo — Página inicial">
            <span class="header__logo-mark" aria-hidden="true">A</span>
            <span class="header__logo-text">
              Anauá
              <span class="header__logo-sub">Ecoturismo</span>
            </span>
          </a>
          <nav class="nav" aria-label="Navegação principal">
            ${navLinks}
          </nav>
          <div class="header__actions">
            <a href="experiencias.html" class="btn btn--primary btn--sm" style="display:none" id="header-cta">Reservar</a>
            <button
              class="burger"
              id="burger-btn"
              aria-expanded="false"
              aria-controls="nav-drawer"
              aria-label="Abrir menu"
            >
              <span class="burger__line"></span>
              <span class="burger__line"></span>
              <span class="burger__line"></span>
            </button>
          </div>
        </div>
      </div>
    </header>
    <nav class="nav-drawer" id="nav-drawer" aria-label="Menu mobile" aria-hidden="true">
      ${drawerLinks}
    </nav>
  `;

  const placeholder = document.getElementById('header-placeholder');
  if (placeholder) placeholder.outerHTML = html;
  else document.body.insertAdjacentHTML('afterbegin', html);

  initHeader();
}

function initHeader() {
  const header = document.getElementById('site-header');
  const burgerBtn = document.getElementById('burger-btn');
  const navDrawer = document.getElementById('nav-drawer');
  const headerCTA = document.getElementById('header-cta');

  // Sticky scroll class
  const onScroll = () => {
    const scrolled = window.scrollY > 10;
    header?.classList.toggle('is-scrolled', scrolled);
    if (headerCTA) headerCTA.style.display = scrolled ? 'inline-flex' : 'none';
  };

  window.addEventListener('scroll', onScroll, { passive: true });

  // Burger toggle
  burgerBtn?.addEventListener('click', () => {
    const expanded = burgerBtn.getAttribute('aria-expanded') === 'true';
    const open = !expanded;
    burgerBtn.setAttribute('aria-expanded', String(open));
    burgerBtn.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    navDrawer?.classList.toggle('is-open', open);
    navDrawer?.setAttribute('aria-hidden', String(!open));
    document.body.style.overflow = open ? 'hidden' : '';
  });

  // Close drawer on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && burgerBtn?.getAttribute('aria-expanded') === 'true') {
      burgerBtn.setAttribute('aria-expanded', 'false');
      burgerBtn.setAttribute('aria-label', 'Abrir menu');
      navDrawer?.classList.remove('is-open');
      navDrawer?.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      burgerBtn.focus();
    }
  });

  // Close drawer on link click
  navDrawer?.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      burgerBtn?.setAttribute('aria-expanded', 'false');
      burgerBtn?.setAttribute('aria-label', 'Abrir menu');
      navDrawer.classList.remove('is-open');
      navDrawer.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    });
  });
}

/* ── FOOTER ──────────────────────────────────────────────── */
export function renderFooter() {
  const html = `
    <footer class="footer" role="contentinfo">
      <div class="container">
        <div class="footer__grid">
          <div class="footer__brand">
            <a href="index.html" class="header__logo" aria-label="Anauá Ecoturismo">
              <span class="header__logo-mark">A</span>
              <span class="header__logo-text">
                Anauá
                <span class="header__logo-sub">Ecoturismo</span>
              </span>
            </a>
            <p class="footer__tagline">
              Conectamos pessoas à natureza através de experiências autênticas,
              responsáveis e inesquecíveis por todo o Brasil.
            </p>
            <div class="footer__socials">
              <a href="https://instagram.com/anaua.eco" class="footer__social-link" aria-label="Instagram" rel="noopener" target="_blank">${Icon.instagram}</a>
              <a href="https://wa.me/5521999999999" class="footer__social-link" aria-label="WhatsApp" rel="noopener" target="_blank">${Icon.whatsapp}</a>
              <a href="https://youtube.com/@anaua" class="footer__social-link" aria-label="YouTube" rel="noopener" target="_blank">${Icon.youtube}</a>
            </div>
          </div>
          <div>
            <p class="footer__col-title">Experiências</p>
            <ul class="footer__links">
              <li><a href="experiencias.html?cat=day-experience" class="footer__link">Experiências de 1 Dia</a></li>
              <li><a href="experiencias.html?cat=expedition" class="footer__link">Expedições</a></li>
              <li><a href="experiencias.html?cat=event" class="footer__link">Eventos</a></li>
              <li><a href="experiencias.html?cat=kids" class="footer__link">Kids</a></li>
            </ul>
          </div>
          <div>
            <p class="footer__col-title">Empresa</p>
            <ul class="footer__links">
              <li><a href="sobre.html" class="footer__link">Sobre Nós</a></li>
              <li><a href="sobre.html#missao" class="footer__link">Missão & Valores</a></li>
              <li><a href="sobre.html#equipe" class="footer__link">Nossa Equipe</a></li>
              <li><a href="contato.html" class="footer__link">Contato</a></li>
            </ul>
          </div>
          <div>
            <p class="footer__col-title">Suporte</p>
            <ul class="footer__links">
              <li><a href="cliente.html" class="footer__link">Minha Conta</a></li>
              <li><a href="contato.html#faq" class="footer__link">FAQ</a></li>
              <li><a href="privacidade.html" class="footer__link">Privacidade</a></li>
              <li><a href="termos.html" class="footer__link">Termos de Uso</a></li>
            </ul>
          </div>
        </div>
        <div class="footer__bottom">
          <p class="footer__copy">© ${new Date().getFullYear()} Anauá Ecoturismo LTDA. CNPJ 00.000.000/0001-00</p>
          <div class="footer__legal">
            <a href="privacidade.html" class="footer__legal-link">Privacidade</a>
            <a href="termos.html" class="footer__legal-link">Termos</a>
          </div>
        </div>
      </div>
    </footer>
  `;

  const placeholder = document.getElementById('footer-placeholder');
  if (placeholder) placeholder.outerHTML = html;
  else document.body.insertAdjacentHTML('beforeend', html);
}

/* ── EXPERIENCE CARD ─────────────────────────────────────── */
/**
 * @param {import('./types').Experience} exp
 * @returns {string} HTML string
 */
export function renderExperienceCard(exp) {
  const nextExit = getNextActiveExit(exp);
  const isSoldOut = !nextExit && exp.status !== 'draft';
  const price = formatBRL(exp.pricePerPerson);
  const nextLabel = nextExit ? nextExit.dateLabel : 'Esgotado';

  const levelBadge = `<span class="badge badge--level-${exp.difficulty}">${exp.difficulty}</span>`;
  const categoryLabel = CATEGORIES.find(c => c.id === exp.category)?.label ?? exp.category;

  return `
    <article class="card ${isSoldOut ? 'card--sold-out' : ''}">
      <a href="experiencia.html?id=${exp.id}" class="card__thumb" tabindex="-1" aria-hidden="true">
        <img
          src="${exp.coverImage}"
          alt=""
          loading="lazy"
          onerror="this.src='assets/img/placeholder.svg'"
        />
        <div class="card__thumb-badges">
          ${levelBadge}
          ${exp.isNew ? '<span class="badge badge--new">Novo</span>' : ''}
          ${isSoldOut ? '<span class="badge badge--sold-out">Esgotado</span>' : ''}
        </div>
        <div class="card__thumb-price">
          <div class="card__thumb-price-from">a partir de</div>
          <div class="card__thumb-price-value">${price}</div>
        </div>
      </a>
      <div class="card__body">
        <p class="card__category">${categoryLabel}</p>
        <h3 class="card__title">
          <a href="experiencia.html?id=${exp.id}">${exp.title}</a>
        </h3>
        <p class="card__desc">${exp.subtitle}</p>
        <div class="card__meta">
          <span class="card__meta-item">${Icon.clock} ${exp.durationLabel}</span>
          <span class="card__meta-item">${Icon.map} ${exp.location}</span>
          <span class="card__meta-item">${Icon.users} Máx. ${exp.maxParticipants}</span>
          ${nextExit ? `
            <span class="card__next-exit">
              ${Icon.calendar} Próxima: ${nextLabel}
              ${nextExit.spotsAvailable <= 4 ? `· <strong style="color:var(--color-warning)">${nextExit.spotsAvailable} vagas</strong>` : ''}
            </span>
          ` : ''}
        </div>
      </div>
      <a href="experiencia.html?id=${exp.id}" class="card__cta" aria-label="Ver detalhes de ${exp.title}">
        ${isSoldOut ? 'Lista de espera' : 'Ver detalhes'} ${Icon.arrow}
      </a>
    </article>
  `;
}

/* ── SKELETON CARDS ──────────────────────────────────────── */
export function renderSkeletonCards(count = 6) {
  return Array.from({ length: count }, () => `
    <div class="card card--skeleton" aria-hidden="true">
      <div class="card__thumb skeleton"></div>
      <div class="card__body">
        <div class="skeleton sk-line sk-line--sm"></div>
        <div class="skeleton sk-line sk-line--xl" style="margin-top:8px"></div>
        <div class="skeleton sk-line sk-line--lg" style="margin-top:4px"></div>
        <div class="skeleton sk-line sk-line--md" style="margin-top:16px"></div>
      </div>
      <div class="skeleton" style="height:44px;border-radius:0"></div>
    </div>
  `).join('');
}

/* ── TOAST ───────────────────────────────────────────────── */
let toastContainer = null;

function ensureToastContainer() {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    toastContainer.setAttribute('aria-live', 'polite');
    toastContainer.setAttribute('aria-atomic', 'false');
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

/**
 * Exibe um toast.
 * @param {string} message
 * @param {'success'|'error'|'warn'} [type]
 * @param {number} [duration] ms
 */
export function showToast(message, type = 'success', duration = 4000) {
  const container = ensureToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.setAttribute('role', 'alert');
  toast.innerHTML = `
    <span class="toast__msg">${message}</span>
    <button class="toast__close" aria-label="Fechar">${Icon.close}</button>
  `;

  const close = () => {
    toast.style.animation = 'fadeIn 200ms reverse forwards';
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  };

  toast.querySelector('.toast__close')?.addEventListener('click', close);
  container.appendChild(toast);
  if (duration > 0) setTimeout(close, duration);
}

/* ── MODAL ───────────────────────────────────────────────── */
/**
 * Abre um modal com conteúdo dinâmico.
 * @param {{ title: string, body: string, footer?: string }} options
 * @returns {{ close: () => void }}
 */
export function openModal({ title, body, footer = '' }) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', title);

  backdrop.innerHTML = `
    <div class="modal">
      <div class="modal__header">
        <h2 class="modal__title">${title}</h2>
        <button class="modal__close" aria-label="Fechar modal">${Icon.close}</button>
      </div>
      <div class="modal__body">${body}</div>
      ${footer ? `<div class="modal__footer">${footer}</div>` : ''}
    </div>
  `;

  const close = () => {
    backdrop.style.animation = 'fadeIn 200ms reverse forwards';
    backdrop.addEventListener('animationend', () => backdrop.remove(), { once: true });
    document.body.style.overflow = '';
  };

  backdrop.querySelector('.modal__close')?.addEventListener('click', close);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); }, { once: true });

  document.body.appendChild(backdrop);
  document.body.style.overflow = 'hidden';

  return { close };
}

/* ── TESTIMONIAL CARD ────────────────────────────────────── */
/**
 * @param {import('./types').Testimonial} t
 */
export function renderTestimonialCard(t) {
  const stars = Array.from({ length: t.rating }, () => Icon.star).join('');
  return `
    <blockquote class="testimonial">
      <div class="testimonial__stars" aria-label="${t.rating} estrelas">${stars}</div>
      <p class="testimonial__text">"${t.text}"</p>
      <footer class="testimonial__author">
        <span class="testimonial__avatar" aria-hidden="true">${t.avatarInitials}</span>
        <div>
          <p class="testimonial__name">${t.authorName}</p>
          <p class="testimonial__role">${t.authorRole}</p>
        </div>
      </footer>
    </blockquote>
  `;
}

/* ── FORM VALIDATION ─────────────────────────────────────── */
const VALIDATORS = {
  required: (v) => v.trim() !== '' || 'Campo obrigatório.',
  email:    (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || 'E-mail inválido.',
  phone:    (v) => /^\(\d{2}\)\s?\d{4,5}-\d{4}$/.test(v) || 'Telefone inválido. Ex: (11) 99999-9999',
  minLen:   (n) => (v) => v.trim().length >= n || `Mínimo ${n} caracteres.`,
  cpf:      (v) => {
    const d = v.replace(/\D/g, '');
    if (d.length !== 11) return 'CPF inválido.';
    if (/^(\d)\1+$/.test(d)) return 'CPF inválido.';
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += +d[i] * (10 - i);
    let r = (sum * 10) % 11;
    if (r === 10 || r === 11) r = 0;
    if (r !== +d[9]) return 'CPF inválido.';
    sum = 0;
    for (let i = 0; i < 10; i++) sum += +d[i] * (11 - i);
    r = (sum * 10) % 11;
    if (r === 10 || r === 11) r = 0;
    if (r !== +d[10]) return 'CPF inválido.';
    return true;
  },
};

/**
 * Valida um campo de formulário.
 * @param {HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement} field
 * @param {Array<Function>} rules
 * @returns {boolean}
 */
export function validateField(field, rules) {
  const group = field.closest('.form-group');
  const errorEl = group?.querySelector('.field-error');
  field.classList.remove('input--error', 'textarea--error');

  for (const rule of rules) {
    const result = rule(field.value);
    if (result !== true) {
      field.classList.add(field.tagName === 'TEXTAREA' ? 'textarea--error' : 'input--error');
      if (errorEl) {
        errorEl.textContent = result;
        errorEl.style.display = 'flex';
      }
      return false;
    }
  }

  if (errorEl) errorEl.style.display = 'none';
  return true;
}

export { VALIDATORS };

/* ── MASK INPUT ──────────────────────────────────────────── */
/**
 * Aplica máscara de telefone em tempo real.
 */
export function maskPhone(input) {
  input.addEventListener('input', () => {
    let v = input.value.replace(/\D/g, '').slice(0, 11);
    if (v.length > 10) v = v.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
    else if (v.length > 6) v = v.replace(/^(\d{2})(\d{4,5})(\d{0,4})$/, '($1) $2-$3');
    else if (v.length > 2) v = v.replace(/^(\d{2})(\d+)$/, '($1) $2');
    input.value = v;
  });
}

/**
 * Aplica máscara de CPF em tempo real.
 */
export function maskCPF(input) {
  input.addEventListener('input', () => {
    let v = input.value.replace(/\D/g, '').slice(0, 11);
    v = v.replace(/^(\d{3})(\d)/, '$1.$2');
    v = v.replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3');
    v = v.replace(/\.(\d{3})(\d)/, '.$1-$2');
    input.value = v;
  });
}

/* ── PAGE INIT HELPER ────────────────────────────────────── */
/**
 * Inicializa header + footer e remove o estado de loading do body.
 * @param {string} activePage
 */
export function initPage(activePage = '') {
  renderHeader(activePage);
  renderFooter();
  document.body.classList.remove('is-loading');
}

/* ── INTERSECTION OBSERVER ANIMATION ────────────────────── */
export function observeAnimations() {
  const els = document.querySelectorAll('[data-animate]');
  if (!els.length) return;

  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('animate-fade-in-up');
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  els.forEach(el => obs.observe(el));
}

/* ── BREADCRUMB ──────────────────────────────────────────── */
/**
 * @param {Array<{label: string, href?: string}>} crumbs
 */
export function renderBreadcrumb(crumbs) {
  const items = crumbs.map((c, i) => {
    const isLast = i === crumbs.length - 1;
    return `
      <li class="breadcrumb__item" ${isLast ? 'aria-current="page"' : ''}>
        ${!isLast && c.href ? `<a href="${c.href}">${c.label}</a>` : c.label}
      </li>
      ${!isLast ? '<li class="breadcrumb__sep" aria-hidden="true">›</li>' : ''}
    `;
  }).join('');

  return `<ol class="breadcrumb" aria-label="Caminho de navegação">${items}</ol>`;
}

/* ── PLACEHOLDER IMG ─────────────────────────────────────── */
// NOTE: createPlaceholderSVG removed — was exported but never used.
// If needed in the future, generate inline SVG data URIs at call site.

