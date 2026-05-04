/**
 * @fileoverview Listing page — Anauá Ecoturismo
 */
import { EXPERIENCES, CATEGORIES } from './data.js';
import { initPage, renderExperienceCard, renderSkeletonCards, observeAnimations } from './components.js';

initPage('experiencias.html');
observeAnimations();

const PAGE_SIZE = 8;
let currentPage = 1;
let activeCategoryFilter = 'all';
let activeDifficultyFilter = 'all';
let sortValue = 'featured';

/* ── Read URL params ─────────────────────────────────────── */
const params = new URLSearchParams(location.search);
const catParam = params.get('cat');
if (catParam) activeCategoryFilter = catParam;

/* ── DOM refs ────────────────────────────────────────────── */
const grid       = /** @type {HTMLElement} */ (document.getElementById('listing-grid'));
const countEl    = document.getElementById('results-count');
const paginEl    = document.getElementById('pagination');
const sortSelect = /** @type {HTMLSelectElement} */ (document.getElementById('sort-select'));

/* ── Filter chips ────────────────────────────────────────── */
function syncChips() {
  document.querySelectorAll('.filter-chip').forEach(btn => {
    const f    = btn.getAttribute('data-filter') ?? '';
    const type = btn.getAttribute('data-type');
    const isActive = type === 'difficulty'
      ? activeDifficultyFilter === f
      : activeCategoryFilter === f;

    btn.classList.toggle('is-active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
  });
}

document.querySelectorAll('.filter-chip').forEach(btn => {
  btn.addEventListener('click', () => {
    const f    = btn.getAttribute('data-filter') ?? 'all';
    const type = btn.getAttribute('data-type');
    if (type === 'difficulty') {
      activeDifficultyFilter = activeDifficultyFilter === f ? 'all' : f;
    } else {
      activeCategoryFilter = f;
    }
    currentPage = 1;
    syncChips();
    render();
  });
});

sortSelect?.addEventListener('change', () => {
  sortValue = sortSelect.value;
  currentPage = 1;
  render();
});

/* ── Filter + sort ───────────────────────────────────────── */
function getFiltered() {
  let list = EXPERIENCES.filter(e => e.status !== 'draft');

  if (activeCategoryFilter !== 'all') {
    list = list.filter(e => e.category === activeCategoryFilter);
  }

  if (activeDifficultyFilter !== 'all') {
    list = list.filter(e => e.difficulty === activeDifficultyFilter);
  }

  switch (sortValue) {
    case 'price-asc':  list = [...list].sort((a, b) => a.pricePerPerson - b.pricePerPerson); break;
    case 'price-desc': list = [...list].sort((a, b) => b.pricePerPerson - a.pricePerPerson); break;
    case 'name':       list = [...list].sort((a, b) => a.title.localeCompare(b.title, 'pt-BR')); break;
    default:           list = [...list].sort((a, b) => (b.isFeatured ? 1 : 0) - (a.isFeatured ? 1 : 0)); break;
  }

  return list;
}

/* ── Pagination ──────────────────────────────────────────── */
function renderPagination(total) {
  if (!paginEl) return;
  const pages = Math.ceil(total / PAGE_SIZE);
  if (pages <= 1) { paginEl.innerHTML = ''; return; }

  let html = '';
  for (let i = 1; i <= pages; i++) {
    html += `<button class="page-btn ${i === currentPage ? 'is-active' : ''}" data-page="${i}" aria-label="Página ${i}" ${i === currentPage ? 'aria-current="page"' : ''}>${i}</button>`;
  }
  paginEl.innerHTML = html;

  paginEl.querySelectorAll('.page-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentPage = Number(btn.getAttribute('data-page'));
      render();
      document.getElementById('main-content')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

/* ── Main render ─────────────────────────────────────────── */
async function render() {
  if (!grid) return;
  grid.setAttribute('aria-busy', 'true');
  grid.innerHTML = renderSkeletonCards(PAGE_SIZE);

  await new Promise(r => setTimeout(r, 350));

  let filtered;
  try {
    filtered = getFiltered();
  } catch (err) {
    console.error('[listing] Erro ao filtrar experiências:', err);
    grid.setAttribute('aria-busy', 'false');
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><p class="empty-state__desc">Erro ao carregar experiências. Tente recarregar a página.</p></div>`;
    return;
  }
  const total    = filtered.length;
  const page     = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  if (countEl) {
    countEl.textContent = total === 0
      ? 'Nenhuma experiência encontrada'
      : `${total} experiência${total !== 1 ? 's' : ''} encontrada${total !== 1 ? 's' : ''}`;
  }

  grid.setAttribute('aria-busy', 'false');

  if (!page.length) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <svg class="empty-state__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <h2 class="empty-state__title">Nenhum resultado</h2>
        <p class="empty-state__desc">Tente remover alguns filtros para ver mais opções.</p>
        <button class="btn btn--secondary" id="clear-filters">Limpar filtros</button>
      </div>
    `;
    document.getElementById('clear-filters')?.addEventListener('click', () => {
      activeCategoryFilter = 'all';
      activeDifficultyFilter = 'all';
      currentPage = 1;
      syncChips();
      render();
    });
  } else {
    grid.innerHTML = page.map(renderExperienceCard).join('');
  }

  renderPagination(total);
}

/* ── Init ────────────────────────────────────────────────── */
syncChips();
render();
