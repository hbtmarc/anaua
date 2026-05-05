/**
 * @fileoverview Listing page — Anauá Ecoturismo
 * Dados carregados dinamicamente do Supabase (não mais mock estático).
 */
import './supabaseClient.js'; // garante window.anauaDb
import { listExperiences, listDeparturesByExperience } from './repositories/experienceRepo.js';
import { initPage, renderExperienceCard, renderSkeletonCards, observeAnimations } from './components.js';

initPage('experiencias.html');
observeAnimations();

const PAGE_SIZE = 8;
let currentPage = 1;
let activeCategoryFilter = 'all';
let activeDifficultyFilter = 'all';
let sortValue = 'featured';

/** @type {object[]} Experiências carregadas do banco */
let EXPERIENCES = [];

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
  let list = EXPERIENCES; // Supabase já filtra is_active=true

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
function render() {
  if (!grid) return;

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
async function init() {
  syncChips();

  // Mostra skeletons enquanto carrega do banco
  if (grid) {
    grid.setAttribute('aria-busy', 'true');
    grid.innerHTML = renderSkeletonCards(PAGE_SIZE);
  }

  const { data, error } = await listExperiences();

  if (error || !data) {
    console.error('[listing] Falha ao carregar experiências do Supabase:', error?.message ?? 'sem dados');
    if (grid) grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <p class="empty-state__desc">Não foi possível carregar as experiências. Tente recarregar a página.</p>
      </div>`;
    return;
  }

  console.log(`[listing] ${data.length} experiência(s) carregada(s) do Supabase ✓`);
  console.log('[listing] Buscando saídas reais por experiência...');

  // Enriquece cada experiência com a próxima saída real do banco
  const enriched = await Promise.all(
    data.map(async (exp) => {
      const expId = exp.dbId ?? exp.id;
      if (!expId) { exp.nextDeparture = null; return exp; }

      try {
        const { data: deps, error: depErr } = await listDeparturesByExperience(expId);
        if (depErr || !deps || deps.length === 0) {
          console.log(`[listing] Experiência sem saída futura: ${exp.title}`);
          exp.nextDeparture = null;
        } else {
          exp.nextDeparture = deps[0]; // próxima cronologicamente
          console.log(`[listing] Saída vinculada à experiência '${exp.title}':`, exp.nextDeparture.start_at);
        }
      } catch (e) {
        console.warn(`[listing] Falha ao buscar saídas para '${exp.title}':`, e);
        exp.nextDeparture = null;
      }
      return exp;
    })
  );

  EXPERIENCES = enriched;
  render();
}

init();
