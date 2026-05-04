/**
 * @fileoverview Home page — Anauá Ecoturismo
 */
import { EXPERIENCES, TESTIMONIALS, STATS, CATEGORIES, getNextActiveExit, formatBRL } from './data.js';
import { initPage, renderExperienceCard, renderSkeletonCards, renderTestimonialCard, observeAnimations } from './components.js';

initPage('index.html');

/* ── Stats strip ─────────────────────────────────────────── */
function renderStats() {
  const grid = document.getElementById('stats-grid');
  if (!grid) return;

  const items = [
    { value: `${STATS.experiencesCount}+`,  label: 'Roteiros exclusivos' },
    { value: `${STATS.satisfactionPct}%`,   label: 'de satisfação' },
    { value: `${(STATS.participantsCount / 1000).toFixed(1)}k+`, label: 'Participantes' },
    { value: `${STATS.yearsActive} anos`,   label: 'de história' },
  ];

  grid.innerHTML = items.map(s => `
    <div class="stat" role="img" aria-label="${s.value} ${s.label}">
      <div class="stat__value" aria-hidden="true">${s.value}</div>
      <div class="stat__label">${s.label}</div>
    </div>
  `).join('');
}

/* ── Featured grid ───────────────────────────────────────── */
async function renderFeatured() {
  const grid = document.getElementById('featured-grid');
  if (!grid) return;

  grid.innerHTML = renderSkeletonCards(3);

  // Simula latência de API
  await new Promise(r => setTimeout(r, 600));

  const featured = EXPERIENCES.filter(e => e.isFeatured).slice(0, 3);
  grid.setAttribute('aria-busy', 'false');

  if (!featured.length) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <svg class="empty-state__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/></svg>
        <h3 class="empty-state__title">Nenhuma experiência disponível</h3>
        <p class="empty-state__desc">Volte em breve — nossa agenda está sendo atualizada.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = featured.map(renderExperienceCard).join('');
}

/* ── Category grid ───────────────────────────────────────── */
function renderCategories() {
  const grid = document.getElementById('categories-grid');
  if (!grid) return;

  const defs = [
    { id: 'day-experience', icon: '☀️', label: 'Experiências de 1 dia', href: 'experiencias.html?cat=day-experience' },
    { id: 'expedition',     icon: '🗺️', label: 'Expedições',           href: 'experiencias.html?cat=expedition' },
    { id: 'event',          icon: '✨', label: 'Eventos',              href: 'experiencias.html?cat=event' },
    { id: 'kids',           icon: '🌱', label: 'Kids',                 href: 'experiencias.html?cat=kids' },
  ];

  grid.innerHTML = defs.map(d => {
    const count = EXPERIENCES.filter(e => e.category === d.id && e.status === 'active').length;
    return `
      <a href="${d.href}" class="home-cat-card" aria-label="${d.label}: ${count} experiências">
        <div class="home-cat-card__icon" aria-hidden="true">${d.icon}</div>
        <div class="home-cat-card__label">${d.label}</div>
        <div class="home-cat-card__count">${count} experiências</div>
      </a>
    `;
  }).join('');
}

/* ── Testimonials ────────────────────────────────────────── */
function renderTestimonials() {
  const grid = document.getElementById('testimonials-grid');
  if (!grid) return;
  grid.innerHTML = TESTIMONIALS.map(renderTestimonialCard).join('');
}

/* ── Run ─────────────────────────────────────────────────── */
renderStats();
renderFeatured();
renderCategories();
renderTestimonials();
observeAnimations();
