/**
 * @fileoverview Experience detail page — Anauá Ecoturismo
 * Carrega experiência do Supabase pelo slug da URL (?id=<slug>).
 */
import { CATEGORIES, formatBRL, formatDate } from './data.js';
import {
  initPage, renderBreadcrumb, renderExperienceCard, renderSkeletonCards,
  Icon, showToast, openModal, observeAnimations,
} from './components.js';
import { getExperienceBySlug, listDeparturesByExperience } from './repositories/experienceRepo.js';
import { listBoardingPointsByDeparture } from './repositories/boardingPointRepo.js';

initPage('experiencias.html');

/* ── Skeleton enquanto carrega ───────────────────────────── */
function showDetailSkeleton() {
  const hero = document.getElementById('detail-hero');
  if (hero) hero.innerHTML = `<div class="skeleton" style="width:100%;height:100%"></div>`;
  const content = document.getElementById('detail-content');
  if (content) content.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:16px;padding:24px 0">
      <div class="skeleton sk-line sk-line--xl" style="height:32px"></div>
      <div class="skeleton sk-line sk-line--lg"></div>
      <div class="skeleton sk-line sk-line--md"></div>
      <div class="skeleton sk-line sk-line--lg" style="margin-top:24px"></div>
      <div class="skeleton sk-line sk-line--xl"></div>
    </div>`;
}

/* ── Estado de erro ──────────────────────────────────────── */
function showNotFound() {
  document.getElementById('detail-content')?.replaceWith((() => {
    const d = document.createElement('div');
    d.className = 'empty-state';
    d.style.gridColumn = '1/-1';
    d.innerHTML = `
      <svg class="empty-state__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <h2 class="empty-state__title">Experiência não encontrada</h2>
      <p class="empty-state__desc">O link pode estar desatualizado ou a experiência foi removida.</p>
      <a href="experiencias.html" class="btn btn--primary">Ver todas as experiências</a>
    `;
    return d;
  })());
}

/* ── Init assíncrono ─────────────────────────────────────── */
(async function initDetail() {
  const params = new URLSearchParams(location.search);
  const slug   = params.get('id');

  if (!slug) { showNotFound(); return; }

  showDetailSkeleton();

  const { data: exp, error } = await getExperienceBySlug(slug);

  if (!exp || error) { showNotFound(); return; }

  // Carrega saídas reais do banco
  const { data: departures } = await listDeparturesByExperience(exp.id);
  exp.departures = departures ?? [];
  console.log('[detail] Experiência carregada do Supabase ✓', exp.slug, '— saídas:', exp.departures.length);

  // Carrega pontos de embarque para todas as saídas programadas
  const bpMap = {};
  const scheduledIds = exp.departures.filter(d => d.status === 'scheduled' || d.status === 'sold_out').map(d => d.id);
  await Promise.all(scheduledIds.map(async depId => {
    const { data: bps } = await listBoardingPointsByDeparture(depId);
    if (bps?.length) bpMap[depId] = bps;
  }));

  try {
    renderPage(exp, bpMap);
  } catch (err) {
    console.error('[detail] Erro ao renderizar experiência:', err);
    showNotFound();
  }
})();

/* ── Main render ─────────────────────────────────────────── */
function renderPage(/** @type {import('./data.js').EXPERIENCES[0]} */ exp, bpMap = {}) {
  const BASE_URL = 'https://www.anaua.com.br';

  // ── <title> & description
  document.title = `${exp.title} — Anauá Ecoturismo`;
  const descMeta = document.getElementById('page-desc-meta');
  if (descMeta) descMeta.setAttribute('content', exp.subtitle);

  // ── Open Graph (IDs injected in experiencia.html)
  const setMeta = (id, value) => { const el = document.getElementById(id); if (el && value) el.setAttribute('content', value); };
const expSlug = exp.slug ?? exp.id;
  const pageUrl = `${BASE_URL}/experiencia.html?id=${encodeURIComponent(expSlug)}`;
  setMeta('og-title', `${exp.title} — Anauá Ecoturismo`);
  setMeta('og-desc',  exp.subtitle);
  setMeta('og-url',   pageUrl);
  setMeta('og-image', exp.coverImage?.startsWith('http') ? exp.coverImage : `${BASE_URL}/${exp.coverImage}`);
  setMeta('tw-title', `${exp.title} — Anauá Ecoturismo`);
  setMeta('tw-image', exp.coverImage?.startsWith('http') ? exp.coverImage : `${BASE_URL}/${exp.coverImage}`);

  // ── Canonical
  const canonical = document.getElementById('canonical');
  if (canonical) canonical.setAttribute('href', pageUrl);

  // ── Structured data (TouristAttraction)
  const sd = document.createElement('script');
  sd.type = 'application/ld+json';
  sd.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'TouristAttraction',
    name: exp.title,
    description: exp.subtitle,
    url: pageUrl,
    image: exp.coverImage,
    touristType: exp.category,
    geo: { '@type': 'GeoCoordinates' },
    offers: {
      '@type': 'Offer',
      price: exp.pricePerPerson,
      priceCurrency: 'BRL',
      availability: exp.status === 'active' ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut',
      url: `${BASE_URL}/reserva.html?id=${encodeURIComponent(expSlug)}`,
    },
  });
  document.head.appendChild(sd);

  // Breadcrumb
  const bc = document.getElementById('breadcrumb-container');
  if (bc) bc.innerHTML = renderBreadcrumb([
    { label: 'Início', href: 'index.html' },
    { label: 'Experiências', href: 'experiencias.html' },
    { label: exp.title },
  ]);

  // Hero
  renderHero(exp);

  // Content
  renderContent(exp, bpMap);

  // Booking sidebar + sticky CTA
  const isSoldOut = renderBookingBox(exp, bpMap);
  const stickyPrice = document.getElementById('sticky-price');
  if (stickyPrice) stickyPrice.textContent = formatBRL(exp.pricePerPerson);
  initStickyCTA(exp, isSoldOut);

  // Related
  renderRelated(exp);

  observeAnimations();
}

/* ── Hero ────────────────────────────────────────────────── */
function renderHero(exp) {
  const hero = document.getElementById('detail-hero');
  if (!hero) return;

  // Usa URL segura — nunca renderiza src com caminho local quebrado
  const imgUrl = (exp.coverImage && !exp.coverImage.startsWith('assets/img/exp-'))
    ? exp.coverImage
    : null;

  hero.innerHTML = imgUrl
    ? `<img
        src="${imgUrl}"
        alt="${exp.title}"
        fetchpriority="high"
        onerror="this.style.display='none'"
        style="width:100%;height:100%;object-fit:cover"
      />
      <div class="detail-hero__overlay" aria-hidden="true"></div>`
    : `<div class="detail-hero__placeholder" aria-hidden="true" style="
        width:100%;height:100%;
        background:linear-gradient(135deg,var(--color-earth-dark,#2d4a2d) 0%,var(--color-earth,#4a7c4a) 60%,var(--color-leaf,#6aaa6a) 100%);
        display:flex;align-items:center;justify-content:center;
        color:rgba(255,255,255,.5);font-size:var(--text-sm);letter-spacing:.05em
      "><span>Imagem pendente</span></div>
      <div class="detail-hero__overlay" aria-hidden="true"></div>`;
}

/* ── Main content ────────────────────────────────────────── */
function renderContent(exp, bpMap = {}) {
  const el = document.getElementById('detail-content');
  if (!el) return;

  const catLabel = CATEGORIES.find(c => c.id === exp.category)?.label ?? exp.category ?? '';
  const hasFutureDep = (exp.departures ?? []).some(d => d.status === 'scheduled');
  const diffLabel = { iniciante: 'Iniciante', moderado: 'Moderado', aventura: 'Aventura' }[exp.difficulty] ?? exp.difficulty ?? '';

  el.innerHTML = `
    <!-- Header -->
    <div class="detail-header animate-fade-in-up">
      <div class="detail-header__badges">
        ${diffLabel ? `<span class="badge badge--level-${exp.difficulty}">${diffLabel}</span>` : ''}
        ${catLabel  ? `<span class="badge" style="background:var(--color-offwhite);color:var(--color-muted);border:1px solid var(--color-stone)">${catLabel}</span>` : ''}
        ${exp.isNew ? '<span class="badge badge--new">Novo</span>' : ''}
        ${exp.isFeatured ? '<span class="badge badge--featured">⭐ Destaque</span>' : ''}
        ${!hasFutureDep && exp.departures.length > 0 ? '<span class="badge badge--sold-out">Esgotado</span>' : ''}
      </div>
      <h1 class="detail-header__title">${exp.title}</h1>
      <p class="detail-header__subtitle">${exp.subtitle}</p>
      <div class="detail-header__meta">
        ${exp.durationLabel && exp.durationLabel !== '—' ? `<span class="detail-meta-item">${Icon.clock} <strong>${exp.durationLabel}</strong></span>` : ''}
        ${exp.location ? `<span class="detail-meta-item">${Icon.map} <strong>${exp.location}</strong></span>` : ''}
        ${exp.maxParticipants ? `<span class="detail-meta-item">${Icon.users} Máx. <strong>${exp.maxParticipants} pessoas</strong></span>` : ''}
        ${exp.distanceKm ? `<span class="detail-meta-item">${Icon.arrow} <strong>${exp.distanceKm} km</strong></span>` : ''}
        ${exp.minAge ? `<span class="detail-meta-item">👶 A partir de <strong>${exp.minAge} anos</strong></span>` : ''}
      </div>
    </div>

    <!-- Highlights -->
    ${(exp.highlights ?? []).length ? `
    <div class="detail-highlights" data-animate>
      ${exp.highlights.map(h => `<div class="detail-highlight">${h}</div>`).join('')}
    </div>` : ''}

    <!-- Description -->
    ${exp.description ? `
    <div class="detail-block">
      <h2 class="detail-block__title">Sobre a experiência</h2>
      <p class="detail-desc">${exp.description}</p>
    </div>` : ''}

    <!-- Gallery -->
    <div class="detail-block" data-animate>
      <h2 class="detail-block__title">Galeria</h2>
      ${renderGallery(exp.gallery, exp.title)}
    </div>

    <!-- Exits / Saídas -->
    <div class="detail-block" data-animate>
      <h2 class="detail-block__title">Saídas disponíveis</h2>
      <div class="exit-list" id="exit-list">
        ${(exp.departures ?? []).map(dep => renderExitItem(dep, bpMap)).join('')
          || '<p style="color:var(--color-muted);font-size:var(--text-sm)">Nenhuma saída programada no momento.</p>'}
      </div>
    </div>

    <!-- Meeting points -->
    <div class="detail-block" data-animate id="meeting-block" style="display:none">
      <h2 class="detail-block__title">Pontos de encontro</h2>
      <div id="meeting-points-list" style="display:flex;flex-direction:column;gap:var(--sp-4)"></div>
    </div>

    <!-- Inclusions -->
    ${(exp.includes?.length || exp.excludes?.length) ? `
    <div class="detail-block" data-animate>
      <h2 class="detail-block__title">O que está incluso</h2>
      <div class="detail-inclusions">
        ${exp.includes?.length ? `
        <div>
          <p class="detail-inclusions__subtitle">✅ Incluso</p>
          <ul class="inclusion-list">
            ${exp.includes.map(i => `
              <li class="inclusion-list__item">
                <span class="inclusion-list__icon inclusion-list__icon--yes">${Icon.check}</span>
                ${i}
              </li>
            `).join('')}
          </ul>
        </div>` : ''}
        ${exp.excludes?.length ? `
        <div>
          <p class="detail-inclusions__subtitle">❌ Não incluso</p>
          <ul class="inclusion-list">
            ${exp.excludes.map(e => `
              <li class="inclusion-list__item">
                <span class="inclusion-list__icon inclusion-list__icon--no">${Icon.x}</span>
                ${e}
              </li>
            `).join('')}
          </ul>
        </div>` : ''}
      </div>
    </div>` : ''}

    <!-- What to bring -->
    ${exp.whatToBring?.length ? `
    <div class="detail-block" data-animate>
      <h2 class="detail-block__title">O que levar</h2>
      <ul class="bring-list">
        ${exp.whatToBring.map(i => `<li class="bring-item">${i}</li>`).join('')}
      </ul>
    </div>` : ''}

    <!-- Cancellation -->
    ${exp.cancellationPolicy ? `
    <div class="detail-block" data-animate>
      <h2 class="detail-block__title">Política de cancelamento</h2>
      <div class="cancellation-box">${exp.cancellationPolicy}</div>
    </div>` : ''}
  `;

  // Wire exit selection
  initExitSelection(exp);
}

/* ── Gallery ─────────────────────────────────────────────── */
function renderGallery(images, alt) {
  // Filtra caminhos locais quebrados (assets/img/exp-*) que não existem no servidor
  const validImages = (images ?? []).filter(src =>
    src && typeof src === 'string' && (
      src.startsWith('http') || src.startsWith('https')
    )
  );

  if (!validImages.length) return '<p style="color:var(--color-muted);font-size:var(--text-sm)">Imagens em breve.</p>';

  const visible   = validImages.slice(0, 5);
  const remaining = validImages.length - 5;

  const items = visible.map((src, i) => `
    <div class="gallery__item ${i === 4 && remaining > 0 ? 'gallery__more' : ''}"
         ${i === 4 && remaining > 0 ? `data-remaining="+${remaining}"` : ''}
         data-index="${i}"
         role="button"
         tabindex="0"
         aria-label="Ver foto ${i + 1}">
      <img src="${src}" alt="${alt} — foto ${i + 1}" loading="lazy" onerror="this.src='assets/img/placeholder.svg'" />
    </div>
  `).join('');

  setTimeout(() => {
    document.querySelectorAll('.gallery__item').forEach(item => {
      item.addEventListener('click', () => openGalleryModal(images, Number(item.getAttribute('data-index') ?? 0), alt));
      item.addEventListener('keydown', e => { if (e.key === 'Enter') item.click(); });
    });
  }, 0);

  return `<div class="gallery">${items}</div>`;
}

/* ── Gallery modal ───────────────────────────────────────── */
function openGalleryModal(images, startIndex, alt) {
  let current = startIndex;

  const getSlide = () => `
    <div style="text-align:center">
      <img
        src="${images[current]}"
        alt="${alt} — foto ${current + 1}"
        style="max-height:70vh;max-width:100%;border-radius:var(--radius-lg);margin:auto;display:block"
        onerror="this.src='assets/img/placeholder.svg'"
      />
      <p style="margin-top:var(--sp-3);color:var(--color-muted);font-size:var(--text-sm)">${current + 1} / ${images.length}</p>
    </div>
  `;

  const modal = openModal({
    title: alt,
    body: getSlide(),
    footer: images.length > 1 ? `
      <button class="btn btn--secondary" id="modal-prev">← Anterior</button>
      <button class="btn btn--primary" id="modal-next">Próxima →</button>
    ` : '',
  });

  const update = () => {
    const body = document.querySelector('.modal__body');
    if (body) body.innerHTML = getSlide();
  };

  document.getElementById('modal-prev')?.addEventListener('click', () => {
    current = (current - 1 + images.length) % images.length;
    update();
  });

  document.getElementById('modal-next')?.addEventListener('click', () => {
    current = (current + 1) % images.length;
    update();
  });
}

/* ── Boarding point selection state (depId → bpId) ─────── */
const _selectedBp = {};

/* ── Exit item ───────────────────────────────────────────── */
function renderExitItem(dep, bpMap = {}) {
  const isSoldOut = dep.status !== 'scheduled';
  const spots = Number(dep.capacity ?? 0);
  const isLowSpots = !isSoldOut && Number.isFinite(spots) && spots > 0 && spots <= 5;
  const depDate = dep.start_at ? new Date(`${dep.start_at.split('T')[0]}T00:00:00`) : null;
  const dateLabel = depDate
    ? new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' }).format(depDate)
    : '—';
  const bps = bpMap[dep.id] ?? [];

  // Pre-select single boarding point automatically
  if (bps.length === 1 && !_selectedBp[dep.id]) _selectedBp[dep.id] = bps[0].id;

  const chips = bps.map(bp => {
    const time = bp.pickupAt
      ? new Date(bp.pickupAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : null;
    const isSel = _selectedBp[dep.id] === bp.id;
    return `<button class="bp-chip${isSel ? ' is-selected' : ''}" data-bp-id="${bp.id}" data-dep-id="${dep.id}" type="button" aria-pressed="${isSel}"${isSoldOut ? ' disabled' : ''}>${bp.displayName}${time ? ' · ' + time : ''}</button>`;
  }).join('');

  const bpSelector = bps.length > 0
    ? `<div class="bp-selector"><p class="bp-selector__label">${Icon.map} Pontos de embarque</p><div class="bp-selector__chips">${chips}</div></div>`
    : `<div class="bp-selector"><p class="bp-selector__label">${Icon.map} Pontos de embarque</p><p class="bp-selector__empty">Pontos de embarque em definição.</p></div>`;

  const priceLabel = dep.price ? `<p class="exit-item__price-subtle">${formatBRL(dep.price)}</p>` : '';

  return `
    <div
      class="exit-item ${isSoldOut ? 'exit-item--sold-out' : ''}"
      data-exit-id="${dep.id}"
      data-price="${dep.price ?? ''}"
      role="radio"
      aria-checked="false"
      tabindex="${isSoldOut ? -1 : 0}"
    >
      <div class="exit-item__info">
        <div class="exit-item__header">
          <div class="exit-item__header-main">
            <p class="exit-item__date">${Icon.calendar} ${dateLabel}</p>
            <div class="exit-item__availability">
              ${isSoldOut
                ? '<span class="badge badge--sold-out">Esgotado</span>'
                : `<span class="exit-item__spots${isLowSpots ? ' is-low' : ''}">${dep.capacity ?? '?'} vaga${dep.capacity !== 1 ? 's' : ''}</span>`
              }
            </div>
          </div>
          ${!isSoldOut ? priceLabel : ''}
        </div>
        ${bpSelector}
      </div>
    </div>
  `;
}

/* ── Exit selection interaction ──────────────────────────── */
function initExitSelection(exp) {
  const exitList = document.getElementById('exit-list');
  if (!exitList) return;

  function selectExit(exitId) {
    const dep = (exp.departures ?? []).find(d => d.id === exitId);
    if (!dep || dep.status !== 'scheduled') return;

    exitList.querySelectorAll('.exit-item').forEach(el => {
      const isThis = el.getAttribute('data-exit-id') === exitId;
      el.classList.toggle('is-selected', isThis);
      el.setAttribute('aria-checked', String(isThis));
    });

    // Update booking box select
    const bookingSelect = document.getElementById('exit-select');
    if (bookingSelect instanceof HTMLSelectElement) {
      bookingSelect.value = exitId;
      bookingSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  // Boarding point chip selection
  exitList.addEventListener('click', e => {
    const chip = e.target.closest('.bp-chip');
    if (!chip || chip.disabled) return;
    e.stopPropagation(); // don't bubble to exit-item click
    const depId = chip.dataset.depId;
    const bpId  = chip.dataset.bpId;
    _selectedBp[depId] = bpId;
    exitList.querySelectorAll(`.bp-chip[data-dep-id="${depId}"]`).forEach(c => {
      const active = c.dataset.bpId === bpId;
      c.classList.toggle('is-selected', active);
      c.setAttribute('aria-pressed', String(active));
    });
    selectExit(depId);
  });

  exitList.querySelectorAll('.exit-item:not(.exit-item--sold-out)').forEach(item => {
    item.addEventListener('click', () => selectExit(item.getAttribute('data-exit-id') ?? ''));
    item.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') item.click(); });
  });

  // Auto-select first available
  const firstAvailable = (exp.departures ?? []).find(d => d.status === 'scheduled' && (d.capacity ?? 1) > 0);
  if (firstAvailable) selectExit(firstAvailable.id);
}

/* ── Meeting points ──────────────────────────────────────── */
function showMeetingPoints(exit) {
  const block = document.getElementById('meeting-block');
  const list  = document.getElementById('meeting-points-list');
  if (!block || !list) return;

  block.style.display = 'block';
  list.innerHTML = exit.meetingPoints.map(mp => `
    <div class="meeting-card">
      <div class="meeting-card__header">
        <p class="meeting-card__name">${mp.name}</p>
        <div class="meeting-card__time">
          ${Icon.clock} ${mp.time}
          <span class="meeting-card__tolerance">(tol. ${mp.toleranceMinutes}min)</span>
        </div>
      </div>
      <p class="meeting-card__address">${Icon.map} ${mp.address}</p>
    </div>
  `).join('');
}

/* ── Booking Box (sidebar) ───────────────────────────────── */
function renderBookingBox(exp, bpMap = {}) {
  const box = document.getElementById('booking-box');
  if (!box) return;

  const activeDeps = (exp.departures ?? []).filter(d => d.status === 'scheduled' && (d.capacity ?? 1) > 0);
  const hasAnyDeparture = (exp.departures ?? []).length > 0;
  const isSoldOut  = activeDeps.length === 0;

  const formatDepartureDateOnly = (startAt) => {
    if (!startAt) return '—';
    const dateOnly = startAt.split('T')[0];
    return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })
      .format(new Date(`${dateOnly}T00:00:00`));
  };

  const getStatusLabel = (dep) => {
    if (!dep) return '';
    if (dep.status === 'sold_out') return 'esgotada';
    if (dep.status === 'scheduled') return 'saída aberta';
    return 'lista de espera';
  };

  // Ocultar/mostrar sticky CTA conforme disponibilidade
  box.innerHTML = `
    <div class="booking-box__price">
      <p class="booking-box__from">Preço por pessoa</p>
      <p class="booking-box__value">${formatBRL(exp.pricePerPerson)}</p>
    </div>

    ${!isSoldOut ? `
      <div class="booking-box__row">
        <p class="booking-box__label">Saída selecionada</p>

        <div class="booking-departure" id="booking-departure-summary" aria-live="polite">
          <p class="booking-departure__date" id="booking-departure-date">—</p>
          <div class="booking-departure__chips">
            <span class="booking-departure__chip" id="booking-departure-spots">—</span>
            <span class="booking-departure__chip" id="booking-departure-price">—</span>
            <span class="booking-departure__chip booking-departure__chip--status" id="booking-departure-status">—</span>
          </div>
        </div>

        ${activeDeps.length > 1 ? `
          <button class="booking-dep-toggle" id="booking-switch-btn" type="button" aria-expanded="false" aria-controls="booking-switch-list">
            Alterar saída
          </button>
          <div class="booking-dep-panel" id="booking-switch-list" hidden role="listbox" aria-label="Escolha uma saída">
            ${activeDeps.map(d => {
              const depDate = formatDepartureDateOnly(d.start_at);
              const depSpots = `${d.capacity ?? '?'} vaga${d.capacity !== 1 ? 's' : ''}`;
              const depPrice = d.price ? formatBRL(d.price) : '';
              const depStatus = getStatusLabel(d);
              return `
                <div class="booking-dep-option" role="option" tabindex="0" data-dep-id="${d.id}" aria-checked="false">
                  <div class="booking-dep-option__main">
                    <span class="booking-dep-option__date">${depDate}</span>
                    <span class="booking-dep-option__check" aria-hidden="true"></span>
                  </div>
                  <div class="booking-dep-option__meta">
                    <span>${depSpots}</span>
                    ${depPrice ? `<span>${depPrice}</span>` : ''}
                    <span class="booking-dep-option__status">${depStatus}</span>
                  </div>
                </div>`;
            }).join('')}
          </div>
        ` : ''}

        <select id="exit-select" class="booking-box__select booking-box__select--hidden" aria-label="Selecionar data da saída">
          ${activeDeps.map(d => { const label = formatDepartureDateOnly(d.start_at); return `<option value="${d.id}">${label}</option>`; }).join('')}
        </select>
      </div>

      <div class="booking-box__row">
        <label class="booking-box__label" for="pax-select">Participantes</label>
        <select id="pax-select" class="booking-box__select" aria-label="Número de participantes">
          ${Array.from({ length: Math.min(exp.maxParticipants, 10) }, (_, i) => i + 1).map(n =>
            `<option value="${n}">${n} pessoa${n !== 1 ? 's' : ''}</option>`
          ).join('')}
        </select>
      </div>

      <div class="booking-box__total">
        <span>Total estimado</span>
        <span class="booking-box__total-value" id="booking-total">${formatBRL((activeDeps[0]?.price ?? exp.pricePerPerson))}</span>
      </div>

      <button class="btn btn--primary btn--full btn--lg" id="reserve-btn">
        Reservar vaga ${Icon.arrow}
      </button>

      <p class="booking-box__footnote">
        Sem cobrança agora. Você confirma os dados antes do pagamento.
      </p>
    ` : `
      <div style="text-align:center;padding:var(--sp-6) 0">
        <p style="font-family:var(--font-serif);font-size:var(--text-lg);color:var(--color-deep);margin-bottom:var(--sp-3)">${hasAnyDeparture ? 'Esgotado' : 'Nenhuma saída disponível no momento.'}</p>

        <p style="font-size:var(--text-sm);color:var(--color-muted);margin-bottom:var(--sp-5)">${hasAnyDeparture ? 'Todas as vagas foram preenchidas. Entre na lista de espera — avisamos se abrirem novas vagas.' : 'No momento não há saídas publicadas para esta experiência.'}</p>
        <button class="btn btn--secondary btn--full" id="waitlist-btn">Entrar na lista de espera</button>
      </div>
    `}
  `;

  // Wire total calc
  const exitSelect = document.getElementById('exit-select');
  const paxSelect  = document.getElementById('pax-select');
  const totalEl    = document.getElementById('booking-total');
  const departureDateEl = document.getElementById('booking-departure-date');
  const departureSpotsEl = document.getElementById('booking-departure-spots');
  const departurePriceEl = document.getElementById('booking-departure-price');
  const departureStatusEl = document.getElementById('booking-departure-status');

  function renderSelectedDeparture(depId) {
    const selectedDep = depId ? activeDeps.find(d => d.id === depId) : activeDeps[0];
    if (!selectedDep) return;
    if (departureDateEl) departureDateEl.textContent = formatDepartureDateOnly(selectedDep.start_at);
    if (departureSpotsEl) departureSpotsEl.textContent = `${selectedDep.capacity ?? '?'} vaga${selectedDep.capacity !== 1 ? 's' : ''}`;
    if (departurePriceEl) departurePriceEl.textContent = formatBRL(selectedDep.price ?? exp.pricePerPerson);
    if (departureStatusEl) departureStatusEl.textContent = getStatusLabel(selectedDep);

    document.querySelectorAll('.booking-dep-option').forEach(opt => {
      const active = opt.getAttribute('data-dep-id') === selectedDep.id;
      opt.classList.toggle('is-selected', active);
      opt.setAttribute('aria-checked', String(active));
    });
  }

  function updateTotal() {
    if (!paxSelect || !totalEl) return;
    const pax = Number((paxSelect instanceof HTMLSelectElement ? paxSelect.value : '1'));
    const depId = exitSelect instanceof HTMLSelectElement ? exitSelect.value : null;
    const selectedDep = depId ? activeDeps.find(d => d.id === depId) : null;
    const unitPrice = selectedDep?.price ?? exp.pricePerPerson;
    totalEl.textContent = formatBRL(unitPrice * pax);
    renderSelectedDeparture(depId);
  }

  if (exitSelect instanceof HTMLSelectElement && activeDeps[0]) {
    if (!exitSelect.value) exitSelect.value = activeDeps[0].id;
    renderSelectedDeparture(exitSelect.value);
  }

  const switchBtn = document.getElementById('booking-switch-btn');
  const switchList = document.getElementById('booking-switch-list');

  switchBtn?.addEventListener('click', () => {
    if (!switchList) return;
    const expanded = switchBtn.getAttribute('aria-expanded') === 'true';
    switchBtn.setAttribute('aria-expanded', String(!expanded));
    switchList.hidden = expanded;
  });

  const closePanel = () => {
    if (!switchBtn || !switchList) return;
    switchBtn.setAttribute('aria-expanded', 'false');
    switchList.hidden = true;
  };

  switchList?.addEventListener('click', e => {
    const opt = e.target.closest('.booking-dep-option');
    if (!opt || !(exitSelect instanceof HTMLSelectElement)) return;
    const depId = opt.getAttribute('data-dep-id');
    if (!depId) return;
    exitSelect.value = depId;
    exitSelect.dispatchEvent(new Event('change', { bubbles: true }));
    const relatedCard = document.querySelector(`.exit-item[data-exit-id="${depId}"]`);
    if (relatedCard instanceof HTMLElement) relatedCard.click();
    closePanel();
  });

  switchList?.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const opt = e.target.closest('.booking-dep-option');
    if (opt) { e.preventDefault(); opt.click(); }
  });

  exitSelect?.addEventListener('change', updateTotal);
  paxSelect?.addEventListener('change', updateTotal);

  // Reserve button
  const reserveBtn = document.getElementById('reserve-btn');
  reserveBtn?.addEventListener('click', () => {
    if (!(exitSelect instanceof HTMLSelectElement) || !(paxSelect instanceof HTMLSelectElement)) return;
    const exitId    = exitSelect.value;
    const paxCount  = Number(paxSelect.value) || 1;
    const dep       = (exp.departures ?? []).find(d => d.id === exitId);

    if (!dep) {
      showToast('Selecione uma saída antes de continuar.', 'warning');
      return;
    }

    // Look up selected boarding point from live bpMap (optional on this page)
    const bps          = bpMap[exitId] ?? [];
    const selectedBpId = _selectedBp[exitId];
    const bp           = bps.find(b => b.id === selectedBpId) ?? null;

    // ── Build display values from live state only ──────────────────────────
    const depDateStr  = dep.start_at ? dep.start_at.split('T')[0] : null;
    const depLabel    = depDateStr ? formatDate(depDateStr) : '—';
    const unitPrice   = dep.price ?? exp.pricePerPerson ?? 0;
    const total       = formatBRL(unitPrice * paxCount);
    const paxLabel    = `${paxCount} pessoa${paxCount !== 1 ? 's' : ''}`;

    const bpTime = bp?.pickupAt
      ? new Date(bp.pickupAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : null;
    const bpLabel = bp
      ? `${bp.displayName}${bpTime ? ' · ' + bpTime : ''}`
      : (bps.length > 0 ? 'A confirmar no checkout' : '—');

    console.log('[reservation-modal] opening with state:', { exitId, depLabel, bp: bp?.displayName ?? null, pax: paxCount, total });

    const { close } = openModal({
      title:     'Confirmar reserva',
      titleId:   'rsvp-modal-title',
      descId:    'rsvp-modal-desc',
      triggerEl: reserveBtn,
      body: `
        <p class="rsvp-modal__subtitle" id="rsvp-modal-desc">Revise os detalhes antes de continuar.</p>
        <div class="rsvp-summary" role="list">
          <div class="rsvp-row" role="listitem">
            <span class="rsvp-row__label">Experiência</span>
            <span class="rsvp-row__value">${exp.title}</span>
          </div>
          <div class="rsvp-row" role="listitem">
            <span class="rsvp-row__label">Saída</span>
            <span class="rsvp-row__value">${depLabel}</span>
          </div>
          <div class="rsvp-row" role="listitem">
            <span class="rsvp-row__label">Embarque</span>
            <span class="rsvp-row__value">${bpLabel}</span>
          </div>
          <div class="rsvp-row" role="listitem">
            <span class="rsvp-row__label">Participantes</span>
            <span class="rsvp-row__value">${paxLabel}</span>
          </div>
          <div class="rsvp-row rsvp-row--total" role="listitem">
            <span class="rsvp-row__label">Total</span>
            <span class="rsvp-row__value">${total}</span>
          </div>
        </div>
        <p class="rsvp-modal__terms">
          Ao continuar, você concorda com os
          <a href="termos.html">Termos de Uso</a> e a
          <a href="privacidade.html">Política de Privacidade</a> da Anauá.
        </p>
      `,
      footer: `
        <button class="btn btn--secondary" id="modal-cancel-btn">Cancelar</button>
        <button class="btn btn--primary" id="modal-confirm-btn">Confirmar e ir para o checkout</button>
      `,
    });

    document.getElementById('modal-cancel-btn')?.addEventListener('click', close);
    document.getElementById('modal-confirm-btn')?.addEventListener('click', () => {
      close();
      const bpId = _selectedBp[exitId];
      const pickupParam = bpId ? `&pickup=${bpId}` : '';
      console.log('[reservation-state] navegando para checkout — dep:', exitId, 'pickup:', bpId ?? 'nenhum');
      location.href = `reserva.html?id=${exp.slug ?? exp.id}&dep=${exitId}${pickupParam}`;
    });
  });

  // Waitlist button (inside booking-box, visible on desktop)
  document.getElementById('waitlist-btn')?.addEventListener('click', () => openWaitlistModal(exp));

  return isSoldOut;
}

/* ── Waitlist modal ──────────────────────────────────────── */
function openWaitlistModal(exp) {
  const { close } = openModal({
    title: 'Entrar na lista de espera',
    body: `
      <p style="font-size:var(--text-sm);color:var(--color-muted);margin-bottom:var(--sp-5)">
        Preencha seus dados e avisaremos quando houver disponibilidade para
        <strong>${exp.title}</strong>.
      </p>
      <form id="waitlist-form" style="display:flex;flex-direction:column;gap:var(--sp-4)">
        <div>
          <label style="display:block;font-size:var(--text-sm);font-weight:600;margin-bottom:4px">Nome *</label>
          <input id="wl-name" type="text" required placeholder="Seu nome completo"
            style="width:100%;padding:10px 12px;border:1px solid var(--color-stone);border-radius:var(--radius-md);font-size:var(--text-sm);box-sizing:border-box" />
        </div>
        <div>
          <label style="display:block;font-size:var(--text-sm);font-weight:600;margin-bottom:4px">E-mail *</label>
          <input id="wl-email" type="email" required placeholder="seu@email.com"
            style="width:100%;padding:10px 12px;border:1px solid var(--color-stone);border-radius:var(--radius-md);font-size:var(--text-sm);box-sizing:border-box" />
        </div>
        <div>
          <label style="display:block;font-size:var(--text-sm);font-weight:600;margin-bottom:4px">WhatsApp</label>
          <input id="wl-phone" type="tel" placeholder="(99) 99999-9999"
            style="width:100%;padding:10px 12px;border:1px solid var(--color-stone);border-radius:var(--radius-md);font-size:var(--text-sm);box-sizing:border-box" />
        </div>
        <div>
          <label style="display:block;font-size:var(--text-sm);font-weight:600;margin-bottom:4px">Quantidade de participantes</label>
          <select id="wl-participants"
            style="width:100%;padding:10px 12px;border:1px solid var(--color-stone);border-radius:var(--radius-md);font-size:var(--text-sm);box-sizing:border-box">
            <option value="1">1 pessoa</option>
            <option value="2">2 pessoas</option>
            <option value="3">3 pessoas</option>
            <option value="4">4 pessoas</option>
            <option value="5+">5 ou mais</option>
          </select>
        </div>
        <div>
          <label style="display:block;font-size:var(--text-sm);font-weight:600;margin-bottom:4px">Mensagem (opcional)</label>
          <textarea id="wl-message" rows="3" placeholder="Alguma preferência de data ou informação adicional?"
            style="width:100%;padding:10px 12px;border:1px solid var(--color-stone);border-radius:var(--radius-md);font-size:var(--text-sm);resize:vertical;box-sizing:border-box"></textarea>
        </div>
        <p id="wl-error" style="color:var(--color-danger,#c0392b);font-size:var(--text-sm);display:none"></p>
      </form>
    `,
    footer: `
      <button class="btn btn--secondary" id="wl-cancel-btn">Cancelar</button>
      <button class="btn btn--primary" id="wl-submit-btn">Entrar na lista</button>
    `,
  });

  document.getElementById('wl-cancel-btn')?.addEventListener('click', close);

  document.getElementById('wl-submit-btn')?.addEventListener('click', async () => {
    const name         = document.getElementById('wl-name')?.value.trim();
    const email        = document.getElementById('wl-email')?.value.trim();
    const phone        = document.getElementById('wl-phone')?.value.trim() || null;
    const participants = document.getElementById('wl-participants')?.value ?? '1';
    const message      = document.getElementById('wl-message')?.value.trim() || null;
    const errEl        = document.getElementById('wl-error');

    if (!name || !email) {
      if (errEl) { errEl.textContent = 'Por favor, preencha nome e e-mail.'; errEl.style.display = 'block'; }
      return;
    }
    if (errEl) errEl.style.display = 'none';

    const submitBtn = document.getElementById('wl-submit-btn');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Enviando…'; }

    const db = window.anauaDb;
    if (!db) {
      if (errEl) { errEl.textContent = 'Serviço indisponível. Tente novamente.'; errEl.style.display = 'block'; }
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Entrar na lista'; }
      return;
    }

    const { error: insertError } = await db.from('waitlist_entries').insert({
      experience_id:      exp.id,
      departure_id:       null,
      name,
      email,
      phone,
      participants_count: parseInt(participants, 10) || 1,
      message,
      status:             'pending',
      source:             'site',
    });

    if (insertError) {
      console.error('[waitlist] Erro ao inserir lista de espera:', insertError.message);
      if (errEl) { errEl.textContent = 'Não foi possível enviar. Tente novamente em breve.'; errEl.style.display = 'block'; }
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Entrar na lista'; }
      return;
    }

    close();
    showToast('Recebemos seu interesse. Entraremos em contato quando houver disponibilidade!', 'success');
  });
}

/* ── Related ─────────────────────────────────────────────── */
function renderRelated(_exp) {
  // Seção de relacionados requer query Supabase separada (implementação futura)
  document.getElementById('related-section')?.remove();
}

/* ── Sticky CTA ──────────────────────────────────────────── */
function initStickyCTA(exp, isSoldOut) {
  const cta = document.getElementById('sticky-cta');
  if (!cta) return;

  // On desktop the sidebar is visible — observe the booking-box to auto-hide the CTA.
  // On mobile the sidebar is hidden, so the CTA should stay visible.
  const bookBox = document.getElementById('booking-box');
  if (bookBox && window.matchMedia('(min-width: 1024px)').matches) {
    const obs = new IntersectionObserver(([entry]) => {
      cta.classList.toggle('is-hidden', entry.isIntersecting);
    }, { threshold: 0.5 });
    obs.observe(bookBox);
  }

  const btn = document.getElementById('sticky-reserve-btn');
  if (!btn) return;

  if (isSoldOut) {
    btn.textContent = 'Lista de espera';
    btn.addEventListener('click', e => { e.preventDefault(); openWaitlistModal(exp); });
  } else {
    btn.addEventListener('click', e => {
      e.preventDefault();
      // On mobile go straight to checkout; on desktop scroll to booking box
      if (window.matchMedia('(max-width: 1023px)').matches) {
        location.href = `reserva.html?id=${exp.slug ?? exp.id}`;
      } else if (bookBox) {
        bookBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }
}
